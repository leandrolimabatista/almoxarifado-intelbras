-- =====================================================================
-- Intelbras — Portal | Módulo "Loja"
-- Histórico de compras do usuário (aba "Compras" do carrinho)
--
-- COMO APLICAR (phpMyAdmin):
--   1. Abra o phpMyAdmin e clique no banco  bd_intelbras.
--   2. Aba "SQL" -> cole TODO este arquivo -> "Executar".
--   3. Pode rodar de novo sem problema (CREATE TABLE IF NOT EXISTS).
--
-- Rode DEPOIS do database/schema.sql (precisa de tb_usuarios).
-- Não altera nenhuma tabela existente.
-- =====================================================================

USE bd_intelbras;

-- codigo      : número do pedido mostrado ao usuário (ex.: LJ-20261007-A3F9)
-- status      : iniciado  = foi enviado ao Mercado Pago, pagamento ainda não confirmado
--               pago      = confirmado (atualizado por api/loja/pedido_status.php)
--               cancelado = recusado/cancelado
-- itens       : JSON [{id, nome, quantidade, preco}] — preço UNITÁRIO realmente
--               cobrado (cupom já incluído) e nome do produto NA DATA da compra.
-- subtotal    : soma dos itens;  total = subtotal + frete_valor
CREATE TABLE IF NOT EXISTS tb_loja_pedidos (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo        VARCHAR(24)     NOT NULL,
  usuario_id    INT UNSIGNED    NOT NULL,
  status        ENUM('iniciado','pago','cancelado') NOT NULL DEFAULT 'iniciado',
  itens         JSON            NOT NULL,
  subtotal      DECIMAL(10,2)   NOT NULL,
  frete_nome    VARCHAR(80)     NULL,
  frete_valor   DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  total         DECIMAL(10,2)   NOT NULL,
  cupom         VARCHAR(30)     NULL,
  entrega_cep   CHAR(8)         NULL,
  entrega_cidade VARCHAR(80)    NULL,
  entrega_uf    CHAR(2)         NULL,
  criado_em     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loja_pedido_codigo (codigo),
  KEY idx_loja_pedido_usuario (usuario_id, criado_em),
  CONSTRAINT fk_loja_pedido_usuario FOREIGN KEY (usuario_id) REFERENCES tb_usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
