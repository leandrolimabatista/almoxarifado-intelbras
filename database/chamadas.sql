-- ============================================================
-- Módulo "Chamadas" — voz e vídeo 100% dentro da plataforma.
-- Rodar depois de database/schema.sql, usuarios_admin.sql e
-- usuarios_cargo.sql (usa tb_usuarios.equipe_slug e .cargo).
--
-- Regras de negócio aplicadas na API (api/chamadas/*):
--   1) Chamada individual: só entre usuários da MESMA equipe.
--   2) Chamada com a equipe toda: só cargos gerente, diretor, ceo.
--   3) Não existe discagem externa (nenhuma coluna de telefone
--      aqui: as chamadas usam só tb_usuarios.id).
-- ============================================================

USE bd_intelbras;

-- Presença (status Online / Ausente / Offline / Não perturbe).
-- "Em chamada" não é gravado: é calculado a partir de
-- tb_chamadas_participantes.
CREATE TABLE IF NOT EXISTS `tb_chamadas_presenca` (
  `usuario_id`   INT(10) UNSIGNED NOT NULL,
  `estado`       ENUM('online','ausente') NOT NULL DEFAULT 'online',
  `nao_perturbe` TINYINT(1) NOT NULL DEFAULT 0,
  `ultimo_ping`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`usuario_id`),
  CONSTRAINT `fk_presenca_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reuniões agendadas (modal "Agendar chamada").
CREATE TABLE IF NOT EXISTS `tb_chamadas_agendadas` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `titulo`      VARCHAR(120) NOT NULL,
  `descricao`   VARCHAR(500) DEFAULT NULL,
  `data_hora`   DATETIME NOT NULL,
  `duracao_min` SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  `criador_id`  INT(10) UNSIGNED NOT NULL,
  `equipe_slug` VARCHAR(40) NOT NULL,
  `toda_equipe` TINYINT(1) NOT NULL DEFAULT 0,
  `criada_em`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cancelada_em` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_agendada_data` (`cancelada_em`,`data_hora`),
  KEY `idx_agendada_criador` (`criador_id`),
  CONSTRAINT `fk_agendada_criador` FOREIGN KEY (`criador_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_chamadas_agendadas_participantes` (
  `agendamento_id` INT(10) UNSIGNED NOT NULL,
  `usuario_id`     INT(10) UNSIGNED NOT NULL,
  PRIMARY KEY (`agendamento_id`,`usuario_id`),
  KEY `idx_agpart_usuario` (`usuario_id`),
  CONSTRAINT `fk_agpart_agendamento` FOREIGN KEY (`agendamento_id`) REFERENCES `tb_chamadas_agendadas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agpart_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chamadas (individual ou da equipe).
CREATE TABLE IF NOT EXISTS `tb_chamadas` (
  `id`             INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `tipo`           ENUM('individual','equipe') NOT NULL,
  `midia`          ENUM('voz','video') NOT NULL DEFAULT 'video',
  `equipe_slug`    VARCHAR(40) NOT NULL,
  `iniciador_id`   INT(10) UNSIGNED NOT NULL,
  `agendamento_id` INT(10) UNSIGNED DEFAULT NULL,
  `status`         ENUM('tocando','em_andamento','encerrada','recusada','perdida') NOT NULL DEFAULT 'tocando',
  `iniciada_em`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atendida_em`    DATETIME DEFAULT NULL,
  `encerrada_em`   DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_chamadas_status` (`status`,`iniciada_em`),
  KEY `idx_chamadas_agendamento` (`agendamento_id`),
  CONSTRAINT `fk_chamadas_iniciador` FOREIGN KEY (`iniciador_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chamadas_agendamento` FOREIGN KEY (`agendamento_id`) REFERENCES `tb_chamadas_agendadas` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_chamadas_participantes` (
  `chamada_id` INT(10) UNSIGNED NOT NULL,
  `usuario_id` INT(10) UNSIGNED NOT NULL,
  -- convidado = aviso/convite (membro offline ou fora do toque)
  -- tocando   = está recebendo o toast Atender/Recusar
  `estado`     ENUM('convidado','tocando','na_chamada','recusou','saiu','perdeu') NOT NULL DEFAULT 'tocando',
  `entrou_em`  DATETIME DEFAULT NULL,
  `saiu_em`    DATETIME DEFAULT NULL,
  PRIMARY KEY (`chamada_id`,`usuario_id`),
  KEY `idx_chpart_usuario` (`usuario_id`,`estado`),
  CONSTRAINT `fk_chpart_chamada` FOREIGN KEY (`chamada_id`) REFERENCES `tb_chamadas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chpart_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sinalização WebRTC (offer / answer / ice) trocada entre os
-- navegadores. O áudio e o vídeo NÃO passam pelo servidor.
CREATE TABLE IF NOT EXISTS `tb_chamadas_sinais` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `chamada_id` INT(10) UNSIGNED NOT NULL,
  `de_id`      INT(10) UNSIGNED NOT NULL,
  `para_id`    INT(10) UNSIGNED NOT NULL,
  `tipo`       ENUM('offer','answer','ice') NOT NULL,
  `payload`    MEDIUMTEXT NOT NULL,
  `criado_em`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sinais_destino` (`chamada_id`,`para_id`,`id`),
  CONSTRAINT `fk_sinais_chamada` FOREIGN KEY (`chamada_id`) REFERENCES `tb_chamadas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chat da chamada (painel lateral).
CREATE TABLE IF NOT EXISTS `tb_chamadas_mensagens` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `chamada_id` INT(10) UNSIGNED NOT NULL,
  `usuario_id` INT(10) UNSIGNED NOT NULL,
  `texto`      VARCHAR(1000) NOT NULL,
  `criada_em`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_chmsg_chamada` (`chamada_id`,`id`),
  CONSTRAINT `fk_chmsg_chamada` FOREIGN KEY (`chamada_id`) REFERENCES `tb_chamadas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chmsg_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
