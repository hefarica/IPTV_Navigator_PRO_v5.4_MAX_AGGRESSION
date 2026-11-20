<?php
/**
 * ape-cartridge-incident.php — PUSH link of the URL-2 cartridge bus (bidirectional).
 *
 * Receives a MEASURED delta from an engine / the device daemon / the ADB-QoE plane and writes it
 * back into the bus so the orchestrator + injector reconcile it on the next tick. This is how the
 * `-VERIFIED:false` flags flip to `true` (a probe/device confirmed a value) and how real telemetry
 * (measured bitrate sustained, judder still present, color still washed) feeds the 9-mission calc.
 *
 * Mirror of channel-pq-incident.php: fire-and-forget friendly (keepalive POST), no-store, NEVER
 * blocks, never mid-stream. Writes to /dev/shm spool the orchestrator tick consumes (edge-first).
 *
 * POST JSON { channel_id, profile?, field, value, verified? }  (or ?channel_id=&field=&value=)
 *   field ∈ {bitrate_bps, memc_level, mpeg_dnr, mpeg2_dnr, deblock, contrast, saturation,
 *            ai_sr, ai_fi_fps, variant_found, codec_verified, ...}
 */
header('Content-Type: application/json');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');

$SPOOL = '/dev/shm/ape_cartridge_incidents.json';   // orchestrator tick drains this

$raw = file_get_contents('php://input');
$in  = json_decode($raw ?: '{}', true);
if (!is_array($in)) $in = array();

$chId  = preg_replace('/[^0-9A-Za-z_.\-]/', '', (string)($in['channel_id'] ?? $_GET['channel_id'] ?? ''));
$prof  = preg_replace('/[^P0-5]/', '', (string)($in['profile'] ?? $_GET['profile'] ?? 'P3'));
$field = preg_replace('/[^a-z0-9_]/', '', (string)($in['field'] ?? $_GET['field'] ?? ''));
$value = $in['value'] ?? ($_GET['value'] ?? null);
$verified = !empty($in['verified']);

if ($chId === '' || $field === '') {
    http_response_code(400);
    echo json_encode(array('ok' => false, 'error' => 'channel_id_and_field_required'));
    exit;
}

// Append the delta atomically to the spool (the orchestrator reconciles it; never blocks the caller).
$delta = array('ts' => time(), 'ch' => $chId, 'profile' => $prof, 'field' => $field,
               'value' => $value, 'verified' => $verified);
$ok = false;
$line = json_encode($delta) . "\n";
// O_APPEND atomic write; silent-fail (autopista: a down spool must never error the caller).
$fh = @fopen($SPOOL, 'a');
if ($fh) {
    if (@flock($fh, LOCK_EX)) { $ok = (@fwrite($fh, $line) !== false); @flock($fh, LOCK_UN); }
    @fclose($fh);
}

echo json_encode(array('ok' => (bool)$ok, 'channel_id' => $chId, 'profile' => $prof,
                       'field' => $field, 'verified' => $verified));
