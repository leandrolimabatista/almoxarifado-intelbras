import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, definirTokens } from '../api/http';
import { PHP_BASE } from '../config';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [carregando, setCarregando] = useState(true);
  const [usuario, setUsuario] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api('sessao.php');
      definirTokens(r.csrf);
      setUsuario(r.logado ? r.usuario : null);
    } catch {
      setUsuario(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const entrar = async (email, senha) => {
    await api('login.php', { metodo: 'POST', corpo: { email, senha } });
    await carregar(); // pega o usuário completo + tokens CSRF da nova sessão
  };

  // api/logout.php destrói a sessão e redireciona; chamamos e limpamos o estado.
  const sair = async () => {
    await fetch(`${PHP_BASE}/api/logout.php`, { credentials: 'include', redirect: 'manual' });
    definirTokens({});
    setUsuario(null);
  };

  return (
    <AuthContext.Provider value={{ carregando, usuario, entrar, sair }}>
      {children}
    </AuthContext.Provider>
  );
}
