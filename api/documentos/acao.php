<?php
/**
 * POST api/documentos/acao.php   (JSON + header X-CSRF-Token)
 *   { acao, id, ... }
 *
 *   favoritar           valor: true|false   -> marca/desmarca a estrela (só para o usuário logado)
 *   acessar                                 -> registra que o usuário abriu o documento
 *   renomear            nome                -> só quem enviou
 *   excluir                                 -> envia para a lixeira (só quem enviou)
 *   restaurar                               -> tira da lixeira (só quem enviou)
 *   excluir_definitivo                      -> apaga do banco e do disco; só se já estiver na lixeira
 *
 * Documento inexistente responde 404; ação restrita ao dono responde 403.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = doc_iniciar(['POST']);
doc_exigir_csrf();

$dados = doc_ler_json();
$acao  = (string)($dados['acao'] ?? '');
$id    = (int)($dados['id'] ?? 0);

if ($id <= 0) {
    doc_erro(422, 'Documento inválido.');
}
if (!in_array($acao, ['favoritar', 'acessar', 'renomear', 'excluir', 'restaurar', 'excluir_definitivo'], true)) {
    doc_erro(422, 'Ação inválida.');
}

try {
    $pdo = doc_pdo();

    $stmt = $pdo->prepare(
        'SELECT id, usuario_id, arquivo, excluido_em
         FROM tb_documentos
         WHERE id = :id
         LIMIT 1'
    );
    $stmt->execute(['id' => $id]);
    $doc = $stmt->fetch();

    if (!$doc) {
        doc_erro(404, 'Documento não encontrado.');
    }

    $ativo = $doc['excluido_em'] === null;
    $dono  = (int)$doc['usuario_id'] === $usuarioId;

    // Ações que qualquer usuário logado pode fazer, só em documento ativo
    if (in_array($acao, ['favoritar', 'acessar'], true) && !$ativo) {
        doc_erro(404, 'Documento não encontrado.');
    }
    // Ações restritas a quem enviou o documento
    if (in_array($acao, ['renomear', 'excluir', 'restaurar', 'excluir_definitivo'], true) && !$dono) {
        doc_erro(403, 'Só quem enviou o documento pode fazer isso.');
    }

    switch ($acao) {
        case 'favoritar':
            $valor = $dados['valor'] ?? null;
            if (!is_bool($valor)) {
                doc_erro(422, 'Valor inválido.');
            }
            if ($valor) {
                $stmt = $pdo->prepare(
                    'INSERT IGNORE INTO tb_documentos_favoritos (usuario_id, documento_id)
                     VALUES (:usuario_id, :documento_id)'
                );
            } else {
                $stmt = $pdo->prepare(
                    'DELETE FROM tb_documentos_favoritos
                     WHERE usuario_id = :usuario_id AND documento_id = :documento_id'
                );
            }
            $stmt->execute(['usuario_id' => $usuarioId, 'documento_id' => $id]);
            doc_resposta(200, ['sucesso' => true, 'favorito' => $valor]);

        case 'acessar':
            $stmt = $pdo->prepare(
                'INSERT INTO tb_documentos_acessos (usuario_id, documento_id, acessado_em)
                 VALUES (:usuario_id, :documento_id, NOW())
                 ON DUPLICATE KEY UPDATE acessado_em = NOW()'
            );
            $stmt->execute(['usuario_id' => $usuarioId, 'documento_id' => $id]);
            doc_resposta(200, ['sucesso' => true]);

        case 'renomear':
            if (!$ativo) {
                doc_erro(422, 'Restaure o documento antes de renomear.');
            }
            $nome = doc_limpar_nome((string)($dados['nome'] ?? ''));
            if ($nome === '') {
                doc_erro(422, 'Informe um nome para o documento.');
            }
            $stmt = $pdo->prepare(
                'UPDATE tb_documentos
                    SET nome = :nome, atualizado_por = :usuario_id, atualizado_em = NOW()
                  WHERE id = :id AND usuario_id = :dono AND excluido_em IS NULL'
            );
            $stmt->execute(['nome' => $nome, 'usuario_id' => $usuarioId, 'id' => $id, 'dono' => $usuarioId]);
            doc_resposta(200, ['sucesso' => true, 'nome' => $nome]);

        case 'excluir': // lixeira (soft delete). Não mexe em atualizado_em.
            $stmt = $pdo->prepare(
                'UPDATE tb_documentos SET excluido_em = NOW()
                  WHERE id = :id AND usuario_id = :usuario_id AND excluido_em IS NULL'
            );
            $stmt->execute(['id' => $id, 'usuario_id' => $usuarioId]);
            doc_resposta(200, ['sucesso' => true]);

        case 'restaurar':
            $stmt = $pdo->prepare(
                'UPDATE tb_documentos SET excluido_em = NULL
                  WHERE id = :id AND usuario_id = :usuario_id AND excluido_em IS NOT NULL'
            );
            $stmt->execute(['id' => $id, 'usuario_id' => $usuarioId]);
            doc_resposta(200, ['sucesso' => true]);

        case 'excluir_definitivo':
            if ($ativo) {
                doc_erro(422, 'Envie o documento para a lixeira antes de excluí-lo definitivamente.');
            }
            $stmt = $pdo->prepare(
                'DELETE FROM tb_documentos
                  WHERE id = :id AND usuario_id = :usuario_id AND excluido_em IS NOT NULL'
            );
            $stmt->execute(['id' => $id, 'usuario_id' => $usuarioId]);

            // Favoritos e acessos saem junto (ON DELETE CASCADE). O arquivo do
            // disco só é apagado depois que a linha do banco foi removida.
            $caminho = doc_dir_arquivos() . '/' . basename((string)$doc['arquivo']);
            if ($stmt->rowCount() > 0 && is_file($caminho)) {
                @unlink($caminho);
            }
            doc_resposta(200, ['sucesso' => true]);
    }
} catch (PDOException $e) {
    doc_erro_banco($e, 'acao');
}
