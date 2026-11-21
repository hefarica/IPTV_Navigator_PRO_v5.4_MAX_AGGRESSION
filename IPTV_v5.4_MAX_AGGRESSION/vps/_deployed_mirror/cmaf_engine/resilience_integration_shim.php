<?php
declare(strict_types=1);
/**
 * IPTV Navigator PRO — Resilience Architecture v6.0
 * Module: Resilience Integration Shim v1.0.0
 *
 * PURPOSE: Non-invasive bridge between resolve_quality.php and the
 * Resilience v6.0 motors (NeuroBufferController + ModemPriorityManager).
 * Follows the same pattern as cmaf_integration_shim.php:
 *   - Only loads if the PHP files exist (graceful degradation)
 *   - Returns additional headers/tags to merge, never replaces output
 *   - Zero modifications to existing resolve_quality.php logic
 *
 * INTEGRATION (3 lines in resolve_quality.php, after building EXTHTTP):
 *   require_once __DIR__ . '/cmaf_engine/resilience_integration_shim.php';
 *   $resilienceHeaders = ResilienceIntegrationShim::enhance($channelId, $decision);
 *   // Merge $resilienceHeaders into EXTHTTP and EXTVLCOPT output
 *
 * FASE 1 (Costo $0): File-based state in /tmp/ — no Redis required.
 * FASE 2 (Diferido): Redis + Prometheus + Grafana when RAM allows.
 *
 * @package  cmaf_engine
 * @version  1.0.0
 * @requires PHP 8.1+
 */

class ResilienceIntegrationShim
{
    const SHIM_VERSION = '1.2.0';

    // ── Module paths ──────────────────────────────────────────────────────
    const MODULES_DIR = __DIR__ . '/modules';

    // ── Module availability cache ─────────────────────────────────────────
    private static bool $modulesLoaded = false;
    private static bool $hasNeuroBuffer = false;
    private static bool $hasModemPriority = false;
    private static bool $hasResilience = false;
    private static bool $hasQoSQoE = false;
    private static bool $hasAISuperRes = false;

    // ── API pública ────────────────────────────────────────────────────────

    /**
     * Main entry point. Enhances the channel resolution with resilience data.
     * Called from resolve_quality.php AFTER the standard decision is made.
     *
     * Returns an associative array with:
     *   - 'exthttp'   => Additional EXTHTTP headers (key => value)
     *   - 'extvlcopt' => Additional EXTVLCOPT lines (string[])
     *   - 'ape_tags'  => Additional APE manifest tags (string[])
     *   - 'meta'      => Diagnostic metadata (for logging, not output)
     *
     * Returns empty arrays if no resilience modules are available.
     *
     * @param string $channelId  Channel ID (e.g., "1312008")
     * @param array  $decision   The resolved channel decision from resolve_quality.php
     * @return array ['exthttp' => [], 'extvlcopt' => [], 'ape_tags' => [], 'meta' => []]
     */
    public static function enhance(string $channelId, array $decision): array
    {
        $shimStart = microtime(true);

        $result = [
            'exthttp'   => [],
            'extvlcopt' => [],
            'ape_tags'  => [],
            'meta'      => [
                'shim_version'    => self::SHIM_VERSION,
                'modules_loaded'  => [],
                'buffer_level'    => null,
                'network_type'    => null,
                'escalation'      => null,
            ],
        ];

        // Load modules (only once per request)
        self::loadModules();

        // If no resilience modules available, return empty (graceful degradation)
        if (!self::$hasNeuroBuffer && !self::$hasModemPriority) {
            return $result;
        }

        // ── 1. NeuroBufferController: Organic buffer escalation ─────────
        if (self::$hasNeuroBuffer) {
            $result = self::applyNeuroBuffer($channelId, $decision, $result);
            $result['meta']['modules_loaded'][] = 'NeuroBufferController';
        }

        // ── 2. BandwidthFloorEnforcement: NEVER drop below profile Mbps ──
        $result = self::applyBandwidthFloor($channelId, $decision, $result);
        $result['meta']['modules_loaded'][] = 'BandwidthFloorEnforcement';

        // ── 3. ModemPriorityManager: Network priority enforcement ───────
        if (self::$hasModemPriority) {
            $result = self::applyModemPriority($channelId, $decision, $result);
            $result['meta']['modules_loaded'][] = 'ModemPriorityManager';
        }

        // ── 3. ResilienceEngine: Circuit breaker and failover (existing) ─
        if (self::$hasResilience) {
            $result = self::applyResilienceEngine($channelId, $decision, $result);
            $result['meta']['modules_loaded'][] = 'ResilienceEngine';
        }

        // ── 4. QoSQoEOrchestrator: Score and metrics (existing) ──────────
        if (self::$hasQoSQoE) {
            $result = self::applyQoSQoE($channelId, $decision, $result);
            $result['meta']['modules_loaded'][] = 'QoSQoEOrchestrator';
        }

        // ── 5. AISuperResolutionEngine: Edge visual enhancement (v6.2) ───
        if (self::$hasAISuperRes) {
            $result = self::applyAISuperRes($channelId, $decision, $result);
            $result['meta']['modules_loaded'][] = 'AISuperResolutionEngine';
        }

        // ── 6. Add shim identification header ────────────────────────────
        $result['exthttp']['X-Resilience-Shim'] = self::SHIM_VERSION;
        $result['exthttp']['X-Resilience-Modules'] = implode(',', $result['meta']['modules_loaded']);

        // ── 7. Structured JSON log (non-blocking) ────────────────────────
        self::logOperation($channelId, $result['meta'], $shimStart);

        return $result;
    }

    /**
     * Quick health check: returns system status without modifying any output.
     * Useful for diagnostic endpoints.
     *
     * @return array System health from all available modules
     */
    public static function healthCheck(): array
    {
        self::loadModules();

        $health = [
            'shim_version' => self::SHIM_VERSION,
            'modules'      => [
                'neuro_buffer'    => self::$hasNeuroBuffer,
                'modem_priority'  => self::$hasModemPriority,
                'resilience'      => self::$hasResilience,
                'qos_qoe'        => self::$hasQoSQoE,
                'ai_super_res'   => self::$hasAISuperRes,
            ],
        ];

        if (self::$hasNeuroBuffer) {
            $health['buffer_system'] = NeuroBufferController::getSystemStats();
        }
        if (self::$hasModemPriority) {
            $health['network_system'] = ModemPriorityManager::getSystemNetworkStats();
        }
        if (self::$hasResilience) {
            $health['resilience_system'] = ResilienceEngine::getSystemHealth();
        }

        return $health;
    }

    /**
     * Apply NeuroBufferController enhancements.
     *
     * PASSIVE TELEMETRY v1.0 — Derives REAL buffer_pct from request patterns.
     * In a stateless HTTP model, we can't read the player's buffer directly.
     * Instead, we infer buffer health from how the player behaves:
     *
     *   - 1 request then silence → Player loaded OK, buffer healthy (85-95%)
     *   - 2 requests in 10s → Player re-fetched manifest, minor issue (60-70%)
     *   - 3+ requests in 30s → Player retrying, buffer running low (30-50%)
     *   - 5+ requests in 30s → Player in crisis, buffer empty (5-15%)
     *
     * This feeds the EXISTING NeuroBufferController logic (4 escalation levels,
     * linear regression trend detection, history persistence) with REAL data
     * instead of the previous hardcoded 72%.
     */
    private static function applyNeuroBuffer(string $channelId, array $decision, array $result): array
    {
        // ── PASSIVE TELEMETRY: Derive buffer_pct from request frequency ──
        $bufferPct = self::deriveBufferFromTelemetry($channelId, $decision);

        // Network info for context
        $networkInfo = [
            'network_type'   => $decision['network_type'] ?? $_SERVER['HTTP_X_CONNECTION_TYPE'] ?? 'ethernet',
            'bandwidth_kbps' => $decision['bandwidth_kbps'] ?? 0,
        ];

        // Calculate aggression profile
        $profile = NeuroBufferController::calculateAggression($channelId, $bufferPct, $networkInfo);

        // Merge headers
        $result['exthttp'] = array_merge(
            $result['exthttp'],
            NeuroBufferController::buildAggressionHeaders($profile)
        );

        // Merge EXTVLCOPT
        $result['extvlcopt'] = array_merge(
            $result['extvlcopt'],
            NeuroBufferController::buildVlcOpts($profile)
        );

        // Merge APE tags
        $result['ape_tags'] = array_merge(
            $result['ape_tags'],
            NeuroBufferController::buildApeTags($profile)
        );

        // Meta
        $result['meta']['buffer_level'] = $profile['level'];
        $result['meta']['buffer_pct_derived'] = $bufferPct;
        $result['meta']['escalation'] = $profile['multiplier'] > 1
            ? "x{$profile['multiplier']} ({$profile['strategy']})"
            : null;

        return $result;
    }

    // ── Bandwidth Floor Enforcement Engine v1.0 ──────────────────────────

    /**
     * Bandwidth Floor Enforcement — NEVER let the player's adaptive logic
     * drop below the minimum Mbps required for the channel's profile.
     *
     * Each profile has a defined bandwidth floor (from resolve_quality.php):
     *   P0 (4K ULTRA):   50 Mbps min
     *   P1 (8K SUPREME): 40 Mbps min
     *   P2 (4K EXTREME): 20 Mbps min
     *   P3 (FHD):         5 Mbps min
     *   P4 (HD):          2 Mbps min
     *   P5 (SD):        0.5 Mbps min
     *
     * BEHAVIOR:
     *   - If network drops → NeuroBuffer escalates → MORE connections
     *   - BandwidthFloor → ensures each connection DEMANDS minimum bitrate
     *   - Together: more connections × forced minimum bitrate = NEVER drops
     *   - The floor is ABSOLUTE — adaptive-logic set to 'highest' always
     *   - Player is FORBIDDEN from choosing a lower quality stream
     */
    private static function applyBandwidthFloor(string $channelId, array $decision, array $result): array
    {
        // ── Profile bandwidth floors (bps) ──
        $profile = $decision['profile'] ?? $decision['quality_profile'] ?? 'P3';
        $floors = [
            'P0' => ['min_bw' => 50000000, 'bitrate_kbps' => 13400, 'label' => '4K_ULTRA_50M'],
            'P1' => ['min_bw' => 40000000, 'bitrate_kbps' => 42900, 'label' => '8K_SUPREME_40M'],
            'P2' => ['min_bw' => 20000000, 'bitrate_kbps' => 13400, 'label' => '4K_EXTREME_20M'],
            'P3' => ['min_bw' =>  5000000, 'bitrate_kbps' =>  3700, 'label' => 'FHD_5M'],
            'P4' => ['min_bw' =>  2000000, 'bitrate_kbps' =>  2800, 'label' => 'HD_2M'],
            'P5' => ['min_bw' =>   500000, 'bitrate_kbps' =>  1500, 'label' => 'SD_500K'],
        ];

        $floor = $floors[$profile] ?? $floors['P3'];
        $minBw    = $floor['min_bw'];
        $bitrateK = $floor['bitrate_kbps'];
        $label    = $floor['label'];

        // ── Check if NeuroBuffer detected stress → AMPLIFY the floor ──
        $bufferLevel = $result['meta']['buffer_level'] ?? 'NORMAL';
        $floorMultiplier = match ($bufferLevel) {
            'NUCLEAR'    => 2.0,   // In crisis: DEMAND 2x the minimum
            'BURST'      => 1.5,   // Stressed: demand 1.5x
            'ESCALATING' => 1.25,  // Light stress: demand 1.25x
            default      => 1.0,   // Stable: standard floor
        };

        $enforcedMinBw  = (int)($minBw * $floorMultiplier);
        $enforcedBitrateK = (int)($bitrateK * $floorMultiplier);

        // ── Inject floor enforcement headers ──
        $result['exthttp'] = array_merge($result['exthttp'], [
            'X-Bandwidth-Floor'         => (string)$enforcedMinBw,
            'X-Bandwidth-Floor-Label'   => $label,
            'X-Bandwidth-Floor-Mult'    => (string)$floorMultiplier,
            'X-Bitrate-Floor-Kbps'      => (string)$enforcedBitrateK,
            'X-Quality-Lock'            => 'NATIVA_MAXIMA',
            'X-Degradation-Allowed'     => 'false',
            'X-Min-Bandwidth-Guarantee' => (string)$enforcedMinBw,
        ]);

        // ── EXTVLCOPT: Lock player adaptive logic to HIGHEST always ──
        $result['extvlcopt'] = array_merge($result['extvlcopt'], [
            '#EXTVLCOPT:adaptive-logic=highest',
            '#EXTVLCOPT:adaptive-maxwidth=' . ($decision['w'] ?? 3840),
            '#EXTVLCOPT:adaptive-maxheight=' . ($decision['h'] ?? 2160),
            '#EXTVLCOPT:adaptive-bw-min=' . $enforcedMinBw,
            '#EXTVLCOPT:adaptive-bw-max=' . (int)($enforcedMinBw * 3),
        ]);

        // ── APE tags: Bandwidth floor markers ──
        $result['ape_tags'] = array_merge($result['ape_tags'], [
            "#EXT-X-APE-BW-FLOOR:{$enforcedMinBw}",
            "#EXT-X-APE-BW-FLOOR-LABEL:{$label}",
            "#EXT-X-APE-BITRATE-LOCK:{$enforcedBitrateK}K",
            "#EXT-X-APE-QUALITY-DEGRADATION:FORBIDDEN",
        ]);

        // Meta for logging
        $result['meta']['bw_floor'] = $enforcedMinBw;
        $result['meta']['bw_floor_mult'] = $floorMultiplier;
        $result['meta']['bw_floor_label'] = $label;

        // Log the floor enforcement
        @file_put_contents('/var/log/iptv-ape/bw_floor.log',
            sprintf("[%s] ch=%s profile=%s floor=%dMbps mult=%.1fx enforced=%dMbps bitrate=%dK buffer_level=%s\n",
                date('c'), $channelId, $profile,
                (int)($minBw / 1000000), $floorMultiplier,
                (int)($enforcedMinBw / 1000000), $enforcedBitrateK, $bufferLevel),
            FILE_APPEND | LOCK_EX);

        return $result;
    }

    // ── Passive Telemetry Engine v1.0 ─────────────────────────────────────

    private const TELEMETRY_FILE = '/tmp/neuro_telemetry_state.json';
    private const TELEMETRY_WINDOW = 60;     // 60-second analysis window
    private const TELEMETRY_MAX_CHANNELS = 200;  // Max channels to track
    private const TELEMETRY_CLEANUP_INTERVAL = 300; // Clean stale channels every 5 min

    /**
     * Passive Telemetry — Derives buffer_pct from request frequency patterns.
     *
     * The key insight: IPTV players request the resolve endpoint when they need
     * to start/restart a stream. Healthy playback = 1 request then silence.
     * Retrying/buffering = multiple requests in rapid succession.
     *
     * Frequency → buffer_pct mapping (exponential decay):
     *   1 req/60s  →  90%  (first load, very healthy)
     *   2 req/60s  →  75%  (normal refresh, healthy)
     *   3 req/60s  →  55%  (player retrying once, medium)
     *   4 req/60s  →  38%  (multiple retries, low)
     *   5 req/60s  →  25%  (crisis, very low)
     *   6+ req/60s →  10%  (nuclear, near-empty buffer)
     *
     * The result feeds NeuroBufferController which runs:
     *   > 70% → NORMAL (x1)
     *   30-70% → ESCALATING (x2, dual TCP)
     *   10-30% → BURST (x4, parallel ranges)
     *   < 10% → NUCLEAR (x8, chunk splitting)
     *
     * @param string $channelId  Channel being resolved
     * @param array  $decision   Decision context from resolve_quality.php
     * @return float             Derived buffer_pct (0-100)
     */
    private static function deriveBufferFromTelemetry(string $channelId, array $decision): float
    {
        // If player explicitly reports buffer_pct (future WebSocket telemetry), use it
        if (isset($decision['buffer_pct']) && $decision['buffer_pct'] !== 72.0) {
            return (float)$decision['buffer_pct'];
        }

        $now = time();
        $telemetry = self::loadTelemetry();

        // Initialize channel entry if new
        if (!isset($telemetry['channels'][$channelId])) {
            $telemetry['channels'][$channelId] = [
                'timestamps'   => [],
                'first_seen'   => $now,
                'total_hits'   => 0,
                'profile'      => $decision['profile'] ?? $decision['quality_profile'] ?? 'P3',
            ];
        }

        $ch = &$telemetry['channels'][$channelId];

        // Record this request timestamp
        $ch['timestamps'][] = $now;
        $ch['total_hits']++;

        // Keep only timestamps within the analysis window
        $ch['timestamps'] = array_values(array_filter(
            $ch['timestamps'],
            fn(int $ts) => ($now - $ts) <= self::TELEMETRY_WINDOW
        ));

        // Calculate request frequency in the window
        $requestsInWindow = count($ch['timestamps']);

        // ═══════════════════════════════════════════════════════════════
        // CONDITION-BASED BUFFER DERIVATION v2.0
        //
        // Stability is NOT based on time (age). It's based on MEASURED
        // CONDITIONS that prove the buffer is healthy:
        //
        // SIGNAL 1: Request GAP (seconds between requests for same channel)
        //   - Large gap (>25s) = player is NOT retrying = buffer is FULL
        //   - Small gap (<5s)  = player IS retrying = buffer is LOW/EMPTY
        //   - Gap IS the proxy for: buffer_condition + network_speed
        //     (if network is fast AND buffer is full, player doesn't retry)
        //
        // SIGNAL 2: Request Frequency (requests per 60s window)
        //   - 1 req  = healthy first load
        //   - 2 req  = one retry (minor stress)
        //   - 3+ req = crisis (constant retrying)
        //
        // SIGNAL 3: Gap Trend (are gaps getting bigger or smaller?)
        //   - Ascending gaps  = network improving, buffer filling
        //   - Descending gaps = network degrading, buffer draining
        //
        // BEHAVIOR: If network drops → more retries → NUCLEAR
        //           Stays NUCLEAR until network PROVES stability
        //           (large gap = player stopped retrying = buffer full)
        //
        // FIRST REQUEST IS ALWAYS NUCLEAR — fill buffer as fast as possible.
        // Relaxation ONLY happens when conditions PROVE stability.
        // ═══════════════════════════════════════════════════════════════

        // ── SIGNAL 1: Average gap between requests ──
        $avgGap = 0.0;
        $gapTrend = 'UNKNOWN';
        $timestamps = $ch['timestamps'];
        $numTs = count($timestamps);

        if ($numTs >= 2) {
            // Calculate gaps between consecutive requests
            $gaps = [];
            for ($i = 1; $i < $numTs; $i++) {
                $gaps[] = $timestamps[$i] - $timestamps[$i - 1];
            }
            $avgGap = array_sum($gaps) / count($gaps);

            // Gap trend: compare first half vs second half
            if (count($gaps) >= 4) {
                $mid = intdiv(count($gaps), 2);
                $firstHalf = array_sum(array_slice($gaps, 0, $mid)) / $mid;
                $secondHalf = array_sum(array_slice($gaps, $mid)) / (count($gaps) - $mid);
                if ($secondHalf > $firstHalf * 1.3) {
                    $gapTrend = 'IMPROVING';   // gaps getting bigger = buffer filling
                } elseif ($secondHalf < $firstHalf * 0.7) {
                    $gapTrend = 'DEGRADING';   // gaps getting smaller = buffer draining
                } else {
                    $gapTrend = 'STABLE';
                }
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // POLYMORPHIC FREEZE DETECTOR v3.0
        //
        // Two independent signals → take the MOST AGGRESSIVE (lowest):
        //   1. Gap-based signal: derived from avg time between requests
        //   2. Retry-based signal: HARD CEILING based on retry COUNT
        //
        // The min() ensures a freeze is NEVER missed:
        //   - 3 retries with 13s gap? Gap says 55% but retries say 20% → 20% wins → BURST
        //   - 1 retry with 2s gap? Gap says 5% but retries say 95% → 5% wins → NUCLEAR
        //
        // IDEMPOTENT: Same inputs ALWAYS produce same output (pure function of state)
        // POLYMORPHIC: Adapts thresholds based on channel's freeze history
        // ═══════════════════════════════════════════════════════════════

        // ── SIGNAL A: Gap-based condition (network speed proxy) ──
        if ($numTs <= 1) {
            $gapSignal = 5.0;      // First request → NUCLEAR
        } elseif ($avgGap < 2.0) {
            $gapSignal = 5.0;      // MELTDOWN
        } elseif ($avgGap < 5.0) {
            $gapSignal = 15.0;     // BURST
        } elseif ($avgGap < 15.0) {
            $gapSignal = 30.0;     // ESCALATING (tightened from 35)
        } elseif ($avgGap < 30.0) {
            $gapSignal = 55.0;     // ESCALATING (low)
        } else {
            $gapSignal = 85.0;     // NORMAL (proven stable >30s gap)
        }

        // ── SIGNAL B: Retry-based HARD CEILING (freeze prevention) ──
        // This is independent of gap — pure retry count in the window.
        // 3 retries = the channel IS struggling, period.
        $retryCeiling = match (true) {
            $requestsInWindow >= 6 => 5.0,    // 6+ retries → NUCLEAR, no discussion
            $requestsInWindow >= 5 => 8.0,    // 5 retries → NUCLEAR
            $requestsInWindow >= 4 => 15.0,   // 4 retries → BURST
            $requestsInWindow >= 3 => 20.0,   // 3 retries → BURST (was 55% → FREEZE!)
            $requestsInWindow >= 2 => 50.0,   // 2 retries → ESCALATING
            default                => 95.0,   // 1 request → no ceiling
        };

        // ── POLYMORPHIC: Freeze memory (learned from this channel's history) ──
        // If this channel had 4+ total hits, it has a history of retries
        // → tighten the ceiling further (it's a "known troubled channel")
        $freezeMemoryPenalty = 0.0;
        if ($ch['total_hits'] > 10) {
            $freezeMemoryPenalty = -10.0;  // Known frequent retrier → always push harder
        } elseif ($ch['total_hits'] > 5) {
            $freezeMemoryPenalty = -5.0;   // Moderate history
        }

        // ── CONDITION: Take the MOST AGGRESSIVE signal (min wins) ──
        $conditionPct = min($gapSignal, $retryCeiling) + $freezeMemoryPenalty;

        // ── Gap trend modifier ──
        $trendMod = match ($gapTrend) {
            'IMPROVING' =>  10.0,
            'DEGRADING' => -20.0,
            default     =>   0.0,
        };

        // ── Profile-aware push ──
        $profilePush = match ($ch['profile']) {
            'P0', 'P1' => -15.0,
            'P2'       => -10.0,
            'P3'       =>  -5.0,
            default    =>   0.0,
        };

        // ── Frequency reinforcement ──
        $freqPenalty = ($requestsInWindow > 3) ? (-5.0 * ($requestsInWindow - 3)) : 0.0;

        // Final: CONDITION-BASED + RETRY-CAPPED + POLYMORPHIC
        $bufferPct = min(95.0, max(5.0, $conditionPct + $trendMod + $profilePush + $freqPenalty));

        // ── Periodic cleanup of stale channels ──
        $lastCleanup = $telemetry['last_cleanup'] ?? 0;
        if (($now - $lastCleanup) > self::TELEMETRY_CLEANUP_INTERVAL) {
            self::cleanupTelemetry($telemetry, $now);
        }

        // Save state
        self::saveTelemetry($telemetry);

        // Log with full condition data for monitoring
        @file_put_contents('/var/log/iptv-ape/neuro_telemetry.log',
            sprintf("[%s] ch=%s reqs=%d gap=%.1fs gapSig=%.0f retryCeil=%.0f mem=%.0f cond=%.1f trend=%s(%+.1f) prof=%s(%+.1f) FINAL=%.1f%%\n",
                date('c'), $channelId, $requestsInWindow, $avgGap,
                $gapSignal, $retryCeiling, $freezeMemoryPenalty, $conditionPct,
                $gapTrend, $trendMod, $ch['profile'], $profilePush, $bufferPct),
            FILE_APPEND | LOCK_EX);

        return round($bufferPct, 1);
    }

    private static function loadTelemetry(): array
    {
        if (!file_exists(self::TELEMETRY_FILE)) {
            return ['channels' => [], 'last_cleanup' => time()];
        }
        $data = json_decode(file_get_contents(self::TELEMETRY_FILE), true);
        return is_array($data) ? $data : ['channels' => [], 'last_cleanup' => time()];
    }

    private static function saveTelemetry(array $telemetry): void
    {
        @file_put_contents(
            self::TELEMETRY_FILE,
            json_encode($telemetry, JSON_UNESCAPED_UNICODE),
            LOCK_EX
        );
    }

    private static function cleanupTelemetry(array &$telemetry, int $now): void
    {
        $staleThreshold = $now - 600; // Remove channels inactive > 10 minutes
        foreach ($telemetry['channels'] as $chId => $data) {
            $lastTs = end($data['timestamps']) ?: 0;
            if ($lastTs < $staleThreshold) {
                unset($telemetry['channels'][$chId]);
            }
        }

        // Enforce max channel limit (FIFO)
        if (count($telemetry['channels']) > self::TELEMETRY_MAX_CHANNELS) {
            $telemetry['channels'] = array_slice($telemetry['channels'], -self::TELEMETRY_MAX_CHANNELS, null, true);
        }

        $telemetry['last_cleanup'] = $now;
    }

    /**
     * Apply ModemPriorityManager enhancements.
     * Detects network type and enforces appropriate DSCP/priority.
     */
    private static function applyModemPriority(string $channelId, array $decision, array $result): array
    {
        // Build channel DNA subset for the modem manager
        $channelDna = [
            'id'                    => $channelId,
            'quality_profile'       => $decision['quality_profile'] ?? $decision['profile'] ?? 'P2',
            'circuit_breaker_state' => $decision['circuit_breaker_state'] ?? 'CLOSED',
        ];

        // Request info for network detection
        $requestInfo = [
            'user_agent'      => $_SERVER['HTTP_USER_AGENT'] ?? '',
            'connection_type' => $_SERVER['HTTP_X_CONNECTION_TYPE'] ?? '',
        ];

        // Analyze network and generate priority profile
        $profile = ModemPriorityManager::analyze($channelDna, $requestInfo);

        // Merge headers
        $result['exthttp'] = array_merge(
            $result['exthttp'],
            ModemPriorityManager::buildPriorityHeaders($profile)
        );

        // Merge APE tags
        $result['ape_tags'] = array_merge(
            $result['ape_tags'],
            ModemPriorityManager::buildApeTags($profile)
        );

        // Meta
        $result['meta']['network_type'] = $profile['network_type'];

        return $result;
    }

    /**
     * Apply ResilienceEngine data (existing motor).
     * Records the attempt result for circuit breaker tracking.
     */
    private static function applyResilienceEngine(string $channelId, array $decision, array $result): array
    {
        $url = $decision['url'] ?? '';
        if (empty($url)) return $result;

        // Build resilience tags
        $channelDna = array_merge($decision, ['channel_id' => $channelId]);
        $strategy = $decision['resilience_strategy'] ?? 'direct';
        $tags = ResilienceEngine::buildResilienceTags($channelDna, $url, $strategy);
        $result['ape_tags'] = array_merge($result['ape_tags'], $tags);

        // Build reconnect headers
        $reconnectHeaders = ResilienceEngine::buildReconnectConfig($channelDna);
        $result['exthttp'] = array_merge($result['exthttp'], $reconnectHeaders);

        return $result;
    }

    /**
     * Apply QoSQoEOrchestrator data (existing motor).
     * Adds QoE score and QoS headers.
     */
    private static function applyQoSQoE(string $channelId, array $decision, array $result): array
    {
        $channelDna = array_merge($decision, ['channel_id' => $channelId]);
        $qosResult = QoSQoEOrchestrator::optimize($channelDna);

        // Merge QoS response headers
        $result['exthttp'] = array_merge($result['exthttp'], $qosResult['response_headers'] ?? []);

        // Merge QoE APE tags
        $result['ape_tags'] = array_merge($result['ape_tags'], $qosResult['ape_tags'] ?? []);

        return $result;
    }

    /**
     * Apply AISuperResolutionEngine enhancements (v6.2).
     * Injects client-side visual metadata based on stream height.
     * Zero Proxy Policy: NEVER modifies the URL.
     */
    private static function applyAISuperRes(string $channelId, array $decision, array $result): array
    {
        // Height from profile config ($cfg['h']) and User-Agent for device detection
        $height = (int)($decision['height'] ?? $decision['h'] ?? 1080);
        $userAgent = (string)($decision['user_agent'] ?? $_SERVER['HTTP_USER_AGENT'] ?? '');

        // Inject with device-aware hints (v2.0: $userAgent enables Samsung/LG/Sony triggers)
        AISuperResolutionEngine::injectClientSideLogic($height, $result['exthttp'], $result['extvlcopt'], $userAgent);

        $result['meta']['ai_enhanced'] = true;
        $result['meta']['ai_input_height'] = $height;
        $result['meta']['ai_device'] = AISuperResolutionEngine::detectDevice($userAgent)['device'] ?? 'generic';

        return $result;
    }

    // ── Observability ─────────────────────────────────────────────────────

    /**
     * Non-blocking structured JSON log — 1 line per request.
     * Writes to /var/log/iptv-ape/shim_operations.log
     * Suppresses errors if log dir doesn't exist (graceful).
     */
    private static function logOperation(string $channelId, array $meta, float $startTime): void
    {
        $entry = json_encode([
            'ts'       => date('c'),
            'ch'       => $channelId,
            'modules'  => $meta['modules_loaded'] ?? [],
            'ms'       => round((microtime(true) - $startTime) * 1000, 2),
            'ai'       => $meta['ai_device'] ?? null,
            'buf'      => $meta['buffer_level'] ?? null,
            'net'      => $meta['network_type'] ?? null,
        ], JSON_UNESCAPED_SLASHES);

        @file_put_contents(
            '/var/log/iptv-ape/shim_operations.log',
            $entry . "\n",
            FILE_APPEND | LOCK_EX
        );
    }

    // ── Module Loading ─────────────────────────────────────────────────────

    /**
     * Load all available resilience modules.
     * Uses require_once and file_exists for graceful degradation.
     * Only loads once per PHP request (static flag).
     */
    private static function loadModules(): void
    {
        if (self::$modulesLoaded) {
            return;
        }
        self::$modulesLoaded = true;

        // New v6.0 motors
        $neuroPath = self::MODULES_DIR . '/neuro_buffer_controller.php';
        if (file_exists($neuroPath)) {
            require_once $neuroPath;
            self::$hasNeuroBuffer = class_exists('NeuroBufferController', false);
        }

        $modemPath = self::MODULES_DIR . '/modem_priority_manager.php';
        if (file_exists($modemPath)) {
            require_once $modemPath;
            self::$hasModemPriority = class_exists('ModemPriorityManager', false);
        }

        // Existing motors (already in cmaf_engine/modules/)
        $resiliencePath = self::MODULES_DIR . '/resilience_engine.php';
        if (file_exists($resiliencePath)) {
            require_once $resiliencePath;
            self::$hasResilience = class_exists('ResilienceEngine', false);
        }

        $qosPath = self::MODULES_DIR . '/qos_qoe_orchestrator.php';
        if (file_exists($qosPath)) {
            require_once $qosPath;
            self::$hasQoSQoE = class_exists('QoSQoEOrchestrator', false);
        }

        // v6.2: AI Super Resolution Engine (Edge visual enhancement)
        $aiPath = self::MODULES_DIR . '/ai_super_resolution_engine.php';
        if (file_exists($aiPath)) {
            require_once $aiPath;
            self::$hasAISuperRes = class_exists('AISuperResolutionEngine', false);
        }
    }
}
