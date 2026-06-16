<?php
/**
 * ape-feedforward.php — F2 router (malla) + gate de activación. One-shot.
 *
 * DOS modos de gate:
 *   - matrícula (file/list_id): lista registrada (F1).
 *   - device-keyed (device): el daemon aplicador-puro se suscribe por device-id; el VPS,
 *     que ya proxea su tráfico, sabe qué canal/decode juega (ape_device_state) y le da los
 *     device_settings honestos. Si no hay estado aún → default seguro (frame-rate match).
 *
 * Salida:
 *   - presets[]       = metadata player-blind (EXT-X-APE-*, EXTVLCOPT, KODIPROP) → llegan al
 *                       player por la LISTA; NUNCA STREAM-INF.
 *   - device_settings[] = lo que el DAEMON aplica vía Android Settings (allowlist). HONESTO.
 */
header('Content-Type: application/json');
header('Cache-Control: no-store');
require_once '/var/www/html/prisma/lib/list_registry.php';
require_once '/var/www/html/prisma/lib/ape_mesh.php';

$file   = isset($_GET['file'])    ? basename($_GET['file'])                               : '';
$token  = isset($_GET['list_id']) ? preg_replace('/[^0-9A-Za-z_]/', '', $_GET['list_id'])  : '';
$device = isset($_GET['device'])  ? preg_replace('/[^0-9A-Za-z_.\-]/', '', $_GET['device']) : '';
$ch     = isset($_GET['ch'])      ? preg_replace('/[^0-9A-Za-z_.\-]/', '', $_GET['ch'])     : '';

// ── gate ──
$rec = null;
try {
    if ($file  !== '') $rec = lr_is_registered($file);
    if (!$rec && $token !== '') $rec = lr_lookup_by_token($token);
} catch (\Throwable $e) { $rec = null; }

if (!$rec && $device === '') {
    echo json_encode(array('activated'=>false, 'matricula'=>false, 'reason'=>'not_registered_passthrough', 'presets'=>array(), 'device_settings'=>array()));
    exit;
}
if ($rec) lr_mark_activation($rec['filename']);

// ── inputs: del GET + (device-keyed) del estado por-device que el VPS correlacionó ──
list($streamInfo, $health, $ct) = ape_mesh_inputs_from_get();
if ($device !== '') {
    $st = ape_device_state($device);
    foreach (array('hdr_type','width','height','codec') as $k) {
        if ((empty($streamInfo[$k]) || $streamInfo[$k]==='') && !empty($st[$k])) $streamInfo[$k] = $st[$k];
    }
    if ($ch === '' && !empty($st['ch'])) $ch = preg_replace('/[^0-9A-Za-z_.\-]/', '', $st['ch']);
}
$chId = $ch !== '' ? $ch : ($rec ? $rec['list_id'] : $device);

// ── F2 malla (presets list-level) + device_settings (lo que el daemon aplica) ──
$mesh = ape_mesh_presets($chId, $streamInfo, $health, $ct);
$device_settings = ape_mesh_device_settings($streamInfo);

echo json_encode(array(
    'activated'       => true,
    'mode'            => $rec ? 'matricula' : 'device',
    'list_id'         => $rec ? $rec['list_id'] : null,
    'device'          => $device !== '' ? $device : null,
    'channel'         => $chId,
    'content_type'    => $ct,
    'engines'         => $mesh['engines'],
    'preset_count'    => count($mesh['presets']),
    'presets'         => $mesh['presets'],
    'device_settings' => $device_settings,
    'note'            => 'presets=list-level (player via lista); device_settings=daemon aplica (allowlist). NO STREAM-INF.',
), JSON_UNESCAPED_SLASHES);
