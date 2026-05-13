<?php
declare(strict_types=1);

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE OMEGA v7.0 — FASE 3 — ORQUESTADOR UNIFICADO
 * VisualSupremacyOrchestrator: Punto de Entrada Único para los 4 Subsistemas
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PROPÓSITO:
 *   Orquestar los 4 subsistemas de la Fase 3 en una sola llamada, garantizando
 *   que las directivas no se contradigan entre sí y que el orden de inyección
 *   en el M3U8 sea el correcto.
 *
 * ORDEN DE ORQUESTACIÓN:
 *   1. GracefulDegradationEngine → determina el nivel (L1-L7)
 *   2. NeuroBufferController     → calcula el buffer dinámico para ese nivel
 *   3. LcevcPhase4Injector       → inyecta LCEVC si el nivel lo permite (L1-L2)
 *   4. Hdr10PlusDynamicEngine    → inyecta HDR si el nivel lo permite (L1-L3)
 *   5. Merge y deduplicación     → elimina directivas contradictorias
 *   6. Retorno del array final   → listo para inyectar en el M3U8
 *
 * INTEGRACIÓN EN resolve_quality.php (4 líneas):
 *   require_once __DIR__ . '/visual_supremacy_orchestrator.php';
 *   $result = VisualSupremacyOrchestrator::process($channelId, $health, $streamInfo, $contentType);
 *   foreach ($result['directives'] as $directive) {
 *       echo $directive . "\n";
 *   }
 *
 * @package  cmaf_engine
 * @version  7.0.0
 */

// Cargar los 4 subsistemas
require_once __DIR__ . '/neuro_buffer_controller.php';
require_once __DIR__ . '/lcevc_phase4_injector.php';
require_once __DIR__ . '/hdr10plus_dynamic_engine.php';
require_once __DIR__ . '/graceful_degradation_engine.php';

class VisualSupremacyOrchestrator
{
    const VERSION = '7.0.0';

    // Directivas que nunca deben aparecer en el output final
    // (causantes de 407, microcortes o halos)
    private const BANNED_DIRECTIVES = [
        'QOS-DSCP-OVERRIDE',
        'QOS-CLASS',
        'DSCP',
        'AF41',
        'minterpolate',
        'deinterlace-mode=bwdif',   // duplicado — solo va dentro de video-filter
        'chroma_strength=-0.5',     // causa halos de color
        'luma_amount=0.5',          // supera umbral seguro
        'network-caching=30000',    // flood TCP → 407
        'live-caching=30000',       // flood TCP → 407
        'TCP-WINDOW-SPAM',
        'CONCURRENCY-SURGE',
        'Proxy-Authorization',
    ];

    // ══════════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Punto de entrada principal. Orquesta los 4 subsistemas y retorna
     * el resultado unificado listo para inyectar en el M3U8.
     *
     * @param string $channelId   ID único del canal
     * @param array  $health      Datos de salud del stream (del rq_streaming_health_engine)
     * @param array  $streamInfo  Info del stream: width, height, codec, hdr_type, backup_url
     * @param string $contentType 'sports' | 'cinema' | 'news' | 'default'
     * @return array {
     *   'level'       => int,     // Nivel de degradación activo (1-7)
     *   'label'       => string,  // Etiqueta del nivel (GOD_TIER, EXCELLENT, etc.)
     *   'directives'  => array,   // Directivas M3U8 listas para inyección
     *   'buffer_ms'   => int,     // Buffer calculado en ms
     *   'lcevc'       => bool,    // Si LCEVC está activo
     *   'hdr_dynamic' => bool,    // Si HDR10+ dinámico está activo
     *   'version'     => string,  // Versión del orquestador
     * }
     */
    public static function process(
        string $channelId   = 'unknown',
        array  $health      = [],
        array  $streamInfo  = [],
        string $contentType = 'default'
    ): array {
        $startTime = microtime(true);

        // ── PASO 1: Determinar nivel de degradación ────────────────────────────
        $degradation = GracefulDegradationEngine::evaluate($health, $streamInfo, $contentType);
        $level       = $degradation['level'];

        // ── PASO 2: Calcular buffer dinámico para este nivel ───────────────────
        $bufferDirectives = NeuroBufferController::getDirectives($channelId, $health, $contentType);
        $bufferMs         = self::extractBufferMs($bufferDirectives);

        // ── PASO 3: LCEVC solo en niveles 1-2 ─────────────────────────────────
        $lcevcDirectives = [];
        if ($level <= 2) {
            $lcevcDirectives = LcevcPhase4Injector::getDirectives($streamInfo, $health, $contentType);
        }

        // ── PASO 4: HDR solo en niveles 1-3 ───────────────────────────────────
        $hdrDirectives = [];
        if ($level <= 3) {
            $hdrDirectives = Hdr10PlusDynamicEngine::getDirectives($streamInfo, $health, $contentType);
        }

        // ── PASO 5: Merge con prioridad y deduplicación ────────────────────────
        // Prioridad: degradación > buffer > LCEVC > HDR
        // (degradación tiene la cadena de filtros definitiva para el nivel)
        $merged = self::mergeDirectives(
            $degradation['directives'],
            $bufferDirectives,
            $lcevcDirectives,
            $hdrDirectives
        );

        // ── PASO 6: Filtrar directivas prohibidas ──────────────────────────────
        $clean = self::filterBanned($merged);

        // ── PASO 7: Agregar cabecera de versión ────────────────────────────────
        $processingMs = round((microtime(true) - $startTime) * 1000, 2);
        $clean[] = "#EXT-X-APE-ORCHESTRATOR:" . self::VERSION;
        $clean[] = "#EXT-X-APE-PROCESSING-MS:{$processingMs}";

        return [
            'level'        => $level,
            'label'        => $degradation['label'],
            'description'  => $degradation['description'],
            'directives'   => $clean,
            'buffer_ms'    => $bufferMs,
            'lcevc'        => $degradation['lcevc'],
            'hdr_dynamic'  => $degradation['hdr_dynamic'],
            'processing_ms'=> $processingMs,
            'version'      => self::VERSION,
        ];
    }

    /**
     * Registra las métricas del segmento más reciente en el NeuroBuffer.
     * Llamar desde el proxy cuando un segmento es servido al cliente.
     */
    public static function recordSegment(
        string $channelId,
        float  $bitrateKbps,
        float  $downloadTimeMs,
        float  $segmentDurSec = 2.0,
        float  $jitterMs = 0.0,
        float  $lossRate = 0.0
    ): void {
        NeuroBufferController::recordSegment(
            $channelId,
            $bitrateKbps,
            $downloadTimeMs,
            $segmentDurSec,
            $jitterMs,
            $lossRate
        );
    }

    /**
     * Retorna solo el nivel de degradación actual sin calcular directivas.
     * Útil para logging y telemetría rápida.
     */
    public static function getLevel(array $health): int
    {
        return GracefulDegradationEngine::computeLevel($health);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MERGE Y DEDUPLICACIÓN
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Fusiona los arrays de directivas con prioridad.
     * Si dos directivas tienen el mismo prefijo (ej. #EXTVLCOPT:network-caching),
     * gana la primera (mayor prioridad).
     */
    private static function mergeDirectives(array ...$arrays): array
    {
        $seen   = [];  // prefijo → índice en $result
        $result = [];

        foreach ($arrays as $directives) {
            foreach ($directives as $directive) {
                // Extraer el prefijo de la directiva para detectar duplicados
                // Ej: "#EXTVLCOPT:network-caching=8000" → "#EXTVLCOPT:network-caching"
                $prefix = self::extractPrefix($directive);

                if (!isset($seen[$prefix])) {
                    $seen[$prefix]  = count($result);
                    $result[]       = $directive;
                }
                // Si ya existe, la primera tiene prioridad → ignorar la nueva
            }
        }

        return $result;
    }

    /**
     * Extrae el prefijo de una directiva para detección de duplicados.
     */
    private static function extractPrefix(string $directive): string
    {
        // Para #EXTVLCOPT:key=value → prefijo es "#EXTVLCOPT:key"
        if (str_starts_with($directive, '#EXTVLCOPT:') || str_starts_with($directive, '#KODIPROP:')) {
            $withoutHash = substr($directive, 1);
            $eqPos = strpos($withoutHash, '=');
            return $eqPos !== false ? '#' . substr($withoutHash, 0, $eqPos) : $directive;
        }

        // Para #EXT-X-APE-KEY:value → prefijo es "#EXT-X-APE-KEY"
        $colonPos = strpos($directive, ':');
        return $colonPos !== false ? substr($directive, 0, $colonPos) : $directive;
    }

    /**
     * Elimina directivas que contienen palabras prohibidas.
     */
    private static function filterBanned(array $directives): array
    {
        return array_values(array_filter(
            $directives,
            function (string $d): bool {
                foreach (self::BANNED_DIRECTIVES as $banned) {
                    if (str_contains($d, $banned)) {
                        return false;
                    }
                }
                return true;
            }
        ));
    }

    /**
     * Extrae el valor numérico del buffer de las directivas del NeuroBuffer.
     */
    private static function extractBufferMs(array $directives): int
    {
        foreach ($directives as $d) {
            if (str_starts_with($d, '#EXT-X-APE-BUFFER-MS:')) {
                return (int)substr($d, strlen('#EXT-X-APE-BUFFER-MS:'));
            }
        }
        return 8000; // valor por defecto seguro
    }
}
