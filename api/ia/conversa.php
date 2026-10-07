<?php
/**
 * GET  api/ia/conversa.php?id=123  -> mensagens da conversa
 * POST api/ia/conversa.php         -> { acao, id, ... }
 *        acao: renomear (titulo) | fixar (valor 0/1) | arquivar | excluir
 *
 * Conversa inexistente OU de outro usuário responde 404 (nunca 403),
 * para não revelar que o id existe.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = ia_iniciar(['GET', 'POST']);
$ehPost    = $_SERVER['REQUEST_METHOD'] === 'POST';

if ($ehPost) {
    ia_exigir_csrf();
    $dados = ia_ler_json();
    $id = (int)($dados['id'] ?? 0);
} else {
    $id = (int)($_GET['id'] ?? 0);
}

if ($id <= 0) {
    ia_erro(422, 'Conversa inválida.');
}

try {
    $pdo = ia_pdo();

    // Confere o dono (e soft delete) antes de qualquer leitura/alteração.
    // (Não dá para depender de rowCount() nos UPDATEs: o MySQL devolve 0
    // quando o valor novo é igual ao antigo.)
    $stmt = $pdo->prepare(
        'SELECT id, titulo, fixada, equipe_slug, ultima_mensagem_em AS atualizada_em
         FROM tb_ia_conversas
         WHERE id = :id AND usuario_id = :usuario_id AND excluida_em IS NULL
         LIMIT 1'
    );
    $stmt->execute(['id' => $id, 'usuario_id' => $usuarioId]);
    $conversa = $stmt->fetch();

    if (!$conversa) {
        ia_erro(404, 'Conversa não encontrada.');
    }

    // ------------------------------------------------------------
    // GET — mensagens em ordem cronológica
    // ------------------------------------------------------------
    if (!$ehPost) {
        $stmt = $pdo->prepare(
            'SELECT m.id, m.papel, m.conteudo, m.feedback, m.criada_em
             FROM tb_ia_mensagens m
             JOIN tb_ia_conversas c ON c.id = m.conversa_id
             WHERE m.conversa_id = :conversa_id
               AND c.usuario_id = :usuario_id
               AND c.excluida_em IS NULL
             ORDER BY m.criada_em ASC, m.id ASC'
        );
        $stmt->execute(['conversa_id' => $id, 'usuario_id' => $usuarioId]);
        $linhas = $stmt->fetchAll();

        // Anexos da conversa (cada mensagem pode ter vários), agrupados por mensagem.
        // A conversa já teve o dono conferido acima.
        $stmt = $pdo->prepare(
            'SELECT a.id, a.mensagem_id, a.nome_original, a.mime, a.tamanho
             FROM tb_ia_anexos a
             JOIN tb_ia_mensagens m ON m.id = a.mensagem_id
             WHERE m.conversa_id = :conversa_id
             ORDER BY a.id ASC'
        );
        $stmt->execute(['conversa_id' => $id]);
        $anexosPorMensagem = [];
        foreach ($stmt->fetchAll() as $a) {
            $anexosPorMensagem[(int)$a['mensagem_id']][] = [
                'id'      => (int)$a['id'],
                'nome'    => (string)$a['nome_original'],
                'mime'    => (string)$a['mime'],
                'tamanho' => (int)$a['tamanho'],
            ];
        }

        $mensagens = array_map(static fn(array $m): array => [
            'id'        => (int)$m['id'],
            'papel'     => (string)$m['papel'],
            'conteudo'  => (string)$m['conteudo'],
            'feedback'  => $m['feedback'],
            'criada_em' => ia_iso((string)$m['criada_em']),
            'anexos'    => $anexosPorMensagem[(int)$m['id']] ?? [],
        ], $linhas);

        $info = ia_formatar_conversa($conversa);
        $info['equipe_slug'] = $conversa['equipe_slug'];

        ia_resposta(200, ['sucesso' => true, 'conversa' => $info, 'mensagens' => $mensagens]);
    }

    // ------------------------------------------------------------
    // POST — ações
    // ------------------------------------------------------------
    $acao = (string)($dados['acao'] ?? '');

    switch ($acao) {
        case 'renomear':
            $titulo = trim((string)($dados['titulo'] ?? ''));
            $tamanho = mb_strlen($titulo);
            if ($tamanho < 1 || $tamanho > 120) {
                ia_erro(422, 'O título deve ter de 1 a 120 caracteres.');
            }
            $sql = 'UPDATE tb_ia_conversas SET titulo = :valor
                    WHERE id = :id AND usuario_id = :usuario_id AND excluida_em IS NULL';
            $valor = $titulo;
            break;

        case 'fixar':
            $v = $dados['valor'] ?? null;
            if ($v !== 0 && $v !== 1 && $v !== true && $v !== false) {
                ia_erro(422, 'Valor inválido.');
            }
            $sql = 'UPDATE tb_ia_conversas SET fixada = :valor
                    WHERE id = :id AND usuario_id = :usuario_id AND excluida_em IS NULL';
            $valor = $v ? 1 : 0;
            break;

        case 'arquivar':
            $sql = 'UPDATE tb_ia_conversas SET arquivada = 1
                    WHERE id = :id AND usuario_id = :usuario_id AND excluida_em IS NULL';
            $valor = null;
            break;

        case 'excluir': // soft delete
            $sql = 'UPDATE tb_ia_conversas SET excluida_em = NOW()
                    WHERE id = :id AND usuario_id = :usuario_id AND excluida_em IS NULL';
            $valor = null;
            break;

        default:
            ia_erro(422, 'Ação inválida.');
    }

    $stmt = $pdo->prepare($sql);
    $parametros = ['id' => $id, 'usuario_id' => $usuarioId];
    if ($valor !== null) {
        $parametros['valor'] = $valor;
    }
    $stmt->execute($parametros);

    ia_resposta(200, ['sucesso' => true]);
} catch (PDOException $e) {
    error_log('[ia/conversa] ' . $e->getMessage());
    ia_erro(500, 'Erro ao consultar o banco de dados.');
}
