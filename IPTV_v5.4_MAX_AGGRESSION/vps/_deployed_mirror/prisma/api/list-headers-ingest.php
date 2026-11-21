<?php
/**
 * list-headers-ingest.php — index a list's per-channel HTTP-header ARRAYS into the store.
 *
 * Owner: headers "deben actualizarse como ARRAYS para cada lista". Given a list (by path on the VPS
 * or POSTed body), this parses every channel block, extracts its #EXTHTTP JSON (+ key directives),
 * and upserts the header array keyed by (list_id, channel_id, profile). Re-ingest refreshes the list.
 *
 * Streaming parse (handles the 1GB / 22,595-channel list without loading it all): reads line by line,
 * flushes per channel block. ADITIVO; served by the generic ~ \.php$ location (no nginx touch).
 *
 * POST/GET:
 *   ?list_id=<id>&path=<server_path_to_m3u8>          → ingest a list already on the VPS
 *   POST body = raw m3u8 + ?list_id=<id>              → ingest an uploaded list
 *   ?list_id=<id>&clear=1                             → wipe the list's arrays (before re-ingest)
 */
declare(strict_types=1);
header('Content-Type: application/json');
header('Cache-Control: no-store');
require_once __DIR__ . '/../lib/list_header_store.php';

set_time_limit(0);
ini_set('memory_limit', '256M');

$listId = preg_replace('/[^0-9A-Za-z_\-]/', '', (string)($_GET['list_id'] ?? $_POST['list_id'] ?? ''));
if ($listId === '') { http_response_code(400); echo json_encode(array('ok'=>false,'error'=>'list_id_required')); exit; }

if (!empty($_GET['clear'])) { lhs_clear_list($listId); echo json_encode(array('ok'=>true,'cleared'=>$listId)); exit; }

// ── pick the source: a server path (whitelisted dirs) or the POST body ──
function ihx_open(): array {
    $path = (string)($_GET['path'] ?? $_POST['path'] ?? '');
    if ($path !== '') {
        $real = realpath($path);
        $allowed = array('/var/www/lists', '/var/www/html/lists', '/root', '/tmp', '/dev/shm');
        $ok = false; foreach ($allowed as $a) { if ($real && strpos($real, $a) === 0) { $ok = true; break; } }
        if ($ok && is_readable($real)) { $fh = @fopen($real, 'r'); if ($fh) return array($fh, true); }
        return array(null, false);
    }
    $body = file_get_contents('php://input');
    if ($body !== false && $body !== '') {
        $fh = fopen('php://temp', 'r+'); fwrite($fh, $body); rewind($fh); return array($fh, true);
    }
    return array(null, false);
}

list($fh, $ok) = ihx_open();
if (!$ok || !$fh) { http_response_code(400); echo json_encode(array('ok'=>false,'error'=>'source_unreadable_or_missing')); exit; }

lhs_clear_list($listId);   // fresh ingest = refreshed arrays for this list

// ── streaming per-channel parse ──
$n = 0; $curCh = ''; $curProfile = null; $curHeaders = array(); $inBlock = false;
$flush = function() use (&$curCh, &$curProfile, &$curHeaders, $listId, &$n) {
    if ($curCh !== '' && !empty($curHeaders)) { lhs_put_channel($listId, $curCh, $curProfile, $curHeaders); $n++; }
    $curCh = ''; $curProfile = null; $curHeaders = array();
};

while (($line = fgets($fh)) !== false) {
    $line = rtrim($line, "\r\n");
    if (strpos($line, '#EXTINF') === 0) {
        $flush();                                   // close previous block
        if (preg_match('/tvg-chno="([^"]+)"/', $line, $m)) $curCh = $m[1];
        elseif (preg_match('/tvg-id="([^"]+)"/', $line, $m)) $curCh = $m[1];
        if (preg_match('/ape-profile="(P[0-5])"/', $line, $m)) $curProfile = $m[1];
        $inBlock = true;
    } elseif ($inBlock && strpos($line, '#EXTHTTP:') === 0) {
        $j = json_decode(substr($line, strlen('#EXTHTTP:')), true);
        if (is_array($j)) {
            foreach ($j as $hk => $hv) {
                $hk = preg_replace('/[^A-Za-z0-9\-]/', '', (string)$hk);
                if ($hk === '') continue;
                $curHeaders[$hk] = preg_replace('/[\x00-\x1f\x7f]/', '', (string)$hv);
            }
        }
    }
}
$flush();
fclose($fh);

echo json_encode(array('ok'=>true, 'list_id'=>$listId, 'channels_indexed'=>$n,
                       'store_count'=>lhs_count($listId)), JSON_UNESCAPED_SLASHES);
