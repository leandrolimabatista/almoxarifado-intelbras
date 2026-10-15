import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PHP_BASE } from '../config';
import { MENU } from './menu';

export default function AppLayout() {
  const { usuario, sair } = useAuth();

  return (
    <div className="app">
      <header className="header">
        <img className="header__logo" src={`${PHP_BASE}/cabecalho/img/Logo.png`} alt="Intelbras" />
        <div className="header__user">
          <span>{usuario.nome}</span>
          <button className="btn btn--ghost" onClick={sair}>Sair</button>
        </div>
      </header>

      <div className="app__corpo">
        <aside className="sidebar">
          <nav>
            {MENU.map((m) => (
              <NavLink
                key={m.slug}
                to={m.to || `/${m.slug}`}
                end={m.to === '/'}
                className={({ isActive }) => 'sidebar__item' + (isActive ? ' is-ativo' : '')}
              >
                {m.rotulo}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="main">
          <Outlet />
        </main>
      </div>

      <footer className="footer">
        <a href={`${PHP_BASE}/conteudo/legal/html/politica-de-privacidade.html`} target="_blank" rel="noreferrer">
          Política de Privacidade
        </a>
        <a href={`${PHP_BASE}/conteudo/legal/html/termos-de-uso.html`} target="_blank" rel="noreferrer">
          Termos de Uso
        </a>
      </footer>
    </div>
  );
}
