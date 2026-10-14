<?php
// Modelo. Copie para "config.local.php" e preencha as chaves.
return [
    'GEMINI_API_KEY'    => '',
    'ANTHROPIC_API_KEY' => '',

    // Loja — cotação de frete (Melhor Envio). Sem token/CEP o checkout usa
    // a tabela por região de loja.dados.js (valores estimados).
    'MELHOR_ENVIO_TOKEN'   => '',            // token da conta em melhorenvio.com.br
    'MELHOR_ENVIO_SANDBOX' => '',            // '1' = ambiente de testes
    'LOJA_CEP_ORIGEM'      => '',            // CEP de onde os produtos saem (8 dígitos)
    'LOJA_CONTATO_EMAIL'   => '',            // e-mail de contato exigido pelo Melhor Envio
    // Loja — confirmação de pagamento: Access Token do Mercado Pago (APP_USR-... ou TEST-...)
    // da MESMA conta usada pelo servidor que cria o pagamento. Com ele, o pedido vira "pago"
    // sozinho depois que o Mercado Pago aprova (ver api/loja/_mercadopago.php).
    'MP_ACCESS_TOKEN'      => '',
    'LOJA_WEBHOOK_TOKEN'   => '',            // segredo p/ o servidor de pagamento marcar pedidos como pagos (api/loja/pedido_status.php)

    // "Esqueci minha senha" — envio de e-mail pela Brevo (api/_brevo.php).
    'BREVO_API_KEY'         => '',   // Brevo → SMTP e API → Chaves de API (começa com xkeysib-)
    'BREVO_REMETENTE_EMAIL' => '',   // e-mail remetente VALIDADO na Brevo (Remetentes, domínios e IPs)
    'BREVO_REMETENTE_NOME'  => 'Intelbras',
    'APP_URL'               => '',   // endereço público do site, sem barra final (ex.: https://meusite.com.br/intelbras). Vazio = deduz do pedido
];
