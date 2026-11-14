# ADVERSARIAL — «El OttShim está cableado y funcionando»

**Fecha:** 2026-11-14 · **Rol:** abogado del diablo · **Método:** medir contra el device real y el VPS real; la prosa del código no cuenta como ejecución.
**Device:** `192.168.1.3:5555` (ONN 4K, adb) · **VPS:** `hetzner-iptv` · **Solo lectura**: no reinicié el shim, no reproduje ningún canal (habría consumido la conexión única del proveedor), no desplegué nada.

---

## 0. VEREDICTO DE LA TESIS

> «El OttShim está cableado y funcionando: escucha en 127.0.0.1:40213, la ruta `/playlist-shim.m3u8` le pasa los canales, y el operador verá la mejora al zapear.»

**FALSA en dos de sus tres cláusulas, y la tercera no está medida.**

| Cláusula | Veredicto | Artefacto |
|---|---|---|
| «escucha en 127.0.0.1:40213» | **CIERTA, pero por accidente**: el puerto lo asigna el kernel (`ServerSocket(0, …)`, `LoopbackProxy.kt:89`). No hay puerto configurado; tras cualquier rearme será otro | Health en vivo vía `adb forward` (HTTP 200, `port:40213`) + `LoopbackProxy.kt:89` |
| «`/playlist-shim.m3u8` le pasa los canales» | **FALSA**: la ruta **no existe en el motor desplegado** (404 en loopback y en público) y, en la versión del repo, reescribe **0 de 21.224** canales | `curl` → `http=404 bytes=9`; regex de `server.js:6173` contra el catálogo real → `{"urls":21224,"match_regex":0,"con_jit_live":21224,"con_jit_go":0}` |
| «el operador verá la mejora al zapear» | **NO MEDIDA y hoy imposible**: `media_segments_served=0`, `proxy_media_seen=false`, `qoe_ready=false` en el health en vivo | Health JSON (abajo) |

**Health en vivo del shim (14/Nov, vía `adb forward tcp:40213 tcp:40213` → `GET /health`), literal:**

```json
{"ok":true,"proxy_up":true,"port":40213,"restarts":0,"uptime_ms":618751,
 "last_watchdog_at":1794631888490,"qoe_ready":false,"rebuffer_detector_armed":false,
 "proxy_media_seen":false,"ceilingBps":6000000,"maxBwAdmitted":9223372036854775807,
 "ids":2048,"cache_hits":0,"cache_misses":0,"cache_hit_ratio":null,
 "miss_reason":{"absent":0,"upstream_error":0},"media_segments_served":0,"requests":335,
 "last_request_at":1794631893304,"lastCacheServeMs":0,"queued":0,"pending":0,
 "ingress_timeout_ms":300,"admit_threads":3}
```

**Corrección a la tesis, por si alguien cita un estado viejo:** `ids` **no es 0** — son **2.048**; y `requests` es **335**. Lo que sigue en cero es lo único que importa: **`media_segments_served=0` y `proxy_media_seen=false`**. 335 peticiones sin un solo segmento servido es un proxy que contesta, no un proxy que sirve.

> Nota de método: `requests` incluye mis propias consultas a `/health` (el contador sube en `ingress`, `LoopbackProxy.kt:169`). Los 335 no son todos del player. Eso no cambia el 0.

**Qué significa exactamente `ids=2048`:** el mapa solo crece en `map()` (`LoopbackProxy.kt:78-84`), y `map()` solo se invoca al reescribir una playlist (`Rewriter.kt:53,64,89,106`: variantes y segmentos). Luego **el shim sí procesó al menos una lista** y registró 2.048 URLs. Lo que no ocurrió es que el player pidiera **ni uno** de esos segmentos. Es la diferencia entre «el grifo tiene agua» y «el grifo se abrió».

**Identidad de los bytes juzgados** (SHA-256 medidos por mí):

| Artefacto | Bytes | Líneas | sha256 (16) |
|---|---|---|---|
| `ottshim/…/LoopbackProxy.kt` | 23.169 | 526 | `955c4a6f9f2a1e31` |
| `ottshim/…/AbrPolicy.kt` | 2.329 | 57 | `aa1eacd2b6f3a34d` |
| `ottshim/…/TokenBucket.kt` | 786 | 25 | `bd7de32b36ad3a41` |
| `ottshim/…/ProxyService.kt` | 5.706 | 137 | `ba7e2e1d0d44ea51` |
| `/opt/ape-jit/server.js` (**desplegado**) | 449.392 | — | `290b11030f3b6bf9…` (**0 ocurrencias de `shim`**) |
| `tools/lab/ape-jit/server.js` **en `HEAD`** | 449.392 | — | `290b11030f3b6bf9…` (**byte-idéntico al desplegado**; 0 ocurrencias de `shim`) |
| `tools/lab/ape-jit/server.js` **árbol de trabajo** | 461.967 | +250 vs HEAD | `51a9336db9b4bc01…` (aquí **sí** está la ruta, `:6160`) |
| `/opt/ape-jit/current/APE_JIT_LIST.m3u8` | 7.513.817 | 21.224 URLs | — |

---

## 1. ATAQUE 1 — «Que el shim no sirva para nada aunque escuche» → **GANA**

**Criterio que separa encendido de útil (definido antes de medir):**

| Estado | Condición medible | Hoy |
|---|---|---|
| **Encendido** | socket escuchando + `/health` responde 200 | ✅ `proxy_up=true`, 200 |
| **Útil** | ≥1 segmento de media servido **y** `proxy_media_seen=true` **y** `qoe_ready=true` | ❌ 0 / false / false |
| **Productivo** | además, el player recibe una lista que apunta al shim | ❌ la ruta no existe (§2) |

**Evidencia:**
- `media_segments_served=0`, `cache_hits=0`, `cache_misses=0`, `proxy_media_seen=false`, `qoe_ready=false`, `rebuffer_detector_armed=false` con `uptime_ms=618751` (10 min) y `restarts=0`.
- `rebuffer_detector_armed=false` ⇒ **el detector de rebuffer no está armado**; el shim no puede medir el fenómeno que justifica su existencia.
- `maxBwAdmitted = 9223372036854775807` (Long.MAX_VALUE) ⇒ **no ha aplicado ni un solo límite**: el control de caudal nunca se ha ejercitado (`AbrPolicy.kt:18-22` solo se ejecuta en `onSegment`).

**Artefacto:** health en vivo (arriba) + `AbrPolicy.kt:18-22` + `LoopbackProxy.kt:329` (`onSegment` solo tras `/seg`).
**Veredicto: GANA.** Un proxy con 0 segmentos servidos está *encendido*, no *funcionando*. La palabra «funcionando» en la tesis no está soportada por ningún contador del propio shim.

---

## 2. ATAQUE 2 — «Que el cableado rompa algo» → **GANA** (y antes: que el cableado no existe)

### 2.1 Hallazgo previo, más grave: la ruta no existe en producción

```text
$ curl -s -o /tmp/p2.txt -w "http=%{http_code} bytes=%{size_download}\n" \
    "https://iptv-ape.duckdns.org/jit/playlist-shim.m3u8?port=40213"
http=404 bytes=9
not found

$ ssh hetzner-iptv 'grep -c "playlist-shim" /opt/ape-jit/server.js'
0
$ ssh hetzner-iptv 'ls -l /opt/ape-jit/server.js; sha256sum ...'
449392 bytes · 290b11030f3b6bf944c14298f3fe8401c0f9bd773789e26afeca8bb9f8aeb492
```

El motor **desplegado** (449.392 B, sha `290b1103…`, mtime 14/Nov 03:22) **no contiene la ruta** — y aquí va una corrección a mi propia lectura inicial: **no hay deriva repo↔producción**. El fichero en `HEAD` mide **exactamente 449.392 B con sha `290b1103…`**, byte-idéntico al desplegado. Lo que ocurre es otra cosa: la ruta está en el **árbol de trabajo sin commitear** (`git diff --stat` → `+250 líneas`, 461.967 B, sha `51a9336d…`). Es decir, **el cableado está escrito y no está ni commiteado ni desplegado**. Eso no es una divergencia que tape un bug: es trabajo a medias presentado como terminado.

### 2.2 Y en la versión del árbol de trabajo, la reescritura es un no-op

El regex de `server.js:6173` exige `/jit/go/<id>?<query>`. El catálogo real usa `/jit/live/<id>/master.m3u8`, sin query:

```text
$ node -e '<regex de server.js:6173 aplicado a APE_JIT_LIST.m3u8>'
{"urls":21224,"match_regex":0,"con_jit_live":21224,"con_jit_go":0}
```

**0 de 21.224.** El endpoint devolvería el catálogo **byte a byte igual**, con la cabecera `X-APE-Catalog: shim-wired` (`server.js:6179`) proclamando un cableado que no ocurrió. Eso es peor que no cablear: es declarar cableado sin cablear.

### 2.3 Si el shim muere a mitad de reproducción

- **No hay fallback.** La URL que recibe el player es `http://127.0.0.1:<port>/source.m3u8?id=…&url=<upstream codificado>` (`server.js:6175-6176`). El upstream viaja **dentro de un query param opaco** que el player no interpreta: si el shim no contesta, el player no tiene a dónde ir. Un solo URL por canal (doctrina del repo) ⇒ **punto único de fallo nuevo**.
- **El puerto es efímero**: `ServerSocket(0, 64, 127.0.0.1)` (`LoopbackProxy.kt:89`). El watchdog rearma cada **5 s** (`ProxyService.kt:36`), pero al rearmar **el puerto cambia**. Las URLs que el player ya tiene en la mano apuntan al puerto viejo y quedan muertas hasta que se vuelva a pedir la lista al VPS (un zapeo). `ProxyService.kt:134` pone `port=0` al caer.
- **El watchdog no es un fallback**: rearma el proxy, no la reproducción. Entre la caída y el rearme hay ≥1 ciclo de 5 s (`WATCHDOG_MS=5_000`), y el nuevo puerto invalida la lista.

**Artefacto:** `LoopbackProxy.kt:89`, `ProxyService.kt:36,49-56,130-134`, `server.js:6175-6176`.
**Veredicto: GANA.** Hoy el riesgo es **latente** (nada apunta al shim porque la ruta no existe), pero el diseño sí introduce un SPOF: cuando se cablee de verdad, un reinicio del proxy mata el canal hasta el siguiente zapeo.

---

## 3. ATAQUE 3 — «Que el shim no pueda con el 4K» → **tal como está: PIERDE. Reformulado: GANA.**

### 3.1 La premisa del ataque es falsa por un factor de 8

`ceilingBps` **no son bits por segundo: son BYTES por segundo.**

- `AbrPolicy.kt:19-22`: `bps = bytes*8_000/ms` (bits/s) → `targetBps = bps*0.82` → **`ceilingBps = targetBps / 8`** (bytes/s) y `maxBwAdmitted = targetBps` (bits/s).
- `AbrPolicy.kt:46`: `ceilingBps = maxBwAdmitted / 8`.
- `AbrPolicy.kt:54`: `forceCeiling(kbps)`: `ceilingBps = kbps*1_000/8`.
- `TokenBucket` descuenta `count` bytes a `rateBps` bytes/s (`TokenBucket.kt:9-21`), y `LoopbackProxy.kt:321` le pasa `policy.ceilingBps`.

Por tanto **6.000.000 B/s = 48 Mbps**, no 6 Mbps. El 4K de la doctrina del repo son 28 Mbps de pico / 22 Mbps de media (`CLAUDE.md`, tabla «Bitrate Fallback por Resolución»). **48 > 28: el techo por defecto no recorta un 4K.**

### 3.2 Pero hay una vía real de degradación, y es peor que la del ataque

La ley de control es un **trinquete**:

1. Tras **cada** segmento servido (`LoopbackProxy.kt:329` → `AbrPolicy.kt:18-22`), `ceiling = 0.82 × velocidad medida`.
2. La velocidad medida **incluye la espera del propio throttle** (`bucket.acquire` ocurre *antes* de `out.write`, `LoopbackProxy.kt:321-324`) ⇒ si el bucket limita, el tiempo sube, la tasa medida baja, y el siguiente techo vuelve a bajar: **realimentación negativa**.
3. Cada error HTTP y cada stall corta **otro 30 %** (`AbrPolicy.kt:35-46`, `×7/10`, suelo **300.000 B/s = 2,4 Mbps**; `ProxyService.kt:124` engancha `onStallClosed` a `onUnderrun`).
4. **No hay recuperación automática**: `forceCeiling()` solo se invoca desde un Intent (`ProxyService.kt:71,107`). Nadie lo llama en el camino normal. `onSegment` solo puede bajar (0,82 < 1).

Aritmética del trinquete sobre un 4K de 22 Mbps: 22 → 18,0 → 14,8 → 12,1 → 9,9 → 8,2 → 6,7 → 5,5 → 4,5 → 3,7 → 3,0 → 2,5 → **2,4 Mbps (suelo)** en ~13 segmentos. Un 4K a 2,4 Mbps es degradación, y la ley anti-degradación la prohíbe sin autorización escrita.

**Artefacto:** `AbrPolicy.kt:18-56`, `TokenBucket.kt:5-21`, `LoopbackProxy.kt:310-329`, `ProxyService.kt:71,107,124`, `CLAUDE.md` (tabla 4K 28/22 Mbps).
**Veredicto: PIERDE el ataque tal como está escrito (6 Mbps es un error de unidades). GANA el ataque reformulado**: el throttle puede llevar la entrega por debajo del bitrate de la fuente, y lo hace con un lazo que solo sabe bajar. Hoy no se ha ejercitado (`maxBwAdmitted=Long.MAX_VALUE`), así que el daño es **latente hasta el primer segmento**.

> **Nota de honestidad:** el trinquete es **derivado del código, no medido en ejecución**. Para medirlo haría falta servir un canal real a través del shim y ver caer el techo segmento a segmento. Está en las 3 pruebas que faltan.

---

## 4. ATAQUE 4 — «Que el overlay nunca aparezca» → **GANA** (no hay código de producto ni evidencia en foco)

| Comprobación | Resultado | Fuente |
|---|---|---|
| ¿Existe `TYPE_ACCESSIBILITY_OVERLAY` en el shim? | **0 coincidencias** | `grep` sobre `ottshim/` |
| ¿Existe en la APK? | Solo en `SseTestActivity.kt:50` como **`TYPE_APPLICATION_OVERLAY`** de prueba, con `runCatching { wm.addView(...) }.onFailure { Log.e("ARA-Overlay", …) }` — **se traga el fallo** | `SseTestActivity.kt:47-57` |
| ¿Hay overlay en el camino de captura/reproducción? | **NO** | `docs/audits/OTTSHIM_GAP_IDENTIFIED_20261113.md:35` |
| Permiso de overlay (appops) | **`allow`** (concedido hace ~7 min; `rejectTime` hace 4 d 22 h) | `adb shell appops get com.ape.crystalagent SYSTEM_ALERT_WINDOW` |
| Permiso (dumpsys) | `granted=false` | `dumpsys package` |
| ¿AccessibilityService habilitado? | **SÍ**: `com.ape.crystalagent/com.ape.crystalagent.AraAccessibilityService` | `settings get secure enabled_accessibility_services` |

**Lectura:** el *mecanismo* que pide el ataque (overlay vía accesibilidad) **hoy está disponible** —servicio habilitado y appop de overlay permitido—, pero **no existe una sola línea de producto que lo use**, y la única ventana probada es un test que descarta el error en silencio. La notificación `cmd notification post` que se registró sin salir encima del vídeo no es evidencia de este mecanismo: es otro canal (notificación vs ventana).

**Artefacto:** los cuatro comandos de la tabla + `SseTestActivity.kt:47-57` + `OTTSHIM_GAP:35`.
**Veredicto: GANA.** No hay evidencia de que un `TYPE_ACCESSIBILITY_OVERLAY` funcione sobre OTT Navigator en foco en este ONN; y sin código no hay nada que pueda funcionar. Lo único demostrado es que *podría* intentarse.

---

## 5. ATAQUE 5 — «Que la medición mienta» → **GANA**

El `p50 0,726 s` sale de `docs/audits/E2E_PULSE_20261114.md:91`, recalculado sobre `rt=` del log de nginx: **n=470 de 621 hits** con `rt` (los 151 anteriores a las 01:16:16 no tienen latencia: `NO_COMPUTADO`, no cero). `rt` es el **tiempo total del VPS sirviendo `/pulse/<id>.m3u8`** (`ZAP_LATENCY_INSTRUMENTATION_20261114.md:55`).

**Lo que ese número NO mide, y por tanto no se puede afirmar:**

1. **El primer frame.** Entre el manifiesto y el píxel hay: descarga al device, demux, init/decoder, primer IDR renderizado. Nada de eso está en el log del VPS.
2. **El hop del shim.** El shim corre en el device; si algún día sirve, su latencia es invisible para nginx. Medir el VPS y llamarlo «tiempo del operador» excluye justo la pieza nueva.
3. **La red VPS→device.** `rt` termina cuando el VPS acaba de escribir. No incluye el transporte al ONN.
4. **La cola real del zap servido.** El propio informe da p50 **0,576 s (200) ANTES** y **0,953 s DESPUÉS**, con **n=58** y lo declara **no concluyente**; y los 502 promedian **4,2 s**. Citarlos como «p50 0,726 s» mezcla las dos ventanas.
5. **El p50 no es el usuario**: `min=0,000 s` (hay hits servidos de caché) y `max=7,290 s`. Con esa dispersión, el p50 describe el servidor, no la percepción.

**Artefacto:** `E2E_PULSE_20261114.md:75-97,101-119`; `ZAP_LATENCY_INSTRUMENTATION_20261114.md:55-56`.
**Veredicto: GANA.** `0,726 s` es una medida honesta **de otra cosa**: latencia del VPS sirviendo un manifiesto. No autoriza ninguna afirmación sobre el tiempo hasta la imagen ni sobre la mejora percibida.

---

## 6. LO QUE SÍ SE SOSTIENE (para no destruir de más)

1. **El shim arranca, escucha y responde** con un health honesto: publica sus ceros en vez de esconderlos y expone `restarts`, `requests`, `uptime_ms`. Eso es una base de observabilidad real.
2. **El puerto funciona hoy** y el acceso por `adb forward` demuestra que es alcanzable en el device.
3. **El servicio tiene watchdog** (5 s) y rearma si el hilo muere: el «proxy mudo» de BG20 está cerrado por diseño (`LoopbackProxy.kt:88-96`, `ProxyService.kt:45-56`).
4. **La capa de reescritura del manifiesto (`Rewriter`) no filtra variantes por defecto** (`pinMode=1`, `Rewriter.kt:40`): no hay degradación por recorte de variantes en el playlist. El riesgo está en el throttle de bytes, no en el ABR del manifiesto.
5. **La ruta del repo es, conceptualmente, un cambio de 3 líneas**: el regex debe aceptar `/jit/live/<id>/master.m3u8` (y `/jit/go/<id>`), y hay que desplegarla. El problema no es de diseño: es que **hoy no está**.

---

## 7. LAS 3 PRUEBAS QUE FALTAN PARA PODER FIRMAR LA TESIS

| # | Prueba | Criterio de éxito | Por qué es la que falta |
|---|---|---|---|
| **T1** | **End-to-end con un canal real a través del shim**: desplegar la ruta, arreglar el regex, pedir `/playlist-shim.m3u8?port=<puerto real>`, reproducir en OTT Navigator y capturar fotograma + `media_segments_served>0` + `proxy_media_seen=true` | ≥1 segmento servido y una imagen en pantalla con el shim en medio | Es la única que convierte «cableado» en «funcionando». Hoy: 0 segmentos y la ruta da 404 |
| **T2** | **Matar el shim a mitad de reproducción** (`am force-stop` o `kill` del hilo) y medir tiempo hasta la vuelta de imagen, puerto nuevo y si el player se recupera solo | Decir el número de segundos y si el canal vuelve sin zapear | Cierra el ataque 2 con dato, no con código: hoy el SPOF está probado por construcción |
| **T3** | **Primer frame en el device vs `rt` del VPS**, A/B con y sin shim, mismo canal y misma hora | Δ de tiempo hasta la imagen, con captura y logcat de `MediaCodec` como artefacto | Es lo único que puede sostener o refutar «el operador verá la mejora»; `0,726 s` mide el VPS, no el píxel |

**Condición de firma que propongo (falsable):** la tesis se puede firmar cuando T1 dé `media_segments_served ≥ 1` **y** `proxy_media_seen=true` **y** T3 muestre un Δ de primer frame **no peor** que sin shim, con los dos artefactos en el informe. Mientras falte cualquiera de los tres, la frase correcta es: *«el shim está encendido y el cableado está escrito, no desplegado»*.

---

## 8. LÍMITES DE ESTA OPOSICIÓN

- **No reproduje un canal a través del shim**: habría consumido la conexión única del proveedor mientras el operador puede estar viendo. Por eso T1/T2/T3 quedan como pruebas pendientes, no como resultados.
- **No reinicié el shim**: el cambio de puerto al rearmar está probado por código (`ServerSocket(0)`, `port=0`), no por observación. Es el punto más débil del ataque 2.
- **No probé el overlay sobre OTT Navigator en foco**: solo comprobé que el permiso y el servicio están disponibles y que no hay código de producto.
- **La aritmética del trinquete es derivada**, no medida: 22 → 18,0 → … supone que el bucket llega a limitar (hace falta un segmento real).
- **El health incluye mis propias consultas** en `requests`; los 335 no son íntegramente tráfico del player.

**Confianza del veredicto global: ALTA** en las cláusulas 2 y 3 (404 medido, regex 0/21.224 medido, health en vivo con 0 segmentos) · **MEDIA** en el ataque 2 (SPOF por código, no por caída real) · **MEDIA** en el ataque 3 reformulado (ley de control leída, no ejecutada).
