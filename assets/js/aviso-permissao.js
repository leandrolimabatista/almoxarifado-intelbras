// ============================================================
// AVISO DE PERMISSÃO — Intelbras
// window.AvisoPermissao.mostrar(elemento, texto): balão escuro ancorado ao
// elemento clicado (some sozinho). Também intercepta links para
// "Agendar reunião" quando o cargo do usuário não permite
// (<body data-pode-agendar="0">, definido pelo index.php).
// ============================================================
(function () {
  let tip = null;
  let timer = null;
  let abertoEm = 0;

  function esconder() {
    clearTimeout(timer);
    if (tip) { tip.remove(); tip = null; }
  }

  function mostrar(alvo, texto) {
    esconder();
    abertoEm = Date.now();
    tip = document.createElement('div');
    tip.className = 'aviso-perm';
    tip.setAttribute('role', 'status');
    tip.textContent = texto;
    document.body.appendChild(tip);
    requestAnimationFrame(() => tip && tip.classList.add('aviso-perm--vis'));
    timer = setTimeout(esconder, 4200);
  }

  window.AvisoPermissao = { mostrar: mostrar, esconder: esconder };
  window.AVISO_AGENDAR = 'Apenas Diretores, Gerentes e CEO podem agendar reuniões.';

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') esconder(); });
  document.addEventListener('click', (e) => {
    if (tip && Date.now() - abertoEm > 80) esconder();
  });

  // Links para "Agendar reunião" (menu lateral, atalhos, cards) sem permissão
  document.addEventListener('click', (e) => {
    if (!document.body || document.body.dataset.podeAgendar !== '0') return;
    const a = e.target.closest('a[href*="pagina=agendar-reuniao"]');
    if (!a) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    mostrar(a, window.AVISO_AGENDAR);
  }, true);

  // Redirecionado pelo servidor (?aviso=agendar): mostra o balão no botão da página de Chamadas
  const p = new URLSearchParams(location.search);
  if (p.get('aviso') === 'agendar') {
    window.addEventListener('load', () => {
      setTimeout(() => mostrar(document.getElementById('btnAgendar') || document.querySelector('main'), window.AVISO_AGENDAR), 250);
      p.delete('aviso');
      history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
    });
  }
})();
