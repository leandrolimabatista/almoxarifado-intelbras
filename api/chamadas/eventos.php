<?php
/**
 * GET api/chamadas/eventos.php?estado=online|ausente[&chamada_id=N&ultimo_sinal=N&ultima_msg=N]
 *
 * Endpoint de polling (o front chama a cada poucos segundos). Faz:
 *   - heartbeat de presença (sem ele o usuário aparece Offline);
 *   - devolve as chamadas RECEBIDAS (toast Atender/Recusar ou convite);
 *   - se chamada_id vier: estado da chamada, sinais WebRTC novos
 *     endereçados ao usuário e mensagens novas do chat da chamada.
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$uid = ch_iniciar(['GET']);

try {
    $pdo = ch_pdo();
    $eu = ch_usuario($pdo, $uid);
    ch_batida($pdo, $uid, (string)($_GET['estado'] ?? 'online'));
    ch_manutencao($pdo);

    $resp = ['sucesso' => true, 'recebidas' => []];

    // ---- Chamadas recebidas (toque) e convites (aviso) ----
    $st = $pdo->prepare(
        "SELECT c.id, c.tipo, c.midia, c.equipe_slug, c.iniciador_id, c.agendamento_id, cp.estado,
                u.nome AS de_nome, a.titulo AS ag_titulo
           FROM tb_chamadas_participantes cp
           JOIN tb_chamadas c ON c.id = cp.chamada_id
           JOIN tb_usuarios u ON u.id = c.iniciador_id
           LEFT JOIN tb_chamadas_agendadas a ON a.id = c.agendamento_id
          WHERE cp.usuario_id = ? AND cp.estado IN ('tocando','convidado')
            AND c.status IN ('tocando','em_andamento')
            AND c.iniciada_em > NOW() - INTERVAL 4 HOUR
          ORDER BY c.id DESC LIMIT 5"
    );
    $st->execute([$uid]);
    foreach ($st->fetchAll() as $r) {
        $resp['recebidas'][] = [
            'chamada_id'  => (int)$r['id'],
            'tipo'        => (string)$r['tipo'],
            'midia'       => (string)$r['midia'],
            'aviso'       => $r['estado'] === 'convidado',
            'de_id'       => (int)$r['iniciador_id'],
            'de_nome'     => (string)$r['de_nome'],
            'de_inicial'  => ch_inicial((string)$r['de_nome']),
            'equipe_nome' => ch_equipe_nome((string)$r['equipe_slug']),
            'titulo'      => $r['ag_titulo'] !== null ? (string)$r['ag_titulo'] : null,
        ];
    }

    // ---- Chamada em que o usuário está ----
    $chamadaId = (int)($_GET['chamada_id'] ?? 0);
    if ($chamadaId > 0) {
        $chk = $pdo->prepare('SELECT 1 FROM tb_chamadas_participantes WHERE chamada_id = ? AND usuario_id = ?');
        $chk->execute([$chamadaId, $uid]);
        if ($chk->fetchColumn()) {
            $resp['chamada'] = ch_formatar_chamada($pdo, $chamadaId);

            $ultimoSinal = (int)($_GET['ultimo_sinal'] ?? 0);
            $ss = $pdo->prepare(
                'SELECT id, de_id, tipo, payload FROM tb_chamadas_sinais
                  WHERE chamada_id = ? AND para_id = ? AND id > ? ORDER BY id LIMIT 100'
            );
            $ss->execute([$chamadaId, $uid, $ultimoSinal]);
            $resp['sinais'] = array_map(static fn(array $s): array => [
                'id'      => (int)$s['id'],
                'de_id'   => (int)$s['de_id'],
                'tipo'    => (string)$s['tipo'],
                'payload' => (string)$s['payload'],
            ], $ss->fetchAll());

            $ultimaMsg = (int)($_GET['ultima_msg'] ?? 0);
            $sm = $pdo->prepare(
                'SELECT m.id, m.usuario_id, m.texto, m.criada_em, u.nome
                   FROM tb_chamadas_mensagens m JOIN tb_usuarios u ON u.id = m.usuario_id
                  WHERE m.chamada_id = ? AND m.id > ? ORDER BY m.id LIMIT 100'
            );
            $sm->execute([$chamadaId, $ultimaMsg]);
            $resp['mensagens'] = array_map(static fn(array $m): array => [
                'id'         => (int)$m['id'],
                'usuario_id' => (int)$m['usuario_id'],
                'nome'       => (string)$m['nome'],
                'texto'      => (string)$m['texto'],
                'criada_em'  => ch_iso((string)$m['criada_em']),
            ], $sm->fetchAll());
        }
    }

    ch_resposta(200, $resp);
} catch (PDOException $e) {
    ch_erro(500, 'Erro ao consultar o banco de dados.');
}
