-- ============================================================
-- "Esqueci minha senha" — tokens de redefinição enviados por e-mail
-- (Brevo). Rodar depois de database/schema.sql.
--
-- Guardamos só o HASH (SHA-256) do token: se alguém ler o banco, não
-- consegue montar o link de redefinição. O token em si só existe no
-- e-mail enviado ao usuário. Validade: 30 minutos, uso único.
-- ============================================================
USE bd_intelbras;

CREATE TABLE IF NOT EXISTS tb_redefinicao_senha (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id   INT UNSIGNED NOT NULL,
  token_hash   CHAR(64)     NOT NULL,                 -- sha256 do token enviado por e-mail
  expira_em    DATETIME     NOT NULL,
  usado_em     DATETIME     NULL,
  ip           VARCHAR(45)  NULL,
  criado_em    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_redef_token (token_hash),
  KEY idx_redef_usuario (usuario_id, criado_em),
  CONSTRAINT fk_redef_usuario FOREIGN KEY (usuario_id)
    REFERENCES tb_usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
