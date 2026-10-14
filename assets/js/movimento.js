// ============================================================
// MOVIMENTO — classifica os elementos por função e dispara as
// animações de entrada. O visual de cada função está em
// assets/css/movimento.css.
//
// Não muda HTML, fonte, tamanho nem posição de nada: só adiciona
// atributos data-mv-* (que o CSS usa) e o índice da cascata.
//
// Funções (data-mv):
//   btn (+ primary | danger | ghost | icon)   botões
//   field                                     inputs / selects / textareas com borda
//   surface                                   cards estáticos
//   tile                                      cards clicáveis (sobem no hover)
//   menu | dialog | backdrop | toast          camadas flutuantes
//   menuitem | row | navitem | chip           itens de lista, menu lateral, abas/filtros
//
// Para excluir um trecho inteiro: data-mv-skip no elemento pai.
// ============================================================
(function () {
  'use strict';
  if (window.__mvIniciado) return;
  window.__mvIniciado = true;

  var inicio = performance.now();
  var ultimaInteracao = -9999;
  var janelaInicial = 1800;   // ms após abrir a página em que cards entram em cascata
  var janelaInteracao = 900;  // ms após clique/tecla em que novos cards também entram

  ['pointerdown', 'keydown', 'input'].forEach(function (ev) {
    window.addEventListener(ev, function () { ultimaInteracao = performance.now(); }, true);
  });

  // ---------- padrões de classe (nomes BEM usados no projeto) ----------
  var RX = {
    surface:  /(^|__)card$|^(curso|modulo)-card$|__(opcao|integracao|info|restrito|upsell)-card$|__banner$/,
    tile:     /__tile$|__shortcut-tile$/,
    sempreTile: /^(servicos__card|loja__card|curso-card|modulo-card|usuarios__tile|inicio__shortcut-tile|configuracoes__opcao-card|configuracoes__integracao-card|loja__cat-item)$/,
    dialog:   /__modal-caixa$|__dialogo$|__novo-painel$|^login-modal__card$/,
    backdrop: /__modal(-fundo)?$|__novo-fundo$|^login-modal$/,
    menu:     /__menu$|__popover$|__msg-menu$|__anexo-menu$|__emoji-tom-menu$|^user-menu__card$/,
    toast:    /__toast$/,
    menuitem: /__(menu-item|popover-item|link-item)$|^user-menu__item$/,
    row:      /__(channel|activity|notice)-row$|__agenda-item$|__channel-item$|__acesso-item$|__atividade-item$|^chat__(conversa|contato)-item$/,
    navitem:  /__nav-item$|^inicio__(channel-item|shortcut)$/,
    side:     /^inicio__(nav-item|channel-item|shortcut|collapse|sidebar-label)$/,
    chip:     /__chip$|^chip-filtro$|__pill$|__cat-btn$|__tab$|__aba$|__filtro$/,
    btn:      /(^|[_-])btn([_-]|$)|botao|(^|__)icone-btn/,
    primary:  /primary|primario|submit|--novo|chat__btn-novo|__add(\s|$)/,
    danger:   /perigo|danger|--sair|recusar|excluir/,
    ghost:    /outline|contorno|secund|cancel|voltar|--back/
  };

  var TIPOS_CAMPO = /^(text|search|email|password|number|tel|url|date|time|datetime-local|month|week)$/;

  function tokens(el) {
    var c = el.getAttribute('class');
    return c ? c.split(/\s+/).filter(Boolean) : [];
  }
  function algum(tks, rx) {
    for (var i = 0; i < tks.length; i++) if (rx.test(tks[i])) return true;
    return false;
  }
  function redondo(cs) {
    var r = cs.borderTopLeftRadius || '';
    return r.indexOf('%') !== -1 || parseFloat(r) >= 20;
  }
  function clicavel(el, cs) {
    var t = el.tagName;
    return t === 'A' || t === 'BUTTON' || el.hasAttribute('tabindex') ||
      el.getAttribute('role') === 'button' || el.hasAttribute('data-href') ||
      cs.cursor === 'pointer';
  }
  function semTexto(el) {
    return !(el.textContent || '').trim() && !!el.querySelector('svg, img');
  }
  function jaAnimado(cs) {
    return cs.animationName && cs.animationName !== 'none';
  }

  var NAO_CARD = /^(INPUT|SELECT|TEXTAREA|BUTTON|IMG|VIDEO|CANVAS|TD|TR|TH|TABLE|LI|SVG|LABEL|SPAN|P|H1|H2|H3|H4)$/;
  function ehCardGenerico(el, tag, cs) {
    if (NAO_CARD.test(tag)) return false;
    if (cs.position === 'absolute' || cs.position === 'fixed') return false; // menus, modais
    if (!el.closest('main') || el.closest('.inicio__sidebar')) return false;
    if (cs.backgroundColor !== 'rgb(255, 255, 255)' && !/^rgb\(2[0-9], 3[0-9], 4[0-9]\)$/.test(cs.backgroundColor)) return false;
    var borda = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
    if (!borda && cs.boxShadow === 'none') return false;
    if (parseFloat(cs.borderTopLeftRadius) < 6) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 150 || r.height < 56) return false;
    if (el.parentElement && el.parentElement.closest('[data-mv~="surface"], [data-mv~="tile"]')) return false;
    return true;
  }

  // ---------- classificação de um elemento ----------
  function classificar(el, lote) {
    if (el.nodeType !== 1 || el.hasAttribute('data-mv') || el.closest('[data-mv-skip]')) return;
    var tag = (el.tagName || '').toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'SVG' || tag === 'PATH') return;

    var tks = tokens(el);
    if (algum(tks, RX.side)) el.setAttribute('data-mv-side', tks.indexOf('inicio__collapse') !== -1 ? 'recolher' : '');
    var cs = getComputedStyle(el);
    var f = [];
    var anim = false;

    // campos de formulário
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      var tipo = (el.getAttribute('type') || 'text').toLowerCase();
      if (tag !== 'INPUT' || TIPOS_CAMPO.test(tipo)) {
        if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') f.push('field');
      } else if (tipo === 'submit' || tipo === 'button') {
        f.push('btn');
      }
    }

    // camadas flutuantes
    if (algum(tks, RX.dialog))   { f.push('dialog');   anim = true; }
    if (algum(tks, RX.backdrop) && f.indexOf('dialog') === -1) { f.push('backdrop'); anim = true; }
    if (algum(tks, RX.toast))    { f.push('toast');    anim = true; }
    if (algum(tks, RX.menu) && (cs.position === 'absolute' || cs.position === 'fixed')) {
      f.push('menu'); anim = true;
    }

    // itens de lista / menu
    var ehNav = algum(tks, RX.navitem);
    if (ehNav) f.push('navitem');
    if (algum(tks, RX.menuitem)) f.push('menuitem');
    if (algum(tks, RX.row) && clicavel(el, cs)) f.push('row');

    // cards
    var ehCard = algum(tks, RX.surface) || (algum(tks, RX.tile) && !/(^|\s)sala__/.test(tks.join(' ')));
    if (ehCard) {
      var tile = algum(tks, RX.sempreTile) || clicavel(el, cs);
      f.push(tile ? 'tile' : 'surface');
      if (tile) f.push('surface');
    }

    // card "genérico": bloco branco com borda ou sombra e cantos arredondados que
    // nenhuma regra acima reconheceu (ex.: cards de Chamadas, painéis de Nova
    // conversa). Garante o MESMO comportamento em qualquer página, sem depender
    // do nome da classe. Só 1 nível: o que está dentro de um card não anima de novo.
    if (!ehCard && !f.length && ehCardGenerico(el, tag, cs)) {
      var clic = clicavel(el, cs);
      f.push(clic ? 'tile' : 'surface');
      if (clic) f.push('surface');
      ehCard = true;
    }

    // abas / chips / filtros (só se forem clicáveis)
    var ehChip = algum(tks, RX.chip) && clicavel(el, cs);
    if (ehChip) f.push('chip');

    // botões
    var ehBtn = f.indexOf('btn') !== -1 ||
      ((tag === 'BUTTON' || el.getAttribute('role') === 'button' ||
        (tag === 'A' && algum(tks, RX.btn))) && !ehChip && !ehNav && f.indexOf('menuitem') === -1);
    if (ehBtn) {
      if (f.indexOf('btn') === -1) f.push('btn');
      var todas = tks.join(' ');
      if (RX.primary.test(todas)) f.push('primary');
      else if (RX.danger.test(todas)) f.push('danger');
      else if (RX.ghost.test(todas)) f.push('ghost');
      else if (semTexto(el)) f.push('icon');
      if (redondo(cs)) el.setAttribute('data-mv-round', '');
    }
    if (f.indexOf('field') !== -1 && redondo(cs)) el.setAttribute('data-mv-round', '');

    if (!f.length) return;

    el.setAttribute('data-mv', f.join(' '));
    if (anim && !jaAnimado(cs)) el.setAttribute('data-mv-anim', '');

    if ((f.indexOf('surface') !== -1 || f.indexOf('tile') !== -1) && lote) lote.push(el);
  }

  // ---------- entrada em cascata dos cards ----------
  function podeRevelar() {
    var agora = performance.now();
    return (agora - inicio) < janelaInicial || (agora - ultimaInteracao) < janelaInteracao;
  }
  function revelar(lote) {
    if (!lote.length || !podeRevelar()) return;
    var main = document.querySelector('main');
    if (!main) return;
    var i = 0;
    lote.forEach(function (el) {
      if (!main.contains(el)) return;
      if (el.closest('[data-mv-in]')) return;                  // pai já está animando
      if (el.closest('[class*="mensagens"], [class*="__msg"]')) return; // chat: não reanima polling
      if (jaAnimado(getComputedStyle(el))) return;
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return; // oculto
      el.style.setProperty('--mv-i', String(Math.min(i, 14)));
      el.setAttribute('data-mv-in', '');
      i++;
    });
  }
  document.addEventListener('animationend', function (e) {
    var el = e.target;
    if (el && el.hasAttribute && el.hasAttribute('data-mv-in') && /mv-rise/.test(e.animationName)) {
      el.removeAttribute('data-mv-in');
      el.style.removeProperty('--mv-i');
    }
    if (el && el.hasAttribute && el.hasAttribute('data-mv-nav-in') && /mv-slide-in/.test(e.animationName)) {
      el.removeAttribute('data-mv-nav-in');
      el.style.removeProperty('--mv-i');
    }
  }, true);

  // ---------- varredura ----------
  var SELETOR = '[class], input, select, textarea, button, a';
  function varrer(raiz) {
    var lote = [];
    if (raiz.nodeType === 1) classificar(raiz, lote);
    var lista = raiz.querySelectorAll ? raiz.querySelectorAll(SELETOR) : [];
    for (var i = 0; i < lista.length; i++) classificar(lista[i], lote);
    revelar(lote);
  }

  function marcarPagina() {
    var main = document.querySelector('main');
    if (!main) return;
    var lateral = main.querySelector('aside#sidebar, aside.inicio__sidebar');
    var alvo = lateral ? lateral.nextElementSibling : main.firstElementChild;
    if (alvo && !alvo.hasAttribute('data-mv-page')) alvo.setAttribute('data-mv-page', '');
  }

  // Cascata do menu lateral: itens, rótulos de seção (EQUIPES / ATALHOS) e "Recolher"
  // deslizam um a um. Dispara (1) na 1ª página da sessão e (2) toda vez que o
  // menu é aberto em "Todas categorias". Entre páginas o menu "fica parado".
  function animarMenuLateral() {
    var itens = document.querySelectorAll('.inicio__sidebar [data-mv-side]');
    if (!itens.length) return;
    for (var i = 0; i < itens.length; i++) itens[i].removeAttribute('data-mv-nav-in');
    void document.body.offsetWidth; // força reflow: permite reiniciar a animação
    for (var n = 0; n < itens.length; n++) {
      itens[n].style.setProperty('--mv-i', String(Math.min(n, 16)));
      itens[n].setAttribute('data-mv-nav-in', '');
    }
  }

  function marcarMenuLateral() {
    try {
      if (sessionStorage.getItem('mvMenuIntro') !== '1' && document.body.classList.contains('sidebar-open')) {
        animarMenuLateral();
        sessionStorage.setItem('mvMenuIntro', '1');
      }
    } catch (e) { /* storage indisponível: ignora */ }

    var estavaAberto = document.body.classList.contains('sidebar-open');
    new MutationObserver(function () {
      var aberto = document.body.classList.contains('sidebar-open');
      if (aberto && !estavaAberto) animarMenuLateral();
      estavaAberto = aberto;
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function iniciar() {
    marcarPagina();
    varrer(document.body);
    marcarMenuLateral();
    document.documentElement.classList.remove('mv-boot'); // libera o <main> (anti-flash)

    // conteúdo que aparece depois (listas vindas da API, modais, toasts, menus)
    new MutationObserver(function (muts) {
      var lote = [];
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          classificar(n, lote);
          if (n.querySelectorAll) {
            var lista = n.querySelectorAll(SELETOR);
            for (var i = 0; i < lista.length; i++) classificar(lista[i], lote);
          }
        });
      });
      revelar(lote);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
