---
name: Skill_CURL_Piping_Infinity
description: Forzar cURL PHP `TIMEOUT: 0` para sostener pipelines eternos sin cortes 504.
category: PHP Resolver
---
# 1. Teoría de Compresión y Anomalía
El gran enemigo del Proxy M3U8 "Resolver" en el servidor VPS de APE Antigravity es que PHP, por diseño de seguridad, mata scripts (`max_execution_time: 30`) y cURL cierra conexiones en `CURLOPT_TIMEOUT` al llegar a un límite irrisorio. Cuando un humano quiere ver un canal vivo (ej. una final de la Champions de 3 horas), a los 60 segundos "se cuelga" porque PHP asesina su propia tubería con el cliente ExoPlayer.

# 2. Directiva de Ejecución (Código / Inyección)
Se prohíben absolutamente los Timeouts en los Resolvers de Calidad. PHP debe adquirir inmortalidad para mantener abierta la matriz de CMAF Chunked incesantemente hacia Nginx/Apache Piped Client o hacia el buffer stdout de FFmpeg.

```php
// Anarquía Inmortal de Conexión (PHP Resolver / M3U8 Generator):
set_time_limit(0);
ignore_user_abort(true);
ini_set('max_execution_time', 0);
curl_setopt($ch, CURLOPT_TIMEOUT, 0);       // NUNCA DEJAR DE LEER (Infinito)
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15); // PERO forzar conexión rápida inicialmente (si falla orígen, falla rápído para zap inmediato)
```

# 3. Flanco de Orquestación
Este puente de Anarquía Infinita (Skill 50) sella la "Fase 3: Transaccional TCP/HTTP L7". Hemos inyectado X-Max-Bitrate a 300M (Skill 42), ignorado adaptabilidad ABR (Skill 44) y bloqueado la estrangulación cURL. El túnel de la resolución IPTV Navigator PRO APE que envía los Fragmentos de fMP4 "Real CMAF" ahora puede mantener un juego entero de 3 horas en la NVIDIA Shield TV, a la latencia más baja de toda la internet libre, sin cierres por timeout 504 molestos.
