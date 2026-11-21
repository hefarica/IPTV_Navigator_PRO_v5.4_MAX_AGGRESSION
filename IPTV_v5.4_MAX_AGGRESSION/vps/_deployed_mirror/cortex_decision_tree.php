<?php
declare(strict_types=1);

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE CORTEX DECISION TREE v7.0
 * Gestor Predictivo y Reactivo de Errores (400-5xx, Latencia, Degradación)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

class CortexDecisionTree
{
    /**
     * Evalúa la situación de un error HTTP o métrica anómala
     */
    public static function evaluate(int $httpStatus, array $healthMetrics): array
    {
        // Errores HTTP (401, 403, 405, 407, 429) — intentar ruta alternativa, nunca matar.
        if (in_array($httpStatus, [401, 403, 405, 407, 429])) {
            return [
                'state'  => 'DEGRADED',
                'action' => 'FALLBACK_TRIGGER',
                'reason' => 'HTTP ' . $httpStatus . '. Attempting secondary route.'
            ];
        }

        // 2. Errores de Servidor Upstream (500, 502, 503, 504)
        if ($httpStatus >= 500 && $httpStatus < 600) {
            return [
                'state'  => 'DEGRADED',
                'action' => 'FALLBACK_TRIGGER',
                'reason' => 'Upstream error ' . $httpStatus . '. Attempting secondary route.'
            ];
        }

        // 3. Fallas en métricas de vida (Buffer exhausto o latencia extrema)
        if (isset($healthMetrics['bufferState']) && $healthMetrics['bufferState'] === 'CRITICAL_DEPLETION') {
            return [
                'state'  => 'WARNING',
                'action' => 'DOWNGRADE_QUALITY',
                'reason' => 'Buffer extremely low. Applying LCEVC/Bitrate offset.'
            ];
        }

        if (isset($healthMetrics['packetLoss']) && $healthMetrics['packetLoss'] > 15.0) {
            return [
                'state'  => 'WARNING',
                'action' => 'TCP_WINDOW_INFLATE',
                'reason' => 'Packet loss > 15%. Inflating TCP receive window.'
            ];
        }

        // Todo normal
        return [
            'state'  => 'OPTIMAL',
            'action' => 'CONTINUE',
            'reason' => 'All systems functional.'
        ];
    }
}
