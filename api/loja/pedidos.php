<?php
/**
 * api/loja/pedidos.php — histórico de compras do usuário logado
 *
 *   GET   -> { sucesso:true, pedidos:[ {codigo,status,itens,subtotal,frete,total,...} ] }
 *   POST  -> corpo JSON com "acao":
 *
 *     "reservar"  (fluxo atual do checkout, ANTES de gerar o pagamento)
 *                 { itens:[{id,nome,quantidade,preco}], frete:{nome,preco}, cupom, cep, cidade, uf }
 *                 Baixa o estoque e grava o pedido como "iniciado".
 *                 -> { sucesso:true, codigo:"LJ-20261007-A3F9" }   ·   409 se faltar estoque / item saiu da Loja
 *     "vincular"  { codigo, init_point }  liga o pedido ao link do Mercado Pago (para confirmar o "pago" depois)
 *     "cancelar"  { codigo }              pagamento não chegou a ser gerado: apaga o pedido e devolve o estoque
 *     "criar"     (compatibilidade) igual a "reservar", já com "init_point" no mesmo corpo. É o que valia antes;
 *                 sem a coluna de estoque no banco (database/loja_catalogo.sql) funciona como antigamente.
 *
 * Cada usuário só vê/cria os PRÓPRIOS pedidos (id vem da sessão).
 * Subtotal e total são recalculados aqui; o navegador não os define. Nome e preço máximo
 * de cada item vêm do catálogo do banco (o navegador não escolhe).
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

    $acao = (string)($corpo['acao'] ?? 'criar');
    if (!in_array($acao, ['criar', 'reservar', 'vincular', 'cancelar'], true)) {
        pedidos_resposta(422, ['sucesso' => false, 'erro' => 'Ação inválida.']);
    }

    // Estoque controlado pelo banco? (database/loja_catalogo.sql aplicado)
    $controla = prod_tabela_pronta($pdo) && prod_pedidos_prontos($pdo);

    if ($acao === 'vincular' || $acao === 'cancelar') {
        if (!$controla) {
            pedidos_resposta(503, ['sucesso' => false, 'erro' => 'Banco de dados desatualizado: rode database/loja_catalogo.sql.']);
        }
        $codigo = pedido_texto($corpo['codigo'] ?? '', 24);
        if ($codigo === '') {
            pedidos_resposta(422, ['sucesso' => false, 'erro' => 'Pedido inválido.']);
        }
        if ($acao === 'vincular') {
            $ok = pedido_vincular($pdo, $usuarioId, $codigo, (string)($corpo['init_point'] ?? ''));
            pedidos_resposta($ok ? 200 : 422, ['sucesso' => $ok]);
        }
        // cancelar: só vale para pedido que NUNCA teve link de pagamento (o cliente não consegue
        // cancelar um pedido que já foi para o Mercado Pago).
        $id = pedido_id_pendente($pdo, $usuarioId, $codigo);
        $temLink = false;
        if ($id !== null && mp_colunas_prontas($pdo)) {
            $q = $pdo->prepare('SELECT preference_id IS NOT NULL FROM tb_loja_pedidos WHERE id = :id');
            $q->execute(['id' => $id]);
            $temLink = (bool)$q->fetchColumn();
        }
        $feito = $id !== null && !$temLink && pedido_cancelar_pendente($pdo, $id, true);
        pedidos_resposta($feito ? 200 : 422, ['sucesso' => $feito]);
    }

    // reservar | criar
    if ($acao === 'reservar' && !$controla) {
        pedidos_resposta(503, ['sucesso' => false, 'erro' => 'Banco de dados desatualizado: rode database/loja_catalogo.sql.']);
    }

    $catalogo = loja_catalogo_frete($pdo);   // ids válidos (catálogo estático + produtos do banco)
    $dados    = pedido_validar($corpo, $catalogo);
    if ($controla) {
        $dados = pedido_checar_catalogo($pdo, $dados);
    }
    $codigo = pedido_criar($pdo, $usuarioId, $dados, $controla);
    pedidos_resposta(200, ['sucesso' => true, 'codigo' => $codigo]);
} catch (PedidoErro $e) {
    $conflito = $e->getCode() === 409;
    pedidos_resposta($conflito ? 409 : 422, ['sucesso' => false, 'erro' => $e->getMessage(), 'estoque' => $conflito]);
} catch (Throwable $e) {
    error_log('[loja/pedidos] ' . $e->getMessage());
    pedidos_resposta(500, ['sucesso' => false, 'erro' => 'Não foi possível acessar os pedidos agora.']);
}
