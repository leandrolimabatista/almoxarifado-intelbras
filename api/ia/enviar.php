<?php
/**
 * POST api/ia/enviar.php
 *   - JSON:      { conversa_id?, mensagem, equipe_slug? }
 *   - multipart: mensagem, conversa_id?, equipe_slug?, arquivos[]? (até 5 anexos)
 *
 * Fluxo:
 *  1. valida sessão, CSRF, mensagem, anexo (se houver) e rate limit;
 *  2. (conversa existente) confere o dono e carrega o histórico;
 *  3. chama a API de IA no servidor (Gemini ou Claude; a chave NUNCA vai para o front);
 *  4. só se a IA respondeu: grava, numa transação, a conversa (se nova),
 *     a mensagem do usuário, o anexo (arquivo no disco + linha em
 *     tb_ia_anexos) e a resposta da IA.
 *
 * Como nada é gravado quando a IA falha, "Tentar novamente" no front
 * reenvia a mesma mensagem (e o mesmo arquivo) sem duplicar registros.
 *
 * Continua sem a aba: o servidor termina o trabalho mesmo que o usuário troque
 * de página ou feche o navegador (ignore_user_abort). O front manda um
 * "envio_id"; o andamento fica em api/ia/_envios.php e é consultado por
 * api/ia/envio.php quando o usuário volta. "Parar geração" cancela pelo
 * próprio envio.php (marcador), então nesse caso nada é gravado.
 *
 * Anexos: nas próximas mensagens da mesma conversa, só os anexos da mensagem
 * MAIS RECENTE que tem arquivos são reenviados à IA com o conteúdo; os
 * anteriores entram só como uma nota com os nomes dos arquivos (economiza
 * tokens da cota gratuita).
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_anexos.php';
require_once __DIR__ . '/_envios.php';

// ---------------------- Configuração (edite aqui) ----------------------
// Provedor de IA: 'gemini' (plano gratuito do Google AI Studio) ou 'claude' (Anthropic, pago).
const IA_PROVEDOR          = 'gemini';
const IA_MODELO_GEMINI     = 'gemini-3.6-flash';  // o 2.5-flash foi desativado para contas novas
const IA_MODELO_CLAUDE     = 'claude-sonnet-5';   // usado só se IA_PROVEDOR = 'claude'
const IA_MAX_TOKENS        = 1500;                // tamanho máximo da resposta
const IA_HISTORICO_MAX     = 20;                  // últimas N mensagens enviadas como contexto
const IA_MENSAGEM_MAX      = 4000;                // caracteres por mensagem do usuário
const IA_LIMITE_POR_MINUTO = 10;                  // mensagens por usuário por minuto
const IA_TIMEOUT_SEGUNDOS  = 90;                  // (anexos grandes demoram mais)
const IA_TEXTO_PADRAO_ANEXO = 'Resuma o conteúdo do arquivo anexado.';
// As chaves são lidas, nesta ordem, de:
//   1. variável de ambiente (getenv) — se existir, tem prioridade;
//   2. arquivo api/config.local.php (não versionado) — funciona em qualquer máquina.
//   GEMINI_API_KEY     -> provedor 'gemini'
//   ANTHROPIC_API_KEY  -> provedor 'claude'
function ia_obter_chave(string $nome): string
{
    $env = getenv($nome);
    if ($env !== false && trim($env) !== '') {
        return trim($env);
    }
    $arquivo = dirname(__DIR__) . '/config.local.php';
    if (is_file($arquivo)) {
        $cfg = require $arquivo;
        if (is_array($cfg) && isset($cfg[$nome])) {
            $v = trim((string)$cfg[$nome]);
            if ($v !== '' && $v !== 'cole-a-chave-aqui') {
                return $v;
            }
        }
    }
    return '';
}
// -----------------------------------------------------------------------

$usuarioId = ia_iniciar(['POST']);
ia_exigir_csrf();

// O trabalho segue até o fim mesmo que o navegador desconecte (troca de página,
// aba fechada). O tempo de execução cobre a chamada à IA (que pode levar até
// IA_TIMEOUT_SEGUNDOS) e a gravação.
ignore_user_abort(true);
@set_time_limit(IA_TIMEOUT_SEGUNDOS + 60);

// ------------------------- Leitura da requisição -------------------------
$multipart = stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data') === 0;
if ($multipart) {
    // Se o corpo passou de post_max_size, o PHP zera $_POST e $_FILES
    if (!$_POST && !$_FILES && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
        ia_erro(413, 'Os arquivos são maiores que o limite permitido pelo servidor.');
    }
    $dados = $_POST;
} else {
    $dados = ia_ler_json();
}

// ------------------------- Validação da entrada -------------------------
$anexos = $multipart ? ia_validar_uploads() : []; // até IA_ANEXO_MAX_ARQUIVOS arquivos

$mensagem = trim((string)($dados['mensagem'] ?? ''));
if ($mensagem === '') {
    if ($anexos === []) {
        ia_erro(422, 'Digite uma mensagem.');
    }
    $mensagem = IA_TEXTO_PADRAO_ANEXO;
}
if (mb_strlen($mensagem) > IA_MENSAGEM_MAX) {
    ia_erro(422, 'A mensagem pode ter no máximo ' . IA_MENSAGEM_MAX . ' caracteres.');
}

$conversaId = (int)($dados['conversa_id'] ?? 0);

$equipeSlug = isset($dados['equipe_slug']) ? (string)$dados['equipe_slug'] : null;
if ($equipeSlug !== null && !in_array($equipeSlug, IA_EQUIPES, true)) {
    $equipeSlug = null;
}

// ---------------------- Andamento do envio (envio_id) ----------------------
// Sem envio_id (clientes antigos) tudo funciona como antes.
$envioId = ia_envio_id_valido($dados['envio_id'] ?? null);
if ($envioId !== null) {
    ia_envio_limpar_antigos();
    ia_envio_gravar($usuarioId, $envioId, ['estado' => 'pendente']);

    // Se o script terminar sem gravar a resposta (erro, cancelamento), o
    // estado deixa de ser "pendente" para o front não ficar esperando.
    register_shutdown_function(static function () use ($usuarioId, $envioId): void {
        $atual = ia_envio_ler($usuarioId, $envioId);
        if ($atual !== null && (($atual['dados']['estado'] ?? '') === 'pendente')) {
            ia_envio_gravar($usuarioId, $envioId, [
                'estado' => 'erro',
                'erro'   => (string)($GLOBALS['ia_ultimo_erro'] ?? 'Não foi possível concluir a resposta. Tente novamente.'),
            ]);
        }
    });
}

// ============================ Chamada à IA ============================

/** Instrução de sistema comum a todos os provedores. */
function ia_prompt_sistema(?string $equipeSlug): string
{
    $system = 'Você é a IA da Intelbras, assistente interno para ajudar os colaboradores no dia a dia. '
        . 'Responda sempre em português do Brasil, de forma clara, objetiva e cordial. '
        . 'Se não tiver certeza de algo, ou não tiver acesso a dados internos da empresa, diga isso '
        . 'com clareza em vez de inventar. Não afirme ter acesso a documentos, sistemas internos ou à internet, '
        . 'a não ser o conteúdo de arquivos que o usuário anexar na própria conversa: nesse caso, use esse '
        . 'conteúdo para responder e diga quando a informação pedida não estiver no arquivo. '
        . 'Responda em texto simples, sem formatação Markdown (sem **, #, tabelas ou blocos de código).';
    if ($equipeSlug !== null) {
        $system .= ' O usuário está conversando no contexto da equipe "' . $equipeSlug . '".';
    }
    return $system;
}

/**
 * POST JSON via cURL. Devolve o corpo da resposta ou null em falha
 * (o motivo real vai só para o log do servidor).
 */
function ia_post_json(string $url, array $cabecalhos, array $corpo, string $tag): ?string
{
    $json = json_encode($corpo, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) {
        error_log('[ia/enviar][' . $tag . '] não foi possível montar o JSON: ' . json_last_error_msg());
        return null;
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $json,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => IA_TIMEOUT_SEGUNDOS,
        CURLOPT_HTTPHEADER     => array_merge(['content-type: application/json'], $cabecalhos),
    ]);
    $resposta = curl_exec($ch);
    $status   = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $erroCurl = curl_error($ch);
    curl_close($ch);

    if ($resposta === false || $status !== 200) {
        error_log('[ia/enviar][' . $tag . '] falha na API (HTTP ' . $status . '): ' . $erroCurl . ' ' . substr((string)$resposta, 0, 500));
        return null;
    }
    return (string)$resposta;
}

/**
 * Formato interno de uma mensagem do histórico:
 *   ['role' => 'user'|'assistant', 'content' => string,
 *    'anexos' => [['nome' => string, 'mime' => string, 'caminho' => string], ...] (opcional)]
 */

/** Partes (texto / arquivo) de uma mensagem no formato do Gemini. */
function ia_gemini_partes(array $m): array
{
    $partes = [];
    $anexos = $m['anexos'] ?? [];
    foreach ($anexos as $a) {
        $dados = is_file($a['caminho']) ? file_get_contents($a['caminho']) : false;
        if ($dados === false) {
            $partes[] = ['text' => '[O arquivo "' . $a['nome'] . '" não está mais disponível]'];
        } elseif ($a['mime'] === 'text/plain') {
            $partes[] = ['text' => 'Conteúdo do arquivo "' . $a['nome'] . "\":\n\"\"\"\n"
                . ia_texto_do_arquivo($a['caminho']) . "\n\"\"\""];
        } else {
            if (count($anexos) > 1) {
                // Com vários arquivos, o nome ajuda a IA a saber de qual é cada um
                $partes[] = ['text' => 'Arquivo "' . $a['nome'] . '":'];
            }
            $partes[] = ['inline_data' => ['mime_type' => $a['mime'], 'data' => base64_encode($dados)]];
        }
    }
    $partes[] = ['text' => (string)$m['content']];
    return $partes;
}

/** Gemini (Google AI Studio). Devolve o texto da resposta ou null em falha. */
function ia_chamar_gemini(array $historico, ?string $equipeSlug): ?string
{
    $chave = ia_obter_chave('GEMINI_API_KEY');
    if ($chave === '') {
        error_log('[ia/enviar] GEMINI_API_KEY não configurada.');
        return null;
    }

    $contents = [];
    foreach ($historico as $m) {
        $contents[] = [
            'role'  => $m['role'] === 'assistant' ? 'model' : 'user',
            'parts' => ia_gemini_partes($m),
        ];
    }

    $corpo = [
        'systemInstruction' => ['parts' => [['text' => ia_prompt_sistema($equipeSlug)]]],
        'contents'          => $contents,
        'generationConfig'  => [
            'maxOutputTokens' => IA_MAX_TOKENS,
            // Desliga o "raciocínio" interno: evita respostas cortadas e economiza a cota gratuita.
            'thinkingConfig'  => ['thinkingBudget' => 0],
        ],
    ];

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . IA_MODELO_GEMINI . ':generateContent';
    $resposta = ia_post_json($url, ['x-goog-api-key: ' . $chave], $corpo, 'gemini');
    if ($resposta === null) {
        return null;
    }

    $json  = json_decode($resposta, true);
    $texto = '';
    foreach (($json['candidates'][0]['content']['parts'] ?? []) as $parte) {
        $texto .= (string)($parte['text'] ?? '');
    }
    $texto = trim($texto);

    if ($texto === '') {
        // Ex.: resposta bloqueada pelos filtros de segurança do Gemini
        error_log('[ia/enviar][gemini] resposta vazia: ' . substr($resposta, 0, 500));
        return null;
    }
    return $texto;
}

/** Conteúdo (texto / arquivo) de uma mensagem no formato da Anthropic. */
function ia_claude_conteudo(array $m)
{
    if (empty($m['anexos'])) {
        return (string)$m['content'];
    }
    $anexos = $m['anexos'];

    $blocos = [];
    foreach ($anexos as $a) {
        $dados = is_file($a['caminho']) ? file_get_contents($a['caminho']) : false;
        if ($dados === false) {
            $blocos[] = ['type' => 'text', 'text' => '[O arquivo "' . $a['nome'] . '" não está mais disponível]'];
        } elseif ($a['mime'] === 'text/plain') {
            $blocos[] = ['type' => 'text', 'text' => 'Conteúdo do arquivo "' . $a['nome'] . "\":\n\"\"\"\n"
                . ia_texto_do_arquivo($a['caminho']) . "\n\"\"\""];
        } else {
            if (count($anexos) > 1) {
                $blocos[] = ['type' => 'text', 'text' => 'Arquivo "' . $a['nome'] . '":'];
            }
            $blocos[] = [
                'type'   => $a['mime'] === 'application/pdf' ? 'document' : 'image',
                'source' => ['type' => 'base64', 'media_type' => $a['mime'], 'data' => base64_encode($dados)],
            ];
        }
    }
    $blocos[] = ['type' => 'text', 'text' => (string)$m['content']];
    return $blocos;
}

/** Claude (Anthropic) — mantido para quando houver chave paga. */
function ia_chamar_claude(array $historico, ?string $equipeSlug): ?string
{
    $chave = ia_obter_chave('ANTHROPIC_API_KEY');
    if ($chave === '') {
        error_log('[ia/enviar] ANTHROPIC_API_KEY não configurada.');
        return null;
    }

    $mensagens = [];
    foreach ($historico as $m) {
        $mensagens[] = ['role' => $m['role'], 'content' => ia_claude_conteudo($m)];
    }

    $corpo = [
        'model'      => IA_MODELO_CLAUDE,
        'max_tokens' => IA_MAX_TOKENS,
        'system'     => ia_prompt_sistema($equipeSlug),
        'messages'   => $mensagens,
    ];
    $resposta = ia_post_json(
        'https://api.anthropic.com/v1/messages',
        ['x-api-key: ' . $chave, 'anthropic-version: 2023-06-01'],
        $corpo,
        'claude'
    );
    if ($resposta === null) {
        return null;
    }

    $json  = json_decode($resposta, true);
    $texto = '';
    foreach (($json['content'] ?? []) as $bloco) {
        if (($bloco['type'] ?? '') === 'text') {
            $texto .= (string)($bloco['text'] ?? '');
        }
    }
    $texto = trim($texto);

    return $texto !== '' ? $texto : null;
}

/** Escolhe o provedor configurado. Devolve o texto da resposta ou null em falha. */
function ia_chamar_modelo(array $historico, ?string $equipeSlug): ?string
{
    return IA_PROVEDOR === 'claude'
        ? ia_chamar_claude($historico, $equipeSlug)
        : ia_chamar_gemini($historico, $equipeSlug);
}

// ============================ Fluxo principal ============================

$arquivosSalvos = []; // caminhos dos anexos no disco (para desfazer se algo falhar)

try {
    $pdo = ia_pdo();

    // ------------------------- Rate limit por usuário -------------------------
    $stmt = $pdo->prepare(
        "SELECT COUNT(*)
         FROM tb_ia_mensagens m
         JOIN tb_ia_conversas c ON c.id = m.conversa_id
         WHERE c.usuario_id = :usuario_id
           AND m.papel = 'usuario'
           AND m.criada_em >= (NOW() - INTERVAL 1 MINUTE)"
    );
    $stmt->execute(['usuario_id' => $usuarioId]);
    if ((int)$stmt->fetchColumn() >= IA_LIMITE_POR_MINUTO) {
        ia_erro(429, 'Limite de uso atingido. Aguarde um minuto e tente novamente.');
    }

    // ------------------- Conversa existente: dono + histórico -------------------
    $historico = [];
    $nova = $conversaId <= 0;
    if (!$nova) {
        $stmt = $pdo->prepare(
            'SELECT id, equipe_slug
             FROM tb_ia_conversas
             WHERE id = :id AND usuario_id = :usuario_id AND excluida_em IS NULL
             LIMIT 1'
        );
        $stmt->execute(['id' => $conversaId, 'usuario_id' => $usuarioId]);
        $existente = $stmt->fetch();
        if (!$existente) {
            ia_erro(404, 'Conversa não encontrada.');
        }
        // A equipe da conversa é a que foi definida na criação
        $equipeSlug = $existente['equipe_slug'];

        $stmt = $pdo->prepare(
            'SELECT id, papel, conteudo
             FROM tb_ia_mensagens
             WHERE conversa_id = :conversa_id
             ORDER BY criada_em DESC, id DESC
             LIMIT ' . IA_HISTORICO_MAX
        );
        $stmt->execute(['conversa_id' => $conversaId]);
        $linhas = array_reverse($stmt->fetchAll());

        // Anexos dessas mensagens (cada mensagem pode ter vários)
        $anexosPorMensagem = [];
        if ($linhas) {
            $ids    = array_map(static fn(array $l): int => (int)$l['id'], $linhas);
            $marcas = implode(',', array_fill(0, count($ids), '?'));
            $stmtA  = $pdo->prepare(
                'SELECT mensagem_id, nome_original, mime, arquivo
                 FROM tb_ia_anexos
                 WHERE mensagem_id IN (' . $marcas . ')
                 ORDER BY id ASC'
            );
            $stmtA->execute($ids);
            foreach ($stmtA->fetchAll() as $a) {
                $anexosPorMensagem[(int)$a['mensagem_id']][] = $a;
            }
        }

        // Só os anexos da mensagem mais recente que tem arquivos vão com o
        // conteúdo (e só se a mensagem atual não trouxer arquivos novos)
        $indiceAnexoRecente = -1;
        foreach ($linhas as $i => $l) {
            if (!empty($anexosPorMensagem[(int)$l['id']])) {
                $indiceAnexoRecente = $i;
            }
        }

        foreach ($linhas as $i => $l) {
            $item = [
                'role'    => $l['papel'] === 'ia' ? 'assistant' : 'user',
                'content' => (string)$l['conteudo'],
            ];
            $anexosMsg = $anexosPorMensagem[(int)$l['id']] ?? [];
            if ($anexosMsg) {
                if ($anexos === [] && $i === $indiceAnexoRecente) {
                    $item['anexos'] = array_map(static fn(array $a): array => [
                        'nome'    => (string)$a['nome_original'],
                        'mime'    => (string)$a['mime'],
                        'caminho' => ia_dir_anexos() . '/' . basename((string)$a['arquivo']),
                    ], $anexosMsg);
                } else {
                    $nomes = implode(', ', array_map(
                        static fn(array $a): string => (string)$a['nome_original'],
                        $anexosMsg
                    ));
                    $rotulo = count($anexosMsg) > 1 ? 'Arquivos anexados: ' : 'Arquivo anexado: ';
                    $item['content'] = '[' . $rotulo . $nomes . "]\n" . $item['content'];
                }
            }
            $historico[] = $item;
        }
        // A API exige que a primeira mensagem seja do usuário
        while ($historico && $historico[0]['role'] !== 'user') {
            array_shift($historico);
        }
    }

    $atual = ['role' => 'user', 'content' => $mensagem];
    if ($anexos !== []) {
        $atual['anexos'] = array_map(static fn(array $a): array => [
            'nome'    => $a['nome'],
            'mime'    => $a['mime'],
            'caminho' => $a['tmp'],
        ], $anexos);
    }
    $historico[] = $atual;

    // ------------------------------ Chama a IA ------------------------------
    $momentoUsuario = date('Y-m-d H:i:s');
    $resposta = ia_chamar_modelo($historico, $equipeSlug);
    if ($resposta === null) {
        ia_erro(503, 'A IA está indisponível no momento. Tente novamente em instantes.');
    }
    $momentoIa = date('Y-m-d H:i:s');

    // Se o usuário clicou em "Parar geração", não grava nada.
    if ($envioId !== null) {
        // O cancelamento vem pelo envio.php (marcador). Trocar de página ou
        // fechar a aba NÃO cancela: a resposta é gravada normalmente.
        if (ia_envio_cancelado($usuarioId, $envioId)) {
            ia_envio_gravar($usuarioId, $envioId, ['estado' => 'cancelado']);
            exit;
        }
    } else {
        // Cliente sem envio_id: o espaço em branco força o PHP a detectar a
        // conexão fechada (é válido antes do JSON).
        echo ' ';
        @ob_flush();
        flush();
        if (connection_aborted()) {
            exit;
        }
    }

    // ------------------------------ Grava tudo ------------------------------
    $pdo->beginTransaction();

    if ($nova) {
        // Título automático: 40 caracteres + reticências (o MySQL não faz isso)
        $titulo = mb_strlen($mensagem) > 40 ? mb_substr($mensagem, 0, 40) . '…' : $mensagem;
        $titulo = preg_replace('/\s+/u', ' ', $titulo) ?? $titulo;

        $stmt = $pdo->prepare(
            'INSERT INTO tb_ia_conversas (usuario_id, titulo, equipe_slug, ultima_mensagem_em)
             VALUES (:usuario_id, :titulo, :equipe_slug, :momento)'
        );
        $stmt->execute([
            'usuario_id'  => $usuarioId,
            'titulo'      => $titulo,
            'equipe_slug' => $equipeSlug,
            'momento'     => $momentoIa,
        ]);
        $conversaId = (int)$pdo->lastInsertId();

        $stmt = $pdo->prepare(
            'INSERT INTO tb_ia_mensagens (conversa_id, papel, conteudo, criada_em)
             VALUES (:conversa_id, :papel, :conteudo, :momento)'
        );
    } else {
        // Só grava se a conversa continua sendo do usuário (e não foi excluída
        // enquanto a IA respondia)
        $stmt = $pdo->prepare(
            'INSERT INTO tb_ia_mensagens (conversa_id, papel, conteudo, criada_em)
             SELECT c.id, :papel, :conteudo, :momento
             FROM tb_ia_conversas c
             WHERE c.id = :conversa_id
               AND c.usuario_id = :usuario_id
               AND c.excluida_em IS NULL'
        );
    }

    // O INSERT protegido (conversa existente) recebe também o usuario_id
    $extra = $nova ? [] : ['usuario_id' => $usuarioId];

    $stmt->execute($extra + [
        'conversa_id' => $conversaId,
        'papel'       => 'usuario',
        'conteudo'    => $mensagem,
        'momento'     => $momentoUsuario,
    ]);
    if ($stmt->rowCount() === 0) {
        $pdo->rollBack();
        ia_erro(404, 'Conversa não encontrada.');
    }
    $idMsgUsuario = (int)$pdo->lastInsertId();

    // ---- Anexos: arquivos no disco (fora do htdocs) + linhas em tb_ia_anexos ----
    $anexosResposta = [];
    if ($anexos !== []) {
        $dir = ia_dir_anexos();
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException('Não foi possível criar a pasta de anexos: ' . $dir);
        }

        $stmtAnexo = $pdo->prepare(
            'INSERT INTO tb_ia_anexos (mensagem_id, nome_original, mime, tamanho, arquivo)
             VALUES (:mensagem_id, :nome, :mime, :tamanho, :arquivo)'
        );
        foreach ($anexos as $a) {
            $nomeNoDisco = bin2hex(random_bytes(16)) . '.' . $a['ext'];
            $destino     = $dir . '/' . $nomeNoDisco;
            if (!move_uploaded_file($a['tmp'], $destino)) {
                throw new RuntimeException('Não foi possível salvar o anexo em: ' . $destino);
            }
            $arquivosSalvos[] = $destino;

            $stmtAnexo->execute([
                'mensagem_id' => $idMsgUsuario,
                'nome'        => $a['nome'],
                'mime'        => $a['mime'],
                'tamanho'     => $a['tamanho'],
                'arquivo'     => $nomeNoDisco,
            ]);
            // Mesma ordem em que os arquivos foram enviados
            $anexosResposta[] = ia_formatar_anexo(
                (int)$pdo->lastInsertId(), $a['nome'], $a['mime'], $a['tamanho']
            );
        }
    }

    $stmt->execute($extra + [
        'conversa_id' => $conversaId,
        'papel'       => 'ia',
        'conteudo'    => $resposta,
        'momento'     => $momentoIa,
    ]);
    $idMsgIa = (int)$pdo->lastInsertId();

    $stmt = $pdo->prepare(
        'UPDATE tb_ia_conversas SET ultima_mensagem_em = :momento
         WHERE id = :id AND usuario_id = :usuario_id'
    );
    $stmt->execute(['momento' => $momentoIa, 'id' => $conversaId, 'usuario_id' => $usuarioId]);

    $pdo->commit();

    if ($envioId !== null) {
        ia_envio_gravar($usuarioId, $envioId, ['estado' => 'ok', 'conversa_id' => $conversaId]);
    }

    $stmt = $pdo->prepare(
        'SELECT id, titulo, fixada, ultima_mensagem_em AS atualizada_em
         FROM tb_ia_conversas WHERE id = :id AND usuario_id = :usuario_id'
    );
    $stmt->execute(['id' => $conversaId, 'usuario_id' => $usuarioId]);

    ia_resposta(200, [
        'sucesso'          => true,
        'conversa'         => ia_formatar_conversa($stmt->fetch()),
        'mensagem_usuario' => [
            'id' => $idMsgUsuario, 'papel' => 'usuario',
            'conteudo' => $mensagem, 'criada_em' => ia_iso($momentoUsuario),
            'anexos' => $anexosResposta,
        ],
        'mensagem'         => [
            'id' => $idMsgIa, 'papel' => 'ia',
            'conteudo' => $resposta, 'criada_em' => ia_iso($momentoIa),
        ],
    ]);
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    foreach ($arquivosSalvos as $caminhoSalvo) {
        if (is_file($caminhoSalvo)) {
            @unlink($caminhoSalvo);
        }
    }
    error_log('[ia/enviar] ' . $e->getMessage());
    ia_erro(500, 'Erro ao consultar o banco de dados.');
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    foreach ($arquivosSalvos as $caminhoSalvo) {
        if (is_file($caminhoSalvo)) {
            @unlink($caminhoSalvo);
        }
    }
    error_log('[ia/enviar] ' . $e->getMessage());
    ia_erro(500, 'Não foi possível salvar a mensagem. Tente novamente.');
}
