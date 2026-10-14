<?php
/**
 * GET  api/chat/mensagens.php?conversa_id=1[&depois_de=42]
 *   Lista as mensagens da conversa (exige ser um dos dois participantes).
 *   Com "depois_de", devolve só mensagens mais novas que esse id — usado
 *   pelo polling do chat aberto na tela, pra não rebaixar a conversa toda
 *   a cada poucos segundos. Toda chamada SEM "depois_de" marca a conversa
 *   como lida; com "depois_de" só marca se vierem mensagens novas.
 *
 * POST api/chat/mensagens.php   (multipart/form-data + header X-CSRF-Token)
 *   conversa_id   obrigatório
 *   texto         opcional (até 4000 caracteres)
 *   arquivo       opcional (mesmas regras do módulo Documentos, até 20 MB)
 *   Pelo menos um dos dois (texto ou arquivo) é obrigatório.
 *   Resposta: { sucesso, mensagem }
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$metodo = $_SERVER['REQUEST_METHOD'] ?? '';
$meuId = chat_iniciar(['GET', 'POST']);

if ($metodo === 'GET') {
    $conversaId = (int)($_GET['conversa_id'] ?? 0);
    $depoisDe   = (int)($_GET['depois_de'] ?? 0);

    try {
        $pdo = chat_pdo();
        if (!chat_eh_participante($pdo, $conversaId, $meuId)) {
            chat_erro(404, 'Conversa não encontrada.');
        }

        $mensagens = chat_listar_mensagens($pdo, $conversaId, $depoisDe);
        if ($depoisDe <= 0 || !empty($mensagens)) {
            chat_marcar_lida($pdo, $conversaId, $meuId);
        }
    } catch (PDOException $e) {
        chat_erro_banco($e, 'mensagens-get');
    }

    chat_resposta(200, ['sucesso' => true, 'mensagens' => $mensagens]);
}

// -------------------- POST --------------------
chat_exigir_csrf();

// Se o corpo passar de post_max_size (php.ini), o PHP descarta $_POST e $_FILES.
if (empty($_POST) && empty($_FILES) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    chat_erro(413, 'O arquivo é maior que o limite aceito pelo servidor.');
}

$conversaId = (int)($_POST['conversa_id'] ?? 0);
$texto = isset($_POST['texto']) ? (string)$_POST['texto'] : '';
$arquivo = $_FILES['arquivo'] ?? null;

try {
    $pdo = chat_pdo();
    if (!chat_eh_participante($pdo, $conversaId, $meuId)) {
        chat_erro(404, 'Conversa não encontrada.');
    }

    if (is_array($arquivo) && ($arquivo['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        $up = doc_receber_upload($arquivo);
        $doc = documentos_salvar_arquivo(
            $pdo,
            $meuId,
            'geral', // anexos do chat pessoal não pertencem a uma equipe
            $up['tmp'],
            $up['nome'],
            ['origem' => 'chat', 'origem_ref' => 'conversa-' . $conversaId . '-' . bin2hex(random_bytes(8))]
        );
        $mensagem = chat_enviar_anexo($pdo, $conversaId, $meuId, $doc['id'], $texto);
    } else {
        $mensagem = chat_enviar_texto($pdo, $conversaId, $meuId, $texto);
    }
} catch (InvalidArgumentException $e) {
    chat_erro(422, $e->getMessage());
} catch (DocumentosErro $e) {
    chat_erro($e->getCode(), $e->getMessage());
} catch (PDOException $e) {
    chat_erro_banco($e, 'mensagens-post');
}

chat_resposta(201, ['sucesso' => true, 'mensagem' => $mensagem]);
