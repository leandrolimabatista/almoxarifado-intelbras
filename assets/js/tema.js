/* ============================================================
   TEMA DO SITE — claro | escuro | automático
   ------------------------------------------------------------
   Carregue este arquivo SINCRONO no <head>, antes dos CSS, para o
   tema valer já no primeiro desenho (sem piscar).

   Como decide o tema:
   1) Logado: o servidor (index.php) escreve a preferência da conta no
      atributo  data-tema-pref  do <html>  (Configurações > Aparência).
   2) Sem login (visitante / páginas legais): usa o último valor
      guardado no navegador (localStorage "ibTema").
   3) Sem nada: CLARO (padrão).
   "automatico" segue o tema do sistema operacional e reage se ele mudar.

   O que ele faz:
   - html[data-tema="claro|escuro"]  -> ativa assets/css/tema-escuro.css
   - html[data-tema-pref="claro|escuro|automatico"]
   - troca as imagens que têm versão escura (banners e capas de cursos:
     <nome>.webp -> <nome>-escuro.webp)
   - dispara o evento  "ib:tema"  no document ({ detail: { pref, efetivo } })

   API:  IBTema.definir('claro'|'escuro'|'automatico')
         IBTema.pref()      -> preferência escolhida
         IBTema.efetivo()   -> 'claro' | 'escuro' (Automático já resolvido)
         IBTema.imagem(url) -> url da versão do tema atual (se existir)
============================================================= */
(function () {
  'use strict';
  if (window.IBTema) return;

  var CHAVE = 'ibTema';
  var raiz = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function valido(v) { return v === 'claro' || v === 'escuro' || v === 'automatico' ? v : null; }
  function lerLocal() { try { return valido(localStorage.getItem(CHAVE)); } catch (e) { return null; } }
  function gravarLocal(v) { try { localStorage.setItem(CHAVE, v); } catch (e) { /* ok */ } }

  var doServidor = valido(raiz.getAttribute('data-tema-pref'));
  var pref = doServidor || lerLocal() || 'claro';
  if (doServidor) gravarLocal(doServidor);   // páginas sem login seguem a última conta

  function efetivo() {
    if (pref === 'automatico') return mq && mq.matches ? 'escuro' : 'claro';
    return pref === 'escuro' ? 'escuro' : 'claro';
  }

  // ---------- imagens com versão escura ----------
  // .../img/banner/banner-8x1-1.webp  <->  .../img/banner/banner-8x1-1-escuro.webp
  // .../img/capas/capa-xxx-640.webp   <->  .../img/capas/capa-xxx-640-escuro.webp
  var RE_IMG = /(\/img\/(?:banner\/banner|capas\/capa)-[^\s,"']*?)(-escuro)?\.webp/g;
  function variante(txt, escuro) {
    return txt.replace(RE_IMG, function (m, base) { return base + (escuro ? '-escuro' : '') + '.webp'; });
  }

  function trocarNo(no, escuro) {
    if (!no || no.nodeType !== 1) return;
    var lista = [];
    if (no.matches && no.matches('img,source')) lista.push(no);
    if (no.querySelectorAll) lista = lista.concat([].slice.call(no.querySelectorAll('img,source')));
    for (var i = 0; i < lista.length; i++) {
      var el = lista[i];
      ['srcset', 'src'].forEach(function (attr) {
        var v = el.getAttribute(attr);
        if (v && v.indexOf('/img/') > -1) {
          var nv = variante(v, escuro);
          if (nv !== v) el.setAttribute(attr, nv);
        }
      });
    }
  }

  // Imagens criadas depois (ex.: capas dos cursos, desenhadas por JS)
  var obs = null;
  function observar(ligar) {
    if (!window.MutationObserver) return;
    if (!ligar) { if (obs) { obs.disconnect(); obs = null; } return; }
    if (obs) return;
    obs = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var add = muts[i].addedNodes;
        for (var j = 0; j < add.length; j++) trocarNo(add[j], true);
      }
    });
    obs.observe(raiz, { childList: true, subtree: true });
  }

  // ---------- aplica ----------
  function metaCor(cor) {
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m && document.head) {
      m = document.createElement('meta');
      m.name = 'theme-color';
      document.head.appendChild(m);
    }
    if (m) m.setAttribute('content', cor);
  }

  function aplicar(emitir) {
    var e = efetivo();
    var escuro = e === 'escuro';
    raiz.setAttribute('data-tema', e);
    raiz.setAttribute('data-tema-pref', pref);
    raiz.style.colorScheme = escuro ? 'dark' : 'light';
    metaCor(escuro ? '#0f1720' : '#ffffff');
    trocarNo(raiz, escuro);
    observar(escuro);
    if (emitir) {
      try { document.dispatchEvent(new CustomEvent('ib:tema', { detail: { pref: pref, efetivo: e } })); } catch (err) { /* ok */ }
    }
  }

  function definir(v) {
    var novo = valido(v);
    if (!novo || novo === pref) return;
    pref = novo;
    gravarLocal(pref);
    aplicar(true);
  }

  function aoMudarSistema() { if (pref === 'automatico') aplicar(true); }
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', aoMudarSistema);
    else if (mq.addListener) mq.addListener(aoMudarSistema);
  }

  // outra aba mudou o tema
  window.addEventListener('storage', function (ev) {
    if (ev.key !== CHAVE) return;
    var v = valido(ev.newValue);
    if (v && v !== pref) { pref = v; aplicar(true); }
  });

  window.IBTema = {
    definir: definir,
    pref: function () { return pref; },
    efetivo: efetivo,
    imagem: function (url) { return variante(String(url), efetivo() === 'escuro'); }
  };

  aplicar(false);
  // 1ª varredura quando o HTML terminar de carregar (imagens já no markup)
  document.addEventListener('DOMContentLoaded', function () { trocarNo(raiz, efetivo() === 'escuro'); });
})();
