# Intelbras — Front-end

Projeto front-end estilo "Teams" para a Intelbras. Estrutura dividida por bloco de página, cada um isolado em sua própria pasta.

## Estrutura de pastas

```
intelbras/
├── cabecalho/
│   ├── html/cabecalho.html           → marcação do header (sem <html>/<body>, é um "componente")
│   ├── css/cabecalho.css             → estilos exclusivos do header (desktop/base)
│   ├── js/cabecalho.js               → funcionamento (abrir/fechar menu, etc.)
│   ├── img/                          → imagens exclusivas do header (logo, ícones)
│   └── responsivo/cabecalho.responsivo.css → @media queries do header, isoladas do CSS base
│
├── conteudo/
│   ├── cadastrado/                   → páginas exibidas para usuário LOGADO (estrutura criada, conteúdo a desenvolver)
│   │   ├── inicio/                   → html/css/js/responsivo/img → inicio.*
│   │   ├── servicos/                 → html/css/js/responsivo/img → servicos.*
│   │   ├── inteligencia-artificial/  → html/css/js/responsivo/img → inteligencia-artificial.*
│   │   ├── documentos/                → html/css/js/responsivo/img → documentos.*
│   │   ├── unidade/                   → html/css/js/responsivo/img → unidade.*
│   │   ├── chamadas/                  → html/css/js/responsivo/img → chamadas.*
│   │   ├── cursos/                    → html/css/js/responsivo/img → cursos.*
│   │   ├── loja/                      → html/css/js/responsivo/img → loja.*
│   │   └── agendar-reuniao/           → html/css/js/responsivo/img → agendar-reuniao.*  (módulo pronto, ver abaixo)
│   │
│   └── nao-cadastrado/               → páginas exibidas para usuário NÃO LOGADO
│       └── inicio/                   → tela inicial atual (visitante)
│           ├── html/conteudo.html
│           ├── css/conteudo.css
│           ├── js/conteudo.js
│           ├── responsivo/conteudo.responsivo.css
│           └── img/                  → banners e cards da home
│
├── rodape/
│   ├── html/rodape.html              → marcação do rodapé
│   ├── css/
│   ├── js/
│   ├── img/
│   └── responsivo/rodape.responsivo.css → @media queries do rodapé, isoladas do CSS base
│   (mesma lógica do Cabeçalho)
│
├── assets/css/             → estilos globais compartilhados (reset, variáveis de cor, tipografia)
├── index.html              → preview estático (junta os componentes via fetch, só pra visualizar sem servidor PHP)
└── index.php               → versão real, junta os componentes via <?php include ?>
```

Cada seção de `conteudo/` segue exatamente o mesmo padrão isolado do Cabeçalho e Rodapé: HTML sem `<html>/<head>/<body>`, que carrega seu próprio CSS (`<link>`) e seu próprio JS (`<script>`) no fim do arquivo. Isso permite incluir cada seção isoladamente via `<?php include ?>` (produção) ou `fetch()` (preview estático), sem misturar HTML/CSS/JS de seções diferentes no mesmo arquivo.

As pastas dentro de `conteudo/cadastrado/` foram criadas como esqueleto (HTML/CSS/JS com comentários `TODO`), prontas para receber o conteúdo de cada seção da área logada quando for desenvolvida — hoje somente `conteudo/nao-cadastrado/inicio/` está com conteúdo real e é a única seção carregada pelo `index.php`/`index.html`.

## Pasta `responsivo/`

Cada bloco (Cabeçalho, Conteúdo, Rodapé) tem, além de `css/`, `html/`, `img/` e `js/`, uma pasta `responsivo/` própria. Nela fica **só** o CSS de `@media query` daquele bloco — o `css/` principal guarda apenas o estilo base (desktop). Isso separa claramente "como fica no desktop" de "como se adapta em telas menores", e cada bloco continua isolado dos demais.

O arquivo de responsivo é carregado depois do CSS principal, no mesmo componente HTML (ex.: `cabecalho.html` carrega `cabecalho.css` e, em seguida, `cabecalho.responsivo.css`), garantindo que as regras de media query tenham prioridade de cascata sobre a base.

## Por que cada pasta é "isolada"

Cada bloco (Cabeçalho, Conteúdo, Rodapé) tem seu próprio HTML, CSS, JS e imagens. Isso significa:
- Você pode mexer no Rodapé sem risco de quebrar o CSS do Cabeçalho (classes com prefixo `.header__`, `.content__`, `.footer__` evitam colisão).
- Cada pasta pode ser incluída isoladamente com `<?php include ?>` no PHP, ou via `fetch()` no front puro.

## Padrão de nomenclatura CSS usado

BEM simplificado: `.bloco__elemento`. Exemplo no Cabeçalho: `.header`, `.header__logo`, `.header__search`, `.header__search-input`.
Siga o mesmo padrão em `conteudo/` (`.content__...`) e `rodape/` (`.footer__...`) pra manter consistência.

## Próximos passos

1. Exportar do Figma as imagens/ícones reais e substituir o placeholder em `cabecalho/img/Logo.png`.
2. Montar `conteudo/conteudo.html` + `conteudo.css` + `conteudo.js` seguindo o mesmo padrão do Cabeçalho.
3. Montar `rodape/html/rodape.html` + `rodape.css` + `rodape.js`.
4. Ao criar novas `@media queries`, colocá-las sempre no arquivo `responsivo/*.responsivo.css` do bloco correspondente, nunca dentro do CSS base.
5. Ligar tudo no `index.php` com os `include`.

## Módulo "Inteligência Artificial" (área logada)

Assistente de IA com histórico de conversas real (MySQL). Página: `index.php?pagina=inteligencia-artificial`.

**Requisitos:** PHP 8.1+ com `pdo_mysql`, `mbstring` e `curl`.

**Tabelas** (`database/ia_conversas.sql` — rodar depois do `database/schema.sql`):
- `tb_ia_conversas` — uma linha por conversa (`usuario_id`, `titulo`, `fixada`, `arquivada`, `excluida_em` = soft delete, `ultima_mensagem_em` = data mostrada na lista).
- `tb_ia_mensagens` — mensagens (`papel` = `usuario` | `ia`, `conteudo`, `feedback`).

**Endpoints** (`api/ia/`, todos exigem sessão; os que gravam exigem `POST` + header `X-CSRF-Token`):

| Arquivo | Método | Função |
|---|---|---|
| `conversas.php` | GET | Lista (`limite`, `offset`, `busca`) + `total` |
| `conversa.php` | GET `?id=` | Mensagens da conversa |
| `conversa.php` | POST | `renomear`, `fixar`, `arquivar`, `excluir` |
| `enviar.php` | POST | Cria a conversa (se nova), chama a IA e grava pergunta + resposta |

Conversa de outro usuário responde `404`. Se a IA falhar (`503`), nada é gravado, então "Tentar novamente" não duplica mensagens. Limite: 4000 caracteres por mensagem e 10 mensagens por minuto por usuário (`429`).

**Chave da API:** copie `api/config.local.example.php` para `api/config.local.php` e preencha `GEMINI_API_KEY` (ou `ANTHROPIC_API_KEY`). O arquivo não é versionado (`.gitignore`) e funciona em qualquer máquina, sem mexer no `httpd.conf`. Se existir variável de ambiente com o mesmo nome, ela tem prioridade. Nunca coloque a chave no JavaScript nem no repositório. O modelo e os limites ficam nas constantes no topo de `api/ia/enviar.php`.

## Módulo "Cursos" (área logada)

Página: `index.php?pagina=cursos` — seguindo o prompt `prompt-figma-cursos-intelbras.md`. Somente front-end (dados mockados em `conteudo/cadastrado/cursos/js/cursos.js`).

**Regra de acesso:** o PHP (`cursos.html`) lê `tb_usuarios.equipe_slug` do usuário logado. Usuário comum só vê os 4 cursos da própria equipe; o Administrador (id 1) vê os 24 cursos com chips por equipe. Curso de outra equipe aberto por link mostra a tela de acesso restrito; equipe sem cursos (ex.: `geral`) mostra o estado vazio.

**Telas** (todas renderizadas em `#cursosApp` conforme a URL):

| Tela | URL |
|---|---|
| A — lista do usuário (chips de status) | `?pagina=cursos` |
| B — lista do Administrador (chips de equipe) | `?pagina=cursos` (logado como id 1) |
| C — detalhe do curso | `?pagina=cursos&curso=seguranca-da-informacao` |
| D — módulo | `...&curso=<slug>&modulo=1..3` |
| E — acesso restrito | curso de outra equipe |
| F — estado vazio | equipe sem cursos |

**Conferir a visão de cada equipe (só Administrador):** `index.php?pagina=cursos&ver_como=ti|rh|marketing|financeiro|projetos|sac`.

**Progresso:** valores iniciais mockados (0/33/67/100%); "Marcar como concluído" salva no `localStorage` do navegador (por usuário). Slugs de equipe seguem `USR_EQUIPES` (`ti`, `rh`, `marketing`, `financeiro`, `projetos`, `sac`). Capas geradas em SVG pelo JS; `img/estado-vazio.svg` é a ilustração da Tela F.

## Módulo "Chamadas" (área logada)

Chamadas de voz e vídeo **100% dentro do site** (sem telefone, discador ou operadora). Página: `index.php?pagina=chamadas`.

**Requisitos:** PHP 8.1+ com `pdo_mysql` e `mbstring`; site em **HTTPS** (ou `localhost`) para o navegador liberar câmera/microfone.

**Banco** (rodar depois de `schema.sql`, `usuarios_admin.sql` e `usuarios_cargo.sql`):
- `database/chamadas.sql` — `tb_chamadas_presenca`, `tb_chamadas`, `tb_chamadas_participantes`, `tb_chamadas_sinais` (sinalização WebRTC), `tb_chamadas_mensagens` (chat da chamada), `tb_chamadas_agendadas` e `tb_chamadas_agendadas_participantes`.
- `database/chamadas_demo.sql` — **opcional**, só para teste: cria 5 colegas na equipe Geral (mesma senha do Administrador).

**Regras de negócio (aplicadas no servidor, `api/chamadas/`):**
1. Chamada individual e agendamento só com quem é da **mesma equipe** (`tb_usuarios.equipe_slug`); outra equipe → `403`.
2. Chamar/agendar com a **equipe toda**: só cargos `gerente`, `diretor` e `ceo`; os demais → `403` (e o card aparece bloqueado com tooltip).
3. Nada de discagem externa: tudo usa `tb_usuarios.id`.
4. Chamada de equipe: membros online recebem o toque; os demais ficam como "convidado" (aviso/convite).

| Arquivo (`api/chamadas/`) | Método | Função |
|---|---|---|
| `contatos.php` | GET | Usuário + permissão, equipes e contatos da própria equipe (com status) |
| `eventos.php` | GET | Polling: heartbeat de presença, chamadas recebidas, sinais WebRTC e chat |
| `chamada.php` | POST | `iniciar` (individual/equipe), `atender`, `recusar`, `sair`, `entrar_agendada` |
| `agendadas.php` | GET/POST | Lista, `criar` e `cancelar` reuniões |
| `sinal.php` | POST | Offer/answer/ICE entre participantes da mesma chamada |
| `mensagem.php` | POST | Chat da chamada |
| `presenca.php` | POST | Liga/desliga "Não perturbe" |

Todos exigem sessão; os POST exigem `X-CSRF-Token` (`$_SESSION['csrf_chamadas']`).

**Front-end:** `conteudo/cadastrado/chamadas/` — `html/chamadas.html`, `css/chamadas.css`, `responsivo/chamadas.responsivo.css`, `js/chamadas.js` (tela inicial, modais, polling) e `js/chamadas-sala.js` (sala WebRTC). O alerta de chamada recebida vale para **todas** as páginas logadas: `assets/js/chamadas-alerta.js` + `assets/css/chamadas-alerta.css`.

**Limites conhecidos:** áudio/vídeo vai direto entre os navegadores (malha) — bom para equipes pequenas; para redes com NAT/firewall restritivo, defina `window.CHAMADAS_ICE` com servidores STUN/TURN. A chamada vive na página: trocar de aba do menu encerra a participação (o navegador pede confirmação); a mini-janela funciona dentro do módulo.


## Módulo "Agendar reunião" (área logada)

Tela dedicada para criar uma reunião e convidar participantes de qualquer equipe, com recorrência (Figma: `prompt-figma-agendar-reuniao.md`). Página: `index.php?pagina=agendar-reuniao` — acessada pelo atalho **Agendar reunião** do menu lateral (em todas as páginas) e pelo botão de mesmo nome no Início. É independente do modal "Agendar chamada" do módulo Chamadas (que agenda só dentro da própria equipe); os dois convivem.

**Pasta:** `conteudo/cadastrado/agendar-reuniao/` (`html/`, `css/`, `js/`, `responsivo/`, `img/`), no mesmo padrão das demais seções. Media queries (≥1280 duas colunas · 768–1279 menu só com ícones e resumo abaixo · <768 coluna única com menu em gaveta) em `responsivo/agendar-reuniao.responsivo.css`.

**Banco** (`database/reunioes.sql` — rodar depois do `database/schema.sql`; não altera nada existente):
- `tb_reunioes` — título, descrição (até 1000), data, hora início/fim, `fuso_horario` (IANA), `equipe_slug`, recorrência (`recorrente`, `recorrencia_*`) e `status` (`agendada` | `cancelada`).
- `tb_reunioes_participantes` — N:N entre reuniões e `tb_usuarios` (o organizador fica em `tb_reunioes.organizador_id`).

**Endpoints** (`api/reunioes/`, exigem sessão; o que grava exige `POST` + header `X-CSRF-Token`):

| Arquivo | Método | Função |
|---|---|---|
| `participantes.php` | GET `?q=&equipe=&limite=` | Lista usuários ativos que podem ser convidados (exclui o próprio organizador) |
| `agendar.php` | POST (JSON) | Valida e cria a reunião + participantes. Erros de validação voltam em `422` com `campos: {campo: mensagem}` |

**Modo demonstração:** se a lista de pessoas não carregar (SQL ainda não executado ou sem servidor PHP), a tela usa pessoas fictícias, simula o envio e mostra um aviso amarelo. Também dá para forçar com `?demo=1`.

## Módulo "Configurações" (área logada)

Tela de preferências e informações da conta (Figma: `prompt-figma-configuracoes.md`, mockup `DEMONSTRAÇÃO.png`). Página: `index.php?pagina=configuracoes` — acessada pelo item **Configurações** no rodapé do menu lateral (em todas as páginas) e por "Meu perfil"/"Configurações" no menu do usuário, no cabeçalho.

**Pasta:** `conteudo/cadastrado/configuracoes/` (`html/`, `css/`, `js/`, `responsivo/`, `img/`), no mesmo padrão das demais seções. Abas (Meu perfil, Notificações, Privacidade, Aparência, Dispositivos, Segurança, Integrações, Sobre) trocam só visualmente, via JS, sem recarregar a página; a coluna direita (Sua conta, Segurança, Ajuda e suporte) fica fixa.

**Banco** (`database/configuracoes.sql` — rodar depois de `schema.sql`, `usuarios_admin.sql` e `usuarios_cargo.sql`; isolado a este módulo):
- Acrescenta `foto_arquivo`, `idioma` e `fuso_horario` a `tb_usuarios`.
- `tb_usuario_preferencias` — 1 linha por usuário, com as preferências das demais abas guardadas em JSON.
- `tb_usuario_sessoes` — dispositivos/sessões ativas (abas Dispositivos e Segurança); alimentada automaticamente pelo módulo a cada página logada.

**Endpoints** (`api/configuracoes/`, exigem sessão; o que grava exige `POST` + header `X-CSRF-Token`):

| Arquivo | Método | Função |
|---|---|---|
| `perfil.php` | GET / POST | Lê e atualiza nome/telefone/idioma/fuso (e-mail e cargo são somente leitura) + devolve as preferências |
| `preferencias.php` | POST | Salva um grupo de preferências (notificações, privacidade, aparência, segurança, integrações) |
| `senha.php` | POST | Troca de senha (valida a atual, força mínima, limite de 5 tentativas/10min) |
| `foto.php` | GET / POST | Serve, envia (JPG/PNG até 5MB) ou remove a foto do próprio usuário; arquivo fica fora do htdocs |
| `sessoes.php` | GET / POST | Lista sessões ativas e permite encerrar uma ou "todas as outras" |

**Modo demonstração:** se a API/banco ainda não estiverem prontos (SQL não executado), a tela entra sozinha em modo demonstração — nada é salvo de verdade — e avisa com uma faixa amarela. Também dá para forçar com `?demo=1`.
