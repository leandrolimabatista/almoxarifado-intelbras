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
    document.title = equipe.nome + ' · Equipes · Intelbras';

    const btnFav = $('equipesBtnFavorito');
    btnFav.setAttribute('aria-pressed', String(equipe.favorita));

    $('equipesMembrosCount').textContent = String(dados.membros_total);

    if (equipe.somente_leitura && !dados.eh_admin) {
      $('equipesSomenteLeitura').hidden = false;
      $('equipesComposer').hidden = true;
    }
  }

  function renderizarPainel(dados) {
    $('equipesSobreDescricao').textContent = dados.equipe.descricao || 'Sem descrição para este canal.';
    $('equipesPainelMembrosTotal').textContent = String(dados.membros_total);

    renderizarFixados(dados.arquivos_fixados);

    const listaMembros = $('equipesMembrosLista');
    const amostra = dados.membros.slice(0, 5);
    listaMembros.innerHTML = amostra.map(membroHtml).join('') || '<p style="font-size:12.5px;color:var(--eq-cinza)">Ainda não há outros membros nesta equipe.</p>';

    const maisBtn = $('equipesMaisMembros');
    const resto = dados.membros_total - amostra.length;
    if (resto > 0) {
      maisBtn.hidden = false;
      maisBtn.textContent = '+ ' + resto + ' membro' + (resto > 1 ? 's' : '');
    } else {
      maisBtn.hidden = true;
    }

    const listaLinks = $('equipesLinksLista');
    listaLinks.innerHTML = dados.links.map((l) => {
      const conteudo = `<span class="equipes__link-icone">${ICONE_LINK[l.icone] || '📄'}</span><span>${escapeHtml(l.rotulo)}</span><span aria-hidden="true">›</span>`;
      return l.url
        ? `<a class="equipes__link-item" href="${escapeHtml(l.url)}">${conteudo}</a>`
        : `<span class="equipes__link-item" style="cursor:default;opacity:.7">${conteudo}</span>`;
    }).join('');
  }

  function membroHtml(m) {
    const rotulos = { online: 'Online', reuniao: 'Em reunião', ausente: 'Ausente', offline: 'Offline' };
    return `
      <div class="equipes__membro">
        <span class="equipes__membro-avatar-wrap">
          <span class="equipes__membro-avatar">${escapeHtml(m.inicial)}</span>
          <span class="equipes__membro-presenca equipes__membro-presenca--${m.presenca}" title="${rotulos[m.presenca]}"></span>
        </span>
        <span class="equipes__membro-info">
          <span class="equipes__membro-nome">${escapeHtml(m.nome)}</span>
          <span class="equipes__membro-status">${rotulos[m.presenca]}</span>
        </span>
      </div>`;
  }

  function renderizarFixados(lista) {
    $('equipesFixadosCount').textContent = String(lista.length);
    const el = $('equipesFixadosLista');
    el.innerHTML = lista.map((f) => `
      <a class="equipes__fixado-item" href="api/equipes/arquivo.php?id=${f.anexo_id}" target="_blank" rel="noopener">
        <span style="width:22px;height:22px;border-radius:5px;background:${CORES_ARQUIVO[f.extensao] || '#6B7280'};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0">${ROTULO_ARQUIVO[f.extensao] || f.extensao.toUpperCase()}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(f.nome)}</span>
      </a>`).join('');
  }

  function iniciarInteracoesCabecalho() {
    $('equipesBtnFavorito').addEventListener('click', () => {
      const btn = $('equipesBtnFavorito');
      const novo = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(novo));
      // Preferência é só de UI por enquanto (sem endpoint dedicado ainda).
    });

    $('equipesBtnMembros').addEventListener('click', () => togglePainel());
    $('equipesPainelFechar').addEventListener('click', () => togglePainel(false));
    $('equipesVerTodosMembros').addEventListener('click', () => togglePainel(true));
    $('equipesMaisMembros').addEventListener('click', () => togglePainel(true));

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
    $('equipesMenuSilenciar').addEventListener('click', () => {
      menuMais.hidden = true;
      mostrarToast('Canal silenciado.');
    });

    $('equipesBtnVideo').addEventListener('click', () => mostrarToast('Chamadas de vídeo chegam em breve.'));
    $('equipesBtnVoz').addEventListener('click', () => mostrarToast('Chamadas de voz chegam em breve.'));
    $('equipesBtnNovaAba').addEventListener('click', () => mostrarToast('Adicionar novas abas chega em breve.'));
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

  function renderizarLista() {
    const pertoDoFim = estaPertoDoFim();
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

    if (pertoDoFim || novasInseridas === false) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
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
      <div class="equipes__citacao"><span>Respondendo a <strong>${escapeHtml(m.resposta_a.autor)}</strong>: ${escapeHtml(m.resposta_a.trecho)}</span></div>` : '';

    const anexosHtml = (m.anexos || []).map((a) => {
      const ehImagem = ['png', 'jpg', 'jpeg', 'webp'].includes(a.extensao);
      const urlVer = 'api/equipes/arquivo.php?id=' + a.id + '&modo=ver';
      const urlBaixar = 'api/equipes/arquivo.php?id=' + a.id;
      if (ehImagem) {
        return `<div class="equipes__imagens-grade"><a href="${urlVer}" target="_blank" rel="noopener"><img src="${urlVer}" alt="${escapeHtml(a.nome)}" loading="lazy"></a></div>`;
      }
      const cor = CORES_ARQUIVO[a.extensao] || '#6B7280';
      const rotulo = ROTULO_ARQUIVO[a.extensao] || a.extensao.toUpperCase();
      return `<a class="equipes__anexo-card" href="${urlBaixar}">
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

    const statusHtml = m.status ? `<span class="equipes__status ${m.status === 'lida' ? 'equipes__status--lida' : ''}">${m.status === 'lida' ? '✔✔ Lida' : '✔ Enviada'}</span>` : '';
    const editadaHtml = m.editada ? '<span class="equipes__editada-rotulo">(editada)</span>' : '';
    const podeApagarOuEditar = m.minha;
    const podeFixar = (m.anexos || []).length > 0 && dadosCanal && dadosCanal.eh_admin;

    return `
      <div class="equipes__msg ${m.minha ? 'equipes__msg--minha' : ''}" data-msg-id="${m.id}">
        <div class="equipes__toolbar-wrap">
          <div class="equipes__toolbar">
            <button type="button" class="equipes__toolbar-btn" data-acao="reagir-abrir" title="Reagir">😊</button>
            <button type="button" class="equipes__toolbar-btn" data-acao="responder" title="Responder">↩</button>
            <button type="button" class="equipes__toolbar-btn" data-acao="encaminhar" title="Encaminhar">➦</button>
            ${podeFixar ? `<button type="button" class="equipes__toolbar-btn" data-acao="${m.fixada ? 'desfixar' : 'fixar'}" title="${m.fixada ? 'Desfixar' : 'Fixar'}">📌</button>` : ''}
            <button type="button" class="equipes__toolbar-btn" data-acao="mais-abrir" title="Mais">⋯</button>
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
      if (btnResponder) btnResponder.addEventListener('click', () => iniciarResposta(id));

      const btnEncaminhar = el.querySelector('[data-acao="encaminhar"]');
      if (btnEncaminhar) btnEncaminhar.addEventListener('click', () => mostrarToast('Encaminhar mensagens chega em breve.'));

      const btnFixar = el.querySelector('[data-acao="fixar"], [data-acao="desfixar"]');
      if (btnFixar) btnFixar.addEventListener('click', () => alternarFixado(id, btnFixar.getAttribute('data-acao') === 'fixar'));

      const btnMais = el.querySelector('[data-acao="mais-abrir"]');
      if (btnMais) btnMais.addEventListener('click', (e) => abrirMenuMais(e, id));
    });
  }

  function abrirPickerReacao(evento, id) {
    fecharPopoversFlutuantes();
    const wrap = evento.currentTarget.closest('.equipes__toolbar-wrap');
    const picker = document.createElement('div');
    picker.className = 'equipes__reacao-picker';
    picker.innerHTML = EMOJIS_RAPIDOS.map((e) => `<button type="button">${e}</button>`).join('');
    picker.querySelectorAll('button').forEach((b, i) => {
      b.addEventListener('click', (ev) => { ev.stopPropagation(); reagir(id, EMOJIS_RAPIDOS[i]); picker.remove(); });
    });
    wrap.appendChild(picker);
    setTimeout(() => document.addEventListener('click', function fechar() { picker.remove(); document.removeEventListener('click', fechar); }), 0);
    evento.stopPropagation();
  }

  function abrirMenuMais(evento, id) {
    fecharPopoversFlutuantes();
    const m = mensagensPorId.get(id);
    const wrap = evento.currentTarget.closest('.equipes__toolbar-wrap');
    const menu = document.createElement('div');
    menu.className = 'equipes__msg-menu';
    const itens = [];
    if (m.minha) itens.push('<button type="button" data-op="editar">Editar</button>');
    itens.push('<button type="button" data-op="copiar">Copiar texto</button>');
    if (m.minha) itens.push('<button type="button" data-op="apagar">Apagar</button>');
    menu.innerHTML = itens.map((i) => i.replace('<button', '<button class="equipes__menu-item" style="width:100%;text-align:left;border:none;background:none;cursor:pointer;padding:8px 10px;font-size:13px;border-radius:6px"')).join('');
    menu.querySelector('[data-op="editar"]')?.addEventListener('click', (ev) => { ev.stopPropagation(); menu.remove(); iniciarEdicao(id); });
    menu.querySelector('[data-op="copiar"]')?.addEventListener('click', (ev) => {
      ev.stopPropagation(); menu.remove();
      navigator.clipboard?.writeText(m.conteudo).then(() => mostrarToast('Texto copiado.'));
    });
    menu.querySelector('[data-op="apagar"]')?.addEventListener('click', (ev) => { ev.stopPropagation(); menu.remove(); apagarMensagem(id); });
    wrap.appendChild(menu);
    setTimeout(() => document.addEventListener('click', function fechar() { menu.remove(); document.removeEventListener('click', fechar); }), 0);
    evento.stopPropagation();
  }

  function fecharPopoversFlutuantes() {
    document.querySelectorAll('.equipes__reacao-picker, .equipes__msg-menu').forEach((el) => el.remove());
  }

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
    el.innerHTML = `
      <textarea class="equipes__campo" style="width:100%;border-radius:10px" rows="2">${escapeHtml(textoAtual)}</textarea>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button type="button" class="equipes__restrito-btn" data-op="salvar" style="padding:6px 14px;font-size:12px">Salvar</button>
        <button type="button" class="equipes__resposta-fechar" data-op="cancelar" style="font-size:13px">Cancelar</button>
      </div>`;
    const textarea = el.querySelector('textarea');
    textarea.focus();
    textarea.setSelectionRange(textoAtual.length, textoAtual.length);

    el.querySelector('[data-op="cancelar"]').addEventListener('click', () => renderizarLista());
    el.querySelector('[data-op="salvar"]').addEventListener('click', async () => {
      const novoTexto = textarea.value.trim();
      if (!novoTexto) return;
      try {
        const dados = await chamarApi('api/equipes/mensagem.php', {
          method: 'POST', headers: jsonHeaders(),
          body: JSON.stringify({ id, slug: EQUIPE, acao: 'editar', conteudo: novoTexto }),
        });
        if (dados.mensagem) mensagensPorId.set(id, dados.mensagem);
        renderizarLista();
      } catch (e) {
        mostrarToast(e.message, true);
      }
    });
  }

  async function apagarMensagem(id) {
    if (!window.confirm('Apagar esta mensagem para todos os membros da equipe?')) return;
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
      messagesEl.scrollTop = messagesEl.scrollHeight;
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

  iniciar();

  // ---------- Menu lateral: botão "Recolher" (mesmo comportamento das demais páginas) ----------
  const btnRecolherMenu = document.getElementById('btnRecolher');
  if (btnRecolherMenu) btnRecolherMenu.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
})();
