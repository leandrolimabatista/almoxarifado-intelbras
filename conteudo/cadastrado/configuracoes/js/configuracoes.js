// ============================================================
// CONTEÚDO — Configurações (área CADASTRADO)
// Troca de abas (sem recarregar página), formulário "Meu perfil",
// preferências por aba (Notificações, Privacidade, Aparência,
// Segurança, Integrações), alterar senha, alterar/remover foto e
// dispositivos/sessões ativas. Tudo vem de api/configuracoes/*.php.
//
// MODO DEMONSTRAÇÃO: se a API não responder no primeiro carregamento
// (ex.: o SQL database/configuracoes.sql ainda não foi executado), a
// página entra sozinha em modo demonstração — nada é salvo de verdade,
// só em memória — e avisa na tela. Também dá para forçar com ?demo=1.
// ============================================================
(function () {
  'use strict';

  const raiz = document.getElementById('cfgRaiz');
  if (!raiz) return;

  const csrf = raiz.getAttribute('data-csrf') || '';
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);

  let demo = params.get('demo') === '1';
  let carregouUmaVez = false;

  // Estado local (preenchido pelo carregamento ou pelo modo demonstração)
  const estado = {
    perfil: {
      nome: '', email: '', telefone: '', cargo: '', temFoto: false,
    },
    preferencias: {
      notificacoes: {
        canal_app: true, canal_email: true, canal_push: false,
        tipo_mensagens: true, tipo_mencoes: true, tipo_reunioes_novas: true,
        tipo_reunioes_lembretes: true, tipo_equipes: false,
        nao_perturbe: false, nao_perturbe_de: '18:00', nao_perturbe_ate: '08:00',
      },
      privacidade: { status_visivel: 'todos', confirmacao_leitura: true, ultima_vez_online: true, mensagens_diretas: 'todos' },
      aparencia: { tema: 'claro', densidade: 'confortavel', fonte: 'm' },
      seguranca: { duas_etapas: false, duas_etapas_metodo: 'app' },
      integracoes: { calendario: false, email: false, armazenamento: false },
    },
  };

  const dispositivosDemo = [
    { id: 1, dispositivo: 'desktop', navegador: 'Chrome', sistema: 'Windows', ip: '187.34.x.x', ultimo_acesso: new Date().toISOString(), atual: true },
    { id: 2, dispositivo: 'celular', navegador: 'Safari', sistema: 'iOS', ip: '200.150.x.x', ultimo_acesso: new Date(Date.now() - 3 * 86400000).toISOString(), atual: false },
  ];
  let dispositivosAtuais = null;

  // ------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------
  function avisoDemo(mostrar) {
    const el = $('cfgAviso');
    if (!el) return;
    if (!mostrar) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = demo && params.get('demo') === '1'
      ? '<span>A página foi aberta com <strong>?demo=1</strong>. Modo demonstração: nada é salvo de verdade.</span>'
      : '<span>Não foi possível conectar à API de Configurações. Exibindo <strong>modo demonstração</strong> — verifique se <code>database/configuracoes.sql</code> já foi executado.</span>';
  }

  function toast(texto) {
    const el = $('cfgToast');
    if (!el) return;
    $('cfgToastTexto').textContent = texto;
    el.hidden = false;
    el.classList.add('configuracoes__toast--visivel');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 3200);
  }

  async function api(caminho, opcoes) {
    const resp = await fetch('api/configuracoes/' + caminho, {
      credentials: 'same-origin',
      headers: Object.assign({ 'X-CSRF-Token': csrf }, opcoes && opcoes.corpo ? { 'Content-Type': 'application/json' } : {}),
      method: (opcoes && opcoes.metodo) || 'GET',
      body: opcoes && opcoes.corpo ? JSON.stringify(opcoes.corpo) : (opcoes && opcoes.formData ? opcoes.formData : undefined),
    });
    let dados = null;
    try { dados = await resp.json(); } catch (_) { dados = null; }
    if (!resp.ok || !dados || dados.sucesso !== true) {
      const erro = new Error((dados && dados.erro) || 'Erro inesperado.');
      erro.campos = dados && dados.campos;
      erro.status = resp.status;
      throw erro;
    }
    return dados;
  }

  function formatarData(iso) {
    try {
      return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (_) { return ''; }
  }

  // ------------------------------------------------------------
  // Abas
  // ------------------------------------------------------------
  function irParaAba(nome) {
    document.querySelectorAll('.configuracoes__menu-item').forEach((btn) => {
      const ativo = btn.dataset.aba === nome;
      btn.classList.toggle('configuracoes__menu-item--ativo', ativo);
      if (ativo) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    });
    document.querySelectorAll('.configuracoes__painel').forEach((p) => {
      p.classList.toggle('configuracoes__painel--ativo', p.dataset.painel === nome);
    });
    if (nome === 'dispositivos' || nome === 'seguranca') carregarSessoes();
  }

  document.getElementById('cfgMenu').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-aba]');
    if (btn) irParaAba(btn.dataset.aba);
  });

  document.querySelectorAll('[data-ir-para]').forEach((el) => {
    el.addEventListener('click', () => irParaAba(el.dataset.irPara));
  });

  // ------------------------------------------------------------
  // Carregamento inicial: perfil + preferências
  // ------------------------------------------------------------
  function preencherPerfil(p) {
    $('cfgNome').value = p.nome || '';
    $('cfgEmail').value = p.email || '';
    $('cfgCargo').value = p.cargo || '';
    $('cfgTelefone').value = p.telefone || '';
    $('cfgContaNome').textContent = p.nome || '—';
    $('cfgContaEmail').textContent = p.email || '—';
    $('cfgContaCargo').textContent = p.cargo || '—';
    $('cfgAvatarLetra').textContent = (p.nome || 'A').trim().charAt(0).toUpperCase();
    if (p.temFoto) {
      $('cfgAvatarImg').src = 'api/configuracoes/foto.php?_=' + Date.now();
      $('cfgAvatarImg').hidden = false;
      $('cfgAvatarLetra').hidden = true;
    } else {
      $('cfgAvatarImg').hidden = true;
      $('cfgAvatarLetra').hidden = false;
    }
    $('cfgBtnSalvarPerfil').disabled = true;
  }

  // ------------------------------------------------------------
  // Aparência (tema / densidade / fonte): aplica na página de Configurações.
  // Automático segue o tema do sistema operacional e reage se ele mudar.
  // ------------------------------------------------------------
  const mqEscuro = window.matchMedia('(prefers-color-scheme: dark)');
  let aparenciaAtual = { tema: 'claro', densidade: 'confortavel', fonte: 'm' };

  function aplicarAparencia(ap) {
    aparenciaAtual = Object.assign({}, aparenciaAtual, ap || {});
    const tema = ['claro', 'escuro', 'automatico'].includes(aparenciaAtual.tema) ? aparenciaAtual.tema : 'claro';
    const densidade = 'confortavel'; // opção de densidade removida da tela
    const fonte = ['p', 'm', 'g'].includes(aparenciaAtual.fonte) ? aparenciaAtual.fonte : 'm';
    const efetivo = tema === 'automatico' ? (mqEscuro.matches ? 'escuro' : 'claro') : tema;

    raiz.dataset.temaEfetivo = efetivo;
    // o tema vale para o site inteiro (assets/js/tema.js)
    if (window.IBTema) window.IBTema.definir(tema);
    raiz.dataset.densidade = densidade;
    raiz.dataset.fonte = fonte;
    // modal e aviso ficam fora de #cfgRaiz
    [$('cfgModalFoto'), $('cfgToast')].forEach((el) => {
      if (!el) return;
      el.dataset.temaEfetivo = efetivo;
      el.dataset.fonte = fonte;
    });
  }
  const aoMudarTemaDoSistema = () => { if (aparenciaAtual.tema === 'automatico') aplicarAparencia(); };
  if (mqEscuro.addEventListener) mqEscuro.addEventListener('change', aoMudarTemaDoSistema);
  else if (mqEscuro.addListener) mqEscuro.addListener(aoMudarTemaDoSistema);

  function preencherPreferencias(prefs) {
    estado.preferencias = prefs;
    document.querySelectorAll('[data-pref]').forEach((el) => {
      const grupo = el.dataset.grupo || (el.closest('[data-grupo]') || {}).dataset ? (el.closest('[data-grupo]') || {}).dataset.grupo : null;
      if (!grupo || !prefs[grupo]) return;
      const chave = el.dataset.pref;
      const valor = prefs[grupo][chave];
      if (valor === undefined) return;
      if (el.type === 'checkbox') el.checked = !!valor;
      else if (el.tagName === 'SELECT' || el.type === 'time') el.value = valor;
    });
    // Opções em cards/pills (aparência)
    document.querySelectorAll('[data-grupo="aparencia"][data-pref]').forEach((wrap) => {
      const chave = wrap.dataset.pref;
      const valor = prefs.aparencia[chave];
      wrap.querySelectorAll('[data-valor]').forEach((botao) => {
        const ativo = botao.dataset.valor === valor;
        botao.classList.toggle('configuracoes__opcao-card--ativo', ativo && botao.classList.contains('configuracoes__opcao-card'));
        botao.classList.toggle('configuracoes__pill--ativo', ativo && botao.classList.contains('configuracoes__pill'));
      });
    });
    aplicarAparencia(prefs.aparencia);
    // Integrações: status
    document.querySelectorAll('[data-status]').forEach((span) => {
      const chave = span.dataset.status;
      const conectado = !!prefs.integracoes[chave];
      span.textContent = conectado ? 'Conectado' : 'Desconectado';
      span.classList.toggle('configuracoes__integracao-status--conectado', conectado);
      const botao = span.closest('.configuracoes__integracao-card').querySelector('[data-pref]');
      botao.textContent = conectado ? 'Desconectar' : 'Conectar';
    });
    $('cfgNaoPerturbeHorario').style.opacity = prefs.notificacoes.nao_perturbe ? '1' : '.45';
  }

  async function carregarTudo() {
    try {
      const dados = await api('perfil.php');
      estado.perfil = {
        nome: dados.perfil.nome, email: dados.perfil.email, telefone: dados.perfil.telefone,
        cargo: dados.perfil.cargo, temFoto: dados.perfil.tem_foto,
      };
      preencherPerfil(estado.perfil);
      preencherPreferencias(dados.preferencias);
      demo = false;
      avisoDemo(false);
    } catch (e) {
      demo = true;
      avisoDemo(true);
      preencherPerfil({
        nome: (raiz.dataset.nomeDemo || 'Administrador'), email: 'administrador@intelbras.com.br',
        cargo: 'Administrador de Sistema', telefone: '', temFoto: false,
      });
      preencherPreferencias(estado.preferencias);
    }
    carregouUmaVez = true;
  }

  // ------------------------------------------------------------
  // Formulário "Meu perfil"
  // ------------------------------------------------------------
  const formPerfil = $('cfgFormPerfil');
  const valoresIniciais = () => JSON.stringify({
    nome: $('cfgNome').value, telefone: $('cfgTelefone').value,
  });
  let snapshotPerfil = null;

  function marcarSnapshotPerfil() {
    snapshotPerfil = valoresIniciais();
    $('cfgBtnSalvarPerfil').disabled = true;
  }

  formPerfil.addEventListener('input', () => {
    $('cfgBtnSalvarPerfil').disabled = snapshotPerfil === valoresIniciais();
  });
  formPerfil.addEventListener('change', () => {
    $('cfgBtnSalvarPerfil').disabled = snapshotPerfil === valoresIniciais();
  });

  $('cfgTelefone').addEventListener('input', (ev) => {
    let d = ev.target.value.replace(/\D/g, '').slice(0, 11);
    if (d.length > 10) ev.target.value = d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    else if (d.length > 6) ev.target.value = d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    else if (d.length > 2) ev.target.value = d.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    else ev.target.value = d;
  });

  function limparErrosForm(form) {
    form.querySelectorAll('[data-erro-para]').forEach((s) => { s.textContent = ''; });
    form.querySelectorAll('.configuracoes__campo--erro').forEach((c) => c.classList.remove('configuracoes__campo--erro'));
  }

  function mostrarErrosForm(form, campos) {
    if (!campos) return;
    Object.keys(campos).forEach((chave) => {
      const span = form.querySelector('[data-erro-para="' + chave + '"]');
      if (span) {
        span.textContent = campos[chave];
        const campo = span.closest('.configuracoes__campo');
        if (campo) campo.classList.add('configuracoes__campo--erro');
      }
    });
  }

  formPerfil.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErrosForm(formPerfil);
    const btn = $('cfgBtnSalvarPerfil');
    const spinner = btn.querySelector('.configuracoes__spinner');
    btn.disabled = true;
    spinner.hidden = false;

    const corpo = {
      nome: $('cfgNome').value.trim(),
      telefone: $('cfgTelefone').value,
    };

    try {
      if (demo) {
        Object.assign(estado.perfil, corpo);
        $('cfgContaNome').textContent = corpo.nome;
      } else {
        await api('perfil.php', { metodo: 'POST', corpo });
      }
      $('cfgContaNome').textContent = corpo.nome;
      $('cfgAvatarLetra').textContent = corpo.nome.trim().charAt(0).toUpperCase();
      marcarSnapshotPerfil();
      toast('Alterações salvas com sucesso');
    } catch (e) {
      if (e.campos) mostrarErrosForm(formPerfil, e.campos);
      else toast(e.message || 'Não foi possível salvar.');
      btn.disabled = false;
    } finally {
      spinner.hidden = true;
    }
  });

  // ------------------------------------------------------------
  // Preferências (toggles, selects, cards, pills) — salvar por grupo
  // ------------------------------------------------------------
  function valorAtualPref(el) {
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  }

  async function salvarGrupo(grupo, valores) {
    if (demo) {
      Object.assign(estado.preferencias[grupo], valores);
      return estado.preferencias[grupo];
    }
    const resp = await api('preferencias.php', { metodo: 'POST', corpo: { grupo, valores } });
    return resp.valores;
  }

  document.querySelectorAll('[data-salvar-grupo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const grupo = btn.dataset.salvarGrupo;
      const valores = {};
      document.querySelectorAll('[data-grupo="' + grupo + '"] [data-pref], [data-pref][data-grupo="' + grupo + '"]').forEach((el) => {
        if (el.type === 'time' && !el.value) return; // horário vazio: mantém o valor salvo
        valores[el.dataset.pref] = valorAtualPref(el);
      });
      try {
        await salvarGrupo(grupo, valores);
        toast('Alterações salvas com sucesso');
      } catch (e) {
        toast(e.message || 'Não foi possível salvar.');
      }
    });
  });

  // Não perturbe: habilita/desabilita os horários visualmente
  $('cfgNaoPerturbe').addEventListener('change', (ev) => {
    $('cfgNaoPerturbeHorario').style.opacity = ev.target.checked ? '1' : '.45';
  });

  // Aparência: clique nos cards/pills aplica na hora e salva
  function marcarOpcaoAtiva(wrap, valor) {
    wrap.querySelectorAll('[data-valor]').forEach((b) => {
      const ativo = b.dataset.valor === valor;
      b.classList.toggle('configuracoes__opcao-card--ativo', ativo && b.classList.contains('configuracoes__opcao-card'));
      b.classList.toggle('configuracoes__pill--ativo', ativo && b.classList.contains('configuracoes__pill'));
    });
  }

  document.querySelectorAll('[data-grupo="aparencia"][data-pref]').forEach((wrap) => {
    wrap.addEventListener('click', async (ev) => {
      const botao = ev.target.closest('[data-valor]');
      if (!botao) return;
      const chave = wrap.dataset.pref;
      const anterior = aparenciaAtual[chave];
      if (botao.dataset.valor === anterior) return;
      marcarOpcaoAtiva(wrap, botao.dataset.valor);
      aplicarAparencia({ [chave]: botao.dataset.valor });
      try {
        await salvarGrupo('aparencia', { [chave]: botao.dataset.valor });
        if (estado.preferencias && estado.preferencias.aparencia) estado.preferencias.aparencia[chave] = botao.dataset.valor;
        toast('Alterações salvas com sucesso');
      } catch (e) {
        marcarOpcaoAtiva(wrap, anterior);
        aplicarAparencia({ [chave]: anterior });
        toast(e.message || 'Não foi possível salvar.');
      }
    });
  });

  // Privacidade: selects salvam na troca
  document.querySelectorAll('[data-grupo="privacidade"] select, select[data-pref="status_visivel"], select[data-pref="mensagens_diretas"]').forEach((sel) => {
    // já cobertos pelo botão "Salvar alterações" da aba; sem auto-save aqui.
  });

  // Autenticação em duas etapas: os dois toggles (aba Segurança + card lateral) ficam espelhados
  const togglesDuasEtapas = Array.from(document.querySelectorAll('input[data-pref="duas_etapas"]'));
  togglesDuasEtapas.forEach((input) => {
    input.addEventListener('change', async (ev) => {
      const valor = ev.target.checked;
      togglesDuasEtapas.forEach((i) => { i.checked = valor; });
      try {
        await salvarGrupo('seguranca', { duas_etapas: valor });
        toast(valor ? 'Autenticação em duas etapas ativada' : 'Autenticação em duas etapas desativada');
      } catch (e) {
        togglesDuasEtapas.forEach((i) => { i.checked = !valor; });
        toast(e.message || 'Não foi possível salvar.');
      }
    });
  });

  // Integrações: clique no botão Conectar/Desconectar
  document.querySelectorAll('.configuracoes__integracao-card [data-pref]').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const chave = botao.dataset.pref;
      const span = document.querySelector('[data-status="' + chave + '"]');
      const novoValor = !estado.preferencias.integracoes[chave];
      try {
        const grupo = await salvarGrupo('integracoes', { [chave]: novoValor });
        estado.preferencias.integracoes = grupo;
        const conectado = !!grupo[chave];
        span.textContent = conectado ? 'Conectado' : 'Desconectado';
        span.classList.toggle('configuracoes__integracao-status--conectado', conectado);
        botao.textContent = conectado ? 'Desconectar' : 'Conectar';
        toast(conectado ? 'Integração conectada' : 'Integração desconectada');
      } catch (e) {
        toast(e.message || 'Não foi possível concluir a ação.');
      }
    });
  });

  // ------------------------------------------------------------
  // Alterar senha
  // ------------------------------------------------------------
  const formSenha = $('cfgFormSenha');

  // "Esqueci minha senha": mesmo fluxo do login (api/esqueci_senha.php -> e-mail pela Brevo),
  // enviado para o e-mail da conta logada.
  const btnEsqueci = $('cfgEsqueciSenha');
  btnEsqueci.addEventListener('click', async () => {
    const email = estado.perfil && estado.perfil.email;
    if (!email) { toast('Não foi possível identificar o e-mail da sua conta.'); return; }
    const texto = btnEsqueci.textContent;
    btnEsqueci.disabled = true;
    btnEsqueci.textContent = 'Enviando...';
    try {
      const resp = await fetch('api/esqueci_senha.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      let dados = null;
      try { dados = await resp.json(); } catch (_) { dados = null; }
      if (resp.ok && dados && dados.sucesso) toast(dados.mensagem || 'Link enviado! Confira seu e-mail.');
      else toast((dados && dados.erro) || 'Não foi possível enviar agora. Tente novamente.');
    } catch (_) {
      toast('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      btnEsqueci.disabled = false;
      btnEsqueci.textContent = texto;
    }
  });

  $('cfgSenhaNova').addEventListener('input', (ev) => {
    const v = ev.target.value;
    const forca = $('cfgForcaSenha');
    if (!v) { forca.textContent = ''; return; }
    let pontos = 0;
    if (v.length >= 8) pontos++;
    if (/[A-Z]/.test(v)) pontos++;
    if (/\d/.test(v)) pontos++;
    if (/[^A-Za-z0-9]/.test(v)) pontos++;
    const rotulos = ['Fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'];
    forca.textContent = 'Força: ' + rotulos[pontos];
  });

  formSenha.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErrosForm(formSenha);
    const corpo = {
      atual: $('cfgSenhaAtual').value,
      nova: $('cfgSenhaNova').value,
      confirmar: $('cfgSenhaConfirmar').value,
    };
    try {
      if (demo) {
        if (corpo.nova.length < 8) throw Object.assign(new Error(''), { campos: { nova: 'Use ao menos 8 caracteres, com letras e números.' } });
        if (corpo.nova !== corpo.confirmar) throw Object.assign(new Error(''), { campos: { confirmar: 'A confirmação não confere com a nova senha.' } });
      } else {
        await api('senha.php', { metodo: 'POST', corpo });
      }
      formSenha.reset();
      $('cfgForcaSenha').textContent = '';
      toast('Senha alterada com sucesso');
    } catch (e) {
      if (e.campos) mostrarErrosForm(formSenha, e.campos);
      else toast(e.message || 'Não foi possível alterar a senha.');
    }
  });

  // ------------------------------------------------------------
  // Foto de perfil (modal)
  // ------------------------------------------------------------
  const modal = $('cfgModalFoto');
  const fotoInput = $('cfgFotoInput');
  let arquivoSelecionado = null;

  function abrirModalFoto() {
    $('cfgModalErro').textContent = '';
    $('cfgModalSalvar').disabled = true;
    $('cfgModalRemover').hidden = !estado.perfil.temFoto;
    $('cfgModalEditor').hidden = true;
    $('cfgModalDropTexto').hidden = false;
    arquivoSelecionado = null;
    modal.setAttribute('aria-hidden', 'false');
  }

  function fecharModalFoto() {
    modal.setAttribute('aria-hidden', 'true');
  }

  $('cfgBtnCamera').addEventListener('click', abrirModalFoto);
  $('cfgBtnAlterarFoto').addEventListener('click', abrirModalFoto);
  modal.querySelectorAll('[data-fechar-modal]').forEach((el) => el.addEventListener('click', fecharModalFoto));

  $('cfgModalEscolher').addEventListener('click', () => fotoInput.click());
  $('cfgModalTrocar').addEventListener('click', () => { fotoInput.value = ''; fotoInput.click(); });
  $('cfgModalDrop').addEventListener('dragover', (ev) => ev.preventDefault());
  $('cfgModalDrop').addEventListener('drop', (ev) => {
    ev.preventDefault();
    if (ev.dataTransfer.files && ev.dataTransfer.files[0]) selecionarArquivo(ev.dataTransfer.files[0]);
  });
  fotoInput.addEventListener('change', () => {
    if (fotoInput.files && fotoInput.files[0]) selecionarArquivo(fotoInput.files[0]);
  });

  function selecionarArquivo(arquivo) {
    const erroEl = $('cfgModalErro');
    erroEl.textContent = '';
    if (!['image/jpeg', 'image/png'].includes(arquivo.type)) {
      erroEl.textContent = 'Formato inválido. Use JPG ou PNG.';
      return;
    }
    if (arquivo.size > 5 * 1024 * 1024) {
      erroEl.textContent = 'A imagem deve ter no máximo 5MB.';
      return;
    }
    arquivoSelecionado = arquivo;
    const leitor = new FileReader();
    leitor.onload = () => {
      const img = $('cfgModalPreview');
      img.onload = () => {
        $('cfgModalDropTexto').hidden = true;
        $('cfgModalEditor').hidden = false;
        iniciarEnquadramento(img);
        $('cfgModalSalvar').disabled = false;
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  }

  // ------------------------------------------------------------
  // Enquadramento da foto: arrastar + zoom, vista circular
  // ------------------------------------------------------------
  const vista = $('cfgModalVista');
  const zoomInput = $('cfgModalZoom');
  const crop = { escalaMin: 1, escala: 1, x: 0, y: 0 };

  function limitarCrop() {
    const img = $('cfgModalPreview');
    const V = vista.clientWidth;
    const larg = img.naturalWidth * crop.escala;
    const alt = img.naturalHeight * crop.escala;
    crop.x = Math.min(0, Math.max(V - larg, crop.x));
    crop.y = Math.min(0, Math.max(V - alt, crop.y));
  }

  function aplicarCrop() {
    const img = $('cfgModalPreview');
    limitarCrop();
    img.style.width = (img.naturalWidth * crop.escala) + 'px';
    img.style.height = (img.naturalHeight * crop.escala) + 'px';
    img.style.left = crop.x + 'px';
    img.style.top = crop.y + 'px';
  }

  function iniciarEnquadramento(img) {
    const V = vista.clientWidth;
    crop.escalaMin = V / Math.min(img.naturalWidth, img.naturalHeight);
    crop.escala = crop.escalaMin;
    crop.x = (V - img.naturalWidth * crop.escala) / 2;
    crop.y = (V - img.naturalHeight * crop.escala) / 2;
    zoomInput.value = 1;
    aplicarCrop();
  }

  function definirZoom(mult) {
    const V = vista.clientWidth;
    const antiga = crop.escala;
    crop.escala = crop.escalaMin * Math.min(3, Math.max(1, mult));
    // mantém o centro da vista no mesmo ponto da imagem
    const cx = (V / 2 - crop.x) / antiga;
    const cy = (V / 2 - crop.y) / antiga;
    crop.x = V / 2 - cx * crop.escala;
    crop.y = V / 2 - cy * crop.escala;
    zoomInput.value = crop.escala / crop.escalaMin;
    aplicarCrop();
  }

  zoomInput.addEventListener('input', () => definirZoom(parseFloat(zoomInput.value)));
  vista.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    definirZoom((crop.escala / crop.escalaMin) * (ev.deltaY < 0 ? 1.08 : 1 / 1.08));
  }, { passive: false });

  let arrasto = null;
  vista.addEventListener('pointerdown', (ev) => {
    arrasto = { px: ev.clientX, py: ev.clientY, x: crop.x, y: crop.y };
    vista.setPointerCapture(ev.pointerId);
    vista.classList.add('configuracoes__crop-vista--arrastando');
  });
  vista.addEventListener('pointermove', (ev) => {
    if (!arrasto) return;
    crop.x = arrasto.x + (ev.clientX - arrasto.px);
    crop.y = arrasto.y + (ev.clientY - arrasto.py);
    aplicarCrop();
  });
  const soltar = () => { arrasto = null; vista.classList.remove('configuracoes__crop-vista--arrastando'); };
  vista.addEventListener('pointerup', soltar);
  vista.addEventListener('pointercancel', soltar);

  // Gera o recorte quadrado (exatamente o que aparece na vista) em 512x512
  function gerarRecorte() {
    return new Promise((resolve, reject) => {
      const img = $('cfgModalPreview');
      const V = vista.clientWidth;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      const lado = V / crop.escala;
      ctx.drawImage(img, -crop.x / crop.escala, -crop.y / crop.escala, lado, lado, 0, 0, 512, 512);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Não foi possível processar a imagem.')); return; }
        resolve({ blob, dataUrl: canvas.toDataURL('image/png') });
      }, 'image/png');
    });
  }

  $('cfgModalSalvar').addEventListener('click', async () => {
    if (!arquivoSelecionado) return;
    try {
      const recorte = await gerarRecorte();
      if (!demo) {
        const fd = new FormData();
        fd.append('foto', new File([recorte.blob], 'foto.png', { type: 'image/png' }));
        await api('foto.php', { metodo: 'POST', formData: fd });
      }
      estado.perfil.temFoto = true;
      $('cfgAvatarImg').src = demo ? recorte.dataUrl : ('api/configuracoes/foto.php?_=' + Date.now());
      $('cfgAvatarImg').hidden = false;
      $('cfgAvatarLetra').hidden = true;
      fecharModalFoto();
      toast('Foto atualizada com sucesso');
    } catch (e) {
      $('cfgModalErro').textContent = e.message || 'Não foi possível salvar a imagem.';
    }
  });

  $('cfgModalRemover').addEventListener('click', async () => {
    try {
      if (!demo) await api('foto.php', { metodo: 'POST', corpo: { acao: 'remover' } });
      estado.perfil.temFoto = false;
      $('cfgAvatarImg').hidden = true;
      $('cfgAvatarLetra').hidden = false;
      fecharModalFoto();
      toast('Foto removida');
    } catch (e) {
      $('cfgModalErro').textContent = e.message || 'Não foi possível remover a foto.';
    }
  });

  // ------------------------------------------------------------
  // Dispositivos / sessões ativas
  // ------------------------------------------------------------
  const iconeDispositivo = {
    desktop: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="12" rx="1.6" stroke="currentColor" stroke-width="1.6"/><path d="M8 20.5h8M12 17v3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    celular: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="3" width="10" height="18" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M11 18h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    tablet: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M11 18h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  };

  function renderizarDispositivos(lista) {
    const html = lista.map((s) => `
      <li class="configuracoes__dispositivo">
        <span class="configuracoes__dispositivo-icone">${iconeDispositivo[s.dispositivo] || iconeDispositivo.desktop}</span>
        <span class="configuracoes__dispositivo-info">
          <span class="configuracoes__dispositivo-nome">${s.navegador} · ${s.sistema}${s.atual ? ' <span class="configuracoes__badge-atual">Este dispositivo</span>' : ''}</span>
          <span class="configuracoes__dispositivo-detalhe">${s.ip} · último acesso ${formatarData(s.ultimo_acesso)}</span>
        </span>
        ${s.atual ? '' : `<button type="button" class="configuracoes__btn configuracoes__btn--contorno configuracoes__btn--pequeno" data-desconectar="${s.id}">Desconectar</button>`}
      </li>`).join('');
    $('cfgListaDispositivos').innerHTML = html || '<li class="configuracoes__dispositivo">Nenhum dispositivo encontrado.</li>';
    $('cfgListaSessoesAba').innerHTML = $('cfgListaDispositivos').innerHTML;
  }

  async function carregarSessoes() {
    if (dispositivosAtuais && !demo) {
      renderizarDispositivos(dispositivosAtuais);
      return;
    }
    try {
      if (demo) throw new Error('demo');
      const resp = await api('sessoes.php');
      dispositivosAtuais = resp.sessoes;
    } catch (e) {
      dispositivosAtuais = dispositivosDemo;
    }
    renderizarDispositivos(dispositivosAtuais);
  }

  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-desconectar]');
    if (!btn) return;
    const id = Number(btn.dataset.desconectar);
    try {
      if (!demo) await api('sessoes.php', { metodo: 'POST', corpo: { acao: 'encerrar', id } });
      dispositivosAtuais = (dispositivosAtuais || []).filter((s) => s.id !== id);
      renderizarDispositivos(dispositivosAtuais);
      toast('Sessão encerrada');
    } catch (e) {
      toast(e.message || 'Não foi possível encerrar a sessão.');
    }
  });

  $('cfgBtnEncerrarOutras').addEventListener('click', async () => {
    try {
      if (!demo) await api('sessoes.php', { metodo: 'POST', corpo: { acao: 'encerrar_outras' } });
      dispositivosAtuais = (dispositivosAtuais || []).filter((s) => s.atual);
      renderizarDispositivos(dispositivosAtuais);
      toast('As demais sessões foram encerradas');
    } catch (e) {
      toast(e.message || 'Não foi possível encerrar as sessões.');
    }
  });

  // Botão direito num dispositivo conectado (menu padronizado do site, assets/js/menu-contexto.js)
  document.addEventListener('contextmenu', (e) => {
    const M = window.MenuContexto;
    const li = e.target.closest('.configuracoes__dispositivo');
    if (!M || !li || e.shiftKey || M.temSelecao()) return;
    const nomeEl = li.querySelector('.configuracoes__dispositivo-nome');
    if (!nomeEl) return;
    const nome = nomeEl.textContent.replace('Este dispositivo', '').replace(/\s+/g, ' ').trim();
    const detalheEl = li.querySelector('.configuracoes__dispositivo-detalhe');
    const ip = detalheEl ? detalheEl.textContent.split('·')[0].trim() : '';
    const btn = li.querySelector('[data-desconectar]');
    const opcoes = [];
    if (btn) opcoes.push({ rotulo: 'Desconectar este dispositivo', icone: 'sair', perigo: true, acao: () => btn.click() });
    else opcoes.push({ rotulo: 'Este é o dispositivo atual', icone: 'pagina', desabilitado: true, acao: () => {} });
    if (ip) opcoes.push({ rotulo: 'Copiar endereço IP', icone: 'copiar', acao: () => M.copiar(ip, 'IP copiado') });
    e.preventDefault();
    const pos = M.posicao(e, li);
    M.mostrar({ x: pos.x, y: pos.y, alvo: null, aria: 'Opções de ' + nome, cabeca: M.cabeca('pagina', nome), opcoes: opcoes });
  });

  // ------------------------------------------------------------
  // Aviso de alterações não salvas ao trocar de aba (perfil)
  // ------------------------------------------------------------
  // Saída/recarregar com alterações não salvas: popout padrão do site
  // (assets/js/dialogo.js). Só o que o site não intercepta (botão recarregar
  // da barra, fechar a aba, voltar) ainda mostra o aviso do navegador.
  if (window.IBDialogo) {
    window.IBDialogo.protegerSaida(() => !$('cfgBtnSalvarPerfil').disabled, {
      titulo: 'Sair sem salvar?',
      texto: 'Você editou seu perfil e ainda não salvou. Se sair agora, as alterações serão perdidas.',
      confirmar: 'Sair sem salvar',
      cancelar: 'Continuar editando',
      tituloRecarregar: 'Recarregar sem salvar?',
      textoRecarregar: 'Você editou seu perfil e ainda não salvou. Se recarregar agora, as alterações serão perdidas.',
      confirmarRecarregar: 'Recarregar',
    });
  }

  // ------------------------------------------------------------
  // Dropdowns (Privacidade, etc.): o menu do seletor padrão é um
  // único elemento fixo no <body> e, com textos longos (ex.: opções longas), ficava mais largo que o campo e vazava para fora
  // do cartão. Aqui, só nesta página, ele passa a acompanhar o campo:
  // no celular tem a mesma largura e alinhamento do campo (texto longo quebra
  // linha em vez de vazar); no desktop alinha pela borda direita do campo.
  // ------------------------------------------------------------
  const mqCelular = window.matchMedia('(max-width: 767px)');

  function limparMenuSeletor() {
    const menu = document.querySelector('.seletor__menu');
    if (!menu) return;
    menu.classList.remove('seletor__menu--cfg');
    menu.style.width = '';
    delete menu.dataset.temaEfetivo;
    delete menu.dataset.fonte;
  }

  function ajustarMenuSeletor(botao) {
    const menu = document.querySelector('.seletor__menu');
    if (!menu || menu.hidden || botao.getAttribute('aria-expanded') !== 'true') return;
    const r = botao.getBoundingClientRect();
    const margem = 8;
    menu.classList.add('seletor__menu--cfg');
    menu.dataset.temaEfetivo = raiz.dataset.temaEfetivo || 'claro';
    menu.dataset.fonte = raiz.dataset.fonte || 'm';

    let left;
    if (mqCelular.matches) {
      menu.style.width = Math.round(r.width) + 'px';
      left = r.left;
    } else {
      left = r.right - menu.offsetWidth;
    }
    left = Math.min(left, window.innerWidth - margem - menu.offsetWidth);
    menu.style.left = Math.max(margem, left) + 'px';

    // a altura pode ter mudado (texto quebrado): reavalia se abre para cima
    const h = menu.offsetHeight;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - margem && r.top - h - 6 > margem) top = r.top - h - 6;
    menu.style.top = top + 'px';
  }

  // captura: roda ANTES do seletor abrir (limpa largura da abertura anterior)
  raiz.addEventListener('click', (ev) => {
    if (ev.target.closest('.seletor__botao')) limparMenuSeletor();
  }, true);
  raiz.addEventListener('keydown', (ev) => {
    if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && ev.target.closest('.seletor__botao')) limparMenuSeletor();
  }, true);
  // bubbling: roda DEPOIS do seletor abrir e posicionar o menu
  const aposAbrir = (ev) => {
    const botao = ev.target.closest('.seletor__botao');
    if (botao) ajustarMenuSeletor(botao);
  };
  raiz.addEventListener('click', aposAbrir);
  raiz.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') aposAbrir(ev);
  });

  // ------------------------------------------------------------
  // Inicialização
  // ------------------------------------------------------------
  if (params.get('demo') === '1') {
    demo = true;
    preencherPerfil({ nome: 'Administrador', email: 'administrador@intelbras.com.br', cargo: 'Administrador de Sistema', telefone: '', temFoto: false });
    preencherPreferencias(estado.preferencias);
    avisoDemo(true);
    marcarSnapshotPerfil();
  } else {
    carregarTudo().then(marcarSnapshotPerfil);
  }

  // ---------- Menu lateral: botão "Recolher" (mesmo comportamento das demais páginas) ----------
  const btnRecolherMenu = document.getElementById('btnRecolher');
  if (btnRecolherMenu) btnRecolherMenu.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
})();
