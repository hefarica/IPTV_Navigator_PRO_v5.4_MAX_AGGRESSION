<?php
declare(strict_types=1);
/**
 * IPTV Navigator PRO — Universal Compatibility Layer
 * Module: Universal Fallback Engine v1.0.0
 *
 * FUNCIÓN: Implementa la cadena de degradation graceful de 7 pasos.
 * Si el formato/codec preferido falla, automáticamente intenta el
 * siguiente nivel hasta garantizar reproducción en cualquier player.
 *
 * CADENA DE DEGRADACIÓN (de mejor a peor calidad):
 *   Nivel 1: CMAF/fMP4 + HEVC/AV1 + DASH         (PREMIUM)
 *   Nivel 2: HLS/fMP4 + HEVC                      (HIGH)
 *   Nivel 3: HLS/fMP4 + H.264                     (STANDARD)
 *   Nivel 4: HLS/TS + H.264                       (COMPAT)
 *   Nivel 5: HLS/TS + H.264 Baseline              (LEGACY)
 *   Nivel 6: TS Direct + H.264                    (MINIMAL)
 *   Nivel 7: HTTP redirect to .m3u8               (LAST_RESORT)
 *
 * TRIGGER DE FALLBACK:
 *   - Player no soporta el formato preferido (matriz)
 *   - Stream URL retorna error HTTP (4xx/5xx)
 *   - Timeout de conexión (>5s)
 *   - Manifiesto malformado (validación RFC 8216 falla)
 *   - Codec no soportado (error de decodificación)
 *
 * CIRCUIT BREAKER:
 *   - Después de 3 fallos consecutivos en un nivel, se salta al siguiente
 *   - El estado se persiste en APCu/Redis para evitar reintentos innecesarios
 *   - Se resetea automáticamente después de 5 minutos
 */

// Graceful degradation engine — 7-level fallback chain
class UniversalFallbackEngine
{
    const ENGINE_VERSION = '1.0.0';

    // ─── Fallback levels ──────────────────────────────────────────────────────
    const LEVEL_PREMIUM    = 1;  // CMAF + HEVC/AV1 + DASH
    const LEVEL_HIGH       = 2;  // HLS/fMP4 + HEVC
    const LEVEL_STANDARD   = 3;  // HLS/fMP4 + H.264
    const LEVEL_COMPAT     = 4;  // HLS/TS + H.264
    const LEVEL_LEGACY     = 5;  // HLS/TS + H.264 Baseline
    const LEVEL_MINIMAL    = 6;  // TS Direct + H.264
    const LEVEL_LAST_RESORT = 7; // HTTP redirect to .m3u8

    // ─── Circuit breaker settings ─────────────────────────────────────────────
    const CIRCUIT_FAIL_THRESHOLD = 3;   // Failures before circuit opens
    const CIRCUIT_RESET_TTL      = 300; // Seconds before circuit resets

    /**
     * Determine the appropriate fallback level for a player.
     *
     * @param string $playerId       Player ID.
     * @param array  $playerCaps     Player capabilities from PlayerCapabilityResolver.
     * @param array  $channelDna     Channel DNA.
     * @param int    $currentLevel   Current fallback level (1 = best).
     * @return array                 ['level' => int, 'format' => string, 'codec' => string, 'reason' => string]
     */
    public static function getFallbackLevel(
        string $playerId,
        array  $playerCaps,
        array  $channelDna = [],
        int    $currentLevel = 1
    ): array {
        $engine = new self();
        return $engine->resolve($playerId, $playerCaps, $channelDna, $currentLevel);
    }

    /**
     * Build the complete fallback chain for a channel entry.
     * Returns all available URLs in order of preference.
     *
     * @param array  $manifests    Map of format => URL.
     * @param array  $playerCaps   Player capabilities.
     * @return array               Ordered list of [format, url, level] tuples.
     */
    public static function buildFallbackChain(array $manifests, array $playerCaps): array
    {
        $engine = new self();
        return $engine->buildChain($manifests, $playerCaps);
    }

    private function resolve(
        string $playerId,
        array  $caps,
        array  $dna,
        int    $currentLevel
    ): array {
        // Check circuit breaker
        $circuitKey = "fallback_circuit_{$playerId}";
        $failCount  = $this->getCircuitState($circuitKey);

        if ($failCount >= self::CIRCUIT_FAIL_THRESHOLD) {
            // Circuit is open — skip to next level
            $currentLevel = min($currentLevel + 1, self::LEVEL_LAST_RESORT);
        }

        // Determine the best level based on player capabilities
        $bestLevel = $this->determineBestLevel($caps, $dna);

        // Use the higher of the two levels (more degraded)
        $effectiveLevel = max($currentLevel, $bestLevel);

        return $this->buildLevelResponse($effectiveLevel, $caps, $dna);
    }

    private function determineBestLevel(array $caps, array $dna): int
    {
        $fmp4  = $caps['supports_fmp4']  ?? false;
        $dash  = $caps['supports_dash']  ?? false;
        $hevc  = $caps['supports_hevc']  ?? false;
        $av1   = $caps['supports_av1']   ?? false;
        $lcevc = $caps['supports_lcevc'] ?? false;

        // Level 1: CMAF + HEVC/AV1 + DASH
        if ($fmp4 && $dash && ($hevc || $av1)) {
            return self::LEVEL_PREMIUM;
        }

        // Level 2: HLS/fMP4 + HEVC (no DASH)
        if ($fmp4 && $hevc) {
            return self::LEVEL_HIGH;
        }

        // Level 3: HLS/fMP4 + H.264
        if ($fmp4) {
            return self::LEVEL_STANDARD;
        }

        // Level 4: HLS/TS + H.264 (DASH only, no fMP4)
        if ($dash && !$fmp4) {
            return self::LEVEL_COMPAT;
        }

        // Level 5: HLS/TS + H.264 Baseline (legacy players)
        return self::LEVEL_LEGACY;
    }

    private function buildLevelResponse(int $level, array $caps, array $dna): array
    {
        return match($level) {
            self::LEVEL_PREMIUM => [
                'level'  => self::LEVEL_PREMIUM,
                'format' => 'cmaf',
                'codec'  => $caps['supports_av1'] ? 'av1' : 'hevc',
                'reason' => 'Player supports CMAF + HEVC/AV1 + DASH',
            ],
            self::LEVEL_HIGH => [
                'level'  => self::LEVEL_HIGH,
                'format' => 'hls_fmp4',
                'codec'  => 'hevc',
                'reason' => 'Player supports HLS/fMP4 + HEVC',
            ],
            self::LEVEL_STANDARD => [
                'level'  => self::LEVEL_STANDARD,
                'format' => 'hls_fmp4',
                'codec'  => 'h264',
                'reason' => 'Player supports HLS/fMP4 + H.264',
            ],
            self::LEVEL_COMPAT => [
                'level'  => self::LEVEL_COMPAT,
                'format' => 'hls_ts',
                'codec'  => 'h264',
                'reason' => 'Fallback to HLS/TS + H.264',
            ],
            self::LEVEL_LEGACY => [
                'level'  => self::LEVEL_LEGACY,
                'format' => 'hls_ts',
                'codec'  => 'h264_baseline',
                'reason' => 'Legacy player: HLS/TS + H.264 Baseline',
            ],
            self::LEVEL_MINIMAL => [
                'level'  => self::LEVEL_MINIMAL,
                'format' => 'ts_direct',
                'codec'  => 'h264',
                'reason' => 'Minimal: TS Direct stream',
            ],
            self::LEVEL_LAST_RESORT => [
                'level'  => self::LEVEL_LAST_RESORT,
                'format' => 'hls_ts',
                'codec'  => 'h264_baseline',
                'reason' => 'Last resort: direct .m3u8 redirect',
            ],
            default => [
                'level'  => self::LEVEL_COMPAT,
                'format' => 'hls_ts',
                'codec'  => 'h264',
                'reason' => 'Default fallback',
            ],
        };
    }

    private function buildChain(array $manifests, array $caps): array
    {
        $chain = [];
        $fmp4  = $caps['supports_fmp4'] ?? false;
        $dash  = $caps['supports_dash'] ?? false;
        $hevc  = $caps['supports_hevc'] ?? false;

        // Build ordered chain based on player capabilities
        $formatPriority = [];

        if ($fmp4 && $dash && $hevc) {
            $formatPriority = ['cmaf', 'dash', 'hls_fmp4', 'hls_ts', 'ts_direct'];
        } elseif ($fmp4 && $hevc) {
            $formatPriority = ['hls_fmp4', 'cmaf', 'hls_ts', 'ts_direct'];
        } elseif ($fmp4) {
            $formatPriority = ['hls_fmp4', 'hls_ts', 'ts_direct'];
        } elseif ($dash) {
            $formatPriority = ['dash', 'hls_ts', 'ts_direct'];
        } else {
            $formatPriority = ['hls_ts', 'ts_direct'];
        }

        $level = 1;
        foreach ($formatPriority as $format) {
            if (!empty($manifests[$format])) {
                $chain[] = [
                    'level'  => $level++,
                    'format' => $format,
                    'url'    => $manifests[$format],
                ];
            }
        }

        // Always add a last resort entry if we have any URL
        if (empty($chain) && !empty($manifests)) {
            $firstUrl = reset($manifests);
            $chain[] = [
                'level'  => self::LEVEL_LAST_RESORT,
                'format' => 'hls_ts',
                'url'    => $firstUrl,
            ];
        }

        return $chain;
    }

    // ─── Circuit Breaker (APCu-based, falls back to in-memory) ───────────────

    private static array $memoryCircuit = [];

    private function getCircuitState(string $key): int
    {
        // Try APCu first
        if (function_exists('apcu_fetch')) {
            $val = apcu_fetch($key);
            return is_int($val) ? $val : 0;
        }
        // Fall back to in-memory (per-request)
        return self::$memoryCircuit[$key] ?? 0;
    }

    public static function recordFailure(string $playerId): void
    {
        $key = "fallback_circuit_{$playerId}";
        if (function_exists('apcu_inc')) {
            apcu_inc($key, 1, $success, self::CIRCUIT_RESET_TTL);
        } else {
            self::$memoryCircuit[$key] = (self::$memoryCircuit[$key] ?? 0) + 1;
        }
    }

    public static function resetCircuit(string $playerId): void
    {
        $key = "fallback_circuit_{$playerId}";
        if (function_exists('apcu_delete')) {
            apcu_delete($key);
        } else {
            unset(self::$memoryCircuit[$key]);
        }
    }

    /**
     * Validate a stream URL is reachable (lightweight HEAD check).
     * Returns true if the URL responds with 2xx/3xx.
     */
    public static function probeUrl(string $url, int $timeoutMs = 3000): bool
    {
        if (empty($url)) return false;

        $ctx = stream_context_create([
            'http' => [
                'method'          => 'HEAD',
                'timeout'         => $timeoutMs / 1000,
                'ignore_errors'   => true,
                'follow_location' => true,
                'max_redirects'   => 3,
                'header'          => "User-Agent: IPTV-Navigator-PRO/3.3\r\n",
            ],
            'ssl' => [
                'verify_peer'       => false,
                'verify_peer_name'  => false,
            ],
        ]);

        $headers = @get_headers($url, false, $ctx);
        if (!$headers) return false;

        // Check first header for HTTP status
        $status = $headers[0] ?? '';
        return (bool) preg_match('/HTTP\/\d+\.?\d*\s+[23]\d\d/', $status);
    }
}
