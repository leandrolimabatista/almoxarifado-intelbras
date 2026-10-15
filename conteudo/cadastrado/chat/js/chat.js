// ============================================================
// CONTEÚDO — Chat (área CADASTRADO)
// Chat pessoal, um-para-um, com qualquer usuário cadastrado (como o
// chat pessoal do Microsoft Teams): lista de conversas, busca de
// contatos em "Nova conversa", mensagens de texto e arquivo, tudo
// vindo de api/chat/*.php (banco de verdade — ver database/chat.sql).
//
// Mensagens novas chegam por POLLING: a cada poucos segundos, a
// conversa aberta pergunta por mensagens com id maior que a última
// que já tem (api/chat/mensagens.php?depois_de=).
// ============================================================
(function () {
  'use strict';

  const raiz = document.getElementById('chatRaiz');
  if (!raiz) return;

  const csrf = raiz.getAttribute('data-csrf') || '';
  const meuId = Number(raiz.getAttribute('data-meu-id') || 0);
  function iniciaisDe(nome) {
    const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return (p[0].charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }
  const $ = (id) => document.getElementById(id);

  const INTERVALO_POLL_MS = 4000;
  const EMOJIS_RAPIDOS = ['👍', '❤️', '😂', '😮', '😢', '🙌'];

  const refs = {
    aviso: $('chatAviso'),
    buscaConversas: $('chatBuscaConversas'),
    lista: $('chatLista'),
    listaVazia: $('chatListaVazia'),
    btnNovo: $('chatBtnNovaConversa'),

    vazio: $('chatVazio'),
    thread: $('chatThread'),
    threadVoltar: $('chatThreadVoltar'),
    threadAvatar: $('chatThreadAvatar'),
    threadNome: $('chatThreadNome'),
    threadCargo: $('chatThreadCargo'),
    mensagens: $('chatMensagens'),
    irFim: $('chatIrFim'),
    listaMsgs: $('chatMensagensLista'),
    threadVazio: $('chatThreadVazio'),
    threadVazioTitulo: $('chatThreadVazioTitulo'),

    respostaPreview: $('chatRespostaPreview'),
    respostaAutor: $('chatRespostaAutor'),
    respostaTrecho: $('chatRespostaTrecho'),
    respostaFechar: $('chatRespostaFechar'),

    anexoPreview: $('chatAnexoPreview'),
    anexoPreviewNome: $('chatAnexoPreviewNome'),
    anexoPreviewRemover: $('chatAnexoPreviewRemover'),

    composer: $('chatComposer'),
    inputArquivo: $('chatInputArquivo'),
    inputTexto: $('chatInputTexto'),
    btnEnviar: $('chatBtnEnviar'),

    novoFundo: $('chatNovoFundo'),
    novoFechar: $('chatNovoFechar'),
    novoBusca: $('chatNovoBusca'),
    novoLista: $('chatNovoLista'),
    novoVazio: $('chatNovoVazio'),

    tabs: document.querySelectorAll('#chatTabs .chat__tab'),
    arquivosLista: $('chatArquivosLista'),
    arquivosVazio: $('chatArquivosVazio'),

    colunaLista: document.querySelector('.chat__coluna-lista'),
    colunaThread: document.querySelector('.chat__coluna-thread'),
  };

  const estado = {
    conversas: [],
    conversaAtivaId: null,
    usuarioAtivo: null,
    ultimoMensagemId: 0,
    mensagens: [],
    maxIdRenderizado: 0,
    meuIniciais: iniciaisDe(raiz.getAttribute('data-meu-nome') || ''),
    arquivoSelecionado: null,
    abaAtiva: 'chat',
    pollTimer: null,
    sincEm: null,        // "agora" do servidor na última consulta (sincroniza edições/reações)
    respostaAtual: null, // { id, autor, trecho } da mensagem que está sendo respondida
    editandoId: null,    // mensagem em edição inline (pausa o redesenho do polling)
    menuConversaId: null, // conversa com o menu de botão direito aberto
  };

  // ------------------------------------------------------------
  // API
  // ------------------------------------------------------------
  class ErroApi extends Error {
    constructor(status, mensagem) {
      super(mensagem);
      this.status = status;
    }
  }

  async function apiJson(url, opcoes) {
    const o = opcoes || {};
    const config = {
      method: o.metodo || 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    };
    if (config.method === 'POST') {
      config.headers['X-CSRF-Token'] = csrf;
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(o.corpo || {});
    }
    return concluir(await buscar(url, config));
  }

  async function apiFormData(url, formData) {
    const config = {
      method: 'POST',
      headers: { Accept: 'application/json', 'X-CSRF-Token': csrf },
      credentials: 'same-origin',
      body: formData,
    };
    return concluir(await buscar(url, config));
  }

  async function buscar(url, config) {
    try {
      return await fetch(url, config);
    } catch (e) {
      throw new ErroApi(0, 'Não foi possível conectar ao servidor. Verifique sua conexão.');
    }
  }

  async function concluir(resp) {
    const dados = await resp.json().catch(() => null);
    if (!resp.ok || !dados || dados.sucesso !== true) {
      throw new ErroApi(resp.status, (dados && dados.erro) || 'O servidor não respondeu como esperado (código ' + resp.status + ').');
    }
    return dados;
  }

  function mostrarAviso(mensagem) {
    if (!refs.aviso) return;
    refs.aviso.textContent = mensagem;
    refs.aviso.hidden = false;
  }

  function esconderAviso() {
    if (!refs.aviso) return;
    refs.aviso.hidden = true;
    refs.aviso.textContent = '';
  }

  // ------------------------------------------------------------
  // Util
  // ------------------------------------------------------------
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatarHora(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatarHoraLista(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const hoje = new Date();
    const mesmoDia = d.toDateString() === hoje.toDateString();
    if (mesmoDia) return formatarHora(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function rotuloDia(iso) {
    const d = new Date(iso);
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
    if (d.toDateString() === hoje.toDateString()) return 'Hoje';
    if (d.toDateString() === ontem.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: d.getFullYear() !== hoje.getFullYear() ? 'numeric' : undefined });
  }

  function formatarTamanho(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // ------------------------------------------------------------
  // Lista de conversas
  // ------------------------------------------------------------
  async function carregarConversas() {
    try {
      const d = await apiJson('api/chat/conversas.php');
      estado.conversas = d.conversas;
      esconderAviso();
    } catch (e) {
      mostrarAviso(e.message);
      estado.conversas = [];
    }
    renderLista();
  }

  // Conversas silenciadas (guardado neste navegador). O sino do cabeçalho
  // também lê esta lista para não notificar essas conversas.
  const CHAVE_SILENCIADAS = 'chatConversasSilenciadas';

  function lerSilenciadas() {
    try {
      const v = JSON.parse(localStorage.getItem(CHAVE_SILENCIADAS) || '[]');
      return Array.isArray(v) ? v.map(Number) : [];
    } catch (e) { return []; }
  }

  const ICONE_SILENCIADA = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m2 2 20 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Conversas fixadas no topo da lista (também guardado neste navegador)
  const CHAVE_FIXADAS = 'chatConversasFixadas';

  function lerFixadas() {
    try {
      const v = JSON.parse(localStorage.getItem(CHAVE_FIXADAS) || '[]');
      return Array.isArray(v) ? v.map(Number) : [];
    } catch (e) { return []; }
  }

  // Pino inclinado (alfinete), preenchido
  const ICONE_FIXADA = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><g transform="rotate(45 12 12)"><path d="M12 17v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>';

  function reduzirMovimento() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // "Enviada" / "Lida" nas minhas mensagens: lida quando a outra pessoa abriu a conversa depois do envio
  function atualizarStatusLeitura() {
    if (!refs.listaMsgs) return;
    const conv = estado.conversas.find((c) => c.id === estado.conversaAtivaId);
    const leitura = conv && conv.outro_leitura ? new Date(conv.outro_leitura).getTime() : 0;
    refs.listaMsgs.querySelectorAll('[data-status]').forEach((el) => {
      const lida = leitura && new Date(el.getAttribute('data-criado')).getTime() <= leitura;
      el.textContent = lida ? 'Lida' : 'Enviada';
      el.classList.toggle('chat__status--lida', !!lida);
    });
  }

  // animar === true: as conversas deslizam até o novo lugar (ex.: ao fixar)
  function renderLista(animar) {
    atualizarStatusLeitura();
    const filtro = (refs.buscaConversas.value || '').trim().toLowerCase();
    let itens = filtro
      ? estado.conversas.filter((c) => c.usuario.nome.toLowerCase().includes(filtro))
      : estado.conversas;

    // fixadas primeiro (a ordem entre elas segue a da lista)
    const fixadas = lerFixadas();
    if (fixadas.length) {
      itens = itens.slice().sort((a, b) =>
        (fixadas.indexOf(a.id) !== -1 ? 0 : 1) - (fixadas.indexOf(b.id) !== -1 ? 0 : 1));
    }

    const antes = {};
    const deslizar = animar === true && !reduzirMovimento();
    if (deslizar) {
      refs.lista.querySelectorAll('[data-conversa-id]').forEach((el) => {
        antes[el.getAttribute('data-conversa-id')] = el.getBoundingClientRect().top;
      });
    }

    refs.listaVazia.hidden = estado.conversas.length > 0;
    refs.lista.innerHTML = itens.map(linhaConversa).join('');

    refs.lista.querySelectorAll('[data-conversa-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = Number(el.getAttribute('data-conversa-id'));
        const conversa = estado.conversas.find((c) => c.id === id);
        if (conversa) abrirConversa(conversa.id, conversa.usuario);
      });
      if (deslizar && el.animate) {
        const antigo = antes[el.getAttribute('data-conversa-id')];
        if (antigo === undefined) return;
        const dy = antigo - el.getBoundingClientRect().top;
        if (Math.abs(dy) < 1) return;
        el.animate(
          [{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }],
          { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
        );
      }
    });
  }

  function linhaConversa(c) {
    const ativa = c.id === estado.conversaAtivaId;
    const silenciada = lerSilenciadas().indexOf(c.id) !== -1;
    const fixada = lerFixadas().indexOf(c.id) !== -1;
    const naoLida = c.nao_lidas > 0 && !ativa;
    let previa = c.ultima_mensagem ? escapeHtml(semMarcadores(c.ultima_mensagem)) : 'Diga oi 👋';
    if (c.ultima_de_mim === true) previa = 'Você: ' + previa;

    return `
      <li>
        <button type="button" class="chat__conversa-item${ativa ? ' is-ativa' : ''}${naoLida ? ' tem-nao-lida' : ''}${silenciada ? ' is-silenciada' : ''}${fixada ? ' is-fixada' : ''}${c.id === estado.menuConversaId ? ' ml-alvo' : ''}" data-conversa-id="${c.id}">
          <span class="chat__avatar" aria-hidden="true">${escapeHtml(c.usuario.iniciais)}</span>
          <span class="chat__conversa-corpo">
            <span class="chat__conversa-linha1">
              <span class="chat__conversa-nome">${escapeHtml(c.usuario.nome)}</span>
              <span class="chat__conversa-hora">${formatarHoraLista(c.ultima_em)}</span>
            </span>
            <span class="chat__conversa-linha2">
              <span class="chat__conversa-previa">${previa}</span>
              <span class="chat__conversa-icones">
                ${fixada ? `<span class="chat__conversa-fixada" title="Fixada no topo" aria-label="Fixada">${ICONE_FIXADA}</span>` : ''}
                ${silenciada
                  ? `<span class="chat__conversa-mudo" title="Notificações silenciadas" aria-label="Silenciada">${ICONE_SILENCIADA}</span>`
                  : (naoLida ? `<span class="chat__badge">${c.nao_lidas > 9 ? '9+' : c.nao_lidas}</span>` : '')}
              </span>
            </span>
          </span>
        </button>
      </li>`;
  }

  // ------------------------------------------------------------
  // Conversa aberta
  // ------------------------------------------------------------
  async function abrirConversa(conversaId, usuario) {
    pararPolling();

    estado.conversaAtivaId = conversaId;
    estado.usuarioAtivo = usuario;
    estado.ultimoMensagemId = 0;
    estado.sincEm = null;
    estado.editandoId = null;
    cancelarResposta();
    limparAnexoSelecionado();

    refs.vazio.hidden = true;
    refs.thread.hidden = false;
    refs.threadAvatar.textContent = usuario.iniciais;
    refs.threadNome.textContent = usuario.nome;
    document.title = usuario.nome + ' - Intelbras';
    refs.threadCargo.textContent = usuario.cargo ? rotuloCargo(usuario.cargo) : usuario.email;
    estado.mensagens = [];
    estado.maxIdRenderizado = 0;
    selecionarAba('chat');
    refs.threadVazio.hidden = true;
    refs.listaMsgs.innerHTML = '<p class="chat__mensagens-carregando">Carregando mensagens...</p>';

    if (window.matchMedia('(max-width: 860px)').matches) {
      refs.colunaThread.classList.add('is-aberta');
      refs.colunaLista.classList.add('is-escondida');
    }

    renderLista(); // realça a conversa ativa e some com o badge dela

    try {
      const d = await apiJson('api/chat/mensagens.php?conversa_id=' + conversaId);
      renderMensagens(d.mensagens, true);
      if (d.mensagens.length) estado.ultimoMensagemId = d.mensagens[d.mensagens.length - 1].id;
      estado.sincEm = d.agora || null;
      // Zera o contador de não lidas localmente (o servidor já marcou como lida)
      const c = estado.conversas.find((x) => x.id === conversaId);
      if (c) c.nao_lidas = 0;
      renderLista();
    } catch (e) {
      refs.listaMsgs.innerHTML = '';
      mostrarAviso(e.message);
    }

    iniciarPolling();
    refs.inputTexto.focus();
  }

  function rotuloCargo(slug) {
    const mapa = {
      estagiario: 'Estagiário', funcionario: 'Funcionário', supervisor: 'Supervisor',
      coordenador: 'Coordenador', gerente: 'Gerente', diretor: 'Diretor', ceo: 'CEO',
    };
    return mapa[slug] || slug;
  }

  function fecharThreadMobile() {
    refs.colunaThread.classList.remove('is-aberta');
    refs.colunaLista.classList.remove('is-escondida');
  }

  function renderMensagens(lista, substituir) {
    if (substituir) {
      estado.mensagens = [];
      estado.maxIdRenderizado = 0;
    }
    lista.forEach((m) => {
      const i = estado.mensagens.findIndex((x) => x.id === m.id);
      if (i === -1) estado.mensagens.push(m);
      else estado.mensagens[i] = m; // editada, apagada ou com reação nova
    });
    estado.mensagens.sort((a, b) => a.id - b.id);
    renderizarLista(substituir);
    renderizarArquivos();
  }

  // ---- Abas da conversa (Chat | Arquivos) ----
  function selecionarAba(aba) {
    estado.abaAtiva = aba;
    refs.tabs.forEach((t) => t.classList.toggle('chat__tab--ativa', t.getAttribute('data-aba') === aba));
    refs.thread.querySelectorAll('[data-corpo-aba]').forEach((c) => {
      c.hidden = c.getAttribute('data-corpo-aba') !== aba;
    });
    if (aba === 'arquivos') renderizarArquivos();
    if (aba === 'chamadas') mostrarHistoricoChamadas();
  }

  // Aba Chamadas: histórico de chamadas com a pessoa da conversa aberta
  // (componente em assets/js/historico-chamadas.js; dados em api/chamadas/historico.php)
  let historicoChamadas = null;
  let historicoDeUsuario = 0;
  function mostrarHistoricoChamadas() {
    const u = estado.usuarioAtivo;
    const alvo = $('chatChamadasHist');
    if (!u || !u.id || !alvo || !window.HistoricoChamadas) return;
    if (historicoChamadas && historicoDeUsuario === u.id) { historicoChamadas.recarregar(); return; }
    historicoDeUsuario = u.id;
    historicoChamadas = window.HistoricoChamadas.montar(alvo, {
      escopo: 'contato',
      usuarioId: u.id,
      aoLigar: (it, midia) => ligarParaPessoa(midia, u, estado.conversaAtivaId),
    });
  }

  // Aba Arquivos: anexos já carregados nesta conversa (mais recente primeiro)
  function renderizarArquivos() {
    const anexos = estado.mensagens.filter((m) => m.anexo).reverse();
    refs.arquivosVazio.hidden = anexos.length > 0;
    refs.arquivosLista.innerHTML = anexos.map((m) => {
      const d = new Date(m.criado_em);
      const data = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return '<li>' + cartaoAnexo(m.anexo).replace('</a>', '<span class="chat__arquivos-data">' + data + '</span></a>') + '</li>';
    }).join('');
  }

  refs.tabs.forEach((tab) => {
    tab.addEventListener('click', () => selecionarAba(tab.getAttribute('data-aba')));
  });

  // ---- Mensagens: mesmo padrão de Equipes (grupos por autor, bolha, cartão de anexo) ----
  const CORES_ARQUIVO = {
    pdf: '#DC2626', doc: '#2563EB', docx: '#2563EB',
    xls: '#16A34A', xlsx: '#16A34A', csv: '#16A34A',
    ppt: '#EA580C', pptx: '#EA580C',
    zip: '#6B7280', txt: '#6B7280', md: '#6B7280',
    png: '#7C3AED', jpg: '#7C3AED', jpeg: '#7C3AED', webp: '#7C3AED',
  };
  const ROTULO_ARQUIVO = {
    pdf: 'PDF', doc: 'W', docx: 'W', xls: 'X', xlsx: 'X', csv: 'X',
    ppt: 'P', pptx: 'P', zip: 'ZIP', txt: 'TXT', md: 'MD',
    png: 'IMG', jpg: 'IMG', jpeg: 'IMG', webp: 'IMG',
  };

  // Marcadores -> HTML (mesma função de Equipes, sem menções)
  function formatarConteudo(texto) {
    let t = escapeHtml(texto);
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    t = t.replace(/__([^_]+)__/g, '<u>$1</u>');
    t = t.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/(?<![">])((https?:\/\/)[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return t;
  }

  // Tira os marcadores (prévia na lista de conversas)
  function semMarcadores(texto) {
    return String(texto)
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1');
  }

  function formatarDataDivisor(d) {
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
    const opcoes = { day: 'numeric', month: 'long', year: 'numeric' };
    if (d.toDateString() === hoje.toDateString()) return 'Hoje, ' + d.toLocaleDateString('pt-BR', opcoes);
    if (d.toDateString() === ontem.toDateString()) return 'Ontem, ' + d.toLocaleDateString('pt-BR', opcoes);
    return d.toLocaleDateString('pt-BR', opcoes);
  }

  function cartaoAnexo(a) {
    const ext = String(a.extensao || '').toLowerCase();
    const cor = CORES_ARQUIVO[ext] || '#6B7280';
    const rotulo = ROTULO_ARQUIVO[ext] || ext.toUpperCase();
    const nomeCompleto = escapeHtml(a.nome) + '.' + escapeHtml(a.extensao);
    // Mesmo funcionamento de Equipes: PDF, imagem e texto abrem em outra aba;
    // os demais formatos (Word, Excel…) são baixados.
    const urlBaixar = 'api/chat/arquivo.php?id=' + a.documento_id;
    const urlAbrir = urlBaixar + (['pdf', 'txt', 'png', 'jpg', 'jpeg', 'webp'].includes(ext) ? '&modo=ver' : '');
    return `<div class="chat__anexo-card">
        <a class="chat__anexo-principal" href="${urlAbrir}" target="_blank" rel="noopener">
          <span class="chat__anexo-icone" style="background:${cor}">${escapeHtml(rotulo)}</span>
          <span class="chat__anexo-info">
            <span class="chat__anexo-nome">${nomeCompleto}</span>
            <span class="chat__anexo-tamanho">${formatarTamanho(a.tamanho)}</span>
          </span>
        </a>
        <span class="chat__anexo-acoes">
          <a class="chat__anexo-acao" href="${urlAbrir}" target="_blank" rel="noopener" title="Abrir em nova aba" aria-label="Abrir ${nomeCompleto} em nova aba">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4"/></svg>
          </a>
          <a class="chat__anexo-acao" href="${urlBaixar}" download title="Baixar" aria-label="Baixar ${nomeCompleto}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/></svg>
          </a>
        </span>
      </div>`;
  }

  function renderizarLista(primeiraCarga) {
    const caixa = refs.mensagens;
    const pertoDoFim = caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < 120;
    const msgs = estado.mensagens;

    if (!msgs.length) {
      refs.listaMsgs.innerHTML = '';
      const primeiro = estado.usuarioAtivo ? String(estado.usuarioAtivo.nome || '').trim().split(/\s+/)[0] : '';
      refs.threadVazioTitulo.textContent = primeiro ? 'Inicie a conversa com ' + primeiro : 'Inicie a conversa';
      refs.threadVazio.hidden = false;
      return;
    }
    refs.threadVazio.hidden = true;

    const limite = estado.maxIdRenderizado;
    const outro = estado.usuarioAtivo || {};
    let html = '';
    let diaAnterior = null;
    let grupoAutor = null;
    let grupoHora = 0;
    let grupoAberto = false;

    function fecharGrupo() {
      if (grupoAberto) { html += '</div></div>'; grupoAberto = false; }
    }

    msgs.forEach((m) => {
      const data = new Date(m.criado_em);
      const minha = m.remetente_id === meuId;
      const dia = data.toDateString();

      if (dia !== diaAnterior) {
        fecharGrupo();
        html += `<div class="chat__data-divisor"><span>${escapeHtml(formatarDataDivisor(data))}</span></div>`;
        diaAnterior = dia;
        grupoAutor = null;
      }

      if (grupoAutor !== m.remetente_id || (data.getTime() - grupoHora) > 5 * 60000) {
        fecharGrupo();
        const hora = formatarHora(m.criado_em);
        const meta = minha
          ? `<span>${hora}</span><strong>Você</strong>`
          : `<strong>${escapeHtml(outro.nome || '')}</strong><span>${hora}</span>`;
        html += `
          <div class="chat__grupo ${minha ? 'chat__grupo--minha' : ''} chat__grupo--inicio">
            <span class="chat__grupo-avatar">${escapeHtml(minha ? estado.meuIniciais : (outro.iniciais || ''))}</span>
            <div class="chat__grupo-corpo">
              <div class="chat__grupo-meta">${meta}</div>`;
        grupoAberto = true;
      }

      const nova = !primeiraCarga && m.id > limite;
      const lado = minha ? 'chat__msg--minha' : '';
      const novaAttr = nova ? ' data-mv-nova' : '';

      if (m.apagada) {
        html += `
              <div class="chat__msg ${lado}" data-msg-id="${m.id}"${novaAttr}>
                <div class="chat__bolha chat__bolha--apagada">Esta mensagem foi apagada</div>
              </div>`;
      } else {
        const citacao = m.resposta_a ? `
                  <div class="chat__citacao">
                    <span class="chat__citacao-autor"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7L4.5 11.5 9 16"/><path d="M4.5 11.5H14a5.5 5.5 0 015.5 5.5v1"/></svg>${escapeHtml(m.resposta_a.autor)}</span>
                    <span class="chat__citacao-trecho">${escapeHtml(m.resposta_a.trecho)}</span>
                  </div>` : '';
        const reacoes = (m.reacoes || []).map((r) => `<button type="button" class="chat__reacao ${r.reagiu ? 'chat__reacao--minha' : ''}" data-reagir="${escapeHtml(r.emoji)}">${escapeHtml(r.emoji)} ${r.total}</button>`).join('');
        const editada = m.editada ? '<span class="chat__editada-rotulo">(editada)</span>' : '';
        html += `
              <div class="chat__msg ${lado}" data-msg-id="${m.id}"${novaAttr}>
                <div class="chat__toolbar-wrap">
                  <div class="chat__toolbar">
                    <button type="button" class="chat__toolbar-btn" data-acao="reagir-abrir" title="Reagir" aria-label="Reagir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c.9 1.2 2 1.8 3.5 1.8s2.6-.6 3.5-1.8"/><path d="M9.2 9.8h.01M14.8 9.8h.01"/></svg></button>
                    <button type="button" class="chat__toolbar-btn" data-acao="responder" title="Responder" aria-label="Responder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7L4.5 11.5 9 16"/><path d="M4.5 11.5H14a5.5 5.5 0 015.5 5.5v1"/></svg></button>
                    <button type="button" class="chat__toolbar-btn" data-acao="mais-abrir" title="Mais" aria-label="Mais opções" aria-haspopup="menu"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></svg></button>
                  </div>
                </div>
                <div class="chat__bolha" data-conteudo>${citacao}
                  ${m.texto ? `<span data-texto>${formatarConteudo(m.texto)}</span>${editada}` : ''}
                  ${m.anexo ? cartaoAnexo(m.anexo) : ''}
                </div>
                <div class="chat__reacoes" data-reacoes>${reacoes}</div>
                ${minha ? `<span class="chat__status" data-status data-criado="${escapeHtml(m.criado_em)}"></span>` : ''}
              </div>`;
      }

      grupoAutor = m.remetente_id;
      grupoHora = data.getTime();
    });
    fecharGrupo();

    refs.listaMsgs.innerHTML = html;
    atualizarStatusLeitura();
    estado.maxIdRenderizado = Math.max(limite, msgs[msgs.length - 1].id);

    const ultima = msgs[msgs.length - 1];
    // Só rola ao fim na 1ª carga, se já estava perto do fim ou se EU acabei de enviar uma nova
    // (reagir/editar/apagar mensagem antiga não pode empurrar a conversa pro fim)
    if (primeiraCarga || pertoDoFim || (ultima.remetente_id === meuId && ultima.id > limite)) {
      caixa.scrollTop = caixa.scrollHeight;
    }
    atualizarIrFim();
  }

  // Botão "Ir para o fim": aparece quando há mais de ~120px de conversa abaixo da área visível
  function atualizarIrFim() {
    const c = refs.mensagens;
    refs.irFim.hidden = c.scrollHeight - c.scrollTop - c.clientHeight < 120;
  }
  refs.mensagens.addEventListener('scroll', atualizarIrFim, { passive: true });
  refs.irFim.addEventListener('click', () => {
    refs.mensagens.scrollTo({ top: refs.mensagens.scrollHeight, behavior: 'smooth' });
  });

  // ------------------------------------------------------------
  // Polling (mensagens novas da conversa aberta)
  // ------------------------------------------------------------
  function iniciarPolling() {
    pararPolling();
    estado.pollTimer = setInterval(verificarNovasMensagens, INTERVALO_POLL_MS);
  }

  function pararPolling() {
    if (estado.pollTimer) {
      clearInterval(estado.pollTimer);
      estado.pollTimer = null;
    }
  }

  async function verificarNovasMensagens() {
    if (!estado.conversaAtivaId || document.hidden) return;
    const conversaId = estado.conversaAtivaId;
    try {
      const sinc = estado.sincEm ? '&sinc=' + encodeURIComponent(estado.sincEm) : '';
      const d = await apiJson('api/chat/mensagens.php?conversa_id=' + conversaId + '&depois_de=' + estado.ultimoMensagemId + sinc);
      if (conversaId !== estado.conversaAtivaId) return; // trocou de conversa enquanto esperava
      if (d.agora) estado.sincEm = d.agora;
      if (d.mensagens.length) {
        // Editando uma mensagem: guarda as novidades, mas só redesenha quando terminar (não perde o texto)
        if (estado.editandoId) mesclarSemRedesenhar(d.mensagens);
        else renderMensagens(d.mensagens, false);
        estado.ultimoMensagemId = Math.max(estado.ultimoMensagemId, d.mensagens[d.mensagens.length - 1].id);
      }
    } catch (e) {
      // Falha silenciosa: o próximo ciclo tenta de novo. Não interrompe o
      // uso da conversa por causa de uma instabilidade passageira de rede.
    }
    // Atualiza a lista em segundo plano (prévia/hora/não-lidas de outras conversas)
    carregarConversasSilencioso();
  }

  function mesclarSemRedesenhar(lista) {
    lista.forEach((m) => {
      const i = estado.mensagens.findIndex((x) => x.id === m.id);
      if (i === -1) estado.mensagens.push(m);
      else estado.mensagens[i] = m;
    });
    estado.mensagens.sort((a, b) => a.id - b.id);
  }

  let silenciosoEmAndamento = false;
  async function carregarConversasSilencioso() {
    if (silenciosoEmAndamento) return;
    silenciosoEmAndamento = true;
    try {
      const d = await apiJson('api/chat/conversas.php');
      estado.conversas = d.conversas;
      renderLista();
    } catch (e) {
      // ignora — a lista só fica uma atualização "atrasada"
    } finally {
      silenciosoEmAndamento = false;
    }
  }

  // ------------------------------------------------------------
  // Enviar mensagem
  // ------------------------------------------------------------
  function limparAnexoSelecionado() {
    estado.arquivoSelecionado = null;
    refs.inputArquivo.value = '';
    refs.anexoPreview.hidden = true;
    refs.anexoPreviewNome.textContent = '';
    atualizarBotaoEnviar();
  }

  function atualizarBotaoEnviar() {
    const temTexto = refs.inputTexto.value.trim() !== '';
    refs.btnEnviar.disabled = !temTexto && !estado.arquivoSelecionado;
  }

  async function enviarMensagem(e) {
    e.preventDefault();
    if (!estado.conversaAtivaId) return;

    const texto = refs.inputTexto.value.trim();
    const arquivo = estado.arquivoSelecionado;
    if (!texto && !arquivo) return;

    refs.btnEnviar.disabled = true;

    const formData = new FormData();
    formData.append('conversa_id', String(estado.conversaAtivaId));
    if (texto) formData.append('texto', texto);
    if (arquivo) formData.append('arquivo', arquivo);
    if (estado.respostaAtual) formData.append('resposta_a', String(estado.respostaAtual.id));

    const conversaId = estado.conversaAtivaId;

    try {
      const d = await apiFormData('api/chat/mensagens.php', formData);
      if (conversaId === estado.conversaAtivaId) {
        renderMensagens([d.mensagem], false);
        estado.ultimoMensagemId = Math.max(estado.ultimoMensagemId, d.mensagem.id);
      }
      refs.inputTexto.value = '';
      refs.inputTexto.style.height = '';
      if (editorApi) editorApi.limpar();
      cancelarResposta();
      limparAnexoSelecionado();
      esconderAviso();
      carregarConversasSilencioso();
    } catch (err) {
      mostrarAviso(err.message);
    }

    atualizarBotaoEnviar();
  }

  // ------------------------------------------------------------
  // Painel "Nova conversa"
  // ------------------------------------------------------------
  function abrirPainelNovo() {
    refs.novoFundo.hidden = false;
    refs.btnNovo.setAttribute('aria-expanded', 'true');
    refs.novoBusca.value = '';
    refs.novoLista.innerHTML = '';
    refs.novoVazio.hidden = true;
    buscarContatos('');
    setTimeout(() => refs.novoBusca.focus(), 0);
  }

  function fecharPainelNovo() {
    refs.novoFundo.hidden = true;
    refs.btnNovo.setAttribute('aria-expanded', 'false');
  }

  const buscarContatosDebounced = debounce((termo) => buscarContatos(termo), 250);

  async function buscarContatos(termo) {
    try {
      const d = await apiJson('api/chat/contatos.php?busca=' + encodeURIComponent(termo));
      renderContatos(d.contatos);
    } catch (e) {
      refs.novoLista.innerHTML = '';
      refs.novoVazio.hidden = false;
      refs.novoVazio.textContent = e.message;
    }
  }

  function renderContatos(contatos) {
    refs.novoVazio.hidden = contatos.length > 0;
    refs.novoVazio.textContent = 'Ninguém encontrado.';
    refs.novoLista.innerHTML = contatos.map((c) => `
      <li>
        <button type="button" class="chat__contato-item" data-usuario-id="${c.id}">
          <span class="chat__avatar chat__avatar--pequeno" aria-hidden="true">${escapeHtml(c.iniciais)}</span>
          <span class="chat__contato-texto">
            <span class="chat__contato-nome">${escapeHtml(c.nome)}</span>
            <span class="chat__contato-email">${escapeHtml(c.email)}</span>
          </span>
        </button>
      </li>`).join('');

    refs.novoLista.querySelectorAll('[data-usuario-id]').forEach((el) => {
      el.addEventListener('click', () => iniciarConversaCom(Number(el.getAttribute('data-usuario-id'))));
    });
  }

  async function iniciarConversaCom(usuarioId) {
    try {
      const d = await apiJson('api/chat/iniciar.php', { metodo: 'POST', corpo: { usuario_id: usuarioId } });
      fecharPainelNovo();

      // Garante que a conversa já apareça na lista mesmo sendo a primeira vez
      if (!estado.conversas.find((c) => c.id === d.conversa_id)) {
        estado.conversas.unshift({
          id: d.conversa_id, usuario: d.usuario, ultima_mensagem: null,
          ultima_de_mim: null, ultima_em: new Date().toISOString(), nao_lidas: 0,
        });
      }
      await abrirConversa(d.conversa_id, d.usuario);
      await carregarConversasSilencioso();
    } catch (e) {
      refs.novoVazio.hidden = false;
      refs.novoVazio.textContent = e.message;
    }
  }

  // ------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------
  // Menu lateral: "Recolher" (mesmo comportamento das demais páginas)
  const btnRecolher = $('btnRecolher');
  if (btnRecolher) btnRecolher.addEventListener('click', () => document.body.classList.remove('sidebar-open'));

  refs.btnNovo.addEventListener('click', abrirPainelNovo);
  refs.novoFechar.addEventListener('click', fecharPainelNovo);
  refs.novoFundo.addEventListener('click', (e) => { if (e.target === refs.novoFundo) fecharPainelNovo(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !refs.novoFundo.hidden) fecharPainelNovo();
  });
  refs.novoBusca.addEventListener('input', () => buscarContatosDebounced(refs.novoBusca.value));

  refs.buscaConversas.addEventListener('input', renderLista);
  refs.threadVoltar.addEventListener('click', fecharThreadMobile);

  refs.composer.addEventListener('submit', enviarMensagem);
  refs.inputTexto.addEventListener('input', () => {
    atualizarBotaoEnviar();
    refs.inputTexto.style.height = 'auto';
    refs.inputTexto.style.height = Math.min(refs.inputTexto.scrollHeight, 130) + 'px';
  });
  refs.inputTexto.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!refs.btnEnviar.disabled) refs.composer.requestSubmit();
    }
  });

  refs.inputArquivo.addEventListener('change', () => {
    const f = refs.inputArquivo.files && refs.inputArquivo.files[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      mostrarAviso('O arquivo é maior que o limite aceito (20 MB).');
      refs.inputArquivo.value = '';
      return;
    }
    estado.arquivoSelecionado = f;
    refs.anexoPreviewNome.textContent = f.name;
    refs.anexoPreview.hidden = false;
    atualizarBotaoEnviar();
  });
  refs.anexoPreviewRemover.addEventListener('click', limparAnexoSelecionado);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && estado.conversaAtivaId) verificarNovasMensagens();
  });


  // ============================================================
  // CAMPO DE ENVIO — mesmo padrão de Equipes
  // Anexar, campo que cresce, "A" (barra de formatação com editor
  // visual), seletor de emoji com busca/categorias/tom de pele e
  // botão enviar. A formatação vai como marcadores no texto
  // (**negrito**, *itálico*, __sublinhado__, ~~tachado~~, `código`,
  // [texto](link)) e é desenhada por formatarConteudo() — o backend
  // continua guardando só texto.
  // O seletor de emoji usa a lista e os recentes/tom de pele de Equipes.
  // ============================================================
  const EMOJI_RECENTES_CHAVE = 'equipes_emojis_recentes';
  const EMOJI_RECENTES_MAX = 24;
  const EMOJI_CATEGORIAS = window.EQUIPES_EMOJIS || [];
  const EMOJI_TONS = window.EQUIPES_EMOJIS_TONS || {};
  const EMOJI_TOM_CHAVE = 'equipes_emoji_tom';
  const semAcento = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  let editorApi = null;

  function fecharPopoversComposer(excetoEste) {
    const emoji = $('chatEmojiPopover');
    if (emoji !== excetoEste) emoji.hidden = true;
    if (emoji !== excetoEste) $('chatBtnEmoji').classList.remove('chat__composer-btn--ativo');
  }

  // ------------------------------------------------------------------
  // Editor com formatação visual (estilo Microsoft Teams)
  // O <textarea> continua sendo a "fonte da verdade" (envio, menção, retry
  // e comandos seguem iguais). Quando o editor está aberto, ele escreve no
  // textarea uma versão em marcadores (**negrito**, *itálico*, __sublinhado__,
  // ~~tachado~~, `código`, [texto](link)) que formatarConteudo() já renderiza.
  // ------------------------------------------------------------------

  function iniciarEditorFormatacao(campo, form) {
    const editor = $('chatEditor');
    const barra = $('chatFormatacao');
    const btnA = $('chatBtnFormatar');
    let ativo = false;
    let ultimaSelecao = null;

    // Diálogo "Inserir link"
    const dlg = $('chatLinkDialogo');
    const dlgTexto = $('chatLinkTexto');
    const dlgEnd = $('chatLinkEndereco');
    const dlgErro = $('chatLinkErro');
    const dlgInserir = $('chatLinkInserir');
    const btnLink = barra.querySelector('[data-formatar="link"]');
    let linkEmEdicao = null;

    function marcadoresParaHtml(texto) {
      let t = escapeHtml(texto);
      t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      t = t.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>');
      t = t.replace(/__([^_]+)__/g, '<u>$1</u>');
      t = t.replace(/~~([^~]+)~~/g, '<s>$1</s>');
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
      t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
      return t.replace(/\n/g, '<br>');
    }

    function noParaMarcadores(no) {
      if (no.nodeType === 3) return no.nodeValue.replace(/\u00a0/g, ' ').replace(/\u200b/g, '');
      if (no.nodeType !== 1) return '';
      const tag = no.tagName;
      if (tag === 'BR') return '\n';

      if (tag === 'UL' || tag === 'OL') {
        let n = 0;
        return Array.from(no.children).map((li) => {
          n += 1;
          return (tag === 'OL' ? n + '. ' : '- ') + filhosParaMarcadores(li).replace(/\n+$/, '');
        }).join('\n');
      }

      const dentro = filhosParaMarcadores(no);
      if (!dentro.trim()) return dentro;
      if (tag === 'B' || tag === 'STRONG') return '**' + dentro + '**';
      if (tag === 'I' || tag === 'EM') return '*' + dentro + '*';
      if (tag === 'U') return '__' + dentro + '__';
      if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') return '~~' + dentro + '~~';
      if (tag === 'CODE') return '`' + dentro + '`';
      if (tag === 'A') {
        const href = no.getAttribute('href') || '';
        return /^https?:\/\//i.test(href) ? '[' + dentro + '](' + href + ')' : dentro;
      }
      return dentro;
    }

    function filhosParaMarcadores(pai) {
      let saida = '';
      pai.childNodes.forEach((filho) => {
        const bloco = filho.nodeType === 1 && /^(DIV|P|UL|OL)$/.test(filho.tagName);
        if (bloco) {
          if (saida && !saida.endsWith('\n')) saida += '\n';
          saida += noParaMarcadores(filho) + '\n';
        } else {
          saida += noParaMarcadores(filho);
        }
      });
      return saida;
    }

    function editorParaCampo() {
      const texto = filhosParaMarcadores(editor).replace(/\n{3,}/g, '\n\n').trim();
      campo.value = texto;
      campo.dispatchEvent(new Event('input'));
    }

    function campoParaEditor() {
      editor.innerHTML = marcadoresParaHtml(campo.value);
    }

    function atualizarEstadoBotoes() {
      if (!ativo) return;
      barra.querySelectorAll('[data-cmd]').forEach((b) => {
        let on = false;
        try { on = document.queryCommandState(b.getAttribute('data-cmd')); } catch (e) { on = false; }
        b.classList.toggle('chat__formatacao-ativo', !!on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function guardarSelecao() {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
        ultimaSelecao = sel.getRangeAt(0).cloneRange();
      }
      atualizarEstadoBotoes();
    }

    function restaurarSelecao() {
      editor.focus();
      if (!ultimaSelecao) return;
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(ultimaSelecao);
    }

    function abrir() {
      if (ativo) return;
      ativo = true;
      campoParaEditor();
      form.classList.add('chat__composer--expandido');
      barra.hidden = false;
      campo.hidden = true;
      editor.hidden = false;
      btnA.classList.add('chat__composer-btn--ativo');
      btnA.setAttribute('aria-pressed', 'true');
      editor.focus();
      const r = document.createRange();
      r.selectNodeContents(editor);
      r.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      guardarSelecao();
    }

    function fechar() {
      if (!ativo) return;
      fecharDialogoLink(false);
      editorParaCampo();
      ativo = false;
      form.classList.remove('chat__composer--expandido');
      barra.hidden = true;
      editor.hidden = true;
      campo.hidden = false;
      btnA.classList.remove('chat__composer-btn--ativo');
      btnA.setAttribute('aria-pressed', 'false');
      campo.focus();
      campo.style.height = 'auto';
      campo.style.height = Math.min(campo.scrollHeight, 130) + 'px';
    }

    // O Chrome repete <u>/<b>/<i> na linha nova mesmo depois de desligados no cursor.
    // Antes do Enter, tira o cursor de dentro das tags cujo estado já está desligado.
    function sairDeFormatosDesligados() {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
      const mapa = { B: 'bold', STRONG: 'bold', I: 'italic', EM: 'italic', U: 'underline', S: 'strikeThrough', STRIKE: 'strikeThrough' };
      let el = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
      let alvo = null;
      while (el && el !== editor) {
        const cmd = mapa[el.tagName];
        let ligado = true;
        if (cmd) { try { ligado = document.queryCommandState(cmd); } catch (e) { ligado = true; } }
        if (cmd && !ligado) alvo = el;
        el = el.parentElement;
      }
      if (!alvo) return;
      const r = sel.getRangeAt(0);
      const fim = document.createRange();
      fim.selectNodeContents(alvo);
      fim.setStart(r.endContainer, r.endOffset);
      if (fim.toString().length) return; // cursor no meio do trecho: não mexe
      const ancora = document.createTextNode('\u200b');
      alvo.after(ancora);
      const nova = document.createRange();
      nova.setStart(ancora, 1);
      nova.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nova);
    }

    // ---- Inserir link (diálogo com "Texto a ser exibido" + "Endereço") ----
    // Devolve a URL normalizada, '' se estiver vazio ou null se for inválida.
    function normalizarUrl(valor) {
      let url = (valor || '').trim();
      if (!url) return '';
      if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:\/\//i.test(url)) return null; // só http(s)
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      return /^https?:\/\/[^\s]+\.[^\s]{2,}$|^https?:\/\/localhost(:\d+)?([/?#][^\s]*)?$/i.test(url) ? url : null;
    }

    function atualizarBotaoInserir() {
      dlgInserir.disabled = !dlgEnd.value.trim();
    }

    function abrirDialogoLink() {
      restaurarSelecao();
      const sel = window.getSelection();
      linkEmEdicao = null;
      let texto = '';
      let href = '';
      if (sel && sel.rangeCount) {
        const base = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
        const a = base && base.closest ? base.closest('a') : null;
        if (a && editor.contains(a)) {
          linkEmEdicao = a; // cursor dentro de um link: edita em vez de criar outro
          texto = a.textContent;
          href = a.getAttribute('href') || '';
        } else {
          texto = sel.toString();
        }
      }
      dlgTexto.value = texto;
      dlgEnd.value = href;
      dlgErro.hidden = true;
      atualizarBotaoInserir();
      dlg.hidden = false;
      if (btnLink) { btnLink.classList.add('chat__formatacao-ativo'); btnLink.setAttribute('aria-expanded', 'true'); }
      setTimeout(() => (texto ? dlgEnd : dlgTexto).focus(), 0);
    }

    function fecharDialogoLink(devolverFoco) {
      if (dlg.hidden) return;
      dlg.hidden = true;
      linkEmEdicao = null;
      if (btnLink) { btnLink.classList.remove('chat__formatacao-ativo'); btnLink.setAttribute('aria-expanded', 'false'); }
      if (devolverFoco) restaurarSelecao();
    }

    function confirmarLink() {
      const url = normalizarUrl(dlgEnd.value);
      if (!url) { dlgErro.hidden = false; dlgEnd.focus(); return; }
      const texto = dlgTexto.value.trim() || url;
      const editando = linkEmEdicao && editor.contains(linkEmEdicao) ? linkEmEdicao : null;
      fecharDialogoLink(false);
      restaurarSelecao();
      if (editando) {
        editando.setAttribute('href', url);
        editando.textContent = texto;
      } else {
        document.execCommand('insertHTML', false, '<a href="' + escapeHtml(url) + '">' + escapeHtml(texto) + '</a>&nbsp;');
      }
      editorParaCampo();
      guardarSelecao();
    }

    dlg.addEventListener('click', (e) => e.stopPropagation());
    dlgTexto.addEventListener('input', () => { dlgErro.hidden = true; });
    dlgEnd.addEventListener('input', () => { dlgErro.hidden = true; atualizarBotaoInserir(); });
    $('chatLinkCancelar').addEventListener('click', () => fecharDialogoLink(true));
    dlgInserir.addEventListener('click', confirmarLink);
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { // evita enviar a mensagem (o diálogo fica dentro do <form>)
        e.preventDefault();
        if (dlgEnd.value.trim()) confirmarLink(); else dlgEnd.focus();
      }
    });
    // Esc fecha o diálogo esteja o foco onde estiver (editor ou campos do diálogo)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dlg.hidden) { e.preventDefault(); fecharDialogoLink(true); }
    });
    document.addEventListener('click', (e) => {
      if (!dlg.hidden && !dlg.contains(e.target) && !e.target.closest('[data-formatar="link"]')) fecharDialogoLink(false);
    });

    function descartar() {
      fecharDialogoLink(false);
      editor.innerHTML = '';
      campo.value = '';
      campo.dispatchEvent(new Event('input'));
      fechar();
    }

    // Botão "A"
    btnA.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ativo) fechar(); else abrir();
    });

    // Botões da barra (mousedown preventDefault mantém a seleção do texto)
    barra.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    barra.addEventListener('click', (e) => e.stopPropagation());
    barra.querySelectorAll('[data-formatar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tipo = btn.getAttribute('data-formatar');
        if (tipo === 'link') return dlg.hidden ? abrirDialogoLink() : fecharDialogoLink(true);
        fecharDialogoLink(false);
        restaurarSelecao();
        document.execCommand(btn.getAttribute('data-cmd'), false, null);
        editorParaCampo();
        guardarSelecao();
      });
    });
    $('chatFormatacaoDescartar').addEventListener('click', descartar);

    // Digitação no editor
    editor.addEventListener('input', () => {
      if (!editor.textContent.trim() && !editor.querySelector('li')) editor.innerHTML = '';
      editorParaCampo();
      guardarSelecao();
    });
    editor.addEventListener('keyup', guardarSelecao);
    editor.addEventListener('mouseup', guardarSelecao);
    editor.addEventListener('blur', guardarSelecao);
    document.addEventListener('selectionchange', () => {
      if (ativo && document.activeElement === editor) guardarSelecao();
    });

    // Colar sempre como texto simples (evita trazer HTML/estilos de fora)
    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const texto = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, texto);
    });

    // Teams: com a formatação aberta, Enter = nova linha e Ctrl+Enter envia
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        form.requestSubmit();
        return;
      }
      if (e.key === 'Enter') sairDeFormatosDesligados();
      if (e.key === 'Escape') {
      }
    });

    return {
      ativo: () => ativo,
      inserirTexto(texto) {
        restaurarSelecao();
        document.execCommand('insertText', false, texto);
        editorParaCampo();
      },
      sincronizar() { if (ativo) campoParaEditor(); },
      limpar() { if (ativo) { editor.innerHTML = ''; fechar(); } },
    };
  }

  function inserirNoCursor(campo, texto) {
    if (editorApi && editorApi.ativo()) { editorApi.inserirTexto(texto); return; }
    const inicio = campo.selectionStart, fim = campo.selectionEnd;
    campo.value = campo.value.slice(0, inicio) + texto + campo.value.slice(fim);
    const pos = inicio + texto.length;
    campo.setSelectionRange(pos, pos);
    campo.focus();
    campo.style.height = 'auto';
    campo.style.height = Math.min(campo.scrollHeight, 130) + 'px';
  }


  function iniciarComposerRico() {
    const form = refs.composer;
    const campo = refs.inputTexto;
    const btnAnexar = $('chatBtnAnexar');
    if (btnAnexar) btnAnexar.addEventListener('click', () => refs.inputArquivo.click());

    // Formatação (estilo Teams): botão "A" expande o campo com barra + editor visual
    editorApi = iniciarEditorFormatacao(campo, form);

    // Emoji (seletor com busca + categorias)
    const btnEmoji = $('chatBtnEmoji');
    const emojiPopover = $('chatEmojiPopover');
    const emojiBusca = $('chatEmojiBusca');
    emojiPopover.addEventListener('click', (e) => e.stopPropagation());

    function emojisRecentes() {
      try {
        return JSON.parse(localStorage.getItem(EMOJI_RECENTES_CHAVE) || '[]');
      } catch (e) { return []; }
    }

    function registrarEmojiRecente(emoji) {
      const atuais = emojisRecentes().filter((e) => e !== emoji);
      atuais.unshift(emoji);
      try {
        localStorage.setItem(EMOJI_RECENTES_CHAVE, JSON.stringify(atuais.slice(0, EMOJI_RECENTES_MAX)));
      } catch (e) { /* localStorage indisponível: segue sem persistir recentes */ }
    }

    function escolherEmoji(emoji) {
      inserirNoCursor(campo, emoji);
      atualizarBotaoEnviar();
      registrarEmojiRecente(emoji);
    }

    // ---- Seletor no formato do Teams: aba Emoji, busca, grade de 6
    // colunas com todas as categorias rolando juntas e barra de categorias embaixo.
    const grade = $('chatEmojiGrade');
    const barraCats = $('chatEmojiCategorias');
    let abaEmoji = 'emoji';
    const tomBtn = $('chatEmojiTomBtn');
    const tomMenu = $('chatEmojiTomMenu');
    const tomWrap = $('chatEmojiTomWrap');
    const AMOSTRA_TOM = '\u270B'; // ✋ + modificador de tom
    const MODIFICADORES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];
    const NOMES_TOM = ['Padrão', 'Claro', 'Médio-claro', 'Médio', 'Médio-escuro', 'Escuro'];
    let tomAtual = 0;
    try { tomAtual = Math.min(5, Math.max(0, parseInt(localStorage.getItem(EMOJI_TOM_CHAVE) || '0', 10) || 0)); } catch (e) { tomAtual = 0; }

    // Aplica o tom escolhido nos emojis que têm variação de pele
    function comTom(emoji) {
      if (!tomAtual) return emoji;
      const v = EMOJI_TONS[emoji];
      return (v && v[tomAtual - 1]) || emoji;
    }

    function atualizarBotaoTom() {
      tomBtn.textContent = AMOSTRA_TOM + MODIFICADORES[tomAtual];
      tomMenu.innerHTML = MODIFICADORES.map((m, i) =>
        `<button type="button" data-tom="${i}" class="${i === tomAtual ? 'chat__emoji-tom--ativo' : ''}" title="${NOMES_TOM[i]}" aria-label="${NOMES_TOM[i]}">${AMOSTRA_TOM}${m}</button>`
      ).join('');
    }

    function botaoEmojiHtml(emoji, nome) {
      const e = comTom(emoji);
      return `<button type="button" data-emoji="${e}" title="${escapeHtml(nome || '')}">${e}</button>`;
    }

    function secoesEmoji() {
      const secoes = [];
      const rec = emojisRecentes();
      if (rec.length) secoes.push({ id: 'recentes', icone: '🕒', titulo: 'Usados recentemente', itens: rec.map((e) => [e, 'recente']) });
      EMOJI_CATEGORIAS.forEach((c) => secoes.push(c));
      return secoes;
    }

    function renderizarAbaEmoji() {
      const secoes = secoesEmoji();
      grade.className = 'chat__emoji-grade';
      grade.innerHTML = secoes.map((c) =>
        `<div class="chat__emoji-grade-titulo" data-sec="${c.id}">${escapeHtml(c.titulo)}</div>` +
        c.itens.map(([e, n]) => botaoEmojiHtml(e, n)).join('')
      ).join('');
      barraCats.innerHTML = secoes.map((c) =>
        `<button type="button" class="chat__emoji-categoria" data-cat="${c.id}" title="${escapeHtml(c.titulo)}" aria-label="${escapeHtml(c.titulo)}">${c.icone}</button>`
      ).join('');
      barraCats.hidden = false;
      tomWrap.hidden = false;
      grade.scrollTop = 0;
      marcarCategoriaAtiva();
    }

    function marcarCategoriaAtiva() {
      const titulos = Array.from(grade.querySelectorAll('[data-sec]'));
      if (!titulos.length) return;
      let ativa = titulos[0].getAttribute('data-sec');
      titulos.forEach((t) => { if (t.offsetTop - grade.scrollTop <= 12) ativa = t.getAttribute('data-sec'); });
      barraCats.querySelectorAll('[data-cat]').forEach((b) => {
        b.classList.toggle('chat__emoji-categoria--ativa', b.getAttribute('data-cat') === ativa);
      });
    }

    function renderizarBusca(termo) {
      barraCats.hidden = true;
      tomWrap.hidden = false;
      grade.className = 'chat__emoji-grade';
      const achados = [];
      EMOJI_CATEGORIAS.forEach((c) => c.itens.forEach((item) => {
        if (semAcento(item[1]).includes(termo)) achados.push(item);
      }));
      grade.innerHTML = achados.length
        ? `<div class="chat__emoji-grade-titulo">Resultados</div>` + achados.map(([e, n]) => botaoEmojiHtml(e, n)).join('')
        : '<div class="chat__emoji-grade-vazio">Nenhum emoji encontrado.</div>';
      grade.scrollTop = 0;
    }

    function selecionarAbaEmoji(aba) {
      abaEmoji = aba;
      emojiPopover.querySelectorAll('[data-emoji-aba]').forEach((b) => {
        const on = b.getAttribute('data-emoji-aba') === aba;
        b.classList.toggle('chat__emoji-aba--ativa', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      emojiBusca.value = '';
      renderizarAbaEmoji();
    }

    // Cliques dentro do seletor (delegação: grade e barra são re-renderizadas)
    grade.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-emoji]');
      if (btn) escolherEmoji(btn.getAttribute('data-emoji'));
    });
    grade.addEventListener('scroll', marcarCategoriaAtiva);
    barraCats.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      const alvo = grade.querySelector(`[data-sec="${b.getAttribute('data-cat')}"]`);
      if (alvo) grade.scrollTo({ top: alvo.offsetTop, behavior: 'smooth' });
    });
    emojiPopover.querySelectorAll('[data-emoji-aba]').forEach((b) => {
      b.addEventListener('click', () => selecionarAbaEmoji(b.getAttribute('data-emoji-aba')));
    });

    tomBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tomMenu.hidden = !tomMenu.hidden;
      tomBtn.setAttribute('aria-expanded', String(!tomMenu.hidden));
    });
    tomMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-tom]');
      if (!b) return;
      tomAtual = parseInt(b.getAttribute('data-tom'), 10) || 0;
      try { localStorage.setItem(EMOJI_TOM_CHAVE, String(tomAtual)); } catch (err) { /* sem storage */ }
      tomMenu.hidden = true;
      tomBtn.setAttribute('aria-expanded', 'false');
      atualizarBotaoTom();
      const termo = semAcento(emojiBusca.value.trim());
      const topo = grade.scrollTop;
      if (termo) renderizarBusca(termo); else { renderizarAbaEmoji(); grade.scrollTop = topo; marcarCategoriaAtiva(); }
    });
    // Clicar em qualquer lugar do seletor fecha o menu de tons
    emojiPopover.addEventListener('click', () => { tomMenu.hidden = true; tomBtn.setAttribute('aria-expanded', 'false'); });

    function abrirEmojiPicker() {
      atualizarBotaoTom();
      selecionarAbaEmoji('emoji');
      setTimeout(() => emojiBusca.focus(), 0);
    }

    emojiBusca.addEventListener('input', () => {
      const termo = semAcento(emojiBusca.value.trim());
      if (!termo) { selecionarAbaEmoji(abaEmoji); return; }
      emojiPopover.querySelectorAll('[data-emoji-aba]').forEach((b) => {
        const on = b.getAttribute('data-emoji-aba') === 'emoji';
        b.classList.toggle('chat__emoji-aba--ativa', on);
      });
      renderizarBusca(termo);
    });
    emojiBusca.addEventListener('click', (e) => e.stopPropagation());

    btnEmoji.addEventListener('click', (e) => {
      e.stopPropagation();
      fecharPopoversComposer(emojiPopover);
      const vaiAbrir = emojiPopover.hidden;
      emojiPopover.hidden = !vaiAbrir;
      btnEmoji.classList.toggle('chat__composer-btn--ativo', vaiAbrir);
      if (vaiAbrir) abrirEmojiPicker();
    });

    document.addEventListener('click', () => {
      emojiPopover.hidden = true;
      btnEmoji.classList.remove('chat__composer-btn--ativo');
    });
  }

  // ------------------------------------------------------------
  // Ações do cabeçalho da conversa: ligar (telefone) e menu "mais opções"
  // A ligação é feita pela página Chamadas (que cuida da sala/WebRTC):
  // abrimos index.php?pagina=chamadas&ligar=<id>&midia=voz|video.
  // ------------------------------------------------------------
  const btnLigar = $('chatBtnLigar');
  const btnMais = $('chatBtnMais');
  const menuMais = $('chatMenuMais');

  function fecharMenuMais() {
    if (!menuMais) return;
    menuMais.hidden = true;
    btnMais.setAttribute('aria-expanded', 'false');
  }

  function ligarParaPessoa(midia, usuario, conversaId) {
    const u = usuario || estado.usuarioAtivo;
    if (!u || !u.id) return;
    // &conversa=<id>: ao desligar, a volta cai direto em ?pagina=chat&id=<conversa> (sem o recarregamento extra de ?usuario=)
    const conv = conversaId || (!usuario ? estado.conversaAtivaId : 0) || 0;
    window.location.href = 'index.php?pagina=chamadas&ligar=' + encodeURIComponent(u.id) + '&midia=' + midia + '&origem=chat' + (conv ? '&conversa=' + encodeURIComponent(conv) : '');
  }

  if (btnLigar) btnLigar.addEventListener('click', () => ligarParaPessoa('voz'));
  const btnVideo = $('chatBtnVideo');
  if (btnVideo) btnVideo.addEventListener('click', () => ligarParaPessoa('video'));

  if (btnMais && menuMais) {
    btnMais.addEventListener('click', (e) => {
      e.stopPropagation();
      const abrir = menuMais.hidden;
      menuMais.hidden = !abrir;
      btnMais.setAttribute('aria-expanded', String(abrir));
    });
    menuMais.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', fecharMenuMais);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMenuMais(); });

    // Silenciar conversa: guardado neste navegador (localStorage). Conversas
    // silenciadas deixam de aparecer/contar no sino de notificações do cabeçalho.
    const itemSilenciar = $('chatMenuSilenciar');

    function atualizarRotuloSilenciar() {
      itemSilenciar.textContent = lerSilenciadas().indexOf(estado.conversaAtivaId) !== -1
        ? 'Reativar notificações'
        : 'Silenciar conversa';
    }

    btnMais.addEventListener('click', atualizarRotuloSilenciar);

    itemSilenciar.addEventListener('click', () => {
      const id = estado.conversaAtivaId;
      if (!id) return;
      alternarSilencio(id);
      fecharMenuMais();
    });

    // Documentos trocados nesta conversa = aba "Arquivos" da própria conversa
    $('chatMenuDocumentos').addEventListener('click', () => { fecharMenuMais(); selecionarAba('arquivos'); });
    $('chatMenuChamadas').addEventListener('click', () => { fecharMenuMais(); selecionarAba('chamadas'); });
  }

  // ------------------------------------------------------------
  // Menu de contexto da conversa (botão direito / toque longo na lista)
  // Usa o mesmo menu do menu lateral (assets/js/menu-contexto.js).
  // Shift + botão direito continua abrindo o menu do navegador.
  // ------------------------------------------------------------
  function avisar(texto) {
    if (window.MenuContexto) window.MenuContexto.toast(texto);
  }

  function urlConversa(id) {
    return new URL('index.php?pagina=chat&id=' + encodeURIComponent(id), window.location.href).href;
  }

  // Silenciar / reativar (mesma lista lida pelo sino do cabeçalho)
  function alternarSilencio(id) {
    const c = estado.conversas.find((x) => x.id === id);
    const nome = c ? c.usuario.nome : 'conversa';
    let lista = lerSilenciadas();
    const silenciar = lista.indexOf(id) === -1;
    lista = silenciar ? lista.concat(id) : lista.filter((x) => x !== id);
    try { localStorage.setItem(CHAVE_SILENCIADAS, JSON.stringify(lista)); } catch (e) { /* sem storage */ }
    renderLista(); // mostra/esconde o ícone de silenciada na lista
    avisar(silenciar ? 'Conversa com ' + nome + ' silenciada' : 'Notificações de ' + nome + ' reativadas');
  }

  function alternarFixada(id) {
    const c = estado.conversas.find((x) => x.id === id);
    const nome = c ? c.usuario.nome : 'conversa';
    let lista = lerFixadas();
    const fixar = lista.indexOf(id) === -1;
    lista = fixar ? lista.concat(id) : lista.filter((x) => x !== id);
    try { localStorage.setItem(CHAVE_FIXADAS, JSON.stringify(lista)); } catch (e) { /* sem storage */ }
    renderLista(true);
    avisar(fixar ? 'Conversa com ' + nome + ' fixada no topo' : 'Conversa com ' + nome + ' desafixada');
  }

  function verArquivosDe(conversa) {
    if (estado.conversaAtivaId === conversa.id) { selecionarAba('arquivos'); return; }
    abrirConversa(conversa.id, conversa.usuario).then(() => selecionarAba('arquivos'));
  }

  function abrirMenuConversa(el, x, y) {
    const menu = window.MenuContexto;
    const id = Number(el.getAttribute('data-conversa-id'));
    const c = estado.conversas.find((k) => k.id === id);
    if (!menu || !c) return false;
    if (estado.menuConversaId === id && menu.aberto()) return true; // já aberto nesta conversa

    const silenciada = lerSilenciadas().indexOf(id) !== -1;
    const fixada = lerFixadas().indexOf(id) !== -1;

    estado.menuConversaId = id;
    el.classList.add('ml-alvo');

    menu.mostrar({
      x: x, y: y, alvo: null,
      aria: 'Opções da conversa com ' + c.usuario.nome,
      aoFechar: () => {
        estado.menuConversaId = null;
        refs.lista.querySelectorAll('.ml-alvo').forEach((n) => n.classList.remove('ml-alvo'));
      },
      cabeca: (cabeca) => {
        const av = document.createElement('span');
        av.className = 'ml-menu__cabeca-avatar';
        av.textContent = c.usuario.iniciais;
        const nome = document.createElement('span');
        nome.className = 'ml-menu__cabeca-nome';
        nome.textContent = c.usuario.nome;
        cabeca.appendChild(av);
        cabeca.appendChild(nome);
      },
      opcoes: [
        { rotulo: 'Abrir conversa', icone: 'mensagem', destaque: true,
          acao: () => abrirConversa(c.id, c.usuario) },
        { rotulo: 'Abrir em nova aba', icone: 'abrir',
          acao: () => window.open(urlConversa(id), '_blank', 'noopener') },
        { rotulo: 'Copiar link da conversa', icone: 'link',
          acao: () => menu.copiar(urlConversa(id), 'Link copiado') },
        'sep',
        { rotulo: 'Ligar', icone: 'telefone',
          acao: () => ligarParaPessoa('voz', c.usuario, c.id) },
        { rotulo: 'Chamada de vídeo', icone: 'telefone',
          acao: () => ligarParaPessoa('video', c.usuario, c.id) },
        { rotulo: 'Ver arquivos da conversa', icone: 'arquivos',
          acao: () => verArquivosDe(c) },
        'sep',
        { rotulo: fixada ? 'Desafixar do topo' : 'Fixar no topo', icone: fixada ? 'unpin' : 'pin',
          acao: () => alternarFixada(id) },
        { rotulo: silenciada ? 'Reativar notificações' : 'Silenciar conversa', icone: silenciada ? 'sino' : 'sinoOff',
          acao: () => alternarSilencio(id) },
      ],
    });
    return true;
  }

  const menuMsgFechado = { id: null, em: 0 };

  // ------------------------------------------------------------
  // Ações por mensagem (mesmo funcionamento de Equipes): reagir, responder,
  // e no "⋯": editar, copiar texto, apagar. Segundo clique no botão fecha.
  // ------------------------------------------------------------
  function fecharMenusMensagem() {
    document.querySelectorAll('.chat__msg-menu, .chat__reacao-picker, .chat__reacao-completo').forEach((el) => el.remove());
  }

  function mensagemPorId(id) {
    return estado.mensagens.find((x) => x.id === id);
  }

  // Aplica a mensagem devolvida pelo servidor e redesenha
  function aplicarMensagem(m) {
    if (!m) return;
    mesclarSemRedesenhar([m]);
    const topo = refs.mensagens.scrollTop;
    renderizarLista(false);
    refs.mensagens.scrollTop = topo;
    renderizarArquivos();
  }

  async function reagir(id, emoji) {
    try {
      const d = await apiJson('api/chat/mensagem.php', { metodo: 'POST', corpo: { id, acao: 'reagir', emoji } });
      aplicarMensagem(d.mensagem);
    } catch (e) {
      mostrarAviso(e.message);
    }
  }

  function iniciarResposta(id) {
    const m = mensagemPorId(id);
    if (!m || m.apagada) return;
    const minha = m.remetente_id === meuId;
    const base = m.texto ? semMarcadores(m.texto) : (m.anexo ? '📎 ' + m.anexo.nome + '.' + m.anexo.extensao : '');
    estado.respostaAtual = {
      id: m.id,
      autor: minha ? 'Você' : ((estado.usuarioAtivo && estado.usuarioAtivo.nome) || ''),
      trecho: base.slice(0, 140),
    };
    refs.respostaAutor.textContent = estado.respostaAtual.autor;
    refs.respostaTrecho.textContent = estado.respostaAtual.trecho;
    refs.respostaPreview.hidden = false;
    refs.inputTexto.focus();
  }

  function cancelarResposta() {
    estado.respostaAtual = null;
    refs.respostaPreview.hidden = true;
  }

  refs.respostaFechar.addEventListener('click', cancelarResposta);

  function iniciarEdicao(id) {
    const m = mensagemPorId(id);
    const el = refs.listaMsgs.querySelector('[data-msg-id="' + id + '"] [data-conteudo]');
    if (!m || !m.texto || !el) return;
    if (estado.editandoId && estado.editandoId !== id) renderizarLista(false); // fecha outra edição aberta
    estado.editandoId = id;
    el.innerHTML = `
      <div class="chat__edicao">
        <textarea rows="2" aria-label="Editar mensagem">${escapeHtml(m.texto)}</textarea>
        <div class="chat__edicao-acoes">
          <button type="button" class="chat__edicao-cancelar" data-op="cancelar">Cancelar</button>
          <button type="button" class="chat__edicao-salvar" data-op="salvar">Salvar</button>
        </div>
      </div>`;
    const campo = el.querySelector('textarea');
    campo.focus();
    campo.setSelectionRange(campo.value.length, campo.value.length);
    const ajustarAltura = () => { campo.style.height = 'auto'; campo.style.height = Math.min(campo.scrollHeight + 2, 200) + 'px'; };
    campo.addEventListener('input', ajustarAltura);
    ajustarAltura();
    el.scrollIntoView({ block: 'nearest' }); // mantém campo e botões visíveis

    function sair() {
      estado.editandoId = null;
      renderizarLista(false);
    }
    async function salvar() {
      const novo = campo.value.trim();
      if (!novo) return;
      if (novo === m.texto) { sair(); return; }
      try {
        const d = await apiJson('api/chat/mensagem.php', { metodo: 'POST', corpo: { id, acao: 'editar', texto: novo } });
        estado.editandoId = null;
        aplicarMensagem(d.mensagem);
      } catch (e) {
        mostrarAviso(e.message);
      }
    }
    el.querySelector('[data-op="cancelar"]').addEventListener('click', sair);
    el.querySelector('[data-op="salvar"]').addEventListener('click', salvar);
    campo.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); sair(); }
      else if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); salvar(); }
    });
  }

  async function apagarMensagem(id) {
    const D = window.IBDialogo;
    const confirmado = D && D.confirmar
      ? await D.confirmar({ titulo: 'Apagar mensagem?', texto: 'Esta mensagem será apagada para os dois participantes da conversa.', confirmar: 'Apagar', perigo: true })
      : window.confirm('Apagar esta mensagem para os dois participantes da conversa?');
    if (!confirmado) return;
    try {
      const d = await apiJson('api/chat/mensagem.php', { metodo: 'POST', corpo: { id, acao: 'apagar' } });
      cancelarRespostaSe(id); // se a prévia citava a mensagem apagada
      aplicarMensagem(d.mensagem);
      carregarConversasSilencioso(); // a prévia da lista pode ter sido essa mensagem
    } catch (e) {
      mostrarAviso(e.message);
    }
  }

  function cancelarRespostaSe(id) {
    if (estado.respostaAtual && estado.respostaAtual.id === id) { cancelarResposta(); return true; }
    return false;
  }

  function copiarTexto(m) {
    if (window.MenuContexto) window.MenuContexto.copiar(m.texto, 'Texto copiado');
    else if (navigator.clipboard) navigator.clipboard.writeText(m.texto).then(() => avisar('Texto copiado'));
  }

  function abrirPickerReacao(btn, id) {
    const wrap = btn.closest('.chat__toolbar-wrap');
    const jaAberto = wrap.querySelector('.chat__reacao-picker');
    fecharMenusMensagem();
    if (jaAberto) return; // segundo clique no botão: fecha
    const picker = document.createElement('div');
    picker.className = 'chat__reacao-picker';
    picker.setAttribute('role', 'menu');
    picker.innerHTML = EMOJIS_RAPIDOS.map((e) => `<button type="button" role="menuitem" data-rapido="${e}" aria-label="Reagir com ${e}">${e}</button>`).join('')
      + '<button type="button" class="chat__reacao-mais" data-mais-emojis aria-label="Mais emojis" title="Mais emojis"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 8.5v7M8.5 12h7"/></svg></button>';
    picker.querySelectorAll('[data-rapido]').forEach((b) => {
      b.addEventListener('click', (ev) => { ev.stopPropagation(); picker.remove(); reagir(id, b.getAttribute('data-rapido')); });
    });
    picker.querySelector('[data-mais-emojis]').addEventListener('click', (ev) => {
      ev.stopPropagation();
      picker.remove();
      abrirPickerCompleto(btn, id);
    });
    wrap.appendChild(picker);
    // Abre abaixo da barra; sem espaço embaixo (última mensagem), abre acima dela
    if (picker.getBoundingClientRect().bottom > refs.mensagens.getBoundingClientRect().bottom) {
      picker.style.top = (-picker.offsetHeight - 4) + 'px';
    }
    setTimeout(() => document.addEventListener('click', function fechar() {
      picker.remove();
      document.removeEventListener('click', fechar);
    }), 0);
  }

  // Seletor COMPLETO de emojis para reagir (como o do Teams): busca, tom de pele, categorias e recentes.
  // Usa a mesma lista, os mesmos recentes e o mesmo tom de pele do seletor do campo de texto.
  function abrirPickerCompleto(ancora, id) {
    fecharMenusMensagem();
    const pop = document.createElement('div');
    pop.className = 'chat__popover chat__popover--emoji chat__reacao-completo';
    pop.innerHTML = `
      <div class="chat__emoji-abas"><button type="button" class="chat__emoji-aba chat__emoji-aba--ativa">Emoji</button></div>
      <div class="chat__emoji-busca-linha">
        <div class="chat__emoji-busca">
          <input type="text" placeholder="Encontre algo divertido" autocomplete="off" aria-label="Buscar emoji">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </div>
        <div class="chat__emoji-tom-wrap">
          <button type="button" class="chat__emoji-tom-btn" aria-label="Tom de pele" aria-haspopup="true" aria-expanded="false" title="Tom de pele">✋</button>
          <div class="chat__emoji-tom-menu" hidden></div>
        </div>
      </div>
      <div class="chat__emoji-grade"></div>
      <div class="chat__emoji-categorias"></div>`;
    document.body.appendChild(pop);

    const busca = pop.querySelector('input');
    const grade = pop.querySelector('.chat__emoji-grade');
    const barra = pop.querySelector('.chat__emoji-categorias');
    const tomBtn = pop.querySelector('.chat__emoji-tom-btn');
    const tomMenu = pop.querySelector('.chat__emoji-tom-menu');

    const AMOSTRA_TOM = '\u270B';
    const MODIFICADORES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];
    const NOMES_TOM = ['Padrão', 'Claro', 'Médio-claro', 'Médio', 'Médio-escuro', 'Escuro'];
    let tom = 0;
    try { tom = Math.min(5, Math.max(0, parseInt(localStorage.getItem(EMOJI_TOM_CHAVE) || '0', 10) || 0)); } catch (e) { tom = 0; }
    const comTom = (e) => (tom ? ((EMOJI_TONS[e] && EMOJI_TONS[e][tom - 1]) || e) : e);
    const botao = (e, n) => { const x = comTom(e); return `<button type="button" data-emoji="${x}" title="${escapeHtml(n || '')}">${x}</button>`; };

    function atualizarBotaoTom() {
      tomBtn.textContent = AMOSTRA_TOM + MODIFICADORES[tom];
      tomMenu.innerHTML = MODIFICADORES.map((m, i) =>
        `<button type="button" data-tom="${i}" class="${i === tom ? 'chat__emoji-tom--ativo' : ''}" title="${NOMES_TOM[i]}" aria-label="${NOMES_TOM[i]}">${AMOSTRA_TOM}${m}</button>`
      ).join('');
    }
    function recentes() {
      try { return JSON.parse(localStorage.getItem(EMOJI_RECENTES_CHAVE) || '[]'); } catch (e) { return []; }
    }
    function guardarRecente(e) {
      const lista = recentes().filter((x) => x !== e);
      lista.unshift(e);
      try { localStorage.setItem(EMOJI_RECENTES_CHAVE, JSON.stringify(lista.slice(0, EMOJI_RECENTES_MAX))); } catch (err) { /* sem storage */ }
    }
    function marcarAtiva() {
      const titulos = Array.from(grade.querySelectorAll('[data-sec]'));
      if (!titulos.length) return;
      let ativa = titulos[0].getAttribute('data-sec');
      titulos.forEach((t) => { if (t.offsetTop - grade.scrollTop <= 12) ativa = t.getAttribute('data-sec'); });
      barra.querySelectorAll('[data-cat]').forEach((b) => b.classList.toggle('chat__emoji-categoria--ativa', b.getAttribute('data-cat') === ativa));
    }
    function desenharTudo() {
      const secoes = [];
      const rec = recentes();
      if (rec.length) secoes.push({ id: 'recentes', icone: '🕒', titulo: 'Usados recentemente', itens: rec.map((e) => [e, 'recente']) });
      EMOJI_CATEGORIAS.forEach((c) => secoes.push(c));
      grade.innerHTML = secoes.map((c) => `<div class="chat__emoji-grade-titulo" data-sec="${c.id}">${escapeHtml(c.titulo)}</div>` + c.itens.map(([e, n]) => botao(e, n)).join('')).join('');
      barra.innerHTML = secoes.map((c) => `<button type="button" class="chat__emoji-categoria" data-cat="${c.id}" title="${escapeHtml(c.titulo)}" aria-label="${escapeHtml(c.titulo)}">${c.icone}</button>`).join('');
      barra.hidden = false;
      grade.scrollTop = 0;
      marcarAtiva();
    }
    function desenharBusca(termo) {
      barra.hidden = true;
      const achados = [];
      EMOJI_CATEGORIAS.forEach((c) => c.itens.forEach((item) => { if (semAcento(item[1]).includes(termo)) achados.push(item); }));
      grade.innerHTML = achados.length
        ? '<div class="chat__emoji-grade-titulo">Resultados</div>' + achados.map(([e, n]) => botao(e, n)).join('')
        : '<div class="chat__emoji-grade-vazio">Nenhum emoji encontrado.</div>';
      grade.scrollTop = 0;
    }

    atualizarBotaoTom();
    desenharTudo();
    grade.addEventListener('scroll', marcarAtiva);
    grade.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-emoji]');
      if (!b) return;
      const e = b.getAttribute('data-emoji');
      guardarRecente(e);
      fechar();
      reagir(id, e);
    });
    barra.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-cat]');
      const alvo = b && grade.querySelector(`[data-sec="${b.getAttribute('data-cat')}"]`);
      if (alvo) grade.scrollTo({ top: alvo.offsetTop, behavior: 'smooth' });
    });
    busca.addEventListener('input', () => {
      const termo = semAcento(busca.value.trim());
      if (termo) desenharBusca(termo); else desenharTudo();
    });

    // Tom de pele (mesmo botão ✋ do seletor do campo de texto)
    tomBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      tomMenu.hidden = !tomMenu.hidden;
      tomBtn.setAttribute('aria-expanded', String(!tomMenu.hidden));
    });
    tomMenu.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const b = ev.target.closest('[data-tom]');
      if (!b) return;
      tom = parseInt(b.getAttribute('data-tom'), 10) || 0;
      try { localStorage.setItem(EMOJI_TOM_CHAVE, String(tom)); } catch (err) { /* sem storage */ }
      tomMenu.hidden = true;
      tomBtn.setAttribute('aria-expanded', 'false');
      atualizarBotaoTom();
      const termo = semAcento(busca.value.trim());
      const topo = grade.scrollTop;
      if (termo) desenharBusca(termo); else { desenharTudo(); grade.scrollTop = topo; marcarAtiva(); }
    });
    pop.addEventListener('click', () => { tomMenu.hidden = true; tomBtn.setAttribute('aria-expanded', 'false'); });

    // Posição: ao lado da barra de ações da mensagem (mesma altura), longe do balão,
    // e sempre dentro da área da conversa (nunca por cima da lista lateral).
    const barraEl = ancora.closest('.chat__toolbar') || ancora;
    const r = barraEl.getBoundingClientRect();
    const area = refs.mensagens.getBoundingClientRect();
    const larg = pop.offsetWidth || 330;
    const alt = pop.offsetHeight || 380;
    const minhaMsg = !!ancora.closest('.chat__msg--minha');
    const limEsq = Math.max(8, area.left + 8);
    const limDir = Math.max(limEsq, Math.min(window.innerWidth - larg - 8, area.right - larg - 8));
    const desejado = minhaMsg ? r.right - larg : r.left;
    pop.style.left = Math.min(Math.max(limEsq, desejado), limDir) + 'px';
    pop.style.top = Math.max(8, Math.min(r.top, window.innerHeight - alt - 8)) + 'px';
    setTimeout(() => busca.focus(), 0);

    function fechar() {
      pop.remove();
      document.removeEventListener('mousedown', fora, true);
      document.removeEventListener('keydown', tecla, true);
      refs.mensagens.removeEventListener('scroll', fechar);
    }
    function fora(ev) { if (!pop.contains(ev.target)) fechar(); }
    function tecla(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); fechar(); } }
    document.addEventListener('mousedown', fora, true);
    document.addEventListener('keydown', tecla, true);
    refs.mensagens.addEventListener('scroll', fechar);
  }

  function abrirMenuMais(btn, id) {
    const wrap = btn.closest('.chat__toolbar-wrap');
    const m = mensagemPorId(id);
    const jaAberto = wrap.querySelector('.chat__msg-menu');
    fecharMenusMensagem();
    if (jaAberto || !m) return; // segundo clique no botão: fecha

    const menu = document.createElement('div');
    menu.className = 'chat__msg-menu';
    menu.setAttribute('role', 'menu');
    const item = (rotulo, op) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat__msg-menu-item';
      b.setAttribute('role', 'menuitem');
      b.textContent = rotulo;
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        fecharMenusMensagem();
        op();
      });
      menu.appendChild(b);
    };
    const minha = m.remetente_id === meuId;
    if (minha && m.texto) item('Editar', () => iniciarEdicao(id));
    if (m.texto) item('Copiar texto', () => copiarTexto(m));
    if (m.anexo) item('Ver arquivos da conversa', () => selecionarAba('arquivos'));
    if (minha) item('Apagar', () => apagarMensagem(id));
    wrap.appendChild(menu);

    // Abre abaixo da barra; se não couber (última mensagem), abre acima dela
    if (menu.getBoundingClientRect().bottom > refs.mensagens.getBoundingClientRect().bottom) {
      menu.style.top = (-menu.offsetHeight - 4) + 'px';
    }
    setTimeout(() => document.addEventListener('click', function fechar() {
      fecharMenusMensagem();
      document.removeEventListener('click', fechar);
    }), 0);
  }

  refs.listaMsgs.addEventListener('click', (e) => {
    const msgEl = e.target.closest('[data-msg-id]');
    if (!msgEl) return;
    const id = Number(msgEl.getAttribute('data-msg-id'));

    const chip = e.target.closest('[data-reagir]');
    if (chip) { e.stopPropagation(); reagir(id, chip.getAttribute('data-reagir')); return; }

    const btn = e.target.closest('[data-acao]');
    if (!btn) return;
    const acao = btn.getAttribute('data-acao');
    e.stopPropagation();

    if (acao === 'reagir-abrir') abrirPickerReacao(btn, id);
    else if (acao === 'mais-abrir') abrirMenuMais(btn, id);
    else if (acao === 'responder') {
      fecharMenusMensagem();
      if (estado.respostaAtual && estado.respostaAtual.id === id) cancelarResposta(); // segundo clique cancela
      else iniciarResposta(id);
    }
  });

  // Botão direito numa mensagem da conversa aberta (links, imagens e a edição inline mantêm o menu do navegador)
  refs.listaMsgs.addEventListener('contextmenu', (e) => {
    const M = window.MenuContexto;
    const el = e.target.closest('[data-msg-id]');
    if (!M || !el || e.shiftKey || M.temSelecao()) return;
    if (e.target.closest('a[href], img, textarea, input, button')) return;
    const id = Number(el.getAttribute('data-msg-id'));
    const m = mensagemPorId(id);
    if (!m || m.apagada || (!m.texto && !m.anexo)) return;
    e.preventDefault();
    fecharMenusMensagem();
    // Segundo botão direito na mesma mensagem: o menu já foi fechado pelo clique; não reabre.
    if (menuMsgFechado.id === id && Date.now() - menuMsgFechado.em < 500) { menuMsgFechado.id = null; return; }
    const pos = M.posicao(e, el);
    const minha = m.remetente_id === meuId;
    const opcoes = [
      { rotulo: 'Responder', icone: 'responder', destaque: true, acao: () => iniciarResposta(id) },
    ];
    if (m.texto) {
      opcoes.push({ rotulo: 'Copiar texto', icone: 'copiar', acao: () => copiarTexto(m) });
    }
    if (m.anexo) {
      opcoes.push({ rotulo: 'Ver arquivos da conversa', icone: 'arquivos', acao: () => selecionarAba('arquivos') });
    }
    if (minha) {
      opcoes.push('sep');
      if (m.texto) opcoes.push({ rotulo: 'Editar', icone: 'editar', acao: () => iniciarEdicao(id) });
      opcoes.push({ rotulo: 'Apagar', icone: 'lixeira', perigo: true, acao: () => apagarMensagem(id) });
    }
    const nome = minha ? 'Você' : ((estado.usuarioAtivo && estado.usuarioAtivo.nome) || 'Mensagem');
    M.mostrar({
      x: pos.x, y: pos.y, alvo: null,
      aria: 'Opções da mensagem',
      cabeca: M.cabeca('mensagem', nome),
      opcoes: opcoes,
      aoFechar: () => { menuMsgFechado.id = id; menuMsgFechado.em = Date.now(); },
    });
  });

  refs.lista.addEventListener('contextmenu', (e) => {
    const el = e.target.closest('[data-conversa-id]');
    if (!el || e.shiftKey || !window.MenuContexto) return; // sem o menu global: fica o do navegador
    e.preventDefault();
    let x = e.clientX, y = e.clientY;
    if (!x && !y) { // aberto pelo teclado (tecla Menu / Shift+F10)
      const r = el.getBoundingClientRect();
      x = r.left + 40; y = r.bottom - 6;
    }
    abrirMenuConversa(el, x, y);
  });

  // Toque longo (iOS não dispara "contextmenu" em botões)
  (function () {
    let timer = null, bloquearCliqueAte = 0;
    refs.lista.addEventListener('touchstart', (e) => {
      const el = e.target.closest('[data-conversa-id]');
      if (!el || e.touches.length !== 1) return;
      const t = e.touches[0];
      clearTimeout(timer);
      timer = setTimeout(() => {
        bloquearCliqueAte = Date.now() + 700;
        abrirMenuConversa(el, t.clientX, t.clientY);
      }, 550);
    }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => {
      refs.lista.addEventListener(ev, () => clearTimeout(timer), { passive: true });
    });
    // o toque que abriu o menu não pode abrir a conversa também
    refs.lista.addEventListener('click', (e) => {
      if (Date.now() < bloquearCliqueAte) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  })();

  // ------------------------------------------------------------
  // Início
  // ------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  iniciarComposerRico();

  carregarConversas().then(() => {
    // index.php?pagina=chat&id=<conversa>: abre a conversa direto
    const idUrl = Number(params.get('id') || 0);
    if (idUrl) {
      const c = estado.conversas.find((x) => x.id === idUrl);
      if (c) abrirConversa(c.id, c.usuario);
    }
  });

  // Resumo de uma chamada feita a partir daqui: aparece sobre a própria tela do Chat
  (function mostrarResumoChamada() {
    // Com ?usuario=<id> o cabeçalho cria/abre a conversa e RECARREGA a página em ?id=<conversa>:
    // o resumo fica guardado e só aparece nessa segunda carga (senão sumia junto com o recarregamento).
    if (params.get('usuario')) return;
    let r = null;
    try { r = JSON.parse(sessionStorage.getItem('chatResumoChamada') || 'null'); sessionStorage.removeItem('chatResumoChamada'); } catch (e) { r = null; }
    const modal = $('chatPos');
    if (!r || !modal) return;
    const aviso = r.tipo === 'aviso';
    $('chatPosTitulo').textContent = aviso ? r.titulo : 'Chamada encerrada';
    $('chatPosTexto').hidden = !aviso;
    $('chatPosTexto').textContent = aviso ? r.texto : '';
    $('chatPosResumo').hidden = aviso;
    if (!aviso) { $('chatPosDuracao').textContent = r.duracao || '00:00'; $('chatPosPartes').textContent = r.partes || 'Você'; }
    $('chatPosIcone').className = 'chat__pos-icone' + (aviso ? ' chat__pos-icone--aviso' : '');
    $('chatPosIcone').innerHTML = aviso
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5M12 16.5v.01"/><circle cx="12" cy="12" r="9"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    modal.hidden = false;
    const fechar = () => { modal.hidden = true; }; // o fade de saída é do movimento.css (global)
    $('chatPosFechar').addEventListener('click', fechar);
    modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
    $('chatPosFechar').focus();
  })();

  // index.php?pagina=chat&novo=1: abre direto o painel "Nova conversa"
  if (params.get('novo') === '1') {
    abrirPainelNovo();
  }
})();
