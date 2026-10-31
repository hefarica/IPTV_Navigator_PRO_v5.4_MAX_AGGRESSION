<?php
declare(strict_types=1);

/**
 * I14 — bridge classifier state into policy_deltas (the table /ara/sse reads).
 * Appends only if device_id is present; never invents channel or device.
 */
final class ApeStateBridge
{
    public static function dbPath(): string
    {
        $env = getenv('CONVIVA_DB_PATH');
        return is_string($env) && $env !== '' ? $env : '/opt/netshield/data/conviva.db';
    }

    public static function append(array $data, ?string $dbPath = null): ?int
    {
        $device = preg_replace('/[^0-9A-Za-z_.\-]/', '', (string) ($data['device_id'] ?? ''));
        if ($device === '') {
            return null;
        }
        $channel = preg_replace('/[^a-z0-9_.\-]/', '', strtolower((string) ($data['channel_id'] ?? '')));
        $flags = is_array($data['flags'] ?? null) ? $data['flags'] : [];
        $kind = (string) ($flags['kind'] ?? '');
        if (!in_array($kind, ['SLATE', 'FLAT', 'DETAIL', 'MOTION'], true)) {
            return null;
        }

        $path = $dbPath ?: self::dbPath();
        $dir = dirname($path);
        if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
            return null;
        }
        $pdo = new PDO('sqlite:' . $path, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec('PRAGMA busy_timeout=3000');
        $pdo->exec("CREATE TABLE IF NOT EXISTS policy_deltas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NULL,
            target_device_id TEXT NULL,
            channel_id TEXT NULL,
            delta_type TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 50,
            payload_json TEXT NOT NULL,
            applied_count INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'conviva-event'
        )");
        $now = time();
        $payload = [
            'class' => $kind,
            'luma' => (float) ($flags['luma'] ?? 0),
            'lap' => (float) ($flags['lap'] ?? 0),
            'motion' => (float) ($flags['motion'] ?? 0),
            'frames' => (int) ($flags['frames'] ?? 0),
            'timestamp' => gmdate('Y-m-d\TH:i:s\Z', $now),
        ];
        $stmt = $pdo->prepare('INSERT INTO policy_deltas
            (created_at, expires_at, target_device_id, channel_id, delta_type, priority, payload_json, source)
            VALUES (?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $now, $now + 30, $device, $channel !== '' ? $channel : null,
            'classifier.state', 10,
            json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            'ara_classifier',
        ]);
        return (int) $pdo->lastInsertId();
    }
}
