// ============================================================
// DIÁLOGO PADRÃO DO SITE — Intelbras
// Substitui os popouts nativos do navegador por um popout do site.
//
//   IBDialogo.confirmar({ titulo, texto, confirmar, cancelar, perigo })
//       -> Promise<boolean>      (no lugar de window.confirm)
//   IBDialogo.avisar({ titulo, texto, botao })  ou  IBDialogo.avisar('texto')
//       -> Promise<void>         (no lugar de window.alert)
//   IBDialogo.protegerSaida(() => temAlteracao, { titulo, texto, confirmar,
//       cancelar, tituloRecarregar, textoRecarregar, confirmarRecarregar })
//       -> função que desfaz o registro
//       Enquanto a função devolver true: clicar em link interno do site e
//       apertar F5 / Ctrl+R mostram o popout do site. O aviso nativo do
//       navegador (beforeunload) fica só para o que o site não consegue
//       interceptar (botão recarregar da barra, fechar a aba, voltar).
// ============================================================
(function () {
  'use strict';
  if (window.IBDialogo) return;

  var fila = Promise.resolve();
  var contador = 0;
  var protecoes = [];
  var saidaLiberada = false;

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }

  // Abre um diálogo e resolve com true (botão de confirmação) ou false.
  function abrir(cfg) {
    return new Promise(function (resolve) {
      var id = 'ibDialogo' + (++contador);
      var anterior = document.activeElement;

      var raiz = el('div', 'ib-dialogo');
      var fundo = el('div', 'ib-dialogo__fundo');
      var caixa = el('div', 'ib-dialogo__caixa');
      caixa.setAttribute('role', 'alertdialog');
      caixa.setAttribute('aria-modal', 'true');
      caixa.setAttribute('aria-labelledby', id + 'T');
      caixa.setAttribute('aria-describedby', id + 'D');

      var titulo = el('h2', 'ib-dialogo__titulo', cfg.titulo || '');
      titulo.id = id + 'T';
      var texto = el('p', 'ib-dialogo__texto', cfg.texto || '');
      texto.id = id + 'D';
      var acoes = el('div', 'ib-dialogo__acoes');

      var btnCancelar = null;
      if (cfg.cancelar) {
        btnCancelar = el('button', 'ib-dialogo__btn ib-dialogo__btn--contorno', cfg.cancelar);
        btnCancelar.type = 'button';
        acoes.appendChild(btnCancelar);
      }
      var btnOk = el('button', 'ib-dialogo__btn ' + (cfg.perigo ? 'ib-dialogo__btn--perigo' : 'ib-dialogo__btn--primario'), cfg.confirmar || 'OK');
      btnOk.type = 'button';
      acoes.appendChild(btnOk);

      if (cfg.titulo) caixa.appendChild(titulo);
      caixa.appendChild(texto);
      caixa.appendChild(acoes);
      raiz.appendChild(fundo);
      raiz.appendChild(caixa);
      document.body.appendChild(raiz);
      requestAnimationFrame(function () { raiz.classList.add('is-open'); });

      // foco: no botão mais seguro (cancelar, quando a ação é destrutiva)
      (cfg.perigo && btnCancelar ? btnCancelar : btnOk).focus();

      var fechado = false;
      function fechar(resultado) {
        if (fechado) return;
        fechado = true;
        document.removeEventListener('keydown', teclas, true);
        raiz.classList.remove('is-open');
        setTimeout(function () { raiz.remove(); }, 170);
        try { if (anterior && anterior.focus) anterior.focus(); } catch (e) { /* ok */ }
        resolve(resultado);
      }

      function teclas(ev) {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          fechar(false);
        } else if (ev.key === 'Tab') {
          var itens = [].slice.call(caixa.querySelectorAll('button'));
          if (!itens.length) return;
          var i = itens.indexOf(document.activeElement);
          ev.preventDefault();
          if (ev.shiftKey) i = i <= 0 ? itens.length - 1 : i - 1;
          else i = i === itens.length - 1 ? 0 : i + 1;
          itens[i].focus();
        }
      }
      document.addEventListener('keydown', teclas, true);

      fundo.addEventListener('click', function () { fechar(false); });
      if (btnCancelar) btnCancelar.addEventListener('click', function () { fechar(false); });
      btnOk.addEventListener('click', function () { fechar(true); });
    });
  }

  // Um diálogo por vez (os seguintes esperam na fila).
  function enfileirar(cfg) {
    var p = fila.then(function () { return abrir(cfg); });
    fila = p.then(function () {}, function () {});
    return p;
  }

  function confirmar(cfg) {
    if (typeof cfg === 'string') cfg = { texto: cfg };
    return enfileirar({
      titulo: cfg.titulo || 'Confirmar ação',
      texto: cfg.texto || '',
      confirmar: cfg.confirmar || 'Confirmar',
      cancelar: cfg.cancelar || 'Cancelar',
      perigo: !!cfg.perigo,
    });
  }

  function avisar(cfg) {
    if (typeof cfg === 'string') cfg = { texto: cfg };
    return enfileirar({
      titulo: cfg.titulo || '',
      texto: cfg.texto || '',
      confirmar: cfg.botao || 'OK',
      cancelar: null,
      perigo: false,
    }).then(function () {});
  }

  // ---------- proteção de saída (alterações não salvas, chamada em andamento) ----------
  function protegerSaida(temAlteracao, textos) {
    var item = { fn: temAlteracao, t: textos || {} };
    protecoes.push(item);
    return function () {
      var i = protecoes.indexOf(item);
      if (i >= 0) protecoes.splice(i, 1);
    };
  }

  function ativa() {
    for (var i = 0; i < protecoes.length; i++) {
      var sujo = false;
      try { sujo = !!protecoes[i].fn(); } catch (e) { sujo = false; }
      if (sujo) return protecoes[i].t;
    }
    return null;
  }

  function liberarENavegar(acao) {
    saidaLiberada = true;
    acao();
  }

  document.addEventListener('click', function (ev) {
    if (saidaLiberada) return;
    var t = ativa();
    if (!t) return;
    if (ev.defaultPrevented || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target.closest && ev.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(href)) return;
    var url;
    try { url = new URL(a.href, window.location.href); } catch (e) { return; }
    if (url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    confirmar({
      titulo: t.titulo || 'Sair desta página?',
      texto: t.texto || 'Você tem alterações que ainda não foram salvas. Se sair agora, elas serão perdidas.',
      confirmar: t.confirmar || 'Sair da página',
      cancelar: t.cancelar || 'Continuar aqui',
      perigo: true,
    }).then(function (ok) {
      if (ok) liberarENavegar(function () { window.location.href = url.href; });
    });
  }, true);

  document.addEventListener('keydown', function (ev) {
    if (saidaLiberada) return;
    var k = (ev.key || '').toLowerCase();
    var recarrega = k === 'f5' || ((ev.ctrlKey || ev.metaKey) && k === 'r');
    if (!recarrega) return;
    var t = ativa();
    if (!t) return;
    ev.preventDefault();
    ev.stopPropagation();
    confirmar({
      titulo: t.tituloRecarregar || 'Recarregar a página?',
      texto: t.textoRecarregar || 'Você tem alterações que ainda não foram salvas. Se recarregar agora, elas serão perdidas.',
      confirmar: t.confirmarRecarregar || 'Recarregar',
      cancelar: t.cancelar || 'Cancelar',
      perigo: true,
    }).then(function (ok) {
      if (ok) liberarENavegar(function () { window.location.reload(); });
    });
  }, true);

  // Último recurso (botão recarregar da barra, fechar a aba, voltar): só o
  // navegador consegue perguntar, e o texto dele não é personalizável.
  window.addEventListener('beforeunload', function (ev) {
    if (saidaLiberada || !ativa()) return;
    ev.preventDefault();
    ev.returnValue = '';
  });

  window.IBDialogo = { confirmar: confirmar, avisar: avisar, protegerSaida: protegerSaida };
})();
