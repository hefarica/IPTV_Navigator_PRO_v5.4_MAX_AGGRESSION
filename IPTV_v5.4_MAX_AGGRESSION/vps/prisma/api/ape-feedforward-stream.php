<?php
/**
 * ape-feedforward-stream.php — F3: bus URL-2 en STREAMING (Server-Sent Events)
 *
 * Empuja presets re-sintonizados cada N segundos por la MISMA conexión, en lugar de
 * un one-shot. El daemon on-device consume el stream y aplica (open-loop).
 *
 * Flujo: gate de matrícula (F1.1b) → si registrada, loop SSE: cada iv seg corre la
 * malla (ape_mesh) y emite 'event: presets' (solo si cambió; si no, heartbeat).
 *
 * AUTOPISTA / CPX21:
 *   - X-Accel-Buffering: no  → nginx NO bufferiza (sin tocar config).
 *   - Bounded: dur ≤120s por conexión → no fija el worker FPM indefinidamente
 *     (pm.max_children=50; el cliente SSE reconecta solo). Para concurrencia masiva,
 *     la versión de escala es content_by_lua (no usa workers FPM) — pendiente.
 *   - Per-sesión, sin estado global. Presets = metadata player-blind, NO STREAM-INF.
 */
require_once '/var/www/html/prisma/lib/list_registry.php';
require_once '/var/www/html/prisma/lib/ape_mesh.php';

// ── SSE headers ──
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');
header('X-Accel-Buffering: no');           // nginx: no buffering for this response
@ini_set('output_buffering', '0');
@ini_set('zlib.output_compression', '0');
@set_time_limit(0);
while (ob_get_level() > 0) { @ob_end_flush(); }

$emit = function ($str) { echo $str; @flush(); };

// ── inputs ──
$file  = isset($_GET['file'])    ? basename($_GET['file'])                               : '';
$token = isset($_GET['list_id']) ? preg_replace('/[^0-9A-Za-z_]/', '', $_GET['list_id'])  : '';
$ch    = isset($_GET['ch'])      ? preg_replace('/[^0-9A-Za-z_.\-]/', '', $_GET['ch'])    : '';
$iv    = max(1, min(10,  (int)(isset($_GET['iv'])  ? $_GET['iv']  : 3)));   // intervalo seg [1..10]
$dur   = max(5, min(120, (int)(isset($_GET['dur']) ? $_GET['dur'] : 60)));  // duración seg [5..120]

// ── F1.1b — gate de activación ──
$rec = null;
try {
    if ($file  !== '') $rec = lr_is_registered($file);
    if (!$rec && $token !== '') $rec = lr_lookup_by_token($token);
} catch (\Throwable $e) { $rec = null; }

if (!$rec) {
    $emit("event: passthrough\ndata: {\"activated\":false,\"matricula\":false,\"reason\":\"not_registered_passthrough\"}\n\n");
    exit;
}
lr_mark_activation($rec['filename']);

list($streamInfo, $health, $ct) = ape_mesh_inputs_from_get();
$chId = $ch !== '' ? $ch : $rec['list_id'];

$emit(": connected list=" . $rec['list_id'] . " ch=" . $chId . "\n\n");
$emit("event: hello\ndata: {\"activated\":true,\"matricula\":true,\"list_id\":\"" . $rec['list_id'] . "\",\"interval\":" . $iv . ",\"duration\":" . $dur . "}\n\n");

$start = time();
$seq = 0;
$lastHash = '';
while ((time() - $start) < $dur) {
    if (connection_aborted()) break;

    $mesh = ape_mesh_presets($chId, $streamInfo, $health, $ct);
    $payload = json_encode(array(
        'seq'          => $seq,
        'list_id'      => $rec['list_id'],
        'channel'      => $chId,
        'content_type' => $ct,
        'engines'      => $mesh['engines'],
        'preset_count' => count($mesh['presets']),
        'presets'      => $mesh['presets'],
    ), JSON_UNESCAPED_SLASHES);

    $h = md5($payload);
    if ($h !== $lastHash) {
        $emit("id: $seq\nevent: presets\ndata: $payload\n\n");   // delta: solo si cambió
        $lastHash = $h;
    } else {
        $emit(": hb $seq\n\n");                                   // heartbeat (sin cambio)
    }
    $seq++;
    if ((time() - $start) >= $dur) break;
    sleep($iv);
}
$emit("event: end\ndata: {\"reason\":\"max_duration\",\"reconnect\":true,\"emitted\":$seq}\n\n");
