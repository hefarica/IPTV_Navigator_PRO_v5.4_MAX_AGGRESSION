<?php
declare(strict_types=1);

/**
 * MÓDULO 2: IdempotentNormalizationEngine — Motor de Normalización Idempotente
 * ===========================================================================
 * Deduplica directivas, resuelve conflictos y hereda políticas del ADN.
 * Garantiza que la misma entrada produzca siempre la misma salida.
 *
 * Reglas de resolución:
 * - Para "más es mejor" (buffer, bitrate, retry): MAX gana
 * - Para "más específico es mejor" (codec, resolución, HDR): más específico gana
 * - Directivas duplicadas exactas: se eliminan
 * - Misma clave con valores distintos: se resuelve por precedencia
 *
 * @package ResolveQuality v2.5 ULTRA
 * @module  IdempotentNormalizationEngine
 */

class IdempotentNormalizationEngine
{
    /**
     * Normaliza todas las directivas y políticas heredadas del ADN.
     *
     * @param  array $dna ADN del manifiesto (salida de ManifestAnatomyParser)
     * @return array{inherited_policies: array, normalized_directives: array}
     */
    public function normalize(array $dna): array
    {
        $inheritedPolicies = $this->mergeInheritedPolicies(dna: $dna);
        $normalizedDirectives = $this->buildNormalizedDirectives(dna: $dna);

        return [
            'inherited_policies'     => $inheritedPolicies,
            'normalized_directives'  => $normalizedDirectives,
        ];
    }

    /**
     * Deduplica directivas por tipo, manteniendo el orden de inserción original.
     *
     * @param  array  $directives Lista de directivas crudas
     * @param  string $type       Tipo: 'vlcopt', 'kodiprop', 'exthttp'
     * @return array  Directivas deduplicadas (la primera aparición gana)
     */
    private function deduplicateDirectives(array $directives, string $type): array
    {
        $seen = [];
        $result = [];

        foreach ($directives as $directive) {
            $key = match ($type) {
                'vlcopt', 'kodiprop' => strstr($directive, '=', true) ?: $directive,
                'exthttp' => is_array($directive)
                    ? array_key_first($directive)
                    : strstr((string) $directive, '=', true),
                default => $directive,
            };

            if ($key !== null && !isset($seen[$key])) {
                $seen[$key] = true;
                $result[] = $directive;
            }
        }

        return $result;
    }

    /**
     * Resuelve conflictos de buffer: el valor MÁXIMO gana.
     * "Más buffer es mejor" cuando la red lo permite.
     *
     * @param  array<int> $values Valores de buffer encontrados (ms)
     * @return int|null   Valor máximo o null si no hay valores válidos
     */
    private function resolveBufferConflicts(array $values): ?int
    {
        $valid = array_filter($values, static fn($v): bool => is_numeric($v) && $v > 0
        );

        if (empty($valid)) {
            return null;
        }

        return (int) max($valid);
    }

    /**
     * Resuelve conflictos de codec: el más específico gana.
     *
     * Orden de especificidad: av1(5) > hevc/h265(4) > vp9(3) > h264/avc(2) > otros(1) > any(0)
     *
     * @param  array<string> $values Codecs encontrados
     * @return string|null    Codec más específico
     */
    private function resolveCodecConflicts(array $values): ?string
    {
        if (empty($values)) {
            return null;
        }

        $specificity = [
            'av1'  => 5,
            'hevc' => 4,
            'h265' => 4,
            'vp9'  => 3,
            'h264' => 2,
            'avc'  => 2,
            'any'  => 0,
        ];

        $best = null;
        $bestScore = -1;

        foreach ($values as $codec) {
            $low = strtolower(trim($codec));
            $score = $specificity[$low] ?? 1;

            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $low;
            }
        }

        return $best;
    }

    /**
     * Fusión de políticas heredadas del ADN del manifiesto.
     *
     * Extrae y resuelve valores de: buffer, codec, HDR, resolución,
     * bitrate, fallback, red, deinterlace, audio passthrough, profundidad de color.
     */
    private function mergeInheritedPolicies(array $dna): array
    {
        $policies = [
            'buffer'            => null,
            'codec'             => null,
            'hdr'               => [],
            'resolution'        => null,
            'bitrate'           => null,
            'fallback_chain'    => $dna['fallback_chains'],
            'network'           => [],
            'deinterlace'       => null,
            'audio_passthrough' => null,
            'color_depth'       => null,
        ];

        // --- Extraer buffer de EXTVLCOPT (caching=) ---
        $bufferValues = [];
        foreach ($dna['extvlcopt'] as $opt) {
            if (str_contains(strtolower($opt), 'caching=')) {
                $eqPos = strpos($opt, '=');
                if ($eqPos !== false) {
                    $val = (int) substr($opt, $eqPos + 1);
                    if ($val > 0) {
                        $bufferValues[] = $val;
                    }
                }
            }
        }
        $policies['buffer'] = $this->resolveBufferConflicts(values: $bufferValues);

        // --- Extraer codec de hints y atributos APE ---
        $codecs = [];
        if (!empty($dna['codec_hints']['codec'])) {
            $codecs[] = $dna['codec_hints']['codec'];
        }
        if (isset($dna['ape_attributes']['ape-codec'])) {
            $codecs[] = $dna['ape_attributes']['ape-codec'];
        }
        $policies['codec'] = $this->resolveCodecConflicts(values: $codecs);

        // --- HDR desde hints ---
        $policies['hdr'] = array_keys($dna['hdr_hints']);

        // --- Resolución desde atributos EXTINF ---
        foreach ($dna['extinf_entries'] as $entry) {
            $attrs = $entry['attributes'];
            if (isset($attrs['resolution'])) {
                $policies['resolution'] = $attrs['resolution'];
            }
            if (isset($attrs['preferred-resolution'])) {
                $policies['resolution'] = $attrs['preferred-resolution'];
            }
        }

        // --- Bitrate desde atributos EXTINF ---
        foreach ($dna['extinf_entries'] as $entry) {
            if (isset($entry['attributes']['bitrate'])) {
                $policies['bitrate'] = (int) $entry['attributes']['bitrate'];
            }
        }

        // --- Deinterlace detectado en EXTVLCOPT ---
        foreach ($dna['extvlcopt'] as $opt) {
            if (str_contains(strtolower($opt), 'deinterlace')) {
                $policies['deinterlace'] = 'detected';
            }
        }

        // --- Profundidad de color desde atributos ---
        foreach ($dna['extinf_entries'] as $entry) {
            if (isset($entry['attributes']['color-depth'])) {
                $policies['color_depth'] = (int) $entry['attributes']['color-depth'];
            }
        }

        return $policies;
    }

    /**
     * Construye el set final de directivas normalizadas.
     * Cada tipo se deduplica independientemente.
     */
    private function buildNormalizedDirectives(array $dna): array
    {
        return [
            'extvlcopt'         => $this->deduplicateDirectives(directives: $dna['extvlcopt'], type: 'vlcopt'),
            'kodiprop'          => $this->deduplicateDirectives(directives: $dna['kodiprop'], type: 'kodiprop'),
            'exthttp'           => $dna['exthttp'],  // Ya es mapa key=>value
            'extx'              => $dna['extx_tags'], // Tags HLS se preservan todos
            'extinf_overrides'  => [],               // Se llenan durante inyección si es necesario
        ];
    }
}
