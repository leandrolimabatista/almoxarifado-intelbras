<?php
/**
 * Funções compartilhadas dos anexos do módulo "Inteligência Artificial".
 * Não é um endpoint: use apenas com require_once, DEPOIS de _bootstrap.php.
 *
 * Formatos aceitos: PDF, imagens (PNG, JPG, WEBP) e texto (TXT, CSV, MD).
 * A validação NÃO confia no nome/tipo enviado pelo navegador: confere os
 * primeiros bytes do arquivo (assinatura) e o tamanho.
 *
 * Cada mensagem aceita até IA_ANEXO_MAX_ARQUIVOS arquivos (campo "arquivos[]").
 * O campo antigo "arquivo" (um só) continua sendo aceito.
 */

declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

const IA_ANEXO_MAX_BYTES = 10 * 1024 * 1024;   // 10 MB por arquivo
const IA_ANEXO_MAX_ARQUIVOS    = 5;                 // arquivos por mensagem
const IA_ANEXO_MAX_TOTAL_BYTES = 20 * 1024 * 1024;  // soma dos arquivos de UMA mensagem
const IA_ANEXO_TEXTO_MAX = 100000;             // caracteres lidos de arquivos de texto
const IA_ANEXO_EXTENSOES = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv', 'md'];

/**
 * Pasta onde os arquivos ficam. Fora do htdocs, para nunca serem acessados
 * por URL direta (só via api/ia/anexo.php, que confere o dono).
 * Padrão: pasta "ia_uploads" ao lado do htdocs (ex.: C:/xampp/ia_uploads).
 * Para mudar, defina a variável de ambiente IA_UPLOAD_DIR.
 */
function ia_dir_anexos(): string
{
    $env = getenv('IA_UPLOAD_DIR');
    if ($env !== false && $env !== '') {
        return rtrim($env, '/\\');
    }
    $raiz = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/\\');
    $base = $raiz !== '' ? dirname($raiz) : dirname(__DIR__, 3);
    return $base . '/ia_uploads';
}

/** Confere a assinatura do arquivo. Devolve o MIME real ou null se não bater. */
function ia_detectar_mime(string $caminho, string $ext): ?string
{
    $fh  = fopen($caminho, 'rb');
    $cab = $fh ? (string)fread($fh, 12) : '';
    if ($fh) {
        fclose($fh);
    }

    switch ($ext) {
        case 'pdf':
            return str_starts_with($cab, '%PDF-') ? 'application/pdf' : null;
        case 'png':
            return str_starts_with($cab, "\x89PNG\r\n\x1a\n") ? 'image/png' : null;
        case 'jpg':
        case 'jpeg':
            return str_starts_with($cab, "\xFF\xD8\xFF") ? 'image/jpeg' : null;
        case 'webp':
            return (substr($cab, 0, 4) === 'RIFF' && substr($cab, 8, 4) === 'WEBP') ? 'image/webp' : null;
        default: // txt, csv, md: texto não pode ter bytes nulos
            $amostra = (string)file_get_contents($caminho, false, null, 0, 8192);
            return strpos($amostra, "\0") === false ? 'text/plain' : null;
    }
}

/**
 * Valida UM arquivo (um item de $_FILES).
 * Responde com erro HTTP (e encerra) se algo estiver errado.
 *
 * @return array{tmp:string,nome:string,ext:string,mime:string,tamanho:int}
 */
function ia_validar_upload(array $f): array
{
    $limiteMb = (string)(IA_ANEXO_MAX_BYTES / 1048576);
    $erro = $f['error'] ?? UPLOAD_ERR_NO_FILE;
    if (is_array($erro)) {
        ia_erro(422, 'Envie um arquivo por vez.');
    }
    $erro = (int)$erro;

    if ($erro === UPLOAD_ERR_INI_SIZE || $erro === UPLOAD_ERR_FORM_SIZE) {
        ia_erro(413, 'O arquivo é maior que ' . $limiteMb . ' MB.');
    }
    $tmp = (string)($f['tmp_name'] ?? '');
    if ($erro !== UPLOAD_ERR_OK || $tmp === '' || !is_uploaded_file($tmp)) {
        ia_erro(422, 'Não foi possível receber o arquivo. Tente novamente.');
    }

    $tamanho = (int)($f['size'] ?? 0);
    if ($tamanho <= 0) {
        ia_erro(422, 'O arquivo está vazio.');
    }
    if ($tamanho > IA_ANEXO_MAX_BYTES) {
        ia_erro(413, 'O arquivo é maior que ' . $limiteMb . ' MB.');
    }

    // Nome original: só para exibir (o arquivo no disco recebe outro nome)
    $nome = basename(str_replace('\\', '/', (string)($f['name'] ?? '')));
    if (!mb_check_encoding($nome, 'UTF-8')) {
        $nome = mb_convert_encoding($nome, 'UTF-8', 'Windows-1252');
    }
    $nome = preg_replace('/[\x00-\x1F\x7F]/u', '', $nome) ?? '';
    $nome = mb_substr($nome, 0, 200);
    if ($nome === '') {
        $nome = 'arquivo';
    }

    $ext = strtolower(pathinfo($nome, PATHINFO_EXTENSION));
    if (!in_array($ext, IA_ANEXO_EXTENSOES, true)) {
        ia_erro(422, 'Formato não suportado em "' . $nome . '". Envie PDF, imagem (PNG, JPG, WEBP) ou texto (TXT, CSV, MD).');
    }

    $mime = ia_detectar_mime($tmp, $ext);
    if ($mime === null) {
        ia_erro(422, 'O conteúdo de "' . $nome . '" não corresponde ao formato ".' . $ext . '".');
    }

    return ['tmp' => $tmp, 'nome' => $nome, 'ext' => $ext, 'mime' => $mime, 'tamanho' => $tamanho];
}

/**
 * Valida todos os arquivos anexados à mensagem (campo "arquivos[]", ou o
 * antigo "arquivo"). Devolve a lista já validada (vazia se não há anexos).
 * Responde com erro HTTP (e encerra) se passar do limite de arquivos, do
 * limite de tamanho total ou se algum arquivo for inválido.
 *
 * @return list<array{tmp:string,nome:string,ext:string,mime:string,tamanho:int}>
 */
function ia_validar_uploads(): array
{
    $lista = [];

    if (isset($_FILES['arquivos']) && is_array($_FILES['arquivos']) && is_array($_FILES['arquivos']['error'] ?? null)) {
        $f = $_FILES['arquivos'];
        foreach (array_keys($f['error']) as $i) {
            $lista[] = [
                'name'     => $f['name'][$i] ?? '',
                'type'     => $f['type'][$i] ?? '',
                'tmp_name' => $f['tmp_name'][$i] ?? '',
                'error'    => $f['error'][$i],
                'size'     => $f['size'][$i] ?? 0,
            ];
        }
    } elseif (isset($_FILES['arquivo']) && is_array($_FILES['arquivo'])) {
        $lista[] = $_FILES['arquivo'];
    }

    // Campos de arquivo deixados vazios pelo navegador não contam
    $lista = array_values(array_filter(
        $lista,
        static fn(array $f): bool => (int)(is_array($f['error'] ?? null) ? UPLOAD_ERR_OK : ($f['error'] ?? UPLOAD_ERR_NO_FILE)) !== UPLOAD_ERR_NO_FILE
    ));

    if (count($lista) > IA_ANEXO_MAX_ARQUIVOS) {
        ia_erro(422, 'Você pode anexar no máximo ' . IA_ANEXO_MAX_ARQUIVOS . ' arquivos por mensagem.');
    }

    $validos = [];
    $total   = 0;
    foreach ($lista as $f) {
        $v = ia_validar_upload($f);
        $total += $v['tamanho'];
        $validos[] = $v;
    }

    if ($total > IA_ANEXO_MAX_TOTAL_BYTES) {
        ia_erro(413, 'Os arquivos somam mais de ' . (string)(IA_ANEXO_MAX_TOTAL_BYTES / 1048576) . ' MB. Envie menos arquivos ou arquivos menores.');
    }
    return $validos;
}

/** Lê um arquivo de texto como UTF-8 (aceita CSVs do Excel em Windows-1252). */
function ia_texto_do_arquivo(string $caminho): string
{
    $t = (string)file_get_contents($caminho);
    if (str_starts_with($t, "\xEF\xBB\xBF")) {
        $t = substr($t, 3);
    }
    if (!mb_check_encoding($t, 'UTF-8')) {
        $t = mb_convert_encoding($t, 'UTF-8', 'Windows-1252');
    }
    if (mb_strlen($t) > IA_ANEXO_TEXTO_MAX) {
        $t = mb_substr($t, 0, IA_ANEXO_TEXTO_MAX) . "\n[... arquivo cortado por ser muito grande ...]";
    }
    return $t;
}

/** Formato de anexo usado nas respostas JSON. */
function ia_formatar_anexo(int $id, string $nome, string $mime, int $tamanho): array
{
    return ['id' => $id, 'nome' => $nome, 'mime' => $mime, 'tamanho' => $tamanho];
}
