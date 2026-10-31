<?php
declare(strict_types=1);

/**
 * I04/G4+G8 — HLS discontinuity state.
 *
 * Uses cmaf_worker's worker.pid as the real restart signal.
 * First start: discontinuity_sequence=0, no DISCONTINUITY.
 * PID change:   sequence++, DISCONTINUITY=true once.
 */
final class ApeHlsState
{
    public static function transition(string $cmafDir, string $workerPid, int $now): array
    {
        $dir = rtrim($cmafDir, '/');
        $path = $dir . '/.ape_hls_state.json';
        $state = [];
        if (is_file($path)) {
            $raw = @file_get_contents($path);
            $decoded = $raw === false ? null : json_decode($raw, true);
            if (is_array($decoded)) {
                $state = $decoded;
            }
        }

        $lastPid = $state['worker_pid'] ?? null;
        $sequence = (int) ($state['discontinuity_sequence'] ?? 0);
        $restart = is_string($lastPid) && $lastPid !== '' && $workerPid !== '' && $lastPid !== $workerPid;

        if ($restart) {
            $sequence++;
        }

        $result = [
            'discontinuity_sequence' => $sequence,
            'discontinuity' => $restart,
            'program_date_time' => gmdate('Y-m-d\TH:i:s.000\Z', $now),
            'worker_pid' => $workerPid,
        ];

        if ($workerPid !== '') {
            $json = json_encode($result, JSON_UNESCAPED_SLASHES);
            if ($json !== false && is_dir($dir)) {
                $tmp = $path . '.tmp.' . getmypid();
                if (@file_put_contents($tmp, $json, LOCK_EX) !== false) {
                    @chmod($tmp, 0640);
                    @rename($tmp, $path);
                }
            }
        }

        return $result;
    }
}
