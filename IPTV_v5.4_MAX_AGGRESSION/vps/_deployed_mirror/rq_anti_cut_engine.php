<?php
/**
 * ============================================================================
 * APE ANTI-CUT ENGINE v1.1 — ISP STRANGULATION x2 — ISP Strangulation + Cut Detection + Quality Lock
 * ============================================================================
 *
 * Arquitectura de 5 Capas:
 *   CDP  — Cut Detection Protocol (monitoreo buffer, packet loss, RTT, gaps)
 *   ACRP — Anti-Cut Response Protocol (lock calidad 900s, prohibe downswitch)
 *   ISSP — ISP Strangulation Protocol (TCP paralelo, prefetch 500, DSCP 63, BBR)
 *   JCS  — JSON Command System (payloads JSON embebidos como comentarios M3U)
 *   PDS  — Progressive Degradation Shield (P1-NUCLEAR > P2 > P3 > P4 > P5)
 *
 * Servidor: 178.156.147.234
 * Archivo: /var/www/html/iptv-ape/rq_anti_cut_engine.php
 * Compatible: PHP 8.x | Orígenes Flussonic (tivi-ott, nov202gg, ky-tv)
 * ============================================================================
 */

// ============================================================================
// CONFIGURACIÓN DE PERFILES
// ============================================================================

function rq_get_anti_cut_profile(string $profile): array {
    $profiles = [
        'P1' => [
            'label'                => 'P1-NUCLEAR',
            'target_duration'      => 1,
            'part_target'          => 0.2,
            'can_block_reload'     => true,
            'can_skip_until'       => 30.0,
            'part_hold_back'       => 1.0,
            'hold_back'            => 3.0,
            'heartbeat_ms'         => 500,
            'rtt_alert_ms'         => 200,
            'packet_loss_alert'    => 2,
            'segment_gap_tolerance'=> 1,
            'max_bitrate'          => 300000000,
            'min_bitrate'          => 80000000,
            'initial_bitrate'      => '150000000,200000000,300000000',
            'target_bitrate'       => 200000000,
            'max_resolution'       => '7680x4320',
            'screen_resolution'    => '7680x4320',
            'hevc_profile'         => 'MAIN-10-HDR',
            'color_space'          => 'BT2020',
            'hdr_transfer'         => 'SMPTE2084,PQ,HLG',
            'rate_control'         => 'CQP',
            'dscp'                 => 63,
            'bw_smooth_factor'     => '0.01',
            'bw_confidence'        => '0.99',
            'cooldown_period'      => 900,
            'quality_lock'         => 'NATIVA_MAXIMA',
            'parallel_segments'    => '8,12,16',
            'concurrent_downloads' => '8,12,16',
            'prefetch_segments'    => 1000,
            'prefetch_parallel'    => 500,
            'prefetch_strategy'    => 'HYPER_AGGRESSIVE_UNLIMITED',
            'buffer_max'           => 600000,
            'buffer_target'        => 120000,
            'buffer_ms'            => 120000,
            'network_caching'      => 160000,
            'live_caching'         => 160000,
            'file_caching'         => 600000,
            'aggression_multiplier'=> 20,
            'escalation_level'     => 'THERMONUCLEAR',
            'bandwidth_floor'      => 50000000,
            'reconnect_timeout_ms' => 3,
            'reconnect_max'        => 999,
            'reconnect_delay_ms'   => 0,
            'reconnect_strategy'   => 'true,immediate,adaptive,parallel',
            'seamless_failover'    => 'true-ultra',
            'request_priority'     => 'ultra-high-critical',
            'video_track'          => '7680x4320',
            'bl_video_track'       => '7680x4320,3840x2160,1920x1080,1280x720,854x480',
            'adaptive_maxbw'       => 300000000,
            'vlc_network_caching'  => 360000,
            'vlc_live_caching'     => 240000,
            'vlc_disc_caching'     => 600000,
            'vlc_file_caching'     => 600000,
        ],
        'P2' => [
            'label'                => 'P2-AGGRESSIVE',
            'target_duration'      => 1,
            'part_target'          => 0.2,
            'can_block_reload'     => true,
            'can_skip_until'       => 30.0,
            'part_hold_back'       => 1.0,
            'hold_back'            => 3.0,
            'heartbeat_ms'         => 500,
            'rtt_alert_ms'         => 300,
            'packet_loss_alert'    => 3,
            'segment_gap_tolerance'=> 2,
            'max_bitrate'          => 150000000,
            'min_bitrate'          => 25000000,
            'initial_bitrate'      => '80000000,100000000,150000000',
            'target_bitrate'       => 100000000,
            'max_resolution'       => '3840x2160',
            'screen_resolution'    => '3840x2160',
            'hevc_profile'         => 'MAIN-10-HDR',
            'color_space'          => 'BT2020',
            'hdr_transfer'         => 'SMPTE2084,PQ,HLG',
            'rate_control'         => 'CQP',
            'dscp'                 => 56,
            'bw_smooth_factor'     => '0.01',
            'bw_confidence'        => '0.99',
            'cooldown_period'      => 900,
            'quality_lock'         => 'NATIVA_MAXIMA',
            'parallel_segments'    => '8,12,16',
            'concurrent_downloads' => '8,12,16',
            'prefetch_segments'    => 600,
            'prefetch_parallel'    => 300,
            'prefetch_strategy'    => 'AGGRESSIVE_UNLIMITED',
            'buffer_max'           => 360000,
            'buffer_target'        => 90000,
            'buffer_ms'            => 90000,
            'network_caching'      => 120000,
            'live_caching'         => 120000,
            'file_caching'         => 360000,
            'aggression_multiplier'=> 16,
            'escalation_level'     => 'NUCLEAR',
            'bandwidth_floor'      => 25000000,
            'reconnect_timeout_ms' => 3,
            'reconnect_max'        => 999,
            'reconnect_delay_ms'   => 0,
            'reconnect_strategy'   => 'true,immediate,adaptive',
            'seamless_failover'    => 'true',
            'request_priority'     => 'ultra-high-critical',
            'video_track'          => '3840x2160',
            'bl_video_track'       => '3840x2160,1920x1080,1280x720,854x480',
            'adaptive_maxbw'       => 150000000,
            'vlc_network_caching'  => 240000,
            'vlc_live_caching'     => 160000,
            'vlc_disc_caching'     => 360000,
            'vlc_file_caching'     => 360000,
        ],
        'P3' => [
            'label'                => 'P3-STANDARD',
            'target_duration'      => 2,
            'part_target'          => 0.5,
            'can_block_reload'     => true,
            'can_skip_until'       => 20.0,
            'part_hold_back'       => 1.5,
            'hold_back'            => 6.0,
            'heartbeat_ms'         => 1000,
            'rtt_alert_ms'         => 400,
            'packet_loss_alert'    => 5,
            'segment_gap_tolerance'=> 3,
            'max_bitrate'          => 80000000,
            'min_bitrate'          => 8000000,
            'initial_bitrate'      => '50000000,60000000,80000000',
            'target_bitrate'       => 60000000,
            'max_resolution'       => '3840x2160',
            'screen_resolution'    => '3840x2160',
            'hevc_profile'         => 'MAIN-10',
            'color_space'          => 'BT2020',
            'hdr_transfer'         => '',
            'rate_control'         => 'VBR',
            'dscp'                 => 56,
            'bw_smooth_factor'     => '0.01',
            'bw_confidence'        => '0.95',
            'cooldown_period'      => 900,
            'quality_lock'         => 'NATIVA_MAXIMA',
            'parallel_segments'    => '8,12',
            'concurrent_downloads' => '8,12',
            'prefetch_segments'    => 400,
            'prefetch_parallel'    => 200,
            'prefetch_strategy'    => 'AGGRESSIVE',
            'buffer_max'           => 240000,
            'buffer_target'        => 60000,
            'buffer_ms'            => 60000,
            'network_caching'      => 80000,
            'live_caching'         => 80000,
            'file_caching'         => 240000,
            'aggression_multiplier'=> 12,
            'escalation_level'     => 'NUCLEAR',
            'bandwidth_floor'      => 10000000,
            'reconnect_timeout_ms' => 5,
            'reconnect_max'        => 999,
            'reconnect_delay_ms'   => 0,
            'reconnect_strategy'   => 'true,immediate',
            'seamless_failover'    => 'true',
            'request_priority'     => 'high-critical',
            'video_track'          => '3840x2160',
            'bl_video_track'       => '3840x2160,1920x1080,1280x720,854x480',
            'adaptive_maxbw'       => 80000000,
            'vlc_network_caching'  => 160000,
            'vlc_live_caching'     => 120000,
            'vlc_disc_caching'     => 240000,
            'vlc_file_caching'     => 240000,
        ],
        'P4' => [
            'label'                => 'P4-BASIC',
            'target_duration'      => 2,
            'part_target'          => 1.0,
            'can_block_reload'     => true,
            'can_skip_until'       => 15.0,
            'part_hold_back'       => 2.0,
            'hold_back'            => 6.0,
            'heartbeat_ms'         => 2000,
            'rtt_alert_ms'         => 500,
            'packet_loss_alert'    => 8,
            'segment_gap_tolerance'=> 5,
            'max_bitrate'          => 40000000,
            'min_bitrate'          => 4000000,
            'initial_bitrate'      => '20000000,30000000,40000000',
            'target_bitrate'       => 25000000,
            'max_resolution'       => '1920x1080',
            'screen_resolution'    => '1920x1080',
            'hevc_profile'         => 'MAIN-10',
            'color_space'          => 'BT709',
            'hdr_transfer'         => '',
            'rate_control'         => 'VBR',
            'dscp'                 => 46,
            'bw_smooth_factor'     => '0.03',
            'bw_confidence'        => '0.90',
            'cooldown_period'      => 600,
            'quality_lock'         => 'HIGH',
            'parallel_segments'    => '8,12',
            'concurrent_downloads' => '8,12',
            'prefetch_segments'    => 200,
            'prefetch_parallel'    => 100,
            'prefetch_strategy'    => 'STANDARD',
            'buffer_max'           => 180000,
            'buffer_target'        => 40000,
            'buffer_ms'            => 40000,
            'network_caching'      => 60000,
            'live_caching'         => 60000,
            'file_caching'         => 180000,
            'aggression_multiplier'=> 8,
            'escalation_level'     => 'AGGRESSIVE',
            'bandwidth_floor'      => 5000000,
            'reconnect_timeout_ms' => 10,
            'reconnect_max'        => 999,
            'reconnect_delay_ms'   => 100,
            'reconnect_strategy'   => 'true,immediate',
            'seamless_failover'    => 'true',
            'request_priority'     => 'ultra-high-critical',
            'video_track'          => '1920x1080',
            'bl_video_track'       => '1920x1080,1280x720,854x480',
            'adaptive_maxbw'       => 40000000,
            'vlc_network_caching'  => 120000,
            'vlc_live_caching'     => 80000,
            'vlc_disc_caching'     => 180000,
            'vlc_file_caching'     => 180000,
        ],
        'P5' => [
            'label'                => 'P5-MINIMAL',
            'target_duration'      => 3,
            'part_target'          => 1.5,
            'can_block_reload'     => false,
            'can_skip_until'       => 10.0,
            'part_hold_back'       => 3.0,
            'hold_back'            => 9.0,
            'heartbeat_ms'         => 3000,
            'rtt_alert_ms'         => 800,
            'packet_loss_alert'    => 10,
            'segment_gap_tolerance'=> 8,
            'max_bitrate'          => 20000000,
            'min_bitrate'          => 2000000,
            'initial_bitrate'      => '10000000,15000000,20000000',
            'target_bitrate'       => 15000000,
            'max_resolution'       => '1280x720',
            'screen_resolution'    => '1280x720',
            'hevc_profile'         => 'MAIN',
            'color_space'          => 'BT709',
            'hdr_transfer'         => '',
            'rate_control'         => 'VBR',
            'dscp'                 => 46,
            'bw_smooth_factor'     => '0.05',
            'bw_confidence'        => '0.85',
            'cooldown_period'      => 300,
            'quality_lock'         => 'STANDARD',
            'parallel_segments'    => '4,6',
            'concurrent_downloads' => '4,6',
            'prefetch_segments'    => 100,
            'prefetch_parallel'    => 50,
            'prefetch_strategy'    => 'NORMAL',
            'buffer_max'           => 120000,
            'buffer_target'        => 30000,
            'buffer_ms'            => 30000,
            'network_caching'      => 40000,
            'live_caching'         => 40000,
            'file_caching'         => 120000,
            'aggression_multiplier'=> 4,
            'escalation_level'     => 'STANDARD',
            'bandwidth_floor'      => 2000000,
            'reconnect_timeout_ms' => 15,
            'reconnect_max'        => 999,
            'reconnect_delay_ms'   => 500,
            'reconnect_strategy'   => 'true',
            'seamless_failover'    => 'false',
            'request_priority'     => 'normal',
            'video_track'          => '1280x720',
            'bl_video_track'       => '1280x720,854x480',
            'adaptive_maxbw'       => 20000000,
            'vlc_network_caching'  => 80000,
            'vlc_live_caching'     => 60000,
            'vlc_disc_caching'     => 120000,
            'vlc_file_caching'     => 120000,
        ],
    ];

    return $profiles[$profile] ?? $profiles['P3'];
}

// ============================================================================
// FUNCIÓN PRINCIPAL: Genera toda la estructura de datos Anti-Cut
// ============================================================================

function rq_anti_cut_isp_strangler(string $profile, int $ch_id, string $origin, string $session): array {
    $p = rq_get_anti_cut_profile($profile);

    // ═══════════════════════════════════════════════════════════════════════════
    // ⚡ CAPACITY OVERDRIVE ENGINE v1.0 — ANTI-STARVATION MULTIPLIER x2.5
    // Multiplica valores de capacidad x2.5 DESPUÉS de cargar el perfil.
    // Garantiza que incluso una mala clasificación (ej: 1080p como P4)
    // tenga suficiente buffer/bitrate/BW para no congelarse.
    // ISP y ancho de banda NO son restricción → MÁXIMA AGRESIÓN.
    // ═══════════════════════════════════════════════════════════════════════════
    $COE = 2.5;
    $p['max_bitrate']          = (int)round($p['max_bitrate'] * $COE);
    $p['min_bitrate']          = (int)round($p['min_bitrate'] * $COE);
    $p['target_bitrate']       = (int)round($p['target_bitrate'] * $COE);
    $p['buffer_ms']            = (int)round($p['buffer_ms'] * $COE);
    $p['buffer_target']        = (int)round($p['buffer_target'] * $COE);
    $p['buffer_max']           = (int)round($p['buffer_max'] * $COE);
    $p['network_caching']      = (int)round($p['network_caching'] * $COE);
    $p['live_caching']         = (int)round($p['live_caching'] * $COE);
    $p['file_caching']         = (int)round($p['file_caching'] * $COE);
    $p['prefetch_segments']    = (int)round($p['prefetch_segments'] * $COE);
    $p['prefetch_parallel']    = (int)round($p['prefetch_parallel'] * $COE);
    $p['bandwidth_floor']      = (int)round($p['bandwidth_floor'] * $COE);
    $p['adaptive_maxbw']       = (int)round($p['adaptive_maxbw'] * $COE);
    $p['vlc_network_caching']  = (int)round($p['vlc_network_caching'] * $COE);
    $p['vlc_live_caching']     = (int)round($p['vlc_live_caching'] * $COE);
    $p['vlc_disc_caching']     = (int)round($p['vlc_disc_caching'] * $COE);
    $p['vlc_file_caching']     = (int)round($p['vlc_file_caching'] * $COE);

    $now = gmdate('Y-m-d\TH:i:s\Z');
    $shieldUA = 'Mozilla/5.0 (Linux; Android 14; SHIELD Android TV Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Safari/537.36';

    // === HTTP Response Headers (sent via header()) ===
    $http_headers = [
        'Cache-Control: no-cache, no-store, must-revalidate, max-age=0',
        'Surrogate-Control: no-store, no-cache',
        'Pragma: no-cache',
        'Expires: Thu, 01 Jan 1970 00:00:00 GMT',
        'X-Playback-Session-Id: ' . $session,
        'X-Server-Time: ' . (string)(time() * 1000),
        'Age: 0',
        'Connection: keep-alive',
        'Keep-Alive: timeout=300, max=1000',
        'Accept-Ranges: bytes',
        'Alt-Svc: h3=":443"; ma=86400, h2=":443"; ma=86400',
        'X-Accel-Buffering: no',
        'Access-Control-Allow-Origin: *',
        'Access-Control-Expose-Headers: X-Playback-Session-Id, X-Server-Time, X-Stream-Sequence, X-APE-Cut-Status',
        'X-APE-Cut-Status: monitoring',
        'X-APE-Engine: APE-ANTI-CUT-v1.0',
        'X-APE-Profile: ' . $p['label'],
        'X-APE-Cooldown: ' . $p['cooldown_period'] . 's',
    ];

    // === HLS EXT-X Directives ===
    $hls_ext = [];
    $hls_ext[] = '#EXT-X-VERSION:9';
    $hls_ext[] = '#EXT-X-TARGETDURATION:' . $p['target_duration'];
    $hls_ext[] = '#EXT-X-PART-INF:PART-TARGET=' . $p['part_target'];
    $server_control = 'CAN-SKIP-UNTIL=' . $p['can_skip_until']
        . ',PART-HOLD-BACK=' . $p['part_hold_back']
        . ',HOLD-BACK=' . $p['hold_back'];
    if ($p['can_block_reload']) {
        $server_control .= ',CAN-BLOCK-RELOAD=YES';
    }
    $hls_ext[] = '#EXT-X-SERVER-CONTROL:' . $server_control;
    $hls_ext[] = '#EXT-X-PROGRAM-DATE-TIME:' . $now;
    $hls_ext[] = '#EXT-X-DATERANGE:ID="ape-anticut-' . $ch_id . '",START-DATE="' . $now . '",DURATION=0.0,'
        . 'X-APE-ENGINE="ANTI-CUT-v1.0",X-APE-PROFILE="' . $p['label'] . '",'
        . 'X-APE-QUALITY-LOCK="' . $p['quality_lock'] . '",X-APE-COOLDOWN="' . $p['cooldown_period'] . '"';
    $hls_ext[] = '#EXT-X-SESSION-DATA:DATA-ID="com.ape.anticut.profile",VALUE="' . $p['label'] . '"';
    $hls_ext[] = '#EXT-X-SESSION-DATA:DATA-ID="com.ape.anticut.quality_lock",VALUE="' . $p['quality_lock'] . '"';
    $hls_ext[] = '#EXT-X-SESSION-DATA:DATA-ID="com.ape.anticut.cooldown",VALUE="' . $p['cooldown_period'] . 's"';
    $hls_ext[] = '#EXT-X-SESSION-DATA:DATA-ID="com.ape.anticut.max_bitrate",VALUE="' . $p['max_bitrate'] . '"';
    $hls_ext[] = '#EXT-X-SESSION-DATA:DATA-ID="com.ape.anticut.min_bitrate",VALUE="' . $p['min_bitrate'] . '"';

    // === EXTHTTP Headers (JSON embedded in M3U) ===
    $exthttp = [
        // User-Agent: Shield TV Pro
        'User-Agent'             => $shieldUA,
        'Referer'                => 'https://' . ($origin ?: 'cdn.iptv.app') . '/',
        'Origin'                 => 'https://' . ($origin ?: 'cdn.iptv.app'),
        'Connection'             => 'keep-alive',
        'Accept-Language'        => 'en-US,en;q=0.9',

        // CDP: Cut Detection
        'X-APE-Cut-Detection'    => 'ACTIVE',
        'X-Packet-Loss-Monitor'  => 'enabled,aggressive,compensate',
        'X-RTT-Monitoring'       => 'enabled,aggressive,compensate',
        'X-Congestion-Detect'    => 'enabled',
        'X-Segment-Failure-Track'=> 'enabled,log,alert,reconnect',
        'X-Buffer-Underrun-Monitor' => 'enabled,aggressive-prefetch-preventive',
        'X-Bandwidth-Estimation' => 'optimistic,unlimited',
        'X-BW-Confidence-Threshold' => $p['bw_confidence'],
        'X-BW-Estimation-Window' => '10',
        'X-Playback-Session-Id'  => $session,

        // ACRP: Quality Lock
        'X-Max-Bitrate'          => (string)$p['max_bitrate'],
        'X-Min-Bitrate'          => (string)$p['min_bitrate'],
        'X-Initial-Bitrate'      => $p['initial_bitrate'],
        'X-Target-Bitrate'       => (string)$p['target_bitrate'],
        'X-Max-Resolution'       => $p['max_resolution'],
        'X-Screen-Resolution'    => $p['screen_resolution'],
        'X-Preferred-Resolution' => '4320',
        'X-Min-Resolution'       => '2160',
        'X-HEVC-Tier'            => 'HIGH',
        'X-HEVC-Level'           => '6.1,6.0,5.1,5.0,4.1,4.0,3.1',
        'X-HEVC-Profile'         => $p['hevc_profile'],
        'X-Video-Profile'        => 'main10',
        'X-Color-Space'          => $p['color_space'],
        'X-Chroma-Subsampling'   => '4:2:0',
        'X-Color-Depth'          => '10',
        'X-Color-Primaries'      => ($p['color_space'] === 'BT2020') ? 'bt2020' : 'bt709',
        'X-Pixel-Format'         => 'yuv420p10le',
        'X-HDR-Support'          => 'hdr10,hdr10+,dolby_vision,hlg,slhdr1',
        'X-HDR-Peak-Luminance'   => '5000',
        'X-HDR-MaxCLL'           => '5000',
        'X-HDR-MaxFALL'          => '1500',
        'X-HDR-Min-Luminance'    => '0.0001',
        'X-HDR-Mastering-Display'=> 'G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(50000000,1)',
        'X-HDR-Bit-Depth'        => '12',
        'X-HDR10Plus-Profile'    => 'A',
        'X-Dolby-Vision-Profile' => '8.1,8.4,5',
        'X-Display-Brightness'   => '5000',
        'X-GPU-Tone-Mapping'     => 'hable,perceptual,adaptive',
        'X-GPU-HDR-Processing'   => 'maximum,per-pixel',
        'X-Dynamic-Range'        => ($p['color_space'] === 'BT2020') ? 'hdr' : 'sdr',
        'X-Rate-Control'         => $p['rate_control'],
        'X-Entropy-Coding'       => 'CABAC',
        'X-Compression-Level'    => '1',
        'X-Sharpen-Sigma'        => '0.02',
        'X-Frame-Rates'          => '24,25,30,50,60,120',
        'X-Codec-Priority'       => 'h266,hevc,vp9,av1,h264',
        'X-Bypass-ABR'           => 'true',
        'X-Quality-Lock'         => $p['quality_lock'],
        'X-Force-Quality-Lock'   => 'true',
        'X-Disable-Downswitch'   => 'true',
        'X-Cooldown-Period'      => (string)$p['cooldown_period'],

        // HDR Transfer Function (P1/P2 only)
        'X-HDR-Transfer-Function'=> $p['hdr_transfer'] ?: 'auto',
        'X-Matrix-Coefficients'  => ($p['color_space'] === 'BT2020') ? 'BT2020NC' : 'BT709',

        // ISSP: ISP Strangulation
        'X-Bandwidth-Guarantee'  => 'unlimited',
        'X-Bandwidth-Preference' => 'unlimited',
        'X-BW-Smooth-Factor'     => $p['bw_smooth_factor'],
        'X-Min-Bandwidth-Floor'  => (string)$p['bandwidth_floor'],
        'X-Network-Caching'      => (string)$p['network_caching'],
        'X-Live-Caching'         => (string)$p['live_caching'],
        'X-File-Caching'         => (string)$p['file_caching'],
        'X-Buffer-Strategy'      => 'RAM_OVERDRIVE_MULTI_TCP',
        'X-Buffer-Ms'            => (string)$p['buffer_ms'],
        'X-Buffer-Target'        => (string)$p['buffer_target'],
        'X-Buffer-Min'           => '1000',
        'X-Buffer-Max'           => (string)$p['buffer_max'],
        'X-Buffer-Target-Override'=> (string)$p['buffer_max'],
        'X-Buffer-Escalation-Level' => $p['escalation_level'],
        'X-Aggression-Multiplier'=> (string)$p['aggression_multiplier'],
        'X-Buffer-Underrun-Strategy' => 'aggressive-prefetch-preventive',
        'X-Prefetch-Segments'    => (string)$p['prefetch_segments'],
        'X-Prefetch-Parallel'    => (string)$p['prefetch_parallel'],
        'X-Prefetch-Buffer-Target' => (string)($p['prefetch_segments'] * 2000),
        'X-Prefetch-Strategy'    => $p['prefetch_strategy'],
        'X-Prefetch-Enabled'     => 'true,adaptive,auto,aggressive',
        'X-Prefetch-Depth'       => '30',
        'X-Parallel-Segments'    => $p['parallel_segments'],
        'X-Concurrent-Downloads' => $p['concurrent_downloads'],
        'X-Segment-Preload'      => 'true',
        'X-Segment-Duration'     => (string)$p['target_duration'],
        'X-DSCP-Override'        => (string)$p['dscp'],
        'X-Priority'             => $p['request_priority'],
        'X-QoS-Class'            => 'platinum',
        'X-QoS-Level'            => 'premium',
        'X-Traffic-Class'        => 'media-streaming',
        'X-Network-Priority'     => 'high',

        // TCP Optimization
        'X-TCP-Congestion-Control' => ($p['dscp'] >= 46) ? 'bbr' : 'cubic',
        'X-TCP-Fast-Open'        => 'true',
        'X-TCP-Quick-ACK'        => 'true',
        'X-TCP-Window-Scale'     => 'true',
        'X-TCP-MTU-Probing'      => 'true',

        // Audio Premium (Safe for OTT Navigator / ExoPlayer)
        'X-Audio-Codecs'         => 'eac3,ac3,aac,mp3',
        'X-Audio-Track-Selection'=> 'default',
        'X-Dolby-Atmos'          => 'false',
        'X-Audio-Channels'       => '5.1,2.0',
        'X-Audio-Sample-Rate'    => '48000',
        'X-Audio-Bit-Depth'      => '16bit,24bit',
        'X-Spatial-Audio'        => 'false',
        'X-Audio-Passthrough'    => 'false',

        // Reconnection
        'X-Reconnect-Timeout-Ms' => (string)$p['reconnect_timeout_ms'],
        'X-Reconnect-Max-Attempts' => (string)$p['reconnect_max'],
        'X-Reconnect-Delay-Ms'   => (string)$p['reconnect_delay_ms'],
        'X-Reconnect-On-Error'   => $p['reconnect_strategy'],
        'X-Failover-Enabled'     => 'true',
        'X-Seamless-Failover'    => $p['seamless_failover'],
        'X-Request-Priority'     => $p['request_priority'],

        // Session
        'X-Client-Timestamp'     => (string)time(),
        'X-Device-Id'            => 'DEV_' . substr(md5($session), 0, 12),
        'X-Request-Id'           => 'REQ_' . substr(md5($session . time()), 0, 12),
    ];

    // === EXTVLCOPT Directives ===
    $extvlcopt = [
        // User-Agent
        'http-user-agent=' . $shieldUA,
        'http-referrer=https://' . ($origin ?: 'cdn.iptv.app') . '/',

        // Codec
        'avcodec-codec=hevc',
        'sout-video-codec=hevc',
        'codec=hevc',
        'avcodec-hw=any,dxva2,d3d11va,nvdec,vdpau',
        'avcodec-fast=1',
        'avcodec-threads=0',
        'sout-video-profile=main10',

        // Resolution ladder (ALWAYS top-down: 8K → 4K → FHD → HD → SD)
        'adaptive-maxbw=' . $p['adaptive_maxbw'],
        'preferred-resolution=4320',
        'adaptive-maxwidth=7680',
        'adaptive-maxheight=4320',
        'preferred-resolution=2160',
        'adaptive-maxwidth=3840',
        'adaptive-maxheight=2160',
        'preferred-resolution=1080',
        'adaptive-maxwidth=1920',
        'adaptive-maxheight=1080',
        'preferred-resolution=720',
        'adaptive-maxwidth=1280',
        'adaptive-maxheight=720',
        'adaptive-logic=highest',

        // Caching
        'network-caching=' . $p['vlc_network_caching'],
        'live-caching=' . $p['vlc_live_caching'],
        'disc-caching=' . $p['vlc_disc_caching'],
        'file-caching=' . $p['vlc_file_caching'],

        // Anti-Freeze
        'clock-jitter=0',
        'clock-synchro=0',
        'http-continuous=true',
        'http-reconnect=true',
        'no-drop-late-frames=true',
        'no-skip-frames=true',
        'avcodec-skip-frame=0',
        'avcodec-skip-idct=0',

        // Timeouts
        'http-timeout=12000',
        'http-user-timeout=15000',
        'server-port=443',
        'no-http-reconnect=0',

        // TLS
        'http-ssl-verifyhost=0',
        'http-ssl-verifypeer=0',
        'tls-session-resumption=true',
        'gnutls-compression=none',

        // QoS
        'network-caching-dscp=' . $p['dscp'],
        'network-caching-dscp-qos=' . $p['dscp'],

        // Video Processing
        'deinterlace=1',
        'deinterlace-mode=bwdif',
        'video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full',
        'postproc-q=6',
        'aspect-ratio=16:9',
        'crop=16:9',
        'autoscale=true',
        'vout=opengl',
        'video-on-top=0',
        'fullscreen=0',

        // Audio
        'audio-channels=6',
        'audiotrack-passthrough=true',
        'force-dolby-surround=0',
    ];

    // === JSON Commands (embedded as M3U comments) ===
    $json_commands = [];

    // JCS Command 1: Anti-Cut State Machine
    $json_commands[] = '# ' . json_encode([
        'ape_command_set'    => 'ANTI_CUT_ENGINE_v1.0',
        'profile'            => $p['label'],
        'cut_detection'      => [
            'monitor_buffer'        => true,
            'monitor_packet_loss'   => true,
            'monitor_rtt'           => true,
            'monitor_segment_gaps'  => true,
            'heartbeat_ms'          => $p['heartbeat_ms'],
            'rtt_alert_ms'          => $p['rtt_alert_ms'],
            'packet_loss_alert_pct' => $p['packet_loss_alert'],
            'segment_gap_tolerance' => $p['segment_gap_tolerance'],
        ],
        'cut_response'       => [
            'on_first_cut' => [
                'action'              => 'lock_quality_and_reconnect',
                'quality_lock_seconds'=> $p['cooldown_period'],
                'reconnect_delay_ms'  => 0,
                'keep_quality'        => true,
                'escalate_buffer'     => true,
            ],
            'on_repeated_cuts' => [
                'parallel_connections'=> '8,12,16',
                'prefetch_multiplier' => 2.0,
                'buffer_multiplier'   => 1.5,
                'escalate_isp'        => true,
            ],
        ],
    ], JSON_UNESCAPED_SLASHES);

    // JCS Command 2: Quality Lock Matrix
    $json_commands[] = '# ' . json_encode([
        'ape_quality_lock_matrix' => 'v1.0',
        'states' => [
            'IDLE'          => ['target_bw' => $p['max_bitrate'], 'min_bw' => $p['min_bitrate'], 'downswitch' => 'normal', 'resolution' => $p['max_resolution'], 'hevc' => $p['hevc_profile']],
            'CUT_DETECTED'  => ['target_bw' => $p['target_bitrate'], 'min_bw' => $p['min_bitrate'], 'downswitch' => 'BLOCKED', 'resolution' => $p['max_resolution'], 'hevc' => $p['hevc_profile']],
            'RECONNECTING'  => ['target_bw' => $p['max_bitrate'], 'min_bw' => $p['min_bitrate'], 'downswitch' => 'BLOCKED', 'resolution' => $p['max_resolution'], 'hevc' => $p['hevc_profile']],
            'COOLDOWN'      => ['target_bw' => $p['target_bitrate'], 'min_bw' => $p['min_bitrate'], 'downswitch' => 'BLOCKED', 'duration_s' => $p['cooldown_period']],
            'STABLE_15MIN'  => ['target_bw' => $p['max_bitrate'], 'min_bw' => $p['min_bitrate'], 'downswitch' => 'limited', 'aggressive_probe' => true],
        ],
    ], JSON_UNESCAPED_SLASHES);

    // JCS Command 3: ISP Strangulation Config
    $json_commands[] = '# ' . json_encode([
        'ape_isp_strangulation' => 'v1.0',
        'tcp_optimization' => [
            'congestion_control'=> ($p['dscp'] >= 46) ? 'bbr' : 'cubic',
            'fast_open'         => true,
            'quick_ack'         => true,
            'window_scale'      => true,
            'mtu_probing'       => true,
        ],
        'parallel_downloads' => [
            'segments_per_conn' => $p['parallel_segments'],
            'concurrent'        => $p['concurrent_downloads'],
            'prefetch_count'    => $p['prefetch_segments'],
            'prefetch_parallel' => $p['prefetch_parallel'],
            'strategy'          => $p['prefetch_strategy'],
        ],
        'buffer' => [
            'target_ms'  => $p['buffer_target'],
            'max_ms'     => $p['buffer_max'],
            'escalation' => $p['escalation_level'],
            'aggression' => $p['aggression_multiplier'],
        ],
        'qos' => [
            'dscp'       => $p['dscp'],
            'priority'   => $p['request_priority'],
            'guarantee'  => 'unlimited',
            'floor_bps'  => $p['bandwidth_floor'],
        ],
    ], JSON_UNESCAPED_SLASHES);

    // JCS Command 4: Recovery Protocol
    $json_commands[] = '# ' . json_encode([
        'ape_recovery'  => 'v1.0',
        'on_cut' => [
            'step_1_immediate' => [
                'action'       => 'http_reconnect',
                'delay_ms'     => 0,
                'timeout_ms'   => $p['reconnect_timeout_ms'] * 1000,
                'keep_quality' => true,
            ],
            'step_2_parallel' => [
                'action'       => 'parallel_reconnect',
                'connections'  => 4,
                'first_response'=> 'use',
                'cancel_rest'  => true,
            ],
            'step_3_fallback' => [
                'action'       => 'try_alternate_origin',
                'strategy'     => 'rotate',
                'cooldown_s'   => 30,
            ],
            'step_4_escalate' => [
                'action'          => 'escalate_isp_strangling',
                'double_prefetch' => true,
                'double_buffer'   => true,
                'max_connections'  => 16,
                'notify'          => false,
            ],
        ],
    ], JSON_UNESCAPED_SLASHES);

    // JCS Command 5: Channel Profile Summary
    $json_commands[] = '# ' . json_encode([
        'ape_channel_profile' => 'v1.0',
        'ch_id'          => $ch_id,
        'profile'        => $p['label'],
        'session'        => $session,
        'timestamp'      => $now,
        'max_bitrate'    => $p['max_bitrate'],
        'min_bitrate'    => $p['min_bitrate'],
        'resolution'     => $p['max_resolution'],
        'hevc'           => $p['hevc_profile'],
        'color_space'    => $p['color_space'],
        'quality_lock'   => $p['quality_lock'],
        'cooldown_s'     => $p['cooldown_period'],
        'escalation'     => $p['escalation_level'],
        'aggression'     => $p['aggression_multiplier'],
    ], JSON_UNESCAPED_SLASHES);

    return [
        'http_headers'   => $http_headers,
        'hls_ext'        => $hls_ext,
        'exthttp'        => $exthttp,
        'extvlcopt'      => $extvlcopt,
        'json_commands'  => $json_commands,
        'profile_data'   => $p,
    ];
}

// ============================================================================
// FUNCIÓN: Genera el bloque M3U completo Anti-Cut
// ============================================================================

function rq_generate_anti_cut_block(string $profile, int $ch_id, string $origin, string $session): string {
    $data = rq_anti_cut_isp_strangler($profile, $ch_id, $origin, $session);
    $lines = [];

    // HLS EXT-X directives
    foreach ($data['hls_ext'] as $ext) {
        $lines[] = $ext;
    }

    // JSON Commands (as M3U comments)
    foreach ($data['json_commands'] as $cmd) {
        $lines[] = $cmd;
    }

    return implode("\n", $lines);
}
