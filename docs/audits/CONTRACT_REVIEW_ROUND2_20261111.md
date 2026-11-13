# REVISION INDEPENDIENTE — RONDA 2 · Contrato Canary→JIT v1 y su gate

**Fecha:** 2026-11-11 (America/Bogota)
**Revisor:** canary-auditor (team `canary-jit-20261111`, task `t9`) — **no soy el autor**
**Revisado:** `t8` (repair round 2), sobre los hallazgos F1–F6 de `t7`
**Ronda previa:** `docs/audits/CONTRACT_REVIEW_20261111.md` (veredicto `needs_revision`)

**VEREDICTO: `needs_revision`** — 2 hallazgos abiertos, ninguno estructural.

**La reparación es real y es de clase, no de casos.** Los 6 hallazgos de la ronda 1 están cerrados y lo verifiqué con mis propias sondas, no con los fixtures del autor. Pero el barrido exhaustivo de los 50 campos obligatorios del contrato deja **1 de 50 sin enforcement** (`applied.engine_sha256`), y el tercer entregable —el documento— **sigue describiendo el artefacto de la ronda 1** en 9 líneas.

---

## 1. Identidad

| Artefacto | Bytes | SHA-256 medido | Declarado por t8 | Coincide |
|---|---|---|---|---|
| `contracts/canary_jit_contract_v1.json` | 35.791 | `488b87609a02c69d0ecffba17ea532fc8142964f3fdeb98e4cd8cc70e1395514` | `488b8760…395514` | **SÍ** |
| `tools/quality/test_canary_jit_contract.js` | 68.812 | `7429095621e3357639b52fbb57fa548ec235d3b6891fdd5b815f6d0efb6585b3` | `74290956…f6585b3` | **SÍ** |
| `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md` | 24.513 | `998f1ae468f45cf44b6ca4ee5d10af1cb809951d9c993c733a5816311a56e8d5` | t8: «solo 2 ficheros» | **sin tocar** |

El documento conserva el hash de la ronda 1. t8 lo declaró explícitamente fuera de su cambio; **eso es el hallazgo F8**, no un ocultamiento.

`git status --porcelain` → 8 rutas `??` (3 entregables + mis informes de t7/t9 + los de t1/t2/otro). Cero entradas `.agents/`. **No modifiqué ninguno de los tres entregables.**

---

## 2. Controles, ejecutados por mí

### 2.1 Positivo — `node tools/quality/test_canary_jit_contract.js`

```
-- coherencia del contrato --
  ... 25 checks PASS (incluye: required_field_levels declarado [niveles=9], sin paths
      obligatorios duplicados [paths=50], gate_precedence apunta a paths obligatorios
      [owned=15], guard_map apunta a paths obligatorios [guards=10], ninguna lista
      obligatoria huerfana [listas=9], rechazos declarados [codes=23 not_computed=7])
-- fixtures del validador --
  PASS  [01] … PASS  [54]
-- cobertura de codigos de rechazo --
  PASS  declarados=23 ejercitados=23
-- campos obligatorios load-bearing (se borran del recibo y del contrato) --
  PASS  output.video_codec            LOAD_BEARING  [con guarda: REJECT/E_REQUIRED_FIELD_MISSING | sin guarda: ACCEPT/OK_APPLIED_MEASURED]
  ... 10/10 PASS (output.level = REDUNDANTE_COVERED_BY:E_LEVEL_RESOLUTION_IMPOSSIBLE)
-- resumen --
  fixtures: 54/54 PASS  (FAIL 0)
  coherencia del contrato: PASS  (25/25 checks)
  campos load-bearing: 10/10 PASS  (FAIL 0)
  aceptados: 5 | envenenados rechazados: 49
  total: 89/89 comprobaciones | fallos: 0
  RESULT=PASS
EXITCODE=0
```

`node -c` → `EXITCODE=0`.

### 2.2 Negativo — receta de `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md:324-325`, ejecutada tal cual

```
  FAIL  artefacto del bucle NOT_DEPLOYED  [jit_hits=7 rows=1]
  FAIL  [14] artefacto sin fila en manifest.tsv declarado desplegado  -> ACCEPT/OK_APPLIED_MEASURED
  fixtures: 53/54 PASS  (FAIL 1)
  coherencia del contrato: FAIL  (24/25 checks)
  campos load-bearing: 10/10 PASS  (FAIL 0)
  total: 87/89 comprobaciones | fallos: 2
  RESULT=FAIL
EXITCODE=1
```

**F6 cerrado.** El resumen ya separa fixtures / coherencia / load-bearing y suma `total: 87/89 | fallos: 2` — las dos comprobaciones que fallan se cuentan las dos. El efecto observable es el mismo de siempre: el fixture `[14]` cambia de `REJECT` a `ACCEPT`. El exit code acompaña; no es la prueba.

Y el detalle contraintuitivo que confirma que el diseño es correcto: **`campos load-bearing: 10/10 PASS` sigue verde incluso en el control negativo**, porque el daño se inyectó en `deployability.loop_artifact`, fuera de los 10 campos del `guard_map`. La separación de secciones no se contamina.

---

## 3. Cobertura: ahora 23 códigos, y los 23 tienen fixture

El contrato pasó de 21 a **23** códigos: añadió `E_REQUIRED_FIELD_MISSING` (blocker) y `E_POLICY_PIN_MISMATCH` (blocker).

Mi propio set diff (parseo estático de las 54 llamadas `push()` contra el array `rejections` del JSON):

```
push() calls parsed = 54 ; ACCEPT = 5 ; REJECT = 49
declared codes = 23 ; exercised REJECT codes = 23
DECLARADOS SIN FIXTURE   = 0
EJERCITADOS NO DECLARADOS = 0
```

**Ninguno sin fixture. Ninguno inventado.** La tabla viva está en `contracts/canary_jit_contract_v1.json` (`rejections`), con el `fixture` declarado por código; los dos de doble fixture (`E_HDR_SOURCE_TO_SDR_CHAIN` → `pq_to_sdr`+`hlg_to_sdr`, `E_ENGINE_SHA_UNVERIFIED` → `engine_sha_missing`+`engine_sha_not_deployable`) siguen coherentes.

### 3.1 Las dos ramas sin fixture de la ronda 1 están cerradas

| Rama | Ronda 1 | Ronda 2 |
|---|---|---|
| `E_STATE_COLLAPSED` por falta de `requested` | cubierta | `[48] falta requested (caso 1 de colapso)` |
| `E_STATE_COLLAPSED` por claves planas en la raíz | **sin fixture** | `[49] claves planas en la raiz con el triple intacto (caso 2)` |
| `E_ENGINE_SHA_UNVERIFIED` por `applied.engine_sha256` distinto | **sin fixture** | `[51] applied.engine_sha256 de otro motor` |

Y lo que faltaba de verdad en la ronda 1: **controles que prueban que la decisión cambia al quitar la condición**. `[50]` (mismo recibo sin las claves planas → `ACCEPT`) y `[52]` (mismo recibo con el engine correcto → `ACCEPT`). Sin esos dos, los fixtures 49 y 51 sólo probarían que el gate rechaza algo, no que rechaza **por eso**.

---

## 4. Los 6 hallazgos de la ronda 1: re-probados uno por uno

Todo con mis sondas sobre `validateReceipt`, recibos base que el gate acepta.

### F1 — pin de política · **CERRADO**

| Sonda | `requested.policy_sha256` | Ronda 1 | Ronda 2 |
|---|---|---|---|
| pin en ceros | `000…0` | ACCEPT | **REJECT `E_POLICY_PIN_MISMATCH`** |
| pin ausente | — | ACCEPT | **REJECT `E_POLICY_PIN_MISMATCH`** |
| pin bien formado pero ajeno | `deadbeef…` | — | **REJECT `E_POLICY_PIN_MISMATCH`** |
| control: pin correcto | `9845aa5d…` | ACCEPT | **ACCEPT `OK_APPLIED_MEASURED`** |

### F2 — las 4 evasiones por omisión · **CERRADAS**

| Sonda (la misma que abrió el hallazgo) | Ronda 1 | Ronda 2 |
|---|---|---|
| omitir `output.video_codec` | ACCEPT | **REJECT `E_REQUIRED_FIELD_MISSING`** |
| omitir `requested.source.pix_fmt` | ACCEPT | **REJECT `E_REQUIRED_FIELD_MISSING`** |
| omitir `output.bitrate_bps` | ACCEPT | **REJECT `E_REQUIRED_FIELD_MISSING`** |
| omitir `requested.source.bitrate_bps` | ACCEPT | **REJECT `E_REQUIRED_FIELD_MISSING`** |
| omitir `requested.source.audio` | ACCEPT | **REJECT `E_REQUIRED_FIELD_MISSING`** |
| **recibo compuesto de t7** (identidad borrada + pin en ceros + sin `deployability`) | ACCEPT | **REJECT `E_POLICY_PIN_MISMATCH`** |

El compuesto de t7 rechaza por el pin antes de llegar a la completitud — y el fixture `[54]` del autor prueba el orden inverso (mismo recibo con pin correcto → rechaza por `E_REQUIRED_FIELD_MISSING`). **Los dos gates se cubren por separado, no se tapan.**

### F3 — `deployability` · **CERRADO**
Sin el bloque → `REJECT E_REQUIRED_FIELD_MISSING`. Con `deployability` como string en vez de objeto → `REJECT E_REQUIRED_FIELD_MISSING`.

### F4 — niveles `requested` / `output` · **CERRADO**
Sin `mode`+`desired`+`policy_revision` → `REJECT E_REQUIRED_FIELD_MISSING`. Sin `sar`+`level`+`pix_fmt`+`transfer`+`video_codec` → `REJECT E_REQUIRED_FIELD_MISSING`.

### F5 — guardas sin fixture · **CERRADO** (ver §3.1)

### F6 — tally · **CERRADO** (ver §2.2)

---

## 5. El criterio clave de nuevo: ¿puede pasar una degradación no autorizada?

**Barrido exhaustivo, no muestreo.** Derivé del contrato los **50** paths obligatorios (coinciden con el `paths=50` que imprime el gate), y borré **uno a uno** del recibo base que el gate acepta:

```
derived required paths: 50
REJECT=49 ; ACCEPT=1 ; ya ausentes en el base = 0
HUECOS: ["applied.engine_sha256 -> ACCEPT/OK_APPLIED_MEASURED"]
```

**49 de 50 rechazan. Uno no.** Ese es F7.

Y antes de eso, la comprobación que importa: **ninguna degradación pasa**. El barrido no encontró un solo camino de evasión por omisión, y la sonda que combina el hueco con una degradación real lo confirma:

| Sonda | Recibo | Resultado |
|---|---|---|
| `H2` | sin `applied.engine_sha256` **y** `output.video_codec='h264'` sobre fuente `hevc` | **REJECT `E_DEGRADATION_UNAUTHORIZED`** |

**El criterio se cumple: el contrato ya no puede expresar un estado que deje pasar una degradación no autorizada.** Lo que queda abierto es otra invariante —que todo campo declarado obligatorio se exija de verdad— y por eso hay F7.

---

## 6. `engine_sha256`: obligatorio y sin estado intermedio — **PASS (se mantiene)**

| Sonda | Valor | Resultado |
|---|---|---|
| ausente | — | `REJECT E_ENGINE_SHA_UNVERIFIED` |
| cadena vacía | `""` | `REJECT E_ENGINE_SHA_UNVERIFIED` |
| truncado | 63 hex | `REJECT E_ENGINE_SHA_UNVERIFIED` |
| bien formado ajeno | `000…0` | `REJECT E_ENGINE_SHA_UNVERIFIED` |
| `applied.engine_sha256` distinto | otro motor | `REJECT E_ENGINE_SHA_UNVERIFIED` |
| mayúsculas + espacios | el correcto | `ACCEPT` (normalización `trim().toLowerCase()`) |

Sin cambios respecto de la ronda 1: **no existe un valor que produzca un «aceptado con reservas»**.

---

## 7. Triple estado: no se colapsa — **PASS (se mantiene)**

| Sonda | Mutación | Resultado |
|---|---|---|
| sin `output` | — | `REJECT E_STATE_COLLAPSED` |
| sin `applied` | — | `REJECT E_STATE_COLLAPSED` |
| sin `requested` | — | `REJECT E_STATE_COLLAPSED` |
| `applied_processing` plano en la raíz | — | `REJECT E_STATE_COLLAPSED` |
| `canary_fidelity` plano en la raíz | — | `REJECT E_STATE_COLLAPSED` |

Sin fusión entre secciones: `triple_state` sigue con los tres bloques y sus `may_claim`/`may_not_claim` propios, y el gate de capacidad sigue leyendo el fps medido **sólo** de `applied.measured_encode_fps`.

---

## 8. Hallazgos abiertos

### F7 — `applied.engine_sha256` está declarado obligatorio y no se exige · **high**
`tools/quality/test_canary_jit_contract.js:286` (walker) + `:372` (gate del motor) + `:1005-1007` (autochequeo)

**Problema.** El contrato declara `applied.engine_sha256` obligatorio (`applied` incluye `engine_sha256`) y lo mapea en `gate_precedence` a `E_ENGINE_SHA_UNVERIFIED`. El walker **salta** todo path que esté en `gate_precedence`:

```js
// L286
if (ownedBy[full]) { skipped.push(full + '->' + ownedBy[full]); continue; }
```

…y el gate dueño **sólo compara si el campo está presente**:

```js
// L372
if (applied.engine_sha256 && String(applied.engine_sha256).toLowerCase() !== engineSha) {
```

Resultado: **declarado obligatorio + saltado por precedencia + no exigido por su dueño = ausencia aceptada.** Sonda `H1`: recibo sin `applied.engine_sha256` → `ACCEPT / OK_APPLIED_MEASURED`. Es la misma clase que F4, en el único path donde el mecanismo de precedencia la deja pasar.

**Alcance honesto:** no deja pasar degradaciones (§5, sonda `H2`). Lo que se pierde es la corroboración de motor dentro de `applied`: el recibo nombra el sha arriba y el bloque `applied` no lo confirma.

**El autochequeo del autor da un falso PASS sobre este path.** `checkRequiredFieldSource` (`L1005-1007`) sólo verifica la dirección inversa —que ningún path de `gate_precedence` esté fuera de la lista de obligatorios—:

```js
const owned = Object.keys(s.gate_precedence || {});
const inertOwned = owned.filter((p) => !paths.includes(p));
add('gate_precedence apunta a paths obligatorios', inertOwned.length === 0, …);
```

Nunca comprueba la dirección que falla: **un path obligatorio en `gate_precedence` cuyo gate dueño no exige su presencia.** Por eso el gate imprime `PASS gate_precedence apunta a paths obligatorios [owned=15]` mientras el hueco existe.

**Corrección exigida.** Dos piezas, ambas pequeñas:
1. Quitar `applied.engine_sha256` de `gate_precedence` (el walker pasa a exigirlo), **o** hacer que el gate de `L372` rechace su ausencia. La primera es más limpia: el código emitido ya sería `E_REQUIRED_FIELD_MISSING`, y `[51]` seguiría probando el mismatch.
2. Añadir a `checkRequiredFieldSource` la dirección directa: para cada path de `gate_precedence`, borrarlo del recibo y comprobar que su gate dueño **rechaza**. Es la misma técnica `load-bearing` que el autor ya aplica a `guard_map` — sólo hay que aplicarla también a `gate_precedence`.
3. Fixture: recibo sin `applied.engine_sha256` → `REJECT`.

### F8 — el documento describe el artefacto de la ronda 1 · **medium**
`docs/manifestos/CANARY_JIT_CONTRACT_20261111.md` (24.513 B, sha256 `998f1ae4…`, sin tocar)

**Problema.** El tercer entregable sigue documentando 25 fixtures y 21 códigos. Nueve líneas con cifras que ya no existen:

| Línea | Dice | Realidad medida |
|---|---|---|
| L62 | «Tabla de rechazos (**21 códigos**, todos ejercitados…)» | 23 códigos |
| L89 | «`declarados=21 ejercitados=21`» | `declarados=23 ejercitados=23` |
| L305 | «PASS declarados=21 ejercitados=21» | `PASS declarados=23 ejercitados=23` |
| L307 | «`fixtures: 25 \| PASS 25 \| FAIL 0`» | `fixtures: 54/54 PASS  (FAIL 0)` + `total: 89/89` |
| L312 | «El validador ejecuta **25 fixtures**» | 54 fixtures |
| L318 | «devuelve `fixtures: 25 \| PASS 24 \| FAIL 1`» | `fixtures: 53/54 (FAIL 1)` + `coherencia 24/25` + `total: 87/89` |
| L334 | mismo literal obsoleto | ídem |
| L359 | «los **21 códigos**» | 23 |
| L363 | «los **25 fixtures** como casos de regresión» | 54 |

**Por qué importa, y no es cosmético:** L328 dice literalmente «Salida literal de ese control negativo». Un operador o un revisor que siga el documento comprueba el gate contra un número que ya no se produce y no puede distinguir si el gate cambió o si el documento miente. Es exactamente la clase «declarado ≠ medido» que este equipo audita —y el documento es el artefacto que un humano lee para confiar en el gate.

**Corrección exigida.** Regenerar L307-L335 con la salida vigente (positivo y negativo, con las tres secciones y el `total:`), y actualizar L62/L89/L305/L312/L359/L363 a 23 códigos y 54 fixtures. El comando de L324-325 **no cambia**: lo ejecuté y sigue siendo correcto — exit 1 y `RESULT=FAIL`.

---

## 9. Lo que está bien y no hay que tocar

1. **La regla genérica es real.** `walkRequiredFields` (`L254-300`) lee los niveles del JSON del contrato; no hay lista de obligatorios duplicada en el código. Lo verifiqué por la vía dura: derivé los 50 paths **del contrato** y el gate los exige, salvo el que F7 documenta.
2. **`load-bearing` es la mejor pieza añadida.** No se limita a pasar el fixture: borra el campo del recibo **y del contrato** y comprueba que la decisión cambia. `output.level` sale honestamente como `REDUNDANTE_COVERED_BY:E_LEVEL_RESOLUTION_IMPOSSIBLE` en vez de fingir ser imprescindible — declarar una redundancia es más útil que esconderla.
3. **Los controles negativos de fixture** (`[28]`, `[50]`, `[52]`): un recibo que debe ACEPTAR junto a cada par que debe RECHAZAR. Sin ellos un gate puede estar rechazándolo todo y parecer perfecto.
4. **El cierre de `output.bitrate_bps`** que t8 encontró por su cuenta —no estaba en mi informe de ronda 1— es un fail-open real que yo no había visto: sin el campo declarado, la guarda de bitrate era indecidible. Buen hallazgo del autor.
5. **Nada de la ronda 1 se rompió.** Los 5 probes de `engine_sha256`, los 5 de triple estado y los 5 de evasión: los 15 dan el resultado correcto.

---

## 10. Autoauditoría del veredicto (`metacog_audit`)

Primera pasada sobre 7 fragmentos: `MIXTO`, 2 `NO_SOPORTADO` (los conteos «en las cinco sondas» y «los 50 paths» sin artefacto atribuido en el mismo fragmento). Degradé la redacción para que cada fragmento llevase su `ruta:línea` y reejecuté:

```
veredicto: SOPORTADO | fragmentos 7 | soportados 7 | no_soportados 0 | contradichos 0
evidencia_sin_artefacto 0
```

Estado final: control positivo, control negativo, cobertura 23/23, evasiones cerradas, el barrido 49/1, el hueco `applied.engine_sha256` y el desfase del documento — los siete **SOPORTADO**.

Hallazgo de la herramienta que incorporo: `ETIQUETA_MAL_LEIDA:exit_cero_leido_como_evento_ocurrido`. Aplica al §2.1: **el exit 0 no prueba que el gate haga su trabajo**. Por eso todo el documento cita la línea de salida concreta y, en el caso del control negativo, el cambio de decisión del fixture `[14]`.

---

## 11. Cumplimiento de los criterios de aceptación

| Criterio | Resultado | Evidencia |
|---|---|---|
| Ejecutar el validador y reproducir control positivo y negativo con exit codes literales | **PASS** | §2.1 (`EXITCODE=0`, `total: 89/89`) y §2.2 (`EXITCODE=1`, `total: 87/89 \| fallos: 2`), ambos ejecutados por mí |
| Cada código de rechazo con al menos un fixture; nombrar los que no | **PASS** | §3: 23/23, `declarados_sin_fixture=0`, `ejercitados_no_declarados=0`, por set diff propio sobre 54 `push()`. **Ninguno sin fixture** |
| El contrato no puede expresar un estado que deje pasar una degradación no autorizada | **PASS** | §5: barrido de los 50 paths → 0 evasiones por omisión; compuesto de t7 → `REJECT E_POLICY_PIN_MISMATCH`; sonda `H2` → `REJECT E_DEGRADATION_UNAUTHORIZED` |
| `engine_sha256` obligatorio, sha no desplegable rechazado de plano, sin estado intermedio | **PASS** | §6: 6 formas, todas `REJECT E_ENGINE_SHA_UNVERIFIED` salvo la normalización legítima |
| Los tres estados no se colapsan y ninguna sección los fusiona | **PASS** | §7: 5 variantes → `REJECT E_STATE_COLLAPSED` |
| Auditar el veredicto con `metacog_audit` y degradar los `NO_SOPORTADO` | **PASS** | §10: `MIXTO` → redacción degradada → `SOPORTADO` 7/7 |
| No modificar los tres entregables | **PASS** | §1: hashes `488b8760` / `74290956` / `998f1ae4` idénticos a los declarados; `git status` sólo añade este informe |

**Los 7 criterios literales pasan.** El veredicto es `needs_revision` por F7 y F8, que son defectos reales del entregable pero no están en la lista de criterios: F7 rompe la invariante «todo obligatorio declarado se exige» y F8 rompe «lo declarado coincide con lo medido». Un `pass` con dos findings abiertos sería una contradicción; y `reject` sería desproporcionado, porque el gate hace lo que promete y la propiedad fail-closed se sostiene.

---

## 12. Veredicto

**`needs_revision`** — dos correcciones, ambas de minutos:

- **F7 (high):** quitar `applied.engine_sha256` de `gate_precedence` o exigirlo en el gate del motor; y aplicar a `gate_precedence` la misma prueba `load-bearing` que ya se aplica a `guard_map`. Ese segundo punto es el que evita que la clase vuelva por otro path: **hoy el autochequeo mira en una sola dirección, y por eso da `PASS` con el hueco abierto.**
- **F8 (medium):** actualizar las 9 líneas del documento con la salida vigente (54 fixtures, 23 códigos, `total: 89/89` y el negativo con `total: 87/89 | fallos: 2`).

Lo demás está cerrado y verificado: F1–F6 sin excepción, los 7 criterios literales en PASS, y el barrido exhaustivo de 50 campos confirma que **el contrato ya no acepta un recibo que oculte una degradación no autorizada**.

**No modifiqué los tres entregables.** Las correcciones son del autor.
