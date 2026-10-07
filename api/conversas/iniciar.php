<?php
/**
 * POST api/conversas/iniciar.php   (header X-CSRF-Token obrigatório)
 * Corpo JSON: { "usuarios": [id, ...], "equipes": ["slug", ...], "nome": "opcional" }
 *
 * Regras (tela "Nova conversa"):
 *   - 1 contato                 → conversa INDIVIDUAL (reaproveita a que já existe entre os dois)
 *   - qualquer outra combinação → GRUPO (equipes selecionadas entram com todos os membros)
 *
 * A seleção de UMA ÚNICA equipe (sem nenhum contato) não passa por aqui:
 * o front-end abre direto o canal real da equipe (index.php?pagina=equipes),
 * o mesmo canal do módulo "Equipes" — não duplicamos esse chat aqui.
 *
 * Resposta: { sucesso, conversa: { id, tipo, nome }, criada: bool }
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$meuId = chat_iniciar(['POST']);
chat_exigir_csrf();

$dados = chat_ler_json();

// ---- Entrada -------------------------------------------------------
$idsBrutos   = is_array($dados['usuarios'] ?? null) ? $dados['usuarios'] : [];
$slugsBrutos = is_array($dados['equipes'] ?? null) ? $dados['equipes'] : [];
$nomeGrupo   = trim((string)($dados['nome'] ?? ''));

$ids = [];
foreach ($idsBrutos as $v) {
    $id = filter_var($v, FILTER_VALIDATE_INT);
    if ($id !== false && $id > 0 && $id !== $meuId) {
        $ids[$id] = $id;
    }
}
$ids = array_values($ids);

try {
    $pdo = conectar();
    $equipesInfo = chat_equipes($pdo);

    $slugs = [];
    foreach ($slugsBrutos as $v) {
        $slug = (string)$v;
        if (!isset($equipesInfo[$slug])) {
            chat_erro(422, 'Equipe inválida.');
        }
        $slugs[$slug] = $slug;
    }
    $slugs = array_values($slugs);

    if (count($ids) + count($slugs) === 0) {
        chat_erro(422, 'Selecione ao menos um contato ou equipe.');
    }
    if (!$ids && count($slugs) === 1) {
        chat_erro(422, 'Para conversar com uma equipe inteira, abra o canal da equipe.');
    }
    if (count($ids) > CHAT_MAX_PARTICIPANTES) {
        chat_erro(422, 'Participantes demais para uma única conversa.');
    }
    if (mb_strlen($nomeGrupo) > 120) {
        chat_erro(422, 'O nome do grupo pode ter no máximo 120 caracteres.');
    }

    $pdo->beginTransaction();

    // ---- Contatos escolhidos (só usuários ativos) --------------------
    $participantes = [];   // id => nome
    if ($ids) {
        $marcas = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("SELECT id, nome FROM tb_usuarios WHERE status = 'ativo' AND id IN ($marcas)");
        $stmt->execute($ids);
        foreach ($stmt->fetchAll() as $u) {
            $participantes[(int)$u['id']] = (string)$u['nome'];
        }
        if (count($participantes) !== count($ids)) {
            $pdo->rollBack();
            chat_erro(422, 'Um dos contatos selecionados não está mais disponível.');
        }
    }

    // ---- Membros das equipes escolhidas (entram como participantes comuns) ----
    foreach ($slugs as $slug) {
        $stmt = $pdo->prepare("SELECT id, nome FROM tb_usuarios WHERE status = 'ativo' AND equipe_slug = :s AND id <> :eu");
        $stmt->execute(['s' => $slug, 'eu' => $meuId]);
        foreach ($stmt->fetchAll() as $u) {
            $participantes[(int)$u['id']] = (string)$u['nome'];
        }
    }

    if (count($participantes) > CHAT_MAX_PARTICIPANTES) {
        $pdo->rollBack();
        chat_erro(422, 'Participantes demais para uma única conversa.');
    }
    if (count($participantes) === 0) {
        $pdo->rollBack();
        chat_erro(422, 'Nenhum participante disponível para essa seleção.');
    }

    // ---- Tipo da conversa --------------------------------------------
    $criada = false;
    $conversaId = 0;

    if (count($ids) === 1 && !$slugs) {
        $tipo = 'individual';
        $nomeFinal = null;
    } else {
        $tipo = 'grupo';
        if ($nomeGrupo !== '') {
            $nomeFinal = $nomeGrupo;
        } else {
            $rotulos = [];
            foreach ($slugs as $slug) {
                $rotulos[] = $equipesInfo[$slug]['nome'];
            }
            foreach ($ids as $id) {
                $rotulos[] = explode(' ', $participantes[$id])[0];
            }
            $nomeFinal = count($rotulos) > 3
                ? implode(', ', array_slice($rotulos, 0, 3)) . ' e mais ' . (count($rotulos) - 3)
                : implode(', ', $rotulos);
            $nomeFinal = mb_substr($nomeFinal, 0, 120);
        }
    }

    // ---- Reaproveita a conversa individual existente entre os dois ---
    if ($tipo === 'individual') {
        $outro = $ids[0];
        $stmt = $pdo->prepare(
            "SELECT c.id FROM tb_chat_conversas c
             JOIN tb_chat_participantes p1 ON p1.conversa_id = c.id AND p1.usuario_id = :a
             JOIN tb_chat_participantes p2 ON p2.conversa_id = c.id AND p2.usuario_id = :b
             WHERE c.tipo = 'individual'
             LIMIT 1"
        );
        $stmt->execute(['a' => $meuId, 'b' => $outro]);
        $conversaId = (int)($stmt->fetchColumn() ?: 0);
    }

    // ---- Cria, se necessário -----------------------------------------
    if ($conversaId === 0) {
        $stmt = $pdo->prepare(
            'INSERT INTO tb_chat_conversas (tipo, nome, equipe_slug, criado_por) VALUES (:t, :n, NULL, :c)'
        );
        $stmt->execute(['t' => $tipo, 'n' => $nomeFinal, 'c' => $meuId]);
        $conversaId = (int)$pdo->lastInsertId();
        $criada = true;
    }

    // ---- Participantes -------------------------------------------------
    $todos = array_keys($participantes);
    $todos[] = $meuId;
    $ins = $pdo->prepare('INSERT IGNORE INTO tb_chat_participantes (conversa_id, usuario_id) VALUES (:c, :u)');
    foreach (array_unique($todos) as $uid) {
        $ins->execute(['c' => $conversaId, 'u' => $uid]);
    }

    $pdo->commit();

    chat_resposta($criada ? 201 : 200, [
        'sucesso'  => true,
        'criada'   => $criada,
        'conversa' => ['id' => $conversaId, 'tipo' => $tipo, 'nome' => $nomeFinal],
    ]);
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    chat_erro(500, 'Não foi possível iniciar a conversa. Verifique se database/conversas.sql foi executado.');
}
