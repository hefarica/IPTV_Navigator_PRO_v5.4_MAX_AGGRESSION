<?php
declare(strict_types=1);

/**
 * MÓDULO 5: VisualPotentialEscalator — Escalador de Potencial Visual
 * ===================================================================
 * Calcula el nivel de escalamiento visual (0-8) basándose en:
 * - Capacidades del reproductor (codecs, HDR, resolución, HW decode)
 * - Capacidades de la TV (HDR, nits, resolución, profundidad de color)
 * - Calidad de red (throughput, latencia, tipo de conexión)
 * - Tipo de contenido (deportes y cine suben, noticias bajan)
 *
 * NUNCA excede lo que el hardware puede manejar realmente.
 * NUNCA genera más agresividad de la que la red puede sostener.
 *
 * Niveles: 0=PRESERVE → 8=MAXIMUM
 *
 * @package ResolveQuality v2.5 ULTRA
 * @module  VisualPotentialEscalator
 */

/**
 * Tabla de niveles de escalamiento visual.
 * Cada nivel define multiplicador, boost y justificación.
 */
const ESCALATION_LEVELS = [
    0 => ['name' => 'PRESERVE',  'multiplier' => 1.0,  'boost' => 0,   'reason' => 'Conservar origen intacto — capacidades desconocidas o insuficientes'],
    1 => ['name' => 'BASE_PLUS', 'multiplier' => 1.15, 'boost' => 15,  'reason' => 'Mejora base +15% — capacidades mínimas detectadas'],
    2 => ['name' => 'MODERATE',  'multiplier' => 1.20, 'boost' => 20,  'reason' => 'Mejora moderada +20% — capacidades estándar'],
    3 => ['name' => 'ENHANCED',  'multiplier' => 1.30, 'boost' => 30,  'reason' => 'Mejora avanzada +30% — buen hardware y red'],
    4 => ['name' => 'STRONG',    'multiplier' => 1.50, 'boost' => 50,  'reason' => 'Mejora fuerte +50% — hardware y red superiores'],
    5 => ['name' => 'ADVANCED',  'multiplier' => 1.60, 'boost' => 60,  'reason' => 'Mejora avanzada +60% — entorno premium'],
    6 => ['name' => 'HIGH',      'multiplier' => 1.70, 'boost' => 70,  'reason' => 'Mejora alta +70% — entorno de alto rendimiento'],
    7 => ['name' => 'EXTREME',   'multiplier' => 1.90, 'boost' => 90,  'reason' => 'Mejora extrema +90% — entorno de máxima capacidad'],
    8 => ['name' => 'MAXIMUM',   'multiplier' => 2.00, 'boost' => 100, 'reason' => 'Máximo posible real — exprimir hasta el límite seguro'],
];

class VisualPotentialEscalator
{
    /**
     * Calcula el nivel de escalamiento visual y su configuración.
     *
     * @param  array $capabilities Matriz de capacidades (jugador + TV + red)
     * @param  array $dna          ADN del manifiesto
     * @param  array $content      Perfil de contenido
     * @return array Configuración de escalamiento visual completa
     */
    public function calculate(array $capabilities, array $dna, array $content): array
    {
        // Paso 1: Nivel base desde capacidades del entorno
        $baseLevel = $this->determineBaseLevel(capabilities: $capabilities, dna: $dna);

        // Paso 2: Modificar por tipo de contenido
        $contentLevel = $this->applyContentModifier(level: $baseLevel, content: $content);

        // Paso 3: Modificar por calidad de red
        $networkLevel = $this->applyNetworkModifier(level: $contentLevel, network: $capabilities['network']);

        // Limitar al rango válido [0, 8]
        $finalLevel = min($networkLevel, 8);
        $finalLevel = max($finalLevel, 0);

        // Construir configuración final
        return $this->buildEscalationConfig(level: $finalLevel);
    }

    /**
     * Determina el nivel base (0-8) desde las capacidades del entorno.
     *
     * Puntuación por componente (máximo ~33 cada uno):
     * - Player (0-33): codec support, HDR, max resolution, HW decode, FPS
     * - TV (0-33): HDR, resolution, nits, color depth
     * - Network (0-33): throughput, latency, connection type
     *
     * Total máximo: ~99 → se mapea a nivel 0-8
     *
     * @return int Nivel base (0-8)
     */
    private function determineBaseLevel(array $capabilities, array $dna): int
    {
        $player = $capabilities['player'];
        $tv = $capabilities['tv'];
        $network = $capabilities['network'];

        // === Puntuación del reproductor (0-33) ===
        $playerScore = 0;

        // Soporte de codecs (0-10): más codecs = más capaz
        $playerScore += min(10, count($player['codec_support']) * 3);

        // Soporte de HDR (0-8)
        $playerScore += min(8, count($player['hdr_support']) * 3);

        // Resolución máxima (0-8)
        $playerMaxPixels = $player['max_resolution'][0] * $player['max_resolution'][1];
        $playerScore += match (true) {
            $playerMaxPixels >= 8294400  => 8,  // 4K+
            $playerMaxPixels >= 2073600  => 6,  // 1080p+
            $playerMaxPixels >= 921600   => 4,  // 720p+
            default                      => 2,
        };

        // Decodificación por hardware (0-4)
        $playerScore += $player['hw_decode'] ? 4 : 0;

        // FPS máximo soportado (0-3)
        $playerScore += min(3, (int) ($player['max_fps'] / 20));

        // === Puntuación de la TV (0-33) ===
        $tvScore = 0;

        // Soporte de HDR (0-12)
        $tvScore += min(12, count($tv['hdr_support']) * 4);

        // Resolución máxima (0-10)
        $tvMaxPixels = $tv['max_resolution'][0] * $tv['max_resolution'][1];
        $tvScore += match (true) {
            $tvMaxPixels >= 8294400  => 10,
            $tvMaxPixels >= 2073600  => 7,
            $tvMaxPixels >= 921600   => 4,
            default                  => 2,
        };

        // Nits máximos (0-6)
        $tvScore += match (true) {
            $tv['max_nits'] >= 1000 => 6,
            $tv['max_nits'] >= 600  => 4,
            $tv['max_nits'] >= 400  => 3,
            default                 => 1,
        };

        // Profundidad de color (0-5)
        $tvScore += match ($tv['color_depth']) {
            12      => 5,
            10      => 3,
            8       => 1,
            default => 0,
        };

        // === Puntuación de red (0-33) ===
        $networkScore = 0;

        // Throughput (0-15)
        $networkScore += match (true) {
            $network['throughput_kbps'] >= 50000 => 15,
            $network['throughput_kbps'] >= 25000 => 12,
            $network['throughput_kbps'] >= 10000 => 9,
            $network['throughput_kbps'] >= 5000  => 6,
            $network['throughput_kbps'] >= 2000  => 3,
            default                              => 1,
        };

        // Latencia (0-10): menos latencia = más puntos
        $networkScore += match (true) {
            $network['latency_ms'] <= 10 => 10,
            $network['latency_ms'] <= 30 => 7,
            $network['latency_ms'] <= 60 => 4,
            default                     => 1,
        };

        // Tipo de conexión (0-8)
        $networkScore += match ($network['connection_type']) {
            ConnectionType::ETHERNET->value => 8,
            ConnectionType::WIFI->value     => 5,
            ConnectionType::MOBILE->value   => 2,
            default                        => 1,
        };

        // === Mapear score total (0-99) a nivel (0-8) ===
        $totalScore = $playerScore + $tvScore + $networkScore;

        return match (true) {
            $totalScore >= 80 => 7,
            $totalScore >= 65 => 6,
            $totalScore >= 50 => 5,
            $totalScore >= 40 => 4,
            $totalScore >= 30 => 3,
            $totalScore >= 20 => 2,
            $totalScore >= 10 => 1,
            default           => 0,
        };
    }

    /**
     * Aplica modificador según el tipo de contenido.
     *
     * - Deportes, cine, documentales: +1 nivel (beneficio de calidad)
     * - Noticias: -1 nivel (prioridad de baja latencia)
     * - General, música, infantil: sin modificación
     */
    private function applyContentModifier(int $level, array $content): int
    {
        return match ($content['type']) {
            ContentType::SPORTS->value,
            ContentType::CINEMA->value,
            ContentType::DOCUMENTARY->value => min(8, $level + 1),
            ContentType::NEWS->value        => max(0, $level - 1),
            default                         => $level,
        };
    }

    /**
     * Aplica modificador según la calidad de la red.
     *
     * Red mala reduce agresividad del escalamiento.
     * Conexión móvil tiene penalización adicional.
     */
    private function applyNetworkModifier(int $level, array $network): int
    {
        $modified = $level;

        // Throughput bajo: reducir agresividad
        $modified = match (true) {
            $network['throughput_kbps'] < 2000 => max(0, $modified - 3),
            $network['throughput_kbps'] < 3000 => max(0, $modified - 2),
            $network['throughput_kbps'] < 5000 => max(0, $modified - 1),
            default                             => $modified,
        };

        // Latencia alta: reducir
        $modified = match (true) {
            $network['latency_ms'] > 150 => max(0, $modified - 2),
            $network['latency_ms'] > 80  => max(0, $modified - 1),
            default                     => $modified,
        };

        // Conexión móvil: penalización por inestabilidad
        if ($network['connection_type'] === ConnectionType::MOBILE->value) {
            $modified = max(0, $modified - 2);
        }

        return $modified;
    }

    /**
     * Construye la configuración completa de escalamiento para un nivel dado.
     *
     * @param  int   $level Nivel de escalamiento (0-8)
     * @return array Configuración con nivel, nombre, multiplicador, capacidades de escalamiento
     */
    private function buildEscalationConfig(int $level): array
    {
        $config = ESCALATION_LEVELS[$level] ?? ESCALATION_LEVELS[0];

        return [
            'level'                    => $level,
            'level_name'               => $config['name'],
            'multiplier'               => $config['multiplier'],
            'boost'                    => $config['boost'],
            'reason'                   => $config['reason'],
            'can_escalate_hdr'         => $level >= 4,
            'can_escalate_codec'       => $level >= 2,
            'can_escalate_buffer'      => $level >= 1,
            'can_escalate_resolution'  => $level >= 3,
        ];
    }
}
