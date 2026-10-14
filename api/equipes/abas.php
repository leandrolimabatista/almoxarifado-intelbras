<?php
/**
 * Abas Tarefas, Calendário e Notas do canal da equipe.
 *
 * GET  api/equipes/abas.php?slug=geral&tipo=tarefas|eventos|notas
 * POST api/equipes/abas.php   (JSON + header X-CSRF-Token)
 *      { slug, tipo, acao: "criar"|"editar"|"alternar"|"excluir", id?, ...campos }
 *
 * Qualquer membro cria/edita/conclui. Excluir (e editar nota/evento) é do
 * autor ou de administrador. Tabelas: database/equipes_abas.sql.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$usuarioId = eq_iniciar(['GET', 'POST']);

const ABAS_TABELAS = [
    'tarefas' => 'tb_equipes_tarefas',
    'eventos' => 'tb_equipes_eventos',
    'notas'   => 'tb_equipes_notas',
];

function abas_texto(mixed $v, int $max): string
{
    return mb_substr(trim((string)$v), 0, $max);
}

function abas_data(mixed $v): ?string
{
    $v = trim((string)$v);
    $d = DateTime::createFromFormat('!Y-m-d', $v);
    return ($d && $d->format('Y-m-d') === $v) ? $v : null;
}

function abas_hora(mixed $v): ?string
{
    $v = trim((string)$v);
    return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v) ? $v . ':00' : null;
}

try {
    $pdo = eq_pdo();
    $post = $_SERVER['REQUEST_METHOD'] === 'POST';
    $corpo = [];
    if ($post) {
        eq_exigir_csrf();
        $corpo = eq_ler_json();
        $_POST['slug'] = $corpo['slug'] ?? 'geral';
    }
    $equipe = eq_slug_da_query($pdo);
    $slug = $equipe['slug'];

    if (!eq_e_membro($pdo, $usuarioId, $slug)) {
        eq_erro(403, 'Você não faz parte desta equipe.');
    }

    $tipo = (string)($post ? ($corpo['tipo'] ?? '') : ($_GET['tipo'] ?? ''));
    if (!isset(ABAS_TABELAS[$tipo])) {
        eq_erro(422, 'Seção inválida.');
    }
    $tabela = ABAS_TABELAS[$tipo];
    $ehAdmin = eq_e_admin($pdo, $usuarioId);

    // ------------------------------------------------------------ GET
    if (!$post) {
        // Itens criados pelo Administrador Intelbras (id 1) só aparecem para ele mesmo.
        $semAdmin = static fn(string $a): string => $usuarioId !== 1 ? ' AND ' . $a . '.usuario_id <> 1' : '';
        if ($tipo === 'tarefas') {
            $sql = 'SELECT t.id, t.titulo, t.prazo, t.concluida, t.usuario_id, u.nome AS autor
                    FROM tb_equipes_tarefas t JOIN tb_usuarios u ON u.id = t.usuario_id
                    WHERE t.equipe_slug = :s' . $semAdmin('t') . '
                    ORDER BY t.concluida ASC, (t.prazo IS NULL) ASC, t.prazo ASC, t.id DESC LIMIT 300';
        } elseif ($tipo === 'eventos') {
            $sql = 'SELECT e.id, e.titulo, e.data, TIME_FORMAT(e.hora, "%H:%i") AS hora, e.usuario_id, u.nome AS autor
                    FROM tb_equipes_eventos e JOIN tb_usuarios u ON u.id = e.usuario_id
                    WHERE e.equipe_slug = :s' . $semAdmin('e') . '
                    ORDER BY e.data ASC, (e.hora IS NULL) DESC, e.hora ASC LIMIT 1000';
        } else {
            $sql = 'SELECT n.id, n.titulo, n.conteudo, n.usuario_id, n.atualizada_em, u.nome AS autor
                    FROM tb_equipes_notas n JOIN tb_usuarios u ON u.id = n.usuario_id
                    WHERE n.equipe_slug = :s' . $semAdmin('n') . '
                    ORDER BY n.atualizada_em DESC, n.id DESC LIMIT 300';
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['s' => $slug]);
        $itens = array_map(static function (array $l) use ($usuarioId, $ehAdmin): array {
            $l['id'] = (int)$l['id'];
            if (isset($l['concluida'])) {
                $l['concluida'] = (bool)$l['concluida'];
            }
            $l['pode_editar'] = $ehAdmin || (int)$l['usuario_id'] === $usuarioId;
            unset($l['usuario_id']);
            return $l;
        }, $stmt->fetchAll());
        eq_resposta(200, ['sucesso' => true, 'itens' => $itens]);
    }

    // ------------------------------------------------------------ POST
    $acao = (string)($corpo['acao'] ?? '');
    $id = (int)($corpo['id'] ?? 0);

    if ($acao !== 'criar') {
        $stmt = $pdo->prepare("SELECT usuario_id FROM $tabela WHERE id = :id AND equipe_slug = :s");
        $stmt->execute(['id' => $id, 's' => $slug]);
        $dono = $stmt->fetchColumn();
        if ($dono === false) {
            eq_erro(404, 'Item não encontrado.');
        }
        $podeMexer = $ehAdmin || (int)$dono === $usuarioId;
    }

    if ($acao === 'excluir') {
        if (!$podeMexer) {
            eq_erro(403, 'Só o autor ou um administrador pode excluir.');
        }
        $pdo->prepare("DELETE FROM $tabela WHERE id = :id")->execute(['id' => $id]);
        eq_resposta(200, ['sucesso' => true]);
    }

    if ($tipo === 'tarefas') {
        if ($acao === 'alternar') {
            $feito = !empty($corpo['concluida']) ? 1 : 0;
            $pdo->prepare('UPDATE tb_equipes_tarefas SET concluida = :c, concluida_em = IF(:c2 = 1, NOW(), NULL) WHERE id = :id')
                ->execute(['c' => $feito, 'c2' => $feito, 'id' => $id]);
            eq_resposta(200, ['sucesso' => true]);
        }
        $titulo = abas_texto($corpo['titulo'] ?? '', 200);
        if ($titulo === '') {
            eq_erro(422, 'Informe o título da tarefa.');
        }
        $prazo = abas_data($corpo['prazo'] ?? '');
        if ($acao === 'criar') {
            $pdo->prepare('INSERT INTO tb_equipes_tarefas (equipe_slug, titulo, prazo, usuario_id) VALUES (:s, :t, :p, :u)')
                ->execute(['s' => $slug, 't' => $titulo, 'p' => $prazo, 'u' => $usuarioId]);
        } elseif ($acao === 'editar') {
            if (!$podeMexer) {
                eq_erro(403, 'Só o autor ou um administrador pode editar.');
            }
            $pdo->prepare('UPDATE tb_equipes_tarefas SET titulo = :t, prazo = :p WHERE id = :id')
                ->execute(['t' => $titulo, 'p' => $prazo, 'id' => $id]);
        } else {
            eq_erro(422, 'Ação inválida.');
        }
    } elseif ($tipo === 'eventos') {
        $titulo = abas_texto($corpo['titulo'] ?? '', 200);
        $data = abas_data($corpo['data'] ?? '');
        if ($titulo === '' || $data === null) {
            eq_erro(422, 'Informe o título e a data do evento.');
        }
        $hora = abas_hora($corpo['hora'] ?? '');
        if ($acao === 'criar') {
            $pdo->prepare('INSERT INTO tb_equipes_eventos (equipe_slug, titulo, data, hora, usuario_id) VALUES (:s, :t, :d, :h, :u)')
                ->execute(['s' => $slug, 't' => $titulo, 'd' => $data, 'h' => $hora, 'u' => $usuarioId]);
        } elseif ($acao === 'editar') {
            if (!$podeMexer) {
                eq_erro(403, 'Só o autor ou um administrador pode editar.');
            }
            $pdo->prepare('UPDATE tb_equipes_eventos SET titulo = :t, data = :d, hora = :h WHERE id = :id')
                ->execute(['t' => $titulo, 'd' => $data, 'h' => $hora, 'id' => $id]);
        } else {
            eq_erro(422, 'Ação inválida.');
        }
    } else {
        $titulo = abas_texto($corpo['titulo'] ?? '', 120);
        $conteudo = abas_texto($corpo['conteudo'] ?? '', 20000);
        if ($titulo === '') {
            eq_erro(422, 'Informe o título da nota.');
        }
        if ($acao === 'criar') {
            $pdo->prepare('INSERT INTO tb_equipes_notas (equipe_slug, titulo, conteudo, usuario_id) VALUES (:s, :t, :c, :u)')
                ->execute(['s' => $slug, 't' => $titulo, 'c' => $conteudo, 'u' => $usuarioId]);
        } elseif ($acao === 'editar') {
            if (!$podeMexer) {
                eq_erro(403, 'Só o autor ou um administrador pode editar.');
            }
            $pdo->prepare('UPDATE tb_equipes_notas SET titulo = :t, conteudo = :c WHERE id = :id')
                ->execute(['t' => $titulo, 'c' => $conteudo, 'id' => $id]);
        } else {
            eq_erro(422, 'Ação inválida.');
        }
    }

    eq_resposta(200, ['sucesso' => true]);
} catch (PDOException $e) {
    if (in_array((string)$e->getCode(), ['42S02', '42S22'], true)) {
        error_log('[equipes/abas] ' . $e->getMessage());
        eq_erro(500, 'As tabelas das abas ainda não existem. Execute database/equipes_abas.sql no phpMyAdmin.');
    }
    eq_erro_banco($e, 'abas');
}
