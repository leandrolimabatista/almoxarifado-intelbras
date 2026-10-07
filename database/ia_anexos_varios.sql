-- ============================================================
-- Vários anexos por mensagem (até 5)
--
-- Rode UMA vez no banco bd_intelbras (phpMyAdmin > aba SQL),
-- ANTES de usar o novo enviar.php.
--
-- Antes: tb_ia_anexos tinha um índice UNIQUE em mensagem_id, então cada
-- mensagem só podia ter 1 anexo. Agora o UNIQUE é trocado por um índice
-- comum (a chave estrangeira fk_ia_anexo_mensagem continua protegida).
--
-- Os 2 comandos são separados de propósito: primeiro cria o índice novo,
-- depois remove o antigo (a chave estrangeira nunca fica sem índice).
-- Os anexos que já existem não são alterados.
-- ============================================================

ALTER TABLE tb_ia_anexos
  ADD INDEX idx_ia_anexo_mensagem (mensagem_id, id);

ALTER TABLE tb_ia_anexos
  DROP INDEX uq_ia_anexo_mensagem;
