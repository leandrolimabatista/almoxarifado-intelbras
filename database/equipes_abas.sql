-- =====================================================================
-- Intelbras — Portal | Equipes: abas Tarefas, Calendário e Notas
-- Rode DEPOIS de database/equipes.sql (phpMyAdmin > banco bd_intelbras > SQL).
-- Pode rodar mais de uma vez (IF NOT EXISTS).
-- =====================================================================
USE bd_intelbras;

CREATE TABLE IF NOT EXISTS tb_equipes_tarefas (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  equipe_slug  VARCHAR(40)     NOT NULL,
  titulo       VARCHAR(200)    NOT NULL,
  prazo        DATE            NULL,
  concluida    TINYINT(1)      NOT NULL DEFAULT 0,
  concluida_em DATETIME        NULL,
  usuario_id   INT UNSIGNED    NOT NULL,
  criada_em    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eqtar_equipe (equipe_slug, concluida),
  CONSTRAINT fk_eqtar_equipe  FOREIGN KEY (equipe_slug) REFERENCES tb_equipes (slug) ON DELETE CASCADE,
  CONSTRAINT fk_eqtar_usuario FOREIGN KEY (usuario_id)  REFERENCES tb_usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tb_equipes_eventos (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  equipe_slug VARCHAR(40)     NOT NULL,
  titulo      VARCHAR(200)    NOT NULL,
  data        DATE            NOT NULL,
  hora        TIME            NULL,
  usuario_id  INT UNSIGNED    NOT NULL,
  criado_em   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eqev_equipe (equipe_slug, data),
  CONSTRAINT fk_eqev_equipe  FOREIGN KEY (equipe_slug) REFERENCES tb_equipes (slug) ON DELETE CASCADE,
  CONSTRAINT fk_eqev_usuario FOREIGN KEY (usuario_id)  REFERENCES tb_usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tb_equipes_notas (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  equipe_slug   VARCHAR(40)     NOT NULL,
  titulo        VARCHAR(120)    NOT NULL,
  conteudo      TEXT            NOT NULL,
  usuario_id    INT UNSIGNED    NOT NULL,
  criada_em     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizada_em DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eqnot_equipe (equipe_slug, atualizada_em),
  CONSTRAINT fk_eqnot_equipe  FOREIGN KEY (equipe_slug) REFERENCES tb_equipes (slug) ON DELETE CASCADE,
  CONSTRAINT fk_eqnot_usuario FOREIGN KEY (usuario_id)  REFERENCES tb_usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
