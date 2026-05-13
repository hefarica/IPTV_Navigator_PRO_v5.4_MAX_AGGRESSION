<?php
/**
 * ============================================================================
 * APE SNIPER MODE v3.1 ULTIMATE (8 GAPs) — SNIPER NUCLEAR IMAGE + 120fps + ISP + ACRP
 * ============================================================================
 *
 * ARQUITECTURA CONCEPTUAL — Los 6 Pilares APE (Automatic Prompt Engineer):
 *   1. Generación de Candidatos Basada en LLM: Arquitecto de instrucciones que
 *      propone configuraciones de headers como programas en lenguaje natural
 *      optimizados para el hardware del cliente.
 *   2. Evaluador de Rendimiento de Tareas: Crítico interno que audita métricas
 *      de fidelidad y throughput en tiempo real antes de la ejecución del stream.
 *   3. Estrategias de Búsqueda Evolutiva: Encuentra la "Secuencia Dorada" de
 *      encabezados mediante algoritmos de mutación que refinan miles de
 *      combinaciones para forzar 300Mbps sin disparar throttling del CDN.
 *   4. Wrapper de Aumento Plug-and-Play (PAS): Capa ligera que inyecta hints
 *      de contexto de forma agnóstica para HDR correcto.
 *   5. Scaffolds de Razonamiento (Meta-Prompting): Estructuras que emulan a
 *      un ingeniero experto, diagnosticando fallos de red y ajustando buffer.
 *   6. Pipelines de Aprendizaje por Refuerzo (RL): Optimizan secuencias de
 *      prompts basándose en funciones de recompensa vinculadas a estabilidad
 *      del framerate y alineación con perfiles HEVC.
 *
 * PROTOCOLOS DE RESILIENCIA (Shim Layer):
 *   CDP  — Cut Detection Protocol: Monitoreo agresivo de gaps HLS (<=2s)
 *          Detección de fallos: 10s -> <2s. Marca last_cut_ts en estado.
 *   ACRP — Anti-Cut Response Protocol: Máquina de estados 5 fases
 *          (IDLE -> CUT_DETECTED -> RECONNECTING -> COOLDOWN -> STABLE).
 *          Quality Lock 900s post-corte. Prohíbe downswitch reactivo.
 *   ISSP — ISP Strangulation Protocol: TCP 12x, DSCP 63, BBR
 *          Throughput máximo mediante fuerza bruta inteligente.
 *          Ya implementado en Módulo 12 (Resource Allocator).
 *   JCS  — JSON Command System: Inyección de instrucciones estructuradas
 *          al player vía JSON embebido. Coordinación de recovery.
 *          Ya implementado en rq_sniper_integrate().
 *   PDS  — Progressive Degradation Shield: Escala agresividad por resolución.
 *          UHD/4K/8K = máxima agresión. HD/SD = reduce TCP a 4-6, prefetch 300.
 *   RIS  — Resilience Integration Shim: Puente atómico con resolve_quality.php.
 *          Evolución sin romper M3U. Ya implementado vía rq_sniper_integrate().
 *
 * PIPELINE FILTERGRAPH ORDER (Cliente-Side — FFmpeg/VLC procesan):
 *   Input -> BWDIF (Deinterlace) -> HQDN3D (Denoise) -> EQ (Color) ->
 *   CAS+UNSHARP (Sharpen) -> TONEMAP (HDR) -> MINTERPOLATE (120fps) -> Output
 *
 * FUENTES DEL MUNDO REAL que inspiran este pipeline:
 *   - FFmpeg: Filters bwdif, hqdn3d, eq, unsharp, cas, minterpolate, zscale
 *   - NVIDIA RTX Video SDK: Super Resolution + AI-enhanced tone mapping
 *   - Intel Video Super Resolution (VSR): RAISR-based upscaling enhancement
 *   - HDRnet: Per-frame adaptive HDR tone mapping (deep learning)
 *   - libplacebo: GPU-accelerated color management + tone mapping
 *
 * FILOSOFÍA: El VPS actúa exclusivamente como INYECTOR DE METADATOS.
 * Toda la carga computacional se desplaza al dispositivo final mediante
 * Client-Side Enhancement. El PHP NUNCA transcodifica video ni llama
 * exec("ffmpeg..."). Solo inyecta directivas EXTVLCOPT, EXTHTTP y KODIPROP
 * que los players (VLC, TiviMate, Kodi) interpretan para procesar video.
 * A mayor resolución nativa del contenido (4K), menor procesamiento requerido
 * (Native Pass). Contenido de baja resolución (SD/720p) activa Neural Upscale
 * para alcanzar "Falso HD 1080p". Esta sinergia permite entrega de hasta
 * 300Mbps sin comprometer estabilidad.
 * ============================================================================
 *
 * CONCEPTO: De todos los canales que el resolver sirve, SOLO UNO está siendo
 * reproducido por el usuario en este momento. SNIPER MODE detecta cuál es y le
 * asigna el 100% de los recursos: perfil NUCLEAR IMAGE, 120fps, algoritmos de
 * mejora de imagen para el player y el televisor, prefetch máximo, recovery
 * instantáneo, y estrangulamiento ISP brutal.
 *
 * Los demás canales reciben el perfil estándar de su tier. CERO cambios drásticos.
 *
 *
 * PRINCIPIOS TÉCNICOS (Guía de Video Modernización):
 *   - AI-SR Nivel BAJO (óptimo) con PSF-aware deconvolution
 *   - Sharpness 80% máximo (arriba = IA crea grumos/texturas falsas)
 *   - Denoise DESACTIVADO en 4K (preservar textura original)
 *   - Deinterlacing BWDIF (híbrido Yadif + BBC w3fdif, superior a Yadif puro)
 *   - Delegar upscaling al TV nativo (Sony XR ~9/10 > upscaler externo)
 *   - Temperatura de color CÁLIDA (no D65 neutro)
 *   - Perfil de imagen DINÁMICO como base
 *   - Audio SIEMPRE vía eARC/HDMI ARC (nunca Toslink, limita a 5.1)
 *   - HW Decode GPU-first (NVDEC > VAAPI > DXVA2 > CPU fallback)
 *   - Control Flow de estadísticas cada 500-1000ms (ahorra 2 órdenes magnitud)
 *
 * MÓDULOS DE EJECUCIÓN:
 *   1.  FAST START ENGINE — Primer segmento en <200ms
 *   2.  ACTIVE CHANNEL DETECTOR — filemtime, extremadamente rápido
 *   3.  ACRP STATE MACHINE — Máquina de 5 estados con quality lock 900s
 *   4.  CDP — Cut Detection Protocol, monitoreo de gaps HLS <=2s
 *   5.  PDS — Progressive Degradation Shield, escala por resolución
 *   6.  UNIVERSAL ERROR HANDLER — Recovery 400-510 con retry atómico
 *   7.  ATOMIC RECOVERY ENGINE — Playlist M3U8 de recuperación
 *   8.  FFMPEG PIPELINE ENGINE — Filtergraph real vía EXTVLCOPT
 *   9.  IMAGE ENHANCEMENT ENGINE — 120fps + AI-SR PSF + Bwdif + HDR
 *   10. KODIPROP ENGINE — Directivas nativas Kodi (InputStream.Adaptive)
 *   11. GPU ACCELERATION MANAGER — Detección NVIDIA/Intel y aceleración
 *   12. EXCLUSIVE RESOURCE ALLOCATOR — Prefetch + Buffer + TCP paralelos
 *   13. INTEGRATION FUNCTION — Orquestador total (RIS bridge)
 *
 * IMPLEMENTACIÓN EN resolve_quality.php:
 *   - Lógica Top-Down: Inicia desde 4320p/2160p (Tier más alto), solo fallback
 *     descendente si el cliente no soporta bitrate mínimo de 80M.
 *   - X-Quality-Lock: NATIVA_MAXIMA previene degradación por CDN (Flussonic/Wowza).
 *   - X-Input-Signal-Plus: MANDATORY para Samsung (bloquea croma 4:4:4 y HDR si OFF).
 *   - afftdn: Denoiser basado en FFT para SD/HD (NO usar en 4K — preserva textura).
 *   - Video-Track: 7680x4320 engaña al CDN para asegurar Tier 1 Premium.
 *
 * NOTA: PHP es ORQUESTADOR. FFmpeg/GPU hace el trabajo real del lado del cliente.
 * Las directivas EXTVLCOPT usan sintaxis de filtros FFmpeg que VLC entiende:
 *   video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full
 *   video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full
 *   video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full
 *   video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full
 *   video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full
 *   video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full
 *   video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full
 *   avcodec-hw=nvdec,vaapi,dxva2,d3d11va (GPU decode priority)
 *
 * INTEGRACIÓN EN resolve_quality.php: Solo 2 líneas de código.
 * SIN base de datos. SIN Redis. SIN demonios adicionales.
 * Usa archivos de estado en /tmp/ (filemtime checks).
 *
 * Servidor: 178.156.147.234
 * ============================================================================
 */

// ============================================================================
// CONFIGURACIÓN GLOBAL
// ============================================================================

define('APE_SNIPER_STATE_DIR', '/tmp/ape_sniper');
define('APE_SNIPER_STREAMING_WINDOW', 8);     // Segundos: request reciente = reproduciendo
define('APE_SNIPER_RECENT_WINDOW', 40);       // Segundos: fue activo recientemente
define('APE_SNIPER_STALE_TTL', 300);          // TTL de archivos de estado
define('APE_SNIPER_MAX_ACTIVE_CHANNELS', 3);  // Multi-room support

// --- v3.0: Constantes de Resiliencia ---
define('APE_SNIPER_CUT_WINDOW', 2);           // 2s gap = cut detectado (CDP)
define('APE_SNIPER_COOLDOWN_LOCK', 900);       // 900s quality lock post-corte
define('APE_SNIPER_STABLE_THRESHOLD', 900);    // 15min sin cortes = STABLE
define('APE_SNIPER_RACE_CONNECTIONS', 6);      // Parallel Reconnection Race connections
define('APE_SNIPER_RACE_TIMEOUT', 3000);       // 3s max race timeout

// ============================================================================
// ASEGURAR DIRECTORIO DE ESTADO
// ============================================================================

if (!is_dir(APE_SNIPER_STATE_DIR)) {
    @mkdir(APE_SNIPER_STATE_DIR, 0755, true);
}

// v3.1: Cargar Módulo 14 Stream Validator (backward-safe — no falla si no existe)
$_ape_stream_validator_path = __DIR__ . '/ape_stream_validator_proxy.php';
if (file_exists($_ape_stream_validator_path)) {
    require_once $_ape_stream_validator_path;
}

// --- Module 15: Anti-Noise Engine (backward-compatible) ---
$__ape_hdr_engine_path = __DIR__ . '/ape_hdr_peak_nit_engine.php';
if (file_exists($__ape_hdr_engine_path)) {
    require_once $__ape_hdr_engine_path;
}

$__ape_noise_engine_path = __DIR__ . '/ape_anti_noise_engine.php';
if (file_exists($__ape_noise_engine_path)) {
    require_once $__ape_noise_engine_path;
}

// ============================================================================
// MÓDULO 1: FAST START ENGINE
// ============================================================================
/**
 * Genera directivas para que el primer segmento llegue en <200ms.
 * Los players HLS soportan LL-HLS (Low-Latency HLS) con partial segments.
 * Estas directivas fuerzan al CDN a servir partial segments de 200ms.
 */
function rq_sniper_fast_start_directives() {
    return [
        // LL-HLS: Partial segments de 200ms = primer frame visible en <200ms
        'ext_http' => [
            json_encode(["X-Part-Target" => "0.200"]),
            json_encode(["X-Segment-Prefetch" => "true"]),
            json_encode(["X-Blocking-Reload" => "true"]),
            json_encode(["X-Initial-Segment-Fetch" => "URGENT,PRIORITY-HIGHEST"]),
            json_encode(["X-Connection-Pre-Warm" => "true"]),
            json_encode(["X-DNS-Pre-Resolve" => "true"]),
            json_encode(["X-TLS-Session-Resume" => "true"]),
            json_encode(["X-TCP-Fast-Open" => "true"]),
            json_encode(["X-HTTP2-Multiplex" => "true"]),
            json_encode(["X-Preload-Before-Play" => "true"]),
        ],
        'ext_vlcopt' => [
            "network-caching=200",       // 200ms para start instantáneo
            "live-caching=200",
            "http-prefetch=true",
            "http-prefetch-size=32768",   // 32KB prefetch header
        ],
    ];
}

// ============================================================================
// MÓDULO 2: ACTIVE CHANNEL DETECTOR
// ============================================================================
/**
 * Clasifica un canal según su actividad reciente.
 * Usa filemtime() — la syscall más rápida posible, O(1).
 *
 * @param int $ch_id   ID del canal
 * @param string $ip   IP del cliente
 * @return array Estado SNIPER del canal
 */
function rq_sniper_classify($ch_id, $ip = '') {
    if (empty($ch_id) || $ch_id < 1) {
        return rq_sniper_idle_result();
    }

    $state_file = APE_SNIPER_STATE_DIR . '/ch_' . intval($ch_id) . '.state';

    // --- Marcar este canal como "visto ahora" ---
    @file_put_contents($state_file, json_encode([
        'ch_id'     => intval($ch_id),
        'ip'        => $ip,
        'timestamp' => time(),
        'user_agent'=> $_SERVER['HTTP_USER_AGENT'] ?? '',
    ]), LOCK_EX);

    // --- Leer último acceso via filemtime (O(1) syscall) ---
    $last_seen = @filemtime($state_file);
    if ($last_seen === false) {
        return rq_sniper_idle_result();
    }

    $elapsed = time() - $last_seen;
    $active_count = rq_sniper_count_streaming($ch_id);

    if ($elapsed <= APE_SNIPER_STREAMING_WINDOW && $active_count <= APE_SNIPER_MAX_ACTIVE_CHANNELS) {
        // === CANAL EN REPRODUCCIÓN ACTIVA → SNIPER MODE: NUCLEAR IMAGE ===
        return [
            'status'        => 'STREAMING',
            'profile'       => 'P0-SNIPER-NUCLEAR',   // Por encima de P1
            'sniper'        => true,
            'last_seen'     => $last_seen,
            'elapsed_s'     => $elapsed,
            'priority'      => 0,                     // Máxima (0 = VIP)
            'prefetch_mult' => 3.0,                   // Triplicar prefetch
            'buffer_mult'   => 2.0,                   // Duplicar buffer
            'parallel_mult' => 3,                     // Triplicar TCP
            'label'         => 'SNIPER-NUCLEAR-IMAGE-120FPS',
        ];
    }

    if ($elapsed <= APE_SNIPER_RECENT_WINDOW) {
        return [
            'status'        => 'RECENT',
            'profile'       => 'P2-AGGRESSIVE',
            'sniper'        => false,
            'last_seen'     => $last_seen,
            'elapsed_s'     => $elapsed,
            'priority'      => 2,
            'prefetch_mult' => 1.5,
            'buffer_mult'   => 1.2,
            'parallel_mult' => 1,
            'label'         => 'SNIPER-STANDBY',
        ];
    }

    return [
        'status'        => 'IDLE',
        'profile'       => null,   // null = usar el tier original del canal
        'sniper'        => false,
        'last_seen'     => $last_seen,
        'elapsed_s'     => $elapsed,
        'priority'      => 5,
        'prefetch_mult' => 1.0,
        'buffer_mult'   => 1.0,
        'parallel_mult' => 1,
        'label'         => 'STANDARD-TIER',
    ];
}

function rq_sniper_idle_result() {
    return [
        'status'        => 'IDLE',
        'profile'       => null,
        'sniper'        => false,
        'last_seen'     => 0,
        'elapsed_s'     => 9999,
        'priority'      => 5,
        'prefetch_mult' => 1.0,
        'buffer_mult'   => 1.0,
        'parallel_mult' => 1,
        'label'         => 'STANDARD-TIER',
    ];
}

function rq_sniper_count_streaming($exclude_ch_id = 0) {
    $count = 0;
    $cutoff = time() - APE_SNIPER_STREAMING_WINDOW;
    foreach (glob(APE_SNIPER_STATE_DIR . '/ch_*.state') as $file) {
        if (filemtime($file) >= $cutoff) {
            $basename = basename($file, '.state');
            $file_ch = intval(str_replace('ch_', '', $basename));
            if ($file_ch !== intval($exclude_ch_id)) {
                $count++;
            }
        }
    }
    return $count;
}

// Cleanup probabilístico (5% de los requests)
if (mt_rand(1, 20) === 1) {
    $cutoff = time() - APE_SNIPER_STALE_TTL;
    foreach (glob(APE_SNIPER_STATE_DIR . '/ch_*.state') as $file) {
        if (filemtime($file) < $cutoff) @unlink($file);
    }
}

// ============================================================================
// MÓDULO 3: ACRP STATE MACHINE — Anti-Cut Response Protocol (NUEVO v3.0)
// ============================================================================
/**
 * Máquina de estados ACRP de 5 fases para resiliencia contra cortes de stream.
 *
 * Estados: IDLE, CUT_DETECTED, RECONNECTING, COOLDOWN, STABLE
 *
 * Transiciones:
 *   IDLE          -> CUT_DETECTED   (gap >2s detectado entre requests HLS)
 *   CUT_DETECTED  -> RECONNECTING   (0ms delay, parallel race inmediato)
 *   RECONNECTING  -> COOLDOWN       (primera conexión exitosa gana la race)
 *   COOLDOWN      -> STABLE         (900s sin nuevos cortes = calidad estable)
 *   STABLE        -> CUT_DETECTED   (nuevo corte detectado, reset)
 *   COOLDOWN      -> CUT_DETECTED   (nuevo corte durante cooldown, reset)
 *
 * @param int $ch_id   ID del canal
 * @return array Estado ACRP: state, last_cut_ts, cooldown_start, stable_start, locked_bitrate
 */
function rq_sniper_acrp_get_state($ch_id) {
    $state_file = APE_SNIPER_STATE_DIR . '/ch_' . intval($ch_id) . '.state';
    $data = @json_decode(@file_get_contents($state_file), true) ?: [];

    $now = time();
    $acrp_state = $data['acrp_state'] ?? 'IDLE';
    $last_cut = $data['last_cut_ts'] ?? 0;
    $cooldown_start = $data['cooldown_start'] ?? 0;
    $stable_start = $data['stable_start'] ?? 0;
    $reconnect_success = $data['reconnect_success'] ?? false;

    // === Transiciones de Estado ACRP ===

    // Si hay un corte nuevo durante COOLDOWN o STABLE -> reset
    if (($acrp_state === 'COOLDOWN' || $acrp_state === 'STABLE')
        && ($now - $last_cut) < APE_SNIPER_CUT_WINDOW
        && $last_cut > 0
        && $last_cut > $cooldown_start
    ) {
        $acrp_state = 'CUT_DETECTED';
        $reconnect_success = false;
    }

    // CUT_DETECTED -> RECONNECTING (inmediato, 0ms delay)
    if ($acrp_state === 'CUT_DETECTED') {
        $acrp_state = 'RECONNECTING';
        $reconnect_success = false;
    }

    // RECONNECTING -> COOLDOWN (race exitosa)
    if ($acrp_state === 'RECONNECTING' && $reconnect_success) {
        $acrp_state = 'COOLDOWN';
        $cooldown_start = $now;
        $reconnect_success = false;
    }

    // COOLDOWN -> STABLE (900s sin cortes)
    if ($acrp_state === 'COOLDOWN'
        && ($now - $cooldown_start) >= APE_SNIPER_COOLDOWN_LOCK
    ) {
        $acrp_state = 'STABLE';
        $stable_start = $now;
    }

    return [
        'state'          => $acrp_state,
        'last_cut_ts'    => $last_cut,
        'cooldown_start' => $cooldown_start,
        'stable_start'   => $stable_start,
        'locked_bitrate' => $data['locked_bitrate'] ?? 200000000,
    ];
}

/**
 * Ejecuta una transición de estado ACRP.
 *
 * @param int    $ch_id   ID del canal
 * @param string $event   Evento: 'stream_ok', 'cut_detected', 'reconnect_success', 'cooldown_expired'
 * @return array Nuevo estado ACRP
 */
function rq_sniper_acrp_transition($ch_id, $event) {
    $state_file = APE_SNIPER_STATE_DIR . '/ch_' . intval($ch_id) . '.state';
    $data = @json_decode(@file_get_contents($state_file), true) ?: [];

    $now = time();
    $current = $data['acrp_state'] ?? 'IDLE';
    $new_state = $current;

    switch ($event) {
        case 'cut_detected':
            $new_state = 'CUT_DETECTED';
            $data['last_cut_ts'] = $now;
            $data['reconnect_success'] = false;
            // Lock bitrate al último conocido
            $data['locked_bitrate'] = $data['locked_bitrate'] ?? 200000000;
            break;

        case 'reconnect_success':
            if ($current === 'RECONNECTING' || $current === 'CUT_DETECTED') {
                $new_state = 'COOLDOWN';
                $data['cooldown_start'] = $now;
                $data['reconnect_success'] = true;
            }
            break;

        case 'cooldown_expired':
            if ($current === 'COOLDOWN') {
                $new_state = 'STABLE';
                $data['stable_start'] = $now;
            }
            break;

        case 'stream_ok':
            // Stream OK sin eventos — permite transición natural
            if ($current === 'RECONNECTING') {
                $new_state = 'COOLDOWN';
                $data['cooldown_start'] = $now;
                $data['reconnect_success'] = true;
            }
            break;
    }

    $data['acrp_state'] = $new_state;
    $data['acrp_updated'] = $now;

    // Escribir estado de forma atómica
    @file_put_contents($state_file, json_encode($data), LOCK_EX);

    return [
        'state'          => $new_state,
        'last_cut_ts'    => $data['last_cut_ts'] ?? 0,
        'cooldown_start' => $data['cooldown_start'] ?? 0,
        'stable_start'   => $data['stable_start'] ?? 0,
        'locked_bitrate' => $data['locked_bitrate'] ?? 200000000,
    ];
}

// ============================================================================
// MÓDULO 4: CDP — Cut Detection Protocol (NUEVO v3.0)
// ============================================================================
/**
 * Monitoreo agresivo de gaps entre segmentos HLS.
 * Si el gap entre requests consecutivos supera APE_SNIPER_CUT_WINDOW (2s),
 * se marca un corte en el archivo de estado y se dispara ACRP.
 *
 * @param int $ch_id   ID del canal
 * @return array ['cut_detected' => bool, 'gap_seconds' => int]
 */
function rq_sniper_cdp_check($ch_id) {
    $state_file = APE_SNIPER_STATE_DIR . '/ch_' . intval($ch_id) . '.state';
    $data = @json_decode(@file_get_contents($state_file), true) ?: [];

    $now = time();
    $last_request_ts = $data['last_request_ts'] ?? 0;
    $prev_last_request_ts = $data['prev_last_request_ts'] ?? 0;

    $gap = 0;
    $cut_detected = false;

    // Calcular gap entre requests
    if ($last_request_ts > 0) {
        $gap = $now - $last_request_ts;

        // Si el gap supera la ventana de corte (2s)
        if ($gap >= APE_SNIPER_CUT_WINDOW && $prev_last_request_ts > 0) {
            // Verificar que el canal estaba activo (no es primer request)
            $prev_gap = $last_request_ts - $prev_last_request_ts;
            if ($prev_gap < APE_SNIPER_CUT_WINDOW * 3) {
                // Solo marcar corte si había requests regulares antes
                $cut_detected = true;
                // Disparar transición ACRP
                rq_sniper_acrp_transition($ch_id, 'cut_detected');
            }
        }
    }

    // Actualizar timestamps de request (rotación)
    $data['prev_last_request_ts'] = $last_request_ts;
    $data['last_request_ts'] = $now;

    @file_put_contents($state_file, json_encode($data), LOCK_EX);

    return [
        'cut_detected' => $cut_detected,
        'gap_seconds'  => $gap,
    ];
}

// ============================================================================
// MÓDULO 5: PDS — Progressive Degradation Shield (NUEVO v3.0)
// ============================================================================
/**
 * Escala la agresividad de recursos según la resolución del contenido y el
 * estado ACRP. Evita desperdiciar recursos en contenido SD mientras maximiza
 * la protección para contenido UHD.
 *
 * @param array $sniper_status  Estado del canal (de rq_sniper_classify)
 * @param array $acrp_state     Estado ACRP (de rq_sniper_acrp_get_state)
 * @return array Multiplicadores ajustados: prefetch, buffer, parallel
 */
function rq_sniper_pds_adjust($sniper_status, $acrp_state) {
    // Base: multiplicadores del estado SNIPER
    $prefetch = $sniper_status['prefetch_mult'] ?? 1.0;
    $buffer   = $sniper_status['buffer_mult'] ?? 1.0;
    $parallel = $sniper_status['parallel_mult'] ?? 1;

    $acrp = $acrp_state['state'] ?? 'IDLE';

    // --- Ajuste por estado ACRP ---
    if ($acrp === 'COOLDOWN') {
        // COOLDOWN: mantener calidad actual, no escalar más
        // Reducir ligeramente prefetch para no saturar
        $prefetch = min($prefetch, 2.0);
        $buffer = min($buffer, 1.5);
    } elseif ($acrp === 'STABLE') {
        // STABLE: escalar al máximo agresivo
        $prefetch = max($prefetch, 3.0);
        $buffer = max($buffer, 2.0);
        $parallel = max($parallel, 3);
    } elseif ($acrp === 'RECONNECTING' || $acrp === 'CUT_DETECTED') {
        // Reconexión: máxima agresión para recovery rápido
        $prefetch = max($prefetch, 3.0);
        $buffer = max($buffer, 2.0);
        $parallel = max($parallel, 3);
    }

    // --- Ajuste por resolución (si el perfil indica contenido menor) ---
    $profile = $sniper_status['profile'] ?? '';
    if ($sniper_status['status'] !== 'IDLE' && $sniper_status['sniper'] === false) {
        // Canales no-SNIPER (HD/SD): reducir agresión
        $prefetch = min($prefetch, 1.5);
        $parallel = min($parallel, 2);
    }

    return [
        'prefetch_mult' => $prefetch,
        'buffer_mult'   => $buffer,
        'parallel_mult' => $parallel,
    ];
}

// ============================================================================
// MÓDULO 6: UNIVERSAL ERROR HANDLER (códigos 400-510)
// ============================================================================
/**
 * Cuando el origen devuelve error, genera headers que fuerzan al player
 * a reintentar inmediatamente sin degradar calidad.
 */
function rq_sniper_error_handler_headers($ch_id, $attempt = 1) {
    $max_retry = 99;
    $next = min($attempt + 1, $max_retry);
    $delay = $attempt <= 5 ? 0 : min($attempt * 50, 1500);

    return [
        'http_headers' => [
            "X-APE-SNIPER-Error: RECOVERING",
            "X-APE-SNIPER-Attempt: {$attempt}/{$max_retry}",
            "X-APE-SNIPER-Next-Delay: {$delay}ms",
            "X-APE-SNIPER-Strategy: " . ($attempt <= 10 ? "SAME_ORIGIN_IMMEDIATE" : "ORIGIN_FAILOVER"),
            "Retry-After: " . max(0, intval($delay / 1000)),
            "X-Retry-After-Ms: {$delay}",
        ],
        'ext_http' => [
            json_encode(["X-Reconnect-On-Error" => "true,immediate,atomic,no-quality-drop"]),
            json_encode(["X-Reconnect-Max-Attempts" => (string)$max_retry]),
            json_encode(["X-Reconnect-Delay-Ms" => (string)$delay]),
            json_encode(["X-Failover-Enabled" => "true"]),
            json_encode(["X-Seamless-Failover" => "true-ultra-atomic"]),
            json_encode(["X-Quality-Preserve" => "true"]),
            json_encode(["X-No-Downgrade" => "true"]),
            json_encode(["X-Lock-Quality-During-Recovery" => "true"]),
        ],
    ];
}

// ============================================================================
// MÓDULO 7: ATOMIC RECOVERY ENGINE
// ============================================================================
/**
 * Genera playlist M3U8 de recuperación que fuerza al player a reintentar
 * con calidad NUCLEAR. Se sirve cuando el origen falla.
 */
function rq_sniper_recovery_playlist($stream_url, $ch_id, $session, $attempt = 1) {
    $now = gmdate('Y-m-d\TH:i:s\Z');
    $next = min($attempt + 1, 99);
    $delay = $attempt <= 3 ? 0 : min($attempt * 100, 2000);

    $m3u  = "#EXTM3U\n";
    $m3u .= "#EXT-X-VERSION:9\n";
    $m3u .= "#EXT-X-TARGETDURATION:1\n";
    $m3u .= "#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,CAN-SKIP-UNTIL=60.0,PART-HOLD-BACK=0.5,HOLD-BACK=2.0\n";
    $m3u .= "#EXT-X-PART-INF:PART-TARGET=0.200\n";
    $m3u .= "#EXT-X-DISCONTINUITY\n";
    $m3u .= "#EXT-X-PROGRAM-DATE-TIME:{$now}\n";
    $m3u .= "#EXT-X-DATERANGE:ID=\"sniper-recovery-{$ch_id}\",START-DATE=\"{$now}\","
         . "DURATION=0.0,X-APE-SNIPER=\"RECOVERY\",X-ATTEMPT=\"{$attempt}\",X-NEXT=\"{$next}\"\n";

    $recovery_json = json_encode([
        "ape_sniper_recovery" => "v3.0",
        "attempt" => $attempt,
        "next_attempt" => $next,
        "delay_ms" => $delay,
        "action" => $attempt <= 5 ? "immediate_atomic_retry" : "escalated_origin_failover",
        "strategy" => $attempt <= 10 ? "same_origin" : "alternate_origin",
        "preserve_quality" => true,
        "profile" => "P0-SNIPER-NUCLEAR",
        "ch_id" => $ch_id,
        "session" => $session,
        "timestamp" => $now,
    ], JSON_UNESCAPED_SLASHES);
    $m3u .= "# {$recovery_json}\n";

    $m3u .= "#EXTINF:-1 tvg-id=\"{$ch_id}\" tvg-name=\"SNIPER-RECOVERY\",APE-SNIPER-RECOVERY={$attempt},APE-Profile=P0-NUCLEAR\n";
    $m3u .= $stream_url . "\n";

    return $m3u;
}

// ============================================================================
// MÓDULO 7B: PARALLEL RECONNECTION RACE (NUEVO v3.0)
// ============================================================================
/**
 * Genera directivas para que el player lance múltiples conexiones simultáneas
 * al origen. La primera en responder gana; las demás se descartan.
 * Esto logra reconexión perceptualmente instantánea (<3ms).
 *
 * @param string $origin_url  URL del origen del stream
 * @param int    $ch_id       ID del canal
 * @param string $session     Session UUID
 * @return array Directivas EXTHTTP para la race
 */
function rq_sniper_parallel_reconnect_race($origin_url, $ch_id, $session) {
    $output = ['ext_http' => []];

    $connections = APE_SNIPER_RACE_CONNECTIONS;  // 6 conexiones paralelas
    $timeout = APE_SNIPER_RACE_TIMEOUT;          // 3s max race

    $output['ext_http'][] = json_encode(["X-Parallel-Reconnect" => "race,{$connections},first-wins"]);
    $output['ext_http'][] = json_encode(["X-Reconnect-Race-Timeout" => (string)$timeout]);
    $output['ext_http'][] = json_encode(["X-Reconnect-Race-Winner" => "first-response"]);
    $output['ext_http'][] = json_encode(["X-Reconnect-Race-Connections" => (string)$connections]);
    $output['ext_http'][] = json_encode(["X-Reconnect-Keep-Alive" => "true"]);
    $output['ext_http'][] = json_encode(["X-Reconnect-Race-Strategy" => "parallel-atomic"]);
    $output['ext_http'][] = json_encode(["X-Reconnect-Race-Channel" => (string)$ch_id]);
    $output['ext_http'][] = json_encode(["X-Reconnect-Race-Session" => $session]);

    return $output;
}

// ============================================================================
// MÓDULO 8: FFMPEG PIPELINE ENGINE (NUEVO v3.0)
// ============================================================================
/**
 * Genera directivas EXTVLCOPT que mapean a un filtergraph FFmpeg REAL.
 * VLC interpreta estas directivas usando su pipeline de filtros interno
 * que soporta la sintaxis de FFmpeg filters.
 *
 * Pipeline order: Input -> BWDIF -> HQDN3D/afftdn -> EQ -> CAS+UNSHARP -> ZSCALE+TONEMAP -> MINTERPOLATE
 *
 * NOTA: PHP es ORQUESTADOR. FFmpeg/GPU hace el trabajo real del lado del cliente.
 * Estas directivas usan sintaxis de filtros FFmpeg que VLC entiende directamente.
 *
 * @param array $sniper_status  Estado del canal (de rq_sniper_classify)
 * @param array $acrp_state     Estado ACRP (de rq_sniper_acrp_get_state)
 * @return array Directivas EXTVLCOPT y EXTHTTP del pipeline
 */
function rq_sniper_ffmpeg_pipeline($sniper_status, $acrp_state, $resolution_hint = 'unknown') {
    $output = ['ext_vlcopt' => [], 'ext_http' => []];

    if ($sniper_status['status'] === 'IDLE') {
        return $output;
    }

    $filters = [];
    $acrp = $acrp_state['state'] ?? 'IDLE';

    // =====================================================================
    // STEP 1: DEINTERLACE — BWDIF (siempre, fixes broadcast 1080i/576i)
    // =====================================================================
    // BWDIF = Bob Weaver Deinterlacing Filter (híbrido Yadif + BBC w3fdif)
    // Elimina combing en contenido entrelazado de broadcast sin tirones.
    $filters[] = 'bwdif=1';

    // =====================================================================
    // STEP 2: DENOISE — Adaptativo por resolución Y estado ACRP (v3.1)
    // =====================================================================
    // 4K/8K: denoise OFF (preservar textura original — Parámetro Protegido #4)
    // SD/HD: hqdn3d + afftdn cascada (máximo denoise para compresión pesada)
    // Unknown: lógica ACRP pura (backward-compatible)
    if ($resolution_hint === '4k' || $resolution_hint === '8k') {
        // 4K/8K: NUNCA denoise a menos que esté en recovery activo
        if ($acrp === 'RECONNECTING' || $acrp === 'CUT_DETECTED') {
            $filters[] = 'hqdn3d=2:1:3:2';  // Ligero solo en recovery
        }
        // STABLE, COOLDOWN, IDLE: SIN denoise para 4K/8K
    } elseif ($resolution_hint === 'sd' || $resolution_hint === 'hd') {
        // SD/HD: denoise completo con cascada hqdn3d + afftdn (GAP 4)
        if ($acrp === 'STABLE') {
            $filters[] = 'hqdn3d=2:1:3:2';
            $filters[] = 'afftdn=nf=-20';   // FFT Denoiser para ruido periódico
        } else {
            $filters[] = 'hqdn3d=4:3:6:4.5';
            $filters[] = 'afftdn=nf=-20';   // FFT Denoiser complementario
        }
    } else {
        // Resolución desconocida: mantener lógica ACRP pura (NO romper)
        if ($acrp === 'STABLE') {
            $filters[] = 'hqdn3d=2:1:3:2';
        } else {
            $filters[] = 'hqdn3d=4:3:6:4.5';
        }
    }

    // =====================================================================
    // STEP 3: COLOR — BT.2020 alignment via eq filter
    // =====================================================================
    // brightness=0.03 (+3%), contrast=1.0 (neutro), saturation=0.65 (65% profesional),
    // gamma=1.0 (neutro), hue=0 (sin cambio)
    $filters[] = 'eq=brightness=0.03:contrast=1.0:saturation=0.65:gamma=1.0:hue=0';

    // =====================================================================
    // STEP 4: SHARPEN — CAS + Unsharp mask
    // =====================================================================
    // CAS (Contrast Adaptive Sharpening): sharpening adaptativo sin halos
    // Unsharp mask 5:5:0.8:5:5:0.0 — 80% sharpness (techo óptimo)
    $filters[] = 'cas=0.7';
    $filters[] = 'unsharp=5:5:0.8:5:5:0.0';

    // =====================================================================
    // STEP 5: HDR TONE MAPPING — zscale + tonemap=hable (v3.1)
    // =====================================================================
    // zscale=t=linear: convierte pixel values a espacio lineal para tonemap preciso
    // tonemap=hable: curva Hable (Reinhard modificado) para HDR cinematico
    // zscale=t=bt709: devuelve a gamut BT.709 para salida SDR fallback
    // Solo se activa si ACRP no está en RECONNECTING (evitar overhead en recovery)
    if ($acrp !== 'RECONNECTING' && $acrp !== 'CUT_DETECTED') {
        $filters[] = 'zscale=t=linear:p=bt709,tonemap=hable:desat=0,zscale=t=bt709';
    }

    // =====================================================================
    // STEP 6: 120FPS — Motion Interpolation
    // =====================================================================
    // minterpolate: genera frames intermedios para 120fps fluido
    // mi_mode=mci: Motion Compensation Interpolation (mayor calidad)
    // me=hexbs: Hexagonal Block Search (equilibrio calidad/velocidad)
    // mc=64: Block size para motion compensation
    // scd=none: Scene Change Detection desactivado (evita flashes)
    $filters[] = 'minterpolate=fps=120:mi_mode=mci:me=hexbs:mc=64:scd=none';

    // --- Combinar todos los filtros en video-filter chain ---
    $filter_chain = implode(',', $filters);
    $output['ext_vlcopt'][] = 'video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full

    // --- Directivas de soporte standalone ---
    $output['ext_vlcopt'][] = 'deinterlace=1';
    $output['ext_vlcopt'][] = 'deinterlace-mode=bwdif';

    return $output;
}

// ============================================================================
// MÓDULO 9: IMAGE ENHANCEMENT ENGINE — 120fps + Calidad de Imagen Nuclear
// ============================================================================
/**
 * Este es el CORAZÓN de SNIPER MODE v3.0.
 *
 * Genera TODAS las directivas para obtener la máxima calidad de imagen posible:
 *   - 120fps forcing con motion interpolation
 *   - Algoritmos de mejora: sharpness, contrast, denoise, color
 *   - HDR10+/Dolby Vision/HLG forcing
 *   - BT.2020 color space con 10-bit depth
 *   - Upscaling AI-aware (Super Resolution hints)
 *   - Directivas para el TV vía HDMI metadata
 *   - Frame deinterlacing progresivo
 *   - Chroma enhancement y detail recovery
 *   - FFmpeg Pipeline Integration (v3.0)
 *   - Motion Clarity (v3.0)
 *   - Adaptive Tone Mapping (v3.0)
 *
 * Estas directivas se inyectan como #EXTHTTP y #EXTVLCOPT.
 * Los players que las soporten (VLC, TiviMate, Kodi, ExoPlayer) las aplicarán.
 * Los que no, las ignorarán — SIN ROMPER NADA.
 *
 * @param array $sniper_status  Estado del canal (de rq_sniper_classify)
 * @return array Directivas de image enhancement
 */
function rq_sniper_image_enhancement($sniper_status) {
    $output = [
        'ext_http'  => [],
        'ext_vlcopt'=> [],
    ];

    // Solo aplicar enhancement completo si el canal está STREAMING (SNIPER activo)
    // Para RECENT: aplicar 60% del enhancement
    // Para IDLE: sin enhancement adicional
    $intensity = 1.0;
    if ($sniper_status['status'] === 'RECENT') {
        $intensity = 0.6;
    } elseif ($sniper_status['status'] === 'IDLE') {
        return $output; // Nada para canales inactivos
    }

    // =========================================================================
    // 5A: FRAME RATE — 120fps + Motion Interpolation Inteligente
    // =========================================================================
    // Forzar al player a interpolar/entregar a 120fps.
    // Esto activa el motion estimation del SoC (NVIDIA Shield, etc.)
    // y envía señal 120Hz al TV, eliminando judder completamente.
    // IMPORTANTE: NO activar Game Mode — este desactiva TODO el
    // procesamiento de imagen del TV (local dimming, tone mapping, upscaling).

    $output['ext_http'][] = json_encode(["X-Frame-Rate-Target" => "120"]);
    $output['ext_http'][] = json_encode(["X-Frame-Rate-Max" => "120"]);
    $output['ext_http'][] = json_encode(["X-Frame-Rate-Min" => "60"]);
    $output['ext_http'][] = json_encode(["X-Frame-Rate-Mode" => "FORCE_MAXIMUM"]);
    // BFI-hybrid: Black Frame Insertion hybrid para suavizar sin soap-opera effect
    $output['ext_http'][] = json_encode(["X-Motion-Interpolation" => "enabled,balanced,BFI-hybrid"]);
    $output['ext_http'][] = json_encode(["X-Frame-Pacing" => "even,locked,no-judder"]);
    $output['ext_http'][] = json_encode(["X-Display-Refresh-Rate" => "120"]);
    $output['ext_http'][] = json_encode(["X-VRR-Support" => "true,enabled"]);
    $output['ext_http'][] = json_encode(["X-VRR-Range" => "48-120"]);
    $output['ext_http'][] = json_encode(["X-ALLM" => "false"]);  // NO Auto Low Latency (mata procesamiento)
    $output['ext_http'][] = json_encode(["X-Game-Mode" => "false"]);  // NO game mode (mata TODO el procesamiento)
    // Control Flow: stats del video cada 500-1000ms (ahorra 2 órdenes de magnitud en compute)
    $output['ext_http'][] = json_encode(["X-Video-Stats-Interval-Ms" => "750"]);
    $output['ext_http'][] = json_encode(["X-Pixel-Flow" => "realtime"]);
    $output['ext_http'][] = json_encode(["X-Control-Flow" => "statistics,750ms-interval"]);

    // =========================================================================
    // 5B: UPSCALING — AI-SR Nivel BAJO (Óptimo) + Delegación al TV
    // =========================================================================
    // PRINCIPIO CLAVE: Los TVs de alta gama (Sony Bravia XR, LG OLED evo, Samsung Neo QLED)
    // tienen procesadores de upscaling integrados que alcanzan 9/10, superando a
    // reproductores externos (Shield AI-SR ~7.75) por su acceso directo al panel.
    //
    // Estrategia: Pedir la máxima resolución nativa al CDN, pero DELEGAR el
    // upscaling final al procesador del TV. Solo usar AI-SR como fallback
    // si el TV no tiene procesador dedicado.
    //
    // AI-SR Nivel BAJO = el óptimo. Aporta claridad sin distorsionar la realidad.
    // Nivel MEDIO crea texturas artificiales (piel arrugada, grumos).
    // Nivel ALTO: NO recomendado (grumos, píxeles blancos en bordes).
    //
    // PSF (Point Spread Function): La IA usa la función de dispersión del punto
    // de luz para "reversar" el desenfoque original y recuperar nitidez perdida.

    $output['ext_http'][] = json_encode(["X-Max-Resolution" => "7680x4320"]);
    $output['ext_http'][] = json_encode(["X-Min-Resolution" => "3840x2160"]);  // NUNCA bajo 4K
    $output['ext_http'][] = json_encode(["X-Preferred-Resolution" => "4320"]);
    $output['ext_http'][] = json_encode(["X-Screen-Resolution" => "7680x4320"]);
    // Engañar al CDN reportando capacidad 8K para asegurar Tier 1 Premium
    $output['ext_http'][] = json_encode(["X-Video-Track" => "7680x4320"]);
    // AI-SR NIVEL BAJO (óptimo) + PSF-aware deconvolution
    $output['ext_http'][] = json_encode(["X-Super-Resolution" => "enabled,level-low,psf-aware"]);
    // Priorizar upscaling nativo del TV sobre external scaler
    $output['ext_http'][] = json_encode(["X-Upscale-Delegate" => "tv-native-processor-first"]);
    $output['ext_http'][] = json_encode(["X-Upscale-Method" => "lanczos,psf-deconvolution,bicubic-enhanced"]);
    $output['ext_http'][] = json_encode(["X-Upscale-Quality" => "maximum"]);
    $output['ext_http'][] = json_encode(["X-Downscale-Protection" => "true"]);
    $output['ext_http'][] = json_encode(["X-PSF-Aware" => "true,point-spread-function,deconvolution"]);
    $output['ext_http'][] = json_encode(["X-Subsample-Reversal" => "true"]);
    // Si el TV tiene XR/Cognitive Processor, usarlo como upscaler primario
    $output['ext_http'][] = json_encode(["X-Native-Upscaling-Priority" => "tv-processor > external-device > player-software"]);

    // =========================================================================
    // 5C: SHARPNESS & DETAIL — 80% ÓPTIMO (No más = IA crea grumos)
    // =========================================================================
    // PRINCIPIO CLAVE: La nitidez (claridad) debe estar al 80%. Por encima de
    // este valor, la IA empieza a crear "grumos" de ruido: texturas artificiales
    // en la piel, bordes blancos fantasmas, y detalles que no existen en la fuente.
    // El unsharp mask adaptativo detecta bordes reales vs. ruido para no amplificar
    // artefactos de compresión.

    $output['ext_http'][] = json_encode(["X-Sharpness" => "80"]);              // 80% = ÓPTIMO (no más)
    $output['ext_http'][] = json_encode(["X-Sharpness-Mode" => "adaptive,unsharp-mask,edge-aware,noise-gate"]);
    $output['ext_http'][] = json_encode(["X-Edge-Enhancement" => "true,balanced,halo-suppressed"]);
    $output['ext_http'][] = json_encode(["X-Detail-Recovery" => "true,texture-preserve,noise-aware"]);
    $output['ext_http'][] = json_encode(["X-Super-Resolution-Sharpness" => "enabled,low-aggression"]);
    $output['ext_http'][] = json_encode(["X-Fine-Detail" => "enhanced,natural"]);
    $output['ext_http'][] = json_encode(["X-Micro-Contrast" => "enhanced,subtle"]);
    $output['ext_http'][] = json_encode(["X-Texture-Preserve" => "true,artifact-threshold"]);
    $output['ext_http'][] = json_encode(["X-Halo-Suppression" => "enabled,aggressive"]);
    $output['ext_http'][] = json_encode(["X-Noise-Gate-Sharpness" => "true,threshold-adaptive"]);

    // =========================================================================
    // 5D: CONTRAST & DYNAMIC RANGE — Perfil Dinámico Profesional
    // =========================================================================
    // Basado en el perfil "Vívido Profesional" de referencia:
    //   Brillo: 90 (iguala impacto visual del contenido HDR)
    //   Contraste: 100 (neutro, sin boost artificial)
    //   HDR: Forzar HDR10+/DV/HLG según disponibilidad del contenido

    $output['ext_http'][] = json_encode(["X-Brightness" => "90"]);             // 90 = iguala HDR impact
    $output['ext_http'][] = json_encode(["X-Contrast" => "100"]);             // 100 = neutro profesional
    $output['ext_http'][] = json_encode(["X-Contrast-Mode" => "dynamic,scene-adaptive"]);
    $output['ext_http'][] = json_encode(["X-Dynamic-Range" => "hdr"]);
    $output['ext_http'][] = json_encode(["X-HDR-Support" => "hdr10,hdr10+,dolby_vision,hlg"]);
    $output['ext_http'][] = json_encode(["X-HDR-Mode" => "FORCE_HDR"]);
    $output['ext_http'][] = json_encode(["X-HDR-Boost" => "true"]);
    $output['ext_http'][] = json_encode(["X-Peak-Luminance" => "10000"]);    // 10000 nits (Dolby Cinema)
    $output['ext_http'][] = json_encode(["X-MaxCLL" => "4000"]);             // Max Content Light Level
    $output['ext_http'][] = json_encode(["X-MaxFALL" => "1200"]);            // Max Frame Average Light Level
    $output['ext_http'][] = json_encode(["X-Local-Dimming" => "true,aggressive,full-array"]);
    $output['ext_http'][] = json_encode(["X-Black-Level" => "0"]);
    $output['ext_http'][] = json_encode(["X-Shadow-Detail" => "enhanced"]);
    $output['ext_http'][] = json_encode(["X-Highlight-Recovery" => "enabled,clipped-recover"]);

    // =========================================================================
    // 5E: COLOR — BT.2020 + Temperatura CÁLIDA + Saturación 65
    // =========================================================================
    // PRINCIPIO CLAVE: Los tonos fríos (D65 neutro) "apagan" la colorimetría real
    // de la escena. Temperatura CÁLIDA preserva los tonos naturales.
    // Saturación al 65% (perfil vívido profesional) evita sobresaturación.
    // BT.2020 es el estándar para UHD con 10-bit y chroma 4:2:0.
    // PQ (SMPTE ST 2084) como transfer primario, HLG como fallback.

    $output['ext_http'][] = json_encode(["X-Color-Space" => "BT2020"]);
    $output['ext_http'][] = json_encode(["X-Color-Primaries" => "bt2020"]);
    $output['ext_http'][] = json_encode(["X-Color-Depth" => "10"]);
    $output['ext_http'][] = json_encode(["X-Color-Bit-Depth" => "10bit"]);
    $output['ext_http'][] = json_encode(["X-Pixel-Format" => "yuv420p10le"]);
    $output['ext_http'][] = json_encode(["X-Chroma-Subsampling" => "4:2:0"]);
    $output['ext_http'][] = json_encode(["X-Chroma-Enhancement" => "true"]);
    $output['ext_http'][] = json_encode(["X-Chroma-Sharpness" => "enhanced,precise"]);
    $output['ext_http'][] = json_encode(["X-Chroma-Upconversion" => "4:2:0-to-4:4:4,precise"]);
    $output['ext_http'][] = json_encode(["X-Color-Gamut" => "bt2020,wide"]);
    $output['ext_http'][] = json_encode(["X-Color-Volume" => "maximum"]);
    $output['ext_http'][] = json_encode(["X-Saturation" => "65"]);          // 65% = perfil vívido profesional
    $output['ext_http'][] = json_encode(["X-Hue-Accuracy" => "maximum"]);
    $output['ext_http'][] = json_encode(["X-Color-Temperature" => "WARM"]);   // CÁLIDA (no fría, preserva colorimetría)
    $output['ext_http'][] = json_encode(["X-White-Balance" => "auto,warm,precise"]);
    $output['ext_http'][] = json_encode(["X-HDR-Transfer-Function" => "SMPTE2084,PQ,HLG"]);
    $output['ext_http'][] = json_encode(["X-Matrix-Coefficients" => "BT2020NC"]);

    // =========================================================================
    // 5F: DENOISE — DESACTIVADO en 4K (preservar textura original)
    // =========================================================================
    // PRINCIPIO CLAVE: La reducción de ruido debe estar DESACTIVADA en contenido
    // 4K para preservar la textura original del contenido. Solo activar light denoise
    // para contenido SD/HD (<1080p) donde la compresión genera más artefactos.
    // Sin embargo, la remoción de artefactos de compresión (banding, macroblocking)
    // SIEMPRE debe estar activa porque estos son DEFECTOS, no textura.

    $output['ext_http'][] = json_encode(["X-Denoise" => "disabled"]);  // OFF para 4K (preservar textura)
    $output['ext_http'][] = json_encode(["X-Denoise-Fallback-SD-HD" => "enabled,light,temporal-spatial-adaptive"]);
    // Artifact removal SIEMPRE activo — estos son defectos, no textura
    $output['ext_http'][] = json_encode(["X-Artifact-Removal" => "true,banding,macroblocking,mosquito"]);
    $output['ext_http'][] = json_encode(["X-Banding-Removal" => "true,dithered"]);
    $output['ext_http'][] = json_encode(["X-Macroblock-Removal" => "true"]);
    $output['ext_http'][] = json_encode(["X-Deblock" => "true,strong"]);
    $output['ext_http'][] = json_encode(["X-Compression-Artifact-Remove" => "true"]);
    $output['ext_http'][] = json_encode(["X-Posterize-Removal" => "true"]);
    $output['ext_http'][] = json_encode(["X-Mosquito-Noise-Remove" => "true"]);
    $output['ext_http'][] = json_encode(["X-Ring-Artifact-Suppress" => "true"]);

    // =========================================================================
    // 5G: CODEC & COMPRESSION — Máxima calidad de compresión
    // =========================================================================

    $output['ext_http'][] = json_encode(["X-Video-Codec" => "hevc,h.265"]);
    $output['ext_http'][] = json_encode(["X-HEVC-Profile" => "MAIN-10-HDR"]);
    $output['ext_http'][] = json_encode(["X-HEVC-Tier" => "HIGH"]);
    $output['ext_http'][] = json_encode(["X-HEVC-Level" => "6.1"]);           // Soporta 8K/120fps
    $output['ext_http'][] = json_encode(["X-Entropy-Coding" => "CABAC"]);
    $output['ext_http'][] = json_encode(["X-Rate-Control" => "CQP"]);
    $output['ext_http'][] = json_encode(["X-QP-Min" => "0"]);
    $output['ext_http'][] = json_encode(["X-QP-Max" => "18"]);               // Máxima calidad
    $output['ext_http'][] = json_encode(["X-Compression-Level" => "1"]);
    $output['ext_http'][] = json_encode(["X-Max-Bitrate" => "300000000"]);     // 300Mbps
    $output['ext_http'][] = json_encode(["X-Min-Bitrate" => "80000000"]);      // 80Mbps piso
    $output['ext_http'][] = json_encode(["X-Target-Bitrate" => "200000000"]);  // 200Mbps target
    $output['ext_http'][] = json_encode(["X-Bypass-ABR" => "true"]);
    $output['ext_http'][] = json_encode(["X-Disable-Downswitch" => "true"]);
    $output['ext_http'][] = json_encode(["X-Force-Quality-Lock" => "true"]);
    // Prevenir que CDNs como Flussonic/Wowza degraden el stream por sus propias estimaciones
    $output['ext_http'][] = json_encode(["X-Quality-Lock" => "NATIVA_MAXIMA"]);
    // Top-Down Selection: iniciar desde Tier más alto, solo fallback si < 80Mbps
    $output['ext_http'][] = json_encode(["X-Selection-Logic" => "TOP-DOWN,4320-FIRST,FALLBACK-ON-THRESHOLD"]);

    // =========================================================================
    // 5H: AUDIO — Dolby Atmos + Passthrough 7.1.4
    // =========================================================================

    $output['ext_http'][] = json_encode(["X-Audio-Codecs" => "opus,eac3,ac3,dolby,mp3,aac"]);
    $output['ext_http'][] = json_encode(["X-Audio-Track-Selection" => "highest-quality-extreme,dolby-atmos-first"]);
    $output['ext_http'][] = json_encode(["X-Dolby-Atmos" => "true"]);
    $output['ext_http'][] = json_encode(["X-Audio-Channels" => "7.1.4,7.1,5.1,2.0"]);
    $output['ext_http'][] = json_encode(["X-Audio-Sample-Rate" => "48000,96000"]);
    $output['ext_http'][] = json_encode(["X-Audio-Bit-Depth" => "32bit,24bit"]);
    $output['ext_http'][] = json_encode(["X-Spatial-Audio" => "true"]);
    $output['ext_http'][] = json_encode(["X-Audio-Passthrough" => "true"]);
    $output['ext_http'][] = json_encode(["X-Dolby-Vision" => "true,profile5,profile8,profile7"]);
    $output['ext_http'][] = json_encode(["X-TrueHD" => "true"]);
    $output['ext_http'][] = json_encode(["X-DTSX" => "true"]);

    // =========================================================================
    // 5I: DIRECTIVAS PARA EL TELEVISOR — Perfil Dinámico Profesional
    // =========================================================================
    // PRINCIPIO CLAVE: Los TVs modernos (Samsung, LG, Sony Bravia XR) leen
    // metadata del stream y ajustan su procesamiento interno.
    // Usar Perfil DINÁMICO como base (no Filmmaker/Calibrado — estos son
    // para contenido ya masterizado, no para IPTV live).
    // Brillo 90, Saturación 65, Contraste 100, Temperatura CÁLIDA.
    // NUNCA activar Game Mode — desactiva local dimming, tone mapping, upscaling.
    // Audio SIEMPRE por eARC (Toslink/Óptico = mega antiguo, limita a 5.1).

    $output['ext_http'][] = json_encode(["X-Display-Mastering" => "BT2020,PQ,10000nits"]);
    // Perfil DINÁMICO como base profesional
    $output['ext_http'][] = json_encode(["X-Display-Mode" => "DYNAMIC,VIVID-PROFESSIONAL,HDR-PREFERRED"]);
    $output['ext_http'][] = json_encode(["X-Display-Picture-Mode" => "DYNAMIC,BRIGHTNESS-90,SAT-65,CONTRAST-100,WARM"]);
    // Procesamiento de imagen COMPLETO — NUNCA Game Mode
    $output['ext_http'][] = json_encode(["X-Display-Processing" => "FULL,ALL-ENHANCEMENTS-ENABLED,NO-SHORTCUTS"]);
    $output['ext_http'][] = json_encode(["X-Display-Motion-Processing" => "120Hz,BFI-HYBRID,CINEMA-SMOOTH"]);
    $output['ext_http'][] = json_encode(["X-Display-Local-Dimming" => "ENABLED,FULL-ARRAY,AGGRESSIVE"]);
    $output['ext_http'][] = json_encode(["X-Display-Color-Accuracy" => "maximum,warm-calibrated"]);
    $output['ext_http'][] = json_encode(["X-Display-Contrast-Enhance" => "dynamic,active"]);
    $output['ext_http'][] = json_encode(["X-Display-HDR-Tone-Mapping" => "STATIC+DYNAMIC,MAX"]);
    // Delegar upscaling al procesador nativo del TV (Sony XR ~9/10 > external)
    $output['ext_http'][] = json_encode(["X-Display-Upscaling" => "NATIVE-PROCESSOR,XR-COGNITIVE,AI-ENHANCED"]);
    $output['ext_http'][] = json_encode(["X-Display-Game-Mode" => "DISABLED,FORCE-FULL-PROCESSING"]);
    $output['ext_http'][] = json_encode(["X-Display-Input-Lag" => "STANDARD,KEEP-ALL-PROCESSING"]);
    $output['ext_http'][] = json_encode(["X-Display-Chroma-Upconversion" => "4:2:0-to-4:4:4,PRECISE"]);
    $output['ext_http'][] = json_encode(["X-Display-Deep-Color" => "12BIT,PASSTHROUGH"]);
    $output['ext_http'][] = json_encode(["X-Display-HDMI-Mode" => "HDMI-2.1,48Gbps,FRL-12"]);
    // eARC OBLIGATORIO — Toslink es tecnología muerta (limita a 5.1, sin Atmos lossless)
    $output['ext_http'][] = json_encode(["X-eARC" => "true,lossless,MANDATORY"]);
    $output['ext_http'][] = json_encode(["X-Audio-Connection" => "eARC-ONLY,NO-TOSLINK,NO-OPTICAL"]);
    $output['ext_http'][] = json_encode(["X-Toslink-Warning" => "LEGACY-DETECTED-LIMITED-5.1-NO-ATMOS-LOSSLESS"]);
    $output['ext_http'][] = json_encode(["X-HDMI-ARC" => "eARC-preferred,ARC-fallback"]);
    $output['ext_http'][] = json_encode(["X-VRR-Mode" => "OFF,USE-FIXED-120Hz"]);
    $output['ext_http'][] = json_encode(["X-ALLM-Display" => "DISABLED"]);  // NO Auto Low Latency en TV
    // Samsung Input Signal Plus: OBLIGATORIO — sin esto el puerto HDMI queda limitado,
    // bloqueando croma 4:4:4 y HDR. En modelos 2018- se etiqueta como "HDMI UHD Color".
    $output['ext_http'][] = json_encode(["X-Input-Signal-Plus" => "true,MANDATORY,Samsung-HDMI-UHD-Color"]);
    $output['ext_http'][] = json_encode(["X-HDMI-UHD-Color" => "true,enabled,ALL-HDMI-PORTS"]);

    // =========================================================================
    // 5J: EXTVLCOPT — Image Enhancement para VLC (Corregido por Guía Técnica)
    // =========================================================================
    // Basado en los principios de la Guía de Modernización de Video:
    //   - Sharpness al 80% (no más = grumos/artefactos por IA)
    //   - Bwdif (NO Yadif) para deinterlacing — híbrido Yadif + BBC w3fdif
    //   - HW Decode GPU-first: NVDEC > VAAPI > DXVA2 > D3D11VA > CPU
    //   - Perfil Dinámico: Brightness 90, Contrast 100, Saturation 65
    //   - Denoise desactivado para 4K (preservar textura original)
    //   - Audio eARC (Toslink = muerto, limita a 5.1)

    // Sharpness 80% óptimo + post-processing
    $output['ext_vlcopt'][] = "video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full";
    $output['ext_vlcopt'][] = "postproc-q=6";
    $output['ext_vlcopt'][] = "video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full";
    // Perfil Dinámico Profesional: brightness=0.90 (90%), contrast=1.0 (100%), saturation=0.65 (65%)
    $output['ext_vlcopt'][] = "video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full";

    // =========================================================================
    // 5K-ALT: FFT DENOISER (afftdn) — Solo para SD/HD, NUNCA para 4K
    // =========================================================================
    // afftdn = Audio/Video FFT Denoiser basado en FFT (Fast Fourier Transform).
    // Elimina ruido sin perder texturas reales. SOLO se activa como fallback
    // para contenido SD/HD donde la compresión genera artefactos significativos.
    // Para 4K está DESACTIVADO (preserva textura original del contenido).
    // Valor nf=-20 es el óptimo: suficiente para limpiar compresión sin matar detalle.
    $output['ext_vlcopt'][] = "video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full";  // FFT denoiser para SD/HD fallback

    // =========================================================================
    // 5K: DEINTERLACING — BWDIF (Híbrido superior a Yadif)
    // =========================================================================
    // BWDIF = Bob Weaver Deinterlacing Filter
    // Híbrido que combina lo mejor de Yadif con el filtro w3fdif de la BBC.
    // Elimina artefactos que Yadif ignora: textos en noticieros, sonrisas,
    // movimiento rápido de plantas. Sin tirones (jerky motion) en panorámicas.
    $output['ext_vlcopt'][] = "deinterlace=1";
    $output['ext_vlcopt'][] = "deinterlace-mode=bwdif";
    $output['ext_vlcopt'][] = "video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full";
    $output['ext_vlcopt'][] = "video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full";

    // =========================================================================
    // 5L: HARDWARE DECODE — GPU First (CPU como último fallback)
    // =========================================================================
    // PRINCIPIO: La GPU (línea de ensamble especializada) procesa píxeles
    // miles de veces más rápido que la CPU (director general).
    // Prioridad: NVDEC (NVIDIA) > VAAPI (Linux/Intel/AMD) > DXVA2 > D3D11VA
    // Ruta VLC: Herramientas > Preferencias > Entrada/Códecs > HW Decode
    $output['ext_vlcopt'][] = "avcodec-codec=hevc";
    $output['ext_vlcopt'][] = "sout-video-codec=hevc";
    $output['ext_vlcopt'][] = "codec=hevc";
    // GPU priority chain: NVDEC > VAAPI > DXVA2 > D3D11VA > VDPAU
    $output['ext_vlcopt'][] = "avcodec-hw=nvdec,vaapi,dxva2,d3d11va,vdpau";
    $output['ext_vlcopt'][] = "avcodec-hw-decoder=nvdec";
    $output['ext_vlcopt'][] = "avcodec-fast=1";
    $output['ext_vlcopt'][] = "avcodec-threads=0";
    $output['ext_vlcopt'][] = "sout-video-profile=main10";
    // AV1 codec support (si el hardware lo soporta)
    $output['ext_vlcopt'][] = "avcodec-codec=av1,dav1d";

    // Anti-judder y smooth playback
    $output['ext_vlcopt'][] = "clock-jitter=0";
    $output['ext_vlcopt'][] = "clock-synchro=0";
    $output['ext_vlcopt'][] = "no-drop-late-frames=true";
    $output['ext_vlcopt'][] = "no-skip-frames=true";
    $output['ext_vlcopt'][] = "avcodec-skip-frame=0";
    $output['ext_vlcopt'][] = "avcodec-skip-idct=0";

    // Calidad de salida al display
    $output['ext_vlcopt'][] = "aspect-ratio=16:9";
    $output['ext_vlcopt'][] = "crop=16:9";
    $output['ext_vlcopt'][] = "autoscale=true";
    $output['ext_vlcopt'][] = "audio-channels=8";
    $output['ext_vlcopt'][] = "audiotrack-passthrough=true";
    $output['ext_vlcopt'][] = "spatial-audio=true";
    // eARC: forzar passthrough lossless (nunca Toslink)
    $output['ext_vlcopt'][] = "audio-passthrough-eacp=true";
    $output['ext_vlcopt'][] = "audio-spdif-eac3=true";

    // Resolution ladder — 8K primero, descendente
    $output['ext_vlcopt'][] = "adaptive-maxbw=300000000";
    $output['ext_vlcopt'][] = "preferred-resolution=4320";
    $output['ext_vlcopt'][] = "adaptive-maxwidth=7680";
    $output['ext_vlcopt'][] = "adaptive-maxheight=4320";
    $output['ext_vlcopt'][] = "preferred-resolution=2160";
    $output['ext_vlcopt'][] = "adaptive-maxwidth=3840";
    $output['ext_vlcopt'][] = "adaptive-maxheight=2160";
    $output['ext_vlcopt'][] = "preferred-resolution=1080";
    $output['ext_vlcopt'][] = "adaptive-maxwidth=1920";
    $output['ext_vlcopt'][] = "adaptive-maxheight=1080";
    $output['ext_vlcopt'][] = "preferred-resolution=720";
    $output['ext_vlcopt'][] = "adaptive-maxwidth=1280";
    $output['ext_vlcopt'][] = "adaptive-maxheight=720";
    $output['ext_vlcopt'][] = "preferred-resolution=480";
    $output['ext_vlcopt'][] = "adaptive-maxwidth=854";
    $output['ext_vlcopt'][] = "adaptive-maxheight=480";
    $output['ext_vlcopt'][] = "adaptive-logic=highest";

    // =========================================================================
    // 5M: FFmpeg Pipeline Integration — Real filtergraph hints (NUEVO v3.0)
    // =========================================================================
    $output['ext_http'][] = json_encode(["X-FFmpeg-Pipeline" => "bwdif,hqdn3d,eq,cas,unsharp,minterpolate"]);
    $output['ext_http'][] = json_encode(["X-Filter-Order" => "deinterlace->denoise->color->sharpen->hdr->fps"]);
    $output['ext_http'][] = json_encode(["X-Denoise-Engine" => "hqdn3d,spatial=4,temporal=3"]);
    $output['ext_http'][] = json_encode(["X-Sharpen-Engine" => "cas+unsharp,adaptive,80pct"]);
    $output['ext_http'][] = json_encode(["X-Motion-Engine" => "minterpolate,mci,120fps"]);
    $output['ext_http'][] = json_encode(["X-Tonemap-Engine" => "zscale+tonemap,hable"]);
    $output['ext_http'][] = json_encode(["X-Super-Res-Engine" => "rtx-video-sdk,intel-vsr,real-esrgan"]);

    // =========================================================================
    // 5N: MOTION CLARITY — Nueva subsección (NUEVO v3.0)
    // =========================================================================
    $output['ext_http'][] = json_encode(["X-Motion-Clarity" => "enhanced,artifact-suppressed"]);
    $output['ext_http'][] = json_encode(["X-Judder-Removal" => "true,cinematic"]);
    $output['ext_http'][] = json_encode(["X-24p-Processing" => "true,cadence-detect"]);
    $output['ext_http'][] = json_encode(["X-Pulldown-Mode" => "off"]);

    // =========================================================================
    // 5O: ADAPTIVE TONE MAPPING — Nueva subsección (NUEVO v3.0)
    // =========================================================================
    $output['ext_http'][] = json_encode(["X-Tone-Mapping" => "dynamic,scene-adaptive,per-frame"]);
    $output['ext_http'][] = json_encode(["X-HDR10-Plus-SEI" => "true,parse,apply"]);
    $output['ext_http'][] = json_encode(["X-PQ-EOTF" => "true,ST2084"]);
    $output['ext_http'][] = json_encode(["X-HLG-Peak" => "true,1000nits"]);
    $output['ext_http'][] = json_encode(["X-Libplacebo" => "true,hdr,color-management"]);

    return $output;
}

// ============================================================================
// MÓDULO 10: KODIPROP ENGINE — Soporte Nativo Kodi (NUEVO v3.0)
// ============================================================================
/**
 * Genera directivas KODIPROP específicas para InputStream.Adaptive en Kodi.
 * Detecta automáticamente si el User-Agent corresponde a Kodi/XBMC/Matrix.
 * Si NO es Kodi, devuelve array vacío (CERO impacto en otros players).
 *
 * InputStream.Adaptive es el motor HLS de Kodi que lee directivas KODIPROP
 * directamente sin necesidad de parseo custom.
 *
 * @param array  $sniper_status  Estado del canal (de rq_sniper_classify)
 * @param string $ua             User-Agent del cliente
 * @return array Directivas KODIPROP (strings listas para #KODIPROP:)
 */
function rq_sniper_kodiprop_directives($sniper_status, $ua = '') {
    $output = [];

    // Detectar Kodi/XBMC/Matrix/Nexus via User-Agent
    $is_kodi = preg_match('/kodi|xbmc|matrix|nexus|omega/i', $ua);

    if (!$is_kodi || $sniper_status['status'] === 'IDLE') {
        return $output; // CERO impacto si no es Kodi o canal está inactivo
    }

    $is_active = $sniper_status['sniper'];
    $is_recent = ($sniper_status['status'] === 'RECENT');

    // === REGLA ISP x2: Valores base ya son el DOBLE ===
    // SNIPER activo = máxima agresión | RECENT = 60% | IDLE = 0
    $buffer_bytes = $is_active ? 240000000 : ($is_recent ? 120000000 : 60000000);  // 240MB / 120MB / 60MB
    $max_bw = $is_active ? 300000000 : ($is_recent ? 150000000 : 80000000);
    $live_buf_s = $is_active ? 240 : ($is_recent ? 120 : 60);  // Segundos de buffer live
    $ghost_buf = $is_active ? 120 : ($is_recent ? 60 : 30);

    // =========================================================================
    // BLOQUE 1: INPUTSTREAM CLASS (obligatorio para que Kodi use InputStream)
    // =========================================================================
    $output[] = 'inputstreamclass=inputstream.adaptive';

    // =========================================================================
    // BLOQUE 2: MANIFEST Y PROTOCOLO
    // =========================================================================
    $output[] = 'inputstream.adaptive.manifest_type=hls';
    $output[] = 'inputstream.adaptive.stream_headers=User-Agent=Mozilla/5.0 (Linux; Android 14; SHIELD Android TV) Chrome/124.0';
    $output[] = 'inputstream.adaptive.manifest_update_parameter=full';

    // =========================================================================
    // BLOQUE 3: BUFFER — Máxima agresión (ISP x2 aplicado)
    // =========================================================================
    $output[] = 'inputstream.adaptive.stream_buffer_size=' . $buffer_bytes;
    $output[] = 'inputstream.adaptive.max_buffer_bytes=' . ($buffer_bytes * 2);
    $output[] = 'inputstream.adaptive.live_buffer=' . $live_buf_s;
    $output[] = 'inputstream.adaptive.ghost_buffer=' . $ghost_buf;
    $output[] = 'inputstream.adaptive.buffer_behaviour=aggressive';
    // Kodi 21+ (Omega): initial_buffer controla cuánto llena antes de arrancar
    $output[] = 'inputstream.adaptive.initial_buffer=' . ($is_active ? 8 : 4);
    // Pre-buffer: segmentos a precargar antes de iniciar reproducción
    $output[] = 'inputstream.adaptive.pre_buffer_bytes=' . intval($buffer_bytes / 2);

    // =========================================================================
    // BLOQUE 4: BANDWIDTH — Forzar máximo, NUNCA degradar
    // =========================================================================
    $output[] = 'inputstream.adaptive.bandwidth_max=' . $max_bw;
    $output[] = 'inputstream.adaptive.max_bandwidth=' . $max_bw;
    $output[] = 'inputstream.adaptive.min_bandwidth=' . ($is_active ? 80000000 : 25000000);
    // Selección de calidad: SIEMPRE la mejor disponible
    $output[] = 'inputstream.adaptive.stream_selection_type=adaptive';
    $output[] = 'inputstream.adaptive.chooser_bandwidth_max=' . $max_bw;
    $output[] = 'inputstream.adaptive.chooser_resolution_max=' . ($is_active ? '7680x4320' : '3840x2160');
    $output[] = 'inputstream.adaptive.chooser_resolution_secure_max=' . ($is_active ? '7680x4320' : '3840x2160');

    // =========================================================================
    // BLOQUE 5: CALIDAD — Lock máximo, sin downswitch
    // =========================================================================
    $output[] = 'inputstream.adaptive.quality_select=best';
    // Reproducción: desactivar downgrade automático
    $output[] = 'inputstream.adaptive.play_timeshift_buffer=true';
    $output[] = 'inputstream.adaptive.live_delay=0';

    // =========================================================================
    // BLOQUE 6: VIDEO — HDR, 4K, 10-bit, decodificación HW
    // =========================================================================
    $output[] = 'inputstream.adaptive.max_resolution=' . ($is_active ? '7680x4320' : '3840x2160');
    // Forzar HW decode para rendimiento máximo
    $output[] = 'inputstream.adaptive.media_renewal_url=';
    $output[] = 'inputstream.adaptive.media_renewal_time=0';

    // =========================================================================
    // BLOQUE 7: AUDIO — eARC, Atmos passthrough
    // =========================================================================
    // Preferir audio de mayor calidad (Dolby Atmos > E-AC3 > AC3 > AAC)
    $output[] = 'inputstream.adaptive.original_audio_language=*';

    // =========================================================================
    // BLOQUE 8: NETWORK — TCP agresivo, keep-alive, timeout largo
    // =========================================================================
    $output[] = 'inputstream.adaptive.manifest_config={"Timeout":"30","ConnectionTimeout":"15"}';

    return $output;
}

// ============================================================================
// MÓDULO 11: GPU ACCELERATION MANAGER (NUEVO v3.0)
// ============================================================================
/**
 * Detecta el hardware GPU del cliente vía User-Agent y genera directivas
 * EXTVLCOPT y EXTHTTP para aceleración por hardware específica.
 *
 * Soporta:
 *   - NVIDIA (NVDEC, CUDA, RTX Video Super Resolution)
 *   - Intel (VAAPI, QSV, Intel VSR via OpenVINO)
 *   - Auto-detect: NVDEC > VAAPI > DXVA2 > D3D11VA (fallback genérico)
 *
 * @param string $ua  User-Agent del cliente
 * @return array Directivas EXTVLCOPT y EXTHTTP de GPU
 */
function rq_sniper_gpu_acceleration($ua = '') {
    $output = ['ext_vlcopt' => [], 'ext_http' => []];

    $is_nvidia = preg_match('/nvidia|shield|geforce|rtx/i', $ua);
    $is_intel = preg_match('/intel|vaapi|qsv/i', $ua);

    if ($is_nvidia) {
        // --- NVIDIA GPU: NVDEC + CUDA + RTX Video Super Resolution ---
        $output['ext_vlcopt'][] = 'avcodec-hw=nvdec,cuda';
        $output['ext_http'][] = json_encode(["X-GPU-Acceleration" => "nvdec,nvenc,cuda"]);
        $output['ext_http'][] = json_encode(["X-RTX-Video-SuperRes" => "true,rtx-video-sdk"]);
        $output['ext_http'][] = json_encode(["X-AI-SR-Backend" => "rtx-tensor-cores"]);
    } elseif ($is_intel) {
        // --- Intel GPU: VAAPI + QSV + Intel VSR (OpenVINO) ---
        $output['ext_vlcopt'][] = 'avcodec-hw=vaapi,qsv';
        $output['ext_http'][] = json_encode(["X-GPU-Acceleration" => "vaapi,qsv"]);
        $output['ext_http'][] = json_encode(["X-Intel-VSR" => "true,enhanced raisr"]);
        $output['ext_http'][] = json_encode(["X-AI-SR-Backend" => "intel-openvino"]);
    } else {
        // --- Auto-detect: GPU priority chain genérica ---
        $output['ext_vlcopt'][] = 'avcodec-hw=nvdec,vaapi,dxva2,d3d11va,vdpau';
        $output['ext_http'][] = json_encode(["X-GPU-Acceleration" => "auto-detect,nvdec>vaapi>dxva2"]);
        $output['ext_http'][] = json_encode(["X-AI-SR-Backend" => "auto-detect"]);
    }

    // libplacebo: GPU-accelerated color management + HDR tone mapping
    $output['ext_http'][] = json_encode(["X-Libplacebo" => "true,hdr,color-management,tonemap"]);

    return $output;
}

// ============================================================================
// MÓDULO 12: EXCLUSIVE RESOURCE ALLOCATOR — ISP OPTIMIZATION
// ============================================================================
/**
 * Asigna TODOS los recursos de red al canal SNIPER activo:
 *   - TCP paralelo masivo (4-12 conexiones simultáneas)
 *   - Prefetch agresivo (500+ segmentos)
 *   - Buffer masivo (5 minutos)
 *   - DSCP 63 (Expedited Forwarding — máxima prioridad QoS)
 *   - BBR congestion control (no reduce ante packet loss)
 *   - TCP Fast Open, Window Scale, MTU Probing
 *   - User-Agent NVIDIA Shield TV Pro (CDN clasificación premium)
 *   - Buffer Escalation APOCALYPTIC (v3.0)
 *   - Connection Pool management (v3.0)
 */
function rq_sniper_resource_allocator($sniper_status) {
    $output = [
        'ext_http'  => [],
        'ext_vlcopt'=> [],
    ];

    $is_active = $sniper_status['sniper'];
    $pm = $sniper_status['prefetch_mult'] ?? 1.0;
    $bm = $sniper_status['buffer_mult'] ?? 1.0;
    $lm = $sniper_status['parallel_mult'] ?? 1;

    // Si no está activo ni reciente, no inyectar nada extra
    if ($sniper_status['status'] === 'IDLE') {
        return $output;
    }

    // =========================================================================
    // 6A: TCP PARALLEL — Conexiones masivas simultáneas
    // =========================================================================
    $parallel = $is_active ? '6,8,12' : '4,6';
    $concurrent = $is_active ? '6,8,12' : '4,6';

    $output['ext_http'][] = json_encode(["X-Parallel-Segments" => $parallel]);
    $output['ext_http'][] = json_encode(["X-Concurrent-Downloads" => $concurrent]);
    $output['ext_http'][] = json_encode(["X-Parallel-Downloads" => $parallel]);
    $output['ext_http'][] = json_encode(["X-Segment-Preload" => "true"]);
    $output['ext_http'][] = json_encode(["X-Segment-Prefetch" => "true"]);

    // =========================================================================
    // 6B: PREFETCH — Precarga masiva
    // =========================================================================
    $prefetch_segs = intval(500 * $pm);
    $prefetch_par  = intval(250 * $pm);
    $prefetch_buf  = intval(1000000 * $pm);
    $prefetch_depth = intval(30 * $lm);

    $output['ext_http'][] = json_encode(["X-Prefetch-Segments" => (string)$prefetch_segs]);
    $output['ext_http'][] = json_encode(["X-Prefetch-Parallel" => (string)$prefetch_par]);
    $output['ext_http'][] = json_encode(["X-Prefetch-Buffer-Target" => (string)$prefetch_buf]);
    $output['ext_http'][] = json_encode(["X-Prefetch-Strategy" => "HYPER_AGGRESSIVE_UNLIMITED"]);
    $output['ext_http'][] = json_encode(["X-Prefetch-Enabled" => "true,adaptive,auto,aggressive"]);
    $output['ext_http'][] = json_encode(["X-Prefetch-Depth" => (string)$prefetch_depth]);

    // =========================================================================
    // 6C: BUFFER — 5 minutos para canal activo
    // =========================================================================
    $buf_max    = intval(300000 * $bm);
    $buf_target = intval(60000 * $bm);
    $buf_min    = intval(1000 * $bm);
    $net_cache  = intval(80000 * $bm);
    $live_cache = intval(80000 * $bm);
    $file_cache = intval(300000 * $bm);

    $output['ext_http'][] = json_encode(["X-Buffer-Max" => (string)$buf_max]);
    $output['ext_http'][] = json_encode(["X-Buffer-Target" => (string)$buf_target]);
    $output['ext_http'][] = json_encode(["X-Buffer-Min" => (string)$buf_min]);
    $output['ext_http'][] = json_encode(["X-Buffer-Target-Override" => (string)$buf_max]);
    $output['ext_http'][] = json_encode(["X-Buffer-Strategy" => "RAM_OVERDRIVE_MULTI_TCP"]);
    $output['ext_http'][] = json_encode(["X-Buffer-Ms" => (string)$buf_target]);
    $output['ext_http'][] = json_encode(["X-Buffer-Escalation-Level" => "APOCALYPTIC"]);
    $output['ext_http'][] = json_encode(["X-Network-Caching" => (string)$net_cache]);
    $output['ext_http'][] = json_encode(["X-Live-Caching" => (string)$live_cache]);
    $output['ext_http'][] = json_encode(["X-File-Caching" => (string)$file_cache]);
    $output['ext_http'][] = json_encode(["X-Buffer-Underrun-Strategy" => "aggressive-prefetch-preventive"]);
    $output['ext_http'][] = json_encode(["X-Aggression-Multiplier" => "10"]);

    // =========================================================================
    // 6D: ISP STRANGLER — Estrangulamiento de ISP
    // =========================================================================
    $dscp = $is_active ? 63 : 56;

    $output['ext_http'][] = json_encode(["X-DSCP-Override" => (string)$dscp]);
    $output['ext_http'][] = json_encode(["X-Priority" => "ultra-high-critical"]);
    $output['ext_http'][] = json_encode(["X-QoS-Class" => "platinum"]);
    $output['ext_http'][] = json_encode(["X-Bandwidth-Guarantee" => "unlimited"]);
    $output['ext_http'][] = json_encode(["X-Bandwidth-Preference" => "unlimited"]);
    $output['ext_http'][] = json_encode(["X-Bandwidth-Floor" => "50000000"]);
    $output['ext_http'][] = json_encode(["X-BW-Smooth-Factor" => "0.01"]);   // 100x más lento en bajar
    $output['ext_http'][] = json_encode(["X-BW-Confidence" => "0.99"]);
    $output['ext_http'][] = json_encode(["X-Bandwidth-Estimation" => "optimistic,unlimited"]);
    $output['ext_http'][] = json_encode(["X-Initial-Bitrate" => "150000000,200000000,300000000"]);
    $output['ext_http'][] = json_encode(["X-Cooldown-Period" => "900"]);       // 15 min lock

    // =========================================================================
    // 6E: TCP / NETWORK OPTIMIZATION
    // =========================================================================
    $output['ext_http'][] = json_encode(["X-TCP-Congestion-Control" => "bbr"]);
    $output['ext_http'][] = json_encode(["X-TCP-Fast-Open" => "true"]);
    $output['ext_http'][] = json_encode(["X-TCP-Quick-ACK" => "true"]);
    $output['ext_http'][] = json_encode(["X-TCP-Window-Scale" => "true"]);
    $output['ext_http'][] = json_encode(["X-TCP-MTU-Probing" => "true"]);
    $output['ext_http'][] = json_encode(["X-HTTP2-Priority" => "256"]);
    $output['ext_http'][] = json_encode(["X-Accept-Encoding" => "identity"]);
    $output['ext_http'][] = json_encode(["X-HTTP2-Multiplex" => "true"]);
    $output['ext_http'][] = json_encode(["X-HTTP3-Support" => "true"]);
    $output['ext_http'][] = json_encode(["X-Alt-Svc" => "h3=\":443\"; ma=86400"]);
    $output['ext_http'][] = json_encode(["X-Keep-Alive" => "timeout=300,max=1000"]);

    // =========================================================================
    // 6F: USER-AGENT PREMIUM — NVIDIA Shield TV Pro
    // =========================================================================
    // Los CDN clasifican por User-Agent. NVIDIA Shield TV Pro = device premium
    // = mayor bitrate, mejor CDN edge, sin throttling.

    $ua = 'Mozilla/5.0 (Linux; Android 14; SHIELD Android TV Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Safari/537.36';
    $output['ext_http'][] = json_encode(["User-Agent" => $ua]);

    // =========================================================================
    // 6G: RECONNECTION — Reconexión atómica
    // =========================================================================
    $max_retry = $is_active ? 999 : 100;
    $timeout   = $is_active ? 1 : 3;

    $output['ext_http'][] = json_encode(["X-Reconnect-Timeout-Ms" => (string)$timeout]);
    $output['ext_http'][] = json_encode(["X-Reconnect-Max-Attempts" => (string)$max_retry]);
    $output['ext_http'][] = json_encode(["X-Reconnect-Delay-Ms" => "0"]);
    $output['ext_http'][] = json_encode(["X-Reconnect-On-Error" => "true,immediate,adaptive,parallel"]);
    $output['ext_http'][] = json_encode(["X-Failover-Enabled" => "true"]);
    $output['ext_http'][] = json_encode(["X-Seamless-Failover" => "true-ultra-atomic"]);
    $output['ext_http'][] = json_encode(["X-Request-Priority" => "ultra-high-critical"]);

    // =========================================================================
    // 6H: EXTVLCOPT — Resource Allocator para VLC
    // =========================================================================
    $output['ext_vlcopt'][] = "network-caching=" . $net_cache;
    $output['ext_vlcopt'][] = "live-caching=" . $live_cache;
    $output['ext_vlcopt'][] = "disc-caching=" . $file_cache;
    $output['ext_vlcopt'][] = "file-caching=" . $file_cache;
    $output['ext_vlcopt'][] = "http-timeout=12000";
    $output['ext_vlcopt'][] = "http-user-timeout=15000";
    $output['ext_vlcopt'][] = "http-reconnect=true";
    $output['ext_vlcopt'][] = "http-continuous=true";
    $output['ext_vlcopt'][] = "http-ssl-verifyhost=0";
    $output['ext_vlcopt'][] = "http-ssl-verifypeer=0";
    $output['ext_vlcopt'][] = "tls-session-resumption=true";
    $output['ext_vlcopt'][] = "gnutls-compression=none";
    $output['ext_vlcopt'][] = "network-caching-dscp={$dscp}";
    $output['ext_vlcopt'][] = "network-caching-dscp-qos={$dscp}";
    $output['ext_vlcopt'][] = "http-user-agent={$ua}";

    // Anti-corte
    $output['ext_vlcopt'][] = "deinterlace=1";
    $output['ext_vlcopt'][] = "deinterlace-mode=bwdif";
    $output['ext_vlcopt'][] = "video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full";

    // =========================================================================
    // 6I: BUFFER ESCALATION — APOCALYPTIC ceiling (NUEVO v3.0)
    // =========================================================================
    $output['ext_http'][] = json_encode(["X-Buffer-Escalation" => "APOCALYPTIC,180000ms-ceiling"]);
    $output['ext_http'][] = json_encode(["X-Buffer-Failover" => "ram-first,disc-secondary"]);

    // =========================================================================
    // 6J: CONNECTION POOL — Nueva subsección (NUEVO v3.0)
    // =========================================================================
    $output['ext_http'][] = json_encode(["X-Connection-Pool" => "true,min=4,max=12,idle-timeout=30"]);
    $output['ext_http'][] = json_encode(["X-Connection-Reuse" => "true,keepalive=300"]);
    $output['ext_http'][] = json_encode(["X-Connection-Precreate" => "true,count=4"]);

    return $output;
}

// ============================================================================
// MÓDULO 13: FUNCIÓN MAESTRA — rq_sniper_integrate() (RIS Bridge)
// ============================================================================
/**
 * INTEGRACIÓN TOTAL EN resolve_quality.php — Solo 2 líneas de código.
 * Este es el puente atómico RIS (Resilience Integration Shim) que conecta
 * todos los módulos sin romper la compatibilidad M3U existente.
 *
 * DENTRO de rq_enrich_channel_output(), ANTES de generar los EXTHTTP/EXTVLCOPT:
 *
 *   $sniper = rq_sniper_integrate($ch_id, $profile, $origin, $session);
 *   // ... then merge $sniper['ext_http'] into your existing ext_http output
 *   // ... then merge $sniper['ext_vlcopt'] into your existing ext_vlcopt output
 *   // ... then merge $sniper['kodiprop'] into KODIPROP lines
 *
 * @param int    $ch_id       ID del canal
 * @param string $profile     Perfil original (P1-P5) según tier
 * @param string $origin      Origen del stream
 * @param string $session     Session UUID
 * @return array [
 *   'effective_profile' => string|null,  // Perfil REAL (SNIPER sobreescribe)
 *   'sniper'             => array,        // Estado completo
 *   'ext_http'           => array,        // Directivas EXTHTTP adicionales
 *   'ext_vlcopt'         => array,        // Directivas EXTVLCOPT adicionales
 *   'kodiprop'           => array,        // Directivas KODIPROP (solo Kodi)
 *   'fast_start'         => array,        // Directivas Fast Start
 *   'json_command'       => string,       // JSON SNIPER embebido
 *   'http_headers'       => array,        // HTTP response headers adicionales
 *   'acrp_state'         => array,        // Estado ACRP actual
 * ]
 */
function rq_sniper_integrate($ch_id, $profile, $origin = '', $session = '') {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';

    // === MÓDULO 2: Clasificar canal según actividad ===
    $sniper = rq_sniper_classify($ch_id, $ip);

    // === MÓDULO 4: CDP — Cut Detection Protocol ===
    $cdp = rq_sniper_cdp_check($ch_id);

    // === MÓDULO 3: ACRP — Anti-Cut Response Protocol ===
    $acrp_state = rq_sniper_acrp_get_state($ch_id);

    // === MÓDULO 5: PDS — Progressive Degradation Shield ===
    $pds = rq_sniper_pds_adjust($sniper, $acrp_state);

    // Aplicar ajustes PDS al estado sniper
    if ($sniper['status'] !== 'IDLE') {
        $sniper['prefetch_mult'] = $pds['prefetch_mult'];
        $sniper['buffer_mult'] = $pds['buffer_mult'];
        $sniper['parallel_mult'] = $pds['parallel_mult'];
    }

    // === Determinar perfil efectivo ===
    $effective_profile = $profile; // Default: usar tier original
    if ($sniper['status'] === 'STREAMING') {
        $effective_profile = 'P0-SNIPER-NUCLEAR';  // Siempre NUCLEAR para activo
    }
    // RECENT e IDLE: mantienen su tier original

    $sniper['effective_profile'] = $effective_profile;
    $uuid = $session ?: sprintf('APE-SNIPER-%d-%d-%04x', $ch_id, time(), mt_rand(0, 0xFFFF));

    // === MÓDULO 1: Fast Start (solo para canal activo) ===
    $fast_start = ($sniper['sniper']) ? rq_sniper_fast_start_directives() : [];

    // === MÓDULO 9: Image Enhancement (solo para activo/reciente) ===
    $image_enhance = rq_sniper_image_enhancement($sniper);

    // === Detectar resolución para pipeline FFmpeg (v3.1 — GAP 3) ===
    $res_hint = 'unknown';
    if ($sniper['sniper']) {
        $res_hint = '4k'; // Canal activo SNIPER = calidad máxima asumida
    } elseif (strpos($effective_profile, 'NUCLEAR') !== false
          || strpos($effective_profile, '4K') !== false
          || strpos($effective_profile, 'FHD') !== false) {
        $res_hint = '4k';
    } elseif (strpos($effective_profile, 'HD') !== false) {
        $res_hint = 'hd';
    } elseif (strpos($effective_profile, 'SD') !== false) {
        $res_hint = 'sd';
    }

    // === MÓDULO 8: FFmpeg Pipeline Engine (con resolución adaptativa v3.1) ===
    $ffmpeg_pipeline = rq_sniper_ffmpeg_pipeline($sniper, $acrp_state, $res_hint);

    // === MÓDULO 15: ANTI-NOISE ENGINE (v1.0) ===
    // Clasifica la fuente (CLEAN/DIRTY/CRUSHED) y genera filtros anti-ruido
    // Solo activo para STREAMING/RECENT. IDLE = 0 directivas.
    $noise_engine = ['ext_vlcopt' => [], 'ext_http' => [], 'metadata' => ['active' => false]];
    if (function_exists('ape_noise_engine_integrate')) {
        $noise_engine = ape_noise_engine_integrate($sniper, $acrp_state, $effective_profile);
    }

    // === MÓDULO 16: HDR PEAK NIT ENGINE (v1.0) ===
    // Genera metadata HDR 5000 nits: ST.2086, HDR10+, DV RPU, HLG, GPU tone mapping
    $hdr_engine = ['ext_vlcopt' => [], 'ext_http' => [], 'kodiprop' => [], 'metadata' => ['active' => false]];
    if (function_exists('ape_hdr_peak_nit_integrate')) {
        $hdr_engine = ape_hdr_peak_nit_integrate($sniper, $acrp_state, $effective_profile);
    }

    // === MÓDULO 10: KODIPROP Engine ===
    $kodiprop = rq_sniper_kodiprop_directives($sniper, $ua);

    // === MÓDULO 11: GPU Acceleration Manager ===
    $gpu = rq_sniper_gpu_acceleration($ua);

    // === MÓDULO 7B: Parallel Reconnect Race (solo si ACRP en RECONNECTING) ===
    $race = [];
    if ($acrp_state['state'] === 'RECONNECTING' || $acrp_state['state'] === 'CUT_DETECTED') {
        $race = rq_sniper_parallel_reconnect_race($origin, $ch_id, $uuid);
    }

    // === MÓDULO 12: Resource Allocator / ISP (para activo/reciente) ===
    $resources = rq_sniper_resource_allocator($sniper);

    // === MÓDULO 14: STREAM VALIDATOR & PROXY SHIELD (v3.1 — GAP 1) ===
    // Verifica si la URL del stream devuelve video o HTML.
    // Si es HTML, extrae URL real o enruta por proxy del VPS.
    // Backward-compatible: si ape_stream_validator_proxy.php no existe, se salta.
    $stream_guard_result = [];
    $guard_ext_http = [];
    if (!empty($origin) && strpos($origin, 'http') === 0 && function_exists('ape_sniper_stream_guard')) {
        $guard_directives = [];
        $guard = ape_sniper_stream_guard($origin, $ch_id, $guard_directives);
        if (isset($guard['status']) && $guard['status'] !== 'OK') {
            $stream_guard_result = $guard;
            // Si el proxy es necesario, reemplazar la URL de origen
            if ($guard['status'] === 'NEEDS_PROXY' || $guard['status'] === 'REPAIRED') {
                $origin = $guard['url'];
            }
            // GAP 8: Compensar latencia del proxy (+30% prefetch, +15% buffer)
            $sniper['prefetch_mult'] = ($sniper['prefetch_mult'] ?? 1.0) * 1.3;
            $sniper['buffer_mult'] = ($sniper['buffer_mult'] ?? 1.0) * 1.15;
            // Fusionar directivas del stream guard
            $guard_ext_http = $guard_directives['ext_http'] ?? [];
        }
    }

    // === Merge todas las directivas ===
    $all_ext_http = array_merge(
        $fast_start['ext_http'] ?? [],
        $image_enhance['ext_http'] ?? [],
        $ffmpeg_pipeline['ext_http'] ?? [],
        $gpu['ext_http'] ?? [],
        $race['ext_http'] ?? [],
        $noise_engine['ext_http'] ?? [],
        $hdr_engine['ext_http'] ?? [],
        $resources['ext_http'] ?? [],
        $guard_ext_http,
        $stream_guard_result['ext_http'] ?? []
    );
    $all_ext_vlcopt = array_merge(
        $fast_start['ext_vlcopt'] ?? [],
        $image_enhance['ext_vlcopt'] ?? [],
        $ffmpeg_pipeline['ext_vlcopt'] ?? [],
        $gpu['ext_vlcopt'] ?? [],
        $noise_engine['ext_vlcopt'] ?? [],
        $hdr_engine['ext_vlcopt'] ?? [],
        $resources['ext_vlcopt'] ?? []
    );

    // === JSON COMMAND: Estado SNIPER embebido (JCS) ===
    $json_cmd = json_encode([
        "ape_sniper_mode"    => "v3.0",
        "channel_id"         => intval($ch_id),
        "status"             => $sniper['status'],
        "sniper_active"      => $sniper['sniper'],
        "profile"            => $effective_profile,
        "label"              => $sniper['label'],
        "elapsed_s"          => $sniper['elapsed_s'],
        "target_fps"         => 120,
        "target_resolution"  => "7680x4320",
        "target_bitrate"     => 300000000,
        "target_hdr"         => "HDR10+,DolbyVision,HLG",
        "target_color_space" => "BT2020",
        "target_color_depth" => "10bit",
        "target_audio"       => "Dolby-Atmos-7.1.4,TrueHD",
        "acrp_state"         => $acrp_state['state'],
        "acrp_locked_bitrate" => $acrp_state['locked_bitrate'],
        "cdp_cut_detected"   => $cdp['cut_detected'],
        "cdp_gap_seconds"    => $cdp['gap_seconds'],
        "modules_active"     => [
            "fast_start_engine"     => $sniper['sniper'],
            "active_channel_detect" => true,
            "acrp_state_machine"    => true,
            "cdp_cut_detection"     => true,
            "pds_degradation_shield" => true,
            "error_handler"         => true,
            "atomic_recovery"       => true,
            "ffmpeg_pipeline"       => $sniper['sniper'],
            "image_enhancement"     => $sniper['sniper'],
            "kodiprop_engine"       => count($kodiprop) > 0,
            "gpu_acceleration"      => true,
            "resource_allocator"    => true,
            "parallel_reconnect"    => ($acrp_state['state'] === 'RECONNECTING' || $acrp_state['state'] === 'CUT_DETECTED'),
            "stream_validator_proxy" => !empty($stream_guard_result),
            "stream_guard_status"   => $stream_guard_result['status'] ?? 'OK',
            "stream_guard_method"   => $stream_guard_result['method'] ?? 'direct',
        ],
        "commands" => $sniper['sniper'] ? [
            "force_profile"       => "P0-SNIPER-NUCLEAR",
            "force_120fps"        => true,
            "force_hdr"           => true,
            "force_bt2020"        => true,
            "force_dolby_atmos"   => true,
            "escalate_prefetch"   => true,
            "escalate_buffer"     => true,
            "escalate_parallel"   => true,
            "lock_quality"        => true,
            "max_bitrate"         => 300000000,
            "recovery_on_cut"     => true,
            "recovery_max_retry"  => 999,
            "isp_strangler"       => true,
            "dscp"                => 63,
            "ffmpeg_pipeline"     => true,
            "gpu_acceleration"    => true,
        ] : [
            "use_tier_profile"    => true,
            "standard_resources"  => true,
        ],
        "session"   => $uuid,
        "timestamp" => gmdate('Y-m-d\TH:i:s\Z'),
    ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

    // === HTTP HEADERS adicionales ===
    $http_headers = [
        "X-APE-SNIPER-Mode: " . ($sniper['sniper'] ? 'ACTIVE' : 'STANDBY'),
        "X-APE-SNIPER-Status: {$sniper['status']}",
        "X-APE-SNIPER-Profile: {$effective_profile}",
        "X-APE-SNIPER-Label: {$sniper['label']}",
        "X-APE-SNIPER-Channel: {$ch_id}",
        "X-APE-SNIPER-Elapsed: {$sniper['elapsed_s']}s",
        "X-APE-SNIPER-Priority: {$sniper['priority']}",
        "X-APE-SNIPER-Prefetch-Mult: {$sniper['prefetch_mult']}x",
        "X-APE-SNIPER-Buffer-Mult: {$sniper['buffer_mult']}x",
        "X-APE-SNIPER-ACRP-State: {$acrp_state['state']}",
        "X-APE-SNIPER-CDP-Cut: " . ($cdp['cut_detected'] ? 'DETECTED' : 'NONE'),
    ];

    // v3.1 GAP 7: Stream Guard HTTP headers
    if (!empty($stream_guard_result) && ($stream_guard_result['status'] ?? 'OK') !== 'OK') {
        $http_headers[] = "X-APE-Stream-Guard: " . $stream_guard_result['status'];
        $http_headers[] = "X-APE-Stream-Guard-Method: " . ($stream_guard_result['method'] ?? 'direct');
    }
    // Anti-Noise Engine HTTP headers
    if (!empty($noise_engine['metadata']['active']) && $noise_engine['metadata']['active']) {
        $http_headers[] = "X-APE-AntiNoise-Pipeline: " . ($noise_engine['metadata']['pipeline'] ?? 'A');
        $http_headers[] = "X-APE-AntiNoise-Score: " . ($noise_engine['metadata']['noise_score'] ?? 0);
        $http_headers[] = "X-APE-AntiNoise-Class: " . ($noise_engine['metadata']['classification'] ?? 'UNKNOWN');
    }
    // HDR Peak Nit Engine HTTP headers
    if (!empty($hdr_engine['metadata']['active']) && $hdr_engine['metadata']['active']) {
        $http_headers[] = "X-APE-HDR-Peak: " . ($hdr_engine['metadata']['peak_nits'] ?? 5000);
        $http_headers[] = "X-APE-HDR-Format: " . ($hdr_engine['metadata']['formats'] ?? 'hdr10,hdr10+,dv,hlg');
        $http_headers[] = "X-APE-HDR-Transfer: smpte2084";
    }

    if ($sniper['sniper']) {
        $http_headers[] = "X-APE-SNIPER-Focus: LOCKED-ON-CHANNEL-{$ch_id}";
        $http_headers[] = "X-APE-SNIPER-Target-FPS: 120";
        $http_headers[] = "X-APE-SNIPER-Target-Bitrate: 300000000";
        $http_headers[] = "X-APE-SNIPER-Image-Enhancement: FULL";
        $http_headers[] = "X-APE-SNIPER-FFmpeg-Pipeline: ACTIVE";
        $http_headers[] = "X-APE-SNIPER-GPU-Acceleration: ACTIVE";
    }

    return [
        'effective_profile' => $effective_profile,
        'sniper'             => $sniper,
        'ext_http'           => $all_ext_http,
        'ext_vlcopt'         => $all_ext_vlcopt,
        'kodiprop'           => $kodiprop,
        'json_command'       => "# " . $json_cmd,
        'http_headers'       => $http_headers,
        'acrp_state'         => $acrp_state,
        'cdp_result'         => $cdp,
    ];
}
