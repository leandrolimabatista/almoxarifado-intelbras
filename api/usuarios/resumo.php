<?php
/**
 * GET api/usuarios/resumo.php
 * Dados da tela inicial do módulo "Usuários": contagem de
 * solicitações pendentes, contagem de usuários cadastrados e os
 * 5 usuários mais recentes (tabela "Usuários recentes").
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

usr_iniciar(['GET']);

try {
    $pdo = conectar();

    $pendentes = (int)$pdo->query(
        "SELECT COUNT(*) FROM tb_solicitacoes_acesso WHERE status = 'pendente'"
    )->fetchColumn();

    $cadastrados = (int)$pdo->query('SELECT COUNT(*) FROM tb_usuarios')->fetchColumn();

    $stmt = $pdo->query(
        'SELECT u.*, un.nome AS unidade_nome
         FROM tb_usuarios u
         LEFT JOIN tb_unidades un ON un.id = u.unidade_id
         ORDER BY u.criado_em DESC
         LIMIT 5'
    );
    $recentes = array_map('usr_formatar_usuario', $stmt->fetchAll());

    usr_resposta(200, [
        'sucesso' => true,
        'pendentes' => $pendentes,
        'cadastrados' => $cadastrados,
        'recentes' => $recentes,
    ]);
} catch (PDOException $e) {
    usr_erro(500, 'Erro ao consultar o banco de dados.');
}
