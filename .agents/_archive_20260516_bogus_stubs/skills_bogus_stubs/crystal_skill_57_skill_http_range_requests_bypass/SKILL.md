---
name: Skill_HTTP_Range_Requests_Bypass
description: Soporte y bypass para requerimientos HTTP 206 parciales L7 obligatorios en contenedores nativos fMP4.
category: PHP / Nginx Core
---
# 1. Teoría de Compresión y Anomalía
A diferencia del archivo M3U8 y TS tradicionales (donde se descarga de inicio a fin), la estructura fMP4 de Apple y Widevine a menudo le pide al servidor "Dame sólo los bytes 5000 al 9000" para leer la cabecera `moov` e irse rápido. Si PHP escupe el video con un 200 OK y no acepta HTTP Range (206 Partial Content), ExoPlayer asume inestabilidad y rompe la conexión en fMP4.

# 2. Directiva de Ejecución (Código / Inyección)
El motor de respuesta de `cmaf_proxy.php` debe ser entrenado neuro-matemáticamente para analizar `$HTTP_RANGE` y servir matemáticamente del offset de RAM.

```php
// Handler APE Core HTTP Range (206):
if (isset($_SERVER['HTTP_RANGE'])) {
    preg_match('/bytes=(\d+)-(\d*)/', $_SERVER['HTTP_RANGE'], $matches);
    $start = intval($matches[1]);
    $end = !empty($matches[2]) ? intval($matches[2]) : ($filesize - 1);
    header('HTTP/1.1 206 Partial Content');
    header("Content-Range: bytes $start-$end/$filesize");
    // Fseek en memoria RAM
    fseek($fp, $start);
}
```

# 3. Flanco de Orquestación
Esta skill garantiza que los clientes pesados como iOS AVPlayer (la pesadilla del IPTV) o los browsers Chromium que evalúan el Crystal UHD en la aplicación de Escritorio jamás sean rechazados. Shield TV extraerá la metadata de fragmentos CMAF en 2 milisegundos porque puede hacer saltos de aguja de `Range:` hiper específicos sin tener que devorarse un archivo de 2GB desde el byte 0.
