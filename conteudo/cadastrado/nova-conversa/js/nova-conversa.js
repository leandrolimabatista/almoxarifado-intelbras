// ============================================================
// CONTEÚDO — Nova conversa (área CADASTRADO)
//
// Carrega contatos e equipes de api/conversas/contatos.php, filtra
// e busca no navegador (sem round-trip por tecla), controla a seleção
// múltipla (contatos e equipes), monta o painel de pré-visualização e
// envia a seleção pra api/conversas/iniciar.php, navegando em seguida
// pra tela de chat.
// ============================================================
(function () {
  'use strict';

  const raiz = document.getElementById('ncRaiz');
  if (!raiz) return;
  const csrf = raiz.getAttribute('data-csrf') || '';

  // ---- Elementos ------------------------------------------------------
  const $lista        = document.getElementById('ncLista');
  const $buscaWrap     = document.getElementById('ncBusca');
  const $busca         = document.getElementById('ncBuscaInput');
  const $buscaLimpar   = document.getElementById('ncBuscaLimpar');
  const $filtros       = document.querySelectorAll('.nova-conversa__filtro');
  const $voltar        = document.getElementById('ncVoltar');

  const $vazio         = document.getElementById('ncVazio');
  const $selecao       = document.getElementById('ncSelecao');
  const $selecaoTitulo = document.getElementById('ncSelecaoTitulo');
  const $chips         = document.getElementById('ncChips');
  const $campoNome     = document.getElementById('ncCampoNome');
  const $nome          = document.getElementById('ncNome');
  const $nomeAjuda      = document.getElementById('ncNomeAjuda');
  const $contadorTexto = document.getElementById('ncContadorTexto');

  const $erro          = document.getElementById('ncErro');
  const $iniciar        = document.getElementById('ncIniciar');
  const $iniciarTexto   = document.getElementById('ncIniciarTexto');
  const $iniciarMobile      = document.getElementById('ncIniciarMobile');
  const $iniciarMobileTexto = document.getElementById('ncIniciarMobileTexto');
  const $status         = document.getElementById('ncStatus');

  const $modal          = document.getElementById('ncModal');
  const $modalCancelar   = document.getElementById('ncModalCancelar');
  const $modalConfirmar  = document.getElementById('ncModalConfirmar');

  const $btnRecolher     = document.getElementById('btnRecolher');

  // ---- Estado -----------------------------------------------------------
  let contatos = [];               // [{id, nome, cargo, cargo_nome, equipe_slug, equipe_nome, equipe_cor}]
  let equipes  = [];                // [{slug, nome, cor, membros}] — cor vem de tb_equipes (módulo Equipes)
  let filtroAtivo = 'todos';        // 'todos' | 'contatos' | 'equipes'
  let termoBusca = '';
  const selecionados = new Map();   // chave "c:<id>" | "e:<slug>" -> {tipo, id, nome, cor}

  // Cor do avatar: contato usa a cor real da equipe dele (tb_equipes) quando
  // tem uma; sem equipe, cai num tom estável calculado a partir do nome.
  const CORES = ['#00A335', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];
  function corHash(texto) {
    let h = 0;
    for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
    return CORES[h % CORES.length];
  }
  function corContato(c) {
    return c.equipe_cor || corHash(c.nome);
  }
  function corEquipe(e) {
    return e.cor || corHash(e.slug);
  }
  function iniciais(nome) {
    const partes = nome.trim().split(/\s+/);
    return ((partes[0]?.[0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function destacar(texto, termo) {
    const seguro = escapeHtml(texto);
    if (!termo) return seguro;
    const idx = texto.toLowerCase().indexOf(termo.toLowerCase());
    if (idx === -1) return seguro;
    const antes = escapeHtml(texto.slice(0, idx));
    const meio = escapeHtml(texto.slice(idx, idx + termo.length));
    const depois = escapeHtml(texto.slice(idx + termo.length));
    return `${antes}<mark>${meio}</mark>${depois}`;
  }
  const iconeGrupo = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="7" r="3" stroke="currentColor" stroke-width="2"/><path d="M2.5 19c.6-3.4 3-5.2 6.5-5.2s5.9 1.8 6.5 5.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="8" r="2.3" stroke="currentColor" stroke-width="2"/><path d="M15 13.3c2.3.3 3.9 1.9 4.4 4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const iconeCheck = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const iconeX = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function avatarHtml(cor, conteudoHtml) {
    return `<span class="nova-conversa__avatar" style="background:${cor}">${conteudoHtml}</span>`;
  }

  // ---- Busca: normaliza (remove acentos) pra comparar --------------------
  function normalizar(s) {
    return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function contatoCorresponde(c, termo) {
    if (!termo) return true;
    const alvo = normalizar([c.nome, c.cargo_nome, c.equipe_nome].filter(Boolean).join(' '));
    return alvo.includes(termo);
  }
  function equipeCorresponde(e, termo) {
    if (!termo) return true;
    return normalizar(e.nome).includes(termo);
  }

  // ---- Renderização da lista ---------------------------------------------
  function renderSkeleton() {
    $lista.setAttribute('aria-busy', 'true');
    $lista.innerHTML = Array.from({ length: 6 }).map(
      () => '<div class="nova-conversa__skeleton"><span></span><span></span></div>'
    ).join('');
  }

  function renderErroCarregamento() {
    $lista.setAttribute('aria-busy', 'false');
    $lista.innerHTML = `
      <div class="nova-conversa__lista-msg">
        <strong>Não foi possível carregar a lista</strong>
        Verifique sua conexão e tente novamente.
        <div><button type="button" id="ncTentarNovamente">Tentar novamente</button></div>
      </div>`;
    document.getElementById('ncTentarNovamente')?.addEventListener('click', carregar);
  }

  function linhaContatoHtml(c) {
    const chave = `c:${c.id}`;
    const marcado = selecionados.has(chave);
    const cor = corContato(c);
    const detalhe = [c.cargo_nome, c.equipe_nome].filter(Boolean).join(' · ');
    return `
      <button type="button" class="nova-conversa__linha${marcado ? ' nova-conversa__linha--selecionada' : ''}" data-chave="${chave}" role="checkbox" aria-checked="${marcado}">
        ${avatarHtml(cor, iniciais(c.nome))}
        <span class="nova-conversa__linha-texto">
          <p class="nova-conversa__linha-nome">${destacar(c.nome, termoBusca)}</p>
          ${detalhe ? `<p class="nova-conversa__linha-detalhe">${escapeHtml(detalhe)}</p>` : ''}
        </span>
        <span class="nova-conversa__checkbox">${iconeCheck}</span>
      </button>`;
  }

  function linhaEquipeHtml(e) {
    const chave = `e:${e.slug}`;
    const marcado = selecionados.has(chave);
    const cor = corEquipe(e);
    return `
      <button type="button" class="nova-conversa__linha${marcado ? ' nova-conversa__linha--selecionada' : ''}" data-chave="${chave}" role="checkbox" aria-checked="${marcado}" title="Sozinha, abre o canal da equipe. Combinada com contatos, cria um grupo com os ${e.membros} membros">
        ${avatarHtml(cor, iconeGrupo)}
        <span class="nova-conversa__linha-texto">
          <p class="nova-conversa__linha-nome">${destacar(e.nome, termoBusca)}</p>
          <p class="nova-conversa__linha-detalhe">${e.membros} membro${e.membros === 1 ? '' : 's'}</p>
        </span>
        <span class="nova-conversa__checkbox">${iconeCheck}</span>
      </button>`;
  }

  function renderLista() {
    const termo = normalizar(termoBusca);
    const mostrarContatos = filtroAtivo !== 'equipes';
    const mostrarEquipes  = filtroAtivo !== 'contatos';

    const contatosFiltrados = mostrarContatos ? contatos.filter((c) => contatoCorresponde(c, termo)) : [];
    const equipesFiltradas  = mostrarEquipes ? equipes.filter((e) => equipeCorresponde(e, termo)) : [];

    $lista.setAttribute('aria-busy', 'false');

    if (contatosFiltrados.length === 0 && equipesFiltradas.length === 0) {
      $lista.innerHTML = termoBusca
        ? `<div class="nova-conversa__lista-msg">
             <strong>Nenhum resultado para "${escapeHtml(termoBusca)}"</strong>
             Tente buscar por outro nome, equipe ou setor.
             <div><button type="button" id="ncLimparDaLista">Limpar busca</button></div>
           </div>`
        : `<div class="nova-conversa__lista-msg"><strong>Nada por aqui</strong>Não há itens para mostrar neste filtro.</div>`;
      document.getElementById('ncLimparDaLista')?.addEventListener('click', limparBusca);
      return;
    }

    let html = '';
    if (contatosFiltrados.length) {
      html += '<h2 class="nova-conversa__secao-titulo">Contatos</h2>';
      html += contatosFiltrados.map(linhaContatoHtml).join('');
    }
    if (contatosFiltrados.length && equipesFiltradas.length) {
      html += '<hr class="nova-conversa__divisor">';
    }
    if (equipesFiltradas.length) {
      html += '<h2 class="nova-conversa__secao-titulo">Equipes</h2>';
      html += equipesFiltradas.map(linhaEquipeHtml).join('');
    }
    $lista.innerHTML = html;
  }

  // ---- Seleção ------------------------------------------------------------
  function alternarSelecao(chave) {
    if (selecionados.has(chave)) {
      selecionados.delete(chave);
    } else {
      if (chave.startsWith('c:')) {
        const c = contatos.find((x) => `c:${x.id}` === chave);
        if (!c) return;
        selecionados.set(chave, { tipo: 'contato', id: c.id, nome: c.nome, cor: corContato(c) });
      } else {
        const slug = chave.slice(2);
        const e = equipes.find((x) => x.slug === slug);
        if (!e) return;
        selecionados.set(chave, { tipo: 'equipe', id: slug, nome: e.nome, cor: corEquipe(e), membros: e.membros });
      }
    }
    renderLista();
    renderPreview();
    $erro.hidden = true;
  }

  function removerSelecao(chave) {
    selecionados.delete(chave);
    renderLista();
    renderPreview();
  }

  // ---- Painel de pré-visualização -----------------------------------------
  function totalParticipantes() {
    let total = 0;
    selecionados.forEach((v) => { total += v.tipo === 'equipe' ? v.membros : 1; });
    return total;
  }

  // Seleção de UMA equipe só, sem nenhum contato: não cria conversa nenhuma —
  // abre direto o canal real da equipe (módulo Equipes).
  function selecaoEhCanalDeEquipe(itens) {
    return itens.length === 1 && itens[0].tipo === 'equipe';
  }

  function renderPreview() {
    const itens = Array.from(selecionados.values());
    const nenhum = itens.length === 0;

    $vazio.hidden = !nenhum;
    $selecao.hidden = nenhum;

    const total = totalParticipantes();
    const temEquipe = itens.some((i) => i.tipo === 'equipe');
    const soCanalEquipe = selecaoEhCanalDeEquipe(itens);

    if (!nenhum) {
      $selecaoTitulo.textContent = soCanalEquipe
        ? itens[0].nome
        : ((itens.length >= 2 || temEquipe) ? 'Novo grupo' : `Conversa com ${itens[0].nome}`);

      $chips.innerHTML = itens.map((i) => {
        const chave = i.tipo === 'equipe' ? `e:${i.id}` : `c:${i.id}`;
        const conteudo = i.tipo === 'equipe' ? iconeGrupo : iniciais(i.nome);
        return `
          <li class="nova-conversa__chip">
            <span class="nova-conversa__chip-avatar" style="background:${i.cor}">${conteudo}</span>
            <span class="nova-conversa__chip-nome">${escapeHtml(i.nome)}</span>
            <button type="button" class="nova-conversa__chip-remover" data-remover="${chave}" aria-label="Remover ${escapeHtml(i.nome)}">${iconeX}</button>
          </li>`;
      }).join('');

      const mostraCampoNome = !soCanalEquipe && (itens.length >= 2 || temEquipe);
      $campoNome.hidden = !mostraCampoNome;
      $nomeAjuda.hidden = true;
      $nome.disabled = false;
      $nome.placeholder = 'Ex.: Projeto Lançamento';

      $contadorTexto.textContent = soCanalEquipe
        ? `${itens[0].membros} membro${itens[0].membros === 1 ? '' : 's'} no canal`
        : `${total} participante${total === 1 ? '' : 's'}`;
    }

    const habilitado = !nenhum;
    const rotulo = soCanalEquipe ? 'Abrir canal da equipe' : `Iniciar conversa (${total})`;
    [$iniciar, $iniciarMobile].forEach(($b) => {
      if (!$b) return;
      $b.disabled = !habilitado;
    });
    $iniciarTexto.textContent = rotulo;
    if ($iniciarMobileTexto) $iniciarMobileTexto.textContent = rotulo;
  }

  // ---- Eventos: busca -------------------------------------------------------
  let debounceId = null;
  $busca.addEventListener('input', () => {
    termoBusca = $busca.value;
    $buscaLimpar.hidden = termoBusca.length === 0;
    clearTimeout(debounceId);
    debounceId = setTimeout(renderLista, 120);
  });
  function limparBusca() {
    termoBusca = '';
    $busca.value = '';
    $buscaLimpar.hidden = true;
    renderLista();
    $busca.focus();
  }
  $buscaLimpar.addEventListener('click', limparBusca);

  // ---- Eventos: filtros -------------------------------------------------------
  $filtros.forEach(($f) => {
    $f.addEventListener('click', () => {
      filtroAtivo = $f.dataset.filtro;
      $filtros.forEach((x) => {
        const ativo = x === $f;
        x.classList.toggle('nova-conversa__filtro--ativo', ativo);
        x.setAttribute('aria-checked', String(ativo));
      });
      renderLista();
    });
  });

  // ---- Eventos: seleção na lista (clique na linha inteira) -------------------
  $lista.addEventListener('click', (e) => {
    const linha = e.target.closest('[data-chave]');
    if (linha) alternarSelecao(linha.dataset.chave);
  });

  // ---- Eventos: remover chip -------------------------------------------------
  $chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remover]');
    if (btn) removerSelecao(btn.dataset.remover);
  });

  // ---- Voltar (com confirmação se houver seleção) -----------------------------
  function abrirModal() { $modal.hidden = false; $modalCancelar.focus(); }
  function fecharModal() { $modal.hidden = true; }

  $voltar.addEventListener('click', () => {
    if (selecionados.size > 0) {
      abrirModal();
    } else {
      window.location.href = 'index.php?pagina=inicio';
    }
  });
  $modalCancelar.addEventListener('click', fecharModal);
  $modalConfirmar.addEventListener('click', () => { window.location.href = 'index.php?pagina=inicio'; });
  $modal.addEventListener('click', (e) => { if (e.target === $modal) fecharModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$modal.hidden) fecharModal();
  });

  // ---- Iniciar conversa -------------------------------------------------------
  async function iniciarConversa() {
    if (selecionados.size === 0 || $iniciar.disabled) return;

    const itens = Array.from(selecionados.values());

    // Uma equipe só, sem contatos: não existe "conversa" aqui — abre direto
    // o canal real da equipe (módulo Equipes), sem round-trip pra API.
    if (selecaoEhCanalDeEquipe(itens)) {
      window.location.href = `index.php?pagina=equipes&equipe=${encodeURIComponent(itens[0].id)}`;
      return;
    }

    const usuarios = [];
    const equipesSel = [];
    selecionados.forEach((v) => {
      if (v.tipo === 'contato') usuarios.push(v.id);
      else equipesSel.push(v.id);
    });

    $erro.hidden = true;
    [$iniciar, $iniciarMobile].forEach(($b) => {
      if (!$b) return;
      $b.disabled = true;
      $b.classList.add('nova-conversa__iniciar--carregando');
    });
    $status.textContent = 'Iniciando conversa…';

    try {
      const resp = await fetch('api/conversas/iniciar.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ usuarios, equipes: equipesSel, nome: $nome.disabled ? '' : $nome.value.trim() }),
      });
      const dados = await resp.json().catch(() => null);

      if (!resp.ok || !dados || !dados.sucesso) {
        throw new Error((dados && dados.erro) || 'Não foi possível iniciar a conversa.');
      }

      $status.textContent = 'Conversa pronta, abrindo…';
      window.location.href = `index.php?pagina=chat&id=${encodeURIComponent(dados.conversa.id)}`;
    } catch (err) {
      $erro.textContent = err.message || 'Não foi possível iniciar a conversa. Tente novamente.';
      $erro.hidden = false;
      $status.textContent = '';
      [$iniciar, $iniciarMobile].forEach(($b) => {
        if (!$b) return;
        $b.disabled = false;
        $b.classList.remove('nova-conversa__iniciar--carregando');
      });
    }
  }
  $iniciar.addEventListener('click', iniciarConversa);
  $iniciarMobile?.addEventListener('click', iniciarConversa);

  // ---- Teclado: Enter no campo de busca ou de nome não deve submeter nada ------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement === $iniciar) iniciarConversa();
  });

  // ---- Sidebar: "Recolher" (mesmo comportamento das demais páginas) -----------
  function fecharMenu() { document.body.classList.remove('sidebar-open'); }
  if ($btnRecolher) $btnRecolher.addEventListener('click', fecharMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $modal.hidden) fecharMenu();
  });

  // ---- Carregamento inicial -----------------------------------------------------
  async function carregar() {
    renderSkeleton();
    try {
      const resp = await fetch('api/conversas/contatos.php', { headers: { Accept: 'application/json' } });
      const dados = await resp.json().catch(() => null);
      if (!resp.ok || !dados || !dados.sucesso) throw new Error('Falha ao carregar.');

      contatos = dados.contatos || [];
      equipes  = (dados.equipes || []).filter((e) => e.membros > 0);
      renderLista();
      renderPreview();
    } catch (err) {
      renderErroCarregamento();
    }
  }

  carregar();
})();
