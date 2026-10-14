// ============================================================
// CONTEÚDO — Início (área CADASTRADO)
// Carrossel do banner + recolher menu lateral + cards da tela:
//   - Canais em destaque : último PDF / documento / planilha / reunião
//   - Atividades recentes: documentos, mensagens, cursos concluídos...
//   - Agenda do dia      : só aparece se houver reunião hoje
//   - Avisos importantes : data relativa ("2 dias atrás")
// Tudo vem das APIs que já existem (api/documentos, api/chamadas,
// api/chat); este arquivo só LÊ, nunca grava nada no servidor.
// Equipes favoritas e Avisos vêm do PHP em html/inicio.html.
//
// Se NENHUMA das APIs responder (ex.: banco fora do ar), os cards
// mostram dados de exemplo com o selo "Exemplo", para a tela não
// ficar vazia.
// ============================================================
(function () {
  'use strict';

  // ============================================================
  // BANNER, MENU LATERAL E BOTÕES DO TOPO (comportamento original)
  // ============================================================
  const dots = document.querySelectorAll('.inicio__banner-dot');
  const btnPrev = document.querySelector('.inicio__banner-arrow--left');
  const btnNext = document.querySelector('.inicio__banner-arrow--right');
  let current = 0;

  const slides = document.querySelectorAll('.inicio__banner-slide');

  function goTo(index) {
    if (!dots.length) return;
    current = (index + dots.length) % dots.length;
    dots.forEach((dot, i) => dot.classList.toggle('inicio__banner-dot--active', i === current));
    slides.forEach((sl, i) => sl.classList.toggle('inicio__banner-slide--ativo', i === current));
  }

  // Troca automática do banner a cada 3 segundos. Quando a pessoa usa as
  // setas ou as bolinhas, o relógio recomeça (para não pular logo em seguida).
  const INTERVALO_BANNER_MS = 3000;
  let timerBanner = null;

  function reiniciarAutoBanner() {
    clearInterval(timerBanner);
    if (dots.length < 2) return;
    timerBanner = setInterval(() => goTo(current + 1), INTERVALO_BANNER_MS);
  }

  if (btnPrev) btnPrev.addEventListener('click', () => { goTo(current - 1); reiniciarAutoBanner(); });
  if (btnNext) btnNext.addEventListener('click', () => { goTo(current + 1); reiniciarAutoBanner(); });
  dots.forEach((dot, i) => dot.addEventListener('click', () => { goTo(i); reiniciarAutoBanner(); }));
  reiniciarAutoBanner();

  // Fecha o menu lateral pelo botão "Recolher"
  const btnRecolher = document.getElementById('btnRecolher');

  function fecharMenu() {
    document.body.classList.remove('sidebar-open');
  }

  if (btnRecolher) btnRecolher.addEventListener('click', fecharMenu);

  // Botões do topo do Início
  const btnNovaConversa = document.getElementById('btnNovaConversa');
  if (btnNovaConversa) {
    btnNovaConversa.addEventListener('click', () => {
      window.location.href = 'index.php?pagina=chat';
    });
  }

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
  // CARDS
  // ============================================================
  const raiz = document.getElementById('inicioRaiz');
  if (!raiz) return;
  const uid = raiz.getAttribute('data-usuario-id') || '0';

  const PAGINAS = {
    documentos: 'index.php?pagina=documentos',
    chamadas: 'index.php?pagina=chamadas',
    chat: 'index.php?pagina=chat',
    cursos: 'index.php?pagina=cursos',
  };

  const EQUIPES = {
    geral: 'Geral', projetos: 'Projetos', marketing: 'Marketing', rh: 'RH',
    financeiro: 'Financeiro', ti: 'TI', sac: 'SAC / Ouvidoria',
  };

  // Títulos dos cursos (mesmo catálogo de js/cursos.js, indexado pelo slug)
  const CURSOS_TITULOS = {
    'fundamentos-de-redes-e-infraestrutura': 'Fundamentos de Redes e Infraestrutura',
    'seguranca-da-informacao': 'Segurança da Informação',
    'cloud-computing': 'Cloud Computing',
    'suporte-tecnico-e-help-desk': 'Suporte Técnico e Help Desk',
    'gestao-de-pessoas': 'Gestão de Pessoas',
    'onboarding-e-integracao': 'Onboarding e Integração',
    'clima-organizacional': 'Clima Organizacional',
    'legislacao-trabalhista-basica': 'Legislação Trabalhista Básica',
    'comunicacao-e-marca': 'Comunicação e Marca',
    'marketing-de-conteudo': 'Marketing de Conteúdo',
    'redes-sociais-e-comunidade': 'Redes Sociais e Comunidade',
    'analise-de-dados-de-marketing': 'Análise de Dados de Marketing',
    'nocoes-de-financas-corporativas': 'Noções de Finanças Corporativas',
    'contas-a-pagar-e-a-receber': 'Contas a Pagar e a Receber',
    'planejamento-orcamentario': 'Planejamento Orçamentário',
    'impostos-e-conformidade-fiscal': 'Impostos e Conformidade Fiscal',
    'gestao-de-projetos': 'Gestão de Projetos',
    'metodologias-ageis': 'Metodologias Ágeis',
    'gestao-de-riscos': 'Gestão de Riscos',
    'comunicacao-com-stakeholders': 'Comunicação com Stakeholders',
    'atendimento-de-excelencia': 'Atendimento de Excelência',
    'gestao-de-reclamacoes-e-ouvidoria': 'Gestão de Reclamações e Ouvidoria',
    'pos-venda-e-fidelizacao': 'Pós-venda e Fidelização',
    'lgpd-no-atendimento': 'LGPD no Atendimento'
  };

  // ---------- Ícones (miolo do <svg> 24x24, traço) ----------
  const ICONES = {
    video:   { cls: 'video',   d: '<path d="M15 10.5l5-3v9l-5-3" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><rect x="3" y="6" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/>' },
    doc:     { cls: 'doc',     d: '<path d="M7 3.5h7l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1v-16a1 1 0 011-1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12.5h6M9 16h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
    sheet:   { cls: 'sheet',   d: '<rect x="4" y="3.5" width="16" height="17" rx="1.5" stroke="currentColor" stroke-width="1.6"/><path d="M4 9.5h16M9.5 9.5V20.5" stroke="currentColor" stroke-width="1.6"/>' },
    pdf:     { cls: 'pdf',     d: '<path d="M7 3.5h7l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1v-16a1 1 0 011-1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 13.5h.01M12 13.5h.01M15 13.5h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
    comment: { cls: 'comment', d: '<path d="M4 12a8 8 0 1114.6 4.6L20 20l-3.6-1.4A8 8 0 014 12z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' },
    share:   { cls: 'share',   d: '<circle cx="6" cy="12" r="2.4" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="6" r="2.4" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="18" r="2.4" stroke="currentColor" stroke-width="1.6"/><path d="M8.2 10.8L15.8 7.2M8.2 13.2l7.6 3.6" stroke="currentColor" stroke-width="1.6"/>' },
    star:    { cls: 'star',    d: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' },
    course:  { cls: 'course',  d: '<path d="M2.5 8.5L12 4l9.5 4.5L12 13 2.5 8.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6 10.7v4.3c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.3" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' },
    home:    { cls: 'home',    d: '<path d="M4 11.5L12 4l8 7.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v9a1 1 0 001 1h3v-5a1 1 0 011-1h2a1 1 0 011 1v5h3a1 1 0 001-1v-9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' },
    survey:  { cls: 'survey',  d: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' },
    channel: { cls: 'channel', d: '<path d="M4 4l7 7-7 7 3-7-3-7z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 4l7 7-7 7" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' },
  };
  const SVG_AVATAR = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M4 20C4 16.6863 7.13401 14 11 14H13C16.866 14 20 16.6863 20 20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  // ---------- Utilidades ----------
  const MIN = 60000;
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const dmy = (d) => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  const diaInicio = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // Diferença em dias de calendário (>0 = passado, <0 = futuro)
  const diasAtras = (d) => Math.round((diaInicio(new Date()) - diaInicio(d)) / 86400000);

  function el(tag, cls, texto) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function iconeTipo(nome) {
    const ic = ICONES[nome] || ICONES.doc;
    const s = el('span', 'inicio__type-icon inicio__type-icon--' + ic.cls);
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' + ic.d + '</svg>';
    return s;
  }

  // "5 min atrás", "1 h atrás", "Ontem", "3 dias atrás", "02/09/2026"
  function tempoRelativo(data) {
    const d = data instanceof Date ? data : new Date(data);
    if (isNaN(d.getTime())) return '';
    const dias = diasAtras(d);
    if (dias <= 0) {
      const dif = Date.now() - d.getTime();
      if (dif < MIN) return 'agora';
      if (dif < 60 * MIN) return Math.floor(dif / MIN) + ' min atrás';
      return Math.floor(dif / (60 * MIN)) + ' h atrás';
    }
    if (dias === 1) return 'Ontem';
    if (dias < 7) return dias + ' dias atrás';
    return dmy(d);
  }

  // Canais em destaque: "10:30" (hoje), "Ontem", "2 dias atrás", "Amanhã"
  function horaOuDia(data) {
    const d = data instanceof Date ? data : new Date(data);
    if (isNaN(d.getTime())) return '';
    const dias = diasAtras(d);
    if (dias === 0) return hhmm(d);
    if (dias === -1) return 'Amanhã ' + hhmm(d);
    if (dias < 0) return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + hhmm(d);
    return tempoRelativo(d);
  }

  const nomeEquipe = (slug) => EQUIPES[slug] || slug || '';
  const encurtar = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

  async function buscar(url) {
    try {
      const r = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      let dados = {};
      try { dados = await r.json(); } catch (e) { /* corpo vazio */ }
      return { ok: r.ok && dados.sucesso !== false, dados: dados };
    } catch (e) {
      return { ok: false, dados: {} };
    }
  }

  // ---------- Avisos: ícone + data relativa (dados vêm do PHP) ----------
  document.querySelectorAll('[data-aviso-icone]').forEach((s) => {
    const ic = ICONES[s.getAttribute('data-aviso-icone')] || ICONES.home;
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' + ic.d + '</svg>';
  });
  document.querySelectorAll('[data-tempo-iso]').forEach((s) => {
    s.textContent = tempoRelativo(s.getAttribute('data-tempo-iso'));
  });

  // ============================================================
  // CLASSIFICAÇÃO DOS DOCUMENTOS (PDF / Documento / Planilha / ...)
  // ============================================================
  const CATEGORIAS = {
    pdf: 'pdf',
    doc: 'documento', docx: 'documento', txt: 'documento', md: 'documento',
    xls: 'planilha', xlsx: 'planilha', csv: 'planilha',
    ppt: 'apresentacao', pptx: 'apresentacao',
  };
  const ROTULO = { pdf: 'PDF', documento: 'Documento', planilha: 'Planilha', apresentacao: 'Apresentação', reuniao: 'Reunião' };
  const ICONE_CAT = { pdf: 'pdf', documento: 'doc', planilha: 'sheet', apresentacao: 'doc', reuniao: 'video' };

  // ============================================================
  // LINHAS (todas são links para a página de origem)
  // ============================================================
  function linhaCanal(it) {
    const a = el('a', 'inicio__channel-row');
    a.href = it.href;
    a.appendChild(iconeTipo(ICONE_CAT[it.cat]));
    const main = el('span', 'inicio__row-main');
    main.appendChild(el('span', 'inicio__row-title', it.titulo));
    main.appendChild(el('span', 'inicio__row-meta', ROTULO[it.cat] + ' • ' + it.equipe));
    a.appendChild(main);
    a.appendChild(el('span', 'inicio__row-time', it.tempo));
    const li = el('li');
    li.appendChild(a);
    return li;
  }

  function linhaAtividade(it) {
    const a = el('a', 'inicio__activity-row');
    a.href = it.href;
    a.appendChild(iconeTipo(it.icone));
    const av = el('span', 'inicio__row-avatar');
    av.setAttribute('aria-hidden', 'true');
    av.innerHTML = SVG_AVATAR;
    a.appendChild(av);
    const main = el('span', 'inicio__row-main');
    const t = el('span', 'inicio__row-title');
    t.appendChild(document.createTextNode(it.texto));
    t.appendChild(document.createElement('br'));
    t.appendChild(el('strong', null, it.alvo));
    main.appendChild(t);
    a.appendChild(main);
    a.appendChild(el('span', 'inicio__row-time', tempoRelativo(it.quando)));
    const ponto = el('span', 'inicio__status-dot' + (it.ponto ? '' : ' inicio__status-dot--vazio'));
    ponto.setAttribute('aria-hidden', 'true');
    a.appendChild(ponto);
    const li = el('li');
    li.appendChild(a);
    return li;
  }

  function preencher(ul, linhas, textoVazio) {
    ul.textContent = '';
    if (!linhas.length) {
      ul.appendChild(el('li', 'inicio__vazio', textoVazio));
      return;
    }
    linhas.forEach((l) => ul.appendChild(l));
  }

  function marcarExemplo(idCard) {
    const h = document.querySelector('#' + idCard + ' .inicio__card-title');
    if (h && !h.querySelector('.inicio__demo-tag')) {
      const tag = el('span', 'inicio__demo-tag', 'Exemplo');
      tag.title = 'Não foi possível carregar os dados reais. Estes são dados de exemplo.';
      h.appendChild(tag);
    }
  }

  // ============================================================
  // CANAIS EM DESTAQUE
  // Um de cada: reunião, documento, planilha e PDF (o mais recente
  // de cada tipo). Se faltar algum tipo, completa com os próximos
  // documentos mais recentes até 4 linhas.
  // ============================================================
  function montarCanais(docs, reunioes) {
    const itens = [];
    const usados = new Set();

    // Reunião do card: a próxima que ainda não terminou; se não houver, a mais recente que já passou.
    const fimDe = (r) => new Date(r.data_hora).getTime() + (r.duracao_min || 0) * MIN;
    const validas = reunioes.filter((r) => !isNaN(new Date(r.data_hora).getTime()));
    const proximas = validas.filter((r) => fimDe(r) >= Date.now())
      .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
    const passadas = validas.filter((r) => fimDe(r) < Date.now())
      .sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));
    const reuniao = proximas[0] || passadas[0] || null;
    if (reuniao) {
      itens.push({
        cat: 'reuniao', titulo: reuniao.titulo, equipe: reuniao.equipe_nome || 'Geral',
        quando: new Date(reuniao.data_hora), tempo: horaOuDia(reuniao.data_hora), href: PAGINAS.chamadas,
      });
    }

    const lista = docs
      .filter((d) => CATEGORIAS[String(d.extensao || '').toLowerCase()])
      .map((d) => ({
        id: d.id, cat: CATEGORIAS[String(d.extensao).toLowerCase()], titulo: d.nome,
        equipe: nomeEquipe(d.equipe), quando: new Date(d.atualizado_em),
        tempo: horaOuDia(d.atualizado_em), href: PAGINAS.documentos,
      }))
      .sort((a, b) => b.quando - a.quando);

    ['documento', 'planilha', 'pdf'].forEach((cat) => {
      const achado = lista.find((d) => d.cat === cat);
      if (achado) { itens.push(achado); usados.add(achado.id); }
    });
    lista.forEach((d) => {
      if (itens.length < 4 && !usados.has(d.id)) { itens.push(d); usados.add(d.id); }
    });

    // Reunião (se houver) fica em cima; o resto, do mais recente para o mais antigo.
    const topo = itens.filter((i) => i.cat === 'reuniao');
    const resto = itens.filter((i) => i.cat !== 'reuniao').sort((a, b) => b.quando - a.quando);
    return topo.concat(resto).slice(0, 4);
  }

  // ============================================================
  // ATIVIDADES RECENTES
  // ============================================================
  function atividadesDeDocumentos(lista) {
    const verbos = { criou: 'enviou um documento', atualizou: 'atualizou um documento', favoritou: 'favoritou um documento' };
    const icones = { criou: 'share', atualizou: 'doc', favoritou: 'star' };
    return lista.map((a) => ({
      quando: new Date(a.quando),
      icone: icones[a.acao] || 'doc',
      texto: (a.eu ? 'Você' : a.autor) + ' ' + (verbos[a.acao] || 'mexeu em um documento') + ' em ' + nomeEquipe(a.equipe),
      alvo: a.documento,
      href: PAGINAS.documentos,
      ponto: Date.now() - new Date(a.quando).getTime() < 24 * 60 * MIN,
    }));
  }

  function atividadesDeChat(conversas) {
    return conversas
      .filter((c) => c.ultima_de_mim === false && c.ultima_mensagem && c.ultima_em)
      .map((c) => ({
        quando: new Date(c.ultima_em),
        icone: 'comment',
        texto: c.usuario.nome + ' enviou uma mensagem',
        alvo: encurtar(String(c.ultima_mensagem), 40),
        href: PAGINAS.chat + '&id=' + encodeURIComponent(c.id),
        ponto: (c.nao_lidas || 0) > 0,
      }));
  }

  // Atividades das equipes (mensagens nos canais, chamadas, reuniões agendadas):
  // vêm do banco, montadas pelo PHP em html/inicio.html (data-atividades).
  function atividadesDeEquipes() {
    try {
      const card = document.getElementById('cardAtividades');
      const lista = JSON.parse((card && card.getAttribute('data-atividades')) || '[]');
      return lista
        .map((a) => ({
          quando: new Date(a.quando), icone: a.icone, texto: a.texto,
          alvo: a.alvo, href: a.href, ponto: !!a.ponto,
        }))
        .filter((a) => !isNaN(a.quando.getTime()));
    } catch (e) {
      return [];
    }
  }

  // Cursos concluídos pelo próprio usuário. O progresso dos cursos fica no
  // navegador (localStorage, chave de js/cursos.js) e não guarda a data: o
  // horário usado aqui é a primeira vez que o Início viu o curso concluído.
  function atividadesDeCursos() {
    let salvo = {};
    let vistos = {};
    try { salvo = JSON.parse(localStorage.getItem('intelbras_cursos_progresso_' + uid)) || {}; } catch (e) { /* ignora */ }
    const chaveVistos = 'intelbras_inicio_cursos_vistos_' + uid;
    try { vistos = JSON.parse(localStorage.getItem(chaveVistos)) || {}; } catch (e) { /* ignora */ }

    let mudou = false;
    const itens = [];
    Object.keys(salvo).forEach((slug) => {
      const modulos = salvo[slug];
      if (!CURSOS_TITULOS[slug] || !Array.isArray(modulos) || modulos.length !== 3 || !modulos.every(Boolean)) return;
      if (!vistos[slug]) { vistos[slug] = new Date().toISOString(); mudou = true; }
      itens.push({
        quando: new Date(vistos[slug]),
        icone: 'course',
        texto: 'Você concluiu o curso',
        alvo: CURSOS_TITULOS[slug],
        href: PAGINAS.cursos + '&curso=' + encodeURIComponent(slug),
        ponto: false,
      });
    });
    if (mudou) {
      try { localStorage.setItem(chaveVistos, JSON.stringify(vistos)); } catch (e) { /* ignora */ }
    }
    return itens;
  }

  // ============================================================
  // AGENDA DO DIA — só aparece se existir reunião hoje
  // ============================================================
  function renderAgenda(reunioes) {
    const card = document.getElementById('agendaDoDia');
    const lista = document.getElementById('agendaLista');
    const dataEl = document.getElementById('agendaData');
    const verMais = document.getElementById('agendaVerMais');
    if (!card || !lista) return;

    const hoje = reunioes
      .filter((r) => diasAtras(new Date(r.data_hora)) === 0)
      .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

    if (!hoje.length) {
      card.hidden = true;
      return;
    }

    if (dataEl) {
      dataEl.textContent = 'Hoje – ' + new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
    }

    lista.textContent = '';
    const VISIVEIS = 3;
    const itens = hoje.map((r, i) => {
      const ini = new Date(r.data_hora);
      const fim = new Date(ini.getTime() + (r.duracao_min || 0) * MIN);
      const li = el('li', 'inicio__agenda-item' + (i >= VISIVEIS ? ' inicio__agenda-item--extra' : ''));
      li.setAttribute('tabindex', '0');
      li.setAttribute('role', 'button');
      if (i >= VISIVEIS) li.hidden = true;

      const info = el('div', 'inicio__agenda-info');
      info.appendChild(el('span', 'inicio__agenda-title', r.titulo));
      info.appendChild(el('span', 'inicio__agenda-hora', hhmm(ini) + ' – ' + hhmm(fim)));
      li.appendChild(info);

      const entrar = el('button', 'inicio__agenda-entrar', 'Entrar');
      entrar.type = 'button';
      if (r.pode_entrar === false) {
        entrar.disabled = true;
        entrar.title = 'A sala abre 15 minutos antes do horário.';
      }
      // A sala é aberta pela página Chamadas (mesma regra de acesso de lá).
      entrar.addEventListener('click', () => { window.location.href = PAGINAS.chamadas; });
      li.appendChild(entrar);

      lista.appendChild(li);
      return { li: li, r: r };
    });

    // Destaque inicial: reunião que já pode ser aberta; senão, a primeira do dia.
    const inicial = itens.find((x) => x.r.pode_entrar) || itens[0];
    inicial.li.classList.add('inicio__agenda-item--current');

    itens.forEach((x) => {
      x.li.addEventListener('click', (e) => {
        if (e.target.closest('.inicio__agenda-entrar')) return;
        itens.forEach((o) => o.li.classList.remove('inicio__agenda-item--current'));
        x.li.classList.add('inicio__agenda-item--current');
      });
      x.li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          x.li.click();
        }
      });
    });

    const extras = hoje.length - VISIVEIS;
    if (verMais) {
      if (extras > 0) {
        const rotulo = '+ ' + extras + (extras === 1 ? ' evento para hoje' : ' eventos para hoje');
        verMais.hidden = false;
        verMais.textContent = rotulo;
        verMais.setAttribute('aria-expanded', 'false');
        verMais.onclick = () => {
          const aberto = verMais.getAttribute('aria-expanded') === 'true';
          lista.querySelectorAll('.inicio__agenda-item--extra').forEach((li) => { li.hidden = aberto; });
          verMais.setAttribute('aria-expanded', String(!aberto));
          verMais.textContent = aberto ? rotulo : 'Mostrar menos';
        };
      } else {
        verMais.hidden = true;
      }
    }
    card.hidden = false;
  }

  // ============================================================
  // REUNIÕES SEMANAIS — popout abaixo de Estudos (segunda a domingo)
  // ============================================================
  function renderSemana(reunioes) {
    const card = document.getElementById('cardSemana');
    const toggle = document.getElementById('semanaToggle');
    const painel = document.getElementById('semanaPainel');
    const lista = document.getElementById('semanaLista');
    const resumo = document.getElementById('semanaResumo');
    if (!card || !toggle || !painel || !lista) return;

    if (!toggle.dataset.pronto) {
      toggle.dataset.pronto = '1';
      toggle.addEventListener('click', () => {
        const aberto = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!aberto));
        painel.classList.toggle('inicio__semana-painel--aberto', !aberto);
        painel.setAttribute('aria-hidden', String(aberto));
      });
    }

    const agora = new Date();
    const seg = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - ((agora.getDay() + 6) % 7));
    const dom = new Date(seg.getFullYear(), seg.getMonth(), seg.getDate() + 7);
    // Cada reunião pertence a um setor: só aparecem as da equipe do usuário
    // (e as da "Geral", que é de todos). O administrador vê todas.
    const meuSlug = card.getAttribute('data-equipe') || '';
    const vejoTodas = card.getAttribute('data-todas') === '1';
    const meuNome = meuSlug ? nomeEquipe(meuSlug) : '';
    const doMeuSetor = (r) => vejoTodas || r.equipe_nome === nomeEquipe('geral') || (meuNome !== '' && r.equipe_nome === meuNome);
    const vistos = new Set();
    const semana = reunioes
      .filter(doMeuSetor)
      .map((r) => ({ r: r, ini: new Date(r.data_hora) }))
      .filter((x) => !isNaN(x.ini.getTime()) && x.ini >= seg && x.ini < dom)
      .filter((x) => {
        const k = x.r.titulo + '|' + x.ini.getTime();
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      })
      .sort((a, b) => a.ini - b.ini);

    lista.textContent = '';
    if (resumo) {
      resumo.textContent = semana.length
        ? semana.length + (semana.length === 1 ? ' reunião nesta semana' : ' reuniões nesta semana')
        : 'Nenhuma reunião nesta semana';
    }
    if (!semana.length) {
      lista.appendChild(el('p', 'inicio__vazio inicio__vazio--solto', 'Nenhuma reunião marcada para esta semana.'));
      return;
    }

    let diaAtual = null;
    let ul = null;
    semana.forEach((x) => {
      const chave = diaInicio(x.ini);
      if (chave !== diaAtual) {
        diaAtual = chave;
        const ehHoje = diasAtras(x.ini) === 0;
        const nomeDia = x.ini.toLocaleDateString('pt-BR', { weekday: 'long' });
        const cab = el('p', 'inicio__semana-dia' + (ehHoje ? ' inicio__semana-dia--hoje' : ''));
        cab.appendChild(el('span', null, nomeDia.charAt(0).toUpperCase() + nomeDia.slice(1)));
        cab.appendChild(el('span', 'inicio__semana-data', ehHoje ? 'Hoje' : x.ini.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })));
        lista.appendChild(cab);
        ul = el('ul', 'inicio__semana-itens');
        lista.appendChild(ul);
      }
      const fim = new Date(x.ini.getTime() + (x.r.duracao_min || 0) * MIN);
      const li = el('li');
      const a = el('a', 'inicio__semana-item' + (fim < agora ? ' inicio__semana-item--passada' : ''));
      a.href = PAGINAS.chamadas;
      const info = el('span', 'inicio__semana-info');
      info.appendChild(el('span', 'inicio__semana-reuniao', x.r.titulo));
      const equipe = x.r.equipe_nome || '';
      info.appendChild(el('span', 'inicio__semana-hora', hhmm(x.ini) + (x.r.duracao_min ? ' – ' + hhmm(fim) : '') + (equipe ? '  •  ' + equipe : '')));
      a.appendChild(info);
      li.appendChild(a);
      ul.appendChild(li);
    });
  }

  // ============================================================
  // DADOS DE EXEMPLO (só quando nenhuma API responde)
  // ============================================================
  function dadosExemplo() {
    const agora = Date.now();
    const iso = (msAtras) => new Date(agora - msAtras).toISOString();
    const hoje = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
    return {
      docs: [
        { id: 1, nome: 'Apresentação de Resultados', extensao: 'docx', equipe: 'geral', atualizado_em: iso(26 * 60 * MIN) },
        { id: 2, nome: 'Plano de Ação Q2', extensao: 'xlsx', equipe: 'financeiro', atualizado_em: iso(2 * 24 * 60 * MIN) },
        { id: 3, nome: 'Política de Segurança da Informação', extensao: 'pdf', equipe: 'ti', atualizado_em: iso(3 * 24 * 60 * MIN) },
      ],
      reunioes: [
        { titulo: 'Projeto Nova Sede', equipe_nome: 'Marketing', data_hora: hoje(10, 30), duracao_min: 60, pode_entrar: true },
        { titulo: 'Daily Marketing', equipe_nome: 'Marketing', data_hora: hoje(15, 0), duracao_min: 30, pode_entrar: false },
      ],
      atividades: [
        { quando: new Date(agora - 5 * MIN), icone: 'comment', texto: 'Mariana Souza comentou em', alvo: 'Projeto Nova Sede', href: PAGINAS.chat, ponto: true },
        { quando: new Date(agora - 60 * MIN), icone: 'share', texto: 'Carlos Lima enviou um documento em', alvo: 'Financeiro', href: PAGINAS.documentos, ponto: true },
        { quando: new Date(agora - 2 * 60 * MIN), icone: 'course', texto: 'Juliana Martins concluiu o curso', alvo: 'Segurança da Informação', href: PAGINAS.cursos, ponto: true },
        { quando: new Date(agora - 3 * 60 * MIN), icone: 'comment', texto: 'Rafael Alves comentou no grupo', alvo: 'Marketing', href: PAGINAS.chat, ponto: false },
        { quando: new Date(agora - 5 * 60 * MIN), icone: 'channel', texto: 'TI criou um novo canal', alvo: 'Suporte Interno', href: PAGINAS.chat, ponto: false },
      ],
    };
  }

  // ============================================================
  // CARREGAMENTO
  // ============================================================
  async function carregar() {
    const [rDocs, rReu, rChat] = await Promise.all([
      buscar('api/documentos/listar.php?aba=recentes&limite=40&ordem=recentes'),
      buscar('api/chamadas/agendadas.php?todas=1'),
      buscar('api/chat/conversas.php'),
    ]);

    const tudoFalhou = !rDocs.ok && !rReu.ok && !rChat.ok;
    let docs = rDocs.ok ? (rDocs.dados.documentos || []) : [];
    let reunioes = rReu.ok ? (rReu.dados.agendadas || []) : [];
    let atividades = [];

    const daEquipe = atividadesDeEquipes();
    if (tudoFalhou && !daEquipe.length) {
      const ex = dadosExemplo();
      docs = ex.docs;
      reunioes = ex.reunioes;
      atividades = ex.atividades;
      marcarExemplo('cardCanais');
      marcarExemplo('cardAtividades');
    } else {
      if (rDocs.ok) atividades = atividades.concat(atividadesDeDocumentos(rDocs.dados.atividades || []));
      if (rChat.ok) atividades = atividades.concat(atividadesDeChat(rChat.dados.conversas || []));
      atividades = atividades.concat(daEquipe);
      atividades = atividades.concat(atividadesDeCursos());
      atividades.sort((a, b) => b.quando - a.quando);
      // Mesma pessoa + mesmo destino em sequência vira uma linha só (a mais recente)
      const vistas = new Set();
      atividades = atividades.filter((a) => {
        const k = a.texto + '|' + a.alvo;
        if (vistas.has(k)) return false;
        vistas.add(k);
        return true;
      }).slice(0, 5);
    }

    // Reuniões marcadas em "Agendar reunião" (vêm do PHP em html/inicio.html)
    let reunioesCanais = reunioes;
    if (!tudoFalhou) {
      try {
        const cardCanais = document.getElementById('cardCanais');
        const extras = JSON.parse((cardCanais && cardCanais.getAttribute('data-reunioes')) || '[]');
        reunioesCanais = reunioes.concat(extras.map((r) => ({
          titulo: r.titulo, equipe_nome: nomeEquipe(r.equipe),
          data_hora: r.data_hora, duracao_min: r.duracao_min,
        })));
      } catch (e) { /* ignora: segue só com as reuniões das Chamadas */ }
    }

    preencher(
      document.getElementById('canaisLista'),
      montarCanais(docs, reunioesCanais).map(linhaCanal),
      'Nenhum documento ou reunião nos canais ainda.'
    );
    preencher(
      document.getElementById('atividadesLista'),
      atividades.map(linhaAtividade),
      'Nenhuma atividade recente.'
    );
    renderAgenda(reunioes);
    renderSemana(reunioesCanais);
  }

  // ============================================================
  // MENU DE BOTÃO DIREITO NOS CARDS
  // Usa o mesmo menu do menu lateral (window.MenuContexto, em
  // assets/js/menu-contexto.js): equipes favoritas, atalhos, estudos,
  // canais em destaque, atividades, agenda e reuniões semanais.
  // Shift + botão direito continua abrindo o menu do navegador.
  // ============================================================
  const CHAVE_MUDAS = 'equipesSilenciadas'; // mesma chave do menu lateral e da página Equipes
  const CSRF_EQUIPES = raiz.getAttribute('data-csrf-equipes') || '';

  function lerMudas() {
    try {
      const v = JSON.parse(localStorage.getItem(CHAVE_MUDAS) || '[]');
      return Array.isArray(v) ? v.map(String) : [];
    } catch (e) { return []; }
  }

  function avisar(texto, rotulo, aoClicar) {
    if (window.MenuContexto) window.MenuContexto.toast(texto, rotulo, aoClicar);
  }

  function textoDe(a, seletor) {
    const n = seletor ? a.querySelector(seletor) : null;
    return ((n || a).textContent || '').replace(/\s+/g, ' ').trim();
  }

  // Descreve cada tipo de item: ícone/título do topo do menu e a ação principal
  function descreverLink(a) {
    if (a.classList.contains('inicio__chip')) {
      return { tipo: 'equipe', icone: 'estrela', titulo: textoDe(a).replace(/^#\s*/, ''), principal: 'Abrir canal' };
    }
    if (a.classList.contains('inicio__shortcut-tile')) {
      return { tipo: 'atalho', icone: 'abrir', titulo: textoDe(a, 'span:last-child'), principal: 'Abrir' };
    }
    if (a.classList.contains('inicio__estudo-item')) {
      return { tipo: 'curso', icone: 'curso', titulo: textoDe(a, '.inicio__estudo-titulo'), principal: 'Abrir curso' };
    }
    if (a.classList.contains('inicio__estudo-mais')) {
      return { tipo: 'cursos', icone: 'curso', titulo: 'Estudos', principal: 'Ver todos os módulos' };
    }
    if (a.classList.contains('inicio__channel-row')) {
      return { tipo: 'canal', icone: 'arquivos', titulo: textoDe(a, '.inicio__row-title'), principal: 'Abrir' };
    }
    if (a.classList.contains('inicio__activity-row')) {
      return { tipo: 'atividade', icone: 'mensagem', titulo: textoDe(a, '.inicio__row-title strong'), principal: 'Abrir' };
    }
    if (a.classList.contains('inicio__semana-item')) {
      return { tipo: 'reuniao', icone: 'agenda', titulo: textoDe(a, '.inicio__semana-reuniao'), principal: 'Abrir agenda' };
    }
    return { tipo: 'link', icone: 'abrir', titulo: textoDe(a) || 'Link', principal: 'Abrir' };
  }

  function postFavorita(slug, favorita) {
    return fetch('api/equipes/favorita.php', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF_EQUIPES, Accept: 'application/json' },
      body: JSON.stringify({ slug: slug, favorita: favorita }),
    }).then((r) => r.json().catch(() => ({})).then((d) => {
      if (!r.ok || d.sucesso === false) throw new Error(d.erro || 'Falha');
    }));
  }

  function alternarSilencioEquipe(a, slug, nome) {
    const lista = lerMudas();
    const i = lista.indexOf(slug);
    const silenciar = i === -1;
    if (silenciar) lista.push(slug); else lista.splice(i, 1);
    try { localStorage.setItem(CHAVE_MUDAS, JSON.stringify(lista)); } catch (e) { /* sem storage */ }
    avisar(silenciar ? 'Canal “' + nome + '” silenciado' : 'Notificações de “' + nome + '” reativadas');
  }

  // Tira a equipe dos favoritos (com "Desfazer"); a linha some com animação
  function removerFavorita(a, slug, nome) {
    const linha = a.parentNode;
    const prox = a.nextElementSibling;
    const outros = linha.querySelectorAll('.inicio__chip').length;
    const card = a.closest('.inicio__card');
    postFavorita(slug, false).then(() => {
      const tirar = () => {
        a.remove();
        if (outros <= 1 && card) card.style.display = 'none'; // sem favoritas, o card some
      };
      const reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduz || !a.animate) tirar();
      else {
        const an = a.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.85)' }], { duration: 160, easing: 'ease-in' });
        an.onfinish = tirar;
      }
      avisar('“' + nome + '” removida dos favoritos', 'Desfazer', () => {
        postFavorita(slug, true).then(() => {
          if (card) card.style.display = '';
          linha.hidden = false;
          linha.insertBefore(a, prox && prox.parentNode === linha ? prox : null);
        }).catch(() => avisar('Não foi possível desfazer.'));
      });
    }).catch(() => avisar('Não foi possível atualizar o favorito.'));
  }

  function opcoesDoLink(a, d) {
    const menu = window.MenuContexto;
    const url = a.href;
    const ops = [
      { rotulo: d.principal, icone: d.icone === 'abrir' ? 'abrir' : d.icone, destaque: true,
        acao: () => { window.location.href = url; } },
      { rotulo: 'Abrir em nova aba', icone: 'abrir', acao: () => window.open(url, '_blank', 'noopener') },
      { rotulo: 'Copiar link', icone: 'link', acao: () => menu.copiar(url, 'Link copiado') },
    ];
    if (d.tipo === 'equipe') {
      const slug = a.getAttribute('data-equipe-slug') || '';
      const mudo = lerMudas().indexOf(slug) !== -1;
      ops.push('sep');
      ops.push({ rotulo: mudo ? 'Reativar notificações' : 'Silenciar canal', icone: mudo ? 'sino' : 'sinoOff',
        acao: () => alternarSilencioEquipe(a, slug, d.titulo) });
      ops.push({ rotulo: 'Remover dos favoritos', icone: 'estrela',
        desabilitado: !slug || !CSRF_EQUIPES, acao: () => removerFavorita(a, slug, d.titulo) });
    } else if (d.tipo === 'curso') {
      ops.push('sep');
      ops.push({ rotulo: 'Ver todos os cursos', icone: 'curso', acao: () => { window.location.href = 'index.php?pagina=cursos'; } });
    } else if (d.tipo === 'canal') {
      ops.push('sep');
      ops.push({ rotulo: 'Abrir Documentos', icone: 'arquivos', acao: () => { window.location.href = PAGINAS.documentos; } });
    }
    return ops;
  }

  function mostrarMenuCard(alvo, x, y, cfg) { // sem contorno no alvo: o card já tem o próprio hover
    const menu = window.MenuContexto;
    menu.mostrar({
      x: x, y: y, alvo: null,
      aria: 'Opções de ' + cfg.titulo,
      cabeca: (cabeca) => {
        cabeca.insertAdjacentHTML('beforeend', menu.icone(cfg.icone));
        const n = document.createElement('span');
        n.className = 'ml-menu__cabeca-nome';
        n.textContent = cfg.titulo;
        cabeca.appendChild(n);
      },
      opcoes: cfg.opcoes,
    });
  }

  raiz.addEventListener('contextmenu', (e) => {
    if (e.shiftKey || !window.MenuContexto || !e.target.closest) return;
    // com texto selecionado vale o menu de "Texto selecionado"
    const sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return;

    let x = e.clientX, y = e.clientY;
    const ancorar = (n) => {
      if (x || y) return;
      const r = n.getBoundingClientRect();
      x = r.left + 24; y = r.bottom - 6;
    };

    // Reuniões semanais (botão que abre/fecha o painel)
    const toggle = e.target.closest('#semanaToggle');
    if (toggle) {
      e.preventDefault();
      ancorar(toggle);
      const aberto = toggle.getAttribute('aria-expanded') === 'true';
      mostrarMenuCard(toggle, x, y, {
        titulo: 'Reuniões semanais', icone: 'agenda',
        opcoes: [
          { rotulo: aberto ? 'Recolher' : 'Expandir', icone: aberto ? 'recolher' : 'expandir', destaque: true,
            acao: () => toggle.click() },
          { rotulo: 'Ver agenda completa', icone: 'abrir', acao: () => { window.location.href = PAGINAS.chamadas; } },
          { rotulo: 'Agendar reunião', icone: 'novo', acao: () => { window.location.href = 'index.php?pagina=agendar-reuniao'; } },
        ],
      });
      return;
    }

    // Qualquer link dos cards
    const a = e.target.closest('.inicio__card a[href], .inicio__chip-row a[href]');
    if (!a) return;
    e.preventDefault();
    ancorar(a);
    const d = descreverLink(a);
    mostrarMenuCard(a, x, y, { titulo: d.titulo, icone: d.icone, opcoes: opcoesDoLink(a, d) });
  });

  // ============================================================
  // ESTUDOS — só aparece se o usuário tem curso por concluir.
  // Cursos já concluídos saem da lista; sem nenhum pendente (ou sem cursos
  // para a equipe: o PHP nem desenha o card) o card some. O progresso fica no
  // navegador, na mesma chave de cursos.js.
  // ============================================================
  (function estudosPendentes() {
    const card = document.getElementById('cardEstudo');
    if (!card) return;
    const itens = Array.from(card.querySelectorAll('li[data-curso]'));
    const mais = card.querySelector('.inicio__estudo-mais');

    function concluido(salvo, slug) {
      const m = salvo[slug];
      return Array.isArray(m) && m.length === 3 && m.every(Boolean);
    }

    function atualizar() {
      let salvo = {};
      try { salvo = JSON.parse(localStorage.getItem('intelbras_cursos_progresso_v3_' + uid)) || {}; } catch (e) { /* ignora */ }
      const pendentes = itens.filter((li) => !concluido(salvo, li.getAttribute('data-curso')));
      const mostrar = pendentes.length > 4 ? pendentes.slice(0, 3) : pendentes;
      itens.forEach((li) => { li.style.display = mostrar.indexOf(li) === -1 ? 'none' : ''; });
      const extras = pendentes.length - mostrar.length;
      if (mais) {
        mais.style.display = extras > 0 ? '' : 'none';
        mais.textContent = '+ Mais ' + extras + ' módulo' + (extras === 1 ? '' : 's');
      }
      card.style.display = pendentes.length ? '' : 'none';
    }

    atualizar();
    window.addEventListener('storage', atualizar);
    window.addEventListener('pageshow', atualizar);
  })();

  carregar();
})();
