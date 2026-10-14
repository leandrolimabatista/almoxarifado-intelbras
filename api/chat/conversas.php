<?php
/**
 * GET api/chat/conversas.php
 *
 * Lista as conversas do usuário logado, mais recente primeiro, com a
 * prévia da última mensagem e a contagem de não lidas de cada uma.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$meuId = chat_iniciar(['GET']);

try {
    $pdo = chat_pdo();
    $conversas = chat_listar_conversas($pdo, $meuId);
} catch (PDOException $e) {
    chat_erro_banco($e, 'conversas');
}

chat_resposta(200, ['sucesso' => true, 'conversas' => $conversas]);
