<?php
declare(strict_types=1);

/**
 * PredictivePreloader — Precargador predictivo basado en patrones de visualización.
 *
 * Analiza los patrones de cambio de canal de un usuario para predecir
 * qué canal es probable que vea a continuación, generando directivas
 * de precarga que pueden optimizar la experiencia de navegación.
 *
 * Operación dentro de restricciones anti-509:
 *   - NUNCA prefetchea desde el origen (solo proporciona pistas al reproductor)
 *   - La precarga es una SUGERENCIA, no una orden
 *   - Si la confianza es < 0.5, no se generan directivas de precarga
 *   - Siempre incluye cabecera X-Preload-Confidence para que el reproductor decida
 *
 * Almacenamiento: /tmp/rq_predict/{session_id}.json
 * Limpieza: sesiones anteriores a 4 horas se eliminan automáticamente
 */

class PredictivePreloader
{
    /** @var string Directorio base para almacenamiento de sesiones */
    private readonly string $storageDir;

    /** @var int Antigüedad máxima de sesiones en segundos (4 horas) */
    private readonly int $sessionMaxAgeSeconds;

    /** @var int Confianza mínima para generar directivas de precarga */
    private readonly float $minConfidence;

    /** @var int Longitud mínima de secuencia para predicción secuencial */
    private readonly int $minSequenceLength;

    /** @var int Número máximo de candidatos a retornar */
    private readonly int $maxCandidates;

    /**
     * Constructor.
     *
     * @param string $storageDir Directorio para almacenamiento de datos de sesión
     */
    public function __construct(
        private readonly string $storageDirPath = '/tmp/rq_predict',
        private readonly int $sessionMaxAge = 14400,
        private readonly float $minimumConfidence = 0.5,
        private readonly int $minimumSequenceLength = 3,
        private readonly int $maximumCandidates = 5,
    ) {
        $this->storageDir = $storageDirPath;
        $this->sessionMaxAgeSeconds = $sessionMaxAge;
        $this->minConfidence = $minimumConfidence;
        $this->minSequenceLength = $minimumSequenceLength;
        $this->maxCandidates = $maximumCandidates;

        $this->ensureStorageDirectory();
    }

    /**
     * Registrar un evento de visualización de canal.
     *
     * Se llama cuando resolve_quality procesa un canal, registrando
     * el canal visto, su grupo y la duración de visualización.
     *
     * @param string $sessionId   ID único de la sesión del usuario
     * @param string $channelId   ID del canal visualizado
     * @param string $groupTitle  Título del grupo/categoría (ej: "Deportes")
     * @param float  $viewDuration Duración de visualización en segundos (0 si es nuevo)
     */
    public function recordChannelView(
        string $sessionId,
        string $channelId,
        string $groupTitle = '',
        float $viewDuration = 0.0
    ): void {
        try {
            $safeSessionId = $this->sanitizeFilename(filename: $sessionId);

            // Cargar datos existentes de la sesión
            $sessionData = $this->loadSessionData(safeSessionId: $safeSessionId);

            // Inicializar estructura de sesión si es nuevo
            $now = time();
            if (empty($sessionData['session_start'])) {
                $sessionData['session_start'] = $now;
            }

            // Si la duración es > 0, actualizar la entrada del canal anterior
            if ($viewDuration > 0.0 && !empty($sessionData['current_channel_id'])) {
                $this->updateViewDuration(
                    sessionData: $sessionData,
                    channelId: $sessionData['current_channel_id'],
                    duration: $viewDuration
                );
            }

            // Registrar nueva visualización
            $viewEvent = [
                'id'        => $channelId,
                'group'     => $groupTitle,
                'timestamp' => $now,
                'duration'  => 0.0, // Se actualizará cuando el usuario cambie de canal
            ];

            $sessionData['channels'][] = $viewEvent;
            $sessionData['sequence'][] = $channelId;
            $sessionData['current_channel_id'] = $channelId;
            $sessionData['last_updated'] = $now;

            // Guardar datos actualizados
            $this->saveSessionData(safeSessionId: $safeSessionId, data: $sessionData);
        } catch (\Throwable $e) {
            // Silencioso: el registro de visualización no debe interrumpir el flujo
        }
    }

    /**
     * Obtener el historial de visualización para una sesión.
     *
     * @param string $sessionId ID de la sesión del usuario
     *
     * @return array Historial de visualización:
     *   - channels: array       Lista de canales vistos con detalles
     *   - sequence: array       Secuencia de IDs de canales
     *   - total_views: int      Total de visualizaciones
     *   - session_start: int    Marca temporal de inicio de sesión
     *   - session_duration: int Duración de la sesión en segundos
     */
    public function getViewingHistory(string $sessionId): array
    {
        try {
            $safeSessionId = $this->sanitizeFilename(filename: $sessionId);
            $sessionData = $this->loadSessionData(safeSessionId: $safeSessionId);

            if (empty($sessionData['channels'])) {
                return $this->emptyViewingHistory();
            }

            $sessionStart = (int) ($sessionData['session_start'] ?? time());
            $now = time();

            return [
                'channels'         => $sessionData['channels'],
                'sequence'         => $sessionData['sequence'] ?? [],
                'total_views'      => count(value: $sessionData['channels']),
                'session_start'    => $sessionStart,
                'session_duration' => $now - $sessionStart,
            ];
        } catch (\Throwable $e) {
            return $this->emptyViewingHistory();
        }
    }

    /**
     * Predecir el siguiente canal probable basándose en patrones.
     *
     * Métodos de predicción (en orden de prioridad):
     *   1. Secuencial: si el usuario siempre ve ch1→ch2→ch3, predecir ch3 cuando está en ch2
     *   2. Por grupo: si el usuario está en "Deportes", predecir otros canales del mismo grupo
     *   3. Temporal: patrones de visualización basados en hora del día
     *   4. Frecuencia: canales más vistos en la sesión
     *
     * @param string $sessionId        ID de la sesión
     * @param string $currentChannelId ID del canal actual
     *
     * @return array Predicción:
     *   - predicted: string|null  ID del canal predicho (null si no hay predicción)
     *   - candidates: array      Lista de candidatos con probabilidades
     *   - confidence: float      Confianza de la predicción (0-1)
     *   - method: string         Método usado: 'sequence'|'group'|'time'|'frequency'|'none'
     */
    public function predictNextChannel(string $sessionId, string $currentChannelId): array
    {
        try {
            $safeSessionId = $this->sanitizeFilename(filename: $sessionId);
            $sessionData = $this->loadSessionData(safeSessionId: $safeSessionId);

            if (empty($sessionData['sequence']) || count(value: $sessionData['sequence']) < 2) {
                return $this->emptyPrediction();
            }

            $sequence = $sessionData['sequence'] ?? [];
            $channels = $sessionData['channels'] ?? [];

            // Intentar predicción secuencial (prioridad más alta)
            $sequentialPrediction = $this->predictBySequence(
                sequence: $sequence,
                currentChannelId: $currentChannelId
            );
            if ($sequentialPrediction['confidence'] >= $this->minConfidence) {
                return $sequentialPrediction;
            }

            // Intentar predicción por grupo
            $groupPrediction = $this->predictByGroup(
                channels: $channels,
                currentChannelId: $currentChannelId
            );
            if ($groupPrediction['confidence'] >= $this->minConfidence) {
                return $groupPrediction;
            }

            // Intentar predicción temporal
            $timePrediction = $this->predictByTime(channels: $channels);
            if ($timePrediction['confidence'] >= $this->minConfidence) {
                return $timePrediction;
            }

            // Intentar predicción por frecuencia
            $frequencyPrediction = $this->predictByFrequency(
                sequence: $sequence,
                currentChannelId: $currentChannelId
            );
            if ($frequencyPrediction['confidence'] >= $this->minConfidence) {
                return $frequencyPrediction;
            }

            // No se alcanzó confianza mínima → sin predicción
            // Pero si hay algún candidato, devolverlo con la confianza más alta
            $bestCandidate = $this->getBestLowConfidenceCandidate(
                predictions: [
                    $sequentialPrediction,
                    $groupPrediction,
                    $timePrediction,
                    $frequencyPrediction,
                ]
            );

            return $bestCandidate ?? $this->emptyPrediction();
        } catch (\Throwable $e) {
            return $this->emptyPrediction();
        }
    }

    /**
     * Generar directivas de precarga para el canal predicho.
     *
     * Anti-509: Solo sugiere precarga, nunca la fuerza. La directiva es
     * una PISTA para que el reproductor decida si la ejecuta.
     *
     * @param array  $prediction  Predicción del próximo canal
     * @param string $playerType  Tipo de reproductor
     *
     * @return array Directivas de precarga (vacío si confianza insuficiente)
     */
    public function generatePreloadDirectives(array $prediction, string $playerType): array
    {
        try {
            // Sin predicción válida → sin directivas
            if (empty($prediction['predicted'])) {
                return [];
            }

            $confidence = (float) ($prediction['confidence'] ?? 0.0);

            // Confianza insuficiente → no precargar (no desperdiciar ancho de banda)
            if ($confidence < $this->minConfidence) {
                return [];
            }

            $directives = [];
            $predictedChannelId = (string) $prediction['predicted'];

            // Siempre incluir confianza para que el reproductor decida
            $directives['X-Preload-Confidence'] = (string) round(
                num: $confidence * 100,
                precision: 1
            );
            $directives['X-Preload-Channel'] = $predictedChannelId;
            $directives['X-Preload-Method'] = (string) ($prediction['method'] ?? 'unknown');

            $playerType = strtolower(string: $playerType);

            // Directivas específicas por reproductor
            // NOTA: Todos son HINTS, no comandos obligatorios
            return match (true) {
                // VLC: hints de prefetch (solo si la confianza es alta)
                str_contains(haystack: $playerType, needle: 'vlc') => $this->vlcPreloadDirectives(
                    directives: $directives,
                    confidence: $confidence
                ),

                // OTT/Stalker: cabecera de precarga
                str_contains(haystack: $playerType, needle: 'ott')
                || str_contains(haystack: $playerType, needle: 'stalker') => $this->ottPreloadDirectives(
                    directives: $directives,
                    confidence: $confidence
                ),

                // ExoPlayer: no tiene soporte nativo de precarga predictiva
                // pero se puede usar la API de MediaSource
                str_contains(haystack: $playerType, needle: 'exo') => $directives,

                // Otros: sin directivas (no se puede precargar de forma segura)
                default => [],
            };
        } catch (\Throwable $e) {
            return [];
        }
    }

    /**
     * Analizar patrones de visualización para obtener información de calidad.
     *
     * Los patrones descubiertos alimentan al ContentHeuristicEngine
     * de v2.5 para mejorar la clasificación de contenido.
     *
     * @param string $sessionId ID de la sesión del usuario
     *
     * @return array Patrones descubiertos:
     *   - average_view_duration: float  Duración promedio de visualización (segundos)
     *   - favorite_groups: array       Grupos más vistos
     *   - channel_hop_frequency: float  Frecuencia de cambio de canal (cambios/minuto)
     *   - preferred_content_type: string Tipo de contenido preferido
     *   - total_unique_channels: int    Cantidad de canales únicos vistos
     *   - view_pattern: string         Patrón de comportamiento: 'focused'|'explorer'|'zapper'
     */
    public function analyzeViewingPatterns(string $sessionId): array
    {
        try {
            $history = $this->getViewingHistory(sessionId: $sessionId);

            if ($history['total_views'] === 0) {
                return $this->emptyPatternAnalysis();
            }

            $channels = $history['channels'];
            $sessionDuration = max(1, $history['session_duration']);

            // === Duración promedio de visualización ===
            $totalDuration = 0.0;
            $durationCount = 0;
            foreach ($channels as $ch) {
                $dur = (float) ($ch['duration'] ?? 0.0);
                if ($dur > 0.0) {
                    $totalDuration += $dur;
                    $durationCount++;
                }
            }
            $avgDuration = $durationCount > 0
                ? round(num: $totalDuration / $durationCount, precision: 1)
                : 0.0;

            // === Grupos favoritos (más vistos) ===
            $groupCounts = [];
            foreach ($channels as $ch) {
                $group = (string) ($ch['group'] ?? 'Sin categoría');
                if (!empty($group)) {
                    $groupCounts[$group] = ($groupCounts[$group] ?? 0) + 1;
                }
            }
            arsort(array: $groupCounts);
            $favoriteGroups = array_slice(
                array: $groupCounts,
                offset: 0,
                length: 5
            );

            // === Frecuencia de cambio de canal (cambios por minuto) ===
            $totalViews = (int) $history['total_views'];
            $hopFrequency = $sessionDuration > 60
                ? round(num: $totalViews / ($sessionDuration / 60.0), precision: 2)
                : (float) $totalViews;

            // === Tipo de contenido preferido ===
            $preferredContent = !empty($favoriteGroups)
                ? array_key_first(array: $favoriteGroups)
                : 'desconocido';

            // === Canales únicos ===
            $uniqueChannels = count(value: array_unique(array: $history['sequence']));

            // === Clasificar patrón de comportamiento ===
            $viewPattern = $this->classifyViewPattern(
                avgDuration: $avgDuration,
                hopFrequency: $hopFrequency,
                uniqueChannels: $uniqueChannels,
                totalViews: $totalViews
            );

            return [
                'average_view_duration'  => $avgDuration,
                'favorite_groups'        => $favoriteGroups,
                'channel_hop_frequency'  => $hopFrequency,
                'preferred_content_type' => $preferredContent,
                'total_unique_channels'  => $uniqueChannels,
                'view_pattern'           => $viewPattern,
                'session_id'             => $sessionId,
                'analyzed_at'            => time(),
            ];
        } catch (\Throwable $e) {
            return $this->emptyPatternAnalysis();
        }
    }

    // =========================================================================
    // MÉTODOS PRIVADOS DE PREDICCIÓN
    // =========================================================================

    /**
     * Predicción por patrón secuencial.
     *
     * Detecta si el usuario sigue secuencias repetitivas de canales.
     * Ejemplo: si ch1→ch2→ch3 aparece 3 veces, al estar en ch2 predecir ch3.
     *
     * @param array  $sequence          Secuencia de IDs de canales
     * @param string $currentChannelId  Canal actual
     *
     * @return array Predicción secuencial con confianza
     */
    private function predictBySequence(array $sequence, string $currentChannelId): array
    {
        $transitions = []; // [$from => [$to => count]]

        // Construir tabla de transiciones
        for ($i = 0; $i < count(value: $sequence) - 1; $i++) {
            $from = (string) $sequence[$i];
            $to = (string) $sequence[$i + 1];

            if (!isset($transitions[$from])) {
                $transitions[$from] = [];
            }
            $transitions[$from][$to] = ($transitions[$from][$to] ?? 0) + 1;
        }

        // Buscar transiciones desde el canal actual
        if (!isset($transitions[$currentChannelId])) {
            return $this->predictionResult(
                predicted: null,
                confidence: 0.0,
                method: 'sequence',
                candidates: []
            );
        }

        $nextChannels = $transitions[$currentChannelId];
        arsort(array: $nextChannels);

        // Construir candidatos con probabilidades
        $totalTransitions = (int) array_sum(array: $nextChannels);
        $candidates = [];

        foreach ($nextChannels as $nextChannel => $count) {
            $probability = $count / $totalTransitions;
            $candidates[] = [
                'id' => $nextChannel,
                'probability' => round(num: $probability, precision: 2),
                'transition_count' => $count,
            ];
        }

        // Limitar candidatos
        $candidates = array_slice(
            array: $candidates,
            offset: 0,
            length: $this->maxCandidates
        );

        // Verificar que la secuencia se repite (no es aleatoria)
        $topCandidate = $candidates[0] ?? null;
        $topCount = (int) ($topCandidate['transition_count'] ?? 0);

        // La confianza aumenta con repeticiones
        $confidence = min(0.95, $topCount * 0.2);
        // Bonus si hay más de 2 repeticiones del mismo patrón
        if ($topCount >= 3) {
            $confidence = min(0.95, $confidence + 0.2);
        }

        return $this->predictionResult(
            predicted: $topCandidate['id'] ?? null,
            confidence: $confidence,
            method: 'sequence',
            candidates: $candidates
        );
    }

    /**
     * Predicción por grupo/categoría.
     *
     * Si el usuario está viendo canales de un grupo específico,
     * predice otros canales del mismo grupo que aún no ha visto.
     *
     * @param array  $channels          Lista de canales con sus grupos
     * @param string $currentChannelId  Canal actual
     *
     * @return array Predicción por grupo con confianza
     */
    private function predictByGroup(array $channels, string $currentChannelId): array
    {
        // Encontrar el grupo del canal actual
        $currentGroup = '';
        foreach ($channels as $ch) {
            if ((string) ($ch['id'] ?? '') === $currentChannelId) {
                $currentGroup = (string) ($ch['group'] ?? '');
                break;
            }
        }

        if (empty($currentGroup)) {
            return $this->predictionResult(
                predicted: null,
                confidence: 0.0,
                method: 'group',
                candidates: []
            );
        }

        // Contar frecuencia de canales en el mismo grupo
        $groupChannelCounts = [];
        $viewedIds = [];

        foreach ($channels as $ch) {
            $id = (string) ($ch['id'] ?? '');
            $group = (string) ($ch['group'] ?? '');

            $viewedIds[$id] = true;

            if ($group === $currentGroup && $id !== $currentChannelId) {
                if (!isset($groupChannelCounts[$id])) {
                    $groupChannelCounts[$id] = 0;
                }
                $groupChannelCounts[$id]++;
            }
        }

        if (empty($groupChannelCounts)) {
            return $this->predictionResult(
                predicted: null,
                confidence: 0.0,
                method: 'group',
                candidates: []
            );
        }

        arsort(array: $groupChannelCounts);

        $candidates = [];
        $totalCount = (int) array_sum(array: $groupChannelCounts);

        foreach ($groupChannelCounts as $id => $count) {
            $candidates[] = [
                'id' => $id,
                'probability' => round(num: $count / max(1, $totalCount), precision: 2),
                'group' => $currentGroup,
            ];
        }

        $candidates = array_slice(
            array: $candidates,
            offset: 0,
            length: $this->maxCandidates
        );

        // Confianza basada en cuántos canales del grupo ha visto
        $groupTotal = count(value: array_filter(
            array: $channels,
            callback: fn(array $ch): bool => (string) ($ch['group'] ?? '') === $currentGroup
        ));
        $groupRatio = $groupTotal > 0 ? min(1.0, count(value: $groupChannelCounts) / $groupTotal) : 0;
        $confidence = 0.3 + ($groupRatio * 0.4); // 0.3 a 0.7

        return $this->predictionResult(
            predicted: $candidates[0]['id'] ?? null,
            confidence: $confidence,
            method: 'group',
            candidates: $candidates
        );
    }

    /**
     * Predicción basada en patrones temporales.
     *
     * Analiza si el usuario tiende a ver ciertos canales o grupos
     * en determinados momentos del día.
     *
     * @param array $channels Lista de canales con timestamps
     *
     * @return array Predicción temporal con confianza
     */
    private function predictByTime(array $channels): array
    {
        $currentHour = (int) date(format: 'H');
        $currentDay = (int) date(format: 'N'); // 1=Lunes, 7=Domingo

        // Agrupar vistas por hora del día
        $hourlyViews = [];
        foreach ($channels as $ch) {
            $timestamp = (int) ($ch['timestamp'] ?? 0);
            if ($timestamp === 0) {
                continue;
            }
            $hour = (int) date(format: 'H', timestamp: $timestamp);
            $id = (string) ($ch['id'] ?? '');
            $group = (string) ($ch['group'] ?? '');

            if (!isset($hourlyViews[$hour])) {
                $hourlyViews[$hour] = [];
            }
            $hourlyViews[$hour][] = ['id' => $id, 'group' => $group];
        }

        // Buscar patrones para la hora actual (±1 hora de tolerancia)
        $relevantHours = [
            $currentHour,
            ($currentHour + 23) % 24, // Hora anterior
            ($currentHour + 1) % 24,  // Hora siguiente
        ];

        $hourMatches = [];
        foreach ($relevantHours as $hour) {
            if (isset($hourlyViews[$hour])) {
                $hourMatches = array_merge(
                    array1: $hourMatches,
                    array: $hourlyViews[$hour]
                );
            }
        }

        if (empty($hourMatches)) {
            return $this->predictionResult(
                predicted: null,
                confidence: 0.0,
                method: 'time',
                candidates: []
            );
        }

        // Contar frecuencia de canales vistos en esta franja horaria
        $channelFrequency = [];
        foreach ($hourMatches as $match) {
            $id = $match['id'];
            $channelFrequency[$id] = ($channelFrequency[$id] ?? 0) + 1;
        }

        arsort(array: $channelFrequency);

        $candidates = [];
        $total = (int) array_sum(array: $channelFrequency);

        foreach ($channelFrequency as $id => $count) {
            $candidates[] = [
                'id' => $id,
                'probability' => round(num: $count / max(1, $total), precision: 2),
                'time_pattern' => true,
            ];
        }

        $candidates = array_slice(
            array: $candidates,
            offset: 0,
            length: $this->maxCandidates
        );

        // Confianza baja para patrones temporales (menos deterministas)
        $confidence = 0.25 + (count(value: $hourMatches) > 3 ? 0.15 : 0.0);

        return $this->predictionResult(
            predicted: $candidates[0]['id'] ?? null,
            confidence: $confidence,
            method: 'time',
            candidates: $candidates
        );
    }

    /**
     * Predicción basada en frecuencia de visualización.
     *
     * Simplemente predice los canales más vistos en la sesión actual.
     *
     * @param array  $sequence          Secuencia completa de canales
     * @param string $currentChannelId  Canal actual (a excluir)
     *
     * @return array Predicción por frecuencia con confianza
     */
    private function predictByFrequency(array $sequence, string $currentChannelId): array
    {
        $frequency = [];
        foreach ($sequence as $id) {
            $id = (string) $id;
            $frequency[$id] = ($frequency[$id] ?? 0) + 1;
        }

        // Eliminar canal actual de los candidatos
        unset($frequency[$currentChannelId]);

        if (empty($frequency)) {
            return $this->predictionResult(
                predicted: null,
                confidence: 0.0,
                method: 'frequency',
                candidates: []
            );
        }

        arsort(array: $frequency);

        $total = (int) array_sum(array: $frequency);
        $candidates = [];

        foreach ($frequency as $id => $count) {
            $candidates[] = [
                'id' => $id,
                'probability' => round(num: $count / max(1, $total), precision: 2),
                'view_count' => $count,
            ];
        }

        $candidates = array_slice(
            array: $candidates,
            offset: 0,
            length: $this->maxCandidates
        );

        // Confianza basada en cuán dominante es el canal más visto
        $topProbability = (float) ($candidates[0]['probability'] ?? 0.0);
        $confidence = min(0.6, $topProbability);

        return $this->predictionResult(
            predicted: $candidates[0]['id'] ?? null,
            confidence: $confidence,
            method: 'frequency',
            candidates: $candidates
        );
    }

    // =========================================================================
    // MÉTODOS PRIVADOS DE DIRECTIVAS
    // =========================================================================

    /**
     * Generar directivas de precarga para VLC.
     *
     * VLC soporta prefetch pero solo con alta confianza.
     *
     * @param array  $directives  Directivas base ya construidas
     * @param float  $confidence  Nivel de confianza de la predicción
     *
     * @return array Directivas específicas para VLC
     */
    private function vlcPreloadDirectives(array $directives, float $confidence): array
    {
        // Solo generar hints de prefetch con alta confianza (> 0.7)
        if ($confidence > 0.7) {
            $directives['prefetch_hint'] = true;
            $directives['prefetch_priority'] = 'low'; // Baja prioridad para no interferir
        }

        return $directives;
    }

    /**
     * Generar directivas de precarga para reproductores OTT/Stalker.
     *
     * @param array  $directives  Directivas base ya construidas
     * @param float  $confidence  Nivel de confianza de la predicción
     *
     * @return array Directivas específicas para OTT
     */
    private function ottPreloadDirectives(array $directives, float $confidence): array
    {
        // Cabecera de precarga: el middleware del portal puede usarla
        $directives['X-Preload'] = 'suggest';
        $directives['X-Preload-Priority'] = $confidence > 0.7 ? 'normal' : 'low';

        return $directives;
    }

    // =========================================================================
    // MÉTODOS PRIVADOS DE ANÁLISIS
    // =========================================================================

    /**
     * Clasificar el patrón de comportamiento del usuario.
     *
     * @param float $avgDuration      Duración promedio de visualización
     * @param float $hopFrequency     Frecuencia de cambio de canal (por minuto)
     * @param int   $uniqueChannels   Canales únicos vistos
     * @param int   $totalViews       Total de visualizaciones
     *
     * @return string Patrón: 'focused'|'explorer'|'zapper'
     */
    private function classifyViewPattern(
        float $avgDuration,
        float $hopFrequency,
        int $uniqueChannels,
        int $totalViews
    ): string {
        // 'focused': ve pocos canales, por largo tiempo
        if ($avgDuration > 120.0 && $uniqueChannels <= 5 && $totalViews > 0) {
            return 'focused';
        }

        // 'zapper': cambia rápidamente entre muchos canales
        if ($hopFrequency > 3.0 || ($avgDuration < 15.0 && $totalViews > 10)) {
            return 'zapper';
        }

        // 'explorer': navega moderadamente entre varios canales
        if ($uniqueChannels > 5 && $avgDuration >= 15.0) {
            return 'explorer';
        }

        // Clasificación basada solo en duración
        return match (true) {
            $avgDuration > 60.0  => 'focused',
            $avgDuration < 20.0  => 'zapper',
            default              => 'explorer',
        };
    }

    // =========================================================================
    // MÉTODOS AUXILIARES
    // =========================================================================

    /**
     * Actualizar la duración de visualización de un canal en los datos de sesión.
     *
     * @param array  $sessionData Datos de la sesión (modificados in-place)
     * @param string $channelId   ID del canal a actualizar
     * @param float  $duration    Duración de visualización en segundos
     */
    private function updateViewDuration(array &$sessionData, string $channelId, float $duration): void
    {
        // Buscar la última entrada del canal y actualizar su duración
        for ($i = count(value: $sessionData['channels']) - 1; $i >= 0; $i--) {
            if ((string) ($sessionData['channels'][$i]['id'] ?? '') === $channelId) {
                $sessionData['channels'][$i]['duration'] = $duration;
                break;
            }
        }
    }

    /**
     * Obtener el mejor candidato de baja confianza entre múltiples predicciones.
     *
     * @param array $predictions Lista de predicciones a evaluar
     *
     * @return array|null La mejor predicción o null si todas están vacías
     */
    private function getBestLowConfidenceCandidate(array $predictions): ?array
    {
        $best = null;
        $bestConfidence = 0.0;

        foreach ($predictions as $prediction) {
            $confidence = (float) ($prediction['confidence'] ?? 0.0);
            $hasPredicted = !empty($prediction['predicted']);

            if ($hasPredicted && $confidence > $bestConfidence) {
                $bestConfidence = $confidence;
                $best = $prediction;
            }
        }

        return $best;
    }

    /**
     * Construir resultado de predicción estandarizado.
     *
     * @param string|null $predicted   Canal predicho
     * @param float       $confidence  Confianza (0-1)
     * @param string      $method      Método de predicción
     * @param array       $candidates  Lista de candidatos
     *
     * @return array Resultado de predicción estructurado
     */
    private function predictionResult(
        ?string $predicted,
        float $confidence,
        string $method,
        array $candidates
    ): array {
        return [
            'predicted'  => $predicted,
            'candidates' => $candidates,
            'confidence' => round(num: max(0.0, min(1.0, $confidence)), precision: 2),
            'method'     => $method,
        ];
    }

    /**
     * Retornar predicción vacía/neutral.
     *
     * @return array Predicción sin resultados
     */
    private function emptyPrediction(): array
    {
        return [
            'predicted'  => null,
            'candidates' => [],
            'confidence' => 0.0,
            'method'     => 'none',
        ];
    }

    /**
     * Retornar historial de visualización vacío.
     *
     * @return array Historial vacío
     */
    private function emptyViewingHistory(): array
    {
        return [
            'channels'         => [],
            'sequence'         => [],
            'total_views'      => 0,
            'session_start'    => 0,
            'session_duration' => 0,
        ];
    }

    /**
     * Retornar análisis de patrones vacío.
     *
     * @return array Análisis vacío
     */
    private function emptyPatternAnalysis(): array
    {
        return [
            'average_view_duration'  => 0.0,
            'favorite_groups'        => [],
            'channel_hop_frequency'  => 0.0,
            'preferred_content_type' => 'desconocido',
            'total_unique_channels'  => 0,
            'view_pattern'           => 'unknown',
        ];
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
     * Construir la ruta completa al archivo de datos de una sesión.
     *
     * @param string $safeSessionId ID de sesión sanitizado
     *
     * @return string Ruta al archivo JSON
     */
    private function getSessionFilePath(string $safeSessionId): string
    {
        return $this->storageDir . '/' . $safeSessionId . '.json';
    }

    /**
     * Cargar datos de sesión desde disco.
     *
     * @param string $safeSessionId ID de sesión sanitizado
     *
     * @return array Datos de sesión, o estructura vacía
     */
    private function loadSessionData(string $safeSessionId): array
    {
        $filePath = $this->getSessionFilePath(safeSessionId: $safeSessionId);

        if (!file_exists(filename: $filePath)) {
            return ['channels' => [], 'sequence' => [], 'session_start' => 0];
        }

        $content = @file_get_contents(filename: $filePath);
        if ($content === false) {
            return ['channels' => [], 'sequence' => [], 'session_start' => 0];
        }

        $data = json_decode(json: $content, associative: true);
        if (!is_array(value: $data)) {
            return ['channels' => [], 'sequence' => [], 'session_start' => 0];
        }

        // Verificar si la sesión ha expirado
        $lastUpdated = (int) ($data['last_updated'] ?? $data['session_start'] ?? 0);
        if ($lastUpdated > 0 && (time() - $lastUpdated) > $this->sessionMaxAgeSeconds) {
            // Sesión expirada → limpiar archivo y retornar vacío
            @unlink(filename: $filePath);
            return ['channels' => [], 'sequence' => [], 'session_start' => 0];
        }

        return $data;
    }

    /**
     * Guardar datos de sesión a disco.
     *
     * @param string $safeSessionId ID de sesión sanitizado
     * @param array  $data          Datos a guardar
     *
     * @return bool true si se guardó exitosamente
     */
    private function saveSessionData(string $safeSessionId, array $data): bool
    {
        $filePath = $this->getSessionFilePath(safeSessionId: $safeSessionId);
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
}
