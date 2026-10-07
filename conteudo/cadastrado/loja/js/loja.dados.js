// ============================================================
// LOJA — Dados e constantes (cópia fiel do código original)
// Catálogo, categorias, ícones de fallback, limites e saldo.
// Nenhuma regra de tela aqui: só dados.
// ============================================================
(function () {
  'use strict';

  // Pasta das fotos (mesmos nomes de arquivo do BASE original)
  const IMG_BASE = 'conteudo/cadastrado/loja/img/';

  const CATEGORIES = [
    { id: 'cameras', label: 'Videomonitoramento' },
    { id: 'redes', label: 'Redes' },
    { id: 'alarmes', label: 'Alarmes e Sensores' },
    { id: 'telefonia', label: 'Telefonia' },
    { id: 'energia', label: 'Energia' },
  ];

  // Ícones de fallback (usados quando a foto não carrega e no carrinho).
  // stroke="currentColor": a cor vem do CSS (verde Intelbras do site).
  const ICONS = {
    cameras: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="7" width="14" height="10" rx="2"/><path d="M16 10l5-3v10l-5-3"/><circle cx="9" cy="12" r="2.4"/></svg>',
    redes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="8" width="18" height="8" rx="1.5"/><line x1="7" y1="12" x2="7" y2="12.01"/><line x1="11" y1="12" x2="11" y2="12.01"/><path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/></svg>',
    alarmes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 3a6 6 0 0 0-6 6c0 5-2 6-2 6h16s-2-1-2-6a6 6 0 0 0-6-6z"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
    telefonia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 4 6a2 2 0 0 1 0-2z"/></svg>',
    energia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
  };

  const PRODUCTS = [
    { id:'VIP1230B', cat:'cameras', name:'Câmera bullet VIP 1230 B', desc:'Câmera IP 2MP com infravermelho para uso externo, ideal para monitoramento de pátio e recepção.', price:249.90, stock:14, image:'camera-vip1230b.jpg' },
    { id:'VIP3230D', cat:'cameras', name:'Câmera dome VIP 3230 D', desc:'Câmera dome 2MP indicada para ambientes internos, corredores e salas de servidor.', price:279.90, stock:6, image:'camera-vip3230d.jpg' },
    { id:'MIBOCAM2', cat:'cameras', name:'Câmera Wi-Fi Mibo Cam 2', desc:'Câmera compacta para monitoramento remoto via aplicativo, uso em recepções e almoxarifados.', price:189.00, stock:7, image:'mibo-cam-2.jpg' },
    { id:'NVD1408', cat:'cameras', name:'Gravador NVD 1408', desc:'Gravador digital de vídeo em rede para até 8 canais, uso em salas de controle.', price:899.00, stock:3, image:'nvd1408.jpg' },

    { id:'ARF1200', cat:'redes', name:'Roteador Action RF 1200', desc:'Roteador wireless dual band para escritórios e salas de reunião de médio porte.', price:229.90, stock:20, image:'action-rf1200.jpg' },
    { id:'SG2404MR', cat:'redes', name:'Switch SG 2404 MR', desc:'Switch gerenciável 24 portas Gigabit, uso em racks de andar e salas técnicas.', price:1249.00, stock:5, image:'sg-2404-mr.jpg' },
    { id:'ACCESSPT', cat:'redes', name:'Access Point AP 1350', desc:'Ponto de acesso indicado para ampliar cobertura Wi-Fi em áreas comuns.', price:349.00, stock:9, image:'ap-1350.jpg' },
    { id:'PATCHCB5', cat:'redes', name:'Patch cord Cat5e (2m)', desc:'Cabo de rede para conexões de estação de trabalho e equipamentos de rack.', price:14.90, stock:120, image:'patch-cord-cat5e.jpg' },

    { id:'AMT8000', cat:'alarmes', name:'Central de alarme AMT 8000', desc:'Central monitorada para áreas restritas, compatível com sensores e controles remotos.', price:539.00, stock:4, image:'amt-8000.jpg' },
    { id:'IVPDUAL', cat:'alarmes', name:'Sensor infravermelho IVP Dual', desc:'Sensor de presença para proteção perimetral de salas e depósitos.', price:79.90, stock:18, image:'ivp-dual.jpg' },
    { id:'XAT4010', cat:'alarmes', name:'Sirene XAT 4010', desc:'Sirene externa com bateria reserva para uso em conjunto com centrais de alarme.', price:159.00, stock:7, image:'xat-4010.jpg' },

    { id:'TIP200LT', cat:'telefonia', name:'Telefone IP TIP 200 Lite', desc:'Aparelho IP para ramais internos, indicado para postos de atendimento.', price:219.00, stock:11, image:'tip-200-lite.jpg' },
    { id:'TS4010', cat:'telefonia', name:'Central telefônica TS 4010', desc:'Central PABX para pequenas filiais e escritórios remotos.', price:1890.00, stock:2, image:'ts-4010.jpg' },
    { id:'HEADSETPRO', cat:'telefonia', name:'Headset corporativo HS Pro', desc:'Headset com cancelamento de ruído para operadores de central de atendimento.', price:129.90, stock:25, image:'hs-pro.jpg' },

    { id:'NOBRK1200', cat:'energia', name:'Nobreak 1200 VA', desc:'Nobreak para estações de trabalho e equipamentos de rede em salas técnicas.', price:649.00, stock:8, image:'nobreak-1200va.jpg' },
    { id:'FILTLINHA', cat:'energia', name:'Filtro de linha 8 tomadas', desc:'Protetor contra surtos para bancadas e postos de trabalho.', price:44.90, stock:60, image:'filtro-linha-8-tomadas.jpg' },
  ];

  // Regras de negócio
  const MAX_PER_ITEM = 3;
  const LOW_STOCK_LIMIT = 5;

  // Saldo do centro de custo: ÚNICA constante, usada na pílula do
  // cabeçalho e na validação do carrinho. Valor a confirmar — troque só aqui.
  const COST_CENTER_BALANCE = 5200.00;

  // ------------------------------------------------------------
  // FRETE — ⚠ VALORES DE EXEMPLO: trocar pelos valores/prazos reais.
  // O frete é escolhido pelo estado (UF) do CEP informado no checkout e
  // é cobrado como um item "Frete" junto com o pedido no Mercado Pago.
  // Para usar uma transportadora/API de cotação, basta substituir a
  // função calcularFrete() em loja.js (ela recebe a UF e devolve opções).
  // ------------------------------------------------------------
  const FRETE_REGIOES = {
    SP: 'sudeste', RJ: 'sudeste', MG: 'sudeste', ES: 'sudeste',
    PR: 'sul', SC: 'sul', RS: 'sul',
    DF: 'centroeste', GO: 'centroeste', MT: 'centroeste', MS: 'centroeste',
    BA: 'nordeste', SE: 'nordeste', AL: 'nordeste', PE: 'nordeste', PB: 'nordeste',
    RN: 'nordeste', CE: 'nordeste', PI: 'nordeste', MA: 'nordeste',
    AM: 'norte', PA: 'norte', AC: 'norte', RO: 'norte', RR: 'norte', AP: 'norte', TO: 'norte',
  };

  // preco em R$; prazo em dias úteis [mínimo, máximo]
  const FRETE_OPCOES = {
    sudeste:    [{ id: 'padrao', nome: 'Entrega padrão',   preco: 16.90, prazo: [3, 5] },
                 { id: 'expressa', nome: 'Entrega expressa', preco: 29.90, prazo: [1, 2] }],
    sul:        [{ id: 'padrao', nome: 'Entrega padrão',   preco: 21.90, prazo: [4, 6] },
                 { id: 'expressa', nome: 'Entrega expressa', preco: 36.90, prazo: [2, 3] }],
    centroeste: [{ id: 'padrao', nome: 'Entrega padrão',   preco: 24.90, prazo: [5, 7] },
                 { id: 'expressa', nome: 'Entrega expressa', preco: 39.90, prazo: [2, 4] }],
    nordeste:   [{ id: 'padrao', nome: 'Entrega padrão',   preco: 29.90, prazo: [6, 9] },
                 { id: 'expressa', nome: 'Entrega expressa', preco: 49.90, prazo: [3, 5] }],
    norte:      [{ id: 'padrao', nome: 'Entrega padrão',   preco: 34.90, prazo: [8, 12] },
                 { id: 'expressa', nome: 'Entrega expressa', preco: 54.90, prazo: [4, 7] }],
  };

  // ------------------------------------------------------------
  // CUPONS — percentuais. Vazio por padrão (nenhum cupom válido).
  // Exemplo:  INTEL10: { tipo: 'percent', valor: 10 }
  // ------------------------------------------------------------
  const CUPONS = {
    // INTEL10: { tipo: 'percent', valor: 10 },
  };

  const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

  window.LojaDados = {
    IMG_BASE, CATEGORIES, ICONS, PRODUCTS,
    MAX_PER_ITEM, LOW_STOCK_LIMIT, COST_CENTER_BALANCE,
    FRETE_REGIOES, FRETE_OPCOES, CUPONS, ESTADOS,
  };
})();
