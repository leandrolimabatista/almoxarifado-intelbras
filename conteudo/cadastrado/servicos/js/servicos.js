// ============================================================
// CONTEÚDO — Serviços (área CADASTRADO)
// 1) Monta os cards a partir da lista SECOES (para incluir um
//    serviço novo, basta acrescentar um item).
// 2) Cada card abre em NOVA ABA apontando para a conta do usuário
//    logado (?authuser=<email>), lida de data-email (vem da sessão).
// 3) Botão "Recolher" do menu lateral (igual às demais páginas).
// ============================================================
(function () {
  // ---- Ícones: arquivos em conteudo/cadastrado/servicos/img/ ----
  // Coloque as imagens nessa pasta com os nomes do campo "icone" (ex.: gmail.png).
  // Se usar outro formato (svg, webp...), basta trocar EXTENSAO_ICONES.
  const PASTA_ICONES = 'conteudo/cadastrado/servicos/img/';
  const EXTENSAO_ICONES = 'png';

  const ICONE_EXTERNO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

  // ---- Catálogo (nome, descrição, URL base do serviço) ----
  const SECOES = [
    { titulo: 'Ferramentas Google', itens: [
      { nome: 'Gmail', icone: 'gmail', url: 'https://mail.google.com/mail/', desc: 'Acesse sua caixa de entrada e gerencie seus e-mails.' },
      { nome: 'Google Agenda', icone: 'agenda', url: 'https://calendar.google.com/calendar/', desc: 'Organize sua agenda e acompanhe seus compromissos.' },
      { nome: 'Google Drive', icone: 'drive', url: 'https://drive.google.com/drive/my-drive', desc: 'Armazene, acesse e compartilhe arquivos na nuvem.' },
      { nome: 'Google Docs', icone: 'docs', url: 'https://docs.google.com/document/', desc: 'Crie e edite documentos online com sua equipe.' },
      { nome: 'Google Planilhas', icone: 'planilhas', url: 'https://docs.google.com/spreadsheets/', desc: 'Crie e edite planilhas online de forma colaborativa.' },
      { nome: 'Google Apresentações', icone: 'slides', url: 'https://docs.google.com/presentation/', desc: 'Crie apresentações profissionais com colaboração em tempo real.' },
      { nome: 'Google Keep', icone: 'keep', url: 'https://keep.google.com/', desc: 'Anote ideias e lembretes e mantenha tudo organizado.' },
      { nome: 'Google Sites', icone: 'sites', url: 'https://sites.google.com/', desc: 'Crie sites internos para compartilhar informações e projetos.' }
    ]},
    { titulo: 'Comunicação', itens: [
      { nome: 'Google Chat', icone: 'chat', url: 'https://chat.google.com/', desc: 'Converse com sua equipe e colabore em tempo real.' },
      { nome: 'Google Meet', icone: 'meet', url: 'https://meet.google.com/', desc: 'Realize reuniões por vídeo com sua equipe.' }
    ]}
  ];

  const raiz = document.getElementById('servicosRaiz');
  const alvo = document.getElementById('servicosSecoes');
  const email = ((raiz && raiz.dataset.email) || '').trim();
  const emailValido = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);

  // Sem email válido (ex.: preview estático) abre o serviço sem o parâmetro
  function urlDoServico(base) {
    if (!emailValido) return base;
    return base + (base.includes('?') ? '&' : '?') + 'authuser=' + encodeURIComponent(email);
  }

  function cardHTML(s) {
    return `<article class="servicos__card">
      <div class="servicos__card-head">
        <span class="servicos__icon"><img src="${PASTA_ICONES}${s.icone}.${EXTENSAO_ICONES}" alt="" width="48" height="48" loading="lazy"></span>
        <div><h3 class="servicos__name">${s.nome}</h3><p class="servicos__desc">${s.desc}</p></div>
      </div>
      <a class="servicos__abrir" href="${urlDoServico(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${s.nome} em nova aba">Abrir ${ICONE_EXTERNO}</a>
    </article>`;
  }

  if (alvo) {
    alvo.innerHTML = SECOES.map(sec =>
      `<section class="servicos__section"><h2 class="servicos__section-title">${sec.titulo}</h2><div class="servicos__grid">${sec.itens.map(cardHTML).join('')}</div></section>`
    ).join('');
  }

  // Imagem ausente/quebrada: mostra um quadrado cinza em vez do ícone quebrado
  document.querySelectorAll('.servicos__icon img').forEach(img =>
    img.addEventListener('error', () => img.parentElement.classList.add('servicos__icon--vazio')));

  // ---- Menu lateral: botão "Recolher" ----
  const btnRecolher = document.getElementById('btnRecolher');
  const fecharMenu = () => document.body.classList.remove('sidebar-open');
  if (btnRecolher) btnRecolher.addEventListener('click', fecharMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharMenu(); });
})();
