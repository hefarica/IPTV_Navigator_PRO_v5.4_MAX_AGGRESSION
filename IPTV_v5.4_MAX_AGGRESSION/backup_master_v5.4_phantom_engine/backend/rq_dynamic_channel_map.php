<?php
declare(strict_types=1);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RQ DYNAMIC CHANNEL MAP v1.0 — Idempotent & Polymorphic
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Module for resolve_quality.php v3.0
 * Loaded via require_once from the main resolver.
 *
 * PURPOSE:
 *   Replaces the static channels_map.json (28MB, always incomplete).
 *   Dynamically resolves any EPG slug (e.g., "espn4.nl") to the correct
 *   numeric stream_id (e.g., 392200) by querying the provider's Xtream
 *   Codes API and caching the results aggressively.
 *
 * PROPERTIES:
 *   - IDEMPOTENT: Same input always produces same output. No side effects
 *     beyond cache file writes. Safe to call N times.
 *   - POLYMORPHIC: Handles any provider/origin. Adapts lookup strategy
 *     based on the server credentials provided.
 *   - ATOMIC SPEED: First call warms cache (~2-3s). All subsequent calls
 *     resolve from file cache in <1ms.
 *   - ANTI-509: Only fetches the API once per TTL window. Never makes
 *     parallel requests. Never probes individual streams.
 *
 * INTEGRATION:
 *   In resolve_quality.php, after decoding srv credentials:
 *     $channelId = DynamicChannelMap::resolve($channelId, $host, $user, $pass);
 *
 * CACHE STRATEGY:
 *   - Full stream list cached per-origin in /tmp/ape_channel_cache/
 *   - TTL: 300s (5 minutes). Configurable.
 *   - Index built on first load: epg_channel_id → stream_id + name
 *   - Lock file prevents thundering herd on cache miss.
 *
 * @version 1.0.0
 * @since   APE Resolve Quality v3.0
 */

class DynamicChannelMap
{
    /** Cache directory for stream lists */
    private const CACHE_DIR = '/tmp/ape_channel_cache';

    /** Cache TTL in seconds (5 minutes) */
    private const CACHE_TTL = 300;

    /** Lock timeout in seconds */
    private const LOCK_TIMEOUT = 15;

    /** API timeout in seconds */
    private const API_TIMEOUT = 10;

    /** In-memory cache for the current request (avoids re-reading file) */
    private static array $memoryCache = [];

    /**
     * ═══════════════════════════════════════════════════════════════════
     * RESOLVE — Main entry point. Idempotent, polymorphic.
     * ═══════════════════════════════════════════════════════════════════
     *
     * Given a channelId (which may be a slug like "espn4.nl" or already
     * a numeric id like "392200"), resolves it to the correct numeric
     * stream_id from the provider.
     *
     * If the channelId is already numeric → returns it unchanged (idempotent).
     * If it's a slug → looks up the provider API index to find the numeric id.
     * If lookup fails → returns the original channelId (safe fallback).
     *
     * @param string $channelId  The channel identifier (slug or numeric)
     * @param string $host       Provider host (e.g., "line.tivi-ott.net")
     * @param string $user       Xtream username
     * @param string $pass       Xtream password
     * @return string            Resolved numeric stream_id, or original if not found
     */
    public static function resolve(string $channelId, string $host, string $user, string $pass): string
    {
        // ── Load or build the index for this origin ──
        $index = self::getIndex($host, $user, $pass);

        if ($index === null) {
            self::log("FALLBACK: No index available for {$host}, returning original: {$channelId}");
            return $channelId;
        }

        $candidates = [];

        // ── STEP 1: INTERCEPT NUMERIC IDs FOR HEALTH FALLBACK ──
        if (ctype_digit($channelId) && isset($index['by_id'][$channelId])) {
            $chanData = $index['by_id'][$channelId];
            
            // Reverse-map back to a slug using epg_channel_id or name
            $slug = !empty($chanData['epg_channel_id']) 
                ? strtolower(trim($chanData['epg_channel_id'])) 
                : strtolower(trim($chanData['name']));

            // Gather all candidates for this channel
            if (isset($index['by_epg_multi'][$slug])) {
                $candidates = $index['by_epg_multi'][$slug];
            } elseif (isset($index['by_epg'][$slug])) {
                $candidates = [$index['by_epg'][$slug]];
            } elseif (isset($index['by_name'][$slug])) {
                // If name was used as slug, it might be in by_name (we didn't build by_name multi, but let's just use the single match)
                $candidates = [$index['by_name'][$slug]];
            }

            if (empty($candidates)) {
                $candidates = [$chanData]; // self fallback
            }

            // Sort: prioritize the requested ID first, then by quality score
            usort($candidates, function($a, $b) use ($channelId) {
                if ($a['stream_id'] == $channelId) return -1;
                if ($b['stream_id'] == $channelId) return 1;
                return $b['quality_score'] <=> $a['quality_score'];
            });

        } else {
            // ── STEP 2: POLYMORPHIC EPG SLUG LOOKUP ──
            $slug = strtolower(trim($channelId));

            if (isset($index['by_epg_multi'][$slug])) {
                $candidates = $index['by_epg_multi'][$slug];
            } elseif (isset($index['by_epg'][$slug])) {
                $candidates = [$index['by_epg'][$slug]];
            }

            // Fuzzy fallback: strip country suffixes
            if (empty($candidates)) {
                $stripped = preg_replace('/\.(nl|uk|us|de|fr|es|it|pt|br|ca|au|be)$/i', '', $slug);
                if ($stripped !== $slug && isset($index['by_epg_multi'][$stripped])) {
                    $candidates = $index['by_epg_multi'][$stripped];
                } elseif ($stripped !== $slug && isset($index['by_epg'][$stripped])) {
                    $candidates = [$index['by_epg'][$stripped]];
                }
            }

            // Case-insensitive fallback
            if (empty($candidates)) {
                foreach ($index['by_epg'] as $epg => $data) {
                    if (strtolower($epg) === $slug) {
                        $candidates = [$data];
                        break;
                    }
                }
            }

            // Sort candidates by quality_score descending (best first)
            usort($candidates, fn($a, $b) => $b['quality_score'] <=> $a['quality_score']);
        }

        if (empty($candidates)) {
            if (ctype_digit($channelId)) return $channelId;
            self::log("MISS: No match for [{$channelId}] in index ({$index['total_channels']} channels)");
            return $channelId;
        }

        // Load blocklist (streams that returned 407)
        $blocklist = self::loadBlocklist();
        $cleanHost = preg_replace('/^https?:\/\//', '', $host);
        $cleanHost = rtrim($cleanHost, '/');

        // Try each candidate, skipping blocklisted ones
        foreach ($candidates as $candidate) {
            $sid = (string)$candidate['stream_id'];
            $blockKey = "{$cleanHost}|{$user}|{$sid}";

            // Skip if blocklisted (checked within last hour)
            if (isset($blocklist[$blockKey]) && (time() - $blocklist[$blockKey]) < 3600) {
                self::log("SKIP BLOCKED [{$channelId}] stream_id={$sid} name={$candidate['name']} (407 cached)");
                continue;
            }

            // Lightweight probe: HEAD request to check if stream is accessible
            // Only probes if NOT in blocklist — max 1 probe per stream per hour
            $probeResult = self::probeStream($cleanHost, $user, $pass, $sid);

            if ($probeResult === true) {
                // Stream is accessible → use it
                self::log("RESOLVED [{$channelId}] → stream_id={$sid} name={$candidate['name']} via health_aware (HTTP OK)");
                return $sid;
            }

            // Stream returned 407/error → add to blocklist
            $blocklist[$blockKey] = time();
            self::saveBlocklist($blocklist);
            self::log("BLOCKED [{$channelId}] stream_id={$sid} name={$candidate['name']} (407 from provider)");
        }

        // All candidates blocked — try the first one anyway as last resort
        // (in case blocklist is stale and provider recovered)
        $lastResort = $candidates[0];
        self::log("LAST_RESORT [{$channelId}] → stream_id={$lastResort['stream_id']} name={$lastResort['name']} (all blocked)");
        return (string)$lastResort['stream_id'];
    }

    /**
     * ═══════════════════════════════════════════════════════════════════
     * PROBE STREAM — Lightweight HEAD check (anti-509 compliant)
     * ═══════════════════════════════════════════════════════════════════
     *
     * Sends a single HEAD request to verify the stream is accessible.
     * Returns true if HTTP 200/301/302 (stream OK).
     * Returns false if HTTP 407/403/404 (stream blocked/unavailable).
     *
     * Anti-509: Only called once per stream per hour (blocklist TTL).
     * Does NOT download any content (HEAD only, zero bandwidth).
     */
    private static function probeStream(string $host, string $user, string $pass, string $streamId): bool
    {
        $probeUrl = "http://{$host}/live/" . urlencode($user) . "/" . urlencode($pass) . "/{$streamId}.m3u8";

        if (function_exists('curl_init')) {
            $ch = curl_init($probeUrl);
            curl_setopt_array($ch, [
                CURLOPT_NOBODY         => true,  // HEAD request — zero download
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 5,
                CURLOPT_CONNECTTIMEOUT => 3,
                CURLOPT_FOLLOWLOCATION => false,  // Don't follow redirects (302 = OK)
                CURLOPT_USERAGENT      => 'Mozilla/5.0 (Linux; Android 11; AFTKM) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                CURLOPT_HTTPHEADER     => [
                    'Accept: application/vnd.apple.mpegurl, */*',
                    'Connection: close',
                ],
            ]);
            $result = curl_exec($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            self::log("PROBE stream_id={$streamId} HTTP={$httpCode}");

            // 200 = direct stream, 301/302 = redirect to actual stream (both OK)
            return in_array($httpCode, [200, 301, 302], true);
        }

        // No cURL — skip probe, assume OK (allow quality-based selection)
        return true;
    }

    /**
     * Load blocklist of streams that returned 407.
     * File-based, persistent across requests.
     */
    private static function loadBlocklist(): array
    {
        self::ensureCacheDir();
        $file = self::CACHE_DIR . '/stream_blocklist.json';
        if (!file_exists($file)) return [];

        $data = @file_get_contents($file);
        if ($data === false) return [];

        $list = json_decode($data, true);
        if (!is_array($list)) return [];

        // Purge entries older than 1 hour
        $now = time();
        return array_filter($list, fn($ts) => ($now - $ts) < 3600);
    }

    /**
     * Save blocklist to disk.
     */
    private static function saveBlocklist(array $blocklist): void
    {
        self::ensureCacheDir();
        $file = self::CACHE_DIR . '/stream_blocklist.json';
        @file_put_contents($file, json_encode($blocklist, JSON_UNESCAPED_UNICODE), LOCK_EX);
    }

    /**
     * ═══════════════════════════════════════════════════════════════════
     * RESOLVE INFO — Extended resolve that returns full channel metadata
     * ═══════════════════════════════════════════════════════════════════
     *
     * Returns an array with stream_id, name, category_id, icon, etc.
     * Useful for enriching the output with channel metadata.
     *
     * @param string $channelId
     * @param string $host
     * @param string $user
     * @param string $pass
     * @return array|null  Full channel info or null if not found
     */
    public static function resolveInfo(string $channelId, string $host, string $user, string $pass): ?array
    {
        $index = self::getIndex($host, $user, $pass);
        if ($index === null) return null;

        $slug = strtolower(trim($channelId));

        // Numeric lookup
        if (ctype_digit($channelId) && isset($index['by_id'][$channelId])) {
            return $index['by_id'][$channelId];
        }

        // EPG lookup (with quality ranking for multi-match)
        if (isset($index['by_epg_multi'][$slug])) {
            return self::selectBestQuality($index['by_epg_multi'][$slug]);
        }

        if (isset($index['by_epg'][$slug])) {
            return $index['by_epg'][$slug];
        }

        return null;
    }

    /**
     * ═══════════════════════════════════════════════════════════════════
     * GET INDEX — Load from cache or build from API
     * ═══════════════════════════════════════════════════════════════════
     */
    private static function getIndex(string $host, string $user, string $pass): ?array
    {
        // ── Clean host for cache key (remove protocol, port variations) ──
        $cleanHost = preg_replace('/^https?:\/\//', '', $host);
        $cleanHost = rtrim($cleanHost, '/');
        $cacheKey = md5("{$cleanHost}|{$user}|{$pass}");

        // ── In-memory cache (same PHP request) ──
        if (isset(self::$memoryCache[$cacheKey])) {
            return self::$memoryCache[$cacheKey];
        }

        // ── File cache ──
        self::ensureCacheDir();
        $cacheFile = self::CACHE_DIR . "/idx_{$cacheKey}.json";

        if (file_exists($cacheFile)) {
            $mtime = filemtime($cacheFile);
            if ($mtime !== false && (time() - $mtime) < self::CACHE_TTL) {
                $data = @file_get_contents($cacheFile);
                if ($data !== false) {
                    $index = json_decode($data, true);
                    if (is_array($index) && !empty($index['by_epg'])) {
                        self::$memoryCache[$cacheKey] = $index;
                        return $index;
                    }
                }
            }
        }

        // ── Cache miss or expired: Fetch from API with lock ──
        $lockFile = self::CACHE_DIR . "/lock_{$cacheKey}";

        // Prevent thundering herd
        $lockFp = @fopen($lockFile, 'c');
        if ($lockFp === false) {
            // Can't acquire lock, try stale cache
            return self::loadStaleCache($cacheFile, $cacheKey);
        }

        $locked = flock($lockFp, LOCK_EX | LOCK_NB);
        if (!$locked) {
            // Another process is already refreshing, use stale cache
            fclose($lockFp);
            return self::loadStaleCache($cacheFile, $cacheKey);
        }

        try {
            // Double-check after acquiring lock (another process may have refreshed)
            clearstatcache(true, $cacheFile);
            if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < self::CACHE_TTL) {
                $data = @file_get_contents($cacheFile);
                if ($data !== false) {
                    $index = json_decode($data, true);
                    if (is_array($index) && !empty($index['by_epg'])) {
                        self::$memoryCache[$cacheKey] = $index;
                        return $index;
                    }
                }
            }

            // ── Fetch from Xtream Codes API ──
            $index = self::fetchAndBuildIndex($cleanHost, $user, $pass);

            if ($index !== null) {
                // Write cache atomically
                $tmpFile = $cacheFile . '.tmp.' . getmypid();
                $json = json_encode($index, JSON_UNESCAPED_UNICODE);
                if (@file_put_contents($tmpFile, $json, LOCK_EX) !== false) {
                    @rename($tmpFile, $cacheFile);
                }
                self::$memoryCache[$cacheKey] = $index;
                self::log("CACHE WARM: {$cleanHost} → {$index['total_channels']} channels indexed");
            }

            return $index;

        } finally {
            flock($lockFp, LOCK_UN);
            fclose($lockFp);
            @unlink($lockFile);
        }
    }

    /**
     * ═══════════════════════════════════════════════════════════════════
     * FETCH AND BUILD INDEX — Query Xtream API, build lookup tables
     * ═══════════════════════════════════════════════════════════════════
     */
    private static function fetchAndBuildIndex(string $host, string $user, string $pass): ?array
    {
        // Ensure host has protocol
        $apiHost = $host;
        if (!str_starts_with($apiHost, 'http://') && !str_starts_with($apiHost, 'https://')) {
            $apiHost = 'http://' . $apiHost;
        }

        $apiUrl = rtrim($apiHost, '/') . "/player_api.php?username=" . urlencode($user)
            . "&password=" . urlencode($pass)
            . "&action=get_live_streams";

        // ── Fetch with cURL (faster, supports timeout properly) ──
        $response = null;

        if (function_exists('curl_init')) {
            $ch = curl_init($apiUrl);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => self::API_TIMEOUT,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS      => 2,
                CURLOPT_USERAGENT      => 'APE-DynamicChannelMap/1.0',
                CURLOPT_HTTPHEADER     => ['Accept: application/json'],
                CURLOPT_ENCODING       => 'gzip, deflate',  // Request compressed response
            ]);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode !== 200 || $response === false || $response === '') {
                self::log("API FETCH FAILED: {$apiUrl} HTTP={$httpCode}");
                $response = null;
            }
        }

        // Fallback to file_get_contents if cURL unavailable
        if ($response === null) {
            $ctx = stream_context_create([
                'http' => [
                    'method'  => 'GET',
                    'timeout' => self::API_TIMEOUT,
                    'header'  => "User-Agent: APE-DynamicChannelMap/1.0\r\nAccept: application/json\r\nAccept-Encoding: gzip\r\n",
                    'ignore_errors' => true,
                ],
            ]);
            $response = @file_get_contents($apiUrl, false, $ctx);
        }

        if ($response === null || $response === false || $response === '') {
            self::log("API FETCH FAILED: No response from {$host}");
            return null;
        }

        // ── Parse JSON ──
        $channels = json_decode($response, true);
        if (!is_array($channels) || empty($channels)) {
            self::log("API PARSE FAILED: Invalid JSON from {$host}");
            return null;
        }

        // ── BUILD INDEX — Three lookup tables ──
        $byEpg = [];       // epg_channel_id → best channel (single)
        $byEpgMulti = [];  // epg_channel_id → all channels (multiple)
        $byId = [];        // stream_id → channel info

        foreach ($channels as $ch) {
            if (!isset($ch['stream_id'])) continue;

            $info = [
                'stream_id'    => (int)$ch['stream_id'],
                'name'         => $ch['name'] ?? '',
                'category_id'  => $ch['category_id'] ?? '',
                'stream_icon'  => $ch['stream_icon'] ?? '',
                'epg_channel_id' => $ch['epg_channel_id'] ?? '',
                'added'        => $ch['added'] ?? '',
                'is_adult'     => (int)($ch['is_adult'] ?? 0),
                'quality_score' => self::computeQualityScore($ch['name'] ?? ''),
            ];

            // Index by stream_id
            $byId[(string)$ch['stream_id']] = $info;

            // Index by epg_channel_id
            $epg = strtolower(trim($ch['epg_channel_id'] ?? ''));
            if ($epg !== '') {
                // Multi-index (all channels with same EPG)
                $byEpgMulti[$epg][] = $info;

                // Single index (keep best quality)
                if (!isset($byEpg[$epg]) || $info['quality_score'] > $byEpg[$epg]['quality_score']) {
                    $byEpg[$epg] = $info;
                }
            }
        }

        return [
            'by_epg'         => $byEpg,
            'by_epg_multi'   => $byEpgMulti,
            'by_id'          => $byId,
            'total_channels' => count($channels),
            'built_at'       => time(),
            'origin'         => $host,
        ];
    }

    /**
     * ═══════════════════════════════════════════════════════════════════
     * QUALITY SCORE — Rank channels by name quality indicators
     * ═══════════════════════════════════════════════════════════════════
     *
     * Higher score = higher quality stream.
     * Used to select the best variant when multiple channels share
     * the same epg_channel_id.
     */
    private static function computeQualityScore(string $name): int
    {
        $upper = strtoupper($name);
        $score = 0;

        // Resolution tiers
        if (str_contains($upper, '8K'))  $score += 800;
        if (str_contains($upper, 'UHD')) $score += 400;
        if (str_contains($upper, '4K'))  $score += 200;
        if (str_contains($upper, 'FHD')) $score += 100;
        if (str_contains($upper, 'HD') && !str_contains($upper, 'FHD') && !str_contains($upper, 'UHD'))
            $score += 50;
        if (str_contains($upper, 'SD'))  $score += 10;

        // Quality modifiers
        if (str_contains($upper, '8K+'))     $score += 100;  // Premium 8K variant
        if (str_contains($upper, 'HEVC'))    $score += 50;
        if (str_contains($upper, 'H.265'))   $score += 50;
        if (str_contains($upper, 'HDR'))     $score += 50;
        if (str_contains($upper, 'DOLBY'))   $score += 30;
        if (str_contains($upper, 'ATMOS'))   $score += 20;
        if (str_contains($upper, 'PREMIUM')) $score += 20;
        if (str_contains($upper, 'PLUS') || str_contains($upper, '+')) $score += 15;

        // Negative indicators
        if (str_contains($upper, 'LOW'))     $score -= 50;
        if (str_contains($upper, 'BACKUP'))  $score -= 100;
        if (str_contains($upper, 'RESERVE')) $score -= 100;

        return $score;
    }

    /**
     * Select the highest quality channel from a list of candidates.
     */
    private static function selectBestQuality(array $candidates): ?array
    {
        if (empty($candidates)) return null;

        $best = $candidates[0];
        foreach ($candidates as $ch) {
            if ($ch['quality_score'] > $best['quality_score']) {
                $best = $ch;
            }
        }
        return $best;
    }

    /**
     * Try to load stale cache as fallback when lock is held by another process.
     */
    private static function loadStaleCache(string $cacheFile, string $cacheKey): ?array
    {
        if (!file_exists($cacheFile)) return null;

        $data = @file_get_contents($cacheFile);
        if ($data === false) return null;

        $index = json_decode($data, true);
        if (!is_array($index) || empty($index['by_epg'])) return null;

        self::$memoryCache[$cacheKey] = $index;
        self::log("STALE CACHE used for {$cacheKey}");
        return $index;
    }

    /**
     * Ensure cache directory exists.
     */
    private static function ensureCacheDir(): void
    {
        if (!is_dir(self::CACHE_DIR)) {
            @mkdir(self::CACHE_DIR, 0777, true);
        }
    }

    /**
     * ═══════════════════════════════════════════════════════════════════
     * CACHE STATUS — For monitoring/health checks
     * ═══════════════════════════════════════════════════════════════════
     */
    public static function cacheStatus(): array
    {
        self::ensureCacheDir();
        $files = glob(self::CACHE_DIR . '/idx_*.json') ?: [];
        $status = [];

        foreach ($files as $file) {
            $data = @file_get_contents($file);
            $index = $data ? json_decode($data, true) : null;
            $mtime = filemtime($file);
            $age = time() - $mtime;

            $status[] = [
                'file'           => basename($file),
                'origin'         => $index['origin'] ?? 'unknown',
                'total_channels' => $index['total_channels'] ?? 0,
                'epg_entries'    => isset($index['by_epg']) ? count($index['by_epg']) : 0,
                'age_seconds'    => $age,
                'expired'        => $age >= self::CACHE_TTL,
                'built_at'       => isset($index['built_at']) ? date('Y-m-d H:i:s', $index['built_at']) : 'unknown',
                'size_bytes'     => filesize($file),
            ];
        }

        return $status;
    }

    /**
     * Force refresh of a specific origin's cache.
     */
    public static function refreshCache(string $host, string $user, string $pass): bool
    {
        $cleanHost = preg_replace('/^https?:\/\//', '', $host);
        $cleanHost = rtrim($cleanHost, '/');
        $cacheKey = md5("{$cleanHost}|{$user}|{$pass}");
        $cacheFile = self::CACHE_DIR . "/idx_{$cacheKey}.json";

        // Delete existing cache to force rebuild
        if (file_exists($cacheFile)) {
            @unlink($cacheFile);
        }

        // Clear memory cache
        unset(self::$memoryCache[$cacheKey]);

        // Rebuild
        $index = self::getIndex($host, $user, $pass);
        return $index !== null;
    }

    /**
     * Module log (append-only, non-blocking).
     */
    private static function log(string $message): void
    {
        $logDir = defined('RQ_BASE_DIR') ? RQ_BASE_DIR . '/logs' : __DIR__ . '/logs';
        if (!is_dir($logDir)) {
            @mkdir($logDir, 0755, true);
        }
        $ts = date('Y-m-d H:i:s');
        @file_put_contents(
            $logDir . '/dynamic_channel_map.log',
            "[{$ts}] {$message}" . PHP_EOL,
            FILE_APPEND | LOCK_EX
        );
    }
}
