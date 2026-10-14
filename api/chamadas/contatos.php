<?php
/**
 * GET api/chamadas/contatos.php[?equipe=slug]
 *
 * Devolve o usuário logado (cargo + permissão de chamar a equipe),
 * o seletor de equipes e os CONTATOS DE CHAMADA: somente membros
 * da MESMA equipe do usuário (regra de negócio nº 1). Pedir outra
 * equipe responde 403 — pessoas de outras equipes nunca aparecem.
 */

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$uid = ch_iniciar(['GET']);

try {
    $pdo = ch_pdo();
    $eu  = ch_usuario($pdo, $uid);
    ch_batida($pdo, $uid, 'online');

    $admin = ch_e_super_admin($uid);
    $propria = (string)($eu['equipe_slug'] ?? '');
    $pedida = isset($_GET['equipe']) ? trim((string)$_GET['equipe']) : $propria;
    if ($admin && $pedida === '') {
        $pedida = 'geral';
    }
    // Usuário comum: só a própria equipe. Administrador (id 1): qualquer equipe.
    if ($pedida !== $propria && !($admin && isset(CH_EQUIPES[$pedida]))) {
        ch_erro(403, CH_MSG_REGRA_MESMA_EQUIPE);
    }
    $minha = $pedida; // equipe que está sendo exibida

    $equipes = [];
    foreach (CH_EQUIPES as $slug => $nome) {
        // Usuário comum só enxerga a própria equipe no seletor; o admin (id 1) vê todas.
        if (!$admin && $slug !== $propria) {
            continue;
        }
        $equipes[] = [
            'slug'     => $slug,
            'nome'     => $nome,
            'minha'    => $slug === $minha,
            'liberada' => $admin || $slug === $propria,
        ];
    }

    $contatos = [];
    $total = 0;
    $online = 0;
    if ($minha !== '') {
        $membros = ch_membros_da_equipe($pdo, $minha);
        // Administrador Intelbras (id 1) não aparece para ninguém na lista de contatos.
        $membros = array_values(array_filter($membros, static fn(array $m): bool => (int)$m['id'] !== 1));
        $status  = ch_status_de($pdo, array_column($membros, 'id'));
        foreach ($membros as $m) {
            $id = (int)$m['id'];
            $s  = $status[$id] ?? 'offline';
            $total++;
            if ($s !== 'offline') {
                $online++;
            }
            if ($id === $uid) {
                continue; // não lista a si mesmo
            }
            $contatos[] = [
                'id'           => $id,
                'nome'         => (string)$m['nome'],
                'inicial'      => ch_inicial((string)$m['nome']),
                'setor'        => ch_equipe_nome($minha),
                'cargo_nome'   => CH_CARGOS[$m['cargo']] ?? '',
                'status'       => $s,
                'status_rotulo' => CH_STATUS_ROTULOS[$s],
            ];
        }
    }

    $st = $pdo->prepare('SELECT nao_perturbe FROM tb_chamadas_presenca WHERE usuario_id = ?');
    $st->execute([$uid]);

    ch_resposta(200, [
        'sucesso' => true,
        'eu' => [
            'id'                 => $uid,
            'nome'               => (string)$eu['nome'],
            'inicial'            => ch_inicial((string)$eu['nome']),
            'cargo'              => (string)$eu['cargo'],
            'cargo_nome'         => CH_CARGOS[$eu['cargo']] ?? '',
            'equipe_slug'        => $propria,
            'equipe_nome'        => ch_equipe_nome($propria),
            'super_admin'        => $admin,
            'pode_chamar_equipe' => ch_pode_chamar_equipe($eu),
            'nao_perturbe'       => (int)$st->fetchColumn() === 1,
        ],
        'regra_equipe' => CH_MSG_REGRA_EQUIPE,
        'equipes'      => $equipes,
        'equipe'       => ['slug' => $minha, 'nome' => ch_equipe_nome($minha), 'total' => $total, 'online' => $online],
        'contatos'     => $contatos,
    ]);
} catch (PDOException $e) {
    ch_erro(500, 'Erro ao consultar o banco de dados.');
}
