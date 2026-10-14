<?php
/**
 * POST api/chat/iniciar.php   { "usuario_id": 7 }
 *
 * Abre a conversa com esse usuário (cria na hora, se for a primeira vez)
 * e devolve o id da conversa + os dados do outro participante. Chamado
 * ao escolher alguém na busca de "Nova conversa".
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$meuId = chat_iniciar(['POST']);
chat_exigir_csrf();

$corpo = chat_ler_json();
$outroId = (int)($corpo['usuario_id'] ?? 0);

try {
    $pdo = chat_pdo();

    $outro = chat_buscar_usuario($pdo, $outroId);
    if (!$outro) {
        chat_erro(404, 'Usuário não encontrado.');
    }
    if ($outroId === 1 && $meuId !== 1) { // Administrador Intelbras não aparece para ninguém
        chat_erro(404, 'Usuário não encontrado.');
    }
    if ($outroId === $meuId) {
        chat_erro(422, 'Você não pode iniciar uma conversa consigo mesmo.');
    }

    $conversa = chat_obter_ou_criar_conversa($pdo, $meuId, $outroId);
} catch (InvalidArgumentException $e) {
    chat_erro(422, $e->getMessage());
} catch (PDOException $e) {
    chat_erro_banco($e, 'iniciar');
}

chat_resposta(200, ['sucesso' => true, 'conversa_id' => $conversa['id'], 'usuario' => $outro]);
