// Menu lateral. `react: true` = tela já migrada pra React.
// Para migrar outra tela: crie src/pages/<Tela>.jsx, registre a rota em App.jsx
// e troque aqui para react: true.
export const MENU = [
  { slug: 'inicio', rotulo: 'Início', to: '/', react: true },
  { slug: 'servicos', rotulo: 'Serviços' },
  { slug: 'inteligencia-artificial', rotulo: 'Inteligência Artificial' },
  { slug: 'documentos', rotulo: 'Documentos' },
  { slug: 'unidade', rotulo: 'Unidade' },
  { slug: 'chamadas', rotulo: 'Chamadas' },
  { slug: 'cursos', rotulo: 'Cursos' },
  { slug: 'loja', rotulo: 'Loja' },
  { slug: 'equipes', rotulo: 'Equipes' },
  { slug: 'chat', rotulo: 'Chat', react: true },
  { slug: 'agendar-reuniao', rotulo: 'Agendar reunião' },
  { slug: 'configuracoes', rotulo: 'Configurações' },
  { slug: 'dashboard', rotulo: 'Dashboard' },
];
