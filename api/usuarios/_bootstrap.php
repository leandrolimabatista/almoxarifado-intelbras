<?php
/**
 * Bootstrap compartilhado pelos endpoints do módulo administrativo
 * "Usuários" (api/usuarios/*). Não é um endpoint: o prefixo "_"
 * indica uso interno (require_once).
 *
 * Cuida de: sessão, JSON, autenticação (401) + autorização (403 —
 * só o usuário id 1 pode usar esses endpoints), CSRF e conexão PDO.
 * Mesmo padrão de api/ia/_bootstrap.php.
 */

declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../conexao.php';

/** Slugs de equipe aceitos (mesmos do menu lateral / módulo de IA). */
const USR_EQUIPES = [
    'geral'      => 'Geral',
    'projetos'   => 'Projetos',
    'marketing'  => 'Marketing',
    'rh'         => 'RH',
    'financeiro' => 'Financeiro',
    'ti'         => 'TI',
    'sac'        => 'SAC / Ouvidoria',
];

/** Cargos aceitos (tela "Editar usuário" — campo obrigatório). */
const USR_CARGOS = [
    'estagiario'   => 'Estagiário',
    'funcionario'  => 'Funcionário',
    'supervisor'   => 'Supervisor',
    'coordenador'  => 'Coordenador',
    'gerente'      => 'Gerente',
    'diretor'      => 'Diretor',
    'ceo'          => 'CEO',
];

/** ID do usuário administrador — único com acesso a este módulo. */
const USR_ADMIN_ID = 1;

/** Envia a resposta JSON e encerra. */
function usr_resposta(int $codigo, array $dados): never
{
    if (!headers_sent()) {
        http_response_code($codigo);
    }
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function usr_erro(int $codigo, string $mensagem): never
{
    usr_resposta($codigo, ['sucesso' => false, 'erro' => $mensagem]);
}

/**
 * Valida método + sessão + que o usuário logado é o administrador.
 * Devolve o id do usuário logado (sempre USR_ADMIN_ID nesse ponto).
 */
function usr_iniciar(array $metodos): int
{
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', $metodos, true)) {
        usr_erro(405, 'Método não permitido.');
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    $usuarioId = (int)($_SESSION['usuario_id'] ?? 0);
    if ($usuarioId <= 0) {
        usr_erro(401, 'Não autenticado.');
    }
    if ($usuarioId !== USR_ADMIN_ID) {
        usr_erro(403, 'Você não tem permissão para acessar esta área.');
    }

    $GLOBALS['usr_csrf_sessao'] = (string)($_SESSION['csrf_usuarios'] ?? '');
    session_write_close();

    return $usuarioId;
}

/** Confere o token CSRF enviado no header X-CSRF-Token (endpoints POST). */
function usr_exigir_csrf(): void
{
    $esperado = (string)($GLOBALS['usr_csrf_sessao'] ?? '');
    $recebido = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');

    if ($esperado === '' || !hash_equals($esperado, $recebido)) {
        usr_erro(403, 'Requisição inválida. Recarregue a página.');
    }
}

/** Lê o corpo JSON da requisição (422 se inválido). */
function usr_ler_json(): array
{
    $dados = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($dados)) {
        usr_erro(422, 'Corpo da requisição inválido.');
    }
    return $dados;
}

function usr_campo(array $dados, string $chave): string
{
    return trim((string)($dados[$chave] ?? ''));
}

/** Formata um usuário de tb_usuarios pro JSON de resposta. */
function usr_formatar_usuario(array $u): array
{
    return [
        'id'              => (int)$u['id'],
        'nome'            => (string)$u['nome'],
        'email'           => (string)$u['email'],
        'telefone'        => (string)$u['telefone'],
        'cpf'             => (string)$u['cpf'],
        'data_nascimento' => (string)$u['data_nascimento'],
        'genero'          => (string)$u['genero'],
        'genero_outro'    => $u['genero_outro'] !== null ? (string)$u['genero_outro'] : null,
        'unidade_id'      => $u['unidade_id'] !== null ? (int)$u['unidade_id'] : null,
        'unidade_nome'    => $u['unidade_nome'] ?? null,
        'equipe_slug'     => $u['equipe_slug'] !== null ? (string)$u['equipe_slug'] : null,
        'equipe_nome'     => isset($u['equipe_slug']) && isset(USR_EQUIPES[$u['equipe_slug']]) ? USR_EQUIPES[$u['equipe_slug']] : null,
        'cargo'           => $u['cargo'] !== null ? (string)$u['cargo'] : null,
        'cargo_nome'      => isset($u['cargo']) && isset(USR_CARGOS[$u['cargo']]) ? USR_CARGOS[$u['cargo']] : null,
        'status'          => (string)$u['status'],
        'criado_em'       => (string)$u['criado_em'],
    ];
}

/** Formata uma solicitação de tb_solicitacoes_acesso pro JSON de resposta. */
function usr_formatar_solicitacao(array $s): array
{
    return [
        'id'                => (int)$s['id'],
        'nome'              => (string)$s['nome'],
        'email'             => (string)$s['email'],
        'telefone'          => (string)$s['telefone'],
        'equipe_solicitada' => (string)$s['equipe_solicitada'],
        'equipe_nome'       => USR_EQUIPES[$s['equipe_solicitada']] ?? $s['equipe_solicitada'],
        'status'            => (string)$s['status'],
        'solicitado_em'     => (string)$s['solicitado_em'],
    ];
}
