// ============================================================
// RESPONSIVO — apoio ao assets/css/responsivo.css
//
//  Marca o <html> com o "tipo" de tela, para o CSS e os outros scripts
//  decidirem sem repetir matchMedia em todo lugar:
//
//    classes : is-toque (celular/tablet) · is-retrato · is-paisagem
//    atributo: data-faixa="notebook" | "tablet" | "celular"
//              (celular ≤ 600px · tablet ≤ 1180px · notebook acima)
//    variável CSS --app-h : altura realmente visível (sobe/desce com a barra
//              do navegador e com o teclado virtual) — usada por Chat e IA
//              para o campo de mensagem nunca ficar escondido pelo teclado.
//
//  API para outros scripts:  window.IBResponsivo
//    .faixa()        → 'notebook' | 'tablet' | 'celular'
//    .ehToque()      → boolean
//    .aoMudar(fn)    → chama fn(faixa) quando a faixa muda (girar a tela, redimensionar)
//
//  Os breakpoints são os da escada padrão descrita no responsivo.css.
// ============================================================
(function () {
  'use strict';

  var raiz = document.documentElement;
  var mm = window.matchMedia ? function (q) { return window.matchMedia(q); } : null;
  if (!mm) return;

  var mqToque = mm('(hover: none) and (pointer: coarse)');
  var mqRetrato = mm('(orientation: portrait)');
  var mqCelular = mm('(max-width: 600px)');
  var mqTablet = mm('(max-width: 1180px)');
  var ouvintes = [];
  var ultima = '';

  function faixa() {
    if (mqCelular.matches) return 'celular';
    if (mqTablet.matches) return 'tablet';
    return 'notebook';
  }

  function aplicar() {
    var f = faixa();
    raiz.classList.toggle('is-toque', mqToque.matches);
    raiz.classList.toggle('is-retrato', mqRetrato.matches);
    raiz.classList.toggle('is-paisagem', !mqRetrato.matches);
    raiz.setAttribute('data-faixa', f);
    if (f !== ultima) {
      ultima = f;
      ouvintes.forEach(function (fn) { try { fn(f); } catch (e) { /* ignora */ } });
    }
  }

  // ---- altura visível (teclado virtual) -> --app-h ----
  function medirAltura() {
    var vv = window.visualViewport;
    var h = vv ? vv.height : window.innerHeight;
    raiz.style.setProperty('--app-h', Math.round(h) + 'px');
  }

  [mqToque, mqRetrato, mqCelular, mqTablet].forEach(function (mq) {
    if (mq.addEventListener) mq.addEventListener('change', aplicar);
    else if (mq.addListener) mq.addListener(aplicar);
  });

  aplicar();
  medirAltura();

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', medirAltura);
  }
  window.addEventListener('resize', medirAltura);
  window.addEventListener('orientationchange', function () { setTimeout(medirAltura, 250); });

  window.IBResponsivo = {
    faixa: faixa,
    ehToque: function () { return mqToque.matches; },
    aoMudar: function (fn) { if (typeof fn === 'function') ouvintes.push(fn); }
  };
})();
