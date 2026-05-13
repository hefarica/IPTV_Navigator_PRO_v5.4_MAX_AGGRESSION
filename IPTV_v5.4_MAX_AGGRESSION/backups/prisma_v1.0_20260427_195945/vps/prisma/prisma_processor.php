<?php
declare(strict_types=1);

/**
 * APE PRISMA v1.0 — Post-Processor
 *
 * Receives resolve.php output as a string (via ob_start callback),
 * applies CMAF / LCEVC / HDR10+ / AI-SR enrichment lanes,
 * validates output integrity, and returns enriched or original manifest.
 *
 * 5-Ring Defense:
 *   Ring 0: Kill switch (master off) — handled by bootstrap
 *   Ring 1: Exception wrap (global try/catch) — handled by bootstrap
 *   Ring 2: Per-lane isolation (each lane in try/catch)
 *   Ring 3: Output integrity (validate M3U structure after rewrite)
 *   Ring 4: Health watchdog (auto-disable on excessive errors) — handled by state
 */

require_once __DIR__ . '/prisma_state.php';

class PrismaProcessor
{
    /** @var string The original, unmodified output from resolve.php */
    private static string $original = '';

    /** @var array<string> Lanes that were applied in this cycle */
    private static array $appliedLanes = [];

    // ────────────────────────────────────────────────────────────────────
    // Main entry point — called by ob_start callback
    // ────────────────────────────────────────────────────────────────────

    public static function process(string $buffer): string
    {
        self::$original     = $buffer;
        self::$appliedLanes = [];

        // Guard: empty or non-M3U output → passthrough
        if ($buffer === '' || !str_contains($buffer, '#EXTINF')) {
            return $buffer;
        }

        // Parse the resolved profile from #EXTINF ape-profile="P2"
        $profile = self::extractProfile($buffer);

        // Parse channel ID from first URL line (stream_id extraction)
        $channelId = self::extractChannelId($buffer);

        // Now apply each active lane
        $output = $buffer;

        foreach (['lcevc', 'hdr10plus', 'ai_sr', 'cmaf'] as $lane) {
            // Ring 2: Per-lane isolation
            try {
                if (!PrismaState::isLaneActive($lane, $channelId, $profile)) {
                    continue;
                }

                $result = match ($lane) {
                    'lcevc'     => self::applyLcevc($output, $channelId, $profile),
                    'hdr10plus' => self::applyHdr10Plus($output, $channelId, $profile),
                    'ai_sr'     => self::applyAiSr($output, $channelId, $profile),
                    'cmaf'      => self::applyCmaf($output, $channelId, $profile),
                    default     => null,
                };

                if ($result !== null && $result !== $output) {
                    $output = $result;
                    self::$appliedLanes[] = $lane;
                }
            } catch (\Throwable $e) {
                PrismaState::recordError($lane, $e->getMessage());
                // Ring 2: Lane failure doesn't affect other lanes
                continue;
            }
        }

        // Ring 3: Validate output integrity
        if (!self::validateOutput($output)) {
            PrismaState::recordError('processor', 'Ring3: output validation failed, reverting');
            $output = self::$original;
            self::$appliedLanes = [];
        }

        // Add PRISMA response header for audit trail
        if (!empty(self::$appliedLanes)) {
            $lanesStr = implode(',', self::$appliedLanes);
            header("X-APE-PRISMA: v1.0;lanes={$lanesStr}");
        } else {
            header('X-APE-PRISMA: v1.0;passthrough');
        }

        // Periodic health check (1 in 50 requests)
        if (mt_rand(1, 50) === 1) {
            PrismaState::autoDisableIfRequired();
        }

        return $output;
    }

    // ────────────────────────────────────────────────────────────────────
    // Parse helpers
    // ────────────────────────────────────────────────────────────────────

    /**
     * Extract ape-profile="P2" from #EXTINF line.
     */
    private static function extractProfile(string $buffer): ?string
    {
        if (preg_match('/ape-profile="(P\d)"/', $buffer, $m)) {
            return $m[1];
        }
        return null;
    }

    /**
     * Extract channel/stream ID from the final URL line.
     * e.g. http://host/live/user/pass/12345.m3u8 → 12345
     */
    private static function extractChannelId(string $buffer): string
    {
        $lines = explode("\n", $buffer);
        foreach (array_reverse($lines) as $line) {
            $line = trim($line);
            if ($line !== '' && !str_starts_with($line, '#')) {
                // URL line — extract stream_id
                if (preg_match('/\/(\d+)\.m3u8/', $line, $m)) {
                    return $m[1];
                }
                // Fallback: use entire URL as channel ID
                return md5($line);
            }
        }
        return 'unknown';
    }

    /**
     * Parse the #EXTHTTP JSON line into an associative array.
     */
    private static function parseExthttp(string $buffer): array
    {
        if (preg_match('/^#EXTHTTP:(.+)$/m', $buffer, $m)) {
            $decoded = json_decode($m[1], true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }
        return [];
    }

    /**
     * Rebuild #EXTHTTP line with updated headers.
     */
    private static function replaceExthttp(string $buffer, array $newHeaders): string
    {
        $json = json_encode($newHeaders, JSON_UNESCAPED_SLASHES);
        return preg_replace(
            '/^#EXTHTTP:.+$/m',
            '#EXTHTTP:' . $json,
            $buffer,
            1
        );
    }

    /**
     * Insert a tag line before the final URL.
     */
    private static function insertBeforeUrl(string $buffer, string $tag): string
    {
        $lines = explode("\n", $buffer);
        $result = [];
        $inserted = false;

        for ($i = count($lines) - 1; $i >= 0; $i--) {
            $trimmed = trim($lines[$i]);
            if (!$inserted && $trimmed !== '' && !str_starts_with($trimmed, '#')) {
                $result[] = $tag;
                $inserted = true;
            }
            $result[] = $lines[$i];
        }

        return implode("\n", array_reverse($result));
    }

    /**
     * Get the final URL from output.
     */
    private static function extractFinalUrl(string $buffer): string
    {
        $lines = explode("\n", $buffer);
        foreach (array_reverse($lines) as $line) {
            $line = trim($line);
            if ($line !== '' && !str_starts_with($line, '#')) {
                return $line;
            }
        }
        return '';
    }

    /**
     * Replace the final URL in the output.
     */
    private static function replaceFinalUrl(string $buffer, string $newUrl): string
    {
        $lines = explode("\n", $buffer);
        for ($i = count($lines) - 1; $i >= 0; $i--) {
            $trimmed = trim($lines[$i]);
            if ($trimmed !== '' && !str_starts_with($trimmed, '#')) {
                $lines[$i] = $newUrl;
                break;
            }
        }
        return implode("\n", $lines);
    }

    // ────────────────────────────────────────────────────────────────────
    // Lane: LCEVC Enhancement Layer (headers + tags)
    // ────────────────────────────────────────────────────────────────────

    private static function applyLcevc(string $output, string $channelId, ?string $profile): ?string
    {
        $engineFile = __DIR__ . '/../cmaf_engine/modules/lcevc_state_engine.php';
        $detectorFile = __DIR__ . '/../cmaf_engine/modules/lcevc_player_detector.php';

        if (!is_file($engineFile) || !is_file($detectorFile)) {
            PrismaState::recordError('lcevc', 'engine files not found');
            return null;
        }

        require_once $engineFile;
        require_once $detectorFile;

        // Detect player capabilities
        $playerInfo = LcevcPlayerDetector::detect();

        // If player doesn't support LCEVC, skip silently
        if (($playerInfo['lcevc_capable'] ?? false) === false) {
            return null;
        }

        // Build LCEVC state
        $channelMeta = [
            'lcevc_enabled'    => true,
            'lcevc_mode'       => 'SEI_METADATA',
            'lcevc_base_codec' => self::detectBaseCodec($output),
            'lcevc_fallback'   => 'BASE_ONLY',
        ];

        $lcevcState   = LcevcStateEngine::resolveState($channelMeta, $playerInfo['player_name'] ?? 'exoplayer');
        $lcevcHeaders = LcevcStateEngine::buildResponseHeaders($lcevcState, $channelMeta);

        // Merge headers into #EXTHTTP
        $existingHeaders = self::parseExthttp($output);
        $mergedHeaders   = array_merge($existingHeaders, $lcevcHeaders);
        $result          = self::replaceExthttp($output, $mergedHeaders);

        // Add LCEVC tag before URL
        $mode   = strtoupper($channelMeta['lcevc_mode']);
        $codec  = strtoupper($channelMeta['lcevc_base_codec']);
        $result = self::insertBeforeUrl($result, "#EXT-X-APE-LCEVC:MODE={$mode},BASE-CODEC={$codec},FALLBACK=BASE_ONLY");

        return $result;
    }

    // ────────────────────────────────────────────────────────────────────
    // Lane: HDR10+ Dynamic Metadata
    // ────────────────────────────────────────────────────────────────────

    private static function applyHdr10Plus(string $output, string $channelId, ?string $profile): ?string
    {
        $engineFile = __DIR__ . '/../cmaf_engine/modules/hdr10plus_dynamic_engine.php';

        if (!is_file($engineFile)) {
            PrismaState::recordError('hdr10plus', 'engine file not found');
            return null;
        }

        require_once $engineFile;

        // Only apply to profiles with HDR support (P0, P1, P2)
        if ($profile !== null && !in_array($profile, ['P0', 'P1', 'P2'], true)) {
            return null; // SDR profiles don't get HDR10+
        }

        // Check if content is already HDR-tagged
        $headers = self::parseExthttp($output);
        $existingHdr = $headers['X-HDR-Support'] ?? 'none';
        if ($existingHdr === 'none') {
            return null; // SDR content, don't force HDR10+
        }

        // Build HDR10+ headers
        $hdr10PlusHeaders = [
            'X-HDR10-Plus-Enabled'   => 'true',
            'X-HDR10-Plus-Version'   => '1.4',
            'X-HDR10-Plus-Profile'   => 'A',
            'X-HDR10-Plus-MaxCLL'    => '5000',
            'X-HDR10-Plus-MaxFALL'   => '1500',
            'X-HDR10-Plus-Dynamic'   => 'scene-by-scene',
            'X-HDR10-Plus-Tone-Map'  => 'dynamic',
        ];

        $mergedHeaders = array_merge($headers, $hdr10PlusHeaders);
        $result = self::replaceExthttp($output, $mergedHeaders);
        $result = self::insertBeforeUrl($result, '#EXT-X-APE-HDR:TYPE=HDR10+,DYNAMIC=YES,MAXCLL=5000,MAXFALL=1500');

        return $result;
    }

    // ────────────────────────────────────────────────────────────────────
    // Lane: AI Super Resolution
    // ────────────────────────────────────────────────────────────────────

    private static function applyAiSr(string $output, string $channelId, ?string $profile): ?string
    {
        $engineFile = __DIR__ . '/../cmaf_engine/modules/ai_super_resolution_engine.php';

        if (!is_file($engineFile)) {
            PrismaState::recordError('ai_sr', 'engine file not found');
            return null;
        }

        require_once $engineFile;

        // AI-SR headers: signal to player/decoder to use AI upscaling
        $srHeaders = [
            'X-AI-SR-Enabled'       => 'true',
            'X-AI-SR-Engine'        => 'APE-SR-v4',
            'X-AI-SR-Mode'          => 'quality', // quality | balanced | performance
            'X-AI-SR-Scale-Factor'  => self::computeScaleFactor($profile),
            'X-AI-SR-Denoise-Level' => '0.3',
            'X-AI-SR-Sharpen'       => '0.4',
            'X-AI-SR-Artifact-Guard'=> 'true',
        ];

        $headers = self::parseExthttp($output);
        $mergedHeaders = array_merge($headers, $srHeaders);
        $result = self::replaceExthttp($output, $mergedHeaders);

        $scale = $srHeaders['X-AI-SR-Scale-Factor'];
        $result = self::insertBeforeUrl($result, "#EXT-X-APE-AI:ENGINE=APE-SR-v4,SCALE={$scale},MODE=quality");

        return $result;
    }

    // ────────────────────────────────────────────────────────────────────
    // Lane: CMAF Packaging (URL rewrite)
    // ────────────────────────────────────────────────────────────────────

    private static function applyCmaf(string $output, string $channelId, ?string $profile): ?string
    {
        // Check if cmaf_proxy.php exists
        $proxyFile = dirname(__DIR__) . '/cmaf_proxy.php';
        if (!is_file($proxyFile)) {
            PrismaState::recordError('cmaf', 'cmaf_proxy.php not found');
            return null;
        }

        $originalUrl = self::extractFinalUrl($output);
        if ($originalUrl === '') {
            return null;
        }

        // Build CMAF proxy URL preserving the original stream URL as a parameter
        $scheme = 'http';
        $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $cmafUrl = "{$scheme}://{$host}/cmaf_proxy.php?"
                 . http_build_query([
                       'src'     => $originalUrl,
                       'sid'     => $channelId,
                       'profile' => $profile ?? 'AUTO',
                       'fmt'     => 'cmaf',
                   ]);

        // Add CMAF headers
        $headers = self::parseExthttp($output);
        $cmafHeaders = [
            'X-CMAF-Enabled'        => 'true',
            'X-CMAF-Format'         => 'fMP4-CMAF',
            'X-CMAF-Brand'          => 'cmfc,iso6',
            'X-CMAF-Chunk-Duration' => '2.0',
            'X-CMAF-Low-Latency'    => 'true',
            'X-CMAF-Track-Sync'     => 'true',
        ];
        $mergedHeaders = array_merge($headers, $cmafHeaders);
        $result = self::replaceExthttp($output, $mergedHeaders);

        // Replace URL with CMAF proxy URL
        $result = self::replaceFinalUrl($result, $cmafUrl);

        // Add CMAF tag
        $result = self::insertBeforeUrl($result, '#EXT-X-APE-CMAF:FORMAT=fMP4,BRAND=cmfc,CHUNK-DUR=2.0,LL=YES');

        return $result;
    }

    // ────────────────────────────────────────────────────────────────────
    // Ring 3: Output validation
    // ────────────────────────────────────────────────────────────────────

    private static function validateOutput(string $output): bool
    {
        // Must still contain #EXTINF
        if (!str_contains($output, '#EXTINF')) {
            return false;
        }

        // Must have at least one non-comment line (URL)
        $lines = explode("\n", $output);
        $hasUrl = false;
        foreach (array_reverse($lines) as $line) {
            $line = trim($line);
            if ($line !== '' && !str_starts_with($line, '#')) {
                $hasUrl = true;
                break;
            }
        }
        if (!$hasUrl) {
            return false;
        }

        // #EXTHTTP must be valid JSON
        if (preg_match('/^#EXTHTTP:(.+)$/m', $output, $m)) {
            $decoded = json_decode($m[1], true);
            if (!is_array($decoded)) {
                return false;
            }
        }

        return true;
    }

    // ────────────────────────────────────────────────────────────────────
    // Utility methods
    // ────────────────────────────────────────────────────────────────────

    /**
     * Detect base codec from existing headers.
     */
    private static function detectBaseCodec(string $output): string
    {
        $headers = self::parseExthttp($output);
        $codecPrimary = $headers['X-Video-Codecs'] ?? $headers['X-Codec-Support'] ?? '';
        if (stripos($codecPrimary, 'hevc') !== false || stripos($codecPrimary, 'h265') !== false) {
            return 'HEVC';
        }
        return 'H264';
    }

    /**
     * Compute AI-SR scale factor based on profile.
     */
    private static function computeScaleFactor(?string $profile): string
    {
        return match ($profile) {
            'P5'    => '4',    // SD → 4x upscale
            'P4'    => '2',    // HD → 2x upscale
            'P3'    => '2',    // FHD → 2x upscale
            'P2'    => '1.5',  // 4K → 1.5x enhance
            'P1'    => '1',    // 8K → no scale, just enhance
            'P0'    => '1',    // ULTRA → no scale, just enhance
            default => '2',    // Default: 2x
        };
    }
}
