<?php
// ══════════════════════════════════════════════════════════════════════════
// APE — SESSION RESOLVE endpoint (MOTOR 3 · persistencia única + per-player)
//
// "Despertado por la URL": cuando el player empieza a reproducir, ape_wake_on_manifest.lua
// (log_by_lua, TTFB=0) ya encoló el canal; el homologador (Motor 1) dejó el canonical_record
// del canal en /dev/shm/ape_canon/<channel_key>.json. ESTE endpoint resuelve, POR SESIÓN,
// la MEJOR config honesta que ESE player puede decodificar (port server-side de Motor 2).
//
// 20+ conexiones: nginx event-driven + PHP-FPM pool. Cada sesión (player distinto) recibe
// su propia respuesta; el record por-canal es COMPARTIDO (no se recalcula por viewer).
//
// SEGURIDAD (reusa el patrón adversarial de ape-match.php):
//   • Bearer por HEADER (no query → no se loguea); hash_equals constant-time vs sha256 guardado.
//   • 403 unificado; 400 si falta device/token. Guard de tamaño + set_time_limit (anti-FPM).
//
// AUTOPISTA: NO proxea vídeo (la URL del proveedor va VERBATIM, intacta). Cómputo <50ms.
// TRUTH-GUARDS: usa la resolución REAL (no fake-4K), piso Main10 con fallback AVC terminal,
//   HDR solo si probado, GOLDEN RULE hvc1 en STREAM-INF, sin headers tóxicos.
// ══════════════════════════════════════════════════════════════════════════
declare(strict_types=1);
@set_time_limit(5);
header('Cache-Control: no-store');
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$BASE     = '/var/www/html/prisma';
$TOKDIR   = $BASE . '/db/ape_agent_tokens';        // <device> => sha256(token) hex
$CANONDIR = '/dev/shm/ape_canon';                  // <channel_key>.json escrito por Motor 1 (wake)
$MAXIN    = 16384;

function sr_clean($v) { return preg_replace('/[^A-Za-z0-9_.\-]/', '', (string)$v); }
// FNV-1a 32-bit EXACTO con SEED → 8 hex. Byte-idéntico al JS (Math.imul, dos seeds). Para ch→_key.
function sr_fnv($s, $seed) { $h = $seed & 0xffffffff; for ($i = 0, $n = strlen($s); $i < $n; $i++) { $h ^= ord($s[$i]); $h = ($h * 0x01000193) & 0xffffffff; } return str_pad(dechex($h), 8, '0', STR_PAD_LEFT); }
function sr_forbidden() { http_response_code(403); echo '{"error":"forbidden"}'; exit; }
function sr_bad($m) { http_response_code(400); echo json_encode(['error' => $m]); exit; }

// ── AUTH (idéntico a ape-match.php) ───────────────────────────────────────────
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['HTTP_X_APE_TOKEN'] ?? '');
$tok  = '';
if (preg_match('/Bearer\s+([A-Za-z0-9]+)/', $auth, $m))        { $tok = $m[1]; }
elseif ($auth !== '' && preg_match('/^[A-Za-z0-9]+$/', $auth)) { $tok = $auth; }
$dev = sr_clean($_GET['device'] ?? '');
if ($dev === '' || $tok === '') { sr_bad('missing device/token'); }
$tokfile = "$TOKDIR/$dev";
if (!is_file($tokfile)) { sr_forbidden(); }
$stored = trim((string)@file_get_contents($tokfile));
if ($stored === '' || !hash_equals($stored, hash('sha256', $tok))) { sr_forbidden(); }

// ── INPUT: session + channel_key + player caps ────────────────────────────────
$body = file_get_contents('php://input', false, null, 0, $MAXIN + 1);
if ($body !== false && strlen($body) > $MAXIN) { sr_bad('payload too large'); }
$in = json_decode((string)$body, true) ?: [];
$session_id  = sr_clean($in['session_id'] ?? ($_GET['session'] ?? ''));
$channel_key = sr_clean($in['channel_key'] ?? ($_GET['channel'] ?? ''));
// ch→_key (council S13): si el daemon/wake manda la URL del canal en vez de _key, lo derivamos
// con FNV-1a(url VERBATIM) — idéntico al homologador (stableKey). Cierra el seam wake(URL)→resolve(_key).
$prov_url = (string)($in['url'] ?? ($_GET['url'] ?? ''));
if ($channel_key === '' && $prov_url !== '') {
    $channel_key = sr_fnv($prov_url, 0x811c9dc5) . sr_fnv($prov_url, 0x12345678);   // key16 dos seeds, == JS
}
if ($channel_key === '') { sr_bad('missing channel_key or url'); }
$player = is_array($in['player'] ?? null) ? $in['player'] : [];
$caps   = is_array($player['caps'] ?? null) ? $player['caps'] : [];

// ── CARGAR el canonical_record COMPARTIDO del canal (Motor 1, /dev/shm) ────────
$canonfile = $CANONDIR . '/' . preg_replace('/[^a-f0-9]/', '', strtolower($channel_key)) . '.json';
$rec = is_file($canonfile) ? (json_decode((string)@file_get_contents($canonfile), true) ?: []) : [];
$C = $rec['C'] ?? []; $D = $rec['D'] ?? []; $E = $rec['E'] ?? [];

// ── SELECT "devuelve lo mejor" (port de Motor 2, mismas reglas) ────────────────
$TOXIC = ['range'=>1,'if-none-match'=>1,'if-modified-since'=>1,'te'=>1,'priority'=>1,'upgrade-insecure-requests'=>1,'dnt'=>1];
$LEVELS = [['L90',854,480,30],['L93',1280,720,30],['L120',1920,1080,30],['L123',1920,1080,60],
           ['L126',1920,1080,120],   // 1080p@120 (Level 4.2) — evita sobre-declarar 4K@120 con MEMC fps=120 (council S6/S3)
           ['L150',3840,2160,30],['L153',3840,2160,60],['L156',3840,2160,120],
           ['L180',7680,4320,30],['L183',7680,4320,60],['L186',7680,4320,120]];
function sr_parse_res($s) { if (preg_match('/(\d{2,5})\s*[xX]\s*(\d{2,5})/', (string)$s, $m)) return ['w'=>(int)$m[1],'h'=>(int)$m[2]]; return null; }
function sr_level($w,$h,$fps,$LEVELS){ foreach($LEVELS as $L){ if($L[1]>=$w && $L[2]>=$h && $L[3]>=$fps) return $L[0]; } return 'L186'; }

$blocked = [];
// DECODE HONESTO (freeze-safe): nivel sigue la resolución REAL (el decoder decodifica el stream real).
$declared = sr_parse_res($C['resolution'] ?? '');
$real     = sr_parse_res($C['resolution_real'] ?? '');
$decode   = $real ?: ($declared ?: ['w'=>1920,'h'=>1080]);
$devRes = sr_parse_res($caps['max_resolution'] ?? '');
if ($devRes && ($devRes['w'] < $decode['w'] || $devRes['h'] < $decode['h'])) { $decode = $devRes; }
$fps = min((int)($C['framerate'] ?? 30) ?: 30, (int)($caps['max_fps'] ?? 120) ?: 120);

// ENHANCEMENT — MÉTODO HEVC CRYSTAL (ape-vps-hevc-crystal-integrator + usuario 2026-06-11):
// "más definición a la señal que llegue, de la forma que sea". SIEMPRE activo, sube un tier
// (sub-4K→4K FAKE, ≥4K→8K) con el set Crystal completo. DIRECTIVA al device (post-decode: su MEMC/SR/SoC
// la aplica; el VPS NO renderiza píxeles). Decode/codec HONESTOS (nivel=resolución real, freeze-safe);
// player incompatible la ignora (RFC 8216 §6.3.1, inerte). NO es claim falso en STREAM-INF.
$hdrMode = $C['hdr_mode'] ?? 'SDR';
$range   = $C['range'] ?? '';
$hdrIntent = ($hdrMode !== 'SDR') ? $hdrMode : (($range === 'PQ' || $range === 'HLG') ? $range : 'SDR');
$atLeast4K = ($decode['w'] >= 3840 && $decode['h'] >= 2160);
$sub4K = !$atLeast4K;                                          // 480p..1080p → TODO al MÁXIMO (usuario 2026-06-11)
$target = $atLeast4K ? ['w'=>7680,'h'=>4320] : ['w'=>3840,'h'=>2160];
$intensity = $sub4K ? 0.92 : 0.80;
$srcIsHDR = ($range === 'PQ' || $range === 'HLG');
$enhancement = [
    'activate' => true, 'method' => 'HEVC-CRYSTAL+CHINA-BOX', 'intensity' => $intensity, 'virtual_uhd' => true,
    'target_resolution' => $target['w'].'x'.$target['h'],
    'upscale_engine' => 'ZSCALE-LANCZOS',
    'super_resolution' => ['ai_sr'=>true, 'model'=>'realesrgan', 'scale'=>$sub4K?4:2, 'strength'=>$sub4K?'max':'strong'],
    'memc' => ['enabled'=>true, 'fps_target'=>120, 'model'=>'rife_v4', 'mode'=>'mci_aobmc'],
    'sharpen' => ['unsharp'=>true, 'luma'=>$sub4K?1.2:1.0, 'chroma'=>0.3],
    'denoise' => ['hqdn3d'=>true, 'nr_low_on_motion'=>true],
    'color' => [
        // IA SDR→HDR (inverse tone-mapping NEURAL) cuando la fuente es SDR
        'ai_sdr2hdr' => ['enabled'=>!$srcIsHDR, 'model'=>'hdrnet_itm', 'strength'=>$sub4K?'max':'strong', 'inverse_tone_map'=>true, 'peak_nits'=>1000, 'expand_gamut'=>true, 'highlight_recovery'=>true],
        'sdr2hdr'=>!$srcIsHDR, 'hdr_target'=>($hdrIntent!=='SDR')?$hdrIntent:'HDR10', 'bt2020'=>true, 'tone_mapping'=>'hable'
    ],
    'bitrate_overdrive' => ['vbr'=>true, 'factor'=>2],
    'china_box' => [
        'propagation' => $sub4K ? 'P0-P5_MAX_480_TO_1080' : 'high_ge_4k',
        'floor_lock' => ['enabled'=>true, 'strength'=>$sub4K?'max':'strong', 'anti_washout'=>true, 'anti_crush'=>true],
        'device_scaler_pref' => ['device_ai_sr','huawei_ai_sr','amlogic','tv_scaler'],
        'virtual_label' => 'virtual_uhd_appearance_intent_private',
        'artifact_suppression' => ['deblock'=>true, 'deband'=>true, 'mosquito'=>true, 'strength'=>$sub4K?'very_strong_guarded':'strong'],
        'motion_and_refresh' => ['memc'=>true, 'refresh_match'=>true, 'judder_guard'=>true],
        'vendor_hints' => ['hdr_policy'=>'sink_or_source_private', 'sdr2hdr_enable'=>'hint_only', 'persist_vendor'=>'hint_only'],
        'source_truth_policy' => 'no_public_pq_hlg_or_uhd_claim_without_probe',
        'validation_guards' => ['fake_hdr_public_blocked'=>true, 'fake_uhd_public_blocked'=>true]
    ],
    'requires_device_engine' => true
];

$lvl = sr_level($decode['w'], $decode['h'], $fps, $LEVELS);
$chain = [];
if (($caps['hevc_main10'] ?? true) !== false) { $chain[] = 'hvc1.2.4.'.$lvl.'.B0'; }
if (!empty($caps['av1']))        { $chain[] = 'av01.0.15M.10'; }
if (!empty($caps['hevc_main8'])) { $chain[] = 'hvc1.1.6.'.$lvl.'.B0'; }
$chain[] = 'avc1.640028';   // rung terminal AVC — NUNCA falta (FREEZELESS)
$chosen = $chain[0];
if (strpos($chosen, 'hvc1.2') === 0 && ($caps['hevc_main10'] ?? true) === false) {
    $chosen = 'avc1.640028';
    foreach ($chain as $c) { if (strpos($c, 'hvc1.2') !== 0) { $chosen = $c; break; } }
}

$headersSafe = [];
foreach (($D['headers'] ?? []) as $k => $v) { if (!isset($TOXIC[strtolower((string)$k)])) { $headersSafe[$k] = $v; } }
foreach (array_keys($E) as $k) {
    if (strpos($k, '_toxic.') === 0) { $blocked[] = 'toxic-header:'.substr($k, 7); }
    if (preg_match('/bypass|sandvine|exploit|spoof|phantom|hydra|circuit-breaker/i', $k . json_encode($E[$k]))) { $blocked[] = 'cubo-E:'.$k; }
}

$verified = !empty($rec['_probe_verified']) || !empty($C['codec_verified']);
$score = 100;
if (!$verified) { $score -= 15; }
if ($blocked) { $score -= min(40, count($blocked) * 8); }
if ($score < 0) { $score = 0; }

echo json_encode([
    'session_id'   => $session_id,
    'channel_key'  => $channel_key,
    'playback_url' => $rec['_provider_url'] ?? '',     // VERBATIM
    'chosen' => [
        'codec' => $chosen,
        'codec_preferred_not_verified' => !$verified,
        'resolution' => $decode['w'].'x'.$decode['h'],   // DECODE real (nivel acorde)
        'framerate'  => $fps,
        'hdr'        => $hdrIntent,                       // intent del catálogo (no se fuerza SDR)
        'enhancement' => $enhancement,                   // upgrade activado para sub-4K
        'buffer_knobs'  => $D['qoe'] ?? new stdClass(),
        'headers_safe'  => $headersSafe ?: new stdClass(),
        'subtitles_link2' => $rec['_subtitles_uri'] ?? null
    ],
    'score'          => $score,
    'fallback_chain' => $chain,
    'blocked'        => $blocked
], JSON_UNESCAPED_SLASHES);
