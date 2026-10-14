<?php
/**
 * Peso e dimensões dos produtos da Loja, usados na cotação de frete.
 *
 * ⚠ VALORES ESTIMADOS — confirmar com a embalagem real de cada produto
 * (peso da caixa fechada, não do produto solto). Cotação com medidas
 * erradas gera frete errado e cobrança de diferença pela transportadora.
 *
 * Fica no SERVIDOR de propósito: o navegador só manda "id + quantidade",
 * então ninguém consegue reduzir o frete alterando peso/medidas no JS.
 *
 * Formato: peso em kg; largura, altura e comprimento em cm.
 * 'padrao' vale para a categoria inteira; 'produtos' sobrescreve por id.
 * Produto novo no catálogo (loja.dados.js) sem entrada aqui usa o padrão
 * da categoria; sem categoria conhecida usa 'geral'.
 */
declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

return [
    'padrao' => [
        'cameras'   => ['peso' => 0.7,  'largura' => 20, 'altura' => 14, 'comprimento' => 24],
        'redes'     => ['peso' => 0.6,  'largura' => 22, 'altura' => 8,  'comprimento' => 28],
        'alarmes'   => ['peso' => 0.4,  'largura' => 16, 'altura' => 10, 'comprimento' => 20],
        'telefonia' => ['peso' => 0.8,  'largura' => 24, 'altura' => 12, 'comprimento' => 28],
        'energia'   => ['peso' => 1.5,  'largura' => 25, 'altura' => 15, 'comprimento' => 30],
        'geral'     => ['peso' => 1.0,  'largura' => 25, 'altura' => 15, 'comprimento' => 30],
    ],

    // id do produto => categoria (usado só para achar o padrão acima)
    'categorias' => [
        'VIP1230B' => 'cameras',   'VIP3230D' => 'cameras',  'MIBOCAM2' => 'cameras',  'NVD1408'   => 'cameras',
        'ARF1200'  => 'redes',     'SG2404MR' => 'redes',    'ACCESSPT' => 'redes',    'PATCHCB5'  => 'redes',
        'AMT8000'  => 'alarmes',   'IVPDUAL'  => 'alarmes',  'XAT4010'  => 'alarmes',
        'TIP200LT' => 'telefonia', 'TS4010'   => 'telefonia', 'HEADSETPRO' => 'telefonia',
        'NOBRK1200' => 'energia',  'FILTLINHA' => 'energia',
    ],

    // Exceções ao padrão da categoria
    'produtos' => [
        'NVD1408'    => ['peso' => 1.8, 'largura' => 38, 'altura' => 10, 'comprimento' => 32],
        'SG2404MR'   => ['peso' => 3.2, 'largura' => 50, 'altura' => 12, 'comprimento' => 36],
        'PATCHCB5'   => ['peso' => 0.1, 'largura' => 16, 'altura' => 4,  'comprimento' => 20],
        'TS4010'     => ['peso' => 3.5, 'largura' => 40, 'altura' => 14, 'comprimento' => 32],
        'HEADSETPRO' => ['peso' => 0.4, 'largura' => 20, 'altura' => 10, 'comprimento' => 22],
        'NOBRK1200'  => ['peso' => 8.5, 'largura' => 36, 'altura' => 22, 'comprimento' => 34],
        'FILTLINHA'  => ['peso' => 0.5, 'largura' => 30, 'altura' => 8,  'comprimento' => 12],
    ],
];
