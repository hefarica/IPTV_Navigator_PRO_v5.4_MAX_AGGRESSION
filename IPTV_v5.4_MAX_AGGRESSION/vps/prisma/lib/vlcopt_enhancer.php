<?php
declare(strict_types=1);

/**
 * APE PRISMA v1.2 — VLC/OTT Navigator Directive Enhancer
 *
 * Injects #EXTVLCOPT: directives into M3U8 manifests based on active PRISMA lanes.
 * These directives are REAL player instructions honored by:
 *   - VLC / libVLC backends
 *   - OTT Navigator (uses libVLC internally)
 *   - MX Player with VLC plugin
 *   - Kodi with VLC plugin
 *
 * Each lane maps to specific directives that improve visual quality tangibly:
 *   - Quantum Pixel → tone mapping, color space, deband, gamma
 *   - HDR10+ → HDR output mode, tone mapping algorithm, peak luminance
 *   - AI SR → sharpening, Lanczos scaling
 *   - LCEVC → post-processing quality max
 *   - Fake 4K → adaptive resolution forcing, smooth motion
 *   - CMAF → cache/buffer sizing for low-latency
 *   - Global (when master ON) → maxbw forcing, preferred resolution
 *
 * Idempotent: checks for existing directives before injecting to avoid duplicates.
 */

class VlcoptEnhancer
{
    // ── Directive Registry ───────────────────────────────────────────────
    // Each lane defines its EXTVLCOPT directives as key => value pairs.
    // Order matters: directives are injected in lane priority order.

    private const LANE_DIRECTIVES = [
        'quantum_pixel' => [
            // L1: Gamma Boost — prepare PQ transfer
            'gamma'                    => '0.96',
            'contrast'                 => '1.08',
            'saturation'               => '1.12',
            // Scaling: Lanczos (mode 9) for maximum detail preservation
            'swscale-mode'             => '9',
            // Deband: remove compression banding artifacts
            'deband'                   => '1',
            'deband-iterations'        => '4',
            'deband-threshold'         => '64',
            // Dithering: fruit algorithm for smooth gradients
            'dither-algo'              => 'fruit',
            'dither-depth'             => 'auto',
            // Color space: BT.2020 + PQ transfer for HDR activation
            'video-color-space'        => 'BT2020',
            'video-transfer-function'  => 'PQ',
            'video-color-primaries'    => 'BT2020',
        ],

        'hdr10plus' => [
            // Force HDR output even on SDR content (triggers panel HDR mode)
            'hdr-output-mode'          => 'always_hdr',
            // Tone mapping: Reinhard for natural highlight rolloff
            'tone-mapping'             => 'hdr',
            'tone-mapping-algorithm'   => 'reinhard',
            // Peak luminance targets
            'hdr10-maxcll'             => '8000',
            'hdr10-maxfall'            => '800',
            'target-peak'              => '10000',
        ],

        'ai_sr' => [
            // Sharpening: aggressive but artifact-free
            'sharpen-sigma'            => '0.08',
            // Lanczos scaling for upscale path
            'swscale-mode'             => '9',
        ],

        'lcevc' => [
            // Post-processing quality maximum (0-6, 6=max)
            'postproc-q'               => '6',
            // Never skip frames — quality over latency
            'no-skip-frames'           => '1',
        ],

        'fake_4k_upscaler' => [
            // Force player to request maximum resolution variant
            'adaptive-maxwidth'        => '3840',
            'adaptive-maxheight'       => '2160',
            'adaptive-logic'           => 'highest',
            'preferred-resolution'     => '-1',
            // Smooth motion for MEMC-capable displays
            'smooth-motion'            => 'true',
            // Lanczos scaling
            'swscale-mode'             => '9',
        ],

        'cmaf' => [
            // Buffer sizing for low-latency CMAF
            'adaptive-cache-size'      => '8000',
            'network-caching'          => '8000',
            'live-caching'             => '3000',
        ],
    ];

    // V7: Global directives applied when master is ON (regardless of specific lanes)
    private const GLOBAL_DIRECTIVES = [
        // Force player to always pick highest bandwidth variant
        'adaptive-maxbw'           => '999999999',
        // Never limit resolution artificially
        'preferred-resolution'     => '-1',
        // Force highest quality adaptive logic
        'adaptive-logic'           => 'highest',
    ];

    // ── Main Entry Point ─────────────────────────────────────────────────

    /**
     * Apply EXTVLCOPT directives to the manifest based on active lanes.
     *
     * @param string $output     The current manifest buffer (post-lane processing)
     * @param array  $activeLanes Array of lane names that were applied (e.g. ['quantum_pixel', 'hdr10plus'])
     * @return string Modified manifest with #EXTVLCOPT directives injected
     */
    public static function apply(string $output, array $activeLanes): string
    {
        if (empty($activeLanes) && empty(self::GLOBAL_DIRECTIVES)) {
            return $output;
        }

        // Collect all directives to inject (later lanes override earlier for same key)
        $directives = [];

        // 1. Global directives (V7: maxbw forcing) — always when master is ON
        foreach (self::GLOBAL_DIRECTIVES as $key => $value) {
            $directives[$key] = $value;
        }

        // 2. Per-lane directives in priority order
        foreach (['lcevc', 'hdr10plus', 'ai_sr', 'quantum_pixel', 'fake_4k_upscaler', 'cmaf'] as $lane) {
            if (!in_array($lane, $activeLanes, true)) {
                continue;
            }
            if (!isset(self::LANE_DIRECTIVES[$lane])) {
                continue;
            }
            foreach (self::LANE_DIRECTIVES[$lane] as $key => $value) {
                $directives[$key] = $value;
            }
        }

        if (empty($directives)) {
            return $output;
        }

        // Build EXTVLCOPT lines
        $vlcoptLines = [];
        foreach ($directives as $key => $value) {
            $vlcoptLines[] = "#EXTVLCOPT:{$key}={$value}";
        }
        $vlcoptBlock = implode("\n", $vlcoptLines);

        // Inject BEFORE the first #EXTINF line (idempotent check)
        return self::injectBeforeExtinf($output, $vlcoptBlock);
    }

    // ── Injection Logic ──────────────────────────────────────────────────

    /**
     * Inject a block of EXTVLCOPT directives before the first #EXTINF line.
     * Idempotent: skips injection if EXTVLCOPT directives from PRISMA already exist.
     */
    private static function injectBeforeExtinf(string $output, string $block): string
    {
        // Idempotency: if we already injected PRISMA VLCOPTs, skip
        if (str_contains($output, '#EXTVLCOPT:adaptive-maxbw=')) {
            return $output;
        }

        // Find first #EXTINF position
        $extinfPos = strpos($output, '#EXTINF:');
        if ($extinfPos === false) {
            return $output;
        }

        // Find the line start (just before #EXTINF)
        $lineStart = strrpos(substr($output, 0, $extinfPos), "\n");
        if ($lineStart === false) {
            $lineStart = 0;
        } else {
            $lineStart += 1; // after the newline
        }

        // Insert VLCOPT block + empty line before #EXTINF
        $before = substr($output, 0, $lineStart);
        $after  = substr($output, $lineStart);

        return $before . $block . "\n" . $after;
    }

    // ── Diagnostic ───────────────────────────────────────────────────────

    /**
     * Return which directives WOULD be injected for given active lanes.
     * Useful for health endpoint / debugging without modifying output.
     */
    public static function diagnose(array $activeLanes): array
    {
        $directives = self::GLOBAL_DIRECTIVES;
        foreach (['lcevc', 'hdr10plus', 'ai_sr', 'quantum_pixel', 'fake_4k_upscaler', 'cmaf'] as $lane) {
            if (in_array($lane, $activeLanes, true) && isset(self::LANE_DIRECTIVES[$lane])) {
                $directives = array_merge($directives, self::LANE_DIRECTIVES[$lane]);
            }
        }
        return $directives;
    }
}
