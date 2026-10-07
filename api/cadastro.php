<?php
/**
 * Endpoint de cadastro de usuário — recebe os dados do formulário
 * #cadastroStepForm (cabecalho.html) via POST e grava na tabela
 * `usuarios`. Responde sempre em JSON, pensado para ser chamado
 * via fetch() no cabecalho.js.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/conexao.php';

// ------------------------------------------------------------
// Só aceita POST
// ------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['sucesso' => false, 'erro' => 'Método não permitido.']);
    exit;
}

// ------------------------------------------------------------
// Lê o corpo da requisição. Aceita tanto JSON (fetch com
// JSON.stringify) quanto form-data tradicional ($_POST).
// ------------------------------------------------------------
$dadosJson = json_decode(file_get_contents('php://input'), true);
$dados = is_array($dadosJson) ? $dadosJson : $_POST;

function campo(array $dados, string $chave): string
{
    return trim((string)($dados[$chave] ?? ''));
}

$nome            = campo($dados, 'nome');
$email           = campo($dados, 'email');
$senha           = campo($dados, 'senha');
$repetirSenha    = campo($dados, 'repetir_senha');
$telefone        = campo($dados, 'telefone');
$cpf             = campo($dados, 'cpf');
$dataNascimento  = campo($dados, 'data_nascimento'); // formato esperado: dd/mm/aaaa
$genero          = campo($dados, 'genero');
$generoOutro     = campo($dados, 'genero_outro');
$equipe          = campo($dados, 'equipe');

$erros = [];

// Equipe desejada (mesmos slugs do menu lateral / módulo de IA).
// Campo opcional no front-end: qualquer valor fora da lista vira "geral".
$equipesValidas = ['geral', 'projetos', 'marketing', 'rh', 'financeiro', 'ti', 'sac'];
if (!in_array($equipe, $equipesValidas, true)) {
    $equipe = 'geral';
}

// ------------------------------------------------------------
// Validações (espelham as regras já feitas no front-end em
// cabecalho.js, mas repetidas aqui porque o back-end NUNCA
// deve confiar só na validação do cliente)
// ------------------------------------------------------------

// Nome
if (mb_strlen($nome) < 3) {
    $erros['nome'] = 'Informe o nome completo.';
}

// Email
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $erros['email'] = 'Email inválido.';
}

// Senha
if (mb_strlen($senha) < 6) {
    $erros['senha'] = 'A senha deve ter pelo menos 6 caracteres.';
} elseif ($senha !== $repetirSenha) {
    $erros['repetir_senha'] = 'As senhas não coincidem.';
}

// Telefone: mantém só dígitos, aceita (DDD)+8 ou 9 dígitos
$telefoneDigitos = preg_replace('/\D/', '', $telefone);
if (!preg_match('/^\d{10,11}$/', $telefoneDigitos)) {
    $erros['telefone'] = 'Telefone inválido.';
}

// CPF: mantém só dígitos e valida os dígitos verificadores
$cpfDigitos = preg_replace('/\D/', '', $cpf);
if (!cpfValido($cpfDigitos)) {
    $erros['cpf'] = 'CPF inválido.';
}

// Data de nascimento: dd/mm/aaaa -> Y-m-d, e checa se é uma data real
$dataNascimentoSql = null;
if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $dataNascimento, $m)) {
    [, $dia, $mes, $ano] = $m;
    if (checkdate((int)$mes, (int)$dia, (int)$ano)) {
        $dataNascimentoSql = "$ano-$mes-$dia";
    }
}
if ($dataNascimentoSql === null) {
    $erros['data_nascimento'] = 'Data de nascimento inválida.';
}

// Gênero
$generosValidos = ['masculino', 'feminino', 'outro', 'prefiro_nao_informar'];
if (!in_array($genero, $generosValidos, true)) {
    $erros['genero'] = 'Selecione um gênero válido.';
}
if ($genero === 'outro' && $generoOutro === '') {
    $erros['genero_outro'] = 'Informe seu gênero.';
}

if (!empty($erros)) {
    http_response_code(422);
    echo json_encode(['sucesso' => false, 'erros' => $erros]);
    exit;
}

// ------------------------------------------------------------
// Grava no banco
// ------------------------------------------------------------
try {
    $pdo = conectar();

    // Verifica duplicidade de email, telefone e CPF, pra poder avisar
    // exatamente quais campos já estão em uso (em vez de uma mensagem
    // genérica "email ou CPF já cadastrado"). Confere tanto contas já
    // ativas (tb_usuarios) quanto solicitações ainda pendentes
    // (tb_solicitacoes_acesso), pra não deixar a mesma pessoa mandar
    // duas solicitações com o mesmo email/CPF.
    //
    // Importante: busca TODAS as linhas que batem com qualquer um dos
    // três campos (não só a primeira), porque o e-mail pode já existir
    // numa conta e o CPF pode já existir em OUTRA conta diferente — se
    // parasse no primeiro match (LIMIT 1 + elseif), esses casos de
    // "combo" (mais de um campo duplicado ao mesmo tempo, mas vindo de
    // linhas diferentes) passariam despercebidos.
    $stmt = $pdo->prepare('
        SELECT email, telefone, cpf FROM tb_usuarios WHERE email = :email OR telefone = :telefone OR cpf = :cpf
        UNION ALL
        SELECT email, telefone, cpf FROM tb_solicitacoes_acesso WHERE status = "pendente" AND (email = :email2 OR telefone = :telefone2 OR cpf = :cpf2)
    ');
    $stmt->execute([
        'email' => $email, 'telefone' => $telefoneDigitos, 'cpf' => $cpfDigitos,
        'email2' => $email, 'telefone2' => $telefoneDigitos, 'cpf2' => $cpfDigitos,
    ]);
    $linhasExistentes = $stmt->fetchAll();

    if (!empty($linhasExistentes)) {
        $camposDuplicados = [];
        foreach ($linhasExistentes as $linha) {
            if ($linha['email'] === $email && !in_array('email', $camposDuplicados, true)) {
                $camposDuplicados[] = 'email';
            }
            if ($linha['telefone'] === $telefoneDigitos && !in_array('telefone', $camposDuplicados, true)) {
                $camposDuplicados[] = 'telefone';
            }
            if ($linha['cpf'] === $cpfDigitos && !in_array('cpf', $camposDuplicados, true)) {
                $camposDuplicados[] = 'cpf';
            }
        }

        http_response_code(409);
        echo json_encode(['sucesso' => false, 'campos' => $camposDuplicados]);
        exit;
    }

    // O cadastro não cria a conta direto: fica pendente em
    // tb_solicitacoes_acesso até um administrador aceitar (aba
    // "Usuários" -> "Solicitação de Usuários"). Só nesse momento a
    // conta é criada em tb_usuarios.
    $senhaHash = password_hash($senha, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare('
        INSERT INTO tb_solicitacoes_acesso
            (nome, email, senha_hash, telefone, cpf, data_nascimento, genero, genero_outro, equipe_solicitada, status, solicitado_em)
        VALUES
            (:nome, :email, :senha_hash, :telefone, :cpf, :data_nascimento, :genero, :genero_outro, :equipe_solicitada, "pendente", NOW())
    ');

    $stmt->execute([
        'nome'              => $nome,
        'email'             => $email,
        'senha_hash'        => $senhaHash,
        'telefone'          => $telefoneDigitos,
        'cpf'               => $cpfDigitos,
        'data_nascimento'   => $dataNascimentoSql,
        'genero'            => $genero,
        'genero_outro'      => $genero === 'outro' ? $generoOutro : null,
        'equipe_solicitada' => $equipe,
    ]);

    echo json_encode([
        'sucesso' => true,
        'mensagem' => 'Solicitação enviada! Aguarde a aprovação de um administrador.',
        'id' => (int)$pdo->lastInsertId(),
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    // Em produção, não exponha $e->getMessage() ao cliente — logue em arquivo.
    echo json_encode(['sucesso' => false, 'erro' => 'Erro ao gravar no banco de dados.']);
}

// ------------------------------------------------------------
// Validação de CPF (algoritmo dos dígitos verificadores)
// ------------------------------------------------------------
function cpfValido(string $cpf): bool
{
    if (strlen($cpf) !== 11 || preg_match('/^(\d)\1{10}$/', $cpf)) {
        return false; // tamanho errado ou todos os dígitos iguais (ex.: 111.111.111-11)
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
