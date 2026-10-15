import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// O React roda separado do PHP, mas conversa com ele pelo mesmo domínio:
// em desenvolvimento, o Vite faz proxy de /intelbras/* para o Apache.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const phpOrigin = env.VITE_PHP_ORIGIN || 'http://localhost';
  const phpBase = env.VITE_PHP_BASE || '/intelbras';
  const appBase = env.VITE_APP_BASE || '/intelbras/react/';

  return {
    plugins: [react()],
    // dev: raiz "/"; build: servido em /intelbras/react/ pelo Apache
    base: command === 'build' ? appBase : '/',
    server: {
      port: 5173,
      proxy: {
        [phpBase]: { target: phpOrigin, changeOrigin: true },
      },
    },
  };
});
