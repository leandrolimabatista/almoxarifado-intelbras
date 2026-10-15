-- Atualiza o telefone da unidade (a página Unidade lê a primeira linha de tb_unidades).
-- Rode uma vez no banco do site.
UPDATE tb_unidades
   SET telefone = '0800 882 4040'
 ORDER BY id
 LIMIT 1;
