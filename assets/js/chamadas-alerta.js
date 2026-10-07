/* ============================================================
   Alerta global de chamada recebida (toast Atender/Recusar).
   Carregado em TODAS as páginas da área logada (index.php).
   - Fora do módulo Chamadas: faz o próprio polling (também
     mantém o usuário "Online" em toda a plataforma).
   - Dentro do módulo Chamadas: quem faz o polling é o
     chamadas.js, que só chama ChamadasAlerta.atualizar().
   Tudo dentro do site: nada de telefone/operadora.
============================================================ */
(function () {
  'use strict';
  if (window.ChamadasAlerta) return;
  if (document.body.getAttribute('data-logado') !== '1') return;

  const csrf = document.body.getAttribute('data-chamadas-csrf') || '';
  const noModulo = !!document.getElementById('chRaiz');
  const ESC = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const pilha = document.createElement('div');
  pilha.className = 'ch-alerta-pilha';
  pilha.setAttribute('aria-live', 'assertive');
  document.body.appendChild(pilha);

  const ativos = new Map();      // chamada_id -> elemento
  const dispensados = new Set(); // chamada_id que o usuário fechou
  let ctxAudio = null;
  let timerToque = null;

  // ---- toque (bipe curto gerado no navegador; sem arquivos) ----
  function bipe() {
    try {
      ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)();
      if (ctxAudio.state === 'suspended') ctxAudio.resume();
      [0, 0.28].forEach((t) => {
        const o = ctxAudio.createOscillator();
        const g = ctxAudio.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctxAudio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.12, ctxAudio.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctxAudio.currentTime + t + 0.22);
        o.connect(g); g.connect(ctxAudio.destination);
        o.start(ctxAudio.currentTime + t); o.stop(ctxAudio.currentTime + t + 0.25);
      });
    } catch (e) { /* navegador bloqueou o áudio: segue só visual */ }
  }
  function atualizarToque() {
    const tocando = Array.from(ativos.values()).some((el) => el.getAttribute('data-aviso') !== '1');
    if (tocando && !timerToque) { bipe(); timerToque = setInterval(bipe, 2200); }
    if (!tocando && timerToque) { clearInterval(timerToque); timerToque = null; }
  }

  function post(acao, id) {
    return fetch('api/chamadas/chamada.php', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Accept: 'application/json' },
      body: JSON.stringify({ acao: acao, chamada_id: id }),
    }).catch(() => null);
  }

  function texto(c) {
    const midia = c.midia === 'voz' ? 'voz' : 'vídeo';
    if (c.titulo) return { t: ESC(c.titulo), s: ESC(c.de_nome) + ' iniciou a reunião da equipe ' + ESC(c.equipe_nome) };
    if (c.tipo === 'equipe') return { t: ESC(c.de_nome) + ' está chamando a equipe ' + ESC(c.equipe_nome), s: 'Chamada de equipe · ' + midia };
    return { t: ESC(c.de_nome) + ' está ligando', s: ESC(c.equipe_nome) + ' · chamada de ' + midia };
  }

  function criar(c) {
    const tx = texto(c);
    const el = document.createElement('div');
    el.className = 'ch-alerta' + (c.aviso ? ' ch-alerta--aviso' : '');
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-label', 'Chamada recebida');
    el.setAttribute('data-aviso', c.aviso ? '1' : '0');
    el.innerHTML =
      '<span class="ch-alerta__avatar" aria-hidden="true">' + ESC(c.de_inicial) + '</span>' +
      '<div class="ch-alerta__info"><strong>' + tx.t + '</strong><span>' + tx.s + '</span>' +
      (c.aviso ? '<em>Convite: você pode entrar quando quiser.</em>' : '') + '</div>' +
      '<div class="ch-alerta__acoes">' +
      '<button type="button" class="ch-alerta__btn ch-alerta__btn--ok" data-a="atender">' + (c.aviso ? 'Entrar' : 'Atender') + '</button>' +
      '<button type="button" class="ch-alerta__btn ch-alerta__btn--no" data-a="recusar">' + (c.aviso ? 'Dispensar' : 'Recusar') + '</button></div>';
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const id = c.chamada_id;
      dispensados.add(id);
      remover(id);
      if (b.getAttribute('data-a') === 'atender') {
        if (api.aoAtender) api.aoAtender(id);
        else window.location.href = 'index.php?pagina=chamadas&atender=' + id;
      } else {
        post('recusar', id);
      }
    });
    return el;
  }

  function remover(id) {
    const el = ativos.get(id);
    if (!el) return;
    el.classList.add('ch-alerta--saindo');
    setTimeout(() => el.remove(), 200);
    ativos.delete(id);
    atualizarToque();
  }

  const api = {
    aoAtender: null,
    atualizar: function (lista) {
      const idsAgora = new Set(lista.map((c) => c.chamada_id));
      Array.from(ativos.keys()).forEach((id) => { if (!idsAgora.has(id)) remover(id); });
      lista.forEach((c) => {
        if (ativos.has(c.chamada_id) || dispensados.has(c.chamada_id)) return;
        const el = criar(c);
        pilha.appendChild(el);
        ativos.set(c.chamada_id, el);
        const b = el.querySelector('[data-a="atender"]');
        if (b && !c.aviso) b.focus({ preventScroll: true });
      });
      atualizarToque();
    },
  };
  window.ChamadasAlerta = api;

  if (noModulo) return; // o chamadas.js cuida do polling

  // ---- polling próprio nas demais páginas (a cada 5 s) ----
  async function ciclo() {
    try {
      const r = await fetch('api/chamadas/eventos.php?estado=' + (document.hidden ? 'ausente' : 'online'), { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (r.status === 401) return; // sessão caiu: para de consultar
      if (r.ok) {
        const d = await r.json();
        if (d && d.sucesso) api.atualizar(d.recebidas || []);
      }
    } catch (e) { /* offline: tenta de novo */ }
    setTimeout(ciclo, 5000);
  }
  ciclo();
})();
