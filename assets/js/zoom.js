// ============================================================
// ZOOM — apoio ao assets/css/zoom.css (zoom do navegador até 500%)
//
//  1) Mantém a variável CSS --hdr-h igual à altura REAL do cabeçalho
//     (ela muda com o zoom, com a barra de busca aberta no mobile etc.).
//     O menu lateral e as páginas de altura fixa usam essa variável em
//     vez do "73px" antigo.
//
//  2) Em tela estreita (≤ 860px, o mesmo breakpoint do CSS) o menu lateral
//     é uma gaveta por cima do conteúdo: fecha ao tocar fora dela e com Esc.
//     Nesse modo o estado "aberto" NÃO é lembrado entre páginas (senão a
//     gaveta taparia o conteúdo a cada troca de aba).
// ============================================================
(function () {
  'use strict';

  var raiz = document.documentElement;
  var mqGaveta = window.matchMedia('(max-width: 860px)');

  // ---------- 1) altura do cabeçalho -> --hdr-h ----------
  function medirCabecalho() {
    var header = document.querySelector('.header');
    if (!header) return;
    var h = Math.round(header.getBoundingClientRect().height);
    // Cabeçalho "relative" (janela baixa) rola junto com a página: o menu
    // não precisa descontar a altura dele (o CSS zera o top nesse caso),
    // mas a variável continua valendo para as contas de altura.
    if (h > 0) raiz.style.setProperty('--hdr-h', h + 'px');
  }

  function observarCabecalho() {
    var header = document.querySelector('.header');
    if (!header) return;
    medirCabecalho();
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(medirCabecalho).observe(header);
    }
    window.addEventListener('resize', medirCabecalho);
    // Fontes web carregam depois e podem mudar a altura da 1ª linha
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(medirCabecalho);
    window.addEventListener('load', medirCabecalho);
  }

  // ---------- 2) menu lateral como gaveta ----------
  function gavetaAberta() {
    return mqGaveta.matches && document.body.classList.contains('sidebar-open');
  }

  function fecharGaveta() {
    document.body.classList.remove('sidebar-open');
    // Não grava em localStorage: em tela estreita o estado é só da sessão atual.
  }

  function iniciarGaveta() {
    // Em tela estreita a página sempre abre com o menu fechado.
    if (mqGaveta.matches) document.body.classList.remove('sidebar-open');

    document.addEventListener('click', function (e) {
      if (!gavetaAberta()) return;
      var alvo = e.target;
      if (!alvo || !alvo.closest) return;
      if (alvo.closest('.inicio__sidebar') || alvo.closest('#btnCategorias')) return;
      fecharGaveta();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && gavetaAberta()) fecharGaveta();
    });
  }

  function iniciar() {
    observarCabecalho();
    iniciarGaveta();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
