-- =====================================================================
-- Intelbras — Portal | Módulo "Chat" — conversas pessoais (1 para 1)
--
-- Chat pessoal entre dois usuários cadastrados (como o chat do Microsoft
-- Teams), acessado pelos atalhos "Nova conversa" do menu lateral / Início.
-- Não é o "chat das equipes" (em grupo) citado em documentos_chat.sql —
-- esse continua para o futuro; este aqui é só entre duas pessoas.
--
-- COMO APLICAR (phpMyAdmin):
--   1. Rode ANTES: database/schema.sql, database/usuarios_admin.sql e
--      database/documentos.sql + database/documentos_chat.sql (os anexos
--      do chat viram documentos com origem = 'chat').
--   2. Clique no banco  bd_intelbras  > aba "SQL".
--   3. Cole TODO o conteúdo deste arquivo e clique em "Executar".
-- =====================================================================

USE bd_intelbras;

-- ---------------------------------------------------------------------
-- tb_conversas — uma linha por PAR de usuários (conversa individual).
-- usuario1_id é sempre o menor id dos dois (usuario1_id < usuario2_id),
-- garantido pelo PHP (api/chat/_servico.php) — assim "eu com você" e
-- "você comigo" são sempre a MESMA linha, e o UNIQUE abaixo impede
-- duas conversas para o mesmo par.
--
-- leitura1_em / leitura2_em: até quando usuario1 / usuario2 já leu a
-- conversa (NULL = nunca abriu). Define o contador de "não lidas" sem
-- precisar de uma tabela por mensagem/usuário.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tb_conversas (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario1_id   INT UNSIGNED    NOT NULL,
  usuario2_id   INT UNSIGNED    NOT NULL,
  leitura1_em   DATETIME        NULL,
  leitura2_em   DATETIME        NULL,
  criado_em     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_conversas_par (usuario1_id, usuario2_id),
  KEY idx_conversas_usuario1 (usuario1_id),
  KEY idx_conversas_usuario2 (usuario2_id),
  CONSTRAINT fk_conversas_usuario1 FOREIGN KEY (usuario1_id) REFERENCES tb_usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversas_usuario2 FOREIGN KEY (usuario2_id) REFERENCES tb_usuarios (id) ON DELETE CASCADE,
  CONSTRAINT chk_conversas_par CHECK (usuario1_id < usuario2_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- tb_mensagens — mensagens de uma conversa. Cada mensagem tem texto
-- e/ou um anexo (documento_id aponta pra um registro já salvo em
-- tb_documentos, com origem = 'chat' — ver documentos_chat.sql e
-- documentos_salvar_arquivo() em api/documentos/_servico.php).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tb_mensagens (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversa_id   BIGINT UNSIGNED NOT NULL,
  remetente_id  INT UNSIGNED    NOT NULL,
  texto         VARCHAR(4000)   NULL,
  documento_id  BIGINT UNSIGNED NULL,
  criado_em     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_mensagens_conversa (conversa_id, id),
  KEY idx_mensagens_documento (documento_id),
  CONSTRAINT fk_mensagens_conversa FOREIGN KEY (conversa_id) REFERENCES tb_conversas (id) ON DELETE CASCADE,
  CONSTRAINT fk_mensagens_remetente FOREIGN KEY (remetente_id) REFERENCES tb_usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_mensagens_documento FOREIGN KEY (documento_id) REFERENCES tb_documentos (id) ON DELETE SET NULL,
  CONSTRAINT chk_mensagens_conteudo CHECK (texto IS NOT NULL OR documento_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
