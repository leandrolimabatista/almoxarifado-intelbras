<?php
/**
 * api/usuarios/solicitacoes.php
 *
 * GET  -> lista as solicitações de acesso (?status=pendente|aceita|recusada|todas,
 *         padrão "pendente").
 * POST -> aceita ou recusa uma solicitação.
 *         Corpo: { "id": 1, "acao": "aceitar" | "recusar" }
 *         Exige header X-CSRF-Token (ver data-csrf em usuarios.html).
 *
 *         Ao aceitar: cria a conta em tb_usuarios (unidade fixa —
 *         Lapa Tito, única unidade hoje — e equipe = a solicitada),
 *         marca a solicitação como "aceita" e guarda o id criado.
 *         Ao recusar: só marca a solicitação como "recusada".
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$adminId = usr_iniciar(['GET', 'POST']);

try {
    $pdo = conectar();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $status = $_GET['status'] ?? 'pendente';
        $statusValidos = ['pendente', 'aceita', 'recusada', 'todas'];
        if (!in_array($status, $statusValidos, true)) {
            $status = 'pendente';
        }

        if ($status === 'todas') {
            $stmt = $pdo->query('SELECT * FROM tb_solicitacoes_acesso ORDER BY solicitado_em DESC');
        } else {
            $stmt = $pdo->prepare('SELECT * FROM tb_solicitacoes_acesso WHERE status = :status ORDER BY solicitado_em DESC');
            $stmt->execute(['status' => $status]);
        }

        $itens = array_map('usr_formatar_solicitacao', $stmt->fetchAll());
        usr_resposta(200, ['sucesso' => true, 'itens' => $itens]);
    }

    // ------------------------------------------------------------
    // POST — aceitar ou recusar
    // ------------------------------------------------------------
    usr_exigir_csrf();
    $dados = usr_ler_json();

    $id   = (int)($dados['id'] ?? 0);
    $acao = usr_campo($dados, 'acao');

    if ($id <= 0 || !in_array($acao, ['aceitar', 'recusar'], true)) {
        usr_erro(422, 'Dados inválidos.');
    }

    $stmt = $pdo->prepare('SELECT * FROM tb_solicitacoes_acesso WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $id]);
    $solicitacao = $stmt->fetch();

    if (!$solicitacao) {
        usr_erro(404, 'Solicitação não encontrada.');
    }
    if ($solicitacao['status'] !== 'pendente') {
        usr_erro(409, 'Esta solicitação já foi respondida.');
    }

    if ($acao === 'recusar') {
        $stmt = $pdo->prepare(
            'UPDATE tb_solicitacoes_acesso SET status = "recusada", respondido_em = NOW(), respondido_por = :admin WHERE id = :id'
        );
        $stmt->execute(['admin' => $adminId, 'id' => $id]);

        usr_resposta(200, ['sucesso' => true, 'status' => 'recusada']);
    }

    // Aceitar: cria a conta de verdade. Confere de novo se email/CPF/
    // telefone não foram usados por outra conta entre o envio da
    // solicitação e agora (idem api/cadastro.php).
    $stmtDup = $pdo->prepare('SELECT id FROM tb_usuarios WHERE email = :email OR cpf = :cpf OR telefone = :telefone LIMIT 1');
    $stmtDup->execute([
        'email' => $solicitacao['email'],
        'cpf' => $solicitacao['cpf'],
        'telefone' => $solicitacao['telefone'],
    ]);
    if ($stmtDup->fetch()) {
        usr_erro(409, 'Já existe uma conta com este email, telefone ou CPF.');
    }

    // Unidade única disponível hoje (Lapa Tito). Se não houver
    // nenhuma unidade cadastrada, a conta é criada sem unidade.
    $unidadeId = $pdo->query("SELECT id FROM tb_unidades WHERE status = 'ativa' ORDER BY id LIMIT 1")->fetchColumn();
    $unidadeId = $unidadeId !== false ? (int)$unidadeId : null;

    $equipe = array_key_exists($solicitacao['equipe_solicitada'], USR_EQUIPES) ? $solicitacao['equipe_solicitada'] : 'geral';

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO tb_usuarios
                (nome, email, senha_hash, telefone, cpf, data_nascimento, genero, genero_outro, unidade_id, equipe_slug, status)
             VALUES
                (:nome, :email, :senha_hash, :telefone, :cpf, :data_nascimento, :genero, :genero_outro, :unidade_id, :equipe_slug, "ativo")'
        );
        $stmt->execute([
            'nome'            => $solicitacao['nome'],
            'email'           => $solicitacao['email'],
            'senha_hash'      => $solicitacao['senha_hash'],
            'telefone'        => $solicitacao['telefone'],
            'cpf'             => $solicitacao['cpf'],
            'data_nascimento' => $solicitacao['data_nascimento'],
            'genero'          => $solicitacao['genero'],
            'genero_outro'    => $solicitacao['genero_outro'],
            'unidade_id'      => $unidadeId,
            'equipe_slug'     => $equipe,
        ]);
        $novoId = (int)$pdo->lastInsertId();

        $stmt = $pdo->prepare(
            'UPDATE tb_solicitacoes_acesso
             SET status = "aceita", respondido_em = NOW(), respondido_por = :admin, usuario_criado_id = :novo_id
             WHERE id = :id'
        );
        $stmt->execute(['admin' => $adminId, 'novo_id' => $novoId, 'id' => $id]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    usr_resposta(200, ['sucesso' => true, 'status' => 'aceita', 'usuario_id' => $novoId]);
} catch (PDOException $e) {
    usr_erro(500, 'Erro ao consultar o banco de dados.');
}
