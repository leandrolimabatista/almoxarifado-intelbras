<?php
/**
 * Bootstrap compartilhado pelos endpoints do módulo "Agendar reunião".
 * Não é um endpoint: o prefixo "_" indica apenas uso interno (require_once).
 *
 * Cuida da parte HTTP: sessão, fuso horário, JSON, autenticação (401),
 * CSRF (403) e conexão PDO (reaproveita api/conexao.php).
 * Mesmo padrão de api/documentos/_bootstrap.php, mas independente dele.
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

/** Slugs de equipe aceitos (mesmos do menu lateral / demais módulos). */
const REU_EQUIPES = [
    'geral'      => 'Geral',
    'projetos'   => 'Projetos',
    'marketing'  => 'Marketing',
    'rh'         => 'RH',
    'financeiro' => 'Financeiro',
    'ti'         => 'TI',
    'sac'        => 'SAC / Ouvidoria',
];

/** Cargos (mesmos de tb_usuarios.cargo). */
const REU_CARGOS = [
    'estagiario'  => 'Estagiário',
    'funcionario' => 'Funcionário',
    'supervisor'  => 'Supervisor',
    'coordenador' => 'Coordenador',
    'gerente'     => 'Gerente',
    'diretor'     => 'Diretor',
    'ceo'         => 'CEO',
];

/**
 * Fusos aceitos (identificador IANA => rótulo). Tem que ficar igual à lista
 * usada pelo dropdown em conteudo/cadastrado/agendar-reuniao/js/agendar-reuniao.js.
 */
const REU_FUSOS = [
    'America/Sao_Paulo'   => '(GMT-03:00) Brasília',
    'America/Noronha'     => '(GMT-02:00) Fernando de Noronha',
    'America/Manaus'      => '(GMT-04:00) Manaus',
    'America/Cuiaba'      => '(GMT-04:00) Cuiabá',
    'America/Rio_Branco'  => '(GMT-05:00) Rio Branco',
    'America/Argentina/Buenos_Aires' => '(GMT-03:00) Buenos Aires',
    'America/Santiago'    => '(GMT-04:00) Santiago',
    'America/Bogota'      => '(GMT-05:00) Bogotá',
    'America/Mexico_City' => '(GMT-06:00) Cidade do México',
    'America/New_York'    => '(GMT-05:00) Nova York',
    'America/Los_Angeles' => '(GMT-08:00) Los Angeles',
    'UTC'                 => '(GMT+00:00) UTC',
    'Europe/Lisbon'       => '(GMT+00:00) Lisboa',
    'Europe/London'       => '(GMT+00:00) Londres',
    'Europe/Madrid'       => '(GMT+01:00) Madri',
    'Europe/Paris'        => '(GMT+01:00) Paris',
    'Asia/Dubai'          => '(GMT+04:00) Dubai',
    'Asia/Kolkata'        => '(GMT+05:30) Nova Délhi',
    'Asia/Shanghai'       => '(GMT+08:00) Xangai',
    'Asia/Tokyo'          => '(GMT+09:00) Tóquio',
];

/** Envia a resposta JSON e encerra. */
function reu_resposta(int $codigo, array $dados): never
{
    if (!headers_sent()) {
        http_response_code($codigo);
    }
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Erro simples; $campos (opcional) leva mensagens por campo para o formulário. */
function reu_erro(int $codigo, string $mensagem, array $campos = []): never
{
    $dados = ['sucesso' => false, 'erro' => $mensagem];
    if ($campos) {
        $dados['campos'] = $campos;
    }
    reu_resposta($codigo, $dados);
}

/**
 * Trata falha de banco: registra no log do PHP e responde 500.
 * Se for "tabela não existe" (SQLSTATE 42S02), avisa que falta rodar o SQL.
 */
function reu_erro_banco(PDOException $e, string $contexto): never
{
    error_log('[reunioes/' . $contexto . '] ' . $e->getMessage());

    if ((string)$e->getCode() === '42S02') {
        reu_erro(500, 'As tabelas de reuniões ainda não existem. Execute database/reunioes.sql no phpMyAdmin.');
    }
    reu_erro(500, 'Erro ao consultar o banco de dados.');
}

/**
 * Valida método + sessão e devolve o id do usuário logado.
 * A sessão é liberada logo em seguida (session_write_close).
 */
function reu_iniciar(array $metodos): int
{
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', $metodos, true)) {
        reu_erro(405, 'Método não permitido.');
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    $usuarioId = (int)($_SESSION['usuario_id'] ?? 0);
    if ($usuarioId <= 0) {
        reu_erro(401, 'Não autenticado.');
    }

    $GLOBALS['reu_csrf_sessao'] = (string)($_SESSION['csrf_reunioes'] ?? '');
    session_write_close();

    return $usuarioId;
}

/** Confere o token CSRF enviado no header X-CSRF-Token (endpoints POST). */
function reu_exigir_csrf(): void
{
    $esperado = (string)($GLOBALS['reu_csrf_sessao'] ?? '');
    $recebido = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');

    if ($esperado === '' || !hash_equals($esperado, $recebido)) {
        reu_erro(403, 'Requisição inválida. Recarregue a página.');
    }
}

/** Lê o corpo JSON da requisição (422 se inválido). */
function reu_ler_json(): array
{
    $dados = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($dados)) {
        reu_erro(422, 'Corpo da requisição inválido.');
    }
    return $dados;
}

/** Conexão PDO com o fuso do MySQL alinhado ao do PHP (America/Sao_Paulo). */
function reu_pdo(): PDO
{
    $pdo = conectar();
    $offset = (new DateTimeImmutable('now'))->format('P'); // ex.: -03:00
    $pdo->exec("SET time_zone = '" . $offset . "'");
    return $pdo;
}

/** Iniciais para o avatar ("Ana Souza" -> "AS"; nome único -> 1 letra). */
function reu_iniciais(string $nome): string
{
    $partes = preg_split('/\s+/u', trim($nome)) ?: [];
    $partes = array_values(array_filter($partes, static fn ($p) => $p !== ''));
    if (!$partes) {
        return '?';
    }
    $primeira = mb_strtoupper(mb_substr($partes[0], 0, 1));
    if (count($partes) === 1) {
        return $primeira;
    }
    return $primeira . mb_strtoupper(mb_substr($partes[count($partes) - 1], 0, 1));
}
