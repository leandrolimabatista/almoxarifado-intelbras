# Loja — catálogo, estoque e "Adicionar item" (Administrador)

## Instalar
1. phpMyAdmin → banco `bd_intelbras` → aba **SQL** → cole `database/loja_catalogo.sql` → Executar (pode rodar de novo).
   - Se o banco ainda tem o modelo antigo de pedidos (relacional), as 3 tabelas antigas são **renomeadas** para `*_antigo` (nada é apagado) e a tabela de pedidos atual é criada.
2. Copie os arquivos desta pasta por cima do projeto. A pasta `conteudo/cadastrado/loja/img/` precisa aceitar gravação (upload das fotos).

## Como funciona
- Vitrine lê `api/loja/produtos.php` (tabela `tb_loja_produtos`). `loja.dados.js` PRODUCTS não é mais usado.
- **Só o usuário id 1** vê "Adicionar item" e os botões editar/remover (também no clique direito). O servidor reconfere sessão + CSRF.
- Campos: código (SKU, não muda depois), categoria, título, descrição, preço, estoque, imagem (opcional, JPG/PNG/WEBP até 5MB).
- Remover = tira da Loja (`ativo=0`); histórico de compras e Dashboard intactos. Adicionar o mesmo código depois reativa o item.
- **Estoque**: ao clicar "Pagar agora" o pedido é gravado e o estoque baixa na mesma transação (14 → 13). Sem estoque, o pagamento nem é gerado.
  Se o pagamento não for gerado, o estoque volta. Pedido abandonado: sem link de pagamento libera após 60 min; com link, após 3 h só se o Mercado Pago confirmar que não foi pago/pendente (precisa de `MP_ACCESS_TOKEN`). Cancelamento via `pedido_status.php` também devolve.
- Dashboard › Compras: o pedido (com o item novo) aparece como "Aguardando pagamento" e vira "Pago" como sempre.
- Frete: item novo usa o peso/medidas padrão da categoria.
- Editar estoque: se você não alterar o campo, o valor do banco é mantido (não desfaz compras feitas com o formulário aberto).
