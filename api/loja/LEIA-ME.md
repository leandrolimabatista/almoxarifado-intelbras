# Loja — cálculo de frete por endereço

O checkout cota o frete pelo **CEP de destino** e pelo **peso/medidas dos produtos
do carrinho**, via [Melhor Envio](https://melhorenvio.com.br) (Correios, Jadlog,
Loggi etc. num só contrato).

```
checkout (loja.js) → api/loja/frete.php → Melhor Envio
                          ↑ peso/medidas vêm de _catalogo_frete.php (servidor)
```

Se a cotação não estiver configurada ou falhar, o próprio `frete.php` devolve uma
**estimativa por CEP (estado) + peso do carrinho** (`frete_estimar` em `_frete.php`:
base da região + adicional por kg excedente, ajustada para capital / região metropolitana / interior pelas faixas de CEP em `FRETE_ZONAS`) e o checkout avisa "Valores estimados
para a sua região". Só se o servidor estiver fora do ar o navegador usa a tabela fixa
de `loja.dados.js`. Os valores da estimativa são de exemplo (hoje com 30% de desconto, `FRETE_FATOR_PRECO`): ajuste em
`FRETE_TARIFA_REGIAO` (`_frete.php`).

## Configurar (uma vez)

Em `api/config.local.php` (ou variáveis de ambiente de mesmo nome):

| Chave | O que é |
|---|---|
| `MELHOR_ENVIO_TOKEN` | token gerado na conta do Melhor Envio (Configurações → Tokens) |
| `LOJA_CEP_ORIGEM` | CEP de onde os produtos saem (8 dígitos) |
| `LOJA_CONTATO_EMAIL` | e-mail de contato (o Melhor Envio exige identificar a aplicação) |
| `MELHOR_ENVIO_SANDBOX` | `1` para testar no ambiente sandbox (token do sandbox) |

Requer a extensão **cURL** do PHP.

## Peso e medidas

Edite `_catalogo_frete.php`. Os valores atuais são **estimativas**: confirme com a
embalagem real de cada produto. Produto novo sem entrada usa o padrão da categoria.

## Limitações conhecidas

- O valor do frete entra no pagamento vindo do navegador (o servidor de pagamento
  na AWS recebe `FRETE` como um item comum). Para impedir adulteração, esse servidor
  deveria recotar o frete antes de criar o pagamento (hoje não faz parte do contrato).
- Limite de 20 cotações por minuto por sessão (protege a cota da conta).

# Loja — histórico de compras (aba "Compras" do carrinho)

## Uma vez só (banco)

No phpMyAdmin, no banco `bd_intelbras`, aba **SQL**, rode `database/loja_pedidos.sql`
(cria `tb_loja_pedidos`; pode rodar de novo sem problema).

## Como funciona

- Quando o cliente clica em **Pagar agora** e o Mercado Pago gera o link, o pedido é
  gravado (`api/loja/pedidos.php`, POST) com status **iniciado** ("Pagamento iniciado")
  e só então o cliente é redirecionado. Se a gravação falhar, o pagamento segue normal.
- A aba **Compras** (carrinho lateral) lista os pedidos do usuário logado
  (`api/loja/pedidos.php`, GET), com itens, frete, entrega e o botão "Comprar novamente".
- Subtotal e total são recalculados no servidor; produtos precisam existir no catálogo.

## Status do pedido (iniciado → pago)

O site descobre sozinho quando o Mercado Pago aprova o pagamento, sem depender do servidor AWS:

1. **Uma vez só (banco):** rode `database/loja_pagamento_mp.sql` (depois de `loja_pedidos.sql`). Ele acrescenta
   `preference_id`, `mp_payment_id` e `pago_em` em `tb_loja_pedidos`.
2. **Uma vez só (chave):** em `api/config.local.php`, preencha `MP_ACCESS_TOKEN` com o Access Token da **mesma
   conta** do Mercado Pago que o servidor AWS usa para criar o pagamento (`TEST-...` em testes, `APP_USR-...` em produção).
3. Ao clicar em **Pagar agora**, o pedido é gravado como "iniciado" junto com o `preference_id` do link do Mercado Pago.
4. Sempre que a aba **Compras** da Loja ou o **Dashboard** (Compras) é aberto, os pedidos "iniciado" dos últimos 7 dias
   são conferidos no Mercado Pago (`/merchant_orders/search?preference_id=...`). Se houver pagamento **approved** sem
   estorno, o pedido vira **pago** (grava `mp_payment_id` e `pago_em`). No máximo 15 consultas por chamada e uma
   consulta por pedido a cada 20 s. Se o Mercado Pago estiver fora do ar, o pedido só continua "iniciado".

Sem o passo 1 ou 2, nada disso roda (o pedido segue "iniciado") e nada quebra.

Alternativa (opcional): o servidor AWS pode avisar direto, ao receber a notificação do Mercado Pago:

```
POST api/loja/pedido_status.php
X-Loja-Token: <LOJA_WEBHOOK_TOKEN>
{ "codigo": "LJ-20261007-A3F9", "status": "pago" }     // ou "cancelado"
```

Para isso o código do pedido (`LJ-...`) precisaria chegar ao servidor (ex.: como `external_reference`), o que exige
alterar o contrato de `/criar-pagamento`.


# Loja — cupons de desconto

Campo **Adicionar cupom** (carrinho lateral e resumo do checkout). Quem decide se o cupom vale e
quanto desconta é o **servidor**; o navegador só mostra o valor.

## Uma vez só (banco)

No phpMyAdmin, no banco `bd_intelbras`, aba **SQL**, rode `database/loja_cupons.sql`
(estende `tb_loja_cupons` e acrescenta `desconto` em `tb_loja_pedidos`; pode rodar de novo sem problema).
Sem isso o campo de cupom responde "Cupons ainda não instalados" e a Loja segue funcionando sem cupom.

## Cadastrar cupons

Logado como Administrador Intelbras (id 1): botão **Cupons** na Loja (ao lado de "Adicionar item").
Cada cupom tem:

| Campo | Regra |
|---|---|
| código | 3 a 30 letras/números/`-`/`_`; o usuário pode digitar em minúsculas |
| tipo | **percentual** (0,01 a 90 %) ou **valor fixo** (R$) sobre o subtotal dos itens — o frete não recebe desconto |
| subtotal mínimo | opcional |
| válido de / até | opcional (o "até" vale até o fim do dia) |
| limite total de usos | opcional — soma de todos os usuários |
| usos por usuário | opcional — `1` = uma vez só por pessoa |
| ativo | desliga sem apagar |

O desconto nunca passa de 90 % do subtotal (o Mercado Pago não aceita item de R$ 0,00).
Pedido **cancelado** ou **expirado** devolve o uso do cupom.

## Como funciona

```
campo de cupom → api/loja/cupom.php (acao "validar")   confere ativo, validade, limites, mínimo
                                                       e devolve { codigo, tipo, valor, minimo }
checkout       → api/loja/pedidos.php (acao "reservar") recalcula TUDO no servidor
```

- `api/loja/_cupons.php` — regras e cálculo. O desconto é calculado em **centavos inteiros**
  (`cupom_ratear`); o mesmo algoritmo está em `loja.js` (`ratearCupom`) para a tela mostrar o valor na hora.
  Percentual: cada unidade é arredondada em centavos. Valor fixo: dividido entre as linhas
  proporcionalmente ao total de cada uma.
- Ao reservar o pedido, o servidor reconfere o cupom **dentro da transação** (trava a linha do cupom:
  dois pedidos simultâneos não passam do limite) e recusa (HTTP 422, `cupom:true`) se o desconto que a tela
  mostrou for diferente do calculado — o cliente nunca paga valor diferente do que viu; a tela remove o cupom e avisa.
- O pedido grava: `subtotal` (preços de tabela), `desconto`, `cupom`, `total = subtotal − desconto + frete`.
  Os itens do pedido guardam sempre o **preço de tabela** (o desconto não vai no preço do item).
  O Dashboard já mostra "Desconto (CÓDIGO)" por pedido.
- Os itens enviados ao Mercado Pago saem com o desconto aplicado (se o desconto de uma linha não dividir
  certinho pelas unidades, a linha vira dois itens; o total cobrado é exatamente o mostrado).
- Segurança: o preço de cada item agora precisa ser **igual** ao do catálogo (antes aceitava preço menor);
  o código do cupom tem limite de 15 tentativas por minuto por sessão; cupom inexistente, desligado ou vencido
  respondem com a mesma mensagem.

## Limitação conhecida

Igual ao frete: os itens com desconto seguem do navegador para o servidor de pagamento na AWS
(`criar-pagamento`), que hoje não os confere. Para fechar isso de vez, esse servidor deveria buscar o
`total` do pedido em nosso PHP antes de criar o pagamento.
