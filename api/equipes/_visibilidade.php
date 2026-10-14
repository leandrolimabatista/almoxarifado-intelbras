<?php
/**
 * Visibilidade das equipes: quais equipes o usuário logado PODE VER no menu
 * lateral, nas notificações, na tela inicial, na busca e no "Nova conversa".
 *
 * Regra (a mesma de api/equipes/_servico.php -> eq_e_membro()):
 *   - Administrador Intelbras (id 1): vê TODAS as equipes.
 *   - Demais usuários: só a própria equipe (tb_usuarios.equipe_slug) e
 *     equipes com pedido de acesso aceito (tb_equipes_membros.origem =
 *     'solicitacao'). Quem é de TI só vê TI; quem é do RH só vê RH; etc.
 *
 * Arquivo só de funções (sem headers, sem JSON): pode ser incluído tanto
 * pelas APIs quanto pelas páginas PHP (index.php e conteudo/cadastrado/*).
 */

declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../conexao.php';

const EQV_SUPER_ADMIN_ID = 1;

/**
 * Slugs das equipes visíveis para o usuário.
 * Retorna null para o Administrador (null = "todas", sem filtro).
 *
 * @return string[]|null
 */
function eqv_slugs_visiveis(PDO $pdo, int $usuarioId): ?array
{
    if ($usuarioId === EQV_SUPER_ADMIN_ID) {
        return null;
    }
    if ($usuarioId <= 0) {
        return [];
    }

    $slugs = [];
    try {
        $st = $pdo->prepare('SELECT equipe_slug FROM tb_usuarios WHERE id = :id AND status = "ativo" LIMIT 1');
        $st->execute(['id' => $usuarioId]);
        $propria = (string)($st->fetchColumn() ?: '');
        if ($propria !== '') {
            $slugs[] = $propria;
        }

        $st = $pdo->prepare(
            'SELECT equipe_slug FROM tb_equipes_membros WHERE usuario_id = :id AND origem = "solicitacao"'
        );
        $st->execute(['id' => $usuarioId]);
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $s) {
            $slugs[] = (string)$s;
        }
    } catch (Throwable $e) {
        error_log('[equipes/visibilidade] ' . $e->getMessage());
    }

    return array_values(array_unique($slugs));
}

/** true se a equipe pode aparecer para esse usuário. */
function eqv_pode_ver(?array $slugsVisiveis, string $slug): bool
{
    return $slugsVisiveis === null || in_array($slug, $slugsVisiveis, true);
}

/** Filtra uma lista de equipes (cada item com a chave $chave = slug). */
function eqv_filtrar(?array $slugsVisiveis, array $equipes, string $chave = 'slug'): array
{
    if ($slugsVisiveis === null) {
        return $equipes;
    }
    return array_values(array_filter(
        $equipes,
        static fn(array $e): bool => in_array((string)($e[$chave] ?? ''), $slugsVisiveis, true)
    ));
}

/**
 * Atalho para as páginas PHP (menu lateral): a equipe $slug aparece para o
 * usuário da sessão? Calcula uma vez por requisição.
 */
function eqv_visivel(string $slug): bool
{
    static $cache = false;
    if ($cache === false) {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        $uid = (int)($_SESSION['usuario_id'] ?? 0);
        try {
            $cache = eqv_slugs_visiveis(conectar(), $uid);
        } catch (Throwable $e) {
            error_log('[equipes/visibilidade] ' . $e->getMessage());
            $cache = [];
        }
    }
    return eqv_pode_ver($cache, $slug);
}
