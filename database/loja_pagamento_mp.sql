-- =====================================================================
-- Intelbras — Portal | Módulo "Loja"
-- Liga o pedido ao pagamento do Mercado Pago, para o site descobrir
-- sozinho quando ele foi aprovado e mudar o status para "pago".
--
-- COMO APLICAR (phpMyAdmin):
--   1. Clique no banco  bd_intelbras  -> aba "SQL" -> cole TODO este
--      arquivo -> "Executar".
--   2. Pode rodar de novo sem problema (ADD COLUMN IF NOT EXISTS — MariaDB,
--      que é o que o phpMyAdmin/XAMPP usa).
--
-- Rode DEPOIS do database/loja_pedidos.sql. Só ACRESCENTA colunas em
-- tb_loja_pedidos; nada existente é alterado ou apagado.
--
-- preference_id : id da preferência de pagamento (vem no link do Mercado Pago)
-- mp_payment_id : id do pagamento aprovado
-- pago_em       : quando o Mercado Pago aprovou
-- =====================================================================

USE bd_intelbras;

ALTER TABLE tb_loja_pedidos
  ADD COLUMN IF NOT EXISTS preference_id VARCHAR(80) NULL AFTER entrega_uf,
  ADD COLUMN IF NOT EXISTS mp_payment_id VARCHAR(40) NULL AFTER preference_id,
  ADD COLUMN IF NOT EXISTS pago_em       DATETIME    NULL AFTER mp_payment_id;

ALTER TABLE tb_loja_pedidos
  ADD INDEX IF NOT EXISTS idx_loja_pedido_pref (preference_id);
