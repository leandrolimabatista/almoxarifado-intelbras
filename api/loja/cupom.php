<?php
/**
 * api/loja/cupom.php — cupons de desconto da Loja
 *
 *   POST (qualquer usuário logado) · JSON
 *     { "acao":"validar", "codigo":"INTEL10", "itens":[ {"id":"VIP1230B","quantidade":2} ] }
 *     -> { sucesso:true, cupom:{codigo,tipo,valor,minimo}, desconto:49.98 }
 *        { sucesso:false, erro:"Cupom inválido ou expirado." }   (422)
 *     Os preços vêm do catálogo do banco; o navegador só diz o que está no carrinho.
 *     Limite: 15 tentativas por minuto por sessão (impede ficar adivinhando códigos).
 *
 *   POST (SOMENTE o Administrador Intelbras, usuário id 1 · header X-CSRF-Token)
 *     { "acao":"listar" }
 *     { "acao":"criar"|"editar", codigo, tipo, valor, ativo, valido_de, valido_ate, usos_max, por_usuario, valor_minimo }
 *     { "acao":"alternar", codigo, ativo }
 *     { "acao":"remover", codigo }
 *     -> { sucesso:true, cupons:[...] }   ou   { sucesso:false, erro, campo? }
 *
 * Requer database/loja_cupons.sql aplicado no banco.
 */
declare(strict_types=1);

require_once __DIR__ . '/../dashboard/_bootstrap.php';   // JSON, conexão e constantes do módulo admin (usr_*)
require_once __DIR__ . '/_produtos.php';
require_once __DIR__ . '/_cupons.php';

const CUPOM_TENTATIVAS_MIN = 15;

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    usr_erro(405, 'Método não permitido.');
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$uid = (int)($_SESSION['usuario_id'] ?? 0);
$csrfSessao = (string)($_SESSION['csrf_usuarios'] ?? '');
if ($uid <= 0) {
    session_write_close();
    usr_erro(401, 'Não autenticado.');
}

$corpo = json_decode((string)file_get_contents('php://input'), true);
$corpo = is_array($corpo) ? $corpo : [];
$acao  = (string)($corpo['acao'] ?? '');

$ehAdminAcao = in_array($acao, ['listar', 'criar', 'editar', 'alternar', 'remover'], true);
if (!$ehAdminAcao && $acao !== 'validar') {
    session_write_close();
    usr_erro(422, 'Ação inválida.');
}

if ($ehAdminAcao) {
    session_write_close();
    if ($uid !== USR_ADMIN_ID) {
        usr_erro(403, 'Você não tem permissão para acessar esta área.');
    }
    $recebido = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($csrfSessao === '' || !hash_equals($csrfSessao, $recebido)) {
        usr_erro(403, 'Requisição inválida. Recarregue a página.');
    }
} else {
    // Limite simples por sessão para quem tenta adivinhar códigos.
    $agora  = time();
    $janela = array_filter((array)($_SESSION['cupom_tentativas'] ?? []), static fn($t) => is_int($t) && $t > $agora - 60);
    if (count($janela) >= CUPOM_TENTATIVAS_MIN) {
        session_write_close();
        usr_resposta(429, ['sucesso' => false, 'erro' => 'Muitas tentativas. Aguarde um minuto e tente de novo.']);
    }
    $janela[] = $agora;
    $_SESSION['cupom_tentativas'] = array_values($janela);
    session_write_close();
}

try {
    $pdo = conectar();
    if (!cupom_prontos($pdo)) {
        usr_erro(503, 'Cupons ainda não instalados no banco. Rode database/loja_cupons.sql no phpMyAdmin.');
    }

    // ----------------------------------------------------------- cliente
    if ($acao === 'validar') {
        $brutos = $corpo['itens'] ?? null;
        if (!is_array($brutos) || !$brutos || count($brutos) > 30) {
            throw new CupomErro('Seu carrinho está vazio.');
        }
        $mapa   = prod_mapa_ativos($pdo);
        $linhas = [];
        $vistos = [];
        foreach ($brutos as $it) {
            $id  = is_array($it) ? (string)($it['id'] ?? '') : '';
            $qtd = is_array($it) ? (int)($it['quantidade'] ?? 0) : 0;
            if (!isset($mapa[$id]) || isset($vistos[$id]) || $qtd < 1 || $qtd > 99) {
                throw new CupomErro('Atualize a Loja: há itens no carrinho que não estão mais disponíveis.', 409);
            }
            $vistos[$id] = true;
            $linhas[] = ['preco' => cupom_centavos($mapa[$id]['preco']), 'qtd' => $qtd];
        }
        $sub = 0;
        foreach ($linhas as $l) {
            $sub += $l['preco'] * $l['qtd'];
        }
        $c = cupom_verificar($pdo, (string)($corpo['codigo'] ?? ''), $uid, $sub);
        $r = cupom_ratear($linhas, $c);
        usr_resposta(200, ['sucesso' => true, 'cupom' => cupom_publico($c), 'desconto' => $r['desconto'] / 100]);
    }

    // ------------------------------------------------------------- admin
    if ($acao === 'listar') {
        usr_resposta(200, ['sucesso' => true, 'cupons' => cupom_listar($pdo)]);
    }
    if ($acao === 'criar') {
        cupom_criar($pdo, cupom_validar($corpo));
        usr_resposta(200, ['sucesso' => true, 'cupons' => cupom_listar($pdo)]);
    }
    if ($acao === 'editar') {
        cupom_atualizar($pdo, cupom_validar($corpo));
        usr_resposta(200, ['sucesso' => true, 'cupons' => cupom_listar($pdo)]);
    }
    if ($acao === 'alternar') {
        cupom_alternar($pdo, (string)($corpo['codigo'] ?? ''), !empty($corpo['ativo']));
        usr_resposta(200, ['sucesso' => true, 'cupons' => cupom_listar($pdo)]);
    }
    // remover
    cupom_remover($pdo, (string)($corpo['codigo'] ?? ''));
    usr_resposta(200, ['sucesso' => true, 'cupons' => cupom_listar($pdo)]);
} catch (CupomErro $e) {
    $http = in_array($e->getCode(), [404, 409, 422, 429, 503], true) ? $e->getCode() : 422;
    usr_resposta($http, ['sucesso' => false, 'erro' => $e->getMessage(), 'campo' => $e->campo]);
} catch (Throwable $e) {
    error_log('[loja/cupom] ' . $e->getMessage());
    usr_erro(500, 'Não foi possível processar o cupom agora.');
}
