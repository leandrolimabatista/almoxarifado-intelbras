// ============================================================
// BARRA DE APPS — personalização do menu lateral (estilo Teams)
//
// Botão direito (ou Shift+F10 / tecla de menu) numa categoria do menu
// lateral abre:  Mover para cima · Mover para baixo · Desafixar ·
//                Personalizar barra de apps
//
// "Personalizar barra de apps" abre um diálogo onde dá pra fixar /
// desafixar, reordenar e restaurar o padrão, além de ligar o
// "Recolher a barra automaticamente" (fecha o menu depois de escolher
// um app). O mesmo diálogo abre por qualquer elemento com o atributo
// data-barra-app-abrir (ex.: Configurações → Aparência).
//
// COMO FUNCIONA
//  - O menu lateral é copiado em cada página (.inicio__nav). Este script
//    é global (carregado pelo index.php) e age sobre a cópia da página
//    atual, então não precisa mexer em nenhum HTML de página.
//  - A escolha fica em localStorage, separada por usuário
//    ("barraApp:v1:<id>"): vale só neste navegador.
//  - A ordem padrão é a do HTML. Itens novos (ou que só aparecem pra
//    certos usuários, como "Dashboard") entram no fim se ainda não estão
//    na ordem salva; itens salvos que não existem mais são ignorados.
//  - Sempre sobra pelo menos um app fixado.
// ============================================================
(function () {
  'use strict';

  if (document.body.getAttribute('data-logado') !== '1') return;

  const nav = document.querySelector('.inicio__sidebar .inicio__nav');
  if (!nav) return;

  const uid = document.body.getAttribute('data-usuario-id') || '0';
  const CHAVE = 'barraApp:v1:' + uid;

  // ---- Itens (slug = valor de ?pagina= no link) ---------------------
  function slugDe(a) {
    try {
      return new URL(a.getAttribute('href'), location.href).searchParams.get('pagina') || '';
    } catch (e) {
      return '';
    }
  }
  function rotuloDe(a) {
    const s = a.querySelector('span');
    return (s ? s.textContent : a.textContent).trim();
  }

  const itens = new Map(); // slug -> <a>
  nav.querySelectorAll('.inicio__nav-item').forEach((a) => {
    const slug = slugDe(a);
    if (slug && !itens.has(slug)) itens.set(slug, a);
  });
  if (itens.size === 0) return;
  const padrao = Array.from(itens.keys());

  // ---- Estado salvo ------------------------------------------------
  function lerEstado() {
    let bruto = null;
    try { bruto = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { /* ignora */ }
    // "usuarios" foi renomeado para "dashboard": aproveita a escolha já salva.
    const lista = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string').map((s) => (s === 'usuarios' ? 'dashboard' : s)) : []);
    return {
      ordem: lista(bruto && bruto.ordem),
      ocultos: lista(bruto && bruto.ocultos),
      autoRecolher: !!(bruto && bruto.autoRecolher),
    };
  }
  let estado = lerEstado();
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { /* storage indisponível */ }
  }

  function ordemCompleta() {
    const vistos = new Set();
    const saida = [];
    estado.ordem.forEach((s) => {
      if (itens.has(s) && !vistos.has(s)) { vistos.add(s); saida.push(s); }
    });
    padrao.forEach((s) => { if (!vistos.has(s)) saida.push(s); });
    return saida;
  }
  const estaFixado = (s) => !estado.ocultos.includes(s);
  const visiveis = () => ordemCompleta().filter(estaFixado);

  function aplicar() {
    if (!ordemCompleta().some(estaFixado)) estado.ocultos = []; // nunca deixa a barra vazia
    ordemCompleta().forEach((s) => {
      const a = itens.get(s);
      nav.appendChild(a); // reposiciona na ordem
      a.hidden = !estaFixado(s);
    });
  }

  function mover(slug, delta, soVisiveis) {
    const todos = ordemCompleta();
    const i = todos.indexOf(slug);
    if (i < 0) return false;
    let j = i + delta;
    while (soVisiveis && j >= 0 && j < todos.length && !estaFixado(todos[j])) j += delta;
    if (j < 0 || j >= todos.length) return false;
    todos.splice(j, 0, todos.splice(i, 1)[0]);
    estado.ordem = todos;
    salvar();
    aplicar();
    return true;
  }

  function definirFixado(slug, fixar) {
    const conj = new Set(estado.ocultos);
    if (fixar) {
      conj.delete(slug);
    } else {
      if (estaFixado(slug) && visiveis().length <= 1) return false;
      conj.add(slug);
    }
    estado.ocultos = Array.from(conj);
    salvar();
    aplicar();
    return true;
  }

  // ---- Aviso para leitores de tela --------------------------------
  const aviso = document.createElement('div');
  aviso.className = 'barra-app-sr';
  aviso.setAttribute('aria-live', 'polite');
  aviso.setAttribute('role', 'status');
  document.body.appendChild(aviso);
  function anunciar(msg) {
    aviso.textContent = '';
    setTimeout(() => { aviso.textContent = msg; }, 30);
  }

  // ---- Ícones do menu ----------------------------------------------
  const svg = (d) =>
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' + d + '</svg>';
  const tr = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const ICONES = {
    subir: svg('<path d="M12 19V5M6 11l6-6 6 6" ' + tr + '/>'),
    descer: svg('<path d="M12 5v14M6 13l6 6 6-6" ' + tr + '/>'),
    desafixar: svg('<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5zM12 14v6M4 4l16 16" ' + tr + '/>'),
    personalizar: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9" ' + tr + '/><circle cx="15" cy="7" r="2" ' + tr + '/><circle cx="9" cy="17" r="2" ' + tr + '/>'),
  };

  // ================================================================
  // MENU DE CONTEXTO
  // ================================================================
  let menuAtual = null;

  function fecharMenu(devolverFoco) {
    if (!menuAtual) return;
    const { el, item, limpar } = menuAtual;
    menuAtual = null;
    limpar();
    el.remove();
    if (devolverFoco && item && item.isConnected && !item.hidden) item.focus();
  }

  function abrirMenu(item, x, y) {
    fecharMenu(false);

    const slug = slugDe(item);
    const rotulo = rotuloDe(item);
    const vis = visiveis();
    const pos = vis.indexOf(slug);

    const acoes = [];
    if (pos > 0) acoes.push(['subir', 'Mover para cima']);
    if (pos >= 0 && pos < vis.length - 1) acoes.push(['descer', 'Mover para baixo']);
    if (vis.length > 1) acoes.push(['desafixar', 'Desafixar']);
    if (acoes.length) acoes.push(['sep']);
    acoes.push(['personalizar', 'Personalizar barra de apps']);

    const el = document.createElement('div');
    el.className = 'barra-app-menu';
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', 'Opções de ' + rotulo);

    acoes.forEach(([acao, texto]) => {
      if (acao === 'sep') {
        const sep = document.createElement('div');
        sep.className = 'barra-app-menu__sep';
        sep.setAttribute('role', 'separator');
        el.appendChild(sep);
        return;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'barra-app-menu__item';
      b.setAttribute('role', 'menuitem');
      b.dataset.acao = acao;
      b.innerHTML = ICONES[acao] + '<span></span>';
      b.lastChild.textContent = texto;
      el.appendChild(b);
    });

    document.body.appendChild(el);

    // Posiciona sem sair da tela.
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
    el.style.left = left + 'px';
    el.style.top = top + 'px';

    const fora = (e) => { if (!el.contains(e.target)) fecharMenu(false); };
    const fechar = () => fecharMenu(false);
    document.addEventListener('pointerdown', fora, true);
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    window.addEventListener('blur', fechar);
    const limpar = () => {
      document.removeEventListener('pointerdown', fora, true);
      window.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
      window.removeEventListener('blur', fechar);
    };

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-acao]');
      if (!b) return;
      executar(b.dataset.acao, slug, item, rotulo);
    });

    el.addEventListener('keydown', (e) => {
      const bs = Array.from(el.querySelectorAll('[role="menuitem"]'));
      const i = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); bs[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); bs[bs.length - 1].focus(); }
      else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); fecharMenu(true); }
    });

    menuAtual = { el, item, limpar };
    const primeiro = el.querySelector('[role="menuitem"]');
    if (primeiro) primeiro.focus();
  }

  function executar(acao, slug, item, rotulo) {
    if (acao === 'subir' || acao === 'descer') {
      const ok = mover(slug, acao === 'subir' ? -1 : 1, true);
      fecharMenu(true);
      if (ok) anunciar(rotulo + ' movido ' + (acao === 'subir' ? 'para cima' : 'para baixo'));
    } else if (acao === 'desafixar') {
      const vis = visiveis();
      const i = vis.indexOf(slug);
      const vizinho = vis[i + 1] || vis[i - 1];
      const ok = definirFixado(slug, false);
      fecharMenu(false);
      if (ok) {
        anunciar(rotulo + ' desafixado');
        const prox = vizinho && itens.get(vizinho);
        if (prox) prox.focus();
      }
    } else if (acao === 'personalizar') {
      fecharMenu(false);
      abrirPersonalizar();
    }
  }

  nav.addEventListener('contextmenu', (e) => {
    const item = e.target.closest('.inicio__nav-item');
    if (!item || !nav.contains(item)) return;
    e.preventDefault();
    let x = e.clientX;
    let y = e.clientY;
    if (!x && !y) { // aberto pelo teclado: ancora no item
      const r = item.getBoundingClientRect();
      x = r.left + 16;
      y = r.bottom;
    }
    abrirMenu(item, x, y);
  });

  // ================================================================
  // DIÁLOGO "PERSONALIZAR BARRA DE APPS"
  // ================================================================
  let dialogo = null;

  function abrirPersonalizar() {
    if (dialogo) return;
    const dlg = document.createElement('dialog');
    if (typeof dlg.showModal !== 'function') return; // navegador sem <dialog>
    const anterior = document.activeElement;

    dlg.className = 'barra-app-dialogo';
    dlg.setAttribute('aria-labelledby', 'barraAppTitulo');
    dlg.innerHTML =
      '<header class="barra-app-dialogo__cab">' +
        '<h2 id="barraAppTitulo">Personalizar barra de apps</h2>' +
        '<p>Fixe, desafixe e reordene os apps da sua barra.</p>' +
      '</header>' +
      '<ul class="barra-app-dialogo__lista"></ul>' +
      '<label class="barra-app-dialogo__opcao">' +
        '<input type="checkbox" class="barra-app-dialogo__auto">' +
        '<span><strong>Recolher a barra automaticamente</strong>' +
        '<small>A barra fecha sozinha depois que você escolhe um app.</small></span>' +
      '</label>' +
      '<footer class="barra-app-dialogo__rod">' +
        '<button type="button" class="barra-app-botao" data-acao="restaurar">Restaurar padrão</button>' +
        '<button type="button" class="barra-app-botao barra-app-botao--primario" data-acao="fechar">Concluído</button>' +
      '</footer>';

    const lista = dlg.querySelector('.barra-app-dialogo__lista');
    const auto = dlg.querySelector('.barra-app-dialogo__auto');
    auto.checked = estado.autoRecolher;

    function botaoSeta(acao, slug, rotulo, desabilitado) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'barra-app-dialogo__seta';
      b.dataset.acao = acao;
      b.dataset.slug = slug;
      b.disabled = desabilitado;
      b.setAttribute('aria-label', 'Mover ' + rotulo + (acao === 'subir' ? ' para cima' : ' para baixo'));
      b.innerHTML = ICONES[acao];
      return b;
    }

    function renderLista(foco) {
      const todos = ordemCompleta();
      const unicoFixado = visiveis().length <= 1;
      lista.textContent = '';
      todos.forEach((s, i) => {
        const a = itens.get(s);
        const rotulo = rotuloDe(a);

        const li = document.createElement('li');
        li.className = 'barra-app-dialogo__linha';

        const icone = document.createElement('span');
        icone.className = 'barra-app-dialogo__icone';
        icone.setAttribute('aria-hidden', 'true');
        const original = a.querySelector('svg');
        if (original) icone.appendChild(original.cloneNode(true));

        const nome = document.createElement('span');
        nome.className = 'barra-app-dialogo__nome';
        nome.textContent = rotulo;

        const fixar = document.createElement('input');
        fixar.type = 'checkbox';
        fixar.className = 'barra-app-dialogo__fixar';
        fixar.dataset.acao = 'fixar';
        fixar.dataset.slug = s;
        fixar.checked = estaFixado(s);
        fixar.disabled = estaFixado(s) && unicoFixado;
        fixar.setAttribute('aria-label', 'Fixar ' + rotulo + ' na barra');
        fixar.title = fixar.disabled ? 'A barra precisa ter ao menos um app fixado' : 'Fixar na barra';

        li.append(
          icone,
          nome,
          botaoSeta('subir', s, rotulo, i === 0),
          botaoSeta('descer', s, rotulo, i === todos.length - 1),
          fixar
        );
        lista.appendChild(li);
      });

      if (foco) {
        let alvo = lista.querySelector('[data-acao="' + foco.acao + '"][data-slug="' + foco.slug + '"]');
        if (!alvo || alvo.disabled) {
          alvo = lista.querySelector('[data-slug="' + foco.slug + '"]:not(:disabled)');
        }
        if (alvo) alvo.focus();
      }
    }

    lista.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-acao]');
      if (!b || b.disabled) return;
      const slug = b.dataset.slug;
      if (mover(slug, b.dataset.acao === 'subir' ? -1 : 1, false)) {
        anunciar(rotuloDe(itens.get(slug)) + ' movido ' + (b.dataset.acao === 'subir' ? 'para cima' : 'para baixo'));
        renderLista({ acao: b.dataset.acao, slug });
      }
    });
    lista.addEventListener('change', (e) => {
      const c = e.target.closest('input[data-acao="fixar"]');
      if (!c) return;
      definirFixado(c.dataset.slug, c.checked);
      renderLista({ acao: 'fixar', slug: c.dataset.slug });
    });
    auto.addEventListener('change', () => {
      estado.autoRecolher = auto.checked;
      salvar();
    });
    dlg.querySelector('[data-acao="restaurar"]').addEventListener('click', () => {
      estado.ordem = [];
      estado.ocultos = [];
      salvar();
      aplicar();
      renderLista(null);
      anunciar('Barra de apps restaurada para o padrão');
    });
    // O evento "close" do <dialog> é assíncrono: libera o estado já aqui pra
    // dar pra reabrir na hora, sem esperar o evento.
    function fechar() {
      if (dialogo === dlg) dialogo = null;
      dlg.close();
    }
    dlg.querySelector('[data-acao="fechar"]').addEventListener('click', fechar);
    dlg.addEventListener('click', (e) => { // clique no fundo escurecido
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) fechar();
    });
    dlg.addEventListener('close', () => { // também dispara com Esc
      if (dialogo === dlg) dialogo = null;
      dlg.remove();
      // só devolve o foco se não abriram outro diálogo nesse meio tempo
      if (!dialogo && anterior && anterior.isConnected && typeof anterior.focus === 'function') anterior.focus();
    });

    renderLista(null);
    document.body.appendChild(dlg);
    dialogo = dlg;
    dlg.showModal();
  }

  // ---- Recolher automaticamente ao escolher um app -----------------
  // O menu lateral lembra aberto/fechado em sessionStorage("sidebarOpen") (só na aba atual)
  // (ver cabecalho.js e o script inline do index.php). Gravar "0" antes
  // de navegar faz a próxima página abrir com o menu fechado.
  nav.addEventListener('click', (e) => {
    if (!estado.autoRecolher) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!e.target.closest('.inicio__nav-item')) return;
    try { sessionStorage.setItem('sidebarOpen', '0'); } catch (err) { /* ignora */ }
  }, true);

  // ---- Gatilho externo (ex.: Configurações → Aparência) -------------
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-barra-app-abrir]');
    if (!g) return;
    e.preventDefault();
    abrirPersonalizar();
  });

  // ---- Início ------------------------------------------------------
  aplicar();
  window.BarraApp = { abrirPersonalizar: abrirPersonalizar };
})();
