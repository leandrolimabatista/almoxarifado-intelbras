// ============================================================
// CONTEÚDO — Início (área CADASTRADO)
// Carrossel do banner + recolher menu lateral (mesmo
// comportamento da área não-cadastrada) + data da agenda do dia.
// ============================================================
(function () {
  const dots = document.querySelectorAll('.inicio__banner-dot');
  const btnPrev = document.querySelector('.inicio__banner-arrow--left');
  const btnNext = document.querySelector('.inicio__banner-arrow--right');
  let current = 0;

  function goTo(index) {
    if (!dots.length) return;
    current = (index + dots.length) % dots.length;
    dots.forEach((dot, i) => dot.classList.toggle('inicio__banner-dot--active', i === current));
  }

  if (btnPrev) btnPrev.addEventListener('click', () => goTo(current - 1));
  if (btnNext) btnNext.addEventListener('click', () => goTo(current + 1));
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));

  // Fecha o menu lateral pelo botão "Recolher"
  const btnRecolher = document.getElementById('btnRecolher');

  function fecharMenu() {
    document.body.classList.remove('sidebar-open');
  }

  if (btnRecolher) btnRecolher.addEventListener('click', fecharMenu);

  // Botão "Agendar reunião" do topo do Início -> página de agendamento
  const btnAgendarReuniao = document.getElementById('btnAgendarReuniao');
  if (btnAgendarReuniao) {
    btnAgendarReuniao.addEventListener('click', () => {
      window.location.href = 'index.php?pagina=agendar-reuniao';
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharMenu();
  });

  // ============================================================
  // AGENDA DO DIA — data de hoje por extenso, em pt-BR
  // ============================================================
  const agendaData = document.getElementById('agendaData');
  if (agendaData) {
    const hoje = new Date();
    const formatado = hoje.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
    agendaData.textContent = `Hoje – ${formatado}`;
  }

  // ============================================================
  // AGENDA DO DIA — clicar em um item o destaca (mesmo layout do
  // item atual, com botão "Entrar") e "+ N eventos para hoje"
  // mostra/esconde os eventos extras da lista.
  // ============================================================
  const agendaLista = document.getElementById('agendaLista');
  if (agendaLista) {
    const itens = agendaLista.querySelectorAll('.inicio__agenda-item');

    itens.forEach((item) => {
      item.addEventListener('click', (e) => {
        // Clicar no próprio botão "Entrar" apenas entra na reunião,
        // sem alterar a seleção do item.
        if (e.target.closest('.inicio__agenda-entrar')) return;

        itens.forEach((i) => i.classList.remove('inicio__agenda-item--current'));
        item.classList.add('inicio__agenda-item--current');
      });

      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.click();
        }
      });
    });
  }

  const agendaVerMais = document.getElementById('agendaVerMais');
  if (agendaVerMais && agendaLista) {
    const extras = agendaLista.querySelectorAll('.inicio__agenda-item--extra');
    const totalExtras = extras.length;

    agendaVerMais.addEventListener('click', () => {
      const expandido = agendaVerMais.getAttribute('aria-expanded') === 'true';
      extras.forEach((item) => {
        item.hidden = expandido;
      });
      agendaVerMais.setAttribute('aria-expanded', String(!expandido));
      agendaVerMais.textContent = expandido
        ? `+ ${totalExtras} eventos para hoje`
        : 'Mostrar menos';
    });
  }
})();
