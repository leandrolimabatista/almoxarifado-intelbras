/* ============================================================
   MENU DE CONTEXTO DO MENU LATERAL — botão direito nas categorias
   (mesma ideia da barra de apps do Teams)

   Vale para TODAS as categorias do menu lateral, em qualquer página:
     • menu principal  (.inicio__nav-item)      Início, Serviços, Loja...
     • equipes         (.inicio__channel-item)  Geral, Projetos, RH...
     • atalhos         (.inicio__shortcut)      Chat, Agendar reunião

   Ações do menu:
     1. ação principal da categoria (ex.: "Nova mensagem", "Nova reunião")
     2. Abrir em nova aba
     3. Copiar link
     4. (só equipes) Silenciar / Reativar notificações
     5. Mover para cima / Mover para baixo
     6. Desafixar: item do menu principal vai para ATALHOS; item de
        ATALHOS ganha "Fixar no menu" e volta para o menu principal
        (equipes apenas somem do menu; voltam em "Personalizar").
        Todas as trocas têm "Desfazer"
     7. Personalizar menu lateral (modal com chaves liga/desliga)

   Ordem e itens desafixados ficam salvos no navegador (localStorage)
   e são reaplicados em todas as páginas.
   Atalho global: Alt+Shift+N → Nova mensagem (Chat).

   PÁGINA: botão direito num lugar vazio (sem texto selecionado) →
   Voltar · Avançar · Recarregar · Copiar link da página · Imprimir…
   (+ Nova mensagem e Personalizar menu lateral quando há menu lateral).
   Links, imagens, campos de texto e Shift + botão direito mantêm o menu nativo.

   CHAT: o botão direito numa conversa da lista do Chat usa este mesmo menu
   (window.MenuContexto) — a lista de opções fica em chat.js.

   TEXTO SELECIONADO: selecione um trecho e clique com o botão direito (nele ou fora dele) →
   Copiar · Copiar link para o destaque · Pesquisar no Google · Imprimir
   (mesmo visual do menu lateral; campos de texto e Shift+clique direito
   continuam com o menu nativo do navegador).
============================================================ */
(function () {
  'use strict';

  if (window.__menuContextoLateral) return;
  window.__menuContextoLateral = true;

  var SEL_ITEM = '.inicio__nav-item, .inicio__channel-item, .inicio__shortcut';
  var CHAVE_PREFS = 'menuLateralPrefs';
  var CHAVE_MUDAS = 'equipesSilenciadas'; // mesma chave já usada pela página Equipes
  var GRUPOS = {
    nav:     { classe: 'inicio__nav-item',     titulo: 'MENU' },
    equipes: { classe: 'inicio__channel-item', titulo: 'EQUIPES' },
    atalhos: { classe: 'inicio__shortcut',     titulo: 'ATALHOS' }
  };
  var NOMES_GRUPOS = ['nav', 'equipes', 'atalhos'];

  /* ---------- Ícones ---------- */
  function svg(corpo) {
    return '<svg class="ml-menu__icone" viewBox="0 0 24 24" aria-hidden="true">' + corpo + '</svg>';
  }
  var ICONES = {
    abrir:   svg('<path d="M7 17 17 7M8 7h9v9"/>'),
    novo:    svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    link:    svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
    cima:    svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
    baixo:   svg('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
    pin:     svg('<path d="M12 17v5"/><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/>'),
    unpin:   svg('<path d="M12 17v5"/><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M3 3l18 18"/>'),
    ajustes: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    sino:    svg('<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
    sinoOff: svg('<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/>')
  };
  // Ícones do menu de texto selecionado
  ICONES.copiar   = svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>');
  ICONES.destaque = svg('<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>');
  ICONES.buscar   = svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>');
  ICONES.imprimir = svg('<path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="7" rx="1"/><path d="M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/>');
  ICONES.texto    = svg('<path d="M4 7V5h16v2M12 5v14M9 19h6"/>');
  // Ícones usados por outras telas que reaproveitam o menu (ex.: Chat)
  ICONES.mensagem = svg('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.6-.8L3 21l1.9-5.4A8.4 8.4 0 1 1 21 11.5z"/>');
  ICONES.telefone = svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z"/>');
  ICONES.video    = svg('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4z"/>');
  ICONES.baixar     = svg('<path d="M12 4v11M7 11l5 5 5-5"/><path d="M5 20h14"/>');
  ICONES.lixeira    = svg('<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>');
  ICONES.restaurar  = svg('<path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5"/>');
  ICONES.responder  = svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>');
  ICONES.editar     = svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>');
  ICONES.carrinho   = svg('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/>');
  ICONES.codigo     = svg('<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>');
  ICONES.pessoa     = svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>');
  ICONES.sair       = svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>');
  ICONES.voltar     = svg('<path d="M19 12H5M12 19l-7-7 7-7"/>');
  ICONES.avancar    = svg('<path d="M5 12h14M12 5l7 7-7 7"/>');
  ICONES.recarregar = svg('<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>');
  ICONES.estrela    = svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>');
  ICONES.curso      = svg('<path d="M2.5 8.5 12 4l9.5 4.5L12 13z"/><path d="M6 10.7v4.3c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.3"/>');
  ICONES.agenda     = svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>');
  ICONES.expandir   = svg('<path d="m6 9 6 6 6-6"/>');
  ICONES.recolher   = svg('<path d="m6 15 6-6 6 6"/>');
  ICONES.pagina     = svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>');
  ICONES.arquivos = svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>');
  var ICONE_MUDO_ITEM = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m2 2 20 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* Ação principal (1º item do menu) de cada categoria */
  var PRINCIPAL = {
    'inicio':                  { rotulo: 'Ir para o Início',          icone: 'abrir' },
    'servicos':                { rotulo: 'Abrir Serviços',            icone: 'abrir' },
    'inteligencia-artificial': { rotulo: 'Nova conversa com a IA',    icone: 'novo' },
    'documentos':              { rotulo: 'Abrir Documentos',          icone: 'abrir' },
    'unidade':                 { rotulo: 'Abrir Unidade',             icone: 'abrir' },
    'chamadas':                { rotulo: 'Nova chamada',              icone: 'novo' },
    'cursos':                  { rotulo: 'Ver cursos',                icone: 'abrir' },
    'loja':                    { rotulo: 'Ver produtos',              icone: 'abrir' },
    'dashboard':               { rotulo: 'Abrir Dashboard',            icone: 'abrir' },
    'chat':                    { rotulo: 'Nova mensagem',             icone: 'novo', atalho: 'Alt+Shift+N' },
    'agendar-reuniao':         { rotulo: 'Nova reunião',              icone: 'novo' },
    'equipes':                 { rotulo: 'Abrir canal',               icone: 'abrir' }
  };

  /* ---------- Utilidades ---------- */
  function grupoDe(item) {
    for (var i = 0; i < NOMES_GRUPOS.length; i++) {
      if (item.classList.contains(GRUPOS[NOMES_GRUPOS[i]].classe)) return NOMES_GRUPOS[i];
    }
    return null;
  }
  function idDe(item) { return item.getAttribute('href') || item.textContent.trim(); }
  function itensDoGrupo(g) {
    return Array.prototype.slice.call(document.querySelectorAll('.inicio__sidebar .' + GRUPOS[g].classe));
  }
  function visiveis(g) {
    return itensDoGrupo(g).filter(function (el) { return !el.classList.contains('ml-oculto'); });
  }
  function nomeDe(item) {
    var spans = item.querySelectorAll('span');
    for (var i = 0; i < spans.length; i++) {
      var s = spans[i];
      if (s.classList.contains('inicio__channel-dot') ||
          s.classList.contains('inicio__channel-badge') ||
          s.classList.contains('inicio__channel-mudo')) continue;
      var t = s.textContent.trim();
      if (t) return t;
    }
    return item.textContent.trim();
  }
  function slugDe(item) {
    try {
      var u = new URL(item.href, location.href);
      return u.searchParams.get('pagina') || 'inicio';
    } catch (e) { return ''; }
  }
  function paginaAtual() {
    try { return new URL(location.href).searchParams.get('pagina') || 'inicio'; }
    catch (e) { return 'inicio'; }
  }

  /* ---------- Preferências (ordem + desafixados) ---------- */
  function lerPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(CHAVE_PREFS) || '{}') || {};
      p.ordem = p.ordem || {};
      p.ocultos = Array.isArray(p.ocultos) ? p.ocultos : [];
      p.grupos = p.grupos || {};
      return p;
    } catch (e) { return { ordem: {}, ocultos: [], grupos: {} }; }
  }
  function gravarPrefs(p) {
    try { localStorage.setItem(CHAVE_PREFS, JSON.stringify(p)); } catch (e) { /* storage cheio/bloqueado */ }
  }
  function salvarOrdem(g) {
    var p = lerPrefs();
    p.ordem[g] = itensDoGrupo(g).map(idDe);
    gravarPrefs(p);
  }

  var ORIGEM = {}; // ordem original do HTML (para "Restaurar padrão")
  var NATIVO = {}; // grupo original de cada item (id -> 'nav' | 'atalhos' | 'equipes')
  var CONT = {};   // containers onde os itens de nav / atalhos vivem

  function todosItens() {
    return Array.prototype.slice.call(document.querySelectorAll('.inicio__sidebar ' + SEL_ITEM.split(', ').join(', .inicio__sidebar ')));
  }
  function podeTrocarGrupo(item) {
    var g = grupoDe(item);
    return !!(CONT.nav && CONT.atalhos && (g === 'nav' || g === 'atalhos'));
  }

  // Passa o item de 'nav' para 'atalhos' (ou ao contrário): troca as classes
  // (e o estado "ativo") para ele herdar o visual do novo grupo.
  function trocarGrupo(item, destino, antesDe) {
    var de = grupoDe(item);
    if (!de || de === destino) return;
    var cDe = GRUPOS[de].classe, cPara = GRUPOS[destino].classe;
    var ativo = item.classList.contains(cDe + '--active');
    item.classList.remove(cDe, cDe + '--active');
    item.classList.add(cPara);
    if (ativo) item.classList.add(cPara + '--active');
    item.classList.remove('ml-oculto');

    if (antesDe === undefined) {
      // voltando ao grupo de origem: tenta cair na posição original
      antesDe = null;
      if (NATIVO[idDe(item)] === destino && ORIGEM[destino]) {
        var meu = ORIGEM[destino].indexOf(idDe(item));
        var outros = itensDoGrupo(destino).filter(function (x) { return x !== item; });
        for (var i = 0; i < outros.length; i++) {
          if (ORIGEM[destino].indexOf(idDe(outros[i])) > meu) { antesDe = outros[i]; break; }
        }
      }
    }
    CONT[destino].insertBefore(item, antesDe || null);
  }

  function salvarGrupo(item) {
    var p = lerPrefs();
    var id = idDe(item), g = grupoDe(item);
    if (NATIVO[id] === g) delete p.grupos[id]; else p.grupos[id] = g;
    p.ordem.nav = itensDoGrupo('nav').map(idDe);
    p.ordem.atalhos = itensDoGrupo('atalhos').map(idDe);
    gravarPrefs(p);
  }

  function reordenar(g, ids) {
    var itens = itensDoGrupo(g);
    if (!itens.length) return;
    var ultimo = itens[itens.length - 1];
    var ancora = ultimo.nextSibling; // itens são contíguos dentro do container
    var pai = ultimo.parentNode;
    var pos = function (el) {
      var i = ids.indexOf(idDe(el));
      return i === -1 ? 9999 : i;
    };
    var ord = itens.map(function (el, i) { return { el: el, i: i }; });
    ord.sort(function (a, b) { return (pos(a.el) - pos(b.el)) || (a.i - b.i); });
    ord.forEach(function (o) { pai.insertBefore(o.el, ancora); });
  }

  function atualizarSecoes() {
    var eq = itensDoGrupo('equipes');
    var secEq = eq.length ? eq[0].closest('.inicio__sidebar-section') : null;
    if (secEq) secEq.classList.toggle('ml-secao-vazia', visiveis('equipes').length === 0);
    if (CONT.atalhos) CONT.atalhos.classList.toggle('ml-secao-vazia', visiveis('atalhos').length === 0);
  }

  function aplicarPrefs() {
    var p = lerPrefs();
    if (CONT.nav && CONT.atalhos) {
      todosItens().forEach(function (el) {
        var destino = p.grupos[idDe(el)];
        if ((destino === 'nav' || destino === 'atalhos') && grupoDe(el) !== destino &&
            (NATIVO[idDe(el)] === 'nav' || NATIVO[idDe(el)] === 'atalhos')) {
          trocarGrupo(el, destino, null);
        }
      });
    }
    NOMES_GRUPOS.forEach(function (g) {
      if (p.ordem[g]) reordenar(g, p.ordem[g]);
      itensDoGrupo(g).forEach(function (el) {
        el.classList.toggle('ml-oculto', p.ocultos.indexOf(idDe(el)) !== -1);
      });
      // nunca deixa um grupo sem nenhum item fixado
      var itens = itensDoGrupo(g);
      if (itens.length && !visiveis(g).length) itens[0].classList.remove('ml-oculto');
    });
    atualizarSecoes();
  }

  function definirOculto(item, oculto) {
    var p = lerPrefs();
    var id = idDe(item);
    var i = p.ocultos.indexOf(id);
    if (oculto && i === -1) p.ocultos.push(id);
    if (!oculto && i !== -1) p.ocultos.splice(i, 1);
    gravarPrefs(p);
    item.classList.toggle('ml-oculto', oculto);
    atualizarSecoes();
  }

  /* ---------- Animações ---------- */
  function reduzir() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // FLIP: mede onde cada item do menu lateral estava, executa a mudança e
  // anima cada item do lugar antigo até o novo (troca de ordem / de grupo).
  function flip(fazer, destaque) {
    var els = todosItens().filter(function (el) {
      return !el.classList.contains('ml-oculto') && el.getClientRects().length > 0;
    });
    var antes = els.map(function (el) { return el.getBoundingClientRect(); });
    fazer();
    if (reduzir() || !els.length || !els[0].animate) return;
    els.forEach(function (el, k) {
      if (el.classList.contains('ml-oculto')) return;
      var r = el.getBoundingClientRect();
      var dx = antes[k].left - r.left, dy = antes[k].top - r.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      var anim;
      if (el === destaque) {
        // o item movido "levanta": cresce um pouco, ganha sombra e desliza
        el.classList.add('ml-movendo');
        anim = el.animate([
          { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1)', boxShadow: '0 0 0 rgba(0,0,0,0)' },
          { transform: 'translate(' + (dx / 2) + 'px,' + (dy / 2) + 'px) scale(1.05)', boxShadow: '0 10px 22px rgba(0,0,0,0.16)', offset: 0.5 },
          { transform: 'none', boxShadow: '0 0 0 rgba(0,0,0,0)' }
        ], { duration: 380, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
        anim.onfinish = anim.oncancel = function () { el.classList.remove('ml-movendo'); };
      } else {
        el.animate(
          [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
          { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
        );
      }
    });
  }

  // Pulso verde no item que acabou de ser movido
  function pulso(item) {
    if (reduzir()) return;
    item.classList.remove('ml-pulso');
    void item.offsetWidth; // reinicia a animação
    item.classList.add('ml-pulso');
    setTimeout(function () { item.classList.remove('ml-pulso'); }, 950);
  }

  // Remove um elemento com animação de saída (classe --saindo)
  function removerAnimado(el, classe, ms) {
    if (!el || !el.parentNode) return;
    if (reduzir()) { el.remove(); return; }
    el.classList.add(classe);
    setTimeout(function () { el.remove(); }, ms);
  }

  /* ---------- Aviso (toast) ---------- */
  var toastEl = null, toastTimer = null;
  var ICONE_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function fecharToast() {
    clearTimeout(toastTimer);
    var el = toastEl;
    toastEl = null;
    removerAnimado(el, 'ml-toast--saindo', 170);
  }

  function toast(texto, rotuloAcao, aoClicar) {
    if (toastEl) { clearTimeout(toastTimer); toastEl.remove(); toastEl = null; }
    var ms = rotuloAcao ? 6000 : 2600;

    var el = document.createElement('div');
    el.className = 'ml-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');

    var ic = document.createElement('span');
    ic.className = 'ml-toast__icone';
    ic.innerHTML = ICONE_OK;
    el.appendChild(ic);

    var span = document.createElement('span');
    span.className = 'ml-toast__texto';
    span.textContent = texto;
    el.appendChild(span);

    if (rotuloAcao) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ml-toast__acao';
      b.textContent = rotuloAcao;
      b.addEventListener('click', function () {
        if (toastEl !== el) return;
        fecharToast();
        aoClicar();
      });
      el.appendChild(b);

      // barra de tempo restante para desfazer
      var barra = document.createElement('span');
      barra.className = 'ml-toast__barra';
      barra.style.setProperty('--ml-dur', ms + 'ms');
      el.appendChild(barra);
    }

    toastEl = el;
    document.body.appendChild(el);
    toastTimer = setTimeout(function () { if (toastEl === el) fecharToast(); }, ms);
  }

  /* ---------- Ações ---------- */
  function podeMover(item, dir) {
    var vis = visiveis(grupoDe(item));
    var i = vis.indexOf(item);
    return i !== -1 && i + dir >= 0 && i + dir < vis.length;
  }

  function mover(item, dir) {
    var g = grupoDe(item);
    var vis = visiveis(g);
    var i = vis.indexOf(item);
    var vizinho = vis[i + dir];
    if (!vizinho) return;
    flip(function () {
      if (dir < 0) vizinho.before(item); else vizinho.after(item);
    }, item);
    salvarOrdem(g);
  }

  function podeDesafixar(item) {
    var g = grupoDe(item);
    if (g === 'atalhos') return podeTrocarGrupo(item);
    if (g === 'nav') return visiveis('nav').length > 1 && podeTrocarGrupo(item);
    return visiveis(g).length > 1; // equipes: some do menu
  }

  // Desafixar: menu principal -> Atalhos | Atalhos -> menu principal | equipe -> some
  function desafixar(item) {
    if (!podeDesafixar(item)) return;
    var g = grupoDe(item);
    var nome = nomeDe(item);

    if (g === 'nav' || g === 'atalhos') {
      var destino = g === 'nav' ? 'atalhos' : 'nav';
      var pai = item.parentNode, prox = item.nextElementSibling;
      flip(function () {
        trocarGrupo(item, destino);
        atualizarSecoes();
      });
      pulso(item);
      salvarGrupo(item);
      toast('“' + nome + '” ' + (destino === 'atalhos' ? 'movido para Atalhos' : 'fixado no menu'), 'Desfazer', function () {
        flip(function () {
          trocarGrupo(item, g, prox);
          if (prox && prox.parentNode !== pai) pai.appendChild(item);
          atualizarSecoes();
        });
        pulso(item);
        salvarGrupo(item);
      });
      return;
    }

    definirOculto(item, true);
    toast('“' + nome + '” desafixado', 'Desfazer', function () { definirOculto(item, false); });
  }

  // "Nova mensagem": abre o painel "Nova conversa" do Chat.
  // Já está no Chat -> clica no botão "+"; senão vai para o Chat com novo=1
  // (o chat.js abre o painel sozinho quando recebe esse parâmetro).
  function novaMensagem() {
    var btn = document.getElementById('chatBtnNovaConversa');
    if (btn && paginaAtual() === 'chat') { btn.click(); return; }
    location.href = 'index.php?pagina=chat&novo=1';
  }

  function copiarLink(item) {
    var url = item.href;
    var ok = function () { toast('Link copiado'); };
    var falha = function () {
      var t = document.createElement('textarea');
      t.value = url;
      t.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(t);
      t.select();
      try { document.execCommand('copy'); ok(); } catch (e) { toast('Não foi possível copiar o link'); }
      t.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(ok, falha);
    } else { falha(); }
  }

  function lerMudas() {
    try {
      var v = JSON.parse(localStorage.getItem(CHAVE_MUDAS) || '[]');
      return Array.isArray(v) ? v.map(String) : [];
    } catch (e) { return []; }
  }
  function estaSilenciada(item) {
    return lerMudas().indexOf(item.getAttribute('data-equipe-slug')) !== -1;
  }
  function alternarSilencio(item) {
    var slug = item.getAttribute('data-equipe-slug');
    var lista = lerMudas();
    var i = lista.indexOf(slug);
    var mudo = i === -1;
    if (mudo) lista.push(slug); else lista.splice(i, 1);
    try { localStorage.setItem(CHAVE_MUDAS, JSON.stringify(lista)); } catch (e) { /* ignora */ }

    item.classList.toggle('inicio__channel-item--silenciada', mudo);
    var icone = item.querySelector('.inicio__channel-mudo');
    if (mudo && !icone) {
      icone = document.createElement('span');
      icone.className = 'inicio__channel-mudo';
      icone.title = 'Notificações silenciadas';
      icone.setAttribute('aria-label', 'Silenciada');
      icone.innerHTML = ICONE_MUDO_ITEM;
      item.appendChild(icone);
    } else if (!mudo && icone) {
      icone.remove();
    }
    toast(mudo ? 'Canal “' + nomeDe(item) + '” silenciado' : 'Notificações de “' + nomeDe(item) + '” reativadas');
  }

  /* ---------- Menu de contexto ---------- */
  var menuEl = null, alvoAtual = null, aoFecharAtual = null;
  var origemTeclado = false; // o menu foi aberto pelo teclado (tecla Menu / Shift+F10)?

  function montarOpcoes(item) {
    var g = grupoDe(item);
    var slug = slugDe(item);
    var principal = PRINCIPAL[slug] || { rotulo: 'Abrir', icone: 'abrir' };
    var opcoes = [];

    opcoes.push({
      rotulo: principal.rotulo, icone: principal.icone, atalho: principal.atalho, destaque: true,
      acao: function () {
        if (slug === 'chat') novaMensagem(); else location.href = item.href;
      }
    });
    opcoes.push({
      rotulo: 'Abrir em nova aba', icone: 'abrir',
      acao: function () { window.open(item.href, '_blank', 'noopener'); }
    });
    opcoes.push({ rotulo: 'Copiar link', icone: 'link', acao: function () { copiarLink(item); } });

    if (g === 'equipes') {
      var mudo = estaSilenciada(item);
      opcoes.push({
        rotulo: mudo ? 'Reativar notificações' : 'Silenciar canal',
        icone: mudo ? 'sino' : 'sinoOff',
        acao: function () { alternarSilencio(item); }
      });
    }

    opcoes.push('sep');
    opcoes.push({
      rotulo: 'Mover para cima', icone: 'cima', manterAberto: true,
      estado: function () { return !podeMover(item, -1); },
      acao: function () { mover(item, -1); }
    });
    opcoes.push({
      rotulo: 'Mover para baixo', icone: 'baixo', manterAberto: true,
      estado: function () { return !podeMover(item, 1); },
      acao: function () { mover(item, 1); }
    });
    opcoes.push({
      rotulo: g === 'atalhos' ? 'Fixar no menu' : 'Desafixar',
      icone: g === 'atalhos' ? 'pin' : 'unpin',
      desabilitado: !podeDesafixar(item),
      acao: function () { desafixar(item); }
    });
    opcoes.push('sep');
    opcoes.push({ rotulo: 'Personalizar menu lateral', icone: 'ajustes', acao: function () { abrirPersonalizar(item); } });
    return opcoes;
  }

  function itensHabilitados() {
    return menuEl ? Array.prototype.slice.call(menuEl.querySelectorAll('.ml-menu__item:not([aria-disabled="true"])')) : [];
  }

  // Reavalia quais opções estão habilitadas (ex.: chegou ao topo -> "Mover
  // para cima" fica cinza). Se o botão focado ficou cinza, passa o foco adiante.
  function atualizarEstadoMenu(focado) {
    if (!menuEl) return;
    Array.prototype.forEach.call(menuEl.querySelectorAll('.ml-menu__item'), function (btn) {
      if (!btn._estado) return;
      if (btn._estado()) btn.setAttribute('aria-disabled', 'true');
      else btn.removeAttribute('aria-disabled');
    });
    if (focado && focado.getAttribute('aria-disabled') === 'true') {
      var outros = itensHabilitados();
      var prox = outros.filter(function (x) { return x._estado; })[0] || outros[0];
      if (prox) prox.focus({ preventScroll: true });
    }
  }

  function fecharMenu(devolverFoco) {
    if (!menuEl) return;
    var el = menuEl;
    menuEl = null;
    el.removeAttribute('role');
    removerAnimado(el, 'ml-menu--saindo', 110);
    var cb = aoFecharAtual;
    aoFecharAtual = null;
    if (cb) { try { cb(); } catch (e) { /* ignora */ } }
    if (alvoAtual) {
      alvoAtual.classList.remove('ml-alvo');
      if (devolverFoco) { try { alvoAtual.focus({ preventScroll: true }); } catch (e) { /* ignora */ } }
    }
    alvoAtual = null;
  }

  // Monta e mostra um menu. É o núcleo usado pelo menu dos itens do menu
  // lateral e pelo menu de texto selecionado — assim os dois têm o mesmo
  // visual, animação e teclado.
  //   cfg = { x, y, alvo (item do menu lateral ou null), aria,
  //           cabeca(el) (preenche o título), opcoes }
  function mostrarMenu(cfg) {
    var x = cfg.x, y = cfg.y;
    fecharMenu(false);

    alvoAtual = cfg.alvo || null;
    aoFecharAtual = cfg.aoFechar || null;
    if (alvoAtual) alvoAtual.classList.add('ml-alvo');

    menuEl = document.createElement('div');
    menuEl.className = 'ml-menu';
    menuEl.setAttribute('data-mv-skip', ''); // movimento.js não mexe nos itens (sem anel verde de botão)
    menuEl.setAttribute('role', 'menu');
    menuEl.tabIndex = -1;
    menuEl.setAttribute('aria-label', cfg.aria);

    var cabeca = document.createElement('div');
    cabeca.className = 'ml-menu__cabeca';
    cabeca.setAttribute('role', 'presentation');
    cfg.cabeca(cabeca);
    menuEl.appendChild(cabeca);

    var indice = 0;
    cfg.opcoes.forEach(function (op) {
      if (op === 'sep') {
        var s = document.createElement('div');
        s.className = 'ml-menu__sep';
        s.setAttribute('role', 'separator');
        menuEl.appendChild(s);
        return;
      }
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ml-menu__item' + (op.destaque ? ' ml-menu__item--destaque' : '') + (op.perigo ? ' ml-menu__item--perigo' : '');
      b.setAttribute('role', 'menuitem');
      b.tabIndex = -1;
      b.style.setProperty('--i', indice++);
      b.innerHTML = ICONES[op.icone] + '<span class="ml-menu__rotulo"></span>' +
        (op.atalho ? '<span class="ml-menu__atalho"></span>' : '');
      b.querySelector('.ml-menu__rotulo').textContent = op.rotulo;
      if (op.atalho) b.querySelector('.ml-menu__atalho').textContent = op.atalho;
      var desab = op.estado ? op.estado() : !!op.desabilitado;
      if (desab) b.setAttribute('aria-disabled', 'true');
      if (op.estado) b._estado = op.estado;
      b.addEventListener('click', function () {
        if (b.getAttribute('aria-disabled') === 'true') return;
        if (op.manterAberto) {
          // mover para cima/baixo: o menu continua aberto
          op.acao();
          atualizarEstadoMenu(b);
          return;
        }
        fecharMenu(false);
        op.acao();
      });
      menuEl.appendChild(b);
    });

    menuEl.style.visibility = 'hidden';
    document.body.appendChild(menuEl);

    // posiciona perto do cursor, sem estourar a tela
    var w = menuEl.offsetWidth, h = menuEl.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight;
    var left = Math.max(8, Math.min(x, vw - w - 8));
    var top = (y + h > vh - 8) ? Math.max(8, y - h) : y;
    menuEl.style.left = left + 'px';
    menuEl.style.top = top + 'px';
    // a animação "nasce" no ponto do clique
    menuEl.style.transformOrigin = Math.max(0, x - left) + 'px ' + (top < y ? h : 0) + 'px';
    menuEl.style.visibility = '';
    if (reduzir()) menuEl.style.opacity = '1'; else menuEl.classList.add('ml-menu--entrar');

    // Mouse/toque: o foco fica no próprio menu (nenhum item destacado). Teclado:
    // foca o 1º item, para Enter/setas funcionarem de imediato.
    var primeiro = itensHabilitados()[0];
    if (origemTeclado && primeiro) primeiro.focus({ preventScroll: true });
    else menuEl.focus({ preventScroll: true });
  }

  function abrirMenu(item, x, y) {
    if (menuEl && alvoAtual === item) return; // já aberto neste item
    mostrarMenu({
      x: x, y: y, alvo: item,
      aria: 'Opções de ' + nomeDe(item),
      opcoes: montarOpcoes(item),
      cabeca: function (cabeca) {
        var icoItem = item.querySelector('svg.inicio__icon');
        var dotItem = item.querySelector('.inicio__channel-dot');
        if (icoItem) {
          var cc = icoItem.cloneNode(true);
          cc.removeAttribute('class');
          cabeca.appendChild(cc);
        } else if (dotItem) {
          var dd = document.createElement('span');
          dd.className = 'ml-menu__cabeca-dot';
          dd.style.background = dotItem.style.background || '#999';
          cabeca.appendChild(dd);
        }
        var nomeCabeca = document.createElement('span');
        nomeCabeca.className = 'ml-menu__cabeca-nome';
        nomeCabeca.textContent = nomeDe(item);
        cabeca.appendChild(nomeCabeca);
      }
    });
  }

  /* ---------- Menu de texto selecionado ----------
     Selecione um trecho e clique com o botão direito em cima dele: em vez do
     menu nativo do navegador, aparece este (mesmo visual do menu lateral).
     Vale com o clique em qualquer lugar da página enquanto houver texto
     selecionado. Fica de fora, mantendo o menu nativo:
       - campos de texto e áreas editáveis (colar, recortar, corretor...);
       - sem texto selecionado;
       - Shift + botão direito (atalho para ver o menu do navegador). */
  function copiarTexto(texto, msgOk) {
    var ok = function () { toast(msgOk); };
    var falha = function () {
      var t = document.createElement('textarea');
      t.value = texto;
      t.setAttribute('readonly', '');
      t.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(t);
      t.select();
      var copiou = false;
      try { copiou = document.execCommand('copy'); } catch (e) { copiou = false; }
      t.remove();
      if (copiou) ok(); else toast('Não foi possível copiar');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(ok, falha);
    } else { falha(); }
  }

  // "Copiar link para o destaque": #:~:text=... (fragmento de texto). O
  // Chrome/Edge abrem a página rolando até o trecho e o destacando; um
  // navegador sem suporte só abre a página.
  function linkParaDestaque(bruto) {
    var base = location.origin + location.pathname + location.search;
    var limpo = bruto.replace(/\s+/g, ' ').trim();
    var enc = function (t) { return encodeURIComponent(t).replace(/-/g, '%2D'); };
    var frag;
    if (!/\n/.test(bruto.trim()) && limpo.length <= 120) {
      frag = enc(limpo);
    } else { // trecho longo ou em vários blocos: "começo,fim"
      var p = limpo.split(' ');
      frag = enc(p.slice(0, 3).join(' ')) + ',' + enc(p.slice(-3).join(' '));
    }
    return base + '#:~:text=' + frag;
  }

  function resumir(txt, max) {
    return txt.length > max ? txt.slice(0, max - 1).replace(/\s+$/, '') + '…' : txt;
  }

  function emCampoEditavel(el) {
    return !!(el && el.closest && el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
  }

  // Devolve true se tratou o clique (e já deu preventDefault).
  function menuSelecao(e) {
    if (e.shiftKey || !window.getSelection) return false;
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
    var bruto = sel.toString();
    var texto = bruto.replace(/\s+/g, ' ').trim();
    if (!texto) return false;
    if (emCampoEditavel(e.target)) return false;
    var ancora = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    if (emCampoEditavel(ancora)) return false;

    // Com texto selecionado, o menu aparece onde o botão direito foi clicado
    // (em cima do trecho ou fora dele). Aberto pelo teclado (x = y = 0):
    // ancora no fim do trecho.
    var x = e.clientX, y = e.clientY;
    if (!x && !y) {
      var rects = Array.prototype.slice.call(sel.getRangeAt(0).getClientRects());
      var ultimo = rects[rects.length - 1];
      if (!ultimo) return false;
      x = ultimo.right; y = ultimo.bottom;
    }

    e.preventDefault();
    mostrarMenu({
      x: x, y: y, alvo: null,
      aria: 'Opções do texto selecionado',
      cabeca: function (cabeca) {
        cabeca.insertAdjacentHTML('beforeend', ICONES.texto);
        var nome = document.createElement('span');
        nome.className = 'ml-menu__cabeca-nome';
        nome.textContent = 'Texto selecionado';
        cabeca.appendChild(nome);
      },
      opcoes: [
        { rotulo: 'Copiar', icone: 'copiar', atalho: 'Ctrl+C', destaque: true,
          acao: function () { copiarTexto(bruto, 'Texto copiado'); } },
        { rotulo: 'Copiar link para o destaque', icone: 'destaque',
          acao: function () { copiarTexto(linkParaDestaque(bruto), 'Link copiado'); } },
        'sep',
        { rotulo: 'Pesquisar no Google por “' + resumir(texto, 28) + '”', icone: 'buscar',
          acao: function () { window.open('https://www.google.com/search?q=' + encodeURIComponent(texto), '_blank', 'noopener'); } },
        'sep',
        { rotulo: 'Imprimir…', icone: 'imprimir', atalho: 'Ctrl+P',
          acao: function () { window.print(); } }
      ]
    });
    return true;
  }

  /* ---------- Menu do cabeçalho ----------
     Carrinho, Chat, Nova chamada e menu do usuário (Meu perfil / Sair). */
  function menuCabecalho(e) {
    if (e.shiftKey || !e.target.closest) return false;
    var alvo = e.target.closest('#btnCarrinhoLoja, #btnChat, #btnChamadaRapida, #btnUsuarioMenu, .header__avatar');
    if (!alvo || !alvo.closest('.header')) return false;

    function urlDe(href) { return new URL(href, location.href).href; }
    function ehLink(rotulo, href, icone) {
      var url = urlDe(href);
      return [
        { rotulo: rotulo, icone: icone, destaque: true, acao: function () { location.href = url; } },
        { rotulo: 'Abrir em nova aba', icone: 'abrir', acao: function () { window.open(url, '_blank', 'noopener'); } },
        { rotulo: 'Copiar link', icone: 'link', acao: function () { copiarTexto(url, 'Link copiado'); } }
      ];
    }

    var titulo, icone, opcoes;
    if (alvo.id === 'btnCarrinhoLoja') {
      titulo = 'Carrinho da loja'; icone = 'carrinho';
      opcoes = [
        { rotulo: 'Abrir carrinho', icone: 'carrinho', destaque: true, acao: function () { alvo.click(); } },
        { rotulo: 'Ir para a Loja', icone: 'abrir', acao: function () { location.href = urlDe('index.php?pagina=loja'); } }
      ];
    } else if (alvo.id === 'btnChat') {
      titulo = 'Chat'; icone = 'mensagem'; opcoes = ehLink('Abrir Chat', alvo.getAttribute('href'), 'mensagem');
    } else if (alvo.id === 'btnChamadaRapida') {
      titulo = 'Nova chamada'; icone = 'telefone'; opcoes = ehLink('Nova chamada', alvo.getAttribute('href'), 'telefone');
    } else { // avatar / "Olá, Bem-Vindo!"
      var sair = document.getElementById('btnSairConta');
      titulo = 'Minha conta'; icone = 'pessoa';
      opcoes = [
        { rotulo: 'Meu perfil', icone: 'pessoa', destaque: true, acao: function () { location.href = urlDe('index.php?pagina=configuracoes'); } },
        { rotulo: 'Abrir perfil em nova aba', icone: 'abrir', acao: function () { window.open(urlDe('index.php?pagina=configuracoes'), '_blank', 'noopener'); } }
      ];
      if (sair) {
        opcoes.push('sep');
        opcoes.push({ rotulo: 'Sair', icone: 'sair', perigo: true, acao: function () { sair.click(); } });
      }
    }

    e.preventDefault();
    var x = e.clientX, y = e.clientY;
    if (!x && !y) { var r = alvo.getBoundingClientRect(); x = r.left + 12; y = r.bottom - 4; }
    mostrarMenu({
      x: x, y: y, alvo: null, aria: 'Opções de ' + titulo,
      cabeca: function (cabeca) {
        cabeca.insertAdjacentHTML('beforeend', ICONES[icone] || '');
        var n = document.createElement('span');
        n.className = 'ml-menu__cabeca-nome';
        n.textContent = titulo;
        cabeca.appendChild(n);
      },
      opcoes: opcoes
    });
    return true;
  }

  /* ---------- Menu da página ----------
     Botão direito num lugar "vazio" da página (sem texto selecionado):
     Voltar · Avançar · Recarregar · Copiar link · Imprimir · (Nova mensagem,
     Personalizar menu lateral). Mantêm o menu nativo do navegador:
       - links, imagens, vídeos e áudios (abrir link em nova aba, salvar imagem...);
       - campos de texto e áreas editáveis;
       - Shift + botão direito (atalho para o menu do navegador, ex.: Inspecionar). */
  function navegacaoPode(qual) { // qual = 'canGoBack' | 'canGoForward'
    try {
      if (window.navigation && qual in window.navigation) return !!window.navigation[qual];
    } catch (e) { /* ignora */ }
    return qual === 'canGoBack' ? history.length > 1 : true; // sem a API: "avançar" não dá para saber
  }

  function nomeDaPagina() {
    var ativo = document.querySelector('.inicio__sidebar .inicio__nav-item--active, ' +
      '.inicio__sidebar .inicio__shortcut--active, .inicio__sidebar .inicio__channel-item--active');
    return ativo ? nomeDe(ativo) : ((document.title || '').replace(/\s+[—-]\s+Intelbras$/, '') || 'Página');
  }

  // Devolve true se tratou o clique (e já deu preventDefault).
  function menuPagina(e) {
    if (e.shiftKey || !e.target || !e.target.closest) return false;
    if (emCampoEditavel(e.target)) return false;
    if (e.target.closest('a[href], img, video, audio, canvas, iframe, embed, object')) return false;

    var x = e.clientX, y = e.clientY;
    if (!x && !y) { // aberto pelo teclado: ancora no elemento em foco (ou no canto)
      var foco = document.activeElement;
      if (foco && foco !== document.body && foco.getBoundingClientRect) {
        var r = foco.getBoundingClientRect();
        x = r.left + 24; y = r.bottom - 6;
      } else { x = 16; y = 16; }
    }

    var temMenuLateral = !!document.querySelector('.inicio__sidebar');
    var opcoes = [
      { rotulo: 'Voltar', icone: 'voltar', atalho: 'Alt+←',
        desabilitado: !navegacaoPode('canGoBack'), acao: function () { history.back(); } },
      { rotulo: 'Avançar', icone: 'avancar', atalho: 'Alt+→',
        desabilitado: !navegacaoPode('canGoForward'), acao: function () { history.forward(); } },
      { rotulo: 'Recarregar', icone: 'recarregar', atalho: 'Ctrl+R', destaque: true,
        acao: function () { location.reload(); } },
      'sep',
      { rotulo: 'Copiar link da página', icone: 'link',
        acao: function () { copiarTexto(location.href, 'Link copiado'); } },
      { rotulo: 'Imprimir…', icone: 'imprimir', atalho: 'Ctrl+P',
        acao: function () { window.print(); } }
    ];
    if (temMenuLateral) {
      opcoes.push('sep');
      opcoes.push({ rotulo: 'Nova mensagem', icone: 'novo', atalho: 'Alt+Shift+N', acao: novaMensagem });
      opcoes.push({ rotulo: 'Personalizar menu lateral', icone: 'ajustes',
        acao: function () { abrirPersonalizar(null); } });
    }

    e.preventDefault();
    var nome = nomeDaPagina();
    mostrarMenu({
      x: x, y: y, alvo: null,
      aria: 'Opções da página ' + nome,
      cabeca: function (cabeca) {
        cabeca.insertAdjacentHTML('beforeend', ICONES.pagina);
        var n = document.createElement('span');
        n.className = 'ml-menu__cabeca-nome';
        n.textContent = nome;
        cabeca.appendChild(n);
      },
      opcoes: opcoes
    });
    return true;
  }

  /* ---------- API para outras telas ----------
     O Chat usa o mesmo menu (visual, animação, teclado e aviso) nas conversas:
       MenuContexto.mostrar({ x, y, aria, cabeca(el), opcoes, aoFechar })
     Cada opção: { rotulo, icone, atalho, destaque, perigo (vermelho), desabilitado, manterAberto, acao }
     ou 'sep' para separador. Ícones disponíveis: ver ICONES acima. */
  window.MenuContexto = {
    mostrar: mostrarMenu,
    fechar: function () { fecharMenu(false); },
    aberto: function () { return !!menuEl; },
    toast: toast,
    copiar: copiarTexto,
    icone: function (nome) { return ICONES[nome] || ''; },
    // Ajudantes para as telas (menu de linha / mensagem / produto):
    temSelecao: function () { // há texto selecionado? (então vale o menu de "Texto selecionado")
      var sl = window.getSelection && window.getSelection();
      return !!(sl && !sl.isCollapsed && sl.toString().trim());
    },
    posicao: function (e, el) { // onde abrir; pelo teclado (0,0) ancora no elemento
      var x = e.clientX, y = e.clientY;
      if (!x && !y) { var r = el.getBoundingClientRect(); x = r.left + 24; y = r.bottom - 6; }
      return { x: x, y: y };
    },
    cabeca: function (icone, titulo) { // topo do menu: ícone + título em maiúsculas
      return function (cabeca) {
        cabeca.insertAdjacentHTML('beforeend', ICONES[icone] || '');
        var n = document.createElement('span');
        n.className = 'ml-menu__cabeca-nome';
        n.textContent = titulo;
        cabeca.appendChild(n);
      };
    }
  };

  /* ---------- Eventos do menu ---------- */
  // Sem coordenadas (0,0) = aberto pelo teclado; qualquer clique/toque zera isso
  document.addEventListener('contextmenu', function (e) { origemTeclado = !e.clientX && !e.clientY; }, true);
  document.addEventListener('mousedown', function () { origemTeclado = false; }, true);
  document.addEventListener('touchstart', function () { origemTeclado = false; }, { capture: true, passive: true });

  document.addEventListener('contextmenu', function (e) {
    if (menuEl && menuEl.contains(e.target)) { e.preventDefault(); return; }
    if (e.defaultPrevented) return; // outra tela já abriu o seu menu (ex.: conversa do Chat)
    var item = e.target.closest && e.target.closest(SEL_ITEM);
    if (!item || !item.closest('.inicio__sidebar') || !grupoDe(item)) {
      if (menuSelecao(e)) return; // texto selecionado -> menu padronizado
      if (menuCabecalho(e)) return; // carrinho, chat, chamada, conta -> menu do cabeçalho
      if (menuPagina(e)) return;  // lugar vazio da página -> menu da página
      fecharMenu(false);
      return;
    }
    e.preventDefault();
    var x = e.clientX, y = e.clientY;
    if (!x && !y) { // aberto pelo teclado (tecla Menu / Shift+F10)
      var r = item.getBoundingClientRect();
      x = r.left + 24; y = r.bottom - 6;
    }
    abrirMenu(item, x, y);
  });

  document.addEventListener('mousedown', function (e) {
    if (menuEl && !menuEl.contains(e.target)) fecharMenu(false);
  }, true);

  document.addEventListener('keydown', function (e) {
    // Atalho global: Nova mensagem (abre o painel "Nova conversa" do Chat)
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyN' || e.key === 'N' || e.key === 'n')) {
      if (document.querySelector('.inicio__sidebar')) { e.preventDefault(); novaMensagem(); }
      return;
    }
    if (!menuEl) return;
    var lista = itensHabilitados();
    var i = lista.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); fecharMenu(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (lista[(i + 1) % lista.length] || lista[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (i === -1 ? lista[lista.length - 1] : lista[(i - 1 + lista.length) % lista.length] || lista[0]).focus(); }
    else if (e.key === 'Home') { e.preventDefault(); lista[0] && lista[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); lista.length && lista[lista.length - 1].focus(); }
    else if (e.key === 'Tab') { fecharMenu(true); }
  });

  window.addEventListener('scroll', function (e) {
    if (menuEl && !menuEl.contains(e.target)) fecharMenu(false);
  }, true);
  window.addEventListener('resize', function () { fecharMenu(false); });
  window.addEventListener('blur', function () { fecharMenu(false); });

  /* Toque longo (celular/iOS, que não dispara "contextmenu" em links) */
  (function () {
    var timer = null, bloquearClique = 0;
    document.addEventListener('touchstart', function (e) {
      var item = e.target.closest && e.target.closest(SEL_ITEM);
      if (!item || !item.closest('.inicio__sidebar') || !grupoDe(item) || e.touches.length !== 1) return;
      var t = e.touches[0];
      clearTimeout(timer);
      timer = setTimeout(function () {
        bloquearClique = Date.now();
        abrirMenu(item, t.clientX, t.clientY);
      }, 550);
    }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach(function (ev) {
      document.addEventListener(ev, function () { clearTimeout(timer); }, { passive: true });
    });
    document.addEventListener('click', function (e) {
      if (Date.now() - bloquearClique < 700 && e.target.closest && e.target.closest('.inicio__sidebar')) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  })();

  /* ---------- Personalizar menu lateral (modal) ---------- */
  var fundoEl = null, retornoFoco = null;

  function fecharPersonalizar() {
    if (!fundoEl) return;
    var el = fundoEl;
    fundoEl = null;
    document.removeEventListener('keydown', teclasModal, true);
    removerAnimado(el, 'ml-modal-fundo--saindo', 150);
    if (retornoFoco) { try { retornoFoco.focus({ preventScroll: true }); } catch (e) { /* ignora */ } }
  }

  function teclasModal(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecharPersonalizar(); return; }
    if (e.key !== 'Tab' || !fundoEl) return;
    var foc = fundoEl.querySelectorAll('button:not(:disabled)');
    if (!foc.length) return;
    var primeiro = foc[0], ultimo = foc[foc.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  }

  function desenharLinhas(corpo) {
    // guarda a posição das linhas atuais para animar a troca de grupo
    var antes = {}, rolagem = corpo.scrollTop;
    Array.prototype.forEach.call(corpo.querySelectorAll('.ml-modal__linha'), function (l) {
      antes[l.getAttribute('data-id')] = l.getBoundingClientRect().top;
    });

    corpo.innerHTML = '';
    NOMES_GRUPOS.forEach(function (g) {
      var itens = itensDoGrupo(g);
      if (!itens.length) return;
      var titulo = document.createElement('div');
      titulo.className = 'ml-modal__grupo';
      titulo.innerHTML = '<span></span><span class="ml-modal__grupo-qtd"></span>';
      titulo.firstChild.textContent = GRUPOS[g].titulo;
      titulo.lastChild.textContent = String(visiveis(g).length);
      corpo.appendChild(titulo);

      var qtdVis = visiveis(g).length;
      itens.forEach(function (item) {
        var fixado = !item.classList.contains('ml-oculto');
        var linha = document.createElement('div');
        linha.className = 'ml-modal__linha';
        linha.setAttribute('data-id', idDe(item));

        // ícone / bolinha de cor da categoria, dentro de um quadradinho
        var tile = document.createElement('span');
        tile.className = 'ml-modal__tile';
        var ico = item.querySelector('svg.inicio__icon');
        var dot = item.querySelector('.inicio__channel-dot');
        if (ico) {
          var c = ico.cloneNode(true);
          c.removeAttribute('class');
          tile.appendChild(c);
        } else if (dot) {
          var d = document.createElement('span');
          d.className = 'ml-modal__bolinha';
          d.style.background = dot.style.background || '#999';
          tile.appendChild(d);
        }
        linha.appendChild(tile);

        var nome = document.createElement('span');
        nome.className = 'ml-modal__nome';
        nome.textContent = nomeDe(item);
        linha.appendChild(nome);

        var chave = document.createElement('button');
        chave.type = 'button';
        chave.className = 'ml-chave';
        chave.setAttribute('role', 'switch');

        var trocavel = (g === 'nav' || g === 'atalhos') && podeTrocarGrupo(item);
        if (trocavel) {
          // chave ligada = fixado no menu principal; desligada = em Atalhos
          fixado = g === 'nav';
          chave.setAttribute('aria-checked', fixado ? 'true' : 'false');
          chave.setAttribute('aria-label', (fixado ? 'Desafixar ' : 'Fixar no menu ') + nomeDe(item));
          if (fixado && visiveis('nav').length <= 1) {
            chave.disabled = true;
            chave.title = 'Pelo menos um item precisa ficar no menu';
          }
        } else {
          chave.setAttribute('aria-checked', fixado ? 'true' : 'false');
          chave.setAttribute('aria-label', (fixado ? 'Desafixar ' : 'Fixar ') + nomeDe(item));
          if (fixado && qtdVis <= 1) {
            chave.disabled = true;
            chave.title = 'Pelo menos um item precisa ficar fixado';
          }
        }
        if (fixado) linha.classList.add('ml-modal__linha--fixado');

        chave.addEventListener('click', function () {
          flip(function () {
            if (trocavel) {
              trocarGrupo(item, g === 'nav' ? 'atalhos' : 'nav');
              salvarGrupo(item);
            } else {
              definirOculto(item, fixado);
            }
            atualizarSecoes();
          });
          desenharLinhas(corpo);
          // mantém o foco na mesma linha após redesenhar
          var nova = corpo.querySelector('.ml-modal__linha[data-id="' + idDe(item).replace(/"/g, '\\"') + '"] .ml-chave');
          if (nova) nova.focus({ preventScroll: true });
        });
        linha.appendChild(chave);
        corpo.appendChild(linha);
      });
    });

    corpo.scrollTop = rolagem;

    // anima as linhas que mudaram de lugar (ex.: foi de MENU para ATALHOS)
    if (!reduzir()) {
      Array.prototype.forEach.call(corpo.querySelectorAll('.ml-modal__linha'), function (l) {
        var id = l.getAttribute('data-id');
        if (!(id in antes) || !l.animate) return;
        var dy = antes[id] - l.getBoundingClientRect().top;
        if (Math.abs(dy) < 1) return;
        l.animate(
          [{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }],
          { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
        );
      });
    }
  }

  function restaurarPadrao() {
    flip(function () {
      todosItens().forEach(function (el) {
        var nativo = NATIVO[idDe(el)];
        if (nativo && grupoDe(el) !== nativo && CONT[nativo]) trocarGrupo(el, nativo, null);
      });
      NOMES_GRUPOS.forEach(function (g) {
        if (ORIGEM[g]) reordenar(g, ORIGEM[g]);
        itensDoGrupo(g).forEach(function (el) { el.classList.remove('ml-oculto'); });
      });
      gravarPrefs({ ordem: {}, ocultos: [], grupos: {} });
      atualizarSecoes();
    });
  }

  function abrirPersonalizar(origem) {
    if (fundoEl) return;
    retornoFoco = origem || null;

    fundoEl = document.createElement('div');
    fundoEl.className = 'ml-modal-fundo';
    fundoEl.innerHTML =
      '<div class="ml-modal" role="dialog" aria-modal="true" aria-labelledby="mlModalTitulo">' +
        '<div class="ml-modal__topo">' +
          '<h2 class="ml-modal__titulo" id="mlModalTitulo">Personalizar menu lateral</h2>' +
          '<p class="ml-modal__sub">Ligado fica no menu; desligado vai para Atalhos. Para reordenar, clique com o botão direito no item.</p>' +
        '</div>' +
        '<div class="ml-modal__corpo"></div>' +
        '<div class="ml-modal__rodape">' +
          '<button type="button" class="ml-btn ml-btn--outline" data-ml="restaurar">Restaurar padrão</button>' +
          '<button type="button" class="ml-btn ml-btn--primario" data-ml="concluir">Concluir</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(fundoEl);

    var corpo = fundoEl.querySelector('.ml-modal__corpo');
    desenharLinhas(corpo);

    fundoEl.addEventListener('mousedown', function (e) { if (e.target === fundoEl) fecharPersonalizar(); });
    fundoEl.querySelector('[data-ml="concluir"]').addEventListener('click', fecharPersonalizar);
    fundoEl.querySelector('[data-ml="restaurar"]').addEventListener('click', function () {
      restaurarPadrao();
      desenharLinhas(corpo);
      toast('Menu lateral restaurado ao padrão');
    });
    document.addEventListener('keydown', teclasModal, true);

    var foco = fundoEl.querySelector('.ml-chave:not(:disabled)') || fundoEl.querySelector('[data-ml="concluir"]');
    foco.focus();
  }

  /* ---------- Início ---------- */
  function iniciar() {
    if (!document.querySelector('.inicio__sidebar')) return; // sem menu lateral (visitante)
    NOMES_GRUPOS.forEach(function (g) {
      ORIGEM[g] = itensDoGrupo(g).map(idDe);
      itensDoGrupo(g).forEach(function (el) { NATIVO[idDe(el)] = g; });
    });
    CONT.nav = document.querySelector('.inicio__sidebar .inicio__nav');
    var primeiroAtalho = document.querySelector('.inicio__sidebar .inicio__shortcut');
    CONT.atalhos = primeiroAtalho ? primeiroAtalho.parentNode : null;
    aplicarPrefs();

    try {
      var u = new URL(location.href);
      if (u.searchParams.get('pagina') === 'chat' && u.searchParams.get('novo') === '1') {
        setTimeout(function () {
          u.searchParams.delete('novo');
          history.replaceState(null, '', u.pathname + u.search + u.hash);
        }, 600);
      }
    } catch (e) { /* ignora */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
