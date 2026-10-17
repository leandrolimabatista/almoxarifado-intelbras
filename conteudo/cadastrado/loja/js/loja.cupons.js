// ============================================================
// LOJA — Cupons de desconto (somente o Administrador Intelbras, id 1)
//
// Botão "Cupons" da Loja -> janela com a lista de cupons e o formulário de cadastro.
// Fala com api/loja/cupom.php (o servidor confere de novo o administrador e o token CSRF).
// Visual da janela = mesma caixa do "Adicionar item" (classes lprod__* de loja.css).
// ============================================================
(function () {
  'use strict';

  const main = document.querySelector('.loja__main');
  const botao = document.getElementById('lojaCupons');
  if (!main || main.dataset.admin !== '1' || !botao || !window.LojaApi) return;

  const API = window.LojaApi;
  const CSRF = main.dataset.csrf || '';
  let aberto = false;

  const esc = (t) => String(t).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtBRL = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtData = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
  const numPt = (v) => String(v).replace('.', ',');

  const rotuloValor = (c) => (c.tipo === 'percent' ? numPt(c.valor) + '% de desconto' : fmtBRL(c.valor) + ' de desconto');

  function resumoRegras(c) {
    const r = [];
    if (c.valor_minimo) r.push('compras a partir de ' + fmtBRL(c.valor_minimo));
    if (c.por_usuario) r.push(c.por_usuario === 1 ? '1 uso por usuário' : c.por_usuario + ' usos por usuário');
    return r.length ? r.join(' · ') : 'sem restrições';
  }
  function resumoUso(c) {
    const usos = c.usos_max ? `${c.usos} de ${c.usos_max} usos` : `${c.usos} ${c.usos === 1 ? 'uso' : 'usos'}`;
    let v = '';
    if (c.valido_de && c.valido_ate) v = ` · de ${fmtData(c.valido_de)} a ${fmtData(c.valido_ate)}`;
    else if (c.valido_ate) v = ` · até ${fmtData(c.valido_ate)}`;
    else if (c.valido_de) v = ` · a partir de ${fmtData(c.valido_de)}`;
    return usos + v;
  }
  function situacao(c) {
    if (!c.ativo) return { cls: 'off', txt: 'Desligado' };
    if (c.expirado) return { cls: 'exp', txt: 'Expirado' };
    if (c.agendado) return { cls: 'agd', txt: 'Agendado' };
    if (c.usos_max && c.usos >= c.usos_max) return { cls: 'exp', txt: 'Esgotado' };
    return { cls: 'ok', txt: 'Ativo' };
  }

  function abrir() {
    if (aberto) return;
    aberto = true;
    const anterior = document.activeElement;
    let cupons = null;
    let erroLista = '';
    let tela = 'lista';      // lista | form
    let editando = null;     // cupom em edição (null = novo)
    let ocupado = false;

    const raiz = document.createElement('div');
    raiz.className = 'lprod';
    raiz.innerHTML = `
      <div class="lprod__fundo" data-lcp-fundo></div>
      <div class="lprod__caixa lcp" role="dialog" aria-modal="true" aria-labelledby="lcpTitulo" tabindex="-1"></div>`;
    document.body.appendChild(raiz);
    document.body.classList.add('lprod-aberto');
    const caixa = raiz.querySelector('.lcp');

    function fechar() {
      document.removeEventListener('keydown', teclas);
      document.querySelectorAll('body > .lcp__cal').forEach((n) => n.remove());
      raiz.classList.remove('is-open');
      document.body.classList.remove('lprod-aberto');
      aberto = false;
      setTimeout(() => raiz.remove(), 170);
      try { if (anterior && anterior.focus) anterior.focus(); } catch (_) { /* ok */ }
    }
    function teclas(e) {
      if (e.key === 'Escape' && !document.querySelector('.ib-dialogo')) {
        e.preventDefault();
        if (ocupado) return;
        if (tela === 'form') { tela = 'lista'; desenhar(); } else fechar();
      }
    }
    document.addEventListener('keydown', teclas);
    raiz.querySelector('[data-lcp-fundo]').addEventListener('click', () => { if (!ocupado) fechar(); });

    /* ---------------- lista ---------------- */
    function desenharLista() {
      let corpo;
      if (erroLista) {
        corpo = `<div class="lcp__vazio">${esc(erroLista)}</div>`;
      } else if (!cupons) {
        corpo = '<div class="lcp__vazio">Carregando cupons...</div>';
      } else if (!cupons.length) {
        corpo = '<div class="lcp__vazio">Nenhum cupom cadastrado ainda.<br>Use “Novo cupom” para criar o primeiro.</div>';
      } else {
        corpo = '<ul class="lcp__lista">' + cupons.map((c) => {
          const s = situacao(c);
          return `
            <li class="lcp__item${c.ativo ? '' : ' is-off'}">
              <div class="lcp__linha1"><strong class="lcp__cod">${esc(c.codigo)}</strong>
                <span class="lcp__badge lcp__badge--${s.cls}">${s.txt}</span></div>
              <div class="lcp__desc">${esc(rotuloValor(c))} · ${esc(resumoRegras(c))}</div>
              <div class="lcp__meta">${esc(resumoUso(c))}</div>
              <div class="lcp__acoes">
                <button type="button" class="lprod__link" data-acao="editar" data-codigo="${esc(c.codigo)}">Editar</button>
                <button type="button" class="lprod__link" data-acao="alternar" data-codigo="${esc(c.codigo)}">${c.ativo ? 'Desligar' : 'Ligar'}</button>
                <button type="button" class="lprod__link lprod__link--perigo" data-acao="remover" data-codigo="${esc(c.codigo)}">Remover</button>
              </div>
            </li>`;
        }).join('') + '</ul>';
      }
      caixa.innerHTML = `
        <h2 class="lprod__titulo" id="lcpTitulo">Cupons de desconto</h2>
        <p class="lprod__sub">Códigos que os usuários digitam em “Adicionar cupom” no carrinho e no checkout. O servidor confere validade, limites e valor mínimo a cada uso.</p>
        <div class="lprod__corpo">${corpo}<span class="lck__erro lck__erro--bloco" id="lcpErroGeral" role="alert"></span></div>
        <div class="lprod__acoes">
          <span></span>
          <div class="lprod__acoes-dir">
            <button type="button" class="ib-dialogo__btn ib-dialogo__btn--contorno" data-lcp-fechar>Fechar</button>
            <button type="button" class="ib-dialogo__btn ib-dialogo__btn--primario" data-lcp-novo ${erroLista ? 'disabled' : ''}>Novo cupom</button>
          </div>
        </div>`;
      caixa.querySelector('[data-lcp-fechar]').addEventListener('click', fechar);
      caixa.querySelector('[data-lcp-novo]').addEventListener('click', () => { editando = null; tela = 'form'; desenhar(); });
    }

    caixa.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-acao]');
      if (!b || ocupado || tela !== 'lista') return;
      const c = (cupons || []).find((x) => x.codigo === b.dataset.codigo);
      if (!c) return;
      const msg = caixa.querySelector('#lcpErroGeral');
      if (b.dataset.acao === 'editar') { editando = c; tela = 'form'; desenhar(); return; }
      try {
        if (b.dataset.acao === 'alternar') {
          ocupado = true;
          cupons = (await API.cuponsAdmin('alternar', { codigo: c.codigo, ativo: !c.ativo }, CSRF)).cupons;
        } else {
          const ok = window.IBDialogo
            ? await window.IBDialogo.confirmar({
              titulo: 'Remover cupom?',
              texto: `O cupom ${c.codigo} deixa de valer. Pedidos que já usaram ele continuam no histórico.`,
              confirmar: 'Remover', cancelar: 'Cancelar', perigo: true,
            })
            : window.confirm('Remover o cupom ' + c.codigo + '?');
          if (!ok) return;
          ocupado = true;
          cupons = (await API.cuponsAdmin('remover', { codigo: c.codigo }, CSRF)).cupons;
        }
        ocupado = false;
        desenhar();
      } catch (err) {
        ocupado = false;
        if (msg) msg.textContent = err.message;
      }
    });

    /* ---------------- formulário ---------------- */
    function campoTxt(id, rotulo, o = {}) {
      return `
        <div class="lcp__f ${o.cls || ''}">
          <label for="${id}">${rotulo}</label>
          <input id="${id}" type="${o.type || 'text'}" autocomplete="off" ${o.extra || ''}>
          ${o.dica ? `<small class="lcp__dica">${o.dica}</small>` : ''}
          <span class="lck__erro" id="${id}Erro" role="alert"></span>
        </div>`;
    }

    const ICO_CHEV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    const ICO_CAL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>';
    const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const pad2 = (n) => String(n).padStart(2, '0');
    const isoDe = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

    // Lista suspensa no mesmo visual do filtro de categorias da Loja
    function campoSelect(id, rotulo, opcoes) {
      return `
        <div class="lcp__f lcp__dd" data-lcp-dd="${id}">
          <label id="${id}Rot">${rotulo}</label>
          <input type="hidden" id="${id}">
          <div class="lcp__ctl">
            <button type="button" class="lcp__dd-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="${id}Rot">
              <span class="lcp__dd-txt"></span>${ICO_CHEV}
            </button>
            <div class="lcp__dd-panel" role="listbox" aria-labelledby="${id}Rot">
              ${opcoes.map((o) => `<button type="button" role="option" class="lcp__dd-item" data-valor="${o.valor}"><span>${o.nome}</span></button>`).join('')}
            </div>
          </div>
          <span class="lck__erro" id="${id}Erro" role="alert"></span>
        </div>`;
    }

    // Campo de data com calendário no mesmo visual da tela Agendar reunião
    function campoData(id, rotulo, o = {}) {
      return `
        <div class="lcp__f lcp__dt ${o.cls || ''}" data-lcp-dt="${id}">
          <label id="${id}Rot">${rotulo}</label>
          <input type="hidden" id="${id}">
          <div class="lcp__ctl">
            <button type="button" class="lcp__dt-btn" aria-haspopup="dialog" aria-expanded="false" aria-labelledby="${id}Rot">
              <span class="lcp__dt-txt"></span>${ICO_CAL}
            </button>
          </div>
          ${o.dica ? `<small class="lcp__dica">${o.dica}</small>` : ''}
          <span class="lck__erro" id="${id}Erro" role="alert"></span>
        </div>`;
    }

    // Liga todos os dropdowns e calendários do formulário (os valores ficam em <input type="hidden">)
    // Posiciona o pop-up por cima do modal (sem ser cortado pela rolagem), abrindo para cima se faltar espaço embaixo
    // `limite` (opcional): elemento dentro do qual o pop-up deve ficar por inteiro (o popout do cupom); sem ele, vale só a janela
    function posicionar(botao, pop, alinharDireita, igualarLargura, limite, soBaixo) {
      if (igualarLargura) pop.style.width = botao.offsetWidth + 'px';
      let minX = 8, maxX = window.innerWidth - 8, minY = 8, maxY = window.innerHeight - 8;
      if (limite) {
        const l = limite.getBoundingClientRect();
        minX = Math.max(minX, l.left + 8);
        maxX = Math.min(maxX, l.right - 8);
        minY = Math.max(minY, l.top + 8);
        maxY = Math.min(maxY, l.bottom - 8);
        pop.style.maxWidth = Math.max(0, maxX - minX) + 'px';
      }
      pop.style.left = '0px';
      pop.style.top = '0px';
      const origem = pop.getBoundingClientRect(); // origem do bloco de referência (viewport ou caixa do modal)
      const b = botao.getBoundingClientRect();
      const w = pop.offsetWidth;
      const h = pop.offsetHeight;
      let x = alinharDireita ? b.right - w : b.left;
      x = Math.max(minX, Math.min(x, maxX - w));
      let y = b.bottom + 6;
      if (!soBaixo && y + h > maxY && b.top - h - 6 >= minY) y = b.top - h - 6;
      if (limite) y = Math.max(minY, Math.min(y, maxY - h)); // sem espaço nem embaixo nem em cima: encosta dentro do popout
      pop.style.left = (x - origem.left) + 'px';
      pop.style.top = (y - origem.top) + 'px';
    }

    function ligarControles(form) {
      const fecharTodos = (exceto) => {
        form.querySelectorAll('.lcp__dd.is-open').forEach((w) => {
          if (w === exceto) return;
          w.classList.remove('is-open');
          w.querySelector('.lcp__dd-btn').setAttribute('aria-expanded', 'false');
        });
        form.querySelectorAll('.lcp__dt.is-open').forEach((w) => {
          if (w === exceto) return;
          if (w._fecharCal) w._fecharCal();
        });
      };
      // composedPath() é calculado na hora do clique: continua valendo mesmo se o botão clicado foi trocado por um redesenho do calendário
      form.addEventListener('click', (e) => {
        const dentro = e.composedPath().find((n) => n.classList && (n.classList.contains('lcp__dd') || n.classList.contains('lcp__dt')));
        fecharTodos(dentro || null);
      });
      const corpo = form.querySelector('.lprod__corpo');
      let travaRolagem = false; // a rolagem feita pelo próprio calendário (para abrir para baixo) não deve fechá-lo
      if (corpo) corpo.addEventListener('scroll', () => { if (!travaRolagem) fecharTodos(null); }, { passive: true });
      // O calendário sempre abre para baixo do campo. Se faltar espaço até o fim do popout, o corpo do formulário
      // rola (ganhando uma folga temporária no fim) para trazer o campo para cima, sem deixar o calendário passar da caixa.
      const garantirEspaco = (btn, cal) => {
        const limite = form.closest('.lprod__caixa');
        if (!corpo || !limite) return;
        const fundo = Math.min(limite.getBoundingClientRect().bottom, window.innerHeight) - 8;
        const b = btn.getBoundingClientRect();
        const falta = Math.ceil(b.bottom + 6 + cal.offsetHeight - fundo);
        if (falta <= 0) return;
        const topoCorpo = corpo.getBoundingClientRect().top;
        const rolar = Math.min(falta, Math.max(0, Math.floor(b.top - topoCorpo - 8))); // o campo nunca sai do alto da área visível
        if (rolar <= 0) return;
        travaRolagem = true;
        corpo.style.paddingBottom = (6 + Math.max(rolar, 0)) + 'px';
        corpo.scrollTop += rolar;
        setTimeout(() => { travaRolagem = false; }, 120);
      };
      const soltarEspaco = () => { if (corpo) corpo.style.paddingBottom = ''; };
      window.addEventListener('resize', () => { if (form.isConnected) fecharTodos(null); });
      form.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const w = form.querySelector('.lcp__dd.is-open, .lcp__dt.is-open');
        if (!w) return;
        e.stopPropagation();
        e.preventDefault();
        fecharTodos(null);
        const b = w.querySelector('.lcp__dd-btn, .lcp__dt-btn');
        if (b) b.focus();
      });

      form.querySelectorAll('.lcp__dd').forEach((w) => {
        const input = w.querySelector('input[type="hidden"]');
        const btn = w.querySelector('.lcp__dd-btn');
        const itens = Array.from(w.querySelectorAll('.lcp__dd-item'));
        const pintar = () => {
          let achou = itens[0];
          itens.forEach((it) => {
            const on = it.dataset.valor === input.value;
            it.classList.toggle('is-active', on);
            it.setAttribute('aria-selected', String(on));
            if (on) achou = it;
          });
          w.querySelector('.lcp__dd-txt').textContent = achou.textContent.trim();
        };
        input._pintar = pintar;
        pintar();
        btn.addEventListener('click', () => {
          const abrir = !w.classList.contains('is-open');
          fecharTodos(w);
          w.classList.toggle('is-open', abrir);
          btn.setAttribute('aria-expanded', String(abrir));
          if (abrir) {
            posicionar(btn, w.querySelector('.lcp__dd-panel'), false, true);
            (w.querySelector('.lcp__dd-item.is-active') || itens[0]).focus({ preventScroll: true });
          }
        });
        btn.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown' && !w.classList.contains('is-open')) { e.preventDefault(); btn.click(); }
        });
        w.querySelector('.lcp__dd-panel').addEventListener('keydown', (e) => {
          const i = itens.indexOf(document.activeElement);
          if (e.key === 'ArrowDown') { e.preventDefault(); itens[Math.min(i + 1, itens.length - 1)].focus(); }
          if (e.key === 'ArrowUp') { e.preventDefault(); itens[Math.max(i - 1, 0)].focus(); }
        });
        itens.forEach((it) => it.addEventListener('click', () => {
          input.value = it.dataset.valor;
          pintar();
          w.classList.remove('is-open');
          btn.setAttribute('aria-expanded', 'false');
          btn.focus();
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }));
      });

      // Calendário no mesmo padrão do "Calendário da equipe" (Equipes): abre solto no <body>,
      // setas ‹ ›, dias do mês vizinho esmaecidos e fade curto ao trocar de mês.
      form.querySelectorAll('.lcp__dt').forEach((w) => {
        const input = w.querySelector('input[type="hidden"]');
        const btn = w.querySelector('.lcp__dt-btn');
        const alinharDireita = w.classList.contains('lcp__dt--dir');
        const limiteCal = () => form.closest('.lprod__caixa') || null; // o calendário nunca passa da caixa do popout
        let cal = null;
        let mes = null;
        let soltar = null;
        const pintar = () => {
          const t = w.querySelector('.lcp__dt-txt');
          t.textContent = input.value ? fmtData(input.value) : 'dd/mm/aaaa';
          t.classList.toggle('is-vazio', !input.value);
        };
        input._pintar = pintar;
        pintar();

        const fecharCal = () => {
          if (soltar) soltar();
          if (cal) { cal.remove(); cal = null; }
          soltarEspaco();
          w.classList.remove('is-open');
          btn.setAttribute('aria-expanded', 'false');
        };
        w._fecharCal = fecharCal;

        const escolher = (iso) => {
          input.value = iso;
          pintar();
          fecharCal();
          btn.focus();
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };

        function desenharCal(animar) {
          const hoje = isoDe(new Date());
          const ano = mes.getFullYear();
          const m = mes.getMonth();
          const inicio = new Date(ano, m, 1).getDay();
          const total = new Date(ano, m + 1, 0).getDate();
          const diasAnt = new Date(ano, m, 0).getDate();
          let cel = '';
          for (let i = inicio - 1; i >= 0; i--) cel += `<span class="lcp__cal-dia lcp__cal-dia--fora">${diasAnt - i}</span>`;
          for (let d = 1; d <= total; d++) {
            const iso = ano + '-' + pad2(m + 1) + '-' + pad2(d);
            const marcado = iso === (input.value || hoje); // sem data escolhida, o dia de hoje já aparece marcado
            const cls = 'lcp__cal-dia' + (iso === hoje ? ' is-hoje' : '') + (marcado ? ' is-selecionado' : '');
            cel += `<button type="button" class="${cls}" data-iso="${iso}" aria-label="${d} de ${MESES[m].toLowerCase()} de ${ano}"${marcado ? ' aria-pressed="true"' : ''}>${d}</button>`;
          }
          const resto = (7 - ((inicio + total) % 7)) % 7;
          for (let d = 1; d <= resto; d++) cel += `<span class="lcp__cal-dia lcp__cal-dia--fora">${d}</span>`;
          cal.innerHTML = `
            <div class="lcp__cal-topo">
              <button type="button" class="lcp__cal-nav" data-nav="-1" aria-label="Mês anterior">‹</button>
              <strong class="lcp__cal-titulo" aria-live="polite">${MESES[m]} de ${ano}</strong>
              <button type="button" class="lcp__cal-nav" data-nav="1" aria-label="Próximo mês">›</button>
            </div>
            <div class="lcp__cal-grade${animar ? ' lcp__cal-grade--troca' : ''}">
              ${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((l) => `<span class="lcp__cal-sem">${l}</span>`).join('')}
              ${cel}
            </div>
            <div class="lcp__cal-rodape">
              ${input.value ? '<button type="button" class="lcp__cal-link lcp__cal-link--limpar" data-limpar>Limpar</button>' : '<span></span>'}
              <button type="button" class="lcp__cal-link" data-hoje>Hoje</button>
            </div>`;
        }

        btn.addEventListener('click', () => {
          const abrir = !w.classList.contains('is-open');
          fecharTodos(w);
          if (!abrir) { fecharCal(); return; }
          w.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
          const base = input.value ? new Date(input.value + 'T00:00:00') : new Date();
          mes = new Date(base.getFullYear(), base.getMonth(), 1);
          cal = document.createElement('div');
          cal.className = 'lcp__cal';
          cal.setAttribute('role', 'dialog');
          cal.setAttribute('aria-label', 'Escolher data');
          document.body.appendChild(cal);
          desenharCal(false);
          garantirEspaco(btn, cal);
          posicionar(btn, cal, alinharDireita, false, limiteCal(), true);
          // a animação de entrada nasce do lado do campo (abaixo dele, ou acima se faltou espaço)
          cal.style.transformOrigin = (cal.getBoundingClientRect().top < btn.getBoundingClientRect().top ? 'bottom' : 'top') + (alinharDireita ? ' right' : ' left');

          const atual = cal;
          cal.addEventListener('click', (e) => {
            const nav = e.target.closest('[data-nav]');
            if (nav) {
              const dir = Number(nav.dataset.nav);
              mes = new Date(mes.getFullYear(), mes.getMonth() + dir, 1);
              desenharCal(true);
              garantirEspaco(btn, cal);
              posicionar(btn, cal, alinharDireita, false, limiteCal(), true);
              const n = cal.querySelector(`[data-nav="${dir}"]`);
              if (n) n.focus({ preventScroll: true });
              return;
            }
            const dia = e.target.closest('[data-iso]');
            if (dia) return escolher(dia.dataset.iso);
            if (e.target.closest('[data-hoje]')) return escolher(isoDe(new Date()));
            if (e.target.closest('[data-limpar]')) escolher('');
          });
          cal.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            e.preventDefault();
            fecharCal();
            btn.focus();
          });
          // composedPath(): o clique em ‹ › troca o HTML do calendário, e o botão clicado deixa de estar no DOM
          const aoClicarFora = (e) => {
            if (!atual.isConnected) { soltar && soltar(); return; }
            const caminho = e.composedPath();
            if (!caminho.includes(atual) && !caminho.includes(btn)) fecharCal();
          };
          document.addEventListener('click', aoClicarFora);
          soltar = () => { document.removeEventListener('click', aoClicarFora); soltar = null; };
        });
        btn.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown' && !w.classList.contains('is-open')) { e.preventDefault(); btn.click(); }
        });
      });
    }

    function desenharForm() {
      const novo = !editando;
      caixa.innerHTML = `
        <form novalidate>
          <h2 class="lprod__titulo" id="lcpTitulo">${novo ? 'Novo cupom' : 'Editar cupom'}</h2>
          <p class="lprod__sub">${novo ? 'Defina o código e as regras do desconto.' : 'O código não pode ser mudado. As regras novas valem a partir de agora.'}</p>
          <div class="lprod__corpo">
            ${campoTxt('cpCodigo', 'Código', { extra: 'maxlength="30" autocapitalize="characters" spellcheck="false" placeholder="Ex.: INTEL10"' + (novo ? '' : ' disabled') })}
            <div class="lcp__grid">
              ${campoSelect('cpTipo', 'Tipo de desconto', [{ valor: 'percent', nome: 'Percentual (%)' }, { valor: 'valor', nome: 'Valor fixo (R$)' }])}
              ${campoTxt('cpValor', '<span id="cpValorRot">Percentual</span>', { extra: 'inputmode="decimal" maxlength="10" placeholder="Ex.: 10"', dica: 'Percentual de 0,01 a 90. O desconto nunca passa de 90% do subtotal; o frete não recebe desconto.' })}
            </div>
            <div class="lcp__grid">
              ${campoTxt('cpMinimo', 'Subtotal mínimo (opcional)', { extra: 'inputmode="decimal" maxlength="10" placeholder="Ex.: 100,00"', dica: 'Valor mínimo em produtos para o cupom valer.' })}
              ${campoTxt('cpPorUsuario', 'Usos por usuário (opcional)', { type: 'number', extra: 'min="1" max="1000" placeholder="Ex.: 1"', dica: '1 = cada pessoa usa uma vez só.' })}
            </div>
            <div class="lcp__grid">
              ${campoData('cpDe', 'Vale a partir de (opcional)')}
              ${campoData('cpAte', 'Vale até (opcional)', { cls: 'lcp__dt--dir', dica: 'Vale até o fim deste dia.' })}
            </div>
            ${campoTxt('cpUsosMax', 'Limite total de usos (opcional)', { type: 'number', extra: 'min="1" max="1000000" placeholder="Ex.: 100"', dica: 'Soma de todos os usuários. Pedido cancelado devolve o uso.' })}
            <label class="lcp__check"><input type="checkbox" id="cpAtivo"> Cupom ativo</label>
            <span class="lck__erro lck__erro--bloco" id="lcpErroGeral" role="alert"></span>
          </div>
          <div class="lprod__acoes">
            <span></span>
            <div class="lprod__acoes-dir">
              <button type="button" class="ib-dialogo__btn ib-dialogo__btn--contorno" data-lcp-voltar>Voltar</button>
              <button type="submit" class="ib-dialogo__btn ib-dialogo__btn--primario" id="cpSalvar">${novo ? 'Criar cupom' : 'Salvar alterações'}</button>
            </div>
          </div>
        </form>`;

      const el = (id) => caixa.querySelector('#' + id);
      el('cpCodigo').value = editando ? editando.codigo : '';
      el('cpTipo').value = editando ? editando.tipo : 'percent';
      el('cpValor').value = editando ? numPt(editando.valor) : '';
      el('cpMinimo').value = editando && editando.valor_minimo ? numPt(editando.valor_minimo.toFixed(2)) : '';
      el('cpPorUsuario').value = editando && editando.por_usuario ? editando.por_usuario : '';
      el('cpDe').value = editando && editando.valido_de ? editando.valido_de : '';
      el('cpAte').value = editando && editando.valido_ate ? editando.valido_ate : '';
      el('cpUsosMax').value = editando && editando.usos_max ? editando.usos_max : '';
      el('cpAtivo').checked = editando ? editando.ativo : true;

      ligarControles(caixa.querySelector('form'));

      const ajustarTipo = () => {
        const pct = el('cpTipo').value === 'percent';
        el('cpValorRot').textContent = pct ? 'Percentual (%)' : 'Valor do desconto (R$)';
        el('cpValor').placeholder = pct ? 'Ex.: 10' : 'Ex.: 50,00';
      };
      ajustarTipo();
      el('cpTipo').addEventListener('change', ajustarTipo);
      el('cpCodigo').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''); });
      ['cpValor', 'cpMinimo'].forEach((id) => el(id).addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^\d,.]/g, '');
      }));

      const erroCampo = (id, msg) => {
        const w = el(id) && el(id).closest('.lcp__f');
        if (w) w.classList.toggle('has-erro', !!msg);
        const o = el(id + 'Erro');
        if (o) o.textContent = msg || '';
      };
      caixa.querySelectorAll('input, select').forEach((i) => i.addEventListener('input', () => {
        erroCampo(i.id, '');
        el('lcpErroGeral').textContent = '';
      }));
      caixa.querySelector('[data-lcp-voltar]').addEventListener('click', () => { if (!ocupado) { tela = 'lista'; desenhar(); } });

      caixa.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (ocupado) return;
        el('lcpErroGeral').textContent = '';
        const campos = {
          codigo: el('cpCodigo').value.trim(),
          tipo: el('cpTipo').value,
          valor: el('cpValor').value.trim(),
          valor_minimo: el('cpMinimo').value.trim(),
          por_usuario: el('cpPorUsuario').value.trim(),
          valido_de: el('cpDe').value,
          valido_ate: el('cpAte').value,
          usos_max: el('cpUsosMax').value.trim(),
          ativo: el('cpAtivo').checked,
        };
        if (!campos.codigo) { erroCampo('cpCodigo', 'Informe o código do cupom'); el('cpCodigo').focus(); return; }
        if (!campos.valor) { erroCampo('cpValor', 'Informe o valor do desconto'); el('cpValor').focus(); return; }
        ocupado = true;
        const b = el('cpSalvar');
        b.disabled = true;
        b.textContent = 'Salvando...';
        try {
          cupons = (await API.cuponsAdmin(editando ? 'editar' : 'criar', campos, CSRF)).cupons;
          ocupado = false;
          tela = 'lista';
          desenhar();
        } catch (err) {
          ocupado = false;
          b.disabled = false;
          b.textContent = editando ? 'Salvar alterações' : 'Criar cupom';
          if (err.campo && el(err.campo)) { erroCampo(err.campo, err.message); el(err.campo).focus(); }
          else el('lcpErroGeral').textContent = err.message;
        }
      });
      (novo ? el('cpCodigo') : el('cpValor')).focus({ preventScroll: true });
    }

    function desenhar() {
      document.querySelectorAll('body > .lcp__cal').forEach((n) => n.remove());
      if (tela === 'form') desenharForm(); else desenharLista();
    }

    desenhar();
    requestAnimationFrame(() => raiz.classList.add('is-open'));
    caixa.focus({ preventScroll: true });

    API.cuponsAdmin('listar', {}, CSRF)
      .then((d) => { cupons = d.cupons; })
      .catch((err) => { erroLista = err.status === 503 ? err.message : (err.message || 'Não foi possível carregar os cupons.'); })
      .finally(() => { if (aberto && tela === 'lista') desenhar(); });
  }

  botao.addEventListener('click', abrir);
})();
