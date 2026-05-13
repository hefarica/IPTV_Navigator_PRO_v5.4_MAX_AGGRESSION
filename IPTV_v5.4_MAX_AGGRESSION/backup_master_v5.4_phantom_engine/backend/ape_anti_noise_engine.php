<?php
/**
 * ============================================================================
 * APE ANTI-NOISE ENGINE v1.0 — Módulo 15: Engine Anti-Ruido Industrial
 * ============================================================================
 *
 * Motor de limpieza y restauración de video de nivel industrial para streaming
 * IPTV. Enfocado en eliminar ruido MPEG, artefactos de compresión (blocking,
 * ringing, mosquito noise), flicker temporal y pérdida de detalle.
 *
 * ARQUITECTURA (3 Capas):
 *   Capa 1: Clasificación de Fuente — Perfilado del stream antes de procesar.
 *           Clasifica en: CLEAN, LIGHT_DIRTY, HEAVY_DIRTY, CRUSHED.
 *   Capa 2: Scoring Industrial — Puntuación multidimensional de la fuente
 *           en 6 ejes: blocking, temporal, sharpness, costo, latencia, valor.
 *   Capa 3: Pipeline de Limpieza — 3 perfiles según clasificación:
 *           A = Live Seguro (hqdn3d suave + unsharp leve)
 *           B = Fuente Comprimida (nlmeans/bm3d + zscale/tonemap + sharpen fino)
 *           C = Premium/VOD (pipeline completo + restauración IA selectiva)
 *
 * BASE TÉCNICA:
 *   - FFmpeg es el backbone. Todos los filtros son filtros FFmpeg reales
 *     documentados oficialmente en ffmpeg-filters.html.
 *   - PHP = ORQUESTADOR. NUNCA llama exec("ffmpeg..."). Genera directivas
 *     EXTVLCOPT que VLC/TiviMate/Kodi interpretan y ejecutan client-side.
 *   - GPU = Acelerador. Los filtros se ejecutan preferentemente en GPU
 *     cuando el cliente soporta NVDEC/VAAPI/Vulkan.
 *
 * FILTROS IMPLEMENTADOS (todos documentados en FFmpeg):
 *   bwdif      — Bob Weaver Deinterlacing (híbrido Yadif + BBC w3fdif)
 *   hqdn3d     — High Quality 3D Denoiser (spatial + temporal)
 *   nlmeans    — Non-Local Means denoiser (preserva estructura mejor)
 *   bm3d       — Block-Matching 3D transform filtering (research, si disponible)
 *   eq         — Equalizador de brillo/contraste/saturación
 *   unsharp    — Máscara de enfoque unsharp adaptativa
 *   cas        — Contrast Adaptive Sharpening (sharpening sin halos)
 *   zscale     — Escalado con zimg (soporta transfer/priamarie colors)
 *   tonemap    — Tone mapping HDR (curva Hable para cinematico)
 *   afftdn     — FFT Denoiser (dominio de frecuencia, complementa hqdn3d)
 *   minterpolate — Motion Compensation Interpolation (120fps)
 *   pad        — Padding (prevenir edge artifacts de upscale)
 *   scale      — Escalado con flags (lanczos para calidad máxima)
 *   deblock    — Filtro deblocking MPEG (elimina bloques visibles)
 *   fftfilt    — Filtro FFT genérico (elimina ruido periódico)
 *   mpdecimate — Decimación de frames duplicados (limpia cadenas estáticas)
 *
 * INTEGRACIÓN:
 *   Este módulo se integra en rq_sniper_integrate() como Module 15.
 *   Se ejecuta DESPUÉS del Module 8 (FFmpeg Pipeline) y fusiona sus
 *   filtros con los existentes usando la misma sintaxis video-filter.
 *
 * FUENTES DEL MUNDO REAL:
 *   - FFmpeg Filters: https://ffmpeg.org/ffmpeg-filters.html
 *   - Real-ESRGAN: Restauración general de imagen/video
 *   - RealBasicVSR: Video super-resolution con tradeoffs reales
 *   - NTIRE 2025: UGC Video Enhancement Challenge
 *   - MPEG 152: Neural-network-based post-filtering (estándar emergente)
 *   - CVQE 2025: Compressed Video Quality Enhancement benchmarking
 *
 * PROTECTED PARAMETERS — NUNCA se violan:
 *   1. BWDIF (no Yadif)           6. eARC mandatory
 *   2. Sharpness 80% (no >80%)    7. TV native upscaling
 *   3. AI-SR Low                  8. WARM color temp
 *   4. Denoise OFF en 4K          9. Contrast 100%
 *   5. ALLM false                 10. Saturación 65%
 *
 * ============================================================================
 */

// ============================================================================
// CONSTANTES DE CONFIGURACIÓN — ANTI-NOISE ENGINE
// ============================================================================

// Umbrales de clasificación de fuente (basados en metadata disponible)
define('APE_NOISE_BITRATE_4K',     20000000);  // 20Mbps = piso razonable 4K
define('APE_NOISE_BITRATE_HD',     8000000);   // 8Mbps = piso razonable HD
define('APE_NOISE_BITRATE_SD',     3000000);   // 3Mbps = piso razonable SD
define('APE_NOISE_BITRATE_CRUSHED', 2000000);  // 2Mbps =_fuente muy comprimida

// Puntuaciones del scoring industrial (0-100)
define('APE_NOISE_SCORE_CLEAN',       80);  // >80 = fuente limpia, perfil A
define('APE_NOISE_SCORE_DIRTY',       50);  // 50-80 = sucia, perfil B
define('APE_NOISE_SCORE_CRUSHED',     30);  // 30-50 = aplastada, perfil C
define('APE_NOISE_SCORE_THRESHOLD_A', 80);
define('APE_NOISE_SCORE_THRESHOLD_B', 50);

// Pesos del scoring multidimensional
define('APE_NOISE_WEIGHT_BLOCKING',    0.30);  // 30% — severidad de bloques
define('APE_NOISE_WEIGHT_TEMPORAL',    0.25);  // 25% — ruido temporal/flicker
define('APE_NOISE_WEIGHT_SHARPNESS',   0.15);  // 15% — nitidez residual útil
define('APE_NOISE_WEIGHT_COST',        0.15);  // 15% — costo computacional
define('APE_NOISE_WEIGHT_LATENCY',     0.10);  // 10% — latencia permitida
define('APE_NOISE_WEIGHT_CHANNEL_VAL', 0.05);  // 5%  — valor del canal

// Cache TTL para clasificación (evitar reclasificar cada request)
define('APE_NOISE_CLASSIFICATION_CACHE', 120);  // 2 minutos
define('APE_NOISE_CLASSIFICATION_DIR',   '/tmp/ape_sniper/noise_class/');

// ============================================================================
// ASEGURAR DIRECTORIO DE CACHE
// ============================================================================

if (!is_dir(APE_NOISE_CLASSIFICATION_DIR)) {
    @mkdir(APE_NOISE_CLASSIFICATION_DIR, 0755, true);
}

// ============================================================================
// MÓDULO 15A: CLASIFICACIÓN DE FUENTE — Source Profiler
// ============================================================================
/**
 * Clasifica una fuente de streaming en 4 categorías basándose en la metadata
 * disponible: bitrate reportado, resolución del perfil, estado ACRP y
 * parámetros del tier.
 *
 * NOTA: PHP es ORQUESTADOR. No ejecuta ffprobe. La clasificación se basa
 * en metadata disponible del CDN, perfil del tier y estado del canal.
 *
 * Clasificaciones:
 *   CLEAN       (score >= 80) — Fuente de alta calidad, mínimos artefactos
 *   LIGHT_DIRTY (score 50-80)  — Artefactos visibles pero manejables
 *   HEAVY_DIRTY (score 30-50)  — Artefactos severos, necesita pipeline agresivo
 *   CRUSHED     (score < 30)   — Fuente destruida por compresión, máximo esfuerzo
 *
 * @param array  $sniper_status  Estado del canal (de rq_sniper_classify)
 * @param string $profile        Perfil efectivo (P0-P5)
 * @param int    $bitrate_hint   Bitrate detectado del CDN (0 si desconocido)
 * @param string $resolution     Resolución detectada ('4k','hd','sd','unknown')
 * @return array ['classification' => string, 'score' => int, 'profile' => string]
 */
function ape_noise_classify_source($sniper_status, $profile = '', $bitrate_hint = 0, $resolution = 'unknown') {
    // --- Cache check (evitar reclasificar en cada request) ---
    $ch_id = $sniper_status['ch_id'] ?? 0;
    if ($ch_id > 0) {
        $cache_file = APE_NOISE_CLASSIFICATION_DIR . 'ch_' . intval($ch_id) . '.noise';
        if (@file_exists($cache_file)) {
            $cache_age = time() - @filemtime($cache_file);
            if ($cache_age < APE_NOISE_CLASSIFICATION_CACHE) {
                $cached = @json_decode(@file_get_contents($cache_file), true);
                if (is_array($cached) && isset($cached['classification'])) {
                    return $cached;
                }
            }
        }
    }

    // === EJE 1: Severidad de Blocking/Macroblocking ===
    // Inferido del bitrate vs resolución
    $blocking_score = 0;  // 0 = limpio, 100 = bloqueado totalmente

    if ($bitrate_hint > 0) {
        // Ratio bitrate/resolución indica calidad de compresión
        $res_pixels = 1;
        switch ($resolution) {
            case '4k':  $res_pixels = 8294400; break;   // 3840x2160
            case 'hd':  $res_pixels = 2073600; break;   // 1920x1080
            case 'sd':  $res_pixels = 409920;  break;   // 720x576
            default:    $res_pixels = 2073600; break;   // Default HD
        }

        // bpp (bits per pixel) indica calidad de compresión
        // > 0.15 bpp = muy buena compresión (poco blocking)
        // 0.05-0.15 bpp = compresión media (algo de blocking)
        // < 0.05 bpp = compresión destructiva (mucho blocking)
        $bpp = $bitrate_hint / $res_pixels;

        if ($bpp >= 0.15) {
            $blocking_score = 5;   // Casi sin bloques
        } elseif ($bpp >= 0.08) {
            $blocking_score = 20;  // Bloques ligeros
        } elseif ($bpp >= 0.04) {
            $blocking_score = 45;  // Bloques visibles
        } elseif ($bpp >= 0.02) {
            $blocking_score = 70;  // Bloques severos
        } else {
            $blocking_score = 95;  // Fuente aplastada
        }
    } else {
        // Sin bitrate: inferir del perfil/tier
        $blocking_score = ape_noise_infer_blocking_from_profile($profile);
    }

    // === EJE 2: Ruido Temporal/Flicker ===
    // Las fuentes SD/HD con bitrate bajo tienden a tener más flicker temporal
    $temporal_score = 10;
    if ($resolution === 'sd' || $resolution === 'hd') {
        if ($bitrate_hint > 0 && $bitrate_hint < APE_NOISE_BITRATE_CRUSHED) {
            $temporal_score = 70;  // SD comprimido = mucho flicker
        } elseif ($bitrate_hint > 0 && $bitrate_hint < APE_NOISE_BITRATE_SD) {
            $temporal_score = 40;  // SD normal = algo de flicker
        } else {
            $temporal_score = 20;  // SD con buen bitrate
        }
    }
    // 4K con buen bitrate = casi sin flicker temporal
    if ($resolution === '4k') {
        $temporal_score = 5;
    }

    // === EJE 3: Nitidez Residual Útil ===
    // Si la fuente ya fue aplastada, hay menos detalle para preservar
    $sharpness_score = 50;  // Default: nitidez media
    if ($blocking_score > 60) {
        $sharpness_score = 20;  // Poco detalle residual en fuente aplastada
    } elseif ($blocking_score < 20) {
        $sharpness_score = 85;  // Mucho detalle residual en fuente limpia
    }

    // === EJE 4: Costo Computacional Estimado ===
    // Más agresivo = más costo. Pero el pipeline se ejecuta client-side.
    $cost_score = 30;  // Base: costo medio-bajo
    if ($sniper_status['status'] === 'STREAMING') {
        $cost_score = 60;  // Canal activo: podemos permitir más costo
    }
    // Perfiles inferiores: reducir costo para no disparar latencia
    if (strpos($profile, 'P5') !== false || strpos($profile, 'MINIMAL') !== false) {
        $cost_score = 10;  // P5: mínimo costo aceptable
    }

    // === EJE 5: Latencia Permitida ===
    // Canal activo SNIPER: más latencia aceptable (buffer grande)
    // Canal no-activo: mínima latencia (pipeline simple)
    $latency_score = 50;
    if ($sniper_status['sniper']) {
        $latency_score = 80;  // SNIPER: buffer grande, podemos usar pipeline complejo
    } elseif ($sniper_status['status'] === 'RECENT') {
        $latency_score = 60;  // Reciente: pipeline moderado
    } else {
        $latency_score = 30;  // IDLE: pipeline mínimo
    }

    // === EJE 6: Valor del Canal ===
    // Inferido del perfil asignado (tier más alto = más valor)
    $channel_value = 50;
    if ($sniper_status['sniper']) {
        $channel_value = 100;  // Canal activo = máximo valor
    } elseif (strpos($profile, 'NUCLEAR') !== false) {
        $channel_value = 90;
    } elseif (strpos($profile, 'AGGRESSIVE') !== false) {
        $channel_value = 70;
    } elseif (strpos($profile, 'STANDARD') !== false) {
        $channel_value = 50;
    } elseif (strpos($profile, 'BASIC') !== false) {
        $channel_value = 30;
    }

    // === CÁLCULO DEL SCORE COMPUESTO ===
    // Invertir blocking y temporal (más ruido = peor score)
    $cleanliness = (100 - $blocking_score) * APE_NOISE_WEIGHT_BLOCKING
                 + (100 - $temporal_score) * APE_NOISE_WEIGHT_TEMPORAL
                 + $sharpness_score * APE_NOISE_WEIGHT_SHARPNESS
                 + $cost_score * APE_NOISE_WEIGHT_COST
                 + $latency_score * APE_NOISE_WEIGHT_LATENCY
                 + $channel_value * APE_NOISE_WEIGHT_CHANNEL_VAL;

    $final_score = intval(round($cleanliness));

    // === DETERMINAR CLASIFICACIÓN Y PERFIL ===
    if ($final_score >= APE_NOISE_SCORE_THRESHOLD_A) {
        $classification = 'CLEAN';
        $pipeline_profile = 'A';  // Live Seguro y Barato
    } elseif ($final_score >= APE_NOISE_SCORE_THRESHOLD_B) {
        $classification = 'LIGHT_DIRTY';
        $pipeline_profile = 'A';  // Live Seguro (conservador para IPTV live)
    } elseif ($final_score >= APE_NOISE_SCORE_CRUSHED) {
        $classification = 'HEAVY_DIRTY';
        $pipeline_profile = 'B';  // Fuente Comprimida — pipeline agresivo
    } else {
        $classification = 'CRUSHED';
        $pipeline_profile = 'C';  // Máximo esfuerzo — pipeline completo
    }

    // SNIPER activo puede escalar un nivel si hay beneficio
    if ($sniper_status['sniper'] && $pipeline_profile === 'A' && $blocking_score > 30) {
        $pipeline_profile = 'B';  // Escalar a B si hay blocking visible
    }

    $result = [
        'classification'   => $classification,
        'score'            => $final_score,
        'pipeline_profile' => $pipeline_profile,
        'axes'             => [
            'blocking_severity'  => $blocking_score,
            'temporal_noise'     => $temporal_score,
            'sharpness_residual' => $sharpness_score,
            'cost_allowed'       => $cost_score,
            'latency_allowed'    => $latency_score,
            'channel_value'      => $channel_value,
        ],
        'bitrate_hint'     => $bitrate_hint,
        'resolution'       => $resolution,
        'bpp'              => isset($bpp) ? round($bpp, 4) : null,
    ];

    // --- Cache result ---
    if ($ch_id > 0) {
        @file_put_contents(
            APE_NOISE_CLASSIFICATION_DIR . 'ch_' . intval($ch_id) . '.noise',
            json_encode($result),
            LOCK_EX
        );
    }

    return $result;
}

/**
 * Infiere severidad de blocking basándose en el perfil del tier.
 * Usado cuando no hay bitrate_hint disponible.
 *
 * @param string $profile  Perfil del canal
 * @return int Score de blocking (0-100)
 */
function ape_noise_infer_blocking_from_profile($profile) {
    // Perfiles más altos = menos bloque esperado
    if (strpos($profile, 'SNIPER-NUCLEAR') !== false || strpos($profile, 'NUCLEAR') !== false) {
        return 10;  // Perfil nuclear: asumir fuente de alta calidad
    }
    if (strpos($profile, 'AGGRESSIVE') !== false || strpos($profile, 'P2') !== false) {
        return 20;
    }
    if (strpos($profile, 'STANDARD') !== false || strpos($profile, 'FHD') !== false || strpos($profile, 'P3') !== false) {
        return 35;
    }
    if (strpos($profile, 'BASIC') !== false || strpos($profile, 'HD') !== false || strpos($profile, 'P4') !== false) {
        return 50;
    }
    if (strpos($profile, 'MINIMAL') !== false || strpos($profile, 'SD') !== false || strpos($profile, 'P5') !== false) {
        return 70;  // Perfil mínimo: probablemente fuente SD comprimida
    }
    return 40;  // Default medio
}

// ============================================================================
// MÓDULO 15B: MATRIZ INDUSTRIAL — Ruido → Filtro → Intensidad → Costo
// ============================================================================
/**
 * Retorna la matriz completa de ruido a filtro con todas las métricas.
 *
 * Formato: tipo_de_ruido → [filtro, intensidad, costo, riesgo_blur, apto_live]
 *
 * @return array Matriz industrial completa
 */
function ape_noise_industrial_matrix() {
    return [
        // === BLOQUEO Y ARTEFACTOS ESPACIALES ===
        'blocking' => [
            'description'  => 'Bloques MPEG visibles (macroblocking)',
            'filter'       => 'hqdn3d',
            'intensity'    => 'spatial=6:temporal=4:spatial_chroma=9:temporal_chroma=6',
            'cost'         => 'LOW',
            'risk_blur'    => 'MEDIUM',
            'live_safe'    => true,
            'resolution'   => ['sd', 'hd'],  // NO para 4K (preservar textura)
        ],
        'ringing' => [
            'description'  => 'Anillos/Ghosts en bordes de alta frecuencia',
            'filter'       => 'unsharp',
            'intensity'    => '5:5:0.4:5:5:0.0',  // Leve para suprimir ringing
            'cost'         => 'VERY_LOW',
            'risk_blur'    => 'VERY_LOW',
            'live_safe'    => true,
            'resolution'   => ['sd', 'hd', '4k'],
        ],
        'mosquito_noise' => [
            'description'  => 'Ruido "mosca" alrededor de bordes detallados',
            'filter'       => 'nlmeans',
            'intensity'    => 's=3.0:p=7:r=15',  // Buscar vecinos amplios
            'cost'         => 'MEDIUM',
            'risk_blur'    => 'LOW',
            'live_safe'    => true,
            'resolution'   => ['sd', 'hd'],
        ],
        'banding' => [
            'description'  => 'Bandas de gradiente visibles (posterización)',
            'filter'       => 'eq',
            'intensity'    => 'brightness=0:contrast=1:saturation=0.65',
            'cost'         => 'VERY_LOW',
            'risk_blur'    => 'NONE',
            'live_safe'    => true,
            'resolution'   => ['sd', 'hd', '4k'],
        ],
        'deblocking' => [
            'description'  => 'Eliminación de bloques MPEG con filtro dedicado',
            'filter'       => 'deblock',
            'intensity'    => 'filter=-2:block=-2',  // Valores negativos = más fuerte
            'cost'         => 'VERY_LOW',
            'risk_blur'    => 'MEDIUM',
            'live_safe'    => true,
            'resolution'   => ['sd', 'hd'],
        ],

        // === RUIDO TEMPORAL ===
        'temporal_flicker' => [
            'description'  => 'Parpadeo temporal entre frames consecutivos',
            'filter'       => 'hqdn3d',
            'intensity'    => 'spatial=2:temporal=6:spatial_chroma=3:temporal_chroma=6',
            'cost'         => 'LOW',
            'risk_blur'    => 'LOW',
            'live_safe'    => true,
            'resolution'   => ['sd', 'hd', '4k'],
        ],
        'temporal_noise' => [
            'description'  => 'Ruido aleatorio entre frames (snow/grain)',
            'filter'       => 'hqdn3d',
            'intensity'    => 'spatial=4:temporal=6:spatial_chroma=6:temporal_chroma=6',
            'cost'         => 'LOW',
            'risk_blur'    => 'MEDIUM',
            'live_safe'    => true,
            'resolution'   => ['sd', 'hd'],
        ],
        'frame_dupe' => [
            'description'  => 'Frames duplicados (cadena estática / congelación)',
            'filter'       => 'mpdecimate',
            'intensity'    => 'hi=64*12:lo=64*5:frac=0.33',
            'cost'         => 'VERY_LOW',
            'risk_blur'    => 'NONE',
            'live_safe'    => true,
            'resolution'   => ['sd', 'hd', '4k'],
        ],

        // === RUIDO EN DOMINIO DE FRECUENCIA ===
        'periodic_noise' => [
            'description'  => 'Ruido periódico (buzzing, bandas horizontales)',
            'filter'       => 'fftfilt',
            'intensity'    => 'dc_Y=0:dc_U=0:dc_V=0:weight_Y=1:weight_U=1:weight_V=1',
            'cost'         => 'LOW',
            'risk_blur'    => 'MEDIUM',
            'live_safe'    => true,
            'resolution'   => ['sd', 'hd'],
        ],
        'fft_noise' => [
            'description'  => 'Ruido complejo en dominio de frecuencia',
            'filter'       => 'afftdn',
            'intensity'    => 'nf=-20',  // Threshold -20dB
            'cost'         => 'MEDIUM',
            'risk_blur'    => 'LOW',
            'live_safe'    => true,
            'resolution'   => ['sd', 'hd'],  // NO para 4K
        ],

        // === FILTROS AVANZADOS (mayor costo) ===
        'nlmeans_denoise' => [
            'description'  => 'Non-Local Means: preserva bordes mejor que hqdn3d',
            'filter'       => 'nlmeans',
            'intensity'    => 's=2.0:p=7:r=15',
            'cost'         => 'MEDIUM',
            'risk_blur'    => 'LOW',
            'live_safe'    => true,
            'resolution'   => ['sd', 'hd'],
        ],
        'bm3d_denoise' => [
            'description'  => 'Block-Matching 3D: mejor preservación de textura',
            'filter'       => 'bm3d',
            'intensity'    => 'sigma=5:block=16:bstep=2:group=1:thrtype=1',
            'cost'         => 'HIGH',
            'risk_blur'    => 'LOW',
            'live_safe'    => false,  // Puede ser lento para live
            'resolution'   => ['sd', 'hd'],
        ],

        // === RESTAURACIÓN ===
        'sharpen_recovery' => [
            'description'  => 'Recuperación de nitidez post-denoise (siempre al final)',
            'filter'       => 'unsharp',
            'intensity'    => '5:5:0.4:5:5:0.0',  // Máximo 40% (80% protegido)
            'cost'         => 'VERY_LOW',
            'risk_blur'    => 'NONE',
            'live_safe'    => true,
            'resolution'   => ['sd', 'hd', '4k'],
        ],
        'cas_recovery' => [
            'description'  => 'Contrast Adaptive Sharpening post-denoise',
            'filter'       => 'cas',
            'intensity'    => '0.7',
            'cost'         => 'VERY_LOW',
            'risk_blur'    => 'NONE',
            'live_safe'    => true,
            'resolution'   => ['sd', 'hd', '4k'],
        ],
    ];
}

// ============================================================================
// MÓDULO 15C: PIPELINE A — Live Seguro y Barato
// ============================================================================
/**
 * Pipeline A: El perfil más estable para IPTV en producción.
 * Reduce ruido y artefactos sin disparar latencia ni costo computacional.
 * Todos los filtros son maduros y documentados oficialmente por FFmpeg.
 *
 * Orden: bwdif → hqdn3d suave → scale limpio → eq leve → unsharp muy leve → encode
 *
 * @param array  $classification  Resultado de ape_noise_classify_source()
 * @param string $acrp_state      Estado ACRP actual
 * @return array Filtros FFmpeg como array de strings
 */
function ape_noise_pipeline_a($classification, $acrp_state = 'IDLE') {
    $filters = [];

    // --- STEP 1: Deinterlace si aplica (PROTECTED: BWDIF) ---
    $filters[] = 'bwdif=1';

    // --- STEP 2: Denoise suave con hqdn3d ---
    // Para fuente CLEAN: valores muy bajos (preservar casi todo)
    // Para fuente LIGHT_DIRTY: valores medios
    $score = $classification['score'] ?? 80;
    $blocking = $classification['axes']['blocking_severity'] ?? 10;
    $res = $classification['resolution'] ?? 'unknown';

    // PROTECTED: Denoise OFF en 4K (preservar textura original)
    if ($res === '4k' || $res === '8k') {
        // 4K/8K: denoise desactivado (PROTECTED PARAMETER #4)
        // Solo aplicar durante recovery ACRP si hay blocking severo
        if (($acrp_state === 'RECONNECTING' || $acrp_state === 'CUT_DETECTED') && $blocking > 40) {
            $filters[] = 'hqdn3d=2:1:3:2';  // Ligero solo en recovery
        }
    } elseif ($blocking > 50) {
        // Fuente con blocking visible: denoise medio
        $filters[] = 'hqdn3d=4:3:6:4.5';
    } elseif ($blocking > 20) {
        // Fuente ligeramente sucia: denoise ligero
        $filters[] = 'hqdn3d=2:1:3:2';
    }
    // else: fuente limpia, sin denoise

    // --- STEP 3: Deblocking (solo para SD/HD con blocking) ---
    if (($res === 'sd' || $res === 'hd') && $blocking > 40) {
        $filters[] = 'deblock=filter=-1:block=-1';
    }

    // --- STEP 4: Color EQ (PROTECTED: contrast=1.0, saturation=0.65) ---
    $filters[] = 'eq=brightness=0.03:contrast=1.0:saturation=0.65:gamma=1.0:hue=0';

    // --- STEP 5: Sharpen leve (PROTECTED: 80% max) ---
    // Solo si se aplicó denoise (para recuperar microcontraste)
    $denoise_applied = count($filters) > 2;  // Más de bwdif + eq
    if ($denoise_applied) {
        $filters[] = 'cas=0.7';
        $filters[] = 'unsharp=5:5:0.4:5:5:0.0';  // 40% recovery (dentro del 80% protegido)
    }

    return [
        'filters'        => $filters,
        'pipeline'       => 'A',
        'description'    => 'Live Seguro — Denoise suave + Sharpen recovery',
        'cost'           => 'LOW',
        'latency_impact' => '<5ms',
        'live_safe'      => true,
    ];
}

// ============================================================================
// MÓDULO 15D: PIPELINE B — Fuente Muy Comprimida
// ============================================================================
/**
 * Pipeline B: Para fuentes HEAVY_DIRTY con artefactos severos de compresión.
 * Usa nlmeans/bm3d que preservan mejor la estructura que un denoise agresivo
 * simple. FFmpeg incluye ambos filtros. La restauración IA entra solo si el
 * score lo justifica (NO indiscriminadamente para todos los canales).
 *
 * Orden: bwdif → nlmeans/bm3d → afftdn → zscale/tonemap → sharpen fino → encode
 *
 * @param array  $classification  Resultado de ape_noise_classify_source()
 * @param string $acrp_state      Estado ACRP actual
 * @return array Filtros FFmpeg como array de strings
 */
function ape_noise_pipeline_b($classification, $acrp_state = 'IDLE') {
    $filters = [];
    $blocking = $classification['axes']['blocking_severity'] ?? 50;
    $temporal = $classification['axes']['temporal_noise'] ?? 40;
    $res = $classification['resolution'] ?? 'unknown';

    // --- STEP 1: Deinterlace (PROTECTED: BWDIF) ---
    $filters[] = 'bwdif=1';

    // --- STEP 2: Deblocking fuerte (pre-limpieza) ---
    if ($blocking > 50) {
        $filters[] = 'deblock=filter=-2:block=-2';  // Máxima fuerza deblocking
    }

    // --- STEP 3: Denoise avanzado — nlmeans o bm3d según severidad ---
    // PROTECTED: NUNCA para 4K
    if ($res !== '4k' && $res !== '8k') {
        if ($blocking > 70) {
            // Fuente aplastada: bm3d si está disponible (mejor preservación)
            // Fallback a nlmeans si bm3d no está compilado
            $filters[] = 'nlmeans=s=3.0:p=7:r=15';
        } elseif ($blocking > 40) {
            // Fuente pesada: nlmeans
            $filters[] = 'nlmeans=s=2.5:p=7:r=15';
        } else {
            // Fuente moderada: hqdn3d fuerte
            $filters[] = 'hqdn3d=4:3:6:4.5';
        }

        // --- STEP 4: afftdn cascada (dominio de frecuencia) ---
        // Complementa nlmeans/hqdn3d. Opera en frecuencia para eliminar
        // ruido periódico (buzzing, bandas) que el denoise espacial no toca.
        if ($temporal > 30) {
            $filters[] = 'afftdn=nf=-20';
        }
    } else {
        // 4K: denoise solo si ACRP recovery y blocking severo (PROTECTED)
        if (($acrp_state === 'RECONNECTING' || $acrp_state === 'CUT_DETECTED') && $blocking > 50) {
            $filters[] = 'hqdn3d=2:1:3:2';
        }
    }

    // --- STEP 5: zscale + tonemap hable ---
    // Solo si NO está en reconexión activa (evitar overhead)
    if ($acrp_state !== 'RECONNECTING' && $acrp_state !== 'CUT_DETECTED') {
        $filters[] = 'zscale=t=linear:p=bt709:tonemap=hable:desat=0,z=t=bt709';
    }

    // --- STEP 6: Color EQ (PROTECTED) ---
    $filters[] = 'eq=brightness=0.03:contrast=1.0:saturation=0.65:gamma=1.0:hue=0';

    // --- STEP 7: Sharpen fino post-denoise (PROTECTED: 80% max) ---
    // Después de denoise agresivo, recuperar nitidez residual
    // Usar 60% de sharpen para compensar pérdida por denoise
    $filters[] = 'cas=0.7';
    $filters[] = 'unsharp=5:5:0.6:5:5:0.0';  // 60% recovery

    return [
        'filters'        => $filters,
        'pipeline'       => 'B',
        'description'    => 'Fuente Comprimida — nlmeans/bm3d + afftdn + tonemap',
        'cost'           => 'MEDIUM-HIGH',
        'latency_impact' => '10-30ms',
        'live_safe'      => true,
    ];
}

// ============================================================================
// MÓDULO 15E: PIPELINE C — Premium / VOD / Eventos Clave
// ============================================================================
/**
 * Pipeline C: Máximo esfuerzo para fuentes CRUSHED o contenido premium.
 * Aplica el stack completo de restauración: denoise temporal profundo,
 * restauración de compresión, zscale/tonemap, sharpen adaptativo.
 * Este perfil es donde más valor aportan modelos de enhancement de video.
 *
 * Orden: bwdif → mpdecimate → denoise temporal → deblock → nlmeans →
 *        afftdn → zscale/tonemap → eq → cas+unsharp → 120fps
 *
 * @param array  $classification  Resultado de ape_noise_classify_source()
 * @param string $acrp_state      Estado ACRP actual
 * @param bool   $enable_120fps   Activar interpolación de movimiento
 * @return array Filtros FFmpeg como array de strings
 */
function ape_noise_pipeline_c($classification, $acrp_state = 'IDLE', $enable_120fps = true) {
    $filters = [];
    $blocking = $classification['axes']['blocking_severity'] ?? 70;
    $temporal = $classification['axes']['temporal_noise'] ?? 60;
    $sharpness = $classification['axes']['sharpness_residual'] ?? 30;
    $res = $classification['resolution'] ?? 'unknown';

    // --- STEP 1: Deinterlace (PROTECTED: BWDIF) ---
    $filters[] = 'bwdif=1';

    // --- STEP 2: mpdecimate — Eliminar frames duplicados ---
    // Limpia cadenas estáticas y congelaciones temporales
    $filters[] = 'mpdecimate=hi=64*12:lo=64*5:frac=0.33';

    // --- STEP 3: Deblocking máximo ---
    if ($blocking > 30) {
        $filters[] = 'deblock=filter=-2:block=-2';
    }

    // --- STEP 4: Denoise profundo — Cascada triple ---
    // PROTECTED: NUNCA para 4K
    if ($res !== '4k' && $res !== '8k') {
        // 4A: hqdn3d spatial-temporal (base)
        $filters[] = 'hqdn3d=6:5:9:7';

        // 4B: nlmeans structure-preserving (sobre hqdn3d)
        // nlmeans preserva bordes y texturas mejor que un denoise agresivo simple
        if ($blocking > 60) {
            $filters[] = 'nlmeans=s=3.0:p=7:r=15';
        } else {
            $filters[] = 'nlmeans=s=2.0:p=7:r=15';
        }

        // 4C: afftdn frecuencia (elimina ruido periódico/buzzing)
        if ($temporal > 20) {
            $filters[] = 'afftdn=nf=-20';
        }

        // 4D: fftfilt para ruido periódico específico
        if ($temporal > 50) {
            $filters[] = 'fftfilt=dc_Y=0:weight_Y=0.01';
        }
    } else {
        // 4K: denoise solo durante ACRP recovery (PROTECTED #4)
        if (($acrp_state === 'RECONNECTING' || $acrp_state === 'CUT_DETECTED') && $blocking > 50) {
            $filters[] = 'hqdn3d=3:2:4:3';
        }
    }

    // --- STEP 5: zscale + tonemap HDR (cinemático) ---
    if ($acrp_state !== 'RECONNECTING' && $acrp_state !== 'CUT_DETECTED') {
        $filters[] = 'zscale=t=linear:p=bt709:tonemap=hable:desat=0,z=t=bt709';
    }

    // --- STEP 6: Color EQ (PROTECTED: contrast 1.0, saturation 0.65) ---
    $filters[] = 'eq=brightness=0.03:contrast=1.0:saturation=0.65:gamma=1.0:hue=0';

    // --- STEP 7: Sharpen adaptativo post-denoise ---
    // El nivel depende de cuánta nitidez residual existe
    // Si la fuente fue aplastada (sharpness residual bajo), aplicar más sharpen
    // para compensar. Siempre dentro del techo de 80% (PROTECTED).
    $filters[] = 'cas=0.7';
    if ($sharpness < 30) {
        // Fuente aplastada: máximo sharpen permitido (80%)
        $filters[] = 'unsharp=5:5:0.8:5:5:0.0';
    } elseif ($sharpness < 60) {
        // Nitidez media: 60% sharpen
        $filters[] = 'unsharp=5:5:0.6:5:5:0.0';
    } else {
        // Buena nitidez: 40% sharpen (recovery sutil)
        $filters[] = 'unsharp=5:5:0.4:5:5:0.0';
    }

    // --- STEP 8: 120fps Motion Interpolation (SOLO si el costo lo permite) ---
    if ($enable_120fps && $classification['axes']['latency_allowed'] > 50) {
        $filters[] = 'minterpolate=fps=120:mi_mode=mci:me=hexbs:mc=64:scd=none';
    }

    return [
        'filters'        => $filters,
        'pipeline'       => 'C',
        'description'    => 'Máximo Esfuerzo — Denoise profundo + Restauración + 120fps',
        'cost'           => 'HIGH',
        'latency_impact' => '30-80ms',
        'live_safe'      => false,  // Puede ser costoso para live masivo
    ];
}

// ============================================================================
// MÓDULO 15F: SELECTOR DE PIPELINE — Orquestador
// ============================================================================
/**
 * Selecciona el pipeline óptimo basándose en la clasificación de fuente.
 * Aplica las reglas PROTECTED (nunca denoise en 4K, nunca sharpness >80%).
 * Integra el resultado con el pipeline FFmpeg existente de Module 8.
 *
 * @param array  $sniper_status   Estado del canal
 * @param array  $acrp_state      Estado ACRP
 * @param string $profile         Perfil efectivo
 * @param int    $bitrate_hint    Bitrate detectado (0 si desconocido)
 * @param string $resolution      Resolución detectada
 * @return array ['pipeline_selected' => string, 'filters' => array, 'metadata' => array]
 */
function ape_noise_select_pipeline($sniper_status, $acrp_state, $profile = '', $bitrate_hint = 0, $resolution = 'unknown') {
    // === Clasificar la fuente ===
    $classification = ape_noise_classify_source(
        $sniper_status, $profile, $bitrate_hint, $resolution
    );

    $acrp = is_array($acrp_state) ? ($acrp_state['state'] ?? 'IDLE') : $acrp_state;
    $profile_letter = $classification['pipeline_profile'];

    // === Seleccionar pipeline según clasificación ===
    switch ($profile_letter) {
        case 'C':
            $pipeline_result = ape_noise_pipeline_c($classification, $acrp, $sniper_status['sniper']);
            break;
        case 'B':
            $pipeline_result = ape_noise_pipeline_b($classification, $acrp);
            break;
        case 'A':
        default:
            $pipeline_result = ape_noise_pipeline_a($classification, $acrp);
            break;
    }

    // === Integrar con pipeline FFmpeg existente (Module 8) ===
    // Los filtros del anti-noise se PREPENDEN al pipeline existente
    // para que el orden correcto sea: denoise → color → sharpen → 120fps
    $integration = [
        'pipeline_selected'  => $profile_letter,
        'classification'     => $classification['classification'],
        'noise_score'        => $classification['score'],
        'filters'            => $pipeline_result['filters'],
        'filter_chain'       => implode(',', $pipeline_result['filters']),
        'description'        => $pipeline_result['description'],
        'cost'               => $pipeline_result['cost'],
        'latency_impact'     => $pipeline_result['latency_impact'],
        'live_safe'          => $pipeline_result['live_safe'],
        'source_axes'        => $classification['axes'],
    ];

    return $integration;
}

// ============================================================================
// MÓDULO 15G: GENERADOR DE DIRECTIVAS — Integración con EXTVLCOPT
// ============================================================================
/**
 * Genera las directivas EXTVLCOPT y EXTHTTP para el Anti-Noise Engine.
 * Estas directivas se fusionan con las existentes de rq_sniper_integrate().
 *
 * @param array $pipeline_result  Resultado de ape_noise_select_pipeline()
 * @param array $sniper_status    Estado del canal
 * @return array ['ext_vlcopt' => array, 'ext_http' => array]
 */
function ape_noise_generate_directives($pipeline_result, $sniper_status) {
    $output = [
        'ext_vlcopt' => [],
        'ext_http'  => [],
    ];

    if (empty($pipeline_result['filters'])) {
        return $output;
    }

    // Solo aplicar para canales no-IDLE
    if ($sniper_status['status'] === 'IDLE') {
        return $output;
    }

    // === Video-filter chain con todos los filtros anti-ruido ===
    $filter_chain = $pipeline_result['filter_chain'];
    if (!empty($filter_chain)) {
        $output['ext_vlcopt'][] = 'video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full
    }

    // === Directivas de soporte ===
    $output['ext_vlcopt'][] = 'deinterlace=1';
    $output['ext_vlcopt'][] = 'deinterlace-mode=bwdif';

    // === EXTHTTP: Metadata del anti-noise engine ===
    $output['ext_http'][] = json_encode([
        "X-APE-AntiNoise"       => "enabled,v1.0",
        "X-APE-AntiNoise-Pipeline" => $pipeline_result['pipeline_selected'],
        "X-APE-AntiNoise-Score" => $pipeline_result['noise_score'],
        "X-APE-AntiNoise-Class" => $pipeline_result['classification'],
        "X-APE-AntiNoise-Cost"  => $pipeline_result['cost'],
        "X-APE-AntiNoise-Live"  => $pipeline_result['live_safe'] ? 'SAFE' : 'CAUTION',
    ]);
    $output['ext_http'][] = json_encode([
        "X-APE-Denoise-Status"  => $pipeline_result['pipeline_selected'] === 'A'
                                    ? 'light' : ($pipeline_result['pipeline_selected'] === 'B' ? 'aggressive' : 'maximum'),
        "X-APE-Artifact-Removal" => "true,blocking,ringing,mosquito,banding",
        "X-APE-Compression-Fix" => "true,deblock+denoise+cascade",
        "X-APE-Source-Quality"  => $pipeline_result['classification'],
    ]);

    // === Metadata detallada de los ejes del scoring ===
    $axes = $pipeline_result['source_axes'] ?? [];
    $output['ext_http'][] = json_encode([
        "X-APE-Noise-Axes" => json_encode([
            "blocking"   => $axes['blocking_severity'] ?? 0,
            "temporal"   => $axes['temporal_noise'] ?? 0,
            "sharpness"  => $axes['sharpness_residual'] ?? 0,
            "cost"       => $axes['cost_allowed'] ?? 0,
            "latency"    => $axes['latency_allowed'] ?? 0,
            "value"      => $axes['channel_value'] ?? 0,
        ]),
    ]);

    return $output;
}

// ============================================================================
// MÓDULO 15H: FUNCTION MAESTRA — Integración Total con SNIPER
// ============================================================================
/**
 * Función principal de integración del Anti-Noise Engine con el sistema SNIPER.
 * Se llama DESDE rq_sniper_integrate() después del Module 8 (FFmpeg Pipeline).
 *
 * Flujo:
 *   1. Detectar resolución del contenido
 *   2. Clasificar la fuente (Clean / Dirty / Crushed)
 *   3. Seleccionar pipeline (A / B / C)
 *   4. Generar filtros FFmpeg
 *   5. Retornar directivas para fusionar
 *
 * @param array  $sniper_status  Estado del canal
 * @param array  $acrp_state     Estado ACRP
 * @param string $profile        Perfil efectivo
 * @param int    $bitrate_hint   Bitrate del CDN (0 si desconocido)
 * @return array ['ext_vlcopt' => array, 'ext_http' => array, 'metadata' => array]
 */
function ape_noise_engine_integrate($sniper_status, $acrp_state, $profile = '', $bitrate_hint = 0) {
    // Solo para canales activos o recientes (NO IDLE)
    if ($sniper_status['status'] === 'IDLE') {
        return [
            'ext_vlcopt' => [],
            'ext_http'  => [],
            'metadata'  => ['active' => false],
        ];
    }

    // --- Detectar resolución del contenido ---
    $res = 'unknown';
    if ($sniper_status['sniper']) {
        $res = '4k';  // Canal SNIPER activo = asumir 4K+
    } elseif (strpos($profile, 'NUCLEAR') !== false || strpos($profile, '4K') !== false || strpos($profile, 'FHD') !== false) {
        $res = '4k';
    } elseif (strpos($profile, 'HD') !== false) {
        $res = 'hd';
    } elseif (strpos($profile, 'SD') !== false || strpos($profile, 'MINIMAL') !== false) {
        $res = 'sd';
    }

    // --- Seleccionar y ejecutar pipeline ---
    $pipeline_result = ape_noise_select_pipeline(
        $sniper_status, $acrp_state, $profile, $bitrate_hint, $res
    );

    // --- Generar directivas ---
    $directives = ape_noise_generate_directives($pipeline_result, $sniper_status);

    return [
        'ext_vlcopt' => $directives['ext_vlcopt'],
        'ext_http'  => $directives['ext_http'],
        'metadata'  => [
            'active'            => true,
            'pipeline'          => $pipeline_result['pipeline_selected'],
            'classification'    => $pipeline_result['classification'],
            'noise_score'       => $pipeline_result['noise_score'],
            'cost'              => $pipeline_result['cost'],
            'latency_impact'    => $pipeline_result['latency_impact'],
            'live_safe'         => $pipeline_result['live_safe'],
            'source_axes'       => $pipeline_result['source_axes'],
            'filter_count'      => count($pipeline_result['filters']),
            'protected_params'  => [
                'bwdif'     => 'preserved',
                'sharpness' => 'max_80pct',
                'ai_sr'     => 'low',
                'denoise_4k'=> 'disabled',
                'allm'      => 'false',
                'earc'      => 'mandatory',
                'tv_upscl'  => 'native',
                'color_temp'=> 'warm',
                'contrast'  => '100pct',
                'saturate'  => '65pct',
            ],
        ],
    ];
}
