// ============================================================
// CONTEÚDO — Agendar reunião (área CADASTRADO)
// Formulário de nova reunião + card "Detalhes da reunião" em tempo
// real. Fala com:
//   GET  api/reunioes/participantes.php  (pessoas para convidar)
//   POST api/reunioes/agendar.php        (cria a reunião)
//
// MODO DEMONSTRAÇÃO: se a lista de pessoas não carregar (ex.: o SQL
// database/reunioes.sql ainda não foi executado ou não há servidor
// PHP), a página usa pessoas fictícias, simula o envio e avisa na tela.
// Também dá para forçar com ?demo=1.
// ============================================================
(function () {
  'use strict';

  const raiz = document.getElementById('reuRaiz');
  if (!raiz) return;

  const csrf = raiz.getAttribute('data-csrf') || '';
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------
  // Dados fixos (mesmos do menu lateral e de api/reunioes/_bootstrap.php)
  // ------------------------------------------------------------
  const ICONES = {"calendar": "<svg class=\"reuniao__icone\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"4\" y=\"5.5\" width=\"16\" height=\"15\" rx=\"1.5\"/><path d=\"M4 9.5h16M8 3.5v3M16 3.5v3\"/></svg>", "clock": "<svg class=\"reuniao__icone\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5V12l3 2\"/></svg>", "globe": "<svg class=\"reuniao__icone\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z\"/></svg>", "users": "<svg class=\"reuniao__icone\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"9\" cy=\"8\" r=\"3\"/><path d=\"M3 20c.6-3.6 3-5.5 6-5.5s5.4 1.9 6 5.5\"/><circle cx=\"17\" cy=\"9\" r=\"2.2\"/><path d=\"M15.5 14.2c2.2.3 3.7 1.9 4.1 4.3\"/></svg>", "user-plus": "<svg class=\"reuniao__icone\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"10\" cy=\"8\" r=\"3.5\"/><path d=\"M3.5 20c.6-3.4 3.2-5.5 6.5-5.5\"/><path d=\"M18 9v6M15 12h6\"/></svg>", "chevron": "<svg class=\"reuniao__icone\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M6 9l6 6 6-6\"/></svg>", "chevron-left": "<svg class=\"reuniao__icone\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M15 6l-6 6 6 6\"/></svg>", "chevron-right": "<svg class=\"reuniao__icone\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M9 6l6 6-6 6\"/></svg>", "repeat": "<svg class=\"reuniao__icone\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4\"/></svg>", "x": "<svg class=\"reuniao__icone\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M6 6l12 12M18 6L6 18\"/></svg>", "search": "<svg class=\"reuniao__icone\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M21 21l-4.35-4.35\"/></svg>", "doc": "<svg class=\"reuniao__icone\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M7 3.5h7l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1v-16a1 1 0 011-1z\"/><path d=\"M9 12.5h6M9 16h6\"/></svg>", "alert": "<svg class=\"reuniao__icone\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 8v5M12 16h.01\"/></svg>", "check": "<svg class=\"reuniao__icone\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M5 12.5l4.5 4.5L19 7.5\"/></svg>"};

  const EQUIPES = [
    { valor: 'geral', nome: 'Geral', cor: '#16A34A' },
    { valor: 'projetos', nome: 'Projetos', cor: '#3B82F6' },
    { valor: 'marketing', nome: 'Marketing', cor: '#F59E0B' },
    { valor: 'rh', nome: 'RH', cor: '#8B5CF6' },
    { valor: 'financeiro', nome: 'Financeiro', cor: '#EC4899' },
    { valor: 'ti', nome: 'TI', cor: '#06B6D4' },
    { valor: 'sac', nome: 'SAC / Ouvidoria', cor: '#EF4444' },
  ];

  const FUSOS = [
    { valor: 'America/Sao_Paulo', nome: '(GMT-03:00) Brasília' },
    { valor: 'America/Noronha', nome: '(GMT-02:00) Fernando de Noronha' },
    { valor: 'America/Manaus', nome: '(GMT-04:00) Manaus' },
    { valor: 'America/Cuiaba', nome: '(GMT-04:00) Cuiabá' },
    { valor: 'America/Rio_Branco', nome: '(GMT-05:00) Rio Branco' },
    { valor: 'America/Argentina/Buenos_Aires', nome: '(GMT-03:00) Buenos Aires' },
    { valor: 'America/Santiago', nome: '(GMT-04:00) Santiago' },
    { valor: 'America/Bogota', nome: '(GMT-05:00) Bogotá' },
    { valor: 'America/Mexico_City', nome: '(GMT-06:00) Cidade do México' },
    { valor: 'America/New_York', nome: '(GMT-05:00) Nova York' },
    { valor: 'America/Los_Angeles', nome: '(GMT-08:00) Los Angeles' },
    { valor: 'UTC', nome: '(GMT+00:00) UTC' },
    { valor: 'Europe/Lisbon', nome: '(GMT+00:00) Lisboa' },
    { valor: 'Europe/London', nome: '(GMT+00:00) Londres' },
    { valor: 'Europe/Madrid', nome: '(GMT+01:00) Madri' },
    { valor: 'Europe/Paris', nome: '(GMT+01:00) Paris' },
    { valor: 'Asia/Dubai', nome: '(GMT+04:00) Dubai' },
    { valor: 'Asia/Kolkata', nome: '(GMT+05:30) Nova Délhi' },
    { valor: 'Asia/Shanghai', nome: '(GMT+08:00) Xangai' },
    { valor: 'Asia/Tokyo', nome: '(GMT+09:00) Tóquio' },
  ];

  const FREQUENCIAS = [
    { valor: 'diaria', nome: 'Diariamente' },
    { valor: 'semanal', nome: 'Semanalmente' },
    { valor: 'mensal', nome: 'Mensalmente' },
    { valor: 'personalizada', nome: 'Personalizado' },
  ];

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const DIAS_LETRA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const DIAS_NOME = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
    'Quinta-feira', 'Sexta-feira', 'Sábado'];

  const LIMITE_DESCRICAO = 1000;

  // Pessoas fictícias do modo demonstração
  const PESSOAS_DEMO = [
    { id: 9001, nome: 'Ana Souza', cargo: 'Coordenador', equipe_slug: 'marketing', equipe: 'Marketing' },
    { id: 9002, nome: 'Carlos Silva', cargo: 'Gerente', equipe_slug: 'projetos', equipe: 'Projetos' },
    { id: 9003, nome: 'Lucas Pereira', cargo: 'Funcionário', equipe_slug: 'ti', equipe: 'TI' },
    { id: 9004, nome: 'Mariana Lima', cargo: 'Supervisor', equipe_slug: 'rh', equipe: 'RH' },
    { id: 9005, nome: 'Rafael Costa', cargo: 'Funcionário', equipe_slug: 'financeiro', equipe: 'Financeiro' },
    { id: 9006, nome: 'Juliana Martins', cargo: 'Coordenador', equipe_slug: 'geral', equipe: 'Geral' },
    { id: 9007, nome: 'Pedro Alves', cargo: 'Estagiário', equipe_slug: 'geral', equipe: 'Geral' },
    { id: 9008, nome: 'Fernanda Rocha', cargo: 'Diretor', equipe_slug: 'sac', equipe: 'SAC / Ouvidoria' },
  ].map((p) => Object.assign({ iniciais: iniciais(p.nome) }, p));

  // ------------------------------------------------------------
  // Utilitários
  // ------------------------------------------------------------
  function pad(n) { return String(n).padStart(2, '0'); }

  function iniciais(nome) {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    const a = partes[0][0].toUpperCase();
    return partes.length === 1 ? a : a + partes[partes.length - 1][0].toUpperCase();
  }

  function norm(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }

  function icone(nome, classe) {
    const t = document.createElement('template');
    t.innerHTML = ICONES[nome];
    const s = t.content.firstElementChild;
    if (classe) s.setAttribute('class', classe);
    return s;
  }

  // Datas como texto "AAAA-MM-DD" (sem fuso: é só o dia do calendário)
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function deIso(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  function hojeIso() { return iso(new Date()); }
  function br(s) { const d = deIso(s); return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : ''; }
  function extenso(s) {
    const d = deIso(s);
    return d ? d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear() : '';
  }

  // "9", "930", "0930", "9:30" -> "09:30"; devolve null se inválido, '' se vazio
  function normalizarHora(v) {
    const d = String(v || '').replace(/\D/g, '');
    if (!d) return '';
    let h; let m;
    if (d.length <= 2) { h = Number(d); m = 0; }
    else if (d.length === 3) { h = Number(d[0]); m = Number(d.slice(1)); }
    else { h = Number(d.slice(0, 2)); m = Number(d.slice(2, 4)); }
    if (h > 23 || m > 59) return null;
    return pad(h) + ':' + pad(m);
  }

  // ------------------------------------------------------------
  // Estado do formulário
  // ------------------------------------------------------------
  function estadoInicial() {
    return {
      titulo: '',
      data: hojeIso(),
      inicio: '09:00',
      fim: '10:00',
      fuso: 'America/Sao_Paulo',
      equipe: 'geral',
      participantes: [],
      descricao: '',
      repetir: false,
      frequencia: 'semanal',
      dias: [],
      termino: 'nunca',
      terminoData: '',
      ocorrencias: 10,
    };
  }

  let estado = estadoInicial();
  let modoDemo = new URLSearchParams(location.search).get('demo') === '1';
  let enviando = false;

  // ------------------------------------------------------------
  // Referências do DOM
  // ------------------------------------------------------------
  const refs = {
    form: $('reuForm'),
    aviso: $('reuAviso'),
    titulo: $('reuTitulo'),
    dataBtn: $('reuDataBtn'),
    dataTxt: $('reuDataTxt'),
    dataWrap: $('reuDataWrap'),
    cal: $('reuCal'),
    inicio: $('reuInicio'),
    fim: $('reuFim'),
    inicioWrap: $('reuInicioWrap'),
    fimWrap: $('reuFimWrap'),
    inicioLista: $('reuInicioLista'),
    fimLista: $('reuFimLista'),
    chips: $('reuChips'),
    sugestao: $('reuSugestao'),
    descricao: $('reuDescricao'),
    contador: $('reuContador'),
    repetir: $('reuRepetir'),
    rec: $('reuRec'),
    dias: $('reuDias'),
    diasGrupo: $('reuDiasGrupo'),
    terminoData: $('reuTerminoData'),
    ocorrencias: $('reuOcorrencias'),
    btnAgendar: $('reuBtnAgendar'),
    btnCancelar: $('reuBtnCancelar'),
    resData: $('reuResData'),
    resHorario: $('reuResHorario'),
    resPessoas: $('reuResPessoas'),
    resEquipe: $('reuResEquipe'),
    resDescricao: $('reuResDescricao'),
    toasts: $('reuToasts'),
    dlgPessoas: $('reuDlgPessoas'),
    buscaPessoas: $('reuBuscaPessoas'),
    listaPessoas: $('reuListaPessoas'),
    contagemPessoas: $('reuContagemPessoas'),
    dlgDescartar: $('reuDlgDescartar'),
  };

  // ------------------------------------------------------------
  // Erros de validação (ícone + texto, nunca só cor)
  // ------------------------------------------------------------
  const CAMPO_FOCO = {
    titulo: () => refs.titulo,
    data: () => refs.dataBtn,
    horario: () => refs.inicio,
    fuso: () => selFuso.botao,
    equipe: () => selEquipe.botao,
    participantes: () => refs.chips.querySelector('.reuniao__chip-add'),
    descricao: () => refs.descricao,
    recorrencia: () => selFreq.botao,
    recorrencia_dias: () => refs.dias.querySelector('button'),
    recorrencia_termino: () => raiz.querySelector('input[name="reuTermino"]:checked'),
  };

  // Campo do servidor -> nome do bloco de erro na tela
  const MAPA_ERRO = { inicio: 'horario', fim: 'horario' };

  function marcarInvalido(nome, sim) {
    const alvo = {
      titulo: [refs.titulo],
      data: [refs.dataBtn],
      horario: [refs.inicio.parentElement, refs.fim.parentElement],
      fuso: [selFuso.botao],
      equipe: [selEquipe.botao],
      descricao: [refs.descricao],
      recorrencia: [selFreq.botao],
    }[nome] || [];
    alvo.forEach((e) => {
      if (!e) return;
      if (e === refs.titulo || e === refs.descricao) {
        if (sim) e.setAttribute('aria-invalid', 'true'); else e.removeAttribute('aria-invalid');
      } else {
        e.classList.toggle('is-invalido', sim);
      }
    });
    if (nome === 'horario') {
      [refs.inicio, refs.fim].forEach((i) => {
        if (sim) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
      });
    }
  }

  function mostrarErro(nome, mensagem) {
    nome = MAPA_ERRO[nome] || nome;
    const p = $('reuErro_' + nome);
    if (!p) return;
    p.querySelector('span').textContent = mensagem;
    p.hidden = false;
    marcarInvalido(nome, true);
  }

  function limparErro(nome) {
    const p = $('reuErro_' + nome);
    if (!p) return;
    p.hidden = true;
    marcarInvalido(nome, false);
  }

  function limparErros() {
    Object.keys(CAMPO_FOCO).forEach(limparErro);
  }

  // ------------------------------------------------------------
  // Popovers: só um aberto por vez, fecha ao clicar fora / Esc
  // ------------------------------------------------------------
  function fecharPopovers(exceto) {
    raiz.querySelectorAll('.reuniao__popwrap').forEach((w) => {
      if (w === exceto) return;
      const pop = w.querySelector('.reuniao__pop');
      if (pop && !pop.hidden) {
        pop.hidden = true;
        const gatilho = w.querySelector('[aria-expanded]');
        if (gatilho) gatilho.setAttribute('aria-expanded', 'false');
      }
    });
  }

  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.reuniao__popwrap')) fecharPopovers(null);
  });

  raiz.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const aberto = raiz.querySelector('.reuniao__popwrap .reuniao__pop:not([hidden])');
    if (!aberto) return;
    e.stopPropagation();
    const wrap = aberto.closest('.reuniao__popwrap');
    fecharPopovers(null);
    const g = wrap.querySelector('button[aria-expanded]') || wrap.querySelector('input');
    if (g) g.focus();
  });

  // ------------------------------------------------------------
  // Dropdown (select customizado com ponto colorido e busca opcional)
  // ------------------------------------------------------------
  function criarSelect(wrapId, cfg) {
    const wrap = $(wrapId);
    const botao = wrap.querySelector('button');
    const pop = wrap.querySelector('.reuniao__pop');
    const texto = wrap.querySelector('.reuniao__valor');
    const ul = el('ul', 'reuniao__lista');
    ul.setAttribute('role', 'listbox');
    let busca = null;
    let filtro = '';
    let valor = cfg.valor;

    if (cfg.buscavel) {
      busca = el('input', 'reuniao__pop-busca');
      busca.type = 'search';
      busca.placeholder = 'Buscar...';
      busca.setAttribute('aria-label', 'Buscar');
      pop.appendChild(busca);
      busca.addEventListener('input', () => { filtro = busca.value; render(); });
    }
    pop.appendChild(ul);

    function nomeDe(v) {
      const o = cfg.opcoes.find((x) => x.valor === v);
      return o ? o.nome : '';
    }

    function render() {
      ul.textContent = '';
      const lista = cfg.opcoes.filter((o) => !filtro || norm(o.nome).includes(norm(filtro)));
      if (!lista.length) {
        const vazio = el('li', 'reuniao__opcao reuniao__opcao--vazia', 'Nenhum resultado');
        ul.appendChild(vazio);
        return;
      }
      lista.forEach((o) => {
        const li = el('li', 'reuniao__opcao');
        li.setAttribute('role', 'option');
        li.tabIndex = -1;
        li.dataset.valor = o.valor;
        li.setAttribute('aria-selected', String(o.valor === valor));
        if (o.cor) {
          const ponto = el('span', 'reuniao__opcao-ponto');
          ponto.style.background = o.cor;
          li.appendChild(ponto);
        }
        li.appendChild(el('span', null, o.nome));
        ul.appendChild(li);
      });
    }

    function abrir() {
      fecharPopovers(wrap);
      filtro = '';
      if (busca) busca.value = '';
      render();
      pop.hidden = false;
      botao.setAttribute('aria-expanded', 'true');
      const sel = ul.querySelector('[aria-selected="true"]');
      if (busca) { busca.focus(); }
      else if (sel) { sel.focus(); }
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }

    function fechar(focar) {
      pop.hidden = true;
      botao.setAttribute('aria-expanded', 'false');
      if (focar) botao.focus();
    }

    function escolher(v) {
      valor = v;
      texto.textContent = nomeDe(v);
      fechar(true);
      if (cfg.aoMudar) cfg.aoMudar(v);
    }

    botao.addEventListener('click', () => { if (pop.hidden) abrir(); else fechar(false); });
    botao.addEventListener('keydown', (e) => {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && pop.hidden) { e.preventDefault(); abrir(); }
    });

    ul.addEventListener('click', (e) => {
      const li = e.target.closest('.reuniao__opcao[data-valor]');
      if (li) escolher(li.dataset.valor);
    });

    pop.addEventListener('keydown', (e) => {
      const itens = Array.from(ul.querySelectorAll('.reuniao__opcao[data-valor]'));
      const i = itens.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        (itens[i + 1] || itens[0] || botao).focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (i <= 0 && busca) busca.focus(); else (itens[i - 1] || itens[itens.length - 1]).focus();
      } else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) {
        e.preventDefault();
        escolher(itens[i].dataset.valor);
      } else if (e.key === 'Enter' && busca && document.activeElement === busca && itens.length) {
        e.preventDefault();
        escolher(itens[0].dataset.valor);
      }
    });

    texto.textContent = nomeDe(valor);

    return {
      botao,
      definir(v) { valor = v; texto.textContent = nomeDe(v); },
    };
  }

  const selFuso = criarSelect('reuSelFuso', {
    opcoes: FUSOS, valor: estado.fuso, buscavel: true,
    aoMudar(v) { estado.fuso = v; limparErro('fuso'); },
  });

  const selEquipe = criarSelect('reuSelEquipe', {
    opcoes: EQUIPES, valor: estado.equipe, buscavel: false,
    aoMudar(v) { estado.equipe = v; limparErro('equipe'); renderResumo(); sugerirEquipe(); },
  });

  const selFreq = criarSelect('reuSelFreq', {
    opcoes: FREQUENCIAS, valor: estado.frequencia, buscavel: false,
    aoMudar(v) {
      estado.frequencia = v;
      limparErro('recorrencia');
      if ((v === 'semanal' || v === 'personalizada') && !estado.dias.length) {
        estado.dias = [deIso(estado.data).getDay()];
      }
      renderRecorrencia();
    },
  });

  // ------------------------------------------------------------
  // Título e descrição
  // ------------------------------------------------------------
  refs.titulo.addEventListener('input', () => {
    estado.titulo = refs.titulo.value;
    if (refs.titulo.value.trim()) limparErro('titulo');
  });

  function atualizarContador() {
    const n = refs.descricao.value.length;
    refs.contador.textContent = n + '/' + LIMITE_DESCRICAO;
    refs.contador.classList.toggle('is-limite', n >= LIMITE_DESCRICAO);
  }

  refs.descricao.addEventListener('input', () => {
    estado.descricao = refs.descricao.value;
    atualizarContador();
    limparErro('descricao');
    renderResumo();
  });

  // ------------------------------------------------------------
  // Datepicker
  // ------------------------------------------------------------
  let calMes = null; // Date no dia 1 do mês exibido

  function abrirCal() {
    fecharPopovers(refs.dataWrap);
    const d = deIso(estado.data) || new Date();
    calMes = new Date(d.getFullYear(), d.getMonth(), 1);
    renderCal();
    refs.cal.hidden = false;
    refs.dataBtn.setAttribute('aria-expanded', 'true');
    const foco = refs.cal.querySelector('.is-selecionado') || refs.cal.querySelector('.reuniao__cal-dia:not(:disabled)');
    if (foco) foco.focus();
  }

  function fecharCal(focar) {
    refs.cal.hidden = true;
    refs.dataBtn.setAttribute('aria-expanded', 'false');
    if (focar) refs.dataBtn.focus();
  }

  function escolherData(s) {
    estado.data = s;
    limparErro('data');
    fecharCal(true);
    atualizarData();
    // Semanal sem dia marcado: acompanha o dia da nova data
    if (estado.repetir && estado.dias.length === 0) renderRecorrencia();
    renderResumo();
  }

  function renderCal() {
    const hoje = hojeIso();
    const ano = calMes.getFullYear();
    const mes = calMes.getMonth();
    const primeiro = new Date(ano, mes, 1);
    const totalDias = new Date(ano, mes + 1, 0).getDate();
    const hojeD = deIso(hoje);
    const noPassado = ano < hojeD.getFullYear() || (ano === hojeD.getFullYear() && mes <= hojeD.getMonth());

    refs.cal.textContent = '';

    const topo = el('div', 'reuniao__cal-topo');
    const ant = el('button', 'reuniao__cal-nav');
    ant.type = 'button';
    ant.setAttribute('aria-label', 'Mês anterior');
    ant.disabled = noPassado;
    ant.appendChild(icone('chevron-left'));
    ant.addEventListener('click', () => { calMes = new Date(ano, mes - 1, 1); renderCal(); focarNav(0); });
    const tit = el('span', 'reuniao__cal-titulo', MESES[mes].charAt(0).toUpperCase() + MESES[mes].slice(1) + ' de ' + ano);
    tit.setAttribute('aria-live', 'polite');
    const prox = el('button', 'reuniao__cal-nav');
    prox.type = 'button';
    prox.setAttribute('aria-label', 'Próximo mês');
    prox.appendChild(icone('chevron-right'));
    prox.addEventListener('click', () => { calMes = new Date(ano, mes + 1, 1); renderCal(); focarNav(1); });
    topo.append(ant, tit, prox);
    refs.cal.appendChild(topo);

    const grade = el('div', 'reuniao__cal-grade');
    DIAS_LETRA.forEach((l, i) => {
      const s = el('span', 'reuniao__cal-sem', l);
      s.setAttribute('title', DIAS_NOME[i]);
      grade.appendChild(s);
    });
    for (let i = 0; i < primeiro.getDay(); i++) grade.appendChild(el('span'));
    for (let dia = 1; dia <= totalDias; dia++) {
      const s = ano + '-' + pad(mes + 1) + '-' + pad(dia);
      const b = el('button', 'reuniao__cal-dia', String(dia));
      b.type = 'button';
      b.setAttribute('aria-label', extenso(s));
      if (s < hoje) b.disabled = true;
      if (s === hoje) b.classList.add('is-hoje');
      if (s === estado.data) { b.classList.add('is-selecionado'); b.setAttribute('aria-pressed', 'true'); }
      b.addEventListener('click', () => escolherData(s));
      grade.appendChild(b);
    }
    refs.cal.appendChild(grade);

    const rodape = el('div', 'reuniao__cal-rodape');
    const bHoje = el('button', 'reuniao__cal-hoje', 'Hoje');
    bHoje.type = 'button';
    bHoje.addEventListener('click', () => escolherData(hoje));
    rodape.appendChild(bHoje);
    refs.cal.appendChild(rodape);
  }

  function focarNav(qual) {
    const navs = refs.cal.querySelectorAll('.reuniao__cal-nav');
    const alvo = navs[qual];
    if (alvo && !alvo.disabled) alvo.focus(); else if (navs[1]) navs[1].focus();
  }

  refs.dataBtn.addEventListener('click', () => { if (refs.cal.hidden) abrirCal(); else fecharCal(false); });
  refs.dataBtn.addEventListener('keydown', (e) => {
    if ((e.key === 'ArrowDown') && refs.cal.hidden) { e.preventDefault(); abrirCal(); }
  });

  function atualizarData() {
    refs.dataTxt.textContent = br(estado.data);
  }

  // ------------------------------------------------------------
  // Horários (digitar ou escolher na lista de 30 em 30 min)
  // ------------------------------------------------------------
  const HORARIOS = [];
  for (let h = 0; h < 24; h++) {
    HORARIOS.push(pad(h) + ':00');
    HORARIOS.push(pad(h) + ':30');
  }

  function montarHorarios(campo, wrap, ul, chave) {
    HORARIOS.forEach((h) => {
      const li = el('li', 'reuniao__opcao', h);
      li.setAttribute('role', 'option');
      li.tabIndex = -1;
      li.dataset.valor = h;
      ul.appendChild(li);
    });

    function marcarSelecionado() {
      let sel = null;
      ul.querySelectorAll('.reuniao__opcao').forEach((li) => {
        const on = li.dataset.valor === estado[chave];
        li.setAttribute('aria-selected', String(on));
        if (on) sel = li;
      });
      return sel;
    }

    function abrir() {
      fecharPopovers(wrap);
      const sel = marcarSelecionado();
      ul.hidden = false;
      if (sel) ul.scrollTop = Math.max(0, sel.offsetTop - 80);
    }

    campo.addEventListener('focus', abrir);
    campo.addEventListener('click', () => { if (ul.hidden) abrir(); });

    campo.addEventListener('input', () => {
      let d = campo.value.replace(/\D/g, '').slice(0, 4);
      campo.value = d.length > 2 ? d.slice(0, 2) + ':' + d.slice(2) : d;
      const n = normalizarHora(campo.value);
      if (n && campo.value.length === 5) {
        estado[chave] = n;
        validarHorario(false);
        renderResumo();
      }
    });

    campo.addEventListener('blur', () => {
      // Espera o clique numa opção da lista antes de "confirmar" o texto digitado
      setTimeout(() => confirmarCampo(campo, chave), 120);
    });

    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirmarCampo(campo, chave); ul.hidden = true; }
      if (e.key === 'ArrowDown' && ul.hidden) abrir();
      if (e.key === 'ArrowDown' && !ul.hidden) {
        e.preventDefault();
        const sel = ul.querySelector('[aria-selected="true"]') || ul.firstElementChild;
        if (sel) sel.focus();
      }
    });

    ul.addEventListener('mousedown', (e) => e.preventDefault()); // não tira o foco do input
    ul.addEventListener('click', (e) => {
      const li = e.target.closest('.reuniao__opcao[data-valor]');
      if (!li) return;
      estado[chave] = li.dataset.valor;
      campo.value = li.dataset.valor;
      ul.hidden = true;
      if (chave === 'inicio') ajustarFim();
      validarHorario(false);
      renderResumo();
    });

    ul.addEventListener('keydown', (e) => {
      const itens = Array.from(ul.querySelectorAll('.reuniao__opcao'));
      const i = itens.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (itens[i + 1] || itens[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (itens[i - 1] || itens[itens.length - 1]).focus(); }
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (i >= 0) itens[i].click();
      }
    });
  }

  function confirmarCampo(campo, chave) {
    const n = normalizarHora(campo.value);
    if (n === null) {
      mostrarErro('horario', 'Informe um horário válido');
      return;
    }
    if (n === '') {
      campo.value = estado[chave];
    } else {
      estado[chave] = n;
      campo.value = n;
      if (chave === 'inicio') ajustarFim();
    }
    validarHorario(true);
    renderResumo();
  }

  // Ao mudar o início para depois do fim, empurra o fim para +1h (como agendas em geral)
  function ajustarFim() {
    if (estado.fim > estado.inicio) return;
    const [h, m] = estado.inicio.split(':').map(Number);
    if (h >= 23) return; // sem espaço: deixa o erro de validação aparecer
    estado.fim = pad(h + 1) + ':' + pad(m);
    refs.fim.value = estado.fim;
  }

  function validarHorario(mostrar) {
    if (estado.fim <= estado.inicio) {
      if (mostrar || !$('reuErro_horario').hidden) mostrarErro('horario', 'O horário final deve ser depois do inicial');
      return false;
    }
    limparErro('horario');
    return true;
  }

  montarHorarios(refs.inicio, refs.inicioWrap, refs.inicioLista, 'inicio');
  montarHorarios(refs.fim, refs.fimWrap, refs.fimLista, 'fim');

  // ------------------------------------------------------------
  // Participantes
  // ------------------------------------------------------------
  function avatar(p, tam) {
    return el('span', 'reuniao__avatar' + (tam ? ' reuniao__avatar--' + tam : ''), p.iniciais || iniciais(p.nome));
  }

  function renderChips() {
    refs.chips.textContent = '';
    estado.participantes.forEach((p) => {
      const chip = el('span', 'reuniao__chip');
      chip.setAttribute('role', 'listitem');
      chip.appendChild(avatar(p, '28'));
      chip.appendChild(el('span', null, p.nome));
      const x = el('button', 'reuniao__chip-remover');
      x.type = 'button';
      x.setAttribute('aria-label', 'Remover ' + p.nome);
      x.appendChild(icone('x'));
      x.addEventListener('click', () => {
        estado.participantes = estado.participantes.filter((q) => q.id !== p.id);
        renderChips();
        renderResumo();
        sugerirEquipe();
        const prox = refs.chips.querySelector('.reuniao__chip-remover') || refs.chips.querySelector('.reuniao__chip-add');
        if (prox) prox.focus();
      });
      chip.appendChild(x);
      refs.chips.appendChild(chip);
    });

    const add = el('button', 'reuniao__chip-add');
    add.type = 'button';
    add.appendChild(icone('user-plus'));
    add.appendChild(el('span', null, 'Adicionar participante'));
    add.addEventListener('click', abrirModalPessoas);
    refs.chips.appendChild(add);
  }

  // --- busca de pessoas (API ou demonstração) ---
  async function buscarPessoas(params) {
    if (!modoDemo) {
      try {
        const qs = new URLSearchParams(params).toString();
        const res = await fetch('api/reunioes/participantes.php' + (qs ? '?' + qs : ''), {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        });
        if (res.status === 401) {
          toast('Sua sessão expirou. Entre novamente para continuar.', 'erro');
          return [];
        }
        const json = await res.json();
        if (!res.ok || !json.sucesso) throw new Error(json.erro || 'Falha');
        return json.pessoas;
      } catch (err) {
        ativarDemo();
      }
    }
    const q = norm(params.q || '');
    return PESSOAS_DEMO.filter((p) =>
      (!q || norm(p.nome).includes(q)) && (!params.equipe || p.equipe_slug === params.equipe));
  }

  function ativarDemo() {
    modoDemo = true;
    refs.aviso.hidden = false;
  }

  // --- modal "Adicionar participante" ---
  let selecionados = new Map();
  let timerBusca = null;
  let ultimaBusca = 0;

  function abrirModalPessoas() {
    selecionados = new Map(estado.participantes.map((p) => [p.id, p]));
    refs.buscaPessoas.value = '';
    atualizarContagemPessoas();
    refs.dlgPessoas.showModal();
    carregarLista('');
    refs.buscaPessoas.focus();
  }

  async function carregarLista(q) {
    const id = ++ultimaBusca;
    refs.listaPessoas.textContent = '';
    refs.listaPessoas.appendChild(el('li', 'reuniao__pessoa reuniao__pessoas-vazio', 'Carregando...'));
    const pessoas = await buscarPessoas({ q, limite: 50 });
    if (id !== ultimaBusca) return; // chegou uma busca mais nova
    refs.listaPessoas.textContent = '';
    if (!pessoas.length) {
      refs.listaPessoas.appendChild(el('li', 'reuniao__pessoa reuniao__pessoas-vazio',
        q ? 'Nenhuma pessoa encontrada.' : 'Nenhuma pessoa disponível para convidar.'));
      return;
    }
    pessoas.forEach((p) => {
      const li = el('li', 'reuniao__pessoa');
      const label = el('label', 'reuniao__pessoa');
      label.style.flex = '1';
      label.style.padding = '0';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selecionados.has(p.id);
      cb.addEventListener('change', () => {
        if (cb.checked) selecionados.set(p.id, p); else selecionados.delete(p.id);
        atualizarContagemPessoas();
      });
      const info = el('span', 'reuniao__pessoa-info');
      info.appendChild(el('span', 'reuniao__pessoa-nome', p.nome));
      const meta = [p.cargo, p.equipe].filter(Boolean).join(' · ');
      if (meta) info.appendChild(el('span', 'reuniao__pessoa-meta', meta));
      label.append(cb, avatar(p, '32'), info);
      li.appendChild(label);
      refs.listaPessoas.appendChild(li);
    });
  }

  function atualizarContagemPessoas() {
    const n = selecionados.size;
    refs.contagemPessoas.textContent = n === 0 ? 'Nenhuma pessoa selecionada'
      : n === 1 ? '1 pessoa selecionada' : n + ' pessoas selecionadas';
  }

  refs.buscaPessoas.addEventListener('input', () => {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(() => carregarLista(refs.buscaPessoas.value.trim()), 250);
  });

  $('reuPessoasAdicionar').addEventListener('click', () => {
    estado.participantes = Array.from(selecionados.values());
    limparErro('participantes');
    refs.dlgPessoas.close();
    renderChips();
    renderResumo();
    sugerirEquipe();
    const add = refs.chips.querySelector('.reuniao__chip-add');
    if (add) add.focus();
  });

  function fecharModalPessoas() {
    refs.dlgPessoas.close();
    const add = refs.chips.querySelector('.reuniao__chip-add');
    if (add) add.focus();
  }
  $('reuPessoasCancelar').addEventListener('click', fecharModalPessoas);
  $('reuDlgPessoasFechar').addEventListener('click', fecharModalPessoas);

  // Clique no fundo escuro fecha o diálogo
  [refs.dlgPessoas, refs.dlgDescartar].forEach((dlg) => {
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  });

  // --- sugestão: membros da equipe escolhida ---
  let sugestaoPessoas = [];
  let idSugestao = 0;

  async function sugerirEquipe() {
    const id = ++idSugestao;
    const equipe = EQUIPES.find((e) => e.valor === estado.equipe);
    const pessoas = await buscarPessoas({ equipe: estado.equipe, limite: 100 });
    if (id !== idSugestao) return;
    const jaTem = new Set(estado.participantes.map((p) => p.id));
    sugestaoPessoas = pessoas.filter((p) => !jaTem.has(p.id));
    if (!sugestaoPessoas.length) { refs.sugestao.hidden = true; return; }
    const n = sugestaoPessoas.length;
    refs.sugestao.textContent = '+ Adicionar ' + (n === 1 ? '1 membro' : n + ' membros') + ' da equipe ' + equipe.nome;
    refs.sugestao.hidden = false;
  }

  refs.sugestao.addEventListener('click', () => {
    const jaTem = new Set(estado.participantes.map((p) => p.id));
    sugestaoPessoas.forEach((p) => { if (!jaTem.has(p.id)) estado.participantes.push(p); });
    limparErro('participantes');
    renderChips();
    renderResumo();
    sugerirEquipe();
  });

  // ------------------------------------------------------------
  // Repetir reunião
  // ------------------------------------------------------------
  function montarDias() {
    refs.dias.textContent = '';
    DIAS_LETRA.forEach((l, i) => {
      const b = el('button', 'reuniao__dia', l);
      b.type = 'button';
      b.setAttribute('aria-label', DIAS_NOME[i]);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        const idx = estado.dias.indexOf(i);
        if (idx >= 0) estado.dias.splice(idx, 1); else estado.dias.push(i);
        estado.dias.sort();
        limparErro('recorrencia_dias');
        renderRecorrencia();
      });
      refs.dias.appendChild(b);
    });
  }

  function renderRecorrencia() {
    refs.rec.hidden = !estado.repetir;
    refs.repetir.setAttribute('aria-expanded', String(estado.repetir));
    const mostraDias = estado.frequencia === 'semanal' || estado.frequencia === 'personalizada';
    refs.diasGrupo.hidden = !mostraDias;
    refs.dias.querySelectorAll('.reuniao__dia').forEach((b, i) => {
      b.setAttribute('aria-pressed', String(estado.dias.includes(i)));
    });
    refs.terminoData.disabled = estado.termino !== 'data';
    refs.ocorrencias.disabled = estado.termino !== 'ocorrencias';
  }

  refs.repetir.addEventListener('change', () => {
    estado.repetir = refs.repetir.checked;
    if (estado.repetir && !estado.dias.length && (estado.frequencia === 'semanal' || estado.frequencia === 'personalizada')) {
      estado.dias = [deIso(estado.data).getDay()];
    }
    renderRecorrencia();
  });

  raiz.querySelectorAll('input[name="reuTermino"]').forEach((r) => {
    r.addEventListener('change', () => {
      estado.termino = r.value;
      limparErro('recorrencia_termino');
      renderRecorrencia();
      if (r.value === 'data') refs.terminoData.focus();
      if (r.value === 'ocorrencias') refs.ocorrencias.focus();
    });
  });

  refs.terminoData.min = hojeIso();
  refs.terminoData.addEventListener('input', () => { estado.terminoData = refs.terminoData.value; limparErro('recorrencia_termino'); });
  refs.ocorrencias.addEventListener('input', () => { estado.ocorrencias = Number(refs.ocorrencias.value) || 0; limparErro('recorrencia_termino'); });

  // ------------------------------------------------------------
  // Card "Detalhes da reunião" (tempo real)
  // ------------------------------------------------------------
  function definirValor(elemento, texto, vazio) {
    const tem = Boolean(texto && texto.trim());
    elemento.textContent = tem ? texto : vazio;
    elemento.classList.toggle('is-vazio', !tem);
  }

  function renderResumo() {
    definirValor(refs.resData, extenso(estado.data), 'Selecione uma data');
    definirValor(refs.resHorario, estado.inicio && estado.fim ? estado.inicio + ' – ' + estado.fim : '', 'Defina o horário');

    const equipe = EQUIPES.find((e) => e.valor === estado.equipe);
    refs.resEquipe.textContent = equipe ? equipe.nome : '';

    definirValor(refs.resDescricao, estado.descricao, 'Sem descrição');

    refs.resPessoas.textContent = '';
    const lista = estado.participantes;
    if (!lista.length) {
      const li = el('li', 'reuniao__res-pessoa');
      li.appendChild(el('span', 'reuniao__item-valor is-vazio', 'Nenhum participante'));
      refs.resPessoas.appendChild(li);
      return;
    }
    lista.slice(0, 3).forEach((p) => {
      const li = el('li', 'reuniao__res-pessoa');
      li.appendChild(avatar(p, '32'));
      li.appendChild(el('span', null, p.nome));
      refs.resPessoas.appendChild(li);
    });
    if (lista.length > 3) {
      const mais = lista.length - 3;
      const li = el('li', 'reuniao__res-pessoa');
      li.appendChild(el('span', 'reuniao__avatar reuniao__avatar--32 reuniao__avatar--mais', '+' + mais));
      li.appendChild(el('span', null, '+' + mais + (mais === 1 ? ' participante' : ' participantes')));
      refs.resPessoas.appendChild(li);
    }
  }

  // ------------------------------------------------------------
  // Toasts
  // ------------------------------------------------------------
  function toast(mensagem, tipo, acao) {
    const t = el('div', 'reuniao__toast' + (tipo === 'erro' ? ' reuniao__toast--erro' : ''));
    t.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    t.appendChild(el('span', 'reuniao__toast-texto', mensagem));
    if (acao) {
      const a = el('a', 'reuniao__toast-acao', acao.texto);
      a.href = acao.href;
      t.appendChild(a);
    }
    const x = el('button', 'reuniao__toast-fechar');
    x.type = 'button';
    x.setAttribute('aria-label', 'Fechar aviso');
    x.appendChild(icone('x'));
    x.addEventListener('click', () => t.remove());
    t.appendChild(x);
    refs.toasts.appendChild(t);
    setTimeout(() => t.remove(), tipo === 'erro' ? 8000 : 6000);
  }

  // ------------------------------------------------------------
  // Validação + envio
  // ------------------------------------------------------------
  function validar() {
    limparErros();
    const erros = [];

    if (!estado.titulo.trim()) erros.push(['titulo', 'Informe o título da reunião']);

    if (!deIso(estado.data)) erros.push(['data', 'Informe uma data válida']);
    else if (estado.data < hojeIso()) erros.push(['data', 'Não é possível agendar em uma data passada']);

    const i = normalizarHora(refs.inicio.value);
    const f = normalizarHora(refs.fim.value);
    if (!i || !f) erros.push(['horario', 'Informe um horário válido']);
    else {
      estado.inicio = i; estado.fim = f;
      refs.inicio.value = i; refs.fim.value = f;
      if (f <= i) erros.push(['horario', 'O horário final deve ser depois do inicial']);
    }

    if (estado.descricao.length > LIMITE_DESCRICAO) erros.push(['descricao', 'A descrição pode ter no máximo ' + LIMITE_DESCRICAO + ' caracteres']);

    if (estado.repetir) {
      const usaDias = estado.frequencia === 'semanal' || estado.frequencia === 'personalizada';
      if (usaDias && !estado.dias.length) erros.push(['recorrencia_dias', 'Selecione ao menos um dia da semana']);
      if (estado.termino === 'data') {
        if (!estado.terminoData) erros.push(['recorrencia_termino', 'Informe a data de término']);
        else if (estado.terminoData < estado.data) erros.push(['recorrencia_termino', 'A data de término deve ser depois da reunião']);
      }
      if (estado.termino === 'ocorrencias' && (estado.ocorrencias < 1 || estado.ocorrencias > 365)) {
        erros.push(['recorrencia_termino', 'Informe de 1 a 365 ocorrências']);
      }
    }

    erros.forEach(([campo, msg]) => mostrarErro(campo, msg));
    if (erros.length) {
      const alvo = CAMPO_FOCO[erros[0][0]] && CAMPO_FOCO[erros[0][0]]();
      if (alvo) alvo.focus();
      return false;
    }
    return true;
  }

  function carregando(sim) {
    enviando = sim;
    refs.btnAgendar.disabled = sim;
    refs.btnAgendar.classList.toggle('is-carregando', sim);
    refs.btnAgendar.setAttribute('aria-busy', String(sim));
    refs.btnAgendar.querySelector('.reuniao__btn-texto').textContent = sim ? 'Agendando...' : 'Agendar reunião';
  }

  function montarPayload() {
    const p = {
      titulo: estado.titulo.trim(),
      data: estado.data,
      inicio: estado.inicio,
      fim: estado.fim,
      fuso: estado.fuso,
      equipe: estado.equipe,
      participantes: estado.participantes.map((x) => x.id),
      descricao: estado.descricao.trim(),
      repetir: estado.repetir,
    };
    if (estado.repetir) {
      p.recorrencia = {
        frequencia: estado.frequencia,
        dias: estado.dias,
        termino: estado.termino,
        termino_data: estado.terminoData,
        ocorrencias: estado.ocorrencias,
      };
    }
    return p;
  }

  refs.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (enviando) return;
    fecharPopovers(null);
    if (!validar()) return;

    carregando(true);
    try {
      if (modoDemo) {
        await new Promise((r) => setTimeout(r, 700));
      } else {
        const res = await fetch('api/reunioes/agendar.php', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify(montarPayload()),
        });
        let json = {};
        try { json = await res.json(); } catch (_) { /* resposta sem JSON */ }

        if (res.status === 401) {
          toast('Sua sessão expirou. Entre novamente para agendar.', 'erro');
          return;
        }
        if (res.status === 422 && json.campos) {
          let primeiro = null;
          Object.keys(json.campos).forEach((campo) => {
            const nome = MAPA_ERRO[campo] || campo;
            mostrarErro(nome, json.campos[campo]);
            if (!primeiro) primeiro = nome;
          });
          const alvo = primeiro && CAMPO_FOCO[primeiro] && CAMPO_FOCO[primeiro]();
          if (alvo) alvo.focus();
          return;
        }
        if (!res.ok || !json.sucesso) {
          toast(json.erro || 'Não foi possível agendar a reunião. Tente novamente.', 'erro');
          return;
        }
      }

      toast('Reunião agendada com sucesso!', 'ok', { texto: 'Ir para o Início', href: 'index.php?pagina=inicio' });
      resetar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast('Sem conexão com o servidor. Verifique sua internet e tente novamente.', 'erro');
    } finally {
      carregando(false);
    }
  });

  // ------------------------------------------------------------
  // Cancelar -> "Descartar alterações?"
  // ------------------------------------------------------------
  refs.btnCancelar.addEventListener('click', () => refs.dlgDescartar.showModal());
  $('reuContinuar').addEventListener('click', () => refs.dlgDescartar.close());
  $('reuDescartar').addEventListener('click', () => {
    refs.dlgDescartar.close();
    resetar();
    window.location.href = 'index.php?pagina=inicio';
  });

  // ------------------------------------------------------------
  // Reset / pintar tudo a partir do estado
  // ------------------------------------------------------------
  function pintarTudo() {
    refs.titulo.value = estado.titulo;
    refs.descricao.value = estado.descricao;
    refs.inicio.value = estado.inicio;
    refs.fim.value = estado.fim;
    refs.repetir.checked = estado.repetir;
    refs.terminoData.value = estado.terminoData;
    refs.ocorrencias.value = estado.ocorrencias;
    const r = raiz.querySelector('input[name="reuTermino"][value="' + estado.termino + '"]');
    if (r) r.checked = true;
    selFuso.definir(estado.fuso);
    selEquipe.definir(estado.equipe);
    selFreq.definir(estado.frequencia);
    atualizarData();
    atualizarContador();
    renderChips();
    renderRecorrencia();
    renderResumo();
  }

  function resetar() {
    estado = estadoInicial();
    limparErros();
    pintarTudo();
    sugerirEquipe();
  }

  // ------------------------------------------------------------
  // Menu lateral: botão "Recolher" (mesmo comportamento das demais páginas)
  // ------------------------------------------------------------
  const btnRecolher = $('btnRecolher');
  if (btnRecolher) btnRecolher.addEventListener('click', () => document.body.classList.remove('sidebar-open'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('sidebar-open')
        && !raiz.querySelector('dialog[open]') && !raiz.querySelector('.reuniao__pop:not([hidden])')) {
      document.body.classList.remove('sidebar-open');
    }
  });

  // ------------------------------------------------------------
  // Início
  // ------------------------------------------------------------
  montarDias();
  pintarTudo();
  if (modoDemo) refs.aviso.hidden = false;
  sugerirEquipe();
})();
