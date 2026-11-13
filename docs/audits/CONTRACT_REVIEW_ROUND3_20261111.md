# REVISION INDEPENDIENTE — RONDA 3 · Contrato Canary→JIT v1 y su gate

**Fecha:** 2026-11-11 (America/Bogota)
**Revisor:** canary-auditor (team `canary-jit-20261111`, task `t12`) — **no soy el autor**
**Revisado:** `t11` (fix de F7) y `t10` (sincronización del documento)
**Rondas previas:** [`CONTRACT_REVIEW_20261111.md`](CONTRACT_REVIEW_20261111.md) (`needs_revision`, F1–F6) · [`CONTRACT_REVIEW_ROUND2_20261111.md`](CONTRACT_REVIEW_ROUND2_20261111.md) (`needs_revision`, F7–F8)

**VEREDICTO: `pass`**

Los dos hallazgos abiertos están cerrados y **verificados por mutación independiente**, no por lectura del informe del autor. El barrido exhaustivo ya no deja ningún hueco: **50 de 50** campos obligatorios rechazan su ausencia. Los 7 criterios de aceptación se cumplen.

---

## 1. Identidad

| Artefacto | Bytes | SHA-256 medido | Declarado | Coincide |
|---|---|---|---|---|
| `contracts/canary_jit_contract_v1.json` | 35.791 | `488b87609a02c69d0ecffba17ea532fc8142964f3fdeb98e4cd8cc70e1395514` | t11: «no se ha tocado» | **SÍ** (idéntico a ronda 2) |
| `tools/quality/test_canary_jit_contract.js` | 71.957 | `0869149200cc0e7290e7de112fd0aa81914726435fd67989b34f29628169680b` | t11 | **SÍ** |
| `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md` | 32.264 | `96dd7f5714b315d00bc59c1914451e11dee445d14bfd38cfec76ee6689f443eb` | t10 | **SÍ** |

**No modifiqué ninguno de los tres.** Los hashes de arriba son los medidos después de mi revisión.

---

## 2. Controles, ejecutados por mí

### 2.1 Positivo

```
  PASS  gate_precedence apunta a paths obligatorios  [owned=15]
  PASS  gate_precedence: el gate dueno rechaza la ausencia  [exenciones probadas=15]
  PASS  ningun path obligatorio sin gate que lo exija  [walker=35 + exenciones probadas=15 = 50]
  PASS  [55] falta applied.engine_sha256 (gate_precedence debe rechazar la ausencia)  -> REJECT/E_ENGINE_SHA_UNVERIFIED
  PASS  declarados=23 ejercitados=23
-- resumen --
  fixtures: 55/55 PASS  (FAIL 0)
  coherencia del contrato: PASS  (27/27 checks)
  campos load-bearing: 10/10 PASS  (FAIL 0)  redundantes declarados: output.level=REDUNDANTE_COVERED_BY:E_LEVEL_RESOLUTION_IMPOSSIBLE
  total: 92/92 comprobaciones | fallos: 0
  RESULT=PASS
EXITCODE=0
```

`node -c` → `EXITCODE=0`.

### 2.2 Negativo A — `manifest_rows=1` (la receta del documento)

```
  FAIL  artefacto del bucle NOT_DEPLOYED  [jit_hits=7 rows=1]
  FAIL  [14] artefacto sin fila en manifest.tsv declarado desplegado  -> ACCEPT/OK_APPLIED_MEASURED
  fixtures: 54/55 PASS  (FAIL 1)
  coherencia del contrato: FAIL  (26/27 checks)
  campos load-bearing: 10/10 PASS  (FAIL 0)
  total: 90/92 comprobaciones | fallos: 2
  RESULT=FAIL
EXITCODE=1
```

Coincide con lo que el documento declara (`total: 90/92 | fallos: 2`).

### 2.3 Negativo B — quitar `video_codec` **solo** de `receipt_schema.output`

Mutación distinta de la A, y la ejecuté porque es la que separa «tres detectores» de «un detector»:

```
  FAIL  guard_map apunta a paths obligatorios  [inertes: output.video_codec]
  FAIL  [40] codec HEVC->AVC con output.video_codec omitido  -> ACCEPT/OK_APPLIED_MEASURED
  FAIL  output.video_codec               LOAD_BEARING  [con guarda: ACCEPT/OK_APPLIED_MEASURED | sin guarda: ACCEPT/OK_APPLIED_MEASURED]
  fixtures: 54/55 PASS  (FAIL 1)
  coherencia del contrato: FAIL  (26/27 checks)
  campos load-bearing: 9/10 PASS  (FAIL 1)
  total: 89/92 comprobaciones | fallos: 3
  RESULT=FAIL
EXITCODE=1
```

**Tres detectores independientes** disparan sobre la misma mutación: la lista huérfana, el fixture y la fila load-bearing. Coincide exactamente con el `89/92 | fallos: 3` que congela el documento. Y explica por qué la variante de t11 daba `90/91`: allí se borraba también la entrada de `guard_map`, con lo que la fila load-bearing desaparecía y el total bajaba. **Los dos números eran correctos para mutaciones distintas**, y el documento ahora documenta la mutación exacta al lado del número (§10).

---

## 3. Cobertura: 23 códigos, 55 fixtures, ninguno sin ejercitar

Mi propio set diff, parseando el fuente:

```
push() parseados = 55 ; ACCEPT = 5 ; REJECT = 50
declarados = 23 ; ejercitados = 23
DECLARADOS SIN FIXTURE    = 0
EJERCITADOS NO DECLARADOS = 0
```

**Ninguno de los 23 códigos queda sin fixture. Ningún código se ejercita sin estar declarado.**

---

## 4. F7 — CERRADO, y probado por mutación

### 4.1 El gate dueño ya rechaza la ausencia

`tools/quality/test_canary_jit_contract.js:372`:

```js
if (!isPresent(applied.engine_sha256)) {
  return reject('E_ENGINE_SHA_UNVERIFIED', 'applied.engine_sha256 ausente: gate_precedence declara que este path lo valida ESTE gate; un gate que no rechaza la ausencia deja la guarda desactivada en silencio (F7 de t9)');
}
if (String(applied.engine_sha256).toLowerCase() !== engineSha) { ... }
```

El cortocircuito `&&` que hacía pasar `String(undefined)` **ya no está**. El contrato no se tocó (opción 2 de mi informe, no la 1): la exención de `gate_precedence` se hizo **verdadera** en vez de desaparecer, y se conserva el código preciso `E_ENGINE_SHA_UNVERIFIED`.

### 4.2 El barrido exhaustivo ya no tiene huecos

```
=== SWEEP 50 paths obligatorios (ronda 3) ===
paths derivados = 50 ; REJECT = 50 ; ACCEPT = 0
HUECOS = []
```

En la ronda 2 este mismo barrido daba **49/1** con `applied.engine_sha256` como único hueco. **Ahora 50/50.**

### 4.3 El detector nuevo es load-bearing — lo probé yo, no lo leí

Ésta es la prueba que decide si F7 está cerrado **como clase** o sólo como caso. Copié el fuente a `os.tmpdir()`, restauré el código PRE-fix (borré el bloque de ausencia y volví a poner el `&&`) y comparé los dos módulos:

```
mutacion: ausencia-eliminada=true ; cortocircuito=true ; cambio=true

--- A) MODULO REAL (post-fix) ---
  PASS  gate_precedence: el gate dueno rechaza la ausencia  [exenciones probadas=15]
  PASS  ningun path obligatorio sin gate que lo exija  [walker=35 + exenciones probadas=15 = 50]
  checks=8 FAIL=0

--- B) MODULO PRE-fix simulado ---
  FAIL  gate_precedence: el gate dueno rechaza la ausencia  [HUECOS: applied.engine_sha256(HUECO_AUSENCIA_ACEPTADA)]
  FAIL  ningun path obligatorio sin gate que lo exija  [walker=35 + exenciones probadas=14 = 50 ; sin cobertura: applied.engine_sha256]
  checks=8 FAIL=2
```

Y el efecto sobre la decisión, con el mismo recibo:

```
recibo sin applied.engine_sha256:
  MODULO REAL    -> REJECT / E_ENGINE_SHA_UNVERIFIED
  MODULO PRE-fix -> ACCEPT / OK_APPLIED_MEASURED
```

**El autochequeo hace exactamente lo que promete:** no sólo pasa con el código bueno, **falla y nombra el path** con el código malo. Si alguien reintroduce la clase por una tercera puerta, el gate lo dice con `HUECOS: <path>(<estado>)`.

Esto cierra el agravante que reporté en la ronda 2: la dirección que faltaba —path obligatorio cuyo gate dueño no exige presencia— ya se comprueba, y se comprueba **probando**, no declarando.

---

## 5. F8 — CERRADO: el documento coincide con el artefacto

Barrido de cifras obsoletas en `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md` (32.264 B):

```
grep '25 fixtures|PASS 24|fixtures: 25|declarados=21|ejercitados=21|21 códigos|21 codigos|los 25 fixtures|89/89|25 pruebas'
  -> 0 coincidencias
```

Cifras vigentes presentes y verificadas contra mi propia corrida:

| Línea | Documento | Medido por mí |
|---|---|---|
| L62 | «23 códigos, todos ejercitados por un fixture» | 23/23 ✓ |
| L349 | `fixtures: 55/55 PASS (FAIL 0)` | ✓ |
| L350 | `coherencia del contrato: PASS (27/27 checks)` | ✓ |
| L351 | `campos load-bearing: 10/10 PASS` | ✓ |
| L353 | `total: 92/92 comprobaciones \| fallos: 0` | ✓ |
| L369 / L387 | `total: 90/92 comprobaciones \| fallos: 2` (negativo A) | ✓ |
| L421 | `total: 89/92 comprobaciones \| fallos: 3` (negativo B) | ✓ |

La aritmética del documento (`55 + 27 + 10 = 92`) cierra. Las nueve líneas que en la ronda 2 citaban el artefacto viejo están corregidas, y el documento cita los fixtures **por ID y no por número de orden** — decisión correcta, porque el número se desplaza al añadir casos y el documento volvería a mentir sin avisar.

---

## 6. Los invariantes que no debían moverse

### 6.1 ¿Puede pasar una degradación no autorizada? **NO**

- Barrido de los 50 paths obligatorios: **50/50 REJECT**, `HUECOS=[]` (§4.2).
- Evasiones por omisión de la ronda 1: `sin output.video_codec`, `sin requested.source.pix_fmt` → `REJECT E_REQUIRED_FIELD_MISSING`.
- Pin de política en ceros → `REJECT E_POLICY_PIN_MISMATCH`.
- Recibo sin `applied.engine_sha256` **y** con HEVC→AVC → `REJECT E_ENGINE_SHA_UNVERIFIED` (el gate del motor dispara antes; la guarda de degradación sigue probada por separado en el fixture `[40]`).

### 6.2 `engine_sha256`: obligatorio, sin estado intermedio — **PASS**

| Sonda | Resultado |
|---|---|
| `engine_sha256` ausente | `REJECT E_ENGINE_SHA_UNVERIFIED` |
| bien formado ajeno (`000…0`) | `REJECT E_ENGINE_SHA_UNVERIFIED` |
| `applied.engine_sha256` distinto | `REJECT E_ENGINE_SHA_UNVERIFIED` |
| **`applied.engine_sha256` ausente** (lo nuevo) | `REJECT E_ENGINE_SHA_UNVERIFIED` |

### 6.3 Triple estado: no se colapsa — **PASS**

| Sonda | Resultado |
|---|---|
| sin `output` | `REJECT E_STATE_COLLAPSED` |
| sin `applied` | `REJECT E_STATE_COLLAPSED` |
| sin `requested` | `REJECT E_STATE_COLLAPSED` |
| `applied_processing` plano en la raíz | `REJECT E_STATE_COLLAPSED` |

Ninguna sección fusiona los tres estados; el gate de capacidad sigue leyendo el fps medido sólo de `applied.measured_encode_fps`.

---

## 7. Autoauditoría del veredicto (`metacog_audit`)

Primera pasada sobre 9 fragmentos: `MIXTO`, **1 `NO_SOPORTADO`** — el fragmento del detector load-bearing citaba `exenciones probadas=15` y `walker=35` sin el artefacto en la misma frase. En vez de añadir una cita que no había leído, **degradé la redacción** para que el fragmento llevase las líneas literales que emite `checkRequiredFieldSource` y su `ruta:línea`, y reejecuté:

```
veredicto: SOPORTADO | fragmentos 9 | soportados 9 | no_soportados 0 | contradichos 0
evidencia_sin_artefacto 0
```

Los nueve fragmentos —positivo, negativo A, negativo B, cobertura, barrido, detector load-bearing, decisión real-vs-prefix, documento y regresión— quedan **SOPORTADO**.

Hallazgo de la herramienta que incorporo: `ETIQUETA_MAL_LEIDA:exit_cero_leido_como_evento_ocurrido`. Por eso cada resultado de este informe cita la **línea de salida** o el **cambio de decisión**, y el exit code sólo acompaña.

---

## 8. Cumplimiento de los criterios de aceptación

| Criterio | Resultado | Evidencia |
|---|---|---|
| Ejecutar el validador y reproducir positivo y negativo con exit codes literales | **PASS** | §2.1 (`EXITCODE=0`, `total: 92/92`) · §2.2 (`EXITCODE=1`, `90/92 \| fallos: 2`) · §2.3 (`EXITCODE=1`, `89/92 \| fallos: 3`) |
| Cada código de rechazo con fixture; nombrar los que no | **PASS** | §3: 23/23, `declarados_sin_fixture=0`, `ejercitados_no_declarados=0`. **Ninguno sin fixture** |
| El contrato no puede expresar un estado que deje pasar una degradación no autorizada | **PASS** | §4.2 (50/50) y §6.1 |
| `engine_sha256` obligatorio, no desplegable rechazado de plano, sin estado intermedio | **PASS** | §6.2, incluida la ausencia de `applied.engine_sha256` |
| Los tres estados no se colapsan y ninguna sección los fusiona | **PASS** | §6.3 |
| Auditar el veredicto con `metacog_audit` y degradar los `NO_SOPORTADO` | **PASS** | §7: `MIXTO` → redacción degradada → `SOPORTADO` 9/9 |
| No modificar los tres entregables | **PASS** | §1: `488b8760` / `08691492` / `96dd7f57` idénticos antes y después de la revisión |

---

## 9. Límites de lo que este `pass` significa

Un `pass` de revisión no convierte el gate en una garantía total. Lo que queda **fuera** de lo que este artefacto puede afirmar, dicho para que nadie lo lea de más:

1. **El gate valida recibos, no bitstreams.** Comprueba coherencia entre lo declarado, el contrato y un artefacto de evidencia JSON. Ese JSON no está firmado: un actor que fabrique el artefacto de evidencia puede satisfacer la aritmética `frames/seconds`. El gate acota **mentir por omisión** —que era el fallo real— no mentir por fabricación del fichero de evidencia.
2. **`output.level` sigue declarado `REDUNDANTE_COVERED_BY:E_LEVEL_RESOLUTION_IMPOSSIBLE`.** Es correcto y está declarado, no escondido: la guarda de nivel ya lo cubre por otra vía.
3. **El contrato sigue `CANDIDATE_NOT_DEPLOYED`.** Este `pass` no dice nada del VPS, ni de qué motor corre en producción (eso es `NO_COMPUTADO` desde `t2`), ni de si la integración Canary→JIT está desplegada. Dice que el contrato y su gate hacen lo que prometen.
4. **La cifra `0,1828 fps` que alimenta el gate de capacidad** procede de `FASE01_REPORT.md:59` y es del experimento aislado a 5 fps; el gate la usa como umbral honesto (por debajo de 25/30/50/60 ⇒ `NOT_APPLIED`), no como prueba de viabilidad en directo.

---

## 10. Veredicto

**`pass`.**

F1–F6 cerrados en la ronda 2; **F7 y F8 cerrados en la ronda 3**, y esta vez no me apoyo en el informe del autor:

- El barrido exhaustivo pasó de **49/1** a **50/50**.
- El detector nuevo **falla y nombra el path** cuando le devuelvo el código PRE-fix — no es decorativo.
- El mismo recibo da `REJECT` con el código real y `ACCEPT` con el viejo: la diferencia es exactamente el fix.
- El documento ya no contiene una sola cifra de las rondas anteriores, y sus números coinciden con los que medí.

Sin hallazgos abiertos. Lo que queda por delante no es de este entregable: el contrato está en `CANDIDATE_NOT_DEPLOYED` y su despliegue, junto con la decisión de si la integración Canary→JIT se activa, son del operador.

**No modifiqué los tres entregables.** Esta revisión sólo añade este documento.
