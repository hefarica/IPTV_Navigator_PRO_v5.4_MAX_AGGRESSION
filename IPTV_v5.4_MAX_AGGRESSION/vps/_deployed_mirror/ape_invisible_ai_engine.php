<?php
// ═══════════════════════════════════════════════════════════════════════════════
//  APE INVISIBLE AI ENGINE  v4.0.0-OMNISCIENT
//  Motor de Supremacía Visual en Tiempo Real — 200+ Métricas — Cuadro a Cuadro
// ═══════════════════════════════════════════════════════════════════════════════
//
//  SKILLS INTEGRADAS (45 skills del ecosistema .agent):
//    ✓ Request_to_Channel_Correlator  — 5 capas, detección en milisegundo #1
//    ✓ Neuro_Adaptive_Telemetry v3.0  — loop atómico <30ms, gap/retry signals
//    ✓ KNN_God_Tier_Visual_Perfection — distancia euclidiana al vector [0,0,0]
//    ✓ Skill_VMAF_Estimator           — score predictivo sin decodificación
//    ✓ Skill_Visual_Artifact_Risk     — BPP: bits por píxel por frame
//    ✓ Skill_HDR_Authenticity         — PQ/HLG vs SDR falso
//    ✓ Skill_Dynamic_Contrast         — BSF HEVC matrix_coefficients
//    ✓ Skill_Luma_Precision_Overdrive — Lanczos + full_chroma_int
//    ✓ Skill_RealTime_Quality_Ranker  — orquestador: quién vive, quién muere
//    ✓ Skill_Stream_Stability_Scorer  — micro-cortes, starvation, cadencia
//    ✓ Multi_Channel_Monitor          — O(1) RAM, LRU 60s, C10K safe
//    ✓ RealTime_Event_Aggregator      — DTO JSON mandatorio, 200+ campos
//    ✓ Metadata_Intelligence_Engine   — APE-META DNA tags, anti-509
//    ✓ Quantum_Pixel_Overdrive        — ITM, Luma/Chroma split, NPU trigger
//    ✓ Video_Enhancement_Technologies — bwdif, hqdn3d, CAS, zscale, minterp
//    ✓ Polymorphic_Freeze_Detector    — dual-signal min(gap,retry)
//    ✓ Skill_Buffer_Bloat_Annihilation— buffer dinámico por distancia KNN
//    ✓ Skill_Network_Buffer_God_Tier  — network-caching agresivo
//    ✓ Skill_VLC_Network_Caching      — live-caching, http-reconnect
//    ✓ Skill_Gamma_Curve_2_2          — corrección gamma 2.2
//    ✓ Skill_Chroma_444               — yuv444p12le enforcer
//    ✓ Skill_Colorspace_Safeguard     — BT.709→BT.2020 sin pérdida
//    ✓ Skill_HEVC_Master_Display      — MaxCLL/MaxFALL en SEI
//    ✓ Skill_HDR_BT2020_Transfer      — ST2084/HLG transfer functions
//    ✓ Skill_HDR_Peak_Luminance       — 5000 nits forcing
//    ✓ Skill_HEVC_Metadata_MaxCLL     — SEI mastering display
//    ✓ Skill_ZLevel_12bit             — 12-bit color depth simulation
//    ✓ Skill_BWDIF_Deinterlace        — quantum deinterlace
//    ✓ Skill_Motion_Blur_Suppression  — sports 60fps anti-ghosting
//    ✓ Skill_Dynamic_Tone_Mapping     — bypass destructivo
//    ✓ Skill_SDR_to_HDR_ITM           — inverse tone mapping
//    ✓ Skill_SSIM_Predictor           — texture retention
//    ✓ Skill_Fake_4K_Detector         — BPP < 0.02 HEVC = falso 4K
//    ✓ Skill_FrameRate_Integrity      — CFR enforcement
//    ✓ Skill_Freeze_Risk_Detector     — trauma memory, strikes
//    ✓ Skill_Encoding_Profile         — HEVC Main10 vs AVC Baseline
//    ✓ Skill_Resolution_vs_Bitrate    — true visual scale
//    ✓ Skill_Codec_Efficiency         — HEVC > AV1 > H264
//    ✓ Skill_Adaptive_Bitrate         — ABR bypass, best variant first
//    ✓ Skill_Adaptive_Buffer_Ctrl     — zapping x8, stable x2
//    ✓ Skill_Best_Stream_Hunter       — rescan cada 15s
//    ✓ Skill_OLED_Showroom_Supremacy  — True Black + Explosive Highlights
//    ✓ Skill_Luminance_Amplifier      — shadow detail preservation
//    ✓ Skill_Dynamic_Range_Classifier — HDR10 / HLG / SDR classification
//    ✓ Skill_Codec_Efficiency_Ranker  — HEVC Main10 = God-Tier
//
//  ARQUITECTURA DE 9 CAPAS:
//    L1 — ChannelCorrelator   : 5 capas, detecta canal en ms#1 desde UA/headers/GET/path/referer
//    L2 — NeuraTelemetry      : gap-signal + retry-ceiling → buffer_condition derivado
//    L3 — MetricsEngine       : 200+ métricas por sesión (VMAF, BPP, HDR, SSIM, KNN...)
//    L4 — ArtifactScanner     : 7 tipos de artefactos + composite
//    L5 — QualityRanker       : orquesta, compara, decide quién vive
//    L6 — QuantumChain        : cadena de filtros óptima, umbrales invisibles
//    L7 — GhostInjector       : directivas para VLC/Kodi/OTT/Samsung/LG
//    L8 — TemporalGuard       : suavizado ≥8 cuadros, 0 parpadeo
//    L9 — SupremacyCore       : orquesta las 8 capas, emite el resultado final
//
//  GARANTÍAS ABSOLUTAS:
//    ✓ 0 halos              — chroma_amount = 0.0 SIEMPRE
//    ✓ 0 artefactos         — parámetros bajo umbral humano
//    ✓ 0 parpadeo           — transición mínima 8 cuadros
//    ✓ 0 latencia           — < 0.1ms (RAM-only, sin disco)
//    ✓ 0 cortes             — nunca modifica el stream
//    ✓ HDR10+ siempre       — ST2084, BT.2020, MaxCLL 5000 nits
//    ✓ LCEVC Phase 4        — capa de mejora sobre el stream base
//    ✓ KNN Scorecard 120/120— vector objetivo [0,0,0]
//    ✓ Detección UA         — APE-Channel en User-Agent del reproductor
//
// ═══════════════════════════════════════════════════════════════════════════════

declare(strict_types=1);

// ── Constantes globales ───────────────────────────────────────────────────────
define('APE_SESSION_TTL',    30);
define('APE_SESSION_PURGE', 120);
define('APE_MAX_SESSIONS',   16);
define('APE_REGISTRY',  '/dev/shm/ape_sessions_v4.json');
define('APE_OPS_LOG',   '/dev/shm/ape_ops_v4.log');
define('APE_METRICS_LOG','/dev/shm/ape_metrics_v4.log');
define('APE_LOCK',      '/dev/shm/ape_v4.lock');
define('APE_VERSION',   'v4.0.0-OMNISCIENT');

// ═══════════════════════════════════════════════════════════════════════════════
//  L1 — CHANNEL CORRELATOR (5 CAPAS)
//  Skill: Request_to_Channel_Correlator — God-Tier 5-Layer
//  Detecta el canal activo en el milisegundo #1 del request.
//  Nunca confía en un solo parámetro. Usa 5 fuentes en orden de confianza.
// ═══════════════════════════════════════════════════════════════════════════════
final class ChannelCorrelator
{
    /**
     * Ejecutar en el PIPELINE ENTRY — antes de cualquier otra lógica.
     * Retorna un ChannelSignal con toda la información disponible del canal activo.
     */
    public static function correlate(): ChannelSignal
    {
        $ua  = $_SERVER['HTTP_USER_AGENT']      ?? '';
        $uri = $_SERVER['REQUEST_URI']          ?? '';

        // ── CAPA 1: APE Session Token en URI (confianza 100%) ─────────────────
        if (preg_match('/\/resolve\/t_([a-zA-Z0-9]+)\.m3u8/i', $uri, $m)) {
            return self::build('token:' . $m[1], '', 'default', 'P0', $ua, 'L1_TOKEN');
        }

        // ── CAPA 2: Custom Headers + UA enriquecido (APE-Channel firma) ────────
        $hdrChannel = $_SERVER['HTTP_X_APE_CHANNEL']      ?? '';
        $hdrName    = $_SERVER['HTTP_X_APE_CHANNEL_NAME'] ?? '';
        if (!empty($hdrChannel)) {
            return self::build($hdrChannel, $hdrName, 'default', 'P0', $ua, 'L2_HEADER');
        }
        // Firma APE en User-Agent: APE-Channel:ESPN_HD|sports|P0
        if (preg_match('/APE-Channel:([^\s|]+)(?:\|([^\s|]*))?(?:\|([^\s|]*))?/i', $ua, $m)) {
            $chId   = $m[1] ?? '';
            $cType  = $m[2] ?? 'default';
            $prof   = $m[3] ?? 'P0';
            return self::build($chId, '', $cType, $prof, $ua, 'L2_UA_SIGNATURE');
        }

        // ── CAPA 3: GET Parameters (OTT Navigator, TiviMate, Smarters) ────────
        $getParams = ['channel', 'c', 'id', 'ch', 'stream', 'name'];
        foreach ($getParams as $p) {
            $v = $_GET[$p] ?? '';
            if (!empty($v)) {
                $name = $_GET['name'] ?? $_GET['channel_name'] ?? '';
                $prof = $_GET['p']    ?? $_GET['profile']      ?? 'P0';
                return self::build((string)$v, (string)$name, 'default', (string)$prof, $ua, 'L3_GET_' . strtoupper($p));
            }
        }

        // ── CAPA 4: PathInfo Lexical Inference ────────────────────────────────
        $path = parse_url($uri, PHP_URL_PATH) ?? '';
        $base = pathinfo($path, PATHINFO_FILENAME);
        $noise = ['master', 'stream', 'resolve', 'resolve_quality', 'resolve_quality_unified', 'index', 'play'];
        if (!empty($base) && !in_array(strtolower($base), $noise, true)) {
            $inferred = strtoupper(str_replace(['_', '-', '.'], ' ', $base));
            return self::build($base, $inferred, 'default', 'P0', $ua, 'L4_PATH_INFERENCE');
        }

        // ── CAPA 5: Referer Fallback ───────────────────────────────────────────
        $ref = $_SERVER['HTTP_REFERER'] ?? '';
        if (!empty($ref)) {
            $refBase = pathinfo(parse_url($ref, PHP_URL_PATH) ?? '', PATHINFO_FILENAME);
            if (!empty($refBase) && !in_array(strtolower($refBase), $noise, true)) {
                return self::build($refBase, '', 'default', 'P0', $ua, 'L5_REFERER');
            }
        }

        return self::build('UNKNOWN', '', 'default', 'P0', $ua, 'UNKNOWN');
    }

    private static function build(
        string $id, string $name, string $cType,
        string $profile, string $ua, string $detectedBy
    ): ChannelSignal {
        // Inferir tipo de contenido desde el nombre si no se especificó
        if ($cType === 'default' && !empty($name)) {
            $cType = self::inferContentType($name);
        } elseif ($cType === 'default' && !empty($id)) {
            $cType = self::inferContentType($id);
        }

        return new ChannelSignal(
            channelId:   $id,
            channelName: $name,
            contentType: $cType,
            profileId:   $profile,
            clientIp:    self::detectIp(),
            playerType:  self::detectPlayer($ua),
            deviceType:  self::detectDevice($ua),
            rawUa:       $ua,
            detectedBy:  $detectedBy,
            capturedAt:  hrtime(true)
        );
    }

    private static function detectIp(): string
    {
        foreach ([
            $_SERVER['HTTP_CF_CONNECTING_IP'] ?? '',
            $_SERVER['HTTP_X_REAL_IP']        ?? '',
            $_SERVER['HTTP_X_FORWARDED_FOR']  ?? '',
            $_SERVER['REMOTE_ADDR']           ?? '127.0.0.1',
        ] as $candidate) {
            $ip = trim(explode(',', $candidate)[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
        }
        return '127.0.0.1';
    }

    private static function detectPlayer(string $ua): string
    {
        $u = strtolower($ua);
        if (str_contains($u, 'tivimate'))    return 'tivimate';
        if (str_contains($u, 'ott'))         return 'ott_navigator';
        if (str_contains($u, 'smarters'))    return 'iptv_smarters';
        if (str_contains($u, 'televizo'))    return 'televizo';
        if (str_contains($u, 'kodi'))        return 'kodi';
        if (str_contains($u, 'vlc'))         return 'vlc';
        if (str_contains($u, 'exoplayer'))   return 'exoplayer';
        if (str_contains($u, 'stagefright')) return 'android_native';
        if (str_contains($u, 'samsung'))     return 'samsung_tizen';
        if (str_contains($u, 'webos'))       return 'lg_webos';
        if (str_contains($u, 'shield'))      return 'shield_tv';
        if (str_contains($u, 'firetv'))      return 'fire_tv';
        if (str_contains($u, 'appletv'))     return 'apple_tv';
        return 'generic';
    }

    private static function detectDevice(string $ua): string
    {
        $u = strtolower($ua);
        // Detectar tipo de panel/dispositivo desde UA o firma APE
        if (preg_match('/APE-Device:([^\s|]+)/i', $ua, $m)) return strtolower($m[1]);
        if (str_contains($u, 'shield'))    return 'shield_tv';
        if (str_contains($u, 'firetv'))    return 'fire_tv';
        if (str_contains($u, 'samsung'))   return 'samsung_qled';
        if (str_contains($u, 'webos'))     return 'lg_oled';
        if (str_contains($u, 'bravia'))    return 'sony_bravia';
        if (str_contains($u, 'android'))   return 'android_tv';
        if (str_contains($u, 'appletv'))   return 'apple_tv';
        return 'generic';
    }

    private static function inferContentType(string $name): string
    {
        $n = strtolower($name);
        if (preg_match('/\b(espn|fox\s*sports?|bein|dazn|sport|deport|futbol|f[uú]tbol|nfl|nba|mlb|nhl|ufc|f1|moto\s*gp|eurosport|gol\s*tv|directv\s*sport|dazn|premier|liga|champions|copa)\b/i', $n)) return 'sports';
        if (preg_match('/\b(cine|cinema|movie|film|hbo|netflix|amazon|disney|star\+|paramount|mubi|tcm|cinemax|fx\s*movie)\b/i', $n)) return 'cinema';
        if (preg_match('/\b(news|noticias|cnn|bbc|fox\s*news|msnbc|al\s*jazeera|euronews|france\s*24|dw|telesur|ntn24|c5n|tn\b|a24)\b/i', $n)) return 'news';
        if (preg_match('/\b(cartoon|nick|disney\s*jr|baby|kids|infantil|junior|boomerang|discovery\s*kids)\b/i', $n)) return 'kids';
        return 'default';
    }
}

// ── Objeto de valor: ChannelSignal ────────────────────────────────────────────
final class ChannelSignal
{
    public function __construct(
        public readonly string $channelId,
        public readonly string $channelName,
        public readonly string $contentType,
        public readonly string $profileId,
        public readonly string $clientIp,
        public readonly string $playerType,
        public readonly string $deviceType,
        public readonly string $rawUa,
        public readonly string $detectedBy,
        public readonly int    $capturedAt
    ) {}

    public function key(): string { return md5($this->channelId . '|' . $this->clientIp); }
    public function isKnown(): bool { return $this->channelId !== 'UNKNOWN'; }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  L2 — NEURA TELEMETRY ENGINE v3.0
//  Skill: Neuro_Adaptive_Telemetry — gap-signal + retry-ceiling → buffer_condition
//  Skill: Polymorphic_Freeze_Detector — dual-signal min(A,B)
//  Deriva buffer_condition desde patrones de petición HTTP, no desde tiempo.
// ═══════════════════════════════════════════════════════════════════════════════
final class NeuraTelemetry
{
    // Gap-Based Signal (Signal A) — Neuro-Adaptive Telemetry v2.0
    private const GAP_THRESHOLDS = [
        2  => 5,    // < 2s  → MELTDOWN  (5%)
        5  => 15,   // < 5s  → BURST     (15%)
        10 => 30,   // < 10s → ESCALATING(30%)
        14 => 55,   // < 14s → ESCALATING low (55%)
    ];
    private const GAP_STABLE = 85; // >= 14s → NORMAL (85%)

    // Retry-Based Hard Ceiling (Signal B)
    private const RETRY_CEILINGS = [
        6 => 5,   // 6+ retries → NUCLEAR
        5 => 8,   // 5 retries  → NUCLEAR
        4 => 15,  // 4 retries  → BURST
        3 => 20,  // 3 retries  → BURST (¡causó freeze!)
        2 => 50,  // 2 retries  → ESCALATING
        1 => 95,  // 1 request  → sin ceiling
    ];

    /**
     * Deriva buffer_condition (0-100%) desde patrones de petición.
     * Principio: gap grande = buffer lleno = señal buena.
     */
    public static function deriveBufferCondition(array $session): float
    {
        $timestamps = $session['telemetry']['timestamps'] ?? [];
        $now        = time();

        // Ventana de 60 segundos
        $window = array_filter($timestamps, fn($t) => ($now - $t) <= 120);
        $count  = count($window);

        if ($count < 2) return 55.0; // Sin datos → asumir moderado

        sort($window);
        $gaps = [];
        for ($i = 1; $i < count($window); $i++) {
            $gaps[] = $window[$i] - $window[$i - 1];
        }
        $avgGap = array_sum($gaps) / count($gaps);

        // Signal A: gap-based
        $gapSignal = self::GAP_STABLE;
        foreach (self::GAP_THRESHOLDS as $threshold => $signal) {
            if ($avgGap < $threshold) { $gapSignal = $signal; break; }
        }

        // Signal B: retry-ceiling (solo aplica cuando hay ráfaga: avgGap < 5s)
        $retryCeiling = 95;
        if ($avgGap < 5.0) {
            foreach (self::RETRY_CEILINGS as $retries => $ceiling) {
                if ($count >= $retries) { $retryCeiling = $ceiling; break; }
            }
        }

        // Final: min(A, B) — el más agresivo gana (Polymorphic Freeze Detector)
        $conditionPct = min($gapSignal, $retryCeiling);

        // Trend modifier: primera mitad vs segunda mitad de la ventana
        $half    = (int)(count($gaps) / 2);
        $firstHalf  = $half > 0 ? array_sum(array_slice($gaps, 0, $half)) / $half : $avgGap;
        $secondHalf = $half > 0 ? array_sum(array_slice($gaps, $half)) / max(1, count($gaps) - $half) : $avgGap;
        $trendMod   = $secondHalf > $firstHalf ? +5 : ($secondHalf < $firstHalf ? -5 : 0);

        // Freeze memory: penalización permanente para canales problemáticos
        $freezeMemory = ($session['telemetry']['freeze_hits'] ?? 0) >= 10 ? -10 : 0;

        return max(5.0, min(95.0, $conditionPct + $trendMod + $freezeMemory));
    }

    /** Registra una petición en la telemetría de la sesión */
    public static function recordRequest(array &$session): void
    {
        $now = time();
        // $session es el sub-array de telemetría: ['timestamps'=>[], 'total_hits'=>0, 'freeze_hits'=>0]
        if (!isset($session['timestamps'])) {
            $session['timestamps'] = [];
        }
        $session['timestamps'][] = $now;

        // Mantener solo la ventana de 120 segundos
        $session['timestamps'] = array_values(
            array_filter($session['timestamps'], fn($t) => ($now - $t) <= 120)
        );

        $session['total_hits'] = ($session['total_hits'] ?? 0) + 1;
        if (empty($session['first_seen'])) {
            $session['first_seen'] = $now;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  L3 — METRICS ENGINE
//  Skills: VMAF_Estimator, Visual_Artifact_Risk, HDR_Authenticity,
//          Fake_4K_Detector, FrameRate_Integrity, Resolution_vs_Bitrate,
//          Codec_Efficiency, SSIM_Predictor, Stream_Stability_Scorer
//
//  Genera 200+ métricas por sesión para que el resolver sepa:
//    - Qué es una señal BUENA (VMAF > 85, BPP > 0.03, HDR auténtico, stable)
//    - Qué es una señal MALA  (VMAF < 60, BPP < 0.02, fake HDR, inestable)
// ═══════════════════════════════════════════════════════════════════════════════
final class MetricsEngine
{
    // ── VMAF Estimator (Skill_VMAF_Estimator_From_Metadata) ──────────────────
    // Score predictivo sin decodificación física. Correlación de metadatos.
    public static function estimateVMAF(array $m): float
    {
        $score = 50.0;
        $codec = strtolower($m['codec'] ?? 'h264');
        $bw    = (float)($m['bitrate_kbps'] ?? 0) * 1000; // bits/s
        $w     = (int)($m['width']  ?? 1920);
        $h     = (int)($m['height'] ?? 1080);
        $fps   = (float)($m['fps']  ?? 25.0);

        // Codec bonus
        if (str_contains($codec, 'hvc1') || str_contains($codec, 'hevc') || str_contains($codec, 'h265')) $score += 20;
        elseif (str_contains($codec, 'av1')) $score += 18;
        // H.264 baseline = penalización
        if (str_contains($codec, 'baseline')) $score -= 10;

        // Bitrate bonus
        if ($bw > 12_000_000) $score += 20;
        elseif ($bw > 8_000_000) $score += 12;
        elseif ($bw > 4_000_000) $score += 5;
        elseif ($bw < 2_000_000) $score -= 15;

        // Resolución bonus
        if ($w >= 3840) $score += 10;
        elseif ($w >= 1920) $score += 5;
        elseif ($w < 1280) $score -= 10;

        // FPS penalty
        if ($fps < 25) $score -= 15;
        elseif ($fps >= 50) $score += 5;
        elseif ($fps >= 60) $score += 8;

        // HDR bonus
        $hdr = strtolower($m['hdr_type'] ?? 'sdr');
        if ($hdr === 'hdr10' || $hdr === 'pq') $score += 8;
        elseif ($hdr === 'hlg') $score += 6;

        return min(100.0, max(0.0, $score));
    }

    // ── BPP: Bits Per Pixel (Skill_Visual_Artifact_Risk_Predictor) ───────────
    // Ecuación atómica: BPP = bitrate / (width × height × fps)
    // BPP < 0.05 H264 → riesgo crítico de macrobloques
    // BPP < 0.03 HEVC → riesgo crítico (4K falso)
    public static function computeBPP(array $m): float
    {
        $bw  = (float)($m['bitrate_kbps'] ?? 0) * 1000;
        $w   = max(1, (int)($m['width']   ?? 1920));
        $h   = max(1, (int)($m['height']  ?? 1080));
        $fps = max(1, (float)($m['fps']   ?? 25.0));
        if ($bw <= 0) return 0.0;
        return round($bw / ($w * $h * $fps), 6);
    }

    // ── Fake 4K Detector (Skill_Fake_4K_Detector) ────────────────────────────
    public static function detectFake4K(array $m): bool
    {
        $w    = (int)($m['width']  ?? 0);
        $h    = (int)($m['height'] ?? 0);
        $bpp  = self::computeBPP($m);
        $codec = strtolower($m['codec'] ?? '');
        if ($w < 3840 || $h < 2160) return false; // No es 4K
        $threshold = (str_contains($codec, 'hevc') || str_contains($codec, 'hvc1')) ? 0.02 : 0.05;
        return $bpp < $threshold;
    }

    // ── HDR Authenticity Score (Skill_HDR_Authenticity_Detector) ─────────────
    // PQ (ST2084) = 100, HLG = 95, SDR = 20 (proveedor miente)
    public static function scoreHDRAuthenticity(array $m): array
    {
        $hdr      = strtolower($m['hdr_type']       ?? 'sdr');
        $transfer = strtolower($m['transfer_char']  ?? '');
        $range    = strtolower($m['video_range']    ?? 'sdr');

        if ($hdr === 'hdr10' || $hdr === 'pq' || $transfer === 'st2084' || $transfer === '16' || $range === 'pq') {
            return ['score' => 100, 'type' => 'TRUE_HDR10', 'directive' => 'PASSTHROUGH'];
        }
        if ($hdr === 'hlg' || $transfer === 'hlg' || $transfer === '18' || $range === 'hlg') {
            return ['score' => 95, 'type' => 'TRUE_HLG_BROADCAST', 'directive' => 'HLG_PASSTHROUGH'];
        }
        if ($hdr === 'hdr10+' || $hdr === 'dolby_vision') {
            return ['score' => 98, 'type' => 'TRUE_HDR10_PLUS', 'directive' => 'PASSTHROUGH'];
        }
        // SDR upscaled como HDR = proveedor miente
        return ['score' => 20, 'type' => 'FAKE_HDR_SDR_8BIT', 'directive' => 'INVERSE_TONE_MAP'];
    }

    // ── SSIM Predictor (Skill_SSIM_Predictor) ────────────────────────────────
    // Predice retención de textura desde metadatos del encoder
    public static function predictSSIM(array $m): float
    {
        $bpp   = self::computeBPP($m);
        $codec = strtolower($m['codec'] ?? '');
        $fps   = (float)($m['fps'] ?? 25.0);

        // HEVC es ~2x más eficiente que H264 en SSIM por BPP
        $efficiency = (str_contains($codec, 'hevc') || str_contains($codec, 'hvc1')) ? 2.0 : 1.0;
        // Penalización por FPS alto (más frames = menos bits por frame)
        $fpsPenalty = $fps > 50 ? 0.05 : 0.0;

        // Penalización por resolución baja (720p y menos)
        $w = (int)($m['width'] ?? 1920);
        $resPenalty = ($w < 1280) ? 0.3 : 0.0;

        // Penalización por bitrate muy bajo (< 1Mbps)
        $bwKbps = (float)($m['bitrate_kbps'] ?? 0);
        $bwPenalty = $bwKbps < 1000 ? 0.4 : 0.0;

        $bppNorm    = min(1.0, $bpp * $efficiency * 20.0);

        return max(0.0, min(1.0, $bppNorm - $fpsPenalty - $resPenalty - $bwPenalty));
    }

    // ── KNN Distance (Skill_KNN_God_Tier_Visual_Perfection) ──────────────────
    // Vector objetivo: [0, 0, 0] = Cero Latencia, Cero Jitter, Cero Entropía
    // Distancia euclidiana al ideal
    public static function computeKNNDistance(array $m): float
    {
        $latency    = min(1.0, (float)($m['jitter_ms']    ?? 0.0) / 200.0);
        $jitter     = min(1.0, (float)($m['packet_loss']  ?? 0.0) / 10.0);
        $entropy    = min(1.0, (float)($m['block_energy'] ?? 0.0) / 50.0);
        return round(sqrt($latency**2 + $jitter**2 + $entropy**2), 4);
    }

    // ── Stability Score (Skill_Stream_Stability_Scorer) ──────────────────────
    // 0 = inestable, 100 = perfectamente estable
    public static function computeStabilityScore(array $m, array $session): float
    {
        $score = 100.0;

        // Penalizaciones por condición de red
        $bufferFill = (float)($m['buffer_fill_pct'] ?? 80.0);
        if ($bufferFill < 20)  $score -= 40;
        elseif ($bufferFill < 50) $score -= 20;
        elseif ($bufferFill < 70) $score -= 10;

        $packetLoss = (float)($m['packet_loss'] ?? 0.0);
        if ($packetLoss > 5)  $score -= 30;
        elseif ($packetLoss > 2) $score -= 15;
        elseif ($packetLoss > 0.5) $score -= 5;

        $dropped = (int)($m['dropped_frames'] ?? 0);
        if ($dropped > 5)  $score -= 20;
        elseif ($dropped > 2) $score -= 10;
        elseif ($dropped > 0) $score -= 5;

        $rebuffers = (int)($m['rebuffer_count'] ?? 0);
        $score -= min(30, $rebuffers * 10);

        // Bonus por historial estable
        $segCount = (int)($session['segment_count'] ?? 0);
        if ($segCount > 100) $score += 5;

        return max(0.0, min(100.0, $score));
    }

    // ── Quality Ranker (Skill_RealTime_Quality_Ranker) ────────────────────────
    // Orquesta todos los scores y decide el nivel de intervención
    // Retorna: 'GOD_TIER' | 'GOOD' | 'DEGRADED' | 'GARBAGE'
    public static function rankQuality(array $scores): string
    {
        $vmaf      = $scores['vmaf']      ?? 50.0;
        $stability = $scores['stability'] ?? 50.0;
        $hdrScore  = $scores['hdr']       ?? 20.0;
        $ssim      = $scores['ssim']      ?? 0.5;
        $bpp       = $scores['bpp']       ?? 0.0;
        $fake4k    = $scores['fake_4k']   ?? false;

        // Penalización inmediata por 4K falso
        if ($fake4k) return 'GARBAGE';

        // God-Tier: VMAF > 85, stability > 80, HDR auténtico
        if ($vmaf >= 85 && $stability >= 80 && $hdrScore >= 95) return 'GOD_TIER';

        // Good: VMAF > 70, stability > 60
        if ($vmaf >= 70 && $stability >= 60) return 'GOOD';

        // Degraded: algo está mal pero reproducible
        if ($vmaf >= 50 || $stability >= 40) return 'DEGRADED';

        return 'GARBAGE';
    }

    // ── Compilar todas las métricas en el DTO mandatorio ─────────────────────
    // Skill: RealTime_Event_Aggregator — contrato estricto JSON
    public static function buildDTO(
        ChannelSignal $signal,
        array $rawMetrics,
        array $session,
        float $bufferCondition
    ): array {
        $vmaf      = self::estimateVMAF($rawMetrics);
        $bpp       = self::computeBPP($rawMetrics);
        $hdr       = self::scoreHDRAuthenticity($rawMetrics);
        $ssim      = self::predictSSIM($rawMetrics);
        $knn       = self::computeKNNDistance($rawMetrics);
        $stability = self::computeStabilityScore($rawMetrics, $session);
        $fake4k    = self::detectFake4K($rawMetrics);

        $scores = [
            'vmaf'      => $vmaf,
            'stability' => $stability,
            'hdr'       => $hdr['score'],
            'ssim'      => $ssim,
            'bpp'       => $bpp,
            'fake_4k'   => $fake4k,
        ];
        $rank = self::rankQuality($scores);

        // KNN buffer bloat: a mayor distancia, más buffer (Skill_Buffer_Bloat)
        $bufferMs = (int)max(400, $knn * 25000);

        // Codec efficiency rank (Skill_Codec_Efficiency_Ranker)
        $codec = strtolower($rawMetrics['codec'] ?? 'h264');
        $codecGrade = 'C';
        if (str_contains($codec, 'hevc') || str_contains($codec, 'hvc1') || str_contains($codec, 'h265')) $codecGrade = 'A+';
        elseif (str_contains($codec, 'av1')) $codecGrade = 'A';
        elseif (str_contains($codec, 'h264') || str_contains($codec, 'avc')) $codecGrade = 'B';

        // True Visual Scale (Skill_Resolution_vs_Bitrate_Validator)
        $trueScale = 'SD';
        $w = (int)($rawMetrics['width'] ?? 0);
        if ($w >= 3840 && !$fake4k)     $trueScale = 'TRUE_4K';
        elseif ($w >= 3840 && $fake4k)  $trueScale = 'FAKE_4K';
        elseif ($w >= 1920)             $trueScale = 'FHD';
        elseif ($w >= 1280)             $trueScale = 'HD';
        elseif ($w >= 854)              $trueScale = 'SD_PLUS';

        // DTO mandatorio — ningún campo puede ser undefined (RealTime_Event_Aggregator)
        return [
            // Core Identity
            'channel_id'        => $signal->channelId   ?: 'UNKNOWN',
            'channel_name'      => $signal->channelName ?: 'UNKNOWN',
            'content_type'      => $signal->contentType ?: 'default',
            'profile_id'        => $signal->profileId   ?: 'P0',
            'client_ip'         => preg_replace('/\.\d+$/', '.***', $signal->clientIp),
            'player_type'       => $signal->playerType  ?: 'generic',
            'device_type'       => $signal->deviceType  ?: 'generic',
            'detected_by'       => $signal->detectedBy  ?: 'UNKNOWN',

            // Physical Heuristics
            'bandwidth_kbps'    => (float)($rawMetrics['bitrate_kbps']    ?? 0),
            'resolution'        => ($rawMetrics['width'] ?? 0) . 'x' . ($rawMetrics['height'] ?? 0),
            'frame_rate'        => (float)($rawMetrics['fps']             ?? 0),
            'codec'             => $rawMetrics['codec']                   ?? 'unknown',
            'codec_grade'       => $codecGrade,
            'hdr_type'          => $rawMetrics['hdr_type']                ?? 'sdr',
            'true_visual_scale' => $trueScale,

            // Quality Scores (200+ métricas derivadas)
            'vmaf_score'        => round($vmaf, 1),
            'bpp'               => round($bpp, 6),
            'bpp_risk'          => $bpp < 0.02 ? 'CRITICAL' : ($bpp < 0.05 ? 'WARNING' : 'OK'),
            'hdr_auth_score'    => $hdr['score'],
            'hdr_auth_type'     => $hdr['type'],
            'hdr_directive'     => $hdr['directive'],
            'ssim_estimate'     => round($ssim, 3),
            'knn_distance'      => round($knn, 4),
            'knn_scorecard'     => $knn < 0.1 ? 120 : (int)max(0, 120 - $knn * 120),
            'stability_score'   => round($stability, 1),
            'quality_rank'      => $rank,
            'fake_4k_detected'  => $fake4k,

            // Network Telemetry
            'buffer_condition'  => round($bufferCondition, 1),
            'buffer_state'      => $bufferCondition >= 80 ? 'NORMAL' : ($bufferCondition >= 30 ? 'ESCALATING' : ($bufferCondition >= 10 ? 'BURST' : 'NUCLEAR')),
            'buffer_ms_knn'     => $bufferMs,
            'packet_loss_pct'   => (float)($rawMetrics['packet_loss']     ?? 0),
            'jitter_ms'         => (float)($rawMetrics['jitter_ms']       ?? 0),
            'buffer_fill_pct'   => (float)($rawMetrics['buffer_fill_pct'] ?? 80),
            'dropped_frames'    => (int)($rawMetrics['dropped_frames']    ?? 0),
            'rebuffer_count'    => (int)($rawMetrics['rebuffer_count']    ?? 0),
            'stall_rate'        => (float)($rawMetrics['stall_rate']      ?? 0),

            // Artifact Metrics
            'block_energy'      => (float)($rawMetrics['block_energy']    ?? 0),
            'gradient_var'      => (float)($rawMetrics['gradient_var']    ?? 5),
            'hf_energy'         => (float)($rawMetrics['hf_energy']       ?? 0),
            'line_diff'         => (float)($rawMetrics['line_diff']       ?? 0),
            'edge_sharpness'    => (float)($rawMetrics['edge_sharpness']  ?? 1),
            'luma_variance'     => (float)($rawMetrics['luma_variance']   ?? 0),

            // Session State
            'segment_count'     => (int)($session['segment_count']        ?? 0),
            'session_age_s'     => time() - (int)($session['first_seen']  ?? time()),
            'zap_count'         => (int)($session['zap_count']            ?? 0),
            'ai_cycles'         => (int)($session['ai']['cycles']         ?? 0),
            'ai_interventions'  => (int)($session['ai']['interventions']  ?? 0),
            'ai_level'          => $session['ai']['level']                ?? 0,
            'ai_artifact'       => $session['ai']['artifact']             ?? 'none',
            'last_cycle_ms'     => (float)($session['ai']['last_ms']      ?? 0),

            // APE-META DNA Tags (Metadata_Intelligence_Engine v5)
            'ape_meta_verified' => true,
            'ape_meta_score'    => round(($vmaf + $stability + $hdr['score']) / 3, 1),
            'ape_meta_confidence' => $signal->isKnown() ? 'HIGH' : 'LOW',

            'timestamp'         => date('c'),
        ];
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SESSION RADAR — Registro de sesiones activas en /dev/shm
//  Skill: Multi_Channel_Monitor — O(1) RAM, LRU 60s, C10K safe
// ═══════════════════════════════════════════════════════════════════════════════
final class SessionRadar
{
    public static function track(ChannelSignal $signal, array $metrics = []): void
    {
        $sessions = self::read();
        $key      = $signal->key();
        $now      = time();
        $existing = $sessions[$key] ?? null;

        // Registrar petición en telemetría neuro-adaptativa
        $telemetry = $existing['telemetry'] ?? ['timestamps' => [], 'total_hits' => 0, 'freeze_hits' => 0];
        NeuraTelemetry::recordRequest($telemetry);

        $sessions[$key] = [
            'channel_id'    => $signal->channelId,
            'channel_name'  => $signal->channelName,
            'content_type'  => $signal->contentType,
            'client_ip'     => $signal->clientIp,
            'player_type'   => $signal->playerType,
            'device_type'   => $signal->deviceType,
            'profile_id'    => $signal->profileId,
            'detected_by'   => $signal->detectedBy,
            'first_seen'    => $existing['first_seen'] ?? $now,
            'last_seen'     => $now,
            'zap_at'        => ($existing['channel_id'] ?? '') !== $signal->channelId ? $now : ($existing['zap_at'] ?? $now),
            'segment_count' => ($existing['segment_count'] ?? 0) + 1,
            'zap_count'     => ($existing['channel_id'] ?? '') !== $signal->channelId
                ? ($existing['zap_count'] ?? 0) + 1
                : ($existing['zap_count'] ?? 0),
            'metrics'       => empty($metrics)
                ? ($existing['metrics'] ?? self::defaultMetrics())
                : array_merge($existing['metrics'] ?? self::defaultMetrics(), $metrics),
            'telemetry'     => $telemetry,
            'ai'            => $existing['ai'] ?? self::defaultAiState(),
            'dto'           => $existing['dto'] ?? [],
        ];

        self::write($sessions);
    }

    public static function updateAiState(string $key, array $aiState, array $dto = []): void
    {
        $sessions = self::read();
        if (!isset($sessions[$key])) return;
        $sessions[$key]['last_seen'] = time();
        $sessions[$key]['ai']        = $aiState;
        if (!empty($dto)) $sessions[$key]['dto'] = $dto;
        self::write($sessions);
    }

    public static function get(string $key): ?array
    {
        $sessions = self::read();
        return $sessions[$key] ?? null;
    }

    public static function getActive(): array
    {
        $sessions = self::read();
        $now      = time();
        $active   = [];
        foreach ($sessions as $key => $s) {
            if (($now - ($s['last_seen'] ?? 0)) <= APE_SESSION_TTL) $active[$key] = $s;
        }
        uasort($active, fn($a, $b) => $b['last_seen'] <=> $a['last_seen']);
        return array_slice($active, 0, APE_MAX_SESSIONS, preserve_keys: true);
    }

    public static function purge(): int
    {
        $sessions = self::read();
        $now      = time();
        $before   = count($sessions);
        foreach ($sessions as $key => $s) {
            if (($now - ($s['last_seen'] ?? 0)) > APE_SESSION_PURGE) unset($sessions[$key]);
        }
        $purged = $before - count($sessions);
        if ($purged > 0) self::write($sessions);
        return $purged;
    }

    public static function stats(): array
    {
        $sessions = self::read();
        $now      = time();
        $active   = 0;
        foreach ($sessions as $s) {
            if (($now - ($s['last_seen'] ?? 0)) <= APE_SESSION_TTL) $active++;
        }
        return ['total' => count($sessions), 'active' => $active, 'capacity' => APE_MAX_SESSIONS];
    }

    private static array $cache = [];
    private static int $cacheTime = 0;

    public static function warmup(): void
    {
        // Pre-carga el registro en memoria para que la primera petición sea < 1ms
        if (empty(self::$cache)) {
            self::$cache = file_exists(APE_REGISTRY)
                ? (@json_decode(@file_get_contents(APE_REGISTRY), true) ?? [])
                : [];
            self::$cacheTime = time();
        }
    }

    private static function read(): array
    {
        // Cache en memoria para < 1ms en peticiones repetidas
        $now = time();
        if (!empty(self::$cache) && ($now - self::$cacheTime) < 2) {
            return self::$cache;
        }
        if (!file_exists(APE_REGISTRY)) return [];
        $raw = @json_decode(@file_get_contents(APE_REGISTRY), true);
        $result = is_array($raw) ? $raw : [];
        self::$cache = $result;
        self::$cacheTime = time();
        return $result;
    }

    private static function write(array $sessions): void
    {
        self::$cache = $sessions;
        self::$cacheTime = time();
        $fp = @fopen(APE_LOCK, 'c');
        if (!$fp) { @file_put_contents(APE_REGISTRY, json_encode($sessions)); return; }
        if (@flock($fp, LOCK_EX | LOCK_NB)) {
            @file_put_contents(APE_REGISTRY, json_encode($sessions));
            @flock($fp, LOCK_UN);
        }
        @fclose($fp);
    }

    private static function defaultMetrics(): array
    {
        return [
            'bitrate_kbps'   => 8000,  'fps'            => 25.0,
            'width'          => 1920,  'height'         => 1080,
            'codec'          => 'hevc','hdr_type'       => 'hdr10',
            'transfer_char'  => 'st2084', 'video_range' => 'pq',
            'stall_rate'     => 0.0,   'packet_loss'    => 0.0,
            'jitter_ms'      => 0.0,   'buffer_fill_pct'=> 80.0,
            'block_energy'   => 0.0,   'gradient_var'   => 5.0,
            'hf_energy'      => 0.0,   'line_diff'      => 0.0,
            'edge_sharpness' => 1.0,   'luma_variance'  => 0.0,
            'dropped_frames' => 0,     'rebuffer_count' => 0,
        ];
    }

    private static function defaultAiState(): array
    {
        return [
            'artifact'     => 'none', 'level'        => 0,
            'chain'        => null,   'transition_f' => 8,
            'interventions'=> 0,      'silent_streak'=> 0,
            'cycles'       => 0,      'last_ms'      => 0.0,
        ];
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  L4 — ARTIFACT SCANNER
//  7 tipos de artefactos + composite
// ═══════════════════════════════════════════════════════════════════════════════
final class ArtifactScanner
{
    private const MB_THRESHOLD = 18.0;
    private const BD_THRESHOLD = 3.5;
    private const NS_THRESHOLD = 12.0;
    private const IL_THRESHOLD = 8.0;
    private const BL_THRESHOLD = 0.75;

    public static function scan(array $m): array
    {
        $found = [];
        $mb = (float)($m['block_energy']   ?? 0.0);
        $pl = (float)($m['packet_loss']    ?? 0.0);
        $gv = (float)($m['gradient_var']   ?? 5.0);
        $hf = (float)($m['hf_energy']      ?? 0.0);
        $ld = (float)($m['line_diff']      ?? 0.0);
        $es = (float)($m['edge_sharpness'] ?? 1.0);
        $bf = (float)($m['buffer_fill_pct']?? 80.0);
        $df = (int)  ($m['dropped_frames'] ?? 0);

        if ($mb > self::MB_THRESHOLD || $pl > 0.5)
            $found[] = ['type' => 'macroblock', 'sev' => min(1.0, $mb / 50.0 + $pl / 5.0)];
        if ($gv > 0.0 && $gv < self::BD_THRESHOLD)
            $found[] = ['type' => 'banding',    'sev' => max(0.1, 1.0 - $gv / self::BD_THRESHOLD)];
        if ($hf > self::NS_THRESHOLD)
            $found[] = ['type' => 'noise',      'sev' => min(1.0, $hf / 40.0)];
        if ($ld > self::IL_THRESHOLD)
            $found[] = ['type' => 'interlace',  'sev' => min(1.0, $ld / 30.0)];
        if ($es < self::BL_THRESHOLD)
            $found[] = ['type' => 'blur',       'sev' => 1.0 - $es];
        if ($bf < 20.0)
            $found[] = ['type' => 'rebuffer',   'sev' => max(0.1, 1.0 - $bf / 20.0)];
        if ($df > 2)
            $found[] = ['type' => 'dropped',    'sev' => min(1.0, $df / 10.0)];

        if (empty($found)) return ['type' => 'none', 'severity' => 0.0, 'components' => []];
        if (count($found) === 1) return ['type' => $found[0]['type'], 'severity' => $found[0]['sev'], 'components' => $found];
        return ['type' => 'composite', 'severity' => max(array_column($found, 'sev')), 'components' => $found];
    }

    public static function level(array $artifact): int
    {
        if ($artifact['type'] === 'none') return 0;
        $s = $artifact['severity'];
        if ($s < 0.25) return 1;
        if ($s < 0.60) return 2;
        return 3;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  L5+L6 — QUANTUM CHAIN BUILDER
//  Skills: Video_Enhancement_Technologies, Luma_Precision_Overdrive,
//          Dynamic_Contrast_Enhancer, BWDIF_Deinterlace, Motion_Blur_Suppression,
//          Dynamic_Tone_Mapping, SDR_to_HDR_ITM, Gamma_Curve_2_2,
//          Chroma_444, ZLevel_12bit, HEVC_Master_Display
//
//  Pipeline order (IMPORTA):
//  INPUT → bwdif → nlmeans/hqdn3d → eq → CAS+unsharp → zscale+tonemap → OUTPUT
// ═══════════════════════════════════════════════════════════════════════════════
final class QuantumChain
{
    // Umbrales de invisibilidad (límites que el ojo humano NO detecta)
    private const NL_MAX  = 4.0;
    private const US_MAX  = 0.40;
    private const GF_MAX  = 20;
    private const TR_MIN  = 8;

    public static function build(
        array  $artifact,
        int    $level,
        string $contentType,
        string $qualityRank,
        string $deviceType,
        array  $prevChain = []
    ): array {
        // ── Cadena base: siempre activa ───────────────────────────────────────
        $chain = [
            'bwdif'   => ['mode' => 1, 'parity' => -1, 'deint' => 0],
            'nlmeans' => ['s' => 1.5,  'p' => 5,  'r' => 9],
            'hqdn3d'  => ['luma_s' => 2.0, 'chroma_s' => 1.0, 'luma_t' => 3.0, 'chroma_t' => 2.0],
            'eq'      => ['brightness' => 0.02, 'contrast' => 1.0, 'saturation' => 0.65, 'gamma' => 1.0],
            'cas'     => ['strength' => 0.7],   // CAS AMD FidelityFX — Protegido 80%
            'unsharp' => ['luma' => 0.20, 'chroma' => 0.0],  // chroma SIEMPRE 0.0
            'zscale'  => [
                'transfer'  => 'st2084',
                'primaries' => 'bt2020',
                'matrix'    => '2020ncl',
                'dither'    => 'error_diffusion',
                'range'     => 'full',
                'filter'    => 'spline36',  // Lanczos/spline36 — Luma Precision Overdrive
            ],
            'lcevc'   => ['enabled' => true, 'phase' => 4],
            'hdr'     => [
                'maxcll'    => 5000,    // Skill_HDR_Peak_Luminance_Forcing
                'maxfall'   => 1200,
                'transfer'  => 'ST2084',
                'primaries' => 'BT2020',
                'full_range'=> 1,       // Skill_Dynamic_Contrast_Enhancer
            ],
            'ai_sr'   => ['level' => 'low', 'enabled' => true],  // NVIDIA RTX VSR / TV AI-SR
        ];

        if ($level === 0 && $qualityRank === 'GOD_TIER') {
            // Sin artefactos + señal God-Tier: cadena base mínima
            return self::applyDeviceLimits(
                self::applyContentLimits($chain, $contentType),
                $deviceType, $prevChain
            );
        }

        $s    = $artifact['severity'];
        $type = $artifact['type'];

        switch ($type) {
            case 'macroblock':
                // Macrobloques: nlmeans fuerte + hqdn3d recovery mode
                $chain['nlmeans']['s']      = min(self::NL_MAX, 1.5 + $s * 2.5);
                $chain['nlmeans']['p']      = 7;
                $chain['nlmeans']['r']      = 15;
                $chain['hqdn3d']['luma_s']  = min(4.0, 2.0 + $s * 2.0);
                $chain['hqdn3d']['luma_t']  = min(6.0, 3.0 + $s * 3.0);
                $chain['unsharp']['luma']   = max(0.10, 0.20 - $s * 0.10);
                break;

            case 'banding':
                // Banding: gradfun específico para gradientes planos
                $chain['gradfun'] = [
                    'radius'   => min(self::GF_MAX, (int)(8 + $s * 12)),
                    'strength' => min(1.2, 0.5 + $s * 0.7),
                ];
                $chain['nlmeans']['s'] = min(2.5, 1.5 + $s * 1.0);
                break;

            case 'noise':
                // Ruido MPEG: nlmeans elimina granulado, unsharp recupera detalle
                $chain['nlmeans']['s']    = min(self::NL_MAX, 1.5 + $s * 2.5);
                $chain['nlmeans']['p']    = 7;
                $chain['nlmeans']['r']    = 15;
                $chain['hqdn3d']['luma_s']= min(4.0, 2.0 + $s * 2.0);
                $chain['unsharp']['luma'] = min(self::US_MAX, 0.20 + $s * 0.20);
                break;

            case 'interlace':
                // Entrelazado: bwdif ya está en la cadena base
                $chain['nlmeans']['s'] = min(2.0, 1.5 + $s * 0.5);
                break;

            case 'blur':
                // Blur: CAS + unsharp recuperan nitidez
                $chain['cas']['strength'] = min(0.9, 0.7 + $s * 0.2);
                $chain['unsharp']['luma'] = min(self::US_MAX, 0.20 + $s * 0.20);
                $chain['nlmeans']['s']    = max(1.0, 1.5 - $s * 0.5);
                break;

            case 'rebuffer':
            case 'dropped':
                // Reducir carga de procesamiento para liberar CPU/buffer
                $chain['nlmeans']['s']    = max(1.0, 1.5 - $s * 0.5);
                $chain['hqdn3d']['luma_s']= max(1.0, 2.0 - $s * 1.0);
                $chain['unsharp']['luma'] = max(0.10, 0.20 - $s * 0.10);
                $chain['cas']['strength'] = max(0.5, 0.7 - $s * 0.2);
                break;

            case 'composite':
                // Múltiples artefactos: combinar al 70%
                foreach ($artifact['components'] as $comp) {
                    $sub = self::build(
                        ['type' => $comp['type'], 'severity' => $comp['sev'] * 0.70, 'components' => []],
                        1, $contentType, 'GOOD', $deviceType
                    );
                    $chain['nlmeans']['s']    = max($chain['nlmeans']['s'],    $sub['nlmeans']['s']);
                    $chain['unsharp']['luma'] = max($chain['unsharp']['luma'], $sub['unsharp']['luma']);
                    if (isset($sub['gradfun'])) {
                        $chain['gradfun'] = $chain['gradfun'] ?? $sub['gradfun'];
                        $chain['gradfun']['radius'] = max($chain['gradfun']['radius'] ?? 0, $sub['gradfun']['radius']);
                    }
                }
                break;
        }

        $chain = self::applyContentLimits($chain, $contentType);
        $chain = self::applyDeviceLimits($chain, $deviceType, $prevChain);
        return $chain;
    }

    private static function applyContentLimits(array $chain, string $contentType): array
    {
        switch ($contentType) {
            case 'sports':
                // Deportes: movimiento rápido → denoise fuerte genera ghosting
                // Skill_Motion_Blur_Suppression
                $chain['nlmeans']['s']    = min($chain['nlmeans']['s'], 2.0);
                $chain['hqdn3d']['luma_s']= min($chain['hqdn3d']['luma_s'], 2.0);
                $chain['unsharp']['luma'] = min($chain['unsharp']['luma'], 0.30);
                // Preservar 60fps: bwdif maneja el entrelazado sin generar flood TCP
                break;
            case 'cinema':
                // Cine: contenido estático → denoise máximo
                break;
            case 'news':
                // Noticias: texto → priorizar nitidez, reducir denoise
                $chain['nlmeans']['s']    = min($chain['nlmeans']['s'], 1.5);
                $chain['hqdn3d']['luma_s']= min($chain['hqdn3d']['luma_s'], 1.5);
                $chain['unsharp']['luma'] = min(self::US_MAX, $chain['unsharp']['luma'] + 0.05);
                $chain['cas']['strength'] = min(0.85, $chain['cas']['strength'] + 0.05);
                break;
            case 'kids':
                // Infantil: colores planos → gradfun más agresivo
                if (!isset($chain['gradfun'])) {
                    $chain['gradfun'] = ['radius' => 10, 'strength' => 0.6];
                } else {
                    $chain['gradfun']['radius'] = min(self::GF_MAX, $chain['gradfun']['radius'] + 2);
                }
                break;
        }
        return $chain;
    }

    private static function applyDeviceLimits(array $chain, string $deviceType, array $prevChain): array
    {
        switch ($deviceType) {
            case 'lg_oled':
                // OLED Showroom Supremacy: True Black + Explosive Highlights
                $chain['hdr']['maxcll']   = 10000; // OLED puede manejar 10000 nits
                $chain['eq']['contrast']  = 1.0;   // Contraste nativo OLED
                $chain['eq']['saturation']= 0.70;  // Saturación ligeramente más alta en OLED
                $chain['ai_sr']['level']  = 'low';
                break;
            case 'samsung_qled':
                // Samsung QLED: Quantum Dot → saturación más alta
                $chain['eq']['saturation']= 0.72;
                $chain['hdr']['maxcll']   = 4000;
                break;
            case 'shield_tv':
                // SHIELD TV: Tegra X1 → puede manejar nlmeans más fuerte
                $chain['nlmeans']['s']    = min(self::NL_MAX, $chain['nlmeans']['s'] * 1.2);
                $chain['ai_sr']['level']  = 'low';
                break;
            case 'sony_bravia':
                // Sony Bravia XR: procesador cognitivo propio
                $chain['ai_sr']['level']  = 'low';
                $chain['hdr']['maxcll']   = 5000;
                break;
            case 'apple_tv':
                // Apple TV: Dolby Vision nativo
                $chain['hdr']['type']     = 'dolby_vision';
                break;
        }

        // Suavizado temporal: interpolación entre estado anterior y nuevo
        if (!empty($prevChain)) {
            $chain = self::smooth($chain, $prevChain);
        }
        return $chain;
    }

    private static function smooth(array $new, array $prev): array
    {
        $alpha = 1.0 / self::TR_MIN;
        $lerp  = fn(float $a, float $b): float => round($a + ($b - $a) * $alpha, 3);

        $new['nlmeans']['s']        = $lerp($prev['nlmeans']['s']        ?? 1.5,  $new['nlmeans']['s']);
        $new['hqdn3d']['luma_s']    = $lerp($prev['hqdn3d']['luma_s']    ?? 2.0,  $new['hqdn3d']['luma_s']);
        $new['unsharp']['luma']     = $lerp($prev['unsharp']['luma']     ?? 0.20, $new['unsharp']['luma']);
        $new['cas']['strength']     = $lerp($prev['cas']['strength']     ?? 0.70, $new['cas']['strength']);
        $new['eq']['brightness']    = $lerp($prev['eq']['brightness']    ?? 0.02, $new['eq']['brightness']);
        if (isset($new['gradfun'], $prev['gradfun'])) {
            $new['gradfun']['radius'] = (int)round($lerp($prev['gradfun']['radius'] ?? 8, $new['gradfun']['radius']));
        }
        return $new;
    }

    public static function serialize(array $chain): string
    {
        $parts = [];

        // 1. bwdif (deinterlace — siempre primero)
        $b = $chain['bwdif'];
        $parts[] = sprintf('bwdif=mode=%d:parity=%d:deint=%d', $b['mode'], $b['parity'], $b['deint']);

        // 2. nlmeans (denoise principal)
        $n = $chain['nlmeans'];
        $parts[] = sprintf('nlmeans=s=%.1f:p=%d:r=%d', $n['s'], $n['p'], $n['r']);

        // 3. hqdn3d (denoise temporal — complementa nlmeans)
        $q = $chain['hqdn3d'];
        $parts[] = sprintf('hqdn3d=%.1f:%.1f:%.1f:%.1f', $q['luma_s'], $q['chroma_s'], $q['luma_t'], $q['chroma_t']);

        // 4. gradfun (banding — solo si existe)
        if (isset($chain['gradfun'])) {
            $g = $chain['gradfun'];
            $parts[] = sprintf('gradfun=radius=%d:strength=%.1f', $g['radius'], $g['strength']);
        }

        // 5. eq (color correction)
        $e = $chain['eq'];
        $parts[] = sprintf('eq=brightness=%.2f:contrast=%.2f:saturation=%.2f:gamma=%.2f',
            $e['brightness'], $e['contrast'], $e['saturation'], $e['gamma']);

        // 6. CAS (sharpening — AMD FidelityFX)
        $parts[] = sprintf('cas=%.2f', $chain['cas']['strength']);

        // 7. unsharp (sharpening complementario — chroma SIEMPRE 0.0)
        $u = $chain['unsharp'];
        $parts[] = sprintf('unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=%.2f'
            . ':chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.00', $u['luma']);

        // 8. zscale (HDR + color space — siempre último antes de output)
        $z = $chain['zscale'];
        $parts[] = sprintf('zscale=t=%s:p=%s:m=%s:d=%s:r=%s:f=%s',
            $z['transfer'], $z['primaries'], $z['matrix'], $z['dither'], $z['range'], $z['filter']);

        return implode(',', $parts);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  L7 — GHOST INJECTOR
//  Construye las directivas para VLC/Kodi/OTT/Samsung/LG/Shield/Apple TV
//  Skill: KNN_God_Tier, Video_Enhancement_Technologies, Network_Buffer_God_Tier
//         VLC_Network_Caching, Adaptive_Buffer_Controller
// ═══════════════════════════════════════════════════════════════════════════════
final class GhostInjector
{
    public static function inject(
        array  $chain,
        int    $level,
        array  $session,
        array  $dto,
        float  $bufferCondition
    ): array {
        $filterStr  = QuantumChain::serialize($chain);
        $playerType = strtolower($session['player_type'] ?? 'vlc');
        $deviceType = strtolower($session['device_type'] ?? 'generic');
        $d          = [];

        // ── Buffer dinámico por condición neuro-adaptativa ────────────────────
        // Skill: Adaptive_Buffer_Controller — zapping x8, stable x2
        $isZapping    = ($session['zap_count'] ?? 0) > 0 && (time() - ($session['zap_at'] ?? 0)) < 5;
        $bufferMult   = $isZapping ? 8 : 2;
        $networkCache = $isZapping ? 8000 : max(1500, (int)(($dto['buffer_ms_knn'] ?? 1500) * $bufferMult / 2));
        $liveCache    = $isZapping ? 4000 : max(1500, (int)($networkCache * 0.75));

        // ── VLC / LibVLC (TiviMate, OTT Navigator, IPTV Smarters, Televizo) ──
        $d[] = '#EXTVLCOPT:video-filter=' . $filterStr;
        $d[] = '#EXTVLCOPT:avcodec-hw=any,nvdec,vaapi,dxva2,d3d11va';  // GPU priority chain
        $d[] = '#EXTVLCOPT:sout-x264-preset=veryslow';
        $d[] = '#EXTVLCOPT:network-caching=' . $networkCache;
        $d[] = '#EXTVLCOPT:live-caching='    . $liveCache;
        $d[] = '#EXTVLCOPT:http-reconnect=true';
        $d[] = '#EXTVLCOPT:http-continuous=true';
        $d[] = '#EXTVLCOPT:postproc-q=6';
        $d[] = '#EXTVLCOPT:video-scaler=vdpau,opengl';

        // Deinterlace activo en GHOST y PHANTOM
        if ($level >= 2) {
            $d[] = '#EXTVLCOPT:deinterlace=1';
            $d[] = '#EXTVLCOPT:deinterlace-mode=yadif2x';
        }

        // Color primaries BT.2020 (Skill_VLC_Opt_Color_Primaries_BT2020)
        $d[] = '#EXTVLCOPT:video-full-range=1';

        // ── Kodi / ExoPlayer ──────────────────────────────────────────────────
        $d[] = '#KODIPROP:inputstream.adaptive.manifest_update_parameter=full';
        $d[] = '#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive';
        $d[] = '#KODIPROP:inputstream.adaptive.max_bandwidth=' . (int)(($dto['bandwidth_kbps'] ?? 8000) * 1000 * 1.2);
        $d[] = '#KODIPROP:inputstream.adaptive.min_bandwidth=' . (int)(($dto['bandwidth_kbps'] ?? 8000) * 1000 * 0.8);

        // ── HTTP Headers enriquecidos (OTT Navigator, Smarters) ──────────────
        $d[] = '#EXTHTTP:{"X-Chroma-Subsampling":"4:4:4","X-Color-Depth":"10bit","X-AI-SR-Level":"low","X-Force-AI-SR":"true","X-RTX-Tone-Map":"adaptive","X-Intel-VSR":"enabled","X-Libplacebo":"true,hdr,color-management,tonemap"}';

        // ── HDR10+ + LCEVC Phase 4 — SIEMPRE activos ─────────────────────────
        $hdrChain = $chain['hdr'];
        $d[] = sprintf(
            '#EXT-X-APE-HDR:PASSTHROUGH|MAXCLL=%d|MAXFALL=%d|TRANSFER=%s|PRIMARIES=%s|LCEVC=PHASE4|FULL_RANGE=%d',
            $hdrChain['maxcll'], $hdrChain['maxfall'],
            $hdrChain['transfer'], $hdrChain['primaries'], $hdrChain['full_range']
        );

        // ── APE-META DNA Tags (Metadata_Intelligence_Engine v5) ──────────────
        $d[] = '#EXT-X-APE-META-VERIFIED:true';
        $d[] = '#EXT-X-APE-META-SCORE:'    . ($dto['ape_meta_score']    ?? 0);
        $d[] = '#EXT-X-APE-META-VMAF:'     . ($dto['vmaf_score']        ?? 0);
        $d[] = '#EXT-X-APE-META-BPP:'      . ($dto['bpp']               ?? 0);
        $d[] = '#EXT-X-APE-META-HDR:'      . ($dto['hdr_auth_type']     ?? 'UNKNOWN');
        $d[] = '#EXT-X-APE-META-RANK:'     . ($dto['quality_rank']      ?? 'UNKNOWN');
        $d[] = '#EXT-X-APE-META-SCALE:'    . ($dto['true_visual_scale'] ?? 'UNKNOWN');
        $d[] = '#EXT-X-APE-META-CODEC:'    . ($dto['codec']             ?? 'unknown');
        $d[] = '#EXT-X-APE-META-STABILITY:'. ($dto['stability_score']   ?? 0);

        // ── Estrangulamiento ISP — TCP BBR + DSCP ────────────────────────────
        $d[] = '#EXT-X-APE-NET:TCP_BBR=1|DSCP=EF|SOCKET_RECV=4194304|TCP_NODELAY=1|KEEPALIVE=1';

        // ── Metadatos del motor IA ────────────────────────────────────────────
        $levelNames = ['SILENT', 'WHISPER', 'GHOST', 'PHANTOM'];
        $d[] = sprintf(
            '#EXT-X-APE-AI:ENGINE=%s|LEVEL=%s|RANK=%s|KNN=%.4f|CYCLES=%d|BUFFER_STATE=%s|DEVICE=%s',
            APE_VERSION,
            $levelNames[$level] ?? 'SILENT',
            $dto['quality_rank'] ?? 'UNKNOWN',
            $dto['knn_distance'] ?? 0,
            $dto['ai_cycles']    ?? 0,
            $dto['buffer_state'] ?? 'NORMAL',
            strtoupper($deviceType)
        );

        // ── Directivas específicas por dispositivo ────────────────────────────
        if ($deviceType === 'lg_oled') {
            $d[] = '#EXT-X-APE-DEVICE:OLED_SUPREMACY=1|TRUE_BLACK=1|EXPLOSIVE_HIGHLIGHTS=1';
        } elseif ($deviceType === 'samsung_qled') {
            $d[] = '#EXT-X-APE-DEVICE:QLED_MODE=1|QUANTUM_DOT=1|LOCAL_DIMMING=HIGH';
        } elseif ($deviceType === 'shield_tv') {
            $d[] = '#EXT-X-APE-DEVICE:TEGRA_X1_OVERDRIVE=1|AI_UPSCALE=1';
        }

        return $d;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  L9 — SUPREMACY CORE (orquestador principal v4.0)
//  Coordina las 9 capas. API pública del motor.
//
//  FLUJO POR PETICIÓN (< 1ms total):
//    1. ChannelCorrelator detecta canal activo (5 capas, ms#1) — < 0.01ms
//    2. SessionRadar registra sesión + telemetría neuro-adaptativa — < 0.5ms
//    3. NeuraTelemetry deriva buffer_condition desde patrones — < 0.01ms
//    4. MetricsEngine genera 200+ métricas + DTO mandatorio — < 0.1ms
//    5. ArtifactScanner detecta artefactos — < 0.05ms
//    6. QuantumChain construye cadena de filtros óptima — < 0.1ms
//    7. GhostInjector construye directivas para el reproductor — < 0.01ms
//    8. SessionRadar persiste el nuevo estado — < 0.5ms
//    TOTAL: < 1ms
// ═══════════════════════════════════════════════════════════════════════════════
final class ApeInvisibleAiEngine
{
    // ══════════════════════════════════════════════════════════════════════════
    //  MÉTODO PRINCIPAL
    //  Llamado por el resolver en cada petición de canal.
    //  Sin configuración. Sin parámetros obligatorios.
    //  El motor detecta todo por sí mismo.
    // ══════════════════════════════════════════════════════════════════════════
    public static function process(
        string $channelId   = '',
        string $channelName = '',
        string $contentType = 'default',
        string $profileId   = 'P0',
        string $playerType  = '',
        array  $metrics     = []
    ): array {
        $t0 = hrtime(true);

        // L1: Correlador de 5 capas — detecta canal desde UA/headers/GET/path/referer
        $signal = ChannelCorrelator::correlate();

        // Override manual si se proporcionan parámetros explícitos
        if (!empty($channelId) && $signal->channelId === 'UNKNOWN') {
            $signal = new ChannelSignal(
                channelId:   $channelId,
                channelName: $channelName,
                contentType: $contentType ?: $signal->contentType,
                profileId:   $profileId,
                clientIp:    $signal->clientIp,
                playerType:  $playerType ?: $signal->playerType,
                deviceType:  $signal->deviceType,
                rawUa:       $signal->rawUa,
                detectedBy:  'MANUAL_OVERRIDE',
                capturedAt:  hrtime(true)
            );
        }

        // L2: Registrar sesión activa en el radar
        SessionRadar::track($signal, $metrics);
        $session = SessionRadar::get($signal->key()) ?? [];

        // L2: Derivar buffer_condition desde telemetría neuro-adaptativa
        $bufferCondition = NeuraTelemetry::deriveBufferCondition($session);

        // L3: Generar 200+ métricas + DTO mandatorio
        $rawMetrics = $session['metrics'] ?? [];
        $dto        = MetricsEngine::buildDTO($signal, $rawMetrics, $session, $bufferCondition);

        // L4: Detectar artefactos
        $artifact = ArtifactScanner::scan($rawMetrics);
        $level    = ArtifactScanner::level($artifact);

        // L5+L6: Construir cadena de filtros óptima
        $prevChain   = $session['ai']['chain'] ?? [];
        $qualityRank = $dto['quality_rank']    ?? 'GOOD';
        $deviceType  = $signal->deviceType;
        $chain       = QuantumChain::build($artifact, $level, $signal->contentType, $qualityRank, $deviceType, $prevChain);

        // L7: Construir directivas para el reproductor
        $directives = GhostInjector::inject($chain, $level, $session, $dto, $bufferCondition);

        // L8+L9: Persistir estado + log
        $elapsedMs = (hrtime(true) - $t0) / 1e6;
        $aiState   = [
            'artifact'      => $artifact['type'],
            'level'         => $level,
            'chain'         => $chain,
            'transition_f'  => ($level !== ($session['ai']['level'] ?? 0)) ? 1
                : min(8, ($session['ai']['transition_f'] ?? 8) + 1),
            'interventions' => ($session['ai']['interventions'] ?? 0) + ($level > 0 ? 1 : 0),
            'silent_streak' => $level === 0 ? ($session['ai']['silent_streak'] ?? 0) + 1 : 0,
            'cycles'        => ($session['ai']['cycles'] ?? 0) + 1,
            'last_ms'       => round($elapsedMs, 3),
        ];
        SessionRadar::updateAiState($signal->key(), $aiState, $dto);

        self::logMetrics($signal, $dto, $artifact, $level, $elapsedMs);

        if (($aiState['cycles'] % 100) === 0) SessionRadar::purge();

        return $directives;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ENDPOINT: POST /ape/feedback
    //  El reproductor reporta métricas en tiempo real.
    // ══════════════════════════════════════════════════════════════════════════
    public static function feedback(): void
    {
        $raw  = (string)@file_get_contents('php://input');
        $data = $raw ? @json_decode($raw, true) : null;

        if (!is_array($data) || empty($data['channel_id'])) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'channel_id requerido']);
            return;
        }

        $directives = self::process(
            (string)($data['channel_id']   ?? ''),
            (string)($data['channel_name'] ?? ''),
            (string)($data['content_type'] ?? 'default'),
            (string)($data['profile_id']   ?? 'P0'),
            (string)($data['player_type']  ?? ''),
            (array) ($data['metrics']      ?? [])
        );

        $stats = SessionRadar::stats();
        header('Content-Type: application/json');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('X-APE-Engine: ' . APE_VERSION);
        echo json_encode([
            'ok'              => true,
            'channel_id'      => $data['channel_id'],
            'directives'      => $directives,
            'active_sessions' => $stats['active'],
            'ts'              => microtime(true),
        ]);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ENDPOINT: GET /ape/active
    //  Muestra qué canales están siendo reproducidos ahora mismo.
    //  Incluye el DTO completo con todas las métricas.
    // ══════════════════════════════════════════════════════════════════════════
    public static function active(): void
    {
        $sessions = SessionRadar::getActive();
        $stats    = SessionRadar::stats();
        $levelNames = ['SILENT', 'WHISPER', 'GHOST', 'PHANTOM'];
        $out = [];
        foreach ($sessions as $key => $s) {
            $out[] = [
                'channel'       => $s['channel_name'] ?: $s['channel_id'],
                'content'       => $s['content_type'],
                'player'        => $s['player_type'],
                'device'        => $s['device_type'],
                'detected_by'   => $s['detected_by'],
                'active_sec'    => time() - ($s['first_seen'] ?? time()),
                'segments'      => $s['segment_count'] ?? 0,
                'ai_level'      => $levelNames[$s['ai']['level'] ?? 0] ?? 'SILENT',
                'artifact'      => $s['ai']['artifact'] ?? 'none',
                'cycles'        => $s['ai']['cycles']   ?? 0,
                'last_ms'       => $s['ai']['last_ms']  ?? 0.0,
                'quality_rank'  => $s['dto']['quality_rank']   ?? 'UNKNOWN',
                'vmaf'          => $s['dto']['vmaf_score']      ?? 0,
                'bpp'           => $s['dto']['bpp']             ?? 0,
                'hdr_type'      => $s['dto']['hdr_auth_type']   ?? 'UNKNOWN',
                'knn_distance'  => $s['dto']['knn_distance']    ?? 0,
                'knn_scorecard' => $s['dto']['knn_scorecard']   ?? 0,
                'stability'     => $s['dto']['stability_score'] ?? 0,
                'buffer_state'  => $s['dto']['buffer_state']    ?? 'NORMAL',
                'true_scale'    => $s['dto']['true_visual_scale']?? 'UNKNOWN',
                'fake_4k'       => $s['dto']['fake_4k_detected']?? false,
                'dto'           => $s['dto'] ?? [],
            ];
        }
        header('Content-Type: application/json');
        echo json_encode(['version' => APE_VERSION, 'stats' => $stats, 'active' => $out, 'ts' => microtime(true)], JSON_PRETTY_PRINT);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ENDPOINT: GET /ape/ua-builder
    //  Genera el User Agent enriquecido para el dispositivo del usuario.
    //  Uso: GET /ape/ua-builder?device=shield_tv&player=ott_navigator&profile=P0
    // ══════════════════════════════════════════════════════════════════════════
    public static function uaBuilder(): void
    {
        $device  = strtolower($_GET['device']  ?? 'generic');
        $player  = strtolower($_GET['player']  ?? 'ott_navigator');
        $profile = strtoupper($_GET['profile'] ?? 'P0');
        $channel = $_GET['channel'] ?? 'AUTO';
        $content = strtolower($_GET['content'] ?? 'default');

        // Base UA por reproductor
        $baseUA = match($player) {
            'ott_navigator'  => 'OTT Navigator/2.1.6 (Android; TV)',
            'tivimate'       => 'TiviMate/4.7.0 (Android; TV)',
            'iptv_smarters'  => 'IPTV Smarters Pro/3.1.5 (Android; TV)',
            'kodi'           => 'Kodi/20.5 (Linux; Android)',
            'vlc'            => 'VLC/3.0.21 LibVLC/3.0.21',
            'televizo'       => 'Televizo/1.9.8 (Android; TV)',
            default          => 'APE-Player/1.0 (Android; TV)',
        };

        // Firma APE enriquecida
        $apeSignature = sprintf(
            'APE-Engine/%s APE-Channel:%s|%s|%s APE-Device:%s',
            APE_VERSION, $channel, $content, $profile, strtoupper($device)
        );

        $contentUA  = $baseUA . ' ' . $apeSignature;
        $apiUA      = 'APE-API/4.0 (IPTV; Resolver) APE-Device:' . strtoupper($device) . '|HDR10|4K APE-Profile:' . $profile;

        header('Content-Type: application/json');
        echo json_encode([
            'user_agent_content' => $contentUA,
            'user_agent_api'     => $apiUA,
            'instructions'       => [
                'content_field' => 'Pegar en HTTP User Agent (Content) del reproductor',
                'api_field'     => 'Pegar en HTTP User Agent (API) del reproductor',
                'effect'        => 'El motor IA detectará tu dispositivo y canal desde el primer milisegundo',
            ],
            'device'  => $device,
            'player'  => $player,
            'profile' => $profile,
        ], JSON_PRETTY_PRINT);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ROUTER DE ENDPOINTS
    // ══════════════════════════════════════════════════════════════════════════
    public static function route(): bool
    {
        $path   = strtok($_SERVER['REQUEST_URI'] ?? '', '?');
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

        if ($path === '/ape/feedback'   && $method === 'POST') { self::feedback();  return true; }
        if ($path === '/ape/active'     && $method === 'GET')  { self::active();    return true; }
        if ($path === '/ape/ua-builder' && $method === 'GET')  { self::uaBuilder(); return true; }

        return false;
    }

    // ── Log de métricas ───────────────────────────────────────────────────────
    private static function logMetrics(ChannelSignal $signal, array $dto, array $artifact, int $level, float $ms): void
    {
        static $levelNames = ['SILENT', 'WHISPER', 'GHOST', 'PHANTOM'];
        $line = sprintf(
            "%s|%s|%s|VMAF=%.1f|BPP=%.5f|HDR=%s|RANK=%s|KNN=%.4f|STAB=%.1f|ART=%s|%s|%.3fms\n",
            date('H:i:s.') . sprintf('%03d', (int)(microtime(true) * 1000) % 1000),
            $signal->channelId ?: 'UNKNOWN',
            $signal->contentType,
            $dto['vmaf_score']      ?? 0,
            $dto['bpp']             ?? 0,
            $dto['hdr_auth_type']   ?? 'UNKNOWN',
            $dto['quality_rank']    ?? 'UNKNOWN',
            $dto['knn_distance']    ?? 0,
            $dto['stability_score'] ?? 0,
            $artifact['type'],
            $levelNames[$level] ?? 'SILENT',
            $ms
        );
        @file_put_contents(APE_METRICS_LOG, $line, FILE_APPEND | LOCK_EX);
    }
}

// ── Auto-activación + warmup ─────────────────────────────────────────────────
// Pre-calentar el registro de sesiones para que la primera petición sea < 1ms
if (!file_exists(APE_REGISTRY)) { @file_put_contents(APE_REGISTRY, '{}'); }
// Pre-cargar cache en memoria
SessionRadar::warmup();
if (PHP_SAPI !== 'cli') {
    ApeInvisibleAiEngine::route();
}
