<?php
/**
 * Histórico de compras da Loja — funções (sem headers/sessão).
 * Endpoints: pedidos.php (listar/registrar) e pedido_status.php (webhook).
 */
declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/_mercadopago.php';

const PEDIDO_STATUS = ['iniciado', 'pago', 'cancelado'];
const PEDIDO_MAX_ITENS = 30;
const PEDIDO_MAX_QTD = 99;
const PEDIDO_LISTA_MAX = 50;

class PedidoErro extends RuntimeException
{
}

/** Código legível e único: LJ-AAAAMMDD-XXXX. */
function pedido_gerar_codigo(): string
{
    return 'LJ-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(2)));
}

function pedido_texto($v, int $max): string
{
    $t = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string)$v) ?? '');
    return mb_substr($t, 0, $max);
}

/**
 * Valida o corpo enviado pelo navegador e devolve os campos prontos para gravar.
 * O subtotal e o total são SEMPRE recalculados aqui a partir dos itens.
 */
function pedido_validar(array $c, array $catalogoFrete): array
{
    $brutos = $c['itens'] ?? null;
    if (!is_array($brutos) || !$brutos || count($brutos) > PEDIDO_MAX_ITENS) {
        throw new PedidoErro('Pedido sem itens válidos.');
    }
    $itens = [];
    $subtotal = 0.0;
    foreach ($brutos as $it) {
        $id   = is_array($it) ? (string)($it['id'] ?? '') : '';
        $qtd  = is_array($it) ? (int)($it['quantidade'] ?? 0) : 0;
        $preco = is_array($it) ? round((float)($it['preco'] ?? -1), 2) : -1.0;
        if (!isset($catalogoFrete['categorias'][$id]) && !isset($catalogoFrete['produtos'][$id])) {
            throw new PedidoErro('Produto desconhecido.');
        }
        if ($qtd < 1 || $qtd > PEDIDO_MAX_QTD || $preco < 0 || $preco > 100000) {
            throw new PedidoErro('Item inválido.');
        }
        $itens[] = ['id' => $id, 'nome' => pedido_texto($it['nome'] ?? $id, 120), 'quantidade' => $qtd, 'preco' => $preco];
        $subtotal += $preco * $qtd;
    }
    $subtotal = round($subtotal, 2);

    $freteValor = round(max(0.0, min((float)($c['frete']['preco'] ?? 0), 100000.0)), 2);
    $cep = preg_replace('/\D+/', '', (string)($c['cep'] ?? '')) ?? '';
    $uf  = strtoupper(pedido_texto($c['uf'] ?? '', 2));

    return [
        'itens'          => $itens,
        'subtotal'       => $subtotal,
        'frete_nome'     => $freteValor > 0 || !empty($c['frete']['nome']) ? pedido_texto($c['frete']['nome'] ?? '', 80) : null,
        'frete_valor'    => $freteValor,
        'total'          => round($subtotal + $freteValor, 2),
        'cupom'          => ($c['cupom'] ?? '') !== '' && $c['cupom'] !== null ? pedido_texto($c['cupom'], 30) : null,
        'entrega_cep'    => strlen($cep) === 8 ? $cep : null,
        'entrega_cidade' => pedido_texto($c['cidade'] ?? '', 80) ?: null,
        'entrega_uf'     => preg_match('/^[A-Z]{2}$/', $uf) ? $uf : null,
        // id da preferência do Mercado Pago (vem no link de pagamento); permite confirmar o "pago" depois
        'preference_id'  => mp_preference_do_link((string)($c['init_point'] ?? '')),
    ];
}

/** Grava o pedido do usuário e devolve o código. Tenta de novo se o código colidir. */
function pedido_criar(PDO $pdo, int $usuarioId, array $d): string
{
    $comPref = mp_colunas_prontas($pdo);   // colunas de database/loja_pagamento_mp.sql já aplicadas?
    $sql = 'INSERT INTO tb_loja_pedidos
              (codigo, usuario_id, itens, subtotal, frete_nome, frete_valor, total, cupom,
               entrega_cep, entrega_cidade, entrega_uf' . ($comPref ? ', preference_id' : '') . ')
            VALUES (:codigo, :u, :itens, :sub, :fn, :fv, :total, :cupom, :cep, :cid, :uf' . ($comPref ? ', :pref' : '') . ')';
    for ($tentativa = 0; $tentativa < 5; $tentativa++) {
        $codigo = pedido_gerar_codigo();
        try {
            $valores = [
                'codigo' => $codigo,
                'u'      => $usuarioId,
                'itens'  => json_encode($d['itens'], JSON_UNESCAPED_UNICODE),
                'sub'    => $d['subtotal'],
                'fn'     => $d['frete_nome'],
                'fv'     => $d['frete_valor'],
                'total'  => $d['total'],
                'cupom'  => $d['cupom'],
                'cep'    => $d['entrega_cep'],
                'cid'    => $d['entrega_cidade'],
                'uf'     => $d['entrega_uf'],
            ];
            if ($comPref) {
                $valores['pref'] = $d['preference_id'] ?? null;
            }
            $pdo->prepare($sql)->execute($valores);
            return $codigo;
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? 0) !== 1062) {   // 1062 = código duplicado
                throw $e;
            }
        }
    }
    throw new PedidoErro('Não foi possível gerar o código do pedido.');
}

/** Pedidos do usuário, do mais novo ao mais antigo. */
function pedido_listar(PDO $pdo, int $usuarioId): array
{
    $st = $pdo->prepare(
        'SELECT codigo, status, itens, subtotal, frete_nome, frete_valor, total, cupom,
                entrega_cidade, entrega_uf, criado_em
           FROM tb_loja_pedidos
          WHERE usuario_id = :u
          ORDER BY criado_em DESC, id DESC
          LIMIT ' . PEDIDO_LISTA_MAX
    );
    $st->execute(['u' => $usuarioId]);
    $saida = [];
    foreach ($st->fetchAll() as $r) {
        $itens = json_decode((string)$r['itens'], true);
        $saida[] = [
            'codigo'     => $r['codigo'],
            'status'     => $r['status'],
            'itens'      => is_array($itens) ? $itens : [],
            'subtotal'   => (float)$r['subtotal'],
            'frete_nome' => $r['frete_nome'],
            'frete'      => (float)$r['frete_valor'],
            'total'      => (float)$r['total'],
            'cupom'      => $r['cupom'],
            'cidade'     => $r['entrega_cidade'],
            'uf'         => $r['entrega_uf'],
            'criado_em'  => str_replace(' ', 'T', (string)$r['criado_em']),
        ];
    }
    return $saida;
}
