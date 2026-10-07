-- ============================================================
-- Módulo "Configurações" (área logada). Rodar depois do
-- schema.sql, usuarios_admin.sql e usuarios_cargo.sql.
--
-- O que este script faz (tudo isolado na tela Configurações):
--   1) Acrescenta a tb_usuarios: foto_arquivo, idioma e fuso_horario
--      (aba "Meu perfil").
--   2) Cria tb_usuario_preferencias: 1 linha por usuário, guardando
--      as preferências das abas Notificações, Privacidade, Aparência,
--      Segurança (2 etapas) e Integrações em JSON (coluna "dados").
--   3) Cria tb_usuario_sessoes: dispositivos / sessões ativas
--      (abas Dispositivos e Segurança).
-- ============================================================

ALTER TABLE `tb_usuarios`
  ADD COLUMN `foto_arquivo` VARCHAR(120) NULL DEFAULT NULL AFTER `status`,
  ADD COLUMN `idioma`       VARCHAR(10)  NOT NULL DEFAULT 'pt-BR' AFTER `foto_arquivo`,
  ADD COLUMN `fuso_horario` VARCHAR(40)  NOT NULL DEFAULT 'America/Sao_Paulo' AFTER `idioma`;

CREATE TABLE IF NOT EXISTS `tb_usuario_preferencias` (
  `usuario_id`    INT(10) UNSIGNED NOT NULL,
  `dados`         LONGTEXT NOT NULL,                       -- JSON: {"notificacoes":{...},"privacidade":{...},...}
  `atualizado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`usuario_id`),
  CONSTRAINT `fk_preferencias_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_usuario_sessoes` (
  `id`            INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id`    INT(10) UNSIGNED NOT NULL,
  `token_hash`    CHAR(64) NOT NULL,                       -- SHA-256 do token guardado na sessão PHP
  `dispositivo`   VARCHAR(20) NOT NULL DEFAULT 'desktop',  -- desktop | celular | tablet
  `navegador`     VARCHAR(60) NOT NULL DEFAULT '',
  `sistema`       VARCHAR(60) NOT NULL DEFAULT '',
  `ip`            VARCHAR(45) NOT NULL DEFAULT '',
  `criado_em`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ultimo_acesso` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `encerrada_em`  DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sessoes_token` (`token_hash`),
  KEY `idx_sessoes_usuario` (`usuario_id`, `encerrada_em`, `ultimo_acesso`),
  CONSTRAINT `fk_sessoes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
