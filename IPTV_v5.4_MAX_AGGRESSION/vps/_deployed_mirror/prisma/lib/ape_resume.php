<?php
declare(strict_types=1);

/**
 * I05/G5 — Resume window and prefetch URL selection.
 * Reuses ApeCursor (last_delivered) and chunk-stream0-<n>.m4s names.
 */
final class ApeResume
{
    public static function segmentSequence(string $path): int
    {
        if (preg_match('/chunk-stream0-(\d+)\.m4s$/', basename($path), $m) === 1) {
            return (int) $m[1];
        }
        return 0;
    }

    /**
     * @param list<string> $segments
     * @return list<string>
     */
    public static function window(array $segments, int $startSequence, int $fallback = 5): array
    {
        if ($startSequence <= 1) {
            return array_slice($segments, -$fallback);
        }
        $out = [];
        foreach ($segments as $segment) {
            if (self::segmentSequence($segment) >= $startSequence) {
                $out[] = $segment;
            }
        }
        return $out !== [] ? $out : array_slice($segments, -$fallback);
    }

    /**
     * @param list<string> $segments
     */
    public static function firstSequence(array $segments, int $fallback = 1): int
    {
        foreach ($segments as $segment) {
            $seq = self::segmentSequence($segment);
            if ($seq > 0) {
                return $seq;
            }
        }
        return $fallback;
    }

    /**
     * @return list<string>
     */
    public static function prefetchUrls(string $baseUrl, string $channelId, int $lastDelivered, int $count = 2): array
    {
        $urls = [];
        for ($i = 1; $i <= $count; $i++) {
            $seq = $lastDelivered + $i;
            if ($seq < 1) {
                continue;
            }
            $urls[] = $baseUrl . '?sid=' . rawurlencode($channelId) . '&seg=chunk-stream0-' . $seq . '.m4s';
        }
        return $urls;
    }
}
