// ============================================================
// POPOUT "ACESSO NEGADO" — Intelbras
// Componente global (assets/): fica ouvindo clique em qualquer
// lugar do documento (delegação), então funciona mesmo com
// Cabeçalho/Conteúdo/Rodapé sendo carregados depois via fetch.
//
// Aparece como um toast fixo no TOPO CENTRAL da tela (não mais
// ancorado ao elemento clicado) e some sozinho depois de
// DURACAO_AUTO_FECHAR ms, além de poder ser fechado clicando
// fora ou no botão de login.
//
// SELETORES_BLOQUEADOS reúne as interações que exigem login:
//  - itens do menu lateral (exceto "Início", que é a página atual)
//  - canais (com cadeado) e "+ Ver todos"
//  - atalhos do menu lateral (Nova conversa / Agendar reunião)
//  - os mesmos atalhos duplicados no topo do conteúdo
//  - qualquer card/bloco marcado como bloqueado (.content__locked)
//    ou os cards compactos com mensagem de login (.content__card--compact)
//
// Pra adicionar um novo elemento bloqueado no futuro, basta
// acrescentar o seletor dele nessa lista — não precisa duplicar
// lógica em cada componente.
// ============================================================
(function () {
  // Usuário logado (área CADASTRADO): não existe mais "acesso negado" —
  // abas ainda não desenvolvidas levam a uma tela placeholder normal,
  // sem bloqueio nenhum. O <body data-logado="1"> é setado pelo index.php.
  if (document.body && document.body.dataset.logado === '1') {
    return;
  }

  const SELETORES_BLOQUEADOS = [
    '.content__nav-item:not(.content__nav-item--active)',
    '.content__channel-item',
    '.content__see-all',
    '.content__shortcut',
    '.content__locked',
    '.content__card--compact',
    '.content__actions .content__btn',
  ].join(', ');

  const DURACAO_AUTO_FECHAR = 2000; // ms — some sozinho depois desse tempo

  let popoutEl = null;
  let timeoutAutoFechar = null;

  function criarPopout() {
    const el = document.createElement('div');
    el.className = 'acesso-negado';
    el.setAttribute('role', 'alert');
    el.innerHTML = [
      '<div class="acesso-negado__card">',
      '  <span class="acesso-negado__blob acesso-negado__blob--tl" aria-hidden="true"></span>',
      '  <span class="acesso-negado__blob acesso-negado__blob--br" aria-hidden="true"></span>',
      '  <div class="acesso-negado__topo">',
      '    <span class="acesso-negado__titulo">Acesso negado ❌</span>',
      '  </div>',
      '  <button type="button" class="acesso-negado__btn" id="btnAcessoNegadoLogin">Faça login para desbloquear</button>',
      '</div>',
    ].join('');
    document.body.appendChild(el);
    return el;
  }

  function agendarAutoFechar() {
    clearTimeout(timeoutAutoFechar);
    timeoutAutoFechar = setTimeout(fecharPopout, DURACAO_AUTO_FECHAR);
  }

  function abrirPopout() {
    if (!popoutEl) popoutEl = criarPopout();
    popoutEl.classList.remove('is-open');
    // Um frame depois, pra garantir que o estado inicial já foi aplicado antes do fade-in
    requestAnimationFrame(() => popoutEl.classList.add('is-open'));
    agendarAutoFechar();
  }

  function fecharPopout() {
    clearTimeout(timeoutAutoFechar);
    if (popoutEl) popoutEl.classList.remove('is-open');
  }

  document.addEventListener('click', (e) => {
    const btnLogin = e.target.closest('#btnAcessoNegadoLogin');
    if (btnLogin) {
      e.preventDefault();
      // Impede que o listener de "clicar fora fecha o dropdown" do
      // cabeçalho (cabecalho.js) rode pra esse mesmo clique — como
      // os dois listeners estão no document, só stopPropagation() não
      // resolve (ela não bloqueia outros listeners no MESMO elemento,
      // só a propagação pra outros elementos). Precisa immediate:
      e.stopImmediatePropagation();
      fecharPopout();
      // O cabeçalho é quem sabe abrir o dropdown de login de verdade.
      // Ele é carregado via fetch() de forma assíncrona, então pode
      // ainda não ter terminado de carregar quando o usuário clica
      // aqui (ex.: conexão lenta, ou clique rápido logo após a página
      // abrir). Se a função ainda não existir, deixamos um "recado"
      // (window.__intelbrasLoginPendente) que o cabecalho.js consome
      // assim que termina de carregar — assim o clique nunca se perde.
      if (typeof window.intelbrasAbrirLogin === 'function') {
        window.intelbrasAbrirLogin();
      } else {
        window.__intelbrasLoginPendente = true;
      }
      return;
    }

    if (popoutEl && popoutEl.contains(e.target)) return; // clique dentro do popout não fecha

    const alvo = e.target.closest(SELETORES_BLOQUEADOS);
    if (alvo) {
      e.preventDefault();
      abrirPopout();
      return;
    }

    fecharPopout(); // clique em qualquer outro lugar fecha
  });

  document.addEventListener(
    'scroll',
    () => fecharPopout(),
    true // captura scroll de qualquer contêiner com overflow, não só a janela
  );
  window.addEventListener('resize', fecharPopout);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharPopout();
  });
})();
