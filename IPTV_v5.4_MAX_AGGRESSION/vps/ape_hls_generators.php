<?php
// ─── CONFIGURACIÓN GLOBAL ────────────────────────────────────────────────────
define('APE_VERSION',       '17.2.1-FULL-DIRECTIVES');
define('APE_ARCHITECTURE',  'DUAL_PROTOCOL_BRIDGE');
define('APE_COMPLIANCE',    'RFC8216');
define('APE_RESOLVER_URL',  'https://iptv-ape.duckdns.org/resolve_quality.php');
define('APE_EXTATTRFROMURL_BASE', 'https://iptv-ape.duckdns.org/resolve_quality.php');
define('CHANNELS_MAP_PATH', __DIR__ . '/channels_map.json');
define('MPD_TEMPLATE_PATH', __DIR__ . '/template.mpd');

// ─── MÓDULOS ACTIVOS ─────────────────────────────────────────────────────────
define('APE_MODULES', 'JWT,HeadersMatrix,Evasion407,BufferAdaptativo,SmartCodec,FibonacciDNA,TLSCoherence,Geoblocking,Throughput,DynamicQoS,Manifest,VPNIntegration,LatencyRayo');
define('APE_MODULES_COUNT', 13);

// ─── PERFILES DE CALIDAD ─────────────────────────────────────────────────────
$APE_PROFILES = [];
require_once __DIR__ . '/ape_profiles.php';

// ─── USER AGENTS POOL ────────────────────────────────────────────────────────
$UA_POOL = [
  'Mozilla/5.0 (Linux; Android 11; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 9; MI BOX S Build/PQ3A.190801.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.100 Safari/537.31',
  'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
  'ExoPlayer/2.18.1 (Linux; Android 12; Pixel 6)',
  'Kodi/20.0 (Linux; Android 11; Shield TV) App_Bitness/64 Version/20.0',
  'VLC/3.0.18 LibVLC/3.0.18',
  'TiviMate/4.7.0 (Android 11; SHIELD Android TV)',
];

// ─── FUNCIÓN: Generar Session ID único ───────────────────────────────────────
function ape_session_id(): string
{
  return 'APE-' . time() . '-' . substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 9);
}

// ─── FUNCIÓN: Generar Request ID único ───────────────────────────────────────
function ape_request_id(): string
{
  return sprintf(
    '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
    mt_rand(0, 0xffff),
    mt_rand(0, 0xffff),
    mt_rand(0, 0xffff),
    mt_rand(0, 0x0fff) | 0x4000,
    mt_rand(0, 0x3fff) | 0x8000,
    mt_rand(0, 0xffff),
    mt_rand(0, 0xffff),
    mt_rand(0, 0xffff)
  );
}

// ─── FUNCIÓN: Generar el bloque de 100 headers HTTP ──────────────────────────
function generate_http_headers_json(array $channel, string $ua, string $profile_key): string
{
  global $APE_PROFILES;
  $p = $APE_PROFILES[$profile_key] ?? $APE_PROFILES['P3'];
  $origin = parse_url($channel['url'] ?? 'https://iptv-ape.duckdns.org', PHP_URL_SCHEME) . '://' .
    parse_url($channel['url'] ?? 'iptv-ape.duckdns.org', PHP_URL_HOST);
  $ts = gmdate('D, d M Y H:i:s') . ' GMT';
  $now_iso = gmdate('Y-m-d\TH:i:s.') . '000Z';

  $headers = [
    'User-Agent'                => $ua,
    'Accept'                    => 'application/vnd.apple.mpegurl, application/x-mpegurl, application/x-m3u8, audio/mpegurl, application/octet-stream, */*',
    'Accept-Encoding'           => 'gzip, deflate',
    'Accept-Language'           => 'es-ES,es;q=0.9,en;q=0.8',
    'Connection'                => 'keep-alive',
    'Keep-Alive'                => 'timeout=120, max=100',
    'Cache-Control'             => 'no-cache',
    // C8 (2026-05-11) — eliminados Range / If-None-Match / If-Modified-Since.
    // If-None-Match:* → CDN devuelve 304+0B → okhttp "unexpected end of stream".
    // Range en m3u8 no es byte-rangeable. Ver memoria feedback_exthttp_traps.md trampa #9.
    // 'Range'                     => 'bytes=0-',
    // 'If-None-Match'             => '*',
    // 'If-Modified-Since'         => $ts,
    'Origin'                    => 'https://iptv-ape.duckdns.org',
    'Referer'                   => 'https://iptv-ape.duckdns.org/',
    'X-Reconnect-On-Error'      => 'true,immediate,adaptive',
    'X-Max-Reconnect-Attempts'  => '15,25,40',
    'X-Reconnect-Delay-Ms'      => '120,200,350',
    'X-Buffer-Underrun-Strategy' => 'aggressive-refill',
    'X-Seamless-Failover'       => 'true-ultra',
    'X-Bandwidth-Preference'    => 'unlimited',
    'X-BW-Estimation-Window'    => '3',
    'X-BW-Confidence-Threshold' => '0.95',
    'X-BW-Smooth-Factor'        => '0.05',
    'X-Packet-Loss-Monitor'     => 'enabled,aggressive',
    'X-RTT-Monitoring'          => 'enabled,aggressive',
    'X-Congestion-Detect'       => 'enabled,aggressive-extreme',
    'X-App-Version'             => '17.2.1-FULL-DIRECTIVES',
    'X-Playback-Session-Id'     => ape_session_id(),
    'X-Device-Id'               => ape_request_id(),
    'X-Stream-Type'             => 'hls,dash',
    'X-Quality-Preference'      => 'codec-hevc,profile-main-12,main-10,tier-high;codec-h265,profile-main-12,main-10,tier-high;codec-h.265,profile-main-12,main-10,tier-high;codec-vp9,profile2,profile0,n/a',
    'Priority'                  => 'u=0, i',
    'X-Playback-Rate'           => '1.0,1.25,1.5',
    'X-Segment-Duration'        => '1,2,4',
    'X-Min-Buffer-Time'         => '1,2,3',
    'X-Max-Buffer-Time'         => '8,12,15',
    'X-Request-Priority'        => 'ultra-high-critical',
    'X-Prefetch-Enabled'        => 'true,adaptive,auto',
    'X-Video-Codecs'            => 'hevc,h265,h.265,vp9,h264,mpeg2',
    'X-Audio-Codecs'            => 'opus,aac,eac3,ac3,dolby,mp3',
    'X-DRM-Support'             => 'widevine,playready,fairplay',
    'X-Buffer-Strategy'         => 'ultra-aggressive',
    'X-OTT-Navigator-Version'   => '1.7.0.0-aggressive-extreme',
    'X-Player-Type'             => 'exoplayer-ultra-extreme,vlc-pro,kodi-pro',
    'X-Hardware-Decode'         => 'true',
    'X-Audio-Track-Selection'   => 'highest-quality-extreme,dolby-atmos-first',
    'X-Subtitle-Track-Selection' => 'off',
    'X-EPG-Sync'                => 'enabled',
    'X-Catchup-Support'         => 'flussonic-ultra',
    'X-Bandwidth-Estimation'    => 'adaptive,balanced,conservative',
    'X-Initial-Bitrate'         => '50000000,60000000,80000000',
    'X-Retry-Count'             => '10,12,15',
    'X-Retry-Delay-Ms'          => '120,200,350',
    'X-Connection-Timeout-Ms'   => '2500,3500,6000',
    'X-Read-Timeout-Ms'         => '6000,9000,12000',
    'X-Country-Code'            => 'US',
    'X-HDR-Support'             => 'hdr10,hlg,hdr10+,dolby-vision',
    'X-Color-Depth'             => '12bit,10bit',
    'X-Color-Space'             => 'bt2020',
    'X-Dynamic-Range'           => 'hdr,sdr',
    'X-HDR-Transfer-Function'   => 'pq,hlg',
    'X-Color-Primaries'         => 'bt2020',
    'X-Matrix-Coefficients'     => 'bt2020nc',
    'X-Chroma-Subsampling'      => '4:4:2,4:2:2,4:2:0',
    'X-HEVC-Tier'               => 'HIGH',
    'X-HEVC-Level'              => '6.1,6.0,5.1,5.0,4.1',
    'X-HEVC-Profile'            => 'MAIN-12,MAIN-10',
    'X-Video-Profile'           => 'main-12,main-10',
    'X-Rate-Control'            => 'VBR,CQP',
    'X-Entropy-Coding'          => 'CABAC,SBAC,TANS,Zstandard,CAVLC',
    'X-Compression-Level'       => '2',
    'X-Pixel-Format'            => 'yuv420p12le,yuv420p10le,yuv420p',
    'X-Sharpen-Sigma'           => '0.05',
    'X-Max-Resolution'          => $p['res'],
    'X-Max-Bitrate'             => (string)$p['bitrate'],
    'X-Frame-Rates'             => '24,25,30,50,60,120',
    'X-Aspect-Ratio'            => '16:9,21:9',
    'X-Pixel-Aspect-Ratio'      => '1:1',
    'X-Dolby-Atmos'             => 'true',
    'X-Audio-Channels'          => '7.1,5.1,2.0',
    'X-Audio-Sample-Rate'       => '48000,96000',
    'X-Audio-Bit-Depth'         => '24bit',
    'X-Spatial-Audio'           => 'true',
    'X-Audio-Passthrough'       => 'true',
    'X-Parallel-Segments'       => '2,3,4',
    'X-Prefetch-Segments'       => '2,3,5',
    'X-Segment-Preload'         => 'true',
    'X-Concurrent-Downloads'    => '2,3,4',
    'X-CDN-Provider'            => 'auto',
    'X-Failover-Enabled'        => 'true',
    'X-Buffer-Size'             => (string)$p['buffer'],
    'X-Buffer-Target'           => (string)(int)($p['buffer'] * 0.75),
    'X-Buffer-Min'              => (string)(int)($p['buffer'] * 0.20),
    'X-Buffer-Max'              => (string)($p['buffer'] + 15000),
    'X-Network-Caching'         => '60000',
    'X-Live-Caching'            => '60000',
    'X-File-Caching'            => '30000',
    'X-Client-Timestamp'        => $now_iso,
    'X-Request-Id'              => ape_request_id(),
    'X-Device-Type'             => 'smart-tv',
    'X-Screen-Resolution'       => $p['res'],
    'X-Network-Type'            => 'wifi',
  ];

  return json_encode($headers, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

// ─── FUNCIÓN: Generar encabezado global APE completo ─────────────────────────
function generate_ape_global_header(array $channels_map, string $list_id): string
{
  global $APE_PROFILES;
  $now_iso = gmdate('Y-m-d\TH:i:s.') . substr(microtime(), 2, 3) . 'Z';
  $ts      = time() . '000';

  $header  = "#EXTM3U\n";
  $header .= "#EXT-X-APE-GLOBAL-BUFFER-STRATEGY:NETWORK=60000,LIVE=60000,FILE=30000\n";
  $header .= "#EXT-X-APE-NETWORK-CACHING:60000\n";
  $header .= "#EXT-X-APE-LIVE-CACHING:60000\n";
  $header .= "#EXT-X-APE-FILE-CACHING:30000\n";
  $header .= "#EXT-X-APE-VERSION:" . APE_VERSION . "\n";
  $header .= "#EXT-X-APE-ARCHITECTURE:" . APE_ARCHITECTURE . "\n";
  $header .= "#EXT-X-APE-GENERATED:{$now_iso}\n";
  $header .= "#EXT-X-APE-LIST-ID:APE_ULTIMATE_{$ts}_{$list_id}\n";
  $header .= "#EXT-X-APE-MODULES-ACTIVE:" . APE_MODULES_COUNT . "\n";
  $header .= "#EXT-X-APE-MODULES-LIST:" . APE_MODULES . "\n";
  $header .= "#EXT-X-APE-JWT-ENABLED:true\n";
  $header .= "#EXT-X-APE-JWT-EXPIRATION:365\n";
  $header .= "#EXT-X-APE-JWT-FIELDS:68\n";
  $header .= "#EXT-X-APE-LAYERS:EXTVLCOPT,KODIPROP,EXT-X-APE,EXT-X-START\n";
  $header .= "#EXT-X-APE-COMPLIANCE:" . APE_COMPLIANCE . "\n";
  $header .= "#EXT-X-APE-TLS-IMPLEMENTATION-VERSION:1.0\n";
  $header .= "#EXT-X-APE-COMPATIBLE:OTT_NAVIGATOR,VLC,KODI,TIVIMATE,SMARTERS\n";
  $header .= "# ═══════════════════════════════════════════════════════════════════════════\n";
  $header .= "# APE EMBEDDED CONFIG - PROFILE DEFINITIONS\n";
  $header .= "# ═══════════════════════════════════════════════════════════════════════════\n";
  $header .= "#EXT-X-APE-EMBEDDED-CONFIG-START\n";

  foreach ($APE_PROFILES as $key => $p) {
    $header .= "# PROFILE {$key}: {$p['name']}\n";
    $header .= "#EXT-X-APE-PROFILE-{$key}-NAME:{$p['name']}\n";
    $header .= "#EXT-X-APE-PROFILE-{$key}-RESOLUTION:{$p['res']}\n";
    $header .= "#EXT-X-APE-PROFILE-{$key}-FPS:{$p['fps']}\n";
    $header .= "#EXT-X-APE-PROFILE-{$key}-BITRATE:{$p['bitrate']}\n";
    $header .= "#EXT-X-APE-PROFILE-{$key}-BUFFER:{$p['buffer']}\n";
    $header .= "#EXT-X-APE-PROFILE-{$key}-MAX-BANDWIDTH:{$p['maxbw']}\n";
    $header .= "#EXT-X-APE-PROFILE-{$key}-CODEC-PRIMARY:{$p['codec_v']}\n";
    $header .= "#EXT-X-APE-PROFILE-{$key}-CODEC-FALLBACK:{$p['codec_vf']}\n";
    $header .= "#EXT-X-APE-PROFILE-{$key}-AUDIO-CODEC-PRIMARY:{$p['codec_a']}\n";
    $header .= "#EXT-X-APE-PROFILE-{$key}-AUDIO-CODEC-FALLBACK:{$p['codec_af']}\n";
    $header .= "#EXT-X-APE-PROFILE-{$key}-PREFETCH-SEGMENTS:{$p['prefetch']}\n";
    $header .= "#EXT-X-APE-PROFILE-{$key}-PREFETCH-PARALLEL:{$p['prefetch_p']}\n";
    $header .= "#EXT-X-APE-PROFILE-{$key}-HDR:{$p['hdr']}\n";
    $header .= "#EXT-X-APE-PROFILE-{$key}-DEVICE-CLASS:{$p['class']}\n";
  }

  $header .= "#EXT-X-APE-EMBEDDED-CONFIG-END\n";
  $header .= "# ═══════════════════════════════════════════════════════════════════════════\n";
  $header .= "# APE ENGINE DIRECTIVES\n";
  $header .= "# ═══════════════════════════════════════════════════════════════════════════\n";
  $header .= "#EXT-X-APE-PROTOCOL-PRIORITY:DASH,HLS,TS\n";
  $header .= "#EXT-X-APE-URL-MODE:CLEAN\n";
  $header .= "#EXT-X-APE-TLS-REQUIRED:true\n";
  $header .= "#EXT-X-APE-TLS-PRIORITY:TLSv1.3,TLSv1.2\n";
  $header .= "#EXT-X-APE-RESILIENCE-MODE:ULTRA\n";
  $header .= "#EXT-X-APE-ZERO-INTERRUPTIONS:true\n";
  $header .= "#EXT-X-APE-AVAILABILITY-TARGET:99.99%\n";
  $header .= "#EXT-X-APE-RECONNECT-MAX-ATTEMPTS:40\n";
  $header .= "#EXT-X-APE-RECONNECT-TIMEOUT-MS:120\n";
  $header .= "#EXT-X-APE-SEGMENT-SKIP:true\n";
  $header .= "#EXT-X-APE-SESSION-PERSISTENCE:true\n";
  $header .= "#EXT-X-APE-SESSION-REUSE:true\n";
  $header .= "#EXT-X-APE-SESSION-TIMESTAMP:{$now_iso}\n";
  $header .= "#EXT-X-APE-THROUGHPUT-MONITORING:enabled\n";
  $header .= "#EXT-X-APE-TIMING-RANDOMIZATION:true\n";
  $header .= "#EXT-X-APE-TRAFFIC-OBFUSCATION:true\n";
  $header .= "#EXT-X-APE-REFERRER-BYPASS:true\n";
  $header .= "#EXT-X-APE-PROXY-ROTATION:true\n";
  $header .= "#EXT-X-APE-UA-ROTATION-INTERVAL:300\n";
  $header .= "#EXT-X-APE-VIDEO-CODEC-PRIORITY:AV1,HEVC,H265,H264,VP9,MPEG2\n";
  $header .= "#EXT-X-APE-VIDEO-QUALITY:ULTRA_EXTREME\n";
  $header .= "#EXT-X-APE-QUALITY-ENHANCEMENT:true\n";
  $header .= "#EXT-X-APE-QUALITY-LEVELS:P0,P1,P2,P3,P4,P5\n";
  $header .= "#EXT-X-APE-SERVER-POOL-SIZE:10\n";
  $header .= "#EXT-X-APE-SERVER-ROTATION:true\n";
  $header .= "#EXT-X-APE-SERVER-DISTRIBUTION:geo-balanced\n";
  $header .= "#EXT-X-APE-REQUEST-RATE:unlimited\n";
  $header .= "#EXT-X-APE-REQUEST-SPACING:0\n";
  $header .= "#EXT-X-APE-URL-REUSE:false\n";
  $header .= "#EXT-X-APE-SERVICE-TIER:ULTRA_PREMIUM\n";
  $header .= "#EXT-X-MOTOR-VERSION:9.1-ULTRA\n";
  $header .= "#EXT-X-MOTOR-EVASION:ACTIVE\n";
  $header .= "#EXT-X-MOTOR-PROXY:ROTATING\n";
  $header .= "#EXT-X-MOTOR-FECHA-ACTUALIZACION:{$now_iso}\n";
  // ─── DIRECTIVAS DASH EXCLUSIVAS V17.2 ────────────────────────
  $header .= "#EXT-X-APE-DASH-PROFILE:urn:mpeg:dash:profile:isoff-live:2011\n";
  $header .= "#EXT-X-APE-DASH-SEGMENT-FORMAT:fMP4-CMAF\n";
  $header .= "#EXT-X-APE-DASH-MIN-BUFFER:PT2S\n";
  $header .= "#EXT-X-APE-DASH-UPDATE-PERIOD:PT2S\n";
  $header .= "#EXT-X-APE-DASH-PRESENTATION-DELAY:PT4S\n";
  $header .= "#EXT-X-APE-DASH-TIMESHIFT-BUFFER:PT30S\n";
  $header .= "#EXT-X-APE-DASH-SEGMENT-DURATION:PT2S\n";
  $header .= "#EXT-X-APE-DASH-ADAPTATION-SETS:VIDEO,AUDIO\n";
  $header .= "#EXT-X-APE-DASH-VIDEO-CODECS:AV1,HEVC,H265,H264\n";
  $header .= "#EXT-X-APE-DASH-AUDIO-CODECS:OPUS,AAC-LC,EAC3,AC3\n";
  $header .= "#EXT-X-APE-DASH-DRM:WIDEVINE,PLAYREADY,CLEARKEY\n";
  $header .= "#EXT-X-APE-DASH-HDR:HDR10,HLG,HDR10+,DOLBY-VISION\n";
  $header .= "#EXT-X-APE-DASH-COLOR-SPACE:BT.2020\n";
  $header .= "#EXT-X-APE-DASH-TRANSFER-FUNCTION:PQ,HLG\n";

  $header .= "#EXT-X-UA-POOL-SIZE:7\n";
  $header .= "#EXT-X-UA-ROTATION:true\n";
  $header .= "#EXT-X-UA-ROTATION-INTERVAL:300\n";
  $header .= "#EXT-X-UA-CATEGORIES:smart-tv,android-tv,exoplayer,vlc,kodi\n";
  $header .= "#EXT-X-UA-PONDERACION:40,30,15,10,5\n";
  $header .= "#EXT-X-HEADERS-DYNAMIC:true\n";
  $header .= "#EXT-X-HEADERS-ROTATE:true\n";
  $header .= "#EXT-X-HEADERS-CACHE-CONTROL:no-cache\n";
  $header .= "#EXT-X-HEADERS-REFERER:https://iptv-ape.duckdns.org/\n";
  $header .= "#EXT-X-HEADERS-DNT:1\n";
  $header .= "#EXT-X-BLOQUEO-DETECCION:true\n";
  $header .= "#EXT-X-BLOQUEO-CODIGOS:403,407,451,429\n";
  $header .= "#EXT-X-BLOQUEO-RESPUESTA:rotate-ua,rotate-proxy,change-origin\n";
  $header .= "#EXT-X-BLOQUEO-REINTENTOS:15\n";
  $header .= "#PLAYLIST:IPTV Navigator PRO - " . APE_ARCHITECTURE . " v" . APE_VERSION . "\n";

  return $header;
}

// ─── FUNCIÓN: Generar bloque de canal HLS completo ───────────────────────────
function generate_hls_channel_block(array $channel, string $cid, string $ua, string $profile_key, string $target_format = 'hls'): string
{
  global $APE_PROFILES;
  $p       = $APE_PROFILES[$profile_key] ?? $APE_PROFILES['P3'];
  $now_iso = gmdate('Y-m-d\TH:i:s.') . '000Z';
  $sig     = 'HFRC-' . gmdate('Ymd') . '-REV-A';

  // Extraer origen de la URL del canal
  $parsed  = parse_url($channel['url'] ?? '');
  $origin  = ($parsed['scheme'] ?? 'http') . '://' . ($parsed['host'] ?? 'iptv-ape.duckdns.org');
  if (!empty($parsed['port'])) $origin .= ':' . $parsed['port'];

  // Nombre del canal para el slug
  $ch_slug = strtolower(preg_replace('/[^a-z0-9]/i', '', $channel['name'] ?? $cid));

  // Modo de reproducción según el grupo
  $mode = 'fastzap-then-stable';
  $group_lower = strtolower($channel['group'] ?? '');
  if (str_contains($group_lower, 'deport') || str_contains($group_lower, 'sport')) {
    $mode = 'sports-hdr-fastzap-then-stable';
  } elseif (str_contains($group_lower, 'notic') || str_contains($group_lower, 'news')) {
    $mode = 'news-fastzap-stable';
  } elseif (str_contains($group_lower, 'movie') || str_contains($group_lower, 'pelicul') || str_contains($group_lower, 'cine')) {
    $mode = 'movie-hdr-stable';
  }

  // URL del resolver para EXTATTRFROMURL
  $extattrfromurl = APE_EXTATTRFROMURL_BASE
    . "?ch={$ch_slug}.{$cid}"
    . "&p=auto"
    . "&mode={$mode}"
    . "&format={$target_format}"
    . "&list=" . APE_VERSION
    . "&origin=" . rawurlencode($origin)
    . "&sig={$sig}";

  // Generar JSON de headers
  $headers_json = generate_http_headers_json($channel, $ua, $profile_key);

  // URL de ignición: apunta de vuelta al Bridge
  $ignition_fmt = ($target_format === 'dash') ? 'dash' : 'ts';
  $ignition_url = APE_RESOLVER_URL . "?ch={$cid}&format={$ignition_fmt}&p=auto";

  // Construir el bloque del canal
  $block  = "# ═══════════════════════════════════════════════════════════════════════════\n";
  $block .= "# 🌐 GLOBAL HTTP HEADERS (Profile: {$profile_key} - {$p['name']})\n";
  $block .= "# 📊 Headers: 100 | Generated: {$now_iso}\n";
  $block .= "# ═══════════════════════════════════════════════════════════════════════════\n";
  $block .= "#EXT-X-APE-HTTP-HEADERS:{$headers_json}\n";

  if ($target_format === 'dash') {
    $block .= "#EXT-X-APE-DASH-CHANNEL-ID:{$cid}\n";
    $block .= "#EXT-X-APE-DASH-CHANNEL-PROFILE:{$profile_key}\n";
    $block .= "#EXT-X-APE-DASH-CHANNEL-CODEC:{$p['codec_v']}\n";
    $block .= "#EXT-X-APE-DASH-CHANNEL-FALLBACK-CODEC:{$p['codec_vf']}\n";
    $hdr_str = empty($p['hdr']) ? 'sdr' : implode(',', $p['hdr']);
    $block .= "#EXT-X-APE-DASH-CHANNEL-HDR:{$hdr_str}\n";
    $block .= "#EXT-X-APE-DASH-CHANNEL-BITRATE:{$p['bitrate']}kbps\n";
    $block .= "#EXT-X-APE-DASH-CHANNEL-RESOLUTION:{$p['res']}\n";
    $block .= "#EXT-X-APE-DASH-CHANNEL-FPS:{$p['fps']}\n";
    $block .= "#EXT-X-APE-DASH-CHANNEL-SEGMENT-DURATION:PT2S\n";
    $block .= "#EXT-X-APE-DASH-CHANNEL-TIMESCALE:90000\n";
    $block .= "#EXT-X-APE-DASH-CHANNEL-MODE:{$mode}\n";
    $block .= "#EXT-X-APE-DASH-FALLBACK-FORMAT:HLS\n";
    $block .= "#EXT-X-APE-DASH-FALLBACK-URL:" . APE_RESOLVER_URL . "?cid={$cid}&format=hls\n";
  }

  $fmt_tag = strtoupper($target_format);
  $codec_tag = ($target_format === 'dash') ? $p['codec_v'] : 'HEVC';
  $ch_name = $channel['name'] ?? "Channel {$cid}";
  $ch_logo = $channel['logo'] ?? "";
  $ch_group = $channel['group'] ?? "General";

  $block .= "#EXTINF:-1 tvg-id=\"{$cid}\" tvg-name=\"{$ch_name}\" tvg-logo=\"{$ch_logo}\" group-title=\"{$ch_group}\" ape-profile=\"{$profile_key}\" ape-format=\"{$fmt_tag}\" ape-codec=\"{$codec_tag}\",{$ch_name}\n";
  $block .= "#EXTATTRFROMURL:{$extattrfromurl}\n";
  $block .= "#EXTVLCOPT:http-user-agent={$ua}\n";
  $block .= "#EXTVLCOPT:http-referrer={$origin}/\n";
  $block .= "{$ignition_url}\n";

  return $block;
}

// ─── FUNCIÓN: Generar manifiesto DASH (MPD God-Tier) ─────────────────────────
function generate_dash_mpd(array $channel, string $cid): string
{
  $now_iso    = gmdate('Y-m-d\TH:i:s') . 'Z';
  $base_url   = $channel['url'] ?? 'https://iptv-ape.duckdns.org/segments/';
  $lang       = $channel['lang'] ?? 'es';
  $name       = htmlspecialchars($channel['name'] ?? $cid);

  // Leer plantilla MPD si existe
  if (file_exists(MPD_TEMPLATE_PATH)) {
    $mpd = file_get_contents(MPD_TEMPLATE_PATH);
    $mpd = str_replace('{{AVAILABILITY_START_TIME}}', $now_iso, $mpd);
    $mpd = str_replace('{{BASE_URL}}',                $base_url,  $mpd);
    $mpd = str_replace('{{CHANNEL_ID}}',              $cid,       $mpd);
    $mpd = str_replace('{{CHANNEL_NAME}}',            $name,      $mpd);
    $mpd = str_replace('{{LANG}}',                    $lang,      $mpd);
    return $mpd;
  }

  // Fallback: MPD inline God-Tier
  return <<<MPD
<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="urn:mpeg:dash:schema:mpd:2011 DASH-MPD.xsd"
     profiles="urn:mpeg:dash:profile:isoff-live:2011"
     type="dynamic"
     availabilityStartTime="{$now_iso}"
     minimumUpdatePeriod="PT2S"
     minBufferTime="PT2S"
     suggestedPresentationDelay="PT4S"
     timeShiftBufferDepth="PT30S"
     maxSegmentDuration="PT2S">
  <ProgramInformation>
    <Title>{$name}</Title>
  </ProgramInformation>
  <BaseURL>{$base_url}/{$cid}/</BaseURL>
  <Period id="1" start="PT0S">
    <AdaptationSet id="1" contentType="video" mimeType="video/mp4" segmentAlignment="true" startWithSAP="1" lang="{$lang}">
      <Representation id="v4k" bandwidth="11600000" width="3840" height="2160" frameRate="60" codecs="hev1.2.4.L153.B0">
        <SegmentTemplate timescale="90000" media="video_4k_\$Number$.m4s" initialization="video_4k_init.mp4" startNumber="1">
          <SegmentTimeline><S t="0" d="180000" r="-1"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
      <Representation id="vfhd" bandwidth="5500000" width="1920" height="1080" frameRate="60" codecs="hev1.2.4.L150.B0">
        <SegmentTemplate timescale="90000" media="video_fhd_\$Number$.m4s" initialization="video_fhd_init.mp4" startNumber="1">
          <SegmentTimeline><S t="0" d="180000" r="-1"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
    <AdaptationSet id="2" contentType="audio" mimeType="audio/mp4" lang="{$lang}">
      <Representation id="a1" bandwidth="192000" audioSamplingRate="48000" codecs="mp4a.40.2">
        <SegmentTemplate timescale="44100" media="audio_\$Number$.m4s" initialization="audio_init.mp4" startNumber="1">
          <SegmentTimeline><S t="0" d="88200" r="-1"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>
MPD;
}

// ─── FUNCIÓN: Generar lista HLS completa (todos los canales) ─────────────────
function generate_full_hls_list(array $channels_map, string $target_format = 'hls'): string
{
  global $UA_POOL, $APE_PROFILES;

  $list_id = substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 9);
  $output  = generate_ape_global_header($channels_map, $list_id);

  foreach ($channels_map as $cid => $channel) {
    // Seleccionar perfil según el canal
    $profile_key = $channel['profile'] ?? 'P3';
    if (!isset($APE_PROFILES[$profile_key])) $profile_key = 'P3';

    // Rotar User Agent
    $ua = $UA_POOL[array_rand($UA_POOL)];

    $output .= generate_hls_channel_block($channel, $cid, $ua, $profile_key, $target_format);
  }

  return $output;
}

// ─── FUNCIÓN: serve_hls_ignition() — HLS clásico (TS) ───────────────────────
// Sirve el fragmento de respuesta HLS estándar con EXTVLCOPT + EXTHTTP + URL
function serve_hls_ignition(array $cd): void
{
    $vlcopt  = $cd['vlcopt']  ?? [];
    $exthttp = $cd['exthttp'] ?? [];
    $finalUrl = $cd['finalUrl'] ?? ($cd['channel_orig']['url'] ?? '');

    header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Access-Control-Allow-Origin: *');

    echo "#EXTM3U\n";
    foreach ($vlcopt as $line) { echo $line . "\n"; }
    echo '#EXTHTTP:' . json_encode($exthttp, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    echo "#EXTINF:-1,\n";
    echo $finalUrl . "\n";
    exit;
}

// ─── FUNCIÓN: serve_god_tier_dash() — DASH/MPD ───────────────────────────────
// Sirve el fragmento de respuesta DASH con EXTVLCOPT + EXTHTTP + URL MPD
function serve_god_tier_dash(array $cd): void
{
    $vlcopt  = $cd['vlcopt']  ?? [];
    $exthttp = $cd['exthttp'] ?? [];
    $finalUrl = $cd['finalUrl'] ?? ($cd['channel_orig']['url'] ?? '');

    header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Access-Control-Allow-Origin: *');

    echo "#EXTM3U\n";
    foreach ($vlcopt as $line) { echo $line . "\n"; }
    echo '#EXTHTTP:' . json_encode($exthttp, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    echo "#EXTINF:-1,\n";
    echo $finalUrl . "\n";
    exit;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ PASO 1 — APE v18.2: serve_hls_fmp4_ignition()
// Sirve un manifiesto HLS v7 con segmentos fMP4 (CMAF/HLS unificado)
// Compatible con: OTT Navigator, TiviMate, ExoPlayer, Apple HLS (iOS 10+)
// Requisito: cmaf_worker.php debe haber generado segmentos en /dev/shm/ape_cmaf_cache/{ch}/
// ═══════════════════════════════════════════════════════════════════════════════
function serve_hls_fmp4_ignition(array $cd): void
{
    $cfg      = $cd['cfg']      ?? [];
    $ch       = $cd['ch']       ?? '0';
    $exthttp  = $cd['exthttp']  ?? [];
    $vlcopt   = $cd['vlcopt']   ?? [];

    // Ruta RAM-disk donde el worker deposita los segmentos fMP4
    $cmafDir  = '/dev/shm/ape_cmaf_cache/' . $ch;
    $initSeg  = $cmafDir . '/init-stream0.m4s';

    // URL base del proxy de segmentos
    $protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
    $baseUrl  = $protocol . '://' . $_SERVER['HTTP_HOST']
              . dirname($_SERVER['SCRIPT_NAME'])
              . '/cmaf_proxy.php';

    // ── Esperar hasta 3 segundos a que el worker produzca el init segment ──
    $ready = false;
    for ($i = 0; $i < 6; $i++) {
        if (file_exists($initSeg) && filesize($initSeg) > 0) {
            $ready = true;
            break;
        }
        usleep(500000); // 500ms × 6 = 3s máximo
    }

    // ── Fallback CMAF-safe si el worker no arrancó en 3s ──
    // Sirve el .m3u8 del proveedor envuelto en HLS v7 con declaración CMAF
    if (!$ready) {
        guardianLog([
            'event'   => 'cmaf_fallback_provider_m3u8',
            'channel' => $ch,
            'reason'  => 'init_segment_not_ready_after_3s_using_provider_m3u8'
        ]);
        serve_cmaf_m3u8_fallback($cd);
        return;
    }

    // ── Obtener segmentos disponibles (ventana deslizante de 5) ──
    $chunks   = glob($cmafDir . '/chunk-stream0-*.m4s') ?: [];
    sort($chunks);
    $segCount = count($chunks);
    $window   = array_slice($chunks, -5); // últimos 5 segmentos
    $targetDur = 2;
    $mediaSeq  = max(0, $segCount - 5);

    // ── Servir manifiesto HLS v7 con fMP4 ──
    header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Access-Control-Allow-Origin: *');

    // Emitir directivas EXTVLCOPT heredadas del canal (sin tocar arrays ni buffer)
    foreach ($vlcopt as $line) {
        echo $line . "\n";
    }
    // Emitir EXTHTTP heredado del canal
    echo '#EXTHTTP:' . json_encode($exthttp, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";

    // Manifiesto HLS v7 — RFC 8216 §4.3.2.5 (EXT-X-MAP requiere VERSION >= 7)
    echo "#EXTM3U\n";
    echo "#EXT-X-VERSION:7\n";
    echo "#EXT-X-TARGETDURATION:{$targetDur}\n";
    echo "#EXT-X-MEDIA-SEQUENCE:{$mediaSeq}\n";
    echo "#EXT-X-INDEPENDENT-SEGMENTS\n";
    // Segmento de inicialización fMP4 (contiene el átomo moov)
    echo "#EXT-X-MAP:URI=\"{$baseUrl}?sid={$ch}&seg=init-stream0.m4s\"\n";

    // Segmentos de media fMP4 (ventana deslizante)
    foreach ($window as $chunk) {
        $segName = basename($chunk);
        echo "#EXTINF:{$targetDur}.000,\n";
        echo "{$baseUrl}?sid={$ch}&seg={$segName}\n";
    }

    guardianLog([
        'event'    => 'serve_hls_fmp4',
        'channel'  => $ch,
        'segments' => $segCount,
        'window'   => count($window),
        'status'   => 'success'
    ]);

    exit;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ APE v18.3: serve_cmaf_m3u8_fallback()
// Fallback CMAF-safe: cuando el worker fMP4 no tiene segmentos listos,
// sirve el .m3u8 directo del proveedor (Xtream Codes) envuelto en un
// manifiesto HLS v7 con declaración CMAF completa.
//
// El reproductor recibe:
//   - Content-Type: application/vnd.apple.mpegurl
//   - #EXT-X-VERSION:7
//   - #EXT-X-MAP:URI="..." (apunta al .m3u8 del proveedor como init hint)
//   - #KODIPROP:inputstream.adaptive.manifest_type=hls
//   - URL final: .m3u8 del proveedor (reproducción directa garantizada)
//
// Compatible con: OTT Navigator, TiviMate, ExoPlayer, VLC, Kodi
// ═══════════════════════════════════════════════════════════════════════════════
function serve_cmaf_m3u8_fallback(array $cd): void
{
    $cfg       = $cd['cfg']       ?? [];
    $ch        = $cd['ch']        ?? '0';
    $exthttp   = $cd['exthttp']   ?? [];
    $vlcopt    = $cd['vlcopt']    ?? [];
    $finalUrl  = $cd['finalUrl']  ?? '';   // URL .m3u8 del proveedor
    $labelFinal = $cd['labelFinal'] ?? ('Canal ' . $ch);

    // ── Construir URL .m3u8 del proveedor si no viene en $finalUrl ──
    // $finalUrl ya contiene la URL correcta del proveedor (baseUrlM3U8)
    // construida en resolve_quality.php antes de llamar a esta función.
    $providerM3u8 = $finalUrl;

    // ── Verificar que el .m3u8 del proveedor responde ──
    $probeOk = false;
    $probeCh = curl_init($providerM3u8);
    curl_setopt_array($probeCh, [
        CURLOPT_NOBODY         => true,
        CURLOPT_TIMEOUT        => 3,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 APE-8K_ULTRA_EXTREME_MASTER',
    ]);
    curl_exec($probeCh);
    $probeCode = (int)curl_getinfo($probeCh, CURLINFO_HTTP_CODE);
    curl_close($probeCh);

    if ($probeCode >= 200 && $probeCode < 400) {
        $probeOk = true;
    }

    // ── Si el .m3u8 del proveedor no responde, log y salir con 503 ──
    if (!$probeOk) {
        if (function_exists('guardianLog')) {
            guardianLog([
                'event'      => 'cmaf_fallback_provider_dead',
                'channel'    => $ch,
                'url'        => $providerM3u8,
                'http_code'  => $probeCode,
                'reason'     => 'provider_m3u8_unreachable'
            ]);
        }
        http_response_code(503);
        header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
        echo "#EXTM3U\n";
        echo "#EXT-X-VERSION:7\n";
        echo "# APE CMAF FALLBACK: provider unreachable (HTTP {$probeCode})\n";
        echo "#EXT-X-ENDLIST\n";
        exit;
    }

    // ── Log del fallback exitoso ──
    if (function_exists('guardianLog')) {
        guardianLog([
            'event'     => 'cmaf_fallback_m3u8_direct',
            'channel'   => $ch,
            'url'       => $providerM3u8,
            'http_code' => $probeCode,
            'reason'    => 'cmaf_worker_not_ready_using_provider_m3u8'
        ]);
    }

    // ── Emitir headers HTTP ──
    header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Access-Control-Allow-Origin: *');

    // ── Emitir directivas EXTVLCOPT heredadas (sin tocar arrays ni buffer) ──
    foreach ($vlcopt as $line) {
        echo $line . "\n";
    }

    // ── Emitir EXTHTTP heredado del canal ──
    if (!empty($exthttp)) {
        echo '#EXTHTTP:' . json_encode($exthttp, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    }

    // ── KODIPROP: declarar manifest_type=hls para CMAF ──
    echo "#KODIPROP:inputstream.adaptive.manifest_type=hls\n";
    echo "#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive\n";
    echo "#KODIPROP:inputstream.adaptive.max_bandwidth=" . ($cfg['max_bw'] ?? 15150000) . "\n";

    // ── Manifiesto HLS v7 con declaración CMAF ──
    echo "#EXTM3U\n";
    echo "#EXT-X-VERSION:7\n";
    echo "#EXT-X-TARGETDURATION:2\n";
    echo "#EXT-X-MEDIA-SEQUENCE:0\n";
    echo "#EXT-X-INDEPENDENT-SEGMENTS\n";

    // EXT-X-MAP apunta al .m3u8 del proveedor como hint de inicialización.
    // Los reproductores modernos (OTT Navigator, TiviMate, ExoPlayer) usan
    // este URI para negociar el codec antes de solicitar segmentos.
    echo "#EXT-X-MAP:URI=\"{$providerM3u8}\"\n";

    // EXT-X-STREAM-INF con los parámetros de calidad del perfil
    $bw         = $cfg['max_bw']   ?? 15150000;
    $avgBw      = $cfg['bitrate']  ?? 10100;
    $avgBwBps   = $avgBw * 1000;
    $resolution = $cfg['res']      ?? '1920x1080';
    $fps        = $cfg['fps']      ?? 60;
    $codecs     = ($cfg['codec_primary'] === 'HEVC' || $cfg['codec_primary'] === 'hevc')
                    ? 'hev1.2.4.L153.B0,mp4a.40.2'
                    : 'avc1.640028,mp4a.40.2';

    echo "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$avgBwBps},"
       . "RESOLUTION={$resolution},FRAME-RATE={$fps},CODECS=\"{$codecs}\"\n";

    // ── URL final: .m3u8 directo del proveedor ──
    echo $providerM3u8 . "\n";

    exit;
}
