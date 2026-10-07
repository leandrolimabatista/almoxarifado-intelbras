<?php
/**
 * GET api/documentos/arquivo.php?id=123[&modo=ver]
 *
 * Devolve o arquivo do documento. Exige login (sessão); os arquivos ficam fora
 * do htdocs e nunca são acessíveis por URL direta.
 *
 *   sem "modo"   -> baixa o arquivo (Content-Disposition: attachment)
 *   modo=ver     -> abre no navegador, só para PDF, imagens e texto;
 *                   os demais formatos (Word, Excel, PowerPoint) sempre baixam.
 *
 * O nome do download é o título do documento + a extensão (reflete renomeações).
 * Documento inexistente ou na lixeira responde 404.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

doc_iniciar(['GET']);

$id = (int)($_GET['id'] ?? 0);
if ($id <= 0) {
    doc_erro(422, 'Documento inválido.');
}

try {
    $pdo = doc_pdo();
    $stmt = $pdo->prepare(
        'SELECT nome, extensao, mime, arquivo
         FROM tb_documentos
         WHERE id = :id AND excluido_em IS NULL
         LIMIT 1'
    );
    $stmt->execute(['id' => $id]);
    $d = $stmt->fetch();
} catch (PDOException $e) {
    doc_erro_banco($e, 'arquivo');
}

if (!$d) {
    doc_erro(404, 'Documento não encontrado.');
}

// O nome no disco é gerado pelo servidor (hex + extensão); ainda assim,
// garante que não há separadores de pasta.
$caminho = doc_dir_arquivos() . '/' . basename((string)$d['arquivo']);
if (!is_file($caminho)) {
    doc_erro(404, 'O arquivo não está mais disponível no servidor.');
}

$mime   = (string)$d['mime'];
$inline = (($_GET['modo'] ?? '') === 'ver')
    && in_array($mime, ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'], true);

// Nome do download: título sem caracteres proibidos em nomes de arquivo
$base = preg_replace('/[\\\\\/:*?"<>|\x00-\x1F\x7F]/u', '_', (string)$d['nome']) ?? 'documento';
$nomeDownload = trim($base) . '.' . (string)$d['extensao'];

header('Content-Type: ' . ($mime === 'text/plain' ? 'text/plain; charset=utf-8' : $mime));
header('Content-Length: ' . (string)filesize($caminho));
header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($nomeDownload));
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=300');

readfile($caminho);
exit;
