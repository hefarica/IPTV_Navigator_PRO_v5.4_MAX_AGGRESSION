<?php
/**
 * channel-pq-incident.php — Phase G. Recibe un incidente PQ (pantallazo negro / VST_CRITICAL en un
 * canal con PQ activo) y blacklistea el canal (PQ->SDR) en channel_pq_profile. Espejo de
 * channel-hdcp-incident.php. Fire-and-forget friendly (el browser conviva-qoe-engine lo POSTea con
 * keepalive). NO bloquea, nunca mid-stream. El proximo zap emite VIDEO-RANGE=SDR + hdr_conversion=0
 * SOLO para ese canal (mantiene PQ incondicional en el resto).
 *
 * POST JSON {channel_id, vst_ms?} | o ?channel_id=&vst_ms=
 */
require_once __DIR__ . '/../lib/ape_mesh.php';
header('Content-Type: application/json');
header('Cache-Control: no-store');

$raw = file_get_contents('php://input');
$in  = json_decode($raw ?: '{}', true);
if (!is_array($in)) $in = array();

$chRaw = isset($in['channel_id']) ? $in['channel_id'] : (isset($_GET['channel_id']) ? $_GET['channel_id'] : '');
$chId  = preg_replace('/[^0-9A-Za-z_.\-]/', '', (string)$chRaw);
$vst   = isset($in['vst_ms']) ? (int)$in['vst_ms'] : (isset($in['startup_time_ms']) ? (int)$in['startup_time_ms'] : (int)($_GET['vst_ms'] ?? 0));

if ($chId === '') {
    http_response_code(400);
    echo json_encode(array('ok' => false, 'error' => 'channel_id_required'));
    exit;
}

$ok = function_exists('ape_pq_record_incident') ? ape_pq_record_incident($chId, $vst) : false;
echo json_encode(array('ok' => (bool)$ok, 'channel_id' => $chId, 'pq_level' => 'SDR', 'vst_ms' => $vst));
