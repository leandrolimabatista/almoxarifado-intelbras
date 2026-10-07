<?php
/**
 * POST api/equipes/mensagem.php
 * JSON: { id, acao, slug, conteudo?, emoji? }
 * acao: "editar" | "apagar" | "reagir" | "fixar" | "desfixar"
 *
 * Exige header X-CSRF-Token. "fixar"/"desfixar" e apagar mensagem de outra
 * pessoa exigem cargo de administração (EQ_CARGOS_ADMIN).
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = eq_iniciar(['POST']);
eq_exigir_csrf();

$dados = eq_ler_json();
$id    = (int)($dados['id'] ?? 0);
$acao  = (string)($dados['acao'] ?? '');
$slug  = strtolower(trim((string)($dados['slug'] ?? '')));

if ($id <= 0 || $slug === '') {
    eq_erro(422, 'Requisição inválida.');
}

try {
    $pdo = eq_pdo();
    $equipe = eq_buscar_equipe($pdo, $slug);
    if ($equipe === null || !eq_e_membro($pdo, $usuarioId, $slug)) {
        eq_erro(403, 'Você não faz parte desta equipe.');
    }
    $ehAdmin = eq_e_admin($pdo, $usuarioId);

    switch ($acao) {
        case 'editar':
            eq_editar_mensagem($pdo, $usuarioId, $id, (string)($dados['conteudo'] ?? ''));
            break;

        case 'apagar':
            eq_apagar_mensagem($pdo, $usuarioId, $id, $ehAdmin);
            break;

        case 'reagir':
            $emoji = (string)($dados['emoji'] ?? '');
            if ($emoji === '') {
                eq_erro(422, 'Informe o emoji da reação.');
            }
            eq_alternar_reacao($pdo, $usuarioId, $id, $emoji);
            break;

        case 'fixar':
        case 'desfixar':
            if (!$ehAdmin) {
                eq_erro(403, 'Só administradores podem fixar arquivos.');
            }
            eq_alternar_fixado($pdo, $slug, $usuarioId, $id, $acao === 'fixar');
            break;

        default:
            eq_erro(422, 'Ação inválida.');
    }

    $resultado = eq_listar_mensagens($pdo, $slug, $usuarioId, max(0, $id - 1), 1);
    $atual = null;
    foreach ($resultado['mensagens'] as $m) {
        if ($m['id'] === $id) {
            $atual = $m;
        }
    }

    eq_resposta(200, [
        'sucesso'  => true,
        'mensagem' => $atual,
        'fixados'  => in_array($acao, ['fixar', 'desfixar'], true) ? eq_listar_fixados($pdo, $slug) : null,
    ]);
} catch (EquipesErro $e) {
    eq_erro((int)$e->getCode() ?: 422, $e->getMessage());
} catch (PDOException $e) {
    eq_erro_banco($e, 'mensagem');
}
