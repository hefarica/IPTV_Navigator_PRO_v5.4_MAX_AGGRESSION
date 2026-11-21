<?php
declare(strict_types=1);

/**
 * I07/G9 — HLS timing from the worker DNA.
 * TARGETDURATION must cover the real segment duration; no 2s lie.
 */
final class ApeHlsTiming
{
    public static function targetDuration(array $dna, int $fallback = 6): int
    {
        $seg = (int) ($dna['seg_dur'] ?? 0);
        if ($seg < 2 || $seg > 12) {
            return $fallback;
        }
        return $seg;
    }

    public static function independentSegments(array $dna): bool
    {
        return ($dna['independent_segments'] ?? false) === true;
    }
}
