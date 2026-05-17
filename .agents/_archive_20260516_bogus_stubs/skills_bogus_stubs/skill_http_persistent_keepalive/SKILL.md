---
name: Skill_HTTP_Persistent_KeepAlive
description: Forzar `Connection: keep-alive` infinito y timeout ilimitado entre cliente y servidor.
category: Network / TCP Connection
---
# 1. Teoría de Compresión y Anomalía
Los proveedores de IPTV y CDNs comerciales odian las conexiones largas porque consumen recursos de servidor (sockets). En consecuencia, configuran cabeceras `Connection: close` o Keep-Alives muy cortos (5s). Esto forza al cliente, cuando mira un partido UHD, a restablecer el saludo TCP y SSL cada 5 segundos, agregando un overhead mortal de latencia red y provocando microtartamudeos (stuttering).

# 2. Directiva de Ejecución (Código / Inyección)
Sobrecargo y sobrescribo las reglas de estado del socket. Obligamos la re-utilización perpetua del túnel HTTP para el proxy en `resolve.php` hacia el proveedor, y de Nginx hacia el usuario.

```php
// Directiva cURL de Resistencia y Aferro (PHP Provider Face):
curl_setopt($ch, CURLOPT_FORBID_REUSE, false);
curl_setopt($ch, CURLOPT_FRESH_CONNECT, false);
curl_setopt($ch, CURLOPT_TCP_KEEPALIVE, 1);
curl_setopt($ch, CURLOPT_TCP_KEEPIDLE, 120);
curl_setopt($ch, CURLOPT_TCP_KEEPINTVL, 60);
```

# 3. Flanco de Orquestación
Al obligar al proveedor IPTV a mantener el TCP abierto bajo penalización de reconexiones agresivas fantasma (Hydra), o mediante el proxy Nginx local sin matar la conexión nunca (`keepalive_timeout 86400;`), el Chunk CMAF viaja libre en una carretera previamente pavimentada (sin handshakes TCP). Latencia ridículamente baja sin dañar nada y menor esfuerzo de CPU para la Shield TV.
