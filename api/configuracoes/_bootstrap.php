<?php
/**
 * Bootstrap compartilhado pelos endpoints do módulo "Configurações"
 * (api/configuracoes/*). Não é um endpoint: o prefixo "_" indica uso
 * interno (require_once). Mesmo padrão de api/ia/_bootstrap.php.
 *
 * Cuida de: sessão, JSON, autenticação (401), CSRF e conexão PDO.
 * Cada usuário só enxerga/altera os PRÓPRIOS dados (usa sempre o id
 * da sessão, nunca um id vindo do navegador).
 */

declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../conexao.php';

const CFG_IDIOMAS = ['pt-BR' => 'Português (Brasil)', 'en-US' => 'English (US)', 'es-ES' => 'Español'];

const CFG_FUSOS = [
    'America/Noronha'   => '(GMT-02:00) Fernando de Noronha',
    'America/Sao_Paulo' => '(GMT-03:00) Brasília',
    'America/Manaus'    => '(GMT-04:00) Manaus',
    'America/Rio_Branco' => '(GMT-05:00) Rio Branco',
];

const CFG_CARGOS = [
    'estagiario' => 'Estagiário', 'funcionario' => 'Funcionário', 'supervisor' => 'Supervisor',
    'coordenador' => 'Coordenador', 'gerente' => 'Gerente', 'diretor' => 'Diretor', 'ceo' => 'CEO',
];

/**
 * Esquema das preferências: grupo => chave => [tipo, padrão, opções].
 * Tudo que vier do navegador é validado contra esta lista (chaves e valores
 * desconhecidos são descartados).
 */
const CFG_PREFS = [
    'notificacoes' => [
        'canal_app'               => ['bool', true],
        'canal_email'             => ['bool', true],
        'canal_push'              => ['bool', false],
        'tipo_mensagens'          => ['bool', true],
        'tipo_mencoes'            => ['bool', true],
        'tipo_reunioes_novas'     => ['bool', true],
        'tipo_reunioes_lembretes' => ['bool', true],
        'tipo_equipes'            => ['bool', false],
        'nao_perturbe'            => ['bool', false],
        'nao_perturbe_de'         => ['hora', '18:00'],
        'nao_perturbe_ate'        => ['hora', '08:00'],
    ],
    'privacidade' => [
        'status_visivel'      => ['enum', 'todos', ['todos', 'equipe', 'ninguem']],
        'confirmacao_leitura' => ['bool', true],
        'ultima_vez_online'   => ['bool', true],
        'mensagens_diretas'   => ['enum', 'todos', ['todos', 'equipe', 'ninguem']],
    ],
    'aparencia' => [
        'tema'      => ['enum', 'claro', ['claro', 'escuro', 'automatico']],
        'densidade' => ['enum', 'confortavel', ['confortavel', 'compacta']],
        'fonte'     => ['enum', 'm', ['p', 'm', 'g']],
    ],
    'seguranca' => [
        'duas_etapas'        => ['bool', false],
        'duas_etapas_metodo' => ['enum', 'app', ['app', 'email']],
    ],
    'integracoes' => [
        'calendario'   => ['bool', false],
        'email'        => ['bool', false],
        'armazenamento' => ['bool', false],
    ],
];

function cfg_resposta(int $codigo, array $dados): never
{
    if (!headers_sent()) {
        http_response_code($codigo);
    }
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function cfg_erro(int $codigo, string $mensagem, array $extra = []): never
{
    cfg_resposta($codigo, ['sucesso' => false, 'erro' => $mensagem] + $extra);
}

/**
 * Valida método + sessão + CSRF (métodos que alteram dados).
 * Devolve o id do usuário logado.
 */
function cfg_iniciar(array $metodos, bool $json = true): int
{
    if ($json) {
        header('Content-Type: application/json; charset=utf-8');
    }
    header('Cache-Control: no-store');

    if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', $metodos, true)) {
        cfg_erro(405, 'Método não permitido.');
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    $usuarioId = (int)($_SESSION['usuario_id'] ?? 0);
    if ($usuarioId <= 0) {
        cfg_erro(401, 'Não autenticado.');
    }

    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
        $esperado = (string)($_SESSION['csrf_configuracoes'] ?? '');
        $enviado  = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
        if ($esperado === '' || !hash_equals($esperado, $enviado)) {
            cfg_erro(403, 'Sessão expirada. Recarregue a página e tente de novo.');
        }
    }

    return $usuarioId;
}

/** Corpo JSON da requisição (array vazio se inválido). */
function cfg_corpo(): array
{
    $bruto = file_get_contents('php://input');
    $dados = json_decode($bruto === false ? '' : $bruto, true);
    return is_array($dados) ? $dados : [];
}

/** Só dígitos do telefone → "(11) 98765-4321". */
function cfg_formatar_telefone(string $digitos): string
{
    $d = preg_replace('/\D+/', '', $digitos) ?? '';
    if (strlen($d) === 11) {
        return sprintf('(%s) %s-%s', substr($d, 0, 2), substr($d, 2, 5), substr($d, 7));
    }
    if (strlen($d) === 10) {
        return sprintf('(%s) %s-%s', substr($d, 0, 2), substr($d, 2, 4), substr($d, 6));
    }
    return $d;
}

/** Preferências completas do usuário (padrões + o que está salvo). */
function cfg_carregar_prefs(PDO $pdo, int $usuarioId): array
{
    $salvo = [];
    $stmt = $pdo->prepare('SELECT dados FROM tb_usuario_preferencias WHERE usuario_id = :id');
    $stmt->execute(['id' => $usuarioId]);
    $linha = $stmt->fetch();
    if ($linha) {
        $tmp = json_decode((string)$linha['dados'], true);
        if (is_array($tmp)) {
            $salvo = $tmp;
        }
    }

    $saida = [];
    foreach (CFG_PREFS as $grupo => $campos) {
        foreach ($campos as $chave => $def) {
            $valor = $salvo[$grupo][$chave] ?? null;
            $saida[$grupo][$chave] = cfg_normalizar_valor($def, $valor) ?? $def[1];
        }
    }
    return $saida;
}

/** Valida um valor contra a definição. Devolve null se inválido. */
function cfg_normalizar_valor(array $def, mixed $valor): bool|string|null
{
    switch ($def[0]) {
        case 'bool':
            return is_bool($valor) ? $valor : null;
        case 'hora':
            return is_string($valor) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $valor) ? $valor : null;
        case 'enum':
            return is_string($valor) && in_array($valor, $def[2], true) ? $valor : null;
    }
    return null;
}
