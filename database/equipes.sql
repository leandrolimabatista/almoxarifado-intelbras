-- =====================================================================
-- Intelbras — Portal | Módulo "Equipes" (chat estilo Teams)
--
-- COMO APLICAR (phpMyAdmin):
--   1. Rode ANTES: database/schema.sql, usuarios_admin.sql, usuarios_cargo.sql
--      (e, para o anexo virar documento, documentos.sql + documentos_chat.sql).
--   2. Clique no banco  bd_intelbras  > aba "SQL", cole TODO este arquivo
--      e clique em "Executar". Pode rodar mais de uma vez (IF NOT EXISTS / IGNORE).
--
-- REGRA DE ACESSO (definida no código, api/equipes/_bootstrap.php):
--   é MEMBRO da equipe quem tem  tb_usuarios.equipe_slug = <equipe>  (equipe
--   principal, definida na tela "Editar usuário") OU quem teve um pedido de
--   acesso aceito (tb_equipes_membros.origem = 'solicitacao').
--   Não existe lista duplicada de membros para manter: mudou a equipe do
--   usuário na tela Usuários, o acesso ao chat muda junto.
-- =====================================================================

USE bd_intelbras;

-- ---------------------------------------------------------------------
-- Equipes (mesmos slugs do menu lateral, do Documentos e da IA)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tb_equipes (
  slug            VARCHAR(40)  NOT NULL,
  nome            VARCHAR(60)  NOT NULL,
  cor             CHAR(7)      NOT NULL,                -- bolinha do menu lateral
  descricao       VARCHAR(300) NOT NULL DEFAULT '',     -- "Sobre este canal"
  somente_leitura TINYINT(1)   NOT NULL DEFAULT 0,      -- 1 = só administradores escrevem
  ordem           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  criado_em       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO tb_equipes (slug, nome, cor, descricao, ordem) VALUES
('geral',      'Geral',           '#00A859', 'Conversas da equipe Geral.\nUtilize este canal para alinhamentos, comunicados e para trocar ideias com toda a equipe.', 1),
('projetos',   'Projetos',        '#3B82F6', 'Conversas da equipe Projetos.\nAcompanhe entregas, prazos e decisões dos projetos em andamento.', 2),
('marketing',  'Marketing',       '#F59E0B', 'Conversas da equipe Marketing.\nCampanhas, materiais e alinhamentos de comunicação.', 3),
('rh',         'RH',              '#8B5CF6', 'Conversas da equipe RH.\nBenefícios, comunicados internos e dúvidas de pessoas e cultura.', 4),
('financeiro', 'Financeiro',      '#EC4899', 'Conversas da equipe Financeiro.\nFechamentos, orçamentos e alinhamentos da área.', 5),
('ti',         'TI',              '#0EA5E9', 'Conversas da equipe TI.\nSuporte interno, acessos, segurança e infraestrutura.', 6),
('sac',        'SAC / Ouvidoria', '#EF4444', 'Conversas da equipe SAC / Ouvidoria.\nAtendimento, tratativas e melhoria contínua da experiência do cliente.', 7);

-- ---------------------------------------------------------------------
-- Preferências e leitura de cada membro em cada equipe
--   origem = 'principal'   : linha criada sozinha para a equipe do usuário
--                            (só guarda favorita/silenciada/leitura)
--   origem = 'solicitacao' : acesso concedido por pedido aceito (dá acesso)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tb_equipes_membros (
  equipe_slug       VARCHAR(40)      NOT NULL,
  usuario_id        INT UNSIGNED     NOT NULL,
  papel             ENUM('membro','admin') NOT NULL DEFAULT 'membro',
  origem            ENUM('principal','solicitacao') NOT NULL DEFAULT 'principal',
  favorita          TINYINT(1)       NOT NULL DEFAULT 0,
  silenciada        TINYINT(1)       NOT NULL DEFAULT 0,
  ultima_leitura_id BIGINT UNSIGNED  NOT NULL DEFAULT 0,  -- última mensagem vista (badge, "Novas mensagens", ✔✔)
  entrou_em         TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (equipe_slug, usuario_id),
  KEY idx_eqmem_usuario (usuario_id),
  CONSTRAINT fk_eqmem_equipe  FOREIGN KEY (equipe_slug) REFERENCES tb_equipes (slug)   ON DELETE CASCADE,
  CONSTRAINT fk_eqmem_usuario FOREIGN KEY (usuario_id)  REFERENCES tb_usuarios (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Mensagens do canal
--   atualizada_em muda a cada edição/exclusão/reação/fixação: é o que
--   permite ao navegador (polling) receber também as alterações de
--   mensagens antigas, não só as novas.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tb_equipes_mensagens (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  equipe_slug   VARCHAR(40)     NOT NULL,
  usuario_id    INT UNSIGNED    NOT NULL,
  conteudo      TEXT            NOT NULL,
  resposta_a    BIGINT UNSIGNED NULL,                -- mensagem citada
  editada_em    DATETIME        NULL,
  excluida_em   DATETIME        NULL,                -- exclusão lógica ("Esta mensagem foi apagada")
  criada_em     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizada_em DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eqmsg_canal (equipe_slug, id),
  KEY idx_eqmsg_sync  (equipe_slug, atualizada_em),
  CONSTRAINT fk_eqmsg_equipe  FOREIGN KEY (equipe_slug) REFERENCES tb_equipes (slug) ON DELETE CASCADE,
  CONSTRAINT fk_eqmsg_usuario FOREIGN KEY (usuario_id)  REFERENCES tb_usuarios (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Anexos (o chat guarda a sua cópia; se o formato for aceito pelo módulo
-- Documentos, também vira documento da equipe: documento_id)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tb_equipes_anexos (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mensagem_id   BIGINT UNSIGNED NOT NULL,
  documento_id  BIGINT UNSIGNED NULL,
  nome_original VARCHAR(255)    NOT NULL,
  extensao      VARCHAR(10)     NOT NULL,
  mime          VARCHAR(100)    NOT NULL,
  tamanho       INT UNSIGNED    NOT NULL,
  arquivo       VARCHAR(80)     NOT NULL,            -- nome no disco (gerado pelo servidor)
  criado_em     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eqanx_msg (mensagem_id),
  CONSTRAINT fk_eqanx_msg FOREIGN KEY (mensagem_id) REFERENCES tb_equipes_mensagens (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reações (👍 4, 🙌 2 ...): uma linha por usuário + emoji
CREATE TABLE IF NOT EXISTS tb_equipes_reacoes (
  mensagem_id BIGINT UNSIGNED NOT NULL,
  usuario_id  INT UNSIGNED    NOT NULL,
  emoji       VARCHAR(16)     NOT NULL,
  criado_em   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mensagem_id, usuario_id, emoji),
  CONSTRAINT fk_eqrea_msg     FOREIGN KEY (mensagem_id) REFERENCES tb_equipes_mensagens (id) ON DELETE CASCADE,
  CONSTRAINT fk_eqrea_usuario FOREIGN KEY (usuario_id)  REFERENCES tb_usuarios (id)          ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Arquivos fixados no painel "Arquivos fixados"
CREATE TABLE IF NOT EXISTS tb_equipes_fixados (
  anexo_id    BIGINT UNSIGNED NOT NULL,
  equipe_slug VARCHAR(40)     NOT NULL,
  fixado_por  INT UNSIGNED    NULL,
  fixado_em   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (anexo_id),
  KEY idx_eqfix_equipe (equipe_slug, fixado_em),
  CONSTRAINT fk_eqfix_anexo  FOREIGN KEY (anexo_id)    REFERENCES tb_equipes_anexos (id) ON DELETE CASCADE,
  CONSTRAINT fk_eqfix_equipe FOREIGN KEY (equipe_slug) REFERENCES tb_equipes (slug)       ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Links úteis" do painel direito (url NULL = ainda sem destino)
CREATE TABLE IF NOT EXISTS tb_equipes_links (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  equipe_slug VARCHAR(40)  NOT NULL,
  rotulo      VARCHAR(80)  NOT NULL,
  url         VARCHAR(255) NULL,
  icone       ENUM('doc','plano','calendario','livro') NOT NULL DEFAULT 'doc',
  ordem       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_eqlnk_equipe (equipe_slug, ordem),
  CONSTRAINT fk_eqlnk_equipe FOREIGN KEY (equipe_slug) REFERENCES tb_equipes (slug) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tb_equipes_links (equipe_slug, rotulo, url, icone, ordem)
SELECT e.slug, l.rotulo, l.url, l.icone, l.ordem
FROM tb_equipes e
JOIN (
  SELECT 'Documentos da equipe' AS rotulo, 'index.php?pagina=documentos' AS url, 'doc' AS icone, 1 AS ordem
  UNION ALL SELECT 'Planejamento 2026',     NULL, 'plano',      2
  UNION ALL SELECT 'Calendário da equipe',  NULL, 'calendario', 3
  UNION ALL SELECT 'Diretrizes Intelbras',  NULL, 'livro',      4
) l
WHERE NOT EXISTS (SELECT 1 FROM tb_equipes_links x WHERE x.equipe_slug = e.slug);

-- Pedidos de acesso de quem não é da equipe ("Solicitar acesso")
CREATE TABLE IF NOT EXISTS tb_equipes_solicitacoes (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  equipe_slug   VARCHAR(40)  NOT NULL,
  usuario_id    INT UNSIGNED NOT NULL,
  status        ENUM('pendente','aceita','recusada') NOT NULL DEFAULT 'pendente',
  solicitado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  respondido_em DATETIME     NULL,
  respondido_por INT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_eqsol_equipe (equipe_slug, status),
  KEY idx_eqsol_usuario (usuario_id, equipe_slug, status),
  CONSTRAINT fk_eqsol_equipe  FOREIGN KEY (equipe_slug) REFERENCES tb_equipes (slug) ON DELETE CASCADE,
  CONSTRAINT fk_eqsol_usuario FOREIGN KEY (usuario_id)  REFERENCES tb_usuarios (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Agendar envio": a mensagem espera aqui e é publicada (nova linha em
-- tb_equipes_mensagens) na primeira consulta ao canal depois do horário.
CREATE TABLE IF NOT EXISTS tb_equipes_agendadas (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  equipe_slug VARCHAR(40)     NOT NULL,
  usuario_id  INT UNSIGNED    NOT NULL,
  conteudo    TEXT            NOT NULL,
  resposta_a  BIGINT UNSIGNED NULL,
  enviar_em   DATETIME        NOT NULL,
  criada_em   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eqagd_equipe (equipe_slug, enviar_em),
  KEY idx_eqagd_usuario (usuario_id, equipe_slug),
  CONSTRAINT fk_eqagd_equipe  FOREIGN KEY (equipe_slug) REFERENCES tb_equipes (slug) ON DELETE CASCADE,
  CONSTRAINT fk_eqagd_usuario FOREIGN KEY (usuario_id)  REFERENCES tb_usuarios (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Presença (Online / Em reunião / Ausente / Offline) e "digitando…"
--   status: 'auto' = calculado pelo último sinal de vida (visto_em);
--           'reuniao' / 'ausente' = definido manualmente.
CREATE TABLE IF NOT EXISTS tb_usuarios_presenca (
  usuario_id       INT UNSIGNED NOT NULL,
  status           ENUM('auto','reuniao','ausente') NOT NULL DEFAULT 'auto',
  visto_em         DATETIME     NULL,
  digitando_equipe VARCHAR(40)  NULL,
  digitando_em     DATETIME     NULL,
  PRIMARY KEY (usuario_id),
  CONSTRAINT fk_eqpresenca_usuario FOREIGN KEY (usuario_id) REFERENCES tb_usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
