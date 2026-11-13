# CONTRATO VERSIONADO CANARY → JIT (v1) — gate fail-closed de estados honestos

**Fecha:** 2026-11-11 · **Autor:** `contract-architect` (t5, team `canary-jit-20261111`)
**Entradas:** [`docs/audits/CANARY_TRUTH_20261111.md`](../audits/CANARY_TRUTH_20261111.md) · [`docs/audits/JIT_TRUTH_20261111.md`](../audits/JIT_TRUTH_20261111.md)
**Artefactos:**
[`contracts/canary_jit_contract_v1.json`](../../contracts/canary_jit_contract_v1.json) ·
[`tools/quality/test_canary_jit_contract.js`](../../tools/quality/test_canary_jit_contract.js) ·
este documento.

**Estado de este contrato: `CANDIDATE_NOT_DEPLOYED`.** No está mergeado, no está desplegado, no se ha
hecho push, y el manifiesto de deploy no se ha tocado. Un contrato que se declara aplicado sin recibo
del motor comete exactamente el fallo que existe para impedir.

---

## 1. Doctrina: declarar no es aplicar

El paquete de referencia ya hace dos cosas bien y este contrato las conserva:

- `canary_quality.js:6-12` y `:20-22` es fail-closed sobre la cadena: si el orden o el texto de un filtro
  cambia, lanza `CANARY_PARITY_CHANGED`.
- `canary_quality.js:47` clava `applied_processing:'NOT_EXECUTED'`; nunca declara aplicado lo que solo
  está declarado.

Lo que faltaba, y es el objeto de v1:

| Defecto del paquete | Medida | Qué hace el contrato |
|---|---|---|
| `canary_fidelity:'FILTERGRAPH_IDENTICAL'` es un **literal** de cadena | `canary_quality.js:45` | exige paridad **computada** etapa por etapa (`computeParity`), con recibo `computed:true` + `derived_from:"applied.filtergraph"`; la etiqueta sola se rechaza con `E_FIDELITY_LABEL_NOT_MEASURED` |
| El encoder real **no cabe** en la política | `quality-policy.json:16` declara 4 campos; el script emite 5 `x265-params` extra + `-b:v 25M -maxrate 32M -bufsize 64M` + `-g 48 -keyint_min 48 -sc_threshold 0` (`vps/bin/ape-visual-emulate.sh:112-114`) y `manifest.tsv:39` describe la fila como *«canary 4K (25M/32M/64M keyint 48)»* | bloque `encoder` completo + **huella** `sha256` que debe casar; sin rate control o sin GOP no hay recibo |
| Un solo estado | `desired_mode` se emite siempre (`canary_quality.js:44`) aunque `execution:'NOT_ELIGIBLE'` | triple estado `requested` / `applied` / `output` con guardas de colapso |
| Nada ata el artefacto al deploy | 6714 B con bucle JIT, 0 filas de manifiesto | bloque `deployability` que declara `NOT_DEPLOYED` |
| Nada ata la medida al motor | tres `server.js` distintos | `engine_sha256` obligatorio en el recibo |

**Regla de oro del contrato:** ningún campo se rellena por parecido. Si falta el dato, el gate es
`desconocido` y **rechaza**. Un `NO_COMPUTADO` no es un cero, y un `PASS` de un documento no es un
artefacto reproducible.

---

## 2. Triple estado: `requested` / `applied` / `output`

Se modelan por separado y **ninguna ruta del documento los colapsa**. Guardas implementadas
(`triple_state.collapse_guards` en el contrato):

1. Falta cualquiera de las tres claves → `E_STATE_COLLAPSED`.
2. El recibo trae un estado plano en la raíz (`mode`, `desired_mode`, `applied_processing`, `execution`,
   `canary_fidelity`) → `E_STATE_COLLAPSED`.
3. Existe `output` y no existe `applied` → `E_STATE_COLLAPSED`: un artefacto sin declaración de motor no
   dice quién lo produjo.
4. `applied.status:'NOT_APPLIED'` con `output.filters_applied > 0` → `E_APPLIED_WITHOUT_PROOF`.
5. `output.fps` (lo que el flujo es) y `applied.measured_encode_fps` (a qué velocidad se codificó) son
   campos distintos y no intercambiables.
6. `requested.desired` **nunca** alimenta el gate de capacidad: el gate solo lee
   `applied.measured_encode_fps`.

`applied.status` solo admite dos valores: `APPLIED_MEASURED` (con evidencia de fotograma) o
`NOT_APPLIED` (con su razón). No existe un tercer estado "en curso" que herede privilegios.

---

## 3. Tabla de rechazos (23 códigos, todos ejercitados por un fixture)

Los fixtures se citan por **ID**, no por número de orden: un número se desplaza en cuanto se añade un caso
delante y el documento quedaría mintiendo sin que nadie lo notara.

| Código | Sev. | Regla | Fixture (id) |
|---|---|---|---|
| `E_RECEIPT_SCHEMA` | high | `receipt.schema` debe ser `ape.canary_jit.receipt.v1` | `receipt_schema_invalid` |
| `E_STATE_COLLAPSED` | blocker | falta requested/applied/output, o claves planas (`mode`, `applied_processing`, …) en la raíz | `state_collapsed_missing_requested`, `state_collapsed_flat_keys` |
| `E_REQUIRED_FIELD_MISSING` | blocker | falta un campo obligatorio declarado en `receipt_schema.*`: el walker recorre esas listas (fuente única) y rechaza nombrando el path JSON exacto y la guarda que protege | `deployability_absent`, `section_missing_*`, `evasion_*` (9) |
| `E_POLICY_PIN_MISMATCH` | blocker | `requested.policy_sha256` ausente, todo ceros o distinto de `authority_block.policy_sha256`: el recibo no queda atado a la receta | `policy_pin_absent`, `policy_pin_zeroed`, `policy_pin_mismatch` |
| `E_ENGINE_SHA_UNVERIFIED` | blocker | `engine_sha256` (o `applied.engine_sha256`) ausente, mal formado o distinto del sha256 desplegable del manifiesto | `engine_sha_missing`, `engine_sha_not_deployable`, `applied_engine_sha_mismatch`, `applied_engine_sha_absent` |
| `E_NOT_DEPLOYED` | blocker | declara `DEPLOYED` un sha sin fila en el manifiesto, o `jit_loop` sobre una fila con 0 hits | `not_in_manifest_deployed` |
| `E_RECEIPT_INSUFFICIENT_FOR_ENCODER` | blocker | ruta `chain_4k_test` (solo `-vf`) pretendiendo acreditar encoder | `vf_only_chain4k_test` |
| `E_ENCODER_BLOCK_INCOMPLETE` | high | falta rate control, GOP o params libres | `encoder_incomplete` |
| `E_ENCODER_FINGERPRINT_MISMATCH` | high | huella del encoder distinta de la pineada | `encoder_fingerprint_mismatch` |
| `E_FIDELITY_LABEL_NOT_MEASURED` | high | etiqueta de paridad sin computar | `fidelity_label_literal` |
| `E_FILTERGRAPH_DIVERGED` | high | afirma paridad idéntica y la comparación la desmiente | `filtergraph_diverged` |
| `E_APPLIED_WITHOUT_PROOF` | blocker | `APPLIED_MEASURED` sin `frames>0`, sin artefacto legible o con aritmética incoherente | `applied_without_frame_evidence` |
| `E_CAPACITY_UNKNOWN` | high | sin fps de codificación medido el gate es desconocido | `capacity_unknown` |
| `E_CAPACITY_INSUFFICIENT` | high | transcode declarado aplicado por debajo del fps de fuente | `capacity_insufficient_claimed_applied` |
| `E_FPS_CADENCE_CHANGED` | blocker | fps de salida ≠ fps de fuente | `fps_mismatch` |
| `E_COPY_WITH_FILTERS` | blocker | `-c:v copy` con filtros declarados | `copy_with_filters` |
| `E_HDR_SOURCE_TO_SDR_CHAIN` | blocker | fuente PQ/HLG mapeada a cadena SDR de 8 bits | `pq_to_sdr`, `hlg_to_sdr` |
| `E_DV_RPU_UNPROVEN` | high | Dolby Vision sin prueba de RPU | `dv_without_rpu` |
| `E_ASPECT_RATIO_DEFORMED` | high | escala sin preservar DAR, o SAR ≠ 1:1 | `aspect_ratio_deformed` |
| `E_LEVEL_RESOLUTION_IMPOSSIBLE` | blocker | nivel que no carga resolución+fps (Ley Cardinal 1) | `level_8k120_L153` |
| `E_AUDIO_LOST_AS_PARITY` | blocker | audio eliminado declarado como paridad | `audio_dropped_as_parity` |
| `E_DEGRADATION_UNAUTHORIZED` | blocker | degradación sin los cinco campos | `degradation_unauthorized` |
| `E_FAKE_NATIVE_CLAIM` | high | declara NATIVA una salida con más píxeles que la fuente | `fake_native_claim` |

La cobertura es **1:1**: el gate comprueba que no hay código declarado sin fixture ni fixture con código
no declarado — `declarados=23 ejercitados=23` en la corrida vigente. Un código que nadie ejercita es una
promesa, no un gate.

### 3.1 Fuente única de los campos obligatorios

El defecto que esta regla cierra es de **clase**, no de caso: el contrato declaraba campos obligatorios que
el validador no exigía, así que **omitir un campo desactivaba la guarda en silencio**.

- La lista de obligatorios vive **en el JSON**: `receipt_schema.required_*` (9 niveles, **50 paths**:
  `required_top_level`, `requested`, `source`, `source.audio`, `applied`, `applied_when_measured`,
  `evidence`, `output`, `deployability`), más `required_field_levels` y `required_field_level_map`, que
  dicen al validador qué nivel se ancla a qué prefijo de path.
- `walkRequiredFields()` **recorre esas listas**, no una copia: no existe en el código una segunda lista de
  obligatorios que pueda divergir. Rechaza la primera ausencia con `E_REQUIRED_FIELD_MISSING` nombrando el
  path JSON exacto y la guarda que ese campo protege (`guard_map`).
- `gate_precedence` es la **exención probada**, no un agujero: un path listado ahí lo valida un gate
  específico con código propio más preciso (`E_POLICY_PIN_MISMATCH` distingue ausente / ceros / distinto;
  `E_ENGINE_SHA_UNVERIFIED` hace lo mismo con la identidad del motor). El walker lo salta a propósito y
  **gana el código específico**.
- `checkRequiredFieldSource()` mira **AMBAS direcciones**: (1) ninguna exención sin prueba — para los **15**
  paths de `gate_precedence` se borra el campo del recibo base y se exige `REJECT` con el código del dueño
  declarado, y una segunda sonda retira la exención para comprobar que el walker o la guarda semántica
  toman el relevo; (2) ningún obligatorio sin gate que lo exija — **35 paths del walker + 15 exenciones
  probadas = 50 paths obligatorios** cubiertos. Si una exención no supera la prueba, el gate imprime
  `HUECOS: <path>(<estado>)` y **falla**: es un hueco, no una exención.

### 3.2 Prueba load-bearing de cada campo (y su límite honesto)

La sección `-- campos obligatorios load-bearing --` borra cada campo del `guard_map` del recibo **y** de la
lista del contrato, y compara: **10 campos, 10 PASS** (ver corrida abajo).

**Declaración honesta que este documento no puede omitir:** de esos 10, **9 son LOAD_BEARING** (sin el
campo el gate acepta) y **1 es `REDUNDANTE_COVERED_BY:E_LEVEL_RESOLUTION_IMPOSSIBLE`** — `output.level`.
Al borrarlo del recibo y del contrato, la guarda de nivel‑resolución sigue rechazando **en HEVC** porque la
Ley Cardinal 1 deriva el nivel del `video_codec` y no lo encuentra, así que ese campo **no** es la única
barrera en HEVC. En codecs **sin tabla de nivel** (AVC/AV1) sí sería la única barrera, y por eso se declara
obligatorio igualmente. Se escribe como redundante en vez de venderlo como barrera única.

---

## 4. Gate de capacidad — cada cifra con su artefacto

**Regla:** transcode solo si el fps de codificación **medido** ≥ fps de la fuente. Si no alcanza:
`REMUX_PASSTHROUGH` + `applied.status:'NOT_APPLIED'` + `reason:'CAPACITY_INSUFFICIENT'`. Si no hay
medida: gate `desconocido` → `E_CAPACITY_UNKNOWN` (falla cerrado).

| Id | Cifra | Run / cadena | Artefacto |
|---|---|---|---|
| **M1** | **0,1828 fps** (30 frames / 164,1 s), CPU media **39,09 %** con techo del 40 %, pared 170 s | Canary 4K, libx265 ultrafast/zerolatency, `CPUQuota=40%` | `_vps_stage/canary/FASE01_REPORT.md:59` (y `:58` para `cpu_pct_avg`) — aritmética verificada: 30 / 164,1 = 0,182815 |
| **M2** | **57 s de CPU / 146 s de pared** por 6 s de clip; **fps NO_COMPUTADO** | Otro run del canary (habilitado a mano el 2026-11-09) | `docs/manifestos/INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:147` — el artefacto **no declara fotogramas**: suponer 30 daría 0,2055 fps y eso sería hipótesis, no medición |
| **M3** | **3,37 fps** contra 25 fps de fuente | **Bucle 4K del motor JIT** en producción — no es el Canary | `docs/manifestos/INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:66-67` |
| **M4** | **0,084 fps** (4K con `nlmeans` original) y **29,6 fps** (P1 4K corregida) | **Otra cadena, otro host** (LAB sin GPU) | skill `ape-image-pipeline-truth` §9 — `usable_as_threshold:false`: no se mezcla con M1/M2/M3 |

**Consecuencia honesta para el contrato:** con M1 como única medición del Canary **con fotogramas**, el
resultado por defecto del gate para una fuente de directo (25/30/50/60 fps) es **NOT_APPLIED +
passthrough**. Declarar transcode 4K en vivo con la receta del Canary es, hoy, **NO_SOPORTADO** — y el
contrato no lo acepta. El fixture 2 del validador ejecuta exactamente ese caso con la cifra real (0,1828
fps contra 25 fps) y **acepta** el recibo porque declara `NOT_APPLIED`; el fixture 21 usa la misma cifra
declarando `APPLIED_MEASURED` y lo **rechaza** con `E_CAPACITY_INSUFFICIENT`.

El fps de codificación del Canary **a cadencia de directo no se ha medido nunca**: la única medición con
fotogramas es a 5 fps muestreados. Está en `not_computed` con esa razón.

---

## 5. Ley Cardinal 1 — nivel ↔ resolución

`level_idc = level × 30`. El gate calcula `width*height ≤ MaxLumaPs` y `width*height*fps ≤ MaxLumaSR`
con la tabla de ITU-T H.265 Annex A (la misma de
[`truth_guards.md:24-43`](ape-vps-hevc-crystal-integrator/references/truth_guards.md)). `L153` = 5.1 =
techo 4K@60; sobre 8K@120 el resultado es `E_LEVEL_RESOLUTION_IMPOSSIBLE` con la cuenta a la vista
(3.981.312.000 > 534.773.760), que es el vector del freeze 2026-06-08.

Añadido: el nivel se exige **medido del bitstream** en `output.level`, no heredado del `CODECS=`. El motor
declara `hvc1.2.4.L153.B0` constante (`IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js:445`) mientras el
bitstream medido daba `level 120`
([`JIT_TRUTH_20261111.md`](../audits/JIT_TRUTH_20261111.md), R-11). Declarar no es codificar.

---

## 6. HDR (PQ / HLG / DV), cadencia y audio

**HDR.** Cubiertos `smpte2084` (PQ), `arib-std-b67` (HLG) y `dovi`/`dvhe`/`dvh1`. Una fuente HDR mapeada a
`bt709`, a `format=yuv420p` o a menos de 10 bits se rechaza con `E_HDR_SOURCE_TO_SDR_CHAIN`; DV exige
`output.dv_rpu_preserved === true` con artefacto o `E_DV_RPU_UNPROVEN`. Base legal:
[`docs/policies/ANTI_DEGRADATION_LAW.md`](../policies/ANTI_DEGRADATION_LAW.md) (Artículo 1) y
[`contracts/anti_degradation_contract.json`](../../contracts/anti_degradation_contract.json) línea 10
(`hdr_to_sdr_for_fix`), sha256 `bb359284b42a420d35da8f4dc4278e4214fe7a6cfd9c931a1f9140f272457fc5`.

La autoridad **ya admite** que no cubre HDR: `quality-policy.json:18` declara
`max_source_transfer: "SDR only for unvalidated adaptation"`. El contrato convierte esa nota en rechazo
duro.

**Cadencia.** `live_fps == source.fps` (tolerancia 0,01). El 5 fps es experimento **no reutilizable**:
`quality-policy.json:17` (`reference_experiment_only.fps=5`), `canary-render.js:19` (`-r 5 -an`) y el
script real `vps/bin/ape-visual-emulate.sh:26` (`FPS="${CANARY_FPS:-5}"`) aplicado en `:109` (`-r "$FPS"`).
Se rechaza igual si el cambio viene del consumidor: `vps/ape-jit/server.js:372` y `:379` fuerzan 30 fps
(medido: `EXTINF 8.333333` = 250 frames / 30 fps sobre fuente de 25 fps).

**Audio.** La receta de referencia va con `-an` (`canary-render.js:19`, `ape-visual-emulate.sh:109`). El
contrato exige preservación (passthrough AAC cuando sea compatible) y rechaza el silencio como paridad:
`E_AUDIO_LOST_AS_PARITY`. Reducir canales (sin eliminarlos) es degradación y exige autorización — caso
medido: `-ac 2` incondicional en las tres ramas de `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js:389-393`
sobre fuente 5.1.

---

## 7. Aspect ratio: aquí el consumidor es más correcto que la autoridad

**Se dice sin rodeos: la forma del consumidor es la correcta y la de la autoridad deforma la imagen.**

Medido (`docs/audits/CANARY_TRUTH_20261111.md:157-166`, A7 SOPORTADO en `:506`): `scale=3840:2160` sin
`force_original_aspect_ratio` sobre fuente **1920×800** produce `3840x2160 [SAR 27:20 DAR 12:5]` —
`h_scale = 3840/1920 = 2.0`, `v_scale = 2160/800 = 2.7`, anisotropía **1,35× = 27/20**. ffmpeg lo
«compensa» escribiendo `SAR=27:20`, así que la imagen solo se ve correcta en players que honran SAR.

La forma del JIT (`force_original_aspect_ratio=decrease` + `pad`, `tools/lab/ape-jit/server.js:8668-8670`)
da `SAR 1:1 DAR 16:9` (A8 SOPORTADO, `:507`). Por eso:

- `geometry.policy_selected = "DAR_PRESERVING"` y se exige **SAR 1:1** (píxeles cuadrados, sin depender de
  que el player lea SAR). `output.sar` es campo **obligatorio** del recibo
  (`docs/audits/CANARY_TRUTH_20261111.md:559`: un recibo que diga `3840x2160` sin SAR está incompleto).
- La cadena canónica de 185 caracteres **no se reescribe**: es byte-idéntica en los 5 sitios donde
  aparece (sha256 `ed1fe6fe00be413f…`, H-2). Su etapa `scale=3840:2160:flags=lanczos` solo se acepta con
  fuente **DAR 16:9 confirmada**; para cualquier otra fuente el recibo debe traer la forma que preserva.
- Fuente no 16:9 + escala sin preservación, o SAR ≠ 1:1 → `E_ASPECT_RATIO_DEFORMED`.

---

## 8. Encoder completo y su huella

`quality-policy.json:16` solo puede describir 4 campos. Lo que corre
(`vps/bin/ape-visual-emulate.sh:112-114`) es otra cosa:

```text
-x265-params pools=1:frame-threads=1:keyint=48:min-keyint=48:scenecut=0:bframes=0:rc-lookahead=0
-b:v 25M -maxrate 32M -bufsize 64M
-g 48 -keyint_min 48 -sc_threshold 0
```

El contrato lo expresa entero (params libres + rate control + GOP + compatibilidad de perfil) y pinea una
**huella**:

```text
codec=libx265|preset=ultrafast|tune=zerolatency|x265-params=bframes=0:frame-threads=1:keyint=48:min-keyint=48:pools=1:rc-lookahead=0:scenecut=0|b:v=25M|maxrate=32M|bufsize=64M|g=48|keyint_min=48|sc_threshold=0
sha256 = fb0bc96cdcc4f166fdeda561dd399877c8be7b1f4aa3328caa58924abf032b66
```

El validador **recalcula** esa huella desde el recibo. Cambiar `maxrate` a `20M` da otra huella →
`E_ENCODER_FINGERPRINT_MISMATCH` (fixture 24). Dos ejecuciones con la misma cadena y distinto `-b:v` no
son la misma imagen, y el contrato no las trata como si lo fueran.

**Recibos que nunca acreditan encoder.** `tools/lab/ape-jit/server.js:8649-8679` (`chain_4k_test`)
construye **solo el `-vf`**: `-preset`, `-tune` y `-x265-params` no viajan. Ese recibo no puede acreditar
encoder jamás (`E_RECEIPT_INSUFFICIENT_FOR_ENCODER`, fixture 13). Su cadena tampoco comparte etapa
semántica con la canónica: sin `deblock`, sin `smartblur`, sin `noise`, sin `eq`; usa `hqdn3d`/`atadenoise`
— **signo opuesto**: Canary añade grano, JIT denoísa — y `yuv420p10le` en lugar de `yuv444p`
(`E_FILTERGRAPH_DIVERGED`, fixture 20).

---

## 9. H-1 — el bloqueante de desplegabilidad

**El artefacto que implementa el bucle Canary↔JIT no tiene fila en el manifiesto.**

| Artefacto | Bytes | sha256 | hits de `jit` | filas en `_vps_stage/deploy/manifest.tsv` | Estado |
|---|---|---|---|---|---|
| `vps/bin/ape-visual-emulate.sh` | **6.714** | `f1d2ecff6e6468eb58e04658703a34df8b0e2df1c7d61540abbb84ebf768fec1` | **7** | **0** | **NOT_DEPLOYED** |
| `_vps_stage/canary/ape-visual-emulate.sh` | 4.068 | `653b56e1ef964bc6a3d0cb32a48724ca2b04969faaa0612804e923c41f7243f8` | 0 | 1 (línea **39**) | DEPLOYED → `/usr/local/bin/ape-visual-emulate.sh` |

Doble prueba: `_vps_stage/deploy/manifest.tsv:39` (fila *«canary 4K (25M/32M/64M keyint 48)»* sobre la
copia de 4.068 B) y `docs/manifestos/INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:128` (backup del original de
**4.068 B**).

- El fichero es **`manifest.tsv` (SINGULAR)**: 6.501 B, sha256
  `5f5adcf10f66e742dcc68d06cbfc75f0e11c69cf7cc1de695f5372b946f018ed`, 60 filas no vacías.
  `manifests.tsv` (plural) **no existe**.
- **NO se ha modificado el manifiesto.** Añadir esa fila es decisión del operador. La integración
  Canary-JIT empieza exactamente ahí; sin ella el contrato solo puede declarar `NOT_DEPLOYED`.
- **Instalar no es ejecutar:** `manifest.tsv:49-57` documenta que `deploy.sh` instala y hace
  `nginx -t` + reload pero **no** `systemctl restart ape-jit` (0 referencias en `deploy.sh`, `verify.sh`
  y `deploy-vps.yml`). El sha256 coincidiría y el motor seguiría ejecutando el código viejo. Por eso
  «el proceso vivo ejecuta el código del sha instalado» está en `not_computed`.

---

## 10. El motor se fija por sha256, nunca por ruta (R-22)

Hay tres artefactos llamados «el `server.js`»:

| Id | Ruta | Bytes | sha256 | Fila en manifiesto |
|---|---|---|---|---|
| **A** | `tools/lab/ape-jit/server.js` | 447.943 | `28352c508285b1eedfc889e5df40855e6e2c71207d7c806288ac8457de36ff67` | **sí, línea 59** → `/opt/ape-jit/server.js` |
| **B** | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` | 45.535 | `8405f78412dc2a984f690b7270e891d050740d88358f10ca5818f905151fbae0` | **no** |
| **C** | desplegado el 2026-11-09 | 415.037 | **NO_COMPUTADO** (el documento no da hash) | NO_COMPUTADO |

`engine_sha256` es obligatorio en el recibo y debe ser el **sha desplegable** (A). Un recibo sin sha, o
medido sobre B, se rechaza con `E_ENGINE_SHA_UNVERIFIED` (fixtures 15 y 16). *«Cuál corre hoy»* es
`NO_COMPUTADO`: el README del paquete dice B, el incidente dice C y el manifiesto instala A.

**Atribución de medidas (evita una mentira fácil).** Los defectos de codec/HDR/audio verificados por t2
(`-level:v 4.2` sobre `avc1.640028` declarado en `vps/ape-jit/server.js:365`, `max-cll=100,100` en `:384`,
`-ac 2` en `:389-393`) son del artefacto **B**, que **no despliega**. **A no los tiene**: 0 ocurrencias de
`-level:v`, `max-cll` y `-ac 2`, y contiene explícito «NO `-ac 2` universal: eso degrada 5.1 a estéreo»
(`tools/lab/ape-jit/server.js:557`, `:990`, `:3234`). El contrato los rechaza como **categoría**
(declarado ≠ codificado, HDR incoherente, audio degradado sin autorización) y exige que el recibo diga
**sobre qué sha se midió**. Medir un artefacto y declarar otro es justo el fallo que este contrato impide.

---

## 11. Degradación: solo con los cinco campos

`resolution`, `codec`, `dynamic_range`, `fps`, `video_bitrate`, `audio_channels`, `bit_depth` y
`chroma_subsampling` no se pueden tocar sin autorización escrita con **`channel_id`, `device_id`,
`degradation`, `reason`, `date`**. Sin los cinco → `E_DEGRADATION_UNAUTHORIZED`. Base:
[`docs/policies/ANTI_DEGRADATION_LAW.md`](../policies/ANTI_DEGRADATION_LAW.md) y
[`contracts/anti_degradation_contract.json`](../../contracts/anti_degradation_contract.json)
(`exception_requires`, líneas 23-29). Permitido sin autorización: remux/passthrough sin recomprimir,
upscale **declarado** como `UPSCALE_FROM_SOURCE` (Crystal 4K), y no aplicar nada declarándolo.

---

## 12. `NO_COMPUTADO` — lo que este contrato NO puede afirmar

| Item | Razón |
|---|---|
| sha256 del motor C (desplegado 2026-11-09) | `INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:132` da 415.037 B pero no hash |
| Cuál de los tres motores corre hoy | README dice B, el incidente dice C, el manifiesto instala A; sin acceso al VPS |
| fps del run del incidente (57 s / 146 s) | `INCIDENTE:147` no declara fotogramas ni duración encodada |
| Que el proceso vivo ejecute el sha instalado | `manifest.tsv:49-57`: no hay `systemctl restart`; falta recibo de `/health` |
| fps del Canary a 25/30/50/60 fps | la única medición con fotogramas es M1 a 5 fps muestreados |
| RPU Dolby Vision en cualquier artefacto | ninguna auditoría de entrada midió `dvcC`/RPU |
| HDR real en la fuente del canary | `quality-policy.json:18` limita la compatibilidad a SDR no validado |

Además, `policy_sha256` es **reproducible solo con el paquete de referencia**: `.gitignore:162` ignora
`scratch/`, así que en un clon limpio los bytes de la política no existen y el pin se reporta
**`NO_COMPUTADO`** (nunca `PASS`). Con `--require-policy` pasa a ser obligatorio y el gate falla.

---

## 13. Cómo se ejecuta y qué prueba

```bash
node -c tools/quality/test_canary_jit_contract.js
node tools/quality/test_canary_jit_contract.js          # exit 0 solo si TODO se comporta
node tools/quality/test_canary_jit_contract.js --require-policy   # pin de politica obligatorio
```

Salida observada el 2026-11-11 (exit **0**), copiada de la corrida, no heredada:

```text
-- cobertura de codigos de rechazo --
  PASS  declarados=23 ejercitados=23

-- resumen --
  fixtures: 55/55 PASS  (FAIL 0)
  coherencia del contrato: PASS  (27/27 checks)
  campos load-bearing: 10/10 PASS  (FAIL 0)  redundantes declarados: output.level=REDUNDANTE_COVERED_BY:E_LEVEL_RESOLUTION_IMPOSSIBLE
  aceptados: 5 | envenenados rechazados: 50
  total: 92/92 comprobaciones | fallos: 0
  RESULT=PASS
```

La aritmética del total es explícita y comprobable: **55 fixtures + 27 checks de coherencia + 10 campos
load-bearing = 92 comprobaciones**. El resumen separa las tres secciones a propósito: antes se imprimía un
recuento que ocultaba que fallaban dos comprobaciones distintas.

El validador ejecuta **55 fixtures** (superset de los 11 exigidos en el encargo original): **5 honestos**
que deben ser **aceptados** (`APPLIED_MEASURED` con evidencia real de fotogramas, `NOT_APPLIED` por
capacidad con la cifra real 0,1828 fps, y tres controles positivos que prueban que la decisión cambia al
retirar la condición que cada guarda mide) y **50 envenenados** que deben ser **rechazados** con su código.

**Prueba de que el gate puede fallar** (control negativo A, mutación exacta al lado): con una copia del
contrato donde `deployability.loop_artifact.manifest_rows = 1` y
`deployability.loop_artifact.state = "DEPLOYED"`, el fixture `not_in_manifest_deployed` pasa a ser aceptado
y el script devuelve `total: 90/92 comprobaciones | fallos: 2` + `RESULT=FAIL`, **exit 1**. El gate no es un
sello de goma: si un caso envenenado pasa, el proceso falla — y ahora el recuento es el real (dos
comprobaciones distintas fallan: la coherencia del contrato y el fixture).

Reproducible (escribe la copia en `os.tmpdir()`, nunca en el repo):

```bash
NEG=$(node -e "const fs=require('fs'),os=require('os'),p=require('path');const c=JSON.parse(fs.readFileSync('contracts/canary_jit_contract_v1.json','utf8'));c.deployability.loop_artifact.manifest_rows=1;c.deployability.loop_artifact.state='DEPLOYED';const f=p.join(os.tmpdir(),'contract_neg.json');fs.writeFileSync(f,JSON.stringify(c));process.stdout.write(f);")
node tools/quality/test_canary_jit_contract.js --contract "$NEG"
```

Salida literal de ese control negativo (exit **1**):

```text
  FAIL  artefacto del bucle NOT_DEPLOYED  [jit_hits=7 rows=1]
  FAIL  [14] artefacto sin fila en manifest.tsv declarado desplegado  -> ACCEPT/OK_APPLIED_MEASURED
  fixtures: 54/55 PASS  (FAIL 1)
  coherencia del contrato: FAIL  (26/27 checks)
  total: 90/92 comprobaciones | fallos: 2
  RESULT=FAIL
```

### 13.1 Criterio de aceptación reproducible del recibo compuesto

El recibo del review —identidad de origen y de salida borradas, `policy_sha256` en ceros y sin
`deployability`— **no tiene ruta a `ACCEPT`**. Dos fixtures lo fijan (`review_composed_receipt_blocker` y
`review_composed_with_pin_still_rejected`):

| Recibo compuesto | Resultado |
|---|---|
| tal como lo describió el review (pin en ceros) | **REJECT / `E_POLICY_PIN_MISMATCH`** |
| el mismo con el pin correcto | **REJECT / `E_REQUIRED_FIELD_MISSING`** (la completitud también lo rechaza: defensa en profundidad) |
| recibo sin `applied.engine_sha256` | **REJECT / `E_ENGINE_SHA_UNVERIFIED`** (el dueño declarado en `gate_precedence` rechaza la ausencia) |

Tercer control, el que demuestra que la lista del contrato es load‑bearing: **control negativo B**, con una
copia del contrato a la que se quita `video_codec` **solo** de `receipt_schema.output` (el `guard_map` se
deja intacto a propósito). Comando exacto (bash; la copia se escribe en `os.tmpdir()`, nunca en el repo):

```bash
NEGB=$(node -e "const fs=require('fs'),os=require('os'),p=require('path');const c=JSON.parse(fs.readFileSync('contracts/canary_jit_contract_v1.json','utf8'));const drop=process.argv[1];c.receipt_schema.output=c.receipt_schema.output.filter(function(v){return v!==drop;});const f=p.join(os.tmpdir(),'contract_negB.json');fs.writeFileSync(f,JSON.stringify(c));process.stdout.write(f);" video_codec)
node tools/quality/test_canary_jit_contract.js --contract "$NEGB"
```

Salida observada:

```text
  FAIL  guard_map apunta a paths obligatorios  [inertes: output.video_codec]
  FAIL  [40] codec HEVC->AVC con output.video_codec omitido  -> ACCEPT/OK_APPLIED_MEASURED
  FAIL  output.video_codec               LOAD_BEARING  [con guarda: ACCEPT/OK_APPLIED_MEASURED | sin guarda: ACCEPT/OK_APPLIED_MEASURED]
  fixtures: 54/55 PASS  (FAIL 1)
  coherencia del contrato: FAIL  (26/27 checks)
  campos load-bearing: 9/10 PASS  (FAIL 1)  redundantes declarados: output.level=REDUNDANTE_COVERED_BY:E_LEVEL_RESOLUTION_IMPOSSIBLE
  total: 89/92 comprobaciones | fallos: 3
  RESULT=FAIL
```

Tres detectores independientes señalan el mismo agujero (mapeo inerte, fixture de evasión y campo
load‑bearing). **La mutación va escrita al lado del número** porque un control sin su mutación no es
reproducible; y si se relaja además el `guard_map`, la cifra cambia (salen 9 filas load‑bearing y el total
baja a 91) — esa variante se declara aquí para que nadie compare dos números de mutaciones distintas.

Diseño del validador: sin dependencias, sin red, y escribe **únicamente** dentro de `os.tmpdir()`
(artefactos de evidencia de los fixtures, borrados al terminar). Exporta `validateReceipt(recibo,
contrato)` para que cualquier otro gate lo reutilice.

---

## 14. PROPUESTA DE SKILL (no instalada — decide el operador)

> **Estado: PROPUESTA.** No se ha escrito nada en `.agents/skills/` ni en ningún directorio de skills del
> Harness. Este documento no instala; propone.

**Nombre propuesto:** `ape-canary-jit-parity-contract`

**Disparadores:** tocar la cadena de 8 filtros del Canary, `quality-policy.json`, `canary_quality.js`,
`canary-render.js`, `ape-visual-emulate.sh`, `_vps_stage/deploy/manifest.tsv`, cualquier `server.js` de
`ape-jit`, o emitir/auditar un recibo que diga «aplicado».

**Contenido mínimo (8 ficheros + 3 subdirectorios, patrón de la casa):**

| Fichero | Qué lleva |
|---|---|
| `SKILL.md` | doctrina del triple estado, los 23 códigos, la fuente única de obligatorios (`required_*` en el JSON + `walkRequiredFields` + `checkRequiredFieldSource`), la exención probada de `gate_precedence`, el gate de capacidad y la Ley Cardinal 1 |
| `references.md` | `docs/audits/CANARY_TRUTH_20261111.md`, `docs/audits/JIT_TRUTH_20261111.md`, este manifiesto, `truth_guards.md` |
| `commands.md` | `node tools/quality/test_canary_jit_contract.js` (permitido); prohibido `git push`, `systemctl restart ape-jit`, editar `manifest.tsv` |
| `checklist.md` | pre: ¿sha del motor? ¿fila en el manifiesto? / during: ¿fps medido ≥ fps fuente? / post: ¿paridad computada? / rollback: no aplica (read-only) |
| `tests.md` | los 55 fixtures como casos de regresión + los 3 controles negativos |
| `examples/` | un recibo honesto `APPLIED_MEASURED` y uno honesto `NOT_APPLIED` (los del fixture 1 y 2) |
| `scripts/` | enlace al validador, sin copiarlo (una sola fuente) |
| `fixtures/` | los JSON de recibo envenenados, anonimizados |
| `install.lock.json`, `audit-report.md` | pin de versión + log de uso |

**Métrica de éxito de la skill** (si se instala): nº de recibos rechazados por código en una ventana, y
**cero** recibos que declaren `APPLIED_MEASURED` sin `evidence.frames > 0` y artefacto legible. Línea base
hoy: 0 recibos existen (el paquete de referencia nunca declaró aplicado), así que la métrica arranca en
«sin productor» — que **no** es «sin hallazgos».

**Lo que la skill NO haría:** no despliega, no edita el manifiesto, no reinicia `ape-jit`, no reescribe la
cadena canónica y no declara aplicado nada. Es un gate de lectura.

---

## 15. Lo que queda abierto (para el operador, no para este contrato)

1. **Añadir la fila** de `vps/bin/ape-visual-emulate.sh` (sha256 `f1d2ecff…`) a
   `_vps_stage/deploy/manifest.tsv` — sin eso, la integración Canary↔JIT no se despliega nunca.
2. **Decidir** si el pipeline reinicia `ape-jit` tras instalar `server.js` (`manifest.tsv:49-57`). Un
   `systemctl restart` mal colocado puede tumbar producción: es decisión del operador, no del contrato.
3. **Medir** el fps de codificación del Canary a la cadencia real de la fuente (hoy solo hay 0,1828 fps a
   5 fps muestreados). Mientras no exista esa medida, el gate seguirá diciendo `NOT_APPLIED`.
4. **Promover** `policy_sha256` a artefacto del repo (hoy el paquete vive en `scratch/`, ignorado por git),
   para que el pin sea recomputable en un clon limpio.
5. **Instalar o descartar** la skill propuesta de §14.
