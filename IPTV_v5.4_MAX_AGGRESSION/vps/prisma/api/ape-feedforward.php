<?php
/**
 * ape-feedforward.php — F2 router (malla descentralizada) + F1.1b gate de activación
 *
 * Flujo (per-sesión, por URL-2):
 *   1) GATE de MATRÍCULA: ¿la lista está registrada (F1.0)? Si no → passthrough.
 *   2) Si sí → marca activación + fan-out a los motores DECISORES (no transcode).
 *   3) Devuelve el bundle de PRESETS (metadata player-blind: #EXT-X-APE-* / #EXTVLCOPT).
 *
 * DOCTRINA:
 *   - El VPS NO transcodifica (CPX21). Los presets son metadata; el render real es on-device.
 *   - Presets = hints player-blind (RFC 8216 §6.3.1) — el daemon on-device los aplica.
 *     NUNCA van en STREAM-INF (anti fake-HDR/4K).
 *   - Per-sesión, sin estado global (evita cross-talk de cachés /tmp de otros motores).
 *   - ADITIVO: servido por el location ~ \.php$ genérico (sin tocar nginx).
 */
header('Content-Type: application/json');
header('Cache-Control: no-store');
require_once '/var/www/html/prisma/lib/list_registry.php';

$MODULES = '/var/www/html/cmaf_engine/modules/';

// ── inputs (los empuja el player por URL-2) ──
$file  = isset($_GET['file'])    ? basename($_GET['file'])                              : '';
$token = isset($_GET['list_id']) ? preg_replace('/[^0-9A-Za-z_]/', '', $_GET['list_id']) : '';
$ch    = isset($_GET['ch'])      ? preg_replace('/[^0-9A-Za-z_.\-]/', '', $_GET['ch'])   : '';
$ct    = (isset($_GET['ct']) && in_array($_GET['ct'], array('sports','cinema','news','default'), true)) ? $_GET['ct'] : 'default';

// ── F1.1b — GATE de activación (matrícula) ──
$rec = null;
try {
    if ($file  !== '') $rec = lr_is_registered($file);
    if (!$rec && $token !== '') $rec = lr_lookup_by_token($token);
} catch (\Throwable $e) { $rec = null; }

if (!$rec) {
    echo json_encode(array('activated'=>false, 'matricula'=>false, 'reason'=>'not_registered_passthrough', 'presets'=>array()));
    exit;
}
lr_mark_activation($rec['filename']);

// ── F2 — fan-out a la malla de motores DECISORES (lib reusable) ──
require_once '/var/www/html/prisma/lib/ape_mesh.php';
list($streamInfo, $health, $ct) = ape_mesh_inputs_from_get();
$chId = $ch !== '' ? $ch : $rec['list_id'];
$mesh    = ape_mesh_presets($chId, $streamInfo, $health, $ct);
$engines = $mesh['engines'];
$presets = $mesh['presets'];

echo json_encode(array(
    'activated'    => true,
    'matricula'    => true,
    'list_id'      => $rec['list_id'],
    'filename'     => $rec['filename'],
    'channel'      => $chId,
    'content_type' => $ct,
    'engines'      => $engines,
    'preset_count' => count($presets),
    'presets'      => $presets,
    'note'         => 'feed-forward presets: metadata player-blind (#EXT-X-APE-*/#EXTVLCOPT), on-device aplica; NO en STREAM-INF',
), JSON_UNESCAPED_SLASHES);
