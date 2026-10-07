<?php
/**
 * Endpoint de login — recebe email + senha do formulário
 * #loginStepForm (cabecalho.html) via POST, confere com a tabela
 * `tb_usuarios` e abre a sessão do usuário. Responde sempre em
 * JSON, pensado para ser chamado via fetch() no cabecalho.js.
 */

declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/conexao.php';

// ------------------------------------------------------------
// Só aceita POST
// ------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['sucesso' => false, 'erro' => 'Método não permitido.']);
    exit;
}

// ------------------------------------------------------------
// Lê o corpo da requisição. Aceita tanto JSON (fetch com
// JSON.stringify) quanto form-data tradicional ($_POST).
// ------------------------------------------------------------
$dadosJson = json_decode(file_get_contents('php://input'), true);
$dados = is_array($dadosJson) ? $dadosJson : $_POST;

function campoLogin(array $dados, string $chave): string
{
    return trim((string)($dados[$chave] ?? ''));
}

$email = campoLogin($dados, 'email');
$senha = campoLogin($dados, 'senha');

// ------------------------------------------------------------
// Validações básicas (o back-end nunca confia só no front-end)
// ------------------------------------------------------------
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $senha === '') {
    http_response_code(422);
    echo json_encode(['sucesso' => false, 'erro' => 'Informe email e senha válidos.']);
    exit;
}

try {
    $pdo = conectar();

    $stmt = $pdo->prepare('SELECT id, nome, email, senha_hash FROM tb_usuarios WHERE email = :email LIMIT 1');
    $stmt->execute(['email' => $email]);
    $usuario = $stmt->fetch();

    if (!$usuario || !password_verify($senha, $usuario['senha_hash'])) {
        // Antes de responder "incorretos", confere se o email é de uma
        // solicitação de cadastro ainda pendente (aguardando aceite do
        // Administrador em tb_solicitacoes_acesso). Só mostra a mensagem
        // de "aguarde" se a senha também bater com a da solicitação —
        // senão continua "Email ou senha incorretos" normalmente.
        $stmtSolicitacao = $pdo->prepare(
            'SELECT senha_hash FROM tb_solicitacoes_acesso WHERE email = :email AND status = "pendente" LIMIT 1'
        );
        $stmtSolicitacao->execute(['email' => $email]);
        $solicitacao = $stmtSolicitacao->fetch();

        if ($solicitacao && password_verify($senha, $solicitacao['senha_hash'])) {
            http_response_code(401);
            echo json_encode(['sucesso' => false, 'erro' => 'Aguarde ser aceito pelo Administrador.']);
            exit;
        }

        http_response_code(401);
        echo json_encode(['sucesso' => false, 'erro' => 'Email ou senha incorretos.']);
        exit;
    }

    // Login OK — regenera o ID de sessão (evita fixation) e guarda
    // só o essencial na sessão.
    session_regenerate_id(true);
    $_SESSION['usuario_id']    = (int)$usuario['id'];
    $_SESSION['usuario_nome']  = $usuario['nome'];
    $_SESSION['usuario_email'] = $usuario['email'];

    echo json_encode([
        'sucesso' => true,
        'usuario' => [
            'id'    => (int)$usuario['id'],
            'nome'  => $usuario['nome'],
            'email' => $usuario['email'],
        ],
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    // Em produção, não exponha $e->getMessage() ao cliente — logue em arquivo.
    echo json_encode(['sucesso' => false, 'erro' => 'Erro ao consultar o banco de dados.']);
}
