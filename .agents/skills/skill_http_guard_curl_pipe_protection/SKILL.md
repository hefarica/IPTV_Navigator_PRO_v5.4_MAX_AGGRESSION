---
name: Skill_HTTP_Guard_CURL_Pipe_Protection
description: Interceptor de Cabeceras cURL para impedir que HTMLs de error (403, 502) se inyecten y destruyan el pipe de FFmpeg.
category: PHP Pipeline Security
---
# 1. Teoría de Compresión y Anomalía
Cuando FFmpeg lee desde `stdin` (pipe:0) alimentado por cURL en PHP, confía ciegamente en los bytes entrantes. Si el proveedor IPTV sufre un error y en lugar de mandar video (MPEG-TS) manda una página web HTML diciendo "502 Bad Gateway", FFmpeg se atraganta procesando el texto, colapsa en un Fatal Error de Muxer, y tumba el Worker CMAF permanentemente.

# 2. Directiva de Ejecución (Código / Inyección)
Implementamos el Patrón HTTP Guard: una función que escanea el bloque inicial de la respuesta HTTP en milisegundos.

```php
// Portero HTTP L7 Anti-Basura:
curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($curl, $header) {
    if (stripos($header, 'HTTP/') === 0) {
        preg_match('#^HTTP/\d\.\d\s+(\d+)#', $header, $matches);
        if (isset($matches[1]) && intval($matches[1]) >= 400) {
            die(); // Abortar conexión L7 antes de polucionar pipe:0
        }
    }
    return strlen($header);
});
```

# 3. Flanco de Orquestación
Con The Broken Glass Doctrine en efecto, preferimos que PHP aborte y reconecte silenciosamente mediante la Skill Hydra a dejar que un error HTTP fluya a ExoPlayer asustándolo con basura de metadatos. El reproductor del Shield TV Pro sólo debe recibir Video Puro. Cero "Format Exceptions".
