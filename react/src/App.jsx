import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppLayout from './layout/AppLayout';
import Login from './pages/Login';
import Inicio from './pages/Inicio';
import Chat from './pages/Chat';
import PaginaPhp from './pages/PaginaPhp';
import { MENU } from './layout/menu';

function Protegida({ children }) {
  const { carregando, usuario } = useAuth();
  if (carregando) return <div className="tela-carregando">Carregando…</div>;
  if (!usuario) return <Navigate to="/entrar" replace />;
  return children;
}

export default function App() {
  const { usuario } = useAuth();

  return (
    <Routes>
      <Route path="/entrar" element={usuario ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <Protegida>
            <AppLayout />
          </Protegida>
        }
      >
        <Route index element={<Inicio />} />
        <Route path="chat" element={<Chat />} />
        {/* Telas ainda em PHP: abrem a versão atual até serem migradas */}
        {MENU.filter((m) => !m.react).map((m) => (
          <Route key={m.slug} path={m.slug} element={<PaginaPhp slug={m.slug} titulo={m.rotulo} />} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
