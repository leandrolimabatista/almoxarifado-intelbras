require('dotenv').config();
const express = require('express');
const cors = require('cors');
const {
  MercadoPagoConfig,
  Preference,
  Payment
} = require('mercadopago');
const { Pool } = require('pg');
const { BrevoClient } = require('@getbrevo/brevo');
const crypto = require('crypto');

const app = express();

app.use(cors());
app.use(express.json());

// ==============================
// MERCADO PAGO
// ==============================

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

const paymentClient = new Payment(mpClient);


// ==============================
// BANCO DE DADOS
// ==============================

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
});


// ==============================
// BREVO
// ==============================

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});


// ==============================
// FUNÇÕES
// ==============================

function gerarCodigoPedido() {
  return 'ALM-' + Math.floor(100000 + Math.random() * 900000);
}


// ==============================
// CRIAR PAGAMENTO
// ==============================

app.post('/criar-pagamento', async (req, res) => {
  try {
    const {
  items,
  centro_custo,
  finalidade,
  observacoes,
  email_comprovante
} = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        erro: 'Carrinho vazio.'
      });
    }

    const total = items.reduce(
      (soma, item) => soma + item.unit_price * item.quantity,
      0
    );

    const codigo = gerarCodigoPedido();

    // Salva o pedido como pendente
    const insertResult = await pool.query(
  `INSERT INTO tb_pedidos (
     codigo,
     centro_custo,
     finalidade,
     observacoes,
     itens,
     total,
     status,
     email_comprovante
   )
   VALUES ($1, $2, $3, $4, $5, $6, 'pendente', $7)
   RETURNING id_pedido`,
  [
    codigo,
    centro_custo || null,
    finalidade || null,
    observacoes || null,
    JSON.stringify(items),
    total,
    email_comprovante || null
  ]
);

    const idPedido = insertResult.rows[0].id_pedido;

    // Cria preferência no Mercado Pago
    const preference = new Preference(mpClient);

    const result = await preference.create({
      body: {
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          quantity: item.quantity,
          unit_price: item.unit_price,
          currency_id: 'BRL',
        })),

        // Liga o pagamento ao pedido do nosso banco
        external_reference: String(idPedido),

        back_urls: {
  success: 'https://almoxarifado-intelbras.duckdns.org/?pagina=loja&pagamento=sucesso',
  failure: 'https://almoxarifado-intelbras.duckdns.org/?pagina=loja&pagamento=falha',
  pending: 'https://almoxarifado-intelbras.duckdns.org/?pagina=loja&pagamento=pendente',
},
      },
    });

    res.json({
      init_point: result.init_point,
      codigo,
      id_pedido: idPedido
    });

  } catch (err) {
    console.error('Erro ao criar pagamento:', err);

    res.status(500).json({
      erro: 'Erro ao criar pagamento.'
    });
  }
});


// ==============================
// WEBHOOK MERCADO PAGO
// ==============================

app.post('/webhook/mercadopago', async (req, res) => {
  try {
    console.log('Webhook Mercado Pago recebido.');

    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];

    // O Mercado Pago envia o ID do pagamento
    // normalmente através de data.id
    const dataId =
      req.query['data.id'] ||
      req.query.data_id ||
      req.body?.data?.id;

    if (!xSignature || !xRequestId || !dataId) {
      console.log('Webhook sem dados suficientes.');

      return res.sendStatus(400);
    }

    // ==========================================
    // VALIDAÇÃO DA ASSINATURA
    // ==========================================

    const partes = xSignature.split(',');

    let ts = null;
    let v1 = null;

    for (const parte of partes) {
      const [chave, valor] = parte.split('=');

      if (chave === 'ts') {
        ts = valor;
      }

      if (chave === 'v1') {
        v1 = valor;
      }
    }

    if (!ts || !v1) {
      console.log('Assinatura inválida.');

      return res.sendStatus(400);
    }

    const manifest =
      `id:${dataId};request-id:${xRequestId};ts:${ts};`;

    const assinaturaEsperada = crypto
      .createHmac(
        'sha256',
        process.env.MP_WEBHOOK_SECRET
      )
      .update(manifest)
      .digest('hex');

    if (assinaturaEsperada !== v1) {
      console.log('Assinatura do Mercado Pago não confere.');

      return res.sendStatus(401);
    }

    console.log('Assinatura do webhook validada.');


    // ==========================================
    // CONSULTA O PAGAMENTO NO MERCADO PAGO
    // ==========================================

    const paymentId = dataId;

    const pagamento = await paymentClient.get({
      id: paymentId
    });

    console.log('Pagamento recebido:', {
  id: pagamento.id,
  status: pagamento.status,
  external_reference: pagamento.external_reference,
  payer: pagamento.payer
});

    // ==========================================
    // SÓ PROCESSA PAGAMENTO APROVADO
    // ==========================================

    if (pagamento.status !== 'approved') {
      console.log(
        `Pagamento ${paymentId} ainda não está aprovado. Status: ${pagamento.status}`
      );

      return res.sendStatus(200);
    }


    // ==========================================
    // IDENTIFICA O PEDIDO
    // ==========================================

    const idPedido = pagamento.external_reference;

    if (!idPedido) {
      console.log(
        'Pagamento aprovado sem external_reference.'
      );

      return res.sendStatus(200);
    }


    // ==========================================
    // BUSCA O PEDIDO NO BANCO
    // ==========================================

    const pedidoResult = await pool.query(
      `SELECT *
       FROM tb_pedidos
       WHERE id_pedido = $1`,
      [idPedido]
    );

    if (pedidoResult.rows.length === 0) {
      console.log(
        `Pedido ${idPedido} não encontrado no banco.`
      );

      return res.sendStatus(404);
    }

    const pedido = pedidoResult.rows[0];


    // ==========================================
    // EVITA PROCESSAR NOVAMENTE
    // ==========================================

    if (pedido.status === 'pago') {
      console.log(
        `Pedido ${pedido.codigo} já está pago.`
      );

      return res.sendStatus(200);
    }


    // ==========================================
    // PEGA E-MAIL DO PAGADOR
    // ==========================================

    const emailCliente = pedido.email_comprovante;

console.log(
  'E-mail do comprovante:',
  emailCliente || 'não informado'
);

    // ==========================================
    // PREPARA OS ITENS DO PEDIDO
    // ==========================================

    const itens = Array.isArray(pedido.itens)
      ? pedido.itens
      : JSON.parse(pedido.itens);


    const listaItens = itens.map((item) => `
      <tr>
        <td style="
          padding:8px;
          border-bottom:1px solid #ddd;
        ">
          ${item.title}
        </td>

        <td style="
          padding:8px;
          border-bottom:1px solid #ddd;
          text-align:center;
        ">
          ${item.quantity}
        </td>

        <td style="
          padding:8px;
          border-bottom:1px solid #ddd;
          text-align:right;
        ">
          R$ ${Number(item.unit_price)
            .toFixed(2)
            .replace('.', ',')}
        </td>
      </tr>
    `).join('');


    // ==========================================
    // ENVIA COMPROVANTE PELO BREVO
    // ==========================================

    if (emailCliente) {

      await brevo.transactionalEmails.sendTransacEmail({

        subject:
          `Comprovante do pedido ${pedido.codigo} - Almoxarifado Intelbras`,

        htmlContent: `
          <div
            style="
              font-family:Arial,sans-serif;
              max-width:700px;
              margin:auto;
            "
          >

            <h2>
              Pedido realizado com sucesso!
            </h2>

            <p>
              Olá!
            </p>

            <p>
              Seu pagamento foi aprovado e seu pedido
              foi registrado no Almoxarifado Intelbras.
            </p>

            <h3>
              Dados do pedido
            </h3>

            <p>
              <strong>Pedido:</strong>
              ${pedido.codigo}
              <br>

              <strong>Pagamento Mercado Pago:</strong>
              ${pagamento.id}
              <br>

              <strong>Status:</strong>
              Pagamento aprovado
            </p>

            <h3>
              Itens do pedido
            </h3>

            <table
              style="
                width:100%;
                border-collapse:collapse;
              "
            >

              <thead>

                <tr>

                  <th
                    style="
                      padding:8px;
                      border-bottom:2px solid #333;
                      text-align:left;
                    "
                  >
                    Produto
                  </th>

                  <th
                    style="
                      padding:8px;
                      border-bottom:2px solid #333;
                    "
                  >
                    Quantidade
                  </th>

                  <th
                    style="
                      padding:8px;
                      border-bottom:2px solid #333;
                      text-align:right;
                    "
                  >
                    Valor
                  </th>

                </tr>

              </thead>

              <tbody>

                ${listaItens}

              </tbody>

            </table>

            <h3
              style="
                text-align:right;
              "
            >
              Total:
              R$ ${Number(pedido.total)
                .toFixed(2)
                .replace('.', ',')}
            </h3>

            <p>
              <strong>Centro de custo:</strong>
              ${pedido.centro_custo || 'Não informado'}
            </p>

            <p>
              <strong>Finalidade:</strong>
              ${pedido.finalidade || 'Não informada'}
            </p>

            <p>
              <strong>Observações:</strong>
              ${pedido.observacoes || 'Nenhuma'}
            </p>

            <hr>

            <p>
              Este e-mail foi enviado automaticamente
              pelo sistema do Almoxarifado Intelbras.
            </p>

          </div>
        `,

        sender: {
          name: 'Almoxarifado Intelbras',
          email: process.env.BREVO_SENDER_EMAIL
        },

        to: [
          {
            email: emailCliente
          }
        ]
      });

      console.log(
        `Comprovante enviado para ${emailCliente}`
      );

    } else {

      console.log(
        'Pagamento aprovado, mas o Mercado Pago não informou o e-mail.'
      );

    }


    // ==========================================
    // ATUALIZA O PEDIDO PARA PAGO
    // ==========================================

    await pool.query(
      `UPDATE tb_pedidos
       SET status = 'pago'
       WHERE id_pedido = $1`,
      [idPedido]
    );

    console.log(
      `Pedido ${pedido.codigo} atualizado para PAGO.`
    );

    return res.sendStatus(200);

  } catch (err) {

    console.error(
      'Erro no webhook do Mercado Pago:',
      err
    );

    return res.sendStatus(500);
  }
});


// ==============================
// LISTAR PEDIDOS
// ==============================

app.get('/pedidos', async (req, res) => {
  try {

    const result = await pool.query(
      `SELECT *
       FROM tb_pedidos
       ORDER BY criado_em DESC
       LIMIT 50`
    );

    res.json(result.rows);

  } catch (err) {

    console.error(
      'Erro ao buscar pedidos:',
      err
    );

    res.status(500).json({
      erro: 'Erro ao buscar pedidos.'
    });
  }
});


// ==============================
// TESTE DE E-MAIL
// ==============================

app.get('/teste-email', async (req, res) => {
  try {

    await brevo.transactionalEmails.sendTransacEmail({

      subject:
        'Teste de e-mail - Almoxarifado Intelbras',

      htmlContent: `
        <h2>Teste de envio</h2>

        <p>
          Este é um teste do sistema de e-mail
          do Almoxarifado Intelbras.
        </p>

        <p>
          O envio pelo Brevo está funcionando.
        </p>
      `,

      sender: {
        name: 'Leandro Batista',
        email: process.env.BREVO_SENDER_EMAIL,
      },

      to: [
        {
          email: process.env.BREVO_SENDER_EMAIL,
          name: 'Leandro Batista',
        },
      ],
    });

    res.json({
      sucesso: true,
      mensagem:
        'E-mail de teste enviado com sucesso.'
    });

  } catch (err) {

    console.error(
      'Erro ao enviar e-mail:',
      err
    );

    res.status(500).json({
      sucesso: false,
      erro: 'Erro ao enviar e-mail.'
    });
  }
});


// ==============================
// SERVIDOR
// ==============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Servidor rodando na porta ${PORT}`
  );
});
