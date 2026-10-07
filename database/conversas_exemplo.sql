-- ============================================================
-- OPCIONAL — usuários de exemplo para a tela "Nova conversa".
-- Hoje o banco só tem o Administrador; sem outros usuários a
-- lista de contatos fica vazia. Este script cria os 8 contatos
-- do protótipo do Figma (só se ainda não existirem).
--
-- Todos entram com a MESMA senha do Administrador (copiada do
-- hash dele) — apague/troque depois de testar. CPF, e-mail e
-- telefone são fictícios.
-- ============================================================

USE bd_intelbras;
SET NAMES utf8mb4;

INSERT INTO tb_usuarios
  (nome, email, senha_hash, telefone, cpf, data_nascimento, genero, unidade_id, equipe_slug, cargo, status)
SELECT v.nome, v.email, a.senha_hash, v.telefone, v.cpf, '1995-01-01', v.genero, a.unidade_id, v.equipe, v.cargo, 'ativo'
FROM (
  SELECT 'Ana Carolina Silva' AS nome, 'ana.silva@exemplo.intelbras'      AS email, '11900000001' AS telefone, '00000000001' AS cpf, 'feminino'  AS genero, 'ti'         AS equipe, 'coordenador' AS cargo
  UNION ALL SELECT 'Bruno Ribeiro',   'bruno.ribeiro@exemplo.intelbras',   '11900000002', '00000000002', 'masculino', 'marketing',  'funcionario'
  UNION ALL SELECT 'Carlos Mendes',   'carlos.mendes@exemplo.intelbras',   '11900000003', '00000000003', 'masculino', 'projetos',   'supervisor'
  UNION ALL SELECT 'Fernanda Lima',   'fernanda.lima@exemplo.intelbras',   '11900000004', '00000000004', 'feminino',  'rh',         'gerente'
  UNION ALL SELECT 'Juliana Costa',   'juliana.costa@exemplo.intelbras',   '11900000005', '00000000005', 'feminino',  'financeiro', 'funcionario'
  UNION ALL SELECT 'Marcos Souza',    'marcos.souza@exemplo.intelbras',    '11900000006', '00000000006', 'masculino', 'sac',        'estagiario'
  UNION ALL SELECT 'Rafael Oliveira', 'rafael.oliveira@exemplo.intelbras', '11900000007', '00000000007', 'masculino', 'projetos',   'funcionario'
  UNION ALL SELECT 'Thais Santos',    'thais.santos@exemplo.intelbras',    '11900000008', '00000000008', 'feminino',  'ti',         'funcionario'
) AS v
JOIN tb_usuarios a ON a.id = 1
WHERE NOT EXISTS (SELECT 1 FROM tb_usuarios u WHERE u.email = v.email);
