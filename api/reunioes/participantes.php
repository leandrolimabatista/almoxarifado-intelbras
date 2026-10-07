<?php
/**
 * GET api/reunioes/participantes.php?q=&equipe=&limite=30
 * Lista os usuários ATIVOS que podem ser convidados para uma reunião
 * (o próprio organizador fica de fora — ele já é o dono da reunião).
 *
 *   q       busca por nome ou e-mail (opcional)
 *   equipe  slug da equipe, para "sugerir os membros da equipe" (opcional)
 *   limite  1..100 (padrão 30)
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = reu_iniciar(['GET']);

$limite = max(1, min(100, (int)($_GET['limite'] ?? 30)));
$busca  = trim((string)($_GET['q'] ?? ''));
$equipe = trim((string)($_GET['equipe'] ?? ''));

if ($equipe !== '' && !isset(REU_EQUIPES[$equipe])) {
    reu_erro(422, 'Equipe inválida.');
}

$where  = ['u.status = \'ativo\'', 'u.id <> :eu'];
$params = ['eu' => $usuarioId];

if ($busca !== '') {
    // Escapa curingas do LIKE para a busca ser sempre literal.
    // (PDO sem emulação não aceita o mesmo :nome duas vezes -> :busca_nome / :busca_email)
    $padrao = '%' . addcslashes(mb_substr($busca, 0, 100), '\\%_') . '%';
    $where[] = '(u.nome LIKE :busca_nome OR u.email LIKE :busca_email)';
    $params['busca_nome']  = $padrao;
    $params['busca_email'] = $padrao;
}
if ($equipe !== '') {
    $where[] = 'u.equipe_slug = :equipe';
    $params['equipe'] = $equipe;
}

try {
    $pdo = reu_pdo();

    $stmt = $pdo->prepare(
        'SELECT u.id, u.nome, u.cargo, u.equipe_slug
         FROM tb_usuarios u
         WHERE ' . implode(' AND ', $where) . '
         ORDER BY u.nome ASC, u.id ASC
         LIMIT :limite'
    );
    foreach ($params as $nome => $valor) {
        $stmt->bindValue(':' . $nome, $valor, is_int($valor) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }
    $stmt->bindValue(':limite', $limite, PDO::PARAM_INT);
    $stmt->execute();

    $pessoas = array_map(static function (array $u): array {
        $slug  = (string)($u['equipe_slug'] ?? '');
        $cargo = (string)($u['cargo'] ?? '');
        return [
            'id'          => (int)$u['id'],
            'nome'        => (string)$u['nome'],
            'iniciais'    => reu_iniciais((string)$u['nome']),
            'cargo'       => REU_CARGOS[$cargo] ?? '',
            'equipe_slug' => $slug,
            'equipe'      => REU_EQUIPES[$slug] ?? '',
            'foto'        => null, // tb_usuarios ainda não tem foto; o front usa as iniciais
        ];
    }, $stmt->fetchAll());

    reu_resposta(200, ['sucesso' => true, 'pessoas' => $pessoas]);
} catch (PDOException $e) {
    reu_erro_banco($e, 'participantes');
}
