// ============================================================
// CONTEÚDO — Documentos (área CADASTRADO)
// Central de documentos das equipes: listar, pesquisar, filtrar por
// equipe, ordenar, favoritar, abrir/visualizar, enviar (upload) e
// mandar para a lixeira. Tudo vem de api/documentos/*.php.
//
// MODO DEMONSTRAÇÃO: se a API não responder no primeiro carregamento
// (ex.: o SQL database/documentos.sql ainda não foi executado), a página
// entra sozinha em modo demonstração — documentos fictícios em memória,
// nada é salvo — e avisa na tela. Também dá para forçar com ?demo=1.
// ============================================================
(function () {
  'use strict';

  const raiz = document.getElementById('docRaiz');
  if (!raiz) return;

  const csrf = raiz.getAttribute('data-csrf') || '';
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------
  // Referências do DOM
  // ------------------------------------------------------------
  const refs = {
    aviso: $('docAviso'),
    btnNovo: $('docBtnNovo'),
    btnNovoMenu: $('docBtnNovoMenu'),
    busca: $('docBusca'),
    filtroEquipe: $('docFiltroEquipe'),
    filtroEquipeTexto: $('docFiltroEquipeTexto'),
    filtroOrdem: $('docFiltroOrdem'),
    filtroOrdemTexto: $('docFiltroOrdemTexto'),
    abas: Array.from(raiz.querySelectorAll('.documentos__aba')),
    statTotal: $('docStatTotal'),
    statAcessados: $('docStatAcessados'),
    statFavoritos: $('docStatFavoritos'),
    statCompartilhados: $('docStatCompartilhados'),
    painel: $('docPainel'),
    listaTitulo: $('docListaTitulo'),
    verTodos: $('docVerTodos'),
    tabelaWrap: $('docTabelaWrap'),
    tabela: raiz.querySelector('.documentos__tabela'),
    thData: $('docThData'),
    corpo: $('docCorpo'),
    estado: $('docEstado'),
    mais: $('docMais'),
    contagem: $('docContagem'),
    btnMais: $('docBtnMais'),
    acesso: $('docAcesso'),
    atividade: $('docAtividade'),
    atividadeVerTudo: $('docAtividadeVerTudo'),
    status: $('docStatus'),
    menu: $('docMenu'),
    toasts: $('docToasts'),
    tplLinha: $('docTplLinha'),
    tplAtividade: $('docTplAtividade'),
    // diálogo: enviar
    dlgEnviar: $('docDlgEnviar'),
    formEnviar: $('docFormEnviar'),
    soltar: $('docSoltar'),
    arquivo: $('docArquivo'),
    arquivoEscolhido: $('docArquivoEscolhido'),
    arquivoIcone: $('docArquivoIcone'),
    arquivoNome: $('docArquivoNome'),
    arquivoMeta: $('docArquivoMeta'),
    arquivoTrocar: $('docArquivoTrocar'),
    nomeNovo: $('docNomeNovo'),
    equipeNova: $('docEquipeNovo'),
    progresso: $('docProgresso'),
    progressoBarra: $('docProgressoBarra'),
    progressoTexto: $('docProgressoTexto'),
    enviarErro: $('docEnviarErro'),
    enviarCancelar: $('docEnviarCancelar'),
    enviarConfirmar: $('docEnviarConfirmar'),
    // diálogo: renomear
    dlgNome: $('docDlgNome'),
    formNome: $('docFormNome'),
    nomeInput: $('docNomeInput'),
    nomeErro: $('docNomeErro'),
    nomeCancelar: $('docNomeCancelar'),
    nomeSalvar: $('docNomeSalvar'),
    // diálogo: confirmar
    dlgConf: $('docDlgConfirmar'),
    confTitulo: $('docConfirmarTitulo'),
    confTexto: $('docConfirmarTexto'),
    confCancelar: $('docConfirmarCancelar'),
    confOk: $('docConfirmarOk'),
    // diálogo: visualizador
    dlgVer: $('docDlgVer'),
    verIcone: $('docVerIcone'),
    verTitulo: $('docVerTitulo'),
    verMeta: $('docVerMeta'),
    verAbrir: $('docVerAbrir'),
    verBaixar: $('docVerBaixar'),
    verFechar: $('docVerFechar'),
    verCorpo: $('docVerCorpo'),
  };

  // ------------------------------------------------------------
  // Menu lateral: botão "Recolher" (mesmo comportamento das demais páginas)
  // ------------------------------------------------------------
  const btnRecolher = $('btnRecolher');

  function fecharSidebar() {
    document.body.classList.remove('sidebar-open');
  }

  if (btnRecolher) btnRecolher.addEventListener('click', fecharSidebar);

  // Esc fecha o menu lateral, MAS antes fecha o que estiver aberto por cima
  // (menu suspenso ou diálogo), para não recolher a sidebar sem querer.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('dialog[open]') || !refs.menu.hidden) return;
    fecharSidebar();
  });

  // ------------------------------------------------------------
  // Constantes
  // ------------------------------------------------------------
  const EQUIPES = [
    { slug: 'geral', nome: 'Geral', cor: '#00A859' },
    { slug: 'projetos', nome: 'Projetos', cor: '#3B82F6' },
    { slug: 'marketing', nome: 'Marketing', cor: '#F59E0B' },
    { slug: 'rh', nome: 'RH', cor: '#8B5CF6' },
    { slug: 'financeiro', nome: 'Financeiro', cor: '#EC4899' },
    { slug: 'ti', nome: 'TI', cor: '#0EA5E9' },
    { slug: 'sac', nome: 'SAC / Ouvidoria', cor: '#EF4444' },
  ];
  const EQUIPE = {};
  EQUIPES.forEach((e) => { EQUIPE[e.slug] = e; });

  const ABAS = {
    recentes: {
      titulo: 'Documentos recentes',
      vazioTitulo: 'Nenhum documento por aqui',
      vazioTexto: 'Envie o primeiro documento da sua equipe para começar.',
      enviar: true,
    },
    meus: {
      titulo: 'Meus documentos',
      vazioTitulo: 'Você ainda não enviou documentos',
      vazioTexto: 'Os documentos que você enviar aparecem aqui.',
      enviar: true,
    },
    compartilhados: {
      titulo: 'Compartilhados comigo',
      vazioTitulo: 'Nada compartilhado por enquanto',
      vazioTexto: 'Os documentos enviados por outras pessoas das suas equipes aparecem aqui.',
    },
    favoritos: {
      titulo: 'Favoritos',
      vazioTitulo: 'Nenhum favorito ainda',
      vazioTexto: 'Clique na estrela de um documento para encontrá-lo rapidamente aqui.',
    },
    lixeira: {
      titulo: 'Lixeira',
      vazioTitulo: 'A lixeira está vazia',
      vazioTexto: 'Documentos que você excluir ficam aqui e podem ser restaurados.',
    },
  };

  const ORDENS = [
    { id: 'recentes', rotulo: 'Mais recentes' },
    { id: 'antigos', rotulo: 'Mais antigos' },
    { id: 'nome', rotulo: 'Nome (A–Z)' },
    { id: 'nome_desc', rotulo: 'Nome (Z–A)' },
    { id: 'tamanho', rotulo: 'Maior tamanho' },
  ];

  const EXTENSOES_OK = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md', 'png', 'jpg', 'jpeg', 'webp'];
  const MAX_BYTES = 20 * 1024 * 1024;
  const LINHAS_INICIAIS = 5;      // linhas mostradas antes de "Ver todos"
  const POR_PAGINA = 10;          // linhas por página depois de "Ver todos" / com filtros
  const MAX_LIMITE = 100;         // mesmo teto de api/documentos/listar.php
  const ATIVIDADES_INICIAIS = 4;  // itens antes de "Ver tudo"

  const ICONES = {
    abrir: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    baixar: '<path d="M12 4v11M12 15l-4.5-4.5M12 15l4.5-4.5M4 19h16"/>',
    renomear: '<path d="M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17v3z"/><path d="M14.5 7.5l3 3"/>',
    lixeira: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5"/>',
    restaurar: '<path d="M4 12a8 8 0 108-8 8 8 0 00-6 2.7L4 9M4 4v5h5"/>',
    marca: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    pasta: '<path d="M3.5 7.5a2 2 0 012-2h4l2 2.2h7a2 2 0 012 2v7.8a2 2 0 01-2 2h-13a2 2 0 01-2-2V7.5z"/>',
    alerta: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  };

  // ------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------
  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }

  function svgIcone(nome, classe) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.8');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    if (classe) s.setAttribute('class', classe);
    s.innerHTML = ICONES[nome] || '';
    return s;
  }

  const pad = (n) => String(n).padStart(2, '0');

  function formatarNumero(n) {
    return typeof n === 'number' ? n.toLocaleString('pt-BR') : '–';
  }

  function formatarTamanho(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1048576) return Math.round(b / 1024) + ' KB';
    return (b / 1048576).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MB';
  }

  function formatarData(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function hhmm(d) {
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function mesmoDia(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  // "há 2 horas", "ontem, 16:30", "24/05/2024, 09:10"
  function quandoRelativo(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const agora = new Date();
    const min = Math.floor((agora.getTime() - d.getTime()) / 60000);
    if (min < 1) return 'agora mesmo';
    if (min < 60) return 'há ' + min + ' min';
    if (mesmoDia(d, agora)) {
      const h = Math.floor(min / 60);
      return 'há ' + h + (h === 1 ? ' hora' : ' horas');
    }
    const ontem = new Date(agora.getTime());
    ontem.setDate(ontem.getDate() - 1);
    if (mesmoDia(d, ontem)) return 'ontem, ' + hhmm(d);
    return formatarData(iso) + ', ' + hhmm(d);
  }

  function truncar(texto, max) {
    const t = String(texto || '');
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
  }

  function extensaoDe(nome) {
    const i = String(nome || '').lastIndexOf('.');
    return i < 0 ? '' : nome.slice(i + 1).toLowerCase();
  }

  function nomeSemExtensao(nome) {
    const i = String(nome || '').lastIndexOf('.');
    return i > 0 ? nome.slice(0, i) : String(nome || '');
  }

  function normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  // Tipo do arquivo -> texto e classe do ícone colorido
  function tipoArquivo(ext) {
    const e = String(ext || '').toLowerCase();
    if (e === 'pdf') return { classe: 'pdf', texto: 'PDF' };
    if (e === 'doc' || e === 'docx') return { classe: 'word', texto: 'W' };
    if (e === 'xls' || e === 'xlsx') return { classe: 'excel', texto: 'X' };
    if (e === 'ppt' || e === 'pptx') return { classe: 'ppt', texto: 'P' };
    if (['png', 'jpg', 'jpeg', 'webp'].indexOf(e) >= 0) return { classe: 'img', texto: 'IMG' };
    return { classe: 'texto', texto: e === 'csv' ? 'CSV' : (e === 'md' ? 'MD' : 'TXT') };
  }

  function aplicarIcone(span, ext) {
    const t = tipoArquivo(ext);
    ['pdf', 'word', 'excel', 'ppt', 'img', 'texto'].forEach((c) => span.classList.remove('documentos__ficon--' + c));
    span.classList.add('documentos__ficon--' + t.classe);
    span.textContent = t.texto;
  }

  // O que o visualizador consegue mostrar dentro da página
  function tipoVisualizacao(ext) {
    const e = String(ext || '').toLowerCase();
    if (e === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'webp'].indexOf(e) >= 0) return 'imagem';
    if (['txt', 'csv', 'md'].indexOf(e) >= 0) return 'texto';
    return null;
  }

  // ------------------------------------------------------------
  // Estado
  // ------------------------------------------------------------
  const estado = {
    aba: 'recentes',
    equipe: '',
    busca: '',
    ordem: 'recentes',
    docs: [],
    total: 0,
    expandido: false,          // "Ver todos" ligado
    resumo: { total: null, acessados: null, favoritos: null, compartilhados: null },
    atividades: [],
    atividadesTodas: false,
    carregando: false,
    primeiraCarga: true,
    erro: '',
    demo: false,
    reqId: 0,
    ctrl: null,
  };

  function filtrosAtivos() {
    return estado.aba !== 'recentes' || estado.equipe !== '' || estado.busca !== '';
  }

  function limiteBase() {
    return (estado.expandido || filtrosAtivos()) ? POR_PAGINA : LINHAS_INICIAIS;
  }

  // ------------------------------------------------------------
  // API (servidor de verdade)
  // ------------------------------------------------------------
  class ErroApi extends Error {
    constructor(status, mensagem) {
      super(mensagem);
      this.status = status;
    }
  }

  async function requisitar(url, opcoes) {
    const o = opcoes || {};
    const config = {
      method: o.metodo || 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      signal: o.sinal,
    };
    if (config.method === 'POST') {
      config.headers['X-CSRF-Token'] = csrf;
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(o.corpo || {});
    }

    let resp;
    try {
      resp = await fetch(url, config);
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw new ErroApi(0, 'Não foi possível conectar ao servidor. Verifique sua conexão.');
    }

    const dados = await resp.json().catch(() => null);
    if (!resp.ok || !dados || dados.sucesso !== true) {
      throw new ErroApi(resp.status, (dados && dados.erro) || 'O servidor não respondeu como esperado (código ' + resp.status + ').');
    }
    return dados;
  }

  // Upload com barra de progresso (fetch não informa progresso de envio)
  function enviarComProgresso(url, formData, aoProgredir, ref) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      ref.xhr = xhr;
      xhr.open('POST', url);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('X-CSRF-Token', csrf);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) aoProgredir(e.loaded / e.total);
      };
      xhr.onload = () => {
        let d = null;
        try { d = JSON.parse(xhr.responseText); } catch (_) { d = null; }
        if (xhr.status >= 200 && xhr.status < 300 && d && d.sucesso === true) {
          resolve(d);
        } else {
          reject(new ErroApi(xhr.status, (d && d.erro) || 'Não foi possível enviar o documento (código ' + xhr.status + ').'));
        }
      };
      xhr.onerror = () => reject(new ErroApi(0, 'Não foi possível conectar ao servidor. Verifique sua conexão.'));
      xhr.onabort = () => {
        const e = new Error('abortado');
        e.name = 'AbortError';
        reject(e);
      };
      xhr.send(formData);
    });
  }

  const apiReal = {
    listar(params, sinal) {
      return requisitar('api/documentos/listar.php?' + new URLSearchParams(params).toString(), { sinal: sinal });
    },
    acao(corpo) {
      return requisitar('api/documentos/acao.php', { metodo: 'POST', corpo: corpo });
    },
    enviar(fd, aoProgredir, ref) {
      return enviarComProgresso('api/documentos/enviar.php', fd, aoProgredir, ref);
    },
    url(doc, modo) {
      return 'api/documentos/arquivo.php?id=' + encodeURIComponent(doc.id) + (modo === 'ver' ? '&modo=ver' : '');
    },
  };

  // ------------------------------------------------------------
  // API de demonstração (dados fictícios em memória)
  // ------------------------------------------------------------
  function criarApiDemo() {
    const HORA = 3600000;
    const DIA = 24 * HORA;
    const agora = Date.now();
    const EU = 'Ana Souza';
    const iso = (msAtras) => new Date(agora - msAtras).toISOString();
    let proximoId = 100;

    // [id, nome, ext, bytes, equipe, autor, há quanto tempo, meu, favorito]
    const base = [
      [1, 'Manual Técnico Linha XPE', 'pdf', 2516582, 'geral', 'João Silva', 1 * DIA + 2 * HORA, false, true],
      [2, 'Política de Segurança da Informação', 'docx', 1153434, 'ti', 'Mariana Costa', 2 * DIA + 4 * HORA, false, false],
      [3, 'Relatório de Resultados - Q1 2024', 'xlsx', 876544, 'financeiro', 'Carlos Alberto', 3 * DIA + 1 * HORA, false, false],
      [4, 'Apresentação Institucional', 'pptx', 5452595, 'marketing', 'Juliana Mendes', 4 * DIA + 3 * HORA, false, false],
      [5, 'Guia de Boas Práticas', 'pdf', 1782579, 'rh', 'Rafael Souza', 5 * DIA + 5 * HORA, false, false],
      [6, 'Cronograma - Projeto Nova Sede', 'xlsx', 421000, 'projetos', EU, 6 * DIA, true, false],
      [7, 'Procedimento de Atendimento ao Cliente', 'docx', 655000, 'sac', 'Pedro Lima', 7 * DIA, false, false],
      [8, 'Orçamento 2025', 'xlsx', 1363148, 'financeiro', EU, 8 * DIA, true, true],
      [9, 'Banner Campanha de Verão', 'png', 870400, 'marketing', 'Juliana Mendes', 9 * DIA, false, false],
      [10, 'Onboarding de Novos Colaboradores', 'pptx', 3984588, 'rh', 'Rafael Souza', 10 * DIA, false, true],
      [11, 'Política de Ouvidoria', 'pdf', 1003520, 'sac', 'Pedro Lima', 12 * DIA, false, false],
      [12, 'Inventário de Ativos de TI', 'csv', 131072, 'ti', 'Mariana Costa', 14 * DIA, false, false],
      [13, 'Rascunho de Contrato', 'docx', 215040, 'geral', EU, 15 * DIA, true, false],
    ];

    const docs = base.map((b) => ({
      id: b[0], nome: b[1], extensao: b[2], tamanho: b[3], equipe: b[4], autor: b[5],
      atualizado_por: b[5], atualizado_em: iso(b[6]), excluido_em: b[0] === 13 ? iso(1 * DIA) : null,
      meu: b[7], favorito: b[8], blobUrl: '',
    }));

    const acessos = {};
    acessos[1] = agora - 2 * HORA;
    acessos[2] = agora - 1 * DIA;
    acessos[3] = agora - 2 * DIA;
    acessos[8] = agora - 3 * DIA;

    const atividades = [
      { acao: 'criou', autor: 'Juliana Mendes', doc: 4, quando: iso(2 * HORA) },
      { acao: 'favoritou', autor: 'João Silva', doc: 1, quando: iso(5 * HORA) },
      { acao: 'atualizou', autor: 'Carlos Alberto', doc: 3, quando: iso(1 * DIA - 3 * HORA) },
      { acao: 'criou', autor: 'Mariana Costa', doc: 2, quando: iso(2 * DIA + 4 * HORA) },
      { acao: 'criou', autor: 'Pedro Lima', doc: 7, quando: iso(7 * DIA) },
      { acao: 'criou', autor: 'Rafael Souza', doc: 10, quando: iso(10 * DIA) },
    ];

    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    const achar = (id) => docs.find((d) => d.id === id);

    function registrar(acao, doc) {
      atividades.unshift({ acao: acao, autor: EU, doc: doc.id, quando: new Date().toISOString() });
    }

    function resumo() {
      const ativos = docs.filter((d) => !d.excluido_em);
      const seteDias = agora - 7 * DIA;
      return {
        total: ativos.length,
        acessados: ativos.filter((d) => acessos[d.id] && acessos[d.id] >= seteDias).length,
        favoritos: ativos.filter((d) => d.favorito).length,
        compartilhados: ativos.filter((d) => !d.meu).length,
      };
    }

    return {
      async listar(p) {
        await espera(140);
        const busca = normalizar(p.busca || '');
        let lista = docs.filter((d) => {
          if (p.aba === 'lixeira') return d.excluido_em && d.meu;
          if (d.excluido_em) return false;
          if (p.aba === 'meus') return d.meu;
          if (p.aba === 'compartilhados') return !d.meu;
          if (p.aba === 'favoritos') return d.favorito;
          return true;
        });
        if (p.equipe) lista = lista.filter((d) => d.equipe === p.equipe);
        if (busca) {
          lista = lista.filter((d) => normalizar(d.nome).indexOf(busca) >= 0 || normalizar(d.autor).indexOf(busca) >= 0);
        }
        const chaveData = p.aba === 'lixeira' ? 'excluido_em' : 'atualizado_em';
        const cmpData = (a, b) => new Date(b[chaveData]).getTime() - new Date(a[chaveData]).getTime();
        const ordenar = {
          recentes: cmpData,
          antigos: (a, b) => cmpData(b, a),
          nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
          nome_desc: (a, b) => b.nome.localeCompare(a.nome, 'pt-BR'),
          tamanho: (a, b) => b.tamanho - a.tamanho,
        };
        lista.sort(ordenar[p.ordem] || cmpData);

        const offset = Number(p.offset) || 0;
        const limite = Number(p.limite) || POR_PAGINA;
        return {
          sucesso: true,
          documentos: lista.slice(offset, offset + limite).map((d) => Object.assign({}, d)),
          total: lista.length,
          resumo: resumo(),
          atividades: atividades
            .filter((a) => { const d = achar(a.doc); return d && !d.excluido_em; })
            .slice(0, 12)
            .map((a) => {
              const d = achar(a.doc);
              return {
                acao: a.acao, quando: a.quando, autor: a.autor, eu: a.autor === EU,
                documento_id: d.id, documento: d.nome, extensao: d.extensao, equipe: d.equipe,
              };
            }),
        };
      },

      async acao(c) {
        await espera(90);
        const d = achar(Number(c.id));
        if (!d) throw new ErroApi(404, 'Documento não encontrado.');
        if (['renomear', 'excluir', 'restaurar', 'excluir_definitivo'].indexOf(c.acao) >= 0 && !d.meu) {
          throw new ErroApi(403, 'Só quem enviou o documento pode fazer isso.');
        }
        switch (c.acao) {
          case 'favoritar':
            d.favorito = !!c.valor;
            if (d.favorito) registrar('favoritou', d);
            break;
          case 'acessar':
            acessos[d.id] = Date.now();
            break;
          case 'renomear':
            d.nome = String(c.nome || '').trim() || d.nome;
            d.atualizado_por = EU;
            d.atualizado_em = new Date().toISOString();
            registrar('atualizou', d);
            break;
          case 'excluir':
            d.excluido_em = new Date().toISOString();
            break;
          case 'restaurar':
            d.excluido_em = null;
            break;
          case 'excluir_definitivo':
            docs.splice(docs.indexOf(d), 1);
            break;
          default:
            throw new ErroApi(422, 'Ação inválida.');
        }
        return { sucesso: true };
      },

      enviar(fd, aoProgredir, ref) {
        return new Promise((resolve, reject) => {
          const arquivo = fd.get('arquivo');
          let p = 0;
          const timer = setInterval(() => {
            p += 0.25;
            aoProgredir(Math.min(p, 1));
            if (p < 1) return;
            clearInterval(timer);
            const ext = extensaoDe(arquivo.name);
            const novo = {
              id: proximoId++, nome: String(fd.get('nome') || '') || nomeSemExtensao(arquivo.name),
              extensao: ext, tamanho: arquivo.size, equipe: String(fd.get('equipe')), autor: EU,
              atualizado_por: EU, atualizado_em: new Date().toISOString(), excluido_em: null,
              meu: true, favorito: false, blobUrl: URL.createObjectURL(arquivo),
            };
            docs.push(novo);
            registrar('criou', novo);
            resolve({ sucesso: true, id: novo.id });
          }, 120);
          ref.xhr = {
            abort() {
              clearInterval(timer);
              const e = new Error('abortado');
              e.name = 'AbortError';
              reject(e);
            },
          };
        });
      },

      url(doc) {
        const d = achar(doc.id);
        return d && d.blobUrl ? d.blobUrl : '';
      },
    };
  }

  let api = apiReal;

  function ativarDemo(motivo, forcado) {
    estado.demo = true;
    api = criarApiDemo();

    const av = refs.aviso;
    av.textContent = '';
    const texto = el('span', 'documentos__aviso-texto');
    texto.appendChild(el('strong', null, 'Modo demonstração. '));
    texto.appendChild(document.createTextNode(
      (forcado
        ? 'A página foi aberta com ?demo=1. '
        : (motivo || 'Não foi possível carregar os documentos do servidor.') + ' ') +
      'Os documentos abaixo são fictícios e nada é salvo.'
    ));
    av.appendChild(texto);

    const botao = el('button', 'documentos__btn documentos__btn--contorno documentos__btn--pequeno', forcado ? 'Sair da demonstração' : 'Tentar novamente');
    botao.type = 'button';
    botao.addEventListener('click', () => {
      const u = new URL(window.location.href);
      u.searchParams.delete('demo');
      window.location.href = u.toString();
    });
    av.appendChild(botao);
    av.hidden = false;
  }

  function urlDoc(doc, modo) {
    return api.url(doc, modo);
  }

  // ------------------------------------------------------------
  // Carregamento
  // ------------------------------------------------------------
  async function carregar(opcoes) {
    const o = opcoes || {};
    const id = ++estado.reqId;
    if (estado.ctrl) estado.ctrl.abort();
    const ctrl = new AbortController();
    estado.ctrl = ctrl;

    // Quantos itens pedir: "acrescentar" = próxima página; "silencioso" = repete o
    // que já está na tela (usado depois de favoritar, excluir etc.).
    let limite;
    let offset = 0;
    if (o.acrescentar) {
      limite = POR_PAGINA;
      offset = estado.docs.length;
    } else if (o.silencioso) {
      limite = Math.min(MAX_LIMITE, Math.max(estado.docs.length, limiteBase()));
    } else {
      limite = limiteBase();
    }

    if (o.acrescentar) {
      refs.btnMais.disabled = true;
    } else if (!o.silencioso) {
      estado.carregando = true;
      estado.erro = '';
      renderLista();
    }

    const params = { aba: estado.aba, ordem: estado.ordem, limite: limite, offset: offset };
    if (estado.equipe) params.equipe = estado.equipe;
    if (estado.busca) params.busca = estado.busca;

    let dados;
    try {
      dados = await api.listar(params, ctrl.signal);
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      if (id !== estado.reqId) return;

      // Primeiro carregamento sem resposta da API (SQL não executado, arquivos
      // ausentes...): entra em modo demonstração em vez de deixar a tela vazia.
      if (!estado.demo && estado.primeiraCarga && e.status !== 401 && e.status !== 403) {
        ativarDemo(e.message, false);
        return carregar(o);
      }

      estado.carregando = false;
      refs.btnMais.disabled = false;
      if (o.silencioso) return;
      if (o.acrescentar) {
        toast(e.message, { tipo: 'erro' });
        return;
      }
      estado.docs = [];
      estado.erro = e.status === 401
        ? 'Sua sessão expirou. Entre novamente para ver os documentos.'
        : e.message;
      renderLista();
      return;
    }

    if (id !== estado.reqId) return;

    estado.primeiraCarga = false;
    estado.carregando = false;
    estado.erro = '';
    estado.total = dados.total;
    estado.docs = o.acrescentar ? estado.docs.concat(dados.documentos) : dados.documentos;
    estado.resumo = dados.resumo;
    estado.atividades = dados.atividades;
    renderTudo();
  }

  function recarregarSilencioso() {
    return carregar({ silencioso: true });
  }

  // ------------------------------------------------------------
  // Renderização
  // ------------------------------------------------------------
  function renderTudo() {
    renderResumo();
    renderAbas();
    renderFiltros();
    renderLista();
    renderAcesso();
    renderAtividades();
    const n = estado.total;
    refs.status.textContent = estado.erro ? '' : (n === 1 ? '1 documento' : n + ' documentos');
  }

  function renderResumo() {
    refs.statTotal.textContent = formatarNumero(estado.resumo.total);
    refs.statAcessados.textContent = formatarNumero(estado.resumo.acessados);
    refs.statFavoritos.textContent = formatarNumero(estado.resumo.favoritos);
    refs.statCompartilhados.textContent = formatarNumero(estado.resumo.compartilhados);
  }

  function renderAbas() {
    refs.abas.forEach((b) => {
      const ativa = b.dataset.aba === estado.aba;
      b.classList.toggle('documentos__aba--ativa', ativa);
      b.setAttribute('aria-selected', String(ativa));
      b.tabIndex = ativa ? 0 : -1;
    });
  }

  function renderFiltros() {
    refs.filtroEquipeTexto.textContent = estado.equipe ? EQUIPE[estado.equipe].nome : 'Todas as equipes';
    const ordem = ORDENS.find((x) => x.id === estado.ordem) || ORDENS[0];
    refs.filtroOrdemTexto.textContent = 'Ordenar por: ' + ordem.rotulo;
  }

  function renderAcesso() {
    refs.acesso.querySelectorAll('.documentos__acesso-item').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.equipe === estado.equipe));
    });
  }

  function renderLista() {
    const info = ABAS[estado.aba];
    const naLixeira = estado.aba === 'lixeira';
    const semDados = estado.docs.length === 0;

    refs.listaTitulo.textContent = info.titulo + (estado.equipe ? ' · ' + EQUIPE[estado.equipe].nome : '');
    refs.thData.textContent = naLixeira ? 'Excluído em' : 'Atualizado em';
    refs.painel.setAttribute('aria-busy', String(estado.carregando));
    refs.painel.setAttribute('aria-labelledby', 'docAba-' + estado.aba);
    refs.tabela.classList.toggle('documentos__tabela--carregando', estado.carregando && !semDados);

    refs.corpo.textContent = '';
    refs.estado.textContent = '';
    refs.estado.className = 'documentos__estado';
    refs.estado.hidden = true;
    refs.tabelaWrap.hidden = false;

    if (estado.carregando && semDados) {
      for (let i = 0; i < LINHAS_INICIAIS; i++) refs.corpo.appendChild(criarEsqueleto());
    } else if (estado.erro) {
      refs.tabelaWrap.hidden = true;
      renderEstadoErro();
    } else if (semDados) {
      refs.tabelaWrap.hidden = true;
      renderEstadoVazio();
    } else {
      const frag = document.createDocumentFragment();
      estado.docs.forEach((d) => frag.appendChild(criarLinha(d)));
      refs.corpo.appendChild(frag);
    }

    // "Ver todos" (só na visão padrão: Recentes, sem busca nem equipe)
    const mostrarVerTodos = !filtrosAtivos() && !estado.erro && estado.total > LINHAS_INICIAIS;
    refs.verTodos.hidden = !mostrarVerTodos;
    refs.verTodos.textContent = estado.expandido ? 'Ver menos' : 'Ver todos';

    // "Mostrar mais" (paginação depois de expandir ou com filtros)
    const podeMais = !estado.erro && estado.docs.length > 0 &&
      estado.docs.length < estado.total && (estado.expandido || filtrosAtivos());
    refs.mais.hidden = !podeMais;
    refs.contagem.textContent = 'Mostrando ' + estado.docs.length + ' de ' + estado.total;
    refs.btnMais.disabled = false;
  }

  function criarEsqueleto() {
    const tr = el('tr', 'documentos__esqueleto');
    for (let i = 0; i < 5; i++) {
      const td = document.createElement('td');
      td.appendChild(document.createElement('span'));
      tr.appendChild(td);
    }
    return tr;
  }

  function criarLinha(doc) {
    const naLixeira = doc.excluido_em !== null && doc.excluido_em !== undefined;
    const tr = refs.tplLinha.content.firstElementChild.cloneNode(true);
    tr.dataset.id = String(doc.id);

    aplicarIcone(tr.querySelector('.documentos__ficon'), doc.extensao);

    const nome = tr.querySelector('.documentos__nome-btn');
    nome.textContent = doc.nome;
    nome.title = doc.nome;
    nome.disabled = naLixeira; // documento na lixeira não abre

    tr.querySelector('.documentos__meta').textContent =
      String(doc.extensao || '').toUpperCase() + ' • ' + formatarTamanho(doc.tamanho);

    const eq = EQUIPE[doc.equipe];
    const pilula = tr.querySelector('.documentos__pilula');
    pilula.style.setProperty('--eq', eq ? eq.cor : '#999999');
    tr.querySelector('.documentos__pilula-texto').textContent = eq ? eq.nome : String(doc.equipe || '');

    const tdData = tr.querySelector('.documentos__col-data');
    if (naLixeira) tdData.dataset.rotulo = 'Excluído em';
    tr.querySelector('.documentos__data').textContent = formatarData(naLixeira ? doc.excluido_em : doc.atualizado_em);

    const por = doc.atualizado_por || doc.autor || '';
    tr.querySelector('.documentos__col-por').textContent = por;
    tr.querySelector('.documentos__col-por').title = por;
    tr.querySelector('.documentos__por-inline').textContent = por;

    const estrela = tr.querySelector('.documentos__estrela');
    if (naLixeira) {
      estrela.hidden = true;
    } else {
      atualizarEstrela(estrela, doc);
    }

    tr.querySelector('.documentos__mais-btn').setAttribute('aria-label', 'Mais ações para ' + doc.nome);
    return tr;
  }

  function atualizarEstrela(botao, doc) {
    botao.setAttribute('aria-pressed', String(!!doc.favorito));
    botao.setAttribute('aria-label', (doc.favorito ? 'Remover dos favoritos: ' : 'Adicionar aos favoritos: ') + doc.nome);
    botao.title = doc.favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
  }

  function criarEstado(classeExtra, icone, titulo, texto, botao) {
    const e = refs.estado;
    e.className = 'documentos__estado' + (classeExtra ? ' ' + classeExtra : '');
    const ic = el('span', 'documentos__estado-icone');
    ic.appendChild(svgIcone(icone));
    e.appendChild(ic);
    e.appendChild(el('h3', 'documentos__estado-titulo', titulo));
    e.appendChild(el('p', 'documentos__estado-texto', texto));
    if (botao) {
      const b = el('button', 'documentos__btn documentos__btn--primario documentos__btn--pequeno', botao.rotulo);
      b.type = 'button';
      b.addEventListener('click', botao.acao);
      e.appendChild(b);
    }
    e.hidden = false;
  }

  function renderEstadoVazio() {
    const info = ABAS[estado.aba];
    if (estado.busca || estado.equipe) {
      criarEstado('', 'pasta', 'Nenhum documento encontrado',
        'Tente outros termos ou limpe os filtros para ver mais documentos.',
        { rotulo: 'Limpar filtros', acao: limparFiltros });
    } else {
      criarEstado('', 'pasta', info.vazioTitulo, info.vazioTexto,
        info.enviar ? { rotulo: 'Novo documento', acao: () => abrirEnviar('') } : null);
    }
  }

  function renderEstadoErro() {
    criarEstado('documentos__estado--erro', 'alerta', 'Não foi possível carregar os documentos', estado.erro,
      { rotulo: 'Tentar novamente', acao: () => carregar() });
  }

  function fraseAtividade(a) {
    const quem = a.eu ? 'Você' : a.autor;
    const nome = '“' + a.documento + '”';
    if (a.acao === 'criou') {
      const eq = EQUIPE[a.equipe];
      return quem + ' enviou o documento ' + nome + (eq ? ' para ' + eq.nome : '');
    }
    if (a.acao === 'atualizou') return quem + ' atualizou o documento ' + nome;
    return quem + ' adicionou o documento ' + nome + ' aos favoritos';
  }

  function renderAtividades() {
    const ul = refs.atividade;
    ul.textContent = '';
    const lista = estado.atividades;

    if (!lista.length) {
      ul.appendChild(el('li', 'documentos__atividade-vazia', 'Nenhuma atividade por enquanto.'));
      refs.atividadeVerTudo.hidden = true;
      return;
    }

    const visiveis = estado.atividadesTodas ? lista : lista.slice(0, ATIVIDADES_INICIAIS);
    visiveis.forEach((a) => {
      const li = refs.tplAtividade.content.firstElementChild.cloneNode(true);
      li.querySelector('.documentos__avatar').textContent = String(a.autor || '?').trim().charAt(0).toUpperCase();
      li.querySelector('.documentos__atividade-frase').textContent = fraseAtividade(a);
      li.querySelector('.documentos__atividade-hora').textContent = quandoRelativo(a.quando);
      li.querySelector('.documentos__atividade-estrela').hidden = a.acao !== 'favoritou';
      aplicarIcone(li.querySelector('.documentos__ficon'), a.extensao);
      ul.appendChild(li);
    });

    refs.atividadeVerTudo.hidden = lista.length <= ATIVIDADES_INICIAIS;
    refs.atividadeVerTudo.textContent = estado.atividadesTodas ? 'Ver menos' : 'Ver tudo';
  }

  // ------------------------------------------------------------
  // Menu suspenso único
  // ------------------------------------------------------------
  let menuAtual = null; // { ancora, aberto }

  function criarItemMenu(item) {
    if (item.titulo) {
      const t = el('div', 'documentos__menu-titulo', item.titulo);
      t.setAttribute('role', 'presentation');
      return t;
    }
    const b = el('button', 'documentos__menu-item' + (item.perigo ? ' documentos__menu-item--perigo' : ''));
    b.type = 'button';
    if (item.marcado !== undefined) {
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', String(!!item.marcado));
    } else {
      b.setAttribute('role', 'menuitem');
    }
    if (item.cor) {
      const ponto = el('span', 'documentos__menu-ponto');
      ponto.style.setProperty('--eq', item.cor);
      b.appendChild(ponto);
    } else if (item.icone) {
      b.appendChild(svgIcone(item.icone, 'documentos__menu-icone'));
    }
    b.appendChild(el('span', 'documentos__menu-texto', item.rotulo));
    if (item.marcado) b.appendChild(svgIcone('marca', 'documentos__menu-marca'));
    b.addEventListener('click', () => {
      fecharMenu(true);
      item.acao();
    });
    return b;
  }

  function abrirMenu(ancora, itens) {
    fecharMenu(false);
    const m = refs.menu;
    m.textContent = '';
    itens.forEach((it) => m.appendChild(criarItemMenu(it)));

    const r = ancora.getBoundingClientRect();
    m.style.minWidth = ancora.classList.contains('documentos__filtro') ? Math.round(r.width) + 'px' : '';
    m.style.visibility = 'hidden';
    m.hidden = false;

    const w = m.offsetWidth;
    const h = m.offsetHeight;
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = r.right - w;
    left = Math.max(8, left);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    m.style.left = left + 'px';
    m.style.top = top + 'px';
    m.style.visibility = '';

    ancora.setAttribute('aria-expanded', 'true');
    menuAtual = { ancora: ancora, aberto: Date.now() };

    const primeiro = m.querySelector('.documentos__menu-item[aria-checked="true"]') || m.querySelector('.documentos__menu-item');
    if (primeiro) primeiro.focus();
  }

  function fecharMenu(devolverFoco) {
    if (!menuAtual) return;
    const ancora = menuAtual.ancora;
    menuAtual = null;
    refs.menu.hidden = true;
    refs.menu.textContent = '';
    ancora.setAttribute('aria-expanded', 'false');
    if (devolverFoco && document.body.contains(ancora)) ancora.focus();
  }

  function alternarMenu(ancora, montarItens) {
    if (menuAtual && menuAtual.ancora === ancora) {
      fecharMenu(true);
      return;
    }
    abrirMenu(ancora, montarItens());
  }

  // Esc (fase de captura, para vencer o "Esc recolhe a sidebar"), clique fora, rolagem
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuAtual) {
      e.stopPropagation();
      fecharMenu(true);
    }
  }, true);

  document.addEventListener('pointerdown', (e) => {
    if (!menuAtual) return;
    if (refs.menu.contains(e.target) || menuAtual.ancora.contains(e.target)) return;
    fecharMenu(false);
  });

  // Rolagem da página fecha o menu (ignora a rolagem "de chegada" logo após abrir,
  // quando o navegador ainda está terminando de rolar até o botão clicado).
  window.addEventListener('scroll', (e) => {
    if (!menuAtual || refs.menu.contains(e.target)) return;
    if (Date.now() - menuAtual.aberto < 250) return;
    fecharMenu(false);
  }, true);

  window.addEventListener('resize', () => fecharMenu(false));

  refs.menu.addEventListener('keydown', (e) => {
    const itens = Array.from(refs.menu.querySelectorAll('.documentos__menu-item'));
    const i = itens.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      itens[(i + 1) % itens.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      itens[(i - 1 + itens.length) % itens.length].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      itens[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      itens[itens.length - 1].focus();
    } else if (e.key === 'Tab') {
      fecharMenu(false);
    }
  });

  function menuEquipes() {
    const itens = [{ rotulo: 'Todas as equipes', marcado: estado.equipe === '', acao: () => definirEquipe('') }];
    EQUIPES.forEach((eq) => {
      itens.push({ rotulo: eq.nome, cor: eq.cor, marcado: estado.equipe === eq.slug, acao: () => definirEquipe(eq.slug) });
    });
    return itens;
  }

  function menuOrdem() {
    return ORDENS.map((o) => ({ rotulo: o.rotulo, marcado: estado.ordem === o.id, acao: () => definirOrdem(o.id) }));
  }

  function menuNovo() {
    const itens = [{ titulo: 'Enviar para a equipe' }];
    EQUIPES.forEach((eq) => itens.push({ rotulo: eq.nome, cor: eq.cor, acao: () => abrirEnviar(eq.slug) }));
    return itens;
  }

  function menuLinha(doc) {
    if (doc.excluido_em) {
      return [
        { rotulo: 'Restaurar', icone: 'restaurar', acao: () => restaurar(doc, false) },
        { rotulo: 'Excluir definitivamente', icone: 'lixeira', perigo: true, acao: () => excluirDefinitivo(doc) },
      ];
    }
    const itens = [
      { rotulo: 'Abrir', icone: 'abrir', acao: () => abrirVisualizador(doc) },
      { rotulo: 'Baixar', icone: 'baixar', acao: () => baixar(doc) },
    ];
    if (doc.meu) {
      itens.push({ rotulo: 'Renomear', icone: 'renomear', acao: () => abrirRenomear(doc) });
      itens.push({ rotulo: 'Mover para a lixeira', icone: 'lixeira', perigo: true, acao: () => moverParaLixeira(doc) });
    }
    return itens;
  }

  // ------------------------------------------------------------
  // Avisos rápidos (toasts)
  // ------------------------------------------------------------
  function toast(texto, opcoes) {
    const o = opcoes || {};
    const t = el('div', 'documentos__toast' + (o.tipo === 'erro' ? ' documentos__toast--erro' : ''));
    t.setAttribute('role', o.tipo === 'erro' ? 'alert' : 'status');
    t.appendChild(el('span', null, texto));
    const remover = () => t.remove();
    if (o.acao) {
      const b = el('button', 'documentos__toast-acao', o.acao.rotulo);
      b.type = 'button';
      b.addEventListener('click', () => {
        remover();
        o.acao.fn();
      });
      t.appendChild(b);
    }
    while (refs.toasts.children.length >= 3) refs.toasts.firstElementChild.remove();
    refs.toasts.appendChild(t);
    setTimeout(remover, o.acao ? 6000 : 3800);
  }

  // ------------------------------------------------------------
  // Diálogos
  // ------------------------------------------------------------
  function abrirDialogo(d) {
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }

  function fecharDialogo(d) {
    if (typeof d.close === 'function') d.close();
    else d.removeAttribute('open');
  }

  function confirmar(cfg) {
    return new Promise((resolve) => {
      let resultado = false;
      refs.confTitulo.textContent = cfg.titulo;
      refs.confTexto.textContent = cfg.texto;
      refs.confOk.textContent = cfg.botao || 'Confirmar';
      const fim = () => {
        refs.dlgConf.removeEventListener('close', fim);
        resolve(resultado);
      };
      refs.dlgConf.addEventListener('close', fim);
      refs.confOk.onclick = () => { resultado = true; fecharDialogo(refs.dlgConf); };
      refs.confCancelar.onclick = () => fecharDialogo(refs.dlgConf);
      abrirDialogo(refs.dlgConf);
      refs.confCancelar.focus();
    });
  }

  // ---------- Renomear ----------
  let renomeando = null;

  function abrirRenomear(doc) {
    renomeando = doc;
    refs.nomeInput.value = doc.nome;
    refs.nomeErro.hidden = true;
    refs.nomeSalvar.disabled = false;
    abrirDialogo(refs.dlgNome);
    refs.nomeInput.focus();
    refs.nomeInput.select();
  }

  refs.nomeCancelar.addEventListener('click', () => fecharDialogo(refs.dlgNome));

  refs.formNome.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!renomeando) return;
    const nome = refs.nomeInput.value.replace(/\s+/g, ' ').trim();
    if (!nome) {
      refs.nomeErro.textContent = 'Informe um nome para o documento.';
      refs.nomeErro.hidden = false;
      return;
    }
    if (nome === renomeando.nome) {
      fecharDialogo(refs.dlgNome);
      return;
    }
    refs.nomeSalvar.disabled = true;
    try {
      await api.acao({ acao: 'renomear', id: renomeando.id, nome: nome });
    } catch (err) {
      refs.nomeErro.textContent = err.message;
      refs.nomeErro.hidden = false;
      refs.nomeSalvar.disabled = false;
      return;
    }
    fecharDialogo(refs.dlgNome);
    toast('Documento renomeado');
    recarregarSilencioso();
  });

  // ---------- Enviar (upload) ----------
  let arquivoEscolhido = null;
  let nomeAuto = '';
  let enviando = false;
  const refEnvio = { xhr: null };

  function mostrarErroEnvio(msg) {
    refs.enviarErro.textContent = msg;
    refs.enviarErro.hidden = false;
  }

  function resetarEnvio() {
    arquivoEscolhido = null;
    nomeAuto = '';
    refs.arquivo.value = '';
    refs.nomeNovo.value = '';
    refs.equipeNova.value = '';
    refs.soltar.hidden = false;
    refs.arquivoEscolhido.hidden = true;
    refs.enviarErro.hidden = true;
    refs.progresso.hidden = true;
    refs.progressoBarra.style.width = '0';
    refs.enviarConfirmar.disabled = false;
    refs.enviarCancelar.disabled = false;
  }

  function abrirEnviar(equipe) {
    resetarEnvio();
    refs.equipeNova.value = equipe || estado.equipe || '';
    abrirDialogo(refs.dlgEnviar);
  }

  function escolherArquivo(file) {
    refs.enviarErro.hidden = true;
    if (!file) return;
    if (EXTENSOES_OK.indexOf(extensaoDe(file.name)) < 0) {
      mostrarErroEnvio('Formato não suportado. Envie PDF, Word, Excel, PowerPoint, imagem (PNG, JPG, WEBP) ou texto (TXT, CSV, MD).');
      return;
    }
    if (file.size === 0) {
      mostrarErroEnvio('O arquivo está vazio.');
      return;
    }
    if (file.size > MAX_BYTES) {
      mostrarErroEnvio('O arquivo é maior que 20 MB.');
      return;
    }
    arquivoEscolhido = file;
    aplicarIcone(refs.arquivoIcone, extensaoDe(file.name));
    refs.arquivoNome.textContent = file.name;
    refs.arquivoMeta.textContent = extensaoDe(file.name).toUpperCase() + ' • ' + formatarTamanho(file.size);
    refs.soltar.hidden = true;
    refs.arquivoEscolhido.hidden = false;

    const base = nomeSemExtensao(file.name);
    if (!refs.nomeNovo.value.trim() || refs.nomeNovo.value === nomeAuto) refs.nomeNovo.value = base;
    nomeAuto = base;
  }

  refs.arquivo.addEventListener('change', () => escolherArquivo(refs.arquivo.files[0]));

  refs.arquivoTrocar.addEventListener('click', () => {
    arquivoEscolhido = null;
    refs.arquivo.value = '';
    refs.soltar.hidden = false;
    refs.arquivoEscolhido.hidden = true;
    if (refs.nomeNovo.value === nomeAuto) refs.nomeNovo.value = '';
    nomeAuto = '';
    refs.arquivo.focus();
  });

  ['dragenter', 'dragover'].forEach((ev) => {
    refs.soltar.addEventListener(ev, (e) => {
      e.preventDefault();
      refs.soltar.classList.add('documentos__soltar--sobre');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    refs.soltar.addEventListener(ev, () => refs.soltar.classList.remove('documentos__soltar--sobre'));
  });
  refs.soltar.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    escolherArquivo(f);
  });

  function cancelarEnvio() {
    if (enviando && refEnvio.xhr) refEnvio.xhr.abort();
    fecharDialogo(refs.dlgEnviar);
  }

  refs.enviarCancelar.addEventListener('click', cancelarEnvio);
  // Esc / fechar durante o envio também cancela
  refs.dlgEnviar.addEventListener('close', () => {
    if (enviando && refEnvio.xhr) refEnvio.xhr.abort();
  });
  refs.dlgEnviar.addEventListener('cancel', (e) => {
    if (enviando) e.preventDefault(); // não fecha sem querer no meio do envio; use "Cancelar"
  });

  refs.formEnviar.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (enviando) return;
    refs.enviarErro.hidden = true;

    if (!arquivoEscolhido) {
      mostrarErroEnvio('Selecione um arquivo.');
      return;
    }
    if (!refs.equipeNova.value) {
      mostrarErroEnvio('Escolha a equipe do documento.');
      refs.equipeNova.focus();
      return;
    }

    const fd = new FormData();
    fd.append('arquivo', arquivoEscolhido);
    fd.append('equipe', refs.equipeNova.value);
    fd.append('nome', refs.nomeNovo.value.replace(/\s+/g, ' ').trim());

    enviando = true;
    refs.enviarConfirmar.disabled = true;
    refs.progresso.hidden = false;
    refs.progressoBarra.style.width = '0';
    refs.progressoTexto.textContent = 'Enviando…';

    try {
      await api.enviar(fd, (p) => {
        refs.progressoBarra.style.width = Math.round(p * 100) + '%';
        refs.progressoTexto.textContent = p >= 1 ? 'Finalizando…' : 'Enviando… ' + Math.round(p * 100) + '%';
      }, refEnvio);
    } catch (err) {
      enviando = false;
      refs.enviarConfirmar.disabled = false;
      refs.progresso.hidden = true;
      if (err && err.name === 'AbortError') return;
      mostrarErroEnvio(err.message);
      return;
    }

    enviando = false;
    fecharDialogo(refs.dlgEnviar);
    toast('Documento enviado');

    // Garante que o documento novo apareça na lista
    if (['favoritos', 'lixeira', 'compartilhados'].indexOf(estado.aba) >= 0) estado.aba = 'recentes';
    estado.equipe = '';
    estado.busca = '';
    refs.busca.value = '';
    estado.ordem = 'recentes';
    estado.expandido = false;
    renderAbas();
    renderFiltros();
    renderAcesso();
    carregar();
  });

  // ---------- Visualizador ----------
  function registrarAcesso(doc) {
    api.acao({ acao: 'acessar', id: doc.id }).then(recarregarSilencioso).catch(() => {});
  }

  function avisoVisualizador(doc, titulo, texto) {
    const box = el('div', 'documentos__ver-aviso');
    const ic = el('span', 'documentos__ficon');
    aplicarIcone(ic, doc.extensao);
    box.appendChild(ic);
    box.appendChild(el('strong', null, titulo));
    box.appendChild(el('p', null, texto));
    refs.verCorpo.textContent = '';
    refs.verCorpo.appendChild(box);
  }

  function abrirVisualizador(doc) {
    const tipo = tipoVisualizacao(doc.extensao);
    const urlVer = urlDoc(doc, 'ver');
    const urlBaixar = urlDoc(doc, 'baixar');
    const eq = EQUIPE[doc.equipe];

    aplicarIcone(refs.verIcone, doc.extensao);
    refs.verTitulo.textContent = doc.nome;
    refs.verMeta.textContent = String(doc.extensao || '').toUpperCase() + ' • ' + formatarTamanho(doc.tamanho) + (eq ? ' • ' + eq.nome : '');

    if (urlBaixar) {
      refs.verBaixar.href = urlBaixar;
      refs.verBaixar.setAttribute('download', doc.nome + '.' + doc.extensao);
      refs.verBaixar.removeAttribute('aria-disabled');
    } else {
      refs.verBaixar.removeAttribute('href');
      refs.verBaixar.setAttribute('aria-disabled', 'true');
    }
    refs.verAbrir.hidden = !(tipo && urlVer);
    if (tipo && urlVer) refs.verAbrir.href = urlVer;

    refs.verCorpo.textContent = '';
    if (!urlVer && !urlBaixar) {
      avisoVisualizador(doc, 'Pré-visualização indisponível', 'Este é um documento fictício do modo demonstração e não tem arquivo. Envie um documento seu para testar a visualização.');
    } else if (tipo === 'pdf') {
      const f = document.createElement('iframe');
      f.title = doc.nome;
      f.src = urlVer;
      refs.verCorpo.appendChild(f);
    } else if (tipo === 'imagem') {
      const img = document.createElement('img');
      img.alt = doc.nome;
      img.src = urlVer;
      refs.verCorpo.appendChild(img);
    } else if (tipo === 'texto') {
      const pre = el('pre', 'documentos__ver-texto', 'Carregando…');
      refs.verCorpo.appendChild(pre);
      fetch(urlVer, { credentials: 'same-origin' })
        .then((r) => {
          if (!r.ok) throw new Error('falha');
          return r.text();
        })
        .then((t) => {
          pre.textContent = t.length > 200000 ? t.slice(0, 200000) + '\n\n[… arquivo cortado; baixe para ver tudo …]' : t;
        })
        .catch(() => {
          avisoVisualizador(doc, 'Não foi possível abrir o arquivo', 'Tente baixá-lo pelo botão “Baixar”.');
        });
    } else {
      avisoVisualizador(doc, 'Este formato abre no seu computador', 'Documentos do Word, Excel e PowerPoint não têm pré-visualização aqui. Use o botão “Baixar” para abrir no programa correspondente.');
    }

    abrirDialogo(refs.dlgVer);
    registrarAcesso(doc);
  }

  refs.verFechar.addEventListener('click', () => fecharDialogo(refs.dlgVer));
  refs.verBaixar.addEventListener('click', (e) => {
    if (refs.verBaixar.getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
      toast('Download indisponível no modo demonstração.', { tipo: 'erro' });
    }
  });
  // limpa o conteúdo ao fechar (para o PDF/imagem parar de carregar)
  refs.dlgVer.addEventListener('close', () => { refs.verCorpo.textContent = ''; });
  // clicar fora da janela (no fundo escurecido) fecha
  refs.dlgVer.addEventListener('click', (e) => {
    const r = refs.dlgVer.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) fecharDialogo(refs.dlgVer);
  });

  function baixar(doc) {
    const url = urlDoc(doc, 'baixar');
    if (!url) {
      toast('Download indisponível no modo demonstração.', { tipo: 'erro' });
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', doc.nome + '.' + doc.extensao);
    document.body.appendChild(a);
    a.click();
    a.remove();
    registrarAcesso(doc);
  }

  // ------------------------------------------------------------
  // Ações sobre documentos
  // ------------------------------------------------------------
  const pendentes = new Set();

  async function alternarFavorito(doc, botao) {
    if (pendentes.has(doc.id)) return;
    pendentes.add(doc.id);

    const novo = !doc.favorito;
    doc.favorito = novo;
    if (typeof estado.resumo.favoritos === 'number') estado.resumo.favoritos += novo ? 1 : -1;
    atualizarEstrela(botao, doc);
    renderResumo();

    try {
      await api.acao({ acao: 'favoritar', id: doc.id, valor: novo });
    } catch (e) {
      doc.favorito = !novo; // desfaz na tela
      if (typeof estado.resumo.favoritos === 'number') estado.resumo.favoritos += novo ? -1 : 1;
      if (document.body.contains(botao)) atualizarEstrela(botao, doc);
      renderResumo();
      pendentes.delete(doc.id);
      toast(e.message, { tipo: 'erro' });
      return;
    }
    pendentes.delete(doc.id);
    toast(novo ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
    recarregarSilencioso(); // atualiza atividade recente e, na aba Favoritos, a lista
  }

  async function moverParaLixeira(doc) {
    try {
      await api.acao({ acao: 'excluir', id: doc.id });
    } catch (e) {
      toast(e.message, { tipo: 'erro' });
      return;
    }
    toast('“' + truncar(doc.nome, 38) + '” foi para a lixeira', {
      acao: { rotulo: 'Desfazer', fn: () => restaurar(doc, true) },
    });
    recarregarSilencioso();
  }

  async function restaurar(doc, desfazer) {
    try {
      await api.acao({ acao: 'restaurar', id: doc.id });
    } catch (e) {
      toast(e.message, { tipo: 'erro' });
      return;
    }
    toast(desfazer ? 'Exclusão desfeita' : 'Documento restaurado');
    recarregarSilencioso();
  }

  async function excluirDefinitivo(doc) {
    const ok = await confirmar({
      titulo: 'Excluir definitivamente?',
      texto: '“' + doc.nome + '” será apagado para sempre. Essa ação não pode ser desfeita.',
      botao: 'Excluir definitivamente',
    });
    if (!ok) return;
    try {
      await api.acao({ acao: 'excluir_definitivo', id: doc.id });
    } catch (e) {
      toast(e.message, { tipo: 'erro' });
      return;
    }
    toast('Documento excluído definitivamente');
    recarregarSilencioso();
  }

  // ------------------------------------------------------------
  // Filtros, abas e busca
  // ------------------------------------------------------------
  function definirEquipe(slug) {
    estado.equipe = slug;
    estado.expandido = false;
    renderFiltros();
    renderAcesso();
    carregar();
  }

  function definirOrdem(id) {
    estado.ordem = id;
    estado.expandido = false;
    renderFiltros();
    carregar();
  }

  function limparFiltros() {
    estado.equipe = '';
    estado.busca = '';
    refs.busca.value = '';
    estado.expandido = false;
    renderFiltros();
    renderAcesso();
    carregar();
  }

  function trocarAba(aba) {
    if (aba === estado.aba) return;
    estado.aba = aba;
    estado.expandido = false;
    estado.docs = []; // não mostra as linhas da aba anterior enquanto carrega
    renderAbas();
    carregar();
  }

  refs.abas.forEach((b) => b.addEventListener('click', () => trocarAba(b.dataset.aba)));

  refs.abas.forEach((b, i) => {
    b.addEventListener('keydown', (e) => {
      let alvo = null;
      if (e.key === 'ArrowRight') alvo = refs.abas[(i + 1) % refs.abas.length];
      else if (e.key === 'ArrowLeft') alvo = refs.abas[(i - 1 + refs.abas.length) % refs.abas.length];
      else if (e.key === 'Home') alvo = refs.abas[0];
      else if (e.key === 'End') alvo = refs.abas[refs.abas.length - 1];
      if (!alvo) return;
      e.preventDefault();
      alvo.focus();
      trocarAba(alvo.dataset.aba);
    });
  });

  let esperaBusca = null;

  function aplicarBusca() {
    const v = refs.busca.value.replace(/\s+/g, ' ').trim();
    if (v === estado.busca) return;
    estado.busca = v;
    estado.expandido = false;
    carregar();
  }

  refs.busca.addEventListener('input', () => {
    clearTimeout(esperaBusca);
    esperaBusca = setTimeout(aplicarBusca, 300);
  });

  refs.busca.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(esperaBusca);
      aplicarBusca();
    }
  });

  refs.filtroEquipe.addEventListener('click', () => alternarMenu(refs.filtroEquipe, menuEquipes));
  refs.filtroOrdem.addEventListener('click', () => alternarMenu(refs.filtroOrdem, menuOrdem));
  refs.btnNovoMenu.addEventListener('click', () => alternarMenu(refs.btnNovoMenu, menuNovo));
  refs.btnNovo.addEventListener('click', () => abrirEnviar(''));

  // Acesso rápido: clicar numa equipe filtra (clicar de novo limpa o filtro)
  refs.acesso.addEventListener('click', (e) => {
    const b = e.target.closest('.documentos__acesso-item');
    if (!b) return;
    definirEquipe(estado.equipe === b.dataset.equipe ? '' : b.dataset.equipe);
  });

  refs.verTodos.addEventListener('click', () => {
    estado.expandido = !estado.expandido;
    if (estado.expandido) {
      carregar();
    } else {
      estado.docs = estado.docs.slice(0, LINHAS_INICIAIS);
      renderLista();
    }
  });

  refs.btnMais.addEventListener('click', () => carregar({ acrescentar: true }));

  refs.atividadeVerTudo.addEventListener('click', () => {
    estado.atividadesTodas = !estado.atividadesTodas;
    renderAtividades();
  });

  // Ações da linha (delegação de eventos)
  refs.corpo.addEventListener('click', (e) => {
    const botao = e.target.closest('button');
    const tr = e.target.closest('tr[data-id]');
    if (!botao || !tr) return;
    const doc = estado.docs.find((d) => String(d.id) === tr.dataset.id);
    if (!doc) return;

    if (botao.classList.contains('documentos__nome-btn')) {
      abrirVisualizador(doc);
    } else if (botao.classList.contains('documentos__estrela')) {
      alternarFavorito(doc, botao);
    } else if (botao.classList.contains('documentos__mais-btn')) {
      alternarMenu(botao, () => menuLinha(doc));
    }
  });

  // ------------------------------------------------------------
  // Início
  // ------------------------------------------------------------
  function iniciar() {
    renderAbas();
    renderFiltros();
    renderResumo();
    renderAcesso();
    for (let i = 0; i < 3; i++) refs.atividade.appendChild(el('li', 'documentos__atividade-esqueleto'));

    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      ativarDemo('', true);
    }
    carregar();
  }

  iniciar();
})();
