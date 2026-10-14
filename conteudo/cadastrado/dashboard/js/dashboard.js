/**
 * Módulo "Dashboard" (admin — Administrador Intelbras, id 1).
 * Antigo módulo "Usuários": navegação entre as 3 telas (Painel /
 * Gerenciar [Solicitações|Cadastrados|Compras] / Editar usuário), tabelas e
 * formulário de edição. Chama os endpoints em api/dashboard/*.php, o
 * monitoramento de compras em api/dashboard/compras.php e a exclusão de
 * usuário (banco + arquivos) em api/dashboard/excluir_usuario.php.
 */
(function () {
  const raiz = document.getElementById('usuariosRaiz');
  if (!raiz) return; // não-admin: só o placeholder "Acesso restrito" é exibido

  const csrf = raiz.getAttribute('data-csrf') || '';

  const EQUIPES = {
    geral: 'Geral', projetos: 'Projetos', marketing: 'Marketing',
    rh: 'RH', financeiro: 'Financeiro', ti: 'TI', sac: 'SAC / Ouvidoria',
  };

  const views = {
    painel: document.getElementById('viewPainel'),
    gerenciar: document.getElementById('viewGerenciar'),
    editar: document.getElementById('viewEditar'),
  };

  let abaAtual = 'solicitacoes';
  let unidadesCarregadas = false;


  // ------------------------------------------------------------
  // Popout de confirmação (substitui o confirm() nativo)
  // ------------------------------------------------------------
  const dlgConf = document.getElementById('dlgConfirmar');
  const ICONES_CONF = {
    excluir: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 001 .9h8a1 1 0 001-.9L18 7M9 7V4.5A.5.5 0 019.5 4h5a.5.5 0 01.5.5V7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    aceitar: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    recusar: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };

  /**
   * Abre o popout e resolve true (confirmou) ou false (cancelou / Esc / clique fora).
   * cfg: { titulo, texto, aviso?, botao?, icone?: 'excluir'|'aceitar'|'recusar', tipo?: 'perigo'|'sucesso' }
   */
  function confirmar(cfg) {
    if (!dlgConf || typeof dlgConf.showModal !== 'function') {
      return window.IBDialogo ? window.IBDialogo.confirmar({ titulo: cfg.titulo, texto: [cfg.texto, cfg.aviso].filter(Boolean).join('\n\n'), perigo: true }) : Promise.resolve(window.confirm([cfg.titulo, cfg.texto, cfg.aviso].filter(Boolean).join('\n\n')));
    }
    const perigo = (cfg.tipo || 'perigo') === 'perigo';
    const btnOk = document.getElementById('dlgConfirmarOk');
    const btnCancelar = document.getElementById('dlgConfirmarCancelar');
    const aviso = document.getElementById('dlgConfirmarAviso');
    const icone = document.getElementById('dlgConfirmarIcone');

    document.getElementById('dlgConfirmarTitulo').textContent = cfg.titulo;
    const textoEl = document.getElementById('dlgConfirmarTexto');
    textoEl.textContent = cfg.texto || '';
    textoEl.hidden = !cfg.texto;
    aviso.textContent = cfg.aviso || '';
    aviso.hidden = !cfg.aviso;
    icone.innerHTML = ICONES_CONF[cfg.icone] || ICONES_CONF.recusar;
    icone.className = 'usuarios__dialogo-icone' + (perigo ? '' : ' usuarios__dialogo-icone--sucesso');
    btnOk.textContent = cfg.botao || 'Confirmar';
    btnOk.className = perigo ? 'usuarios__btn-perigo' : 'usuarios__btn-primario';
    btnOk.setAttribute('data-mv', perigo ? 'btn danger' : 'btn primary'); // movimento.js classifica só 1x; sem isso o "Excluir" herdava o hover verde

    return new Promise((resolve) => {
      dlgConf.returnValue = '';
      const aoFechar = () => {
        dlgConf.removeEventListener('close', aoFechar);
        dlgConf.removeEventListener('click', aoClicarFora);
        resolve(dlgConf.returnValue === 'ok');
      };
      const aoClicarFora = (e) => { if (e.target === dlgConf) dlgConf.close('cancel'); };
      dlgConf.addEventListener('close', aoFechar);
      dlgConf.addEventListener('click', aoClicarFora);
      btnOk.onclick = () => dlgConf.close('ok');
      btnCancelar.onclick = () => dlgConf.close('cancel');
      dlgConf.showModal();
      btnCancelar.focus(); // foco no "Cancelar": ação destrutiva nunca é a padrão
    });
  }

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------
  function escapeHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  }

  function iniciais(nome) {
    const partes = String(nome || '').trim().split(/\s+/);
    if (!partes[0]) return '?';
    return (partes[0][0] + (partes[1] ? partes[1][0] : '')).toUpperCase();
  }

  function formatarTelefone(digitos) {
    const d = String(digitos || '').replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return d;
  }

  function formatarCpf(digitos) {
    const d = String(digitos || '').replace(/\D/g, '');
    if (d.length !== 11) return d;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  function dataSqlParaBr(sql) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(sql || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }

  function dataParaExibicao(sql) {
    if (!sql) return '—';
    const [dataParte, horaParte] = String(sql).replace('T', ' ').split(/[ ]/);
    const br = dataSqlParaBr(dataParte);
    return horaParte ? `${br} às ${horaParte.slice(0, 5)}` : br;
  }

  function statusLabel(status) {
    const mapa = {
      ativo: 'Ativo', inativo: 'Inativo', pendente: 'Pendente', aceita: 'Aceita', recusada: 'Recusada',
      aguardando_pagamento: 'Aguardando pagamento', pago: 'Pago', enviado: 'Enviado', entregue: 'Entregue',
      cancelado: 'Cancelado', recusado: 'Recusado', reembolsado: 'Reembolsado',
    };
    return mapa[status] || status;
  }

  async function chamar(url, opcoes) {
    const resposta = await fetch(url, opcoes);
    const dados = await resposta.json().catch(() => ({}));
    return { status: resposta.status, dados };
  }

  function api(caminho, metodo, corpo) {
    const opcoes = { method: metodo || 'GET', headers: {} };
    if (metodo === 'POST') {
      opcoes.headers['Content-Type'] = 'application/json';
      opcoes.headers['X-CSRF-Token'] = csrf;
      opcoes.body = JSON.stringify(corpo || {});
    }
    // tudo vive em api/dashboard/ (aceita "dashboard/xxx.php" ou só "xxx.php")
    return chamar('api/dashboard/' + caminho.replace(/^dashboard\//, ''), opcoes);
  }

  // ------------------------------------------------------------
  // Selects personalizados — mesmo visual do menu suspenso de Documentos.
  // O <select> nativo continua no DOM (escondido) e segue sendo a fonte
  // do valor: .value, "change", reset() e required funcionam como antes.
  // ------------------------------------------------------------
  const ICONES_SELETOR = {
    usuario: '<circle cx="12" cy="8.5" r="3.4"/><path d="M5 19.5c.6-3.4 3.3-5.3 7-5.3s6.4 1.9 7 5.3"/>',
    equipe: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17" cy="9.5" r="2.4"/><path d="M16.6 14.2c2.5-.2 4.4 1.5 4.4 4.3"/>',
    solicitacao: '<path d="M3.5 13l2.3-6.6A2 2 0 0 1 7.7 5h8.6a2 2 0 0 1 1.9 1.4L20.5 13"/><path d="M3.5 13v4.5a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V13h-5l-1 2h-5l-1-2h-5z"/>',
    seta: '<path d="M6 9l6 6 6-6"/>',
    marca: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  };

  function criarEl(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function svgSeletor(nome, classe) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', classe);
    svg.innerHTML = ICONES_SELETOR[nome] || '';
    return svg;
  }

  const menuSeletor = criarEl('div', 'usuarios__menu');
  menuSeletor.setAttribute('role', 'listbox');
  menuSeletor.hidden = true;
  document.body.appendChild(menuSeletor);

  let menuAberto = null; // { select, botao, aberto }

  function abrirMenuSeletor(select, botao) {
    fecharMenuSeletor(false);
    menuSeletor.textContent = '';

    Array.from(select.options).forEach((opcao) => {
      const item = criarEl('button', 'usuarios__menu-item');
      item.type = 'button';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(opcao.selected));
      item.dataset.valor = opcao.value;

      if (opcao.dataset.cor) {
        const ponto = criarEl('span', 'usuarios__menu-ponto');
        ponto.style.setProperty('--eq', opcao.dataset.cor);
        item.appendChild(ponto);
      }
      item.appendChild(criarEl('span', 'usuarios__menu-texto', opcao.textContent.trim()));
      if (opcao.selected) item.appendChild(svgSeletor('marca', 'usuarios__menu-marca'));

      item.addEventListener('click', () => escolherNoSeletor(select, opcao.value));
      menuSeletor.appendChild(item);
    });

    const r = botao.getBoundingClientRect();
    menuSeletor.style.minWidth = Math.round(r.width) + 'px';
    menuSeletor.style.visibility = 'hidden';
    menuSeletor.hidden = false;

    const w = menuSeletor.offsetWidth;
    const h = menuSeletor.offsetHeight;
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = r.right - w;
    left = Math.max(8, left);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    menuSeletor.style.left = left + 'px';
    menuSeletor.style.top = top + 'px';
    menuSeletor.style.visibility = '';

    botao.setAttribute('aria-expanded', 'true');
    menuAberto = { select, botao, aberto: Date.now() };

    const foco = menuSeletor.querySelector('[aria-selected="true"]') || menuSeletor.querySelector('.usuarios__menu-item');
    if (foco) foco.focus();
  }

  function fecharMenuSeletor(devolverFoco) {
    if (!menuAberto) return;
    const botao = menuAberto.botao;
    menuAberto = null;
    menuSeletor.hidden = true;
    menuSeletor.textContent = '';
    botao.setAttribute('aria-expanded', 'false');
    if (devolverFoco && document.body.contains(botao)) botao.focus();
  }

  function escolherNoSeletor(select, valor) {
    const mudou = select.value !== valor;
    select.value = valor; // setter interceptado: atualiza o botão
    fecharMenuSeletor(true);
    // O navegador só dispara "change" em ação do usuário; como o valor foi
    // definido por código, avisamos os ouvintes existentes manualmente.
    if (mudou) select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Esc (fase de captura, pra vencer o "Esc recolhe a sidebar"), clique fora, rolagem
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuAberto) {
      e.stopPropagation();
      fecharMenuSeletor(true);
    }
  }, true);

  document.addEventListener('pointerdown', (e) => {
    if (!menuAberto) return;
    if (menuSeletor.contains(e.target) || menuAberto.botao.contains(e.target)) return;
    fecharMenuSeletor(false);
  });

  // Rolagem da página fecha o menu (ignora a rolagem "de chegada" logo após abrir)
  window.addEventListener('scroll', (e) => {
    if (!menuAberto || menuSeletor.contains(e.target)) return;
    if (Date.now() - menuAberto.aberto < 250) return;
    fecharMenuSeletor(false);
  }, true);

  window.addEventListener('resize', () => fecharMenuSeletor(false));

  menuSeletor.addEventListener('keydown', (e) => {
    const itens = Array.from(menuSeletor.querySelectorAll('.usuarios__menu-item'));
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
      fecharMenuSeletor(false);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Digitar a inicial salta para a próxima opção que começa com ela (como no select nativo)
      const letra = e.key.toLowerCase();
      const ordem = itens.slice(i + 1).concat(itens.slice(0, i + 1));
      const achado = ordem.find((it) => it.textContent.trim().toLowerCase().startsWith(letra));
      if (achado) achado.focus();
    }
  });

  const valorNativo = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');

  function aprimorarSelect(select) {
    const ehFiltro = select.classList.contains('usuarios__filtro');

    const envoltorio = criarEl('span', 'usuarios__seletor ' + (ehFiltro ? 'usuarios__seletor--filtro' : 'usuarios__seletor--campo'));
    const botao = criarEl('button', 'usuarios__seletor-botao');
    botao.type = 'button';
    botao.setAttribute('aria-haspopup', 'listbox');
    botao.setAttribute('aria-expanded', 'false');

    let icone = null;
    if (ehFiltro && select.dataset.icone) {
      icone = svgSeletor(select.dataset.icone, 'usuarios__seletor-icone');
      botao.appendChild(icone);
    }
    const ponto = criarEl('span', 'usuarios__menu-ponto');
    ponto.hidden = true;
    botao.appendChild(ponto);
    const texto = criarEl('span', 'usuarios__seletor-texto');
    botao.appendChild(texto);
    botao.appendChild(svgSeletor('seta', 'usuarios__seletor-seta'));

    // Nome acessível: o rótulo do campo (form) ou o aria-label do filtro
    const rotulo = select.id ? document.querySelector('label[for="' + select.id + '"]') : null;
    if (rotulo) {
      if (!rotulo.id) rotulo.id = 'rotulo-' + select.id;
      texto.id = 'valor-' + select.id;
      botao.setAttribute('aria-labelledby', rotulo.id + ' ' + texto.id);
    } else if (select.getAttribute('aria-label')) {
      botao.setAttribute('aria-label', select.getAttribute('aria-label'));
    }

    select.parentNode.insertBefore(envoltorio, select);
    envoltorio.appendChild(select);
    envoltorio.appendChild(botao);
    select.classList.add('usuarios__seletor-nativo');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    function atualizar() {
      const opcao = select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
      texto.textContent = opcao ? opcao.textContent.trim() : (select.dataset.placeholder || 'Selecione');
      botao.classList.toggle('usuarios__seletor-botao--vazio', !opcao);
      const cor = !ehFiltro && opcao ? opcao.dataset.cor : '';
      ponto.hidden = !cor;
      if (cor) ponto.style.setProperty('--eq', cor);
    }

    function espelharEstado() {
      envoltorio.classList.toggle('usuarios__seletor--invalido', select.classList.contains('is-invalid'));
      botao.disabled = select.disabled;
    }

    // Atribuições por código (select.value = ...) também atualizam o botão
    Object.defineProperty(select, 'value', {
      configurable: true,
      get() { return valorNativo.get.call(this); },
      set(v) { valorNativo.set.call(this, v); atualizar(); },
    });

    // Opções recriadas (innerHTML) e classe is-invalid / disabled
    new MutationObserver(atualizar).observe(select, { childList: true, subtree: true, characterData: true });
    new MutationObserver(espelharEstado).observe(select, { attributes: true, attributeFilter: ['class', 'disabled'] });
    if (select.form) select.form.addEventListener('reset', () => setTimeout(atualizar, 0));

    // Clicar no <label> ou focar o select por código leva o foco ao botão
    select.addEventListener('focus', () => botao.focus());

    botao.addEventListener('click', () => {
      if (menuAberto && menuAberto.botao === botao) fecharMenuSeletor(true);
      else abrirMenuSeletor(select, botao);
    });
    botao.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        abrirMenuSeletor(select, botao);
      }
    });

    atualizar();
    espelharEstado();
  }

  raiz.querySelectorAll('select').forEach(aprimorarSelect);

  // ------------------------------------------------------------
  // Navegação entre visões
  // ------------------------------------------------------------
  // Guarda a tela atual no endereço (#painel, #gerenciar/cadastrados, #editar/12)
  // para que atualizar a página (F5) volte exatamente para onde o usuário estava.
  function guardarEstado(nome, opcoes) {
    let hash = nome;
    if (nome === 'gerenciar') hash += '/' + ((opcoes && opcoes.aba) || 'solicitacoes');
    if (nome === 'editar' && opcoes && opcoes.id) hash += '/' + opcoes.id;
    try { history.replaceState(null, '', location.pathname + location.search + '#' + hash); } catch (e) { /* ignora */ }
  }

  function restaurarEstado() {
    const [nome, extra] = location.hash.replace(/^#/, '').split('/');
    if (nome === 'gerenciar' && ['solicitacoes', 'cadastrados', 'compras'].includes(extra)) {
      mostrarView('gerenciar', { aba: extra });
    } else if (nome === 'editar' && Number(extra) > 0) {
      mostrarView('editar', { id: Number(extra) });
    } else {
      mostrarView('painel');
    }
  }

  function mostrarView(nome, opcoes) {
    guardarEstado(nome, opcoes);
    Object.keys(views).forEach((chave) => {
      if (views[chave]) views[chave].hidden = chave !== nome;
    });

    if (nome === 'painel') {
      carregarResumo();
    } else if (nome === 'gerenciar') {
      mostrarAba((opcoes && opcoes.aba) || 'solicitacoes');
    } else if (nome === 'editar' && opcoes && opcoes.id) {
      carregarUsuarioParaEdicao(opcoes.id);
    }
  }

  raiz.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-ir-para]');
    if (!alvo) return;
    e.preventDefault();
    const destino = alvo.getAttribute('data-ir-para');
    if (destino === 'solicitacoes' || destino === 'cadastrados' || destino === 'compras') {
      mostrarView('gerenciar', { aba: destino });
    } else {
      mostrarView(destino);
    }
  });

  // ------------------------------------------------------------
  // Visão 1 — Painel
  // ------------------------------------------------------------
  async function carregarResumo() {
    const corpo = document.getElementById('corpoRecentes');
    corpo.innerHTML = '<tr class="usuarios__tabela-vazio"><td colspan="6">Carregando…</td></tr>';

    const { status, dados } = await api('resumo.php');
    if (status !== 200 || !dados.sucesso) {
      corpo.innerHTML = '<tr class="usuarios__tabela-vazio"><td colspan="6">Não foi possível carregar os usuários.</td></tr>';
      return;
    }

    carregarResumoCompras();
    document.getElementById('contagemPendentes').textContent = `${dados.pendentes} pendente${dados.pendentes === 1 ? '' : 's'}`;
    document.getElementById('contagemCadastrados').textContent = `${dados.cadastrados} usuário${dados.cadastrados === 1 ? '' : 's'} cadastrado${dados.cadastrados === 1 ? '' : 's'}`;

    if (!dados.recentes.length) {
      corpo.innerHTML = '<tr class="usuarios__tabela-vazio"><td colspan="6">Nenhum usuário cadastrado ainda.</td></tr>';
      return;
    }

    corpo.innerHTML = dados.recentes.map(linhaUsuarioRecente).join('');
  }

  // Tile "Monitoramento de Compras" (só a contagem; falha aqui não afeta o resto do painel)
  async function carregarResumoCompras() {
    const el = document.getElementById('contagemCompras');
    try {
      const { status, dados } = await api('dashboard/compras.php?offset=999999');
      if (status === 200 && dados.sucesso) {
        const n = dados.resumo.total_pedidos;
        el.textContent = `${n} pedido${n === 1 ? '' : 's'} · ${moeda(dados.resumo.receita)} confirmados`;
      } else {
        el.textContent = 'Indisponível';
      }
    } catch (e) {
      el.textContent = 'Indisponível';
    }
  }

  function linhaUsuarioRecente(u) {
    return `
      <tr>
        <td>
          <div class="usuarios__usuario-cel">
            <span class="usuarios__avatar">${escapeHtml(iniciais(u.nome))}</span>
            <span class="usuarios__nome-forte">${escapeHtml(u.nome)}</span>
          </div>
        </td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.equipe_nome || '—')}</td>
        <td>${escapeHtml(u.cargo_nome || '—')}</td>
        <td><span class="usuarios__status usuarios__status--${u.status}">${statusLabel(u.status)}</span></td>
        <td>
          <div class="usuarios__tabela-acoes">
            <button type="button" class="usuarios__btn-tabela usuarios__btn-tabela--editar" data-editar="${u.id}">Editar</button>
            ${botaoExcluirUsuario(u)}
          </div>
        </td>
      </tr>`;
  }

  // Botão "Excluir" das linhas de usuário (a conta do Administrador, id 1, nunca pode ser excluída)
  function botaoExcluirUsuario(u) {
    if (Number(u.id) === 1) return '';
    return `<button type="button" class="usuarios__btn-tabela usuarios__btn-tabela--recusar" data-excluir="${u.id}" data-nome="${escapeHtml(u.nome)}">Excluir</button>`;
  }

  // ------------------------------------------------------------
  // Visão 2 — Gerenciar (Solicitações / Cadastrados)
  // ------------------------------------------------------------
  document.querySelectorAll('.usuarios__tab').forEach((botao) => {
    botao.addEventListener('click', () => mostrarAba(botao.getAttribute('data-tab')));
  });

  function mostrarAba(aba) {
    abaAtual = aba;
    guardarEstado('gerenciar', { aba: aba });
    document.querySelectorAll('.usuarios__tab').forEach((b) => {
      b.classList.toggle('usuarios__tab--ativo', b.getAttribute('data-tab') === aba);
    });
    document.getElementById('subSolicitacoes').hidden = aba !== 'solicitacoes';
    document.getElementById('subCadastrados').hidden = aba !== 'cadastrados';
    document.getElementById('subCompras').hidden = aba !== 'compras';

    if (aba === 'solicitacoes') {
      carregarSolicitacoes();
    } else if (aba === 'compras') {
      carregarCompras(false);
    } else {
      carregarCadastrados();
    }
  }

  // --- Solicitações ---
  async function carregarSolicitacoes() {
    const corpo = document.getElementById('corpoSolicitacoes');
    corpo.innerHTML = '<tr class="usuarios__tabela-vazio"><td colspan="6">Carregando…</td></tr>';

    const status = document.getElementById('filtroSolicitacao').value || 'pendente';
    const busca = document.getElementById('buscaSolicitacao').value.trim().toLowerCase();

    const { status: codigo, dados } = await api('solicitacoes.php?status=' + encodeURIComponent(status));
    if (codigo !== 200 || !dados.sucesso) {
      corpo.innerHTML = '<tr class="usuarios__tabela-vazio"><td colspan="6">Não foi possível carregar as solicitações.</td></tr>';
      return;
    }

    let itens = dados.itens;
    if (busca) {
      itens = itens.filter((s) => s.nome.toLowerCase().includes(busca) || s.email.toLowerCase().includes(busca));
    }

    if (!itens.length) {
      corpo.innerHTML = '<tr class="usuarios__tabela-vazio"><td colspan="6">Nenhuma solicitação encontrada.</td></tr>';
      return;
    }

    corpo.innerHTML = itens.map(linhaSolicitacao).join('');
  }

  function linhaSolicitacao(s) {
    const acoes = s.status === 'pendente'
      ? `<button type="button" class="usuarios__btn-tabela usuarios__btn-tabela--aceitar" data-aceitar="${s.id}">Aceitar</button>
         <button type="button" class="usuarios__btn-tabela usuarios__btn-tabela--recusar" data-recusar="${s.id}">Recusar</button>`
      : '—';

    return `
      <tr>
        <td>
          <div class="usuarios__usuario-cel">
            <span class="usuarios__avatar">${escapeHtml(iniciais(s.nome))}</span>
            <span class="usuarios__nome-forte">${escapeHtml(s.nome)}</span>
          </div>
        </td>
        <td>${escapeHtml(s.email)}</td>
        <td>${escapeHtml(s.equipe_nome)}</td>
        <td>${escapeHtml(dataParaExibicao(s.solicitado_em))}</td>
        <td><span class="usuarios__status usuarios__status--${s.status}">${statusLabel(s.status)}</span></td>
        <td><div class="usuarios__tabela-acoes">${acoes}</div></td>
      </tr>`;
  }

  document.getElementById('corpoSolicitacoes').addEventListener('click', async (e) => {
    const btnAceitar = e.target.closest('[data-aceitar]');
    const btnRecusar = e.target.closest('[data-recusar]');
    const alvo = btnAceitar || btnRecusar;
    if (!alvo) return;

    const acao = btnAceitar ? 'aceitar' : 'recusar';
    const id = Number(alvo.getAttribute(btnAceitar ? 'data-aceitar' : 'data-recusar'));

    const confirmado = await confirmar(acao === 'aceitar'
      ? { titulo: 'Aceitar esta solicitação?', texto: 'A conta do usuário será criada.', botao: 'Aceitar', icone: 'aceitar', tipo: 'sucesso' }
      : { titulo: 'Recusar esta solicitação?', texto: 'O usuário não receberá acesso ao portal.', botao: 'Recusar', icone: 'recusar', tipo: 'perigo' });
    if (!confirmado) return;

    alvo.disabled = true;
    const { status, dados } = await api('solicitacoes.php', 'POST', { id, acao });
    alvo.disabled = false;

    if (status === 200 && dados.sucesso) {
      carregarSolicitacoes();
    } else {
      window.IBDialogo.avisar({ titulo: 'Não foi possível concluir', texto: dados.erro || 'Não foi possível concluir a ação.' });
    }
  });

  document.getElementById('filtroSolicitacao').addEventListener('change', carregarSolicitacoes);
  let timerBuscaSolicitacao;
  document.getElementById('buscaSolicitacao').addEventListener('input', () => {
    clearTimeout(timerBuscaSolicitacao);
    timerBuscaSolicitacao = setTimeout(carregarSolicitacoes, 250);
  });

  // --- Cadastrados ---
  async function carregarCadastrados() {
    const corpo = document.getElementById('corpoCadastrados');
    corpo.innerHTML = '<tr class="usuarios__tabela-vazio"><td colspan="7">Carregando…</td></tr>';

    const params = new URLSearchParams();
    const busca = document.getElementById('buscaCadastrado').value.trim();
    const equipe = document.getElementById('filtroEquipeCadastrado').value;
    if (busca) params.set('busca', busca);
    if (equipe) params.set('equipe', equipe);

    const { status, dados } = await api('cadastrados.php?' + params.toString());
    if (status !== 200 || !dados.sucesso) {
      corpo.innerHTML = '<tr class="usuarios__tabela-vazio"><td colspan="7">Não foi possível carregar os usuários.</td></tr>';
      return;
    }

    if (!dados.itens.length) {
      corpo.innerHTML = '<tr class="usuarios__tabela-vazio"><td colspan="7">Nenhum usuário encontrado.</td></tr>';
      return;
    }

    corpo.innerHTML = dados.itens.map(linhaCadastrado).join('');
  }

  function linhaCadastrado(u) {
    return `
      <tr>
        <td>
          <div class="usuarios__usuario-cel">
            <span class="usuarios__avatar">${escapeHtml(iniciais(u.nome))}</span>
            <span class="usuarios__nome-forte">${escapeHtml(u.nome)}</span>
          </div>
        </td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.equipe_nome || '—')}</td>
        <td>${escapeHtml(u.cargo_nome || '—')}</td>
        <td>${escapeHtml(u.unidade_nome || '—')}</td>
        <td><span class="usuarios__status usuarios__status--${u.status}">${statusLabel(u.status)}</span></td>
        <td>
          <div class="usuarios__tabela-acoes">
            <button type="button" class="usuarios__btn-tabela usuarios__btn-tabela--editar" data-editar="${u.id}">Editar</button>
            ${botaoExcluirUsuario(u)}
          </div>
        </td>
      </tr>`;
  }

  document.getElementById('filtroEquipeCadastrado').addEventListener('change', carregarCadastrados);
  let timerBuscaCadastrado;
  document.getElementById('buscaCadastrado').addEventListener('input', () => {
    clearTimeout(timerBuscaCadastrado);
    timerBuscaCadastrado = setTimeout(carregarCadastrados, 250);
  });

  // Delegação única pros botões "Editar" (tabela de recentes E de cadastrados)
  raiz.addEventListener('click', (e) => {
    const botao = e.target.closest('[data-editar]');
    if (!botao) return;
    mostrarView('editar', { id: Number(botao.getAttribute('data-editar')) });
  });

  // Excluir usuário (tabela de recentes E de cadastrados): apaga no banco e limpa os arquivos dele
  raiz.addEventListener('click', async (e) => {
    const botao = e.target.closest('[data-excluir]');
    if (!botao || botao.disabled) return;

    const id = Number(botao.getAttribute('data-excluir'));
    const nome = botao.getAttribute('data-nome') || 'este usuário';
    const confirmado = await confirmar({
      titulo: `Excluir ${nome} definitivamente?`,
      aviso: 'Essa ação não pode ser desfeita.',
      botao: 'Excluir',
      icone: 'excluir',
      tipo: 'perigo',
    });
    if (!confirmado) return;

    botao.disabled = true;
    const { status, dados } = await api('dashboard/excluir_usuario.php', 'POST', { id });
    botao.disabled = false;

    if (status === 200 && dados.sucesso) {
      if (!views.painel.hidden) carregarResumo();
      else if (abaAtual === 'cadastrados') carregarCadastrados();
    } else {
      window.IBDialogo.avisar({ titulo: 'Não foi possível excluir', texto: dados.erro || 'Não foi possível excluir o usuário.' });
    }
  });


  // ------------------------------------------------------------
  // Compras — monitoramento da Loja (api/dashboard/compras.php)
  // ------------------------------------------------------------
  let comprasCarregadas = 0;   // linhas já exibidas
  let comprasToken = 0;        // ignora respostas de consultas antigas

  function moeda(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function resumoItens(itens) {
    if (!itens.length) return '—';
    const primeiro = `${itens[0].quantidade}× ${itens[0].nome}`;
    return itens.length > 1 ? `${primeiro} <span class="usuarios__mais-itens">+${itens.length - 1} item${itens.length - 1 === 1 ? '' : 's'}</span>` : primeiro;
  }

  const ROTULO_PAGAMENTO = { pix: 'Pix', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', bolbradesco: 'Boleto', ticket: 'Boleto', account_money: 'Saldo Mercado Pago' };

  function linhaCompra(c) {
    const itensSemEscape = c.itens.length ? resumoItens(c.itens.map((i) => ({ quantidade: i.quantidade, nome: escapeHtml(i.nome) }))) : '—';
    const detalhesItens = c.itens.map((i) => `
        <li><span>${i.quantidade}× ${escapeHtml(i.nome)}</span><span>${moeda(i.preco)} <small>un.</small> · <strong>${moeda(i.preco * i.quantidade)}</strong></span></li>`).join('');
    const entrega = [c.cidade, c.uf].filter(Boolean).join(' / ');
    const metodo = c.metodo ? (ROTULO_PAGAMENTO[c.metodo] || c.metodo) : '';
    const u = c.usuario;
    const idDetalhe = 'det-compra-' + c.id;

    return `
      <tr class="usuarios__linha-compra">
        <td><span class="usuarios__codigo">${escapeHtml(c.codigo)}</span></td>
        <td>
          <div class="usuarios__usuario-cel">
            <span class="usuarios__avatar">${escapeHtml(iniciais(u.nome))}</span>
            <span>
              <span class="usuarios__nome-forte">${escapeHtml(u.nome)}</span>
              <span class="usuarios__sub-linha">${escapeHtml(u.email)}</span>
            </span>
          </div>
        </td>
        <td class="usuarios__col-itens">${itensSemEscape}</td>
        <td><strong>${moeda(c.total)}</strong></td>
        <td><span class="usuarios__status usuarios__status--${escapeHtml(c.status)}">${escapeHtml(statusLabel(c.status))}</span></td>
        <td>${escapeHtml(dataParaExibicao(c.criado_em))}</td>
        <td><button type="button" class="usuarios__btn-tabela usuarios__btn-tabela--editar" data-detalhe-compra="${idDetalhe}" aria-expanded="false" aria-controls="${idDetalhe}">Ver detalhes</button></td>
      </tr>
      <tr class="usuarios__linha-detalhe" id="${idDetalhe}" hidden>
        <td colspan="7">
          <div class="usuarios__detalhe">
            <ul class="usuarios__detalhe-itens">${detalhesItens || '<li>Sem itens registrados.</li>'}</ul>
            <dl class="usuarios__detalhe-dados">
              <div><dt>Subtotal</dt><dd>${moeda(c.subtotal)}</dd></div>
              ${c.desconto > 0 ? `<div><dt>Desconto${c.cupom ? ' (' + escapeHtml(c.cupom) + ')' : ''}</dt><dd>− ${moeda(c.desconto)}</dd></div>` : (c.cupom ? `<div><dt>Cupom</dt><dd>${escapeHtml(c.cupom)}</dd></div>` : '')}
              <div><dt>Frete${c.frete_nome ? ' (' + escapeHtml(c.frete_nome) + ')' : ''}</dt><dd>${moeda(c.frete)}</dd></div>
              <div><dt>Total</dt><dd><strong>${moeda(c.total)}</strong></dd></div>
              ${metodo ? `<div><dt>Pagamento</dt><dd>${escapeHtml(metodo)}</dd></div>` : ''}
              ${entrega ? `<div><dt>Entrega</dt><dd>${escapeHtml(entrega)}</dd></div>` : ''}
              ${c.rastreio ? `<div><dt>Rastreio</dt><dd>${escapeHtml(c.rastreio)}</dd></div>` : ''}
              <div><dt>Equipe / Unidade</dt><dd>${escapeHtml([u.equipe, u.unidade].filter(Boolean).join(' · ') || '—')}</dd></div>
            </dl>
          </div>
        </td>
      </tr>`;
  }

  function preencherResumoCompras(r, topo) {
    document.getElementById('kpiPedidos').textContent = r.total_pedidos;
    document.getElementById('kpiPedidosNota').textContent = `${r.compradores} comprador${r.compradores === 1 ? '' : 'es'} · ${r.itens_vendidos} ite${r.itens_vendidos === 1 ? 'm' : 'ns'} vendido${r.itens_vendidos === 1 ? '' : 's'}`;
    document.getElementById('kpiReceita').textContent = moeda(r.receita);
    document.getElementById('kpiReceitaNota').textContent = 'Pago, enviado ou entregue';
    document.getElementById('kpiTicket').textContent = moeda(r.ticket_medio);
    document.getElementById('kpiTicketNota').textContent = 'Por pedido confirmado';
    document.getElementById('kpiAguardando').textContent = r.aguardando_qtd;
    document.getElementById('kpiAguardandoNota').textContent = r.aguardando_qtd ? `${moeda(r.aguardando_valor)} a confirmar` : 'Nenhum pedido pendente';

    const bloco = document.getElementById('blocoTopProdutos');
    bloco.hidden = !topo.length;
    document.getElementById('listaTopProdutos').innerHTML = topo.map((t) => `
      <li><span class="usuarios__top-nome">${escapeHtml(t.nome)}</span><span class="usuarios__top-qtd">${t.quantidade} un. · ${moeda(t.valor)}</span></li>`).join('');
  }

  async function carregarCompras(adicionar) {
    const corpo = document.getElementById('corpoCompras');
    const token = ++comprasToken;
    if (!adicionar) {
      comprasCarregadas = 0;
      corpo.innerHTML = '<tr class="usuarios__tabela-vazio"><td colspan="7">Carregando…</td></tr>';
    }

    const params = new URLSearchParams();
    const busca = document.getElementById('buscaCompra').value.trim();
    const statusPedido = document.getElementById('filtroStatusCompra').value;
    const dias = document.getElementById('filtroPeriodoCompra').value;
    if (busca) params.set('busca', busca);
    if (statusPedido) params.set('status', statusPedido);
    if (dias) params.set('dias', dias);
    params.set('offset', String(comprasCarregadas));

    const { status, dados } = await api('dashboard/compras.php?' + params.toString());
    if (token !== comprasToken) return; // chegou uma consulta mais nova

    if (status !== 200 || !dados.sucesso) {
      if (!adicionar) corpo.innerHTML = '<tr class="usuarios__tabela-vazio"><td colspan="7">Não foi possível carregar as compras.</td></tr>';
      return;
    }

    preencherResumoCompras(dados.resumo, dados.top_produtos);

    if (!adicionar && !dados.itens.length) {
      corpo.innerHTML = '<tr class="usuarios__tabela-vazio"><td colspan="7">Nenhuma compra encontrada.</td></tr>';
    } else if (adicionar) {
      corpo.insertAdjacentHTML('beforeend', dados.itens.map(linhaCompra).join(''));
    } else {
      corpo.innerHTML = dados.itens.map(linhaCompra).join('');
    }

    comprasCarregadas += dados.itens.length;
    const restante = dados.total - comprasCarregadas;
    document.getElementById('maisCompras').hidden = dados.total === 0;
    document.getElementById('rodapeCompras').textContent = `Exibindo ${comprasCarregadas} de ${dados.total} pedido${dados.total === 1 ? '' : 's'}`;
    document.getElementById('btnMaisCompras').hidden = restante <= 0;
  }

  // Expandir / recolher os detalhes de um pedido
  document.getElementById('corpoCompras').addEventListener('click', (e) => {
    const botao = e.target.closest('[data-detalhe-compra]');
    if (!botao) return;
    const linha = document.getElementById(botao.getAttribute('data-detalhe-compra'));
    if (!linha) return;
    const abrir = linha.hidden;
    linha.hidden = !abrir;
    botao.setAttribute('aria-expanded', String(abrir));
    botao.textContent = abrir ? 'Ocultar' : 'Ver detalhes';
  });

  document.getElementById('btnMaisCompras').addEventListener('click', () => carregarCompras(true));
  document.getElementById('filtroStatusCompra').addEventListener('change', () => carregarCompras(false));
  document.getElementById('filtroPeriodoCompra').addEventListener('change', () => carregarCompras(false));
  let timerBuscaCompra;
  document.getElementById('buscaCompra').addEventListener('input', () => {
    clearTimeout(timerBuscaCompra);
    timerBuscaCompra = setTimeout(() => carregarCompras(false), 250);
  });

  // ------------------------------------------------------------
  // Visão 3 — Editar usuário
  // ------------------------------------------------------------
  const formEditar = document.getElementById('formEditarUsuario');
  const campoGenero = document.getElementById('editarGenero');
  const wrapGeneroOutro = document.getElementById('editarGeneroOutroWrap');

  campoGenero.addEventListener('change', () => {
    wrapGeneroOutro.hidden = campoGenero.value !== 'outro';
  });

  async function garantirUnidadesCarregadas() {
    if (unidadesCarregadas) return;
    const select = document.getElementById('editarUnidade');
    const { status, dados } = await api('unidades.php');
    if (status === 200 && dados.sucesso) {
      select.innerHTML = dados.itens.map((u) => `<option value="${u.id}">${escapeHtml(u.nome)}</option>`).join('');
      unidadesCarregadas = true;
    } else {
      select.innerHTML = '<option value="">Não foi possível carregar as unidades</option>';
    }
  }

  const sucessoEditar = document.getElementById('sucessoEditar');
  let timerSucessoEditar;
  function mostrarSucessoEdicao() {
    sucessoEditar.hidden = false;
    clearTimeout(timerSucessoEditar);
    timerSucessoEditar = setTimeout(() => { sucessoEditar.hidden = true; }, 5000);
  }

  async function carregarUsuarioParaEdicao(id, manterTela) {
    document.getElementById('erroEditarGeral').textContent = '';
    formEditar.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
    if (!manterTela) {
      sucessoEditar.hidden = true;
      formEditar.reset();
    }

    await garantirUnidadesCarregadas();

    const { status, dados } = await api('usuario.php?id=' + id);
    if (status !== 200 || !dados.sucesso) {
      document.getElementById('erroEditarGeral').textContent = dados.erro || 'Não foi possível carregar este usuário.';
      return;
    }

    const u = dados.usuario;
    document.getElementById('editarId').value = u.id;
    document.getElementById('editarNome').value = u.nome;
    document.getElementById('editarEmail').value = u.email;
    document.getElementById('editarTelefone').value = formatarTelefone(u.telefone);
    document.getElementById('editarCpf').value = formatarCpf(u.cpf);
    document.getElementById('editarDataNascimento').value = dataSqlParaBr(u.data_nascimento);
    document.getElementById('editarGenero').value = u.genero;
    document.getElementById('editarGeneroOutro').value = u.genero_outro || '';
    wrapGeneroOutro.hidden = u.genero !== 'outro';
    document.getElementById('editarUnidade').value = u.unidade_id != null ? String(u.unidade_id) : '';
    document.getElementById('editarEquipe').value = u.equipe_slug || 'geral';
    document.getElementById('editarCargo').value = u.cargo || 'funcionario';
    document.getElementById('editarSenha').value = '';
    document.getElementById('editarRepetirSenha').value = '';

    // Card lateral "Informações do usuário"
    document.getElementById('infoAvatar').textContent = iniciais(u.nome);
    document.getElementById('infoNome').textContent = u.nome;
    const infoStatus = document.getElementById('infoStatus');
    infoStatus.textContent = statusLabel(u.status);
    infoStatus.className = 'usuarios__status usuarios__status--' + u.status;
    document.getElementById('infoEmail').textContent = u.email;
    document.getElementById('infoTelefone').textContent = formatarTelefone(u.telefone) || '—';
    document.getElementById('infoNascimento').textContent = dataSqlParaBr(u.data_nascimento) || '—';
    document.getElementById('infoEquipe').textContent = u.equipe_nome || '—';
    document.getElementById('infoCargo').textContent = u.cargo_nome || '—';
    document.getElementById('infoUnidade').textContent = u.unidade_nome || '—';
  }

  formEditar.addEventListener('submit', async (e) => {
    e.preventDefault();

    const botao = formEditar.querySelector('.usuarios__btn-primario');
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Salvando…';

    document.getElementById('erroEditarGeral').textContent = '';
    formEditar.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));

    const payload = {
      id: Number(document.getElementById('editarId').value),
      nome: document.getElementById('editarNome').value.trim(),
      email: document.getElementById('editarEmail').value.trim(),
      telefone: document.getElementById('editarTelefone').value.trim(),
      cpf: document.getElementById('editarCpf').value.trim(),
      data_nascimento: document.getElementById('editarDataNascimento').value.trim(),
      genero: document.getElementById('editarGenero').value,
      genero_outro: campoGenero.value === 'outro' ? document.getElementById('editarGeneroOutro').value.trim() : '',
      senha: document.getElementById('editarSenha').value,
      repetir_senha: document.getElementById('editarRepetirSenha').value,
      unidade_id: Number(document.getElementById('editarUnidade').value) || 0,
      equipe: document.getElementById('editarEquipe').value,
      cargo: document.getElementById('editarCargo').value,
    };

    const { status, dados } = await api('usuario.php', 'POST', payload);

    botao.disabled = false;
    botao.textContent = textoOriginal;

    if (status === 200 && dados.sucesso) {
      // Continua na mesma página: recarrega os dados salvos (card lateral e campos) e avisa o sucesso
      await carregarUsuarioParaEdicao(payload.id, true);
      mostrarSucessoEdicao();
      return;
    }

    if (dados.erros) {
      const mapaCampos = {
        nome: 'editarNome', email: 'editarEmail', telefone: 'editarTelefone', cpf: 'editarCpf',
        data_nascimento: 'editarDataNascimento', genero: 'editarGenero', genero_outro: 'editarGeneroOutro',
        senha: 'editarSenha', repetir_senha: 'editarRepetirSenha', unidade_id: 'editarUnidade', equipe: 'editarEquipe', cargo: 'editarCargo',
      };
      Object.entries(dados.erros).forEach(([campo, mensagem]) => {
        const input = document.getElementById(mapaCampos[campo]);
        if (input) input.classList.add('is-invalid');
      });
      document.getElementById('erroEditarGeral').textContent = Object.values(dados.erros)[0] || 'Verifique os campos destacados.';
    } else {
      document.getElementById('erroEditarGeral').textContent = dados.erro || 'Não foi possível salvar as alterações.';
    }
  });

  // ------------------------------------------------------------
  // Estado inicial
  // ------------------------------------------------------------
  restaurarEstado();

  // ---------- Botão direito numa linha (menu padronizado do site, assets/js/menu-contexto.js) ----------
  // Usa os próprios botões da linha (Editar / Aceitar / Recusar / Excluir), então vale as mesmas regras e confirmações.
  raiz.addEventListener('contextmenu', (e) => {
    const M = window.MenuContexto;
    const tr = e.target.closest('tbody tr');
    if (!M || !tr || e.shiftKey || M.temSelecao()) return;
    const nomeEl = tr.querySelector('.usuarios__nome-forte');
    if (!nomeEl) return; // linha de "Carregando…" / vazio
    const nome = nomeEl.textContent.trim();
    const celulas = Array.from(tr.children);
    const emailTd = celulas.find((td) => /@/.test(td.textContent));
    const email = emailTd ? emailTd.textContent.trim() : '';
    const btnEditar = tr.querySelector('[data-editar]');
    const btnAceitar = tr.querySelector('[data-aceitar]');
    const btnRecusar = tr.querySelector('[data-recusar]');
    const btnExcluir = tr.querySelector('[data-excluir]');

    const opcoes = [];
    if (btnEditar) opcoes.push({ rotulo: 'Editar usuário', icone: 'editar', destaque: true, acao: () => btnEditar.click() });
    if (btnAceitar) opcoes.push({ rotulo: 'Aceitar solicitação', icone: 'pessoa', destaque: true, acao: () => btnAceitar.click() });
    if (email) opcoes.push({ rotulo: 'Copiar e-mail', icone: 'copiar', acao: () => M.copiar(email, 'E-mail copiado') });
    opcoes.push({ rotulo: 'Copiar nome', icone: 'copiar', acao: () => M.copiar(nome, 'Nome copiado') });
    if (btnRecusar) {
      opcoes.push('sep');
      opcoes.push({ rotulo: 'Recusar solicitação', icone: 'lixeira', perigo: true, acao: () => btnRecusar.click() });
    }
    if (btnExcluir) {
      opcoes.push('sep');
      opcoes.push({ rotulo: 'Excluir usuário', icone: 'lixeira', perigo: true, acao: () => btnExcluir.click() });
    }
    e.preventDefault();
    const pos = M.posicao(e, tr);
    M.mostrar({ x: pos.x, y: pos.y, alvo: null, aria: 'Opções de ' + nome, cabeca: M.cabeca('pessoa', nome), opcoes: opcoes });
  });

  // ---------- Menu lateral: botão "Recolher" (mesmo comportamento das demais páginas) ----------
  const btnRecolherMenu = document.getElementById('btnRecolher');
  if (btnRecolherMenu) btnRecolherMenu.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
})();
