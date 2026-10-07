<?php
/**
 * GET  api/equipes/mensagens.php?slug=geral&depois_de=0
 *      Lista mensagens do canal. Com "depois_de" (id da última mensagem já
 *      vista), devolve só o que é novo/mudou — usado no polling automático.
 *      Marca as mensagens carregadas como lidas (badge da sidebar).
 *
 * POST api/equipes/mensagens.php   multipart/form-data ou JSON
 *      Campos: slug, conteudo, resposta_a (opcional), anexo (arquivo, opcional).
 *      Exige header X-CSRF-Token. Equipe "somente leitura" só aceita admins.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = eq_iniciar(['GET', 'POST']);

try {
    $pdo = eq_pdo();
    $equipe = eq_slug_da_query($pdo);
    $slug = $equipe['slug'];

    if (!eq_e_membro($pdo, $usuarioId, $slug)) {
        eq_erro(403, 'Você não faz parte desta equipe.');
    }
    eq_garantir_membro($pdo, $usuarioId, $slug);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        eq_marcar_visto($pdo, $usuarioId);

        $depoisDe = (int)($_GET['depois_de'] ?? 0);

        $stmt = $pdo->prepare(
            'SELECT ultima_leitura_id FROM tb_equipes_membros WHERE equipe_slug = :slug AND usuario_id = :uid'
        );
        $stmt->execute(['slug' => $slug, 'uid' => $usuarioId]);
        $leituraAnterior = (int)($stmt->fetchColumn() ?: 0);

        $resultado = eq_listar_mensagens($pdo, $slug, $usuarioId, $depoisDe);
        eq_marcar_lido($pdo, $slug, $usuarioId);

        eq_resposta(200, [
            'sucesso'          => true,
            'mensagens'        => $resultado['mensagens'],
            'ultimo_id'        => $resultado['ultimo_id'],
            'leitura_anterior' => $leituraAnterior,
            'digitando'        => eq_quem_digitando($pdo, $slug, $usuarioId),
        ]);
    }

    // ------------------------------------------------------------ POST
    eq_exigir_csrf();

    if ((bool)$equipe['somente_leitura'] && !eq_e_admin($pdo, $usuarioId)) {
        eq_erro(403, 'Este canal é somente leitura. Só administradores podem enviar mensagens.');
    }

    $conteudo  = trim((string)($_POST['conteudo'] ?? ''));
    $respostaA = isset($_POST['resposta_a']) && $_POST['resposta_a'] !== '' ? (int)$_POST['resposta_a'] : null;
    $temAnexo  = isset($_FILES['anexo']) && (int)($_FILES['anexo']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;

    if ($conteudo === '' && !$temAnexo) {
        eq_erro(422, 'Escreva uma mensagem ou anexe um arquivo.');
    }

    $pdo->beginTransaction();
    try {
        $mensagemId = eq_criar_mensagem($pdo, $slug, $usuarioId, $conteudo !== '' ? $conteudo : '📎 Arquivo enviado', $respostaA);

        $anexo = null;
        if ($temAnexo) {
            $f = $_FILES['anexo'];
            $erro = (int)($f['error'] ?? UPLOAD_ERR_NO_FILE);
            if ($erro === UPLOAD_ERR_INI_SIZE || $erro === UPLOAD_ERR_FORM_SIZE) {
                throw new EquipesErro('O arquivo é maior que o limite aceito pelo servidor.', 413);
            }
            if ($erro !== UPLOAD_ERR_OK || !is_uploaded_file((string)$f['tmp_name'])) {
                throw new EquipesErro('Não foi possível receber o arquivo. Tente novamente.', 422);
            }
            $anexo = eq_salvar_anexo($pdo, $mensagemId, $slug, $usuarioId, (string)$f['tmp_name'], (string)$f['name']);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    $resultado = eq_listar_mensagens($pdo, $slug, $usuarioId, $mensagemId - 1);
    eq_marcar_lido($pdo, $slug, $usuarioId);

    eq_resposta(201, [
        'sucesso'  => true,
        'mensagem' => $resultado['mensagens'][0] ?? null,
    ]);
} catch (EquipesErro $e) {
    eq_erro((int)$e->getCode() ?: 422, $e->getMessage());
} catch (PDOException $e) {
    eq_erro_banco($e, 'mensagens');
}
