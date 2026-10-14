// ============================================================
// CONTEÚDO — Unidade (área CADASTRADO)
// Página "Minha Unidade":
//  - botão "Recolher" do menu lateral (mesmo comportamento das demais páginas)
//  - botão "Copiar endereço" (tile Endereço)
//  - selo "Aberto agora / Fechado agora" (tile Horário)
//  - mapa interativo da Localização (MapLibre + OpenFreeMap; quadro em branco até carregar)
// ============================================================
(function () {
  const btnRecolher = document.getElementById('btnRecolher');

  function fecharMenu() {
    document.body.classList.remove('sidebar-open');
  }

  if (btnRecolher) btnRecolher.addEventListener('click', fecharMenu);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharMenu();
  });

  // ---------- Copiar endereço ----------
  function copiarTexto(texto) {
    // Em http fora de localhost o navegador bloqueia navigator.clipboard;
    // nesse caso cai no método antigo (textarea + execCommand).
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto);
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy'));
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  document.querySelectorAll('[data-copiar]').forEach((btn) => {
    const rotulo = btn.querySelector('[data-copiar-texto]');
    const textoOriginal = rotulo ? rotulo.textContent : '';
    let timer = null;

    btn.addEventListener('click', () => {
      copiarTexto(btn.getAttribute('data-copiar')).then(() => {
        btn.classList.add('unidade__btn--copiado');
        if (rotulo) rotulo.textContent = 'Endereço copiado!';
      }).catch(() => {
        if (rotulo) rotulo.textContent = 'Não foi possível copiar';
      }).then(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          btn.classList.remove('unidade__btn--copiado');
          if (rotulo) rotulo.textContent = textoOriginal;
        }, 2000);
      });
    });
  });

  // ---------- Selo "Aberto agora" ----------
  // Usa o horário de Brasília (a unidade fica em São Paulo), não o do
  // computador de quem está vendo a página.
  const selo = document.getElementById('unidadeStatusHorario');

  function agoraEmSaoPaulo() {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const pega = (tipo) => partes.find((p) => p.type === tipo).value;
    const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      dia: dias[pega('weekday')],
      minutos: parseInt(pega('hour'), 10) * 60 + parseInt(pega('minute'), 10),
    };
  }

  function paraMinutos(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  function atualizarSelo() {
    if (!selo) return;
    const dias = selo.dataset.dias.split(',').map(Number);
    const abre = paraMinutos(selo.dataset.abre);
    const fecha = paraMinutos(selo.dataset.fecha);
    const agora = agoraEmSaoPaulo();
    const aberto = dias.includes(agora.dia) && agora.minutos >= abre && agora.minutos < fecha;

    selo.classList.toggle('unidade__status--inativa', !aberto);
    selo.querySelector('[data-status-texto]').textContent = aberto ? 'Aberto agora' : 'Fechado agora';
    selo.hidden = false;
  }

  if (selo) {
    try {
      atualizarSelo();
      setInterval(atualizarSelo, 60000);
    } catch (err) {
      selo.hidden = true;  // sem Intl/fuso disponível: melhor não mostrar nada
    }
  }
})();

// ---------- Mapa interativo (Localização) ----------
// O quadro fica em branco (cor neutra) até o mapa carregar; então o mapa
// aparece com um fade. Se o MapLibre ou o mapa não carregarem (sem internet,
// bloqueio), o quadro segue em branco com o aviso "Mapa indisponível".
(function () {
  const caixa = document.getElementById('unidadeMapa');
  if (!caixa) return;

  function falha() {
    caixa.hidden = true;
    if (caixa.parentElement) caixa.parentElement.classList.add('unidade__mapa-box--falhou');
  }

  const PIN = '<svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<path d="M20 1C9.5 1 1 9.4 1 19.8 1 33 20 51 20 51s19-18 19-31.2C39 9.4 30.5 1 20 1z" fill="#00A859" stroke="#007A40" stroke-width="1.5"/>'
    + '<circle cx="20" cy="19.5" r="7.5" fill="#007A40"/><circle cx="20" cy="19.5" r="4" fill="#fff"/></svg>';

  // Localiza o endereço exato (Nominatim/OpenStreetMap) quando não há
  // coordenadas no banco. Resultado fica em sessionStorage; falha = ponto aproximado.
  function localizar(endereco) {
    const chave = 'unidadeMapaCoord:' + endereco;
    try {
      const salvo = JSON.parse(sessionStorage.getItem(chave) || 'null');
      if (salvo) return Promise.resolve(salvo);
    } catch (e) { /* sem sessionStorage */ }

    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=' + encodeURIComponent(endereco);
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), 2500);
    return fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
      .then((r) => (r.ok ? r.json() : []))
      .then((lista) => {
        const r = lista && lista[0];
        const pos = r ? [parseFloat(r.lat), parseFloat(r.lon)] : null;
        if (pos && isFinite(pos[0]) && isFinite(pos[1])) {
          try { sessionStorage.setItem(chave, JSON.stringify(pos)); } catch (e) { /* ok */ }
          return pos;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => clearTimeout(timer));
  }

  // Estilo do mapa conforme o tema do site (assets/js/tema.js)
  function estiloMapa() {
    const escuro = window.IBTema && window.IBTema.efetivo() === 'escuro';
    return 'https://tiles.openfreemap.org/styles/' + (escuro ? 'dark' : 'positron');
  }

  function montar(pos) {
    if (!window.maplibregl) { falha(); return; }
    caixa.style.opacity = '0';   // invisível (quadro em branco) até o mapa carregar
    caixa.hidden = false;

    let mapa;
    try {
      mapa = new maplibregl.Map({
        container: caixa,
        style: estiloMapa(),                                      // positron (claro) | dark (escuro), sem chave
        center: [pos[1], pos[0]],                                 // MapLibre usa [lng, lat]
        zoom: 15.6,
        attributionControl: false,
        cooperativeGestures: false,
      });
    } catch (err) {
      falha();
      return;
    }

    mapa.scrollZoom.disable();   // não "sequestra" a rolagem da página
    mapa.dragRotate.disable();
    mapa.touchZoomRotate.disableRotation();
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    mapa.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');

    const pino = document.createElement('div');
    pino.className = 'unidade__pin';
    pino.innerHTML = PIN;
    new maplibregl.Marker({ element: pino, anchor: 'bottom' }).setLngLat([pos[1], pos[0]]).addTo(mapa);

    // Trocou o tema com a página aberta (ex.: Automático e o sistema mudou)
    document.addEventListener('ib:tema', () => { try { mapa.setStyle(estiloMapa()); } catch (e) { /* ok */ } });

    let carregou = false;
    mapa.once('load', () => {
      carregou = true;
      caixa.style.opacity = '';
      mapa.resize();
    });
    // Se nada carregar (sem internet / bloqueio), mostra o aviso no quadro em branco.
    setTimeout(() => { if (!carregou) falha(); }, 8000);

    // Acompanha mudanças de largura (ex.: menu lateral abrindo/fechando).
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => mapa.resize()).observe(caixa);
    }
  }

  function iniciar() {
    if (!window.maplibregl) { falha(); return; }   // MapLibre não carregou
    const base = [parseFloat(caixa.dataset.lat), parseFloat(caixa.dataset.lng)];
    if (caixa.dataset.exato === '1') { montar(base); return; }
    localizar(caixa.dataset.endereco || '').then((pos) => montar(pos || base));
  }

  if (document.readyState === 'complete') iniciar();
  else window.addEventListener('load', iniciar);
})();

// ------------------------------------------------------------
// Botão direito nos cartões da página (menu padronizado do site,
// assets/js/menu-contexto.js): endereço, telefone, horário, responsável,
// mapa e avisos. Shift + botão direito abre o menu do navegador.
// ------------------------------------------------------------
(function () {
  const raiz = document.querySelector('.unidade__main');
  if (!raiz) return;

  const limpo = (n) => ((n && n.innerText ? n.innerText : (n && n.textContent) || '')).replace(/\s*\n\s*/g, ', ').replace(/\s+/g, ' ').trim();

  raiz.addEventListener('contextmenu', (e) => {
    const M = window.MenuContexto;
    if (!M || e.shiftKey || M.temSelecao()) return;
    const mapaLink = raiz.querySelector('.unidade__mapa-link');
    const abrirMapa = mapaLink ? { rotulo: 'Abrir no mapa', icone: 'abrir', acao: () => window.open(mapaLink.href, '_blank', 'noopener') } : null;
    let alvo = null, titulo = '', icone = 'pagina', opcoes = [];

    const tile = e.target.closest('.unidade__tile');
    const mapa = e.target.closest('.unidade__mapa');
    const aviso = e.target.closest('.unidade__aviso');
    if (tile) {
      alvo = tile;
      const rotulo = limpo(tile.querySelector('.unidade__tile-label'));
      const valorEl = tile.querySelector('.unidade__tile-valor');
      const valor = limpo(valorEl);
      const botCopiar = tile.querySelector('[data-copiar]');
      const fone = tile.querySelector('a[href^="tel:"]');
      titulo = rotulo || 'Unidade';
      if (fone) {
        icone = 'telefone';
        opcoes.push({ rotulo: 'Ligar', icone: 'telefone', destaque: true, acao: () => { location.href = fone.href; } });
      }
      if (/^endere/i.test(rotulo)) {
        icone = 'abrir';
        const txt = botCopiar ? botCopiar.getAttribute('data-copiar') : valor;
        opcoes.push({ rotulo: 'Copiar endereço', icone: 'copiar', destaque: !fone, acao: () => M.copiar(txt, 'Endereço copiado') });
        if (abrirMapa) opcoes.push(abrirMapa);
      } else if (valor && !(valorEl && valorEl.classList.contains('unidade__tile-valor--vazio'))) {
        const quem = /^respons/i.test(rotulo) ? 'Copiar nome do responsável' : 'Copiar ' + rotulo.toLowerCase();
        if (/^respons/i.test(rotulo)) icone = 'pessoa';
        if (/^hor/i.test(rotulo)) icone = 'agenda';
        opcoes.push({ rotulo: quem, icone: 'copiar', destaque: !fone, acao: () => M.copiar(valor, 'Copiado') });
      }
    } else if (mapa) {
      alvo = mapa; titulo = 'Localização'; icone = 'abrir';
      if (abrirMapa) opcoes.push(Object.assign({ destaque: true }, abrirMapa));
      const end = raiz.querySelector('[data-copiar]');
      if (end) opcoes.push({ rotulo: 'Copiar endereço', icone: 'copiar', acao: () => M.copiar(end.getAttribute('data-copiar'), 'Endereço copiado') });
    } else if (aviso) {
      alvo = aviso; icone = 'mensagem';
      titulo = limpo(aviso.querySelector('.unidade__aviso-titulo')).replace(/Importante$/, '').trim() || 'Aviso';
      const texto = titulo + '\n' + limpo(aviso.querySelector('.unidade__aviso-texto'));
      opcoes.push({ rotulo: 'Copiar aviso', icone: 'copiar', destaque: true, acao: () => M.copiar(texto, 'Aviso copiado') });
    }
    if (!alvo || !opcoes.length) return;
    if (e.target.closest('a[href]') && !tile && !mapa) return;
    e.preventDefault();
    const pos = M.posicao(e, alvo);
    M.mostrar({ x: pos.x, y: pos.y, alvo: null, aria: 'Opções de ' + titulo, cabeca: M.cabeca(icone, titulo), opcoes: opcoes });
  });
})();
