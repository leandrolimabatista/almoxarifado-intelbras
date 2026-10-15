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
require_once __DIR__ . '/_produtos.php';

const PEDIDO_STATUS = ['iniciado', 'pago', 'cancelado'];
const PEDIDO_MAX_ITENS = 30;
const PEDIDO_MAX_QTD = 99;
const PEDIDO_LISTA_MAX = 50;

// Estoque reservado por pedido "iniciado" que nunca chegou a ter pagamento / ficou sem pagar.
const PEDIDO_EXPIRA_SEM_LINK_MIN = 60;     // sem link de pagamento: libera depois de N minutos
const PEDIDO_EXPIRA_COM_LINK_H   = 3;      // com link: só libera depois de conferir no Mercado Pago
const PEDIDO_EXPIRAR_INTERVALO_S = 60;     // no máximo 1 varredura por minuto (todos os usuários)
const PEDIDO_EXPIRAR_LOTE        = 20;

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

/**
 * Confere os itens com o catálogo do banco: o item precisa estar ativo, a quantidade respeita o
 * limite do produto e o preço nunca pode ser MAIOR que o do catálogo (cupom só reduz).
 * O nome gravado no pedido é o do catálogo. Não baixa estoque (isso é feito em pedido_criar).
 * Códigos 409 = a vitrine do cliente está desatualizada (ele recarrega o catálogo).
 */
function pedido_checar_catalogo(PDO $pdo, array $d): array
{
    $mapa = prod_mapa_ativos($pdo);
    $vistos = [];
    foreach ($d['itens'] as $i => $it) {
        $id = (string)$it['id'];
        if (isset($vistos[$id])) {
            throw new PedidoErro('Pedido com item repetido.');
        }
        $vistos[$id] = true;
        $p = $mapa[$id] ?? null;
        if (!$p) {
            throw new PedidoErro('O item ' . $id . ' não está mais disponível na Loja.', 409);
        }
        $limite = max(1, (int)$p['max_por_pedido']);
        if ($it['quantidade'] > $limite) {
            throw new PedidoErro('Limite de ' . $limite . ' unidades por pedido para "' . $p['nome'] . '".', 422);
        }
        if ($it['preco'] > (float)$p['preco'] + 0.005) {
            throw new PedidoErro('O preço de "' . $p['nome'] . '" mudou. Atualize a Loja e tente de novo.', 409);
        }
        $d['itens'][$i]['nome'] = (string)$p['nome'];
    }
    return $d;
}

/** Baixa o estoque dos itens (tudo ou nada: quem chama já abriu a transação). */
function pedido_estoque_baixar(PDO $pdo, array $itens): void
{
    usort($itens, static fn($a, $b) => strcmp((string)$a['id'], (string)$b['id']));   // ordem fixa evita deadlock
    $up = $pdo->prepare('UPDATE tb_loja_produtos SET estoque = estoque - :q WHERE id = :id AND ativo = 1 AND estoque >= :q2');
    foreach ($itens as $it) {
        $up->execute(['q' => (int)$it['quantidade'], 'id' => (string)$it['id'], 'q2' => (int)$it['quantidade']]);
        if ($up->rowCount() === 1) {
            continue;
        }
        $st = $pdo->prepare('SELECT nome, estoque, ativo FROM tb_loja_produtos WHERE id = :id');
        $st->execute(['id' => (string)$it['id']]);
        $p = $st->fetch();
        if (!$p || (int)$p['ativo'] !== 1) {
            $msg = 'O item "' . ($p['nome'] ?? $it['id']) . '" não está mais disponível.';
        } elseif ((int)$p['estoque'] <= 0) {
            $msg = '"' . $p['nome'] . '" esgotou.';
        } else {
            $n = (int)$p['estoque'];
            $msg = 'Só ' . ($n === 1 ? 'resta 1 unidade' : 'restam ' . $n . ' unidades') . ' de "' . $p['nome'] . '".';
        }
        throw new PedidoErro($msg, 409);
    }
}

/** Devolve ao estoque as unidades de um pedido que foi cancelado/expirou. */
function pedido_estoque_devolver(PDO $pdo, $itens): void
{
    if (!is_array($itens)) {
        return;
    }
    $up = $pdo->prepare('UPDATE tb_loja_produtos SET estoque = estoque + :q WHERE id = :id');
    foreach ($itens as $it) {
        $q = (int)($it['quantidade'] ?? 0);
        $id = (string)($it['id'] ?? '');
        if ($q > 0 && $id !== '') {
            $up->execute(['q' => $q, 'id' => $id]);
        }
    }
}

/**
 * Grava o pedido do usuário e devolve o código. Tenta de novo se o código colidir.
 * Com $reservarEstoque, baixa o estoque na MESMA transação: se faltar unidade, nada é gravado
 * (PedidoErro 409) — assim dois clientes nunca compram a última unidade ao mesmo tempo.
 */
function pedido_criar(PDO $pdo, int $usuarioId, array $d, bool $reservarEstoque = false): string
{
    $comPref = mp_colunas_prontas($pdo);   // colunas de database/loja_pagamento_mp.sql já aplicadas?
    $colunas = 'codigo, usuario_id, itens, subtotal, frete_nome, frete_valor, total, cupom, entrega_cep, entrega_cidade, entrega_uf';
    $marcas  = ':codigo, :u, :itens, :sub, :fn, :fv, :total, :cupom, :cep, :cid, :uf';
    if ($comPref) {
        $colunas .= ', preference_id';
        $marcas  .= ', :pref';
    }
    if ($reservarEstoque) {
        $colunas .= ', estoque_reservado';
        $marcas  .= ', 1';
    }
    $sql = "INSERT INTO tb_loja_pedidos ($colunas) VALUES ($marcas)";

    if ($reservarEstoque) {
        $pdo->beginTransaction();
    }
    try {
        if ($reservarEstoque) {
            pedido_estoque_baixar($pdo, $d['itens']);
        }
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
                if ($reservarEstoque) {
                    $pdo->commit();
                }
                return $codigo;
            } catch (PDOException $e) {
                if (($e->errorInfo[1] ?? 0) !== 1062) {   // 1062 = código duplicado
                    throw $e;
                }
            }
        }
        throw new PedidoErro('Não foi possível gerar o código do pedido.');
    } catch (Throwable $e) {
        if ($reservarEstoque && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/** Id do pedido "iniciado" deste usuário (ou null). */
function pedido_id_pendente(PDO $pdo, int $usuarioId, string $codigo): ?int
{
    $st = $pdo->prepare("SELECT id FROM tb_loja_pedidos WHERE codigo = :c AND usuario_id = :u AND status = 'iniciado'");
    $st->execute(['c' => $codigo, 'u' => $usuarioId]);
    $id = $st->fetchColumn();
    return $id === false ? null : (int)$id;
}

/**
 * Encerra um pedido que ainda está "iniciado" e devolve o estoque que ele reservou
 * (só se ele reservou: pedidos antigos não mexem no estoque). Idempotente: se o pedido já
 * não está "iniciado", não faz nada. $apagar = remove a linha (pedido que nunca teve pagamento);
 * senão marca "cancelado".
 */
function pedido_cancelar_pendente(PDO $pdo, int $pedidoId, bool $apagar = false): bool
{
    $propria = !$pdo->inTransaction();
    if ($propria) {
        $pdo->beginTransaction();
    }
    try {
        $st = $pdo->prepare("SELECT itens, estoque_reservado FROM tb_loja_pedidos WHERE id = :id AND status = 'iniciado' FOR UPDATE");
        $st->execute(['id' => $pedidoId]);
        $linha = $st->fetch();
        if (!$linha) {
            if ($propria) {
                $pdo->commit();
            }
            return false;
        }
        $sql = $apagar
            ? "DELETE FROM tb_loja_pedidos WHERE id = :id AND status = 'iniciado'"
            : "UPDATE tb_loja_pedidos SET status = 'cancelado', atualizado_em = NOW() WHERE id = :id AND status = 'iniciado'";
        $up = $pdo->prepare($sql);
        $up->execute(['id' => $pedidoId]);
        $mudou = $up->rowCount() === 1;
        if ($mudou && (int)$linha['estoque_reservado'] === 1) {
            pedido_estoque_devolver($pdo, json_decode((string)$linha['itens'], true));
        }
        if ($propria) {
            $pdo->commit();
        }
        return $mudou;
    } catch (Throwable $e) {
        if ($propria && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/** Liga o pedido ao link do Mercado Pago (preference_id). false se o link não for válido. */
function pedido_vincular(PDO $pdo, int $usuarioId, string $codigo, string $initPoint): bool
{
    $pref = mp_preference_do_link($initPoint);
    if ($pref === null || !mp_colunas_prontas($pdo)) {
        return false;
    }
    $up = $pdo->prepare(
        "UPDATE tb_loja_pedidos SET preference_id = :p, atualizado_em = NOW()
          WHERE codigo = :c AND usuario_id = :u AND status = 'iniciado' AND preference_id IS NULL"
    );
    $up->execute(['p' => $pref, 'c' => $codigo, 'u' => $usuarioId]);
    return $up->rowCount() === 1;
}

/** O Mercado Pago ainda tem pagamento em análise/pendente (boleto, Pix...) neste pedido? */
function pedido_mp_pagamento_pendente(array $resposta): bool
{
    foreach (($resposta['elements'] ?? []) as $ordem) {
        foreach (($ordem['payments'] ?? []) as $pg) {
            if (in_array((string)($pg['status'] ?? ''), ['pending', 'in_process', 'in_mediation', 'authorized'], true)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Libera o estoque de pedidos abandonados:
 *  1) sem link de pagamento há mais de PEDIDO_EXPIRA_SEM_LINK_MIN min -> apagado (o pagamento nunca foi gerado);
 *  2) com link há mais de PEDIDO_EXPIRA_COM_LINK_H h -> só se o Mercado Pago responder e NÃO houver pagamento
 *     aprovado nem pendente (aprovado vira "pago"). Sem MP_ACCESS_TOKEN esses pedidos nunca expiram.
 * Roda no máximo 1x por minuto. Nunca lança exceção. Devolve quantos pedidos liberou.
 */
function pedido_expirar_pendentes(PDO $pdo): int
{
    try {
        if (!prod_pedidos_prontos($pdo) || !mp_colunas_prontas($pdo)) {
            return 0;
        }
        $marca = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'intelbras_loja_expirar.tmp';
        if (is_file($marca) && time() - (int)@filemtime($marca) < PEDIDO_EXPIRAR_INTERVALO_S) {
            return 0;
        }
        @touch($marca);

        $liberados = 0;
        $st = $pdo->prepare(
            "SELECT id FROM tb_loja_pedidos
              WHERE status = 'iniciado' AND estoque_reservado = 1 AND preference_id IS NULL AND criado_em < :t
              ORDER BY id LIMIT " . PEDIDO_EXPIRAR_LOTE
        );
        $st->execute(['t' => date('Y-m-d H:i:s', time() - PEDIDO_EXPIRA_SEM_LINK_MIN * 60)]);
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $id) {
            if (pedido_cancelar_pendente($pdo, (int)$id, true)) {
                $liberados++;
            }
        }

        $token = frete_config('MP_ACCESS_TOKEN');
        if ($token !== '') {
            $st = $pdo->prepare(
                "SELECT id, preference_id FROM tb_loja_pedidos
                  WHERE status = 'iniciado' AND estoque_reservado = 1 AND preference_id IS NOT NULL AND criado_em < :t
                  ORDER BY id LIMIT " . PEDIDO_EXPIRAR_LOTE
            );
            $st->execute(['t' => date('Y-m-d H:i:s', time() - PEDIDO_EXPIRA_COM_LINK_H * 3600)]);
            $pagar = $pdo->prepare(
                "UPDATE tb_loja_pedidos SET status = 'pago', mp_payment_id = :pg, pago_em = :q, atualizado_em = :t
                  WHERE id = :id AND status = 'iniciado'"
            );
            foreach ($st->fetchAll() as $p) {
                $resp = mp_http_buscar((string)$p['preference_id'], $token);
                if (!is_array($resp)) {
                    continue;   // Mercado Pago fora do ar: não decide nada
                }
                $ok = mp_pagamento_aprovado($resp);
                if ($ok) {
                    $pagar->execute(['pg' => $ok['id'], 'q' => $ok['data'], 't' => date('Y-m-d H:i:s'), 'id' => $p['id']]);
                } elseif (!pedido_mp_pagamento_pendente($resp) && pedido_cancelar_pendente($pdo, (int)$p['id'], false)) {
                    $liberados++;
                }
            }
        }
        return $liberados;
    } catch (Throwable $e) {
        error_log('[loja/expirar] ' . $e->getMessage());
        return 0;
    }
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
