<?php
declare(strict_types=1);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$logado = !empty($_SESSION['usuario_id']);

// Visibilidade das equipes no menu lateral (cada usuário só vê a própria
// equipe; o Administrador Intelbras, id 1, vê todas).
if ($logado) {
    require_once __DIR__ . '/api/equipes/_visibilidade.php';
}

// Token CSRF do módulo Chamadas (usado também pelo alerta global de
// chamada recebida, que roda em todas as páginas da área logada).
if ($logado && empty($_SESSION['csrf_chamadas'])) {
    $_SESSION['csrf_chamadas'] = bin2hex(random_bytes(32));
}
$csrfChamadasGlobal = $logado ? (string)$_SESSION['csrf_chamadas'] : '';

// ============================================================
// ROTEAMENTO SIMPLES POR QUERY STRING (?pagina=...)
// Só é usado na área CADASTRADO. Cada item do menu lateral
// aponta pra "index.php?pagina=<slug>"; se a página ainda não
// foi desenvolvida, cai no placeholder "em breve" (sem popout
// de acesso negado e sem erro).
// ============================================================
$paginasCadastrado = [
    'inicio'                  => 'conteudo/cadastrado/inicio/html/inicio.html',
    'servicos'                => 'conteudo/cadastrado/servicos/html/servicos.html',
    'inteligencia-artificial' => 'conteudo/cadastrado/inteligencia-artificial/html/inteligencia-artificial.html',
    'documentos'              => 'conteudo/cadastrado/documentos/html/documentos.html',
    'unidade'                 => 'conteudo/cadastrado/unidade/html/unidade.html',
    'chamadas'                => 'conteudo/cadastrado/chamadas/html/chamadas.html',
    'cursos'                  => 'conteudo/cadastrado/cursos/html/cursos.html',
    'loja'                    => 'conteudo/cadastrado/loja/html/loja.html',
    'dashboard'               => 'conteudo/cadastrado/dashboard/html/dashboard.html',
    'equipes'                 => 'conteudo/cadastrado/equipes/html/equipes.html',
    'chat'                    => 'conteudo/cadastrado/chat/html/chat.html',
    'agendar-reuniao'         => 'conteudo/cadastrado/agendar-reuniao/html/agendar-reuniao.html',
    'configuracoes'           => 'conteudo/cadastrado/configuracoes/html/configuracoes.html',
];

// Título da aba: sempre "Página - Intelbras" (mesmo padrão das páginas legais).
$titulosPagina = [
    'inicio'                  => 'Início',
    'servicos'                => 'Serviços',
    'inteligencia-artificial' => 'Inteligência Artificial',
    'documentos'              => 'Documentos',
    'unidade'                 => 'Unidade',
    'chamadas'                => 'Chamadas',
    'cursos'                  => 'Cursos',
    'loja'                    => 'Loja',
    'dashboard'               => 'Dashboard',
    'equipes'                 => 'Equipes',
    'chat'                    => 'Chat',
    'agendar-reuniao'         => 'Agendar reunião',
    'configuracoes'           => 'Configurações',
];

// Compatibilidade: a antiga rota ?pagina=usuarios virou ?pagina=dashboard
// (favoritos e links antigos continuam funcionando).
if (($_GET['pagina'] ?? '') === 'usuarios') {
    header('Location: index.php?pagina=dashboard', true, 301);
    exit;
}

$paginaSolicitada = isset($_GET['pagina']) ? (string)$_GET['pagina'] : 'inicio';
if (!array_key_exists($paginaSolicitada, $paginasCadastrado)) {
    $paginaSolicitada = 'inicio';
}

// "Agendar reunião": só Gerente, Diretor e CEO (e o Administrador, id 1).
$podeAgendar = false;
if ($logado) {
    if ((int)$_SESSION['usuario_id'] === 1) {
        $podeAgendar = true;
    } else {
        try {
            require_once __DIR__ . '/api/conexao.php';
            $stCargo = conectar()->prepare('SELECT cargo FROM tb_usuarios WHERE id = ? LIMIT 1');
            $stCargo->execute([(int)$_SESSION['usuario_id']]);
            $podeAgendar = in_array((string)$stCargo->fetchColumn(), ['gerente', 'diretor', 'ceo'], true);
        } catch (Throwable $e) {
            $podeAgendar = false;
        }
    }
    if ($paginaSolicitada === 'agendar-reuniao' && !$podeAgendar) {
        header('Location: index.php?pagina=chamadas&aviso=agendar');
        exit;
    }
}

// Tema do site (Configurações > Aparência): claro | escuro | automatico.
// Usuário logado: vale a preferência da conta (tb_usuario_preferencias).
// Visitante: o assets/js/tema.js usa o último valor guardado no navegador.
// Sem preferência salva (ou se a tabela ainda não existir): CLARO.
$temaPref = 'claro';
if ($logado) {
    try {
        require_once __DIR__ . '/api/conexao.php';
        $stTema = conectar()->prepare('SELECT dados FROM tb_usuario_preferencias WHERE usuario_id = ? LIMIT 1');
        $stTema->execute([(int)$_SESSION['usuario_id']]);
        $dadosTema = json_decode((string)$stTema->fetchColumn(), true);
        $valorTema = is_array($dadosTema) ? ($dadosTema['aparencia']['tema'] ?? 'claro') : 'claro';
        if (in_array($valorTema, ['claro', 'escuro', 'automatico'], true)) {
            $temaPref = $valorTema;
        }
    } catch (Throwable $e) {
        $temaPref = 'claro';
    }
}
?>
<!DOCTYPE html>
<html lang="pt-BR"<?php echo $logado ? ' data-tema-pref="' . $temaPref . '"' : ''; ?>>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <link rel="icon" href="assets/img/favicon/favicon.ico?v=2" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="assets/img/favicon/favicon-32.png?v=2">
  <link rel="icon" type="image/png" sizes="192x192" href="assets/img/favicon/favicon-192.png?v=2">
  <link rel="apple-touch-icon" href="assets/img/favicon/apple-touch-icon.png?v=2">
  <meta name="color-scheme" content="light dark">
  <!-- Tema (Claro/Escuro/Automático): script síncrono + CSS, antes de todo o resto, para não piscar -->
  <script src="assets/js/tema.js?v=1"></script>
  <script src="assets/js/dialogo.js?v=1"></script>
  <!-- Responsivo: marca o <html> com o tipo de tela (toque, retrato, faixa) e a altura visível -->
  <script src="assets/js/responsivo.js?v=1"></script>
  <link rel="stylesheet" href="assets/css/tema-escuro.css?v=6">
  <link rel="stylesheet" href="assets/css/barra-rolagem.css?v=2">
  <!-- Troca de página sem "HTML cru": o navegador só mostra a página nova quando o
       marcador #mv-fim (último elemento do <body>, depois de TODOS os CSS) já foi lido.
       Sem isso, na transição entre páginas aparecia o HTML antes do CSS carregar.
       Chromium 124+; nos demais navegadores é ignorado e nada quebra. -->
  <link rel="expect" href="#mv-fim" blocking="render">
  <title><?php echo htmlspecialchars((($logado ? ($titulosPagina[$paginaSolicitada] ?? 'Início') : 'Início')) . ' - Intelbras', ENT_QUOTES, 'UTF-8'); ?></title>
  <!-- Anti-flash da camada de movimento: esconde o <main> até o movimento.js
       classificar a página (1ª varredura). Se algo falhar, libera em 1,5s. -->
  <script>document.documentElement.classList.add('mv-boot');setTimeout(function(){document.documentElement.classList.remove('mv-boot')},1500);</script>
  <link rel="stylesheet" href="assets/css/popout-bloqueio.css">
  <link rel="stylesheet" href="assets/css/dialogo.css?v=1">
  <link rel="stylesheet" href="assets/css/seletor.css">
  <link rel="stylesheet" href="assets/css/busca-pagina.css?v=3">
  <link rel="stylesheet" href="assets/css/chamadas-alerta.css?v=20261004">
  <link rel="stylesheet" href="assets/css/menu-contexto.css?v=8">
  <link rel="stylesheet" href="assets/css/aviso-permissao.css?v=2">
  <style>
    /* Suaviza o crossfade nativo da troca de página (padrão do navegador
       é meio abrupto); mantém curto pra não parecer lento. */
    /* Liga a transição entre páginas (precisa estar no <head>, antes do 1º desenho). */
    @view-transition { navigation: auto; }
    ::view-transition-old(root),
    ::view-transition-new(root) {
      animation-duration: 0.18s;
      animation-timing-function: ease;
    }
  </style>
</head>
<body style="margin:0;" data-logado="<?php echo $logado ? '1' : '0'; ?>" data-pode-agendar="<?php echo $podeAgendar ? '1' : '0'; ?>" data-chamadas-csrf="<?php echo htmlspecialchars($csrfChamadasGlobal, ENT_QUOTES, 'UTF-8'); ?>">
  <script>
    // Aplica a classe "sidebar-open" o quanto antes (assim que o <body>
    // existe, antes do menu ser desenhado), lendo a preferência salva
    // pelo cabecalho.js. Isso mantém o menu lateral aberto ao trocar de
    // aba, em vez de fechar e exigir clicar em "Todas categorias" de novo.
    // Ao ABRIR o site (nova aba/janela ou novo acesso) o menu começa sempre
    // fechado, em qualquer tela: a preferência fica só em sessionStorage, que
    // vale apenas enquanto aquela aba está aberta (trocar de página mantém).
    // Em tela estreita (zoom alto / celular) o menu é uma gaveta por cima do
    // conteúdo e começa sempre fechado (ver assets/css/zoom.css e zoom.js).
    try {
      localStorage.removeItem('sidebarOpen'); // valor antigo, de quando era permanente
      if (sessionStorage.getItem('sidebarOpen') === '1' && !window.matchMedia('(max-width: 860px)').matches) {
        document.body.classList.add('sidebar-open');
      }
    } catch (e) { /* sem storage: menu fechado */ }
  </script>

  <?php include 'cabecalho/html/cabecalho.html'; ?>

  <main>
    <?php
    if ($logado) {
        include $paginasCadastrado[$paginaSolicitada];
    } else {
        include 'conteudo/nao-cadastrado/inicio/html/inicio.html';
    }
    ?>
  </main>

  <?php include 'rodape/html/rodape.html'; ?>

  <!-- Popout global "Acesso negado" (só entra em ação para visitante
       não logado — ver checagem de data-logado no próprio script) -->
  <script src="assets/js/popout-bloqueio.js?v=1788205181"></script>
  <script src="assets/js/seletor.js?v=2"></script>
  <!-- Busca na página (Ctrl+F) no padrão do site -->
  <script src="assets/js/busca-pagina.js?v=2"></script>
  <script src="assets/js/chamadas-alerta.js?v=1"></script>
  <script src="assets/js/aviso-permissao.js?v=1"></script>
  <!-- Botão direito nas categorias do menu lateral (mover, desafixar, personalizar...) -->
  <script src="assets/js/menu-contexto.js?v=14"></script>

  <!-- Camada global de animação + padronização visual (vale para todas as páginas).
       Fica por último para ter a palavra final na cascata. -->
  <link rel="stylesheet" href="assets/css/movimento.css?v=13">
  <script src="assets/js/movimento.js?v=12"></script>

  <!-- Responsivo global (celular · tablet · notebook): componentes de assets/ e base de toque.
       Antes do zoom.css, que continua com a palavra final. -->
  <link rel="stylesheet" href="assets/css/responsivo.css?v=1">

  <!-- Zoom do navegador até 500%: cabeçalho compacto, menu lateral em gaveta e
       altura do cabeçalho em --hdr-h. Por último, para ter a palavra final. -->
  <link rel="stylesheet" href="assets/css/zoom.css?v=4">
  <script src="assets/js/zoom.js?v=1"></script>

  <!-- Marcador de fim de página (ver <link rel="expect"> no <head>). Deve ser o ÚLTIMO elemento. -->
  <div id="mv-fim" hidden></div>
</body>
</html>
