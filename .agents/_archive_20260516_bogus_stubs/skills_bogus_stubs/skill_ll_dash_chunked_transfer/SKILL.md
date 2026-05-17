---
name: Skill_LL_DASH_Chunked_Transfer
description: Explotación del Chunked Transfer Encoding L7 para Latencia Cero Real en CMAF/DASH.
category: Network / PHP Resolver
---
# 1. Teoría de Compresión y Anomalía
El buffering en IPTV ocurre porque el servidor web o el proxy PHP espera a descargar el fragmento de video de 2 segundos COMPLETO del proveedor antes de enviarlo al cliente. En deportes rápidos, acumular paquetes multiplica el retraso (delay). Para latencia cero (LL-DASH / CMAF), necesitamos que el byte que llega al resolver se envíe instantáneamente al usuario.

# 2. Directiva de Ejecución (Código / Inyección)
Se obliga la entrega Http/1.1 `Transfer-Encoding: chunked` en el backend (resolver de PHP). Anulando cualquier buffer en el medio.

```php
// Directiva Nuclear de PHP cURL (cmaf_worker.php / Resolve):
header("Transfer-Encoding: chunked");
header("Connection: keep-alive");
// En cURL:
curl_setopt($ch, CURLOPT_BUFFERSIZE, 128); // Forzar chunks enanos al vuelo
curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $data) {
    echo $data;
    ob_flush(); flush(); // Eyectar y destruir buffer
    return strlen($data);
});
```

# 3. Flanco de Orquestación
La jugada maestra de **CMAF Real**: al combinar esta directiva en Nginx/PHP con los `moof` atoms sub-milisegundo (Skill 2), ExoPlayer reproduce el video a nivel TCP casi al mismo tiempo que el proveedor satelital lo emite. Buffer cero, latencia rayo.
