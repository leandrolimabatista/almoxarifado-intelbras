<?php
/**
 * Envio de e-mail transacional pela API da Brevo (antiga Sendinblue).
 * https://developers.brevo.com/reference/sendtransacemail
 *
 * Configuração (variável de ambiente OU api/config.local.php):
 *   BREVO_API_KEY          chave de API v3 (Brevo → SMTP e API → Chaves de API)
 *   BREVO_REMETENTE_EMAIL  e-mail remetente JÁ VALIDADO na Brevo (Remetentes e IPs)
 *   BREVO_REMETENTE_NOME   nome exibido (padrão: "Intelbras")
 *   APP_URL                endereço público do site, sem barra no final
 *                          (ex.: https://meusite.com.br/intelbras). Se vazio,
 *                          é deduzido do pedido atual.
 */
declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

/** Lê uma configuração: variável de ambiente primeiro, depois api/config.local.php. */
function app_config(string $nome): string
{
    $env = getenv($nome);
    if ($env !== false && trim($env) !== '') {
        return trim($env);
    }
    $arquivo = __DIR__ . '/config.local.php';
    if (is_file($arquivo)) {
        $cfg = require $arquivo;
        if (is_array($cfg) && isset($cfg[$nome])) {
            return trim((string)$cfg[$nome]);
        }
    }
    return '';
}

/** URL base do site (pasta que contém index.php), sem barra final. */
function app_url_base(): string
{
    $fixa = rtrim(app_config('APP_URL'), '/');
    if ($fixa !== '') {
        return $fixa;
    }
    $https  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $host   = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    $pasta  = rtrim(str_replace('\\', '/', dirname(dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/api/x.php')))), '/');
    return ($https ? 'https' : 'http') . '://' . $host . $pasta;
}

/**
 * Envia um e-mail. Retorna true se a Brevo aceitou (HTTP 201).
 * Nunca lança exceção; detalhes de falha vão para o error_log.
 */
function brevo_enviar(string $paraEmail, string $paraNome, string $assunto, string $html, string $texto): bool
{
    $chave = app_config('BREVO_API_KEY');
    $de    = app_config('BREVO_REMETENTE_EMAIL');
    if ($chave === '' || $de === '') {
        error_log('[brevo] BREVO_API_KEY / BREVO_REMETENTE_EMAIL não configurados.');
        return false;
    }
    $nomeDe = app_config('BREVO_REMETENTE_NOME') ?: 'Intelbras';

    $corpo = json_encode([
        'sender'      => ['name' => $nomeDe, 'email' => $de],
        'to'          => [['email' => $paraEmail, 'name' => $paraNome]],
        'subject'     => $assunto,
        'htmlContent' => $html,
        'textContent' => $texto,
    ], JSON_UNESCAPED_UNICODE);

    $ch = curl_init('https://api.brevo.com/v3/smtp/email');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $corpo,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => [
            'accept: application/json',
            'content-type: application/json',
            'api-key: ' . $chave,
        ],
    ]);
    $resposta = curl_exec($ch);
    $status   = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $erroCurl = curl_error($ch);
    curl_close($ch);

    if ($status !== 201) {
        error_log('[brevo] falha HTTP ' . $status . ' ' . $erroCurl . ' ' . substr((string)$resposta, 0, 300));
        return false;
    }
    return true;
}

/** Monta assunto/HTML/texto do e-mail "Redefinir senha". */
function brevo_email_redefinir_senha(string $nome, string $link, int $minutos): array
{
    $primeiro = htmlspecialchars(explode(' ', trim($nome))[0] ?: 'olá', ENT_QUOTES, 'UTF-8');
    $linkH    = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');

    $html = '<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;background:#f3f5f4;font-family:Arial,Helvetica,sans-serif;color:#1d1d1b">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">'
        . '<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden">'
        . '<tr><td style="background:#00a335;padding:20px 32px;color:#fff;font-size:20px;font-weight:700">Intelbras</td></tr>'
        . '<tr><td style="padding:32px">'
        . '<h1 style="margin:0 0 16px;font-size:20px">Redefinir sua senha</h1>'
        . '<p style="margin:0 0 16px;line-height:1.5">Olá, ' . $primeiro . '. Recebemos um pedido para redefinir a senha da sua conta.</p>'
        . '<p style="margin:0 0 24px;line-height:1.5">Clique no botão abaixo para criar uma nova senha. O link vale por <strong>' . $minutos . ' minutos</strong> e só pode ser usado uma vez.</p>'
        . '<p style="margin:0 0 24px"><a href="' . $linkH . '" style="display:inline-block;background:#00a335;color:#fff;text-decoration:none;font-weight:700;padding:14px 32px;border-radius:999px">Criar nova senha</a></p>'
        . '<p style="margin:0 0 8px;font-size:13px;color:#666;line-height:1.5">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="word-break:break-all">' . $linkH . '</span></p>'
        . '<p style="margin:16px 0 0;font-size:13px;color:#666;line-height:1.5">Se você não pediu isso, ignore este e-mail: sua senha continua a mesma.</p>'
        . '</td></tr></table></td></tr></table></body></html>';

    $texto = "Olá, " . explode(' ', trim($nome))[0] . ".\n\n"
        . "Recebemos um pedido para redefinir a senha da sua conta Intelbras.\n"
        . "Acesse o link abaixo para criar uma nova senha (vale por $minutos minutos e só pode ser usado uma vez):\n\n"
        . $link . "\n\n"
        . "Se você não pediu isso, ignore este e-mail: sua senha continua a mesma.";

    return ['Redefinir sua senha - Intelbras', $html, $texto];
}
