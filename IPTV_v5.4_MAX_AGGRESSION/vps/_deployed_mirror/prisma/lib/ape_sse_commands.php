<?php
declare(strict_types=1);

/**
 * I13 — SSE command allowlist.
 * Unknown commands are rejected; numeric parameters are normalized.
 */
final class ApeSseCommands
{
    public const COMMANDS = [
        'PRE_FILL_MAX',
        'EMERGENCY_FILL',
        'UNLIMITED_BITRATE',
        'CRYSTAL-UHD-MIN',
        'CRYSTAL-UHD-MED',
        'CRYSTAL-UHD-MAX',
    ];

    public static function isAllowed(string $command): bool
    {
        return in_array($command, self::COMMANDS, true);
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>|null
     */
    public static function normalize(string $command, array $payload): ?array
    {
        if (!self::isAllowed($command)) {
            return null;
        }

        $out = [
            'command' => $command,
            'requested_at' => (string) ($payload['requested_at'] ?? gmdate('Y-m-d\TH:i:s\Z')),
        ];

        foreach (['segments', 'buffer_pct', 'bitrate_bps', 'window_span'] as $key) {
            if (isset($payload[$key]) && is_numeric($payload[$key])) {
                $out[$key] = max(0, (int) $payload[$key]);
            }
        }

        return $out;
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>|null
     */
    public static function fromDelta(string $deltaType, array $payload): ?array
    {
        $command = $payload['command'] ?? (self::isAllowed($deltaType) ? $deltaType : null);
        if (!is_string($command)) {
            return null;
        }
        return self::normalize($command, $payload);
    }
}
