# JIT — BATERIA DE REPRODUCCION HTTP 200 / 206 / 302 (loopback, 2026-11-11)

**Autor:** http-prober (equipo canary-jit-20261111) · **Tarea:** t3
**Alcance:** SOLO `127.0.0.1`. Cero red externa, cero VPS, cero proveedores, cero despliegues.
**Host:** Windows, `node v24.12.0`, `ffmpeg/ffprobe 8.0.1-full_build` (Gyan).

---

## 0. RESUMEN EJECUTIVO — lo que hay que leer

| Pregunta del operador | Respuesta medida |
|---|---|
| ¿Se reproducen 200? | **SI en el artefacto desplegable (A)**: 5 de 6 rutas. `/meta/<id>.json` **no devuelve nada: mata el proceso**. |
| ¿Se reproducen 302? | **SI en A**: `/go/1` da 302 real, 5 variantes medidas. Pero su `Location` apunta a `/jit/live/...`, que el propio motor responde **404**. |
| ¿Se reproducen 206? | **NO en A.** 0 de 2. El motor no llega a producir segmentos en este host (`SPAWN_ERROR spawn nice ENOENT`). **SI en B** (artefacto NO desplegable): 206 exacto con `Content-Range` y offset respetado. |

**Dos hallazgos que bloquean cualquier integracion Canary↔JIT:**

1. **`GET /meta/<id>.json` con id valido TERMINA el proceso del motor desplegable.** Sin status HTTP, sin cuerpo: `ECONNRESET` y el puerto queda cerrado. Reproducido **2 de 2 veces**. Es un DoS de una sola peticion no autenticada.
2. **El artefacto desplegable (A) no puede lanzar ffmpeg en este host** porque invoca `nice` por PATH sin fallback (`A:4865`), y **B ya tenia el arreglo que A no tiene** (`B:24-26` `NICE_BIN` absoluto + `B:427` fallback). A y B son ramas divergentes en **ambos sentidos**, no version de la misma.

---

## 1. IDENTIDAD DEL ARTEFACTO QUE RESPONDIO (obligatorio)

Cada motor se arranco desde un fichero concreto, con `Get-FileHash` sobre ese mismo fichero antes del arranque.

| # | Artefacto | Bytes | Lineas (no vacias) | sha256 | Puerto | PID que respondio | Rol |
|---|---|---|---|---|---|---|---|
| **A** | `tools\lab\ape-jit\server.js` | **447.943** | **8.695** | **`28352c508285b1eedfc889e5df40855e6e2c71207d7c806288ac8457de36ff67`** | 3099 | 44920 (inst. 1), 41076 (inst. 2), **15588 (inst. 3)** | **DESPLEGABLE** — `_vps_stage\deploy\manifest.tsv:59` lo mapea a `/opt/ape-jit/server.js` |
| **B** | `IPTV_v5.4_MAX_AGGRESSION\vps\ape-jit\server.js` | **45.535** | **918** | **`8405f78412dc2a984f690b7270e891d050740d88358f10ca5818f905151fbae0`** | 3100 | 11108 | **NO desplegable** (sin fila en el manifest). Control comparativo |
| **C** | desplegado 2026-11-09 segun `INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:132` | 415.037 (declarado) | — | **NO DISPONIBLE** | — | — | **NOT_TESTED** |

**Correccion de conteo, medida hoy:** t2 reporto B con **959 lineas**; `Get-Content | Measure-Object -Line` sobre ese mismo fichero da **918 lineas / 918 no vacias** y 45.535 B. Los bytes y el sha256 coinciden; el conteo de lineas de t2 no. Se reporta el medido aqui.

**Artefacto C: NOT_TESTED, con razon.** No existe en el workspace ningun fichero de 415.037 B que corresponda a "el JIT desplegado": el unico 415.037 B citado es el del incidente (documento), no hay ruta con esos bytes. El manifest vigente (`manifest.tsv:59`, **singular**, 6.501 B / 61 lineas) mapea **A**, no C. Sin bytes no hay sha256, y sin sha256 no hay prueba: **no se prueba lo que no se puede identificar**.

**Prechequeo de catalogo (obligatorio, trampa R-25):** `GET /catalog.json` → **`count=2`** en A y en B antes de ejecutar. La bateria NO se ejecuto contra un catalogo vacio. Catalogo inyectado: `scratch\jit_probe_20261111\state\channels.json` (ids `1` = 4K HEVC Main10 PQ, `2` = 1080 H.264 + AAC 5.1).

---

## 2. SETUP MEDIDO (no simulado)

El motor exige una fuente **HTTP(S)** (pasa `-user_agent` incondicionalmente: un `file:` local lo aborta). Para arrancar **sin proveedor** se levanto una fuente estatica local con bucle:

| Pieza | Ruta / valor | Medido |
|---|---|---|
| Fuente HTTP local | `scratch\jit_probe_20261111\http\static_loop.js` en `127.0.0.1:3400` (pid 43452) | `SRC listening 127.0.0.1:3400 rate=2000000` |
| Muestra 4K HDR | `samples\4k.ts` | 20.564.380 B · `hevc Main 10 3840x2160 level=150 smpte2084 bt2020` |
| Muestra 1080 + 5.1 | `samples\1080_51.ts` | 39.338.624 B · `h264 Constrained Baseline 1920x1080 level=40` + `aac LC 6 ch 5.1` |
| Catalogo | `state\channels.json` | 2 ids |
| Lista de operador | `state\APE_JIT_LIST.m3u8` | creada para probar `/playlist.m3u8` (la ruta la exige junto al catalogo, `A:6115`) |
| Salida | `shm\` (A) y `shmB\` (B) | ver §5 |

---

## 3. BATERIA — ARTEFACTO A (DESPLEGABLE, sha256 `28352c50…ff67`)

Puerto 3099. Cada fila tiene su crudo en `scratch\jit_probe_20261111\bodies\*.head.txt` y `.body`.

### 3.1 200

| # | Peticion exacta | Status observado | Status esperado | Cuerpo | Veredicto |
|---|---|---|---|---|---|
| 1 | `GET /health` | **200** | 200 | 49 B `{"ok":true,"active":null,"pid":null,"uptime_s":0}` sha `eda05edb…` | **REPRODUCIDO** |
| 2 | `GET /capabilities.json` | **200** | 200 | 1.105 B sha `c2b8661b…` | **REPRODUCIDO** |
| 3 | `GET /crystal.json` | **200** | 200 | 947 B sha `a5bd7fbc…` | **REPRODUCIDO** |
| 4 | `GET /catalog.json` | **200** | 200 | 435 B sha `bcbd1367…` `count:2` | **REPRODUCIDO** |
| 5 | `GET /playlist.m3u8` (sin lista) | **404** | 200/404 | 18 B `playlist not built` | **NO_REPRODUCIDO** en ese estado (depende de fichero externo, `A:6116`) |
| 5b | `GET /playlist.m3u8` (con `APE_JIT_LIST.m3u8`) | **200** | 200 | 84 B sha `f5876b52…` | **REPRODUCIDO** con el artefacto de operador que la ruta documenta |
| 6 | `GET /meta/1.json` | **SIN STATUS — el proceso MUERE** | 200 | 0 B, `ECONNRESET`, puerto 3099 cerrado inmediatamente | **NO_REPRODUCIDO — CRASH** (ver §6.1) |
| 7 | `GET /meta/999999.json` (id inexistente) | **404** | 404 | 15 B `unknown channel` | **REPRODUCIDO** (no crashea: retorna en `A:6172`, antes del punto de fallo `A:6183`) |
| 8 | `GET /image/catalog` (extra) | **200** | — | 3.760 B sha `d0701748…` | reproducido (fuera de la bateria) |
| 9 | `GET /source.json` (extra) | **404** | — | 9 B `not found` | **404 medido**: A no registra esa ruta (B si: 200). Divergencia A/B |

**Familia 200 en A: 5 de 6 (el 6 es el crash).**

### 3.2 302 — `/go/<id>`

| # | Peticion exacta | Status | `Location` exacta | `X-APE-Player-Class` | Veredicto |
|---|---|---|---|---|---|
| 1 | `GET /go/1` (curl) | **302** | `https://127.0.0.1:3099/jit/live/1/media_0.m3u8` | `media-only` | **REPRODUCIDO** |
| 2 | `GET /go/1` + `X-Forwarded-Proto: http` | **302** | `http://127.0.0.1:3099/jit/live/1/media_0.m3u8` | `media-only` | **REPRODUCIDO** |
| 3 | `GET /go/1` + UA `VLC/3.0.19 LibVLC/3.0.19` + XFP http | **302** | `http://127.0.0.1:3099/jit/live/1/master.m3u8` | `master-capable` | **REPRODUCIDO** |
| 4 | `GET /go/1` + UA `ExoPlayerLib/2.19.1` + XFP http | **302** | `http://127.0.0.1:3099/jit/live/1/media_0.m3u8` | `media-only` | **REPRODUCIDO** |
| 5 | `GET /go/1` + `Host: evil.example` | **302** | **`https://evil.example/jit/live/1/media_0.m3u8`** | — | **REPRODUCIDO y NO SEGUIDO** (host externo; ver §6.4) |

**Familia 302 en A: reproducida (5 de 5 variantes).** Cuerpo 0 B en todos (sha de vacio `e3b0c442…`).

**El `Location` no es servible por el propio motor** (ver §6.3):

| Peticion al destino del 302 | Status |
|---|---|
| `GET /jit/live/1/master.m3u8` | **404** (9 B) |
| `GET /jit/go/1` | **404** (9 B) |
| `GET /jit/meta/1.json` | **404** (9 B) |
| `GET /live/1/master.m3u8` (sin `/jit`) | **503** a los **135,9 s** (ver §3.4) |

### 3.3 206 / 304 / 416 — **NO_REPRODUCIDO en A**

| # | Peticion | Status | Esperado | Veredicto |
|---|---|---|---|---|
| 1 | `GET /live/1/master.m3u8` | **503** (TTFB **135.941,1 ms**) | 200 | NO_REPRODUCIDO (job no arranca) |
| 2 | `GET /live/1/media_0.m3u8` | **503** (TTFB **67.043,5 ms**) | 200 | NO_REPRODUCIDO |
| 3 | `GET /live/1/<init>.m4s` con `Range: bytes=0-1023` | **no ejecutable** | 206 | NO_REPRODUCIDO: no existe el recurso |
| 4 | `GET /live/1/<chunk>.m4s` con `Range: bytes=0-1023` | **no ejecutable** | 206 | NO_REPRODUCIDO: no existe el recurso |
| 5 | 304 con `If-None-Match` / 416 | **no ejecutable** | 304 / 416 | NO_REPRODUCIDO |

**Causa raiz medida, literal, en el log del motor (`logs\A3.out.log`), 5 ciclos:**

```
START 1 pid=undefined sdr=false sdr720=false copy4k=true crystal=NATIVE_4K_PQ src=3840x2160/smpte2084->3840x2160
SPAWN_ERROR 1 spawn nice ENOENT
```

`shm\1` queda **vacio** (0 ficheros): no hay `init-*.m4s` ni `chunk-*.m4s` que pedir. `Get-Process ffmpeg` = **0 procesos** durante toda la ventana.

Codigo: **`A:4865`**
```js
const child = spawn('nice', ['-n', '19', 'ffmpeg', ...args], {
```
`nice` **y** `ffmpeg` resueltos por PATH, sin ruta absoluta y **sin fallback**. En B el mismo punto ya esta arreglado:

```js
B:24  // FIX 2026-11-07: spawn('nice', ...) resolvia por PATH y un ENOENT no decia si
B:25  // faltaba nice, ffmpeg o el cwd. Rutas absolutas si existen.
B:26  const NICE_BIN = fs.existsSync('/usr/bin/nice') ? '/usr/bin/nice' : '';
B:427 const child = spawn(NICE_BIN || FFMPEG_BIN, NICE_BIN ? ['-n','19',FFMPEG_BIN,...args] : args, {
```

**A (desplegable) carece del fix que B ya tiene.** En Linux (`/usr/bin/nice` existe) A arrancaria; el defecto es de portabilidad **y de honestidad del fallo**: en vez de fallar rapido, retiene la peticion **135,9 s** y luego responde 503 `startup timeout` con `X-APE-Auto-Retry: failed-once`.

### 3.4 Negativos en A

| # | Peticion exacta | Status | Esperado | Cuerpo | Veredicto |
|---|---|---|---|---|---|
| 1 | `GET /go/bad%20id%21` (fuera de `^[A-Za-z0-9_.-]{1,80}$`) | **400** | 400 | 11 B `bad channel` | **REPRODUCIDO** |
| 2 | `GET /go/<81 chars>` (limite superior) | **400** | 400 | 11 B `bad channel` | **REPRODUCIDO** (el limite 80 se aplica) |
| 3 | `GET /go/999999999` | **404** | 404 | 15 B `unknown channel` | **REPRODUCIDO** |
| 4 | `GET /live/1/basura.m4s` (fuera de whitelist) | **404** | 404 | 9 B `not found` | **REPRODUCIDO** |
| 5 | `GET /live/..%2F..%2Fetc/master.m3u8` | **400** | 400/404 | 11 B `bad channel` | **REPRODUCIDO** (`safeId` corta el traversal) |
| 6 | `GET /live/999999/master.m3u8` | **404** | 404 | 15 B `unknown channel` | **REPRODUCIDO** |
| 7 | `GET /live/bad%20id%21/master.m3u8` | **400** | 400 | 11 B `bad channel` | **REPRODUCIDO** |
| 8 | `POST /health` | **200** | — | 49 B (identico a GET) | **NO hay filtro de metodo** |
| 9 | `DELETE /catalog.json` | **200** | — | 435 B | **NO hay filtro de metodo** |
| 10 | `OPTIONS /health` | **204** | 204 | 0 B | **REPRODUCIDO** |
| 11 | `GET /live/1/master.m3u8` | **503** | 503 solo si alcanzable | 15 B `startup timeout`, `X-APE-Auto-Retry: failed-once` | **REPRODUCIDO** (alcanzable, TTFB 135,9 s) |

---

## 4. BATERIA — ARTEFACTO B (NO desplegable, sha256 `8405f784…fae0`)

Puerto 3100, pid 11108. Aqui **si** arranco el job: `START 1 pid=25348 … copy4k=true crystal=NATIVE_4K_HDR`.

### 4.1 200 y 302

| # | Peticion | Status | Cuerpo / Location | Veredicto |
|---|---|---|---|---|
| 1 | `GET /health` | **200** | 49 B `eda05edb…` | REPRODUCIDO |
| 2 | `GET /capabilities.json` | **200** | **538 B** sha `acacfc9c…` (A: 1.105 B — **contenido distinto**) | REPRODUCIDO |
| 3 | `GET /crystal.json` | **200** | **817 B** sha `559fdd69…` (A: 947 B) | REPRODUCIDO |
| 4 | `GET /catalog.json` | **200** | 435 B sha **`17748d2e…`** (mismo tamaño, **sha distinto al de A**) | REPRODUCIDO |
| 5 | `GET /playlist.m3u8` | **200** | 84 B sha `f5876b52…` (identico a A) | REPRODUCIDO |
| 6 | `GET /meta/1.json` | **200** | 547 B sha `96090e41…` | **REPRODUCIDO** — contraste con A, que muere |
| 7 | `GET /go/1` | **302** | `https://127.0.0.1:3100/jit/live/1/master.m3u8` | REPRODUCIDO (B manda **master a todos**; sin `X-APE-Player-Class`) |
| 8 | `GET /go/1` + XFP http | **302** | `http://127.0.0.1:3100/jit/live/1/master.m3u8` | REPRODUCIDO |
| 9 | `GET /go/1` + UA VLC | **302** | `http://…/master.m3u8` | REPRODUCIDO |
| 10 | `GET /go/1` + `Host: evil.example` | **302** | **`https://evil.example/jit/live/1/master.m3u8`** | REPRODUCIDO y **NO SEGUIDO** |
| 11 | `GET /go/bad%20id%21` | **400** | 11 B | REPRODUCIDO |
| 12 | `GET /go/999999999` | **404** | 15 B | REPRODUCIDO |
| 13 | `POST /health` | **200** | 49 B | sin filtro de metodo |

### 4.2 206 — REPRODUCIDO (recurso `chunk-*.m4s` de 16.669.658 B)

`chunk-mwbrfcc6wtk43-0-1.m4s`

| # | Peticion exacta | Status | `Content-Range` | `Accept-Ranges` | `Content-Length` | Bytes | Veredicto |
|---|---|---|---|---|---|---|---|
| 1 | `GET …/chunk-…-1.m4s` | **200** | — | `bytes` | 16669658 | 16669658 | REPRODUCIDO |
| 2 | + `Range: bytes=0-1023` | **206** | `bytes 0-1023/16669658` | `bytes` | **1024** | 1024 | **REPRODUCIDO** |
| 3 | + `Range: bytes=1024-` | **206** | `bytes 1024-16669657/16669658` | `bytes` | 16668634 | 16668634 | **REPRODUCIDO — el offset se respeta** |
| 4 | + `Range: bytes=-1024` (sufijo) | **206** | `bytes 16668634-16669657/16669658` | `bytes` | 1024 | 1024 | REPRODUCIDO |
| 5 | + `Range: bytes=abc` | **416** | `bytes */16669658` | `bytes` | (sin CL) | 0 | **REPRODUCIDO** |
| 6 | + `Range: bytes=16674658-` (> tamaño) | **416** | `bytes */16669658` | `bytes` | (sin CL) | 0 | REPRODUCIDO |
| 7 | + `If-None-Match: W/"16669658-…"` | **304** | — | `bytes` | — | 0 | **REPRODUCIDO** |
| 8 | + `If-Modified-Since: <futuro>` | **200** | — | `bytes` | 16669658 | 16669658 | **NO produce 304** (solo soporta ETag) |
| 9 | `HEAD …/chunk` | **200** | — | `bytes` | 16669658 | 0 | REPRODUCIDO (sin cuerpo) |
| 10 | `If-Range: "bogus"` + `Range: bytes=0-99` | **206** | `bytes 0-99/16669658` | `bytes` | 100 | 100 | **DESVIACION RFC 7233 §3.2** (ver §6.6) |

### 4.3 206 sobre `init-*.m4s` (921 B)

`init-mwbrlq0morth7-0.m4s` — extraido de `#EXT-X-MAP:URI="…"` en la misma corrida.

| # | Peticion | Status | `Content-Range` | `Content-Length` | Veredicto |
|---|---|---|---|---|---|
| 1 | `GET …/init-…-0.m4s` | **200** | — | 921 | REPRODUCIDO (`ETag: W/"921-1794380139382"`, `Cache-Control: immutable`) |
| 2 | + `Range: bytes=0-1023` | **206** | `bytes 0-920/921` | 921 | **REPRODUCIDO** (rango recortado al tamaño real) |
| 3 | + `Range: bytes=1024-` | **416** | `bytes */921` | — | **REPRODUCIDO y correcto** (start > EOF ⇒ 416 por RFC 7233) |
| 4 | + `Range: bytes=abc` | **416** | `bytes */921` | — | REPRODUCIDO |

**Aviso medido para quien repita esto:** los nombres `init-*`/`chunk-*` **caducan**: la ventana de segmentos rota y un nombre tomado 4 minutos antes devuelve **404** (medido: `init-mwbrfcc6wtk43-0.m4s` → 404 tras rotar). Hay que redescubrirlos de `media_0.m3u8` en la misma corrida.

---

## 5. RECUENTO HONESTO

| Familia | A (DESPLEGABLE) | B (NO desplegable) |
|---|---|---|
| **200** (health, capabilities, crystal, catalog, playlist, meta) | **5 / 6** | **6 / 6** |
| **206** (init-*.m4s, chunk-*.m4s) | **0 / 2** | **2 / 2** |
| **302** (`/go/<id>`) | **1 / 1** (5 variantes) | **1 / 1** |
| **Nucleo 200+206+302** | **6 / 9** | **9 / 9** |
| Negativos (400, 404, 416, 304, 503) | 400 ✓, 404 ✓ (×4), 503 ✓ · **416 y 304 NO_REPRODUCIDOS** | 400 ✓, 404 ✓, 416 ✓, 304 ✓ |
| Peticiones ejecutadas (total) | **≈ 40** | **≈ 35** |

**Frases que resumen sin adornos:**
- **302: reproducido en A (desplegable), 5 de 5.** Pero su destino da 404 en el propio motor.
- **200: reproducido en A, 5 de 6.** El que falta no da error: **mata el proceso**.
- **206: NO reproducido en A (desplegable); reproducido en B (no desplegable).** En A no hay segmentos porque `spawn nice` falla.

---

## 6. HALLAZGOS

### 6.1 **H-1 · BLOCKER · `GET /meta/<id valido>.json` TERMINA EL PROCESO** (DoD de 1 peticion)

- **Archivo:** `tools\lab\ape-jit\server.js` (A, DESPLEGABLE) — `sha256 28352c50…ff67`
- **Lineas:** handler `A:6167-6197` (llamada en **`A:6183`**), tabla **`A:7993`**, acceso **`A:8000`**
- **Severidad:** **BLOCKER** (DoS no autenticado, 1 request)

**Evidencia cruda (2 de 2 reproducciones, `logs\A3099.err.log` y `logs\A2.err.log`):**

```
C:\...\tools\lab\ape-jit\server.js:8000
  for (const k of Object.keys(CAPACITY_FPS).map(Number).sort((a, b) => b - a)) {
                              ^
ReferenceError: Cannot access 'CAPACITY_FPS' before initialization
    at capacityForHeight (...\server.js:8000:31)
    at capacityVerdict (...\server.js:8009:15)
    at Server.<anonymous> (...\server.js:6183:17)
```

**Efecto medido:** `curl -D - /meta/1.json` → `curl: exit 56` (recv failure), **cero bytes de respuesta**, **cero cabeceras**, y el puerto 3099 deja de escuchar. `Get-Process -Id 41076` → **DEAD**.

**Mecanismo (por que no es un typo):** `CAPACITY_FPS` (`A:7993`) y `CAPACITY_MIN_FPS/RATIO` (`A:7994-7995`) son `const` **block-scoped dentro de un bloque del propio callback de `createServer`**. En modo sloppy (CJS) la declaracion `function capacityForHeight` de ese mismo bloque **se hoistea al scope del callback** (Annex B), asi que es invocable desde **cualquier** ruta — pero su `const` asociado **solo se inicializa si ese bloque concreto se ejecuta**. Para `/meta/*` el bloque nunca corre ⇒ el binding queda en **TDZ permanente** ⇒ primer acceso = excepcion no capturada ⇒ `process` muere.

**Prueba de que es el punto exacto y no otro:** `/meta/999999.json` (id inexistente) devuelve **404 correcto y el proceso sobrevive**, porque retorna en `A:6172` **antes** de llegar a `A:6183`.

**Correccion (fuera de mi alcance — no toco codigo):** subir `CAPACITY_FPS`/`CAPACITY_MIN_*` y las dos funciones a scope de modulo (fuera del callback), o cerrar el bloque mal anidado. Mientras tanto: **`/meta` no es apto para contrato Canary**.

### 6.2 **H-2 · BLOCKER para 206/304/416 · A no puede lanzar ffmpeg: `spawn nice ENOENT` sin fallback**

- **Linea:** `A:4865` (hardcoded `'nice'` + `'ffmpeg'` por PATH, sin absolutos, sin fallback)
- **Contraste:** `B:24-26` + `B:427` **ya tienen el arreglo** (comentado `FIX 2026-11-07`)
- **Medido:** 5 ciclos `SPAWN_ERROR 1 spawn nice ENOENT`; `shm\1` vacio; 0 procesos ffmpeg; `/live/1/master.m3u8` → **503 tras 135,9 s**; `/live/1/media_0.m3u8` → **503 tras 67,0 s**
- **Consecuencia:** **206, 304 y 416 son inalcanzables en el artefacto desplegable en este host**, y el fallo tarda **2 minutos** en decirse en vez de fallar rapido.
- **Matiz honesto:** en el VPS Linux `/usr/bin/nice` existe, asi que **A probablemente si arranca alli**. Lo que se prueba aqui es el defecto de portabilidad + el retardo del fallo, **no** que el contrato de `sendStatic` este roto.

### 6.3 **H-3 · ALTA · El 302 apunta a una ruta que el motor NO sirve**

`A:6356` construye `Location: publicBase(req) + '/live/' + id + goPlaylist`, y `publicBase` (`A:5282-5285`) **anade `/jit`**. Resultado medido: `Location: …/jit/live/1/media_0.m3u8`. Al pedirla al mismo motor: **404** (`/jit/live/…`, `/jit/go/1`, `/jit/meta/1.json` → 404 los tres). El 302 se produce, pero **el cliente que lo siga contra el motor directo recibe 404**; solo funciona detras de un proxy que **retire el prefijo `/jit`**. Igual en B. **El 302 no es seguible en loopback: es un puntero a una ruta virtual.**

### 6.4 **H-4 · ALTA · Host header injection en `Location`**

`Host: evil.example` → `Location: https://evil.example/jit/live/1/media_0.m3u8` (**medido en A y en B**, 302). `publicBase` (`A:5283-5284`) toma `Host` y `X-Forwarded-Proto` **sin allowlist**. **NO se siguio la redireccion** (host externo). Con `X-Forwarded-Proto` ausente el esquema se fuerza a **`https`** sobre `127.0.0.1` — sin TLS: 302 a un destino muerto en loopback.

### 6.5 **H-5 · MEDIA · `/go/<id>` es un GET con efecto de estado** *(LECTURA DE CODIGO — NO EJECUTADO)*

`A:6316-6335`: si llega `?p=Px` valido y difiere del perfil en curso, el handler **escribe `IMAGE_CONFIG_FILE`** (`A:6331`) y **para el job vivo** (`A:6333 stopCurrent('governance-profile-change')`). Un **GET anonimo** puede cortar el stream de otro cliente. **No lo ejecute**: mi bateria no usa `?p=`; lo reporto como lectura con linea, marcado como **no medido**.

### 6.6 **H-6 · MEDIA · `If-Range` ignorado (desviacion RFC 7233 §3.2)**

`sendStatic` (`A:5213-5255` / equivalente en B) **no mira `If-Range`**. Medido en B: `If-Range: "bogus"` + `Range: bytes=0-99` → **206 parcial**; la norma exige **200 con el cuerpo completo** cuando el validador no casa. Un cliente que reanude por error recibe bytes incorrectos en lugar de un cuerpo completo.

### 6.7 **H-7 · MEDIA · Sin filtro de metodo HTTP**

`A:6059-6062` solo intercepta `OPTIONS` (204). Medido en A: **`POST /health` → 200**, **`DELETE /catalog.json` → 200** (y en B igual). Cualquier verbo alcanza handlers de lectura — y en B `POST /live/<id>/master.m3u8` llega a **arrancar ffmpeg** (R-07 de t2, consistente con lo leido en A: no hay guarda).

### 6.8 **H-8 · MEDIA · A y B divergen en AMBOS sentidos** (no es "version vieja/nueva")

| Comportamiento | A (desplegable) | B (no desplegable) |
|---|---|---|
| `/meta/1.json` | **MUERE el proceso** | 200 (547 B) |
| `spawn nice` | **sin fallback (ENOENT)** | **con fallback (fix 2026-11-07)** |
| `/go/1` por UA | **decide master/media + `X-APE-Player-Class`** | manda master a todos |
| `/source.json` | **404 (no registrada)** | 200 |
| `capabilities.json` | 1.105 B | 538 B |
| `catalog.json` | 435 B sha `bcbd1367…` | 435 B sha `17748d2e…` |
| `/playlist.m3u8` | 200 (84 B) | 200 (84 B, **mismo sha**) |

**Ninguno de los dos contiene al otro.** Integrar Canary "contra el JIT" sin fijar sha256 es integrar contra un blanco movil (R-22 de t2, confirmado aqui con medidas nuevas).

---

## 7. NO_TESTED / NO_COMPUTADO (con su razon, sin rellenar el hueco)

| Item | Estado | Razon |
|---|---|---|
| **Artefacto C** (415.037 B, "desplegado 2026-11-09") | **NOT_TESTED** | No existe fichero con esos bytes en el workspace; sin bytes no hay sha256; el manifest vigente mapea A. |
| 206/304/416 en **A** | **NO_REPRODUCIDO** | `spawn nice ENOENT`: no hay segmentos. **No se simularon** ni se fabricaron ficheros en `shm\1`. |
| `/meta/<id>` 200 en **A** | **NO_REPRODUCIDO** | El proceso muere antes de emitir status. |
| Ejecucion real de `?p=` sobre `/go` (H-5) | **NO EJECUTADO** | Evite mutar el estado del motor a proposito; se reporta como lectura de codigo con linea. |
| Seguir el 302 hacia `evil.example` | **NO SEGUIDO** | Regla de alcance: nada fuera de loopback. |
| 503 por capacidad (`CAPACITY_EXCEEDED`) | **NO_REPRODUCIDO** | Exige que el bloque de §6.1 se ejecute; con el bug H-1 ese camino solo se alcanza matando el proceso. |
| Latencia real de arranque en Linux | **NO COMPUTADO** | Este host es Windows; `nice` no existe. |

---

## 8. TRAZABILIDAD Y TEARDOWN

**Procesos y puertos (antes / despues):**

```
ANTES   : 127.0.0.1:3400 pid 43452 (fuente) · 127.0.0.1:3099 pid 15588 (A) · 127.0.0.1:3100 pid 11108 (B)
KILL    : killed pid=15588 · killed pid=11108 · killed pid=43452
DESPUES : NINGUNO — 3099/3100/3400 cerrados
curl http://127.0.0.1:3099/health -> 000   (cerrado)
curl http://127.0.0.1:3100/health -> 000   (cerrado)
curl http://127.0.0.1:3400/health -> 000   (cerrado)
```

**Evidencia cruda en `scratch\jit_probe_20261111\` (194 ficheros, ~150 MB):**

| Ruta | Contenido |
|---|---|
| `bodies\p1b_*.head.txt` / `.body` | crudos de la fase 1b en A (200/302/400/404) |
| `bodies\p3_*.head.txt` / `.body` | crudos de la fase 3 en A (negativos, metodos, playlist) |
| `bodies\A\r_master.head.txt` + `r_master.body` | **crudo del 503 "startup timeout"** con `Server-Timing: ttfb;dur=135941.1` |
| `bodies\A\r_media0.head.txt` + `r_media0.body` | crudo del 503 "stream stopped" con `ttfb;dur=67043.5` |
| `bodies\B\r_chunk_*.head.txt` + `.body` | **crudos de 206 / 416 / 304** sobre `chunk-*.m4s` |
| `bodies\b2_init_*.head.txt` | crudos de 200/206/416 sobre `init-*.m4s` |
| `bodies\b_go1_*.head.txt`, `b_go_host_inject.head.txt` | crudos del 302 y del Host injection |
| `probe_results_*.tsv` / `.json` | tablas completas por fase (phase1b, phase3, phaseB, phaseInit, phaseInit2) |
| `range_results_B.tsv` / `.json` | matriz 206/416/304 de B con nombres descubiertos |
| `range_results_A.tsv` / `.json` | **A: solo 503 + `NO_SEGMENTS`** (prueba de que no hubo trampa) |
| `logs\A*.out.log` / `A*.err.log` | log del motor A + **stack literal del crash de `/meta`** |
| `logs\B3100.out.log` | log de B con `START 1 pid=25348` |
| `logs\src.out.log` | fuente local |
| `state\channels.json`, `state\APE_JIT_LIST.m3u8` | catalogo y lista de operador inyectados |
| `probe.js`, `probe_range.js`, `http\static_loop.js`, `cases_*.json` | ejecutores reproducibles |

**Reproducir (PowerShell, loopback):**

```powershell
$root='<repo>\scratch\jit_probe_20261111'
$env:SAMPLES="$root\samples"; $env:RATE_BPS='2000000'; $env:SPORT='3400'
node "$root\http\static_loop.js"

$env:PORT='3099'; $env:BIND='127.0.0.1'
$env:MAP_FILE="$root\state\channels.json"; $env:OUT_ROOT="$root\shm"
$env:IDLE_MS='300000'; $env:WAIT_MS='60000'; $env:BOOT_GRACE_MS='60000'
$env:IMAGE_CONFIG_FILE="$root\state\image-config.json"; $env:PROFILE_MATRIX_FILE="$root\state\profile-matrix.json"
node '<repo>\tools\lab\ape-jit\server.js'

# prechequeo obligatorio: si count==0, la bateria NO es ejecutable
curl.exe -s http://127.0.0.1:3099/catalog.json

node "$root\probe.js" "$root\bodies" "$root\cases_phase1b.json" phase1b
node "$root\probe_range.js" 3099 1 "$root\bodies\A" A "A"
# GET /meta/1.json -> el proceso muere (H-1)
```

---

## 9. QUE NECESITA EL CONTRATO (para el capstone)

1. **Fijar corpus por sha256** — `28352c50…ff67` (A) y `8405f784…fae0` (B) no son intercambiables (§6.8). El contrato debe nombrar el sha256, no "el JIT".
2. **`/meta/<id>` NO puede declararse en el contrato hasta cerrar H-1**: hoy es un kill switch.
3. **El 302 no es verificable sin declarar el prefijo `/jit`**: `Location` es correcta solo con proxy; el contrato debe fijar quien sirve ese path (§6.3).
4. **206/304/416 solo pueden acreditarse sobre B en este host**; sobre A exigen Linux (§6.2). Cualquier "206 verificado" sobre A en Windows es falso.
5. **La ventana de segmentos rota**: el contrato no puede citar nombres `chunk-*`/`init-*` fijos; se descubren por corrida.
6. **`/playlist.m3u8` 200 depende de `APE_JIT_LIST.m3u8`** junto al catalogo: sin ese fichero es 404, y eso **no es un fallo del motor**.

---

*Bateria ejecutada el 2026-11-11 entre 06:43 y 06:56 UTC. Todos los procesos arrancados fueron terminados y los puertos 3099/3100/3400 verificados cerrados. Cero peticiones a red externa; cero ficheros de codigo modificados.*
