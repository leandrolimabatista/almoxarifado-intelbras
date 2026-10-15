// ============================================================
// CONTEÚDO — Equipes (área CADASTRADO)
// Chat de equipe estilo Teams. Busca tudo de api/equipes/*.php
// (banco de dados real — sem dados fictícios) e mantém a tela
// sincronizada por polling leve enquanto o canal está aberto.
// ============================================================
(function () {
  'use strict';

  const raiz = document.getElementById('equipesRaiz');
  if (!raiz) return;

  const CSRF = raiz.getAttribute('data-csrf') || '';
  const EQUIPE = raiz.getAttribute('data-equipe') || 'geral';

  const EMOJIS_RAPIDOS = ['👍', '❤️', '😂', '😮', '😢', '🙌'];
  const EMOJI_RECENTES_CHAVE = 'equipes_emojis_recentes';
  const EMOJI_RECENTES_MAX = 24;

  // Seletor de emoji do composer (formato do Teams). A lista completa de emojis
  // (categorias, nomes em português e variações de tom de pele) vem de
  // js/emojis-dados.js, gerado a partir de todos-emojis.txt.
  const EMOJI_CATEGORIAS = window.EQUIPES_EMOJIS || [];
  const EMOJI_TONS = window.EQUIPES_EMOJIS_TONS || {};
  const EMOJI_TOM_CHAVE = 'equipes_emoji_tom';
  const semAcento = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
  const ICONE_LINK = { doc: '📄', plano: '🗂️', calendario: '📅', livro: '📘' };

  // ---------------------------------------------------------- Estado
  let dadosCanal = null;
  let ehMembro = null;
  let ultimoIdVisto = 0;
  let leituraAnterior = 0;
  let novasInseridas = false;
  let pollTimer = null;
  let editandoId = null; // id da mensagem em edição (pausa o redesenho automático)
  let digitandoTimerEnvio = null;
  let anexoSelecionado = null;
  let respostaAtual = null; // { id, autor, trecho }
  let tempIdSeq = -1;

  const mensagensPorId = new Map(); // id (ou tempId negativo) -> mensagem

  // ---------------------------------------------------------- Atalhos DOM
  const $ = (id) => document.getElementById(id);
  const skeleton = $('equipesSkeleton');
  const restrito = $('equipesRestrito');
  const chat = $('equipesChat');
  const painel = $('equipesPainel');
  const toast = $('equipesToast');
  const listaEl = $('equipesLista');
  const messagesEl = $('equipesMessages');
  const vazioEl = $('equipesVazio');
  const digitandoEl = $('equipesDigitando');
  const irFimBtn = $('equipesIrFim');

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function mostrarToast(mensagem, ehErro) {
    toast.textContent = mensagem;
    toast.classList.toggle('equipes__toast--erro', !!ehErro);
    toast.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.hidden = true; }, 4200);
  }

  async function chamarApi(url, opcoes) {
    const resp = await fetch(url, Object.assign({ credentials: 'same-origin' }, opcoes));
    let dados = null;
    try { dados = await resp.json(); } catch (e) { /* resposta vazia/binária */ }
    if (!resp.ok) {
      const erro = new Error((dados && dados.erro) || 'Não foi possível completar a ação.');
      erro.status = resp.status;
      throw erro;
    }
    return dados;
  }

  function jsonHeaders() {
    return { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF, Accept: 'application/json' };
  }

  // ============================================================
  // CARREGAMENTO INICIAL
  // ============================================================
  async function iniciar() {
    try {
      const dados = await chamarApi('api/equipes/canal.php?slug=' + encodeURIComponent(EQUIPE), {
        headers: { Accept: 'application/json' },
      });
      skeleton.hidden = true;
      ehMembro = !!dados.membro;

      if (!ehMembro) {
        renderizarRestrito(dados);
        return;
      }

      dadosCanal = dados;
      renderizarCabecalho(dados);
      renderizarPainel(dados);
      chat.hidden = false;
      painel.hidden = false;

      await carregarMensagens(true);
      iniciarPolling();
      iniciarComposer();
      iniciarInteracoesCabecalho();
      window.addEventListener('online', () => $('equipesOffline').hidden = true);
      window.addEventListener('offline', () => $('equipesOffline').hidden = false);
    } catch (e) {
      skeleton.hidden = true;
      mostrarToast(e.message || 'Não foi possível carregar o canal.', true);
    }
  }

  function renderizarRestrito(dados) {
    restrito.hidden = false;
    $('equipesRestritoNome').textContent = dados.equipe.nome;
    const btn = $('equipesBtnSolicitar');
    const aviso = $('equipesRestritoAviso');

    if (dados.solicitacao === 'pendente') {
      btn.disabled = true;
      btn.textContent = 'Pedido em análise';
      aviso.hidden = false;
      aviso.textContent = 'Seu pedido de acesso a esta equipe já foi enviado e está aguardando aprovação de um administrador.';
    } else if (dados.solicitacao === 'recusada') {
      aviso.hidden = false;
      aviso.textContent = 'Seu pedido de acesso anterior não foi aceito. Você pode tentar novamente.';
    }

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await chamarApi('api/equipes/acesso.php', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ slug: EQUIPE }),
        });
        btn.textContent = 'Pedido em análise';
        aviso.hidden = false;
        aviso.textContent = 'Pedido enviado! Você poderá acessar o canal assim que um administrador aceitar.';
      } catch (e) {
        btn.disabled = false;
        mostrarToast(e.message, true);
      }
    });
  }

  function renderizarCabecalho(dados) {
    const equipe = dados.equipe;
    $('equipesCanalIcone').style.background = equipe.cor;
    $('equipesCanalTitulo').textContent = equipe.nome;
    $('equipesCanalSubtitulo').textContent = 'Conversas da equipe ' + equipe.nome;
    document.title = equipe.nome + ' - Intelbras';

    const btnFav = $('equipesBtnFavorito');
    btnFav.setAttribute('aria-pressed', String(equipe.favorita));

    $('equipesMembrosCount').textContent = String(dados.membros_total);

    const podeChamar = !!(dados.eu && dados.eu.pode_chamar);
    ['equipesBtnVoz', 'equipesBtnVideo'].forEach((id) => {
      const b = $(id);
      b.style.opacity = podeChamar ? '' : '0.45';
      b.setAttribute('aria-disabled', podeChamar ? 'false' : 'true');
      if (!podeChamar) b.title = 'Apenas Diretores, Gerentes e CEO podem chamar a equipe toda.';
    });

    if (equipe.somente_leitura && !dados.eh_admin) {
      $('equipesSomenteLeitura').hidden = false;
      $('equipesComposer').hidden = true;
    }
  }

  // Membros do painel direito: mostra 5 e expande para todos ("Ver todos" / "+ N membros").
  let membrosPainel = [];
  let membrosExpandido = false;

  function renderizarMembrosPainel() {
    const listaMembros = $('equipesMembrosLista');
    const limite = 5;
    const visiveis = membrosExpandido ? membrosPainel : membrosPainel.slice(0, limite);
    listaMembros.innerHTML = visiveis.map(membroHtml).join('') || '<p style="font-size:12.5px;color:var(--eq-cinza)">Ainda não há outros membros nesta equipe.</p>';

    const maisBtn = $('equipesMaisMembros');
    const resto = membrosPainel.length - limite;
    if (!membrosExpandido && resto > 0) {
      maisBtn.hidden = false;
      maisBtn.textContent = '+ ' + resto + ' membro' + (resto > 1 ? 's' : '');
    } else {
      maisBtn.hidden = true;
    }

    const verTodos = $('equipesVerTodosMembros');
    verTodos.hidden = membrosPainel.length <= limite;
    verTodos.textContent = membrosExpandido ? 'Ver menos' : 'Ver todos';
  }

  function alternarMembrosPainel(expandir) {
    membrosExpandido = typeof expandir === 'boolean' ? expandir : !membrosExpandido;
    renderizarMembrosPainel();
  }

  function renderizarPainel(dados) {
    $('equipesSobreDescricao').textContent = dados.equipe.descricao || 'Sem descrição para este canal.';
    $('equipesPainelMembrosTotal').textContent = String(dados.membros_total);

    renderizarFixados(dados.arquivos_fixados);

    membrosPainel = dados.membros;
    renderizarMembrosPainel();

    const listaLinks = $('equipesLinksLista');
    listaLinks.innerHTML = dados.links.map((l) => {
      const conteudo = `<span class="equipes__link-icone">${ICONE_LINK[l.icone] || '📄'}</span><span>${escapeHtml(l.rotulo)}</span><span aria-hidden="true">›</span>`;
      if (l.icone === 'calendario' && !l.url) {
        return `<button type="button" class="equipes__link-item equipes__link-item--btn" data-acao="calendario" aria-haspopup="dialog" aria-expanded="false">${conteudo}</button>`;
      }
      return l.url
        ? `<a class="equipes__link-item" href="${escapeHtml(l.url)}">${conteudo}</a>`
        : `<span class="equipes__link-item" style="cursor:default;opacity:.7">${conteudo}</span>`;
    }).join('');

    const btnCal = listaLinks.querySelector('[data-acao="calendario"]');
    if (btnCal) iniciarCalendarioEquipe(listaLinks, btnCal);
  }

  // ============================================================
  // CALENDÁRIO DA EQUIPE (popup do link "Calendário da equipe")
  // ============================================================
  let calendarioLimpar = null;

  function iniciarCalendarioEquipe(wrap, btn) {
    if (calendarioLimpar) calendarioLimpar();
    const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    const hoje = new Date();
    let ano = hoje.getFullYear();
    let mes = hoje.getMonth();
    let selecionado = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

    const pop = document.createElement('div');
    pop.className = 'equipes__cal';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Calendário da equipe');
    pop.setAttribute('data-mv', 'menu');   // padrão do site: entrada animada + sombra de menu
    pop.setAttribute('data-mv-anim', '');
    pop.hidden = true;
    // fica no <body> para não ser cortado pelo painel (overflow/transform) e abrir ao lado dele
    document.body.appendChild(pop);

    function posicionar() {
      if (pop.hidden) return;
      const painel = btn.closest('.equipes__painel') || wrap;
      const rp = painel.getBoundingClientRect();
      const rb = btn.getBoundingClientRect();
      const larg = pop.offsetWidth;
      const alt = pop.offsetHeight;
      const margem = 8;
      let esq = rp.left - larg - margem;               // ao lado (esquerda do painel)
      if (esq < margem) esq = Math.max(margem, window.innerWidth - larg - margem); // sem espaço: encosta na direita
      let topo = rb.top + rb.height / 2 - alt / 2;      // centralizado no link
      topo = Math.min(Math.max(margem, topo), window.innerHeight - alt - margem);
      pop.style.left = esq + 'px';
      pop.style.top = topo + 'px';
    }

    const mesmoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    function desenhar(animarGrade) {
      const primeiro = new Date(ano, mes, 1);
      const inicio = primeiro.getDay();
      const diasNoMes = new Date(ano, mes + 1, 0).getDate();
      const diasMesAnterior = new Date(ano, mes, 0).getDate();

      let celulas = '';
      for (let i = inicio - 1; i >= 0; i--) {
        celulas += `<span class="equipes__cal-dia equipes__cal-dia--fora">${diasMesAnterior - i}</span>`;
      }
      for (let d = 1; d <= diasNoMes; d++) {
        const data = new Date(ano, mes, d);
        const cls = ['equipes__cal-dia'];
        if (mesmoDia(data, hoje)) cls.push('equipes__cal-dia--hoje');
        if (mesmoDia(data, selecionado)) cls.push('equipes__cal-dia--sel');
        celulas += `<button type="button" class="${cls.join(' ')}" data-dia="${d}">${d}</button>`;
      }
      const restantes = (7 - ((inicio + diasNoMes) % 7)) % 7;
      for (let d = 1; d <= restantes; d++) {
        celulas += `<span class="equipes__cal-dia equipes__cal-dia--fora">${d}</span>`;
      }

      pop.innerHTML = `
        <div class="equipes__cal-topo">
          <button type="button" class="equipes__cal-nav" data-nav="-1" aria-label="Mês anterior">‹</button>
          <strong class="equipes__cal-titulo">${MESES[mes]} de ${ano}</strong>
          <button type="button" class="equipes__cal-nav" data-nav="1" aria-label="Próximo mês">›</button>
        </div>
        <div class="equipes__cal-grade${animarGrade ? ' equipes__cal-grade--troca' : ''}">
          ${SEMANA.map((x) => `<span class="equipes__cal-sem">${x}</span>`).join('')}
          ${celulas}
        </div>
        <div class="equipes__cal-rodape"><button type="button" class="equipes__cal-hoje" data-hoje>Hoje</button></div>`;
    }

    function abrir(aberto) {
      pop.hidden = !aberto;
      btn.setAttribute('aria-expanded', String(aberto));
      if (aberto) { desenhar(); posicionar(); }
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      abrir(pop.hidden);
    });

    pop.addEventListener('click', (e) => {
      e.stopPropagation();
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        const novo = new Date(ano, mes + Number(nav.dataset.nav), 1);
        ano = novo.getFullYear();
        mes = novo.getMonth();
        desenhar(true);
        return;
      }
      if (e.target.closest('[data-hoje]')) {
        ano = hoje.getFullYear();
        mes = hoje.getMonth();
        selecionado = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
        desenhar(true);
        return;
      }
      const dia = e.target.closest('[data-dia]');
      if (dia) {
        selecionado = new Date(ano, mes, Number(dia.dataset.dia));
        desenhar();
      }
      posicionar();
    });

    const aoClicarFora = () => { if (!pop.hidden) abrir(false); };
    const aoTeclar = (e) => {
      if (e.key === 'Escape' && !pop.hidden) { abrir(false); btn.focus(); }
    };
    const aoRedimensionar = () => posicionar();

    document.addEventListener('click', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    window.addEventListener('resize', aoRedimensionar);
    // captura o scroll da página e de qualquer container (painel, etc.) para acompanhar o link
    window.addEventListener('scroll', aoRedimensionar, { passive: true, capture: true });

    calendarioLimpar = () => {
      document.removeEventListener('click', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('resize', aoRedimensionar);
      window.removeEventListener('scroll', aoRedimensionar, true);
      pop.remove();
      calendarioLimpar = null;
    };
  }

  function membroHtml(m) {
    const rotulos = { online: 'Online', reuniao: 'Em reunião', ausente: 'Ausente', offline: 'Offline' };
    const conteudo = `
        <span class="equipes__membro-avatar-wrap">
          <span class="equipes__membro-avatar">${escapeHtml(m.inicial)}</span>
          <span class="equipes__membro-presenca equipes__membro-presenca--${m.presenca}" title="${rotulos[m.presenca]}"></span>
        </span>
        <span class="equipes__membro-info">
          <span class="equipes__membro-nome">${escapeHtml(m.nome)}</span>
          <span class="equipes__membro-status">${rotulos[m.presenca]}</span>
        </span>`;

    // Clicar na foto ou no nome abre o chat com essa pessoa
    // (index.php?pagina=chat&usuario=<id> cria/abre a conversa).
    // No próprio usuário, abre a edição do perfil (Configurações > Meu perfil).
    const meuId = dadosCanal && dadosCanal.eu ? Number(dadosCanal.eu.id) : 0;
    if (!m.id) {
      return `<div class="equipes__membro">${conteudo}</div>`;
    }
    if (Number(m.id) === meuId) {
      return `<a class="equipes__membro equipes__membro--link" href="index.php?pagina=configuracoes" title="Editar meu perfil">${conteudo}</a>`;
    }
    const href = 'index.php?pagina=chat&usuario=' + encodeURIComponent(m.id);
    return `<a class="equipes__membro equipes__membro--link" href="${href}" title="Conversar com ${escapeHtml(m.nome)}">${conteudo}</a>`;
  }

  function renderizarFixados(lista) {
    $('equipesFixadosCount').textContent = String(lista.length);
    const el = $('equipesFixadosLista');
    el.innerHTML = lista.map((f) => `
      <a class="equipes__fixado-item" href="api/equipes/arquivo.php?id=${f.anexo_id}${['pdf', 'txt', 'png', 'jpg', 'jpeg', 'webp'].includes(f.extensao) ? '&modo=ver' : ''}" target="_blank" rel="noopener">
        <span style="width:22px;height:22px;border-radius:5px;background:${CORES_ARQUIVO[f.extensao] || '#6B7280'};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0">${ROTULO_ARQUIVO[f.extensao] || f.extensao.toUpperCase()}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(f.nome)}</span>
      </a>`).join('');
  }

  function iniciarInteracoesCabecalho() {
    $('equipesBtnFavorito').addEventListener('click', () => {
      const btn = $('equipesBtnFavorito');
      const novo = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(novo));
      // Grava no servidor (alimenta o card "Equipes favoritas" do Início).
      // Se falhar, volta a estrela ao estado anterior.
      fetch('api/equipes/favorita.php', {
        method: 'POST', headers: jsonHeaders(), credentials: 'same-origin',
        body: JSON.stringify({ slug: EQUIPE, favorita: novo }),
      }).then((r) => r.json().catch(() => ({})).then((d) => {
        if (!r.ok || d.sucesso === false) throw new Error(d.erro || 'Falha');
      })).catch(() => {
        btn.setAttribute('aria-pressed', String(!novo));
        mostrarToast('Não foi possível atualizar o favorito.');
      });
    });

    $('equipesBtnMembros').addEventListener('click', () => togglePainel());
    $('equipesPainelFechar').addEventListener('click', () => togglePainel(false));
    $('equipesVerTodosMembros').addEventListener('click', () => alternarMembrosPainel());
    $('equipesMaisMembros').addEventListener('click', () => alternarMembrosPainel(true));

    const btnMais = $('equipesBtnMais');
    const menuMais = $('equipesMenuMais');
    btnMais.addEventListener('click', (e) => {
      e.stopPropagation();
      const aberto = menuMais.hidden;
      menuMais.hidden = !aberto;
      btnMais.setAttribute('aria-expanded', String(aberto));
    });
    $('equipesMenuVerDocumentos').addEventListener('click', () => {
      window.location.href = 'index.php?pagina=documentos';
    });
    // Silenciar canal: guardado neste navegador (localStorage). Canais
    // silenciados não geram badge na lateral nem aparecem no sino do
    // cabeçalho, e ganham um ícone de "silenciado" no menu lateral.
    const CHAVE_SILENCIADAS = 'equipesSilenciadas';
    const itemSilenciar = $('equipesMenuSilenciar');

    function lerSilenciadas() {
      try {
        const v = JSON.parse(localStorage.getItem(CHAVE_SILENCIADAS) || '[]');
        return Array.isArray(v) ? v.map(String) : [];
      } catch (e) { return []; }
    }

    function atualizarRotuloSilenciar() {
      itemSilenciar.textContent = lerSilenciadas().indexOf(EQUIPE) !== -1
        ? 'Reativar notificações'
        : 'Silenciar canal';
    }

    atualizarRotuloSilenciar();

    itemSilenciar.addEventListener('click', () => {
      menuMais.hidden = true;
      const lista = lerSilenciadas();
      const estavaMudo = lista.indexOf(EQUIPE) !== -1;
      const nova = estavaMudo ? lista.filter((x) => x !== EQUIPE) : lista.concat(EQUIPE);
      try { localStorage.setItem(CHAVE_SILENCIADAS, JSON.stringify(nova)); } catch (e) { /* sem storage */ }
      atualizarRotuloSilenciar();
      window.dispatchEvent(new Event('intelbras:silenciadas')); // atualiza o menu lateral
      mostrarToast(estavaMudo ? 'Notificações reativadas.' : 'Canal silenciado.');
    });

    // A sala (WebRTC) vive na página Chamadas: abrimos ela já pedindo a chamada deste canal.
    // Só Gerente, Diretor e CEO (e o Administrador) podem chamar a equipe.
    function chamarEquipe(midia) {
      if (!dadosCanal || !dadosCanal.eu || !dadosCanal.eu.pode_chamar) {
        mostrarToast('Apenas Diretores, Gerentes e CEO podem chamar a equipe toda.');
        return;
      }
      // &origem=equipes: a sala abre direto e, ao desligar, a volta cai neste canal (igual ao Chat).
      window.location.href = 'index.php?pagina=chamadas&chamar_equipe=' + encodeURIComponent(EQUIPE) + '&midia=' + midia + '&origem=equipes';
    }
    $('equipesBtnVoz').addEventListener('click', () => chamarEquipe('voz'));
    $('equipesBtnVideo').addEventListener('click', () => chamarEquipe('video'));
    $('equipesBtnFixados').addEventListener('click', () => {
      const l = $('equipesFixadosLista');
      l.hidden = !l.hidden;
    });

    document.querySelectorAll('.equipes__tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.equipes__tab').forEach((t) => t.classList.remove('equipes__tab--ativa'));
        document.querySelectorAll('[data-corpo-aba]').forEach((c) => { c.hidden = true; });
        tab.classList.add('equipes__tab--ativa');
        const aba = tab.getAttribute('data-aba');
        const corpo = document.querySelector('[data-corpo-aba="' + aba + '"]');
        if (corpo) corpo.hidden = false;
      });
    });

    document.addEventListener('click', () => { menuMais.hidden = true; });
  }

  function togglePainel(forcar) {
    const aberto = typeof forcar === 'boolean' ? forcar : !painel.classList.contains('equipes__painel--aberto');
    painel.classList.toggle('equipes__painel--aberto', aberto);
  }

  // ============================================================
  // MENSAGENS
  // ============================================================
  async function carregarMensagens(inicial) {
    const url = 'api/equipes/mensagens.php?slug=' + encodeURIComponent(EQUIPE) + '&depois_de=' + ultimoIdVisto;
    const dados = await chamarApi(url, { headers: { Accept: 'application/json' } });

    if (inicial) {
      leituraAnterior = dados.leitura_anterior || 0;
    }
    dados.mensagens.forEach((m) => mensagensPorId.set(m.id, m));
    if (dados.ultimo_id > ultimoIdVisto) ultimoIdVisto = dados.ultimo_id;

    renderizarDigitando(dados.digitando || []);
    // Editando uma mensagem: guarda as novidades, mas só redesenha quando terminar
    // (senão a atualização automática apagava a caixa de edição a cada poucos segundos)
    if (editandoId && !inicial) return;
    renderizarLista(inicial);
  }

  function iniciarPolling() {
    pollTimer = setInterval(async () => {
      try {
        await carregarMensagens(false);
      } catch (e) {
        // Falha silenciosa no polling — não incomoda com toast a cada 3s.
      }
    }, 3500);
  }

  function estaPertoDoFim() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
  }

  function renderizarLista(inicial) {
    editandoId = null; // qualquer redesenho descarta a caixa de edição aberta
    const pertoDoFim = estaPertoDoFim();
    const topoAnterior = messagesEl.scrollTop; // preserva a posição de rolagem entre redesenhos
    const ids = Array.from(mensagensPorId.keys()).filter((id) => id > 0).sort((a, b) => a - b);

    if (!ids.length) {
      listaEl.innerHTML = '';
      vazioEl.hidden = false;
      return;
    }
    vazioEl.hidden = true;

    let html = '';
    let diaAnterior = null;
    let divisorNovasInserido = novasInseridas;
    let grupoAutor = null;
    let grupoHora = 0;
    let grupoAberto = false;

    function fecharGrupoSeAberto() {
      if (grupoAberto) { html += '</div></div>'; grupoAberto = false; }
    }

    ids.forEach((id) => {
      const m = mensagensPorId.get(id);
      const dataMsg = new Date(m.criada_em);
      const diaChave = dataMsg.toDateString();

      if (diaChave !== diaAnterior) {
        fecharGrupoSeAberto();
        html += `<div class="equipes__data-divisor"><span>${formatarDataDivisor(dataMsg)}</span></div>`;
        diaAnterior = diaChave;
        grupoAutor = null;
      }

      if (!divisorNovasInserido && leituraAnterior > 0 && m.id > leituraAnterior && !m.minha) {
        fecharGrupoSeAberto();
        html += `<div class="equipes__novas-divisor"><span>Novas mensagens</span></div>`;
        divisorNovasInserido = true;
        novasInseridas = true;
        grupoAutor = null;
      }

      const novoGrupo = grupoAutor !== m.usuario_id || (dataMsg.getTime() - grupoHora) > 5 * 60000;
      if (novoGrupo) {
        fecharGrupoSeAberto();
        html += renderizarAberturaGrupo(m, dataMsg);
        grupoAberto = true;
      }
      html += renderizarMensagem(m, dataMsg, novoGrupo);

      grupoAutor = m.usuario_id;
      grupoHora = dataMsg.getTime();
    });
    fecharGrupoSeAberto();

    listaEl.innerHTML = html;
    ligarEventosMensagens();

    // Só vai ao fim na carga inicial (sem divisor de novas) ou se o usuário já estava no fim;
    // nos demais casos mantém onde ele estava, para a atualização automática não "puxar" a tela.
    if (pertoDoFim || (inicial && novasInseridas === false)) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else {
      messagesEl.scrollTop = topoAnterior;
    }
    irFimBtn.hidden = estaPertoDoFim();
  }

  function renderizarAberturaGrupo(m, dataMsg) {
    const lado = m.minha ? 'equipes__grupo--minha' : '';
    return `
      <div class="equipes__grupo ${lado} equipes__grupo--inicio" data-usuario-id="${m.usuario_id}">
        <span class="equipes__grupo-avatar">${escapeHtml(m.inicial)}</span>
        <div class="equipes__grupo-corpo">
          <div class="equipes__grupo-meta">${m.minha ? `<span>${formatarHora(dataMsg)}</span><strong>Você</strong>` : `<strong>${escapeHtml(m.autor)}</strong><span>${formatarHora(dataMsg)}</span>`}</div>`;
  }

  function formatarConteudo(texto) {
    let t = escapeHtml(texto);
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    t = t.replace(/__([^_]+)__/g, '<u>$1</u>');
    t = t.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/@([\p{L}0-9_]{2,40})/gu, '<mark class="equipes__mencao">@$1</mark>');
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/(?<![">])((https?:\/\/)[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return t;
  }

  function renderizarMensagem(m, dataMsg, primeiraDoGrupo) {
    if (m.apagada) {
      return `<div class="equipes__msg ${m.minha ? 'equipes__msg--minha' : ''}" data-msg-id="${m.id}">
        <div class="equipes__bolha equipes__bolha--apagada">Esta mensagem foi apagada</div>
      </div>`;
    }

    const citacao = m.resposta_a ? `
      <div class="equipes__citacao">
        <span class="equipes__citacao-autor"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7L4.5 11.5 9 16"/><path d="M4.5 11.5H14a5.5 5.5 0 015.5 5.5v1"/></svg>${escapeHtml(m.resposta_a.autor)}</span>
        <span class="equipes__citacao-trecho">${escapeHtml(m.resposta_a.trecho)}</span>
      </div>` : '';

    const anexosHtml = (m.anexos || []).map((a) => {
      const ehImagem = ['png', 'jpg', 'jpeg', 'webp'].includes(a.extensao);
      const urlVer = 'api/equipes/arquivo.php?id=' + a.id + '&modo=ver';
      const urlBaixar = 'api/equipes/arquivo.php?id=' + a.id;
      if (ehImagem) {
        return `<div class="equipes__imagens-grade"><a href="${urlVer}" target="_blank" rel="noopener"><img src="${urlVer}" alt="${escapeHtml(a.nome)}" loading="lazy"></a></div>`;
      }
      const cor = CORES_ARQUIVO[a.extensao] || '#6B7280';
      const rotulo = ROTULO_ARQUIVO[a.extensao] || a.extensao.toUpperCase();
      // PDF, imagem e texto abrem em outra aba; os demais formatos (Word, Excel…) o navegador não exibe, então baixam.
      const abreNaAba = ['pdf', 'txt'].includes(a.extensao);
      return `<a class="equipes__anexo-card" href="${abreNaAba ? urlVer : urlBaixar}" target="_blank" rel="noopener">
        <span class="equipes__anexo-icone" style="background:${cor}">${rotulo}</span>
        <span class="equipes__anexo-info">
          <span class="equipes__anexo-nome">${escapeHtml(a.nome)}</span>
          <span class="equipes__anexo-tamanho">${formatarTamanho(a.tamanho)}</span>
        </span>
      </a>`;
    }).join('');

    const reacoesHtml = (m.reacoes || []).length ? `
      <div class="equipes__reacoes" data-reacoes>${(m.reacoes || []).map((r) => `
        <button type="button" class="equipes__reacao ${r.reagiu ? 'equipes__reacao--minha' : ''}" data-reagir="${r.emoji}">${r.emoji} ${r.total}</button>
      `).join('')}</div>` : '<div class="equipes__reacoes" data-reacoes></div>';

    const statusHtml = m.status ? `<span class="equipes__status ${m.status === 'lida' ? 'equipes__status--lida' : ''}">${m.status === 'lida' ? 'Lida' : 'Enviada'}</span>` : '';
    const editadaHtml = m.editada ? '<span class="equipes__editada-rotulo">(editada)</span>' : '';
    const podeApagarOuEditar = m.minha;
    const podeFixar = (m.anexos || []).length > 0 && dadosCanal && dadosCanal.eh_admin;

    return `
      <div class="equipes__msg ${m.minha ? 'equipes__msg--minha' : ''}" data-msg-id="${m.id}">
        <div class="equipes__toolbar-wrap">
          <div class="equipes__toolbar">
            <button type="button" class="equipes__toolbar-btn" data-acao="reagir-abrir" title="Reagir" aria-label="Reagir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c.9 1.2 2 1.8 3.5 1.8s2.6-.6 3.5-1.8"/><path d="M9.2 9.8h.01M14.8 9.8h.01"/></svg></button>
            <button type="button" class="equipes__toolbar-btn" data-acao="responder" title="Responder" aria-label="Responder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7L4.5 11.5 9 16"/><path d="M4.5 11.5H14a5.5 5.5 0 015.5 5.5v1"/></svg></button>
            ${podeFixar ? `<button type="button" class="equipes__toolbar-btn" data-acao="${m.fixada ? 'desfixar' : 'fixar'}" title="${m.fixada ? 'Desfixar' : 'Fixar'}" aria-label="${m.fixada ? 'Desfixar' : 'Fixar'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6l-1 5.5 3 3V14H7v-1.5l3-3L9 4z"/><path d="M12 14v6"/></svg></button>` : ''}
            <button type="button" class="equipes__toolbar-btn" data-acao="mais-abrir" title="Mais" aria-label="Mais opções"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></svg></button>
          </div>
        </div>
        <div class="equipes__bolha" data-conteudo>
          ${citacao}
          <span data-texto>${formatarConteudo(m.conteudo)}</span>${editadaHtml}
          ${anexosHtml}
        </div>
        ${reacoesHtml}
        ${statusHtml}
      </div>`;
  }

  function formatarTamanho(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatarHora(d) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatarDataDivisor(d) {
    const hoje = new Date();
    const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
    const opcoes = { day: 'numeric', month: 'long', year: 'numeric' };
    if (d.toDateString() === hoje.toDateString()) return 'Hoje, ' + d.toLocaleDateString('pt-BR', opcoes);
    if (d.toDateString() === ontem.toDateString()) return 'Ontem, ' + d.toLocaleDateString('pt-BR', opcoes);
    return d.toLocaleDateString('pt-BR', opcoes);
  }

  function renderizarDigitando(nomes) {
    if (!nomes.length) { digitandoEl.hidden = true; return; }
    digitandoEl.hidden = false;
    const texto = nomes.length === 1
      ? `${nomes[0]} está digitando…`
      : `${nomes.slice(0, 2).join(', ')}${nomes.length > 2 ? ' e outros' : ''} estão digitando…`;
    $('equipesDigitandoTexto').textContent = texto;
  }

  // ---------------------------------------------------------- Ações por mensagem
  function ligarEventosMensagens() {
    listaEl.querySelectorAll('[data-msg-id]').forEach((el) => {
      const id = Number(el.getAttribute('data-msg-id'));

      el.querySelectorAll('[data-reagir]').forEach((btn) => {
        btn.addEventListener('click', () => reagir(id, btn.getAttribute('data-reagir')));
      });

      const btnReagirAbrir = el.querySelector('[data-acao="reagir-abrir"]');
      if (btnReagirAbrir) btnReagirAbrir.addEventListener('click', (e) => abrirPickerReacao(e, id));

      const btnResponder = el.querySelector('[data-acao="responder"]');
      if (btnResponder) btnResponder.addEventListener('click', () => {
        if (respostaAtual && respostaAtual.id === id) { // segundo clique: cancela a resposta
          respostaAtual = null;
          $('equipesRespostaPreview').hidden = true;
        } else {
          iniciarResposta(id);
        }
      });

      const btnFixar = el.querySelector('[data-acao="fixar"], [data-acao="desfixar"]');
      if (btnFixar) btnFixar.addEventListener('click', () => alternarFixado(id, btnFixar.getAttribute('data-acao') === 'fixar'));

      const btnMais = el.querySelector('[data-acao="mais-abrir"]');
      if (btnMais) btnMais.addEventListener('click', (e) => abrirMenuMais(e, id));
    });
  }

  function abrirPickerReacao(evento, id) {
    const ancora = evento.currentTarget;
    const wrap = ancora.closest('.equipes__toolbar-wrap');
    if (wrap.querySelector('.equipes__reacao-picker')) { // segundo clique no botão: fecha
      fecharPopoversFlutuantes();
      evento.stopPropagation();
      return;
    }
    fecharPopoversFlutuantes();
    const picker = document.createElement('div');
    picker.className = 'equipes__reacao-picker';
    picker.innerHTML = EMOJIS_RAPIDOS.map((e) => `<button type="button" data-rapido="${e}" aria-label="Reagir com ${e}">${e}</button>`).join('')
      + '<button type="button" class="equipes__reacao-mais" data-mais-emojis aria-label="Mais emojis" title="Mais emojis"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 8.5v7M8.5 12h7"/></svg></button>';
    picker.querySelectorAll('[data-rapido]').forEach((b) => {
      b.addEventListener('click', (ev) => { ev.stopPropagation(); reagir(id, b.getAttribute('data-rapido')); picker.remove(); });
    });
    picker.querySelector('[data-mais-emojis]').addEventListener('click', (ev) => {
      ev.stopPropagation();
      picker.remove();
      abrirPickerCompleto(ancora, id);
    });
    wrap.appendChild(picker);
    // Abre abaixo da barra; sem espaço embaixo (última mensagem), abre acima dela
    const caixaMsgs = messagesEl.getBoundingClientRect();
    if (picker.getBoundingClientRect().bottom > caixaMsgs.bottom) {
      picker.style.top = (-picker.offsetHeight - 4) + 'px';
    }
    setTimeout(() => document.addEventListener('click', function fechar() { picker.remove(); document.removeEventListener('click', fechar); }), 0);
    evento.stopPropagation();
  }

  // Seletor COMPLETO de emojis para reagir (como o do Teams): busca, tom de pele, categorias e recentes.
  // Usa a mesma lista, os mesmos recentes e o mesmo tom de pele do seletor do campo de texto.
  function abrirPickerCompleto(ancora, id) {
    fecharPopoversFlutuantes();
    const pop = document.createElement('div');
    pop.className = 'equipes__popover equipes__popover--emoji equipes__reacao-completo';
    pop.innerHTML = `
      <div class="equipes__emoji-abas"><button type="button" class="equipes__emoji-aba equipes__emoji-aba--ativa">Emoji</button></div>
      <div class="equipes__emoji-busca-linha">
        <div class="equipes__emoji-busca">
          <input type="text" placeholder="Encontre algo divertido" autocomplete="off" aria-label="Buscar emoji">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </div>
        <div class="equipes__emoji-tom-wrap">
          <button type="button" class="equipes__emoji-tom-btn" aria-label="Tom de pele" aria-haspopup="true" aria-expanded="false" title="Tom de pele">✋</button>
          <div class="equipes__emoji-tom-menu" hidden></div>
        </div>
      </div>
      <div class="equipes__emoji-grade"></div>
      <div class="equipes__emoji-categorias"></div>`;
    document.body.appendChild(pop);

    const busca = pop.querySelector('input');
    const grade = pop.querySelector('.equipes__emoji-grade');
    const barra = pop.querySelector('.equipes__emoji-categorias');
    const tomBtn = pop.querySelector('.equipes__emoji-tom-btn');
    const tomMenu = pop.querySelector('.equipes__emoji-tom-menu');

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
        `<button type="button" data-tom="${i}" class="${i === tom ? 'equipes__emoji-tom--ativo' : ''}" title="${NOMES_TOM[i]}" aria-label="${NOMES_TOM[i]}">${AMOSTRA_TOM}${m}</button>`
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
      barra.querySelectorAll('[data-cat]').forEach((b) => b.classList.toggle('equipes__emoji-categoria--ativa', b.getAttribute('data-cat') === ativa));
    }
    function desenharTudo() {
      const secoes = [];
      const rec = recentes();
      if (rec.length) secoes.push({ id: 'recentes', icone: '🕒', titulo: 'Usados recentemente', itens: rec.map((e) => [e, 'recente']) });
      EMOJI_CATEGORIAS.forEach((c) => secoes.push(c));
      grade.innerHTML = secoes.map((c) => `<div class="equipes__emoji-grade-titulo" data-sec="${c.id}">${escapeHtml(c.titulo)}</div>` + c.itens.map(([e, n]) => botao(e, n)).join('')).join('');
      barra.innerHTML = secoes.map((c) => `<button type="button" class="equipes__emoji-categoria" data-cat="${c.id}" title="${escapeHtml(c.titulo)}" aria-label="${escapeHtml(c.titulo)}">${c.icone}</button>`).join('');
      barra.hidden = false;
      grade.scrollTop = 0;
      marcarAtiva();
    }
    function desenharBusca(termo) {
      barra.hidden = true;
      const achados = [];
      EMOJI_CATEGORIAS.forEach((c) => c.itens.forEach((item) => { if (semAcento(item[1]).includes(termo)) achados.push(item); }));
      grade.innerHTML = achados.length
        ? '<div class="equipes__emoji-grade-titulo">Resultados</div>' + achados.map(([e, n]) => botao(e, n)).join('')
        : '<div class="equipes__emoji-grade-vazio">Nenhum emoji encontrado.</div>';
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
    const barraEl = ancora.closest('.equipes__toolbar') || ancora;
    const r = barraEl.getBoundingClientRect();
    const area = messagesEl.getBoundingClientRect();
    const larg = pop.offsetWidth || 330;
    const alt = pop.offsetHeight || 380;
    const minhaMsg = !!ancora.closest('.equipes__msg--minha');
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
      messagesEl.removeEventListener('scroll', fechar);
    }
    function fora(ev) { if (!pop.contains(ev.target)) fechar(); }
    function tecla(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); fechar(); } }
    document.addEventListener('mousedown', fora, true);
    document.addEventListener('keydown', tecla, true);
    messagesEl.addEventListener('scroll', fechar);
  }

  function abrirMenuMais(evento, id) {
    const wrap = evento.currentTarget.closest('.equipes__toolbar-wrap');
    if (wrap.querySelector('.equipes__msg-menu')) { // segundo clique no botão: fecha
      fecharPopoversFlutuantes();
      evento.stopPropagation();
      return;
    }
    fecharPopoversFlutuantes();
    const m = mensagensPorId.get(id);
    const menu = document.createElement('div');
    menu.className = 'equipes__msg-menu';
    const itens = [];
    if (m.minha) itens.push('<button type="button" data-op="editar">Editar</button>');
    itens.push('<button type="button" data-op="copiar">Copiar texto</button>');
    if (m.minha) itens.push('<button type="button" data-op="apagar">Apagar</button>');
    menu.setAttribute('role', 'menu');
    menu.innerHTML = itens.map((i) => i.replace('<button', '<button class="equipes__msg-menu-item" role="menuitem"')).join('');
    menu.querySelector('[data-op="editar"]')?.addEventListener('click', (ev) => { ev.stopPropagation(); menu.remove(); iniciarEdicao(id); });
    menu.querySelector('[data-op="copiar"]')?.addEventListener('click', (ev) => {
      ev.stopPropagation(); menu.remove();
      navigator.clipboard?.writeText(m.conteudo).then(() => mostrarToast('Texto copiado.'));
    });
    menu.querySelector('[data-op="apagar"]')?.addEventListener('click', (ev) => { ev.stopPropagation(); menu.remove(); apagarMensagem(id); });
    wrap.appendChild(menu);
    // Abre abaixo da barra; se não couber (última mensagem), abre acima dela
    if (menu.getBoundingClientRect().bottom > messagesEl.getBoundingClientRect().bottom) {
      menu.style.top = (-menu.offsetHeight - 4) + 'px';
    }
    setTimeout(() => document.addEventListener('click', function fechar() { menu.remove(); document.removeEventListener('click', fechar); }), 0);
    evento.stopPropagation();
  }

  function fecharPopoversFlutuantes() {
    document.querySelectorAll('.equipes__reacao-picker, .equipes__msg-menu, .equipes__reacao-completo').forEach((el) => el.remove());
  }

  const menuMsgFechado = { id: null, em: 0 };
  // Botão direito numa mensagem: mesmas ações da barra "⋯", no menu padronizado do site
  // (assets/js/menu-contexto.js). Links, imagens e a edição inline mantêm o menu do navegador.
  listaEl.addEventListener('contextmenu', (e) => {
    const M = window.MenuContexto;
    const el = e.target.closest('[data-msg-id]');
    if (!M || !el || e.shiftKey || M.temSelecao()) return;
    if (e.target.closest('a[href], img, textarea, input, button')) return;
    const id = Number(el.getAttribute('data-msg-id'));
    const m = mensagensPorId.get(id);
    if (!m || m.apagada || id < 0) return; // apagada ou ainda sendo enviada
    e.preventDefault();
    fecharPopoversFlutuantes();
    // Segundo botão direito na mesma mensagem: o menu já foi fechado pelo clique; não reabre.
    if (menuMsgFechado.id === id && Date.now() - menuMsgFechado.em < 500) { menuMsgFechado.id = null; return; }
    const pos = M.posicao(e, el);

    const opcoes = [
      { rotulo: 'Responder', icone: 'responder', destaque: true, acao: () => iniciarResposta(id) },
      { rotulo: 'Copiar texto', icone: 'copiar', desabilitado: !m.conteudo,
        acao: () => M.copiar(m.conteudo, 'Texto copiado') },
    ];
    if ((m.anexos || []).length > 0 && dadosCanal && dadosCanal.eh_admin) {
      opcoes.push({ rotulo: m.fixada ? 'Desfixar' : 'Fixar no canal', icone: m.fixada ? 'unpin' : 'pin',
        acao: () => alternarFixado(id, !m.fixada) });
    }
    if (m.minha) {
      opcoes.push('sep');
      opcoes.push({ rotulo: 'Editar', icone: 'editar', acao: () => iniciarEdicao(id) });
      opcoes.push({ rotulo: 'Apagar', icone: 'lixeira', perigo: true, acao: () => apagarMensagem(id) });
    }
    M.mostrar({
      x: pos.x, y: pos.y, alvo: null,
      aria: 'Opções da mensagem',
      cabeca: M.cabeca('mensagem', m.minha ? 'Você' : (m.autor || 'Mensagem')),
      opcoes: opcoes,
      aoFechar: () => { menuMsgFechado.id = id; menuMsgFechado.em = Date.now(); },
    });
  });

  async function reagir(id, emoji) {
    try {
      const dados = await chamarApi('api/equipes/mensagem.php', {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ id, slug: EQUIPE, acao: 'reagir', emoji }),
      });
      if (dados.mensagem) { mensagensPorId.set(id, dados.mensagem); renderizarLista(); }
    } catch (e) {
      mostrarToast(e.message, true);
    }
  }

  async function alternarFixado(id, fixar) {
    try {
      const dados = await chamarApi('api/equipes/mensagem.php', {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ id, slug: EQUIPE, acao: fixar ? 'fixar' : 'desfixar' }),
      });
      if (dados.mensagem) mensagensPorId.set(id, dados.mensagem);
      if (dados.fixados) renderizarFixados(dados.fixados);
      renderizarLista();
      mostrarToast(fixar ? 'Arquivo fixado no canal.' : 'Arquivo desafixado.');
    } catch (e) {
      mostrarToast(e.message, true);
    }
  }

  function iniciarResposta(id) {
    const m = mensagensPorId.get(id);
    if (!m || m.apagada) return;
    respostaAtual = { id: m.id, autor: m.minha ? 'Você' : m.autor, trecho: m.conteudo.slice(0, 140) };
    $('equipesRespostaAutor').textContent = respostaAtual.autor;
    $('equipesRespostaTrecho').textContent = respostaAtual.trecho;
    $('equipesRespostaPreview').hidden = false;
    $('equipesCampoTexto').focus();
  }

  function iniciarEdicao(id) {
    const m = mensagensPorId.get(id);
    const el = listaEl.querySelector('[data-msg-id="' + id + '"] [data-conteudo]');
    if (!m || !el) return;
    const textoAtual = m.conteudo;
    editandoId = id;
    el.innerHTML = `
      <div class="equipes__edicao">
        <textarea rows="2" aria-label="Editar mensagem">${escapeHtml(textoAtual)}</textarea>
        <div class="equipes__edicao-acoes">
          <button type="button" class="equipes__edicao-cancelar" data-op="cancelar">Cancelar</button>
          <button type="button" class="equipes__edicao-salvar" data-op="salvar">Salvar</button>
        </div>
      </div>`;
    const textarea = el.querySelector('textarea');
    textarea.focus();
    textarea.setSelectionRange(textoAtual.length, textoAtual.length);
    const ajustarAltura = () => { textarea.style.height = 'auto'; textarea.style.height = Math.min(textarea.scrollHeight + 2, 200) + 'px'; };
    textarea.addEventListener('input', ajustarAltura);
    ajustarAltura();
    el.scrollIntoView({ block: 'nearest' }); // mantém campo e botões visíveis

    el.querySelector('[data-op="cancelar"]').addEventListener('click', () => { editandoId = null; renderizarLista(); });
    el.querySelector('[data-op="salvar"]').addEventListener('click', async () => {
      const novoTexto = textarea.value.trim();
      if (!novoTexto) return;
      try {
        const dados = await chamarApi('api/equipes/mensagem.php', {
          method: 'POST', headers: jsonHeaders(),
          body: JSON.stringify({ id, slug: EQUIPE, acao: 'editar', conteudo: novoTexto }),
        });
        if (dados.mensagem) mensagensPorId.set(id, dados.mensagem);
        editandoId = null;
        renderizarLista();
      } catch (e) {
        mostrarToast(e.message, true);
      }
    });
  }

  async function apagarMensagem(id) {
    if (!(await window.IBDialogo.confirmar({ titulo: 'Apagar mensagem?', texto: 'Esta mensagem será apagada para todos os membros da equipe.', confirmar: 'Apagar', perigo: true }))) return;
    try {
      const dados = await chamarApi('api/equipes/mensagem.php', {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ id, slug: EQUIPE, acao: 'apagar' }),
      });
      if (dados.mensagem) mensagensPorId.set(id, dados.mensagem);
      renderizarLista();
    } catch (e) {
      mostrarToast(e.message, true);
    }
  }

  // ============================================================
  // COMPOSER
  // ============================================================
  function iniciarComposer() {
    const form = $('equipesComposer');
    const campo = $('equipesCampoTexto');
    const btnEnviar = $('equipesBtnEnviar');
    const btnAnexar = $('equipesBtnAnexar');
    const inputArquivo = $('equipesInputArquivo');

    function atualizarBotaoEnviar() {
      btnEnviar.disabled = !campo.value.trim() && !anexoSelecionado;
    }

    function autoResize() {
      campo.style.height = 'auto';
      campo.style.height = Math.min(campo.scrollHeight, 130) + 'px';
    }

    campo.addEventListener('input', () => {
      autoResize();
      atualizarBotaoEnviar();
      tratarMencaoEComando();
      dispararDigitando();
    });

    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
      if (e.key === 'Escape') {
        $('equipesMencaoPopover').hidden = true;
        $('equipesComandoPopover').hidden = true;
      }
    });

    // Anexo
    btnAnexar.addEventListener('click', () => inputArquivo.click());
    inputArquivo.addEventListener('change', () => {
      const f = inputArquivo.files[0];
      if (!f) return;
      anexoSelecionado = f;
      $('equipesAnexoNome').textContent = f.name;
      $('equipesAnexoPreview').hidden = false;
      atualizarBotaoEnviar();
    });
    $('equipesAnexoRemover').addEventListener('click', () => {
      anexoSelecionado = null;
      inputArquivo.value = '';
      $('equipesAnexoPreview').hidden = true;
      atualizarBotaoEnviar();
    });

    // Cancelar resposta
    $('equipesRespostaFechar').addEventListener('click', () => {
      respostaAtual = null;
      $('equipesRespostaPreview').hidden = true;
    });

    // Formatação (estilo Teams): botão "A" expande o campo com barra + editor visual
    editorApi = iniciarEditorFormatacao(campo, form);

    // Emoji (seletor com busca + categorias)
    const btnEmoji = $('equipesBtnEmoji');
    const emojiPopover = $('equipesEmojiPopover');
    const emojiBusca = $('equipesEmojiBusca');
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
    const grade = $('equipesEmojiGrade');
    const barraCats = $('equipesEmojiCategorias');
    let abaEmoji = 'emoji';
    const tomBtn = $('equipesEmojiTomBtn');
    const tomMenu = $('equipesEmojiTomMenu');
    const tomWrap = $('equipesEmojiTomWrap');
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
        `<button type="button" data-tom="${i}" class="${i === tomAtual ? 'equipes__emoji-tom--ativo' : ''}" title="${NOMES_TOM[i]}" aria-label="${NOMES_TOM[i]}">${AMOSTRA_TOM}${m}</button>`
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
      grade.className = 'equipes__emoji-grade';
      grade.innerHTML = secoes.map((c) =>
        `<div class="equipes__emoji-grade-titulo" data-sec="${c.id}">${escapeHtml(c.titulo)}</div>` +
        c.itens.map(([e, n]) => botaoEmojiHtml(e, n)).join('')
      ).join('');
      barraCats.innerHTML = secoes.map((c) =>
        `<button type="button" class="equipes__emoji-categoria" data-cat="${c.id}" title="${escapeHtml(c.titulo)}" aria-label="${escapeHtml(c.titulo)}">${c.icone}</button>`
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
        b.classList.toggle('equipes__emoji-categoria--ativa', b.getAttribute('data-cat') === ativa);
      });
    }

    function renderizarBusca(termo) {
      barraCats.hidden = true;
      tomWrap.hidden = false;
      grade.className = 'equipes__emoji-grade';
      const achados = [];
      EMOJI_CATEGORIAS.forEach((c) => c.itens.forEach((item) => {
        if (semAcento(item[1]).includes(termo)) achados.push(item);
      }));
      grade.innerHTML = achados.length
        ? `<div class="equipes__emoji-grade-titulo">Resultados</div>` + achados.map(([e, n]) => botaoEmojiHtml(e, n)).join('')
        : '<div class="equipes__emoji-grade-vazio">Nenhum emoji encontrado.</div>';
      grade.scrollTop = 0;
    }

    function selecionarAbaEmoji(aba) {
      abaEmoji = aba;
      emojiPopover.querySelectorAll('[data-emoji-aba]').forEach((b) => {
        const on = b.getAttribute('data-emoji-aba') === aba;
        b.classList.toggle('equipes__emoji-aba--ativa', on);
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
        b.classList.toggle('equipes__emoji-aba--ativa', on);
      });
      renderizarBusca(termo);
    });
    emojiBusca.addEventListener('click', (e) => e.stopPropagation());

    btnEmoji.addEventListener('click', (e) => {
      e.stopPropagation();
      fecharPopoversComposer(emojiPopover);
      const vaiAbrir = emojiPopover.hidden;
      emojiPopover.hidden = !vaiAbrir;
      btnEmoji.classList.toggle('equipes__composer-btn--ativo', vaiAbrir);
      if (vaiAbrir) abrirEmojiPicker();
    });

    document.addEventListener('click', () => {
      emojiPopover.hidden = true;
      btnEmoji.classList.remove('equipes__composer-btn--ativo');
      $('equipesMencaoPopover').hidden = true;
      $('equipesComandoPopover').hidden = true;
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      enviarMensagem();
    });

    $('equipesIrFim').addEventListener('click', () => {
      messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
    });
    messagesEl.addEventListener('scroll', () => {
      irFimBtn.hidden = estaPertoDoFim();
    });
  }

  function fecharPopoversComposer(excetoEste) {
    const emoji = $('equipesEmojiPopover');
    if (emoji !== excetoEste) emoji.hidden = true;
    if (emoji !== excetoEste) $('equipesBtnEmoji').classList.remove('equipes__composer-btn--ativo');
  }

  // ------------------------------------------------------------------
  // Editor com formatação visual (estilo Microsoft Teams)
  // O <textarea> continua sendo a "fonte da verdade" (envio, menção, retry
  // e comandos seguem iguais). Quando o editor está aberto, ele escreve no
  // textarea uma versão em marcadores (**negrito**, *itálico*, __sublinhado__,
  // ~~tachado~~, `código`, [texto](link)) que formatarConteudo() já renderiza.
  // ------------------------------------------------------------------
  let editorApi = null;

  function iniciarEditorFormatacao(campo, form) {
    const editor = $('equipesEditor');
    const barra = $('equipesFormatacao');
    const btnA = $('equipesBtnFormatar');
    let ativo = false;
    let ultimaSelecao = null;

    // Diálogo "Inserir link"
    const dlg = $('equipesLinkDialogo');
    const dlgTexto = $('equipesLinkTexto');
    const dlgEnd = $('equipesLinkEndereco');
    const dlgErro = $('equipesLinkErro');
    const dlgInserir = $('equipesLinkInserir');
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
        b.classList.toggle('equipes__formatacao-ativo', !!on);
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
      form.classList.add('equipes__composer--expandido');
      barra.hidden = false;
      campo.hidden = true;
      editor.hidden = false;
      btnA.classList.add('equipes__composer-btn--ativo');
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
      form.classList.remove('equipes__composer--expandido');
      barra.hidden = true;
      editor.hidden = true;
      campo.hidden = false;
      btnA.classList.remove('equipes__composer-btn--ativo');
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
      if (btnLink) { btnLink.classList.add('equipes__formatacao-ativo'); btnLink.setAttribute('aria-expanded', 'true'); }
      setTimeout(() => (texto ? dlgEnd : dlgTexto).focus(), 0);
    }

    function fecharDialogoLink(devolverFoco) {
      if (dlg.hidden) return;
      dlg.hidden = true;
      linkEmEdicao = null;
      if (btnLink) { btnLink.classList.remove('equipes__formatacao-ativo'); btnLink.setAttribute('aria-expanded', 'false'); }
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
    $('equipesLinkCancelar').addEventListener('click', () => fecharDialogoLink(true));
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
    $('equipesFormatacaoDescartar').addEventListener('click', descartar);

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
        $('equipesMencaoPopover').hidden = true;
        $('equipesComandoPopover').hidden = true;
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

  function tratarMencaoEComando() {
    const campo = $('equipesCampoTexto');
    const valor = campo.value;
    const posCursor = campo.selectionStart;
    const antesDoCursor = valor.slice(0, posCursor);

    const comandoMatch = /^\/(\w*)$/.exec(antesDoCursor);
    const mencaoMatch = /(?:^|\s)@([\p{L}0-9_]{0,40})$/u.exec(antesDoCursor);

    $('equipesComandoPopover').hidden = !comandoMatch;
    if (mencaoMatch && dadosCanal) {
      const termo = mencaoMatch[1].toLowerCase();
      const candidatos = dadosCanal.membros.filter((m) => m.nome.toLowerCase().includes(termo)).slice(0, 6);
      const pop = $('equipesMencaoPopover');
      if (candidatos.length) {
        pop.innerHTML = candidatos.map((m) => `<button type="button" class="equipes__popover-item" data-nome="${escapeHtml(m.nome)}">${escapeHtml(m.nome)}</button>`).join('');
        pop.querySelectorAll('button').forEach((b) => {
          b.addEventListener('click', () => {
            const nome = b.getAttribute('data-nome');
            const antes = valor.slice(0, posCursor).replace(/@([\p{L}0-9_]{0,40})$/u, '@' + nome.replace(/\s+/g, '') + ' ');
            campo.value = antes + valor.slice(posCursor);
            pop.hidden = true;
            if (editorApi && editorApi.ativo()) { editorApi.sincronizar(); $('equipesEditor').focus(); }
            else campo.focus();
          });
        });
        pop.hidden = false;
      } else {
        pop.hidden = true;
      }
    } else {
      $('equipesMencaoPopover').hidden = true;
    }
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-comando]')) {
      const comando = e.target.getAttribute('data-comando');
      const campo = $('equipesCampoTexto');
      if (comando === 'arquivo') {
        campo.value = campo.value.replace(/\/\w*$/, '');
        togglePainel(true);
        $('equipesFixadosLista').hidden = false;
      } else {
        campo.value = campo.value.replace(/\/\w*$/, '/agendar ');
      }
      $('equipesComandoPopover').hidden = true;
      if (editorApi && editorApi.ativo()) { editorApi.sincronizar(); $('equipesEditor').focus(); }
      else campo.focus();
    }
  });

  function dispararDigitando() {
    if (digitandoTimerEnvio) return;
    enviarPingDigitando();
    digitandoTimerEnvio = setTimeout(() => { digitandoTimerEnvio = null; }, 3000);
  }

  function enviarPingDigitando() {
    fetch('api/equipes/digitando.php', {
      method: 'POST', headers: jsonHeaders(), credentials: 'same-origin',
      body: JSON.stringify({ slug: EQUIPE }),
    }).catch(() => {});
  }

  async function enviarMensagem() {
    const campo = $('equipesCampoTexto');
    const texto = campo.value.trim();
    if (!texto && !anexoSelecionado) return;

    const tempId = tempIdSeq--;
    const agora = new Date().toISOString();
    const eu = dadosCanal.eu;
    const respostaEnviada = respostaAtual;

    mensagensPorId.set(tempId, {
      id: tempId, usuario_id: eu.id, autor: eu.nome, inicial: eu.inicial, minha: true,
      conteudo: texto || (anexoSelecionado ? '📎 Enviando ' + anexoSelecionado.name + '…' : ''),
      apagada: false, editada: false, criada_em: agora,
      resposta_a: respostaEnviada ? { id: respostaEnviada.id, autor: respostaEnviada.autor, trecho: respostaEnviada.trecho } : null,
      anexos: [], reacoes: [], fixada: false, status: 'enviando',
    });
    renderizarLista();
    messagesEl.scrollTop = messagesEl.scrollHeight; // ao enviar, sempre desce até a própria mensagem

    const formData = new FormData();
    formData.append('slug', EQUIPE);
    formData.append('conteudo', texto);
    if (respostaEnviada) formData.append('resposta_a', String(respostaEnviada.id));
    if (anexoSelecionado) formData.append('anexo', anexoSelecionado);

    campo.value = '';
    campo.style.height = 'auto';
    if (editorApi) editorApi.limpar();
    $('equipesBtnEnviar').disabled = true;
    anexoSelecionado = null;
    $('equipesInputArquivo').value = '';
    $('equipesAnexoPreview').hidden = true;
    respostaAtual = null;
    $('equipesRespostaPreview').hidden = true;

    try {
      const dados = await chamarApi('api/equipes/mensagens.php?slug=' + encodeURIComponent(EQUIPE), {
        method: 'POST', headers: { 'X-CSRF-Token': CSRF, Accept: 'application/json' }, body: formData,
      });
      mensagensPorId.delete(tempId);
      if (dados.mensagem) {
        mensagensPorId.set(dados.mensagem.id, dados.mensagem);
        if (dados.mensagem.id > ultimoIdVisto) ultimoIdVisto = dados.mensagem.id;
      }
      renderizarLista();
    } catch (e) {
      const falha = mensagensPorId.get(tempId);
      if (falha) {
        falha.status = 'erro';
        falha.conteudo = texto || falha.conteudo;
      }
      renderizarLista();
      const el = listaEl.querySelector(`[data-msg-id="${tempId}"] .equipes__bolha`);
      if (el) {
        el.classList.add('equipes__bolha--erro');
        el.insertAdjacentHTML('beforeend', `<div style="margin-top:6px"><button type="button" class="equipes__resposta-fechar" style="color:var(--eq-erro);font-size:12px;font-weight:700" data-tentar-novamente>⚠ Falha no envio — Tentar novamente</button></div>`);
        el.querySelector('[data-tentar-novamente]')?.addEventListener('click', () => {
          mensagensPorId.delete(tempId);
          campo.value = texto;
          anexoSelecionado = null;
          renderizarLista();
          campo.dispatchEvent(new Event('input'));
          enviarMensagem();
        });
      }
      mostrarToast(e.message || 'Não foi possível enviar a mensagem.', true);
    }
  }

  // Resumo de uma chamada feita a partir daqui: aparece sobre a própria tela da Equipe
  // (mesma chave de sessionStorage e mesmo visual do Chat).
  (function mostrarResumoChamada() {
    let r = null;
    try { r = JSON.parse(sessionStorage.getItem('equipesResumoChamada') || 'null'); sessionStorage.removeItem('equipesResumoChamada'); } catch (e) { r = null; }
    const modal = $('equipesPos');
    if (!r || !modal) return;
    const aviso = r.tipo === 'aviso';
    $('equipesPosTitulo').textContent = aviso ? r.titulo : 'Chamada encerrada';
    $('equipesPosTexto').hidden = !aviso;
    $('equipesPosTexto').textContent = aviso ? r.texto : '';
    $('equipesPosResumo').hidden = aviso;
    if (!aviso) { $('equipesPosDuracao').textContent = r.duracao || '00:00'; $('equipesPosPartes').textContent = r.partes || 'Você'; }
    $('equipesPosIcone').className = 'equipes__pos-icone' + (aviso ? ' equipes__pos-icone--aviso' : '');
    $('equipesPosIcone').innerHTML = aviso
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5M12 16.5v.01"/><circle cx="12" cy="12" r="9"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    modal.hidden = false;
    const fechar = () => { modal.hidden = true; };
    $('equipesPosFechar').addEventListener('click', fechar);
    modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
    $('equipesPosFechar').focus();
  })();

  iniciar();

  // ---------- Menu lateral: botão "Recolher" (mesmo comportamento das demais páginas) ----------
  const btnRecolherMenu = document.getElementById('btnRecolher');
  if (btnRecolherMenu) btnRecolherMenu.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
})();
