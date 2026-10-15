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
                IF(c.usuario1_id = :meuId8, c.leitura2_em, c.leitura1_em) AS outro_leitura,
                outro.id AS outro_id, outro.nome AS outro_nome, outro.email AS outro_email, outro.cargo AS outro_cargo,
                ultima.id AS ultima_id, ultima.texto AS ultima_texto, ultima.remetente_id AS ultima_remetente_id,
                ultima.criado_em AS ultima_criado_em, ultima.documento_id AS ultima_documento_id, ultima.excluida_em AS ultima_excluida_em,
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
        'meuId5' => $meuId, 'meuId6' => $meuId, 'meuId7' => $meuId, 'meuId8' => $meuId,
    ]);

    return array_map(static function (array $l) use ($meuId): array {
        $previa = null;
        if ($l['ultima_id'] !== null) {
            if ($l['ultima_excluida_em'] !== null) {
                $previa = 'Mensagem apagada';
            } elseif ($l['ultima_texto'] !== null && $l['ultima_texto'] !== '') {
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
            // Até quando a outra pessoa leu a conversa (null = nunca abriu): base do "Enviada / Lida"
            'outro_leitura'   => $l['outro_leitura'] !== null ? chat_iso((string)$l['outro_leitura']) : null,
        ];
    }, $stmt->fetchAll());
}

const CHAT_EMOJIS_MAX = 16; // cabe em VARCHAR(16); sequências com tom de pele/ZWJ passam de 8 caracteres

/**
 * Mensagens de uma conversa, da mais antiga pra mais nova. Se $depoisDeId
 * for informado, só devolve mensagens com id maior (usado pelo polling).
 * Se $alteradasDesde (Y-m-d H:i:s) for informado, devolve também as mais
 * antigas que foram editadas, apagadas ou reagidas desde então.
 */
function chat_listar_mensagens(PDO $pdo, int $conversaId, int $meuId, int $depoisDeId = 0, ?string $alteradasDesde = null): array
{
    $filtro = '';
    $parametros = ['conversaId' => $conversaId];
    if ($depoisDeId > 0) {
        $filtro = ' AND (m.id > :depoisDeId' . ($alteradasDesde !== null ? ' OR m.atualizada_em >= :desde' : '') . ')';
        $parametros['depoisDeId'] = $depoisDeId;
        if ($alteradasDesde !== null) {
            $parametros['desde'] = $alteradasDesde;
        }
    }

    $stmt = $pdo->prepare(chat_sql_mensagens() . ' WHERE m.conversa_id = :conversaId' . $filtro . ' ORDER BY m.id ASC LIMIT 500');
    $stmt->execute($parametros);

    return chat_formatar_mensagens($pdo, $stmt->fetchAll(), $meuId);
}

/** SELECT base das mensagens (com anexo e a mensagem citada). */
function chat_sql_mensagens(): string
{
    return 'SELECT m.id, m.remetente_id, m.texto, m.criado_em, m.editada_em, m.excluida_em,
                   d.id AS doc_id, d.nome AS doc_nome, d.extensao AS doc_extensao, d.tamanho AS doc_tamanho,
                   r.id AS resp_id, r.remetente_id AS resp_remetente_id, r.texto AS resp_texto,
                   r.excluida_em AS resp_excluida_em, rd.nome AS resp_doc_nome, ru.nome AS resp_autor
            FROM tb_mensagens m
            LEFT JOIN tb_documentos d ON d.id = m.documento_id
            LEFT JOIN tb_mensagens r ON r.id = m.resposta_a
            LEFT JOIN tb_documentos rd ON rd.id = r.documento_id
            LEFT JOIN tb_usuarios ru ON ru.id = r.remetente_id';
}

/** Linhas do SELECT acima -> formato da API (com reações do usuário $meuId). */
function chat_formatar_mensagens(PDO $pdo, array $linhas, int $meuId): array
{
    $reacoes = [];
    if ($linhas) {
        $ids = array_map(static fn(array $l): int => (int)$l['id'], $linhas);
        $marcas = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare(
            'SELECT mensagem_id, emoji, COUNT(*) AS total, SUM(usuario_id = ?) AS reagiu
             FROM tb_mensagens_reacoes
             WHERE mensagem_id IN (' . $marcas . ')
             GROUP BY mensagem_id, emoji
             ORDER BY MIN(criado_em) ASC'
        );
        $stmt->execute(array_merge([$meuId], $ids));
        foreach ($stmt->fetchAll() as $r) {
            $reacoes[(int)$r['mensagem_id']][] = [
                'emoji'  => (string)$r['emoji'],
                'total'  => (int)$r['total'],
                'reagiu' => (int)$r['reagiu'] > 0,
            ];
        }
    }

    return array_map(static function (array $m) use ($reacoes, $meuId): array {
        $apagada = $m['excluida_em'] !== null;

        $resposta = null;
        if ($m['resp_id'] !== null) {
            if ($m['resp_excluida_em'] !== null) {
                $trecho = 'Mensagem apagada';
            } elseif ($m['resp_texto'] !== null && $m['resp_texto'] !== '') {
                $trecho = mb_substr((string)$m['resp_texto'], 0, 140);
            } else {
                $trecho = '📎 ' . (string)$m['resp_doc_nome'];
            }
            $resposta = [
                'id'     => (int)$m['resp_id'],
                'autor'  => (int)$m['resp_remetente_id'] === $meuId ? 'Você' : (string)$m['resp_autor'],
                'trecho' => $trecho,
            ];
        }

        return [
            'id'           => (int)$m['id'],
            'remetente_id' => (int)$m['remetente_id'],
            // Mensagem apagada não devolve o conteúdo
            'texto'        => !$apagada && $m['texto'] !== null ? (string)$m['texto'] : null,
            'criado_em'    => chat_iso((string)$m['criado_em']),
            'editada'      => !$apagada && $m['editada_em'] !== null,
            'apagada'      => $apagada,
            'resposta_a'   => $apagada ? null : $resposta,
            'reacoes'      => $apagada ? [] : ($reacoes[(int)$m['id']] ?? []),
            'anexo'        => !$apagada && $m['doc_id'] !== null ? [
                'documento_id' => (int)$m['doc_id'],
                'nome'         => (string)$m['doc_nome'],
                'extensao'     => (string)$m['doc_extensao'],
                'tamanho'      => (int)$m['doc_tamanho'],
            ] : null,
        ];
    }, $linhas);
}

/** A mensagem citada precisa existir e ser da MESMA conversa. */
function chat_validar_resposta(PDO $pdo, int $conversaId, ?int $respostaA): ?int
{
    if ($respostaA === null || $respostaA <= 0) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT 1 FROM tb_mensagens WHERE id = :id AND conversa_id = :c AND excluida_em IS NULL LIMIT 1');
    $stmt->execute(['id' => $respostaA, 'c' => $conversaId]);
    return $stmt->fetchColumn() ? $respostaA : null;
}

/** Envia uma mensagem de texto. Devolve a mensagem já formatada. */
function chat_enviar_texto(PDO $pdo, int $conversaId, int $remetenteId, string $texto, ?int $respostaA = null): array
{
    $texto = trim($texto);
    if ($texto === '') {
        throw new InvalidArgumentException('Escreva uma mensagem.');
    }
    if (mb_strlen($texto) > 4000) {
        throw new InvalidArgumentException('Mensagem muito longa (máximo 4000 caracteres).');
    }

    $stmt = $pdo->prepare('INSERT INTO tb_mensagens (conversa_id, remetente_id, texto, resposta_a) VALUES (:c, :r, :t, :ra)');
    $stmt->execute(['c' => $conversaId, 'r' => $remetenteId, 't' => $texto, 'ra' => chat_validar_resposta($pdo, $conversaId, $respostaA)]);
    $id = (int)$pdo->lastInsertId();

    return chat_buscar_mensagem($pdo, $id, $remetenteId);
}

/** Vincula um documento já salvo (tb_documentos) como mensagem/anexo. */
function chat_enviar_anexo(PDO $pdo, int $conversaId, int $remetenteId, int $documentoId, ?string $texto, ?int $respostaA = null): array
{
    $texto = $texto !== null ? trim($texto) : null;
    if ($texto === '') {
        $texto = null;
    }

    $stmt = $pdo->prepare('INSERT INTO tb_mensagens (conversa_id, remetente_id, texto, documento_id, resposta_a) VALUES (:c, :r, :t, :d, :ra)');
    $stmt->execute(['c' => $conversaId, 'r' => $remetenteId, 't' => $texto, 'd' => $documentoId, 'ra' => chat_validar_resposta($pdo, $conversaId, $respostaA)]);
    $id = (int)$pdo->lastInsertId();

    return chat_buscar_mensagem($pdo, $id, $remetenteId);
}

function chat_buscar_mensagem(PDO $pdo, int $mensagemId, int $meuId): array
{
    $stmt = $pdo->prepare(chat_sql_mensagens() . ' WHERE m.id = :id');
    $stmt->execute(['id' => $mensagemId]);

    return chat_formatar_mensagens($pdo, $stmt->fetchAll(), $meuId)[0];
}

/** Mensagem + conversa, ou erro 404 se o usuário não participa da conversa. */
function chat_mensagem_do_participante(PDO $pdo, int $mensagemId, int $usuarioId): array
{
    $stmt = $pdo->prepare('SELECT id, conversa_id, remetente_id, texto, excluida_em FROM tb_mensagens WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $mensagemId]);
    $m = $stmt->fetch();
    if (!$m || !chat_eh_participante($pdo, (int)$m['conversa_id'], $usuarioId)) {
        throw new InvalidArgumentException('Mensagem não encontrada.', 404);
    }
    return $m;
}

function chat_editar_mensagem(PDO $pdo, int $usuarioId, int $mensagemId, string $texto): void
{
    $m = chat_mensagem_do_participante($pdo, $mensagemId, $usuarioId);
    $texto = trim($texto);
    if ($texto === '') {
        throw new InvalidArgumentException('A mensagem não pode ficar vazia.', 422);
    }
    if (mb_strlen($texto) > 4000) {
        throw new InvalidArgumentException('Mensagem muito longa (máximo 4000 caracteres).', 422);
    }
    if ((int)$m['remetente_id'] !== $usuarioId) {
        throw new InvalidArgumentException('Você só pode editar as suas próprias mensagens.', 403);
    }
    if ($m['excluida_em'] !== null) {
        throw new InvalidArgumentException('Esta mensagem foi apagada.', 422);
    }
    $pdo->prepare('UPDATE tb_mensagens SET texto = :t, editada_em = NOW() WHERE id = :id')
        ->execute(['t' => $texto, 'id' => $mensagemId]);
}

function chat_apagar_mensagem(PDO $pdo, int $usuarioId, int $mensagemId): void
{
    $m = chat_mensagem_do_participante($pdo, $mensagemId, $usuarioId);
    if ((int)$m['remetente_id'] !== $usuarioId) {
        throw new InvalidArgumentException('Você só pode apagar as suas próprias mensagens.', 403);
    }
    $pdo->prepare('UPDATE tb_mensagens SET excluida_em = NOW() WHERE id = :id AND excluida_em IS NULL')
        ->execute(['id' => $mensagemId]);
}

/** Reagir: clicar de novo no mesmo emoji remove a reação. */
function chat_alternar_reacao(PDO $pdo, int $usuarioId, int $mensagemId, string $emoji): void
{
    $m = chat_mensagem_do_participante($pdo, $mensagemId, $usuarioId);
    if ($emoji === '' || mb_strlen($emoji) > CHAT_EMOJIS_MAX) {
        throw new InvalidArgumentException('Reação inválida.', 422);
    }
    if ($m['excluida_em'] !== null) {
        throw new InvalidArgumentException('Esta mensagem foi apagada.', 422);
    }

    $stmt = $pdo->prepare('DELETE FROM tb_mensagens_reacoes WHERE mensagem_id = :m AND usuario_id = :u AND emoji = :e');
    $stmt->execute(['m' => $mensagemId, 'u' => $usuarioId, 'e' => $emoji]);
    if ($stmt->rowCount() === 0) {
        $pdo->prepare('INSERT IGNORE INTO tb_mensagens_reacoes (mensagem_id, usuario_id, emoji) VALUES (:m, :u, :e)')
            ->execute(['m' => $mensagemId, 'u' => $usuarioId, 'e' => $emoji]);
    }
    // Reação não altera a linha da mensagem: marca como atualizada para o polling da outra pessoa
    $pdo->prepare('UPDATE tb_mensagens SET atualizada_em = NOW() WHERE id = :id')->execute(['id' => $mensagemId]);
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
