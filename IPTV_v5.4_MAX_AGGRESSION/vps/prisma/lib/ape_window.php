<?php
declare(strict_types=1);

/**
 * ARA continuity window — I02 (G2/G6).
 *
 * Base dir: /dev/shm/ape_cmaf_cache/<ch>/
 * Policy:   keep 30 segments; when count > 30+10, delete oldest down to 30.
 * Reset:    only on channel change; normal prune never deletes below policy.
 */
final class ApeWindow
{
    public const KEEP = 30;
    public const DELETE_THRESHOLD = 10;

    private string $base;

    public function __construct(string $base = '/dev/shm/ape_cmaf_cache')
    {
        $this->base = rtrim($base, '/');
    }

    public function channelDir(string $channelId): string
    {
        $safe = preg_replace('/[^A-Za-z0-9_.-]/', '_', $channelId);
        if ($safe === null || $safe === '') {
            $safe = 'unknown';
        }
        return $this->base . '/' . $safe;
    }

    /**
     * @return list<string>
     */
    public function segments(string $channelId): array
    {
        $dir = $this->channelDir($channelId);
        $files = glob($dir . '/chunk-*.m4s') ?: [];
        $files = array_merge($files, glob($dir . '/chunk-*.ts') ?: []);
        sort($files, SORT_STRING);
        return $files;
    }

    /**
     * @return array{deleted:int,remaining:int}
     */
    public function prune(string $channelId, int $keep = self::KEEP, int $threshold = self::DELETE_THRESHOLD): array
    {
        $files = $this->segments($channelId);
        $count = count($files);
        if ($count <= $keep + $threshold) {
            return ['deleted' => 0, 'remaining' => $count];
        }

        $deleteCount = $count - $keep;
        $deleted = 0;
        for ($i = 0; $i < $deleteCount; $i++) {
            if (@unlink($files[$i])) {
                $deleted++;
            }
        }

        return ['deleted' => $deleted, 'remaining' => count($this->segments($channelId))];
    }

    public function writeState(string $channelId, array $state): bool
    {
        $dir = $this->channelDir($channelId);
        if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) {
            return false;
        }
        $path = $dir . '/.ape_window.json';
        $json = json_encode($state + ['channel_id' => $channelId, 'updated_at' => time()], JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return false;
        }
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
    public function readState(string $channelId): ?array
    {
        $path = $this->channelDir($channelId) . '/.ape_window.json';
        if (!is_file($path)) {
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
     * Channel change is the ONLY event that removes the whole window.
     */
    public function resetOnChannelChange(string $channelId): int
    {
        $dir = $this->channelDir($channelId);
        $deleted = 0;
        foreach ($this->segments($channelId) as $file) {
            if (@unlink($file)) {
                $deleted++;
            }
        }
        $state = $dir . '/.ape_window.json';
        if (is_file($state)) {
            @unlink($state);
        }
        return $deleted;
    }
}
