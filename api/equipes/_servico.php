<?php
/**
 * Serviço do módulo "Equipes" (chat estilo Teams) — regras de negócio SEM HTTP.
 *
 * Não envia headers, não abre sessão e não responde JSON: só funções e
 * constantes, no mesmo espírito de api/documentos/_servico.php. Os endpoints
 * (api/equipes/*.php) cuidam da parte HTTP e chamam estas funções.
 */

declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../documentos/_servico.php';

/** Cargos com privilégios de administração do canal (fixar aviso, silenciar canal, aceitar pedidos). */
const EQ_CARGOS_ADMIN = ['gerente', 'coordenador', 'diretor', 'ceo'];

/**
 * O usuário id 1 ("Administrador Intelbras") tem acesso de membro E de
 * admin em QUALQUER equipe, mesmo sem pertencer a ela — é o superusuário
 * da plataforma. Usado por eq_e_membro() e eq_e_admin() abaixo.
 */
const EQ_SUPER_ADMIN_ID = 1;

function eq_e_super_admin(int $usuarioId): bool
{
    return $usuarioId === EQ_SUPER_ADMIN_ID;
}

const EQ_EMOJIS_RAPIDOS = ['👍', '❤️', '😂', '😮', '😢', '🙌'];

/** Janela de "está digitando" e de presença "online" (segundos). */
const EQ_JANELA_DIGITANDO = 6;
const EQ_JANELA_ONLINE    = 90;

final class EquipesErro extends RuntimeException
{
    public function __construct(string $mensagem, int $http = 422)
    {
        parent::__construct($mensagem, $http);
    }
}

/** Pasta onde os anexos do chat ficam salvos (fora do htdocs, como em Documentos). */
function eq_dir_arquivos(): string
{
    $env = getenv('EQUIPES_UPLOAD_DIR');
    if ($env !== false && $env !== '') {
        return rtrim($env, '/\\');
    }
    $raiz = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/\\');
    $base = $raiz !== '' ? dirname($raiz) : dirname(__DIR__, 3);
    return $base . '/equipes_uploads';
}

// ---------------------------------------------------------------------
// Equipes e associação (quem é membro)
// ---------------------------------------------------------------------

/** Todas as equipes cadastradas, na ordem do menu lateral. */
function eq_listar_equipes(PDO $pdo): array
{
    $stmt = $pdo->query('SELECT slug, nome, cor, descricao, somente_leitura FROM tb_equipes ORDER BY ordem, nome');
    return $stmt->fetchAll();
}

function eq_buscar_equipe(PDO $pdo, string $slug): ?array
{
    $stmt = $pdo->prepare('SELECT slug, nome, cor, descricao, somente_leitura FROM tb_equipes WHERE slug = :slug LIMIT 1');
    $stmt->execute(['slug' => $slug]);
    $linha = $stmt->fetch();
    return $linha ?: null;
}

/**
 * true se o usuário pertence à equipe: ou é a equipe principal dele
 * (tb_usuarios.equipe_slug) ou teve um pedido de acesso aceito.
 */
function eq_e_membro(PDO $pdo, int $usuarioId, string $slug): bool
{
    if (eq_e_super_admin($usuarioId)) {
        return true;
    }
    $stmt = $pdo->prepare('SELECT equipe_slug, cargo FROM tb_usuarios WHERE id = :id AND status = "ativo" LIMIT 1');
    $stmt->execute(['id' => $usuarioId]);
    $usuario = $stmt->fetch();
    if (!$usuario) {
        return false;
    }
    if ((string)$usuario['equipe_slug'] === $slug) {
        return true;
    }

    $stmt = $pdo->prepare(
        'SELECT 1 FROM tb_equipes_membros WHERE equipe_slug = :slug AND usuario_id = :uid AND origem = "solicitacao" LIMIT 1'
    );
    $stmt->execute(['slug' => $slug, 'uid' => $usuarioId]);
    return (bool)$stmt->fetchColumn();
}

function eq_e_admin(PDO $pdo, int $usuarioId): bool
{
    if (eq_e_super_admin($usuarioId)) {
        return true;
    }
    $stmt = $pdo->prepare('SELECT cargo FROM tb_usuarios WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $usuarioId]);
    $cargo = (string)$stmt->fetchColumn();
    return in_array($cargo, EQ_CARGOS_ADMIN, true);
}

/** Garante que existe uma linha de preferências (favorita/silenciada/leitura) para o membro nesta equipe. */
function eq_garantir_membro(PDO $pdo, int $usuarioId, string $slug, string $origem = 'principal'): void
{
    $stmt = $pdo->prepare(
        'INSERT IGNORE INTO tb_equipes_membros (equipe_slug, usuario_id, origem) VALUES (:slug, :uid, :origem)'
    );
    $stmt->execute(['slug' => $slug, 'uid' => $usuarioId, 'origem' => $origem]);
}

/** Lista de membros reais da equipe (para o painel direito), com presença calculada. */
function eq_listar_membros(PDO $pdo, string $slug): array
{
    $stmt = $pdo->prepare(
        'SELECT u.id, u.nome, u.cargo,
                p.status AS presenca_status, p.visto_em
         FROM tb_usuarios u
         LEFT JOIN tb_usuarios_presenca p ON p.usuario_id = u.id
         WHERE u.status = "ativo" AND (
               u.equipe_slug = :slug1
            OR u.id IN (SELECT usuario_id FROM tb_equipes_membros WHERE equipe_slug = :slug2 AND origem = "solicitacao")
         )
         ORDER BY u.nome'
    );
    $stmt->execute(['slug1' => $slug, 'slug2' => $slug]);
    $linhas = $stmt->fetchAll();

    return array_map(static function (array $l): array {
        return [
            'id'       => (int)$l['id'],
            'nome'     => (string)$l['nome'],
            'inicial'  => mb_strtoupper(mb_substr((string)$l['nome'], 0, 1)),
            'cargo'    => (string)$l['cargo'],
            'presenca' => eq_calcular_presenca((string)($l['presenca_status'] ?? 'auto'), $l['visto_em'] ?? null),
        ];
    }, $linhas);
}

/** 'online' | 'reuniao' | 'ausente' | 'offline', a partir do status manual + último sinal de vida. */
function eq_calcular_presenca(string $statusManual, ?string $vistoEm): string
{
    if ($statusManual === 'reuniao' || $statusManual === 'ausente') {
        return $statusManual;
    }
    if ($vistoEm === null) {
        return 'offline';
    }
    $segundos = time() - (new DateTimeImmutable($vistoEm))->getTimestamp();
    return $segundos <= EQ_JANELA_ONLINE ? 'online' : 'offline';
}

/** Marca que o usuário está com a página aberta agora (heartbeat de presença). */
function eq_marcar_visto(PDO $pdo, int $usuarioId): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO tb_usuarios_presenca (usuario_id, visto_em)
         VALUES (:uid, NOW())
         ON DUPLICATE KEY UPDATE visto_em = NOW()'
    );
    $stmt->execute(['uid' => $usuarioId]);
}

/** Marca/desmarca "digitando" nesta equipe. */
function eq_marcar_digitando(PDO $pdo, int $usuarioId, string $slug): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO tb_usuarios_presenca (usuario_id, visto_em, digitando_equipe, digitando_em)
         VALUES (:uid, NOW(), :slug, NOW())
         ON DUPLICATE KEY UPDATE visto_em = NOW(), digitando_equipe = :slug2, digitando_em = NOW()'
    );
    $stmt->execute(['uid' => $usuarioId, 'slug' => $slug, 'slug2' => $slug]);
}

/** Nomes de quem está digitando nesta equipe agora, exceto o próprio usuário. */
function eq_quem_digitando(PDO $pdo, string $slug, int $usuarioId): array
{
    $stmt = $pdo->prepare(
        'SELECT u.nome
         FROM tb_usuarios_presenca p
         JOIN tb_usuarios u ON u.id = p.usuario_id
         WHERE p.digitando_equipe = :slug
           AND p.usuario_id <> :uid
           AND p.digitando_em >= DATE_SUB(NOW(), INTERVAL ' . EQ_JANELA_DIGITANDO . ' SECOND)'
    );
    $stmt->execute(['slug' => $slug, 'uid' => $usuarioId]);
    return array_map(static fn(array $l) => (string)$l['nome'], $stmt->fetchAll());
}

// ---------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------

/** Formata uma linha de mensagem (+ dados já agregados) para o JSON de resposta. */
function eq_formatar_mensagem(array $l, int $usuarioAtualId): array
{
    $apagada = $l['excluida_em'] !== null;
    $minha   = (int)$l['usuario_id'] === $usuarioAtualId;

    return [
        'id'          => (int)$l['id'],
        'usuario_id'  => (int)$l['usuario_id'],
        'autor'       => (string)$l['autor_nome'],
        'inicial'     => mb_strtoupper(mb_substr((string)$l['autor_nome'], 0, 1)),
        'minha'       => $minha,
        'conteudo'    => $apagada ? '' : (string)$l['conteudo'],
        'apagada'     => $apagada,
        'editada'     => $l['editada_em'] !== null,
        'criada_em'   => eq_iso((string)$l['criada_em']),
        'resposta_a'  => $l['resposta_a_id'] !== null ? [
            'id'     => (int)$l['resposta_a_id'],
            'autor'  => (string)$l['resposta_a_autor'],
            'trecho' => mb_substr((string)$l['resposta_a_conteudo'], 0, 140),
        ] : null,
        'anexos'      => $l['anexos'] ?? [],
        'reacoes'     => $l['reacoes'] ?? [],
        'fixada'      => !empty($l['fixada']),
        // 'enviada' | 'lida' — só faz sentido exibir em mensagens próprias
        'status'      => $minha ? (!empty($l['lida']) ? 'lida' : 'enviada') : null,
    ];
}

function eq_iso(string $datahora): string
{
    return (new DateTimeImmutable($datahora, new DateTimeZone('America/Sao_Paulo')))->format('c');
}

/**
 * Lista mensagens de uma equipe. Se $depoisDeId > 0, só as mensagens (e
 * edições/reações) mais novas que esse id — usado no polling incremental.
 *
 * @return array{mensagens:array,ultimo_id:int}
 */
function eq_listar_mensagens(PDO $pdo, string $slug, int $usuarioAtualId, int $depoisDeId = 0, int $limite = 60): array
{
    if ($depoisDeId > 0) {
        $stmt = $pdo->prepare(
            'SELECT m.id, m.usuario_id, u.nome AS autor_nome, m.conteudo, m.resposta_a,
                    m.editada_em, m.excluida_em, m.criada_em,
                    r.id AS resposta_a_id, ru.nome AS resposta_a_autor, r.conteudo AS resposta_a_conteudo
             FROM tb_equipes_mensagens m
             JOIN tb_usuarios u ON u.id = m.usuario_id
             LEFT JOIN tb_equipes_mensagens r ON r.id = m.resposta_a
             LEFT JOIN tb_usuarios ru ON ru.id = r.usuario_id
             WHERE m.equipe_slug = :slug AND m.id > :depois
             ORDER BY m.id ASC
             LIMIT ' . (int)$limite
        );
        $stmt->execute(['slug' => $slug, 'depois' => $depoisDeId]);
    } else {
        $stmt = $pdo->prepare(
            'SELECT m.id, m.usuario_id, u.nome AS autor_nome, m.conteudo, m.resposta_a,
                    m.editada_em, m.excluida_em, m.criada_em,
                    r.id AS resposta_a_id, ru.nome AS resposta_a_autor, r.conteudo AS resposta_a_conteudo
             FROM tb_equipes_mensagens m
             JOIN tb_usuarios u ON u.id = m.usuario_id
             LEFT JOIN tb_equipes_mensagens r ON r.id = m.resposta_a
             LEFT JOIN tb_usuarios ru ON ru.id = r.usuario_id
             WHERE m.equipe_slug = :slug
             ORDER BY m.id DESC
             LIMIT ' . (int)$limite
        );
        $stmt->execute(['slug' => $slug]);
    }
    $linhas = array_reverse($stmt->fetchAll());
    if (!$linhas) {
        return ['mensagens' => [], 'ultimo_id' => $depoisDeId];
    }

    $ids = array_map(static fn(array $l) => (int)$l['id'], $linhas);
    $marcadores = implode(',', array_fill(0, count($ids), '?'));

    // Anexos
    $anexosPorMsg = [];
    $stmt = $pdo->prepare(
        "SELECT id, mensagem_id, documento_id, nome_original, extensao, mime, tamanho
         FROM tb_equipes_anexos WHERE mensagem_id IN ($marcadores)"
    );
    $stmt->execute($ids);
    foreach ($stmt->fetchAll() as $a) {
        $anexosPorMsg[(int)$a['mensagem_id']][] = [
            'id'            => (int)$a['id'],
            'documento_id'  => $a['documento_id'] !== null ? (int)$a['documento_id'] : null,
            'nome'          => (string)$a['nome_original'],
            'extensao'      => (string)$a['extensao'],
            'tamanho'       => (int)$a['tamanho'],
        ];
    }

    // Reações agregadas + se o usuário atual reagiu
    $reacoesPorMsg = [];
    $stmt = $pdo->prepare(
        "SELECT mensagem_id, emoji, COUNT(*) AS total,
                SUM(usuario_id = ?) AS minha
         FROM tb_equipes_reacoes WHERE mensagem_id IN ($marcadores)
         GROUP BY mensagem_id, emoji
         ORDER BY MIN(criado_em)"
    );
    $stmt->execute(array_merge([$usuarioAtualId], $ids));
    foreach ($stmt->fetchAll() as $r) {
        $reacoesPorMsg[(int)$r['mensagem_id']][] = [
            'emoji'  => (string)$r['emoji'],
            'total'  => (int)$r['total'],
            'reagiu' => (int)$r['minha'] > 0,
        ];
    }

    // Fixadas
    $fixadas = [];
    $stmt = $pdo->prepare(
        "SELECT a.mensagem_id FROM tb_equipes_fixados f
         JOIN tb_equipes_anexos a ON a.id = f.anexo_id
         WHERE a.mensagem_id IN ($marcadores)"
    );
    $stmt->execute($ids);
    foreach ($stmt->fetchAll() as $f) {
        $fixadas[(int)$f['mensagem_id']] = true;
    }

    // Maior "última leitura" entre os OUTROS membros da equipe: usado para
    // decidir ✔ (enviada) vs ✔✔ (lida) nas mensagens do próprio usuário.
    $stmt = $pdo->prepare(
        'SELECT COALESCE(MAX(ultima_leitura_id), 0) FROM tb_equipes_membros
         WHERE equipe_slug = :slug AND usuario_id <> :uid'
    );
    $stmt->execute(['slug' => $slug, 'uid' => $usuarioAtualId]);
    $maxLeituraOutros = (int)$stmt->fetchColumn();

    $mensagens = [];
    foreach ($linhas as $l) {
        $id = (int)$l['id'];
        $l['anexos']  = $anexosPorMsg[$id] ?? [];
        $l['reacoes'] = $reacoesPorMsg[$id] ?? [];
        $l['fixada']  = $fixadas[$id] ?? false;
        $l['lida']    = $maxLeituraOutros > 0 && $id <= $maxLeituraOutros;
        $mensagens[]  = eq_formatar_mensagem($l, $usuarioAtualId);
    }

    return ['mensagens' => $mensagens, 'ultimo_id' => (int)end($linhas)['id']];
}

/** Cria uma mensagem de texto (sem anexo) e devolve o id gerado. */
function eq_criar_mensagem(PDO $pdo, string $slug, int $usuarioId, string $conteudo, ?int $respostaA): int
{
    $conteudo = trim($conteudo);
    if ($conteudo === '') {
        throw new EquipesErro('Escreva uma mensagem antes de enviar.', 422);
    }
    if (mb_strlen($conteudo) > 4000) {
        throw new EquipesErro('A mensagem é muito longa (máximo de 4000 caracteres).', 422);
    }

    if ($respostaA !== null) {
        $stmt = $pdo->prepare('SELECT 1 FROM tb_equipes_mensagens WHERE id = :id AND equipe_slug = :slug LIMIT 1');
        $stmt->execute(['id' => $respostaA, 'slug' => $slug]);
        if (!$stmt->fetchColumn()) {
            $respostaA = null;
        }
    }

    $stmt = $pdo->prepare(
        'INSERT INTO tb_equipes_mensagens (equipe_slug, usuario_id, conteudo, resposta_a)
         VALUES (:slug, :uid, :conteudo, :resposta)'
    );
    $stmt->execute(['slug' => $slug, 'uid' => $usuarioId, 'conteudo' => $conteudo, 'resposta' => $respostaA]);
    return (int)$pdo->lastInsertId();
}

/**
 * Salva um anexo enviado junto de uma mensagem: guarda a cópia própria do
 * chat e, se o formato for aceito pelo módulo Documentos, também cria o
 * documento da equipe (ponte descrita em api/documentos/LEIA-ME.md).
 */
function eq_salvar_anexo(PDO $pdo, int $mensagemId, string $slug, int $usuarioId, string $caminhoTmp, string $nomeOriginal): array
{
    $tamanho = (int)filesize($caminhoTmp);
    if ($tamanho <= 0) {
        throw new EquipesErro('O arquivo está vazio.', 422);
    }
    if ($tamanho > DOC_MAX_BYTES) {
        throw new EquipesErro('O arquivo é maior que ' . (DOC_MAX_BYTES / 1048576) . ' MB.', 413);
    }

    $nome = basename(str_replace('\\', '/', $nomeOriginal));
    $nome = preg_replace('/[\x00-\x1F\x7F]/u', '', $nome) ?? 'arquivo';
    $ext  = strtolower(pathinfo($nome, PATHINFO_EXTENSION));
    $mime = mime_content_type($caminhoTmp) ?: 'application/octet-stream';

    $dir = eq_dir_arquivos();
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
        throw new EquipesErro('Não foi possível salvar o anexo no servidor.', 500);
    }
    $arquivo = bin2hex(random_bytes(16)) . ($ext !== '' ? '.' . $ext : '');
    $destino = $dir . '/' . $arquivo;
    if (!@copy($caminhoTmp, $destino)) {
        throw new EquipesErro('Não foi possível salvar o anexo no servidor.', 500);
    }

    $documentoId = null;
    if (doc_extensao_aceita($nome)) {
        try {
            $doc = documentos_salvar_arquivo(
                $pdo,
                $usuarioId,
                $slug,
                $caminhoTmp,
                $nome,
                ['origem' => 'chat', 'origem_ref' => 'msg-' . $mensagemId]
            );
            $documentoId = $doc['id'];
        } catch (DocumentosErro $e) {
            // Formato/tamanho aceito pelo chat mas recusado pelo Documentos (raro): o
            // anexo continua existindo no chat, só não vira documento da equipe.
        }
    }

    $stmt = $pdo->prepare(
        'INSERT INTO tb_equipes_anexos (mensagem_id, documento_id, nome_original, extensao, mime, tamanho, arquivo)
         VALUES (:msg, :doc, :nome, :ext, :mime, :tamanho, :arquivo)'
    );
    $stmt->execute([
        'msg' => $mensagemId, 'doc' => $documentoId, 'nome' => $nome,
        'ext' => $ext, 'mime' => $mime, 'tamanho' => $tamanho, 'arquivo' => $arquivo,
    ]);

    return [
        'id' => (int)$pdo->lastInsertId(), 'documento_id' => $documentoId,
        'nome' => $nome, 'extensao' => $ext, 'tamanho' => $tamanho,
    ];
}

function eq_editar_mensagem(PDO $pdo, int $usuarioId, int $mensagemId, string $conteudo): void
{
    $conteudo = trim($conteudo);
    if ($conteudo === '') {
        throw new EquipesErro('A mensagem não pode ficar vazia.', 422);
    }
    $stmt = $pdo->prepare('SELECT usuario_id, excluida_em FROM tb_equipes_mensagens WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $mensagemId]);
    $m = $stmt->fetch();
    if (!$m) {
        throw new EquipesErro('Mensagem não encontrada.', 404);
    }
    if ((int)$m['usuario_id'] !== $usuarioId) {
        throw new EquipesErro('Você só pode editar as suas próprias mensagens.', 403);
    }
    if ($m['excluida_em'] !== null) {
        throw new EquipesErro('Esta mensagem foi apagada.', 422);
    }

    $stmt = $pdo->prepare('UPDATE tb_equipes_mensagens SET conteudo = :c, editada_em = NOW() WHERE id = :id');
    $stmt->execute(['c' => $conteudo, 'id' => $mensagemId]);
}

function eq_apagar_mensagem(PDO $pdo, int $usuarioId, int $mensagemId, bool $ehAdmin): void
{
    $stmt = $pdo->prepare('SELECT usuario_id FROM tb_equipes_mensagens WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $mensagemId]);
    $dono = $stmt->fetchColumn();
    if ($dono === false) {
        throw new EquipesErro('Mensagem não encontrada.', 404);
    }
    if ((int)$dono !== $usuarioId && !$ehAdmin) {
        throw new EquipesErro('Você não pode apagar esta mensagem.', 403);
    }
    $stmt = $pdo->prepare('UPDATE tb_equipes_mensagens SET excluida_em = NOW() WHERE id = :id');
    $stmt->execute(['id' => $mensagemId]);
}

function eq_alternar_reacao(PDO $pdo, int $usuarioId, int $mensagemId, string $emoji): void
{
    if (!in_array($emoji, EQ_EMOJIS_RAPIDOS, true) && mb_strlen($emoji) > 8) {
        throw new EquipesErro('Reação inválida.', 422);
    }
    $stmt = $pdo->prepare(
        'SELECT 1 FROM tb_equipes_reacoes WHERE mensagem_id = :m AND usuario_id = :u AND emoji = :e LIMIT 1'
    );
    $stmt->execute(['m' => $mensagemId, 'u' => $usuarioId, 'e' => $emoji]);
    if ($stmt->fetchColumn()) {
        $stmt = $pdo->prepare('DELETE FROM tb_equipes_reacoes WHERE mensagem_id = :m AND usuario_id = :u AND emoji = :e');
        $stmt->execute(['m' => $mensagemId, 'u' => $usuarioId, 'e' => $emoji]);
        return;
    }
    $stmt = $pdo->prepare(
        'INSERT IGNORE INTO tb_equipes_reacoes (mensagem_id, usuario_id, emoji) VALUES (:m, :u, :e)'
    );
    $stmt->execute(['m' => $mensagemId, 'u' => $usuarioId, 'e' => $emoji]);
}

function eq_alternar_fixado(PDO $pdo, string $slug, int $usuarioId, int $mensagemId, bool $fixar): void
{
    $stmt = $pdo->prepare('SELECT id FROM tb_equipes_anexos WHERE mensagem_id = :m LIMIT 1');
    $stmt->execute(['m' => $mensagemId]);
    $anexoId = $stmt->fetchColumn();
    if ($anexoId === false) {
        throw new EquipesErro('Só é possível fixar mensagens com arquivo anexado.', 422);
    }
    if ($fixar) {
        $stmt = $pdo->prepare(
            'INSERT IGNORE INTO tb_equipes_fixados (anexo_id, equipe_slug, fixado_por) VALUES (:a, :slug, :uid)'
        );
        $stmt->execute(['a' => $anexoId, 'slug' => $slug, 'uid' => $usuarioId]);
    } else {
        $stmt = $pdo->prepare('DELETE FROM tb_equipes_fixados WHERE anexo_id = :a');
        $stmt->execute(['a' => $anexoId]);
    }
}

/** Arquivos fixados no painel direito, mais recentes primeiro. */
function eq_listar_fixados(PDO $pdo, string $slug): array
{
    $stmt = $pdo->prepare(
        'SELECT a.id, a.nome_original, a.extensao, a.tamanho, a.documento_id, f.fixado_em
         FROM tb_equipes_fixados f
         JOIN tb_equipes_anexos a ON a.id = f.anexo_id
         WHERE f.equipe_slug = :slug
         ORDER BY f.fixado_em DESC
         LIMIT 20'
    );
    $stmt->execute(['slug' => $slug]);
    return array_map(static function (array $l): array {
        return [
            'anexo_id'     => (int)$l['id'],
            'documento_id' => $l['documento_id'] !== null ? (int)$l['documento_id'] : null,
            'nome'         => (string)$l['nome_original'],
            'extensao'     => (string)$l['extensao'],
            'tamanho'      => (int)$l['tamanho'],
        ];
    }, $stmt->fetchAll());
}

function eq_listar_links(PDO $pdo, string $slug): array
{
    $stmt = $pdo->prepare(
        'SELECT rotulo, url, icone FROM tb_equipes_links WHERE equipe_slug = :slug ORDER BY ordem'
    );
    $stmt->execute(['slug' => $slug]);
    return $stmt->fetchAll();
}

// ---------------------------------------------------------------------
// Solicitação de acesso (usuário fora da equipe)
// ---------------------------------------------------------------------

/** 'pendente' | 'aceita' | 'recusada' | null (nunca pediu). */
function eq_status_solicitacao(PDO $pdo, string $slug, int $usuarioId): ?string
{
    $stmt = $pdo->prepare(
        'SELECT status FROM tb_equipes_solicitacoes
         WHERE equipe_slug = :slug AND usuario_id = :uid
         ORDER BY id DESC LIMIT 1'
    );
    $stmt->execute(['slug' => $slug, 'uid' => $usuarioId]);
    $status = $stmt->fetchColumn();
    return $status === false ? null : (string)$status;
}

function eq_solicitar_acesso(PDO $pdo, string $slug, int $usuarioId): void
{
    $existente = eq_status_solicitacao($pdo, $slug, $usuarioId);
    if ($existente === 'pendente') {
        throw new EquipesErro('Seu pedido de acesso já está em análise.', 422);
    }
    $stmt = $pdo->prepare(
        'INSERT INTO tb_equipes_solicitacoes (equipe_slug, usuario_id, status) VALUES (:slug, :uid, "pendente")'
    );
    $stmt->execute(['slug' => $slug, 'uid' => $usuarioId]);
}

/** Total de mensagens não lidas de uma equipe pra este usuário (badge da sidebar). */
function eq_nao_lidas(PDO $pdo, string $slug, int $usuarioId): int
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM tb_equipes_mensagens m
         WHERE m.equipe_slug = :slug AND m.excluida_em IS NULL
           AND m.id > (
             SELECT COALESCE(ultima_leitura_id, 0) FROM tb_equipes_membros
             WHERE equipe_slug = :slug2 AND usuario_id = :uid
           )'
    );
    $stmt->execute(['slug' => $slug, 'slug2' => $slug, 'uid' => $usuarioId]);
    return (int)$stmt->fetchColumn();
}

/** Marca tudo o que existe hoje na equipe como lido para este usuário. */
function eq_marcar_lido(PDO $pdo, string $slug, int $usuarioId): void
{
    $stmt = $pdo->prepare(
        'UPDATE tb_equipes_membros
         SET ultima_leitura_id = (SELECT COALESCE(MAX(id), 0) FROM tb_equipes_mensagens WHERE equipe_slug = :slug1)
         WHERE equipe_slug = :slug2 AND usuario_id = :uid'
    );
    $stmt->execute(['slug1' => $slug, 'slug2' => $slug, 'uid' => $usuarioId]);
}

function eq_alternar_favorita(PDO $pdo, string $slug, int $usuarioId, bool $favorita): void
{
    $stmt = $pdo->prepare(
        'UPDATE tb_equipes_membros SET favorita = :f WHERE equipe_slug = :slug AND usuario_id = :uid'
    );
    $stmt->execute(['f' => $favorita ? 1 : 0, 'slug' => $slug, 'uid' => $usuarioId]);
}
