<?php
/**
 * GET  api/configuracoes/perfil.php  → dados do perfil + preferências
 * POST api/configuracoes/perfil.php  → {nome, telefone, idioma, fuso}
 *
 * E-mail e cargo são somente leitura (quem altera é o Administrador na
 * área "Usuários"). O id vem sempre da sessão.
 */
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$usuarioId = cfg_iniciar(['GET', 'POST']);

try {
    $pdo = conectar();

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $corpo    = cfg_corpo();
        $nome     = trim((string)($corpo['nome'] ?? ''));
        $telefone = preg_replace('/\D+/', '', (string)($corpo['telefone'] ?? '')) ?? '';
        $idioma   = (string)($corpo['idioma'] ?? '');
        $fuso     = (string)($corpo['fuso'] ?? '');
        $erros    = [];

        if (mb_strlen($nome) < 3 || mb_strlen($nome) > 150) {
            $erros['nome'] = 'Informe seu nome completo (3 a 150 caracteres).';
        }
        if (!preg_match('/^\d{10,11}$/', $telefone)) {
            $erros['telefone'] = 'Informe um telefone válido.';
        }
        if (!isset(CFG_IDIOMAS[$idioma])) {
            $erros['idioma'] = 'Idioma inválido.';
        }
        if (!isset(CFG_FUSOS[$fuso])) {
            $erros['fuso'] = 'Fuso horário inválido.';
        }

        if (!$erros) {
            $dup = $pdo->prepare('SELECT id FROM tb_usuarios WHERE telefone = :t AND id <> :id LIMIT 1');
            $dup->execute(['t' => $telefone, 'id' => $usuarioId]);
            if ($dup->fetch()) {
                $erros['telefone'] = 'Este telefone já está em uso por outra conta.';
            }
        }

        if ($erros) {
            cfg_erro(422, 'Corrija os campos destacados.', ['campos' => $erros]);
        }

        $up = $pdo->prepare(
            'UPDATE tb_usuarios SET nome = :nome, telefone = :tel, idioma = :idioma, fuso_horario = :fuso WHERE id = :id'
        );
        $up->execute(['nome' => $nome, 'tel' => $telefone, 'idioma' => $idioma, 'fuso' => $fuso, 'id' => $usuarioId]);

        // O cabeçalho usa o nome guardado na sessão.
        $_SESSION['usuario_nome'] = $nome;
    }

    $stmt = $pdo->prepare(
        'SELECT nome, email, telefone, cargo, equipe_slug, foto_arquivo, idioma, fuso_horario, criado_em
           FROM tb_usuarios WHERE id = :id LIMIT 1'
    );
    $stmt->execute(['id' => $usuarioId]);
    $u = $stmt->fetch();
    if (!$u) {
        cfg_erro(404, 'Usuário não encontrado.');
    }

    cfg_resposta(200, [
        'sucesso' => true,
        'perfil'  => [
            'nome'     => $u['nome'],
            'email'    => $u['email'],
            'telefone' => cfg_formatar_telefone((string)$u['telefone']),
            'cargo'    => CFG_CARGOS[$u['cargo']] ?? (string)$u['cargo'],
            'idioma'   => $u['idioma'],
            'fuso'     => $u['fuso_horario'],
            'tem_foto' => !empty($u['foto_arquivo']),
        ],
        'preferencias' => cfg_carregar_prefs($pdo, $usuarioId),
    ]);
} catch (PDOException $e) {
    error_log('[configuracoes/perfil] ' . $e->getMessage());
    cfg_erro(500, 'Erro ao consultar o banco de dados.');
}
