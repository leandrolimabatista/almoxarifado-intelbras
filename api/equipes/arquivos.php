<?php
/**
 * GET api/equipes/arquivos.php?slug=geral
 *
 * Lista os arquivos enviados no chat de UMA equipe (aba "Arquivos" do canal),
 * do mais recente para o mais antigo. Exige login e que o usuário seja membro
 * da equipe. Cada item traz o id do anexo, que abre em
 * api/equipes/arquivo.php?id=<id>&modo=ver (ver arquivo.php).
 *
 * Mensagens apagadas não listam seus anexos. Arquivos enviados pelo
 * Administrador Intelbras (id 1) só aparecem para ele mesmo, como no chat.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = eq_iniciar(['GET']);

try {
    $pdo = eq_pdo();
    $equipe = eq_slug_da_query($pdo);
    $slug = $equipe['slug'];

    if (!eq_e_membro($pdo, $usuarioId, $slug)) {
        eq_erro(403, 'Você não faz parte desta equipe.');
    }

    $semAdmin = $usuarioId !== 1 ? ' AND m.usuario_id <> 1' : '';

    $stmt = $pdo->prepare(
        'SELECT a.id, a.nome_original, a.extensao, a.mime, a.tamanho, a.criado_em,
                m.usuario_id, u.nome AS autor
         FROM tb_equipes_anexos a
         JOIN tb_equipes_mensagens m ON m.id = a.mensagem_id
         JOIN tb_usuarios u ON u.id = m.usuario_id
         WHERE m.equipe_slug = :slug AND m.excluida_em IS NULL' . $semAdmin . '
         ORDER BY a.id DESC
         LIMIT 500'
    );
    $stmt->execute(['slug' => $slug]);

    $itens = array_map(static fn(array $l): array => [
        'id'        => (int)$l['id'],
        'nome'      => (string)$l['nome_original'],
        'extensao'  => (string)$l['extensao'],
        'mime'      => (string)$l['mime'],
        'tamanho'   => (int)$l['tamanho'],
        'autor'     => (string)$l['autor'],
        'criado_em' => (string)$l['criado_em'],
        'meu'       => (int)$l['usuario_id'] === $usuarioId,
    ], $stmt->fetchAll());

    eq_resposta(200, ['sucesso' => true, 'itens' => $itens]);
} catch (PDOException $e) {
    eq_erro_banco($e, 'arquivos');
}
