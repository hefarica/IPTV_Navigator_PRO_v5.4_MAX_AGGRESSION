<?php
declare(strict_types=1);

/**
 * I12 — dynamic ara_state metadata for HLS manifests.
 *
 * Source: /dev/shm/ape_state/<ch>.json
 * Required fields: class, confidence, buffer_pct, bitrate_bps, media_sequence, timestamp
 * No source file -> null (no invented defaults).
 */
final class ApeAraState
{
    public const FIELDS = ['class', 'confidence', 'buffer_pct', 'bitrate_bps', 'media_sequence', 'timestamp'];
    public const CLASSES = ['SLATE', 'FLAT', 'DETAIL', 'MOTION'];

    public static function load(string $channelId, string $base = '/dev/shm/ape_state'): ?array
    {
        $safe = preg_replace('/[^A-Za-z0-9_.-]/', '_', $channelId);
        if ($safe === null || $safe === '') {
            return null;
        }
        $path = rtrim($base, '/') . '/' . $safe . '.json';
        if (!is_file($path)) {
            return null;
        }
        $raw = @file_get_contents($path);
        if ($raw === false || $raw === '') {
            return null;
        }
        $data = json_decode($raw, true);
        return is_array($data) ? self::normalize($data) : null;
    }

    public static function normalize(array $data): ?array
    {
        if (!isset($data['class']) || !in_array($data['class'], self::CLASSES, true)) {
            return null;
        }
        $confidence = $data['confidence'] ?? null;
        $buffer = $data['buffer_pct'] ?? null;
        $bitrate = $data['bitrate_bps'] ?? null;
        $seq = $data['media_sequence'] ?? null;
        $ts = $data['timestamp'] ?? null;
        if (!is_numeric($confidence) || !is_numeric($buffer) || !is_numeric($bitrate) || !is_numeric($seq) || !is_string($ts)) {
            return null;
        }
        return [
            'class' => $data['class'],
            'confidence' => max(0.0, min(1.0, (float) $confidence)),
            'buffer_pct' => max(0, min(100, (int) $buffer)),
            'bitrate_bps' => max(0, (int) $bitrate),
            'media_sequence' => max(0, (int) $seq),
            'timestamp' => $ts,
        ];
    }

    public static function tag(?array $state): string
    {
        if ($state === null) {
            return '';
        }
        return '#EXT-X-APE-ARA-STATE:' . json_encode($state, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}
