<?php
/**
 * POST api/chamadas/chamada.php   (corpo JSON, header X-CSRF-Token)
 *
 *   { "acao": "iniciar", "tipo": "individual", "alvo_id": 7, "midia": "voz|video" }
 *   { "acao": "iniciar", "tipo": "equipe", "midia": "voz|video" }   // só gerente/diretor/CEO
 *   { "acao": "atender", "chamada_id": 12 }    // atender chamada ou entrar num convite
 *   { "acao": "recusar", "chamada_id": 12 }    // recusar / dispensar convite
 *   { "acao": "sair",    "chamada_id": 12 }    // encerrar a própria participação
 *   { "acao": "entrar_agendada", "agendamento_id": 3 }
 *
 * Resposta de sucesso: { sucesso: true, chamada: {...} }.
 * Erros de negócio: 403 (regra de equipe/cargo), 409 (indisponível,
 * com "motivo": offline | nao_perturbe | em_chamada | voce_em_chamada).
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$uid = ch_iniciar(['POST']);
$corpo = ch_ler_json();
ch_exigir_csrf($corpo);

$acao = (string)($corpo['acao'] ?? '');
$midia = (($corpo['midia'] ?? 'video') === 'voz') ? 'voz' : 'video';

/** true se o usuário já está dentro de alguma chamada ativa. */
function ch_em_chamada(PDO $pdo, int $uid, int $exceto = 0): bool
{
    $st = $pdo->prepare(
        "SELECT 1 FROM tb_chamadas_participantes cp JOIN tb_chamadas c ON c.id = cp.chamada_id
          WHERE cp.usuario_id = ? AND cp.estado = 'na_chamada' AND c.status IN ('tocando','em_andamento')
            AND c.id <> ? LIMIT 1"
    );
    $st->execute([$uid, $exceto]);
    return (bool)$st->fetchColumn();
}

/** Coloca (ou recoloca) o usuário dentro da chamada. */
function ch_entrar(PDO $pdo, int $chamadaId, int $uid): void
{
    // Sinais de uma participação anterior (reentrada) não valem mais.
    $pdo->prepare('DELETE FROM tb_chamadas_sinais WHERE chamada_id = ? AND (de_id = ? OR para_id = ?)')
        ->execute([$chamadaId, $uid, $uid]);
    $pdo->prepare(
        "INSERT INTO tb_chamadas_participantes (chamada_id, usuario_id, estado, entrou_em)
         VALUES (?, ?, 'na_chamada', NOW())
         ON DUPLICATE KEY UPDATE estado = 'na_chamada', entrou_em = NOW(), saiu_em = NULL"
    )->execute([$chamadaId, $uid]);
}

/** Busca a chamada e garante que o usuário faz parte dela. */
function ch_chamada_do_usuario(PDO $pdo, int $chamadaId, int $uid): array
{
    $st = $pdo->prepare(
        "SELECT c.*, cp.estado AS meu_estado
           FROM tb_chamadas c JOIN tb_chamadas_participantes cp ON cp.chamada_id = c.id AND cp.usuario_id = ?
          WHERE c.id = ? LIMIT 1"
    );
    $st->execute([$uid, $chamadaId]);
    $c = $st->fetch();
    if (!$c) {
        ch_erro(404, 'Chamada não encontrada.');
    }
    return $c;
}

try {
    $pdo = ch_pdo();
    $eu = ch_usuario($pdo, $uid);
    $equipe = (string)($eu['equipe_slug'] ?? '');
    ch_batida($pdo, $uid, 'online');
    ch_manutencao($pdo);

    // ------------------------------------------------------------
    if ($acao === 'iniciar') {
        $tipo = (string)($corpo['tipo'] ?? '');
        if ($equipe === '') {
            ch_erro(403, 'Você ainda não pertence a uma equipe.');
        }
        if (ch_em_chamada($pdo, $uid)) {
            ch_erro(409, 'Você já está em uma chamada.', ['motivo' => 'voce_em_chamada']);
        }

        if ($tipo === 'individual') {
            $alvoId = (int)($corpo['alvo_id'] ?? 0);
            $st = $pdo->prepare("SELECT id, nome, equipe_slug FROM tb_usuarios WHERE id = ? AND status = 'ativo' LIMIT 1");
            $st->execute([$alvoId]);
            $alvo = $st->fetch();
            if (!$alvo || $alvoId === $uid) {
                ch_erro(404, 'Contato não encontrado.');
            }
            // REGRA 1: só chama quem é da mesma equipe.
            if ((string)$alvo['equipe_slug'] !== $equipe) {
                ch_erro(403, CH_MSG_REGRA_MESMA_EQUIPE);
            }
            $s = ch_status_de($pdo, [$alvoId])[$alvoId] ?? 'offline';
            if ($s === 'offline' || $s === 'nao_perturbe' || $s === 'em_chamada') {
                $msg = [
                    'offline'      => $alvo['nome'] . ' está offline no momento.',
                    'nao_perturbe' => $alvo['nome'] . ' está em modo Não perturbe.',
                    'em_chamada'   => $alvo['nome'] . ' está em outra chamada.',
                ][$s];
                ch_erro(409, $msg, ['motivo' => $s, 'nome' => (string)$alvo['nome']]);
            }

            $pdo->beginTransaction();
            $pdo->prepare("INSERT INTO tb_chamadas (tipo, midia, equipe_slug, iniciador_id, status) VALUES ('individual', ?, ?, ?, 'tocando')")
                ->execute([$midia, $equipe, $uid]);
            $chamadaId = (int)$pdo->lastInsertId();
            ch_entrar($pdo, $chamadaId, $uid);
            $pdo->prepare("INSERT INTO tb_chamadas_participantes (chamada_id, usuario_id, estado) VALUES (?, ?, 'tocando')")
                ->execute([$chamadaId, $alvoId]);
            $pdo->commit();

            ch_resposta(200, ['sucesso' => true, 'chamada' => ch_formatar_chamada($pdo, $chamadaId)]);
        }

        if ($tipo === 'equipe') {
            // REGRA 2: só Diretor, Gerente e CEO.
            if (!ch_pode_chamar_equipe($eu)) {
                ch_erro(403, CH_MSG_REGRA_EQUIPE);
            }

            // Já existe uma chamada de equipe em andamento? Entra nela em vez de duplicar.
            $st = $pdo->prepare(
                "SELECT id FROM tb_chamadas WHERE tipo = 'equipe' AND equipe_slug = ? AND agendamento_id IS NULL
                    AND status = 'em_andamento' ORDER BY id DESC LIMIT 1"
            );
            $st->execute([$equipe]);
            $existente = (int)$st->fetchColumn();
            if ($existente > 0) {
                ch_entrar($pdo, $existente, $uid);
                ch_resposta(200, ['sucesso' => true, 'chamada' => ch_formatar_chamada($pdo, $existente)]);
            }

            $membros = ch_membros_da_equipe($pdo, $equipe);
            $status = ch_status_de($pdo, array_column($membros, 'id'));

            $pdo->beginTransaction();
            $pdo->prepare(
                "INSERT INTO tb_chamadas (tipo, midia, equipe_slug, iniciador_id, status, atendida_em)
                 VALUES ('equipe', ?, ?, ?, 'em_andamento', NOW())"
            )->execute([$midia, $equipe, $uid]);
            $chamadaId = (int)$pdo->lastInsertId();
            ch_entrar($pdo, $chamadaId, $uid);

            // REGRA 5: membros online tocam; os demais recebem convite/aviso.
            $ins = $pdo->prepare('INSERT INTO tb_chamadas_participantes (chamada_id, usuario_id, estado) VALUES (?, ?, ?)');
            foreach ($membros as $m) {
                $id = (int)$m['id'];
                if ($id === $uid) {
                    continue;
                }
                $s = $status[$id] ?? 'offline';
                $ins->execute([$chamadaId, $id, in_array($s, ['online', 'ausente', 'em_chamada'], true) ? 'tocando' : 'convidado']);
            }
            $pdo->commit();

            ch_resposta(200, ['sucesso' => true, 'chamada' => ch_formatar_chamada($pdo, $chamadaId)]);
        }

        ch_erro(422, 'Tipo de chamada inválido.');
    }

    // ------------------------------------------------------------
    if ($acao === 'atender') {
        $chamadaId = (int)($corpo['chamada_id'] ?? 0);
        $c = ch_chamada_do_usuario($pdo, $chamadaId, $uid);
        if (!in_array($c['status'], ['tocando', 'em_andamento'], true)) {
            ch_erro(410, 'Essa chamada já foi encerrada.', ['motivo' => 'encerrada']);
        }
        if (ch_em_chamada($pdo, $uid, $chamadaId)) {
            ch_erro(409, 'Você já está em uma chamada.', ['motivo' => 'voce_em_chamada']);
        }
        ch_entrar($pdo, $chamadaId, $uid);
        if ($c['status'] === 'tocando') {
            $pdo->prepare("UPDATE tb_chamadas SET status = 'em_andamento', atendida_em = NOW() WHERE id = ?")->execute([$chamadaId]);
        }
        ch_resposta(200, ['sucesso' => true, 'chamada' => ch_formatar_chamada($pdo, $chamadaId)]);
    }

    // ------------------------------------------------------------
    if ($acao === 'recusar') {
        $chamadaId = (int)($corpo['chamada_id'] ?? 0);
        $c = ch_chamada_do_usuario($pdo, $chamadaId, $uid);
        $pdo->prepare("UPDATE tb_chamadas_participantes SET estado = 'recusou', saiu_em = NOW()
                        WHERE chamada_id = ? AND usuario_id = ? AND estado IN ('tocando','convidado')")
            ->execute([$chamadaId, $uid]);
        if ($c['tipo'] === 'individual' && $c['status'] === 'tocando') {
            $pdo->prepare("UPDATE tb_chamadas SET status = 'recusada', encerrada_em = NOW() WHERE id = ?")->execute([$chamadaId]);
        }
        ch_resposta(200, ['sucesso' => true]);
    }

    // ------------------------------------------------------------
    if ($acao === 'sair') {
        $chamadaId = (int)($corpo['chamada_id'] ?? 0);
        $c = ch_chamada_do_usuario($pdo, $chamadaId, $uid);
        $pdo->prepare("UPDATE tb_chamadas_participantes SET estado = 'saiu', saiu_em = NOW()
                        WHERE chamada_id = ? AND usuario_id = ? AND estado = 'na_chamada'")
            ->execute([$chamadaId, $uid]);
        // Individual: quando um sai, a chamada acaba para os dois.
        // Equipe: a manutenção encerra sozinha quando o último sai.
        if ($c['tipo'] === 'individual') {
            $novo = $c['status'] === 'tocando' ? 'perdida' : 'encerrada';
            $pdo->prepare("UPDATE tb_chamadas SET status = ?, encerrada_em = NOW() WHERE id = ? AND status IN ('tocando','em_andamento')")
                ->execute([$novo, $chamadaId]);
        }
        ch_manutencao($pdo);
        ch_resposta(200, ['sucesso' => true, 'chamada' => ch_formatar_chamada($pdo, $chamadaId)]);
    }

    // ------------------------------------------------------------
    if ($acao === 'entrar_agendada') {
        $agId = (int)($corpo['agendamento_id'] ?? 0);
        $st = $pdo->prepare(
            "SELECT a.*, (a.criador_id = :u OR EXISTS (SELECT 1 FROM tb_chamadas_agendadas_participantes p WHERE p.agendamento_id = a.id AND p.usuario_id = :u)
                          OR (a.toda_equipe = 1 AND a.equipe_slug = :eq)) AS convidado
               FROM tb_chamadas_agendadas a WHERE a.id = :id AND a.cancelada_em IS NULL LIMIT 1"
        );
        $st->execute(['u' => $uid, 'eq' => $equipe, 'id' => $agId]);
        $ag = $st->fetch();
        if (!$ag || (int)$ag['convidado'] !== 1) {
            ch_erro(404, 'Reunião não encontrada.');
        }
        $ini = new DateTimeImmutable((string)$ag['data_hora']);
        $agora = new DateTimeImmutable('now');
        $fim = $ini->modify('+' . (int)$ag['duracao_min'] . ' minutes');
        if ($agora < $ini->modify('-15 minutes')) {
            ch_erro(403, 'A sala abre 15 minutos antes do horário marcado.');
        }
        if ($agora > $fim->modify('+30 minutes')) {
            ch_erro(410, 'Essa reunião já terminou.');
        }
        if (ch_em_chamada($pdo, $uid)) {
            ch_erro(409, 'Você já está em uma chamada.', ['motivo' => 'voce_em_chamada']);
        }

        $st = $pdo->prepare("SELECT id FROM tb_chamadas WHERE agendamento_id = ? AND status = 'em_andamento' ORDER BY id DESC LIMIT 1");
        $st->execute([$agId]);
        $chamadaId = (int)$st->fetchColumn();

        if ($chamadaId === 0) {
            $pdo->beginTransaction();
            $pdo->prepare(
                "INSERT INTO tb_chamadas (tipo, midia, equipe_slug, iniciador_id, agendamento_id, status, atendida_em)
                 VALUES ('equipe', 'video', ?, ?, ?, 'em_andamento', NOW())"
            )->execute([(string)$ag['equipe_slug'], $uid, $agId]);
            $chamadaId = (int)$pdo->lastInsertId();
            ch_entrar($pdo, $chamadaId, $uid);

            if ((int)$ag['toda_equipe'] === 1) {
                $ids = array_column(ch_membros_da_equipe($pdo, (string)$ag['equipe_slug']), 'id');
            } else {
                $sp = $pdo->prepare('SELECT usuario_id FROM tb_chamadas_agendadas_participantes WHERE agendamento_id = ?');
                $sp->execute([$agId]);
                $ids = $sp->fetchAll(PDO::FETCH_COLUMN);
                $ids[] = $ag['criador_id'];
            }
            // Convite (aviso) para os demais; eles entram quando quiserem.
            $ins = $pdo->prepare("INSERT IGNORE INTO tb_chamadas_participantes (chamada_id, usuario_id, estado) VALUES (?, ?, 'convidado')");
            foreach (array_unique(array_map('intval', $ids)) as $id) {
                if ($id !== $uid) {
                    $ins->execute([$chamadaId, $id]);
                }
            }
            $pdo->commit();
        } else {
            ch_entrar($pdo, $chamadaId, $uid);
        }

        ch_resposta(200, ['sucesso' => true, 'chamada' => ch_formatar_chamada($pdo, $chamadaId)]);
    }

    ch_erro(422, 'Ação inválida.');
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    ch_erro(500, 'Erro ao consultar o banco de dados.');
}
