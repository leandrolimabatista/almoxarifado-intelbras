-- ============================================================
-- OPCIONAL — usuários de DEMONSTRAÇÃO para testar o módulo
-- "Chamadas" (hoje o banco só tem o Administrador, então a
-- lista de contatos ficaria vazia). NÃO rodar em produção.
--
-- Todos entram na equipe definida em @equipe (padrão 'geral',
-- a mesma do Administrador) e usam a MESMA senha do
-- Administrador (copiada do id 1). CPF/telefone são fictícios.
-- ============================================================
USE bd_intelbras;

SET @equipe = 'geral';

INSERT INTO `tb_usuarios`
  (`nome`,`email`,`senha_hash`,`telefone`,`cpf`,`data_nascimento`,`genero`,`unidade_id`,`equipe_slug`,`cargo`,`status`)
SELECT v.nome, v.email, a.senha_hash, v.tel, v.cpf, v.nasc, v.gen, 1, @equipe, v.cargo, 'ativo'
FROM (
  SELECT 'Carlos Eduardo'  AS nome, 'carlos.eduardo@demo.intelbras'  AS email, '11900000001' AS tel, '00000000001' AS cpf, '1990-03-10' AS nasc, 'masculino' AS gen, 'gerente'     AS cargo UNION ALL
  SELECT 'Juliana Martins',         'juliana.martins@demo.intelbras',          '11900000002',       '00000000002',       '1992-07-21',         'feminino',          'funcionario' UNION ALL
  SELECT 'Rafael Souza',            'rafael.souza@demo.intelbras',             '11900000003',       '00000000003',       '1994-11-02',         'masculino',         'funcionario' UNION ALL
  SELECT 'Beatriz Lima',            'beatriz.lima@demo.intelbras',             '11900000004',       '00000000004',       '1996-01-15',         'feminino',          'supervisor'  UNION ALL
  SELECT 'Fernando Alves',          'fernando.alves@demo.intelbras',           '11900000005',       '00000000005',       '1988-09-30',         'masculino',         'diretor'
) AS v
JOIN `tb_usuarios` a ON a.id = 1
WHERE NOT EXISTS (SELECT 1 FROM `tb_usuarios` u WHERE u.email = v.email);
