import { API_BASE } from '../config';

let tokens = {}; // { chat: '...', ... } — vem de api/sessao.php

export function definirTokens(novos) {
  tokens = novos || {};
}

export class ApiErro extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

/**
 * Chamada à API PHP. Sempre com cookie de sessão; nos POST manda o
 * X-CSRF-Token do módulo (ex.: modulo: 'chat').
 */
export async function api(caminho, { metodo = 'GET', corpo, modulo, form } = {}) {
  const headers = {};
  const opcoes = { method: metodo, credentials: 'include', headers };

  if (metodo !== 'GET') {
    if (modulo && tokens[modulo]) headers['X-CSRF-Token'] = tokens[modulo];
    if (form) {
      opcoes.body = form; // FormData (upload) — o navegador define o Content-Type
    } else if (corpo !== undefined) {
      headers['Content-Type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }
  }

  const resp = await fetch(`${API_BASE}/${caminho}`, opcoes);
  let dados = null;
  try {
    dados = await resp.json();
  } catch {
    /* resposta sem JSON */
  }

  if (!resp.ok || (dados && dados.sucesso === false)) {
    throw new ApiErro(dados?.erro || `Erro ${resp.status}`, resp.status);
  }
  return dados;
}
