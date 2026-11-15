# 01 · IPTV NAVIGATOR — la UI y el generador, al mínimo detalle

**Alcance:** `IPTV_v5.4_MAX_AGGRESSION/frontend/` (`index-v4.html`, 291.632 B / 4.648 líneas; `js/ape-v9/`).
**Fecha:** 2026-11-15. **Sólo lectura**: no se modificó el generador, ni `ape-profiles-config.js`, ni ningún fichero del frontend.
**Convención:** cada afirmación lleva `archivo:línea`. Lo que no se pudo medir aparece como **NO COMPUTADO** con su razón (§11), y las cinco divergencias entre el encargo y lo medido están en §10.

---

## 1. Qué es

IPTV Navigator es **dos cosas en un mismo HTML**:

1. Una **UI de operador** (`index-v4.html`, 4.648 líneas) con pestañas, paneles y asistentes: introducir la fuente, clasificar canales, calibrar perfiles, generar la lista y subirla al VPS.
2. Un **generador de listas M3U8** (`js/ape-v9/m3u8-typed-arrays-ultimate.js`, **949.737 B**) que convierte un catálogo de canales en una playlist con ~950 líneas de directivas por canal, más el resto de módulos `ape-v9` que lo alimentan.

El operador **entra con una fuente y sale con una lista servible**; todo lo demás (probe, perfil, headers, tiers, predicción) existe para que esa lista sea fiel a la señal real.

### 1.1 Los tres formatos de entrada

| Formato | Evidencia |
|---|---|
| **Xtream Codes** (host + usuario + contraseña → API del proveedor) | `index-v4.html:1132` — «Entrada · Xtream Codes» |
| **Fichero M3U/M3U8** (`.m3u8` preferido, `.m3u8.gz`, `.m3u` legacy) | `index-v4.html:1541` y `index-v4.html:1593` |
| **Excel / LAB** (`APE_M3U8_LAB.xlsm`, exportación e importación) | `index-v4.html:1248` (exporta canales filtrados + perfiles al LAB) y `index-v4.html:3997` (carga `xlsx.full.min.js`) |

Los parsers dedicados por formato están cableados uno a uno: `js/ape-v9/parsers/ape-xtream-parser.js` (`index-v4.html:4365`), `ape-m3u-lexer.js` (`:4350`), `ape-xmltv-parser.js` (`:4366`).

### 1.2 Las cuatro variantes de salida

| Variante | Qué hace | Evidencia |
|---|---|---|
| **VPS** | la lista se sirve desde el VPS (ruta con proxy/rebace) | `index-v4.html:2765` («LISTA MEJORADA (VPS)»), `:1666` |
| **DIRECTO** | lista que apunta al proveedor sin pasar por el VPS | `index-v4.html:1943` («Forzar Directo (Zero VPS)»), `:2773` («Modo DIRECTO (sin VPS)») |
| **AMBAS** | las dos anteriores en un solo flujo | `index-v4.html:1562` («⚡ Ambas»), `:1742` («Reemplazar / Versionar / Ambas») |
| **LIGHT** | proyección mínima por perfil: 9 plantillas y **0** líneas `#EXT-X-APE-` en el cuerpo | `js/ape-v9/generation-output-panel.js:910-928` |

---

## 2. `index-v4.html`: carga de scripts, paneles y qué hace cada uno

### 2.1 Orden de carga

El HTML carga **~190 `<script src>`** en un orden que no es alfabético sino de dependencias. Bloques medidos (cada línea es una etiqueta real):

| Fase | Líneas | Qué entra |
|---|---|---|
| Librerías de terceros | `3997-3998` | `xlsx.full.min.js`, `qrcode.min.js` |
| Núcleo de datos y red | `4000-4042` | `vps-config.js`, `vps-adapter.js`, `m3u8-transformer-fixed.js`, `db-manager.js`, `field-discovery.js`, `export-module.js` |
| Herramientas de cabeceras y ranking | `4259-4298` | `field-source-policy.js`, `batch-processor.js`, `ranking-score-*`, `ape-heuristics-engine.js`, `ultra-headers-matrix*.js`, parches `PATCH_FIX_V4_12_3.js` / `PATCH_MEJORADO_V2.js` |
| **ape-v9 (el motor)** | `4311-4404` | `ape-profiles-config.js`, `profile-bridge-v9.js`, `ape-quality-prober.js`, los **26** `parsers/ape-*.js`, `ape-hevc-cascade.js`, `ape-fallback-resolver.js`, `ape-continuity-law-v9.js`, **`m3u8-typed-arrays-ultimate.js`** (`:4398`), `generation-controller.js` (`:4404`) |
| App y utilidades | `4439-4498` | `app.js` (`:4441`), `ape-ui-persistence.js`, `tab-lifecycle.js`, `generator-bridge.js`, `vps-ops-panel.js` |
| Motores auxiliares v9 | `4507-4599` | `ape-engine-v9.js`, `fibonacci-entropy-engine-v9.js`, `tls-coherence-engine-v9.js`, `multi-server-fusion-v9.js`, `geoblocking-detector-v9.js`, `evasion-407-supremo.js`, `ape-runtime-evasion-engine-v9.js` |
| Paneles de salida y diagnóstico | `5127-5139` | **`generation-output-panel.js`** (`:5127`), `output-status-panel.js` (`:5128`), **`vps-image-panel.js`** (`:5133`), **`list-cablear-panel.js`** (`:5139`) |
| Tests en el navegador | `5144-5146` | `tests/proxy-auth.test.js`, `tests/integration.test.js`, `tests/performance.test.js` |
| Streaming y predicción | `4661-4690` | `streaming/bw-estimator-v9.js`, **`streaming/predictive-prefetch-v9.js`** (`:4666`), `streaming/profile-solver-v9.js`, `prefetch-presets.js` (`:4681`), `ape-profiles-config-v5.js` (`:4682`) |

Dos observaciones que importan:

- **`m3u8-typed-arrays-ultimate.js` se carga en `:4398`, DESPUÉS de los 26 parsers y ANTES de `generation-controller.js` (`:4404`)**. Invertir eso rompe el generador: usa `APEUniversalParserStack` y `APEFallbackResolver` que ya deben existir.
- El orden incluye **parches** (`PATCH_FIX_V4_12_3.js:4298`, `PATCH_MEJORADO_V2.js:4301`) y cargas duplicadas de generadores (`m3u8-generator-v14/v15`, `m3u8-world-class-generator.js:4831`, `m3u8-generator-v16-elite.js:4834`). Es deuda real, no decoración: conviven varias generaciones.

### 2.2 Los paneles: id, fichero y función

**Hallazgo que corrige el encargo:** los ids `ape-gen-output-panel` y `list-cablear-panel` **no existen en el HTML**. El HTML sólo declara `ape-image-panel` (`index-v4.html:3088`); los paneles de salida y cableado **crean su propio DOM en tiempo de ejecución** y se pliegan en un `<details>`:

> «Additive: el script crea su propio DOM y se pliega en un `<details>`; NO sustituye…» — `index-v4.html:5136`

| Panel (id real) | Dónde está | Fichero | Qué hace |
|---|---|---|---|
| `ape-image-panel` | **declarado** `index-v4.html:3088` | `js/ape-v9/vps-image-panel.js` (`:5133`) | imagen del VPS: perfil, entrada/salida, receta, dither, modo |
| (creado en runtime, sin id en el HTML) | `index-v4.html:5127` | `js/ape-v9/generation-output-panel.js` | 4 salidas, validación LIGHT, estado de la lista |
| (creado en runtime) | `index-v4.html:5128` | `js/ape-v9/output-status-panel.js` | estado de las salidas |
| (creado en runtime, `<details>`) | `index-v4.html:5139` | `js/ape-v9/list-cablear-panel.js` | cablear UNA lista (contrato `contracts/list_cablear_panel_v1.json`) |
| `ape-modules-inline-panel` | `index-v4.html:2970` | `ape-module-panel-ui.js` (`:4599`) | módulos activos |
| `v41-config-panel` | `index-v4.html:2118` | `js/v41/*` (`:4289-4291`) | cabeceras inteligentes v4.1 |
| `ranking-dinamico-panel` / `ranking-score-config-panel` | `index-v4.html:1388` / `:1426` | `ranking-score-ui.js` (`:4272`) | ranking y score |
| `anle-panel` | `index-v4.html:5050` | `js/ape-anle/*` (`:5039-5047`) | motor ANLE de 6 etapas |
| `gateway-panel-body` / `gateway-stats-panel` | `index-v4.html:1527` / `:1718` | `gateway-manager.js` (`:4017`) | subida al VPS y stats |

---

## 3. El generador

### 3.1 Tamaño y arquitectura por capas

`js/ape-v9/m3u8-typed-arrays-ultimate.js` = **949.737 B**. Su arquitectura, por lo que se puede verificar en el HTML y en los módulos que lo rodean:

| Capa | Módulo | Evidencia |
|---|---|---|
| **Ingesta** | `ape-*` parsers (26 ficheros) + `ape-m3u8-ingestion-parser.js` | `index-v4.html:4332`, `:4348-4375` |
| **Evidencia** | `ape-quality-prober.js` (probe HTTP del manifest real) | `index-v4.html:4340` |
| **Decisión** | `ape-fallback-resolver.js` (tiers F0-F5), `ape-hevc-cascade.js`, `ape-perceptual-4k.js` | `index-v4.html:4379-4381` |
| **Continuidad** | `ape-continuity-law-v9.js` | `index-v4.html:4382` |
| **Emisión** | **`m3u8-typed-arrays-ultimate.js`** | `index-v4.html:4398` |
| **Control** | `generation-controller.js` | `index-v4.html:4404` |
| **Post-proceso** | `m3u8-post-processor.js`, `m3u8-quality-upgrader-v2.js` | `index-v4.html:4518`, `:4401` |

### 3.2 Punto de entrada

```
btnGenerateAudited  →  APEGenerationController.prepublishAndGenerate()  →  ape-quality-prober  →  ape-fallback-resolver  →  emisor
```

- `prepublishAndGenerate` es el camino único, y está **cerrado a propósito**: `generation-controller.js:90-91` documenta que `prepublishAndGenerateGuarded` sólo protegía ese camino y los otros seis generaban por su cuenta — «un clic podía…». El cerrojo se replicó (`generation-controller.js:97`).
- La cadena `prober → resolver → emisor` está garantizada por el orden de carga (§2.1): el resolvedor está en `:4381`, el emisor en `:4398`.

### 3.3 La regla: no poner lógica en el `onclick` del HTML

Es una regla del repo y tiene rastro en el código: la UI **delega** en el controlador (`generation-controller.js:90-97`) y en el *bridge* (`generator-bridge.js:4469`), no ejecuta el pipeline desde el atributo HTML. El `onclick` sólo dispara el evento; la lógica vive en el JS cargado.

---

## 4. Los 6 tiers de fallback (F0-F5)

Definidos en `js/ape-v9/ape-fallback-resolver.js` (32.981 B): constantes y contadores en `:13-18`, constructores por tier, y el despacho que los llama en orden.

| Tier | Constructor (línea) | Cuándo | Qué emite |
|---|---|---|---|
| **F0** `REAL_VERIFIED_MAX` | `:183` | el probe confirma la señal (`verified === true`) | codec/resolución reales del probe |
| **F1** `REAL_PARTIAL_MAX` | `:233` | probe parcial (con contradicciones contadas) | lo real que hay, marcado parcial (`:263`) |
| **F2** `HEVC_PREMIUM_HINT` | `:284` | probe falla pero el canal es premium | `hvc1.2.4.L153.B0` como hint, vía cascada (`:302-304`) |
| **F3** `HEVC_SAFE_1080P` | `:356-363` | sin evidencia, canal FHD/HD probable | HEVC 1080p por cascada |
| **F4** `AVC_HIGH_SAFE` | `:404-412` | sin evidencia HEVC ni señal premium | `avc1.640028` |
| **F5** `ORIGINAL_DIRECT_SAFE` | `:446` | última defensa | sólo `#EXTINF` + URL original |

**Regla de prioridad visual:** `F0 > F1 > F2 > F3 > F4 > F5`, y **nunca bajar a F4/F5 si hay señal premium**. El despacho es secuencial (`:486` F0 → `:490` F1 → …) y la detección de «premium» es un regex explícito:

```js
/4k|uhd|fhd|hevc|h265|h\.265|hdr|dolby|premium|dazn|espn|sport|sports|event|evento|movie|ci…/
```
`ape-fallback-resolver.js:152`

---

## 5. Los 12 perfiles: P0-P5 y sus `.5`

### 5.1 La tabla

`js/ape-v9/ape-profiles-config.js` (411.497 B) declara los **6 canónicos** con su bitrate de diseño y su fusible:

| Perfil | `design_bps` | `fuse_bps` | Línea |
|---|---|---|---|
| P0 | 25.000.000 | 18.000.000 | `:5597` |
| P1 | 14.000.000 | 10.000.000 | `:5598` |
| P2 | 14.000.000 | 10.000.000 | `:5599` |
| P3 | 5.000.000 | 3.500.000 | `:5600` |
| P4 | 2.000.000 | 1.400.000 | `:5601` |
| P5 | 1.000.000 | 700.000 | `:5602` |

Y su **modo de agresividad**: P0 `ULTRA_AGRESIVO`, P1/P2 `AGRESIVO`, P3/P4 `BALANCEADO`, P5 `CONSERVADOR` (`:6098-6103`).

Los **6 de enhancement** (`.5`) están en `:5140`:

```js
const APE_6K_PROFILE_IDS = ['P0.5','P1.5','P2.5','P3.5','P4.5','P5.5'];
```
`:5137` explica por qué existe esa lista: sin ampliarla, «P0.5..P5.5 se importaban como humo». **12 perfiles = 6 canónicos + 6 de enhancement** (`:5140` + `:5597-5602`).

Cada perfil se materializa en su bloque de cabecera, con `adaptive-maxheight` como techo de selección: 4320 en `:618`, 2160 en `:1253` y `:1886`, 1080 en `:2380`, 720 en `:3014`, 480 en `:3648`.

### 5.2 Quién resuelve cada perfil

- **La escalera por resolución** — `ape-profile-classifier.js:250-273`: `h≥4320→P0`, `h≥3240→P0` (guarda 6K), `h≥2160` + (HDR o `fps≥50`) `→P1`, si no `→P2`, `h≥1080→P3`, `h≥720→P4`, resto `→P5`.
- **El suelo anti-degradación** — `enforceResolutionFloor` (`:279`): ningún perfil cuyo cap quede por debajo de la altura medida.
- **El solver de streaming** — `streaming/profile-solver-v9.js` (`index-v4.html:4672`).
- **El clasificador de canal** — `js/ape-channel-classifier.js` (`index-v4.html:4009`) y `js/ape-v9/auto-classifier-v13.js` (`:4572`).

**Un `.5` nunca se selecciona desde el probe** (contrato citado en `ape-profile-classifier.js:248`): es enhancement de display, no una fuente.

---

## 6. El panel de salidas y el contrato LIGHT

`js/ape-v9/generation-output-panel.js` (69.168 B). Prepara **cuatro salidas** y valida la LIGHT **antes** de dar verde (`:911-912`: «Si algo no cuadra, se dice y NO se entrega como verde. Ningún número se inventa»).

### 6.0 Las cuatro tarjetas y sus checkboxes (ids reales)

El bloque se rotula «⚙️ OPTIMIZACIÓN Y SALIDAS» (`:1070`) y **cada tarjeta genera su lista con el generador que le corresponde** (`:1071`). Los controles, con su id exacto:

| Tarjeta | Checkbox (id real) | Estado inicial | Línea |
|---|---|---|---|
| **VPS** | `ape-sel-vps` | `checked` | `:1075` |
| **DIRECTO** | `ape-sel-direct` | — | `:1076` |
| **AMBAS** | `ape-sel-both` | — | `:1077` |
| **LIGHT** | checkbox propio: **es la autorización explícita** de esa variante | — | `:977-978` |

Y, dentro de las tarjetas, los formatos de entrega: `ape-out-hls` (`checked`, `:1082`), `ape-out-dash` (`:1083`), `ape-out-hybrid` — híbrida HLS+DASH (`:1084`). El operador pidió «la matriz entera» (`:489`), no dos salidas parciales.

### 6.1 El contrato LIGHT, tal como está en el código

```js
var LIGHT_CONTRACT = { canalesMin: 1, plantillas: 9, apeEnCuerpo: 0 };
```
`generation-output-panel.js:924-928`

Y las tres condiciones estructurales, con la razón escrita al lado (`:916-922`):

1. **9 plantillas y 1 índice** en la cabecera (`:917`).
2. **0 líneas `#EXT-X-APE-` en el cuerpo** (`:918`).
3. **Al menos 1 canal** (`:919`).

Lo que **NO** se gatea, y por qué (`:920-923`): el **número de canales** lo fija el filtro del operador —«100 o 21.224, da igual»— y vetar por conteo «sería vetar el filtro del operador» (`:913-915`); y las **líneas por canal** varían (6 en P1, 7 en P4, 10 en P5) porque cada canal arrastra las suyas.

### 6.2 La validación y sus dos endpoints

`validateLight()` (`:947`) **no descarga la lista** (`:945-946`): pide estado al VPS. Endpoint real, con la ruta **absoluta** contra `VPS_BASE` (`:950-951`):

```
GET {VPS_BASE}/prisma/api/list-light-verify.php?lista=<base_CABLEADA_LIGHT.m3u8>
```
y la proyección la sirve `list-light-project.php`. Ambos existen en el repo:

| Endpoint | Tamaño | Comportamiento en el cliente |
|---|---|---|
| `vps/prisma/api/list-light-verify.php` | 4.879 B | `404 → VERIFY_ENDPOINT_ABSENT` (`:958`); `!ok → VERIFY_HTTP_<status>` (`:959`); `fetch` fallido → `VERIFY_UNREACHABLE` (`:955-956`) |
| `vps/prisma/api/list-light-project.php` | 6.951 B | genera la proyección LIGHT |

---

## 7. El panel de imagen y la verdad de viabilidad del VPS

`js/ape-v9/vps-image-panel.js` (103.329 B). Su estado arranca con estos campos (`:24-27`):

```js
build: { profile:'P4.5', w:1280, h:720, target:'UHD_4K', codec:'hvc1',
         player:'onn-4k', recipe:'balanced', fps:25,
         outW:3840, outH:2160, outFps:'', dither:'error_diffusion', mode:'real',
         inband:'720p', inFps:30 }
```

Campos del formulario (todos con su control): perfil (`:172`), resolución de entrada 480p→8K (`:179-182`), `fps` de entrada 24/25/30… (`:187-189`), más receta, dither, modo y salida. El panel habla con el motor por `fetch(S.base + path)` con `cache:'no-store'` (`:48`).

**Endpoint real del motor: `POST /image/config`** (`vps/ape-jit/server.js:43`), que escribe `IMAGE_CONFIG_FILE = /opt/ape-jit/image-config.json` (`:55`) con `IMAGE_DEFAULTS` (`:57`) e `IMAGE_LIMITS` (`:115`) y recarga en caliente (`:4114-4117`).

### 7.1 La matriz de viabilidad, medida (y lo que NO está medido)

| Destino | Medido | Veredicto | Evidencia |
|---|---|---|---|
| **UHD_4K** (3840×2160) con `hqdn3d+unsharp` | 80,95 s para 20 s = **0,25×** tiempo real | **NO VIABLE** | `docs/audits/PRUEBA_FISICA_REA_654_20261108.md:2130` |
| **QHD_1440** con `hqdn3d+unsharp` | 46,94 s = **0,43×** | **NO VIABLE** | `PRUEBA_FISICA_REA_654_20261108.md:2129` |
| **FHD_1080 con filtros** | — | **NO MEDIDO** (el propio doc lo dice) | `PRUEBA_FISICA_REA_654_20261108.md:2194` |
| Capacidad 25 fps → 25 fps | `{source_fps:25, measured_encode_fps:25, viable:true}` | **VIABLE** (registro de capacidad) | `docs/audits/CONTRACT_REVIEW_20261111.md:188` |
| **SR con DNN en el device** | 3 `.tflite` de 1.484-1.676 B (TFL3 válidos) = **stubs, no redes** | **NO DISPONIBLE** | `docs/audits/KNOB_CATALOG_20261115.md:185` (§4.1) |

Traducción honesta: **4K y QHD están medidos y son NO VIABLES** en este host; **FHD con filtros no se midió** (no se puede afirmar ni negar), y lo único con `viable:true` es un registro de capacidad a 25→25 fps. La afirmación «VIABLE sólo FHD_1080@25fps» del encargo es **más fuerte que la evidencia** (§10).

---

## 8. El motor de predicción AI: `APE_PREDICT`

`js/ape-v9/streaming/predictive-prefetch-v9.js` (17.439 B), cargado en `index-v4.html:4666`.

Su diseño está escrito en la cabecera (`:16-32`): «predictor determinista y auditable: doble EWMA + tendencia por mínimos cuadrados + ventana tipo neuro-buffer + riesgo logístico».

| Pieza | Fórmula / valor | Evidencia |
|---|---|---|
| base | doble EWMA sobre el throughput medido | `:16`, `:23` |
| pendiente | mínimos cuadrados de mbps vs segundos | `:23` |
| pronóstico | `clamp(base + slope·H, 0,25·base, 3·base)`, **H = 10 s** | `:24`, `:67` |
| jitter | `EWMA(α=0.3)` de `|x_i − x_{i−1}| / max(x_{i−1}, ε)` | `:26` |
| ventana neuro-buffer | `NEURO_LEVELS {NORMAL:70, ESCALATE:30, BURST:10}` — «== `neuro_buffer_controller.php` del VPS» | `:41`, `:77` |
| riesgo logístico | umbrales `RISK_TIGHTEN 35 %` (estrecha 50 %) y `RISK_SOFT 20 %` (estrecha 25 %) | `:75-76` |
| buffer real | `APE_PREDICT.setBuffer(pct)` 0-100 opcional, del player | `:51` |

### 8.1 Los invariantes que NO se rompen

| Invariante | Evidencia |
|---|---|
| **`X-Concurrent-Downloads = 8` único** (256/200 saturaban) | generador: `#EXT-X-APE-OVERRIDE:X-Concurrent-Downloads=8;LAB=ignored;REASON=invariante_200_saturaba;DECLARED=1` (`m3u8-typed-arrays-ultimate.js:2911`) |
| **Prefetch = SSOT del perfil** (no se pisa desde el LAB) | `m3u8-typed-arrays-ultimate.js:5600` y `:5611` (excluye `X-Parallel-Segments`/`X-Concurrent-Downloads` de la sobreescritura) |
| **`X-APE-Prefetch-*` fuera de `#EXTHTTP`** (familia interna) | `AGENTS.md` §«Invariantes» punto 3; y `:5611` como lista de exclusión |
| **Fallback P0 = 90/40, no 250** | `prefetch-presets.js:128-129` (`prefetch_segments: 90`, `parallel_downloads: 40`); P0 declara `buffer_target_seconds: 90` y `min_bandwidth_mbps: 40` (`:72-73`) |
| **`#EXTHTTP` siempre JSON válido** (el token va aparte) | `AGENTS.md` §«Invariantes» punto 5; el token viaja en `#EXT-X-APE-PLAYBACK-TOKEN`, no dentro del JSON |

---

## 9. Los tests del repo

### 9.1 Inventario medido

| Directorio | Ficheros | Ejemplos |
|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/frontend/tests/` | **26** | `ape-predictive-prefetch.test.js`, `e2e-bulletproof-full-audit.js`, `ui-*.verify.js` (5), `rea-*.test.js` (3), `test-server-profile*.js` (3), `proxy-auth.test.js`, `performance.test.js` |
| `tools/quality/` | **48** | `check_sr_rules.js` (29.278 B), `list_gate.js`, `test_6k_source_honest.js`, `check_soc_vocabulary.js`, `apply_harness.js` |

Tres de los tests se cargan **en el navegador** desde el propio HTML (`index-v4.html:5144-5146`): `proxy-auth.test.js`, `integration.test.js`, `performance.test.js`.

### 9.2 PASS esperados y cuáles se pueden correr aquí

| Test | PASS esperado | ¿Corre aquí? |
|---|---|---|
| `frontend/tests/ape-predictive-prefetch.test.js` | **43 PASS / 0 FAIL** | **SÍ — ejecutado en esta sesión: 43 PASS / 0 FAIL, exit 0** |
| `frontend/tests/predictive-prefetch-live.js` | 11 PASS | no: exige medición HTTP loopback real |
| `frontend/tests/ui-predictive-prefetch.verify.js` | 18 PASS | no: exige Chrome headless |
| `frontend/tests/e2e-bulletproof-full-audit.js` | 25/25 | no: exige el JSON del LAB (`AGENTS.md`) |
| `frontend/tests/deploy-live-predictive-prefetch.verify.js` | 9/9 | no: exige el sitio público |
| `frontend/tests/proxy-auth-server.test.php` | — | no: requiere PHP (no hay intérprete en este host) |

Las cifras esperadas de los cinco primeros están declaradas en `AGENTS.md` §«Verificación obligatoria». La única que he podido **medir** aquí es la primera: **43 PASS / 0 FAIL**.

---

## 10. Defectos conocidos

| # | Defecto | Qué pasó | Estado | Evidencia |
|---|---|---|---|---|
| **D1** | **Cache-buster viejo** | el `?v=` del HTML no cambiaba al cambiar el fichero, así que el navegador servía el JS anterior | **corregido y con método**: se bumpea el `?v=` y se verifica `md5 servido == md5 en disco` | `docs/audits/PRUEBA_FISICA_REA_654_20261108.md:4156` (vps-image-panel 47.504 → 53.077 B + bump), `:4263` y `:4353` («Cache-buster a `?v=…`. md5 servido == md5 en disco. Test 27/27») |
| **D2** | **Rutas relativas `/prisma/api` fallan en localhost** | `validateLight()` pedía `/prisma/api/list-light-verify.php` relativo; en el servidor local (`127.0.0.1:5500`) no existe `/prisma/` → **404 en vez de validar** | **corregido** con ruta absoluta contra `VPS_BASE` (marcado `[FIX 2026-11-15]`) | `js/ape-v9/generation-output-panel.js:950-951` |
| **D3** | **`gzip_static` servía un `.js.gz` viejo** | nginx servía el `.js.gz` de una versión anterior **en lugar** del `.js` nuevo | **documentado como trampa** (TRAMPA 3) | `docs/audits/BASELINE_APE_CRYSTAL_FLOW_20261114.md:1833-1836` |

Los tres siguen la misma lección: **el fichero servido puede no ser el fichero del repo**. Cualquier verificación de frontend tiene que comparar bytes servidos vs bytes en disco, no la fecha del fichero.

---

## 11. NO COMPUTADO (con razón)

1. **El ciclo de recarga del player** (cada cuánto vuelve a pedir el manifest): no medido. Método: contar peticiones al mismo `tvg-id` por minuto en el log del motor.
2. **Cuántos `<script>` exactos** carga el HTML: conté ~190 por el patrón `<script src>`, pero el fichero tiene más de 4.600 líneas con scripts inline intercalados; el número exacto **no está medido**.
3. **La arquitectura interna del generador por funciones**: con 949.737 B, esta ficha identifica capas y módulos por su posición en la carga; el desglose función a función **no se ha hecho**.
4. **FHD_1080 con filtros**: viable o no, **no medido** (`PRUEBA_FISICA_REA_654_20261108.md:2194`).
5. **El efecto en pantalla** de los ajustes de imagen: el audit VPP lo declara NO MEDIDO en reproducción HDR.

---

## 12. Cinco divergencias entre el encargo y lo medido

| El encargo dice | Lo medido dice | Evidencia |
|---|---|---|
| panel `ape-gen-output-panel` | **no existe como id**; el panel crea su DOM en runtime | `index-v4.html:5127`, `:5136` |
| panel `list-cablear-panel` | **no existe como id**; se carga como script y se pliega en `<details>` | `index-v4.html:5139`, `:5136` |
| LIGHT: `plantillas>=1`, `truncado==false` | **`plantillas: 9`** (exacto) y **no existe `truncado`**; el contrato tiene 3 campos | `generation-output-panel.js:924-928` |
| endpoint `/jit/image/*` | **`POST /image/config`** (+ fichero `/opt/ape-jit/image-config.json`) | `vps/ape-jit/server.js:43`, `:55` |
| VIABLE «sólo FHD_1080@25fps» | 4K y QHD **medidos NO VIABLES**; FHD con filtros **NO MEDIDO**; `viable:true` existe sólo como capacidad 25→25 fps | `PRUEBA_FISICA_REA_654_20261108.md:2129-2130`, `:2194`; `CONTRACT_REVIEW_20261111.md:188` |

Se declaran en vez de repetirlas: el documento no puede ser más fuerte que su evidencia.

---

## 13. Huellas y ámbito

| Artefacto | Bytes | Notas |
|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html` | 291.632 | 4.648 líneas |
| `…/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | 949.737 | emisor |
| `…/frontend/js/ape-v9/ape-profiles-config.js` | 411.497 | 12 perfiles |
| `…/frontend/js/ape-v9/generation-output-panel.js` | 69.168 | salidas + LIGHT |
| `…/frontend/js/ape-v9/vps-image-panel.js` | 103.329 | panel de imagen |
| `…/frontend/js/ape-v9/ape-fallback-resolver.js` | 32.981 | tiers F0-F5 |
| `…/frontend/js/ape-v9/streaming/predictive-prefetch-v9.js` | 17.439 | APE_PREDICT |

**Ámbito respetado:** sólo se escribió este documento. Se leyeron en modo lectura el HTML, los módulos `ape-v9`, los tests y los audits citados. **No** se modificó el generador, ni `ape-profiles-config.js`, ni ningún fichero del frontend, ni se tocó el VPS.
