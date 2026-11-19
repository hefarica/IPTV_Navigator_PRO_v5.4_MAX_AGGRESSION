<?php
/**
 * APE — estado del provider-gate (SOLO LECTURA, fail-honest).
 *
 * El panel "Salidas implementadas" probaba /jit/live/<id>/master.m3u8 y recibia
 * 503 sin saber por que. La razon real la decide /opt/ape-pulse/lib/provider-gate.sh
 * (regla del operador: el player manda; el JIT solo arranca si el player esta idle
 * 180 s). Este endpoint devuelve ESA decision, sin exponer rutas ni IPs.
 *
 * GET -> {ok, available, decision, reason, player_age_s, player_signal,
 *         player_window_s, allow_tail, deny_tail, advice}
 * Si el log no se puede leer: {ok:true, available:false, reason:'log_not_readable'}
 * No acepta parametros, no escribe nada, no revela ficheros.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
    exit;
}

const GATE_LOG = '/var/log/ara/provider-gate.log';
const TAIL_BYTES = 65536;

if (!is_readable(GATE_LOG)) {
    echo json_encode(['ok' => true, 'available' => false, 'reason' => 'log_not_readable']);
    exit;
}

$fh = @fopen(GATE_LOG, 'rb');
if (!$fh) {
    echo json_encode(['ok' => true, 'available' => false, 'reason' => 'log_unopenable']);
    exit;
}
$st = fstat($fh);
$size = (int)($st['size'] ?? 0);
$from = max(0, $size - TAIL_BYTES);
fseek($fh, $from);
$tail = (string)fread($fh, TAIL_BYTES);
fclose($fh);
if ($from > 0) {
    $nl = strpos($tail, "\n");
    if ($nl !== false) { $tail = substr($tail, $nl + 1); }
}

$allow = substr_count($tail, 'decision=ALLOW');
$deny  = substr_count($tail, 'decision=DENY');

$last = null;
foreach (preg_split('/\r?\n/', $tail) as $line) {
    if (strpos($line, 'PROVIDER_GATE') !== false) { $last = $line; }
}
if ($last === null) {
    echo json_encode(['ok' => true, 'available' => false, 'reason' => 'no_decision_line',
        'allow_tail' => $allow, 'deny_tail' => $deny]);
    exit;
}

$f = [];
foreach (['decision', 'claimant', 'level', 'reason', 'player_age_s', 'player_signal',
          'player_window_s', 'jit_pids', 'canary_live'] as $k) {
    $f[$k] = (preg_match('/\b' . $k . '=(\S*)/', $last, $m) === 1) ? trim($m[1], '"') : null;
}

$reason = (string)($f['reason'] ?? '');
$advice = 'sin regla conocida; lee el motivo';
if ($reason === 'player_active') {
    $advice = 'El player tiene la conexion (nivel 0, prioridad absoluta). El JIT solo arranca '
            . (int)($f['player_window_s'] ?? 180) . ' s despues del ultimo latido. '
            . 'Deten la reproduccion para probar las salidas JIT.';
} elseif ($reason === 'gate_absent') {
    $advice = 'Sin gate instalado: se permite (no hay otro propietario que proteger).';
} elseif ($reason === 'gate_timeout' || $reason === 'gate_unavailable') {
    $advice = 'El gate no responde: se DENIEGA por seguridad (fail-closed).';
} elseif ($reason === 'jit_serving_player_path') {
    $advice = 'Permitido: es el propio JIT sirviendo al player.';
}

echo json_encode([
    'ok' => true,
    'available' => true,
    'decision' => $f['decision'],
    'claimant' => $f['claimant'],
    'level' => $f['level'],
    'reason' => $reason,
    'player_age_s' => $f['player_age_s'],
    'player_signal' => $f['player_signal'],
    'player_window_s' => $f['player_window_s'],
    'allow_tail' => $allow,
    'deny_tail' => $deny,
    'advice' => $advice,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);