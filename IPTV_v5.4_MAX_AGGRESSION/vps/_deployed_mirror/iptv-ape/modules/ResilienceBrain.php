<?php
declare(strict_types=1);

/**
 * MÓDULO 6: ResilienceBrain — Cerebro de Resiliencia
 * ====================================================
 * Configura los parámetros de reintentos, buffers, timeouts y failover
 * basándose en el nivel de escalamiento visual y las capacidades del entorno.
 *
 * Política: ESCALATION-DRIVEN
 * - Nivel 0: conservador (retry=2, buffer=15s, timeout=8s)
 * - Nivel 8: agresivo (retry=8, buffer=120s, timeout=3s)
 *
 * Modificadores aplicados:
 * - Tipo de contenido (sports ×1.4 buffer, cinema ×1.2)
 * - Valores heredados de la lista (MAX gana)
 * - Restricciones de red (bajo throughput = reducir buffer)
 * - Conexión móvil: cap en 15s
 * - Límites del guardian: nunca exceder max_buffer_ms
 *
 * @package ResolveQuality v2.5 ULTRA
 * @module  ResilienceBrain
 */

class ResilienceBrain
{
    /**
     * Configura todos los parámetros de resiliencia según el contexto.
     *
     * @param  int   $escalationLevel Nivel de escalamiento visual (0-8)
     * @param  array $capabilities    Matriz de capacidades (player + tv + network)
     * @param  array $content         Perfil de contenido (tipo, buffer_modifier, etc.)
     * @param  array $inherited       Políticas heredadas de la lista original
     * @return array Configuración de resiliencia completa
     */
    public function configure(
        int $escalationLevel,
        array $capabilities,
        array $content,
        array $inherited
    ): array {
        // Calcular cada componente de resiliencia
        $retry = $this->calculateRetryStrategy(level: $escalationLevel);
        $buffer = $this->calculateBufferTargets(
            level: $escalationLevel,
            content: $content,
            inherited: $inherited['buffer']
        );
        $timeout = $this->calculateTimeoutPolicy(level: $escalationLevel);
        $jitter = $this->buildJitterControl(level: $escalationLevel);
        $failover = $this->buildFailoverPolicy(level: $escalationLevel);

        // Aplicar límites de red a los buffers
        $buffer = $this->applyNetworkBufferLimits(
            buffers: $buffer,
            network: $capabilities['network'],
            player: $capabilities['player']
        );

        // Si hay buffer heredado más alto, usarlo (MAX gana para buffers)
        if ($inherited['buffer'] !== null) {
            $buffer['buffer_network_ms'] = max($buffer['buffer_network_ms'], $inherited['buffer']);
            $buffer['buffer_live_ms']    = max($buffer['buffer_live_ms'], $inherited['buffer']);
        }

        return [
            'retry_base'         => $retry['base'],
            'retry_max'          => $retry['max'],
            'retry_backoff'      => $retry['backoff'],
            'timeout_connect_ms' => $timeout['connect'],
            'timeout_read_ms'    => $timeout['read'],
            'timeout_total_ms'   => $timeout['total'],
            'buffer_network_ms'  => $buffer['buffer_network_ms'],
            'buffer_live_ms'     => $buffer['buffer_live_ms'],
            'buffer_file_ms'     => $buffer['buffer_file_ms'],
            'buffer_min_ms'      => $buffer['buffer_min_ms'],
            'buffer_max_ms'      => $buffer['buffer_max_ms'],
            'jitter_tolerance'   => $jitter['tolerance'],
            'jump_on_underrun'   => $jitter['jump'],
            'failover_enabled'   => $failover['enabled'],
            'failover_mode'      => $failover['mode'],
            'reconnect_max'      => $failover['reconnect_max'],
            'reconnect_delay_ms' => $failover['reconnect_delay_ms'],
            'clock_recovery'     => $escalationLevel >= 2,
            'stall_protection'   => $escalationLevel >= 1,
        ];
    }

    /**
     * Calcula la estrategia de reintentos según el nivel.
     *
     * Niveles bajos: reintentos lineales (más rápidos)
     * Niveles altos: reintentos exponenciales (más robustos)
     *
     * @param  int   $level Nivel de escalamiento (0-8)
     * @return array{base: int, max: int, backoff: string}
     */
    private function calculateRetryStrategy(int $level): array
    {
        $retryTable = [
            0 => ['base' => 2, 'backoff' => RetryBackoff::LINEAR->value],
            1 => ['base' => 3, 'backoff' => RetryBackoff::LINEAR->value],
            2 => ['base' => 4, 'backoff' => RetryBackoff::EXPONENTIAL->value],
            3 => ['base' => 5, 'backoff' => RetryBackoff::EXPONENTIAL->value],
            4 => ['base' => 6, 'backoff' => RetryBackoff::EXPONENTIAL->value],
            5 => ['base' => 7, 'backoff' => RetryBackoff::EXPONENTIAL->value],
            6 => ['base' => 8, 'backoff' => RetryBackoff::EXPONENTIAL->value],
            7 => ['base' => 8, 'backoff' => RetryBackoff::EXPONENTIAL->value],
            8 => ['base' => 8, 'backoff' => RetryBackoff::EXPONENTIAL->value],
        ];

        $config = $retryTable[min($level, 8)] ?? $retryTable[0];

        return [
            'base'    => $config['base'],
            'max'     => $config['base'] * 2,
            'backoff' => $config['backoff'],
        ];
    }

    /**
     * Calcula los targets de buffer según el nivel y modificadores.
     *
     * La tabla base define valores crecientes por nivel.
     * El modificador de contenido (sports=1.4, cinema=1.2, etc.) escala estos valores.
     *
     * @param  int      $level     Nivel de escalamiento
     * @param  array    $content   Perfil de contenido con buffer_modifier
     * @param  int|null $inherited Buffer heredado de la lista (ms), null si no hay
     * @return array{buffer_network_ms: int, buffer_live_ms: int, buffer_file_ms: int, buffer_min_ms: int, buffer_max_ms: int}
     */
    private function calculateBufferTargets(int $level, array $content, ?int $inherited): array
    {
        // Tabla base de buffers por nivel (sin modificadores de contenido)
        $bufferTable = [
            0 => ['network' => 15000, 'live' => 12000, 'file' => 5000],
            1 => ['network' => 18000, 'live' => 15000, 'file' => 6000],
            2 => ['network' => 22000, 'live' => 18000, 'file' => 7000],
            3 => ['network' => 28000, 'live' => 22000, 'file' => 8000],
            4 => ['network' => 35000, 'live' => 28000, 'file' => 10000],
            5 => ['network' => 45000, 'live' => 35000, 'file' => 12000],
            6 => ['network' => 60000, 'live' => 45000, 'file' => 15000],
            7 => ['network' => 90000, 'live' => 60000, 'file' => 20000],
            8 => ['network' => 120000, 'live' => 90000, 'file' => 25000],
        ];

        $base = $bufferTable[min($level, 8)] ?? $bufferTable[0];

        // Aplicar modificador de contenido (sports × 1.4, cinema × 1.2, etc.)
        $modifier = $content['buffer_modifier'] ?? 1.0;

        return [
            'buffer_network_ms' => (int) min(120000, $base['network'] * $modifier),
            'buffer_live_ms'    => (int) min(90000, $base['live'] * $modifier),
            'buffer_file_ms'    => (int) min(25000, $base['file'] * $modifier),
            'buffer_min_ms'     => 5000,
            'buffer_max_ms'     => 120000,
        ];
    }

    /**
     * Calcula la política de timeouts según el nivel.
     *
     * Nivel más alto = timeouts más agresivos (menos espera).
     * Se asume que en nivel alto la red es buena.
     *
     * @param  int   $level Nivel de escalamiento
     * @return array{connect: int, read: int, total: int} Timeouts en milisegundos
     */
    private function calculateTimeoutPolicy(int $level): array
    {
        $timeoutTable = [
            0 => ['connect' => 8000, 'read' => 15000, 'total' => 30000],
            1 => ['connect' => 7000, 'read' => 12000, 'total' => 25000],
            2 => ['connect' => 6000, 'read' => 10000, 'total' => 20000],
            3 => ['connect' => 5000, 'read' => 8000,  'total' => 18000],
            4 => ['connect' => 5000, 'read' => 7000,  'total' => 15000],
            5 => ['connect' => 4000, 'read' => 6000,  'total' => 12000],
            6 => ['connect' => 4000, 'read' => 5000,  'total' => 10000],
            7 => ['connect' => 3000, 'read' => 4000,  'total' => 8000],
            8 => ['connect' => 3000, 'read' => 3000,  'total' => 6000],
        ];

        return $timeoutTable[min($level, 8)] ?? $timeoutTable[0];
    }

    /**
     * Construye el control de jitter según el nivel.
     *
     * Nivel más alto = más tolerancia al jitter
     * (se asume que el buffer grande absorbe las variaciones).
     *
     * @param  int   $level Nivel de escalamiento
     * @return array{tolerance: float, jump: bool}
     */
    private function buildJitterControl(int $level): array
    {
        $tolerance = match (true) {
            $level >= 6 => 0.25,  // Tolerancia alta: buffer grande
            $level >= 4 => 0.20,
            $level >= 2 => 0.15,
            $level >= 1 => 0.10,
            default     => 0.05,  // Tolerancia baja: buffer mínimo
        };

        return [
            'tolerance' => $tolerance,
            'jump'      => $level >= 2,  // Saltar frames en under-run solo si hay buffer suficiente
        ];
    }

    /**
     * Construye la política de failover según el nivel.
     *
     * - Nivel 0: failover deshabilitado
     * - Nivel 1-2: failover manual (el usuario decide)
     * - Nivel 3+: failover seamless (automático)
     */
    private function buildFailoverPolicy(int $level): array
    {
        return [
            'enabled'           => $level >= 1,
            'mode'              => $level >= 3 ? FailoverMode::SEAMLESS->value : FailoverMode::MANUAL->value,
            'reconnect_max'     => match (true) {
                $level >= 6 => 500,   // Muchos reintentos: entorno premium
                $level >= 3 => 200,   // Reintentos moderados
                default     => 50,    // Pocos reintentos: entorno conservador
            },
            'reconnect_delay_ms' => match (true) {
                $level >= 5 => 0,      // Reconexión inmediata: buen entorno
                $level >= 3 => 500,    // Medio segundo de espera
                default     => 1000,   // Un segundo: no saturar la red
            },
        ];
    }

    /**
     * Aplica límites de red a los valores de buffer.
     *
     * El buffer no debe exceder lo que la red puede mantener:
     * throughput_kbps / 8 = bytes/seg → × 2 = máximo sostenible en ms
     *
     * Conexión móvil: cap estricto en 15s independientemente del nivel.
     */
    private function applyNetworkBufferLimits(array $buffers, array $network, array $player): array
    {
        // Calcular máximo sostenible por la red
        $throughputBytesPerSec = (int) ($network['throughput_kbps'] / 8);
        $maxSustainableMs = $throughputBytesPerSec > 0
            ? (int) ($throughputBytesPerSec * 2)
            : 5000;

        // Conexión móvil: cap estricto en 15s
        if ($network['connection_type'] === ConnectionType::MOBILE->value) {
            $maxSustainableMs = min($maxSustainableMs, 15000);
        }

        // No exceder el máximo del reproductor
        $playerMax = $player['buffer_max_ms'] ?? 60000;
        $maxSustainableMs = min($maxSustainableMs, $playerMax);

        // Aplicar límites
        $buffers['buffer_network_ms'] = min($buffers['buffer_network_ms'], $maxSustainableMs);
        $buffers['buffer_live_ms']    = min($buffers['buffer_live_ms'], $maxSustainableMs);
        $buffers['buffer_file_ms']    = min($buffers['buffer_file_ms'], $maxSustainableMs);
        $buffers['buffer_max_ms']     = min($buffers['buffer_max_ms'], $maxSustainableMs);

        // Nunca bajar del mínimo (5s)
        $buffers['buffer_network_ms'] = max($buffers['buffer_network_ms'], $buffers['buffer_min_ms']);
        $buffers['buffer_live_ms']    = max($buffers['buffer_live_ms'], $buffers['buffer_min_ms']);
        $buffers['buffer_file_ms']    = max($buffers['buffer_file_ms'], $buffers['buffer_min_ms']);

        return $buffers;
    }
}
