-- =====================================================================
-- Intelbras — Portal | Módulo "Documentos"
-- Tabelas de documentos, favoritos e acessos
--
-- Compatível com o schema existente do projeto (database/schema.sql):
--   banco:    bd_intelbras
--   usuários: tb_usuarios (id INT UNSIGNED)
--   engine:   InnoDB / utf8mb4 / utf8mb4_unicode_ci
--
-- COMO APLICAR (phpMyAdmin):
--   1. Abra o phpMyAdmin e clique no banco  bd_intelbras  (menu à esquerda).
--   2. Clique na aba "SQL".
--   3. Cole TODO o conteúdo deste arquivo e clique em "Executar".
--   4. Deve aparecer "3 tabelas criadas" (tb_documentos, tb_documentos_favoritos,
--      tb_documentos_acessos). Pode rodar de novo sem problema: usa
--      CREATE TABLE IF NOT EXISTS e não altera nem apaga nada existente.
--
-- Rode DEPOIS do database/schema.sql (a tabela tb_usuarios precisa existir).
-- Este arquivo NÃO altera as tabelas tb_usuarios nem tb_ia_*.
-- =====================================================================

USE bd_intelbras;

-- ---------------------------------------------------------------------
-- Documentos
-- ---------------------------------------------------------------------
-- usuario_id      : quem enviou (dono). Só o dono renomeia / exclui.
-- atualizado_por  : quem alterou por último (coluna "Atualizado por").
-- nome            : título exibido na tabela (editável).
-- nome_arquivo    : nome ORIGINAL do arquivo enviado (usado ao baixar).
-- arquivo         : nome do arquivo no disco (gerado pelo servidor: hex
--                   aleatório + extensão). A pasta fica FORA do htdocs —
--                   ver api/documentos/_bootstrap.php (doc_dir_arquivos()).
-- equipe_slug     : geral | projetos | marketing | rh | financeiro | ti | sac
--                   (as equipes são fixas no menu lateral; não existe
--                   tb_equipes — mesmo critério de tb_ia_conversas.equipe_slug).
-- excluido_em     : lixeira (soft delete). NULL = documento ativo.
-- atualizado_em   : controlado pelo PHP (NOW() ao enviar/renomear). Não usa
--                   ON UPDATE CURRENT_TIMESTAMP de propósito: mover para a
--                   lixeira ou restaurar NÃO deve mudar a data "Atualizado em".
CREATE TABLE IF NOT EXISTS tb_documentos (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id      INT UNSIGNED    NOT NULL,
  atualizado_por  INT UNSIGNED    NULL,
  nome            VARCHAR(150)    NOT NULL,
  nome_arquivo    VARCHAR(200)    NOT NULL,
  arquivo         VARCHAR(80)     NOT NULL,
  extensao        VARCHAR(10)     NOT NULL,
  mime            VARCHAR(100)    NOT NULL,
  tamanho         INT UNSIGNED    NOT NULL,              -- bytes
  equipe_slug     VARCHAR(40)     NOT NULL,
  excluido_em     DATETIME        NULL,
  criado_em       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_doc_usuario FOREIGN KEY (usuario_id)
    REFERENCES tb_usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_atualizado_por FOREIGN KEY (atualizado_por)
    REFERENCES tb_usuarios (id) ON DELETE SET NULL,
  INDEX idx_doc_lista  (excluido_em, atualizado_em),
  INDEX idx_doc_equipe (equipe_slug, excluido_em, atualizado_em),
  INDEX idx_doc_dono   (usuario_id, excluido_em, atualizado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Favoritos (POR USUÁRIO: favoritar é pessoal, não afeta os colegas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tb_documentos_favoritos (
  usuario_id    INT UNSIGNED    NOT NULL,
  documento_id  BIGINT UNSIGNED NOT NULL,
  criado_em     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (usuario_id, documento_id),
  CONSTRAINT fk_docfav_usuario FOREIGN KEY (usuario_id)
    REFERENCES tb_usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_docfav_documento FOREIGN KEY (documento_id)
    REFERENCES tb_documentos (id) ON DELETE CASCADE,
  INDEX idx_docfav_documento (documento_id),
  INDEX idx_docfav_recentes (criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Acessos (último acesso de cada usuário a cada documento — alimenta o
-- card "Acessados recentemente", que conta os últimos 7 dias)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tb_documentos_acessos (
  usuario_id    INT UNSIGNED    NOT NULL,
  documento_id  BIGINT UNSIGNED NOT NULL,
  acessado_em   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (usuario_id, documento_id),
  CONSTRAINT fk_docacc_usuario FOREIGN KEY (usuario_id)
    REFERENCES tb_usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_docacc_documento FOREIGN KEY (documento_id)
    REFERENCES tb_documentos (id) ON DELETE CASCADE,
  INDEX idx_docacc_recentes (usuario_id, acessado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- OBSERVAÇÕES
-- =====================================================================
-- "Atividade recente" NÃO tem tabela própria: é montada por consulta a partir
-- de tb_documentos (criado_em / atualizado_em) e tb_documentos_favoritos
-- (criado_em) — ver api/documentos/listar.php.
--
-- Não existe tb_equipes nem tabela de membros: hoje TODO usuário logado vê os
-- documentos de TODAS as equipes. Se no futuro cada equipe tiver membros, o
-- filtro de acesso entra nas consultas de api/documentos/*.php.
