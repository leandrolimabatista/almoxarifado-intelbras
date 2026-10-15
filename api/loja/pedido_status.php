<?php
/**
 * POST api/loja/pedido_status.php — atualiza o status de um pedido.
 * Pensado para o servidor de pagamento (AWS / webhook do Mercado Pago) chamar
 * quando o pagamento for confirmado ou recusado. NÃO usa a sessão do navegador:
 * exige o segredo LOJA_WEBHOOK_TOKEN no cabeçalho  X-Loja-Token.
 *
 *   Corpo: { "codigo": "LJ-20261007-A3F9", "status": "pago" | "cancelado" }
 *
 * Sem LOJA_WEBHOOK_TOKEN configurado (env ou api/config.local.php) responde 503.
 */
declare(strict_types=1);

require_once __DIR__ . '/../conexao.php';
require_once __DIR__ . '/_pedidos.php';
require_once __DIR__ . '/_frete.php';   // frete_config()

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function status_resposta(int $http, array $dados): void
{
    http_response_code($http);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    status_resposta(405, ['sucesso' => false, 'erro' => 'Método não permitido.']);
}
$segredo = frete_config('LOJA_WEBHOOK_TOKEN');
if ($segredo === '') {
    status_resposta(503, ['sucesso' => false, 'erro' => 'Webhook não configurado.']);
}
if (!hash_equals($segredo, (string)($_SERVER['HTTP_X_LOJA_TOKEN'] ?? ''))) {
    status_resposta(403, ['sucesso' => false, 'erro' => 'Token inválido.']);
}

$bruto  = file_get_contents('php://input');
$corpo  = json_decode($bruto === false ? '' : $bruto, true);
$codigo = is_array($corpo) ? (string)($corpo['codigo'] ?? '') : '';
$status = is_array($corpo) ? (string)($corpo['status'] ?? '') : '';
if ($codigo === '' || !in_array($status, ['pago', 'cancelado'], true)) {
    status_resposta(422, ['sucesso' => false, 'erro' => 'codigo/status inválidos.']);
}

try {
    $pdo = conectar();

    // Cancelamento de um pedido que ainda estava "iniciado": devolve o estoque que ele reservou.
    if ($status === 'cancelado' && prod_pedidos_prontos($pdo)) {
        $q = $pdo->prepare("SELECT id FROM tb_loja_pedidos WHERE codigo = :c AND status = 'iniciado'");
        $q->execute(['c' => $codigo]);
        $idPendente = $q->fetchColumn();
        if ($idPendente !== false && pedido_cancelar_pendente($pdo, (int)$idPendente, false)) {
            status_resposta(200, ['sucesso' => true]);
        }
    }

    $up = $pdo->prepare('UPDATE tb_loja_pedidos SET status = :s, atualizado_em = NOW() WHERE codigo = :c');
    $up->execute(['s' => $status, 'c' => $codigo]);
    $existe = $up->rowCount() > 0;
    if (!$existe) {   // rowCount 0 também ocorre quando o status já era esse
        $q = $pdo->prepare('SELECT 1 FROM tb_loja_pedidos WHERE codigo = :c');
        $q->execute(['c' => $codigo]);
        $existe = (bool)$q->fetchColumn();
    }
    status_resposta($existe ? 200 : 404, ['sucesso' => $existe]);
} catch (Throwable $e) {
    error_log('[loja/pedido_status] ' . $e->getMessage());
    status_resposta(500, ['sucesso' => false, 'erro' => 'Erro interno.']);
}
