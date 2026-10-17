// ============================================================
// LOJA — Integração com o servidor AWS (única porta de saída)
//
// Contrato (NÃO alterar):
//   POST http://44.204.128.56:3000/criar-pagamento
//   Headers: Content-Type: application/json
//   Body:    { "items": [ { id, title, quantity, unit_price } ] }
//   Sucesso: { "init_point": "https://..." }
//
// Para trocar o servidor depois, altere só API_BASE_URL.
// ============================================================
(function () {
  'use strict';

  const API_BASE_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'https://portal-intelbras.duckdns.org'
    : '';
  const PATH_CRIAR_PAGAMENTO = '/criar-pagamento';

  /**
   * Envia os itens do carrinho e devolve o JSON do servidor
   * (esperado: { init_point }). Erros de rede/JSON sobem (throw)
   * para o chamador tratar no catch.
   * @param {{id:string,title:string,quantity:number,unit_price:number}[]} items
   */
  async function criarPagamento(items, emailComprovante, codigoLoja) {
    const resp = await fetch(API_BASE_URL + PATH_CRIAR_PAGAMENTO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, email_comprovante: emailComprovante || null, codigo_loja: codigoLoja || null }),
    });
    return resp.json();
  }

  /**
   * Consulta de CEP (ViaCEP, serviço público). Devolve
   * { logradouro, bairro, localidade, uf } ou null se o CEP não existir.
   * Erros de rede sobem (throw) para o chamador tratar.
   * @param {string} cep somente dígitos (8)
   */
  async function buscarCep(cep) {
    const resp = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
    if (!resp.ok) throw new Error('ViaCEP HTTP ' + resp.status);
    const d = await resp.json();
    return d && !d.erro ? d : null;
  }

  /**
   * Cotação de frete no nosso PHP (api/loja/frete.php -> Melhor Envio).
   * Devolve { opcoes:[{ id, nome, preco, prazo:[min,max] }], estimado }; lança erro se a cotação
   * não estiver disponível (o chamador usa a tabela por região como reserva).
   * @param {string} cep somente dígitos (8)
   * @param {{id:string,quantidade:number,preco:number}[]} itens
   */
  async function cotarFrete(cep, itens) {
    const resp = await fetch('api/loja/frete.php', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cep, itens }),
    });
    const d = await resp.json();
    if (!resp.ok || !d || d.sucesso !== true || !Array.isArray(d.opcoes) || !d.opcoes.length) {
      throw new Error('Cotação indisponível' + (d && d.motivo ? ' (' + d.motivo + ')' : ''));
    }
    return { opcoes: d.opcoes, estimado: d.estimado === true };
  }

  /** Histórico de compras do usuário logado (api/loja/pedidos.php). */
  async function listarPedidos() {
    const resp = await fetch('api/loja/pedidos.php', { credentials: 'same-origin', cache: 'no-store' });
    let d = null;
    try { d = await resp.json(); } catch (_) { /* resposta não-JSON */ }
    if (!resp.ok || !d || d.sucesso !== true) throw new Error((d && d.erro) || 'Erro ao carregar compras');
    return d.pedidos || [];
  }

  /** Registra o pedido quando o pagamento é iniciado. Devolve o código do pedido. */
  async function registrarPedido(pedido) {
    const resp = await fetch('api/loja/pedidos.php', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido),
    });
    const d = await resp.json();
    if (!resp.ok || !d || d.sucesso !== true) throw new Error((d && d.erro) || 'Erro ao registrar pedido');
    return d.codigo;
  }

  /* ---------------- Catálogo e estoque (api/loja/produtos.php · pedidos.php) ---------------- */

  /** Erro de API com o que o servidor devolveu (status HTTP, campo do formulário, "estoque"). */
  function erroApi(resp, d, padrao) {
    const e = new Error((d && d.erro) || padrao);
    e.status = resp ? resp.status : 0;
    e.campo = (d && d.campo) || null;
    e.estoque = !!(d && d.estoque);
    e.cupom = !!(d && d.cupom === true);   // o servidor recusou por causa do cupom (some do carrinho)
    return e;
  }

  async function lerJson(resp) {
    try { return await resp.json(); } catch (_) { return null; }   // resposta não-JSON (ex.: erro do servidor)
  }

  /** Catálogo atual: { admin, categorias:[{id,nome}], produtos:[{id,cat,name,desc,price,stock,image,max}] } */
  async function listarProdutos() {
    const resp = await fetch('api/loja/produtos.php', { credentials: 'same-origin', cache: 'no-store' });
    const d = await lerJson(resp);
    if (!resp.ok || !d || d.sucesso !== true || !Array.isArray(d.produtos)) {
      throw erroApi(resp, d, 'Não foi possível carregar os produtos.');
    }
    return d;
  }

  /**
   * Administrador: acao = 'criar' | 'editar' | 'remover'. `campos` = objeto simples (a imagem vai em `arquivo`).
   * Devolve { produto?, produtos } (lista atualizada).
   */
  async function salvarProduto(acao, campos, arquivo, csrf) {
    const fd = new FormData();
    fd.append('acao', acao);
    Object.keys(campos || {}).forEach((k) => { if (campos[k] != null) fd.append(k, campos[k]); });
    if (arquivo) fd.append('imagem', arquivo);
    let resp;
    try {
      resp = await fetch('api/loja/produtos.php', {
        method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf || '' }, body: fd,
      });
    } catch (_) {
      throw erroApi(null, null, 'Sem conexão com o servidor. Tente novamente.');
    }
    const d = await lerJson(resp);
    if (!resp.ok || !d || d.sucesso !== true) throw erroApi(resp, d, 'Não foi possível salvar o item.');
    return d;
  }

  async function postPedido(corpo, padrao) {
    const resp = await fetch('api/loja/pedidos.php', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    const d = await lerJson(resp);
    if (!resp.ok || !d || d.sucesso !== true) throw erroApi(resp, d, padrao);
    return d;
  }

  /** Baixa o estoque e grava o pedido "iniciado" ANTES do pagamento. Devolve o código. 409 = sem estoque. */
  async function reservarPedido(pedido) {
    return (await postPedido(Object.assign({ acao: 'reservar' }, pedido), 'Não foi possível reservar os itens.')).codigo;
  }
  /** Liga o pedido ao link do Mercado Pago. */
  function vincularPedido(codigo, initPoint) {
    return postPedido({ acao: 'vincular', codigo, init_point: initPoint }, 'Não foi possível vincular o pedido.');
  }
  /** O pagamento não foi gerado: apaga o pedido e devolve o estoque. */
  function cancelarPedido(codigo) {
    return postPedido({ acao: 'cancelar', codigo }, 'Não foi possível cancelar o pedido.');
  }

  /* ---------------- Cupons (api/loja/cupom.php) ---------------- */

  /**
   * Pergunta ao servidor se o cupom vale para este carrinho.
   * Devolve { cupom:{codigo,tipo,valor,minimo}, desconto }; lança erro com a mensagem pronta para a tela.
   * @param {string} codigo
   * @param {{id:string,quantidade:number}[]} itens
   */
  async function validarCupom(codigo, itens) {
    let resp;
    try {
      resp = await fetch('api/loja/cupom.php', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'validar', codigo, itens }),
      });
    } catch (_) {
      throw erroApi(null, null, 'Sem conexão com o servidor. Tente novamente.');
    }
    const d = await lerJson(resp);
    if (!resp.ok || !d || d.sucesso !== true || !d.cupom) {
      throw erroApi(resp, d, 'Não foi possível validar o cupom. Tente novamente.');
    }
    return d;
  }

  /**
   * Administrador: acao = 'listar' | 'criar' | 'editar' | 'alternar' | 'remover'.
   * Devolve { cupons } (lista atualizada).
   */
  async function cuponsAdmin(acao, campos, csrf) {
    let resp;
    try {
      resp = await fetch('api/loja/cupom.php', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf || '' },
        body: JSON.stringify(Object.assign({ acao }, campos || {})),
      });
    } catch (_) {
      throw erroApi(null, null, 'Sem conexão com o servidor. Tente novamente.');
    }
    const d = await lerJson(resp);
    if (!resp.ok || !d || d.sucesso !== true) throw erroApi(resp, d, 'Não foi possível concluir a operação com o cupom.');
    return d;
  }

  window.LojaApi = {
    API_BASE_URL, PATH_CRIAR_PAGAMENTO, criarPagamento, buscarCep, cotarFrete, listarPedidos, registrarPedido,
    listarProdutos, salvarProduto, reservarPedido, vincularPedido, cancelarPedido,
    validarCupom, cuponsAdmin,
  };
})();
