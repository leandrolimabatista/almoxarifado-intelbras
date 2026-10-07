<?php
/**
 * GET api/documentos/listar.php
 *
 * Parâmetros (todos opcionais):
 *   aba     recentes | meus | compartilhados | favoritos | lixeira   (padrão: recentes)
 *   equipe  geral | projetos | marketing | rh | financeiro | ti | sac
 *   busca   texto (procura no título, no nome do arquivo e no nome de quem enviou)
 *   ordem   recentes | antigos | nome | nome_desc | tamanho          (padrão: recentes)
 *   limite  1..100 (padrão 10)      offset  >= 0
 *
 * Resposta: { sucesso, documentos[], total, resumo{}, atividades[] }
 *   total    = quantidade de documentos que batem com os filtros (para "Mostrar mais")
 *   resumo   = números dos 4 cards do topo (não dependem dos filtros)
 *   atividades = últimas 12 ações (enviou / atualizou / favoritou)
 *
 * Significado das abas:
 *   recentes         todos os documentos ativos
 *   meus             enviados por mim
 *   compartilhados   enviados por outras pessoas (visíveis pelas equipes)
 *   favoritos        marcados por MIM com a estrela
 *   lixeira          meus documentos que foram para a lixeira
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = doc_iniciar(['GET']);

// ------------------------------------------------------------
// Parâmetros
// ------------------------------------------------------------
$aba = (string)($_GET['aba'] ?? 'recentes');
if (!in_array($aba, ['recentes', 'meus', 'compartilhados', 'favoritos', 'lixeira'], true)) {
    $aba = 'recentes';
}

$equipe = (string)($_GET['equipe'] ?? '');
if ($equipe !== '' && !array_key_exists($equipe, DOC_EQUIPES)) {
    doc_erro(422, 'Equipe inválida.');
}

$busca  = mb_substr(trim((string)($_GET['busca'] ?? '')), 0, 100);
$limite = max(1, min(100, (int)($_GET['limite'] ?? 10)));
$offset = max(0, (int)($_GET['offset'] ?? 0));

$ordem = (string)($_GET['ordem'] ?? 'recentes');
$ordensSql = [
    'recentes'  => 'd.atualizado_em DESC, d.id DESC',
    'antigos'   => 'd.atualizado_em ASC, d.id ASC',
    'nome'      => 'd.nome ASC, d.id ASC',
    'nome_desc' => 'd.nome DESC, d.id DESC',
    'tamanho'   => 'd.tamanho DESC, d.id DESC',
];
if (!isset($ordensSql[$ordem])) {
    $ordem = 'recentes';
}
$orderBy = $ordensSql[$ordem];
if ($aba === 'lixeira') {
    // Na lixeira, "mais recentes" = excluídos há menos tempo
    if ($ordem === 'recentes') {
        $orderBy = 'd.excluido_em DESC, d.id DESC';
    } elseif ($ordem === 'antigos') {
        $orderBy = 'd.excluido_em ASC, d.id ASC';
    }
}

// ------------------------------------------------------------
// WHERE (a lista e o COUNT usam exatamente as mesmas condições).
// Cada parâmetro nomeado aparece UMA vez no SQL: com prepares nativos
// (ATTR_EMULATE_PREPARES = false) o PDO não aceita o mesmo nome repetido.
// ------------------------------------------------------------
$onde = [];
$par  = [];

switch ($aba) {
    case 'meus':
        $onde[] = 'd.excluido_em IS NULL';
        $onde[] = 'd.usuario_id = :aba_uid';
        $par['aba_uid'] = $usuarioId;
        break;
    case 'compartilhados':
        $onde[] = 'd.excluido_em IS NULL';
        $onde[] = 'd.usuario_id <> :aba_uid';
        $par['aba_uid'] = $usuarioId;
        break;
    case 'favoritos':
        $onde[] = 'd.excluido_em IS NULL';
        $onde[] = 'EXISTS (SELECT 1 FROM tb_documentos_favoritos ff
                           WHERE ff.documento_id = d.id AND ff.usuario_id = :aba_uid)';
        $par['aba_uid'] = $usuarioId;
        break;
    case 'lixeira':
        $onde[] = 'd.excluido_em IS NOT NULL';
        $onde[] = 'd.usuario_id = :aba_uid';
        $par['aba_uid'] = $usuarioId;
        break;
    default: // recentes
        $onde[] = 'd.excluido_em IS NULL';
}

if ($equipe !== '') {
    $onde[] = 'd.equipe_slug = :equipe';
    $par['equipe'] = $equipe;
}

if ($busca !== '') {
    $like = '%' . addcslashes($busca, '\\%_') . '%';
    $onde[] = '(d.nome LIKE :busca1 OR d.nome_arquivo LIKE :busca2 OR u.nome LIKE :busca3)';
    $par['busca1'] = $like;
    $par['busca2'] = $like;
    $par['busca3'] = $like;
}

$whereSql = implode(' AND ', $onde);

try {
    $pdo = doc_pdo();

    // --------------------------------------------------------
    // Total com os filtros atuais
    // --------------------------------------------------------
    $stmt = $pdo->prepare(
        'SELECT COUNT(*)
         FROM tb_documentos d
         JOIN tb_usuarios u ON u.id = d.usuario_id
         WHERE ' . $whereSql
    );
    doc_vincular($stmt, $par);
    $stmt->execute();
    $total = (int)$stmt->fetchColumn();

    // --------------------------------------------------------
    // Página de documentos
    // --------------------------------------------------------
    $stmt = $pdo->prepare(
        'SELECT d.id, d.usuario_id, d.nome, d.extensao, d.tamanho, d.equipe_slug,
                d.atualizado_em, d.excluido_em,
                u.nome  AS autor,
                up.nome AS atualizado_por_nome,
                (fv.documento_id IS NOT NULL) AS favorito
         FROM tb_documentos d
         JOIN tb_usuarios u ON u.id = d.usuario_id
         LEFT JOIN tb_usuarios up ON up.id = d.atualizado_por
         LEFT JOIN tb_documentos_favoritos fv
                ON fv.documento_id = d.id AND fv.usuario_id = :fav_uid
         WHERE ' . $whereSql . '
         ORDER BY ' . $orderBy . '
         LIMIT :limite OFFSET :offset'
    );
    doc_vincular($stmt, $par + ['fav_uid' => $usuarioId, 'limite' => $limite, 'offset' => $offset]);
    $stmt->execute();
    $documentos = array_map(
        static fn(array $l): array => doc_formatar($l, $usuarioId),
        $stmt->fetchAll()
    );

    // --------------------------------------------------------
    // Cards de resumo (não dependem dos filtros)
    // --------------------------------------------------------
    $stmt = $pdo->prepare(
        'SELECT
           (SELECT COUNT(*) FROM tb_documentos WHERE excluido_em IS NULL) AS total,
           (SELECT COUNT(*)
              FROM tb_documentos_acessos a
              JOIN tb_documentos d ON d.id = a.documento_id
             WHERE a.usuario_id = :u1 AND d.excluido_em IS NULL
               AND a.acessado_em >= (NOW() - INTERVAL 7 DAY)) AS acessados,
           (SELECT COUNT(*)
              FROM tb_documentos_favoritos f
              JOIN tb_documentos d ON d.id = f.documento_id
             WHERE f.usuario_id = :u2 AND d.excluido_em IS NULL) AS favoritos,
           (SELECT COUNT(*) FROM tb_documentos
             WHERE excluido_em IS NULL AND usuario_id <> :u3) AS compartilhados'
    );
    doc_vincular($stmt, ['u1' => $usuarioId, 'u2' => $usuarioId, 'u3' => $usuarioId]);
    $stmt->execute();
    $r = $stmt->fetch();
    $resumo = [
        'total'          => (int)$r['total'],
        'acessados'      => (int)$r['acessados'],
        'favoritos'      => (int)$r['favoritos'],
        'compartilhados' => (int)$r['compartilhados'],
    ];

    // --------------------------------------------------------
    // Atividade recente (montada das tabelas existentes; sem tabela de log).
    // Só documentos ativos: o que está na lixeira some do feed.
    // --------------------------------------------------------
    $stmt = $pdo->query(
        "(SELECT 'criou' AS acao, d.criado_em AS quando, d.usuario_id AS autor_id, u.nome AS autor,
                 d.id AS documento_id, d.nome AS documento, d.extensao AS extensao, d.equipe_slug AS equipe
            FROM tb_documentos d
            JOIN tb_usuarios u ON u.id = d.usuario_id
           WHERE d.excluido_em IS NULL
           ORDER BY d.criado_em DESC LIMIT 12)
         UNION ALL
         (SELECT 'atualizou', d.atualizado_em, d.atualizado_por, u.nome,
                 d.id, d.nome, d.extensao, d.equipe_slug
            FROM tb_documentos d
            JOIN tb_usuarios u ON u.id = d.atualizado_por
           WHERE d.excluido_em IS NULL AND d.atualizado_em > d.criado_em
           ORDER BY d.atualizado_em DESC LIMIT 12)
         UNION ALL
         (SELECT 'favoritou', f.criado_em, f.usuario_id, u.nome,
                 d.id, d.nome, d.extensao, d.equipe_slug
            FROM tb_documentos_favoritos f
            JOIN tb_documentos d ON d.id = f.documento_id
            JOIN tb_usuarios u ON u.id = f.usuario_id
           WHERE d.excluido_em IS NULL
           ORDER BY f.criado_em DESC LIMIT 12)
         ORDER BY quando DESC
         LIMIT 12"
    );
    $atividades = array_map(static fn(array $a): array => [
        'acao'         => (string)$a['acao'],
        'quando'       => doc_iso((string)$a['quando']),
        'autor'        => (string)$a['autor'],
        'eu'           => (int)$a['autor_id'] === $usuarioId,
        'documento_id' => (int)$a['documento_id'],
        'documento'    => (string)$a['documento'],
        'extensao'     => (string)$a['extensao'],
        'equipe'       => (string)$a['equipe'],
    ], $stmt->fetchAll());
} catch (PDOException $e) {
    doc_erro_banco($e, 'listar');
}

doc_resposta(200, [
    'sucesso'    => true,
    'documentos' => $documentos,
    'total'      => $total,
    'resumo'     => $resumo,
    'atividades' => $atividades,
]);
