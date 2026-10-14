<?php
/**
 * GET api/chat/contatos.php?busca=...
 *
 * Lista usuários cadastrados (ativos) pra escolher em "Nova conversa",
 * exceto o próprio usuário logado. "busca" filtra por nome ou email.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$meuId = chat_iniciar(['GET']);
$busca = (string)($_GET['busca'] ?? '');

try {
    $pdo = chat_pdo();
    $contatos = chat_listar_contatos($pdo, $meuId, $busca);
} catch (PDOException $e) {
    chat_erro_banco($e, 'contatos');
}

chat_resposta(200, ['sucesso' => true, 'contatos' => $contatos]);
