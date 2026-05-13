import re
import os

php_path = r'c:\Users\HFRC\Desktop\IPTV_Navigator_PRO (12)\vps_backup_20260222\resolve.php'
output_path = r'c:\Users\HFRC\Desktop\IPTV_Navigator_PRO (12)\resolve_fixed.php'

with open(php_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Expanded headers list for PHP
new_headers = '''    // Mirroring JS Standard Headers
    "User-Agent"               => $uaOut,
    "Origin"                   => "http://" . $effectiveHost,
    "Referer"                  => "http://" . $effectiveHost . "/",
    "Accept"                   => ACCEPT_HEADER,
    "Accept-Encoding"          => ACCEPT_ENCODING,
    // HEVC Optimization
    "X-HEVC-Tier"              => $cfg['hevc_tier'],
    "X-HEVC-Level"             => $cfg['hevc_level'],
    "X-HEVC-Profile"           => $cfg['hevc_profile'],
    "X-Video-Profile"          => $cfg['vid_profile'],
    "X-Color-Space"            => $cfg['color_space'],
    "X-Chroma-Subsampling"     => $cfg['chroma'],
    "X-HDR-Transfer-Function"  => $cfg['transfer'],
    "X-Matrix-Coefficients"    => $cfg['matrix'],
    "X-Compression-Level"      => (string)$cfg['compress'],
    "X-Sharpen-Sigma"          => (string)$cfg['sharpen'],
    "X-Rate-Control"           => $cfg['rate_ctrl'],
    "X-Entropy-Coding"         => $cfg['entropy'],
    "X-Pixel-Format"           => $cfg['pix_fmt'],
    "X-Color-Depth"            => (string)$cfg['color_depth'],
    // Buffer & Caching
    "X-Network-Caching"        => (string)$cfg['net_cache'],
    "X-Live-Caching"           => (string)$cfg['live_cache'],
    "X-File-Caching"           => (string)$cfg['file_cache'],
    "X-Buffer-Strategy"        => $mode,
    "X-Buffer-Ms"              => (string)$cfg['buffer_ms'],
    "X-Buffer-Target"          => (string)$cfg['buffer_ms'],
    "X-Buffer-Min"             => (string)round($cfg['buffer_ms'] * 0.1),
    "X-Buffer-Max"             => (string)round($cfg['buffer_ms'] * 2),
    // Prefetch
    "X-Prefetch-Segments"      => (string)$cfg['prefetch_seg'],
    "X-Prefetch-Parallel"      => (string)$cfg['prefetch_par'],
    "X-Prefetch-Buffer-Target" => (string)$cfg['prefetch_buf'],
    "X-Prefetch-Strategy"      => "ULTRA_AGRESIVO_ILIMITADO",
    "X-Prefetch-Enabled"       => "true,adaptive,auto",
    // Reconnect
    "X-Reconnect-Timeout-Ms"   => (string)$cfg['recon_timeout'],
    "X-Reconnect-Max-Attempts" => (string)$cfg['recon_max'],
    "X-Reconnect-Delay-Ms"     => (string)$cfg['recon_delay'],
    "X-Reconnect-On-Error"     => "true,immediate,adaptive",
    // Segment
    "X-Segment-Duration"       => (string)$cfg['seg_dur'],
    "X-Bandwidth-Guarantee"    => (string)$cfg['bw_guarantee'],
    // APE Engine Core
    "X-App-Version"            => "APE_16.1.1-HARDENED-DUAL-SOURCE",
    "X-Playback-Session-Id"    => $sessionId,
    "X-Device-Id"              => $deviceId,
    "X-Stream-Type"            => "hls",
    "X-Quality-Preference"     => "codec-" . strtolower($cfg['codec_primary']) . ",profile-" . $cfg['vid_profile'] . ",tier-" . strtolower($cfg['hevc_tier']),
    // Playback Avanzado
    "X-Playback-Rate"          => "1.0,1.25,1.5",
    "X-Min-Buffer-Time"        => "1,2,3",
    "X-Max-Buffer-Time"        => "8,12,15",
    "X-Request-Priority"       => "ultra-high-critical",
    // Codecs & DRM
    "X-Video-Codecs"           => $cfg['codec_priority'],
    "X-Codec-Support"          => $cfg['codec_priority'],
    "X-Audio-Codecs"           => "opus,aac,eac3,ac3,dolby,mp3",
    "X-DRM-Support"            => "widevine,playready,fairplay",
    // CDN & Failover
    "X-CDN-Provider"           => "auto",
    "X-Failover-Enabled"       => "true",
    "X-Buffer-Size"            => (string)intval($cfg['max_bw'] / 550),
    // Metadata & Tracking
    "X-Client-Timestamp"       => $timestamp,
    "X-Request-Id"             => $requestId,
    "X-Device-Type"            => "smart-tv",
    "X-Screen-Resolution"      => $cfg['res'],
    "X-Network-Type"           => "wifi",
    // OTT Navigator Compat
    "X-OTT-Navigator-Version"  => "1.7.0.0-aggressive-extreme",
    "X-Player-Type"            => "exoplayer-ultra-extreme,vlc-pro",
    "X-Hardware-Decode"        => "true",
    "X-Audio-Track-Selection"  => "highest-quality-extreme,dolby-atmos-first",
    "X-Subtitle-Track-Selection"=> "off",
    "X-EPG-Sync"               => "enabled",
    "X-Catchup-Support"        => "flussonic-ultra",
    // Streaming Control
    "X-Bandwidth-Estimation"   => "adaptive,balanced,conservative",
    "X-Initial-Bitrate"        => "50000000,60000000,80000000",
    "X-Retry-Count"            => "10,12,15",
    "X-Retry-Delay-Ms"         => "120,200,350",
    "X-Connection-Timeout-Ms"  => "2500,3500,6000",
    "X-Read-Timeout-Ms"        => "6000,9000,12000",
    // Security
    "X-Country-Code"           => "US",
    // HDR & Color
    "X-HDR-Support"            => $hdrEnabled ? implode(',', $cfg['hdr']) : 'none',
    "X-Dynamic-Range"          => $hdrEnabled ? "hdr" : "sdr",
    "X-Color-Primaries"        => $cfg['color_space'] === 'BT2020' ? "bt2020" : "bt709",
    // Resolution Advanced
    "X-Max-Resolution"         => $cfg['res'],
    "X-Max-Bitrate"            => (string)$cfg['max_bw'],
    "X-Frame-Rates"            => "24,25,30,50,60,120",
    "X-Aspect-Ratio"           => "16:9,21:9",
    "X-Pixel-Aspect-Ratio"     => "1:1",
    // Audio Premium
    "X-Dolby-Atmos"            => $cfg['audio_ch'] >= 6 ? "true" : "false",
    "X-Audio-Channels"         => $cfg['audio_ch'] >= 6 ? "7.1,5.1,2.0" : "2.0",
    "X-Audio-Sample-Rate"      => "48000,96000",
    "X-Audio-Bit-Depth"        => "24bit",
    "X-Spatial-Audio"          => $cfg['audio_ch'] >= 6 ? "true" : "false",
    "X-Audio-Passthrough"      => "true",
    // Parallel Downloads
    "X-Parallel-Segments"      => "2,3,4",
    "X-Segment-Preload"       => "true",
    "X-Concurrent-Downloads"  => "2,3,4",
    // Anti-Corte / Failover
    "X-Buffer-Underrun-Strategy" => "adaptive-prefetch",
    "X-Seamless-Failover"       => "true-ultra",
    // ABR Control Avanzado
    "X-Bandwidth-Preference"    => "unlimited",
    "X-BW-Estimation-Window"   => "10",
    "X-BW-Confidence-Threshold" => "0.95",
    "X-BW-Smooth-Factor"       => "0.05",
    "X-Packet-Loss-Monitor"    => "enabled,aggressive",
    "X-RTT-Monitoring"         => "enabled,aggressive",
    "X-Congestion-Detect"      => "enabled",
    // Advanced Quality & Network (Mirrored from JS)
    "X-Video-Jitter-Buffer"    => "enabled",
    "X-Network-Adaptation"     => "dynamic-aggressive",
    "X-Profile-Tier"           => $cfg['hevc_tier'],
    "X-Profile-Level"          => $cfg['hevc_level'],
    "X-Buffer-Optimizer"       => "enabled",
    "X-Throughput-Threshold"   => (string)$cfg['max_bw'],
    "X-Connection-Speed-Target" => (string)round($cfg['max_bw'] * 1.5),
    "X-Stream-Optimization"    => "low-latency-high-quality",
    "X-Packet-Prioritization"  => "video-stream-critical",
    "X-Error-Correction-Level" => "strong",
    "X-Segment-Retry-Limit"    => "5",
    "X-Manifest-Refresh-Mode"  => "lazy",
    "X-CDN-Routing-Strategy"   => "closest-edge",
    "X-Playback-Resilience"    => "maximum",
    "X-Device-Class"           => "high-end-uhd-compatible",
    "X-Platform-ID"            => "navigator-exclusive-v16",
    "X-Session-Persistence"    => "stable",
    "X-Buffer-Refill-Rate"     => "fast",
    "X-Audio-Sync-Mode"        => "precise",
    "X-Video-Sync-Mode"        => "precise",
    "X-CPU-Load-Optimization"  => "aggressive",
    "X-GPU-Hardware-Accel"     => "force-on",
    "X-Network-Queue-Management" => "active",
    "X-Bandwidth-Reservation"  => "guaranteed",
    "X-Latency-Compensation"   => "dynamic",
    "X-Playback-Telemetry"     => "full",
    "X-Audit-Signature"        => "HFRC-20260222-REV-A"'''

# Replace $exthttp array block
pattern = r'\$exthttp = \[(.*?)\];'
updated_content = re.sub(pattern, f'$exthttp = [\n{new_headers}\n];', content, flags=re.DOTALL)

with open(output_path, 'w', encoding='utf-8') as f:
    f.write(updated_content)
