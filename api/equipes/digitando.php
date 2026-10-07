<?php
/**
 * POST api/equipes/digitando.php
 * JSON: { slug }
 *
 * "Ping" enviado pelo composer a cada poucos segundos enquanto o usuário
 * digita. Sem resposta de conteúdo relevante — o indicador em si é lido
 * por api/equipes/mensagens.php (GET) no campo "digitando".
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = eq_iniciar(['POST']);
eq_exigir_csrf();

$dados = eq_ler_json();
$slug  = strtolower(trim((string)($dados['slug'] ?? '')));

try {
    $pdo = eq_pdo();
    if (eq_buscar_equipe($pdo, $slug) === null || !eq_e_membro($pdo, $usuarioId, $slug)) {
        eq_erro(403, 'Você não faz parte desta equipe.');
    }
    eq_marcar_digitando($pdo, $usuarioId, $slug);
    eq_resposta(200, ['sucesso' => true]);
} catch (PDOException $e) {
    eq_erro_banco($e, 'digitando');
}
