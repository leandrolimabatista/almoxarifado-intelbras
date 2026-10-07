// ============================================================
// CONTEÚDO — Cursos (área CADASTRADO)
// Somente front-end: dados mockados abaixo, sem back-end.
// A equipe do usuário vem do PHP (tb_usuarios.equipe_slug) pelos
// data-attributes de #cursosRaiz.
//
// Telas (escolhidas pela URL):
//   ?pagina=cursos                        -> A (usuário) ou B (admin)
//   ?pagina=cursos&curso=<slug>           -> C (detalhe) | E (restrito)
//   ?pagina=cursos&curso=<slug>&modulo=N  -> D (módulo)
//   equipe sem cursos                     -> F (estado vazio)
// ============================================================
(function () {
  'use strict';

  // ---------- Menu lateral (botão "Recolher") ----------
  const btnRecolher = document.getElementById('btnRecolher');
  const fecharMenu = () => document.body.classList.remove('sidebar-open');
  if (btnRecolher) btnRecolher.addEventListener('click', fecharMenu);

  const raiz = document.getElementById('cursosRaiz');
  const app = document.getElementById('cursosApp');
  if (!raiz || !app) return;

  // ---------- Contexto do usuário ----------
  const ehAdmin = raiz.dataset.admin === '1';
  const verComo = raiz.dataset.verComo || '';
  const uid = raiz.dataset.usuarioId || '0';
  const nomeUsuario = raiz.dataset.usuarioNome || '';
  // "geral" (ou vazio) não tem cursos próprios.
  const equipeUsuario = verComo || raiz.dataset.equipe || '';
  const visaoAdmin = ehAdmin && !verComo; // admin sem simulação = Tela B

  // ---------- Equipes ----------
  // Cores das tags: mesmas da referência; Projetos em teal (≠ azul de T.I).
  const EQUIPES = {
    ti:         { nome: 'T.I',             cor: '#2563EB' },
    rh:         { nome: 'RH',              cor: '#7C3AED' },
    marketing:  { nome: 'Marketing',       cor: '#C75B08' },
    financeiro: { nome: 'Financeiro',      cor: '#DB2777' },
    projetos:   { nome: 'Projetos',        cor: '#0D9488' },
    sac:        { nome: 'SAC / Ouvidoria', cor: '#DC2626' }
  };
  const ORDEM_EQUIPES = ['ti', 'rh', 'marketing', 'financeiro', 'projetos', 'sac'];

  // ---------- Dados mockados: 6 equipes × 4 cursos × 3 módulos ----------
  // [titulo, descricao, [modulo1, modulo2, modulo3], modulosConcluidos(0-3), [min1, min2, min3]]
  const CATALOGO = {
    ti: [
      ['Fundamentos de Redes e Infraestrutura', 'Aprenda os conceitos básicos de redes, protocolos e infraestrutura de TI.', ['Redes e Protocolos', 'Equipamentos e Conectividade', 'Segurança de Rede'], 1, [20, 25, 20]],
      ['Segurança da Informação', 'Entenda como proteger dados, evitar riscos e adotar boas práticas no dia a dia.', ['Conceitos e Ameaças', 'Boas Práticas e Ferramentas', 'Política de Segurança'], 0, [15, 20, 15]],
      ['Cloud Computing', 'Entenda os principais conceitos de nuvem e suas aplicações no dia a dia.', ['Conceitos e Modelos', 'Serviços e Plataformas', 'Segurança na Nuvem'], 0, [15, 25, 20]],
      ['Suporte Técnico e Help Desk', 'Aprenda a atender chamados e resolver problemas técnicos com agilidade.', ['Atendimento de Chamados', 'Diagnóstico de Problemas', 'Base de Conhecimento'], 3, [15, 20, 15]]
    ],
    rh: [
      ['Gestão de Pessoas', 'Desenvolva habilidades para um ambiente de trabalho mais colaborativo e produtivo.', ['Liderança e Colaboração', 'Feedback e Desenvolvimento', 'Diversidade e Inclusão'], 1, [20, 20, 25]],
      ['Onboarding e Integração', 'Conheça o processo de acolhimento de novos colaboradores na Intelbras.', ['Cultura Intelbras', 'Primeiros 90 Dias', 'Ferramentas do Dia a Dia'], 2, [15, 20, 15]],
      ['Clima Organizacional', 'Entenda como medir e melhorar o clima e o engajamento das equipes.', ['Comunicação Interna', 'Pesquisa de Clima', 'Engajamento'], 0, [15, 20, 20]],
      ['Legislação Trabalhista Básica', 'Veja os fundamentos da legislação trabalhista aplicados à rotina da empresa.', ['Contratos e Jornada', 'Benefícios e Direitos', 'Boas Práticas de Conformidade'], 3, [20, 20, 15]]
    ],
    marketing: [
      ['Comunicação e Marca', 'Fortaleça a identidade da Intelbras e aprenda a se comunicar de forma eficiente.', ['Identidade da Marca', 'Comunicação Interna', 'Marketing Digital'], 2, [15, 20, 25]],
      ['Marketing de Conteúdo', 'Planeje e crie conteúdos que aproximam a marca do seu público.', ['Planejamento Editorial', 'Criação de Conteúdo', 'Métricas de Engajamento'], 0, [20, 25, 15]],
      ['Redes Sociais e Comunidade', 'Aprenda a gerir canais e a se relacionar com a comunidade da marca.', ['Estratégia por Canal', 'Calendário e Publicação', 'Relacionamento e Moderação'], 1, [20, 15, 20]],
      ['Análise de Dados de Marketing', 'Use indicadores e ferramentas para tomar decisões com base em dados.', ['Indicadores Essenciais', 'Ferramentas de Análise', 'Relatórios e Decisões'], 3, [15, 25, 20]]
    ],
    financeiro: [
      ['Noções de Finanças Corporativas', 'Entenda os principais conceitos financeiros e como eles impactam o negócio.', ['Conceitos Básicos', 'Orçamento e Controle', 'Resultados e Indicadores'], 0, [15, 20, 20]],
      ['Contas a Pagar e a Receber', 'Organize o fluxo de pagamentos, cobranças e a conciliação financeira.', ['Fluxo de Pagamentos', 'Cobrança e Recebimentos', 'Conciliação'], 2, [15, 20, 15]],
      ['Planejamento Orçamentário', 'Aprenda a definir premissas, construir e acompanhar o orçamento.', ['Premissas e Metas', 'Construção do Orçamento', 'Acompanhamento'], 1, [20, 25, 15]],
      ['Impostos e Conformidade Fiscal', 'Conheça os tributos, as notas fiscais e as obrigações do dia a dia.', ['Visão Geral Tributária', 'Notas Fiscais', 'Obrigações Acessórias'], 3, [20, 20, 20]]
    ],
    projetos: [
      ['Gestão de Projetos', 'Conheça as etapas e ferramentas para planejar, executar e entregar resultados.', ['Planejamento', 'Execução', 'Monitoramento'], 2, [20, 25, 20]],
      ['Metodologias Ágeis', 'Aprenda os fundamentos do Ágil, do Scrum e do Kanban na prática.', ['Fundamentos do Ágil', 'Scrum na Prática', 'Kanban e Fluxo'], 1, [15, 25, 20]],
      ['Gestão de Riscos', 'Identifique, priorize e responda aos riscos que afetam seus projetos.', ['Identificação', 'Análise e Priorização', 'Plano de Resposta'], 0, [15, 20, 20]],
      ['Comunicação com Stakeholders', 'Mapeie interessados e mantenha todos alinhados durante o projeto.', ['Mapeamento', 'Reuniões e Alinhamentos', 'Relatórios de Status'], 3, [15, 15, 20]]
    ],
    sac: [
      ['Atendimento de Excelência', 'Melhore a experiência do cliente com uma comunicação clara e empática.', ['Comunicação Eficaz', 'Escuta Ativa', 'Resolução de Conflitos'], 1, [15, 20, 25]],
      ['Gestão de Reclamações e Ouvidoria', 'Aprenda a registrar, tratar e encerrar reclamações dentro do prazo.', ['Registro e Triagem', 'Prazos e SLA', 'Encerramento e Feedback'], 0, [15, 20, 15]],
      ['Pós-venda e Fidelização', 'Acompanhe o cliente após a compra e construa relacionamentos duradouros.', ['Acompanhamento do Cliente', 'Indicadores de Satisfação', 'Retenção'], 2, [20, 20, 20]],
      ['LGPD no Atendimento', 'Entenda como proteger os dados do cliente no contato do dia a dia.', ['Conceitos da LGPD', 'Dados do Cliente', 'Boas Práticas'], 3, [20, 20, 15]]
    ]
  };

  const semAcento = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const slugify = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const CURSOS = [];
  ORDEM_EQUIPES.forEach((eq) => {
    CATALOGO[eq].forEach((c, i) => {
      CURSOS.push({
        slug: slugify(c[0]), equipe: eq, indice: i, titulo: c[0], descricao: c[1],
        modulos: c[2].map((t, k) => ({
          n: k + 1, titulo: t, min: c[4][k],
          resumo: 'Veja os pontos principais de ' + t.toLowerCase() + ' aplicados ao dia a dia da equipe.',
          texto: 'Neste módulo você vai entender os conceitos de ' + t.toLowerCase() + ' do curso "' + c[0] +
            '". Assista ao vídeo, acompanhe os exemplos práticos e, ao terminar, marque o módulo como concluído ' +
            'para acompanhar o seu progresso.'
        })),
        baseConcluidos: c[3]
      });
    });
  });

  // ---------- Progresso (mock + o que o usuário marcou, salvo no navegador) ----------
  const CHAVE = 'intelbras_cursos_progresso_' + uid;
  function lerSalvo() {
    try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch (e) { return {}; }
  }
  function salvar(dados) {
    try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch (e) { /* sem storage: ignora */ }
  }
  // Devolve [bool, bool, bool] dos módulos concluídos.
  function concluidos(curso) {
    const salvo = lerSalvo()[curso.slug];
    if (Array.isArray(salvo) && salvo.length === 3) return salvo.map(Boolean);
    return [0, 1, 2].map((k) => k < curso.baseConcluidos);
  }
  const contar = (curso) => concluidos(curso).filter(Boolean).length;
  const percentual = (curso) => Math.round((contar(curso) / 3) * 100);

  function statusModulos(curso) {
    const feito = concluidos(curso);
    const algum = feito.some(Boolean);
    let emAndamentoMarcado = false;
    return feito.map((f) => {
      if (f) return 'concluido';
      if (algum && !emAndamentoMarcado) { emAndamentoMarcado = true; return 'andamento'; }
      return 'nao-iniciado';
    });
  }

  // ---------- Utilidades ----------
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const url = (params) => {
    let u = 'index.php?pagina=cursos';
    if (verComo) u += '&ver_como=' + encodeURIComponent(verComo);
    Object.keys(params || {}).forEach((k) => { u += '&' + k + '=' + encodeURIComponent(params[k]); });
    return u;
  };
  const cursosPermitidos = () => (visaoAdmin ? CURSOS : CURSOS.filter((c) => c.equipe === equipeUsuario));
  const podeVer = (curso) => visaoAdmin || curso.equipe === equipeUsuario;

  // ---------- Ícones ----------
  const IC = {
    check: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    capelo: '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M4 18L24 8l20 10-20 10L4 18z" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M12 23v9c0 3 5.4 6 12 6s12-3 12-6v-9M44 18v12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cadeado: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 10.5V8a4 4 0 018 0v2.5M12 14.5v2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    relogio: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>'
  };

  // ---------- Capa do curso (SVG gerado; tema escuro esverdeado) ----------
  const MOTIVOS = {
    ti: (v) => '<g fill="#0a2a1b" stroke="#22c55e" stroke-opacity=".55">' +
      [0, 1, 2].map((i) => '<rect x="' + (188 + v * 8) + '" y="' + (16 + i * 27) + '" width="96" height="22" rx="3"/><circle cx="' + (200 + v * 8) + '" cy="' + (27 + i * 27) + '" r="2.5" fill="#22c55e" stroke="none"/><path d="M' + (214 + v * 8) + ' ' + (27 + i * 27) + 'h52" stroke-width="2"/>').join('') + '</g>',
    rh: (v) => '<g fill="#16a34a" fill-opacity=".85"><circle cx="' + (236 + v * 6) + '" cy="40" r="15"/><path d="M204 100c0-20 14-30 32-30s32 10 32 30z"/><circle cx="' + (196 + v * 6) + '" cy="56" r="10" fill-opacity=".6"/><circle cx="' + (278 + v * 6) + '" cy="56" r="10" fill-opacity=".6"/></g>',
    marketing: (v) => '<g fill="none" stroke="#22c55e"><circle cx="' + (238 + v * 6) + '" cy="56" r="38" stroke-opacity=".5" stroke-width="3"/><circle cx="' + (238 + v * 6) + '" cy="56" r="24" stroke-opacity=".7" stroke-width="3"/><circle cx="' + (238 + v * 6) + '" cy="56" r="9" fill="#22c55e" stroke="none"/><path d="M' + (238 + v * 6) + ' 56l36-36" stroke="#bbf7d0" stroke-width="3" stroke-linecap="round"/></g>',
    financeiro: (v) => '<g fill="#22c55e">' + [26, 44, 34, 62, 78].map((h, i) => '<rect x="' + (196 + v * 6 + i * 20) + '" y="' + (100 - h) + '" width="13" height="' + h + '" rx="2" fill-opacity="' + (0.45 + i * 0.12) + '"/>').join('') + '</g>',
    projetos: (v) => '<g fill="#0a2a1b" stroke="#22c55e" stroke-opacity=".6">' + [0, 1, 2].map((c) => '<rect x="' + (192 + v * 6 + c * 32) + '" y="18" width="28" height="84" rx="4"/>' + [0, 1, 2].slice(0, 3 - c).map((r) => '<rect x="' + (196 + v * 6 + c * 32) + '" y="' + (24 + r * 26) + '" width="20" height="20" rx="3" fill="#16a34a" fill-opacity=".8" stroke="none"/>').join('')).join('') + '</g>',
    sac: (v) => '<g fill="none" stroke="#22c55e" stroke-width="5" stroke-linecap="round"><path d="M' + (204 + v * 6) + ' 62a34 34 0 0168 0" stroke-opacity=".85"/><rect x="' + (198 + v * 6) + '" y="58" width="12" height="26" rx="5" fill="#16a34a" stroke="none"/><rect x="' + (266 + v * 6) + '" y="58" width="12" height="26" rx="5" fill="#16a34a" stroke="none"/><path d="M' + (272 + v * 6) + ' 84q0 14-24 14" stroke-opacity=".7"/></g>'
  };
  function capa(curso) {
    const v = curso.indice % 3;
    const id = 'cv' + curso.slug.slice(0, 12).replace(/-/g, '') + curso.indice;
    return '<svg class="curso-card__capa-svg" viewBox="0 0 320 118" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Capa do curso ' + esc(curso.titulo) + '">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#03130c"/><stop offset="1" stop-color="' + ['#0b4a2a', '#0d5a33', '#095c3a'][v] + '"/></linearGradient>' +
      '<pattern id="' + id + 'g" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0v16" fill="none" stroke="#22c55e" stroke-opacity=".08"/></pattern></defs>' +
      '<rect width="320" height="118" fill="url(#' + id + ')"/><rect width="320" height="118" fill="url(#' + id + 'g)"/>' +
      MOTIVOS[curso.equipe](v) + '</svg>';
  }

  // ---------- Peças reutilizáveis ----------
  function tag(equipe) {
    const e = EQUIPES[equipe];
    return '<span class="curso-tag" style="--tag:' + e.cor + '"><i class="curso-tag__ponto"></i>' + esc(e.nome) + '</span>';
  }

  const barra = (pct) => '<div class="curso-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div>';

  function cardCurso(curso) {
    const feito = concluidos(curso);
    const pct = percentual(curso);
    const modulos = curso.modulos.map((m, k) =>
      '<li class="curso-modulo"><span class="curso-modulo__num">' + m.n + '</span>' +
      '<span class="curso-modulo__nome">' + esc(m.titulo) + '</span>' +
      (feito[k] ? '<span class="curso-modulo__ok" aria-label="Concluído">' + IC.check + '</span>' : '<span class="curso-modulo__pendente" aria-label="Pendente"></span>') + '</li>').join('');
    return '<a class="curso-card" data-equipe="' + curso.equipe + '" data-progresso="' + pct + '" href="' + url({ curso: curso.slug }) + '" data-nav>' +
      '<div class="curso-card__capa">' + capa(curso) + '<span class="curso-card__tag">' + tag(curso.equipe) + '</span>' +
      (pct === 100 ? '<span class="curso-selo">' + IC.check + 'Concluído</span>' : '') + '</div>' +
      '<div class="curso-card__corpo"><h3 class="curso-card__titulo">' + esc(curso.titulo) + '</h3>' +
      '<p class="curso-card__desc">' + esc(curso.descricao) + '</p>' +
      '<ul class="curso-card__modulos">' + modulos + '</ul>' +
      '<div class="curso-card__rodape">' + barra(pct) + '<span class="curso-card__pct">' + pct + '% concluído</span></div></div></a>';
  }

  const migalhas = (itens) => '<nav class="cursos__migalhas" aria-label="Você está aqui">' + itens.map((it, i) =>
    (it.href && i < itens.length - 1 ? '<a href="' + it.href + '" data-nav>' + esc(it.txt) + '</a>' : '<span' + (i === itens.length - 1 ? ' aria-current="page"' : '') + '>' + esc(it.txt) + '</span>') +
    (i < itens.length - 1 ? '<i class="cursos__migalhas-sep">›</i>' : '')).join('') + '</nav>';

  // ---------- Telas ----------
  let filtroStatus = 'todos';
  let filtroEquipe = 'todas';

  function telaLista() {
    const todos = cursosPermitidos();
    if (!todos.length) return telaVazia();

    const chips = visaoAdmin
      ? [['todas', 'Todos os cursos']].concat(ORDEM_EQUIPES.map((e) => [e, EQUIPES[e].nome]))
      : [['todos', 'Todos os cursos'], ['andamento', 'Em andamento'], ['nao-iniciado', 'Não iniciados'], ['concluido', 'Concluídos']];
    const ativo = visaoAdmin ? filtroEquipe : filtroStatus;

    const lista = todos.filter((c) => {
      const p = percentual(c);
      if (visaoAdmin) return filtroEquipe === 'todas' || c.equipe === filtroEquipe;
      if (filtroStatus === 'andamento') return p > 0 && p < 100;
      if (filtroStatus === 'nao-iniciado') return p === 0;
      if (filtroStatus === 'concluido') return p === 100;
      return true;
    });

    const nomeEq = EQUIPES[equipeUsuario] ? EQUIPES[equipeUsuario].nome : '';
    const subtitulo = visaoAdmin
      ? 'Desenvolva suas habilidades e evolua junto com a Intelbras. Escolha o curso da sua equipe e comece agora!'
      : 'Desenvolva suas habilidades com os cursos da sua equipe.';
    const quem = !visaoAdmin ? '<p class="cursos__contexto">' + esc(nomeUsuario.split(' ').slice(0, 2).join(' ')) + ' · ' + esc(nomeEq) + '</p>' : '';

    return '<div class="cursos__topo"><div class="cursos__topo-texto">' +
      migalhas([{ txt: 'Cursos' }]) + '<h1 class="cursos__titulo">Cursos</h1><p class="cursos__subtitulo">' + subtitulo + '</p>' + quem + '</div>' +
      '<aside class="cursos__banner"><span class="cursos__banner-icone">' + IC.capelo + '</span><div><strong>Aprender também é inovar</strong>' +
      '<p>Aqui você encontra cursos rápidos e práticos, feitos para o seu dia a dia na Intelbras.</p></div></aside></div>' +
      '<div class="cursos__chips" role="group" aria-label="Filtrar cursos">' + chips.map((c) =>
        '<button type="button" class="chip-filtro' + (c[0] === ativo ? ' chip-filtro--ativo' : '') + '" data-filtro="' + c[0] + '" aria-pressed="' + (c[0] === ativo) + '">' + esc(c[1]) + '</button>').join('') + '</div>' +
      '<h2 class="cursos__secao">Cursos disponíveis</h2>' +
      (lista.length ? '<div class="cursos__grade">' + lista.map(cardCurso).join('') + '</div>'
        : '<p class="cursos__sem-resultado">Nenhum curso encontrado para este filtro.</p>');
  }

  function telaDetalhe(curso) {
    const feito = concluidos(curso), st = statusModulos(curso), pct = percentual(curso);
    const total = curso.modulos.reduce((s, m) => s + m.min, 0);
    const proximo = Math.max(0, feito.indexOf(false));
    const rotulo = { concluido: 'Concluído', andamento: 'Em andamento', 'nao-iniciado': 'Não iniciado' };
    const btn = pct === 100 ? 'Revisar curso' : (pct === 0 ? 'Começar curso' : 'Continuar curso');
    return migalhas([{ txt: 'Cursos', href: url() }, { txt: curso.titulo }]) +
      '<header class="curso-hero"><div class="curso-hero__capa">' + capa(curso) + '</div><div class="curso-hero__info">' + tag(curso.equipe) +
      '<h1 class="curso-hero__titulo">' + esc(curso.titulo) + '</h1><p class="curso-hero__desc">' + esc(curso.descricao) + '</p>' +
      '<div class="curso-hero__progresso">' + barra(pct) + '<span>' + pct + '% concluído</span></div>' +
      '<a class="btn-curso btn-curso--primario" href="' + url({ curso: curso.slug, modulo: proximo + 1 }) + '" data-nav>' + btn + '</a></div></header>' +
      '<div class="curso-layout"><section class="curso-layout__lista" aria-label="Módulos do curso"><h2 class="cursos__secao">Módulos</h2>' +
      curso.modulos.map((m, k) =>
        '<a class="modulo-card modulo-card--' + st[k] + '" href="' + url({ curso: curso.slug, modulo: m.n }) + '" data-nav>' +
        '<span class="modulo-card__num">' + m.n + '</span><div class="modulo-card__texto"><h3>' + esc(m.titulo) + '</h3><p>' + esc(m.resumo) + '</p></div>' +
        '<span class="modulo-card__duracao">' + IC.relogio + m.min + ' min</span>' +
        '<span class="modulo-status modulo-status--' + st[k] + '">' + (st[k] === 'concluido' ? IC.check : '') + rotulo[st[k]] + '</span></a>').join('') + '</section>' +
      '<aside class="curso-resumo"><h2>Resumo</h2><dl><dt>Equipe</dt><dd>' + esc(EQUIPES[curso.equipe].nome) + '</dd>' +
      '<dt>Total de módulos</dt><dd>' + curso.modulos.length + '</dd><dt>Duração total</dt><dd>' + total + ' min</dd></dl></aside></div>';
  }

  function telaModulo(curso, n) {
    const m = curso.modulos[n - 1];
    const feito = concluidos(curso);
    const anterior = n > 1 ? url({ curso: curso.slug, modulo: n - 1 }) : url({ curso: curso.slug });
    return migalhas([{ txt: 'Cursos', href: url() }, { txt: curso.titulo, href: url({ curso: curso.slug }) }, { txt: m.titulo }]) +
      '<div class="modulo-layout"><section class="modulo-principal"><div class="modulo-video" role="img" aria-label="Espaço reservado para o vídeo da aula">' +
      '<button type="button" class="modulo-video__play" aria-label="Reproduzir vídeo">' + IC.play + '</button><span class="modulo-video__legenda">Vídeo do módulo ' + n + ' · ' + m.min + ' min</span></div>' +
      '<h1 class="modulo-principal__titulo">' + esc(m.titulo) + '</h1><p class="modulo-principal__texto">' + esc(m.texto) + '</p>' +
      '<div class="modulo-acoes"><a class="btn-curso btn-curso--secundario" href="' + anterior + '" data-nav>Módulo anterior</a>' +
      '<button type="button" class="btn-curso btn-curso--primario" id="btnConcluirModulo"' + (feito[n - 1] ? ' disabled' : '') + '>' + (feito[n - 1] ? 'Módulo concluído' : 'Marcar como concluído') + '</button></div></section>' +
      '<aside class="modulo-lateral" aria-label="Módulos do curso"><h2>' + esc(curso.titulo) + '</h2><ol>' + curso.modulos.map((mm, k) =>
        '<li><a class="modulo-lateral__item' + (mm.n === n ? ' modulo-lateral__item--atual' : '') + '" href="' + url({ curso: curso.slug, modulo: mm.n }) + '" data-nav' + (mm.n === n ? ' aria-current="page"' : '') + '>' +
        '<span class="modulo-lateral__num">' + mm.n + '</span><span>' + esc(mm.titulo) + '</span>' + (feito[k] ? '<span class="modulo-lateral__ok">' + IC.check + '</span>' : '') + '</a></li>').join('') + '</ol></aside></div>';
  }

  function telaRestrita() {
    return '<div class="cursos__estado"><span class="cursos__estado-icone">' + IC.cadeado + '</span>' +
      '<h1>Este curso não está disponível para a sua equipe</h1>' +
      '<p>Os cursos são organizados por equipe. Você só pode acessar os cursos da equipe à qual pertence. Se acredita que deveria ter acesso, fale com o administrador.</p>' +
      '<a class="btn-curso btn-curso--primario" href="' + url() + '" data-nav>Voltar para meus cursos</a></div>';
  }

  function telaVazia() {
    return '<div class="cursos__estado"><img class="cursos__estado-img" src="conteudo/cadastrado/cursos/img/estado-vazio.svg" alt="">' +
      '<h1>Nenhum curso disponível por enquanto</h1><p>Assim que a sua equipe tiver cursos cadastrados, eles vão aparecer aqui. Volte em breve!</p></div>';
  }

  // ---------- Roteamento ----------
  function renderizar() {
    const q = new URLSearchParams(location.search);
    const curso = CURSOS.find((c) => c.slug === q.get('curso'));
    const n = parseInt(q.get('modulo') || '0', 10);
    let html;
    if (curso && !podeVer(curso)) html = telaRestrita();
    else if (curso && n >= 1 && n <= 3) html = telaModulo(curso, n);
    else if (curso) html = telaDetalhe(curso);
    else html = telaLista();
    app.innerHTML = html;
    window.scrollTo(0, 0);
    ligar(curso, n);
  }

  function ligar(curso, n) {
    app.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
      if (visaoAdmin) filtroEquipe = b.dataset.filtro; else filtroStatus = b.dataset.filtro;
      app.innerHTML = telaLista();
      ligar();
    }));
    const btn = document.getElementById('btnConcluirModulo');
    if (btn && curso) btn.addEventListener('click', () => {
      const dados = lerSalvo();
      const atual = concluidos(curso);
      atual[n - 1] = true;
      dados[curso.slug] = atual;
      salvar(dados);
      // Vai para o próximo módulo; se era o último, volta ao detalhe do curso.
      irPara(n < 3 ? url({ curso: curso.slug, modulo: n + 1 }) : url({ curso: curso.slug }));
    });
  }

  function irPara(href) {
    history.pushState(null, '', href);
    renderizar();
  }

  app.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-nav]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    irPara(a.getAttribute('href'));
  });
  window.addEventListener('popstate', renderizar);

  renderizar();
})();
