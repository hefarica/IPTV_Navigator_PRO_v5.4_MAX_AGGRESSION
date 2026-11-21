<?php
/**
 * LatencyAwareRouter v3.0
 *
 * Stores and analyzes per-stream latency measurements (RTT, TTFB, throughput).
 * When enough samples exist (>=3), it adjusts:
 * - Connection timeouts (longer for high-latency streams)
 * - Buffer sizes (larger for jittery connections)
 * - Reconnect timing (faster for unstable streams)
 * - Jitter compensation directives for the player
 *
 * Anti-509: Latency is measured by the middleware, NOT by probing providers.
 * This module only reads/writes local measurement files.
 */
class LatencyAwareRouter
{
    private string $storagePath;
    private int $maxSamples = 100;
    private int $maxAge = 3600; // 1h — latency changes faster than quality

    public function __construct(string $storageDirPath)
    {
        $this->storagePath = rtrim($storageDirPath, '/');
        if (!is_dir($this->storagePath)) {
            @mkdir($this->storagePath, 0755, true);
        }
    }

    /**
     * Record a latency measurement for a stream.
     */
    public function recordMeasurement(string $streamFingerprint, array $metrics): void
    {
        if (empty($streamFingerprint)) return;

        $file = $this->getFile($streamFingerprint);
        $data = $this->loadFile($file);

        $metrics['recorded_at'] = time();
        $data['samples'][] = $metrics;

        // Trim to max
        if (count($data['samples']) > $this->maxSamples) {
            $data['samples'] = array_slice($data['samples'], -$this->maxSamples);
        }

        // Evict old
        $cutoff = time() - $this->maxAge;
        $data['samples'] = array_values(array_filter(
            $data['samples'],
            fn(array $s) => ($s['recorded_at'] ?? 0) >= $cutoff
        ));

        $data['profile'] = $this->buildProfile($data['samples']);
        $data['last_updated'] = time();

        $this->saveFile($file, $data);
    }

    /**
     * Get the latency profile for a stream (used by the pipeline).
     */
    public function getLatencyProfile(string $streamFingerprint): array
    {
        $file = $this->getFile($streamFingerprint);
        $data = $this->loadFile($file);

        if (empty($data['samples'])) {
            return ['samples' => 0, 'category' => 'unknown'];
        }

        return array_merge(
            $data['profile'] ?? [],
            ['samples' => count($data['samples'])]
        );
    }

    /**
     * Generate adjusted timeout/buffer config based on latency profile.
     */
    public function generateTimeoutAdjustments(array $profile, array $baseResilience): array
    {
        $adjusted = $baseResilience;
        $category = $profile['category'] ?? 'normal';
        $avgRtt   = (float)($profile['avg_rtt'] ?? 50);
        $jitter   = (float)($profile['jitter'] ?? 0);

        switch ($category) {
            case 'high_latency':
                // >200ms RTT — increase timeouts significantly
                $adjusted['connection_timeout_ms'] = max(
                    (int)($baseResilience['connection_timeout_ms'] ?? 5000),
                    (int)($avgRtt * 15)
                );
                $adjusted['buffer_ms'] = max(
                    (int)($baseResilience['buffer_ms'] ?? 15000),
                    30000
                );
                $adjusted['latency_category'] = 'high';
                break;

            case 'jittery':
                // High jitter — bigger buffers, faster reconnect
                $adjusted['buffer_ms'] = max(
                    (int)($baseResilience['buffer_ms'] ?? 15000),
                    (int)(20000 + $jitter * 10)
                );
                $adjusted['reconnect_delay_pattern'] = '30,60,120';
                $adjusted['latency_category'] = 'jittery';
                break;

            case 'excellent':
                // <30ms RTT, low jitter — tighten everything for faster switching
                $adjusted['connection_timeout_ms'] = min(
                    (int)($baseResilience['connection_timeout_ms'] ?? 5000),
                    3000
                );
                $adjusted['buffer_ms'] = min(
                    (int)($baseResilience['buffer_ms'] ?? 15000),
                    10000
                );
                $adjusted['latency_category'] = 'excellent';
                break;

            default:
                $adjusted['latency_category'] = 'normal';
                break;
        }

        return $adjusted;
    }

    /**
     * Generate jitter compensation directives for the player.
     */
    public function generateJitterDirectives(array $profile, string $playerType): array
    {
        $jitter = (float)($profile['jitter'] ?? 0);
        if ($jitter < 20) {
            return []; // No jitter compensation needed
        }

        $directives = [
            'X-RQ-Jitter-Compensation' => 'active',
            'X-RQ-Jitter-Value-Ms' => (string)round($jitter, 0),
        ];

        // Player-specific jitter handling
        if ($jitter >= 100) {
            $directives['X-RQ-Jitter-Level'] = 'critical';
            $directives['X-RQ-Clock-Jitter'] = '3000';
            $directives['X-RQ-Network-Caching'] = '5000';
        } elseif ($jitter >= 50) {
            $directives['X-RQ-Jitter-Level'] = 'high';
            $directives['X-RQ-Clock-Jitter'] = '2000';
            $directives['X-RQ-Network-Caching'] = '3000';
        } else {
            $directives['X-RQ-Jitter-Level'] = 'moderate';
            $directives['X-RQ-Clock-Jitter'] = '1500';
        }

        return $directives;
    }

    /**
     * Build statistical profile from samples.
     */
    private function buildProfile(array $samples): array
    {
        $count = count($samples);
        if ($count === 0) {
            return ['category' => 'unknown'];
        }

        $rtts = [];
        $ttfbs = [];
        $throughputs = [];

        foreach ($samples as $s) {
            if (($s['rtt_ms'] ?? 0) > 0) $rtts[] = (float)$s['rtt_ms'];
            if (($s['ttfb_ms'] ?? 0) > 0) $ttfbs[] = (float)$s['ttfb_ms'];
            if (($s['throughput_kbps'] ?? 0) > 0) $throughputs[] = (float)$s['throughput_kbps'];
        }

        $avgRtt = !empty($rtts) ? array_sum($rtts) / count($rtts) : 0;
        $avgTtfb = !empty($ttfbs) ? array_sum($ttfbs) / count($ttfbs) : 0;
        $avgThroughput = !empty($throughputs) ? array_sum($throughputs) / count($throughputs) : 0;

        // Calculate jitter (standard deviation of RTT)
        $jitter = 0;
        if (count($rtts) >= 2) {
            $variance = 0;
            foreach ($rtts as $rtt) {
                $variance += ($rtt - $avgRtt) ** 2;
            }
            $jitter = sqrt($variance / count($rtts));
        }

        // Categorize
        $category = 'normal';
        if ($avgRtt > 200) {
            $category = 'high_latency';
        } elseif ($jitter > 50) {
            $category = 'jittery';
        } elseif ($avgRtt < 30 && $jitter < 10) {
            $category = 'excellent';
        }

        return [
            'avg_rtt'        => round($avgRtt, 1),
            'avg_ttfb'       => round($avgTtfb, 1),
            'avg_throughput'  => round($avgThroughput, 0),
            'jitter'         => round($jitter, 1),
            'min_rtt'        => !empty($rtts) ? round(min($rtts), 1) : 0,
            'max_rtt'        => !empty($rtts) ? round(max($rtts), 1) : 0,
            'category'       => $category,
        ];
    }

    private function getFile(string $fingerprint): string
    {
        return $this->storagePath . '/' . $fingerprint . '.json';
    }

    private function loadFile(string $file): array
    {
        if (!file_exists($file)) {
            return ['samples' => [], 'profile' => [], 'last_updated' => 0];
        }
        $raw = @file_get_contents($file);
        $data = json_decode($raw, true);
        return is_array($data) ? $data : ['samples' => [], 'profile' => [], 'last_updated' => 0];
    }

    private function saveFile(string $file, array $data): void
    {
        @file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE), LOCK_EX);
    }
}
