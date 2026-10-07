<?php
/**
 * api/usuarios/usuario.php
 *
 * GET  ?id=123 -> dados de um usuário (tela "Editar usuário").
 * POST         -> atualiza um usuário.
 *         Corpo: { id, nome, email, telefone, cpf, data_nascimento (dd/mm/aaaa),
 *                  genero, genero_outro?, senha?, repetir_senha?,
 *                  unidade_id, equipe }
 *         "unidade_id" e "equipe" são obrigatórios (únicos campos
 *         obrigatórios da tela, conforme o protótipo). "senha" é
 *         opcional — deixando em branco, a senha atual não muda.
 *         Exige header X-CSRF-Token.
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

usr_iniciar(['GET', 'POST']);

try {
    $pdo = conectar();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $id = (int)($_GET['id'] ?? 0);
        if ($id <= 0) {
            usr_erro(422, 'Id inválido.');
        }

        $stmt = $pdo->prepare(
            'SELECT u.*, un.nome AS unidade_nome
             FROM tb_usuarios u
             LEFT JOIN tb_unidades un ON un.id = u.unidade_id
             WHERE u.id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $usuario = $stmt->fetch();

        if (!$usuario) {
            usr_erro(404, 'Usuário não encontrado.');
        }

        usr_resposta(200, ['sucesso' => true, 'usuario' => usr_formatar_usuario($usuario)]);
    }

    // ------------------------------------------------------------
    // POST — atualizar
    // ------------------------------------------------------------
    usr_exigir_csrf();
    $dados = usr_ler_json();

    $id = (int)($dados['id'] ?? 0);
    if ($id <= 0) {
        usr_erro(422, 'Id inválido.');
    }

    $stmt = $pdo->prepare('SELECT * FROM tb_usuarios WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $id]);
    $atual = $stmt->fetch();
    if (!$atual) {
        usr_erro(404, 'Usuário não encontrado.');
    }

    $nome            = usr_campo($dados, 'nome');
    $email           = usr_campo($dados, 'email');
    $telefone        = usr_campo($dados, 'telefone');
    $cpf             = usr_campo($dados, 'cpf');
    $dataNascimento  = usr_campo($dados, 'data_nascimento');
    $genero          = usr_campo($dados, 'genero');
    $generoOutro     = usr_campo($dados, 'genero_outro');
    $senha           = usr_campo($dados, 'senha');
    $repetirSenha    = usr_campo($dados, 'repetir_senha');
    $unidadeId       = (int)($dados['unidade_id'] ?? 0);
    $equipe          = usr_campo($dados, 'equipe');
    $cargo           = usr_campo($dados, 'cargo');

    $erros = [];

    if (mb_strlen($nome) < 3) {
        $erros['nome'] = 'Informe o nome completo.';
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $erros['email'] = 'Email inválido.';
    }

    $telefoneDigitos = preg_replace('/\D/', '', $telefone);
    if (!preg_match('/^\d{10,11}$/', $telefoneDigitos)) {
        $erros['telefone'] = 'Telefone inválido.';
    }

    $cpfDigitos = preg_replace('/\D/', '', $cpf);
    if (!usr_cpf_valido($cpfDigitos)) {
        $erros['cpf'] = 'CPF inválido.';
    }

    $dataNascimentoSql = null;
    if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $dataNascimento, $m)) {
        [, $dia, $mes, $ano] = $m;
        if (checkdate((int)$mes, (int)$dia, (int)$ano)) {
            $dataNascimentoSql = "$ano-$mes-$dia";
        }
    } elseif (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dataNascimento)) {
        // Já vem no formato do banco (ex.: campo não alterado no front-end).
        $dataNascimentoSql = $dataNascimento;
    }
    if ($dataNascimentoSql === null) {
        $erros['data_nascimento'] = 'Data de nascimento inválida.';
    }

    $generosValidos = ['masculino', 'feminino', 'outro', 'prefiro_nao_informar'];
    if (!in_array($genero, $generosValidos, true)) {
        $erros['genero'] = 'Selecione um gênero válido.';
    }
    if ($genero === 'outro' && $generoOutro === '') {
        $erros['genero_outro'] = 'Informe o gênero.';
    }

    if ($senha !== '' || $repetirSenha !== '') {
        if (mb_strlen($senha) < 6) {
            $erros['senha'] = 'A senha deve ter pelo menos 6 caracteres.';
        } elseif ($senha !== $repetirSenha) {
            $erros['repetir_senha'] = 'As senhas não coincidem.';
        }
    }

    // Únicos campos obrigatórios da tela, além dos dados pessoais:
    // Unidade e Equipe (ver aviso "Apenas os campos Unidade e Equipe
    // são obrigatórios" no protótipo).
    $stmtUnidade = $pdo->prepare("SELECT id FROM tb_unidades WHERE id = :id AND status = 'ativa' LIMIT 1");
    $stmtUnidade->execute(['id' => $unidadeId]);
    if ($unidadeId <= 0 || !$stmtUnidade->fetch()) {
        $erros['unidade_id'] = 'Selecione uma unidade válida.';
    }
    if (!array_key_exists($equipe, USR_EQUIPES)) {
        $erros['equipe'] = 'Selecione uma equipe válida.';
    }
    if (!array_key_exists($cargo, USR_CARGOS)) {
        $erros['cargo'] = 'Selecione um cargo válido.';
    }

    if (!empty($erros)) {
        usr_resposta(422, ['sucesso' => false, 'erros' => $erros]);
    }

    // Duplicidade de email/telefone/CPF em OUTRA conta.
    $stmtDup = $pdo->prepare('SELECT id FROM tb_usuarios WHERE (email = :email OR telefone = :telefone OR cpf = :cpf) AND id <> :id LIMIT 1');
    $stmtDup->execute(['email' => $email, 'telefone' => $telefoneDigitos, 'cpf' => $cpfDigitos, 'id' => $id]);
    if ($stmtDup->fetch()) {
        usr_erro(409, 'Já existe outra conta com este email, telefone ou CPF.');
    }

    $campos = [
        'nome'            => $nome,
        'email'           => $email,
        'telefone'        => $telefoneDigitos,
        'cpf'             => $cpfDigitos,
        'data_nascimento' => $dataNascimentoSql,
        'genero'          => $genero,
        'genero_outro'    => $genero === 'outro' ? $generoOutro : null,
        'unidade_id'      => $unidadeId,
        'equipe_slug'     => $equipe,
        'cargo'           => $cargo,
        'id'              => $id,
    ];

    $sqlSenha = '';
    if ($senha !== '') {
        $campos['senha_hash'] = password_hash($senha, PASSWORD_DEFAULT);
        $sqlSenha = ', senha_hash = :senha_hash';
    }

    $stmt = $pdo->prepare(
        "UPDATE tb_usuarios SET
            nome = :nome, email = :email, telefone = :telefone, cpf = :cpf,
            data_nascimento = :data_nascimento, genero = :genero, genero_outro = :genero_outro,
            unidade_id = :unidade_id, equipe_slug = :equipe_slug, cargo = :cargo $sqlSenha
         WHERE id = :id"
    );
    $stmt->execute($campos);

    // Se o admin editar a própria conta, atualiza o nome mostrado no cabeçalho.
    if ($id === (int)($_SESSION['usuario_id'] ?? 0)) {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        $_SESSION['usuario_nome'] = $nome;
        $_SESSION['usuario_email'] = $email;
    }

    usr_resposta(200, ['sucesso' => true]);
} catch (PDOException $e) {
    usr_erro(500, 'Erro ao gravar no banco de dados.');
}

/** Mesma validação de CPF usada em api/cadastro.php. */
function usr_cpf_valido(string $cpf): bool
{
    if (strlen($cpf) !== 11 || preg_match('/^(\d)\1{10}$/', $cpf)) {
        return false;
    }
    for ($t = 9; $t < 11; $t++) {
        $soma = 0;
        for ($i = 0; $i < $t; $i++) {
            $soma += (int)$cpf[$i] * (($t + 1) - $i);
        }
        $digito = ((10 * $soma) % 11) % 10;
        if ((int)$cpf[$t] !== $digito) {
            return false;
        }
    }
    return true;
}
