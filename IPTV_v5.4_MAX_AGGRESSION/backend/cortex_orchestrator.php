<?php
declare(strict_types=1);

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE CORTEX ORCHESTRATOR v8.0 (Fase 4)
 * Motor Central de Decisiones en Tiempo Real (< 60ms)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

require_once __DIR__ . '/cortex_decision_tree.php';

class CortexOrchestrator
{
    const VERSION = '8.0.0';

    /**
     * Evalúa el estado del canal/resolver y toma una decisión
     */
    public static function processRequestDecision(string $channelId, int $httpStatus, array $healthMetrics): array
    {
        $start = microtime(true);
        $decision = CortexDecisionTree::evaluate($httpStatus, $healthMetrics);
        $latencyMs = round((microtime(true) - $start) * 1000, 2);

        return [
            'decision'   => $decision,
            'latency_ms' => $latencyMs,
            'inject'     => [
                '#EXT-X-CORTEX-STATE: ' . strtoupper($decision['state']),
                '#EXT-X-CORTEX-ACTION: ' . $decision['action'],
                '#EXT-X-CORTEX-LATENCY: ' . $latencyMs . 'ms'
            ]
        ];
    }
}
