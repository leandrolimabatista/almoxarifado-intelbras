// ============================================================
// CABEÇALHO — Intelbras
// O botão "Todas categorias" abre/fecha o menu lateral
// (marcação em conteudo/conteudo.html), alternando a classe
// "sidebar-open" no <body>. O próprio CSS do conteúdo reage
// a essa classe — funciona mesmo o cabeçalho e o conteúdo
// sendo componentes carregados separadamente.
// ============================================================
(function () {
  const btnCategorias = document.getElementById('btnCategorias');
  if (btnCategorias) {
    btnCategorias.addEventListener('click', () => {
      const aberto = document.body.classList.toggle('sidebar-open');
      // Lembra a preferência entre navegações (cada troca de aba é um
      // reload de página PHP) para o menu continuar aberto/fechado do
      // jeito que o usuário deixou.
      localStorage.setItem('sidebarOpen', aberto ? '1' : '0');
    });
  }

  // Abre/fecha a barra de busca no mobile ao tocar no ícone de lupa
  const btnSearchToggle = document.getElementById('btnSearchToggle');
  const headerSearch = document.getElementById('headerSearch');
  const btnSearchClose = document.getElementById('btnSearchClose');

  if (btnSearchToggle && headerSearch) {
    btnSearchToggle.addEventListener('click', () => {
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

  // Fecha ao clicar fora do dropdown (em qualquer lugar da página)
  document.addEventListener('click', (e) => {
    if (!isLoginModalOpen()) return;
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

  function validarCadastroSenha() {
    const valor = cadastroSenha.value;
    const span = document.getElementById('erroCadastroSenha');
    if (!valor) {
      mostrarErroCampo(cadastroSenha, span, 'Crie uma senha.');
      return false;
    }
    if (valor.length < 6) {
      mostrarErroCampo(cadastroSenha, span, 'A senha precisa ter no mínimo 6 caracteres.');
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
    cadastroSenha.addEventListener('blur', validarCadastroSenha);
    cadastroSenha.addEventListener('input', () => {
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
            alert(dados.erro || 'Não foi possível concluir o cadastro. Tente novamente.');
          }
        })
        .catch(() => {
          alert('Erro de conexão. Verifique sua internet e tente novamente.');
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
  const userMenu = document.getElementById('userMenu');

  function fecharUserMenu() {
    if (!userMenu) return;
    userMenu.classList.remove('is-open');
    userMenu.setAttribute('aria-hidden', 'true');
    if (btnUsuarioMenu) btnUsuarioMenu.setAttribute('aria-expanded', 'false');
  }

  function alternarUserMenu(event) {
    if (event) event.preventDefault();
    if (!userMenu) return;
    const abrindo = !userMenu.classList.contains('is-open');
    userMenu.classList.toggle('is-open', abrindo);
    userMenu.setAttribute('aria-hidden', String(!abrindo));
    if (btnUsuarioMenu) btnUsuarioMenu.setAttribute('aria-expanded', String(abrindo));
  }

  if (btnUsuarioMenu) {
    btnUsuarioMenu.addEventListener('click', alternarUserMenu);
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
    if (userMenu.contains(e.target) || (btnUsuarioMenu && btnUsuarioMenu.contains(e.target))) return;
    fecharUserMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharUserMenu();
  });
})();
