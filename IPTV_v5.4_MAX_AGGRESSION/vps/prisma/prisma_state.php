<?php
declare(strict_types=1);

/**
 * APE PRISMA v1.1 — State Manager
 *
 * Manages /dev/shm/prisma_state.json with:
 *   - Per-request static cache (prime once, read many)
 *   - Atomic writes (tempnam + rename)
 *   - Profile-aware lane activation (P0–P5 filter + per-channel override)
 *   - Error tracking with 60s sliding window
 *   - Auto-disable for lanes exceeding 20% error rate
 */

class PrismaState
{
    private const STATE_FILE   = '/dev/shm/prisma_state.json';
    private const ERRORS_FILE  = '/dev/shm/prisma_errors.jsonl';
    private const ERROR_WINDOW = 60;     // seconds
    private const ERROR_RATE_LIMIT = 0.20; // 20%
    private const AUTO_DISABLE_SECS = 300; // 5 min cooldown

    private const ALL_PROFILES = ['P0','P1','P2','P3','P4','P5'];

    /** @var array|null  Per-request cache */
    private static ?array $state = null;

    // ─── Default state schema ───────────────────────────────────────────

    public static function defaults(): array
    {
        // LAB-SYNC v2.0: leer multipliers desde JSON SSOT con fallback defensivo
        $bitrateMult = 1.5;
        $zapBurstMult = 1.5;
        $zapGrace = 30;
        $profileMults = ['P0'=>2.0,'P1'=>2.0,'P2'=>2.0,'P3'=>1.5,'P4'=>1.5,'P5'=>1.2];

        $loaderPath = __DIR__ . '/lib/lab_config_loader.php';
        if (is_file($loaderPath)) {
            try {
                if (!class_exists('LabConfigLoader', false)) {
                    require_once $loaderPath;
                }
                $boost = LabConfigLoader::profileBoost();
                if (isset($boost['profiles']) && is_array($boost['profiles'])) {
                    $profileMults = [];
                    foreach (['P0','P1','P2','P3','P4','P5'] as $p) {
                        if (isset($boost['profiles'][$p]['prisma_boost_multiplier'])) {
                            $profileMults[$p] = (float)$boost['profiles'][$p]['prisma_boost_multiplier'];
                        }
                    }
                    if (isset($boost['profiles']['P3']['prisma_zap_grace_seconds'])) {
                        $zapGrace = (int)$boost['profiles']['P3']['prisma_zap_grace_seconds'];
                    }
                }
            } catch (\Throwable $e) {
                // Silent fallback to hardcoded — NO romper si lab_config falla
                @error_log('[PRISMA state] LabConfigLoader fallback: ' . $e->getMessage());
            }
        }

        return [
            'version'        => '1.1.0',
            'master_enabled' => false,
            'lanes_any_active' => false,
            'lanes' => [
                'cmaf'             => ['global' => 'off', 'profiles' => self::ALL_PROFILES, 'auto_disabled_until' => 0],
                'lcevc'            => ['global' => 'off', 'profiles' => self::ALL_PROFILES, 'auto_disabled_until' => 0],
                'hdr10plus'        => ['global' => 'off', 'profiles' => self::ALL_PROFILES, 'auto_disabled_until' => 0],
                'ai_sr'            => ['global' => 'off', 'profiles' => self::ALL_PROFILES, 'auto_disabled_until' => 0],
                'quantum_pixel'    => ['global' => 'off', 'profiles' => self::ALL_PROFILES, 'auto_disabled_until' => 0],
                'fake_4k_upscaler' => ['global' => 'off', 'profiles' => self::ALL_PROFILES, 'auto_disabled_until' => 0],
            ],
            'channels'          => (object)[],
            'boost' => [
                'enabled_when_master'  => true,
                'bitrate_multiplier'   => $bitrateMult,
                'zap_burst_multiplier' => $zapBurstMult,
                'zap_grace_seconds'    => $zapGrace,
                'profile_multipliers'  => $profileMults,
                '_source' => is_file($loaderPath) ? 'lab_config_loader' : 'hardcoded_fallback',
            ],
            'last_panic_off_ts' => 0,
            'updated_ts'        => 0,
            'updated_by'        => 'init',
        ];
    }

    /**
     * LAB-SYNC v2.0: Devuelve los defaults PRISMA-aware DNA per-canal
     * leídos de channels_prisma_dna.json (LAB Excel hoja 01_CANALES).
     *
     * Si el canal específico está en channels_prisma_dna.json, usa ese.
     * Si no, usa channel_defaults_by_profile[$profile].
     * Si tampoco, usa hardcoded fallback seguro.
     */
    public static function channelDnaDefaults(string $channelId, string $profile = 'P3'): array
    {
        $loaderPath = __DIR__ . '/lib/lab_config_loader.php';
        if (is_file($loaderPath)) {
            try {
                if (!class_exists('LabConfigLoader', false)) {
                    require_once $loaderPath;
                }
                return LabConfigLoader::channelDna($channelId, $profile);
            } catch (\Throwable $e) {
                @error_log('[PRISMA state] channelDna fallback: ' . $e->getMessage());
            }
        }
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

    // ─── Read ───────────────────────────────────────────────────────────

    public static function read(): array
    {
        if (self::$state !== null) {
            return self::$state;
        }
        if (!is_file(self::STATE_FILE)) {
            self::$state = self::defaults();
            return self::$state;
        }
        $raw = @file_get_contents(self::STATE_FILE);
        if ($raw === false) {
            self::$state = self::defaults();
            return self::$state;
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            self::$state = self::defaults();
            return self::$state;
        }
        // Merge with defaults to fill any missing keys
        self::$state = array_replace_recursive(self::defaults(), $decoded);
        return self::$state;
    }

    /**
     * Prime the cache from an already-decoded array (avoids re-reading in bootstrap).
     */
    public static function primeFromArray(array $s): void
    {
        self::$state = array_replace_recursive(self::defaults(), $s);
    }

    // ─── Write (atomic) ─────────────────────────────────────────────────

    public static function write(array $newState, string $actor = 'api'): void
    {
        $newState['updated_ts'] = time();
        $newState['updated_by'] = $actor;
        $newState['lanes_any_active'] = self::computeLanesAnyActive($newState);

        $json = json_encode($newState, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        $tmp  = tempnam('/dev/shm', 'prisma_');
        if ($tmp === false) {
            @error_log('[PRISMA state] tempnam failed');
            return;
        }
        file_put_contents($tmp, $json);
        rename($tmp, self::STATE_FILE);

        // Update cache
        self::$state = $newState;
    }

    // ─── Lane activation check ──────────────────────────────────────────

    /**
     * Determine if a lane is active for a specific channel and profile.
     *
     * Priority: master → auto_disabled_until → per-channel override → lane global + profile filter.
     */
    public static function isLaneActive(string $lane, string $channelId, ?string $profile = null): bool
    {
        $state = self::read();

        if (empty($state['master_enabled'])) {
            return false;
        }

        $laneCfg = $state['lanes'][$lane] ?? null;
        if ($laneCfg === null) {
            return false;
        }

        // Auto-disabled cooldown
        if (($laneCfg['auto_disabled_until'] ?? 0) > time()) {
            return false;
        }

        // Per-channel override has absolute priority
        $channels = (array)($state['channels'] ?? []);
        $override = $channels[$channelId][$lane] ?? 'inherit';
        if ($override === 'on')  return true;
        if ($override === 'off') return false;

        // inherit: check lane global
        if (($laneCfg['global'] ?? 'off') !== 'on') {
            return false;
        }

        // Check profile filter
        $profiles = $laneCfg['profiles'] ?? self::ALL_PROFILES;
        if (empty($profiles)) {
            return false; // "ninguno" — lane ON but no profiles targeted
        }
        if ($profile === null) {
            return true; // No profile info available, assume match
        }
        return in_array(strtoupper($profile), $profiles, true);
    }

    // ─── Error tracking ─────────────────────────────────────────────────

    public static function recordError(string $lane, string $reason): void
    {
        $entry = json_encode([
            'ts'     => time(),
            'lane'   => $lane,
            'reason' => substr($reason, 0, 500),
        ]);
        @file_put_contents(self::ERRORS_FILE, $entry . "\n", FILE_APPEND | LOCK_EX);
    }

    /**
     * Calculate error rate in the last 60s. Returns 0.0–1.0.
     */
    public static function errorRate60s(?string $lane = null): float
    {
        if (!is_file(self::ERRORS_FILE)) {
            return 0.0;
        }
        $cutoff = time() - self::ERROR_WINDOW;
        $lines = @file(self::ERRORS_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!$lines) {
            return 0.0;
        }

        $total = 0;
        $errors = 0;
        foreach ($lines as $line) {
            $entry = json_decode($line, true);
            if (!$entry || ($entry['ts'] ?? 0) < $cutoff) {
                continue;
            }
            $total++;
            if ($lane === null || ($entry['lane'] ?? '') === $lane) {
                $errors++;
            }
        }

        // Prune old entries (keep only last 60s)
        if (count($lines) > 1000) {
            $kept = [];
            foreach ($lines as $line) {
                $entry = json_decode($line, true);
                if ($entry && ($entry['ts'] ?? 0) >= $cutoff) {
                    $kept[] = $line;
                }
            }
            @file_put_contents(self::ERRORS_FILE, implode("\n", $kept) . "\n", LOCK_EX);
        }

        return $total > 0 ? ($errors / max(1, $total)) : 0.0;
    }

    /**
     * Auto-disable lanes with error rate > 20% in the last 60s.
     */
    public static function autoDisableIfRequired(): void
    {
        $state = self::read();
        $changed = false;

        foreach (self::validLanes() as $lane) {
            $laneCfg = $state['lanes'][$lane] ?? [];
            if (($laneCfg['global'] ?? 'off') !== 'on') {
                continue;
            }
            if (($laneCfg['auto_disabled_until'] ?? 0) > time()) {
                continue;
            }

            $rate = self::errorRate60s($lane);
            if ($rate > self::ERROR_RATE_LIMIT) {
                $state['lanes'][$lane]['auto_disabled_until'] = time() + self::AUTO_DISABLE_SECS;
                self::recordError($lane, "auto_disabled: error_rate={$rate} > " . self::ERROR_RATE_LIMIT);
                @error_log("[PRISMA auto-disable] Lane {$lane} disabled for " . self::AUTO_DISABLE_SECS . "s (rate={$rate})");
                $changed = true;
            }
        }

        if ($changed) {
            self::write($state, 'auto-disable');
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    /**
     * Recalculate the denormalized lanes_any_active boolean.
     */
    private static function computeLanesAnyActive(array $state): bool
    {
        if (empty($state['master_enabled'])) {
            return false;
        }
        foreach (self::validLanes() as $lane) {
            $laneCfg = $state['lanes'][$lane] ?? [];
            if (($laneCfg['global'] ?? 'off') !== 'on') {
                continue;
            }
            // Lane is ON — check if it has profiles or per-channel overrides
            $profiles = $laneCfg['profiles'] ?? [];
            if (!empty($profiles)) {
                return true;
            }
            // Check per-channel overrides
            $channels = (array)($state['channels'] ?? []);
            foreach ($channels as $chOverrides) {
                if (is_array($chOverrides) && ($chOverrides[$lane] ?? 'inherit') === 'on') {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Get all valid lane names.
     */
    public static function validLanes(): array
    {
        return ['cmaf', 'lcevc', 'hdr10plus', 'ai_sr', 'quantum_pixel', 'fake_4k_upscaler'];
    }

    /**
     * Get all valid profiles.
     */
    public static function allProfiles(): array
    {
        return self::ALL_PROFILES;
    }
}
