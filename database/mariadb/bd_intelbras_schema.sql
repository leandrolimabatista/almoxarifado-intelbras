/*M!999999\- enable the sandbox mode */ 

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `tb_chamadas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_chamadas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tipo` enum('individual','equipe') NOT NULL,
  `midia` enum('voz','video') NOT NULL DEFAULT 'video',
  `equipe_slug` varchar(40) NOT NULL,
  `iniciador_id` int(10) unsigned NOT NULL,
  `agendamento_id` int(10) unsigned DEFAULT NULL,
  `status` enum('tocando','em_andamento','encerrada','recusada','perdida') NOT NULL DEFAULT 'tocando',
  `iniciada_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atendida_em` datetime DEFAULT NULL,
  `encerrada_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_chamadas_status` (`status`,`iniciada_em`),
  KEY `idx_chamadas_agendamento` (`agendamento_id`),
  KEY `fk_chamadas_iniciador` (`iniciador_id`),
  CONSTRAINT `fk_chamadas_agendamento` FOREIGN KEY (`agendamento_id`) REFERENCES `tb_chamadas_agendadas` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_chamadas_iniciador` FOREIGN KEY (`iniciador_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_chamadas_agendadas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_chamadas_agendadas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `titulo` varchar(120) NOT NULL,
  `descricao` varchar(500) DEFAULT NULL,
  `data_hora` datetime NOT NULL,
  `duracao_min` smallint(5) unsigned NOT NULL DEFAULT 30,
  `criador_id` int(10) unsigned NOT NULL,
  `equipe_slug` varchar(40) NOT NULL,
  `toda_equipe` tinyint(1) NOT NULL DEFAULT 0,
  `criada_em` datetime NOT NULL DEFAULT current_timestamp(),
  `cancelada_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_agendada_data` (`cancelada_em`,`data_hora`),
  KEY `idx_agendada_criador` (`criador_id`),
  CONSTRAINT `fk_agendada_criador` FOREIGN KEY (`criador_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_chamadas_agendadas_participantes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_chamadas_agendadas_participantes` (
  `agendamento_id` int(10) unsigned NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`agendamento_id`,`usuario_id`),
  KEY `idx_agpart_usuario` (`usuario_id`),
  CONSTRAINT `fk_agpart_agendamento` FOREIGN KEY (`agendamento_id`) REFERENCES `tb_chamadas_agendadas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agpart_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_chamadas_mensagens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_chamadas_mensagens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `chamada_id` int(10) unsigned NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `texto` varchar(1000) NOT NULL,
  `criada_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_chmsg_chamada` (`chamada_id`,`id`),
  KEY `fk_chmsg_usuario` (`usuario_id`),
  CONSTRAINT `fk_chmsg_chamada` FOREIGN KEY (`chamada_id`) REFERENCES `tb_chamadas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chmsg_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_chamadas_participantes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_chamadas_participantes` (
  `chamada_id` int(10) unsigned NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `estado` enum('convidado','tocando','na_chamada','recusou','saiu','perdeu') NOT NULL DEFAULT 'tocando',
  `entrou_em` datetime DEFAULT NULL,
  `saiu_em` datetime DEFAULT NULL,
  PRIMARY KEY (`chamada_id`,`usuario_id`),
  KEY `idx_chpart_usuario` (`usuario_id`,`estado`),
  CONSTRAINT `fk_chpart_chamada` FOREIGN KEY (`chamada_id`) REFERENCES `tb_chamadas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chpart_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_chamadas_presenca`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_chamadas_presenca` (
  `usuario_id` int(10) unsigned NOT NULL,
  `estado` enum('online','ausente') NOT NULL DEFAULT 'online',
  `nao_perturbe` tinyint(1) NOT NULL DEFAULT 0,
  `ultimo_ping` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`usuario_id`),
  CONSTRAINT `fk_presenca_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_chamadas_sinais`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_chamadas_sinais` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `chamada_id` int(10) unsigned NOT NULL,
  `de_id` int(10) unsigned NOT NULL,
  `para_id` int(10) unsigned NOT NULL,
  `tipo` enum('offer','answer','ice') NOT NULL,
  `payload` mediumtext NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_sinais_destino` (`chamada_id`,`para_id`,`id`),
  CONSTRAINT `fk_sinais_chamada` FOREIGN KEY (`chamada_id`) REFERENCES `tb_chamadas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_chat_conversas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_chat_conversas` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tipo` enum('individual','grupo','equipe') NOT NULL,
  `nome` varchar(120) DEFAULT NULL,
  `equipe_slug` varchar(40) DEFAULT NULL,
  `criado_por` int(10) unsigned NOT NULL,
  `ultima_mensagem_em` datetime NOT NULL DEFAULT current_timestamp(),
  `criada_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chat_equipe` (`equipe_slug`),
  KEY `idx_chat_conv_lista` (`tipo`,`ultima_mensagem_em`),
  KEY `fk_chat_conv_criador` (`criado_por`),
  CONSTRAINT `fk_chat_conv_criador` FOREIGN KEY (`criado_por`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_chat_participantes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_chat_participantes` (
  `conversa_id` bigint(20) unsigned NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `entrou_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`conversa_id`,`usuario_id`),
  KEY `idx_chat_part_usuario` (`usuario_id`,`conversa_id`),
  CONSTRAINT `fk_chat_part_conversa` FOREIGN KEY (`conversa_id`) REFERENCES `tb_chat_conversas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_part_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_documentos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_documentos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `atualizado_por` int(10) unsigned DEFAULT NULL,
  `nome` varchar(150) NOT NULL,
  `nome_arquivo` varchar(200) NOT NULL,
  `arquivo` varchar(80) NOT NULL,
  `extensao` varchar(10) NOT NULL,
  `mime` varchar(100) NOT NULL,
  `tamanho` int(10) unsigned NOT NULL,
  `equipe_slug` varchar(40) NOT NULL,
  `origem` varchar(20) NOT NULL DEFAULT 'upload',
  `origem_ref` varchar(80) DEFAULT NULL,
  `excluido_em` datetime DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_doc_origem` (`origem`,`origem_ref`),
  KEY `fk_doc_atualizado_por` (`atualizado_por`),
  KEY `idx_doc_lista` (`excluido_em`,`atualizado_em`),
  KEY `idx_doc_equipe` (`equipe_slug`,`excluido_em`,`atualizado_em`),
  KEY `idx_doc_dono` (`usuario_id`,`excluido_em`,`atualizado_em`),
  CONSTRAINT `fk_doc_atualizado_por` FOREIGN KEY (`atualizado_por`) REFERENCES `tb_usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_doc_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_documentos_acessos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_documentos_acessos` (
  `usuario_id` int(10) unsigned NOT NULL,
  `documento_id` bigint(20) unsigned NOT NULL,
  `acessado_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`usuario_id`,`documento_id`),
  KEY `fk_docacc_documento` (`documento_id`),
  KEY `idx_docacc_recentes` (`usuario_id`,`acessado_em`),
  CONSTRAINT `fk_docacc_documento` FOREIGN KEY (`documento_id`) REFERENCES `tb_documentos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_docacc_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_documentos_favoritos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_documentos_favoritos` (
  `usuario_id` int(10) unsigned NOT NULL,
  `documento_id` bigint(20) unsigned NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`usuario_id`,`documento_id`),
  KEY `idx_docfav_documento` (`documento_id`),
  KEY `idx_docfav_recentes` (`criado_em`),
  CONSTRAINT `fk_docfav_documento` FOREIGN KEY (`documento_id`) REFERENCES `tb_documentos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_docfav_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_equipes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_equipes` (
  `slug` varchar(40) NOT NULL,
  `nome` varchar(60) NOT NULL,
  `cor` char(7) NOT NULL,
  `descricao` varchar(300) NOT NULL DEFAULT '',
  `somente_leitura` tinyint(1) NOT NULL DEFAULT 0,
  `ordem` smallint(5) unsigned NOT NULL DEFAULT 0,
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_equipes_agendadas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_equipes_agendadas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `equipe_slug` varchar(40) NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `conteudo` text NOT NULL,
  `resposta_a` bigint(20) unsigned DEFAULT NULL,
  `enviar_em` datetime NOT NULL,
  `criada_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_eqagd_equipe` (`equipe_slug`,`enviar_em`),
  KEY `idx_eqagd_usuario` (`usuario_id`,`equipe_slug`),
  CONSTRAINT `fk_eqagd_equipe` FOREIGN KEY (`equipe_slug`) REFERENCES `tb_equipes` (`slug`) ON DELETE CASCADE,
  CONSTRAINT `fk_eqagd_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_equipes_anexos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_equipes_anexos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `mensagem_id` bigint(20) unsigned NOT NULL,
  `documento_id` bigint(20) unsigned DEFAULT NULL,
  `nome_original` varchar(255) NOT NULL,
  `extensao` varchar(10) NOT NULL,
  `mime` varchar(100) NOT NULL,
  `tamanho` int(10) unsigned NOT NULL,
  `arquivo` varchar(80) NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_eqanx_msg` (`mensagem_id`),
  CONSTRAINT `fk_eqanx_msg` FOREIGN KEY (`mensagem_id`) REFERENCES `tb_equipes_mensagens` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_equipes_fixados`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_equipes_fixados` (
  `anexo_id` bigint(20) unsigned NOT NULL,
  `equipe_slug` varchar(40) NOT NULL,
  `fixado_por` int(10) unsigned DEFAULT NULL,
  `fixado_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`anexo_id`),
  KEY `idx_eqfix_equipe` (`equipe_slug`,`fixado_em`),
  CONSTRAINT `fk_eqfix_anexo` FOREIGN KEY (`anexo_id`) REFERENCES `tb_equipes_anexos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eqfix_equipe` FOREIGN KEY (`equipe_slug`) REFERENCES `tb_equipes` (`slug`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_equipes_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_equipes_links` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `equipe_slug` varchar(40) NOT NULL,
  `rotulo` varchar(80) NOT NULL,
  `url` varchar(255) DEFAULT NULL,
  `icone` enum('doc','plano','calendario','livro') NOT NULL DEFAULT 'doc',
  `ordem` smallint(5) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_eqlnk_equipe` (`equipe_slug`,`ordem`),
  CONSTRAINT `fk_eqlnk_equipe` FOREIGN KEY (`equipe_slug`) REFERENCES `tb_equipes` (`slug`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_equipes_membros`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_equipes_membros` (
  `equipe_slug` varchar(40) NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `papel` enum('membro','admin') NOT NULL DEFAULT 'membro',
  `origem` enum('principal','solicitacao') NOT NULL DEFAULT 'principal',
  `favorita` tinyint(1) NOT NULL DEFAULT 0,
  `silenciada` tinyint(1) NOT NULL DEFAULT 0,
  `ultima_leitura_id` bigint(20) unsigned NOT NULL DEFAULT 0,
  `entrou_em` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`equipe_slug`,`usuario_id`),
  KEY `idx_eqmem_usuario` (`usuario_id`),
  CONSTRAINT `fk_eqmem_equipe` FOREIGN KEY (`equipe_slug`) REFERENCES `tb_equipes` (`slug`) ON DELETE CASCADE,
  CONSTRAINT `fk_eqmem_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_equipes_mensagens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_equipes_mensagens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `equipe_slug` varchar(40) NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `conteudo` text NOT NULL,
  `resposta_a` bigint(20) unsigned DEFAULT NULL,
  `editada_em` datetime DEFAULT NULL,
  `excluida_em` datetime DEFAULT NULL,
  `criada_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizada_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_eqmsg_canal` (`equipe_slug`,`id`),
  KEY `idx_eqmsg_sync` (`equipe_slug`,`atualizada_em`),
  KEY `fk_eqmsg_usuario` (`usuario_id`),
  CONSTRAINT `fk_eqmsg_equipe` FOREIGN KEY (`equipe_slug`) REFERENCES `tb_equipes` (`slug`) ON DELETE CASCADE,
  CONSTRAINT `fk_eqmsg_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_equipes_reacoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_equipes_reacoes` (
  `mensagem_id` bigint(20) unsigned NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `emoji` varchar(16) NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`mensagem_id`,`usuario_id`,`emoji`),
  KEY `fk_eqrea_usuario` (`usuario_id`),
  CONSTRAINT `fk_eqrea_msg` FOREIGN KEY (`mensagem_id`) REFERENCES `tb_equipes_mensagens` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eqrea_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_equipes_solicitacoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_equipes_solicitacoes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `equipe_slug` varchar(40) NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `status` enum('pendente','aceita','recusada') NOT NULL DEFAULT 'pendente',
  `solicitado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `respondido_em` datetime DEFAULT NULL,
  `respondido_por` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_eqsol_equipe` (`equipe_slug`,`status`),
  KEY `idx_eqsol_usuario` (`usuario_id`,`equipe_slug`,`status`),
  CONSTRAINT `fk_eqsol_equipe` FOREIGN KEY (`equipe_slug`) REFERENCES `tb_equipes` (`slug`) ON DELETE CASCADE,
  CONSTRAINT `fk_eqsol_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_ia_anexos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_ia_anexos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `mensagem_id` bigint(20) unsigned NOT NULL,
  `nome_original` varchar(255) NOT NULL,
  `mime` varchar(100) NOT NULL,
  `tamanho` int(10) unsigned NOT NULL,
  `arquivo` varchar(80) NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ia_anexo_mensagem` (`mensagem_id`,`id`),
  CONSTRAINT `fk_ia_anexo_mensagem` FOREIGN KEY (`mensagem_id`) REFERENCES `tb_ia_mensagens` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_ia_conversas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_ia_conversas` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `titulo` varchar(120) NOT NULL DEFAULT 'Nova conversa',
  `equipe_slug` varchar(40) DEFAULT NULL,
  `fixada` tinyint(1) NOT NULL DEFAULT 0,
  `arquivada` tinyint(1) NOT NULL DEFAULT 0,
  `excluida_em` datetime DEFAULT NULL,
  `ultima_mensagem_em` datetime NOT NULL DEFAULT current_timestamp(),
  `criada_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizada_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ia_conv_lista` (`usuario_id`,`excluida_em`,`arquivada`,`fixada`,`ultima_mensagem_em`),
  CONSTRAINT `fk_ia_conv_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_ia_mensagens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_ia_mensagens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `conversa_id` bigint(20) unsigned NOT NULL,
  `papel` enum('usuario','ia') NOT NULL,
  `conteudo` mediumtext NOT NULL,
  `feedback` enum('util','nao_util') DEFAULT NULL,
  `criada_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ia_msg_conversa` (`conversa_id`,`criada_em`,`id`),
  CONSTRAINT `fk_ia_msg_conversa` FOREIGN KEY (`conversa_id`) REFERENCES `tb_ia_conversas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=51 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_loja_categorias`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_loja_categorias` (
  `id` varchar(20) NOT NULL,
  `nome` varchar(60) NOT NULL,
  `ordem` smallint(5) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_loja_cupons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_loja_cupons` (
  `codigo` varchar(30) NOT NULL,
  `tipo` enum('percent','valor') NOT NULL DEFAULT 'percent',
  `valor` decimal(10,2) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `valido_ate` datetime DEFAULT NULL,
  `usos_max` int(10) unsigned DEFAULT NULL,
  `usos` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_loja_frete_opcoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_loja_frete_opcoes` (
  `regiao` varchar(12) NOT NULL,
  `opcao` varchar(12) NOT NULL,
  `nome` varchar(60) NOT NULL,
  `preco` decimal(10,2) NOT NULL,
  `prazo_min` tinyint(3) unsigned NOT NULL,
  `prazo_max` tinyint(3) unsigned NOT NULL,
  PRIMARY KEY (`regiao`,`opcao`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_loja_frete_regioes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_loja_frete_regioes` (
  `uf` char(2) NOT NULL,
  `regiao` varchar(12) NOT NULL,
  PRIMARY KEY (`uf`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_loja_pagamentos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_loja_pagamentos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `pedido_id` bigint(20) unsigned NOT NULL,
  `preference_id` varchar(80) DEFAULT NULL,
  `mp_payment_id` varchar(40) DEFAULT NULL,
  `init_point` varchar(255) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'pending',
  `metodo` varchar(30) DEFAULT NULL,
  `valor` decimal(10,2) NOT NULL,
  `pago_em` datetime DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pag_mp` (`mp_payment_id`),
  KEY `idx_pag_pedido` (`pedido_id`),
  CONSTRAINT `fk_pag_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `tb_loja_pedidos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_loja_pedido_itens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_loja_pedido_itens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `pedido_id` bigint(20) unsigned NOT NULL,
  `produto_id` varchar(20) NOT NULL,
  `titulo` varchar(150) NOT NULL,
  `quantidade` tinyint(3) unsigned NOT NULL,
  `preco_unit` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_item_pedido` (`pedido_id`),
  KEY `fk_item_produto` (`produto_id`),
  CONSTRAINT `fk_item_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `tb_loja_pedidos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_item_produto` FOREIGN KEY (`produto_id`) REFERENCES `tb_loja_produtos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_loja_pedidos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_loja_pedidos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `unidade_id` int(10) unsigned DEFAULT NULL,
  `status` enum('aguardando_pagamento','pago','enviado','entregue','cancelado','recusado','reembolsado') NOT NULL DEFAULT 'aguardando_pagamento',
  `email` varchar(150) NOT NULL,
  `nome` varchar(80) NOT NULL,
  `sobrenome` varchar(80) NOT NULL,
  `telefone` varchar(15) DEFAULT NULL,
  `documento` varchar(14) NOT NULL,
  `cep` char(8) NOT NULL,
  `endereco` varchar(150) NOT NULL,
  `numero` varchar(10) NOT NULL,
  `complemento` varchar(80) DEFAULT NULL,
  `bairro` varchar(100) NOT NULL,
  `cidade` varchar(100) NOT NULL,
  `uf` char(2) NOT NULL,
  `frete_opcao` varchar(12) NOT NULL,
  `frete_nome` varchar(60) NOT NULL,
  `frete_valor` decimal(10,2) NOT NULL DEFAULT 0.00,
  `frete_prazo_min` tinyint(3) unsigned DEFAULT NULL,
  `frete_prazo_max` tinyint(3) unsigned DEFAULT NULL,
  `cupom_codigo` varchar(30) DEFAULT NULL,
  `desconto` decimal(10,2) NOT NULL DEFAULT 0.00,
  `subtotal` decimal(10,2) NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `codigo_rastreio` varchar(40) DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ped_usuario` (`usuario_id`,`criado_em`),
  KEY `idx_ped_status` (`status`),
  KEY `fk_ped_unidade` (`unidade_id`),
  CONSTRAINT `fk_ped_unidade` FOREIGN KEY (`unidade_id`) REFERENCES `tb_unidades` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ped_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_loja_produtos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_loja_produtos` (
  `id` varchar(20) NOT NULL,
  `categoria_id` varchar(20) NOT NULL,
  `nome` varchar(150) NOT NULL,
  `descricao` varchar(500) NOT NULL DEFAULT '',
  `preco` decimal(10,2) NOT NULL,
  `estoque` int(10) unsigned NOT NULL DEFAULT 0,
  `imagem` varchar(120) DEFAULT NULL,
  `max_por_pedido` tinyint(3) unsigned NOT NULL DEFAULT 3,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_prod_cat` (`categoria_id`,`ativo`),
  CONSTRAINT `fk_prod_cat` FOREIGN KEY (`categoria_id`) REFERENCES `tb_loja_categorias` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_loja_saldos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_loja_saldos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `unidade_id` int(10) unsigned DEFAULT NULL,
  `saldo` decimal(12,2) NOT NULL DEFAULT 0.00,
  `atualizado_em` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_saldo_unidade` (`unidade_id`),
  CONSTRAINT `fk_saldo_unid` FOREIGN KEY (`unidade_id`) REFERENCES `tb_unidades` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_reunioes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_reunioes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `organizador_id` int(10) unsigned NOT NULL,
  `titulo` varchar(150) NOT NULL,
  `descricao` varchar(1000) DEFAULT NULL,
  `data_reuniao` date NOT NULL,
  `hora_inicio` time NOT NULL,
  `hora_fim` time NOT NULL,
  `fuso_horario` varchar(50) NOT NULL DEFAULT 'America/Sao_Paulo',
  `equipe_slug` varchar(40) NOT NULL DEFAULT 'geral',
  `recorrente` tinyint(1) NOT NULL DEFAULT 0,
  `recorrencia_frequencia` enum('diaria','semanal','mensal','personalizada') DEFAULT NULL,
  `recorrencia_dias` varchar(20) DEFAULT NULL,
  `recorrencia_termino_tipo` enum('nunca','data','ocorrencias') DEFAULT NULL,
  `recorrencia_termino_data` date DEFAULT NULL,
  `recorrencia_ocorrencias` smallint(5) unsigned DEFAULT NULL,
  `status` enum('agendada','cancelada') NOT NULL DEFAULT 'agendada',
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_reuniao_organizador` (`organizador_id`,`status`,`data_reuniao`),
  KEY `idx_reuniao_data` (`data_reuniao`,`hora_inicio`),
  KEY `idx_reuniao_equipe` (`equipe_slug`,`data_reuniao`),
  CONSTRAINT `fk_reuniao_organizador` FOREIGN KEY (`organizador_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_reunioes_participantes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_reunioes_participantes` (
  `reuniao_id` bigint(20) unsigned NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`reuniao_id`,`usuario_id`),
  KEY `idx_reupart_usuario` (`usuario_id`,`reuniao_id`),
  CONSTRAINT `fk_reupart_reuniao` FOREIGN KEY (`reuniao_id`) REFERENCES `tb_reunioes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reupart_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_solicitacoes_acesso`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_solicitacoes_acesso` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nome` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `senha_hash` varchar(255) NOT NULL,
  `telefone` varchar(15) NOT NULL,
  `cpf` char(11) NOT NULL,
  `data_nascimento` date NOT NULL,
  `genero` enum('masculino','feminino','outro','prefiro_nao_informar') NOT NULL,
  `genero_outro` varchar(100) DEFAULT NULL,
  `equipe_solicitada` varchar(40) NOT NULL DEFAULT 'geral',
  `status` enum('pendente','aceita','recusada') NOT NULL DEFAULT 'pendente',
  `solicitado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `respondido_em` datetime DEFAULT NULL,
  `respondido_por` int(10) unsigned DEFAULT NULL,
  `usuario_criado_id` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_solicitacoes_status` (`status`,`solicitado_em`),
  KEY `fk_solicitacoes_respondido_por` (`respondido_por`),
  KEY `fk_solicitacoes_usuario_criado` (`usuario_criado_id`),
  CONSTRAINT `fk_solicitacoes_respondido_por` FOREIGN KEY (`respondido_por`) REFERENCES `tb_usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_solicitacoes_usuario_criado` FOREIGN KEY (`usuario_criado_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_unidade_avisos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_unidade_avisos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `unidade_id` int(10) unsigned NOT NULL,
  `titulo` varchar(150) NOT NULL,
  `descricao` varchar(500) NOT NULL,
  `tipo` enum('comunicado','manutencao','evento','horario','treinamento') NOT NULL DEFAULT 'comunicado',
  `importante` tinyint(1) NOT NULL DEFAULT 0,
  `publicado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `expira_em` datetime DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_unidade_avisos_lista` (`unidade_id`,`ativo`,`publicado_em`),
  CONSTRAINT `fk_unidade_avisos_unidade` FOREIGN KEY (`unidade_id`) REFERENCES `tb_unidades` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_unidade_contatos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_unidade_contatos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `unidade_id` int(10) unsigned NOT NULL,
  `setor` enum('rh','ti','administrativo','facilities') NOT NULL,
  `nome` varchar(150) NOT NULL,
  `cargo` varchar(100) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `telefone` varchar(20) DEFAULT NULL,
  `ordem` smallint(5) unsigned NOT NULL DEFAULT 0,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_unidade_contatos_unidade` (`unidade_id`,`setor`,`ativo`),
  CONSTRAINT `fk_unidade_contatos_unidade` FOREIGN KEY (`unidade_id`) REFERENCES `tb_unidades` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_unidades`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_unidades` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nome` varchar(120) NOT NULL,
  `endereco` varchar(150) NOT NULL,
  `numero` varchar(20) NOT NULL,
  `bairro` varchar(100) NOT NULL,
  `cidade` varchar(100) NOT NULL,
  `estado` char(2) NOT NULL,
  `telefone` varchar(20) NOT NULL,
  `horario_funcionamento` varchar(120) NOT NULL,
  `responsavel_nome` varchar(150) DEFAULT NULL,
  `responsavel_cargo` varchar(100) DEFAULT NULL,
  `status` enum('ativa','inativa') NOT NULL DEFAULT 'ativa',
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_usuario_preferencias`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_usuario_preferencias` (
  `usuario_id` int(10) unsigned NOT NULL,
  `dados` longtext NOT NULL,
  `atualizado_em` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`usuario_id`),
  CONSTRAINT `fk_preferencias_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_usuario_sessoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_usuario_sessoes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `token_hash` char(64) NOT NULL,
  `dispositivo` varchar(20) NOT NULL DEFAULT 'desktop',
  `navegador` varchar(60) NOT NULL DEFAULT '',
  `sistema` varchar(60) NOT NULL DEFAULT '',
  `ip` varchar(45) NOT NULL DEFAULT '',
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `ultimo_acesso` datetime NOT NULL DEFAULT current_timestamp(),
  `encerrada_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sessoes_token` (`token_hash`),
  KEY `idx_sessoes_usuario` (`usuario_id`,`encerrada_em`,`ultimo_acesso`),
  CONSTRAINT `fk_sessoes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_usuarios` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nome` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `senha_hash` varchar(255) NOT NULL,
  `telefone` varchar(15) NOT NULL,
  `cpf` char(11) NOT NULL,
  `data_nascimento` date NOT NULL,
  `genero` enum('masculino','feminino','outro','prefiro_nao_informar') NOT NULL,
  `genero_outro` varchar(100) DEFAULT NULL,
  `unidade_id` int(10) unsigned DEFAULT NULL,
  `equipe_slug` varchar(40) DEFAULT NULL,
  `cargo` enum('estagiario','funcionario','supervisor','coordenador','gerente','diretor','ceo') NOT NULL DEFAULT 'funcionario',
  `status` enum('ativo','inativo') NOT NULL DEFAULT 'ativo',
  `foto_arquivo` varchar(120) DEFAULT NULL,
  `idioma` varchar(10) NOT NULL DEFAULT 'pt-BR',
  `fuso_horario` varchar(40) NOT NULL DEFAULT 'America/Sao_Paulo',
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuarios_email` (`email`),
  UNIQUE KEY `uq_usuarios_cpf` (`cpf`),
  KEY `fk_usuarios_unidade` (`unidade_id`),
  CONSTRAINT `fk_usuarios_unidade` FOREIGN KEY (`unidade_id`) REFERENCES `tb_unidades` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tb_usuarios_presenca`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tb_usuarios_presenca` (
  `usuario_id` int(10) unsigned NOT NULL,
  `status` enum('auto','reuniao','ausente') NOT NULL DEFAULT 'auto',
  `visto_em` datetime DEFAULT NULL,
  `digitando_equipe` varchar(40) DEFAULT NULL,
  `digitando_em` datetime DEFAULT NULL,
  PRIMARY KEY (`usuario_id`),
  CONSTRAINT `fk_eqpresenca_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

