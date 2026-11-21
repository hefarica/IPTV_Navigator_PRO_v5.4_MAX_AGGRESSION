<?php
/**
 * manifest-4k.php — Plano A (player) del Canonical 4K Manifest (endpoint URL-2).
 *
 * Lee el SSOT vps/ape-uhdx/ape_4k_manifest.json y renderiza un MASTER playlist que DECLARA 4K
 * (#EXT-X-STREAM-INF RESOLUTION=3840x2160 + hvc1.2.4.L153.B0 + VIDEO-RANGE=PQ + CICP) envolviendo
 * la URL de playback VERBATIM que llega en ?u= (SHIELDED: la variante apunta a esa URL tal cual,
 * jamas reescrita). El player lee 4K; los bytes van directo al proveedor.
 *
 * HONESTO: INERTE mientras el player no rutee por el VPS (hoy OTT/Fire TV va directo). Queda listo
 * para el APK-shield. NO transcode.
 *
 * GET /prisma/api/manifest-4k.php?u=<URL_playback_verbatim>
 *   200 master M3U8  ·  400 si falta/!valida u  ·  503 si SSOT disabled/ilegible
 */
declare(strict_types=1);

function m4k_manifest_path(): string {
    $env = getenv('APE_4K_MANIFEST');
    if (is_string($env) && $env !== '' && @is_file($env)) { return $env; }
    $live = '/etc/ape-uhdx/ape_4k_manifest.json';
    if (@is_file($live)) { return $live; }
    return __DIR__ . '/../../ape-uhdx/ape_4k_manifest.json';
}

header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
header('Cache-Control: no-cache');

$raw = @file_get_contents(m4k_manifest_path());
$m = $raw !== false ? json_decode((string)$raw, true) : null;
if (!is_array($m) || empty($m['enabled'])) {
    http_response_code(503);
    echo "#EXTM3U\n## ape-4k-manifest disabled or unreadable\n";
    exit;
}

// ?u = URL de playback VERBATIM (SHIELDED). Validar esquema; NO transformar.
$u = isset($_GET['u']) ? (string)$_GET['u'] : '';
// SHIELDED: ?u se emite VERBATIM (no se reescribe). Validar esquema http(s) + RECHAZAR cualquier
// control char (CR/LF/etc.) -> cierra CRLF/manifest-injection (un %0A inyectaria un 2do STREAM-INF
// y rompe single-URL anti-509). Council wjxd8ynmw must-fix. No transforma la URL (verbatim intacta).
if ($u === '' || !preg_match('#^https?://#i', $u) || preg_match('/[\x00-\x1f\x7f]/', $u)) {
    http_response_code(400);
    echo "#EXTM3U\n## missing or invalid ?u= (verbatim playback URL required; control chars rejected)\n";
    exit;
}

$streamInf = isset($m['plane_a_player']['stream_inf']) && is_string($m['plane_a_player']['stream_inf'])
    ? $m['plane_a_player']['stream_inf']
    : 'BANDWIDTH=28000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ';

// Master de UNA variante que envuelve la media verbatim. Single URL per channel (anti-509).
$out  = "#EXTM3U\n";
$out .= "#EXT-X-INDEPENDENT-SEGMENTS\n";
$out .= "## ape-4k-manifest v" . (isset($m['version']) ? preg_replace('/[^0-9A-Za-z._\-]/', '', (string)$m['version']) : '?') . " (declare-only; bytes verbatim al proveedor)\n";
$out .= "#EXT-X-STREAM-INF:" . $streamInf . "\n";
$out .= $u . "\n";

echo $out;
