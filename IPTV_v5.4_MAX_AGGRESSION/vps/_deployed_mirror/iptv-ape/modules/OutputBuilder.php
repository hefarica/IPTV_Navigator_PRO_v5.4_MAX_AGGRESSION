<?php
declare(strict_types=1);

/**
 * MÓDULO 10: OutputBuilder — Constructor de Salida M3U
 * ======================================================
 * Ensambla el texto M3U/M3U8 final respetando el formato original
 * y fusionando directivas existentes con las inyectadas.
 *
 * Reglas de construcción:
 * - Siempre incluir #EXTM3U si estaba en el original
 * - Preservar TODOS los atributos EXTINF originales (nunca eliminar)
 * - Solo AGREGAR atributos desde normalized_directives (nunca duplicar)
 * - Fusionar directivas existentes con inyectadas sin duplicados
 * - Respetar el orden: EXTINF → directivas → URL
 * - La salida debe ser byte-identica para misma entrada (idempotente)
 *
 * @package ResolveQuality v2.5 ULTRA
 * @module  OutputBuilder
 */

class OutputBuilder
{
    /**
     * Construye el texto M3U final a partir del estado del pipeline.
     *
     * @param  array  $state Estado completo del pipeline procesado
     * @return string Texto M3U/M3U8 listo para servir al reproductor
     */
    public function build(array $state): string
    {
        $dna = $state['manifest_dna'];
        $injected = $state['injected_directives'];
        $normalized = $state['normalized_directives'];
        $playerType = $state['capability_matrix']['player']['type'] ?? 'generic';

        // Si no hay ADN o streams, devolver entrada original o mínimo
        if (empty($dna['raw_lines'])) {
            return "#EXTM3U\n";
        }

        // Detectar si la lista original tenía #EXTM3U
        $hasExtM3U = false;
        foreach ($dna['raw_lines'] as $line) {
            if (trim($line) === '#EXTM3U') {
                $hasExtM3U = true;
                break;
            }
        }

        $output = [];
        $extinfEntries = $dna['extinf_entries'];
        $rawLines = $dna['raw_lines'];

        // Construir mapa de directivas existentes por índice de línea EXTINF
        $existingDirectivesMap = $this->buildExistingDirectivesMap(
            rawLines: $rawLines,
            extinfEntries: $extinfEntries
        );

        // Agregar cabeceras EXTHTTP globales si aplica
        if (!empty($injected['global_headers'])) {
            foreach ($injected['global_headers'] as $key => $value) {
                $output[] = "#EXTHTTP:{$key}={$value}";
            }
        }

        // Si no hay #EXTM3U, agregarlo al inicio
        if (!$hasExtM3U) {
            array_unshift(array: $output, value: '#EXTM3U');
        }

        $entryIndex = 0;

        // Iterar sobre las líneas crudas para reconstruir en orden original
        $i = 0;
        while ($i < count($rawLines)) {
            $line = $rawLines[$i];

            // Línea #EXTM3U: preservar solo si estaba en el original
            if (trim($line) === '#EXTM3U') {
                if ($hasExtM3U) {
                    $output[] = '#EXTM3U';
                }
                $i++;
                continue;
            }

            // Línea EXTINF: reconstruirla con directivas fusionadas
            if (str_starts_with(haystack: $line, needle: '#EXTINF:')) {
                $entry = $extinfEntries[$entryIndex] ?? null;

                if ($entry !== null) {
                    // Reconstruir línea EXTINF preservando todos los atributos originales
                    $extinfLine = $this->buildExtInf(
                        entry: $entry,
                        overrides: $normalized['extinf_overrides'] ?? []
                    );
                    $output[] = $extinfLine;

                    // Obtener directivas existentes para esta entrada
                    $existingForEntry = $existingDirectivesMap[$entry['line_index']] ?? [];

                    // Filtrar según lo que el reproductor soporta
                    $filteredExisting = $this->filterDirectivesForPlayer(
                        directives: $existingForEntry,
                        playerType: $playerType
                    );

                    // Fusionar: primero existentes, luego inyectadas (sin duplicar)
                    $mergedDirectives = $this->mergeDirectives(
                        existing: $filteredExisting,
                        injected: $injected['before_stream']
                    );

                    foreach ($mergedDirectives as $directive) {
                        $output[] = $directive;
                    }

                    $entryIndex++;
                } else {
                    // Si no hay entrada parseada, preservar la línea original
                    $output[] = $line;
                    $entryIndex++;
                }

                $i++;
                continue;
            }

            // Saltar directivas ya procesadas en la fusión
            if ($this->isProcessedDirective(line: $line, existingMap: $existingDirectivesMap, currentLineIndex: $i)) {
                $i++;
                continue;
            }

            // Otros tags (#EXTM3U ya manejado, #EXT-X-*, etc.): preservar
            if (str_starts_with(haystack: $line, needle: '#')) {
                $output[] = $line;
                $i++;
                continue;
            }

            // URL de stream: preservar intacta
            $output[] = $line;
            $i++;
        }

        return implode(separator: "\n", array: $output) . "\n";
    }

    /**
     * Reconstruye una línea #EXTINF preservando todos los atributos originales.
     *
     * Formato: #EXTINF:duration [key="value" ...],Title
     *
     * @param  array $entry    Entrada EXTINF parseada
     * @param  array $overrides Atributos adicionales a agregar (solo si no existen)
     * @return string Línea EXTINF completa
     */
    private function buildExtInf(array $entry, array $overrides): string
    {
        $parts = ['#EXTINF:'];

        // Duración (se preserva exacta)
        $parts[] = $entry['duration'];

        // Atributos originales en orden (mantener orden del ADN original)
        foreach ($entry['attributes'] as $key => $value) {
            if (!isset($overrides[$key])) {
                $parts[] = "{$key}=\"{$value}\"";
            }
        }

        // Agregar overrides que no existían en los atributos originales
        foreach ($overrides as $key => $value) {
            if (!isset($entry['attributes'][$key])) {
                $parts[] = "{$key}=\"{$value}\"";
            }
        }

        // Título (se preserva exacto)
        $parts[] = ',' . $entry['title'];

        return implode(separator: ' ', array: $parts);
    }

    /**
     * Construye un mapa de directivas existentes por índice de línea EXTINF.
     *
     * Escanea las líneas después de cada EXTINF buscando directivas conocidas
     * (EXTVLCOPT, KODIPROP, EXTHTTP) hasta encontrar otra EXTINF o una URL.
     *
     * @param  array $rawLines      Líneas crudas del manifiesto
     * @param  array $extinfEntries Entradas EXTINF parseadas
     * @return array<int, array<string>> Mapa: índice_línea → array de directivas
     */
    private function buildExistingDirectivesMap(array $rawLines, array $extinfEntries): array
    {
        $map = [];
        $directivePrefixes = ['#EXTVLCOPT:', '#KODIPROP:', '#EXTHTTP:'];

        foreach ($extinfEntries as $entry) {
            $lineIndex = $entry['line_index'];
            $directives = [];

            // Escanear líneas después de esta EXTINF
            for ($j = $lineIndex + 1; $j < count($rawLines); $j++) {
                $line = $rawLines[$j];

                // Parar si encontramos otra EXTINF o una URL (no-#)
                if (str_starts_with(haystack: $line, needle: '#EXTINF:') || !str_starts_with(haystack: $line, needle: '#')) {
                    break;
                }

                // Registrar si es una directiva conocida
                foreach ($directivePrefixes as $prefix) {
                    if (str_starts_with(haystack: $line, needle: $prefix)) {
                        $directives[] = $line;
                        break;
                    }
                }
            }

            $map[$lineIndex] = $directives;
        }

        return $map;
    }

    /**
     * Filtra directivas existentes según el tipo de reproductor.
     *
     * Solo se conservan las directivas que el reproductor puede procesar.
     * Las directivas no soportadas se eliminan para evitar errores.
     *
     * @param  array  $directives Directivas existentes
     * @param  string $playerType Tipo de reproductor
     * @return array  Directivas filtradas
     */
    private function filterDirectivesForPlayer(array $directives, string $playerType): array
    {
        $supported = match ($playerType) {
            PlayerType::VLC->value      => ['EXTVLCOPT', 'EXTHTTP'],
            PlayerType::KODI->value     => ['KODIPROP', 'EXTHTTP'],
            PlayerType::OTT->value      => ['EXTHTTP'],
            PlayerType::EXO->value      => ['EXTHTTP'],
            PlayerType::TIVIMATE->value => ['EXTVLCOPT', 'EXTHTTP'],
            PlayerType::SMART_TV->value => [],
            default                     => [],
        };

        if (empty($supported)) {
            return [];
        }

        return array_values(array_filter(
            array: $directives,
            callback: static function (string $d) use ($supported): bool {
                foreach ($supported as $prefix) {
                    if (str_starts_with(haystack: $d, needle: '#' . $prefix . ':')) {
                        return true;
                    }
                }
                return false;
            }
        ));
    }

    /**
     * Fusiona directivas existentes con inyectadas sin duplicar por clave.
     *
     * Orden: primero las existentes (preservar orden original),
     * luego las inyectadas (solo claves nuevas).
     *
     * @param  array $existing Directivas existentes de la lista
     * @param  array $injected Directivas calculadas por el pipeline
     * @return array  Directivas fusionadas
     */
    private function mergeDirectives(array $existing, array $injected): array
    {
        $seen = [];
        $merged = [];

        // Primero: directivas existentes (preservar orden)
        foreach ($existing as $directive) {
            $key = strstr(haystack: $directive, needle: '=', before_needle: true) ?: $directive;
            $seen[$key] = true;
            $merged[] = $directive;
        }

        // Segundo: directivas inyectadas (solo nuevas claves)
        foreach ($injected as $directive) {
            $key = strstr(haystack: $directive, needle: '=', before_needle: true) ?: $directive;
            if (!isset($seen[$key])) {
                $seen[$key] = true;
                $merged[] = $directive;
            }
        }

        return $merged;
    }

    /**
     * Verifica si una línea es una directiva ya procesada por el mapa.
     *
     * Se usa para evitar duplicar directivas que ya fueron fusionadas
     * en la sección correspondiente a su EXTINF.
     */
    private function isProcessedDirective(string $line, array $existingMap, int $currentLineIndex): bool
    {
        $directivePrefixes = ['#EXTVLCOPT:', '#KODIPROP:', '#EXTHTTP:'];

        foreach ($directivePrefixes as $prefix) {
            if (str_starts_with(haystack: $line, needle: $prefix)) {
                // Verificar si esta directiva pertenece a alguna entrada anterior
                foreach ($existingMap as $entryIndex => $directives) {
                    if ($currentLineIndex > $entryIndex) {
                        if (in_array($line, $directives, true)) { return true; }
                    }
                }
            }
        }

        return false;
    }
}
