<?php
/**
 * Sessão para o front-end React (react/). Só LEITURA: diz se há usuário
 * logado e entrega os tokens CSRF de cada módulo, que no front PHP vão
 * dentro do HTML (data-csrf) e no React não existem.
 *
 * Para migrar outro módulo, acrescente o token dele em $csrf (use o mesmo
 * nome de chave de sessão que o _bootstrap.php do módulo confere).
 */

declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['sucesso' => false, 'erro' => 'Método não permitido.']);
    exit;
}

$usuarioId = (int)($_SESSION['usuario_id'] ?? 0);
if ($usuarioId <= 0) {
    echo json_encode(['sucesso' => true, 'logado' => false]);
    exit;
}

// Mesmo padrão dos módulos: gera uma vez por sessão.
foreach (['csrf_chat', 'csrf_chamadas'] as $chave) {
    if (empty($_SESSION[$chave])) {
        $_SESSION[$chave] = bin2hex(random_bytes(32));
    }
}

echo json_encode([
    'sucesso' => true,
    'logado'  => true,
    'usuario' => [
        'id'    => $usuarioId,
        'nome'  => (string)($_SESSION['usuario_nome'] ?? ''),
        'email' => (string)($_SESSION['usuario_email'] ?? ''),
    ],
    'csrf' => [
        'chat'     => (string)$_SESSION['csrf_chat'],
        'chamadas' => (string)$_SESSION['csrf_chamadas'],
    ],
], JSON_UNESCAPED_UNICODE);
