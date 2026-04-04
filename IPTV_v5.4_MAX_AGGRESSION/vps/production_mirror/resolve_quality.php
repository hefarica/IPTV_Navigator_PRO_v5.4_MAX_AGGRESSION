<?php
declare(strict_types=1);
// ── Memory: channels_map.json is 136MB+ → json_decode needs ~1.5GB ────────────
ini_set('memory_limit', '1536M');
// ── CMAF Integration Shim (APE CMAF Engine v2.0) ─────────────────────────────
if (file_exists(__DIR__ . '/cmaf_engine/cmaf_integration_shim.php')) {
    require_once __DIR__ . '/cmaf_engine/cmaf_integration_shim.php';
}
// ── Resilience v6.0 Integration Shim (NeuroBuffer + ModemPriority) ────────────
if (file_exists(__DIR__ . '/cmaf_engine/resilience_integration_shim.php')) {
    require_once __DIR__ . '/cmaf_engine/resilience_integration_shim.php';
}
// ─────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// BULLETPROOF EMERGENCY FALLBACK — resolve_quality.php NEVER returns an error
// If ANY error occurs, returns a minimal valid M3U8 with the direct origin URL.
// Failover back to resolve is automatic: each channel open = new HTTP request.
// ═══════════════════════════════════════════════════════════════════════════
function emergencyFallback(string $reason = 'unknown'): void {
    $srvToken = isset($_GET['srv']) ? trim((string)$_GET['srv']) : '';
    $ch = isset($_GET['ch']) ? trim((string)$_GET['ch']) : '0';
    $sid = isset($_GET['sid']) ? trim((string)$_GET['sid']) : $ch;

    // Try to decode srv token for direct URL
    $url = '';
    if ($srvToken !== '') {
        $decoded = base64_decode($srvToken, true);
        if ($decoded !== false) {
            $parts = explode('|', $decoded, 3);
            if (count($parts) === 3 && $parts[0] !== '' && $parts[1] !== '' && $parts[2] !== '') {
                $url = 'http://' . trim($parts[0]) . '/live/' . rawurlencode(trim($parts[1])) . '/' . rawurlencode(trim($parts[2])) . '/' . rawurlencode($sid) . '.m3u8';
            }
        }
    }

    if ($url === '') {
        $url = 'http://fallback-unavailable/ch/' . rawurlencode($ch) . '.m3u8';
    }

    // Log the fallback
    @file_put_contents('/var/log/iptv-ape/fallback.log',
        sprintf("[%s] FALLBACK ch=%s reason=%s url=%s\n", date('c'), $ch, $reason, substr($url, 0, 120)),
        FILE_APPEND | LOCK_EX);

    header('Content-Type: application/x-mpegURL; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    header('X-APE-Fallback: true');
    header('X-APE-Fallback-Reason: ' . substr($reason, 0, 80));

    echo "#EXTM3U\n";
    echo "#EXTINF:-1,Fallback (" . htmlspecialchars($ch) . ")\n";
    echo "#EXTVLCOPT:network-caching=5000\n";
    echo "#EXTVLCOPT:live-caching=3000\n";
    echo "#EXTVLCOPT:http-reconnect=true\n";
    echo "#EXTVLCOPT:http-continuous=true\n";
    echo $url . "\n";
    exit;
}

// Global error handler — catches fatal errors that try-catch can't
set_error_handler(function(int $errno, string $errstr, string $errfile, int $errline) {
    if ($errno === E_ERROR || $errno === E_PARSE || $errno === E_CORE_ERROR || $errno === E_COMPILE_ERROR) {
        emergencyFallback("php_error:{$errno}:{$errstr}");
    }
    return false; // Non-fatal errors: let PHP handle them
});

register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        if (!headers_sent()) {
            emergencyFallback('fatal:' . ($error['message'] ?? 'unknown'));
        }
    }
});

/**
 * Gold Standard Dual Runtime Resolver (v16.1.0) — VIP QUALITY OVERLAY
 * Domain: iptv-ape.duckdns.org
 * Feature: HEVC-FIRST, BWDIF Enforced, HW Decode Only
 *
 * Input:  /resolve_quality.php?ch=14&p=auto&mode=auto&list=16.1.0
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
// CREDENTIAL PASSTHROUGH v1.0 — No hardcoded credentials
// Credentials arrive from the frontend as &srv=base64(host|user|pass)
// Mirrors the Xtream Codes API flow: frontend logs in → knows creds → passes them
// ═══════════════════════════════════════════════════════════════════════════
function decodeSrvToken(string $token): ?array {
    if ($token === '') return null;
    $decoded = base64_decode($token, true);
    if ($decoded === false) return null;
    $parts = explode('|', $decoded, 3);
    if (count($parts) !== 3) return null;
    // Validate: host must be non-empty, user/pass must be non-empty
    $host = trim($parts[0]);
    $user = trim($parts[1]);
    $pass = trim($parts[2]);
    if ($host === '' || $user === '' || $pass === '') return null;
    // Security: host must look like a valid hostname:port
    if (!preg_match('/^[A-Za-z0-9._:-]{3,128}$/', $host)) return null;
    return ['host' => $host, 'user' => $user, 'pass' => $pass];
}

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

// ═══════════════════════════════════════════════════════════════════════════
// SHARED SUBSYSTEMS — Identical for ALL profiles (P0-P5).
// These were previously sent in &ctx= B64 payload from the frontend.
// Now baked into the backend for dual-source parity + compact ctx URLs.
// ═══════════════════════════════════════════════════════════════════════════
$sharedSubsystems = [
    // ── Cortex Quality Engine ──
    'cortex' => [
        'version' => '1.0.0',
        'codecs' => 'hevc=100,av1=95,vp9=85,avc=70',
        'transport' => 'cmaf>fmp4>ts>dash',
        'hdr_policy' => 'passthrough>hable>reinhard',
        'deint' => 'bwdif=95,w3fdif=85',
        'fallback_chain' => 'hevc>av1>avc',
        'fallback_res' => '4K>2K>FHD>HD>SD',
    ],
    // ── Transport Decision Module ──
    'transport' => [
        'version' => '2.0.0',
        'modes' => ['direct_ts','direct_cmaf','worker_ts','worker_cmaf','hybrid'],
        'cmaf' => ['target_dur' => 4, 'part' => 0.2, 'll' => true],
        'ts_fallback' => true,
        'weights' => ['player' => 0.30, 'device' => 0.25, 'hdr' => 0.15, 'telemetry' => 0.15, 'network' => 0.15],
    ],
    // ── Deinterlace ──
    'deinterlace' => [
        'mode' => 'bwdif',
        'fallback' => 'yadif2x',
        'detect' => 'auto',
        'gpu' => 'force',
    ],
    // ── LCEVC / VNOVA ──
    'lcevc' => [
        'enabled' => true,
        'sdk' => 'v16.4.1',
        'l1' => 'MAX_DIFFERENCE_ATTENUATION',
        'l2' => 'UPCONVERT_SHARPENING_EXTREME',
    ],
    // ── Resilience ──
    'resilience' => [
        'buffer_strategy' => 'NUCLEAR_NO_COMPROMISE',
        'reconnect_max' => 'UNLIMITED',
        'error_recovery' => 'NUCLEAR',
        'freeze_prediction' => true,
        'quality_floor' => '480p',
    ],
    // ── Throughput Thresholds ──
    'throughput_t1' => 17.4,
    'throughput_t2' => 21.4,
    // ── HDR Mastering ──
    'hdr_maxcll' => 4000,
    'hdr_maxfall' => 400,
];

// Merge shared subsystems into each profile
foreach ($profileCfg as $pKey => &$pVal) {
    $pVal = array_merge($pVal, $sharedSubsystems);
}
unset($pVal); // break reference
$pNorm = normalizeProfile($pReq);

// --- PRECEDENCIA FINAL ---
// 🏗️ CONCURRENCY v1.0: Skip the 136MB channels_map.json when &srv= is present.
// The frontend already sends profile, buffer, bandwidth, etc. via URL params.
// This drops memory from ~1.5GB to ~5MB per request, enabling 20+ concurrent lists.
$listId = q('list', '');
$srvTokenPresent = (q('srv', '') !== '');
$map = [];
$decision = null;

if (!$srvTokenPresent) {
    // Legacy mode: no srv token, load channel map for overrides
    $map = loadChannelMap($listId !== '' ? $listId : null);
    $decision = mapDecision($ch, $map);
}
// When &srv= is present: $map=[], $decision=null → autoProfile() + URL params = everything needed

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

// 👑 VIP QUALITY OVERLAY ENFORCEMENT: HW HEVC-FIRST
$cfg['codec_primary'] = 'HEVC';
$cfg['codec_fallback'] = 'HEVC'; // Anti-downgrade (Forzar HW Decoder)
$cfg['codec_priority'] = 'hevc,h265,H265,av1';
$cfg['codec'] = 'hard,system'; // Remover soft_vlc

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

// ═══════════════════════════════════════════════════════════════════════════
// 🧬 POLYMORPHIC CONTEXT INHERITANCE — Full M3U8 Anatomy Decoder
//    Decodes &ctx=base64(JSON) sent by the Typed Arrays generator.
//    The origin directives are LAW: the VPS reads, interprets, maintains,
//    and enhances them. The 5 resilience motors can only ADD to this
//    baseline — they can NEVER degrade resolution, bitrate, codec, or HDR.
//    Idempotent: same ctx → same output. Polymorphic: adapts to any profile.
// ═══════════════════════════════════════════════════════════════════════════
$ctxRaw = q('ctx', '');
$ctxInherited = null;

if ($ctxRaw !== '') {
    // URL-safe Base64 → standard Base64
    $ctxB64 = str_replace(['-', '_'], ['+', '/'], $ctxRaw);
    $ctxJson = base64_decode($ctxB64, true);
    if ($ctxJson !== false) {
        $ctxInherited = json_decode($ctxJson, true);
    }
}

if (is_array($ctxInherited) && !empty($ctxInherited)) {
    // ── RULE: Origin values are the FLOOR, never the ceiling ──
    // For numeric "more is better" fields: use MAX(origin, local)
    // For string fields: origin wins (it knows what it declared)

    // Resolution & Frame Rate — origin wins absolutely
    if (isset($ctxInherited['res']))     $cfg['res']     = (string)$ctxInherited['res'];
    if (isset($ctxInherited['w']))       $cfg['w']       = max((int)$ctxInherited['w'], $cfg['w']);
    if (isset($ctxInherited['h']))       $cfg['h']       = max((int)$ctxInherited['h'], $cfg['h']);
    if (isset($ctxInherited['fps']))     $cfg['fps']     = max((int)$ctxInherited['fps'], $cfg['fps']);
    if (isset($ctxInherited['name']))    $cfg['name']    = (string)$ctxInherited['name'];

    // Bitrate & Bandwidth — always use the HIGHER value (never downgrade)
    if (isset($ctxInherited['bitrate']))   $cfg['bitrate']   = max((int)$ctxInherited['bitrate'], $cfg['bitrate']);
    if (isset($ctxInherited['max_bw']))    $cfg['max_bw']    = max((int)$ctxInherited['max_bw'], $cfg['max_bw']);
    if (isset($ctxInherited['min_bw']))    $cfg['min_bw']    = max((int)$ctxInherited['min_bw'], $cfg['min_bw']);

    // Buffer Architecture — always use the HIGHER value (more buffer = more stability)
    if (isset($ctxInherited['buffer_ms']))   $cfg['buffer_ms']   = max((int)$ctxInherited['buffer_ms'], $cfg['buffer_ms']);
    if (isset($ctxInherited['net_cache']))   $cfg['net_cache']   = max((int)$ctxInherited['net_cache'], $cfg['net_cache']);
    if (isset($ctxInherited['live_cache']))  $cfg['live_cache']  = max((int)$ctxInherited['live_cache'], $cfg['live_cache']);
    if (isset($ctxInherited['file_cache']))  $cfg['file_cache']  = max((int)$ctxInherited['file_cache'], $cfg['file_cache']);

    // Prefetch Engine — always use the HIGHER value
    if (isset($ctxInherited['prefetch_seg']))  $cfg['prefetch_seg']  = max((int)$ctxInherited['prefetch_seg'], $cfg['prefetch_seg']);
    if (isset($ctxInherited['prefetch_par']))  $cfg['prefetch_par']  = max((int)$ctxInherited['prefetch_par'], $cfg['prefetch_par']);
    if (isset($ctxInherited['prefetch_buf']))  $cfg['prefetch_buf']  = max((int)$ctxInherited['prefetch_buf'], $cfg['prefetch_buf']);
    if (isset($ctxInherited['bw_guarantee']))  $cfg['bw_guarantee']  = max((int)$ctxInherited['bw_guarantee'], $cfg['bw_guarantee']);

    // Codec Architecture — origin declares what it supports, VPS respects it
    if (isset($ctxInherited['codec_primary']))   $cfg['codec_primary']   = (string)$ctxInherited['codec_primary'];
    if (isset($ctxInherited['codec_fallback']))  $cfg['codec_fallback']  = (string)$ctxInherited['codec_fallback'];
    if (isset($ctxInherited['codec_priority']))  $cfg['codec_priority']  = (string)$ctxInherited['codec_priority'];
    if (isset($ctxInherited['codec']))           $cfg['codec']           = (string)$ctxInherited['codec'];

    // Color Science — origin's color pipeline is absolute law
    if (isset($ctxInherited['color_space']))  $cfg['color_space']  = (string)$ctxInherited['color_space'];
    if (isset($ctxInherited['color_depth']))  $cfg['color_depth']  = max((int)$ctxInherited['color_depth'], $cfg['color_depth']);
    if (isset($ctxInherited['chroma']))       $cfg['chroma']       = (string)$ctxInherited['chroma'];
    if (isset($ctxInherited['transfer']))     $cfg['transfer']     = (string)$ctxInherited['transfer'];
    if (isset($ctxInherited['matrix']))       $cfg['matrix']       = (string)$ctxInherited['matrix'];
    if (isset($ctxInherited['pix_fmt']))      $cfg['pix_fmt']      = (string)$ctxInherited['pix_fmt'];

    // HEVC Tier/Level/Profile — origin knows its player capabilities
    if (isset($ctxInherited['hevc_tier']))    $cfg['hevc_tier']    = (string)$ctxInherited['hevc_tier'];
    if (isset($ctxInherited['hevc_level']))   $cfg['hevc_level']   = (string)$ctxInherited['hevc_level'];
    if (isset($ctxInherited['hevc_profile'])) $cfg['hevc_profile'] = (string)$ctxInherited['hevc_profile'];
    if (isset($ctxInherited['vid_profile']))  $cfg['vid_profile']  = (string)$ctxInherited['vid_profile'];

    // HDR — if origin declares HDR, VPS must preserve it
    if (isset($ctxInherited['hdr']) && is_array($ctxInherited['hdr']) && !empty($ctxInherited['hdr'])) {
        $cfg['hdr'] = $ctxInherited['hdr'];
    }

    // Processing — origin wins
    if (isset($ctxInherited['sharpen']))    $cfg['sharpen']    = (float)$ctxInherited['sharpen'];
    if (isset($ctxInherited['compress']))   $cfg['compress']   = (int)$ctxInherited['compress'];
    if (isset($ctxInherited['rate_ctrl']))  $cfg['rate_ctrl']  = (string)$ctxInherited['rate_ctrl'];
    if (isset($ctxInherited['entropy']))    $cfg['entropy']    = (string)$ctxInherited['entropy'];

    // Reconnect — always use higher values
    if (isset($ctxInherited['recon_max']))     $cfg['recon_max']     = max((int)$ctxInherited['recon_max'], $cfg['recon_max']);
    if (isset($ctxInherited['recon_timeout'])) $cfg['recon_timeout'] = max((int)$ctxInherited['recon_timeout'], $cfg['recon_timeout']);

    // Audio — use higher channel count
    if (isset($ctxInherited['audio_ch'])) $cfg['audio_ch'] = max((int)$ctxInherited['audio_ch'], $cfg['audio_ch']);

    // Throughput thresholds
    if (isset($ctxInherited['throughput_t1'])) $cfg['throughput_t1'] = (float)$ctxInherited['throughput_t1'];
    if (isset($ctxInherited['throughput_t2'])) $cfg['throughput_t2'] = (float)$ctxInherited['throughput_t2'];

    // ── Store sub-objects for resilience motors to consume ──
    // These are passed through $decision to ResilienceIntegrationShim::enhance()
    $cfg['_ctx_cortex']      = $ctxInherited['cortex'] ?? null;
    $cfg['_ctx_transport']   = $ctxInherited['transport'] ?? null;
    $cfg['_ctx_deinterlace'] = $ctxInherited['deinterlace'] ?? null;
    $cfg['_ctx_lcevc']       = $ctxInherited['lcevc'] ?? null;
    $cfg['_ctx_resilience']  = $ctxInherited['resilience'] ?? null;
    $cfg['_ctx_generator']   = $ctxInherited['_gen'] ?? 'unknown';
    $cfg['_ctx_version']     = $ctxInherited['_ver'] ?? '0';
    $cfg['_ctx_timestamp']   = $ctxInherited['_ts'] ?? 0;

    // Log inheritance event (non-blocking)
    @file_put_contents('/var/log/iptv-ape/ctx_inherit.log',
        sprintf("[%s] ch=%s profile=%s ctx_profile=%s ctx_gen=%s ctx_res=%s\n",
            date('c'), $ch, $profile,
            $ctxInherited['profile'] ?? '?',
            $ctxInherited['_gen'] ?? '?',
            $ctxInherited['res'] ?? '?'),
        FILE_APPEND | LOCK_EX);
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
// 🛡️ QUANTUM SHIELD: PREDICTIVE GUARDIAN HEALTH CHECK
function checkStreamHealth(string $url): bool {
    if (empty($url)) return false;
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_NOBODY, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 3); // 3 seconds tolerance
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ($status >= 200 && $status < 400); 
}

// ═══════════════════════════════════════════════════════════════════════════
// 5) URL CONSTRUCTION — Credential Passthrough from Frontend
//    Decodes &srv=base64(host|user|pass) token sent by the JS generator.
//    NO hardcoded credentials — mirrors the Xtream Codes API login flow.
// ═══════════════════════════════════════════════════════════════════════════
$srvToken = q('srv', '');
$srvCreds = decodeSrvToken($srvToken);

if ($srvCreds === null) {
    // No valid srv token → emergency fallback to direct URL
    emergencyFallback('invalid_srv_token');
}

$effectiveHost = $srvCreds['host'];
$effectiveUser = $srvCreds['user'];
$effectivePass = $srvCreds['pass'];

$streamId = $ch;
if ($decision !== null && isset($decision['stream_id']) && $decision['stream_id'] !== '') {
    $streamId = (string)$decision['stream_id'];
}

// 🌐 PROTOCOLO SID-MISMATCH PREVENTION (Gold Standard)
// Si el generador JS envió un stream_id numérico explícito, este es el Rey absoluto.
$sidParam = q('sid', '');
if ($sidParam !== '' && preg_match('/^\d+$/', $sidParam)) {
    $streamId = $sidParam;
}

// 🛡️ QUANTUM SHIELD: Health check the decoded server
$baseUrl = "http://" . $effectiveHost . "/live/" . rawurlencode((string)$effectiveUser) . "/" . rawurlencode((string)$effectivePass) . "/" . rawurlencode((string)$streamId) . ".m3u8";

// Optional: Verify stream health (skip if latency-sensitive)
if (!checkStreamHealth($baseUrl)) {
    // Stream not healthy but we still return the URL — the player handles retries
    // Log for diagnostics, don't block
    @file_put_contents('/var/log/iptv-ape/unhealthy.log',
        sprintf("[%s] UNHEALTHY ch=%s host=%s\n", date('Y-m-d H:i:s'), $ch, $effectiveHost),
        FILE_APPEND | LOCK_EX);
}

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
    "X-Quality-Preference"     => "codec-hevc,profile-main10,tier-high", // VIP FORCED HW DESC
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
// ═══════════════════════════════════════════════════════════════════
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

// SECCIÓN 1B: HEADERS HTTP COMPLETOS (7 líneas)
$vlcopt[] = "#EXTVLCOPT:http-header:Connection=keep-alive";
$vlcopt[] = "#EXTVLCOPT:http-header:Keep-Alive=timeout=300, max=1000";
$vlcopt[] = "#EXTVLCOPT:http-header:Range=bytes=0-";
$vlcopt[] = "#EXTVLCOPT:http-header:If-None-Match=*";
$vlcopt[] = "#EXTVLCOPT:http-header:Origin=" . $originUrl;
$vlcopt[] = "#EXTVLCOPT:http-header:Referer=" . $referer;
$vlcopt[] = "#EXTVLCOPT:http-header:Priority=u=1, i";
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

// SECCIÓN 3: DECODIFICACIÓN Y HARDWARE — QUALITY MAXIMUM (Zero Shortcuts)
$vlcopt[] = "#EXTVLCOPT:avcodec-hw=any";
$vlcopt[] = "#EXTVLCOPT:avcodec-threads=0";
$vlcopt[] = "#EXTVLCOPT:avcodec-fast=0";              // Quality over speed (NEVER fast mode)
$vlcopt[] = "#EXTVLCOPT:avcodec-skiploopfilter=0";    // NEVER skip deblocking (prevents macroblocking)
$vlcopt[] = "#EXTVLCOPT:avcodec-hurry-up=0";          // NEVER rush decode
$vlcopt[] = "#EXTVLCOPT:avcodec-skip-frame=0";        // NEVER skip frames
$vlcopt[] = "#EXTVLCOPT:avcodec-skip-idct=0";         // NEVER skip IDCT transform
$vlcopt[] = "#EXTVLCOPT:sout-avcodec-strict=-2";
$vlcopt[] = "#EXTVLCOPT:ffmpeg-threads=0";
$vlcopt[] = "#EXTVLCOPT:avcodec-codec=hevc"; // VIP ENFORCED
$vlcopt[] = "#EXTVLCOPT:sout-video-codec=hevc"; // VIP ENFORCED
$vlcopt[] = "#EXTVLCOPT:audio-channels=" . $cfg['audio_ch'];
$vlcopt[] = "#EXTVLCOPT:audiotrack-passthrough=" . ($cfg['audio_ch'] >= 6 ? 'true' : 'false');
$vlcopt[] = "#EXTVLCOPT:adaptive-maxbw=" . $cfg['max_bw'];
$vlcopt[] = "#EXTVLCOPT:http-max-retries=" . $cfg['recon_max'];
$vlcopt[] = "#EXTVLCOPT:http-timeout=6000";

// SECCIÓN 4: CALIDAD DE VIDEO — FORCE HIGHEST RESOLUTION
// ⚠️ FIX v6.4: Old code injected ALL tiers from 480→4320, player used FIRST value (480p).
// Now: Force ONLY the highest resolution the profile supports.
$vlcopt[] = "#EXTVLCOPT:preferred-resolution=-1";   // -1 = ALWAYS HIGHEST AVAILABLE
$vlcopt[] = "#EXTVLCOPT:adaptive-maxwidth=3840";     // Force 4K width
$vlcopt[] = "#EXTVLCOPT:adaptive-maxheight=2160";    // Force 4K height
$vlcopt[] = "#EXTVLCOPT:adaptive-logic=highest";     // Always select highest bitrate variant
$vlcopt[] = "#EXTVLCOPT:adaptive-minbw=5000000";     // Minimum 5Mbps (reject potato quality)

// DEINTERLACE — Post-Production Grade (MOTION OPTIMIZED for Sports)
$vlcopt[] = "#EXTVLCOPT:video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full";
$vlcopt[] = "#EXTVLCOPT:deinterlace-mode=bwdif";     // Bob-Weave Deinterlace (best quality)

// MOTION COMPENSATION — Fast Action Anti-Blur
$vlcopt[] = "#EXTVLCOPT:no-drop-late-frames=1";       // NEVER drop frames during fast motion
$vlcopt[] = "#EXTVLCOPT:no-skip-frames=1";            // NEVER skip frames during rapid action
$vlcopt[] = "#EXTVLCOPT:auto-adjust-pts-delay=1";     // Auto-correct frame timing
$vlcopt[] = "#EXTVLCOPT:clock-jitter=0";              // Zero clock jitter for smooth motion
$vlcopt[] = "#EXTVLCOPT:avcodec-error-resilience=1";  // Recover corrupted motion frames

// IMAGE SHARPENING & ENHANCEMENT — Maximum Visual Fidelity
$vlcopt[] = "#EXTVLCOPT:postproc-q=6";               // Max postprocessing quality
$vlcopt[] = "#EXTVLCOPT:sharpen-sigma=0.08";          // Aggressive edge sharpening for motion clarity
$vlcopt[] = "#EXTVLCOPT:contrast=1.10";               // Stronger contrast for sports visibility
$vlcopt[] = "#EXTVLCOPT:saturation=1.15";             // Vivid colors for stadium/pitch detail
$vlcopt[] = "#EXTVLCOPT:gamma=0.94";                  // Brighter midtones for fast action
$vlcopt[] = "#EXTVLCOPT:swscale-mode=9";              // Lanczos (highest quality scaler)
$vlcopt[] = "#EXTVLCOPT:aspect-ratio=16:9";

// CODEC QUALITY — No shortcuts
$vlcopt[] = "#EXTVLCOPT:avcodec-skiploopfilter=0";    // Never skip loop filter (sharpest decode)
$vlcopt[] = "#EXTVLCOPT:avcodec-skip-frame=0";        // Never skip frames
$vlcopt[] = "#EXTVLCOPT:avcodec-skip-idct=0";         // Never skip IDCT
$vlcopt[] = "#EXTVLCOPT:avcodec-fast=0";              // Quality over speed
$vlcopt[] = "#EXTVLCOPT:avcodec-hurry-up=0";          // Never rush decode
$vlcopt[] = "#EXTVLCOPT:avcodec-dr=1";                // Direct rendering (less copies)
$vlcopt[] = "#EXTVLCOPT:video-on-top=0";
$vlcopt[] = "#EXTVLCOPT:video-deco=1";

// SECCIÓN 4B: HDR/SDR COLORIMETRÍA — ALWAYS ACTIVE (v4.1)
// ⚠️ FIX: Previously conditional. Now HDR is FORCED for ALL content:
//   - HDR source → Full passthrough + metadata preservation
//   - SDR source → HDR simulation (SDR→HDR upconversion)
// This ensures maximum visual impact regardless of source type.

// ── Core Color Space: BT.2020 for ALL content ──
$vlcopt[] = "#EXTVLCOPT:video-color-space=BT2020";          // Wide color gamut ALWAYS
$vlcopt[] = "#EXTVLCOPT:video-transfer-function=" . ($hdrEnabled ? $cfg['transfer'] : 'PQ');
$vlcopt[] = "#EXTVLCOPT:video-color-primaries=BT2020";      // BT.2020 primaries ALWAYS
$vlcopt[] = "#EXTVLCOPT:video-color-range=full";             // Full range (0-255) not limited
$vlcopt[] = "#EXTVLCOPT:video-chroma-subsampling=" . ($hdrEnabled ? $cfg['chroma'] : '4:2:0');
$vlcopt[] = "#EXTVLCOPT:avcodec-options={color_depth=" . ($hdrEnabled ? $cfg['color_depth'] : '10') . "}";

// ── HDR Output: ALWAYS ON ──
$vlcopt[] = "#EXTVLCOPT:hdr-output-mode=always_hdr";        // FORCED: Always output HDR
$vlcopt[] = "#EXTVLCOPT:tone-mapping=hdr";                  // HDR tone mapping active

// ── Tone Mapping Algorithm: Best quality ──
$vlcopt[] = "#EXTVLCOPT:tone-mapping-algorithm=reinhard";   // Reinhard (non-linear, natural look)
$vlcopt[] = "#EXTVLCOPT:tone-mapping-param=0.7";            // Reinhard parameter (0.7 = balanced)
$vlcopt[] = "#EXTVLCOPT:tone-mapping-desat=2.0";            // Desaturation threshold
$vlcopt[] = "#EXTVLCOPT:peak-detect=1";                     // Auto-detect peak luminance

// ── HDR10/HDR10+ Metadata ──
$vlcopt[] = "#EXTVLCOPT:hdr10-maxcll=5000";                 // Max Content Light Level: 5000 nits
$vlcopt[] = "#EXTVLCOPT:hdr10-maxfall=1500";                // Max Frame-Average Light Level
$vlcopt[] = "#EXTVLCOPT:hdr10-mastering-max-lum=5000";      // Mastering display max luminance
$vlcopt[] = "#EXTVLCOPT:hdr10-mastering-min-lum=1";         // Mastering display min luminance

// ── Color Matrix and Rendering ──
$vlcopt[] = "#EXTVLCOPT:video-color-matrix=BT2020_NCL";     // Non-constant luminance
$vlcopt[] = "#EXTVLCOPT:video-chroma-location=left";        // MPEG-style chroma location
$vlcopt[] = "#EXTVLCOPT:render-intent=perceptual";           // Perceptual rendering (human eye optimized)
$vlcopt[] = "#EXTVLCOPT:gamut-mapping=perceptual";           // Gamut mapping for out-of-range colors
$vlcopt[] = "#EXTVLCOPT:target-peak=5000";                   // Target peak luminance: 5000 nits

// ── D3D11/OpenGL HDR Rendering ──
$vlcopt[] = "#EXTVLCOPT:d3d11-hdr-mode=always";             // D3D11: Always HDR output
$vlcopt[] = "#EXTVLCOPT:opengl-hdr=1";                      // OpenGL: HDR output enabled
$vlcopt[] = "#EXTVLCOPT:gl-tone-mapping=reinhard";           // OpenGL tone-mapping algorithm
$vlcopt[] = "#EXTVLCOPT:gl-target-peak=5000";                // OpenGL target nits

// ── Deband Filter: Smooth gradients (anti-banding) ──
$vlcopt[] = "#EXTVLCOPT:deband=1";                           // Deband enabled (removes color banding)
$vlcopt[] = "#EXTVLCOPT:deband-iterations=4";                // 4 passes (max smoothing)
$vlcopt[] = "#EXTVLCOPT:deband-threshold=64";                // Detection threshold
$vlcopt[] = "#EXTVLCOPT:deband-radius=16";                   // Pixel radius for analysis
$vlcopt[] = "#EXTVLCOPT:deband-grain=32";                    // Add grain to mask remaining banding

// ── ICC Color Management ──
$vlcopt[] = "#EXTVLCOPT:icc-profile=auto";                   // Auto-detect display ICC profile
$vlcopt[] = "#EXTVLCOPT:icc-contrast=1";                     // Honor ICC contrast

// ── Dithering (smooth quantization) ──
$vlcopt[] = "#EXTVLCOPT:dither-algo=fruit";                  // Fruit dithering (highest quality)
$vlcopt[] = "#EXTVLCOPT:dither-depth=auto";                  // Auto-detect bit depth for dithering

// SECCIÓN 5: POST-PROCESAMIENTO — REMOVED (v4.1)
// ⚠️ BUG FIX: This section previously reset sharpen/contrast/saturation/gamma
// to 1.0, DESTROYING the AI engine's polymorphic adaptive values.
// The AISuperResolutionEngine now handles all post-processing per resolution tier.
// Keeping only the video filter chain activation (no value overrides).
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
$vlcopt[] = "#EXTVLCOPT:codec=hevc"; // 👑 VIP Strict
$vlcopt[] = "#EXTVLCOPT:sout-video-profile=" . $cfg['vid_profile'];
$vlcopt[] = "#EXTVLCOPT:force-dolby-surround=0";

// ═══════════════════════════════════════════════════════════════════════
// 7B) RESILIENCE v6.0 ENHANCEMENT — Merge buffer escalation + net priority
//     Non-intrusive: returns empty arrays if modules are missing.
// ═══════════════════════════════════════════════════════════════════════
if (class_exists('ResilienceIntegrationShim', false)) {
    $resilienceDecision = array_merge($decision ?? [], [
        'quality_profile'       => $profile,
        'url'                   => $finalUrl,
        'origin'                => $effectiveHost,
        'height'                => $cfg['h'],
        'h'                     => $cfg['h'],
        'user_agent'            => $_SERVER['HTTP_USER_AGENT'] ?? '', // v2.0 device detection
        'buffer_pct'            => (float)q('buffer_pct', '72'),
        'network_type'          => q('net_type', 'ethernet'),
        'bandwidth_kbps'        => (int)q('bw_kbps', '100000'),
        'circuit_breaker_state' => 'CLOSED',
        'resilience_strategy'   => 'direct',
    ]);
    $resilience = ResilienceIntegrationShim::enhance($ch, $resilienceDecision);
    // Merge resilience EXTHTTP headers (buffer escalation, DSCP, priority)
    if (!empty($resilience['exthttp'])) {
        $exthttp = array_merge($exthttp, $resilience['exthttp']);
    }
    // Merge resilience EXTVLCOPT (network-caching override, adaptive-logic)
    if (!empty($resilience['extvlcopt'])) {
        $vlcopt = array_merge($vlcopt, $resilience['extvlcopt']);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 7C) BANDWIDTH-REACTIVE AI METRICS — NON-NEGOTIABLE QUALITY SENSOR
//     Executes every ~3s. Demands ideal bitrate. Escalates to other engines.
// ═══════════════════════════════════════════════════════════════════════
if (class_exists('AISuperResolutionEngine', false)) {
    $currentBW = (int)q('bw_kbps', '100000'); // Default 100 Mbps
    AISuperResolutionEngine::injectBandwidthMetrics(
        $currentBW, (int)$cfg['h'], $exthttp, $vlcopt
    );
}


// ═══════════════════════════════════════════════════════════════════════
// 8) OUTPUT M3U FRAGMENT — FULL (63+ EXTVLCOPT + 80+ EXTHTTP always)
// ═══════════════════════════════════════════════════════════════════════
$labelFinal = (is_string($labelOverride) && $labelOverride !== '') ? $labelOverride : $cfg['label'];

// ── ANTI-PIXELATION: ExoPlayer/OTT Navigator Motion Headers ──────────
// These EXTHTTP headers are respected by ExoPlayer-based players (OTT Navigator, TiviMate)
// 95% of IPTV providers don't send these → COMPETITIVE EDGE
$exthttp['X-ExoPlayer-Max-Video-Bitrate']         = '50000000';     // 50Mbps ceiling
$exthttp['X-ExoPlayer-Min-Video-Bitrate']         = '5000000';      // 5Mbps floor (reject potato)
$exthttp['X-ExoPlayer-Buffer-For-Playback-Ms']    = '2500';         // 2.5s buffer before play
$exthttp['X-ExoPlayer-Buffer-For-Playback-After-Rebuffer-Ms'] = '5000'; // 5s after rebuffer
$exthttp['X-ExoPlayer-Max-Buffer-Ms']             = '60000';        // 60s max buffer
$exthttp['X-ExoPlayer-Min-Buffer-Ms']             = '15000';        // 15s min buffer
$exthttp['X-ExoPlayer-Back-Buffer-Duration-Ms']   = '30000';        // 30s rewind buffer
$exthttp['X-ExoPlayer-Retain-Back-Buffer-From-Keyframe'] = 'true';  // Keep keyframes in back buffer
$exthttp['X-ExoPlayer-Live-Max-Offset-Ms']        = '30000';        // Max 30s behind live
$exthttp['X-ExoPlayer-Live-Min-Offset-Ms']        = '3000';         // Min 3s behind live
$exthttp['X-ExoPlayer-Live-Target-Offset-Ms']     = '8000';         // Target 8s behind live

// ── ANTI-PIXELATION: Frame & Motion Compensation ─────────────────────
$exthttp['X-Frame-Rate-Output']                   = 'match_source'; // Match source framerate
$exthttp['X-Deinterlace-Mode']                    = 'bwdif';        // Best deinterlace
$exthttp['X-Deblock-Filter']                      = 'full';         // Full H.264/HEVC deblocking
$exthttp['X-Post-Processing']                     = 'maximum';      // Max post-processing
$exthttp['X-Motion-Interpolation']                = 'enabled';      // Motion interpolation ON
$exthttp['X-Frame-Drop-Policy']                   = 'NEVER_DROP';   // Never drop frames
$exthttp['X-Quality-Degradation']                 = 'FORBIDDEN';    // Never degrade quality
$exthttp['X-Artifact-Reduction']                  = 'MAXIMUM';      // Max artifact reduction
$exthttp['X-Macro-Block-Deblocking']              = 'AGGRESSIVE';   // Aggressive deblocking
$exthttp['X-Edge-Enhancement']                    = 'ADAPTIVE';     // Adaptive edge enhancement
$exthttp['X-Noise-Reduction']                     = 'TEMPORAL_SPATIAL'; // Advanced noise reduction
$exthttp['X-Chroma-Upsampling']                   = 'LANCZOS';      // Lanczos chroma upsampling
$exthttp['X-Hardware-Decode-Priority']            = 'QUALITY';       // Prefer quality over speed
$exthttp['X-Refresh-Rate-Match']                  = 'auto';          // Auto refresh rate matching

header('Content-Type: application/x-mpegURL; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=3');
header('X-APE-Refresh-Interval: 3');

// #EXTM3U header — REQUIRED for Option B (Universal Player Support)
echo "#EXTM3U\n";

// ═══════════════════════════════════════════════════════════════════════
// KODIPROP: MAXIMUM QUALITY ENFORCEMENT for Kodi/InputStream.Adaptive
// 95% of providers skip KODIPROP entirely → THIS IS THE COMPETITIVE EDGE
// 20+ properties for absolute maximum visual fidelity in Kodi
// ═══════════════════════════════════════════════════════════════════════

// ── Core: Force adaptive HLS input ──
echo "#KODIPROP:inputstream=inputstream.adaptive\n";
echo "#KODIPROP:inputstream.adaptive.manifest_type=hls\n";

// ── Resolution: ALWAYS maximum, never downgrade ──
echo "#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive\n";
echo "#KODIPROP:inputstream.adaptive.chooser_resolution_max=" . $cfg['res'] . "\n";
echo "#KODIPROP:inputstream.adaptive.chooser_resolution_secure_max=" . $cfg['res'] . "\n";
echo "#KODIPROP:inputstream.adaptive.ignore_display_resolution=true\n"; // Ignore TV resolution limit
echo "#KODIPROP:inputstream.adaptive.representation_chooser=manual_osd\n"; // Allow manual quality override

// ── Buffer: NUCLEAR pre-fill for zero stutter ──
echo "#KODIPROP:inputstream.adaptive.pre_buffer_bytes=157286400\n";     // 150MB pre-fill buffer (was 90MB)
echo "#KODIPROP:inputstream.adaptive.max_buffer_length=120\n";          // 120s max buffer (was 60)
echo "#KODIPROP:inputstream.adaptive.assured_buffer_length=60\n";       // 60s assured buffer (was 30)
echo "#KODIPROP:inputstream.adaptive.chooser_bandwidth_buffer=90\n";    // 90% BW utilization (was 80)

// ── Live streaming optimization ──
echo "#KODIPROP:inputstream.adaptive.live_delay=3\n";                   // 3s live delay (was 5)
echo "#KODIPROP:inputstream.adaptive.play_timeshift_buffer=true\n";     // Enable timeshift
echo "#KODIPROP:inputstream.adaptive.chooser_type=adaptive\n";          // Adaptive quality chooser

// ── Codec and quality enforcement ──
echo "#KODIPROP:inputstream.adaptive.default_audio_language=original\n"; // Original audio track
echo "#KODIPROP:inputstream.adaptive.stream_headers=Connection=keep-alive\n"; // Persistent connection
echo "#KODIPROP:inputstream.adaptive.manifest_update_parameter=full\n";  // Full manifest refresh
echo "#KODIPROP:inputstream.adaptive.original_audio_language=original\n";

// ── Bandwidth: Force maximum bitrate selection ──
echo "#KODIPROP:inputstream.adaptive.chooser_bandwidth_min=5000000\n";  // Min 5Mbps
echo "#KODIPROP:inputstream.adaptive.chooser_bandwidth_max=120000000\n"; // Max 120Mbps

echo '#EXTINF:-1 '
    . 'ape-profile="' . $profile . '-VIP-HW" '
    . 'codec="HEVC" '
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
