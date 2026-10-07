<?php
/**
 * GET api/ia/anexo.php?id=123  -> devolve o arquivo anexado
 *
 * Só o dono da conversa (sessão) consegue baixar. Anexo inexistente, de
 * outro usuário ou de conversa excluída responde 404.
 * PDF e imagens abrem no navegador; texto é baixado.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_anexos.php';

$usuarioId = ia_iniciar(['GET']);

$id = (int)($_GET['id'] ?? 0);
if ($id <= 0) {
    ia_erro(422, 'Anexo inválido.');
}

try {
    $pdo = ia_pdo();
    $stmt = $pdo->prepare(
        'SELECT a.nome_original, a.mime, a.arquivo
         FROM tb_ia_anexos a
         JOIN tb_ia_mensagens m ON m.id = a.mensagem_id
         JOIN tb_ia_conversas c ON c.id = m.conversa_id
         WHERE a.id = :id AND c.usuario_id = :usuario_id AND c.excluida_em IS NULL
         LIMIT 1'
    );
    $stmt->execute(['id' => $id, 'usuario_id' => $usuarioId]);
    $a = $stmt->fetch();
} catch (PDOException $e) {
    error_log('[ia/anexo] ' . $e->getMessage());
    ia_erro(500, 'Erro ao consultar o banco de dados.');
}

if (!$a) {
    ia_erro(404, 'Anexo não encontrado.');
}

// O nome no disco é gerado pelo servidor (hex + extensão); ainda assim,
// garante que não há separadores de pasta.
$arquivo = basename((string)$a['arquivo']);
$caminho = ia_dir_anexos() . '/' . $arquivo;
if (!is_file($caminho)) {
    ia_erro(404, 'O arquivo não está mais disponível no servidor.');
}

$mime    = (string)$a['mime'];
$inline  = in_array($mime, ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], true);
$nomeUrl = rawurlencode((string)$a['nome_original']);

header('Content-Type: ' . ($mime === 'text/plain' ? 'text/plain; charset=utf-8' : $mime));
header('Content-Length: ' . (string)filesize($caminho));
header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . "; filename*=UTF-8''" . $nomeUrl);
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=600');

readfile($caminho);
exit;
