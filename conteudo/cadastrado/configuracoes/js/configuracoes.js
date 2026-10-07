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
      nome: '', email: '', telefone: '', cargo: '', idioma: 'pt-BR', fuso: 'America/Sao_Paulo', temFoto: false,
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
    $('cfgIdioma').value = p.idioma || 'pt-BR';
    $('cfgFuso').value = p.fuso || 'America/Sao_Paulo';
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
        cargo: dados.perfil.cargo, idioma: dados.perfil.idioma, fuso: dados.perfil.fuso, temFoto: dados.perfil.tem_foto,
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
        cargo: 'Administrador de Sistema', telefone: '', idioma: 'pt-BR', fuso: 'America/Sao_Paulo', temFoto: false,
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
    nome: $('cfgNome').value, telefone: $('cfgTelefone').value, idioma: $('cfgIdioma').value, fuso: $('cfgFuso').value,
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
      idioma: $('cfgIdioma').value,
      fuso: $('cfgFuso').value,
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

  // Aparência: clique nos cards/pills salva na hora
  document.querySelectorAll('[data-grupo="aparencia"][data-pref]').forEach((wrap) => {
    wrap.addEventListener('click', async (ev) => {
      const botao = ev.target.closest('[data-valor]');
      if (!botao) return;
      const chave = wrap.dataset.pref;
      wrap.querySelectorAll('[data-valor]').forEach((b) => {
        b.classList.remove('configuracoes__opcao-card--ativo', 'configuracoes__pill--ativo');
      });
      botao.classList.add(botao.classList.contains('configuracoes__opcao-card') ? 'configuracoes__opcao-card--ativo' : 'configuracoes__pill--ativo');
      try {
        await salvarGrupo('aparencia', { [chave]: botao.dataset.valor });
        toast('Alterações salvas com sucesso');
      } catch (e) {
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
    $('cfgModalPreview').hidden = true;
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
      $('cfgModalPreview').src = leitor.result;
      $('cfgModalPreview').hidden = false;
      $('cfgModalDropTexto').hidden = true;
    };
    leitor.readAsDataURL(arquivo);
    $('cfgModalSalvar').disabled = false;
  }

  $('cfgModalSalvar').addEventListener('click', async () => {
    if (!arquivoSelecionado) return;
    try {
      if (!demo) {
        const fd = new FormData();
        fd.append('foto', arquivoSelecionado);
        await api('foto.php', { metodo: 'POST', formData: fd });
      }
      estado.perfil.temFoto = true;
      $('cfgAvatarImg').src = demo ? $('cfgModalPreview').src : ('api/configuracoes/foto.php?_=' + Date.now());
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

  // ------------------------------------------------------------
  // Aviso de alterações não salvas ao trocar de aba (perfil)
  // ------------------------------------------------------------
  window.addEventListener('beforeunload', (ev) => {
    if (!$('cfgBtnSalvarPerfil').disabled) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  });

  // ------------------------------------------------------------
  // Inicialização
  // ------------------------------------------------------------
  if (params.get('demo') === '1') {
    demo = true;
    preencherPerfil({ nome: 'Administrador', email: 'administrador@intelbras.com.br', cargo: 'Administrador de Sistema', telefone: '', idioma: 'pt-BR', fuso: 'America/Sao_Paulo', temFoto: false });
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
