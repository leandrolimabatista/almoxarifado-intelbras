<?php
/**
 * GET api/usuarios/unidades.php
 * Lista as unidades ativas, pro <select> "Unidade" da tela de
 * edição de usuário. Hoje só existe a Lapa Tito, mas o endpoint já
 * fica pronto para quando houver mais de uma.
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

usr_iniciar(['GET']);

try {
    $pdo = conectar();
    $itens = $pdo->query("SELECT id, nome FROM tb_unidades WHERE status = 'ativa' ORDER BY nome")->fetchAll();
    usr_resposta(200, [
        'sucesso' => true,
        'itens' => array_map(static fn($u) => ['id' => (int)$u['id'], 'nome' => (string)$u['nome']], $itens),
    ]);
} catch (PDOException $e) {
    usr_erro(500, 'Erro ao consultar o banco de dados.');
}
