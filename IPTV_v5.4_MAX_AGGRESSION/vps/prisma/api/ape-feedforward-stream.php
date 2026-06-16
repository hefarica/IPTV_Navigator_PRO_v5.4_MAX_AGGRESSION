<?php
/**
 * ape-feedforward-stream.php — F3: bus URL-2 en STREAMING (SSE). DEVICE-KEYED o matrícula.
 *
 * El daemon aplicador-puro se suscribe por ?device=<id> y SOLO aplica lo que llega
 * (event: presets → campo device_settings). El VPS (que proxea el tráfico del device) sabe
 * qué juega vía ape_device_state y le da los settings honestos; si no hay estado → default seguro.
 *
 * AUTOPISTA/CPX21: X-Accel-Buffering:no (nginx no bufferiza), bounded (dur≤120s → reconecta),
 * pm.max_children=50 (headroom). Escala masiva = content_by_lua (pendiente).
 */
require_once '/var/www/html/prisma/lib/list_registry.php';
require_once '/var/www/html/prisma/lib/ape_mesh.php';

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');
header('X-Accel-Buffering: no');
@ini_set('output_buffering', '0');
@ini_set('zlib.output_compression', '0');
@set_time_limit(0);
while (ob_get_level() > 0) { @ob_end_flush(); }
$emit = function ($s) { echo $s; @flush(); };

$file   = isset($_GET['file'])    ? basename($_GET['file'])                               : '';
$token  = isset($_GET['list_id']) ? preg_replace('/[^0-9A-Za-z_]/', '', $_GET['list_id'])  : '';
$device = isset($_GET['device'])  ? preg_replace('/[^0-9A-Za-z_.\-]/', '', $_GET['device']) : '';
$ch     = isset($_GET['ch'])      ? preg_replace('/[^0-9A-Za-z_.\-]/', '', $_GET['ch'])     : '';
$iv     = max(1, min(10,  (int)(isset($_GET['iv'])  ? $_GET['iv']  : 3)));
$dur    = max(5, min(120, (int)(isset($_GET['dur']) ? $_GET['dur'] : 60)));

// ── gate (matrícula o device-keyed) ──
$rec = null;
try {
    if ($file  !== '') $rec = lr_is_registered($file);
    if (!$rec && $token !== '') $rec = lr_lookup_by_token($token);
} catch (\Throwable $e) { $rec = null; }

if (!$rec && $device === '') {
    $emit("event: passthrough\ndata: {\"activated\":false,\"reason\":\"not_registered_passthrough\"}\n\n");
    exit;
}
if ($rec) lr_mark_activation($rec['filename']);

list($streamInfo, $health, $ct) = ape_mesh_inputs_from_get();
$keyLabel = $rec ? $rec['list_id'] : $device;
$emit(": connected mode=" . ($rec ? 'matricula' : 'device') . " key=" . $keyLabel . "\n\n");
$emit("event: hello\ndata: {\"activated\":true,\"mode\":\"" . ($rec ? 'matricula' : 'device') . "\",\"interval\":" . $iv . ",\"duration\":" . $dur . "}\n\n");

$start = time(); $seq = 0; $lastHash = '';
while ((time() - $start) < $dur) {
    if (connection_aborted()) break;

    // device-keyed: refrescar streamInfo/ch del estado por-device en cada tick (puede cambiar de canal)
    $si = $streamInfo; $chId = $ch;
    if ($device !== '') {
        $st = ape_device_state($device);
        foreach (array('hdr_type','width','height','codec') as $k) {
            if ((empty($si[$k]) || $si[$k]==='') && !empty($st[$k])) $si[$k] = $st[$k];
        }
        if ($chId === '' && !empty($st['ch'])) $chId = preg_replace('/[^0-9A-Za-z_.\-]/', '', $st['ch']);
    }
    if ($chId === '') $chId = $keyLabel;

    $mesh = ape_mesh_presets($chId, $si, $health, $ct);
    $device_settings = ape_mesh_device_settings($si);
    $payload = json_encode(array(
        'seq'             => $seq,
        'mode'            => $rec ? 'matricula' : 'device',
        'channel'         => $chId,
        'engines'         => $mesh['engines'],
        'preset_count'    => count($mesh['presets']),
        'presets'         => $mesh['presets'],
        'device_settings' => $device_settings,
    ), JSON_UNESCAPED_SLASHES);

    $h = md5($payload);
    if ($h !== $lastHash) { $emit("id: $seq\nevent: presets\ndata: $payload\n\n"); $lastHash = $h; }
    else { $emit(": hb $seq\n\n"); }
    $seq++;
    if ((time() - $start) >= $dur) break;
    sleep($iv);
}
$emit("event: end\ndata: {\"reason\":\"max_duration\",\"reconnect\":true,\"emitted\":$seq}\n\n");
