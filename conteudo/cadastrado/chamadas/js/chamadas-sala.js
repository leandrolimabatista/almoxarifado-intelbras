// ============================================================
// CONTEÚDO — Chamadas (área CADASTRADO) — sala de chamada
//
// Áudio/vídeo entre navegadores via WebRTC (malha: cada participante
// conecta direto aos outros; nada passa pelo servidor). A
// sinalização (offer/answer/ice) e o chat usam api/chamadas/* e
// chegam pelo polling do chamadas.js (Chamadas.sala.processar).
//
// Requer HTTPS (ou localhost) para câmera/microfone.
// Servidores STUN/TURN são opcionais: defina window.CHAMADAS_ICE
// (lista de RTCIceServer) antes deste script se a rede precisar.
// ============================================================
(function () {
  'use strict';

  const C = window.Chamadas;
  if (!C) return;

  const $ = (id) => document.getElementById(id);
  const esc = C.esc;
  const ic = C.ic;
  const POR_PAGINA = 9;

  let S = null; // sessão da chamada em andamento

  // ------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------
  function fmtTempo(seg) {
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    const s = seg % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  function setIcone(id, nome) {
    const el = $(id);
    if (el) el.querySelector('[data-ic]').innerHTML = ic(nome);
  }

  function nomeDe(id) {
    const info = S && S.chamada.participantes.find((x) => x.id === id);
    return info ? info.nome : 'Participante';
  }

  /** Aviso rápido dentro da sala (mão levantada, etc.). */
  function salaToast(msg, icone) {
    if (!S) return;
    const box = $('salaToasts');
    const t = document.createElement('div');
    t.className = 'sala__toast';
    t.setAttribute('role', 'status');
    if (icone) t.insertAdjacentHTML('afterbegin', ic(icone));
    const tx = document.createElement('span');
    tx.textContent = msg;
    t.appendChild(tx);
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { t.classList.add('sala__toast--saindo'); setTimeout(() => t.remove(), 320); }, 3500);
  }

  /** Quem está com a mão levantada, na ordem em que levantou (fila). */
  function maosLevantadas() {
    const l = [];
    if (S.mao) l.push({ id: S.eu.id, nome: 'Você', em: S.maoEm || 0 });
    S.peers.forEach((p) => { if (p.estado.mao) l.push({ id: p.id, nome: C.primeiroNome(nomeDe(p.id)), em: p.maoEm || 0 }); });
    return l.sort((a, b) => a.em - b.em);
  }

  function renderMaos() {
    const b = $('salaMaos');
    if (!S) return;
    const l = maosLevantadas();
    b.hidden = !l.length;
    if (l.length) {
      b.innerHTML = ic('hand') + '<span>' + l.length + (l.length === 1 ? ' mão levantada: ' : ' mãos levantadas: ') + esc(l.map((x) => x.nome).join(', ')) + '</span>';
    }
  }

  // ------------------------------------------------------------
  // Mídia local
  // ------------------------------------------------------------
  async function obterMidia(comVideo) {
    const r = { audio: null, video: null, erro: null };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      r.erro = 'inseguro';
      return r;
    }
    const classificar = (e) => (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'negada' : e && e.name === 'NotFoundError' ? 'sem_dispositivo' : 'falha');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: comVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false });
      r.audio = s.getAudioTracks()[0] || null;
      r.video = s.getVideoTracks()[0] || null;
      return r;
    } catch (e1) {
      if (comVideo) {
        // câmera indisponível: tenta só o microfone
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
          r.audio = s.getAudioTracks()[0] || null;
          r.erro = 'camera_' + classificar(e1);
          return r;
        } catch (e2) { r.erro = classificar(e2); return r; }
      }
      r.erro = classificar(e1);
      return r;
    }
  }

  function avisoPermissao(erro) {
    const tentar = { rotulo: 'Tentar novamente', tipo: 'primario', acao: () => religarMidia() };
    const seguir = { rotulo: 'Continuar sem mídia', tipo: 'secundario' };
    if (erro === 'inseguro') {
      C.aviso('lock', 'Câmera e microfone indisponíveis', 'Para usar câmera e microfone, abra a plataforma em uma conexão segura (HTTPS).', [seguir]);
    } else if (erro === 'sem_dispositivo' || erro === 'camera_sem_dispositivo') {
      C.aviso('camera-off', 'Nenhum dispositivo encontrado', 'Não encontramos câmera ou microfone neste computador. Você pode ouvir e conversar pelo chat.', [tentar, seguir]);
    } else if (erro === 'negada' || erro === 'camera_negada') {
      C.aviso('camera-off', erro === 'negada' ? 'Permissão de câmera e microfone negada' : 'Permissão de câmera negada',
        'Libere o acesso no ícone de cadeado da barra de endereços do navegador e clique em “Tentar novamente”.', [tentar, seguir]);
    } else {
      C.aviso('alert', 'Não foi possível acessar câmera/microfone', 'Verifique se outro programa está usando os dispositivos e tente de novo.', [tentar, seguir]);
    }
  }

  async function religarMidia() {
    if (!S) return;
    const r = await obterMidia(S.midia === 'video');
    if (r.audio && !S.local.audio) { S.local.audio = r.audio; S.mic = !S.mudoInicial; r.audio.enabled = S.mic; }
    if (r.video && !S.local.video) { S.local.video = r.video; S.cam = true; }
    S.peers.forEach((p) => aplicarTrilhas(p));
    if (r.erro) avisoPermissao(r.erro);
    enviarEstado();
    atualizarControles();
    renderGrade();
    iniciarAnalise('eu', S.local.audio);
  }

  // ------------------------------------------------------------
  // Peers (malha WebRTC)
  // ------------------------------------------------------------
  function videoAtual() { return S.tela && S.local.tela ? S.local.tela : S.local.video; }

  function aplicarTrilhas(p) {
    if (p.sAudio) p.sAudio.replaceTrack(S.local.audio || null).catch(() => {});
    if (p.sVideo) p.sVideo.replaceTrack(videoAtual() || null).catch(() => {});
  }

  function criarPeer(id) {
    if (S.peers.has(id)) return S.peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: window.CHAMADAS_ICE || [] });
    const p = {
      id: id, pc: pc, stream: new MediaStream(), pend: [], remota: false,
      ofereco: S.eu.id < id, conn: 'novo',
      estado: { mic: true, video: false, mao: false, tela: false },
      dc: null, audioEl: null,
    };
    const ta = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const tv = pc.addTransceiver('video', { direction: 'sendrecv' });
    p.sAudio = ta.sender; p.sVideo = tv.sender;
    aplicarTrilhas(p);

    // canal de dados negociado: estado de microfone/câmera/mão levantada
    p.dc = pc.createDataChannel('estado', { negotiated: true, id: 0 });
    p.dc.onopen = () => enviarEstado();
    p.dc.onmessage = (e) => {
      try {
        const tinha = !!p.estado.mao;
        p.estado = Object.assign(p.estado, JSON.parse(e.data));
        if (p.estado.mao && !tinha) { p.maoEm = Date.now(); salaToast(nomeDe(id) + ' levantou a mão', 'hand'); }
        else if (!p.estado.mao && tinha) { p.maoEm = 0; }
        renderGrade(); renderParticipantes();
      } catch (x) { /* ignora */ }
    };

    pc.ontrack = (e) => {
      if (!p.stream.getTracks().includes(e.track)) p.stream.addTrack(e.track);
      e.track.onmute = () => renderGrade();
      e.track.onunmute = () => renderGrade();
      if (!p.audioEl) {
        p.audioEl = document.createElement('audio');
        p.audioEl.autoplay = true;
        $('salaAudios').appendChild(p.audioEl);
      }
      p.audioEl.srcObject = p.stream;
      if (e.track.kind === 'audio') iniciarAnalise(id, e.track);
      renderGrade();
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) enviarSinal(id, 'ice', JSON.stringify(e.candidate));
    };

    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      p.conn = st === 'connected' || st === 'completed' ? 'ok' : st === 'disconnected' ? 'instavel' : st === 'failed' ? 'falhou' : 'conectando';
      if (p.conn === 'falhou' && !p.reiniciando) reiniciarPeer(id);
      atualizarEstadoGeral();
      renderGrade();
    };

    S.peers.set(id, p);
    if (p.ofereco) oferecer(p);
    atualizarEstadoGeral();
    return p;
  }

  async function oferecer(p) {
    try {
      const o = await p.pc.createOffer();
      await p.pc.setLocalDescription(o);
      enviarSinal(p.id, 'offer', JSON.stringify(p.pc.localDescription));
    } catch (e) { console.error('offer', e); }
  }

  function fecharPeer(id) {
    const p = S.peers.get(id);
    if (!p) return;
    try { p.pc.close(); } catch (e) { /* já fechado */ }
    if (p.audioEl) p.audioEl.remove();
    S.peers.delete(id);
    if (S.analises[id]) { S.analises[id].fechar(); delete S.analises[id]; }
  }

  function reiniciarPeer(id) {
    const p = S.peers.get(id);
    if (!p) return;
    p.reiniciando = true;
    fecharPeer(id);
    setTimeout(() => { if (S && !S.encerrando) sincronizarPeers(S.chamada.participantes); }, 800);
  }

  function enviarSinal(paraId, tipo, payload) {
    if (!S) return;
    C.api('sinal.php', { corpo: { chamada_id: S.chamada.id, para_id: paraId, tipo: tipo, payload: payload } });
  }

  async function processarSinal(s) {
    let p = S.peers.get(s.de_id);
    // nova oferta sobre uma conexão já estabelecida = o outro lado reentrou: recomeça limpo
    if (s.tipo === 'offer' && p && p.remota) { fecharPeer(s.de_id); p = null; }
    if (!p) p = criarPeer(s.de_id);
    let d;
    try { d = JSON.parse(s.payload); } catch (e) { return; }
    try {
      if (s.tipo === 'offer') {
        await p.pc.setRemoteDescription(d);
        p.remota = true;
        while (p.pend.length) await p.pc.addIceCandidate(p.pend.shift()).catch(() => {});
        const a = await p.pc.createAnswer();
        await p.pc.setLocalDescription(a);
        enviarSinal(p.id, 'answer', JSON.stringify(p.pc.localDescription));
      } else if (s.tipo === 'answer') {
        if (p.pc.signalingState === 'have-local-offer') {
          await p.pc.setRemoteDescription(d);
          p.remota = true;
          while (p.pend.length) await p.pc.addIceCandidate(p.pend.shift()).catch(() => {});
        }
      } else if (s.tipo === 'ice') {
        if (p.remota) await p.pc.addIceCandidate(d).catch(() => {});
        else p.pend.push(d);
      }
    } catch (e) { console.error('sinal', s.tipo, e); }
  }

  function sincronizarPeers(parts) {
    const ids = parts.filter((x) => x.estado === 'na_chamada' && x.id !== S.eu.id).map((x) => x.id);
    ids.forEach((id) => criarPeer(id));
    Array.from(S.peers.keys()).forEach((id) => { if (!ids.includes(id)) fecharPeer(id); });
  }

  function enviarEstado() {
    if (!S) return;
    const msg = JSON.stringify({ mic: !!(S.local.audio && S.mic), video: !!videoAtual(), mao: S.mao, tela: S.tela });
    S.peers.forEach((p) => { if (p.dc && p.dc.readyState === 'open') p.dc.send(msg); });
  }

  // ------------------------------------------------------------
  // Detecção de quem está falando
  // ------------------------------------------------------------
  function iniciarAnalise(chave, trilha) {
    if (!S || !trilha) return;
    if (S.analises[chave]) S.analises[chave].fechar();
    try {
      S.ctx = S.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (S.ctx.state === 'suspended') S.ctx.resume();
      const src = S.ctx.createMediaStreamSource(new MediaStream([trilha]));
      const an = S.ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      S.analises[chave] = {
        nivel: function () {
          an.getByteTimeDomainData(buf);
          let soma = 0;
          for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; soma += v * v; }
          return Math.sqrt(soma / buf.length);
        },
        fechar: function () { try { src.disconnect(); } catch (e) { /* ok */ } },
      };
    } catch (e) { /* sem WebAudio: só não destaca quem fala */ }
  }

  function atualizarFalando() {
    if (!S) return;
    const agora = Date.now();
    Object.keys(S.analises).forEach((k) => {
      const ehEu = k === 'eu';
      if (ehEu && !(S.mic && S.local.audio)) { S.falando[k] = 0; return; }
      if (S.analises[k].nivel() > 0.03) S.falando[k] = agora;
    });
    document.querySelectorAll('.sala__tile').forEach((t) => {
      const k = t.getAttribute('data-k');
      t.classList.toggle('sala__tile--falando', agora - (S.falando[k] || 0) < 700);
    });
  }

  // ------------------------------------------------------------
  // Interface: grade, participantes, estado
  // ------------------------------------------------------------
  function listaTiles() {
    const eu = { k: 'eu', id: S.eu.id, nome: S.eu.nome + ' (você)', inicial: S.eu.inicial, eu: true };
    const outros = [];
    S.peers.forEach((p) => {
      const info = S.chamada.participantes.find((x) => x.id === p.id) || { nome: 'Participante', inicial: '?' };
      outros.push({ k: String(p.id), id: p.id, nome: info.nome, inicial: info.inicial, p: p });
    });
    outros.sort((a, b) => a.nome.localeCompare(b.nome));
    return [eu].concat(outros);
  }

  function renderGrade() {
    if (!S) return;
    const tiles = listaTiles();
    const paginas = Math.max(1, Math.ceil(tiles.length / POR_PAGINA));
    if (S.pagina >= paginas) S.pagina = paginas - 1;
    const vis = tiles.slice(S.pagina * POR_PAGINA, S.pagina * POR_PAGINA + POR_PAGINA);
    const g = $('salaGrade');
    const n = vis.length;
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
    g.style.setProperty('--cols', cols);
    g.setAttribute('data-qtd', String(n));

    const chaves = vis.map((t) => t.k);
    Array.from(g.children).forEach((el) => { if (!chaves.includes(el.getAttribute('data-k'))) el.remove(); });

    vis.forEach((t, i) => {
      let el = g.querySelector('.sala__tile[data-k="' + t.k + '"]');
      if (!el) {
        el = document.createElement('div');
        el.className = 'sala__tile';
        el.setAttribute('data-k', t.k);
        el.innerHTML = '<video class="sala__video" autoplay playsinline muted></video>' +
          '<div class="sala__avatar-tile"><span></span></div>' +
          '<div class="sala__tile-rodape"><span class="sala__tile-mic"></span><span class="sala__tile-nome"></span><span class="sala__tile-mao"></span></div>' +
          '<div class="sala__tile-status"></div>';
        g.appendChild(el);
      }
      if (g.children[i] !== el) g.insertBefore(el, g.children[i] || null);

      const v = el.querySelector('video');
      let temVideo, mic, mao, tela = false, status = '';
      if (t.eu) {
        const vt = videoAtual();
        temVideo = !!vt;
        tela = S.tela;
        mic = !!(S.local.audio && S.mic);
        mao = S.mao;
        if (temVideo) {
          if (v.__trilha !== vt) { v.srcObject = new MediaStream([vt]); v.__trilha = vt; }
        }
        v.classList.toggle('sala__video--espelho', !tela);
      } else {
        const p = t.p;
        const vt = p.stream.getVideoTracks()[0];
        temVideo = !!(p.estado.video && vt && !vt.muted);
        tela = !!p.estado.tela;
        mic = p.estado.mic !== false;
        mao = !!p.estado.mao;
        if (temVideo && v.__stream !== p.stream) { v.srcObject = new MediaStream([vt]); v.__stream = p.stream; v.__trilha = vt; }
        if (temVideo && v.__trilha !== vt) { v.srcObject = new MediaStream([vt]); v.__trilha = vt; }
        status = p.conn === 'instavel' ? 'Conexão instável' : p.conn === 'falhou' ? 'Reconectando…' : p.conn === 'conectando' || p.conn === 'novo' ? 'Conectando…' : '';
        v.classList.remove('sala__video--espelho');
      }
      el.classList.toggle('sala__tile--sem-video', !temVideo);
      el.classList.toggle('sala__tile--tela', tela && temVideo);
      el.querySelector('.sala__avatar-tile span').textContent = t.inicial;
      el.querySelector('.sala__tile-nome').textContent = t.nome + (tela ? ' — compartilhando a tela' : '');
      el.querySelector('.sala__tile-mic').innerHTML = mic ? '' : ic('mic-off', 'sala__ic-off');
      el.classList.toggle('sala__tile--mao', !!mao);
      el.querySelector('.sala__tile-mao').innerHTML = mao ? ic('hand', 'sala__ic-mao') + '<span>Mão levantada</span>' : '';
      const st = el.querySelector('.sala__tile-status');
      st.textContent = status;
      st.hidden = !status;
      el.setAttribute('aria-label', t.nome + (mic ? '' : ', microfone desligado') + (mao ? ', mão levantada' : ''));
    });

    renderMaos();
    $('salaPager').hidden = paginas <= 1;
    $('salaPagInfo').textContent = (S.pagina + 1) + ' / ' + paginas;
    $('salaPagAnt').disabled = S.pagina === 0;
    $('salaPagProx').disabled = S.pagina >= paginas - 1;
  }

  function renderParticipantes() {
    if (!S) return;
    const rot = { na_chamada: 'Na chamada', tocando: 'Chamando…', convidado: 'Convidado', recusou: 'Recusou', saiu: 'Saiu', perdeu: 'Não atendeu' };
    const fila = {};
    maosLevantadas().forEach((x, i) => { fila[x.id] = i + 1; });
    const parts = S.chamada.participantes.slice().sort((a, b) =>
      (fila[a.id] ? fila[a.id] : 999) - (fila[b.id] ? fila[b.id] : 999) ||
      (b.estado === 'na_chamada') - (a.estado === 'na_chamada') || a.nome.localeCompare(b.nome));
    $('abaPartN').textContent = String(parts.filter((x) => x.estado === 'na_chamada').length);
    $('salaParts').innerHTML = parts.map((x) => {
      const eu = x.id === S.eu.id;
      const n = fila[x.id];
      return '<li class="sala__part' + (x.estado === 'na_chamada' ? '' : ' sala__part--off') + (n ? ' sala__part--mao' : '') + '"><span class="chamadas__avatar chamadas__avatar--pequeno" aria-hidden="true">' + esc(x.inicial) + '</span>' +
        '<span class="sala__part-info"><strong>' + esc(x.nome) + (eu ? ' (você)' : '') + '</strong><span>' + esc(x.cargo_nome) + ' · ' + rot[x.estado] + '</span></span>' +
        (n ? '<span class="sala__part-fila" title="Posição na fila de mãos levantadas">' + ic('hand') + ' ' + n + '</span>' : '') +
        (n && eu ? '<button type="button" class="sala__part-baixar" data-baixar="1">Baixar</button>' : '') + '</li>';
    }).join('');
    renderMaos();
  }

  function atualizarEstadoGeral() {
    if (!S) return;
    const el = $('salaEstado');
    let msg = '', tipo = 'info';
    const peers = Array.from(S.peers.values());
    const alguemOk = peers.some((p) => p.conn === 'ok');
    const noAr = S.chamada.participantes.filter((x) => x.estado === 'na_chamada').length;

    if (!S.servidorOk) { msg = 'Conexão instável com a plataforma. Tentando reconectar…'; tipo = 'aviso'; }
    else if (peers.some((p) => p.conn === 'instavel' || p.conn === 'falhou')) { msg = 'Conexão instável. Sua chamada pode falhar ou ficar com atraso.'; tipo = 'aviso'; }
    else if (S.chamada.status === 'tocando' && noAr <= 1) {
      const alvo = S.chamada.participantes.find((x) => x.id !== S.eu.id);
      msg = 'Chamando ' + (alvo ? alvo.nome : '') + '…'; tipo = 'info';
    } else if (noAr <= 1 && S.chamada.tipo === 'equipe') { msg = 'Aguardando outros participantes entrarem…'; }
    else if (peers.length && !alguemOk) { msg = 'Conectando…'; }
    else if (S.tela) { msg = 'Você está compartilhando a sua tela.'; tipo = 'ok'; }

    if (alguemOk && !S.conectouUmaVez) { S.conectouUmaVez = true; }
    el.hidden = !msg;
    el.textContent = msg;
    el.className = 'sala__estado sala__estado--' + tipo;
  }

  function atualizarControles() {
    if (!S) return;
    const micOn = !!(S.local.audio && S.mic);
    const camOn = !!S.local.video;
    const set = (id, on, icOn, icOff, rotOn, rotOff, rotId) => {
      const b = $(id);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('sala__ctl--off', !on);
      b.querySelector('[data-ic]').innerHTML = ic(on ? icOn : icOff);
    };
    set('ctlMic', micOn, 'mic', 'mic-off');
    set('ctlCam', camOn, 'video', 'video-off');
    $('ctlMic').querySelector('.sala__ctl-rot').textContent = micOn ? 'Silenciar' : 'Ativar som';
    $('ctlCam').querySelector('.sala__ctl-rot').textContent = camOn ? 'Desligar câmera' : 'Ligar câmera';
    $('ctlTela').setAttribute('aria-pressed', S.tela ? 'true' : 'false');
    $('ctlTela').classList.toggle('sala__ctl--ativo', S.tela);
    $('ctlTela').querySelector('.sala__ctl-rot').textContent = S.tela ? 'Parar' : 'Compartilhar';
    $('ctlMao').querySelector('.sala__ctl-rot').textContent = S.mao ? 'Baixar a mão' : 'Levantar a mão';
    $('ctlMao').setAttribute('aria-pressed', S.mao ? 'true' : 'false');
    $('ctlMao').classList.toggle('sala__ctl--ativo', S.mao);
    $('ctlChat').setAttribute('aria-pressed', S.aba === 'chat' ? 'true' : 'false');
    $('ctlChat').classList.toggle('sala__ctl--ativo', S.aba === 'chat');
    $('ctlPart').setAttribute('aria-pressed', S.aba === 'part' ? 'true' : 'false');
    $('ctlPart').classList.toggle('sala__ctl--ativo', S.aba === 'part');
    // mini-janela
    const mm = $('miniMic');
    mm.setAttribute('aria-pressed', micOn ? 'false' : 'true');
    mm.setAttribute('aria-label', micOn ? 'Silenciar microfone' : 'Ativar microfone');
    mm.classList.toggle('sala__icone-btn--off', !micOn);
    mm.querySelector('[data-ic]').innerHTML = ic(micOn ? 'mic' : 'mic-off');
  }

  function tituloDaChamada() {
    const c = S.chamada;
    if (c.titulo) return c.titulo;
    if (c.tipo === 'equipe') return 'Equipe ' + c.equipe_nome;
    const outro = c.participantes.find((x) => x.id !== S.eu.id);
    return outro ? outro.nome : 'Chamada';
  }

  function abrirPainel(aba) {
    S.aba = aba;
    const pn = $('salaPainel');
    pn.hidden = !aba;
    $('painelChat').hidden = aba !== 'chat';
    $('painelPart').hidden = aba !== 'part';
    $('abaChat').classList.toggle('sala__aba--ativa', aba === 'chat');
    $('abaPart').classList.toggle('sala__aba--ativa', aba === 'part');
    $('abaChat').setAttribute('aria-selected', aba === 'chat' ? 'true' : 'false');
    $('abaPart').setAttribute('aria-selected', aba === 'part' ? 'true' : 'false');
    if (aba === 'chat') { S.naoLidas = 0; atualizarBadgeChat(); const m = $('salaMsgs'); m.scrollTop = m.scrollHeight; setTimeout(() => $('salaMsgInput').focus(), 30); }
    if (aba === 'part') renderParticipantes();
    atualizarControles();
  }

  function atualizarBadgeChat() {
    const b = $('ctlChatBadge');
    b.hidden = !S.naoLidas;
    b.textContent = String(S.naoLidas);
  }

  function pertoDoFim(box) { return box.scrollHeight - box.scrollTop - box.clientHeight < 60; }

  function addMensagem(m) {
    const eu = m.usuario_id === S.eu.id;
    const box = $('salaMsgs');
    const t = new Date(m.criada_em).getTime();
    const ult = box.lastElementChild;
    const seq = !!ult && ult.getAttribute('data-uid') === String(m.usuario_id) && (t - Number(ult.getAttribute('data-t'))) < 180000;
    const hora = new Date(m.criada_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const info = S.chamada.participantes.find((x) => x.id === m.usuario_id);
    const inicial = info ? info.inicial : String(m.nome || '?').charAt(0).toUpperCase();
    const d = document.createElement('div');
    d.className = 'sala__msg' + (eu ? ' sala__msg--eu' : '') + (seq ? ' sala__msg--seq' : '');
    d.setAttribute('data-uid', String(m.usuario_id));
    d.setAttribute('data-t', String(t));
    d.innerHTML = '<span class="sala__msg-av" aria-hidden="true">' + esc(inicial) + '</span>' +
      '<div class="sala__msg-bloco">' +
      (seq ? '' : '<span class="sala__msg-autor"><b>' + esc(eu ? 'Você' : C.primeiroNome(m.nome)) + '</b> · ' + hora + '</span>') +
      '<span class="sala__msg-texto" title="' + hora + '"></span></div>';
    d.querySelector('.sala__msg-texto').textContent = m.texto;
    const noFim = pertoDoFim(box);
    box.appendChild(d);
    $('salaChatVazio').hidden = true;
    if (noFim || eu) { box.scrollTop = box.scrollHeight; $('salaChatNovas').hidden = true; }
    else if (S.aba === 'chat') { $('salaChatNovas').hidden = false; }
  }

  // ------------------------------------------------------------
  // Ciclo de vida: entrar / processar / sair
  // ------------------------------------------------------------
  async function entrar(chamada, opcoes) {
    if (S) return;
    const eu = C.dados.eu;
    S = {
      eu: { id: eu.id, nome: eu.nome, inicial: eu.inicial },
      chamada: chamada,
      midia: opcoes.midia === 'voz' ? 'voz' : 'video',
      mudoInicial: !!opcoes.mudo,
      local: { audio: null, video: null, tela: null },
      mic: !opcoes.mudo, cam: false, tela: false, mao: false,
      peers: new Map(), analises: {}, falando: {}, ctx: null,
      ultimoSinal: 0, ultimaMsg: 0, maoEm: 0, pagina: 0, aba: null, naoLidas: 0,
      inicio: Date.now(), encerrando: false, servidorOk: true, minimizada: false,
      timer: null, analiseTimer: null,
    };

    $('salaGrade').innerHTML = '';
    $('salaMsgs').innerHTML = '';
    $('salaChatVazio').hidden = false;
    $('salaChatNovas').hidden = true;
    $('salaToasts').innerHTML = '';
    $('salaMaos').hidden = true;
    $('salaMsgInput').value = '';
    $('salaMsgEnviar').disabled = true;
    $('salaAudios').innerHTML = '';
    $('salaTitulo').textContent = tituloDaChamada();
    $('miniTitulo').textContent = tituloDaChamada();
    $('salaTimer').textContent = '00:00';
    $('chSala').hidden = false;
    $('chMini').hidden = true;
    document.body.classList.add('chamada-ativa');
    abrirPainel(null);
    atualizarEstadoGeral();
    renderGrade();

    const m = await obterMidia(S.midia === 'video');
    if (!S) return; // encerrou enquanto pedia permissão
    S.local.audio = m.audio;
    S.local.video = m.video;
    if (m.audio) m.audio.enabled = S.mic;
    S.cam = !!m.video;
    if (m.erro) avisoPermissao(m.erro);
    iniciarAnalise('eu', m.audio);

    sincronizarPeers(S.chamada.participantes);
    renderGrade();
    renderParticipantes();
    atualizarControles();
    atualizarEstadoGeral();

    S.timer = setInterval(() => {
      const t = fmtTempo(Math.floor((Date.now() - S.inicio) / 1000));
      $('salaTimer').textContent = t;
      $('miniTimer').textContent = t;
    }, 1000);
    S.analiseTimer = setInterval(atualizarFalando, 200);
    C.tickAgora();
  }

  async function processar(d) {
    if (!S || S.encerrando) return;
    if (d.chamada) {
      S.chamada = d.chamada;
      $('salaTitulo').textContent = tituloDaChamada();
      $('miniTitulo').textContent = tituloDaChamada();
      const st = d.chamada.status;
      if (st === 'encerrada' || st === 'perdida' || st === 'recusada') { finalizar(st); return; }
      sincronizarPeers(d.chamada.participantes);
      renderGrade();
      renderParticipantes();
      atualizarEstadoGeral();
    }
    for (const s of d.sinais || []) {
      S.ultimoSinal = Math.max(S.ultimoSinal, s.id);
      await processarSinal(s);
    }
    (d.mensagens || []).forEach((m) => {
      S.ultimaMsg = Math.max(S.ultimaMsg, m.id);
      addMensagem(m);
      if (m.usuario_id !== S.eu.id && S.aba !== 'chat') { S.naoLidas++; atualizarBadgeChat(); }
    });
  }

  function limpar() {
    if (!S) return;
    S.encerrando = true;
    clearInterval(S.timer);
    clearInterval(S.analiseTimer);
    Array.from(S.peers.keys()).forEach(fecharPeer);
    Object.keys(S.analises).forEach((k) => S.analises[k].fechar());
    [S.local.audio, S.local.video, S.local.tela].forEach((t) => { if (t) t.stop(); });
    if (S.ctx) { try { S.ctx.close(); } catch (e) { /* ok */ } }
    $('chSala').hidden = true;
    $('chMini').hidden = true;
    $('salaCompart').hidden = true;
    $('salaGrade').innerHTML = '';
    $('salaAudios').innerHTML = '';
    document.body.classList.remove('chamada-ativa');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  /** Chamada terminou (por mim ou pelo servidor). */
  function finalizar(motivo, fuiEu) {
    if (!S) return;
    const c = S.chamada;
    const duracao = Math.floor((Date.now() - S.inicio) / 1000);
    const conectou = S.conectouUmaVez || Array.from(S.peers.values()).some((p) => p.conn === 'ok');
    const outros = c.participantes.filter((x) => x.id !== S.eu.id);
    const nomeAlvo = outros.length ? outros[0].nome : 'A pessoa';
    const tipo = c.tipo;
    const nomes = c.participantes.filter((x) => x.estado === 'na_chamada' || x.estado === 'saiu' || x.id === S.eu.id).map((x) => (x.id === S.eu.id ? 'Você' : x.nome));
    limpar();
    S = null;
    C.recarregar();

    if (!fuiEu && !conectou && tipo === 'individual' && (motivo === 'recusada' || motivo === 'perdida')) {
      if (C.modoDireto()) {
        C.aposChamadaIndividual({ tipo: 'aviso', titulo: 'Usuário indisponível',
          texto: motivo === 'recusada' ? nomeAlvo + ' recusou a chamada.' : nomeAlvo + ' não atendeu. Tente novamente mais tarde ou envie uma mensagem.' });
        return;
      }
      C.aviso('user-x', 'Usuário indisponível',
        motivo === 'recusada' ? nomeAlvo + ' recusou a chamada.' : nomeAlvo + ' não atendeu. Tente novamente mais tarde ou envie uma mensagem.',
        [{ rotulo: C.modoDireto() ? 'Voltar para o Chat' : 'Voltar para Chamadas', tipo: 'primario', acao: () => C.aposChamadaIndividual() }]);
      return;
    }
    if (C.modoDireto()) { // vem do Chat: o resumo aparece sobre a própria tela do Chat
      C.aposChamadaIndividual({ tipo: 'fim', duracao: fmtTempo(duracao), partes: nomes.length ? nomes.join(', ') : 'Você' });
      return;
    }
    $('posDuracao').textContent = fmtTempo(duracao);
    $('posPartes').textContent = nomes.length ? nomes.join(', ') : 'Você';
    $('posVoltar').textContent = C.modoDireto() ? 'Voltar para o Chat' : 'Voltar para Chamadas';
    C.abrirModal('chPos');
  }

  async function sair() {
    if (!S || S.encerrando) return;
    const id = S.chamada.id;
    const antes = S;
    finalizar('encerrada', true);
    await C.api('chamada.php', { corpo: { acao: 'sair', chamada_id: id } });
    void antes;
  }

  // ------------------------------------------------------------
  // Controles
  // ------------------------------------------------------------
  function alternarMic() {
    if (!S) return;
    if (!S.local.audio) { religarMidia(); return; }
    S.mic = !S.mic;
    S.local.audio.enabled = S.mic;
    enviarEstado(); atualizarControles(); renderGrade();
  }

  async function alternarCam() {
    if (!S) return;
    if (S.local.video) {
      S.local.video.stop();
      S.local.video = null;
      S.cam = false;
    } else {
      try {
        const st = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (!S) { st.getTracks().forEach((t) => t.stop()); return; }
        S.local.video = st.getVideoTracks()[0];
        S.cam = true;
        S.local.video.onended = () => { if (S && S.local.video) { S.local.video = null; S.cam = false; S.peers.forEach(aplicarTrilhas); enviarEstado(); atualizarControles(); renderGrade(); } };
      } catch (e) {
        avisoPermissao(navigator.mediaDevices ? (e && e.name === 'NotFoundError' ? 'camera_sem_dispositivo' : 'camera_negada') : 'inseguro');
        return;
      }
    }
    S.peers.forEach(aplicarTrilhas);
    enviarEstado(); atualizarControles(); renderGrade();
  }

  let superficie = 'monitor';

  function marcarSuperficie(v) {
    superficie = v;
    document.querySelectorAll('#mdTela [data-superficie]').forEach((b2) => {
      const ativo = b2.getAttribute('data-superficie') === v;
      b2.classList.toggle('tela__op--sel', ativo);
      b2.setAttribute('aria-checked', ativo ? 'true' : 'false');
    });
  }

  /** Abre o pop-out do site; o seletor do navegador só aparece depois de confirmar. */
  function alternarTela() {
    if (!S) return;
    if (S.tela) { pararTela(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      C.aviso('alert', 'Compartilhamento indisponível', 'Seu navegador não permite compartilhar a tela nesta conexão (use HTTPS ou localhost).');
      return;
    }
    marcarSuperficie('monitor');
    C.abrirModal('mdTela');
  }

  function atualizarAvisoCompart() {
    const el = $('salaCompart');
    if (!S || !S.tela) { el.hidden = true; return; }
    el.hidden = false;
    $('salaCompartVoltar').hidden = !S.minimizada;
  }

  let abrindoSeletor = false;

  /** Rótulo do que o navegador realmente compartilhou (a pessoa pode trocar de aba no seletor). */
  function superficieReal(track) {
    try { const s = track.getSettings && track.getSettings().displaySurface; if (s) return s; } catch (e) { /* sem suporte */ }
    return superficie;
  }

  async function iniciarTela() {
    if (!S || abrindoSeletor) return;
    abrindoSeletor = true;
    C.fecharModal('mdTela');
    const escolha = superficie;
    // Pistas para o seletor do navegador: já abre na guia escolhida e não oferece a própria aba da
    // sala (evita o "espelho infinito"). Navegadores sem suporte ignoram as chaves desconhecidas.
    const opcoes = {
      video: { displaySurface: escolha },
      audio: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
      monitorTypeSurfaces: escolha === 'monitor' ? 'include' : 'exclude',
    };
    let st = null;
    try {
      st = await navigator.mediaDevices.getDisplayMedia(opcoes);
    } catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) { abrindoSeletor = false; return; } // cancelou no seletor
      try { st = await navigator.mediaDevices.getDisplayMedia({ video: true }); }
      catch (e2) { abrindoSeletor = false; if (e2 && e2.name !== 'NotAllowedError') C.toast('Não foi possível compartilhar a tela.', 'erro'); return; }
    }
    abrindoSeletor = false;
    if (!S) { st.getTracks().forEach((t) => t.stop()); return; }
    if (S.tela) pararTela(); // já havia um compartilhamento: troca pelo novo
    S.local.tela = st.getVideoTracks()[0];
    S.local.tela.onended = () => pararTela();
    S.tela = true;
    const real = superficieReal(S.local.tela);
    S.peers.forEach(aplicarTrilhas);
    enviarEstado(); atualizarControles(); renderGrade(); atualizarEstadoGeral();
    // Compartilhando a tela inteira ou uma janela: a sala sai da frente (evita o "espelho infinito").
    if (real !== 'browser') {
      S.minimizadaPorTela = true;
      minimizar();
      C.toast('Você está compartilhando a tela. Use o aviso verde para voltar ou parar.');
    }
    atualizarAvisoCompart();
  }

  function pararTela() {
    if (!S || !S.tela) return;
    if (S.local.tela) { S.local.tela.onended = null; S.local.tela.stop(); }
    S.local.tela = null;
    S.tela = false;
    S.peers.forEach(aplicarTrilhas);
    enviarEstado(); atualizarControles(); renderGrade(); atualizarEstadoGeral();
    // Se a sala saiu da frente só por causa do compartilhamento, ela volta sozinha ao parar.
    if (S.minimizadaPorTela) { S.minimizadaPorTela = false; if (S.minimizada) restaurar(); }
    atualizarAvisoCompart();
  }

  function alternarMao() {
    if (!S) return;
    S.mao = !S.mao;
    S.maoEm = S.mao ? Date.now() : 0;
    salaToast(S.mao ? 'Você levantou a mão' : 'Você baixou a mão', 'hand');
    enviarEstado(); atualizarControles(); renderGrade(); renderParticipantes();
  }

  function minimizar() {
    if (!S) return;
    C.sairModoDireto(); // a mini-janela precisa da página Chamadas atrás
    S.minimizada = true;
    $('chSala').hidden = true;
    $('chMini').hidden = false;
    document.body.classList.remove('chamada-ativa');
    atualizarAvisoCompart();
    $('miniVoltar').focus();
  }

  function restaurar() {
    if (!S) return;
    S.minimizada = false;
    S.minimizadaPorTela = false;
    $('chMini').hidden = true;
    $('chSala').hidden = false;
    document.body.classList.add('chamada-ativa');
    renderGrade();
    atualizarAvisoCompart();
    $('ctlEncerrar').focus();
  }

  function fecharMenu() { $('salaMenu').hidden = true; $('ctlMais').setAttribute('aria-expanded', 'false'); }

  // ------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------
  $('ctlMic').addEventListener('click', alternarMic);
  $('ctlCam').addEventListener('click', alternarCam);
  $('ctlTela').addEventListener('click', alternarTela);
  $('ctlMao').addEventListener('click', alternarMao);
  $('ctlChat').addEventListener('click', () => abrirPainel(S && S.aba === 'chat' ? null : 'chat'));
  $('ctlPart').addEventListener('click', () => abrirPainel(S && S.aba === 'part' ? null : 'part'));
  $('abaChat').addEventListener('click', () => abrirPainel('chat'));
  $('abaPart').addEventListener('click', () => abrirPainel('part'));
  $('salaPainelFechar').addEventListener('click', () => abrirPainel(null));
  $('ctlEncerrar').addEventListener('click', sair);
  $('miniEncerrar').addEventListener('click', sair);
  $('miniVoltar').addEventListener('click', restaurar);
  $('miniMic').addEventListener('click', alternarMic);
  $('salaMinTopo').addEventListener('click', minimizar);
  $('salaPagAnt').addEventListener('click', () => { S.pagina = Math.max(0, S.pagina - 1); renderGrade(); });
  $('salaPagProx').addEventListener('click', () => { S.pagina++; renderGrade(); });

  $('ctlMais').addEventListener('click', () => {
    const abrir = $('salaMenu').hidden;
    $('salaMenu').hidden = !abrir;
    $('ctlMais').setAttribute('aria-expanded', abrir ? 'true' : 'false');
  });
  $('menuMin').addEventListener('click', () => { fecharMenu(); minimizar(); });
  $('menuTelaCheia').addEventListener('click', () => {
    fecharMenu();
    if (document.fullscreenElement) document.exitFullscreen();
    else $('chSala').requestFullscreen && $('chSala').requestFullscreen().catch(() => {});
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.sala__mais-wrap')) fecharMenu(); });

  // ---- chat da chamada
  const inpMsg = $('salaMsgInput');
  function ajustarCampo() {
    inpMsg.style.height = 'auto';
    inpMsg.style.height = Math.min(inpMsg.scrollHeight, 120) + 'px';
    $('salaMsgEnviar').disabled = !inpMsg.value.trim();
  }
  inpMsg.addEventListener('input', ajustarCampo);
  inpMsg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('salaMsgForm').requestSubmit(); }
  });
  $('salaMsgs').addEventListener('scroll', () => { if (pertoDoFim($('salaMsgs'))) $('salaChatNovas').hidden = true; });
  $('salaChatNovas').addEventListener('click', () => { const m = $('salaMsgs'); m.scrollTop = m.scrollHeight; $('salaChatNovas').hidden = true; inpMsg.focus(); });

  $('salaMsgForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!S) return;
    const texto = inpMsg.value.trim();
    if (!texto) return;
    inpMsg.value = '';
    ajustarCampo();
    const r = await C.api('mensagem.php', { corpo: { chamada_id: S.chamada.id, texto: texto } });
    if (!r.ok) { C.toast(r.dados.erro || 'Não foi possível enviar a mensagem.', 'erro'); inpMsg.value = texto; ajustarCampo(); return; }
    C.tickAgora();
  });

  // ---- compartilhar tela (pop-out)
  document.querySelectorAll('#mdTela [data-superficie]').forEach((b2) => b2.addEventListener('click', () => marcarSuperficie(b2.getAttribute('data-superficie'))));
  $('telaConfirmar').addEventListener('click', iniciarTela);
  $('salaCompartParar').addEventListener('click', pararTela);
  $('salaCompartVoltar').addEventListener('click', restaurar);

  // ---- mão levantada: chip e botão "Baixar" na lista de participantes
  $('salaMaos').addEventListener('click', () => abrirPainel('part'));
  $('salaParts').addEventListener('click', (e) => { if (e.target.closest('[data-baixar]') && S && S.mao) alternarMao(); });

  // ---- minimizar clicando na logo da Intelbras (capturado antes de navegar)
  document.addEventListener('click', (e) => {
    const logo = e.target.closest && e.target.closest('.header__logo');
    if (logo && S && !S.encerrando && !S.minimizada) {
      e.preventDefault();
      e.stopPropagation();
      minimizar();
    }
  }, true);
  // clicar na mini-janela também volta para a chamada
  document.querySelector('.chamadas__mini-info').addEventListener('click', restaurar);
  document.querySelector('.chamadas__mini-info').setAttribute('title', 'Voltar à chamada');

  // Sair da página derruba a chamada (WebRTC vive na página): avisa e libera o servidor.
  if (window.IBDialogo) {
    window.IBDialogo.protegerSaida(() => !!(S && !S.encerrando), {
      titulo: 'Sair da chamada?',
      texto: 'Se sair desta página, você será desconectado da chamada.',
      confirmar: 'Sair da chamada',
      cancelar: 'Continuar na chamada',
      tituloRecarregar: 'Recarregar a página?',
      textoRecarregar: 'Se recarregar agora, você será desconectado da chamada.',
      confirmarRecarregar: 'Recarregar',
    });
  }
  window.addEventListener('pagehide', () => {
    if (S && !S.encerrando && navigator.sendBeacon) {
      const corpo = JSON.stringify({ acao: 'sair', chamada_id: S.chamada.id, csrf: C.csrf });
      navigator.sendBeacon('api/chamadas/chamada.php', new Blob([corpo], { type: 'application/json' }));
    }
  });

  // ------------------------------------------------------------
  // API pública usada pelo chamadas.js
  // ------------------------------------------------------------
  C.sala = {
    entrar: entrar,
    processar: processar,
    ativa: function () { return !!S && !S.encerrando; },
    cursor: function () { return S ? { chamada_id: S.chamada.id, ultimo_sinal: S.ultimoSinal, ultima_msg: S.ultimaMsg } : {}; },
    conexaoServidor: function (ok) { if (S) { S.servidorOk = ok; atualizarEstadoGeral(); } },
  };
})();
