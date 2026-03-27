<?php
/**
 * NeuroBufferController v1.0.0 — APE v18.2 / Resilience v6.0
 *
 * Cerebelo del sistema: Control motor de buffer con escalada orgánica.
 * Garantiza calidad visual NATIVA MÁXIMA (4K/8K) al multiplicar
 * la agresividad de descarga en lugar de degradar resolución.
 *
 * Protocolo "Depredador de Ancho de Banda":
 *   - NIVEL 0 (VERDE):   x1 — Flujo natural, 1 conexión TCP
 *   - NIVEL 1 (AMARILLO): x2 — Dual TCP Prefetch, 2 conexiones paralelas
 *   - NIVEL 2 (NARANJA):  x4 — Burst Mode, Accept-Ranges paralelo
 *   - NIVEL 3 (ROJO):     x8 — NUCLEAR, chunk splitting multi-CDN
 *
 * NUNCA degrada resolución. Prefiere micro-pausa sobre pixelación.
 *
 * Integración:
 *   - Se invoca desde resolve_quality.php via shim
 *   - Lee condiciones de QoSQoEOrchestrator
 *   - Alimenta headers a ResilienceEngine
 *   - Estado persistido en /tmp/ (sin Redis)
 *
 * @package  cmaf_engine/modules
 * @version  1.0.0
 * @requires PHP 8.1+
 */
class NeuroBufferController
{
    // ── Niveles de agresión ────────────────────────────────────────────────
    public const LEVEL_NORMAL   = 'NORMAL';      // x1
    public const LEVEL_ESCALATE = 'ESCALATING';   // x2
    public const LEVEL_BURST    = 'BURST';         // x4
    public const LEVEL_NUCLEAR  = 'NUCLEAR';       // x8

    // ── Umbrales de buffer (%) ─────────────────────────────────────────────
    private const THRESHOLD_GREEN  = 70;  // > 70%: todo bien
    private const THRESHOLD_YELLOW = 30;  // 30-70%: escalar a x2
    private const THRESHOLD_ORANGE = 10;  // 10-30%: burst mode x4
    // < 10%: NUCLEAR x8

    // ── DSCP Tags por nivel ────────────────────────────────────────────────
    private const DSCP_NORMAL  = 0;   // Best Effort
    private const DSCP_ESCALATE= 26;  // AF31
    private const DSCP_BURST   = 34;  // AF41
    private const DSCP_NUCLEAR = 46;  // EF (Expedited Forwarding)

    // ── Persistencia ───────────────────────────────────────────────────────
    private const STATE_FILE       = '/tmp/neuro_buffer_state.json';
    private const HISTORY_FILE     = '/tmp/neuro_buffer_history.json';
    private const TREND_WINDOW     = 10;   // Muestras para calcular tendencia
    private const MAX_HISTORY_ITEMS= 100;  // Máximo de entradas en historial

    // ── API pública ────────────────────────────────────────────────────────

    /**
     * Calcula el perfil de agresión para un canal basado en su buffer actual.
     * Este es el método principal invocado por resolve_quality.php.
     *
     * @param string $channelId   ID del canal (e.g., "1312008")
     * @param float  $bufferPct   Porcentaje de buffer actual (0-100)
     * @param array  $networkInfo Información de red opcional del QoSQoEOrchestrator
     * @return array Perfil completo de agresión con headers y configuración
     */
    public static function calculateAggression(
        string $channelId,
        float  $bufferPct,
        array  $networkInfo = []
    ): array {
        // Registrar muestra de buffer para análisis de tendencia
        self::recordBufferSample($channelId, $bufferPct);

        // Obtener historial para calcular tendencia
        $history = self::getBufferHistory($channelId);
        $trend   = self::calculateBufferTrend($history);

        // Determinar nivel de agresión
        $level = self::resolveLevel($bufferPct, $trend);

        // Construir perfil completo
        $profile = self::buildAggressionProfile($level, $bufferPct, $trend, $networkInfo);

        // Persistir estado actual
        self::saveChannelState($channelId, $profile);

        // Registrar escalada en historial (si cambió de nivel)
        $previousState = self::getChannelState($channelId);
        if ($previousState && $previousState['level'] !== $level) {
            self::recordEscalation($channelId, $previousState['level'], $level);
        }

        return $profile;
    }

    /**
     * Genera los headers HTTP de agresión para inyectar en el manifiesto.
     * Estos headers instruyen al player sobre el comportamiento de descarga.
     *
     * @param array $profile Perfil de agresión de calculateAggression()
     * @return array Headers key => value para EXTHTTP
     */
    public static function buildAggressionHeaders(array $profile): array
    {
        return [
            'X-Buffer-Escalation-Level'  => $profile['level'],
            'X-Aggression-Multiplier'    => (string)$profile['multiplier'],
            'X-Parallel-Connections'     => (string)$profile['connections'],
            'X-DSCP-Override'            => (string)$profile['dscp'],
            'X-Prefetch-Depth'           => (string)$profile['prefetch_depth'],
            'X-Chunk-Split-Enabled'      => $profile['chunk_split'] ? 'true' : 'false',
            'X-Buffer-Target-Override'   => (string)($profile['buffer_target_ms']),
            'X-Buffer-Strategy'          => $profile['strategy'],
            'X-Quality-Lock'             => 'NATIVA_MAXIMA',
            'X-Degradation-Allowed'      => 'false',
        ];
    }

    /**
     * Genera los tags APE para el manifiesto M3U8.
     *
     * @param array $profile Perfil de agresión
     * @return array Líneas de tags para el manifiesto
     */
    public static function buildApeTags(array $profile): array
    {
        $tags = [
            "#EXT-X-APE-BUFFER-LEVEL:{$profile['level']}",
            "#EXT-X-APE-BUFFER-MULTIPLIER:{$profile['multiplier']}",
            "#EXT-X-APE-BUFFER-CONNECTIONS:{$profile['connections']}",
            "#EXT-X-APE-BUFFER-STRATEGY:{$profile['strategy']}",
            "#EXT-X-APE-QUALITY-LOCK:NATIVA_MAXIMA",
        ];

        if ($profile['level'] === self::LEVEL_NUCLEAR) {
            $tags[] = "#EXT-X-APE-NUCLEAR-MODE:ACTIVE";
            $tags[] = "#EXT-X-APE-DSCP-EF:46";
        }

        return $tags;
    }

    /**
     * Genera los EXTVLCOPT adicionales para el perfil de agresión.
     * Se suman a los 63+ EXTVLCOPT existentes de resolve_quality.php.
     *
     * @param array $profile Perfil de agresión
     * @return array Líneas EXTVLCOPT adicionales
     */
    /**
     * Builds the complete anti-cut VLC/Player options.
     *
     * ARCHITECTURE: 9-Layer Anti-Cut Shield
     *   Capa 1: Network Caching (RAM)
     *   Capa 2: Live Caching (stream)
     *   Capa 3: File Caching (prefetch)
     *   Capa 4: Disc Caching (disk backup)
     *   Capa 5: Connection Resilience (reconnect)
     *   Capa 6: Clock Tolerance (timing drift)
     *   Capa 7: Player-Specific (ExoPlayer/Kodi/OTT)
     *   Capa 8: Predictive Jump (jump to live edge on underrun)  ← NEW
     *   Capa 9: Redundancy Hydra (backup URL failover)           ← NEW
     *
     * @param array  $profile      Aggression profile from buildAggressionProfile()
     * @param string $streamType   'live', 'vod', or 'series'
     * @param string $networkType  'ethernet', 'wifi', 'mobile'
     * @param string $fallbackUrl  Optional backup stream URL
     * @return array VLC/Player option lines
     */
    public static function buildVlcOpts(
        array  $profile,
        string $streamType  = 'live',
        string $networkType = 'ethernet',
        string $fallbackUrl = ''
    ): array {
        $opts = [];
        $level = $profile['level'] ?? self::LEVEL_NORMAL;
        $bufMs = $profile['buffer_target_ms'] ?? 45000;
        $liveMs = $profile['live_caching_ms'] ?? 30000;
        $discMs = $profile['disc_caching_ms'] ?? 60000;
        $conns = $profile['connections'] ?? 3;
        $prefetch = $profile['prefetch_depth'] ?? 3;

        // ── MOBILE NETWORK ADJUSTMENT ─────────────────────────────
        // On mobile (4G/5G): cap initial network-cache for fast start
        // then rely on live-cache + disc-cache for sustained playback
        if ($networkType === 'mobile') {
            $bufMs = min($bufMs, 15000);   // Max 15s for fast start
            $liveMs = min($liveMs, 10000); // Max 10s live on mobile
        }

        // ═══════════════════════════════════════════════════════════
        // CAPA 1: NETWORK CACHING — Main RAM Buffer
        // NORMAL=45s, ESCALATING=90s, BURST=120s, NUCLEAR=180s
        // ═══════════════════════════════════════════════════════════
        $opts[] = "#EXTVLCOPT:network-caching={$bufMs}";

        // ═══════════════════════════════════════════════════════════
        // CAPA 2: LIVE CACHING — Live Stream Dedicated Buffer
        // Only for live IPTV — synced with network cache
        // ═══════════════════════════════════════════════════════════
        if ($streamType === 'live') {
            $opts[] = "#EXTVLCOPT:live-caching={$liveMs}";
        }

        // ═══════════════════════════════════════════════════════════
        // CAPA 3: FILE CACHING — Deep Segment Prefetch
        // For VOD/Series: 2x buffer for aggressive preload
        // For Live: 1x buffer as a safety net
        // ═══════════════════════════════════════════════════════════
        if ($streamType === 'vod' || $streamType === 'series') {
            $fileCache = $bufMs * 3;  // 3x for VOD (entire episode prefetch)
            $opts[] = "#EXTVLCOPT:file-caching={$fileCache}";
            $opts[] = "#EXTVLCOPT:prefetch-buffer-size=" . ($fileCache * 1000);
        } else {
            $fileCache = ($prefetch > 3) ? ($bufMs * 2) : $bufMs;
            $opts[] = "#EXTVLCOPT:file-caching={$fileCache}";
        }

        // ═══════════════════════════════════════════════════════════
        // CAPA 4: DISC CACHING — Write-Through to Disk
        // NUCLEAR: 5 min disc buffer = survives 30s+ outages
        // ═══════════════════════════════════════════════════════════
        $opts[] = "#EXTVLCOPT:disc-caching={$discMs}";

        // ═══════════════════════════════════════════════════════════
        // CAPA 5: CONNECTION RESILIENCE — Auto-Reconnect Shield
        // 6 directives that make the connection immortal
        // ═══════════════════════════════════════════════════════════
        $opts[] = "#EXTVLCOPT:http-reconnect=1";
        $opts[] = "#EXTVLCOPT:http-continuous=1";
        $opts[] = "#EXTVLCOPT:sout-keep=1";
        $opts[] = "#EXTVLCOPT:sout-mux-caching=5000";
        $opts[] = "#EXTVLCOPT:http-forward-cookies=1";
        $ipTimeout = ($level === self::LEVEL_NUCLEAR) ? 30000 : 15000;
        $opts[] = "#EXTVLCOPT:ipv4-timeout={$ipTimeout}";

        // ═══════════════════════════════════════════════════════════
        // CAPA 6: CLOCK TOLERANCE — Timing Drift Survival
        // After a micro-outage, timestamps may be off
        // ═══════════════════════════════════════════════════════════
        $opts[] = "#EXTVLCOPT:clock-jitter=0";
        $opts[] = "#EXTVLCOPT:clock-synchro=0";
        $crAvg = ($level === self::LEVEL_NUCLEAR) ? 80 : 40;
        $opts[] = "#EXTVLCOPT:cr-average={$crAvg}";
        $opts[] = "#EXTVLCOPT:avcodec-hurry-up=1";
        $opts[] = "#EXTVLCOPT:skip-frames=1";

        // ═══════════════════════════════════════════════════════════
        // CAPA 7: PLAYER-SPECIFIC DIRECTIVES
        // ═══════════════════════════════════════════════════════════
        $opts[] = "#EXTVLCOPT:adaptive-logic=highest";
        $opts[] = "#EXTVLCOPT:adaptive-maxwidth=3840";

        // ExoPlayer (Fire TV, Android TV, ONN 4K)
        $exoBuf = intdiv($bufMs, 1000);
        $opts[] = "#EXTHTTP:{\"X-ExoPlayer-MinBuffer\":\"{$exoBuf}\"}";
        $opts[] = "#EXTHTTP:{\"X-ExoPlayer-MaxBuffer\":\"" . ($exoBuf * 3) . "\"}";
        $opts[] = "#EXTHTTP:{\"X-ExoPlayer-BackBuffer\":\"" . intdiv($exoBuf, 2) . "\"}";
        $opts[] = "#EXTHTTP:{\"X-ExoPlayer-RetainAfterBufferDuration\":\"true\"}";

        // Kodi / InputStreamAdaptive
        if ($conns > 1) {
            $opts[] = "#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive";
            $opts[] = "#KODIPROP:inputstream.adaptive.chooser_bandwidth_buffer=" . ($conns * 2);
            $opts[] = "#KODIPROP:inputstream.adaptive.pre_buffer_bytes=" . ($bufMs * 50);
        }

        // OTT Navigator
        $opts[] = "#EXTHTTP:{\"X-Buffer-Size\":\"" . ($bufMs * 1000) . "\"}";
        $opts[] = "#EXTHTTP:{\"X-Buffer-Reconnect\":\"true\"}";

        // ═══════════════════════════════════════════════════════════
        // CAPA 8: PREDICTIVE JUMP — "Salto Cuántico"
        //
        // PROBLEM: Player buffer empties → "Buffering Wheel of Death"
        // SOLUTION: Instead of waiting to re-fill, JUMP to live edge.
        //   Result: Micro-discontinuity (imperceptible) instead of freeze.
        //
        // Only for LIVE streams — VOD should always buffer normally.
        // ═══════════════════════════════════════════════════════════
        if ($streamType === 'live') {
            // Tells compatible players: on underrun, skip to NOW
            $opts[] = "#EXTHTTP:{\"X-Live-Edge-Policy\":\"JUMP_ON_UNDERRUN\"}";
            // Minimum seconds of buffer before triggering the jump
            $minSec = ($level === self::LEVEL_NUCLEAR) ? '1.5' : '3.0';
            $opts[] = "#EXTHTTP:{\"X-Buffer-Min-Sec\":\"{$minSec}\"}";
            // ExoPlayer-specific: prefer live edge on rebuffer
            $opts[] = "#EXTHTTP:{\"X-ExoPlayer-LiveOffsetMs\":\"3000\"}";
            $opts[] = "#EXTHTTP:{\"X-ExoPlayer-LiveTargetOffsetMs\":\"5000\"}";
            // Kodi: prefer live edge
            $opts[] = "#KODIPROP:inputstream.adaptive.live_delay=3";
        }

        // ═══════════════════════════════════════════════════════════
        // CAPA 9: REDUNDANCY HYDRA — Backup Source Failover
        //
        // If the primary stream source dies, the player can switch
        //  to a backup URL WITHOUT restarting the app.
        //
        // "If the head is cut, two more grow."
        // ═══════════════════════════════════════════════════════════
        if (!empty($fallbackUrl)) {
            $opts[] = "#EXTHTTP:{\"X-Backup-Stream-Url\":\"" . addslashes($fallbackUrl) . "\"}";
            $opts[] = "#EXTHTTP:{\"X-Failover-Policy\":\"SEAMLESS_30MS\"}";
            $opts[] = "#EXTHTTP:{\"X-Failover-MaxRetries\":\"5\"}";
            $opts[] = "#EXTHTTP:{\"X-Failover-Backoff\":\"EXPONENTIAL\"}";
        }

        return $opts;
    }

    /**
     * Obtiene el estado actual de un canal.
     */
    public static function getChannelState(string $channelId): ?array
    {
        $states = self::loadStates();
        return $states[$channelId] ?? null;
    }

    /**
     * Obtiene estadísticas globales del sistema de buffer.
     */
    public static function getSystemStats(): array
    {
        $states = self::loadStates();
        $history = self::loadHistory();

        $levels = array_count_values(array_column($states, 'level'));

        return [
            'channels_tracked'     => count($states),
            'channels_normal'      => $levels[self::LEVEL_NORMAL] ?? 0,
            'channels_escalating'  => $levels[self::LEVEL_ESCALATE] ?? 0,
            'channels_burst'       => $levels[self::LEVEL_BURST] ?? 0,
            'channels_nuclear'     => $levels[self::LEVEL_NUCLEAR] ?? 0,
            'total_escalations_24h'=> self::countRecentEscalations(86400),
            'nuclear_activations_24h' => self::countRecentNuclear(86400),
            'system_state'         => self::assessSystemState($levels),
        ];
    }

    /**
     * Limpia estados de canales inactivos (sin actualización en >1 hora).
     */
    public static function cleanupStaleChannels(): int
    {
        $states   = self::loadStates();
        $cutoff   = time() - 3600;
        $cleaned  = 0;

        foreach ($states as $chId => $state) {
            if (($state['updated_at'] ?? 0) < $cutoff) {
                unset($states[$chId]);
                $cleaned++;
            }
        }

        if ($cleaned > 0) {
            self::saveStates($states);
        }

        return $cleaned;
    }

    // ── Lógica interna de resolución ───────────────────────────────────────

    /**
     * Resuelve el nivel de agresión basado en % de buffer y tendencia.
     */
    private static function resolveLevel(float $bufferPct, string $trend): string
    {
        // NUCLEAR: buffer crítico
        if ($bufferPct < self::THRESHOLD_ORANGE) {
            return self::LEVEL_NUCLEAR;
        }

        // BURST: buffer bajo
        if ($bufferPct < self::THRESHOLD_YELLOW) {
            return self::LEVEL_BURST;
        }

        // ESCALATING: buffer medio O tendencia descendente
        if ($bufferPct < self::THRESHOLD_GREEN || $trend === 'DESCENDING') {
            return self::LEVEL_ESCALATE;
        }

        // NORMAL: buffer saludable y tendencia estable/ascendente
        return self::LEVEL_NORMAL;
    }

    /**
     * Construye el perfil completo de agresión para un nivel dado.
     */
    private static function buildAggressionProfile(
        string $level,
        float  $bufferPct,
        string $trend,
        array  $networkInfo
    ): array {
        $profiles = [
            self::LEVEL_NORMAL => [
                'multiplier'      => 1,
                'connections'     => 3,
                'dscp'            => self::DSCP_ESCALATE,  // AF31 — ALWAYS demand priority
                'strategy'        => 'STANDARD_FLOW',
                'prefetch_depth'  => 3,
                'chunk_split'     => false,
                'buffer_target_ms'=> 45000,   // 45s buffer — survives 3s micro-outage
                'live_caching_ms' => 30000,   // 30s live stream buffer
                'disc_caching_ms' => 60000,   // 60s disc backup buffer
            ],
            self::LEVEL_ESCALATE => [
                'multiplier'      => 2,
                'connections'     => 4,
                'dscp'            => self::DSCP_ESCALATE,  // AF31
                'strategy'        => 'DUAL_TCP_PREFETCH',
                'prefetch_depth'  => 6,
                'chunk_split'     => false,
                'buffer_target_ms'=> 90000,   // 90s buffer — survives 5s outage
                'live_caching_ms' => 60000,
                'disc_caching_ms' => 120000,
            ],
            self::LEVEL_BURST => [
                'multiplier'      => 4,
                'connections'     => 6,
                'dscp'            => self::DSCP_BURST,     // AF41
                'strategy'        => 'ACCEPT_RANGES_PARALLEL',
                'prefetch_depth'  => 10,
                'chunk_split'     => true,
                'buffer_target_ms'=> 120000,  // 120s buffer — survives 10s outage
                'live_caching_ms' => 90000,
                'disc_caching_ms' => 180000,
            ],
            self::LEVEL_NUCLEAR => [
                'multiplier'      => 8,
                'connections'     => 8,
                'dscp'            => self::DSCP_NUCLEAR,   // EF (Expedited Forwarding)
                'strategy'        => 'CHUNK_SPLITTING_MULTI_CDN',
                'prefetch_depth'  => 20,
                'chunk_split'     => true,
                'buffer_target_ms'=> 180000,  // 180s (3 min!) — survives 30s outage
                'live_caching_ms' => 120000,
                'disc_caching_ms' => 300000,  // 5 min disc buffer
            ],
        ];

        $profile = $profiles[$level] ?? $profiles[self::LEVEL_NORMAL];

        return array_merge($profile, [
            'level'          => $level,
            'quality'        => 'NATIVA_MAXIMA',  // NUNCA se degrada
            'buffer_pct'     => $bufferPct,
            'trend'          => $trend,
            'network_type'   => $networkInfo['network_type'] ?? 'unknown',
            'bandwidth_kbps' => $networkInfo['bandwidth_kbps'] ?? 0,
            'updated_at'     => time(),
        ]);
    }

    // ── Análisis de tendencia ──────────────────────────────────────────────

    /**
     * Calcula la tendencia del buffer: ASCENDING, STABLE, o DESCENDING.
     * Usa regresión lineal simple sobre las últimas N muestras.
     */
    private static function calculateBufferTrend(array $samples): string
    {
        $n = count($samples);
        if ($n < 3) {
            return 'STABLE';
        }

        // Tomar las últimas TREND_WINDOW muestras
        $recent = array_slice($samples, -self::TREND_WINDOW);
        $n = count($recent);

        // Regresión lineal: calcular pendiente
        $sumX  = 0;
        $sumY  = 0;
        $sumXY = 0;
        $sumX2 = 0;

        for ($i = 0; $i < $n; $i++) {
            $x = $i;
            $y = $recent[$i]['buffer_pct'] ?? 0;
            $sumX  += $x;
            $sumY  += $y;
            $sumXY += $x * $y;
            $sumX2 += $x * $x;
        }

        $denominator = ($n * $sumX2) - ($sumX * $sumX);
        if ($denominator == 0) {
            return 'STABLE';
        }

        $slope = (($n * $sumXY) - ($sumX * $sumY)) / $denominator;

        // Umbrales de pendiente
        if ($slope > 1.0) {
            return 'ASCENDING';
        }
        if ($slope < -1.0) {
            return 'DESCENDING';
        }

        return 'STABLE';
    }

    // ── Persistencia en /tmp/ ──────────────────────────────────────────────

    private static function recordBufferSample(string $channelId, float $bufferPct): void
    {
        $history = self::loadHistory();

        if (!isset($history[$channelId])) {
            $history[$channelId] = [];
        }

        $history[$channelId][] = [
            'buffer_pct' => $bufferPct,
            'ts'         => time(),
        ];

        // Mantener solo las últimas MAX_HISTORY_ITEMS muestras
        if (count($history[$channelId]) > self::MAX_HISTORY_ITEMS) {
            $history[$channelId] = array_slice($history[$channelId], -self::MAX_HISTORY_ITEMS);
        }

        self::saveHistory($history);
    }

    private static function getBufferHistory(string $channelId): array
    {
        $history = self::loadHistory();
        return $history[$channelId] ?? [];
    }

    private static function recordEscalation(string $channelId, string $from, string $to): void
    {
        $states = self::loadStates();
        if (!isset($states[$channelId]['escalation_log'])) {
            $states[$channelId]['escalation_log'] = [];
        }

        $states[$channelId]['escalation_log'][] = [
            'from' => $from,
            'to'   => $to,
            'ts'   => time(),
        ];

        // Mantener solo las últimas 50 escaladas
        if (count($states[$channelId]['escalation_log']) > 50) {
            $states[$channelId]['escalation_log'] = array_slice(
                $states[$channelId]['escalation_log'], -50
            );
        }

        self::saveStates($states);
    }

    private static function saveChannelState(string $channelId, array $profile): void
    {
        $states = self::loadStates();
        $states[$channelId] = array_merge(
            $states[$channelId] ?? [],
            $profile
        );
        self::saveStates($states);
    }

    private static function countRecentEscalations(int $windowSecs): int
    {
        $states = self::loadStates();
        $cutoff = time() - $windowSecs;
        $count  = 0;

        foreach ($states as $state) {
            foreach ($state['escalation_log'] ?? [] as $entry) {
                if ($entry['ts'] >= $cutoff) {
                    $count++;
                }
            }
        }

        return $count;
    }

    private static function countRecentNuclear(int $windowSecs): int
    {
        $states = self::loadStates();
        $cutoff = time() - $windowSecs;
        $count  = 0;

        foreach ($states as $state) {
            foreach ($state['escalation_log'] ?? [] as $entry) {
                if ($entry['ts'] >= $cutoff && $entry['to'] === self::LEVEL_NUCLEAR) {
                    $count++;
                }
            }
        }

        return $count;
    }

    private static function assessSystemState(array $levels): string
    {
        $nuclear = $levels[self::LEVEL_NUCLEAR] ?? 0;
        $burst   = $levels[self::LEVEL_BURST] ?? 0;
        $total   = array_sum($levels);

        if ($total === 0) return 'IDLE';
        if ($nuclear > 0)  return 'CRITICAL';
        if ($burst > 0)    return 'ELEVATED';
        return 'NORMAL';
    }

    // ── File I/O con LOCK_EX ───────────────────────────────────────────────

    private static function loadStates(): array
    {
        if (!file_exists(self::STATE_FILE)) {
            return [];
        }
        return json_decode(file_get_contents(self::STATE_FILE), true) ?? [];
    }

    private static function saveStates(array $states): void
    {
        file_put_contents(
            self::STATE_FILE,
            json_encode($states, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            LOCK_EX
        );
    }

    private static function loadHistory(): array
    {
        if (!file_exists(self::HISTORY_FILE)) {
            return [];
        }
        return json_decode(file_get_contents(self::HISTORY_FILE), true) ?? [];
    }

    private static function saveHistory(array $history): void
    {
        file_put_contents(
            self::HISTORY_FILE,
            json_encode($history, JSON_UNESCAPED_UNICODE),
            LOCK_EX
        );
    }
}
