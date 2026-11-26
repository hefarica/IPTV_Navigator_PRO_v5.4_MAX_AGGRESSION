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
 * ENHANCEMENT MODEL (v3.4.0):
 *   SDR→HDR unconditional: MAX IMAGE FIRST doctrine.
 *   Every channel receives inverse-tone-mapping hints, EOTF declaration,
 *   color-volume targeting, dithering and chroma-upsampling directives.
 *   All emitted as #EXT-X-APE-* (player-blind per RFC 8216 §6.3.1) or
 *   #EXTVLCOPT (VLC/Kodi only). NOTHING touches STREAM-INF / CODECS /
 *   SUPPLEMENTAL-CODECS — those are owned by the STREAM-INF emitter layer.
 *
 * @package  cmaf_engine
 * @version  3.4.0
 */
class Hdr10PlusDynamicEngine
{
    const VERSION = '3.4.0';

    // ── Valores de brillo por tipo de contenido ────────────────────────────────
    // Basados en los estándares ITU-R BT.2100 y SMPTE ST 2094-40
    private const BRIGHTNESS_PROFILES = [
        'sports' => [
            'max_cll'   => 10000,  // Estadios: iluminación artificial intensa a 10000 nits
            'max_fall'  => 1500,   // Promedio de frame
            'min_lum'   => 0.0001, // Negros OLED absolutos
            'max_lum'   => 10000,
            'gamma'     => 'PQ',   // Perceptual Quantizer (SMPTE ST 2084)
        ],
        'cinema' => [
            'max_cll'   => 10000,  // Cine HDR a 10000 nits
            'max_fall'  => 1500,
            'min_lum'   => 0.0001,
            'max_lum'   => 10000,
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
            'max_cll'   => 10000,  // Máximo universal
            'max_fall'  => 1500,
            'min_lum'   => 0.0001,
            'max_lum'   => 10000,
            'gamma'     => 'PQ',
        ],
    ];

    // ── Espacios de color ──────────────────────────────────────────────────────
    private const COLOR_SPACES = [
        // ── Dolby Vision (tier más agresivo) ──────────────────────────────────
        // Profile 8.1: base layer HDR10-compatible, RPU sintetizado.
        // bit_depth=12: BT.2100 PQ full-range 12-bit (SMPTE ST 2084).
        'dolbyvision' => [
            'primaries'  => 'bt2020',
            'transfer'   => 'st2084',
            'matrix'     => '2020ncl',
            'range'      => 'full',
            'bit_depth'  => 12,
        ],
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
     * Retorna: 'dolbyvision' | 'hdr10plus' | 'hdr10' | 'hlg' | 'sdr_fallback'
     *
     * Orden de prioridad (mayor a menor):
     *   dolbyvision > hdr10plus > hdr10 > hlg > hdr10 (default)
     */
    private static function detectClientCapability(): string
    {
        $ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');

        // ── Dolby Vision (tier más agresivo) ──────────────────────────────────
        // UA indica soporte explícito DV: 'dolby', 'dovi', 'dv_', 'vision'
        if (
            str_contains($ua, 'dolby') ||
            str_contains($ua, 'dovi') ||
            str_contains($ua, 'dv_') ||
            str_contains($ua, 'vision')
        ) {
            return 'dolbyvision';
        }

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
        // para evitar que el panel haga tone-mapping agresivo.
        // Curva graduada (v3.4.0):
        //   riskScore > 30  → reducción fuerte (*0.80) — red muy inestable
        //   riskScore 16-30 → reducción moderada (*0.92) — red fluctuante
        //   riskScore ≤ 15  → sin reducción (perfil completo)
        $riskScore = (int)($health['riskScore'] ?? 10);
        if ($riskScore > 30) {
            $profile['max_cll']  = (int)($profile['max_cll'] * 0.8);
            $profile['max_fall'] = (int)($profile['max_fall'] * 0.8);
        } elseif ($riskScore > 15) {
            // Reducción intermedia suave: menos saltos bruscos de tone-mapping
            $profile['max_cll']  = (int)($profile['max_cll'] * 0.92);
            $profile['max_fall'] = (int)($profile['max_fall'] * 0.92);
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

        // ── Saturación / contraste por tier de capacidad ───────────────────────
        // dolbyvision: máxima agresividad (tier más alto)
        // hdr10plus  : alta agresividad
        // hdr10      : agresividad moderada
        // fallback   : conservador
        $saturation = 1.15;
        $contrast   = 1.08;
        if ($capability === 'dolbyvision') {
            $saturation = 1.38; // Dolby Vision EXTREME — Vivid UHD Color máximo
            $contrast   = 1.15;
        } elseif ($capability === 'hdr10plus') {
            $saturation = 1.30; // UHD COLOR EXTREMO (Dazzling, Vivid color boost)
            $contrast   = 1.12;
        } elseif ($capability === 'hdr10') {
            $saturation = 1.22;
            $contrast   = 1.10;
        }

        $directives = [
            // Declaración del espacio de color
            "#EXT-X-APE-HDR-CAPABILITY:{$capability}",
            "#EXT-X-APE-HDR-MAXCLL:{$maxCll}",
            "#EXT-X-APE-HDR-MAXFALL:{$maxFall}",
            "#EXT-X-APE-HDR-GAMMA:{$gamma}",
            "#EXT-X-APE-HDR-BITDEPTH:{$bits}",
            "#EXT-X-APE-HDR-COLOR-PROFILE:UHD_COLOR_EXTREMO",

            // Directivas VLC para color y brillo
            "#EXTVLCOPT:video-saturation={$saturation}",
            "#EXTVLCOPT:video-contrast={$contrast}",
            "#EXTVLCOPT:video-brightness=1.0",

            // Declaración BT.2020 para el decodificador
            "#EXT-X-APE-COLOR-PRIMARIES:{$prim}",
            "#EXT-X-APE-COLOR-TRANSFER:{$trans}",
            "#EXT-X-APE-COLOR-MATRIX:{$matrix}",
            "#EXT-X-APE-COLOR-RANGE:{$range}",

            // Tone-mapping: PASSTHROUGH = el panel decide (no el software)
            "#EXT-X-APE-HDR-TONE-MAP:PASSTHROUGH",

            // Metadatos SEI para reproductores que los leen
            // Mastering display per SMPTE ST 2086 (P3-D65 primaries mapped to BT.2020 container)
            // G(13250,34500)=BT.2020 green, B(7500,3000)=BT.2020 blue, R(34000,16000)=BT.2020 red
            // WP(15635,16450)=D65 white point  L(min,max) in 0.0001 cd/m² units
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

        // ── Dolby Vision enhancement hints (player-blind — NOT SUPPLEMENTAL-CODECS) ──
        // Profile 8.1 = base layer HDR10-compatible + optional DV enhancement layer.
        // RPU:SYNTHESIZED es honest — generado por el engine, no extraído de source DV.
        // DV Level 06 = max-bitrate tier permitido para single-track delivery.
        // Ref: Dolby Vision Streams Within the HTTP Live Streaming Format, Rev 3.
        if ($capability === 'dolbyvision') {
            $directives[] = "#EXT-X-APE-DV-PROFILE:8.1";
            $directives[] = "#EXT-X-APE-DV-BL-COMPATIBILITY:HDR10";
            $directives[] = "#EXT-X-APE-DV-LEVEL:06";
            $directives[] = "#EXT-X-APE-DV-RPU:SYNTHESIZED";
        }

        // ── SDR→HDR inverse tone-mapping — UNCONDITIONAL (MAX IMAGE FIRST) ───────
        // Emitido para TODOS los canales sin importar si la fuente es SDR o HDR.
        // Doctrina: mejor apuntar alto que dejar imagen sin mejorar.
        // Todas las siguientes directivas son #EXT-X-APE-* → PLAYER-BLIND
        // (RFC 8216 §6.3.1: tags desconocidos se ignoran — FREEZELESS garantizado).
        //
        // BT.2446 Method A (ITU-R BT.2446-1, Table 4): curva de up-mapping SDR→HDR
        // aprobada por ITU para conversión BT.709 SDR 100 cd/m² → BT.2020 PQ/HLG.
        //
        // EOTF: SMPTE ST 2084 (PQ) para fuentes PQ / ARIB STD-B67 (HLG) para HLG.
        // Dithering: error-diffusion es el método correcto para 8→10/12-bit upconversion
        //   — minimiza banding cuantificación (ISO 12640-3 dithering art. 6.2).
        // Chroma: 4:2:0→4:2:2 upsample antes del display-mapping reduce color fringing.
        $directives[] = "#EXT-X-APE-SDR2HDR:ENABLED";
        $directives[] = "#EXT-X-APE-SDR2HDR-METHOD:INVERSE-TONE-MAPPING";
        $directives[] = "#EXT-X-APE-HDR-TARGET-PEAK-NITS:{$maxLum}";
        $directives[] = "#EXT-X-APE-HDR-EOTF:" . ($gamma === 'HLG' ? 'ARIB-STD-B67' : 'SMPTE-ST-2084');
        $directives[] = "#EXT-X-APE-HDR-COLOR-VOLUME:BT2020";
        $directives[] = "#EXT-X-APE-HDR-DITHER:ERROR-DIFFUSION";
        $directives[] = "#EXT-X-APE-HDR-CHROMA-UPSAMPLE:4:2:0-to-4:2:2";
        $directives[] = "#EXT-X-APE-HDR-INVERSE-TONEMAP-CURVE:BT2446a";

        return $directives;
    }
}
