<?php
/**
 * GET api/usuarios/cadastrados.php
 * Lista os usuários cadastrados (tb_usuarios).
 * Parâmetros opcionais: busca (nome/email), equipe, status.
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

usr_iniciar(['GET']);

try {
    $pdo = conectar();

    $busca  = trim((string)($_GET['busca'] ?? ''));
    $equipe = trim((string)($_GET['equipe'] ?? ''));
    $status = trim((string)($_GET['status'] ?? ''));

    $condicoes = [];
    $params = [];

    if ($busca !== '') {
        $condicoes[] = '(u.nome LIKE :busca OR u.email LIKE :busca)';
        $params['busca'] = '%' . $busca . '%';
    }
    if (array_key_exists($equipe, USR_EQUIPES)) {
        $condicoes[] = 'u.equipe_slug = :equipe';
        $params['equipe'] = $equipe;
    }
    if (in_array($status, ['ativo', 'inativo'], true)) {
        $condicoes[] = 'u.status = :status';
        $params['status'] = $status;
    }

    $where = $condicoes ? ('WHERE ' . implode(' AND ', $condicoes)) : '';

    $stmt = $pdo->prepare(
        "SELECT u.*, un.nome AS unidade_nome
         FROM tb_usuarios u
         LEFT JOIN tb_unidades un ON un.id = u.unidade_id
         $where
         ORDER BY u.nome"
    );
    $stmt->execute($params);

    $itens = array_map('usr_formatar_usuario', $stmt->fetchAll());
    usr_resposta(200, ['sucesso' => true, 'itens' => $itens]);
} catch (PDOException $e) {
    usr_erro(500, 'Erro ao consultar o banco de dados.');
}
