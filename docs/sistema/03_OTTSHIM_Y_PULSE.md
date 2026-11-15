# 03 · OTTSHIM Y /pulse/ — al mínimo detalle

**Documento de sistema.** Autor: http-prober · Fecha: 2026-11-15 · Tarea: t92 · **Sólo lectura: no se modificó nada.**
Convención: cada afirmación lleva `archivo:línea` (o el comando con su salida). Lo que no se pudo medir está en **§11 NO COMPUTADO**, nunca como cero.

---

## 1. QUÉ ES `#EXTSHIMOTT`

### 1.1 Identidad y contrato

| Dato | Valor | Fuente |
|---|---|---|
| Nombre del tag | `#EXTSHIMOTT` | `ExtShimOtt.kt:286` (`TAG_NAME`), `:289` (`PREFIX = "#EXTSHIMOTT:"`) |
| Contrato | `ape.extshimott.v1` | `ape-shimott-emit.php:31` · `m3u8-typed-arrays-ultimate.js:9741` |
| Fichero de contrato | `contracts/extshimott_contract.json` | `m3u8-typed-arrays-ultimate.js:9741` |
| Doc de arquitectura | `docs/architecture/EXTSHIMOTT_CONTRACT.md` | `m3u8-typed-arrays-ultimate.js:9742` |
| Validador (lado Node) | `tools/quality/validate_extshimott.js` | `m3u8-typed-arrays-ultimate.js:9743` · `ExtShimOtt.kt:15` |
| Emisor en la LISTA | `tools/pulse/ape-pulse-wrap.js` | `ape-feedforward.php:90` (*«El tag `#EXTSHIMOTT:{json}` de la LISTA lo emite tools/pulse/ape-pulse-wrap.js»*) |
| Emisor alternativo | generador `m3u8-typed-arrays-ultimate.js` | `:10008` `_apeAppendExtshimottTag`, `:10026`, `:13379-13383` |
| Forma exigida | UNA línea, `#EXTSHIMOTT:{json}`, techo 4096 B | `ExtShimOtt.kt:288-289` · `ape-pulse-wrap.js:181` |
| Idempotencia | si el bloque ya trae el tag, no se duplica | `ape-pulse-wrap.js:301` (`curHasShimott`) · `m3u8-typed-array...js:10021` |

### 1.2 Cuántas veces aparece (medido en la lista servida)

Comando: pasada única sobre `/var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8` (253.967.777 B, 191.095 líneas):

```
lineas con #EXTSHIMOTT: 21224 | #EXTINF: 21224 | URLs http: 21224 | JSON invalido: 0
ids unicos: 21224 de 21224
ver: {'1': 21224}
tgt: {'ott|vlc|kod': 21224}
tags con "mp": 21224 de 21224
claves de primer nivel: {ver, id, v, hdr, tgt, mp}
claves de "v":   {c: 21224, f: 21224, w: 933, h: 933}
claves de "hdr": {ua: 21224, rf: 21224}
mp.p (patron, digitos->N) -> {'PN.N+TN': 21224}
mp.v -> {0:10229, 1:6630, 4:1007, 6:75, 2:1495, 5:661, 3:1086, 7:41}
longitud de mp.n -> {33: 20859, 34: 365}
```

**1 tag por canal, exactamente 21.224, todos `ver:1`.** Ningún JSON inválido.

### 1.3 El JSON exacto — línea real de la lista (canal `id=1`)

```
#EXTSHIMOTT:{"ver":1,"id":"1","v":{"c":"hevc","f":60},"hdr":{"ua":"Mozilla/5.0 (Web0S; Linux/SmartTV) ... WebAppManager","rf":"https://www.netflix.com/"},"tgt":"ott|vlc|kod","mp":{"p":"P3.5+T7","v":0,"n":[\"d854d32401d49800\",\"ldxlg5f05e23\",...,\"hdr-P3-0\",3,0,0,32]}}
```

### 1.4 Campo por campo: qué significa y **quién lo lee**

| Campo | Ejemplo real | Significado | Quién lo lee |
|---|---|---|---|
| `ver` | `1` | versión del contrato (`ape.extshimott.v1`) | Parser `ExtShimOtt.kt:278-289`; validador `validate_extshimott.js` |
| `id` | `"1"` | identidad del canal; el contrato la ancla al `tvg-id` | `ape-pulse-wrap.js:450` (*«tvg-id crudo: el contrato ancla ahí la identidad»*), regex `:182`; usado como clave del mapa `id→objeto` en `ExtShimOttBridge.kt:41` |
| `v.c` | `"hevc"` | códec declarado de la variante | `ExtShimOttApply.kt` (traducción a `SettingsApplier`); `SettingsApplier.kt:84` lo imprime en el panel |
| `v.f` | `60` | fps declarados | ídem |
| `v.w` / `v.h` | *ausentes en 20.291 de 21.224* | resolución declarada; **sólo el 4,4 % de los canales la trae** | ídem |
| `hdr.ua` | `Mozilla/5.0 (Web0S…)` | **User-Agent que debe usar el player** para ese canal | `ExtShimOttApply` → allowlist de `SettingsApplier` (no es un setting de Android: va a prefs de la app, `ExtShimOttBridge.kt:20-21`) |
| `hdr.rf` | `https://www.netflix.com/` | **Referer** que espera el proveedor | ídem |
| `tgt` | `"ott\|vlc\|kod"` | a qué dialectos va dirigido el bloque. **Constante en los 21.224** | `ShimOttTap.routeOf`, invocado desde `ExtShimOttBridge.kt:16` |
| `mp.p` | `"P3.5+T7"` | perfil + tier de la proyección (`P<n>.<mitad>+T<n>`); patrón `PN.N+TN` en 21.224/21.224 | `ape-pulse-wrap.js` (payload, `:262`) · parcheado por `ape-6k-premium.sh:107-137` |
| `mp.v` | `0` (más común: 10.229) | versión/variante de la proyección; **8 valores distintos** | `ape-profile-project.js:1019-1046` (reconstruye desde `LIGHT_SHIM_TAG`) |
| `mp.n` | array de 32-34 elementos mixtos | **linaje de proyección**: hashes, ids, timestamp ISO, contadores, IPs, UAs de terceros, el nombre decorado del canal, etc. | `ape-profile-project.js:78` (*«deja en cada #EXTSHIMOTT la referencia `mp` que permite reconstruir las…»*) |

**Nota honesta sobre el resumen del encargo:** el encargo describía `"v":{"c","f"}` y `"mp":{"p","v":2,"n":[...]}`. Medido: `mp.v` vale `2` en 1.495 de 21.224; el valor dominante es `0`. Y `v` **sólo** lleva `c` y `f` en 20.291 canales (los otros 933 añaden `w`/`h`). El resto de campos del contrato (`a`, `flt`, `cad`, `dev`, `ott`, `vlc`, `kod`) **no aparecen en esta lista**: existen en los fixtures del parser (`ExtShimOtt.kt:923-931`) pero el emisor de la LIGHT no los emite.

---

## 2. EL TAG EN LA PRÁCTICA: QUIÉN LO HONRA Y QUIÉN LO IGNORA

### 2.1 La regla normativa

**RFC 8216 §6.3.1**: un cliente H.264/HLS **debe ignorar** las etiquetas que no reconoce. `#EXTSHIMOTT` no está en el RFC: para cualquier reproductor conforme, es **una línea de comentario inerte**.

### 2.2 Quién lo lee de verdad (medido en código)

**Ningún reproductor.** Lo lee **el shim de nuestra propia APK**, que intercepta el TEXTO de la playlist antes/después del player:

```
1. ShimOttTap (dev.venice.ottshim) lee el texto y extrae cada línea #EXTSHIMOTT:{json} — no interpreta nada   [ExtShimOttBridge.kt:12-13]
2. ExtShimOttBridge parsea con el parser del contrato (ExtShimOttParser)                                       [ExtShimOttBridge.kt:14-15]
3. el shim decide el routing por `tgt` (ShimOttTap.routeOf); si `tgt` no existe, no se aplica nada              [ExtShimOttBridge.kt:16-17]
4. ExtShimOttApply traduce `dev.*` a filas `<ns> <key> <val>` -> SettingsApplier.applyDetailed (ÚNICO escritor) [ExtShimOttBridge.kt:18-21]
   `ott.*` no son settings de Android: van a preferencias de la app                                            [ExtShimOttBridge.kt:20-21]
```

Ley del contrato de operativa (citada en el propio fichero): *«este objeto NO abre apps, NO llama `startActivity`, NO cambia de canal y NO toca la reproducción. Solo escribe settings y preferencias»* (`ExtShimOttBridge.kt:23-24`), y corre en el hilo `ottshim-extshimott` (`:25`). El sink se instala al arrancar el servicio con el **mismo** `SettingsApplier` del daemon (`:47-52`) — no hay una segunda allowlist.

### 2.3 Tabla de honor

| Reproductor | ¿Entiende `#EXTSHIMOTT`? | Por qué |
|---|---|---|
| **OTT Navigator** | **NO** | No está en el RFC ni en su parser. Lo que sí ocurre es que el **shim** de la APK lee el tag del texto; OTT no se entera (`ExtShimOttBridge.kt:12-16`). `SettingsApplier.kt:84` muestra en el panel *«sin tag recibido (el shim no lo vio o no había)»*, prueba de que el valor llega por el shim, no del player |
| **ExoPlayer / Media3** | **NO** | Cliente HLS conforme: ignora etiquetas desconocidas (RFC 8216 §6.3.1). Es el dialecto que `pulse.php:763-766` etiqueta como `android` |
| **VLC / LibVLC** | **NO** | VLC lee `#EXTVLCOPT`/`#EXTHTTP`, no un `#EXT*` propietario; `pulse.php:753-759` sólo asigna dialecto `vlc` |
| **Kodi / LibreELEC** | **NO** | Igual: dialecto `kodi` por `#KODIPROP` (`pulse.php:754,760-761`), el tag es ajeno |

**Conclusión:** el tag es **metadata para nuestro shim**, no un contrato con el reproductor. Emitirlo no cambia lo que ningún player hace; lo que cambia es lo que el shim **aplica después** vía `SettingsApplier`.

---

## 3. `/pulse/` COMO RUTA

### 3.1 Parámetros

| Param | Dónde se lee | Qué hace |
|---|---|---|
| `u=` | `pulse.php:170` | URL del upstream. **5 rechazos 400**: vacía (`:211`), >2000 B (`:212`), caracteres de control/comillas/`<>\` (`:213`), no `http(s)` (`:214`), sin host (`:216`) |
| `d=` | `pulse.php:182` | *device descriptor* en base64url: se decodifica (`:223`), tope 768 B (`:224`), `json_decode` (`:225`) |
| `m=` | `pulse.php:205` | modo: `redirect` \| `cartridge` \| `proxy`; valor inválido → modo por defecto (`:206`) |
| `p=` | `pulse.php:773` | perfil (`P0`…`P5`), mayúsculas forzadas |

**Modo por defecto y degradación** (`pulse.php:207-209`): si se pide `cartridge` y el UA **no** está en la allowlist, se degrada a `proxy` (`forcedStrict`).

### 3.2 Allowlist de cartridge — el código y la documentación se contradicen

```
pulse.php:203   $cartridgeCapable = preg_match('/(^|\s|\/)(VLC|LibVLC|Kodi|LibreELEC)(\s|\/|$)/i', $uaPulse);
pulse.php:96-99 y :197   comentarios que LISTAN ExoPlayer / OTT Navigator / TiviMate / Smarters como capaces
ape-pulse-wrap.js:411-413 comentario que repite esa lista
```

**Manda el código** (verificado con la herramienta de ruta, que cita `pulse.php:96-99 vs 104`): allowlist real = **VLC, LibVLC, Kodi, LibreELEC**. Un UA `OTT Navigator/1.7.3.3` nunca obtiene cartridge → `modo_por_defecto = proxy`, `cartridge_capable = false`.

### 3.3 El `d=` — qué es de verdad (hallazgo)

El `d=` de la lista servida **no lo manda el device: lo escribe el wrapper**, y lo rellena con la resolución del **STREAM**, no del aparato:

```js
ape-pulse-wrap.js:356   const dd = { t: 'generic', s: 'unknown', r: 2048 };
ape-pulse-wrap.js:357-359   dd.w = w;  dd.h = h;  dd.f = fps;      // desde cur.truth (STREAM-TRUTH)
ape-pulse-wrap.js:345   "Solo w/h/f, que es observacion directa del STREAM-TRUTH"
ape-pulse-wrap.js:347-348  se aplica ANTES del early-return de ALREADY (si no, no llegaba nunca)
ape-pulse-wrap.js:361   base64 SIN relleno (replace(/=+$/, ''))
ape-pulse-wrap.js:363   si la URL no trae ?d= -> counters.dRebuiltMiss
```

Y `pulse.php` lo interpreta como **capacidad del device**:

```php
pulse.php:232-241  $device = [ soc<=s, max_h<=h, max_w<=w, fps<=f, hdr, profile<=p, buffer_ms, player<=t ]
```

**Dos defectos concretos, medidos:**
1. **`r` (2048) se escribe pero NUNCA se lee.** El wrapper lo emite (`wrap.js:356`) y el mapeo de `pulse.php:232-241` no lo recoge (sólo `s,h,w,f,hdr,p,buffer_ms,t/player`).
2. **Confusión stream/device:** el campo que `pulse.php` llama `max_w`/`max_h`/`fps` del device lleva en realidad la resolución del **stream** inyectada por el wrapper.
   Historia del bug (comentario del propio PHP, `:227-230`): antes se leían `soc/max_h/buffer_ms/player` largos que **no existían** en el payload corto → *«Medido 2026-11-13: 17.639 pulsos con device vacío salvo 21»*. Hoy se aceptan las dos formas (`:232-241`).

Ejemplo real decodificado (canal 1 de la lista servida):
`d=eyJ0IjoiZ2VuZXJpYyIsInMiOiJ1bmtub3duIiwiciI6MjA0OCwidyI6MTkyMCwiaCI6MTA4MCwiZiI6NjB9`
→ `{"t":"generic","s":"unknown","r":2048,"w":1920,"h":1080,"f":60}`

---

## 4. LA CADENA COMPLETA DE UNA REPRODUCCIÓN

```
player ──GET /pulse/<id>.m3u8?u=<upstream-urlencoded>&d=<b64url>&p=Pn&m=…──► nginx
   │
   ├─ 1. valida u (5 reglas, pulse.php:211-216)  ─── fallo → 400 texto plano
   ├─ 2. decodifica d (base64url ≤768 B, json, :223-241)  ─── fallo → device vacío, sigue
   ├─ 3. sanitiza id (:218-219): [A-Za-z0-9._-], ≤64; si queda vacío -> 'ch'+sha256(u)[0:10]
   ├─ 4. comprueba allowlist de host del upstream + canary (:276)
   ├─ 5. dialecto por UA (:753-766): vlc | kodi | android(exo/ott)
   └─ 6. fetch del upstream con UA de player (:134) ─► 302 al host del CDN (con token)
                                                     └─► sigue y normaliza el cuerpo (:392-401)
                                                     └─► clasifica el cuerpo en 5 facetas (:403-420+)
   └─ 7. sirve el manifest con URIs ya absolutas/reescritas
```

**Medido hoy (2026-11-15, 15:41-15:47 UTC), comando literal en §12:**

| Medida | Valor |
|---|---|
| `/pulse/1.m3u8` (caliente, 5 muestras) | `http=200` · **0,0272 / 0,0454 / 0,0457 / 0,0550 s** · cuerpo **3.223 B** |
| primera petición (fría) | `0,979 s` (compilación PHP + DNS + upstream) |
| manifest upstream sin caché intermedia | `0,344 s` con UA (302) |
| **manifest 6,8–7,0 ms / 822 B que cita el encargo** | **NO REPRODUCIDO.** Hoy: 27–55 ms y **3.223 B** (cuerpo más grande ⇒ otro trabajo). Se reporta lo medido, no lo citado |
| **primer segmento 192,6–220,3 ms** | **NO COMPUTADO hoy**: el segundo salto devolvió **0 bytes** (§6); sin manifest no hay segmento que medir |

---

## 5. EL BUG DEL SSL — corregido de línea

**El defecto es real, pero las líneas del encargo (`pulse.php:403-404`) NO son las del SSL.** Lo que hay en `pulse.php:403-404` es un **docblock** de la clasificación multifacética del cuerpo (`«Clasificacion MULTIFACETICA del cuerpo que devuelve el upstream»`).

Las líneas reales:

```php
pulse.php:142-143   CURLOPT_SSL_VERIFYPEER => false, /* mismo criterio que el resto de pulse */   (helper de fetch)
pulse.php:143       CURLOPT_SSL_VERIFYHOST => 0,
pulse.php:549-550   CURLOPT_SSL_VERIFYPEER => false,   (camino de proxy)
pulse.php:550       CURLOPT_SSL_VERIFYHOST => 0,
```

(El fichero tiene **786 líneas**; verificado con `wc -l` y por las lecturas de 392-417 y 205-244.)

**Impacto real y su límite:**
- Afecta **sólo al manifest** (y a lo que pase por `pulse_fetch`): se acepta cualquier certificado del proveedor ⇒ un MITM en la ruta VPS↔proveedor puede inyectar líneas en el manifest.
- **Los segmentos no pasan por ahí**: van absolutos y directos al CDN (por eso `d=` no los cubre y el observer no los ve si no van por `/seg/`).
- Severidad según la herramienta de ruta: **alta** (`TLS_UPSTREAM_SIN_VERIFICAR`, fuente `pulse.php:403-404` — la herramienta cita esa línea; el código está en 142-143 y 549-550, que es lo que manda).

---

## 6. EL 302 Y EL UA — medido hoy

```
1) manifest upstream SIN User-Agent        -> http=000  t=0,188 s  bytes=0     (conexión no completada)
2) manifest upstream CON UA de player      -> http=302  t=0,345 s  bytes=0
3) cabeceras del 302:
     HTTP/1.1 302 Found
     Location: http://10472550.qd08v.cc/live/2RHAVYWB/SDXH4MYV/1.m3u8?token=<REDACTADO>
     Access-Control-Allow-Origin: *
4) siguiendo el redirect                  -> final_host=10472550.qd08v.cc  bytes=0
5) SEGMENTO (no se pudo: el paso 4 devolvió 0 bytes)
6) el mismo path contra el host ORIGINAL   -> http=404  t=0,173 s
```

- **El gate del UA está confirmado**: sin UA no hay ni respuesta HTTP (`000`, conexión abortada).
- **El 302 apunta a `<num>.qd08v.cc` con `?token=`**: forma exacta medida arriba.
- **NO se pudo reproducir hoy** que el segmento baje del host del redirect sin token y que el original dé **401** (el segundo salto devolvió 0 bytes y el original dio **404**, no 401). Se deja como **NO COMPUTADO en esta ventana**; lo citado en el encargo (401 / segmento sin token) es medición previa, no de hoy.

---

## 7. LA CADENA DE REDIRECT — forma exacta

```
http://evestv.wuitf.com/live/<user>/<pass>/<id>.m3u8          (host de la lista; user/pass idénticos por host)
        │  302  (sólo con UA de player; sin UA: 000)
        ▼
http://<num>.qd08v.cc/live/<user>/<pass>/<id>.m3u8?token=<opaco>
        │  (hoy: 0 bytes)
        ▼
  segmento  .../hlsr/<base64>/...      ← forma citada en el encargo; NO OBSERVADA HOY (0 bytes)
```

Lo que **sí** está medido hoy: el host del 302 es `10472550.qd08v.cc`, la ruta conserva `/live/<user>/<pass>/<id>.m3u8` y añade `?token=`. La forma `/hlsr/<base64>/…` del segmento y el 401 del host original quedan **NO COMPUTADOS** (§11).
Fuente del patrón general (host `*.qd08v.cc` + token + `/hlsr/<b64>`): `qoe_server_side_observer.lua:70-82` describe el mapeo `segmento -> /seg/<b64url(URL del proveedor)>` y menciona la ruta `/hls/<hash>/<id>_<n>.ts`.

---

## 8. EL WRAPPER `ape-pulse-wrap.js`

### 8.1 Qué escribe y qué NO

| Escribe | Fuente |
|---|---|
| URL del canal reescrita a `https://…/pulse/<id>.m3u8?u=…&d=…` (vía `ApeUrlBuilder.build`) | `:394-405`, `:410` |
| **1 línea `#EXTSHIMOTT:{json}` por canal**, después de las APE/EXTHTTP y **antes** de la URI | **`:516-520`** (condición + escritura + contador), comentario de posición `:512-515`, prefijo `:179` |
| 8 líneas `#EXT-X-APE-*` por canal (declaraciones de mejora) | `:428` (`OWNER_DECLARATIONS`, 8 entradas) · `:510` (inyección) |
| `d=` reconstruido con `{t,s,r,w,h,f}` del STREAM-TRUTH | `:350-367` |
| Estado en JSON (`statePath`), si se pide | `:574` |

| **NO** escribe / descarta | Fuente (líneas verificadas una a una) |
|---|---|
| **Elimina toda línea `#EXT-X-I-FRAME-STREAM-INF`** → se pierde el trick-play | **`:463-469`**: comentario *«[STRICT-PARSER] … rompe players estrictos (medido: "Couldn't match URI=…" en Fire Stick)»* + `if (line.startsWith('#EXT-X-I-FRAME-STREAM-INF')) { counters.dropped_iframe++; return; }` |
| **Descarta el sufijo `\|Header=val`** — pero es deliberado y está justificado | **`:502-508`**: regex `^(\s*)(https?:\/\/[^\s\|"'<>\\]+)([\s\S]*)$` aisla la URL; el motivo está escrito: *«si se toma la línea entera, /pulse la rechaza con 400 ("u con caracteres invalidos") y el canal queda muerto»* (`:503-505`) |
| No vuelve a envolver URLs ya envueltas (`/pulse/`, `/url2/`) | `ALREADY` definido en **`:56`**; early-return en **`:372`** (y se aplica **después** de `rebuildDeviceData`, `:371-372`) |
| No inventa `flt` (cadena de filtros) desde la cadena de filtros del canal | `:174` (*«`flt` en particular NO se copia de la cadena de filtros»*) |
| No emite `#EXTSHIMOTT` desde PHP nunca (sería duplicado) | `ape-shimott-emit.php:11` |

**Dos defectos de contabilidad/lógica, con línea exacta:**

1. **`counters.declared` suma 1 por canal aunque escriba 8 líneas** → `:510` escribe el bucle completo de `OWNER_DECLARATIONS` (8) e incrementa el contador **una vez** (en la misma línea). El JSON de salida subestima ×8.
2. **Flag pegajoso `curHasDecl`**: se declara a nivel de módulo (`:440`), se activa al ver `#EXT-X-APE-ENHANCE-STATE` (`:470`) y **no se resetea al cambiar de canal** — el reset de bloque enumera `exthttp, truth, hasVlcOpt, hasKodiProp` y **no incluye `curHasDecl`** (`:456-457`). Consecuencia: **a partir del primer canal que trae ese tag, ningún canal posterior recibe las 8 declaraciones** (`:510` queda desactivado por `!curHasDecl`).

**Nota de método (importante para que este doc no envejezca mal):** las herramientas de auditoría del repo (`ape_wrap_audit`, `ape_pulse_route`) citan líneas de **otra revisión** de estos ficheros — p.ej. dan el drop de I-FRAME en `:210-213` (hoy son `headerOf`/`shimottHeader`) y el SSL en `pulse.php:403-404` (hoy es un docblock). **En este documento manda la línea leída en el fichero actual**; cuando discrepaban, se verificó abriendo la línea y se cita la del fichero de hoy (587 líneas el wrapper, 786 `pulse.php`). Las cifras de comportamiento de esas herramientas sí se usan (son deterministas), pero **no sus números de línea**.

**Límite declarado por la propia herramienta:** la auditoría *simula* la semántica del wrapper; el cuerpo real depende de `ApeUrlBuilder` (no integrado) para construir las URLs.

### 8.2 Relación con la allowlist de cartridge

- El wrapper **pide** `cartridge` por defecto (`:75`, `mode === 'redirect' ? 'redirect' : 'cartridge'`) y **declara** que lo sirven VLC/Kodi/ExoPlayer/OTT/TiviMate/Smarters (`:411-413`).
- `/pulse/` **sólo** lo concede a `VLC|LibVLC|Kodi|LibreELEC` (`pulse.php:203`) y degrada el resto a `proxy` (`:207-209`).
- ⇒ **Todo lo que no sea VLC/Kodi/LibreELEC recibe `proxy`, no `cartridge`**, aunque la lista pida cartridge. Para OTT Navigator (nuestro caso) el modo efectivo es **proxy** (verificado con la herramienta de ruta: `modo_pedido=redirect → respuesta_esperada=302`; `cartridge_capable=false`).

---

## 9. QUÉ MIDE EL OBSERVER (`qoe_server_side_observer.lua`)

Corre en **`log_by_lua`** ⇒ fase posterior a la respuesta: **cero impacto** en el stream (`:20` *«PASSTHROUGH… ZERO impact on request»*; `:145` *«AUTOPISTA: log_by_lua phase → ZERO impacto»*). Estado en `ngx.shared.qoe_metrics` (`:22`, `:30`).

| Métrica | Fórmula / mecanismo | Línea |
|---|---|---|
| `VST_proxy` | (ts del primer segmento) − (ts del manifest) por sesión | `:10`, `:117-120` (manifest deja ts con **TTL 30 s**), `:164-177` |
| `rebuffer_proxy` | huecos entre segmentos consecutivos > 15 s | `:11`, `:194-199` |
| `bitrate_proxy` | `body_bytes_sent / upstream_response_time` | `:12`, `:206` |
| latencia de upstream por segmento | suma+cuenta por worker | `:212` |
| **cable HDCP-Adaptive** | si `VST_proxy > 3000 ms` **3 veces seguidas** en el mismo canal → POST de incidente | `:16`, `:177-188` |

Sólo procesa URIs `is_manifest` o `is_segment` (`:55-57`), incluyendo el proxy `/seg/` (`:55`) y `.ts`/`.m4s` (`:56`).

### 9.1 El límite, y está en la config

- **Sólo ve tráfico PROXEADO.** Un segmento servido *provider-direct* no genera línea en el log del VPS ⇒ el observer no ve ni VST ni rebuffer ni bitrate de ese canal. *«en provider-direct el VPS no ve un segmento»*.
- Y hay un detalle de despliegue medido en la config: el observer **no** puede declararse en `/pulse/` ni en `/seg/` porque esos locations hacen `rewrite … last` y **re-machean**, perdiendo el `log_by_lua` (`/etc/nginx/sites-enabled/default:131-142`, comentario del propio repo). Se declara en la location re-macheada.
- Magnitud relativa hoy: **`/seg/` = 924 peticiones** frente a **`/pulse/` = 1.889** en el mismo log (§10). Es decir: el observer tiene señal de los manifests y de los segmentos que pasan por el proxy, y **ninguna** de los que van directos al CDN.

---

## 10. LO MEDIDO HOY, CON NÚMEROS

Ventana: `/var/log/nginx/playlist_access.log`, **15/Nov/2026 00:00:01 → 15:44:03 UTC**, 31.360 líneas.

```
grep -c '/pulse/' <log>  -> 1889      (antes de mis propias sondas; 1894 después: mis 5 curls suman)
grep -c '/seg/'   <log>  -> 924
canales distintos servidos por /pulse/: (ver top)
```

**Top de canales por peticiones `/pulse/`** (mismo log):

| canal | peticiones |
|---|---|
| 1312008 | 711 |
| 27 | 395 |
| **1256710** | **163** |
| **15421** | **119** |
| **1414181** | **90** |
| 548065 | 34 |
| **548071** | **32** |
| 548060 | 26 |
| 1 | 22 |
| 15419 | 19 |
| 1174213 | 17 |
| 368603 | 13 |

**Contraste con el encargo:** el encargo dice *«el device pide /pulse/ 569 veces; canales 1256710 (155), 15421 (118), 1414181 (89), 548071 (31), 548065 (29)»*.
Medido hoy: **1.889** peticiones totales y **163 / 119 / 90 / 32 / 34** para esos mismos canales.
**Mismo orden, mismos canales, cifras ligeramente mayores** ⇒ el encargo fotografió una ventana anterior del **mismo** log. La diferencia (569 vs 1.889) es de **ventana**, no de fuente: `NO COMPUTADO` cuál era exactamente esa ventana.

---

## 11. NO COMPUTADO (explícito)

| Item | Razón |
|---|---|
| **Manifest 6,8–7,0 ms / 822 B** (cifra del encargo) | No reproducido. Hoy: 27–55 ms en caliente y **3.223 B**. Con otra ventana y otro tamaño de cuerpo no es comparable |
| **Primer segmento 192,6–220,3 ms** | El segundo salto devolvió **0 bytes** hoy; sin manifest no hay segmento. No se inventa |
| **Forma `/hlsr/<base64>/…` del segmento** | No observada hoy (misma causa) |
| **401 del host original** | Medido hoy **404**, no 401. El 401 es cita previa, no medición de hoy |
| **Ventana exacta de los 569 pulsos** | Sólo tengo el log completo del día (1.889). La ventana del encargo no está identificada |
| **`v.w`/`v.h` en los 20.291 canales que no los traen** | El tag no declara resolución para ellos; no hay dato que leer |
| **Efecto real del tag en cada player** | No se ejecutó cada player contra una lista con el tag (exigiría manipular listas servidas: prohibido aquí). La afirmación «lo ignoran» se apoya en RFC 8216 §6.3.1 + el hecho medido de que el único lector es nuestro shim |
| **MITM explotable en producción** | El defecto TLS está en el código (`pulse.php:142-143`, `549-550`); no se intentó ningún ataque |

---

## 12. COMANDOS LITERALES USADOS

```bash
# 1) identidad y conteo del tag en la lista servida (sólo lectura)
ssh root@178.156.147.234 "ls -l /var/www/lists/*LIGHT*.m3u8"
#   -> APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8  253.967.777 B
#   (script por stdin en /tmp/t92_tag.py)
ssh root@178.156.147.234 "python3 /tmp/t92_tag.py"
#   -> 21224 tags / 21224 EXTINF / 21224 URLs / 0 JSON invalido / ids unicos 21224
#   -> claves: ver,id,v,hdr,tgt,mp · v.w/v.h sólo en 933 · mp.v -> 8 valores

# 2) distribución de mp y bloque real de un canal
ssh root@178.156.147.234 "python3 /tmp/t92_mp.py"
ssh root@178.156.147.234 "python3 /tmp/t92_block.py"

# 3) cadena 302 / UA / tiempos (sólo GET y HEAD)
ssh root@178.156.147.234 "bash /tmp/t92_chain.sh"
#   sin UA -> http=000 t=0.188 · con UA -> http=302 t=0.345
#   Location: http://10472550.qd08v.cc/live/2RHAVYWB/SDXH4MYV/1.m3u8?token=<REDACTADO>
#   siguiente salto -> bytes=0 · original -> 404

# 4) /pulse/ servido por el VPS, 5 muestras
ssh root@178.156.147.234 "for i in 1 2 3 4 5; do curl -s -o /dev/null -m 20 -A 'OTT Navigator/1.7.3.3' \
  -w 'pulse http=%{http_code} total=%{time_total} bytes=%{size_download}\n' \
  'https://iptv-ape.duckdns.org/pulse/1.m3u8?u=…&d=eyJ0IjoiZ2VuZXJpYyIs…'; done"
#   -> 200 / 0.979 s (fría) y 0.055 / 0.045 / 0.046 / 0.027 s · 3.223 B

# 5) logs
ssh root@178.156.147.234 "head -1 /var/log/nginx/playlist_access.log; tail -1 /var/log/nginx/playlist_access.log"
ssh root@178.156.147.234 "grep -c '/pulse/' /var/log/nginx/playlist_access.log"   # 1889
ssh root@178.156.147.234 "grep -c '/seg/'   /var/log/nginx/playlist_access.log"   # 924
ssh root@178.156.147.234 "grep -o '/pulse/[A-Za-z0-9][A-Za-z0-9._-]*' /var/log/nginx/playlist_access.log \
  | sed 's#/pulse/##' | sort | uniq -c | sort -rn | head -12"

# 6) location de /pulse y por qué el observer no va ahí
ssh root@178.156.147.234 "grep -n 'pulse' /etc/nginx/sites-enabled/default | head -12"

# 7) semántica de la ruta y del wrapper, por las herramientas que citan línea
#    (ape_pulse_route y ape_wrap_audit: salidas pegadas en §3, §5 y §8)
```

**Garantía de no-mutación:** no se escribió en el VPS; los scripts auxiliares se crearon en `/tmp` (`t92_tag.py`, `t92_mp.py`, `t92_block.py`, `t92_chain.sh`) y sólo leen. No se tocaron listas servidas, ni `pulse.php`, ni el wrapper, ni nginx.
