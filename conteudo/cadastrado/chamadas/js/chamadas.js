// ============================================================
// CONTEÚDO — Chamadas (área CADASTRADO) — tela inicial do módulo
//
// Contatos da equipe, cards de ação, modais (Nova chamada, Chamar
// equipe, Agendar), próximas chamadas, polling de presença/chamadas
// recebidas. A sala (WebRTC) fica em chamadas-sala.js e usa o
// objeto global window.Chamadas exposto aqui.
// ============================================================
(function () {
  'use strict';

  const raiz = document.getElementById('chRaiz');
  if (!raiz) return;

  const csrf = raiz.getAttribute('data-csrf') || '';
  const API = 'api/chamadas/';

  const $ = (id) => document.getElementById(id);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  // ------------------------------------------------------------
  // Ícones (traço/outline, estilo Lucide) — o HTML usa data-ic="nome"
  // ------------------------------------------------------------
  const ICONES = {
    video: '<path d="M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14"/><rect x="2" y="6" width="13" height="12" rx="2"/>',
    'video-off': '<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><path d="M1 1l22 22"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
    'mic-off': '<path d="M2 2l20 20"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v3"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    'shield-check': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
    minimize: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
    'wifi-off': '<path d="M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2.4-1.9M12 20h.01"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    bell: '<path d="M6 9.5a6 6 0 0 1 12 0v4.2c0 .5.16.98.47 1.38l.9 1.15c.6.77.05 1.9-.93 1.9H5.56c-.98 0-1.53-1.13-.93-1.9l.9-1.15c.3-.4.47-.88.47-1.38V9.5z"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0"/>',
    'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
    'chevron-right': '<path d="M9 6l6 6-6 6"/>',
    'user-x': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M17 8l5 5M22 8l-5 5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'camera-off': '<path d="M2 2l20 20"/><path d="M9.5 5H14l1.5 2H19a2 2 0 0 1 2 2v7M4 7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h13"/>',
  };

  function ic(nome, classe) {
    return '<svg class="ch-ic ' + (classe || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONES[nome] || '') + '</svg>';
  }

  function preencherIcones(ctx) {
    $$('[data-ic]', ctx).forEach((el) => {
      el.innerHTML = ic(el.getAttribute('data-ic'));
    });
  }

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ------------------------------------------------------------
  // Chamadas à API
  // ------------------------------------------------------------
  async function api(arquivo, opcoes) {
    const o = opcoes || {};
    const metodo = o.method || (o.corpo ? 'POST' : 'GET');
    let url = API + arquivo;
    if (o.query) url += '?' + new URLSearchParams(o.query).toString();
    const cfg = { method: metodo, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (metodo !== 'GET') {
      cfg.headers['Content-Type'] = 'application/json';
      cfg.headers['X-CSRF-Token'] = csrf;
      cfg.body = JSON.stringify(o.corpo || {});
    }
    try {
      const r = await fetch(url, cfg);
      let dados = {};
      try { dados = await r.json(); } catch (e) { /* corpo vazio */ }
      return { ok: r.ok && dados.sucesso !== false, status: r.status, dados: dados };
    } catch (e) {
      return { ok: false, status: 0, dados: { sucesso: false, erro: 'Sem conexão com o servidor.' } };
    }
  }

  // ------------------------------------------------------------
  // Estado
  // ------------------------------------------------------------
  const E = {
    eu: null,
    equipe: null,
    equipes: [],
    contatos: [],
    agendadas: [],
    regraEquipe: 'Apenas Diretores, Gerentes e CEO podem chamar a equipe toda.',
    busca: '',
    filtro: 'todos',
    carregou: false,
  };

  const STATUS_ROTULO = { online: 'Online', ausente: 'Ausente', offline: 'Offline', em_chamada: 'Em chamada', nao_perturbe: 'Não perturbe' };

  // ------------------------------------------------------------
  // Snackbar e modal de aviso
  // ------------------------------------------------------------
  function toast(msg, tipo) {
    const el = document.createElement('div');
    el.className = 'chamadas__snack' + (tipo === 'erro' ? ' chamadas__snack--erro' : '');
    el.setAttribute('role', 'status');
    el.textContent = msg;
    $('chAvisos').appendChild(el);
    setTimeout(() => { el.classList.add('chamadas__snack--saindo'); setTimeout(() => el.remove(), 250); }, 4200);
  }

  let focoAnterior = null;
  function abrirModal(id) {
    const m = $(id);
    if (!m) return;
    focoAnterior = document.activeElement;
    m.hidden = false;
    const alvo = m.querySelector('input:not([type=checkbox]), textarea, button:not([data-fechar]):not([disabled]), button');
    if (alvo) setTimeout(() => alvo.focus(), 30);
  }
  function fecharModal(id) {
    const m = $(id);
    if (!m || m.hidden) return;
    m.hidden = true;
    if (focoAnterior && document.body.contains(focoAnterior)) focoAnterior.focus();
  }

  /** botoes: [{rotulo, tipo:'primario'|'secundario'|'perigo', acao:fn}] */
  function aviso(icone, titulo, texto, botoes) {
    $('mdAvisoIcone').innerHTML = ic(icone);
    $('mdAvisoIcone').className = 'chamadas__aviso-icone' + (icone === 'check' ? ' chamadas__aviso-icone--ok' : '');
    $('mdAvisoTitulo').textContent = titulo;
    $('mdAvisoTexto').textContent = texto;
    const rod = $('mdAvisoBotoes');
    rod.innerHTML = '';
    (botoes && botoes.length ? botoes : [{ rotulo: 'Entendi', tipo: 'primario' }]).forEach((b) => {
      const bt = document.createElement('button');
      bt.type = 'button';
      bt.className = 'chamadas__btn chamadas__btn--' + (b.tipo || 'secundario');
      bt.textContent = b.rotulo;
      bt.addEventListener('click', () => { fecharModal('mdAviso'); if (b.acao) b.acao(); });
      rod.appendChild(bt);
    });
    abrirModal('mdAviso');
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-fechar]')) {
      const m = e.target.closest('.chamadas__modal');
      if (m) fecharModal(m.id);
      return;
    }
    // clique no fundo escuro fecha (menos aviso/pós, que exigem uma escolha)
    if (e.target.classList && e.target.classList.contains('chamadas__modal') && !e.target.classList.contains('chamadas__modal--alto')) {
      fecharModal(e.target.id);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const abertos = $$('.chamadas__modal:not([hidden])').filter((m) => !m.classList.contains('chamadas__modal--alto'));
    if (abertos.length) fecharModal(abertos[abertos.length - 1].id);
  });

  // ------------------------------------------------------------
  // Formatação
  // ------------------------------------------------------------
  function hora(iso) { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function quando(iso) {
    const d = new Date(iso);
    const h0 = new Date(); h0.setHours(0, 0, 0, 0);
    const dia = Math.round((new Date(d).setHours(0, 0, 0, 0) - h0.getTime()) / 86400000);
    let rot;
    if (dia === 0) rot = 'Hoje';
    else if (dia === 1) rot = 'Amanhã';
    else rot = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
    return rot + ', ' + hora(iso);
  }
  function primeiroNome(n) { return String(n || '').split(' ')[0]; }

  // ------------------------------------------------------------
  // Render: cards, equipes, contatos
  // ------------------------------------------------------------
  function renderAcoes() {
    const pode = !!(E.eu && E.eu.pode_chamar_equipe);
    const card = $('cardEquipe');
    const btn = $('btnChamarEquipe');
    card.classList.toggle('chamadas__acao--bloqueada', !pode);
    btn.disabled = !pode;
    btn.setAttribute('aria-disabled', pode ? 'false' : 'true');
    $('icoEquipe').innerHTML = ic(pode ? 'users' : 'lock');
    $('tipEquipe').textContent = E.regraEquipe;
    card.setAttribute('tabindex', pode ? '-1' : '0');
    if (!pode) card.setAttribute('aria-describedby', 'tipEquipe'); else card.removeAttribute('aria-describedby');
    $('btnNovaChamada').disabled = !E.equipe || !E.equipe.slug;
  }

  function renderEquipes() {
    const alvo = $('chEquipes');
    alvo.innerHTML = '';
    E.equipes.forEach((q) => {
      const b = document.createElement('button');
      b.type = 'button';
      const ativa = q.minha;
      b.className = 'chamadas__chip' + (ativa ? ' chamadas__chip--ativo' : '');
      b.setAttribute('aria-pressed', ativa ? 'true' : 'false');
      if (!ativa) {
        b.setAttribute('aria-disabled', 'true');
        b.title = 'Você só pode chamar pessoas da sua equipe.';
        b.innerHTML = esc(q.nome) + ' ' + ic('lock', 'chamadas__chip-lock');
        b.addEventListener('click', () => toast('Você só pode chamar pessoas da sua equipe.'));
      } else {
        b.textContent = q.nome;
      }
      alvo.appendChild(b);
    });
  }

  function badgeStatus(s) {
    return '<span class="chamadas__badge chamadas__badge--' + s + '"><span class="chamadas__badge-ponto"></span>' + STATUS_ROTULO[s] + '</span>';
  }

  function contatosFiltrados() {
    const q = E.busca.trim().toLowerCase();
    return E.contatos.filter((c) => {
      if (E.filtro !== 'todos' && c.status !== E.filtro) return false;
      return !q || c.nome.toLowerCase().includes(q);
    });
  }

  function renderContatos() {
    const lista = $('chLista');
    if (!E.carregou) return;
    const itens = contatosFiltrados();
    let html = '';

    const ninguemOnline = E.contatos.length > 0 && !E.contatos.some((c) => c.status !== 'offline');
    if (ninguemOnline && E.filtro === 'todos' && !E.busca) {
      html += '<div class="chamadas__faixa-info">' + ic('clock') + '<span>Ninguém da sua equipe está online agora. Você pode enviar uma mensagem ou agendar uma reunião.</span></div>';
    }

    if (!itens.length) {
      let t, s;
      if (!E.equipe || !E.equipe.slug) { t = 'Você ainda não faz parte de uma equipe'; s = 'Peça ao administrador para definir sua equipe e liberar as chamadas.'; }
      else if (!E.contatos.length) { t = 'Nenhum colega na sua equipe ainda'; s = 'Quando outros membros entrarem na equipe, eles aparecerão aqui.'; }
      else if (E.busca) { t = 'Nenhum contato encontrado'; s = 'Confira a grafia do nome ou limpe a busca.'; }
      else { t = 'Nenhum contato com esse status'; s = 'Escolha outro status no filtro para ver mais pessoas.'; }
      html += '<div class="chamadas__vazio">' + ic('users', 'chamadas__vazio-ico') + '<strong>' + t + '</strong><span>' + s + '</span></div>';
      lista.innerHTML = html;
      return;
    }

    html += itens.map((c) => {
      const off = c.status === 'offline';
      const indispon = off || c.status === 'nao_perturbe' || c.status === 'em_chamada';
      const dica = off ? 'está offline' : c.status === 'em_chamada' ? 'está em outra chamada' : c.status === 'nao_perturbe' ? 'está em modo Não perturbe' : '';
      return '<div class="chamadas__contato" data-id="' + c.id + '">' +
        '<span class="chamadas__avatar chamadas__avatar--' + c.status + '" aria-hidden="true">' + esc(c.inicial) + '<span class="chamadas__avatar-status"></span></span>' +
        '<div class="chamadas__contato-info"><strong>' + esc(c.nome) + '</strong><span>' + esc(c.setor) + (c.cargo_nome ? ' · ' + esc(c.cargo_nome) : '') + '</span></div>' +
        badgeStatus(c.status) +
        '<div class="chamadas__contato-acoes">' +
          (off ? '<button type="button" class="chamadas__link-btn chamadas__link-btn--msg" data-acao="msg">Enviar mensagem</button>' : '') +
          '<button type="button" class="chamadas__icone-btn" data-acao="msg" aria-label="Enviar mensagem para ' + esc(c.nome) + '" title="Enviar mensagem">' + ic('message') + '</button>' +
          '<button type="button" class="chamadas__icone-btn chamadas__icone-btn--voz" data-acao="voz" aria-label="Chamada de voz com ' + esc(c.nome) + '" title="' + (dica ? esc(c.nome) + ' ' + dica : 'Chamada de voz') + '"' + (off ? ' disabled' : '') + '>' + ic('phone') + '</button>' +
          '<button type="button" class="chamadas__icone-btn chamadas__icone-btn--video" data-acao="video" aria-label="Chamada de vídeo com ' + esc(c.nome) + '" title="' + (dica ? esc(c.nome) + ' ' + dica : 'Chamada de vídeo') + '"' + (off ? ' disabled' : '') + '>' + ic('video') + '</button>' +
        '</div></div>';
    }).join('');
    lista.innerHTML = html;
  }

  function renderProximas() {
    const alvo = $('chProximas');
    const itens = E.agendadas.slice(0, 3);
    if (!itens.length) {
      alvo.innerHTML = '<div class="chamadas__vazio chamadas__vazio--pequeno">' + ic('calendar', 'chamadas__vazio-ico') + '<strong>Sem chamadas agendadas</strong><span>Use “Agendar reunião” para convidar sua equipe.</span></div>';
      return;
    }
    alvo.innerHTML = itens.map((a) => cartaoReuniao(a, false)).join('');
  }

  function cartaoReuniao(a, completo) {
    const part = a.outros > 0 ? 'Você e mais ' + a.outros + (a.outros === 1 ? ' participante' : ' participantes') : 'Só você';
    return '<div class="chamadas__reuniao" data-ag="' + a.id + '">' +
      '<span class="chamadas__reuniao-ico">' + ic('calendar') + '</span>' +
      '<div class="chamadas__reuniao-info"><strong>' + esc(a.titulo) + '</strong><span>' + esc(quando(a.data_hora)) + ' · ' + esc(part) + '</span>' +
      (completo && a.descricao ? '<span class="chamadas__reuniao-desc">' + esc(a.descricao) + '</span>' : '') + '</div>' +
      '<div class="chamadas__reuniao-acoes">' +
        '<button type="button" class="chamadas__btn chamadas__btn--contorno" data-ag-entrar="' + a.id + '"' + (a.pode_entrar ? '' : ' disabled title="A sala abre 15 minutos antes do horário."') + '>Entrar</button>' +
        (completo && a.pode_cancelar ? '<button type="button" class="chamadas__link-btn chamadas__link-btn--perigo" data-ag-cancelar="' + a.id + '">Cancelar</button>' : '') +
      '</div></div>';
  }

  function renderCabecalho() {
    if (!E.eu) return;
    const login = document.querySelector('.header__user-login');
    if (login && !login.querySelector('.header__cargo')) {
      const sp = document.createElement('span');
      sp.className = 'header__cargo';
      sp.textContent = E.eu.cargo_nome;
      const caret = login.querySelector('.header__user-caret');
      login.insertBefore(sp, caret || null);
    }
  }

  function renderTudo() {
    renderAcoes();
    renderEquipes();
    renderContatos();
    renderProximas();
    renderCabecalho();
  }

  // ------------------------------------------------------------
  // Carregamento de dados
  // ------------------------------------------------------------
  async function carregarContatos() {
    const r = await api('contatos.php');
    if (r.status === 401) { mostrarSessaoExpirada(); return; }
    if (!r.ok) {
      if (!E.carregou) {
        $('chLista').innerHTML = '<div class="chamadas__vazio">' + ic('wifi-off', 'chamadas__vazio-ico') + '<strong>Não foi possível carregar os contatos</strong><span>' + esc(r.dados.erro || 'Tente novamente em instantes.') + '</span><button type="button" class="chamadas__btn chamadas__btn--secundario" id="btnRecarregarContatos">Tentar novamente</button></div>';
      }
      return;
    }
    const d = r.dados;
    E.eu = d.eu; E.equipe = d.equipe; E.equipes = d.equipes; E.contatos = d.contatos; E.regraEquipe = d.regra_equipe || E.regraEquipe;
    E.carregou = true;
    renderTudo();
  }

  async function carregarAgendadas() {
    const r = await api('agendadas.php');
    if (r.ok) { E.agendadas = r.dados.agendadas || []; renderProximas(); }
  }

  function mostrarSessaoExpirada() {
    aviso('alert', 'Sua sessão expirou', 'Entre novamente na plataforma para continuar usando as chamadas.', [
      { rotulo: 'Ir para o início', tipo: 'primario', acao: () => { window.location.href = 'index.php'; } },
    ]);
  }

  // ------------------------------------------------------------
  // Iniciar chamadas
  // ------------------------------------------------------------
  let iniciando = false;

  function tratarErroChamada(r) {
    const d = r.dados || {};
    if (r.status === 0) { aviso('wifi-off', 'Falha de conexão', 'Não conseguimos falar com a plataforma. Verifique sua internet e tente de novo.'); return; }
    if (r.status === 409 && (d.motivo === 'offline' || d.motivo === 'nao_perturbe' || d.motivo === 'em_chamada')) {
      aviso('user-x', 'Usuário indisponível', d.erro || 'Essa pessoa não pode atender agora.', [
        { rotulo: 'Enviar mensagem', tipo: 'secundario', acao: () => toast('O chat entre colegas ainda não está disponível nesta versão.') },
        { rotulo: 'Entendi', tipo: 'primario' },
      ]);
      carregarContatos();
      return;
    }
    if (r.status === 409 && d.motivo === 'voce_em_chamada') { aviso('alert', 'Você já está em uma chamada', 'Encerre a chamada atual antes de iniciar outra.'); return; }
    if (r.status === 403) { aviso('lock', 'Ação não permitida', d.erro || 'Você não tem permissão para isso.'); return; }
    if (r.status === 410) { aviso('clock', 'Chamada encerrada', d.erro || 'Essa chamada já terminou.'); return; }
    if (r.status === 401) { mostrarSessaoExpirada(); return; }
    aviso('alert', 'Não foi possível concluir', d.erro || 'Tente novamente em instantes.');
  }

  async function iniciarIndividual(id, midia) {
    if (iniciando) return;
    iniciando = true;
    const r = await api('chamada.php', { corpo: { acao: 'iniciar', tipo: 'individual', alvo_id: id, midia: midia } });
    iniciando = false;
    if (!r.ok) { tratarErroChamada(r); return; }
    ['mdNova'].forEach(fecharModal);
    window.Chamadas.sala.entrar(r.dados.chamada, { midia: midia, mudo: false });
  }

  async function iniciarEquipe(midia, mudo) {
    if (iniciando) return;
    iniciando = true;
    const r = await api('chamada.php', { corpo: { acao: 'iniciar', tipo: 'equipe', midia: midia } });
    iniciando = false;
    if (!r.ok) { tratarErroChamada(r); return; }
    fecharModal('mdEquipe');
    window.Chamadas.sala.entrar(r.dados.chamada, { midia: midia, mudo: !!mudo });
  }

  async function atenderChamada(chamadaId) {
    const r = await api('chamada.php', { corpo: { acao: 'atender', chamada_id: chamadaId } });
    if (!r.ok) { tratarErroChamada(r); return; }
    const c = r.dados.chamada;
    window.Chamadas.sala.entrar(c, { midia: c.midia, mudo: false });
  }

  // ------------------------------------------------------------
  // Modal: Nova chamada
  // ------------------------------------------------------------
  const nova = { sel: 0, midia: 'video' };

  function renderModalNova() {
    const q = $('mdNovaBusca').value.trim().toLowerCase();
    const lista = E.contatos.filter((c) => !q || c.nome.toLowerCase().includes(q));
    const alvo = $('mdNovaLista');
    if (!lista.length) {
      alvo.innerHTML = '<div class="chamadas__vazio chamadas__vazio--pequeno"><strong>' + (E.contatos.length ? 'Nenhum membro encontrado' : 'Sem colegas na equipe') + '</strong></div>';
      return;
    }
    alvo.innerHTML = lista.map((c) => {
      const off = c.status === 'offline';
      return '<button type="button" class="chamadas__opcao' + (nova.sel === c.id ? ' chamadas__opcao--sel' : '') + '" role="radio" aria-checked="' + (nova.sel === c.id) + '" data-id="' + c.id + '"' + (off ? ' disabled' : '') + '>' +
        '<span class="chamadas__avatar chamadas__avatar--' + c.status + '" aria-hidden="true">' + esc(c.inicial) + '<span class="chamadas__avatar-status"></span></span>' +
        '<span class="chamadas__opcao-info"><strong>' + esc(c.nome) + '</strong><span>' + esc(c.setor) + '</span></span>' + badgeStatus(c.status) + '</button>';
    }).join('');
    $('mdNovaIniciar').disabled = !nova.sel;
  }

  function abrirNova(preSel, midia) {
    if (!E.equipe || !E.equipe.slug) { aviso('lock', 'Sem equipe definida', 'Você ainda não pertence a uma equipe, por isso não há contatos para chamar.'); return; }
    nova.sel = preSel || 0;
    nova.midia = midia || 'video';
    $('mdNovaBusca').value = '';
    $('mdNovaEquipe').textContent = E.equipe.nome;
    $$('#mdNova [data-midia]').forEach((b) => {
      const ativo = b.getAttribute('data-midia') === nova.midia;
      b.classList.toggle('chamadas__segmento-op--ativo', ativo);
      b.setAttribute('aria-checked', ativo ? 'true' : 'false');
    });
    renderModalNova();
    $('mdNovaIniciar').disabled = !nova.sel;
    abrirModal('mdNova');
  }

  // ------------------------------------------------------------
  // Modal: Chamar equipe
  // ------------------------------------------------------------
  function abrirEquipe() {
    if (!E.eu || !E.eu.pode_chamar_equipe) { toast(E.regraEquipe); return; }
    const t = E.equipe;
    $('mdEquipeTitulo').textContent = t.nome + ' — ' + t.total + (t.total === 1 ? ' membro' : ' membros') + ', ' + t.online + ' online';
    const membros = [{ inicial: E.eu.inicial, nome: 'Você' }].concat(E.contatos);
    const vis = membros.slice(0, 8);
    $('mdEquipeAvatares').innerHTML = vis.map((c) => '<span class="chamadas__avatar chamadas__avatar--pequeno" title="' + esc(c.nome) + '">' + esc(c.inicial) + '</span>').join('') +
      (membros.length > vis.length ? '<span class="chamadas__avatar chamadas__avatar--pequeno chamadas__avatar--mais">+' + (membros.length - vis.length) + '</span>' : '');
    $('mdEquipeMic').checked = true;
    $('mdEquipeCam').checked = true;
    abrirModal('mdEquipe');
  }

  // ------------------------------------------------------------
  // Modal: Agendar chamada
  // ------------------------------------------------------------
  function abrirAgendar() {
    if (!E.equipe || !E.equipe.slug) { aviso('lock', 'Sem equipe definida', 'Você ainda não pertence a uma equipe, por isso não há participantes para convidar.'); return; }
    const pode = !!E.eu.pode_chamar_equipe;
    $('agTitulo').value = ''; $('agDescricao').value = ''; $('agDuracao').value = '30';
    const amanha = new Date(Date.now() + 3600 * 1000);
    $('agData').value = amanha.getFullYear() + '-' + String(amanha.getMonth() + 1).padStart(2, '0') + '-' + String(amanha.getDate()).padStart(2, '0');
    $('agData').min = $('agData').value;
    $('agHora').value = String(amanha.getHours()).padStart(2, '0') + ':00';
    $('agToda').checked = false;
    $('agToda').disabled = !pode;
    $('agTodaWrap').classList.toggle('chamadas__toggle--desabilitado', !pode);
    $('agTodaWrap').title = pode ? '' : E.regraEquipe;
    $('agTodaCadeado').hidden = pode;
    $('agTodaCadeado').innerHTML = ic('lock');
    $('agErro').hidden = true;
    $('agLista').classList.remove('chamadas__modal-lista--off');
    $('agLista').innerHTML = E.contatos.length ? E.contatos.map((c) =>
      '<label class="chamadas__opcao chamadas__opcao--check"><input type="checkbox" value="' + c.id + '">' +
      '<span class="chamadas__avatar chamadas__avatar--pequeno" aria-hidden="true">' + esc(c.inicial) + '</span>' +
      '<span class="chamadas__opcao-info"><strong>' + esc(c.nome) + '</strong><span>' + esc(c.setor) + '</span></span></label>').join('')
      : '<div class="chamadas__vazio chamadas__vazio--pequeno"><strong>Sem colegas na equipe</strong></div>';
    abrirModal('mdAgendar');
  }

  async function salvarAgendamento() {
    const erro = (m) => { $('agErro').textContent = m; $('agErro').hidden = false; };
    const toda = $('agToda').checked;
    const ids = $$('#agLista input:checked').map((i) => parseInt(i.value, 10));
    const titulo = $('agTitulo').value.trim();
    if (!titulo) { erro('Informe um título para a reunião.'); $('agTitulo').focus(); return; }
    if (!$('agData').value || !$('agHora').value) { erro('Escolha a data e o horário.'); return; }
    if (new Date($('agData').value + 'T' + $('agHora').value) < new Date()) { erro('Escolha um horário no futuro.'); return; }
    if (!toda && !ids.length) { erro('Selecione ao menos um participante ou marque “Toda a equipe”.'); return; }
    $('agSalvar').disabled = true;
    const r = await api('agendadas.php', { corpo: { acao: 'criar', titulo: titulo, descricao: $('agDescricao').value.trim(), data: $('agData').value, hora: $('agHora').value, duracao_min: parseInt($('agDuracao').value, 10), toda_equipe: toda, participantes: ids } });
    $('agSalvar').disabled = false;
    if (!r.ok) { erro(r.dados.erro || 'Não foi possível agendar.'); return; }
    fecharModal('mdAgendar');
    toast('Reunião agendada.');
    carregarAgendadas();
  }

  async function abrirTodas() {
    $('mdTodasLista').innerHTML = '<div class="chamadas__vazio chamadas__vazio--carregando"><span class="chamadas__spinner"></span> Carregando…</div>';
    abrirModal('mdTodas');
    const r = await api('agendadas.php', { query: { todas: 1 } });
    if (!r.ok) { $('mdTodasLista').innerHTML = '<div class="chamadas__vazio"><strong>Não foi possível carregar</strong><span>' + esc(r.dados.erro || 'Tente novamente.') + '</span></div>'; return; }
    const l = r.dados.agendadas || [];
    $('mdTodasLista').innerHTML = l.length ? l.map((a) => cartaoReuniao(a, true)).join('') :
      '<div class="chamadas__vazio">' + ic('calendar', 'chamadas__vazio-ico') + '<strong>Sem chamadas agendadas</strong><span>As reuniões que você criar ou for convidado aparecem aqui.</span></div>';
  }

  async function entrarAgendada(id) {
    const r = await api('chamada.php', { corpo: { acao: 'entrar_agendada', agendamento_id: id } });
    if (!r.ok) { tratarErroChamada(r); return; }
    fecharModal('mdTodas');
    window.Chamadas.sala.entrar(r.dados.chamada, { midia: 'video', mudo: false });
  }

  // ------------------------------------------------------------
  // Eventos da interface
  // ------------------------------------------------------------
  $('btnNovaChamada').addEventListener('click', () => abrirNova());
  $('btnChamarEquipe').addEventListener('click', abrirEquipe);
  $('btnAgendar').addEventListener('click', abrirAgendar);
  $('btnVerTodas').addEventListener('click', abrirTodas);
  $('mdNovaIniciar').addEventListener('click', () => { if (nova.sel) iniciarIndividual(nova.sel, nova.midia); });
  $('mdEquipeIniciar').addEventListener('click', () => iniciarEquipe($('mdEquipeCam').checked ? 'video' : 'voz', !$('mdEquipeMic').checked));
  $('agSalvar').addEventListener('click', salvarAgendamento);
  $('agToda').addEventListener('change', () => {
    $('agLista').classList.toggle('chamadas__modal-lista--off', $('agToda').checked);
    $$('#agLista input').forEach((i) => { i.disabled = $('agToda').checked; });
  });
  $('mdNovaBusca').addEventListener('input', renderModalNova);
  $('chBusca').addEventListener('input', (e) => { E.busca = e.target.value; renderContatos(); });
  $('chFiltroStatus').addEventListener('change', (e) => { E.filtro = e.target.value; renderContatos(); });
  $('chErroTentar').addEventListener('click', () => { falhas = 0; tickAgora(); });
  $('posVoltar').addEventListener('click', () => { fecharModal('chPos'); carregarContatos(); carregarAgendadas(); });

  $('mdNovaLista').addEventListener('click', (e) => {
    const b = e.target.closest('.chamadas__opcao');
    if (!b || b.disabled) return;
    nova.sel = parseInt(b.getAttribute('data-id'), 10);
    renderModalNova();
  });
  $$('#mdNova [data-midia]').forEach((b) => b.addEventListener('click', () => {
    nova.midia = b.getAttribute('data-midia');
    $$('#mdNova [data-midia]').forEach((o) => {
      const ativo = o === b;
      o.classList.toggle('chamadas__segmento-op--ativo', ativo);
      o.setAttribute('aria-checked', ativo ? 'true' : 'false');
    });
  }));

  $('chLista').addEventListener('click', (e) => {
    if (e.target.closest('#btnRecarregarContatos')) { carregarContatos(); return; }
    const b = e.target.closest('[data-acao]');
    const linha = e.target.closest('.chamadas__contato');
    if (!b || !linha || b.disabled) return;
    const id = parseInt(linha.getAttribute('data-id'), 10);
    const acao = b.getAttribute('data-acao');
    if (acao === 'msg') { toast('O chat entre colegas ainda não está disponível nesta versão.'); return; }
    iniciarIndividual(id, acao);
  });

  document.addEventListener('click', (e) => {
    const en = e.target.closest('[data-ag-entrar]');
    if (en && !en.disabled) { entrarAgendada(parseInt(en.getAttribute('data-ag-entrar'), 10)); return; }
    const ca = e.target.closest('[data-ag-cancelar]');
    if (ca) {
      api('agendadas.php', { corpo: { acao: 'cancelar', id: parseInt(ca.getAttribute('data-ag-cancelar'), 10) } }).then((r) => {
        if (r.ok) { toast('Reunião cancelada.'); abrirTodas(); carregarAgendadas(); } else toast(r.dados.erro || 'Não foi possível cancelar.', 'erro');
      });
    }
  });

  $('btnVerMembros').addEventListener('click', () => {
    const todos = E.eu ? [{ inicial: E.eu.inicial, nome: E.eu.nome + ' (você)', setor: E.eu.equipe_nome, cargo_nome: E.eu.cargo_nome, status: 'online' }].concat(E.contatos) : E.contatos;
    $('mdMembrosLista').innerHTML = todos.map((c) =>
      '<div class="chamadas__opcao chamadas__opcao--estatica"><span class="chamadas__avatar chamadas__avatar--' + c.status + '" aria-hidden="true">' + esc(c.inicial) + '<span class="chamadas__avatar-status"></span></span>' +
      '<span class="chamadas__opcao-info"><strong>' + esc(c.nome) + '</strong><span>' + esc(c.cargo_nome || c.setor) + '</span></span>' + badgeStatus(c.status) + '</div>').join('');
    abrirModal('mdMembros');
  });

  // Tooltip do card "Chamar equipe" sem permissão (hover + foco no teclado)
  const cardEquipe = $('cardEquipe');
  const tip = $('tipEquipe');
  const mostrarTip = () => { if (cardEquipe.classList.contains('chamadas__acao--bloqueada')) tip.hidden = false; };
  const esconderTip = () => { tip.hidden = true; };
  cardEquipe.addEventListener('mouseenter', mostrarTip);
  cardEquipe.addEventListener('mouseleave', esconderTip);
  cardEquipe.addEventListener('focusin', mostrarTip);
  cardEquipe.addEventListener('focusout', esconderTip);
  cardEquipe.addEventListener('click', () => { if (cardEquipe.classList.contains('chamadas__acao--bloqueada')) toast(E.regraEquipe); });

  // Atalhos da sidebar
  const atalhoAgendar = $('atalhoAgendarReuniaoSidebar');
  if (atalhoAgendar) atalhoAgendar.addEventListener('click', (e) => { e.preventDefault(); abrirAgendar(); });
  const atalhoNovaConv = $('atalhoNovaConversaSidebar');
  if (atalhoNovaConv) atalhoNovaConv.addEventListener('click', (e) => { e.preventDefault(); toast('O chat entre colegas ainda não está disponível nesta versão.'); });
  const atalhoNovaCham = $('atalhoNovaChamadaSidebar');
  if (atalhoNovaCham) atalhoNovaCham.addEventListener('click', (e) => { e.preventDefault(); abrirNova(); });
  const btnRecolher = $('btnRecolher');
  if (btnRecolher) btnRecolher.addEventListener('click', () => document.body.classList.remove('sidebar-open'));

  // ------------------------------------------------------------
  // Polling: presença (heartbeat) + chamadas recebidas + sala
  // ------------------------------------------------------------
  let falhas = 0;
  let ocupado = false;
  let timerTick = null;

  async function tick() {
    if (ocupado) return;
    ocupado = true;
    clearTimeout(timerTick);
    const sala = window.Chamadas.sala;
    const emSala = !!(sala && sala.ativa());
    const q = { estado: document.hidden ? 'ausente' : 'online' };
    if (emSala) Object.assign(q, sala.cursor());
    const r = await api('eventos.php', { query: q });

    if (r.status === 401) { ocupado = false; mostrarSessaoExpirada(); return; }
    if (!r.ok) {
      falhas++;
      if (falhas >= 3) { $('chErroConexao').hidden = false; if (sala) sala.conexaoServidor(false); }
    } else {
      if (falhas >= 3 && sala) sala.conexaoServidor(true);
      falhas = 0;
      $('chErroConexao').hidden = true;
      if (window.ChamadasAlerta) {
        window.ChamadasAlerta.aoAtender = atenderChamada;
        window.ChamadasAlerta.atualizar(r.dados.recebidas || []);
      }
      if (emSala) { try { await sala.processar(r.dados); } catch (e) { console.error(e); } }
    }
    ocupado = false;
    timerTick = setTimeout(tick, window.Chamadas.sala && window.Chamadas.sala.ativa() ? 1500 : 4000);
  }

  function tickAgora() { clearTimeout(timerTick); tick(); }

  window.Chamadas = {
    csrf: csrf,
    api: api,
    ic: ic,
    esc: esc,
    toast: toast,
    aviso: aviso,
    abrirModal: abrirModal,
    fecharModal: fecharModal,
    preencherIcones: preencherIcones,
    tickAgora: tickAgora,
    dados: E,
    recarregar: function () { carregarContatos(); carregarAgendadas(); },
    primeiroNome: primeiroNome,
    sala: null,
  };

  // ------------------------------------------------------------
  // Início
  // ------------------------------------------------------------
  preencherIcones(document);
  carregarContatos().then(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('nova') === '1') abrirNova();
    const atender = parseInt(p.get('atender') || '0', 10);
    if (atender > 0) setTimeout(() => atenderChamada(atender), 300);
    if (p.has('nova') || p.has('atender')) {
      history.replaceState(null, '', 'index.php?pagina=chamadas');
    }
  });
  carregarAgendadas();
  setInterval(carregarContatos, 15000);
  setInterval(carregarAgendadas, 60000);
  document.addEventListener('visibilitychange', tickAgora);
  tick();
})();
