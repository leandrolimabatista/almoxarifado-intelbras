<?php
/**
 * Bootstrap compartilhado pelos endpoints do módulo "Chat" (conversas
 * pessoais, uma pra uma — como o chat do Teams). Não é um endpoint: o
 * prefixo "_" indica uso interno (require_once).
 *
 * Mesmo padrão de api/documentos/_bootstrap.php: sessão, JSON, CSRF
 * (token próprio, csrf_chat) e conexão PDO (reaproveita api/conexao.php).
 * Os anexos viram documentos de verdade — ver _servico.php, que chama
 * documentos_salvar_arquivo() do módulo Documentos.
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
require_once __DIR__ . '/../documentos/_servico.php'; // documentos_salvar_arquivo(), doc_dir_arquivos()
require_once __DIR__ . '/_servico.php';

/** Envia a resposta JSON e encerra. */
function chat_resposta(int $codigo, array $dados): never
{
    if (!headers_sent()) {
        http_response_code($codigo);
    }
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function chat_erro(int $codigo, string $mensagem): never
{
    chat_resposta($codigo, ['sucesso' => false, 'erro' => $mensagem]);
}

/** Trata falha de banco: registra no log do PHP e responde 500. */
function chat_erro_banco(PDOException $e, string $contexto): never
{
    error_log('[chat/' . $contexto . '] ' . $e->getMessage());

    if ((string)$e->getCode() === '42S02') {
        chat_erro(500, 'As tabelas do Chat ainda não existem. Execute database/chat.sql no phpMyAdmin.');
    }
    chat_erro(500, 'Erro ao consultar o banco de dados.');
}

/**
 * Valida método + sessão e devolve o id do usuário logado.
 * A sessão é liberada logo em seguida (session_write_close) para que um
 * upload demorado não trave as outras requisições do usuário.
 */
function chat_iniciar(array $metodos): int
{
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', $metodos, true)) {
        chat_erro(405, 'Método não permitido.');
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    $usuarioId = (int)($_SESSION['usuario_id'] ?? 0);
    if ($usuarioId <= 0) {
        chat_erro(401, 'Não autenticado.');
    }

    $GLOBALS['chat_csrf_sessao'] = (string)($_SESSION['csrf_chat'] ?? '');
    session_write_close();

    return $usuarioId;
}

/** Confere o token CSRF enviado no header X-CSRF-Token (endpoints POST). */
function chat_exigir_csrf(): void
{
    $esperado = (string)($GLOBALS['chat_csrf_sessao'] ?? '');
    $recebido = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');

    if ($esperado === '' || !hash_equals($esperado, $recebido)) {
        chat_erro(403, 'Requisição inválida. Recarregue a página.');
    }
}

/** Lê o corpo JSON da requisição (422 se inválido). */
function chat_ler_json(): array
{
    $dados = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($dados)) {
        chat_erro(422, 'Corpo da requisição inválido.');
    }
    return $dados;
}

/** Conexão PDO com o fuso do MySQL alinhado ao do PHP (America/Sao_Paulo). */
function chat_pdo(): PDO
{
    $pdo = conectar();
    $offset = (new DateTimeImmutable('now'))->format('P'); // ex.: -03:00
    $pdo->exec("SET time_zone = '" . $offset . "'");
    return $pdo;
}

/** "2026-09-19 10:15:00" (horário local) -> "2026-09-19T10:15:00-03:00". */
function chat_iso(string $datahora): string
{
    return (new DateTimeImmutable($datahora))->format('c');
}
