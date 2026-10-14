<?php
/**
 * GET api/dashboard/compras.php — Monitoramento de compras da Loja (Dashboard).
 *
 * EXCLUSIVO do Administrador Intelbras (usuário id 1): reaproveita o bootstrap
 * do módulo administrativo, que responde 401 (sem sessão) / 403 (não-admin).
 *
 * Parâmetros (todos opcionais):
 *   busca   texto: nome/e-mail do comprador, código do pedido ou nome do produto
 *   status  aguardando_pagamento | pago | enviado | entregue | cancelado | recusado | reembolsado
 *   dias    7 | 30 | 90  (somente pedidos dos últimos N dias; vazio = todo o período)
 *   offset  paginação da lista (50 por vez)
 *
 * Resposta: { sucesso, resumo{...}, top_produtos[...], total, itens[...] }
 *   - resumo e top_produtos respeitam busca + período, mas NÃO o filtro de status
 *     (assim os cartões não zeram ao filtrar a tabela).
 *
 * Funciona com os dois formatos de tabela já usados no projeto:
 *   a) relacional  : tb_loja_pedidos + tb_loja_pedido_itens (+ tb_loja_pagamentos)
 *   b) JSON (zip)  : tb_loja_pedidos com colunas codigo/itens(JSON) — database/loja_pedidos.sql
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../loja/_mercadopago.php';

usr_iniciar(['GET']);

const COMPRAS_PAGINA = 50;
const COMPRAS_MAX_LINHAS = 5000;

/** Status que contam como venda confirmada (receita). */
const COMPRAS_CONFIRMADOS = ['pago', 'enviado', 'entregue'];

/** Status "normalizado" -> status gravado no formato JSON antigo. */
const COMPRAS_LEGADO = ['aguardando_pagamento' => 'iniciado', 'pago' => 'pago', 'cancelado' => 'cancelado'];

function compras_tabela_existe(PDO $pdo, string $tabela, string $coluna = ''): bool
{
    try {
        $pdo->query('SELECT ' . ($coluna !== '' ? "`$coluna`" : '1') . " FROM `$tabela` LIMIT 0");
        return true;
    } catch (PDOException $e) {
        return false;
    }
}

try {
    $pdo = conectar();

    $relacional = compras_tabela_existe($pdo, 'tb_loja_pedido_itens');
    $legado     = !$relacional && compras_tabela_existe($pdo, 'tb_loja_pedidos', 'itens');
    $temPag     = $relacional && compras_tabela_existe($pdo, 'tb_loja_pagamentos');

    if (!$relacional && !$legado) {
        usr_resposta(200, [
            'sucesso' => true,
            'resumo' => ['total_pedidos' => 0, 'receita' => 0, 'ticket_medio' => 0, 'compradores' => 0,
                         'aguardando_qtd' => 0, 'aguardando_valor' => 0, 'itens_vendidos' => 0],
            'top_produtos' => [], 'total' => 0, 'itens' => [],
        ]);
    }

    // Pedidos "iniciado" cujo pagamento já foi aprovado no Mercado Pago passam a "pago"
    if ($legado) {
        mp_sincronizar_pedidos($pdo);
    }

    $busca  = trim((string)($_GET['busca'] ?? ''));
    $status = trim((string)($_GET['status'] ?? ''));
    $dias   = (int)($_GET['dias'] ?? 0);
    $offset = max(0, (int)($_GET['offset'] ?? 0));

    // ---------- Pedidos (busca + período no SQL) ----------
    $where = [];
    $params = [];
    if (in_array($dias, [7, 30, 90], true)) {
        $where[] = 'p.criado_em >= :desde';
        $params['desde'] = date('Y-m-d H:i:s', time() - $dias * 86400);
    }

    if ($relacional) {
        $campos = "p.id, p.status, p.subtotal, p.desconto, p.frete_nome, p.frete_valor, p.total,
                   p.cupom_codigo AS cupom, p.cidade, p.uf, p.codigo_rastreio, p.criado_em,
                   NULL AS codigo_legado, p.usuario_id,
                   u.nome AS usuario_nome, u.email AS usuario_email, u.equipe_slug, un.nome AS unidade_nome"
               . ($temPag ? ", (SELECT g.metodo FROM tb_loja_pagamentos g WHERE g.pedido_id = p.id ORDER BY g.id DESC LIMIT 1) AS metodo" : ", NULL AS metodo");
        $buscaCodigo = "CONCAT('PED-', LPAD(p.id, 6, '0')) LIKE :b1";
        $buscaItem   = 'EXISTS (SELECT 1 FROM tb_loja_pedido_itens i WHERE i.pedido_id = p.id AND i.titulo LIKE :b4)';
    } else {
        $campos = "p.id, p.status, p.subtotal, 0 AS desconto, p.frete_nome, p.frete_valor, p.total,
                   p.cupom, p.entrega_cidade AS cidade, p.entrega_uf AS uf, NULL AS codigo_rastreio, p.criado_em,
                   p.codigo AS codigo_legado, p.usuario_id, p.itens AS itens_json, NULL AS metodo,
                   u.nome AS usuario_nome, u.email AS usuario_email, u.equipe_slug, un.nome AS unidade_nome";
        $buscaCodigo = 'p.codigo LIKE :b1';
        $buscaItem   = 'p.itens LIKE :b4';
    }

    if ($busca !== '') {
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $busca) . '%';
        $where[] = "(u.nome LIKE :b2 OR u.email LIKE :b3 OR $buscaCodigo OR $buscaItem)";
        $params += ['b1' => $like, 'b2' => $like, 'b3' => $like, 'b4' => $like];
    }

    $sql = "SELECT $campos
              FROM tb_loja_pedidos p
              LEFT JOIN tb_usuarios u ON u.id = p.usuario_id
              LEFT JOIN tb_unidades un ON un.id = u.unidade_id"
         . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
         . ' ORDER BY p.criado_em DESC, p.id DESC LIMIT ' . COMPRAS_MAX_LINHAS;
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $pedidos = $st->fetchAll();

    // ---------- Itens de cada pedido ----------
    $itensPorPedido = [];
    if ($relacional && $pedidos) {
        $ids = array_map(static fn($r) => (int)$r['id'], $pedidos);
        foreach (array_chunk($ids, 1000) as $lote) {
            $marcas = implode(',', array_fill(0, count($lote), '?'));
            $q = $pdo->prepare("SELECT pedido_id, produto_id, titulo, quantidade, preco_unit
                                  FROM tb_loja_pedido_itens WHERE pedido_id IN ($marcas) ORDER BY id");
            $q->execute($lote);
            foreach ($q->fetchAll() as $it) {
                $itensPorPedido[(int)$it['pedido_id']][] = [
                    'id' => (string)$it['produto_id'], 'nome' => (string)$it['titulo'],
                    'quantidade' => (int)$it['quantidade'], 'preco' => (float)$it['preco_unit'],
                ];
            }
        }
    }

    // ---------- Normalização + agregados ----------
    $resumo = ['total_pedidos' => 0, 'receita' => 0.0, 'ticket_medio' => 0.0, 'compradores' => 0,
               'aguardando_qtd' => 0, 'aguardando_valor' => 0.0, 'itens_vendidos' => 0];
    $compradores = [];
    $produtos = [];
    $lista = [];

    foreach ($pedidos as $r) {
        $st = (string)$r['status'];
        if ($legado) {
            $st = array_search($st, COMPRAS_LEGADO, true) ?: $st;   // iniciado -> aguardando_pagamento
            $its = json_decode((string)$r['itens_json'], true);
            $its = is_array($its) ? array_map(static fn($i) => [
                'id' => (string)($i['id'] ?? ''), 'nome' => (string)($i['nome'] ?? ''),
                'quantidade' => (int)($i['quantidade'] ?? 0), 'preco' => (float)($i['preco'] ?? 0),
            ], $its) : [];
        } else {
            $its = $itensPorPedido[(int)$r['id']] ?? [];
        }
        $total = (float)$r['total'];

        // Resumo/top: independem do filtro de status
        $resumo['total_pedidos']++;
        if (in_array($st, COMPRAS_CONFIRMADOS, true)) {
            $resumo['receita'] += $total;
            $resumo['_confirmados'] = ($resumo['_confirmados'] ?? 0) + 1;
            $compradores[(int)$r['usuario_id']] = true;
            foreach ($its as $it) {
                $resumo['itens_vendidos'] += $it['quantidade'];
                $k = $it['id'] !== '' ? $it['id'] : $it['nome'];
                $produtos[$k] ??= ['nome' => $it['nome'], 'quantidade' => 0, 'valor' => 0.0];
                $produtos[$k]['quantidade'] += $it['quantidade'];
                $produtos[$k]['valor'] += $it['quantidade'] * $it['preco'];
            }
        } elseif ($st === 'aguardando_pagamento') {
            $resumo['aguardando_qtd']++;
            $resumo['aguardando_valor'] += $total;
        }

        if ($status !== '' && $st !== $status) {
            continue;
        }

        $codigo = $r['codigo_legado'] ?: 'PED-' . str_pad((string)$r['id'], 6, '0', STR_PAD_LEFT);
        $lista[] = [
            'id'        => (int)$r['id'],
            'codigo'    => (string)$codigo,
            'status'    => $st,
            'usuario'   => [
                'id'      => (int)$r['usuario_id'],
                'nome'    => (string)($r['usuario_nome'] ?? 'Usuário removido'),
                'email'   => (string)($r['usuario_email'] ?? ''),
                'equipe'  => $r['equipe_slug'] !== null && isset(USR_EQUIPES[$r['equipe_slug']]) ? USR_EQUIPES[$r['equipe_slug']] : null,
                'unidade' => $r['unidade_nome'] ?? null,
            ],
            'itens'     => $its,
            'subtotal'  => (float)$r['subtotal'],
            'desconto'  => (float)$r['desconto'],
            'frete_nome'  => $r['frete_nome'],
            'frete'     => (float)$r['frete_valor'],
            'total'     => $total,
            'cupom'     => $r['cupom'],
            'metodo'    => $r['metodo'],
            'cidade'    => $r['cidade'],
            'uf'        => $r['uf'],
            'rastreio'  => $r['codigo_rastreio'],
            'criado_em' => str_replace(' ', 'T', (string)$r['criado_em']),
        ];
    }

    $confirmados = (int)($resumo['_confirmados'] ?? 0);
    unset($resumo['_confirmados']);
    $resumo['compradores']  = count($compradores);
    $resumo['ticket_medio'] = $confirmados > 0 ? round($resumo['receita'] / $confirmados, 2) : 0.0;
    $resumo['receita']      = round($resumo['receita'], 2);
    $resumo['aguardando_valor'] = round($resumo['aguardando_valor'], 2);

    uasort($produtos, static fn($a, $b) => $b['quantidade'] <=> $a['quantidade']);
    $top = array_slice(array_values($produtos), 0, 5);
    foreach ($top as &$t) {
        $t['valor'] = round($t['valor'], 2);
    }
    unset($t);

    usr_resposta(200, [
        'sucesso'      => true,
        'resumo'       => $resumo,
        'top_produtos' => $top,
        'total'        => count($lista),
        'itens'        => array_slice($lista, $offset, COMPRAS_PAGINA),
    ]);
} catch (PDOException $e) {
    error_log('[dashboard/compras] ' . $e->getMessage());
    usr_erro(500, 'Erro ao consultar o banco de dados.');
}
