<?php
/**
 * POST api/chamadas/sinal.php
 *   { "chamada_id": 1, "para_id": 2, "tipo": "offer|answer|ice", "payload": "<json>" }
 * Sinalização WebRTC entre dois participantes da MESMA chamada.
 * O áudio/vídeo trafega direto entre os navegadores (não passa aqui).
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$uid = ch_iniciar(['POST']);
$corpo = ch_ler_json();
ch_exigir_csrf($corpo);

$chamadaId = (int)($corpo['chamada_id'] ?? 0);
$paraId = (int)($corpo['para_id'] ?? 0);
$tipo = (string)($corpo['tipo'] ?? '');
$payload = (string)($corpo['payload'] ?? '');

if (!in_array($tipo, ['offer', 'answer', 'ice'], true) || $payload === '' || strlen($payload) > 60000 || $paraId === $uid) {
    ch_erro(422, 'Sinal inválido.');
}

try {
    $pdo = ch_pdo();
    $st = $pdo->prepare(
        "SELECT COUNT(*) FROM tb_chamadas_participantes cp JOIN tb_chamadas c ON c.id = cp.chamada_id
          WHERE cp.chamada_id = ? AND cp.usuario_id IN (?, ?) AND cp.estado = 'na_chamada'
            AND c.status IN ('tocando','em_andamento')"
    );
    $st->execute([$chamadaId, $uid, $paraId]);
    if ((int)$st->fetchColumn() !== 2) {
        ch_erro(403, 'Os dois participantes precisam estar na chamada.');
    }
    $pdo->prepare('INSERT INTO tb_chamadas_sinais (chamada_id, de_id, para_id, tipo, payload) VALUES (?, ?, ?, ?, ?)')
        ->execute([$chamadaId, $uid, $paraId, $tipo, $payload]);
    ch_resposta(200, ['sucesso' => true]);
} catch (PDOException $e) {
    ch_erro(500, 'Erro ao consultar o banco de dados.');
}
