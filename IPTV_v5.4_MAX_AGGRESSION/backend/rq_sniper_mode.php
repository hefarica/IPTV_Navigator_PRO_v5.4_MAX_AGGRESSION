<?php
/**
 * ============================================================================
 * APE SNIPER MODE v1.0 — Foco Láser en el Canal Activo
 * ============================================================================
 *
 * Concepto: De todos los canales que el resolver sirve, SOLO UNO está siendo
 * reproducido por el usuario en este momento. SNIPER MODE detecta cuál es y le
 * asigna el 100% de los recursos (perfil NUCLEAR, prefetch máximo, recovery).
 * Los demás canales reciben el perfil estándar de su tier.
 *
 * INTEGRACIÓN: Solo requiere 2 líneas en resolve_quality.php.
 * SIN base de datos. SIN Redis. SIN demonios adicionales.
 * Usa archivos de estado en /tmp/ (filemtime checks, extremadamente rápido).
 *
 * Servidor: 178.156.147.234
 * Archivo: /var/www/html/iptv-ape/rq_sniper_mode.php
 * ============================================================================
 */

// ============================================================================
// CONFIGURACIÓN — Ajustar según necesidad
// ============================================================================

define('APE_SNIPER_STATE_DIR', '/tmp/ape_sniper');
define('APE_SNIPER_STREAMING_WINDOW', 10);    // Segundos: si el canal tuvo request en los últimos 10s = está reproduciéndose
define('APE_SNIPER_RECENT_WINDOW', 45);       // Segundos: si tuvo request en los últimos 45s = fue recientemente activo
define('APE_SNIPER_STALE_TTL', 300);          // Segundos: tiempo de vida de los archivos de estado antes de cleanup
define('APE_SNIPER_RECOVERY_URL', '');        // URL de fallback (vacía = usa la misma URL del request)
define('APE_SNIPER_MAX_ACTIVE_CHANNELS', 3);  // Máximo de canales "streaming" simultáneos (multi-room)

// ============================================================================
// ASEGURAR DIRECTORIO DE ESTADO
// ============================================================================

if (!is_dir(APE_SNIPER_STATE_DIR)) {
    @mkdir(APE_SNIPER_STATE_DIR, 0755, true);
}

// ============================================================================
// FUNCIÓN PRINCIPAL: Clasifica un canal según su actividad
// ============================================================================
/**
 * Determina el nivel de actividad de un canal y retorna el perfil SNIPER
 * correspondiente.
 *
 * @param int $ch_id   ID del canal
 * @param string $ip   IP del cliente (para multi-device tracking, opcional)
 * @return array [
 *   'status'     => 'STREAMING' | 'RECENT' | 'IDLE',
 *   'profile'    => 'P1' | 'P2' | 'P3' | 'P4' | 'P5',
 *   'sniper'     => true|false,  // ¿Está en modo SNIPER?
 *   'last_seen'  => timestamp de último request,
 *   'priority'   => 1-5,        // Prioridad de recursos (1 = máxima)
 *   'prefetch_mult' => float,   // Multiplicador de prefetch
 * ]
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

    // --- Leer último acceso ---
    $last_seen = @filemtime($state_file);
    if ($last_seen === false) {
        return rq_sniper_idle_result();
    }

    $elapsed = time() - $last_seen;

    // --- Contar canales activos (streaming) ---
    $active_count = rq_sniper_count_streaming($ch_id);

    if ($elapsed <= APE_SNIPER_STREAMING_WINDOW && $active_count <= APE_SNIPER_MAX_ACTIVE_CHANNELS) {
        // === CANAL EN REPRODUCCIÓN ACTIVA → SNIPER MODE: NUCLEAR ===
        return [
            'status'        => 'STREAMING',
            'profile'       => 'P1',           // Siempre NUCLEAR para el canal activo
            'sniper'        => true,
            'last_seen'     => $last_seen,
            'elapsed_s'     => $elapsed,
            'priority'      => 1,             // Máxima prioridad
            'prefetch_mult' => 2.0,            // Duplicar prefetch
            'buffer_mult'   => 1.5,            // 50% más buffer
            'parallel_mult' => 2,              // Duplicar conexiones paralelas
            'label'         => 'SNIPER-NUCLEAR-ACTIVE',
        ];
    }

    if ($elapsed <= APE_SNIPER_RECENT_WINDOW) {
        // === CANAL RECIENTEMENTE ACTIVO → Mantener calidad alta ===
        return [
            'status'        => 'RECENT',
            'profile'       => 'P2',           // AGGRESSIVE (se mantiene preparado)
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

    // === CANAL INACTIVO → Perfil normal de su tier ===
    return [
        'status'        => 'IDLE',
        'profile'       => 'P3',           // Se usará el tier real del canal (esto es fallback)
        'sniper'        => false,
        'last_seen'     => $last_seen,
        'elapsed_s'     => $elapsed,
        'priority'      => 5,
        'prefetch_mult' => 1.0,
        'buffer_mult'   => 1.0,
        'parallel_mult' => 1,
        'label'         => 'STANDARD',
    ];
}

/**
 * Retorna el resultado IDLE por defecto.
 */
function rq_sniper_idle_result() {
    return [
        'status'        => 'IDLE',
        'profile'       => 'P3',
        'sniper'        => false,
        'last_seen'     => 0,
        'elapsed_s'     => 9999,
        'priority'      => 5,
        'prefetch_mult' => 1.0,
        'buffer_mult'   => 1.0,
        'parallel_mult' => 1,
        'label'         => 'STANDARD',
    ];
}

// ============================================================================
// FUNCIÓN: Contar canales en estado STREAMING
// ============================================================================

function rq_sniper_count_streaming($exclude_ch_id = 0) {
    $count = 0;
    $cutoff = time() - APE_SNIPER_STREAMING_WINDOW;

    foreach (glob(APE_SNIPER_STATE_DIR . '/ch_*.state') as $file) {
        if (filemtime($file) >= $cutoff) {
            // Extraer ch_id del nombre del archivo
            $basename = basename($file, '.state');
            $file_ch = intval(str_replace('ch_', '', $basename));
            if ($file_ch !== intval($exclude_ch_id)) {
                $count++;
            }
        }
    }
    return $count;
}

// ============================================================================
// FUNCIÓN: Obtener el canal más activo (para dashboard / debugging)
// ============================================================================

function rq_sniper_get_active_channels() {
    $active = [];
    $recent = [];

    foreach (glob(APE_SNIPER_STATE_DIR . '/ch_*.state') as $file) {
        $mt = filemtime($file);
        if ($mt === false) continue;

        $data = @json_decode(file_get_contents($file), true);
        if (!$data) continue;

        $elapsed = time() - $mt;
        $entry = [
            'ch_id'     => $data['ch_id'],
            'ip'        => $data['ip'] ?? '',
            'last_seen' => $mt,
            'elapsed_s' => $elapsed,
            'ua'        => $data['user_agent'] ?? '',
        ];

        if ($elapsed <= APE_SNIPER_STREAMING_WINDOW) {
            $active[] = $entry;
        } elseif ($elapsed <= APE_SNIPER_RECENT_WINDOW) {
            $recent[] = $entry;
        }
    }

    // Ordenar por más reciente primero
    usort($active, function($a, $b) { return $b['last_seen'] - $a['last_seen']; });
    usort($recent, function($a, $b) { return $b['last_seen'] - $a['last_seen']; });

    return ['streaming' => $active, 'recent' => $recent];
}

// ============================================================================
// FUNCIÓN: Cleanup de archivos de estado obsoletos
// ============================================================================

function rq_sniper_cleanup() {
    $cutoff = time() - APE_SNIPER_STALE_TTL;
    foreach (glob(APE_SNIPER_STATE_DIR . '/ch_*.state') as $file) {
        if (filemtime($file) < $cutoff) {
            @unlink($file);
        }
    }
}

// Ejecutar cleanup de forma probabilística (1 de cada 20 requests ≈ 5%)
if (mt_rand(1, 20) === 1) {
    rq_sniper_cleanup();
}

// ============================================================================
// FUNCIÓN: Generar recovery playlist (cuando el origen falla)
// ============================================================================
/**
 * Genera un M3U8 de recuperación que fuerza al player a reintentar
 * con la máxima calidad disponible. Se sirve cuando el origen
 * devuelve error 404, 500, 502, 503, 504.
 *
 * @param string $stream_url  URL original del stream
 * @param int    $ch_id       ID del canal
 * @param string $session     Session UUID
 * @param int    $attempt     Número de intento actual
 * @return string  Contenido M3U8 de recuperación
 */
function rq_sniper_recovery_playlist($stream_url, $ch_id, $session, $attempt = 1) {
    $now = gmdate('Y-m-d\TH:i:s\Z');
    $next_attempt = min($attempt + 1, 50); // Máximo 50 intentos
    $delay_ms = $attempt <= 3 ? 0 : min($attempt * 100, 2000); // 0ms los primeros 3, luego escala

    $m3u = "#EXTM3U\n";
    $m3u .= "#EXT-X-VERSION:9\n";
    $m3u .= "#EXT-X-TARGETDURATION:1\n";
    $m3u .= "#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,CAN-SKIP-UNTIL=60.0,PART-HOLD-BACK=0.5,HOLD-BACK=2.0\n";
    $m3u .= "#EXT-X-DISCONTINUITY\n";
    $m3u .= "#EXT-X-PROGRAM-DATE-TIME:{$now}\n";
    $m3u .= "#EXT-X-DATERANGE:ID=\"sniper-recovery-{$ch_id}\",START-DATE=\"{$now}\",DURATION=0.0,"
         . "X-APE-SNIPER=\"RECOVERY\",X-ATTEMPT=\"{$attempt}\",X-NEXT=\"{$next_attempt}\"\n";
    $m3u .= "#EXT-X-SESSION-DATA:DATA-ID=\"com.ape.sniper.recovery\",VALUE=\"attempt-{$attempt}-next-{$next_attempt}-delay-{$delay_ms}ms\"\n";

    // Headers JSON de recovery embebidos como comentarios
    $recovery_json = json_encode([
        "ape_sniper_recovery" => "v1.0",
        "attempt" => $attempt,
        "next_attempt" => $next_attempt,
        "delay_ms" => $delay_ms,
        "action" => $attempt <= 5 ? "immediate_retry" : "escalated_retry",
        "strategy" => $attempt <= 10 ? "same_origin" : "alternate_origin",
        "ch_id" => $ch_id,
        "session" => $session,
        "timestamp" => $now,
    ], JSON_UNESCAPED_SLASHES);
    $m3u .= "# {$recovery_json}\n";

    $m3u .= "#EXTINF:-1 tvg-id=\"{$ch_id}\" tvg-name=\"RECOVERY\",APE-SNIPER-RECOVERY={$attempt},"
         . "APE-Profile=P1-NUCLEAR\n";
    $m3u .= $stream_url . "\n";

    return $m3u;
}

// ============================================================================
// FUNCIÓN: Modificar directivas EXTHTTP según estado SNIPER
// ============================================================================
/**
 * Toma las directivas EXTHTTP generadas por el anti-cut engine y las
 * escala según el estado SNIPER del canal. Para canales activos (STREAMING),
 * multiplica prefetch, buffer y conexiones paralelas.
 *
 * @param array $exthttp_lines  Array de strings JSON de directivas EXTHTTP
 * @param array $sniper_status  Resultado de rq_sniper_classify()
 * @return array  Directivas modificadas
 */
function rq_sniper_scale_directives($exthttp_lines, $sniper_status) {
    if (!$sniper_status['sniper'] && $sniper_status['status'] === 'IDLE') {
        return $exthttp_lines; // Sin cambios para canales inactivos
    }

    $scaled = [];
    $prefetch_mult = $sniper_status['prefetch_mult'] ?? 1.0;
    $buffer_mult = $sniper_status['buffer_mult'] ?? 1.0;
    $parallel_mult = $sniper_status['parallel_mult'] ?? 1;

    foreach ($exthttp_lines as $json_str) {
        $obj = @json_decode($json_str, true);
        if (!$obj) {
            $scaled[] = $json_str;
            continue;
        }

        foreach ($obj as $key => $value) {
            // Escalar prefetch
            if ($key === 'X-Prefetch-Segments' && is_numeric($value)) {
                $obj[$key] = (string)intval($value * $prefetch_mult);
            }
            if ($key === 'X-Prefetch-Parallel' && is_numeric($value)) {
                $obj[$key] = (string)intval($value * $prefetch_mult);
            }
            if ($key === 'X-Prefetch-Buffer-Target' && is_numeric($value)) {
                $obj[$key] = (string)intval($value * $buffer_mult);
            }

            // Escalar buffer
            if ($key === 'X-Buffer-Max' && is_numeric($value)) {
                $obj[$key] = (string)intval($value * $buffer_mult);
            }
            if ($key === 'X-Buffer-Target' && is_numeric($value)) {
                $obj[$key] = (string)intval($value * $buffer_mult);
            }
            if ($key === 'X-Buffer-Target-Override' && is_numeric($value)) {
                $obj[$key] = (string)intval($value * $buffer_mult);
            }
            if ($key === 'X-Network-Caching' && is_numeric($value)) {
                $obj[$key] = (string)min(intval($value * $buffer_mult), 600000);
            }
            if ($key === 'X-Live-Caching' && is_numeric($value)) {
                $obj[$key] = (string)min(intval($value * $buffer_mult), 600000);
            }

            // Escalar paralelismo
            if ($key === 'X-Parallel-Segments' && !is_numeric($value)) {
                // Es un string como "4,6,8" — multiplicar cada valor
                $parts = array_map(function($v) use ($parallel_mult) {
                    return max(2, intval(trim($v)) * $parallel_mult);
                }, explode(',', $value));
                $obj[$key] = implode(',', $parts);
            }
            if ($key === 'X-Concurrent-Downloads' && !is_numeric($value)) {
                $parts = array_map(function($v) use ($parallel_mult) {
                    return max(2, intval(trim($v)) * $parallel_mult);
                }, explode(',', $value));
                $obj[$key] = implode(',', $parts);
            }

            // Marcar como SNIPER-ACTIVE para headers de monitoreo
            if ($key === 'X-APE-Cut-Detection') {
                $obj[$key] = $sniper_status['sniper'] ? 'SNIPER-ACTIVE' : 'STANDARD';
            }

            // Para canales STREAMING, forzar BANDWIDTH inflation
            if ($sniper_status['status'] === 'STREAMING' && $key === 'X-Max-Bitrate') {
                $obj[$key] = '300000000'; // Forzar 300Mbps para el canal activo
            }
        }

        $scaled[] = json_encode($obj, JSON_UNESCAPED_SLASHES);
    }

    return $scaled;
}

// ============================================================================
// FUNCIÓN: Generar EXTVLCOPT escalados según SNIPER
// ============================================================================

function rq_sniper_scale_vlcopt($extvlcopt_lines, $sniper_status) {
    if (!$sniper_status['sniper'] && $sniper_status['status'] === 'IDLE') {
        return $extvlcopt_lines;
    }

    $scaled = [];
    $buffer_mult = $sniper_status['buffer_mult'] ?? 1.0;

    foreach ($extvlcopt_lines as $opt) {
        // Escalar network-caching para el canal activo
        if (strpos($opt, 'network-caching=') === 0) {
            $val = intval(str_replace('network-caching=', '', $opt));
            $val = min(intval($val * $buffer_mult), 600000);
            $scaled[] = "network-caching={$val}";
            continue;
        }
        if (strpos($opt, 'live-caching=') === 0) {
            $val = intval(str_replace('live-caching=', '', $opt));
            $val = min(intval($val * $buffer_mult), 600000);
            $scaled[] = "live-caching={$val}";
            continue;
        }
        if (strpos($opt, 'file-caching=') === 0) {
            $val = intval(str_replace('file-caching=', '', $opt));
            $val = min(intval($val * $buffer_mult), 600000);
            $scaled[] = "file-caching={$val}";
            continue;
        }
        if (strpos($opt, 'disc-caching=') === 0) {
            $val = intval(str_replace('disc-caching=', '', $opt));
            $val = min(intval($val * $buffer_mult), 600000);
            $scaled[] = "disc-caching={$val}";
            continue;
        }

        // Forzar adaptive-maxbw a 300M para canales STREAMING
        if ($sniper_status['status'] === 'STREAMING' && strpos($opt, 'adaptive-maxbw=') === 0) {
            $scaled[] = "adaptive-maxbw=300000000";
            continue;
        }

        $scaled[] = $opt;
    }

    return $scaled;
}

// ============================================================================
// FUNCIÓN: JSON Command SNIPER (se embebe como comentario M3U)
// ============================================================================
/**
 * Genera el payload JSON SNIPER que describe el estado del canal activo
 * y las órdenes para el player.
 */
function rq_sniper_json_command($ch_id, $sniper_status, $session) {
    $json = json_encode([
        "ape_sniper_mode"    => "v1.0",
        "channel_id"         => intval($ch_id),
        "status"             => $sniper_status['status'],
        "sniper_active"      => $sniper_status['sniper'],
        "profile"            => $sniper_status['profile'],
        "label"              => $sniper_status['label'],
        "elapsed_s"          => $sniper_status['elapsed_s'],
        "prefetch_mult"      => $sniper_status['prefetch_mult'],
        "buffer_mult"        => $sniper_status['buffer_mult'],
        "parallel_mult"      => $sniper_status['parallel_mult'],
        "session"            => $session,
        "timestamp"          => gmdate('Y-m-d\TH:i:s\Z'),
        "commands" => [
            "streaming" => [
                "force_profile"       => "P1-NUCLEAR",
                "escalate_prefetch"   => true,
                "escalate_buffer"     => true,
                "escalate_parallel"   => true,
                "lock_quality"        => true,
                "max_bitrate"         => 300000000,
                "recovery_on_cut"     => true,
                "recovery_max_retry"  => 50,
            ],
            "recent" => [
                "maintain_profile"    => "P2-AGGRESSIVE",
                "prefetch_warmup"     => true,
                "buffer_warmup"       => true,
            ],
            "idle" => [
                "use_tier_profile"    => true,
                "standard_resources"  => true,
            ],
        ],
    ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

    return "# {$json}";
}

// ============================================================================
// FUNCIÓN: HTTP Headers adicionales según estado SNIPER
// ============================================================================

function rq_sniper_http_headers($ch_id, $sniper_status, $uuid) {
    $headers = [];

    $headers[] = "X-APE-SNIPER-Mode: " . ($sniper_status['sniper'] ? 'ACTIVE' : 'STANDBY');
    $headers[] = "X-APE-SNIPER-Status: {$sniper_status['status']}";
    $headers[] = "X-APE-SNIPER-Profile: {$sniper_status['profile']}";
    $headers[] = "X-APE-SNIPER-Label: {$sniper_status['label']}";
    $headers[] = "X-APE-SNIPER-Channel: {$ch_id}";
    $headers[] = "X-APE-SNIPER-Elapsed: {$sniper_status['elapsed_s']}s";
    $headers[] = "X-APE-SNIPER-Priority: {$sniper_status['priority']}";
    $headers[] = "X-APE-SNIPER-Prefetch-Mult: {$sniper_status['prefetch_mult']}x";
    $headers[] = "X-APE-SNIPER-Buffer-Mult: {$sniper_status['buffer_mult']}x";

    if ($sniper_status['sniper']) {
        $headers[] = "X-APE-SNIPER-Focus: LOCKED-ON-CHANNEL-{$ch_id}";
    }

    return $headers;
}

// ============================================================================
// FUNCIÓN MAESTRA: Integration Wrapper
// ============================================================================
/**
 * FUNCIÓN PRINCIPAL — Llama esto dentro de rq_enrich_channel_output()
 * INTEGRACIÓN TOTAL: 1 sola línea de código en el resolver.
 *
 * @param int    $ch_id       ID del canal
 * @param string $profile     Perfil original del canal (P1-P5) según su tier
 * @param string $origin      Origen del stream
 * @param string $session     Session UUID
 * @return array [
 *   'effective_profile' => string,   // Perfil REAL a usar (SNIPER puede sobreescribir)
 *   'sniper'             => array,   // Estado SNIPER completo
 *   'exthttp_scaled'     => array,   // EXTHTTP escalados (si aplica)
 *   'extvlcopt_scaled'   => array,   // EXTVLCOPT escalados (si aplica)
 *   'json_command'       => string,  // JSON SNIPER para M3U
 *   'http_headers'       => array,   // Headers HTTP adicionales
 * ]
 */
function rq_sniper_integrate($ch_id, $profile, $origin = '', $session = '') {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';

    // 1. Clasificar canal según actividad
    $sniper = rq_sniper_classify($ch_id, $ip);

    // 2. Determinar perfil efectivo
    //    Si SNIPER detecta que está STREAMING → siempre P1 (máximo)
    //    Si es RECENT → max($profile, 'P2') — no degrada del tier asignado
    //    Si es IDLE → usa el profile original del tier del canal
    $profile_order = ['P1', 'P2', 'P3', 'P4', 'P5'];
    $profile_rank = array_search($profile, $profile_order);
    $sniper_rank = array_search($sniper['profile'], $profile_order);

    if ($sniper['status'] === 'STREAMING') {
        $effective_profile = 'P1'; // Siempre NUCLEAR para el canal activo
    } elseif ($sniper['status'] === 'RECENT') {
        // Mantener al menos el tier asignado o subirlo a P2
        $effective_profile = ($profile_rank !== false && $profile_rank <= $sniper_rank)
            ? $profile
            : $sniper['profile'];
    } else {
        $effective_profile = $profile; // Usar el tier real del canal
    }

    $sniper['effective_profile'] = $effective_profile;
    $uuid = $session ?: sprintf('APE-SNIPER-%d-%d-%04x', $ch_id, time(), mt_rand(0, 0xFFFF));

    // 3. Generar JSON command SNIPER
    $json_cmd = rq_sniper_json_command($ch_id, $sniper, $uuid);

    // 4. Headers HTTP adicionales
    $http_hdrs = rq_sniper_http_headers($ch_id, $sniper, $uuid);

    return [
        'effective_profile' => $effective_profile,
        'sniper'             => $sniper,
        'json_command'       => $json_cmd,
        'http_headers'       => $http_hdrs,
    ];
}
