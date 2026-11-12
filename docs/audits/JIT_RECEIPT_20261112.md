# RECIBO JIT §4 — emisor validado por el juez real del contrato

**Fecha:** 2026-11-12 · **Autor:** `contract-architect` (t38, team `canary-jit-20261111`)
**Artefactos:** [`tools/canary/jit_receipt_emitter.js`](../../tools/canary/jit_receipt_emitter.js) ·
[`tools/quality/test_jit_receipt_emitter.js`](../../tools/quality/test_jit_receipt_emitter.js)

**Qué cierra.** §4 del prompt pedía que *cada ejecución* dejara registrados 18 campos. Hasta hoy el contrato
definía el esquema y el validador lo comprobaba, pero **nada emitía un recibo desde una ejecución real**. Ahora
sí: el emisor toma lo que el motor reportó y lo que se midió sobre los bytes que produjo, monta el recibo y lo
somete al **juez real** (`validateReceipt`, importado — no reimplementado).

## 1. La cadena, eslabón por eslabón

```text
clip local (ffmpeg)  ->  motor real en loopback (:3199)  ->  /image/receipt  (lo que el motor reporta)
                                   |                                  |
                                   +--> chunks .m4s en disco ---------+--> ffprobe (lo que los bytes dicen)
                                                                      |
                                                              emitReceipt(descriptor)
                                                                      |
                                                          validateReceipt(recibo, contrato)
```

El motor arrancó con la receta medida en esta sesión (`PORT=3199 BIND=127.0.0.1 MAP_FILE=… IDLE_MS=180000
WAIT_MS=60000 BOOT_GRACE_MS=60000 APE_2K=1`) sobre una **copia** en `os.tmpdir`. Produjo sesión real
(`session_dir`, `run_id`, `media_segments`), y sus artefactos están en disco: `init-<run>-0.m4s`,
`chunk-<run>-0-<n>.m4s`, `master.m3u8`, `media_0.m3u8`.

## 2. Los 18 campos del prompt, uno por uno

Salida literal del emisor (`field | estado | path | valor | fuente`):

| # | Campo (§4) | Estado | Path en el recibo | De dónde sale |
|---|---|---|---|---|
| 1 | `canary_config_sha256` | **MEDIDO** | `requested.policy_sha256` | contrato: `authority_block.policy_sha256` (pin de la receta) |
| 2 | `profile_sha256` | NO_DISPONIBLE | `prompt_fields[profile_sha256]` | el motor da `lab_hash` truncado a 16 hex; aquí no se fabricó un sha256 |
| 3 | `device_id` | NO_DISPONIBLE | `prompt_fields[device_id]` | loopback: no hay dispositivo. Inventarlo sería peor que su ausencia |
| 4 | `session_id` | **MEDIDO** | `run.session_id` | `/image/receipt.run_id` (sufijo real de `chunk-<run>-*`) |
| 5 | `channel_id` | **MEDIDO** | `run.channel_id` | `/image/receipt.channel` |
| 6 | `source_signature` | NO_DISPONIBLE | `prompt_fields[source_signature]` | no se midió firma de la fuente (clip local del test) |
| 7 | `requested_processing` | **MEDIDO** | `requested.desired` | `/image/receipt.profile_declared` (P4.5 → 5760x3240) |
| 8 | `applied_processing` | NO_DISPONIBLE | `applied.filtergraph` | no hubo cadena de filtros: el motor entregó copia |
| 9 | `processing_engine` | **MEDIDO** | `engine_sha256` | **sha256 del fichero del motor**, calculado en el emisor |
| 10 | `filter_graph_sha256` | NO_DISPONIBLE | `prompt_fields[filter_graph_sha256]` | sin cadena no hay hash; a ceros sería mentir con formato válido |
| 11 | `encoder` | NO_DISPONIBLE | `applied.encoder` | `codec_mode=copy`: no se recodificó, no hay encoder que acreditar |
| 12 | `output_codec` | **MEDIDO** | `output.video_codec` | ffprobe sobre `init+chunk` producidos → `h264` |
| 13 | `output_resolution` | **MEDIDO** | `output.width/height` | ffprobe → `1280x720` |
| 14 | `output_fps` | **MEDIDO** | `output.fps` | ffprobe `r_frame_rate` → `25` |
| 15 | `output_color` | **MEDIDO** | `output.transfer` | ffprobe `color_transfer` → `unknown` (sin etiqueta; **no** se supuso bt709) |
| 16 | `output_audio` | **MEDIDO** | `output.audio` | ffprobe → 0 canales (el clip de prueba no tiene pista de audio) |
| 17 | `thermal_state` | NO_DISPONIBLE | `prompt_fields[thermal_state]` | un host de build no tiene estado térmico del SoC; NO_COMPUTADO no es «frío» |
| 18 | `fallback_reason` | **MEDIDO** | `applied.reason` | derivado: `COPY_NO_FILTERGRAPH` |

**Balance: 11 MEDIDO + 7 NO_DISPONIBLE = 18.** Ninguno se omite en silencio y ninguno se rellena por defecto:
los 7 no disponibles llevan su razón por escrito en `not_computed[]`, dentro del propio recibo.

## 3. Los cuatro casos, salida literal

```text
== PRUEBA DEL EMISOR DE RECIBOS JIT (§4) — juez: canary_jit_contract_v1.json ==
  PASS  C1  RECIBO HONESTO: motor real en loopback -> juez real ACCEPT
        decision=ACCEPT code=OK_NOT_APPLIED · 11 MEDIDO + 7 NO_DISPONIBLE · engine=290b11030f3b… · deployability=NOT_DEPLOYED
  PASS  C2  CONTROL NEGATIVO: declarar aplicado lo que no se ejecuto -> juez real REJECT
        a) APPLIED_MEASURED sobre copia -> E_REQUIRED_FIELD_MISSING | b) filtros>0 sobre NOT_APPLIED -> E_APPLIED_WITHOUT_PROOF
        | c) disfraz completo -> REJECT E_APPLIED_WITHOUT_PROOF | d) D-1: artifact como objeto lanza TypeError (…)
  PASS  C3  CONTROL DE AUSENCIA: sin requested / sin output / policy a ceros -> REJECT
        sin requested -> E_STATE_COLLAPSED | sin output -> E_STATE_COLLAPSED | policy a ceros -> E_POLICY_PIN_MISMATCH | sin source -> E_REQUIRED_FIELD_MISSING
  PASS  C4  AUSENCIA DE TEATRO: el emisor no puede emitir APPLIED_MEASURED si no se ejecuto nada
        stated_status=APPLIED_MEASURED -> emitido NOT_APPLIED (OK_NOT_APPLIED) · sin output.sar -> lanza E_EMITTER_REQUIRED_MISSING
  casos: 4 | PASS 4 | FAIL 0
  RESULT=PASS
```

### El veredicto del juez sobre el recibo real

```text
VEREDICTO: ACCEPT OK_NOT_APPLIED
reasons: ["estado aplicado: NOT_APPLIED; cadencia 25 fps; capacidad NO_COMPUTADA"]
```

### El recibo, en bloque

```text
engine_sha256    = 290b11030f3b6bf944c14298f3fe8401c0f9bd773789e26afeca8bb9f8aeb492
deployability    = {"state":"NOT_DEPLOYED","artifact":"vps/bin/ape-visual-emulate.sh",
                    "sha256":"f1d2ecff6e6468eb58e04658703a34df8b0e2df1c7d61540abbb84ebf768fec1",
                    "manifest_file":"_vps_stage/deploy/manifest.tsv","jit_loop":true,
                    "reasons":["sin prueba de despliegue: un recibo de loopback no acredita el VPS"]}
requested.source = {"width":1280,"height":720,"fps":25,"transfer":"unknown","pix_fmt":"yuv420p",
                    "video_codec":"h264","bitrate_bps":6436688,"audio":{"codec":null,"channels":0}}
requested.desired= {"width":5760,"height":3240,"video_codec":"libx265","level":"L153"}
applied          = {"status":"NOT_APPLIED","route":"remux_passthrough","engine_sha256":"290b1103…",
                    "reason":"COPY_NO_FILTERGRAPH","blockers":["sin applied.filtergraph…","codec_mode=\"copy\" (se exige transcode)",
                    "sin evidencia de fotograma (frames>0)","sin fps de codificacion medido","sin bloque encoder"]}
output           = {"width":1280,"height":720,"fps":25,"transfer":"unknown","pix_fmt":"yuv420p","video_codec":"h264",
                    "level":31,"sar":"1:1","bitrate_bps":6436696,"audio":{"codec":null,"channels":0},
                    "filters_applied":0,"declared":"NATIVE","artifact":{"path":"…chunk-<run>-0-9.m4s",
                    "sha256":"11abcbf4…","bytes":1609562}}
```

**Por qué `NOT_APPLIED` y no `APPLIED_MEASURED`:** el motor recibió P4.5 (5760x3240, libx265) y **entregó una
copia** — su propio `master.m3u8` dice `RESOLUTION=1280x720, CODECS="avc1.42c01f"`, la misma geometría y
familia que la fuente. Sin `-vf` no hay cadena que acreditar y sin recodificación no hay encoder: el estado
honesto es NOT_APPLIED. El emisor **no acepta** un estado del llamador; lo deriva (caso C4).

## 4. Defecto encontrado en el juez (reportado, NO parcheado)

**D-1 — `validateReceipt` lanza `TypeError` en vez de rechazar cuando `applied.evidence.artifact` es un objeto.**

`artifactBytes()` (`test_canary_jit_contract.js:218`) hace `path.isAbsolute(relOrAbs)` **fuera** del `try`, y
`path.isAbsolute` sólo acepta strings. El esquema del propio contrato documenta `artifact` como
`{path, sha256, bytes}` (objeto), así que un recibo que siga la forma documentada **no se rechaza: rompe el
juez**. Reproducido a mano:

```text
OBJETO -> LANZA TypeError: The "path" argument must be of type string. Received an instance of Object
STRING -> REJECT E_APPLIED_WITHOUT_PROOF
```

Un juez fail-closed debe **RECHAZAR**, no excepcionar: quien envuelva la llamada en `try/catch` puede leer la
excepción como «no hay objeción». No se ha tocado el validador (prohibido por el encargo): se reporta con su
reproducción. Mitigación del lado del emisor: `applied.evidence.artifact` se emite como **string** (la forma que
los propios fixtures del contrato usan), y el caso C2(d) demuestra el defecto cada vez que se corre la prueba.

## 5. Límites: lo que este recibo NO acredita

| Item | Estado | Razón |
|---|---|---|
| **Despliegue** | **NO** | `deployability.state = NOT_DEPLOYED`. El motor medido es `290b1103…` (449.392 B, el de la rama); el del VPS es otro artefacto (`415.037 B / 242c0cda…`). Un recibo de loopback no dice nada del VPS |
| **Calidad de imagen** | **NO** | El recibo registra codec/resolución/fps/color **medidos**, no una nota de calidad. No hay VMAF/SSIM ni comparación perceptual |
| **Paridad visual** | **NO** | `applied.parity` sólo existe si hubo cadena de filtros; aquí no hubo, así que no se declara ninguna |
| **Que el motor esté «vivo»** | **NO** | El propio motor declaró `status=NO_COMPUTADO` porque en este host su `receiptFindFfmpeg` lee `/proc` (no existe en Windows). Produjo 23-30 segmentos reales pero no puede confirmar el proceso. El recibo transcribe ese veredicto en `run.engine_status` en vez de taparlo |
| **Thermal / device / source_signature / profile_sha256** | NO_COMPUTADO | declarados con razón; un host de build no los tiene |

## 6. Concurrencia durante la tarea (declarado)

Mientras corría esta tarea, otro agente **cambió de rama y commiteó** en el mismo árbol:
`fix/engine-tdz-dos-20261112` @ `fdee492f` → `deploy/engine-restart-20261112` @ `39bf6a78`, y dejó modificado
`tools/ape-http-conformance/gate_matrix.js` (163 inserciones / 28 borrados, mtime 01:16:48). **No es mío.**

Lo que importa para este contrato —y se volvió a medir después del cambio— es que **el motor no se movió**:

```text
tools/lab/ape-jit/server.js                 449392 B  sha256=290b11030f3b6bf944c14298f3fe8401c0f9bd773789e26afeca8bb9f8aeb492
tools/quality/test_canary_jit_contract.js    71957 B  sha256=3e070ac3bacdf4368ed1e90d68d13a3f732e84f2e2eeb7d672bfc4d5fedd8685
contracts/canary_jit_contract_v1.json        35791 B  sha256=f31755ca9db2acbc9b2f1bd31a2a2fa94e328d7ad2cdf5b6769362ade42d8ec7
```

Idénticos a los medidos al empezar. El juez sigue verde: `92/92 comprobaciones | fallos: 0 | RESULT=PASS`.

## 7. Reproducir

```bash
node -c tools/canary/jit_receipt_emitter.js
node -c tools/quality/test_jit_receipt_emitter.js
node tools/quality/test_jit_receipt_emitter.js     # 4 casos, arranca el motor real en :3199
node tools/quality/test_canary_jit_contract.js     # el juez, 92/92 (no se ha tocado)
```

La prueba tarda ~2-10 s, deja **0 listeners** en el puerto 3199 y borra sus temporales y la sesión que el motor
escribe en `/dev/shm/ape-jit` (comprobado: no queda ni el directorio).

## 8. Decisiones de diseño que conviene conocer

- **`engine_sha256` se hashea, no se escribe.** No hay parámetro para pasarlo: si el llamador pudiera fijarlo,
  el recibo podría nombrar un motor que no ejecutó — exactamente el fallo que el contrato persigue.
- **`policy_sha256` sale del contrato** (`authority_block`), no del llamador. Un pin a ceros lo rechaza el juez
  con `E_POLICY_PIN_MISMATCH` (C3).
- **`filters_applied` se deriva del estado**, no se declara: declarar filtros sobre NOT_APPLIED el juez lo
  rechaza con `E_APPLIED_WITHOUT_PROOF` (C2b).
- **Última barrera**: antes de devolver el recibo, el emisor corre `walkRequiredFields` **del juez** sobre el
  recibo montado. Si el contrato exige algo que falta, **lanza** `E_EMITTER_REQUIRED_MISSING` (C4) en vez de
  entregar un recibo incompleto.
