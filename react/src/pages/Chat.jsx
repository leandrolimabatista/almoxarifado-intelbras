import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/http';
import { useAuth } from '../context/AuthContext';

const hora = (iso) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function Chat() {
  const { usuario } = useAuth();
  const [conversas, setConversas] = useState([]);
  const [ativa, setAtiva] = useState(null); // { id, usuario }
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [novaAberta, setNovaAberta] = useState(false);
  const fimRef = useRef(null);

  const carregarConversas = useCallback(async () => {
    try {
      const r = await api('chat/conversas.php');
      setConversas(r.conversas);
    } catch (e) {
      setErro(e.message);
    }
  }, []);

  // Lista de conversas: carrega e atualiza a cada 10s
  useEffect(() => {
    carregarConversas();
    const t = setInterval(carregarConversas, 10000);
    return () => clearInterval(t);
  }, [carregarConversas]);

  // Mensagens da conversa aberta: carga inicial + polling (depois_de=último id)
  useEffect(() => {
    if (!ativa) return;
    let vivo = true;
    let ultimoId = 0;
    setMensagens([]);

    const buscar = async (depoisDe) => {
      try {
        const r = await api(`chat/mensagens.php?conversa_id=${ativa.id}&depois_de=${depoisDe}`);
        if (!vivo || !r.mensagens.length) return;
        ultimoId = r.mensagens[r.mensagens.length - 1].id;
        setMensagens((a) => {
          const ids = new Set(a.map((m) => m.id));
          return [...a, ...r.mensagens.filter((m) => !ids.has(m.id))];
        });
      } catch (e) {
        if (depoisDe === 0 && vivo) setErro(e.message);
      }
    };

    buscar(0);
    const t = setInterval(() => buscar(ultimoId), 3000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [ativa]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' });
  }, [mensagens]);

  async function enviar(e) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || !ativa) return;
    setTexto('');
    setErro('');
    try {
      const form = new FormData();
      form.append('conversa_id', ativa.id);
      form.append('texto', t);
      const r = await api('chat/mensagens.php', { metodo: 'POST', modulo: 'chat', form });
      setMensagens((a) => [...a, r.mensagem]);
      carregarConversas();
    } catch (err) {
      setErro(err.message);
      setTexto(t);
    }
  }

  async function iniciarCom(contato) {
    try {
      const r = await api('chat/iniciar.php', {
        metodo: 'POST',
        modulo: 'chat',
        corpo: { usuario_id: contato.id },
      });
      setAtiva({ id: r.conversa_id, usuario: r.usuario });
      setNovaAberta(false);
      carregarConversas();
    } catch (err) {
      setErro(err.message);
    }
  }

  return (
    <div className="chat">
      <aside className="chat__lista">
        <div className="chat__lista-topo">
          <h2>Chat</h2>
          <button className="btn" onClick={() => setNovaAberta(true)}>+ Nova conversa</button>
        </div>
        {conversas.length === 0 && <p className="vazio">Nenhuma conversa ainda.</p>}
        {conversas.map((c) => (
          <button
            key={c.id}
            className={'chat__conversa' + (ativa?.id === c.id ? ' is-ativa' : '')}
            onClick={() => setAtiva({ id: c.id, usuario: c.usuario })}
          >
            <span className="avatar">{c.usuario.iniciais}</span>
            <span className="chat__conversa-info">
              <strong>{c.usuario.nome}</strong>
              <small>{c.ultima_mensagem}</small>
            </span>
            {c.nao_lidas > 0 && <span className="badge">{c.nao_lidas}</span>}
          </button>
        ))}
      </aside>

      <section className="chat__painel">
        {!ativa ? (
          <p className="vazio">Selecione uma conversa ou inicie uma nova.</p>
        ) : (
          <>
            <header className="chat__topo">
              <span className="avatar">{ativa.usuario.iniciais}</span>
              <div>
                <strong>{ativa.usuario.nome}</strong>
                <small>{ativa.usuario.cargo}</small>
              </div>
            </header>
            <div className="chat__mensagens">
              {mensagens.map((m) => (
                <div key={m.id} className={'msg' + (m.remetente_id === usuario.id ? ' msg--minha' : '')}>
                  {m.anexo && <div className="msg__anexo">📎 {m.anexo.nome}</div>}
                  {m.texto && <p>{m.texto}</p>}
                  <time>{hora(m.criado_em)}</time>
                </div>
              ))}
              <div ref={fimRef} />
            </div>
            <form className="chat__form" onSubmit={enviar}>
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Digite uma mensagem"
                autoFocus
              />
              <button className="btn" disabled={!texto.trim()}>Enviar</button>
            </form>
          </>
        )}
        {erro && <p className="erro chat__erro">{erro}</p>}
      </section>

      {novaAberta && <NovaConversa onFechar={() => setNovaAberta(false)} onEscolher={iniciarCom} />}
    </div>
  );
}

function NovaConversa({ onFechar, onEscolher }) {
  const [busca, setBusca] = useState('');
  const [contatos, setContatos] = useState([]);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await api(`chat/contatos.php?busca=${encodeURIComponent(busca)}`);
        setContatos(r.contatos);
      } catch {
        setContatos([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  return (
    <div className="modal" onClick={onFechar}>
      <div className="modal__caixa" onClick={(e) => e.stopPropagation()}>
        <h3>Nova conversa</h3>
        <input
          autoFocus
          placeholder="Buscar pessoa por nome ou email"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <ul className="modal__lista">
          {contatos.map((c) => (
            <li key={c.id}>
              <button onClick={() => onEscolher(c)}>
                <span className="avatar">{c.iniciais}</span>
                <span>
                  <strong>{c.nome}</strong>
                  <small>{c.cargo || c.email}</small>
                </span>
              </button>
            </li>
          ))}
          {contatos.length === 0 && <li className="vazio">Nenhum contato encontrado.</li>}
        </ul>
        <button className="btn btn--ghost" onClick={onFechar}>Cancelar</button>
      </div>
    </div>
  );
}
