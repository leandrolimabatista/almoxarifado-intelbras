import { useAuth } from '../context/AuthContext';

export default function Inicio() {
  const { usuario } = useAuth();
  return (
    <section>
      <h1>Olá, {usuario.nome.split(' ')[0]}</h1>
      <p>
        Esta é a base React do projeto. A tela de Início original (banners, cards) continua em PHP
        e pode ser migrada em seguida — veja <code>react/README.md</code>.
      </p>
    </section>
  );
}
