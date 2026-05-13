<?php
declare(strict_types=1);
// ── CMAF Integration Shim (APE CMAF Engine v2.0) ─────────────────────────────
if (file_exists(__DIR__ . '/cmaf_engine/cmaf_integration_shim.php')) {
    require_once __DIR__ . '/cmaf_engine/cmaf_integration_shim.php';
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gold Standard Dual Runtime Resolver (v16.1.0) — Production
 * Domain: iptv-ape.duckdns.org
 *
 * Input:  /resolve.php?ch=14&p=auto&mode=auto&list=16.1.0&sig=HFRC-20260222-REV-A
 * Output: M3U fragment:
 *   #EXTM3U
 *   #EXTINF (video-track / bl-video-track / codec)
 *   #EXTHTTP (minimal headers)
 *   final Xtream URL + ?token=...
 *
 * #EXTATTRFROMURL is resolved at playback time by OTT Navigator.
 */

$start = microtime(true);

// ═══════════════════════════════════════════════════════════════════════════
// ORIGINS REGISTRY — Scalable multi-origin credentials
// Add new origins here as one line each. Key = host(:port).
// The generator passes &origin=HOST via EXTATTRFROMURL, resolver looks up creds here.
// ═══════════════════════════════════════════════════════════════════════════
const ORIGINS = [
    // host                              user              pass
    ['line.tivi-ott.net',               '3JHFTC',         'U56BDP'],
    ['line.dndnscloud.ru',              'f828e5e261',     'e1372a7053f1'],
    ['126958958431.4k-26com.com:80',    'ujgd4kiltx',     'p5c00kxjc7'],
    // Add new origins below:
    // ['new.host.com:8080',            'newuser',        'newpass'],
];

// Default origin (first entry in ORIGINS)
const DEFAULT_ORIGIN = ORIGINS[0][0];
const DEFAULT_USER   = ORIGINS[0][1];
const DEFAULT_PASS   = ORIGINS[0][2];

const TOKEN_TTL = 120;

// OJO: Usa 'hmac' solo si TU infraestructura valida ese token (o si sabes que tu origin lo acepta).
// Si el origin NO lo usa y rechaza query params desconocidos, pon 'none'.
const TOKEN_MODE = 'none'; // none | hmac | passthrough
const TOKEN_SECRET = 'CAMBIA_ESTE_SECRETO_LARGO_Y_UNICO';

const CHANNEL_MAP_PATH = __DIR__ . '/channels_map.json';
const CHANNEL_MAP_TTL_SECONDS = 30;

const REQUIRE_SIG = false;
const EXPECTED_SIG = 'HFRC-20260222-REV-A';

const ACCEPT_HEADER =
    'application/vnd.apple.mpegurl;q=1.0, audio/mpegurl;q=0.99, application/x-mpegurl;q=0.97, application/x-m3u8;q=0.95, text/plain;q=0.8, */*;q=0.1';
const ACCEPT_ENCODING = 'gzip, deflate';

function q(string $k, string $default = ''): string {
    return isset($_GET[$k]) ? trim((string)$_GET[$k]) : $default;
}

function base64url(string $bin): string {
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function token_hmac(string $ch, string $profile, int $exp, string $deviceClass): string {
    $payload = json_encode(['ch'=>$ch,'p'=>$profile,'exp'=>$exp,'dc'=>$deviceClass], JSON_UNESCAPED_SLASHES);
    $sig = hash_hmac('sha256', $payload, TOKEN_SECRET, true);
    return base64url($payload) . '.' . base64url($sig);
}

function token_passthrough(string $ch, string $profile): string {
    // Implementa aquí si tienes un broker/token real del proveedor.
    return '';
}

function normalizeProfile(string $pReq): string {
    return match ($pReq) {
        'p0' => 'P0',
        'p1' => 'P1',
        'p2' => 'P2',
        'p3' => 'P3',
        'p4' => 'P4',
        'p5' => 'P5',
        default => 'AUTO',
    };
}

function autoProfile(string $ch): string {
    $c = strtoupper($ch);
    
    if (str_contains($c, '8K') || str_contains($c, '4320')) return 'P1';
    if (str_contains($c, 'UHD') || str_contains($c, '4K') || str_contains($c, '2160')) return 'P2';
    if (str_contains($c, 'FHD') || str_contains($c, '1080')) return 'P3';
    if (str_contains($c, 'HD') || str_contains($c, '720')) return 'P4';
    if (str_contains($c, 'SD') || str_contains($c, '480')) return 'P5';
    
    // Default fallback to FHD to avoid unnecessary downgrades if unknown
    return 'P3';
}

function loadChannelMap(?string $listId = null): array {
    static $cache = [];
    static $cacheTs = [];

    $now = time();
    $cacheKey = $listId ?? 'global';

    if (isset($cache[$cacheKey]) && ($now - ($cacheTs[$cacheKey] ?? 0)) < CHANNEL_MAP_TTL_SECONDS) {
        return $cache[$cacheKey];
    }

    $mapPath = CHANNEL_MAP_PATH;
    if ($listId !== null && preg_match('/^[A-Za-z0-9._-]{1,128}$/', $listId)) {
        $testPath = __DIR__ . '/' . $listId . '.channels_map.json';
        if (is_file($testPath)) {
            $mapPath = $testPath;
        }
    }

    if (!is_file($mapPath)) {
        $cache[$cacheKey] = [];
        $cacheTs[$cacheKey] = $now;
        return [];
    }

    $raw = file_get_contents($mapPath);
    if ($raw === false) {
        $cache[$cacheKey] = [];
        $cacheTs[$cacheKey] = $now;
        return [];
    }

    $json = json_decode($raw, true);
    if (!is_array($json)) {
        $cache[$cacheKey] = [];
        $cacheTs[$cacheKey] = $now;
        return [];
    }

    $cache[$cacheKey] = $json;
    $cacheTs[$cacheKey] = $now;
    return $json;
}

function mapDecision(string $ch, array $map): ?array {
    return (isset($map[$ch]) && is_array($map[$ch])) ? $map[$ch] : null;
}

// -------------------------------
// 1) INPUT
// -------------------------------
$ch     = q('ch', '');
$pReq   = strtolower(q('p', 'auto'));
$mode   = q('mode', 'auto');
$sig    = q('sig', '');
$origin = q('origin', '');  // host:port from generator (multi-origin support)

if ($ch === '') {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo "ERR: missing ch\n";
    exit;
}
if (REQUIRE_SIG && $sig !== EXPECTED_SIG) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo "ERR: invalid sig\n";
    exit;
}
if (!preg_match('/^[A-Za-z0-9._-]{1,64}$/', $ch)) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo "ERR: invalid ch format\n";
    exit;
}

// CORS (opcional)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: *');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// -------------------------------
// 2) DEVICE CLASS → UA estable (contrato)
// -------------------------------
$uaIn = $_SERVER['HTTP_USER_AGENT'] ?? '';
$deviceClass = 'generic_tv';
if (stripos($uaIn, 'AFT') !== false) $deviceClass = 'firetv_4k';
elseif (stripos($uaIn, 'Android TV') !== false || stripos($uaIn, 'Leanback') !== false) $deviceClass = 'onn_4k';

$UA_FIRETV_4K_MAX = 'Mozilla/5.0 (Linux; Android 11; AFTKM) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
$UA_ONN_4K        = 'Mozilla/5.0 (Linux; Android 12; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
$UA_GENERIC_TV    = 'Mozilla/5.0 (Linux; Android 11; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

$uaOut = match ($deviceClass) {
    'firetv_4k' => $UA_FIRETV_4K_MAX,
    'onn_4k'    => $UA_ONN_4K,
    default     => $UA_GENERIC_TV,
};

// -------------------------------
// 3) PROFILE CFG
// -------------------------------
// ═══════════════════════════════════════════════════════════════════════
// APE v9.0 DUAL-SOURCE PARITY — Mirrors m3u8-typed-arrays-ultimate.js
// ═══════════════════════════════════════════════════════════════════════

function generateUuid(): string {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

function generateRandomString(int $len = 16): string {
    return bin2hex(random_bytes((int)ceil($len / 2)));
}

// ═══════════════════════════════════════════════════════════════════════
// PROFILES P0-P5 — EXACT COPY from m3u8-typed-arrays-ultimate.js PROFILES
// Every field mirrors the JS generator for dual-source parity.
// ═══════════════════════════════════════════════════════════════════════
$profileCfg = [
    'P0' => [
        'name'=>'ULTRA_EXTREME', 'label'=>'4K ULTRA',
        'res'=>'3840x2160', 'w'=>3840, 'h'=>2160, 'fps'=>60,
        'bitrate'=>13400, 'buffer_ms'=>50000,
        'net_cache'=>60000, 'live_cache'=>60000, 'file_cache'=>15000,
        'max_bw'=>100000000, 'min_bw'=>50000000,
        'prefetch_seg'=>500, 'prefetch_par'=>250, 'prefetch_buf'=>600000,
        'seg_dur'=>2, 'bw_guarantee'=>500,
        'codec_primary'=>'HEVC', 'codec_fallback'=>'HEVC', 'codec_priority'=>'hevc,h265,H265,h.265,av1,vp9',
        'hdr'=>['hdr10','dolby_vision','hlg'], 'color_depth'=>12, 'audio_ch'=>8,
        'recon_timeout'=>5, 'recon_max'=>200, 'recon_delay'=>0,
        'hevc_tier'=>'HIGH', 'hevc_level'=>'6.1,5.1,5.0,4.1,4.0,3.1', 'hevc_profile'=>'MAIN-10-HDR',
        'color_space'=>'BT2020', 'chroma'=>'4:2:0', 'transfer'=>'SMPTE2084',
        'matrix'=>'BT2020NC', 'compress'=>1, 'sharpen'=>0.02,
        'rate_ctrl'=>'VBR', 'entropy'=>'CABAC', 'vid_profile'=>'main10', 'pix_fmt'=>'yuv420p10le',
        'codec'=>'hard,system,soft_vlc',
    ],
    'P1' => [
        'name'=>'8K_SUPREME', 'label'=>'8K SUPREME',
        'res'=>'7680x4320', 'w'=>7680, 'h'=>4320, 'fps'=>60,
        'bitrate'=>42900, 'buffer_ms'=>40000,
        'net_cache'=>50000, 'live_cache'=>50000, 'file_cache'=>12000,
        'max_bw'=>80000000, 'min_bw'=>40000000,
        'prefetch_seg'=>400, 'prefetch_par'=>200, 'prefetch_buf'=>500000,
        'seg_dur'=>2, 'bw_guarantee'=>400,
        'codec_primary'=>'HEVC', 'codec_fallback'=>'HEVC', 'codec_priority'=>'hevc,h265,H265,h.265,av1,vp9',
        'hdr'=>['hdr10','hdr10+','dolby_vision','hlg'], 'color_depth'=>10, 'audio_ch'=>8,
        'recon_timeout'=>5, 'recon_max'=>200, 'recon_delay'=>0,
        'hevc_tier'=>'HIGH', 'hevc_level'=>'6.1,5.1,5.0,4.1,4.0,3.1', 'hevc_profile'=>'MAIN-10-HDR',
        'color_space'=>'BT2020', 'chroma'=>'4:2:0', 'transfer'=>'SMPTE2084',
        'matrix'=>'BT2020NC', 'compress'=>1, 'sharpen'=>0.02,
        'rate_ctrl'=>'VBR', 'entropy'=>'CABAC', 'vid_profile'=>'main10', 'pix_fmt'=>'yuv420p10le',
        'codec'=>'hard,system,soft_vlc',
    ],
    'P2' => [
        'name'=>'4K_EXTREME', 'label'=>'4K EXTREME',
        'res'=>'3840x2160', 'w'=>3840, 'h'=>2160, 'fps'=>60,
        'bitrate'=>13400, 'buffer_ms'=>35000,
        'net_cache'=>45000, 'live_cache'=>45000, 'file_cache'=>10000,
        'max_bw'=>60000000, 'min_bw'=>20000000,
        'prefetch_seg'=>350, 'prefetch_par'=>180, 'prefetch_buf'=>450000,
        'seg_dur'=>2, 'bw_guarantee'=>350,
        'codec_primary'=>'HEVC', 'codec_fallback'=>'HEVC', 'codec_priority'=>'hevc,h265,H265,h.265,av1,vp9',
        'hdr'=>['hdr10','hdr10+','dolby_vision','hlg'], 'color_depth'=>10, 'audio_ch'=>6,
        'recon_timeout'=>5, 'recon_max'=>200, 'recon_delay'=>0,
        'hevc_tier'=>'HIGH', 'hevc_level'=>'6.1,5.1,5.0,4.1,4.0,3.1', 'hevc_profile'=>'MAIN-10-HDR',
        'color_space'=>'BT2020', 'chroma'=>'4:2:0', 'transfer'=>'SMPTE2084',
        'matrix'=>'BT2020NC', 'compress'=>1, 'sharpen'=>0.03,
        'rate_ctrl'=>'VBR', 'entropy'=>'CABAC', 'vid_profile'=>'main10', 'pix_fmt'=>'yuv420p10le',
        'codec'=>'hard,system,soft_vlc',
    ],
    'P3' => [
        'name'=>'FHD_ADVANCED', 'label'=>'FHD ADVANCED',
        'res'=>'1920x1080', 'w'=>1920, 'h'=>1080, 'fps'=>50,
        'bitrate'=>3700, 'buffer_ms'=>30000,
        'net_cache'=>40000, 'live_cache'=>40000, 'file_cache'=>8000,
        'max_bw'=>20000000, 'min_bw'=>5000000,
        'prefetch_seg'=>300, 'prefetch_par'=>150, 'prefetch_buf'=>400000,
        'seg_dur'=>2, 'bw_guarantee'=>300,
        'codec_primary'=>'HEVC', 'codec_fallback'=>'H264', 'codec_priority'=>'hevc,h265,H265,h.265,h264',
        'hdr'=>[], 'color_depth'=>10, 'audio_ch'=>6,
        'recon_timeout'=>5, 'recon_max'=>200, 'recon_delay'=>0,
        'hevc_tier'=>'HIGH', 'hevc_level'=>'6.1,5.1,5.0,4.1,4.0,3.1', 'hevc_profile'=>'MAIN-10',
        'color_space'=>'BT709', 'chroma'=>'4:2:0', 'transfer'=>'BT1886',
        'matrix'=>'BT709', 'compress'=>1, 'sharpen'=>0.03,
        'rate_ctrl'=>'VBR', 'entropy'=>'CABAC', 'vid_profile'=>'main10', 'pix_fmt'=>'yuv420p10le',
        'codec'=>'hard,system,soft_vlc',
    ],
    'P4' => [
        'name'=>'HD_STABLE', 'label'=>'HD STABLE',
        'res'=>'1280x720', 'w'=>1280, 'h'=>720, 'fps'=>60,
        'bitrate'=>2800, 'buffer_ms'=>25000,
        'net_cache'=>35000, 'live_cache'=>35000, 'file_cache'=>7000,
        'max_bw'=>10000000, 'min_bw'=>2000000,
        'prefetch_seg'=>250, 'prefetch_par'=>120, 'prefetch_buf'=>350000,
        'seg_dur'=>2, 'bw_guarantee'=>250,
        'codec_primary'=>'HEVC', 'codec_fallback'=>'H264', 'codec_priority'=>'hevc,h265,H265,h.265,h264',
        'hdr'=>[], 'color_depth'=>8, 'audio_ch'=>2,
        'recon_timeout'=>5, 'recon_max'=>200, 'recon_delay'=>0,
        'hevc_tier'=>'MAIN', 'hevc_level'=>'6.1,5.1,5.0,4.1,4.0,3.1', 'hevc_profile'=>'MAIN',
        'color_space'=>'BT709', 'chroma'=>'4:2:0', 'transfer'=>'BT1886',
        'matrix'=>'BT709', 'compress'=>1, 'sharpen'=>0.05,
        'rate_ctrl'=>'VBR', 'entropy'=>'CABAC', 'vid_profile'=>'main', 'pix_fmt'=>'yuv420p',
        'codec'=>'hard,system,soft_vlc',
    ],
    'P5' => [
        'name'=>'SD_FAILSAFE', 'label'=>'SD FAILSAFE',
        'res'=>'854x480', 'w'=>854, 'h'=>480, 'fps'=>25,
        'bitrate'=>1500, 'buffer_ms'=>20000,
        'net_cache'=>30000, 'live_cache'=>30000, 'file_cache'=>5000,
        'max_bw'=>5000000, 'min_bw'=>500000,
        'prefetch_seg'=>200, 'prefetch_par'=>100, 'prefetch_buf'=>300000,
        'seg_dur'=>2, 'bw_guarantee'=>200,
        'codec_primary'=>'HEVC', 'codec_fallback'=>'H264', 'codec_priority'=>'hevc,h265,H265,h.265,h264',
        'hdr'=>[], 'color_depth'=>8, 'audio_ch'=>2,
        'recon_timeout'=>5, 'recon_max'=>200, 'recon_delay'=>0,
        'hevc_tier'=>'MAIN', 'hevc_level'=>'6.1,5.1,5.0,4.1,4.0,3.1', 'hevc_profile'=>'MAIN',
        'color_space'=>'BT709', 'chroma'=>'4:2:0', 'transfer'=>'BT1886',
        'matrix'=>'BT709', 'compress'=>1, 'sharpen'=>0.05,
        'rate_ctrl'=>'VBR', 'entropy'=>'CABAC', 'vid_profile'=>'main', 'pix_fmt'=>'yuv420p',
        'codec'=>'hard,system,soft_vlc',
    ],
];

$pNorm = normalizeProfile($pReq);

// --- PRECEDENCIA FINAL ---
$listId = q('list', '');
$map = loadChannelMap($listId !== '' ? $listId : null);
$decision = mapDecision($ch, $map);

// ── CMAF Interception Point (APE CMAF Engine v2.0) ───────────────────────────
if (class_exists('CmafIntegrationShim')) {
    $cmafResult = CmafIntegrationShim::intercept($ch, $decision ?? []);
    if ($cmafResult !== null) { echo $cmafResult; exit; }
}
// ─────────────────────────────────────────────────────────────────────────────

$labelOverride = null;

// 1. Explicit profile request (e.g., &p=P1) wins.
if ($pNorm !== 'AUTO') {
    $profile = $pNorm;
} else {
    // 2. Profile is AUTO. 
    // Is the channel name screaming High Quality (UHD/4K/8K)?
    $autoStr = autoProfile($ch);
    // 3. What does the mapping say?
    $mapProfile = ($decision !== null && isset($decision['profile'])) ? strtoupper((string)$decision['profile']) : null;
    
    // 4. Combat the Map Downgrade: if autoProfile detects 4K/8K, it overrides a P3/P4 map.
    if (in_array($autoStr, ['P0', 'P1']) && $mapProfile && in_array($mapProfile, ['P3','P4','P5'])) {
        $profile = $autoStr; // Rescue the 4K!
    } elseif ($mapProfile) {
        $profile = $mapProfile; // Map is respected if not actively sabotaging a 4K name
    } else {
        $profile = $autoStr; // No map, rely totally on autoProfile
    }
    
    if ($decision !== null && isset($decision['label'])) {
        $labelOverride = $decision['label'];
    }
}

if (!isset($profileCfg[$profile])) $profile = 'P4';


$cfg = $profileCfg[$profile];

// 🌐 PROTOCOLO SSOT pm9_resolution: Override Absoluto de Resolución
// Si el frontend envía la resolución matemáticamente por URL, esta es la LEY,
// e impide que los perfiles usen sus defaults posiblemente inferiores.
$teleRes = q('res', '');
if ($teleRes !== '') {
    $cfg['res'] = $teleRes;
}

// 🌐 Sincronización Universal: Catch Mathematical Arrays from Frontend
// If teleported vars exist on URL, they take supreme priority
$teleBw    = q('bw', '');
$teleBuf   = q('buf', '');
$teleTh1   = q('th1', '');
$teleTh2   = q('th2', '');
$telePfseg = q('pfseg', '');
$telePfpar = q('pfpar', '');
$teleTbw   = q('tbw', '');

if ($teleBw !== '')    $cfg['max_bw']       = (int)$teleBw;
if ($teleBuf !== '')   $cfg['buffer_ms']    = (int)$teleBuf;
if ($teleTh1 !== '')   $cfg['throughput_t1']= (float)$teleTh1;
if ($teleTh2 !== '')   $cfg['throughput_t2']= (float)$teleTh2;
if ($telePfseg !== '') $cfg['prefetch_seg'] = (int)$telePfseg;
if ($telePfpar !== '') $cfg['prefetch_par'] = (int)$telePfpar;
if ($teleTbw !== '')   $cfg['bitrate']      = (int)($teleTbw / 1000);

// 🗺️ Telemetry Map Fallback: If URL parameters are missing, but mapping has math telemetry, use it
if ($teleBw === '' && $decision !== null && isset($decision['math_telemetry'])) {
    $mathMap = $decision['math_telemetry'];
    if (isset($mathMap['bw']))    $cfg['max_bw']       = (int)$mathMap['bw'];
    if (isset($mathMap['buf']))   $cfg['buffer_ms']    = (int)$mathMap['buf'];
    if (isset($mathMap['th1']))   $cfg['throughput_t1']= (float)$mathMap['th1'];
    if (isset($mathMap['th2']))   $cfg['throughput_t2']= (float)$mathMap['th2'];
    if (isset($mathMap['pfseg'])) $cfg['prefetch_seg'] = (int)$mathMap['pfseg'];
    if (isset($mathMap['pfpar'])) $cfg['prefetch_par'] = (int)$mathMap['pfpar'];
    if (isset($mathMap['tbw']))   $cfg['bitrate']      = (int)($mathMap['tbw'] / 1000);
}

$hdrEnabled = !empty($cfg['hdr']);
// 4) TOKEN
// -------------------------------
$exp = time() + TOKEN_TTL;
$token = '';
if (TOKEN_MODE === 'hmac') $token = token_hmac($ch, $profile, $exp, $deviceClass);
elseif (TOKEN_MODE === 'passthrough') $token = token_passthrough($ch, $profile);

// -------------------------------
// 5) URL final
// -------------------------------
function resolveOrigin(string $host): array {
    foreach (ORIGINS as $entry) {
        if ($entry[0] === $host) return ['host' => $entry[0], 'user' => $entry[1], 'pass' => $entry[2]];
    }
    return ['host' => DEFAULT_ORIGIN, 'user' => DEFAULT_USER, 'pass' => DEFAULT_PASS];
}

$requestedHost = DEFAULT_ORIGIN;
if ($origin !== '' && preg_match('/^[A-Za-z0-9._:-]{1,128}$/', $origin)) $requestedHost = $origin;
if ($decision !== null && isset($decision['origin']) && is_string($decision['origin'])) $requestedHost = $decision['origin'];

$resolved = resolveOrigin($requestedHost);
$effectiveHost = $resolved['host'];
$effectiveUser = $resolved['user'];
$effectivePass = $resolved['pass'];
if ($decision !== null && isset($decision['user'])) $effectiveUser = $decision['user'];
if ($decision !== null && isset($decision['pass'])) $effectivePass = $decision['pass'];

$streamId = $ch;
if ($decision !== null && isset($decision['stream_id']) && $decision['stream_id'] !== '') $streamId = (string)$decision['stream_id'];

// 🌐 PROTOCOLO SID-MISMATCH PREVENTION (Gold Standard)
// Si el generador JS envió un stream_id numérico explícito, este es el Rey absoluto.
// Evita que un slug (como skysportsmainevent.uk) resuelva a una variante de menor calidad.
$sidParam = q('sid', '');
if ($sidParam !== '' && preg_match('/^\d+$/', $sidParam)) {
    $streamId = $sidParam;
}

$baseUrl = "http://" . $effectiveHost . "/live/" . rawurlencode((string)$effectiveUser) . "/" . rawurlencode((string)$effectivePass) . "/" . rawurlencode((string)$streamId) . ".m3u8";
$finalUrl = ($token !== '') ? ($baseUrl . '?token=' . rawurlencode($token)) : $baseUrl;
$referer = "http://" . $effectiveHost . "/";
$originUrl = "http://" . $effectiveHost;

// ═══════════════════════════════════════════════════════════════════════
// 6) BUILD #EXTHTTP — 80+ headers (PARITY with JS exthttpHEVC object)
// ═══════════════════════════════════════════════════════════════════════
$sessionId = 'SES_' . generateRandomString(16);
$deviceId = 'DEV_' . generateRandomString(12);
$requestId = 'REQ_' . generateRandomString(16);
$timestamp = (string)time();

$exthttp = [
    // ── HEVC Optimization ──
    "X-HEVC-Tier"              => $cfg['hevc_tier'],
    "X-HEVC-Level"             => $cfg['hevc_level'],
    "X-HEVC-Profile"           => $cfg['hevc_profile'],
    "X-Video-Profile"          => $cfg['vid_profile'],
    "X-Color-Space"            => $cfg['color_space'],
    "X-Chroma-Subsampling"     => $cfg['chroma'],
    "X-HDR-Transfer-Function"  => $cfg['transfer'],
    "X-Matrix-Coefficients"    => $cfg['matrix'],
    "X-Compression-Level"      => (string)$cfg['compress'],
    "X-Sharpen-Sigma"          => (string)$cfg['sharpen'],
    "X-Rate-Control"           => $cfg['rate_ctrl'],
    "X-Entropy-Coding"         => $cfg['entropy'],
    "X-Pixel-Format"           => $cfg['pix_fmt'],
    "X-Color-Depth"            => (string)$cfg['color_depth'],
    // ── Buffer & Caching ──
    "X-Network-Caching"        => (string)$cfg['net_cache'],
    "X-Live-Caching"           => (string)$cfg['live_cache'],
    "X-File-Caching"           => (string)$cfg['file_cache'],
    "X-Buffer-Strategy"        => $mode,
    "X-Buffer-Ms"              => (string)$cfg['buffer_ms'],
    "X-Buffer-Target"          => (string)$cfg['buffer_ms'],
    "X-Buffer-Min"             => "500", // HYBRID DOUBLE-ENDED BUFFER (Latencia Rayo punta Inicial)
    "X-Buffer-Max"             => (string)round($cfg['buffer_ms'] * 4), // 4x headroom
    // ── Prefetch ──
    "X-Prefetch-Segments"      => (string)$cfg['prefetch_seg'],
    "X-Prefetch-Parallel"      => (string)$cfg['prefetch_par'],
    "X-Prefetch-Buffer-Target" => (string)$cfg['prefetch_buf'],
    "X-Prefetch-Strategy"      => "ULTRA_AGRESIVO_ILIMITADO",
    "X-Prefetch-Enabled"       => "true,adaptive,auto",
    // ── Reconnect ──
    "X-Reconnect-Timeout-Ms"   => (string)$cfg['recon_timeout'],
    "X-Reconnect-Max-Attempts" => (string)$cfg['recon_max'],
    "X-Reconnect-Delay-Ms"     => (string)$cfg['recon_delay'],
    "X-Reconnect-On-Error"     => "true,immediate,adaptive",
    // ── Segment ──
    "X-Segment-Duration"       => (string)$cfg['seg_dur'],
    "X-Bandwidth-Guarantee"    => (string)$cfg['bw_guarantee'],
    // ── APE Engine Core ──
    "X-App-Version"            => "APE_16.1.0-CLEAN-URL-ARCHITECTURE",
    "X-Playback-Session-Id"    => $sessionId,
    "X-Device-Id"              => $deviceId,
    "X-Stream-Type"            => "hls",
    "X-Quality-Preference"     => "codec-" . strtolower($cfg['codec_primary']) . ",profile-" . $cfg['vid_profile'] . ",tier-" . strtolower($cfg['hevc_tier']),
    // ── Playback Avanzado ──
    "X-Playback-Rate"          => "1.0,1.25,1.5",
    "X-Min-Buffer-Time"        => "0.5,1,2", // HYBRID NOBEL: Startup at 500ms
    "X-Max-Buffer-Time"        => "8,12,30", // HYBRID NOBEL: Build asymptotic safety net of 30 seconds
    "X-Request-Priority"       => "ultra-high-critical",
    // ── Codecs & DRM ──
    "X-Video-Codecs"           => $cfg['codec_priority'],
    "X-Codec-Support"          => $cfg['codec_priority'],
    "X-Audio-Codecs"           => "opus,aac,eac3,ac3,dolby,mp3",
    "X-DRM-Support"            => "widevine,playready,fairplay",
    // ── CDN & Failover ──
    "X-CDN-Provider"           => "auto",
    "X-Failover-Enabled"       => "true",
    "X-Buffer-Size"            => (string)intval($cfg['max_bw'] / 550),
    // ── Metadata & Tracking ──
    "X-Client-Timestamp"       => $timestamp,
    "X-Request-Id"             => $requestId,
    "X-Device-Type"            => "smart-tv",
    "X-Screen-Resolution"      => $cfg['res'],
    "X-Network-Type"           => "wifi",
    // ── Critical Headers (Sync with Origin) ──
    "User-Agent"               => $uaOut,
    "Origin"                   => "http://" . $effectiveHost,
    "Referer"                  => "http://" . $effectiveHost . "/",
    "Accept"                   => ACCEPT_HEADER,
    "Accept-Encoding"          => ACCEPT_ENCODING,
    // ── OTT Navigator Compat ──
    "X-OTT-Navigator-Version"  => "1.7.0.0-aggressive-extreme",
    "X-Player-Type"            => "exoplayer-ultra-extreme,vlc-pro",
    "X-Hardware-Decode"        => "true",
    "X-Audio-Track-Selection"  => "highest-quality-extreme,dolby-atmos-first",
    "X-Subtitle-Track-Selection"=> "off",
    "X-EPG-Sync"               => "enabled",
    "X-Catchup-Support"        => "flussonic-ultra",
    // ── Streaming Control ──
    "X-Bandwidth-Estimation"   => "adaptive,balanced,conservative",
    "X-Initial-Bitrate"        => "50000000,60000000,80000000",
    "X-Retry-Count"            => "10,12,15",
    "X-Retry-Delay-Ms"         => "120,200,350",
    "X-Connection-Timeout-Ms"  => "2500,3500,6000",
    "X-Read-Timeout-Ms"        => "6000,9000,12000",
    // ── Security ──
    "X-Country-Code"           => "US",
    // ── HDR & Color ──
    "X-HDR-Support"            => $hdrEnabled ? implode(',', $cfg['hdr']) : 'none',
    "X-Dynamic-Range"          => $hdrEnabled ? "hdr" : "sdr",
    "X-Color-Primaries"        => $cfg['color_space'] === 'BT2020' ? "bt2020" : "bt709",
    // ── Resolution Advanced ──
    "X-Max-Resolution"         => $cfg['res'],
    "X-Max-Bitrate"            => (string)$cfg['max_bw'],
    "X-Frame-Rates"            => "24,25,30,50,60,120",
    "X-Aspect-Ratio"           => "16:9,21:9",
    "X-Pixel-Aspect-Ratio"     => "1:1",
    // ── Audio Premium ──
    "X-Dolby-Atmos"            => $cfg['audio_ch'] >= 6 ? "true" : "false",
    "X-Audio-Channels"         => $cfg['audio_ch'] >= 6 ? "7.1,5.1,2.0" : "2.0",
    "X-Audio-Sample-Rate"      => "48000,96000",
    "X-Audio-Bit-Depth"        => "24bit",
    "X-Spatial-Audio"          => $cfg['audio_ch'] >= 6 ? "true" : "false",
    "X-Audio-Passthrough"      => "true",
    // ── Parallel Downloads ──
    "X-Parallel-Segments"      => "2,3,4",
    "X-Segment-Preload"        => "true",
    "X-Concurrent-Downloads"   => "2,3,4",
    // ── Anti-Corte / Failover ──
    "X-Buffer-Underrun-Strategy"=> "adaptive-prefetch",
    "X-Seamless-Failover"      => "true-ultra",
    // ── ABR Control Avanzado ──
    "X-Bandwidth-Preference"   => "unlimited",
    "X-BW-Estimation-Window"   => "10",
    "X-BW-Confidence-Threshold"=> "0.95",
    "X-BW-Smooth-Factor"       => "0.05",
    "X-Packet-Loss-Monitor"    => "enabled,aggressive",
    "X-RTT-Monitoring"         => "enabled,aggressive",
       "X-Congestion-Detect"      => "enabled",
];

// ═══════════════════════════════════════════════════════════════════
// 6B) LCEVC ENHANCEMENT LAYER HEADERS (APE v1.0.0)
// Condicional: solo se añaden si el canal tiene lcevc_enabled=true
// en channels_map.json y el player no es Safari/AVPlayer.
// ═══════════════════════════════════════════════════════════════════
$lcevcHeaders = [];
$chMapEntry   = $map[$ch] ?? [];
if (!empty($chMapEntry['lcevc_enabled'])) {
    $lcevcEngineFile   = __DIR__ . '/cmaf_engine/modules/lcevc_state_engine.php';
    $lcevcDetectorFile = __DIR__ . '/cmaf_engine/modules/lcevc_player_detector.php';
    if (file_exists($lcevcEngineFile) && file_exists($lcevcDetectorFile)) {
        require_once $lcevcEngineFile;
        require_once $lcevcDetectorFile;
        $playerInfo  = LcevcPlayerDetector::detect();
        $lcevcState  = LcevcStateEngine::resolveState($chMapEntry, $playerInfo['player_name']);
        $lcevcHeaders = LcevcStateEngine::buildResponseHeaders($lcevcState, $chMapEntry);
    } else {
        // Fallback básico si los módulos no están disponibles
        $lcevcHeaders = [
            'X-LCEVC-State'      => 'SIGNAL_ONLY',
            'X-LCEVC-Enabled'    => '1',
            'X-LCEVC-Mode'       => strtoupper($chMapEntry['lcevc_mode'] ?? 'SEI_METADATA'),
            'X-LCEVC-Base-Codec' => strtoupper($chMapEntry['lcevc_base_codec'] ?? 'H264'),
            'X-LCEVC-Fallback'   => strtoupper($chMapEntry['lcevc_fallback'] ?? 'BASE_ONLY'),
        ];
    }
    $exthttp = array_merge($exthttp, $lcevcHeaders);
}

// ═══════════════════════════════════════════════════════════════════
// 7) BUILD #EXTVLCOPT — 63 lines (PARITY with JS generateEXTVLCOPT)
// ═══════════════════════════════════════════════════════════════════════
$codec_lc = strtolower($cfg['codec_primary']);
$file_cache_div6 = intval($cfg['file_cache'] / 6);
$mtu = min(65535, intval($cfg['max_bw'] / 100));

$vlcopt = [];

// SECCIÓN 1: USER-AGENT Y HEADERS (9 líneas)
$vlcopt[] = "#EXTVLCOPT:http-user-agent=" . $uaOut;
$vlcopt[] = "#EXTVLCOPT:http-referrer=" . $referer;
$vlcopt[] = "#EXTVLCOPT:http-accept=*/*";
$vlcopt[] = "#EXTVLCOPT:http-accept-language=en-US,en;q=0.9,es;q=0.8";
$vlcopt[] = "#EXTVLCOPT:http-accept-encoding=gzip, deflate";
$vlcopt[] = "#EXTVLCOPT:http-connection=keep-alive";
$vlcopt[] = "#EXTVLCOPT:http-cache-control=no-cache";
$vlcopt[] = "#EXTVLCOPT:http-pragma=no-cache";

// SECCIÓN 1B: HEADERS HTTP COMPLETOS
// C8 (2026-05-11) — http-header:Range / If-None-Match / Priority eliminados.
// Mismo bug que EXTHTTP: el player traduce EXTVLCOPT:http-header:* a request headers
// outbound. If-None-Match: * → CDN devuelve 304 + 0 bytes → okhttp "unexpected end
// of stream on com.android.okhttp.Address". Range en m3u8 manifest detona 206 con
// Content-Range mal calculado en algunos paneles. Priority RFC 9218 sobre HTTP/1.1
// confunde parsers Xtream. Ver memoria feedback_exthttp_traps.md trampa #9.
$vlcopt[] = "#EXTVLCOPT:http-header:Connection=keep-alive";
$vlcopt[] = "#EXTVLCOPT:http-header:Keep-Alive=timeout=300, max=1000";
// $vlcopt[] = "#EXTVLCOPT:http-header:Range=bytes=0-";        // C8 removed
// $vlcopt[] = "#EXTVLCOPT:http-header:If-None-Match=*";       // C8 removed (ASESINO)
$vlcopt[] = "#EXTVLCOPT:http-header:Origin=" . $originUrl;
$vlcopt[] = "#EXTVLCOPT:http-header:Referer=" . $referer;
// $vlcopt[] = "#EXTVLCOPT:http-header:Priority=u=1, i";       // C8 removed
$vlcopt[] = "#EXTVLCOPT:network-caching-dscp=46"; // 🚀 Latencia Rayo QoS: Instar al ISP a considerar estos paquetes como Expedited Forwarding

// SECCIÓN 2: CACHÉ Y SINCRONIZACIÓN (9 líneas)
$vlcopt[] = "#EXTVLCOPT:network-caching=" . $cfg['net_cache'];
$vlcopt[] = "#EXTVLCOPT:live-caching=" . $cfg['live_cache'];
$vlcopt[] = "#EXTVLCOPT:file-caching=" . $cfg['file_cache'];
$vlcopt[] = "#EXTVLCOPT:clock-jitter=0";
$vlcopt[] = "#EXTVLCOPT:clock-synchro=0";
$vlcopt[] = "#EXTVLCOPT:sout-mux-caching=" . $file_cache_div6;
$vlcopt[] = "#EXTVLCOPT:sout-audio-sync=1";
$vlcopt[] = "#EXTVLCOPT:sout-video-sync=1";
$vlcopt[] = "#EXTVLCOPT:disc-caching=" . $file_cache_div6;

// SECCIÓN 2B: OPTIMIZACIÓN TLS (8 líneas)
$vlcopt[] = "#EXTVLCOPT:http-tls-version=1.0";
$vlcopt[] = "#EXTVLCOPT:gnutls-priorities=PERFORMANCE:%SERVER_PRECEDENCE";
$vlcopt[] = "#EXTVLCOPT:http-tls-session-resumption=true";
$vlcopt[] = "#EXTVLCOPT:http-ssl-verify-peer=false";
$vlcopt[] = "#EXTVLCOPT:http-ssl-verify-host=false";
$vlcopt[] = "#EXTVLCOPT:http-tls-handshake-timeout=5000";
$vlcopt[] = "#EXTVLCOPT:http-persistent=true";
$vlcopt[] = "#EXTVLCOPT:http-max-connections=3";

// SECCIÓN 3: DECODIFICACIÓN Y HARDWARE (13 líneas)
$vlcopt[] = "#EXTVLCOPT:avcodec-hw=any";
$vlcopt[] = "#EXTVLCOPT:avcodec-threads=0";
$vlcopt[] = "#EXTVLCOPT:avcodec-fast=0";              // Quality over speed
$vlcopt[] = "#EXTVLCOPT:avcodec-skiploopfilter=0";    // Never skip loop filter
$vlcopt[] = "#EXTVLCOPT:avcodec-hurry-up=0";          // Never rush decode
$vlcopt[] = "#EXTVLCOPT:avcodec-skip-frame=0";
$vlcopt[] = "#EXTVLCOPT:avcodec-skip-idct=0";
$vlcopt[] = "#EXTVLCOPT:sout-avcodec-strict=-2";
$vlcopt[] = "#EXTVLCOPT:ffmpeg-threads=0";
$vlcopt[] = "#EXTVLCOPT:avcodec-codec=" . $codec_lc;
$vlcopt[] = "#EXTVLCOPT:sout-video-codec=" . $codec_lc;
$vlcopt[] = "#EXTVLCOPT:audio-channels=" . $cfg['audio_ch'];
$vlcopt[] = "#EXTVLCOPT:audiotrack-passthrough=" . ($cfg['audio_ch'] >= 6 ? 'true' : 'false');
$vlcopt[] = "#EXTVLCOPT:adaptive-maxbw=" . $cfg['max_bw'];
$vlcopt[] = "#EXTVLCOPT:http-max-retries=" . $cfg['recon_max'];
$vlcopt[] = "#EXTVLCOPT:http-timeout=6000";

// SECCIÓN 4: CALIDAD DE VIDEO — FORCE HIGHEST RESOLUTION
// ⚠️ FIX v6.4: NEVER cap resolution. Force maximum always.
$vlcopt[] = "#EXTVLCOPT:preferred-resolution=-1";    // -1 = ALWAYS HIGHEST AVAILABLE
$vlcopt[] = "#EXTVLCOPT:adaptive-maxwidth=3840";      // Force 4K width
$vlcopt[] = "#EXTVLCOPT:adaptive-maxheight=2160";     // Force 4K height
$vlcopt[] = "#EXTVLCOPT:adaptive-logic=highest";      // Always select highest bitrate variant
$vlcopt[] = "#EXTVLCOPT:adaptive-minbw=5000000";      // Minimum 5Mbps (reject potato quality)

// DEINTERLACE — Post-Production Grade
$vlcopt[] = "#EXTVLCOPT:video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full";
$vlcopt[] = "#EXTVLCOPT:deinterlace-mode=bwdif";      // Best quality deinterlace

// IMAGE SHARPENING & ENHANCEMENT — Maximum Visual Fidelity
$vlcopt[] = "#EXTVLCOPT:postproc-q=6";                // Max postprocessing quality
$vlcopt[] = "#EXTVLCOPT:sharpen-sigma=0.06";           // Aggressive edge sharpening
$vlcopt[] = "#EXTVLCOPT:contrast=1.08";                // Slight contrast boost
$vlcopt[] = "#EXTVLCOPT:saturation=1.12";              // Richer colors
$vlcopt[] = "#EXTVLCOPT:gamma=0.96";                   // Slightly brighter midtones
$vlcopt[] = "#EXTVLCOPT:swscale-mode=9";               // Lanczos (highest quality scaler)
$vlcopt[] = "#EXTVLCOPT:aspect-ratio=16:9";

// CODEC QUALITY — No shortcuts, maximum detail
$vlcopt[] = "#EXTVLCOPT:avcodec-skip-frame=0";         // Never skip frames
$vlcopt[] = "#EXTVLCOPT:avcodec-skip-idct=0";          // Never skip IDCT
$vlcopt[] = "#EXTVLCOPT:avcodec-dr=1";                 // Direct rendering
$vlcopt[] = "#EXTVLCOPT:video-on-top=0";
$vlcopt[] = "#EXTVLCOPT:video-deco=1";

// SECCIÓN 4B: HDR/SDR COLORIMETRÍA — ALWAYS ACTIVE (v4.1)
// ⚠️ FIX: Previously conditional. Now HDR is FORCED for ALL content.

// ── Core Color Space: BT.2020 for ALL content ──
$vlcopt[] = "#EXTVLCOPT:video-color-space=BT2020";
$vlcopt[] = "#EXTVLCOPT:video-transfer-function=" . ($hdrEnabled ? $cfg['transfer'] : 'PQ');
$vlcopt[] = "#EXTVLCOPT:video-color-primaries=BT2020";
$vlcopt[] = "#EXTVLCOPT:video-color-range=full";
$vlcopt[] = "#EXTVLCOPT:video-chroma-subsampling=" . ($hdrEnabled ? $cfg['chroma'] : '4:2:0');
$vlcopt[] = "#EXTVLCOPT:avcodec-options={color_depth=" . ($hdrEnabled ? $cfg['color_depth'] : '10') . "}";

// ── HDR Output: ALWAYS ON ──
$vlcopt[] = "#EXTVLCOPT:hdr-output-mode=always_hdr";
$vlcopt[] = "#EXTVLCOPT:tone-mapping=hdr";

// ── Tone Mapping Algorithm ──
$vlcopt[] = "#EXTVLCOPT:tone-mapping-algorithm=reinhard";
$vlcopt[] = "#EXTVLCOPT:tone-mapping-param=0.7";
$vlcopt[] = "#EXTVLCOPT:tone-mapping-desat=2.0";
$vlcopt[] = "#EXTVLCOPT:peak-detect=1";

// ── HDR10/HDR10+ Metadata ──
$vlcopt[] = "#EXTVLCOPT:hdr10-maxcll=5000";
$vlcopt[] = "#EXTVLCOPT:hdr10-maxfall=1500";
$vlcopt[] = "#EXTVLCOPT:hdr10-mastering-max-lum=5000";
$vlcopt[] = "#EXTVLCOPT:hdr10-mastering-min-lum=1";

// ── Color Matrix and Rendering ──
$vlcopt[] = "#EXTVLCOPT:video-color-matrix=BT2020_NCL";
$vlcopt[] = "#EXTVLCOPT:video-chroma-location=left";
$vlcopt[] = "#EXTVLCOPT:render-intent=perceptual";
$vlcopt[] = "#EXTVLCOPT:gamut-mapping=perceptual";
$vlcopt[] = "#EXTVLCOPT:target-peak=5000";

// ── D3D11/OpenGL HDR Rendering ──
$vlcopt[] = "#EXTVLCOPT:d3d11-hdr-mode=always";
$vlcopt[] = "#EXTVLCOPT:opengl-hdr=1";
$vlcopt[] = "#EXTVLCOPT:gl-tone-mapping=reinhard";
$vlcopt[] = "#EXTVLCOPT:gl-target-peak=5000";

// ── Deband Filter ──
$vlcopt[] = "#EXTVLCOPT:deband=1";
$vlcopt[] = "#EXTVLCOPT:deband-iterations=4";
$vlcopt[] = "#EXTVLCOPT:deband-threshold=64";
$vlcopt[] = "#EXTVLCOPT:deband-radius=16";
$vlcopt[] = "#EXTVLCOPT:deband-grain=32";

// ── ICC Color Management ──
$vlcopt[] = "#EXTVLCOPT:icc-profile=auto";
$vlcopt[] = "#EXTVLCOPT:icc-contrast=1";

// ── Dithering ──
$vlcopt[] = "#EXTVLCOPT:dither-algo=fruit";
$vlcopt[] = "#EXTVLCOPT:dither-depth=auto";

// SECCIÓN 5: POST-PROCESAMIENTO — REMOVED (v4.1)
// ⚠️ BUG FIX: This section reset sharpen/contrast/saturation to 1.0
// DESTROYING the AI engine's polymorphic adaptive values.
$vlcopt[] = "#EXTVLCOPT:video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full";

// SECCIÓN 6: CONEXIÓN ESTABLE (6 líneas)
$vlcopt[] = "#EXTVLCOPT:http-reconnect=true";
$vlcopt[] = "#EXTVLCOPT:http-continuous=true";
$vlcopt[] = "#EXTVLCOPT:http-forward-cookies=true";
$vlcopt[] = "#EXTVLCOPT:no-http-reconnect=0";
$vlcopt[] = "#EXTVLCOPT:ipv4-timeout=1000";
$vlcopt[] = "#EXTVLCOPT:tcp-caching=3000";

// SECCIÓN 7: RESILIENCIA 24/7/365 (15 líneas)
$vlcopt[] = "#EXTVLCOPT:repeat=" . $cfg['recon_max'];
$vlcopt[] = "#EXTVLCOPT:input-repeat=65535";
$vlcopt[] = "#EXTVLCOPT:loop=1";
$vlcopt[] = "#EXTVLCOPT:no-drop-late-frames=1";
$vlcopt[] = "#EXTVLCOPT:no-skip-frames=1";
$vlcopt[] = "#EXTVLCOPT:network-synchronisation=1";
$vlcopt[] = "#EXTVLCOPT:mtu=" . $mtu;
$vlcopt[] = "#EXTVLCOPT:live-pause=0";
$vlcopt[] = "#EXTVLCOPT:high-priority=1";
$vlcopt[] = "#EXTVLCOPT:auto-adjust-pts-delay=1";
$vlcopt[] = "#EXTVLCOPT:sout-keep=1";
$vlcopt[] = "#EXTVLCOPT:play-and-exit=0";
$vlcopt[] = "#EXTVLCOPT:playlist-autostart=1";
$vlcopt[] = "#EXTVLCOPT:one-instance-when-started-from-file=0";
$vlcopt[] = "#EXTVLCOPT:no-crashdump=1";

// SECCIÓN 8: ADAPTIVE CACHING + HEVC (6 líneas)
$vlcopt[] = "#EXTVLCOPT:adaptive-caching=true";
$vlcopt[] = "#EXTVLCOPT:adaptive-cache-size=5000";
$vlcopt[] = "#EXTVLCOPT:adaptive-logic=highest";
$vlcopt[] = "#EXTVLCOPT:codec=" . $cfg['codec_priority'];
$vlcopt[] = "#EXTVLCOPT:sout-video-profile=" . $cfg['vid_profile'];
$vlcopt[] = "#EXTVLCOPT:avcodec-options={compression_level=" . $cfg['compress'] . "}";
$vlcopt[] = "#EXTVLCOPT:force-dolby-surround=0";

// ═══════════════════════════════════════════════════════════════════════
// 8) OUTPUT M3U FRAGMENT — FULL (63 EXTVLCOPT + 80+ EXTHTTP always)
// ═══════════════════════════════════════════════════════════════════════
$labelFinal = (is_string($labelOverride) && $labelOverride !== '') ? $labelOverride : $cfg['label'];

header('Content-Type: application/x-mpegURL; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=3');
header('X-APE-Refresh-Interval: 3');

// NO #EXTM3U header for patch fragments (fixes OTT Navigator 512)
echo '#EXTINF:-1 '
    . 'ape-profile="' . $profile . '" '
    . 'codec="' . $cfg['codec'] . '" '
    . 'video-track="' . $cfg['res'] . '" '
    . 'bl-video-track="1920x1080,1280x720,854x480"'
    . ',' . $labelFinal . "\n";

// #EXTHTTP — 80+ headers JSON (mirrors JS exthttpHEVC)
echo '#EXTHTTP:' . json_encode($exthttp, JSON_UNESCAPED_SLASHES) . "\n";

// #EXTVLCOPT — 63+ lines (mirrors JS generateEXTVLCOPT)
echo implode("\n", $vlcopt) . "\n";

// Stream URL
echo $finalUrl . "\n";

// ═══════════════════════════════════════════════════════════════════════
// 9) LOGGING
// ═══════════════════════════════════════════════════════════════════════
$duration = microtime(true) - $start;
$logEntry = sprintf("[%s] ch=%s prof=%s dev=%s vlc=%d hdr=%d ms=%.2f\n",
    date('Y-m-d H:i:s'), $ch, $profile, $deviceClass,
    count($vlcopt), $hdrEnabled ? 1 : 0, $duration * 1000);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
@file_put_contents('/var/log/iptv-ape/resolver.log', $logEntry, FILE_APPEND | LOCK_EX);
exit;
