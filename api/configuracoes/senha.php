<?php
/**
 * POST api/configuracoes/senha.php → {atual, nova, confirmar}
 * Regras: mínimo 8 caracteres, com letra e número; diferente da atual.
 * Limite: 5 tentativas erradas da senha atual por 10 minutos (por sessão).
 */
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$usuarioId = cfg_iniciar(['POST']);

$corpo     = cfg_corpo();
$atual     = (string)($corpo['atual'] ?? '');
$nova      = (string)($corpo['nova'] ?? '');
$confirmar = (string)($corpo['confirmar'] ?? '');

$agora = time();
$tent  = array_filter((array)($_SESSION['cfg_senha_tentativas'] ?? []), static fn($t) => $agora - (int)$t < 600);
if (count($tent) >= 5) {
    cfg_erro(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
}

$erros = [];
if ($atual === '') {
    $erros['atual'] = 'Informe sua senha atual.';
}
if (strlen($nova) < 8 || !preg_match('/[A-Za-z]/', $nova) || !preg_match('/\d/', $nova)) {
    $erros['nova'] = 'Use ao menos 8 caracteres, com letras e números.';
} elseif ($nova === $atual) {
    $erros['nova'] = 'A nova senha deve ser diferente da atual.';
}
if ($nova !== $confirmar) {
    $erros['confirmar'] = 'A confirmação não confere com a nova senha.';
}
if ($erros) {
    cfg_erro(422, 'Corrija os campos destacados.', ['campos' => $erros]);
}

try {
    $pdo  = conectar();
    $stmt = $pdo->prepare('SELECT senha_hash FROM tb_usuarios WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $usuarioId]);
    $u = $stmt->fetch();

    if (!$u || !password_verify($atual, (string)$u['senha_hash'])) {
        $tent[] = $agora;
        $_SESSION['cfg_senha_tentativas'] = array_values($tent);
        cfg_erro(422, 'Corrija os campos destacados.', ['campos' => ['atual' => 'Senha atual incorreta.']]);
    }

    $pdo->prepare('UPDATE tb_usuarios SET senha_hash = :h WHERE id = :id')
        ->execute(['h' => password_hash($nova, PASSWORD_DEFAULT), 'id' => $usuarioId]);

    unset($_SESSION['cfg_senha_tentativas']);
    session_regenerate_id(true);

    cfg_resposta(200, ['sucesso' => true]);
} catch (PDOException $e) {
    error_log('[configuracoes/senha] ' . $e->getMessage());
    cfg_erro(500, 'Erro ao atualizar a senha.');
}
