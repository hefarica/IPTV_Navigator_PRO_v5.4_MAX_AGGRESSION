<?php
declare(strict_types=1);

/**
 * MultiVariantSelector — Selector inteligente de variantes de flujo HLS.
 *
 * Cuando un manifiesto HLS contiene múltiples variantes (diferentes bitrates,
 * resoluciones), este módulo evalúa y selecciona la mejor opción basándose
 * en las capacidades del dispositivo y la telemetría en tiempo real.
 *
 * Solo se activa cuando se detecta un HLS Master Playlist con etiquetas
 * #EXT-X-STREAM-INF. Para playlists simples (una URL por canal), retorna
 * directivas vacías (no-op).
 *
 * Principios de diseño:
 *   - Selección CONSERVADORA: ante la duda, preferir variante inferior para estabilidad
 *   - NUNCA seleccionar variante que exceda resolución o códec del TV
 *   - Anti-509: solo analiza metadatos del manifiesto, no sondea las variantes
 *   - La telemetría de reproducción guía la selección hacia arriba o abajo
 */

class MultiVariantSelector
{
    /**
     * Constructor sin dependencias externas.
     *
     * Este módulo es autónomo y no requiere inyección de servicios.
     */
    public function __construct() {}

    /**
     * Detectar si el manifiesto (ADN del stream) contiene múltiples variantes.
     *
     * Busca patrones de HLS Master Playlist: múltiples etiquetas
     * #EXT-X-STREAM-INF o múltiples URLs en las entradas EXTINF.
     *
     * @param array $dna ADN del stream parseado por ManifestAnatomyParser
     *
     * @return bool true si se detectan múltiples variantes
     */
    public function hasVariants(array $dna): bool
    {
        try {
            // Buscar múltiples etiquetas #EXT-X-STREAM-INF en el contenido
            $rawContent = (string) ($dna['raw_content'] ?? '');
            if (!empty($rawContent)) {
                $streamInfCount = substr_count(
                    haystack: $rawContent,
                    needle: '#EXT-X-STREAM-INF'
                );
                if ($streamInfCount > 1) {
                    return true;
                }
            }

            // Buscar variantes pre-parseadas en el ADN
            $streams = $dna['streams'] ?? $dna['variants'] ?? [];
            if (is_array(value: $streams) && count(value: $streams) > 1) {
                return true;
            }

            // Buscar múltiples URLs en el manifiesto
            $urls = $dna['urls'] ?? $dna['stream_urls'] ?? [];
            if (is_array(value: $urls) && count(value: $urls) > 1) {
                // Verificar que son URLs de stream diferentes (no solo segmentos)
                $uniqueHosts = array_unique(
                    array: array_map(
                        callback: fn(string $url): string => parse_url(url: $url, component: PHP_URL_HOST) ?? 'unknown',
                        array: $urls
                    )
                );
                if (count(value: $uniqueHosts) > 1 || count(value: $urls) > 1) {
                    // Adicionalmente verificar que tiene atributos de bandwidth
                    foreach ($urls as $url) {
                        if (str_contains(haystack: (string) ($dna['raw_content'] ?? ''), needle: 'BANDWIDTH')) {
                            return true;
                        }
                    }
                }
            }

            return false;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * Parsear información de variantes desde un HLS Master Playlist.
     *
     * Extrae los atributos de cada #EXT-X-STREAM-INF (bandwidth,
     * resolution, codecs) y su URL asociada.
     *
     * @param array $dna ADN del stream con el contenido del manifiesto
     *
     * @return array Lista de variantes parseadas:
     *   [
     *     ['bandwidth' => 8000000, 'resolution' => '1920x1080', 'codecs' => 'avc1', 'url' => '...'],
     *     ...
     *   ]
     */
    public function parseVariants(array $dna): array
    {
        try {
            $rawContent = (string) ($dna['raw_content'] ?? '');

            if (empty($rawContent)) {
                return [];
            }

            $variants = [];

            // Patrón para extraer #EXT-X-STREAM-INF y la URL siguiente
            // Cada bloque: #EXT-X-STREAM-INF:... atributos\nURL
            $pattern = '/#EXT-X-STREAM-INF:([^\r\n]+)\r?\n([^\r\n]+)/';

            if (!preg_match_all(
                pattern: $pattern,
                subject: $rawContent,
                matches: $matches,
                flags: PREG_SET_ORDER
            )) {
                return [];
            }

            foreach ($matches as $match) {
                $attributes = (string) $match[1];
                $url = trim(string: $match[2]);

                // Ignorar URLs vacías o comentarios
                if (empty($url) || str_starts_with(haystack: $url, needle: '#')) {
                    continue;
                }

                $variant = [
                    'bandwidth'  => $this->parseStreamAttribute(attributes: $attributes, name: 'BANDWIDTH'),
                    'resolution' => $this->parseStreamAttribute(attributes: $attributes, name: 'RESOLUTION'),
                    'codecs'     => $this->parseStreamAttribute(attributes: $attributes, name: 'CODECS'),
                    'url'        => $url,
                    'frame_rate' => $this->parseStreamAttribute(attributes: $attributes, name: 'FRAME-RATE'),
                    'name'       => $this->parseStreamAttribute(attributes: $attributes, name: 'NAME'),
                ];

                // Solo incluir variantes con ancho de banda válido
                if ($variant['bandwidth'] > 0) {
                    $variants[] = $variant;
                }
            }

            // Ordenar por ancho de banda descendente (mayor calidad primero)
            usort(
                array: $variants,
                callback: fn(array $a, array $b): int => $b['bandwidth'] <=> $a['bandwidth']
            );

            return $variants;
        } catch (\Throwable $e) {
            return [];
        }
    }

    /**
     * Puntuar una variante contra las capacidades del dispositivo.
     *
     * El puntaje es una composición ponderada:
     *   - bandwidth_fit:   0-25 pts (cuanto más cerca de 80% del throughput máximo, mejor)
     *   - resolution_fit:  0-25 pts (coincidencia con resolución máxima del TV)
     *   - codec_fit:       0-20 pts (HEVC > H264, soporte de decodificación hardware)
     *   - hdr_fit:         0-15 pts (si el TV soporta HDR y la variante tiene HDR)
     *   - buffer_headroom: 0-15 pts (menor ancho de banda = más margen de buffer)
     *
     * @param array $variant      Datos de la variante a puntuar
     * @param array $capabilities Capacidades del dispositivo/TV
     *
     * @return float Puntaje total de 0.0 a 100.0
     */
    public function scoreVariant(array $variant, array $capabilities): float
    {
        try {
            $score = 0.0;

            // === Ajuste de ancho de banda (25 puntos máx) ===
            $score += $this->scoreBandwidthFit(
                variant: $variant,
                capabilities: $capabilities
            );

            // === Ajuste de resolución (25 puntos máx) ===
            $score += $this->scoreResolutionFit(
                variant: $variant,
                capabilities: $capabilities
            );

            // === Ajuste de códec (20 puntos máx) ===
            $score += $this->scoreCodecFit(
                variant: $variant,
                capabilities: $capabilities
            );

            // === Ajuste HDR (15 puntos máx) ===
            $score += $this->scoreHdrFit(
                variant: $variant,
                capabilities: $capabilities
            );

            // === Margen de buffer (15 puntos máx) ===
            $score += $this->scoreBufferHeadroom(
                variant: $variant,
                capabilities: $capabilities
            );

            return max(0.0, min(100.0, $score));
        } catch (\Throwable $e) {
            return 0.0;
        }
    }

    /**
     * Seleccionar la mejor variante basándose en capacidades y telemetría.
     *
     * Evalúa todas las variantes, las puntua y selecciona la óptima.
     * La selección considera la telemetría de reproducción para ajustarse:
     *   - Problemas de buffering → preferir variante de menor ancho de banda
     *   - Sistema saludable → preferir la mayor calidad viable
     *   - Sin telemetría → selección basada solo en capacidades
     *
     * @param array $variants     Lista de variantes parseadas
     * @param array $capabilities Capacidades del dispositivo
     * @param array $telemetry    Telemetría de reproducción (opcional)
     *
     * @return array|null Variante seleccionada, o null si no hay variantes válidas
     */
    public function selectBestVariant(array $variants, array $capabilities, array $telemetry = []): ?array
    {
        try {
            if (empty($variants)) {
                return null;
            }

            // Puntuar cada variante contra las capacidades
            $scored = [];
            foreach ($variants as $variant) {
                $baseScore = $this->scoreVariant(
                    variant: $variant,
                    capabilities: $capabilities
                );

                // Ajustar puntuación basándose en telemetría
                $adjustedScore = $this->adjustScoreWithTelemetry(
                    score: $baseScore,
                    variant: $variant,
                    telemetry: $telemetry
                );

                $scored[] = [
                    'variant' => $variant,
                    'base_score' => $baseScore,
                    'adjusted_score' => $adjustedScore,
                ];
            }

            // Ordenar por puntaje ajustado descendente
            usort(
                array: $scored,
                callback: fn(array $a, array $b): float => $b['adjusted_score'] <=> $a['adjusted_score']
            );

            // Verificar que la mejor variante no excede capacidades del dispositivo
            $best = $scored[0];
            if (!$this->variantIsCompatible(
                variant: $best['variant'],
                capabilities: $capabilities
            )) {
                // Buscar la primera variante compatible
                foreach ($scored as $entry) {
                    if ($this->variantIsCompatible(
                        variant: $entry['variant'],
                        capabilities: $capabilities
                    )) {
                        return $entry['variant'];
                    }
                }
                // Ninguna compatible → retornar la de menor ancho de banda
                return $variants[array_key_last(array: $variants)] ?? null;
            }

            return $best['variant'];
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Generar directivas de override de variante según el tipo de reproductor.
     *
     * Formatea las directivas apropiadas para cada tipo de reproductor:
     *   - VLC: preferred-resolution, adaptive-maxwidth, adaptive-maxheight
     *   - OTT: cabecera X-Max-Bitrate
     *   - ExoPlayer: cabecera X-Initial-Bitrate
     *   - Otros: sin directivas (el reproductor selecciona automáticamente)
     *
     * @param array  $selectedVariant Variante seleccionada
     * @param string $playerType      Tipo de reproductor (vlc, ott, exo, etc.)
     *
     * @return array Directivas específicas del reproductor, o vacío si no aplica
     */
    public function generateVariantDirectives(array $selectedVariant, string $playerType): array
    {
        try {
            if (empty($selectedVariant)) {
                return [];
            }

            $playerType = strtolower(string: $playerType);

            return match (true) {
                // VLC: usar directivas de resolución adaptativa
                str_contains(haystack: $playerType, needle: 'vlc') => $this->vlcDirectives(
                    variant: $selectedVariant
                ),

                // OTT/Stalker: usar cabecera de bitrate máximo
                str_contains(haystack: $playerType, needle: 'ott')
                || str_contains(haystack: $playerType, needle: 'stalker') => $this->ottDirectives(
                    variant: $selectedVariant
                ),

                // ExoPlayer: usar cabecera de bitrate inicial
                str_contains(haystack: $playerType, needle: 'exo') => $this->exoDirectives(
                    variant: $selectedVariant
                ),

                // Otros reproductores: sin directivas (auto-selección)
                default => [],
            };
        } catch (\Throwable $e) {
            return [];
        }
    }

    // =========================================================================
    // MÉTODOS PRIVADOS DE PUNTUACIÓN
    // =========================================================================

    /**
     * Puntuar el ajuste de ancho de banda (0-25 puntos).
     *
     * La mejor puntuación se obtiene cuando el bitrate de la variante
     * está cerca del 80% del throughput máximo del dispositivo.
     * Demasiado alto = riesgo de buffering; demasiado bajo = calidad desperdiciada.
     *
     * @param array $variant      Variante a evaluar
     * @param array $capabilities Capacidades del dispositivo
     *
     * @return float Puntaje de 0.0 a 25.0
     */
    private function scoreBandwidthFit(array $variant, array $capabilities): float
    {
        $variantBw = (int) ($variant['bandwidth'] ?? 0);
        if ($variantBw <= 0) {
            return 0.0;
        }

        $maxThroughput = (int) ($capabilities['max_bandwidth_kbps'] ?? 0) * 1000;
        if ($maxThroughput <= 0) {
            // Sin dato de throughput → puntuación neutra
            return 12.5;
        }

        // Calcular ratio del bitrate respecto al throughput
        $ratio = $variantBw / $maxThroughput;

        // Ideal: 80% del throughput máximo
        $optimalRatio = 0.80;
        $deviation = abs(num: $ratio - $optimalRatio);

        // Penalizar más si excede el throughput (buffering)
        if ($ratio > 1.0) {
            return 0.0;
        }

        // Puntuación basada en cercanía al óptimo (0 = en el punto ideal, 1 = muy lejos)
        $maxDeviation = 0.80;
        $penaltyFactor = min(1.0, $deviation / $maxDeviation);

        return 25.0 * (1.0 - $penaltyFactor);
    }

    /**
     * Puntuar el ajuste de resolución (0-25 puntos).
     *
     * Evalúa qué tan bien coincide la resolución de la variante
     * con la resolución máxima del TV.
     *
     * @param array $variant      Variante a evaluar
     * @param array $capabilities Capacidades del dispositivo
     *
     * @return float Puntaje de 0.0 a 25.0
     */
    private function scoreResolutionFit(array $variant, array $capabilities): float
    {
        $variantRes = (string) ($variant['resolution'] ?? '');
        $tvRes = (string) ($capabilities['resolution'] ?? $capabilities['max_resolution'] ?? '');

        if (empty($variantRes) || empty($tvRes)) {
            return 12.5;
        }

        // Extraer altura en píxeles de las resoluciones (formato: WxH)
        $variantHeight = $this->parseResolutionHeight(resolution: $variantRes);
        $tvHeight = $this->parseResolutionHeight(resolution: $tvRes);

        if ($tvHeight <= 0 || $variantHeight <= 0) {
            return 12.5;
        }

        // Variante que exceda la resolución del TV: penalizar
        if ($variantHeight > $tvHeight) {
            return 5.0; // Aún usable pero desperdicia ancho de banda
        }

        // Coincidencia perfecta
        if ($variantHeight === $tvHeight) {
            return 25.0;
        }

        // Penalización proporcional a la diferencia
        $ratio = $variantHeight / $tvHeight;
        return 25.0 * $ratio;
    }

    /**
     * Puntuar el ajuste de códec (0-20 puntos).
     *
     * Evalúa compatibilidad de códecs. HEVC (H.265) es preferido sobre
     * H.264 por eficiencia. Se consideran códecs soportados por el TV.
     *
     * @param array $variant      Variante a evaluar
     * @param array $capabilities Capacidades del dispositivo
     *
     * @return float Puntaje de 0.0 a 20.0
     */
    private function scoreCodecFit(array $variant, array $capabilities): float
    {
        $variantCodecs = strtolower(string: (string) ($variant['codecs'] ?? ''));
        $supportedCodecs = array_map(
            callback: 'strtolower',
            array: (array) ($capabilities['supported_codecs'] ?? $capabilities['codecs'] ?? [])
        );

        if (empty($variantCodecs)) {
            return 10.0;
        }

        // HEVC es preferido (mejor compresión = más calidad por menos bitrate)
        $hasHevc = str_contains(haystack: $variantCodecs, needle: 'hev')
            || str_contains(haystack: $variantCodecs, needle: 'h265');
        $hasH264 = str_contains(haystack: $variantCodecs, needle: 'avc')
            || str_contains(haystack: $variantCodecs, needle: 'h264');

        // Verificar soporte del TV
        $tvSupportsHevc = in_array(
            needle: 'hevc',
            haystack: $supportedCodecs,
            strict: true
        ) || in_array(
            needle: 'h265',
            haystack: $supportedCodecs,
            strict: true
        );

        // Si el TV soporta HEVC y la variante tiene HEVC → máximo
        if ($hasHevc && $tvSupportsHevc) {
            return 20.0;
        }

        // Si la variante tiene HEVC pero el TV no lo soporta → códec no compatible
        if ($hasHevc && !$tvSupportsHevc) {
            return 3.0;
        }

        // H264: buen puntaje (universalmente compatible)
        if ($hasH264) {
            return 15.0;
        }

        // Códec desconocido → puntuación baja
        return 8.0;
    }

    /**
     * Puntuar el ajuste HDR (0-15 puntos).
     *
     * Evalúa si la variante ofrece HDR y si el TV lo soporta.
     *
     * @param array $variant      Variante a evaluar
     * @param array $capabilities Capacidades del dispositivo
     *
     * @return float Puntaje de 0.0 a 15.0
     */
    private function scoreHdrFit(array $variant, array $capabilities): float
    {
        $tvSupportsHdr = (bool) ($capabilities['hdr'] ?? $capabilities['hdr_support'] ?? false);
        $variantCodecs = strtolower(string: (string) ($variant['codecs'] ?? ''));

        // Verificar si la variante indica HDR en los códecs
        $variantHasHdr = str_contains(haystack: $variantCodecs, needle: 'hdr')
            || str_contains(haystack: $variantCodecs, needle: 'dovi')
            || str_contains(haystack: $variantCodecs, needle: 'dvhe');

        // Ambos soportan HDR → máximo
        if ($tvSupportsHdr && $variantHasHdr) {
            return 15.0;
        }

        // TV soporta HDR pero variante no → calidad estándar (no penalizar la variante)
        if ($tvSupportsHdr && !$variantHasHdr) {
            return 10.0;
        }

        // Variante tiene HDR pero TV no lo soporta → desperdiciado pero funcional
        if (!$tvSupportsHdr && $variantHasHdr) {
            return 10.0;
        }

        // Ninguno soporta HDR → neutral
        return 10.0;
    }

    /**
     * Puntuar el margen de buffer (0-15 puntos).
     *
     * Evalúa cuánto margen de red queda disponible. Menor ancho de banda
     * requerido = más margen de seguridad para el buffer.
     *
     * @param array $variant      Variante a evaluar
     * @param array $capabilities Capacidades del dispositivo
     *
     * @return float Puntaje de 0.0 a 15.0
     */
    private function scoreBufferHeadroom(array $variant, array $capabilities): float
    {
        $variantBw = (int) ($variant['bandwidth'] ?? 0);
        $maxThroughput = (int) ($capabilities['max_bandwidth_kbps'] ?? 0) * 1000;

        if ($maxThroughput <= 0 || $variantBw <= 0) {
            return 7.5;
        }

        // Calcular porcentaje de throughput utilizado
        $utilization = $variantBw / $maxThroughput;

        return match (true) {
            $utilization < 0.30  => 15.0,  // Mucho margen (muy seguro)
            $utilization < 0.50  => 12.0,  // Buen margen
            $utilization < 0.70  => 8.0,   // Margen aceptable
            $utilization < 0.90  => 4.0,   // Margen bajo
            default              => 1.0,   // Sin margen (riesgoso)
        };
    }

    // =========================================================================
    // MÉTODOS PRIVADOS DE SELECCIÓN
    // =========================================================================

    /**
     * Ajustar puntaje de variante basándose en telemetría de reproducción.
     *
     * Si hay problemas de buffering, reduce el puntaje de variantes de alto bitrate.
     * Si el sistema está saludable, mantiene el puntaje original.
     *
     * @param float $score    Puntaje base de la variante
     * @param array $variant  Datos de la variante
     * @param array $telemetry Telemetría de reproducción
     *
     * @return float Puntaje ajustado
     */
    private function adjustScoreWithTelemetry(float $score, array $variant, array $telemetry): float
    {
        if (empty($telemetry) || ($telemetry['samples'] ?? 0) === 0) {
            return $score;
        }

        $health = (float) ($telemetry['health_score'] ?? 50.0);
        $bufferingRatio = (float) ($telemetry['avg_buffering_ratio'] ?? 0.0);
        $variantBw = (int) ($variant['bandwidth'] ?? 0);

        // Penalizar variantes de alto bitrate si hay buffering
        if ($bufferingRatio > 0.05) {
            // Mayor penalización para variantes de mayor ancho de banda
            $penalty = min(30.0, $bufferingRatio * 200);
            // Variante de alto bitrate recibe mayor penalización
            if ($variantBw > 6000000) {
                $penalty *= 1.5;
            }
            $score = max(0.0, $score - $penalty);
        }

        // Bonificar variantes de menor bitrate si la salud es baja
        if ($health < 50.0 && $variantBw > 0 && $variantBw < 3000000) {
            $score = min(100.0, $score + 10.0);
        }

        return $score;
    }

    /**
     * Verificar si una variante es compatible con las capacidades del dispositivo.
     *
     * Comprueba que la resolución no exceda la del TV y que los códecs sean soportados.
     *
     * @param array $variant      Variante a verificar
     * @param array $capabilities Capacidades del dispositivo
     *
     * @return bool true si la variante es compatible
     */
    private function variantIsCompatible(array $variant, array $capabilities): bool
    {
        // Verificar resolución
        $variantHeight = $this->parseResolutionHeight(
            resolution: (string) ($variant['resolution'] ?? '')
        );
        $tvHeight = $this->parseResolutionHeight(
            resolution: (string) ($capabilities['resolution'] ?? $capabilities['max_resolution'] ?? '')
        );

        // Si conocemos ambas resoluciones, la variante no debe exceder al TV
        if ($variantHeight > 0 && $tvHeight > 0 && $variantHeight > $tvHeight) {
            return false;
        }

        return true;
    }

    // =========================================================================
    // MÉTODOS PRIVADOS DE DIRECTIVAS POR REPRODUCTOR
    // =========================================================================

    /**
     * Generar directivas específicas para reproductor VLC.
     *
     * @param array $variant Variante seleccionada
     *
     * @return array Directivas VLC
     */
    private function vlcDirectives(array $variant): array
    {
        $directives = [];
        $resolution = (string) ($variant['resolution'] ?? '');
        $height = $this->parseResolutionHeight(resolution: $resolution);

        if ($height > 0) {
            $directives['preferred-resolution'] = $height;
            $directives['adaptive-maxheight'] = $height;
        }

        // Limitar ancho de banda adaptativo
        $bandwidth = (int) ($variant['bandwidth'] ?? 0);
        if ($bandwidth > 0) {
            // Convertir de bps a kbps para VLC
            $directives['adaptive-maxbitrate'] = (int) ($bandwidth / 1000);
        }

        return $directives;
    }

    /**
     * Generar directivas específicas para reproductores OTT/Stalker.
     *
     * @param array $variant Variante seleccionada
     *
     * @return array Directivas OTT como cabeceras
     */
    private function ottDirectives(array $variant): array
    {
        $directives = [];

        $bandwidth = (int) ($variant['bandwidth'] ?? 0);
        if ($bandwidth > 0) {
            // Cabecera de bitrate máximo en kbps
            $directives['X-Max-Bitrate'] = (string) (int) ceil(num: $bandwidth / 1000);
        }

        $resolution = (string) ($variant['resolution'] ?? '');
        if (!empty($resolution)) {
            $directives['X-Preferred-Resolution'] = $resolution;
        }

        return $directives;
    }

    /**
     * Generar directivas específicas para ExoPlayer.
     *
     * @param array $variant Variante seleccionada
     *
     * @return array Directivas ExoPlayer como cabeceras
     */
    private function exoDirectives(array $variant): array
    {
        $directives = [];

        $bandwidth = (int) ($variant['bandwidth'] ?? 0);
        if ($bandwidth > 0) {
            // Cabecera de bitrate inicial en bps (ExoPlayer usa bps)
            $directives['X-Initial-Bitrate'] = (string) $bandwidth;
            // Permitir que ExoPlayer suba hasta 1.5x del bitrate inicial
            $directives['X-Max-Bitrate'] = (string) (int) ($bandwidth * 1.5);
        }

        return $directives;
    }

    // =========================================================================
    // MÉTODOS AUXILIARES
    // =========================================================================

    /**
     * Extraer un atributo de una línea #EXT-X-STREAM-INF.
     *
     * @param string $attributes Cadena de atributos (ej: "BANDWIDTH=8000000,RESOLUTION=1920x1080")
     * @param string $name       Nombre del atributo a extraer
     *
     * @return string|int Valor del atributo (int para numéricos, string para texto)
     */
    private function parseStreamAttribute(string $attributes, string $name): string|int
    {
        // Buscar NOMBRE=VALOR (puede estar entre comillas o no)
        $pattern = '/' . preg_quote(str: $name, delimiter: '/') . '=([^,\s"]+|"[^"]*")/';
        if (!preg_match(pattern: $pattern, subject: $attributes, matches: $matches)) {
            return $name === 'BANDWIDTH' ? 0 : '';
        }

        $value = trim(string: $matches[1], characters: '"\' ');

        // Retornar como entero para atributos numéricos
        if (is_numeric(value: $value)) {
            return (int) $value;
        }

        return $value;
    }

    /**
     * Extraer la altura en píxeles de una cadena de resolución.
     *
     * @param string $resolution Resolución en formato "WxH" (ej: "1920x1080")
     *
     * @return int Altura en píxeles, o 0 si no se puede parsear
     */
    private function parseResolutionHeight(string $resolution): int
    {
        if (empty($resolution)) {
            return 0;
        }

        // Formato: "WxH" o "WxH@fps"
        $parts = preg_split(
            pattern: '/[x@]/',
            subject: strtolower(string: $resolution)
        );

        return isset($parts[1]) ? (int) $parts[1] : 0;
    }
}
