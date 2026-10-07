<?php
/**
 * POST api/chamadas/mensagem.php  { "chamada_id": 1, "texto": "Olá" }
 * Chat da chamada (painel lateral). Só quem está na chamada envia.
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$uid = ch_iniciar(['POST']);
$corpo = ch_ler_json();
ch_exigir_csrf($corpo);

$chamadaId = (int)($corpo['chamada_id'] ?? 0);
$texto = trim((string)($corpo['texto'] ?? ''));

if ($texto === '' || mb_strlen($texto) > 1000) {
    ch_erro(422, 'Escreva uma mensagem de até 1000 caracteres.');
}

try {
    $pdo = ch_pdo();
    $st = $pdo->prepare("SELECT 1 FROM tb_chamadas_participantes WHERE chamada_id = ? AND usuario_id = ? AND estado = 'na_chamada'");
    $st->execute([$chamadaId, $uid]);
    if (!$st->fetchColumn()) {
        ch_erro(403, 'Você não está nessa chamada.');
    }
    $pdo->prepare('INSERT INTO tb_chamadas_mensagens (chamada_id, usuario_id, texto) VALUES (?, ?, ?)')
        ->execute([$chamadaId, $uid, $texto]);
    ch_resposta(200, ['sucesso' => true, 'id' => (int)$pdo->lastInsertId()]);
} catch (PDOException $e) {
    ch_erro(500, 'Erro ao consultar o banco de dados.');
}
