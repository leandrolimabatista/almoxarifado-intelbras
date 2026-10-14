<?php
/**
 * POST api/loja/frete.php
 *   Corpo:    { "cep": "01310-100", "itens": [ { "id": "VIP1230B", "quantidade": 2, "preco": 249.9 } ] }
 *   Sucesso:  { "sucesso": true,  "opcoes": [ { id, nome, preco, prazo:[min,max] } ] }
 *   Sem token (ou se o Melhor Envio falhar) devolve uma ESTIMATIVA local por
 *   CEP + peso, com "estimado": true. Se nem isso for possível (CEP fora das
 *   faixas) devolve sucesso:false e o navegador usa a tabela por região de
 *   loja.dados.js — o checkout nunca trava por causa desta API.
 *
 * Configuração (env ou api/config.local.php):
 *   MELHOR_ENVIO_TOKEN    token da conta (obrigatório)
 *   LOJA_CEP_ORIGEM       CEP de onde os produtos saem (obrigatório)
 *   LOJA_CONTATO_EMAIL    e-mail de contato exigido pelo Melhor Envio
 *   MELHOR_ENVIO_SANDBOX  "1" para usar o ambiente de testes
 */
declare(strict_types=1);

require_once __DIR__ . '/_frete.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function frete_resposta(int $http, array $dados): void
{
    http_response_code($http);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    frete_resposta(405, ['sucesso' => false, 'motivo' => 'metodo']);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
if ((int)($_SESSION['usuario_id'] ?? 0) <= 0) {
    frete_resposta(401, ['sucesso' => false, 'motivo' => 'nao_autenticado']);
}

// Limite simples por sessão: protege a cota da conta no Melhor Envio.
$agora = time();
$janela = array_filter(
    (array)($_SESSION['frete_chamadas'] ?? []),
    static fn ($t) => is_int($t) && $t > $agora - 60
);
if (count($janela) >= 20) {
    frete_resposta(429, ['sucesso' => false, 'motivo' => 'limite']);
}
$janela[] = $agora;
$_SESSION['frete_chamadas'] = array_values($janela);
session_write_close();   // não segura a sessão durante a chamada externa

$bruto = file_get_contents('php://input');
$corpo = json_decode($bruto === false ? '' : $bruto, true);
$corpo = is_array($corpo) ? $corpo : [];

$destino = frete_cep((string)($corpo['cep'] ?? ''));
if ($destino === '') {
    frete_resposta(422, ['sucesso' => false, 'motivo' => 'cep_invalido']);
}

try {
    $catalogo = require __DIR__ . '/_catalogo_frete.php';
    $itens    = frete_validar_itens($corpo['itens'] ?? null, $catalogo);
} catch (FreteErro $e) {
    frete_resposta(422, ['sucesso' => false, 'motivo' => 'carrinho_invalido']);
}

// 1) Cotação real (Melhor Envio), se estiver configurada.
$token  = frete_config('MELHOR_ENVIO_TOKEN');
$origem = frete_cep(frete_config('LOJA_CEP_ORIGEM'));
if ($token !== '' && $origem !== '') {
    try {
        $contato  = frete_config('LOJA_CONTATO_EMAIL');
        $servicos = frete_cotar_api(
            frete_montar_payload($origem, $destino, $itens, $catalogo),
            $token,
            frete_config('MELHOR_ENVIO_SANDBOX') === '1',
            $contato !== '' ? $contato : 'contato@intelbras.com.br'
        );
        $opcoes = frete_normalizar($servicos);
        if ($opcoes) {
            frete_resposta(200, ['sucesso' => true, 'estimado' => false, 'opcoes' => $opcoes]);
        }
    } catch (FreteErro $e) {
        error_log('[loja/frete] ' . $e->getMessage());
    }
}

// 2) Estimativa local por CEP + peso (sem token configurado ou API indisponível).
$opcoes = frete_estimar($destino, $itens, $catalogo);
if (!$opcoes) {
    frete_resposta(200, ['sucesso' => false, 'motivo' => 'sem_opcoes']);
}
frete_resposta(200, ['sucesso' => true, 'estimado' => true, 'opcoes' => $opcoes]);
