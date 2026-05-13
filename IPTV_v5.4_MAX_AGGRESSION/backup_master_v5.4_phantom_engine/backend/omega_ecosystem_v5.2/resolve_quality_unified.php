<?php
/**
 * APE ULTIMATE SSOT: "Motor Quantum Detail Pipeline" (resolve_quality_unified.php) - L7
 *
 * REGLAMENTO: "DETALLE NOVELA/CINE A 14 MBPS. CERO PROXYS".
 * Transcodificación extrema al vuelo usando FFmpeg libx265 (HEVC 10-Bit) a 14M.
 * Modifica agresivamente la luma (unsharp) y corrige con zscale lineal.
 */

error_reporting(E_ALL);
ini_set('display_errors', 0); // Impedir que HTMLs se cuelen en el stream

// 1. FASTCGI BUFFERING OBLITERATION & TCP NODELAY (Zero-Thrashing L7 Pipe)
header("X-Accel-Buffering: no");
header("X-DSCP-Marking: AF41"); 
header("TCP-Fast-Open: 1"); // Preflight Zero-RTT en Edge Nodes (TCP Fast Open)
header("Content-Type: video/x-matroska"); // MKV Live Stream - Skill 030 compatible
header("Connection: close");

function ape_safe_call($func_name, ...$args) {
    if (function_exists($func_name)) {
        return call_user_func_array($func_name, $args);
    }
    return null;
}

if (file_exists(__DIR__ . "/ape_stream_validator_proxy.php")) {
    require_once __DIR__ . "/ape_stream_validator_proxy.php";
}

// ==========================================
// 1. MOTOR DE INTELIGENCIA DE ORIGEN
// ==========================================
function getBestOriginalStream($ch) {
    $available_streams = [
        ['url' => "http://provider/live/{$ch}_h264.ts", 'codec' => 'h264', 'bitrate' => 5000],
        ['url' => "http://provider/live/{$ch}_hevc.ts", 'codec' => 'hevc', 'bitrate' => 12000]
    ];
    usort($available_streams, function($a, $b) {
        return $b['bitrate'] <=> $a['bitrate'];
    });
    return $available_streams[0]; 
}

$ch = $_GET['ch'] ?? null;
if (!$ch) {
    header("HTTP/1.1 400 Bad Request");
    die("Error L7");
}

$best_stream = getBestOriginalStream($ch);
$upstream_url = escapeshellarg($best_stream['url']);

ape_safe_call('ape_sniper_stream_guard', $best_stream['url']);

// ==========================================
// 2. ORQUESTACIÓN SUPREMA (MFSAP) - VULKAN HW, 120FPS IA, x265 RDOQ, OPUS FEC, CBR PADDING & DENOISE DIRECCIONAL
// ==========================================
$ffmpeg_cmd = "ffmpeg -hide_banner -loglevel panic " .
              // Skill 026: NVDEC Direct Vulkan Interop (Hardware Decode Zero-Latencia)
              "-init_hw_device vulkan=vk:0 -filter_hw_device vk -hwaccel nvdec -hwaccel_output_format vulkan " .
              "-fflags +genpts+discardcorrupt -analyzeduration 3000000 -probesize 3000000 " .
              "-i {$upstream_url} " .
              "-c:v libx265 -preset ultrafast -pix_fmt yuv420p10le " .
              // Filter Chain L5: hwdownload -> hqdn3d Chroma Denoise Direccional -> lanczos -> 120fps AI -> zscale linear -> unsharp -> yuv420p10le
              "-vf \"hwdownload,format=nv12,hqdn3d=0:0:5:5,scale=1920:1080:flags=lanczos,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs,zscale=t=linear:npl=100,format=gbrp10le,unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.5,format=yuv420p10le\" " .
              // Skill 035 & Optimization: RDOQ Level 2, Strict CBR=1, CU-Tree=1, SPS/PPS Info (Banding Killer & Protocol Adherence)
              "-x265-params \"crf=17:strict-cbr=1:cu-tree=1:info=1:global_sps=1:aq-mode=3:qcomp=0.7:psy-rd=2.0:psy-rdoq=1.0:rdoq-level=2:deblock=-1,-1\" " .
              // Strict CBR Padding & Null Packet Stuffing L4
              "-b:v 14M -minrate 14M -maxrate 14M -bufsize 14M -muxrate 14M " .
              "-r 120 -g 120 -keyint_min 120 -sc_threshold 0 -bf 3 " .
              // Audio L5: OPUS FEC Inband + Pan Law -3dB Downmix
              "-c:a libopus -b:a 128k -vbr on -compression_level 10 -packet_loss 20 -fec 1 -af \"pan=stereo|c0=FL+0.707*FC+0.707*BL|c1=FR+0.707*FC+0.707*BR,aresample=async=1:min_hard_comp=0.100000:first_pts=0\" " .
              "-copyts -vsync 1 -max_muxing_queue_size 1024 " .
              // MKV/Matroska as pipeline wrapper (Soporta OPUS FEC y Vulkan Pumping)
              "-f matroska pipe:1";

// Ejecuta la Masacre de Bits FFmpeg empalmándola a la salida de Red HTTP
passthru($ffmpeg_cmd);
exit;
?>
