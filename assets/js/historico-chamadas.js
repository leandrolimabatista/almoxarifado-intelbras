// ============================================================
// Histórico de chamadas — componente compartilhado
// Usado em Chamadas (todas as chamadas), Chat (aba "Chamadas" da
// conversa) e Equipes (aba "Chamadas" do canal).
// Dados: api/chamadas/historico.php
//
//   HistoricoChamadas.montar(elemento, {
//     escopo: 'todas' | 'contato' | 'equipe',
//     usuarioId: 7,            // escopo contato
//     equipe: 'geral',         // escopo equipe
//     busca: true,             // mostra o campo de busca
//     aoLigar: (item, midia) => {...}   // botão Ligar / Vídeo / Chamar
//   }) -> { recarregar() }
// ============================================================
(function () {
  'use strict';

  const API = 'api/chamadas/historico.php';
  const POR_PAGINA = 15;

  const SVG = {
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2.5"/><path d="M16 10.5l4.6-2.8a.7.7 0 0 1 1.1.6v7.4a.7.7 0 0 1-1.1.6L16 13.5"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
    entrada: '<path d="M7 17L17 7M17 7H9M17 7v8"/>',   // seta que chega (recebida)
    saida: '<path d="M17 7L7 17M7 17h8M7 17V9"/>',     // seta que sai (realizada)
    perdida: '<path d="M7 7l10 10M17 17H9M17 17V9"/>', // seta cortada (perdida)
    historico: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };

  const ic = (n) => '<svg class="hist__ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (SVG[n] || '') + '</svg>';
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const FILTROS = [
    ['todas', 'Todas'],
    ['recebidas', 'Recebidas'],
    ['realizadas', 'Realizadas'],
    ['perdidas', 'Perdidas'],
  ];

  const RESULTADO = {
    atendida: 'Atendida',
    em_andamento: 'Em andamento',
    perdida: 'Perdida',
    recusada: 'Recusada',
    sem_resposta: 'Sem resposta',
    sem_participacao: 'Você não participou',
  };

  function duracao(seg) {
    if (seg == null) return '';
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    const s = seg % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'min';
    if (m > 0) return m + 'min ' + String(s).padStart(2, '0') + 's';
    return s + 's';
  }

  function hora(d) { return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }

  function rotuloDia(d) {
    const h0 = new Date(); h0.setHours(0, 0, 0, 0);
    const dia = Math.round((new Date(d).setHours(0, 0, 0, 0) - h0.getTime()) / 86400000);
    if (dia === 0) return 'Hoje';
    if (dia === -1) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function montar(el, opcoes) {
    if (!el) return null;
    const o = Object.assign({ escopo: 'todas', usuarioId: 0, equipe: '', busca: false, aoLigar: null }, opcoes || {});
    if (el._histLimpar) el._histLimpar(); // remontar no mesmo elemento (ex.: trocou de conversa) não deixa timer antigo vivo

    const E = { filtro: 'todas', busca: '', itens: [], contagens: null, temMais: false, carregando: false, erro: '', ciclo: 0 };
    let timerBusca = null;

    el.classList.add('hist');
    el.innerHTML =
      '<div class="hist__topo">' +
        '<div class="hist__filtros" role="tablist" aria-label="Filtrar histórico de chamadas"></div>' +
        (o.busca ? '<label class="hist__busca"><input type="search" placeholder="Buscar por nome ou reunião" aria-label="Buscar no histórico" autocomplete="off">' + ic('search') + '</label>' : '') +
      '</div>' +
      '<div class="hist__lista" aria-live="polite"></div>' +
      '<div class="hist__mais" hidden><button type="button" class="hist__btn hist__btn--sec">Carregar mais</button></div>';

    const elFiltros = el.querySelector('.hist__filtros');
    const elLista = el.querySelector('.hist__lista');
    const elMais = el.querySelector('.hist__mais');
    const elBusca = el.querySelector('.hist__busca input');

    async function buscar(offset) {
      const q = new URLSearchParams({ escopo: o.escopo, filtro: E.filtro, limite: POR_PAGINA, offset: offset });
      if (o.escopo === 'contato') q.set('usuario_id', o.usuarioId);
      if (o.escopo === 'equipe') q.set('equipe', o.equipe);
      if (E.busca) q.set('busca', E.busca);
      const r = await fetch(API + '?' + q.toString(), { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      let d = null;
      try { d = await r.json(); } catch (e) { /* vazio */ }
      if (!r.ok || !d || d.sucesso === false) throw new Error((d && d.erro) || 'Não foi possível carregar o histórico.');
      return d;
    }

    async function carregar(maisUm, silencioso) {
      if (E.carregando) return;
      E.carregando = true;
      const ciclo = ++E.ciclo;
      if (!silencioso && !maisUm) { E.erro = ''; desenhar(true); }
      try {
        const d = await buscar(maisUm ? E.itens.length : 0);
        if (ciclo !== E.ciclo) return;
        E.itens = maisUm ? E.itens.concat(d.itens) : d.itens;
        E.contagens = d.contagens;
        E.temMais = !!d.tem_mais;
        E.erro = '';
      } catch (e) {
        if (!silencioso) E.erro = e.message;
      } finally {
        E.carregando = false;
        desenhar(false);
      }
    }

    function desenharFiltros() {
      elFiltros.innerHTML = FILTROS.map((f) => {
        const n = E.contagens ? E.contagens[f[0]] : null;
        const ativo = E.filtro === f[0];
        return '<button type="button" role="tab" class="hist__chip' + (ativo ? ' hist__chip--ativo' : '') + (f[0] === 'perdidas' && n > 0 ? ' hist__chip--alerta' : '') + '" data-filtro="' + f[0] + '" aria-selected="' + ativo + '">' +
          f[1] + (n != null ? ' <span class="hist__chip-n">' + n + '</span>' : '') + '</button>';
      }).join('');
    }

    function linha(it) {
      const d = new Date(it.iniciada_em);
      const perdida = it.resultado === 'perdida';
      const individual = it.tipo === 'individual';
      const seta = perdida ? 'perdida' : (it.direcao === 'recebida' ? 'entrada' : 'saida');
      const dirTxt = it.direcao === 'recebida' ? 'Recebida' : 'Realizada';

      let titulo;
      let sub;
      if (individual) {
        titulo = it.outro ? it.outro.nome : 'Usuário removido';
        sub = (it.outro && it.outro.cargo_nome ? it.outro.cargo_nome : '');
      } else {
        titulo = it.titulo ? it.titulo : 'Chamada da equipe ' + it.equipe_nome;
        sub = it.titulo ? 'Reunião · ' + it.equipe_nome : 'Equipe ' + it.equipe_nome;
      }

      const partes = [];
      partes.push(it.direcao === 'recebida' && !individual ? 'Iniciada por ' + it.iniciador_nome : dirTxt);
      partes.push(it.midia === 'video' ? 'Vídeo' : 'Voz');
      if (!individual && it.entraram > 0) partes.push(it.entraram + (it.entraram === 1 ? ' participante' : ' participantes'));
      const meta = partes.join(' · ');

      const dur = duracao(it.duracao_seg);
      const res = RESULTADO[it.resultado] || '';
      const resClasse = it.resultado === 'perdida' || it.resultado === 'recusada' || it.resultado === 'sem_resposta' ? ' hist__res--ruim' : (it.resultado === 'em_andamento' ? ' hist__res--ativa' : '');

      let acoes = '';
      if (o.aoLigar && it.pode_ligar) {
        if (individual) {
          acoes = '<button type="button" class="hist__acao" data-ligar="' + it.id + '" data-midia="voz" aria-label="Ligar para ' + esc(titulo) + '" title="Ligar">' + ic('phone') + '</button>' +
                  '<button type="button" class="hist__acao" data-ligar="' + it.id + '" data-midia="video" aria-label="Chamada de vídeo com ' + esc(titulo) + '" title="Vídeo">' + ic('video') + '</button>';
        } else {
          acoes = '<button type="button" class="hist__btn hist__btn--sec" data-ligar="' + it.id + '" data-midia="' + (it.midia === 'video' ? 'video' : 'voz') + '">' + (it.resultado === 'em_andamento' ? 'Entrar' : 'Chamar de novo') + '</button>';
        }
      }

      return '<li class="hist__item' + (perdida ? ' hist__item--perdida' : '') + '" data-id="' + it.id + '">' +
        '<span class="hist__icone hist__icone--' + seta + '">' + ic(individual ? seta : 'users') + '</span>' +
        '<span class="hist__info">' +
          '<strong class="hist__nome">' + esc(titulo) + '</strong>' +
          '<span class="hist__meta">' + esc(meta) + (sub ? ' · ' + esc(sub) : '') + '</span>' +
        '</span>' +
        '<span class="hist__quando">' +
          '<span class="hist__res' + resClasse + '">' + esc(res) + '</span>' +
          '<span class="hist__hora">' + hora(d) + (dur ? ' · ' + esc(dur) : '') + '</span>' +
        '</span>' +
        '<span class="hist__acoes">' + acoes + '</span>' +
      '</li>';
    }

    function desenhar(carregandoInicial) {
      desenharFiltros();

      if (carregandoInicial && !E.itens.length) {
        elLista.innerHTML = '<p class="hist__vazio"><span class="hist__spinner"></span> Carregando histórico…</p>';
        elMais.hidden = true;
        return;
      }
      if (E.erro && !E.itens.length) {
        elLista.innerHTML = '<div class="hist__vazio"><strong>Não foi possível carregar</strong><span>' + esc(E.erro) + '</span><button type="button" class="hist__btn hist__btn--sec" data-tentar>Tentar novamente</button></div>';
        elMais.hidden = true;
        return;
      }
      if (!E.itens.length) {
        const filtrando = E.filtro !== 'todas' || E.busca;
        const msg = filtrando ? 'Nenhuma chamada encontrada com esse filtro.'
          : (o.escopo === 'contato' ? 'Você ainda não fez nem recebeu chamadas com essa pessoa.'
          : (o.escopo === 'equipe' ? 'Ainda não houve chamadas nesta equipe.' : 'Suas chamadas aparecerão aqui.'));
        elLista.innerHTML = '<div class="hist__vazio">' + ic('historico') + '<strong>Sem chamadas no histórico</strong><span>' + msg + '</span></div>';
        elMais.hidden = true;
        return;
      }

      let html = '';
      let diaAtual = '';
      E.itens.forEach((it) => {
        const dia = rotuloDia(new Date(it.iniciada_em));
        if (dia !== diaAtual) {
          if (diaAtual) html += '</ul>';
          html += '<h3 class="hist__dia">' + esc(dia) + '</h3><ul class="hist__grupo">';
          diaAtual = dia;
        }
        html += linha(it);
      });
      elLista.innerHTML = html + '</ul>';
      elMais.hidden = !E.temMais;
      const bm = elMais.querySelector('button');
      bm.disabled = E.carregando;
    }

    // ---- Eventos ----
    elFiltros.addEventListener('click', (e) => {
      const b = e.target.closest('[data-filtro]');
      if (!b || b.getAttribute('data-filtro') === E.filtro) return;
      E.filtro = b.getAttribute('data-filtro');
      E.itens = [];
      carregar(false);
    });
    elMais.querySelector('button').addEventListener('click', () => carregar(true));
    elLista.addEventListener('click', (e) => {
      if (e.target.closest('[data-tentar]')) { carregar(false); return; }
      const b = e.target.closest('[data-ligar]');
      if (!b || !o.aoLigar) return;
      const it = E.itens.find((x) => x.id === parseInt(b.getAttribute('data-ligar'), 10));
      if (it) o.aoLigar(it, b.getAttribute('data-midia') === 'video' ? 'video' : 'voz');
    });
    if (elBusca) {
      elBusca.addEventListener('input', () => {
        clearTimeout(timerBusca);
        timerBusca = setTimeout(() => { E.busca = elBusca.value.trim(); E.itens = []; carregar(false); }, 300);
      });
    }

    // Atualiza sozinho (chamada nova entra no topo) enquanto a lista está visível.
    const timer = setInterval(() => {
      if (!document.body.contains(el)) { clearInterval(timer); return; }
      if (document.hidden || el.offsetParent === null) return;
      if (E.itens.length > POR_PAGINA) return; // quem já "carregou mais" não perde o lugar
      carregar(false, true);
    }, 30000);

    el._histLimpar = () => clearInterval(timer);

    carregar(false);

    return {
      recarregar: function () { E.itens = []; return carregar(false, true); },
      definir: function (novas) { Object.assign(o, novas || {}); E.itens = []; E.filtro = 'todas'; E.busca = ''; if (elBusca) elBusca.value = ''; carregar(false); },
    };
  }

  window.HistoricoChamadas = { montar: montar };
})();
