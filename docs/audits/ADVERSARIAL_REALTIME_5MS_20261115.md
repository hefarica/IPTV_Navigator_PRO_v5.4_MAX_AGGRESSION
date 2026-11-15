# ADVERSARIAL — «probe en tiempo real» y «mejor perfil en <5 ms»

**Fecha:** 2026-11-15 · **Rol:** abogado del diablo · **Regla:** ningún número sin artefacto; lo que no se mide se declara `NO_COMPUTADO`.
**Sin tocar producción:** cero escrituras en VPS, cero cambios de código, listas intactas. Solo lectura (ssh `cat/grep/head`, adb, herramientas `ape_*`).

---

## 0. VEREDICTO POR CLÁUSULA

| Cláusula | Veredicto | Razón en una línea |
|---|---|---|
| **(a)** «el probe mide **en tiempo real** al sintonizar» | **FALSA** | Un probe fresco cuesta **1.653 ms** (p50 de sus piezas) = **330,6×** el presupuesto. No cabe ni de lejos en el instante del zapeo |
| **(b)** «en tiempo real elige **el mejor perfil para la señal que está percibiendo** en **<5 ms**» | **FALSA en su forma literal; verdadera solo mutilada** | El **<5 ms** es cierto para el *lookup* (9,8-15,2 µs medidos). Lo falso es «para la señal que está percibiendo»: el perfil **no se mide, se hereda de una tabla** — y esa tabla está demostrada equivocada con IDs concretos |

**La frase que sí se puede firmar hoy:** *«en menos de 5 ms el motor aplica el perfil que la lista declara, y ese perfil se asignó por el NOMBRE del canal, no por lo que el canal emite».*
Eso no es un matiz: es la diferencia entre medir y etiquetar.

---

## 1. ATAQUE CENTRAL — una medición fresca no cabe en 5 ms

### 1.1 Lo que cuesta medir (t75, medido en el VPS, `N=41` canales)

| Pieza | p50 | p95 | Fuente |
|---|---:|---:|---|
| manifest server-side (`elapsedMs`) | **645 ms** | 5.526 ms | `PROBE_LATENCY_MEASURED_20261115.md` (t75) |
| primer segmento | **925 ms** | 1.251 ms | idem |
| `ffprobe` del segmento | **83 ms** | 128 ms | idem |
| **TOTAL por canal** | **1.653 ms** | — | suma de las tres |

`1.653 / 5 = 330,6`. Y la cola es peor: en `/var/lib/ape/t75_measure.jsonl` el canal 3267 marca `php_wall_ms: 5541.702`, `a_elapsedMs: 5526`. **Una sola medición puede costar 5,5 segundos.**

### 1.2 Lo que cuesta decidir (t77 + t74, medido)

| Operación | p50 | Fuente |
|---|---:|---|
| lookup del mapa con caché por identidad física | **9,8-15,2 µs** | t77 (A/B mismo proceso, N=3000) |
| lookup antes del arreglo (leer+parsear 4,9 MB) | 33,68-66,69 ms | t77 |
| decisión completa (gate + tabla) | 0,97-1,76 ms (p99 2,79-4,46) | t74 |

**Conclusión aritmética:** en 5 ms cabe **el lookup**; no cabe **la medición**. Son dos operaciones distintas y la tesis las presenta como una.

### 1.3 Y aquí está el golpe: el motor no mide la señal ni en el camino lento

El perfil no sale de ninguna medición. Sale del **request**:

```js
// tools/lab/ape-jit/server.js:4478
const labProfile = cfg.profile && LAB_PROFILES[cfg.profile] ? cfg.profile : null;
// :4517-4519
const matrixRow = (cfg.profile && profileMatrix[cfg.profile]) ? profileMatrix[cfg.profile] : null;
const matrixTarget = matrixRow ? { w: matrixRow.outW, h: matrixRow.outH } : null;
const requestedTarget = matrixTarget || IMAGE_TARGETS[effectiveTarget] || null;
```

`cfg.profile` viene del `?p=` de la URL o de la config de imagen. `profileMatrix` es una constante (`P1` → 3840×2160, `P3` → 1920×1080, `P5` → 854×480; `server.js:183,187,191`). **Cero llamadas a ffprobe en ese camino.**

Y el endpoint que sí «razona» sobre la señal (`/jit/signal`) tampoco mide: elige fila de **su tabla estática de 16 reglas** por banda+fps (`server.js:8617-8632`, `elegirRegla`), con la banda calculada desde el `width` **que le reportaron** (`:8709`). Es un `switch` sobre un dato de entrada, no una sonda.

> **Ataque 1: GANA.** El «<5 ms» y «la señal que está percibiendo» son incompatibles: o mides (1.653 ms) o consultas tabla (<5 ms). El sistema hace lo segundo y lo llama lo primero.

---

## 2. ATAQUE 2 — la tabla está equivocada, con IDs

### 2.1 Canal 1386018 — se llama 4K, es 544p

```
$ grep -m1 1386018 /opt/ape-jit/current/APE_JIT_LIST.m3u8
#EXTINF:-1 tvg-id="1386018" tvg-name="AR | ELFARES SPORTS 1 4K [EVEST]" ...
  group-title="RESTO DEL MUNDO / DEPORTES / ULTRA HD"
```

Lo que asigna el envoltorio (herramienta `ape_profile_for_channel`, fuente `ape-pulse-wrap.js:72-87`):

```json
{"clase":"4K","regla_aplicada":"/\\b(4K|UHD|2160)\\b/i","perfil_base":"P1","perfil_final":"P1"}
```

Lo que mide la realidad (`/var/lib/ape/probe-deep.json`, mismo id):

```json
{"channelId":"1386018","profile":"P1","width":968,"height":544,"fps":24.0,
 "codec":"h264","codecProfile":"Main","bytes":376752,"ms":622}
```

**968×544 a 24 fps etiquetado P1 = 4K.** El nombre manda y el nombre miente.

### 2.2 Canal 941412 — se llama HD, la tabla dice P5, mide 1080p50

```
$ grep -m1 941412 /opt/ape-jit/current/APE_JIT_LIST.m3u8
#EXTINF:-1 tvg-id="941412" tvg-name="|FR| CANAL+ 360 HD [line.tivi-ott.net]" ...
  group-title="EUROPA OCCIDENTAL / GENERALISTA / FULL HD"
```

- Escalera del envoltorio: `{"clase":"HD","perfil_base":"P4","perfil_final":"P4"}`
- Grupo del probe: `"profile":"P5"` (el que viaja en la lista)
- Medición: `{"width":1920,"height":1080,"fps":50.0,"codec":"h264","codecProfile":"High","bytes":7875320}`

**Tres capas, tres respuestas distintas** (P4 escalera / P5 lista / 1080p50 realidad), y la que se aplica es la de la lista.

### 2.3 Los grupos enteros son heterogéneos

| Grupo (host+perfil) | Promesa | Alturas medidas | Veredicto del propio probe |
|---|---:|---|---|
| evestv **P1** (N=5) | 2160 | `[544, 1080, 2160]` → **1 de 5** es 2160 | `OK` |
| line **P1** (N=5) | 2160 | `[720, 1080, 2160]` → **1 de 5** es 2160 | `OK` |
| line **P5** (N=5) | 480 | `[576, 720, 800, 1080]` → **ninguno** es 480 | `SOBREDECLARADO` |
| evestv **P5** (N=3) | 480 | `[360, 720, 1080]` | `SOBREDECLARADO` |

El probe se declara a sí mismo «ESTIMACIÓN DE HOST, no verdad por canal» (`probe-deep.json:note`) y aun así la lista usa **un perfil por canal**.

> **Ataque 2: GANA.** No es un caso raro: es la regla. La asignación se hace por texto (`4K` en el nombre → P1) y la población real está en 544p/1080p dentro del mismo grupo.

---

## 3. ATAQUE 3 — la telemetría no llega: **PIERDE en la forma literal, GANA en la útil**

**Lo que dije que iba a pasar y no pasó (hay que decirlo):** OTT Navigator **sí aparece** en los logs. 2.029 peticiones con su UA.

**Lo que sí es cierto, y es peor:**

| Origen de las peticiones con UA `OTT Navigator/1.7.3.3` | Peticiones |
|---|---:|
| `178.156.147.234` (**el propio VPS**) | **1.957** |
| `127.0.0.1` (el propio VPS) | 41 |
| `181.130.154.235` (el device del operador) | **37** |

**El 96 % del «tráfico de OTT» es el VPS hablándose a sí mismo.** Cualquier conclusión sobre el player extraída de ese log está midiendo un smoke test, no al operador.

Y lo que llega del device **no es percepción**:

```json
// /var/lib/ape/qoe_last.json (literal)
{"after":null,"baseline":null,"channel_id":"metadata_refresh",
 "measurement_status":"NO_BASELINE_AFTER_QOE_TELEMETRY","metadata_only":true,
 "qoe_after":null,"qoe_before":null,"qoe_state":"metadata_sentinel_no_baseline_after",
 "limitations":["No stream opened","No pixel analysis","No ffmpeg","No ffprobe","No visual improvement declared from this sentinel"]}
```

Y en el shim (`ottshim/BG14_VERIFICATION.md:128`), literal: `"rebuffer_source":"unavailable:no_position_samples"`, `"buffer_source":"unavailable:no_media_session"`, `"position_samples":0`.

> **Ataque 3: PIERDE como «no llega nunca» (el device sí aparece, 37 hits). GANA como «no llega percepción»**: llega una petición HTTP con UA y un heartbeat sin baseline ni muestras de posición. El stack sabe *que* el player pidió; no sabe *qué* está viendo.

---

## 4. ATAQUE 4 — el fail-closed deja sin reproducir: **GANA**

Tres cierres medidos, de menos a más grave:

1. **`/playlist-shim.m3u8` sin `?port` → HTTP 400** (`server.js:6164-6167`). Una lista sin puerto no devuelve canales: falla cerrado antes de servir nada. Verificado en t51: `http=404` (ruta ausente en el motor desplegado) y `400` en la versión del árbol de trabajo cuando falta el parámetro.

2. **`/meta/<id>.json` con perfil ≥ P3 → 503 `CAPACITY_EXCEEDED`** (`server.js:6650-6663`), porque `fpsFuente = Number(map[id].fps) || 25` y la tabla de capacidad es:
   ```js
   const CAPACITY_FPS = { 480: 25.39, 720: 18.00, 1080: 12.00, 1440: 6.20, 2160: 3.37, 3240: 2.30, 4320: 1.47 };
   ```
   Con el **fps por defecto 25**: 1080 → 12 < 25 ⇒ **503**; 2160 → 3,37 < 25 ⇒ **503**. Solo P5 (480, 25,39) pasa por los pelos. **Todo canal por encima de 480p pierde su metadata.**

3. **`/live/` con fallo estructural → 503 sin reintento y sin fallback** (`server.js:9615-9619`): `X-APE-Failure-Class: capacity|invalid-data`, `503`, cuerpo con el error, y el comentario del propio código explica por qué no se reintenta (el bucle del 2026-11-09 se comió la TV del operador). Correcto como protección del host — **pero el player se queda sin canal**: un solo URL por canal (doctrina del repo) y el alternativo `provider-direct` no viaja en la lista.

> **Ataque 4: GANA.** El fail-closed está bien puesto para no tumbar el VPS, y precisamente por eso **no hay reproducción**: no existe la segunda URL a la que caer.

---

## 5. ATAQUE 5 — un perfil peor que el de antes: **GANA** (con un caso, y un matiz honesto)

### 5.1 El caso que gana: 544p → 4K

Canal **1386018** (P1 en la lista, 968×544 real):

| Paso | Valor | Fuente |
|---|---|---|
| Perfil declarado | `P1` | lista (`p=P1`) |
| Destino por matriz | **3840×2160** | `server.js:183` (`'P1': { outW:3840, outH:2160 }`) |
| `allow_downscale=false` | **no aplica** (es subida, no bajada) | `server.js:4498-4501` |
| Resultado | upscale **8,3×** en píxeles + `zscale → smpte2084` (SDR→PQ) | `server.js:4544-4553` |
| Coste del motor a 2160 | **0,25× tiempo real** (80,95 s para 20 s) | `server.js:40-44` |

**Antes** (proveedor directo): 968×544 h264 a 24 fps, reproducible.
**Después** (con el perfil de la tabla): un 4K sintético que el host no puede sostener en tiempo real y que además relabela SDR como PQ.

Peor en las dos dimensiones: **calidad honesta** (un 544p presentado como 4K) y **continuidad** (0,25× ⇒ no hay segmentos a tiempo).

### 5.2 El matiz que me quita un caso (y lo digo)

El caso simétrico —canal **941412** etiquetado **P5** con 1920×1080 real— **no** produce downscale: `allow_downscale=false` fuerza `targetW = src.width` (`server.js:4498-4501`) y el motor termina sirviendo 1080p con la receta de P5. **El guard anti-degradación funciona aquí.** No lo cuento como hallazgo; lo cuento como lo que es: un casi-accidente que el código evita.

### 5.3 Un segundo «peor que antes», por código (no medido en producción)

`ottshim/…/Rewriter.kt:70-79` **infla `BANDWIDTH` y `AVERAGE-BANDWIDTH` × 1,35** en cada variante que emite, y en `pinMode=1` (defecto) **colapsa el master a dos variantes: la mejor y la peor** (`:42-47`). Un master de 4 peldaños pasa a {2160, 480}: en una caída de red el player salta de 4K a 480p sin escalones intermedios. *No está en el camino hoy* (t51: el shim no está cableado), pero es una degradación por diseño, no por medida.

---

## 6. LO QUE SOBREVIVE (y con qué límites exactos)

1. **El lookup sí cabe en 5 ms.** t77 lo mide: p50 9,8-15,2 µs, p95 ≤ 28 µs. La parte «en <5 ms» de la cláusula (b) **es verdadera** y está bien implementada (caché por identidad física, fail-safe a `MAP_STALE`).
2. **La decisión también cabe**: t74 midió p50 0,97-1,76 ms / p99 ≤ 4,46 ms para el gate completo.
3. **El motor tiene guards reales que evitan las degradaciones peores**: `allow_downscale=false` (probado en 5.2) y `SOURCE_PRESERVATION_REQUIRED` para no reducir/relabelar una fuente SDR.
4. **La telemetría del device existe**: 37 peticiones reales de OTT desde `181.130.154.235` y heartbeat `okhttp` del APK. El canal está abierto; lo que falta es el contenido (posición/buffer).
5. **La tesis (a) podría sobrevivir con otra redacción**: «el probe se ejecuta al sintonizar» es cierto; lo que no es cierto es «en tiempo real», porque ~1,65 s (y hasta 5,5 s) es el presupuesto entero de un zapeo.

**Frontera honesta:** lo que mata a (b) no es la velocidad —es correcta— sino **la fuente del dato**: se elige perfil por el nombre del canal, no por lo que el canal emite. Y lo que mata a (a) es la aritmética: 1.653 ms contra un presupuesto de 5 ms.

---

## 7. LAS 3 PRUEBAS QUE FALTAN PARA PODER FIRMAR (a) o (b)

| # | Prueba | Criterio que la haría firmable |
|---|---|---|
| **T1** | **Probe en el camino del zapeo**: instrumentar un zapeo real y medir el tiempo desde `GET /pulse` hasta tener `width/height/fps` verdaderos del canal, con el artefacto crudo | Si sale ≤5 ms, (a) se firma. Hoy el mismo probe mide 1.653 ms |
| **T2** | **Perfil derivado de la medición, no del nombre**: para N canales, comparar `p=` de la lista contra `ffprobe` real y medir la tasa de acierto | Hoy, en la muestra: 1/5 aciertos en evestv P1 y 0/5 en line P5. Se firma con ≥95 % de acierto y N≥378 (±5 %, ver t75) |
| **T3** | **Telemetría del player, no del device**: obtener de OTT Navigator la variante realmente decodificada y el buffer, y demostrar que llega al VPS | Hoy `qoe_last.json` dice `NO_BASELINE_AFTER_QOE_TELEMETRY` y `position_samples: 0` |

**Condición de firma conjunta:** (a) y (b) solo pueden firmarse juntas si T1 ≤ 5 ms **y** T2 ≥ 95 % de acierto. Si T1 no baja de 5 ms, (b) puede firmarse **solo** reescrita como «aplica el perfil que la lista declara en <5 ms», que es lo que el código hace.

---

## 8. LÍMITES DE ESTA OPOSICIÓN

- **No ejecuté un probe nuevo**: usé t75 (N=41, artefacto crudo en `/var/lib/ape/t75_measure.jsonl`) y los percentiles publicados. No re-medí para no consumir la conexión del proveedor.
- **La tasa de acierto de la tabla (T2) es de 8 muestras**, no de 378: `probe-deep.json` declara `totalMeasured: 31` y los grupos P1/P5 aportan 5+5+3+5. Es evidencia suficiente para refutar «el perfil describe la señal», **insuficiente para cuantificar el error poblacional**. Declarado.
- **No verifiqué qué lista es la que consume el operador** (la `CABLEADA_LIGHT` apunta al proveedor directo; el catálogo del JIT apunta a `/jit/live/`). Si el operador usa la directa, **el perfil de la tabla no toca su reproducción en absoluto** — eso empeoraría el veredicto de (b), no lo mejoraría, pero queda `NO_COMPUTADO` cuál está activa.
- **El 8,3× de upscale y el 0,25× de coste son aritmética de código**, no una medición de ese canal concreto: medirlo exigiría encender el motor con `p=P1` sobre 1386018 y capturar segmentos.
- **No toqué producción**: ni `systemctl`, ni `/opt/ape-jit`, ni la lista, ni el device más allá de lectura.
