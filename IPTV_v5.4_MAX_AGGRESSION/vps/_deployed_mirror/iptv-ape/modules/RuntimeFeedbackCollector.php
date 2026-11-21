<?php
declare(strict_types=1);

/**
 * RuntimeFeedbackCollector — Colector y analizador de telemetría de reproducción en tiempo real.
 *
 * Este módulo implementa el circuito de retroalimentación del pipeline:
 *   SALIDA → REPRODUCTOR REPORTA TELEMETRÍA → REAJUSTE.
 *
 * Almacena muestras de telemetría en archivos JSON por canal, con una ventana
 * rodante de hasta 60 puntos de datos. Calcula un puntaje de salud (0-100)
 * ponderado y detecta tendencias para alimentar al AdaptiveProfileMutator.
 *
 * Anti-509: Este módulo SOLO RECIBE datos reportados por el reproductor,
 * nunca envía solicitudes a ningún origen.
 *
 * Almacenamiento: /tmp/rq_feedback/{channel_id}.json
 * Concurrente: usa LOCK_EX para seguridad en escritura.
 */

class RuntimeFeedbackCollector
{
    /** @var string Directorio base para almacenamiento de telemetría */
    private readonly string $storageDir;

    /** @var int Máximo de muestras por canal (ventana rodante) */
    private readonly int $maxSamples;

    /** @var int Antigüedad máxima de muestras en segundos (1 hora) */
    private readonly int $maxAgeSeconds;

    /** @var int Muestras necesarias para calcular tendencia */
    private readonly int $trendMinSamples;

    /** @var int Tamaño de ventana para comparación de tendencia */
    private readonly int $trendWindowSize;

    /**
     * Constructor.
     *
     * @param string $storageDir Ruta al directorio de almacenamiento
     */
    public function __construct(
        private readonly string $storageDirPath = '/tmp/rq_feedback',
        private readonly int $maxSamplesPerChannel = 60,
        private readonly int $sampleMaxAgeSeconds = 3600,
        private readonly int $trendMinimumSamples = 10,
        private readonly int $trendComparisonWindow = 10,
    ) {
        $this->storageDir = $storageDirPath;
        $this->maxSamples = $maxSamplesPerChannel;
        $this->maxAgeSeconds = $sampleMaxAgeSeconds;
        $this->trendMinSamples = $trendMinimumSamples;
        $this->trendWindowSize = $trendComparisonWindow;

        // Crear directorio de forma segura si no existe
        $this->ensureStorageDirectory();
    }

    /**
     * Recibir telemetría del reproductor (llamado vía endpoint ?action=feedback).
     *
     * Valida las métricas recibidas, las almacena en el archivo del canal,
     * poda datos antiguos y retorna un resumen de la operación.
     *
     * @param string $channelId Identificador único del canal
     * @param array  $metrics   Métricas reportadas por el reproductor:
     *   - startup_time_ms: int     Tiempo de arranque en milisegundos
     *   - buffering_ratio: float   Ratio de buffering (0-1)
     *   - dropped_frames: int      Fotogramas perdidos
     *   - bitrate_real_kbps: int   Bitrate real en kbps
     *   - stall_count: int         Cantidad de paradas/estancamientos
     *   - resolution_real: string  Resolución real (ej: "1920x1080")
     *   - fps_real: float          FPS reales de reproducción
     *   - error_code: int          Código de error (0 = sin error)
     *   - session_id: string       ID de la sesión del reproductor
     *   - timestamp: int           Marca temporal Unix
     *
     * @return array Resultado de la operación:
     *   ['success' => bool, 'stored' => bool, 'message' => string, 'channel_samples' => int]
     */
    public function recordTelemetry(string $channelId, array $metrics): array
    {
        try {
            // Validar campos obligatorios de la telemetría
            $validated = $this->validateMetrics(metrics: $metrics);
            if ($validated === null) {
                return [
                    'success' => false,
                    'stored' => false,
                    'message' => 'Métricas inválidas: faltan campos obligatorios',
                    'channel_samples' => 0,
                ];
            }

            // Agregar marca temporal si no fue proporcionada
            if (!isset($validated['timestamp']) || $validated['timestamp'] <= 0) {
                $validated['timestamp'] = time();
            }

            // Sanitizar channelId para uso seguro como nombre de archivo
            $safeChannelId = $this->sanitizeFilename(filename: $channelId);

            // Cargar datos existentes del canal
            $data = $this->loadChannelData(safeChannelId: $safeChannelId);

            // Agregar nueva muestra
            $data['samples'][] = $validated;

            // Podar datos antiguos (ventana rodante)
            $this->pruneOldData(safeChannelId: $safeChannelId, data: $data);

            // Guardar datos actualizados
            $saved = $this->saveChannelData(safeChannelId: $safeChannelId, data: $data);

            return [
                'success' => true,
                'stored' => $saved,
                'message' => $saved
                    ? 'Telemetría registrada exitosamente'
                    : 'Error al guardar datos de telemetría',
                'channel_samples' => count(value: $data['samples']),
            ];
        } catch (\Throwable $e) {
            // Nunca lanzar excepciones al llamador — capturar y retornar error
            return [
                'success' => false,
                'stored' => false,
                'message' => 'Error interno del colector: ' . $e->getMessage(),
                'channel_samples' => 0,
            ];
        }
    }

    /**
     * Obtener telemetría agregada para un canal.
     *
     * Calcula promedios, totales, tasa de error, puntaje de salud
     * y tendencia a partir de todas las muestras disponibles.
     *
     * @param string $channelId Identificador único del canal
     *
     * @return array Telemetría agregada:
     *   - samples: int           Número de muestras disponibles
     *   - avg_startup_ms: float  Promedio de tiempo de arranque
     *   - avg_buffering_ratio: float  Promedio de ratio de buffering
     *   - total_dropped_frames: int   Total de fotogramas perdidos
     *   - avg_bitrate_kbps: float     Promedio de bitrate real
     *   - total_stalls: int           Total de estancamientos
     *   - error_rate: float           Tasa de error (0-1)
     *   - health_score: float         Puntaje de salud (0-100)
     *   - trend: string               Tendencia: 'improving'|'stable'|'degrading'
     *   - last_seen: int              Última marca temporal registrada
     */
    public function getChannelTelemetry(string $channelId): array
    {
        try {
            $safeChannelId = $this->sanitizeFilename(filename: $channelId);
            $data = $this->loadChannelData(safeChannelId: $safeChannelId);

            // Sin datos → retornar valores vacíos/neutral
            if (empty($data['samples'])) {
                return $this->emptyTelemetryResponse();
            }

            $samples = $data['samples'];
            $count = count(value: $samples);

            // Calcular métricas agregadas
            $agg = $this->aggregateMetrics(samples: $samples);

            // Calcular puntaje de salud
            $healthScore = $this->calculateHealthScore(telemetry: $agg);

            // Detectar tendencia
            $trend = $this->detectTrend(samples: $samples);

            return [
                'samples' => $count,
                'avg_startup_ms' => $agg['avg_startup_ms'],
                'avg_buffering_ratio' => $agg['avg_buffering_ratio'],
                'total_dropped_frames' => $agg['total_dropped_frames'],
                'avg_bitrate_kbps' => $agg['avg_bitrate_kbps'],
                'total_stalls' => $agg['total_stalls'],
                'error_rate' => $agg['error_rate'],
                'health_score' => $healthScore,
                'trend' => $trend,
                'last_seen' => $agg['last_seen'],
            ];
        } catch (\Throwable $e) {
            // Degradación elegante: retornar valores neutral en caso de error
            return $this->emptyTelemetryResponse();
        }
    }

    /**
     * Generar directivas de retroalimentación que modifican el comportamiento del reproductor.
     *
     * Retorna ajustes CONSERVADORES basados en la telemetría:
     *   - buffer_increase_pct: aumento de buffer en porcentaje (máx ±30%)
     *   - retry_increase: incremento de reintentos
     *   - profile_delta: ajuste de nivel de perfil (máx ±1)
     *
     * Si no se necesitan ajustes (sistema saludable), retorna arreglo vacío.
     *
     * @param string $channelId Identificador único del canal
     *
     * @return array Directivas de ajuste, o vacío si todo está saludable
     */
    public function generateFeedbackDirectives(string $channelId): array
    {
        try {
            $telemetry = $this->getChannelTelemetry(channelId: $channelId);

            // Sin datos de telemetría → sin ajustes (preservar comportamiento v2.5)
            if ($telemetry['samples'] === 0) {
                return [];
            }

            $directives = [];
            $health = $telemetry['health_score'];
            $trend = $telemetry['trend'];
            $bufferingRatio = $telemetry['avg_buffering_ratio'];
            $errorRate = $telemetry['error_rate'];

            // Sistema saludable → sin ajustes necesarios
            if ($health >= 70.0 && $trend !== 'degrading' && $bufferingRatio < 0.05) {
                return [];
            }

            // Salud deficiente → ajustes conservadores
            // Ajustar buffer: máximo ±30%
            if ($bufferingRatio > 0.05) {
                // Ratio de buffering alto → aumentar buffer (máx 30%)
                $increase = min(
                    30.0,
                    (float) round(num: ($bufferingRatio - 0.05) * 600, precision: 1)
                );
                $directives['buffer_increase_pct'] = $increase;
            }

            // Tasa de error elevada → incrementar reintentos
            if ($errorRate > 0.05) {
                $directives['retry_increase'] = min(2, (int) ceil(num: $errorRate * 10));
            }

            // Tendencia degradándose o salud baja → sugerir reducción de perfil
            if ($trend === 'degrading' && $health < 50.0) {
                $directives['profile_delta'] = -1;
            }

            // Salud muy baja → ajustes adicionales
            if ($health < 30.0) {
                $directives['buffer_increase_pct'] = max(
                    $directives['buffer_increase_pct'] ?? 0.0,
                    30.0
                );
                $directives['retry_increase'] = max(
                    $directives['retry_increase'] ?? 0,
                    2
                );
            }

            return $directives;
        } catch (\Throwable $e) {
            // En caso de error → sin ajustes (comportamiento seguro)
            return [];
        }
    }

    /**
     * Calcular puntaje de salud (0-100) basado en métricas agregadas.
     *
     * Ponderación:
     *   - Tiempo de arranque: 30% (máx 30 puntos)
     *   - Ratio de buffering: 30% (máx 30 puntos)
     *   - Fotogramas perdidos: 20% (máx 20 puntos)
     *   - Tasa de error: 20% (máx 20 puntos)
     *
     * @param array $telemetry Métricas agregadas (desde aggregateMetrics)
     *
     * @return float Puntaje de salud de 0.0 a 100.0
     */
    private function calculateHealthScore(array $telemetry): float
    {
        $score = 0.0;

        // --- Tiempo de arranque (30 puntos máx) ---
        // < 1s = 30 pts, < 2s = 25 pts, < 3s = 15 pts, < 5s = 5 pts, >= 5s = 0 pts
        $startupMs = $telemetry['avg_startup_ms'];
        $score += match (true) {
            $startupMs < 1000   => 30.0,
            $startupMs < 2000   => 25.0,
            $startupMs < 3000   => 15.0,
            $startupMs < 5000   => 5.0,
            default             => 0.0,
        };

        // --- Ratio de buffering (30 puntos máx) ---
        // < 1% = 30 pts, < 3% = 25 pts, < 5% = 15 pts, < 10% = 5 pts, >= 10% = 0 pts
        $bufferRatio = $telemetry['avg_buffering_ratio'];
        $score += match (true) {
            $bufferRatio < 0.01  => 30.0,
            $bufferRatio < 0.03  => 25.0,
            $bufferRatio < 0.05  => 15.0,
            $bufferRatio < 0.10  => 5.0,
            default              => 0.0,
        };

        // --- Fotogramas perdidos (20 puntos máx) ---
        // Normalizar a por minuto asumiendo ~60 fps
        // < 10/min = 20 pts, < 30/min = 15 pts, < 60/min = 8 pts, >= 60/min = 0 pts
        $dropsPerMin = $telemetry['total_dropped_frames'] / max(1, $telemetry['sample_span_minutes']);
        $score += match (true) {
            $dropsPerMin < 10   => 20.0,
            $dropsPerMin < 30   => 15.0,
            $dropsPerMin < 60   => 8.0,
            default             => 0.0,
        };

        // --- Tasa de error (20 puntos máx) ---
        // < 1% = 20 pts, < 5% = 15 pts, < 10% = 8 pts, >= 10% = 0 pts
        $errorRate = $telemetry['error_rate'];
        $score += match (true) {
            $errorRate < 0.01  => 20.0,
            $errorRate < 0.05  => 15.0,
            $errorRate < 0.10  => 8.0,
            default            => 0.0,
        };

        return max(0.0, min(100.0, $score));
    }

    /**
     * Detectar tendencia comparando las últimas muestras con las anteriores.
     *
     * Compara el puntaje de salud promedio de las últimas N muestras
     * contra las N muestras anteriores. Si la diferencia es > 5%, determina
     * la tendencia como 'improving' o 'degrading'.
     *
     * @param array $samples Todas las muestras de telemetría del canal
     *
     * @return string 'improving'|'stable'|'degrading'
     */
    private function detectTrend(array $samples): string
    {
        $total = count(value: $samples);

        // Se necesitan al menos 2x la ventana de tendencia para comparar
        $minRequired = $this->trendMinSamples * 2;
        if ($total < $minRequired) {
            return 'stable';
        }

        $windowSize = $this->trendWindowSize;

        // Últimas N muestras (recientes)
        $recentSamples = array_slice(
            array: $samples,
            offset: -$windowSize,
            length: $windowSize
        );

        // N muestras anteriores a las recientes
        $previousSamples = array_slice(
            array: $samples,
            offset: -($windowSize * 2),
            length: $windowSize
        );

        // Calcular puntaje de salud promedio para cada grupo
        $recentHealth = $this->calculateBatchHealth(samples: $recentSamples);
        $previousHealth = $this->calculateBatchHealth(samples: $previousSamples);

        // Evitar división por cero
        if ($previousHealth === 0.0 && $recentHealth === 0.0) {
            return 'stable';
        }

        // Calcular porcentaje de cambio
        $baseline = max(0.01, $previousHealth);
        $changePercent = (($recentHealth - $previousHealth) / $baseline) * 100.0;

        // Umbral del 5% para considerar tendencia significativa
        $threshold = 5.0;

        return match (true) {
            $changePercent > $threshold  => 'improving',
            $changePercent < -$threshold => 'degrading',
            default                      => 'stable',
        };
    }

    /**
     * Podar datos antiguos de un canal.
     *
     * Aplica dos reglas:
     *   1. Mantener máximo $maxSamples entradas (ventana rodante)
     *   2. Eliminar muestras con más de $maxAgeSeconds de antigüedad
     *
     * @param string $safeChannelId ID de canal sanitizado
     * @param array  $data          Datos del canal (pasado por referencia implícita via return)
     *
     * @return array Datos del canal con muestras podadas
     */
    private function pruneOldData(string $safeChannelId, array $data): array
    {
        $now = time();

        // Filtrar muestras por antigüedad máxima
        $data['samples'] = array_values(
            array: array_filter(
                array: $data['samples'],
                callback: fn(array $sample): bool =>
                    isset($sample['timestamp']) && ($now - $sample['timestamp']) <= $this->maxAgeSeconds
            )
        );

        // Aplicar ventana rodante: mantener las más recientes
        if (count(value: $data['samples']) > $this->maxSamples) {
            $data['samples'] = array_slice(
                array: $data['samples'],
                offset: -$this->maxSamples
            );
        }

        return $data;
    }

    // =========================================================================
    // MÉTODOS AUXILIARES PRIVADOS
    // =========================================================================

    /**
     * Validar campos obligatorios de las métricas recibidas.
     *
     * @param array $metrics Métricas sin validar
     *
     * @return array|null Métricas validadas o null si faltan campos obligatorios
     */
    private function validateMetrics(array $metrics): ?array
    {
        // Campos obligatorios mínimos para una muestra útil
        $required = ['startup_time_ms', 'buffering_ratio', 'dropped_frames', 'error_code'];

        foreach ($required as $field) {
            if (!array_key_exists(key: $field, array: $metrics)) {
                return null;
            }
        }

        // Sanitizar tipos
        return [
            'startup_time_ms'    => (int) ($metrics['startup_time_ms'] ?? 0),
            'buffering_ratio'    => (float) ($metrics['buffering_ratio'] ?? 0.0),
            'dropped_frames'     => (int) ($metrics['dropped_frames'] ?? 0),
            'bitrate_real_kbps'  => (int) ($metrics['bitrate_real_kbps'] ?? 0),
            'stall_count'        => (int) ($metrics['stall_count'] ?? 0),
            'resolution_real'    => (string) ($metrics['resolution_real'] ?? 'unknown'),
            'fps_real'           => (float) ($metrics['fps_real'] ?? 0.0),
            'error_code'         => (int) ($metrics['error_code'] ?? 0),
            'session_id'         => (string) ($metrics['session_id'] ?? ''),
            'timestamp'          => (int) ($metrics['timestamp'] ?? 0),
        ];
    }

    /**
     * Sanitizar un identificador para uso seguro como nombre de archivo.
     *
     * @param string $filename Nombre original
     *
     * @return string Nombre sanitizado (solo alfanuméricos, guiones y guiones bajos)
     */
    private function sanitizeFilename(string $filename): string
    {
        $safe = preg_replace(
            pattern: '/[^a-zA-Z0-9\-_]/',
            replacement: '_',
            subject: $filename
        );

        // Limitar longitud para evitar nombres de archivo excesivos
        return substr(string: $safe, offset: 0, length: 64);
    }

    /**
     * Asegurar que el directorio de almacenamiento existe.
     *
     * Crea el directorio de forma segura con permisos restringidos.
     */
    private function ensureStorageDirectory(): void
    {
        if (!is_dir(filename: $this->storageDir)) {
            @mkdir(directory: $this->storageDir, permissions: 0755, recursive: true);
        }
    }

    /**
     * Construir la ruta completa al archivo de datos de un canal.
     *
     * @param string $safeChannelId ID de canal sanitizado
     *
     * @return string Ruta al archivo JSON
     */
    private function getChannelFilePath(string $safeChannelId): string
    {
        return $this->storageDir . '/' . $safeChannelId . '.json';
    }

    /**
     * Cargar datos de telemetría de un canal desde disco.
     *
     * Usa LOCK_SH para lectura segura y maneja archivos corruptos.
     *
     * @param string $safeChannelId ID de canal sanitizado
     *
     * @return array Datos del canal, o estructura vacía si no existe
     */
    private function loadChannelData(string $safeChannelId): array
    {
        $filePath = $this->getChannelFilePath(safeChannelId: $safeChannelId);

        if (!file_exists(filename: $filePath)) {
            return ['samples' => [], 'channel_id' => $safeChannelId];
        }

        $content = @file_get_contents(filename: $filePath);
        if ($content === false) {
            return ['samples' => [], 'channel_id' => $safeChannelId];
        }

        $data = json_decode(json: $content, associative: true);
        if (!is_array(value: $data)) {
            // Archivo corrupto → inicializar limpio
            return ['samples' => [], 'channel_id' => $safeChannelId];
        }

        return $data;
    }

    /**
     * Guardar datos de telemetría de un canal a disco.
     *
     * Usa LOCK_EX para escritura segura con exclusión mutua.
     *
     * @param string $safeChannelId ID de canal sanitizado
     * @param array  $data          Datos del canal a guardar
     *
     * @return bool true si se guardó exitosamente
     */
    private function saveChannelData(string $safeChannelId, array $data): bool
    {
        $filePath = $this->getChannelFilePath(safeChannelId: $safeChannelId);
        $json = json_encode(
            value: $data,
            flags: JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE
        );

        if ($json === false) {
            return false;
        }

        // LOCK_EX = bloqueo exclusivo para escritura atómica
        $result = @file_put_contents(
            filename: $filePath,
            data: $json,
            flags: LOCK_EX
        );

        return $result !== false;
    }

    /**
     * Calcular métricas agregadas a partir de muestras individuales.
     *
     * @param array $samples Muestras de telemetría
     *
     * @return array Métricas agregadas con promedios y totales
     */
    private function aggregateMetrics(array $samples): array
    {
        $count = count(value: $samples);
        if ($count === 0) {
            return $this->emptyAggregation();
        }

        $sumStartup = 0;
        $sumBuffering = 0.0;
        $sumDropped = 0;
        $sumBitrate = 0;
        $sumStalls = 0;
        $errorCount = 0;
        $lastSeen = 0;
        $firstTimestamp = PHP_INT_MAX;

        foreach ($samples as $sample) {
            $sumStartup += (int) ($sample['startup_time_ms'] ?? 0);
            $sumBuffering += (float) ($sample['buffering_ratio'] ?? 0.0);
            $sumDropped += (int) ($sample['dropped_frames'] ?? 0);
            $sumBitrate += (int) ($sample['bitrate_real_kbps'] ?? 0);
            $sumStalls += (int) ($sample['stall_count'] ?? 0);

            if (($sample['error_code'] ?? 0) !== 0) {
                $errorCount++;
            }

            $ts = (int) ($sample['timestamp'] ?? 0);
            if ($ts > $lastSeen) {
                $lastSeen = $ts;
            }
            if ($ts < $firstTimestamp) {
                $firstTimestamp = $ts;
            }
        }

        // Calcular duración de la ventana de muestras en minutos
        $spanSeconds = max(1, $lastSeen - $firstTimestamp);
        $spanMinutes = $spanSeconds / 60.0;

        return [
            'avg_startup_ms' => (float) round(num: $sumStartup / $count, precision: 1),
            'avg_buffering_ratio' => round(num: $sumBuffering / $count, precision: 4),
            'total_dropped_frames' => $sumDropped,
            'avg_bitrate_kbps' => (float) round(num: $sumBitrate / $count, precision: 1),
            'total_stalls' => $sumStalls,
            'error_rate' => round(num: $errorCount / $count, precision: 4),
            'last_seen' => $lastSeen,
            'sample_span_minutes' => $spanMinutes,
            'sample_count' => $count,
        ];
    }

    /**
     * Calcular puntaje de salud promedio para un lote de muestras.
     *
     * @param array $samples Subconjunto de muestras
     *
     * @return float Puntaje de salud promedio del lote
     */
    private function calculateBatchHealth(array $samples): float
    {
        if (empty($samples)) {
            return 0.0;
        }

        $agg = $this->aggregateMetrics(samples: $samples);
        return $this->calculateHealthScore(telemetry: $agg);
    }

    /**
     * Retornar respuesta de telemetría vacía/neutral.
     *
     * @return array Estructura de telemetría con valores por defecto
     */
    private function emptyTelemetryResponse(): array
    {
        return [
            'samples' => 0,
            'avg_startup_ms' => 0.0,
            'avg_buffering_ratio' => 0.0,
            'total_dropped_frames' => 0,
            'avg_bitrate_kbps' => 0.0,
            'total_stalls' => 0,
            'error_rate' => 0.0,
            'health_score' => 0.0,
            'trend' => 'stable',
            'last_seen' => 0,
        ];
    }

    /**
     * Retornar agregación vacía.
     *
     * @return array Estructura de agregación con valores por defecto
     */
    private function emptyAggregation(): array
    {
        return [
            'avg_startup_ms' => 0.0,
            'avg_buffering_ratio' => 0.0,
            'total_dropped_frames' => 0,
            'avg_bitrate_kbps' => 0.0,
            'total_stalls' => 0,
            'error_rate' => 0.0,
            'last_seen' => 0,
            'sample_span_minutes' => 1.0,
            'sample_count' => 0,
        ];
    }
}
