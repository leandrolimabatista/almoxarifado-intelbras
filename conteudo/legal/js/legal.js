/* ============================================================
   PÁGINAS LEGAIS — Intelbras — Funcionamento
   - gaveta do menu no mobile
   - grupos recolhíveis no menu lateral
   - destaque da seção atual em "Nesta página" (scrollspy)
   - botão imprimir
============================================================= */
(function () {
  'use strict';

  var body = document.body;
  var btnMenu = document.getElementById('legalMenuBtn');
  var overlay = document.getElementById('legalOverlay');

  function abrirMenu(abrir) {
    body.classList.toggle('legal-menu-aberto', abrir);
    if (btnMenu) btnMenu.setAttribute('aria-expanded', abrir ? 'true' : 'false');
  }

  if (btnMenu) btnMenu.addEventListener('click', function () {
    abrirMenu(!body.classList.contains('legal-menu-aberto'));
  });
  if (overlay) overlay.addEventListener('click', function () { abrirMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') abrirMenu(false); });

  // Grupos recolhíveis
  document.querySelectorAll('.legal__grupo-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var aberto = btn.getAttribute('aria-expanded') !== 'false';
      btn.setAttribute('aria-expanded', aberto ? 'false' : 'true');
    });
  });

  // Scrollspy
  var links = Array.prototype.slice.call(document.querySelectorAll('#legalIndice a[href^="#"]'));
  var secoes = links
    .map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); })
    .filter(Boolean);

  function marcar(id) {
    links.forEach(function (a) {
      var ativo = a.getAttribute('href') === '#' + id;
      a.classList.toggle('is-ativo', ativo);
    });
  }

  if (secoes.length && 'IntersectionObserver' in window) {
    var visiveis = {};
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) { visiveis[en.target.id] = en.isIntersecting; });
      for (var i = 0; i < secoes.length; i++) {
        if (visiveis[secoes[i].id]) { marcar(secoes[i].id); return; }
      }
    }, { rootMargin: '-80px 0px -65% 0px', threshold: 0 });
    secoes.forEach(function (s) { io.observe(s); });
  }

  links.forEach(function (a) {
    a.addEventListener('click', function () { abrirMenu(false); });
  });

  /* Menu do botão direito nos links do menu lateral e da barra superior
     (mesmo componente e visual do menu lateral do site: assets/js/menu-contexto.js).
     Shift + botão direito continua abrindo o menu nativo do navegador. */
  var SEL_LINK = '.legal__menu a[href], .legal__topo a[href]';

  function nomeDoLink(a) {
    var sp = a.querySelector('span');
    return ((sp ? sp.textContent : a.textContent) || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  }

  function abrirMenuLink(a, x, y) {
    var MC = window.MenuContexto;
    if (!MC) return false;
    var url = a.href;
    var nome = nomeDoLink(a);
    if (!x && !y) { var r = a.getBoundingClientRect(); x = r.left + 24; y = r.bottom - 6; }
    MC.mostrar({
      x: x, y: y, alvo: a,
      aria: 'Opções de ' + nome,
      cabeca: function (cabeca) {
        var ico = a.querySelector('svg.legal__icon');
        if (ico) {
          var cc = ico.cloneNode(true);
          cc.removeAttribute('class');
          cabeca.appendChild(cc);
        } else {
          cabeca.insertAdjacentHTML('beforeend', MC.icone('pagina'));
        }
        var n = document.createElement('span');
        n.className = 'ml-menu__cabeca-nome';
        n.textContent = nome;
        cabeca.appendChild(n);
      },
      opcoes: [
        { rotulo: 'Abrir', icone: 'abrir', destaque: true, acao: function () { a.click(); } },
        { rotulo: 'Abrir em nova aba', icone: 'abrir', acao: function () { window.open(url, '_blank', 'noopener'); } },
        { rotulo: 'Copiar link', icone: 'link', acao: function () { MC.copiar(url, 'Link copiado'); } }
      ]
    });
    return true;
  }

  // Captura: roda antes do tratamento padrão do menu-contexto.js
  document.addEventListener('contextmenu', function (e) {
    if (e.shiftKey || !e.target.closest) return;
    var a = e.target.closest(SEL_LINK);
    if (!a || !window.MenuContexto) return;
    e.preventDefault();
    abrirMenuLink(a, e.clientX, e.clientY);
  }, true);

  // Toque longo (celular/iOS não dispara "contextmenu" em links)
  (function () {
    var timer = null, bloquear = 0;
    document.addEventListener('touchstart', function (e) {
      var a = e.target.closest && e.target.closest(SEL_LINK);
      if (!a || !window.MenuContexto || e.touches.length !== 1) return;
      var t = e.touches[0];
      clearTimeout(timer);
      timer = setTimeout(function () { bloquear = Date.now(); abrirMenuLink(a, t.clientX, t.clientY); }, 550);
    }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach(function (ev) {
      document.addEventListener(ev, function () { clearTimeout(timer); }, { passive: true });
    });
    document.addEventListener('click', function (e) {
      if (Date.now() - bloquear < 700 && e.target.closest && e.target.closest(SEL_LINK)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  })();

  // Imprimir
  var btnImprimir = document.getElementById('legalImprimir');
  if (btnImprimir) btnImprimir.addEventListener('click', function () { window.print(); });
})();
