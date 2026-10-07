<?php
/**
 * POST api/chamadas/presenca.php  { "nao_perturbe": true|false }
 * Liga/desliga o "Não perturbe" do usuário logado.
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$uid = ch_iniciar(['POST']);
$corpo = ch_ler_json();
ch_exigir_csrf($corpo);

try {
    $pdo = ch_pdo();
    ch_usuario($pdo, $uid);
    $valor = !empty($corpo['nao_perturbe']) ? 1 : 0;
    $pdo->prepare(
        'INSERT INTO tb_chamadas_presenca (usuario_id, nao_perturbe, ultimo_ping) VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE nao_perturbe = VALUES(nao_perturbe), ultimo_ping = NOW()'
    )->execute([$uid, $valor]);
    ch_resposta(200, ['sucesso' => true, 'nao_perturbe' => $valor === 1]);
} catch (PDOException $e) {
    ch_erro(500, 'Erro ao consultar o banco de dados.');
}
