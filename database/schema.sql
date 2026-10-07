-- ============================================================
-- Intelbras — Banco de dados de Cadastro de Usuário
-- MySQL 5.7+ / 8.x
-- ============================================================

CREATE DATABASE IF NOT EXISTS bd_intelbras
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE bd_intelbras;

-- ------------------------------------------------------------
-- Tabela: tb_usuarios
-- Guarda os dados do formulário de cadastro (cabecalho.html)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tb_usuarios (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,

  nome              VARCHAR(150)    NOT NULL,
  email             VARCHAR(150)    NOT NULL,
  senha_hash        VARCHAR(255)    NOT NULL,        -- nunca guardar senha em texto puro
  telefone          VARCHAR(15)     NOT NULL,        -- só dígitos, ex.: 11999998888
  cpf               CHAR(11)        NOT NULL,        -- só dígitos, ex.: 12345678900
  data_nascimento   DATE            NOT NULL,

  genero            ENUM('masculino','feminino','outro','prefiro_nao_informar') NOT NULL,
  genero_outro      VARCHAR(100)    NULL,            -- preenchido só quando genero = 'outro'

  criado_em         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email),
  UNIQUE KEY uq_usuarios_telefone (telefone),
  UNIQUE KEY uq_usuarios_cpf (cpf)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Se a tabela já existir sem essa restrição (ex.: você criou
-- antes desta atualização), rode este ALTER TABLE manualmente:
--
-- ALTER TABLE tb_usuarios ADD UNIQUE KEY uq_usuarios_telefone (telefone);
-- ------------------------------------------------------------
