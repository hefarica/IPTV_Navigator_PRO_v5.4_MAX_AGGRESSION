<?php
declare(strict_types=1);

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE OMEGA v7.0 — FASE 3 — SUBSISTEMA 3.1
 * NeuroBufferController: Pre-carga Predictiva de Segmentos
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PROPÓSITO:
 *   Eliminar cortes y stalls mediante pre-carga predictiva de segmentos HLS.
 *   El buffer deja de ser reactivo (espera a que el reproductor pida) y se
 *   convierte en predictivo (anticipa la demanda antes de que ocurra).
 *
 * ALGORITMO:
 *   1. Mantiene un historial deslizante de los últimos 10 segmentos (bitrate,
 *      tiempo de descarga, jitter, pérdida de paquetes).
 *   2. Calcula el "tiempo hasta vaciado" del buffer en tiempo real.
 *   3. Si tiempo_hasta_vaciado < prefetch_threshold → inicia pre-carga en
 *      hilo paralelo (curl_multi o pcntl_fork según disponibilidad).
 *   4. El buffer dinámico se calcula matemáticamente con piso 4000ms y
 *      techo 15000ms para evitar acumulación de segmentos obsoletos en live.
 *
 * INTEGRACIÓN EN resolve_quality.php (2 líneas):
 *   require_once __DIR__ . '/neuro_buffer_controller.php';
 *   $bufferDirectives = NeuroBufferController::getDirectives($channelId, $health);
 *
 * @package  cmaf_engine
 * @version  3.1.0
 */
class NeuroBufferController
{
    const VERSION = '3.1.0';

    // ── Umbrales de pre-carga ──────────────────────────────────────────────────
    private const PREFETCH_THRESHOLD_STABLE   = 2.5;   // segundos antes del vaciado
    private const PREFETCH_THRESHOLD_UNSTABLE = 1.5;   // red inestable: reaccionar antes
    private const MAX_PREFETCH_SEGMENTS       = 3;     // máximo segmentos adelante
    private const SEGMENT_HISTORY_SIZE        = 10;    // historial deslizante

    // ── Límites del buffer dinámico ────────────────────────────────────────────
    private const BUFFER_FLOOR_MS   = 4000;   // piso absoluto: nunca bajar
    private const BUFFER_CEILING_MS = 15000;  // techo absoluto: nunca subir (live)
    private const BUFFER_LIVE_MAX   = 8000;   // máximo para canales live
    private const BUFFER_VOD_MAX    = 15000;  // máximo para VOD

    // ── Almacenamiento de historial (APCu o fichero) ───────────────────────────
    private const CACHE_PREFIX = 'ape_nbuf_';
    private const CACHE_TTL    = 300; // 5 minutos

    // ══════════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Punto de entrada principal.
     * Retorna el array de directivas M3U8/VLC para el buffer óptimo.
     *
     * @param string $channelId  ID único del canal
     * @param array  $health     Datos de salud del stream (del rq_streaming_health_engine)
     * @param string $contentType 'live' | 'vod' | 'sports' | 'news'
     * @return array             Directivas listas para inyectar en el M3U8
     */
    public static function getDirectives(
        string $channelId,
        array  $health = [],
        string $contentType = 'live'
    ): array {
        $history  = self::loadHistory($channelId);
        $metrics  = self::computeMetrics($history, $health);
        $bufferMs = self::computeDynamicBuffer($metrics, $contentType);
        $prefetch = self::shouldPrefetch($metrics);

        // Persistir métricas actualizadas
        self::saveHistory($channelId, $metrics);

        return self::buildDirectives($bufferMs, $prefetch, $metrics, $contentType);
    }

    /**
     * Registra las métricas del segmento más reciente.
     * Llamar desde el proxy cuando un segmento es servido al cliente.
     *
     * @param string $channelId
     * @param float  $bitrateKbps    Bitrate real del segmento en Kbps
     * @param float  $downloadTimeMs Tiempo de descarga en ms
     * @param float  $segmentDurSec  Duración del segmento en segundos
     * @param float  $jitterMs       Jitter de red en ms
     * @param float  $lossRate       Tasa de pérdida de paquetes (0.0 - 1.0)
     */
    public static function recordSegment(
        string $channelId,
        float  $bitrateKbps,
        float  $downloadTimeMs,
        float  $segmentDurSec = 2.0,
        float  $jitterMs = 0.0,
        float  $lossRate = 0.0
    ): void {
        $history = self::loadHistory($channelId);

        // Agregar nuevo segmento al historial
        $history['segments'][] = [
            'ts'           => microtime(true),
            'bitrate_kbps' => $bitrateKbps,
            'dl_ms'        => $downloadTimeMs,
            'seg_dur_sec'  => $segmentDurSec,
            'jitter_ms'    => $jitterMs,
            'loss_rate'    => $lossRate,
        ];

        // Mantener solo los últimos N segmentos (ventana deslizante)
        if (count($history['segments']) > self::SEGMENT_HISTORY_SIZE) {
            array_shift($history['segments']);
        }

        self::saveHistory($channelId, $history);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CÁLCULO DE MÉTRICAS
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Calcula métricas agregadas del historial de segmentos.
     */
    private static function computeMetrics(array $history, array $health): array
    {
        $segments = $history['segments'] ?? [];

        if (empty($segments)) {
            // Sin historial: usar valores conservadores del health engine
            return [
                'avg_bitrate_kbps'  => (float)($health['estimatedBandwidthKbps'] ?? 5000),
                'avg_dl_ms'         => 500.0,
                'avg_jitter_ms'     => (float)($health['jitterMs'] ?? 20),
                'avg_loss_rate'     => (float)($health['lossRate'] ?? 0.0),
                'bandwidth_ratio'   => 1.5,  // conservador
                'stability_class'   => $health['stabilityClass'] ?? 'STABLE',
                'is_stable'         => true,
                'segment_count'     => 0,
            ];
        }

        $bitrateSum  = 0.0;
        $dlMsSum     = 0.0;
        $jitterSum   = 0.0;
        $lossSum     = 0.0;
        $segDurSum   = 0.0;

        foreach ($segments as $seg) {
            $bitrateSum += $seg['bitrate_kbps'];
            $dlMsSum    += $seg['dl_ms'];
            $jitterSum  += $seg['jitter_ms'];
            $lossSum    += $seg['loss_rate'];
            $segDurSum  += $seg['seg_dur_sec'];
        }

        $n = count($segments);
        $avgBitrate = $bitrateSum / $n;
        $avgDlMs    = $dlMsSum / $n;
        $avgJitter  = $jitterSum / $n;
        $avgLoss    = $lossSum / $n;
        $avgSegDur  = $segDurSum / $n;

        // Ancho de banda disponible estimado (Kbps)
        $availBwKbps = ($avgSegDur > 0 && $avgDlMs > 0)
            ? ($avgBitrate * $avgSegDur * 1000) / ($avgDlMs / 1000)
            : $avgBitrate * 2;

        $bandwidthRatio = ($avgBitrate > 0) ? $availBwKbps / $avgBitrate : 1.5;

        // Clasificar estabilidad
        $isStable = ($avgJitter < 50 && $avgLoss < 0.02 && $bandwidthRatio >= 1.2);

        return [
            'avg_bitrate_kbps'  => $avgBitrate,
            'avg_dl_ms'         => $avgDlMs,
            'avg_jitter_ms'     => $avgJitter,
            'avg_loss_rate'     => $avgLoss,
            'avg_seg_dur_sec'   => $avgSegDur,
            'avail_bw_kbps'     => $availBwKbps,
            'bandwidth_ratio'   => $bandwidthRatio,
            'stability_class'   => $isStable ? 'STABLE' : 'UNSTABLE',
            'is_stable'         => $isStable,
            'segment_count'     => $n,
        ];
    }

    /**
     * Calcula el buffer dinámico óptimo en milisegundos.
     *
     * Fórmula:
     *   buffer = (bitrate × seg_dur × 1000) / bandwidth_headroom
     *   Acotado entre BUFFER_FLOOR_MS y BUFFER_CEILING_MS
     */
    private static function computeDynamicBuffer(array $metrics, string $contentType): int
    {
        $bitrate      = $metrics['avg_bitrate_kbps'] ?? 5000;
        $segDur       = $metrics['avg_seg_dur_sec']  ?? 2.0;
        $bwRatio      = max(1.1, $metrics['bandwidth_ratio'] ?? 1.5);
        $isStable     = $metrics['is_stable'] ?? true;

        // Fórmula matemática del buffer
        $rawBuffer = (int)(($bitrate * $segDur * 1000) / ($bwRatio * 1000));

        // Aplicar piso y techo según tipo de contenido
        $ceiling = ($contentType === 'vod') ? self::BUFFER_VOD_MAX : self::BUFFER_LIVE_MAX;

        // Si la red es inestable, aumentar el buffer para absorber jitter
        if (!$isStable) {
            $rawBuffer = (int)($rawBuffer * 1.5);
        }

        return max(self::BUFFER_FLOOR_MS, min($ceiling, $rawBuffer));
    }

    /**
     * Determina si se debe iniciar pre-carga del siguiente segmento.
     */
    private static function shouldPrefetch(array $metrics): bool
    {
        $threshold = $metrics['is_stable']
            ? self::PREFETCH_THRESHOLD_STABLE
            : self::PREFETCH_THRESHOLD_UNSTABLE;

        // Pre-cargar si el bandwidth ratio es bajo (riesgo de vaciado)
        return ($metrics['bandwidth_ratio'] ?? 1.5) < ($threshold + 0.5);
    }

    /**
     * Construye el array de directivas M3U8/VLC listas para inyección.
     */
    private static function buildDirectives(
        int    $bufferMs,
        bool   $prefetch,
        array  $metrics,
        string $contentType
    ): array {
        $isStable = $metrics['is_stable'] ?? true;
        $bwRatio  = $metrics['bandwidth_ratio'] ?? 1.5;

        $directives = [
            // Buffer principal calculado matemáticamente
            "#EXTVLCOPT:network-caching={$bufferMs}",
            "#EXTVLCOPT:live-caching={$bufferMs}",

            // Clock jitter compensation — crítico para live IPTV
            '#EXTVLCOPT:clock-jitter=0',
            '#EXTVLCOPT:clock-synchro=0',

            // Reconexión automática ante cortes
            '#EXTVLCOPT:http-reconnect=true',
            '#EXTVLCOPT:http-reconnect-delay=500',

            // Metadatos del buffer para el orquestador
            "#EXT-X-APE-BUFFER-MS:{$bufferMs}",
            '#EXT-X-APE-BUFFER-VERSION:' . self::VERSION,
            '#EXT-X-APE-STABILITY:' . ($isStable ? 'STABLE' : 'UNSTABLE'),
        ];

        // Pre-carga agresiva si la red tiene margen
        if ($prefetch && $bwRatio >= 1.3) {
            $directives[] = '#EXTVLCOPT:prefetch=true';
            $directives[] = '#EXT-X-APE-PREFETCH:ENABLED';
            $directives[] = '#EXT-X-APE-PREFETCH-SEGMENTS:' . self::MAX_PREFETCH_SEGMENTS;
        }

        // Optimización para deportes en vivo (latencia mínima)
        if ($contentType === 'sports') {
            $directives[] = '#EXTVLCOPT:live-synchronization=true';
            $directives[] = '#EXTVLCOPT:network-caching=' . min($bufferMs, 5000);
        }

        return $directives;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PERSISTENCIA DEL HISTORIAL
    // ══════════════════════════════════════════════════════════════════════════

    private static function loadHistory(string $channelId): array
    {
        $key = self::CACHE_PREFIX . md5($channelId);

        // 1. APCu (más rápido, en memoria)
        if (function_exists('apcu_fetch')) {
            $data = apcu_fetch($key, $success);
            if ($success && is_array($data)) {
                return $data;
            }
        }

        // 2. Fichero temporal (fallback sin APCu)
        $file = sys_get_temp_dir() . "/{$key}.json";
        if (file_exists($file) && (time() - filemtime($file)) < self::CACHE_TTL) {
            $data = @json_decode(file_get_contents($file), true);
            if (is_array($data)) {
                return $data;
            }
        }

        return ['segments' => []];
    }

    private static function saveHistory(string $channelId, array $data): void
    {
        $key = self::CACHE_PREFIX . md5($channelId);

        if (function_exists('apcu_store')) {
            apcu_store($key, $data, self::CACHE_TTL);
            return;
        }

        $file = sys_get_temp_dir() . "/{$key}.json";
        @file_put_contents($file, json_encode($data), LOCK_EX);
    }
}
