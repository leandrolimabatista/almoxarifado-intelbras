-- ============================================================
-- OPCIONAL — reuniões de DEMONSTRAÇÃO nas equipes (NÃO rodar em produção).
--
-- Cria reuniões em tb_chamadas_agendadas, que alimentam:
--   • o modal "Reuniões agendadas" (Chamadas);
--   • o card "Reuniões semanais" e a agenda do dia (Início).
-- Por equipe: 2 reuniões em 18/10/2026 e 6 entre 26/10 e 25/11/2026
-- (a maioria depois do dia 25). Todas com "toda a equipe" (toda_equipe = 1),
-- então qualquer membro da equipe as vê.
-- O criador é o usuário ativo de maior cargo da equipe (nunca o id 1).
-- Pode rodar de novo: não duplica (confere equipe + título + data/hora).
-- ============================================================
USE bd_intelbras;

INSERT INTO `tb_chamadas_agendadas`
  (`titulo`,`descricao`,`data_hora`,`duracao_min`,`criador_id`,`equipe_slug`,`toda_equipe`)
SELECT v.titulo, v.descricao, v.data_hora, v.duracao_min, c.criador_id, v.equipe_slug, 1
FROM (
  SELECT 'geral' AS equipe_slug, 'Reunião geral mensal' AS titulo, 'Alinhamento mensal com toda a equipe.' AS descricao, '2026-10-18 09:00:00' AS data_hora, 60 AS duracao_min
  UNION ALL SELECT 'geral', 'Comunicados da diretoria', 'Pauta rápida com a equipe.', '2026-10-18 15:00:00', 30
  UNION ALL SELECT 'geral', 'Treinamento de LGPD', 'Boas práticas de proteção de dados.', '2026-10-26 10:00:00', 60
  UNION ALL SELECT 'geral', 'Planejamento do trimestre', 'Metas e prioridades do próximo trimestre.', '2026-10-28 14:30:00', 45
  UNION ALL SELECT 'geral', 'Confraternização de fim de ano', 'Combinados e organização do evento.', '2026-11-04 09:30:00', 30
  UNION ALL SELECT 'geral', 'Revisão da pauta da reunião geral', 'Pauta rápida com a equipe.', '2026-11-11 16:00:00', 60
  UNION ALL SELECT 'geral', 'Reunião geral mensal', 'Alinhamento mensal com toda a equipe.', '2026-11-18 11:00:00', 45
  UNION ALL SELECT 'geral', 'Comunicados da diretoria', 'Pauta rápida com a equipe.', '2026-11-25 14:00:00', 30
  UNION ALL SELECT 'projetos', 'Sprint Review', 'Demonstração das entregas da sprint.', '2026-10-18 09:00:00', 60
  UNION ALL SELECT 'projetos', 'Planning da Sprint 15', 'Planejamento da próxima sprint.', '2026-10-18 15:00:00', 30
  UNION ALL SELECT 'projetos', 'Steering Committee', 'Acompanhamento executivo dos projetos.', '2026-10-26 10:00:00', 60
  UNION ALL SELECT 'projetos', 'Kick-off Rollout Filial Sul', 'Início do rollout na Filial Sul.', '2026-10-28 14:30:00', 45
  UNION ALL SELECT 'projetos', 'Retrospectiva da sprint', 'O que foi bem e o que melhorar.', '2026-11-04 09:30:00', 30
  UNION ALL SELECT 'projetos', 'Go-live do Projeto Atlas', 'Checklist final de go-live.', '2026-11-11 16:00:00', 60
  UNION ALL SELECT 'projetos', 'Sprint Review', 'Demonstração das entregas da sprint.', '2026-11-18 11:00:00', 45
  UNION ALL SELECT 'projetos', 'Planning da Sprint 15', 'Planejamento da próxima sprint.', '2026-11-25 14:00:00', 30
  UNION ALL SELECT 'marketing', 'Reunião com a agência', 'Alinhamento de campanhas.', '2026-10-18 09:00:00', 60
  UNION ALL SELECT 'marketing', 'Lançamento da VIP 3230 D', 'Plano de comunicação do lançamento.', '2026-10-18 15:00:00', 30
  UNION ALL SELECT 'marketing', 'Teaser da Black Friday', 'Revisão dos materiais de teaser.', '2026-10-26 10:00:00', 60
  UNION ALL SELECT 'marketing', 'Planejamento de conteúdo', 'Calendário editorial de novembro.', '2026-10-28 14:30:00', 45
  UNION ALL SELECT 'marketing', 'Expo Segurança: preparação', 'Estande, materiais e escala.', '2026-11-04 09:30:00', 30
  UNION ALL SELECT 'marketing', 'Métricas das campanhas', 'Resultados e ajustes.', '2026-11-11 16:00:00', 60
  UNION ALL SELECT 'marketing', 'Reunião com a agência', 'Alinhamento de campanhas.', '2026-11-18 11:00:00', 45
  UNION ALL SELECT 'marketing', 'Lançamento da VIP 3230 D', 'Plano de comunicação do lançamento.', '2026-11-25 14:00:00', 30
  UNION ALL SELECT 'rh', 'Onboarding dos estagiários', 'Boas-vindas e apresentação da empresa.', '2026-10-18 09:00:00', 60
  UNION ALL SELECT 'rh', 'Entrevistas: Analista de Dados', 'Rodada de entrevistas finais.', '2026-10-18 15:00:00', 30
  UNION ALL SELECT 'rh', 'Resultado da pesquisa de clima', 'Apresentação dos resultados.', '2026-10-26 10:00:00', 60
  UNION ALL SELECT 'rh', 'Início das avaliações', 'Orientações do ciclo de avaliação.', '2026-10-28 14:30:00', 45
  UNION ALL SELECT 'rh', 'Palestra de bem-estar', 'Saúde e qualidade de vida.', '2026-11-04 09:30:00', 30
  UNION ALL SELECT 'rh', 'Calendário de férias', 'Fechamento das escalas.', '2026-11-11 16:00:00', 60
  UNION ALL SELECT 'rh', 'Onboarding dos estagiários', 'Boas-vindas e apresentação da empresa.', '2026-11-18 11:00:00', 45
  UNION ALL SELECT 'rh', 'Entrevistas: Analista de Dados', 'Rodada de entrevistas finais.', '2026-11-25 14:00:00', 30
  UNION ALL SELECT 'financeiro', 'Fechamento mensal', 'Conferência dos lançamentos do mês.', '2026-10-18 09:00:00', 60
  UNION ALL SELECT 'financeiro', 'Revisão do orçamento 2027', 'Premissas e metas do orçamento.', '2026-10-18 15:00:00', 30
  UNION ALL SELECT 'financeiro', 'Comitê de investimentos', 'Análise de propostas.', '2026-10-26 10:00:00', 60
  UNION ALL SELECT 'financeiro', 'Entrega de documentos à auditoria', 'Checklist de documentos.', '2026-10-28 14:30:00', 45
  UNION ALL SELECT 'financeiro', 'Conciliação bancária', 'Pendências do mês.', '2026-11-04 09:30:00', 30
  UNION ALL SELECT 'financeiro', 'Pagamento de impostos', 'Cronograma de recolhimentos.', '2026-11-11 16:00:00', 60
  UNION ALL SELECT 'financeiro', 'Fechamento mensal', 'Conferência dos lançamentos do mês.', '2026-11-18 11:00:00', 45
  UNION ALL SELECT 'financeiro', 'Revisão do orçamento 2027', 'Premissas e metas do orçamento.', '2026-11-25 14:00:00', 30
  UNION ALL SELECT 'ti', 'Janela de manutenção', 'Atualizações programadas.', '2026-10-18 09:00:00', 60
  UNION ALL SELECT 'ti', 'Treinamento de MFA', 'Ativação do segundo fator.', '2026-10-18 15:00:00', 30
  UNION ALL SELECT 'ti', 'Teste de restore', 'Validação dos backups.', '2026-10-26 10:00:00', 60
  UNION ALL SELECT 'ti', 'Migração para cloud: fase 1', 'Plano e riscos da migração.', '2026-10-28 14:30:00', 45
  UNION ALL SELECT 'ti', 'Revisão de acessos', 'Auditoria de permissões.', '2026-11-04 09:30:00', 30
  UNION ALL SELECT 'ti', 'Instalação do AP no 3º andar', 'Cronograma de instalação.', '2026-11-11 16:00:00', 60
  UNION ALL SELECT 'ti', 'Janela de manutenção', 'Atualizações programadas.', '2026-11-18 11:00:00', 45
  UNION ALL SELECT 'ti', 'Treinamento de MFA', 'Ativação do segundo fator.', '2026-11-25 14:00:00', 30
  UNION ALL SELECT 'sac', 'Revisão de casos escalados', 'Casos críticos da semana.', '2026-10-18 09:00:00', 60
  UNION ALL SELECT 'sac', 'Reunião de ouvidoria', 'Tratativas e melhorias.', '2026-10-18 15:00:00', 30
  UNION ALL SELECT 'sac', 'Análise de NPS', 'Resultados e plano de ação.', '2026-10-26 10:00:00', 60
  UNION ALL SELECT 'sac', 'Treinamento de novos atendentes', 'Scripts e boas práticas.', '2026-10-28 14:30:00', 45
  UNION ALL SELECT 'sac', 'Plantão da Black Friday', 'Escala e preparação.', '2026-11-04 09:30:00', 30
  UNION ALL SELECT 'sac', 'Revisão de casos críticos', 'Alinhamento antes da entrega.', '2026-11-11 16:00:00', 60
  UNION ALL SELECT 'sac', 'Revisão de casos escalados', 'Casos críticos da semana.', '2026-11-18 11:00:00', 45
  UNION ALL SELECT 'sac', 'Reunião de ouvidoria', 'Tratativas e melhorias.', '2026-11-25 14:00:00', 30
) AS v
JOIN (
  SELECT u.equipe_slug,
         SUBSTRING_INDEX(GROUP_CONCAT(u.id ORDER BY FIELD(u.cargo,'ceo','diretor','gerente','coordenador','supervisor','funcionario','estagiario'), u.id), ',', 1) + 0 AS criador_id
    FROM `tb_usuarios` u
   WHERE u.status = 'ativo' AND u.id <> 1 AND u.equipe_slug IS NOT NULL
   GROUP BY u.equipe_slug
) AS c ON c.equipe_slug = v.equipe_slug
WHERE NOT EXISTS (
  SELECT 1 FROM `tb_chamadas_agendadas` a
   WHERE a.equipe_slug = v.equipe_slug AND a.titulo = v.titulo AND a.data_hora = v.data_hora
);
