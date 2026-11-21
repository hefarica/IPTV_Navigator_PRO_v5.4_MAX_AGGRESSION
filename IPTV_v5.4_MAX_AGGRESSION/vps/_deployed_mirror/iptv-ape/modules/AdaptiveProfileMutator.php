<?php
declare(strict_types=1);

/**
 * AdaptiveProfileMutator — Mutador dinámico de perfil basado en retroalimentación en tiempo real.
 *
 * Este módulo transforma el pipeline de estático (por solicitud) a dinámico (por sesión),
 * ajustando el nivel de escalación y la configuración de resiliencia según la telemetría
 * real reportada por el reproductor.
 *
 * Dependencias: RuntimeFeedbackCollector (inyectado en el constructor).
 *
 * Principios de diseño:
 *   - Solo muta cuando existe telemetría REAL (no hay ajustes imaginarios)
 *   - Tasa máxima de mutación: ±1 nivel por ciclo de retroalimentación
 *   - Enfriamiento (cooldown): 30 segundos entre mutaciones para el mismo canal
 *   - SIEMPRE preserva las reglas anti-509 y anti-fantasía
 *   - Si la retroalimentación dice "saludable", MANTENER — no arreglar lo que funciona
 *   - La degradación es más agresiva que la mejora (proteger la experiencia primero)
 */

class AdaptiveProfileMutator
{
    /** @var RuntimeFeedbackCollector Colector de telemetría de reproducción */
    private readonly RuntimeFeedbackCollector $feedback;

    /** @var string Directorio para almacenar estado de cooldown por canal */
    private readonly string $cooldownDir;

    /** @var int Enfriamiento mínimo entre mutaciones para el mismo canal (segundos) */
    private readonly int $cooldownSeconds;

    /** @var int Nivel mínimo permitido (siempre 0 = PRESERVE) */
    private readonly int $minLevel;

    /** @var int Nivel máximo permitido */
    private readonly int $maxLevel;

    /** @var int Cambio máximo de nivel en una sola mutación */
    private readonly int $maxLevelDelta;

    /**
     * Constructor.
     *
     * @param RuntimeFeedbackCollector $feedback   Colector de telemetría
     * @param string                   $cooldownDir Directorio para archivos de cooldown
     * @param int                      $cooldownSeconds Segundos de espera entre mutaciones
     * @param int                      $minLevel    Nivel mínimo permitido
     * @param int                      $maxLevel    Nivel máximo permitido
     * @param int                      $maxLevelDelta Delta máximo por mutación
     */
    public function __construct(
        RuntimeFeedbackCollector $feedback,
        private readonly string $cooldownDirPath = '/tmp/rq_mutations',
        private readonly int $cooldownDuration = 30,
        private readonly int $minimumLevel = 0,
        private readonly int $maximumLevel = 8,
        private readonly int $maximumLevelDelta = 1,
    ) {
        $this->feedback = $feedback;
        $this->cooldownDir = $cooldownDirPath;
        $this->cooldownSeconds = $cooldownDuration;
        $this->minLevel = $minimumLevel;
        $this->maxLevel = $maximumLevel;
        $this->maxLevelDelta = $maximumLevelDelta;

        // Asegurar que el directorio de cooldown existe
        $this->ensureCooldownDirectory();
    }

    /**
     * Punto de entrada principal: ajustar el estado basado en retroalimentación.
     *
     * Recibe el estado actual del pipeline y el ID del canal, obtiene la telemetría
     * correspondiente, decide si mutar y aplica los cambios de forma conservadora.
     *
     * @param array  $state     Estado actual del pipeline (de resolve_quality)
     * @param string $channelId Identificador único del canal
     *
     * @return array Estado modificado con niveles ajustados y reporte de mutación
     */
    public function mutate(array $state, string $channelId): array
    {
        try {
            // Verificar cooldown antes de cualquier operación
            if ($this->isOnCooldown(channelId: $channelId)) {
                return $state;
            }

            // Obtener telemetría del canal
            $telemetry = $this->feedback->getChannelTelemetry(channelId: $channelId);

            // Sin datos de telemetría → mantener decisión v2.5 sin cambios
            if ($telemetry['samples'] === 0) {
                return $state;
            }

            // Decidir dirección y magnitud de la mutación
            $decision = $this->decideMutation(
                state: $state,
                channelId: $channelId,
                telemetry: $telemetry
            );

            // Si la decisión es MANTENER → no hacer nada
            if ($decision['direction'] === 'hold') {
                return $state;
            }

            // Capturar estado antes de la mutación (para el reporte)
            $before = $this->captureStateSnapshot(state: $state);

            // Calcular delta de nivel con signo
            $delta = match ($decision['direction']) {
                'upgrade'   => abs(num: $decision['magnitude']),
                'downgrade' => -abs(num: $decision['magnitude']),
                default     => 0,
            };

            // Aplicar mutaciones al estado
            $currentLevel = (int) ($state['escalation_level'] ?? 0);
            $newLevel = $this->applyLevelMutation(
                currentLevel: $currentLevel,
                delta: $delta
            );

            // Aplicar mutación de buffer si aplica
            $resilienceConfig = $state['resilience_config'] ?? [];
            if (isset($decision['buffer_adjustment_pct'])) {
                $resilienceConfig = $this->applyBufferMutation(
                    resilienceConfig: $resilienceConfig,
                    adjustmentPct: (float) $decision['buffer_adjustment_pct']
                );
            }

            // Aplicar mutación de resiliencia según dirección
            $resilienceConfig = $this->applyResilienceMutation(
                resilienceConfig: $resilienceConfig,
                direction: $decision['direction']
            );

            // Construir estado modificado
            $modified = $state;
            $modified['escalation_level'] = $newLevel;
            $modified['resilience_config'] = $resilienceConfig;
            $modified['adaptive_mutation'] = $decision;

            // Registrar cooldown para este canal
            $this->recordCooldown(channelId: $channelId);

            // Construir reporte de mutación
            $after = $this->captureStateSnapshot(state: $modified);
            $modified['mutation_report'] = $this->buildMutationReport(
                before: $before,
                after: $after,
                channelId: $channelId
            );

            return $modified;
        } catch (\Throwable $e) {
            // Degradación elegante: en caso de error, retornar estado sin cambios
            return $state;
        }
    }

    /**
     * Decidir dirección y magnitud de la mutación basado en telemetría y estado actual.
     *
     * Reglas de decisión (evaluadas en orden de prioridad):
     *   1. health_score > 80 AND trend = 'improving' AND startup < 1.5s AND sin drops → MEJORA (+1)
     *   2. health_score > 70 AND trend = 'stable' AND sin paradas en últimas 5 → MANTENER
     *   3. health_score < 40 OR trend = 'degrading' → DEGRADACIÓN (-1)
     *   4. buffering_ratio > 5% consistente → DEGRADACIÓN (-1) + buffer +30%
     *   5. dropped_frames > 30/min → DEGRADACIÓN (-2, máximo)
     *   6. error_rate > 10% → DEGRADACIÓN a nivel 0 (PRESERVE) + máximo reintento
     *   7. Sin datos de retroalimentación → MANTENER (preservar decisión v2.5)
     *
     * @param array  $state     Estado actual del pipeline
     * @param string $channelId ID del canal
     * @param array  $telemetry Telemetría agregada del canal
     *
     * @return array Decisión de mutación:
     *   ['direction' => string, 'magnitude' => int, 'reason' => string, 'buffer_adjustment_pct' => ?float]
     */
    private function decideMutation(array $state, string $channelId, array $telemetry): array
    {
        $health = (float) ($telemetry['health_score'] ?? 0.0);
        $trend = (string) ($telemetry['trend'] ?? 'stable');
        $startupMs = (float) ($telemetry['avg_startup_ms'] ?? 0.0);
        $bufferingRatio = (float) ($telemetry['avg_buffering_ratio'] ?? 0.0);
        $errorRate = (float) ($telemetry['error_rate'] ?? 0.0);
        $totalDrops = (int) ($telemetry['total_dropped_frames'] ?? 0);
        $totalStalls = (int) ($telemetry['total_stalls'] ?? 0);
        $samples = (int) ($telemetry['samples'] ?? 0);
        $spanMinutes = max(1.0, (float) ($telemetry['sample_span_minutes'] ?? 1.0));
        $dropsPerMin = $totalDrops / $spanMinutes;

        // No hay datos suficientes → mantener
        if ($samples === 0) {
            return [
                'direction' => 'hold',
                'magnitude' => 0,
                'reason' => 'Sin datos de telemetría: se preserva la decisión v2.5',
                'buffer_adjustment_pct' => null,
            ];
        }

        // REGLA 6: Tasa de error crítica (> 10%) → degradación máxima
        if ($errorRate > 0.10) {
            return [
                'direction' => 'downgrade',
                'magnitude' => $this->maxLevelDelta,
                'reason' => sprintf(
                    'Tasa de error crítica: %.1f%% > 10%% → degradación a nivel de preservación',
                    $errorRate * 100
                ),
                'buffer_adjustment_pct' => 30.0,
            ];
        }

        // REGLA 5: Fotogramas perdidos excesivos (> 30/min) → degradación agresiva
        if ($dropsPerMin > 30) {
            return [
                'direction' => 'downgrade',
                'magnitude' => min(2, $this->maxLevelDelta),
                'reason' => sprintf(
                    'Pérdida de fotogramas excesiva: %.0f/min > 30/min',
                    $dropsPerMin
                ),
                'buffer_adjustment_pct' => 20.0,
            ];
        }

        // REGLA 4: Ratio de buffering alto (> 5%) → degradación + buffer aumentado
        if ($bufferingRatio > 0.05) {
            return [
                'direction' => 'downgrade',
                'magnitude' => 1,
                'reason' => sprintf(
                    'Buffering excesivo: %.1f%% > 5%% → reducir calidad + aumentar buffer',
                    $bufferingRatio * 100
                ),
                'buffer_adjustment_pct' => 30.0,
            ];
        }

        // REGLA 3: Salud baja o tendencia degradándose → degradación
        if ($health < 40.0 || $trend === 'degrading') {
            return [
                'direction' => 'downgrade',
                'magnitude' => 1,
                'reason' => sprintf(
                    'Salud baja (%.0f/100) o tendencia degradándose → reducir calidad',
                    $health
                ),
                'buffer_adjustment_pct' => null,
            ];
        }

        // REGLA 2: Sistema estable y saludable → mantener
        if ($health > 70.0 && $trend === 'stable' && $totalStalls === 0) {
            return [
                'direction' => 'hold',
                'magnitude' => 0,
                'reason' => sprintf(
                    'Sistema estable (salud %.0f/100, sin paradas) → mantener configuración actual',
                    $health
                ),
                'buffer_adjustment_pct' => null,
            ];
        }

        // REGLA 1: Excelente salud, mejorando, arranque rápido, sin drops → mejora
        if (
            $health > 80.0
            && $trend === 'improving'
            && $startupMs < 1500.0
            && $dropsPerMin < 10
        ) {
            $currentLevel = (int) ($state['escalation_level'] ?? 0);
            // Solo mejorar si no estamos ya en el nivel máximo
            if ($currentLevel >= $this->maxLevel) {
                return [
                    'direction' => 'hold',
                    'magnitude' => 0,
                    'reason' => 'Nivel máximo alcanzado, sin espacio para mejora',
                    'buffer_adjustment_pct' => null,
                ];
            }

            return [
                'direction' => 'upgrade',
                'magnitude' => 1,
                'reason' => sprintf(
                    'Salud excelente (%.0f/100), tendencia mejorando, arranque %.0fms → subir calidad',
                    $health,
                    $startupMs
                ),
                'buffer_adjustment_pct' => null,
            ];
        }

        // Estado intermedio → mantener por defecto (conservador)
        return [
            'direction' => 'hold',
            'magnitude' => 0,
            'reason' => sprintf(
                'Estado intermedio (salud %.0f/100, tendencia %s) → mantener por precaución',
                $health,
                $trend
            ),
            'buffer_adjustment_pct' => null,
        ];
    }

    /**
     * Aplicar mutación de nivel con sujeción a límites.
     *
     * Restringe el delta al máximo permitido y sujeta el resultado
     * al rango [minLevel, maxLevel].
     *
     * @param int $currentLevel Nivel actual de escalación
     * @param int $delta        Cambio deseado (positivo = subir, negativo = bajar)
     *
     * @return int Nuevo nivel sujeto a límites
     */
    private function applyLevelMutation(int $currentLevel, int $delta): int
    {
        // Sujetar el delta al máximo permitido en cada dirección
        $clampedDelta = match (true) {
            $delta > 0  => min($delta, $this->maxLevelDelta),
            $delta < 0  => max($delta, -$this->maxLevelDelta),
            default     => 0,
        };

        $newLevel = $currentLevel + $clampedDelta;

        // Sujetar al rango permitido
        return max($this->minLevel, min($this->maxLevel, $newLevel));
    }

    /**
     * Aplicar mutación de buffer basada en porcentaje de ajuste.
     *
     * Modifica los valores de buffer en la configuración de resiliencia
     * con un ajuste porcentual conservador (máximo ±30%).
     *
     * @param array $resilienceConfig Configuración de resiliencia actual
     * @param float $adjustmentPct    Porcentaje de ajuste (ej: 20.0 = +20%)
     *
     * @return array Configuración de resiliencia con buffer ajustado
     */
    private function applyBufferMutation(array $resilienceConfig, float $adjustmentPct): array
    {
        // Sujetar el ajuste al máximo conservador
        $clampedPct = max(-30.0, min(30.0, $adjustmentPct));

        if ($clampedPct === 0.0) {
            return $resilienceConfig;
        }

        // Campos de buffer a ajustar (nombres típicos de ResilienceBrain)
        $bufferFields = [
            'buffer_seconds',
            'initial_buffer_seconds',
            'min_buffer_seconds',
            'buffer_target_seconds',
        ];

        $multiplier = 1.0 + ($clampedPct / 100.0);

        foreach ($bufferFields as $field) {
            if (isset($resilienceConfig[$field]) && is_numeric(value: $resilienceConfig[$field])) {
                $original = (float) $resilienceConfig[$field];
                $resilienceConfig[$field] = max(
                    1.0,
                    round(num: $original * $multiplier, precision: 1)
                );
            }
        }

        // Registrar el ajuste aplicado para trazabilidad
        $resilienceConfig['buffer_mutation_pct'] = $clampedPct;

        return $resilienceConfig;
    }

    /**
     * Aplicar mutación de resiliencia según la dirección del cambio.
     *
     * Ajusta parámetros de reintentos y timeouts según si el sistema
     * está mejorando o degradándose.
     *
     * @param array  $resilienceConfig Configuración de resiliencia actual
     * @param string $direction        Dirección de la mutación
     *
     * @return array Configuración de resiliencia con ajustes aplicados
     */
    private function applyResilienceMutation(array $resilienceConfig, string $direction): array
    {
        return match ($direction) {
            'upgrade' => $this->applyUpgradeResilience(resilienceConfig: $resilienceConfig),
            'downgrade' => $this->applyDowngradeResilience(resilienceConfig: $resilienceConfig),
            default => $resilienceConfig,
        };
    }

    /**
     * Ajustar resiliencia para dirección de mejora (reducir reintentos, optimizar).
     *
     * @param array $resilienceConfig Configuración actual
     *
     * @return array Configuración ajustada para mejora
     */
    private function applyUpgradeResilience(array $resilienceConfig): array
    {
        // Reducir reintentos si el sistema va bien (ahorrar recursos)
        if (isset($resilienceConfig['max_retries']) && $resilienceConfig['max_retries'] > 1) {
            $resilienceConfig['max_retries'] = max(
                1,
                (int) $resilienceConfig['max_retries'] - 1
            );
        }

        return $resilienceConfig;
    }

    /**
     * Ajustar resiliencia para dirección de degradación (aumentar reintentos, reforzar).
     *
     * @param array $resilienceConfig Configuración actual
     *
     * @return array Configuración ajustada para degradación
     */
    private function applyDowngradeResilience(array $resilienceConfig): array
    {
        // Aumentar reintentos para mayor resiliencia
        if (isset($resilienceConfig['max_retries'])) {
            $resilienceConfig['max_retries'] = min(
                5,
                (int) $resilienceConfig['max_retries'] + 1
            );
        }

        // Aumentar timeout de conexión
        if (isset($resilienceConfig['connect_timeout'])) {
            $current = (int) $resilienceConfig['connect_timeout'];
            $resilienceConfig['connect_timeout'] = min(30, $current + 5);
        }

        return $resilienceConfig;
    }

    /**
     * Construir reporte de mutación para registro y depuración.
     *
     * Compara el estado antes y después de la mutación y genera
     * un resumen estructurado de los cambios realizados.
     *
     * @param array  $before    Estado capturado antes de la mutación
     * @param array  $after     Estado capturado después de la mutación
     * @param string $channelId ID del canal afectado
     *
     * @return array Reporte detallado de la mutación
     */
    private function buildMutationReport(array $before, array $after, string $channelId): array
    {
        return [
            'timestamp' => time(),
            'channel_id' => $channelId,
            'level_before' => (int) ($before['escalation_level'] ?? 0),
            'level_after' => (int) ($after['escalation_level'] ?? 0),
            'level_delta' => ((int) ($after['escalation_level'] ?? 0)) - ((int) ($before['escalation_level'] ?? 0)),
            'buffer_mutation_pct' => (float) ($after['buffer_mutation_pct'] ?? 0.0),
            'resilience_before' => $before['resilience_config'] ?? [],
            'resilience_after' => $after['resilience_config'] ?? [],
            'decision' => $after['adaptive_mutation'] ?? [],
        ];
    }

    /**
     * Capturar instantánea del estado para comparación.
     *
     * @param array $state Estado actual del pipeline
     *
     * @return array Copia simplificada del estado relevante
     */
    private function captureStateSnapshot(array $state): array
    {
        return [
            'escalation_level' => (int) ($state['escalation_level'] ?? 0),
            'resilience_config' => $state['resilience_config'] ?? [],
        ];
    }

    /**
     * Verificar si un canal está en período de enfriamiento.
     *
     * @param string $channelId ID del canal
     *
     * @return bool true si el canal está en cooldown (no se puede mutar)
     */
    private function isOnCooldown(string $channelId): bool
    {
        $safeChannelId = $this->sanitizeFilename(filename: $channelId);
        $filePath = $this->cooldownDir . '/' . $safeChannelId . '.cooldown';

        if (!file_exists(filename: $filePath)) {
            return false;
        }

        $content = @file_get_contents(filename: $filePath);
        if ($content === false) {
            return false;
        }

        $lastMutation = (int) $content;
        $elapsed = time() - $lastMutation;

        return $elapsed < $this->cooldownSeconds;
    }

    /**
     * Registrar timestamp de la última mutación para un canal.
     *
     * @param string $channelId ID del canal
     */
    private function recordCooldown(string $channelId): void
    {
        $safeChannelId = $this->sanitizeFilename(filename: $channelId);
        $filePath = $this->cooldownDir . '/' . $safeChannelId . '.cooldown';

        @file_put_contents(
            filename: $filePath,
            data: (string) time(),
            flags: LOCK_EX
        );
    }

    /**
     * Asegurar que el directorio de cooldown existe.
     */
    private function ensureCooldownDirectory(): void
    {
        if (!is_dir(filename: $this->cooldownDir)) {
            @mkdir(directory: $this->cooldownDir, permissions: 0755, recursive: true);
        }
    }

    /**
     * Sanitizar un identificador para uso seguro como nombre de archivo.
     *
     * @param string $filename Nombre original
     *
     * @return string Nombre sanitizado
     */
    private function sanitizeFilename(string $filename): string
    {
        $safe = preg_replace(
            pattern: '/[^a-zA-Z0-9\-_]/',
            replacement: '_',
            subject: $filename
        );
        return substr(string: $safe, offset: 0, length: 64);
    }
}
