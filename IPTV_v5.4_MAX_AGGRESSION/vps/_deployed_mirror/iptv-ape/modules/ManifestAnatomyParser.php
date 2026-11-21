<?php
declare(strict_types=1);

/**
 * MÓDULO 1: ManifestAnatomyParser — Analizador de Anatomía del Manifiesto
 * ======================================================================
 * Extrae toda la información estructural de una lista M3U/M3U8:
 * entradas EXTINF, directivas de jugador, cabeceras HTTP, perfiles APE,
 * y metadatos del stream. No realiza ninguna petición de red.
 *
 * @package ResolveQuality v2.5 ULTRA
 * @module  ManifestAnatomyParser
 */

/**
 * Analiza el contenido bruto de una lista M3U y devuelve su ADN completo.
 *
 * El ADN incluye: líneas crudas, tags, streams, entradas EXTINF parseadas,
 * directivas VLC/Kodi/HTTP, tags HLS, perfiles APE, tipo de lista, grupos,
 * pistas de codec/HDR/transporte, cadenas de fallback y firma única.
 */
class ManifestAnatomyParser
{
    /**
     * Analiza el contenido bruto de una lista M3U y devuelve su ADN completo.
     *
     * @param  string $raw Contenido bruto del archivo M3U
     * @return array  Estructura manifest_dna completa
     */
    public function parse(string $raw): array
    {
        // Dividir en líneas limpias (normalizar CRLF a LF)
        $lines = array_values(array_filter(
            array_map('trim', explode("\n", str_replace("\r\n", "\n", $raw))),
            static fn(string $line): bool => $line !== ''
        ));

        // Clasificar líneas en tags (empiezan con #) y streams (URLs)
        $classified = $this->classifyLines(lines: $lines);

        // Analizar cada entrada EXTINF para extraer atributos
        $extinfEntries = [];
        foreach ($classified['tags'] as $idx => $tagLine) {
            if (str_starts_with($tagLine, '#EXTINF:')) {
                $parsed = $this->parseExtInf(line: $tagLine);
                $parsed['line_index'] = $idx;
                $extinfEntries[] = $parsed;
            }
        }

        // Construir el ADN completo del manifiesto
        $dna = [
            'raw_lines'        => $lines,
            'tags'             => $classified['tags'],
            'streams'          => $classified['streams'],
            'extinf_entries'   => $extinfEntries,
            'extvlcopt'        => $this->extractDirectivesByPrefix(tags: $classified['tags'], prefix: '#EXTVLCOPT:'),
            'kodiprop'         => $this->extractDirectivesByPrefix(tags: $classified['tags'], prefix: '#KODIPROP:'),
            'exthttp'          => $this->extractHttpHeaders(tags: $classified['tags']),
            'extx_tags'        => $this->extractDirectivesByPrefix(tags: $classified['tags'], prefix: '#EXT-X-'),
            'extattrfromurl'   => $this->extractDirectivesByPrefix(tags: $classified['tags'], prefix: '#EXTATTRFROMURL:'),
            'headers_injected' => $this->extractHttpHeaders(tags: $classified['tags']),
            'ape_profile'      => $this->detectApeProfile(tags: $classified['tags'], extinfEntries: $extinfEntries),
            'ape_attributes'   => $this->extractApeAttributes(extinfEntries: $extinfEntries),
            'list_type'        => $this->detectListType(dna: [
                'tags' => $classified['tags'],
                'streams' => $classified['streams'],
                'extinf_entries' => $extinfEntries,
            ]),
            'has_groups'       => $this->detectGroups(extinfEntries: $extinfEntries),
            'group_title_map'  => $this->buildGroupMap(extinfEntries: $extinfEntries),
            'codec_hints'      => $this->extractCodecHints(extinfEntries: $extinfEntries),
            'hdr_hints'        => $this->extractHdrHints(extinfEntries: $extinfEntries, tags: $classified['tags']),
            'transport_hints'  => $this->extractTransportHints(tags: $classified['tags'], extinfEntries: $extinfEntries),
            'fallback_chains'  => $this->extractFallbackChains(tags: $classified['tags']),
            'total_streams'    => count($classified['streams']),
            'has_hd'           => false,
            'has_4k'           => false,
            'has_hdr'          => false,
            'stream_signature' => '',
        ];

        // Detectar capacidades visuales declaradas en el ADN
        $dna['has_hd'] = $this->detectCapabilityInDna(dna: $dna, pattern: '/hd|1080|1920x1080/i');
        $dna['has_4k'] = $this->detectCapabilityInDna(dna: $dna, pattern: '/4k|2160|3840x2160|uhd/i');
        $dna['has_hdr'] = !empty($dna['hdr_hints']);

        // Construir firma única de la lista (para caché y deduplicación)
        $dna['stream_signature'] = $this->buildStreamSignature(dna: $dna);

        return $dna;
    }

    /**
     * Clasifica las líneas en tags (empiezan con #) y streams (URLs).
     *
     * @param  array $lines Líneas del archivo M3U
     * @return array{tags: array<string>, streams: array<string>}
     */
    private function classifyLines(array $lines): array
    {
        $tags = [];
        $streams = [];

        foreach ($lines as $line) {
            if (str_starts_with($line, '#')) {
                $tags[] = $line;
            } else {
                $streams[] = $line;
            }
        }

        return ['tags' => $tags, 'streams' => $streams];
    }

    /**
     * Parsea una línea #EXTINF y extrae todos los atributos y el título.
     *
     * Formato esperado: #EXTINF:duration [key="value" ...],Title
     *
     * @param  string $line Línea EXTINF completa
     * @return array{duration: int|string, attributes: array<string, string>, title: string}
     */
    private function parseExtInf(string $line): array
    {
        // Eliminar el prefijo #EXTINF:
        $content = substr($line, 8);
        $content = ltrim($content);

        // Separar la parte antes/después de la coma
        $commaPos = strpos($content, ',');
        if ($commaPos === false) {
            return ['duration' => trim($content), 'attributes' => [], 'title' => trim($content)];
        }

        $duration = trim(substr($content, 0, $commaPos));
        $afterComma = substr($content, $commaPos + 1);
        $title = trim($afterComma);
        $beforeComma = substr($content, 0, $commaPos);

        // Inicializar array de atributos
        $attributes = [];

        // Patrón para atributos con comillas dobles: key="value"
        if (preg_match_all('/([a-zA-Z0-9_\-]+)\s*=\s*"([^"]*)"/', $beforeComma, $matches, PREG_SET_ORDER
        )) {
            foreach ($matches as $match) {
                $attributes[$match[1]] = $match[2];
            }
        }

        // Patrón para atributos sin comillas: key=value (solo si no fue capturado)
        if (preg_match_all('/([a-zA-Z0-9_\-]+)\s*=\s*([^\s"]+)/', $beforeComma, $matches, PREG_SET_ORDER
        )) {
            foreach ($matches as $match) {
                if (!isset($attributes[$match[1]])) {
                    $attributes[$match[1]] = $match[2];
                }
            }
        }

        // Buscar atributos incrustados en el título (algunas listas los ponen ahí)
        if (preg_match_all('/([a-zA-Z0-9_\-]+)\s*=\s*"([^"]*)"/', $afterComma, $matches, PREG_SET_ORDER
        )) {
            foreach ($matches as $match) {
                $attributes[$match[1]] = $match[2];
                $title = str_replace($match[0], '', $title);
            }
        }

        $title = trim($title, " \t\n\r\0\x0B,");

        return [
            'duration'   => $duration,
            'attributes' => $attributes,
            'title'      => $title,
        ];
    }

    /**
     * Extrae directivas de un tipo específico por prefijo, deduplicando por clave.
     *
     * @param  array  $tags   Lista de tags del manifiesto
     * @param  string $prefix Prefijo a buscar (ej: '#EXTVLCOPT:')
     * @return array<string>  Directivas encontradas sin duplicados
     */
    private function extractDirectivesByPrefix(array $tags, string $prefix): array
    {
        $found = [];
        $seen = [];

        foreach ($tags as $tag) {
            if (str_starts_with($tag, $prefix)) {
                $value = substr($tag, strlen($prefix));
                // Deduplicar por la parte antes del primer '='
                $key = strstr($value, '=', true) ?: $value;
                if (!isset($seen[$key])) {
                    $seen[$key] = true;
                    $found[] = $value;
                }
            }
        }

        return $found;
    }

    /**
     * Extrae cabeceras HTTP de las directivas #EXTHTTP.
     * Soporta tanto formato JSON como formato simple key=value.
     *
     * @param  array $tags Lista de tags del manifiesto
     * @return array<string, string> Mapa de cabeceras HTTP
     */
    private function extractHttpHeaders(array $tags): array
    {
        $headers = [];

        foreach ($tags as $tag) {
            if (!str_starts_with($tag, '#EXTHTTP:')) {
                continue;
            }

            $value = trim(substr($tag, 9));

            // Intentar decodificar como JSON primero
            $decoded = json_decode($value, true);
            if (is_array($decoded)) {
                foreach ($decoded as $k => $v) {
                    $headers[(string) $k] = (string) $v;
                }
                continue;
            }

            // Formato simple: key=value
            $eqPos = strpos($value, '=');
            if ($eqPos !== false) {
                $key = trim(substr($value, 0, $eqPos));
                $val = trim(substr($value, $eqPos + 1));
                if ($key !== '' && $val !== '') {
                    $headers[$key] = $val;
                }
            }
        }

        return $headers;
    }

    /**
     * Detecta el perfil APE de la lista buscando atributos ape-profile
     * en EXTINF o tags #APE-*.
     */
    private function detectApeProfile(array $tags, array $extinfEntries): ?string
    {
        // Buscar en tags APE explícitos
        foreach ($tags as $tag) {
            if (str_starts_with($tag, '#APE-')) {
                return trim(substr($tag, 5));
            }
        }

        // Buscar en atributos EXTINF
        foreach ($extinfEntries as $entry) {
            if (isset($entry['attributes']['ape-profile']) && $entry['attributes']['ape-profile'] !== '') {
                return $entry['attributes']['ape-profile'];
            }
        }

        return null;
    }

    /**
     * Extrae todos los atributos APE de las entradas EXTINF.
     * Los atributos APE son aquellos cuya clave empieza con 'ape-'.
     */
    private function extractApeAttributes(array $extinfEntries): array
    {
        $apeAttrs = [];

        foreach ($extinfEntries as $entry) {
            foreach ($entry['attributes'] as $key => $value) {
                if (str_starts_with(strtolower($key), 'ape-')) {
                    $apeAttrs[$key] = $value;
                }
            }
        }

        return $apeAttrs;
    }

    /**
     * Detecta el tipo de lista basándose en estructura y contenido.
     * Criterios: patrones VOD en group-title, proporción de entradas, etc.
     */
    private function detectListType(array $dna): string
    {
        $entries = $dna['extinf_entries'];

        if (empty($entries)) {
            return ListType::UNKNOWN->value;
        }

        $vodPatterns = '/pelicula|movie|film|vod|cine|estreno/i';
        $vodCount = 0;
        $liveCount = 0;

        foreach ($entries as $entry) {
            $group = $entry['attributes']['group-title'] ?? '';
            $title = $entry['title'] ?? '';

            if (preg_match($vodPatterns, $group . ' ' . $title)) {
                $vodCount++;
            } else {
                $liveCount++;
            }
        }

        $total = count($entries);

        if ($vodCount > 0 && $liveCount > 0) {
            return ListType::MIXED->value;
        }

        if ($vodCount > $total * 0.5) {
            return ListType::VOD->value;
        }

        return ListType::LIVE->value;
    }

    /**
     * Detecta si la lista tiene grupos definidos (group-title no vacío).
     */
    private function detectGroups(array $extinfEntries): bool
    {
        foreach ($extinfEntries as $entry) {
            if (!empty($entry['attributes']['group-title'])) {
                return true;
            }
        }
        return false;
    }

    /**
     * Construye un mapa de group-title → cantidad de canales.
     */
    private function buildGroupMap(array $extinfEntries): array
    {
        $map = [];
        foreach ($extinfEntries as $entry) {
            $group = $entry['attributes']['group-title'] ?? 'Sin grupo';
            $map[$group] = ($map[$group] ?? 0) + 1;
        }
        return $map;
    }

    /**
     * Extrae pistas de codec del ADN (atributos EXTINF).
     */
    private function extractCodecHints(array $extinfEntries): array
    {
        $hints = [];
        $codecKeywords = ['codec', 'video-codec', 'video-code'];

        foreach ($extinfEntries as $entry) {
            foreach ($entry['attributes'] as $key => $value) {
                if (in_array(strtolower($key), $codecKeywords, true)) {
                    $hints['codec'] = strtolower($value);
                }
                if (str_contains(strtolower($key), 'video-track') ||
                    str_contains(strtolower($key), 'bl-video-track')) {
                    $hints[$key] = $value;
                }
            }
        }

        return $hints;
    }

    /**
     * Extrae pistas de HDR del ADN.
     */
    private function extractHdrHints(array $extinfEntries, array $tags): array
    {
        $hints = [];
        $hdrKeywords = ['hdr', 'dolby-vision', 'dv', 'hdr10', 'hlg', 'pq'];

        foreach ($extinfEntries as $entry) {
            foreach ($entry['attributes'] as $key => $value) {
                $lowKey = strtolower($key);
                $lowVal = strtolower($value);
                foreach ($hdrKeywords as $kw) {
                    if (str_contains($lowKey, $kw) ||
                        str_contains($lowVal, $kw)) {
                        $hints[$kw] = true;
                    }
                }
            }
        }

        return $hints;
    }

    /**
     * Extrae pistas de transporte del ADN (protocolo, segmentación).
     */
    private function extractTransportHints(array $tags, array $extinfEntries): array
    {
        $hints = [];

        foreach ($tags as $tag) {
            if (str_starts_with($tag, '#EXT-X-TARGETDURATION:')) {
                $hints['segment-duration'] = (int) substr($tag, 22);
            }
            if (str_starts_with($tag, '#EXT-X-VERSION:')) {
                $hints['hls-version'] = (int) substr($tag, 16);
            }
        }

        foreach ($extinfEntries as $entry) {
            if (isset($entry['attributes']['transport'])) {
                $hints['transport'] = strtolower($entry['attributes']['transport']);
            }
            if (isset($entry['attributes']['protocol'])) {
                $hints['transport'] = strtolower($entry['attributes']['protocol']);
            }
        }

        return $hints;
    }

    /**
     * Extrae cadenas de fallback (URLs de backup) del ADN.
     */
    private function extractFallbackChains(array $tags): array
    {
        $chains = [];

        foreach ($tags as $tag) {
            $lower = strtolower($tag);
            if (str_starts_with($tag, '#EXTVLCOPT:program=')
                || str_contains($lower, 'fallback')
                || str_contains($lower, 'backup')) {
                $chains[] = $tag;
            }
        }

        return $chains;
    }

    /**
     * Construye una firma MD5 única de la lista basada en URLs de stream.
     */
    private function buildStreamSignature(array $dna): string
    {
        $urls = $dna['streams'];
        sort($urls);
        return md5(implode('|', $urls) . '|' . count($urls));
    }

    /**
     * Detecta si una capacidad específica está presente en el ADN.
     * Busca en títulos de entradas y group titles.
     */
    private function detectCapabilityInDna(array $dna, string $pattern): bool
    {
        foreach ($dna['extinf_entries'] as $entry) {
            $text = ($entry['title'] ?? '') . ' ' . implode(' ', $entry['attributes']);
            if (preg_match($pattern, $text)) {
                return true;
            }
        }

        foreach ($dna['group_title_map'] as $group => $count) {
            if (preg_match($pattern, $group)) {
                return true;
            }
        }

        return false;
    }
}
