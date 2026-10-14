<?php
/**
 * GET api/equipes/canal.php?slug=geral
 *
 * Informações do canal para montar a tela inteira: cabeçalho, "Sobre este
 * canal", membros + presença, arquivos fixados, links úteis, a lista de
 * equipes da sidebar (com contagem de não lidas) e se o usuário logado é
 * membro (senão, devolve o estado de "acesso restrito").
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_visibilidade.php';

$usuarioId = eq_iniciar(['GET']);

try {
    $pdo = eq_pdo();
    $equipe = eq_slug_da_query($pdo);
    $slug = $equipe['slug'];

    eq_marcar_visto($pdo, $usuarioId);

    // Sidebar: só as equipes que o usuário pode ver (admin id 1 vê todas).
    $todasEquipes = eqv_filtrar(eqv_slugs_visiveis($pdo, $usuarioId), eq_listar_equipes($pdo));
    $sidebar = array_map(static function (array $e) use ($pdo, $usuarioId) {
        return [
            'slug'       => $e['slug'],
            'nome'       => $e['nome'],
            'cor'        => $e['cor'],
            'nao_lidas'  => eq_e_membro($pdo, $usuarioId, $e['slug']) ? eq_nao_lidas($pdo, $e['slug'], $usuarioId) : 0,
        ];
    }, $todasEquipes);

    $membro = eq_e_membro($pdo, $usuarioId, $slug);

    if (!$membro) {
        eq_resposta(200, [
            'sucesso' => true,
            'membro'  => false,
            'equipe'  => ['slug' => $equipe['slug'], 'nome' => $equipe['nome'], 'cor' => $equipe['cor']],
            'solicitacao' => eq_status_solicitacao($pdo, $slug, $usuarioId),
            'sidebar' => $sidebar,
        ]);
    }

    eq_garantir_membro($pdo, $usuarioId, $slug);

    $stmt = $pdo->prepare('SELECT favorita, silenciada FROM tb_equipes_membros WHERE equipe_slug = :slug AND usuario_id = :uid');
    $stmt->execute(['slug' => $slug, 'uid' => $usuarioId]);
    $prefs = $stmt->fetch() ?: ['favorita' => 0, 'silenciada' => 0];

    $membros = eq_listar_membros($pdo, $slug);
    $ehAdmin = eq_e_admin($pdo, $usuarioId);

    $stmt = $pdo->prepare('SELECT nome, cargo FROM tb_usuarios WHERE id = :id');
    $stmt->execute(['id' => $usuarioId]);
    $euRow = $stmt->fetch() ?: ['nome' => 'Você', 'cargo' => 'funcionario'];

    eq_resposta(200, [
        'sucesso' => true,
        'membro'  => true,
        'eh_admin' => $ehAdmin,
        'equipe'  => [
            'slug'            => $equipe['slug'],
            'nome'            => $equipe['nome'],
            'cor'             => $equipe['cor'],
            'descricao'       => $equipe['descricao'],
            'somente_leitura' => (bool)$equipe['somente_leitura'],
            'favorita'        => (bool)$prefs['favorita'],
            'silenciada'      => (bool)$prefs['silenciada'],
        ],
        'eu' => [
            'id'      => $usuarioId,
            'nome'    => (string)$euRow['nome'],
            'inicial' => mb_strtoupper(mb_substr((string)$euRow['nome'], 0, 1)),
            // Só Gerente, Diretor, CEO (e o Administrador, id 1) chamam a equipe toda.
            'pode_chamar' => $usuarioId === 1 || $ehAdmin
                || in_array((string)$euRow['cargo'], ['gerente', 'diretor', 'ceo'], true),
        ],
        'membros'          => $membros,
        'membros_total'    => count($membros),
        'arquivos_fixados' => eq_listar_fixados($pdo, $slug, $usuarioId),
        'links'            => eq_listar_links($pdo, $slug),
        'sidebar'          => $sidebar,
    ]);
} catch (PDOException $e) {
    eq_erro_banco($e, 'canal');
}
