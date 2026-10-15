// Caminhos do projeto PHP (a API e as páginas ainda não migradas ficam lá).
export const PHP_BASE = import.meta.env.VITE_PHP_BASE || '/intelbras';
export const API_BASE = `${PHP_BASE}/api`;

/** Link para uma página que ainda é PHP (ex.: ?pagina=documentos). */
export const paginaPhp = (slug) => `${PHP_BASE}/index.php?pagina=${slug}`;
