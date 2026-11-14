# Hallazgos medidos — 2026-11-14

Todo lo que sigue está medido en el VPS `178.156.147.234` y en el ONN 4K
(`adb 192.168.1.3:5555`) el 2026-11-14. Sin estimaciones.

---

## 1. EL PROVEEDOR BLOQUEA EL USER-AGENT `curl`

**Esta es la causa de todos los "los canales no funcionan" de la sesión.**

| User-Agent | Resultado |
|---|---|
| `curl/8.5.0` | **HTTP 461** · 0 bytes |
| (sin UA) | **HTTP 461** · 0 bytes |
| `IPTVSmartersPro` | **HTTP 200** · 527 bytes |
| `OTT Navigator/1.7.3.3 …` | **HTTP 200** · 864 bytes · 6 segmentos |
| `VLC/3.0.20 LibVLC/3.0.20` | **HTTP 200** · 50.857 bytes (cartucho URL2) |

`pulse.php` hace:

```php
$uaPulse = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
// ...
CURLOPT_USERAGENT => $ua !== '' ? $ua : 'IPTVSmartersPro',
```

Es decir: **el pulse reenvía el UA del cliente**. Cuando el cliente es un player
real, el proveedor responde 200. Cuando el cliente es `curl`, responde 461.

**REGLA PARA TODA PRUEBA FUTURA:**
usar `-A "OTT Navigator/1.7.3.3"` (o `IPTVSmartersPro`). Con `curl` pelado se
mide un sistema roto que **no lo está**. Las pruebas que reportaron "502 en los
20 primeros canales" y "461 upstream_not_playlist" eran artefactos del cliente
de prueba, no del servidor.

---

## 2. LA CADENA COMPLETA, MEDIDA CON UA REAL

| Petición | Resultado |
|---|---|
| `GET /pulse/1312008.m3u8?u=…&d=…` | **200** · 864 B · **6 × `#EXTINF`** · 6 × `/seg/` |
| `GET /seg/<b64>` | **200** · **15.435.176 B** · ttfb 0,256 s · total **1.270 ms** · `0x47` (TS) |
| `GET /jit/playlist-calidad.m3u8` | **200** · 1.298.222.092 B |
| `GET /jit/playlist-resolver.m3u8` | **200** · 1.298.222.092 B |
| `GET /lists/APE_LISTA_1794100720046_CABLEADA.m3u8` | **200** · 1.311.467.322 B |
| Los 5 primeros canales de esa lista | **200** · 1 a 6 `#EXTINF` cada uno |

**El vídeo sale por el `/seg/` del VPS con el sync byte correcto.** El sistema
transporta.

---

## 3. EL CANARY ESTABA BORRADO (restaurado)

| Ruta | Antes | Ahora |
|---|---|---|
| `/canary` | 404 | 404 (nunca fue esa ruta) |
| `/canary.php` | 404 | 404 |
| `/prisma/api/canary-resolve.php` | **404** | **302** |

Solo quedaban backups del 4-nov. **Se restauró el bueno:**

```
canary-resolve.php.bak_20261104T135141Z -> define cr_fail: 1 · usa: 7
canary-resolve.php.bak_20261104T135400Z -> define cr_fail: 1 · usa: 7
canary-resolve.php.bak_20261104T135638Z -> define cr_fail: 1 · usa: 7   <- RESTAURADO
canary-resolve.php.bak_20261104T135934Z -> define cr_fail: 0 · usa: 6   <- INCOMPLETO
```

**Ojo con el orden:** el backup **más reciente** (`135934Z`) es el que **NO**
define `cr_fail()` y daba `500 Call to undefined function`. Los tres anteriores
sí la definen. Restaurar "el más nuevo" a ciegas rompe el endpoint.

---

## 4. EL SHIM: AHORA SIRVE EL CATÁLOGO ENTERO

| Métrica | Antes | Ahora |
|---|---|---|
| `GET /source.m3u8` con el catálogo | **0 bytes** a los 60-83 s | **600.000 B en 1 s** |
| Arranque | solo con el botón | **automático con ARA** |
| Reacción a OTT | ninguna | ticker 5 s sobre `PlaybackState` |

**La causa, medida en tres pasos:**

1. `body.string()` **ya cargaba los 1.298.222.092 B en heap** antes de comparar
   nada. Comparar `body.length` después no servía.
2. El siguiente intento (streaming si `len > 2 MB`) tampoco: nginx sirve el
   catálogo con `gzip_static`/chunked y **`contentLength()` devuelve `-1`**, que
   no es `> 2 MB`, así que volvía a caer en `body.string()`.
3. **Fix real:** `if (len < 0L || len > 2_000_000L) streamThrough(...)` —
   copia upstream → socket en trozos de 64 KB y nunca materializa.

---

## 5. EL BADGE DE UPSCALING (tres estados, con captura sobre OTT)

| Entrada | Texto | Borde |
|---|---|---|
| `1920x1080` | `1920×1080 → 3840×2160 · SIMULADA (upscale ×2.00)` | ámbar |
| `3840x2160` | `3840×2160 → 3840×2160 · REAL (nativa)` | verde |
| *(sin dato)* | `3840×2160 · salida nativa · entrada: N/D` | gris |
| salida < entrada | `… → … · REDUCIDA (downscale)` | rojo |

- **Salida:** `DisplayManager` → modo activo (hoy `id=185` → 3840×2160 @ 59,94).
- **Entrada:** no se puede leer de otra app sin root (`dumpsys media.player` da
  *Permission Denial*). Se recibe por extra `input`; si no se sabe, **`N/D`**.

Capturas: `artifacts/badge-A-simulada.png`, `badge-B-real.png`, `badge-C-nd.png`.

---

## 6. LO QUE FALLA Y NO ES CULPA DEL SISTEMA

- **Los 20 primeros canales de la lista dan 502** porque
  `evestv.wuitf.com` responde **HTTP 000** (no resuelve/conecta). Proveedor caído.
- **`/cdn/evestv.wuitf.com/…/3.m3u8` → 403 ×10** por la regla SSRF del nginx
  (`location ~ ^/cdn/(127\.|10\.|192\.168\.|…)`), correcta por diseño.
- **`CONNECT dns.google:443`, `CONNECT ip-api.com:80` → 400** en el log: alguien
  usa el VPS como proxy CONNECT. La basura binaria en el log son handshakes TLS
  enviados al puerto 80.
- **`/prisma/api/list-cablear-status.php` sin parámetros → 400
  `E_CONSULTA_AMBIGUA`**: es la validación correcta ("exactamente uno de ticket,
  ultimos o lista").

---

## 7. CÓMO REPETIR ESTA MEDICIÓN

```bash
# 1. Un canal por el pulse (SIEMPRE con UA de player)
curl -sk -A "OTT Navigator/1.7.3.3" \
  "https://iptv-ape.duckdns.org/pulse/1312008.m3u8?u=http%3A%2F%2Fline.tivi-ott.net%2Flive%2F3JHFTC%2FU56BDP%2F1312008.m3u8&d=eyJ0IjoiZ2VuZXJpYyIsInMiOiJ1bmtub3duIiwiciI6MjA0OCx3IjoxOTIwLCJoIjoxMDgwLCJmIjozMH0"

# 2. Un segmento (debe empezar por 0x47)
curl -sk -A "OTT Navigator/1.7.3.3" \
  -o /tmp/s.ts -w "http=%{http_code} bytes=%{size_download}\n" \
  "https://iptv-ape.duckdns.org/seg/<b64>"
xxd -l 4 /tmp/s.ts

# 3. El canary
curl -sk -o /dev/null -w "%{http_code}\n" -A "OTT Navigator/1.7.3.3" \
  "https://iptv-ape.duckdns.org/prisma/api/canary-resolve.php?u=<urlencoded>"
```
