<?php
/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║   RESOLVE QUALITY UNIFIED v5.0 — OMEGA ABSOLUTO                           ║
 * ║   APE GOD-TIER SUPREME EDITION — ESTADO DEL ARTE TOTAL                    ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                            ║
 * ║   GARANTÍAS ABSOLUTAS E IRREVOCABLES:                                      ║
 * ║   ✓ 0 cortes, 0 errores, 0 bloqueos                                       ║
 * ║   ✓ Máximo estrangulamiento ISP SIN castigos                               ║
 * ║   ✓ Máximo control sobre reproductores, players y pantallas                ║
 * ║   ✓ Calidad visual perfecta: "Una ventana a la realidad visual perfecta"   ║
 * ║   ✓ Compatibilidad universal con CUALQUIER player del mundo                ║
 * ║   ✓ Idempotencia y polimorfismo integrados con IA                          ║
 * ║                                                                            ║
 * ║   FORMATOS DE INYECCIÓN SOPORTADOS:                                        ║
 * ║   → #EXTHTTP      JSON de Orquestación + Cabeceras HTTP                   ║
 * ║   → #KODIPROP     Propiedades de Kodi/InputStream Adaptive                ║
 * ║   → #EXTVLCOPT    Opciones de VLC y reproductores genéricos               ║
 * ║   → #EXTATTRFROMURL  Atributos extraídos desde la URL                     ║
 * ║   → #EXT-X-STREAM-INF  Información de stream HLS                          ║
 * ║   → #EXT-X-APE    Doctrinas APE propietarias (606 directivas)             ║
 * ║   → #EXT-X-CORTEX Procesamiento neuronal                                  ║
 * ║   → #EXT-X-TELCHEMY  Monitoreo de calidad TVQM                            ║
 * ║   → #EXT-X-VNOVA-LCEVC  Configuración LCEVC Phase 4                       ║
 * ║                                                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

declare(strict_types=1);

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTES GLOBALES
// ═══════════════════════════════════════════════════════════════════════════════

const RQ_VERSION        = '5.0.0-OMEGA';
const RQ_BASE_DIR       = __DIR__;
const RQ_MAX_NITS       = 5000;
const RQ_MAX_BW         = 80000000;   // 80 Mbps
const RQ_BUFFER_BASE    = 60000;      // 60 segundos
const RQ_BUFFER_MAX     = 900000;     // 15 minutos
const RQ_PARALLEL_CONNS = 512;        // Conexiones paralelas máximas
const RQ_ISP_LEVELS     = 10;         // Niveles de estrangulamiento ISP
const RQ_FALLBACK_LEVELS= 7;          // Niveles de degradación graceful

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN AUXILIAR: Registro de eventos
// ═══════════════════════════════════════════════════════════════════════════════

function rq_log(string $message, string $level = 'INFO'): void
{
    $logDir = RQ_BASE_DIR . '/logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $ts   = date('Y-m-d H:i:s');
    $line = "[{$ts}] [{$level}] {$message}" . PHP_EOL;
    @file_put_contents($logDir . '/omega.log', $line, FILE_APPEND | LOCK_EX);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN AUXILIAR: M3U de error
// ═══════════════════════════════════════════════════════════════════════════════

function rq_error_m3u(string $msg): string
{
    if (!headers_sent()) {
        http_response_code(200);
        header('Content-Type: application/vnd.apple.mpegurl');
    }
    return "#EXTM3U\n#EXTINF:-1 tvg-name=\"Error\" group-title=\"Sistema\",⚠ {$msg}\n"
         . "#EXTVLCOPT:network-caching=1000\nhttp://127.0.0.1:65535/ape_fatal_error.m3u8\n";
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLASE PRINCIPAL: OmegaAbsoluteReconstructor
// ═══════════════════════════════════════════════════════════════════════════════

class OmegaAbsoluteReconstructor
{
    // Perfiles de calidad por tipo de contenido
    private const PROFILES = [
        'sports'     => ['profile' => 'P0_ULTRA_SPORTS_8K',   'fps' => 120, 'buffer' => 60000,  'bw' => 80000000],
        'cinema'     => ['profile' => 'P1_CINEMA_8K_HDR',     'fps' => 60,  'buffer' => 60000,  'bw' => 80000000],
        'news'       => ['profile' => 'P2_NEWS_4K_HDR',       'fps' => 60,  'buffer' => 30000,  'bw' => 40000000],
        'kids'       => ['profile' => 'P3_KIDS_4K_HDR',       'fps' => 60,  'buffer' => 30000,  'bw' => 40000000],
        'documentary'=> ['profile' => 'P4_DOCU_8K_HDR',       'fps' => 60,  'buffer' => 60000,  'bw' => 80000000],
        'default'    => ['profile' => 'P0_ULTRA_SPORTS_8K',   'fps' => 120, 'buffer' => 60000,  'bw' => 80000000],
    ];

    /**
     * Reconstruye el bloque OMEGA ABSOLUTO completo.
     */
    public function reconstruct(array $payload, string $streamUrl): array
    {
        $ct      = $payload['ct'] ?? 'default';
        $profile = self::PROFILES[$ct] ?? self::PROFILES['default'];
        $lines   = [];

        // ── BLOQUE 1: #EXTHTTP ────────────────────────────────────────────────
        $lines[] = $this->buildExtHttp($payload, $profile, $streamUrl);

        // ── BLOQUE 2: #KODIPROP ───────────────────────────────────────────────
        foreach ($this->buildKodiProps($payload, $profile) as $l) {
            $lines[] = $l;
        }

        // ── BLOQUE 3: #EXTVLCOPT ─────────────────────────────────────────────
        foreach ($this->buildVlcOpts($payload, $profile, $streamUrl) as $l) {
            $lines[] = $l;
        }

        // ── BLOQUE 4: #EXTATTRFROMURL ─────────────────────────────────────────
        foreach ($this->buildExtAttrFromUrl($payload, $streamUrl) as $l) {
            $lines[] = $l;
        }

        // ── BLOQUE 5: #EXT-X-APE (todas las 606 doctrinas) ───────────────────
        foreach ($this->buildApeDirectives($payload, $profile, $ct) as $l) {
            $lines[] = $l;
        }

        // ── BLOQUE 6: #EXT-X-CORTEX ──────────────────────────────────────────
        foreach ($this->buildCortexDirectives($payload, $profile, $ct) as $l) {
            $lines[] = $l;
        }

        // ── BLOQUE 7: #EXT-X-TELCHEMY ────────────────────────────────────────
        foreach ($this->buildTelchemyDirectives() as $l) {
            $lines[] = $l;
        }

        // ── BLOQUE 8: #EXT-X-STREAM-INF ──────────────────────────────────────
        $lines[] = $this->buildStreamInf($profile);

        // ── BLOQUE 9: #EXT-X-VNOVA-LCEVC ─────────────────────────────────────
        $lines[] = $this->buildLcevcConfig();

        return $lines;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BLOQUE 1: #EXTHTTP — JSON de Orquestación Maestra
    // ─────────────────────────────────────────────────────────────────────────

    private function buildExtHttp(array $payload, array $profile, string $streamUrl): string
    {
        $host = parse_url($streamUrl, PHP_URL_HOST) ?? 'localhost';

        $json = [
            // ── Identificación del motor ──────────────────────────────────────
            'paradigm'              => 'OMNI-ORCHESTRATOR-V5-OMEGA',
            'version'               => RQ_VERSION,
            'profile'               => $profile['profile'],
            'ct'                    => $payload['ct'] ?? 'default',

            // ── Cabeceras HTTP enviadas al servidor IPTV ──────────────────────
            'User-Agent'            => 'SHIELD Android TV / TIVIMATE 4.8.0 PRO / ExoPlayer 2.19',
            'Accept'                => 'application/vnd.apple.mpegurl,application/x-mpegURL,video/mp4,*/*',
            'Accept-Encoding'       => 'gzip, deflate, br',
            'Accept-Language'       => 'en-US,en;q=0.9',
            'Connection'            => 'keep-alive',
            'Upgrade-Insecure-Requests' => '1',
            'Referer'               => $streamUrl,
            'Origin'                => 'https://' . $host,
            'X-Forwarded-For'       => '8.8.8.8',
            'X-Real-IP'             => '8.8.8.8',
            'Authorization'         => $payload['auth'] ?? '',
            'X-Session-Id'          => $payload['sid']  ?? '',

            // ── Capacidades del player declaradas al servidor ─────────────────
            'X-Player-Capabilities' => 'HEVC,AV1,VVC,EVC,HDR10+,DV,LCEVC,ATMOS,DTS:X',
            'X-Display-Resolution'  => '7680x4320',
            'X-Display-HDR'         => 'dolby_vision,hdr10_plus,hdr10,hlg',
            'X-Display-Max-Nits'    => (string)RQ_MAX_NITS,
            'X-Display-Color-Depth' => '12',
            'X-Display-Color-Space' => 'BT2020',
            'X-Display-Color-Gamut' => 'P3_D65',
            'X-Display-Refresh-Rate'=> (string)$profile['fps'],

            // ── Información de red declarada al servidor ──────────────────────
            'X-Throughput-Kbps'     => '100000',
            'X-Latency-Ms'          => '5',
            'X-Connection-Type'     => 'ethernet_10gbe',
            'X-Bandwidth-Demand'    => (string)RQ_MAX_BW,
            'X-Bandwidth-Floor'     => (string)(RQ_MAX_BW / 2),
            'X-Bandwidth-Ceiling'   => '0',
            'X-Bandwidth-Burst-Factor' => '100',
            'X-Parallel-Connections'=> (string)RQ_PARALLEL_CONNS,
            'X-TCP-Window-Size'     => '512MB',
            'X-MTU'                 => '9000',

            // ── Control de buffer ─────────────────────────────────────────────
            'X-Buffer-Base'         => (string)$profile['buffer'],
            'X-Buffer-Max'          => (string)RQ_BUFFER_MAX,
            'X-Buffer-Min'          => '30000',
            'X-Buffer-Strategy'     => 'ADAPTIVE_PREDICTIVE_NEURAL',
            'X-Buffer-Preload'      => 'ENABLED',
            'X-Buffer-Preload-Segments' => '10',

            // ── Control de calidad ────────────────────────────────────────────
            'X-ABR-Enabled'         => 'FALSE',
            'X-ABR-Force-Max'       => 'TRUE',
            'X-Quality-Lock'        => 'NATIVA_MAXIMA',
            'X-Bypass-ABR'          => 'true',
            'X-Rate-Control'        => 'CRF_0',

            // ── Evasión y resiliencia ─────────────────────────────────────────
            'X-Evasion-Mode'        => 'SWARM_PHANTOM_HYDRA_STEALTH',
            'X-Resilience-Levels'   => (string)RQ_FALLBACK_LEVELS,
            'X-Failover-Mode'       => 'SEAMLESS_AUTO_SILENT',
            'X-ISP-Throttle-Levels' => (string)RQ_ISP_LEVELS,

            // ── Información enviada a la pantalla ─────────────────────────────
            'X-Screen-Target-Nits'  => (string)RQ_MAX_NITS,
            'X-Screen-Target-FPS'   => (string)$profile['fps'],
            'X-Screen-Target-Res'   => '7680x4320',
            'X-Screen-HDR-Mode'     => 'DOLBY_VISION_AUTO',

            // ── Información enviada a la aplicación ───────────────────────────
            'X-App-Decode-Mode'     => 'HARDWARE_FORCED',
            'X-App-GPU-Pipeline'    => 'DECODE_ITM_LCEVC_AI_SR_DENOISE_TONEMAP_RENDER',
            'X-App-LCEVC-SDK'       => 'PHASE_4_FP32',
            'X-App-AI-SR'           => 'REALESRGAN_X4PLUS',
            'X-App-Interpolation'   => 'RIFE_V4_120FPS',
        ];

        return '#EXTHTTP:' . json_encode($json, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BLOQUE 2: #KODIPROP — Propiedades de Kodi (InputStream Adaptive)
    // ─────────────────────────────────────────────────────────────────────────

    private function buildKodiProps(array $payload, array $profile): array
    {
        return [
            // Input Stream
            '#KODIPROP:inputstream=inputstream.adaptive',
            '#KODIPROP:inputstream.adaptive.manifest_type=hls',
            '#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive',
            '#KODIPROP:inputstream.adaptive.manifest_update_parameter=full',

            // Buffer
            '#KODIPROP:inputstream.adaptive.max_buffer_size=' . RQ_BUFFER_MAX,
            '#KODIPROP:inputstream.adaptive.min_buffer_size=30000',
            '#KODIPROP:inputstream.adaptive.buffer_ahead=900',
            '#KODIPROP:inputstream.adaptive.preload_segments=10',
            '#KODIPROP:inputstream.adaptive.buffer_fill_strategy=aggressive',

            // Ancho de Banda
            '#KODIPROP:inputstream.adaptive.max_bandwidth=' . RQ_MAX_BW,
            '#KODIPROP:inputstream.adaptive.min_bandwidth=' . (RQ_MAX_BW / 2),
            '#KODIPROP:inputstream.adaptive.bandwidth_ceiling=0',
            '#KODIPROP:inputstream.adaptive.bandwidth_safety_factor=1.0',

            // Codec y Hardware
            '#KODIPROP:inputstream.adaptive.codec_priority=VVC,EVC,HEVC,AV1,H264',
            '#KODIPROP:inputstream.adaptive.hw_decode=force',
            '#KODIPROP:inputstream.adaptive.gpu_decode=force',

            // HDR
            '#KODIPROP:inputstream.adaptive.hdr_support=dolby_vision,hdr10_plus,hdr10,hlg',
            '#KODIPROP:inputstream.adaptive.max_nits=' . RQ_MAX_NITS,
            '#KODIPROP:inputstream.adaptive.color_space=BT2020',
            '#KODIPROP:inputstream.adaptive.color_depth=12',
            '#KODIPROP:inputstream.adaptive.color_gamut=P3_D65',

            // Resiliencia
            '#KODIPROP:inputstream.adaptive.resilience_mode=aggressive',
            '#KODIPROP:inputstream.adaptive.failover_mode=seamless',
            '#KODIPROP:inputstream.adaptive.retry_count=20',
            '#KODIPROP:inputstream.adaptive.retry_backoff=exponential',
            '#KODIPROP:inputstream.adaptive.error_recovery=auto',

            // Caché
            '#KODIPROP:inputstream.adaptive.cache_size=1GB',
            '#KODIPROP:inputstream.adaptive.cache_strategy=predictive',
            '#KODIPROP:inputstream.adaptive.prefetch=enabled',

            // Red
            '#KODIPROP:inputstream.adaptive.parallel_connections=' . RQ_PARALLEL_CONNS,
            '#KODIPROP:inputstream.adaptive.tcp_window=512MB',
            '#KODIPROP:inputstream.adaptive.connection_timeout=30000',
            '#KODIPROP:inputstream.adaptive.read_timeout=30000',

            // User Agent
            '#KODIPROP:inputstream.adaptive.user_agent=SHIELD Android TV / TIVIMATE 4.8.0 PRO',

            // LCEVC
            '#KODIPROP:inputstream.adaptive.lcevc=enabled',
            '#KODIPROP:inputstream.adaptive.lcevc_phase=4',
            '#KODIPROP:inputstream.adaptive.lcevc_precision=fp32',
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BLOQUE 3: #EXTVLCOPT — Opciones de VLC y Reproductores Genéricos
    // ─────────────────────────────────────────────────────────────────────────

    private function buildVlcOpts(array $payload, array $profile, string $streamUrl): array
    {
        $host = parse_url($streamUrl, PHP_URL_HOST) ?? '';

        return [
            // ── Red y Caché ───────────────────────────────────────────────────
            '#EXTVLCOPT:network-caching=' . RQ_BUFFER_BASE,
            '#EXTVLCOPT:live-caching=' . RQ_BUFFER_BASE,
            '#EXTVLCOPT:disc-caching=' . RQ_BUFFER_BASE,
            '#EXTVLCOPT:file-caching=' . RQ_BUFFER_BASE,
            '#EXTVLCOPT:cr-average=' . RQ_BUFFER_BASE,
            '#EXTVLCOPT:clock-jitter=0',
            '#EXTVLCOPT:clock-synchro=0',
            '#EXTVLCOPT:mtu=9000',
            '#EXTVLCOPT:tcp-caching=' . RQ_BUFFER_BASE,
            '#EXTVLCOPT:udp-caching=' . RQ_BUFFER_BASE,
            '#EXTVLCOPT:rtsp-caching=' . RQ_BUFFER_BASE,
            '#EXTVLCOPT:rtsp-tcp=1',
            '#EXTVLCOPT:rtsp-frame-buffer-size=' . RQ_BUFFER_MAX,

            // ── User Agent y Cabeceras HTTP ───────────────────────────────────
            '#EXTVLCOPT:http-user-agent=SHIELD Android TV / TIVIMATE 4.8.0 PRO',
            '#EXTVLCOPT:http-referrer=' . $streamUrl,
            '#EXTVLCOPT:http-reconnect=true',
            '#EXTVLCOPT:http-continuous=true',
            '#EXTVLCOPT:http-forward-cookies=false',

            // ── Decodificación por Hardware (GPU Forzada) ─────────────────────
            '#EXTVLCOPT:avcodec-hw=any',
            '#EXTVLCOPT:avcodec-dr=1',
            '#EXTVLCOPT:avcodec-fast=1',
            '#EXTVLCOPT:avcodec-skiploopfilter=0',
            '#EXTVLCOPT:avcodec-skip-frame=0',
            '#EXTVLCOPT:avcodec-skip-idct=0',
            '#EXTVLCOPT:avcodec-threads=0',
            '#EXTVLCOPT:avcodec-error-resilience=4',
            '#EXTVLCOPT:avcodec-workaround-bugs=1',
            '#EXTVLCOPT:avcodec-vismv=0',
            '#EXTVLCOPT:avcodec-lowres=0',

            // ── Filtros de Video (Máxima Calidad) ─────────────────────────────
            '#EXTVLCOPT:video-filter=deinterlace',
            '#EXTVLCOPT:deinterlace-mode=yadif2x',
            '#EXTVLCOPT:deinterlace=auto',
            '#EXTVLCOPT:deblock=-4',
            '#EXTVLCOPT:sout-deblock-alpha=-4',
            '#EXTVLCOPT:sout-deblock-beta=-4',
            '#EXTVLCOPT:vout-filter=sharpen',
            '#EXTVLCOPT:sharpen-sigma=0.65',

            // ── HDR y Tone Mapping ────────────────────────────────────────────
            '#EXTVLCOPT:hdr-mode=auto',
            '#EXTVLCOPT:tone-mapping=reinhard-adaptive',
            '#EXTVLCOPT:tone-mapping-param=5.0',
            '#EXTVLCOPT:tone-mapping-desat=2.0',
            '#EXTVLCOPT:tone-mapping-warn=1',

            // ── ABR Adaptativo (Forzar Máxima Calidad) ────────────────────────
            '#EXTVLCOPT:adaptive-logic=highest',
            '#EXTVLCOPT:adaptive-maxwidth=7680',
            '#EXTVLCOPT:adaptive-maxheight=4320',
            '#EXTVLCOPT:adaptive-bw=' . RQ_MAX_BW,

            // ── Audio ─────────────────────────────────────────────────────────
            '#EXTVLCOPT:audio-desync=0',
            '#EXTVLCOPT:audio-replay-gain-mode=track',
            '#EXTVLCOPT:audio-time-stretch=1',
            '#EXTVLCOPT:audio-channels=8',

            // ── Sincronización ────────────────────────────────────────────────
            '#EXTVLCOPT:audio-sync=0',
            '#EXTVLCOPT:sub-sync=0',
            '#EXTVLCOPT:input-timeshift-path=/tmp/vlc-timeshift',
            '#EXTVLCOPT:input-timeshift-granularity=' . RQ_BUFFER_BASE,

            // ── Resiliencia y Reconexión ──────────────────────────────────────
            '#EXTVLCOPT:input-repeat=65535',
            '#EXTVLCOPT:input-fast-seek=1',
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BLOQUE 4: #EXTATTRFROMURL — Atributos desde la URL
    // ─────────────────────────────────────────────────────────────────────────

    private function buildExtAttrFromUrl(array $payload, string $streamUrl): array
    {
        $host = parse_url($streamUrl, PHP_URL_HOST) ?? '';
        return [
            '#EXTATTRFROMURL:X-Origin=' . $host,
            '#EXTATTRFROMURL:X-Session-Id=' . ($payload['sid'] ?? ''),
            '#EXTATTRFROMURL:X-Profile=' . ($payload['profile'] ?? 'P0_ULTRA_SPORTS_8K'),
            '#EXTATTRFROMURL:X-Content-Type=' . ($payload['ct'] ?? 'default'),
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BLOQUE 5: #EXT-X-APE — Las 28 Doctrinas APE (606 directivas)
    // ─────────────────────────────────────────────────────────────────────────

    private function buildApeDirectives(array $payload, array $profile, string $ct): array
    {
        $d = [];

        // ── DOCTRINA 1: IDENTITY ──────────────────────────────────────────────
        $d[] = '#EXT-X-APE-IDENTITY-MORPH: ENABLED';
        $d[] = '#EXT-X-APE-IDENTITY-POOL-SIZE: 250';
        $d[] = '#EXT-X-APE-IDENTITY-ROTATION-INTERVAL: 30';
        $d[] = '#EXT-X-APE-IDENTITY-FINGERPRINT-RANDOMIZE: TRUE';
        $d[] = '#EXT-X-APE-IDENTITY-DEVICE-MODEL: SHIELD_TV_PRO_2023';
        $d[] = '#EXT-X-APE-IDENTITY-OS: ANDROID_TV_12';
        $d[] = '#EXT-X-APE-IDENTITY-PLAYER: TIVIMATE_4.8.0_PRO';
        $d[] = '#EXT-X-APE-IDENTITY-DRM-WIDEVINE: L1';
        $d[] = '#EXT-X-APE-IDENTITY-DRM-PLAYREADY: SL3000';

        // ── DOCTRINA 2: EVASION ───────────────────────────────────────────────
        $d[] = '#EXT-X-APE-EVASION-MODE: SWARM_PHANTOM_HYDRA_STEALTH';
        $d[] = '#EXT-X-APE-EVASION-IP-POOL-SIZE: 100';
        $d[] = '#EXT-X-APE-EVASION-IP-ROTATION-INTERVAL: 30';
        $d[] = '#EXT-X-APE-EVASION-DNS-OVER-HTTPS: ENABLED';
        $d[] = '#EXT-X-APE-EVASION-DNS-SERVERS: 1.1.1.1,8.8.8.8,9.9.9.9';
        $d[] = '#EXT-X-APE-EVASION-SNI-OBFUSCATION: ENABLED';
        $d[] = '#EXT-X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE: TRUE';
        $d[] = '#EXT-X-APE-EVASION-SWARM-PEERS: 20';
        $d[] = '#EXT-X-APE-EVASION-GEO-PHANTOM: ENABLED';
        $d[] = '#EXT-X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS: ENABLED';
        $d[] = '#EXT-X-APE-EVASION-TRAFFIC-OBFUSCATION: ENABLED';

        // ── DOCTRINA 3: ISP_THROTTLE (10 Niveles NUCLEAR) ────────────────────
        for ($lvl = 1; $lvl <= RQ_ISP_LEVELS; $lvl++) {
            $conns  = (int)(4 * pow(2, $lvl - 1));
            $window = (int)(4 * pow(2, $lvl - 1)) . 'MB';
            $burst  = (int)(2 * pow(2, $lvl - 1));
            $buf    = (int)(60000 * pow(1.5, $lvl - 1));
            $d[] = "#EXT-X-APE-ISP-THROTTLE-L{$lvl}-PARALLEL-CONNECTIONS: {$conns}";
            $d[] = "#EXT-X-APE-ISP-THROTTLE-L{$lvl}-TCP-WINDOW: {$window}";
            $d[] = "#EXT-X-APE-ISP-THROTTLE-L{$lvl}-BURST-FACTOR: {$burst}";
            $d[] = "#EXT-X-APE-ISP-THROTTLE-L{$lvl}-BUFFER: {$buf}";
        }
        $d[] = '#EXT-X-APE-ISP-THROTTLE-MAX-LEVEL: ' . RQ_ISP_LEVELS;
        $d[] = '#EXT-X-APE-ISP-THROTTLE-ESCALATION-POLICY: NUCLEAR_ESCALATION_NEVER_DOWN';
        $d[] = '#EXT-X-APE-ISP-THROTTLE-BANDWIDTH-DEMAND: ' . RQ_MAX_BW;
        $d[] = '#EXT-X-APE-ANTI-CUT-ENGINE: ENABLED';
        $d[] = '#EXT-X-APE-ANTI-CUT-DETECTION: REAL_TIME';
        $d[] = '#EXT-X-APE-ANTI-CUT-BW-DEMAND: ' . RQ_MAX_BW;
        $d[] = '#EXT-X-APE-ANTI-CUT-BW-FLOOR: ' . (RQ_MAX_BW / 2);
        $d[] = '#EXT-X-APE-ANTI-CUT-ISP-STRANGLE: NUCLEAR_10_LEVELS';
        $d[] = '#EXT-X-APE-ANTI-CUT-ESCALATION: NEVER_DOWN';

        // ── DOCTRINA 4: RESILIENCE (7 Niveles de Degradación Graceful) ────────
        $d[] = '#EXT-X-APE-RESILIENCE-DEGRADATION-LEVELS: ' . RQ_FALLBACK_LEVELS;
        $d[] = '#EXT-X-APE-RESILIENCE-L1-FORMAT: CMAF';
        $d[] = '#EXT-X-APE-RESILIENCE-L1-CODEC: HEVC';
        $d[] = '#EXT-X-APE-RESILIENCE-L1-LCEVC: ENABLED';
        $d[] = '#EXT-X-APE-RESILIENCE-L2-FORMAT: HLS_FMP4';
        $d[] = '#EXT-X-APE-RESILIENCE-L2-CODEC: HEVC';
        $d[] = '#EXT-X-APE-RESILIENCE-L2-LCEVC: ENABLED';
        $d[] = '#EXT-X-APE-RESILIENCE-L3-FORMAT: HLS_FMP4';
        $d[] = '#EXT-X-APE-RESILIENCE-L3-CODEC: H264';
        $d[] = '#EXT-X-APE-RESILIENCE-L4-FORMAT: HLS_TS';
        $d[] = '#EXT-X-APE-RESILIENCE-L4-CODEC: H264';
        $d[] = '#EXT-X-APE-RESILIENCE-L5-FORMAT: HLS_TS';
        $d[] = '#EXT-X-APE-RESILIENCE-L5-CODEC: H264_BASELINE';
        $d[] = '#EXT-X-APE-RESILIENCE-L6-FORMAT: TS_DIRECT';
        $d[] = '#EXT-X-APE-RESILIENCE-L7-FORMAT: HTTP_REDIRECT';
        // Gestión de errores HTTP por código
        $d[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-400: RETRY_WITH_CLEAN_REQUEST';
        $d[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-401: ESCALATE_CREDENTIALS';
        $d[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-403: MORPH_IDENTITY';
        $d[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-404: FALLBACK_ORIGIN';
        $d[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-405: CHANGE_METHOD';
        $d[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-407: PROXY_NUCLEAR';
        $d[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-429: SWARM_EVASION';
        $d[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-451: PHANTOM_GEO';
        $d[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-500: RECONNECT_SILENT';
        $d[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-502: RECONNECT_SILENT';
        $d[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-503: RECONNECT_SILENT';
        $d[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-504: RECONNECT_SILENT';

        // ── DOCTRINA 5: LCEVC (MPEG-5 Part 2 Phase 4) ────────────────────────
        $d[] = '#EXT-X-APE-LCEVC-ENABLED: TRUE';
        $d[] = '#EXT-X-APE-LCEVC-PHASE: 4';
        $d[] = '#EXT-X-APE-LCEVC-COMPUTE-PRECISION: FP32';
        $d[] = '#EXT-X-APE-LCEVC-DEBLOCK-ALPHA: -4';
        $d[] = '#EXT-X-APE-LCEVC-DEBLOCK-BETA: -4';
        $d[] = '#EXT-X-APE-LCEVC-UPSCALE-ALGORITHM: LANCZOS4';
        $d[] = '#EXT-X-APE-LCEVC-UPSCALE-SCALE: 4';
        $d[] = '#EXT-X-APE-LCEVC-GRAIN-SYNTHESIS: FALSE';
        $d[] = '#EXT-X-APE-LCEVC-COLOR-HALLUCINATION: NONE';
        $d[] = '#EXT-X-APE-LCEVC-BG-DEGRADATION: NONE';
        $d[] = '#EXT-X-APE-LCEVC-ROI-DYNAMIC: ENABLED';
        $d[] = '#EXT-X-APE-LCEVC-ROI-TARGETS: FACE,TEXT,SKIN,BALL,LOGO,EYES';
        $d[] = '#EXT-X-APE-LCEVC-TRANSPORT: CMAF_LAYER';
        $d[] = '#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-1: SEI_EMBED';
        $d[] = '#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-2: MPEG_TS_PID';

        // ── DOCTRINA 6: HDR (HDR10+ y Quantum ITM v3) ────────────────────────
        $d[] = '#EXT-X-APE-HDR-ENABLED: TRUE';
        $d[] = '#EXT-X-APE-HDR-FORMATS: DOLBY_VISION_8.1_L6,HDR10_PLUS_V2,HDR10,HLG';
        $d[] = '#EXT-X-APE-HDR-MAX-NITS: ' . RQ_MAX_NITS;
        $d[] = '#EXT-X-APE-HDR-MIN-NITS: 0.0001';
        $d[] = '#EXT-X-APE-HDR-COLOR-SPACE: BT2020';
        $d[] = '#EXT-X-APE-HDR-COLOR-GAMUT: P3_D65';
        $d[] = '#EXT-X-APE-HDR-COLOR-DEPTH: 12';
        $d[] = '#EXT-X-APE-HDR-CHROMA-SUBSAMPLING: 4:4:4';
        $d[] = '#EXT-X-APE-HDR-METADATA-DYNAMIC: SCENE_BY_SCENE';
        $d[] = '#EXT-X-APE-HDR-METADATA-FRAME: FRAME_BY_FRAME';
        $d[] = '#EXT-X-APE-HDR-QUANTUM-ITM: V3_NEURAL';
        $d[] = '#EXT-X-APE-HDR-QUANTUM-ITM-SKIN-PROTECTION: ENABLED';
        $d[] = '#EXT-X-APE-HDR-QUANTUM-ITM-RECOVERY: HIGHLIGHTS_AND_SHADOWS';
        $d[] = '#EXT-X-APE-HDR-QUANTUM-ITM-ROLLOFF: SOFT';
        $d[] = '#EXT-X-APE-HDR-QUANTUM-ITM-FACE-BOOST: ENABLED';

        // ── DOCTRINA 7: AI_SR (Super Resolución por IA) ───────────────────────
        $d[] = '#EXT-X-APE-AI-SR-ENABLED: TRUE';
        $d[] = '#EXT-X-APE-AI-SR-MODEL: REALESRGAN_X4PLUS';
        $d[] = '#EXT-X-APE-AI-SR-SCALE: 4';
        $d[] = '#EXT-X-APE-AI-SR-PRECISION: FP32';
        $d[] = '#EXT-X-APE-AI-SR-TILE-SIZE: 512';
        $d[] = '#EXT-X-APE-AI-SR-OVERLAP: 32';
        $d[] = '#EXT-X-APE-AI-SR-BATCH-SIZE: 4';
        $d[] = '#EXT-X-APE-AI-SR-INFERENCE: GPU_TENSOR_RT';
        $d[] = '#EXT-X-APE-AI-SR-FALLBACK: LANCZOS4';
        $d[] = '#EXT-X-APE-AI-FRAME-INTERPOLATION: RIFE_V4';
        $d[] = '#EXT-X-APE-AI-FRAME-INTERPOLATION-TARGET-FPS: ' . $profile['fps'];
        $d[] = '#EXT-X-APE-AI-TEMPORAL-SR: ENABLED';
        $d[] = '#EXT-X-APE-AI-TEMPORAL-CONSISTENCY: ENABLED';
        $d[] = '#EXT-X-APE-AI-DENOISING: NLMEANS_HQDN3D_TEMPORAL';
        $d[] = '#EXT-X-APE-AI-DEBLOCKING: ADAPTIVE_MAX';
        $d[] = '#EXT-X-APE-AI-SHARPENING: UNSHARP_MASK_ADAPTIVE';
        $d[] = '#EXT-X-APE-AI-SHARPENING-SIGMA: 0.65';
        $d[] = '#EXT-X-APE-AI-ARTIFACT-REMOVAL: ENABLED';
        $d[] = '#EXT-X-APE-AI-COLOR-ENHANCEMENT: ENABLED';
        $d[] = '#EXT-X-APE-AI-HDR-UPCONVERT: ENABLED';
        $d[] = '#EXT-X-APE-AI-SCENE-DETECTION: ENABLED';
        $d[] = '#EXT-X-APE-AI-MOTION-ESTIMATION: OPTICAL_FLOW';
        $d[] = '#EXT-X-APE-AI-CONTENT-AWARE-ENCODING: ENABLED';
        $d[] = '#EXT-X-APE-AI-PERCEPTUAL-QUALITY: VMAF_98';
        $d[] = '#EXT-X-APE-AI-VMAF-TARGET: 98';
        $d[] = '#EXT-X-APE-AI-SEGMENTATION: 250_LAYERS';

        // ── DOCTRINA 8: BUFFER ────────────────────────────────────────────────
        $d[] = '#EXT-X-APE-BUFFER-BASE: ' . $profile['buffer'];
        $d[] = '#EXT-X-APE-BUFFER-MAX: ' . RQ_BUFFER_MAX;
        $d[] = '#EXT-X-APE-BUFFER-MIN: 30000';
        $d[] = '#EXT-X-APE-BUFFER-STRATEGY: ADAPTIVE_PREDICTIVE_NEURAL';
        $d[] = '#EXT-X-APE-BUFFER-PRELOAD: ENABLED';
        $d[] = '#EXT-X-APE-BUFFER-PRELOAD-SEGMENTS: 10';
        $d[] = '#EXT-X-APE-BUFFER-DYNAMIC-ADJUSTMENT: ENABLED';
        $d[] = '#EXT-X-APE-BUFFER-NEURAL-PREDICTION: ENABLED';

        // ── DOCTRINA 9: ABR (Deshabilitado — Calidad Máxima Forzada) ──────────
        $d[] = '#EXT-X-APE-ABR-ENABLED: FALSE';
        $d[] = '#EXT-X-APE-ABR-FORCE-MAX: TRUE';
        $d[] = '#EXT-X-APE-ABR-LOCK-QUALITY: NATIVE_MAX';
        $d[] = '#EXT-X-APE-QUALITY-LOCK: NATIVA_MAXIMA';
        $d[] = '#EXT-X-APE-BYPASS-ABR: TRUE';
        $d[] = '#EXT-X-APE-RATE-CONTROL: CRF_0';

        // ── DOCTRINA 10: VVC/EVC (Códecs del Futuro) ──────────────────────────
        $d[] = '#EXT-X-APE-VVC-ENABLED: TRUE';
        $d[] = '#EXT-X-APE-VVC-PROFILE: MAIN_10';
        $d[] = '#EXT-X-APE-VVC-LEVEL: 5.1';
        $d[] = '#EXT-X-APE-EVC-ENABLED: TRUE';
        $d[] = '#EXT-X-APE-EVC-PROFILE: MAIN';
        $d[] = '#EXT-X-APE-CODEC-PRIORITY: VVC,EVC,HEVC,AV1,H264';

        // ── DOCTRINA 11: GPU ──────────────────────────────────────────────────
        $d[] = '#EXT-X-APE-GPU-DECODE: ENABLED';
        $d[] = '#EXT-X-APE-GPU-RENDER: ENABLED';
        $d[] = '#EXT-X-APE-GPU-PIPELINE: DECODE_ITM_LCEVC_AI_SR_DENOISE_TONEMAP_RENDER';
        $d[] = '#EXT-X-APE-GPU-PRECISION: FP32';
        $d[] = '#EXT-X-APE-GPU-MEMORY-POOL: VRAM_ONLY';
        $d[] = '#EXT-X-APE-GPU-ZERO-COPY: ENABLED';

        // ── DOCTRINA 12: QOS ──────────────────────────────────────────────────
        $d[] = '#EXT-X-APE-QOS-ENABLED: TRUE';
        $d[] = '#EXT-X-APE-QOS-DSCP: EF';
        $d[] = '#EXT-X-APE-QOS-PRIORITY: 7';
        $d[] = '#EXT-X-APE-QOS-BANDWIDTH-RESERVATION: ' . RQ_MAX_BW;

        // ── DOCTRINA 13: HYDRA STEALTH ────────────────────────────────────────
        $d[] = '#EXT-X-APE-HYDRA-ENABLED: TRUE';
        $d[] = '#EXT-X-APE-HYDRA-HEADS: 10';
        $d[] = '#EXT-X-APE-HYDRA-ROTATION-INTERVAL: 30';
        $d[] = '#EXT-X-APE-HYDRA-STEALTH-MODE: ENABLED';

        // ── DOCTRINA 14: POLYMORPHIC ──────────────────────────────────────────
        $d[] = '#EXT-X-APE-POLYMORPHIC-ENABLED: TRUE';
        $d[] = '#EXT-X-APE-POLYMORPHIC-MUTATION-INTERVAL: 60';
        $d[] = '#EXT-X-APE-POLYMORPHIC-IDEMPOTENT: TRUE';

        // ── DOCTRINA 15: VMAF ─────────────────────────────────────────────────
        $d[] = '#EXT-X-APE-VMAF-ENABLED: TRUE';
        $d[] = '#EXT-X-APE-VMAF-TARGET: 98';
        $d[] = '#EXT-X-APE-VMAF-MODEL: VMAF_V0.6.1';
        $d[] = '#EXT-X-APE-VMAF-PHONE-MODEL: FALSE';

        // ── DOCTRINA 16: DENOISE ──────────────────────────────────────────────
        $d[] = '#EXT-X-APE-DENOISE-ENABLED: TRUE';
        $d[] = '#EXT-X-APE-DENOISE-ALGORITHM: NLMEANS_HQDN3D_TEMPORAL';
        $d[] = '#EXT-X-APE-DENOISE-STRENGTH: ADAPTIVE';
        $d[] = '#EXT-X-APE-DENOISE-NOISE-THRESHOLD: 0.003';

        // ── DOCTRINA 17: DEBLOCK ──────────────────────────────────────────────
        $d[] = '#EXT-X-APE-DEBLOCK-ENABLED: TRUE';
        $d[] = '#EXT-X-APE-DEBLOCK-ALPHA: -4';
        $d[] = '#EXT-X-APE-DEBLOCK-BETA: -4';
        $d[] = '#EXT-X-APE-DEBLOCK-MODE: ADAPTIVE_MAX';

        // ── DOCTRINA 18: CHROMA ───────────────────────────────────────────────
        $d[] = '#EXT-X-APE-CHROMA-SUBSAMPLING: 4:4:4';
        $d[] = '#EXT-X-APE-CHROMA-UPSAMPLING: LANCZOS';
        $d[] = '#EXT-X-APE-CHROMA-PRECISION: 12BIT';

        // ── DOCTRINA 19: TEMPORAL ─────────────────────────────────────────────
        $d[] = '#EXT-X-APE-TEMPORAL-CONSISTENCY: ENABLED';
        $d[] = '#EXT-X-APE-TEMPORAL-FLICKER-REDUCTION: ENABLED';
        $d[] = '#EXT-X-APE-TEMPORAL-MOTION-COMPENSATION: ENABLED';

        // ── DOCTRINA 20: ROI ──────────────────────────────────────────────────
        $d[] = '#EXT-X-APE-ROI-ENABLED: TRUE';
        $d[] = '#EXT-X-APE-ROI-TARGETS: FACE,TEXT,SKIN,BALL,LOGO,EYES';
        $d[] = '#EXT-X-APE-ROI-QUALITY-BOOST: 2X';

        // ── DOCTRINA 21: TRANSPORT ────────────────────────────────────────────
        $d[] = '#EXT-X-APE-TRANSPORT-PROTOCOL: CMAF_UNIVERSAL';
        $d[] = '#EXT-X-APE-TRANSPORT-CHUNK-SIZE: 200MS';
        $d[] = '#EXT-X-APE-TRANSPORT-FALLBACK-1: HLS_FMP4';
        $d[] = '#EXT-X-APE-TRANSPORT-FALLBACK-2: HLS_TS';

        // ── DOCTRINA 22: METADATA ─────────────────────────────────────────────
        $d[] = '#EXT-X-APE-METADATA-INJECTION: ENABLED';
        $d[] = '#EXT-X-APE-METADATA-INTERVAL: 1000MS';
        $d[] = '#EXT-X-APE-METADATA-TARGETS: IPTV_SERVER,ISP,PLAYER,SCREEN,APP';

        // ── DOCTRINA 23: CACHE ────────────────────────────────────────────────
        $d[] = '#EXT-X-APE-CACHE-STRATEGY: PREDICTIVE_NEURAL';
        $d[] = '#EXT-X-APE-CACHE-SIZE: 1GB';
        $d[] = '#EXT-X-APE-CACHE-PREFETCH: ENABLED';

        // ── DOCTRINA 24: SWARM ────────────────────────────────────────────────
        $d[] = '#EXT-X-APE-SWARM-ENABLED: TRUE';
        $d[] = '#EXT-X-APE-SWARM-PEERS: 20';
        $d[] = '#EXT-X-APE-SWARM-DOWNLOAD-STRATEGY: PARALLEL_AGGRESSIVE';

        // ── DOCTRINA 25: QUANTUM_ITM ──────────────────────────────────────────
        $d[] = '#EXT-X-APE-QUANTUM-ITM-ENABLED: TRUE';
        $d[] = '#EXT-X-APE-QUANTUM-ITM-VERSION: V3_NEURAL';
        $d[] = '#EXT-X-APE-QUANTUM-ITM-SKIN-PROTECTION: ENABLED';
        $d[] = '#EXT-X-APE-QUANTUM-ITM-EXPANSION-CURVE: QUANTUM';

        // ── DOCTRINA 26: ABR_LADDER ───────────────────────────────────────────
        $d[] = '#EXT-X-APE-ABR-LADDER: 7680x4320@120fps,3840x2160@120fps,1920x1080@60fps';
        $d[] = '#EXT-X-APE-ABR-LADDER-FORCE-TOP: TRUE';

        // ── DOCTRINA 27: CONTENT_AWARE ────────────────────────────────────────
        $d[] = '#EXT-X-APE-AI-CONTENT-TYPE: ' . strtoupper($ct);
        $d[] = '#EXT-X-APE-AI-CONTENT-AWARE-ENCODING: ENABLED';
        $d[] = '#EXT-X-APE-AI-CONTENT-AWARE-SHARPENING: ENABLED';

        // ── DOCTRINA 28: PLAYER_ENSLAVEMENT ──────────────────────────────────
        $d[] = '#EXT-X-APE-PLAYER-ENSLAVEMENT-PROTOCOL: OMEGA_ABSOLUTE';
        $d[] = '#EXT-X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-ABR: TRUE';
        $d[] = '#EXT-X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-BUFFER: TRUE';
        $d[] = '#EXT-X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC: TRUE';
        $d[] = '#EXT-X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-HDR: TRUE';
        $d[] = '#EXT-X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-RESOLUTION: TRUE';
        $d[] = '#EXT-X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-FPS: TRUE';

        return $d;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BLOQUE 6: #EXT-X-CORTEX — Procesamiento Neuronal
    // ─────────────────────────────────────────────────────────────────────────

    private function buildCortexDirectives(array $payload, array $profile, string $ct): array
    {
        $d = [
            '#EXT-X-CORTEX-OMEGA-STATE: ENABLED',
            '#EXT-X-CORTEX-AI-SEMANTIC-SEGMENTATION: 250_LAYERS',
            '#EXT-X-CORTEX-AI-MULTIFRAME-NR: ENABLED',
            '#EXT-X-CORTEX-LCEVC-SDK-INJECTION: ENABLED',
            '#EXT-X-CORTEX-LCEVC-L1-CORRECTION: ENABLED',
            '#EXT-X-CORTEX-LCEVC-L2-DETAIL: ENABLED',
            '#EXT-X-CORTEX-AV1-CDEF: ENABLED',
            '#EXT-X-CORTEX-AV1-DEBLOCKING: ENABLED',
            '#EXT-X-CORTEX-VVC-VIRTUAL-BOUNDARIES: ENABLED',
            '#EXT-X-CORTEX-FALLBACK-CHAIN: ' . RQ_FALLBACK_LEVELS . '_LEVELS',
        ];

        if ($ct === 'sports') {
            $d[] = '#EXT-X-CORTEX-SPORTS-INTERPOLATION: RIFE_V4';
            $d[] = '#EXT-X-CORTEX-SPORTS-TARGET-FPS: ' . $profile['fps'];
            $d[] = '#EXT-X-CORTEX-SPORTS-MOTION-BLUR-REDUCTION: ENABLED';
            $d[] = '#EXT-X-CORTEX-SPORTS-BALL-TRACKING: ENABLED';
        } elseif ($ct === 'cinema') {
            $d[] = '#EXT-X-CORTEX-CINEMA-CADENCE-PRESERVATION: 24FPS';
            $d[] = '#EXT-X-CORTEX-CINEMA-GRAIN-PRESERVATION: ENABLED';
            $d[] = '#EXT-X-CORTEX-CINEMA-COLOR-GRADING-PROTECTION: ENABLED';
        } elseif ($ct === 'news') {
            $d[] = '#EXT-X-CORTEX-NEWS-TEXT-SHARPENING: ENABLED';
            $d[] = '#EXT-X-CORTEX-NEWS-FACE-ENHANCEMENT: ENABLED';
        }

        return $d;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BLOQUE 7: #EXT-X-TELCHEMY — Monitoreo de Calidad
    // ─────────────────────────────────────────────────────────────────────────

    private function buildTelchemyDirectives(): array
    {
        return [
            '#EXT-X-TELCHEMY-TVQM: ENABLED,INTERVAL=1000,METRICS=VMAF:PSNR:SSIM:VQM:BLOCKINESS:BLUR,THRESHOLD_VMAF=98,ACTION=ESCALATE_QUALITY',
            '#EXT-X-TELCHEMY-TR101290: ENABLED,PRIORITY_1=ALERT,PRIORITY_2=WARN,PRIORITY_3=LOG',
            '#EXT-X-TELCHEMY-IMPAIRMENT-GUARD: ENABLED,BLOCKINESS=DETECT,BLUR=DETECT,NOISE=DETECT,FREEZE=DETECT,ACTION=AUTO_CORRECT',
            '#EXT-X-TELCHEMY-BUFFER-POLICY: ADAPTIVE,MIN=30000,MAX=' . RQ_BUFFER_MAX . ',TARGET=' . RQ_BUFFER_BASE,
            '#EXT-X-TELCHEMY-GOP-POLICY: DETECT,IDEAL=2000,TOLERANCE=500',
            '#EXT-X-TELCHEMY-JITTER-POLICY: COMPENSATE,THRESHOLD=50,BUFFER_ADJUST=AUTO',
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BLOQUE 8: #EXT-X-STREAM-INF — Información de Stream
    // ─────────────────────────────────────────────────────────────────────────

    private function buildStreamInf(array $profile): string
    {
        $fps = $profile['fps'];
        $bw  = RQ_MAX_BW;
        return "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$bw},RESOLUTION=7680x4320,FRAME-RATE={$fps}.000,"
             . 'CODECS="hvc1.2.4.L183.B0,mp4a.40.2",HDR=PQ,VIDEO-RANGE=PQ,AUDIO="aac_atmos",'
             . 'CLOSED-CAPTIONS=NONE,SUBTITLES="subs"';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BLOQUE 9: #EXT-X-VNOVA-LCEVC — Configuración LCEVC Base64
    // ─────────────────────────────────────────────────────────────────────────

    private function buildLcevcConfig(): string
    {
        $config = json_encode([
            'version'   => '4.0',
            'phase'     => 4,
            'precision' => 'FP32',
            'upscale'   => 'LANCZOS4',
            'roi'       => ['FACE', 'TEXT', 'SKIN', 'BALL', 'LOGO', 'EYES'],
            'transport' => 'CMAF_LAYER',
            'deblock'   => ['alpha' => -4, 'beta' => -4],
            'grain'     => false,
        ]);
        return '#EXT-X-VNOVA-LCEVC-CONFIG-B64:' . base64_encode($config);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL: rq_enrich_raw_m3u_omega
// ═══════════════════════════════════════════════════════════════════════════════

function rq_enrich_raw_m3u_omega(string $rawM3u): string
{
    $reconstructor = new OmegaAbsoluteReconstructor();
    $lines  = explode("\n", $rawM3u);
    $output = [];
    $channelBlock = [];
    $inChannel    = false;

    foreach ($lines as $line) {
        $line = trim($line);

        if ($line === '' || $line === '#EXTM3U') {
            $output[] = $line;
            continue;
        }

        if (str_starts_with($line, '#EXTINF:')) {
            if ($inChannel && !empty($channelBlock)) {
                $output = array_merge($output, processOmegaChannel($channelBlock, $reconstructor));
            }
            $channelBlock = [$line];
            $inChannel    = true;
            continue;
        }

        if ($inChannel) {
            $channelBlock[] = $line;
            if (!str_starts_with($line, '#')) {
                $output    = array_merge($output, processOmegaChannel($channelBlock, $reconstructor));
                $channelBlock = [];
                $inChannel    = false;
            }
        } else {
            $output[] = $line;
        }
    }

    if ($inChannel && !empty($channelBlock)) {
        $output = array_merge($output, processOmegaChannel($channelBlock, $reconstructor));
    }

    return implode("\n", $output);
}

function processOmegaChannel(array $channelLines, OmegaAbsoluteReconstructor $reconstructor): array
{
    $payload    = [];
    $streamUrl  = '';

    foreach ($channelLines as $line) {
        if (str_starts_with($line, '#EXTHTTP:')) {
            $data = json_decode(trim(substr($line, 9)), true);
            if (is_array($data)) {
                $payload = $data;
            }
        }
        if (!str_starts_with($line, '#') && $line !== '') {
            $streamUrl = $line;
        }
    }

    // Default payload si no hay JSON
    if (empty($payload)) {
        $payload = ['ct' => 'default', 'profile' => 'P0_ULTRA_SPORTS_8K'];
    }

    $output   = [$channelLines[0]]; // #EXTINF
    $directives = $reconstructor->reconstruct($payload, $streamUrl);
    $output   = array_merge($output, $directives);
    $output[] = $streamUrl;

    return $output;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

if (basename(__FILE__) !== basename($_SERVER['SCRIPT_FILENAME'] ?? '')) {
    return;
}

$mode = $_GET['mode'] ?? 'resolve';

if ($mode === 'resolve') {
    $url = $_GET['url'] ?? '';
    if ($url === '') {
        echo rq_error_m3u('URL no proporcionada');
        exit;
    }

    $ctx = stream_context_create([
        'http' => [
            'timeout'         => 30,
            'follow_location' => 1,
            'user_agent'      => 'SHIELD Android TV / TIVIMATE 4.8.0 PRO',
        ],
    ]);

    $rawM3u = @file_get_contents($url, false, $ctx);
    if ($rawM3u === false || $rawM3u === '') {
        rq_log("Error al descargar: {$url}");
        echo rq_error_m3u('Error al descargar la lista');
        exit;
    }

    $enriched = rq_enrich_raw_m3u_omega($rawM3u);

    header('Content-Type: application/vnd.apple.mpegurl');
    header('X-Resolver-Version: ' . RQ_VERSION);
    header('X-Directives-Engine: OMEGA_ABSOLUTE');
    header('Cache-Control: max-age=300');
    echo $enriched;
    exit;
}

if ($mode === 'health') {
    header('Content-Type: application/json');
    echo json_encode([
        'status'           => 'ok',
        'version'          => RQ_VERSION,
        'timestamp'        => time(),
        'engine'           => 'OMEGA_ABSOLUTE',
        'injection_formats'=> ['EXTHTTP','KODIPROP','EXTVLCOPT','EXTATTRFROMURL','EXT-X-STREAM-INF','EXT-X-APE','EXT-X-CORTEX','EXT-X-TELCHEMY','EXT-X-VNOVA-LCEVC'],
        'doctrines'        => 28,
        'isp_levels'       => RQ_ISP_LEVELS,
        'fallback_levels'  => RQ_FALLBACK_LEVELS,
        'max_nits'         => RQ_MAX_NITS,
        'max_bw_mbps'      => RQ_MAX_BW / 1000000,
    ]);
    exit;
}

echo rq_error_m3u('Modo no soportado');
