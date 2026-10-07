-- =====================================================================
-- Intelbras — Portal | Módulo "Documentos" — origem dos documentos (chat)
--
-- Prepara a tabela tb_documentos para receber arquivos vindos do CHAT DAS
-- EQUIPES (quando ele existir) sem duplicar: cada documento pode guardar de
-- onde veio (origem) e um identificador dentro dessa origem (origem_ref).
--
-- COMO APLICAR (phpMyAdmin):
--   1. Rode ANTES o database/documentos.sql (se ainda não rodou).
--   2. Clique no banco  bd_intelbras  > aba "SQL".
--   3. Cole TODO o conteúdo deste arquivo e clique em "Executar". Rode UMA vez
--      (se rodar de novo, o phpMyAdmin avisa "Duplicate column name" — sem dano).
--
-- Só é necessário quando o chat for chamar documentos_salvar_arquivo() com
-- 'origem'. A página Documentos funciona normalmente sem este arquivo.
-- Não altera nem apaga dados existentes: documentos já enviados ficam com
-- origem = 'upload'.
-- =====================================================================

USE bd_intelbras;

-- origem      : 'upload' (enviado pela página Documentos) | 'chat' | ...
-- origem_ref  : identificador dentro da origem, ex.: 'msg-123-0'
--               (mensagem 123, anexo 0). NULL = sem referência.
-- UNIQUE (origem, origem_ref): o mesmo anexo do chat não vira dois documentos,
-- mesmo que a chamada seja repetida. Linhas com origem_ref NULL não conflitam.
ALTER TABLE tb_documentos
  ADD COLUMN origem     VARCHAR(20) NOT NULL DEFAULT 'upload' AFTER equipe_slug,
  ADD COLUMN origem_ref VARCHAR(80) NULL AFTER origem,
  ADD UNIQUE KEY uq_doc_origem (origem, origem_ref);
