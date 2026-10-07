<?php
/**
 * GET api/ia/conversas.php?limite=5&offset=0&busca=
 * Lista as conversas do usuário logado (não arquivadas, não excluídas).
 * Fixadas primeiro; depois da mais recente para a mais antiga.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = ia_iniciar(['GET']);

$limite = (int)($_GET['limite'] ?? 5);
$limite = max(1, min(50, $limite));
$offset = max(0, (int)($_GET['offset'] ?? 0));

$busca = trim((string)($_GET['busca'] ?? ''));
// Escapa curingas do LIKE para a busca ser sempre literal
$padrao = '%' . addcslashes($busca, '\\%_') . '%';

try {
    $pdo = ia_pdo();

    $stmt = $pdo->prepare(
        'SELECT id, titulo, fixada, ultima_mensagem_em AS atualizada_em
         FROM tb_ia_conversas
         WHERE usuario_id = :usuario_id
           AND arquivada = 0
           AND excluida_em IS NULL
           AND titulo LIKE :busca
         ORDER BY fixada DESC, ultima_mensagem_em DESC, id DESC
         LIMIT :limite OFFSET :offset'
    );
    $stmt->bindValue(':usuario_id', $usuarioId, PDO::PARAM_INT);
    $stmt->bindValue(':busca', $padrao, PDO::PARAM_STR);
    $stmt->bindValue(':limite', $limite, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    $conversas = array_map('ia_formatar_conversa', $stmt->fetchAll());

    $stmt = $pdo->prepare(
        'SELECT COUNT(*) AS total
         FROM tb_ia_conversas
         WHERE usuario_id = :usuario_id
           AND arquivada = 0
           AND excluida_em IS NULL
           AND titulo LIKE :busca'
    );
    $stmt->bindValue(':usuario_id', $usuarioId, PDO::PARAM_INT);
    $stmt->bindValue(':busca', $padrao, PDO::PARAM_STR);
    $stmt->execute();
    $total = (int)$stmt->fetchColumn();

    ia_resposta(200, ['sucesso' => true, 'conversas' => $conversas, 'total' => $total]);
} catch (PDOException $e) {
    error_log('[ia/conversas] ' . $e->getMessage());
    ia_erro(500, 'Erro ao consultar o banco de dados.');
}
