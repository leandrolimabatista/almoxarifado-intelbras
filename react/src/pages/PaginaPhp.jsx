import { paginaPhp } from '../config';

// Placeholder para telas ainda não migradas: leva para a versão PHP atual.
export default function PaginaPhp({ slug, titulo }) {
  return (
    <section>
      <h1>{titulo}</h1>
      <p>Esta tela ainda não foi migrada para React.</p>
      <a className="btn" href={paginaPhp(slug)}>Abrir a versão atual</a>
    </section>
  );
}
