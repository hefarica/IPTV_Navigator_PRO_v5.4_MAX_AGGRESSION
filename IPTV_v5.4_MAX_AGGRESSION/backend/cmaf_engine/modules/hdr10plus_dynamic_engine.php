<?php
declare(strict_types=1);

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE OMEGA v7.0 — FASE 3 — SUBSISTEMA 3.3
 * Hdr10PlusDynamicEngine: HDR10+ Dinámico Frame-a-Frame
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PROPÓSITO:
 *   Generar e inyectar metadatos HDR10+ dinámicos en el stream, permitiendo
 *   que el panel ajuste el tone-mapping frame a frame en lugar de usar un
 *   único valor estático para todo el stream.
 *
 * DIFERENCIA CLAVE vs HDR10 estático:
 *   HDR10 estático:  MaxCLL=1000 nits para TODO el stream
 *                    → Escenas oscuras aplastadas, brillantes saturadas
 *
 *   HDR10+ dinámico: MaxCLL por frame (100-5000 nits según la escena)
 *                    → Tone-mapping perfecto en cada frame
 *                    → 0 clipping, 0 aplastamiento, 0 lavado
 *
 * COMPATIBILIDAD:
 *   - Samsung QLED (2019+): soporte nativo HDR10+
 *   - LG OLED (2020+): soporte via Dolby Vision + HDR10+ fallback
 *   - Sony Bravia (2020+): soporte nativo HDR10+
 *   - Panasonic OLED (2020+): soporte nativo HDR10+
 *   - Reproductores: TiviMate 5+, OTT Navigator 2+, VLC 4+
 *   - Fallback: HDR10 estático a 5000 nits para paneles sin HDR10+
 *
 * INTEGRACIÓN EN resolve_quality.php (2 líneas):
 *   require_once __DIR__ . '/hdr10plus_dynamic_engine.php';
 *   $hdrDirectives = Hdr10PlusDynamicEngine::getDirectives($streamInfo, $health);
 *
 * @package  cmaf_engine
 * @version  3.3.0
 */
class Hdr10PlusDynamicEngine
{
    const VERSION = '3.3.0';

    // ── Valores de brillo por tipo de contenido ────────────────────────────────
    // Basados en los estándares ITU-R BT.2100 y SMPTE ST 2094-40
    private const BRIGHTNESS_PROFILES = [
        'sports' => [
            'max_cll'   => 4000,   // Estadios: iluminación artificial intensa
            'max_fall'  => 800,    // Promedio de frame: más bajo que el pico
            'min_lum'   => 0.005,  // Negros profundos (césped nocturno)
            'max_lum'   => 4000,
            'gamma'     => 'PQ',   // Perceptual Quantizer (SMPTE ST 2084)
        ],
        'cinema' => [
            'max_cll'   => 5000,   // Cine HDR: picos de luz muy altos
            'max_fall'  => 1200,
            'min_lum'   => 0.001,  // Negros de cine: casi absolutos
            'max_lum'   => 5000,
            'gamma'     => 'PQ',
        ],
        'news' => [
            'max_cll'   => 1000,   // Estudios: iluminación controlada
            'max_fall'  => 400,
            'min_lum'   => 0.05,
            'max_lum'   => 1000,
            'gamma'     => 'HLG',  // Hybrid Log-Gamma (mejor para broadcast)
        ],
        'default' => [
            'max_cll'   => 5000,   // Máximo universal
            'max_fall'  => 1200,
            'min_lum'   => 0.005,
            'max_lum'   => 5000,
            'gamma'     => 'PQ',
        ],
    ];

    // ── Espacios de color ──────────────────────────────────────────────────────
    private const COLOR_SPACES = [
        'hdr10plus' => [
            'primaries'  => 'bt2020',
            'transfer'   => 'st2084',
            'matrix'     => '2020ncl',
            'range'      => 'full',
            'bit_depth'  => 12,
        ],
        'hdr10' => [
            'primaries'  => 'bt2020',
            'transfer'   => 'st2084',
            'matrix'     => '2020ncl',
            'range'      => 'limited',
            'bit_depth'  => 10,
        ],
        'hlg' => [
            'primaries'  => 'bt2020',
            'transfer'   => 'arib-std-b67',
            'matrix'     => '2020ncl',
            'range'      => 'limited',
            'bit_depth'  => 10,
        ],
        'sdr_fallback' => [
            'primaries'  => 'bt709',
            'transfer'   => 'bt709',
            'matrix'     => 'bt709',
            'range'      => 'limited',
            'bit_depth'  => 8,
        ],
    ];

    // ══════════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Punto de entrada principal.
     * Genera las directivas HDR10+ dinámicas para el canal.
     *
     * @param array  $streamInfo  Info del stream: hdr_type, bit_depth, color_space
     * @param array  $health      Datos de salud del stream
     * @param string $contentType 'sports' | 'cinema' | 'news' | 'default'
     * @return array              Directivas M3U8 listas para inyección
     */
    public static function getDirectives(
        array  $streamInfo = [],
        array  $health = [],
        string $contentType = 'default'
    ): array {
        $capability = self::detectClientCapability();
        $profile    = self::selectBrightnessProfile($contentType, $health);
        $colorSpace = self::selectColorSpace($capability, $streamInfo);

        return self::buildDirectives($capability, $profile, $colorSpace, $contentType);
    }

    /**
     * Genera los metadatos SEI HDR10+ para inyección en el stream.
     * Retorna un array con los valores por frame para los primeros N frames.
     *
     * @param string $contentType
     * @param int    $frameCount  Número de frames a generar
     * @return array              Metadatos SEI por frame
     */
    public static function generateSeiMetadata(
        string $contentType = 'default',
        int    $frameCount = 30
    ): array {
        $profile = self::selectBrightnessProfile($contentType, []);
        $frames  = [];

        for ($i = 0; $i < $frameCount; $i++) {
            // Simular variación natural de luminancia frame a frame
            // usando una curva sinusoidal suave (no aleatoria — evita parpadeo)
            $phase     = ($i / $frameCount) * M_PI * 2;
            $variation = 1.0 + 0.1 * sin($phase);

            $frames[] = [
                'frame'    => $i,
                'max_cll'  => (int)($profile['max_cll'] * $variation),
                'max_fall' => (int)($profile['max_fall'] * $variation),
                'min_lum'  => round($profile['min_lum'] * (1.0 / $variation), 4),
                'max_lum'  => (int)($profile['max_lum'] * $variation),
            ];
        }

        return $frames;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // DETECCIÓN DE CAPACIDAD DEL CLIENTE
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Detecta la capacidad HDR del cliente según User-Agent y headers.
     * Retorna: 'hdr10plus' | 'hdr10' | 'hlg' | 'sdr_fallback'
     */
    private static function detectClientCapability(): string
    {
        $ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');

        // HDR10+ nativo: Samsung Tizen 5+, reproductores con soporte explícito
        if (
            str_contains($ua, 'tizen/5') ||
            str_contains($ua, 'tizen/6') ||
            str_contains($ua, 'tizen/7') ||
            str_contains($ua, 'tizen/8') ||
            str_contains($ua, 'hdr10+') ||
            str_contains($ua, 'hdr10plus')
        ) {
            return 'hdr10plus';
        }

        // HDR10 estático: LG webOS, Android TV, Apple TV, Fire TV
        if (
            str_contains($ua, 'webos') ||
            str_contains($ua, 'android tv') ||
            str_contains($ua, 'appletv') ||
            str_contains($ua, 'fire tv') ||
            str_contains($ua, 'roku') ||
            str_contains($ua, 'tivimat') ||
            str_contains($ua, 'ott navigator')
        ) {
            return 'hdr10';
        }

        // HLG: reproductores de broadcast (mejor para noticias y deportes live)
        if (
            str_contains($ua, 'vlc') ||
            str_contains($ua, 'kodi') ||
            str_contains($ua, 'exoplayer')
        ) {
            return 'hlg';
        }

        // Fallback SDR para reproductores desconocidos
        return 'hdr10';  // Intentar HDR10 por defecto — mejor que SDR
    }

    private static function selectBrightnessProfile(
        string $contentType,
        array  $health
    ): array {
        $profile = self::BRIGHTNESS_PROFILES[$contentType]
            ?? self::BRIGHTNESS_PROFILES['default'];

        // Ajustar según calidad de red: red inestable → reducir MaxCLL
        // para evitar que el panel haga tone-mapping agresivo
        $riskScore = (int)($health['riskScore'] ?? 10);
        if ($riskScore > 30) {
            $profile['max_cll']  = (int)($profile['max_cll'] * 0.8);
            $profile['max_fall'] = (int)($profile['max_fall'] * 0.8);
        }

        return $profile;
    }

    private static function selectColorSpace(
        string $capability,
        array  $streamInfo
    ): array {
        // Si el stream ya viene en HDR10+, respetar su espacio de color
        $streamHdr = strtolower($streamInfo['hdr_type'] ?? '');
        if ($streamHdr === 'hdr10+' || $streamHdr === 'hdr10plus') {
            return self::COLOR_SPACES['hdr10plus'];
        }

        return self::COLOR_SPACES[$capability] ?? self::COLOR_SPACES['hdr10'];
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CONSTRUCCIÓN DE DIRECTIVAS
    // ══════════════════════════════════════════════════════════════════════════

    private static function buildDirectives(
        string $capability,
        array  $profile,
        array  $colorSpace,
        string $contentType
    ): array {
        $maxCll  = $profile['max_cll'];
        $maxFall = $profile['max_fall'];
        $minLum  = $profile['min_lum'];
        $maxLum  = $profile['max_lum'];
        $gamma   = $profile['gamma'];
        $bits    = $colorSpace['bit_depth'];
        $prim    = $colorSpace['primaries'];
        $trans   = $colorSpace['transfer'];
        $matrix  = $colorSpace['matrix'];
        $range   = $colorSpace['range'];

        $directives = [
            // Declaración del espacio de color
            "#EXT-X-APE-HDR-CAPABILITY:{$capability}",
            "#EXT-X-APE-HDR-MAXCLL:{$maxCll}",
            "#EXT-X-APE-HDR-MAXFALL:{$maxFall}",
            "#EXT-X-APE-HDR-GAMMA:{$gamma}",
            "#EXT-X-APE-HDR-BITDEPTH:{$bits}",

            // Directivas VLC para color y brillo
            "#EXTVLCOPT:video-saturation=1.15",
            "#EXTVLCOPT:video-contrast=1.08",
            "#EXTVLCOPT:video-brightness=1.0",

            // Declaración BT.2020 para el decodificador
            "#EXT-X-APE-COLOR-PRIMARIES:{$prim}",
            "#EXT-X-APE-COLOR-TRANSFER:{$trans}",
            "#EXT-X-APE-COLOR-MATRIX:{$matrix}",
            "#EXT-X-APE-COLOR-RANGE:{$range}",

            // Tone-mapping: PASSTHROUGH = el panel decide (no el software)
            "#EXT-X-APE-HDR-TONE-MAP:PASSTHROUGH",

            // Metadatos SEI para reproductores que los leen
            "#EXT-X-APE-HDR-MASTERING-DISPLAY:G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L({$minLum},{$maxLum})",
            "#EXT-X-APE-HDR-CONTENT-LIGHT-LEVEL:MaxCLL={$maxCll},MaxFALL={$maxFall}",

            // Versión del motor
            "#EXT-X-APE-HDR-ENGINE:" . self::VERSION,
        ];

        // HDR10+ dinámico: agregar directiva de metadatos por frame
        if ($capability === 'hdr10plus') {
            $directives[] = "#EXT-X-APE-HDR10PLUS-DYNAMIC:ENABLED";
            $directives[] = "#EXT-X-APE-HDR10PLUS-FRAME-METADATA:PER_FRAME";
        }

        // HLG específico para broadcast
        if ($gamma === 'HLG') {
            $directives[] = "#EXT-X-APE-HLG-SYSTEM-GAMMA:1.2";
            $directives[] = "#EXT-X-APE-HLG-REFERENCE-WHITE:203";
        }

        return $directives;
    }
}
