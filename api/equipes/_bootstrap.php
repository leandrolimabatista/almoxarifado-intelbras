<?php
/**
 * Bootstrap compartilhado pelos endpoints do módulo "Equipes" (chat das
 * equipes). Não é um endpoint: o prefixo "_" indica uso interno (require_once).
 *
 * Mesmo padrão de api/documentos/_bootstrap.php e api/ia/_bootstrap.php:
 * sessão, fuso horário, JSON, autenticação (401), CSRF (403), conexão PDO.
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
function eq_resposta(int $codigo, array $dados): never
{
    if (!headers_sent()) {
        http_response_code($codigo);
    }
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function eq_erro(int $codigo, string $mensagem): never
{
    eq_resposta($codigo, ['sucesso' => false, 'erro' => $mensagem]);
}

/** Trata falha de banco: loga e responde 500 (avisa se faltar rodar o SQL). */
function eq_erro_banco(PDOException $e, string $contexto): never
{
    error_log('[equipes/' . $contexto . '] ' . $e->getMessage());
    if (in_array((string)$e->getCode(), ['42S02', '42S22'], true)) {
        eq_erro(500, 'As tabelas de Equipes ainda não existem. Execute database/equipes.sql no phpMyAdmin.');
    }
    eq_erro(500, 'Erro ao consultar o banco de dados.');
}

/** Valida método + sessão e devolve o id do usuário logado. */
function eq_iniciar(array $metodos): int
{
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', $metodos, true)) {
        eq_erro(405, 'Método não permitido.');
    }
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $usuarioId = (int)($_SESSION['usuario_id'] ?? 0);
    if ($usuarioId <= 0) {
        eq_erro(401, 'Não autenticado.');
    }
    $GLOBALS['eq_csrf_sessao'] = (string)($_SESSION['csrf_equipes'] ?? '');
    session_write_close();
    return $usuarioId;
}

/** Confere o token CSRF enviado no header X-CSRF-Token (endpoints que gravam). */
function eq_exigir_csrf(): void
{
    $esperado = (string)($GLOBALS['eq_csrf_sessao'] ?? '');
    $recebido = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($esperado === '' || !hash_equals($esperado, $recebido)) {
        eq_erro(403, 'Requisição inválida. Recarregue a página.');
    }
}

/** Lê o corpo JSON da requisição (422 se inválido). */
function eq_ler_json(): array
{
    $dados = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($dados)) {
        eq_erro(422, 'Corpo da requisição inválido.');
    }
    return $dados;
}

/** Conexão PDO com o fuso do MySQL alinhado ao do PHP. */
function eq_pdo(): PDO
{
    $pdo = conectar();
    $offset = (new DateTimeImmutable('now'))->format('P');
    $pdo->exec("SET time_zone = '" . $offset . "'");
    return $pdo;
}

/** Slug de equipe da query string, validado contra o banco (404 se não existir). */
function eq_slug_da_query(PDO $pdo): array
{
    $slug = strtolower(trim((string)($_GET['slug'] ?? $_POST['slug'] ?? 'geral')));
    $equipe = eq_buscar_equipe($pdo, $slug);
    if ($equipe === null) {
        eq_erro(404, 'Equipe não encontrada.');
    }
    return $equipe;
}
