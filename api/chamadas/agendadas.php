<?php
/**
 * api/chamadas/agendadas.php
 *
 * GET  ?todas=1                 → reuniões agendadas do usuário (padrão: as 5 próximas)
 * POST { acao: "criar", titulo, descricao, data (YYYY-MM-DD), hora (HH:MM), duracao_min,
 *        toda_equipe (bool), participantes: [ids] }
 * POST { acao: "cancelar", id }  → só quem criou
 *
 * Regras: participantes só da MESMA equipe; "toda a equipe" só para
 * gerente, diretor e CEO.
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$uid = ch_iniciar(['GET', 'POST']);
$ehPost = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
$corpo = $ehPost ? ch_ler_json() : null;
if ($ehPost) {
    ch_exigir_csrf($corpo);
}

try {
    $pdo = ch_pdo();
    $eu = ch_usuario($pdo, $uid);
    $equipe = (string)($eu['equipe_slug'] ?? '');

    // ------------------------------------------------------------
    if (!$ehPost) {
        $limite = isset($_GET['todas']) ? 100 : 5;
        $st = $pdo->prepare(
            "SELECT a.id, a.titulo, a.descricao, a.data_hora, a.duracao_min, a.criador_id, a.toda_equipe, a.equipe_slug,
                    (SELECT COUNT(*) FROM tb_chamadas_agendadas_participantes p WHERE p.agendamento_id = a.id) AS qtd_part,
                    (SELECT COUNT(*) FROM tb_usuarios u WHERE u.status = 'ativo' AND u.equipe_slug = a.equipe_slug) AS qtd_equipe
               FROM tb_chamadas_agendadas a
              WHERE a.cancelada_em IS NULL
                AND DATE_ADD(a.data_hora, INTERVAL a.duracao_min MINUTE) > NOW()
                AND (a.criador_id = :u
                     OR EXISTS (SELECT 1 FROM tb_chamadas_agendadas_participantes p WHERE p.agendamento_id = a.id AND p.usuario_id = :u)
                     OR (a.toda_equipe = 1 AND a.equipe_slug = :eq))
              ORDER BY a.data_hora ASC
              LIMIT " . (int)$limite
        );
        $st->execute(['u' => $uid, 'eq' => $equipe]);

        $agora = new DateTimeImmutable('now');
        $lista = [];
        foreach ($st->fetchAll() as $a) {
            $ini = new DateTimeImmutable((string)$a['data_hora']);
            $fim = $ini->modify('+' . (int)$a['duracao_min'] . ' minutes');
            $total = (int)$a['toda_equipe'] === 1 ? (int)$a['qtd_equipe'] : (int)$a['qtd_part'] + 1;
            $lista[] = [
                'id'           => (int)$a['id'],
                'titulo'       => (string)$a['titulo'],
                'descricao'    => $a['descricao'] !== null ? (string)$a['descricao'] : '',
                'data_hora'    => ch_iso((string)$a['data_hora']),
                'duracao_min'  => (int)$a['duracao_min'],
                'toda_equipe'  => (int)$a['toda_equipe'] === 1,
                'equipe_nome'  => ch_equipe_nome((string)$a['equipe_slug']),
                'outros'       => max(0, $total - 1),
                'pode_entrar'  => $agora >= $ini->modify('-15 minutes') && $agora <= $fim->modify('+30 minutes'),
                'pode_cancelar' => (int)$a['criador_id'] === $uid,
            ];
        }
        ch_resposta(200, ['sucesso' => true, 'agendadas' => $lista]);
    }

    // ------------------------------------------------------------
    $acao = (string)($corpo['acao'] ?? '');

    if ($acao === 'cancelar') {
        $id = (int)($corpo['id'] ?? 0);
        $st = $pdo->prepare('UPDATE tb_chamadas_agendadas SET cancelada_em = NOW() WHERE id = ? AND criador_id = ? AND cancelada_em IS NULL');
        $st->execute([$id, $uid]);
        if ($st->rowCount() === 0) {
            ch_erro(404, 'Reunião não encontrada.');
        }
        ch_resposta(200, ['sucesso' => true]);
    }

    if ($acao === 'criar') {
        if ($equipe === '') {
            ch_erro(403, 'Você ainda não pertence a uma equipe.');
        }
        $titulo = trim((string)($corpo['titulo'] ?? ''));
        $descricao = trim((string)($corpo['descricao'] ?? ''));
        $duracao = (int)($corpo['duracao_min'] ?? 30);
        $todaEquipe = !empty($corpo['toda_equipe']);
        $ids = array_values(array_unique(array_map('intval', (array)($corpo['participantes'] ?? []))));

        if ($titulo === '' || mb_strlen($titulo) > 120) {
            ch_erro(422, 'Informe um título de até 120 caracteres.');
        }
        if (mb_strlen($descricao) > 500) {
            ch_erro(422, 'A descrição pode ter até 500 caracteres.');
        }
        if (!in_array($duracao, [15, 30, 45, 60, 90, 120], true)) {
            ch_erro(422, 'Duração inválida.');
        }
        $dh = DateTimeImmutable::createFromFormat('Y-m-d H:i', (string)($corpo['data'] ?? '') . ' ' . (string)($corpo['hora'] ?? ''));
        if (!$dh) {
            ch_erro(422, 'Informe uma data e um horário válidos.');
        }
        if ($dh < new DateTimeImmutable('now')) {
            ch_erro(422, 'Escolha um horário no futuro.');
        }

        if ($todaEquipe) {
            // REGRA 2 (vale também para agendar com a equipe toda).
            if (!ch_pode_chamar_equipe($eu)) {
                ch_erro(403, CH_MSG_REGRA_EQUIPE);
            }
            $ids = [];
        } else {
            $ids = array_values(array_filter($ids, static fn(int $i): bool => $i !== $uid));
            if (!$ids) {
                ch_erro(422, 'Selecione ao menos um participante.');
            }
            // REGRA 1: só participantes da mesma equipe.
            $in = implode(',', array_fill(0, count($ids), '?'));
            $st = $pdo->prepare("SELECT COUNT(*) FROM tb_usuarios WHERE status = 'ativo' AND equipe_slug = ? AND id IN ($in)");
            $st->execute(array_merge([$equipe], $ids));
            if ((int)$st->fetchColumn() !== count($ids)) {
                ch_erro(403, CH_MSG_REGRA_MESMA_EQUIPE);
            }
        }

        $pdo->beginTransaction();
        $pdo->prepare(
            'INSERT INTO tb_chamadas_agendadas (titulo, descricao, data_hora, duracao_min, criador_id, equipe_slug, toda_equipe)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$titulo, $descricao !== '' ? $descricao : null, $dh->format('Y-m-d H:i:00'), $duracao, $uid, $equipe, $todaEquipe ? 1 : 0]);
        $agId = (int)$pdo->lastInsertId();
        $ins = $pdo->prepare('INSERT INTO tb_chamadas_agendadas_participantes (agendamento_id, usuario_id) VALUES (?, ?)');
        foreach ($ids as $i) {
            $ins->execute([$agId, $i]);
        }
        $pdo->commit();

        ch_resposta(200, ['sucesso' => true, 'id' => $agId]);
    }

    ch_erro(422, 'Ação inválida.');
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    ch_erro(500, 'Erro ao consultar o banco de dados.');
}
