<?php
/**
 * api/loja/pedidos.php — histórico de compras do usuário logado
 *
 *   GET   -> { sucesso:true, pedidos:[ {codigo,status,itens,subtotal,frete,total,...} ] }
 *   POST  -> registra o pedido no momento em que o pagamento é iniciado.
 *            Corpo: { itens:[{id,nome,quantidade,preco}], frete:{nome,preco},
 *                     cupom, cep, cidade, uf, init_point }
 *            Resposta: { sucesso:true, codigo:"LJ-20261007-A3F9" }
 *
 * Cada usuário só vê/cria os PRÓPRIOS pedidos (id vem da sessão).
 * Subtotal e total são recalculados aqui; o navegador não os define.
 */
declare(strict_types=1);

require_once __DIR__ . '/../conexao.php';
require_once __DIR__ . '/_pedidos.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function pedidos_resposta(int $http, array $dados): void
{
    http_response_code($http);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

$metodo = $_SERVER['REQUEST_METHOD'] ?? '';
if (!in_array($metodo, ['GET', 'POST'], true)) {
    pedidos_resposta(405, ['sucesso' => false, 'erro' => 'Método não permitido.']);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$usuarioId = (int)($_SESSION['usuario_id'] ?? 0);
session_write_close();
if ($usuarioId <= 0) {
    pedidos_resposta(401, ['sucesso' => false, 'erro' => 'Não autenticado.']);
}

try {
    $pdo = conectar();

    if ($metodo === 'GET') {
        mp_sincronizar_pedidos($pdo, $usuarioId);   // confirma no Mercado Pago o que ainda está "iniciado"
        pedidos_resposta(200, ['sucesso' => true, 'pedidos' => pedido_listar($pdo, $usuarioId)]);
    }

    $bruto = file_get_contents('php://input');
    $corpo = json_decode($bruto === false ? '' : $bruto, true);
    $corpo = is_array($corpo) ? $corpo : [];

    $catalogo = require __DIR__ . '/_catalogo_frete.php';   // lista de ids válidos
    $dados    = pedido_validar($corpo, $catalogo);
    $codigo   = pedido_criar($pdo, $usuarioId, $dados);
    pedidos_resposta(200, ['sucesso' => true, 'codigo' => $codigo]);
} catch (PedidoErro $e) {
    pedidos_resposta(422, ['sucesso' => false, 'erro' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log('[loja/pedidos] ' . $e->getMessage());
    pedidos_resposta(500, ['sucesso' => false, 'erro' => 'Não foi possível acessar os pedidos agora.']);
}
