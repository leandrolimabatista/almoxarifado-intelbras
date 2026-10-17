// Barra de rolagem da página: alça flutuante e transparente (ver assets/css/barra-pagina.css).
// Só ativa em telas com mouse; em celular/tablet continua a barra do sistema.
(function () {
  'use strict';
  if (!window.matchMedia || window.matchMedia('(pointer: coarse)').matches) return;

  var raiz = document.documentElement;
  var barra = document.createElement('div');
  barra.className = 'barra-pagina';
  barra.hidden = true;
  barra.setAttribute('aria-hidden', 'true');
  var alca = document.createElement('div');
  alca.className = 'barra-pagina__alca';
  barra.appendChild(alca);
  document.body.appendChild(barra);
  raiz.classList.add('barra-pagina-ativa');

  var arrastando = false, inicioY = 0, inicioTopo = 0;

  function medidas() {
    var vh = window.innerHeight;
    var total = Math.max(raiz.scrollHeight, document.body.scrollHeight);
    return { vh: vh, total: total, max: total - vh };
  }

  function atualizar() {
    var m = medidas();
    var travada = getComputedStyle(raiz).overflowY === 'hidden' || getComputedStyle(document.body).overflowY === 'hidden';
    if (m.max <= 1 || travada) { barra.hidden = true; return; }
    barra.hidden = false;
    var h = Math.max(48, Math.round(m.vh * m.vh / m.total));
    var topo = Math.round((window.pageYOffset || raiz.scrollTop) / m.max * (m.vh - h));
    alca.style.height = h + 'px';
    alca.style.top = Math.min(Math.max(0, topo), m.vh - h) + 'px';
  }

  alca.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    arrastando = true;
    inicioY = e.clientY;
    inicioTopo = parseFloat(alca.style.top) || 0;
    alca.classList.add('barra-pagina__alca--arrastando');
    alca.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  alca.addEventListener('pointermove', function (e) {
    if (!arrastando) return;
    var m = medidas();
    var h = alca.offsetHeight;
    var livre = m.vh - h;
    if (livre <= 0) return;
    var topo = Math.min(Math.max(0, inicioTopo + (e.clientY - inicioY)), livre);
    window.scrollTo(0, topo / livre * m.max);
  });

  function soltar(e) {
    if (!arrastando) return;
    arrastando = false;
    alca.classList.remove('barra-pagina__alca--arrastando');
    try { alca.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  alca.addEventListener('pointerup', soltar);
  alca.addEventListener('pointercancel', soltar);

  window.addEventListener('scroll', atualizar, { passive: true });
  window.addEventListener('resize', atualizar);
  window.addEventListener('load', atualizar);
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(atualizar);
    ro.observe(document.body);
    ro.observe(raiz);
  }
  new MutationObserver(atualizar).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  setInterval(atualizar, 700); // conteúdo que carrega depois (listas, imagens)
  atualizar();
})();
