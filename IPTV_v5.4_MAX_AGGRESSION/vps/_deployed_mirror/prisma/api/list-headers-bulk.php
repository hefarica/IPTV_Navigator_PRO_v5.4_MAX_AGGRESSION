<?php
/**
 * list-headers-bulk.php — serve the per-channel / per-profile header ARRAYS of a list.
 *
 * Owner: headers "servidos POR CANAL O PERFIL ... como arrays para cada lista". Mirror of
 * channel-pq-bulk.php / channel-image-bulk.php: read-only, no-store, silent-fail.
 *
 * GET:
 *   ?list_id=<id>&ch=<channel_id>         → {header:value,...} for that channel (profile fallback)
 *   ?list_id=<id>&profile=P0..P5          → {channel_id:{headers...},...} for that profile
 *   ?list_id=<id>                         → {channel_id:{headers...},...} for the whole list (bulk)
 *   &as=headers                           → ALSO emit each header as a real HTTP response header
 */
declare(strict_types=1);
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
require_once __DIR__ . '/../lib/list_header_store.php';

$listId  = preg_replace('/[^0-9A-Za-z_\-]/', '', (string)($_GET['list_id'] ?? ''));
$ch      = preg_replace('/[^0-9A-Za-z_.\-]/', '', (string)($_GET['ch'] ?? ''));
$profile = preg_replace('/[^P0-5]/', '', (string)($_GET['profile'] ?? ''));
$asHeaders = (($_GET['as'] ?? '') === 'headers');
$sports    = !empty($_GET['sports']);

if ($listId === '') { header('Content-Type: application/json'); http_response_code(400); echo json_encode(array('ok'=>false,'error'=>'list_id_required')); exit; }

if ($ch !== '') {
    // por canal: NOMBRES de la lista + VALORES live (spool Lua 2s, con guarda de staleness)
    $h = lhs_get_channel_live($listId, $ch, $profile !== '' ? $profile : null, $sports);
} elseif ($profile !== '') {
    $h = lhs_bulk($listId, $profile);
} else {
    $h = lhs_bulk($listId);
}

// optionally emit each (single-channel) header as a REAL HTTP response header
if ($asHeaders && $ch !== '') {
    $BLOCK = array('set-cookie','location','content-length','transfer-encoding','connection','host');
    foreach ($h as $hk => $hv) {
        $hk = preg_replace('/[^A-Za-z0-9\-]/', '', (string)$hk);
        if ($hk === '' || in_array(strtolower($hk), $BLOCK, true)) continue;
        header($hk . ': ' . preg_replace('/[\x00-\x1f\x7f]/', '', (string)$hv), true);
    }
    header('X-APE-List-Headers-Count: ' . count($h));
}

header('Content-Type: application/json');
echo json_encode($h, JSON_UNESCAPED_SLASHES);
