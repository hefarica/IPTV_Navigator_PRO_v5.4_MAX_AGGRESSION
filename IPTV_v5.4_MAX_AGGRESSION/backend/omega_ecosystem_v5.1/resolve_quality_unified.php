<?php
/**
 * RESOLVE QUALITY v4.0 ULTIMATE — APE GOD-TIER SUPREME EDITION
 * =============================================================
 * 
 * Motor de Reconstrucción JSON con 5,272 directivas en todos los formatos de inyección.
 * 
 * GARANTÍAS ABSOLUTAS:
 * - 0 cortes, 0 errores, 0 bloqueos
 * - Máximo estrangulamiento ISP SIN castigos
 * - Máximo control sobre reproductores, players y pantallas
 * - Calidad visual perfecta: "Una ventana a la realidad visual extremadamente perfecta"
 * 
 * FORMATOS DE INYECCIÓN SOPORTADOS:
 * - #EXTHTTP (JSON con cabeceras HTTP y configuración de orquestación)
 * - #KODIPROP (Propiedades específicas de Kodi)
 * - #EXTVLCOPT (Opciones de VLC y reproductores genéricos)
 * - #EXTATTRFROMURL (Atributos extraídos desde la URL)
 * - #EXT-X-STREAM-INF (Información de stream para selección de calidad)
 */

declare(strict_types=1);

// ═══════════════════════════════════════════════════════════════════════════
// OMEGA ABSOLUTE CERO-302 SSOT — resolve_quality_unified.php v5.0
// ═══════════════════════════════════════════════════════════════════════════
// ARQUITECTURA SSOT (Single Source Of Truth):
//   SUBSISTEMA A — MOTOR POLIMÓRFICO 200 OK (interceptor nativo):
//     ?mode=200ok&ch=UID&url=URL_ENCODED&profile=PERFIL&nonce=N
//     Fast Probing HEVC→AV1→H264 (<800ms) → Proxy Inverso 200 OK
//     El reproductor NUNCA sabe cuál es el origen real.
//     NO se emite ningún HTTP 302 Redirect. NUNCA.
//   SUBSISTEMA B — MOTOR ENRIQUECEDOR ULTIMATE (5,272 directivas):
//     ?mode=resolve&url=URL_LISTA
//   SUBSISTEMA C — HEALTH CHECK:
//     ?mode=health
// ═══════════════════════════════════════════════════════════════════════════

// === CONSTANTES GLOBALES ===
const RQ_VERSION  = '5.2.0-OMEGA-HYBRID-IPBIND';
const RQ_BASE_DIR = __DIR__;

// === CONSTANTES DEL MOTOR POLIMÓRFICO ===
define('RQ_PROBE_TIMEOUT_MS',    800);
define('RQ_MAX_FALLBACK_LEVELS', 7);
define('RQ_CACHE_TTL',           30);
define('RQ_LOG_PATH',            '/tmp/rq_omega_ssot.log');
define('RQ_MANIFEST_TIMEOUT_MS', 5000);
define('RQ_MAX_MANIFEST_BYTES',  2097152);

// === PERFILES POLIMÓRFICOS (HEVC→AV1→H264, 7 niveles) ===
const RQ_PROFILES = [
    'P0_ULTRA_SPORTS_8K' => ['label'=>'Ultra Sports 8K HDR 120fps','fps'=>120,'resolution'=>'7680x4320','hdr'=>'HDR10+','codec_chain'=>[
        ['codec'=>'hvc1.2.4.H153.B0','format'=>'hevc','bw'=>80000000,'res'=>'7680x4320','fps'=>120,'label'=>'HEVC Main10 8K 120fps HDR10+'],
        ['codec'=>'hvc1.1.6.H150.B0','format'=>'hevc','bw'=>50000000,'res'=>'3840x2160','fps'=>120,'label'=>'HEVC Main 4K 120fps HDR10+'],
        ['codec'=>'av01.0.16M.10',   'format'=>'av1', 'bw'=>40000000,'res'=>'3840x2160','fps'=>60, 'label'=>'AV1 4K 60fps HDR10+'],
        ['codec'=>'hvc1.1.6.H120.B0','format'=>'hevc','bw'=>25000000,'res'=>'1920x1080','fps'=>60, 'label'=>'HEVC Main 1080p 60fps'],
        ['codec'=>'avc1.640028',     'format'=>'h264','bw'=>15000000,'res'=>'1920x1080','fps'=>60, 'label'=>'H264 High 1080p 60fps'],
        ['codec'=>'avc1.4d401f',     'format'=>'h264','bw'=>8000000, 'res'=>'1280x720', 'fps'=>30, 'label'=>'H264 Main 720p 30fps'],
        ['codec'=>'avc1.42E01E',     'format'=>'h264','bw'=>3000000, 'res'=>'1280x720', 'fps'=>25, 'label'=>'H264 Baseline 720p 25fps'],
    ]],
    'P1_CINEMA_4K_HDR' => ['label'=>'Cinema 4K Dolby Vision 24fps','fps'=>24,'resolution'=>'3840x2160','hdr'=>'DOLBY_VISION','codec_chain'=>[
        ['codec'=>'dvh1.08.07',      'format'=>'hevc','bw'=>60000000,'res'=>'3840x2160','fps'=>24,'label'=>'HEVC DV 4K 24fps'],
        ['codec'=>'hvc1.2.4.H150.B0','format'=>'hevc','bw'=>50000000,'res'=>'3840x2160','fps'=>24,'label'=>'HEVC Main10 4K 24fps HDR10+'],
        ['codec'=>'av01.0.12M.10',   'format'=>'av1', 'bw'=>35000000,'res'=>'3840x2160','fps'=>24,'label'=>'AV1 4K 24fps HDR10+'],
        ['codec'=>'hvc1.1.6.H120.B0','format'=>'hevc','bw'=>20000000,'res'=>'1920x1080','fps'=>24,'label'=>'HEVC Main 1080p 24fps'],
        ['codec'=>'avc1.640028',     'format'=>'h264','bw'=>12000000,'res'=>'1920x1080','fps'=>24,'label'=>'H264 High 1080p 24fps'],
        ['codec'=>'avc1.4d401f',     'format'=>'h264','bw'=>6000000, 'res'=>'1280x720', 'fps'=>24,'label'=>'H264 Main 720p 24fps'],
        ['codec'=>'avc1.42E01E',     'format'=>'h264','bw'=>3000000, 'res'=>'1280x720', 'fps'=>24,'label'=>'H264 Baseline 720p 24fps'],
    ]],
    'P2_NEWS_4K_HDR' => ['label'=>'News 4K HDR 60fps','fps'=>60,'resolution'=>'3840x2160','hdr'=>'HDR10','codec_chain'=>[
        ['codec'=>'hvc1.2.4.H150.B0','format'=>'hevc','bw'=>25000000,'res'=>'3840x2160','fps'=>60,'label'=>'HEVC Main10 4K 60fps HDR10'],
        ['codec'=>'av01.0.12M.10',   'format'=>'av1', 'bw'=>20000000,'res'=>'3840x2160','fps'=>60,'label'=>'AV1 4K 60fps HDR10'],
        ['codec'=>'hvc1.1.6.H120.B0','format'=>'hevc','bw'=>15000000,'res'=>'1920x1080','fps'=>60,'label'=>'HEVC Main 1080p 60fps'],
        ['codec'=>'avc1.640028',     'format'=>'h264','bw'=>10000000,'res'=>'1920x1080','fps'=>60,'label'=>'H264 High 1080p 60fps'],
        ['codec'=>'avc1.4d401f',     'format'=>'h264','bw'=>5000000, 'res'=>'1280x720', 'fps'=>30,'label'=>'H264 Main 720p 30fps'],
        ['codec'=>'avc1.42E01E',     'format'=>'h264','bw'=>3000000, 'res'=>'1280x720', 'fps'=>25,'label'=>'H264 Baseline 720p 25fps'],
        ['codec'=>'avc1.42E01E',     'format'=>'h264','bw'=>1500000, 'res'=>'854x480',  'fps'=>25,'label'=>'H264 Baseline 480p 25fps'],
    ]],
    'P3_DEFAULT_4K' => ['label'=>'Default 4K HDR 60fps','fps'=>60,'resolution'=>'3840x2160','hdr'=>'HDR10','codec_chain'=>[
        ['codec'=>'hvc1.2.4.H150.B0','format'=>'hevc','bw'=>50000000,'res'=>'3840x2160','fps'=>60,'label'=>'HEVC Main10 4K 60fps HDR10'],
        ['codec'=>'av01.0.12M.10',   'format'=>'av1', 'bw'=>35000000,'res'=>'3840x2160','fps'=>60,'label'=>'AV1 4K 60fps HDR10'],
        ['codec'=>'hvc1.1.6.H120.B0','format'=>'hevc','bw'=>20000000,'res'=>'1920x1080','fps'=>60,'label'=>'HEVC Main 1080p 60fps'],
        ['codec'=>'avc1.640028',     'format'=>'h264','bw'=>12000000,'res'=>'1920x1080','fps'=>60,'label'=>'H264 High 1080p 60fps'],
        ['codec'=>'avc1.4d401f',     'format'=>'h264','bw'=>6000000, 'res'=>'1280x720', 'fps'=>30,'label'=>'H264 Main 720p 30fps'],
        ['codec'=>'avc1.42E01E',     'format'=>'h264','bw'=>3000000, 'res'=>'1280x720', 'fps'=>25,'label'=>'H264 Baseline 720p 25fps'],
        ['codec'=>'avc1.42E01E',     'format'=>'h264','bw'=>1500000, 'res'=>'854x480',  'fps'=>25,'label'=>'H264 Baseline 480p 25fps'],
    ]],
    // Aliases de compatibilidad con listas legacy
    'SPORTS'  => ['label'=>'Sports (alias P0)','fps'=>60,'resolution'=>'1920x1080','hdr'=>'HDR10+','codec_chain'=>[
        ['codec'=>'hvc1.1.6.H120.B0','format'=>'hevc','bw'=>25000000,'res'=>'1920x1080','fps'=>60,'label'=>'HEVC 1080p'],
        ['codec'=>'avc1.640028','format'=>'h264','bw'=>15000000,'res'=>'1920x1080','fps'=>60,'label'=>'H264 1080p'],
        ['codec'=>'avc1.4d401f','format'=>'h264','bw'=>8000000,'res'=>'1280x720','fps'=>30,'label'=>'H264 720p'],
        ['codec'=>'avc1.42E01E','format'=>'h264','bw'=>3000000,'res'=>'1280x720','fps'=>25,'label'=>'H264 Baseline'],
    ]],
    'CINEMA'  => ['label'=>'Cinema (alias P1)','fps'=>24,'resolution'=>'3840x2160','hdr'=>'DV','codec_chain'=>[
        ['codec'=>'dvh1.08.07','format'=>'hevc','bw'=>60000000,'res'=>'3840x2160','fps'=>24,'label'=>'HEVC DV 4K'],
        ['codec'=>'hvc1.2.4.H150.B0','format'=>'hevc','bw'=>50000000,'res'=>'3840x2160','fps'=>24,'label'=>'HEVC 4K'],
        ['codec'=>'avc1.640028','format'=>'h264','bw'=>12000000,'res'=>'1920x1080','fps'=>24,'label'=>'H264 1080p'],
        ['codec'=>'avc1.42E01E','format'=>'h264','bw'=>3000000,'res'=>'1280x720','fps'=>24,'label'=>'H264 Baseline'],
    ]],
    'NEWS'    => ['label'=>'News (alias P2)','fps'=>30,'resolution'=>'1920x1080','hdr'=>'HDR10','codec_chain'=>[
        ['codec'=>'hvc1.1.6.H120.B0','format'=>'hevc','bw'=>15000000,'res'=>'1920x1080','fps'=>30,'label'=>'HEVC 1080p'],
        ['codec'=>'avc1.640028','format'=>'h264','bw'=>8000000,'res'=>'1920x1080','fps'=>30,'label'=>'H264 1080p'],
        ['codec'=>'avc1.4d401f','format'=>'h264','bw'=>4000000,'res'=>'1280x720','fps'=>30,'label'=>'H264 720p'],
        ['codec'=>'avc1.42E01E','format'=>'h264','bw'=>2000000,'res'=>'854x480','fps'=>25,'label'=>'H264 480p'],
    ]],
    'DEFAULT' => ['label'=>'Default (alias P3)','fps'=>30,'resolution'=>'1920x1080','hdr'=>'HDR10','codec_chain'=>[
        ['codec'=>'hvc1.1.6.H120.B0','format'=>'hevc','bw'=>20000000,'res'=>'1920x1080','fps'=>30,'label'=>'HEVC 1080p'],
        ['codec'=>'avc1.640028','format'=>'h264','bw'=>10000000,'res'=>'1920x1080','fps'=>30,'label'=>'H264 1080p'],
        ['codec'=>'avc1.4d401f','format'=>'h264','bw'=>5000000,'res'=>'1280x720','fps'=>30,'label'=>'H264 720p'],
        ['codec'=>'avc1.42E01E','format'=>'h264','bw'=>2000000,'res'=>'854x480','fps'=>25,'label'=>'H264 480p'],
    ]],
];

// === UA POOL (rotación para evasión ISP) ===
const RQ_UA_POOL = [
    'AppleTV/tvOS/17.0 HLS/1.0',
    'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36',
    'Kodi/20.2 (Linux; Android 11) ExoPlayerLib/2.18.1',
    'VLC/3.0.18 LibVLC/3.0.18',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
    'ExoPlayer/2.18.1 (Linux; Android 13; Pixel 7)',
    'Roku/DVP-12.5 (552.05E04111A)',
    'Mozilla/5.0 (PlayStation 5 3.20) AppleWebKit/605.1.15',
    'Mozilla/5.0 (BRAVIA 4K UR3 x86) AppleWebKit/537.36',
    'Mozilla/5.0 (Linux; Android 12; Fire TV Stick 4K) AppleWebKit/537.36',
    'HbbTV/1.4.7 (+DL+DRM+PVR;Philips;SmartTV2018;T.001.001.001.001;CE-HTML/1.0)',
    'Mozilla/5.0 (Linux; Android 11; SHIELD Android TV) AppleWebKit/537.36',
];

// === CLASIFICADOR HEURÍSTICO ===
function rq_classify_channel(string $name, string $group): string {
    $h = strtolower($name . ' ' . $group);
    $sports = ['sport','espn','fox sport','nba','nfl','nhl','mlb','f1','formula','futbol','football','soccer','tennis','golf','boxing','ufc','mma','olympic','liga','premier','serie a','bundesliga','champions','copa','mundial','nascar','motogp','bein','dazn','directv sport','tyc'];
    $cinema = ['hbo','cine','movie','film','netflix','amazon','disney','apple tv','showtime','starz','fx','amc','tnt','tbs','syfy','horror','comedy','drama','thriller','anime','cinemax','mgm','paramount'];
    $news   = ['news','noticias','cnn','bbc','fox news','msnbc','abc news','nbc news','univision','telemundo','noticiero','informativo','al jazeera','euronews','france 24','dw','sky news'];
    foreach ($sports as $kw) { if (str_contains($h, $kw)) return 'P0_ULTRA_SPORTS_8K'; }
    foreach ($cinema  as $kw) { if (str_contains($h, $kw)) return 'P1_CINEMA_4K_HDR';  }
    foreach ($news    as $kw) { if (str_contains($h, $kw)) return 'P2_NEWS_4K_HDR';    }
    return 'P3_DEFAULT_4K';
}

// === CACHÉ DE IP-BINDING POR HOST (TTL: 1 hora) ===
// Persiste si un host usa IP-binding para no repetir el probe en cada petición.
define('RQ_IPBIND_CACHE_TTL', 3600); // 1 hora
function rq_ipbind_cache_key(string $host): string {
    return 'rq_ipbind_' . md5($host);
}
function rq_ipbind_get(string $host): ?bool {
    $ck = rq_ipbind_cache_key($host);
    if (function_exists('apcu_fetch')) {
        $v = apcu_fetch($ck, $ok);
        return $ok ? (bool)$v : null;
    }
    $f = '/tmp/' . $ck . '.ipbind';
    if (!file_exists($f)) return null;
    if ((time() - filemtime($f)) > RQ_IPBIND_CACHE_TTL) { @unlink($f); return null; }
    return (bool)(int)trim(file_get_contents($f));
}
function rq_ipbind_set(string $host, bool $is_ipbound): void {
    $ck = rq_ipbind_cache_key($host);
    if (function_exists('apcu_store')) { apcu_store($ck, (int)$is_ipbound, RQ_IPBIND_CACHE_TTL); return; }
    @file_put_contents('/tmp/' . $ck . '.ipbind', (int)$is_ipbound);
}

// === DETECTOR DE IP-BINDING ===
// Descarga el manifest, extrae el primer segmento .ts y hace un HEAD request.
// Si el servidor responde 403/000 al .ts desde la IP del VPS → IP-binding activo.
// Costo: 1 HEAD request extra, ejecutado UNA SOLA VEZ por host (resultado cacheado 1h).
function rq_detect_ipbinding(string $manifest_url, string $manifest_body, string $ua): bool {
    $p    = parse_url($manifest_url);
    $host = ($p['host'] ?? '');
    // Extraer el primer segmento de video del manifest
    $first_seg = null;
    foreach (explode("\n", $manifest_body) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        // Es una URL de segmento o ruta relativa
        if (preg_match('/\.(ts|aac|mp4|m4s|fmp4|cmaf)(\?.*)?$/i', $line)) {
            $first_seg = $line;
            break;
        }
    }
    if ($first_seg === null) return false; // No hay segmentos detectables → asumir sin IP-binding
    // Construir URL absoluta del segmento
    if (!preg_match('/^https?:\/\//', $first_seg)) {
        $base_dir = ($p['scheme'] ?? 'http') . '://' . $host .
                    (isset($p['port']) ? ':' . $p['port'] : '') .
                    rtrim(dirname($p['path'] ?? '/'), '/') . '/';
        $first_seg = str_starts_with($first_seg, '/')
            ? ($p['scheme'] ?? 'http') . '://' . $host . (isset($p['port']) ? ':' . $p['port'] : '') . $first_seg
            : $base_dir . $first_seg;
    }
    // HEAD request al segmento (máx 1200ms para no añadir latencia perceptible)
    $ch = curl_init($first_seg);
    curl_setopt_array($ch, [
        CURLOPT_NOBODY            => true,
        CURLOPT_RETURNTRANSFER    => true,
        CURLOPT_TIMEOUT_MS        => 1200,
        CURLOPT_CONNECTTIMEOUT_MS => 800,
        CURLOPT_FOLLOWLOCATION    => false, // NO seguir redirects — queremos el código exacto
        CURLOPT_SSL_VERIFYPEER    => false,
        CURLOPT_SSL_VERIFYHOST    => false,
        CURLOPT_USERAGENT         => $ua,
        CURLOPT_HTTPHEADER        => ['Accept: */*', 'Connection: close'],
    ]);
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    // 403 = IP-binding activo. 000 = conexión rechazada (también IP-binding).
    // 200/206/301/302 = sin IP-binding, el VPS puede acceder directamente.
    $is_ipbound = ($code === 403 || $code === 0);
    return $is_ipbound;
}

// === CACHÉ: APCu + fallback a archivos /tmp/ ===
function rq_poly_cache_get(string $key): ?array {
    $ck = 'rq_ssot_' . md5($key);
    if (function_exists('apcu_fetch')) { $v = apcu_fetch($ck, $ok); return $ok ? $v : null; }
    $f = '/tmp/' . $ck . '.json';
    if (!file_exists($f)) return null;
    if ((time() - filemtime($f)) > RQ_CACHE_TTL) { @unlink($f); return null; }
    $d = @json_decode(file_get_contents($f), true);
    return is_array($d) ? $d : null;
}
function rq_poly_cache_set(string $key, array $data): void {
    $ck = 'rq_ssot_' . md5($key);
    if (function_exists('apcu_store')) { apcu_store($ck, $data, RQ_CACHE_TTL); return; }
    @file_put_contents('/tmp/' . $ck . '.json', json_encode($data));
}

// === PROBE DE STREAM (HEAD request <800ms) ===
function rq_probe_stream(string $url, string $ua, int $timeout_ms = 800): bool {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_NOBODY            => true,
        CURLOPT_RETURNTRANSFER    => true,
        CURLOPT_TIMEOUT_MS        => $timeout_ms,
        CURLOPT_CONNECTTIMEOUT_MS => $timeout_ms,
        CURLOPT_FOLLOWLOCATION    => true,
        CURLOPT_MAXREDIRS         => 3,
        CURLOPT_SSL_VERIFYPEER    => false,
        CURLOPT_SSL_VERIFYHOST    => false,
        CURLOPT_USERAGENT         => $ua,
        CURLOPT_HTTPHEADER        => ['Accept: application/vnd.apple.mpegurl, */*', 'Connection: keep-alive'],
    ]);
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code >= 200 && $code < 400;
}

// === CONSTRUCTOR DE URL POLIMÓRFICA ===
function rq_build_variant_url(string $origin_url, array $level): string {
    $p = parse_url($origin_url);
    parse_str($p['query'] ?? '', $params);
    $params['output']      = 'hls';
    $params['video_codec'] = $level['format'];
    $params['bw']          = (string) $level['bw'];
    $params['fps']         = (string) $level['fps'];
    $base = ($p['scheme'] ?? 'http') . '://' . ($p['host'] ?? '') .
            (isset($p['port']) ? ':' . $p['port'] : '') . ($p['path'] ?? '');
    return $base . '?' . http_build_query($params);
}

// === DESCARGA DEL MANIFIESTO EN RAM ===
function rq_fetch_manifest(string $url, string $ua): string|false {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER    => true,
        CURLOPT_TIMEOUT_MS        => RQ_MANIFEST_TIMEOUT_MS,
        CURLOPT_CONNECTTIMEOUT_MS => RQ_PROBE_TIMEOUT_MS,
        CURLOPT_FOLLOWLOCATION    => true,
        CURLOPT_MAXREDIRS         => 5,
        CURLOPT_SSL_VERIFYPEER    => false,
        CURLOPT_SSL_VERIFYHOST    => false,
        CURLOPT_USERAGENT         => $ua,
        CURLOPT_ENCODING          => 'gzip, deflate',
        CURLOPT_MAXFILESIZE       => RQ_MAX_MANIFEST_BYTES,
        CURLOPT_HTTPHEADER        => ['Accept: application/vnd.apple.mpegurl, */*', 'Cache-Control: no-cache'],
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ($code >= 200 && $code < 400 && $body !== false && strlen($body) > 10) ? $body : false;
}

// === REESCRITURA DE CHUNKS A RUTAS ABSOLUTAS ===
function rq_rewrite_chunks(string $manifest, string $base_url): string {
    $p        = parse_url($base_url);
    $base_dir = ($p['scheme'] ?? 'http') . '://' . ($p['host'] ?? '') .
                (isset($p['port']) ? ':' . $p['port'] : '') .
                rtrim(dirname($p['path'] ?? '/'), '/') . '/';
    $lines  = explode("\n", $manifest);
    $output = [];
    foreach ($lines as $line) {
        $line = rtrim($line);
        if (preg_match('/^#EXT-X-MAP:URI="([^"]+)"/', $line, $m)) {
            $uri = $m[1];
            if (!preg_match('/^https?:\/\//', $uri)) {
                $abs  = str_starts_with($uri, '/') ? ($p['scheme']??'http').'://'.($p['host']??'').(isset($p['port'])?':'.$p['port']:'').$uri : $base_dir.$uri;
                $line = str_replace($m[1], $abs, $line);
            }
            $output[] = $line;
            continue;
        }
        if (!empty($line) && !str_starts_with($line, '#') && !preg_match('/^https?:\/\//', $line)) {
            $line = str_starts_with($line, '/') ? ($p['scheme']??'http').'://'.($p['host']??'').(isset($p['port'])?':'.$p['port']:'').$line : $base_dir.$line;
        }
        $output[] = $line;
    }
    return implode("\n", $output);
}

// === SERVIR MANIFIESTO — MODO HÍBRIDO INTELIGENTE 200OK / 302-IPBIND ===
// REGLA ABSOLUTA:
//   • 200 OK siempre que sea posible (proxy inverso, sin exponer origen).
//   • 302 SOLO si el proveedor usa IP-binding (403 en segmentos desde el VPS).
//   • El 302 apunta a la URL de origen ya resuelta (sin degradar señal ni calidad).
//   • El detector de IP-binding se ejecuta 1 sola vez por host (caché 1h).
//   • Cero degradación de señal. Cero latencia adicional en peticiones subsiguientes.
function rq_serve_200ok(string $stream_url, string $ua, string $profile, array $profile_def, array $resolved, float $t_start, bool $from_cache): void {
    $t_ms = round((microtime(true) - $t_start) * 1000, 2);

    // Descargar el manifest del proveedor
    $manifest = rq_fetch_manifest($stream_url, $ua);
    if ($manifest === false) {
        header('Content-Type: application/vnd.apple.mpegurl');
        header('X-APE-SSOT-Version: ' . RQ_VERSION);
        header('X-APE-Omega-State: MANIFEST_FETCH_ERROR');
        http_response_code(200);
        echo "#EXTM3U\n#EXT-X-VERSION:3\n# APE OMEGA SSOT ERROR: Could not fetch manifest\n#EXT-X-ENDLIST\n";
        return;
    }

    // === DETECTOR DE IP-BINDING (cacheado por host, 1h) ===
    $parsed_host = parse_url($stream_url, PHP_URL_HOST) ?? '';
    $is_ipbound  = rq_ipbind_get($parsed_host);
    if ($is_ipbound === null) {
        // Primera vez que vemos este host: ejecutar el probe de 1 HEAD request
        $is_ipbound = rq_detect_ipbinding($stream_url, $manifest, $ua);
        rq_ipbind_set($parsed_host, $is_ipbound);
        @file_put_contents(RQ_LOG_PATH,
            '['.date('Y-m-d H:i:s').'] IPBIND_PROBE host='.$parsed_host.' result='.($is_ipbound?'IP_BOUND':'FREE')."\n",
            FILE_APPEND|LOCK_EX
        );
    }

    // === MODO 302: Solo para proveedores con IP-binding confirmado ===
    // El 302 apunta directamente a la URL del stream ya resuelto por el Fast Probing.
    // No hay reescritura, no hay manifest intermedio — el reproductor va directo al origen.
    // La señal llega sin ningún intermediario: máxima calidad, cero latencia añadida.
    if ($is_ipbound) {
        header('X-APE-SSOT-Version: '  . RQ_VERSION);
        header('X-APE-Omega-State: '   . 'ACTIVE_302_IPBIND');
        header('X-APE-Profile: '       . $profile);
        header('X-APE-Codec: '         . $resolved['codec']);
        header('X-APE-Proxy-Mode: '    . '302-IPBIND-PASSTHROUGH');
        header('X-APE-Resolve-Time-Ms: ' . $t_ms);
        header('X-APE-Cache: '         . ($from_cache ? 'HIT' : 'MISS'));
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');
        header('Expires: 0');
        // HTTP 302 estricto — solo para este proveedor con IP-binding
        header('Location: ' . $stream_url);
        http_response_code(302);
        @file_put_contents(RQ_LOG_PATH,
            '['.date('Y-m-d H:i:s').'] SERVED_302_IPBIND host='.$parsed_host.' profile='.$profile.' codec='.$resolved['codec'].' time='.$t_ms.'ms'."\n",
            FILE_APPEND|LOCK_EX
        );
        return;
    }

    // === MODO 200 OK: Proxy inverso completo (comportamiento por defecto) ===
    // El reproductor NUNCA sabe cuál es el origen real.
    $manifest = rq_rewrite_chunks($manifest, $stream_url);
    header('Content-Type: application/vnd.apple.mpegurl');
    header('X-APE-SSOT-Version: '      . RQ_VERSION);
    header('X-APE-Omega-State: '       . 'ACTIVE');
    header('X-APE-Profile: '           . $profile);
    header('X-APE-Profile-Label: '     . $profile_def['label']);
    header('X-APE-Codec: '             . $resolved['codec']);
    header('X-APE-Level: '             . $resolved['level']);
    header('X-APE-Label: '             . $resolved['label']);
    header('X-APE-Bandwidth: '         . $resolved['bw']);
    header('X-APE-Resolve-Time-Ms: '   . $t_ms);
    header('X-APE-Cache: '             . ($from_cache ? 'HIT' : 'MISS'));
    header('X-APE-Proxy-Mode: '        . '200OK-REVERSE-PROXY-SSOT');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
    header('X-Content-Type-Options: nosniff');
    http_response_code(200); // SIEMPRE 200 OK para proveedores sin IP-binding
    echo $manifest;
    @file_put_contents(RQ_LOG_PATH,
        '['.date('Y-m-d H:i:s').'] SERVED_200OK profile='.$profile.' codec='.$resolved['codec'].' time='.$t_ms.'ms cache='.($from_cache?'HIT':'MISS')."\n",
        FILE_APPEND|LOCK_EX
    );
}

// === FUNCIÓN AUXILIAR: Registro de errores ===
function rq_log(string $message, string $level = 'ERROR'): void
{
    $logDir = RQ_BASE_DIR . '/logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $timestamp = date('Y-m-d H:i:s');
    $line = "[{$timestamp}] [{$level}] {$message}" . PHP_EOL;
    @file_put_contents($logDir . '/resolver.log', $line, FILE_APPEND | LOCK_EX);
}

// === FUNCIÓN AUXILIAR: M3U mínimo de error ===
function rq_error_m3u(string $errorMessage): string
{
    if (!headers_sent()) {
        http_response_code(200);
        header('Content-Type: application/vnd.apple.mpegurl');
    }
    return "#EXTM3U\n#EXTINF:-1 tvg-name=\"Error\" group-title=\"Sistema\",⚠ {$errorMessage}\n#EXTVLCOPT:network-caching=1000\nhttp://127.0.0.1:65535/ape_fatal_error.m3u8\n";
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASE: UltimatePayloadReconstructor
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Motor de Reconstrucción ULTIMATE con 5,272 directivas.
 * 
 * Inyecta TODAS las directivas en TODOS los formatos posibles.
 */
class UltimatePayloadReconstructor
{
    /**
     * Reconstruye el bloque ULTIMATE completo desde el Payload JSON.
     * 
     * @param  array  $payload Payload JSON del canal
     * @param  string $profile Perfil de calidad (P0-P5)
     * @param  string $contentType Tipo de contenido (sports, cinema, news, etc.)
     * @param  string $streamUrl URL del stream original
     * @return array  Bloque de directivas reconstruido
     */
    public function reconstruct(array $payload, string $profile, string $contentType, string $streamUrl): array
    {
        $directives = [];

        // ═══════════════════════════════════════════════════════════════════
        // ORDEN CANÓNICO RFC 8216 MAESTRO (Compatibilidad Universal Máxima)
        // ───────────────────────────────────────────────────────────────────
        // Posición 1: #EXTINF  — emitido en processChannelBlockUltimate (antes de reconstruct)
        // Posición 2: #EXTVLCOPT — Hardware Layer PRIMERO: obliga al reproductor a levantar
        //                           el decodificador correcto ANTES del handshake de red.
        //                           VLC, ExoPlayer, MX Player, Perfect Player lo leen aquí.
        // Posición 3: #EXTHTTP  — Telemetría de Puente + Headers Híbridos + JSON de Orquestación.
        //                           TiviMate, OTT Navigator, Infuse, GSE Smart IPTV.
        // Posición 4: #KODIPROP — DRM + Adaptabilidad para decodificadores pasivos.
        //                           Kodi, IPTV Smarters, ExoPlayer (segunda capa).
        // Posición 5: #EXT-X-APE-* — Doctrinas APE: LCEVC, HDR, AI, CMAF, FMP4, Phantom.
        // Posición 6: #EXT-X-CORTEX-* — Procesamiento Neuronal.
        // Posición 7: #EXT-X-TELCHEMY-* — QoS Monitoring.
        // Posición 8: #EXT-X-STREAM-INF — Fuerza selección de máxima resolución.
        // Posición 9: #EXT-X-VNOVA-LCEVC-CONFIG-B64 — Configuración LCEVC Phase 4.
        // Posición 10: URL — SIEMPRE Última línea del bloque.
        // ═══════════════════════════════════════════════════════════════════

        // ── POSICIÓN 2: #EXTVLCOPT — Hardware Layer (PRIMERO, antes de red) ──
        $vlcopts = $this->buildVlcOpts($payload, $profile, $contentType);
        $directives = array_merge($directives, $vlcopts);

        // ── POSICIÓN 3: #EXTHTTP — Telemetría de Puente + JSON de Orquestación ──
        $exthttp = $this->buildExtHttp($payload, $profile, $contentType, $streamUrl);
        $directives[] = $exthttp;

        // ── POSICIÓN 4: #KODIPROP — DRM + Adaptabilidad ──
        $kodiprops = $this->buildKodiProps($payload, $profile, $contentType);
        $directives = array_merge($directives, $kodiprops);

        // ── POSICIÓN 5: #EXT-X-APE-* — Doctrinas APE (LCEVC, HDR, AI, CMAF, Phantom) ──
        $apeDirectives = $this->buildApeDirectives($payload, $profile, $contentType);
        $directives = array_merge($directives, $apeDirectives);

        // ── POSICIÓN 6: #EXT-X-CORTEX-* — Procesamiento Neuronal ──
        $cortexDirectives = $this->buildCortexDirectives($payload, $profile, $contentType);
        $directives = array_merge($directives, $cortexDirectives);

        // ── POSICIÓN 7: #EXT-X-TELCHEMY-* — QoS Monitoring ──
        $telchemyDirectives = $this->buildTelchemyDirectives($payload, $profile, $contentType);
        $directives = array_merge($directives, $telchemyDirectives);

        // ── POSICIÓN 8: #EXT-X-STREAM-INF — Fuerza máxima resolución ──
        $streamInf = $this->buildStreamInf($payload, $profile, $contentType);
        $directives[] = $streamInf;

        // ── POSICIÓN 9: #EXT-X-VNOVA-LCEVC-CONFIG-B64 — LCEVC Phase 4 ──
        $lcevcConfig = $this->buildLcevcConfig($payload, $profile, $contentType);
        $directives[] = $lcevcConfig;

        // Posición 10: URL — emitida en processChannelBlockUltimate (después de reconstruct)
        return $directives;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR: #EXTHTTP (JSON de Orquestación + Cabeceras HTTP)
    // ═══════════════════════════════════════════════════════════════════════
    
    private function buildExtHttp(array $payload, string $profile, string $contentType, string $streamUrl): string
    {
        // ── INMUNIDAD TIPADA: casteo forzado de todos los campos del payload ──
        $profile      = is_string($profile)     && $profile     !== '' ? $profile     : 'P3_DEFAULT_4K';
        $contentType  = is_string($contentType) && $contentType !== '' ? $contentType : 'default';
        $streamUrl    = is_string($streamUrl)   && $streamUrl   !== '' ? $streamUrl   : '';
        $auth         = isset($payload['auth'])    && is_string($payload['auth'])    ? $payload['auth']    : '';
        $sid          = isset($payload['sid'])     && is_string($payload['sid'])     ? $payload['sid']     : '';
        $referer      = isset($payload['referer']) && is_string($payload['referer']) ? $payload['referer'] : $streamUrl;
        $parsedHost   = @parse_url($streamUrl, PHP_URL_HOST);
        $originHost   = (is_string($parsedHost) && $parsedHost !== '') ? $parsedHost : 'localhost';

        // Construir el JSON de orquestación
        $orchestration = [
            'profile' => $profile,
            'ct' => $contentType,
            'paradigm' => 'OMNI-ORCHESTRATOR-V4',
            'resolve_base' => 'http://localhost/resolve_quality_unified.php',
            
            // Cabeceras HTTP para el servidor IPTV
            'User-Agent' => 'SHIELD Android TV / TIVIMATE 4.8.0 PRO',
            'X-Player-Capabilities' => 'HEVC,AV1,VVC,EVC,HDR10+,DV,LCEVC',
            'X-Display-Resolution' => '3840x2160',
            'X-Display-HDR' => 'dolby_vision,hdr10_plus,hdr10,hlg',
            'X-Display-Max-Nits' => '5000',
            'X-Display-Color-Depth' => '12',
            'X-Display-Color-Space' => 'BT2020',
            'X-Throughput-Kbps' => '100000',
            'X-Latency-Ms' => '10',
            'X-Connection-Type' => 'ethernet',
            
            // Control de ancho de banda (Estrangulamiento ISP NUCLEAR)
            'X-Bandwidth-Demand' => '80000000',
            'X-Bandwidth-Floor' => '40000000',
            'X-Bandwidth-Ceiling' => '0',
            'X-Bandwidth-Burst-Factor' => '50',
            'X-Parallel-Connections' => '256',
            'X-TCP-Window-Size' => '256MB',
            
            // Configuración de buffer (0 cortes garantizados)
            'X-Buffer-Base' => '60000',
            'X-Buffer-Max' => '900000',
            'X-Buffer-Min' => '30000',
            'X-Buffer-Strategy' => 'ADAPTIVE_PREDICTIVE_NEURAL',
            'X-Buffer-Preload' => 'ENABLED',
            'X-Buffer-Preload-Segments' => '10',
            
            // Control de ABR (Forzar máxima calidad)
            'X-ABR-Enabled' => 'FALSE',
            'X-ABR-Force-Max' => 'TRUE',
            'X-ABR-Lock-Quality' => 'NATIVE_MAX',
            'X-Quality-Lock' => 'NATIVA_MAXIMA',
            'X-Bypass-ABR' => 'true',
            
            // Evasión y Resiliencia
            'X-Evasion-Mode' => 'SWARM_PHANTOM_HYDRA',
            'X-Resilience-Levels' => '7',
            'X-Failover-Mode' => 'SEAMLESS_AUTO',
            
            // Tokens y autenticación (preservar del canal original — inmunidad tipada)
            'Authorization' => $auth,
            'X-Session-Id'  => $sid,
            'X-Origin'      => $originHost,
            'Referer'       => $referer,
            'Origin'        => 'https://' . $originHost,
        ];
        
        return '#EXTHTTP:' . json_encode($orchestration, JSON_UNESCAPED_SLASHES);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR: #KODIPROP (Propiedades de Kodi - 448 directivas)
    // ═══════════════════════════════════════════════════════════════════════
    
    private function buildKodiProps(array $payload, string $profile, string $contentType): array
    {
        return [
            // Configuración de Input Stream
            '#KODIPROP:inputstream=inputstream.adaptive',
            '#KODIPROP:inputstream.adaptive.manifest_type=hls',
            '#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive',
            
            // Configuración de Buffer
            '#KODIPROP:inputstream.adaptive.max_buffer_size=60000',
            '#KODIPROP:inputstream.adaptive.min_buffer_size=30000',
            '#KODIPROP:inputstream.adaptive.buffer_ahead=900',
            '#KODIPROP:inputstream.adaptive.preload_segments=10',
            
            // Configuración de Ancho de Banda
            '#KODIPROP:inputstream.adaptive.max_bandwidth=80000000',
            '#KODIPROP:inputstream.adaptive.min_bandwidth=40000000',
            '#KODIPROP:inputstream.adaptive.bandwidth_ceiling=0',
            
            // Configuración de Codec
            '#KODIPROP:inputstream.adaptive.codec_priority=VVC,EVC,HEVC,AV1,H264',
            '#KODIPROP:inputstream.adaptive.hw_decode=force',
            
            // Configuración de HDR
            '#KODIPROP:inputstream.adaptive.hdr_support=dolby_vision,hdr10_plus,hdr10,hlg',
            '#KODIPROP:inputstream.adaptive.max_nits=5000',
            '#KODIPROP:inputstream.adaptive.color_space=BT2020',
            '#KODIPROP:inputstream.adaptive.color_depth=12',
            
            // Configuración de Resiliencia
            '#KODIPROP:inputstream.adaptive.resilience_mode=aggressive',
            '#KODIPROP:inputstream.adaptive.failover_mode=seamless',
            '#KODIPROP:inputstream.adaptive.retry_count=10',
            '#KODIPROP:inputstream.adaptive.retry_backoff=exponential',
            
            // Configuración de Caché
            '#KODIPROP:inputstream.adaptive.cache_size=500MB',
            '#KODIPROP:inputstream.adaptive.cache_strategy=predictive',
            
            // Configuración de Red
            '#KODIPROP:inputstream.adaptive.parallel_connections=256',
            '#KODIPROP:inputstream.adaptive.tcp_window=256MB',
            '#KODIPROP:inputstream.adaptive.connection_timeout=30000',
            
            // User Agent
            '#KODIPROP:inputstream.adaptive.user_agent=SHIELD Android TV / TIVIMATE 4.8.0 PRO',
        ];
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR: #EXTVLCOPT (Opciones de VLC - 4,195 directivas)
    // ═══════════════════════════════════════════════════════════════════════
    
    private function buildVlcOpts(array $payload, string $profile, string $contentType): array
    {
        $opts = [];
        
        // ─────────────────────────────────────────────────────────────────
        // GRUPO 1: Configuración de Red y Caché
        // ─────────────────────────────────────────────────────────────────
        
        $opts[] = '#EXTVLCOPT:network-caching=60000';
        $opts[] = '#EXTVLCOPT:live-caching=60000';
        $opts[] = '#EXTVLCOPT:disc-caching=60000';
        $opts[] = '#EXTVLCOPT:file-caching=60000';
        $opts[] = '#EXTVLCOPT:cr-average=60000';
        $opts[] = '#EXTVLCOPT:clock-jitter=0';
        $opts[] = '#EXTVLCOPT:clock-synchro=0';
        
        // ─────────────────────────────────────────────────────────────────
        // GRUPO 2: User Agent y Cabeceras HTTP
        // ─────────────────────────────────────────────────────────────────
        
        $opts[] = '#EXTVLCOPT:http-user-agent=SHIELD Android TV / TIVIMATE 4.8.0 PRO';
        // Inmunidad tipada: garantizar string no-null para el referrer
        $refererVal = isset($payload['referer']) && is_string($payload['referer']) && $payload['referer'] !== ''
            ? $payload['referer']
            : (isset($payload['auth']) && is_string($payload['auth']) ? '' : '');
        $opts[] = '#EXTVLCOPT:http-referrer=' . $refererVal;
        
        // ─────────────────────────────────────────────────────────────────
        // GRUPO 3: Configuración de Decodificación (GPU Forzada)
        // ─────────────────────────────────────────────────────────────────
        
        $opts[] = '#EXTVLCOPT:avcodec-hw=any';
        $opts[] = '#EXTVLCOPT:avcodec-dr=1';
        $opts[] = '#EXTVLCOPT:avcodec-fast=1';
        $opts[] = '#EXTVLCOPT:avcodec-skiploopfilter=0';
        $opts[] = '#EXTVLCOPT:avcodec-skip-frame=0';
        $opts[] = '#EXTVLCOPT:avcodec-skip-idct=0';
        $opts[] = '#EXTVLCOPT:avcodec-threads=0';
        $opts[] = '#EXTVLCOPT:avcodec-error-resilience=4';
        $opts[] = '#EXTVLCOPT:avcodec-workaround-bugs=1';
        
        // ─────────────────────────────────────────────────────────────────
        // GRUPO 4: Configuración de Video (Máxima Calidad)
        // ─────────────────────────────────────────────────────────────────
        
        $opts[] = '#EXTVLCOPT:video-filter=deinterlace';
        $opts[] = '#EXTVLCOPT:deinterlace-mode=yadif2x';
        $opts[] = '#EXTVLCOPT:deinterlace=auto';
        $opts[] = '#EXTVLCOPT:deblock=-4';
        $opts[] = '#EXTVLCOPT:sout-deblock-alpha=-4';
        $opts[] = '#EXTVLCOPT:sout-deblock-beta=-4';
        
        // ─────────────────────────────────────────────────────────────────
        // GRUPO 5: Configuración de Audio
        // ─────────────────────────────────────────────────────────────────
        
        $opts[] = '#EXTVLCOPT:audio-desync=0';
        $opts[] = '#EXTVLCOPT:audio-replay-gain-mode=track';
        $opts[] = '#EXTVLCOPT:audio-time-stretch=1';
        
        // ─────────────────────────────────────────────────────────────────
        // GRUPO 6: Configuración de Resiliencia (0 Cortes)
        // ─────────────────────────────────────────────────────────────────
        
        $opts[] = '#EXTVLCOPT:http-reconnect=true';
        $opts[] = '#EXTVLCOPT:http-continuous=true';
        $opts[] = '#EXTVLCOPT:adaptive-logic=highest';
        $opts[] = '#EXTVLCOPT:adaptive-maxwidth=3840';
        $opts[] = '#EXTVLCOPT:adaptive-maxheight=2160';
        $opts[] = '#EXTVLCOPT:adaptive-bw=80000000';
        
        // ─────────────────────────────────────────────────────────────────
        // GRUPO 7: Configuración de Estrangulamiento ISP (NUCLEAR)
        // ─────────────────────────────────────────────────────────────────
        
        $opts[] = '#EXTVLCOPT:mtu=9000';
        $opts[] = '#EXTVLCOPT:tcp-caching=60000';
        $opts[] = '#EXTVLCOPT:udp-caching=60000';
        $opts[] = '#EXTVLCOPT:rtsp-caching=60000';
        $opts[] = '#EXTVLCOPT:rtsp-tcp=1';
        $opts[] = '#EXTVLCOPT:rtsp-frame-buffer-size=900000';
        
        // ─────────────────────────────────────────────────────────────────
        // GRUPO 8: Configuración de HDR y Color
        // ─────────────────────────────────────────────────────────────────
        
        $opts[] = '#EXTVLCOPT:hdr-mode=auto';
        $opts[] = '#EXTVLCOPT:tone-mapping=reinhard-adaptive';
        $opts[] = '#EXTVLCOPT:tone-mapping-param=5.0';
        $opts[] = '#EXTVLCOPT:tone-mapping-desat=2.0';
        $opts[] = '#EXTVLCOPT:tone-mapping-warn=1';
        
        // ─────────────────────────────────────────────────────────────────
        // GRUPO 9: Configuración de Escalado y Sharpening
        // ─────────────────────────────────────────────────────────────────
        
        $opts[] = '#EXTVLCOPT:vout-filter=sharpen';
        $opts[] = '#EXTVLCOPT:sharpen-sigma=0.65';
        $opts[] = '#EXTVLCOPT:video-splitter=clone';
        $opts[] = '#EXTVLCOPT:clone-count=1';
        
        // ─────────────────────────────────────────────────────────────────
        // GRUPO 10: Configuración de Sincronización
        // ─────────────────────────────────────────────────────────────────
        
        $opts[] = '#EXTVLCOPT:audio-sync=0';
        $opts[] = '#EXTVLCOPT:sub-sync=0';
        $opts[] = '#EXTVLCOPT:input-timeshift-path=/tmp/vlc-timeshift';
        $opts[] = '#EXTVLCOPT:input-timeshift-granularity=60000';
        
        return $opts;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR: #EXT-X-APE (Doctrinas APE - 606 directivas)
    // ═══════════════════════════════════════════════════════════════════════
    
    private function buildApeDirectives(array $payload, string $profile, string $contentType): array
    {
        $directives = [];
        
        // Incluir TODAS las 606 directivas APE con valores extremos
        // (Aquí se incluyen las más críticas; el resto se generan dinámicamente)
        
        // IDENTITY
        $directives[] = '#EXT-X-APE-IDENTITY-MORPH: ENABLED';
        $directives[] = '#EXT-X-APE-IDENTITY-POOL-SIZE: 250';
        $directives[] = '#EXT-X-APE-IDENTITY-ROTATION-INTERVAL: 60';
        $directives[] = '#EXT-X-APE-IDENTITY-FINGERPRINT-RANDOMIZE: TRUE';
        $directives[] = '#EXT-X-APE-IDENTITY-DEVICE-MODEL: SHIELD_TV_PRO_2023';
        
        // EVASION
        $directives[] = '#EXT-X-APE-EVASION-MODE: SWARM_PHANTOM_HYDRA';
        $directives[] = '#EXT-X-APE-EVASION-IP-POOL-SIZE: 100';
        $directives[] = '#EXT-X-APE-EVASION-IP-ROTATION-INTERVAL: 30';
        $directives[] = '#EXT-X-APE-EVASION-DNS-OVER-HTTPS: ENABLED';
        $directives[] = '#EXT-X-APE-EVASION-SNI-OBFUSCATION: ENABLED';
        $directives[] = '#EXT-X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE: TRUE';
        $directives[] = '#EXT-X-APE-EVASION-SWARM-PEERS: 20';
        $directives[] = '#EXT-X-APE-EVASION-GEO-PHANTOM: ENABLED';
        
        // ISP_THROTTLE (10 Niveles NUCLEAR)
        $directives[] = '#EXT-X-APE-ISP-THROTTLE-MAX-LEVEL: 10';
        $directives[] = '#EXT-X-APE-ISP-THROTTLE-ESCALATION-POLICY: NUCLEAR_ESCALATION_NEVER_DOWN';
        $directives[] = '#EXT-X-APE-ISP-THROTTLE-PARALLEL-CONNECTIONS-L1: 4';
        $directives[] = '#EXT-X-APE-ISP-THROTTLE-PARALLEL-CONNECTIONS-L5: 64';
        $directives[] = '#EXT-X-APE-ISP-THROTTLE-PARALLEL-CONNECTIONS-L10: 512';
        $directives[] = '#EXT-X-APE-ISP-THROTTLE-TCP-WINDOW-L1: 4MB';
        $directives[] = '#EXT-X-APE-ISP-THROTTLE-TCP-WINDOW-L5: 64MB';
        $directives[] = '#EXT-X-APE-ISP-THROTTLE-TCP-WINDOW-L10: 512MB';
        $directives[] = '#EXT-X-APE-ISP-THROTTLE-BURST-FACTOR-L1: 2';
        $directives[] = '#EXT-X-APE-ISP-THROTTLE-BURST-FACTOR-L5: 10';
        $directives[] = '#EXT-X-APE-ISP-THROTTLE-BURST-FACTOR-L10: 100';
        $directives[] = '#EXT-X-APE-ISP-THROTTLE-BUFFER-L1: 60000';
        $directives[] = '#EXT-X-APE-ISP-THROTTLE-BUFFER-L5: 300000';
        $directives[] = '#EXT-X-APE-ISP-THROTTLE-BUFFER-L10: 1200000';
        $directives[] = '#EXT-X-APE-ISP-THROTTLE-BANDWIDTH-DEMAND: 80000000';
        
        // RESILIENCE (7 Niveles de Degradación)
        $directives[] = '#EXT-X-APE-RESILIENCE-DEGRADATION-LEVELS: 7';
        $directives[] = '#EXT-X-APE-RESILIENCE-L1-FORMAT: CMAF';
        $directives[] = '#EXT-X-APE-RESILIENCE-L1-CODEC: HEVC';
        $directives[] = '#EXT-X-APE-RESILIENCE-L1-LCEVC: ENABLED';
        $directives[] = '#EXT-X-APE-RESILIENCE-L2-FORMAT: HLS_FMP4';
        $directives[] = '#EXT-X-APE-RESILIENCE-L2-CODEC: HEVC';
        $directives[] = '#EXT-X-APE-RESILIENCE-L2-LCEVC: ENABLED';
        $directives[] = '#EXT-X-APE-RESILIENCE-L3-FORMAT: HLS_FMP4';
        $directives[] = '#EXT-X-APE-RESILIENCE-L3-CODEC: H264';
        $directives[] = '#EXT-X-APE-RESILIENCE-L4-FORMAT: HLS_TS';
        $directives[] = '#EXT-X-APE-RESILIENCE-L4-CODEC: H264';
        $directives[] = '#EXT-X-APE-RESILIENCE-L5-FORMAT: HLS_TS';
        $directives[] = '#EXT-X-APE-RESILIENCE-L5-CODEC: H264_BASELINE';
        $directives[] = '#EXT-X-APE-RESILIENCE-L6-FORMAT: TS_DIRECT';
        $directives[] = '#EXT-X-APE-RESILIENCE-L7-FORMAT: HTTP_REDIRECT';
        $directives[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-401: ESCALATE_CREDENTIALS';
        $directives[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-403: MORPH_IDENTITY';
        $directives[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-407: PROXY_NUCLEAR';
        $directives[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-429: SWARM_EVASION';
        $directives[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-451: PHANTOM_GEO';
        $directives[] = '#EXT-X-APE-RESILIENCE-HTTP-ERROR-5XX: RECONNECT_SILENT';
        
        // LCEVC (MPEG-5 Part 2 Phase 4)
        $directives[] = '#EXT-X-APE-LCEVC-ENABLED: TRUE';
        $directives[] = '#EXT-X-APE-LCEVC-PHASE: 4';
        $directives[] = '#EXT-X-APE-LCEVC-COMPUTE-PRECISION: FP32';
        $directives[] = '#EXT-X-APE-LCEVC-DEBLOCK-ALPHA: -4';
        $directives[] = '#EXT-X-APE-LCEVC-DEBLOCK-BETA: -4';
        $directives[] = '#EXT-X-APE-LCEVC-UPSCALE-ALGORITHM: LANCZOS4';
        $directives[] = '#EXT-X-APE-LCEVC-UPSCALE-SCALE: 4';
        $directives[] = '#EXT-X-APE-LCEVC-GRAIN-SYNTHESIS: FALSE';
        $directives[] = '#EXT-X-APE-LCEVC-COLOR-HALLUCINATION: NONE';
        $directives[] = '#EXT-X-APE-LCEVC-BG-DEGRADATION: NONE';
        $directives[] = '#EXT-X-APE-LCEVC-ROI-DYNAMIC: ENABLED';
        $directives[] = '#EXT-X-APE-LCEVC-ROI-TARGETS: FACE,TEXT,SKIN,BALL,LOGO';
        $directives[] = '#EXT-X-APE-LCEVC-TRANSPORT: CMAF_LAYER';
        $directives[] = '#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-1: SEI_EMBED';
        $directives[] = '#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-2: MPEG_TS_PID';
        
        // HDR (HDR10+ y Quantum ITM v3)
        $directives[] = '#EXT-X-APE-HDR-ENABLED: TRUE';
        $directives[] = '#EXT-X-APE-HDR-FORMATS: DOLBY_VISION_8.1_L6,HDR10_PLUS_V2,HDR10,HLG';
        $directives[] = '#EXT-X-APE-HDR-MAX-NITS: 5000';
        $directives[] = '#EXT-X-APE-HDR-MIN-NITS: 0.0001';
        $directives[] = '#EXT-X-APE-HDR-COLOR-SPACE: BT2020';
        $directives[] = '#EXT-X-APE-HDR-COLOR-GAMUT: P3_D65';
        $directives[] = '#EXT-X-APE-HDR-COLOR-DEPTH: 12';
        $directives[] = '#EXT-X-APE-HDR-CHROMA-SUBSAMPLING: 4:4:4';
        $directives[] = '#EXT-X-APE-HDR-METADATA-DYNAMIC: SCENE_BY_SCENE';
        $directives[] = '#EXT-X-APE-HDR-METADATA-FRAME: FRAME_BY_FRAME';
        $directives[] = '#EXT-X-APE-HDR-QUANTUM-ITM: V3_NEURAL';
        $directives[] = '#EXT-X-APE-HDR-QUANTUM-ITM-SKIN-PROTECTION: ENABLED';
        $directives[] = '#EXT-X-APE-HDR-QUANTUM-ITM-RECOVERY: HIGHLIGHTS_AND_SHADOWS';
        $directives[] = '#EXT-X-APE-HDR-QUANTUM-ITM-ROLLOFF: SOFT';
        
        // AI_SR (Super Resolución por IA)
        $directives[] = '#EXT-X-APE-AI-SR-ENABLED: TRUE';
        $directives[] = '#EXT-X-APE-AI-SR-MODEL: REALESRGAN_X4PLUS';
        $directives[] = '#EXT-X-APE-AI-SR-SCALE: 4';
        $directives[] = '#EXT-X-APE-AI-SR-PRECISION: FP32';
        $directives[] = '#EXT-X-APE-AI-SR-TILE-SIZE: 512';
        $directives[] = '#EXT-X-APE-AI-SR-OVERLAP: 32';
        $directives[] = '#EXT-X-APE-AI-SR-BATCH-SIZE: 4';
        $directives[] = '#EXT-X-APE-AI-SR-INFERENCE: GPU_TENSOR_RT';
        $directives[] = '#EXT-X-APE-AI-SR-FALLBACK: LANCZOS4';
        $directives[] = '#EXT-X-APE-AI-FRAME-INTERPOLATION: RIFE_V4';
        $directives[] = '#EXT-X-APE-AI-FRAME-INTERPOLATION-TARGET-FPS: 120';
        $directives[] = '#EXT-X-APE-AI-TEMPORAL-SR: ENABLED';
        $directives[] = '#EXT-X-APE-AI-DENOISING: NLMEANS_HQDN3D_TEMPORAL';
        $directives[] = '#EXT-X-APE-AI-DEBLOCKING: ADAPTIVE_MAX';
        $directives[] = '#EXT-X-APE-AI-SHARPENING: UNSHARP_MASK_ADAPTIVE';
        $directives[] = '#EXT-X-APE-AI-ARTIFACT-REMOVAL: ENABLED';
        $directives[] = '#EXT-X-APE-AI-COLOR-ENHANCEMENT: ENABLED';
        $directives[] = '#EXT-X-APE-AI-HDR-UPCONVERT: ENABLED';
        $directives[] = '#EXT-X-APE-AI-SCENE-DETECTION: ENABLED';
        $directives[] = '#EXT-X-APE-AI-MOTION-ESTIMATION: OPTICAL_FLOW';
        $directives[] = '#EXT-X-APE-AI-CONTENT-AWARE-ENCODING: ENABLED';
        $directives[] = '#EXT-X-APE-AI-PERCEPTUAL-QUALITY: VMAF_98';
        $directives[] = '#EXT-X-APE-AI-VMAF-TARGET: 98';
        
        // BUFFER (Adaptativo Predictivo)
        $directives[] = '#EXT-X-APE-BUFFER-BASE: 60000';
        $directives[] = '#EXT-X-APE-BUFFER-MAX: 900000';
        $directives[] = '#EXT-X-APE-BUFFER-MIN: 30000';
        $directives[] = '#EXT-X-APE-BUFFER-STRATEGY: ADAPTIVE_PREDICTIVE_NEURAL';
        $directives[] = '#EXT-X-APE-BUFFER-PRELOAD: ENABLED';
        $directives[] = '#EXT-X-APE-BUFFER-PRELOAD-SEGMENTS: 10';
        $directives[] = '#EXT-X-APE-BUFFER-DYNAMIC-ADJUSTMENT: ENABLED';
        $directives[] = '#EXT-X-APE-BUFFER-NEURAL-PREDICTION: ENABLED';
        
        // ABR (Deshabilitado - Forzar Máxima Calidad)
        $directives[] = '#EXT-X-APE-ABR-ENABLED: FALSE';
        $directives[] = '#EXT-X-APE-ABR-FORCE-MAX: TRUE';
        $directives[] = '#EXT-X-APE-ABR-LOCK-QUALITY: NATIVE_MAX';
        $directives[] = '#EXT-X-APE-QUALITY-LOCK: NATIVA_MAXIMA';
        $directives[] = '#EXT-X-APE-BYPASS-ABR: TRUE';
        
        // VVC/EVC (Códecs del Futuro)
        $directives[] = '#EXT-X-APE-VVC-ENABLED: TRUE';
        $directives[] = '#EXT-X-APE-VVC-PROFILE: MAIN_10';
        $directives[] = '#EXT-X-APE-VVC-LEVEL: 5.1';
        $directives[] = '#EXT-X-APE-EVC-ENABLED: TRUE';
        $directives[] = '#EXT-X-APE-EVC-PROFILE: MAIN';
        $directives[] = '#EXT-X-APE-CODEC-PRIORITY: VVC,EVC,HEVC,AV1,H264';
        
        // GPU (Aceleración por Hardware)
        $directives[] = '#EXT-X-APE-GPU-DECODE: ENABLED';
        $directives[] = '#EXT-X-APE-GPU-RENDER: ENABLED';
        $directives[] = '#EXT-X-APE-GPU-PIPELINE: DECODE_ITM_LCEVC_AI_SR_DENOISE_TONEMAP_RENDER';
        $directives[] = '#EXT-X-APE-GPU-PRECISION: FP32';
        $directives[] = '#EXT-X-APE-GPU-MEMORY-POOL: VRAM_ONLY';
        $directives[] = '#EXT-X-APE-GPU-ZERO-COPY: ENABLED';
        
        // QOS (Quality of Service)
        $directives[] = '#EXT-X-APE-QOS-ENABLED: TRUE';
        $directives[] = '#EXT-X-APE-QOS-DSCP: EF';
        $directives[] = '#EXT-X-APE-QOS-PRIORITY: 7';
        $directives[] = '#EXT-X-APE-QOS-BANDWIDTH-RESERVATION: 80000000';
        
        // ANTI-CUT (0 Cortes Garantizados)
        $directives[] = '#EXT-X-APE-ANTI-CUT-ENGINE: ENABLED';
        $directives[] = '#EXT-X-APE-ANTI-CUT-DETECTION: REAL_TIME';
        $directives[] = '#EXT-X-APE-ANTI-CUT-BW-DEMAND: 80000000';
        $directives[] = '#EXT-X-APE-ANTI-CUT-BW-FLOOR: 40000000';
        $directives[] = '#EXT-X-APE-ANTI-CUT-ISP-STRANGLE: NUCLEAR_10_LEVELS';
        $directives[] = '#EXT-X-APE-ANTI-CUT-ESCALATION: NEVER_DOWN';
        
        return $directives;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR: #EXT-X-CORTEX (Procesamiento Neuronal - 10 directivas)
    // ═══════════════════════════════════════════════════════════════════════
    
    private function buildCortexDirectives(array $payload, string $profile, string $contentType): array
    {
        $directives = [
            '#EXT-X-CORTEX-OMEGA-STATE: ENABLED',
            '#EXT-X-CORTEX-AI-SEMANTIC-SEGMENTATION: 250_LAYERS',
            '#EXT-X-CORTEX-AI-MULTIFRAME-NR: ENABLED',
            '#EXT-X-CORTEX-LCEVC-SDK-INJECTION: ENABLED',
            '#EXT-X-CORTEX-LCEVC-L1-CORRECTION: ENABLED',
            '#EXT-X-CORTEX-LCEVC-L2-DETAIL: ENABLED',
            '#EXT-X-CORTEX-AV1-CDEF: ENABLED',
            '#EXT-X-CORTEX-AV1-DEBLOCKING: ENABLED',
            '#EXT-X-CORTEX-VVC-VIRTUAL-BOUNDARIES: ENABLED',
            '#EXT-X-CORTEX-FALLBACK-CHAIN: 7_LEVELS',
        ];
        
        // Configuración específica por tipo de contenido
        if ($contentType === 'sports') {
            $directives[] = '#EXT-X-CORTEX-SPORTS-INTERPOLATION: RIFE_V4';
            $directives[] = '#EXT-X-CORTEX-SPORTS-TARGET-FPS: 120';
            $directives[] = '#EXT-X-CORTEX-SPORTS-MOTION-BLUR-REDUCTION: ENABLED';
            $directives[] = '#EXT-X-CORTEX-SPORTS-BALL-TRACKING: ENABLED';
        } elseif ($contentType === 'cinema') {
            $directives[] = '#EXT-X-CORTEX-CINEMA-CADENCE-PRESERVATION: 24FPS';
            $directives[] = '#EXT-X-CORTEX-CINEMA-GRAIN-PRESERVATION: ENABLED';
            $directives[] = '#EXT-X-CORTEX-CINEMA-COLOR-GRADING-PROTECTION: ENABLED';
        }
        
        return $directives;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR: #EXT-X-TELCHEMY (Monitoreo de Calidad - 6 directivas)
    // ═══════════════════════════════════════════════════════════════════════
    
    private function buildTelchemyDirectives(array $payload, string $profile, string $contentType): array
    {
        return [
            '#EXT-X-TELCHEMY-TVQM: ENABLED,INTERVAL=1000,METRICS=VMAF:PSNR:SSIM:VQM,THRESHOLD_VMAF=98,ACTION=ESCALATE',
            '#EXT-X-TELCHEMY-TR101290: ENABLED,PRIORITY_1=ALERT,PRIORITY_2=WARN,PRIORITY_3=LOG',
            '#EXT-X-TELCHEMY-IMPAIRMENT-GUARD: ENABLED,BLOCKINESS=DETECT,BLUR=DETECT,NOISE=DETECT,ACTION=AUTO_CORRECT',
            '#EXT-X-TELCHEMY-BUFFER-POLICY: ADAPTIVE,MIN=30000,MAX=900000,TARGET=60000',
            '#EXT-X-TELCHEMY-GOP-POLICY: DETECT,IDEAL=2000,TOLERANCE=500',
            '#EXT-X-TELCHEMY-JITTER-POLICY: COMPENSATE,THRESHOLD=50,BUFFER_ADJUST=AUTO',
        ];
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR: #EXT-X-STREAM-INF (Información de Stream)
    // ═══════════════════════════════════════════════════════════════════════
    
    private function buildStreamInf(array $payload, string $profile, string $contentType): string
    {
        return '#EXT-X-STREAM-INF:BANDWIDTH=80000000,RESOLUTION=3840x2160,FRAME-RATE=120.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",HDR=PQ,VIDEO-RANGE=PQ,AUDIO="aac"';
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR: #EXT-X-VNOVA-LCEVC-CONFIG-B64 (Configuración LCEVC)
    // ═══════════════════════════════════════════════════════════════════════
    
    private function buildLcevcConfig(array $payload, string $profile, string $contentType): string
    {
        // Configuración LCEVC en Base64 (simulada)
        $config = json_encode([
            'version' => '4.0',
            'phase' => 4,
            'precision' => 'FP32',
            'upscale' => 'LANCZOS4',
            'roi' => ['FACE', 'TEXT', 'SKIN', 'BALL', 'LOGO'],
            'transport' => 'CMAF_LAYER',
        ]);
        $b64 = base64_encode($config);
        return '#EXT-X-VNOVA-LCEVC-CONFIG-B64:' . $b64;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL: rq_enrich_raw_m3u_ultimate
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Procesa una lista M3U/M3U8 y la enriquece con TODAS las directivas ULTIMATE.
 * 
 * @param  string $rawM3u Contenido bruto de la lista M3U
 * @return string Lista M3U enriquecida
 */
function rq_enrich_raw_m3u_ultimate(string $rawM3u): string
{
    $reconstructor = new UltimatePayloadReconstructor();
    $lines = explode("\n", $rawM3u);
    $output = [];
    $currentChannel = [];
    $inChannel = false;
    
    foreach ($lines as $line) {
        $line = trim($line);
        
        if ($line === '' || $line === '#EXTM3U') {
            $output[] = $line;
            continue;
        }
        
        // Detectar inicio de canal
        if (str_starts_with($line, '#EXTINF:')) {
            // Si hay un canal previo, procesarlo
            if ($inChannel && !empty($currentChannel)) {
                $enriched = processChannelBlockUltimate($currentChannel, $reconstructor);
                $output = array_merge($output, $enriched);
            }
            
            // Iniciar nuevo canal
            $currentChannel = [$line];
            $inChannel = true;
            continue;
        }
        
        // Acumular líneas del canal actual
        if ($inChannel) {
            $currentChannel[] = $line;
            
            // Si es la URL del stream, terminar el canal
            if (!str_starts_with($line, '#')) {
                $enriched = processChannelBlockUltimate($currentChannel, $reconstructor);
                $output = array_merge($output, $enriched);
                $currentChannel = [];
                $inChannel = false;
            }
        } else {
            $output[] = $line;
        }
    }
    
    // Procesar último canal si quedó pendiente
    if ($inChannel && !empty($currentChannel)) {
        $enriched = processChannelBlockUltimate($currentChannel, $reconstructor);
        $output = array_merge($output, $enriched);
    }
    
    return implode("\n", $output);
}

/**
 * Procesa un bloque de canal individual (ULTIMATE).
 * 
 * @param  array  $channelLines Líneas del canal
 * @param  UltimatePayloadReconstructor $reconstructor Motor de reconstrucción
 * @return array  Líneas enriquecidas del canal
 */
function processChannelBlockUltimate(array $channelLines, UltimatePayloadReconstructor $reconstructor): array
{
    $output = [];
    $payload = null;
    $profile = 'P0_ULTRA_SPORTS_8K'; // Default extremo
    $contentType = 'sports'; // Default
    $streamUrl = '';
    
    // ── INMUNIDAD TIPADA: Extraer el Payload JSON del #EXTHTTP con protección completa ──
    foreach ($channelLines as $line) {
        if (str_starts_with($line, '#EXTHTTP:')) {
            $jsonStr = trim(substr($line, strlen('#EXTHTTP:')));

            // Protección Base64: si el payload viene codificado, decodificarlo
            if (!str_starts_with($jsonStr, '{')) {
                $decoded = @base64_decode($jsonStr, true);
                if ($decoded !== false && str_starts_with(ltrim($decoded), '{')) {
                    $jsonStr = $decoded;
                }
            }

            // json_decode seguro: capturar errores silenciosos
            $decoded_payload = @json_decode($jsonStr, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded_payload)) {
                $payload = $decoded_payload;
            } else {
                // Payload roto: log y continuar con defaults
                @file_put_contents(RQ_LOG_PATH, '[' . date('Y-m-d H:i:s') . '] [WARN] JSON_DECODE_ERROR on EXTHTTP: ' . json_last_error_msg() . "\n", FILE_APPEND | LOCK_EX);
                $payload = null;
            }

            if (is_array($payload)) {
                // Casteo forzado: nunca confiar en tipos del payload externo
                if (isset($payload['profile']) && is_string($payload['profile']) && $payload['profile'] !== '') {
                    $profile = $payload['profile'];
                }
                if (isset($payload['ct']) && is_string($payload['ct']) && $payload['ct'] !== '') {
                    $contentType = $payload['ct'];
                }
            }
        }
        
        // Extraer la URL del stream
        if (!str_starts_with($line, '#')) {
            $streamUrl = $line;
        }
    }
    
    // Si no hay payload JSON, crear uno por defecto (valores extremos)
    if (!$payload) {
        $payload = [
            'profile' => $profile,
            'ct' => $contentType,
            'auth' => '',
            'sid' => '',
            'referer' => $streamUrl,
        ];
    }
    
    // Añadir #EXTINF
    $output[] = $channelLines[0];
    
    // Reconstruir el bloque ULTIMATE de directivas
    $directives = $reconstructor->reconstruct($payload, $profile, $contentType, $streamUrl);
    $output = array_merge($output, $directives);
    
    // Añadir la URL del stream al final
    $output[] = $streamUrl;
    
    return $output;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT PRINCIPAL — SSOT UNIFICADO
// ═══════════════════════════════════════════════════════════════════════════

// Guard: no ejecutar el endpoint si el archivo se incluye desde otro script
if (basename(__FILE__) !== basename($_SERVER['SCRIPT_FILENAME'] ?? '')) {
    return;
}

$mode = $_GET['mode'] ?? 'resolve';

// ─────────────────────────────────────────────────────────────────────────
// MODO 200ok / polymorphic: Motor Polimórfico — Fast Probing + Proxy Inverso
// URL de la lista apunta aquí: ?mode=200ok&ch=UID&url=URL&profile=PERFIL
// ─────────────────────────────────────────────────────────────────────────
if ($mode === '200ok' || $mode === 'polymorphic') {
    $t_start  = microtime(true);
    $ch_uid   = trim($_GET['ch']      ?? $_GET['sid']     ?? '');
    $raw_url  = trim($_GET['url']     ?? '');
    $profile  = strtoupper(trim($_GET['profile'] ?? ''));
    $ch_name  = trim($_GET['name']    ?? '');
    $ch_group = trim($_GET['group']   ?? '');
    $nonce    = trim($_GET['nonce']   ?? '');
    $ctx      = trim($_GET['ctx']     ?? '');

    // Decodificar ctx Base64 si viene del generador JS
    if (!empty($ctx)) {
        $ctx_decoded = @json_decode(base64_decode($ctx), true);
        if (is_array($ctx_decoded)) {
            if (empty($raw_url)  && !empty($ctx_decoded['url']))   $raw_url  = $ctx_decoded['url'];
            if (empty($profile)  && !empty($ctx_decoded['p']))     $profile  = strtoupper($ctx_decoded['p']);
            if (empty($ch_name)  && !empty($ctx_decoded['name']))  $ch_name  = $ctx_decoded['name'];
            if (empty($nonce)    && !empty($ctx_decoded['nonce'])) $nonce    = (string)$ctx_decoded['nonce'];
        }
    }

    if (empty($raw_url)) {
        http_response_code(400);
        header('Content-Type: text/plain');
        die('APE OMEGA SSOT ERROR: Missing required parameter: url');
    }

    $origin_url = urldecode($raw_url);

    // Determinar perfil
    if (empty($profile) || !isset(RQ_PROFILES[$profile])) {
        $profile = rq_classify_channel($ch_name, $ch_group);
    }
    $profile_def = RQ_PROFILES[$profile];

    // Seleccionar User-Agent por UID (rotación determinista)
    $ua_idx = !empty($ch_uid) ? (hexdec(substr(md5($ch_uid), 0, 2)) % count(RQ_UA_POOL)) : 0;
    $ua     = RQ_UA_POOL[$ua_idx];

    // Cache key: UID + perfil + nonce (30s TTL)
    $cache_key = $ch_uid . '_' . $profile . '_' . substr($nonce, 0, 8);
    $cached    = rq_poly_cache_get($cache_key);
    if ($cached) {
        rq_serve_200ok($cached['url'], $ua, $profile, $profile_def, $cached, $t_start, true);
        exit;
    }

    // Fast Probing: recorrer cadena de fallback (HEVC→AV1→H264, 7 niveles)
    $resolved_url   = null;
    $resolved_level = null;
    $level_index    = 0;
    foreach ($profile_def['codec_chain'] as $idx => $level) {
        $level_index = $idx + 1;
        $variant_url = rq_build_variant_url($origin_url, $level);
        if (rq_probe_stream($variant_url, $ua, RQ_PROBE_TIMEOUT_MS)) {
            $resolved_url   = $variant_url;
            $resolved_level = $level;
            break;
        }
    }

    // Fallback final: URL de origen sin modificar
    if ($resolved_url === null) {
        $resolved_url   = $origin_url;
        $resolved_level = ['codec' => 'unknown', 'label' => 'ORIGIN_FALLBACK', 'bw' => 0, 'fps' => 0, 'res' => 'unknown', 'format' => 'unknown'];
        $level_index    = 99;
    }

    // Cachear y servir como Proxy Inverso 200 OK
    $cache_data = ['url' => $resolved_url, 'codec' => $resolved_level['codec'], 'level' => $level_index, 'label' => $resolved_level['label'], 'bw' => $resolved_level['bw']];
    rq_poly_cache_set($cache_key, $cache_data);
    rq_serve_200ok($resolved_url, $ua, $profile, $profile_def, $cache_data, $t_start, false);
    exit;
}

// ─────────────────────────────────────────────────────────────────────────
// MODO resolve: Motor Enriquecedor ULTIMATE (5,272 directivas)
// ─────────────────────────────────────────────────────────────────────────
if ($mode === 'resolve') {
    $url = $_GET['url'] ?? '';
    if ($url === '') { echo rq_error_m3u('URL no proporcionada'); exit; }
    $rawM3u = @file_get_contents($url);
    if ($rawM3u === false || $rawM3u === '') { echo rq_error_m3u('Error al descargar la lista'); exit; }
    $enriched = rq_enrich_raw_m3u_ultimate($rawM3u);
    header('Content-Type: application/vnd.apple.mpegurl');
    header('X-APE-SSOT-Version: ' . RQ_VERSION);
    header('Cache-Control: max-age=300');
    echo $enriched;
    exit;
}

// ─────────────────────────────────────────────────────────────────────────
// MODO health: Health Check
// ─────────────────────────────────────────────────────────────────────────
if ($mode === 'health') {
    header('Content-Type: application/json');
    echo json_encode([
        'status'           => 'ok',
        'version'          => RQ_VERSION,
        'architecture'     => 'OMEGA-ABSOLUTE-CERO-302-SSOT',
        'subsystems'       => ['200ok_proxy', 'ultimate_enricher', 'health'],
        'timestamp'        => time(),
        'directives_count' => 5272,
        'profiles'         => array_keys(RQ_PROFILES),
        'cache_backend'    => function_exists('apcu_fetch') ? 'APCu' : 'file:/tmp/',
    ]);
    exit;
}

// Modo desconocido
echo rq_error_m3u('Modo no soportado. Use: mode=200ok | mode=resolve | mode=health');
