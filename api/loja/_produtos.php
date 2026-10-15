<?php
/**
 * Catálogo da Loja no banco (tb_loja_produtos) — funções (sem headers/sessão).
 * Endpoint: produtos.php (GET lista · POST adicionar/editar/remover, só o Administrador).
 *
 * Código (id) é o SKU do produto: não muda depois de criado, porque os pedidos
 * guardam esse código. "Remover" é lógico (ativo = 0): o histórico de compras
 * continua intacto e o mesmo código pode ser adicionado de novo mais tarde.
 */
declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../conexao.php';

const PROD_ID_REGEX         = '/^[A-Z0-9][A-Z0-9_-]{1,19}$/';
const PROD_NOME_MAX         = 150;
const PROD_DESC_MAX         = 500;
const PROD_PRECO_MAX        = 100000.00;   // mesmo teto de pedido_validar()
const PROD_ESTOQUE_MAX      = 999999;
const PROD_MAX_PEDIDO_PADRAO = 3;
const PROD_IMG_MAX_BYTES    = 5 * 1024 * 1024;
const PROD_IMG_PADRAO_UPLOAD = '/^up-[0-9a-f]{16}\.(jpg|png|webp)$/';   // só estes arquivos podem ser apagados pelo sistema

/** Erro de regra de negócio. $campo = id do campo do formulário a destacar (opcional). */
class ProdutoErro extends RuntimeException
{
    public ?string $campo;

    public function __construct(string $mensagem, int $http = 422, ?string $campo = null)
    {
        parent::__construct($mensagem, $http);
        $this->campo = $campo;
    }
}

/** tb_loja_produtos existe e já tem a coluna "ordem" (database/loja_catalogo.sql aplicado)? */
function prod_tabela_pronta(PDO $pdo): bool
{
    static $pronto = null;
    if ($pronto === null) {
        try {
            $pdo->query('SELECT id, categoria_id, nome, descricao, preco, estoque, imagem, max_por_pedido, ativo, ordem
                           FROM tb_loja_produtos LIMIT 0');
            $pdo->query('SELECT id, nome, ordem FROM tb_loja_categorias LIMIT 0');
            $pronto = true;
        } catch (PDOException $e) {
            $pronto = false;
        }
    }
    return $pronto;
}

/** tb_loja_pedidos está no formato JSON e já tem "estoque_reservado"? */
function prod_pedidos_prontos(PDO $pdo): bool
{
    static $pronto = null;
    if ($pronto === null) {
        try {
            $pdo->query('SELECT codigo, itens, estoque_reservado FROM tb_loja_pedidos LIMIT 0');
            $pronto = true;
        } catch (PDOException $e) {
            $pronto = false;
        }
    }
    return $pronto;
}

/** Pasta das fotos dos produtos (a mesma que a Loja já usa em loja.dados.js: IMG_BASE). */
function prod_dir_imagens(): string
{
    return dirname(__DIR__, 2) . '/conteudo/cadastrado/loja/img';
}

function prod_texto($v, int $max): string
{
    $t = trim((string)preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string)$v));
    return mb_substr($t, 0, $max);
}

/** @return array<int,array{id:string,nome:string}> */
function prod_categorias(PDO $pdo): array
{
    return $pdo->query('SELECT id, nome FROM tb_loja_categorias ORDER BY ordem, nome')->fetchAll();
}

/** Linha do banco -> formato que a Loja (loja.js) usa. */
function prod_formatar(array $r): array
{
    return [
        'id'    => (string)$r['id'],
        'cat'   => (string)$r['categoria_id'],
        'name'  => (string)$r['nome'],
        'desc'  => (string)$r['descricao'],
        'price' => (float)$r['preco'],
        'stock' => (int)$r['estoque'],
        'image' => (string)($r['imagem'] ?? ''),
        'max'   => max(1, (int)$r['max_por_pedido']),
    ];
}

/** Produtos ativos na ordem da vitrine (categoria, posição). */
function prod_listar(PDO $pdo): array
{
    $st = $pdo->query(
        'SELECT p.id, p.categoria_id, p.nome, p.descricao, p.preco, p.estoque, p.imagem, p.max_por_pedido
           FROM tb_loja_produtos p
           JOIN tb_loja_categorias c ON c.id = p.categoria_id
          WHERE p.ativo = 1
          ORDER BY c.ordem, p.ordem, p.id'
    );
    return array_map('prod_formatar', $st->fetchAll());
}

/** Produtos ativos indexados por id (validação de pedido). */
function prod_mapa_ativos(PDO $pdo): array
{
    $mapa = [];
    foreach ($pdo->query('SELECT id, categoria_id, nome, preco, estoque, max_por_pedido FROM tb_loja_produtos WHERE ativo = 1') as $r) {
        $mapa[(string)$r['id']] = $r;
    }
    return $mapa;
}

/**
 * Catálogo de peso/medidas do frete (_catalogo_frete.php) + os produtos do banco.
 * Produto novo usa o padrão da categoria dele; sem isso a cotação recusaria o item.
 */
function loja_catalogo_frete(?PDO $pdo = null): array
{
    $catalogo = require __DIR__ . '/_catalogo_frete.php';
    try {
        $pdo ??= conectar();
        if (prod_tabela_pronta($pdo)) {
            foreach ($pdo->query('SELECT id, categoria_id FROM tb_loja_produtos') as $r) {
                $catalogo['categorias'][(string)$r['id']] = (string)$r['categoria_id'];
            }
        }
    } catch (Throwable $e) {
        error_log('[loja/catalogo_frete] ' . $e->getMessage());
    }
    return $catalogo;
}

// ---------------------------------------------------------------------
// Validação do formulário (adicionar / editar)
// ---------------------------------------------------------------------

/** "279,90" | "279.90" | "1249" -> 279.9 ; null se inválido. */
function prod_ler_preco($v): ?float
{
    $t = trim((string)$v);
    if (!preg_match('/^\d{1,6}([.,]\d{1,2})?$/', $t)) {
        return null;
    }
    return round((float)str_replace(',', '.', $t), 2);
}

/**
 * Valida e normaliza os campos. Lança ProdutoErro com o campo do formulário.
 *
 * @param bool $criando true = exige código; false = o código vem da edição (já validado)
 */
function prod_validar(array $in, bool $criando, array $categorias): array
{
    $id = strtoupper(trim((string)($in['codigo'] ?? '')));
    if ($criando || $id !== '') {
        if ($id === '') {
            throw new ProdutoErro('Informe o código do produto.', 422, 'lpCodigo');
        }
        if (!preg_match(PROD_ID_REGEX, $id)) {
            throw new ProdutoErro('Código inválido. Use 2 a 20 letras, números, hífen ou sublinhado.', 422, 'lpCodigo');
        }
    }

    $nome = prod_texto($in['titulo'] ?? '', PROD_NOME_MAX);
    if (mb_strlen($nome) < 2) {
        throw new ProdutoErro('Informe o título do produto.', 422, 'lpTitulo');
    }

    $desc = prod_texto($in['descricao'] ?? '', PROD_DESC_MAX + 1);
    if ($desc === '') {
        throw new ProdutoErro('Informe a descrição do produto.', 422, 'lpDescricao');
    }
    if (mb_strlen($desc) > PROD_DESC_MAX) {
        throw new ProdutoErro('A descrição pode ter até ' . PROD_DESC_MAX . ' caracteres.', 422, 'lpDescricao');
    }

    $preco = prod_ler_preco($in['preco'] ?? '');
    if ($preco === null || $preco <= 0) {
        throw new ProdutoErro('Informe um preço válido (maior que zero).', 422, 'lpPreco');
    }
    if ($preco > PROD_PRECO_MAX) {
        throw new ProdutoErro('O preço máximo é R$ 100.000,00.', 422, 'lpPreco');
    }

    $estTxt = trim((string)($in['estoque'] ?? ''));
    if (!preg_match('/^\d{1,6}$/', $estTxt)) {
        throw new ProdutoErro('Informe o estoque (número inteiro, 0 ou mais).', 422, 'lpEstoque');
    }
    $estoque = (int)$estTxt;

    $cat = trim((string)($in['categoria'] ?? ''));
    $ids = array_column($categorias, 'id');
    if (!in_array($cat, $ids, true)) {
        throw new ProdutoErro('Selecione a categoria.', 422, 'lpCategoria');
    }

    return ['id' => $id, 'nome' => $nome, 'descricao' => $desc, 'preco' => $preco, 'estoque' => $estoque, 'categoria_id' => $cat];
}

// ---------------------------------------------------------------------
// Imagem
// ---------------------------------------------------------------------

/**
 * Confere o arquivo enviado (conteúdo real, não a extensão). Devolve null se nada foi enviado.
 * @return array{tmp:string,ext:string}|null
 */
function prod_validar_imagem(?array $arq): ?array
{
    if (!is_array($arq) || ($arq['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if (in_array($arq['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) || (int)$arq['size'] > PROD_IMG_MAX_BYTES) {
        throw new ProdutoErro('A imagem deve ter no máximo 5MB.', 422, 'lpImagem');
    }
    if ($arq['error'] !== UPLOAD_ERR_OK || !is_uploaded_file((string)$arq['tmp_name'])) {
        throw new ProdutoErro('Não foi possível receber a imagem.', 422, 'lpImagem');
    }
    $info = @getimagesize((string)$arq['tmp_name']);
    $tipo = $info[2] ?? 0;
    if ($tipo === IMAGETYPE_JPEG) {
        $ext = 'jpg';
    } elseif ($tipo === IMAGETYPE_PNG) {
        $ext = 'png';
    } elseif ($tipo === IMAGETYPE_WEBP) {
        $ext = 'webp';
    } else {
        throw new ProdutoErro('Formato inválido. Use JPG, PNG ou WEBP.', 422, 'lpImagem');
    }
    return ['tmp' => (string)$arq['tmp_name'], 'ext' => $ext];
}

/** Move a imagem validada para a pasta da Loja e devolve o nome do arquivo. */
function prod_gravar_imagem(array $img): string
{
    $dir = prod_dir_imagens();
    if (!is_dir($dir) || !is_writable($dir)) {
        error_log('[loja/produtos] pasta sem permissão de escrita: ' . $dir);
        throw new ProdutoErro('O servidor não conseguiu salvar a imagem (pasta de imagens sem permissão de escrita).', 500, 'lpImagem');
    }
    $nome = 'up-' . bin2hex(random_bytes(8)) . '.' . $img['ext'];
    if (!move_uploaded_file($img['tmp'], $dir . '/' . $nome)) {
        throw new ProdutoErro('Não foi possível salvar a imagem no servidor.', 500, 'lpImagem');
    }
    return $nome;
}

/** Apaga uma imagem enviada pelo sistema. As fotos originais da Loja nunca são apagadas. */
function prod_apagar_imagem(?string $nome): void
{
    $nome = (string)$nome;
    if ($nome !== '' && preg_match(PROD_IMG_PADRAO_UPLOAD, $nome)) {
        @unlink(prod_dir_imagens() . '/' . $nome);
    }
}

// ---------------------------------------------------------------------
// Operações (administrador)
// ---------------------------------------------------------------------

function prod_buscar(PDO $pdo, string $id, bool $travar = false): ?array
{
    $st = $pdo->prepare('SELECT * FROM tb_loja_produtos WHERE id = :id' . ($travar ? ' FOR UPDATE' : ''));
    $st->execute(['id' => $id]);
    $r = $st->fetch();
    return $r ?: null;
}

function prod_proxima_ordem(PDO $pdo): int
{
    return (int)$pdo->query('SELECT COALESCE(MAX(ordem), 0) + 1 FROM tb_loja_produtos')->fetchColumn();
}

/**
 * Adiciona um item. Se o código existir como item REMOVIDO, ele volta para a Loja com os dados novos.
 * @param array|null $img resultado de prod_validar_imagem()
 */
function prod_criar(PDO $pdo, array $d, ?array $img): array
{
    $nova = $img ? prod_gravar_imagem($img) : null;
    try {
        $pdo->beginTransaction();
        $atual = prod_buscar($pdo, $d['id'], true);
        if ($atual && (int)$atual['ativo'] === 1) {
            throw new ProdutoErro('Já existe um item com o código ' . $d['id'] . '.', 409, 'lpCodigo');
        }
        $ordem = prod_proxima_ordem($pdo);
        if ($atual) {   // item removido antes: reativa
            $imagem = $nova ?? ($atual['imagem'] !== null ? (string)$atual['imagem'] : null);
            $pdo->prepare(
                'UPDATE tb_loja_produtos
                    SET categoria_id = :c, nome = :n, descricao = :d, preco = :p, estoque = :e,
                        imagem = :i, ativo = 1, ordem = :o
                  WHERE id = :id'
            )->execute(['c' => $d['categoria_id'], 'n' => $d['nome'], 'd' => $d['descricao'], 'p' => $d['preco'],
                        'e' => $d['estoque'], 'i' => $imagem, 'o' => $ordem, 'id' => $d['id']]);
            if ($nova !== null) {
                prod_apagar_imagem($atual['imagem'] !== null ? (string)$atual['imagem'] : null);
            }
        } else {
            $pdo->prepare(
                'INSERT INTO tb_loja_produtos (id, categoria_id, nome, descricao, preco, estoque, imagem, max_por_pedido, ativo, ordem)
                 VALUES (:id, :c, :n, :d, :p, :e, :i, :m, 1, :o)'
            )->execute(['id' => $d['id'], 'c' => $d['categoria_id'], 'n' => $d['nome'], 'd' => $d['descricao'],
                        'p' => $d['preco'], 'e' => $d['estoque'], 'i' => $nova, 'm' => PROD_MAX_PEDIDO_PADRAO, 'o' => $ordem]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        prod_apagar_imagem($nova);   // não deixa foto órfã
        throw $e;
    }
    return prod_formatar(prod_buscar($pdo, $d['id']) ?? []);
}

/**
 * Edita um item (o código não muda).
 * $estoqueBase = estoque que o formulário mostrava ao abrir. Se o administrador NÃO mexeu no
 * estoque, o valor do banco é preservado (uma compra feita enquanto o formulário estava aberto
 * não é desfeita).
 */
function prod_atualizar(PDO $pdo, string $id, array $d, ?array $img, bool $removerImagem, ?int $estoqueBase): array
{
    $nova = $img ? prod_gravar_imagem($img) : null;
    try {
        $pdo->beginTransaction();
        $atual = prod_buscar($pdo, $id, true);
        if (!$atual || (int)$atual['ativo'] !== 1) {
            throw new ProdutoErro('Este item não existe mais na Loja.', 404);
        }
        $estoque = ($estoqueBase !== null && $d['estoque'] === $estoqueBase) ? (int)$atual['estoque'] : $d['estoque'];
        $antiga = $atual['imagem'] !== null ? (string)$atual['imagem'] : null;
        $imagem = $nova ?? ($removerImagem ? null : $antiga);

        $pdo->prepare(
            'UPDATE tb_loja_produtos
                SET categoria_id = :c, nome = :n, descricao = :d, preco = :p, estoque = :e, imagem = :i
              WHERE id = :id'
        )->execute(['c' => $d['categoria_id'], 'n' => $d['nome'], 'd' => $d['descricao'], 'p' => $d['preco'],
                    'e' => $estoque, 'i' => $imagem, 'id' => $id]);
        $pdo->commit();
        if ($imagem !== $antiga) {
            prod_apagar_imagem($antiga);
        }
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        prod_apagar_imagem($nova);
        throw $e;
    }
    return prod_formatar(prod_buscar($pdo, $id) ?? []);
}

/** Remove da Loja (lógico). Pedidos já feitos não mudam. */
function prod_remover(PDO $pdo, string $id): void
{
    $st = $pdo->prepare('UPDATE tb_loja_produtos SET ativo = 0 WHERE id = :id AND ativo = 1');
    $st->execute(['id' => $id]);
    if ($st->rowCount() !== 1) {
        throw new ProdutoErro('Este item não existe mais na Loja.', 404);
    }
}
