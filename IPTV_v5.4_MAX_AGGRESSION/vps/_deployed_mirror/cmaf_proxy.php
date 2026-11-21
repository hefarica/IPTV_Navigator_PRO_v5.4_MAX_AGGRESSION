<?php

declare(strict_types=1);

// ============================================================
// 🚀 APE ENGINE — cmaf_proxy.php — v16.2 STABILITY PATCH
// PARCHE CRÍTICO: Pureza binaria absoluta + validación de segmento
// ============================================================
// IMPORTANTE: NO debe haber NINGÚN espacio o salto de línea
// antes de la etiqueta <?php de apertura de este archivo.
// ============================================================

ini_set('display_errors', '0');
error_reporting(0);

// 🚨 PARCHE v16.2: Destruir CUALQUIER buffer de salida activo.
// ob_get_length() devuelve false si OB no está activo, por lo que
// la condición if (ob_get_length()) NUNCA limpiaba el buffer.
// ob_end_clean() es la solución correcta e incondicional.
if (ob_get_level() > 0) {
    ob_end_clean();
}

$streamId = $_GET['sid'] ?? '';
$segment  = $_GET['seg'] ?? '';

// Validación de seguridad estricta
if (
    !preg_match('/^[a-zA-Z0-9\-\.]+$/', $streamId) ||
    strpos($segment, '..') !== false ||
    strpos($segment, '/') !== false ||
    !preg_match('/^[a-zA-Z0-9\-\.]+$/', $segment)
) {
    http_response_code(400);
    exit;
}

$cmafDir  = "/dev/shm/ape_cmaf_cache/$streamId";
$filePath = "$cmafDir/$segment";

// ── APE v18.7: AUTO-LANZAMIENTO DEL WORKER ───────────────────────────
// Si el directorio de caché no existe o el manifest.mpd es muy viejo,
// relanzar el worker automáticamente sin depender de resolve_quality.php.
// La originUrl se guarda en /dev/shm/ape_metrics/{sid}/origin_url.txt
// por resolve_quality.php en el primer arranque.
$manifestPath = "$cmafDir/manifest.mpd";
$originFile   = "/dev/shm/ape_metrics/$streamId/origin_url.txt";
$dnaFile      = "/dev/shm/ape_metrics/$streamId/target_dna.json";

$workerNeeded = !file_exists($manifestPath) ||
                (time() - filemtime($manifestPath)) > 20;

if ($workerNeeded && file_exists($originFile)) {
    $originUrl = trim((string)@file_get_contents($originFile));
    if (!empty($originUrl)) {
        @mkdir($cmafDir, 0777, true);
        $dna      = file_exists($dnaFile)
                    ? (array)@json_decode((string)@file_get_contents($dnaFile), true)
                    : [];
        $codecTag = $dna['codec_tag'] ?? 'avc1';
        $listId   = $dna['list_id']   ?? '';
        $worker   = __DIR__ . '/cmaf_worker.php';
        $launchCmd = 'php ' . escapeshellarg($worker)
                   . ' ' . escapeshellarg($originUrl)
                   . ' ' . escapeshellarg($cmafDir)
                   . ' ' . escapeshellarg($codecTag)
                   . ' ' . escapeshellarg($listId)
                   . ' > /dev/null 2>&1 &';
        exec($launchCmd);
    }
}

// Mantener vivo el worker tocando el manifiesto
if (file_exists($manifestPath)) {
    @touch($manifestPath);
}

// Esperar hasta 3 segundos a que el worker genere el segmento
$maxWait  = 30;
$attempts = 0;
while (!file_exists($filePath) && $attempts < $maxWait) {
    usleep(100000); // 100ms
    $attempts++;
}

// 🚨 PARCHE CRÍTICO v16.2: Validar existencia Y tamaño mínimo.
// Sin esta validación, un archivo vacío o un 404 HTML se enviaba
// al reproductor causando UnrecognizedInputFormatException.
if (!file_exists($filePath) || filesize($filePath) < 100) {
    http_response_code(404);
    // Salida completamente limpia. Cero bytes de cuerpo.
    exit;
}

$fileSize = filesize($filePath);

// Determinar tipo MIME
if (str_ends_with($segment, '.ts')) {
    $mime = 'video/mp2t';
} elseif (str_ends_with($segment, '.m4s') || str_ends_with($segment, '.mp4')) {
    $mime = 'video/mp4';
} elseif (str_ends_with($segment, '.mpd')) {
    $mime = 'application/dash+xml';
} elseif (str_ends_with($segment, '.m3u8')) {
    $mime = 'application/vnd.apple.mpegurl';
} else {
    $mime = 'application/octet-stream';
}

// Cabeceras HTTP
header('Content-Type: ' . $mime);
header('Accept-Ranges: bytes');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
header('Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges');
header('Cache-Control: public, max-age=3600');
header_remove('X-Powered-By');
header('Server: APE-STEALTH-CDN/v16');
header('Connection: Keep-Alive');
header('Keep-Alive: timeout=86400, max=100000');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Soporte de Range Requests (HTTP 206)
if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $m)) {
    $start = ($m[1] === '') ? 0 : (int)$m[1];
    $end   = ($m[2] === '' || (int)$m[2] >= $fileSize) ? $fileSize - 1 : (int)$m[2];

    if ($start > $end || $start >= $fileSize) {
        header('HTTP/1.1 416 Requested Range Not Satisfiable');
        header("Content-Range: bytes */$fileSize");
        exit;
    }

    $length = $end - $start + 1;

    header('HTTP/1.1 206 Partial Content');
    header("Content-Range: bytes $start-$end/$fileSize");
    header("Content-Length: $length");

    $fp = @fopen($filePath, 'rb');
    if ($fp === false) {
        http_response_code(500);
        exit;
    }

    fseek($fp, $start);
    $bufferSize = 8192;
    $bytesLeft  = $length;

    while ($bytesLeft > 0 && !feof($fp)) {
        $readSize = min($bufferSize, $bytesLeft);
        $chunk    = fread($fp, $readSize);
        if ($chunk === false) break;
        echo $chunk;
        $bytesLeft -= strlen($chunk);
    }

    fclose($fp);
    exit;
}

// --- APE v18.8: Reescritura de sub-manifiestos HLS (media_N.m3u8) ---
// Los sub-manifiestos generados por FFmpeg tienen URLs relativas de segmentos
// (chunk-stream0-NNNNN.m4s). El reproductor no sabe que debe pedirlos al proxy.
// Reescribimos cada línea de segmento .m4s como URL absoluta al cmaf_proxy.php.
if ($mime === 'application/vnd.apple.mpegurl' && preg_match('/^media_\d+\.m3u8$/', $segment)) {
    $hlsContent = (string)file_get_contents($filePath);

    $cmafProtocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
    $proxySegBase = $cmafProtocol . '://' . $_SERVER['HTTP_HOST']
                  . dirname($_SERVER['SCRIPT_NAME'])
                  . '/cmaf_proxy.php?sid=' . urlencode($streamId) . '&seg=';

    // Reescribir init segment en #EXT-X-MAP
    $hlsContent = preg_replace_callback(
        '/URI="([^"]+\.m4s)"/',
        function($m) use ($proxySegBase) {
            return 'URI="' . $proxySegBase . urlencode(basename($m[1])) . '"';
        },
        $hlsContent
    );
    // Reescribir líneas de segmento .m4s sueltas
    $hlsContent = preg_replace_callback(
        '/^(chunk-[^\s]+\.m4s)$/m',
        function($m) use ($proxySegBase) {
            return $proxySegBase . urlencode($m[1]);
        },
        $hlsContent
    );

    http_response_code(200);
    header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Access-Control-Allow-Origin: *');
    header('Content-Length: ' . strlen($hlsContent));
    echo $hlsContent;
    exit;
}

// --- 🚀 PARCHE v17.2: INYECCIÓN ISO/IEC 23009-1 (God-Tier Manifest) ---
if (isset($mime) && $mime === 'application/dash+xml') {
    $mpdContent = file_get_contents($filePath);

    $epochStart = 1735689600;
    $availStart = gmdate('Y-m-d\TH:i:s\Z', $epochStart);
    $publish = gmdate('Y-m-d\TH:i:s\Z');

    // Inyectar atributos raíz a <MPD>
    $mpdContent = preg_replace('/<MPD([^>]*)>/', '<MPD$1 minBufferTime="PT2S" availabilityStartTime="' . $availStart . '" publishTime="' . $publish . '" timeShiftBufferDepth="PT30S" suggestedPresentationDelay="PT2S">', $mpdContent);
    // Limpiar duplicados nativos si FFmpeg los puso
    $mpdContent = preg_replace('/minBufferTime="[^"]*"(.*?|)minBufferTime="[^"]*"/', 'minBufferTime="PT2S"$1', $mpdContent);
    $mpdContent = preg_replace('/availabilityStartTime="[^"]*"(.*?|)availabilityStartTime="[^"]*"/', 'availabilityStartTime="' . $availStart . '"$1', $mpdContent);
    $mpdContent = preg_replace('/timeShiftBufferDepth="[^"]*"(.*?|)timeShiftBufferDepth="[^"]*"/', 'timeShiftBufferDepth="PT30S"$1', $mpdContent);

    // Video AdaptationSet startWithSAP, maxWidth, maxHeight
    $mpdContent = preg_replace('/<AdaptationSet([^>]*contentType="video"[^>]*)>/', '<AdaptationSet$1 startWithSAP="1" maxWidth="3840" maxHeight="2160" par="16:9" scanType="progressive">', $mpdContent);

    // Repetición infinita en timeline para live (Live Edge Catchup)
    $mpdContent = preg_replace('/<S t="([^"]+)" d="([^"]+)"( \/>|><\/S>)/', '<S t="$1" d="$2" r="-1" />', $mpdContent);

    // startNumber sincrónico con el Epoch
    $segDurMs   = 2000;
    $nowMs      = (int)(microtime(true) * 1000);
    $startNum   = (int)(($nowMs - ($epochStart * 1000)) / $segDurMs);
    $mpdContent = preg_replace('/startNumber="[^"]*"/', 'startNumber="' . $startNum . '"', $mpdContent);

    // Envolver en Period obligatoriamente si falta
    if (strpos($mpdContent, '<Period') === false) {
        $mpdContent = preg_replace('/(<AdaptationSet.*?<\/AdaptationSet>)/us', '<Period id="0" start="PT0.0S">$1</Period>', $mpdContent);
    }

    $modSize = strlen($mpdContent);
    header('HTTP/1.1 200 OK');
    header('Content-Length: ' . $modSize);
    echo $mpdContent;
    exit;
}

// Respuesta completa normal (HTTP 200) para chunks binarios .m4s / .mp4
header('HTTP/1.1 200 OK');
header('Content-Length: ' . $fileSize);
readfile($filePath);

// 🚨 PARCHE v16.2: NO hay etiqueta de cierre 
?> para prevenir
// inyección de espacios en blanco al final del archivo.