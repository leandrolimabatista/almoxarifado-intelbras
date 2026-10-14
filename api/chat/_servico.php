<?php
/**
 * Regras de negócio do módulo "Chat" (conversas pessoais 1 para 1).
 * Não é um endpoint: só funções, chamadas pelos arquivos em api/chat/.
 *
 * Cada conversa é identificada pelo PAR de usuários (tb_conversas.usuario1_id
 * < usuario2_id), então "eu começo a falar com você" e "você começa a falar
 * comigo" sempre caem na mesma linha — chat_obter_ou_criar_conversa() cuida
 * disso. Os anexos reaproveitam o módulo Documentos (documentos_salvar_arquivo
 * com origem = 'chat'), então aparecem também em Documentos > Compartilhados.
 */

declare(strict_types=1);

/** Iniciais (até 2 letras) pro avatar — mesmo critério usado em Usuários. */
function chat_iniciais(string $nome): string
{
    $partes = preg_split('/\s+/', trim($nome)) ?: [];
    $partes = array_values(array_filter($partes, static fn($p) => $p !== ''));
    if (!$partes) {
        return '?';
    }
    $iniciais = mb_strtoupper(mb_substr($partes[0], 0, 1));
    if (count($partes) > 1) {
        $iniciais .= mb_strtoupper(mb_substr($partes[count($partes) - 1], 0, 1));
    }
    return $iniciais;
}

/**
 * Lista usuários ativos pra escolher em "Nova conversa" (exclui o próprio
 * usuário logado). $busca filtra por nome ou email (opcional).
 */
function chat_listar_contatos(PDO $pdo, int $meuId, string $busca): array
{
    $sql = 'SELECT id, nome, email, cargo
            FROM tb_usuarios
            WHERE id != :meuId AND status = "ativo"
              AND id != 1'; // Administrador Intelbras não aparece para ninguém
    $parametros = ['meuId' => $meuId];

    $busca = trim($busca);
    if ($busca !== '') {
        // Com EMULATE_PREPARES desligado o PDO não aceita o mesmo parâmetro
        // nomeado duas vezes — por isso :busca1 e :busca2.
        $sql .= ' AND (nome LIKE :busca1 OR email LIKE :busca2)';
        $parametros['busca1'] = '%' . $busca . '%';
        $parametros['busca2'] = '%' . $busca . '%';
    }
    $sql .= ' ORDER BY nome ASC LIMIT 50';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($parametros);

    return array_map(static function (array $u): array {
        return [
            'id'        => (int)$u['id'],
            'nome'      => (string)$u['nome'],
            'email'     => (string)$u['email'],
            'cargo'     => (string)($u['cargo'] ?? ''),
            'iniciais'  => chat_iniciais((string)$u['nome']),
        ];
    }, $stmt->fetchAll());
}

/** Devolve {id, nome, email, cargo} de um usuário ativo, ou null. */
function chat_buscar_usuario(PDO $pdo, int $usuarioId): ?array
{
    $stmt = $pdo->prepare('SELECT id, nome, email, cargo FROM tb_usuarios WHERE id = :id AND status = "ativo" LIMIT 1');
    $stmt->execute(['id' => $usuarioId]);
    $u = $stmt->fetch();
    if (!$u) {
        return null;
    }
    return [
        'id'       => (int)$u['id'],
        'nome'     => (string)$u['nome'],
        'email'    => (string)$u['email'],
        'cargo'    => (string)($u['cargo'] ?? ''),
        'iniciais' => chat_iniciais((string)$u['nome']),
    ];
}

/**
 * Obtém a conversa entre $meuId e $outroId, criando-a se ainda não existir.
 * Normaliza a ordem (usuario1_id < usuario2_id) pra sempre cair na mesma linha.
 *
 * @return array{id:int} id da conversa
 */
function chat_obter_ou_criar_conversa(PDO $pdo, int $meuId, int $outroId): array
{
    if ($outroId <= 0 || $outroId === $meuId) {
        throw new InvalidArgumentException('Usuário inválido.');
    }

    $u1 = min($meuId, $outroId);
    $u2 = max($meuId, $outroId);

    $stmt = $pdo->prepare('SELECT id FROM tb_conversas WHERE usuario1_id = :u1 AND usuario2_id = :u2 LIMIT 1');
    $stmt->execute(['u1' => $u1, 'u2' => $u2]);
    $linha = $stmt->fetch();
    if ($linha) {
        return ['id' => (int)$linha['id']];
    }

    try {
        $stmt = $pdo->prepare('INSERT INTO tb_conversas (usuario1_id, usuario2_id) VALUES (:u1, :u2)');
        $stmt->execute(['u1' => $u1, 'u2' => $u2]);
        return ['id' => (int)$pdo->lastInsertId()];
    } catch (PDOException $e) {
        // Duas abas abrindo a mesma conversa ao mesmo tempo: a outra ganhou
        if ((string)$e->getCode() === '23000') {
            $stmt = $pdo->prepare('SELECT id FROM tb_conversas WHERE usuario1_id = :u1 AND usuario2_id = :u2 LIMIT 1');
            $stmt->execute(['u1' => $u1, 'u2' => $u2]);
            $linha = $stmt->fetch();
            if ($linha) {
                return ['id' => (int)$linha['id']];
            }
        }
        throw $e;
    }
}

/** true se $usuarioId é um dos dois participantes da conversa. */
function chat_eh_participante(PDO $pdo, int $conversaId, int $usuarioId): bool
{
    // :u1/:u2 separados: o mesmo parâmetro nomeado não pode repetir (EMULATE_PREPARES = false).
    $stmt = $pdo->prepare('SELECT 1 FROM tb_conversas WHERE id = :id AND (usuario1_id = :u1 OR usuario2_id = :u2) LIMIT 1');
    $stmt->execute(['id' => $conversaId, 'u1' => $usuarioId, 'u2' => $usuarioId]);
    return (bool)$stmt->fetchColumn();
}

/**
 * Lista as conversas do usuário logado, mais recente primeiro, com o nome
 * do outro participante, a prévia da última mensagem e a contagem de não lidas.
 */
function chat_listar_conversas(PDO $pdo, int $meuId): array
{
    $sql = 'SELECT
                c.id, c.usuario1_id, c.usuario2_id, c.criado_em AS conversa_criado_em,
                IF(c.usuario1_id = :meuId1, c.leitura1_em, c.leitura2_em) AS minha_leitura,
                outro.id AS outro_id, outro.nome AS outro_nome, outro.email AS outro_email, outro.cargo AS outro_cargo,
                ultima.id AS ultima_id, ultima.texto AS ultima_texto, ultima.remetente_id AS ultima_remetente_id,
                ultima.criado_em AS ultima_criado_em, ultima.documento_id AS ultima_documento_id,
                doc.nome AS ultima_doc_nome,
                (SELECT COUNT(*) FROM tb_mensagens m2
                   WHERE m2.conversa_id = c.id
                     AND m2.remetente_id != :meuId2
                     AND (IF(c.usuario1_id = :meuId3, c.leitura1_em, c.leitura2_em) IS NULL
                          OR m2.criado_em > IF(c.usuario1_id = :meuId4, c.leitura1_em, c.leitura2_em))
                ) AS nao_lidas
            FROM tb_conversas c
            JOIN tb_usuarios outro ON outro.id = IF(c.usuario1_id = :meuId5, c.usuario2_id, c.usuario1_id)
            LEFT JOIN tb_mensagens ultima ON ultima.id = (
                SELECT m.id FROM tb_mensagens m WHERE m.conversa_id = c.id ORDER BY m.id DESC LIMIT 1
            )
            LEFT JOIN tb_documentos doc ON doc.id = ultima.documento_id
            WHERE (c.usuario1_id = :meuId6 OR c.usuario2_id = :meuId7)
              AND outro.id != 1 -- Administrador Intelbras não aparece para ninguém
            ORDER BY COALESCE(ultima.criado_em, c.criado_em) DESC
            LIMIT 200';

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        'meuId1' => $meuId, 'meuId2' => $meuId, 'meuId3' => $meuId, 'meuId4' => $meuId,
        'meuId5' => $meuId, 'meuId6' => $meuId, 'meuId7' => $meuId,
    ]);

    return array_map(static function (array $l) use ($meuId): array {
        $previa = null;
        if ($l['ultima_id'] !== null) {
            if ($l['ultima_texto'] !== null && $l['ultima_texto'] !== '') {
                $previa = (string)$l['ultima_texto'];
            } elseif ($l['ultima_doc_nome'] !== null) {
                $previa = '📎 ' . (string)$l['ultima_doc_nome'];
            }
        }
        return [
            'id'              => (int)$l['id'],
            'usuario'         => [
                'id'       => (int)$l['outro_id'],
                'nome'     => (string)$l['outro_nome'],
                'email'    => (string)$l['outro_email'],
                'cargo'    => (string)($l['outro_cargo'] ?? ''),
                'iniciais' => chat_iniciais((string)$l['outro_nome']),
            ],
            'ultima_mensagem' => $previa,
            'ultima_de_mim'   => $l['ultima_remetente_id'] !== null ? (int)$l['ultima_remetente_id'] === $meuId : null,
            'ultima_em'       => chat_iso((string)($l['ultima_criado_em'] ?? $l['conversa_criado_em'])),
            'nao_lidas'       => (int)$l['nao_lidas'],
        ];
    }, $stmt->fetchAll());
}

/**
 * Mensagens de uma conversa, da mais antiga pra mais nova. Se $depoisDeId
 * for informado, só devolve mensagens com id maior (usado pelo polling).
 */
function chat_listar_mensagens(PDO $pdo, int $conversaId, int $depoisDeId = 0): array
{
    $sql = 'SELECT m.id, m.remetente_id, m.texto, m.criado_em,
                   d.id AS doc_id, d.nome AS doc_nome, d.extensao AS doc_extensao, d.tamanho AS doc_tamanho
            FROM tb_mensagens m
            LEFT JOIN tb_documentos d ON d.id = m.documento_id
            WHERE m.conversa_id = :conversaId' . ($depoisDeId > 0 ? ' AND m.id > :depoisDeId' : '') . '
            ORDER BY m.id ASC
            LIMIT 500';
    $stmt = $pdo->prepare($sql);
    $parametros = ['conversaId' => $conversaId];
    if ($depoisDeId > 0) {
        $parametros['depoisDeId'] = $depoisDeId;
    }
    $stmt->execute($parametros);

    return array_map(static function (array $m): array {
        return [
            'id'          => (int)$m['id'],
            'remetente_id' => (int)$m['remetente_id'],
            'texto'       => $m['texto'] !== null ? (string)$m['texto'] : null,
            'criado_em'   => chat_iso((string)$m['criado_em']),
            'anexo'       => $m['doc_id'] !== null ? [
                'documento_id' => (int)$m['doc_id'],
                'nome'         => (string)$m['doc_nome'],
                'extensao'     => (string)$m['doc_extensao'],
                'tamanho'      => (int)$m['doc_tamanho'],
            ] : null,
        ];
    }, $stmt->fetchAll());
}

/** Envia uma mensagem de texto. Devolve a mensagem já formatada. */
function chat_enviar_texto(PDO $pdo, int $conversaId, int $remetenteId, string $texto): array
{
    $texto = trim($texto);
    if ($texto === '') {
        throw new InvalidArgumentException('Escreva uma mensagem.');
    }
    if (mb_strlen($texto) > 4000) {
        throw new InvalidArgumentException('Mensagem muito longa (máximo 4000 caracteres).');
    }

    $stmt = $pdo->prepare('INSERT INTO tb_mensagens (conversa_id, remetente_id, texto) VALUES (:c, :r, :t)');
    $stmt->execute(['c' => $conversaId, 'r' => $remetenteId, 't' => $texto]);
    $id = (int)$pdo->lastInsertId();

    return chat_buscar_mensagem($pdo, $id);
}

/** Vincula um documento já salvo (tb_documentos) como mensagem/anexo. */
function chat_enviar_anexo(PDO $pdo, int $conversaId, int $remetenteId, int $documentoId, ?string $texto): array
{
    $texto = $texto !== null ? trim($texto) : null;
    if ($texto === '') {
        $texto = null;
    }

    $stmt = $pdo->prepare('INSERT INTO tb_mensagens (conversa_id, remetente_id, texto, documento_id) VALUES (:c, :r, :t, :d)');
    $stmt->execute(['c' => $conversaId, 'r' => $remetenteId, 't' => $texto, 'd' => $documentoId]);
    $id = (int)$pdo->lastInsertId();

    return chat_buscar_mensagem($pdo, $id);
}

function chat_buscar_mensagem(PDO $pdo, int $mensagemId): array
{
    $stmt = $pdo->prepare('SELECT m.id, m.remetente_id, m.texto, m.criado_em,
                                   d.id AS doc_id, d.nome AS doc_nome, d.extensao AS doc_extensao, d.tamanho AS doc_tamanho
                            FROM tb_mensagens m
                            LEFT JOIN tb_documentos d ON d.id = m.documento_id
                            WHERE m.id = :id');
    $stmt->execute(['id' => $mensagemId]);
    $m = $stmt->fetch();

    return [
        'id'           => (int)$m['id'],
        'remetente_id' => (int)$m['remetente_id'],
        'texto'        => $m['texto'] !== null ? (string)$m['texto'] : null,
        'criado_em'    => chat_iso((string)$m['criado_em']),
        'anexo'        => $m['doc_id'] !== null ? [
            'documento_id' => (int)$m['doc_id'],
            'nome'         => (string)$m['doc_nome'],
            'extensao'     => (string)$m['doc_extensao'],
            'tamanho'      => (int)$m['doc_tamanho'],
        ] : null,
    ];
}

/** Marca a conversa como lida (até agora) pelo usuário informado. */
function chat_marcar_lida(PDO $pdo, int $conversaId, int $usuarioId): void
{
    $stmt = $pdo->prepare('SELECT usuario1_id, usuario2_id FROM tb_conversas WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $conversaId]);
    $c = $stmt->fetch();
    if (!$c) {
        return;
    }

    $coluna = (int)$c['usuario1_id'] === $usuarioId ? 'leitura1_em' : 'leitura2_em';
    $pdo->prepare("UPDATE tb_conversas SET {$coluna} = NOW() WHERE id = :id")->execute(['id' => $conversaId]);
}
