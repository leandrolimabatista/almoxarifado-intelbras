<?php
/**
 * POST api/chat/mensagem.php
 * JSON: { id, acao, texto?, emoji? }
 * acao: "editar" | "apagar" | "reagir"
 *
 * Mesmo funcionamento de api/equipes/mensagem.php, para o chat pessoal.
 * Exige header X-CSRF-Token e ser um dos dois participantes da conversa.
 * Só o autor edita/apaga a própria mensagem; qualquer um dos dois reage.
 * Resposta: { sucesso, mensagem }
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$meuId = chat_iniciar(['POST']);
chat_exigir_csrf();

$dados = chat_ler_json();
$id    = (int)($dados['id'] ?? 0);
$acao  = (string)($dados['acao'] ?? '');

if ($id <= 0) {
    chat_erro(422, 'Requisição inválida.');
}

try {
    $pdo = chat_pdo();

    switch ($acao) {
        case 'editar':
            chat_editar_mensagem($pdo, $meuId, $id, (string)($dados['texto'] ?? ''));
            break;

        case 'apagar':
            chat_apagar_mensagem($pdo, $meuId, $id);
            break;

        case 'reagir':
            chat_alternar_reacao($pdo, $meuId, $id, (string)($dados['emoji'] ?? ''));
            break;

        default:
            chat_erro(422, 'Ação inválida.');
    }

    chat_resposta(200, ['sucesso' => true, 'mensagem' => chat_buscar_mensagem($pdo, $id, $meuId)]);
} catch (InvalidArgumentException $e) {
    chat_erro($e->getCode() >= 400 ? $e->getCode() : 422, $e->getMessage());
} catch (PDOException $e) {
    chat_erro_banco($e, 'mensagem');
}
