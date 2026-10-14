<?php
/**
 * POST api/equipes/favorita.php   (JSON + header X-CSRF-Token)
 * Corpo: { "slug": "geral", "favorita": true }
 *
 * Marca/desmarca a estrela da equipe para o usuário logado. É o que alimenta
 * o card "Equipes favoritas" do Início (tb_equipes_membros.favorita).
 * Só quem é membro da equipe pode favoritá-la.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = eq_iniciar(['POST']);
eq_exigir_csrf();
$corpo = eq_ler_json();

try {
    $pdo = eq_pdo();
    $slug = strtolower(trim((string)($corpo['slug'] ?? '')));
    if (eq_buscar_equipe($pdo, $slug) === null) {
        eq_erro(404, 'Equipe não encontrada.');
    }
    if (!eq_e_membro($pdo, $usuarioId, $slug)) {
        eq_erro(403, 'Você não faz parte desta equipe.');
    }
    eq_garantir_membro($pdo, $usuarioId, $slug);

    $favorita = !empty($corpo['favorita']);
    eq_alternar_favorita($pdo, $slug, $usuarioId, $favorita);

    eq_resposta(200, ['sucesso' => true, 'favorita' => $favorita]);
} catch (PDOException $e) {
    eq_erro_banco($e, 'favorita');
}
