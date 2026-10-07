<?php
/**
 * GET  api/configuracoes/foto.php               → devolve a foto do próprio usuário (404 se não tem)
 * POST api/configuracoes/foto.php (multipart)   → campo "foto": JPG ou PNG, até 5 MB
 * POST api/configuracoes/foto.php {acao:'remover'} (JSON) → remove a foto
 *
 * As fotos ficam FORA do htdocs (padrão dos módulos IA e Documentos):
 * pasta "perfil_uploads" ao lado do htdocs, ou a definida na variável de
 * ambiente PERFIL_UPLOAD_DIR. Só saem por este endpoint, com login.
 */
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

const CFG_FOTO_MAX_BYTES = 5 * 1024 * 1024;

function cfg_dir_fotos(): string
{
    $env = getenv('PERFIL_UPLOAD_DIR');
    if ($env !== false && $env !== '') {
        return rtrim($env, '/\\');
    }
    $raiz = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/\\');
    $base = $raiz !== '' ? dirname($raiz) : dirname(__DIR__, 3);
    return $base . '/perfil_uploads';
}

$usuarioId = cfg_iniciar(['GET', 'POST'], false);
$metodo    = $_SERVER['REQUEST_METHOD'];

try {
    $pdo = conectar();

    // ---------------- GET: serve a imagem ----------------
    if ($metodo === 'GET') {
        $st = $pdo->prepare('SELECT foto_arquivo FROM tb_usuarios WHERE id = :id');
        $st->execute(['id' => $usuarioId]);
        $nomeArq = (string)($st->fetchColumn() ?: '');
        $caminho = cfg_dir_fotos() . '/' . basename($nomeArq);
        if ($nomeArq === '' || !is_file($caminho)) {
            http_response_code(404);
            exit;
        }
        $mime = str_ends_with($nomeArq, '.png') ? 'image/png' : 'image/jpeg';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . (string)filesize($caminho));
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, max-age=0, must-revalidate');
        readfile($caminho);
        exit;
    }

    // ---------------- POST ----------------
    header('Content-Type: application/json; charset=utf-8');

    $apagar = static function (PDO $pdo, int $id): void {
        $st = $pdo->prepare('SELECT foto_arquivo FROM tb_usuarios WHERE id = :id');
        $st->execute(['id' => $id]);
        $antigo = (string)($st->fetchColumn() ?: '');
        if ($antigo !== '') {
            @unlink(cfg_dir_fotos() . '/' . basename($antigo));
        }
    };

    if (str_contains((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
        $corpo = cfg_corpo();
        if (($corpo['acao'] ?? '') !== 'remover') {
            cfg_erro(422, 'Ação inválida.');
        }
        $apagar($pdo, $usuarioId);
        $pdo->prepare('UPDATE tb_usuarios SET foto_arquivo = NULL WHERE id = :id')->execute(['id' => $usuarioId]);
        cfg_resposta(200, ['sucesso' => true, 'tem_foto' => false]);
    }

    $arq = $_FILES['foto'] ?? null;
    if (!is_array($arq) || ($arq['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        cfg_erro(422, 'Selecione uma imagem.');
    }
    if (in_array($arq['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) || (int)$arq['size'] > CFG_FOTO_MAX_BYTES) {
        cfg_erro(422, 'A imagem deve ter no máximo 5MB.');
    }
    if ($arq['error'] !== UPLOAD_ERR_OK || !is_uploaded_file((string)$arq['tmp_name'])) {
        cfg_erro(422, 'Não foi possível receber o arquivo.');
    }

    // Confere o conteúdo real (não confia na extensão nem no MIME do navegador).
    $info = @getimagesize((string)$arq['tmp_name']);
    $tipo = $info[2] ?? 0;
    if ($tipo === IMAGETYPE_JPEG) {
        $ext = 'jpg';
    } elseif ($tipo === IMAGETYPE_PNG) {
        $ext = 'png';
    } else {
        cfg_erro(422, 'Formato inválido. Use JPG ou PNG.');
    }

    $dir = cfg_dir_fotos();
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
        error_log('[configuracoes/foto] não foi possível criar ' . $dir);
        cfg_erro(500, 'Não foi possível salvar a imagem no servidor.');
    }

    $novoNome = $usuarioId . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
    if (!move_uploaded_file((string)$arq['tmp_name'], $dir . '/' . $novoNome)) {
        cfg_erro(500, 'Não foi possível salvar a imagem no servidor.');
    }

    $apagar($pdo, $usuarioId);
    $pdo->prepare('UPDATE tb_usuarios SET foto_arquivo = :f WHERE id = :id')->execute(['f' => $novoNome, 'id' => $usuarioId]);

    cfg_resposta(200, ['sucesso' => true, 'tem_foto' => true]);
} catch (PDOException $e) {
    error_log('[configuracoes/foto] ' . $e->getMessage());
    cfg_erro(500, 'Erro ao salvar a foto.');
}
