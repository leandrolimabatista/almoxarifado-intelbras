<?php
/**
 * api/redefinir_senha.php
 *   GET  ?token=...                          → {valido: bool}  (confere o link ao abrir o popout)
 *   POST {token, senha, repetir_senha}       → grava a nova senha
 *
 * Regras da senha: mínimo 8 caracteres, com letra e número (mesma da tela
 * Configurações). Token de uso único, 30 min. Ao redefinir, todos os tokens
 * pendentes do usuário são invalidados e as sessões salvas dele são encerradas.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/conexao.php';

function redef_json(int $status, array $corpo): void
{
    http_response_code($status);
    echo json_encode($corpo, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Busca o token válido (existe, não usado, não expirado). */
function redef_buscar(PDO $pdo, string $token): ?array
{
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        return null;
    }
    $st = $pdo->prepare(
        'SELECT id, usuario_id FROM tb_redefinicao_senha
         WHERE token_hash = :h AND usado_em IS NULL AND expira_em > NOW() LIMIT 1'
    );
    $st->execute(['h' => hash('sha256', $token)]);
    $linha = $st->fetch();
    return $linha ?: null;
}

try {
    $pdo = conectar();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        redef_json(200, ['valido' => redef_buscar($pdo, (string)($_GET['token'] ?? '')) !== null]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        redef_json(405, ['sucesso' => false, 'erro' => 'Método não permitido.']);
    }

    $json  = json_decode((string)file_get_contents('php://input'), true);
    $dados = is_array($json) ? $json : $_POST;
    $token = trim((string)($dados['token'] ?? ''));
    $senha = (string)($dados['senha'] ?? '');
    $rep   = (string)($dados['repetir_senha'] ?? '');

    $erros = [];
    if (!senha_forte($senha)) {
        $erros['senha'] = 'Use ao menos 8 caracteres, com uma letra maiúscula, um número e um caractere especial.';
    } elseif ($senha !== $rep) {
        $erros['repetir_senha'] = 'As senhas não coincidem.';
    }
    if ($erros) {
        redef_json(422, ['sucesso' => false, 'erro' => reset($erros), 'campos' => $erros]);
    }

    $pdo->beginTransaction();

    // Trava a linha do token para impedir uso duplo em requisições simultâneas.
    $linha = redef_buscar($pdo, $token);
    if ($linha) {
        $st = $pdo->prepare('SELECT id FROM tb_redefinicao_senha WHERE id = :id AND usado_em IS NULL FOR UPDATE');
        $st->execute(['id' => $linha['id']]);
        if (!$st->fetch()) {
            $linha = null;
        }
    }
    if (!$linha) {
        $pdo->rollBack();
        redef_json(410, ['sucesso' => false, 'erro' => 'Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".']);
    }

    $pdo->prepare('UPDATE tb_usuarios SET senha_hash = :h WHERE id = :id')
        ->execute(['h' => password_hash($senha, PASSWORD_DEFAULT), 'id' => $linha['usuario_id']]);

    // Invalida este e qualquer outro link pendente do usuário.
    $pdo->prepare('UPDATE tb_redefinicao_senha SET usado_em = NOW() WHERE usuario_id = :u AND usado_em IS NULL')
        ->execute(['u' => $linha['usuario_id']]);

    // Encerra sessões já registradas (aba "Dispositivos"), se a tabela existir.
    try {
        $pdo->prepare('UPDATE tb_usuario_sessoes SET encerrada_em = NOW() WHERE usuario_id = :u AND encerrada_em IS NULL')->execute(['u' => $linha['usuario_id']]);
    } catch (PDOException $e) {
        // tabela opcional (configuracoes.sql) — ignora se não existir
    }

    $pdo->commit();
    redef_json(200, ['sucesso' => true]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[redefinir_senha] ' . $e->getMessage());
    redef_json(500, ['sucesso' => false, 'erro' => 'Não foi possível redefinir a senha agora. Tente novamente.']);
}
