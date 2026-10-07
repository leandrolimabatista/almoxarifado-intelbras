<?php
/**
 * Serviço do módulo "Documentos" — regras de negócio SEM HTTP.
 *
 * Não envia headers, não abre sessão e não responde JSON: só funções e
 * constantes. Por isso pode ser usado por qualquer código PHP do projeto,
 * inclusive pelo futuro CHAT DAS EQUIPES:
 *
 *     require_once __DIR__ . '/../documentos/_servico.php';
 *
 *     try {
 *         $doc = documentos_salvar_arquivo(
 *             $pdo,                       // PDO já aberto (conectar() de api/conexao.php)
 *             $usuarioId,                 // quem enviou a mensagem
 *             'marketing',                // slug da equipe do chat
 *             $caminhoDoArquivo,          // arquivo no disco (ex.: $_FILES['x']['tmp_name'])
 *             $nomeOriginal,              // ex.: "Briefing Q4.pdf"
 *             ['origem' => 'chat', 'origem_ref' => 'msg-' . $mensagemId . '-0']
 *         );
 *     } catch (DocumentosErro $e) {
 *         // $e->getMessage() = texto para mostrar; $e->getCode() = código HTTP sugerido
 *     }
 *
 * Detalhes e exemplo completo: api/documentos/LEIA-ME.md
 */

declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

/** Equipes (mesmas do menu lateral). slug => nome exibido. */
const DOC_EQUIPES = [
    'geral'      => 'Geral',
    'projetos'   => 'Projetos',
    'marketing'  => 'Marketing',
    'rh'         => 'RH',
    'financeiro' => 'Financeiro',
    'ti'         => 'TI',
    'sac'        => 'SAC / Ouvidoria',
];

/** Formatos aceitos (extensão => MIME canônico). */
const DOC_EXTENSOES = [
    'pdf'  => 'application/pdf',
    'doc'  => 'application/msword',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls'  => 'application/vnd.ms-excel',
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt'  => 'application/vnd.ms-powerpoint',
    'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt'  => 'text/plain',
    'csv'  => 'text/plain',
    'md'   => 'text/plain',
    'png'  => 'image/png',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'webp' => 'image/webp',
];

const DOC_MAX_BYTES = 20 * 1024 * 1024; // 20 MB por arquivo
const DOC_NOME_MAX  = 150;              // caracteres do título

/**
 * Erro de regra de negócio (arquivo inválido, equipe inexistente...).
 * getMessage() é um texto pronto para o usuário; getCode() é o código HTTP
 * sugerido (422, 413, 500).
 */
final class DocumentosErro extends RuntimeException
{
    public function __construct(string $mensagem, int $http = 422)
    {
        parent::__construct($mensagem, $http);
    }
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

/**
 * Pasta onde os arquivos ficam. Fora do htdocs, para nunca serem acessados
 * por URL direta (só via api/documentos/arquivo.php, que exige login).
 * Padrão: pasta "documentos_uploads" ao lado do htdocs (ex.: C:/xampp/documentos_uploads).
 * Para mudar, defina a variável de ambiente DOCUMENTOS_UPLOAD_DIR.
 */
function doc_dir_arquivos(): string
{
    $env = getenv('DOCUMENTOS_UPLOAD_DIR');
    if ($env !== false && $env !== '') {
        return rtrim($env, '/\\');
    }
    $raiz = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/\\');
    $base = $raiz !== '' ? dirname($raiz) : dirname(__DIR__, 3);
    return $base . '/documentos_uploads';
}

/**
 * Título do documento: tira caracteres de controle, junta espaços repetidos
 * e limita o tamanho.
 */
function doc_limpar_nome(string $nome): string
{
    $nome = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $nome) ?? '';
    $nome = trim(preg_replace('/\s+/u', ' ', $nome) ?? '');
    return mb_substr($nome, 0, DOC_NOME_MAX);
}

/** true se a extensão do nome informado é aceita pelo Documentos (útil ao chat decidir antes de chamar). */
function doc_extensao_aceita(string $nomeArquivo): bool
{
    return array_key_exists(strtolower(pathinfo($nomeArquivo, PATHINFO_EXTENSION)), DOC_EXTENSOES);
}

/**
 * Confere a assinatura (primeiros bytes) do arquivo. Devolve o MIME real ou
 * null se o conteúdo não bate com a extensão. Não confia no tipo enviado pelo
 * navegador.
 */
function doc_detectar_mime(string $caminho, string $ext): ?string
{
    $fh  = fopen($caminho, 'rb');
    $cab = $fh ? (string)fread($fh, 1024) : '';
    if ($fh) {
        fclose($fh);
    }

    switch ($ext) {
        case 'pdf':
            return strpos($cab, '%PDF-') !== false ? 'application/pdf' : null;

        case 'png':
            return str_starts_with($cab, "\x89PNG\r\n\x1a\n") ? 'image/png' : null;

        case 'jpg':
        case 'jpeg':
            return str_starts_with($cab, "\xFF\xD8\xFF") ? 'image/jpeg' : null;

        case 'webp':
            return (substr($cab, 0, 4) === 'RIFF' && substr($cab, 8, 4) === 'WEBP') ? 'image/webp' : null;

        case 'doc':
        case 'xls':
        case 'ppt': // formato antigo do Office (OLE)
            return str_starts_with($cab, "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1") ? DOC_EXTENSOES[$ext] : null;

        case 'docx':
        case 'xlsx':
        case 'pptx': // formato novo do Office = ZIP com um arquivo característico
            if (!str_starts_with($cab, "PK\x03\x04")) {
                return null;
            }
            if (class_exists('ZipArchive')) {
                $entradas = ['docx' => 'word/document.xml', 'xlsx' => 'xl/workbook.xml', 'pptx' => 'ppt/presentation.xml'];
                $zip = new ZipArchive();
                if ($zip->open($caminho, ZipArchive::RDONLY) !== true) {
                    return null;
                }
                $tem = $zip->locateName($entradas[$ext]) !== false;
                $zip->close();
                if (!$tem) {
                    return null;
                }
            }
            return DOC_EXTENSOES[$ext];

        default: // txt, csv, md: texto não pode ter bytes nulos
            $amostra = (string)file_get_contents($caminho, false, null, 0, 8192);
            return strpos($amostra, "\0") === false ? 'text/plain' : null;
    }
}

/**
 * Valida um arquivo que já está no disco: tamanho, extensão e assinatura.
 * Lança DocumentosErro se algo estiver errado.
 *
 * @return array{nome:string,ext:string,mime:string,tamanho:int}
 */
function doc_validar_arquivo(string $caminho, string $nomeOriginal): array
{
    $limiteMb = (string)(DOC_MAX_BYTES / 1048576);

    $tamanho = (int)filesize($caminho);
    if ($tamanho <= 0) {
        throw new DocumentosErro('O arquivo está vazio.', 422);
    }
    if ($tamanho > DOC_MAX_BYTES) {
        throw new DocumentosErro('O arquivo é maior que ' . $limiteMb . ' MB.', 413);
    }

    // Nome original: só para exibir/baixar (o arquivo no disco recebe outro nome)
    $nome = basename(str_replace('\\', '/', $nomeOriginal));
    if (!mb_check_encoding($nome, 'UTF-8')) {
        $nome = mb_convert_encoding($nome, 'UTF-8', 'Windows-1252');
    }
    $nome = preg_replace('/[\x00-\x1F\x7F]/u', '', $nome) ?? '';
    $nome = mb_substr($nome, 0, 200);
    if ($nome === '') {
        $nome = 'arquivo';
    }

    $ext = strtolower(pathinfo($nome, PATHINFO_EXTENSION));
    if (!array_key_exists($ext, DOC_EXTENSOES)) {
        throw new DocumentosErro('Formato não suportado. Envie PDF, Word, Excel, PowerPoint, imagem (PNG, JPG, WEBP) ou texto (TXT, CSV, MD).', 422);
    }

    $mime = doc_detectar_mime($caminho, $ext);
    if ($mime === null) {
        throw new DocumentosErro('O conteúdo de "' . $nome . '" não corresponde ao formato ".' . $ext . '".', 422);
    }

    return ['nome' => $nome, 'ext' => $ext, 'mime' => $mime, 'tamanho' => $tamanho];
}

/**
 * Traduz "coluna inexistente" (SQLSTATE 42S22) numa mensagem que diz o que
 * fazer; qualquer outro PDOException segue como está.
 */
function doc_traduzir_erro_banco(PDOException $e): Throwable
{
    if ((string)$e->getCode() === '42S22') {
        return new DocumentosErro('O banco ainda não tem as colunas de origem dos documentos. Execute database/documentos_chat.sql no phpMyAdmin.', 500);
    }
    return $e;
}

/**
 * Procura um documento já criado para a mesma origem (evita duplicar quando o
 * chat repete a chamada). Devolve null se não existir.
 *
 * @return array{id:int,nome:string,equipe:string,extensao:string,tamanho:int}|null
 */
function doc_buscar_por_origem(PDO $pdo, string $origem, string $ref): ?array
{
    try {
        $stmt = $pdo->prepare(
            'SELECT id, nome, equipe_slug, extensao, tamanho
             FROM tb_documentos
             WHERE origem = :origem AND origem_ref = :ref
             LIMIT 1'
        );
        $stmt->execute(['origem' => $origem, 'ref' => $ref]);
        $l = $stmt->fetch();
    } catch (PDOException $e) {
        throw doc_traduzir_erro_banco($e);
    }

    if (!$l) {
        return null;
    }
    return [
        'id'       => (int)$l['id'],
        'nome'     => (string)$l['nome'],
        'equipe'   => (string)$l['equipe_slug'],
        'extensao' => (string)$l['extensao'],
        'tamanho'  => (int)$l['tamanho'],
    ];
}

// ---------------------------------------------------------------------
// Salvar um documento (usado pela página Documentos e pelo chat)
// ---------------------------------------------------------------------

/**
 * Valida o arquivo, COPIA para a pasta de documentos (doc_dir_arquivos())
 * e cria o registro em tb_documentos. O arquivo original não é apagado nem
 * movido — quem chamou continua dono dele (o chat pode guardar o seu próprio).
 *
 * @param PDO    $pdo          conexão aberta (conectar() de api/conexao.php)
 * @param int    $usuarioId    dono do documento (quem enviou)
 * @param string $equipe       slug: geral | projetos | marketing | rh | financeiro | ti | sac
 * @param string $caminho      arquivo no disco, legível
 * @param string $nomeOriginal nome do arquivo com extensão (define o formato)
 * @param array  $opcoes       'nome'       título exibido (padrão: nome do arquivo sem extensão)
 *                             'origem'     de onde veio: 'chat' (padrão vazio = envio pela página)
 *                             'origem_ref' identificador dentro da origem, ex.: 'msg-123-0'.
 *                                          Se já existir um documento com a mesma origem+ref,
 *                                          devolve ELE (duplicado = true) em vez de criar outro.
 *                             Usar 'origem' exige rodar database/documentos_chat.sql.
 *
 * @return array{id:int,nome:string,equipe:string,extensao:string,tamanho:int,duplicado:bool}
 * @throws DocumentosErro regra de negócio (arquivo/equipe inválidos, sem espaço...)
 * @throws PDOException   falha inesperada de banco
 */
function documentos_salvar_arquivo(PDO $pdo, int $usuarioId, string $equipe, string $caminho, string $nomeOriginal, array $opcoes = []): array
{
    if ($usuarioId <= 0) {
        throw new DocumentosErro('Usuário inválido.', 422);
    }
    if (!array_key_exists($equipe, DOC_EQUIPES)) {
        throw new DocumentosErro('Equipe inválida.', 422);
    }
    if (!is_file($caminho) || !is_readable($caminho)) {
        throw new DocumentosErro('Não foi possível ler o arquivo.', 422);
    }

    $origem = (string)($opcoes['origem'] ?? '');
    $ref    = (string)($opcoes['origem_ref'] ?? '');
    if ($origem !== '' && preg_match('/^[a-z_]{1,20}$/', $origem) !== 1) {
        throw new DocumentosErro('Origem inválida.', 422);
    }
    if ($ref !== '' && ($origem === '' || mb_strlen($ref) > 80)) {
        throw new DocumentosErro('Referência de origem inválida.', 422);
    }

    // Chamada repetida (retry do chat, mensagem reenviada...): devolve o que já existe
    if ($origem !== '' && $ref !== '') {
        $existente = doc_buscar_por_origem($pdo, $origem, $ref);
        if ($existente !== null) {
            return $existente + ['duplicado' => true];
        }
    }

    $v = doc_validar_arquivo($caminho, $nomeOriginal);

    $nome = doc_limpar_nome((string)($opcoes['nome'] ?? ''));
    if ($nome === '') {
        $nome = doc_limpar_nome((string)pathinfo($v['nome'], PATHINFO_FILENAME));
    }
    if ($nome === '') {
        $nome = 'Documento';
    }

    // Pasta de destino (criada na primeira vez)
    $dir = doc_dir_arquivos();
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
        error_log('[documentos] não foi possível criar a pasta ' . $dir);
        throw new DocumentosErro('Não foi possível salvar o arquivo no servidor.', 500);
    }

    $arquivo = bin2hex(random_bytes(16)) . '.' . $v['ext'];
    $destino = $dir . '/' . $arquivo;
    if (!@copy($caminho, $destino)) {
        error_log('[documentos] falha ao copiar o arquivo para ' . $dir);
        throw new DocumentosErro('Não foi possível salvar o arquivo no servidor.', 500);
    }

    // Datas em horário de Brasília, escritas pelo PHP: não dependem do fuso
    // configurado na conexão de quem chamou.
    $agora = (new DateTimeImmutable('now', new DateTimeZone('America/Sao_Paulo')))->format('Y-m-d H:i:s');

    $colunas = ['usuario_id', 'atualizado_por', 'nome', 'nome_arquivo', 'arquivo', 'extensao', 'mime', 'tamanho', 'equipe_slug', 'criado_em', 'atualizado_em'];
    $valores = [
        'usuario_id'     => $usuarioId,
        'atualizado_por' => $usuarioId,
        'nome'           => $nome,
        'nome_arquivo'   => $v['nome'],
        'arquivo'        => $arquivo,
        'extensao'       => $v['ext'],
        'mime'           => $v['mime'],
        'tamanho'        => $v['tamanho'],
        'equipe_slug'    => $equipe,
        'criado_em'      => $agora,
        'atualizado_em'  => $agora,
    ];
    if ($origem !== '') {
        $colunas[] = 'origem';
        $valores['origem'] = $origem;
        if ($ref !== '') {
            $colunas[] = 'origem_ref';
            $valores['origem_ref'] = $ref;
        }
    }

    try {
        $sql = 'INSERT INTO tb_documentos (' . implode(', ', $colunas) . ')
                VALUES (:' . implode(', :', $colunas) . ')';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($valores);
        $id = (int)$pdo->lastInsertId();
    } catch (PDOException $e) {
        @unlink($destino); // não deixa arquivo órfão se o banco falhar

        // Duas chamadas simultâneas com a mesma origem+ref: a outra ganhou
        if ((string)$e->getCode() === '23000' && $origem !== '' && $ref !== '') {
            $existente = doc_buscar_por_origem($pdo, $origem, $ref);
            if ($existente !== null) {
                return $existente + ['duplicado' => true];
            }
        }
        throw doc_traduzir_erro_banco($e);
    }

    return [
        'id'        => $id,
        'nome'      => $nome,
        'equipe'    => $equipe,
        'extensao'  => $v['ext'],
        'tamanho'   => $v['tamanho'],
        'duplicado' => false,
    ];
}
