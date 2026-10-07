<?php
/**
 * GET  api/ia/envio.php?id=<envio_id>
 *      -> { sucesso, estado: 'pendente' | 'ok' | 'erro' | 'cancelado' | 'inexistente',
 *           conversa_id?, erro? }
 *      Usado pelo front quando o usuário volta para a página da IA depois de
 *      ter enviado uma pergunta e saído (troca de aba do menu / fechou a aba).
 *
 * POST api/ia/envio.php   { acao: 'cancelar', envio_id }
 *      "Parar geração": marca o envio como cancelado para o enviar.php
 *      NÃO gravar a resposta.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_envios.php';

// Depois desse tempo sem terminar, um envio "pendente" é dado como falho
// (o script do servidor morreu no meio). Timeout da IA (90s) + folga.
const IA_ENVIO_PENDENTE_MAX_SEGUNDOS = 240;

$usuarioId = ia_iniciar(['GET', 'POST']);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    ia_exigir_csrf();
    $dados   = ia_ler_json();
    $envioId = ia_envio_id_valido($dados['envio_id'] ?? null);

    if (($dados['acao'] ?? '') !== 'cancelar' || $envioId === null) {
        ia_erro(422, 'Requisição inválida.');
    }
    ia_envio_cancelar($usuarioId, $envioId);
    ia_resposta(200, ['sucesso' => true]);
}

$envioId = ia_envio_id_valido($_GET['id'] ?? null);
if ($envioId === null) {
    ia_erro(422, 'Requisição inválida.');
}

$registro = ia_envio_ler($usuarioId, $envioId);
if ($registro === null) {
    ia_resposta(200, ['sucesso' => true, 'estado' => 'inexistente']);
}

$estado = (string)($registro['dados']['estado'] ?? '');

if ($estado === 'ok') {
    ia_resposta(200, [
        'sucesso'     => true,
        'estado'      => 'ok',
        'conversa_id' => (int)($registro['dados']['conversa_id'] ?? 0),
    ]);
}

if ($estado === 'cancelado' || ia_envio_cancelado($usuarioId, $envioId)) {
    ia_resposta(200, ['sucesso' => true, 'estado' => 'cancelado']);
}

if ($estado === 'pendente' && (time() - $registro['modificado']) > IA_ENVIO_PENDENTE_MAX_SEGUNDOS) {
    ia_resposta(200, [
        'sucesso' => true,
        'estado'  => 'erro',
        'erro'    => 'Não foi possível concluir a resposta. Tente novamente.',
    ]);
}

if ($estado === 'erro') {
    ia_resposta(200, [
        'sucesso' => true,
        'estado'  => 'erro',
        'erro'    => (string)($registro['dados']['erro'] ?? 'Não foi possível concluir a resposta. Tente novamente.'),
    ]);
}

ia_resposta(200, ['sucesso' => true, 'estado' => 'pendente']);
