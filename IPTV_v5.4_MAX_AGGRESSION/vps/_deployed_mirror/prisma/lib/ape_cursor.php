<?php
declare(strict_types=1);

/**
 * ARA continuity cursor ledger — I01 (G1).
 *
 * Store: /dev/shm/ape_cursor/
 * Key:   md5(clientIp + '+' + ch_id)  (contract: md5(clientIp+ch_id))
 * TTL:   300 s
 *
 * No network, no dependency, no production wiring in I01.
 */
final class ApeCursor
{
    public const STORE = '/dev/shm/ape_cursor';
    public const TTL_S = 300;

    private function __construct()
    {
    }

    public static function key(string $clientIp, string|int $channelId): string
    {
        return md5($clientIp . '+' . (string) $channelId);
    }

    public static function path(string $clientIp, string|int $channelId): string
    {
        return self::STORE . '/' . self::key($clientIp, $channelId) . '.json';
    }

    /**
     * @param array<string,mixed> $fields
     */
    public static function write(string $clientIp, string|int $channelId, array $fields): bool
    {
        $lastDelivered = $fields['last_delivered'] ?? null;
        if (!is_int($lastDelivered) || $lastDelivered < 0) {
            return false;
        }
        if (!isset($fields['segment_uri']) || !is_string($fields['segment_uri'])) {
            return false;
        }

        $record = [
            'media_sequence'   => (int) ($fields['media_sequence'] ?? 0),
            'segment_uri'      => $fields['segment_uri'],
            'byte_offset'      => (int) ($fields['byte_offset'] ?? 0),
            'pts'              => (int) ($fields['pts'] ?? 0),
            'program_date_time' => (string) ($fields['program_date_time'] ?? ''),
            'last_delivered'   => $lastDelivered,
            'updated_at'       => time(),
        ];

        if (!is_dir(self::STORE) && !@mkdir(self::STORE, 0770, true) && !is_dir(self::STORE)) {
            return false;
        }

        $json = json_encode($record, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return false;
        }

        $path = self::path($clientIp, $channelId);
        $tmp = $path . '.tmp.' . getmypid();
        if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
            return false;
        }
        @chmod($tmp, 0640);
        if (!@rename($tmp, $path)) {
            @unlink($tmp);
            return false;
        }
        return true;
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function read(string $clientIp, string|int $channelId): ?array
    {
        $path = self::path($clientIp, $channelId);
        if (!is_file($path)) {
            return null;
        }
        clearstatcache(true, $path);
        $mtime = @filemtime($path);
        if ($mtime === false || (time() - $mtime) > self::TTL_S) {
            @unlink($path);
            return null;
        }
        $raw = @file_get_contents($path);
        if ($raw === false || $raw === '') {
            return null;
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : null;
    }

    /**
     * @param array<string,mixed>|null $cursor
     */
    public static function startSequence(?array $cursor): int
    {
        if (!is_array($cursor)) {
            return 1;
        }
        $last = $cursor['last_delivered'] ?? null;
        if (!is_int($last) || $last < 0) {
            return 1;
        }
        return $last + 1;
    }

    /**
     * I08/G10: write the cursor from the contract headers, only when present.
     * @param array<string,mixed> $server
     */
    public static function writeFromHeaders(string $clientIp, string|int $channelId, array $server): bool
    {
        $seq = $server['HTTP_X_APE_RESUME_SEQ'] ?? '';
        if (!is_string($seq) || !ctype_digit($seq)) {
            return false;
        }
        $segmentUri = $server['HTTP_X_APE_CURSOR'] ?? '';
        return self::write($clientIp, $channelId, [
            'media_sequence' => (int) $seq,
            'segment_uri' => is_string($segmentUri) ? $segmentUri : '',
            'last_delivered' => (int) $seq,
            'program_date_time' => gmdate('Y-m-d\TH:i:s.000\Z'),
        ]);
    }

    public static function clear(string $clientIp, string|int $channelId): bool
    {
        $path = self::path($clientIp, $channelId);
        return !is_file($path) || @unlink($path);
    }
}
