---
description: Procedimiento estandarizado para auditar y reparar bloqueos de conectividad en reproducción mediante la dupla Dynamic Extension (Frontend) + 302 Redirect (Backend Proxy).
---

# Workflow: Protocolo Maestro 302 Redirect & Dynamic Extensions (Playback Assurance)

Usa este workflow cuando un proveedor iptv completo (Dream4K, KemoTV) se quede pensando indefinidamente (Infinit Loading) pero sin reportar error de texto plano, y la reproducción opere bajo la sombrilla del proxy `resolve_quality_unified.php` (`mode=200ok`).

## Paso 1: Auditoría de Extensión HLS en Frontend
1. Extrae de la lista M3U8 fallida, la cadena oculta dentro de la etiqueta `url=`.
2. Verifica su terminación. ¿Termina con `.m3u8`?
3. Si la URL enviada al proxy termina con `.m3u8` y falla, significa que el proveedor detesta (o bloquea vía CDN) el punto de finalización `.m3u8` nativo. 
4. **Acción a Tomar:** Modifica `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`, busca la función constructora de credenciales y agrega una inyección forzada de `dynamicExt = ".ts"` para los Hostnames/BaseURLs reportados del servidor infractor.

## Paso 2: Auditoría del Blindaje Proxy 302 Redirect en Backend
1. Si el Frontend ya manda la URL como `url=.....ts`, realiza un `curl.exe -k -i -L` hacia el proxy (por ejemplo: `curl -I "https://iptv-ape.duckdns.org/resolve_quality_unified.php?...url=...123.ts"`).
2. Lee los cabezales (Headers) del resultado del curl.
3. Si el script PHP devuelve un documento `text/plain` y se lee `#EXTM3U`, significa que **EL PROXY ESTÁ ROTO** y no cumple con la regla de Escape L7.
4. **Acción a Tomar:** Abre `resolve_quality_unified.php` e inyecta la válvula de escape TS en la sección final antes de la impresión del HLS inline:
   ```php
   $extension = strtolower(pathinfo(parse_url($best_quality_url, PHP_URL_PATH) ?? '', PATHINFO_EXTENSION));
   if ($extension !== 'm3u8') {
       header("Location: " . $best_quality_url, true, 302);
       exit;
   }
   ```
5. Realiza un push por SCP a `/var/www/html/` en el VPS.

## Paso 3: Evitación del "ADN Corrupto" (Base64 Bypass)
1. Verifica siempre en el Backend que el proxy reciba la URL primariamente vía `$origin_url = urldecode($_GET['url'] ?? '');`.
2. Prohíbe cualquier bloque condicional que detenga y aborte la carga si falla un algoritmo Base64 redundante, a menos que el parámetro `url=` no exista del todo.

### 🏁 Certificación
Refresca la UI vaciando caché con F5/Control+F5. Genera de nuevo (revisa que el JSON de respuesta contenga los dominios actualizados). Sube a OTT Navigator. El player ahora consumirá el `.ts` redirigido y el playback iniciará a los pocos milisegundos.
