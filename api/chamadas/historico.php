<?php
/**
 * GET api/chamadas/historico.php — Histórico de chamadas.
 *
 * Parâmetros (todos opcionais):
 *   escopo     todas (padrão) | contato | equipe
 *   usuario_id (escopo=contato) só as chamadas individuais entre você e essa pessoa
 *   equipe     (escopo=equipe)  slug da equipe — só as chamadas da equipe
 *   filtro     todas (padrão) | recebidas | realizadas | perdidas
 *   busca      nome da pessoa, título da reunião ou quem iniciou
 *   limite     1..50 (padrão 15)        offset  (padrão 0)
 *
 * Regras:
 *   - "todas" e "contato": só aparecem chamadas em que você participou.
 *   - "equipe": só para membros da equipe (ou Administrador). Chamadas
 *     instantâneas da equipe aparecem para todos os membros; reuniões
 *     agendadas só para quem foi convidado.
 *   - "perdidas" = chamadas RECEBIDAS que você não atendeu nem recusou.
 *
 * Não grava nada. Usa só as tabelas que o módulo já tinha
 * (tb_chamadas e tb_chamadas_participantes).
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$uid = ch_iniciar(['GET']);

/** true se o usuário pertence à equipe (principal, pedido aceito) ou é o Administrador. */
function ch_e_membro_da_equipe(PDO $pdo, int $uid, string $slug): bool
{
    if (ch_e_super_admin($uid)) {
        return true;
    }
    $st = $pdo->prepare("SELECT equipe_slug FROM tb_usuarios WHERE id = ? AND status = 'ativo' LIMIT 1");
    $st->execute([$uid]);
    $principal = $st->fetchColumn();
    if ($principal === false) {
        return false;
    }
    if ((string)$principal === $slug) {
        return true;
    }
    try {
        $st = $pdo->prepare(
            "SELECT 1 FROM tb_equipes_membros WHERE equipe_slug = ? AND usuario_id = ? AND origem = 'solicitacao' LIMIT 1"
        );
        $st->execute([$slug, $uid]);
        return (bool)$st->fetchColumn();
    } catch (PDOException $e) {
        return false; // tabela de equipes ainda não criada: vale só a equipe principal
    }
}

/**
 * O PDO deste projeto roda com EMULATE_PREPARES desligado, e o MySQL nativo não aceita o
 * mesmo ":nome" mais de uma vez na consulta. Aqui cada repetição vira ":nome__2", ":nome__3"…
 * com o mesmo valor, e a consulta é executada já pronta.
 */
function ch_executar(PDO $pdo, string $sql, array $params): PDOStatement
{
    $vezes = [];
    $novos = [];
    $sql = (string)preg_replace_callback('/:([A-Za-z_][A-Za-z0-9_]*)/', static function (array $m) use (&$vezes, &$novos, $params): string {
        $nome = $m[1];
        if (!array_key_exists($nome, $params)) {
            return $m[0];
        }
        $vezes[$nome] = ($vezes[$nome] ?? 0) + 1;
        $chave = $vezes[$nome] === 1 ? $nome : $nome . '__' . $vezes[$nome];
        $novos[$chave] = $params[$nome];
        return ':' . $chave;
    }, $sql);

    $st = $pdo->prepare($sql);
    $st->execute($novos);
    return $st;
}

/** Segundos entre dois DATETIME (ou null). */
function ch_segundos(?string $de, ?string $ate): ?int
{
    if ($de === null || $ate === null) {
        return null;
    }
    $d = (new DateTimeImmutable($ate))->getTimestamp() - (new DateTimeImmutable($de))->getTimestamp();
    return $d >= 0 ? $d : null;
}

try {
    $pdo = ch_pdo();
    $eu = ch_usuario($pdo, $uid);
    ch_manutencao($pdo); // fecha chamadas penduradas antes de listar

    $escopo = (string)($_GET['escopo'] ?? 'todas');
    if (!in_array($escopo, ['todas', 'contato', 'equipe'], true)) {
        $escopo = 'todas';
    }
    $filtro = (string)($_GET['filtro'] ?? 'todas');
    if (!in_array($filtro, ['todas', 'recebidas', 'realizadas', 'perdidas'], true)) {
        $filtro = 'todas';
    }
    $limite = max(1, min(50, (int)($_GET['limite'] ?? 15)));
    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $busca = trim((string)($_GET['busca'] ?? ''));
    if (mb_strlen($busca) > 60) {
        $busca = mb_substr($busca, 0, 60);
    }

    // ---- Escopo -> JOIN + condições base ----
    $join = 'JOIN tb_chamadas_participantes me ON me.chamada_id = c.id AND me.usuario_id = :uid';
    $where = [];
    $params = ['uid' => $uid];

    if ($escopo === 'contato') {
        $outro = (int)($_GET['usuario_id'] ?? 0);
        if ($outro <= 0 || $outro === $uid) {
            ch_erro(422, 'Contato inválido.');
        }
        $where[] = "c.tipo = 'individual'";
        $where[] = 'EXISTS (SELECT 1 FROM tb_chamadas_participantes po WHERE po.chamada_id = c.id AND po.usuario_id = :outro)';
        $params['outro'] = $outro;
    } elseif ($escopo === 'equipe') {
        $slug = strtolower(trim((string)($_GET['equipe'] ?? '')));
        if (!isset(CH_EQUIPES[$slug])) {
            ch_erro(422, 'Equipe inválida.');
        }
        if (!ch_e_membro_da_equipe($pdo, $uid, $slug)) {
            ch_erro(403, 'Você não faz parte desta equipe.');
        }
        // Equipe: quem é membro enxerga as chamadas instantâneas mesmo sem ter sido
        // convidado na hora; reunião agendada só para os convidados.
        $join = 'LEFT JOIN tb_chamadas_participantes me ON me.chamada_id = c.id AND me.usuario_id = :uid';
        $where[] = "c.tipo = 'equipe'";
        $where[] = 'c.equipe_slug = :slug';
        $where[] = '(me.usuario_id IS NOT NULL OR c.agendamento_id IS NULL)';
        $params['slug'] = $slug;
    }

    $from = "FROM tb_chamadas c
             $join
             JOIN tb_usuarios ini ON ini.id = c.iniciador_id
             LEFT JOIN tb_chamadas_agendadas ag ON ag.id = c.agendamento_id";

    // ---- Expressões reutilizadas pelos filtros e pelos contadores ----
    $ehRecebida = 'c.iniciador_id <> :uid';
    $ehRealizada = 'c.iniciador_id = :uid';
    $ehPerdida = "(c.iniciador_id <> :uid AND me.usuario_id IS NOT NULL AND me.entrou_em IS NULL
                   AND me.estado IN ('perdeu','convidado','tocando'))";

    // ---- Contadores dos chips (respeitam escopo e busca, não o filtro) ----
    $whereBusca = $where;
    $paramsBusca = $params;
    if ($busca !== '') {
        $whereBusca[] = "(ini.nome LIKE :q1 OR ag.titulo LIKE :q2
                          OR EXISTS (SELECT 1 FROM tb_chamadas_participantes px
                                       JOIN tb_usuarios ux ON ux.id = px.usuario_id
                                      WHERE px.chamada_id = c.id AND px.usuario_id <> :uid AND ux.nome LIKE :q3))";
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $busca) . '%';
        $paramsBusca += ['q1' => $like, 'q2' => $like, 'q3' => $like];
    }
    $sqlBase = $whereBusca ? 'WHERE ' . implode(' AND ', $whereBusca) : '';

    $st = ch_executar(
        $pdo,
        "SELECT COUNT(*) AS todas,
                COALESCE(SUM($ehRecebida), 0)  AS recebidas,
                COALESCE(SUM($ehRealizada), 0) AS realizadas,
                COALESCE(SUM($ehPerdida), 0)   AS perdidas
           $from $sqlBase",
        $paramsBusca
    );
    $c = $st->fetch() ?: [];
    $contagens = [
        'todas'      => (int)($c['todas'] ?? 0),
        'recebidas'  => (int)($c['recebidas'] ?? 0),
        'realizadas' => (int)($c['realizadas'] ?? 0),
        'perdidas'   => (int)($c['perdidas'] ?? 0),
    ];

    // ---- Lista (aplica o filtro escolhido) ----
    $whereLista = $whereBusca;
    if ($filtro === 'recebidas') {
        $whereLista[] = $ehRecebida;
    } elseif ($filtro === 'realizadas') {
        $whereLista[] = $ehRealizada;
    } elseif ($filtro === 'perdidas') {
        $whereLista[] = $ehPerdida;
    }
    $sqlLista = $whereLista ? 'WHERE ' . implode(' AND ', $whereLista) : '';

    $st = ch_executar(
        $pdo,
        "SELECT c.id, c.tipo, c.midia, c.equipe_slug, c.iniciador_id, c.agendamento_id, c.status,
                c.iniciada_em, c.atendida_em, c.encerrada_em,
                me.usuario_id AS sou_participante, me.estado AS meu_estado,
                me.entrou_em AS meu_entrou, me.saiu_em AS meu_saiu,
                ini.nome AS ini_nome, ag.titulo AS ag_titulo,
                (SELECT COUNT(*) FROM tb_chamadas_participantes p
                  WHERE p.chamada_id = c.id AND p.entrou_em IS NOT NULL) AS qtd_entraram,
                (SELECT COUNT(*) FROM tb_chamadas_participantes p WHERE p.chamada_id = c.id) AS qtd_convidados
           $from $sqlLista
          ORDER BY c.iniciada_em DESC, c.id DESC
          LIMIT " . ($limite + 1) . " OFFSET " . $offset,
        $paramsBusca
    );
    $linhas = $st->fetchAll();

    $temMais = count($linhas) > $limite;
    if ($temMais) {
        array_pop($linhas);
    }

    // ---- A outra pessoa das chamadas individuais ----
    $outros = [];
    $idsIndividuais = [];
    foreach ($linhas as $l) {
        if ($l['tipo'] === 'individual') {
            $idsIndividuais[] = (int)$l['id'];
        }
    }
    if ($idsIndividuais) {
        $in = implode(',', array_fill(0, count($idsIndividuais), '?'));
        $so = $pdo->prepare(
            "SELECT cp.chamada_id, u.id, u.nome, u.cargo, u.status
               FROM tb_chamadas_participantes cp JOIN tb_usuarios u ON u.id = cp.usuario_id
              WHERE cp.chamada_id IN ($in) AND cp.usuario_id <> ?"
        );
        $so->execute(array_merge($idsIndividuais, [$uid]));
        foreach ($so->fetchAll() as $o) {
            $outros[(int)$o['chamada_id']] = $o;
        }
    }

    // ---- Monta o JSON ----
    $itens = [];
    foreach ($linhas as $l) {
        $souIniciador = (int)$l['iniciador_id'] === $uid;
        $entrou = $l['meu_entrou'] !== null;
        $status = (string)$l['status'];
        $meuEstado = $l['meu_estado'] !== null ? (string)$l['meu_estado'] : null;
        $individual = $l['tipo'] === 'individual';

        // resultado: atendida | em_andamento | perdida | recusada | sem_resposta | sem_participacao
        if (in_array($status, ['tocando', 'em_andamento'], true)) {
            $resultado = 'em_andamento';
        } elseif ($souIniciador) {
            $resultado = $individual
                ? ($status === 'perdida' ? 'sem_resposta' : ($status === 'recusada' ? 'recusada' : 'atendida'))
                : 'atendida';
        } elseif ($l['sou_participante'] === null) {
            $resultado = 'sem_participacao';
        } elseif ($entrou) {
            $resultado = 'atendida';
        } elseif ($meuEstado === 'recusou') {
            $resultado = 'recusada';
        } else {
            $resultado = 'perdida';
        }

        // Duração: individual = da hora em que atendeu até o fim (sem o toque);
        // equipe = o tempo em que VOCÊ ficou dentro.
        if ($individual) {
            $duracao = ch_segundos($l['atendida_em'], $l['encerrada_em']);
        } else {
            $duracao = $entrou
                ? ch_segundos((string)$l['meu_entrou'], $l['meu_saiu'] ?? $l['encerrada_em'])
                : null;
        }
        if ($resultado === 'em_andamento') {
            $duracao = null;
        }

        $o = $individual ? ($outros[(int)$l['id']] ?? null) : null;
        $outroJson = $o ? [
            'id'         => (int)$o['id'],
            'nome'       => (string)$o['nome'],
            'inicial'    => ch_inicial((string)$o['nome']),
            'cargo_nome' => CH_CARGOS[$o['cargo']] ?? '',
            'ativo'      => $o['status'] === 'ativo',
        ] : null;

        $itens[] = [
            'id'              => (int)$l['id'],
            'tipo'            => (string)$l['tipo'],
            'midia'           => (string)$l['midia'],
            'direcao'         => $souIniciador ? 'realizada' : 'recebida',
            'resultado'       => $resultado,
            'titulo'          => $l['ag_titulo'] !== null ? (string)$l['ag_titulo'] : null,
            'equipe_slug'     => (string)$l['equipe_slug'],
            'equipe_nome'     => ch_equipe_nome((string)$l['equipe_slug']),
            'iniciador_id'    => (int)$l['iniciador_id'],
            'iniciador_nome'  => (string)$l['ini_nome'],
            'outro'           => $outroJson,
            'entraram'        => (int)$l['qtd_entraram'],
            'convidados'      => (int)$l['qtd_convidados'],
            'iniciada_em'     => ch_iso((string)$l['iniciada_em']),
            'duracao_seg'     => $duracao,
            'pode_ligar'      => $individual ? ($outroJson !== null && $outroJson['ativo']) : true,
        ];
    }

    ch_resposta(200, [
        'sucesso'   => true,
        'itens'     => $itens,
        'tem_mais'  => $temMais,
        'proximo'   => $offset + count($itens),
        'contagens' => $contagens,
    ]);
} catch (PDOException $e) {
    ch_erro(500, 'Erro ao consultar o banco de dados.');
}
