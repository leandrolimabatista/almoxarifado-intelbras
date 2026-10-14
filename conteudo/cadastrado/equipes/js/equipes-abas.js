// ============================================================
// Equipes — abas Tarefas, Calendário e Notas
// Dados reais via api/equipes/abas.php (database/equipes_abas.sql).
// Carrega cada aba na primeira vez que ela é aberta.
// ============================================================
(function () {
  'use strict';

  const raiz = document.getElementById('equipesRaiz');
  if (!raiz) return;

  const CSRF = raiz.getAttribute('data-csrf') || '';
  const EQUIPE = raiz.getAttribute('data-equipe') || 'geral';
  const API = 'api/equipes/abas.php';
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hojeIso = () => iso(new Date());
  const dataBr = (s) => { const [a, m, d] = String(s).slice(0, 10).split('-'); return d + '/' + m + '/' + a; };

  function toast(msg, erro) {
    const t = document.getElementById('equipesToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle('equipes__toast--erro', !!erro);
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.hidden = true; }, 4200);
  }

  async function api(tipo, corpo) {
    const opc = corpo
      ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF, Accept: 'application/json' }, body: JSON.stringify(Object.assign({ slug: EQUIPE, tipo }, corpo)) }
      : { credentials: 'same-origin', headers: { Accept: 'application/json' } };
    const url = corpo ? API : API + '?slug=' + encodeURIComponent(EQUIPE) + '&tipo=' + tipo;
    const resp = await fetch(url, opc);
    let dados = null;
    try { dados = await resp.json(); } catch (e) { /* vazio */ }
    if (!resp.ok || !dados || !dados.sucesso) throw new Error((dados && dados.erro) || 'Não foi possível completar a ação.');
    return dados;
  }

  const corpo = (aba) => document.querySelector('[data-corpo-aba="' + aba + '"]');

  // ============================================================ SELETOR DE DATA
  // Mesmo calendário padrão do popup "Calendário da equipe" (classes .equipes__cal*),
  // no lugar do <input type="date"> nativo. O valor (AAAA-MM-DD) fica num <input hidden>
  // com o mesmo data-campo de antes, então a leitura/gravação das tarefas não muda.
  const ICONE_DATA = '<svg class="equipes__data-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M4 9.5h16M8 3.5v3M16 3.5v3"/></svg>';

  function campoData(campo, valor, rotulo) {
    return `<span class="equipes__data">
      <button type="button" class="equipes__aba-input equipes__data-btn" data-datepicker aria-haspopup="dialog" aria-expanded="false" aria-label="${esc(rotulo)}">
        <span class="equipes__data-txt${valor ? '' : ' equipes__data-txt--vazio'}">${valor ? dataBr(valor) : 'dd/mm/aaaa'}</span>${ICONE_DATA}
      </button>
      <input type="hidden" data-campo="${esc(campo)}" value="${esc(valor || '')}">
    </span>`;
  }

  let seletorLimpar = null;

  function abrirSeletorData(btn) {
    const reabrir = !(seletorLimpar && seletorLimpar.btn === btn);
    if (seletorLimpar) seletorLimpar();
    if (!reabrir) return;                          // segundo clique no mesmo campo fecha

    const entrada = btn.parentElement.querySelector('input[type="hidden"]');
    const txt = btn.querySelector('.equipes__data-txt');
    const hoje = new Date();
    const hojeStr = iso(hoje);
    let valor = entrada.value || '';
    const base = valor ? new Date(Number(valor.slice(0, 4)), Number(valor.slice(5, 7)) - 1, 1) : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    let ano = base.getFullYear();
    let mes = base.getMonth();
    const LETRAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    const pop = document.createElement('div');
    pop.className = 'equipes__cal equipes__cal--data';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Escolher data');
    pop.setAttribute('data-mv', 'menu');           // padrão do site: entrada animada + sombra de menu
    pop.setAttribute('data-mv-anim', '');

    function desenhar(animarGrade) {
      const inicio = new Date(ano, mes, 1).getDay();
      const diasNoMes = new Date(ano, mes + 1, 0).getDate();
      const diasAnt = new Date(ano, mes, 0).getDate();
      let cel = '';
      for (let i = inicio - 1; i >= 0; i--) cel += `<span class="equipes__cal-dia equipes__cal-dia--fora">${diasAnt - i}</span>`;
      for (let d = 1; d <= diasNoMes; d++) {
        const chave = ano + '-' + pad(mes + 1) + '-' + pad(d);
        const cls = ['equipes__cal-dia'];
        if (chave === hojeStr) cls.push('equipes__cal-dia--hoje');
        if (chave === (valor || hojeStr)) cls.push('equipes__cal-dia--sel');   // sem data, o dia de hoje já vem marcado (igual ao calendário padrão)
        cel += `<button type="button" class="${cls.join(' ')}" data-dia="${chave}">${d}</button>`;
      }
      const resto = (7 - ((inicio + diasNoMes) % 7)) % 7;
      for (let d = 1; d <= resto; d++) cel += `<span class="equipes__cal-dia equipes__cal-dia--fora">${d}</span>`;

      pop.innerHTML = `
        <div class="equipes__cal-topo">
          <button type="button" class="equipes__cal-nav" data-nav="-1" aria-label="Mês anterior">‹</button>
          <strong class="equipes__cal-titulo">${MESES[mes]} de ${ano}</strong>
          <button type="button" class="equipes__cal-nav" data-nav="1" aria-label="Próximo mês">›</button>
        </div>
        <div class="equipes__cal-grade${animarGrade ? ' equipes__cal-grade--troca' : ''}">
          ${LETRAS.map((x) => `<span class="equipes__cal-sem">${x}</span>`).join('')}
          ${cel}
        </div>
        <div class="equipes__cal-rodape equipes__cal-rodape--data">
          ${valor ? '<button type="button" class="equipes__cal-hoje equipes__cal-hoje--limpar" data-limpar>Limpar</button>' : '<span></span>'}
          <button type="button" class="equipes__cal-hoje" data-hoje>Hoje</button>
        </div>`;
    }

    function posicionar() {
      if (!btn.isConnected) { fechar(); return; }
      const rb = btn.getBoundingClientRect();
      const larg = pop.offsetWidth;
      const alt = pop.offsetHeight;
      const margem = 8;
      let topo = rb.bottom + 6;
      let origem = 'top';
      if (topo + alt > window.innerHeight - margem && rb.top - alt - 6 >= margem) { topo = rb.top - alt - 6; origem = 'bottom'; }
      topo = Math.min(Math.max(margem, topo), Math.max(margem, window.innerHeight - alt - margem));
      const esq = Math.min(Math.max(margem, rb.left), Math.max(margem, window.innerWidth - larg - margem));
      pop.style.left = esq + 'px';
      pop.style.top = topo + 'px';
      pop.style.transformOrigin = origem + ' ' + (rb.left < esq ? 'right' : 'left');
    }

    function escolher(novo) {
      entrada.value = novo;
      txt.textContent = novo ? dataBr(novo) : 'dd/mm/aaaa';
      txt.classList.toggle('equipes__data-txt--vazio', !novo);
      fechar();
      btn.focus();
    }

    pop.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        const n = new Date(ano, mes + Number(nav.dataset.nav), 1);
        ano = n.getFullYear(); mes = n.getMonth();
        desenhar(true); posicionar();
        return;
      }
      if (e.target.closest('[data-hoje]')) { escolher(hojeStr); return; }
      if (e.target.closest('[data-limpar]')) { escolher(''); return; }
      const dia = e.target.closest('[data-dia]');
      if (dia) escolher(dia.dataset.dia);
    });

    const aoClicarFora = (e) => { if (!pop.contains(e.target) && !btn.contains(e.target)) fechar(); };
    const aoTeclar = (e) => { if (e.key === 'Escape') { fechar(); btn.focus(); } };
    const aoMover = () => posicionar();

    function fechar() {
      document.removeEventListener('click', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('resize', aoMover);
      window.removeEventListener('scroll', aoMover, true);
      btn.setAttribute('aria-expanded', 'false');
      pop.remove();
      seletorLimpar = null;
    }

    desenhar();
    document.body.appendChild(pop);
    btn.setAttribute('aria-expanded', 'true');
    posicionar();
    document.addEventListener('click', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    window.addEventListener('resize', aoMover);
    window.addEventListener('scroll', aoMover, { passive: true, capture: true });
    seletorLimpar = fechar;
    seletorLimpar.btn = btn;
  }

  // ============================================================ TAREFAS
  const tarefas = { itens: [], filtro: 'abertas', editando: 0, carregado: false };

  function desenharTarefas() {
    if (seletorLimpar) seletorLimpar();
    const el = corpo('tarefas');
    const abertas = tarefas.itens.filter((t) => !t.concluida);
    const feitas = tarefas.itens.filter((t) => t.concluida);
    const lista = tarefas.filtro === 'abertas' ? abertas : feitas;
    const hoje = hojeIso();

    const linhas = lista.map((t) => {
      if (tarefas.editando === t.id) {
        return `<li class="equipes__tarefa equipes__tarefa--edicao" data-id="${t.id}">
          <input class="equipes__aba-input" data-campo="titulo" maxlength="200" value="${esc(t.titulo)}" aria-label="Título da tarefa">
          ${campoData('prazo', t.prazo || '', 'Prazo')}
          <button type="button" class="equipes__aba-btn" data-acao="salvar-tarefa">Salvar</button>
          <button type="button" class="equipes__aba-btn equipes__aba-btn--sec" data-acao="cancelar-tarefa">Cancelar</button>
        </li>`;
      }
      const atrasada = !t.concluida && t.prazo && t.prazo < hoje;
      const prazo = t.prazo ? `<span class="equipes__tarefa-prazo${atrasada ? ' equipes__tarefa-prazo--atrasada' : ''}">${atrasada ? 'Atrasada · ' : ''}${dataBr(t.prazo)}</span>` : '';
      const acoes = t.pode_editar
        ? `<span class="equipes__item-acoes">
             <button type="button" class="equipes__icone-btn" data-acao="editar-tarefa" aria-label="Editar tarefa" title="Editar">✎</button>
             <button type="button" class="equipes__icone-btn" data-acao="excluir-tarefa" aria-label="Excluir tarefa" title="Excluir">🗑</button>
           </span>` : '';
      return `<li class="equipes__tarefa${t.concluida ? ' equipes__tarefa--feita' : ''}" data-id="${t.id}">
        <input type="checkbox" class="equipes__tarefa-check" data-acao="alternar-tarefa" ${t.concluida ? 'checked' : ''} aria-label="Concluir tarefa">
        <span class="equipes__tarefa-info">
          <span class="equipes__tarefa-titulo">${esc(t.titulo)}</span>
          <span class="equipes__tarefa-meta">${prazo}<span>${esc(t.autor)}</span></span>
        </span>${acoes}
      </li>`;
    }).join('');

    el.innerHTML = `
      <div class="equipes__aba-topo">
        <h2 class="equipes__aba-titulo">Tarefas</h2>
        <div class="equipes__aba-filtros" role="tablist">
          <button type="button" class="equipes__aba-filtro${tarefas.filtro === 'abertas' ? ' equipes__aba-filtro--ativo' : ''}" data-filtro="abertas">Abertas (${abertas.length})</button>
          <button type="button" class="equipes__aba-filtro${tarefas.filtro === 'feitas' ? ' equipes__aba-filtro--ativo' : ''}" data-filtro="feitas">Concluídas (${feitas.length})</button>
        </div>
      </div>
      <div class="equipes__aba-form" data-form="tarefa">
        <input class="equipes__aba-input" data-campo="titulo" maxlength="200" placeholder="Nova tarefa…" aria-label="Nova tarefa">
        ${campoData('prazo', '', 'Prazo (opcional)')}
        <button type="button" class="equipes__aba-btn" data-acao="criar-tarefa">Adicionar</button>
      </div>
      <div class="equipes__aba-scroll">
        ${linhas ? `<ul class="equipes__aba-lista">${linhas}</ul>` : `<p class="equipes__aba-vazio">${tarefas.filtro === 'abertas' ? 'Nenhuma tarefa aberta. Adicione a primeira acima.' : 'Nenhuma tarefa concluída ainda.'}</p>`}
      </div>`;
  }

  async function carregarTarefas() {
    try {
      tarefas.itens = (await api('tarefas')).itens;
      tarefas.carregado = true;
      desenharTarefas();
    } catch (e) {
      corpo('tarefas').innerHTML = `<p class="equipes__aba-vazio">${esc(e.message)}</p>`;
    }
  }

  async function cliqueTarefas(e) {
    const el = corpo('tarefas');
    const seletor = e.target.closest('[data-datepicker]');
    if (seletor) { abrirSeletorData(seletor); return; }
    const filtro = e.target.closest('[data-filtro]');
    if (filtro) { tarefas.filtro = filtro.dataset.filtro; desenharTarefas(); return; }
    const botao = e.target.closest('[data-acao]');
    if (!botao) return;
    const acao = botao.dataset.acao;
    const li = botao.closest('[data-id]');
    const id = li ? Number(li.dataset.id) : 0;
    try {
      if (acao === 'criar-tarefa') {
        const f = el.querySelector('[data-form="tarefa"]');
        const titulo = f.querySelector('[data-campo="titulo"]').value.trim();
        if (!titulo) { f.querySelector('[data-campo="titulo"]').focus(); return; }
        await api('tarefas', { acao: 'criar', titulo, prazo: f.querySelector('[data-campo="prazo"]').value });
        tarefas.filtro = 'abertas';
        await carregarTarefas();
      } else if (acao === 'alternar-tarefa') {
        await api('tarefas', { acao: 'alternar', id, concluida: botao.checked });
        await carregarTarefas();
      } else if (acao === 'editar-tarefa') {
        tarefas.editando = id; desenharTarefas();
        const inp = el.querySelector('.equipes__tarefa--edicao [data-campo="titulo"]'); if (inp) inp.focus();
      } else if (acao === 'cancelar-tarefa') {
        tarefas.editando = 0; desenharTarefas();
      } else if (acao === 'salvar-tarefa') {
        const titulo = li.querySelector('[data-campo="titulo"]').value.trim();
        if (!titulo) return;
        await api('tarefas', { acao: 'editar', id, titulo, prazo: li.querySelector('[data-campo="prazo"]').value });
        tarefas.editando = 0;
        await carregarTarefas();
      } else if (acao === 'excluir-tarefa') {
        if (!(await window.IBDialogo.confirmar({ titulo: 'Excluir tarefa?', texto: 'Esta tarefa será excluída.', confirmar: 'Excluir', perigo: true }))) return;
        await api('tarefas', { acao: 'excluir', id });
        await carregarTarefas();
      }
    } catch (err) {
      toast(err.message, true);
      if (acao === 'alternar-tarefa') carregarTarefas();
    }
  }

  // ============================================================ CALENDÁRIO
  const hojeData = new Date();
  const cal = { itens: [], ano: hojeData.getFullYear(), mes: hojeData.getMonth(), sel: hojeIso(), editando: 0, carregado: false };

  function desenharCalendario() {
    const el = corpo('calendario');
    const hoje = hojeIso();
    const porDia = {};
    cal.itens.forEach((ev) => { (porDia[ev.data] = porDia[ev.data] || []).push(ev); });

    const inicio = new Date(cal.ano, cal.mes, 1).getDay();
    const diasNoMes = new Date(cal.ano, cal.mes + 1, 0).getDate();
    const diasAnt = new Date(cal.ano, cal.mes, 0).getDate();
    let cel = '';
    for (let i = inicio - 1; i >= 0; i--) cel += `<span class="equipes__agenda-dia equipes__agenda-dia--fora">${diasAnt - i}</span>`;
    for (let d = 1; d <= diasNoMes; d++) {
      const chave = cal.ano + '-' + pad(cal.mes + 1) + '-' + pad(d);
      const n = (porDia[chave] || []).length;
      const cls = ['equipes__agenda-dia'];
      if (chave === hoje) cls.push('equipes__agenda-dia--hoje');
      if (chave === cal.sel) cls.push('equipes__agenda-dia--sel');
      cel += `<button type="button" class="${cls.join(' ')}" data-dia="${chave}"><span>${d}</span>${n ? `<i class="equipes__agenda-ponto" title="${n} evento(s)"></i>` : ''}</button>`;
    }
    const resto = (7 - ((inicio + diasNoMes) % 7)) % 7;
    for (let d = 1; d <= resto; d++) cel += `<span class="equipes__agenda-dia equipes__agenda-dia--fora">${d}</span>`;

    const doDia = porDia[cal.sel] || [];
    const lista = doDia.map((ev) => {
      if (cal.editando === ev.id) {
        return `<li class="equipes__evento equipes__evento--edicao" data-id="${ev.id}">
          <input class="equipes__aba-input" data-campo="titulo" maxlength="200" value="${esc(ev.titulo)}" aria-label="Título">
          <input class="equipes__aba-input equipes__aba-input--hora" type="time" data-campo="hora" value="${esc(ev.hora || '')}" aria-label="Hora">
          <button type="button" class="equipes__aba-btn" data-acao="salvar-evento">Salvar</button>
          <button type="button" class="equipes__aba-btn equipes__aba-btn--sec" data-acao="cancelar-evento">Cancelar</button>
        </li>`;
      }
      const acoes = ev.pode_editar
        ? `<span class="equipes__item-acoes">
             <button type="button" class="equipes__icone-btn" data-acao="editar-evento" aria-label="Editar evento" title="Editar">✎</button>
             <button type="button" class="equipes__icone-btn" data-acao="excluir-evento" aria-label="Excluir evento" title="Excluir">🗑</button>
           </span>` : '';
      return `<li class="equipes__evento" data-id="${ev.id}">
        <span class="equipes__evento-hora">${ev.hora ? esc(ev.hora) : 'Dia todo'}</span>
        <span class="equipes__tarefa-info"><span class="equipes__tarefa-titulo">${esc(ev.titulo)}</span><span class="equipes__tarefa-meta"><span>${esc(ev.autor)}</span></span></span>${acoes}
      </li>`;
    }).join('');

    const [sa, sm, sd] = cal.sel.split('-').map(Number);
    el.innerHTML = `
      <div class="equipes__aba-topo">
        <h2 class="equipes__aba-titulo">Calendário</h2>
        <div class="equipes__agenda-nav">
          <button type="button" class="equipes__icone-btn" data-nav="-1" aria-label="Mês anterior">‹</button>
          <strong class="equipes__agenda-mes">${MESES[cal.mes]} de ${cal.ano}</strong>
          <button type="button" class="equipes__icone-btn" data-nav="1" aria-label="Próximo mês">›</button>
          <button type="button" class="equipes__aba-btn equipes__aba-btn--sec" data-acao="hoje-agenda">Hoje</button>
        </div>
      </div>
      <div class="equipes__aba-scroll equipes__agenda-corpo">
        <div class="equipes__agenda-grade">
          ${SEMANA.map((x) => `<span class="equipes__agenda-sem">${x}</span>`).join('')}${cel}
        </div>
        <div class="equipes__agenda-lateral">
          <h3 class="equipes__agenda-dia-titulo">${sd} de ${MESES[sm - 1]} de ${sa}</h3>
          <div class="equipes__aba-form equipes__aba-form--col" data-form="evento">
            <input class="equipes__aba-input" data-campo="titulo" maxlength="200" placeholder="Novo evento…" aria-label="Novo evento">
            <div class="equipes__aba-form-linha">
              <input class="equipes__aba-input equipes__aba-input--hora" type="time" data-campo="hora" aria-label="Hora (opcional)">
              <button type="button" class="equipes__aba-btn" data-acao="criar-evento">Adicionar</button>
            </div>
          </div>
          ${lista ? `<ul class="equipes__aba-lista">${lista}</ul>` : '<p class="equipes__aba-vazio equipes__aba-vazio--pequeno">Nenhum evento neste dia.</p>'}
        </div>
      </div>`;
  }

  async function carregarCalendario() {
    try {
      cal.itens = (await api('eventos')).itens;
      cal.carregado = true;
      desenharCalendario();
    } catch (e) {
      corpo('calendario').innerHTML = `<p class="equipes__aba-vazio">${esc(e.message)}</p>`;
    }
  }

  async function cliqueCalendario(e) {
    const el = corpo('calendario');
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const n = new Date(cal.ano, cal.mes + Number(nav.dataset.nav), 1);
      cal.ano = n.getFullYear(); cal.mes = n.getMonth(); desenharCalendario(); return;
    }
    const dia = e.target.closest('[data-dia]');
    if (dia) { cal.sel = dia.dataset.dia; cal.editando = 0; desenharCalendario(); return; }
    const botao = e.target.closest('[data-acao]');
    if (!botao) return;
    const acao = botao.dataset.acao;
    const li = botao.closest('[data-id]');
    const id = li ? Number(li.dataset.id) : 0;
    try {
      if (acao === 'hoje-agenda') {
        const h = new Date(); cal.ano = h.getFullYear(); cal.mes = h.getMonth(); cal.sel = hojeIso(); desenharCalendario();
      } else if (acao === 'criar-evento') {
        const f = el.querySelector('[data-form="evento"]');
        const titulo = f.querySelector('[data-campo="titulo"]').value.trim();
        if (!titulo) { f.querySelector('[data-campo="titulo"]').focus(); return; }
        await api('eventos', { acao: 'criar', titulo, data: cal.sel, hora: f.querySelector('[data-campo="hora"]').value });
        await carregarCalendario();
      } else if (acao === 'editar-evento') {
        cal.editando = id; desenharCalendario();
      } else if (acao === 'cancelar-evento') {
        cal.editando = 0; desenharCalendario();
      } else if (acao === 'salvar-evento') {
        const titulo = li.querySelector('[data-campo="titulo"]').value.trim();
        if (!titulo) return;
        await api('eventos', { acao: 'editar', id, titulo, data: cal.sel, hora: li.querySelector('[data-campo="hora"]').value });
        cal.editando = 0;
        await carregarCalendario();
      } else if (acao === 'excluir-evento') {
        if (!(await window.IBDialogo.confirmar({ titulo: 'Excluir evento?', texto: 'Este evento será excluído.', confirmar: 'Excluir', perigo: true }))) return;
        await api('eventos', { acao: 'excluir', id });
        await carregarCalendario();
      }
    } catch (err) { toast(err.message, true); }
  }

  // ============================================================ NOTAS
  const notas = { itens: [], aberta: null, carregado: false };  // aberta: null | 0 (nova) | id

  function desenharNotas() {
    const el = corpo('notas');
    if (notas.aberta !== null) {
      const n = notas.itens.find((x) => x.id === notas.aberta) || { titulo: '', conteudo: '', pode_editar: true };
      const somenteLeitura = notas.aberta !== 0 && !n.pode_editar;
      el.innerHTML = `
        <div class="equipes__aba-topo">
          <button type="button" class="equipes__aba-btn equipes__aba-btn--sec" data-acao="voltar-notas">‹ Notas</button>
          <span class="equipes__aba-topo-acoes">
            ${notas.aberta !== 0 && n.pode_editar ? '<button type="button" class="equipes__aba-btn equipes__aba-btn--sec" data-acao="excluir-nota">Excluir</button>' : ''}
            ${somenteLeitura ? '' : '<button type="button" class="equipes__aba-btn" data-acao="salvar-nota">Salvar</button>'}
          </span>
        </div>
        <div class="equipes__aba-scroll equipes__nota-editor">
          <input class="equipes__aba-input equipes__nota-titulo-input" data-campo="titulo" maxlength="120" placeholder="Título da nota" value="${esc(n.titulo)}" ${somenteLeitura ? 'readonly' : ''} aria-label="Título da nota">
          <textarea class="equipes__aba-input equipes__nota-texto" data-campo="conteudo" maxlength="20000" placeholder="Escreva aqui…" ${somenteLeitura ? 'readonly' : ''} aria-label="Conteúdo da nota">${esc(n.conteudo)}</textarea>
          ${n.autor ? `<span class="equipes__tarefa-meta"><span>Por ${esc(n.autor)}</span></span>` : ''}
        </div>`;
      return;
    }
    const cartoes = notas.itens.map((n) => {
      const resumo = n.conteudo.length > 160 ? n.conteudo.slice(0, 160) + '…' : n.conteudo;
      return `<button type="button" class="equipes__nota-card" data-nota="${n.id}">
        <span class="equipes__nota-card-titulo">${esc(n.titulo)}</span>
        <span class="equipes__nota-card-texto">${esc(resumo) || '<em>Sem conteúdo</em>'}</span>
        <span class="equipes__tarefa-meta"><span>${esc(n.autor)}</span><span>${dataBr(n.atualizada_em)}</span></span>
      </button>`;
    }).join('');
    el.innerHTML = `
      <div class="equipes__aba-topo">
        <h2 class="equipes__aba-titulo">Notas</h2>
        <button type="button" class="equipes__aba-btn" data-acao="nova-nota">+ Nova nota</button>
      </div>
      <div class="equipes__aba-scroll">
        ${cartoes ? `<div class="equipes__notas-grade">${cartoes}</div>` : '<p class="equipes__aba-vazio">Nenhuma nota ainda. Crie a primeira em “Nova nota”.</p>'}
      </div>`;
  }

  async function carregarNotas() {
    try {
      notas.itens = (await api('notas')).itens;
      notas.carregado = true;
      desenharNotas();
    } catch (e) {
      corpo('notas').innerHTML = `<p class="equipes__aba-vazio">${esc(e.message)}</p>`;
    }
  }

  async function cliqueNotas(e) {
    const el = corpo('notas');
    const card = e.target.closest('[data-nota]');
    if (card) { notas.aberta = Number(card.dataset.nota); desenharNotas(); return; }
    const botao = e.target.closest('[data-acao]');
    if (!botao) return;
    const acao = botao.dataset.acao;
    try {
      if (acao === 'nova-nota') {
        notas.aberta = 0; desenharNotas();
        const t = el.querySelector('[data-campo="titulo"]'); if (t) t.focus();
      } else if (acao === 'voltar-notas') {
        notas.aberta = null; desenharNotas();
      } else if (acao === 'salvar-nota') {
        const titulo = el.querySelector('[data-campo="titulo"]').value.trim();
        const conteudo = el.querySelector('[data-campo="conteudo"]').value;
        if (!titulo) { toast('Dê um título à nota.', true); return; }
        await api('notas', notas.aberta === 0 ? { acao: 'criar', titulo, conteudo } : { acao: 'editar', id: notas.aberta, titulo, conteudo });
        notas.aberta = null;
        await carregarNotas();
        toast('Nota salva.');
      } else if (acao === 'excluir-nota') {
        if (!(await window.IBDialogo.confirmar({ titulo: 'Excluir nota?', texto: 'Esta nota será excluída.', confirmar: 'Excluir', perigo: true }))) return;
        await api('notas', { acao: 'excluir', id: notas.aberta });
        notas.aberta = null;
        await carregarNotas();
      }
    } catch (err) { toast(err.message, true); }
  }

  // ============================================================ LIGAÇÃO
  corpo('tarefas').addEventListener('click', cliqueTarefas);
  corpo('tarefas').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('input[data-campo="titulo"]')) return;
    const b = e.target.closest('[data-form], [data-id]').querySelector('[data-acao="criar-tarefa"], [data-acao="salvar-tarefa"]');
    if (b) b.click();
  });
  corpo('calendario').addEventListener('click', cliqueCalendario);
  corpo('calendario').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('input[data-campo="titulo"]')) return;
    const b = e.target.closest('[data-form], [data-id]').querySelector('[data-acao="criar-evento"], [data-acao="salvar-evento"]');
    if (b) b.click();
  });
  corpo('notas').addEventListener('click', cliqueNotas);

  document.querySelectorAll('.equipes__tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const aba = tab.getAttribute('data-aba');
      if (aba === 'tarefas') carregarTarefas();
      else if (aba === 'calendario') carregarCalendario();
      else if (aba === 'notas' && notas.aberta === null) carregarNotas();
    });
  });
})();
