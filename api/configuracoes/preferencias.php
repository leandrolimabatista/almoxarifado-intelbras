<?php
/**
 * POST api/configuracoes/preferencias.php  → {grupo, valores:{chave:valor}}
 * Salva só as chaves conhecidas de CFG_PREFS (o resto é ignorado) e
 * devolve o grupo já normalizado.
 */
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$usuarioId = cfg_iniciar(['POST']);

$corpo   = cfg_corpo();
$grupo   = (string)($corpo['grupo'] ?? '');
$valores = is_array($corpo['valores'] ?? null) ? $corpo['valores'] : [];

if (!isset(CFG_PREFS[$grupo])) {
    cfg_erro(422, 'Grupo de preferências inválido.');
}

try {
    $pdo   = conectar();
    $atual = cfg_carregar_prefs($pdo, $usuarioId);

    foreach (CFG_PREFS[$grupo] as $chave => $def) {
        if (!array_key_exists($chave, $valores)) {
            continue;
        }
        $novo = cfg_normalizar_valor($def, $valores[$chave]);
        if ($novo === null) {
            cfg_erro(422, 'Valor inválido para "' . $chave . '".');
        }
        $atual[$grupo][$chave] = $novo;
    }

    $json = json_encode($atual, JSON_UNESCAPED_UNICODE);
    $pdo->prepare(
        'INSERT INTO tb_usuario_preferencias (usuario_id, dados) VALUES (:id, :d)
         ON DUPLICATE KEY UPDATE dados = VALUES(dados)'
    )->execute(['id' => $usuarioId, 'd' => $json]);

    cfg_resposta(200, ['sucesso' => true, 'grupo' => $grupo, 'valores' => $atual[$grupo]]);
} catch (PDOException $e) {
    error_log('[configuracoes/preferencias] ' . $e->getMessage());
    cfg_erro(500, 'Erro ao salvar as preferências.');
}
