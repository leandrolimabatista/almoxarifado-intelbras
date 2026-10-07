-- ============================================================
-- Módulo "Usuários" — campo "Cargo" (obrigatório, tela "Editar
-- usuário"). Rodar depois de database/usuarios_admin.sql.
--
-- Cargos disponíveis: Estagiário, Funcionário, Supervisor,
-- Coordenador, Gerente, Diretor, CEO.
-- ============================================================

ALTER TABLE `tb_usuarios`
  ADD COLUMN `cargo` ENUM('estagiario','funcionario','supervisor','coordenador','gerente','diretor','ceo')
    NOT NULL DEFAULT 'funcionario' AFTER `equipe_slug`;

-- O Administrador (id 1) fica marcado como CEO por padrão — pode ser
-- trocado a qualquer momento na própria tela "Editar usuário".
UPDATE `tb_usuarios` SET `cargo` = 'ceo' WHERE `id` = 1;
