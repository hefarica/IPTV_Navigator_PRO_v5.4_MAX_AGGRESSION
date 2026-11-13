# EL SISTEMA PIDE 6K SOBRE UN 720p — y el `SOURCE=` está mal · 2026-11-13

**Corrección del rumbo de toda la sesión.** El operador dijo: *«se lo pide al VPS y al sistema que estamos haciendo para que lo emule»*. Lo comprobé. **El sistema sí pide. Y lo que pide está mal calculado.**

---

## 1 · El sistema SÍ funciona, y sirve 818 líneas

Contrato descubierto midiendo (no leyendo):

```
GET /pulse/                     → 404
GET /pulse/1.m3u8               → 400   (exige u=)
GET /pulse/<nombre>.m3u8?u=<url codificada>  → 200 · 50.853 B
```

Y lo que entrega:

```
#EXT-X-APE-URL2-CARTRIDGE:1;PROFILE=P3;LINES=818;MODE=MASTER;EVERYTHING_IN_URL
#EXT-X-APE-URL2-DIALECT:vlc
#EXT-X-APE-URL2-DEVICE:SOURCE=ua-inferred;SOC=vlc;RAM_MB=4096;MAX_H=2160;FPS=60;HDR=hdr10;SEED=10e636889d6f288d
#EXT-X-APE-CRYSTAL-6K:OPT-IN-ACTIVE;PROFILE=P3.5;BASE=P3;RES=5760x3240;CODEC=hvc1.2.4.L183.B0
#EXT-X-APE-CRYSTAL-6K-MODE:EMULATED;SOURCE=1920x1080;TECHNIQUE=fhd_upscale_ai_sr_3x;RATIO=3.00x
#EXT-X-APE-CRYSTAL-6K-TRUTH:DECLARED_ENHANCEMENT;NOT_SOURCE;DOWNSCALE_FORBIDDEN
```

**El dialecto y el dispositivo se infieren del User-Agent** (`SOURCE=ua-inferred;SOC=vlc`). Eso es real y funciona.

## 2 · El defecto: la fuente declarada no es la fuente real

Lo que el mismo canal entrega, medido por el decodificador del televisor mientras se reproduce:

```
c2.amlogic.avc.decoder · video/avc · 1280x720
```

Y lo que el manifiesto declara:

| Campo | Declarado | Real (medido) | |
|---|---|---|---|
| `SOURCE=` | **1920x1080** | **1280x720** | ❌ |
| `RESOLUTION=` | **5760x3240** (6K) | 1280x720 | ❌ |
| `CODECS=` | `hvc1.2.4.L183.B0` (HEVC L6.1) | `video/avc` (H.264) | ❌ |
| `TRUTH:` | `DECLARED_ENHANCEMENT;NOT_SOURCE` | — | ✅ honesto |

**El truth-guard está bien puesto**: dice que el 6K es una *declaración*, no la fuente. Pero **se apoya en un `SOURCE=` que es falso**: declara 1080p cuando la fuente es 720p. Todo lo que se deriva de ahí — el perfil P3.5, el `RES=5760x3240`, el nivel `L183` — hereda ese error.

**Y `L183` = Level 6.1**, el nivel de 8K, declarado sobre un H.264 de 720p. Eso es exactamente lo que la Ley Cardinal 1 y el GOLDEN RULE del repo prohíben: *«declarar un codec/nivel que el decoder no soporta»*.

## 3 · El `SOURCE=` es una inferencia, no una medición

El manifiesto dice `SOURCE=ua-inferred` para el **dispositivo**. Para el **canal**, `SOURCE=1920x1080` aparece sin etiquetar de dónde sale. Y no hay ninguna sonda que lo haya medido: el valor real es 720p.

**Ese es el arreglo concreto y en nuestro control:**

> **El `SOURCE=` tiene que ser MEDIDO o declararse `UNKNOWN`. Nunca asumido.**

Un `ffprobe` de un segmento da `width`/`height`/`codec` reales. Con eso, el perfil se elige sobre la verdad, y el 6K emulado se calcula sobre 720p en vez de sobre un 1080p inventado.

## 4 · Segundo defecto: el wrapper sirve caché cuando el upstream falla

Medido en 6 intentos seguidos con el UA de OTT Navigator:

```
6/6 → 502
```

Y el proveedor directo, por UA:

```
VLC 3.0.20     → 405        OTT Navigator → 401
sin UA         → 405        TiviMate      → 401
                            ExoPlayerLib  → 401
                            Lavf/ffmpeg   → 401
```

**Las credenciales de esta prueba están rechazadas o esta IP está bloqueada.** Y sin embargo `/pulse/` devolvió **200 con 50.853 B** de metadatos: **sirve el cartucho de metadata aunque el upstream falle.**

**Implicación honesta:** el manifiesto que el sistema entrega **no prueba que el vídeo se pueda ver**. Declaración y disponibilidad son cosas distintas, y el wrapper las desacopla.

**Y por eso no puedo diagnosticar la reproducción exacta del operador desde aquí**: su OTT usa credenciales que funcionan; las mías no.

## 5 · Tercer defecto: el sistema no está en el camino de su reproducción

```
/prisma/api/ape-last.php → ok:true, última actividad 9/11/2026, last_age_s = 346.773 (4 días)
/live/1.m3u8 · /live/2.m3u8 · /live/22198.m3u8 · /live/242288.m3u8 → 404 (todos)
```

**El último evento que el sistema registró fue hace 4 días.** Si OTT pasara por el VPS, esa marca estaría fresca. **La reproducción del operador no pasa por el sistema**, y por eso nada de lo que hay en la metadata le llega.

Y la lista local `downloaded_list_4K.m3u8` (220 MB) apunta a `https://iptv-ape.duckdns.org/live/N.m3u8`, que **da 404 para todos los canales**. Es un artefacto muerto: no es la lista que el televisor usa.

## 6 · Lo que esto deja como trabajo real, en orden

| # | Defecto | Arreglo | En nuestro control |
|---|---|---|---|
| 1 | `SOURCE=` inventado (1080p sobre 720p real) | medirlo con `ffprobe` de un segmento, o `UNKNOWN` | **SÍ** |
| 2 | `RESOLUTION=5760x3240` + `L183` sobre 720p | derivarlos del `SOURCE` medido | **SÍ** |
| 3 | La lista apunta a `/live/` que da 404 | republicar con la ruta viva (`/pulse/…`) | **SÍ** |
| 4 | Las credenciales del proveedor de prueba no valen | es del operador; desde aquí no se arregla | no |
| 5 | El wrapper sirve metadata con upstream caído | marcar el manifiesto como `STALE` cuando el fetch falla | **SÍ** |

**Los puntos 1, 2, 3 y 5 son arreglos concretos en el generador y en `pulse.php`.** Ninguno requiere tocar el televisor del operador.

## 7 · Y la respuesta corta a «qué le pasa a la imagen»

**Se ve un 720p H.264 porque el canal es un 720p H.264.** El sistema lo etiqueta como 6K emulado desde un 1080p que no existe, y ese manifiesto **ni siquiera está llegando a tu reproductor**. Tres capas de distancia entre lo que se declara y lo que se ve.
