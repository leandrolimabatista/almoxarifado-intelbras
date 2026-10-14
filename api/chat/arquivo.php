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

$documentoId = (int)($_GET['id'] ?? 0);
if ($documentoId <= 0) {
    chat_erro(422, 'Arquivo inválido.');
}

try {
    $pdo = chat_pdo();

    $stmt = $pdo->prepare(
        'SELECT d.nome, d.extensao, d.mime, d.arquivo, m.conversa_id
         FROM tb_documentos d
         JOIN tb_mensagens m ON m.documento_id = d.id
         WHERE d.id = :id AND d.excluido_em IS NULL
         LIMIT 1'
    );
    $stmt->execute(['id' => $documentoId]);
    $d = $stmt->fetch();

    if (!$d || !chat_eh_participante($pdo, (int)$d['conversa_id'], $meuId)) {
        chat_erro(404, 'Arquivo não encontrado.');
    }
} catch (PDOException $e) {
    chat_erro_banco($e, 'arquivo');
}

$caminho = doc_dir_arquivos() . '/' . basename((string)$d['arquivo']);
if (!is_file($caminho)) {
    chat_erro(404, 'O arquivo não está mais disponível no servidor.');
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
