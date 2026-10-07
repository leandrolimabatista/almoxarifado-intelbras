<?php
/**
 * POST api/documentos/enviar.php   (multipart/form-data + header X-CSRF-Token)
 *   arquivo   o arquivo (PDF, Word, Excel, PowerPoint, imagem ou texto; até 20 MB)
 *   equipe    slug da equipe (geral | projetos | marketing | rh | financeiro | ti | sac)
 *   nome      título (opcional; padrão = nome do arquivo sem a extensão)
 *
 * O arquivo é validado pela assinatura (não pelo tipo informado pelo navegador)
 * e salvo FORA do htdocs com um nome aleatório — ver doc_dir_arquivos().
 * A lógica está em documentos_salvar_arquivo() (_servico.php), compartilhada
 * com o chat das equipes.
 * Resposta: { sucesso, id }
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = doc_iniciar(['POST']);
doc_exigir_csrf();

// Se o corpo passar de post_max_size (php.ini), o PHP descarta $_POST e $_FILES.
if (empty($_POST) && empty($_FILES) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    doc_erro(413, 'O arquivo é maior que o limite aceito pelo servidor.');
}

$equipe = (string)($_POST['equipe'] ?? '');
if (!array_key_exists($equipe, DOC_EQUIPES)) {
    doc_erro(422, 'Escolha a equipe do documento.');
}

$f = $_FILES['arquivo'] ?? null;
if (!is_array($f)) {
    doc_erro(422, 'Selecione um arquivo.');
}

// Toda a validação e o salvamento estão em documentos_salvar_arquivo()
// (api/documentos/_servico.php) — o mesmo serviço que o chat das equipes usa.
try {
    $up = doc_receber_upload($f);
    $r  = documentos_salvar_arquivo(
        doc_pdo(),
        $usuarioId,
        $equipe,
        $up['tmp'],
        $up['nome'],
        ['nome' => (string)($_POST['nome'] ?? '')]
    );
} catch (DocumentosErro $e) {
    doc_erro($e->getCode(), $e->getMessage());
} catch (PDOException $e) {
    doc_erro_banco($e, 'enviar');
}

doc_resposta(201, ['sucesso' => true, 'id' => $r['id']]);
