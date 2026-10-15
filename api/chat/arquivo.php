<?php
/**
 * GET api/chat/arquivo.php?id=123[&modo=ver]
 *
 * Devolve o anexo de uma mensagem do chat (id = tb_documentos.id). Diferente
 * de api/documentos/arquivo.php, aqui só os dois participantes da conversa
 * onde o anexo foi enviado podem baixar.
 *
 *   sem "modo"   -> baixa o arquivo (Content-Disposition: attachment)
 *   modo=ver     -> abre no navegador, só para PDF, imagens e texto.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$meuId = chat_iniciar(['GET']);

/** Erro de arquivo: página amigável quando o navegador abriu o link (nova aba), JSON nos demais casos. */
function chat_arquivo_erro(int $codigo, string $mensagem): never
{
    if (stripos((string)($_SERVER['HTTP_ACCEPT'] ?? ''), 'text/html') === false) {
        chat_erro($codigo, $mensagem);
    }
    http_response_code($codigo);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    $m = htmlspecialchars($mensagem, ENT_QUOTES, 'UTF-8');
    echo '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>Arquivo indisponível — Intelbras</title>'
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

$documentoId = (int)($_GET['id'] ?? 0);
if ($documentoId <= 0) {
    chat_arquivo_erro(422, 'Arquivo inválido.');
}

try {
    $pdo = chat_pdo();

    $stmt = $pdo->prepare(
        'SELECT d.nome, d.extensao, d.mime, d.arquivo, m.conversa_id
         FROM tb_documentos d
         JOIN tb_mensagens m ON m.documento_id = d.id
         WHERE d.id = :id AND d.excluido_em IS NULL AND m.excluida_em IS NULL -- anexo de mensagem apagada não abre
         LIMIT 1'
    );
    $stmt->execute(['id' => $documentoId]);
    $d = $stmt->fetch();

    if (!$d || !chat_eh_participante($pdo, (int)$d['conversa_id'], $meuId)) {
        chat_arquivo_erro(404, 'Arquivo não encontrado.');
    }
} catch (PDOException $e) {
    chat_erro_banco($e, 'arquivo');
}

$caminho = doc_dir_arquivos() . '/' . basename((string)$d['arquivo']);
if (!is_file($caminho)) {
    chat_arquivo_erro(404, 'O arquivo não está mais disponível no servidor.');
}

$mime   = (string)$d['mime'];
$inline = (($_GET['modo'] ?? '') === 'ver')
    && in_array($mime, ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'], true);

$base = preg_replace('/[\\\\\/:*?"<>|\x00-\x1F\x7F]/u', '_', (string)$d['nome']) ?? 'arquivo';
$nomeDownload = trim($base) . '.' . (string)$d['extensao'];

header('Content-Type: ' . ($mime === 'text/plain' ? 'text/plain; charset=utf-8' : $mime));
header('Content-Length: ' . (string)filesize($caminho));
header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($nomeDownload));
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=300');

readfile($caminho);
exit;
