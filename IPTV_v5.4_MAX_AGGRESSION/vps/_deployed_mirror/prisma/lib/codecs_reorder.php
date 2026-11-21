<?php
declare(strict_types=1);

/**
 * APE PRISMA v1.2 — Codec Variant Reorder Engine
 *
 * When a manifest contains multiple #EXT-X-STREAM-INF variants with different
 * codecs (e.g., HEVC + AVC), this engine reorders them so the player's ABR
 * algorithm picks the higher-quality codec first.
 *
 * Priority order: AV1 > HEVC10 (hev1) > HEVC8 (hvc1) > AVC (avc1)
 *
 * Most players (ExoPlayer, hlsjs, VLC, OTT Navigator) prefer the first
 * variant that matches their decoder capabilities. By placing HEVC before AVC,
 * we ensure players with HEVC support don't fall back to AVC.
 *
 * Only acts on manifests with mixed codec variants.
 * Preserves bandwidth ordering within same codec family.
 */

class CodecsReorder
{
    // Codec priority: lower number = higher priority
    private const CODEC_PRIORITY = [
        'av01' => 0,  // AV1
        'hev1' => 1,  // HEVC Main 10
        'hvc1' => 2,  // HEVC Main
        'avc1' => 3,  // H.264/AVC
        'vp09' => 4,  // VP9
    ];

    /**
     * Reorder #EXT-X-STREAM-INF variants by codec priority.
     *
     * @param string $output  Current manifest buffer
     * @return string Modified manifest with variants reordered
     */
    public static function apply(string $output): string
    {
        // Only act on master playlists with STREAM-INF
        if (!str_contains($output, '#EXT-X-STREAM-INF')) {
            return $output;
        }

        $lines = explode("\n", $output);
        $variants = [];
        $headerLines = [];
        $otherLines = [];
        $inVariant = false;

        for ($i = 0; $i < count($lines); $i++) {
            $line = $lines[$i];

            if (str_starts_with($line, '#EXT-X-STREAM-INF:')) {
                // This line + next line (URL) form a variant pair
                $url = ($i + 1 < count($lines)) ? $lines[$i + 1] : '';
                $codec = self::extractCodecFamily($line);
                $bw = self::extractBandwidth($line);

                $variants[] = [
                    'stream_inf' => $line,
                    'url'        => $url,
                    'codec'      => $codec,
                    'bandwidth'  => $bw,
                    'priority'   => self::CODEC_PRIORITY[$codec] ?? 99,
                ];
                $i++; // skip URL line
            } elseif (empty($variants)) {
                // Lines before first variant (headers)
                $headerLines[] = $line;
            } else {
                // Lines after variants (shouldn't happen in proper master playlist)
                $otherLines[] = $line;
            }
        }

        // If no variants found or single codec, no reorder needed
        if (count($variants) < 2) {
            return $output;
        }

        // Check if mixed codecs exist
        $codecs = array_unique(array_column($variants, 'codec'));
        if (count($codecs) < 2) {
            return $output; // Single codec family, no benefit from reorder
        }

        // Sort: primary by codec priority (HEVC before AVC), secondary by bandwidth desc
        usort($variants, function ($a, $b) {
            if ($a['priority'] !== $b['priority']) {
                return $a['priority'] - $b['priority']; // Lower priority number = higher preference
            }
            return $b['bandwidth'] - $a['bandwidth']; // Higher bandwidth first within same codec
        });

        // Rebuild manifest
        $result = implode("\n", $headerLines);
        foreach ($variants as $v) {
            $result .= "\n" . $v['stream_inf'] . "\n" . $v['url'];
        }
        if (!empty($otherLines)) {
            $result .= "\n" . implode("\n", $otherLines);
        }

        return $result;
    }

    /**
     * Extract codec family from CODECS= attribute.
     * Returns 'avc1', 'hvc1', 'hev1', 'av01', or 'unknown'.
     */
    private static function extractCodecFamily(string $streamInf): string
    {
        if (!preg_match('/CODECS="([^"]+)"/', $streamInf, $m)) {
            return 'unknown';
        }

        $codecs = strtolower($m[1]);

        // Check in priority order
        if (str_contains($codecs, 'av01')) return 'av01';
        if (str_contains($codecs, 'hev1')) return 'hev1';
        if (str_contains($codecs, 'hvc1')) return 'hvc1';
        if (str_contains($codecs, 'vp09')) return 'vp09';
        if (str_contains($codecs, 'avc1')) return 'avc1';

        return 'unknown';
    }

    /**
     * Extract BANDWIDTH= value from #EXT-X-STREAM-INF.
     */
    private static function extractBandwidth(string $streamInf): int
    {
        if (preg_match('/BANDWIDTH=(\d+)/', $streamInf, $m)) {
            return (int)$m[1];
        }
        return 0;
    }

    /**
     * Diagnostic: return detected codecs and would-reorder flag.
     */
    public static function diagnose(string $manifest): array
    {
        $codecs = [];
        if (preg_match_all('/CODECS="([^"]+)"/', $manifest, $matches)) {
            foreach ($matches[1] as $c) {
                $family = 'unknown';
                $cl = strtolower($c);
                if (str_contains($cl, 'av01')) $family = 'av01';
                elseif (str_contains($cl, 'hev1')) $family = 'hev1';
                elseif (str_contains($cl, 'hvc1')) $family = 'hvc1';
                elseif (str_contains($cl, 'vp09')) $family = 'vp09';
                elseif (str_contains($cl, 'avc1')) $family = 'avc1';
                $codecs[] = $family;
            }
        }
        $unique = array_unique($codecs);
        return [
            'codecs_found'  => $unique,
            'mixed'         => count($unique) > 1,
            'would_reorder' => count($unique) > 1,
        ];
    }
}
