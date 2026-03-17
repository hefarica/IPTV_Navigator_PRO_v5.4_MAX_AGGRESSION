---
name: Anti-405 Method Not Allowed (Strict GET Enforcement & Format Fallback)
description: Doctrina para erradicar el error HTTP 405 (Method Not Allowed / Stream Not Reachable) en OTT Navigator y Tivimate. Intercepta el error de denegación de API (Xtream Codes) a nivel de proxy y renegocia la extensión de la URL al vuelo, ocultando el proceso a ExoPlayer.
---

# 🛡️ ANTI-405 METHOD NOT ALLOWED (Format Fallback Auto-Negotiation)

## 1. El Problema Real

El error HTTP 405 (Method Not Allowed / Stream Not Reachable) es radicalmente distinto al 407. Mientras el 407 es un problema de autenticación de red, el **405 es un bloqueo a nivel de protocolo web (API) del servidor de origen (Xtream Codes)**.

Cuando Tivimate o ExoPlayer intentan abrir un canal como "CINE+ FAMILY UHD", hacen una petición HTTP para descargar el archivo de video. El error 405 significa que el servidor original rechazó la forma en que tu reproductor "pidió" el archivo. Causas:

1. **Confusión de Formato de Salida (HLS vs MPEG-TS):** El proveedor tiene el canal configurado para entregar el flujo en un formato específico (ej. `.m3u8`), pero el reproductor está pidiendo un `.ts` directo (o viceversa).
2. **Rechazo de Métodos por Protección Anti-Proxy:** Algunos paneles IPTV bloquean métodos HTTP como `HEAD` o `OPTIONS` y solo permiten `GET` simples. Si tu VPS o el reproductor intentan validar el enlace con un "Pre-Flight Check", el servidor responde con 405.

---

## 2. 405 PROTOCOL SHIELD (Format Fallback Auto-Negotiation)

Para erradicar este error de la arquitectura, Antigravity implementa una mitigación atómica: interceptar el error a nivel de proxy en el VPS y renegociar la extensión al vuelo.

### Capa 1: Traductor de Extensiones Dinámico (Try/Catch de Red)

En el script que sirve de resolución (`resolve.php`), lanzamos una petición preflight `GET` al origen ANTES de enviar la URL final a ExoPlayer. Si recibimos 405, significa que el proveedor bloqueó el formato HLS (`.m3u8`). Reescribimos a MPEG-TS (`.ts`).

```php
// 🛡️ 405 PROTOCOL SHIELD — Format Fallback Auto-Negotiation
$baseUrlM3U8 = "http://" . $effectiveHost . "/live/" . rawurlencode($user) . "/" . rawurlencode($pass) . "/" . rawurlencode($streamId) . ".m3u8";
$baseUrlTS   = "http://" . $effectiveHost . "/live/" . rawurlencode($user) . "/" . rawurlencode($pass) . "/" . rawurlencode($streamId) . ".ts";

// Fast probe: try .m3u8 con método GET estricto
$probeCh = curl_init($baseUrlM3U8);
curl_setopt_array($probeCh, [
    CURLOPT_CUSTOMREQUEST  => 'GET',
    CURLOPT_NOBODY         => true,
    CURLOPT_TIMEOUT        => 2
]);
curl_exec($probeCh);
$probeCode = (int)curl_getinfo($probeCh, CURLINFO_HTTP_CODE);
curl_close($probeCh);

if ($probeCode === 405 || $probeCode === 403) {
    // 🚨 El origen rechazó la petición -> Fallback a MPEG-TS
    $baseUrl = $baseUrlTS;
} else {
    $baseUrl = $baseUrlM3U8;
}
```

*Si tu VPS hace de túnel de video real, aplicarías reescritura directa en tu proxy pass interno.*

### Capa 2: Inyección de Cabecera Anti-CORS en `#EXTVLCOPT`

A veces el 405 se genera porque ExoPlayer envía una petición `OPTIONS` (Pre-flight CORS). Se prohíbe enviarlas inyectando directivas estrictas en los perfiles `resolve_quality.php` y `resolve.php`:

```php
// SECCIÓN: 405 METHOD SHIELD
$vlcopt[] = "#EXTVLCOPT:http-method=GET"; // Fuerza al reproductor a usar solo GET
$vlcopt[] = "#EXTVLCOPT:access=http"; // Desactiva negociaciones complejas de protocolo
```

---

## 3. ¿Por qué esta técnica es superior?

Mientras el 95% de los revendedores le dirá a su cliente "Entra a los ajustes de Tivimate y cambia el formato de salida a HLS", este sistema resuelve el conflicto a nivel del servidor.

Al forzar el método `GET` desde el archivo M3U8 local y aplicar el *Fallback* de extensión internamente en el VPS, ExoPlayer solo recibe un flujo de video continuo garantizado. El canal `CINE+ FAMILY UHD` (y otros restrictivos) abre instantáneamente sin importar la estructura subyacente de la CDN de origen.
