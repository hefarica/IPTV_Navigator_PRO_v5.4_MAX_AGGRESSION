<?php
declare(strict_types=1);

/**
 * APE PRISMA v1.2 — Kodi InputStream Adaptive Enhancer
 *
 * Injects #KODIPROP: directives into M3U8 manifests for Kodi players
 * using inputstream.adaptive addon. These directives are honored by:
 *   - Kodi (LibreELEC, CoreELEC, Android TV Kodi)
 *   - Any player with inputstream.adaptive support
 *
 * Directives control:
 *   - Manifest type selection (HLS/DASH)
 *   - Stream selection (adaptive/fixed)
 *   - Maximum bandwidth (force highest)
 *   - Preferred resolution
 *   - Audio language preference
 *   - Live delay minimization
 *   - HDR color conversion when Quantum Pixel active
 */

class KodiPropEnhancer
{
    // Base directives applied whenever master is ON
    private const BASE_DIRECTIVES = [
        'inputstream.adaptive.manifest_type'              => 'hls',
        'inputstream.adaptive.stream_selection_type'      => 'fixed',     // CBR: always highest, no ABR downgrade
        'inputstream.adaptive.max_bandwidth'              => '999999999',
        'inputstream.adaptive.min_bandwidth'              => '13000000',  // 13 Mbps floor (provider minimum)
        'inputstream.adaptive.initial_bandwidth'          => '80000000',  // Start at 80 Mbps (assume best)
        'inputstream.adaptive.preferred_video_resolution'  => '2160',
        'inputstream.adaptive.preferred_audio_language'   => 'es,en',
        'inputstream.adaptive.live_delay'                 => '0',
    ];

    // Additional directives when HDR lanes are active
    private const HDR_DIRECTIVES = [
        'inputstream.adaptive.hdr_color_conversion' => 'true',
    ];

    /**
     * Apply KODIPROP directives based on active lanes.
     *
     * @param string $output      Current manifest buffer
     * @param array  $activeLanes Lanes that were applied
     * @return string Modified manifest
     */
    public static function apply(string $output, array $activeLanes): string
    {
        if (empty($activeLanes)) {
            return $output;
        }

        $directives = self::BASE_DIRECTIVES;

        // HDR color conversion when Quantum Pixel or HDR10+ active
        $hdrLanes = ['quantum_pixel', 'hdr10plus'];
        if (!empty(array_intersect($activeLanes, $hdrLanes))) {
            $directives = array_merge($directives, self::HDR_DIRECTIVES);
        }

        // Build KODIPROP lines
        $kodiLines = [];
        foreach ($directives as $key => $value) {
            $kodiLines[] = "#KODIPROP:{$key}={$value}";
        }
        $kodiBlock = implode("\n", $kodiLines);

        return self::injectBeforeExtinf($output, $kodiBlock);
    }

    /**
     * Inject KODIPROP block before #EXTINF. Idempotent.
     */
    private static function injectBeforeExtinf(string $output, string $block): string
    {
        // Idempotency: skip if already injected by PRISMA
        if (str_contains($output, '#KODIPROP:inputstream.adaptive.max_bandwidth=')) {
            return $output;
        }

        $extinfPos = strpos($output, '#EXTINF:');
        if ($extinfPos === false) {
            return $output;
        }

        $lineStart = strrpos(substr($output, 0, $extinfPos), "\n");
        if ($lineStart === false) {
            $lineStart = 0;
        } else {
            $lineStart += 1;
        }

        $before = substr($output, 0, $lineStart);
        $after  = substr($output, $lineStart);

        return $before . $block . "\n" . $after;
    }

    /**
     * Diagnostic: return directives that would be injected.
     */
    public static function diagnose(array $activeLanes): array
    {
        $directives = self::BASE_DIRECTIVES;
        if (!empty(array_intersect($activeLanes, ['quantum_pixel', 'hdr10plus']))) {
            $directives = array_merge($directives, self::HDR_DIRECTIVES);
        }
        return $directives;
    }
}
