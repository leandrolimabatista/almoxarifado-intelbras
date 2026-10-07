<?php
declare(strict_types=1);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$logado = !empty($_SESSION['usuario_id']);

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
    'usuarios'                => 'conteudo/cadastrado/usuarios/html/usuarios.html',
    'equipes'                 => 'conteudo/cadastrado/equipes/html/equipes.html',
    'nova-conversa'           => 'conteudo/cadastrado/nova-conversa/html/nova-conversa.html',
    'chat'                    => 'conteudo/cadastrado/chat/html/chat.html',
    'agendar-reuniao'         => 'conteudo/cadastrado/agendar-reuniao/html/agendar-reuniao.html',
    'configuracoes'           => 'conteudo/cadastrado/configuracoes/html/configuracoes.html',
];

$paginaSolicitada = isset($_GET['pagina']) ? (string)$_GET['pagina'] : 'inicio';
if (!array_key_exists($paginaSolicitada, $paginasCadastrado)) {
    $paginaSolicitada = 'inicio';
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Ativa a transição nativa do navegador (crossfade) entre navegações
       de página inteira (troca de aba do menu lateral, ex.: Início -> Loja).
       Suportado em navegadores baseados em Chromium recentes; nos demais,
       a navegação simplesmente ocorre sem a transição, sem quebrar nada. -->
  <meta name="view-transition" content="same-origin">
  <title>Intelbras</title>
  <link rel="stylesheet" href="assets/css/popout-bloqueio.css">
  <link rel="stylesheet" href="assets/css/seletor.css">
  <link rel="stylesheet" href="assets/css/chamadas-alerta.css?v=1">
  <style>
    /* Suaviza o crossfade nativo da troca de página (padrão do navegador
       é meio abrupto); mantém curto pra não parecer lento. */
    ::view-transition-old(root),
    ::view-transition-new(root) {
      animation-duration: 0.18s;
      animation-timing-function: ease;
    }
  </style>
</head>
<body style="margin:0;" data-logado="<?php echo $logado ? '1' : '0'; ?>" data-chamadas-csrf="<?php echo htmlspecialchars($csrfChamadasGlobal, ENT_QUOTES, 'UTF-8'); ?>">
  <script>
    // Aplica a classe "sidebar-open" o quanto antes (assim que o <body>
    // existe, antes do menu ser desenhado), lendo a preferência salva
    // pelo cabecalho.js. Isso mantém o menu lateral aberto ao trocar de
    // aba, em vez de fechar e exigir clicar em "Todas categorias" de novo.
    if (localStorage.getItem('sidebarOpen') === '1') {
      document.body.classList.add('sidebar-open');
    }
  </script>

  <?php include 'cabecalho/html/cabecalho.html'; ?>

  <main>
    <?php
    if ($logado) {
        include $paginasCadastrado[$paginaSolicitada];
    } else {
        include 'conteudo/nao-cadastrado/inicio/html/conteudo.html';
    }
    ?>
  </main>

  <?php include 'rodape/html/rodape.html'; ?>

  <!-- Popout global "Acesso negado" (só entra em ação para visitante
       não logado — ver checagem de data-logado no próprio script) -->
  <script src="assets/js/popout-bloqueio.js?v=1788205181"></script>
  <script src="assets/js/seletor.js?v=2"></script>
  <script src="assets/js/chamadas-alerta.js?v=1"></script>

</body>
</html>
