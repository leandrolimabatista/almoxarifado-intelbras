<?php
/**
 * Bootstrap compartilhado pelos endpoints do módulo "Inteligência Artificial".
 * Não é um endpoint: o prefixo "_" indica apenas uso interno (require_once).
 *
 * Cuida de: sessão, fuso horário, JSON, autenticação (401), CSRF (403),
 * conexão PDO com o mesmo offset do PHP e formatação de datas em ISO 8601.
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

/** Envia a resposta JSON e encerra. */
function ia_resposta(int $codigo, array $dados): never
{
    if (!headers_sent()) {
        http_response_code($codigo);
    }
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ia_erro(int $codigo, string $mensagem): never
{
    // Guardada para o registro do envio (envio.php) quando o usuário não está mais na página
    $GLOBALS['ia_ultimo_erro'] = $mensagem;
    ia_resposta($codigo, ['sucesso' => false, 'erro' => $mensagem]);
}

/**
 * Valida método + sessão e devolve o id do usuário logado.
 * A sessão é liberada logo em seguida (session_write_close) para que
 * uma chamada demorada à IA não trave as outras requisições do usuário.
 */
function ia_iniciar(array $metodos): int
{
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', $metodos, true)) {
        ia_erro(405, 'Método não permitido.');
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    $usuarioId = (int)($_SESSION['usuario_id'] ?? 0);
    if ($usuarioId <= 0) {
        ia_erro(401, 'Não autenticado.');
    }

    $GLOBALS['ia_csrf_sessao'] = (string)($_SESSION['csrf_ia'] ?? '');
    session_write_close();

    return $usuarioId;
}

/** Confere o token CSRF enviado no header X-CSRF-Token (endpoints POST). */
function ia_exigir_csrf(): void
{
    $esperado = (string)($GLOBALS['ia_csrf_sessao'] ?? '');
    $recebido = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');

    if ($esperado === '' || !hash_equals($esperado, $recebido)) {
        ia_erro(403, 'Requisição inválida. Recarregue a página.');
    }
}

/** Lê o corpo JSON da requisição (422 se inválido). */
function ia_ler_json(): array
{
    $dados = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($dados)) {
        ia_erro(422, 'Corpo da requisição inválido.');
    }
    return $dados;
}

/** Conexão PDO com o fuso do MySQL alinhado ao do PHP (America/Sao_Paulo). */
function ia_pdo(): PDO
{
    $pdo = conectar();
    $offset = (new DateTimeImmutable('now'))->format('P'); // ex.: -03:00
    $pdo->exec("SET time_zone = '" . $offset . "'");
    return $pdo;
}

/** "2026-09-19 10:15:00" (horário local) -> "2026-09-19T10:15:00-03:00". */
function ia_iso(string $datahora): string
{
    return (new DateTimeImmutable($datahora))->format('c');
}

/** Formato de conversa usado por todos os endpoints. */
function ia_formatar_conversa(array $linha): array
{
    return [
        'id'            => (int)$linha['id'],
        'titulo'        => (string)$linha['titulo'],
        'fixada'        => (int)$linha['fixada'] === 1,
        'atualizada_em' => ia_iso((string)$linha['atualizada_em']),
    ];
}

/** Slugs de equipe aceitos (mesmos do menu lateral). */
const IA_EQUIPES = ['geral', 'projetos', 'marketing', 'rh', 'financeiro', 'ti', 'sac'];
