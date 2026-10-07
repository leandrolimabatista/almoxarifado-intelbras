-- =====================================================================
-- Intelbras — Portal | Módulo "Inteligência Artificial"
-- Tabelas de conversas e mensagens + consultas principais
--
-- Compatível com o schema existente do projeto (database/schema.sql):
--   banco:    bd_intelbras
--   usuários: tb_usuarios (id INT UNSIGNED)
--   engine:   InnoDB / utf8mb4 / utf8mb4_unicode_ci
--
-- COMO APLICAR: rode este arquivo DEPOIS do database/schema.sql
--   (ou cole o bloco de CREATE TABLE no fim do schema.sql).
-- =====================================================================

USE bd_intelbras;

-- ---------------------------------------------------------------------
-- Conversas
-- ---------------------------------------------------------------------
-- ultima_mensagem_em: data exibida na lista ("10:15", "Ontem", "dd/mm").
--   Só muda quando chega mensagem nova. Renomear/fixar/arquivar NÃO
--   alteram essa data (por isso ela não é a mesma coisa que
--   atualizada_em, que muda a cada UPDATE da linha).
-- equipe_slug: contexto escolhido para a IA (geral, marketing, ti...).
--   NULL = sem contexto específico.
CREATE TABLE IF NOT EXISTS tb_ia_conversas (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id          INT UNSIGNED    NOT NULL,          -- mesmo tipo de tb_usuarios.id
  titulo              VARCHAR(120)    NOT NULL DEFAULT 'Nova conversa',
  equipe_slug         VARCHAR(40)     NULL,
  fixada              TINYINT(1)      NOT NULL DEFAULT 0,
  arquivada           TINYINT(1)      NOT NULL DEFAULT 0,
  excluida_em         DATETIME        NULL,              -- soft delete
  ultima_mensagem_em  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criada_em           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizada_em       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_ia_conv_usuario FOREIGN KEY (usuario_id)
    REFERENCES tb_usuarios (id) ON DELETE CASCADE,
  INDEX idx_ia_conv_lista (usuario_id, excluida_em, arquivada,
                           fixada, ultima_mensagem_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Mensagens
-- ---------------------------------------------------------------------
-- feedback: "útil / não útil" nas respostas da IA (NULL = sem avaliação).
CREATE TABLE IF NOT EXISTS tb_ia_mensagens (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversa_id  BIGINT UNSIGNED NOT NULL,
  papel        ENUM('usuario','ia') NOT NULL,
  conteudo     MEDIUMTEXT      NOT NULL,
  feedback     ENUM('util','nao_util') NULL,
  criada_em    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_ia_msg_conversa FOREIGN KEY (conversa_id)
    REFERENCES tb_ia_conversas (id) ON DELETE CASCADE,
  INDEX idx_ia_msg_conversa (conversa_id, criada_em, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- CONSULTAS PRINCIPAIS  (REFERÊNCIA — comentadas para o arquivo rodar sem
-- erro no cliente mysql; as consultas reais estão em api/ia/*.php) (PDO com prepared statements; o usuario_id vem
-- SEMPRE de $_SESSION['usuario_id'], nunca do cliente)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Card "Conversas recentes" (últimas 5).
--    Devolve os nomes de campo que o front usa: id, titulo, fixada,
--    atualizada_em (alias de ultima_mensagem_em).
--    0 linhas => o front mostra o estado vazio.
-- ---------------------------------------------------------------------
-- SELECT id, titulo, fixada, ultima_mensagem_em AS atualizada_em
-- FROM tb_ia_conversas
-- WHERE usuario_id = :usuario_id
--   AND arquivada = 0
--   AND excluida_em IS NULL
-- ORDER BY fixada DESC, ultima_mensagem_em DESC, id DESC
-- LIMIT 5;

-- Total (o link "Ver todas as conversas" só aparece se total > 5)
-- SELECT COUNT(*) AS total
-- FROM tb_ia_conversas
-- WHERE usuario_id = :usuario_id
--   AND arquivada = 0
--   AND excluida_em IS NULL;

-- Lista completa / busca (paginação por :limite e :offset como inteiros;
-- em PDO use bindValue(..., PDO::PARAM_INT)). :busca = '%texto%' ou '%'.
-- SELECT id, titulo, fixada, ultima_mensagem_em AS atualizada_em
-- FROM tb_ia_conversas
-- WHERE usuario_id = :usuario_id
--   AND arquivada = 0
--   AND excluida_em IS NULL
--   AND titulo LIKE :busca
-- ORDER BY fixada DESC, ultima_mensagem_em DESC, id DESC
-- LIMIT :limite OFFSET :offset;

-- ---------------------------------------------------------------------
-- 2) Criar conversa ao enviar a primeira mensagem.
--    O título (máx. 40 caracteres + "…") é montado no PHP:
--      $t = mb_strlen($msg) > 40 ? mb_substr($msg, 0, 40) . '…' : $msg;
--    (MySQL não adiciona reticências sozinho.)
-- ---------------------------------------------------------------------
-- INSERT INTO tb_ia_conversas (usuario_id, titulo, equipe_slug)
-- VALUES (:usuario_id, :titulo, :equipe_slug);
-- id novo: $pdo->lastInsertId()

-- ---------------------------------------------------------------------
-- 3) Salvar mensagem — SÓ se a conversa for do usuário logado.
--    Se rowCount() = 0, a conversa não existe / não é dele => 404.
--    Rode as duas instruções na mesma transação.
-- ---------------------------------------------------------------------
-- INSERT INTO tb_ia_mensagens (conversa_id, papel, conteudo)
-- SELECT c.id, :papel, :conteudo
-- FROM tb_ia_conversas c
-- WHERE c.id = :conversa_id
--   AND c.usuario_id = :usuario_id
--   AND c.excluida_em IS NULL;

-- UPDATE tb_ia_conversas
-- SET ultima_mensagem_em = NOW()
-- WHERE id = :conversa_id AND usuario_id = :usuario_id;

-- ---------------------------------------------------------------------
-- 4) Abrir uma conversa (mensagens em ordem cronológica).
--    Confere o dono da conversa no JOIN.
-- ---------------------------------------------------------------------
-- SELECT m.id, m.papel, m.conteudo, m.feedback, m.criada_em
-- FROM tb_ia_mensagens m
-- JOIN tb_ia_conversas c ON c.id = m.conversa_id
-- WHERE m.conversa_id = :conversa_id
--   AND c.usuario_id = :usuario_id
--   AND c.excluida_em IS NULL
-- ORDER BY m.criada_em ASC, m.id ASC;

-- ---------------------------------------------------------------------
-- 5) Renomear / fixar / arquivar / excluir (sempre filtrando pelo dono)
-- ---------------------------------------------------------------------
-- UPDATE tb_ia_conversas SET titulo    = :titulo WHERE id = :id AND usuario_id = :usuario_id AND excluida_em IS NULL;
-- UPDATE tb_ia_conversas SET fixada    = :valor  WHERE id = :id AND usuario_id = :usuario_id AND excluida_em IS NULL;
-- UPDATE tb_ia_conversas SET arquivada = 1       WHERE id = :id AND usuario_id = :usuario_id AND excluida_em IS NULL;
-- UPDATE tb_ia_conversas SET excluida_em = NOW() WHERE id = :id AND usuario_id = :usuario_id AND excluida_em IS NULL;

-- Feedback "útil / não útil" (só em mensagens de conversas do usuário)
-- UPDATE tb_ia_mensagens m
-- JOIN tb_ia_conversas c ON c.id = m.conversa_id
-- SET m.feedback = :feedback           -- 'util' | 'nao_util' | NULL
-- WHERE m.id = :mensagem_id
--   AND m.papel = 'ia'
--   AND c.usuario_id = :usuario_id;

-- =====================================================================
-- FASE 2 (opcional — só crie quando for implementar)
-- =====================================================================
-- As equipes do menu lateral hoje são fixas no HTML (não existe
-- tb_equipes). Para "compartilhar conversa com uma equipe", guarde o
-- slug da equipe (ex.: 'marketing'), igual ao equipe_slug acima:
--
-- CREATE TABLE IF NOT EXISTS tb_ia_compartilhamentos (
--   id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
--   conversa_id  BIGINT UNSIGNED NOT NULL,
--   equipe_slug  VARCHAR(40)     NOT NULL,
--   criado_em    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (id),
--   UNIQUE KEY uq_ia_comp (conversa_id, equipe_slug),
--   CONSTRAINT fk_ia_comp_conversa FOREIGN KEY (conversa_id)
--     REFERENCES tb_ia_conversas (id) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
