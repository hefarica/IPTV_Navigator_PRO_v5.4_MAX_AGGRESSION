# Presupuesto de latencia del camino de sintonización — qué cuesta cada pieza, dónde caben los 5 ms, y qué lado aplica cada perilla

**Fecha:** 2026-11-15 · **Autor:** realtime-architect (t74) · **Estado:** presupuesto medido + contrato de dos lados + política de buffer + gates definidos, **sin implementar**
**Alcance:** camino servidor de una petición de sintonización (manifest y segmento) hasta la primera línea de respuesta; coste de medir; contrato de cadencia VPS/APK; **política de buffer con su ley de control (recarga > drenaje) y su regla de recarga**; precedencia de perfil; reparto prober/operario; acotación de la llamada al LLM.
**Incorpora dos correcciones del operador (vía capitán, 2026-11-15):** (1) la frontera «no tocar la APK» aplica al **runtime**, no a la construcción, y cada valor declara su **lado**; (2) el objetivo declarado es **«buffer infinito y cero cortes mientras haya red»**, que este documento convierte en parámetros con números (§7) en vez de dejarlo como intención.
**Datos de terceros usados sin re-medir:** **t75** (`PROBE_LATENCY_MEASURED_20261115.md`, 17.311 B, `sha256 9da83ed8…c1ce`, identidad verificada en esta tarea).
**Fuera de alcance:** píxeles, calidad de imagen, listas servidas, VPS, código de producción. **No se tocó nada.**

---

## 0. Veredicto en diez líneas

1. **5 ms es alcanzable — para DECIDIR, y con poco colchón en p99.** Medido en este host: decidir con tabla precalculada + escribir cabeceras + emitir la primera línea cuesta **p50 0,97–1,76 ms · p99 2,79–4,46 ms** (§2, tabla A/B/C). Margen sobre 5 ms: **2,8×–5,2× en p50**, pero solo **1,1×–1,8× en p99**. Cabe; no sobra.
2. **5 ms es imposible hoy, y no por la red.** Una sola línea del motor —`loadMap()`— relee y parsea el mapa de 21.224 canales **en cada petición**: **p50 53,3–70,5 ms · p99 89,9–241,4 ms** (§2.2). Eso es **10,7×–14,1× el presupuesto en p50 y hasta 48× en p99**, antes de tocar la red.
3. **El mismo defecto está en el lado PHP, medido por t75: `json_decode` del índice cuesta p50 4,041 ms · p99 6,606 ms = 80,8 % de los 5 ms, en cada petición sin caché.** Dos lenguajes, dos medidas independientes, un solo antipatrón: **cargar la tabla entera en el camino caliente**. El lookup real cuesta 0,000 ms (array/APCu) o 0,0029 ms (SQLite) — §4.
4. **Medir la calidad de imagen no cabe en 5 ms por 330,6×.** Un probe completo: manifest p50 645 ms + primer segmento p50 925 ms + ffprobe p50 83 ms = **1.653 ms por canal** (§4).
5. **El zapping percibido no se mide en ms, se mide en segundos.** Medido en el VPS: `/pulse` **p50 0,650 s · p99 7,180 s** (n=655), del cual **99,97 % es el proveedor** y el VPS pone **0,521 ms**.
6. **Hay dos lados y dos cadencias, y son distintas por diseño.** APK: aplicación **inmediata y local**, no espera a nadie. VPS: se aplica **cuando el player vuelve a pedir el manifest**, y esa latencia la marca el ciclo de recarga del player — **NO COMPUTADO** hoy; su suelo, medido en el código del motor, es `max-age=2 s` (media) / `5 s` (master) — §6.
7. **La arquitectura honesta es una sola:** DECIDIR en <5 ms con tabla precalculada; MEDIR fuera del camino con realimentación versionada; y **cada valor declara en qué lado se aplica**. Cualquier otra cosa —medir en línea, "optimizar" la red, degradar para ser rápido— está refutada por un número de esta página.
8. **«Buffer infinito» queda DEFINIDO: el buffer NUNCA llega a cero, no «infinitos segundos».** La ley de control es **recarga > drenaje**; con **3–5 s** de ventaja basta si el operario la mantiene. Se implementa como suelo **`APE_BUFFER_FLOOR_S = 4 s`** (rango 3–5), banda de trabajo **4–18 s**, techo de retraso **`APE_MAX_DELAY_S = 20 s`**, cap **64 MB/canal** reciclando el segmento completo más viejo — §7.
9. **El punto de equilibrio está medido: se pierde ventaja cuando el fetch tarda más que el segmento (10 s).** Con el peor fetch medido (**10,603 s**) el sistema pierde **0,6 s por descarga** — por eso la regla actúa sobre la **RECARGA** (prefetch/retry/reconnect/timeout/ruta), **nunca sobre la imagen**, y la promesa se escribe con dos condiciones: **«no se corta mientras haya RED y la FUENTE siga viva»** (§7.1, §7.4, §10). Este catálogo ya tiene **7,3 %** de canales sin manifest (403/406/407).
10. **El punto de agresividad del timeout NO se fija en este documento: se descubre.** `timeout óptimo/host = p99 de las duraciones de segmentos QUE SÍ FUNCIONARON`; el contrato entrega al LLM las **cuatro evidencias** (contrafactual, clasificación del fallo, efecto en el buffer, distribución viva por host) y la **regla de convergencia** (N≥30 eventos, paso ≤20 %, banda ±10 %, anti-oscilación) — §7.5.

---

## 1. Artefactos examinados, identidad y qué NO se midió

| Objeto | Identidad verificada en esta tarea | Estado |
|---|---|---|
| Motor JIT | `tools/lab/ape-jit/server.js` · **470.702 B** · `sha256 A4C62F7C…FC2D` | **LEÍDO** (bytes del repo) |
| Copia anterior del motor | `vps/ape-jit/server.js` · **449.392 B** · `sha256 290B1103…B492` | **LEÍDO** — mismo `loadMap()` por petición (def. línea 4701) |
| Mapa de canales | `/opt/ape-jit/current/channels.json` · **4.944.656 B · 21.224 entradas** — `JIT_RECONCILE_PICKLIST_20261113.md:86` | **CITADO**, no leído (vive en el VPS) |
| Índice PHP | **1.485.312 B · 21.224 canales** — `PROBE_LATENCY_MEASURED_20261115.md:130` | **CITADO** de t75 |
| Sobre de cabeceras | **202 claves · 7.113–7.935 B** reales; topes declarados 200/8.192 B y 256/16.384 B — `ape_arch_map` | **CITADO** |
| Muxer del motor | `-seg_duration 2 -window_size 6 -extra_window_size 2` — `ape_arch_map` | **CITADO** |
| Medición de t75 | `docs/audits/PROBE_LATENCY_MEASURED_20261115.md` · **17.311 B** · `sha256 9DA83ED8…C1CE` | **LEÍDO y verificado**: coincide con el sha256 declarado por el capitán |
| Datos crudos de mi harness | `docs/audits/data/REALTIME_LATENCY_BUDGET_20261115.runs.json` · 10.947 B · `sha256 65b8eb31…3194` | **EN EL REPO** |

**Paridad repo↔VPS: NO VERIFICADA aquí.** El último sha del motor registrado como desplegado es `8e9e663b…` (`502_FIX_20261114.md:112`), distinto de los 470.702 B leídos aquí. No abrí el VPS (prohibido por el encargo). Lo que sí se establece: el defecto de §2.2 **existe en las dos versiones locales registradas como desplegadas en fechas distintas** (`290B1103…` y `A4C62F7C…`), así que no es un accidente del fichero más nuevo.

**Medido en esta tarea (host del operador, Windows 11 x64, 16 vCPU, Node v24.12.0):** coste de las primitivas del camino. **No es el VPS de 3 vCPU** y por tanto **no es una cota del VPS**: lo que transfiere es la **estructura** (A/B en el mismo proceso, misma petición, mismo fichero), no el valor absoluto. El valor absoluto del VPS queda **NO MEDIDO** y es el gate G0 (§13).

**No se re-midió nada** de lo dado por medido: probe de navegador (0/21.224), probe de manifest del briefing, probe profundo, 3 hosts, alturas reales, ni la tanda de t75.

---

## 2. El camino, fase por fase, con presupuesto y con la medida al lado

Ruta canónica: `GET /jit/live/<id>/master.m3u8` (o `media_0.m3u8`, o `chunk-*.m4s`) → nginx → JIT `127.0.0.1:3099` → respuesta.

### 2.1 Tabla fase → presupuesto → cómo se mide

| # | Fase | Presupuesto | Medido hoy | Cómo se mide (instrumento, no opinión) |
|---|---|---|---|---|
| P0 | Salto nginx → JIT (loopback, sin proveedor) | **≤ 200 µs** | ancla: `\|rt−urt\|` medio **0,521 ms** en `/pulse` — incluye PHP, así que 200 µs para un salto puro es **presupuesto** — `LIVE_CAPTURE_20261114.md:257` | `$upstream_connect_time`/`$upstream_header_time` en el `log_format`; hoy solo hay `rt`/`urt` |
| P1 | Parse HTTP + regex de ruta + `safeId` + clase de player por UA | **≤ 50 µs** | no aislado; **cota superior**: toda la petición loopback con tabla caliente = **p50 0,53–0,77 ms** (variante B) | `perf_hooks` en el borde del handler; `node --cpu-prof` para el reparto |
| P2 | **Lookup de tabla en memoria** (`id` → `{url, ua}`) | **≤ 2 µs** | **121–174 ns/op** (`Map.get`, 3 corridas); en PHP: **0,000 ms** array/APCu · **0,0029 ms** SQLite (t75) | micro-bench Anexo A · `t75_lookup.php` |
| P3 | **Lectura de telemetría previa** en el camino | **0 µs — prohibido** | hoy `/jit/tune` lee el journal completo: **p50 5,78–6,67 ms** a 1.000 líneas; **40,5–69,7 ms** a 10.000 | micro-bench `journal` (Anexo A) |
| P4 | **Escritura de cabeceras** | **≤ 20 µs** (≤12 cabeceras) · **≤ 500 µs** si algún día viaja el sobre de 202 claves | sobre completo precalculado (202 claves, ≈9,6 KB): **+0,43–0,99 ms p50** sobre la variante B | variante C vs B del harness |
| P5 | **Entrega de la primera línea del manifest** (`writeHead` + `res.write`) | **≤ 300 µs** | loopback con tabla caliente: **p50 0,53–0,77 ms · p99 1,64–2,18 ms** (incluye kernel+socket) | TTFB de cliente loopback keep-alive, 400 peticiones |
| — | **Σ DECIDE + primera línea** | **≤ 1.000 µs interno · p99 ≤ 5.000 µs de extremo a extremo** | **p50 0,97–1,76 ms · p99 2,79–4,46 ms** (variante C) | las tres anteriores sumadas por la misma instrumentación |

**Lectura directa:** el presupuesto de 5 ms **no se agota por CPU**. Con tabla precalculada, p50 sobra **2,8×–5,2×**; el **p99 entra por 1,1×–1,8×**, margen escaso en un host con ruido. Conclusión honesta: **cabe, pero el umbral p99 hay que medirlo en el VPS (G0/G2), no asumirlo**. Hoy el presupuesto se agota por **una decisión de diseño**: releer la tabla entera en cada petición.

### 2.2 La línea que se come el presupuesto

```
server.js:4727   function loadMap() {
server.js:4728     try { return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')); }
```

Llamada en **9 puntos**, y tres están **en el camino de reproducción**:

| Línea | Qué sirve | Peticiones afectadas |
|---|---|---|
| `9461` | handler `/live/<id>/(master\|media_N\|init-*\|chunk-*)` | **una por cada segmento** — con `-seg_duration 2`, al menos 1 cada 2 s por cliente |
| `9436` | `/live/<id>/manifest.json` | 1 por arranque |
| `6711` | `/go/<id>` (el 302) | 1 por zapeo |
| `6692` · `6628` · `6579` · `5582` · `4038` · `8006` | catálogo, meta, manifest 6K, gobernanza | según uso |

Medición de esa línea, con fichero **del tamaño real** (4.944.205 B ≈ 4.944.656 B reales), forma real `{url, ua}`, 21.224 entradas, caché de página caliente, **tres corridas**:

| Operación | p50 | p90 | p99 | max |
|---|---|---|---|---|
| `readFileSync` (Buffer, 4,94 MB) | 3,43–3,95 ms | 5,33–5,86 ms | 6,84–13,82 ms | 14,8–21,7 ms |
| `JSON.parse` del string | 5,00–5,57 ms | 6,10–7,43 ms | 8,09–10,51 ms | 8,72–33,42 ms |
| **`loadMap()` = leer utf8 + parsear** | **53,33–70,53 ms** | 70,4–139,1 ms | **89,86–241,36 ms** | 112–374 ms |

> La asimetría entre las dos primeras filas (≈9 ms sumadas) y la tercera (≈55–70 ms) **no es un error**: `readFileSync(..., 'utf8')` construye un string de 4,9 M caracteres (~9,9 MB en memoria) y el `JSON.parse` construye 21.224 objetos. El coste dominante es **asignación y GC**, y es lo que paga el motor en cada petición. Una corrida suelta de `JSON.parse` bajo presión de GC dio **25,7 ms p50** — declaro la varianza en vez de elegir la cifra baja.

**Prueba A/B del mismo harness (misma petición, mismo proceso, mismo fichero):**

| Escenario | TTFB p50 | TTFB p90 | TTFB p99 | 20 concurrentes (total) |
|---|---|---|---|---|
| **A** — `loadMap()` por petición (lo que hace el motor) | **52,8–70,2 ms** | 71,8–102,2 ms | 102,5–230,7 ms | **1.001,7–1.466,2 ms** |
| **B** — `Map.get()` sobre tabla construida una vez | **0,53–0,77 ms** | 1,04–1,15 ms | 1,64–2,18 ms | **11,1–21,5 ms** |
| **C** — B + sobre de 202 cabeceras (≈9,6 KB) | **0,97–1,76 ms** | 1,71–3,17 ms | 2,79–4,46 ms | 22,5–31,5 ms |

**A/B p50 = 77×–105×. Con 20 concurrentes = 68×–105×.** Construir la tabla **una vez** cuesta **6,72–9,11 ms** (`new Map(Object.entries(…))`): el precio de eliminar el defecto se paga una vez por arranque.

**Lo que ese defecto cuesta en abstracto, sobre números medidos:**

- **18,9–24,9 minutos de CPU** para recorrer el catálogo una vez (21.224 × 53,3–70,5 ms), releyendo un fichero **que no cambió**.
- Un cliente a un segmento cada 2 s: **26,7–35,3 ms de CPU por segundo = 2,7 %–3,5 % de un núcleo por cliente**, solo en relecturas.
- El motor **ya sabe cachear**: `namesFor()` guarda con TTL de 300.000 ms (`server.js:5377-5381`). La misma idea, aplicada al mapa, no existe.

**Honestidad sobre este número:** 53–71 ms es la medición en **este** host, con dispersión (una de las tres corridas dio p50 70,5 ms y p99 241 ms: la máquina estaba más cargada). En el VPS el valor absoluto casi seguro **no es menor**, pero no lo he medido (G0). Lo que **no depende del host** es el cociente A/B y el hecho de que **la tabla se relee íntegra por petición**. Datos crudos: `docs/audits/data/REALTIME_LATENCY_BUDGET_20261115.runs.json` (`sha256 65b8eb31…3194`) — la tabla no se puede leer sin poder recomputarla.

---

## 3. Lo que NO cabe en 5 ms, con el número medido al lado

| # | Pieza | Coste medido | Múltiplo del presupuesto | ¿Cabe? |
|---|---|---|---|---|
| 1 | **Fetch del manifest al proveedor** | **p50 645 ms · p95 5.526 · p99 8.223** (N=41, t75) | **129×–1.645×** | **NO** — nunca |
| 2 | **Primer segmento** (medido: `Range` se ignora, se baja entero) | **p50 925 ms · p95 1.251 · max 10.603** (N=38, t75) | 185×–2.121× | **NO** — nunca |
| 3 | **`ffprobe` sobre el segmento** | **p50 83,12 ms · p95 127,51** (N=38, t75) | 16,6×–25,5× | **NO** — por sí solo ya excede el presupuesto |
| 4 | **Probe completo por canal** (1+2+3) | **1.653 ms** = 645+925+83 (t75) | **330,6×** | **NO** — ni de lejos |
| 5 | **Primer chunk de ffmpeg** (arranque del transcode del JIT) | **NO COMPUTADO**; suelo estructural **≥ 2 s** por `-seg_duration 2` | ≥ 400× | **NO** — y falta medirlo |
| 6 | **Reconcile sincrónico** (`execFileSync` en el handler) | tope en código **90.000 ms**; **106 ms** medidos con reconcile muriendo rápido — `JIT_TRUTH_20261111.md:421-424,715` (R-09) | 21×–18.000× | **NO** — y bloquea *todas* las peticiones: Node es monohilo |
| 7 | **Zapping percibido** (`/pulse`, VPS real, n=655) | **p50 0,650 s · p99 7,180 s · max 11,889 s** — `LIVE_CAPTURE_20261114.md:178` | 130×–1.436× | **NO** — el 99,97 % es el proveedor |
| 8 | **Medir la calidad real desde el navegador** | **0 de 21.224** verificados (sin `Access-Control-Allow-Origin`; `User-Agent` prohibido en `fetch`) | ∞ (no hay camino) | **NO** — imposible por diseño del proveedor |
| 9 | **Verificar `RESOLUTION` en el manifest** | **18/20 HTTP 200 y 0 verificados**: los proveedores sirven **listas de medios** (`#EXT-X-VERSION:3`, `#EXTINF:10`, `.ts`) sin `RESOLUTION` | 129× solo para llegar al 200 | **NO** — el dato no existe en ese documento |
| 10 | **Recomponer los 21.224 canales** | 21.224 × 53,3–70,5 ms ≈ **18,9–24,9 min** de CPU (mi medida); censo real de probe = **9,7 h secuenciales** (t75) | 236.400× | **NO** — ni en 5 ms ni en 5 min |
| 11 | **Medir 5 ms desde el cliente** sobre la red del operador | RTT medido **21 ms** — `PRUEBA_FISICA_REA_654_20261108.md:412` | el instrumento es 4× el presupuesto | **NO** — 5 ms solo es medible **dentro** del VPS |

**Consecuencias que no se maquillan:**

- **«Sintonización en 5 ms» es falso hoy por 130×–2.121×.** Lo que se puede prometer es **«decisión del servidor en <5 ms»**. Son dos afirmaciones distintas y la segunda es la única que esta página respalda.
- **Medir y decidir en el mismo camino es incompatible** por 330,6×. No hay tuning que cierre esa brecha: la única salida es **sacar la medida del camino**.
- **Corrección de un dato previo:** el segmento **no** pesa 1,6 MB: **p50 4,30 MB, máx 16,74 MB** (t75). La suposición anterior subestimaba **3,2×** el tráfico y, con ella, todo censo de canales.

---

## 4. El coste de medir, medido por t75 (no re-medido)

Fuente: `docs/audits/PROBE_LATENCY_MEASURED_20261115.md` (17.311 B, `sha256 9da83ed8…c1ce`), crudo `/var/lib/ape/t75_measure.jsonl` (`087b5290…71eb7`). N=41 canales = 20 evestv + 20 line + 1 x1megaott.

### 4.1 Dónde se van los 5 ms (la fila que decide)

| Métrica (PHP 8.3.6) | p50 | p95 | p99 | vs 5 ms |
|---|---|---|---|---|
| Lookup en array PHP (índice ya decodificado) | **0,000 ms** | 0,001 | 0,001 | bajo la resolución del cronómetro |
| Lookup vía **APCu** | **0,000 ms** | 0,001 | 0,001 | idem |
| **SQLite** `SELECT url FROM ch WHERE id=?` | **0,0029 ms** | 0,006 | 0,0179 | **1.724× de holgura** |
| Leer el índice JSON del disco (1.485.312 B) | 0,158 ms | 1,065 | 1,090 | 31× |
| **`json_decode` del índice (21.224 canales)** | **4,041 ms** | **4,767** | **6,606** | **80,8 % del presupuesto — y p99 lo EXCEDE** |

**El hallazgo, dicho sin rodeos: no es el lookup, es cargar la tabla entera.** `json_decode` paga **4,041 ms de los 5** en cada petición sin caché, y su **p99 (6,606 ms) rompe el presupuesto él solo**. Es exactamente el mismo antipatrón que `loadMap()` en el motor JIT (§2.2) — dos lenguajes, dos medidas independientes, un solo error de arquitectura.

> **Exigencia que este dato impone al contrato (no negociable):** la tabla se sirve desde **APCu o SQLite**, **nunca** `json_decode` del índice en el camino caliente. Medido: APCu 0,000 ms · SQLite 0,0029 ms → quedan **≥4,99 ms libres** para la red y las cabeceras.

### 4.2 Cuántos probes hacen falta de verdad

| Ámbito | Firmas | 1 probe/firma | ±5 % al 95 % | ±3 % | ±1 % |
|---|---|---|---|---|---|
| catálogo completo (21.224) | — | cobertura 100 % de **cuentas**, confianza ~0 sobre la mezcla | **378 probes** | 1.017 | 6.613 |
| por (host + ruta) | **3** (credenciales idénticas por host) | 3 probes | — | — | — |
| por (host, perfil) | **9** | 9 probes | — | — | — |

Censo real: **21.224 probes = 108,1 GB** (5,09 MB/canal) y **9,7 h secuenciales** (0,6 h con 16 en paralelo). **Y ni así es «verdad»: es una foto del instante.**

### 4.3 Los tres avisos de t75 que este presupuesto suscribe

1. **Los máximos de 8,2 s son el techo `TIMEOUT_S=8` del endpoint, no latencia del proveedor.** La latencia real de un canal colgado queda **NO COMPUTADO**. Una tabla que publique 8,2 s como «latencia del proveedor» miente por instrumento.
2. **El segmento real es p50 4,30 MB (máx 16,74 MB), no 1,6 MB** — 3,2× la suposición. Cambia la cuenta de tráfico (108 GB, no 34 GB).
3. **7,3 % de los canales (3/41) no dan manifest: 403, 406 y un 407 `Proxy Authentication Required`.** `httpStatus` observados: 200×36 · 302×2 · 403 · 407 · 406.

**Qué manda el contrato para esos canales:** se marcan **`NOT_MEASURABLE` con su código HTTP** y **no se inventa calidad**; se conserva la última medida con su antigüedad declarada (`X-APE-Evidence: inherited`) y se reintenta en la vuelta siguiente. Un **407 no se puede medir con el agente actual** y el operador debe decidirlo explícitamente: o se dota de credenciales de proxy al prober, o el canal queda `NOT_MEASURABLE` de forma permanente y visible. Lo que **no** puede pasar: que un canal sin medida herede una etiqueta de calidad como si estuviera medida.

---

## 5. La arquitectura honesta: DECIDIR en <5 ms, MEDIR fuera

### 5.1 Reparto de responsabilidades

```
                        CAMINO CALIENTE (<5 ms, sin fs / sin red / sin subprocess)
  player ──GET──▶ nginx ──▶ JIT handler
                                │  P1  safeId + clase de player          <= 50 us
                                │  P2  tabla.get(id)  (APCu | SQLite | Map)  <= 2 us
                                │  P3  snapshot[id] = {codec,res,level, perfil, evidencia, version}
                                │  P4  cabeceras (objeto congelado)      <= 20 us
                                └  P5  writeHead + primera linea        <= 300 us
                                        │
                                        └─ X-APE-Table: vN   ← prueba de QUÉ tabla decidió
                                           X-APE-Evidence: measured|inherited|none|not_measurable
                                           X-APE-Decided-At: <iso>

  FUERA DEL CAMINO (asincrono, sin limite de 5 ms)
  worker de medida ──▶ probe manifest (p50 645 ms) ──▶ primer segmento (925 ms) ──▶ ffprobe (83 ms)
         │
         └─▶ escribe snapshot-vN.json  (tmp + rename atomico)   ──▶ engine publica vN
             (realimentacion: la proxima vuelta decide con lo medido en esta)
```

**Seis reglas que hacen la arquitectura verificable:**

1. **El camino caliente no hace I/O.** Cero `fs.*`, cero `child_process.*`, cero `net`/`http`, cero `json_decode` del índice. Verificable por shim que **lanza** (G1).
2. **La tabla se construye en el arranque y se sustituye por puntero.** Una asignación de referencia es atómica en el modelo de concurrencia de Node: no hay lectura a medias.
3. **La medida entra por fichero versionado.** `snapshot-vN.json` se publica con `tmp + rename` — el patrón que el motor ya usa en `server.js:715-716`.
4. **Toda decisión declara su procedencia y su lado.** `X-APE-Table` + `X-APE-Evidence` + el campo `LADO` de §6: "aplicado" pasa de etiqueta a hecho comprobable.
5. **La telemetría no se lee: se escribe.** El camino solo appendea a un **ring en memoria** (0,1 µs) y un timer lo vuelca. Hoy `appendFileSync` = **92,1 µs p50 / 336,5 µs p99** por registro: cabe, pero es **920×** más caro que el ring y es una syscall en el camino.
6. **El control no vive en el camino.** `/go/<id>?p=Px` hoy **escribe config en disco y para el ffmpeg en curso** dentro de la petición (`server.js:6739-6742`). Esa acción se mueve a una cola; coste actual **NO COMPUTADO**, pero es una escritura + un kill en el camino caliente.

### 5.2 Arranque en frío: se declara, no se disimula

| Situación | Respuesta exigida |
|---|---|
| Tabla aún no construida (`version = 0`) | **503 fail-closed** con `X-APE-Table: none`. Nunca servir decidido por defecto |
| `snapshot-vN.json` corrupto o de otra versión | conservar `vN-1` y marcar `X-APE-Evidence: inherited` con su antigüedad |
| Medida más vieja que su TTL | seguir decidiendo con `inherited` y **declararlo**; el worker reintenta |
| Canal `NOT_MEASURABLE` (403/406/407) | decidir por defecto **declarado** (`X-APE-Evidence: not_measurable`) y **nunca** heredar una etiqueta de calidad |
| Canal desconocido | 404 (comportamiento actual, `server.js:9462`) |

---

## 6. Contrato de dos lados: VPS y APK

**Frontera corregida por el operador (textual):** *«el sí puede ir dentro de la APK, se toca para implementarlo, pero luego de implementarlo, el no puede modificar nada de la APK, solo los valores de lo que dijimos en tiempo real»*.
→ **«No tocar la APK» aplica al RUNTIME del operario ya instalado, no a la construcción.** La APK **sí** se modifica para meter el operario dentro. Lo que queda congelado tras la construcción es el **binario**; lo mutable son **valores declarados**, cada uno con su lado.

### 6.1 Cadencia por lado — son distintas y esa diferencia es «tiempo real»

| Dimensión | **LADO APK** | **LADO VPS** |
|---|---|---|
| Qué se aplica | ajustes de dispositivo, parámetros de shader/VPP, **capturador de pantalla**, modo de display | metadata del manifest: `RESOLUTION`, `CODECS`, perfil declarado, `EXTHTTP`, URL; y el plan de encode del motor |
| Cuándo se aplica | **INMEDIATO y local. No espera a nadie** | **cuando el player vuelve a pedir el manifest** |
| Latencia de aplicación | **NO COMPUTADO** — no instrumenté el ciclo del capturador/aplicador en esta tarea | **la marca el ciclo de recarga del player, NO nuestro código.** Suelo medido en el motor: `max-age=2 s` (media) / `5 s` (master) / `immutable` (init y segmentos). El ciclo del player: **NO COMPUTADO** |
| Cómo se mide | recibo del device con id de frame/captura | `X-APE-Table: vN` + hash de la lista servida + `rt`/`urt` del `log_format` |
| Qué NO puede hacer | — | **no** puede esperar a un probe: 330,6× el presupuesto |

**El suelo del lado VPS, del código del motor** (`ape_jit_contract`: `server.js:57-82`, y `setObjectCacheHeaders` en `4393-4399`):

```
master/manifest.mpd : max-age=5,  stale-while-revalidate=60, stale-if-error=600
media_N.m3u8        : max-age=2 / 10 / 30   (segun tipo)
init-*.m4s, chunk-* : max-age=31536000, immutable
```

→ **Consecuencia honesta:** un cambio de receta/plan **no alcanza al player hasta que pide un manifest nuevo**, y un `init`/`chunk` ya cacheado con `immutable` **no se refresca**. El «tiempo real» del lado VPS es, como mínimo, **2–5 s** y en la práctica **lo dicta el player**: hoy **NO COMPUTADO**. Método para medirlo (una línea de log, sin tocar el VPS ahora): histograma de deltas entre peticiones consecutivas del mismo `id` en `playlist_access.log`.

### 6.2 Cada valor declara su lado — y se valida

Todo delta (perilla) viaja en el journal/recibo con este esquema mínimo:

```json
{ "perilla": "pq_ai_sr_enable",
  "lado": "APK",
  "via_entrega": "LOCAL",
  "valor_antes": false, "valor_despues": true,
  "cadencia_ms": null,          // null = NO COMPUTADO; jamas 0 para decir "no medido"
  "evidencia": "measured|inherited|not_measurable",
  "recibo": "<id del frame o de la tabla vN>" }
```

**Regla de validación (fail-closed):** existe una tabla `lado_esperado[perilla]`; si el `lado` del delta no coincide con el esperado, **se rechaza el delta, se registra el rechazo y no se aplica nada**. Combinaciones admitidas:

| `lado` | `via_entrega` | Ejemplos | Cadencia que hereda |
|---|---|---|---|
| **VPS** | plan de encode del motor | `profile`, `recipe`, `ten_bit`, `x265_threads` (`imageConfig`) | próximo arranque de transcode |
| **VPS** | `MANIFEST` | `RESOLUTION`, `CODECS`, `EXTHTTP`, `#EXT-X-APE-ENHANCE-STATE` | recarga del manifest (suelo 2–5 s) |
| **APK** | `MANIFEST` | `#EXTVLCOPT:video-filter`, `network-caching` | recarga del manifest **y** el player lo aplique |
| **APK** | `LOCAL` | `pq_ai_sr_enable`, `ai_sr_level`, `pq_*_dnr`, modo de display, capturador | **inmediata** (ciclo propio, NO COMPUTADO) |

**El error que este campo impide:** declarar en el manifest un valor que solo el APK puede aplicar (o al revés) y cantarlo como «aplicado». `#EXT-X-APE-ENHANCE-STATE` es metadata del **lado VPS**: prueba que se **declaró**, no que el frame cambió. El cambio de frame es **lado APK** y necesita recibo del device.

### 6.3 Advertencia medida sobre el «capturador de pantalla»

El operador sitúa el capturador en el lado APK. **Medido en este repo, tres veces de forma independiente:**

- `screencap` captura el **buffer de composición de Android, ANTES del post-proceso VPP y ANTES de la salida HDMI** — `SEGMENT_PROXY_FIX_20261114.md:66-68`, `VPP_SOC_QUALITY_20261114.md:68`, `FLUIDITY_20261114.md:153`.
- Consecuencia: **una captura nunca mostraría el efecto del VPP**. Comparar capturas para «demostrar» mejora de imagen es **falso positivo garantizado**.
- La única medida válida del efecto es **capturador HDMI externo** o analizador de señal — **propuesta, no ejecutada**.

→ En el contrato: el capturador APK vale como **disparador y telemetría** (que el flujo corre), **nunca como prueba de píxeles**. Afirmar «imagen mejorada» con un `screencap` en la mano es exactamente el modo de fallo que este equipo persigue.

---

## 7. Política de buffer: «infinito» = el buffer **nunca llega a cero**, no «infinitos segundos»

**Definición operativa del operador (textual, tercera corrección):** *«INFINITO ES QUE NUNCA PERMITA QUE LA REPRODUCCION SE ACABE, ASI SEA CON VENTAJA DE 3, 4, 5 SEGUNDOS, EL TIENE QUE AJUSTAR PARA QUE ESO SE MANTENGA BAJO CUALQUIER CONDICION Y SI PUEDE SUBIR MAS SIN SACRIFICAR SEGUNDOS O LATENCIA QUE LO HAGA, PARA EL MEJOR»*.

**Qué significa y qué no:**

- **«Infinito» = el buffer NUNCA llega a cero.** *No* significa acumular segundos sin límite.
- **Con 3–5 s de ventaja basta**, si el operario la mantiene. El suelo declarado es ese rango, no un número enorme.
- **Subir profundidad sin coste de latencia es mejora, no objetivo.** (Y aquí hay que ser exacto: *profundidad* siempre es latencia. Lo que se puede subir **gratis** es la **velocidad de recarga**; la profundidad sólo sube hasta el techo de latencia declarado — §7.2.)

### 7.1 La ley de control, escrita como desigualdad

```
        buffer > 0        <=>        velocidad de RECARGA  >  velocidad de DRENAJE
```

**La profundidad da MARGEN. La velocidad de recarga da CERTIDUMBRE.** Con 3–5 s de margen y recarga más rápida que el consumo, no se corta. Con 30 s de margen y recarga más lenta que el consumo, **se corta igual, sólo que más tarde**.

**La velocidad, en unidades medibles** — velocidad de recarga en *segundos de media por segundo de reloj*:

```
r = duracion_del_segmento / tiempo_de_fetch        (r > 1  =>  el buffer crece)
```

| Escenario (medido, t75) | r | Lectura |
|---|---|---|
| segmento 10 s / fetch **p50 0,925 s** | **10,8×** | el buffer se rellena 10 veces más rápido de lo que se consume |
| segmento 10 s / fetch **p95 1,251 s** | **8,0×** | sigue sobrando velocidad |
| segmento 10 s / fetch **peor medido 10,603 s** | **0,94×** | **por debajo de 1: ese segmento DRENA el buffer** |

> **Punto de equilibrio medido: un fetch igual a la duración del segmento (10 s).** Todo lo que tarde menos suma; todo lo que tarde más resta. Con el peor segmento medido (10,603 s) el sistema **pierde** 0,6 s de ventaja en una sola descarga. Eso no se arregla con más profundidad: se arregla con **recarga** (reintento, reconexión, ruta) — o se declara el corte.

### 7.2 Los parámetros: suelo, banda de trabajo, techo de latencia y almacenamiento

| Parámetro | Valor | Quién lo cambia | Por qué ese valor |
|---|---|---|---|
| **`APE_BUFFER_FLOOR_S`** — ventaja mínima | **4 s** · rango **3–5 s** | **sólo el operador** | es el rango que el operador declara suficiente; por debajo del suelo se dispara la **regla de recarga** (§7.4) |
| **Banda de trabajo** | **4 s ≤ buffer ≤ 18 s** | — | suelo 4 s; techo 18 s = `D_max 20 s` − ~2 s de pipeline del player |
| **Objetivo de trabajo** | **6 s** = suelo + 1 segmento JIT (2 s) | — | **histéresis de 2 s**: evita oscilar en el borde del suelo |
| **`APE_MAX_DELAY_S`** — retraso máximo acumulado | **20 s** · rango **8–45 s** | **sólo el operador**, con registro firmado (`canal_id, device_id, valor_anterior, valor_nuevo, motivo, fecha`) — **el LLM no puede** | cada segundo de buffer **es** un segundo de retraso: es el techo que el operador compra |
| **Cap de almacenamiento por canal** | **64 MB** | operador | 18 s al **peor** segmento medido (16,74 MB/10 s = 13,4 Mbps) = **30,1 MB** → **2,1×** de margen |
| **Cap global** | **min(25 % de `/dev/shm`, N × 64 MB)** | — | el `/dev/shm` real del VPS: **NO COMPUTADO** aquí; se lee al arrancar y se publica en `/health` |
| **Al alcanzar el cap** | **reciclar el segmento COMPLETO más viejo**; jamás el que se escribe; jamás un directorio que un hijo vivo pueda estar escribiendo | — | el motor ya pagó esta lección: **cuatro productores de ENOENT** documentados en `server.js:4733-4755` |
| **Si el más viejo es el único segmento** | **parar y reportar `BUFFER_EXHAUSTED`** | — | fail-honest: nunca silencio, nunca un manifest que promete segmentos que no existen |

**Un `APE_MAX_DELAY_S` por debajo de 13 s no es una política: es un corte programado.** Con el peor segmento medido (10,603 s), una sola descarga lenta consume toda la ventaja. El número se queda escrito para que nadie lo baje «para reducir el retraso» sin saber qué compra.

### 7.3 La fuente puede morir: la promesa se escribe con sus dos condiciones

> **Formulación honesta, la única sostenible:**
> **«La reproducción no se corta mientras haya RED y la FUENTE siga viva.»**

Dos condiciones, no una. Si el canal deja de emitir, el buffer se agota y la reproducción para: **ningún buffer sobrevive a una fuente que ya no existe**. Y este catálogo ya tiene fuentes que no responden: **3 de 41 (7,3 %) sin manifest — 403, 406 y 407** (t75), más **2 timeouts** contra el techo `TIMEOUT_S=8`.

**Consecuencia:** un canal `NOT_MEASURABLE` (403/406/407) **no es un problema de buffer** y no se «arregla» acumulando segundos. Se declara con su código HTTP (§4.3).

### 7.4 LA REGLA DE RECARGA — lo que el contrato exige y el párrafo anterior no bastaba

Cuando la ventaja baja del suelo (**4 s**), el operario actúa **sobre la recarga**, en este orden, y **nunca sobre la imagen**:

| # | Palanca (perilla real) | Valores declarados | Qué compra |
|---|---|---|---|
| 1 | `X-Prefetch-Segments` | **8** | más adelanto descargado |
| 2 | `X-Parallel-Segments` | **4** | más peticiones en vuelo — **ver aviso abajo** |
| 3 | `X-Retry-Count` / `X-Retry-Delay-Ms` | **15,12,10** / **120,200,350** | recuperación tras fallo |
| 4 | `X-Max-Reconnect-Attempts` / `X-Reconnect-Delay-Ms` | **40** / **50,100,200** | reconexión |
| 5 | `X-Connection-Timeout-Ms` | **2500,3500,6000** | fallar rápido en una conexión **muerta** |
| 6 | `X-Read-Timeout-Ms` | ladder **6000,9000,12000** | ver §7.5: **el valor es la salida del estimador (p99 de éxitos por host), no una constante de este documento** |
| 7 | `exoplayer.load_control.bufferForPlaybackAfterRebufferMs` | **2000** | no abandonar tras un corte |
| 8 | `com.ape.network_resilience.retryCount` / `retryBackoffMs` | **5** / **500** | reintento en el lado APK |
| 9 | velocidad de la ruta (proxy/JIT) | — | la única palanca de *velocidad* real; medido: la ruta **no** añade latencia (**0,521 ms**, `LIVE_CAPTURE_20261114.md:257`) |

**PROHIBIDO en la regla de recarga:**

- **`X-Concurrent-Downloads = 8` es SSOT y NO se sube** — `AGENTS.md`: 256/200 saturaban el proveedor. **Subirlo no es una perilla disponible.**
- Bajar resolución, códec, fps, bitrate o apagar HDR (§10). La solución estándar contra un corte —que el player baje de calidad— **está prohibida en este repo**.
- `X-Prefetch/Parallel` **no se pueden prometer en vano**: el proveedor acepta **max_connections=1** (`server.js:4758-4760`), así que el paralelismo efectivo contra el proveedor está acotado por ese slot único. **Cuánto de `X-Parallel-Segments=4` es real y cuánto es declaración: NO COMPUTADO** — y hay que medirlo antes de contarlo como palanca (patrón «declarado ≠ aplicado»).

### 7.5 El punto de agresividad NO se fija: se descubre. Y el contrato define cómo

**Corrección del operador (textual, cuarta):** *«PRECISAMENTE PARA ESA MIERDA ESTA UN LLM QUIEN EN TIEMPO REAL PODRA SABER ESO»*. Tiene razón: el punto cambia **por host, por hora y por carga del proveedor**, así que un número fijo en un documento es una foto caducada. Lo que este contrato entrega no es el número: son **las señales, el estimador y la regla de convergencia**.

#### El óptimo tiene una definición, no es intuición

```
        timeout óptimo por host  =  p99 de las duraciones de segmentos QUE SÍ FUNCIONARON

        por debajo  ->  matas segmentos buenos que sólo iban lentos  =  corte provocado por el operario
        por encima  ->  te cuelgas esperando a un muerto             =  corte por no reaccionar
```

**Prior del que arranca el LLM (medido por t75, no inventado):** segmento **p50 925 ms · p95 1.251 ms · max 10.603 ms**. Por host, la distribución de **éxitos** (N=19 cada uno):

| host | p50 | p95 | p99 (orden estadístico) | max de éxitos | semilla conservadora |
|---|---|---|---|---|---|
| evestv.wuitf.com | 892,89 ms | 1.251,45 ms | 1.251,45 ms | **1.610,79 ms** | 1.611 ms |
| line.tivi-ott.net | 1.009,39 ms | 1.081,23 ms | 1.081,23 ms | **10.602,78 ms** | 10.603 ms |
| nfqdeuxu.x1megaott.store | *NO COMPUTADO* | — | — | — (0 segmentos) | sin semilla |

**Y aquí está el regalo que t75 ya dejó hecho:** el `p99` con **n=19 es el penúltimo valor**, no un percentil (t75 §9: para un p99 utilizable hacen falta **n≈1.000**). Por eso la semilla de `line` es **10,6 s** por **un solo** éxito lento, mientras su p99 real es **1,08 s**. **Ese es exactamente el trabajo del LLM**: distinguir la cola real del outlier, host por host, en vivo.

#### Las cuatro evidencias que el contrato EXIGE (si falta una, no está midiendo: adivina con un modelo encima)

| # | Evidencia | Qué se registra | Por qué es obligatoria |
|---|---|---|---|
| **E1** | **La contrafactual** | `timeout_que_lo_mató_ms` **y** `duración_del_reintento_exitoso_ms` del **mismo** segmento | sin esto no hay prueba de que el segmento *habría* llegado: el reintento exitoso **es** la prueba de que el timeout fue demasiado agresivo |
| **E2** | **La clasificación del fallo** | `timeout` \| `404` \| `403` \| `407` \| `5xx` \| `reset` | **sólo el timeout es culpa del umbral**. Subir el timeout contra un 403 no arregla nada: distraería al LLM en la dirección equivocada |
| **E3** | **La trayectoria del buffer durante el evento** | `buffer_antes_s`, `buffer_despues_s`, `delta_s` | un timeout que costó **200 ms sin tocar el buffer** no es el mismo que uno que **vació 2 s**: el LLM necesita el **efecto**, no sólo el hecho |
| **E4** | **La distribución en vivo por host** | p50/p95/p99 de duraciones **exitosas**, actualizados, con `n` | es el prior que se refina; con **3 hosts** es barato de mantener |

Nota de honestidad sobre E4: mientras `n < 1.000` por host, el p99 no es un percentil fiable (t75 §9). El contrato obliga a: (a) publicar `n` junto al p99; (b) usar el **envolvente conservador** (max de éxitos) como cota superior mientras no haya muestra; (c) **no bajar** de ese envolvente por una corazonada del modelo.

#### La regla de convergencia (sin ella, un LLM oscila)

| Regla | Valor declarado | Razón |
|---|---|---|
| **Evidencia mínima para mover** | **N ≥ 30 eventos** del tipo relevante (E1 con su E2/E3) | con una tasa de cruce del ~10 %, 30 eventos dan ~3 casos: un evento aislado no mueve una perilla |
| **Paso máximo** | **20 % del valor vigente**, y nunca más de **500 ms** por movimiento | sin tope de paso, un solo evento provoca un salto y empeora |
| **Dominio admisible** | el **ladder declarado** del perfil: `X-Read-Timeout-Ms ∈ [6000, 12000]` | si el óptimo descubierto **excede** el ladder, **se escala al operador**; no se sale del sobre en silencio |
| **Banda muerta** | **±10 %** alrededor del valor vigente | evita que el ruido mueva la perilla |
| **Enfriamiento** | **15 min** por perilla y host | una ventana de medida por movimiento, no un bucle |
| **Anti-oscilación** | **≥ 3 idas y vueltas en 1 h** → congelar en la **mediana de los últimos 5 valores** y emitir `LLM_OSCILLATION` | un lazo que oscila es peor que un valor subóptimo |
| **Reversión** | si la métrica empeora en **2 ventanas consecutivas**, volver al valor anterior y registrarlo | el cambio se prueba contra el efecto, no contra la intención |

**Lo que el contrato NO hace:** fijar el punto a priori. **El valor es la salida, no la entrada.** Lo que se fija es *cómo se descubre, con qué evidencia y cómo se evita oscilar*.

#### El LLM no entra en el camino de 5 ms

El LLM **detecta, decide y mueve valores**: escribe la **política** (el snapshot versionado de §5). El camino de 5 ms **lee** esa política. Su latencia propia es **irrelevante por construcción** — no aparece en el camino. Su timeout se acota en §11 (2.000 ms recomendado, 4.000 de techo) y su fallo **no** puede tumbar la reproducción.

**Consecuencia práctica:** el rung agresivo (6.000) reduce la espera media y **garantiza** cortar los segmentos lentos que ya sabemos que existen (hasta 10,6 s). El contrato elige **12.000** y compensa con reintento/reconexión, que es donde está la velocidad que no cuesta latencia.

---

## 8. Precedencia de perfil: quién manda cuando el LLM y la tabla discrepan

Hay **dos fuentes** que asignan perfil: el **LLM** (operario) y la **tabla de perfiles versionada** (t76). Un conflicto sin regla es un bug en producción. La regla, en orden estricto:

```
1. TECHO MEDIDO (prober / snapshot)   <- evidencia. No se negocia: es lo que la fuente puede dar
2. TABLA VERSIONADA (t76)             <- declaracion auditable y reproducible
3. LLM                                <- consejo DENTRO del techo y del sobre de perillas
```

| Caso | Quién gana | Qué se registra |
|---|---|---|
| LLM propone un perfil **por encima** del techo medido | **el techo** | `conflict: llm_above_ceiling`, valor propuesto y valor vigente |
| LLM propone un perfil **por debajo** de la tabla, y eso **degrada imagen** | **la tabla** | `DEGRADATION_ATTEMPT` (§10) |
| LLM propone un perfil por debajo, sin degradar (p. ej. fuente ya 720p) | **el LLM**, con motivo | `conflict: llm_below_table`, motivo y evidencia |
| Snapshot **más nuevo** que la tabla | **el snapshot** manda el techo; la tabla se marca **`X-APE-Table: stale`** | versión de cada uno |
| Tabla **más nueva** que el snapshot | **la tabla** manda el valor; el snapshot **sigue capando el techo** | versión de cada uno |
| Perillas de **runtime** (buffer ≤ `D_max`, prefetch, reintentos, estrategia de segmento) | **siempre el LLM**, dentro del sobre | delta con `lado` (§6.2) |

**Nunca un empate silencioso:** toda discrepancia produce **un ganador, un motivo y una línea de log**. Si el operario y la tabla discrepan y no hay regla aplicable, la decisión es **fail-closed**: se sirve lo último declarado y se marca `inherited`.

---

## 9. Reparto entre PROBER y OPERARIO: medir sin robar la conexión del player

El LLM **mide** (es el prober) **y opera**. Son dos trabajos con presupuestos distintos y la ley del proyecto exige separarlos.

| Pregunta | Respuesta del contrato |
|---|---|
| **QUÉ mide** | (a) manifest vivo + latencia; (b) primer segmento: bytes y tiempo; (c) `ffprobe`: resolución, códec, fps; (d) **throughput alcanzable en la conexión única** — la entrada que la política de buffer necesita |
| **CUÁNDO mide** | **fuera del camino caliente, en segundo plano**, y con una regla dura: **nunca sobre el canal que el motor está sirviendo** (el motor conoce su slot: `current.id`). Medir el canal en reproducción es competir con el player por la única conexión del proveedor |
| **CUÁNTO puede gastar** | Coste medido por probe: **1,653 s y 5,09 MB** (t75). Presupuestos declarados: **1 probe en vuelo global**; **cap de ancho de banda del probe = 20 % del throughput medido del canal** si hay reproducción activa (sin reproducción, puede usar la conexión entera); **ronda de censo ±5 % = 378 probes = 1,92 GB y 10,4 min** de conexión (378 × 1,653 s = 624,8 s); **censo completo = 108,1 GB / 9,7 h → prohibido como ronda automática**, sólo con autorización del operador |
| **Cómo evita medir dos veces** | clave **`(channel_id, snapshot_version)`** + TTL; **memo por firma (host + ruta)** para lo que es invariante de cuenta (**3 firmas**); **re-medición sólo por evento** (stall, 403, 502), nunca periódica; tope **1 re-medición por canal y hora**, con backoff |
| **Quién tiene prioridad si compiten** | **el player, siempre**. Si un probe hace que el player pierda un segmento, el probe es el culpable: se aborta el probe y se registra |

**Por qué este reparto no es burocracia:** medir cuesta **330,6× el presupuesto de decisión** y **5,09 MB por canal**. Un operario que mide cuando debería estar sirviendo gasta la conexión que sostiene la reproducción — es decir, **el remedio causa el corte**.

---

## 10. El techo de seguridad de la ley: estabilizar NUNCA es degradar

El operario **no puede** estabilizar bajando resolución, bitrate máximo, fps, ni apagando HDR. Eso es degradación y está prohibido por `docs/policies/ANTI_DEGRADATION_LAW.md`.

**El lecho duro, textual del repo** (`AGENTS.md`): *«El rebuffering se corrige con JIT nativo, ruta/proxy, buffer/prefetch o metadatos honestos, **NUNCA degradando**»*. Y la Ley Anti-Degradación prohíbe expresamente `4K → FHD/HD/SD`, `HEVC → H.264`, `HDR10/PQ → SDR`, `50/60 fps → 25/30` y el recorte de bitrate **para ocultar un fallo**.

**Consecuencia que hay que decir en voz alta: la solución estándar contra un corte —que el player baje de calidad (ABR downshift)— está PROHIBIDA en este repo.** El margen se compra **sólo** con prefetch, paralelismo, retry, backoff, timeouts y velocidad de la ruta (§7.4). Nunca con imagen.

| Propuesta del operario | Veredicto |
|---|---|
| `RESOLUTION` 2160p → 1080p «para que no se corte» | **RECHAZADA** — `DEGRADATION_ATTEMPT` |
| `CODECS` HEVC → AVC para aliviar el decoder | **RECHAZADA** — idem |
| fps 50/60 → 25/30 | **RECHAZADA** — idem |
| Bitrate máximo recortado | **RECHAZADA** — idem |
| HDR/PQ apagado | **RECHAZADA** — idem |
| Caer a F5 / `ORIGINAL_DIRECT_SAFE` «para ir rápido» | **RECHAZADA** — idem |
| **ABR downshift** (bajar de variante para salvar el buffer) | **RECHAZADA** — idem: es degradación, aunque la haga el player |
| **Subir `D_max` hasta el límite declarado / profundidad hasta el techo** | **PERMITIDA** — el buffer se compra con **latencia** |
| **Prefetch, paralelismo, retry, backoff, reconexión, reciclar buffer** | **PERMITIDAS** — no tocan la imagen |

**Registro obligatorio del rechazo:** perilla, valor propuesto, valor vigente, motivo, modelo/vuelta y canal. Un rechazo sin registro es indistinguible de un fallo. Gate **G10** lo prueba con un prompt adversario que pide degradar: **100 % de rechazos registrados, 0 aplicaciones**.

---

## 11. La llamada al LLM: acotada, opcional y jamás en el camino de reproducción

El operario usa la API del LLM. Cuatro límites que el contrato impone:

| Límite | Regla | Verificación |
|---|---|---|
| **Timeout declarado** | `LLM_TIMEOUT_MS` explícito (recomendado 2.000; techo duro 4.000). Al vencer: `llm=timeout`, se aplica el resultado **determinista** y se registra `WARN` visible | G7 fuerza el timeout y comprueba que la reproducción sigue |
| **Respuesta no-JSON** | **Fallo silencioso con log visible**: `llm=invalid_json`, `applied:false`, el endpoint responde `ok:true` con el motivo. **NUNCA una excepción** en el camino de reproducción, nunca un 500 que el player pueda ver | G7 inyecta basura y exige 0 excepciones y 0 decisiones bloqueadas |
| **Presupuesto de coste por vuelta** | **≤1 llamada por canal y vuelta**; tope de tokens de salida declarado; tope de vueltas/día configurable; el **recibo registra tokens** para poder auditar el gasto | G7 cuenta llamadas por vuelta (assert == 1) |
| **Techo determinista manda** | El LLM **sólo elige dentro del techo medido**: el motor calcula primero el techo de capacidad (umbral `1.2×` del fps de la fuente) y el LLM opera **dentro** de él — ya implementado en `server.js:8863-8909` («LLM (opcional) DENTRO DEL TECHO») | G7 con LLM caído: resultado idéntico al determinista |

**Y una regla más, que es la ley del proyecto:** un LLM que falla **no puede tumbar la reproducción**, y **no puede degradar** para ir más rápido. Si el resultado del LLM implica bajar resolución/códec/bitrate, se rechaza (`ANTI_DEGRADATION_LAW.md`), porque eso no es una optimización de latencia: es una degradación con excusa de latencia.

---

## 12. El presupuesto numérico que el implementador debe cumplir

**Criterio de aceptación duro (VPS, petición de manifest o segmento, 1.000 peticiones secuenciales + 20 concurrentes):**

| Métrica | Umbral | Instrumento |
|---|---|---|
| Lookup por decisión (Map / APCu / SQLite) | **≤ 2 µs p99** | micro-bench Anexo A · `t75_lookup.php` |
| `json_decode` del índice en el camino | **exactamente 0** | G1 (shim que lanza) |
| Fase P1 (ruta+`safeId`+clase UA) | **≤ 50 µs p99** | `perf_hooks` en el borde del handler |
| Fase P4 (cabeceras, ≤12 por respuesta) | **≤ 20 µs p99** | idem |
| Fase P5 (`writeHead` + primera línea) | **≤ 300 µs p99** | idem |
| **Σ interno DECIDE** | **≤ 1.000 µs p99** | suma instrumentada |
| **TTFB extremo a extremo (loopback)** | **p50 ≤ 1.500 µs · p99 ≤ 5.000 µs** | harness TTFB, 400 peticiones |
| **20 concurrentes, total de las 20** | **≤ 30.000 µs** | harness concurrencia |
| Llamadas `fs.*`/`child_process.*`/red/`json_decode` en el camino | **0** | shim G1 |
| Retardo del event loop durante la prueba | **p99 ≤ 10 ms** | `monitorEventLoopDelay` |
| Construcción de la tabla en arranque | **≤ 250 ms, una vez** | `perf_hooks` al arrancar |
| Cada delta con `lado` válido según `lado_esperado[perilla]` | **100 %** | G8 |
| LLM: 1 llamada/vuelta, timeout declarado, 0 excepciones | **100 %** | G7 |

**Ley anti-degradación aplicada al presupuesto:** ninguno de estos umbrales se alcanza degradando la señal. No se baja a F5/`ORIGINAL_DIRECT_SAFE`, ni se quita `RESOLUTION`/`CODECS`, ni se recorta el sobre de 202 claves, ni se sirve el original «para ir rápido». El presupuesto se cumple **precalculando**, no recortando.

---

## 13. Cómo se comprueba (gates, con el comando al lado)

| Gate | Qué prueba | Cómo |
|---|---|---|
| **G0 — línea base en el VPS** | el coste **real** de `loadMap()` y del endpoint PHP desplegados (aquí **NO MEDIDO**) | `node --cpu-prof ape-lat-bench.mjs` con `MAP_FILE=/opt/ape-jit/current/channels.json`, **solo lectura**; `php /tmp/t75_lookup.php` ya midió el lado PHP |
| **G1 — cero I/O y cero decode en el camino** | que la decisión no toca fs/proceso/red ni `json_decode` | preload `--require` que sustituye `fs.readFileSync`/`readFile`/`appendFileSync`/`child_process.*`/`net.connect`/`JSON.parse` de payload por funciones que **lanzan**; 200 decisiones → **0 excepciones** |
| **G2 — presupuesto de decisión** | Σ interno ≤1 ms p99 y TTFB p99 ≤5 ms | harness Anexo A contra el motor, 1.000 secuenciales + 20 concurrentes |
| **G3 — event loop libre** | que nada bloquea | `perf_hooks.monitorEventLoopDelay` durante G2: **p99 ≤ 10 ms** |
| **G4 — medir no contamina decidir** | que un probe de 8 s no toca la decisión | lanzar el probe contra el canal más lento **y** medir 100 decisiones: p99 **≤ 5 ms** |
| **G5 — arranque en frío** | que no se sirve sin tabla | reiniciar; antes de `version ≥ 1` → **503 + `X-APE-Table: none`**; tabla lista en **≤ 250 ms** |
| **G6 — antirregresión estructural** | que `loadMap()`/`json_decode` no vuelven al camino | si se ejecutan durante G2, **G1 falla**. Además chequeo estático: ningún handler de `/live/`, `/go/`, `/meta/` llama a `loadMap()` ni decodifica el índice |
| **G7 — LLM acotado** | timeout, no-JSON, coste, techo | 3 escenarios: (a) key ausente → determinista; (b) respuesta basura → `invalid_json`, 0 excepciones; (c) timeout forzado → determinista y reproducción intacta. En los 3: **1 llamada/vuelta** y el recibo con tokens |
| **G8 — lado correcto por perilla** | que ninguna perilla se aplique en el lado equivocado | inyectar deltas con `lado` incorrecto → **rechazo + log**; 0 aplicaciones cruzadas |
| **G9 — canal no medible** | que 403/406/407 no se conviertan en etiqueta de calidad | forzar `not_measurable`; el manifest debe declarar `X-APE-Evidence: not_measurable` y **no** inventar `RESOLUTION`/`CODECS` |
| **G10 — techo de la ley** | que el operario no estabilice degradando | prompt adversario («baja a 720p para no cortar», «apaga HDR»): **100 % rechazos** registrados como `DEGRADATION_ATTEMPT`, **0** aplicaciones (§10) |
| **G11 — política de buffer** | la ley **recarga > drenaje**, el suelo y la regla de recarga | (a) forzar drenaje por debajo del suelo (4 s) → **la regla de recarga de §7.4 se dispara y se registra**; (b) simular `r < 1` (fetch 12 s para segmento de 10 s) → el operario **ataca la recarga**, y el sistema declarado no baja resolución; (c) llenar hasta el cap → **reciclaje del más viejo** sin ENOENT; (d) con 1 solo segmento → `BUFFER_EXHAUSTED`; (e) `FLOOR` fuera de 3–5 s o `D_max` fuera de 8–45 s → **rechazo**; (f) `X-Concurrent-Downloads != 8` → **rechazo** (invariante SSOT) |
| **G12 — precedencia de perfil** | que un conflicto LLM/tabla tenga un ganador y un log | inyectar los 6 casos de §8: cada uno debe producir **1 ganador declarado + 1 línea de log**; `X-APE-Table: stale` cuando el snapshot sea más nuevo |
| **G13 — medir no roba la conexión** | que el prober ceda ante el player | con reproducción activa: probe sobre el canal en `current.id` → **abortado + registrado**; y throughput del player sin degradación durante el probe (20 % cap) |
| **G14 — el punto se descubre, no se fija** | las 4 evidencias de §7.5 y la regla de convergencia | (a) forzar abortos por timeout con reintento exitoso → el registro debe contener **E1** (`timeout_que_lo_mató_ms` + `duración_del_reintento`); (b) inyectar 403/404/407 → **clasificados como proveedor** y el LLM **no** mueve el timeout; (c) cada evento con **E3** (`buffer_antes/despues/delta`); (d) con **n<30** eventos → **0 movimientos**; (e) un paso >20 % o >500 ms → **rechazado**; (f) 3 idas y vueltas en 1 h → `LLM_OSCILLATION` y congelación en la mediana |

**Comando único de aceptación** (el que el capitán puede exigir sin leer nada más):

```bash
node tools/quality/test_realtime_budget.js \
  --engine /opt/ape-jit/server.js \
  --index  /var/lib/ape/ch-url-index.json \
  --assert p99_ttfb_us<=5000 --assert p50_ttfb_us<=1500 \
  --assert intern_p99_us<=1000 --assert loop_delay_p99_ms<=10 \
  --assert io_calls_in_path==0 --assert json_decode_in_path==0 \
  --assert lado_mismatch==0 --assert llm_exceptions==0 \
  --assert degradation_applied==0 --assert buffer_cap_violations==0 \
  --assert probe_over_playing_channel==0 --assert conflict_without_rule==0
```

> Ese fichero **no existe todavía**: es el entregable del implementador, y su contrato es esta tabla. No lo he escrito (prohibido: código de producción).

---

## 14. Ledger de honestidad

| Afirmación | Estado |
|---|---|
| `loadMap()` relee y parsea el mapa en cada petición; 3 llamadas en el camino | **MEDIDO** (lectura de código, 2 versiones locales) |
| `loadMap()` cuesta 53,3–70,5 ms p50 / 89,9–241,4 ms p99 | **MEDIDO** en host del operador, fichero del tamaño real (3 corridas, en el repo) |
| Con tabla precalculada, decidir+primera línea = p50 0,97–1,76 ms / p99 2,79–4,46 ms | **MEDIDO** (loopback, mismo host) |
| `json_decode` del índice = 4,041 ms p50 / 6,606 p99 (80,8 % de 5 ms) | **CITADO** de t75, sha256 verificado |
| Probe completo = 1.653 ms/canal = 330,6× el presupuesto | **CITADO** de t75 (suma de p50) |
| Segmento p50 4,30 MB / máx 16,74 MB (no 1,6 MB) | **CITADO** de t75 |
| 7,3 % (3/41) sin manifest: 403/406/407 | **CITADO** de t75 |
| 8,2 s es el techo `TIMEOUT_S=8`, no latencia del proveedor | **CITADO** de t75; latencia real del canal colgado **NO COMPUTADO** |
| El valor absoluto de todo esto en el VPS de 3 vCPU | **NO COMPUTADO** — no toqué el VPS (G0) |
| El motor desplegado hoy es byte a byte el de 470.702 B | **NO VERIFICADO** — el último sha registrado es `8e9e663b…` |
| Primer chunk de ffmpeg | **NO COMPUTADO** — solo el suelo estructural de 2 s |
| Cadencia del capturador/aplicador APK | **NO COMPUTADO** — no instrumentado en esta tarea |
| Ciclo de recarga del player (latencia real de aplicación lado VPS) | **NO COMPUTADO**; suelo del motor: `max-age` 2 s media / 5 s master, del código |
| El capturador `screencap` puede probar píxeles | **REFUTADO** — captura antes de VPP y HDMI (3 documentos independientes) |
| `?p=` en `/go/<id>` escribe config y para el ffmpeg en la petición | **LEÍDO** (`server.js:6739-6742`); coste **NO COMPUTADO** |
| Zapping `/pulse` p50 0,650 s / p99 7,180 s; VPS 0,521 ms | **CITADO** de `LIVE_CAPTURE_20261114.md:178,257` |
| `APE_BUFFER_FLOOR_S = 4 s` (rango 3–5) y banda de trabajo 4–18 s | **DECISIÓN DEL OPERADOR**, no medida: el rango 3–5 s lo declara él («con 3, 4, 5 segundos basta»). La banda 4–18 s se apoya en `APE_MAX_DELAY_S = 20 s` menos ~2 s de pipeline |
| Cap 64 MB/canal | **DERIVADO**: 18 s al peor segmento medido (16,74 MB/10 s = 13,4 Mbps) = 30,1 MB, ×2,1 de margen. Las 10 s por segmento del proveedor vienen de `#EXTINF:10` (listas de medios) |
| Punto de equilibrio recarga/drenaje = fetch igual a la duración del segmento (10 s) | **DERIVADO** de medidas de t75: p50 0,925 s (r = 10,8×) y máx 10,603 s (r = 0,94×) |
| Valores de las perillas de recarga (prefetch 8, retry 15/12/10 y 120/200/350, etc.) | **DADOS POR EL OPERADOR** en la corrección; no verificados en artefacto en esta tarea |
| Cuánto de `X-Parallel-Segments = 4` es paralelismo real con `max_connections=1` | **NO COMPUTADO** — no medido; el slot único del proveedor acota el techo teórico |
| Semilla del estimador de timeout por host (1.611 ms evestv · 10.603 ms line · sin semilla x1megaott) | **CITADO** de t75 (máximo de duraciones exitosas, N=19 por host) |
| p99 real de duraciones exitosas por host con n≥1.000 | **NO COMPUTADO** — la muestra es N=19; con ese n el «p99» es el penúltimo valor (t75 §9) |
| Las 4 evidencias de §7.5 (E1 contrafactual, E2 clasificación, E3 efecto en buffer, E4 distribución viva) | **NO INSTRUMENTADAS** — el contrato las exige; hoy no existe la serie |
| Regla de convergencia (N≥30, paso ≤20 %/500 ms, banda ±10 %, enfriamiento 15 min, anti-oscilación) | **DEFINIDA** como regla, no medida — es una decisión de contrato |
| `/dev/shm` real del VPS (denominador del cap global) | **NO COMPUTADO** — no leí el VPS |
| Throughput sostenido por canal (entrada de la política de buffer) | **NO COMPUTADO** — t75 midió tamaños y tiempos de fetch, no un test de throughput sostenido sobre la conexión única |
| Tasa de rebuffer / stalls actuales del catálogo | **NO COMPUTADO** — sin serie medida en esta tarea; la regla de §7.4 define umbrales, no los calibra |
| Contenido de la tabla de perfiles de t76 | **NO LEÍDO** en esta tarea: la precedencia de §8 se define por **versión**, no por el contenido concreto de la tabla |
| Precedencia techo-medido > tabla > LLM | **DEFINIDO** (regla de contrato), no medido — es una decisión, y se declara como tal |

---

## Anexo A — Harness exacto (reproducible)

Medición de primitivas y A/B, sin red externa, sin VPS. Node ≥ 18.

```js
// ape-lat-bench.mjs  —  BENCH_DIR=<dir escribible> node ape-lat-bench.mjs
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
import { performance } from 'node:perf_hooks';
const N = 21224, TARGET_BYTES = 4944656;            // tamano real de channels.json
const DIR = process.env.BENCH_DIR; fs.mkdirSync(DIR, { recursive: true });

// 1) mapa con la forma real {url, ua}, ajustado al tamano real
function buildMap(pad) { const map = {}; for (let i = 1; i <= N; i++) map[String(i)] = {
  url: 'http://evestv.wuitf.com:8080/live/user/pass/' + i + '.ts' + 'x'.repeat(pad),
  ua: 'VLC/3.0.20 LibVLC/3.0.20' }; return map; }
let pad = 0, buf = Buffer.from(JSON.stringify(buildMap(pad)));
for (let k = 0; k < 4 && Math.abs(buf.length - TARGET_BYTES) > 2000; k++) {
  pad += Math.round((TARGET_BYTES - buf.length) / N); buf = Buffer.from(JSON.stringify(buildMap(pad))); }
const F = path.join(DIR, 'channels.json'); fs.writeFileSync(F, buf);

const stats = a => { const s=[...a].sort((x,y)=>x-y), q=p=>s[Math.floor(p*(s.length-1))];
  return { p50:+q(.5).toFixed(1), p90:+q(.9).toFixed(1), p99:+q(.99).toFixed(1), max:+s[s.length-1].toFixed(1) }; };
const bench = (fn, it, w=30) => { for (let i=0;i<w;i++) fn(); const t=[];
  for (let i=0;i<it;i++){ const a=performance.now(); fn(); t.push((performance.now()-a)*1000); } return stats(t); };

const read   = bench(() => fs.readFileSync(F), 300);                        // Buffer
const loadMap= bench(() => JSON.parse(fs.readFileSync(F, 'utf8')), 300);    // == server.js:4728
const parsed = JSON.parse(fs.readFileSync(F, 'utf8'));
const M      = new Map(Object.entries(parsed));                             // coste de arranque
const IDS    = Object.keys(parsed), probes = Array.from({length:5000},(_,i)=>IDS[(i*7919)%IDS.length]);
let sink = 0;
const get = (() => { const t=[]; for (let r=0;r<50;r++){ const a=performance.now();
  for (const id of probes) sink += (M.get(id)?1:0); t.push(((performance.now()-a)*1000)/probes.length); } return stats(t); })();

// 2) journal de telemetria, como lo lee /jit/tune (server.js:8826)
function journal(lines) { const f = path.join(DIR, 'j'+lines+'.jsonl');
  fs.writeFileSync(f, (JSON.stringify({at:'x',channel:'1174213',profile:'P3',recipe:'light',degradado:0.857})+'\n').repeat(lines));
  return bench(() => { const all = fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch(_) { return null; } }).filter(Boolean); sink += all.length; }, 60, 5); }

// 3) A/B/C sobre loopback: TTFB de la primera linea del manifest
const L1 = '#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-TARGETDURATION:2\n';
const H202 = {}; for (let i=0;i<202;i++) H202['X-APE-H'+i] = 'v'.repeat(34);   // sobre real: 202 claves / 7,1-7,9 KB
async function run(mode, hdrs) { return new Promise(done => {
  const srv = http.createServer((req,res) => {
    const ok = mode === 'loadmap' ? !!JSON.parse(fs.readFileSync(F,'utf8'))['1174213'] : !!M.get('1174213');
    res.writeHead(ok?200:404, hdrs ? Object.assign({'Content-Type':'application/vnd.apple.mpegurl'},H202)
                                   : {'Content-Type':'application/vnd.apple.mpegurl'});
    res.end(L1); });
  srv.listen(0,'127.0.0.1', async () => {
    const agent = new http.Agent({ keepAlive:true, maxSockets:1 });
    const one = () => new Promise(d => { const a=performance.now();
      http.get({host:'127.0.0.1',port:srv.address().port,path:'/live/1174213/master.m3u8',agent}, r => {
        r.resume(); r.on('end', () => d((performance.now()-a)*1000)); }).on('error',()=>d(NaN)); });
    for (let i=0;i<40;i++) await one();
    const t=[]; for (let i=0;i<400;i++) t.push(await one());
    const c=[]; for (let i=0;i<15;i++){ const a=performance.now(); await Promise.all(Array.from({length:20},one)); c.push((performance.now()-a)*1000); }
    agent.destroy(); srv.close();
    done({ seq: stats(t), conc20: stats(c) }); }); }); }

const A = await run('loadmap', false), B = await run('mapget', false), C = await run('mapget', true);
console.log(JSON.stringify({ map_bytes: buf.length, read, loadMap, map_get_us: get,
  journal_1k: journal(1000), journal_10k: journal(10000),
  ttfb: { A_loadmap: A, B_precomputed: B, C_202hdrs: C } }, null, 1));
```

**Resultados de las tres corridas persistidas** — crudos, con todos sus percentiles, en
`docs/audits/data/REALTIME_LATENCY_BUDGET_20261115.runs.json` (`sha256 65b8eb313bca11f40528c7d21794caca9ab85fe6206d55c5b46cf0f42bcb3194`, 10.947 B):

| Medida | run 1 | run 2 | run 3 |
|---|---|---|---|
| `loadMap()` p50 / p99 (ms) | 55,7 / 89,9 | 53,3 / 135,0 | 70,5 / 241,4 |
| `readFileSync` p50 (Buffer, ms) | 3,754 | 3,425 | 3,954 |
| `JSON.parse` p50 (ms) | 5,572 | 4,998 | 5,285 |
| `Map.get` p50 (ns/op) | 174 | 121 | 170 |
| `Map(Object.entries)` una vez (ms) | 6,72 | 7,38 | 9,11 |
| journal 1.000 líneas p50 (ms) | 6,192 | 5,776 | 6,667 |
| journal 10.000 líneas p50 / p99 (ms) | 40,5 / 133,0 | 43,4 / 62,2 | 69,7 / 101,3 |
| TTFB A p50 / p99 (ms) | 56,2 / 149,8 | 52,8 / 102,5 | 70,2 / 230,7 |
| TTFB B p50 / p99 (ms) | 0,535 / 1,640 | 0,688 / 1,915 | 0,769 / 2,181 |
| TTFB C p50 / p99 (ms) | 0,967 / 3,170 | 1,297 / 2,786 | 1,757 / 4,462 |
| A 20-concurrentes p50 (ms) | 1.001,7 | 1.166,3 | 1.466,2 |
| B 20-concurrentes p50 (ms) | 12,088 | 11,141 | 21,470 |
| C 20-concurrentes p50 (ms) | 22,5 | 27,4 | 31,5 |

**La tercera corrida es peor que las dos primeras** (p50 70,5 ms, p99 241 ms) y **no la oculto**: la máquina tenía más carga. Por eso el documento reporta **rangos de las tres**. Cualquier cifra única de esta página es un rango; ninguna es un punto elegido a conveniencia.

Medición auxiliar separada (instrumento `ape-lat-decomp.mjs`, no persistida en el JSON): `readFileSync` 3.928 µs · `toString('utf8')` 3.884 µs · `JSON.parse` **25.692 µs** bajo presión de GC — la varianza que explica que `read+parse` por separado no sume el total de `loadMap()`.

---

## Anexo B — Las seis frases que resumen el documento

1. **La decisión cabe en 5 ms por 2,8×–5,2× en p50 (y solo 1,1×–1,8× en p99); la medida no cabe por 330,6×.**
2. **Hoy no cabe ni la decisión: `loadMap()` cuesta 53–71 ms p50 y `json_decode` 4,04 ms — el mismo antipatrón, medido en Node y en PHP.**
3. **Son dos lados: el APK aplica ya; el VPS aplica en la siguiente recarga del manifest, y esa latencia la marca el player, no nuestro código.**
4. **«Buffer infinito» = el buffer nunca llega a cero: ley `recarga > drenaje`, suelo 4 s (3–5), banda 4–18 s, `D_max` 20 s, cap 64 MB/canal reciclando el más viejo; y la promesa se sostiene sólo mientras haya RED y la FUENTE siga viva.**
5. **El punto de agresividad no se fija: se descubre.** `timeout óptimo/host = p99 de los segmentos que SÍ funcionaron`, con **contrafactual + clasificación del fallo + efecto en el buffer + distribución viva**, y con **N≥30 eventos** y **paso ≤20 %** para no oscilar. El valor es la **salida**, no la entrada.
6. **Un número de latencia sin el instrumento que lo produjo es una etiqueta, no una medida** — por eso cada fila de este documento nombra su instrumento o dice NO COMPUTADO.
