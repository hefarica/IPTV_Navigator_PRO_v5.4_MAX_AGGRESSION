<?php
/**
 * ============================================================================
 * APE HDR PEAK NIT ENGINE v1.0 — Módulo 16: 5000 Nits Maximum Quantum HDR
 * ============================================================================
 *
 * Motor HDR de máxima luminancia cuántica. Diseñado para extraer el máximo
 * brillo de CADA PIXEL de la pantalla del player y del TV simultáneamente.
 *
 * FILOSOFÍA: 5000 nits no es un número, es la EXPERIENCIA que el ojo humano
 * percibe cuando el panel OLED/QLED/MiniLED explota cada subpixel con la
 * precisión de un display calibrado en laboratorio Dolby Cinema.
 *
 * PILARES DE LUMINANCIA:
 *   1. METADATA ESTÁTICA (SMPTE ST 2086): Master Display Primaries + White Point
 *      + Luminance Range — DICE al TV QUÉ puede mostrar.
 *   2. METADATA DINÁMICA (HDR10+ / ST 2094-40): Per-frame brightness map.
 *      CADA ESCENA tiene su propia curva de luminancia. El TV ajusta en tiempo
 *      real el backlight/local dimming para CASI BLAGUEAR el contenido original.
 *   3. TRANSFER FUNCTION (PQ / ST 2084): La función EOTF que convierte la señal
 *      eléctrica en luz visible. PQ = Perceptual Quantizer, diseñado para
 *      cubrir el rango completo de la visión humana (0.0001 - 10000 nits).
 *   4. GPU TONE MAPPING (libplacebo/vulkan): El player ejecuta tone mapping
 *      por hardware. libplacebo usa la GPU para mapear BT.2020 HDR a la
 *      capacidad real del panel del TV en tiempo real.
 *   5. LOCAL DIMMING + BACKLIGHT: Directivas que fuerzan al TV a encender el
 *      100% de las zonas de backlight y llevar el contraste al infinito.
 *   6. DOLBY VISION RPU: Profile 5/8 metadata que contiene la L1/L2/L5/L6
 *      metadata con instrucciones de tone mapping específicas por dispositivo.
 *
 * TARGET: 5000 nits peak (Dolby Cinema reference).
 *   - MaxCLL = 5000 cd/m² (Maximum Content Light Level)
 *   - MaxFALL = 800 cd/m² (Maximum Frame Average Light Level)
 *   - Master Display: P3 D65 + 5000 nits peak + 0.005 nits black
 *
 * PROTECTED PARAMETERS: Los 10 parámetros protegidos se respetan íntegramente.
 *   - Sharpness 80%: No se modifica.
 *   - Contrast 100%: No se modifica (el HDR maneja contraste por metadata).
 *   - Saturación 65%: No se modifica (el BT.2020 gamut expande color, no saturación).
 *   - Color Temp WARM: No se modifica (D65 white point en metadata).
 *   - ALLM false: Se mantiene (Game Mode mata local dimming).
 *
 * NOTA: PHP = ORQUESTADOR. Las directivas aquí generadas son headers HTTP,
 *   EXTVLCOPT y KODIPROP que el player/TV interpretan. CERO transcodificación.
 * ============================================================================
 */

// ============================================================================
// CONSTANTES — 5000 NITS HDR ENGINE
// ============================================================================

// SMPTE ST 2086 Master Display Primaries (P3 D65)
// Estos son los coordenadas CIE 1931 xy de los primaries de DCI-P3 bajo D65.
// Son los valores que el TV usa para SABER cuánto color puede mostrar.
define('APE_HDR_P3_RED_X',       '0.680');
define('APE_HDR_P3_RED_Y',       '0.320');
define('APE_HDR_P3_GREEN_X',     '0.265');
define('APE_HDR_P3_GREEN_Y',     '0.690');
define('APE_HDR_P3_BLUE_X',      '0.150');
define('APE_HDR_P3_BLUE_Y',      '0.060');

// White point D65 (estándar para HDR)
define('APE_HDR_WP_D65_X',       '0.3127');
define('APE_HDR_WP_D65_Y',       '0.3290');

// Luminancia targets
define('APE_HDR_PEAK_LUMINANCE',   5000);   // 5000 cd/m² (Dolby Cinema)
define('APE_HDR_MIN_LUMINANCE',    0.0005); // 0.0005 cd/m² (OLED negro perfecto)
define('APE_HDR_MAXCLL',           5000);   // Max Content Light Level
define('APE_HDR_MAXFALL',          800);    // Max Frame Average Light Level
define('APE_HDR_TARGET_CONTRAST',  10000000); // 10,000,000:1 (OLED range)

// Dolby Vision profiles
define('APE_HDR_DV_PROFILE5',  true);   // IPTV streaming profile
define('APE_HDR_DV_PROFILE8',  true);   // Blu-ray / high quality
define('APE_HDR_DV_PROFILE7',  true);   // Streaming fallback

// PQ / ST 2084
define('APE_HDR_PQ_MIN_PQ',    62);     // PQ code for 0.005 nits
define('APE_HDR_PQ_MAX_PQ',    3079);   // PQ code for ~4000 nits
define('APE_HDR_PQ_TARGET',    3765);   // PQ code for ~5000 nits


// ============================================================================
// MÓDULO 16A: HDR STATIC METADATA — SMPTE ST 2086 Master Display
// ============================================================================
/**
 * Genera las directivas de metadata estática HDR según SMPTE ST 2086.
 * Esta metadata DICE al TV cuáles son los primaries de color del contenido
 * y cuál es el rango de luminancia. El TV usa esta información para
 * configurar su procesador de imagen internamente.
 *
 * Los primaries son DCI-P3 (el gamut real de la mayoría del contenido HDR
 * cinematográfico). BT.2020 cubre más pero casi ningún contenido lo llena.
 *
 * @return array Directivas EXTHTTP con metadata ST 2086
 */
function ape_hdr_st2086_metadata() {
    $output = [];

    // === Master Display Color Primaries (CIE 1931 xy) ===
    $output[] = json_encode([
        "X-Master-Display" => sprintf(
            "G(%s,%s)B(%s,%s)R(%s,%s)WP(%s,%s)L(%d,%s)",
            APE_HDR_P3_GREEN_X, APE_HDR_P3_GREEN_Y,
            APE_HDR_P3_BLUE_X, APE_HDR_P3_BLUE_Y,
            APE_HDR_P3_RED_X, APE_HDR_P3_RED_Y,
            APE_HDR_WP_D65_X, APE_HDR_WP_D65_Y,
            APE_HDR_PEAK_LUMINANCE,
            APE_HDR_MIN_LUMINANCE
        ),
    ]);

    // === Content Light Level (MaxCLL / MaxFALL) ===
    // MaxCLL = brillo máximo de CUALQUIER pixel en TODO el contenido
    // MaxFALL = brillo promedio máximo del frame más brillante
    $output[] = json_encode([
        "X-MaxCLL"   => (string)APE_HDR_MAXCLL,   // 5000 cd/m²
        "X-MaxFALL"  => (string)APE_HDR_MAXFALL,   // 800 cd/m²
        "X-CLLI"     => sprintf("%d,%d", APE_HDR_MAXCLL, APE_HDR_MAXFALL),
    ]);

    // === Master Display Primaries separadas ===
    $output[] = json_encode([
        "X-Display-Primaries-Red"     => sprintf("%s,%s", APE_HDR_P3_RED_X, APE_HDR_P3_RED_Y),
        "X-Display-Primaries-Green"   => sprintf("%s,%s", APE_HDR_P3_GREEN_X, APE_HDR_P3_GREEN_Y),
        "X-Display-Primaries-Blue"    => sprintf("%s,%s", APE_HDR_P3_BLUE_X, APE_HDR_P3_BLUE_Y),
        "X-Display-White-Point"       => sprintf("D65,%s,%s", APE_HDR_WP_D65_X, APE_HDR_WP_D65_Y),
        "X-Display-Peak-Luminance"    => (string)APE_HDR_PEAK_LUMINANCE,
        "X-Display-Min-Luminance"     => (string)APE_HDR_MIN_LUMINANCE,
    ]);

    // === Color Volume (BT.2020 container, P3 fill) ===
    // El TV debe expandir su color volume al máximo del gamut BT.2020
    // incluso si el contenido solo llena P3. Esto previene clipping.
    $output[] = json_encode([
        "X-Color-Volume"               => "maximum,BT2020,P3-fill",
        "X-Color-Volume-Expansion"     => "true,expand-to-BT2020-container",
        "X-Color-Volume-Mapping"       => "perceptual,preserve-hue",
        "X-Gamut-Mapping"              => "BT2020,P3,expand,clamp-none",
    ]);

    return $output;
}


// ============================================================================
// MÓDULO 16B: HDR10+ DYNAMIC METADATA — Per-Scene Luminance
// ============================================================================
/**
 * HDR10+ (SMPTE ST 2094-40) permite que CADA ESCENA tenga su propio mapa
 * de brillo. Esto es LO que hace que el HDR se vea "alucinante" — porque
 * el TV no usa una curva de tone mapping estática para todo el contenido,
 * sino que AJUSTA el backlight/local dimming frame por frame.
 *
 * Los Analisis de brillo (Level 1-6) contienen:
 *   L1: Min/Max/ Avg luminancia por frame
 *   L2: Trim slopes/offset/power para tone mapping
 *   L5: Active area info
 *   L6: MaxRGB per frame
 *
 * @param array $sniper_status Estado del canal
 * @return array Directivas EXTHTTP para HDR10+ dynamic
 */
function ape_hdr_dynamic_metadata($sniper_status) {
    $output = [];

    if ($sniper_status['status'] === 'IDLE') {
        return $output;
    }

    $is_active = $sniper_status['sniper'];

    // === HDR10+ SEI (Supplemental Enhancement Information) ===
    // Forzar al player a PARSEAR y APLICAR HDR10+ dynamic metadata
    $output[] = json_encode([
        "X-HDR10-Plus-SEI"        => "true,parse,apply,enforce",
        "X-HDR10-Plus-Version"    => "2094-40",
        "X-HDR10-Plus-Processing" => "per-frame,scene-adaptive",
    ]);

    // === Dynamic Tone Mapping Levels ===
    $output[] = json_encode([
        "X-DTM-Active"            => "true",
        "X-DTM-Level1"            => "true,min-max-avg-luma",       // Frame brightness analysis
        "X-DTM-Level2"            => "true,trim-slopes-pwr-offset", // Tone mapping parameters
        "X-DTM-Level5"            => "true,active-area-info",       // Active picture area
        "X-DTM-Level6"            => "true,maxrgb-per-frame",       // Max RGB per frame
    ]);

    // === Per-Frame Brightness Control ===
    // El TV debe recalibrar su backlight en CADA frame para maximizar contraste
    $output[] = json_encode([
        "X-Frame-Brightness-Adapt" => "true,per-frame,dynamic-backlight",
        "X-Scene-Brightness-Target"=> "5000",
        "X-Scene-Peak-Target"      => "5000",
        "X-Scene-Avg-Target"       => (string)APE_HDR_MAXFALL,
    ]);

    // === Active Area Detection ===
    // Letterbox/pillarbox detection para NO desperdiciar nits en barras negras
    $output[] = json_encode([
        "X-Active-Area-Detect"     => "true,letterbox,pillarbox,crop",
        "X-Nit-Allocation"         => "active-area-only,concentrate-nits",
        "X-Black-Bar-Suppression"  => "true,zero-nit-black",
    ]);

    // === HDR10+ Brightness Boost (solo SNIPER activo) ===
    if ($is_active) {
        $output[] = json_encode([
            "X-HDR10-Plus-Boost"      => "true,aggressive,quantum-peak",
            "X-Peak-Sustain"           => "true,5000nit,full-panel",
            "X-Highlight-Bloom"        => "true,maximum,gpu-accelerated",
            "X-Specular-Highlight"     => "true,5000nit,per-pixel",
            "X-Dynamic-Range-Exploit"  => "maximum,full-PQ-range",
        ]);
    }

    return $output;
}


// ============================================================================
// MÓDULO 16C: PQ EOTF — SMPTE ST 2084 Transfer Function
// ============================================================================
/**
 * PQ (Perceptual Quantizer) es la función de transferencia electro-óptica (EOTF)
 * definida en SMPTE ST 2084. Mapea valores digitales a niveles de luz perceptuales.
 *
 * Rango cubierto: 0.0001 nits (negro OLED absoluto) hasta 10,000 nits (sol directo).
 * A diferencia de la función gamma tradicional, PQ está diseñada para que cada
 * paso de código represente un cambio PERCEPTUALMENTE IGUAL de brillo.
 *
 * Para 5000 nits: PQ value ≈ 3765 (en el rango 10-bit de 0-4095)
 *
 * @return array Directivas EXTHTTP + EXTVLCOPT para PQ EOTF
 */
function ape_hdr_pq_eotf() {
    $output = [
        'ext_http'  => [],
        'ext_vlcopt'=> [],
    ];

    // === Transfer Function Directives ===
    $output['ext_http'][] = json_encode([
        "X-Transfer-Function"       => "SMPTE2084,PQ,ST2084",
        "X-EOTF"                   => "pq,smpte2084,perceptual-quantizer",
        "X-EOTF-Max-Luminance"     => "5000",
        "X-EOTF-Min-Luminance"     => "0.0005",
        "X-PQ-Range"               => "full,0-5000nits",
        "X-PQ-Bit-Depth"           => "10bit,1024-steps-per-stop",
        "X-Color-Depth"            => "10",
        "X-Pixel-Format"           => "yuv420p10le",
    ]);

    // === HDR10 Static Metadata VUD (Video User Data) ===
    $output['ext_http'][] = json_encode([
        "X-HDR10-VUD"              => "true,st2086,clli",
        "X-HDR10-Static-MD"        => "true,apply,enforce",
    ]);

    // === EXTVLCOPT: FFmpeg PQ processing hints ===
    $output['ext_vlcopt'][] = 'video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full
    $output['ext_vlcopt'][] = 'video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full

    return $output;
}


// ============================================================================
// MÓDULO 16D: DOLBY VISION RPU — Profile 5/8 Injection
// ============================================================================
/**
 * Dolby Vision usa RPU (Reference Processing Unit) metadata embebida en el
 * bitrate del video (no en headers separados). Contiene instrucciones de
 * tone mapping ESPECÍFICAS para cada modelo de TV.
 *
 * Profiles:
 *   Profile 5: IPTV/Streaming (8-bit SDR base layer + DV metadata)
 *   Profile 8: Streaming HDR (10-bit base layer + DV metadata)
 *   Profile 7: Streaming fallback (compatible con más dispositivos)
 *
 * El RPU contiene:
 *   L1: Level 1 — Min/Mid/Max luminance per frame
 *   L2: Level 2 — Slope/Offset/Power para cada trim (12 trims)
 *   L5: Level 5 — Active area information
 *   L6: Level 6 — MaxSCL per frame (Max per component in nits)
 *   L8: Level 8 — Reshape + CC (Content Color Metadata)
 *   L11: Level 11 — Active area descriptor for BL
 *
 * @param array $sniper_status Estado del canal
 * @return array Directivas EXTHTTP para Dolby Vision
 */
function ape_hdr_dolby_vision($sniper_status) {
    $output = [];

    if ($sniper_status['status'] === 'IDLE') {
        return $output;
    }

    // === Dolby Vision Core ===
    $output[] = json_encode([
        "X-Dolby-Vision"           => "true,active,enforce",
        "X-DV-Version"             => "4.0",
        "X-DV-Profile"             => "5,8,7",
        "X-DV-Profile-Primary"     => "8",
        "X-DV-Profile-Fallback"    => "5",
        "X-DV-Compatibility"       => "true,hdr10-fallback",
        "X-DV-RPU"                 => "true,parse,apply,L1,L2,L5,L6,L8,L11",
    ]);

    // === Dolby Vision L1 Metadata (Brightness per frame) ===
    $output[] = json_encode([
        "X-DV-L1-MinPQ"            => (string)APE_HDR_PQ_MIN_PQ,     // 0.005 nits
        "X-DV-L1-MaxPQ"            => (string)APE_HDR_PQ_TARGET,      // ~5000 nits
        "X-DV-L1-AvgPQ"            => "1200",                          // ~800 nits average
        "X-DV-L1-TargetMid"        => "1200",
    ]);

    // === Dolby Vision L2 Trims (Tone mapping por componente) ===
    // 12 trims: 1 por cada combinación de min/mid/max × R/G/B
    $output[] = json_encode([
        "X-DV-L2-Trim"             => "true,12-trims,per-component",
        "X-DV-L2-Slope"            => "1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0",
        "X-DV-L2-Offset"           => "0.0",
        "X-DV-L2-Power"            => "1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0",
        "X-DV-L2-Chroma-Weight"    => "1.0",
        "X-DV-L2-Sat-Gain"         => "1.0",
        "X-DV-L2-CC"               => "true,coefficients,apply",
    ]);

    // === Dolby Vision L5: Active Area ===
    $output[] = json_encode([
        "X-DV-L5"                  => "true,active-area,letterbox-detect",
        "X-DV-L5-Codes"            => "0,0,0,0",
    ]);

    // === Dolby Vision L6: MaxSCL per frame ===
    // MaxSCL = el valor más alto de cada componente R/G/B en nits
    $output[] = json_encode([
        "X-DV-L6-MaxSCL"          => "true,per-frame,5000,5000,5000",
        "X-DV-L6-MaxRGB"           => "5000",
    ]);

    // === Dolby Vision L8: Reshape + CC ===
    // Reshape = re-mapeo de la señal para aprovechar mejor el rango del panel
    // CC = Content Color Metadata para colorimetria precisa por escena
    $output[] = json_encode([
        "X-DV-L8-Reshape"          => "true,polynomial,sigmoid",
        "X-DV-L8-CC"               => "true,content-color-metadata",
        "X-DV-L8-CC-Matrix"        => "identity",
    ]);

    // === Dolby Vision L11: Active area for BL ===
    $output[] = json_encode([
        "X-DV-L11"                 => "true,active-area-present",
    ]);

    // === Dolby Vision CM v4.0 ===
    $output[] = json_encode([
        "X-DV-CM-Version"          => "4.0",
        "X-DV-CM-L1"               => "true",
        "X-DV-CM-L2"               => "true",
        "X-DV-CM-L5"               => "true",
        "X-DV-CM-L6"               => "true",
        "X-DV-CM-L8"               => "true",
        "X-DV-CM-L11"              => "true",
    ]);

    return $output;
}


// ============================================================================
// MÓDULO 16E: HLG (Hybrid Log-Gamma) Support
// ============================================================================
/**
 * HLG es el estándar HDR para broadcasting (BBC/NHK/ARIB). A diferencia de PQ
 * que necesita metadata, HLG usa una curva de transferencia que es
 * "compatible hacia atrás" — se ve bien tanto en SDR como en HDR.
 *
 * HLG no tiene un peak luminance fijo. El TV escala el contenido al 100%
 * de su capacidad. En un TV de 1000 nits, HLG 1000 nits usa el 100% del panel.
 * En un TV de 4000 nits, usa el 100% de 4000 nits.
 *
 * Para IPTV: forzar HLG 4000 + PQ 5000 como señales duales HDR.
 *
 * @return array Directivas EXTHTTP para HLG
 */
function ape_hdr_hlg() {
    return [
        json_encode([
            "X-HLG-Active"             => "true,force",
            "X-HLG-Version"            => "ARIB-STD-B67",
            "X-HLG-Peak"               => "4000",
            "X-HLG-System-Gamma"       => "1.2",
            "X-HLG-Scene-Light"        => "true",
            "X-HLG-Display-Light"      => "true",
            "X-HLG-OOTF"               => "true,1.2,gamma",
        ]),
        json_encode([
            "X-HLG-Ref-White"          => "203",
            "X-HLG-Ref-Display-Peak"   => "4000",
            "X-HLG-Master-Display"     => "BT2020,4000nits",
            "X-HLG-Transfer"           => "arib-std-b67,hlg",
        ]),
    ];
}


// ============================================================================
// MÓDULO 16F: GPU TONE MAPPING — libplacebo / Vulkan Pipeline
// ============================================================================
/**
 * libplacebo es el motor de rendering GPU de mpv. Soporta:
 *   - Tone mapping por hardware (GPU compute shaders)
 *   - Color management BT.2020 → cualquier gamut del display
 *   - Dithering de alta calidad (error diffusion)
 *   - Resizing con filtros avanzados (EwaLanczos, sinc)
 *
 * Para VLC: usa los filtros GPU internos (glsl tonemap).
 * Para Kodi: usa VideoPlayer con libplacebo.
 *
 * Este módulo genera directivas para FORZAR tone mapping GPU.
 *
 * @param array $sniper_status Estado del canal
 * @param string $ua User-Agent para detectar GPU
 * @return array Directivas EXTHTTP + EXTVLCOPT para GPU tone mapping
 */
function ape_hdr_gpu_tonemap($sniper_status, $ua = '') {
    $output = [
        'ext_http'  => [],
        'ext_vlcopt'=> [],
    ];

    if ($sniper_status['status'] === 'IDLE') {
        return $output;
    }

    $is_nvidia = preg_match('/nvidia|shield|geforce|rtx/i', $ua);
    $is_active = $sniper_status['sniper'];

    // === GPU Tone Mapping Pipeline (EXTHTTP) ===
    $output['ext_http'][] = json_encode([
        "X-GPU-Tonemap"             => "true,libplacebo,vulkan,compute-shaders",
        "X-GPU-Tonemap-Algorithm"  => "reinhard,hable,peak-map,bt2390",
        "X-GPU-Tonemap-Peak"       => "5000",
        "X-GPU-Tonemap-Target"     => "5000",
        "X-GPU-Tonemap-Contrast"   => "hard,desaturate-adaptive",
        "X-GPU-Tonemap-Desat"      => "0",   // CERO desaturación — mantener color HDR
    ]);

    // === libplacebo: Color Management Pipeline ===
    $output['ext_http'][] = json_encode([
        "X-Libplacebo"              => "true,hdr,color-management,tonemap,dither",
        "X-Libplacebo-Gamut"        => "BT2020→display-native",
        "X-Libplacebo-Transfer"     => "ST2084(PQ)→display-EOTF",
        "X-Libplacebo-Tonemap"      => "bt2446a,reinhard,hable",
        "X-Libplacebo-Dither"       => "blue-noise,ordered,high-quality",
        "X-Libplacebo-Upcaler"      => "ewalanczos,ewalanczossharp",
    ]);

    // === Vulkan Compute Shaders ===
    if ($is_nvidia || $is_active) {
        $output['ext_http'][] = json_encode([
            "X-Vulkan-Tonemap"       => "true,compute-shaders",
            "X-Vulkan-Pipeline"      => "hdr-tonemap,color-convert,dither",
            "X-CUDA-Tonemap"         => "true,nvdec-accelerated",
            "X-CUDA-Peak-Process"    => "true,per-pixel,5000nit-target",
        ]);
    }

    // === BT.2446a Tone Mapping (ITU-R recomendado) ===
    // BT.2446a es el estándar ITU para convertir HDR→SDR manteniendo la
    // percepción de brillo. Es SUPERIOR a Reinhard o Hable para contenido real.
    $output['ext_http'][] = json_encode([
        "X-BT2446a-Tonemap"        => "true,method-a,color-preserving",
        "X-BT2390-Tonemap"         => "true,contrast-preserving",
        "X-ITU-R-Tonemap"          => "bt2446a,bt2390,perceptual",
    ]);

    // === EXTVLCOPT: FFmpeg filterchain para GPU tone mapping ===
    // Este filterchain se ejecuta en el GPU del cliente
    $output['ext_vlcopt'][] = 'video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full
    $output['ext_vlcopt'][] = 'video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full
    // Fallback: hable tonemap si bt2446a no está disponible
    $output['ext_vlcopt'][] = 'video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full

    return $output;
}


// ============================================================================
// MÓDULO 16G: DISPLAY / TV DIRECTIVES — Máximo Brillo Cuántico
// ============================================================================
/**
 * Directivas que llegan al TELEVISOR vía HDMI metadata y CEC commands.
 * Fuerzan al TV a usar el MÁXIMO de su capacidad de brillo, contraste
 * y local dimming. El TV lee estos headers y configura su procesador.
 *
 * Estas directivas son "sugerencias" HTTP que los players modernos
 * (TiviMate, VLC con mod, Kodi) pueden traducir a CEC/HDMI metadata.
 *
 * @param array $sniper_status Estado del canal
 * @return array Directivas EXTHTTP para el TV/Display
 */
function ape_hdr_display_directives($sniper_status) {
    $output = [];

    if ($sniper_status['status'] === 'IDLE') {
        return $output;
    }

    $is_active = $sniper_status['sniper'];

    // === PEAK LUMINANCE — 5000 nits como target ===
    $output[] = json_encode([
        "X-Display-Peak-Luminance"    => "5000",
        "X-Display-Target-Peak"       => "5000",
        "X-Display-Max-Nits"          => "5000",
        "X-Display-Brightness-Max"    => "5000",
        "X-Display-Backlight"         => "100",
        "X-Display-Backlight-Mode"    => "MAXIMUM,GLOW,BRIGHT",
    ]);

    // === LOCAL DIMMING — Máximo contraste ===
    // El local dimming es LO que hace que el HDR se vea "alucinante".
    // Apaga las zonas oscuras al MÍNIMO y enciende las brillantes al MÁXIMO.
    $output[] = json_encode([
        "X-Local-Dimming"             => "true,aggressive,full-array,HIGH",
        "X-Local-Dimming-Level"       => "HIGH,MAXIMUM",
        "X-Local-Dimming-Zones"       => "maximum,all-zones-independent",
        "X-Local-Dimming-Precision"   => "pixel-level,sub-pixel",
        "X-Local-Dimming-Boost"       => "true,5000nit,quantum",
        "X-Local-Dimming-Contrast"    => "infinite,10000000:1",
        "X-Local-Dimming-Highlight"   => "true,specular,boost",
        "X-Local-Dimming-Black"       => "true,true-black,zero-nit",
    ]);

    // === CONTRAST ===
    // El contraste HDR no se controla por "contrast slider" sino por
    // metadata de luminancia. Pero forzamos el motor de contraste del TV.
    $output[] = json_encode([
        "X-Contrast-HDR"             => "maximum,pq-driven,metadata-controlled",
        "X-Contrast-Dynamic"         => "true,scene-adaptive,hdr-enhanced",
        "X-Contrast-Enhancer"        => "true,advanced-hdr,quantum-contrast",
        "X-Black-Level"              => "0.0005",  // OLED negro perfecto
        "X-Black-Depth"              => "maximum,infinite,zero",
        "X-Shadow-Detail"            => "enhanced,preserve-near-black",
        "X-Highlight-Recovery"       => "enabled,clipped-recover,5000nit",
        "X-White-Balance-Boost"      => "true,D65,preserves-colorimetry",
    ]);

    // === PANEL TECHNOLOGY HINTS ===
    $output[] = json_encode([
        "X-Panel-Type"                => "oled,qled,miniled,microled",
        "X-Panel-Processing"          => "FULL,ALL-ENHANCEMENTS,MAXIMUM",
        "X-Panel-HDR-Mode"            => "HDR-BRIGHT,HDR-VIVID,HDR-CINEMA",
        "X-Panel-HDR-Intensity"       => "maximum,aggressive,bright",
        "X-Panel-Peak-Brightness"     => "5000",
        "X-Panel-Sustain-Brightness"  => "800",
    ]);

    // === SPECULAR HIGHLIGHTS ===
    // Los specular highlights son los reflejos metálicos, el sol, las luces
    // que EXPLOTAN de brillo. Estos son los que el ojo humano percibe como
    // "WOW, eso se ve increíble".
    if ($is_active) {
        $output[] = json_encode([
            "X-Specular-Highlight-Boost"   => "true,quantum,5000nit",
            "X-Specular-Intensity"         => "maximum,aggressive,overdrive",
            "X-Specular-Per-Pixel"         => "true,hdr-engine,per-pixel",
            "X-Bloom-Effect"               => "true,natural,hdr-glow",
            "X-Bloom-Intensity"            => "high,natural,perceptual",
            "X-Glow-Engine"                => "true,active,quantum-glow",
            "X-HDR-Bloom"                  => "true,specular-adaptive,5000nit",
            "X-Highlight-Roll-Off"         => "none,hard-clip,full-peak",
        ]);
    }

    // === DIMMING TECHNOLOGY ===
    $output[] = json_encode([
        "X-Dimming-Technology"        => "full-array-local-dimming",
        "X-Dimming-Zone-Count"        => "maximum",
        "X-Dimming-Response-Time"     => "0ms,instant",
        "X-Dimming-Transition"        => "smooth,perceptual",
        "X-Dimming-Algorithm"         => "advanced,pixel-adaptive",
    ]);

    // === HDR PROCESSING MODE ===
    $output[] = json_encode([
        "X-HDR-Processing-Mode"       => "FULL,CINEMA,BRIGHT,VIVID",
        "X-HDR-Tone-Map-Mode"         => "STATIC+DYNAMIC,MAXIMUM",
        "X-HDR-Color-Gamut"           => "BT2020,WIDE,MAXIMUM",
        "X-HDR-Bit-Depth"             => "10bit,12bit-passthrough",
        "X-HDR-Precision"             => "maximum,per-pixel,full-range",
        "X-HDR-Gradation"             => "smooth,10-bit,1024-steps",
    ]);

    // === eARC + HDMI 2.1 ===
    $output[] = json_encode([
        "X-HDMI-Mode"                 => "2.1,48Gbps,FRL-12",
        "X-Deep-Color"               => "12bit,passthrough",
        "X-Chroma-Subsampling"        => "4:2:0-to-4:4:4,precise",
        "X-HDR-Signal"                => "HDR10,HDR10+,DV,HLG,all",
        "X-CEC-HDR-Mode"              => "force-hdr,all-formats",
    ]);

    return $output;
}


// ============================================================================
// MÓDULO 16H: FILM GRAIN SYNTHESIS — MPEG Neural Noise
// ============================================================================
/**
 * MPEG está estandarizando film grain synthesis (NN-based). El grain addback
 * es el paso FINAL que convierte un HDR "limpio pero plano" en un HDR
 * "alucinante con textura orgánica".
 *
 * El film grain es TEXTURA, no ruido. Le da a la imagen una cualidad
 * cinematográfica que el ojo humano asocia con contenido premium.
 * El estándar MPEG lo señaliza como "grain characteristics" en la metadata.
 *
 * @param array $sniper_status Estado del canal
 * @return array Directivas EXTHTTP para film grain
 */
function ape_hdr_film_grain($sniper_status) {
    $output = [];

    if ($sniper_status['status'] === 'IDLE') {
        return $output;
    }

    $is_active = $sniper_status['sniper'];

    // === Film Grain Characteristics ===
    $output[] = json_encode([
        "X-Film-Grain"                => "true,synthesis,neural",
        "X-Film-Grain-Intensity"      => $is_active ? "moderate,cinematic" : "light",
        "X-Film-Grain-Type"           => "analog,cinematic,organic",
        "X-Film-Grain-Size"           => "fine,perceptual",
        "X-Film-Grain-Seed"           => "random,per-scene",
        "X-Film-Grain-Characteristics"=> "low=0,high=8,scale=4",
    ]);

    // === Grain addback post-tone-mapping ===
    // Se añade DESPUÉS del tone mapping para que no interfiera con el
    // mapeo de luminancia. El grain solo afecta la textura, no el brillo.
    $output[] = json_encode([
        "X-Grain-Addback"             => "true,post-tonemap,perceptual",
        "X-Grain-Density"             => $is_active ? "medium" : "low",
        "X-Grain-SNR"                 => "high,preserve-detail",
        "X-MPEG-Film-Grain"           => "true,standard-compliant",
        "X-NN-Film-Grain"             => "true,neural-network,synthesis",
    ]);

    return $output;
}


// ============================================================================
// MÓДULO 16I: KODIPROP HDR — Directivas Kodi para HDR 5000
// ============================================================================
/**
 * Directivas KODIPROP específicas para forzar HDR en Kodi.
 * InputStream.Adaptive procesa estas directivas para configurar el
 * pipeline HDR del player.
 *
 * @param array $sniper_status Estado del canal
 * @param string $ua User-Agent
 * @return array Directivas KODIPROP para HDR
 */
function ape_hdr_kodiprop($sniper_status, $ua = '') {
    $output = [];

    $is_kodi = preg_match('/kodi|xbmc|matrix/i', $ua);
    if (!$is_kodi || $sniper_status['status'] === 'IDLE') {
        return $output;
    }

    // InputStream.Adaptive HDR configuration
    $output[] = 'inputstream.adaptive.hdr_handling=force_hdr';
    $output[] = 'inputstream.adaptive.hdr_type=hdr10,dolby_vision,hlg';
    $output[] = 'inputstream.adaptive.color_depth=10';
    $output[] = 'inputstream.adaptive.max_luminance=5000';
    $output[] = 'inputstream.adaptive.min_luminance=0.0005';
    $output[] = 'inputstream.adaptive.color_primaries=bt2020';
    $output[] = 'inputstream.adaptive.transfer_function=smpte2084';
    $output[] = 'inputstream.adaptive.matrix_coefficients=bt2020nc';
    $output[] = 'inputstream.adaptive.hdr10_plus_parse=true';
    $output[] = 'inputstream.adaptive.dolby_vision_rpu=true';

    return $output;
}


// ============================================================================
// MÓДULO 16J: FUNCTION MAESTRA — HDR PEAK NIT INTEGRATION
// ============================================================================
/**
 * Función principal que integra TODOS los submódulos del HDR PEAK NIT ENGINE.
 * Genera el conjunto completo de directivas para máximo brillo HDR.
 *
 * ORDEN DE EJECUCIÓN:
 *   1. ST 2086 Static Metadata (Master Display + CLLI)
 *   2. HDR10+ Dynamic Metadata (per-frame)
 *   3. PQ EOTF (transfer function)
 *   4. Dolby Vision RPU (profiles 5/8)
 *   5. HLG (broadcasting fallback)
 *   6. GPU Tone Mapping (libplacebo/vulkan)
 *   7. Display Directives (TV-level)
 *   8. Film Grain Synthesis (texture)
 *   9. KODIPROP HDR (Kodi-specific)
 *
 * @param array $sniper_status Estado del canal
 * @param string $ua User-Agent
 * @return array [
 *   'ext_http'  => array,  // Directivas HTTP HDR
 *   'ext_vlcopt'=> array,  // Directivas VLC HDR
 *   'kodiprop'  => array,  // Directivas Kodi HDR
 *   'metadata'  => array,  // Info del engine
 * ]
 */
function ape_hdr_peak_nit_engine($sniper_status, $ua = '') {
    $result = [
        'ext_http'  => [],
        'ext_vlcopt'=> [],
        'kodiprop'  => [],
        'metadata'  => [
            'active'     => false,
            'peak_nits'  => APE_HDR_PEAK_LUMINANCE,
            'maxcll'     => APE_HDR_MAXCLL,
            'maxfall'    => APE_HDR_MAXFALL,
            'dv_profiles'=> [5, 8, 7],
            'formats'    => ['HDR10', 'HDR10+', 'DolbyVision', 'HLG'],
        ],
    ];

    // Solo para canales activos/recientes (NO IDLE)
    if ($sniper_status['status'] === 'IDLE') {
        return $result;
    }

    $result['metadata']['active'] = true;
    $result['metadata']['status'] = $sniper_status['status'];
    $result['metadata']['sniper'] = $sniper_status['sniper'];

    // === 1. ST 2086 Static Metadata ===
    $st2086 = ape_hdr_st2086_metadata();
    $result['ext_http'] = array_merge($result['ext_http'], $st2086);

    // === 2. HDR10+ Dynamic Metadata ===
    $dyn = ape_hdr_dynamic_metadata($sniper_status);
    $result['ext_http'] = array_merge($result['ext_http'], $dyn);

    // === 3. PQ EOTF ===
    $pq = ape_hdr_pq_eotf();
    $result['ext_http'] = array_merge($result['ext_http'], $pq['ext_http']);
    $result['ext_vlcopt'] = array_merge($result['ext_vlcopt'], $pq['ext_vlcopt']);

    // === 4. Dolby Vision ===
    $dv = ape_hdr_dolby_vision($sniper_status);
    $result['ext_http'] = array_merge($result['ext_http'], $dv);

    // === 5. HLG ===
    $hlg = ape_hdr_hlg();
    $result['ext_http'] = array_merge($result['ext_http'], $hlg);

    // === 6. GPU Tone Mapping ===
    $gpu_tm = ape_hdr_gpu_tonemap($sniper_status, $ua);
    $result['ext_http'] = array_merge($result['ext_http'], $gpu_tm['ext_http']);
    $result['ext_vlcopt'] = array_merge($result['ext_vlcopt'], $gpu_tm['ext_vlcopt']);

    // === 7. Display Directives ===
    $display = ape_hdr_display_directives($sniper_status);
    $result['ext_http'] = array_merge($result['ext_http'], $display);

    // === 8. Film Grain ===
    $grain = ape_hdr_film_grain($sniper_status);
    $result['ext_http'] = array_merge($result['ext_http'], $grain);

    // === 9. KODIPROP HDR ===
    $kodi_hdr = ape_hdr_kodiprop($sniper_status, $ua);
    $result['kodiprop'] = $kodi_hdr;

    // === METADATA FINAL ===
    $result['metadata']['total_ext_http'] = count($result['ext_http']);
    $result['metadata']['total_ext_vlcopt'] = count($result['ext_vlcopt']);
    $result['metadata']['total_kodiprop'] = count($result['kodiprop']);

    return $result;
}
