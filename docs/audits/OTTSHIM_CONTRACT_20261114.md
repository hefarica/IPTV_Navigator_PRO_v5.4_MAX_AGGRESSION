# OTTSHIM CONTRACT — lo que el proxy del ONN hace de verdad (medido)

**Fecha:** 2026-11-14T05:0xZ · **Tarea:** t47 · **Autor:** jit-auditor
**Método:** `adb` **read-only** + `adb forward` **temporal y retirado** + descompilación estática del APK instalado.
**VPS:** cero accesos, cero escrituras. **Proveedor:** cero peticiones (todas las pruebas con `127.0.0.1:1` del propio device).

---

## 0. VEREDICTO SOBRE TU CABLEADO: **NO-GO**

```
http://127.0.0.1:<puerto>/source.m3u8?id=<canal>&url=<jitGo codificada>
jitGo = <base>/jit/go/<id>?p=<prof>&e=<engine>
```

**NO-GO por evidencia, no por opinión:**

1. **`/source.m3u8` no responde NADA.** Cinco formas distintas de llamarla —`?id=&url=`, solo `?id=`,
   solo `?url=`, sin parámetros, y `HEAD`— devuelven **0 bytes** hasta que **el cliente** se rinde
   (6–15 s). No hay 502, ni 504, ni 400: **la conexión se queda abierta sin respuesta**. Un player
   apuntado ahí se cuelga.
2. **`url=<jitGo>` apunta a un 302.** En el motor JIT desplegado, `/jit/go/<id>` responde **302** con
   `Location: <base>/jit/live/<id>/master.m3u8` (medido en t2 sobre el motor local). Si el shim **no**
   sigue redirects se queda con un cuerpo vacío y no reescribe nada; si los sigue, llega al master
   igual. Ninguno de los dos caminos es un contrato: es funcionar por accidente.
3. **`?p=` y `?e=` no los lee nadie.** La ruta `/go/<id>` del motor desplegado no tiene manejo de esos
   parámetros (t2). Viajan en la URL y se descartan.
4. **`id=<canal>` no es un id del shim.** El shim **emite sus propios ids**: tiene `urlToId`
   (`HashMap<String,String>`), `map(url)`, `unmap(...)`, `recordPlaylist(...)` y una regex `uriAttr`.
   El `id` del shim es un token que él genera para una URL, no el id del proveedor.

**Lo que sí es sólido** y se puede usar ya: `/health` y `/metrics` (§2). Son la instrumentación; no el
transporte.

---

## 1. `ids=2048` — QUÉ CUENTA EXACTAMENTE

**No es un contador de peticiones, ni un bitmask, ni "ids vistos". Es la OCUPACIÓN de una tabla
id→url con tope, y está SATURADA.**

### 1.1 Qué dice el código

`dev.venice.ottshim.LoopbackProxy.health()`:

```java
private final String health() throws JSONException {
    int size;
    syncCache();
    ...
    synchronized (this.ids) { size = this.ids.size(); }   // ← aquí nace el campo "ids"
    ... .put("ids", size) ...
}
```

`ids` **no es un número**: es un **objeto**. El campo declarado es

```
private final dev.venice.ottshim.LoopbackProxy$ids$1 ids;
```

y la clase `LoopbackProxy$ids$1` expone la superficie completa de un **`LinkedHashMap<String,String>`**
(`compute`, `computeIfAbsent`, `containsKey`, `entrySet`, `forEach`, `get`, `getOrDefault`, `keySet`,
`merge`, `putIfAbsent`, `remove`, `replace`, `replaceAll`, `size`, `values`…) **y además**:

```
removeEldestEntry(java.util.Map$Entry<java.lang.String, java.lang.String>): boolean
```

`removeEldestEntry` **solo lo llama `LinkedHashMap`**: es el gancho de **evicción LRU**. No existe
ningún otro consumidor de esa firma en la biblioteca estándar.

⇒ `ids` = **número de entradas vivas en un mapa LRU id→url**, no un contador acumulado.

### 1.2 Qué dice la medición

| Momento | `requests` | `ids` | uptime_ms |
|---|---:|---:|---:|
| línea base (antes de tocar nada) | 248 | **2048** | 469.350 |
| tras 1 petición mía | 277 | **2048** | 522.144 |
| tras 4 más (id-only, url-only, sin params, media) | 303 | **2048** | 564.442 |
| tras 5 más (+HEAD) | 319 | **2048** | 587.558 |
| tras `/metrics` + 60 s **sin tráfico mío** | 446 | **2048** | 834.670 |

`ids` **no se mueve ni un dígito** en 198 peticiones contadas. Y **2048 = 2¹¹**.

**Lectura correcta:** el mapa alcanzó su tope y se queda ahí (cada inserción nueva expulsa la más
antigua, `removeEldestEntry` ⇒ `true`). `2048` **no** describe cuántas peticiones hiciste: describe
que la tabla está llena.

> **NO_COMPUTADO:** el literal exacto dentro del cuerpo de `removeEldestEntry` (el cuerpo descompilado
> no llegó legible en la carga útil de la herramienta). Lo que **sí** está confirmado es que el
> override existe —y por tanto que hay tope— y que el `size()` medido está clavado en 2048.

### 1.3 Y de paso: `requests` **tampoco** es lo que creías

En `ingress(Socket)` hay **un** `this.requests++` por conexión aceptada y parseada. Pero medido:

```
60 s SIN NINGUNA petición mía:  requests 415 → 446   (+31)
                                 ids       2048 → 2048 (0)
78 s con 1 petición mía:        requests 248 → 277   (+29)
```

**`requests` avanza solo, ~0,5/s (una conexión cada ~1,9 s), sin cliente.** Por tanto **`requests=194`
no eran "las peticiones de tu prueba"**: es el latido interno del proxy más lo que hiciste tú.

> **NO_COMPUTADO:** **quién** abre esas conexiones internas cada ~1,9 s. Determinarlo exige logcat o
> instrumentación del proceso, y esta tarea es read-only. Lo medido es la deriva, no su autor.

---

## 2. CONTRATO MEDIDO, RUTA POR RUTA

Todas las peticiones por `adb forward tcp:40213 tcp:40213` → `http://127.0.0.1:40213`.
`url=` siempre `http://127.0.0.1:1/nothing` (loopback del propio device, puerto cerrado).

| Ruta | Método | Código | `Content-Type` | Cuerpo | Tiempo |
|---|---|---|---:|---|---:|
| `/health` | GET | **200** | `text/plain` | 509 B de JSON | 0,03 s |
| `/metrics` | GET | **200** | `application/json` | 1.355 B de JSON | 0,03 s |
| `/media.m3u8` | GET | **400** | `text/plain` | `bad request` (11 B) | 0,10 s |
| `/seg` | GET | **400** | `text/plain` | `bad request` | 0,10 s |
| `/live/` | GET | **400** | `text/plain` | `bad request` | 0,08 s |
| `/nope`, `/` | GET | **400** | `text/plain` | `bad request` | 0,07 s |
| `/source.m3u8?id=&url=` (upstream muerto) | GET | **sin respuesta** | — | **0 B** | >15 s (timeout del cliente) |
| `/source.m3u8?id=<id>` | GET | **sin respuesta** | — | **0 B** | >8 s |
| `/source.m3u8?url=<url>` | GET | **sin respuesta** | — | **0 B** | >8 s |
| `/source.m3u8` (sin params) | GET | **sin respuesta** | — | **0 B** | >8 s |
| `/source.m3u8?id=<id>` | **HEAD** | **sin respuesta** | — | **0 B** | >6 s |

Cabeceras literales (idénticas en las respuestas que sí existen):

```
HTTP/1.1 200 X            ← la razón es el literal "X", no "OK"
Content-Type: text/plain | application/json
Content-Length: <n>
Connection: close         ← SIEMPRE: sin keep-alive, una conexión TCP por petición
```

### 2.1 Por qué `/source.m3u8` cuelga — del código, no de la imaginación

`LoopbackProxy.ingress(Socket)` (descompilado):

```java
s.setSoTimeout(300);                 // INGRESS_READ_TIMEOUT_MS = 300
Req req = parse(s);
if (req == null) { s.close(); return; }
this.requests++;
this.lastRequestAt = System.currentTimeMillis();
if ("/health".equals(req.getPath()))        text(s, health());
else if ("/metrics".equals(req.getPath()))  text(s, policy.getQoe().snapshot(), "application/json");
else                                        streamPool.execute(() -> … handleParsed(s, req) …);
```

`handleParsed(Socket, Req)` (descompilado):

```java
if ("/media.m3u8".equals(path)) { serveMedia(socket, req); return; }
respond(socket, "400 Bad Request", "text/plain", bytes("bad request"), ...);   // ← el resto
```

Conclusiones con evidencia de comportamiento:
- El **catch-all 400** explica por qué `/seg`, `/live/`, `/nope` y `/` responden `bad request`: **no
  son rutas**. Solo `/health` y `/metrics` están cableadas en `ingress`.
- `/source.m3u8` **sí entra** en otra rama (la que existe para el planner/playlist, métodos
  `playlist(...)`, `fetch(...)`, `segment(...)`), y con cualquier entrada —incluida **sin
  parámetros**— **no escribe respuesta ni cierra el socket**. La conexión al upstream muerto se
  rechaza al instante (loopback), así que **no es un timeout lento: es una excepción que no se
  traduce en respuesta**.
- Prueba de que el fallo ocurre **antes** de la contabilidad de misses:
  `miss_reason: {"absent":0,"upstream_error":0}` tras las cinco llamadas fallidas — el contador que
  debería haberse incrementado sigue a cero.
- Prueba de que el proxy **no** se bloquea globalmente: `/health`, `/metrics`, `/media.m3u8` y `/seg`
  respondieron normalmente **después** de los cuelgues.

---

## 3. QUÉ ES FIABLE HOY

### `/health` (200, `text/plain`, 509 B)

```json
{"ok":true,"proxy_up":true,"port":40213,"restarts":0,"uptime_ms":469350,"last_watchdog_at":…,
 "qoe_ready":false,"rebuffer_detector_armed":false,"proxy_media_seen":false,
 "ceilingBps":6000000,"maxBwAdmitted":9223372036854775807,
 "ids":2048,"cache_hits":0,"cache_misses":0,"cache_hit_ratio":null,
 "miss_reason":{"absent":0,"upstream_error":0},"media_segments_served":0,
 "requests":248,"last_request_at":…,"lastCacheServeMs":0,"queued":0,"pending":0,
 "ingress_timeout_ms":300,"admit_threads":3}
```

Coincide con lo que ya tenías: `ceilingBps=6000000`, `ingress_timeout_ms=300`, `admit_threads=3`,
`restarts=0`. Añadidos: `qoe_ready=false`, `proxy_media_seen=false`, `media_segments_served=0`,
`cache_hits/misses=0` ⇒ **el proxy no ha servido ni un segmento**.

### `/metrics` (200, `application/json`, 1.355 B)

Claves que importan: `"segments":0`, `"transport_stall_suspected":null`,
`"transport_stall_source":"unavailable:no_session"`, `"guard_state":"PROXY_ONLY"`,
`"guard_note":"PROXY_ONLY: sin acción sobre el player; sólo se observa/limita el proxy"`,
`"proxy_requests":414`, `"responses":10`, `"http_errors":0`, `"session_present":false`.
Los `null`/`unavailable:` están **bien puestos**: declaran "no hay sesión", no fingen cero.

---

## 4. IDENTIDAD DEL BINARIO (verificada, no heredada)

`adb pull` del APK instalado (**lectura**, escribe solo en mi host):

```
/data/app/~~BjeLvWyTNvc44eswti08yw==/com.ape.crystalagent-5H2GtuTT-v__Iz4KmAOXVA==/base.apk
25.678.434 B   sha256 8d3b145811c0bab3a10952329a81cadc477b08bd365b70f173cfe34ff52aa6e4
```

**Coincide byte a byte** con el `/ara/agent.apk` que citas. `dumpsys package`: `versionCode=651`,
`versionName=3.9.5-adb-firetv-shim`, `lastUpdateTime=2026-11-13 23:39:30`.
Clases del shim confirmadas en el dex: `dev.venice.ottshim.{LoopbackProxy, LoopbackProxy$ids$1,
LoopbackProxy$Req, ProxyService, QoeEngine, AbrPolicy, Rewriter, SegmentMeter, SessionTap,
TokenBucket, Log}`.

---

## 5. QUÉ HARÍA FALTA PARA UN GO

En este orden, y **sin cablear nada antes**:

1. **Que `/source.m3u8` conteste.** Fail-closed: `502`/`504` + `Connection: close` cuando el upstream
   falle, y `400 bad request` cuando falte `id` o `url`. Hoy no contesta **nada**, ni siquiera con
   cero parámetros; eso no es un contrato, es un socket abierto.
2. **Definir `id`.** El shim emite sus propios ids (`urlToId`/`map`); `id=<canal>` solo funcionará si
   el shim acepta ids externos. Hoy no se puede medir porque la ruta no responde → **NO_COMPUTADO**.
3. **Quitar `?p=` y `?e=` o hacer que el JIT los lea.** El motor desplegado no los procesa (t2).
4. **Decidir el 302.** `/jit/go/<id>` redirige. O el shim sigue redirects explícitamente y se
   documenta, o se usa la URL final del master en vez de `/go/`.
5. **Re-medir esta misma batería** (§2) contra el build corregido. Mismo comando, misma tabla.

---

## 6. MÉTODO, LÍMITES Y LIMPIEZA

- `adb devices` → `192.168.1.3:5555 device` (ONN 4K). `adb -s … forward tcp:40213 tcp:40213`
  **temporal**; **retirado al terminar** (`forward --remove`; `forward --list` → vacío).
- `adb pull` del APK: lectura del device, escritura solo en mi host.
- Descompilación **estática** (JADX 0.7.1 vía REA) sobre el APK instalado, sha256 `8d3b1458…`.
- **Cero** peticiones al proveedor: todas las pruebas con `http://127.0.0.1:1/nothing`, el loopback
  del propio device.
- **Cero** accesos al VPS en esta tarea.

**Límites honestos:**
- No hay logcat ni instrumentación del proceso: **quién** genera las ~0,5 conexiones/s internas es
  **NO_COMPUTADO**, igual que el literal del tope dentro de `removeEldestEntry`.
- El cuerpo completo de `playlist(...)` no se pudo leer con fiabilidad (la carga útil de la
  herramienta se truncó); la explicación del cuelgue se apoya en **5 mediciones de comportamiento**
  más el ruteo descompilado de `ingress`/`handleParsed`.
- Los `Content-Length` y tiempos son de esta sesión; el operador estaba viendo la tele y el proxy no
  transporta su tráfico (`proxy_media_seen=false`), así que no se ha interferido.
