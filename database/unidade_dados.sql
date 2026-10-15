-- ============================================================
-- Minha Unidade — preenche responsável, contatos e avisos da
-- unidade 1 (Intelbras — Lapa Tito). Troque os dados pelos reais
-- quando tiver. Pode rodar de novo: não duplica nada e só preenche
-- o responsável se ele ainda estiver vazio.
-- ============================================================
USE bd_intelbras;
SET NAMES utf8mb4;

-- Responsável pela unidade (card "Responsável pela unidade")
UPDATE tb_unidades
   SET responsavel_nome = 'Fernando Alves',
       responsavel_cargo = 'Diretor da unidade'
 WHERE id = 1 AND responsavel_nome IS NULL;

-- Contatos por setor (um card por setor; vale o de menor "ordem")
INSERT INTO tb_unidade_contatos (unidade_id, setor, nome, cargo, email, telefone, ordem)
SELECT v.* FROM (
  SELECT 1 AS unidade_id, 'rh' AS setor, 'Aline Moreira' AS nome, 'Diretora de RH' AS cargo,
         'aline.moreira@gmail.com' AS email, '(11) 3000 4101' AS telefone, 1 AS ordem
  UNION ALL SELECT 1, 'ti', 'Ricardo Nunes', 'Gerente de TI', 'ricardo.nunes@gmail.com', '(11) 3000 4102', 1
  UNION ALL SELECT 1, 'administrativo', 'Carlos Eduardo', 'Gerente administrativo', 'carlos.eduardo@gmail.com', '(11) 3000 4103', 1
  UNION ALL SELECT 1, 'facilities', 'Marcos Teixeira', 'Coordenador de Facilities', 'facilities.lapatito@gmail.com', '(11) 3000 4104', 1
) AS v
WHERE NOT EXISTS (
  SELECT 1 FROM tb_unidade_contatos c WHERE c.unidade_id = v.unidade_id AND c.setor = v.setor
);

-- Avisos (a página mostra até 5; importantes primeiro). Datas relativas a
-- hoje, para não expirarem logo após rodar o script.
INSERT INTO tb_unidade_avisos (unidade_id, titulo, descricao, tipo, importante, publicado_em, expira_em)
SELECT v.* FROM (
  SELECT 1 AS unidade_id, 'Manutenção elétrica programada' AS titulo,
         'No sábado haverá manutenção no quadro de energia. O prédio ficará sem energia das 08h às 12h; salve seus arquivos na sexta.' AS descricao,
         'manutencao' AS tipo, 1 AS importante,
         DATE_SUB(NOW(), INTERVAL 1 DAY) AS publicado_em, DATE_ADD(NOW(), INTERVAL 10 DAY) AS expira_em
  UNION ALL SELECT 1, 'Treinamento de segurança da informação',
         'Treinamento obrigatório de LGPD e boas práticas de segurança, no auditório do 2º andar. Confirme presença com o RH.',
         'treinamento', 0, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_ADD(NOW(), INTERVAL 14 DAY)
  UNION ALL SELECT 1, 'Horário especial no fim de ano',
         'Entre 24/12 e 02/01 a unidade funcionará das 09h às 15h. O retorno ao horário normal será em 05/01.',
         'horario', 0, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_ADD(NOW(), INTERVAL 60 DAY)
  UNION ALL SELECT 1, 'Confraternização da unidade',
         'Nossa confraternização será na última sexta de novembro, às 17h, no refeitório. Traga um convidado e confirme com Facilities.',
         'evento', 0, DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_ADD(NOW(), INTERVAL 45 DAY)
  UNION ALL SELECT 1, 'Novo canal de atendimento do RH',
         'Dúvidas sobre benefícios, férias e folha agora podem ser enviadas pelo Chat, falando com o RH da unidade.',
         'comunicado', 0, DATE_SUB(NOW(), INTERVAL 7 DAY), NULL
) AS v
WHERE NOT EXISTS (
  SELECT 1 FROM tb_unidade_avisos a WHERE a.unidade_id = v.unidade_id AND a.titulo = v.titulo
);
