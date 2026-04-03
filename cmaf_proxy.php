<?php
/**
 * APE ULTIMATE CMAF PROXY (cmaf_proxy.php)
 * 
 * Servidor de entrega Edge para streaming nativo CMAF desde /dev/shm RAMDisk.
 * Despacha Segmentos fMP4 en tiempo récord 0-IO (Latencia Cero)
 * Maneja la reescritura de los media playlists (ej: media_0.m3u8) absolutos al vuelo.
 */

// Desactivar buffers L7 para flujo ininterrumpido (FastCGI Obliteration)
header("X-Accel-Buffering: no");

$sid = $_GET['sid'] ?? null;
$seg = $_GET['seg'] ?? null;

if (!$sid || !$seg) {
    header("HTTP/1.1 400 Bad Request");
    die();
}

// Validar que el nombre del segmento sea un .m4s o .m3u8 de la arquitectura CMAF APE
if (!preg_match('/^[a-zA-Z0-9_\-]+\.(m4s|m3u8)$/', $seg)) {
    header("HTTP/1.1 403 Forbidden");
    die();
}

$file_path = "/dev/shm/ape_cmaf_cache/{$sid}/{$seg}";

if (!file_exists($file_path)) {
    header("HTTP/1.1 404 Not Found");
    die();
}

$ext = pathinfo($file_path, PATHINFO_EXTENSION);

if ($ext === 'm3u8') { // media_0.m3u8 (Sub-manifiesto de calidades únicas)
    header("Content-Type: application/vnd.apple.mpegurl");
    header("Cache-Control: no-cache, no-store, must-revalidate");
    
    // Leer reescribir links m4s y el mapa de inicialización
    $content = file_get_contents($file_path);
    $base_url = "https://iptv-ape.duckdns.org/cmaf_proxy.php?sid={$sid}&seg=";
    
    // Convertir todo (init.mp4 o fragment.m4s) en links absolutos para ExoPlayer
    $rewritten = preg_replace('/^(?!#)(.*\.(m4s|mp4))$/m', $base_url . '$1', $content);
    
    echo $rewritten;
    exit;
} elseif ($ext === 'm4s' || $ext === 'mp4') { // init o fragment fMP4 CMAF
    // HTTP/1.1 206 BYPASS PARA SOPORTE DE RANGOS CMAF L4
    $filesize = filesize($file_path);
    header("Content-Type: video/mp4");
    header("Accept-Ranges: bytes");

    if (isset($_SERVER['HTTP_RANGE'])) {
        list($param, $range) = explode('=', $_SERVER['HTTP_RANGE']);
        $range_arr = explode('-', $range);
        $start = empty($range_arr[0]) ? 0 : $range_arr[0];
        $end = empty($range_arr[1]) ? $filesize - 1 : $range_arr[1];

        $length = $end - $start + 1;
        header("HTTP/1.1 206 Partial Content");
        header("Content-Length: {$length}");
        header("Content-Range: bytes {$start}-{$end}/{$filesize}");

        $fp = fopen($file_path, 'rb');
        fseek($fp, $start);
        echo fread($fp, $length);
        fclose($fp);
        exit;
    } else {
        header("Content-Length: {$filesize}");
        readfile($file_path);
        exit;
    }
}
?>
