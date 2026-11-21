<?php
declare(strict_types=1);

/**
 * LatencyAwareRouter — Enrutador consciente de latencia de red.
 *
 * Mide y rastrea métricas de latencia de red para optimizar las decisiones
 * de enrutamiento, políticas de timeout y estrategias de buffer.
 *
 * Almacenamiento: /tmp/rq_latency/{fingerprint}.json
 * Huella digital del stream: MD5(URL del stream + host CDN)
 *
 * Principios de diseño:
 *   - Las mediciones son PASIVAS: se registran desde el timing real de solicitudes,
 *     nunca se envían sondas o probes activos
 *   - Ventana rodante de 100 mediciones por huella digital
 *   - El jitter se calcula como desviación estándar del RTT (mínimo 5 muestras)
 *   - Los ajustes por grado de calidad modifican los valores de v2.5
 *     pero nunca bajan de los mínimos del GuardianPolicyEngine
 *   - Sin mediciones → ajustes neutrales (sin modificación)
 */

class LatencyAwareRouter
{
    /** @var string Directorio base para almacenamiento de mediciones */
    private readonly string $storageDir;

    /** @var int Máximo de mediciones por huella digital (ventana rodante) */
    private readonly int $maxMeasurements;

    /** @var int Antigüedad máxima de mediciones en segundos (30 minutos) */
    private readonly int $maxAgeSeconds;

    /** @var int Muestras mínimas necesarias para calcular jitter */
    private readonly int $jitterMinSamples;

    /**
     * Constructor.
     *
     * @param string $storageDir Directorio para almacenamiento de datos de latencia
     */
    public function __construct(
        private readonly string $storageDirPath = '/tmp/rq_latency',
        private readonly int $maxMeasurementsPerFingerprint = 100,
        private readonly int $measurementMaxAgeSeconds = 1800,
        private readonly int $jitterMinimumSamples = 5,
    ) {
        $this->storageDir = $storageDirPath;
        $this->maxMeasurements = $maxMeasurementsPerFingerprint;
        $this->maxAgeSeconds = $measurementMaxAgeSeconds;
        $this->jitterMinSamples = $this->jitterMinimumSamples;

        $this->ensureStorageDirectory();
    }

    /**
     * Registrar medición de latencia desde el timing de una solicitud.
     *
     * Este método se llama pasivamente después de que una solicitud HTTP
     * ha sido procesada, registrando los tiempos medidos.
     *
     * @param string $streamFingerprint Huella digital del stream (MD5 de URL + host CDN)
     * @param array  $metrics           Métricas de latencia medidas:
     *   - rtt_ms: int           Tiempo total de ida y vuelta (ms)
     *   - dns_ms: int           Tiempo de resolución DNS (ms, si disponible)
     *   - handshake_ms: int     Tiempo de handshake TLS (ms, si disponible)
     *   - ttfb_ms: int          Time to First Byte (ms)
     *   - total_ms: int         Tiempo total de la solicitud (ms)
     *   - throughput_kbps: int  Throughput estimado (kbps, de content-length / tiempo)
     */
    public function recordMeasurement(string $streamFingerprint, array $metrics): void
    {
        try {
            // Validar métricas mínimas
            $validated = $this->validateMetrics(metrics: $metrics);
            if ($validated === null) {
                return;
            }

            // Sanitizar huella digital para nombre de archivo
            $safeFingerprint = $this->sanitizeFilename(filename: $streamFingerprint);

            // Cargar datos existentes
            $data = $this->loadFingerprintData(safeFingerprint: $safeFingerprint);

            // Agregar nueva medición
            $data['measurements'][] = $validated;

            // Podar mediciones antiguas
            $data = $this->pruneOldMeasurements(safeFingerprint: $safeFingerprint, data: $data);

            // Guardar datos actualizados
            $this->saveFingerprintData(safeFingerprint: $safeFingerprint, data: $data);
        } catch (\Throwable $e) {
            // Silencioso: las mediciones de latencia no deben interrumpir el flujo
        }
    }

    /**
     * Obtener el perfil de latencia actual para un stream.
     *
     * Calcula promedios, jitter (desviación estándar del RTT), estimación
     * de pérdida de paquetes y asigna un grado de calidad.
     *
     * @param string $streamFingerprint Huella digital del stream
     *
     * @return array Perfil de latencia:
     *   - avg_rtt_ms: float          Promedio de RTT
     *   - avg_ttfb_ms: float         Promedio de Time to First Byte
     *   - avg_throughput_kbps: float  Promedio de throughput
     *   - jitter_ms: float           Jitter (desviación estándar del RTT)
     *   - packet_loss_estimate: float Estimación de pérdida de paquetes
     *   - quality_grade: string      Grado: 'excellent'|'good'|'fair'|'poor'|'critical'
     *   - samples: int               Número de muestras
     *   - last_updated: int          Última marca temporal
     */
    public function getLatencyProfile(string $streamFingerprint): array
    {
        try {
            $safeFingerprint = $this->sanitizeFilename(filename: $streamFingerprint);
            $data = $this->loadFingerprintData(safeFingerprint: $safeFingerprint);

            if (empty($data['measurements'])) {
                return $this->emptyLatencyProfile();
            }

            $measurements = $data['measurements'];
            $count = count(value: $measurements);

            // Calcular promedios
            $sumRtt = 0.0;
            $sumTtfb = 0.0;
            $sumThroughput = 0.0;
            $lastUpdated = 0;
            $rttValues = [];

            foreach ($measurements as $m) {
                $rtt = (float) ($m['rtt_ms'] ?? 0);
                $ttfb = (float) ($m['ttfb_ms'] ?? 0);
                $throughput = (float) ($m['throughput_kbps'] ?? 0);
                $timestamp = (int) ($m['timestamp'] ?? 0);

                $sumRtt += $rtt;
                $sumTtfb += $ttfb;
                $sumThroughput += $throughput;
                $rttValues[] = $rtt;

                if ($timestamp > $lastUpdated) {
                    $lastUpdated = $timestamp;
                }
            }

            $avgRtt = $count > 0 ? $sumRtt / $count : 0.0;
            $avgTtfb = $count > 0 ? $sumTtfb / $count : 0.0;
            $avgThroughput = $count > 0 ? $sumThroughput / $count : 0.0;

            // Calcular jitter (desviación estándar del RTT)
            $jitter = $this->calculateJitter(rttValues: $rttValues);

            // Estimar pérdida de paquetes basándose en patrones de retransmisión
            $packetLoss = $this->estimatePacketLoss(
                measurements: $measurements,
                avgRtt: $avgRtt
            );

            $profile = [
                'avg_rtt_ms' => round(num: $avgRtt, precision: 1),
                'avg_ttfb_ms' => round(num: $avgTtfb, precision: 1),
                'avg_throughput_kbps' => round(num: $avgThroughput, precision: 1),
                'jitter_ms' => round(num: $jitter, precision: 1),
                'packet_loss_estimate' => round(num: $packetLoss, precision: 4),
                'quality_grade' => 'good', // Se asignará abajo
                'samples' => $count,
                'last_updated' => $lastUpdated,
            ];

            // Asignar grado de calidad
            $profile['quality_grade'] = $this->calculateGrade(profile: $profile);

            return $profile;
        } catch (\Throwable $e) {
            return $this->emptyLatencyProfile();
        }
    }

    /**
     * Generar ajustes de timeout basados en el perfil de latencia.
     *
     * Modifica los valores de la configuración de resiliencia (v2.5)
     * según el grado de calidad de la conexión:
     *   - excellent: reducir timeouts 30%, reducir buffer 20% (red rápida)
     *   - good:      usar valores base (sin cambios)
     *   - fair:      aumentar timeouts 50%, aumentar buffer 30%
     *   - poor:      aumentar timeouts 100%, aumentar buffer 60%
     *   - critical:  aumentar timeouts 200%, aumentar buffer 100%, forzar retry máximo
     *
     * @param array $profile         Perfil de latencia del stream
     * @param array $baseResilience  Configuración de resiliencia base (de v2.5)
     *
     * @return array Ajustes de timeout y buffer para aplicar
     */
    public function generateTimeoutAdjustments(array $profile, array $baseResilience): array
    {
        try {
            // Sin mediciones → ajustes neutrales
            if (($profile['samples'] ?? 0) === 0) {
                return [];
            }

            $grade = (string) ($profile['quality_grade'] ?? 'good');

            // Factores de ajuste según grado de calidad
            $adjustments = match ($grade) {
                'excellent' => [
                    'timeout_multiplier' => 0.70,   // Reducir 30%
                    'buffer_multiplier'  => 0.80,   // Reducir 20%
                    'description'        => 'Red excelente: timeouts reducidos, buffer optimizado',
                ],
                'good' => [
                    'timeout_multiplier' => 1.00,   // Sin cambios
                    'buffer_multiplier'  => 1.00,   // Sin cambios
                    'description'        => 'Red buena: se usan valores base de v2.5',
                ],
                'fair' => [
                    'timeout_multiplier' => 1.50,   // Aumentar 50%
                    'buffer_multiplier'  => 1.30,   // Aumentar 30%
                    'description'        => 'Red regular: timeouts aumentados, buffer reforzado',
                ],
                'poor' => [
                    'timeout_multiplier' => 2.00,   // Aumentar 100%
                    'buffer_multiplier'  => 1.60,   // Aumentar 60%
                    'description'        => 'Red deficiente: timeouts duplicados, buffer aumentado',
                ],
                'critical' => [
                    'timeout_multiplier' => 3.00,   // Aumentar 200%
                    'buffer_multiplier'  => 2.00,   // Aumentar 100%
                    'description'        => 'Red crítica: timeouts triplicados, buffer máximo, retry forzado',
                ],
                default => [
                    'timeout_multiplier' => 1.00,
                    'buffer_multiplier'  => 1.00,
                    'description'        => 'Grado desconocido: sin ajustes',
                ],
            };

            // Aplicar multiplicadores a la configuración base
            $modified = $this->applyTimeoutMultipliers(
                baseResilience: $baseResilience,
                timeoutMultiplier: (float) $adjustments['timeout_multiplier'],
                bufferMultiplier: (float) $adjustments['buffer_multiplier']
            );

            // Caso crítico: forzar retry máximo
            if ($grade === 'critical') {
                $modified['force_max_retry'] = true;
            }

            $modified['latency_grade'] = $grade;
            $modified['latency_description'] = $adjustments['description'];

            return $modified;
        } catch (\Throwable $e) {
            return [];
        }
    }

    /**
     * Generar directivas de compensación de jitter.
     *
     * Cuando el jitter es alto, se incrementa el buffer y se añaden
     * directivas de estabilización para el reproductor.
     *
     * @param array  $profile     Perfil de latencia del stream
     * @param string $playerType  Tipo de reproductor
     *
     * @return array Directivas de compensación de jitter
     */
    public function generateJitterDirectives(array $profile, string $playerType): array
    {
        try {
            // Sin mediciones → sin directivas
            if (($profile['samples'] ?? 0) === 0) {
                return [];
            }

            $jitter = (float) ($profile['jitter_ms'] ?? 0.0);
            $grade = (string) ($profile['quality_grade'] ?? 'good');

            $directives = [];

            // Clasificar nivel de jitter
            $jitterLevel = match (true) {
                $jitter < 5.0   => 'low',
                $jitter < 15.0  => 'moderate',
                $jitter < 30.0  => 'high',
                default          => 'severe',
            };

            // Jitter alto o severo → directivas de estabilización
            if ($jitterLevel === 'high' || $jitterLevel === 'severe') {
                $directives['jitter_compensation'] = true;
                $directives['jitter_level'] = $jitterLevel;
                $directives['jitter_ms'] = $jitter;

                // Incrementar buffer proporcional al jitter
                $bufferIncrease = match ($jitterLevel) {
                    'high'   => 25.0,  // +25% buffer
                    'severe' => 40.0,  // +40% buffer
                    default  => 0.0,
                };
                $directives['buffer_increase_pct'] = $bufferIncrease;

                // Directivas específicas por reproductor
                $playerType = strtolower(string: $playerType);

                if (str_contains(haystack: $playerType, needle: 'vlc')) {
                    $directives['clock-jitter'] = 0;
                    $directives['deinterlace'] = true;
                    $directives['network-caching'] = max(
                        1000,
                        (int) ($jitter * 100)  // 100ms por cada 1ms de jitter
                    );
                }

                if (str_contains(haystack: $playerType, needle: 'exo')) {
                    $directives['X-Jitter-Compensation'] = (string) $bufferIncrease;
                    $directives['X-Buffer-Target'] = 'increased';
                }

                if (str_contains(haystack: $playerType, needle: 'ott')
                    || str_contains(haystack: $playerType, needle: 'stalker')
                ) {
                    $directives['X-Jitter-Buffer'] = (string) (int) ($jitter * 2);
                }
            } elseif ($jitterLevel === 'moderate') {
                // Jitter moderado → solo registro, sin ajustes agresivos
                $directives['jitter_level'] = $jitterLevel;
                $directives['jitter_ms'] = $jitter;
                $directives['jitter_compensation'] = false;
            }

            // Jitter bajo → directivas estándar (sin compensación)
            return $directives;
        } catch (\Throwable $e) {
            return [];
        }
    }

    /**
     * Generar huella digital de un stream a partir de su URL y host CDN.
     *
     * @param string $streamUrl URL del stream
     * @param string $cdnHost   Host del CDN (si se conoce)
     *
     * @return string Huella digital MD5
     */
    public function generateFingerprint(string $streamUrl, string $cdnHost = ''): string
    {
        $input = $streamUrl;
        if (!empty($cdnHost)) {
            $input .= '|' . $cdnHost;
        }
        return md5(string: $input);
    }

    // =========================================================================
    // MÉTODOS PRIVADOS
    // =========================================================================

    /**
     * Calcular el grado de calidad basado en las métricas de latencia.
     *
     * Criterios:
     *   - excellent: RTT < 30ms, throughput > 30000kbps, jitter < 5ms
     *   - good:      RTT < 60ms, throughput > 15000kbps, jitter < 15ms
     *   - fair:      RTT < 120ms, throughput > 5000kbps, jitter < 30ms
     *   - poor:      RTT < 200ms, throughput > 1500kbps, jitter < 50ms
     *   - critical:  cualquier valor peor que los anteriores
     *
     * Se evalúa usando el PEOR criterio que no se cumpla (conservador).
     *
     * @param array $profile Perfil de latencia con métricas calculadas
     *
     * @return string Grado de calidad: 'excellent'|'good'|'fair'|'poor'|'critical'
     */
    private function calculateGrade(array $profile): string
    {
        $rtt = (float) ($profile['avg_rtt_ms'] ?? PHP_FLOAT_MAX);
        $throughput = (float) ($profile['avg_throughput_kbps'] ?? 0);
        $jitter = (float) ($profile['jitter_ms'] ?? PHP_FLOAT_MAX);

        // Evaluar cada criterio (de mejor a peor)
        $rttGrade = match (true) {
            $rtt < 30   => 'excellent',
            $rtt < 60   => 'good',
            $rtt < 120  => 'fair',
            $rtt < 200  => 'poor',
            default      => 'critical',
        };

        $throughputGrade = match (true) {
            $throughput > 30000  => 'excellent',
            $throughput > 15000  => 'good',
            $throughput > 5000   => 'fair',
            $throughput > 1500   => 'poor',
            default              => 'critical',
        };

        $jitterGrade = match (true) {
            $jitter < 5   => 'excellent',
            $jitter < 15  => 'good',
            $jitter < 30  => 'fair',
            $jitter < 50  => 'poor',
            default        => 'critical',
        };

        // Mapa de grados a valor numérico (mayor = peor)
        $gradeWeight = [
            'excellent' => 0,
            'good'      => 1,
            'fair'      => 2,
            'poor'      => 3,
            'critical'  => 4,
        ];

        // El grado final es el PEOR de los tres (conservador)
        $worstGrade = max(
            $gradeWeight[$rttGrade] ?? 2,
            $gradeWeight[$throughputGrade] ?? 2,
            $gradeWeight[$jitterGrade] ?? 2,
        );

        // Buscar el nombre del grado por su peso
        foreach ($gradeWeight as $name => $weight) {
            if ($weight === $worstGrade) {
                return $name;
            }
        }

        return 'fair';
    }

    /**
     * Calcular jitter como desviación estándar de los valores de RTT.
     *
     * Requiere un mínimo de muestras para ser estadísticamente significativo.
     *
     * @param array $rttValues Valores de RTT individuales (ms)
     *
     * @return float Desviación estándar del RTT en ms, o 0.0 si insuficientes muestras
     */
    private function calculateJitter(array $rttValues): float
    {
        $count = count(value: $rttValues);

        if ($count < $this->jitterMinSamples) {
            return 0.0;
        }

        // Calcular media
        $sum = array_sum(array: $rttValues);
        $mean = $sum / $count;

        // Calcular varianza (desviación estándar poblacional)
        $sumSquaredDiff = 0.0;
        foreach ($rttValues as $value) {
            $diff = $value - $mean;
            $sumSquaredDiff += $diff * $diff;
        }

        $variance = $sumSquaredDiff / $count;

        return sqrt(num: $variance);
    }

    /**
     * Estimar pérdida de paquetes basándose en patrones de las mediciones.
     *
     * Usa heurísticas simples:
     *   - Variación inusual de RTT → posible pérdida
     *   - RTT spikes (valores > 3x la media) → probable pérdida
     *   - TTFB inconsistentes → posible pérdida
     *
     * @param array $measurements Mediciones de latencia
     * @param float $avgRtt       RTT promedio
     *
     * @return float Estimación de pérdida de paquetes (0.0 a 1.0)
     */
    private function estimatePacketLoss(array $measurements, float $avgRtt): float
    {
        $count = count(value: $measurements);
        if ($count < 3 || $avgRtt <= 0) {
            return 0.0;
        }

        $spikeCount = 0;
        $threshold = $avgRtt * 3.0; // Spike = 3x la media

        foreach ($measurements as $m) {
            $rtt = (float) ($m['rtt_ms'] ?? 0);
            if ($rtt > $threshold) {
                $spikeCount++;
            }
        }

        // Estimar pérdida como ratio de spikes
        return round(num: $spikeCount / $count, precision: 4);
    }

    /**
     * Aplicar multiplicadores de timeout y buffer a la configuración base.
     *
     * Modifica los valores de timeouts y buffers de la configuración
     * de resiliencia con los factores correspondientes al grado de calidad.
     *
     * @param array $baseResilience    Configuración base de resiliencia
     * @param float $timeoutMultiplier Multiplicador para timeouts
     * @param float $bufferMultiplier  Multiplicador para buffers
     *
     * @return array Configuración modificada con ajustes de latencia
     */
    private function applyTimeoutMultipliers(
        array $baseResilience,
        float $timeoutMultiplier,
        float $bufferMultiplier
    ): array {
        $modified = $baseResilience;

        // Campos de timeout a ajustar
        $timeoutFields = [
            'connect_timeout',
            'request_timeout',
            'stream_timeout',
            'dns_timeout',
            'handshake_timeout',
        ];

        // Aplicar multiplicador de timeout
        foreach ($timeoutFields as $field) {
            if (isset($modified[$field]) && is_numeric(value: $modified[$field])) {
                $original = (float) $modified[$field];
                $modified[$field] = max(
                    2.0,
                    round(num: $original * $timeoutMultiplier, precision: 1)
                );
            }
        }

        // Campos de buffer a ajustar
        $bufferFields = [
            'buffer_seconds',
            'initial_buffer_seconds',
            'min_buffer_seconds',
            'buffer_target_seconds',
        ];

        // Aplicar multiplicador de buffer
        foreach ($bufferFields as $field) {
            if (isset($modified[$field]) && is_numeric(value: $modified[$field])) {
                $original = (float) $modified[$field];
                $modified[$field] = max(
                    1.0,
                    round(num: $original * $bufferMultiplier, precision: 1)
                );
            }
        }

        return $modified;
    }

    /**
     * Podar mediciones antiguas de una huella digital.
     *
     * Elimina mediciones que excedan el máximo o la antigüedad permitida.
     *
     * @param string $safeFingerprint Huella digital sanitizada
     * @param array  $data            Datos con mediciones
     *
     * @return array Datos con mediciones podadas
     */
    private function pruneOldMeasurements(string $safeFingerprint, array $data): array
    {
        $now = time();

        // Filtrar por antigüedad máxima
        $data['measurements'] = array_values(
            array: array_filter(
                array: $data['measurements'],
                callback: fn(array $m): bool =>
                    isset($m['timestamp']) && ($now - $m['timestamp']) <= $this->maxAgeSeconds
            )
        );

        // Aplicar ventana rodante: mantener las más recientes
        if (count(value: $data['measurements']) > $this->maxMeasurements) {
            $data['measurements'] = array_slice(
                array: $data['measurements'],
                offset: -$this->maxMeasurements
            );
        }

        return $data;
    }

    /**
     * Validar campos obligatorios de las métricas de latencia.
     *
     * @param array $metrics Métricas sin validar
     *
     * @return array|null Métricas validadas o null si son inválidas
     */
    private function validateMetrics(array $metrics): ?array
    {
        // Al menos RTT o TTFB deben estar presentes
        $hasRtt = isset($metrics['rtt_ms']);
        $hasTtfb = isset($metrics['ttfb_ms']);

        if (!$hasRtt && !$hasTtfb) {
            return null;
        }

        return [
            'rtt_ms'          => (float) ($metrics['rtt_ms'] ?? 0),
            'dns_ms'          => (float) ($metrics['dns_ms'] ?? 0),
            'handshake_ms'    => (float) ($metrics['handshake_ms'] ?? 0),
            'ttfb_ms'         => (float) ($metrics['ttfb_ms'] ?? 0),
            'total_ms'        => (float) ($metrics['total_ms'] ?? 0),
            'throughput_kbps' => (float) ($metrics['throughput_kbps'] ?? 0),
            'timestamp'       => (int) ($metrics['timestamp'] ?? time()),
        ];
    }

    /**
     * Sanitizar huella digital para uso seguro como nombre de archivo.
     *
     * @param string $filename Huella digital original
     *
     * @return string Nombre sanitizado
     */
    private function sanitizeFilename(string $filename): string
    {
        // MD5 ya produce solo caracteres hexadecimales seguros, pero sanitizamos por si acaso
        $safe = preg_replace(
            pattern: '/[^a-zA-Z0-9\-_]/',
            replacement: '_',
            subject: $filename
        );
        return substr(string: $safe, offset: 0, length: 64);
    }

    /**
     * Asegurar que el directorio de almacenamiento existe.
     */
    private function ensureStorageDirectory(): void
    {
        if (!is_dir(filename: $this->storageDir)) {
            @mkdir(directory: $this->storageDir, permissions: 0755, recursive: true);
        }
    }

    /**
     * Construir la ruta completa al archivo de datos de una huella digital.
     *
     * @param string $safeFingerprint Huella digital sanitizada
     *
     * @return string Ruta al archivo JSON
     */
    private function getFingerprintFilePath(string $safeFingerprint): string
    {
        return $this->storageDir . '/' . $safeFingerprint . '.json';
    }

    /**
     * Cargar datos de latencia de una huella digital desde disco.
     *
     * @param string $safeFingerprint Huella digital sanitizada
     *
     * @return array Datos de la huella, o estructura vacía si no existe
     */
    private function loadFingerprintData(string $safeFingerprint): array
    {
        $filePath = $this->getFingerprintFilePath(safeFingerprint: $safeFingerprint);

        if (!file_exists(filename: $filePath)) {
            return ['measurements' => [], 'fingerprint' => $safeFingerprint];
        }

        $content = @file_get_contents(filename: $filePath);
        if ($content === false) {
            return ['measurements' => [], 'fingerprint' => $safeFingerprint];
        }

        $data = json_decode(json: $content, associative: true);
        if (!is_array(value: $data)) {
            return ['measurements' => [], 'fingerprint' => $safeFingerprint];
        }

        return $data;
    }

    /**
     * Guardar datos de latencia de una huella digital a disco.
     *
     * @param string $safeFingerprint Huella digital sanitizada
     * @param array  $data            Datos a guardar
     *
     * @return bool true si se guardó exitosamente
     */
    private function saveFingerprintData(string $safeFingerprint, array $data): bool
    {
        $filePath = $this->getFingerprintFilePath(safeFingerprint: $safeFingerprint);
        $json = json_encode(
            value: $data,
            flags: JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE
        );

        if ($json === false) {
            return false;
        }

        $result = @file_put_contents(
            filename: $filePath,
            data: $json,
            flags: LOCK_EX
        );

        return $result !== false;
    }

    /**
     * Retornar perfil de latencia vacío/neutral.
     *
     * @return array Estructura de perfil con valores por defecto
     */
    private function emptyLatencyProfile(): array
    {
        return [
            'avg_rtt_ms' => 0.0,
            'avg_ttfb_ms' => 0.0,
            'avg_throughput_kbps' => 0.0,
            'jitter_ms' => 0.0,
            'packet_loss_estimate' => 0.0,
            'quality_grade' => 'good',
            'samples' => 0,
            'last_updated' => 0,
        ];
    }
}
