<?php
/**
 * POST api/dashboard/excluir_usuario.php — Exclui um usuário (Dashboard).
 *
 * EXCLUSIVO do Administrador Intelbras (usuário id 1): reaproveita o bootstrap
 * do módulo administrativo, que responde 401 (sem sessão) / 403 (não-admin) e
 * confere o token CSRF (header X-CSRF-Token).
 *
 * Corpo: { id }
 *
 * O que acontece:
 *   1. Apaga o usuário de tb_usuarios. As demais tabelas (mensagens, conversas,
 *      documentos, chamadas, reuniões, IA, preferências, sessões, presença…) têm
 *      ON DELETE CASCADE, então saem junto automaticamente.
 *   2. Apaga a solicitação de acesso que originou a conta (tb_solicitacoes_acesso),
 *      pra ele poder se cadastrar de novo com o mesmo e-mail/CPF depois.
 *   3. Limpa os arquivos que ficariam órfãos no disco: foto de perfil, documentos,
 *      anexos do chat das Equipes e anexos da IA.
 *
 * Não exclui (responde 409):
 *   - o próprio Administrador (id 1);
 *   - usuário com pedidos na Loja (tb_loja_pedidos não tem CASCADE de propósito,
 *     pra não apagar histórico de vendas/receita). Nesse caso, use "inativo".
 *
 * Resposta: { sucesso, arquivos_removidos }
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../documentos/_servico.php'; // doc_dir_arquivos()
require_once __DIR__ . '/../equipes/_servico.php';    // eq_dir_arquivos()
require_once __DIR__ . '/../ia/_anexos.php';          // ia_dir_anexos()

usr_iniciar(['POST']);
usr_exigir_csrf();

/** Mesma lógica de cfg_dir_fotos() (api/configuracoes/foto.php), que é um endpoint e não pode ser incluído. */
function excluir_dir_fotos(): string
{
    $env = getenv('PERFIL_UPLOAD_DIR');
    if ($env !== false && $env !== '') {
        return rtrim($env, '/\\');
    }
    $raiz = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/\\');
    $base = $raiz !== '' ? dirname($raiz) : dirname(__DIR__, 3);
    return $base . '/perfil_uploads';
}

/** Lê uma coluna de nomes de arquivo; se a tabela não existir neste banco, devolve lista vazia. */
function excluir_coletar(PDO $pdo, string $sql, int $id): array
{
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['id' => $id]);
        return array_values(array_filter(array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN)), 'strlen'));
    } catch (PDOException $e) {
        return [];
    }
}

/** Ainda existe alguma linha apontando pra este arquivo? (tabela/coluna são fixas no código, nunca vêm da requisição) */
function excluir_ainda_usado(PDO $pdo, string $tabela, string $coluna, string $nome): bool
{
    try {
        $stmt = $pdo->prepare("SELECT 1 FROM `$tabela` WHERE `$coluna` = :n LIMIT 1");
        $stmt->execute(['n' => $nome]);
        return (bool)$stmt->fetchColumn();
    } catch (PDOException $e) {
        return true; // na dúvida, não apaga
    }
}

/** Apaga do disco os arquivos que não são mais referenciados. Devolve quantos foram removidos. */
function excluir_limpar_pasta(PDO $pdo, string $dir, array $nomes, string $tabela, string $coluna): int
{
    $removidos = 0;
    foreach (array_unique($nomes) as $nome) {
        // Só aceita nome simples (sem caminho) — impede sair da pasta de uploads.
        if ($nome === '' || $nome !== basename($nome) || str_contains($nome, '..')) {
            continue;
        }
        $caminho = $dir . '/' . $nome;
        if (!is_file($caminho) || excluir_ainda_usado($pdo, $tabela, $coluna, $nome)) {
            continue;
        }
        if (@unlink($caminho)) {
            $removidos++;
        } else {
            error_log('[dashboard/excluir_usuario] não foi possível apagar ' . $caminho);
        }
    }
    return $removidos;
}

try {
    $pdo   = conectar();
    $dados = usr_ler_json();

    $id = (int)($dados['id'] ?? 0);
    if ($id <= 0) {
        usr_erro(422, 'Id inválido.');
    }
    if ($id === USR_ADMIN_ID) {
        usr_erro(403, 'A conta do Administrador não pode ser excluída.');
    }

    $stmt = $pdo->prepare('SELECT id, nome, foto_arquivo FROM tb_usuarios WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $id]);
    $usuario = $stmt->fetch();
    if (!$usuario) {
        usr_erro(404, 'Usuário não encontrado.');
    }

    // Pedidos da Loja seguram a exclusão (FK sem CASCADE) — avisa em vez de falhar com erro de banco.
    try {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM tb_loja_pedidos WHERE usuario_id = :id');
        $stmt->execute(['id' => $id]);
        $pedidos = (int)$stmt->fetchColumn();
    } catch (PDOException $e) {
        $pedidos = 0; // tabela inexistente neste banco
    }
    if ($pedidos > 0) {
        usr_erro(409, sprintf(
            '%s possui %d pedido%s na Loja e não pode ser excluído (o histórico de compras seria perdido). Deixe o usuário como inativo.',
            (string)$usuario['nome'],
            $pedidos,
            $pedidos === 1 ? '' : 's'
        ));
    }

    // Anota os arquivos ANTES de apagar (depois do CASCADE as linhas já não existem).
    $fotos      = $usuario['foto_arquivo'] !== null ? [(string)$usuario['foto_arquivo']] : [];
    $documentos = excluir_coletar($pdo, 'SELECT arquivo FROM tb_documentos WHERE usuario_id = :id', $id);
    $anexosEq   = excluir_coletar(
        $pdo,
        'SELECT a.arquivo FROM tb_equipes_anexos a
           JOIN tb_equipes_mensagens m ON m.id = a.mensagem_id
          WHERE m.usuario_id = :id',
        $id
    );
    $anexosIa   = excluir_coletar(
        $pdo,
        'SELECT a.arquivo FROM tb_ia_anexos a
           JOIN tb_ia_mensagens m ON m.id = a.mensagem_id
           JOIN tb_ia_conversas c ON c.id = m.conversa_id
          WHERE c.usuario_id = :id',
        $id
    );

    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM tb_solicitacoes_acesso WHERE usuario_criado_id = :id')->execute(['id' => $id]);
        $pdo->prepare('DELETE FROM tb_usuarios WHERE id = :id')->execute(['id' => $id]);
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ($e->getCode() === '23000') { // violação de chave estrangeira
            usr_erro(409, 'Este usuário ainda tem dados vinculados e não pôde ser excluído.');
        }
        throw $e;
    }

    // Banco já limpo: agora apaga do disco o que sobrou sem dono.
    $removidos  = excluir_limpar_pasta($pdo, excluir_dir_fotos(), $fotos, 'tb_usuarios', 'foto_arquivo');
    $removidos += excluir_limpar_pasta($pdo, doc_dir_arquivos(), $documentos, 'tb_documentos', 'arquivo');
    $removidos += excluir_limpar_pasta($pdo, eq_dir_arquivos(), $anexosEq, 'tb_equipes_anexos', 'arquivo');
    $removidos += excluir_limpar_pasta($pdo, ia_dir_anexos(), $anexosIa, 'tb_ia_anexos', 'arquivo');

    usr_resposta(200, ['sucesso' => true, 'arquivos_removidos' => $removidos]);
} catch (PDOException $e) {
    error_log('[dashboard/excluir_usuario] ' . $e->getMessage());
    usr_erro(500, 'Erro ao excluir no banco de dados.');
}
