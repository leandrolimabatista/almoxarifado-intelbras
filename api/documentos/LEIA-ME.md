# Documentos — como o chat das equipes salva arquivos

Quando o chat de texto das equipes existir, todo arquivo enviado numa conversa
de equipe vira um documento da equipe, visível em **Documentos**. O chat não
precisa saber nada de tabelas ou pastas: só chama uma função.

## Uma vez só (banco)

No phpMyAdmin, no banco `bd_intelbras`, aba **SQL**, rode nesta ordem
(pule o que já rodou):

1. `database/documentos.sql`
2. `database/documentos_chat.sql`

## No código do chat (PHP)

```php
require_once __DIR__ . '/../conexao.php';               // ajuste o caminho
require_once __DIR__ . '/../documentos/_servico.php';   // só funções, sem headers/sessão

// ... depois de validar login e gravar a mensagem no chat ...
$pdo = conectar();

foreach ($anexos as $i => $anexo) {          // $anexo['tmp_name'] e $anexo['name'], como em $_FILES
    if (!doc_extensao_aceita($anexo['name'])) {
        continue;                            // ex.: .zip — fica só no chat
    }
    try {
        $doc = documentos_salvar_arquivo(
            $pdo,
            $usuarioId,                      // quem enviou a mensagem
            $equipeSlug,                     // geral | projetos | marketing | rh | financeiro | ti | sac
            $anexo['tmp_name'],              // ou o caminho do arquivo que o chat já guardou
            $anexo['name'],
            ['origem' => 'chat', 'origem_ref' => 'msg-' . $mensagemId . '-' . $i]
        );
        // $doc = ['id', 'nome', 'equipe', 'extensao', 'tamanho', 'duplicado']
    } catch (DocumentosErro $e) {
        // $e->getMessage() = texto para o usuário; $e->getCode() = HTTP sugerido (422, 413, 500)
    }
}
```

## Regras que a função já cumpre

- **Copia** o arquivo (não move): o chat continua dono do dele; o Documentos
  guarda o seu. Apagar a mensagem no chat não apaga o documento.
- Valida tamanho (até 20 MB), extensão e conteúdo real do arquivo (PDF, Word,
  Excel, PowerPoint, imagem PNG/JPG/WEBP, texto TXT/CSV/MD).
- O dono do documento é quem enviou a mensagem (`$usuarioId`), e a equipe é a
  do chat. O documento aparece em **Recentes**, na equipe certa, e na atividade
  recente.
- **Sem duplicar:** se a mesma `origem` + `origem_ref` for enviada de novo
  (retry, mensagem reenviada), devolve o documento existente com
  `duplicado = true`.
- Título padrão = nome do arquivo sem extensão; passe `['nome' => '...']` para
  outro.

## O que NÃO existe ainda

- Não há controle de quem pertence a cada equipe (o projeto não tem tabela de
  membros). Quem estiver no chat da equipe é quem o chat decidir; o Documentos
  hoje mostra todas as equipes a todos os usuários logados.
- A tela Documentos não mostra, por enquanto, um selo "veio do chat". A coluna
  `origem` já guarda a informação para isso.
