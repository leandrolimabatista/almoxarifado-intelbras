<?php
/**
 * GET api/equipes/contagens.php
 *
 * Contagem de mensagens não lidas por equipe, para o badge verde que
 * aparece ao lado do nome da equipe na sidebar — usado em TODAS as
 * páginas da área logada (assets/js/equipes-badges.js), não só na tela
 * do chat. Só conta equipes das quais o usuário é membro.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = eq_iniciar(['GET']);

try {
    $pdo = eq_pdo();
    $contagens = [];
    foreach (eq_listar_equipes($pdo) as $e) {
        if (eq_e_membro($pdo, $usuarioId, $e['slug'])) {
            $contagens[$e['slug']] = eq_nao_lidas($pdo, $e['slug'], $usuarioId);
        }
    }
    eq_resposta(200, ['sucesso' => true, 'contagens' => $contagens]);
} catch (PDOException $e) {
    eq_erro_banco($e, 'contagens');
}
