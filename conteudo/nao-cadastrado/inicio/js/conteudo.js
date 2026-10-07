// ============================================================
// CONTEÚDO — Intelbras
// Carrossel do banner + recolher menu lateral
// ============================================================
(function () {
  const dots = document.querySelectorAll('.content__banner-dot');
  const btnPrev = document.querySelector('.content__banner-arrow--left');
  const btnNext = document.querySelector('.content__banner-arrow--right');
  let current = 0;

  function goTo(index) {
    if (!dots.length) return;
    current = (index + dots.length) % dots.length;
    dots.forEach((dot, i) => dot.classList.toggle('content__banner-dot--active', i === current));
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharMenu();
  });

  // ============================================================
  // AGENDA DO DIA — carregamento real via backend
  //
  // Enquanto não houver backend, o card permanece no estado
  // padrão "Faça login para visualizar sua agenda" (já presente
  // no HTML) e nada é exibido além disso — sem números inventados.
  //
  // Quando o endpoint existir, basta ajustar AGENDA_ENDPOINT abaixo.
  // Contrato esperado da resposta (JSON):
  //   {
  //     "autenticado": true,
  //     "eventos": [
  //       { "hora": "09:00", "titulo": "Reunião com cliente X" },
  //       { "hora": "14:30", "titulo": "Alinhamento de squad" }
  //     ]
  //   }
  // - autenticado=false  -> mantém a mensagem de login (não altera nada).
  // - eventos = []        -> mostra "Nenhum evento para hoje." (sem contagem).
  // - eventos.length > N  -> mostra os primeiros N e o rodapé
  //                          "+X eventos para hoje" com o X real.
  // ============================================================
  const AGENDA_ENDPOINT = null; // ex.: '/api/agenda-do-dia.php' — trocar quando o backend estiver pronto
  const AGENDA_MAX_VISIVEL = 2;

  function renderAgendaDoDia(dados) {
    const card = document.getElementById('agendaDoDia');
    if (!card) return;

    // Sem autenticação: mantém o estado padrão de login já presente no HTML.
    if (!dados || dados.autenticado !== true) return;

    const eventos = Array.isArray(dados.eventos) ? dados.eventos : [];

    // Esconde todo o conteúdo do estado "deslogado" (skeletons + cadeado)
    card.querySelectorAll('[data-agenda-estado="deslogado"]').forEach((el) => {
      el.hidden = true;
    });

    const lista = document.getElementById('agendaLista');
    const vazio = document.getElementById('agendaVazio');
    const footnote = document.getElementById('agendaFootnote');

    if (eventos.length === 0) {
      if (vazio) vazio.hidden = false;
      if (lista) lista.hidden = true;
      if (footnote) footnote.hidden = true;
      return;
    }

    if (vazio) vazio.hidden = true;

    if (lista) {
      lista.innerHTML = '';
      eventos.slice(0, AGENDA_MAX_VISIVEL).forEach((evento) => {
        const li = document.createElement('li');
        li.className = 'content__agenda-item';

        const hora = document.createElement('span');
        hora.className = 'content__agenda-item-hora';
        hora.textContent = evento.hora || '';

        const titulo = document.createElement('span');
        titulo.className = 'content__agenda-item-titulo';
        titulo.textContent = evento.titulo || '';

        li.appendChild(hora);
        li.appendChild(titulo);
        lista.appendChild(li);
      });
      lista.hidden = false;
    }

    const restantes = eventos.length - AGENDA_MAX_VISIVEL;
    if (footnote) {
      if (restantes > 0) {
        footnote.textContent = `+ ${restantes} evento${restantes > 1 ? 's' : ''} para hoje`;
        footnote.hidden = false;
      } else {
        footnote.hidden = true;
      }
    }
  }

  function carregarAgendaDoDia() {
    if (!AGENDA_ENDPOINT) return; // sem backend configurado ainda: não faz nada, mantém o padrão

    fetch(AGENDA_ENDPOINT, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((dados) => renderAgendaDoDia(dados))
      .catch(() => {
        // Falha silenciosa: mantém o estado padrão de login em vez de quebrar o card.
      });
  }

  carregarAgendaDoDia();
})();
