-- =====================================================================
-- Intelbras — Portal | Módulo "Agendar reunião"
-- Tabelas de reuniões e participantes
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
--   4. Devem aparecer 2 tabelas criadas (tb_reunioes, tb_reunioes_participantes).
--      Pode rodar de novo sem problema: usa CREATE TABLE IF NOT EXISTS e não
--      altera nem apaga nada existente.
--
-- Rode DEPOIS do database/schema.sql e do database/usuarios_admin.sql
-- (a tabela tb_usuarios precisa existir). Este arquivo NÃO altera nenhuma
-- tabela existente.
-- =====================================================================

USE bd_intelbras;

-- ---------------------------------------------------------------------
-- Reuniões
-- ---------------------------------------------------------------------
-- organizador_id  : quem agendou (dono da reunião).
-- titulo          : "Título da reunião" (obrigatório, até 150 caracteres).
-- descricao       : pauta / detalhes / links (até 1000 caracteres, igual ao
--                   contador "0/1000" da tela).
-- data_reuniao    : dia da reunião (no fuso escolhido).
-- hora_inicio/fim : horário da reunião, também no fuso escolhido (fim > início).
-- fuso_horario    : identificador IANA, ex.: America/Sao_Paulo (padrão "Brasília").
-- equipe_slug     : geral | projetos | marketing | rh | financeiro | ti | sac
--                   (as equipes são fixas no menu lateral; não existe
--                   tb_equipes — mesmo critério de tb_documentos.equipe_slug).
-- recorrente      : 1 = "Repetir reunião" marcado. Os campos recorrencia_*
--                   só são usados quando recorrente = 1.
-- recorrencia_dias: dias da semana separados por vírgula, 0 = domingo ...
--                   6 = sábado (ex.: "1,3,5" = seg, qua, sex).
-- status          : 'agendada' | 'cancelada' (cancelar não apaga a linha).
CREATE TABLE IF NOT EXISTS tb_reunioes (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organizador_id            INT UNSIGNED    NOT NULL,
  titulo                    VARCHAR(150)    NOT NULL,
  descricao                 VARCHAR(1000)   NULL,
  data_reuniao              DATE            NOT NULL,
  hora_inicio               TIME            NOT NULL,
  hora_fim                  TIME            NOT NULL,
  fuso_horario              VARCHAR(50)     NOT NULL DEFAULT 'America/Sao_Paulo',
  equipe_slug               VARCHAR(40)     NOT NULL DEFAULT 'geral',

  recorrente                TINYINT(1)      NOT NULL DEFAULT 0,
  recorrencia_frequencia    ENUM('diaria','semanal','mensal','personalizada') NULL,
  recorrencia_dias          VARCHAR(20)     NULL,
  recorrencia_termino_tipo  ENUM('nunca','data','ocorrencias') NULL,
  recorrencia_termino_data  DATE            NULL,
  recorrencia_ocorrencias   SMALLINT UNSIGNED NULL,

  status                    ENUM('agendada','cancelada') NOT NULL DEFAULT 'agendada',
  criado_em                 DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                             ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_reuniao_organizador FOREIGN KEY (organizador_id)
    REFERENCES tb_usuarios (id) ON DELETE CASCADE,
  INDEX idx_reuniao_organizador (organizador_id, status, data_reuniao),
  INDEX idx_reuniao_data        (data_reuniao, hora_inicio),
  INDEX idx_reuniao_equipe      (equipe_slug, data_reuniao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Participantes (N:N entre reuniões e usuários)
-- ---------------------------------------------------------------------
-- O organizador NÃO precisa aparecer aqui: ele já está em
-- tb_reunioes.organizador_id.
CREATE TABLE IF NOT EXISTS tb_reunioes_participantes (
  reuniao_id    BIGINT UNSIGNED NOT NULL,
  usuario_id    INT UNSIGNED    NOT NULL,
  criado_em     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (reuniao_id, usuario_id),
  CONSTRAINT fk_reupart_reuniao FOREIGN KEY (reuniao_id)
    REFERENCES tb_reunioes (id) ON DELETE CASCADE,
  CONSTRAINT fk_reupart_usuario FOREIGN KEY (usuario_id)
    REFERENCES tb_usuarios (id) ON DELETE CASCADE,
  INDEX idx_reupart_usuario (usuario_id, reuniao_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
