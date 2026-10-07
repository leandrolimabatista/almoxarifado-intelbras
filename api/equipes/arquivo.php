<?php
/**
 * GET api/equipes/arquivo.php?id=123[&modo=ver]
 *
 * Devolve o arquivo de um anexo do chat de equipes. Exige login e que o
 * usuário seja membro da equipe da mensagem; os arquivos ficam fora do
 * htdocs e nunca são acessíveis por URL direta.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = eq_iniciar(['GET']);

$id = (int)($_GET['id'] ?? 0);
if ($id <= 0) {
    eq_erro(422, 'Anexo inválido.');
}

try {
    $pdo = eq_pdo();
    $stmt = $pdo->prepare(
        'SELECT a.nome_original, a.extensao, a.mime, a.arquivo, m.equipe_slug
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
    eq_erro(404, 'Arquivo não encontrado.');
}
if (!eq_e_membro($pdo, $usuarioId, (string)$a['equipe_slug'])) {
    eq_erro(403, 'Você não faz parte desta equipe.');
}

$caminho = eq_dir_arquivos() . '/' . basename((string)$a['arquivo']);
if (!is_file($caminho)) {
    eq_erro(404, 'O arquivo não está mais disponível no servidor.');
}

$mime   = (string)$a['mime'];
$inline = (($_GET['modo'] ?? '') === 'ver')
    && in_array($mime, ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'], true);

$base = preg_replace('/[\\\\\/:*?"<>|\x00-\x1F\x7F]/u', '_', (string)$a['nome_original']) ?? 'arquivo';

header('Content-Type: ' . $mime);
header('Content-Length: ' . (string)filesize($caminho));
header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($base));
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=300');

readfile($caminho);
exit;
