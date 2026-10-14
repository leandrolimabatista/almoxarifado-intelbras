<?php
/**
 * Lógica de cotação de frete da Loja (Melhor Envio).
 * Só funções, sem headers/sessão: o endpoint é frete.php.
 *
 * Fluxo: o navegador manda CEP de destino + [{id, quantidade, preco}];
 * aqui o peso/medidas vêm de _catalogo_frete.php (servidor), a cotação
 * vai ao Melhor Envio e voltam as opções já no formato que o checkout
 * usa: { id, nome, preco, prazo:[min,max] }.
 */
declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

const FRETE_URL_PRODUCAO = 'https://melhorenvio.com.br';
const FRETE_URL_SANDBOX  = 'https://sandbox.melhorenvio.com.br';
const FRETE_CAMINHO      = '/api/v2/me/shipment/calculate';
const FRETE_TIMEOUT_S    = 8;
const FRETE_MAX_OPCOES   = 4;
const FRETE_MAX_ITENS    = 30;   // linhas distintas no carrinho
const FRETE_MAX_QTD      = 99;   // por linha

class FreteErro extends RuntimeException
{
}

/**
 * Lê uma configuração: variável de ambiente primeiro, depois
 * api/config.local.php (não versionado). Mesmo padrão de api/ia/enviar.php.
 */
function frete_config(string $nome): string
{
    $env = getenv($nome);
    if ($env !== false && trim($env) !== '') {
        return trim($env);
    }
    $arquivo = dirname(__DIR__) . '/config.local.php';
    if (is_file($arquivo)) {
        $cfg = require $arquivo;
        if (is_array($cfg) && isset($cfg[$nome])) {
            return trim((string)$cfg[$nome]);
        }
    }
    return '';
}

/** Só dígitos; devolve '' se não tiver exatamente 8. */
function frete_cep(string $valor): string
{
    $d = preg_replace('/\D+/', '', $valor) ?? '';
    return strlen($d) === 8 ? $d : '';
}

/**
 * Valida o que veio do navegador e devolve [['id'=>..,'quantidade'=>..,'preco'=>..], ...].
 * Ids fora do catálogo são recusados (não dá para cotar item inventado).
 */
function frete_validar_itens($bruto, array $catalogo): array
{
    if (!is_array($bruto) || !$bruto || count($bruto) > FRETE_MAX_ITENS) {
        throw new FreteErro('Carrinho inválido.');
    }
    $saida = [];
    foreach ($bruto as $it) {
        $id  = is_array($it) ? (string)($it['id'] ?? '') : '';
        $qtd = is_array($it) ? (int)($it['quantidade'] ?? 0) : 0;
        if (!isset($catalogo['categorias'][$id]) && !isset($catalogo['produtos'][$id])) {
            throw new FreteErro('Produto desconhecido: ' . substr($id, 0, 40));
        }
        if ($qtd < 1 || $qtd > FRETE_MAX_QTD) {
            throw new FreteErro('Quantidade inválida.');
        }
        // Preço só entra como valor declarado (seguro); limita para não ser abusado.
        $preco = is_array($it) ? (float)($it['preco'] ?? 0) : 0.0;
        $saida[] = [
            'id'         => $id,
            'quantidade' => $qtd,
            'preco'      => max(0.0, min($preco, 50000.0)),
        ];
    }
    return $saida;
}

/** Peso/medidas de um produto (exceção do produto > padrão da categoria > geral). */
function frete_medidas(string $id, array $catalogo): array
{
    if (isset($catalogo['produtos'][$id])) {
        return $catalogo['produtos'][$id];
    }
    $cat = $catalogo['categorias'][$id] ?? 'geral';
    return $catalogo['padrao'][$cat] ?? $catalogo['padrao']['geral'];
}

/** Corpo da requisição ao Melhor Envio. */
function frete_montar_payload(string $cepOrigem, string $cepDestino, array $itens, array $catalogo): array
{
    $produtos = [];
    foreach ($itens as $it) {
        $m = frete_medidas($it['id'], $catalogo);
        $produtos[] = [
            'id'              => $it['id'],
            'width'           => $m['largura'],
            'height'          => $m['altura'],
            'length'          => $m['comprimento'],
            'weight'          => $m['peso'],
            'insurance_value' => round($it['preco'], 2),
            'quantity'        => $it['quantidade'],
        ];
    }
    return [
        'from'     => ['postal_code' => $cepOrigem],
        'to'       => ['postal_code' => $cepDestino],
        'products' => $produtos,
        'options'  => ['receipt' => false, 'own_hand' => false],
    ];
}

/**
 * Resposta do Melhor Envio -> opções do checkout.
 * Descarta serviços com erro/sem preço, ordena do mais barato ao mais caro
 * e limita a FRETE_MAX_OPCOES.
 */
function frete_normalizar(array $servicos): array
{
    $opcoes = [];
    foreach ($servicos as $s) {
        if (!is_array($s) || !empty($s['error'])) {
            continue;
        }
        $preco = $s['custom_price'] ?? $s['price'] ?? null;
        if (!is_numeric($preco) || (float)$preco <= 0) {
            continue;
        }

        $faixa = $s['custom_delivery_range'] ?? $s['delivery_range'] ?? null;
        if (is_array($faixa) && isset($faixa['min'], $faixa['max'])) {
            $min = (int)$faixa['min'];
            $max = (int)$faixa['max'];
        } else {
            $dias = (int)($s['custom_delivery_time'] ?? $s['delivery_time'] ?? 0);
            $min = $max = $dias;
        }
        if ($max < 1) {
            continue;
        }
        $min = max(1, min($min, $max));

        $empresa = trim((string)($s['company']['name'] ?? ''));
        $servico = ltrim(trim((string)($s['name'] ?? '')), '. ');
        $nome = $empresa !== '' && stripos($servico, $empresa) === false
            ? $empresa . ' ' . $servico
            : $servico;
        if ($nome === '') {
            continue;
        }

        $opcoes[] = [
            'id'    => 'me-' . (int)($s['id'] ?? 0),
            'nome'  => $nome,
            'preco' => round((float)$preco, 2),
            'prazo' => [$min, $max],
        ];
    }

    usort($opcoes, static fn (array $a, array $b): int => $a['preco'] <=> $b['preco']);
    return array_slice($opcoes, 0, FRETE_MAX_OPCOES);
}

/** Chamada HTTP ao Melhor Envio. Lança FreteErro em qualquer falha. */
function frete_cotar_api(array $payload, string $token, bool $sandbox, string $contato): array
{
    if (!function_exists('curl_init')) {
        throw new FreteErro('Extensão cURL do PHP não está habilitada.');
    }
    $url = ($sandbox ? FRETE_URL_SANDBOX : FRETE_URL_PRODUCAO) . FRETE_CAMINHO;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_TIMEOUT        => FRETE_TIMEOUT_S,
        CURLOPT_HTTPHEADER     => [
            'Accept: application/json',
            'Content-Type: application/json',
            'Authorization: Bearer ' . $token,
            // O Melhor Envio exige identificar a aplicação e um e-mail de contato.
            'User-Agent: Loja Intelbras (' . $contato . ')',
        ],
    ]);
    $corpo  = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $erro   = curl_error($ch);
    curl_close($ch);

    if ($corpo === false) {
        throw new FreteErro('Falha de rede ao cotar frete: ' . $erro);
    }
    $dados = json_decode((string)$corpo, true);
    if ($status < 200 || $status >= 300 || !is_array($dados)) {
        throw new FreteErro('Melhor Envio respondeu HTTP ' . $status);
    }
    return $dados;
}


/* ============================================================
   ESTIMATIVA LOCAL (sem API de transportadora)
   Usada quando o Melhor Envio não está configurado ou falha.
   Preço = base da região + adicional por kg excedente. O peso é o maior
   entre o real e o cubado (L×A×C ÷ 6000), como as transportadoras cobram.
   ⚠ VALORES DE EXEMPLO: ajustar à tabela real da transportadora.
============================================================ */

/** Faixas de CEP por UF (início, fim, UF). */
const FRETE_FAIXAS_UF = [
    [1000, 19999, 'SP'], [20000, 28999, 'RJ'], [29000, 29999, 'ES'], [30000, 39999, 'MG'],
    [40000, 48999, 'BA'], [49000, 49999, 'SE'], [50000, 56999, 'PE'], [57000, 57999, 'AL'],
    [58000, 58999, 'PB'], [59000, 59999, 'RN'], [60000, 63999, 'CE'], [64000, 64999, 'PI'],
    [65000, 65999, 'MA'], [66000, 68899, 'PA'], [68900, 68999, 'AP'], [69000, 69299, 'AM'],
    [69300, 69399, 'RR'], [69400, 69899, 'AM'], [69900, 69999, 'AC'], [70000, 72799, 'DF'],
    [72800, 72999, 'GO'], [73000, 73699, 'DF'], [73700, 76799, 'GO'], [76800, 76999, 'RO'],
    [77000, 77999, 'TO'], [78000, 78899, 'MT'], [78900, 78999, 'RO'], [79000, 79999, 'MS'],
    [80000, 87999, 'PR'], [88000, 89999, 'SC'], [90000, 99999, 'RS'],
];

const FRETE_REGIAO_UF = [
    'SP' => 'sudeste', 'RJ' => 'sudeste', 'MG' => 'sudeste', 'ES' => 'sudeste',
    'PR' => 'sul', 'SC' => 'sul', 'RS' => 'sul',
    'DF' => 'centroeste', 'GO' => 'centroeste', 'MT' => 'centroeste', 'MS' => 'centroeste',
    'BA' => 'nordeste', 'SE' => 'nordeste', 'AL' => 'nordeste', 'PE' => 'nordeste', 'PB' => 'nordeste',
    'RN' => 'nordeste', 'CE' => 'nordeste', 'PI' => 'nordeste', 'MA' => 'nordeste',
    'AM' => 'norte', 'PA' => 'norte', 'AC' => 'norte', 'RO' => 'norte', 'RR' => 'norte', 'AP' => 'norte', 'TO' => 'norte',
];

/**
 * Por região: [base padrão, base expressa, kg adicional padrão, kg adicional expressa,
 *              prazo padrão [min,max], prazo expressa [min,max]]
 */
/**
 * Multiplicador sobre TODA a estimativa (1.00 = tabela cheia; 0.70 = 30% mais barato).
 * Só vale para a estimativa local; a cotação real do Melhor Envio não é alterada.
 */
const FRETE_FATOR_PRECO = 0.70;

const FRETE_TARIFA_REGIAO = [
    'sudeste'    => [16.90, 29.90, 3.00, 5.10, [3, 5],  [1, 2]],
    'sul'        => [21.90, 36.90, 3.80, 6.50, [4, 6],  [2, 3]],
    'centroeste' => [24.90, 39.90, 4.20, 7.10, [5, 7],  [2, 4]],
    'nordeste'   => [29.90, 49.90, 5.00, 8.50, [6, 9],  [3, 5]],
    'norte'      => [34.90, 54.90, 6.50, 11.00, [8, 12], [4, 7]],
];

/**
 * Zonas dentro de cada estado, por prefixo de CEP (5 primeiros dígitos):
 * 'capital' e 'metro' (região metropolitana/entorno); o resto do estado é 'interior'.
 * ⚠ Faixas aproximadas (agrupam municípios por intervalo de CEP) — ajustar se
 * precisar de mais precisão. Estado ausente aqui = tudo conta como interior.
 */
const FRETE_ZONAS = [
    'SP' => ['capital' => [[1000, 5999], [8000, 8499]], 'metro' => [[6000, 7999], [8500, 9999], [11000, 11999]]],
    'RJ' => ['capital' => [[20000, 23799]],             'metro' => [[24000, 25299], [26000, 26600]]],
    'MG' => ['capital' => [[30000, 31999]],             'metro' => [[32000, 34999]]],
    'ES' => ['capital' => [[29000, 29099]],             'metro' => [[29100, 29199]]],
    'PR' => ['capital' => [[80000, 82999]],             'metro' => [[83000, 83999]]],
    'SC' => ['capital' => [[88000, 88099]],             'metro' => [[88100, 88199]]],
    'RS' => ['capital' => [[90000, 91999]],             'metro' => [[92000, 94999]]],
    'DF' => ['capital' => [[70000, 70999]],             'metro' => [[71000, 72799], [73000, 73699]]],
    'GO' => ['capital' => [[74000, 74894]],             'metro' => [[72800, 72999], [73700, 73999], [74895, 75000]]],
    'MT' => ['capital' => [[78000, 78109]],             'metro' => [[78110, 78199]]],
    'MS' => ['capital' => [[79000, 79129]],             'metro' => []],
    'BA' => ['capital' => [[40000, 42599]],             'metro' => [[42600, 43999]]],
    'SE' => ['capital' => [[49000, 49099]],             'metro' => [[49100, 49199]]],
    'AL' => ['capital' => [[57000, 57099]],             'metro' => [[57100, 57199]]],
    'PE' => ['capital' => [[50000, 52999]],             'metro' => [[53000, 54999]]],
    'PB' => ['capital' => [[58000, 58099]],             'metro' => [[58300, 58319]]],
    'RN' => ['capital' => [[59000, 59139]],             'metro' => [[59140, 59299]]],
    'CE' => ['capital' => [[60000, 61599]],             'metro' => [[61600, 61999]]],
    'PI' => ['capital' => [[64000, 64099]],             'metro' => []],
    'MA' => ['capital' => [[65000, 65099]],             'metro' => [[65100, 65199]]],
    'PA' => ['capital' => [[66000, 66999]],             'metro' => [[67000, 67199]]],
    'AP' => ['capital' => [[68900, 68914]],             'metro' => []],
    'AM' => ['capital' => [[69000, 69099]],             'metro' => []],
    'RR' => ['capital' => [[69300, 69339]],             'metro' => []],
    'AC' => ['capital' => [[69900, 69920]],             'metro' => []],
    'RO' => ['capital' => [[76800, 76834]],             'metro' => []],
    'TO' => ['capital' => [[77000, 77249]],             'metro' => []],
];

/** Fator aplicado ao preço conforme a zona. O interior pesa mais nas regiões mais distantes. */
const FRETE_FATOR_METRO = 1.10;
const FRETE_FATOR_INTERIOR = [
    'sudeste' => 1.25, 'sul' => 1.30, 'centroeste' => 1.35, 'nordeste' => 1.40, 'norte' => 1.60,
];
/** Dias úteis somados ao prazo no interior: [no mínimo, no máximo]. */
const FRETE_PRAZO_INTERIOR = [1, 2];

/** 'capital' | 'metropolitana' | 'interior' para o CEP dentro da UF. */
function frete_zona(string $cep, string $uf): string
{
    $prefixo = (int)substr($cep, 0, 5);
    foreach (['capital' => 'capital', 'metro' => 'metropolitana'] as $chave => $nome) {
        foreach (FRETE_ZONAS[$uf][$chave] ?? [] as [$ini, $fim]) {
            if ($prefixo >= $ini && $prefixo <= $fim) {
                return $nome;
            }
        }
    }
    return 'interior';
}

/** UF a partir do CEP (8 dígitos) ou null se estiver fora das faixas. */
function frete_uf_do_cep(string $cep): ?string
{
    $prefixo = (int)substr($cep, 0, 5);
    foreach (FRETE_FAIXAS_UF as [$ini, $fim, $uf]) {
        if ($prefixo >= $ini && $prefixo <= $fim) {
            return $uf;
        }
    }
    return null;
}

/** Peso tarifável do carrinho em kg: por item, o maior entre real e cubado. */
function frete_peso_tarifavel(array $itens, array $catalogo): float
{
    $total = 0.0;
    foreach ($itens as $it) {
        $m = frete_medidas($it['id'], $catalogo);
        $cubado = ($m['largura'] * $m['altura'] * $m['comprimento']) / 6000;
        $total += max((float)$m['peso'], $cubado) * $it['quantidade'];
    }
    return $total;
}

/** Opções de frete estimadas pelo CEP (estado + zona) e peso. Lista vazia se o CEP não for reconhecido. */
function frete_estimar(string $cepDestino, array $itens, array $catalogo): array
{
    $uf = frete_uf_do_cep($cepDestino);
    $regiao = $uf !== null ? (FRETE_REGIAO_UF[$uf] ?? null) : null;
    if ($regiao === null) {
        return [];
    }
    [$basePad, $baseExp, $kgPad, $kgExp, $prazoPad, $prazoExp] = FRETE_TARIFA_REGIAO[$regiao];
    $excedente = max(0, (int)ceil(frete_peso_tarifavel($itens, $catalogo)) - 1);

    $zona  = frete_zona($cepDestino, $uf);
    $fator = $zona === 'capital' ? 1.0 : ($zona === 'metropolitana' ? FRETE_FATOR_METRO : FRETE_FATOR_INTERIOR[$regiao]);
    if ($zona === 'interior') {
        $prazoPad = [$prazoPad[0] + FRETE_PRAZO_INTERIOR[0], $prazoPad[1] + FRETE_PRAZO_INTERIOR[1]];
        $prazoExp = [$prazoExp[0] + FRETE_PRAZO_INTERIOR[0], $prazoExp[1] + FRETE_PRAZO_INTERIOR[1]];
    }

    return [
        ['id' => 'padrao',   'nome' => 'Entrega padrão',   'preco' => round(($basePad + $excedente * $kgPad) * $fator * FRETE_FATOR_PRECO, 2), 'prazo' => $prazoPad],
        ['id' => 'expressa', 'nome' => 'Entrega expressa', 'preco' => round(($baseExp + $excedente * $kgExp) * $fator * FRETE_FATOR_PRECO, 2), 'prazo' => $prazoExp],
    ];
}
