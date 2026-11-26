<?php
/**
 * ape-cartridge-agent.php — HTTP AGENT (API) for OTT Navigator (and any HTTP player).
 *
 * OTT Navigator's only API is the HTTP playlist pull. This endpoint IS that agent: given a
 * channel's VERBATIM playback URL + profile, it serves a per-channel M3U block enriched with the
 * LIVE 9-MISSION matrix (HEVC/bitrate/judder/DNR/deblock/color/upscale/fps/variant-hunt) computed
 * by the never-sleep orchestrator (ape_cartridge_orchestrator.lua) and exposed via
 * ape-cartridge-bulk.php. So OTT pulls this over HTTP and receives the live calc per channel.
 *
 * Mirror of manifest-4k.php: Content-Type mpegurl, CRLF-injection-safe ?u=, SHIELDED verbatim URL
 * (NEVER rewritten), NO transcode. FREEZELESS: if the missions are unavailable, the static cartridge
 * still serves (graceful). RFC 8216 §4.2 — players ignore the #EXT-X-APE-* tags they don't grok.
 *
 * MULTI-FORMAT (owner: "todo lo que sea posible enviar en forma de header y directiva .JSON, HTTP, PHP"):
 *   • M3U tags     — the per-channel cartridge block (default)
 *   • HTTP headers — every mission also emitted as X-APE-Mission-* response headers
 *   • JSON         — ?format=json returns the full mission matrix as a JSON directive
 * So any HTTP agent reads the missions by ALL means: headers, JSON body, or M3U directives.
 *
 * GET /prisma/api/ape-cartridge-agent.php?u=<verbatim_url>&profile=P0..P5[&ch=<id>][&name=<n>][&sports=1][&format=json]
 *   200 M3U block (or JSON)  ·  400 bad/missing u  ·  (missions absent → block still served)
 */
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache');

$wantJson = (($_GET['format'] ?? '') === 'json');

// ── inputs (CRLF-injection rejected, exactly like manifest-4k.php) ──
$u = isset($_GET['u']) ? (string)$_GET['u'] : '';
if (!$wantJson && ($u === '' || !preg_match('#^https?://#i', $u) || preg_match('/[\x00-\x1f\x7f]/', $u))) {
    header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
    http_response_code(400);
    echo "#EXTM3U\n## missing or invalid ?u= (verbatim playback URL required; control chars rejected)\n";
    exit;
}
$profile = preg_replace('/[^P0-5]/', '', (string)($_GET['profile'] ?? 'P3')) ?: 'P3';
$ch      = preg_replace('/[^0-9A-Za-z_.\-]/', '', (string)($_GET['ch'] ?? '0'));
$name    = preg_replace('/[\x00-\x1f\x7f]/', '', (string)($_GET['name'] ?? ("Channel " . $ch)));
$sports  = !empty($_GET['sports']);

// ── THE LIST'S OWN HEADERS — serve the per-channel #EXTHTTP block AS REAL HTTP HEADERS ──
// Owner: "qué headers, los de la lista, deben ser servidos de manera que el HTTP cliente los reciba
// con sus valores". The list's #EXTHTTP:{...} JSON (55 headers: X-APE-*, User-Agent, X-Device-*,
// X-VMAF-Target, X-Buffer-*, etc.) is emitted here as actual HTTP response headers — so an HTTP
// agent receives every one with its value. Source priority:
//   1) ?exthttp=<base64(json)>  (POST body or GET) — the literal #EXTHTTP block of the channel
//   2) per-channel cached headers by ?ch= (channel-image/pq style bulk, future)
// CRLF-injection-safe: header name + value scrubbed of control chars; never emit Set-Cookie/Location.
$listHeaders = array();
$BLOCK = array('set-cookie','location','content-length','transfer-encoding','connection','host');
$ingest = function(array $j) use (&$listHeaders, $BLOCK) {
    foreach ($j as $hk => $hv) {
        $hk = preg_replace('/[^A-Za-z0-9\-]/', '', (string)$hk);            // header-name charset
        if ($hk === '' || in_array(strtolower($hk), $BLOCK, true)) { continue; }
        $listHeaders[$hk] = preg_replace('/[\x00-\x1f\x7f]/', '', (string)$hv); // no CR/LF injection
    }
};
// Source 1 (PREFERRED): the per-list / per-channel(or-profile) header ARRAY store (refreshed per list).
$listId = preg_replace('/[^0-9A-Za-z_\-]/', '', (string)($_GET['list_id'] ?? ''));
if ($listId !== '') {
    require_once __DIR__ . '/../lib/list_header_store.php';
    $stored = ($ch !== '' && $ch !== '0')
        ? lhs_get_channel_live($listId, $ch, $profile, $sports)   // por canal: NOMBRES lista + VALORES live (2s)
        : lhs_get_profile_live($listId, $profile, $sports);       // por perfil: idem
    if (is_array($stored) && $stored) { $ingest($stored); }
}
// Source 2 (fallback): a literal #EXTHTTP block passed inline (base64 or raw JSON).
$ehRaw = $_POST['exthttp'] ?? $_GET['exthttp'] ?? '';
if ($ehRaw !== '' && empty($listHeaders)) {
    $decoded = base64_decode((string)$ehRaw, true);
    if ($decoded === false) { $decoded = (string)$ehRaw; }
    $j = json_decode($decoded, true);
    if (is_array($j)) { $ingest($j); }
}

// ── pull the LIVE 9-mission matrix for this profile from the orchestrator (via the bulk endpoint) ──
// Edge-local: ape-cartridge-bulk.php reads the orchestrator spool/defaults. Never blocks (short timeout).
function cart_missions(string $profile): array {
    $base = (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://127.0.0.1';
    $ctx  = stream_context_create(['http' => ['timeout' => 2, 'ignore_errors' => true],
                                   'ssl'  => ['verify_peer' => false, 'verify_peer_name' => false]]);
    $url  = $base . '/prisma/api/ape-cartridge-bulk.php?profile=' . urlencode($profile);
    $raw  = @file_get_contents($url, false, $ctx);
    $j    = $raw !== false ? json_decode((string)$raw, true) : null;
    return is_array($j) ? $j : array();
}
$m = cart_missions($profile);
// sports → bump MEMC to max (orchestrator differentiates; mirror it here if sports requested)
if ($sports && isset($m['memc_level'])) { $m['memc_level'] = 3; }

// HEVC-first per-profile codec (Cardinal-correct; máxima calidad SIEMPRE)
// HEVC-first Cardinal-correct ladder (8K=L183, 4K@120=L156, 4K@60=L153, 1080p=L123). Prefer the
// orchestrator's live cr_codec/cr_resolution when present (8K EXTREME fusion); fall back to the ladder.
$CODEC = array('P0'=>'hvc1.2.4.L183.B0','P1'=>'hvc1.2.4.L156.B0','P2'=>'hvc1.2.4.L153.B0',
               'P3'=>'hvc1.2.4.L153.B0','P4'=>'hvc1.2.4.L123.B0','P5'=>'hvc1.2.4.L120.B0');
$RES   = array('P0'=>'7680x4320','P1'=>'3840x2160','P2'=>'3840x2160','P3'=>'3840x2160','P4'=>'1920x1080','P5'=>'1920x1080');
$codec = (string)($m['cr_codec'] ?? $CODEC[$profile]);
$res   = (string)($m['cr_resolution'] ?? $RES[$profile]);
$bw    = (int)($m['bitrate_bps'] ?? 12000000);

// ── normalize the mission set (so headers + JSON + M3U all carry the SAME values) ──
$missions = array(
    'hevc_forced'  => (int)($m['hevc_forced'] ?? 1),
    'bitrate_bps'  => (int)($m['bitrate_bps'] ?? $bw),
    'memc_level'   => (int)($m['memc_level'] ?? 2),
    'judder_match' => (int)($m['judder_match'] ?? 1),
    'mpeg_dnr'     => (int)($m['mpeg_dnr'] ?? 0),
    'mpeg2_dnr'    => (int)($m['mpeg2_dnr'] ?? 0),
    'temporal_dnr' => (int)($m['temporal_dnr'] ?? 0),
    'deblock'      => (int)($m['deblock'] ?? 0),
    'contrast'     => (int)($m['contrast'] ?? 50),
    'saturation'   => (int)($m['saturation'] ?? 50),
    'vibrance'     => (int)($m['vibrance'] ?? 0),
    'ai_sr'        => (int)($m['ai_sr'] ?? 0),
    'ai_sr_model'  => (string)($m['ai_sr_model'] ?? 'realesrgan'),
    'ai_fi_fps'    => (int)($m['ai_fi_fps'] ?? 60),
    'ai_fi_model'  => (string)($m['ai_fi_model'] ?? 'rife_v4'),
    'variant_hunt' => (int)($m['variant_hunt'] ?? 1),
    'bw_state'     => (string)($m['bw_state'] ?? 'UNKNOWN'),
    'codec'        => $codec, 'resolution' => $res, 'profile' => $profile,
);
// 8K EXTREME fusion: surface EVERY live field the orchestrator computes (sdr_to_hdr, hdr_mode,
// max_cll/fall, mdcv, oled_*, lcevc*, cmaf, llhls*, cr_*, dv, ai_sr_scale) in JSON + headers too.
if (is_array($m)) { $missions = array_merge($m, $missions); }

// ── (1a) THE LIST'S OWN HEADERS — the #EXTHTTP block served as REAL HTTP response headers ──
// Every header the list carries for this channel (X-APE-*, User-Agent, X-Device-*, X-VMAF-Target,
// X-Buffer-*, ...) is emitted with its value, so the HTTP client receives them exactly.
foreach ($listHeaders as $hk => $hv) {
    header($hk . ': ' . $hv, true);
}
header('X-APE-List-Headers-Count: ' . count($listHeaders));

// ── (1b) HTTP RESPONSE HEADERS — every mission as X-APE-Mission-* (todo por header) ──
foreach ($missions as $hk => $hv) {
    $hname = 'X-APE-Mission-' . str_replace('_', '-', $hk);
    // header values: control chars stripped (no CRLF injection)
    header($hname . ': ' . preg_replace('/[\x00-\x1f\x7f]/', '', (string)$hv));
}
header('X-APE-Mission-Codec: ' . $codec);
header('X-APE-Mission-Resolution: ' . $res);

// ── (2) JSON directive — ?format=json returns the full matrix (todo por .JSON) ──
if ($wantJson) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array('ok' => true, 'channel_id' => $ch, 'profile' => $profile,
                           'playback_url' => $u, 'missions' => $missions,
                           'list_headers' => $listHeaders), JSON_UNESCAPED_SLASHES);
    exit;
}

header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');

// ── render the per-channel block (OTT pulls this) ──
$out = array();
$out[] = '#EXTM3U';
$out[] = '#EXTINF:-1 tvg-id="' . $ch . '" tvg-chno="' . $ch . '" ape-profile="' . $profile
       . '" ape-codec-family="hevc",' . $name;

// the live 9-mission lines (EXT-X-APE-* daemon + EXTVLCOPT VLC + KODIPROP Kodi)
if (!empty($m)) {
    $g = function($k, $d) use ($m) { return $m[$k] ?? $d; };
    $out[] = '#EXT-X-APE-MISSION-HEVC-FORCED:' . $g('hevc_forced', 1);
    $out[] = '#EXT-X-APE-MISSION-BITRATE:' . $g('bitrate_bps', $bw);
    $out[] = '#EXT-X-APE-MISSION-MEMC:' . $g('memc_level', 2);
    $out[] = '#EXT-X-APE-MISSION-JUDDER-MATCH:' . $g('judder_match', 1);
    $out[] = '#EXT-X-APE-MISSION-MPEG-DNR:' . $g('mpeg_dnr', 0);
    $out[] = '#EXT-X-APE-MISSION-MPEG2-DNR:' . $g('mpeg2_dnr', 0);
    $out[] = '#EXT-X-APE-MISSION-TEMPORAL-DNR:' . $g('temporal_dnr', 0);
    $out[] = '#EXT-X-APE-MISSION-DEBLOCK:' . $g('deblock', 0);
    $out[] = '#EXT-X-APE-MISSION-CONTRAST:' . $g('contrast', 50);
    $out[] = '#EXT-X-APE-MISSION-SATURATION:' . $g('saturation', 50);
    $out[] = '#EXT-X-APE-MISSION-VIBRANCE:' . $g('vibrance', 0);
    $out[] = '#EXT-X-APE-MISSION-AI-SR:' . $g('ai_sr', 0) . ',MODEL=' . $g('ai_sr_model', 'realesrgan');
    $out[] = '#EXT-X-APE-MISSION-AI-FI-FPS:' . $g('ai_fi_fps', 60) . ',MODEL=' . $g('ai_fi_model', 'rife_v4');
    $out[] = '#EXT-X-APE-MISSION-VARIANT-HUNT:' . $g('variant_hunt', 1);
    $out[] = '#EXT-X-APE-MISSION-SOURCE:vps-orchestrator-live,bw_state=' . $g('bw_state', 'UNKNOWN');

    // ═══ APE CRYSTAL 8K EXTREME — capacidades fusionadas (TODOS los perfiles P0–P5) ═══
    // SDR→HDR ITM
    $out[] = '#EXT-X-APE-SDR2HDR:' . $g('sdr_to_hdr', 1) . ',MODE=' . $g('hdr_mode', 'HDR10') . ',ITM=' . $g('itm_method', 'inverse_tone_mapping_pq');
    // HDR mastering metadata (MaxCLL / MaxFALL / MDCV) + content-light-level
    $out[] = '#EXT-X-APE-MAX-CLL:' . $g('max_cll', 600);
    $out[] = '#EXT-X-APE-MAX-FALL:' . $g('max_fall', 240);
    $out[] = '#EXT-X-APE-MDCV:' . $g('mdcv', '');
    $out[] = '#EXT-X-CONTENT-LIGHT-LEVEL:' . $g('max_cll', 600) . ',' . $g('max_fall', 240);
    // OLED black/contrast (local dimming + PQ tone curve)
    $out[] = '#EXT-X-APE-OLED-LOCAL-DIMMING:' . $g('oled_local_dimming', 1);
    $out[] = '#EXT-X-APE-OLED-BRIGHTNESS:' . $g('oled_brightness', 80);
    // LCEVC enhancement (signal only — NEVER SUPPLEMENTAL-CODECS)
    $out[] = '#EXT-X-APE-LCEVC:' . $g('lcevc', 1) . ',STRENGTH=' . $g('lcevc_strength', 2);
    // CMAF / LL-HLS (signal only — never a fake EXT-X-MAP)
    $out[] = '#EXT-X-APE-CMAF:' . $g('cmaf', 1);
    $out[] = '#EXT-X-APE-LLHLS:' . $g('llhls', 1) . ',PART-TARGET=' . $g('llhls_part_target', 0.2);
    // Dolby Vision codec string (runtime hint — GOLDEN RULE: NOT in STREAM-INF)
    $out[] = '#EXT-X-APE-DV-CODEC:' . $g('cr_dv_codec', 'dvh1.05.04');
    // AI-SR scale max per tier
    $out[] = '#EXT-X-APE-AI-SR-SCALE:' . $g('ai_sr_scale', 1);

    // VLC (real decode filters) + Kodi (ISA) — incl. las nuevas capacidades
    $k = (float)($m['k'] ?? 0.58);
    $out[] = '#EXTVLCOPT:video-filter=hqdn3d,unsharp,pp=ac/dr,minterpolate';
    $out[] = '#EXTVLCOPT:sharpen-sigma=' . number_format(0.1 + 0.4 * $k, 2);
    $out[] = '#EXTVLCOPT:tone-mapping=hable';
    $out[] = '#EXTVLCOPT:video-color-primaries=bt2020';
    $out[] = '#EXTVLCOPT:video-transfer-function=smpte2084';
    $out[] = '#KODIPROP:inputstream.adaptive.video_ai_sr=true';
    $out[] = '#KODIPROP:inputstream.adaptive.video_ai_sr_scale=' . $g('ai_sr_scale', 1);
    $out[] = '#KODIPROP:inputstream.adaptive.video_ai_fi_fps=' . $g('ai_fi_fps', 60);
    $out[] = '#KODIPROP:inputstream.adaptive.hdr_mode=' . $g('hdr_mode', 'HDR10');
    $out[] = '#KODIPROP:inputstream.adaptive.video_lcevc=true';
    $out[] = '#KODIPROP:inputstream.adaptive.video_lcevc_phase=' . $g('lcevc_strength', 2);
}
// forced máxima-calidad HEVC STREAM-INF (Cardinal-correct)
$out[] = '#EXT-X-STREAM-INF:BANDWIDTH=' . $bw . ',RESOLUTION=' . $res
       . ',CODECS="' . $codec . ',mp4a.40.2",VIDEO-RANGE=PQ,HDCP-LEVEL=TYPE-1,STABLE-VARIANT-ID="' . $ch . '_' . $profile . '"';
// SHIELDED: the verbatim playback URL, NEVER rewritten
$out[] = $u;

echo implode("\n", $out) . "\n";
