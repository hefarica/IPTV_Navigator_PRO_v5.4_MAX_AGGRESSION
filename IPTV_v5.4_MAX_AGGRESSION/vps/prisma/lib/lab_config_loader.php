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
