<?php
/**
 * Bootstrap compartilhado pelos endpoints do módulo "Chamadas"
 * (api/chamadas/*). Não é um endpoint: o prefixo "_" indica uso
 * interno (require_once). Mesmo padrão de api/ia/_bootstrap.php.
 *
 * Cuida de: sessão, fuso horário, JSON, autenticação (401), CSRF
 * (403), conexão PDO e das REGRAS DE NEGÓCIO do módulo:
 *   - chamada individual só dentro da mesma equipe;
 *   - chamada com a equipe toda só para gerente, diretor e CEO;
 *   - nada de telefone/discagem externa: tudo por tb_usuarios.id.
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

/** Slugs de equipe (mesmos do menu lateral). */
const CH_EQUIPES = [
    'geral'      => 'Geral',
    'projetos'   => 'Projetos',
    'marketing'  => 'Marketing',
    'rh'         => 'RH',
    'financeiro' => 'Financeiro',
    'ti'         => 'TI',
    'sac'        => 'SAC / Ouvidoria',
];

const CH_CARGOS = [
    'estagiario'   => 'Estagiário',
    'funcionario'  => 'Funcionário',
    'supervisor'   => 'Supervisor',
    'coordenador'  => 'Coordenador',
    'gerente'      => 'Gerente',
    'diretor'      => 'Diretor',
    'ceo'          => 'CEO',
];

/** Cargos que podem chamar/agendar com a equipe toda. */
const CH_CARGOS_EQUIPE = ['gerente', 'diretor', 'ceo'];

const CH_MSG_REGRA_EQUIPE = 'Apenas Diretores, Gerentes e CEO podem chamar a equipe toda.';
const CH_MSG_REGRA_MESMA_EQUIPE = 'Você só pode chamar pessoas da sua equipe.';

/** Segundos sem sinal de vida até o usuário ser considerado offline. */
const CH_SEGUNDOS_OFFLINE = 60;
/** Segundos que uma chamada individual toca antes de virar "perdida". */
const CH_SEGUNDOS_TOCANDO = 45;

const CH_STATUS_ROTULOS = [
    'online'       => 'Online',
    'ausente'      => 'Ausente',
    'offline'      => 'Offline',
    'em_chamada'   => 'Em chamada',
    'nao_perturbe' => 'Não perturbe',
];

function ch_resposta(int $codigo, array $dados): never
{
    if (!headers_sent()) {
        http_response_code($codigo);
    }
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ch_erro(int $codigo, string $mensagem, array $extra = []): never
{
    ch_resposta($codigo, ['sucesso' => false, 'erro' => $mensagem] + $extra);
}

/** Valida método + sessão. Devolve o id do usuário logado. */
function ch_iniciar(array $metodos): int
{
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', $metodos, true)) {
        ch_erro(405, 'Método não permitido.');
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    $usuarioId = (int)($_SESSION['usuario_id'] ?? 0);
    if ($usuarioId <= 0) {
        ch_erro(401, 'Não autenticado.');
    }

    $GLOBALS['ch_csrf_sessao'] = (string)($_SESSION['csrf_chamadas'] ?? '');
    // Libera a sessão: o polling (eventos.php) roda a cada poucos
    // segundos e não pode travar as outras requisições do usuário.
    session_write_close();

    return $usuarioId;
}

/** Confere o CSRF (header X-CSRF-Token ou campo "csrf" do corpo, usado pelo sendBeacon). */
function ch_exigir_csrf(?array $corpo = null): void
{
    $esperado = (string)($GLOBALS['ch_csrf_sessao'] ?? '');
    $recebido = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($recebido === '' && $corpo !== null) {
        $recebido = (string)($corpo['csrf'] ?? '');
    }

    if ($esperado === '' || !hash_equals($esperado, $recebido)) {
        ch_erro(403, 'Requisição inválida. Recarregue a página.');
    }
}

function ch_ler_json(): array
{
    $dados = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($dados)) {
        ch_erro(422, 'Corpo da requisição inválido.');
    }
    return $dados;
}

/** Conexão PDO com o fuso do MySQL alinhado ao do PHP. */
function ch_pdo(): PDO
{
    $pdo = conectar();
    $pdo->exec("SET time_zone = '" . (new DateTimeImmutable('now'))->format('P') . "'");
    return $pdo;
}

function ch_iso(?string $datahora): ?string
{
    return $datahora === null ? null : (new DateTimeImmutable($datahora))->format('c');
}

function ch_inicial(string $nome): string
{
    return mb_strtoupper(mb_substr(trim($nome), 0, 1)) ?: '?';
}

/** Dados do usuário logado (404-safe: se sumiu/inativo, 401). */
function ch_usuario(PDO $pdo, int $id): array
{
    $st = $pdo->prepare('SELECT id, nome, equipe_slug, cargo, status FROM tb_usuarios WHERE id = ? LIMIT 1');
    $st->execute([$id]);
    $u = $st->fetch();
    if (!$u || $u['status'] !== 'ativo') {
        ch_erro(401, 'Usuário inativo ou inexistente.');
    }
    $u['id'] = (int)$u['id'];
    return $u;
}

function ch_pode_chamar_equipe(array $usuario): bool
{
    return in_array((string)$usuario['cargo'], CH_CARGOS_EQUIPE, true);
}

function ch_equipe_nome(?string $slug): string
{
    return $slug !== null && isset(CH_EQUIPES[$slug]) ? CH_EQUIPES[$slug] : 'Sem equipe';
}

/**
 * Status de vários usuários de uma vez: id => online|ausente|offline|em_chamada|nao_perturbe.
 * Offline vem primeiro (sem sinal de vida recente nada mais vale).
 */
function ch_status_de(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_map('intval', $ids)));
    if (!$ids) {
        return [];
    }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $sql = "SELECT u.id, p.estado, p.nao_perturbe,
                   (p.ultimo_ping IS NOT NULL AND TIMESTAMPDIFF(SECOND, p.ultimo_ping, NOW()) < " . CH_SEGUNDOS_OFFLINE . ") AS vivo,
                   EXISTS(SELECT 1 FROM tb_chamadas_participantes cp
                            JOIN tb_chamadas c ON c.id = cp.chamada_id
                           WHERE cp.usuario_id = u.id AND cp.estado = 'na_chamada'
                             AND c.status IN ('tocando','em_andamento')) AS em_chamada
              FROM tb_usuarios u
              LEFT JOIN tb_chamadas_presenca p ON p.usuario_id = u.id
             WHERE u.id IN ($in)";
    $st = $pdo->prepare($sql);
    $st->execute($ids);

    $out = [];
    foreach ($st->fetchAll() as $l) {
        if ((int)$l['vivo'] !== 1)              $s = 'offline';
        elseif ((int)$l['nao_perturbe'] === 1)  $s = 'nao_perturbe';
        elseif ((int)$l['em_chamada'] === 1)    $s = 'em_chamada';
        elseif ($l['estado'] === 'ausente')     $s = 'ausente';
        else                                    $s = 'online';
        $out[(int)$l['id']] = $s;
    }
    return $out;
}

/** Atualiza o "sinal de vida" (heartbeat) do usuário. */
function ch_batida(PDO $pdo, int $uid, string $estado): void
{
    $estado = $estado === 'ausente' ? 'ausente' : 'online';
    $pdo->prepare(
        'INSERT INTO tb_chamadas_presenca (usuario_id, estado, ultimo_ping) VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE estado = VALUES(estado), ultimo_ping = NOW()'
    )->execute([$uid, $estado]);
}

/**
 * Manutenção "preguiçosa" (roda a cada polling): tira da chamada
 * quem fechou o navegador, encerra chamadas vazias, marca como
 * perdidas as que tocaram demais e limpa sinais antigos.
 */
function ch_manutencao(PDO $pdo): void
{
    // 1) Quem sumiu (sem heartbeat) sai da chamada.
    $pdo->exec(
        "UPDATE tb_chamadas_participantes cp
           LEFT JOIN tb_chamadas_presenca p ON p.usuario_id = cp.usuario_id
            SET cp.estado = 'saiu', cp.saiu_em = NOW()
          WHERE cp.estado = 'na_chamada'
            AND (p.usuario_id IS NULL OR p.ultimo_ping < NOW() - INTERVAL " . CH_SEGUNDOS_OFFLINE . " SECOND)"
    );

    // 2) Chamada individual que tocou demais vira "perdida".
    $pdo->exec(
        "UPDATE tb_chamadas SET status = 'perdida', encerrada_em = NOW()
          WHERE tipo = 'individual' AND status = 'tocando'
            AND iniciada_em < NOW() - INTERVAL " . CH_SEGUNDOS_TOCANDO . " SECOND"
    );

    // 3) Chamada da equipe: quem não atendeu vira "convidado" (fica o aviso/convite).
    $pdo->exec(
        "UPDATE tb_chamadas_participantes cp JOIN tb_chamadas c ON c.id = cp.chamada_id
            SET cp.estado = 'convidado'
          WHERE c.tipo = 'equipe' AND c.status = 'em_andamento' AND cp.estado = 'tocando'
            AND c.iniciada_em < NOW() - INTERVAL " . CH_SEGUNDOS_TOCANDO . " SECOND"
    );

    // 4) Chamada ativa sem ninguém dentro termina.
    $pdo->exec(
        "UPDATE tb_chamadas c SET c.status = IF(c.status = 'tocando', 'perdida', 'encerrada'), c.encerrada_em = NOW()
          WHERE c.status IN ('tocando','em_andamento')
            AND NOT EXISTS (SELECT 1 FROM tb_chamadas_participantes cp
                             WHERE cp.chamada_id = c.id AND cp.estado = 'na_chamada')"
    );

    // 5) Chamada terminada: ninguém mais "toca", "convida" ou "está na chamada".
    $pdo->exec(
        "UPDATE tb_chamadas_participantes cp JOIN tb_chamadas c ON c.id = cp.chamada_id
            SET cp.saiu_em = IF(cp.estado = 'na_chamada', NOW(), cp.saiu_em),
                cp.estado  = IF(cp.estado = 'na_chamada', 'saiu', 'perdeu')
          WHERE c.status IN ('encerrada','perdida','recusada')
            AND cp.estado IN ('na_chamada','tocando','convidado')"
    );

    // 6) Sinais WebRTC antigos não servem mais.
    $pdo->exec("DELETE FROM tb_chamadas_sinais WHERE criado_em < NOW() - INTERVAL 15 MINUTE");
}

/** Membros ativos de uma equipe (inclui o próprio usuário). */
function ch_membros_da_equipe(PDO $pdo, string $equipe): array
{
    $st = $pdo->prepare(
        "SELECT id, nome, cargo FROM tb_usuarios WHERE status = 'ativo' AND equipe_slug = ? ORDER BY nome"
    );
    $st->execute([$equipe]);
    return $st->fetchAll();
}

/** Monta o JSON de uma chamada + participantes (para o front). */
function ch_formatar_chamada(PDO $pdo, int $chamadaId): ?array
{
    $st = $pdo->prepare('SELECT * FROM tb_chamadas WHERE id = ? LIMIT 1');
    $st->execute([$chamadaId]);
    $c = $st->fetch();
    if (!$c) {
        return null;
    }

    $sp = $pdo->prepare(
        "SELECT cp.usuario_id, cp.estado, u.nome, u.cargo
           FROM tb_chamadas_participantes cp JOIN tb_usuarios u ON u.id = cp.usuario_id
          WHERE cp.chamada_id = ? ORDER BY u.nome"
    );
    $sp->execute([$chamadaId]);
    $parts = [];
    foreach ($sp->fetchAll() as $p) {
        $parts[] = [
            'id'         => (int)$p['usuario_id'],
            'nome'       => (string)$p['nome'],
            'inicial'    => ch_inicial((string)$p['nome']),
            'cargo_nome' => CH_CARGOS[$p['cargo']] ?? '',
            'estado'     => (string)$p['estado'],
        ];
    }

    $titulo = null;
    if ($c['agendamento_id'] !== null) {
        $t = $pdo->prepare('SELECT titulo FROM tb_chamadas_agendadas WHERE id = ?');
        $t->execute([(int)$c['agendamento_id']]);
        $titulo = $t->fetchColumn() ?: null;
    }

    return [
        'id'           => (int)$c['id'],
        'tipo'         => (string)$c['tipo'],
        'midia'        => (string)$c['midia'],
        'equipe_slug'  => (string)$c['equipe_slug'],
        'equipe_nome'  => ch_equipe_nome((string)$c['equipe_slug']),
        'iniciador_id' => (int)$c['iniciador_id'],
        'titulo'       => $titulo,
        'status'       => (string)$c['status'],
        'iniciada_em'  => ch_iso((string)$c['iniciada_em']),
        'atendida_em'  => ch_iso($c['atendida_em'] !== null ? (string)$c['atendida_em'] : null),
        'encerrada_em' => ch_iso($c['encerrada_em'] !== null ? (string)$c['encerrada_em'] : null),
        'participantes' => $parts,
    ];
}
