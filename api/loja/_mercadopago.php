<?php
/**
 * Confirmação de pagamento pelo Mercado Pago (sem depender do servidor AWS).
 *
 * Como funciona: ao clicar em "Pagar agora" o pedido é gravado com o
 * preference_id que vem no link do Mercado Pago (init_point). Depois, sempre
 * que alguém abre a aba "Compras" da Loja ou o Dashboard, os pedidos ainda
 * "iniciado" são consultados na API do Mercado Pago
 * (GET /merchant_orders/search?preference_id=...). Se houver pagamento
 * aprovado, o pedido vira "pago".
 *
 * Precisa de MP_ACCESS_TOKEN (env ou api/config.local.php): o Access Token da
 * MESMA conta do Mercado Pago usada pelo servidor que cria o pagamento.
 * Sem token, ou sem as colunas de database/loja_pagamento_mp.sql, não faz nada.
 */
declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/_frete.php';   // frete_config()

const MP_API = 'https://api.mercadopago.com';
const MP_DIAS_CONSULTA = 7;      // só consulta pedidos criados nos últimos N dias
const MP_LIMITE_POR_VEZ = 15;    // no máximo N consultas por chamada
const MP_ESPERA_SEG = 20;        // não consulta o mesmo pedido mais de 1x a cada N s

/** O banco já tem as colunas de loja_pagamento_mp.sql? */
function mp_colunas_prontas(PDO $pdo): bool
{
    static $pronto = null;
    if ($pronto === null) {
        try {
            $pdo->query('SELECT preference_id, mp_payment_id, pago_em FROM tb_loja_pedidos LIMIT 0');
            $pronto = true;
        } catch (PDOException $e) {
            $pronto = false;
        }
    }
    return $pronto;
}

/** Extrai o preference_id de um link do Mercado Pago (…?pref_id=XXXX). null se não for. */
function mp_preference_do_link(string $link): ?string
{
    $p = parse_url($link);
    $host = strtolower((string)($p['host'] ?? ''));
    if (($p['scheme'] ?? '') !== 'https' || !preg_match('/(^|\.)mercadopago\.[a-z.]+$/', $host)) {
        return null;
    }
    parse_str((string)($p['query'] ?? ''), $q);
    $id = (string)($q['pref_id'] ?? '');
    return preg_match('/^[A-Za-z0-9_-]{3,80}$/', $id) ? $id : null;
}

/** Consulta o Mercado Pago. Devolve o JSON decodificado ou null em qualquer falha. */
function mp_http_buscar(string $preferenceId, string $token): ?array
{
    $ch = curl_init(MP_API . '/merchant_orders/search?preference_id=' . rawurlencode($preferenceId));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token, 'Accept: application/json'],
    ]);
    $corpo = curl_exec($ch);
    $http  = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($corpo === false || $http !== 200) {
        error_log('[loja/mercadopago] HTTP ' . $http . ' ao consultar a preferência ' . $preferenceId);
        return null;
    }
    $d = json_decode((string)$corpo, true);
    return is_array($d) ? $d : null;
}

/** Do JSON do Mercado Pago, devolve o pagamento aprovado (id, data) ou null. */
function mp_pagamento_aprovado(array $resposta): ?array
{
    foreach (($resposta['elements'] ?? []) as $ordem) {
        foreach (($ordem['payments'] ?? []) as $pg) {
            if (($pg['status'] ?? '') === 'approved' && (float)($pg['amount_refunded'] ?? 0) <= 0) {
                $quando = strtotime((string)($pg['date_approved'] ?? '')) ?: time();
                return ['id' => (string)($pg['id'] ?? ''), 'data' => date('Y-m-d H:i:s', $quando)];
            }
        }
    }
    return null;
}

/**
 * Confere no Mercado Pago os pedidos "iniciado" (de um usuário, ou de todos se
 * $usuarioId for null) e marca como "pago" os aprovados. Devolve quantos mudaram.
 * Nunca lança exceção: falha de rede/banco só deixa o pedido como está.
 *
 * @param callable|null $buscar fn(string $preferenceId, string $token): ?array — troca da chamada HTTP (testes)
 */
function mp_sincronizar_pedidos(PDO $pdo, ?int $usuarioId = null, ?callable $buscar = null): int
{
    try {
        $token = frete_config('MP_ACCESS_TOKEN');
        if ($token === '' || !mp_colunas_prontas($pdo)) {
            return 0;
        }
        $buscar ??= 'mp_http_buscar';

        $agora = time();
        $sql = "SELECT id, preference_id FROM tb_loja_pedidos
                 WHERE status = 'iniciado' AND preference_id IS NOT NULL
                   AND criado_em >= :desde AND atualizado_em <= :espera"
             . ($usuarioId !== null ? ' AND usuario_id = :u' : '')
             . ' ORDER BY id DESC LIMIT ' . MP_LIMITE_POR_VEZ;
        $params = [
            'desde'  => date('Y-m-d H:i:s', $agora - MP_DIAS_CONSULTA * 86400),
            'espera' => date('Y-m-d H:i:s', $agora - MP_ESPERA_SEG),
        ];
        if ($usuarioId !== null) {
            $params['u'] = $usuarioId;
        }
        $st = $pdo->prepare($sql);
        $st->execute($params);

        $tocar = $pdo->prepare('UPDATE tb_loja_pedidos SET atualizado_em = :t WHERE id = :id');
        $pagar = $pdo->prepare("UPDATE tb_loja_pedidos
                                   SET status = 'pago', mp_payment_id = :pg, pago_em = :quando, atualizado_em = :t
                                 WHERE id = :id AND status = 'iniciado'");
        $mudaram = 0;
        foreach ($st->fetchAll() as $p) {
            $agoraTxt = date('Y-m-d H:i:s');
            $tocar->execute(['t' => $agoraTxt, 'id' => $p['id']]);   // marca a tentativa (evita consultar toda hora)
            $resposta = $buscar((string)$p['preference_id'], $token);
            $ok = is_array($resposta) ? mp_pagamento_aprovado($resposta) : null;
            if ($ok) {
                $pagar->execute(['pg' => $ok['id'], 'quando' => $ok['data'], 't' => $agoraTxt, 'id' => $p['id']]);
                $mudaram += $pagar->rowCount();
            }
        }
        return $mudaram;
    } catch (Throwable $e) {
        error_log('[loja/mercadopago] ' . $e->getMessage());
        return 0;
    }
}
