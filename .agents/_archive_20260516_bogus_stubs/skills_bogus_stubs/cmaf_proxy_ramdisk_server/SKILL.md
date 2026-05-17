---
name: "CMAF Proxy RAM-Disk — Servidor de Segmentos fMP4 desde /dev/shm"
description: "Arquitectura del cmaf_proxy.php: servidor de archivos ultrarrápido que lee segmentos DASH/CMAF desde RAM-disk (/dev/shm), con soporte HTTP 206 Range Requests, inyección MPD ISO 23009-1, y validación binaria"
---

# CMAF Proxy — RAM-Disk Segment Server

## Propósito
`cmaf_proxy.php` es un servidor de archivos ultra-rápido que:
1. Lee segmentos fMP4 generados por FFmpeg desde el RAM-disk `/dev/shm/ape_cmaf_cache/{sid}/`
2. Los sirve al reproductor (OTT Navigator, TiviMate) con los MIME types y headers correctos
3. Soporta HTTP 206 Range Requests para compatibilidad con ExoPlayer
4. Inyecta atributos ISO 23009-1 al `manifest.mpd` en vuelo

## Validación de Entrada
```php
$streamId = $_GET['sid'] ?? '';
$segment  = $_GET['seg'] ?? '';

// Regex estricta: solo alfanuméricos, guiones y puntos
if (!preg_match('/^[a-zA-Z0-9\-\.]+$/', $streamId) ||
    strpos($segment, '..') !== false ||
    strpos($segment, '/') !== false) {
    http_response_code(400);
    exit;
}
```

## Espera Activa (Polling)
```php
$maxWait = 15;  // 15 × 100ms = 1.5 segundos máximo
$attempts = 0;
while (!file_exists($filePath) && $attempts < $maxWait) {
    usleep(100000); // 100ms
    $attempts++;
}
```

## Validación de Tamaño Mínimo (Parche v16.2)
```php
// Un archivo vacío o < 100 bytes es basura (HTML de error, etc.)
if (!file_exists($filePath) || filesize($filePath) < 100) {
    http_response_code(404);
    exit;
}
```

## MIME Types
```php
if (str_ends_with($segment, '.ts'))   → 'video/mp2t'
if (str_ends_with($segment, '.m4s')) → 'video/mp4'
if (str_ends_with($segment, '.mpd')) → 'application/dash+xml'
if (str_ends_with($segment, '.m3u8')) → 'application/vnd.apple.mpegurl'
else                                  → 'application/octet-stream'
```

## HTTP 206 Range Requests
Soporte completo para peticiones parciales (requerido por ExoPlayer):
```php
if (isset($_SERVER['HTTP_RANGE'])) {
    // Parsear Range: bytes=START-END
    $start = (int)$m[1];
    $end   = min((int)$m[2], $fileSize - 1);
    $length = $end - $start + 1;

    header('HTTP/1.1 206 Partial Content');
    header("Content-Range: bytes $start-$end/$fileSize");
    header("Content-Length: $length");

    // Servir chunk exacto
    fseek($fp, $start);
    while ($bytesLeft > 0 && !feof($fp)) {
        echo fread($fp, min(8192, $bytesLeft));
    }
}
```

## Inyección MPD ISO 23009-1 v17.2
Para manifiestos `.mpd`, se inyectan atributos God-Tier en vuelo:
```php
if ($mime === 'application/dash+xml') {
    $mpdContent = file_get_contents($filePath);

    // Inyectar atributos raíz DASH
    $mpdContent = preg_replace('/^<MPD/',
        '<MPD minBufferTime="PT2S" availabilityStartTime="..."
              publishTime="..." timeShiftBufferDepth="PT30S"
              suggestedPresentationDelay="PT2S"', $mpdContent);

    // Video AdaptationSet: SAP, maxWidth, maxHeight
    // SegmentTimeline: repetición infinita (r="-1")
    // startNumber: sincrónico con Epoch

    echo $mpdContent;
    exit;
}
```

## Headers de Seguridad y Stealth
```php
header('Accept-Ranges: bytes');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=3600');
header('Server: APE-STEALTH-CDN/v16');
header('Connection: Keep-Alive');
header('Keep-Alive: timeout=86400, max=100000');
header_remove('X-Powered-By');
```

## Suicide Switch (Keep-Alive Touch)
```php
// Cada vez que el proxy sirve un archivo, toca el manifest
// para indicarle al worker que hay un cliente activo
if (file_exists($manifestPath)) {
    @touch($manifestPath);
}
// Si nadie lee por 45s, el worker se auto-destruye
```

## Estructura del RAM-Disk
```
/dev/shm/ape_cmaf_cache/
└── 1198/                          # Channel ID
    ├── manifest.mpd               # DASH MPD (2KB, actualizado por FFmpeg)
    ├── master.m3u8                # HLS master playlist
    ├── media_1.m3u8               # HLS media playlist
    ├── init-stream0.m4s           # Video init segment (moov atom)
    ├── init-stream1.m4s           # Audio init segment
    ├── chunk-stream0-00015.m4s    # Video chunk (2s)
    ├── chunk-stream0-00016.m4s    # Video chunk (2s)
    ├── chunk-stream1-00028.m4s    # Audio chunk
    ├── ffmpeg.pid                 # PID del worker
    └── ffmpeg.log                 # Log de errores FFmpeg
```

## Archivo
- `/var/www/html/cmaf_proxy.php` — Servidor de segmentos (181 líneas, 6.5KB)
