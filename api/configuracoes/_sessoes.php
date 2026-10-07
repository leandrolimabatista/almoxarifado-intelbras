<?php
/**
 * Acompanhamento de sessões (abas "Dispositivos" e "Segurança").
 *
 * cfg_sessao_acompanhar() é chamada pelo index.php a cada página logada:
 *   - registra a sessão atual em tb_usuario_sessoes (1ª vez);
 *   - atualiza "último acesso" (no máx. a cada 5 min);
 *   - a cada 60 s confere se a sessão foi encerrada em outro dispositivo
 *     e, se foi, derruba o login daqui.
 * Se a tabela ainda não existir (SQL não rodado), lança PDOException — o
 * index.php captura e segue normalmente.
 */
declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../conexao.php';

/** Interpreta o User-Agent de forma simples: [dispositivo, navegador, sistema]. */
function cfg_ua(string $ua): array
{
    $so = 'Desconhecido';
    $dispositivo = 'desktop';
    if (preg_match('/iPad|Tablet/i', $ua)) {
        $dispositivo = 'tablet';
    } elseif (preg_match('/Mobile|iPhone|Android/i', $ua)) {
        $dispositivo = 'celular';
    }
    foreach (['Windows' => 'Windows', 'Android' => 'Android', 'iPhone|iPad|iOS' => 'iOS', 'Mac OS X|Macintosh' => 'macOS', 'CrOS' => 'ChromeOS', 'Linux' => 'Linux'] as $re => $nome) {
        if (preg_match('/' . $re . '/i', $ua)) {
            $so = $nome;
            break;
        }
    }
    $nav = 'Navegador';
    foreach (['Edg' => 'Edge', 'OPR|Opera' => 'Opera', 'Firefox|FxiOS' => 'Firefox', 'Chrome|CriOS' => 'Chrome', 'Safari' => 'Safari'] as $re => $nome) {
        if (preg_match('/' . $re . '/i', $ua)) {
            $nav = $nome;
            break;
        }
    }
    return [$dispositivo, $nav, $so];
}

function cfg_sessao_acompanhar(): void
{
    $usuarioId = (int)($_SESSION['usuario_id'] ?? 0);
    if ($usuarioId <= 0) {
        return;
    }

    $agora = time();
    $pdo   = conectar();

    // 1) Primeira vez nesta sessão PHP: registra.
    if (empty($_SESSION['cfg_sessao_token'])) {
        $token = bin2hex(random_bytes(32));
        $ua    = substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 400);
        [$disp, $nav, $so] = cfg_ua($ua);
        $pdo->prepare(
            'INSERT INTO tb_usuario_sessoes (usuario_id, token_hash, dispositivo, navegador, sistema, ip)
             VALUES (:u, :h, :d, :n, :s, :ip)'
        )->execute([
            'u' => $usuarioId, 'h' => hash('sha256', $token), 'd' => $disp, 'n' => $nav, 's' => $so,
            'ip' => substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45),
        ]);
        $_SESSION['cfg_sessao_token']    = $token;
        $_SESSION['cfg_sessao_checada']  = $agora;
        $_SESSION['cfg_sessao_atualizada'] = $agora;
        return;
    }

    $hash = hash('sha256', (string)$_SESSION['cfg_sessao_token']);

    // 2) Confere encerramento (no máx. 1x por minuto).
    if ($agora - (int)($_SESSION['cfg_sessao_checada'] ?? 0) >= 60) {
        $_SESSION['cfg_sessao_checada'] = $agora;
        $stmt = $pdo->prepare('SELECT encerrada_em FROM tb_usuario_sessoes WHERE token_hash = :h AND usuario_id = :u');
        $stmt->execute(['h' => $hash, 'u' => $usuarioId]);
        $linha = $stmt->fetch();
        if ($linha && $linha['encerrada_em'] !== null) {
            $_SESSION = [];
            session_destroy();
            return;
        }
    }

    // 3) Atualiza "último acesso" (no máx. a cada 5 minutos).
    if ($agora - (int)($_SESSION['cfg_sessao_atualizada'] ?? 0) >= 300) {
        $_SESSION['cfg_sessao_atualizada'] = $agora;
        $pdo->prepare('UPDATE tb_usuario_sessoes SET ultimo_acesso = NOW() WHERE token_hash = :h AND usuario_id = :u AND encerrada_em IS NULL')
            ->execute(['h' => $hash, 'u' => $usuarioId]);
    }
}
