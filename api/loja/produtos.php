<?php
/**
 * api/loja/produtos.php — catálogo da Loja
 *
 *   GET   (qualquer usuário logado)
 *         -> { sucesso, admin, categorias:[{id,nome}], produtos:[{id,cat,name,desc,price,stock,image,max}] }
 *         O estoque devolvido já desconta os pedidos em andamento. Também libera o estoque de pedidos
 *         abandonados (ver pedido_expirar_pendentes).
 *
 *   POST  (SOMENTE o Administrador Intelbras, usuário id 1 · multipart/form-data · header X-CSRF-Token)
 *         acao=criar    codigo, titulo, descricao, preco, estoque, categoria, [imagem]
 *         acao=editar   codigo, titulo, descricao, preco, estoque, estoque_base, categoria, [imagem], [remover_imagem=1]
 *         acao=remover  codigo
 *         -> { sucesso, produto?, produtos:[...] }   ou   { sucesso:false, erro, campo? }
 *
 * Mesma proteção do módulo administrativo (api/dashboard/_bootstrap.php): 401 sem sessão,
 * 403 se não for o administrador, 403 sem token CSRF válido.
 */
declare(strict_types=1);

require_once __DIR__ . '/../dashboard/_bootstrap.php';   // JSON + sessão/admin/CSRF (usr_*)
require_once __DIR__ . '/_pedidos.php';                  // expiração de reservas
require_once __DIR__ . '/_produtos.php';

$metodo = $_SERVER['REQUEST_METHOD'] ?? '';

try {
    // ------------------------------------------------------------------ GET
    if ($metodo === 'GET') {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        $uid = (int)($_SESSION['usuario_id'] ?? 0);
        session_write_close();
        if ($uid <= 0) {
            usr_erro(401, 'Não autenticado.');
        }

        $pdo = conectar();
        if (!prod_tabela_pronta($pdo)) {
            usr_erro(503, 'O catálogo ainda não foi instalado no banco. Rode database/loja_catalogo.sql no phpMyAdmin.');
        }
        pedido_expirar_pendentes($pdo);
        usr_resposta(200, [
            'sucesso'    => true,
            'admin'      => $uid === USR_ADMIN_ID,
            'categorias' => prod_categorias($pdo),
            'produtos'   => prod_listar($pdo),
        ]);
    }

    // ----------------------------------------------------------------- POST
    if ($metodo !== 'POST') {
        usr_erro(405, 'Método não permitido.');
    }
    usr_iniciar(['POST']);   // 401 / 403 (não é o administrador)
    usr_exigir_csrf();

    if (!$_POST && !$_FILES && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
        throw new ProdutoErro('A imagem é grande demais para o servidor. Use um arquivo de até 5MB.', 413, 'lpImagem');
    }

    $pdo = conectar();
    if (!prod_tabela_pronta($pdo)) {
        usr_erro(503, 'O catálogo ainda não foi instalado no banco. Rode database/loja_catalogo.sql no phpMyAdmin.');
    }

    $acao      = (string)($_POST['acao'] ?? '');
    $categorias = prod_categorias($pdo);

    if ($acao === 'criar') {
        $d   = prod_validar($_POST, true, $categorias);
        $img = prod_validar_imagem($_FILES['imagem'] ?? null);
        $produto = prod_criar($pdo, $d, $img);
        usr_resposta(200, ['sucesso' => true, 'produto' => $produto, 'produtos' => prod_listar($pdo)]);
    }

    if ($acao === 'editar') {
        $id = strtoupper(trim((string)($_POST['codigo'] ?? '')));
        if (!preg_match(PROD_ID_REGEX, $id)) {
            throw new ProdutoErro('Item inválido.', 422);
        }
        $d   = prod_validar($_POST, false, $categorias);
        $img = prod_validar_imagem($_FILES['imagem'] ?? null);
        $base = preg_match('/^\d{1,6}$/', (string)($_POST['estoque_base'] ?? '')) ? (int)$_POST['estoque_base'] : null;
        $produto = prod_atualizar($pdo, $id, $d, $img, ($_POST['remover_imagem'] ?? '') === '1', $base);
        usr_resposta(200, ['sucesso' => true, 'produto' => $produto, 'produtos' => prod_listar($pdo)]);
    }

    if ($acao === 'remover') {
        $id = strtoupper(trim((string)($_POST['codigo'] ?? '')));
        if (!preg_match(PROD_ID_REGEX, $id)) {
            throw new ProdutoErro('Item inválido.', 422);
        }
        prod_remover($pdo, $id);
        usr_resposta(200, ['sucesso' => true, 'produtos' => prod_listar($pdo)]);
    }

    usr_erro(422, 'Ação inválida.');
} catch (ProdutoErro $e) {
    $http = in_array($e->getCode(), [404, 409, 413, 422, 500], true) ? $e->getCode() : 422;
    usr_resposta($http, ['sucesso' => false, 'erro' => $e->getMessage(), 'campo' => $e->campo]);
} catch (PDOException $e) {
    error_log('[loja/produtos] ' . $e->getMessage());
    usr_erro(500, 'Erro ao consultar o banco de dados.');
}
