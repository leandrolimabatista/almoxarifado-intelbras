<?php
/**
 * Estado dos envios à IA (para a resposta continuar mesmo sem a aba aberta).
 * Não é um endpoint: use apenas com require_once, DEPOIS de _bootstrap.php.
 *
 * Como funciona:
 *  - o front gera um "envio_id" a cada mensagem enviada;
 *  - enviar.php registra o envio como "pendente", chama a IA (mesmo que o
 *    usuário troque de página ou feche a aba) e, ao terminar, marca "ok"
 *    (com o id da conversa) ou "erro";
 *  - ao voltar para a página da IA, o front consulta envio.php e mostra
 *    a resposta (ou o "digitando..." se ainda estiver gerando);
 *  - "Parar geração" grava um marcador de cancelamento: nesse caso a
 *    resposta NÃO é gravada (mesmo comportamento de antes).
 *
 * Os arquivos de estado são pequenos (JSON) e ficam em "envios/", dentro da
 * mesma pasta dos anexos (fora do htdocs). Não precisa de tabela nova.
 */

declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/_anexos.php';

const IA_ENVIO_EXPIRA_SEGUNDOS = 86400; // arquivos de estado com mais de 1 dia são apagados

/** Aceita só ids hexadecimais gerados pelo front (evita caminhos maliciosos). */
function ia_envio_id_valido($valor): ?string
{
    if (!is_string($valor) || !preg_match('/^[a-f0-9]{16,64}$/i', $valor)) {
        return null;
    }
    return strtolower($valor);
}

function ia_envio_dir(): string
{
    $dir = ia_dir_anexos() . '/envios';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    return $dir;
}

/** Caminho do arquivo de estado; o id do usuário faz parte do nome (isola cada usuário). */
function ia_envio_caminho(int $usuarioId, string $envioId, string $tipo): string
{
    return ia_envio_dir() . '/envio_' . $usuarioId . '_' . $envioId . '.' . $tipo;
}

/** @param array<string,mixed> $estado */
function ia_envio_gravar(int $usuarioId, string $envioId, array $estado): void
{
    @file_put_contents(
        ia_envio_caminho($usuarioId, $envioId, 'json'),
        json_encode($estado, JSON_UNESCAPED_UNICODE),
        LOCK_EX
    );
}

/** @return array{dados:array<string,mixed>,modificado:int}|null */
function ia_envio_ler(int $usuarioId, string $envioId): ?array
{
    $caminho = ia_envio_caminho($usuarioId, $envioId, 'json');
    if (!is_file($caminho)) {
        return null;
    }
    $dados = json_decode((string)@file_get_contents($caminho), true);
    if (!is_array($dados)) {
        return null;
    }
    return ['dados' => $dados, 'modificado' => (int)@filemtime($caminho)];
}

function ia_envio_cancelar(int $usuarioId, string $envioId): void
{
    @file_put_contents(ia_envio_caminho($usuarioId, $envioId, 'cancelado'), '1', LOCK_EX);
}

function ia_envio_cancelado(int $usuarioId, string $envioId): bool
{
    clearstatcache();
    return is_file(ia_envio_caminho($usuarioId, $envioId, 'cancelado'));
}

/** Apaga estados antigos (roda de vez em quando, não em toda requisição). */
function ia_envio_limpar_antigos(): void
{
    if (random_int(1, 20) !== 1) {
        return;
    }
    $limite = time() - IA_ENVIO_EXPIRA_SEGUNDOS;
    foreach ((array)glob(ia_envio_dir() . '/envio_*') as $arquivo) {
        if (is_file($arquivo) && (int)@filemtime($arquivo) < $limite) {
            @unlink($arquivo);
        }
    }
}
