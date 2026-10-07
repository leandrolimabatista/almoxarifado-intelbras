<?php
/**
 * GET api/conversas/contatos.php
 * Alimenta a tela "Nova conversa": devolve os contatos (usuários ativos,
 * menos o próprio) e as equipes (de tb_equipes — nome e cor reais, as
 * mesmas do menu lateral e do módulo Equipes) com a quantidade de membros
 * (também sem contar o próprio usuário).
 *
 * A busca/filtros da tela são feitos no navegador, em tempo real.
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$meuId = chat_iniciar(['GET']);

try {
    $pdo = conectar();
    $equipesInfo = chat_equipes($pdo);

    $stmt = $pdo->prepare(
        "SELECT id, nome, cargo, equipe_slug
         FROM tb_usuarios
         WHERE status = 'ativo' AND id <> :eu
         ORDER BY nome
         LIMIT 1000"
    );
    $stmt->execute(['eu' => $meuId]);

    $contatos = [];
    $membros  = array_fill_keys(array_keys($equipesInfo), 0);

    foreach ($stmt->fetchAll() as $u) {
        $equipe = (string)($u['equipe_slug'] ?? '');
        $cargo  = (string)($u['cargo'] ?? '');

        if (isset($membros[$equipe])) {
            $membros[$equipe]++;
        }

        $contatos[] = [
            'id'          => (int)$u['id'],
            'nome'        => (string)$u['nome'],
            'cargo'       => $cargo,
            'cargo_nome'  => CHAT_CARGOS[$cargo] ?? null,
            'equipe_slug' => isset($equipesInfo[$equipe]) ? $equipe : null,
            'equipe_nome' => $equipesInfo[$equipe]['nome'] ?? null,
            'equipe_cor'  => $equipesInfo[$equipe]['cor'] ?? null,
        ];
    }

    $equipes = [];
    foreach ($equipesInfo as $slug => $info) {
        $equipes[] = [
            'slug'    => $slug,
            'nome'    => $info['nome'],
            'cor'     => $info['cor'],
            'membros' => $membros[$slug],
        ];
    }

    chat_resposta(200, ['sucesso' => true, 'contatos' => $contatos, 'equipes' => $equipes]);
} catch (PDOException $e) {
    chat_erro(500, 'Erro ao consultar o banco de dados.');
}
