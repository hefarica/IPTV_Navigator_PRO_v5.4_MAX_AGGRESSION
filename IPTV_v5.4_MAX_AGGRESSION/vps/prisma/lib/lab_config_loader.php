<?php
declare(strict_types=1);

/**
 * APE LAB-SYNC v2.0 — LabConfigLoader
 *
 * Lee los 6 JSONs de /var/www/html/prisma/config/ (exportados por LAB Excel
 * exportPrismaConfig macro). Cache estática per-request + TTL filesystem 300s.
 * Fallbacks defensivos: si JSON falta o está corrupto, devuelve defaults seguros
 * que mantienen el sistema operativo (NO romper producción si LAB no exporta).
 *
 * Doctrina: LAB Excel es SSOT. Este loader es la puerta de entrada del VPS al SSOT.
 * Cualquier componente PHP que necesite parámetros de configuración debe pasar por aquí.
 *
 * Cero hardcoded: si quieres cambiar el piso 4K de 15M a 17M, lo cambias en LAB Excel,
 * exportPrismaConfig regenera el JSON, este loader lo recoge en el próximo cache TTL.
 */

class LabConfigLoader
{
    const CONFIG_DIR = '/var/www/html/prisma/config';
    const CACHE_TTL_SECONDS = 300;

    private static array $cache = [];
    private static array $cacheTs = [];

    /** Lee floor_lock_config.json — devuelve array con keys floor_lock_min_bandwidth_pX */
    public static function floorLock(): array
    {
        return self::load('floor_lock_config.json', self::defaultsFloorLock());
    }

    /** Lee profile_boost_multipliers.json — devuelve array con profiles{P0..P5} */
    public static function profileBoost(): array
    {
        return self::load('profile_boost_multipliers.json', self::defaultsProfileBoost());
    }

    /** Lee channels_prisma_dna.json — devuelve array con channels{} y channel_defaults_by_profile{} */
    public static function channelsDna(): array
    {
        return self::load('channels_prisma_dna.json', self::defaultsChannelsDna());
    }

    /** Lee sentinel_providers_map.json — devuelve array con providers{} y global_thresholds */
    public static function sentinelProviders(): array
    {
        return self::load('sentinel_providers_map.json', self::defaultsSentinelProviders());
    }

    /** Lee telescope_thresholds.json — devuelve array con predictive_triggers, qoe_score_weights, etc. */
    public static function telescopeThresholds(): array
    {
        return self::load('telescope_thresholds.json', self::defaultsTelescopeThresholds());
    }

    /** Lee enterprise_doctrine_manifest.json — devuelve array con compliance + components_deployed/pending */
    public static function manifest(): array
    {
        return self::load('enterprise_doctrine_manifest.json', self::defaultsManifest());
    }

    /**
     * Lee m3u8_directives_config.json — directivas Disney-Grade LL-HLS/ABR globales.
     * Mismos valores para todos los perfiles P0-P5 (no per-profile variation).
     * Devuelve array con schema_version, applies_to_all_profiles, directives[].
     */
    public static function m3u8Directives(): array
    {
        return self::load('m3u8_directives_config.json', self::defaultsM3u8Directives());
    }

    /**
     * Helper: lista plana de líneas HLS (`#EXT-X-START:VALUE`, ...) lista para concatenar
     * directamente en la cabecera global de una lista .m3u8.
     */
    public static function m3u8DirectiveLines(): array
    {
        $cfg = self::m3u8Directives();
        $out = [];
        if (!isset($cfg['directives']) || !is_array($cfg['directives'])) return $out;
        foreach ($cfg['directives'] as $d) {
            if (!isset($d['tag'], $d['value'])) continue;
            $out[] = '#' . $d['tag'] . ':' . $d['value'];
        }
        return $out;
    }

    /**
     * Helper de alto nivel: dado un channel_id y profile, devuelve el DNA mergeado.
     * Prioridad: channel-specific override → profile default → fallback hardcoded.
     */
    public static function channelDna(string $channelId, string $profile = 'P3'): array
    {
        $cfg = self::channelsDna();
        if (isset($cfg['channels'][$channelId]) && is_array($cfg['channels'][$channelId])) {
            return $cfg['channels'][$channelId];
        }
        if (isset($cfg['channel_defaults_by_profile'][$profile])) {
            $defaults = $cfg['channel_defaults_by_profile'][$profile];
            $defaults['profile'] = $profile;
            $defaults['channel_id'] = $channelId;
            $defaults['_source'] = 'profile_default';
            return $defaults;
        }
        // Último fallback
        return [
            'channel_id' => $channelId,
            'profile' => $profile,
            'prisma_lcevc_enabled' => false,
            'prisma_hdr10plus_enabled' => false,
            'prisma_ai_sr_enabled' => false,
            'prisma_quantum_pixel_enabled' => false,
            'prisma_fake_4k_upscaler_enabled' => false,
            'prisma_cmaf_enabled' => true,
            'prisma_floor_lock_strict' => false,
            'prisma_transcode_enabled' => false,
            '_source' => 'hardcoded_fallback',
        ];
    }

    /** Helper: devuelve el bitrate floor en bps para un perfil dado */
    public static function floorBpsForProfile(string $profile): int
    {
        $cfg = self::floorLock();
        $key = 'floor_lock_min_bandwidth_' . strtolower($profile);
        return (int)($cfg[$key] ?? $cfg['floor_lock_min_bandwidth_default'] ?? 8000000);
    }

    /**
     * Resolves player_target enum for a channel/profile combo (Phase D · player overlay routing).
     *
     * [2026-05-19 · MULTI-SELECT DOCTRINE]
     * Per user doctrine "ampliar cobertura de reproducción es usar todos los
     * parches disponibles en la misma lista generada":
     *
     *   · DEFAULT (empty cell) = ALL players covered universally (no narrowing).
     *   · 'ALL' alias          = same as empty.
     *   · 'VLC'                = single (boost for VLC only).
     *   · 'VLC,KODI'           = comma-separated multi-select.
     *   · 'VLC,KODI,OTT_NAV'   = free combination.
     *
     * Returns ARRAY of player targets — never narrows below ALL when nothing
     * matches. Callers (hls_rewriter_v15.py via JSON serialization, or PHP
     * consumers) iterate the returned list and apply each player's overlay.
     *
     * Resolution order (first match wins):
     *   1. Explicit per-channel override:  channels[$channelId]['player_target']
     *   2. Per-profile default:            channel_defaults_by_profile[$profile]['player_target']
     *   3. User-Agent inference (if UA passed): TiviMate UA → ['TIVIMATE'], etc.
     *   4. Fallback by player_profile:     PREMIUM/HIGH→['KODI'], STANDARD→['TIVIMATE'], LEGACY→['VLC']
     *   5. Final fallback:                 ALL players (universal coverage doctrine)
     *
     * Sister method `playerTargetForChannelLegacy()` retained for backward-compat
     * (returns single string; new code should call this new array-returning method).
     *
     * @param string $channelId  Channel id (lookup in channels_prisma_dna.json)
     * @param string $profile    P0..P5
     * @param ?string $userAgent Optional UA hint for inference
     * @return string[]          Array of player targets (always non-empty under doctrine)
     */
    public static function playerTargetsForChannel(
        string $channelId,
        string $profile = 'P3',
        ?string $userAgent = null
    ): array {
        $ALL = ['VLC', 'KODI', 'TIVIMATE', 'OTT_NAV'];
        $parse = function (string $raw) use ($ALL): array {
            $s = strtoupper(trim($raw));
            if ($s === '' || $s === 'ALL') return $ALL;
            $parts = array_map('trim', explode(',', $s));
            $known = array_values(array_filter($parts,
                fn($p) => in_array($p, $ALL, true)));
            return !empty($known) ? $known : $ALL;  // all-unknown -> ALL safety
        };

        // 1. Explicit per-channel override
        $cfg = self::channelsDna();
        if (isset($cfg['channels'][$channelId]['player_target'])) {
            return $parse((string)$cfg['channels'][$channelId]['player_target']);
        }

        // 2. Per-profile default
        if (isset($cfg['channel_defaults_by_profile'][$profile]['player_target'])) {
            return $parse((string)$cfg['channel_defaults_by_profile'][$profile]['player_target']);
        }

        // 3. UA inference (returns single-element array)
        if ($userAgent !== null && $userAgent !== '') {
            $ua = strtolower($userAgent);
            if (str_contains($ua, 'tivimate'))     return ['TIVIMATE'];
            if (str_contains($ua, 'ott navigator') || str_contains($ua, 'ott_navigator')) return ['OTT_NAV'];
            if (str_contains($ua, 'kodi') || str_contains($ua, 'inputstream')) return ['KODI'];
            if (str_contains($ua, 'vlc'))          return ['VLC'];
        }

        // 4. Profile fallback (broad heuristic)
        $cfgProf = self::channelsDna()['channel_defaults_by_profile'][$profile] ?? [];
        $playerProfile = (string)($cfgProf['player_profile'] ?? '');
        switch (strtoupper($playerProfile)) {
            case 'PREMIUM':
            case 'HIGH':     return ['KODI'];
            case 'STANDARD': return ['TIVIMATE'];
            case 'LEGACY':   return ['VLC'];
        }

        // 5. Final fallback: ALL (per universal-coverage doctrine 2026-05-19)
        return $ALL;
    }

    /**
     * Legacy single-string variant — preserved for backward compatibility with
     * older callers. New code should use playerTargetsForChannel() which
     * returns the full array per multi-select doctrine.
     *
     * @return string First element of playerTargetsForChannel() or empty.
     */
    public static function playerTargetForChannel(
        string $channelId,
        string $profile = 'P3',
        ?string $userAgent = null
    ): string {
        // 1. Explicit per-channel override (when LAB exports the column · TODO Phase D-2)
        $cfg = self::channelsDna();
        if (isset($cfg['channels'][$channelId]['player_target'])) {
            $v = strtoupper(trim((string)$cfg['channels'][$channelId]['player_target']));
            if (in_array($v, ['VLC', 'KODI', 'TIVIMATE', 'OTT_NAV'], true)) return $v;
        }

        // 2. Per-profile default (when LAB exports the column · TODO Phase D-2)
        if (isset($cfg['channel_defaults_by_profile'][$profile]['player_target'])) {
            $v = strtoupper(trim((string)$cfg['channel_defaults_by_profile'][$profile]['player_target']));
            if (in_array($v, ['VLC', 'KODI', 'TIVIMATE', 'OTT_NAV'], true)) return $v;
        }

        // 3. UA inference (LOW confidence · used only when DNA absent)
        if ($userAgent !== null && $userAgent !== '') {
            $ua = strtolower($userAgent);
            if (str_contains($ua, 'tivimate'))     return 'TIVIMATE';
            if (str_contains($ua, 'ott navigator') || str_contains($ua, 'ott_navigator')) return 'OTT_NAV';
            if (str_contains($ua, 'kodi') || str_contains($ua, 'inputstream')) return 'KODI';
            if (str_contains($ua, 'vlc'))          return 'VLC';
        }

        // 4. Profile fallback (broad heuristic · not strict)
        //    PREMIUM/HIGH common with Kodi+inputstream.adaptive (LCEVC capable)
        //    STANDARD typical TiviMate range
        //    LEGACY VLC desktop / MAG / older devices
        $cfgProf = self::channelsDna()['channel_defaults_by_profile'][$profile] ?? [];
        $playerProfile = (string)($cfgProf['player_profile'] ?? '');
        switch (strtoupper($playerProfile)) {
            case 'PREMIUM':
            case 'HIGH':
                return 'KODI';
            case 'STANDARD':
                return 'TIVIMATE';
            case 'LEGACY':
                return 'VLC';
        }

        // 5. Final fallback · empty → caller applies no overlay
        return '';
    }

    /** Helper: devuelve el boost_multiplier para un perfil dado */
    public static function boostMultiplierForProfile(string $profile): float
    {
        $cfg = self::profileBoost();
        if (!($cfg['global_boost_when_master_enabled'] ?? false)) return 1.0;
        $p = $cfg['profiles'][$profile] ?? $cfg['fallback_default'] ?? null;
        return (float)($p['prisma_boost_multiplier'] ?? 1.5);
    }

    /** Devuelve la salud del loader (existence + age de cada JSON) — para widget Nivel 9 LAB-SYNC Status */
    public static function health(): array
    {
        $files = [
            'floor_lock_config.json',
            'profile_boost_multipliers.json',
            'channels_prisma_dna.json',
            'sentinel_providers_map.json',
            'telescope_thresholds.json',
            'enterprise_doctrine_manifest.json',
        ];
        $health = [];
        $now = time();
        foreach ($files as $file) {
            $path = self::CONFIG_DIR . '/' . $file;
            if (!file_exists($path)) {
                $health[$file] = ['status' => 'missing', 'age_seconds' => null, 'using_fallback' => true];
                continue;
            }
            $mtime = filemtime($path);
            $size = filesize($path);
            $valid = false;
            $raw = @file_get_contents($path);
            if ($raw !== false) {
                $decoded = @json_decode($raw, true);
                $valid = is_array($decoded);
            }
            $health[$file] = [
                'status' => $valid ? 'ok' : 'corrupt',
                'age_seconds' => $now - $mtime,
                'size_bytes' => $size,
                'using_fallback' => !$valid,
            ];
        }
        return $health;
    }

    // ──────────────────────────────────────────────────────────────────
    // Internals
    // ──────────────────────────────────────────────────────────────────

    private static function load(string $filename, array $defaults): array
    {
        $now = time();
        if (isset(self::$cache[$filename]) && ($now - (self::$cacheTs[$filename] ?? 0)) < self::CACHE_TTL_SECONDS) {
            return self::$cache[$filename];
        }
        $path = self::CONFIG_DIR . '/' . $filename;
        if (!file_exists($path)) {
            self::$cache[$filename] = $defaults;
            self::$cacheTs[$filename] = $now;
            return $defaults;
        }
        $raw = @file_get_contents($path);
        if ($raw === false) return $defaults;
        $decoded = @json_decode($raw, true);
        if (!is_array($decoded)) {
            error_log("[LabConfigLoader] JSON corrupt: $path · using defaults");
            return $defaults;
        }
        self::$cache[$filename] = $decoded;
        self::$cacheTs[$filename] = $now;
        return $decoded;
    }

    private static function defaultsFloorLock(): array
    {
        return [
            'floor_lock_enabled' => true,
            'floor_lock_min_bandwidth_p0' => 15000000,
            'floor_lock_min_bandwidth_p1' => 15000000,
            'floor_lock_min_bandwidth_p2' => 15000000,
            'floor_lock_min_bandwidth_p3' => 8000000,
            'floor_lock_min_bandwidth_p4' => 8000000,
            'floor_lock_min_bandwidth_p5' => 4000000,
            'floor_lock_min_bandwidth_default' => 8000000,
            'floor_lock_passthrough_when_unreachable' => true,
        ];
    }

    private static function defaultsProfileBoost(): array
    {
        return [
            'global_boost_when_master_enabled' => true,
            'profiles' => [
                'P0' => ['prisma_boost_multiplier' => 2.0, 'prisma_zap_grace_seconds' => 30, 'prisma_floor_min_bandwidth_bps' => 15000000],
                'P1' => ['prisma_boost_multiplier' => 2.0, 'prisma_zap_grace_seconds' => 30, 'prisma_floor_min_bandwidth_bps' => 15000000],
                'P2' => ['prisma_boost_multiplier' => 2.0, 'prisma_zap_grace_seconds' => 30, 'prisma_floor_min_bandwidth_bps' => 15000000],
                'P3' => ['prisma_boost_multiplier' => 1.5, 'prisma_zap_grace_seconds' => 30, 'prisma_floor_min_bandwidth_bps' => 8000000],
                'P4' => ['prisma_boost_multiplier' => 1.5, 'prisma_zap_grace_seconds' => 30, 'prisma_floor_min_bandwidth_bps' => 8000000],
                'P5' => ['prisma_boost_multiplier' => 1.2, 'prisma_zap_grace_seconds' => 30, 'prisma_floor_min_bandwidth_bps' => 4000000],
            ],
            'fallback_default' => ['prisma_boost_multiplier' => 1.5, 'prisma_zap_grace_seconds' => 30, 'prisma_floor_min_bandwidth_bps' => 8000000],
        ];
    }

    private static function defaultsChannelsDna(): array
    {
        return ['channel_defaults_by_profile' => [], 'channels' => []];
    }

    private static function defaultsSentinelProviders(): array
    {
        return [
            'providers' => ['_default' => ['ua_pool' => ['VLC/3.0.18 LibVLC/3.0.18']]],
            'global_thresholds' => ['burst_limiter_rate_per_second' => 4, 'burst_limiter_burst' => 8],
        ];
    }

    private static function defaultsTelescopeThresholds(): array
    {
        return [
            'level1_rolling_window' => ['samples_count' => 12, 'window_ms' => 1200, 'ewma_alpha' => 0.3],
            'predictive_triggers' => ['ttfb_rising_threshold_ms' => 500, 'jitter_threshold_ms' => 50, 'packet_loss_critical_pct' => 2.0],
        ];
    }

    private static function defaultsManifest(): array
    {
        return ['version' => 'fallback', 'compliance_score_current' => 0];
    }

    /**
     * Defaults Disney-Grade LL-HLS / ABR — usados si m3u8_directives_config.json
     * falta o está corrupto. Mismos valores que el seed file en repo.
     * Mismas directivas para todos los perfiles P0-P5.
     */
    private static function defaultsM3u8Directives(): array
    {
        return [
            'schema_version' => '1.0',
            'applies_to_all_profiles' => true,
            'directives' => [
                ['tag' => 'EXT-X-START',          'value' => 'TIME-OFFSET=-3.0,PRECISE=YES',                                                                                                                                            'category' => 'timeline'],
                ['tag' => 'EXT-X-SERVER-CONTROL', 'value' => 'CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0',                                                                                                              'category' => 'timeline'],
                ['tag' => 'EXT-X-TARGETDURATION', 'value' => '2',                                                                                                                                                                        'category' => 'fragmentation'],
                ['tag' => 'EXT-X-PART-INF',       'value' => 'PART-TARGET=1.0',                                                                                                                                                          'category' => 'fragmentation'],
                ['tag' => 'EXT-X-SESSION-DATA',   'value' => 'DATA-ID="exoplayer.load_control",VALUE="{\\"minBufferMs\\":20000,\\"bufferForPlaybackMs\\":1000}"',                                                                        'category' => 'abr'],
                ['tag' => 'EXT-X-SESSION-DATA',   'value' => 'DATA-ID="exoplayer.track_selection",VALUE="{\\"maxDurationForQualityDecreaseMs\\":2000,\\"minDurationForQualityIncreaseMs\\":15000,\\"bandwidthFraction\\":0.65}"', 'category' => 'abr'],
            ],
        ];
    }
}
