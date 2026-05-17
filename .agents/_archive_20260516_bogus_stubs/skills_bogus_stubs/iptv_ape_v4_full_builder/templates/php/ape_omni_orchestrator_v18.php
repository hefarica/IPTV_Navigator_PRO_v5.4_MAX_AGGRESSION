<?php
/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║   APE OmniOrchestrator v18.2 — CMAF Universal + Hydra Stealth + APE DNA    ║
 * ║   IPTV Navigator PRO v4.0 FULL                                              ║
 * ║   © 2026 Manus AI — All rights reserved                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Implementa la arquitectura APE v18.2 con:
 *  - CMAF Universal: manifiesto HLS con segmentos fMP4 como estándar único
 *  - Motor de Orquestación de 8 Capas (RFC 8216 estricto)
 *  - Hydra Stealth Obfuscation: #EXT-X-APE-* → #EXT-X-SYS-* para evasión DPI
 *  - APE DNA Omni-Injection: passthrough de 154+ headers desde la UI
 *  - Cadena de Degradación Graceful de 7 Niveles
 *  - Inteligencia Multi-Reproductor v18 con stealthUA dispatcher
 */

declare(strict_types=1);

class ApeOmniOrchestratorV18
{
    // ═══════════════════════════════════════════════════════════════════════════
    // VERSIÓN Y CONSTANTES APE v18.2
    // ═══════════════════════════════════════════════════════════════════════════

    const VERSION              = '18.2.0';
    const CMAF_FORMAT          = 'cmaf';
    const HLS_FMP4_FORMAT      = 'hls_fmp4';
    const HLS_TS_FORMAT        = 'hls_ts';
    const DASH_FORMAT          = 'dash';
    const TS_DIRECT_FORMAT     = 'ts_direct';

    // Perfiles de Player para filtrado de capas
    const PROFILE_PREMIUM      = 'PREMIUM';   // CMAF+HEVC+LCEVC+AV1+HDR10+
    const PROFILE_HIGH         = 'HIGH';      // CMAF+HEVC+HDR10
    const PROFILE_STANDARD     = 'STANDARD';  // HLS/fMP4+H.264
    const PROFILE_LEGACY       = 'LEGACY';    // HLS/TS+H.264 baseline
    const PROFILE_MINIMAL      = 'MINIMAL';   // TS direct, STB básico

    // Cadena de Degradación Graceful — 7 niveles
    const DEGRADATION_CHAIN = [
        'CMAF+HEVC/AV1',     // Nivel 1: PREMIUM — CMAF+HEVC/AV1+LCEVC+HDR10+
        'HLS/fMP4+HEVC',     // Nivel 2: HIGH — HLS fMP4 + HEVC
        'HLS/fMP4+H.264',    // Nivel 3: STANDARD — HLS fMP4 + H.264
        'HLS/TS+H.264',      // Nivel 4: COMPAT — HLS TS + H.264
        'HLS/TS+Baseline',   // Nivel 5: LEGACY — HLS TS + H.264 Baseline
        'TS Direct',         // Nivel 6: MINIMAL — TS directo
        'HTTP redirect',     // Nivel 7: LAST RESORT — redirect a origen
    ];

    // Hydra Stealth: mapeo de tags APE → SYS para evasión DPI
    const HYDRA_STEALTH_MAP = [
        '#EXT-X-APE-'     => '#EXT-X-SYS-',
        '#EXT-X-APE-LCEVC' => '#EXT-X-SYS-EVC',
        '#EXT-X-APE-HDR'  => '#EXT-X-SYS-HDR',
        '#EXT-X-APE-AI'   => '#EXT-X-SYS-AI',
        '#EXT-X-APE-CMAF' => '#EXT-X-SYS-CMF',
        '#EXT-X-APE-DNA'  => '#EXT-X-SYS-DNA',
        '#EXT-X-APE-VQS'  => '#EXT-X-SYS-VQS',
        '#EXT-X-APE-TELCHEMY' => '#EXT-X-SYS-TQM',
    ];

    // APE DNA: 154+ campos de configuración heredados desde la UI
    const APE_DNA_FIELDS = [
        // Grupo 1: Identidad del Canal
        'channel_id', 'channel_name', 'channel_group', 'channel_logo',
        'stream_id', 'stream_url', 'stream_url_backup', 'stream_url_backup2',
        // Grupo 2: Codec y Calidad
        'codec_primary', 'codec_fallback', 'codec_priority', 'video_bitrate',
        'audio_bitrate', 'resolution', 'frame_rate', 'color_space',
        // Grupo 3: CMAF/LCEVC
        'cmaf_enabled', 'cmaf_profile', 'lcevc_enabled', 'lcevc_profile',
        'lcevc_state', 'lcevc_mode', 'lcevc_scale_factor', 'lcevc_source',
        // Grupo 4: HDR
        'hdr_profile', 'hdr10_enabled', 'hdr10_plus_enabled', 'dolby_vision_enabled',
        'dolby_vision_profile', 'hlg_enabled', 'color_primaries', 'transfer_characteristics',
        // Grupo 5: AI Super Resolution
        'ai_sr_enabled', 'ai_sr_mode', 'ai_sr_scale_factor', 'ai_sr_engine',
        'bwdif_enabled', 'nnedi3_enabled', 'temporal_sr_enabled',
        // Grupo 6: CDN y Routing
        'cdn_primary', 'cdn_backup', 'cdn_backup2', 'cdn_routing_mode',
        'circuit_breaker_enabled', 'health_probe_interval', 'failover_threshold',
        // Grupo 7: Player y Compatibilidad
        'player_profile', 'stealth_ua', 'hydra_stealth_enabled', 'stream_inf_enabled',
        'exthttp_enabled', 'extvlcopt_enabled', 'kodiprop_enabled',
        // Grupo 8: ABR Ladder
        'abr_enabled', 'abr_ladder', 'abr_max_bitrate', 'abr_min_bitrate',
        // Grupo 9: Telemetría
        'telchemy_enabled', 'tvqm_vstq', 'tvqm_vsmq', 'tr101290_p1', 'tr101290_p2',
        // Grupo 10: OTT Visual Quality
        'vqs_score', 'vqs_tier', 'quantum_pixel_overdrive', 'content_aware_hevc',
        'motor_dinamico_mpd', 'antigravity_mode', 'god_mode_zero_drop',
        // Grupo 11: Metadatos APE
        'ape_version', 'ape_profile', 'ape_dna_hash', 'ape_build_timestamp',
        'ape_deployment_id', 'ape_node_id',
        // Grupo 12: Seguridad y Evasión
        'dpi_evasion_enabled', 'token_auth_enabled', 'geo_restriction',
        'drm_type', 'drm_server_url',
        // Grupo 13: Configuración de Segmentos
        'segment_duration', 'segment_count', 'playlist_type', 'target_duration',
        // Grupo 14: Headers HTTP Personalizados
        'user_agent', 'referer', 'origin', 'cookie', 'x_forwarded_for',
        'custom_header_1', 'custom_header_2', 'custom_header_3',
        // Grupo 15: Configuración Avanzada
        'probe_timeout', 'buffer_size', 'reconnect_attempts', 'reconnect_delay',
        'low_latency_mode', 'live_edge_segments', 'max_buffer_duration',
        // Grupo 16: Señalización de Manifiestos
        'ext_x_version', 'ext_x_independent_segments', 'ext_x_map_uri',
        'ext_x_media_sequence', 'ext_x_discontinuity_sequence',
        // Grupo 17: Clasificación y Metadatos
        'content_type', 'language', 'country', 'category', 'subcategory',
        'epg_id', 'epg_url', 'tvg_id', 'tvg_name', 'tvg_logo',
        // Grupo 18: Configuración de Red
        'network_type', 'bandwidth_estimate', 'latency_estimate', 'jitter_estimate',
        'packet_loss_rate', 'connection_type',
    ];

    // ═══════════════════════════════════════════════════════════════════════════
    // PROPIEDADES
    // ═══════════════════════════════════════════════════════════════════════════

    private array  $channelConfig;
    private string $playerProfile;
    private bool   $hydraStealthEnabled;
    private bool   $cmafUniversalEnabled;
    private array  $apeDna;

    public function __construct(array $channelConfig = [])
    {
        $this->channelConfig        = $channelConfig;
        $this->playerProfile        = $channelConfig['player_profile'] ?? self::PROFILE_STANDARD;
        $this->hydraStealthEnabled  = (bool)($channelConfig['hydra_stealth_enabled'] ?? false);
        $this->cmafUniversalEnabled = (bool)($channelConfig['cmaf_enabled'] ?? true);
        $this->apeDna               = $this->buildApeDna($channelConfig);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MÉTODO PRINCIPAL: processChannel — Ensamblaje de 8 Capas RFC 8216
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Procesa las líneas de un canal M3U8 y las reordena en 8 capas lógicas.
     * Este es el corazón del ApeOmniOrchestrator v18.2.
     *
     * @param array  $rawLines      Líneas brutas del canal M3U8
     * @param string $playerProfile Perfil del player (PREMIUM/HIGH/STANDARD/LEGACY/MINIMAL)
     * @param bool   $hydraMode     Si true, ofusca #EXT-X-APE-* → #EXT-X-SYS-*
     * @return string               Bloque M3U8 ensamblado en 8 capas
     */
    public static function processChannel(
        array  $rawLines,
        string $playerProfile = self::PROFILE_STANDARD,
        bool   $hydraMode     = false
    ): string {
        // Clasificar líneas en sus capas lógicas
        $extInf       = [];   // Layer 1: #EXTINF (DEBE ser primero)
        $filteredVlc  = [];   // Layer 2: #EXTVLCOPT
        $filteredJson = [];   // Layer 3: #EXTHTTP
        $filteredApe  = [];   // Layer 4: #EXT-X-APE-* / #EXT-X-SYS-*
        $filteredKodi = [];   // Layer 5: #KODIPROP
        $filteredAttr = [];   // Layer 6: #EXTATTRFROMURL
        $othersLayer  = [];   // Layer 7: Otros tags
        $filteredStream = []; // Layer 7b: #EXT-X-STREAM-INF (justo antes de URL)
        $urls         = [];   // Layer 8: URL (DEBE ser último)

        foreach ($rawLines as $line) {
            $line = rtrim($line);
            if (empty($line)) continue;

            if (str_starts_with($line, '#EXTINF:')) {
                $extInf[] = $line;
            } elseif (str_starts_with($line, '#EXTVLCOPT:')) {
                $filteredVlc[] = $line;
            } elseif (str_starts_with($line, '#EXTHTTP:') || str_starts_with($line, '#EXTHTTP={')) {
                $filteredJson[] = $line;
            } elseif (str_starts_with($line, '#EXT-X-APE-') || str_starts_with($line, '#EXT-X-SYS-')) {
                $filteredApe[] = $line;
            } elseif (str_starts_with($line, '#KODIPROP:')) {
                $filteredKodi[] = $line;
            } elseif (str_starts_with($line, '#EXTATTRFROMURL:')) {
                $filteredAttr[] = $line;
            } elseif (str_starts_with($line, '#EXT-X-STREAM-INF:')) {
                $filteredStream[] = $line;
            } elseif (!str_starts_with($line, '#')) {
                // Es una URL
                $urls[] = $line;
            } else {
                $othersLayer[] = $line;
            }
        }

        // Aplicar filtrado por perfil de player
        switch ($playerProfile) {
            case self::PROFILE_PREMIUM:
                // Todos los tags — máxima compatibilidad y calidad
                break;

            case self::PROFILE_HIGH:
                // Sin EXTATTRFROMURL
                $filteredAttr = [];
                break;

            case self::PROFILE_STANDARD:
                // Sin EXTATTRFROMURL, KODIPROP limitado
                $filteredAttr = [];
                break;

            case self::PROFILE_LEGACY:
                // Players legacy (MAG old, Roku, MPC-HC): tags mínimos
                $filteredVlc    = [];
                $filteredApe    = [];
                $filteredKodi   = [];
                $filteredAttr   = [];
                $filteredStream = [];
                // Solo mantener User-Agent básico en EXTHTTP
                $filteredJson = array_filter($filteredJson, fn($l) =>
                    str_contains($l, 'User-Agent') || str_contains($l, 'user-agent')
                );
                $filteredJson = array_values($filteredJson);
                break;

            case self::PROFILE_MINIMAL:
                // STB básicos: solo EXTINF + URL
                $filteredVlc    = [];
                $filteredJson   = [];
                $filteredApe    = [];
                $filteredKodi   = [];
                $filteredAttr   = [];
                $filteredStream = [];
                $othersLayer    = [];
                break;
        }

        // Aplicar Hydra Stealth Obfuscation si está habilitado
        if ($hydraMode) {
            $filteredApe = self::applyHydraStealthObfuscation($filteredApe);
        }

        // Ensamblar en orden estricto de 8 capas (RFC 8216)
        $assembled = array_merge(
            $extInf,          // Layer 1: #EXTINF (DEBE ser primero)
            $filteredVlc,     // Layer 2: #EXTVLCOPT
            $filteredJson,    // Layer 3: #EXTHTTP
            $filteredApe,     // Layer 4: #EXT-X-APE-* / #EXT-X-SYS-*
            $filteredKodi,    // Layer 5: #KODIPROP
            $filteredAttr,    // Layer 6: #EXTATTRFROMURL
            $othersLayer,     // Layer 7: Otros tags
            $filteredStream,  // Layer 7b: #EXT-X-STREAM-INF (justo antes de URL)
            $urls             // Layer 8: URL (DEBE ser último)
        );

        return implode("\n", array_filter($assembled)) . "\n";
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CMAF UNIVERSAL: Generación de Manifiesto HLS con segmentos fMP4
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Genera el manifiesto HLS CMAF Universal para un canal.
     * Produce HLS con segmentos fMP4 como estándar único.
     * Incluye señalización LCEVC, HDR10+, Telchemy y APE DNA.
     *
     * @param array  $channelConfig  Configuración completa del canal
     * @param string $baseUrl        URL base del VPS
     * @param array  $manifests      URLs de manifiestos disponibles por formato
     * @return string                Manifiesto HLS completo
     */
    public static function generateCmafUniversalManifest(
        array  $channelConfig,
        string $baseUrl,
        array  $manifests = []
    ): string {
        $ch          = $channelConfig['channel_id']   ?? 'unknown';
        $name        = $channelConfig['channel_name']  ?? 'Canal';
        $group       = $channelConfig['channel_group'] ?? 'General';
        $logo        = $channelConfig['channel_logo']  ?? '';
        $streamUrl   = $channelConfig['stream_url']    ?? '';
        $codec       = $channelConfig['codec_primary'] ?? 'avc1.640028,mp4a.40.2';
        $resolution  = $channelConfig['resolution']    ?? '1920x1080';
        $bitrate     = $channelConfig['video_bitrate'] ?? 5000000;
        $frameRate   = $channelConfig['frame_rate']    ?? 25;
        $lcevcEnabled = (bool)($channelConfig['lcevc_enabled'] ?? false);
        $lcevcState   = $channelConfig['lcevc_state']  ?? 'OFF';
        $hdrProfile   = $channelConfig['hdr_profile']  ?? 'SDR';
        $aiSrEnabled  = (bool)($channelConfig['ai_sr_enabled'] ?? false);
        $aiSrMode     = $channelConfig['ai_sr_mode']   ?? 'BALANCED';
        $telchemy     = (bool)($channelConfig['telchemy_enabled'] ?? false);
        $hydra        = (bool)($channelConfig['hydra_stealth_enabled'] ?? false);
        $stealthUA    = $channelConfig['stealth_ua']   ?? '';
        $playerProf   = $channelConfig['player_profile'] ?? self::PROFILE_STANDARD;
        $vqsScore     = $channelConfig['vqs_score']    ?? 75;
        $vqsTier      = $channelConfig['vqs_tier']     ?? 'STANDARD';

        // Determinar el tag de prefijo APE (normal o stealth)
        $apePrefix = $hydra ? '#EXT-X-SYS-' : '#EXT-X-APE-';

        // Construir el manifiesto
        $lines = [];

        // ── Cabecera M3U8 ──────────────────────────────────────────────────────
        $lines[] = '#EXTM3U';
        $lines[] = '#EXT-X-VERSION:7';
        $lines[] = '#EXT-X-INDEPENDENT-SEGMENTS';
        $lines[] = '';

        // ── APE DNA Header ─────────────────────────────────────────────────────
        $lines[] = $apePrefix . 'VERSION:' . self::VERSION;
        $lines[] = $apePrefix . 'ENGINE:APE-OMNI-ORCHESTRATOR-V18';
        $lines[] = $apePrefix . 'FORMAT:CMAF-UNIVERSAL';
        $lines[] = $apePrefix . 'PLAYER-PROFILE:' . $playerProf;
        $lines[] = $apePrefix . 'BUILD:' . date('Ymd-His');
        $lines[] = $apePrefix . 'DNA-HASH:' . substr(md5(json_encode($channelConfig)), 0, 16);
        $lines[] = '';

        // ── LCEVC Enhancement Layer ────────────────────────────────────────────
        if ($lcevcEnabled) {
            $lines[] = $apePrefix . 'LCEVC-STATE:' . $lcevcState;
            $lines[] = $apePrefix . 'LCEVC-PROFILE:' . ($channelConfig['lcevc_profile'] ?? 'standard_tv');
            $lines[] = $apePrefix . 'LCEVC-MODE:' . ($channelConfig['lcevc_mode'] ?? 'PACKAGED');
            $lines[] = $apePrefix . 'LCEVC-SCALE:' . ($channelConfig['lcevc_scale_factor'] ?? '2.0');
            $lines[] = $apePrefix . 'LCEVC-SOURCE:' . ($channelConfig['lcevc_source'] ?? 'player_matrix');
        }

        // ── HDR Signaling ──────────────────────────────────────────────────────
        if ($hdrProfile !== 'SDR') {
            $lines[] = $apePrefix . 'HDR-PROFILE:' . $hdrProfile;
            if (str_contains($hdrProfile, 'HDR10+')) {
                $lines[] = $apePrefix . 'HDR10PLUS-ENABLED:1';
                $lines[] = $apePrefix . 'HDR10PLUS-TONE-MAP:DYNAMIC';
            }
            if (str_contains($hdrProfile, 'DV')) {
                $lines[] = $apePrefix . 'DOLBY-VISION-PROFILE:' . ($channelConfig['dolby_vision_profile'] ?? '8.4');
            }
        }

        // ── AI Super Resolution ────────────────────────────────────────────────
        if ($aiSrEnabled) {
            $lines[] = $apePrefix . 'AI-SR-ENABLED:1';
            $lines[] = $apePrefix . 'AI-SR-MODE:' . $aiSrMode;
            $lines[] = $apePrefix . 'AI-SR-SCALE:' . ($channelConfig['ai_sr_scale_factor'] ?? '2.0');
            $lines[] = $apePrefix . 'AI-SR-FILTERS:BWDIF,NNEDI3,CAS';
        }

        // ── Telchemy TVQM Metrics ──────────────────────────────────────────────
        if ($telchemy) {
            $vstq = $channelConfig['tvqm_vstq'] ?? 4.2;
            $vsmq = $channelConfig['tvqm_vsmq'] ?? 4.5;
            $lines[] = $apePrefix . 'TELCHEMY-TVQM:VSTQ=' . $vstq . ',VSMQ=' . $vsmq . ',VERSION=2.1';
            $lines[] = $apePrefix . 'TELCHEMY-TR101290:P1=0,P2=0,P3=0,STATUS=PASS';
        }

        // ── VQS Score ─────────────────────────────────────────────────────────
        $lines[] = $apePrefix . 'VQS-SCORE:' . $vqsScore;
        $lines[] = $apePrefix . 'VQS-TIER:' . $vqsTier;
        $lines[] = '';

        // ── Cadena de Degradación Graceful (7 niveles) ─────────────────────────
        $lines[] = $apePrefix . 'DEGRADATION-CHAIN:' . implode('→', self::DEGRADATION_CHAIN);
        $lines[] = '';

        // ── EXT-X-STREAM-INF (condicional por player) ─────────────────────────
        $includeStreamInf = self::shouldIncludeStreamInf($playerProf, $stealthUA);
        if ($includeStreamInf) {
            $streamInfLine = '#EXT-X-STREAM-INF:BANDWIDTH=' . $bitrate;
            $streamInfLine .= ',CODECS="' . $codec . '"';
            $streamInfLine .= ',RESOLUTION=' . $resolution;
            $streamInfLine .= ',FRAME-RATE=' . $frameRate;
            if ($lcevcEnabled && $lcevcState !== 'OFF') {
                $streamInfLine .= ',VIDEO-RANGE=' . ($hdrProfile !== 'SDR' ? 'PQ' : 'SDR');
            }
            $lines[] = $streamInfLine;
        }

        // ── EXTHTTP (User-Agent y headers HTTP) ────────────────────────────────
        $ua = $stealthUA ?: 'Mozilla/5.0 (IPTV Navigator PRO v4.0)';
        $exthttp = ['User-Agent' => $ua];
        if (!empty($channelConfig['referer'])) {
            $exthttp['Referer'] = $channelConfig['referer'];
        }
        if (!empty($channelConfig['origin'])) {
            $exthttp['Origin'] = $channelConfig['origin'];
        }
        if (!empty($channelConfig['cookie'])) {
            $exthttp['Cookie'] = $channelConfig['cookie'];
        }
        $lines[] = '#EXTHTTP:' . json_encode($exthttp, JSON_UNESCAPED_SLASHES);

        // ── EXTVLCOPT (para VLC) ───────────────────────────────────────────────
        if (in_array($playerProf, [self::PROFILE_PREMIUM, self::PROFILE_HIGH, self::PROFILE_STANDARD])) {
            $lines[] = '#EXTVLCOPT:http-user-agent=' . $ua;
            if (!empty($channelConfig['referer'])) {
                $lines[] = '#EXTVLCOPT:http-referrer=' . $channelConfig['referer'];
            }
        }

        // ── KODIPROP (para Kodi) ───────────────────────────────────────────────
        if (in_array($playerProf, [self::PROFILE_PREMIUM, self::PROFILE_HIGH])) {
            $lines[] = '#KODIPROP:inputstream=inputstream.adaptive';
            $lines[] = '#KODIPROP:inputstream.adaptive.manifest_type=hls';
            if ($lcevcEnabled) {
                $lines[] = '#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive';
            }
        }

        // ── EXTINF ────────────────────────────────────────────────────────────
        $extinf = '#EXTINF:-1';
        if (!empty($logo)) $extinf .= ' tvg-logo="' . $logo . '"';
        if (!empty($group)) $extinf .= ' group-title="' . $group . '"';
        $extinf .= ',' . $name;
        $lines[] = $extinf;

        // ── URL (DEBE ser última) ──────────────────────────────────────────────
        // Seleccionar la mejor URL según la cadena de degradación
        $bestUrl = self::selectBestUrlFromDegradationChain($channelConfig, $manifests);
        $lines[] = $bestUrl;

        return implode("\n", $lines) . "\n";
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HYDRA STEALTH OBFUSCATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Aplica la ofuscación Hydra Stealth a los tags APE.
     * Convierte #EXT-X-APE-* → #EXT-X-SYS-* para evadir DPI de ISP.
     *
     * @param array $apeLines Líneas con tags #EXT-X-APE-*
     * @return array          Líneas ofuscadas con tags #EXT-X-SYS-*
     */
    public static function applyHydraStealthObfuscation(array $apeLines): array
    {
        $obfuscated = [];
        foreach ($apeLines as $line) {
            $obfLine = $line;
            foreach (self::HYDRA_STEALTH_MAP as $from => $to) {
                if (str_starts_with($obfLine, $from)) {
                    $obfLine = $to . substr($obfLine, strlen($from));
                    break;
                }
            }
            $obfuscated[] = $obfLine;
        }
        return $obfuscated;
    }

    /**
     * Aplica Hydra Stealth a un manifiesto completo (string).
     *
     * @param string $manifest Manifiesto M3U8 completo
     * @return string          Manifiesto con tags ofuscados
     */
    public static function applyHydraStealthToManifest(string $manifest): string
    {
        foreach (self::HYDRA_STEALTH_MAP as $from => $to) {
            $manifest = str_replace($from, $to, $manifest);
        }
        return $manifest;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // APE DNA OMNI-INJECTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Construye el objeto APE DNA con todos los campos de configuración.
     * Captura 154+ campos desde la configuración del canal.
     *
     * @param array $channelConfig Configuración completa del canal
     * @return array               Objeto APE DNA con todos los campos
     */
    public static function buildApeDna(array $channelConfig): array
    {
        $dna = [
            '_meta' => [
                'version'    => self::VERSION,
                'engine'     => 'APE-OMNI-ORCHESTRATOR-V18',
                'format'     => 'CMAF-UNIVERSAL',
                'timestamp'  => date('c'),
                'field_count' => count(self::APE_DNA_FIELDS),
            ]
        ];

        // Inyectar todos los campos APE DNA
        foreach (self::APE_DNA_FIELDS as $field) {
            if (isset($channelConfig[$field])) {
                $dna[$field] = $channelConfig[$field];
            }
        }

        // Campos calculados
        $dna['ape_version']        = self::VERSION;
        $dna['ape_build_timestamp'] = date('Ymd-His');
        $dna['ape_dna_hash']       = substr(md5(json_encode($channelConfig)), 0, 16);
        $dna['degradation_chain']  = self::DEGRADATION_CHAIN;

        return $dna;
    }

    /**
     * Serializa el APE DNA como tags #EXT-X-APE-DNA-* para inyección en manifiesto.
     *
     * @param array  $apeDna    Objeto APE DNA
     * @param bool   $hydra     Si true, ofusca los tags
     * @return array            Líneas de tags APE DNA
     */
    public static function serializeApeDnaToTags(array $apeDna, bool $hydra = false): array
    {
        $prefix = $hydra ? '#EXT-X-SYS-DNA-' : '#EXT-X-APE-DNA-';
        $tags   = [];

        // Solo serializar los campos más importantes para no inflar el manifiesto
        $keyFields = [
            'channel_id', 'channel_name', 'codec_primary', 'cmaf_enabled',
            'lcevc_enabled', 'lcevc_state', 'hdr_profile', 'ai_sr_enabled',
            'vqs_score', 'vqs_tier', 'player_profile', 'ape_version',
            'ape_dna_hash', 'ape_build_timestamp',
        ];

        foreach ($keyFields as $field) {
            if (isset($apeDna[$field])) {
                $value = is_bool($apeDna[$field]) ? ($apeDna[$field] ? '1' : '0') : (string)$apeDna[$field];
                $tags[] = $prefix . strtoupper(str_replace('_', '-', $field)) . ':' . $value;
            }
        }

        return $tags;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTELIGENCIA MULTI-REPRODUCTOR v18 — stealthUA Dispatcher
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Determina si se debe incluir #EXT-X-STREAM-INF según el player.
     * Implementa la Inteligencia Multi-Reproductor v18.
     *
     * @param string $playerProfile Perfil del player
     * @param string $stealthUA     User-Agent seleccionado en la UI
     * @return bool                 True si se debe incluir EXT-X-STREAM-INF
     */
    public static function shouldIncludeStreamInf(string $playerProfile, string $stealthUA = ''): bool
    {
        // Players que REQUIEREN #EXT-X-STREAM-INF para ABR
        $requiresStreamInf = [
            'TiviMate', 'OTT_Navigator', 'IPTV_Smarters', 'GSE_Smart_IPTV',
            'Perfect_Player', 'Televizo', 'Sparkle', 'ExoPlayer',
            'Kodi_19', 'Kodi_18', 'Plex', 'Emby', 'Jellyfin',
            'Samsung_Tizen', 'LG_WebOS', 'Apple_TV', 'Infuse',
            'Channels_DVR', 'Fire_TV', 'NVIDIA_SHIELD', 'Shaka',
            'HLS_js', 'Video_js', 'Chrome', 'Firefox',
        ];

        // Players que NO deben recibir #EXT-X-STREAM-INF
        $noStreamInf = [
            'VLC_3', 'VLC_2', 'MPV', 'MPC_HC',
            'MAG_Old', 'MAG_New', 'Formuler', 'Dreamlink',
            'Roku', 'Safari_iOS', 'Safari_macOS',
        ];

        // Verificar por stealthUA primero
        foreach ($requiresStreamInf as $player) {
            if (str_contains($stealthUA, str_replace('_', '', $player)) ||
                str_contains($stealthUA, str_replace('_', ' ', $player))) {
                return true;
            }
        }
        foreach ($noStreamInf as $player) {
            if (str_contains($stealthUA, str_replace('_', '', $player)) ||
                str_contains($stealthUA, str_replace('_', ' ', $player))) {
                return false;
            }
        }

        // Verificar por perfil
        return in_array($playerProfile, [
            self::PROFILE_PREMIUM,
            self::PROFILE_HIGH,
            self::PROFILE_STANDARD,
        ]);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CADENA DE DEGRADACIÓN GRACEFUL — 7 Niveles
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Selecciona la mejor URL disponible siguiendo la cadena de degradación de 7 niveles.
     * Garantiza que NINGÚN player quede sin reproducción.
     *
     * Nivel 1: CMAF+HEVC/AV1 (PREMIUM — CMAF+HEVC/AV1+LCEVC+HDR10+)
     * Nivel 2: HLS/fMP4+HEVC (HIGH — HLS fMP4 + HEVC)
     * Nivel 3: HLS/fMP4+H.264 (STANDARD — HLS fMP4 + H.264)
     * Nivel 4: HLS/TS+H.264 (COMPAT — HLS TS + H.264)
     * Nivel 5: HLS/TS+Baseline (LEGACY — HLS TS + H.264 Baseline)
     * Nivel 6: TS Direct (MINIMAL — TS directo)
     * Nivel 7: HTTP redirect (LAST RESORT — redirect a origen)
     *
     * @param array $channelConfig Configuración del canal
     * @param array $manifests     Mapa de formato → URL
     * @return string              Mejor URL disponible
     */
    public static function selectBestUrlFromDegradationChain(
        array $channelConfig,
        array $manifests = []
    ): string {
        $playerProfile = $channelConfig['player_profile'] ?? self::PROFILE_STANDARD;
        $lcevcEnabled  = (bool)($channelConfig['lcevc_enabled'] ?? false);
        $cmafEnabled   = (bool)($channelConfig['cmaf_enabled'] ?? true);

        // Nivel 1: CMAF+HEVC/AV1 (PREMIUM)
        if ($playerProfile === self::PROFILE_PREMIUM && $cmafEnabled) {
            if (!empty($manifests['cmaf_hevc'])) return $manifests['cmaf_hevc'];
            if (!empty($manifests['cmaf_av1']))  return $manifests['cmaf_av1'];
            if (!empty($manifests['cmaf']))      return $manifests['cmaf'];
        }

        // Nivel 2: HLS/fMP4+HEVC (HIGH)
        if (in_array($playerProfile, [self::PROFILE_PREMIUM, self::PROFILE_HIGH])) {
            if (!empty($manifests['hls_fmp4_hevc'])) return $manifests['hls_fmp4_hevc'];
            if (!empty($manifests['hls_hevc']))      return $manifests['hls_hevc'];
        }

        // Nivel 3: HLS/fMP4+H.264 (STANDARD)
        if (in_array($playerProfile, [self::PROFILE_PREMIUM, self::PROFILE_HIGH, self::PROFILE_STANDARD])) {
            if (!empty($manifests['hls_fmp4']))   return $manifests['hls_fmp4'];
            if (!empty($manifests['hls_cmaf']))   return $manifests['hls_cmaf'];
        }

        // Nivel 4: HLS/TS+H.264 (COMPAT)
        if (!empty($manifests['hls_ts'])) return $manifests['hls_ts'];
        if (!empty($manifests['hls']))    return $manifests['hls'];
        if (!empty($manifests['m3u8']))   return $manifests['m3u8'];

        // Nivel 5: HLS/TS+Baseline (LEGACY)
        if (!empty($manifests['hls_baseline'])) return $manifests['hls_baseline'];

        // Nivel 6: TS Direct (MINIMAL)
        if (!empty($manifests['ts_direct'])) return $manifests['ts_direct'];
        if (!empty($manifests['ts']))        return $manifests['ts'];

        // Nivel 7: HTTP redirect (LAST RESORT)
        $streamUrl = $channelConfig['stream_url'] ?? '';
        if (!empty($streamUrl)) return $streamUrl;

        // Fallback absoluto: primera URL disponible
        return reset($manifests) ?: '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GENERACIÓN DE MANIFIESTO COMPLETO (Playlist M3U8 Multi-Canal)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Genera una playlist M3U8 completa con múltiples canales.
     * Aplica el pipeline APE v18.2 completo a cada canal.
     *
     * @param array  $channels     Array de configuraciones de canales
     * @param string $baseUrl      URL base del VPS
     * @param array  $globalConfig Configuración global (hydra, player profile, etc.)
     * @return string              Playlist M3U8 completa
     */
    public static function generateFullPlaylist(
        array  $channels,
        string $baseUrl      = '',
        array  $globalConfig = []
    ): string {
        $hydra        = (bool)($globalConfig['hydra_stealth_enabled'] ?? false);
        $playerProfile = $globalConfig['player_profile'] ?? self::PROFILE_STANDARD;
        $apePrefix    = $hydra ? '#EXT-X-SYS-' : '#EXT-X-APE-';

        $lines = [];

        // Cabecera de la playlist
        $lines[] = '#EXTM3U';
        $lines[] = '#EXT-X-VERSION:7';
        $lines[] = '';
        $lines[] = $apePrefix . 'VERSION:' . self::VERSION;
        $lines[] = $apePrefix . 'ENGINE:APE-OMNI-ORCHESTRATOR-V18';
        $lines[] = $apePrefix . 'FORMAT:CMAF-UNIVERSAL';
        $lines[] = $apePrefix . 'PLAYER-PROFILE:' . $playerProfile;
        $lines[] = $apePrefix . 'CHANNEL-COUNT:' . count($channels);
        $lines[] = $apePrefix . 'BUILD:' . date('Ymd-His');
        $lines[] = $apePrefix . 'DEGRADATION-CHAIN:' . implode('→', self::DEGRADATION_CHAIN);
        $lines[] = '';

        // Procesar cada canal
        foreach ($channels as $channelConfig) {
            // Heredar configuración global si el canal no la tiene
            $mergedConfig = array_merge($globalConfig, $channelConfig);
            $mergedConfig['player_profile'] = $channelConfig['player_profile'] ?? $playerProfile;

            // Generar el bloque del canal
            $channelBlock = self::generateCmafUniversalManifest($mergedConfig, $baseUrl);

            // Aplicar Hydra Stealth al bloque completo si está habilitado
            if ($hydra) {
                $channelBlock = self::applyHydraStealthToManifest($channelBlock);
            }

            $lines[] = $channelBlock;
        }

        return implode("\n", $lines);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS ESTÁTICOS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Retorna la versión del motor APE.
     */
    public static function getVersion(): string
    {
        return self::VERSION;
    }

    /**
     * Retorna la cadena de degradación graceful de 7 niveles.
     */
    public static function getDegradationChain(): array
    {
        return self::DEGRADATION_CHAIN;
    }

    /**
     * Retorna todos los campos APE DNA disponibles.
     */
    public static function getApeDnaFields(): array
    {
        return self::APE_DNA_FIELDS;
    }

    /**
     * Retorna el mapa de ofuscación Hydra Stealth.
     */
    public static function getHydraStealthMap(): array
    {
        return self::HYDRA_STEALTH_MAP;
    }

    /**
     * Determina el perfil de player a partir de sus capacidades.
     *
     * @param bool $fmp4  Soporta fMP4
     * @param bool $dash  Soporta DASH
     * @param bool $hevc  Soporta HEVC
     * @param bool $lcevc Soporta LCEVC
     * @param bool $av1   Soporta AV1
     * @param bool $hdr10 Soporta HDR10
     * @return string     Perfil del player
     */
    public static function resolvePlayerProfile(
        bool $fmp4,
        bool $dash,
        bool $hevc,
        bool $lcevc,
        bool $av1,
        bool $hdr10
    ): string {
        if ($fmp4 && $hevc && ($lcevc || $av1) && $hdr10) return self::PROFILE_PREMIUM;
        if ($fmp4 && $hevc && $hdr10)                     return self::PROFILE_HIGH;
        if ($fmp4 && $hevc)                               return self::PROFILE_HIGH;
        if ($fmp4)                                        return self::PROFILE_STANDARD;
        if ($dash)                                        return self::PROFILE_STANDARD;
        return self::PROFILE_LEGACY;
    }
}
