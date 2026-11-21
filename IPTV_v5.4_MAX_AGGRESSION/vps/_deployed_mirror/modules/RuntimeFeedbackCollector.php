<?php
/**
 * RuntimeFeedbackCollector v3.0
 * 
 * Collects real-time telemetry from the player (startup time, buffering ratio,
 * dropped frames, stall count, real bitrate/resolution/fps, error codes).
 * Stores per-channel metrics in JSON files. Provides aggregated health scores
 * for the resolver's adaptive decisions.
 * 
 * Anti-509: This module NEVER makes requests to providers. It only reads/writes
 * local telemetry files.
 */
class RuntimeFeedbackCollector
{
    private string $storagePath;
    private int $maxSamplesPerChannel = 50;
    private int $maxAge = 86400; // 24h

    public function __construct(string $storageDirPath)
    {
        $this->storagePath = rtrim($storageDirPath, '/');
        if (!is_dir($this->storagePath)) {
            @mkdir($this->storagePath, 0755, true);
        }
    }

    /**
     * Record telemetry from the player for a specific channel.
     */
    public function recordTelemetry(string $channelId, array $metrics): array
    {
        $file = $this->getChannelFile($channelId);
        $data = $this->loadFile($file);

        // Append new sample
        $metrics['recorded_at'] = time();
        $data['samples'][] = $metrics;

        // Trim to max samples
        if (count($data['samples']) > $this->maxSamplesPerChannel) {
            $data['samples'] = array_slice($data['samples'], -$this->maxSamplesPerChannel);
        }

        // Evict samples older than maxAge
        $cutoff = time() - $this->maxAge;
        $data['samples'] = array_values(array_filter(
            $data['samples'],
            fn(array $s) => ($s['recorded_at'] ?? 0) >= $cutoff
        ));

        // Recalculate aggregates
        $data['aggregate'] = $this->aggregate($data['samples']);
        $data['last_updated'] = time();

        $this->saveFile($file, $data);

        return [
            'status'    => 'recorded',
            'channel'   => $channelId,
            'samples'   => count($data['samples']),
            'health'    => $data['aggregate']['health_score'] ?? 0,
        ];
    }

    /**
     * Get aggregated telemetry for a channel (used by variant selector and mutator).
     */
    public function getChannelTelemetry(string $channelId): array
    {
        $file = $this->getChannelFile($channelId);
        $data = $this->loadFile($file);

        if (empty($data['samples'])) {
            return [
                'has_data'     => false,
                'samples'      => 0,
                'health_score' => 100,
                'avg_startup'  => 0,
                'avg_buffering'=> 0,
                'avg_stalls'   => 0,
                'avg_bitrate'  => 0,
                'error_rate'   => 0,
            ];
        }

        return array_merge(
            $data['aggregate'] ?? [],
            [
                'has_data' => true,
                'samples'  => count($data['samples']),
            ]
        );
    }

    /**
     * Aggregate raw samples into health metrics.
     */
    private function aggregate(array $samples): array
    {
        $count = count($samples);
        if ($count === 0) {
            return ['health_score' => 100];
        }

        $totalStartup   = 0;
        $totalBuffering = 0;
        $totalDropped   = 0;
        $totalStalls    = 0;
        $totalBitrate   = 0;
        $totalFps       = 0;
        $errors         = 0;

        foreach ($samples as $s) {
            $totalStartup   += (float)($s['startup_time_ms'] ?? 0);
            $totalBuffering += (float)($s['buffering_ratio'] ?? 0);
            $totalDropped   += (int)($s['dropped_frames'] ?? 0);
            $totalStalls    += (int)($s['stall_count'] ?? 0);
            $totalBitrate   += (float)($s['bitrate_real_kbps'] ?? 0);
            $totalFps       += (float)($s['fps_real'] ?? 0);
            if (($s['error_code'] ?? 0) > 0) $errors++;
        }

        $avgStartup   = $totalStartup / $count;
        $avgBuffering = $totalBuffering / $count;
        $avgStalls    = $totalStalls / $count;
        $avgBitrate   = $totalBitrate / $count;
        $avgFps       = $totalFps / $count;
        $errorRate    = $errors / $count;

        // Health score: 100 = perfect, 0 = unwatchable
        $health = 100;
        $health -= min(30, $avgBuffering * 100);       // Buffering penalty
        $health -= min(20, $avgStalls * 5);             // Stall penalty
        $health -= min(15, $avgStartup / 200);          // Slow startup penalty (>3s)
        $health -= min(20, $errorRate * 100);            // Error penalty
        $health -= min(15, ($totalDropped / $count) / 10); // Frame drop penalty
        $health = max(0, min(100, $health));

        return [
            'health_score'  => round($health, 1),
            'avg_startup'   => round($avgStartup, 0),
            'avg_buffering' => round($avgBuffering, 4),
            'avg_stalls'    => round($avgStalls, 2),
            'avg_bitrate'   => round($avgBitrate, 0),
            'avg_fps'       => round($avgFps, 1),
            'avg_dropped'   => round($totalDropped / $count, 0),
            'error_rate'    => round($errorRate, 3),
        ];
    }

    private function getChannelFile(string $channelId): string
    {
        return $this->storagePath . '/' . md5($channelId) . '.json';
    }

    private function loadFile(string $file): array
    {
        if (!file_exists($file)) {
            return ['samples' => [], 'aggregate' => [], 'last_updated' => 0];
        }
        $raw = @file_get_contents($file);
        $data = json_decode($raw, true);
        return is_array($data) ? $data : ['samples' => [], 'aggregate' => [], 'last_updated' => 0];
    }

    private function saveFile(string $file, array $data): void
    {
        @file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE), LOCK_EX);
    }
}
