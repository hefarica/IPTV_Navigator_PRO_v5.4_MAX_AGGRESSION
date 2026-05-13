<?php
declare(strict_types=1);
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LCEVC Media Validator v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Valida si un segmento de video fMP4 contiene una pista de mejora LCEVC
 * real (embebida en SEI o como pista separada), usando ffprobe.
 *
 * Esto implementa la Fase 2 del plan de integración LCEVC:
 * "Validación de Media → PACKAGED state"
 *
 * REGLA CRÍTICA: No se deben emitir tags LCEVC si este validador
 * no confirma la presencia del enhancement en el media.
 *
 * AUTOR: Manus AI
 * VERSIÓN: 1.0.0
 * FECHA: 2026-03-15
 * ═══════════════════════════════════════════════════════════════════════════
 */

class LcevcMediaValidator
{
    // ─────────────────────────────────────────────────────────────────────
    // CONFIGURACIÓN
    // ─────────────────────────────────────────────────────────────────────
    private string $ffprobeBin;
    private int    $probeTimeout;
    private string $cacheDir;
    private int    $cacheTtl;

    public function __construct(
        string $ffprobeBin   = 'ffprobe',
        int    $probeTimeout = 10,
        string $cacheDir     = '/tmp/lcevc_validation_cache',
        int    $cacheTtl     = 300
    ) {
        $this->ffprobeBin   = $ffprobeBin;
        $this->probeTimeout = $probeTimeout;
        $this->cacheDir     = $cacheDir;
        $this->cacheTtl     = $cacheTtl;

        if (!is_dir($this->cacheDir)) {
            @mkdir($this->cacheDir, 0755, true);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // MÉTODO PRINCIPAL
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Valida si un archivo de media contiene una pista LCEVC.
     *
     * @param string $mediaPath Ruta local o URL al segmento fMP4
     * @return array Resultado de la validación con campos:
     *               - lcevc_found (bool)
     *               - lcevc_mode (string|null): 'SEI_METADATA' | 'DUAL_TRACK' | null
     *               - base_codec (string|null)
     *               - streams_count (int)
     *               - error (string|null)
     */
    public function validate(string $mediaPath): array
    {
        $result = [
            'lcevc_found'   => false,
            'lcevc_mode'    => null,
            'base_codec'    => null,
            'streams_count' => 0,
            'error'         => null,
        ];

        // Comprobar caché
        $cacheKey  = md5($mediaPath);
        $cachePath = $this->cacheDir . '/' . $cacheKey . '.json';
        if (file_exists($cachePath) && (time() - filemtime($cachePath)) < $this->cacheTtl) {
            $cached = json_decode(file_get_contents($cachePath), true);
            if (is_array($cached)) {
                return $cached;
            }
        }

        // Verificar que ffprobe está disponible
        if (!$this->isFfprobeAvailable()) {
            $result['error'] = 'ffprobe not available';
            return $result;
        }

        // Ejecutar ffprobe
        $probeData = $this->runFfprobe($mediaPath);
        if ($probeData === null) {
            $result['error'] = 'ffprobe execution failed or timed out';
            return $result;
        }

        // Analizar los streams
        $result = $this->analyzeStreams($probeData, $result);

        // Guardar en caché
        file_put_contents($cachePath, json_encode($result));

        return $result;
    }

    // ─────────────────────────────────────────────────────────────────────
    // MÉTODOS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Verifica si ffprobe está disponible en el sistema.
     */
    private function isFfprobeAvailable(): bool
    {
        $output = shell_exec(escapeshellcmd($this->ffprobeBin) . ' -version 2>&1');
        return $output !== null && strpos($output, 'ffprobe') !== false;
    }

    /**
     * Ejecuta ffprobe sobre el archivo de media y retorna el JSON de streams.
     *
     * @param string $mediaPath
     * @return array|null
     */
    private function runFfprobe(string $mediaPath): ?array
    {
        $cmd = sprintf(
            'timeout %d %s -v quiet -print_format json -show_streams %s 2>&1',
            $this->probeTimeout,
            escapeshellcmd($this->ffprobeBin),
            escapeshellarg($mediaPath)
        );

        $output = shell_exec($cmd);
        if (empty($output)) {
            return null;
        }

        $data = json_decode($output, true);
        if (!is_array($data) || !isset($data['streams'])) {
            return null;
        }

        return $data;
    }

    /**
     * Analiza los streams del resultado de ffprobe para detectar LCEVC.
     *
     * @param array $probeData Datos de ffprobe
     * @param array $result    Resultado base a rellenar
     * @return array Resultado actualizado
     */
    private function analyzeStreams(array $probeData, array $result): array
    {
        $streams = $probeData['streams'] ?? [];
        $result['streams_count'] = count($streams);

        $videoStreams = [];
        $lcevcStreams = [];

        foreach ($streams as $stream) {
            $codecName = strtolower($stream['codec_name'] ?? '');
            $codecType = strtolower($stream['codec_type'] ?? '');

            if ($codecType === 'video') {
                // Detectar pista LCEVC explícita (DUAL_TRACK mode)
                // El codec LCEVC aparece como 'lcevc' o 'lvc1' en ffprobe
                if (in_array($codecName, ['lcevc', 'lvc1', 'lcevc_h264', 'lcevc_hevc'], true)) {
                    $lcevcStreams[] = $stream;
                } else {
                    $videoStreams[] = $stream;
                }
            }
        }

        // Caso 1: Pista LCEVC separada encontrada (DUAL_TRACK)
        if (!empty($lcevcStreams)) {
            $result['lcevc_found'] = true;
            $result['lcevc_mode']  = 'DUAL_TRACK';
            if (!empty($videoStreams)) {
                $result['base_codec'] = strtoupper($videoStreams[0]['codec_name'] ?? 'H264');
            }
            return $result;
        }

        // Caso 2: Buscar LCEVC embebido en SEI de un stream H.264/HEVC
        // La presencia de SEI LCEVC se puede detectar por tags o side_data
        foreach ($videoStreams as $stream) {
            $sideData = $stream['side_data_list'] ?? [];
            foreach ($sideData as $sd) {
                $sdType = strtolower($sd['side_data_type'] ?? '');
                if (strpos($sdType, 'lcevc') !== false) {
                    $result['lcevc_found'] = true;
                    $result['lcevc_mode']  = 'SEI_METADATA';
                    $result['base_codec']  = strtoupper($stream['codec_name'] ?? 'H264');
                    return $result;
                }
            }

            // Verificar tags del stream
            $tags = $stream['tags'] ?? [];
            foreach ($tags as $key => $value) {
                if (stripos((string)$key, 'lcevc') !== false ||
                    stripos((string)$value, 'lcevc') !== false) {
                    $result['lcevc_found'] = true;
                    $result['lcevc_mode']  = 'SEI_METADATA';
                    $result['base_codec']  = strtoupper($stream['codec_name'] ?? 'H264');
                    return $result;
                }
            }
        }

        // No se encontró LCEVC → base_codec del primer stream de video
        if (!empty($videoStreams)) {
            $result['base_codec'] = strtoupper($videoStreams[0]['codec_name'] ?? 'H264');
        }

        return $result;
    }
}
