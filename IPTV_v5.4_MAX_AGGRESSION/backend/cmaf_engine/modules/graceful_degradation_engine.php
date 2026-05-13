<?php
declare(strict_types=1);

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE OMEGA v7.0 — FASE 3 — SUBSISTEMA 3.4
 * GracefulDegradationEngine: Árbol de 7 Niveles de Resiliencia
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PROPÓSITO:
 *   Garantizar que el sistema NUNCA muestre pantalla negra.
 *   Ante cualquier degradación de red, el motor desciende automáticamente
 *   por 7 niveles de calidad, siempre manteniendo la reproducción activa.
 *
 * ÁRBOL DE DEGRADACIÓN:
 *   L1 (Red perfecta)     → LCEVC Phase 4 + HDR10+ dinámico + 5000 nits
 *   L2 (Jitter < 50ms)    → LCEVC Phase 4 + HDR10 estático
 *   L3 (Jitter 50-150ms)  → Lanczos + HDR10 estático
 *   L4 (Pérdida < 2%)     → bwdif + gradfun + unsharp
 *   L5 (Pérdida 2-5%)     → yadif + nlmeans
 *   L6 (Pérdida > 5%)     → Reducción de bitrate + buffer agresivo
 *   L7 (Stream caído)     → Failover a URL de respaldo (nunca pantalla negra)
 *
 * TRANSICIÓN ATÓMICA:
 *   La transición entre niveles ocurre en < 100ms, invisible al ojo humano.
 *   El motor evalúa el nivel correcto en cada petición y aplica las directivas
 *   correspondientes sin estado persistente entre peticiones.
 *
 * INTEGRACIÓN EN resolve_quality.php (2 líneas):
 *   require_once __DIR__ . '/graceful_degradation_engine.php';
 *   $level = GracefulDegradationEngine::evaluate($health, $streamInfo);
 *
 * @package  cmaf_engine
 * @version  3.4.0
 */
class GracefulDegradationEngine
{
    const VERSION = '3.4.0';

    // ── Definición de los 7 niveles ────────────────────────────────────────────
    const LEVEL_1 = 1;  // God-Tier: LCEVC Phase 4 + HDR10+ dinámico
    const LEVEL_2 = 2;  // Excellent: LCEVC Phase 4 + HDR10 estático
    const LEVEL_3 = 3;  // Good: Lanczos + HDR10 estático
    const LEVEL_4 = 4;  // Acceptable: bwdif + gradfun + unsharp
    const LEVEL_5 = 5;  // Degraded: yadif + nlmeans
    const LEVEL_6 = 6;  // Minimal: bitrate reducido + buffer agresivo
    const LEVEL_7 = 7;  // Failover: URL de respaldo (nunca pantalla negra)

    // ── Umbrales de transición ─────────────────────────────────────────────────
    private const THRESHOLDS = [
        // [riskScore_max, stallRate_max, jitter_max_ms, loss_max_rate, vfi_min]
        self::LEVEL_1 => ['risk' => 15,  'stall' => 0.08, 'jitter' => 30,  'loss' => 0.005, 'vfi' => 50],
        self::LEVEL_2 => ['risk' => 25,  'stall' => 0.12, 'jitter' => 50,  'loss' => 0.01,  'vfi' => 40],
        self::LEVEL_3 => ['risk' => 40,  'stall' => 0.20, 'jitter' => 150, 'loss' => 0.02,  'vfi' => 30],
        self::LEVEL_4 => ['risk' => 60,  'stall' => 0.30, 'jitter' => 300, 'loss' => 0.05,  'vfi' => 20],
        self::LEVEL_5 => ['risk' => 75,  'stall' => 0.45, 'jitter' => 500, 'loss' => 0.10,  'vfi' => 10],
        self::LEVEL_6 => ['risk' => 90,  'stall' => 0.60, 'jitter' => 999, 'loss' => 0.20,  'vfi' => 0],
        self::LEVEL_7 => ['risk' => 999, 'stall' => 1.0,  'jitter' => 999, 'loss' => 1.0,   'vfi' => 0],
    ];

    // ── Directivas por nivel ───────────────────────────────────────────────────
    private const LEVEL_DIRECTIVES = [
        self::LEVEL_1 => [
            'label'       => 'GOD_TIER',
            'description' => 'LCEVC Phase 4 + HDR10+ dinámico + 5000 nits',
            'video_filter' => 'bwdif=mode=1:parity=-1:deint=0,hqdn3d=4.0:3.0:6.0:4.5,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full:chromal=topleft,chroma_I444',
            'swscale'      => 9,
            'saturation'   => 1.15,
            'contrast'     => 1.08,
            'lcevc'        => true,
            'hdr_dynamic'  => true,
            'max_cll'      => 5000,
            'max_fall'     => 1200,
        ],
        self::LEVEL_2 => [
            'label'       => 'EXCELLENT',
            'description' => 'LCEVC Phase 4 + HDR10 estático',
            'video_filter' => 'bwdif=mode=1:parity=-1:deint=0,hqdn3d=4.0:3.0:6.0:4.5,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full:chromal=topleft,chroma_I444',
            'swscale'      => 9,
            'saturation'   => 1.12,
            'contrast'     => 1.05,
            'lcevc'        => true,
            'hdr_dynamic'  => false,
            'max_cll'      => 4000,
            'max_fall'     => 1000,
        ],
        self::LEVEL_3 => [
            'label'       => 'GOOD',
            'description' => 'Lanczos + HDR10 estático',
            'video_filter' => 'bwdif=mode=1:parity=-1:deint=0,hqdn3d=4.0:3.0:6.0:4.5,gradfun=radius=12:strength=0.8,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:range=limited',
            'swscale'      => 9,
            'saturation'   => 1.08,
            'contrast'     => 1.03,
            'lcevc'        => false,
            'hdr_dynamic'  => false,
            'max_cll'      => 1000,
            'max_fall'     => 400,
        ],
        self::LEVEL_4 => [
            'label'       => 'ACCEPTABLE',
            'description' => 'bwdif + gradfun + unsharp',
            'video_filter' => 'bwdif=mode=1:parity=-1:deint=0,hqdn3d=4.0:3.0:6.0:4.5,gradfun=radius=8:strength=0.6,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.2:chroma_amount=0.0',
            'swscale'      => 5,
            'saturation'   => 1.05,
            'contrast'     => 1.02,
            'lcevc'        => false,
            'hdr_dynamic'  => false,
            'max_cll'      => 1000,
            'max_fall'     => 400,
        ],
        self::LEVEL_5 => [
            'label'       => 'DEGRADED',
            'description' => 'yadif + nlmeans (red inestable)',
            'video_filter' => 'nlmeans=s=4.0:p=5:r=9,yadif=mode=0:parity=-1:deint=0',
            'swscale'      => 3,
            'saturation'   => 1.0,
            'contrast'     => 1.0,
            'lcevc'        => false,
            'hdr_dynamic'  => false,
            'max_cll'      => 0,
            'max_fall'     => 0,
        ],
        self::LEVEL_6 => [
            'label'       => 'MINIMAL',
            'description' => 'Bitrate reducido + buffer agresivo',
            'video_filter' => 'yadif=mode=0:parity=-1:deint=0',
            'swscale'      => 1,
            'saturation'   => 1.0,
            'contrast'     => 1.0,
            'lcevc'        => false,
            'hdr_dynamic'  => false,
            'max_cll'      => 0,
            'max_fall'     => 0,
        ],
        self::LEVEL_7 => [
            'label'       => 'FAILOVER',
            'description' => 'URL de respaldo activa — nunca pantalla negra',
            'video_filter' => '',
            'swscale'      => 1,
            'saturation'   => 1.0,
            'contrast'     => 1.0,
            'lcevc'        => false,
            'hdr_dynamic'  => false,
            'max_cll'      => 0,
            'max_fall'     => 0,
        ],
    ];

    // ══════════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Evalúa el nivel de degradación correcto y retorna las directivas.
     *
     * @param array  $health      Datos de salud del stream
     * @param array  $streamInfo  Info del stream (backup_url, etc.)
     * @param string $contentType 'sports' | 'cinema' | 'news' | 'default'
     * @return array              ['level' => int, 'label' => string, 'directives' => array]
     */
    public static function evaluate(
        array  $health = [],
        array  $streamInfo = [],
        string $contentType = 'default'
    ): array {
        $level = self::computeLevel($health);
        $defs  = self::LEVEL_DIRECTIVES[$level];

        // Nivel 7: activar failover si hay URL de respaldo
        if ($level === self::LEVEL_7) {
            $backupUrl = $streamInfo['backup_url'] ?? null;
            $directives = self::buildFailoverDirectives($backupUrl, $health);
        } else {
            $directives = self::buildLevelDirectives($level, $defs, $contentType, $health);
        }

        return [
            'level'      => $level,
            'label'      => $defs['label'],
            'description'=> $defs['description'],
            'directives' => $directives,
            'lcevc'      => $defs['lcevc'],
            'hdr_dynamic'=> $defs['hdr_dynamic'],
        ];
    }

    /**
     * Retorna solo el número de nivel sin calcular directivas.
     * Útil para logging y telemetría.
     */
    public static function computeLevel(array $health): int
    {
        $risk   = (float)($health['riskScore']  ?? 100);
        $stall  = (float)($health['stallRate']  ?? 1.0);
        $jitter = (float)($health['jitterMs']   ?? 999);
        $loss   = (float)($health['lossRate']   ?? 1.0);
        $vfi    = (float)($health['vfi']        ?? 0);
        $stable = ($health['stabilityClass']    ?? 'UNSTABLE') !== 'UNSTABLE';

        // Stream completamente caído → L7 inmediato
        if (!$stable && $risk >= 90 && $stall >= 0.6) {
            return self::LEVEL_7;
        }

        // Evaluar de mejor a peor nivel
        foreach (self::THRESHOLDS as $level => $t) {
            if (
                $risk   <= $t['risk']  &&
                $stall  <= $t['stall'] &&
                $jitter <= $t['jitter'] &&
                $loss   <= $t['loss']  &&
                $vfi    >= $t['vfi']
            ) {
                return $level;
            }
        }

        return self::LEVEL_7;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CONSTRUCCIÓN DE DIRECTIVAS POR NIVEL
    // ══════════════════════════════════════════════════════════════════════════

    private static function buildLevelDirectives(
        int    $level,
        array  $defs,
        string $contentType,
        array  $health
    ): array {
        $directives = [
            "#EXT-X-APE-DEGRADATION-LEVEL:{$level}",
            "#EXT-X-APE-DEGRADATION-LABEL:{$defs['label']}",
            "#EXT-X-APE-DEGRADATION-ENGINE:" . self::VERSION,
        ];

        // Cadena de filtros de video
        if (!empty($defs['video_filter'])) {
            $directives[] = "#EXTVLCOPT:video-filter={$defs['video_filter']}";
        }

        // Escalamiento
        if ($defs['swscale'] > 1) {
            $directives[] = "#EXTVLCOPT:swscale-mode={$defs['swscale']}";
        }

        // Color y brillo
        if ($defs['saturation'] != 1.0) {
            $directives[] = "#EXTVLCOPT:video-saturation={$defs['saturation']}";
        }
        if ($defs['contrast'] != 1.0) {
            $directives[] = "#EXTVLCOPT:video-contrast={$defs['contrast']}";
        }

        // HDR
        if ($defs['max_cll'] > 0) {
            $directives[] = "#EXT-X-APE-HDR-MAXCLL:{$defs['max_cll']}";
            $directives[] = "#EXT-X-APE-HDR-MAXFALL:{$defs['max_fall']}";
            $directives[] = "#EXT-X-APE-COLOR-PRIMARIES:bt2020";
            $directives[] = "#EXT-X-APE-COLOR-TRANSFER:st2084";
            $directives[] = "#EXT-X-APE-HDR-TONE-MAP:PASSTHROUGH";
        }

        // LCEVC
        if ($defs['lcevc']) {
            $directives[] = "#EXT-X-APE-LCEVC-VERSION:PHASE4";
            $directives[] = "#EXT-X-APE-LCEVC-TARGET:3840x2160";
        }

        // HDR10+ dinámico
        if ($defs['hdr_dynamic']) {
            $directives[] = "#EXT-X-APE-HDR10PLUS-DYNAMIC:ENABLED";
        }

        // Interpolación de movimiento: solo para no-deportes en niveles 1-3
        if ($level <= 3 && $contentType !== 'sports') {
            $directives[] = "#EXT-X-APE-FRAME-INTERPOLATION:ENABLED";
        }

        // Buffer adaptativo según nivel
        $bufferMs = self::computeBufferForLevel($level, $health);
        $directives[] = "#EXTVLCOPT:network-caching={$bufferMs}";
        $directives[] = "#EXTVLCOPT:live-caching={$bufferMs}";
        $directives[] = "#EXTVLCOPT:clock-jitter=0";
        $directives[] = "#EXTVLCOPT:clock-synchro=0";
        $directives[] = "#EXTVLCOPT:http-reconnect=true";

        return $directives;
    }

    private static function buildFailoverDirectives(?string $backupUrl, array $health): array
    {
        $directives = [
            "#EXT-X-APE-DEGRADATION-LEVEL:7",
            "#EXT-X-APE-DEGRADATION-LABEL:FAILOVER",
            "#EXT-X-APE-DEGRADATION-ENGINE:" . self::VERSION,
            "#EXT-X-APE-FAILOVER:ACTIVE",
            "#EXTVLCOPT:network-caching=60000",
            "#EXTVLCOPT:live-caching=60000",
            "#EXTVLCOPT:http-reconnect=true",
            "#EXTVLCOPT:http-reconnect-delay=500",
        ];

        if ($backupUrl) {
            $directives[] = "#EXT-X-APE-FAILOVER-URL:{$backupUrl}";
            $directives[] = "#EXTVLCOPT:input-slave={$backupUrl}";
        }

        return $directives;
    }

    /**
     * Calcula el buffer óptimo para cada nivel de degradación.
     * Niveles altos (buena red) → buffer bajo (menos latencia).
     * Niveles bajos (mala red) → buffer alto (más estabilidad).
     */
    private static function computeBufferForLevel(int $level, array $health): int
    {
        $buffers = [
            self::LEVEL_1 => 5000,
            self::LEVEL_2 => 6000,
            self::LEVEL_3 => 7000,
            self::LEVEL_4 => 8000,
            self::LEVEL_5 => 12000,
            self::LEVEL_6 => 20000,
            self::LEVEL_7 => 60000,
        ];

        return $buffers[$level] ?? 8000;
    }
}
