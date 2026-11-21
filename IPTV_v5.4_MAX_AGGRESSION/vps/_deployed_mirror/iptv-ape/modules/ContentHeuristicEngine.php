<?php
declare(strict_types=1);

/**
 * MÓDULO 4: ContentHeuristicEngine — Motor Heurístico de Clasificación de Contenido
 * =================================================================================
 * Analiza el nombre del canal y el grupo para determinar el tipo de contenido
 * (deportes, cine, noticias, música, documentales, infantil, general).
 *
 * Cada tipo tiene un perfil que modifica el comportamiento del pipeline:
 * buffer, latencia, codec preferido, bitrate mínimo.
 *
 * Soporta patrones en español e inglés.
 *
 * @package ResolveQuality v2.5 ULTRA
 * @module  ContentHeuristicEngine
 */

/**
 * Patrones regex (case-insensitive) para clasificar contenido.
 * Soportan términos en español e inglés.
 */
const CONTENT_PATTERNS = [
    ContentType::SPORTS->value => '/deport|sport|futbol|soccer|football|nba|nfl|mlb|nhl|f1|formula|moto|gp|tenis|tennis|boxeo|boxing|ufc|mma|wrestling|lucha|baloncesto|basket|beisbol|baseball|golf|cricket|rugby|olympic|juegos/i',
    ContentType::CINEMA->value => '/pelicula|movie|film|cinema|cine|estreno|premier|premium|4k.*movie|uhd.*film/i',
    ContentType::NEWS->value => '/noticia|news|informe|24.*horas|24h|cnbc|cnn|bbc|aljazeera|teleSUR|en.*vivo.*noticia/i',
    ContentType::MUSIC->value => '/musica|music|mtv|vh1|radio.*vis|hit|concert|vivo.*music/i',
    ContentType::DOCUMENTARY->value => '/documental|documentary|natgeo|discovery|historia|history|nat.*geo|animal/i',
    ContentType::KIDS->value => '/infantil|kids|children|nick|cartoon|disney.*ch|anime|dragon|paw/i',
];

/**
 * Perfiles de configuración por tipo de contenido.
 * Cada perfil define modificadores que ajustan el pipeline.
 */
const CONTENT_PROFILES = [
    ContentType::SPORTS->value => [
        'buffer_modifier'      => 1.4,
        'latency_sensitivity'  => 'low',
        'preferred_codec'      => 'hevc',
        'min_bitrate_kbps'     => 5000,
    ],
    ContentType::CINEMA->value => [
        'buffer_modifier'      => 1.2,
        'latency_sensitivity'  => 'normal',
        'preferred_codec'      => 'hevc',
        'min_bitrate_kbps'     => 8000,
    ],
    ContentType::NEWS->value => [
        'buffer_modifier'      => 1.0,
        'latency_sensitivity'  => 'high',
        'preferred_codec'      => null,
        'min_bitrate_kbps'     => 2000,
    ],
    ContentType::MUSIC->value => [
        'buffer_modifier'      => 1.1,
        'latency_sensitivity'  => 'normal',
        'preferred_codec'      => 'hevc',
        'min_bitrate_kbps'     => 1500,
    ],
    ContentType::DOCUMENTARY->value => [
        'buffer_modifier'      => 1.15,
        'latency_sensitivity'  => 'normal',
        'preferred_codec'      => 'hevc',
        'min_bitrate_kbps'     => 4000,
    ],
    ContentType::KIDS->value => [
        'buffer_modifier'      => 1.2,
        'latency_sensitivity'  => 'low',
        'preferred_codec'      => 'hevc',
        'min_bitrate_kbps'     => 3000,
    ],
    ContentType::GENERAL->value => [
        'buffer_modifier'      => 1.0,
        'latency_sensitivity'  => 'normal',
        'preferred_codec'      => null,
        'min_bitrate_kbps'     => 2000,
    ],
];

class ContentHeuristicEngine
{
    /**
     * Clasifica el contenido de un canal según su nombre y grupo.
     *
     * Evalúa todos los patrones de contenido y selecciona el que tenga
     * mayor confianza. El grupo tiene prioridad sobre el nombre del canal.
     *
     * @param  string $channelName Nombre del canal
     * @param  string $groupTitle  Título del grupo
     * @param  array  $metadata    Metadatos adicionales (atributos EXTINF)
     * @return array{type: string, confidence: float, buffer_modifier: float, latency_sensitivity: string, preferred_codec: ?string, min_bitrate_kbps: int}
     */
    public function classify(string $channelName, string $groupTitle, array $metadata = []): array
    {
        $text = strtolower($channelName . ' ' . $groupTitle);
        $matchedType = ContentType::GENERAL->value;
        $bestConfidence = 0.0;

        // Evaluar cada patrón de contenido contra el texto combinado
        foreach (CONTENT_PATTERNS as $type => $pattern) {
            if (preg_match($pattern, $text)) {
                $confidence = $this->calculateConfidence(text: $text, pattern: $pattern);
                if ($confidence > $bestConfidence) {
                    $bestConfidence = $confidence;
                    $matchedType = $type;
                }
            }
        }

        // Re-evaluar usando solo el grupo (prioridad sobre el nombre)
        $groupText = strtolower($groupTitle);
        foreach (CONTENT_PATTERNS as $type => $pattern) {
            if ($type === $matchedType) {
                continue;
            }
            if (preg_match($pattern, $groupText)) {
                $groupConfidence = $this->calculateConfidence(text: $groupText, pattern: $pattern) * 1.2;
                if ($groupConfidence > $bestConfidence) {
                    $bestConfidence = min(1.0, $groupConfidence);
                    $matchedType = $type;
                }
            }
        }

        // Obtener perfil de configuración para el tipo detectado
        $profile = $this->getContentTypeProfile(type: $matchedType);

        return [
            'type'                => $matchedType,
            'confidence'          => round($bestConfidence, decimals: 2),
            'buffer_modifier'     => $profile['buffer_modifier'],
            'latency_sensitivity' => $profile['latency_sensitivity'],
            'preferred_codec'     => $profile['preferred_codec'],
            'min_bitrate_kbps'    => $profile['min_bitrate_kbps'],
        ];
    }

    /**
     * Verifica si un texto coincide con alguno de los patrones dados.
     *
     * @param  string $text     Texto a evaluar
     * @param  array  $patterns Lista de patrones regex
     * @return bool  True si hay al menos un match
     */
    private function matchPatterns(string $text, array $patterns): bool
    {
        $lower = strtolower($text);
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $lower)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Calcula la confianza de la clasificación (0.0 - 1.0).
     *
     * Factores que aumentan la confianza:
     * - Más matches del patrón (+0.1 por match, máximo +0.3)
     * - Palabras clave de categoría explícita (+0.2)
     *
     * @param  string $text    Texto analizado
     * @param  string $pattern Patrón regex que hizo match
     * @return float  Confidencia calculada (0.0-1.0)
     */
    private function calculateConfidence(string $text, string $pattern): float
    {
        $base = 0.5;

        // Más matches = más confianza
        $count = preg_match_all($pattern, $text);
        $base += min(0.3, $count * 0.1);

        // Si contiene palabras de categoría explícita
        if (preg_match('/group|categoria|category/i', $text)) {
            $base += 0.2;
        }

        return min(1.0, $base);
    }

    /**
     * Obtiene el perfil de configuración para un tipo de contenido.
     * Si el tipo no existe, devuelve el perfil GENERAL.
     *
     * @param  string $type Tipo de contenido
     * @return array  Perfil con buffer_modifier, latency_sensitivity, preferred_codec, min_bitrate_kbps
     */
    private function getContentTypeProfile(string $type): array
    {
        return CONTENT_PROFILES[$type] ?? CONTENT_PROFILES[ContentType::GENERAL->value];
    }
}
