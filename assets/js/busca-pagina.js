// ============================================================
// BUSCA NA PÁGINA (Ctrl+F / Cmd+F) — Intelbras
// Substitui a barra de busca nativa do navegador por um popout no
// padrão do site. Procura o texto visível da página (sem diferenciar
// maiúsculas/minúsculas nem acentos), destaca os resultados e permite
// navegar entre eles.
//
// Atalhos:  Ctrl+F abre/foca  |  Enter / Shift+Enter próximo/anterior
//           F3 / Ctrl+G também navegam  |  Esc fecha
// Estilo: assets/css/busca-pagina.css
// ============================================================
(function () {
  'use strict';
  if (window.__buscaPagina) return;
  window.__buscaPagina = true;

  var LIMITE = 1500;                       // máximo de resultados destacados
  var IGNORAR = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, SVG: 1, TEMPLATE: 1, MARK: 0 };

  var barra = null, campo, contador, btnAnt, btnProx;
  var marcas = [], atual = -1, aberta = false, timer = null;

  var ICONES = {
    busca: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    cima: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 15l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    baixo: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fechar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  // Normaliza mantendo o MESMO tamanho do texto (1 caractere -> 1 caractere),
  // para os índices do texto normalizado servirem no texto original.
  function norm(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      out += s.charAt(i).toLowerCase().normalize('NFD').charAt(0);
    }
    return out;
  }

  function escaparRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function criarBarra() {
    barra = document.createElement('div');
    barra.className = 'bp-barra';
    barra.setAttribute('role', 'search');
    barra.setAttribute('aria-label', 'Buscar na página');
    barra.setAttribute('data-mv-skip', '');
    barra.innerHTML =
      '<div class="bp-card">' +
        '<span class="bp-blob bp-blob--tl"></span><span class="bp-blob bp-blob--br"></span>' +
        '<label class="bp-campo-wrap">' +
          '<span class="bp-icone" aria-hidden="true">' + ICONES.busca + '</span>' +
          '<input type="text" class="bp-campo" placeholder="Buscar na página" aria-label="Buscar na página" autocomplete="off" spellcheck="false">' +
          '<span class="bp-contador" aria-live="polite"></span>' +
        '</label>' +
        '<div class="bp-acoes">' +
          '<button type="button" class="bp-btn" data-bp="ant" aria-label="Resultado anterior" title="Anterior (Shift+Enter)">' + ICONES.cima + '</button>' +
          '<button type="button" class="bp-btn" data-bp="prox" aria-label="Próximo resultado" title="Próximo (Enter)">' + ICONES.baixo + '</button>' +
          '<span class="bp-sep" aria-hidden="true"></span>' +
          '<button type="button" class="bp-btn bp-btn--fechar" data-bp="fechar" aria-label="Fechar busca" title="Fechar (Esc)">' + ICONES.fechar + '</button>' +
        '</div>' +
      '</div>';

    campo = barra.querySelector('.bp-campo');
    contador = barra.querySelector('.bp-contador');
    btnAnt = barra.querySelector('[data-bp="ant"]');
    btnProx = barra.querySelector('[data-bp="prox"]');

    campo.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(buscar, 80);
    });
    campo.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!marcas.length || marcas[0].parentNode === null) buscar();
        else navegar(e.shiftKey ? -1 : 1);
      }
    });
    barra.addEventListener('click', function (e) {
      var b = e.target.closest('[data-bp]');
      if (!b) return;
      var acao = b.getAttribute('data-bp');
      if (acao === 'fechar') fechar();
      else navegar(acao === 'ant' ? -1 : 1);
    });
  }

  // Se houver um <dialog> modal aberto, a barra precisa morar dentro dele
  // (o resto da página fica inerte e abaixo da camada superior do modal).
  function hospedar() {
    var modal = document.querySelector('dialog[open]:modal');
    var destino = modal || document.body;
    if (barra.parentNode !== destino) destino.appendChild(barra);
  }

  function abrir() {
    if (!barra) criarBarra();
    hospedar();

    if (!aberta) {
      var sel = (window.getSelection ? String(window.getSelection()) : '').trim();
      if (sel && sel.length <= 100 && sel.indexOf('\n') === -1) campo.value = sel;
    }
    aberta = true;
    requestAnimationFrame(function () { barra.classList.add('is-open'); });
    campo.focus();
    campo.select();
    if (campo.value) buscar();
    else atualizarContador();
  }

  function fechar() {
    if (!aberta) return;
    aberta = false;
    clearTimeout(timer);
    limpar();
    barra.classList.remove('is-open');
    if (barra.contains(document.activeElement)) document.activeElement.blur();
  }

  function limpar() {
    var pais = [];
    for (var i = 0; i < marcas.length; i++) {
      var m = marcas[i], p = m.parentNode;
      if (!p) continue;
      p.replaceChild(document.createTextNode(m.textContent), m);
      if (pais.indexOf(p) === -1) pais.push(p);
    }
    for (var j = 0; j < pais.length; j++) pais[j].normalize();
    marcas = [];
    atual = -1;
  }

  function coletarTextos() {
    var cache = new Map();
    function visivel(el) {
      if (cache.has(el)) return cache.get(el);
      var ok = true;
      if (!el.getClientRects().length) ok = false;
      else {
        var cs = getComputedStyle(el);
        if (cs.visibility === 'hidden') ok = false;
      }
      cache.set(el, ok);
      return ok;
    }
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentElement;
        if (!p || IGNORAR[p.tagName.toUpperCase()] === 1) return NodeFilter.FILTER_REJECT;
        if (p.closest('.bp-barra')) return NodeFilter.FILTER_REJECT;
        if (!visivel(p)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var lista = [], n;
    while ((n = walker.nextNode())) lista.push(n);
    return lista;
  }

  function buscar() {
    limpar();
    var q = campo.value;
    if (!q.trim()) { atualizarContador(); return; }

    var re = new RegExp(escaparRegex(norm(q)).replace(/\s+/g, '\\s+'), 'g');
    var textos = coletarTextos();

    for (var i = 0; i < textos.length && marcas.length < LIMITE; i++) {
      var no = textos[i], original = no.nodeValue, base = norm(original);
      var m, ultimo = 0, frag = null;
      re.lastIndex = 0;
      while ((m = re.exec(base)) && marcas.length < LIMITE) {
        if (!m[0].length) { re.lastIndex++; continue; }
        if (!frag) frag = document.createDocumentFragment();
        if (m.index > ultimo) frag.appendChild(document.createTextNode(original.slice(ultimo, m.index)));
        var mk = document.createElement('mark');
        mk.className = 'bp-marca';
        mk.setAttribute('data-mv-skip', '');
        mk.textContent = original.slice(m.index, m.index + m[0].length);
        frag.appendChild(mk);
        marcas.push(mk);
        ultimo = m.index + m[0].length;
      }
      if (frag) {
        if (ultimo < original.length) frag.appendChild(document.createTextNode(original.slice(ultimo)));
        no.parentNode.replaceChild(frag, no);
      }
    }

    atual = -1;
    if (marcas.length) destacar(0); else atualizarContador();
  }

  function destacar(i) {
    if (!marcas.length) return;
    if (atual >= 0 && marcas[atual]) marcas[atual].classList.remove('bp-atual');
    atual = (i + marcas.length) % marcas.length;
    var mk = marcas[atual];
    mk.classList.add('bp-atual');
    mk.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    atualizarContador();
  }

  function navegar(dir) {
    if (!marcas.length) return;
    destacar(atual + dir);
  }

  function atualizarContador() {
    var temTexto = !!campo.value.trim();
    if (!temTexto) {
      contador.textContent = '';
      contador.classList.remove('is-vazio');
    } else if (!marcas.length) {
      contador.textContent = 'Sem resultados';
      contador.classList.add('is-vazio');
    } else {
      contador.textContent = (atual + 1) + ' de ' + marcas.length + (marcas.length >= LIMITE ? '+' : '');
      contador.classList.remove('is-vazio');
    }
    btnAnt.disabled = btnProx.disabled = !marcas.length;
  }

  document.addEventListener('keydown', function (e) {
    var mod = e.ctrlKey || e.metaKey;
    var k = e.key;

    if (mod && !e.altKey && (k === 'f' || k === 'F')) {
      e.preventDefault();
      abrir();
      return;
    }
    if (!aberta) return;

    if (k === 'Escape' && barra.contains(document.activeElement)) {
      e.preventDefault();
      e.stopPropagation();
      fechar();
    } else if (k === 'F3' || (mod && (k === 'g' || k === 'G'))) {
      e.preventDefault();
      navegar(e.shiftKey ? -1 : 1);
    }
  }, true);
})();
