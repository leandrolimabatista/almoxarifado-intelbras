<?php
/**
 * Bootstrap compartilhado pelos endpoints do módulo "Documentos".
 * Não é um endpoint: o prefixo "_" indica apenas uso interno (require_once).
 *
 * Cuida da parte HTTP: sessão, fuso horário, JSON, autenticação (401), CSRF (403),
 * conexão PDO (reaproveita api/conexao.php), recebimento de upload e formatação
 * de datas em ISO 8601. As regras de negócio (equipes, formatos, validação e
 * salvar documento) ficam em _servico.php, que também serve ao chat das equipes.
 *
 * Mesmo padrão de api/ia/_bootstrap.php, mas independente dele (o módulo
 * Documentos não depende do módulo IA).
 */

declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

date_default_timezone_set('America/Sao_Paulo');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../conexao.php';
require_once __DIR__ . '/_servico.php';

/** Envia a resposta JSON e encerra. */
function doc_resposta(int $codigo, array $dados): never
{
    if (!headers_sent()) {
        http_response_code($codigo);
    }
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function doc_erro(int $codigo, string $mensagem): never
{
    doc_resposta($codigo, ['sucesso' => false, 'erro' => $mensagem]);
}

/**
 * Trata falha de banco: registra no log do PHP e responde 500.
 * Se for "tabela não existe" (SQLSTATE 42S02), avisa que falta rodar o SQL.
 */
function doc_erro_banco(PDOException $e, string $contexto): never
{
    error_log('[documentos/' . $contexto . '] ' . $e->getMessage());

    if ((string)$e->getCode() === '42S02') {
        doc_erro(500, 'As tabelas de Documentos ainda não existem. Execute database/documentos.sql no phpMyAdmin.');
    }
    doc_erro(500, 'Erro ao consultar o banco de dados.');
}

/**
 * Valida método + sessão e devolve o id do usuário logado.
 * A sessão é liberada logo em seguida (session_write_close) para que um
 * upload demorado não trave as outras requisições do usuário.
 */
function doc_iniciar(array $metodos): int
{
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', $metodos, true)) {
        doc_erro(405, 'Método não permitido.');
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    $usuarioId = (int)($_SESSION['usuario_id'] ?? 0);
    if ($usuarioId <= 0) {
        doc_erro(401, 'Não autenticado.');
    }

    $GLOBALS['doc_csrf_sessao'] = (string)($_SESSION['csrf_documentos'] ?? '');
    session_write_close();

    return $usuarioId;
}

/** Confere o token CSRF enviado no header X-CSRF-Token (endpoints POST). */
function doc_exigir_csrf(): void
{
    $esperado = (string)($GLOBALS['doc_csrf_sessao'] ?? '');
    $recebido = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');

    if ($esperado === '' || !hash_equals($esperado, $recebido)) {
        doc_erro(403, 'Requisição inválida. Recarregue a página.');
    }
}

/** Lê o corpo JSON da requisição (422 se inválido). */
function doc_ler_json(): array
{
    $dados = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($dados)) {
        doc_erro(422, 'Corpo da requisição inválido.');
    }
    return $dados;
}

/** Conexão PDO com o fuso do MySQL alinhado ao do PHP (America/Sao_Paulo). */
function doc_pdo(): PDO
{
    $pdo = conectar();
    $offset = (new DateTimeImmutable('now'))->format('P'); // ex.: -03:00
    $pdo->exec("SET time_zone = '" . $offset . "'");
    return $pdo;
}

/** "2026-09-19 10:15:00" (horário local) -> "2026-09-19T10:15:00-03:00". */
function doc_iso(string $datahora): string
{
    return (new DateTimeImmutable($datahora))->format('c');
}

/** Vincula um array de parâmetros nomeados (int => PARAM_INT). */
function doc_vincular(PDOStatement $stmt, array $parametros): void
{
    foreach ($parametros as $nome => $valor) {
        $stmt->bindValue(':' . $nome, $valor, is_int($valor) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }
}

/** Formato de documento usado por listar.php. */
function doc_formatar(array $l, int $usuarioId): array
{
    $autor = (string)($l['autor'] ?? '');
    return [
        'id'             => (int)$l['id'],
        'nome'           => (string)$l['nome'],
        'extensao'       => (string)$l['extensao'],
        'tamanho'        => (int)$l['tamanho'],
        'equipe'         => (string)$l['equipe_slug'],
        'autor'          => $autor,
        'atualizado_por' => (string)($l['atualizado_por_nome'] ?? $autor),
        'atualizado_em'  => doc_iso((string)$l['atualizado_em']),
        'excluido_em'    => $l['excluido_em'] !== null ? doc_iso((string)$l['excluido_em']) : null,
        'meu'            => (int)$l['usuario_id'] === $usuarioId,
        'favorito'       => !empty($l['favorito']),
    ];
}

// ---------------------------------------------------------------------
// Upload pela página
// ---------------------------------------------------------------------

/**
 * Confere o item de $_FILES recebido por POST (erros do PHP, arquivo de upload
 * legítimo) e devolve o caminho temporário + nome original. O conteúdo e o
 * formato são validados depois, em documentos_salvar_arquivo().
 *
 * @return array{tmp:string,nome:string}
 * @throws DocumentosErro
 */
function doc_receber_upload(array $f): array
{
    $limiteMb = (string)(DOC_MAX_BYTES / 1048576);
    $erro = $f['error'] ?? UPLOAD_ERR_NO_FILE;
    if (is_array($erro)) {
        throw new DocumentosErro('Envie um arquivo por vez.', 422);
    }
    $erro = (int)$erro;

    if ($erro === UPLOAD_ERR_INI_SIZE || $erro === UPLOAD_ERR_FORM_SIZE) {
        throw new DocumentosErro('O arquivo é maior que o limite aceito pelo servidor (' . $limiteMb . ' MB).', 413);
    }
    if ($erro === UPLOAD_ERR_NO_FILE) {
        throw new DocumentosErro('Selecione um arquivo.', 422);
    }
    $tmp = (string)($f['tmp_name'] ?? '');
    if ($erro !== UPLOAD_ERR_OK || $tmp === '' || !is_uploaded_file($tmp)) {
        throw new DocumentosErro('Não foi possível receber o arquivo. Tente novamente.', 422);
    }

    return ['tmp' => $tmp, 'nome' => (string)($f['name'] ?? '')];
}
