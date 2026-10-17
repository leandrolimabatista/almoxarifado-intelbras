// ============================================================
// CONTEÚDO — Loja (área CADASTRADO)
// Interface da loja: filtros, ordenação, cards, carrinho lateral
// e checkout (contato -> entrega -> frete -> CPF/CNPJ -> pagar),
// finalizando no Mercado Pago via servidor AWS.
//
// Depende de (carregados antes, na ordem):
//   loja.dados.js -> window.LojaDados (catálogo, regras, frete, cupons)
//   loja.api.js   -> window.LojaApi   (POST AWS + consulta de CEP)
// ============================================================
(function () {
  'use strict';

  const D = window.LojaDados;
  const API = window.LojaApi;
  if (!D || !API) return;

  const { ICONS, IMG_BASE, MAX_PER_ITEM, LOW_STOCK_LIMIT, COST_CENTER_BALANCE,
    FRETE_REGIOES, FRETE_OPCOES, CUPOM_MAX_PERCENT, ESTADOS } = D;

  // Catálogo e categorias vêm do banco (api/loja/produtos.php). LojaDados.PRODUCTS é o catálogo
  // antigo, fixo no JS, e não é mais usado.
  let PRODUCTS = [];
  let CATEGORIES = D.CATEGORIES.slice();

  /* ---------------- Estado ---------------- */
  let currentCategory = 'all';
  let searchTerm = '';
  let sortMode = 'default';
  let cart = {};          // id -> qty
  let tela = 'vitrine';   // vitrine | checkout
  let cupom = null;       // { codigo, tipo:'percent'|'valor', valor, minimo } — já validado pelo servidor
  let cupomAberto = false;
  let cupomCarregando = false;
  let frete = null;       // opção de frete escolhida no checkout
  let upsellIdx = 0;      // "Que tal levar também"
  let catalogoEstado = 'loading';   // loading | ok | erro
  let catalogoErro = '';
  let catalogoToken = 0;
  const nomesCarrinho = {};         // id -> nome (para avisar quando um item sai da Loja)

  /* ---------------- Elementos ---------------- */
  const $ = (id) => document.getElementById(id);
  const grid = $('lojaGrid');
  const drawer = $('lojaDrawer');
  const overlay = $('lojaOverlay');
  const catBtn = $('lojaCatBtn');
  const catPanel = $('lojaCatPanel');
  const catWrap = $('lojaCatWrap');
  if (!grid || !drawer) return;

  // Administrador (id 1): o PHP marca o <main> com data-admin e o token CSRF. O servidor confere de novo.
  const mainEl = document.querySelector('.loja__main');
  const ADMIN = !!(mainEl && mainEl.dataset.admin === '1');
  const CSRF = (mainEl && mainEl.dataset.csrf) || '';

  /* ---------------- Utilitários ---------------- */
  function fmtBRL(v) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  const findProduct = (id) => PRODUCTS.find((p) => p.id === id);
  // Quantas unidades de um produto cabem no pedido: o menor entre o limite dele e o estoque.
  const limiteItem = (p) => Math.min(p.max || MAX_PER_ITEM, p.stock);

  /* ---------------- Filtro / ordenação ---------------- */
  function getFilteredProducts() {
    let list = PRODUCTS.filter((p) => {
      const matchCat = currentCategory === 'all' || p.cat === currentCategory;
      const matchSearch = !searchTerm ||
        p.name.toLowerCase().includes(searchTerm) ||
        p.id.toLowerCase().includes(searchTerm);
      return matchCat && matchSearch;
    });
    if (sortMode === 'price-asc') list = [...list].sort((a, b) => a.price - b.price);
    if (sortMode === 'price-desc') list = [...list].sort((a, b) => b.price - a.price);
    if (sortMode === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }

  /* ---------------- Cabeçalho da página ---------------- */
  function updatePageHead() {
    const title = $('lojaTitulo');
    const sub = $('lojaSubtitulo');
    const filtrando = currentCategory !== 'all' || searchTerm !== '';

    title.textContent = currentCategory === 'all'
      ? 'Loja'
      : CATEGORIES.find((c) => c.id === currentCategory).label;

    if (!filtrando) {
      sub.textContent = 'Produtos e equipamentos Intelbras para sua equipe.';
    } else {
      const n = getFilteredProducts().length;
      sub.textContent = `${n} ${n === 1 ? 'item disponível' : 'itens disponíveis'} para retirada interna`;
    }

    $('lojaCatLabel').textContent = currentCategory === 'all'
      ? 'Categorias'
      : CATEGORIES.find((c) => c.id === currentCategory).label;
  }

  /* ---------------- Dropdown de categorias ---------------- */
  function renderCategoryPanel() {
    const counts = { all: PRODUCTS.length };
    CATEGORIES.forEach((c) => { counts[c.id] = PRODUCTS.filter((p) => p.cat === c.id).length; });

    const item = (id, label) => `
      <button type="button" role="option" class="loja__cat-item${currentCategory === id ? ' is-active' : ''}"
              data-cat="${id}" aria-selected="${currentCategory === id}">
        <span>${label}</span><span class="loja__cat-count">${counts[id]}</span>
      </button>`;

    catPanel.innerHTML = item('all', 'Todos os itens') +
      CATEGORIES.map((c) => item(c.id, c.label)).join('');
  }

  function isCatOpen() { return catWrap.classList.contains('is-open'); }
  function openCat() {
    catWrap.classList.add('is-open');
    catBtn.setAttribute('aria-expanded', 'true');
  }
  function closeCat() {
    catWrap.classList.remove('is-open');
    catBtn.setAttribute('aria-expanded', 'false');
  }

  catBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isCatOpen() ? closeCat() : openCat();
  });
  catPanel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    currentCategory = b.dataset.cat;
    renderCategoryPanel();
    renderGrid();
    updatePageHead();
    closeCat();
  });
  document.addEventListener('click', (e) => {
    if (isCatOpen() && !catWrap.contains(e.target)) closeCat();
  });

  /* ---------------- Grid de produtos ---------------- */
  function renderGrid() {
    if (!PRODUCTS.length && catalogoEstado === 'loading') {
      grid.innerHTML = '<div class="loja__vazio">Carregando produtos...</div>';
      return;
    }
    if (!PRODUCTS.length && catalogoEstado === 'erro') {
      grid.innerHTML = `<div class="loja__vazio">${esc(catalogoErro)}<br>
        <button type="button" class="lcompra__retry" data-catalogo-recarregar>Tentar de novo</button></div>`;
      return;
    }

    const items = getFilteredProducts();

    if (items.length === 0) {
      grid.innerHTML = '<div class="loja__vazio">' + (PRODUCTS.length
        ? 'Nenhum item encontrado para essa busca.'
        : 'Nenhum item na Loja ainda.' + (ADMIN ? '<br>Use “Adicionar item” para cadastrar o primeiro.' : '')) + '</div>';
      return;
    }

    grid.innerHTML = items.map((p) => {
      const out = p.stock === 0;
      const tagCls = out ? 'out' : p.stock <= LOW_STOCK_LIMIT ? 'low' : 'ok';
      const tagTxt = out ? 'Esgotado' : `${p.stock} em estoque`;

      const control = out
        ? '<button type="button" class="loja__add" disabled>Indisponível</button>'
        : `<button type="button" class="loja__add" data-add="${esc(p.id)}">${ICON_CART}<span>Comprar</span></button>`;

      const midia = p.image
        ? `<img src="${esc(IMG_BASE + p.image)}" alt="${esc(p.name)}" loading="lazy">`
        : `<span class="loja__fallback" aria-hidden="true">${ICONS[p.cat] || ''}</span>`;

      const admin = ADMIN ? `
          <div class="loja__card-admin">
            <button type="button" class="loja__card-btn" data-editar="${esc(p.id)}" aria-label="Editar ${esc(p.name)}" title="Editar item">${ICON_EDIT}</button>
            <button type="button" class="loja__card-btn loja__card-btn--perigo" data-remover="${esc(p.id)}" aria-label="Remover ${esc(p.name)}" title="Remover item">${ICON_TRASH}</button>
          </div>` : '';

      return `
      <article class="loja__card" data-id="${esc(p.id)}">
        <div class="loja__card-media" data-cat="${esc(p.cat)}">
          <span class="loja__tag loja__tag--${tagCls}">${tagTxt}</span>
          ${admin}
          ${midia}
        </div>
        <div class="loja__card-body">
          <span class="loja__sku">${esc(p.id)}</span>
          <h3 class="loja__card-title">${esc(p.name)}</h3>
          <p class="loja__card-desc">${esc(p.desc)}</p>
          <div class="loja__card-foot">
            <div class="loja__price">${fmtBRL(p.price)}<small>/un</small></div>
            ${control}
          </div>
        </div>
      </article>`;
    }).join('');

    // Fallback: foto não carregou -> ícone da categoria
    grid.querySelectorAll('.loja__card-media img').forEach((img) => {
      const fallback = () => {
        const media = img.parentElement;
        img.remove();
        if (!media.querySelector('.loja__fallback')) {
          media.insertAdjacentHTML('beforeend',
            `<span class="loja__fallback" aria-hidden="true">${ICONS[media.dataset.cat] || ''}</span>`);
        }
      };
      img.addEventListener('error', fallback, { once: true });
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) fallback();
    });
  }

  // Delegação de eventos dos botões do card
  grid.addEventListener('click', (e) => {
    if (e.target.closest('[data-catalogo-recarregar]')) { carregarCatalogo(false); return; }
    const ed = e.target.closest('[data-editar]');
    const rm = e.target.closest('[data-remover]');
    if (ed || rm) {
      const p = findProduct((ed || rm).dataset[ed ? 'editar' : 'remover']);
      if (!p) return;
      if (ed) abrirFormProduto(p); else removerItem(p);
      return;
    }
    const add = e.target.closest('[data-add]');
    if (!add) return;
    addToCart(add.dataset.add);
    openDrawer();
  });

  // Botão direito num produto: menu padronizado do site (assets/js/menu-contexto.js).
  // Shift + botão direito abre o menu do navegador.
  grid.addEventListener('contextmenu', (e) => {
    const M = window.MenuContexto;
    const card = e.target.closest('.loja__card');
    if (!M || !card || e.shiftKey || M.temSelecao()) return;
    const sku = card.querySelector('.loja__sku');
    const product = sku && findProduct(sku.textContent.trim());
    if (!product) return;
    e.preventDefault();
    const pos = M.posicao(e, card);
    const esgotado = product.stock === 0;
    const noLimite = (cart[product.id] || 0) >= limiteItem(product);
    M.mostrar({
      x: pos.x, y: pos.y, alvo: null,
      aria: 'Opções de ' + product.name,
      cabeca: M.cabeca('carrinho', product.name),
      opcoes: [
        { rotulo: esgotado ? 'Produto esgotado' : (noLimite ? 'Limite no carrinho' : 'Adicionar ao carrinho'),
          icone: 'carrinho', destaque: true, desabilitado: esgotado || noLimite,
          acao: () => { addToCart(product.id); openDrawer(); } },
        { rotulo: 'Abrir carrinho', icone: 'carrinho', acao: () => openDrawer() },
        'sep',
        { rotulo: 'Copiar código do produto', icone: 'codigo', acao: () => M.copiar(product.id, 'Código copiado') },
        { rotulo: 'Copiar nome', icone: 'copiar', acao: () => M.copiar(product.name, 'Nome copiado') },
      ].concat(ADMIN ? [
        'sep',
        { rotulo: 'Editar item', icone: 'editar', acao: () => abrirFormProduto(product) },
        { rotulo: 'Remover item', icone: 'lixeira', perigo: true, acao: () => removerItem(product) },
      ] : []),
    });
  });

  /* ---------------- Utilitários da compra ---------------- */
  const round2 = (n) => Math.round(n * 100) / 100;
  const soDig = (v) => String(v || '').replace(/\D/g, '');
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- Carrinho ---------------- */
  function addToCart(id) {
    const product = findProduct(id);
    if (!product) return;
    const current = cart[id] || 0;
    if (current >= limiteItem(product)) return;
    cart[id] = current + 1;
    nomesCarrinho[id] = product.name;
    afterCartChange();
  }
  function decFromCart(id) {
    if (!cart[id]) return;
    cart[id] -= 1;
    if (cart[id] <= 0) delete cart[id];
    afterCartChange();
  }
  function removeFromCart(id) {
    delete cart[id];
    afterCartChange();
  }
  function afterCartChange() {
    conferirCupom();
    renderGrid();
    updateCartCount();
    renderDrawer();
    if (tela === 'checkout') {
      if (cartItemCount() === 0) voltarVitrine(); else renderResumo();
    }
  }
  function cartItemCount() {
    return Object.values(cart).reduce((a, b) => a + b, 0);
  }
  function updateCartCount() {
    const badge = $('carrinhoBadge');
    if (badge) badge.textContent = cartItemCount();
  }

  /* ---------------- Valores e cupom ----------------
     Tudo em CENTAVOS INTEIROS: é o mesmo cálculo de api/loja/_cupons.php (cupom_ratear). O preço do
     item no pedido é sempre o de tabela; o desconto é calculado à parte. O servidor recalcula ao
     reservar o pedido e recusa se o valor mostrado aqui for diferente. */
  const centavos = (v) => Math.round(v * 100);

  // linhas = [{ preco, qtd }] (preço unitário de tabela, em centavos) · c = { tipo, valor } ou null
  // Devolve { desconto, linhas:[desconto de cada linha] }, tudo em centavos.
  function ratearCupom(linhas, c) {
    const n = linhas.length;
    const descs = new Array(n).fill(0);
    if (!c || !n) return { desconto: 0, linhas: descs };
    const totais = linhas.map((l) => l.preco * l.qtd);
    const sub = totais.reduce((a, b) => a + b, 0);
    if (sub <= 0) return { desconto: 0, linhas: descs };

    if (c.tipo === 'percent') {
      // cada UNIDADE é arredondada em centavos (meio centavo sobe)
      const bp = Math.max(0, Math.min(CUPOM_MAX_PERCENT * 100, centavos(c.valor)));
      linhas.forEach((l, i) => {
        let unit = Math.floor((l.preco * (10000 - bp) + 5000) / 10000);
        unit = Math.max(1, Math.min(l.preco, unit));
        descs[i] = (l.preco - unit) * l.qtd;
      });
    } else {
      // R$ fixo dividido pelas linhas na proporção do total de cada uma; teto de 90% do subtotal
      const teto = Math.floor((sub * CUPOM_MAX_PERCENT) / 100);
      const alvo = Math.max(0, Math.min(centavos(c.valor), teto));
      let dado = 0;
      linhas.forEach((l, i) => {
        descs[i] = Math.min(Math.floor((alvo * totais[i]) / sub), Math.max(0, totais[i] - l.qtd));   // ao menos 1 centavo por unidade
        dado += descs[i];
      });
      let resto = alvo - dado;
      for (let volta = 0; resto > 0 && volta < n + 1; volta++) {
        linhas.forEach((l, i) => {
          if (resto > 0 && descs[i] < totais[i] - l.qtd) { descs[i]++; resto--; }   // deixa ao menos 1 centavo por unidade
        });
      }
    }
    return { desconto: descs.reduce((a, b) => a + b, 0), linhas: descs };
  }

  function rateioAtual() {
    const ids = Object.keys(cart);
    const r = ratearCupom(ids.map((id) => ({ preco: centavos(findProduct(id).price), qtd: cart[id] })), cupom);
    const porId = {};
    ids.forEach((id, i) => { porId[id] = r.linhas[i]; });
    return { desconto: r.desconto, porId };
  }
  // Total da linha já com o desconto (para mostrar no carrinho e no resumo)
  function linhaLiquida(id) {
    return (centavos(findProduct(id).price) * cart[id] - rateioAtual().porId[id]) / 100;
  }
  function subtotalBruto() {
    return round2(Object.entries(cart).reduce((s, [id, q]) => s + findProduct(id).price * q, 0));
  }
  function descontoTotal() { return rateioAtual().desconto / 100; }
  function subtotal() { return round2(subtotalBruto() - descontoTotal()); }   // já sem o desconto
  function totalPedido() { return round2(subtotal() + (frete ? frete.preco : 0)); }

  /* ---------------- Cupom ---------------- */
  function cupomRotulo(c) {
    return c.tipo === 'percent' ? `−${String(c.valor).replace('.', ',')}%` : `−${fmtBRL(c.valor)}`;
  }

  // Quem diz se o cupom vale é o servidor (api/loja/cupom.php): ativo, validade, limite de usos,
  // uso por usuário e valor mínimo.
  async function aplicarCupom(raw) {
    const codigo = String(raw || '').trim().toUpperCase();
    if (!codigo) return { ok: false, msg: 'Digite o código do cupom.' };
    if (cartItemCount() === 0) return { ok: false, msg: 'Seu carrinho está vazio.' };
    try {
      const d = await API.validarCupom(codigo, Object.keys(cart).map((id) => ({ id, quantidade: cart[id] })));
      cupom = { codigo: d.cupom.codigo, tipo: d.cupom.tipo, valor: d.cupom.valor, minimo: d.cupom.minimo };
      return { ok: true };
    } catch (err) {
      return { ok: false, msg: err.message || 'Não foi possível validar o cupom.' };
    }
  }

  // Se o carrinho encolheu abaixo do mínimo do cupom, o cupom sai (o servidor também confere ao reservar).
  function conferirCupom() {
    if (!cupom || cartItemCount() === 0) return;
    if (cupom.minimo && subtotalBruto() < cupom.minimo) {
      const c = cupom;
      cupom = null;
      setTimeout(() => mostrarMensagem(
        `O cupom ${c.codigo} vale para compras a partir de ${fmtBRL(c.minimo)} em produtos e foi removido.`, 'Cupom ⚠️'), 0);
    }
  }

  // Cliques de cupom (compartilhado entre o carrinho lateral e o resumo do checkout)
  function tratarCupom(e, root) {
    const toggle = e.target.closest('[data-cupom-toggle]');
    const aplicar = e.target.closest('[data-cupom-aplicar]');
    const remover = e.target.closest('[data-cupom-remover]');
    if (toggle) {
      cupomAberto = !cupomAberto;
      renderDrawer();
      if (cupomAberto) { const i = drawer.querySelector('[data-cupom-input]'); if (i) i.focus(); }
      return true;
    }
    if (aplicar) {
      if (cupomCarregando) return true;
      const input = root.querySelector('[data-cupom-input]');
      const msg = root.querySelector('[data-cupom-msg]');
      if (msg) msg.textContent = '';
      cupomCarregando = true;
      aplicar.disabled = true;
      aplicar.textContent = 'Aplicando...';
      aplicarCupom(input ? input.value : '').then((r) => {
        cupomCarregando = false;
        if (r.ok) { cupomAberto = false; afterCartChange(); return; }
        aplicar.disabled = false;
        aplicar.textContent = 'Aplicar';
        if (msg) msg.textContent = r.msg;
      });
      return true;
    }
    if (remover) { cupom = null; afterCartChange(); return true; }
    return false;
  }

  /* ---------------- Miniaturas ---------------- */
  function thumbHTML(p) {
    const miolo = p.image ? `<img src="${esc(IMG_BASE + p.image)}" alt="" loading="lazy">` : (ICONS[p.cat] || '');
    return `<span class="lcart__thumb" data-cat="${esc(p.cat)}">${miolo}</span>`;
  }
  function thumbFallback(root) {
    root.querySelectorAll('.lcart__thumb img').forEach((img) => {
      const fb = () => {
        const box = img.parentElement;
        img.remove();
        if (!box.querySelector('svg')) box.insertAdjacentHTML('beforeend', ICONS[box.dataset.cat] || '');
      };
      img.addEventListener('error', fb, { once: true });
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) fb();
    });
  }

  /* ---------------- Carrinho lateral (drawer) ---------------- */
  function ajustarTopoDrawer() {
    const h = document.querySelector('.header');
    const top = h ? Math.max(0, Math.round(h.getBoundingClientRect().bottom)) : 0;
    drawer.style.top = top + 'px';
    drawer.style.height = `calc(100% - ${top}px)`;
    overlay.style.top = top + 'px';
  }
  function isDrawerOpen() { return drawer.classList.contains('is-open'); }
  function openDrawer() {
    ajustarTopoDrawer();
    abaDrawer = 'carrinho';   // o botão do carrinho sempre abre na aba Carrinho
    renderDrawer();
    drawer.classList.add('is-open');
    overlay.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    drawer.classList.remove('is-open');
    overlay.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
  }
  function toggleDrawer() { isDrawerOpen() ? closeDrawer() : openDrawer(); }
  window.addEventListener('resize', () => { if (isDrawerOpen()) ajustarTopoDrawer(); });

  // "Que tal levar também": produtos fora do carrinho, começando pelas
  // categorias que o cliente já está comprando.
  function sugestoes() {
    const cats = new Set(Object.keys(cart).map((id) => findProduct(id).cat));
    const livres = PRODUCTS.filter((p) => !cart[p.id] && p.stock > 0);
    return [...livres.filter((p) => cats.has(p.cat)), ...livres.filter((p) => !cats.has(p.cat))];
  }

  /* ---------------- Abas do drawer: Carrinho | Compras ---------------- */
  let abaDrawer = 'carrinho';
  let compras = null;            // lista carregada (null = ainda não)
  let comprasEstado = 'idle';    // idle | loading | ok | erro
  let comprasErro = '';

  const STATUS_COMPRA = {
    iniciado:  { txt: 'Pagamento iniciado', cls: 'iniciado' },
    pago:      { txt: 'Pago',               cls: 'pago' },
    cancelado: { txt: 'Cancelado',          cls: 'cancelado' },
  };
  const fmtDataHora = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  function trocarAba(aba) {
    abaDrawer = aba;
    if (aba === 'compras') carregarCompras();
    renderDrawer();
  }
  function carregarCompras() {
    comprasEstado = 'loading';
    API.listarPedidos()
      .then((lista) => { compras = lista; comprasEstado = 'ok'; })
      .catch((err) => { console.error(err); comprasEstado = 'erro'; comprasErro = err.message; })
      .finally(() => { if (abaDrawer === 'compras') renderDrawer(); });
  }

  function renderCompras() {
    const body = $('lojaDrawerBody');
    $('lojaDrawerFoot').innerHTML = '';
    $('lojaDrawerTitulo').textContent = 'Minhas compras';

    if (comprasEstado === 'loading' && !compras) {
      body.innerHTML = '<div class="loja__cart-vazio">Carregando suas compras...</div>';
      return;
    }
    if (comprasEstado === 'erro' && !compras) {
      body.innerHTML = `<div class="loja__cart-vazio">Não foi possível carregar suas compras agora.<br>
        <button type="button" class="lcompra__retry" data-compras-recarregar>Tentar de novo</button></div>`;
      return;
    }
    if (!compras || !compras.length) {
      body.innerHTML = '<div class="loja__cart-vazio">Você ainda não fez nenhuma compra.<br>Seus pedidos vão aparecer aqui.</div>';
      return;
    }
    body.innerHTML = compras.map((c) => {
      const st = STATUS_COMPRA[c.status] || STATUS_COMPRA.iniciado;
      const qtd = c.itens.reduce((n, i) => n + i.quantidade, 0);
      const linhas = c.itens.map((i) => `
        <div class="lcompra__item"><span>${i.quantidade}× ${esc(i.nome)}</span><span>${fmtBRL(round2(i.preco * i.quantidade))}</span></div>`).join('');
      const entrega = c.cidade ? `${esc(c.cidade)}${c.uf ? ' - ' + esc(c.uf) : ''}` : '';
      return `
        <details class="lcompra">
          <summary>
            <span class="lcompra__top">
              <strong class="lcompra__cod">${esc(c.codigo)}</strong>
              <span class="lcompra__status lcompra__status--${st.cls}">${st.txt}</span>
            </span>
            <span class="lcompra__meta"><span>${fmtDataHora(c.criado_em)}</span><span>${qtd} ${qtd === 1 ? 'item' : 'itens'}</span></span>
            <span class="lcompra__total"><span>Total</span><strong>${fmtBRL(c.total)}</strong></span>
          </summary>
          <div class="lcompra__det">
            ${linhas}
            ${c.cupom ? `<div class="lcompra__item lcompra__item--dim"><span>Cupom ${esc(c.cupom)}</span><span>${c.desconto > 0 ? '−' + fmtBRL(c.desconto) : 'aplicado'}</span></div>` : ''}
            <div class="lcompra__item lcompra__item--dim"><span>Frete${c.frete_nome ? ' · ' + esc(c.frete_nome) : ''}</span><span>${c.frete > 0 ? fmtBRL(c.frete) : 'Grátis'}</span></div>
            ${entrega ? `<div class="lcompra__item lcompra__item--dim"><span>Entrega</span><span>${entrega}</span></div>` : ''}
            <button type="button" class="lcompra__again" data-recomprar="${esc(c.codigo)}">Comprar novamente</button>
          </div>
        </details>`;
    }).join('');
  }

  function recomprar(codigo) {
    const c = (compras || []).find((x) => x.codigo === codigo);
    if (!c) return;
    let faltou = false;
    c.itens.forEach((i) => {
      const p = findProduct(i.id);
      if (!p || p.stock <= 0) { faltou = true; return; }
      for (let k = 0; k < i.quantidade; k++) addToCart(i.id);   // respeita limite por item e estoque
      if ((cart[i.id] || 0) < i.quantidade) faltou = true;
    });
    abaDrawer = 'carrinho';
    renderDrawer();
    if (faltou) mostrarMensagem('Alguns itens não estão mais disponíveis na quantidade original e foram ajustados.');
  }

  function atualizarAbas() {
    drawer.querySelectorAll('[data-aba]').forEach((b) => {
      const ativa = b.dataset.aba === abaDrawer;
      b.classList.toggle('is-active', ativa);
      b.setAttribute('aria-selected', ativa ? 'true' : 'false');
    });
  }

  function renderDrawer() {
    const body = $('lojaDrawerBody');
    const foot = $('lojaDrawerFoot');
    const title = $('lojaDrawerTitulo');
    const n = cartItemCount();

    atualizarAbas();
    if (abaDrawer === 'compras') { renderCompras(); return; }
    title.textContent = n ? `Carrinho • ${n}` : 'Carrinho';

    if (n === 0) {
      body.innerHTML = '<div class="loja__cart-vazio">Seu carrinho está vazio.<br>Adicione itens do catálogo para começar.</div>';
      foot.innerHTML = '';
      return;
    }

    let noLimite = false;
    const itens = Object.keys(cart).map((id) => {
      const p = findProduct(id);
      const qty = cart[id];
      const max = limiteItem(p);
      if (qty >= max) noLimite = true;
      return `
        <div class="lcart__item">
          ${thumbHTML(p)}
          <div class="lcart__info">
            <div class="lcart__top">
              <span class="lcart__name">${esc(p.name)}</span>
              <span class="lcart__price">${fmtBRL(linhaLiquida(id))}</span>
            </div>
            <div class="lcart__sku">${esc(p.id)}</div>
            <div class="lcart__ctrl">
              <button type="button" class="lcart__trash" data-remove="${esc(id)}" aria-label="Remover ${esc(p.name)}">${ICON_TRASH}</button>
              <div class="loja__stepper">
                <button type="button" data-dec="${esc(id)}" aria-label="Diminuir">−</button>
                <span>${qty}</span>
                <button type="button" data-inc="${esc(id)}" aria-label="Aumentar" ${qty >= max ? 'disabled' : ''}>+</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    const sug = sugestoes();
    let upsell = '';
    if (sug.length) {
      const p = sug[((upsellIdx % sug.length) + sug.length) % sug.length];
      upsell = `
        <div class="lcart__upsell">
          <div class="lcart__upsell-head">
            <span>Que tal levar também</span>
            ${sug.length > 1 ? `<div class="lcart__arrows">
              <button type="button" data-upsell="-1" aria-label="Anterior">‹</button>
              <button type="button" data-upsell="1" aria-label="Próximo">›</button></div>` : ''}
          </div>
          <div class="lcart__upsell-card">
            ${thumbHTML(p)}
            <div class="lcart__upsell-info">
              <span class="lcart__name">${esc(p.name)}</span>
              <span class="lcart__upsell-preco">${fmtBRL(p.price)}</span>
            </div>
            <button type="button" class="lcart__upsell-add" data-upsell-add="${esc(p.id)}">+ Comprar</button>
          </div>
        </div>`;
    }

    body.innerHTML = itens +
      (noLimite ? '<p class="lcart__limite">Você chegou ao limite de unidades disponíveis deste produto em cada pedido.</p>' : '') +
      upsell;

    const cupomBloco = cupom
      ? `<div class="lcart__cupom-ok"><span>Cupom <strong>${esc(cupom.codigo)}</strong> (${cupomRotulo(cupom)})</span>
           <button type="button" data-cupom-remover aria-label="Remover cupom">✕</button></div>`
      : `<button type="button" class="lcart__cupom-toggle" data-cupom-toggle aria-expanded="${cupomAberto}">
           <span>Adicionar cupom</span>${ICON_CHEV}
         </button>
         <div class="lcart__cupom-form" ${cupomAberto ? '' : 'hidden'}>
           <input type="text" data-cupom-input placeholder="Código do cupom" maxlength="30" autocomplete="off">
           <button type="button" data-cupom-aplicar>Aplicar</button>
         </div>
         <div class="lcart__cupom-msg" data-cupom-msg role="status"></div>`;

    foot.innerHTML = `
      <div class="lcart__foot">
        ${cupomBloco}
        <div class="lcart__sub"><span>Subtotal</span><strong>${fmtBRL(subtotalBruto())}</strong></div>
        ${descontoTotal() > 0 ? `<div class="lcart__sub lcart__sub--desc"><span>Desconto</span><span>−${fmtBRL(descontoTotal())}</span></div>` : ''}
        <button type="button" class="loja__primary lcart__finalizar" data-finalizar>Finalizar compra · ${fmtBRL(subtotal())}</button>
        <p class="lcart__nota">O frete é calculado no próximo passo.</p>
      </div>`;

    thumbFallback(drawer);
  }

  // Delegação de eventos do drawer
  drawer.addEventListener('click', (e) => {
    if (tratarCupom(e, drawer)) return;
    const inc = e.target.closest('[data-inc]');
    const dec = e.target.closest('[data-dec]');
    const rem = e.target.closest('[data-remove]');
    const nav = e.target.closest('[data-upsell]');
    const add = e.target.closest('[data-upsell-add]');
    const fin = e.target.closest('[data-finalizar]');
    const aba = e.target.closest('[data-aba]');
    const again = e.target.closest('[data-recomprar]');
    const reload = e.target.closest('[data-compras-recarregar]');
    if (aba) trocarAba(aba.dataset.aba);
    else if (again) recomprar(again.dataset.recomprar);
    else if (reload) { carregarCompras(); renderDrawer(); }
    else if (inc) addToCart(inc.dataset.inc);
    else if (dec) decFromCart(dec.dataset.dec);
    else if (rem) removeFromCart(rem.dataset.remove);
    else if (nav) { upsellIdx += parseInt(nav.dataset.upsell, 10); renderDrawer(); }
    else if (add) addToCart(add.dataset.upsellAdd);
    else if (fin) { closeDrawer(); abrirCheckout(); }
  });
  drawer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-cupom-input]')) {
      e.preventDefault();
      const b = drawer.querySelector('[data-cupom-aplicar]');
      if (b) b.click();
    }
  });

  /* ---------------- Mensagens (substituem o alert) ---------------- */
  // Mesmo componente visual do popout global do site (assets/css/popout-bloqueio.css).
  let toastEl = null;
  let toastTimer = null;
  function mostrarMensagem(texto, titulo) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'acesso-negado acesso-negado--loja';
      toastEl.setAttribute('role', 'alert');
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = [
      '<div class="acesso-negado__card">',
      '  <span class="acesso-negado__blob acesso-negado__blob--tl" aria-hidden="true"></span>',
      '  <span class="acesso-negado__blob acesso-negado__blob--br" aria-hidden="true"></span>',
      `  <div class="acesso-negado__topo"><span class="acesso-negado__titulo">${esc(titulo || 'Pagamento ⚠️')}</span></div>`,
      `  <span class="acesso-negado__msg">${esc(texto)}</span>`,
      '</div>',
    ].join('');
    toastEl.classList.remove('is-open');
    requestAnimationFrame(() => toastEl.classList.add('is-open'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-open'), 4500);
  }

  /* ============================================================
     CHECKOUT (contato → entrega → frete → CPF/CNPJ → pagar)
  ============================================================ */
  const vitrineEl = $('lojaVitrine');
  const checkoutEl = $('lojaCheckout');
  const CK_KEY = 'loja.checkout.v1';
  // Campos lembrados em "Salvar minhas informações" (CPF/CNPJ NÃO é salvo)
  const CK_SALVAR = ['ckEmail', 'ckNome', 'ckSobrenome', 'ckCep', 'ckEndereco', 'ckNumero',
    'ckComplemento', 'ckBairro', 'ckCidade', 'ckUf', 'ckTelefone'];
  let ckMontado = false;
  let ckOpcoes = [];
  let cepToken = 0;
  let pagando = false;

  function abrirCheckout() {
    if (cartItemCount() === 0 || !vitrineEl || !checkoutEl) return;
    tela = 'checkout';
    vitrineEl.hidden = true;
    checkoutEl.hidden = false;
    if (!ckMontado) montarCheckout();
    renderResumo();
    recalcFrete();
    window.scrollTo({ top: 0 });
  }
  function voltarVitrine(abrirCarrinho) {
    tela = 'vitrine';
    checkoutEl.hidden = true;
    vitrineEl.hidden = false;
    renderGrid();
    window.scrollTo({ top: 0 });
    if (abrirCarrinho && cartItemCount() > 0) openDrawer();   // volta à vitrine com o carrinho lateral aberto
  }

  /* ---------- Máscaras e validações ---------- */
  const maskCep = (v) => { const d = soDig(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; };
  function maskTel(v) {
    const d = soDig(v).slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  function maskDoc(v) {
    const d = soDig(v).slice(0, 14);
    if (d.length <= 11) {
      let o = d.slice(0, 3);
      if (d.length > 3) o += '.' + d.slice(3, 6);
      if (d.length > 6) o += '.' + d.slice(6, 9);
      if (d.length > 9) o += '-' + d.slice(9, 11);
      return o;
    }
    let o = d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12);
    if (d.length > 12) o += '-' + d.slice(12, 14);
    return o;
  }
  function cpfValido(d) {
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (let t = 9; t < 11; t++) {
      let s = 0;
      for (let i = 0; i < t; i++) s += Number(d[i]) * (t + 1 - i);
      if (((s * 10) % 11) % 10 !== Number(d[t])) return false;
    }
    return true;
  }
  function cnpjValido(d) {
    if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    const dv = (n) => {
      let s = 0, pos = n - 7;
      for (let i = n; i >= 1; i--) { s += Number(d[n - i]) * pos--; if (pos < 2) pos = 9; }
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
  }
  const docValido = (v) => { const d = soDig(v); return d.length === 11 ? cpfValido(d) : cnpjValido(d); };

  /* ---------- Frete (por UF; regras em loja.dados.js) ---------- */
  function calcularFrete(uf) {
    const regiao = FRETE_REGIOES[uf];
    return (FRETE_OPCOES[regiao] || []).map((o) => ({ ...o }));
  }
  const prazoTxt = (p) => (p[0] === p[1] ? `${p[1]} dias úteis` : `${p[0]} a ${p[1]} dias úteis`);

  /* Cotação real (api/loja/frete.php); se falhar, usa a tabela por região acima.
     Resultado em cache por CEP + carrinho: digitar número/complemento não refaz a consulta. */
  const freteCache = {};   // chave -> { opcoes, estimado }
  const freteEmVoo = {};   // chave -> Promise
  let freteToken = 0;
  let fretePref = null;    // id da opção escolhida (mantém a escolha ao recotar)

  function chaveFrete(cep, uf) {
    const itens = Object.keys(cart).sort().map((id) => id + ':' + cart[id]).join(',');
    return cep + '|' + uf + '|' + itens;
  }
  function obterFrete(chave, cep, uf) {
    if (freteCache[chave]) return Promise.resolve(freteCache[chave]);
    if (freteEmVoo[chave]) return freteEmVoo[chave];
    const itens = Object.keys(cart).map((id) => ({ id, quantidade: cart[id], preco: findProduct(id).price }));
    freteEmVoo[chave] = API.cotarFrete(cep, itens)
      .then((res) => (freteCache[chave] = res))
      .catch((err) => {
        console.warn('Frete: usando tabela por região.', err.message);
        return { opcoes: calcularFrete(uf), estimado: true };   // reserva não fica em cache: tenta a API de novo depois
      })
      .finally(() => { delete freteEmVoo[chave]; });
    return freteEmVoo[chave];
  }

  /* ---------- Montagem do formulário (uma vez) ---------- */
  function campo(id, label, o = {}) {
    const { type = 'text', auto = 'off', cls = '', extra = '' } = o;
    return `
      <div class="lck__field ${cls}" data-campo="${id}">
        <input id="${id}" type="${type}" placeholder=" " autocomplete="${auto}" ${extra}>
        <label for="${id}">${label}</label>
        <span class="lck__erro" id="${id}Erro" role="alert"></span>
      </div>`;
  }

  function montarCheckout() {
    const ufs = ESTADOS.map((u) => `<option value="${u}">${u}</option>`).join('');
    checkoutEl.innerHTML = `
      <div class="lck__wrap">
        <div class="lck__col lck__card lck__form">
          <button type="button" class="loja__back" data-ck-voltar>&larr; Voltar à loja</button>

          <h2 class="lck__h lck__h--first">Contato</h2>
          ${campo('ckEmail', 'E-mail', { type: 'email', auto: 'email' })}

          <h2 class="lck__h">Entrega</h2>
          <div class="lck__field lck__field--select">
            <select id="ckPais" data-seletor disabled><option>Brasil</option></select>
            <label for="ckPais">País/Região</label>
          </div>
          <div class="lck__row">
            ${campo('ckNome', 'Nome', { auto: 'given-name' })}
            ${campo('ckSobrenome', 'Sobrenome', { auto: 'family-name' })}
          </div>
          ${campo('ckCep', 'CEP', { auto: 'postal-code', extra: 'inputmode="numeric" maxlength="9"' })}
          <div class="lck__cep-status" id="ckCepStatus" role="status"></div>
          <div class="lck__row lck__row--num">
            ${campo('ckEndereco', 'Endereço', { auto: 'address-line1' })}
            ${campo('ckNumero', 'Número', { extra: 'maxlength="10"' })}
          </div>
          <div class="lck__row">
            ${campo('ckComplemento', 'Apartamento, bloco etc. (opcional)', { auto: 'address-line2' })}
            ${campo('ckBairro', 'Bairro')}
          </div>
          <div class="lck__row">
            ${campo('ckCidade', 'Cidade', { auto: 'address-level2' })}
            <div class="lck__field lck__field--select" data-campo="ckUf">
              <select id="ckUf" data-seletor autocomplete="address-level1"><option value=""></option>${ufs}</select>
              <label for="ckUf">Estado</label>
              <span class="lck__erro" id="ckUfErro" role="alert"></span>
            </div>
          </div>
          ${campo('ckTelefone', 'Telefone (opcional)', { type: 'tel', auto: 'tel', extra: 'inputmode="tel" maxlength="15"' })}
          <label class="lck__check"><input type="checkbox" id="ckSalvar" checked><span>Salvar minhas informações para a próxima vez</span></label>

          <h2 class="lck__h">Forma de frete</h2>
          <div id="ckFrete" class="lck__frete"></div>
          <span class="lck__erro lck__erro--bloco" id="ckFreteErro" role="alert"></span>

          <h2 class="lck__h">Informações adicionais</h2>
          ${campo('ckCpf', 'CPF/CNPJ', { extra: 'inputmode="numeric" maxlength="18"' })}

          <button type="button" class="loja__primary lck__pagar" id="ckPagar">Pagar agora</button>
          <p class="lck__nota">Você será redirecionado ao Mercado Pago para concluir o pagamento com segurança.</p>
        </div>

        <aside class="lck__col lck__card lck__resumo" id="ckResumo" aria-label="Resumo do pedido"></aside>
      </div>`;

    const $ck = (id) => document.getElementById(id);

    // Máscaras
    $ck('ckCep').addEventListener('input', (e) => {
      e.target.value = maskCep(e.target.value);
      consultarCep();
    });
    $ck('ckTelefone').addEventListener('input', (e) => { e.target.value = maskTel(e.target.value); });
    $ck('ckCpf').addEventListener('input', (e) => { e.target.value = maskDoc(e.target.value); });

    // Frete recalcula quando o endereço fica completo / muda
    ['ckEndereco', 'ckNumero'].forEach((id) => $ck(id).addEventListener('input', recalcFrete));
    $ck('ckUf').addEventListener('change', recalcFrete);

    // Limpa o erro ao digitar; valida ao sair do campo
    CAMPOS.forEach(([id]) => {
      const el = $ck(id);
      el.addEventListener('input', () => limparErro(id));
      el.addEventListener('change', () => limparErro(id));
      el.addEventListener('blur', () => { if (el.value.trim() !== '' || id === 'ckCpf') validarCampo(id); });
    });
    $ck('ckTelefone').addEventListener('input', () => limparErro('ckTelefone'));
    $ck('ckTelefone').addEventListener('blur', () => validarCampo('ckTelefone'));

    // Escolha do frete
    $ck('ckFrete').addEventListener('change', (e) => {
      const r = e.target.closest('input[name="ckFreteOp"]');
      if (!r) return;
      frete = ckOpcoes.find((o) => o.id === r.value) || null;
      if (frete) fretePref = frete.id;
      $ck('ckFrete').querySelectorAll('.lck__op').forEach((l) =>
        l.classList.toggle('is-sel', l.contains(r)));
      $ck('ckFreteErro').textContent = '';
      renderResumo();
    });

    checkoutEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-ck-voltar]')) { voltarVitrine(true); return; }
      if (e.target.closest('[data-ck-carrinho]')) { openDrawer(); return; }
      if (tratarCupom(e, $ck('ckResumo'))) return;
      if (e.target.closest('#ckPagar')) pagar();
    });
    checkoutEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('[data-cupom-input]')) {
        e.preventDefault();
        const b = $ck('ckResumo').querySelector('[data-cupom-aplicar]');
        if (b) b.click();
      }
    });

    // Preenche com as informações salvas (se houver)
    try {
      const salvo = JSON.parse(localStorage.getItem(CK_KEY) || 'null');
      if (salvo) CK_SALVAR.forEach((id) => { if (salvo[id] != null && $ck(id)) $ck(id).value = salvo[id]; });
    } catch (_) { /* ignora */ }

    ckMontado = true;
  }

  /* ---------- CEP ---------- */
  async function consultarCep() {
    const status = $('ckCepStatus');
    const d = soDig($('ckCep').value);
    const token = ++cepToken;
    if (d.length !== 8) { status.textContent = ''; status.className = 'lck__cep-status'; recalcFrete(); return; }

    status.className = 'lck__cep-status';
    status.textContent = 'Buscando endereço...';
    try {
      const r = await API.buscarCep(d);
      if (token !== cepToken) return;           // chegou resposta de um CEP antigo
      if (!r) {
        status.className = 'lck__cep-status lck__cep-status--erro';
        status.textContent = 'CEP não encontrado. Confira o número ou preencha o endereço manualmente.';
      } else {
        $('ckEndereco').value = r.logradouro || $('ckEndereco').value;
        $('ckBairro').value = r.bairro || $('ckBairro').value;
        $('ckCidade').value = r.localidade || $('ckCidade').value;
        if (r.uf) $('ckUf').value = r.uf;
        ['ckCep', 'ckEndereco', 'ckBairro', 'ckCidade', 'ckUf'].forEach(limparErro);
        status.textContent = '';
        $('ckNumero').focus();
      }
    } catch (err) {
      if (token !== cepToken) return;
      console.error(err);
      status.className = 'lck__cep-status lck__cep-status--erro';
      status.textContent = 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.';
    }
    recalcFrete();
  }

  /* ---------- Frete: lista de opções ---------- */
  function recalcFrete() {
    const box = $('ckFrete');
    if (!box) return;
    const cep = soDig($('ckCep').value);
    const uf = $('ckUf').value;
    const pronto = cep.length === 8 && uf &&
      $('ckEndereco').value.trim() && $('ckNumero').value.trim();

    if (!pronto) {
      freteToken++;
      frete = null; ckOpcoes = [];
      box.innerHTML = '<div class="lck__frete-aviso">Insira o endereço de entrega para ver as formas de frete disponíveis.</div>';
      renderResumo();
      return;
    }

    const chave = chaveFrete(cep, uf);
    if (freteCache[chave]) { mostrarFrete(freteCache[chave]); return; }

    const token = ++freteToken;
    if (frete) fretePref = frete.id;
    frete = null; ckOpcoes = [];
    box.innerHTML = '<div class="lck__frete-aviso" role="status">Calculando frete...</div>';
    $('ckFreteErro').textContent = '';
    renderResumo();
    obterFrete(chave, cep, uf).then((res) => {
      if (token !== freteToken) return;          // endereço/carrinho mudou enquanto consultava
      mostrarFrete(res);
    });
  }

  function mostrarFrete(res) {
    const box = $('ckFrete');
    ckOpcoes = res.opcoes.map((o) => ({ ...o }));
    if (!ckOpcoes.length) {
      frete = null;
      box.innerHTML = '<div class="lck__frete-aviso">Não há formas de frete disponíveis para este endereço.</div>';
      renderResumo();
      return;
    }
    frete = ckOpcoes.find((o) => o.id === fretePref) || ckOpcoes[0];
    box.innerHTML = ckOpcoes.map((o) => `
      <label class="lck__op${o.id === frete.id ? ' is-sel' : ''}">
        <input type="radio" name="ckFreteOp" value="${o.id}" ${o.id === frete.id ? 'checked' : ''}>
        <span class="lck__op-txt"><strong>${esc(o.nome)}</strong><small>${prazoTxt(o.prazo)}</small></span>
        <span class="lck__op-preco">${fmtBRL(o.preco)}</span>
      </label>`).join('') +
      (res.estimado ? '<div class="lck__frete-aviso">Valores estimados para a sua região.</div>' : '');
    $('ckFreteErro').textContent = '';
    renderResumo();
  }

  /* ---------- Resumo do pedido (coluna da direita) ---------- */
  function renderResumo() {
    const el = $('ckResumo');
    if (!el) return;
    const keep = el.querySelector('[data-cupom-input]');
    const digitado = keep ? keep.value : '';

    const linhas = Object.keys(cart).map((id) => {
      const p = findProduct(id);
      const q = cart[id];
      return `
        <div class="lck__linha">
          <span class="lck__thumbw">${thumbHTML(p)}<em class="lck__badge">${q}</em></span>
          <span class="lck__lnome">${esc(p.name)}</span>
          <span class="lck__lpreco">${fmtBRL(linhaLiquida(id))}</span>
        </div>`;
    }).join('');

    const cupomBloco = cupom
      ? `<div class="lcart__cupom-ok"><span>Cupom <strong>${esc(cupom.codigo)}</strong> (${cupomRotulo(cupom)})</span>
           <button type="button" data-cupom-remover aria-label="Remover cupom">✕</button></div>`
      : `<div class="lck__cupom">
           <input type="text" data-cupom-input placeholder="Código de desconto" maxlength="30" autocomplete="off">
           <button type="button" data-cupom-aplicar>Aplicar</button>
         </div>
         <div class="lcart__cupom-msg" data-cupom-msg role="status"></div>`;

    el.innerHTML = `
      <div class="lck__linhas">${linhas}</div>
      <button type="button" class="lck__editar" data-ck-carrinho>Editar carrinho</button>
      ${cupomBloco}
      <div class="lck__tot"><span>Subtotal</span><span>${fmtBRL(subtotalBruto())}</span></div>
      ${descontoTotal() > 0 ? `<div class="lck__tot lck__tot--desc"><span>Desconto</span><span>−${fmtBRL(descontoTotal())}</span></div>` : ''}
      <div class="lck__tot"><span>Frete</span>${frete
        ? `<span>${frete.preco > 0 ? fmtBRL(frete.preco) : 'Grátis'}</span>`
        : '<span class="lck__tot-dim">Inserir endereço de entrega</span>'}</div>
      <div class="lck__tot lck__tot--total"><span>Total</span><span><small>BRL</small> ${fmtBRL(totalPedido())}</span></div>`;

    if (digitado) { const i = el.querySelector('[data-cupom-input]'); if (i) i.value = digitado; }
    thumbFallback(el);
  }

  /* ---------- Validação ---------- */
  // [id, regra] na ordem em que aparecem na tela
  const CAMPOS = [
    ['ckEmail', (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || 'Insira um e-mail válido'],
    ['ckNome', (v) => !!v || 'Insira o nome'],
    ['ckSobrenome', (v) => !!v || 'Insira o sobrenome'],
    ['ckCep', (v) => soDig(v).length === 8 || 'Insira um CEP válido'],
    ['ckEndereco', (v) => !!v || 'Insira o endereço'],
    ['ckNumero', (v) => !!v || 'Insira o número'],
    ['ckBairro', (v) => !!v || 'Insira o bairro'],
    ['ckCidade', (v) => !!v || 'Insira a cidade'],
    ['ckUf', (v) => !!v || 'Selecione o estado'],
    ['ckCpf', (v) => docValido(v) || 'Insira um CPF/CNPJ válido'],
  ];
  const REGRA_TEL = (v) => { const d = soDig(v); return d === '' || d.length >= 10 || 'Insira um telefone válido'; };

  function mostrarErro(id, msg) {
    const wrap = $(id).closest('.lck__field');
    if (wrap) wrap.classList.toggle('has-erro', !!msg);
    const out = $(id + 'Erro');
    if (out) out.textContent = msg || '';
  }
  function limparErro(id) { if ($(id)) mostrarErro(id, ''); }
  function validarCampo(id) {
    const regra = id === 'ckTelefone' ? REGRA_TEL : (CAMPOS.find((c) => c[0] === id) || [])[1];
    if (!regra) return true;
    const r = regra($(id).value.trim());
    if (r === true) { mostrarErro(id, ''); return true; }
    mostrarErro(id, r);
    return false;
  }
  function validarTudo() {
    let primeiro = null;
    CAMPOS.forEach(([id]) => { if (!validarCampo(id) && !primeiro) primeiro = $(id); });
    if (!validarCampo('ckTelefone') && !primeiro) primeiro = $('ckTelefone');
    if (!frete) {
      $('ckFreteErro').textContent = 'Selecione uma forma de frete (preencha o endereço de entrega).';
      if (!primeiro) primeiro = $('ckFrete');
    }
    if (primeiro) {
      primeiro.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (primeiro.focus && primeiro.tagName !== 'DIV') setTimeout(() => primeiro.focus({ preventScroll: true }), 250);
      return false;
    }
    return true;
  }

  /* ---------- Pagar (servidor AWS → Mercado Pago) ---------- */
  function salvarInfo() {
    try {
      if ($('ckSalvar').checked) {
        const o = {};
        CK_SALVAR.forEach((id) => { o[id] = $(id).value; });
        localStorage.setItem(CK_KEY, JSON.stringify(o));
      } else {
        localStorage.removeItem(CK_KEY);
      }
    } catch (_) { /* ignora */ }
  }

  // Corpo EXATAMENTE no contrato do servidor: { items:[{id,title,quantity,unit_price}] }.
  // O frete segue como mais um item (id "FRETE"). O cupom entra no preço de cada linha: se o
  // desconto da linha não divide certinho pelas unidades, a linha vira dois itens (a diferença
  // de centavos fica numa unidade) — o total cobrado é exatamente o mostrado na tela.
  function montarItens() {
    const rat = rateioAtual();
    const items = [];
    Object.entries(cart).forEach(([id, qty]) => {
      const p = findProduct(id);
      const liquido = centavos(p.price) * qty - rat.porId[id];   // centavos da linha
      const unit = Math.floor(liquido / qty);
      if (unit * qty === liquido) {
        items.push({ id: p.id, title: p.name, quantity: qty, unit_price: unit / 100 });
      } else {
        if (qty > 1) items.push({ id: p.id, title: p.name, quantity: qty - 1, unit_price: unit / 100 });
        items.push({ id: p.id, title: p.name, quantity: 1, unit_price: (liquido - unit * (qty - 1)) / 100 });
      }
    });
    if (frete && frete.preco > 0) {
      items.push({
        id: 'FRETE',
        title: `Frete - ${frete.nome} (CEP ${maskCep($('ckCep').value)})`,
        quantity: 1,
        unit_price: frete.preco,
      });
    }
    return items;
  }

  // Corpo do pedido (aba "Compras", Dashboard e baixa de estoque). O servidor confere itens,
  // limites e preços no catálogo do banco e recalcula o cupom/desconto/total: o navegador não decide
  // nome, preço nem desconto ("desconto" só serve para o servidor conferir o que a tela mostrou).
  function montarPedido() {
    return {
      itens: Object.keys(cart).map((id) => {
        const p = findProduct(id);
        return { id, nome: p.name, quantidade: cart[id], preco: p.price };
      }),
      frete: frete ? { nome: frete.nome, preco: frete.preco } : null,
      cupom: cupom ? cupom.codigo : null,
      desconto: descontoTotal(),
      cep: soDig($('ckCep').value),
      cidade: $('ckCidade').value.trim(),
      uf: $('ckUf').value,
    };
  }

  // Liga o pedido ao link do Mercado Pago (é por ele que o site descobre o "pago"). Tenta até 3 vezes.
  async function vincularSeguro(codigo, initPoint) {
    for (let i = 0; i < 3; i++) {
      try {
        await Promise.race([
          API.vincularPedido(codigo, initPoint),
          new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado')), 4000)),
        ]);
        return;
      } catch (err) {
        console.warn('Pedido não vinculado ao pagamento (tentativa ' + (i + 1) + '):', err.message);
        if (err.status >= 400 && err.status < 500) return;   // o servidor recusou: repetir não adianta
      }
    }
  }

  // O pagamento não chegou a ser gerado: devolve o estoque reservado (se falhar, o servidor libera sozinho depois).
  async function liberarReserva(codigo) {
    try { await API.cancelarPedido(codigo); } catch (err) { console.warn('Reserva não liberada agora:', err.message); }
  }

  async function pagar() {
    if (pagando) return;
    if (cartItemCount() === 0) return;
    if (!validarTudo()) return;
    salvarInfo();

    const btn = $('ckPagar');
    const restaurar = () => {
      pagando = false;
      checkoutEl.classList.remove('is-busy');
      btn.disabled = false;
      btn.textContent = 'Pagar agora';
    };
    pagando = true;
    checkoutEl.classList.add('is-busy');
    btn.disabled = true;
    btn.textContent = 'Em processamento...';

    // 1) Reserva: baixa o estoque e grava o pedido. Se acabou, o pagamento nem é gerado.
    let codigo;
    try {
      codigo = await API.reservarPedido(montarPedido());
    } catch (err) {
      console.error(err);
      if (err.cupom) {
        cupom = null;   // o servidor não aceitou mais o cupom (regra mudou, venceu, acabou...)
        mostrarMensagem(err.message, 'Cupom ⚠️');
        afterCartChange();
      } else if (err.status === 409 || err.estoque) {
        mostrarMensagem(err.message, 'Estoque ⚠️');
        await carregarCatalogo(true);   // a vitrine volta com o estoque real e o carrinho é ajustado
      } else {
        mostrarMensagem(err.message || 'Não foi possível reservar os itens. Tente novamente.');
      }
      restaurar();
      return;
    }

    // 2) Pagamento (servidor AWS → Mercado Pago)
    try {
      const data = await API.criarPagamento(montarItens());
      if (data && data.init_point) {
        await vincularSeguro(codigo, data.init_point);
        compras = null;
        window.location.href = data.init_point;   // Mercado Pago
        return;
      }
      mostrarMensagem('Não foi possível gerar o pagamento. Tente novamente.');
    } catch (err) {
      console.error(err);
      mostrarMensagem('Erro ao conectar com o servidor de pagamento.');
    }
    await liberarReserva(codigo);
    restaurar();
  }

  /* ---------------- Eventos ---------------- */
  const btnCarrinho = $('btnCarrinhoLoja'); // botão no cabeçalho do site
  if (btnCarrinho) btnCarrinho.addEventListener('click', toggleDrawer);
  $('lojaDrawerFechar').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);

  $('lojaBusca').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderGrid();
    updatePageHead();
  });
  $('lojaOrdenar').addEventListener('change', (e) => {
    sortMode = e.target.value;
    renderGrid();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modalProd) return;   // o popout de item trata o próprio Esc
    if (isCatOpen()) { closeCat(); return; }
    if (drawer.classList.contains('is-open')) closeDrawer();
  });

  // Menu lateral: botão "Recolher"
  const btnRecolher = $('btnRecolher');
  if (btnRecolher) btnRecolher.addEventListener('click', () => document.body.classList.remove('sidebar-open'));

  /* ---------------- Início ---------------- */
  const ICON_CART = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6h15l-1.5 9h-13z"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/><path d="M6 6 5 2H2"/></svg>';

  const ICON_TRASH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 19l1-12M9 7V4.5A1 1 0 0 1 10 3.5h4a1 1 0 0 1 1 1V7"/></svg>';
  const ICON_CHEV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  const ICON_EDIT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

  /* ============================================================
     CATÁLOGO (banco) + ESTOQUE
     A vitrine lê api/loja/produtos.php. O estoque mostrado já desconta os pedidos em
     andamento; ele é atualizado ao voltar para a aba e a cada 45 s com a loja aberta.
  ============================================================ */
  // Ajusta o carrinho ao catálogo atual (item removido, sem estoque ou com limite menor). Devolve os avisos.
  function reconciliarCarrinho() {
    const avisos = [];
    Object.keys(cart).forEach((id) => {
      const p = findProduct(id);
      if (!p || p.stock <= 0) {
        avisos.push(`"${(p && p.name) || nomesCarrinho[id] || id}" não está mais disponível e saiu do carrinho.`);
        delete cart[id];
        return;
      }
      const max = limiteItem(p);
      if (cart[id] > max) {
        cart[id] = max;
        avisos.push(`A quantidade de "${p.name}" foi ajustada para ${max} (estoque disponível).`);
      }
    });
    return avisos;
  }

  function aplicarCatalogo(d, mostrarAvisos) {
    PRODUCTS = d.produtos;
    if (Array.isArray(d.categorias) && d.categorias.length) {
      CATEGORIES = d.categorias.map((c) => ({ id: c.id, label: c.nome }));
    }
    if (currentCategory !== 'all' && !CATEGORIES.some((c) => c.id === currentCategory)) currentCategory = 'all';
    catalogoEstado = 'ok';
    const avisos = reconciliarCarrinho();
    renderCategoryPanel();
    updatePageHead();
    afterCartChange();   // redesenha vitrine, carrinho e (se aberto) o resumo do checkout
    if (mostrarAvisos !== false && avisos.length) mostrarMensagem(avisos.join(' '), 'Carrinho ⚠️');
  }

  function carregarCatalogo(silencioso) {
    const token = ++catalogoToken;
    if (!silencioso && !PRODUCTS.length) { catalogoEstado = 'loading'; renderGrid(); }
    return API.listarProdutos()
      .then((d) => { if (token === catalogoToken) aplicarCatalogo(d); })
      .catch((err) => {
        if (token !== catalogoToken) return;
        console.error(err);
        if (!PRODUCTS.length) { catalogoEstado = 'erro'; catalogoErro = err.message; renderGrid(); }
        // já havia catálogo na tela: mantém o que está aí até a próxima atualização
      });
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden && !modalProd) carregarCatalogo(true); });
  setInterval(() => { if (!document.hidden && !modalProd && tela === 'vitrine') carregarCatalogo(true); }, 45000);

  /* ============================================================
     ADMINISTRADOR — adicionar / editar / remover item
     Só aparece para o usuário id 1 (e o servidor confere de novo a cada ação).
     Visual e comportamento do popout = diálogo padrão do site (assets/css/dialogo.css):
     mesma caixa, mesma animação, mesmos botões; campos = os do checkout.
  ============================================================ */
  let modalProd = null;

  const maskPreco = (v) => {
    const d = soDig(v).slice(0, 8);
    return d ? fmtBRL(parseInt(d, 10) / 100) : '';
  };
  const parsePreco = (v) => { const d = soDig(v); return d ? parseInt(d, 10) / 100 : 0; };
  const IMG_TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
  const IMG_MAX = 5 * 1024 * 1024;

  function abrirFormProduto(produto) {
    if (!ADMIN || modalProd) return;
    const editando = !!produto;
    const anterior = document.activeElement;
    const estoqueAbertura = editando ? produto.stock : 0;   // base para não desfazer compras feitas com o formulário aberto
    const st = { arquivo: null, previewUrl: '', removerImagem: false, salvando: false };

    const cats = CATEGORIES.map((c) => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('');
    const raiz = document.createElement('div');
    raiz.className = 'lprod';
    raiz.innerHTML = `
      <div class="lprod__fundo" data-lprod-fundo></div>
      <form class="lprod__caixa" role="dialog" aria-modal="true" aria-labelledby="lprodTitulo" novalidate>
        <h2 class="lprod__titulo" id="lprodTitulo">${editando ? 'Editar item' : 'Adicionar item'}</h2>
        <p class="lprod__sub">${editando
          ? 'Altere os dados e salve. O código do produto não pode ser mudado.'
          : 'Preencha os dados do produto que vai aparecer na Loja.'}</p>

        <div class="lprod__corpo">
          <div class="lprod__imagem">
            <div class="lprod__drop" id="lpDrop" tabindex="0" role="button" aria-label="Escolher a imagem do produto">
              <span class="lprod__preview" id="lpPreview"></span>
              <span class="lprod__drop-txt">
                <strong>Imagem do produto</strong>
                <span>Arraste um arquivo ou clique para escolher<br>JPG, PNG ou WEBP · até 5MB</span>
              </span>
            </div>
            <input type="file" id="lpArquivo" accept="image/jpeg,image/png,image/webp" hidden>
            <button type="button" class="lprod__link lprod__link--perigo" id="lpRemoverImagem" hidden>Remover imagem</button>
            <span class="lck__erro lck__erro--bloco" id="lpImagemErro" role="alert"></span>
          </div>

          <div class="lck__row">
            ${campo('lpCodigo', 'Código (ex.: ABC1234)', { extra: 'maxlength="20" autocapitalize="characters" spellcheck="false"' + (editando ? ' disabled' : '') })}
            <div class="lck__field lck__field--select" data-campo="lpCategoria">
              <select id="lpCategoria" data-seletor><option value=""></option>${cats}</select>
              <label for="lpCategoria">Categoria</label>
              <span class="lck__erro" id="lpCategoriaErro" role="alert"></span>
            </div>
          </div>
          ${campo('lpTitulo', 'Título (ex.: Nome do produto)', { extra: 'maxlength="150"' })}
          <div class="lck__field lprod__desc" data-campo="lpDescricao">
            <textarea id="lpDescricao" placeholder=" " maxlength="500" rows="3"></textarea>
            <label for="lpDescricao">Descrição</label>
            <span class="lprod__contador" id="lpContador" aria-hidden="true">0/500</span>
            <span class="lck__erro" id="lpDescricaoErro" role="alert"></span>
          </div>
          <div class="lck__row">
            ${campo('lpPreco', 'Preço (ex.: R$ 99,90)', { extra: 'inputmode="numeric" maxlength="16"' })}
            ${campo('lpEstoque', 'Estoque (unidades)', { extra: 'inputmode="numeric" maxlength="6"' })}
          </div>
          <span class="lck__erro lck__erro--bloco" id="lpErroGeral" role="alert"></span>
        </div>

        <div class="lprod__acoes">
          ${editando ? '<button type="button" class="ib-dialogo__btn ib-dialogo__btn--perigo" id="lpRemoverItem">Remover item</button>' : '<span></span>'}
          <div class="lprod__acoes-dir">
            <button type="button" class="ib-dialogo__btn ib-dialogo__btn--contorno" id="lpCancelar">Cancelar</button>
            <button type="submit" class="ib-dialogo__btn ib-dialogo__btn--primario" id="lpSalvar">${editando ? 'Salvar alterações' : 'Adicionar item'}</button>
          </div>
        </div>
      </form>`;
    document.body.appendChild(raiz);
    document.body.classList.add('lprod-aberto');

    const el = (id) => raiz.querySelector('#' + id);
    const caixa = raiz.querySelector('.lprod__caixa');
    raiz.querySelector('[data-campo="lpPreco"]').insertAdjacentHTML('beforeend', '<span class="lprod__sufixo" aria-hidden="true">/un</span>');

    // valores iniciais
    if (editando) {
      el('lpCodigo').value = produto.id;
      el('lpTitulo').value = produto.name;
      el('lpDescricao').value = produto.desc;
      el('lpPreco').value = fmtBRL(produto.price);
      el('lpEstoque').value = String(produto.stock);
      el('lpCategoria').value = produto.cat;
    } else if (currentCategory !== 'all') {
      el('lpCategoria').value = currentCategory;
    }

    const lerCampos = () => ({
      codigo: el('lpCodigo').value.trim().toUpperCase(),
      titulo: el('lpTitulo').value.trim(),
      descricao: el('lpDescricao').value.trim(),
      preco: el('lpPreco').value.trim(),
      estoque: el('lpEstoque').value.trim(),
      categoria: el('lpCategoria').value,
    });
    const instantaneo = () => JSON.stringify([lerCampos(), st.arquivo ? [st.arquivo.name, st.arquivo.size] : null, st.removerImagem]);
    const inicial = instantaneo();
    const sujo = () => instantaneo() !== inicial;

    // ---- imagem ----
    function atualizarPreview() {
      const box = el('lpPreview');
      const cat = el('lpCategoria').value || (produto && produto.cat) || '';
      let src = '';
      if (st.arquivo) src = st.previewUrl;
      else if (editando && produto.image && !st.removerImagem) src = IMG_BASE + produto.image;
      box.innerHTML = src
        ? `<img src="${esc(src)}" alt="">`
        : (ICONS[cat] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10.5" r="1.6"/><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4"/></svg>');
      const img = box.querySelector('img');
      if (img) img.addEventListener('error', () => { img.remove(); box.innerHTML = ICONS[cat] || ''; }, { once: true });
      el('lpRemoverImagem').hidden = !src;
    }
    function escolherImagem(arq) {
      el('lpImagemErro').textContent = '';
      if (!arq) return;
      if (!IMG_TIPOS.includes(arq.type)) { el('lpImagemErro').textContent = 'Formato inválido. Use JPG, PNG ou WEBP.'; return; }
      if (arq.size > IMG_MAX) { el('lpImagemErro').textContent = 'A imagem deve ter no máximo 5MB.'; return; }
      if (st.previewUrl) URL.revokeObjectURL(st.previewUrl);
      st.arquivo = arq;
      st.previewUrl = URL.createObjectURL(arq);
      st.removerImagem = false;
      atualizarPreview();
    }
    const drop = el('lpDrop');
    const inputArq = el('lpArquivo');
    drop.addEventListener('click', () => inputArq.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputArq.click(); } });
    inputArq.addEventListener('change', () => { escolherImagem(inputArq.files[0]); inputArq.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-sobre'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-sobre'); }));
    drop.addEventListener('drop', (e) => escolherImagem(e.dataTransfer && e.dataTransfer.files[0]));
    el('lpRemoverImagem').addEventListener('click', () => {
      if (st.previewUrl) URL.revokeObjectURL(st.previewUrl);
      st.arquivo = null; st.previewUrl = ''; st.removerImagem = true;
      el('lpImagemErro').textContent = '';
      atualizarPreview();
    });
    el('lpCategoria').addEventListener('change', atualizarPreview);

    // ---- máscaras e validação ----
    el('lpPreco').addEventListener('input', (e) => { e.target.value = maskPreco(e.target.value); });
    el('lpEstoque').addEventListener('input', (e) => { e.target.value = soDig(e.target.value).slice(0, 6); });
    el('lpCodigo').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''); });
    el('lpDescricao').addEventListener('input', (e) => { el('lpContador').textContent = e.target.value.length + '/500'; });
    el('lpContador').textContent = el('lpDescricao').value.length + '/500';

    const regras = {
      lpCodigo: (v) => !v ? 'Informe o código do produto'
        : (/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(v.toUpperCase()) || 'Use 2 a 20 letras, números, hífen ou sublinhado'),
      lpCategoria: (v) => !!v || 'Selecione a categoria',
      lpTitulo: (v) => v.length >= 2 || 'Informe o título do produto',
      lpDescricao: (v) => !v ? 'Informe a descrição do produto' : (v.length <= 500 || 'A descrição pode ter até 500 caracteres'),
      lpPreco: (v) => { const n = parsePreco(v); return (n > 0 && n <= 100000) || 'Informe um preço válido (até R$ 100.000,00)'; },
      lpEstoque: (v) => /^\d{1,6}$/.test(v) || 'Informe o estoque (número inteiro, 0 ou mais)',
    };
    const ORDEM = ['lpCodigo', 'lpCategoria', 'lpTitulo', 'lpDescricao', 'lpPreco', 'lpEstoque'];
    function validar(id) {
      if (id === 'lpCodigo' && editando) return true;
      const r = regras[id](el(id).value.trim());
      if (r === true) { mostrarErro(id, ''); return true; }
      mostrarErro(id, r);
      return false;
    }
    ORDEM.forEach((id) => {
      const campoEl = el(id);
      campoEl.addEventListener('input', () => { limparErro(id); el('lpErroGeral').textContent = ''; });
      campoEl.addEventListener('change', () => limparErro(id));
      campoEl.addEventListener('blur', () => { if (campoEl.value.trim() !== '') validar(id); });
    });

    // ---- abrir / fechar ----
    const focaveis = () => Array.from(caixa.querySelectorAll('button, input, textarea'))
      .filter((n) => !n.disabled && !n.hidden && n.type !== 'file' && n.offsetParent !== null);
    let fechado = false;
    let soltarProtecao = () => {};
    function fechar() {
      if (fechado) return;
      fechado = true;
      soltarProtecao();
      document.removeEventListener('keydown', teclas);
      if (st.previewUrl) URL.revokeObjectURL(st.previewUrl);
      raiz.classList.remove('is-open');
      document.body.classList.remove('lprod-aberto');
      modalProd = null;
      setTimeout(() => raiz.remove(), 170);
      try { if (anterior && anterior.focus) anterior.focus(); } catch (_) { /* ok */ }
    }
    function tentarFechar() {
      if (st.salvando) return;
      if (!sujo() || !window.IBDialogo) { fechar(); return; }
      window.IBDialogo.confirmar({
        titulo: 'Descartar alterações?',
        texto: 'Você preencheu dados que ainda não foram salvos. Se fechar agora, eles serão perdidos.',
        confirmar: 'Descartar', cancelar: 'Continuar editando', perigo: true,
      }).then((ok) => { if (ok) fechar(); });
    }
    // Esc: o seletor padrão e os diálogos do site tratam o Esc deles antes (não chega aqui).
    function teclas(e) {
      if (e.key === 'Escape') { e.preventDefault(); tentarFechar(); return; }
      if (e.key !== 'Tab') return;
      const lista = focaveis();
      if (!lista.length) return;
      const i = lista.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); lista[lista.length - 1].focus(); }
      else if (!e.shiftKey && i === lista.length - 1) { e.preventDefault(); lista[0].focus(); }
    }
    document.addEventListener('keydown', teclas);
    if (window.IBDialogo) {
      soltarProtecao = window.IBDialogo.protegerSaida(() => !fechado && sujo(), {
        titulo: 'Sair desta página?',
        texto: 'Você tem um item em edição que ainda não foi salvo. Se sair agora, ele será perdido.',
      });
    }
    raiz.querySelector('[data-lprod-fundo]').addEventListener('click', tentarFechar);
    el('lpCancelar').addEventListener('click', tentarFechar);

    // ---- remover (dentro da edição) ----
    if (editando) {
      el('lpRemoverItem').addEventListener('click', async () => {
        if (st.salvando) return;
        if (await removerItem(produto)) fechar();
      });
    }

    // ---- salvar ----
    function pintarSalvando(on) {
      st.salvando = on;
      const b = el('lpSalvar');
      b.disabled = on;
      b.textContent = on ? 'Salvando...' : (editando ? 'Salvar alterações' : 'Adicionar item');
      caixa.classList.toggle('is-busy', on);
    }
    caixa.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (st.salvando) return;
      el('lpErroGeral').textContent = '';
      let primeiro = null;
      ORDEM.forEach((id) => { if (!validar(id) && !primeiro) primeiro = el(id); });
      if (primeiro) {
        if (primeiro.tagName === 'SELECT') { const b = primeiro.parentElement.querySelector('.seletor__botao'); if (b) b.focus(); }
        else primeiro.focus();
        return;
      }
      const c = lerCampos();
      const campos = {
        codigo: c.codigo, titulo: c.titulo, descricao: c.descricao, categoria: c.categoria,
        preco: parsePreco(c.preco).toFixed(2), estoque: c.estoque,
      };
      if (editando) {
        campos.estoque_base = String(estoqueAbertura);
        if (st.removerImagem && !st.arquivo) campos.remover_imagem = '1';
      }
      pintarSalvando(true);
      try {
        const d = await API.salvarProduto(editando ? 'editar' : 'criar', campos, st.arquivo, CSRF);
        fechar();
        aplicarCatalogo({ produtos: d.produtos }, false);
        mostrarMensagem(editando ? `"${c.titulo}" foi atualizado.` : `"${c.titulo}" já está na Loja.`,
          editando ? 'Item atualizado ✅' : 'Item adicionado ✅');
        destacarItem(c.codigo);
      } catch (err) {
        console.error(err);
        pintarSalvando(false);
        if (err.campo === 'lpImagem') {
          el('lpImagemErro').textContent = err.message;
        } else if (err.campo && el(err.campo)) {
          mostrarErro(err.campo, err.message);
          const alvo = el(err.campo);
          if (alvo.tagName !== 'SELECT') alvo.focus();
        } else {
          el('lpErroGeral').textContent = err.message || 'Não foi possível salvar o item. Tente novamente.';
        }
      }
    });

    modalProd = { fechar, sujo };
    atualizarPreview();
    requestAnimationFrame(() => raiz.classList.add('is-open'));
    // Abre sem nada selecionado: o foco fica na própria caixa (teclado/Esc continuam funcionando; Tab vai ao 1º campo).
    caixa.tabIndex = -1;
    caixa.focus({ preventScroll: true });
  }

  // Remove da Loja (as compras já feitas continuam no histórico e no Dashboard). true = removido.
  async function removerItem(p) {
    if (!ADMIN) return false;
    const ok = window.IBDialogo
      ? await window.IBDialogo.confirmar({
        titulo: 'Remover item?',
        texto: `"${p.name}" (${p.id}) vai sair da Loja. As compras já feitas continuam no histórico e no Dashboard.`,
        confirmar: 'Remover', cancelar: 'Cancelar', perigo: true,
      })
      : false;
    if (!ok) return false;
    try {
      const d = await API.salvarProduto('remover', { codigo: p.id }, null, CSRF);
      aplicarCatalogo({ produtos: d.produtos }, false);
      mostrarMensagem(`"${p.name}" foi removido da Loja.`, 'Item removido ✅');
      return true;
    } catch (err) {
      console.error(err);
      mostrarMensagem(err.message || 'Não foi possível remover o item.', 'Item ⚠️');
      return false;
    }
  }

  // Mostra o item recém-salvo: tira filtros que o escondam, rola até o card e dá um destaque curto.
  function destacarItem(id) {
    const p = findProduct(id);
    if (!p) return;
    let refazer = false;
    if (currentCategory !== 'all' && currentCategory !== p.cat) { currentCategory = 'all'; refazer = true; }
    if (searchTerm) { searchTerm = ''; $('lojaBusca').value = ''; refazer = true; }
    if (refazer) { renderCategoryPanel(); renderGrid(); updatePageHead(); }
    const card = Array.from(grid.querySelectorAll('.loja__card')).find((c) => c.dataset.id === id);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('is-novo');
    setTimeout(() => card.classList.remove('is-novo'), 2200);
  }

  const btnAdicionar = $('lojaAdicionarItem');
  if (btnAdicionar) btnAdicionar.addEventListener('click', () => abrirFormProduto(null));

  /* ---------------- Início ---------------- */
  renderCategoryPanel();
  renderGrid();          // "Carregando produtos..."
  updatePageHead();
  updateCartCount();
  carregarCatalogo(false);

  window.Loja = { abrirCheckout };
})();
