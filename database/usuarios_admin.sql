-- ============================================================
-- Módulo "Usuários" (área administrativa — visível só para o
-- usuário id = 1). Rodar depois do schema.sql (e, se já tiver
-- sido importado, depois do unidade.sql).
--
-- O que este script faz:
--   1) Acrescenta unidade_id / equipe_slug / status em
--      tb_usuarios, pra a tela "Editar usuário" (Unidade e
--      Equipe, conforme protótipo).
--   2) Marca o Administrador (id 1) como lotado na unidade
--      Lapa Tito, equipe "Geral", ativo.
--   3) Cria tb_solicitacoes_acesso: toda vez que alguém usa o
--      formulário "Cadastre-se" do cabeçalho, a solicitação cai
--      aqui como "pendente" em vez de virar conta na hora — só
--      quando um admin aceita (aba Usuários > Solicitação de
--      Usuários) é que a linha correspondente é criada em
--      tb_usuarios.
-- ============================================================

ALTER TABLE `tb_usuarios`
  ADD COLUMN `unidade_id`  INT(10) UNSIGNED NULL DEFAULT NULL AFTER `genero_outro`,
  ADD COLUMN `equipe_slug` VARCHAR(40) NULL DEFAULT NULL AFTER `unidade_id`,
  ADD COLUMN `status`      ENUM('ativo','inativo') NOT NULL DEFAULT 'ativo' AFTER `equipe_slug`;

ALTER TABLE `tb_usuarios`
  ADD CONSTRAINT `fk_usuarios_unidade` FOREIGN KEY (`unidade_id`) REFERENCES `tb_unidades` (`id`);

-- O Administrador (único usuário hoje) passa a ter Unidade e Equipe
-- definidas, como já aparece no protótipo da tela de usuários.
UPDATE `tb_usuarios` SET `unidade_id` = 1, `equipe_slug` = 'geral' WHERE `id` = 1;

-- --------------------------------------------------------

CREATE TABLE `tb_solicitacoes_acesso` (
  `id` int(10) UNSIGNED NOT NULL,
  `nome` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `senha_hash` varchar(255) NOT NULL,
  `telefone` varchar(15) NOT NULL,
  `cpf` char(11) NOT NULL,
  `data_nascimento` date NOT NULL,
  `genero` enum('masculino','feminino','outro','prefiro_nao_informar') NOT NULL,
  `genero_outro` varchar(100) DEFAULT NULL,
  `equipe_solicitada` varchar(40) NOT NULL DEFAULT 'geral',
  `status` enum('pendente','aceita','recusada') NOT NULL DEFAULT 'pendente',
  `solicitado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `respondido_em` datetime DEFAULT NULL,
  `respondido_por` int(10) UNSIGNED DEFAULT NULL,
  `usuario_criado_id` int(10) UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `tb_solicitacoes_acesso`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_solicitacoes_status` (`status`,`solicitado_em`);

ALTER TABLE `tb_solicitacoes_acesso`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `tb_solicitacoes_acesso`
  ADD CONSTRAINT `fk_solicitacoes_respondido_por` FOREIGN KEY (`respondido_por`) REFERENCES `tb_usuarios` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_solicitacoes_usuario_criado` FOREIGN KEY (`usuario_criado_id`) REFERENCES `tb_usuarios` (`id`) ON DELETE SET NULL;
