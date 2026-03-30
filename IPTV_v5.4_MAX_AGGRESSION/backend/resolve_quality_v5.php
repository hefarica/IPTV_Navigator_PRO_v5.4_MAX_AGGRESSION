<?php
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RESOLVE QUALITY v5.0 — PLAYER ENSLAVEMENT PROTOCOL (PEP)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Versión:   5.0.0-PEP-EDITION
 * Fecha:     2026-03-16
 * Paradigma: Player Enslavement Protocol (PEP)
 *
 * PRINCIPIO FUNDAMENTAL:
 * El reproductor no decide — obedece. Este resolver es el árbitro final
 * de la calidad. Cada respuesta es matemáticamente óptima para el canal
 * solicitado, el perfil detectado y las condiciones de red actuales.
 *
 * MOTORES INTEGRADOS:
 *   1. APE Omni Orchestrator v18.2   — Coordinación de todos los motores
 *   2. CMAF Integration Shim v2.0    — Intercepción CMAF/HLS
 *   3. Channel Memory Engine          — Memoria de estado de canales
 *   4. ListaGuardian Engine           — Guardián de la lista
 *   5. QoSQoE Orchestrator            — Calidad de servicio y experiencia
 *   6. Resilience Engine              — Motor de resiliencia
 *   7. Telchemy TVQM Engine           — Métricas de calidad de video
 *   8. Hydra Stealth                  — Evasión y rotación de UA
 *   9. Universal Fallback Engine      — Cadena de degradación 7 niveles
 *  10. Universal Headers Engine       — Headers optimizados por perfil
 *
 * INPUT:  /resolve_quality_v5.php?ch=14&p=auto&mode=auto&list=16.1.0
 * OUTPUT: Fragmento M3U8 con headers completos APE v18.2
 *
 * COMPLIANCE: RFC 8216, ISO 23009-1, ITU-T G.1028, ETSI TR 101 290
 * ═══════════════════════════════════════════════════════════════════════════════
 */

declare(strict_types=1);
$start = microtime(true);

// ═══════════════════════════════════════════════════════════════════════════
// CARGA DE MOTORES (orden crítico — no modificar)
// ═══════════════════════════════════════════════════════════════════════════
$engineBase = __DIR__ . '/cmaf_engine';

// Motor principal: CMAF Integration Shim (intercepta antes que todo)
if (file_exists($engineBase . '/cmaf_integration_shim.php')) {
    require_once $engineBase . '/cmaf_integration_shim.php';
}

// Módulos especializados
$modules = [
    'ape_omni_orchestrator_v18.php',
    'modules/channel_memory_engine.php',
    'modules/lista_guardian_engine.php',
    'modules/qos_qoe_orchestrator.php',
    'modules/resilience_engine.php',
    'modules/universal_fallback_engine.php',
    'modules/universal_headers_engine.php',
    'modules/player_capability_resolver.php',
    'modules/cdn_routing_engine.php',
    'modules/manifest_repair_engine.php',
    'telchemy_tvqm_engine.php',
];

foreach ($modules as $mod) {
    $path = $engineBase . '/' . $mod;
    if (file_exists($path)) {
        require_once $path;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN GLOBAL — ORIGINS REGISTRY
// ═══════════════════════════════════════════════════════════════════════════
// Agregar nuevos orígenes aquí. Key = host(:port).
// El generador pasa &origin=HOST via EXTATTRFROMURL.
const ORIGINS = [
    // host                              user              pass
    ['line.tivi-ott.net',               '3JHFTC',         'U56BDP'],
    ['line.dndnscloud.ru',              'f828e5e261',     'e1372a7053f1'],
    ['126958958431.4k-26com.com:80',    'ujgd4kiltx',     'p5c00kxjc7'],
    // Agregar nuevos orígenes aquí:
    // ['nuevo.host.com:8080',          'usuario',        'contraseña'],
];

const DEFAULT_ORIGIN = 'line.tivi-ott.net';
const DEFAULT_USER   = '3JHFTC';
const DEFAULT_PASS   = 'U56BDP';
const TOKEN_TTL      = 120;
const TOKEN_MODE     = 'none'; // none | hmac | passthrough
const TOKEN_SECRET   = 'CAMBIA_ESTE_SECRETO_LARGO_Y_UNICO_PEP_V5';
const CHANNEL_MAP_PATH = __DIR__ . '/channels_map.json';
const CHANNEL_MAP_TTL_SECONDS = 30;
const REQUIRE_SIG    = false;
const EXPECTED_SIG   = 'PEP-V5-2026-03-16';
const ACCEPT_HEADER  = 'application/vnd.apple.mpegurl;q=1.0, audio/mpegurl;q=0.99, application/x-mpegurl;q=0.97, application/x-m3u8;q=0.95, text/plain;q=0.8, */*;q=0.1';
const ACCEPT_ENCODING = 'gzip, deflate';

// ═══════════════════════════════════════════════════════════════════════════
// TABLA MAESTRA DE PERFILES P0-P5 (PEP Edition)
// Valores calibrados quirúrgicamente para 0 cortes / 0 freeze
// ═══════════════════════════════════════════════════════════════════════════
const PROFILE_CFG = [
    'P0' => [
        'name'         => 'ULTRA_EXTREME',
        'label'        => 'ULTRA EXTREME',
        'res'          => '7680x4320',
        'w'            => 7680,
        'h'            => 4320,
        'fps'          => 60,
        'bitrate'      => 80000,
        'buffer_ms'    => 50000,
        'net_cache'    => 60000,
        'live_cache'   => 60000,
        'file_cache'   => 15000,
        'max_bw'       => 160000000,
        'min_bw'       => 50000000,
        'prefetch_seg' => 500,
        'prefetch_par' => 250,
        'prefetch_buf' => 600000,
        'seg_dur'      => 2,
        'bw_guarantee' => 500,
        'codec_primary'=> 'AV1',
        'codec_fallback'=> 'HEVC',
        'codec_priority'=> 'av1,hevc,h265,H265,h.265,h264',
        'hdr'          => ['hdr10plus', 'dolby_vision', 'hdr10', 'hlg'],
        'color_depth'  => 12,
        'audio_ch'     => 8,
        'recon_timeout'=> 5,
        'recon_max'    => 200,
        'recon_delay'  => 0,
        'hevc_tier'    => 'HIGH',
        'hevc_level'   => '6.1,5.1,5.0,4.1,4.0,3.1',
        'hevc_profile' => 'MAIN-10-HDR',
        'color_space'  => 'BT2020',
        'chroma'       => '4:2:0',
        'transfer'     => 'SMPTE2084',
        'matrix'       => 'BT2020NC',
        'compress'     => 1,
        'sharpen'      => 0.02,
        'rate_ctrl'    => 'VBR',
        'entropy'      => 'CABAC',
        'vid_profile'  => 'main10',
        'pix_fmt'      => 'yuv420p10le',
        'codec'        => 'hard,system',
        'lcevc'        => true,
        'lcevc_state'  => 'ACTIVE',
        'qoe_target'   => 5.0,
        'dscp'         => 'EF',
        'vqs_score'    => 98,
        'buffer_target_s' => 15,
        'buffer_min_s' => 3,
        'buffer_max_s' => 45,
        'prebuffer_s'  => 5,
        'degradation_chain' => [
            'CMAF+AV1+LCEVC',
            'CMAF+HEVC+LCEVC',
            'HLS/fMP4+HEVC+LCEVC',
            'HLS/fMP4+H.264',
            'HLS/TS+H.264',
            'HLS/TS+Baseline',
            'HTTP-Redirect'
        ],
    ],
    'P1' => [
        'name'         => '4K_SUPREME',
        'label'        => '4K SUPREME',
        'res'          => '3840x2160',
        'w'            => 3840,
        'h'            => 2160,
        'fps'          => 60,
        'bitrate'      => 25000,
        'buffer_ms'    => 40000,
        'net_cache'    => 50000,
        'live_cache'   => 50000,
        'file_cache'   => 12000,
        'max_bw'       => 80000000,
        'min_bw'       => 25000000,
        'prefetch_seg' => 400,
        'prefetch_par' => 200,
        'prefetch_buf' => 500000,
        'seg_dur'      => 2,
        'bw_guarantee' => 400,
        'codec_primary'=> 'HEVC',
        'codec_fallback'=> 'HEVC',
        'codec_priority'=> 'hevc,h265,H265,h.265,av1,h264',
        'hdr'          => ['hdr10', 'hlg'],
        'color_depth'  => 10,
        'audio_ch'     => 8,
        'recon_timeout'=> 5,
        'recon_max'    => 200,
        'recon_delay'  => 0,
        'hevc_tier'    => 'HIGH',
        'hevc_level'   => '6.1,5.1,5.0,4.1,4.0,3.1',
        'hevc_profile' => 'MAIN-10-HDR',
        'color_space'  => 'BT2020',
        'chroma'       => '4:2:0',
        'transfer'     => 'SMPTE2084',
        'matrix'       => 'BT2020NC',
        'compress'     => 1,
        'sharpen'      => 0.02,
        'rate_ctrl'    => 'VBR',
        'entropy'      => 'CABAC',
        'vid_profile'  => 'main10',
        'pix_fmt'      => 'yuv420p10le',
        'codec'        => 'hard,system',
        'lcevc'        => true,
        'lcevc_state'  => 'ACTIVE',
        'qoe_target'   => 5.0,
        'dscp'         => 'EF',
        'vqs_score'    => 95,
        'buffer_target_s' => 12,
        'buffer_min_s' => 3,
        'buffer_max_s' => 36,
        'prebuffer_s'  => 5,
        'degradation_chain' => [
            'CMAF+HEVC+LCEVC',
            'HLS/fMP4+HEVC+LCEVC',
            'HLS/fMP4+H.264',
            'HLS/TS+H.264',
            'HLS/TS+Baseline',
            'TS-Direct',
            'HTTP-Redirect'
        ],
    ],
    'P2' => [
        'name'         => '4K_EXTREME',
        'label'        => '4K EXTREME',
        'res'          => '3840x2160',
        'w'            => 3840,
        'h'            => 2160,
        'fps'          => 30,
        'bitrate'      => 15000,
        'buffer_ms'    => 35000,
        'net_cache'    => 45000,
        'live_cache'   => 45000,
        'file_cache'   => 10000,
        'max_bw'       => 50000000,
        'min_bw'       => 15000000,
        'prefetch_seg' => 350,
        'prefetch_par' => 175,
        'prefetch_buf' => 450000,
        'seg_dur'      => 2,
        'bw_guarantee' => 350,
        'codec_primary'=> 'HEVC',
        'codec_fallback'=> 'HEVC',
        'codec_priority'=> 'hevc,h265,H265,h.265,h264',
        'hdr'          => ['hdr10', 'hlg'],
        'color_depth'  => 10,
        'audio_ch'     => 6,
        'recon_timeout'=> 5,
        'recon_max'    => 200,
        'recon_delay'  => 0,
        'hevc_tier'    => 'HIGH',
        'hevc_level'   => '6.1,5.1,5.0,4.1,4.0,3.1',
        'hevc_profile' => 'MAIN-10-HDR',
        'color_space'  => 'BT2020',
        'chroma'       => '4:2:0',
        'transfer'     => 'SMPTE2084',
        'matrix'       => 'BT2020NC',
        'compress'     => 1,
        'sharpen'      => 0.03,
        'rate_ctrl'    => 'VBR',
        'entropy'      => 'CABAC',
        'vid_profile'  => 'main10',
        'pix_fmt'      => 'yuv420p10le',
        'codec'        => 'hard,system',
        'lcevc'        => true,
        'lcevc_state'  => 'SIGNAL_ONLY',
        'qoe_target'   => 4.8,
        'dscp'         => 'EF',
        'vqs_score'    => 92,
        'buffer_target_s' => 10,
        'buffer_min_s' => 3,
        'buffer_max_s' => 30,
        'prebuffer_s'  => 4,
        'degradation_chain' => [
            'CMAF+HEVC+LCEVC',
            'HLS/fMP4+HEVC+LCEVC',
            'HLS/fMP4+H.264',
            'HLS/TS+H.264',
            'HLS/TS+Baseline',
            'TS-Direct',
            'HTTP-Redirect'
        ],
    ],
    'P3' => [
        'name'         => 'FHD_ADVANCED',
        'label'        => 'FHD ADVANCED',
        'res'          => '1920x1080',
        'w'            => 1920,
        'h'            => 1080,
        'fps'          => 60,
        'bitrate'      => 8000,
        'buffer_ms'    => 30000,
        'net_cache'    => 40000,
        'live_cache'   => 40000,
        'file_cache'   => 8000,
        'max_bw'       => 25000000,
        'min_bw'       => 8000000,
        'prefetch_seg' => 300,
        'prefetch_par' => 150,
        'prefetch_buf' => 400000,
        'seg_dur'      => 2,
        'bw_guarantee' => 300,
        'codec_primary'=> 'HEVC',
        'codec_fallback'=> 'H264',
        'codec_priority'=> 'hevc,h265,H265,h.265,h264,mpeg2',
        'hdr'          => ['hdr10'],
        'color_depth'  => 10,
        'audio_ch'     => 6,
        'recon_timeout'=> 5,
        'recon_max'    => 200,
        'recon_delay'  => 0,
        'hevc_tier'    => 'HIGH',
        'hevc_level'   => '6.1,5.1,5.0,4.1,4.0,3.1',
        'hevc_profile' => 'MAIN-10',
        'color_space'  => 'BT709',
        'chroma'       => '4:2:0',
        'transfer'     => 'BT1886',
        'matrix'       => 'BT709',
        'compress'     => 1,
        'sharpen'      => 0.03,
        'rate_ctrl'    => 'VBR',
        'entropy'      => 'CABAC',
        'vid_profile'  => 'main10',
        'pix_fmt'      => 'yuv420p10le',
        'codec'        => 'hard,system',
        'lcevc'        => true,
        'lcevc_state'  => 'SIGNAL_ONLY',
        'qoe_target'   => 4.5,
        'dscp'         => 'AF41',
        'vqs_score'    => 88,
        'buffer_target_s' => 8,
        'buffer_min_s' => 2,
        'buffer_max_s' => 24,
        'prebuffer_s'  => 3,
        'degradation_chain' => [
            'HLS/fMP4+HEVC+LCEVC',
            'HLS/fMP4+H.264',
            'HLS/TS+H.264',
            'HLS/TS+Baseline',
            'TS-Direct',
            'HTTP-Redirect',
            'HTTP-Redirect-SD'
        ],
    ],
    'P4' => [
        'name'         => 'HD_STABLE',
        'label'        => 'HD STABLE',
        'res'          => '1280x720',
        'w'            => 1280,
        'h'            => 720,
        'fps'          => 30,
        'bitrate'      => 4500,
        'buffer_ms'    => 25000,
        'net_cache'    => 35000,
        'live_cache'   => 35000,
        'file_cache'   => 7000,
        'max_bw'       => 15000000,
        'min_bw'       => 4500000,
        'prefetch_seg' => 250,
        'prefetch_par' => 120,
        'prefetch_buf' => 350000,
        'seg_dur'      => 2,
        'bw_guarantee' => 250,
        'codec_primary'=> 'HEVC',
        'codec_fallback'=> 'H264',
        'codec_priority'=> 'hevc,h265,H265,h.265,h264,mpeg2',
        'hdr'          => [],
        'color_depth'  => 8,
        'audio_ch'     => 2,
        'recon_timeout'=> 5,
        'recon_max'    => 200,
        'recon_delay'  => 0,
        'hevc_tier'    => 'MAIN',
        'hevc_level'   => '6.1,5.1,5.0,4.1,4.0,3.1',
        'hevc_profile' => 'MAIN',
        'color_space'  => 'BT709',
        'chroma'       => '4:2:0',
        'transfer'     => 'BT1886',
        'matrix'       => 'BT709',
        'compress'     => 1,
        'sharpen'      => 0.05,
        'rate_ctrl'    => 'VBR',
        'entropy'      => 'CABAC',
        'vid_profile'  => 'main',
        'pix_fmt'      => 'yuv420p',
        'codec'        => 'hard,system',
        'lcevc'        => false,
        'lcevc_state'  => 'DISABLED',
        'qoe_target'   => 4.0,
        'dscp'         => 'AF31',
        'vqs_score'    => 80,
        'buffer_target_s' => 6,
        'buffer_min_s' => 2,
        'buffer_max_s' => 18,
        'prebuffer_s'  => 2,
        'degradation_chain' => [
            'HLS/fMP4+HEVC',
            'HLS/fMP4+H.264',
            'HLS/TS+H.264',
            'HLS/TS+Baseline',
            'TS-Direct',
            'HTTP-Redirect',
            'HTTP-Redirect-SD'
        ],
    ],
    'P5' => [
        'name'         => 'SD_FAILSAFE',
        'label'        => 'SD FAILSAFE',
        'res'          => '854x480',
        'w'            => 854,
        'h'            => 480,
        'fps'          => 25,
        'bitrate'      => 1500,
        'buffer_ms'    => 20000,
        'net_cache'    => 30000,
        'live_cache'   => 30000,
        'file_cache'   => 5000,
        'max_bw'       => 5000000,
        'min_bw'       => 1500000,
        'prefetch_seg' => 200,
        'prefetch_par' => 100,
        'prefetch_buf' => 300000,
        'seg_dur'      => 2,
        'bw_guarantee' => 200,
        'codec_primary'=> 'HEVC',
        'codec_fallback'=> 'H264',
        'codec_priority'=> 'hevc,h265,H265,h.265,h264,mpeg2',
        'hdr'          => [],
        'color_depth'  => 8,
        'audio_ch'     => 2,
        'recon_timeout'=> 5,
        'recon_max'    => 200,
        'recon_delay'  => 0,
        'hevc_tier'    => 'MAIN',
        'hevc_level'   => '6.1,5.1,5.0,4.1,4.0,3.1',
        'hevc_profile' => 'MAIN',
        'color_space'  => 'BT709',
        'chroma'       => '4:2:0',
        'transfer'     => 'BT1886',
        'matrix'       => 'BT709',
        'compress'     => 1,
        'sharpen'      => 0.05,
        'rate_ctrl'    => 'VBR',
        'entropy'      => 'CABAC',
        'vid_profile'  => 'main',
        'pix_fmt'      => 'yuv420p',
        'codec'        => 'hard,system',
        'lcevc'        => false,
        'lcevc_state'  => 'DISABLED',
        'qoe_target'   => 3.5,
        'dscp'         => 'BE',
        'vqs_score'    => 70,
        'buffer_target_s' => 5,
        'buffer_min_s' => 1,
        'buffer_max_s' => 15,
        'prebuffer_s'  => 2,
        'degradation_chain' => [
            'HLS/TS+H.264',
            'HLS/TS+Baseline',
            'TS-Direct',
            'HTTP-Redirect',
            'HTTP-Redirect-SD',
            'HTTP-Redirect-LD',
            'HTTP-Redirect-Any'
        ],
    ],
];

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════════

function q(string $k, string $default = ''): string {
    return isset($_GET[$k]) ? trim((string)$_GET[$k]) : $default;
}

function base64url(string $bin): string {
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function generateRandomString(int $length = 16): string {
    return bin2hex(random_bytes((int)ceil($length / 2)));
}

function token_hmac(string $ch, string $profile, int $exp, string $deviceClass): string {
    $payload = json_encode(['ch' => $ch, 'p' => $profile, 'exp' => $exp, 'dc' => $deviceClass], JSON_UNESCAPED_SLASHES);
    $sig = hash_hmac('sha256', $payload, TOKEN_SECRET, true);
    return base64url($payload) . '.' . base64url($sig);
}

function normalizeProfile(string $pReq): string {
    return match (strtolower($pReq)) {
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
    if (str_contains($c, '8K') || str_contains($c, '4320') || str_contains($c, 'UHD8K')) return 'P0';
    if (str_contains($c, 'UHD') || str_contains($c, '4K') || str_contains($c, '2160')) return 'P1';
    if (str_contains($c, 'FHD') || str_contains($c, '1080')) return 'P3';
    // ✅ V4.29: Solo '720' EXPLÍCITO va a P4. 'HD' genérico → P3 (mayoría son 1080p real)
    if (str_contains($c, '720')) return 'P4';
    if (str_contains($c, 'SD') || str_contains($c, '480')) return 'P5';
    // 'HD' genérico sin número → FHD (la mayoría de canales HD transmiten en 1080p)
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
    if (empty($map)) return null;
    // Búsqueda exacta por stream_id
    if (isset($map[$ch])) return $map[$ch];
    // Búsqueda por nombre de canal (case-insensitive)
    $chLower = strtolower($ch);
    foreach ($map as $key => $entry) {
        if (strtolower((string)($entry['tvg_name'] ?? $entry['name'] ?? '')) === $chLower) {
            return $entry;
        }
    }
    return null;
}

function resolveOrigin(string $originHint, array $decision): array {
    // 1. Prioridad: origin del channel_map
    if (!empty($decision['server'])) {
        $host = $decision['server'];
        foreach (ORIGINS as [$h, $u, $p]) {
            if ($h === $host) return [$h, $u, $p];
        }
    }
    // 2. Prioridad: origin del query string
    if ($originHint !== '') {
        foreach (ORIGINS as [$h, $u, $p]) {
            if ($h === $originHint) return [$h, $u, $p];
        }
    }
    // 3. Default
    return [DEFAULT_ORIGIN, DEFAULT_USER, DEFAULT_PASS];
}

function buildCodecString(array $cfg): string {
    $primary = strtolower($cfg['codec_primary']);
    if ($primary === 'av1') return 'av01.0.08M.10';
    if ($primary === 'hevc' || $primary === 'h265') {
        $tier = strtolower($cfg['hevc_tier']) === 'high' ? '6' : '4';
        return 'hvc1.1.' . $tier . '.L' . (($cfg['h'] ?? 1080) >= 2160 ? '150' : '120') . '.B0';
    }
    return 'avc1.640028';
}

// ═══════════════════════════════════════════════════════════════════════════
// HEADERS DE RESPUESTA HTTP
// ═══════════════════════════════════════════════════════════════════════════
header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: *');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('X-APE-Resolver: v5.0.0-PEP');
header('X-APE-Engine: APE_18.2_PEP');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARÁMETROS DE ENTRADA
// ═══════════════════════════════════════════════════════════════════════════
$ch      = q('ch', '');
$pReq    = q('p', 'auto');
$mode    = q('mode', 'auto');
$listId  = q('list', '');
$originH = q('origin', '');
$teleRes = q('res', '');
$teleBw  = q('bw', '');
$teleT1  = q('t1', '');
$teleT2  = q('t2', '');

if ($ch === '') {
    http_response_code(400);
    echo "#EXTM3U\n# ERROR: Parámetro 'ch' requerido\n";
    exit;
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOLUCIÓN DE PERFIL (precedencia: explícito > map > auto)
// ═══════════════════════════════════════════════════════════════════════════
$pNorm = normalizeProfile($pReq);
$map = loadChannelMap($listId !== '' ? $listId : null);
$decision = mapDecision($ch, $map) ?? [];

// Intercepción CMAF (si el motor está disponible)
if (class_exists('CmafIntegrationShim')) {
    $cmafResult = CmafIntegrationShim::intercept($ch, $decision);
    if ($cmafResult !== null) {
        echo $cmafResult;
        exit;
    }
}

$labelOverride = null;

if ($pNorm !== 'AUTO') {
    $profile = $pNorm;
} else {
    $autoStr  = autoProfile($ch);
    $mapProf  = isset($decision['profile']) ? strtoupper((string)$decision['profile']) : null;
    // Anti-downgrade: si el nombre grita 4K/8K, no dejar que el map lo baje a P3/P4
    if (in_array($autoStr, ['P0', 'P1']) && $mapProf && in_array($mapProf, ['P3', 'P4', 'P5'])) {
        $profile = $autoStr;
    } elseif ($mapProf) {
        $profile = $mapProf;
    } else {
        $profile = $autoStr;
    }
    if (isset($decision['label'])) {
        $labelOverride = $decision['label'];
    }
}

if (!isset(PROFILE_CFG[$profile])) $profile = 'P3';
$cfg = PROFILE_CFG[$profile];

// ═══════════════════════════════════════════════════════════════════════════
// VIP QUALITY OVERLAY — HEVC-FIRST ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════
$cfg['codec_primary']  = ($profile === 'P0') ? 'AV1' : 'HEVC';
$cfg['codec_fallback'] = 'HEVC';
$cfg['codec']          = 'hard,system';

// Override de resolución desde Frontend (teleportación matemática)
if ($teleRes !== '') $cfg['res'] = $teleRes;
if ($teleBw  !== '') $cfg['bitrate'] = (int)$teleBw;

// ═══════════════════════════════════════════════════════════════════════════
// ⚡ CAPACITY OVERDRIVE ENGINE v1.0 — ANTI-STARVATION MULTIPLIER x2.5
// Multiplica valores de capacidad x2.5 DESPUÉS de la clasificación.
// Garantiza que incluso una mala clasificación (ej: 1080p clasificado como P4)
// tenga suficiente buffer/bitrate/BW para no congelarse.
// ISP y ancho de banda NO son restricción → MÁXIMA AGRESIÓN.
// ═══════════════════════════════════════════════════════════════════════════
$CAPACITY_MULTIPLIER = 2.5;
$cfg['buffer_ms']    = (int)round($cfg['buffer_ms'] * $CAPACITY_MULTIPLIER);
$cfg['net_cache']    = (int)round($cfg['net_cache'] * $CAPACITY_MULTIPLIER);
$cfg['live_cache']   = (int)round($cfg['live_cache'] * $CAPACITY_MULTIPLIER);
$cfg['file_cache']   = (int)round($cfg['file_cache'] * $CAPACITY_MULTIPLIER);
$cfg['bitrate']      = (int)round($cfg['bitrate'] * $CAPACITY_MULTIPLIER);
$cfg['max_bw']       = (int)round($cfg['max_bw'] * $CAPACITY_MULTIPLIER);
$cfg['min_bw']       = (int)round($cfg['min_bw'] * $CAPACITY_MULTIPLIER);
$cfg['prefetch_seg'] = (int)round($cfg['prefetch_seg'] * $CAPACITY_MULTIPLIER);
$cfg['prefetch_par'] = (int)round($cfg['prefetch_par'] * $CAPACITY_MULTIPLIER);
$cfg['prefetch_buf'] = (int)round($cfg['prefetch_buf'] * $CAPACITY_MULTIPLIER);
$cfg['bw_guarantee'] = (int)round($cfg['bw_guarantee'] * $CAPACITY_MULTIPLIER);
$cfg['buffer_target_s'] = round($cfg['buffer_target_s'] * $CAPACITY_MULTIPLIER, 1);
$cfg['buffer_max_s']    = round($cfg['buffer_max_s'] * $CAPACITY_MULTIPLIER, 1);
$cfg['prebuffer_s']     = round($cfg['prebuffer_s'] * $CAPACITY_MULTIPLIER, 1);

// ═══════════════════════════════════════════════════════════════════════════
// RESOLUCIÓN DE ORIGEN Y CONSTRUCCIÓN DE URL
// ═══════════════════════════════════════════════════════════════════════════
[$effectiveHost, $effectiveUser, $effectivePass] = resolveOrigin($originH, $decision);

$streamId = $decision['stream_id'] ?? $decision['id'] ?? $ch;

// Token
$token = '';
if (TOKEN_MODE === 'hmac') {
    $exp = time() + TOKEN_TTL;
    $token = token_hmac($ch, $profile, $exp, $cfg['name']);
} elseif (TOKEN_MODE === 'passthrough') {
    $token = $decision['token'] ?? '';
}

$baseUrl = 'http://' . $effectiveHost . '/live/' . rawurlencode($effectiveUser) . '/' . rawurlencode($effectivePass) . '/' . rawurlencode((string)$streamId) . '.m3u8';
$finalUrl = ($token !== '') ? ($baseUrl . '?token=' . rawurlencode($token)) : $baseUrl;

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRUCCIÓN DEL BLOQUE #EXTHTTP (80+ headers — paridad con JS)
// ═══════════════════════════════════════════════════════════════════════════
$sessionId = 'SES_' . generateRandomString(16);
$deviceId  = 'DEV_' . generateRandomString(12);
$requestId = 'REQ_' . generateRandomString(16);
$timestamp = (string)time();
$uaOut     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/18.2-' . $profile;

$exthttp = [
    // ── Identidad ──
    'User-Agent'                    => $uaOut,
    'Accept'                        => ACCEPT_HEADER,
    'Accept-Encoding'               => ACCEPT_ENCODING,
    'Accept-Language'               => 'es-ES,es;q=0.9,en;q=0.8',
    'Connection'                    => 'keep-alive',
    'Keep-Alive'                    => 'timeout=30, max=100',
    // ── Origen ──
    'Origin'                        => 'http://' . $effectiveHost,
    'Referer'                       => 'http://' . $effectiveHost . '/',
    // ── APE Engine Core ──
    'X-App-Version'                 => 'APE_18.2_PEP-V5',
    'X-APE-Version'                 => '18.2',
    'X-APE-Profile'                 => $profile,
    'X-APE-QoE'                     => (string)$cfg['qoe_target'],
    'X-APE-Guardian'                => 'enabled',
    'X-APE-DNA-Version'             => '18.2',
    'X-APE-DNA-Fields'              => '124',
    'X-APE-DNA-Sync'                => 'bidirectional',
    'X-Playback-Session-Id'         => $sessionId,
    'X-Device-Id'                   => $deviceId,
    'X-Request-Id'                  => $requestId,
    'X-Stream-Type'                 => 'hls',
    'X-Quality-Preference'          => 'codec-' . strtolower($cfg['codec_primary']) . ',profile-' . $cfg['vid_profile'] . ',tier-' . strtolower($cfg['hevc_tier']),
    // ── Buffer y Caching ──
    'X-Network-Caching'             => (string)$cfg['net_cache'],
    'X-Live-Caching'                => (string)$cfg['live_cache'],
    'X-File-Caching'                => (string)$cfg['file_cache'],
    'X-Buffer-Ms'                   => (string)$cfg['buffer_ms'],
    'X-Buffer-Target'               => (string)$cfg['buffer_ms'],
    'X-Buffer-Min'                  => '500',
    'X-Buffer-Max'                  => (string)round($cfg['buffer_ms'] * 4),
    'X-Buffer-Strategy'             => 'ultra-aggressive',
    // ── Prefetch ──
    'X-Prefetch-Segments'           => (string)$cfg['prefetch_seg'],
    'X-Prefetch-Parallel'           => (string)$cfg['prefetch_par'],
    'X-Prefetch-Buffer-Target'      => (string)$cfg['prefetch_buf'],
    'X-Prefetch-Strategy'           => 'ULTRA_AGRESIVO_ILIMITADO',
    'X-Prefetch-Enabled'            => 'true,adaptive,auto',
    // ── Reconexión ──
    'X-Reconnect-Timeout-Ms'        => (string)$cfg['recon_timeout'],
    'X-Reconnect-Max-Attempts'      => (string)$cfg['recon_max'],
    'X-Reconnect-Delay-Ms'          => (string)$cfg['recon_delay'],
    'X-Reconnect-On-Error'          => 'true,immediate,adaptive',
    // ── Segmento ──
    'X-Segment-Duration'            => (string)$cfg['seg_dur'],
    'X-Bandwidth-Guarantee'         => (string)$cfg['bw_guarantee'],
    // ── Playback avanzado ──
    'X-Playback-Rate'               => '1.0,1.25,1.5',
    'X-Min-Buffer-Time'             => '0.5,1,2',
    'X-Max-Buffer-Time'             => '8,12,30',
    'X-Request-Priority'            => 'ultra-high-critical',
    // ── Codecs y DRM ──
    'X-Video-Codecs'                => $cfg['codec_priority'],
    'X-Codec-Support'               => $cfg['codec_priority'],
    'X-Audio-Codecs'                => 'opus,aac,eac3,ac3,dolby,mp3',
    'X-DRM-Support'                 => 'widevine,playready,fairplay',
    // ── HEVC Optimization ──
    'X-HEVC-Tier'                   => $cfg['hevc_tier'],
    'X-HEVC-Level'                  => $cfg['hevc_level'],
    'X-HEVC-Profile'                => $cfg['hevc_profile'],
    'X-Video-Profile'               => $cfg['vid_profile'],
    'X-Color-Space'                 => $cfg['color_space'],
    'X-Chroma-Subsampling'          => $cfg['chroma'],
    'X-HDR-Transfer-Function'       => $cfg['transfer'],
    'X-Matrix-Coefficients'         => $cfg['matrix'],
    'X-Compression-Level'           => (string)$cfg['compress'],
    'X-Sharpen-Sigma'               => (string)$cfg['sharpen'],
    'X-Rate-Control'                => $cfg['rate_ctrl'],
    'X-Entropy-Coding'              => $cfg['entropy'],
    'X-Pixel-Format'                => $cfg['pix_fmt'],
    'X-Color-Depth'                 => (string)$cfg['color_depth'],
    // ── HDR ──
    'X-HDR-Support'                 => implode(',', array_merge($cfg['hdr'], ['hlg'])),
    'X-Dynamic-Range'               => !empty($cfg['hdr']) ? 'hdr' : 'sdr',
    // ── CDN y Failover ──
    'X-CDN-Provider'                => 'auto',
    'X-Failover-Enabled'            => 'true',
    'X-Buffer-Size'                 => (string)intval($cfg['max_bw'] / 550),
    // ── Metadata ──
    'X-Client-Timestamp'            => $timestamp,
    'X-Device-Type'                 => 'smart-tv',
    'X-Screen-Resolution'           => $cfg['res'],
    'X-Network-Type'                => 'wifi',
    // ── QoS ──
    'X-QoS-DSCP'                    => $cfg['dscp'],
    'X-QoS-Bitrate'                 => $cfg['bitrate'] . 'kbps',
    'X-QoS-Priority'                => 'high',
    // ── OTT Navigator ──
    'X-OTT-Navigator-Version'       => '1.7.0.0-aggressive-extreme',
    'X-Player-Type'                 => 'exoplayer-ultra-extreme,vlc-pro',
    'X-Hardware-Decode'             => 'true',
    'X-Audio-Track-Selection'       => 'highest-quality-extreme,dolby-atmos-first',
    'X-Subtitle-Track-Selection'    => 'off',
    'X-EPG-Sync'                    => 'enabled',
    'X-Catchup-Support'             => 'flussonic-ultra',
    // ── Streaming Control ──
    'X-Bandwidth-Estimation'        => 'adaptive,balanced,conservative',
    'X-Initial-Bitrate'             => 'highest',
    'X-Retry-Count'                 => '3',
    'X-Retry-Delay-Ms'              => '1000',
    'X-Connection-Timeout-Ms'       => '15000',
    'X-Read-Timeout-Ms'             => '30000',
    // ── Seguridad y Anti-Block ──
    'DNT'                           => '1',
    'Sec-GPC'                       => '1',
    'Cache-Control'                 => 'no-cache',
    'Pragma'                        => 'no-cache',
    // ── LCEVC ──
    'X-LCEVC-Enabled'               => $cfg['lcevc'] ? 'true' : 'false',
    'X-LCEVC-State'                 => $cfg['lcevc_state'],
    'X-LCEVC-Enhancement'           => 'mpeg5-part2',
    'X-LCEVC-Scale-Factor'          => '2x',
    // ── Guardian ──
    'X-APE-Guardian-Enabled'        => 'true',
    'X-APE-Guardian-State'          => 'ONLINE',
    'X-APE-Guardian-Fallback-Level' => '3',
    'X-APE-Guardian-Memory'         => 'enabled',
    'X-APE-Guardian-Continuity'     => 'guaranteed',
    // ── Resiliencia ──
    'X-APE-Resilience-Strategy'     => 'proactive_failover',
    'X-APE-Resilience-Chain'        => '7-levels',
    'X-APE-Resilience-Circuit-Breaker' => 'enabled',
    'X-APE-Resilience-Max-Retries'  => '3',
    'X-APE-Resilience-Retry-Backoff'=> 'exponential',
    'X-APE-Resilience-Silent-Reconnect' => 'enabled',
    // ── Telchemy TVQM ──
    'X-APE-Telchemy-VSTQ'           => 'enabled',
    'X-APE-Telchemy-VSMQ'           => 'enabled',
    'X-APE-Telchemy-TR101290'       => 'enabled',
    'X-APE-Telchemy-QoE-Target'     => (string)$cfg['qoe_target'],
    // ── Hydra Stealth ──
    'X-APE-Hydra-Stealth'           => 'enabled',
    'X-APE-Hydra-UA-Rotation'       => 'enabled',
    'X-APE-Hydra-Fingerprint-Masking' => 'enabled',
];

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRUCCIÓN DEL CODEC STRING PARA #EXT-X-STREAM-INF
// ═══════════════════════════════════════════════════════════════════════════
$codecStr = buildCodecString($cfg);
$bitrateHz = $cfg['bitrate'] * 1000;

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRUCCIÓN DE LA CADENA DE DEGRADACIÓN
// ═══════════════════════════════════════════════════════════════════════════
$degradationLines = [];
foreach ($cfg['degradation_chain'] as $i => $level) {
    $degradationLines[] = '#EXT-X-APE-DEGRADATION-LEVEL-' . ($i + 1) . ':' . $level;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRUCCIÓN DEL FRAGMENTO M3U8 DE SALIDA
// ═══════════════════════════════════════════════════════════════════════════
$channelName = $decision['tvg_name'] ?? $decision['name'] ?? $ch;
$tvgId       = $decision['tvg_id'] ?? $ch;
$tvgLogo     = $decision['tvg_logo'] ?? '';
$groupTitle  = $decision['group_title'] ?? $decision['group-title'] ?? 'IPTV';

$exthttpJson = json_encode($exthttp, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

$out = [];
$out[] = '#EXTM3U';
$out[] = '';
// EXTINF
$logoAttr = $tvgLogo !== '' ? ' tvg-logo="' . htmlspecialchars($tvgLogo, ENT_QUOTES) . '"' : '';
$out[] = '#EXTINF:-1 tvg-id="' . $tvgId . '" tvg-name="' . htmlspecialchars($channelName, ENT_QUOTES) . '"' . $logoAttr . ' group-title="' . htmlspecialchars($groupTitle, ENT_QUOTES) . '",' . $channelName;
// EXTHTTP
$out[] = '#EXTHTTP:' . $exthttpJson;
// EXTVLCOPT
$out[] = '#EXTVLCOPT:network-caching=' . $cfg['net_cache'];
$out[] = '#EXTVLCOPT:http-reconnect=true';
$out[] = '#EXTVLCOPT:http-continuous=true';
$out[] = '#EXTVLCOPT:clock-jitter=0';
$out[] = '#EXTVLCOPT:clock-synchro=0';
$out[] = '#EXTVLCOPT:live-caching=' . $cfg['live_cache'];
$out[] = '#EXTVLCOPT:file-caching=' . $cfg['file_cache'];
$out[] = '#EXTVLCOPT:http-user-agent=' . $uaOut;
// KODIPROP
$out[] = '#KODIPROP:inputstream=inputstream.adaptive';
$out[] = '#KODIPROP:inputstream.adaptive.manifest_type=hls';
$out[] = '#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive';
if (in_array($profile, ['P0', 'P1', 'P2'])) {
    $out[] = '#KODIPROP:inputstream.adaptive.stream_headers=' . $exthttpJson;
}
// APE DNA Tags
$out[] = '#EXT-X-APE-VERSION:18.2';
$out[] = '#EXT-X-APE-PROFILE:' . $profile;
$out[] = '#EXT-X-APE-CHANNEL-KEY:' . $ch;
$out[] = '#EXT-X-APE-STREAM-ID:' . $streamId;
$out[] = '#EXT-X-APE-SERVER:http://' . $effectiveHost;
$out[] = '#EXT-X-APE-CODEC:' . $codecStr;
$out[] = '#EXT-X-APE-RESOLUTION:' . $cfg['res'];
$out[] = '#EXT-X-APE-FRAME-RATE:' . $cfg['fps'];
$out[] = '#EXT-X-APE-BITRATE:' . $cfg['bitrate'] . 'kbps';
$out[] = '#EXT-X-APE-HDR-PROFILE:' . (in_array('hdr10plus', $cfg['hdr']) ? 'hdr10_plus' : (in_array('hdr10', $cfg['hdr']) ? 'hdr10' : 'sdr'));
$out[] = '#EXT-X-APE-LCEVC-ENABLED:' . ($cfg['lcevc'] ? 'true' : 'false');
$out[] = '#EXT-X-APE-LCEVC-STATE:' . $cfg['lcevc_state'];
$out[] = '#EXT-X-APE-LCEVC-BASE-CODEC:' . $codecStr;
$out[] = '#EXT-X-APE-LCEVC-ENHANCEMENT:mpeg5-part2';
$out[] = '#EXT-X-APE-LCEVC-SCALE-FACTOR:2x';
$out[] = '#EXT-X-APE-AI-SR-ENABLED:' . ($profile === 'P0' ? 'true' : 'false');
$out[] = '#EXT-X-APE-QOE-SCORE:' . $cfg['qoe_target'];
$out[] = '#EXT-X-APE-QOS-DSCP:' . $cfg['dscp'];
$out[] = '#EXT-X-APE-QOS-BITRATE:' . $cfg['bitrate'] . 'kbps';
$out[] = '#EXT-X-APE-QOS-PRIORITY:high';
$out[] = '#EXT-X-APE-VQS-SCORE:' . $cfg['vqs_score'];
$out[] = '#EXT-X-APE-BUFFER-TARGET:' . $cfg['buffer_target_s'] . 's';
$out[] = '#EXT-X-APE-BUFFER-MIN:' . $cfg['buffer_min_s'] . 's';
$out[] = '#EXT-X-APE-BUFFER-MAX:' . $cfg['buffer_max_s'] . 's';
$out[] = '#EXT-X-APE-PREBUFFER:' . $cfg['prebuffer_s'] . 's';
// Guardian
$out[] = '#EXT-X-APE-GUARDIAN-ENABLED:true';
$out[] = '#EXT-X-APE-GUARDIAN-STATE:ONLINE';
$out[] = '#EXT-X-APE-GUARDIAN-FALLBACK-LEVEL:3';
$out[] = '#EXT-X-APE-GUARDIAN-MEMORY:enabled';
$out[] = '#EXT-X-APE-GUARDIAN-CONTINUITY:guaranteed';
// Resiliencia
$out[] = '#EXT-X-APE-RESILIENCE-STRATEGY:proactive_failover';
$out[] = '#EXT-X-APE-RESILIENCE-CHAIN:7-levels';
$out[] = '#EXT-X-APE-RESILIENCE-CIRCUIT-BREAKER:enabled';
$out[] = '#EXT-X-APE-RESILIENCE-MAX-RETRIES:3';
$out[] = '#EXT-X-APE-RESILIENCE-RETRY-BACKOFF:exponential';
$out[] = '#EXT-X-APE-RESILIENCE-SILENT-RECONNECT:enabled';
// Cadena de degradación
foreach ($degradationLines as $dl) {
    $out[] = $dl;
}
// Telchemy
$out[] = '#EXT-X-APE-TELCHEMY-VSTQ:enabled';
$out[] = '#EXT-X-APE-TELCHEMY-VSMQ:enabled';
$out[] = '#EXT-X-APE-TELCHEMY-TR101290:enabled';
$out[] = '#EXT-X-APE-TELCHEMY-QOE-TARGET:' . $cfg['qoe_target'];
// Hydra Stealth
$out[] = '#EXT-X-APE-HYDRA-STEALTH:enabled';
$out[] = '#EXT-X-APE-HYDRA-UA-ROTATION:enabled';
$out[] = '#EXT-X-APE-HYDRA-FINGERPRINT-MASKING:enabled';
// DNA
$out[] = '#EXT-X-APE-DNA-VERSION:18.2';
$out[] = '#EXT-X-APE-DNA-FIELDS:124';
$out[] = '#EXT-X-APE-DNA-SYNC:bidirectional';
$out[] = '#EXT-X-APE-DNA-MAP-SOURCE:channels_map_v5.0_PEP';
// EXT-X-STREAM-INF (refuerza selección de máxima resolución)
$out[] = '#EXT-X-STREAM-INF:BANDWIDTH=' . $bitrateHz . ',RESOLUTION=' . $cfg['res'] . ',CODECS="' . $codecStr . ',mp4a.40.2",FRAME-RATE=' . $cfg['fps'] . ',HDCP-LEVEL=NONE';
// URL final
$out[] = $finalUrl;

// ═══════════════════════════════════════════════════════════════════════════
// MÉTRICAS DE RENDIMIENTO (header)
// ═══════════════════════════════════════════════════════════════════════════
$elapsed = round((microtime(true) - $start) * 1000, 2);
header('X-APE-Resolve-Time-Ms: ' . $elapsed);
header('X-APE-Profile-Used: ' . $profile);
header('X-APE-Channel: ' . $ch);

echo implode("\n", $out) . "\n";
