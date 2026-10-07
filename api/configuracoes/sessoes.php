<?php
/**
 * GET  api/configuracoes/sessoes.php                       → lista as sessões ativas do usuário
 * POST api/configuracoes/sessoes.php {acao:'encerrar', id} → encerra uma sessão (não a atual)
 * POST api/configuracoes/sessoes.php {acao:'encerrar_outras'} → encerra todas, menos a atual
 *
 * "Encerrar" marca encerrada_em; o outro dispositivo é desconectado em até
 * 1 minuto (ver cfg_sessao_acompanhar em _sessoes.php).
 */
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_sessoes.php';

$usuarioId = cfg_iniciar(['GET', 'POST']);

/** Sessões sem acesso há mais de 30 dias deixam de contar como ativas. */
const CFG_SESSAO_VALIDADE_DIAS = 30;

try {
    $pdo = conectar();

    // Garante que a sessão atual esteja registrada (caso a página tenha sido aberta antes do SQL).
    cfg_sessao_acompanhar();
    $tokenAtual = hash('sha256', (string)($_SESSION['cfg_sessao_token'] ?? ''));

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $corpo = cfg_corpo();
        $acao  = (string)($corpo['acao'] ?? '');

        if ($acao === 'encerrar') {
            $id = (int)($corpo['id'] ?? 0);
            $st = $pdo->prepare(
                'UPDATE tb_usuario_sessoes SET encerrada_em = NOW()
                  WHERE id = :id AND usuario_id = :u AND token_hash <> :t AND encerrada_em IS NULL'
            );
            $st->execute(['id' => $id, 'u' => $usuarioId, 't' => $tokenAtual]);
            if ($st->rowCount() === 0) {
                cfg_erro(404, 'Sessão não encontrada ou já encerrada.');
            }
        } elseif ($acao === 'encerrar_outras') {
            $pdo->prepare(
                'UPDATE tb_usuario_sessoes SET encerrada_em = NOW()
                  WHERE usuario_id = :u AND token_hash <> :t AND encerrada_em IS NULL'
            )->execute(['u' => $usuarioId, 't' => $tokenAtual]);
        } else {
            cfg_erro(422, 'Ação inválida.');
        }
    }

    $stmt = $pdo->prepare(
        'SELECT id, token_hash, dispositivo, navegador, sistema, ip, ultimo_acesso
           FROM tb_usuario_sessoes
          WHERE usuario_id = :u AND encerrada_em IS NULL
            AND ultimo_acesso >= (NOW() - INTERVAL ' . CFG_SESSAO_VALIDADE_DIAS . ' DAY)
          ORDER BY ultimo_acesso DESC'
    );
    $stmt->execute(['u' => $usuarioId]);

    $lista = [];
    foreach ($stmt->fetchAll() as $s) {
        $ip = (string)$s['ip'];
        // IP parcialmente mascarado (mostra só o "local aproximado" da rede).
        if (str_contains($ip, '.')) {
            $p = explode('.', $ip);
            $ip = ($p[0] ?? '') . '.' . ($p[1] ?? '') . '.x.x';
        } elseif ($ip !== '') {
            $ip = substr($ip, 0, 9) . '…';
        }
        $lista[] = [
            'id'            => (int)$s['id'],
            'dispositivo'   => $s['dispositivo'],
            'navegador'     => $s['navegador'],
            'sistema'       => $s['sistema'],
            'ip'            => $ip,
            'ultimo_acesso' => (new DateTime((string)$s['ultimo_acesso']))->format('c'),
            'atual'         => hash_equals((string)$s['token_hash'], $tokenAtual),
        ];
    }

    cfg_resposta(200, ['sucesso' => true, 'sessoes' => $lista]);
} catch (PDOException $e) {
    error_log('[configuracoes/sessoes] ' . $e->getMessage());
    cfg_erro(500, 'Erro ao consultar as sessões. O script database/configuracoes.sql já foi executado?');
}
