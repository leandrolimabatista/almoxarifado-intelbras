-- =====================================================================
-- Intelbras — Portal | Página "Minha Unidade"
-- Estrutura isolada da área Unidade (não altera nenhuma tabela existente)
--
--   banco:   bd_intelbras
--   engine:  InnoDB / utf8mb4 / utf8mb4_unicode_ci
--
-- COMO APLICAR: rode este arquivo uma única vez (phpMyAdmin > Importar,
--   ou "mysql -u root bd_intelbras < database/unidade.sql").
--   É seguro rodar de novo: usa CREATE TABLE IF NOT EXISTS e só cadastra
--   a unidade Lapa Tito se a tabela ainda estiver vazia.
--
-- Por enquanto existe SOMENTE UMA unidade (Lapa Tito). As tabelas de
-- contatos e avisos ficam VAZIAS de propósito: a página mostra
-- "Contato não cadastrado" / "Nenhum aviso no momento" até você cadastrar.
-- =====================================================================

USE bd_intelbras;
SET NAMES utf8mb4;   -- garante os acentos corretos independente do cliente que importar o arquivo

-- ---------------------------------------------------------------------
-- Unidade
-- responsavel_nome / responsavel_cargo: opcionais. Enquanto forem NULL,
--   o card "Responsável pela unidade" exibe "Não informado".
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tb_unidades (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome                   VARCHAR(120) NOT NULL,
  endereco               VARCHAR(150) NOT NULL,          -- rua/avenida, sem número
  numero                 VARCHAR(20)  NOT NULL,
  bairro                 VARCHAR(100) NOT NULL,
  cidade                 VARCHAR(100) NOT NULL,
  estado                 CHAR(2)      NOT NULL,
  telefone               VARCHAR(20)  NOT NULL,          -- como exibido: (48) 2106 0006
  horario_funcionamento  VARCHAR(120) NOT NULL,          -- ex.: Segunda a sexta, das 08h às 18h
  responsavel_nome       VARCHAR(150) NULL,
  responsavel_cargo      VARCHAR(100) NULL,
  status                 ENUM('ativa','inativa') NOT NULL DEFAULT 'ativa',
  criado_em              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Contatos da unidade (1 card por setor na página)
-- setor: rh | ti | administrativo | facilities
-- O botão "Entrar em contato" usa email (mailto:) e, se não houver,
--   telefone (tel:). Sem nenhum dos dois, o botão fica desabilitado.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tb_unidade_contatos (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  unidade_id   INT UNSIGNED NOT NULL,
  setor        ENUM('rh','ti','administrativo','facilities') NOT NULL,
  nome         VARCHAR(150) NOT NULL,
  cargo        VARCHAR(100) NULL,
  email        VARCHAR(150) NULL,
  telefone     VARCHAR(20)  NULL,
  ordem        SMALLINT UNSIGNED NOT NULL DEFAULT 0,      -- menor = aparece primeiro
  ativo        TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_unidade_contatos_unidade (unidade_id, setor, ativo),
  CONSTRAINT fk_unidade_contatos_unidade
    FOREIGN KEY (unidade_id) REFERENCES tb_unidades (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Avisos da unidade
-- tipo: comunicado | manutencao | evento | horario | treinamento (define o ícone)
-- importante = 1 mostra o selo "Importante" e leva o aviso ao topo.
-- expira_em NULL = não expira. A página mostra no máximo 5 avisos.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tb_unidade_avisos (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  unidade_id    INT UNSIGNED NOT NULL,
  titulo        VARCHAR(150) NOT NULL,
  descricao     VARCHAR(500) NOT NULL,
  tipo          ENUM('comunicado','manutencao','evento','horario','treinamento')
                  NOT NULL DEFAULT 'comunicado',
  importante    TINYINT(1)   NOT NULL DEFAULT 0,
  publicado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em     DATETIME     NULL,
  ativo         TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_unidade_avisos_lista (unidade_id, ativo, publicado_em),
  CONSTRAINT fk_unidade_avisos_unidade
    FOREIGN KEY (unidade_id) REFERENCES tb_unidades (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Dados iniciais: SOMENTE a unidade Lapa Tito (só entra se a tabela estiver vazia)
-- ---------------------------------------------------------------------
INSERT INTO tb_unidades
  (nome, endereco, numero, bairro, cidade, estado, telefone, horario_funcionamento, status)
SELECT
  'Intelbras — Lapa Tito', 'Rua Tito', '1280', 'Vila Romana', 'São Paulo', 'SP',
  '(48) 2106 0006', 'Segunda a sexta, das 08h às 18h', 'ativa'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM tb_unidades);
