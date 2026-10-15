-- =====================================================================
-- Intelbras — Portal | Módulo "Chat" — ações por mensagem
--
-- Mesmo funcionamento de Equipes: reagir com emoji, responder (citar),
-- editar e apagar mensagem.
--
-- COMO APLICAR (phpMyAdmin):
--   1. Rode ANTES: database/chat.sql
--   2. Clique no banco  bd_intelbras  > aba "SQL".
--   3. Cole TODO o conteúdo deste arquivo e clique em "Executar".
--      (Rode UMA vez só: o ALTER TABLE falha se as colunas já existirem.)
-- =====================================================================

USE bd_intelbras;

-- resposta_a    : mensagem citada ("Respondendo a ...")
-- editada_em    : quando foi editada (mostra "(editada)")
-- excluida_em   : exclusão lógica ("Esta mensagem foi apagada")
-- atualizada_em : muda a cada edição/exclusão/reação — é o que permite ao
--                 polling do chat aberto receber também as alterações de
--                 mensagens antigas, não só as novas.
ALTER TABLE tb_mensagens
  ADD COLUMN resposta_a    BIGINT UNSIGNED NULL AFTER documento_id,
  ADD COLUMN editada_em    DATETIME        NULL AFTER resposta_a,
  ADD COLUMN excluida_em   DATETIME        NULL AFTER editada_em,
  ADD COLUMN atualizada_em DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER criado_em,
  ADD KEY idx_mensagens_sync (conversa_id, atualizada_em),
  ADD CONSTRAINT fk_mensagens_resposta FOREIGN KEY (resposta_a) REFERENCES tb_mensagens (id) ON DELETE SET NULL;

-- Reações (👍 2, ❤️ 1 ...): uma linha por usuário + emoji
CREATE TABLE IF NOT EXISTS tb_mensagens_reacoes (
  mensagem_id BIGINT UNSIGNED NOT NULL,
  usuario_id  INT UNSIGNED    NOT NULL,
  emoji       VARCHAR(16)     NOT NULL,
  criado_em   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mensagem_id, usuario_id, emoji),
  CONSTRAINT fk_msgrea_msg     FOREIGN KEY (mensagem_id) REFERENCES tb_mensagens (id) ON DELETE CASCADE,
  CONSTRAINT fk_msgrea_usuario FOREIGN KEY (usuario_id)  REFERENCES tb_usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
