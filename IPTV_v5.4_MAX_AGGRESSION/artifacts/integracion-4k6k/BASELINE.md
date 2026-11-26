# BASELINE — Integración aditiva `ape-iptv-auditoria-4k-premium6k`

**Tarea:** [baseline] — fijar el punto de partida REAL antes de editar.
**Fecha de medición:** 2026-11-20 (America/Bogota). Ventana: 06:47–06:52 UTC.
**Carácter:** SOLO LECTURA. Esta tarea **no editó ningún fichero de código**, no ejecutó git,
no escribió en el VPS, no modificó la lista protegida ni el ZIP de auditoría.
**Autor:** subagente `baseline` del equipo de integración.

> Regla de honestidad aplicada: cada afirmación lleva el comando y su salida al lado. Lo que no se
> pudo medir está en la sección 10 como **NO COMPUTADO** con su motivo. Un campo no computado no es cero.

---

## 0 · Dos raíces, no una (corrección de premisa)

La misión nombra la raíz `...\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION` y "el proyecto real en la
subcarpeta `IPTV_v5.4_MAX_AGGRESSION`". Lo medido es que **el repo está partido en dos niveles** y hay
que respetarlo o se edita el fichero equivocado:

| Artefacto | Ruta REAL | Nivel |
|---|---|---|
| `contracts/**` (los 7 contratos) | `<ROOT>\contracts\` | **raíz**, NO en la subcarpeta |
| `.agents\skills_index.json` | `<ROOT>\.agents\skills_index.json` | **raíz** |
| `.agents\skills\<skill>\` (321 dirs) | `<ROOT>\.agents\skills\` | **raíz** |
| `frontend\index-v4.html` | `<ROOT>\IPTV_v5.4_MAX_AGGRESSION\frontend\index-v4.html` | **subcarpeta** |
| `frontend\js\ape-v9\*` (generadores) | `<ROOT>\IPTV_v5.4_MAX_AGGRESSION\frontend\js\ape-v9\` | **subcarpeta** |
| `artifacts\` (entregables) | `<ROOT>\IPTV_v5.4_MAX_AGGRESSION\artifacts\` | **subcarpeta** |

Comando:

```powershell
Get-ChildItem (Join-Path $root "contracts") -Recurse -File   # -> 30 ficheros
Test-Path   (Join-Path $sub  "contracts")                    # -> False  (no existe sub/contracts)
```

Salida relevante: `<ROOT>\contracts` existe (30 ficheros); `<SUB>\contracts` **no existe**.
`.agents\skills_index.json` existe bajo `<ROOT>`, **no** bajo `<SUB>`.

**Consecuencia para la integración:** `contracts/` se lee y se cita siempre desde la raíz; el código se
edita siempre en la subcarpeta. Los `artifact` de `contracts/consumer-map.json` usan el prefijo
`IPTV_v5.4_MAX_AGGRESSION/...` justamente por esto.

---

## 1 · Entorno (task 6)

```powershell
node --version   # v24.12.0        exit=0
npm --version    # 11.6.2          exit=0
python --version # Python 3.12.10  exit=0
py --version     # Python 3.14.2   exit=0
```

Los cuatro intérpretes funcionan. `node` 24.12.0 soporta `node --check` para validar sintaxis sin ejecutar.

**Sintaxis del baseline (los 3 ficheros que la integración va a tocar o rodear):**

```powershell
node --check frontend\js\ape-v9\m3u8-typed-arrays-ultimate.js   # exit=0
node --check frontend\js\ape-v9\ape-profiles-config.js          # exit=0
node --check frontend\js\ape-v9\profile-manager-v9.js           # exit=0
```

Los tres pasan en limpio **antes** de tocar nada. Esto es la línea base de sintaxis: si algo se rompe,
el responsable es el cambio, no el repo.

> **Lectura correcta de `exit=0` (etiqueta, no evento):** `node --check` **solo** prueba que el fichero
> **parsea** como JS. **No** ejecuta el generador, **no** valida comportamiento, **no** demuestra que la
> salida M3U8 sea correcta. `exit 0` = "la sintaxis es válida", **no** "el generador funciona". La prueba
> de comportamiento es otra y no se hizo en esta tarea (ver N6 y la sección 8.1 para el método exigible).

---

## 2 · Contratos vigentes (task 1)

### 2.1 · Inventario con identidad (bytes + sha256 medidas hoy)

Comando: `node _audit_contracts.js` (script propio en la raíz, parsea y hashea).

| Contrato | bytes | sha256 |
|---|---:|---|
| `contracts/extshimott_contract.json` | 17 723 | `798a00a7147b4d877cb986a2d02a5d5a0169678dd854458c7671c6cef142048a` |
| `contracts/rea/rea-processing-v1.json` | 3 261 | `2a974a6452609049a7f7790cd3a62633f2b06090c6e548fcaa1be3115e7d2a06` |
| `contracts/consumer-map.json` | 2 931 | `f02ec0e7958d93c79b9decab09db3e19ca9d3a28297c1e9ad13c11a2c63166b7` |
| `contracts/ape_crystal_flow_operativa.json` | 11 195 | `e7bff81b4115e2287c0f53434387415bde7350bcb3dacc536140d6138362cb5a` |
| `contracts/anti_degradation_contract.json` | 807 | `bb359284b42a420d35da8f4dc4278e4214fe7a6cfd9c931a1f9140f272457fc5` |
| `contracts/crystal_4k_enhancement_contract.json` | 4 270 | `b9f575eb31bdea6e90b77fb6a64761638bb3ffb70e13995d2ed05f658d7ea056` |
| `contracts/streaming_continuity_contract.json` | 3 272 | `f60b21e0a50c3746e9f89caa4c01355d41a03e6b3e2b9977e02917771f820a24` |

Estos hashes son la referencia de "no se tocaron" para la auditoría final.

### 2.2 · `extshimott_contract.json` — CONFIRMADO `additionalProperties=false`

```
$id           : ape.extshimott.v1
$schema       : https://json-schema.org/draft/2020-12/schema
type          : object
required      : ["ver","id","tgt"]
minProperties : 3
```

Dump del esquema (`node _audit_extshimott.js`) — **9 ocurrencias** de `additionalProperties`:

```
.additionalProperties=false          <- raíz
.properties.v.additionalProperties=false
.properties.a.additionalProperties=false
.properties.hdr.additionalProperties=false
.properties.cad.additionalProperties=false
.properties.dev.additionalProperties=false
.properties.ott.additionalProperties=false
.properties.vlc.additionalProperties=false
.properties.kod.additionalProperties=false
```

Es decir: `false` **en la raíz y en los 8 sub-objetos**. No hay ningún punto del sobre abierto.

**Campos permitidos en `ver:1` (inventario completo, 8+1+1 bloques):**

| Bloque | Tipo | Props | Campos permitidos |
|---|---|---|---|
| `ver` | integer | — | solo `1` válido ("un valor distinto de 1 se rechaza") |
| `id` | string | — | clave de canal, la misma de `ape_lists.db` |
| `v` (video FUENTE) | object | 8 | `c`∈{hevc,av1,vvc,h264,vp9} · `p`∈{main,main8,main10,main12,high,high10,professional} · `hdr`∈{sdr,hdr10,hdr10plus,dolby_vision} · `w` 2..7680 · `h` 2..4320 · `f` ≤240 · `g` 1..2000 · `tf`∈{bt709,bt2020,smpte428} |
| `a` (audio) | object | 3 | `c`∈{aac,aac-lc,he-aac,ec-3,ac-3,opus,mp3,flac,truehd,dts} · `ch` 1..16 · `l` `^[a-z]{2,3}(-[A-Za-z0-9]{1,8})*$` |
| `hdr` (cabeceras inyectables) | object | 2 | `ua` `^[^\r\n]+$` · `rf` `^https?://[^\s]+$` |
| `flt` | string | — | cadena ffmpeg compacta |
| `cad` | object | 3 | `mode`∈{fixed,adaptive} · `fps` ≤240 · `seg` ≤30 |
| `dev` | object | 6 | `hdr_c`∈{0,1,2,3} · `mcr`∈{0,1,2} · `mmp`∈{0,1} · `res_w` 1..7680 · `res_h` 1..4320 · `di`∈{off,on,auto} |
| `ott` | object | 3 | `buf` ≤512 · `hw`∈{0,1} · `asp`∈{fit,fill,center} |
| `vlc` | object | 1 | `f`∈{0,1} |
| `kod` | object | 1 | `isa`∈{0,1} |
| `tgt` | string | — | pipe-list de `ott`\|`vlc`\|`kod`, sin duplicados (`E_TGT_DUP`) |

**Políticas declaradas (texto del contrato, no interpretación):**

- `x-ape.unknown_field_policy`: *"RECHAZO. `additionalProperties=false`: un campo fuera de este contrato
  es error, no warning. Para extender el sobre se sube `ver` y se versiona el contrato; **nunca se cuela
  un campo nuevo en `ver:1`**."*
- `x-ape.unknown_value_policy`: *"Si un valor no se conoce, se OMITE el campo. El contrato no define
  centinelas (null, -1, `"unknown"`): emitir un centinela es inventar."*
- `x-ape.additive_only`: `true`. `never_replaces[]`: `EXT-X-STREAM-INF:CODECS`, `:RESOLUTION`,
  `:BANDWIDTH`, `:VIDEO-RANGE`, `EXTHTTP`, `EXTVLCOPT`, `KODIPROP`, `EXT-X-APE-*`, `EXT-X-MEDIA`,
  `EXT-X-I-FRAME-STREAM-INF`.
- Límites de línea: `max_line_chars` 4096 (techo duro), `warn_line_chars` 3840 (presupuesto operativo),
  `max_payload_chars` 4084. **El propio contrato declara el límite como decisión de diseño, no como
  hecho medido** (`limits.note`).
- Consumidor por campo en `x-ape.consumer_matrix`. Regla dura del contrato:
  *"`flt` NO lo lee `ott` (es VPS/VLC)"* y *"Un campo sin consumidor declarado no debe existir: el
  generador no emite lo que nadie lee."*

**Choque directo con la integración 4K/6K (esto condiciona todo el diseño):**

1. `v.w` max **7680** y `v.h` max **4320** ⇒ `6144x3456` y `5760x3240` **caben numéricamente**: el
   sobre **no prohíbe por rango** declarar 6K. Lo que lo prohíbe es la **semántica**:
   `properties.v.description` = *"Video de la FUENTE REAL SERVIDA"*. Declarar 6K en `v` cuando la fuente
   es 4K sería afirmar una fuente falsa → prohibido por `crystal_4k_enhancement_contract.uhd_simulation.forbidden[0]`.
2. **No existe ningún campo** para `audit_id`, `score`, `findings` o similar, y **no se puede añadir**.
   ⇒ Toda extensión de la auditoría va **por sidecar / REA**, exactamente como manda la regla dura (6)
   de la misión. Confirmado contra el contrato, no asumido.

### 2.3 · `rea/rea-processing-v1.json` — NO es JSON Schema; es un documento de política

Búsqueda de `additionalProperties` en los 19 top-keys: **0 ocurrencias**. No hay `$schema` ni `type`.
Por tanto "si admite extensiones" se responde así: **no existe un sobre cerrado que respetar**; extender
significa **añadir claves al documento y subir `revision`**, lo que es un **cambio de contrato**
(decisión del operador), no una edición de integración.

Contenido medido:

```
schema_version : 1
policy_id      : rea-adaptive-v1
revision       : 2026-11-07
authority      : user_requested_processing_extension
source_lab     : contracts/lab/APE_LAB_CANONICAL_BULLETPROOF.json
                 sha256 345783e33142791b23b4662d396c0c83c8051d77cd7c166dc21ef4990c093094
activation     : external_player
player_package : com.ape.crystalagent.rea
```

Tabla de resolución (`resolution.rules`, base = lado corto):

| `min_short_side` | `max_short_side` | `box_width` × `box_height` |
|---|---|---|
| 1 | 720 | 2560 × 1440 |
| 721 | 2159 | 3840 × 2160 |
| **2160** | **2160** | **5760 × 3240** |

`above_max_source: "native"` · `forbid_source_downscale: true` · `rounding: floor_with_epsilon`
(ε = 1e-7) · `preserve_aspect_ratio/orientation: true`.

**Límite duro para el 6K de REA:** la tabla **termina** en `short_side 2160`. Todo lo que supere ese
lado corto **se reproduce nativo** (`above_max_source: native`). No hay fila que lleve a 6144×3456 ni a
7680×4320. Un "6K REA" distinto de 5760×3240 **no es alcanzable por esta política** — es un hecho del
contrato, no una opinión.

Otros bloqueos relevantes:

- `capacity.selection_owner: "player"`; 6 observaciones obligatorias (`source_decoder_support`,
  `max_texture_size`, `memory_budget`, `hdr_surface_support`, `playback_load`, `thermal_state`);
  `adaptation_order`: `reduce_effect_cost` → `reduce_processing_target_without_source_downscale` →
  `native_playback`; `preserve_source_frame_rate: true`;
  `sustained_performance_verified_by_metadata: **false**`.
- `hdr.sdr_to_pq`: exige Android API ≥ 33 **y** BT.709 SDR conocido **y** display HDR10 **y** salida EGL
  PQ **y** 10-bit. `metadata_alone_verifies_hdr: **false**`.
- `transport.headers.producer`: **200** claves / **8192** bytes JSON UTF-8 (coincide con el recorte
  EXTHTTP del generador). `consumer_contract`: 256 / 16384 / 8192 individual.
  `consumer_deployment_status: "requires_matching_apk_verification"` ← el consumidor **no está verificado**.
- `media_session_exposes_ott_frames: **false**` ⇒ REA no ve los frames de OTT.
- `runtime_result_fields` (9): `source_dimensions`, `requested_dimensions`, `applied_dimensions`,
  `requested_tier`, `applied_tier`, `hdr_applied`, `fallback_reason`, `dropped_frames`,
  `rebuffer_duration_ms`.
- `runtime_result_fields_semantics`: *"required_for_device_certification_**not_claimed_as_measured_results**"*.
- `runtime_verification`: `"required_on_physical_device"`.

⇒ Cualquier afirmación de "6K aplicado en device" es **indemostrable desde este repo**: exige device físico.

### 2.4 · `consumer-map.json`

```
version  : 1.1.0
contract : contracts/continuity.contract.json      <- ojo: NO es streaming_continuity_contract.json
audit_unit: A14 + I12/I14/I16/I17
summary  : { mapped: 11, reads_contract: 2, aligned: 2 }
```

11 consumidores. Solo **2 leen el contrato**: `headers_matrix` (`headers-matrix-v9.js`) y `excel`
(`export_ara_state_contract.py`). El **generador NO lee el contrato**:

```
id: "generator"
artifact: IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
reads_contract: false
evidence: ":226 findIndex only; :6354-6356 custom APE tags; no standard MEDIA-SEQUENCE/DISCONTINUITY/PROGRAM-DATE-TIME"
```

Esto importa para la integración: **añadir un contrato nuevo no obliga a tocar el generador**, porque el
generador no es un lector de contratos. La coherencia contrato↔código hoy se mantiene a mano.

### 2.5 · `ape_crystal_flow_operativa.json` — contrato de OPERATIVA por estación

```
flow      : APE CRYSTAL FLOW
contract  : ape.crystal.flow.operativa/1
version   : 1.0.0
frozen_at : 2026-11-14
owner_quote: "me refiero es que nadie cambie su operativa"
```

5 estaciones, cada una con `dueno`, `invariantes`, `prohibido`, `verificacion`, `no_cubre`:

| # | Estación | Dueño mediado | Verificación declarada |
|---|---|---|---|
| 1 | GENERADOR | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | `gate_ape_crystal_flow.sh [3]` (Range + `#EXT-X-APE-CHANNELS`) |
| 2 | CABLEADO | `tools/ops/ape-cablear*.php` + `vps/bin/ape-cablear-queue-worker.sh` | `gate_ape_crystal_flow.sh [2][3]` |
| 3 | AGENTE | `android/ape-crystal-agent` (`com.ape.crystalagent`) | `gate_no_focus_steal.sh` + `[4]` |
| 4 | SHIM | `ottshim/app/src/main/kotlin/dev/venice/ottshim` (módulo `:shim`) | `[6]` + comprobación manual |
| 5 | MEDICION | `vps/bin/ape-module-watchdog.sh` + `vps/prisma/api/*` | `[1][4][7]` + `/var/lib/ape/module-watchdog.json` |

Reglas globales innegociables (texto literal): *"Ninguna estación puede adelantar trabajo de otra"*,
*"no puede degradar la imagen para resolver un fallo"*, *"no puede declarar 'aplicado' lo que solo
'declaro' (truth-guard)"*, *"no puede aparecer encima del operador"*.

Prohibiciones que atan la integración:
`"cambiar CODECS= / RESOLUTION= / SUPPLEMENTAL-CODECS sin bitstream real"`,
`"declarar HDR verificado sin metadata real del proveedor"`, `"inventar una metrica cuando no se pudo
medir (se dice N/D)"`, y en GENERADOR: `"declarar 6K/8K sin capacidad real medida"`.

Cierre honesto del propio contrato (`lo_que_este_contrato_no_puede_garantizar`, 5 puntos), entre ellos:
*"Que el 4K se vea en el televisor: depende del enlace del device (~18 Mbps medidos como techo)"* y
*"Que el VPP mejore la imagen: los 4 levers devuelven null en este firmware"*.

### 2.6 · `anti_degradation_contract.json`

```
version: 1.0 · status: mandatory · effective: 2026-11-01
gate: node tools/check_anti_degradation_policy.js
```

- `forbidden_automatic_actions` (8): `resolution_downscale_4k_to_fhd`, `resolution_downscale_4k_to_hd`,
  `codec_hevc_to_h264_for_fix`, `hdr_to_sdr_for_fix`, `fps_reduction_for_fix`,
  `video_bitrate_reduction_for_fix`, `audio_channel_reduction_for_fix`, `replace_4k_source_with_fhd`.
- `allowed_without_exception` (5): `jit_native_copy_4k`, `buffer_prefetch_adjustment`, `cdn_route_change`,
  `measured_bitrate_metadata_correction`, `remove_false_audio_claims`.
- `exception_requires` (5 campos obligatorios): `channel_id`, `device_id`, `degradation`, `reason`, `date`.

### 2.7 · `crystal_4k_enhancement_contract.json` (v1.1, `amended: 2026-11-15`)

`priority`: `native_remux` → `display_vpp` → `real_upscale_if_capacity` → `synthetic_display_enhancement`.
`gate`: `node tools/check_crystal_4k_law.js`.

`uhd_simulation` — la parte que manda sobre la integración:

| Tier | `target` | `declares_stream_inf_resolution` | Requisito |
|---|---|---|---|
| `4K-FAKE` | **3840x2160** | `true` | — |
| `6K-SIMULATE` | **5760x3240** | `true` | `required_codec_level: hvc1.2.4.L183.B0` |
| `8K-FAKE` | **7680x4320** | **`false`** | display-only, `NEVER_REAL=1` |

`ladder`: 8K-FAKE (no declarado en manifest) → 6K-SIMULATE (declarado, L183) → 4K-FAKE (declarado).
`selection_rule`: *"buscar SIEMPRE el tier mas alto sostenible y declararlo como SIMULADO"*.
`fallback.on`: `decoder_rejects_level`, `bandwidth_insufficient`, `tier_not_declarable` → `to: 4K-FAKE`.
`fallback.never_below`: *"caer a FHD/HD/SD por fallo es degradacion y esta prohibido"*.
`uhd_simulation.forbidden` (5): declarar que la FUENTE tiene la resolución objetivo · declarar
`applied/verified` sin recibo del motor · simular recortando bitrate/fps/HDR/audio · declarar CMAF sin
`#EXT-X-MAP` real · declarar un nivel de codec incapaz de la resolución declarada.
`required_truth_tags` (3): `#EXT-X-APE-UPSCALE:...EXECUTOR=display;EXECUTED=0`,
`#EXT-X-APE-STREAM-TRUTH:...`, `#EXT-X-APE-TARGET-PROFILE:...`.

### 2.8 · `streaming_continuity_contract.json` (v1.1, `amended: 2026-11-15`)

`manifests.cache_control`: `no-cache, no-store, must-revalidate, private, max-age=0` (+ `pragma`, `expires=0`).
`segments`: `unique_per_session: true`, `init_pattern ^init-[A-Za-z0-9]+-[0-9]+\.m4s$`,
`chunk_pattern ^chunk-[A-Za-z0-9]+-[0-9]+-[0-9]+\.m4s$`, `etag: dynamic`, `vary: "*"`.
`range`: `206`, `Accept-Ranges: bytes`, `Content-Type: video/iso.segment`, insatisfacible `416`.
`cors`: `*`, `GET, HEAD, OPTIONS`, expone `Content-Range, Accept-Ranges, Content-Length, ETag`.
`transports`: `JIT_CONTROLLED`, `VPS_CDN`, `DIRECT_PROVIDER`.
`fallback`: `HDR` → `SDR_1080` → `SDR_720`.
`forbidden_tokens`: `["4KFALSE","8KFAKE"]` **pero** `token_semantics` lo acota: *"Prohiben AFIRMAR una
fuente falsa. **NO prohiben los tags de simulacion UHD**"* (authority `owner-decision-2026-11-15`).
`declared_allowed_tokens`: `LCEVC`, `AI-SR`, `AI-FI`, `DV-PROFILE`, `QUANTUM-PIXEL` (cada uno con
`STATUS=DECLARED_ONLY / EXECUTED=0`).
`ci` (3): `node tools/certify_http_200_206_302.js`, `node tools/verify_streaming_headers.js`,
`node tools/check_streaming_continuity.js`.

### 2.9 · El 6K: DOS targets, NO se unifican (evidencia exacta)

Este era el punto que la misión marcó como trampa. Medido:

| Dominio | Fichero fuente | Campo | Valor | Línea |
|---|---|---|---|---|
| **VPS JIT legacy (FFmpeg)** | `contracts/crystal_6k_enhancement_contract.json` | `target` | **`6144x3456`** | L6 |
| 〃 | 〃 | `execution_domain` | `vps_jit_legacy` | L7 |
| 〃 | 〃 | `rea_device_4k_target` | `5760x3240` | L10 |
| 〃 | 〃 | `default_enabled` | `false` | L32 |
| 〃 | 〃 | `opt_in_env` | `APE_6K=1` | L33 |
| **Device REA (player)** | `contracts/rea/rea-processing-v1.json` | `resolution.rules[2]` | `box 5760x3240` | L28 |
| **Declaración en manifest** | `contracts/crystal_4k_enhancement_contract.json` | tier `6K-SIMULATE.target` | `5760x3240` + `L183` | L46-47 |
| 〃 | `contracts/streaming_continuity_contract.json` | tier `6K-SIMULATE.target` | `5760x3240` + `L183` | L70-73 |

El propio contrato legacy lo dice y ordena no mezclarlos (`crystal_6k_enhancement_contract.json:11`):

```
"domain_note": "The legacy VPS FFmpeg target and the REA device target are distinct execution domains;
                neither a playlist nor this contract proves either was executed."
```

**Regla de integración que se deriva (no se unifica nada):**

- `6144x3456` = objetivo del **transcodificador FFmpeg del VPS**. Es un dominio de ejecución distinto.
  Y según `CLAUDE.md`/doctrina el VPS de producción es **metadata-only**: no transcodifica. Por tanto
  este target **no es alcanzable hoy en producción** y no debe presentarse como si lo fuera.
- `5760x3240` = target del **device REA** y **único valor 6K declarable en `RESOLUTION`** (con `L183`).
- El genérico "6K" de la skill **no es un número único**: hay que decir cuál de los dos.

---

## 3 · `.agents/skills_index.json` — esquema exacto y registro sin duplicar (task 2)

### 3.1 · Identidad y forma

```
ruta      : <ROOT>\.agents\skills_index.json
bytes     : 195 230
sha256    : c6ceefae339d8743ab30c541c972bf62b47fdc1400f4ff3b9e5fb1f9733d6865
top_type  : OBJECT (no array)
spec_version   : "iptv-enterprise-300-skills-v1"
generated_at   : "2026-05-17T02:53:09Z"
```

Top-keys: `["spec_version","generated_at","team_agent_supremo","totals","skills"]`.

- `team_agent_supremo.specialists`: objeto `S1`..`S10`, cada uno con `id`, `name`, `domain`, `mission`.
- `totals`:

```json
{ "skills_total": 307, "anchors": 16, "satellites": 291,
  "by_specialist": { "S1":31,"S2":30,"S3":31,"S4":30,"S5":30,"S6":31,"S7":30,"S8":31,"S9":32,"S10":31 } }
```

- `skills`: **array de 307 entradas**.

### 3.2 · Claves por entrada — **13**, al 100 % de cobertura

Medido con `new Set(Object.keys(e))` sobre las 307 entradas (`DISTINCT KEYS PER ENTRY = 13`) y contando
presencia de cada clave:

| # | Clave | Cobertura | Tipo / dominio observado |
|---|---|---|---|
| 1 | `name` | 307/307 | string, == nombre de la carpeta |
| 2 | `specialist` | 307/307 | `S1`..`S10` |
| 3 | `specialist_name` | 307/307 | string (p.ej. `IPTV/HLS Architect`) |
| 4 | `domain` | 307/307 | string (p.ej. `HLS/M3U8`, `IPTV/REA`) |
| 5 | `kind` | 307/307 | `anchor` \| `satellite` |
| 6 | `parent_anchor` | 307/307 | **`null` en anchor**, nombre del anchor en satellite |
| 7 | `status` | 307/307 | `installed` |
| 8 | `description` | 307/307 | string (es el texto que ve el selector de skills) |
| 9 | `installed_at` | 307/307 | ISO-8601 (con y sin offset en la muestra) |
| 10 | `risk_level` | 307/307 | `low` \| `medium` \| … |
| 11 | `source_repos` | 307/307 | array (vacío en la muestra) |
| 12 | `external_packages` | 307/307 | array (vacío en la muestra) |
| 13 | `validation_commands` | 307/307 | array de strings |

Sin claves opcionales: las 13 aparecen en **todas** las entradas. Una entrada nueva con menos de 13 rompe
la uniformidad que el resto del índice asume.

Verificación de integridad interna:

```
kind distribution: {"anchor":16,"satellite":291}      == totals (16 / 291)   CONSISTENTE
anchors con parent_anchor != null : 0                                       CONSISTENTE
satellites sin parent_anchor      : 0                                       CONSISTENTE
duplicate_names                   : []                                      CONSISTENTE
null_names                        : 0                                       CONSISTENTE
```

> Nota de honestidad: `totals.skills_total` = 307 coincide **exacto** con `anchor 16 + satellite 291` y
> con la longitud del array.

### 3.3 · Discrepancia REAL medida: 321 carpetas vs 307 entradas

```
dirs on disk = 321     indexed = 307
dirs NOT in index (14):
  ape-image-pipeline-truth, ape-lista-cartographer, ape-omega-visual-loop,
  claude-code-repo-surgeon, iptv-4k-pipeline-automation, iptv-4k-source-truth-audit,
  iptv-antifreeze-continuity-doctrine, iptv-ape-apk-vps-contract-alignment,
  iptv-failover-upstream-discipline, iptv-profile-fallback-doctrine,
  iptv-real-resolution-verifier, iptv-stream-stability-score,
  iptv-supreme-repos-4k, iptv-supreme-repos-atlas
indexed WITHOUT dir (0): []
```

Hay **14 skills en disco que NO están en el índice** (drift previo, no causado por esta tarea). Las que
más importan aquí: `ape-image-pipeline-truth` e `iptv-4k-pipeline-automation` **existen como carpeta y no
como entrada de índice**.

**Consecuencia para el registro de `ape-iptv-auditoria-4k-premium6k`:** el índice **no es la única
fuente de verdad**; hay skills usables sin entrada. Registrar la nueva skill significa **añadir entrada
Y** decidir si además se regularizan las 14 huérfanas (decisión del capitán, no de esta tarea).

### 3.4 · Cómo se registra una skill nueva sin duplicar (procedimiento derivado de lo medido)

1. **Comprobar colisión de nombre** contra `skills[].name` **y** contra las carpetas de `.agents/skills/`
   (porque hay 14 carpetas sin entrada — mirar solo el índice deja pasar duplicados).
2. **Crear la carpeta** `.agents/skills/<nombre>/` con la estructura de 3.5.
3. **Añadir UNA entrada** al array `skills[]` con las 13 claves del punto 3.2. Reglas observadas:
   - `name` == nombre de la carpeta (coincidencia 307/307).
   - `kind: "anchor"` ⇒ `parent_anchor: null`; `kind: "satellite"` ⇒ `parent_anchor: "<anchor>"`.
   - `description` es el texto que se inyecta en el catálogo del agente: arranca con `"Use when …"` en
     las entradas recientes.
   - `validation_commands`: array de comandos reproducibles (no prosa).
4. **Actualizar `totals`**: `skills_total`, `anchors` **o** `satellites`, y `by_specialist[Sn]`
   (la suma de `by_specialist` debe seguir cuadrando con `skills_total`).
5. **Actualizar `generated_at`**.
6. **No tocar** `spec_version` ni `team_agent_supremo`.

### 3.5 · Estructura de carpeta (2 ejemplos reales)

```
.agents/skills/iptv-hls-validator/
  SKILL.md  README.md  references.md  commands.md  checklist.md  tests.md
  install.lock.json  audit-report.md          <- 8 ficheros
  examples/ (1)  scripts/ (1)  fixtures/ (1)  <- 3 subdirectorios
```

```
.agents/skills/iptv-suprema-2026-premium/
  SKILL.md  README.md  references.md  commands.md  checklist.md  tests.md
  install.lock.json  audit-report.md  SUPREME_2026.md   <- 9 ficheros (1 EXTRA)
  examples/ (1)  scripts/ (1)  fixtures/ (1)
```

⇒ Los **8 ficheros + 3 subdirs** son el mínimo, no un techo: se admiten ficheros extra
(`SUPREME_2026.md` lo prueba). `iptv-hls-validator` = anchor, `iptv-suprema-2026-premium` = anchor con
fichero adicional.

`install.lock.json` — esquema `ape.skill.install.lock.v1`, campos medidos:

```json
{
  "schema": "ape.skill.install.lock.v1",
  "name": "iptv-suprema-2026-premium",
  "version": "1.0.0",
  "profile": "IPTV_PREMIUM",
  "based_on": "creador_habilidades",
  "installed_at": "2026-11-02T00:00:00-05:00",
  "source": "local",
  "external_packages": [],
  "network_required": false,
  "writes_production": false,
  "validation": { "command": "...", "expected": "ok: true" }
}
```

`SKILL.md` lleva frontmatter YAML: `name`, `description`, `version`, y `metadata:` con
`type` (`anchor`), `profile`, `base`, `source_corpus`.

---

## 4 · Generadores ACTIVOS: quién se sirve de verdad desde `index-v4.html` (task 3)

`frontend/index-v4.html` = **292 514 bytes, 5 196 líneas, 236 etiquetas `<script src>`** (medido con
`node` extrayendo cada `src` y su número de línea).

### 4.1 · Los tres sospechosos: CONFIRMADOS ACTIVOS

| Fichero | Línea en `index-v4.html` | `?v=` | bytes | sha256 (16) | `node --check` |
|---|---:|---|---:|---|---|
| `js/ape-v9/ape-profiles-config.js` | **4317** | `?v=20261120-perfiles12` | 414 214 | `09110948342d744b` | exit 0 |
| `js/ape-v9/m3u8-typed-arrays-ultimate.js` | **4399** | `?v=20261120-autoapply` | 970 835 | `aa37dd44765c988a` | exit 0 |
| `js/ape-v9/profile-manager-v9.js` | **4701** | `?v=20261120-autotune` | 361 026 | `d1d16ad7e8f2dcc8` | exit 0 |

Las tres se cargan **con `?v=`** (cache-busting activo), y los tres `?v=` llevan **fecha de hoy
`20261120`** — es decir, son las versiones vigentes servidas, no copias muertas.

Orden real de carga (importa por dependencias):

```
4317  ape-profiles-config.js            (config de perfiles)
4399  m3u8-typed-arrays-ultimate.js     (generador; emite STREAM-INF + tags APE)
4701  profile-manager-v9.js             (panel/perfiles UI)
```

Antes de 4399 ya están cargados, entre otros, `ape-quality-prober.js` (4341), `ape-fallback-resolver.js`
(4382), `ape-hevc-cascade.js` (4380), `rea-processing-policy.js` (4313), `rea-export-finalizer.js`
(4314), `ape-profiles-12k.js` (4316).

### 4.2 · Hallazgos colaterales de la misma pasada (medidos, no corregidos)

- **`js/ape-v9/ape-engine-v9.js` se carga en la línea 4522 pero mide 0 bytes** (fichero vacío). Es carga
  muerta; no rompe nada porque el generador lo lee de forma defensiva
  (`const _cas = (typeof window !== 'undefined' && window.APE_HEVC_CASCADE) || null;`), pero conviene
  saberlo antes de "arreglar" algo ahí.
- **`js/ape-v9/m3u8-generator-architecture1.js`** también mide **0 bytes** y se carga en 4833.
- En 4703 se carga `js/profile-manager-custom-headers.js` (sin `?v=`) — otro fichero de "headers" que no
  es el `profile-manager-v9.js`; no confundirlos.
- Coexisten **236** `<script src>`: el `index-v4.html` es el ensamblador real de la app. Cualquier
  integración que añada un módulo nuevo **entra por aquí**, y el `?v=` debe seguir el patrón
  `?v=<yyyymmdd>-<slug>` para no servir caché viejo.

---

## 5 · Flag de activación: qué existe y qué se propone (task 4)

### 5.1 · Búsqueda medida

| Token | Ámbito buscado | Resultado |
|---|---|---|
| `APE_VISUAL_FIRST` | todo `<SUB>` | **3 coincidencias, ninguna en JS** |
| `APE_6K` | `<SUB>\frontend` | 26 coincidencias: **0 son un flag leído** |
| `APE_4K6K` / `APE_4K_6K` / `4K6K` | **todo el repo** (js/html/json/md/php/lua/sh/py/kt/ts, excluyendo `node_modules`, `.git`, `_audit_snapshot`, `_backups`) | **0 coincidencias** |

**`APE_VISUAL_FIRST`** — solo vive en el VPS:

```
vps/ape-uhdx/visual_profiles.json:6     "experimental_mode_env": "APE_VISUAL_FIRST=1"
vps/ape-uhdx/visual_profiles.json:1497  "activation": "APE_VISUAL_FIRST=1"
vps/ape-uhdx/visual_profiles.json:1774  "activation": "APE_VISUAL_FIRST=1 + APE_CHINA_BOX_AGGRESSIVE=1"
```

⇒ Es un **nombre de variable de entorno declarado en un JSON del VPS**. **No** hay `window.APE_VISUAL_FIRST`
en ningún JS del frontend. **No reutilizable como flag de runtime del generador.**

**`APE_6K`** — sus 26 apariciones son de cuatro tipos y **ninguna es un flag**:

1. Literal de metadata en el tag: `#EXT-X-APE-CRYSTAL-6K:OPT-IN-APE_6K` (`m3u8-typed-arrays-ultimate.js:7362`) — es **texto emitido**, no una condición leída.
2. Nombres de variable internos: `_APE_6K_FALLBACK`, `_APE_6K_RES`, `_APE_6K_TABLE`, `_APE_6K_SOURCE`,
   `_ape6kResolve`, `_ape6kCfg7` (L9638-9795) — son **identificadores**, no flags.
3. Constantes de IDs de perfil: `const APE_6K_IDS = ['P0.5',…,'P5.5']` (`profile-manager-v9.js:6154`,
   `ape-profiles-config.js:5143`).
4. **Claves de config en tests**: `APE_6K: false` / `APE_6K: true` en
   `frontend/tests/rea-v24-e2e-playlist.js:98`, `rea-6k-lab-provenance.test.js:75`,
   `rea-generation-dispatch.test.js:72` — se pasan dentro de un objeto de opciones de test, no se leen
   de `window`.
5. Y el contrato lo declara como **env var**: `crystal_6k_enhancement_contract.json:33 →
   "opt_in_env": "APE_6K=1"`.

⇒ `APE_6K` **existe como nombre declarado** (contrato + tests + metadata), **no como flag de runtime con
lector en el generador**.

**`APE_4K6K`** — **no existe**. Cero coincidencias repo-wide. Por tanto hay que crearlo.

### 5.2 · El idiom correcto YA existe en este código (4 patrones medidos)

| Patrón | Sitio | Semántica | Por qué sirve |
|---|---|---|---|
| `window.APE_8K_DECLARE === true` | `m3u8-typed-arrays-ultimate.js:9556` (comentario) | **opt-in estricto, default OFF** | comparación estricta ⇒ ausente = OFF ⇒ byte-idéntico |
| `window.APE_ATTRFROMURL` (presencia) | `m3u8-typed-arrays-ultimate.js:10278` | *"Default OFF: sin `window.APE_ATTRFROMURL` devuelve el UA intacto (**cero cambio**)"* | es **literalmente** el contrato de la misión |
| `window.APE_SHIMOTT === false` | `m3u8-typed-arrays-ultimate.js:10188` | default ON + rollback por flag | patrón de rollback, no de opt-in |
| `window.APE_FAKE_UHD` | `m3u8-typed-arrays-ultimate.js:2749-2752` | `'8k'` opt-in · `'0'/0/false` = OFF · resto = default `'4k'` | muestra que el repo ya distingue "default seguro" de "opt-in" |

### 5.3 · PROPUESTA (no implementada en esta tarea)

**Nombre:** `window.APE_4K6K_AUDIT`
**Semántica:** `=== true` estricto ⇒ ausente / `0` / `false` / `undefined` = **OFF** = comportamiento previo
**byte-idéntico**. Equivale al `APE_4K6K_AUDIT=0` que pide la misión, con el idiom de `APE_8K_DECLARE`.

**Sitio propuesto:** `<SUB>\frontend\js\ape-v9\m3u8-typed-arrays-ultimate.js`, **dentro de
`_apeAppendLegacyEnhancementMetadata(m3u, ctx)`** (definida en **L9572**), que es la función que **ya**
gobierna el bloque 6K:

```
L9572   function _apeAppendLegacyEnhancementMetadata(m3u, ctx) {
L9626   // (6) [2026-11-06] 6K EMULADO — variante P*.5 para TODOS los perfiles.
L9638   const _APE_6K_FALLBACK = { … }
L9684   const _APE_6K_RES = _ape6kResolve();
L9725   '#EXT-X-APE-CRYSTAL-6K:OPT-IN-ACTIVE;PROFILE=' + _6k.id + ';BASE=' + _6kBase
L9733   '#EXT-X-APE-CRYSTAL-6K-MODE:EMULATED;SOURCE=' + _src6kFinal + ';TECHNIQUE=' + _6k.tec
L9737   '#EXT-X-APE-CRYSTAL-6K-TRUTH:DECLARED_ENHANCEMENT;NOT_SOURCE;DOWNSCALE_FORBIDDEN'
L9742   const yaEste = lines.some(l => l.startsWith('#EXT-X-APE-CRYSTAL-6K:'));
```

**Razones (medidas, no estéticas):**

1. La función **ya** tiene un patrón de salida temprana demostrado por el mismo autor del repo en
   `_apeAppendExtshimottTag` (L10184-10188): `if (!src) return src; if (window.APE_SHIMOTT === false) return src;`
   ⇒ el guard del audit se escribe igual: `if (!(typeof window !== 'undefined' && window.APE_4K6K_AUDIT === true)) { …ruta previa intacta… }`.
2. El bloque 6K emite **8 líneas** `#EXT-X-APE-CRYSTAL-6K*` en esta función (L9725, 9733, 9736, 9737,
   9742, 9797, más los comentarios 9827 y el literal 7362 en otra función). Poner el flag aquí cubre el
   **punto único de emisión 6K**.
3. **`#EXTSHIMOTT` NO puede llevar el resultado de la auditoría**: `additionalProperties=false`
   (sección 2.2). Por eso la salida del audit es un **sidecar** (fichero aparte / artefacto), **no** un
   campo nuevo. Esto no es una preferencia: es la única opción legal del contrato.
4. `window.APE_GEN = generateM3U8Stream` (L13693) es el export headless: un test puede fijar
   `window.APE_4K6K_AUDIT` y comparar la salida con y sin flag. Eso es la prueba de byte-identidad.

---

## 6 · Lista protegida — SOLO LECTURA (task 5)

Objetivo: `https://iptv-ape.duckdns.org/lists/APE_LISTA_1795153321616_CDN_CABLEADA.m3u8`

**Presupuesto respetado:** 3 peticiones, **16 384 bytes** en total (4096 + 8192 + 4096), es decir
**0,0022 %** de 734 128 578 B. Cero escrituras. Cero recableado. El fichero remoto no se modificó
(es de solo lectura por HTTP y no se emitió ningún método de escritura).

### 6.1 · `curl -sS -I` (HEAD)

```
HTTP/1.1 200 OK
Server: nginx
Date: Fri, 20 Nov 2026 06:50:49 GMT
Content-Type: application/vnd.apple.mpegurl
Content-Length: 734128578
Last-Modified: Fri, 20 Nov 2026 06:08:46 GMT
Connection: keep-alive
ETag: "6affe3ee-2bc1e9c2"
Cache-Control: no-store
X-APE-List-Source: pulse-wrapped-if-present
Access-Control-Allow-Origin: *
Accept-Ranges: bytes
```

`curl_exit=0`

| Campo pedido | Valor medido |
|---|---|
| **código HTTP** | `200 OK` |
| **content-length** | `734128578` B (= 700,13 MiB · 734,13 MB) |
| **MIME** | `application/vnd.apple.mpegurl` |
| **Cache-Control** | `no-store` |
| **X-APE-List-Source** | `pulse-wrapped-if-present` |
| extra | `ETag "6affe3ee-2bc1e9c2"` · `Last-Modified 2026-11-20T06:08:46Z` · `Accept-Ranges: bytes` · `Access-Control-Allow-Origin: *` |

`X-APE-List-Source: pulse-wrapped-if-present` **confirma el cableado**: lo servido es el artefacto
envuelto por `ape-pulse-sync` (`pulse/…`), no el `lists/…` crudo. Coherente con
`artifacts/2026-11-20-cableado-lee-todo.md` §3, que midió el mismo header en la lista hermana
`..._DIRECTA_CABLEADA` (708 078 781 B).

### 6.2 · `GET Range 0-4095`

```
HTTP/1.1 206 Partial Content
Content-Type: application/vnd.apple.mpegurl
Content-Length: 4096
ETag: "6affe3ee-2bc1e9c2"
Cache-Control: no-store
X-APE-List-Source: pulse-wrapped-if-present
Content-Range: bytes 0-4095/734128578
```

`curl_exit=0` · recibidos **4096 B** · `sha256(range 0-4095) = 9C397A0B460D0D479FFEBA1196806BC10BC8C0522EED8670A981720D58902AE3` · **33 líneas**

Primeras 6 líneas (verbatim, es la cabecera del master):

```
#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift=0 url-tvg="" refresh="1800"
#EXT-X-VERSION:9
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-APE-CHANNELS:11222
#EXT-X-APE-LAB-EXTRAS:1
#EXT-X-APE-LAB-DNA:sha256=unverified,SOURCE=LAB_CALIBRATED,EXPORTED=2026-10-26T01:31:05
```

Hechos que se pueden afirmar de aquí:

- El master **declara `#EXT-X-APE-CHANNELS:11222`** ⇒ 11 222 canales, que es exactamente lo que exige el
  invariante [3] de la estación GENERADOR (`ape_crystal_flow_operativa.json`: *"el master declara
  `#EXT-X-APE-CHANNELS` con el total real"*). Cumple.
- `#EXT-X-VERSION:9` + `#EXT-X-INDEPENDENT-SEGMENTS` presentes.
- **`#EXT-X-APE-LAB-DNA:sha256=unverified`**: la propia lista **declara su ADN como no verificado**.
  Es un truth-guard honesto del generador; la auditoría 4K/6K **no debe prometer verificar el LAB** a
  partir de la lista.

### 6.3 · `GET Range 4096-12287` (8 KB, censo de cabecera)

`curl_exit=0` · 8192 B.
Vocabulario de tags en esa ventana: **`#EXT-X-APE-LAB-METADATA` × 2**, y **1 línea que no empieza por `#`**.
**`#EXTINF` no aparece dentro de los primeros 12 288 B.**

⇒ La cabecera del master **es más larga que 12 KB y tiene líneas muy largas** (los blobs
`#EXT-X-APE-LAB-METADATA`). Consecuencia práctica: **una sonda de 4 KB no ve ni un canal**. Cualquier
auditoría que lea "la cabecera" tiene que asumir que el fichero es de 734 MB y que la cabecera no cabe en
una ventana pequeña.

### 6.4 · `GET Range 734124482-734128577` (cola, 4 KB)

`curl_exit=0` · 4096 B · 33 líneas no vacías · la última línea **sí** empieza por `#`.

Tags vistos en la cola (nombres, sin valores) — 31 tags distintos, todos ×1 menos los que se indican:

`#EXT-X-APE-HDR-GPU-TONEMAP` · `#EXT-X-APE-HDR-FILM-GRAIN` · `#EXT-X-APE-LCEVC-STANDARD` ·
`#EXT-X-APE-LCEVC-PLAYER-REQUIRED` · `#EXT-X-APE-LCEVC-ENHANCEMENT` ·
`#EXT-X-APE-CORTEX-AI-SUPER-RESOLUTION` · `#EXT-X-APE-CORTEX-AI-SPATIAL-DENOISE` ·
`#EXT-X-APE-CORTEX-LCEVC` · `#EXT-X-APE-CORTEX-TEMPORAL-ARTIFACT-REPAIR` ·
`#EXT-X-APE-CRYSTAL-ENHANCEMENT` · `#EXT-X-APE-REALCE-SOURCE` · `#EXT-X-APE-URL2-CARTRIDGE` ·
`#EXT-X-APE-URL2-DEVICE` · `#EXT-X-APE-SOURCE` · `#EXT-X-APE-REA` · `#EXT-X-APE-STREAM-TRUTH` ·
`#EXT-X-APE-QOE-CONTRACT` · `#EXT-X-STREAM-INF` · **`#EXTSHIMOTT`** · `#EXT-X-APE-LCEVC-PHASE` ·
`#EXT-X-APE-LCEVC-ENABLED` · `#EXT-X-APE-HDR10-PLUS` · `#EXT-X-APE-DOLBY-VISION` ·
`#EXT-X-APE-HDR-DV` · `#EXT-X-APE-AI-SR` · `#EXT-X-APE-MINTERPOLATE` · `#EXT-X-APE-ENHANCE-STATE` ·
`#EXTVLCOPT` · `#EXT-X-APE-CRYSTAL-UHD` · `#EXT-X-APE-AUDIT-SCORECARD` · `#EXT-X-APE-VALIDATED`

Formas de las líneas no-tag (dígitos enmascarados): una `"EXECUTED=N"` (es una **continuación** de una
línea larga cortada por la ventana) y una `"https://iptv-ape.duckdns.org"` (una **URI de canal**, o sea
cableado `/pulse/` confirmado otra vez en la cola).

Hechos afirmables:

- **`#EXTSHIMOTT` aparece ×1 en el bloque de canal** ⇒ se cumple `occurrences_per_channel: 1` del contrato
  (al menos en el último canal, que es lo que esta ventana prueba).
- El bloque de canal emite `#EXT-X-STREAM-INF` (×1) y termina con `#EXT-X-APE-AUDIT-SCORECARD` +
  `#EXT-X-APE-VALIDATED` ⇒ **ya existe un "AUDIT-SCORECARD" en la lista actual**. Esto es crítico para la
  integración: la auditoría 4K/6K **no debe inventar un tag homónimo ni pisarlo**; debe ir por sidecar.

---

## 7 · Gates y validadores: estado del baseline (pre-existente)

Los 9 gates que citan los contratos **existen en disco**:

```
EXISTS  tools\check_anti_degradation_policy.js
EXISTS  tools\check_crystal_4k_law.js
EXISTS  tools\check_crystal_6k_law.js
EXISTS  tools\certify_http_200_206_302.js
EXISTS  tools\verify_streaming_headers.js
EXISTS  tools\check_streaming_continuity.js
EXISTS  tools\quality\validate_extshimott.js
EXISTS  tools\quality\gate_no_focus_steal.sh
EXISTS  tools\quality\gate_ape_crystal_flow.sh
```

**Verificador de contratos — FALLA HOY, y es PRE-EXISTENTE:**

```powershell
node contracts/verify_contracts.mjs
```

```
== VERIFICACIÓN DE CONTRATOS ==
  PASS  schema crystal-contracts/v1
  PASS  master sha256 e2bb8e69a31d0f68…
  PASS  artefacto _vps_stage/media/ape-supervisor.sh
  PASS  artefacto _vps_stage/media/ape-supervisor.lua
  PASS  artefacto _vps_stage/media/ape-supervisor@.service
  PASS  artefacto _vps_stage/media/ape-ingest.sh
  PASS  artefacto _vps_stage/media/ape-ingest@.service
  PASS  artefacto _vps_stage/lua/ape_session.lua
  PASS  artefacto _vps_stage/lua/ape_caps.lua
  PASS  artefacto _vps_stage/nginx/media-fanout.conf
  PASS  viabilidad GPU/CPU declarada por perfil
  FAIL  SHA MISMATCH _vps_stage/tests/fanout_concurrency.sh: contrato 9b774bffbe6c744f… vs real b558b1cdff883579…

RESULT=FAIL (1 fallos, 11 ok)     exit=1
```

**Lectura honesta:** 11 PASS / 1 FAIL. El fallo es un **pin de sha256 desincronizado** en
`_vps_stage/tests/fanout_concurrency.sh` contra `contracts/crystal_contracts.json`. **No lo causó esta
tarea** (no se escribió ni un byte) y **no está entre los 7 contratos** del alcance, pero queda registrado
como estado de llegada: si en la entrega final el verificador sigue en FAIL, es el mismo FAIL, no uno nuevo.

Seguridad del comando: sus `writeFileSync` viven **solo** dentro de `if (SELF_TEST)` (L109-143) y escriben en
un `mkdtempSync(tmpdir())` que se borra en `finally`. Sin `--self-test` es de solo lectura. Verificado
leyendo L104-146.

---

## 8 · Constraints duros para la integración (derivados de lo medido)

| # | Constraint | Evidencia |
|---|---|---|
| C1 | No se añaden campos a `#EXTSHIMOTT`; el audit va por **sidecar** | `additionalProperties=false` en raíz + 8 sub-objetos; `unknown_field_policy: RECHAZO` |
| C2 | No existe flag `APE_4K6K`; hay que crearlo, **default OFF estricto** | 0 coincidencias repo-wide; idiom `APE_8K_DECLARE === true` |
| C3 | `6144x3456` (VPS FFmpeg) y `5760x3240` (REA/manifest) **no se unifican** | `crystal_6k_enhancement_contract.json:6,10,11` + `rea-processing-v1.json:28` |
| C4 | REA **no alcanza** más de `short_side 2160`: por encima es `native` | `rea-processing-v1.json:30` `above_max_source: "native"` |
| C5 | El único 6K declarable en `RESOLUTION` es `5760x3240` **con `hvc1.2.4.L183.B0`** | `crystal_4k:46-47`, `streaming_continuity:70-73` |
| C6 | 8K **nunca** en `RESOLUTION` por defecto (display-only) | `crystal_4k:58-63` `declares_stream_inf_resolution: false` |
| C7 | La auditoría **no** puede declarar `applied`/`verified`: solo `DECLARED`/`EXECUTED=0` | `crystal_4k:87`, `ape_crystal_flow_operativa` truth-guard |
| C8 | Ya existe `#EXT-X-APE-AUDIT-SCORECARD` en la lista: no colisionar | sonda de cola, §6.4 |
| C9 | La cabecera del master > 12 KB: no se puede auditar leyendo 4 KB | §6.3 |
| C10 | Con el flag OFF la salida debe ser byte-idéntica: hay que hashear antes/después | hashes de §4.1 |
| C11 | El generador **no lee contratos** (`reads_contract: false`): la coherencia es manual | `consumer-map.json` |

### 8.1 · Hashes de referencia para probar "flag apagado ⇒ byte-idéntico"

```
aa37dd44765c988ac39a117810310b0f243cd5da4b84588deb3521e6aedc002d   970835  IPTV_v5.4_MAX_AGGRESSION\frontend\js\ape-v9\m3u8-typed-arrays-ultimate.js
09110948342d744b8577ac74d8e0ea2cd7d6b7bb62ea7941597ad56dbcda5c11   414214  IPTV_v5.4_MAX_AGGRESSION\frontend\js\ape-v9\ape-profiles-config.js
d1d16ad7e8f2dcc8ab677a906405be1fc20c9f54187484b249044a2265582ccf   361026  IPTV_v5.4_MAX_AGGRESSION\frontend\js\ape-v9\profile-manager-v9.js
a6991020308b33d950aaadc7c6c963d0267a4fd4a4a5c9e56ecf62026c29cc8b   292514  IPTV_v5.4_MAX_AGGRESSION\frontend\index-v4.html
```

Método de verificación exigible al cierre: generar la lista con `window.APE_4K6K_AUDIT` ausente y con
`= false`, y comparar `sha256` de la salida contra la generada por el código **sin integrar**. Si difieren,
la integración no es aditiva.

---

## 9 · Trabajo previo del equipo detectado (no duplicar)

`<SUB>\artifacts\forense-generador\` ya contiene forense del generador hecha por otro miembro:

```
REPORTE.md (34 925 B) · hallazgos.json (21 147 B) · list_header.json (119 164 B) ·
list_tail.json (5 132 B) · extras_measurement.json · pm9_measurement.json ·
measure_extras.js · measure_pm9.js · peek_list_header.js · peek_list_tail.js · verify_payload.js
```

`artifacts/2026-11-20-cableado-lee-todo.md` (131 líneas) documenta el cableado VERIFICADO end-to-end y las
dos mutaciones silenciosas de `ape-pulse-wrap.js` ya corregidas (token `d=` y UTF-8 multibyte).

**Importante — dato NO transferible:** `list_header.json` mide `indice_primer_extinf: 229` sobre el
artefacto `C:\Users\HFRC\Downloads\APE_LISTA_1794783650337_CDN.m3u8` (**1 370 841 112 B, mtime
2026-11-15T23:16:58Z**), que es **otro fichero**. Esos 229 no son la cabecera de la lista protegida de hoy
y **no deben citarse como tales**.

---

## 10 · NO COMPUTADO (con motivo)

| # | Qué no se pudo computar | Motivo exacto |
|---|---|---|
| N1 | Offset/línea del **primer `#EXTINF`** de la lista protegida | Exigiría escanear 734 MB. La misión prohíbe descargar la lista y esta tarea es solo-lectura con presupuesto de 16 KB. La sonda de 12 288 B no llega. |
| N2 | Nº total de canales del fichero **contado** | Solo se leyó la **declaración** `#EXT-X-APE-CHANNELS:11222` del master. Contarlos exige descargar 734 MB. La declaración **no es** un conteo verificado. |
| N3 | `#EXTINF` reales, URLs `/pulse/` reales, líneas totales de **esta** lista | Mismo motivo que N1/N2. (El dato de 11 222 EXTINF y 11 840 121 líneas existe en `2026-11-20-cableado-lee-todo.md` pero es de la lista `..._DIRECTA_CABLEADA` de 708 MB, **no** de esta.) |
| N4 | Que la lista protegida esté **funcionalmente** correcta (canales vivos) | Requeriría sondear cada URL; fuera de alcance y prohibido. |
| N5 | Estado del **VPS** (`nginx -T`, systemd, timers, `/var/lib/ape/*`) | Prohibido por la regla dura (2): no se escribe ni se opera el VPS. Esta tarea no abrió SSH. |
| N6 | Que los gates `check_crystal_4k_law.js`, `check_crystal_6k_law.js`, `check_anti_degradation_policy.js`, `validate_extshimott.js` **pasen** | Solo se verificó que los ficheros **existen**. No se ejecutaron: varios esperan argumentos (una lista) y su resultado en el baseline no es necesario para esta tarea. **Existencia ≠ PASS.** |
| N7 | `consumer_deployment_status` real (¿la APK consume el contrato?) | El propio contrato dice `"requires_matching_apk_verification"`. Verificarlo exige la APK desplegada + device. |
| N8 | Que REA aplique 5760x3240 en el device | `runtime_verification: "required_on_physical_device"` y `sustained_performance_verified_by_metadata: false`. Sin device físico, no computable. |
| N9 | Que el VPS aplique el target `6144x3456` | Dominio `vps_jit_legacy`; la doctrina del repo declara el VPS de producción **metadata-only** (no transcodifica). No hay motor FFmpeg medido. |
| N10 | Contenido del ZIP de auditoría | Regla dura (3): solo lectura, y esta tarea no necesitó abrirlo. No se abrió. |
| N11 | Las 14 skills en disco sin entrada de índice: su `kind`/`specialist` | No están en el índice, no tienen metadatos canónicos. Se listaron por nombre; clasificarlas exige leer cada `SKILL.md` (fuera del alcance de baseline). |
| N12 | `git status` / estado del árbol | Prohibido ejecutar git (regla dura 1). No se ejecutó ningún comando git. |

---

## 11 · Resumen ejecutivo del baseline

1. **El repo está partido en dos niveles**: `contracts/` y `.agents/` en la **raíz**; `frontend/` en la
   **subcarpeta**. Editarlo al revés es el primer error posible.
2. **`#EXTSHIMOTT` es un sobre CERRADO**: `additionalProperties=false` en la raíz y en los 8 sub-objetos.
   La auditoría 4K/6K **no puede** ser un campo nuevo. Va por sidecar. No es opinión: es el contrato.
3. **El 6K son dos números distintos y no se unifican**: `6144x3456` = FFmpeg del VPS (dominio
   `vps_jit_legacy`, no ejecutable en producción metadata-only); `5760x3240` + `hvc1.2.4.L183.B0` = device
   REA y único 6K declarable en `RESOLUTION`. El propio contrato manda no mezclarlos.
4. **REA tiene techo**: `short_side 2160` es la última fila; por encima, `native`. Un "6K REA" que no sea
   5760×3240 no es alcanzable.
5. **`APE_4K6K` no existe** (0 coincidencias repo-wide). El patrón a reutilizar es
   `window.APE_8K_DECLARE === true` / `window.APE_ATTRFROMURL`. Propuesta: `window.APE_4K6K_AUDIT === true`,
   leído en `_apeAppendLegacyEnhancementMetadata` (L9572) junto al bloque 6K (L9626-9742).
6. **Los 3 generadores son los activos**: `ape-profiles-config.js` (L4317), `m3u8-typed-arrays-ultimate.js`
   (L4399), `profile-manager-v9.js` (L4701), todos con `?v=20261120-*` y `node --check` exit 0.
7. **La lista protegida responde y está cableada**: 200, `734128578` B, `application/vnd.apple.mpegurl`,
   `Cache-Control: no-store`, `X-APE-List-Source: pulse-wrapped-if-present`, `#EXT-X-APE-CHANNELS:11222`,
   y su ADN se autodeclara `sha256=unverified`. Su cabecera **supera los 12 KB** y ya contiene
   `#EXT-X-APE-AUDIT-SCORECARD` — no colisionar.
8. **Hay un FAIL pre-existente** en `node contracts/verify_contracts.mjs`
   (`_vps_stage/tests/fanout_concurrency.sh`, sha desincronizado). No es de esta tarea; hay que
   distinguirlo en la entrega.
9. **`skills_index.json`**: 307 entradas, 13 claves cada una al 100 %, `16 anchors + 291 satellites`
   cuadrando con `totals`, 0 nombres duplicados. Pero hay **14 carpetas en disco sin entrada**:
   registrarse exige mirar el índice **y** el disco.

---

### Cómo reproducir todo este documento

```powershell
$root = "C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION"
$sub  = Join-Path $root "IPTV_v5.4_MAX_AGGRESSION"
cd $root
node --version; python --version
node _audit_contracts.js          # bytes+sha256+additionalProperties de los 7 contratos
node _audit_extshimott.js         # esquema completo del sobre ver:1
node _audit_skillsidx.js          # esquema de skills_index.json
node contracts/verify_contracts.mjs   # gate de contratos (FAIL pre-existente, 1/12)
cd $sub
node --check frontend\js\ape-v9\m3u8-typed-arrays-ultimate.js
curl.exe -sS -I --max-time 25 "https://iptv-ape.duckdns.org/lists/APE_LISTA_1795153321616_CDN_CABLEADA.m3u8"
curl.exe -sS --max-time 30 -r 0-4095 -D - -o NUL "https://iptv-ape.duckdns.org/lists/APE_LISTA_1795153321616_CDN_CABLEADA.m3u8"
```

Los tres scripts auxiliares `_audit_*.js` los creó esta tarea **en la raíz** para medir; son de lectura y
**no forman parte de la integración**. Si el capitán no los quiere en el árbol, son borrables sin efecto.
