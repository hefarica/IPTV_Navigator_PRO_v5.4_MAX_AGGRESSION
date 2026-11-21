<?php
/**
 * MultiVariantSelector v3.0
 *
 * When a channel manifest contains multiple quality variants (e.g., HLS master playlist),
 * this module selects the optimal variant based on:
 * - Device capabilities (resolution, codec support, HDR)
 * - Network conditions (measured bandwidth, latency)
 * - Player telemetry (if available from RuntimeFeedbackCollector)
 * - Content type (sports=higher fps priority, movies=higher resolution priority)
 *
 * Anti-509: This module processes manifest metadata locally. No provider requests.
 */
class MultiVariantSelector
{
    /**
     * @var array Profile bandwidth targets (kbps) per profile level
     */
    private array $profileBandwidthTargets = [
        'P0' => 50000,  // 8K
        'P1' => 25000,  // 4K HDR
        'P2' => 15000,  // 4K
        'P3' => 8000,   // FHD
        'P4' => 4000,   // HD
        'P5' => 1500,   // SD
    ];

    public function __construct()
    {
        // Stateless — no storage needed
    }

    /**
     * Select the best variant and return output override directives.
     *
     * @param array $variants    From state['manifest_dna'] — parsed manifest info
     * @param array $capabilities From state['capability_matrix'] — device/network caps
     * @param array $telemetry   From RuntimeFeedbackCollector — playback health
     * @return array             Output override directives (empty if no action needed)
     */
    public function selectBestVariant(array $variants, array $capabilities, array $telemetry): array
    {
        $directives = [];

        // Extract current state
        $deviceRes = $capabilities['tv']['resolution'] ?? '';
        $codecs    = $capabilities['player']['codecs'] ?? '';
        $bandwidth = (int)($capabilities['network']['bandwidth_kbps'] ?? 0);
        $hdr       = (bool)($capabilities['tv']['hdr'] ?? false);
        $profile   = $variants['profile'] ?? 'P3';

        // Target bandwidth from profile
        $targetBw = $this->profileBandwidthTargets[$profile] ?? 8000;

        // If telemetry shows poor health, be more conservative
        $healthScore = (float)($telemetry['health_score'] ?? 100);
        if ($healthScore < 60) {
            $targetBw = (int)($targetBw * 0.7); // Reduce by 30%
            $directives['X-RQ-Variant-Reason'] = 'health-downgrade';
        }

        // If real measured bandwidth is known, respect it
        $realBitrate = (float)($telemetry['avg_bitrate'] ?? 0);
        if ($realBitrate > 0 && $realBitrate < $targetBw * 0.8) {
            $targetBw = (int)($realBitrate * 1.1); // Target slightly above measured
            $directives['X-RQ-Variant-Reason'] = 'bandwidth-constrained';
        }

        // Set variant selection directives
        $directives['X-RQ-Variant-Target-Bandwidth'] = $targetBw . 'kbps';
        $directives['X-RQ-Variant-HDR-Preferred'] = $hdr ? 'true' : 'false';

        // Codec priority based on device
        $codecPriority = $this->selectCodecPriority($codecs, $profile);
        if (!empty($codecPriority)) {
            $directives['X-RQ-Variant-Codec-Priority'] = implode(',', $codecPriority);
        }

        // Resolution limit based on screen
        $maxRes = $this->parseMaxResolution($deviceRes);
        if ($maxRes > 0) {
            $directives['X-RQ-Variant-Max-Height'] = (string)$maxRes;
        }

        // FPS preference
        $category = $variants['category'] ?? '';
        if (stripos($category, 'sport') !== false || stripos($category, 'deporte') !== false) {
            $directives['X-RQ-Variant-Min-FPS'] = '50';
            $directives['X-RQ-Variant-FPS-Priority'] = 'true';
        }

        return $directives;
    }

    /**
     * Determine codec priority order based on device support.
     */
    private function selectCodecPriority(string $codecs, string $profile): array
    {
        $supported = array_map('trim', explode(',', strtolower($codecs)));
        $priority = [];

        // For high profiles, prefer efficient codecs
        if (in_array($profile, ['P0', 'P1', 'P2'])) {
            $order = ['av1', 'hevc', 'vp9', 'h264'];
        } else {
            // For lower profiles, prefer compatible codecs
            $order = ['h264', 'hevc', 'vp9', 'av1'];
        }

        foreach ($order as $codec) {
            if (in_array($codec, $supported) || empty($supported[0])) {
                $priority[] = $codec;
            }
        }

        return $priority;
    }

    /**
     * Parse screen resolution to max video height.
     */
    private function parseMaxResolution(string $resolution): int
    {
        if (empty($resolution)) return 0;
        $parts = explode('x', strtolower($resolution));
        if (count($parts) === 2) {
            return (int)$parts[1]; // Height
        }
        return 0;
    }
}
