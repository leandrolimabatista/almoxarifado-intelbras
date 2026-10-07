/* Seletor padrão: transforma todo <select data-seletor> no mesmo dropdown
   do filtro "Todos os usuários" (botão + menu com marca de selecionado).
   Funciona também para selects que entram depois na página. */
(function () {
  'use strict';
  if (window.__seletorPadrao) return;
  window.__seletorPadrao = true;

  const NS = 'http://www.w3.org/2000/svg';
  const ICONES = {
    seta: '<path d="M6 9l6 6 6-6"/>',
    marca: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  };

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function svg(nome, classe) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.8');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', classe);
    s.innerHTML = ICONES[nome];
    return s;
  }

  const menu = el('div', 'seletor__menu');
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  let aberto = null;

  function garantirMenu() {
    if (!menu.isConnected) document.body.appendChild(menu);
  }

  function abrir(select, botao) {
    garantirMenu();
    fechar(false);
    menu.textContent = '';
    Array.from(select.options).forEach((op) => {
      if (op.disabled && op.value === '') return; // placeholder não é escolha
      if (op.value === '' && !op.textContent.trim()) return; // opção em branco
      const item = el('button', 'seletor__item');
      item.type = 'button';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(op.selected));
      item.appendChild(el('span', 'seletor__item-texto', op.textContent.trim()));
      if (op.selected) item.appendChild(svg('marca', 'seletor__marca'));
      item.addEventListener('click', () => escolher(select, op.value));
      menu.appendChild(item);
    });

    const r = botao.getBoundingClientRect();
    menu.style.minWidth = Math.round(r.width) + 'px';
    menu.style.visibility = 'hidden';
    menu.hidden = false;
    const w = menu.offsetWidth, h = menu.offsetHeight;
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = r.right - w;
    left = Math.max(8, left);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.visibility = '';

    botao.setAttribute('aria-expanded', 'true');
    aberto = { select, botao, quando: Date.now() };
    const foco = menu.querySelector('[aria-selected="true"]') || menu.querySelector('.seletor__item');
    if (foco) foco.focus();
  }

  function fechar(devolverFoco) {
    if (!aberto) return;
    const botao = aberto.botao;
    aberto = null;
    menu.hidden = true;
    menu.textContent = '';
    botao.setAttribute('aria-expanded', 'false');
    if (devolverFoco && document.body.contains(botao)) botao.focus();
  }

  function escolher(select, valor) {
    const mudou = select.value !== valor;
    select.value = valor;
    fechar(true);
    if (mudou) select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aberto) {
      e.stopPropagation();
      fechar(true);
    }
  }, true);
  document.addEventListener('pointerdown', (e) => {
    if (!aberto) return;
    if (menu.contains(e.target) || aberto.botao.contains(e.target)) return;
    fechar(false);
  });
  window.addEventListener('scroll', (e) => {
    if (!aberto || menu.contains(e.target)) return;
    if (Date.now() - aberto.quando < 250) return;
    fechar(false);
  }, true);
  window.addEventListener('resize', () => fechar(false));

  menu.addEventListener('keydown', (e) => {
    const itens = Array.from(menu.querySelectorAll('.seletor__item'));
    const i = itens.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); itens[(i + 1) % itens.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); itens[(i - 1 + itens.length) % itens.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); itens[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); itens[itens.length - 1].focus(); }
    else if (e.key === 'Tab') { fechar(false); }
  });

  const valorNativo = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');

  function aprimorar(select) {
    if (select.dataset.seletorPronto) return;
    select.dataset.seletorPronto = '1';

    const envoltorio = el('span', 'seletor');
    const botao = el('button', 'seletor__botao');
    botao.type = 'button';
    botao.setAttribute('aria-haspopup', 'listbox');
    botao.setAttribute('aria-expanded', 'false');
    const texto = el('span', 'seletor__texto');
    botao.appendChild(texto);
    botao.appendChild(svg('seta', 'seletor__seta'));

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
    select.classList.add('seletor__nativo');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    function atualizar() {
      const op = select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
      texto.textContent = op ? op.textContent.trim() : 'Selecione';
      botao.classList.toggle('seletor__botao--vazio', !op || op.value === '');
    }
    function espelhar() {
      envoltorio.classList.toggle('seletor--invalido', select.classList.contains('is-invalid'));
      botao.disabled = select.disabled;
    }

    Object.defineProperty(select, 'value', {
      configurable: true,
      get() { return valorNativo.get.call(this); },
      set(v) { valorNativo.set.call(this, v); atualizar(); },
    });
    new MutationObserver(atualizar).observe(select, { childList: true, subtree: true, characterData: true });
    new MutationObserver(espelhar).observe(select, { attributes: true, attributeFilter: ['class', 'disabled'] });
    if (select.form) select.form.addEventListener('reset', () => setTimeout(atualizar, 0));
    select.addEventListener('focus', () => botao.focus());
    select.addEventListener('change', atualizar); // autofill / alteração nativa

    botao.addEventListener('click', () => {
      if (aberto && aberto.botao === botao) fechar(true);
      else abrir(select, botao);
    });
    botao.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); abrir(select, botao); }
    });

    atualizar();
    espelhar();
  }

  function varrer(raiz) {
    if (raiz.matches && raiz.matches('select[data-seletor]')) aprimorar(raiz);
    if (raiz.querySelectorAll) raiz.querySelectorAll('select[data-seletor]').forEach(aprimorar);
  }

  varrer(document);
  new MutationObserver((muts) => {
    muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) varrer(n); }));
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
