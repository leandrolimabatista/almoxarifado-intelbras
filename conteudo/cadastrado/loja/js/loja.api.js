// ============================================================
// LOJA — Integração com o servidor AWS (única porta de saída)
//
// Contrato (NÃO alterar):
//   POST http://44.204.128.56:3000/criar-pagamento
//   Headers: Content-Type: application/json
//   Body:    { "items": [ { id, title, quantity, unit_price } ] }
//   Sucesso: { "init_point": "https://..." }
//
// Para trocar o servidor depois, altere só API_BASE_URL.
// ============================================================
(function () {
  'use strict';

  const API_BASE_URL = '';
  const PATH_CRIAR_PAGAMENTO = '/criar-pagamento';

  /**
   * Envia os itens do carrinho e devolve o JSON do servidor
   * (esperado: { init_point }). Erros de rede/JSON sobem (throw)
   * para o chamador tratar no catch.
   * @param {{id:string,title:string,quantity:number,unit_price:number}[]} items
   */
  async function criarPagamento(items, emailComprovante) {
  const resp = await fetch(API_BASE_URL + PATH_CRIAR_PAGAMENTO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items,
      email_comprovante: emailComprovante
    }),
  });
  return resp.json();
}

  /**
   * Consulta de CEP (ViaCEP, serviço público). Devolve
   * { logradouro, bairro, localidade, uf } ou null se o CEP não existir.
   * Erros de rede sobem (throw) para o chamador tratar.
   * @param {string} cep somente dígitos (8)
   */
  async function buscarCep(cep) {
    const resp = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
    if (!resp.ok) throw new Error('ViaCEP HTTP ' + resp.status);
    const d = await resp.json();
    return d && !d.erro ? d : null;
  }

  window.LojaApi = { API_BASE_URL, PATH_CRIAR_PAGAMENTO, criarPagamento, buscarCep };
})();
