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

  const { CATEGORIES, ICONS, PRODUCTS, IMG_BASE, MAX_PER_ITEM, LOW_STOCK_LIMIT, COST_CENTER_BALANCE,
    FRETE_REGIOES, FRETE_OPCOES, CUPONS, ESTADOS } = D;

  /* ---------------- Estado ---------------- */
  let currentCategory = 'all';
  let searchTerm = '';
  let sortMode = 'default';
  let cart = {};          // id -> qty
  let tela = 'vitrine';   // vitrine | checkout
  let cupom = null;       // { codigo, valor } (percentual)
  let cupomAberto = false;
  let frete = null;       // opção de frete escolhida no checkout
  let upsellIdx = 0;      // "Que tal levar também"

  /* ---------------- Elementos ---------------- */
  const $ = (id) => document.getElementById(id);
  const grid = $('lojaGrid');
  const drawer = $('lojaDrawer');
  const overlay = $('lojaOverlay');
  const catBtn = $('lojaCatBtn');
  const catPanel = $('lojaCatPanel');
  const catWrap = $('lojaCatWrap');
  if (!grid || !drawer) return;

  /* ---------------- Utilitários ---------------- */
  function fmtBRL(v) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  const findProduct = (id) => PRODUCTS.find((p) => p.id === id);

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
    const items = getFilteredProducts();

    if (items.length === 0) {
      grid.innerHTML = '<div class="loja__vazio">Nenhum item encontrado para essa busca.</div>';
      return;
    }

    grid.innerHTML = items.map((p) => {
      const out = p.stock === 0;
      const tagCls = out ? 'out' : p.stock <= LOW_STOCK_LIMIT ? 'low' : 'ok';
      const tagTxt = out ? 'Esgotado' : `${p.stock} em estoque`;

      const control = out
        ? '<button type="button" class="loja__add" disabled>Indisponível</button>'
        : `<button type="button" class="loja__add" data-add="${p.id}">${ICON_CART}<span>Comprar</span></button>`;

      return `
      <article class="loja__card">
        <div class="loja__card-media" data-cat="${p.cat}">
          <span class="loja__tag loja__tag--${tagCls}">${tagTxt}</span>
          <img src="${IMG_BASE + p.image}" alt="${p.name}" loading="lazy">
        </div>
        <div class="loja__card-body">
          <span class="loja__sku">${p.id}</span>
          <h3 class="loja__card-title">${p.name}</h3>
          <p class="loja__card-desc">${p.desc}</p>
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
    const noLimite = (cart[product.id] || 0) >= Math.min(MAX_PER_ITEM, product.stock);
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
      ],
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
    if (current >= Math.min(MAX_PER_ITEM, product.stock)) return;
    cart[id] = current + 1;
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

  // Preço unitário já com o cupom (arredondado em centavos: o que a
  // tela mostra é exatamente o que vai para o Mercado Pago).
  function precoUnit(p) {
    return cupom ? round2(p.price * (1 - cupom.valor / 100)) : p.price;
  }
  function subtotalBruto() {
    return round2(Object.entries(cart).reduce((s, [id, q]) => s + findProduct(id).price * q, 0));
  }
  function subtotal() {
    return round2(Object.entries(cart).reduce((s, [id, q]) => s + precoUnit(findProduct(id)) * q, 0));
  }
  function descontoTotal() { return round2(subtotalBruto() - subtotal()); }
  function totalPedido() { return round2(subtotal() + (frete ? frete.preco : 0)); }

  /* ---------------- Cupom ---------------- */
  function aplicarCupom(raw) {
    const codigo = String(raw || '').trim().toUpperCase();
    if (!codigo) return { ok: false, msg: 'Digite o código do cupom.' };
    const chave = Object.keys(CUPONS).find((k) => k.toUpperCase() === codigo);
    const c = chave && CUPONS[chave];
    if (!c || c.tipo !== 'percent' || !(c.valor > 0 && c.valor <= 100)) {
      return { ok: false, msg: 'Cupom inválido ou expirado.' };
    }
    cupom = { codigo, valor: c.valor };
    return { ok: true };
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
      const input = root.querySelector('[data-cupom-input]');
      const r = aplicarCupom(input ? input.value : '');
      if (r.ok) { cupomAberto = false; afterCartChange(); }
      else { const m = root.querySelector('[data-cupom-msg]'); if (m) m.textContent = r.msg; }
      return true;
    }
    if (remover) { cupom = null; afterCartChange(); return true; }
    return false;
  }

  /* ---------------- Miniaturas ---------------- */
  function thumbHTML(p) {
    return `<span class="lcart__thumb" data-cat="${p.cat}"><img src="${IMG_BASE + p.image}" alt="" loading="lazy"></span>`;
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
            ${c.cupom ? `<div class="lcompra__item lcompra__item--dim"><span>Cupom ${esc(c.cupom)}</span><span>aplicado</span></div>` : ''}
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
      const max = Math.min(MAX_PER_ITEM, p.stock);
      if (qty >= max) noLimite = true;
      return `
        <div class="lcart__item">
          ${thumbHTML(p)}
          <div class="lcart__info">
            <div class="lcart__top">
              <span class="lcart__name">${p.name}</span>
              <span class="lcart__price">${fmtBRL(round2(precoUnit(p) * qty))}</span>
            </div>
            <div class="lcart__sku">${p.id}</div>
            <div class="lcart__ctrl">
              <button type="button" class="lcart__trash" data-remove="${id}" aria-label="Remover ${p.name}">${ICON_TRASH}</button>
              <div class="loja__stepper">
                <button type="button" data-dec="${id}" aria-label="Diminuir">−</button>
                <span>${qty}</span>
                <button type="button" data-inc="${id}" aria-label="Aumentar" ${qty >= max ? 'disabled' : ''}>+</button>
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
              <span class="lcart__name">${p.name}</span>
              <span class="lcart__upsell-preco">${fmtBRL(p.price)}</span>
            </div>
            <button type="button" class="lcart__upsell-add" data-upsell-add="${p.id}">+ Comprar</button>
          </div>
        </div>`;
    }

    body.innerHTML = itens +
      (noLimite ? `<p class="lcart__limite">Limite de ${MAX_PER_ITEM} unidades por produto em cada pedido.</p>` : '') +
      upsell;

    const cupomBloco = cupom
      ? `<div class="lcart__cupom-ok"><span>Cupom <strong>${esc(cupom.codigo)}</strong> (−${cupom.valor}%)</span>
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
        <div class="lcart__sub"><span>Subtotal</span><strong>${fmtBRL(subtotal())}</strong></div>
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
  function mostrarMensagem(texto) {
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
      '  <div class="acesso-negado__topo"><span class="acesso-negado__titulo">Pagamento ⚠️</span></div>',
      `  <span class="acesso-negado__msg">${texto}</span>`,
      '</div>',
    ].join('');
    toastEl.classList.remove('is-open');
    requestAnimationFrame(() => toastEl.classList.add('is-open'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-open'), 4000);
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
    const itens = Object.keys(cart).map((id) => ({ id, quantidade: cart[id], preco: precoUnit(findProduct(id)) }));
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
          <span class="lck__lnome">${p.name}</span>
          <span class="lck__lpreco">${fmtBRL(round2(precoUnit(p) * q))}</span>
        </div>`;
    }).join('');

    const cupomBloco = cupom
      ? `<div class="lcart__cupom-ok"><span>Cupom <strong>${esc(cupom.codigo)}</strong> (−${cupom.valor}%)</span>
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
  // O frete segue como mais um item (id "FRETE"); o cupom já está nos preços unitários.
  function montarItens() {
    const items = Object.entries(cart).map(([id, qty]) => {
      const p = findProduct(id);
      return { id: p.id, title: p.name, quantity: qty, unit_price: precoUnit(p) };
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

  // Grava o pedido (aba "Compras"). Espera no máximo 3 s e ignora qualquer erro:
  // o histórico é secundário, o pagamento já foi gerado.
  async function registrarPedidoSeguro(initPoint) {
    try {
      const pedido = {
        itens: Object.keys(cart).map((id) => {
          const p = findProduct(id);
          return { id, nome: p.name, quantidade: cart[id], preco: precoUnit(p) };
        }),
        frete: frete ? { nome: frete.nome, preco: frete.preco } : null,
        cupom: cupom ? cupom.codigo : null,
        cep: soDig($('ckCep').value),
        cidade: $('ckCidade').value.trim(),
        uf: $('ckUf').value,
        init_point: initPoint || '',   // o servidor extrai o id da preferência p/ confirmar o pagamento depois
      };
      await Promise.race([API.registrarPedido(pedido), new Promise((r) => setTimeout(r, 3000))]);
    } catch (err) {
      console.warn('Pedido não registrado no histórico:', err.message);
    }
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

    try {
      const data = await API.criarPagamento(montarItens());
      if (data && data.init_point) {
        await registrarPedidoSeguro(data.init_point); // histórico em "Compras"; nunca impede o pagamento
        compras = null;
        window.location.href = data.init_point;   // Mercado Pago
        return;
      }
      mostrarMensagem('Não foi possível gerar o pagamento. Tente novamente.');
    } catch (err) {
      console.error(err);
      mostrarMensagem('Erro ao conectar com o servidor de pagamento.');
    }
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

  renderCategoryPanel();
  renderGrid();
  updatePageHead();
  updateCartCount();

  window.Loja = { abrirCheckout };
})();
