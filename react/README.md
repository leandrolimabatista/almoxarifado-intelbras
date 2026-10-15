# Intelbras — front-end React (pasta separada)

O projeto PHP continua **intacto** na raiz. Esta pasta (`react/`) é um app Vite + React
que conversa com a mesma API (`api/*.php`) e a mesma sessão/login. Dá pra migrar tela por tela.

## O que já está pronto

- Login, sessão e logout (usa `api/login.php`, `api/logout.php` e o novo `api/sessao.php`)
- Layout (cabeçalho, menu lateral, rodapé com os links legais) e rotas
- **Chat / Nova conversa** funcionando de verdade: lista de conversas, mensagens com polling,
  envio de texto e busca de contatos (`api/chat/*`)
- As demais telas aparecem no menu e abrem a versão PHP atual até serem migradas

Única alteração fora de `react/`: o arquivo novo `api/sessao.php` (entrega o usuário logado e
os tokens CSRF, que no PHP vão dentro do HTML).

## Rodando

```bash
cd react
cp .env.example .env     # ajuste se o seu Apache não for http://localhost
npm install
npm run dev              # http://localhost:5173
```

O Vite faz proxy de `/intelbras/*` para o Apache, então o cookie de sessão e o CSRF funcionam
sem CORS. Precisa do Apache + MySQL rodando como hoje.

## Produção

```bash
npm run build            # gera react/dist
```

Copie o conteúdo de `dist/` para `intelbras/react/` no servidor (o `.htaccess` já cuida do
fallback das rotas). Acesso: `http://localhost/intelbras/react/`.

## Como migrar a próxima tela

1. Crie `src/pages/<Tela>.jsx` (use `api('modulo/endpoint.php', { metodo, modulo, corpo })`).
2. Registre a rota em `src/App.jsx` e marque `react: true` em `src/layout/menu.js`.
3. Se a API do módulo exigir CSRF, acrescente o token dele em `api/sessao.php`
   (a chave de sessão é a que o `_bootstrap.php` do módulo confere).
4. Reaproveite os estilos de `conteudo/cadastrado/<tela>/css/` importando o CSS na página,
   ou porte para um `.css` ao lado do componente.

Ordem sugerida: Início → Configurações → Documentos → Equipes → Chamadas (a mais complexa:
WebRTC, alerta global de chamada recebida) → Loja/Cursos/Dashboard.

## Cuidados

- Telas com regra de acesso feita no PHP (ex.: Cursos lê `equipe_slug`, Agendar reunião
  exige cargo) precisam de um endpoint JSON que entregue essa regra antes de migrar.
- Tema escuro, zoom e menu de contexto ficam em `assets/js/*.js` (JS puro, acoplado ao DOM do
  PHP). Ao migrar, viram hooks/componentes React em vez de serem reaproveitados direto.
