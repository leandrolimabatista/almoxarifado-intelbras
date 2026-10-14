<?php
/**
 * POST api/esqueci_senha.php  {email}
 *
 * Gera um token de redefinição (uso único, 30 min), guarda só o hash em
 * tb_redefinicao_senha e envia o link por e-mail pela Brevo.
 *
 * Por segurança a resposta é SEMPRE a mesma (exista o e-mail ou não), para
 * não revelar quais e-mails têm conta. Limite: 3 pedidos por usuário a cada
 * 15 minutos e 10 por IP a cada hora.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/conexao.php';
require_once __DIR__ . '/_brevo.php';

const REDEF_VALIDADE_MIN = 30;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['sucesso' => false, 'erro' => 'Método não permitido.']);
    exit;
}

$json  = json_decode((string)file_get_contents('php://input'), true);
$dados = is_array($json) ? $json : $_POST;
$email = trim((string)($dados['email'] ?? ''));

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 150) {
    http_response_code(422);
    echo json_encode(['sucesso' => false, 'erro' => 'Informe um email válido.']);
    exit;
}

$resposta = ['sucesso' => true, 'mensagem' => 'Link enviado! Verifique sua caixa de entrada (e o spam) para redefinir sua senha.'];

try {
    $pdo = conectar();
    $ip  = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);

    // Limite por IP
    $st = $pdo->prepare('SELECT COUNT(*) FROM tb_redefinicao_senha WHERE ip = :ip AND criado_em > (NOW() - INTERVAL 1 HOUR)');
    $st->execute(['ip' => $ip]);
    if ((int)$st->fetchColumn() >= 10) {
        http_response_code(429);
        echo json_encode(['sucesso' => false, 'erro' => 'Muitas tentativas. Aguarde um pouco e tente de novo.']);
        exit;
    }

    $st = $pdo->prepare('SELECT id, nome, email FROM tb_usuarios WHERE email = :email LIMIT 1');
    $st->execute(['email' => $email]);
    $usuario = $st->fetch();

    if ($usuario) {
        // Limite por usuário (silencioso: devolve a mesma resposta)
        $st = $pdo->prepare('SELECT COUNT(*) FROM tb_redefinicao_senha WHERE usuario_id = :u AND criado_em > (NOW() - INTERVAL 15 MINUTE)');
        $st->execute(['u' => $usuario['id']]);
        if ((int)$st->fetchColumn() < 3) {
            $token = bin2hex(random_bytes(32));
            $pdo->prepare(
                'INSERT INTO tb_redefinicao_senha (usuario_id, token_hash, expira_em, ip)
                 VALUES (:u, :h, (NOW() + INTERVAL ' . REDEF_VALIDADE_MIN . ' MINUTE), :ip)'
            )->execute(['u' => $usuario['id'], 'h' => hash('sha256', $token), 'ip' => $ip]);

            $link = app_url_base() . '/index.php?redefinir_senha=' . $token;
            [$assunto, $html, $texto] = brevo_email_redefinir_senha((string)$usuario['nome'], $link, REDEF_VALIDADE_MIN);
            brevo_enviar((string)$usuario['email'], (string)$usuario['nome'], $assunto, $html, $texto);
        }
    }

    echo json_encode($resposta);
} catch (Throwable $e) {
    error_log('[esqueci_senha] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['sucesso' => false, 'erro' => 'Não foi possível processar o pedido agora. Tente novamente em instantes.']);
}
