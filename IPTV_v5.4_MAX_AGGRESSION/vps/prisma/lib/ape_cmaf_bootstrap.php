<?php
declare(strict_types=1);

/**
 * I06/G7 — Unblock the CMAF chain.
 *
 * Writes the two files cmaf_proxy.php already reads:
 *   /dev/shm/ape_metrics/<ch>/origin_url.txt
 *   /dev/shm/ape_metrics/<ch>/target_dna.json
 *
 * Optionally launches the existing cmaf_worker.php with the same argv contract.
 */
final class ApeCmafBootstrap
{
    public static function ensure(
        string $channelId,
        string $originUrl,
        string $cmafDir,
        array $dna,
        string $metricsBase = '/dev/shm/ape_metrics',
        string $workerPath = '',
        bool $launch = true
    ): bool {
        if ($originUrl === '' || !preg_match('#^https?://#i', $originUrl)) {
            return false;
        }

        $safeCh = preg_replace('/[^A-Za-z0-9_.-]/', '_', $channelId);
        if ($safeCh === null || $safeCh === '') {
            return false;
        }

        $metricsDir = rtrim($metricsBase, '/') . '/' . $safeCh;
        if (!is_dir($metricsDir) && !@mkdir($metricsDir, 0770, true) && !is_dir($metricsDir)) {
            return false;
        }

        $originPath = $metricsDir . '/origin_url.txt';
        $dnaPath = $metricsDir . '/target_dna.json';

        if (@file_put_contents($originPath, $originUrl . "\n", LOCK_EX) === false) {
            return false;
        }
        @chmod($originPath, 0640);

        $record = [
            'codec_tag' => (string) ($dna['codec_tag'] ?? 'avc1'),
            'target_kbps' => (int) ($dna['target_kbps'] ?? 0),
            'seg_dur' => (int) ($dna['seg_dur'] ?? 6),
            'window_size' => (int) ($dna['window_size'] ?? 10),
            'extra_window_size' => (int) ($dna['extra_window_size'] ?? 20),
            'list_id' => (string) ($dna['list_id'] ?? ''),
        ];
        $json = json_encode($record, JSON_UNESCAPED_SLASHES);
        if ($json === false || @file_put_contents($dnaPath, $json, LOCK_EX) === false) {
            return false;
        }
        @chmod($dnaPath, 0640);

        if (!$launch || $workerPath === '' || !is_file($workerPath)) {
            return true;
        }

        $cmd = escapeshellarg(PHP_BINARY)
            . ' ' . escapeshellarg($workerPath)
            . ' ' . escapeshellarg($originUrl)
            . ' ' . escapeshellarg(rtrim($cmafDir, '/'))
            . ' ' . escapeshellarg($record['codec_tag'])
            . ' ' . escapeshellarg($record['list_id'])
            . ' > /dev/null 2>&1 &';
        @exec($cmd);
        return true;
    }
}
