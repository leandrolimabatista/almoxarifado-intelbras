<?php
/**
 * Cupons de desconto da Loja — funções (sem headers/sessão).
 * Endpoint: cupom.php. Usado também por pedidos.php (_pedidos.php) e pelo Dashboard.
 *
 * Quem decide se um cupom vale e quanto desconta é SEMPRE o servidor:
 *  - cupom_verificar()  confere ativo, vigência, limite total, limite por usuário e valor mínimo;
 *  - cupom_ratear()     calcula o desconto de cada linha do carrinho, em CENTAVOS INTEIROS.
 *    O mesmo algoritmo existe em loja.js (ratearCupom) para a tela mostrar o valor na hora;
 *    o servidor recalcula tudo ao gravar o pedido e recusa se o navegador mostrou outro valor.
 */
declare(strict_types=1);

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

/** Desconto máximo sobre o subtotal (o Mercado Pago não aceita item de R$ 0,00). */
const CUPOM_MAX_PERCENT = 90;
const CUPOM_REGEX = '/^[A-Z0-9][A-Z0-9_-]{2,29}$/';
const CUPOM_VALOR_MAX = 100000.0;

class CupomErro extends RuntimeException
{
    public ?string $campo;

    public function __construct(string $mensagem, int $http = 422, ?string $campo = null)
    {
        parent::__construct($mensagem, $http);
        $this->campo = $campo;
    }
}

/** Colunas novas (database/loja_cupons.sql) já existem? Sem elas o cupom fica desligado. */
function cupom_prontos(PDO $pdo): bool
{
    static $pronto = null;
    if ($pronto === null) {
        try {
            $pdo->query('SELECT codigo, tipo, valor, ativo, valido_de, valido_ate, usos_max, por_usuario, valor_minimo, usos FROM tb_loja_cupons LIMIT 0');
            $pdo->query('SELECT desconto, cupom FROM tb_loja_pedidos LIMIT 0');
            $pronto = true;
        } catch (PDOException $e) {
            $pronto = false;
        }
    }
    return $pronto;
}

/** Só a coluna "desconto" dos pedidos (para o Dashboard / histórico). */
function cupom_pedido_tem_desconto(PDO $pdo): bool
{
    static $tem = null;
    if ($tem === null) {
        try {
            $pdo->query('SELECT desconto FROM tb_loja_pedidos LIMIT 0');
            $tem = true;
        } catch (PDOException $e) {
            $tem = false;
        }
    }
    return $tem;
}

function cupom_normalizar($bruto): string
{
    return strtoupper(preg_replace('/\s+/u', '', trim((string)$bruto)) ?? '');
}

function cupom_centavos($v): int
{
    return (int)round(((float)$v) * 100);
}

function cupom_moeda(int $centavos): string
{
    return 'R$ ' . number_format($centavos / 100, 2, ',', '.');
}

/** Linha do cupom (ou null). $travar = SELECT ... FOR UPDATE (dentro de transação). */
function cupom_buscar(PDO $pdo, string $codigo, bool $travar = false): ?array
{
    $st = $pdo->prepare(
        'SELECT codigo, tipo, valor, ativo, valido_de, valido_ate, usos_max, por_usuario, valor_minimo, usos, criado_em,
                (valido_de IS NULL OR valido_de <= NOW()) AS ja_comecou,
                (valido_ate IS NULL OR valido_ate >= NOW()) AS vigente
           FROM tb_loja_cupons WHERE codigo = :c' . ($travar ? ' FOR UPDATE' : '')
    );
    $st->execute(['c' => $codigo]);
    $r = $st->fetch();
    return $r ?: null;
}

/** Pedidos que estão usando o cupom agora (aguardando pagamento ou pagos). Cancelados não contam. */
function cupom_usos_reais(PDO $pdo, string $codigo, ?int $usuarioId = null): int
{
    $sql = "SELECT COUNT(*) FROM tb_loja_pedidos WHERE cupom = :c AND status IN ('iniciado','pago')";
    $p = ['c' => $codigo];
    if ($usuarioId !== null) {
        $sql .= ' AND usuario_id = :u';
        $p['u'] = $usuarioId;
    }
    $st = $pdo->prepare($sql);
    $st->execute($p);
    return (int)$st->fetchColumn();
}

/** Atualiza o contador informativo "usos" (a conferência de verdade usa cupom_usos_reais). */
function cupom_recontar(PDO $pdo, string $codigo): void
{
    try {
        $pdo->prepare(
            "UPDATE tb_loja_cupons
                SET usos = (SELECT COUNT(*) FROM tb_loja_pedidos WHERE cupom = :c1 AND status IN ('iniciado','pago'))
              WHERE codigo = :c2"
        )->execute(['c1' => $codigo, 'c2' => $codigo]);
    } catch (PDOException $e) {
        error_log('[loja/cupom] recontar: ' . $e->getMessage());
    }
}

/**
 * Confere se o usuário pode usar o cupom neste carrinho. Devolve a linha do cupom.
 * Lança CupomErro (mensagem pronta para o cliente). Com $travar, trava a linha do cupom até o
 * fim da transação: dois pedidos simultâneos nunca passam do limite de usos.
 */
function cupom_verificar(PDO $pdo, string $codigo, int $usuarioId, int $subtotalCentavos, bool $travar = false): array
{
    $codigo = cupom_normalizar($codigo);
    if ($codigo === '') {
        throw new CupomErro('Digite o código do cupom.');
    }
    if (!cupom_prontos($pdo)) {
        throw new CupomErro('Cupons indisponíveis no momento.', 503);
    }
    $c = cupom_buscar($pdo, $codigo, $travar);
    if (!$c || (int)$c['ativo'] !== 1 || (int)$c['vigente'] !== 1 || (int)$c['ja_comecou'] !== 1) {
        throw new CupomErro('Cupom inválido ou expirado.');   // mesma mensagem: não revela que o código existe
    }
    if ($c['usos_max'] !== null && cupom_usos_reais($pdo, (string)$c['codigo']) >= (int)$c['usos_max']) {
        throw new CupomErro('Este cupom atingiu o limite de usos.');
    }
    if ($c['por_usuario'] !== null && cupom_usos_reais($pdo, (string)$c['codigo'], $usuarioId) >= (int)$c['por_usuario']) {
        throw new CupomErro((int)$c['por_usuario'] === 1 ? 'Você já usou este cupom.' : 'Você atingiu o limite de usos deste cupom.');
    }
    if ($c['valor_minimo'] !== null && $subtotalCentavos < cupom_centavos($c['valor_minimo'])) {
        throw new CupomErro('Este cupom vale para compras a partir de ' . cupom_moeda(cupom_centavos($c['valor_minimo'])) . ' em produtos.');
    }
    return $c;
}

/**
 * Desconto de cada linha, em centavos inteiros (nada de float: PHP e JS dão o MESMO resultado).
 *
 * $linhas : [ ['preco' => centavos do preço unitário de tabela, 'qtd' => quantidade], ... ]
 * $cupom  : ['tipo' => 'percent'|'valor', 'valor' => ...]  ou null
 * Devolve : ['desconto' => total em centavos, 'linhas' => [ desconto de cada linha em centavos ]]
 *
 * percent -> cada UNIDADE é arredondada em centavos (preço × (100−p)%, meio centavo sobe),
 *            assim o preço unitário que vai ao Mercado Pago é sempre um valor em centavos.
 * valor   -> abate R$ fixo, dividido entre as linhas na proporção do total de cada uma
 *            (sobra de centavos vai para as primeiras linhas), nunca passando de 90% do subtotal.
 */
function cupom_ratear(array $linhas, ?array $cupom): array
{
    $n = count($linhas);
    $zeros = array_fill(0, $n, 0);
    if (!$cupom || $n === 0) {
        return ['desconto' => 0, 'linhas' => $zeros];
    }

    $totais = [];
    $sub = 0;
    foreach ($linhas as $i => $l) {
        $totais[$i] = (int)$l['preco'] * (int)$l['qtd'];
        $sub += $totais[$i];
    }
    if ($sub <= 0) {
        return ['desconto' => 0, 'linhas' => $zeros];
    }

    $descs = $zeros;
    if (($cupom['tipo'] ?? '') === 'percent') {
        $bp = max(0, min(CUPOM_MAX_PERCENT * 100, cupom_centavos($cupom['valor'])));   // pontos-base (1% = 100)
        foreach ($linhas as $i => $l) {
            $preco = (int)$l['preco'];
            $unit = intdiv($preco * (10000 - $bp) + 5000, 10000);
            $unit = max(1, min($preco, $unit));
            $descs[$i] = ($preco - $unit) * (int)$l['qtd'];
        }
    } else {
        $teto = intdiv($sub * CUPOM_MAX_PERCENT, 100);
        $alvo = max(0, min(cupom_centavos($cupom['valor']), $teto));
        $dado = 0;
        foreach ($linhas as $i => $l) {
            $descs[$i] = min(intdiv($alvo * $totais[$i], $sub), max(0, $totais[$i] - (int)$l['qtd']));   // ao menos 1 centavo por unidade
            $dado += $descs[$i];
        }
        $resto = $alvo - $dado;
        for ($volta = 0; $resto > 0 && $volta < $n + 1; $volta++) {
            foreach ($linhas as $i => $l) {
                if ($resto > 0 && $descs[$i] < $totais[$i] - (int)$l['qtd']) {   // deixa ao menos 1 centavo por unidade
                    $descs[$i]++;
                    $resto--;
                }
            }
        }
    }
    return ['desconto' => array_sum($descs), 'linhas' => $descs];
}

/** Dados do cupom que o navegador pode ver. */
function cupom_publico(array $c): array
{
    return [
        'codigo' => (string)$c['codigo'],
        'tipo'   => (string)$c['tipo'],
        'valor'  => (float)$c['valor'],
        'minimo' => $c['valor_minimo'] !== null ? (float)$c['valor_minimo'] : null,
    ];
}

/* =====================================================================
   ADMINISTRADOR (usuário id 1) — cadastro de cupons
   ===================================================================== */

function cupom_data($bruto, bool $fimDoDia, string $campo): ?string
{
    $t = trim((string)$bruto);
    if ($t === '') {
        return null;
    }
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $t, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) {
        throw new CupomErro('Data inválida.', 422, $campo);
    }
    return $t . ($fimDoDia ? ' 23:59:59' : ' 00:00:00');
}

function cupom_inteiro_opcional($bruto, int $max, string $campo, string $nome): ?int
{
    $t = trim((string)$bruto);
    if ($t === '') {
        return null;
    }
    if (!preg_match('/^\d{1,9}$/', $t) || (int)$t < 1 || (int)$t > $max) {
        throw new CupomErro($nome . ': informe um número inteiro de 1 a ' . $max . ' (ou deixe em branco).', 422, $campo);
    }
    return (int)$t;
}

/** Valida o formulário do administrador. $criando = false mantém o código recebido (não muda). */
function cupom_validar(array $in): array
{
    $codigo = cupom_normalizar($in['codigo'] ?? '');
    if (!preg_match(CUPOM_REGEX, $codigo)) {
        throw new CupomErro('Use 3 a 30 letras, números, hífen ou sublinhado.', 422, 'cpCodigo');
    }
    $tipo = (string)($in['tipo'] ?? '');
    if (!in_array($tipo, ['percent', 'valor'], true)) {
        throw new CupomErro('Escolha o tipo do desconto.', 422, 'cpTipo');
    }
    $valor = round((float)str_replace(',', '.', (string)($in['valor'] ?? '')), 2);
    if ($tipo === 'percent' && !($valor >= 0.01 && $valor <= CUPOM_MAX_PERCENT)) {
        throw new CupomErro('O percentual deve ficar entre 0,01% e ' . CUPOM_MAX_PERCENT . '%.', 422, 'cpValor');
    }
    if ($tipo === 'valor' && !($valor >= 0.01 && $valor <= CUPOM_VALOR_MAX)) {
        throw new CupomErro('Informe um valor entre R$ 0,01 e R$ 100.000,00.', 422, 'cpValor');
    }
    $minimo = trim((string)($in['valor_minimo'] ?? ''));
    $minimoNum = null;
    if ($minimo !== '') {
        $minimoNum = round((float)str_replace(',', '.', $minimo), 2);
        if (!($minimoNum >= 0.01 && $minimoNum <= CUPOM_VALOR_MAX)) {
            throw new CupomErro('Valor mínimo inválido (ou deixe em branco).', 422, 'cpMinimo');
        }
    }
    $de  = cupom_data($in['valido_de'] ?? '', false, 'cpDe');
    $ate = cupom_data($in['valido_ate'] ?? '', true, 'cpAte');
    if ($de !== null && $ate !== null && $de > $ate) {
        throw new CupomErro('A data final deve ser depois da inicial.', 422, 'cpAte');
    }
    return [
        'codigo'       => $codigo,
        'tipo'         => $tipo,
        'valor'        => $valor,
        'ativo'        => !empty($in['ativo']) && (string)$in['ativo'] !== '0' ? 1 : 0,
        'valido_de'    => $de,
        'valido_ate'   => $ate,
        'usos_max'     => cupom_inteiro_opcional($in['usos_max'] ?? '', 1000000, 'cpUsosMax', 'Limite total'),
        'por_usuario'  => cupom_inteiro_opcional($in['por_usuario'] ?? '', 1000, 'cpPorUsuario', 'Limite por usuário'),
        'valor_minimo' => $minimoNum,
    ];
}

/** Lista para a tela do administrador (com o uso real de cada cupom). */
function cupom_listar(PDO $pdo): array
{
    $uso = [];
    foreach ($pdo->query("SELECT cupom, COUNT(*) AS n FROM tb_loja_pedidos WHERE cupom IS NOT NULL AND status IN ('iniciado','pago') GROUP BY cupom") as $r) {
        $uso[strtoupper((string)$r['cupom'])] = (int)$r['n'];
    }
    $saida = [];
    $q = $pdo->query(
        'SELECT codigo, tipo, valor, ativo, valido_de, valido_ate, usos_max, por_usuario, valor_minimo, criado_em,
                (valido_ate IS NOT NULL AND valido_ate < NOW()) AS expirado,
                (valido_de IS NOT NULL AND valido_de > NOW()) AS agendado
           FROM tb_loja_cupons ORDER BY criado_em DESC, codigo'
    );
    foreach ($q->fetchAll() as $r) {
        $saida[] = [
            'codigo'       => (string)$r['codigo'],
            'tipo'         => (string)$r['tipo'],
            'valor'        => (float)$r['valor'],
            'ativo'        => (int)$r['ativo'] === 1,
            'valido_de'    => $r['valido_de'] !== null ? substr((string)$r['valido_de'], 0, 10) : null,
            'valido_ate'   => $r['valido_ate'] !== null ? substr((string)$r['valido_ate'], 0, 10) : null,
            'usos_max'     => $r['usos_max'] !== null ? (int)$r['usos_max'] : null,
            'por_usuario'  => $r['por_usuario'] !== null ? (int)$r['por_usuario'] : null,
            'valor_minimo' => $r['valor_minimo'] !== null ? (float)$r['valor_minimo'] : null,
            'usos'         => $uso[strtoupper((string)$r['codigo'])] ?? 0,
            'expirado'     => (int)$r['expirado'] === 1,
            'agendado'     => (int)$r['agendado'] === 1,
        ];
    }
    return $saida;
}

function cupom_criar(PDO $pdo, array $d): void
{
    try {
        $pdo->prepare(
            'INSERT INTO tb_loja_cupons (codigo, tipo, valor, ativo, valido_de, valido_ate, usos_max, por_usuario, valor_minimo)
             VALUES (:codigo, :tipo, :valor, :ativo, :de, :ate, :um, :pu, :vm)'
        )->execute([
            'codigo' => $d['codigo'], 'tipo' => $d['tipo'], 'valor' => $d['valor'], 'ativo' => $d['ativo'],
            'de' => $d['valido_de'], 'ate' => $d['valido_ate'], 'um' => $d['usos_max'],
            'pu' => $d['por_usuario'], 'vm' => $d['valor_minimo'],
        ]);
    } catch (PDOException $e) {
        if (($e->errorInfo[1] ?? 0) === 1062) {
            throw new CupomErro('Já existe um cupom com este código.', 409, 'cpCodigo');
        }
        throw $e;
    }
}

function cupom_atualizar(PDO $pdo, array $d): void
{
    $st = $pdo->prepare(
        'UPDATE tb_loja_cupons
            SET tipo = :tipo, valor = :valor, ativo = :ativo, valido_de = :de, valido_ate = :ate,
                usos_max = :um, por_usuario = :pu, valor_minimo = :vm
          WHERE codigo = :codigo'
    );
    $st->execute([
        'codigo' => $d['codigo'], 'tipo' => $d['tipo'], 'valor' => $d['valor'], 'ativo' => $d['ativo'],
        'de' => $d['valido_de'], 'ate' => $d['valido_ate'], 'um' => $d['usos_max'],
        'pu' => $d['por_usuario'], 'vm' => $d['valor_minimo'],
    ]);
    $existe = $pdo->prepare('SELECT 1 FROM tb_loja_cupons WHERE codigo = :c');
    $existe->execute(['c' => $d['codigo']]);
    if (!$existe->fetchColumn()) {
        throw new CupomErro('Cupom não encontrado.', 404);
    }
}

function cupom_alternar(PDO $pdo, string $codigo, bool $ativo): void
{
    $st = $pdo->prepare('UPDATE tb_loja_cupons SET ativo = :a WHERE codigo = :c');
    $st->execute(['a' => $ativo ? 1 : 0, 'c' => cupom_normalizar($codigo)]);
}

function cupom_remover(PDO $pdo, string $codigo): void
{
    $pdo->prepare('DELETE FROM tb_loja_cupons WHERE codigo = :c')->execute(['c' => cupom_normalizar($codigo)]);
}
