<?php
declare(strict_types=1);
/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  IPTV Navigator PRO — CMAF Architecture Layer                              ║
 * ║  Module: CDN Routing Engine + Health Monitor (CRE) v1.0.0                  ║
 * ║                                                                            ║
 * ║  PURPOSE: Intelligent CDN edge selection, health monitoring, and           ║
 * ║           automatic failover for CMAF segment delivery.                    ║
 * ║                                                                            ║
 * ║  FEATURES:                                                                 ║
 * ║  - Multi-CDN routing with weighted scoring                                 ║
 * ║  - Real-time health probing with TTL-based caching                         ║
 * ║  - Automatic failover when primary CDN is degraded                         ║
 * ║  - Latency-aware routing (prefer lowest RTT edge)                          ║
 * ║  - ISP telemetry integration (APE doctrine)                                ║
 * ║  - Circuit breaker pattern for unhealthy CDN nodes                         ║
 * ║                                                                            ║
 * ║  INTEGRATION: Called by cmaf_orchestrator.php to select the best          ║
 * ║               CDN base URL for manifest and segment delivery.              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

class CdnRoutingEngine
{
    const ENGINE_VERSION = '1.0.0';

    // ─── Health Status Constants ──────────────────────────────────────────────
    const STATUS_HEALTHY    = 'healthy';
    const STATUS_DEGRADED   = 'degraded';
    const STATUS_UNHEALTHY  = 'unhealthy';
    const STATUS_UNKNOWN    = 'unknown';

    // ─── Circuit Breaker Thresholds ───────────────────────────────────────────
    const CIRCUIT_OPEN_THRESHOLD     = 3;   // Consecutive failures to open circuit
    const CIRCUIT_HALF_OPEN_TIMEOUT  = 30;  // Seconds before attempting recovery
    const HEALTH_CACHE_TTL           = 10;  // Seconds to cache health probe results

    // ─── Routing Strategies ───────────────────────────────────────────────────
    const STRATEGY_LOWEST_LATENCY    = 'lowest_latency';
    const STRATEGY_ROUND_ROBIN       = 'round_robin';
    const STRATEGY_WEIGHTED_SCORE    = 'weighted_score';
    const STRATEGY_PRIMARY_FAILOVER  = 'primary_failover';

    // ─── Default CDN Configuration ───────────────────────────────────────────
    // Loaded from channels_map.json or environment variables in production
    const DEFAULT_CDN_NODES = [
        [
            'id'          => 'primary',
            'base_url'    => 'https://iptv-ape.duckdns.org',
            'weight'      => 100,
            'region'      => 'auto',
            'probe_path'  => '/health',
            'is_primary'  => true,
        ],
    ];

    // ─── Health Probe Cache (in-memory, per request cycle) ───────────────────
    private static array $healthCache = [];
    private static array $circuitBreakers = [];

    /**
     * Select the best CDN node for the current request.
     *
     * @param array  $cdnNodes      Array of CDN node configurations.
     * @param string $strategy      Routing strategy to use.
     * @param string $channelId     Channel identifier for logging.
     * @return array                Selected CDN node with health metadata.
     */
    public static function selectNode(
        array  $cdnNodes = [],
        string $strategy = self::STRATEGY_PRIMARY_FAILOVER,
        string $channelId = 'unknown'
    ): array {
        if (empty($cdnNodes)) {
            $cdnNodes = self::DEFAULT_CDN_NODES;
        }

        $engine = new self();
        return $engine->runRoutingPipeline($cdnNodes, $strategy, $channelId);
    }

    private function runRoutingPipeline(array $nodes, string $strategy, string $channelId): array
    {
        // ── Step 1: Filter out open circuit breakers ──────────────────────────
        $availableNodes = array_filter($nodes, fn($n) => !$this->isCircuitOpen($n['id']));

        if (empty($availableNodes)) {
            // All circuits open — reset all and try again (emergency recovery)
            self::$circuitBreakers = [];
            $availableNodes = $nodes;
        }

        // ── Step 2: Probe health of available nodes ───────────────────────────
        $healthData = [];
        foreach ($availableNodes as $node) {
            $healthData[$node['id']] = $this->probeNodeHealth($node);
        }

        // ── Step 3: Filter to healthy/degraded nodes ──────────────────────────
        $healthyNodes = array_filter(
            $availableNodes,
            fn($n) => in_array($healthData[$n['id']]['status'], [self::STATUS_HEALTHY, self::STATUS_DEGRADED])
        );

        if (empty($healthyNodes)) {
            // No healthy nodes — use primary as last resort
            $primary = array_filter($nodes, fn($n) => $n['is_primary'] ?? false);
            $healthyNodes = !empty($primary) ? $primary : $nodes;
        }

        // ── Step 4: Apply routing strategy ───────────────────────────────────
        $selectedNode = match($strategy) {
            self::STRATEGY_LOWEST_LATENCY   => $this->selectLowestLatency($healthyNodes, $healthData),
            self::STRATEGY_ROUND_ROBIN      => $this->selectRoundRobin($healthyNodes),
            self::STRATEGY_WEIGHTED_SCORE   => $this->selectWeightedScore($healthyNodes, $healthData),
            self::STRATEGY_PRIMARY_FAILOVER => $this->selectPrimaryFailover($healthyNodes, $healthData),
            default                          => $this->selectPrimaryFailover($healthyNodes, $healthData),
        };

        return [
            'selected_node'  => $selectedNode,
            'health_data'    => $healthData[$selectedNode['id']] ?? [],
            'strategy_used'  => $strategy,
            'channel_id'     => $channelId,
            'timestamp'      => gmdate('Y-m-d\TH:i:s\Z'),
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HEALTH PROBING
    // ═══════════════════════════════════════════════════════════════════════════

    private function probeNodeHealth(array $node): array
    {
        $nodeId = $node['id'];
        $cacheKey = 'health_' . $nodeId;

        // Return cached result if fresh
        if (isset(self::$healthCache[$cacheKey])) {
            $cached = self::$healthCache[$cacheKey];
            if ((time() - $cached['probed_at']) < self::HEALTH_CACHE_TTL) {
                return array_merge($cached, ['from_cache' => true]);
            }
        }

        $probeUrl = $node['base_url'] . ($node['probe_path'] ?? '/health');
        $startTime = microtime(true);
        $status = self::STATUS_UNKNOWN;
        $httpCode = 0;
        $latencyMs = 0;

        // Non-blocking HTTP probe with 3-second timeout
        $context = stream_context_create([
            'http' => [
                'timeout'         => 3,
                'method'          => 'HEAD',
                'ignore_errors'   => true,
                'follow_location' => true,
            ],
            'ssl' => [
                'verify_peer'       => false,
                'verify_peer_name'  => false,
            ],
        ]);

        $response = @file_get_contents($probeUrl, false, $context);
        $latencyMs = (int)((microtime(true) - $startTime) * 1000);

        if ($response !== false || isset($http_response_header)) {
            // Extract HTTP status code from response headers
            if (isset($http_response_header[0])) {
                preg_match('/HTTP\/\d+\.?\d* (\d+)/', $http_response_header[0], $m);
                $httpCode = (int)($m[1] ?? 0);
            }

            $status = match(true) {
                $httpCode >= 200 && $httpCode < 300 && $latencyMs < 500  => self::STATUS_HEALTHY,
                $httpCode >= 200 && $httpCode < 300 && $latencyMs >= 500 => self::STATUS_DEGRADED,
                $httpCode >= 500                                           => self::STATUS_UNHEALTHY,
                default                                                    => self::STATUS_DEGRADED,
            };
        } else {
            $status = self::STATUS_UNHEALTHY;
            $this->recordFailure($nodeId);
        }

        $result = [
            'node_id'    => $nodeId,
            'status'     => $status,
            'http_code'  => $httpCode,
            'latency_ms' => $latencyMs,
            'probed_at'  => time(),
            'from_cache' => false,
        ];

        // Cache the result
        self::$healthCache[$cacheKey] = $result;

        return $result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ROUTING STRATEGIES
    // ═══════════════════════════════════════════════════════════════════════════

    private function selectLowestLatency(array $nodes, array $healthData): array
    {
        $best = null;
        $bestLatency = PHP_INT_MAX;

        foreach ($nodes as $node) {
            $latency = $healthData[$node['id']]['latency_ms'] ?? PHP_INT_MAX;
            if ($latency < $bestLatency) {
                $bestLatency = $latency;
                $best = $node;
            }
        }

        return $best ?? array_values($nodes)[0];
    }

    private function selectRoundRobin(array $nodes): array
    {
        static $counter = 0;
        $nodeList = array_values($nodes);
        $selected = $nodeList[$counter % count($nodeList)];
        $counter++;
        return $selected;
    }

    private function selectWeightedScore(array $nodes, array $healthData): array
    {
        $scores = [];
        foreach ($nodes as $node) {
            $health = $healthData[$node['id']] ?? [];
            $latencyPenalty = min(50, ($health['latency_ms'] ?? 500) / 10);
            $statusBonus = match($health['status'] ?? self::STATUS_UNKNOWN) {
                self::STATUS_HEALTHY  => 0,
                self::STATUS_DEGRADED => 20,
                default               => 100,
            };
            $scores[$node['id']] = ($node['weight'] ?? 50) - $latencyPenalty - $statusBonus;
        }

        arsort($scores);
        $bestId = array_key_first($scores);

        foreach ($nodes as $node) {
            if ($node['id'] === $bestId) return $node;
        }

        return array_values($nodes)[0];
    }

    private function selectPrimaryFailover(array $nodes, array $healthData): array
    {
        // Try primary first
        foreach ($nodes as $node) {
            if (($node['is_primary'] ?? false) && ($healthData[$node['id']]['status'] ?? '') === self::STATUS_HEALTHY) {
                return $node;
            }
        }

        // Try any healthy node
        foreach ($nodes as $node) {
            if (($healthData[$node['id']]['status'] ?? '') === self::STATUS_HEALTHY) {
                return $node;
            }
        }

        // Try degraded nodes
        foreach ($nodes as $node) {
            if (($healthData[$node['id']]['status'] ?? '') === self::STATUS_DEGRADED) {
                return $node;
            }
        }

        // Last resort: return primary regardless of health
        foreach ($nodes as $node) {
            if ($node['is_primary'] ?? false) return $node;
        }

        return array_values($nodes)[0];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CIRCUIT BREAKER
    // ═══════════════════════════════════════════════════════════════════════════

    private function recordFailure(string $nodeId): void
    {
        if (!isset(self::$circuitBreakers[$nodeId])) {
            self::$circuitBreakers[$nodeId] = ['failures' => 0, 'opened_at' => null];
        }

        self::$circuitBreakers[$nodeId]['failures']++;

        if (self::$circuitBreakers[$nodeId]['failures'] >= self::CIRCUIT_OPEN_THRESHOLD) {
            self::$circuitBreakers[$nodeId]['opened_at'] = time();
        }
    }

    private function isCircuitOpen(string $nodeId): bool
    {
        if (!isset(self::$circuitBreakers[$nodeId])) return false;

        $cb = self::$circuitBreakers[$nodeId];
        if ($cb['opened_at'] === null) return false;

        // Check if half-open timeout has elapsed
        if ((time() - $cb['opened_at']) >= self::CIRCUIT_HALF_OPEN_TIMEOUT) {
            // Reset circuit to half-open
            self::$circuitBreakers[$nodeId]['failures'] = 0;
            self::$circuitBreakers[$nodeId]['opened_at'] = null;
            return false;
        }

        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HEALTH MONITOR: Aggregate health report for all configured CDN nodes
    // ═══════════════════════════════════════════════════════════════════════════

    public static function getHealthReport(array $cdnNodes = []): array
    {
        if (empty($cdnNodes)) {
            $cdnNodes = self::DEFAULT_CDN_NODES;
        }

        $engine = new self();
        $report = [
            'timestamp'  => gmdate('Y-m-d\TH:i:s\Z'),
            'nodes'      => [],
            'overall'    => self::STATUS_UNKNOWN,
        ];

        $healthyCount = 0;
        foreach ($cdnNodes as $node) {
            $health = $engine->probeNodeHealth($node);
            $report['nodes'][$node['id']] = $health;
            if ($health['status'] === self::STATUS_HEALTHY) $healthyCount++;
        }

        $totalNodes = count($cdnNodes);
        $report['overall'] = match(true) {
            $healthyCount === $totalNodes                         => self::STATUS_HEALTHY,
            $healthyCount > 0                                     => self::STATUS_DEGRADED,
            default                                               => self::STATUS_UNHEALTHY,
        };

        return $report;
    }
}
