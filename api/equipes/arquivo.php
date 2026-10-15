<?php
/**
 * GET api/equipes/arquivo.php?id=123[&modo=ver]
 *
 * Devolve o arquivo de um anexo do chat de equipes. Exige login e que o
 * usuário seja membro da equipe da mensagem; os arquivos ficam fora do
 * htdocs e nunca são acessíveis por URL direta.
 *
 *   sem "modo" -> baixa o arquivo (Content-Disposition: attachment)
 *   modo=ver   -> abre no navegador (nova aba), só para PDF, imagens e texto.
 *
 * Se a cópia do chat não estiver no disco, usa a cópia do módulo Documentos
 * (tb_equipes_anexos.documento_id). Como o link abre em outra aba, erros
 * viram uma página amigável em vez de JSON cru.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = eq_iniciar(['GET']);

/** Erro de arquivo: página amigável quando o navegador abriu o link, JSON nos demais casos. */
function eq_arquivo_erro(int $codigo, string $mensagem): never
{
    if (stripos((string)($_SERVER['HTTP_ACCEPT'] ?? ''), 'text/html') === false) {
        eq_erro($codigo, $mensagem);
    }
    http_response_code($codigo);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    $m = htmlspecialchars($mensagem, ENT_QUOTES, 'UTF-8');
    echo '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>Arquivo indisponível — Intelbras</title>'
        . '<link rel="icon" href="../../assets/img/favicon/favicon-32.png">'
        . '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
        . 'font-family:"Segoe UI",Roboto,Arial,sans-serif;background:#F5F6F7;color:#1A1A1A}'
        . '.c{max-width:420px;margin:24px;padding:32px;background:#fff;border:1px solid #ECECEC;'
        . 'border-radius:14px;text-align:center}'
        . 'h1{margin:0 0 8px;font-size:18px}p{margin:0 0 20px;font-size:14px;color:#6B6B6B;line-height:1.5}'
        . 'a{display:inline-block;padding:9px 18px;border-radius:8px;background:#00A859;color:#fff;'
        . 'font-size:14px;font-weight:700;text-decoration:none}</style></head><body>'
        . '<div class="c"><h1>Não foi possível abrir o arquivo</h1><p>' . $m . '</p>'
        . '<a href="javascript:window.close()">Fechar aba</a></div></body></html>';
    exit;
}

$id = (int)($_GET['id'] ?? 0);
if ($id <= 0) {
    eq_arquivo_erro(422, 'Anexo inválido.');
}

try {
    $pdo = eq_pdo();
    $stmt = $pdo->prepare(
        'SELECT a.nome_original, a.extensao, a.mime, a.arquivo, a.documento_id, m.equipe_slug
         FROM tb_equipes_anexos a
         JOIN tb_equipes_mensagens m ON m.id = a.mensagem_id
         WHERE a.id = :id LIMIT 1'
    );
    $stmt->execute(['id' => $id]);
    $a = $stmt->fetch();
} catch (PDOException $e) {
    eq_erro_banco($e, 'arquivo');
}

if (!$a) {
    eq_arquivo_erro(404, 'Arquivo não encontrado.');
}
if (!eq_e_membro($pdo, $usuarioId, (string)$a['equipe_slug'])) {
    eq_arquivo_erro(403, 'Você não faz parte desta equipe.');
}

$caminho = eq_dir_arquivos() . '/' . basename((string)$a['arquivo']);

// Cópia do chat ausente: tenta a cópia que o módulo Documentos guarda do mesmo anexo.
if (!is_file($caminho) && $a['documento_id'] !== null) {
    try {
        $stmt = $pdo->prepare('SELECT arquivo FROM tb_documentos WHERE id = :id AND excluido_em IS NULL LIMIT 1');
        $stmt->execute(['id' => (int)$a['documento_id']]);
        $arquivoDoc = $stmt->fetchColumn();
        if ($arquivoDoc !== false) {
            $alt = doc_dir_arquivos() . '/' . basename((string)$arquivoDoc);
            if (is_file($alt)) {
                $caminho = $alt;
            }
        }
    } catch (PDOException $e) {
        // segue para a mensagem de arquivo indisponível
    }
}
if (!is_file($caminho)) {
    eq_arquivo_erro(404, 'O arquivo não está mais disponível no servidor.');
}

$mime   = (string)$a['mime'];
$inline = (($_GET['modo'] ?? '') === 'ver')
    && in_array($mime, ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'], true);

$base = preg_replace('/[\\\\\/:*?"<>|\x00-\x1F\x7F]/u', '_', (string)$a['nome_original']) ?? 'arquivo';

header('Content-Type: ' . ($mime === 'text/plain' ? 'text/plain; charset=utf-8' : $mime));
header('Content-Length: ' . (string)filesize($caminho));
header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($base));
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=300');

readfile($caminho);
exit;
