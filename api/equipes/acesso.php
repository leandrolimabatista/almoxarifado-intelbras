<?php
/**
 * POST api/equipes/acesso.php
 * JSON: { slug }
 *
 * Registra um pedido de acesso à equipe (estado "Acesso restrito" da tela).
 * A aprovação é manual, feita por um administrador (fora do escopo deste
 * endpoint) — quando aceita, uma linha em tb_equipes_membros com
 * origem="solicitacao" passa a liberar o canal para o usuário.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = eq_iniciar(['POST']);
eq_exigir_csrf();

$dados = eq_ler_json();
$slug  = strtolower(trim((string)($dados['slug'] ?? '')));

try {
    $pdo = eq_pdo();
    $equipe = eq_buscar_equipe($pdo, $slug);
    if ($equipe === null) {
        eq_erro(404, 'Equipe não encontrada.');
    }
    if (eq_e_membro($pdo, $usuarioId, $slug)) {
        eq_erro(422, 'Você já faz parte desta equipe.');
    }
    eq_solicitar_acesso($pdo, $slug, $usuarioId);
    eq_resposta(201, ['sucesso' => true, 'status' => 'pendente']);
} catch (EquipesErro $e) {
    eq_erro((int)$e->getCode() ?: 422, $e->getMessage());
} catch (PDOException $e) {
    eq_erro_banco($e, 'acesso');
}
