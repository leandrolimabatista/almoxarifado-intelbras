// ============================================================
// CONTEÚDO — Unidade (área CADASTRADO)
// Página "Minha Unidade":
//  - botão "Recolher" do menu lateral (mesmo comportamento das demais páginas)
//  - botão "Copiar endereço" (tile Endereço)
//  - selo "Aberto agora / Fechado agora" (tile Horário)
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

  // ---------- Copiar endereço ----------
  function copiarTexto(texto) {
    // Em http fora de localhost o navegador bloqueia navigator.clipboard;
    // nesse caso cai no método antigo (textarea + execCommand).
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto);
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy'));
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  document.querySelectorAll('[data-copiar]').forEach((btn) => {
    const rotulo = btn.querySelector('[data-copiar-texto]');
    const textoOriginal = rotulo ? rotulo.textContent : '';
    let timer = null;

    btn.addEventListener('click', () => {
      copiarTexto(btn.getAttribute('data-copiar')).then(() => {
        btn.classList.add('unidade__btn--copiado');
        if (rotulo) rotulo.textContent = 'Endereço copiado!';
      }).catch(() => {
        if (rotulo) rotulo.textContent = 'Não foi possível copiar';
      }).then(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          btn.classList.remove('unidade__btn--copiado');
          if (rotulo) rotulo.textContent = textoOriginal;
        }, 2000);
      });
    });
  });

  // ---------- Selo "Aberto agora" ----------
  // Usa o horário de Brasília (a unidade fica em São Paulo), não o do
  // computador de quem está vendo a página.
  const selo = document.getElementById('unidadeStatusHorario');

  function agoraEmSaoPaulo() {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const pega = (tipo) => partes.find((p) => p.type === tipo).value;
    const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      dia: dias[pega('weekday')],
      minutos: parseInt(pega('hour'), 10) * 60 + parseInt(pega('minute'), 10),
    };
  }

  function paraMinutos(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  function atualizarSelo() {
    if (!selo) return;
    const dias = selo.dataset.dias.split(',').map(Number);
    const abre = paraMinutos(selo.dataset.abre);
    const fecha = paraMinutos(selo.dataset.fecha);
    const agora = agoraEmSaoPaulo();
    const aberto = dias.includes(agora.dia) && agora.minutos >= abre && agora.minutos < fecha;

    selo.classList.toggle('unidade__status--inativa', !aberto);
    selo.querySelector('[data-status-texto]').textContent = aberto ? 'Aberto agora' : 'Fechado agora';
    selo.hidden = false;
  }

  if (selo) {
    try {
      atualizarSelo();
      setInterval(atualizarSelo, 60000);
    } catch (err) {
      selo.hidden = true;  // sem Intl/fuso disponível: melhor não mostrar nada
    }
  }
})();
