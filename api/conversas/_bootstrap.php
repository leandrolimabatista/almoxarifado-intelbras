<?php
/**
 * Bootstrap compartilhado pelos endpoints do módulo "Nova conversa"
 * (api/conversas/*). Não é um endpoint: o prefixo "_" indica uso
 * interno (require_once).
 *
 * Cuida de: sessão, JSON, autenticação (401), CSRF (403) e conexão
 * PDO. Mesmo padrão de api/ia/_bootstrap.php — mas qualquer usuário
 * logado pode usar (não é restrito ao administrador).
 */

declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../conexao.php';

/**
 * Equipes: lidas de tb_equipes (database/equipes.sql), a mesma tabela que
 * alimenta o menu lateral e o módulo "Equipes". Sem fallback fixo — se
 * tb_equipes não existir ainda, contatos.php devolve a lista de equipes
 * vazia e os contatos continuam funcionando normalmente.
 */
function chat_equipes(PDO $pdo): array
{
    static $equipes = null;
    if ($equipes !== null) {
        return $equipes;
    }

    $equipes = [];
    try {
        $stmt = $pdo->query('SELECT slug, nome, cor FROM tb_equipes ORDER BY ordem, nome');
        foreach ($stmt->fetchAll() as $e) {
            $equipes[(string)$e['slug']] = ['nome' => (string)$e['nome'], 'cor' => (string)$e['cor']];
        }
    } catch (PDOException $e) {
        // tb_equipes ainda não existe: segue sem equipes (só contatos).
    }
    return $equipes;
}

/** Cargos (tb_usuarios.cargo). */
const CHAT_CARGOS = [
    'estagiario'  => 'Estagiário',
    'funcionario' => 'Funcionário',
    'supervisor'  => 'Supervisor',
    'coordenador' => 'Coordenador',
    'gerente'     => 'Gerente',
    'diretor'     => 'Diretor',
    'ceo'         => 'CEO',
];

/** Limite de participantes de uma única conversa. */
const CHAT_MAX_PARTICIPANTES = 250;

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

/** Valida método + sessão e devolve o id do usuário logado. */
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

    $GLOBALS['chat_csrf_sessao'] = (string)($_SESSION['csrf_conversas'] ?? '');
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
