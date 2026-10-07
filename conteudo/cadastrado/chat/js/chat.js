// ============================================================
// CONTEÚDO — Chat (área CADASTRADO)
// Placeholder "em breve" — só precisa do botão "Recolher" do
// menu lateral (mesmo comportamento das demais páginas).
// ============================================================
(function () {
  const btnRecolher = document.getElementById('btnRecolher');

  function fecharMenu() {
    document.body.classList.remove('sidebar-open');
  }

  if (btnRecolher) btnRecolher.addEventListener('click', fecharMenu);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharMenu();
  });
})();
