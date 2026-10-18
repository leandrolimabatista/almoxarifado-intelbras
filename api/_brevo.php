<?php
/**
 * Envio de e-mail transacional pela API da Brevo (antiga Sendinblue).
 * https://developers.brevo.com/reference/sendtransacemail
 *
 * Configuração (variável de ambiente OU api/config.local.php):
 *   BREVO_API_KEY          chave de API v3 (Brevo → SMTP e API → Chaves de API)
 *   BREVO_REMETENTE_EMAIL  e-mail remetente JÁ VALIDADO na Brevo (Remetentes e IPs)
 *   BREVO_REMETENTE_NOME   nome exibido (padrão: APP_NOME)
 *   SMTP_USUARIO / SMTP_SENHA  (opcional) envio por SMTP, ex.: Gmail + senha de app.
 *                          Se ambos estiverem preenchidos, o SMTP é usado no lugar da Brevo.
 *   SMTP_HOST / SMTP_PORTA     padrão smtp.gmail.com / 587 (STARTTLS; 465 = TLS direto)
 *   SMTP_REMETENTE_EMAIL / SMTP_REMETENTE_NOME   padrão: SMTP_USUARIO / APP_NOME
 *   APP_NOME               nome do site mostrado no e-mail (padrão: "Portal de Acesso")
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

/** Nome do site exibido nos e-mails (neutro por padrão). */
function app_nome(): string
{
    $nome = app_config('APP_NOME');
    return $nome !== '' ? $nome : 'Portal de Acesso';
}

/**
 * Envia um e-mail. Usa SMTP se SMTP_USUARIO/SMTP_SENHA estiverem configurados;
 * caso contrário, usa a Brevo. Retorna true se o envio foi aceito.
 * Nunca lança exceção; detalhes de falha vão para o error_log.
 */
function brevo_enviar(string $paraEmail, string $paraNome, string $assunto, string $html, string $texto): bool
{
    if (app_config('SMTP_USUARIO') !== '' && app_config('SMTP_SENHA') !== '') {
        return smtp_enviar($paraEmail, $paraNome, $assunto, $html, $texto);
    }
    $chave = app_config('BREVO_API_KEY');
    $de    = app_config('BREVO_REMETENTE_EMAIL');
    if ($chave === '' || $de === '') {
        error_log('[brevo] BREVO_API_KEY / BREVO_REMETENTE_EMAIL não configurados.');
        return false;
    }
    $nomeDe = app_config('BREVO_REMETENTE_NOME') ?: app_nome();

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

/** Remove quebras de linha e < > de valores usados em cabeçalhos/comandos SMTP. */
function smtp_limpar(string $v): string
{
    return trim((string)preg_replace('/[\r\n<>"]+/', '', $v));
}

/**
 * Envio por SMTP (sem dependências). Nunca lança exceção; falhas vão para o error_log.
 * Gmail: ative a verificação em duas etapas e crie uma "senha de app".
 */
function smtp_enviar(string $paraEmail, string $paraNome, string $assunto, string $html, string $texto): bool
{
    $usuario = smtp_limpar(app_config('SMTP_USUARIO'));
    $senha   = str_replace(' ', '', app_config('SMTP_SENHA'));
    $host    = smtp_limpar(app_config('SMTP_HOST')) ?: 'smtp.gmail.com';
    $porta   = (int)(app_config('SMTP_PORTA') ?: 587);
    $de      = smtp_limpar(app_config('SMTP_REMETENTE_EMAIL')) ?: $usuario;
    $nomeDe  = smtp_limpar(app_config('SMTP_REMETENTE_NOME')) ?: app_nome();
    $para    = smtp_limpar($paraEmail);

    if ($usuario === '' || $senha === '' || $de === '' || $para === '' || strpos($de, '@') === false) {
        error_log('[smtp] configuração ou destinatário inválido.');
        return false;
    }

    $ctx = stream_context_create(['ssl' => [
        'verify_peer'      => true,
        'verify_peer_name' => true,
        'peer_name'        => $host,
    ]]);
    $alvo = ($porta === 465 ? 'ssl://' : 'tcp://') . $host . ':' . $porta;
    $fp   = @stream_socket_client($alvo, $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) {
        error_log('[smtp] não conectou em ' . $host . ':' . $porta . ' - ' . $errno . ' ' . $errstr);
        return false;
    }
    stream_set_timeout($fp, 15);

    // Lê uma resposta SMTP (pode ter várias linhas "250-...") e devolve [código, texto].
    $ler = static function () use ($fp): array {
        $txt = '';
        while (($linha = fgets($fp, 1024)) !== false) {
            $txt .= $linha;
            if (strlen($linha) < 4 || $linha[3] !== '-') {
                break;
            }
        }
        return [(int)substr($txt, 0, 3), trim($txt)];
    };
    // Envia um comando (ou só lê, se vazio) e confere o código esperado.
    // $rotulo é o que vai para o log no lugar do comando (nunca grava credenciais).
    $passo = static function (string $comando, array $esperados, string $rotulo = '') use ($fp, $ler): bool {
        if ($comando !== '') {
            fwrite($fp, $comando . "\r\n");
        }
        [$codigo, $txt] = $ler();
        if (!in_array($codigo, $esperados, true)) {
            error_log('[smtp] falha em "' . substr($rotulo !== '' ? $rotulo : $comando, 0, 40) . '": ' . substr($txt, 0, 300));
            return false;
        }
        return true;
    };

    $ok = false;
    try {
        $ehlo = preg_replace('/[^A-Za-z0-9.\-]/', '', (string)gethostname()) ?: 'localhost';
        $ok = $passo('', [220]) && $passo('EHLO ' . $ehlo, [250]);
        if ($ok && $porta !== 465) {
            $ok = $passo('STARTTLS', [220]);
            if ($ok) {
                $ok = (bool)@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
                if (!$ok) {
                    error_log('[smtp] falha ao iniciar TLS.');
                }
            }
            $ok = $ok && $passo('EHLO ' . $ehlo, [250]);
        }
        $ok = $ok
            && $passo('AUTH LOGIN', [334])
            && $passo(base64_encode($usuario), [334], '(usuario)')
            && $passo(base64_encode($senha), [235], '(senha)')
            && $passo('MAIL FROM:<' . $de . '>', [250])
            && $passo('RCPT TO:<' . $para . '>', [250, 251])
            && $passo('DATA', [354]);

        if ($ok) {
            $cod  = static function (string $v): string { return '=?UTF-8?B?' . base64_encode($v) . '?='; };
            $lim  = 'b_' . bin2hex(random_bytes(12));
            $dom  = substr((string)strrchr($de, '@'), 1);
            $msg  = 'Date: ' . date('r') . "\r\n"
                . 'From: ' . $cod($nomeDe) . ' <' . $de . ">\r\n"
                . 'To: ' . $cod(smtp_limpar($paraNome) ?: $para) . ' <' . $para . ">\r\n"
                . 'Subject: ' . $cod(str_replace(["\r", "\n"], ' ', $assunto)) . "\r\n"
                . 'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $dom . ">\r\n"
                . "MIME-Version: 1.0\r\n"
                . 'Content-Type: multipart/alternative; boundary="' . $lim . "\"\r\n\r\n"
                . '--' . $lim . "\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
                . chunk_split(base64_encode($texto), 76, "\r\n")
                . '--' . $lim . "\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
                . chunk_split(base64_encode($html), 76, "\r\n")
                . '--' . $lim . "--\r\n";
            fwrite($fp, $msg . ".\r\n");
            [$c, $t] = $ler();
            $ok = ($c === 250);
            if (!$ok) {
                error_log('[smtp] mensagem recusada: ' . substr($t, 0, 300));
            }
        }
        @fwrite($fp, "QUIT\r\n");
    } catch (Throwable $e) {
        error_log('[smtp] erro: ' . $e->getMessage());
        $ok = false;
    }
    @fclose($fp);
    return $ok;
}

/** Monta assunto/HTML/texto do e-mail "Redefinir senha". */
function brevo_email_redefinir_senha(string $nome, string $link, int $minutos): array
{
    $primeiro = htmlspecialchars(explode(' ', trim($nome))[0] ?: 'olá', ENT_QUOTES, 'UTF-8');
    $linkH    = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');
    $site     = app_nome();
    $siteH    = htmlspecialchars($site, ENT_QUOTES, 'UTF-8');

    $html = '<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;background:#f3f5f4;font-family:Arial,Helvetica,sans-serif;color:#1d1d1b">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">'
        . '<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden">'
        . '<tr><td style="background:#00a335;padding:20px 32px;color:#fff;font-size:20px;font-weight:700">' . $siteH . '</td></tr>'
        . '<tr><td style="padding:32px">'
        . '<h1 style="margin:0 0 16px;font-size:20px">Redefinir sua senha</h1>'
        . '<p style="margin:0 0 16px;line-height:1.5">Olá, ' . $primeiro . '. Recebemos um pedido para redefinir a senha da sua conta.</p>'
        . '<p style="margin:0 0 24px;line-height:1.5">Clique no botão abaixo para criar uma nova senha. O link vale por <strong>' . $minutos . ' minutos</strong> e só pode ser usado uma vez.</p>'
        . '<p style="margin:0 0 24px"><a href="' . $linkH . '" style="display:inline-block;background:#00a335;color:#fff;text-decoration:none;font-weight:700;padding:14px 32px;border-radius:999px">Criar nova senha</a></p>'
        . '<p style="margin:0 0 8px;font-size:13px;color:#666;line-height:1.5">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="word-break:break-all">' . $linkH . '</span></p>'
        . '<p style="margin:16px 0 0;font-size:13px;color:#666;line-height:1.5">Se você não pediu isso, ignore este e-mail: sua senha continua a mesma.</p>'
        . '</td></tr></table></td></tr></table></body></html>';

    $texto = "Olá, " . explode(' ', trim($nome))[0] . ".\n\n"
        . "Recebemos um pedido para redefinir a senha da sua conta em $site.\n"
        . "Acesse o link abaixo para criar uma nova senha (vale por $minutos minutos e só pode ser usado uma vez):\n\n"
        . $link . "\n\n"
        . "Se você não pediu isso, ignore este e-mail: sua senha continua a mesma.";

    return ['Redefinir sua senha - ' . $site, $html, $texto];
}
