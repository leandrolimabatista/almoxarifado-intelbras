<?php
/**
 * POST api/reunioes/agendar.php   (JSON + header X-CSRF-Token)
 * Cria uma reunião e seus participantes.
 *
 * Corpo esperado:
 * {
 *   "titulo": "Reunião de alinhamento",
 *   "data": "2026-09-30",            // AAAA-MM-DD, hoje ou futuro (no fuso escolhido)
 *   "inicio": "09:00", "fim": "10:00",
 *   "fuso": "America/Sao_Paulo",
 *   "equipe": "geral",
 *   "participantes": [2, 3, 4],       // ids de tb_usuarios
 *   "descricao": "...",               // até 1000 caracteres
 *   "repetir": false,
 *   "recorrencia": {                  // só lido quando repetir = true
 *     "frequencia": "semanal",        // diaria | semanal | mensal | personalizada
 *     "dias": [1, 3],                 // 0 = domingo ... 6 = sábado
 *     "termino": "nunca",             // nunca | data | ocorrencias
 *     "termino_data": "2026-12-31",
 *     "ocorrencias": 10
 *   }
 * }
 *
 * Erros de validação voltam como 422 com "campos": {campo: mensagem}, para o
 * formulário marcar cada campo. O front-end valida antes, mas o back-end nunca
 * confia só nele.
 */

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

const REU_MAX_TITULO    = 150;
const REU_MAX_DESCRICAO = 1000;
const REU_MAX_PARTICIPANTES = 200;

$usuarioId = reu_iniciar(['POST']);
reu_exigir_csrf();
$dados = reu_ler_json();

$erros = [];

// ---------------------------------------------------------------- título
$titulo = trim((string)($dados['titulo'] ?? ''));
if ($titulo === '') {
    $erros['titulo'] = 'Informe o título da reunião';
} elseif (mb_strlen($titulo) > REU_MAX_TITULO) {
    $erros['titulo'] = 'O título pode ter no máximo ' . REU_MAX_TITULO . ' caracteres';
}

// ---------------------------------------------------------------- fuso
$fuso = (string)($dados['fuso'] ?? 'America/Sao_Paulo');
if (!isset(REU_FUSOS[$fuso])) {
    $erros['fuso'] = 'Selecione um fuso horário válido';
    $fuso = 'America/Sao_Paulo'; // só para as próximas checagens não quebrarem
}

// ---------------------------------------------------------------- data
$data = null;
$dataTexto = (string)($dados['data'] ?? '');
$dt = DateTimeImmutable::createFromFormat('!Y-m-d', $dataTexto, new DateTimeZone($fuso));
$dtErros = DateTimeImmutable::getLastErrors();
if (!$dt || ($dtErros && ($dtErros['warning_count'] > 0 || $dtErros['error_count'] > 0)) || $dt->format('Y-m-d') !== $dataTexto) {
    $erros['data'] = 'Informe uma data válida';
} else {
    $hoje = new DateTimeImmutable('today', new DateTimeZone($fuso));
    if ($dt < $hoje) {
        $erros['data'] = 'Não é possível agendar em uma data passada';
    } else {
        $data = $dt;
    }
}

// ---------------------------------------------------------------- horários
$inicio = (string)($dados['inicio'] ?? '');
$fim    = (string)($dados['fim'] ?? '');
$reHora = '/^([01]\d|2[0-3]):[0-5]\d$/';
if (!preg_match($reHora, $inicio)) {
    $erros['inicio'] = 'Informe um horário válido';
}
if (!preg_match($reHora, $fim)) {
    $erros['fim'] = 'Informe um horário válido';
}
if (!isset($erros['inicio']) && !isset($erros['fim']) && $fim <= $inicio) {
    $erros['fim'] = 'O horário final deve ser depois do inicial';
}

// ---------------------------------------------------------------- equipe
$equipe = (string)($dados['equipe'] ?? 'geral');
if (!isset(REU_EQUIPES[$equipe])) {
    $erros['equipe'] = 'Selecione uma equipe ou canal válido';
}

// ---------------------------------------------------------------- descrição
$descricao = trim((string)($dados['descricao'] ?? ''));
if (mb_strlen($descricao) > REU_MAX_DESCRICAO) {
    $erros['descricao'] = 'A descrição pode ter no máximo ' . REU_MAX_DESCRICAO . ' caracteres';
}

// ---------------------------------------------------------------- participantes
$idsBrutos = $dados['participantes'] ?? [];
if (!is_array($idsBrutos)) {
    $idsBrutos = [];
}
$ids = [];
foreach ($idsBrutos as $id) {
    $n = filter_var($id, FILTER_VALIDATE_INT);
    if ($n !== false && $n > 0 && $n !== $usuarioId) {
        $ids[$n] = $n; // deduplica
    }
}
$ids = array_values($ids);
if (count($ids) > REU_MAX_PARTICIPANTES) {
    $erros['participantes'] = 'Uma reunião pode ter no máximo ' . REU_MAX_PARTICIPANTES . ' participantes';
}

// ---------------------------------------------------------------- recorrência
$repetir = !empty($dados['repetir']);
$rec = [
    'frequencia' => null, 'dias' => null,
    'termino' => null, 'termino_data' => null, 'ocorrencias' => null,
];
if ($repetir) {
    $r = is_array($dados['recorrencia'] ?? null) ? $dados['recorrencia'] : [];

    $frequencia = (string)($r['frequencia'] ?? '');
    if (!in_array($frequencia, ['diaria', 'semanal', 'mensal', 'personalizada'], true)) {
        $erros['recorrencia'] = 'Selecione a frequência da repetição';
    } else {
        $rec['frequencia'] = $frequencia;
    }

    if (in_array($frequencia, ['semanal', 'personalizada'], true)) {
        $dias = [];
        foreach ((is_array($r['dias'] ?? null) ? $r['dias'] : []) as $d) {
            $n = filter_var($d, FILTER_VALIDATE_INT);
            if ($n !== false && $n >= 0 && $n <= 6) {
                $dias[$n] = $n;
            }
        }
        ksort($dias);
        if (!$dias) {
            $erros['recorrencia_dias'] = 'Selecione ao menos um dia da semana';
        } else {
            $rec['dias'] = implode(',', $dias);
        }
    }

    $termino = (string)($r['termino'] ?? 'nunca');
    if (!in_array($termino, ['nunca', 'data', 'ocorrencias'], true)) {
        $erros['recorrencia_termino'] = 'Selecione quando a repetição termina';
    } else {
        $rec['termino'] = $termino;
        if ($termino === 'data') {
            $tt = (string)($r['termino_data'] ?? '');
            $td = DateTimeImmutable::createFromFormat('!Y-m-d', $tt);
            if (!$td || $td->format('Y-m-d') !== $tt) {
                $erros['recorrencia_termino'] = 'Informe a data de término';
            } elseif ($data !== null && $td < $data) {
                $erros['recorrencia_termino'] = 'A data de término deve ser depois da reunião';
            } else {
                $rec['termino_data'] = $tt;
            }
        } elseif ($termino === 'ocorrencias') {
            $n = filter_var($r['ocorrencias'] ?? null, FILTER_VALIDATE_INT);
            if ($n === false || $n < 1 || $n > 365) {
                $erros['recorrencia_termino'] = 'Informe de 1 a 365 ocorrências';
            } else {
                $rec['ocorrencias'] = $n;
            }
        }
    }
}

if ($erros) {
    reu_erro(422, 'Corrija os campos destacados.', $erros);
}

// ---------------------------------------------------------------- grava
try {
    $pdo = reu_pdo();

    // Só aceita participantes que existem e estão ativos
    if ($ids) {
        $marcas = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("SELECT id FROM tb_usuarios WHERE status = 'ativo' AND id IN ($marcas)");
        $stmt->execute($ids);
        $validos = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
        if (count($validos) !== count($ids)) {
            reu_erro(422, 'Um ou mais participantes não estão disponíveis.', [
                'participantes' => 'Um ou mais participantes não estão disponíveis',
            ]);
        }
    }

    $pdo->beginTransaction();

    $stmt = $pdo->prepare(
        'INSERT INTO tb_reunioes
            (organizador_id, titulo, descricao, data_reuniao, hora_inicio, hora_fim,
             fuso_horario, equipe_slug, recorrente, recorrencia_frequencia,
             recorrencia_dias, recorrencia_termino_tipo, recorrencia_termino_data,
             recorrencia_ocorrencias)
         VALUES
            (:organizador, :titulo, :descricao, :data, :inicio, :fim,
             :fuso, :equipe, :recorrente, :freq,
             :dias, :termino, :termino_data,
             :ocorrencias)'
    );
    $stmt->bindValue(':organizador', $usuarioId, PDO::PARAM_INT);
    $stmt->bindValue(':titulo', $titulo);
    $stmt->bindValue(':descricao', $descricao !== '' ? $descricao : null, $descricao !== '' ? PDO::PARAM_STR : PDO::PARAM_NULL);
    $stmt->bindValue(':data', $data->format('Y-m-d'));
    $stmt->bindValue(':inicio', $inicio . ':00');
    $stmt->bindValue(':fim', $fim . ':00');
    $stmt->bindValue(':fuso', $fuso);
    $stmt->bindValue(':equipe', $equipe);
    $stmt->bindValue(':recorrente', $repetir ? 1 : 0, PDO::PARAM_INT);
    $stmt->bindValue(':freq', $rec['frequencia'], $rec['frequencia'] === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $stmt->bindValue(':dias', $rec['dias'], $rec['dias'] === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $stmt->bindValue(':termino', $rec['termino'], $rec['termino'] === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $stmt->bindValue(':termino_data', $rec['termino_data'], $rec['termino_data'] === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $stmt->bindValue(':ocorrencias', $rec['ocorrencias'], $rec['ocorrencias'] === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $stmt->execute();

    $reuniaoId = (int)$pdo->lastInsertId();

    if ($ids) {
        $stmt = $pdo->prepare('INSERT INTO tb_reunioes_participantes (reuniao_id, usuario_id) VALUES (:r, :u)');
        foreach ($ids as $uid) {
            $stmt->execute(['r' => $reuniaoId, 'u' => $uid]);
        }
    }

    $pdo->commit();

    reu_resposta(201, [
        'sucesso' => true,
        'reuniao' => [
            'id'            => $reuniaoId,
            'titulo'        => $titulo,
            'data'          => $data->format('Y-m-d'),
            'inicio'        => $inicio,
            'fim'           => $fim,
            'fuso'          => $fuso,
            'equipe'        => $equipe,
            'participantes' => count($ids),
        ],
    ]);
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    reu_erro_banco($e, 'agendar');
}
