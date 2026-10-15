// ============================================================
// CABEÇALHO — Intelbras
// O botão "Todas categorias" abre/fecha o menu lateral
// (marcação em conteudo/nao-cadastrado/inicio/html/inicio.html), alternando a classe
// "sidebar-open" no <body>. O próprio CSS do conteúdo reage
// a essa classe — funciona mesmo o cabeçalho e o conteúdo
// sendo componentes carregados separadamente.
// ============================================================
(function () {
  const btnCategorias = document.getElementById('btnCategorias');
  if (btnCategorias) {
    btnCategorias.addEventListener('click', (ev) => {
      // Clique/toque (detail > 0): tira o foco para o anel verde de foco
      // (movimento.css) não ficar "preso" em volta do ícone. Pelo teclado
      // (Enter/Espaço: detail = 0) o foco continua visível.
      if (ev.detail > 0) btnCategorias.blur();
      const aberto = document.body.classList.toggle('sidebar-open');
      // Lembra a preferência entre navegações (cada troca de aba é um
      // reload de página PHP) para o menu continuar aberto/fechado do
      // jeito que o usuário deixou.
      // Em tela estreita (gaveta) o estado não é lembrado: só vale na página atual.
      // Só vale enquanto a aba estiver aberta (sessionStorage): ao abrir o site de novo, começa fechado.
      if (!window.matchMedia('(max-width: 860px)').matches) {
        try { sessionStorage.setItem('sidebarOpen', aberto ? '1' : '0'); } catch (err) { /* ignora */ }
      }
    });
  }

  // Abre/fecha a barra de busca no mobile ao tocar no ícone de lupa
  const btnSearchToggle = document.getElementById('btnSearchToggle');
  const headerSearch = document.getElementById('headerSearch');
  const btnSearchClose = document.getElementById('btnSearchClose');

  if (btnSearchToggle && headerSearch) {
    btnSearchToggle.addEventListener('click', (ev) => {
      const isOpen = headerSearch.classList.toggle('is-open');
      btnSearchToggle.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        const input = headerSearch.querySelector('.header__search-input');
        if (input) input.focus();
      }
    });
  }

  if (btnSearchClose && headerSearch) {
    btnSearchClose.addEventListener('click', () => {
      headerSearch.classList.remove('is-open');
      if (btnSearchToggle) btnSearchToggle.setAttribute('aria-expanded', 'false');
    });
  }

  // ==========================================================
  // DROPDOWN DE LOGIN
  // Abre ao clicar em "Entrar" (link) ou no ícone do usuário,
  // ancorado logo abaixo da área do usuário no cabeçalho.
  // Dentro do mesmo popout, "Entrar com email e senha" troca a
  // etapa 1 (escolha) pela etapa 2 (formulário completo).
  // ==========================================================
  const headerUser = document.querySelector('.header__user');
  const loginModal = document.getElementById('loginModal');
  const loginModalTitle = document.getElementById('loginModalTitle');
  const btnAbrirLoginModal = document.getElementById('btnAbrirLoginModal');
  const btnAbrirLoginModalIcon = document.getElementById('btnAbrirLoginModalIcon');
  const btnCadastrar = document.getElementById('btnCadastrar');
  const btnEntrarEmailSenha = document.getElementById('btnEntrarEmailSenha');
  const btnVoltarLogin = document.getElementById('btnVoltarLogin');
  const btnVoltarCadastro = document.getElementById('btnVoltarCadastro');
  const loginStepChoice = document.getElementById('loginStepChoice');
  const loginStepForm = document.getElementById('loginStepForm');
  const loginEmail = document.getElementById('loginEmail');
  const loginSenha = document.getElementById('loginSenha');
  const cadastroStepForm = document.getElementById('cadastroStepForm');
  const loginForm = document.getElementById('loginStepForm');
  const cadastroForm = document.getElementById('cadastroStepForm');
  const esqueciStepForm = document.getElementById('esqueciStepForm');
  const redefinirStepForm = document.getElementById('redefinirStepForm');
  const linkEsqueciSenha = document.getElementById('linkEsqueciSenha');
  const btnVoltarEsqueci = document.getElementById('btnVoltarEsqueci');

  const TITULO_ESQUECI = 'Recuperar senha:';
  const TITULO_REDEFINIR = 'Crie uma nova senha:';
  const TITULO_ACESSO = 'Acesse sua conta:';
  const TITULO_CADASTRO = 'Faça seu cadastro:';

  function isLoginModalOpen() {
    return !!(loginModal && loginModal.classList.contains('is-open'));
  }

  function abrirLoginModal(event) {
    if (event) event.preventDefault();
    if (!loginModal) return;
    // Sempre reabre na etapa 1 (escolha do método)
    mostrarEtapaChoice();
    loginModal.classList.add('is-open');
    loginModal.setAttribute('aria-hidden', 'false');
  }

  function fecharLoginModal() {
    if (!loginModal) return;
    loginModal.classList.remove('is-open');
    loginModal.setAttribute('aria-hidden', 'true');
  }

  function alternarLoginModal(event) {
    if (event) event.preventDefault();
    if (isLoginModalOpen()) {
      fecharLoginModal();
    } else {
      abrirLoginModal();
    }
  }

  function esconderTodasEtapas() {
    if (loginStepChoice) loginStepChoice.hidden = true;
    if (loginStepForm) loginStepForm.hidden = true;
    if (cadastroStepForm) cadastroStepForm.hidden = true;
    if (esqueciStepForm) esqueciStepForm.hidden = true;
    if (redefinirStepForm) redefinirStepForm.hidden = true;
  }

  function mostrarEtapaForm() {
    esconderTodasEtapas();
    if (loginStepForm) loginStepForm.hidden = false;
    if (loginModalTitle) loginModalTitle.textContent = TITULO_ACESSO;
  }

  function mostrarEtapaChoice() {
    esconderTodasEtapas();
    if (loginStepChoice) loginStepChoice.hidden = false;
    if (loginModalTitle) loginModalTitle.textContent = TITULO_ACESSO;
  }

  function mostrarEtapaEsqueci() {
    esconderTodasEtapas();
    if (esqueciStepForm) esqueciStepForm.hidden = false;
    if (loginModalTitle) loginModalTitle.textContent = TITULO_ESQUECI;
    const erro = document.getElementById('erroEsqueci');
    const ok = document.getElementById('okEsqueci');
    if (erro) erro.textContent = '';
    if (ok) ok.textContent = '';
    const campo = document.getElementById('esqueciEmail');
    if (campo) {
      // Aproveita o email já digitado no login, se houver
      if (!campo.value && loginEmail && loginEmail.value.trim()) campo.value = loginEmail.value.trim();
      campo.classList.remove('is-invalid');
    }
  }

  function mostrarEtapaRedefinir() {
    esconderTodasEtapas();
    if (redefinirStepForm) redefinirStepForm.hidden = false;
    if (loginModalTitle) loginModalTitle.textContent = TITULO_REDEFINIR;
  }

  function mostrarEtapaCadastro() {
    esconderTodasEtapas();
    if (cadastroStepForm) cadastroStepForm.hidden = false;
    if (loginModalTitle) loginModalTitle.textContent = TITULO_CADASTRO;
  }

  // ------------------------------------------------------------
  // Popout "Cadastrado concluído ✅" — EXATAMENTE o mesmo componente
  // visual do popout global "Acesso negado"
  // (assets/js/popout-bloqueio.js: toast fixo no topo central, com
  // os blobs verdes, o card arredondado e o botão em pílula), só
  // que criado aqui porque é específico do fluxo de cadastro e o
  // clique no botão leva pra etapa de login em vez de abri-la do
  // zero.
  // ------------------------------------------------------------
  let popoutCadastroEl = null;
  let timeoutPopoutCadastro = null;
  let ultimoEmailCadastrado = '';

  function fecharPopoutCadastroConcluido() {
    clearTimeout(timeoutPopoutCadastro);
    if (popoutCadastroEl) popoutCadastroEl.classList.remove('is-open');
  }

  function mostrarPopoutCadastroConcluido(email) {
    ultimoEmailCadastrado = email || '';

    if (!popoutCadastroEl) {
      const el = document.createElement('div');
      el.className = 'acesso-negado acesso-negado--cadastro';
      el.setAttribute('role', 'status');
      el.innerHTML = [
        '<div class="acesso-negado__card">',
        '  <span class="acesso-negado__blob acesso-negado__blob--tl" aria-hidden="true"></span>',
        '  <span class="acesso-negado__blob acesso-negado__blob--br" aria-hidden="true"></span>',
        '  <div class="acesso-negado__topo">',
        '    <span class="acesso-negado__titulo">Cadastrado concluído ✅</span>',
        '  </div>',
        '  <button type="button" class="acesso-negado__btn" id="btnCadastroConcluidoLogin">Aguarde a confirmação para fazer login</button>',
        '</div>',
      ].join('');
      document.body.appendChild(el);
      popoutCadastroEl = el;

      const btnLogin = el.querySelector('#btnCadastroConcluidoLogin');
      btnLogin.addEventListener('click', (e) => {
        // Sem isso, o listener global "clique fora fecha o modal"
        // (mais abaixo neste arquivo) entende que o clique veio de
        // fora do dropdown — já que este popout é anexado direto no
        // <body>, fora do .header__user — e fecha o modal bem na
        // hora que a gente está tentando abri-lo.
        e.stopPropagation();

        fecharPopoutCadastroConcluido();

        // Garante que o modal esteja aberto (ele pode já estar
        // fechado nesse ponto) antes de trocar pra etapa de login.
        if (loginModal) {
          loginModal.classList.add('is-open');
          loginModal.setAttribute('aria-hidden', 'false');
        }

        mostrarEtapaForm();
        if (loginEmail) loginEmail.value = ultimoEmailCadastrado;
        if (loginSenha) {
          loginSenha.value = '';
          loginSenha.focus();
        }
      });
    }

    popoutCadastroEl.classList.remove('is-open');
    requestAnimationFrame(() => popoutCadastroEl.classList.add('is-open'));

    clearTimeout(timeoutPopoutCadastro);
    timeoutPopoutCadastro = setTimeout(fecharPopoutCadastroConcluido, 2000);
  }

  // ------------------------------------------------------------
  // Popout "... já cadastrado ⚠️" — mesmo componente visual dos
  // outros dois (acesso negado / cadastrado concluído), mas o
  // texto muda de acordo com quais campos já existem no banco
  // (email, telefone e/ou CPF), conforme o array "campos" que o
  // api/cadastro.php devolve numa resposta 409.
  //
  // Suporta "combo": se mais de um campo estiver duplicado ao
  // mesmo tempo (ex.: email E cpf), as duas coisas são citadas
  // numa mensagem só, em vez de mostrar dois avisos em sequência.
  // Tabela de combinações:
  //   email                    -> E-mail já cadastrado. Utilize outro.
  //   telefone                 -> Telefone já cadastrado. Utilize outro.
  //   cpf                      -> CPF já cadastrado. Utilize outro.
  //   email + telefone         -> E-mail e telefone já cadastrados. Utilize outros.
  //   email + cpf              -> E-mail e CPF já cadastrados. Utilize outros.
  //   telefone + cpf           -> Telefone e CPF já cadastrados. Utilize outros.
  //   email + telefone + cpf   -> E-mail, telefone e CPF já cadastrados. Utilize outros.
  // ------------------------------------------------------------
  const CAMPO_DUPLICADO_LABEL = {
    email: 'E-mail',
    telefone: 'Telefone',
    cpf: 'CPF',
  };

  // Sempre citamos os campos nessa ordem, independente da ordem em
  // que vieram do backend, pra mensagem ficar sempre previsível.
  const ORDEM_CAMPOS = ['email', 'telefone', 'cpf'];

  function juntarComVirgulasE(itens) {
    if (itens.length <= 1) return itens.join('');
    if (itens.length === 2) return `${itens[0]} e ${itens[1]}`;
    return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
  }

  function construirMensagemDuplicado(campos) {
    const labels = ORDEM_CAMPOS
      .filter((campo) => campos.includes(campo))
      .map((campo) => CAMPO_DUPLICADO_LABEL[campo] || 'Dado');

    const nomes = juntarComVirgulasE(labels);
    const plural = labels.length > 1;

    return `${nomes} já ${plural ? 'cadastrados' : 'cadastrado'}. Utilize ${plural ? 'outros' : 'outro'}.`;
  }

  let popoutDuplicadoEl = null;
  let timeoutPopoutDuplicado = null;

  function fecharPopoutCadastroDuplicado() {
    clearTimeout(timeoutPopoutDuplicado);
    if (popoutDuplicadoEl) popoutDuplicadoEl.classList.remove('is-open');
  }

  function mostrarPopoutCadastroDuplicado(campos) {
    // Aceita tanto o array novo (['email','cpf']) quanto, por
    // segurança, uma string única antiga ('email'), caso alguma
    // resposta ainda venha no formato anterior.
    const listaCampos = Array.isArray(campos) ? campos : [campos].filter(Boolean);
    if (listaCampos.length === 0) return;

    const mensagem = construirMensagemDuplicado(listaCampos);

    if (!popoutDuplicadoEl) {
      const el = document.createElement('div');
      el.className = 'acesso-negado acesso-negado--duplicado';
      el.setAttribute('role', 'alert');
      document.body.appendChild(el);
      popoutDuplicadoEl = el;
    }

    // O texto muda a cada chamada (email/telefone/cpf e combinações),
    // então o conteúdo é sempre reconstruído aqui, em vez de ficar em
    // cache como no popout de sucesso (que tem texto fixo).
    popoutDuplicadoEl.innerHTML = [
      '<div class="acesso-negado__card">',
      '  <span class="acesso-negado__blob acesso-negado__blob--tl" aria-hidden="true"></span>',
      '  <span class="acesso-negado__blob acesso-negado__blob--br" aria-hidden="true"></span>',
      '  <div class="acesso-negado__topo">',
      '    <span class="acesso-negado__titulo">Já cadastrado ⚠️</span>',
      '  </div>',
      `  <span class="acesso-negado__msg">${mensagem}</span>`,
      '</div>',
    ].join('');

    popoutDuplicadoEl.classList.remove('is-open');
    requestAnimationFrame(() => popoutDuplicadoEl.classList.add('is-open'));

    clearTimeout(timeoutPopoutDuplicado);
    timeoutPopoutDuplicado = setTimeout(fecharPopoutCadastroDuplicado, 2000);
  }

  if (btnAbrirLoginModal) {
    btnAbrirLoginModal.addEventListener('click', alternarLoginModal);
  }

  if (btnAbrirLoginModalIcon) {
    btnAbrirLoginModalIcon.addEventListener('click', alternarLoginModal);
  }

  if (btnCadastrar) {
    btnCadastrar.addEventListener('click', mostrarEtapaCadastro);
  }

  if (btnEntrarEmailSenha) {
    btnEntrarEmailSenha.addEventListener('click', mostrarEtapaForm);
  }

  if (btnVoltarLogin) {
    btnVoltarLogin.addEventListener('click', mostrarEtapaChoice);
  }

  if (btnVoltarCadastro) {
    btnVoltarCadastro.addEventListener('click', mostrarEtapaChoice);
  }

  // Guarda onde o clique começou: se a pessoa pressionou o mouse DENTRO
  // do popout (ex.: selecionando texto num campo) e soltou fora, o
  // navegador dispara o "click" no elemento pai comum — isso não é um
  // clique fora e não pode fechar o popout.
  let cliqueComecouNoLogin = false;
  document.addEventListener('pointerdown', (e) => {
    cliqueComecouNoLogin = !!(loginModal && loginModal.contains(e.target));
  }, true);

  // Fecha ao clicar fora do dropdown (em qualquer lugar da página)
  document.addEventListener('click', (e) => {
    if (!isLoginModalOpen()) return;
    // O menu do select de Gênero (assets/js/seletor.js) é anexado ao
    // <body>, fora do popout, e ao escolher uma opção ele limpa o próprio
    // conteúdo ANTES deste listener rodar — o item clicado já saiu do DOM
    // e .closest() não o acha mais. Por isso olhamos o caminho do evento
    // (calculado na hora do clique) e ignoramos alvos que já foram
    // removidos da página: nenhum dos dois é "clicar fora".
    const caminho = typeof e.composedPath === 'function' ? e.composedPath() : [];
    if (caminho.some((n) => n && n.classList && n.classList.contains('seletor__menu'))) return;
    if (!document.documentElement.contains(e.target)) return;
    if (cliqueComecouNoLogin) { cliqueComecouNoLogin = false; return; }
    if (headerUser && !headerUser.contains(e.target)) {
      fecharLoginModal();
    }
  });

  // Evita que cliques dentro do próprio dropdown o fechem
  if (loginModal) {
    loginModal.addEventListener('click', (e) => e.stopPropagation());
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isLoginModalOpen()) {
      fecharLoginModal();
    }
  });

  // Abre o dropdown de login quando o popout global de "Acesso negado"
  // (assets/js/popout-bloqueio.js) avisa que o usuário clicou em
  // "Faça login para desbloquear" numa interação bloqueada.
  // Expomos a função globalmente porque o popout carrega antes deste
  // arquivo (este vem via fetch, então chega depois) — se o clique
  // aconteceu antes de chegarmos aqui, window.__intelbrasLoginPendente
  // guarda esse "recado" e nós o resolvemos agora, na hora que o
  // cabeçalho termina de carregar, em vez de perder o clique.
  window.intelbrasAbrirLogin = abrirLoginModal;
  if (window.__intelbrasLoginPendente) {
    window.__intelbrasLoginPendente = false;
    abrirLoginModal();
  }
  document.addEventListener('intelbras:abrir-login', () => abrirLoginModal());

  // Mostrar/ocultar senha — funciona para qualquer campo de senha do
  // popout (login, senha do cadastro e repetir senha do cadastro),
  // cada botão aponta pro seu input via [data-target]
  document.querySelectorAll('.login-modal__toggle-senha').forEach((btn) => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    btn.addEventListener('click', () => {
      const isVisible = input.type === 'text';
      input.type = isVisible ? 'password' : 'text';
      btn.setAttribute('aria-pressed', String(!isVisible));
      btn.setAttribute('aria-label', isVisible ? 'Mostrar senha' : 'Ocultar senha');
    });
  });

  // ==========================================================
  // MÁSCARAS DO FORMULÁRIO DE CADASTRO
  // ==========================================================

  // Campos de texto simples do cadastro (usados na validação, mais abaixo)
  const cadastroNome = document.getElementById('cadastroNome');
  const cadastroEmail = document.getElementById('cadastroEmail');
  const cadastroSenha = document.getElementById('cadastroSenha');
  const cadastroRepetirSenha = document.getElementById('cadastroRepetirSenha');

  // Data de nascimento: dd/mm/aaaa — a barra entra sozinha conforme
  // a pessoa digita (2 dígitos -> dia, +2 -> mês, +4 -> ano)
  const cadastroDataNascimento = document.getElementById('cadastroDataNascimento');
  if (cadastroDataNascimento) {
    cadastroDataNascimento.addEventListener('input', () => {
      let v = cadastroDataNascimento.value.replace(/\D/g, '').slice(0, 8);
      if (v.length > 4) {
        v = v.replace(/^(\d{2})(\d{2})(\d{0,4})/, '$1/$2/$3');
      } else if (v.length > 2) {
        v = v.replace(/^(\d{2})(\d{0,2})/, '$1/$2');
      }
      cadastroDataNascimento.value = v;
    });
  }

  // Telefone: (00) 00000-0000
  const cadastroTelefone = document.getElementById('cadastroTelefone');
  if (cadastroTelefone) {
    cadastroTelefone.addEventListener('input', () => {
      let v = cadastroTelefone.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 10) {
        v = v.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
      } else if (v.length > 6) {
        v = v.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
      } else if (v.length > 2) {
        v = v.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
      } else if (v.length > 0) {
        v = v.replace(/^(\d{0,2})/, '($1');
      }
      cadastroTelefone.value = v;
    });
  }

  // CPF: 000.000.000-00
  const cadastroCpf = document.getElementById('cadastroCpf');
  if (cadastroCpf) {
    cadastroCpf.addEventListener('input', () => {
      let v = cadastroCpf.value.replace(/\D/g, '').slice(0, 11);
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      cadastroCpf.value = v;
    });
  }

  // Gênero: ao escolher "Outro (Qual?)" aparece um campo pra especificar
  const cadastroGenero = document.getElementById('cadastroGenero');
  const cadastroGeneroOutroWrap = document.getElementById('cadastroGeneroOutroWrap');
  const cadastroGeneroOutro = document.getElementById('cadastroGeneroOutro');
  const cadastroEquipe = document.getElementById('cadastroEquipe');
  if (cadastroGenero && cadastroGeneroOutroWrap) {
    cadastroGenero.addEventListener('change', () => {
      const isOutro = cadastroGenero.value === 'outro';
      cadastroGeneroOutroWrap.hidden = !isOutro;
      if (!isOutro && cadastroGeneroOutro) cadastroGeneroOutro.value = '';
    });
  }

  // ------------------------------------------------------------
  // "Esqueci minha senha": pede o email -> api/esqueci_senha.php envia
  // o link pela Brevo -> o link abre index.php?redefinir_senha=TOKEN e
  // o popout mostra a etapa "nova senha" -> api/redefinir_senha.php.
  // ------------------------------------------------------------
  if (linkEsqueciSenha) {
    linkEsqueciSenha.addEventListener('click', (e) => {
      e.preventDefault();
      mostrarEtapaEsqueci();
    });
  }

  if (btnVoltarEsqueci) {
    btnVoltarEsqueci.addEventListener('click', mostrarEtapaForm);
  }

  if (esqueciStepForm) {
    esqueciStepForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const campo = document.getElementById('esqueciEmail');
      const erro = document.getElementById('erroEsqueci');
      const ok = document.getElementById('okEsqueci');
      const email = campo ? campo.value.trim() : '';
      erro.textContent = '';
      ok.textContent = '';
      campo.classList.remove('is-invalid');

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        campo.classList.add('is-invalid');
        erro.textContent = 'Informe um email válido.';
        return;
      }

      const botao = esqueciStepForm.querySelector('.login-modal__submit');
      const textoOriginal = botao.textContent;
      botao.disabled = true;
      botao.textContent = 'Enviando...';

      fetch('api/esqueci_senha.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
        .then((r) => r.json().then((dados) => ({ status: r.status, dados })))
        .then(({ status, dados }) => {
          if (status === 200 && dados.sucesso) {
            ok.textContent = dados.mensagem || 'Pronto! Confira seu email.';
          } else {
            campo.classList.add('is-invalid');
            erro.textContent = dados.erro || 'Não foi possível enviar agora. Tente novamente.';
          }
        })
        .catch(() => {
          erro.textContent = 'Erro de conexão. Verifique sua internet e tente novamente.';
        })
        .finally(() => {
          botao.disabled = false;
          botao.textContent = textoOriginal;
        });
    });
  }

  let tokenRedefinicao = '';

  if (redefinirStepForm) {
    redefinirStepForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const campoSenha = document.getElementById('redefinirSenha');
      const campoRep = document.getElementById('redefinirRepetirSenha');
      const erro = document.getElementById('erroRedefinir');
      erro.textContent = '';
      [campoSenha, campoRep].forEach((c) => c.classList.remove('is-invalid'));

      const senha = campoSenha.value;
      const rep = campoRep.value;
      if (!senhaForte(senha)) {
        campoSenha.classList.add('is-invalid');
        erro.textContent = 'Use ao menos 8 caracteres, com uma letra maiúscula, um número e um caractere especial.';
        return;
      }
      if (senha !== rep) {
        campoRep.classList.add('is-invalid');
        erro.textContent = 'As senhas não coincidem.';
        return;
      }

      const botao = redefinirStepForm.querySelector('.login-modal__submit');
      const textoOriginal = botao.textContent;
      botao.disabled = true;
      botao.textContent = 'Salvando...';

      fetch('api/redefinir_senha.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenRedefinicao, senha, repetir_senha: rep }),
      })
        .then((r) => r.json().then((dados) => ({ status: r.status, dados })))
        .then(({ status, dados }) => {
          if (status === 200 && dados.sucesso) {
            tokenRedefinicao = '';
            campoSenha.value = '';
            campoRep.value = '';
            // Volta ao login com um aviso de sucesso
            mostrarEtapaForm();
            const erroLogin = document.getElementById('erroLogin');
            if (erroLogin) erroLogin.textContent = '';
            if (loginSenha) { loginSenha.value = ''; loginSenha.focus(); }
            const aviso = document.getElementById('okLoginRedefinido');
            if (aviso) aviso.textContent = 'Senha alterada! Entre com a nova senha.';
            return;
          }
          erro.textContent = dados.erro || 'Não foi possível salvar a senha. Tente novamente.';
          if (status === 410) {
            // link expirado/usado: leva o usuário a pedir outro
            setTimeout(mostrarEtapaEsqueci, 2500);
          }
        })
        .catch(() => {
          erro.textContent = 'Erro de conexão. Verifique sua internet e tente novamente.';
        })
        .finally(() => {
          botao.disabled = false;
          botao.textContent = textoOriginal;
        });
    });
  }

  // Link do email: index.php?redefinir_senha=TOKEN
  (function abrirRedefinicaoPeloLink() {
    if (!loginModal || !redefinirStepForm) return;
    const params = new URLSearchParams(window.location.search);
    const token = (params.get('redefinir_senha') || '').trim();
    if (!token) return;

    // Tira o token da barra de endereço (não fica no histórico nem vaza em Referer)
    params.delete('redefinir_senha');
    const resto = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (resto ? '?' + resto : '') + window.location.hash);

    fetch('api/redefinir_senha.php?token=' + encodeURIComponent(token))
      .then((r) => r.json())
      .then((dados) => {
        loginModal.classList.add('is-open');
        loginModal.setAttribute('aria-hidden', 'false');
        if (dados && dados.valido) {
          tokenRedefinicao = token;
          mostrarEtapaRedefinir();
          const campo = document.getElementById('redefinirSenha');
          if (campo) campo.focus();
        } else {
          mostrarEtapaEsqueci();
          const erro = document.getElementById('erroEsqueci');
          if (erro) erro.textContent = 'Este link expirou ou já foi usado. Peça um novo abaixo.';
        }
      })
      .catch(() => { /* sem rede: o usuário pode pedir outro link normalmente */ });
  })();

  // Envio do formulário de login
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const erroLogin = document.getElementById('erroLogin');
      const email = loginEmail ? loginEmail.value.trim() : '';
      const senha = loginSenha ? loginSenha.value : '';

      if (erroLogin) erroLogin.textContent = '';
      [loginEmail, loginSenha].forEach((input) => {
        if (input) input.classList.remove('is-invalid');
      });

      if (!email || !senha) {
        if (erroLogin) erroLogin.textContent = 'Preencha email e senha.';
        if (!email && loginEmail) loginEmail.classList.add('is-invalid');
        if (!senha && loginSenha) loginSenha.classList.add('is-invalid');
        return;
      }

      const botaoEntrar = loginForm.querySelector('.login-modal__submit');
      const textoOriginalBotao = botaoEntrar.textContent;
      botaoEntrar.disabled = true;
      botaoEntrar.textContent = 'Entrando...';

      fetch('api/login.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      })
        .then((resposta) => resposta.json().then((dados) => ({ status: resposta.status, dados })))
        .then(({ status, dados }) => {
          if (status === 200 && dados.sucesso) {
            // Login OK: recarrega a página pra que o cabeçalho
            // (renderizado em PHP a partir da sessão) já mostre o
            // usuário logado.
            window.location.reload();
            return;
          }

          loginEmail.classList.add('is-invalid');
          loginSenha.classList.add('is-invalid');
          if (erroLogin) {
            erroLogin.textContent = dados.erro || 'Não foi possível entrar. Tente novamente.';
          }
        })
        .catch(() => {
          if (erroLogin) erroLogin.textContent = 'Erro de conexão. Verifique sua internet e tente novamente.';
        })
        .finally(() => {
          botaoEntrar.disabled = false;
          botaoEntrar.textContent = textoOriginalBotao;
        });
    });
  }

  // ==========================================================
  // VALIDAÇÃO DO FORMULÁRIO DE CADASTRO
  // Todo campo é obrigatório e precisa conter um dado válido
  // (não só "preenchido"). Os erros aparecem embaixo de cada
  // campo e o campo ganha a borda vermelha (.is-invalid) até
  // ser corrigido.
  // ==========================================================

  function mostrarErroCampo(input, span, mensagem) {
    if (input) input.classList.add('is-invalid');
    if (span) span.textContent = mensagem;
  }

  function limparErroCampo(input, span) {
    if (input) input.classList.remove('is-invalid');
    if (span) span.textContent = '';
  }

  // Validação de e-mail simples e suficiente para formulário
  // (não tenta cobrir 100% da RFC, só bloquear valores claramente inválidos)
  function emailValido(valor) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor);
  }

  // Telefone: exige DDD + 8 ou 9 dígitos (10 ou 11 números no total)
  function telefoneValido(valor) {
    const digitos = valor.replace(/\D/g, '');
    return digitos.length === 10 || digitos.length === 11;
  }

  // CPF: valida formato + dígitos verificadores (algoritmo oficial),
  // rejeitando também sequências repetidas tipo 111.111.111-11
  function cpfValido(valor) {
    const cpf = valor.replace(/\D/g, '');
    if (cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false;

    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(cpf[i], 10) * (10 - i);
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf[9], 10)) return false;

    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(cpf[i], 10) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf[10], 10)) return false;

    return true;
  }

  // Data de nascimento: dd/mm/aaaa, precisa ser uma data real do
  // calendário (rejeita 31/02/2000) e não pode ser futura nem
  // absurdamente antiga
  function dataNascimentoValida(valor) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
    if (!match) return false;
    const dia = parseInt(match[1], 10);
    const mes = parseInt(match[2], 10);
    const ano = parseInt(match[3], 10);

    const data = new Date(ano, mes - 1, dia);
    const dataValidaNoCalendario =
      data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
    if (!dataValidaNoCalendario) return false;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (data > hoje) return false; // não pode ser data futura
    if (ano < 1900) return false; // filtro de sanidade

    return true;
  }

  function validarCadastroNome() {
    const valor = cadastroNome.value.trim();
    const span = document.getElementById('erroCadastroNome');
    if (!valor) {
      mostrarErroCampo(cadastroNome, span, 'Informe seu nome.');
      return false;
    }
    // Nome completo: pelo menos duas palavras com 2+ letras cada
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ]{2,}(\s[A-Za-zÀ-ÖØ-öø-ÿ]{2,})+$/.test(valor)) {
      mostrarErroCampo(cadastroNome, span, 'Digite seu nome completo.');
      return false;
    }
    limparErroCampo(cadastroNome, span);
    return true;
  }

  function validarCadastroEmail() {
    const valor = cadastroEmail.value.trim();
    const span = document.getElementById('erroCadastroEmail');
    if (!valor) {
      mostrarErroCampo(cadastroEmail, span, 'Informe seu email.');
      return false;
    }
    if (!emailValido(valor)) {
      mostrarErroCampo(cadastroEmail, span, 'Digite um email válido.');
      return false;
    }
    limparErroCampo(cadastroEmail, span);
    return true;
  }

  // Regras da senha forte (usadas no cadastro e na redefinição)
  const REGRAS_SENHA = {
    tamanho:    (v) => v.length >= 8,
    maiuscula:  (v) => /\p{Lu}/u.test(v),
    numero:     (v) => /\d/.test(v),
    especial:   (v) => /[^\p{L}\p{N}\s]/u.test(v),
  };

  function senhaForte(v) {
    return Object.values(REGRAS_SENHA).every((fn) => fn(v));
  }

  // Atualiza o checklist (✓ / ✗) enquanto a pessoa digita
  function atualizarChecklistSenha(valor, lista) {
    if (!lista) return;
    lista.classList.toggle('is-visible', valor.length > 0);
    lista.querySelectorAll('[data-regra]').forEach((li) => {
      const ok = REGRAS_SENHA[li.dataset.regra](valor);
      li.classList.toggle('is-ok', ok);
    });
  }

  function validarCadastroSenha() {
    const valor = cadastroSenha.value;
    const span = document.getElementById('erroCadastroSenha');
    if (!valor) {
      mostrarErroCampo(cadastroSenha, span, 'Crie uma senha.');
      return false;
    }
    if (valor.length < 8) {
      mostrarErroCampo(cadastroSenha, span, 'A senha precisa ter no mínimo 8 caracteres.');
      return false;
    }
    if (!REGRAS_SENHA.maiuscula(valor)) {
      mostrarErroCampo(cadastroSenha, span, 'A senha precisa ter pelo menos uma letra maiúscula.');
      return false;
    }
    if (!REGRAS_SENHA.numero(valor)) {
      mostrarErroCampo(cadastroSenha, span, 'A senha precisa ter pelo menos um número.');
      return false;
    }
    if (!REGRAS_SENHA.especial(valor)) {
      mostrarErroCampo(cadastroSenha, span, 'A senha precisa ter pelo menos um caractere especial (ex.: ! @ # $ %).');
      return false;
    }
    limparErroCampo(cadastroSenha, span);
    return true;
  }

  function validarCadastroRepetirSenha() {
    const valor = cadastroRepetirSenha.value;
    const span = document.getElementById('erroCadastroRepetirSenha');
    if (!valor) {
      mostrarErroCampo(cadastroRepetirSenha, span, 'Repita a senha.');
      return false;
    }
    if (valor !== cadastroSenha.value) {
      mostrarErroCampo(cadastroRepetirSenha, span, 'As senhas não coincidem.');
      return false;
    }
    limparErroCampo(cadastroRepetirSenha, span);
    return true;
  }

  function validarCadastroTelefone() {
    const valor = cadastroTelefone.value;
    const span = document.getElementById('erroCadastroTelefone');
    if (!valor.trim()) {
      mostrarErroCampo(cadastroTelefone, span, 'Informe seu telefone.');
      return false;
    }
    if (!telefoneValido(valor)) {
      mostrarErroCampo(cadastroTelefone, span, 'Digite um telefone válido com DDD.');
      return false;
    }
    limparErroCampo(cadastroTelefone, span);
    return true;
  }

  function validarCadastroCpf() {
    const valor = cadastroCpf.value;
    const span = document.getElementById('erroCadastroCpf');
    if (!valor.trim()) {
      mostrarErroCampo(cadastroCpf, span, 'Informe seu CPF.');
      return false;
    }
    if (!cpfValido(valor)) {
      mostrarErroCampo(cadastroCpf, span, 'Digite um CPF válido.');
      return false;
    }
    limparErroCampo(cadastroCpf, span);
    return true;
  }

  function validarCadastroDataNascimento() {
    const valor = cadastroDataNascimento.value;
    const span = document.getElementById('erroCadastroDataNascimento');
    if (!valor.trim()) {
      mostrarErroCampo(cadastroDataNascimento, span, 'Informe sua data de nascimento.');
      return false;
    }
    if (!dataNascimentoValida(valor)) {
      mostrarErroCampo(cadastroDataNascimento, span, 'Digite uma data de nascimento válida.');
      return false;
    }
    limparErroCampo(cadastroDataNascimento, span);
    return true;
  }

  function validarCadastroGenero() {
    const valor = cadastroGenero.value;
    const span = document.getElementById('erroCadastroGenero');
    if (!valor) {
      mostrarErroCampo(cadastroGenero, span, 'Selecione uma opção.');
      return false;
    }
    limparErroCampo(cadastroGenero, span);
    return true;
  }

  function validarCadastroGeneroOutro() {
    // Só é obrigatório quando "Outro" está selecionado
    if (!cadastroGenero || cadastroGenero.value !== 'outro') {
      limparErroCampo(cadastroGeneroOutro, document.getElementById('erroCadastroGeneroOutro'));
      return true;
    }
    const valor = (cadastroGeneroOutro ? cadastroGeneroOutro.value : '').trim();
    const span = document.getElementById('erroCadastroGeneroOutro');
    if (!valor) {
      mostrarErroCampo(cadastroGeneroOutro, span, 'Digite seu gênero.');
      return false;
    }
    limparErroCampo(cadastroGeneroOutro, span);
    return true;
  }

  function validarFormularioCadastro() {
    // Roda todas as validações (sem short-circuit) pra mostrar
    // todos os erros de uma vez, não só o primeiro
    const resultados = [
      validarCadastroNome(),
      validarCadastroEmail(),
      validarCadastroSenha(),
      validarCadastroRepetirSenha(),
      validarCadastroTelefone(),
      validarCadastroCpf(),
      validarCadastroDataNascimento(),
      validarCadastroGenero(),
      validarCadastroGeneroOutro(),
    ];
    return resultados.every(Boolean);
  }

  // Valida cada campo em tempo real (ao sair do campo) pra dar
  // feedback imediato, sem esperar o submit
  if (cadastroNome) cadastroNome.addEventListener('blur', validarCadastroNome);
  if (cadastroEmail) cadastroEmail.addEventListener('blur', validarCadastroEmail);
  if (cadastroSenha) {
    if (cadastroSenha.form) {
      cadastroSenha.form.addEventListener('reset', () => {
        setTimeout(() => atualizarChecklistSenha('', document.getElementById('regrasCadastroSenha')), 0);
      });
    }
    cadastroSenha.addEventListener('blur', validarCadastroSenha);
    cadastroSenha.addEventListener('input', () => {
      atualizarChecklistSenha(cadastroSenha.value, document.getElementById('regrasCadastroSenha'));
      if (cadastroRepetirSenha.value) validarCadastroRepetirSenha();
    });
  }
  if (cadastroRepetirSenha) cadastroRepetirSenha.addEventListener('blur', validarCadastroRepetirSenha);
  if (cadastroTelefone) cadastroTelefone.addEventListener('blur', validarCadastroTelefone);
  if (cadastroCpf) cadastroCpf.addEventListener('blur', validarCadastroCpf);
  if (cadastroDataNascimento) cadastroDataNascimento.addEventListener('blur', validarCadastroDataNascimento);
  if (cadastroGenero) cadastroGenero.addEventListener('change', () => {
    validarCadastroGenero();
    // Não valida o campo "Qual seu gênero?" aqui: ele acabou de aparecer
    // vazio e o usuário ainda não teve chance de digitar. A validação
    // dele já ocorre no blur (abaixo) e no submit do formulário.
    if (cadastroGenero.value !== 'outro') {
      validarCadastroGeneroOutro();
    }
  });
  if (cadastroGeneroOutro) cadastroGeneroOutro.addEventListener('blur', validarCadastroGeneroOutro);

  if (cadastroForm) {
    cadastroForm.addEventListener('submit', (e) => {
      e.preventDefault();

      if (!validarFormularioCadastro()) {
        // Leva o foco pro primeiro campo inválido, pra facilitar a correção
        const primeiroInvalido = cadastroForm.querySelector('.is-invalid');
        if (primeiroInvalido) primeiroInvalido.focus();
        return;
      }

      const botaoCadastrar = cadastroForm.querySelector('.login-modal__submit');
      const textoOriginalBotao = botaoCadastrar.textContent;
      botaoCadastrar.disabled = true;
      botaoCadastrar.textContent = 'Enviando...';

      const payload = {
        nome: cadastroNome.value.trim(),
        email: cadastroEmail.value.trim(),
        senha: cadastroSenha.value,
        repetir_senha: cadastroRepetirSenha.value,
        telefone: cadastroTelefone.value.trim(),
        cpf: cadastroCpf.value.trim(),
        data_nascimento: cadastroDataNascimento.value.trim(),
        genero: cadastroGenero.value,
        genero_outro: cadastroGenero.value === 'outro' ? cadastroGeneroOutro.value.trim() : '',
        equipe: cadastroEquipe ? cadastroEquipe.value : 'geral',
      };

      fetch('api/cadastro.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((resposta) => resposta.json().then((dados) => ({ status: resposta.status, dados })))
        .then(({ status, dados }) => {
          if (status === 200 && dados.sucesso) {
            // Cadastro deu certo: mostra o popout "Cadastrado
            // concluído ✅" (idêntico ao "Acesso negado"). A troca
            // pra etapa de login só acontece quando o usuário clica
            // no botão do popout (ver mostrarPopoutCadastroConcluido).
            cadastroForm.reset();
            mostrarPopoutCadastroConcluido(payload.email);
            return;
          }

          // Campo(s) duplicado(s) (email, telefone e/ou CPF já
          // cadastrados) — dados.campos é sempre um array, podendo ter
          // mais de um item quando é um "combo" (ex.: email + cpf).
          if (status === 409 && dados.campos && dados.campos.length) {
            mostrarPopoutCadastroDuplicado(dados.campos);
            return;
          }

          // Erros de validação vindos do servidor — mostra na
          // mensagem de erro de cada campo, reaproveitando os
          // spans #erroCadastro*
          if (dados.erros) {
            Object.entries(dados.erros).forEach(([campo, mensagem]) => {
              const input = cadastroForm.querySelector(`[name="${campo}"]`);
              const spanErro = document.getElementById(`erroCadastro${campo.charAt(0).toUpperCase()}${campo.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`);
              if (input) input.classList.add('is-invalid');
              if (spanErro) spanErro.textContent = mensagem;
            });
          } else {
            window.IBDialogo.avisar({ titulo: 'Não foi possível cadastrar', texto: dados.erro || 'Não foi possível concluir o cadastro. Tente novamente.' });
          }
        })
        .catch(() => {
          window.IBDialogo.avisar({ titulo: 'Erro de conexão', texto: 'Verifique sua internet e tente novamente.' });
        })
        .finally(() => {
          botaoCadastrar.disabled = false;
          botaoCadastrar.textContent = textoOriginalBotao;
        });
    });
  }

  // ==========================================================
  // MENU DO USUÁRIO (área logada) — dropdown ancorado embaixo
  // do nome do usuário, mesmo padrão visual do login-modal.
  // ==========================================================
  const btnUsuarioMenu = document.getElementById('btnUsuarioMenu');
  const btnUsuarioAvatar = document.getElementById('btnUsuarioAvatar');
  const userMenu = document.getElementById('userMenu');

  function fecharUserMenu() {
    if (!userMenu) return;
    userMenu.classList.remove('is-open');
    userMenu.setAttribute('aria-hidden', 'true');
    if (btnUsuarioMenu) btnUsuarioMenu.setAttribute('aria-expanded', 'false');
    if (btnUsuarioAvatar) btnUsuarioAvatar.setAttribute('aria-expanded', 'false');
  }

  function alternarUserMenu(event) {
    if (event) event.preventDefault();
    if (!userMenu) return;
    const abrindo = !userMenu.classList.contains('is-open');
    userMenu.classList.toggle('is-open', abrindo);
    userMenu.setAttribute('aria-hidden', String(!abrindo));
    if (btnUsuarioMenu) btnUsuarioMenu.setAttribute('aria-expanded', String(abrindo));
    if (btnUsuarioAvatar) btnUsuarioAvatar.setAttribute('aria-expanded', String(abrindo));
  }

  if (btnUsuarioMenu) {
    btnUsuarioMenu.addEventListener('click', alternarUserMenu);
  }
  if (btnUsuarioAvatar) {
    btnUsuarioAvatar.addEventListener('click', alternarUserMenu);
  }

  // ==========================================================
  // NOTIFICAÇÕES E CHAT (área logada) — por enquanto só fecham
  // o menu do usuário se estiver aberto; conteúdo real do
  // popover entra quando o endpoint de notificações existir.
  // ==========================================================
  const btnNotificacoes = document.getElementById('btnNotificacoes');
  const btnChat = document.getElementById('btnChat');
  [btnNotificacoes, btnChat].forEach((btn) => {
    if (btn) btn.addEventListener('click', () => fecharUserMenu());
  });

  document.addEventListener('click', (e) => {
    if (!userMenu || !userMenu.classList.contains('is-open')) return;
    if (userMenu.contains(e.target) || (btnUsuarioMenu && btnUsuarioMenu.contains(e.target)) || (btnUsuarioAvatar && btnUsuarioAvatar.contains(e.target))) return;
    fecharUserMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharUserMenu();
  });
  // ==========================================================
  // BUSCA DO CABEÇALHO
  // Antes o formulário enviava para "/busca" (rota que não existe).
  // Agora a busca funciona direto aqui, sem backend:
  //  - sugestões em tempo real: pessoas, equipes, páginas e produtos
  //  - pessoa  -> abre o chat pessoal com ela
  //  - equipe  -> abre o canal da equipe
  //  - setas ↑/↓ navegam, Enter abre, Esc fecha
  //  - Enter sem item escolhido abre o 1º resultado
  //  - visitante (não logado) abre o dropdown de login
  // ==========================================================
  const buscaForm = document.getElementById('headerSearch');
  const buscaInput = buscaForm ? buscaForm.querySelector('.header__search-input') : null;

  if (buscaForm && buscaInput) {
    const logado = document.body.getAttribute('data-logado') === '1';

    const PAGINAS_BUSCA = [
      { titulo: 'Início', chaves: 'inicio home principal', href: 'index.php?pagina=inicio' },
      { titulo: 'Serviços', chaves: 'servicos gmail drive meet agenda docs planilhas slides', href: 'index.php?pagina=servicos' },
      { titulo: 'Inteligência Artificial', chaves: 'ia ai assistente chatbot', href: 'index.php?pagina=inteligencia-artificial' },
      { titulo: 'Documentos', chaves: 'documentos arquivos pastas', href: 'index.php?pagina=documentos' },
      { titulo: 'Unidade', chaves: 'unidade filial setor', href: 'index.php?pagina=unidade' },
      { titulo: 'Chamadas', chaves: 'chamadas ligacao video voz agenda', href: 'index.php?pagina=chamadas' },
      { titulo: 'Cursos', chaves: 'cursos treinamentos aulas', href: 'index.php?pagina=cursos' },
      { titulo: 'Loja', chaves: 'loja produtos comprar carrinho', href: 'index.php?pagina=loja' },
      { titulo: 'Chat', chaves: 'chat mensagens conversa', href: 'index.php?pagina=chat' },
      { titulo: 'Agendar reunião', chaves: 'agendar reuniao meet calendario', href: 'index.php?pagina=agendar-reuniao' },
      { titulo: 'Meu perfil', chaves: 'perfil configuracoes conta senha foto', href: 'index.php?pagina=configuracoes' },
    ];

    // Reserva caso a Loja não esteja carregada nesta página
    // (quando está, usamos o catálogo real: window.LojaDados).
    const PRODUTOS_RESERVA = [
      ['VIP1230B', 'Câmera bullet VIP 1230 B'], ['VIP3230D', 'Câmera dome VIP 3230 D'],
      ['MIBOCAM2', 'Câmera Wi-Fi Mibo Cam 2'], ['NVD1408', 'Gravador NVD 1408'],
      ['ARF1200', 'Roteador Action RF 1200'], ['SG2404MR', 'Switch SG 2404 MR'],
      ['ACCESSPT', 'Access Point AP 1350'], ['PATCHCB5', 'Patch cord Cat5e (2m)'],
      ['AMT8000', 'Central de alarme AMT 8000'], ['IVPDUAL', 'Sensor infravermelho IVP Dual'],
      ['XAT4010', 'Sirene XAT 4010'], ['TIP200LT', 'Telefone IP TIP 200 Lite'],
      ['TS4010', 'Central telefônica TS 4010'], ['HEADSETPRO', 'Headset corporativo HS Pro'],
      ['NOBRK1200', 'Nobreak 1200 VA'], ['FILTLINHA', 'Filtro de linha 8 tomadas'],
    ].map(([id, name]) => ({ id, name }));

    function produtosBusca() {
      const dados = window.LojaDados && Array.isArray(window.LojaDados.PRODUCTS)
        ? window.LojaDados.PRODUCTS
        : PRODUTOS_RESERVA;
      return dados.map((p) => ({ id: String(p.id), name: String(p.name) }));
    }

    function normalizar(txt) {
      return String(txt || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    }

    function hrefLoja(termo) {
      return 'index.php?pagina=loja&busca=' + encodeURIComponent(termo);
    }

    // Lista de resultados (criada uma vez, dentro do próprio form)
    const lista = document.createElement('ul');
    lista.className = 'header__search-results';
    lista.id = 'headerSearchResults';
    lista.setAttribute('role', 'listbox');
    lista.hidden = true;
    buscaForm.appendChild(lista);

    buscaInput.setAttribute('autocomplete', 'off');
    buscaInput.setAttribute('aria-controls', 'headerSearchResults');
    buscaInput.setAttribute('aria-expanded', 'false');

    let resultados = [];
    let ativo = -1;

    function fecharResultados() {
      lista.hidden = true;
      lista.innerHTML = '';
      resultados = [];
      ativo = -1;
      buscaInput.setAttribute('aria-expanded', 'false');
    }

    function marcarAtivo(indice) {
      const itens = lista.querySelectorAll('.header__search-item');
      itens.forEach((el, i) => el.classList.toggle('is-active', i === indice));
      ativo = indice;
      if (itens[indice]) itens[indice].scrollIntoView({ block: 'nearest' });
    }

    // Pessoas e equipes vêm do mesmo endpoint da tela "Nova conversa"
    // (api/conversas/contatos.php). Carregado uma vez, na 1ª interação.
    let pessoas = [];
    let equipes = [];
    let contatosCarregando = false;
    let contatosCarregados = false;

    function carregarContatos() {
      if (!logado || contatosCarregando || contatosCarregados) return;
      contatosCarregando = true;
      fetch('api/conversas/contatos.php', { headers: { Accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : null))
        .then((dados) => {
          if (!dados || !dados.sucesso) return;
          pessoas = Array.isArray(dados.contatos) ? dados.contatos : [];
          equipes = Array.isArray(dados.equipes) ? dados.equipes : [];
          contatosCarregados = true;
          // se a pessoa já digitou algo enquanto carregava, atualiza a lista
          if (buscaInput.value.trim() && document.activeElement === buscaInput) {
            desenhar(buscaInput.value);
          }
        })
        .catch(() => {})
        .finally(() => { contatosCarregando = false; });
    }

    const TITULOS_GRUPO = ['Equipes', 'Pessoas', 'Páginas', 'Produtos'];

    // Quanto menor, mais relevante: começa com o termo < palavra começa < contém
    function pontuar(titulo, termo) {
      const t = normalizar(titulo);
      if (t.startsWith(termo)) return 0;
      if (t.split(/\s+/).some((w) => w.startsWith(termo))) return 1;
      return 2;
    }

    function buscar(termoBruto) {
      const termo = normalizar(termoBruto);
      if (!termo) return [];
      const partes = termo.split(/\s+/);
      const bate = (alvo) => partes.every((p) => alvo.includes(p));

      const itens = [];

      equipes.forEach((eq) => {
        if (!bate(normalizar(eq.nome))) return;
        itens.push({
          tipo: '', grupo: 0, titulo: String(eq.nome),
          href: 'index.php?pagina=equipes&equipe=' + encodeURIComponent(eq.slug),
        });
      });

      pessoas.forEach((pe) => {
        if (!bate(normalizar(pe.nome))) return;
        itens.push({
          tipo: pe.cargo_nome ? String(pe.cargo_nome) : '', grupo: 1, titulo: String(pe.nome),
          href: 'index.php?pagina=chat&usuario=' + encodeURIComponent(pe.id),
        });
      });

      PAGINAS_BUSCA.forEach((pg) => {
        if (!bate(normalizar(pg.titulo + ' ' + pg.chaves))) return;
        itens.push({ tipo: '', grupo: 2, titulo: pg.titulo, href: pg.href });
      });

      produtosBusca().forEach((pr) => {
        if (!bate(normalizar(pr.name + ' ' + pr.id))) return;
        itens.push({ tipo: '', grupo: 3, titulo: pr.name, href: hrefLoja(pr.name) });
      });

      itens.forEach((it) => { it.pontos = pontuar(it.titulo, termo); });
      // Agrupado por seção (equipes, pessoas, páginas, produtos); dentro de
      // cada uma, o mais relevante primeiro. No máximo 4 por seção.
      itens.sort((a, b) => (a.grupo - b.grupo) || (a.pontos - b.pontos) || a.titulo.localeCompare(b.titulo, 'pt-BR'));

      const contagem = {};
      return itens.filter((it) => {
        contagem[it.grupo] = (contagem[it.grupo] || 0) + 1;
        return contagem[it.grupo] <= 4;
      });
    }

    function desenhar(termoBruto) {
      resultados = buscar(termoBruto);
      ativo = -1;
      lista.innerHTML = '';

      if (!termoBruto.trim()) {
        fecharResultados();
        return;
      }

      if (resultados.length === 0) {
        const vazio = document.createElement('li');
        vazio.className = 'header__search-empty';
        vazio.textContent = 'Nenhum resultado encontrado.';
        lista.appendChild(vazio);
      } else {
        let grupoAtual = -1;
        resultados.forEach((r, i) => {
          if (r.grupo !== grupoAtual) {
            grupoAtual = r.grupo;
            const cab = document.createElement('li');
            cab.className = 'header__search-group';
            cab.setAttribute('role', 'presentation');
            cab.textContent = TITULOS_GRUPO[r.grupo];
            lista.appendChild(cab);
          }
          const li = document.createElement('li');
          li.className = 'header__search-item';
          li.setAttribute('role', 'option');
          const nome = document.createElement('span');
          nome.className = 'header__search-item-title';
          nome.textContent = r.titulo;
          const tipo = document.createElement('span');
          tipo.className = 'header__search-item-type';
          tipo.textContent = r.tipo;
          li.appendChild(nome);
          if (r.tipo) li.appendChild(tipo);
          // mousedown (e não click) para disparar antes de qualquer blur
          li.addEventListener('mousedown', (e) => {
            e.preventDefault();
            irPara(r.href);
          });
          li.addEventListener('mouseenter', () => marcarAtivo(i));
          lista.appendChild(li);
        });
      }

      lista.hidden = false;
      buscaInput.setAttribute('aria-expanded', 'true');
    }

    function irPara(href) {
      fecharResultados();
      window.location.href = href;
    }

    buscaInput.addEventListener('input', () => {
      if (!logado) {
        fecharResultados();
        return;
      }
      carregarContatos();
      desenhar(buscaInput.value);
    });

    buscaInput.addEventListener('focus', () => {
      carregarContatos();
      if (logado && buscaInput.value.trim()) desenhar(buscaInput.value);
    });

    buscaInput.addEventListener('keydown', (e) => {
      if (lista.hidden || resultados.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        marcarAtivo((ativo + 1) % resultados.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        marcarAtivo(ativo <= 0 ? resultados.length - 1 : ativo - 1);
      } else if (e.key === 'Escape') {
        fecharResultados();
      }
    });

    // Enter / clique na lupa
    buscaForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const termo = buscaInput.value.trim();
      if (!termo) {
        buscaInput.focus();
        return;
      }

      // Visitante: as páginas e a Loja só existem para quem está logado
      if (!logado) {
        if (typeof window.intelbrasAbrirLogin === 'function') window.intelbrasAbrirLogin();
        return;
      }

      const escolhido = ativo >= 0 ? resultados[ativo] : resultados[0];
      if (escolhido) irPara(escolhido.href);
    });

    // Clique fora fecha as sugestões
    document.addEventListener('click', (e) => {
      if (!buscaForm.contains(e.target)) fecharResultados();
    });

    // Chegou no Chat vindo da busca (?pagina=chat&usuario=<id>): abre (ou
    // cria) a conversa pessoal com essa pessoa e recarrega já na conversa
    // (?id=<conversa>), que é o que o próprio Chat sabe abrir. O token
    // CSRF vem do próprio Chat (#chatRaiz), então só roda nessa página.
    window.addEventListener('load', () => {
      const usuarioId = Number(new URLSearchParams(window.location.search).get('usuario') || 0);
      const raizChat = document.getElementById('chatRaiz');
      if (!usuarioId || !raizChat) return;

      fetch('api/chat/iniciar.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': raizChat.getAttribute('data-csrf') || '',
        },
        body: JSON.stringify({ usuario_id: usuarioId }),
      })
        .then((r) => r.json())
        .then((dados) => {
          if (dados && dados.sucesso && dados.conversa_id) {
            window.location.replace('index.php?pagina=chat&id=' + encodeURIComponent(dados.conversa_id));
          }
        })
        .catch(() => {});
    });

    // Chegou na Loja vindo da busca (?busca=...): preenche o campo da
    // própria Loja e dispara o filtro dela. Usa "load" para garantir
    // que o js da Loja (carregado depois do cabeçalho) já está pronto.
    window.addEventListener('load', () => {
      const termo = new URLSearchParams(window.location.search).get('busca');
      const campoLoja = document.getElementById('lojaBusca');
      if (termo && campoLoja) {
        campoLoja.value = termo;
        campoLoja.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }
  // ==========================================================
  // SILENCIADOS — equipes silenciadas no menu lateral
  // Equipe silenciada: sem badge de não lidas e com ícone de "sino
  // cortado" ao lado do nome. A lista fica no navegador
  // (localStorage 'equipesSilenciadas'), gravada pelo "Silenciar canal"
  // da página Equipes. Vale para o menu lateral de qualquer página.
  // ==========================================================
  function lerListaSilenciada(chave) {
    try {
      const v = JSON.parse(localStorage.getItem(chave) || '[]');
      return Array.isArray(v) ? v.map(String) : [];
    } catch (e) { return []; }
  }

  const ICONE_SINO_CORTADO = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m2 2 20 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function marcarEquipesSilenciadas() {
    const mudas = lerListaSilenciada('equipesSilenciadas');
    document.querySelectorAll('.inicio__channel-item[data-equipe-slug]').forEach((item) => {
      const slug = item.getAttribute('data-equipe-slug');
      const mudo = mudas.indexOf(slug) !== -1;
      item.classList.toggle('inicio__channel-item--silenciada', mudo);
      let icone = item.querySelector('.inicio__channel-mudo');
      if (mudo && !icone) {
        icone = document.createElement('span');
        icone.className = 'inicio__channel-mudo';
        icone.title = 'Notificações silenciadas';
        icone.setAttribute('aria-label', 'Silenciada');
        icone.innerHTML = ICONE_SINO_CORTADO;
        item.appendChild(icone);
      } else if (!mudo && icone) {
        icone.remove();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', marcarEquipesSilenciadas);
  window.addEventListener('storage', marcarEquipesSilenciadas);
  window.addEventListener('intelbras:silenciadas', marcarEquipesSilenciadas);

  // ==========================================================
  // NOTIFICAÇÕES (sino) — popout com o que chegou e não foi lido
  //  - mensagens e arquivos das conversas pessoais (api/chat/conversas.php)
  //  - mensagens novas nas equipes (api/equipes/contagens.php)
  // O número no sino é o total de não lidas; some quando zera.
  // Atualiza sozinho a cada 20 s e sempre que o popout é aberto.
  // Clicar em um item leva direto para a conversa / canal.
  // ==========================================================
  const sinoBtn = document.getElementById('btnNotificacoes');
  const sinoBadge = document.getElementById('notificacoesBadge');

  if (sinoBtn) {
    const INTERVALO_NOTIF_MS = 20000;
    let notifItens = [];
    let notifTotal = 0;
    let notifErro = false;
    let notifCarregou = false;
    let equipesInfo = null; // { slug: { nome, cor } }, buscado só se precisar

    const popoutNotif = document.createElement('div');
    popoutNotif.className = 'notif-popout';
    popoutNotif.id = 'notifPopout';
    popoutNotif.setAttribute('role', 'dialog');
    popoutNotif.setAttribute('aria-label', 'Notificações');
    popoutNotif.hidden = true;
    popoutNotif.innerHTML =
      '<div class="notif-popout__topo"><span class="notif-popout__titulo">Notificações</span></div>' +
      '<div class="notif-popout__lista" id="notifLista"></div>';
    (document.querySelector('.header') || document.body).appendChild(popoutNotif);
    const listaNotif = popoutNotif.querySelector('#notifLista');

    sinoBtn.setAttribute('aria-controls', 'notifPopout');

    function textoBadge(n) {
      return n > 99 ? '99+' : String(n);
    }

    function tempoRelativo(iso) {
      const t = Date.parse(iso || '');
      if (!t) return '';
      const min = Math.max(0, Math.round((Date.now() - t) / 60000));
      if (min < 1) return 'agora';
      if (min < 60) return min + ' min';
      const h = Math.round(min / 60);
      if (h < 24) return h + ' h';
      const d = Math.round(h / 24);
      return d === 1 ? 'ontem' : d + ' d';
    }

    function atualizarBadgeSino() {
      if (!sinoBadge) return;
      if (notifTotal > 0) {
        sinoBadge.textContent = textoBadge(notifTotal);
        sinoBadge.hidden = false;
      } else {
        sinoBadge.hidden = true;
      }
    }

    function criarItemNotif(it) {
      const a = document.createElement('a');
      a.className = 'notif-item';
      a.href = it.href;

      const av = document.createElement('span');
      av.className = 'notif-item__avatar' + (it.cor ? ' notif-item__avatar--cor' : '');
      if (it.cor) av.style.background = it.cor;
      av.textContent = it.avatar;

      const corpo = document.createElement('span');
      corpo.className = 'notif-item__corpo';
      const titulo = document.createElement('span');
      titulo.className = 'notif-item__titulo';
      titulo.textContent = it.titulo;
      const texto = document.createElement('span');
      texto.className = 'notif-item__texto';
      texto.textContent = it.texto;
      corpo.appendChild(titulo);
      corpo.appendChild(texto);

      const meta = document.createElement('span');
      meta.className = 'notif-item__meta';
      const quando = document.createElement('span');
      quando.className = 'notif-item__tempo';
      quando.textContent = it.tempo ? it.tipo + ' · ' + it.tempo : it.tipo;
      const qtd = document.createElement('span');
      qtd.className = 'notif-item__qtd';
      qtd.textContent = textoBadge(it.qtd);
      meta.appendChild(quando);
      meta.appendChild(qtd);

      a.appendChild(av);
      a.appendChild(corpo);
      a.appendChild(meta);
      return a;
    }

    function desenharNotif() {
      listaNotif.innerHTML = '';
      if (notifErro && notifItens.length === 0) {
        listaNotif.innerHTML = '<p class="notif-popout__vazio">Não foi possível carregar as notificações.</p>';
        return;
      }
      if (!notifCarregou) {
        listaNotif.innerHTML = '<p class="notif-popout__vazio">Carregando...</p>';
        return;
      }
      if (notifItens.length === 0) {
        listaNotif.innerHTML = '<p class="notif-popout__vazio">Você não tem notificações novas.</p>';
        return;
      }
      notifItens.forEach((it) => listaNotif.appendChild(criarItemNotif(it)));
    }

    function buscarJson(url) {
      return fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d && d.sucesso ? d : null))
        .catch(() => null);
    }

    async function carregarNotificacoes() {
      if (document.hidden && notifCarregou) return;

      const [chat, eq] = await Promise.all([
        buscarJson('api/chat/conversas.php'),
        buscarJson('api/equipes/contagens.php'),
      ]);

      notifErro = !chat && !eq;
      if (notifErro && notifCarregou) return; // mantém o que já estava na tela

      const itens = [];

      if (chat && Array.isArray(chat.conversas)) {
        let silenciadas = [];
        try {
          const v = JSON.parse(localStorage.getItem('chatConversasSilenciadas') || '[]');
          if (Array.isArray(v)) silenciadas = v.map(Number);
        } catch (e) { /* sem storage */ }

        chat.conversas
          .filter((c) => Number(c.nao_lidas) > 0 && silenciadas.indexOf(Number(c.id)) === -1)
          .forEach((c) => {
            const previa = c.ultima_mensagem ? String(c.ultima_mensagem) : 'Nova mensagem';
            const ehArquivo = previa.indexOf('📎') === 0;
            itens.push({
              avatar: c.usuario.iniciais || '?',
              titulo: c.usuario.nome,
              texto: previa,
              tipo: ehArquivo ? 'Arquivo' : 'Mensagem',
              tempo: tempoRelativo(c.ultima_em),
              qtd: Number(c.nao_lidas),
              href: 'index.php?pagina=chat&id=' + encodeURIComponent(c.id),
            });
          });
      }

      if (eq && eq.contagens) {
        const equipesMudas = lerListaSilenciada('equipesSilenciadas');
        const comNovas = Object.keys(eq.contagens).filter(
          (slug) => Number(eq.contagens[slug]) > 0 && equipesMudas.indexOf(slug) === -1
        );
        if (comNovas.length && !equipesInfo) {
          const info = await buscarJson('api/conversas/contatos.php');
          if (info && Array.isArray(info.equipes)) {
            equipesInfo = {};
            info.equipes.forEach((e) => { equipesInfo[e.slug] = { nome: e.nome, cor: e.cor }; });
          }
        }
        comNovas.forEach((slug) => {
          const n = Number(eq.contagens[slug]);
          const e = (equipesInfo && equipesInfo[slug]) || { nome: slug, cor: '' };
          itens.push({
            avatar: '#',
            cor: e.cor || '#00A859',
            titulo: e.nome,
            texto: n === 1 ? '1 mensagem nova na equipe' : n + ' mensagens novas na equipe',
            tipo: 'Equipe',
            tempo: '',
            qtd: n,
            href: 'index.php?pagina=equipes&equipe=' + encodeURIComponent(slug),
          });
        });
      }

      notifItens = itens;
      notifTotal = itens.reduce((soma, it) => soma + it.qtd, 0);
      notifCarregou = true;
      atualizarBadgeSino();
      desenharNotif();
    }

    function posicionarNotif() {
      const r = sinoBtn.getBoundingClientRect();
      const largura = Math.min(380, window.innerWidth - 24);
      let esquerda = r.right - largura + 20;
      esquerda = Math.max(12, Math.min(esquerda, window.innerWidth - largura - 12));
      popoutNotif.style.width = largura + 'px';
      popoutNotif.style.left = esquerda + 'px';
      popoutNotif.style.top = (r.bottom + 10) + 'px';
    }

    function notifAberto() {
      return !popoutNotif.hidden;
    }

    function fecharNotif() {
      popoutNotif.hidden = true;
      sinoBtn.setAttribute('aria-expanded', 'false');
    }

    function abrirNotif() {
      // Em tela estreita o menu lateral é uma gaveta por cima da página: fecha ao abrir o sino,
      // senão a gaveta cobre o painel de notificações.
      document.body.classList.remove('sidebar-open');
      desenharNotif();
      posicionarNotif();
      popoutNotif.hidden = false;
      sinoBtn.setAttribute('aria-expanded', 'true');
      carregarNotificacoes(); // atualiza ao abrir
    }

    sinoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (notifAberto()) fecharNotif();
      else abrirNotif();
    });

    popoutNotif.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('click', () => {
      if (notifAberto()) fecharNotif();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && notifAberto()) {
        fecharNotif();
        sinoBtn.focus();
      }
    });

    window.addEventListener('resize', () => {
      if (notifAberto()) posicionarNotif();
    });

    carregarNotificacoes();
    setInterval(carregarNotificacoes, INTERVALO_NOTIF_MS);
  }
})();
