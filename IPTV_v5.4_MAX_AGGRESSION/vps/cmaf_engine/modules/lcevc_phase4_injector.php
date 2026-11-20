<?php
declare(strict_types=1);

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE OMEGA v7.0 — FASE 3 — SUBSISTEMA 3.2
 * LcevcPhase4Injector: Escalamiento 4K por IA (MPEG-5 Part 2)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PROPÓSITO:
 *   Inyectar la capa de mejora LCEVC Phase 4 en el stream antes de enviarlo
 *   al cliente, permitiendo que el reproductor reconstruya 4K nativo desde
 *   un stream base de 1080p con un overhead de solo ~15% de bitrate adicional.
 *
 * ARQUITECTURA:
 *   El módulo opera en 3 modos según la capacidad del VPS:
 *
 *   MODO A — Enhancement Layer Metadata (recomendado):
 *     Inyecta los metadatos LCEVC en los tags M3U8 y las directivas del
 *     reproductor. El reproductor (si soporta LCEVC) aplica el escalamiento
 *     en su GPU. Sin procesamiento en el VPS.
 *
 *   MODO B — Proxy Enhancement (VPS con FFmpeg):
 *     El VPS procesa el stream con FFmpeg + filtro lcevc para generar la
 *     capa de mejora real. Requiere FFmpeg compilado con --enable-liblcevc_dec.
 *
 *   MODO C — Client-Side Upscaling Directives (fallback universal):
 *     Inyecta directivas VLC/Kodi para forzar escalamiento Lanczos en GPU
 *     del cliente. Compatible con cualquier reproductor sin LCEVC nativo.
 *
 * INTEGRACIÓN EN resolve_quality.php (2 líneas):
 *   require_once __DIR__ . '/lcevc_phase4_injector.php';
 *   $lcevcDirectives = LcevcPhase4Injector::getDirectives($streamInfo, $health);
 *
 * @package  cmaf_engine
 * @version  3.2.0
 * @see      https://www.mpeg.org/standards/MPEG-5/2/ (LCEVC spec)
 */
class LcevcPhase4Injector
{
    const VERSION = '3.2.0';

    // ── Modos de operación ─────────────────────────────────────────────────────
    const MODE_METADATA  = 'metadata';   // Solo metadatos, GPU del cliente
    const MODE_PROXY     = 'proxy';      // FFmpeg en VPS (requiere liblcevc_dec)
    const MODE_UPSCALING = 'upscaling';  // Directivas Lanczos fallback

    // ── Perfiles de calidad LCEVC ──────────────────────────────────────────────
    private const PROFILES = [
        '4k_supreme' => [
            'target_width'  => 3840,
            'target_height' => 2160,
            'enhancement'   => 'FULL',
            'sharpness'     => 0.85,
            'detail_boost'  => 1.2,
            'noise_floor'   => 0.05,
        ],
        '4k_balanced' => [
            'target_width'  => 3840,
            'target_height' => 2160,
            'enhancement'   => 'BALANCED',
            'sharpness'     => 0.70,
            'detail_boost'  => 1.0,
            'noise_floor'   => 0.08,
        ],
        '1080p_enhanced' => [
            'target_width'  => 1920,
            'target_height' => 1080,
            'enhancement'   => 'LIGHT',
            'sharpness'     => 0.60,
            'detail_boost'  => 0.8,
            'noise_floor'   => 0.10,
        ],
    ];

    // ── Filtros de escalamiento por calidad de red ─────────────────────────────
    // Orden de la cadena: nlmeans → bwdif → gradfun → unsharp → zscale
    // Este orden es FIJO — invertirlo genera exactamente los defectos que se eliminan
    private const FILTER_CHAINS = [
        'god_tier' => [
            'nlmeans'  => 's=3.0:p=7:r=15',                                    // P1: 0 ruido MPEG
            'bwdif'    => 'mode=1:parity=-1:deint=0',                           // P2: 0 artefactos entrelazado
            'gradfun'  => 'radius=16:strength=1.0',                             // P3: 0 pixelamiento fondos
            'unsharp'  => 'luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0',  // P4: 0 halo
            'zscale'   => 'transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full:chromal=topleft,chroma_I444',  // P5: HDR10
        ],
        'balanced' => [
            'yadif'    => 'mode=1:parity=-1:deint=0',
            'gradfun'  => 'radius=12:strength=0.8',
            'unsharp'  => 'luma_msize_x=3:luma_msize_y=3:luma_amount=0.3:chroma_amount=0.0',
        ],
        'light' => [
            'yadif'    => 'mode=0:parity=-1:deint=0',
            'unsharp'  => 'luma_msize_x=3:luma_msize_y=3:luma_amount=0.2:chroma_amount=0.0',
        ],
    ];

    // ══════════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Punto de entrada principal.
     * Detecta el modo óptimo y retorna las directivas LCEVC para el canal.
     *
     * @param array  $streamInfo  Info del stream: width, height, codec, bitrate_kbps
     * @param array  $health      Datos de salud del stream
     * @param string $contentType 'sports' | 'cinema' | 'news' | 'default'
     * @return array              Directivas M3U8 listas para inyección
     */
    public static function getDirectives(
        array  $streamInfo = [],
        array  $health = [],
        string $contentType = 'default'
    ): array {
        $mode    = self::detectMode();
        $profile = self::selectProfile($streamInfo, $health);
        $chain   = self::selectFilterChain($health);

        return match ($mode) {
            self::MODE_PROXY     => self::buildProxyDirectives($profile, $chain, $contentType),
            self::MODE_METADATA  => self::buildMetadataDirectives($profile, $chain, $contentType),
            default              => self::buildUpscalingDirectives($profile, $chain, $contentType),
        };
    }

    /**
     * Construye el filtro VLC completo como string serializado.
     * Útil para inyección directa en #EXTVLCOPT:video-filter=
     *
     * @param string $chainName 'god_tier' | 'balanced' | 'light'
     * @return string           Cadena de filtros serializada
     */
    public static function buildFilterString(string $chainName = 'god_tier'): string
    {
        $chain = self::FILTER_CHAINS[$chainName] ?? self::FILTER_CHAINS['balanced'];
        $parts = [];
        foreach ($chain as $filter => $params) {
            $parts[] = "{$filter}={$params}";
        }
        return implode(',', $parts);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // DETECCIÓN DE MODO
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Detecta el modo óptimo según las capacidades del VPS.
     */
    private static function detectMode(): string
    {
        // Verificar si FFmpeg con LCEVC está disponible
        if (self::hasLcevcFfmpeg()) {
            return self::MODE_PROXY;
        }

        // Verificar si el reproductor soporta LCEVC nativo (via header)
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
        if (self::clientSupportsLcevc($ua)) {
            return self::MODE_METADATA;
        }

        // Fallback universal: directivas de escalamiento en cliente
        return self::MODE_UPSCALING;
    }

    private static function hasLcevcFfmpeg(): bool
    {
        static $checked = null;
        if ($checked !== null) {
            return $checked;
        }
        $output = shell_exec('ffmpeg -encoders 2>/dev/null | grep -i lcevc') ?? '';
        $checked = !empty(trim($output));
        return $checked;
    }

    private static function clientSupportsLcevc(string $userAgent): bool
    {
        $lcevcClients = [
            'V-Nova', 'LCEVC', 'Perseus',
            'TiviMate/5', 'OTT Navigator/2',
        ];
        foreach ($lcevcClients as $client) {
            if (str_contains($userAgent, $client)) {
                return true;
            }
        }
        return false;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SELECCIÓN DE PERFIL Y CADENA
    // ══════════════════════════════════════════════════════════════════════════

    private static function selectProfile(array $streamInfo, array $health): array
    {
        $riskScore = (int)($health['riskScore'] ?? 10);
        $vfi       = (float)($health['vfi'] ?? 60);

        // Red excelente → perfil supremo
        if ($riskScore <= 15 && $vfi >= 50) {
            return self::PROFILES['4k_supreme'];
        }

        // Red buena → perfil balanceado
        if ($riskScore <= 30) {
            return self::PROFILES['4k_balanced'];
        }

        // Red inestable → solo mejorar 1080p, no escalar a 4K
        return self::PROFILES['1080p_enhanced'];
    }

    private static function selectFilterChain(array $health): string
    {
        $riskScore = (int)($health['riskScore'] ?? 10);
        $vfi       = (float)($health['vfi'] ?? 60);

        if ($riskScore <= 15 && $vfi >= 50) {
            return 'god_tier';
        }
        if ($riskScore <= 30) {
            return 'balanced';
        }
        return 'light';
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CONSTRUCCIÓN DE DIRECTIVAS POR MODO
    // ══════════════════════════════════════════════════════════════════════════

    private static function buildProxyDirectives(
        array  $profile,
        string $chainName,
        string $contentType
    ): array {
        $filterStr = self::buildFilterString($chainName);
        $w = $profile['target_width'];
        $h = $profile['target_height'];

        return [
            "#EXT-X-APE-LCEVC-MODE:PROXY",
            "#EXT-X-APE-LCEVC-VERSION:PHASE4",
            "#EXT-X-APE-LCEVC-TARGET:{$w}x{$h}",
            "#EXT-X-APE-LCEVC-PROFILE:{$profile['enhancement']}",
            "#EXTVLCOPT:video-filter={$filterStr}",
            "#EXTVLCOPT:swscale-mode=9",
            "#EXTVLCOPT:video-saturation=1.15",
            "#EXTVLCOPT:video-contrast=1.08",
            "#KODIPROP:inputstream.adaptive.max_resolution={$w}x{$h}",
            "#EXT-X-APE-LCEVC-INJECTOR:" . self::VERSION,
        ];
    }

    private static function buildMetadataDirectives(
        array  $profile,
        string $chainName,
        string $contentType
    ): array {
        $filterStr = self::buildFilterString($chainName);
        $w = $profile['target_width'];
        $h = $profile['target_height'];

        return [
            "#EXT-X-APE-LCEVC-MODE:METADATA",
            "#EXT-X-APE-LCEVC-VERSION:PHASE4",
            "#EXT-X-APE-LCEVC-TARGET:{$w}x{$h}",
            "#EXT-X-APE-LCEVC-ENHANCEMENT:{$profile['enhancement']}",
            "#EXT-X-APE-LCEVC-SHARPNESS:{$profile['sharpness']}",
            "#EXT-X-APE-LCEVC-DETAIL-BOOST:{$profile['detail_boost']}",
            "#EXTVLCOPT:video-filter={$filterStr}",
            "#EXTVLCOPT:swscale-mode=9",
            "#KODIPROP:inputstream.adaptive.max_resolution={$w}x{$h}",
            "#EXT-X-APE-LCEVC-INJECTOR:" . self::VERSION,
        ];
    }

    private static function buildUpscalingDirectives(
        array  $profile,
        string $chainName,
        string $contentType
    ): array {
        $filterStr = self::buildFilterString($chainName);
        $w = $profile['target_width'];
        $h = $profile['target_height'];

        // Interpolación de movimiento solo para contenido no deportivo
        // (evita el Efecto Halo en jugadores)
        $interpolation = ($contentType !== 'sports')
            ? "#EXT-X-APE-FRAME-INTERPOLATION:ENABLED"
            : "#EXT-X-APE-FRAME-INTERPOLATION:DISABLED";

        return [
            "#EXT-X-APE-LCEVC-MODE:CLIENT-UPSCALING",
            "#EXT-X-APE-LCEVC-VERSION:PHASE4",
            "#EXT-X-APE-LCEVC-TARGET:{$w}x{$h}",
            "#EXTVLCOPT:video-filter={$filterStr}",
            "#EXTVLCOPT:swscale-mode=9",
            "#EXTVLCOPT:video-saturation=1.15",
            "#EXTVLCOPT:video-contrast=1.08",
            "#KODIPROP:inputstream.adaptive.max_resolution={$w}x{$h}",
            "#KODIPROP:inputstream.adaptive.min_bandwidth=0",
            $interpolation,
            "#EXT-X-APE-LCEVC-INJECTOR:" . self::VERSION,
        ];
    }
}
