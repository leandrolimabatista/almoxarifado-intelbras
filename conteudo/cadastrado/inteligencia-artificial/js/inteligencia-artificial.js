// ============================================================
// CONTEÚDO — Inteligência Artificial (área CADASTRADO)
// - Menu lateral: botão "Recolher" e tecla Esc (igual às demais páginas)
// - Chat: enviar, indicador de digitação, abrir/nova conversa, copiar,
//   tentar novamente, parar geração, anexar arquivo (PDF, imagem, texto)
//   - anexar também ARRASTANDO arquivos da pasta para o chat e COLANDO
//     (Ctrl+V) um print/imagem da área de transferência
//   - a resposta continua sendo gerada no servidor se o usuário trocar de
//     página ou fechar a aba; ao voltar, ela aparece na conversa
// - Conversas recentes: dados REAIS de api/ia/conversas.php, com estados
//   carregando / vazio / erro e menu ⋮ (renomear, fixar, excluir)
//
// Segurança: todo texto de mensagem/título entra no DOM via textContent
// (nunca innerHTML). O usuário_id nunca sai do front: o servidor usa a sessão.
// ============================================================
(function () {
  // ----------------------------------------------------------
  // MENU LATERAL — comportamento existente (Recolher + Esc)
  // ----------------------------------------------------------
  const btnRecolher = document.getElementById('btnRecolher');

  function fecharMenuLateral() {
    document.body.classList.remove('sidebar-open');
  }

  if (btnRecolher) btnRecolher.addEventListener('click', fecharMenuLateral);

  const raiz = document.getElementById('iaRaiz');
  if (!raiz) return;

  const P = 'inteligencia-artificial__'; // prefixo BEM do bloco

  // ----------------------------------------------------------
  // ELEMENTOS
  // ----------------------------------------------------------
  const refs = {
    mensagens: document.getElementById('iaMensagens'),
    inicial: document.getElementById('iaInicial'),
    lista: document.getElementById('iaLista'),
    sugestoes: document.getElementById('iaSugestoes'),
    campo: document.getElementById('iaCampo'),
    enviar: document.getElementById('iaEnviar'),
    btnNova: document.getElementById('iaBtnNova'),
    offline: document.getElementById('iaOffline'),
    recentes: document.getElementById('iaRecentes'),
    horaBoasVindas: document.getElementById('iaHoraBoasVindas'),
    dialogo: document.getElementById('iaDialogo'),
    dialogoTexto: document.getElementById('iaDialogoTexto'),
    dialogoCancelar: document.getElementById('iaDialogoCancelar'),
    dialogoConfirmar: document.getElementById('iaDialogoConfirmar'),
    atalhoNova: document.getElementById('atalhoNovaConversaSidebar'),
  };

  const csrf = raiz.getAttribute('data-csrf') || '';
  const LIMITE_PADRAO = 5;
  const LIMITE_EXPANDIDO = 50;
  const URL_BASE = window.location.pathname + '?pagina=inteligencia-artificial';

  // ----------------------------------------------------------
  // ESTADO
  // ----------------------------------------------------------
  const estado = {
    conversaId: null,     // null = conversa nova (ainda não criada no banco)
    equipeSlug: null,
    enviando: false,
    anexos: [],           // Files escolhidos em "Anexar" (ainda não enviados; até ANEXO_MAX_ARQUIVOS)
    controle: null,       // AbortController do envio em andamento
    envioId: null,        // id do envio em andamento (o servidor guarda o andamento por ele)
    epoca: 0,             // muda quando o chat é reiniciado/trocado (ignora respostas antigas)
    conversas: [],
    total: 0,
    limite: LIMITE_PADRAO,
    tokenLista: 0,
    tokenAbrir: 0,
    listaPronta: false,   // já houve uma resposta de conversas.php?
    ultimoDia: null,      // p/ separadores de data
    menuAberto: null,     // { menu, botao }
  };

  // ----------------------------------------------------------
  // UTILITÁRIOS DE DOM
  // ----------------------------------------------------------
  const NS_SVG = 'http://www.w3.org/2000/svg';

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe.split(' ').map((c) => P + c).join(' ');
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  // Ícone SVG de traço fino (currentColor), montado sem innerHTML
  function icone(caminhos, largura) {
    const svg = document.createElementNS(NS_SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    caminhos.forEach((d) => {
      const p = document.createElementNS(NS_SVG, 'path');
      p.setAttribute('d', d);
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', String(largura || 1.6));
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(p);
    });
    return svg;
  }

  const ICONES = {
    chat: ['M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z'],
    pin: ['M9 4h6l-1 6 3 3v1.5H7V13l3-3-1-6z', 'M12 14.5V21'],
    mais: ['M12 5.5h.01', 'M12 12h.01', 'M12 18.5h.01'],
    copiar: ['M9 9h10v10H9z', 'M5 15V5h10'],
    tentar: ['M4 12a8 8 0 0114-5.3L20 9', 'M20 4v5h-5', 'M20 12a8 8 0 01-14 5.3L4 15', 'M4 20v-5h5'],
    alerta: ['M12 8v5', 'M12 16h.01', 'M12 3l10 18H2L12 3z'],
    ia: ['M12 8v5', 'M12 16h.01', 'M12 3a9 9 0 100 18 9 9 0 000-18z'],
    arquivo: ['M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h6'],
    fechar: ['M6 6l12 12', 'M18 6L6 18'],
  };

  function pad(n) { return String(n).padStart(2, '0'); }
  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function mesmoDia(a, b) { return a.toDateString() === b.toDateString(); }

  function ontemDe(d) {
    const o = new Date(d);
    o.setDate(o.getDate() - 1);
    return o;
  }

  // "Hoje" / "Ontem" / "dd/mm" (separador do chat)
  function rotuloDia(d) {
    const hoje = new Date();
    if (mesmoDia(d, hoje)) return 'Hoje';
    if (mesmoDia(d, ontemDe(hoje))) return 'Ontem';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
  }

  // Data da lista de conversas: "HH:MM" (hoje) / "Ontem" / "dd/mm"
  function rotuloLista(iso) {
    const d = new Date(iso);
    const hoje = new Date();
    if (mesmoDia(d, hoje)) return hhmm(d);
    if (mesmoDia(d, ontemDe(hoje))) return 'Ontem';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
  }

  // ----------------------------------------------------------
  // API
  // ----------------------------------------------------------
  class ErroApi extends Error {
    constructor(status, mensagem) {
      super(mensagem);
      this.status = status;
    }
  }

  async function api(url, opcoes) {
    const o = opcoes || {};
    const config = {
      method: o.metodo || 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      signal: o.sinal,
    };
    if (config.method === 'POST') {
      config.headers['X-CSRF-Token'] = csrf;
      if (o.formData) {
        // multipart: o navegador define o Content-Type (com o boundary)
        config.body = o.formData;
      } else {
        config.headers['Content-Type'] = 'application/json';
        config.body = JSON.stringify(o.corpo || {});
      }
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
      throw new ErroApi(resp.status, (dados && dados.erro) || 'Não foi possível concluir a ação. Tente novamente.');
    }
    return dados;
  }

  // ==========================================================
  // CONVERSAS RECENTES (painel direito)
  // ==========================================================
  let avisoTimer = null;

  function avisarRecentes(texto) {
    let aviso = refs.recentes.querySelector('.' + P + 'aviso-lista');
    if (!aviso) {
      aviso = el('p', 'estado estado--erro aviso-lista');
      aviso.setAttribute('role', 'alert');
      refs.recentes.prepend(aviso);
    }
    aviso.textContent = texto;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => aviso.remove(), 5000);
  }

  function renderCarregando() {
    refs.recentes.setAttribute('aria-busy', 'true');
    const sk = el('div', 'skeleton');
    for (let i = 0; i < 5; i++) sk.appendChild(document.createElement('span'));
    refs.recentes.replaceChildren(sk);
  }

  function renderErro() {
    refs.recentes.setAttribute('aria-busy', 'false');
    const bloco = el('div', 'estado estado--erro');
    bloco.setAttribute('role', 'alert');
    bloco.appendChild(el('span', '', 'Não foi possível carregar suas conversas.'));
    const btn = el('button', 'tentar', 'Tentar novamente');
    btn.type = 'button';
    btn.addEventListener('click', () => carregarLista(false));
    bloco.appendChild(btn);
    refs.recentes.replaceChildren(bloco);
  }

  function renderVazio() {
    const bloco = el('p', 'estado');
    bloco.appendChild(icone(ICONES.chat));
    bloco.appendChild(el('span', '', 'Suas conversas aparecerão aqui'));
    refs.recentes.replaceChildren(bloco);
  }

  function renderRecentes() {
    estado.menuAberto = null;
    refs.recentes.setAttribute('aria-busy', 'false');

    if (!estado.conversas.length) {
      renderVazio();
      return;
    }

    const ul = el('ul', 'conversas');
    estado.conversas.forEach((conv) => ul.appendChild(criarItemConversa(conv)));
    refs.recentes.replaceChildren(ul);

    // O link só existe no DOM quando há mais conversas do que as exibidas
    if (estado.total > LIMITE_PADRAO) {
      const expandido = estado.limite > LIMITE_PADRAO;
      const link = el('button', 'ver-todas', expandido ? 'Mostrar menos' : 'Ver todas as conversas');
      link.type = 'button';
      link.addEventListener('click', () => {
        estado.limite = expandido ? LIMITE_PADRAO : LIMITE_EXPANDIDO;
        carregarLista(false);
      });
      refs.recentes.appendChild(link);
    }
  }

  function criarItemConversa(conv) {
    const ativa = conv.id === estado.conversaId;
    const li = el('li', 'conversa' + (ativa ? ' conversa--ativa' : ''));

    // Botão principal: abre a conversa
    const abrir = el('button', 'conversa-abrir');
    abrir.type = 'button';
    if (ativa) abrir.setAttribute('aria-current', 'true');

    const ic = icone(conv.fixada ? ICONES.pin : ICONES.chat);
    ic.setAttribute('class', P + 'conversa-icone' + (conv.fixada ? ' ' + P + 'conversa-icone--fixada' : ''));
    abrir.appendChild(ic);
    if (conv.fixada) {
      const sr = el('span', 'sr', 'Fixada: ');
      abrir.appendChild(sr);
    }

    const titulo = el('span', 'conversa-titulo', conv.titulo);
    titulo.title = conv.titulo;
    abrir.appendChild(titulo);

    const data = el('span', 'conversa-data', rotuloLista(conv.atualizada_em));
    abrir.appendChild(data);
    abrir.addEventListener('click', () => abrirConversa(conv.id));
    li.appendChild(abrir);

    // Menu ⋮
    const btnMenu = el('button', 'conversa-menu-btn');
    btnMenu.type = 'button';
    btnMenu.setAttribute('aria-haspopup', 'menu');
    btnMenu.setAttribute('aria-expanded', 'false');
    btnMenu.setAttribute('aria-label', 'Opções da conversa ' + conv.titulo);
    btnMenu.appendChild(icone(ICONES.mais, 2.6));
    li.appendChild(btnMenu);

    const menu = el('div', 'menu');
    menu.setAttribute('role', 'menu');
    menu.hidden = true;

    const itens = [
      ['Renomear', () => editarTitulo(conv, li, abrir), false],
      [conv.fixada ? 'Desafixar' : 'Fixar', () => fixarConversa(conv), false],
      ['Excluir', () => excluirConversa(conv), true],
    ];
    itens.forEach(([rotulo, acao, perigo]) => {
      const item = el('button', 'menu-item' + (perigo ? ' menu-item--perigo' : ''), rotulo);
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.addEventListener('click', () => {
        fecharMenu(false);
        acao();
      });
      menu.appendChild(item);
    });
    menu.addEventListener('keydown', (e) => tecladoMenu(e, menu));
    li.appendChild(menu);

    btnMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      if (estado.menuAberto && estado.menuAberto.menu === menu) fecharMenu(true);
      else abrirMenu(menu, btnMenu);
    });

    return li;
  }

  // ---------------- Menu ⋮ (teclado + clique fora) ----------------
  function abrirMenu(menu, botao) {
    fecharMenu(false);
    menu.hidden = false;
    botao.setAttribute('aria-expanded', 'true');
    estado.menuAberto = { menu, botao };
    const primeiro = menu.querySelector('[role="menuitem"]');
    if (primeiro) primeiro.focus();
  }

  function fecharMenu(devolverFoco) {
    const aberto = estado.menuAberto;
    if (!aberto) return;
    aberto.menu.hidden = true;
    aberto.botao.setAttribute('aria-expanded', 'false');
    estado.menuAberto = null;
    if (devolverFoco) aberto.botao.focus();
  }

  function tecladoMenu(e, menu) {
    const itens = Array.from(menu.querySelectorAll('[role="menuitem"]'));
    const i = itens.indexOf(document.activeElement);

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // não fecha o menu lateral junto
      fecharMenu(true);
    } else if (e.key === 'ArrowDown') {
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
  }

  document.addEventListener('click', (e) => {
    if (estado.menuAberto && !estado.menuAberto.menu.parentNode.contains(e.target)) {
      fecharMenu(false);
    }
  });

  // ---------------- Ações do menu ----------------
  function editarTitulo(conv, li, abrir) {
    const input = el('input', 'conversa-editar');
    input.type = 'text';
    input.value = conv.titulo;
    input.maxLength = 120;
    input.setAttribute('aria-label', 'Novo título da conversa');
    li.replaceChild(input, abrir);
    input.focus();
    input.select();

    let encerrado = false;
    async function concluir(salvar) {
      if (encerrado) return;
      encerrado = true;
      const novo = input.value.trim();
      if (salvar && novo && novo !== conv.titulo) {
        try {
          await api('api/ia/conversa.php', { metodo: 'POST', corpo: { acao: 'renomear', id: conv.id, titulo: novo } });
          conv.titulo = novo;
        } catch (e) {
          avisarRecentes(e.message);
        }
      }
      renderRecentes();
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        concluir(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        concluir(false);
      }
    });
    input.addEventListener('blur', () => concluir(true));
  }

  async function fixarConversa(conv) {
    try {
      await api('api/ia/conversa.php', { metodo: 'POST', corpo: { acao: 'fixar', id: conv.id, valor: conv.fixada ? 0 : 1 } });
      await carregarLista(true); // a ordem muda: busca de novo
    } catch (e) {
      avisarRecentes(e.message);
    }
  }

  // Remove da lista e do chat (excluir), repondo a próxima da fila
  async function removerConversa(conv, acao) {
    try {
      await api('api/ia/conversa.php', { metodo: 'POST', corpo: { acao, id: conv.id } });
    } catch (e) {
      avisarRecentes(e.message);
      return;
    }
    estado.conversas = estado.conversas.filter((c) => c.id !== conv.id);
    estado.total = Math.max(0, estado.total - 1);
    if (estado.conversaId === conv.id) novaConversa(false);
    else renderRecentes();
    carregarLista(true);
  }

  async function excluirConversa(conv) {
    const ok = await confirmar('"' + conv.titulo + '" será removida da sua lista. Essa ação não pode ser desfeita.');
    if (ok) removerConversa(conv, 'excluir');
  }

  // Diálogo de confirmação (<dialog>), com fallback para confirm()
  function confirmar(texto) {
    const d = refs.dialogo;
    if (!d || typeof d.showModal !== 'function') return Promise.resolve(window.confirm(texto));

    return new Promise((resolver) => {
      let resolvido = false;
      const fim = (valor) => {
        if (resolvido) return;
        resolvido = true;
        if (d.open) d.close();
        resolver(valor);
      };
      refs.dialogoTexto.textContent = texto;
      refs.dialogoCancelar.onclick = () => fim(false);
      refs.dialogoConfirmar.onclick = () => fim(true);
      d.oncancel = () => fim(false);   // Esc
      d.onclose = () => fim(false);
      d.showModal();
      refs.dialogoCancelar.focus();
    });
  }

  // ---------------- Carregar a lista ----------------
  async function carregarLista(silencioso) {
    const meu = ++estado.tokenLista;
    if (!silencioso) renderCarregando();
    try {
      const dados = await api('api/ia/conversas.php?limite=' + estado.limite);
      if (meu !== estado.tokenLista) return;
      estado.conversas = dados.conversas;
      estado.total = dados.total;
      if (estado.total <= LIMITE_PADRAO) estado.limite = LIMITE_PADRAO;
      estado.listaPronta = true;
      renderRecentes();
    } catch (e) {
      if (meu !== estado.tokenLista) return;
      if (!silencioso) renderErro();
    }
  }

  // Atualiza a lista local com a conversa devolvida por enviar.php
  // (aparece no topo na hora, sem recarregar a página)
  function atualizarConversaLocal(conv, ehNova) {
    const i = estado.conversas.findIndex((c) => c.id === conv.id);
    if (i >= 0) {
      estado.conversas[i] = Object.assign(estado.conversas[i], conv);
    } else {
      estado.conversas.push(conv);
      if (ehNova) estado.total += 1;
    }
    estado.conversas.sort((a, b) =>
      (Number(b.fixada) - Number(a.fixada)) ||
      (new Date(b.atualizada_em) - new Date(a.atualizada_em)) ||
      (b.id - a.id)
    );
    estado.conversas = estado.conversas.slice(0, estado.limite);
    renderRecentes();
  }

  // ==========================================================
  // ENVIO EM SEGUNDO PLANO
  // Se o usuário troca de página (ou fecha a aba) com a IA ainda respondendo,
  // o servidor termina o trabalho e grava a resposta. Aqui guardamos qual
  // envio ficou pendente para, ao voltar, mostrar a resposta.
  // ==========================================================
  const CHAVE_PENDENTE = 'iaEnvioPendente';
  const PENDENTE_VALIDADE_MS = 15 * 60 * 1000; // depois disso a resposta só aparece nas conversas recentes
  const ESPERA_CONSULTA_MS = 1500;
  let saindo = false; // a página está sendo fechada/trocada (o fetch cancelado NÃO é erro do usuário)

  window.addEventListener('pagehide', () => { saindo = true; });
  window.addEventListener('pageshow', (e) => {
    // Voltou pelo botão "voltar" (cache do navegador): recarrega para retomar o envio pendente
    if (e.persisted) {
      saindo = false;
      if (lerPendente()) window.location.reload();
    }
  });

  function gerarEnvioId() {
    const bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function salvarPendente(dados) {
    try { localStorage.setItem(CHAVE_PENDENTE, JSON.stringify(dados)); } catch (e) { /* sem localStorage: segue sem recuperar */ }
  }

  function lerPendente() {
    try {
      const dados = JSON.parse(localStorage.getItem(CHAVE_PENDENTE) || 'null');
      if (!dados || typeof dados.envioId !== 'string') return null;
      if (Date.now() - Number(dados.iniciadoEm || 0) > PENDENTE_VALIDADE_MS) {
        localStorage.removeItem(CHAVE_PENDENTE);
        return null;
      }
      return dados;
    } catch (e) {
      return null;
    }
  }

  // Só limpa se o pendente guardado for o do envio informado
  function limparPendente(envioId) {
    try {
      const dados = JSON.parse(localStorage.getItem(CHAVE_PENDENTE) || 'null');
      if (!envioId || !dados || dados.envioId === envioId) localStorage.removeItem(CHAVE_PENDENTE);
    } catch (e) { /* ignora */ }
  }

  // "Parar geração" / trocar de conversa: avisa o servidor para NÃO gravar a resposta
  function cancelarNoServidor(envioId) {
    if (!envioId) return;
    try {
      fetch('api/ia/envio.php', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify({ acao: 'cancelar', envio_id: envioId }),
      }).catch(() => {});
    } catch (e) { /* ignora */ }
  }

  function pararGeracao() {
    cancelarNoServidor(estado.envioId);
    if (estado.controle) estado.controle.abort();
  }

  // ==========================================================
  // CHAT
  // ==========================================================
  function rolarParaFim() {
    refs.mensagens.scrollTop = refs.mensagens.scrollHeight;
  }

  function mostrarInicial() {
    refs.lista.replaceChildren();
    refs.lista.hidden = true;
    refs.inicial.hidden = false;
    estado.ultimoDia = null;
    definirHoraBoasVindas();
  }

  function mostrarConversa() {
    refs.inicial.hidden = true;
    refs.lista.hidden = false;
  }

  function definirHoraBoasVindas() {
    if (!refs.horaBoasVindas) return;
    const agora = new Date();
    refs.horaBoasVindas.textContent = hhmm(agora);
    refs.horaBoasVindas.setAttribute('datetime', agora.toISOString());
  }

  function adicionarSeparador(data) {
    if (estado.ultimoDia && mesmoDia(estado.ultimoDia, data)) return;
    estado.ultimoDia = data;
    refs.lista.appendChild(el('div', 'data', rotuloDia(data)));
  }

  function criarAvatar(erro) {
    const av = el('span', 'avatar');
    av.setAttribute('aria-hidden', 'true');
    av.appendChild(icone(erro ? ICONES.alerta : ICONES.ia));
    return av;
  }

  // Copia texto (Clipboard API com fallback) e avisa no próprio botão
  async function copiarTexto(texto, botao, rotulo) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(texto);
      ok = true;
    } catch (e) {
      const t = document.createElement('textarea');
      t.value = texto;
      t.setAttribute('readonly', '');
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      t.remove();
    }
    rotulo.textContent = ok ? 'Copiado' : 'Não foi possível copiar';
    setTimeout(() => { rotulo.textContent = 'Copiar'; }, 1800);
  }

  // Adiciona uma mensagem ao chat. Retorna o elemento raiz da mensagem.
  // animar = true: a resposta da IA aparece "digitada" letra por letra
  // (só para respostas novas; o histórico carregado aparece direto).
  function adicionarMensagem(msg, animar) {
    const data = new Date(msg.criada_em);
    adicionarSeparador(data);

    const ehIa = msg.papel === 'ia';
    const digitar = Boolean(animar) && ehIa && Boolean(msg.conteudo);
    const linha = el('div', 'msg ' + (ehIa ? 'msg--ia' : 'msg--usuario'));
    if (ehIa) linha.appendChild(criarAvatar(false));

    const conteudo = el('div', 'conteudo');
    const balao = el('div', 'balao');
    // Texto puro; as quebras de linha vêm de white-space: pre-wrap (CSS)
    const texto = el('p', 'texto', digitar ? '' : msg.conteudo);
    balao.appendChild(texto);
    // Anexos ficam FORA do balão (acima dele): o balão colorido envolve só o texto
    const anexosMsg = listaAnexos(msg);
    if (anexosMsg.length) conteudo.appendChild(criarBlocoAnexos(anexosMsg));
    conteudo.appendChild(balao);

    const meta = el('div', 'meta');
    if (digitar) meta.classList.add(P + 'meta--oculta'); // hora/Copiar só depois de digitar
    const hora = el('time', 'hora', hhmm(data));
    hora.setAttribute('datetime', data.toISOString());
    meta.appendChild(hora);

    const btnCopiar = el('button', 'mini');
    btnCopiar.type = 'button';
    btnCopiar.setAttribute('aria-label', 'Copiar mensagem');
    btnCopiar.appendChild(icone(ICONES.copiar));
    const rotulo = document.createElement('span');
    rotulo.textContent = 'Copiar';
    btnCopiar.appendChild(rotulo);
    btnCopiar.addEventListener('click', () => copiarTexto(msg.conteudo, btnCopiar, rotulo));
    meta.appendChild(btnCopiar);

    conteudo.appendChild(meta);
    linha.appendChild(conteudo);
    refs.lista.appendChild(linha);
    rolarParaFim();
    if (digitar) digitarTexto(linha, texto, meta, msg.conteudo);
    return linha;
  }

  function adicionarErro(texto, aoTentar) {
    const linha = el('div', 'msg msg--ia msg--erro');
    linha.appendChild(criarAvatar(true));

    const conteudo = el('div', 'conteudo');
    const balao = el('div', 'balao');
    balao.setAttribute('role', 'alert');
    balao.appendChild(el('p', 'texto', texto));
    conteudo.appendChild(balao);

    if (aoTentar) {
      const btn = el('button', 'mini mini--erro');
      btn.type = 'button';
      btn.appendChild(icone(ICONES.tentar));
      const rotulo = document.createElement('span');
      rotulo.textContent = 'Tentar novamente';
      btn.appendChild(rotulo);
      btn.addEventListener('click', () => {
        linha.remove();
        aoTentar();
      });
      conteudo.appendChild(btn);
    }

    linha.appendChild(conteudo);
    refs.lista.appendChild(linha);
    rolarParaFim();
    return linha;
  }

  function mostrarDigitando() {
    const linha = el('div', 'msg msg--ia');
    linha.appendChild(criarAvatar(false));
    const conteudo = el('div', 'conteudo');
    const balao = el('div', 'balao');
    const pontos = el('div', 'digitando');
    pontos.appendChild(el('span', 'sr', 'A IA está respondendo'));
    for (let i = 0; i < 3; i++) {
      const p = document.createElement('span');
      p.setAttribute('aria-hidden', 'true');
      pontos.appendChild(p);
    }
    balao.appendChild(pontos);
    conteudo.appendChild(balao);
    linha.appendChild(conteudo);
    refs.lista.appendChild(linha);
    rolarParaFim();
    return linha;
  }

  // ---------------- Efeito de digitação (resposta da IA) ----------------
  const DIGITACAO_MS_POR_LETRA = 1;  // velocidade fixa (~1000 letras/s, várias letras por quadro), qualquer que seja o tamanho
  let digitacaoAtual = null;         // { concluir } da resposta que está sendo digitada

  // Termina na hora a digitação em andamento (mostra o texto inteiro)
  function concluirDigitacao() {
    if (digitacaoAtual) digitacaoAtual.concluir();
  }

  function pertoDoFim() {
    const m = refs.mensagens;
    return m.scrollHeight - m.scrollTop - m.clientHeight < 80;
  }

  function digitarTexto(linha, alvo, meta, textoCompleto) {
    concluirDigitacao();

    const letras = Array.from(textoCompleto); // não quebra emojis ao meio
    const total = letras.length;
    const msPorLetra = DIGITACAO_MS_POR_LETRA;

    // Leitores de tela: o texto animado fica oculto e a resposta completa é
    // anunciada uma única vez (o chat é um role="log" aria-live).
    const leitor = el('span', 'sr', textoCompleto);
    alvo.setAttribute('aria-hidden', 'true');
    alvo.classList.add(P + 'texto--digitando');
    alvo.after(leitor);

    const inicio = performance.now();
    let mostradas = 0;
    let quadro = 0;
    let terminou = false;

    function terminar() {
      if (terminou) return;
      terminou = true;
      cancelAnimationFrame(quadro);
      if (digitacaoAtual && digitacaoAtual.linha === linha) digitacaoAtual = null;
      alvo.textContent = textoCompleto;
      alvo.classList.remove(P + 'texto--digitando');
      alvo.removeAttribute('aria-hidden');
      leitor.remove();
      const seguir = pertoDoFim();
      meta.classList.remove(P + 'meta--oculta');
      if (seguir && linha.isConnected) rolarParaFim();
    }

    function passo() {
      if (terminou) return;
      if (!linha.isConnected) { // chat trocado/reiniciado: para de digitar
        terminou = true;
        if (digitacaoAtual && digitacaoAtual.linha === linha) digitacaoAtual = null;
        return;
      }
      const n = Math.min(total, Math.max(1, Math.floor((performance.now() - inicio) / msPorLetra) + 1));
      if (n !== mostradas) {
        const seguir = pertoDoFim(); // mede antes do texto crescer
        mostradas = n;
        alvo.textContent = letras.slice(0, n).join('');
        if (seguir) rolarParaFim();
      }
      if (n >= total) terminar();
      else quadro = requestAnimationFrame(passo);
    }

    digitacaoAtual = { linha, concluir: terminar };
    quadro = requestAnimationFrame(passo);
  }

  // ---------------- Anexo (arquivo) ----------------
  // O botão "Anexar" do HTML nasce desativado ("Em breve"); aqui ele é ativado
  // e a prévia do arquivo é criada por JS (não precisa mexer no HTML).
  const ANEXO_MAX_BYTES = 10 * 1024 * 1024;        // por arquivo (igual ao limite do servidor)
  const ANEXO_MAX_ARQUIVOS = 5;                    // arquivos por mensagem (igual ao servidor)
  const ANEXO_MAX_TOTAL_BYTES = 20 * 1024 * 1024;  // soma dos arquivos da mensagem (igual ao servidor)
  const ANEXO_EXTENSOES = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv', 'md'];
  const TEXTO_PADRAO_ANEXO = 'Resuma o conteúdo do arquivo anexado.'; // igual ao do servidor

  function formatarTamanho(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
  }

  const EXT_IMAGEM = ['png', 'jpg', 'jpeg', 'webp'];

  function extensaoDe(nome) {
    const m = /\.([^.\s]+)$/.exec(nome || '');
    return m ? m[1].toLowerCase() : '';
  }

  function ehImagemAnexo(anexo) {
    return /^image\//.test(anexo.mime || '') || EXT_IMAGEM.includes(extensaoDe(anexo.nome));
  }

  // Nome sem a extensão (o tipo aparece em cima do cartão). Nomes muito longos
  // ficam "começo…fim", assim o final (ex.: "(Back-end)") continua visível.
  function nomeParaCartao(nome) {
    const base = String(nome).replace(/\.[^.\s]+$/, '') || String(nome);
    if (base.length <= 24) return base;
    return base.slice(0, 13).trimEnd() + '…' + base.slice(-10).trimStart();
  }

  // Anexo em formato de cartão:
  //  - imagem: aparece a imagem (na mensagem, inteira e sem cortar)
  //  - outros arquivos: cartão com o tipo (PDF, TXT...) em cima e o nome embaixo
  // Com id (já salvo no servidor) vira link; sem id, é só visual.
  // anexo = { id, nome, mime, tamanho, previaUrl? } (previaUrl = imagem local ainda não salva)
  function criarChipAnexo(anexo, naPrevia) {
    const temLink = anexo.id !== null && anexo.id !== undefined;
    const src = ehImagemAnexo(anexo)
      ? (anexo.previaUrl || (temLink ? 'api/ia/anexo.php?id=' + encodeURIComponent(anexo.id) : ''))
      : '';

    const chip = document.createElement(temLink ? 'a' : 'span');
    chip.className = P + 'anexo-chip ' + P + (src ? 'anexo-chip--img' : 'anexo-chip--doc');
    chip.title = anexo.nome + ' (' + formatarTamanho(anexo.tamanho) + ')';
    if (temLink) {
      chip.href = 'api/ia/anexo.php?id=' + encodeURIComponent(anexo.id);
      chip.target = '_blank';
      chip.rel = 'noopener noreferrer';
    }

    if (src) {
      const img = document.createElement('img');
      img.className = P + 'anexo-img';
      img.alt = anexo.nome;
      img.decoding = 'async';
      // A altura da imagem só é conhecida ao carregar: mantém o chat no fim
      if (!naPrevia) img.addEventListener('load', rolarParaFim);
      img.src = src;
      chip.appendChild(img);
    } else {
      chip.appendChild(el('span', 'anexo-tipo', extensaoDe(anexo.nome).toUpperCase() || 'ARQUIVO'));
      chip.appendChild(el('span', 'anexo-nome', nomeParaCartao(anexo.nome)));
    }
    return chip;
  }

  // Lista de anexos de uma mensagem (aceita o formato antigo, com um só "anexo")
  function listaAnexos(msg) {
    if (Array.isArray(msg.anexos)) return msg.anexos;
    return msg.anexo ? [msg.anexo] : [];
  }

  // Linha com os cartões/imagens de todos os anexos da mensagem
  function criarBlocoAnexos(anexos) {
    const bloco = el('div', 'anexos' + (anexos.length > 1 ? ' anexos--varios' : ''));
    anexos.forEach((a) => bloco.appendChild(criarChipAnexo(a)));
    return bloco;
  }

  const previa = el('div', 'anexo-previa');
  previa.hidden = true;
  refs.campo.parentElement.insertBefore(previa, refs.campo);

  const entradaArquivo = document.createElement('input');
  entradaArquivo.type = 'file';
  entradaArquivo.multiple = true; // até ANEXO_MAX_ARQUIVOS por mensagem
  entradaArquivo.accept = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.md';
  entradaArquivo.hidden = true;
  entradaArquivo.tabIndex = -1;
  entradaArquivo.setAttribute('aria-hidden', 'true');
  refs.campo.parentElement.appendChild(entradaArquivo);

  let avisoAnexoTimer = null;
  let previaObjUrls = []; // URLs locais das miniaturas (imagens escolhidas, ainda não enviadas)

  // Mostra (aviso opcional +) os cartões/miniaturas dos arquivos escolhidos acima do campo
  function renderPrevia(aviso) {
    previaObjUrls.forEach((u) => URL.revokeObjectURL(u));
    previaObjUrls = [];
    previa.replaceChildren();
    if (aviso) {
      const p = el('p', 'anexo-aviso', aviso);
      p.setAttribute('role', 'alert');
      previa.appendChild(p);
    }
    estado.anexos.forEach((arquivo) => {
      const info = { id: null, nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size };
      if (ehImagemAnexo(info)) {
        const url = URL.createObjectURL(arquivo);
        previaObjUrls.push(url);
        info.previaUrl = url;
      }
      const chip = criarChipAnexo(info, true);
      const remover = el('button', 'anexo-remover');
      remover.type = 'button';
      remover.setAttribute('aria-label', 'Remover anexo ' + arquivo.name);
      remover.appendChild(icone(ICONES.fechar, 2));
      remover.addEventListener('click', () => {
        definirAnexos(estado.anexos.filter((f) => f !== arquivo));
        refs.campo.focus();
      });
      chip.appendChild(remover);
      previa.appendChild(chip);
    });
    previa.hidden = !aviso && estado.anexos.length === 0;
  }

  function avisarAnexo(texto) {
    renderPrevia(texto);
    clearTimeout(avisoAnexoTimer);
    avisoAnexoTimer = setTimeout(() => renderPrevia(), 5000);
  }

  function definirAnexos(arquivos) {
    estado.anexos = arquivos;
    renderPrevia();
    atualizarBotaoEnviar();
  }

  function limparAnexo() {
    definirAnexos([]);
  }

  // Adiciona os arquivos escolhidos aos que já estavam na prévia.
  // Os que não servem (formato, tamanho, limite) são ignorados e o motivo aparece num aviso.
  function escolherArquivos(arquivos) {
    if (!arquivos || !arquivos.length) return;

    const lista = estado.anexos.slice();
    let total = lista.reduce((soma, f) => soma + f.size, 0);
    let aviso = '';
    const avisar = (texto) => { if (!aviso) aviso = texto; }; // mostra só o 1º motivo

    for (const arquivo of arquivos) {
      const ext = (arquivo.name.split('.').pop() || '').toLowerCase();
      if (lista.length >= ANEXO_MAX_ARQUIVOS) {
        avisar('Você pode anexar no máximo ' + ANEXO_MAX_ARQUIVOS + ' arquivos por mensagem.');
        break;
      }
      if (!ANEXO_EXTENSOES.includes(ext)) {
        avisar('Formato não suportado em "' + arquivo.name + '". Envie PDF, imagem (PNG, JPG, WEBP) ou texto (TXT, CSV, MD).');
        continue;
      }
      if (arquivo.size <= 0) {
        avisar('O arquivo "' + arquivo.name + '" está vazio.');
        continue;
      }
      if (arquivo.size > ANEXO_MAX_BYTES) {
        avisar('O arquivo "' + arquivo.name + '" é maior que 10 MB.');
        continue;
      }
      if (total + arquivo.size > ANEXO_MAX_TOTAL_BYTES) {
        avisar('Os arquivos somam mais de ' + (ANEXO_MAX_TOTAL_BYTES / (1024 * 1024)) + ' MB. Envie menos arquivos ou arquivos menores.');
        continue;
      }
      // Mesmo arquivo escolhido de novo: ignora em silêncio
      if (lista.some((f) => f.name === arquivo.name && f.size === arquivo.size && f.lastModified === arquivo.lastModified)) {
        continue;
      }
      lista.push(arquivo);
      total += arquivo.size;
    }

    estado.anexos = lista;
    if (aviso) avisarAnexo(aviso);
    else renderPrevia();
    atualizarBotaoEnviar();
    refs.campo.focus();
  }

  const btnAnexar = document.getElementById('iaAnexar') || raiz.querySelector('.' + P + 'acao');
  if (btnAnexar) {
    btnAnexar.disabled = false;
    btnAnexar.title = 'Anexar arquivos (até ' + ANEXO_MAX_ARQUIVOS + ')';
    btnAnexar.setAttribute('aria-label', 'Anexar arquivos');
    btnAnexar.addEventListener('click', () => {
      if (!estado.enviando) entradaArquivo.click();
    });
  }

  entradaArquivo.addEventListener('change', () => {
    escolherArquivos(Array.from(entradaArquivo.files || []));
    entradaArquivo.value = ''; // permite escolher o mesmo arquivo de novo
  });

  // ---------------- Campo de entrada ----------------
  function ajustarAltura() {
    const c = refs.campo;
    c.style.height = 'auto';
    c.style.height = Math.min(c.scrollHeight, 144) + 'px'; // ~6 linhas
  }

  function atualizarBotaoEnviar() {
    if (estado.enviando) {
      refs.enviar.disabled = false; // vira "Parar geração"
      return;
    }
    refs.enviar.disabled = refs.campo.value.trim() === '' && estado.anexos.length === 0;
  }

  function definirEnviando(valor) {
    estado.enviando = valor;
    refs.enviar.classList.toggle(P + 'enviar--parar', valor);
    refs.enviar.setAttribute('aria-label', valor ? 'Parar geração' : 'Enviar mensagem');
    refs.mensagens.setAttribute('aria-busy', valor ? 'true' : 'false');
    atualizarBotaoEnviar();
  }

  // Cancela o envio em andamento ao trocar/reiniciar a conversa
  function cancelarEnvio() {
    if (!estado.controle) return;
    cancelarNoServidor(estado.envioId); // trocar de conversa cancela (só sair da página não cancela)
    limparPendente(estado.envioId);
    estado.epoca += 1;
    estado.controle.abort();
    estado.controle = null;
    estado.envioId = null;
    definirEnviando(false);
  }

  function podeTentarDeNovo(status) {
    return status === 0 || status === 200 || status === 429 || status >= 500;
  }

  // Última bolha do usuário no chat (para ligar o link do anexo depois de salvo)
  function ultimaBolhaUsuario() {
    const todas = refs.lista.querySelectorAll('.' + P + 'msg--usuario');
    return todas.length ? todas[todas.length - 1] : null;
  }

  async function enviar(texto, repetir, arquivosRepetir) {
    texto = texto.trim();
    const arquivos = repetir ? (arquivosRepetir || []) : estado.anexos.slice();
    if ((!texto && arquivos.length === 0) || estado.enviando) return;

    concluirDigitacao(); // resposta anterior ainda "digitando": mostra inteira antes de seguir
    definirEnviando(true);
    mostrarConversa();

    let bolhaUsuario = null;
    let imagensLocais = []; // URLs locais das imagens enviadas (aparecem na hora, na mesma ordem dos arquivos)
    if (!repetir) {
      const infoAnexos = arquivos.map((arquivo) => {
        const info = { id: null, nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size };
        if (ehImagemAnexo(info)) {
          info.previaUrl = URL.createObjectURL(arquivo);
          imagensLocais.push(info.previaUrl);
        }
        return info;
      });
      bolhaUsuario = adicionarMensagem({
        papel: 'usuario',
        conteudo: texto || TEXTO_PADRAO_ANEXO,
        criada_em: new Date().toISOString(),
        anexos: infoAnexos,
      });
      refs.campo.value = '';
      ajustarAltura();
      if (arquivos.length) limparAnexo();
    }
    const digitando = mostrarDigitando();

    const controle = new AbortController();
    estado.controle = controle;
    const epoca = estado.epoca;
    const envioId = gerarEnvioId();
    estado.envioId = envioId;
    salvarPendente({
      envioId,
      conversaId: estado.conversaId,
      texto,
      anexos: arquivos.map((a) => ({ nome: a.name, mime: a.type, tamanho: a.size })),
      iniciadoEm: Date.now(),
    });

    try {
      let dados;
      if (arquivos.length) {
        const form = new FormData();
        form.append('envio_id', envioId);
        form.append('mensagem', texto);
        if (estado.conversaId !== null) form.append('conversa_id', String(estado.conversaId));
        if (estado.equipeSlug) form.append('equipe_slug', estado.equipeSlug);
        arquivos.forEach((arquivo) => form.append('arquivos[]', arquivo, arquivo.name));
        dados = await api('api/ia/enviar.php', { metodo: 'POST', formData: form, sinal: controle.signal });
      } else {
        dados = await api('api/ia/enviar.php', {
          metodo: 'POST',
          corpo: { conversa_id: estado.conversaId, mensagem: texto, equipe_slug: estado.equipeSlug, envio_id: envioId },
          sinal: controle.signal,
        });
      }
      if (epoca !== estado.epoca) return;

      digitando.remove();

      // Os arquivos já estão salvos no servidor: os cartões da bolha passam a ser links.
      // (o servidor devolve os anexos na mesma ordem em que foram enviados)
      const anexosSalvos = dados.mensagem_usuario ? listaAnexos(dados.mensagem_usuario) : [];
      if (anexosSalvos.length) {
        const alvo = bolhaUsuario || ultimaBolhaUsuario();
        const bloco = alvo && alvo.querySelector('.' + P + 'anexos');
        if (bloco) {
          let i = 0;
          bloco.replaceWith(criarBlocoAnexos(anexosSalvos.map((salvo) => {
            const local = ehImagemAnexo(salvo) ? imagensLocais[i++] : undefined;
            return local ? Object.assign({}, salvo, { previaUrl: local }) : salvo;
          })));
        }
      }

      const ehNova = estado.conversaId === null;
      estado.conversaId = dados.conversa.id;
      adicionarMensagem(dados.mensagem, true); // true = efeito de digitação
      atualizarConversaLocal(dados.conversa, ehNova);
      window.history.replaceState(null, '', URL_BASE + '&c=' + dados.conversa.id);
    } catch (e) {
      // Página sendo fechada/trocada: o servidor continua e grava a resposta.
      // Nada a mostrar aqui, e o envio pendente fica guardado para a volta.
      if (saindo) return;
      if (epoca !== estado.epoca) return; // chat já foi trocado/reiniciado
      digitando.remove();

      if (e && e.name === 'AbortError') {
        // "Parar geração": desfaz a bolha local e devolve o texto (e os arquivos) ao campo
        if (bolhaUsuario) bolhaUsuario.remove();
        imagensLocais.forEach((u) => URL.revokeObjectURL(u));
        refs.campo.value = texto === '' ? '' : texto;
        ajustarAltura();
        if (arquivos.length) definirAnexos(arquivos);
        if (!refs.lista.children.length) mostrarInicial();
      } else {
        adicionarErro(e.message, podeTentarDeNovo(e.status) ? () => enviar(texto, true, arquivos) : null);
      }
    } finally {
      if (!saindo) limparPendente(envioId);
      if (epoca === estado.epoca) {
        estado.controle = null;
        estado.envioId = null;
        definirEnviando(false);
        if (!saindo) refs.campo.focus();
      }
    }
  }

  // ---------------- Voltar à página com uma resposta em andamento ----------------
  function esperar(ms, sinal) {
    return new Promise((resolver, rejeitar) => {
      const erroAbort = () => { const e = new Error('Abortado'); e.name = 'AbortError'; return e; };
      if (sinal && sinal.aborted) { rejeitar(erroAbort()); return; }
      const t = setTimeout(() => { if (sinal) sinal.removeEventListener('abort', aoAbortar); resolver(); }, ms);
      function aoAbortar() { clearTimeout(t); rejeitar(erroAbort()); }
      if (sinal) sinal.addEventListener('abort', aoAbortar, { once: true });
    });
  }

  function devolverTextoAoCampo(texto) {
    if (!texto || refs.campo.value.trim() !== '') return;
    refs.campo.value = texto;
    ajustarAltura();
    atualizarBotaoEnviar();
  }

  // O usuário enviou uma pergunta e saiu da página (ou recarregou). Pergunta ao
  // servidor como está: pronta -> abre a conversa; gerando -> mostra a pergunta com
  // o "digitando..." e espera; falhou/cancelada -> volta ao normal.
  async function recuperarPendente(p, idUrlFallback) {
    const voltarAoNormal = () => {
      limparPendente(p.envioId);
      if (idUrlFallback > 0) abrirConversa(idUrlFallback);
    };

    let st;
    try {
      st = await api('api/ia/envio.php?id=' + encodeURIComponent(p.envioId));
    } catch (e) {
      voltarAoNormal();
      return;
    }

    if (st.estado === 'ok' && st.conversa_id > 0) {
      limparPendente(p.envioId);
      abrirConversa(st.conversa_id);
      carregarLista(true);
      return;
    }

    if (st.estado === 'erro') {
      limparPendente(p.envioId);
      if (p.conversaId) {
        await abrirConversa(p.conversaId);
        if (estado.conversaId !== p.conversaId) return;
      }
      mostrarConversa();
      adicionarErro(st.erro || 'Não foi possível concluir a resposta. Tente novamente.', null);
      devolverTextoAoCampo(p.texto);
      return;
    }

    if (st.estado !== 'pendente') { // cancelada ou desconhecida
      voltarAoNormal();
      return;
    }

    // ---- Ainda gerando: mostra a conversa + a pergunta + "digitando..." ----
    if (p.conversaId) {
      await abrirConversa(p.conversaId);
      if (estado.conversaId !== p.conversaId) { limparPendente(p.envioId); return; }
    }
    mostrarConversa();
    adicionarMensagem({
      papel: 'usuario',
      conteudo: p.texto || TEXTO_PADRAO_ANEXO,
      criada_em: new Date(Number(p.iniciadoEm) || Date.now()).toISOString(),
      anexos: (p.anexos || []).map((a) => ({ id: null, nome: a.nome, mime: a.mime, tamanho: a.tamanho })),
    });
    const bolha = ultimaBolhaUsuario();
    const digitando = mostrarDigitando();

    const controle = new AbortController();
    estado.controle = controle;
    estado.envioId = p.envioId;
    const epoca = estado.epoca;
    definirEnviando(true);

    let abrirDepois = null;
    let falhas = 0;
    try {
      for (;;) {
        await esperar(ESPERA_CONSULTA_MS, controle.signal);
        let atual;
        try {
          atual = await api('api/ia/envio.php?id=' + encodeURIComponent(p.envioId), { sinal: controle.signal });
          falhas = 0;
        } catch (e) {
          if (e && e.name === 'AbortError') throw e;
          if (++falhas >= 5) throw e;
          continue;
        }
        if (epoca !== estado.epoca) return;
        if (atual.estado === 'pendente') continue;

        digitando.remove();
        if (atual.estado === 'ok' && atual.conversa_id > 0) {
          abrirDepois = atual.conversa_id;
        } else if (atual.estado === 'erro') {
          adicionarErro(atual.erro || 'Não foi possível concluir a resposta. Tente novamente.', null);
          devolverTextoAoCampo(p.texto);
        } else { // cancelada
          if (bolha) bolha.remove();
          if (!refs.lista.children.length) mostrarInicial();
        }
        break;
      }
    } catch (e) {
      if (saindo) return;
      if (epoca !== estado.epoca) return;
      digitando.remove();
      if (e && e.name === 'AbortError') {
        // "Parar geração": desfaz a pergunta e devolve o texto ao campo
        if (bolha) bolha.remove();
        devolverTextoAoCampo(p.texto);
        if (!refs.lista.children.length) mostrarInicial();
      } else {
        adicionarErro(e.message || 'Não foi possível consultar a resposta.', null);
      }
    } finally {
      if (!saindo) limparPendente(p.envioId);
      if (epoca === estado.epoca) {
        estado.controle = null;
        estado.envioId = null;
        definirEnviando(false);
      }
    }

    if (abrirDepois && !saindo) {
      await abrirConversa(abrirDepois);
      carregarLista(true);
    }
  }

  // ---------------- Abrir / nova conversa ----------------
  async function abrirConversa(id) {
    cancelarEnvio();
    limparAnexo();
    const meu = ++estado.tokenAbrir;
    estado.conversaId = id;
    estado.equipeSlug = null;
    estado.ultimoDia = null;
    mostrarConversa();
    refs.lista.replaceChildren();
    if (estado.listaPronta) renderRecentes();
    window.history.replaceState(null, '', URL_BASE + '&c=' + id);

    const carregando = el('p', 'estado', 'Carregando conversa…');
    carregando.setAttribute('role', 'status');
    refs.lista.appendChild(carregando);

    try {
      const dados = await api('api/ia/conversa.php?id=' + encodeURIComponent(id));
      if (meu !== estado.tokenAbrir) return;
      refs.lista.replaceChildren();
      estado.equipeSlug = dados.conversa.equipe_slug || null;
      dados.mensagens.forEach((m) => adicionarMensagem(m));
      rolarParaFim();
      refs.campo.focus();
    } catch (e) {
      if (meu !== estado.tokenAbrir) return;
      if (e.status === 404) {
        novaConversa(false);
        avisarRecentes('Conversa não encontrada.');
      } else {
        refs.lista.replaceChildren();
        adicionarErro(e.message, () => abrirConversa(id));
      }
    }
  }

  function novaConversa(focar) {
    cancelarEnvio();
    limparAnexo();
    estado.tokenAbrir += 1;
    estado.conversaId = null;
    estado.equipeSlug = null;
    mostrarInicial();
    refs.campo.value = '';
    ajustarAltura();
    atualizarBotaoEnviar();
    window.history.replaceState(null, '', URL_BASE);
    if (estado.listaPronta) renderRecentes(); // remove o destaque de "ativa"
    if (focar) refs.campo.focus();
  }

  // ==========================================================
  // ARRASTAR E SOLTAR + COLAR (Ctrl+V)
  // Usam o mesmo caminho do botão "Anexar" (escolherArquivos): mesmas regras
  // de formato, tamanho e quantidade, mesma prévia e mesmo envio.
  // ==========================================================
  const secaoChat = raiz.querySelector('.' + P + 'chat');
  const AVISO_AGUARDAR_ANEXO = 'Aguarde a IA terminar de responder para anexar arquivos.';

  // Área que aparece por cima do chat enquanto se arrasta um arquivo
  const zonaSoltar = el('div', 'soltar');
  zonaSoltar.hidden = true;
  zonaSoltar.setAttribute('aria-hidden', 'true');
  const zonaCaixa = el('div', 'soltar-caixa');
  zonaCaixa.appendChild(icone(['M12 16V5', 'M7.5 9.5L12 5l4.5 4.5', 'M5 15v3.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V15'], 1.8));
  zonaCaixa.appendChild(el('strong', 'soltar-titulo', 'Solte para anexar'));
  zonaCaixa.appendChild(el('span', 'soltar-dica', 'PDF, imagem (PNG, JPG, WEBP) ou texto (TXT, CSV, MD) — até ' + ANEXO_MAX_ARQUIVOS + ' arquivos'));
  zonaSoltar.appendChild(zonaCaixa);
  if (secaoChat) secaoChat.appendChild(zonaSoltar);

  let contadorArraste = 0; // dragenter/dragleave disparam também nos filhos: conta para não piscar

  function arrastandoArquivos(e) {
    const tipos = e.dataTransfer && e.dataTransfer.types;
    return Boolean(tipos) && Array.prototype.indexOf.call(tipos, 'Files') !== -1;
  }

  function esconderZonaSoltar() {
    contadorArraste = 0;
    zonaSoltar.hidden = true;
  }

  if (secaoChat) {
    secaoChat.addEventListener('dragenter', (e) => {
      if (!arrastandoArquivos(e)) return;
      e.preventDefault();
      contadorArraste += 1;
      zonaSoltar.hidden = false;
    });

    secaoChat.addEventListener('dragover', (e) => {
      if (!arrastandoArquivos(e)) return;
      e.preventDefault(); // necessário para o navegador aceitar o "soltar"
      e.dataTransfer.dropEffect = 'copy';
    });

    secaoChat.addEventListener('dragleave', (e) => {
      if (!arrastandoArquivos(e)) return;
      contadorArraste = Math.max(0, contadorArraste - 1);
      if (contadorArraste === 0) zonaSoltar.hidden = true;
    });

    secaoChat.addEventListener('drop', (e) => {
      if (!arrastandoArquivos(e)) return;
      e.preventDefault();
      esconderZonaSoltar();
      const arquivos = Array.from(e.dataTransfer.files || []);
      if (!arquivos.length) return;
      if (estado.enviando) {
        avisarAnexo(AVISO_AGUARDAR_ANEXO);
        return;
      }
      escolherArquivos(arquivos);
    });
  }

  // Soltou fora do chat (ou cancelou o arraste): não deixa o navegador abrir o
  // arquivo na página e garante que a área de "soltar" suma.
  window.addEventListener('dragover', (e) => {
    if (!arrastandoArquivos(e) || (secaoChat && secaoChat.contains(e.target))) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'none';
  });
  window.addEventListener('drop', (e) => {
    esconderZonaSoltar();
    if (!arrastandoArquivos(e) || (secaoChat && secaoChat.contains(e.target))) return;
    e.preventDefault();
  });
  window.addEventListener('dragend', esconderZonaSoltar);

  // Print/imagem colado: o Chrome/Edge/Firefox nomeiam tudo como "image.png";
  // troca por um nome que ajuda a distinguir (print-AAAAMMDD-HHMMSS.png).
  const EXT_POR_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

  function nomearArquivoColado(arquivo) {
    if (arquivo.name && !/^image\.[a-z0-9]+$/i.test(arquivo.name)) return arquivo; // arquivo copiado do Explorer: mantém o nome
    const ext = EXT_POR_MIME[arquivo.type] || ((arquivo.type.split('/')[1] || 'png').toLowerCase());
    const d = new Date();
    const base = 'print-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    let nome = base + '.' + ext;
    for (let n = 2; estado.anexos.some((f) => f.name === nome); n++) nome = base + '-' + n + '.' + ext;
    return new File([arquivo], nome, { type: arquivo.type, lastModified: arquivo.lastModified || Date.now() });
  }

  document.addEventListener('paste', (e) => {
    if (refs.dialogo && refs.dialogo.open) return;

    // Colando em OUTRO campo (busca do topo, renomear conversa...): não interfere
    const alvo = e.target;
    if (alvo && alvo !== refs.campo && typeof alvo.closest === 'function' &&
        alvo.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;

    const area = e.clipboardData;
    if (!area) return;

    let arquivos = Array.from(area.files || []);
    if (!arquivos.length && area.items) {
      arquivos = Array.from(area.items)
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter(Boolean);
    }
    if (!arquivos.length) return; // só texto: cola normalmente no campo

    // Copiou células do Excel/Word (vem texto + imagem): fica com o texto, como sempre
    if ((area.getData('text/plain') || '').trim() !== '') return;

    e.preventDefault();
    if (estado.enviando) {
      avisarAnexo(AVISO_AGUARDAR_ANEXO);
      return;
    }
    escolherArquivos(arquivos.map(nomearArquivoColado));
  });

  // ==========================================================
  // EVENTOS
  // ==========================================================
  refs.campo.addEventListener('input', () => {
    ajustarAltura();
    atualizarBotaoEnviar();
  });

  // Enter envia; Shift+Enter quebra linha
  refs.campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      enviar(refs.campo.value, false);
    }
  });

  refs.enviar.addEventListener('click', () => {
    if (estado.enviando) {
      pararGeracao(); // "Parar geração"
    } else {
      enviar(refs.campo.value, false);
    }
  });

  // Clicar numa sugestão preenche o campo e envia (mesmo fluxo)
  refs.sugestoes.querySelectorAll('[data-texto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (estado.enviando) return;
      refs.campo.value = btn.getAttribute('data-texto') || '';
      enviar(refs.campo.value, false);
    });
  });

  refs.btnNova.addEventListener('click', () => novaConversa(true));

  if (refs.atalhoNova) {
    refs.atalhoNova.addEventListener('click', (e) => {
      e.preventDefault();
      novaConversa(true);
    });
  }

  // Offline
  function atualizarOffline() {
    refs.offline.hidden = navigator.onLine;
  }
  window.addEventListener('online', atualizarOffline);
  window.addEventListener('offline', atualizarOffline);

  // Esc: fecha primeiro o que estiver aberto na página; só então o menu lateral
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (estado.menuAberto) {
      fecharMenu(true);
      return;
    }
    if (refs.dialogo && refs.dialogo.open) return;
    if (document.querySelector('.' + P + 'conversa-editar')) return;
    fecharMenuLateral();
  });

  // ==========================================================
  // INICIALIZAÇÃO
  // ==========================================================
  definirHoraBoasVindas();
  atualizarOffline();
  atualizarBotaoEnviar();
  carregarLista(false);

  // Abriu com ?c=<id>: carrega essa conversa.
  // Se o usuário tinha enviado uma pergunta e saiu da página, retoma esse envio
  // (mostra a resposta pronta ou o "digitando..." se ainda estiver gerando).
  const idUrl = parseInt(new URLSearchParams(window.location.search).get('c') || '', 10) || 0;
  const pendente = lerPendente();
  if (pendente && (idUrl <= 0 || idUrl === pendente.conversaId)) {
    recuperarPendente(pendente, idUrl);
  } else {
    if (pendente) limparPendente(pendente.envioId); // era de outra conversa: a resposta já está nas conversas recentes
    if (idUrl > 0) abrirConversa(idUrl);
  }
})();
