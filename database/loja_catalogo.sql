-- =====================================================================
-- Intelbras — Portal | Módulo "Loja"
-- Catálogo de produtos no banco + controle de estoque + gestão pelo
-- Administrador (botão "Adicionar item" da Loja: adicionar, editar, remover).
--
-- COMO APLICAR (phpMyAdmin):
--   1. Clique no banco  bd_intelbras  -> aba "SQL" -> cole TODO este
--      arquivo -> "Executar".
--   2. Pode rodar de novo sem problema (tudo é "IF NOT EXISTS" / "IGNORE").
--
-- O que faz:
--   A) Garante tb_loja_categorias e tb_loja_produtos (já existem no dump
--      antigo do banco; aqui só acrescenta a coluna "ordem") e cadastra
--      os 16 produtos originais se a tabela estiver vazia.
--   B) Garante tb_loja_pedidos no formato que o código atual grava
--      (JSON, ver database/loja_pedidos.sql + loja_pagamento_mp.sql) e
--      acrescenta "estoque_reservado" (o pedido guarda se já baixou estoque).
--      Se o banco ainda tem o modelo RELACIONAL antigo de pedidos
--      (colunas "documento", "endereco"...), as 3 tabelas antigas são
--      RENOMEADAS para *_antigo (nada é apagado) e a tabela nova é criada.
--
-- Rode DEPOIS do database/schema.sql (precisa de tb_usuarios).
-- =====================================================================

USE bd_intelbras;

-- ---------------------------------------------------------------------
-- A) CATÁLOGO
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tb_loja_categorias (
  id    VARCHAR(20)       NOT NULL,
  nome  VARCHAR(60)       NOT NULL,
  ordem SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO tb_loja_categorias (id, nome, ordem) VALUES
  ('cameras',   'Videomonitoramento', 1),
  ('redes',     'Redes',              2),
  ('alarmes',   'Alarmes e Sensores', 3),
  ('telefonia', 'Telefonia',          4),
  ('energia',   'Energia',            5);

-- id             : CÓDIGO do produto (SKU), ex.: VIP3230D — não muda depois de criado
-- estoque        : unidades disponíveis (cada pedido iniciado baixa daqui; ver api/loja/_pedidos.php)
-- imagem         : nome do arquivo em conteudo/cadastrado/loja/img/
-- max_por_pedido : limite de unidades por pedido
-- ativo          : 0 = item removido da Loja (o histórico de pedidos continua intacto)
-- ordem          : posição na vitrine (dentro da categoria)
CREATE TABLE IF NOT EXISTS tb_loja_produtos (
  id             VARCHAR(20)      NOT NULL,
  categoria_id   VARCHAR(20)      NOT NULL,
  nome           VARCHAR(150)     NOT NULL,
  descricao      VARCHAR(500)     NOT NULL DEFAULT '',
  preco          DECIMAL(10,2)    NOT NULL,
  estoque        INT UNSIGNED     NOT NULL DEFAULT 0,
  imagem         VARCHAR(120)     NULL,
  max_por_pedido TINYINT UNSIGNED NOT NULL DEFAULT 3,
  ativo          TINYINT(1)       NOT NULL DEFAULT 1,
  criado_em      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_prod_cat (categoria_id, ativo),
  CONSTRAINT fk_prod_cat FOREIGN KEY (categoria_id) REFERENCES tb_loja_categorias (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tb_loja_produtos
  ADD COLUMN IF NOT EXISTS ordem INT UNSIGNED NOT NULL DEFAULT 0 AFTER ativo;

INSERT IGNORE INTO tb_loja_produtos (id, categoria_id, nome, descricao, preco, estoque, imagem, max_por_pedido, ativo, ordem) VALUES
  ('VIP1230B',   'cameras',   'Câmera bullet VIP 1230 B',       'Câmera IP 2MP com infravermelho para uso externo, ideal para monitoramento de pátio e recepção.', 249.90,  14, 'camera-vip1230b.jpg',        3, 1, 1),
  ('VIP3230D',   'cameras',   'Câmera dome VIP 3230 D',         'Câmera dome 2MP indicada para ambientes internos, corredores e salas de servidor.',               279.90,   6, 'camera-vip3230d.jpg',        3, 1, 2),
  ('MIBOCAM2',   'cameras',   'Câmera Wi-Fi Mibo Cam 2',        'Câmera compacta para monitoramento remoto via aplicativo, uso em recepções e almoxarifados.',     189.00,   7, 'mibo-cam-2.jpg',             3, 1, 3),
  ('NVD1408',    'cameras',   'Gravador NVD 1408',              'Gravador digital de vídeo em rede para até 8 canais, uso em salas de controle.',                  899.00,   3, 'nvd1408.jpg',                3, 1, 4),
  ('ARF1200',    'redes',     'Roteador Action RF 1200',        'Roteador wireless dual band para escritórios e salas de reunião de médio porte.',                 229.90,  20, 'action-rf1200.jpg',          3, 1, 5),
  ('SG2404MR',   'redes',     'Switch SG 2404 MR',              'Switch gerenciável 24 portas Gigabit, uso em racks de andar e salas técnicas.',                  1249.00,   5, 'sg-2404-mr.jpg',             3, 1, 6),
  ('ACCESSPT',   'redes',     'Access Point AP 1350',           'Ponto de acesso indicado para ampliar cobertura Wi-Fi em áreas comuns.',                          349.00,   9, 'ap-1350.jpg',                3, 1, 7),
  ('PATCHCB5',   'redes',     'Patch cord Cat5e (2m)',          'Cabo de rede para conexões de estação de trabalho e equipamentos de rack.',                        14.90, 120, 'patch-cord-cat5e.jpg',       3, 1, 8),
  ('AMT8000',    'alarmes',   'Central de alarme AMT 8000',     'Central monitorada para áreas restritas, compatível com sensores e controles remotos.',           539.00,   4, 'amt-8000.jpg',               3, 1, 9),
  ('IVPDUAL',    'alarmes',   'Sensor infravermelho IVP Dual',  'Sensor de presença para proteção perimetral de salas e depósitos.',                                79.90,  18, 'ivp-dual.jpg',               3, 1, 10),
  ('XAT4010',    'alarmes',   'Sirene XAT 4010',                'Sirene externa com bateria reserva para uso em conjunto com centrais de alarme.',                 159.00,   7, 'xat-4010.jpg',               3, 1, 11),
  ('TIP200LT',   'telefonia', 'Telefone IP TIP 200 Lite',       'Aparelho IP para ramais internos, indicado para postos de atendimento.',                          219.00,  11, 'tip-200-lite.jpg',           3, 1, 12),
  ('TS4010',     'telefonia', 'Central telefônica TS 4010',     'Central PABX para pequenas filiais e escritórios remotos.',                                      1890.00,   2, 'ts-4010.jpg',                3, 1, 13),
  ('HEADSETPRO', 'telefonia', 'Headset corporativo HS Pro',     'Headset com cancelamento de ruído para operadores de central de atendimento.',                    129.90,  25, 'hs-pro.jpg',                 3, 1, 14),
  ('NOBRK1200',  'energia',   'Nobreak 1200 VA',                'Nobreak para estações de trabalho e equipamentos de rede em salas técnicas.',                     649.00,   8, 'nobreak-1200va.jpg',         3, 1, 15),
  ('FILTLINHA',  'energia',   'Filtro de linha 8 tomadas',      'Protetor contra surtos para bancadas e postos de trabalho.',                                       44.90,  60, 'filtro-linha-8-tomadas.jpg', 3, 1, 16);

-- Produtos que já existiam (dump antigo) e ainda estão sem posição: usam a ordem original da vitrine.
UPDATE tb_loja_produtos SET ordem = FIELD(id,
  'VIP1230B','VIP3230D','MIBOCAM2','NVD1408','ARF1200','SG2404MR','ACCESSPT','PATCHCB5',
  'AMT8000','IVPDUAL','XAT4010','TIP200LT','TS4010','HEADSETPRO','NOBRK1200','FILTLINHA')
 WHERE ordem = 0 AND id IN (
  'VIP1230B','VIP3230D','MIBOCAM2','NVD1408','ARF1200','SG2404MR','ACCESSPT','PATCHCB5',
  'AMT8000','IVPDUAL','XAT4010','TIP200LT','TS4010','HEADSETPRO','NOBRK1200','FILTLINHA');

-- Qualquer outro produto sem posição vai para o fim.
UPDATE tb_loja_produtos
   SET ordem = (SELECT m FROM (SELECT COALESCE(MAX(ordem), 0) + 1 AS m FROM tb_loja_produtos) t)
 WHERE ordem = 0;

-- ---------------------------------------------------------------------
-- B) PEDIDOS (formato JSON usado pelo código atual)
-- ---------------------------------------------------------------------
-- Modelo relacional ANTIGO (tem a coluna "documento")? Então só renomeia — nada é apagado.
SET @modelo_antigo = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_loja_pedidos' AND COLUMN_NAME = 'documento'
);
SET @sql_renomear = IF(@modelo_antigo > 0,
  'RENAME TABLE tb_loja_pagamentos TO tb_loja_pagamentos_antigo, tb_loja_pedido_itens TO tb_loja_pedido_itens_antigo, tb_loja_pedidos TO tb_loja_pedidos_antigo',
  'DO 0');
PREPARE stmt_renomear FROM @sql_renomear;
EXECUTE stmt_renomear;
DEALLOCATE PREPARE stmt_renomear;

CREATE TABLE IF NOT EXISTS tb_loja_pedidos (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo         VARCHAR(24)     NOT NULL,
  usuario_id     INT UNSIGNED    NOT NULL,
  status         ENUM('iniciado','pago','cancelado') NOT NULL DEFAULT 'iniciado',
  itens          JSON            NOT NULL,
  subtotal       DECIMAL(10,2)   NOT NULL,
  frete_nome     VARCHAR(80)     NULL,
  frete_valor    DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  total          DECIMAL(10,2)   NOT NULL,
  cupom          VARCHAR(30)     NULL,
  entrega_cep    CHAR(8)         NULL,
  entrega_cidade VARCHAR(80)     NULL,
  entrega_uf     CHAR(2)         NULL,
  criado_em      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loja_pedido_codigo (codigo),
  KEY idx_loja_pedido_usuario (usuario_id, criado_em),
  CONSTRAINT fk_loja_pedido_usuario FOREIGN KEY (usuario_id) REFERENCES tb_usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ligação com o Mercado Pago (mesmo conteúdo de database/loja_pagamento_mp.sql)
ALTER TABLE tb_loja_pedidos
  ADD COLUMN IF NOT EXISTS preference_id VARCHAR(80) NULL AFTER entrega_uf,
  ADD COLUMN IF NOT EXISTS mp_payment_id VARCHAR(40) NULL AFTER preference_id,
  ADD COLUMN IF NOT EXISTS pago_em       DATETIME    NULL AFTER mp_payment_id;

ALTER TABLE tb_loja_pedidos
  ADD INDEX IF NOT EXISTS idx_loja_pedido_pref (preference_id);

-- 1 = este pedido já baixou o estoque (cancelar/expirar devolve as unidades).
-- Pedidos antigos ficam 0: cancelá-los NÃO mexe no estoque.
ALTER TABLE tb_loja_pedidos
  ADD COLUMN IF NOT EXISTS estoque_reservado TINYINT(1) NOT NULL DEFAULT 0 AFTER pago_em;

ALTER TABLE tb_loja_pedidos
  ADD INDEX IF NOT EXISTS idx_loja_pedido_status (status, criado_em);
