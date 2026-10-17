-- =====================================================================
-- Intelbras — Portal | Módulo "Loja"
-- Cupons de desconto (campo "Adicionar cupom" do carrinho e do checkout)
--
-- COMO APLICAR (phpMyAdmin):
--   1. Abra o phpMyAdmin e clique no banco  bd_intelbras.
--   2. Aba "SQL" -> cole TODO este arquivo -> "Executar".
--   3. Pode rodar de novo sem problema (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--
-- Rode DEPOIS do database/loja_pedidos.sql (ou loja_catalogo.sql), que cria tb_loja_pedidos.
-- Não apaga nem altera dados existentes: só acrescenta colunas.
--
-- Regras de cada cupom (todas conferidas no SERVIDOR, nunca só no navegador):
--   tipo          percent = % sobre o subtotal dos itens  ·  valor = R$ fixo sobre o subtotal
--   ativo         0 desliga o cupom sem apagar
--   valido_de     (opcional) só vale a partir desta data/hora
--   valido_ate    (opcional) só vale até esta data/hora
--   usos_max      (opcional) limite total de pedidos que podem usar o cupom
--   por_usuario   (opcional) quantas vezes CADA usuário pode usar (ex.: 1 = uma vez só)
--   valor_minimo  (opcional) subtotal mínimo do carrinho para o cupom valer
--   usos          contador informativo (o servidor confere o uso real pelos pedidos)
-- O desconto nunca passa de 90% do subtotal. O frete não recebe desconto.
-- =====================================================================

USE bd_intelbras;

CREATE TABLE IF NOT EXISTS tb_loja_cupons (
  codigo       VARCHAR(30)      NOT NULL,
  tipo         ENUM('percent','valor') NOT NULL DEFAULT 'percent',
  valor        DECIMAL(10,2)    NOT NULL,
  ativo        TINYINT(1)       NOT NULL DEFAULT 1,
  valido_ate   DATETIME         NULL,
  usos_max     INT UNSIGNED     NULL,
  usos         INT UNSIGNED     NOT NULL DEFAULT 0,
  PRIMARY KEY (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tb_loja_cupons
  ADD COLUMN IF NOT EXISTS valido_de    DATETIME      NULL AFTER ativo,
  ADD COLUMN IF NOT EXISTS por_usuario  INT UNSIGNED  NULL AFTER usos_max,
  ADD COLUMN IF NOT EXISTS valor_minimo DECIMAL(10,2) NULL AFTER por_usuario,
  ADD COLUMN IF NOT EXISTS criado_em    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Pedido: passa a guardar o desconto à parte.
--   subtotal = soma dos itens a preço de tabela · total = subtotal - desconto + frete_valor
--   cupom    = código usado (já existia)
ALTER TABLE tb_loja_pedidos
  ADD COLUMN IF NOT EXISTS desconto DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER subtotal;

-- Índice para contar rapidamente quantas vezes um cupom já foi usado (por total e por usuário).
ALTER TABLE tb_loja_pedidos ADD INDEX IF NOT EXISTS idx_loja_pedido_cupom (cupom, usuario_id);

-- Exemplo (descomente para criar um cupom de teste: 10% de desconto, 1 uso por usuário):
-- INSERT INTO tb_loja_cupons (codigo, tipo, valor, ativo, por_usuario)
-- VALUES ('INTEL10', 'percent', 10.00, 1, 1)
-- ON DUPLICATE KEY UPDATE valor = VALUES(valor);
