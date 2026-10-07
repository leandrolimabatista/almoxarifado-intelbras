-- ============================================================
-- Módulo "Nova conversa" (chat estilo Teams) — estrutura das
-- conversas. Rodar depois do schema.sql, usuarios_admin.sql e
-- usuarios_cargo.sql (precisa de tb_usuarios).
--
-- Tipos de conversa:
--   individual → 2 participantes (uma única conversa por par)
--   grupo      → 2+ participantes, nome opcional
--   equipe     → canal da equipe (equipe_slug), um único por equipe
--
-- Ainda não existe tabela de mensagens: a tela de chat será
-- desenvolvida depois. É seguro rodar de novo (IF NOT EXISTS).
-- ============================================================

USE bd_intelbras;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS tb_chat_conversas (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo                ENUM('individual','grupo','equipe') NOT NULL,
  nome                VARCHAR(120) NULL,                 -- grupo/equipe; NULL em conversa individual
  equipe_slug         VARCHAR(40)  NULL,                 -- preenchido só quando tipo = 'equipe'
  criado_por          INT UNSIGNED NOT NULL,
  ultima_mensagem_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criada_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_chat_equipe (equipe_slug),               -- NULL não conta: vários grupos/individuais podem coexistir
  KEY idx_chat_conv_lista (tipo, ultima_mensagem_em),
  CONSTRAINT fk_chat_conv_criador FOREIGN KEY (criado_por) REFERENCES tb_usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tb_chat_participantes (
  conversa_id  BIGINT UNSIGNED NOT NULL,
  usuario_id   INT UNSIGNED NOT NULL,
  entrou_em    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversa_id, usuario_id),
  KEY idx_chat_part_usuario (usuario_id, conversa_id),
  CONSTRAINT fk_chat_part_conversa FOREIGN KEY (conversa_id) REFERENCES tb_chat_conversas (id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_part_usuario  FOREIGN KEY (usuario_id)  REFERENCES tb_usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
