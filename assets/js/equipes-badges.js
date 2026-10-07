// ============================================================
// Badges de "não lidas" da sidebar (seção EQUIPES)
// Carregado em toda página da área logada (via cabecalho.html).
// Não depende do módulo Equipes estar na tela: só procura os
// elementos [data-badge-slug] que existem no menu lateral de
// qualquer página (inicio, documentos, chamadas...) e atualiza.
// Não faz nada se não houver nenhum badge no DOM (visitante) ou
// se o módulo ainda não tiver as tabelas criadas (ignora 500).
// ============================================================
(function () {
  const INTERVALO_MS = 20000;

  async function atualizar() {
    const badges = document.querySelectorAll('[data-badge-slug]');
    if (!badges.length) return;

    try {
      const resp = await fetch('api/equipes/contagens.php', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!resp.ok) return;
      const dados = await resp.json();
      if (!dados || !dados.sucesso) return;

      badges.forEach((badge) => {
        const slug = badge.getAttribute('data-badge-slug');
        const n = Number(dados.contagens[slug] || 0);
        if (n > 0) {
          badge.textContent = n > 99 ? '99+' : String(n);
          badge.hidden = false;
        } else {
          badge.hidden = true;
        }
      });
    } catch (e) {
      // Sem conexão/API indisponível: mantém os badges como estavam.
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    atualizar();
    setInterval(atualizar, INTERVALO_MS);
  });
})();
