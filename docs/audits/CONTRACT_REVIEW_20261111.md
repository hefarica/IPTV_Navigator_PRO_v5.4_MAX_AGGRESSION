# REVISION INDEPENDIENTE — Contrato Canary→JIT v1 y su gate fail-closed

**Fecha:** 2026-11-11 (America/Bogota)
**Revisor:** canary-auditor (team `canary-jit-20261111`, task `t7`) — **no soy el autor** de lo revisado
**Tarea revisada:** `t5` (contrato + validador + manifiesto)
**WORKDIR:** `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION`
**node:** v24.12.0

**VEREDICTO: `needs_revision`**

El gate es real, puede fallar, y la mitad estructural del contrato está bien construida: `engine_sha256` es obligatorio sin estado intermedio, el triple `requested/applied/output` no se colapsa, y 18 de los 21 códigos de rechazo están cerrados de verdad. **Pero el contrato declara campos obligatorios que su propio validador nunca exige, y esa brecha convierte cuatro categorías de degradación en opcionales: basta con no declarar el dato para que el gate no lo vea.** Está reproducido con salida literal en §5.

Nada de lo que sigue se apoya en el informe del autor. Cada número viene de un comando que ejecuté yo.

---

## 1. Identidad de lo revisado

`Get-FileHash -Algorithm SHA256` sobre los tres artefactos:

| Artefacto | Bytes | SHA-256 medido | Declarado por el autor | Coincide |
|---|---|---|---|---|
| `contracts/canary_jit_contract_v1.json` | 31.156 | `cee0450ecdd850087a1f88c5161a73ac7c06a7796e476d11a2555bed476f23cc` | `cee0450e…f23cc` | **SÍ** |
| `tools/quality/test_canary_jit_contract.js` | 50.542 | `64db6bdc5c9946da557cee90bd1a974368fe469ee24ec174603d9492def04126` | `64db6bdc…2f04126` | **SÍ** |
| `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md` | 24.513 | `998f1ae468f45cf44b6ca4ee5d10af1cb809951d9c993c733a5816311a56e8d5` | `998f1ae4…56e8d5` | **SÍ** |

`git status --porcelain` muestra 6 rutas `??` (los 3 revisados + `docs/audits/CANARY_TRUTH_20261111.md`, `docs/audits/JIT_TRUTH_20261111.md`, `docs/audits/JIT_HTTP_PROBES_20261111.md` de t1/t2/otro). **Cero entradas `.agents/`. Yo no modifiqué ninguno de los tres artefactos**: sólo añadí `docs/audits/CONTRACT_REVIEW_20261111.md`.

---

## 2. Método

Un PRUEBA citada del informe del autor no cuenta como evidencia. Todo lo de abajo lo ejecuté en esta sesión, en este workspace.

Para recorrer el camino «recibo → aceptación» usé la API que el propio validador exporta en `tools/quality/test_canary_jit_contract.js:956-965`:

```js
module.exports = { validateReceipt, computeParity, splitFiltergraph, encoderFingerprint,
                   parseHevcLevel, levelLoads, checkContract, CONTRACT_PATH };
```

Escribí en `os.tmpdir()` una copia del fuente con un export extra (`buildFixtures`) para obtener **recibos base que el propio gate ACEPTA**, y desde ahí muté uno a uno. **Nada se escribió en el repo**; los ficheros temporales se borraron.

---

## 3. Los dos controles, ejecutados por mí

### 3.1 Control positivo — `node tools/quality/test_canary_jit_contract.js`

Salida literal (extracto de cabecera y cola):

```
contrato: contracts/canary_jit_contract_v1.json sha256=cee0450ecdd85008…
authority=canary revision=1 estado=CANDIDATE_NOT_DEPLOYED
-- coherencia del contrato --
  PASS  ... (18 comprobaciones)
-- fixtures del validador --
  PASS  [01] recibo honesto APPLIED_MEASURED (upscale declarado, motor pineado)
  ...
  PASS  [25] upscale 1080p->4K declarado NATIVO
-- cobertura de codigos de rechazo --
  PASS  declarados=21 ejercitados=21
-- resumen --
  fixtures: 25 | PASS 25 | FAIL 0
  aceptados: 2 | envenenados rechazados: 23
  coherencia del contrato + pin: OK
  RESULT=PASS
EXITCODE=0
```

`node -c` sobre el mismo fichero: `EXITCODE=0`.

### 3.2 Control negativo — receta de `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md:324-325`, ejecutada tal cual

```
NEG=C:\Users\HFRC\AppData\Local\Temp\contract_neg_t7.json
node tools/quality/test_canary_jit_contract.js --contract "$NEG"
```

Salida literal:

```
  FAIL  artefacto del bucle NOT_DEPLOYED  [jit_hits=7 rows=1]
  FAIL  [14] artefacto sin fila en manifest.tsv declarado desplegado
          esperado: REJECT / E_NOT_DEPLOYED   obtenido: ACCEPT / OK_APPLIED_MEASURED
  fixtures: 25 | PASS 24 | FAIL 1
  RESULT=FAIL
EXITCODE=1
```

**El efecto observable no es el exit code: es que el fixture `[14]` pasa de `REJECT` a `ACCEPT` cuando el contrato miente sobre `deployability.loop_artifact.manifest_rows`.** El exit code sólo lo acompaña. **El gate puede fallar y falla: no es un sello de goma.**

---

## 4. Cobertura de los 21 códigos — calculada por mí, no leída del tool

La línea `declarados=21 ejercitados=21` que imprime el validador **no es evidencia**: la calcula el mismo proceso que se está validando. La recalculé desde cero con dos artefactos independientes:

1. Los 21 códigos de `contracts/canary_jit_contract_v1.json` (`rejections`, arranca en `L366`), 21 entradas, 21 únicas.
2. Las 25 llamadas `push(id, label, receipt, expected, expectedCode)` de `tools/quality/test_canary_jit_contract.js:613-805`, parseadas estáticamente por mí (25 llamadas, 2 `ACCEPT` + 23 `REJECT`).

**Resultado del set diff: `declarados_sin_fixture = 0` y `ejercitados_no_declarados = 0`. Los 21 códigos tienen fixture. Ninguno queda sin ejercitar.**

| Código | Fixtures (id) | n |
|---|---|---|
| `E_RECEIPT_SCHEMA` | `receipt_schema_invalid` | 1 |
| `E_STATE_COLLAPSED` | `state_collapsed` | 1 |
| `E_ENGINE_SHA_UNVERIFIED` | `engine_sha_missing`, `engine_sha_not_deployable` | 2 |
| `E_NOT_DEPLOYED` | `not_in_manifest_deployed` | 1 |
| `E_RECEIPT_INSUFFICIENT_FOR_ENCODER` | `vf_only_chain4k_test` | 1 |
| `E_ENCODER_BLOCK_INCOMPLETE` | `encoder_incomplete` | 1 |
| `E_ENCODER_FINGERPRINT_MISMATCH` | `encoder_fingerprint_mismatch` | 1 |
| `E_FIDELITY_LABEL_NOT_MEASURED` | `fidelity_label_literal` | 1 |
| `E_FILTERGRAPH_DIVERGED` | `filtergraph_diverged` | 1 |
| `E_APPLIED_WITHOUT_PROOF` | `applied_without_frame_evidence` | 1 |
| `E_CAPACITY_UNKNOWN` | `capacity_unknown` | 1 |
| `E_CAPACITY_INSUFFICIENT` | `capacity_insufficient_claimed_applied` | 1 |
| `E_FPS_CADENCE_CHANGED` | `fps_mismatch` | 1 |
| `E_COPY_WITH_FILTERS` | `copy_with_filters` | 1 |
| `E_HDR_SOURCE_TO_SDR_CHAIN` | `pq_to_sdr`, `hlg_to_sdr` | 2 |
| `E_DV_RPU_UNPROVEN` | `dv_without_rpu` | 1 |
| `E_ASPECT_RATIO_DEFORMED` | `aspect_ratio_deformed` | 1 |
| `E_LEVEL_RESOLUTION_IMPOSSIBLE` | `level_8k120_L153` | 1 |
| `E_AUDIO_LOST_AS_PARITY` | `audio_dropped_as_parity` | 1 |
| `E_DEGRADATION_UNAUTHORIZED` | `degradation_unauthorized` | 1 |
| `E_FAKE_NATIVE_CLAIM` | `fake_native_claim` | 1 |

Severidad declarada en el contrato: 11 `blocker` + 10 `high`.

### 4.1 Ramas con código pero SIN fixture — las nombro

El criterio «un código, un fixture» se cumple. Pero hay **dos ramas de guarda que comparten código y que ningún fixture dispara**. Lo probé: **ambas funcionan hoy**. El riesgo no es que estén mal: es que si alguien las borra, el set 21/21 **sigue verde**.

| Rama | Línea | Código | Fixture que la dispara | Mi sonda |
|---|---|---|---|---|
| Clave plana en la raíz (`applied_processing`, `canary_fidelity`, `mode`) | `L250-254` | `E_STATE_COLLAPSED` | **ninguno** — el fixture `state_collapsed` dispara antes la rama «falta `requested`» (`L245-249`) | `E1`/`E2` → `REJECT E_STATE_COLLAPSED` («el recibo trae el estado plano "applied_processing" / "canary_fidelity" en la raiz») |
| `applied.engine_sha256` ≠ `receipt.engine_sha256` | `L270-272` | `E_ENGINE_SHA_UNVERIFIED` | **ninguno** — los 2 fixtures cubren «ausente» y «no desplegable» | `P6f` → `REJECT E_ENGINE_SHA_UNVERIFIED` («applied.engine_sha256 no coincide con receipt.engine_sha256») |

Nota adicional: el fixture `state_collapsed` **mezcla dos condiciones** (le falta `requested` **y** trae `mode`/`applied_processing` planos en la raíz). Por eso la rama de clave plana queda sin cobertura efectiva aunque el código esté «cubierto».

---

## 5. Recorrido del camino «recibo → aceptación»: EL HUECO

### 5.1 Qué exige el contrato y qué exige de verdad el validador

`contracts/canary_jit_contract_v1.json` declara campos obligatorios en tres niveles (`L358-364`). El validador **sólo hace cumplir una parte**:

| Nivel declarado | Campos declarados obligatorios | ¿Los exige el validador? |
|---|---|---|
| `required_top_level` (`L358`) | `schema`, `requested`, `applied`, `output`, `engine_sha256`, `deployability` | **5 de 6** — `deployability` **NO** (`L274-290` sólo actúa si `dep.state === 'DEPLOYED'`) |
| `requested` (`L359`) | `mode`, `source`, `desired`, `policy_sha256`, `policy_revision` | **0 de 5** exigidos como presentes. `source.fps` sí falla cerrado por otra vía (`L380`); `policy_sha256` **nunca se compara** |
| `applied_when_measured` (`L361`) | `filtergraph`, `codec_mode`, `encoder`, `evidence`, `parity`, `measured_encode_fps` | **6 de 6** (bloques `L297-375`) — bien |
| `output` (`L363`) | `width`,`height`,`fps`,`transfer`,`pix_fmt`,`video_codec`,`level`,`sar`,`audio`,`filters_applied`,`declared`,`artifact` | **5 de 12** — `transfer`, `pix_fmt`, `video_codec`, `level`, `sar` **no** se exigen; su ausencia **desactiva** la comprobación correspondiente |
| `deployability` (`L364`) | `state`, `artifact`, `sha256`, `manifest_file` | **0-1 de 4** |

**La consecuencia es la misma en los cinco casos: omitir el campo no es un rechazo, es la desactivación silenciosa de la guarda.** La detección de degradación compara números; si el número no está, `null < null` es `false` y la comparación no salta.

### 5.2 Prueba: cada categoría de degradación, declarada contra omitida

Recibos base que el gate **ACEPTA** (`honest_applied`), mutados. `decision` es la salida literal de `validateReceipt`.

| Sonda | Qué hace el recibo | `decision` / `code` |
|---|---|---|
| `G1a` | salida `h264` sobre fuente `hevc` (misma resolución y fps) | **REJECT** `E_DEGRADATION_UNAUTHORIZED` `[codec]` |
| `G1b` | **lo mismo, sin `output.video_codec`** | **ACCEPT** `OK_APPLIED_MEASURED` |
| `G3a` | fuente `yuv444p10le` → salida 8-bit 4:2:0 | **REJECT** `E_DEGRADATION_UNAUTHORIZED` `[bit_depth, chroma_subsampling]` |
| `G3b` | **lo mismo, sin `requested.source.pix_fmt`** | **ACCEPT** `OK_APPLIED_MEASURED` |
| `G4a` | fuente 25 Mbps → salida 8 Mbps | **REJECT** `E_DEGRADATION_UNAUTHORIZED` `[video_bitrate]` |
| `G4b` | **lo mismo, sin `output.bitrate_bps`** | **ACCEPT** `OK_APPLIED_MEASURED` |
| `G4c` | **lo mismo, sin `requested.source.bitrate_bps`** | **ACCEPT** `OK_APPLIED_MEASURED` |
| `G5a` | fuente 6 canales → salida 2 canales | **REJECT** `E_DEGRADATION_UNAUTHORIZED` `[audio_channels]` |
| `G5b` | **lo mismo, sin `requested.source.audio`** | **ACCEPT** `OK_APPLIED_MEASURED` |
| `A1` | 4K→FHD real, sin autorización | **REJECT** `E_DEGRADATION_UNAUTHORIZED` `[resolution]` — **esta sí cierra** |
| `G2b` | HDR→SDR con `requested.source.transfer` omitido | **REJECT** `E_DEGRADATION_UNAUTHORIZED` `[dynamic_range]` — **esta sí cierra** |
| `P3b` | capacidad insuficiente con `requested.source.fps` omitido | **REJECT** `E_FPS_CADENCE_CHANGED` («sin fps de fuente no hay paridad de cadencia posible») — **cierra** |
| `P8b` | `output.fps` omitido | **REJECT** `E_FPS_CADENCE_CHANGED` — **cierra** |
| `P2` | geometría de fuente omitida | **REJECT** `E_ASPECT_RATIO_DEFORMED` («sin geometria de fuente no se puede probar preservacion de DAR») — **cierra** |

**4 categorías evadibles por omisión** (`codec`, `bit_depth`/`chroma_subsampling`, `video_bitrate`, `audio_channels`). **3 categorías cerradas de verdad** (`resolution`, `dynamic_range`, y `fps` por otra guarda). El autor ya resolvió el patrón «omitir ⇒ rechazar» para fps y geometría; **no lo aplicó a la identidad de códec/pix_fmt/bitrate/audio**.

### 5.3 El recibo compuesto que pasa

Un solo recibo obtiene `ACCEPT`:

```json
{"decision":"ACCEPT","code":"OK_APPLIED_MEASURED","degradation":[],
 "capacity":{"source_fps":25,"measured_encode_fps":25,"viable":true}}
```

…cuyas claves de `requested.source` quedan reducidas a `["width","height","fps","transfer"]` y las de `output` a `["width","height","fps","transfer","audio","filters_applied","declared","artifact"]`, con `requested.policy_sha256` = 64 ceros y **sin bloque `deployability`**.

Es decir: un recibo que **borró toda la identidad** que el gate necesitaría para pillar un HEVC→AVC, un 10-bit 4:4:4→8-bit 4:2:0, un recorte de bitrate o un 5.1→2.0, que **no dice bajo qué política se produjo** y que **no declara nada sobre desplegabilidad**, es aceptado como medición válida. Eso es exactamente el estado «que deja pasar una degradación no autorizada» que la revisión debía buscar.

### 5.4 El pin de la política nunca se verifica

`requested.policy_sha256` está declarado obligatorio (`contracts/canary_jit_contract_v1.json:38` y `:359`) y el contrato lo usa como raíz de autoridad (`authority_block`, `L15-18`). El validador **no lo compara con nada**:

| Sonda | `requested.policy_sha256` | `decision` |
|---|---|---|
| `F1` | 64 ceros (política ajena) | **ACCEPT** `OK_APPLIED_MEASURED` |
| `F2` | ausente | **ACCEPT** `OK_APPLIED_MEASURED` |

El `checkContract()` sí verifica el pin del **JSON del contrato** (comprobación «pin de la politica canonica PASS»), pero `validateReceipt` no mira el pin **del recibo**. Consecuencia: un recibo producido bajo una receta distinta entra como si fuera la de Canary. En un contrato cuyo propósito declarado es «Canary es la autoridad única de receta», eso es el hueco en la raíz.

---

## 6. `engine_sha256`: obligatorio y sin estado intermedio — **PASS**

Seis formas probadas con `validateReceipt` (`L262-272`):

| Sonda | `engine_sha256` | `decision` / `code` |
|---|---|---|
| `P6d` | ausente | **REJECT** `E_ENGINE_SHA_UNVERIFIED` («ausente o mal formado (undefined)») |
| `P6c` | `""` | **REJECT** `E_ENGINE_SHA_UNVERIFIED` |
| `P6b` | sha truncado (63 hex) | **REJECT** `E_ENGINE_SHA_UNVERIFIED` |
| `P6e` | 64 ceros, bien formado | **REJECT** `E_ENGINE_SHA_UNVERIFIED` («no es el sha desplegable del manifiesto») |
| `P6f` | `applied.engine_sha256` distinto | **REJECT** `E_ENGINE_SHA_UNVERIFIED` |
| `P6g` | sha ajeno + `deployability.state='NOT_DEPLOYED'` | **REJECT** `E_ENGINE_SHA_UNVERIFIED` |
| `P6a` | el sha correcto en MAYÚSCULAS con espacios | **ACCEPT** — normalización (`trim().toLowerCase()`), correcta |

**No hay estado intermedio: no existe un valor de `engine_sha256` que produzca un «aceptado con reservas».** La comprobación es incondicional y ocurre antes de toda la lógica de imagen. Este criterio de la revisión **se cumple**.

---

## 7. Triple estado: no se colapsa — **PASS**

| Sonda | Mutación | `decision` / `code` |
|---|---|---|
| `E3` | sin `output` | **REJECT** `E_STATE_COLLAPSED` («falta el estado "output"») |
| `E4` | sin `applied` | **REJECT** `E_STATE_COLLAPSED` («falta el estado "applied"») |
| fixture `[17]` | sin `requested` | **REJECT** `E_STATE_COLLAPSED` («falta el estado "requested"») |
| `E1` | `applied_processing` plano en la raíz | **REJECT** `E_STATE_COLLAPSED` |
| `E2` | `canary_fidelity` plano en la raíz | **REJECT** `E_STATE_COLLAPSED` |

Ninguna sección del contrato los fusiona: `triple_state` los mantiene en tres bloques separados con `may_claim` / `may_not_claim` propios (`contracts/canary_jit_contract_v1.json:59-...`), y `requested` lleva `may_not_claim: ["execution","applied_processing","output_resolution","output_fps","output_codec"]`. El guard #6 («`requested.desired` nunca alimenta el gate de capacidad») se verifica en código: `L378` lee `source.fps` de `requested`, y `L365`/`L484` leen el fps medido **sólo** de `applied.measured_encode_fps`. **Se cumple.**

---

## 8. Hallazgos

### F1 — `requested.policy_sha256` declarado obligatorio y nunca verificado · **blocker**
`tools/quality/test_canary_jit_contract.js:232-513` (función `validateReceipt`)
**Problema:** el contrato declara `policy_sha256` en `requested.required_fields` (`contracts/canary_jit_contract_v1.json:38`, `:359`) y lo usa como raíz de autoridad (`authority_block`, `:15-18`), pero el validador no lo compara con `contract.authority_block.policy_sha256`. Sondas `F1` (ceros) y `F2` (ausente) → **ambas `ACCEPT OK_APPLIED_MEASURED`**. Un recibo producido bajo otra receta pasa como si fuera la de Canary.
**Corrección exigida:** tras validar el schema, comparar `receipt.requested.policy_sha256` con `contract.authority_block.policy_sha256`; si falta o no coincide → `REJECT` con código propio (p. ej. `E_POLICY_PIN_MISMATCH`) + fixture positivo y negativo.

### F2 — Cuatro categorías de degradación se evaden omitiendo el campo · **blocker**
`tools/quality/test_canary_jit_contract.js:457-481` (bloque de degradación) y `:245-249` (única comprobación de presencia, que no baja a subcampos)
**Problema:** `codec`, `bit_depth`, `chroma_subsampling`, `video_bitrate` y `audio_channels` se detectan comparando dos números; si el recibo omite uno de los dos, la comparación no salta y el recibo se acepta. Reproducido: `G1b` (sin `output.video_codec`) → ACCEPT; `G3b` (sin `requested.source.pix_fmt`) → ACCEPT; `G4b`/`G4c` (sin bitrate de salida/de fuente) → ACCEPT; `G5b` (sin `requested.source.audio`) → ACCEPT. Recibo compuesto de §5.3 → ACCEPT con `degradation: []`.
**Corrección exigida:** hacer cumplir de forma fail-closed los `required_fields` de `requested.source` y `output` que el propio contrato ya declara (`contracts/canary_jit_contract_v1.json:363`): si falta `output.video_codec`, `output.pix_fmt`, `output.transfer`, `output.sar`, `output.level` o `requested.source.{video_codec,pix_fmt,bitrate_bps,audio}` → `REJECT` (código tipo `E_RECEIPT_INCOMPLETE_FOR_DEGRADATION`). Añadir un fixture por cada campo cuya ausencia hoy desactiva una guarda, y un control negativo que pruebe que quitarlo rompe el gate.

### F3 — `deployability` obligatorio en el contrato, opcional en la práctica · **high**
`tools/quality/test_canary_jit_contract.js:274-290`
**Problema:** `required_top_level` incluye `deployability` (`contracts/canary_jit_contract_v1.json:358`), pero el validador sólo actúa cuando `dep.state === 'DEPLOYED'`. **Omitir el bloque entero → `ACCEPT`** (sonda `P1`). La guarda `E_NOT_DEPLOYED` es opt-in: se dispara sólo si el recibo se autoinculpa declarando `DEPLOYED`.
**Corrección exigida:** exigir `receipt.deployability` como objeto con `state`, `artifact`, `sha256`, `manifest_file`; ausencia → `REJECT`. Fixture: recibo sin `deployability` → REJECT.

### F4 — `requested` y `output` incumplen su propia lista de obligatorios · **high**
`tools/quality/test_canary_jit_contract.js:245-249` frente a `contracts/canary_jit_contract_v1.json:359,363`
**Problema:** de los 5 campos obligatorios de `requested` se exigen 0; de los 12 de `output` se exigen 5. Sonda `P7` (sin `mode`, `desired`, `policy_sha256`, `policy_revision`) → **ACCEPT**. Sonda `P9` (sin `sar`, `level`, `pix_fmt`, `transfer`, `video_codec`) → **ACCEPT**. Un recibo puede no decir **qué es** su propia salida y ser aceptado como medición.
**Corrección exigida:** un único punto que recorra `receipt_schema.required_top_level`, `requested`, `applied_when_measured`, `evidence`, `output` y `deployability` **desde el JSON del contrato** (no una lista duplicada en código) y rechace la primera ausencia. Fixture por nivel.

### F5 — Dos ramas de guarda con código y sin fixture · **medium**
`tools/quality/test_canary_jit_contract.js:250-254` y `:270-272`
**Problema:** la rama «clave plana en la raíz» y la rama «`applied.engine_sha256` distinto» comparten código con fixtures existentes, pero **ningún fixture las dispara** (el fixture `state_collapsed` cae antes en «falta `requested`»). Comprobé que **hoy funcionan** (`E1`, `E2`, `P6f` → `REJECT E_STATE_COLLAPSED` / `E_ENGINE_SHA_UNVERIFIED`). El riesgo es de regresión: borrar cualquiera de las dos deja el set 21/21 verde.
**Corrección exigida:** dos fixtures nuevos (`state_collapsed_flat_keys`, `engine_sha_applied_mismatch`) y separar el fixture `state_collapsed` en dos casos: «falta `requested`» y «claves planas en la raíz».

### F6 — El control negativo reporta `FAIL 1` con dos comprobaciones fallidas · **low**
`tools/quality/test_canary_jit_contract.js:920-944`
**Problema:** con `manifest_rows=1` fallan **dos** cosas (la coherencia «artefacto del bucle NOT_DEPLOYED» y el fixture `[14]`), pero el tally dice `PASS 24 | FAIL 1` porque el contador de fixtures no incluye la comprobación de coherencia. Un lector puede creer que sólo falló una.
**Corrección exigida:** que el resumen distinga `fixtures: x/y` de `coherencia: PASS|FAIL`, o que sume ambos al total.

---

## 9. Lo que está bien y no hay que tocar

No es cortesía: es parte del veredicto, y evita que la corrección rompa lo que ya funciona.

1. **El gate puede fallar y falla**, con receta reproducible en el documento (`:324-325`) y salida literal (`:330-336`). Lo reproduje: `RESULT=FAIL`, `[14]` de `REJECT` a `ACCEPT`.
2. **`engine_sha256` cierra de verdad** (6 formas, §6), incondicional y antes de toda la lógica de imagen.
3. **El triple estado cierra en las cinco variantes** (§7), incluidas claves planas y ausencias.
4. **`resolution`, `dynamic_range`, `fps` y geometría fallan cerrado** ante omisión: son el patrón correcto ya implementado, y son el modelo para arreglar F2.
5. **La evidencia de fotograma no es una etiqueta:** `L340-372` exige un artefacto JSON legible en disco cuyos `frames`/`seconds` coincidan con el recibo y cuya aritmética `frames/seconds` cuadre con `measured_encode_fps` dentro del 2 %. Es la mejor guarda del conjunto.
6. **`E_RECEIPT_INSUFFICIENT_FOR_ENCODER`** (`L297-301`) cierra el agujero que t1 documentó (`chain_4k_test` es sólo un `-vf`): un recibo que pretenda acreditar encoder por esa ruta se rechaza.
7. **21/21 códigos con fixture**, verificado por set diff propio.

---

## 10. Autoauditoría del veredicto (`metacog_audit`)

Corrí la herramienta sobre las seis afirmaciones que sostienen este veredicto. **Primera pasada: `MIXTO` — 3 fragmentos `NO_SOPORTADO`** (números sin artefacto *atribuido*: el control negativo, la cobertura 21/21 y el propio hueco). En vez de añadir una cita que no había leído, **degradé la redacción** para que cada fragmento llevase su `ruta:línea` y su salida literal en la misma frase, y reejecuté:

```
veredicto: SOPORTADO | fragmentos 6 | soportados 6 | no_soportados 0 | contradichos 0
evidencia_total 6 | evidencia_sin_artefacto 0 | evidencia_no_atribuida 0
```

Fragmentos auditados y su estado final:

| # | Fragmento | Estado |
|---|---|---|
| 1 | Control positivo `fixtures: 25 / PASS 25 / FAIL 0`, exit 0 | **SOPORTADO** |
| 2 | Control negativo `PASS 24 / FAIL 1`, exit 1, con el efecto observable «fixture 14 pasa de REJECT a ACCEPT» | **SOPORTADO** |
| 3 | Cobertura 21/21 por set diff propio sobre 25 fixtures | **SOPORTADO** |
| 4 | `engine_sha256`: seis variantes, sin estado intermedio | **SOPORTADO** |
| 5 | Hueco composite: `ACCEPT` con identidad borrada | **SOPORTADO** |
| 6 | `policy_sha256` no verificado (`validateReceipt`, `L232-513`) | **SOPORTADO** |

**Hallazgo que la herramienta emitió y que incorporo:** `ETIQUETA_MAL_LEIDA:exit_cero_leido_como_evento_ocurrido`. Aplica al control negativo: **el exit code no prueba que el evento ocurrió**. Por eso el §3.2 cita el efecto observable (el fixture `[14]` cambia de decisión) y el exit code sólo lo acompaña. Igual criterio en todo el documento: los `ACCEPT`/`REJECT` que reporto son la salida literal de `validateReceipt`, no inferencias.

---

## 11. Cumplimiento de los criterios de aceptación

| Criterio | Resultado | Evidencia |
|---|---|---|
| El revisor ejecuta el validador y reproduce control positivo y negativo, con exit codes literales | **PASS** | §3.1 (`EXITCODE=0`) y §3.2 (`EXITCODE=1`), ambos ejecutados por mí |
| Cada uno de los 21 códigos tiene al menos un fixture; nombrar los que no | **PASS** | §4: set diff propio → `declarados_sin_fixture=0`. Nombro en §4.1 las **dos ramas de guarda** sin fixture (`L250-254`, `L270-272`), que no son códigos ausentes sino sub-ramas |
| El contrato no puede expresar un estado que deje pasar una degradación no autorizada | **FALLO** | §5.2/§5.3: 4 categorías evadibles por omisión; recibo compuesto `ACCEPT` con `degradation: []` |
| `engine_sha256` obligatorio y sha no desplegable rechazado de plano, sin estado intermedio | **PASS** | §6: 6 formas, todas `REJECT E_ENGINE_SHA_UNVERIFIED` salvo la normalización legítima |
| Los tres estados no se colapsan y ninguna sección los fusiona | **PASS** | §7: 5 variantes `REJECT E_STATE_COLLAPSED`; `triple_state` en tres bloques con `may_claim` propios |
| El revisor audita su veredicto con `metacog_audit` y degrada los `NO_SOPORTADO` | **PASS** | §10: `MIXTO` → redacción degradada → `SOPORTADO` 6/6 |
| El revisor no modifica los tres entregables | **PASS** | hashes idénticos a los declarados (§1); `git status` sólo añade este informe |

---

## 12. Veredicto

**`needs_revision`.**

El contrato tiene la arquitectura correcta y un gate que de verdad puede fallar; no es un sello de goma ni un auto-test complaciente. Pero **declara obligatorios 6 campos de nivel superior y 5+12 de nivel inferior que su validador no exige**, y esa inconsistencia entre lo declarado y lo aplicado es la misma clase de fallo que este equipo está auditando en Canary: *una cosa es lo que el documento dice y otra lo que el motor hace*. Aquí el documento es el contrato y el motor es `validateReceipt`.

Concretamente: **`policy_sha256` sin verificar (F1)** y **cuatro categorías de degradación evadibles por omisión (F2)** son bloqueantes, porque permiten que un recibo que oculta un HEVC→AVC, un 10-bit→8-bit, un recorte de bitrate o un 5.1→2.0 —y que no dice bajo qué receta se produjo— salga `ACCEPT / OK_APPLIED_MEASURED`. Eso es exactamente el estado que la revisión debía encontrar.

Las correcciones son acotadas y no tocan el diseño: hacer cumplir las listas de obligatorios **que el contrato ya declara**, añadir el pin de política al recibo, y un fixture por cada ausencia que hoy desactiva una guarda. Nada de eso requiere reescribir el validador.

**No modifiqué los tres entregables.** Las correcciones son del autor (`t5`).
