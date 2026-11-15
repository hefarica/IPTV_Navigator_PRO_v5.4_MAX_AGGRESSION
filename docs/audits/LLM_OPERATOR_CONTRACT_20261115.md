# Contrato del operario LLM — qué ve, qué emite, cadencia, sutileza, reversión y auditoría

**Fecha:** 2026-11-15 · **Autor:** realtime-architect (t82) · **Estado:** contrato **especificado y validado**, **NO implementado**
**Entregables:** [`contracts/llm_operator_v1.json`](../contracts/llm_operator_v1.json) (108.128 B, `sha256 aa8e5ce4…a5f53`) + este documento.
**Hereda de t81** (leído antes de diseñar, no re-inventado): [`contracts/llm_operator_knobs_v1.json`](../contracts/llm_operator_knobs_v1.json) — 185.609 B, `sha256 4b8ac25b…5f1dd` · **90 perillas**, 131 en lista negra, 28 muertas, 17 no disponibles, 7 etiquetas de estructura.
**Fuera de alcance:** implementación, código de producción, VPS, listas servidas. **No se tocó nada de eso.**

---

## 0. Veredicto en ocho líneas

1. **El operario puede emitir hoy 66 de las 90 perillas** — no las 90. Quedan **24 bloqueadas** por falta de materia prima del propio catálogo: **23 enums sin vocabulario declarado** y **1 objeto JSON con el valor truncado** (`com.ape.network_resilience`). Una perilla que no se puede validar **no se habilita**: §9.
2. **Hoy no podría emitir NINGÚN cambio legal**, porque falta `levers_now`: el APK publica `levers` como objeto **vacío** (`StatePublisher.kt:41`). Sin valor actual no hay delta calculable, solo una intención → `E_NO_EVIDENCE`. **Esa es la primera pieza a construir.**
3. **Ve más de lo que se cree y menos de lo que se promete.** Existen HOY: buffer del player, frames descartados, bitrate real medido, fps, captura (luma/lap/motion/fps/freeze_ms/stalls). **No existen**: tiempo hasta primer frame, contador de rebuffer, y el **estado de las perillas**. §1.
4. **El capturador no ve el VPP.** Captura el frame compuesto **antes** del post-proceso y del HDMI: sirve para congelación/fps/movimiento/nitidez aparente, **no** para certificar mejora del SoC. Afirmarlo sería el falso positivo que el repo ya documentó. §1.3.
5. **Emite una sola forma: un objeto con deltas del catálogo.** Sin texto libre, sin ficheros, sin comandos — no porque se prohíba, sino porque **el esquema no tiene forma de expresarlos**. Y **no declara `from`**: el valor actual lo pone el servidor. §2.
6. **Cadencia: 15 s (APK) y 30 s (VPS)**, derivadas de `periodo ≥ 1,25 × tiempo_muerto` con los términos medidos (500 ms de muestreo, p95 de fetch 1.251 ms, `max-age` 2/5 s, timeout LLM 2.000 ms). Por debajo del tiempo muerto el lazo **oscila por aritmética**, no por opinión. §3.
7. **La reversión no la decide el LLM: la decide un juez determinista** con bandas muertas numéricas, y como máximo una vuelta después. El que propone no puede ser el juez. §5.
8. **La latencia separa dos mundos:** decidir por **lookup** cabe en **≤2 µs** (y el camino entero en **p99 2,79–4,46 ms**, medido); decidir por **LLM no cabe nunca** (timeout declarado **2.000 ms = 400×** el presupuesto); **aplicar** en el VPS espera a la siguiente recarga (**≥2.000 ms**). El LLM fija la política; el camino de 5 ms la ejecuta. §7.

---

## 1. Qué VE el operario en cada vuelta

### 1.1 Fuentes que existen HOY (con archivo:línea, no con supuestos)

| Fuente | Qué es | Frescura | Evidencia |
|---|---|---|---|
| `buffer_ms` | buffer del **player** (`totalBufferedDuration`), nunca el modelo del daemon | ≤10 s | `ApePlayer.kt:458` · `DeviceSampler.kt:116` |
| `frame_drop_count` | frames descartados vía `AnalyticsListener` | ≤30 s | `ApePlayer.kt:467-469` · `DeviceSampler.kt:132` |
| `bitrate_bps` | bitrate **real** medido por el guard (bytes del DataSource) | ≤15 s | `DeviceSampler.kt:141-143` · `BitrateGuard.kt` |
| `fps_declared` | fps del track en reproducción | ≤30 s | `DeviceSampler.kt:126` |
| `pm_thermal_status`, `ram_available_pct`, `ai_sr` | térmica, RAM, capacidad AI-SR **sondeada** | 60 s / 10 min | `DeviceSampler.kt:100-111,153-160` |
| `capture.freeze_ms`, `.fps`, `.luma`, `.lap`, `.motion`, `.frame_gap_ms`, `.stalls` | clasificador del capturador | ≤2 s | `ScreenCaptureService.kt:153` → `StatePublisher.kt:45-52` |

**Ritmo del capturador:** publica como máximo **1 muestra cada 500 ms** (`StatePublisher.kt:31`). Eso fija la granularidad mínima de observación y, con ella, la cadencia (§3).

### 1.2 Fuentes que NO existen hoy — sin maquillaje

| Fuente | Estado | Por qué |
|---|---|---|
| **`levers_now`** (estado actual de las perillas) | **NO** | `StatePublisher.kt:41` publica `levers` como `JSONObject()` **vacío**. `SettingsCatalog.kt` solo declara **qué claves existen**, no sus valores |
| **`first_frame_ms`** (tiempo hasta primer frame) | **NO** | el hook `onRenderedFirstFrame` existe (`ApePlayer.kt:115`) pero **solo loguea y limpia un flag de trial**: no mide latencia |
| **`rebuffer_count` / `rebuffer_total_ms`** | **NO** | hay un **watchdog de stall a 3.500 ms** que además auto-desactiva efectos (`ApePlayer.kt:422-452`), pero **no hay contador de episodios ni tiempo total** |
| `cpu_temp_c`, `gpu_load_pct`, `vpu_load_pct` | **NO por diseño** | `DeviceSampler.kt:148-151`: ADB-only; se declaran `unavailable`, **nunca un 0 falso** |

**Consecuencia dura:** el contrato exige `levers_now` para **cualquier** delta (`min_required_for_any_change`). Hoy, con el payload actual, **todo cambio legítimo sería rechazado con `E_NO_EVIDENCE`**. El contrato está listo; la materia prima no. Eso es un hecho, no una interpretación: el harness lo prueba con el caso *«RECHAZA sin levers_now»* (§9).

### 1.3 El límite del capturador, dicho con la evidencia del repo

| Puede ver | No puede ver |
|---|---|
| congelación (`freeze_ms`), fps efectivos, movimiento, luminancia media, proxy de nitidez (varianza laplaciana) | **el efecto del VPP del SoC** (sharpness/denoise/AI-SR) y **la salida HDMI final** |

Evidencia: `screencap` captura el buffer de composición **antes** del post-proceso VPP y **antes** del HDMI — `VPP_SOC_QUALITY_20261114.md:68`, `SEGMENT_PROXY_FIX_20261114.md:66-68`.

→ El operario **puede afinar lo que se ve en el frame compuesto**; **no puede certificar** una mejora del VPP con el capturador. Su bucle de imagen es útil y es ciego a la última milla.

---

## 2. Qué EMITE

**Una sola forma, por vuelta:** un objeto JSON. Nunca texto libre, nunca un fichero, nunca un comando.

```json
{ "round_id": "rnd-0001-abc",
  "schema_version": "ape.llm.operator.output/1",
  "side": "vps",
  "decision": { "kind": "change",
    "deltas": [{ "knob": "X-Prefetch-Segments", "to": 9,
                 "reason_code": "BUFFER_BELOW_FLOOR",
                 "metric": "buffer_ms",
                 "expect": { "direction": "increase", "deadband": 100 } }] } }
```

| Decisión | Forma | Cuándo |
|---|---|---|
| `change` | 1–5 deltas (tope por lado: **3 VPS / 5 APK**) | hay trigger y evidencia |
| `abstain` | `reason_code` de una lista cerrada | no cambiar **es** una decisión válida, y se registra |
| `revert` | `revert_of` = `decision_id` anterior | devuelve un cambio que el juez declaró dañino |

**Tres garantías estructurales, no retóricas:**

1. **`reason_code`, `metric`, `expect.direction` son enums cerrados**: el operario **elige de una lista**, no redacta. No hay campo de texto libre en el esquema.
2. **El delta NO lleva `from`.** El valor actual lo inyecta el servidor desde `levers_now`. El operario **no puede mentir sobre el estado** — y el harness lo prueba rechazando un delta que intenta declararlo (`E_SCHEMA`, caso 5 de §9).
3. **`additionalProperties: false`** en los tres niveles: una clave inventada es `E_SCHEMA`.

---

## 3. Cadencia: por qué 15 s y 30 s (y no «inmediato»)

| Lado | Periodo de vuelta | Máx. deltas/vuelta | Cooldown misma perilla |
|---|---|---|---|
| **APK** | **15.000 ms** | 5 | 1 vuelta |
| **VPS** | **30.000 ms** | 3 | 2 vueltas |

**Derivación (`periodo ≥ 1,25 × tiempo_muerto`), con los términos medidos:**

| Término | Valor | Fuente |
|---|---|---|
| Muestreo del capturador | **500 ms** (una muestra como máximo) | `StatePublisher.kt:31` |
| Efecto visible en buffer | **4 s** (2 fetches al p95: 2 × 1.251 ms) | t75 p95 segmento |
| Recarga de manifest (VPS) | **2 s** media / **5 s** master | `max-age` del motor (t74 §6.1) |
| Llamada al LLM | **2.000 ms** (timeout declarado, no medido) | §7 |

```
APK : 0,5 s + 4 s + 2 s = 6,5 s  ->  ×1,25 = 8,1 s  ->  se publica 15 s (2 ventanas de evidencia)
VPS : 5 s + 4 s + 2 s   = 11 s   ->  ×1,25 = 13,75 s ->  se publica 30 s (2 vueltas)
```

> **La regla que importa, y es aritmética:** si el periodo baja del tiempo muerto, se actúa antes de poder ver el resultado del cambio anterior. **Un lazo que corrige más rápido de lo que puede observar oscila** — no por prudencia, por inestabilidad del lazo.

**Topes que se derivan de ahí:** `max_writes_per_minute` **6 (VPS) / 20 (APK)**; `max_changes_per_knob_per_minute` **1 / 4**; `max_changes_per_knob_per_hour` **10 / 30**; elevación de perfil **≤1 cada 10 min**.

**Disparadores que pueden adelantar una vuelta** (nunca saltarse cooldowns ni topes): `FREEZE_DETECTED` (`freeze_ms > 0`), `BUFFER_BELOW_FLOOR` (`buffer_ms < 4.000`), `ZAP`, `FALLBACK`. Suelo duro: **10.000 ms** (5.000 en ZAP).

**Paradas declaradas:** 3 rechazos consecutivos → `E_OPERATOR_HALTED`; presupuesto agotado → se sigue con la última política (`E_BUDGET`).

---

## 4. Límite de sutileza: cuánto puede mover, y qué pasa si se pasa

Del catálogo (heredado, no reinterpretado): **fracción 25 %** del valor actual · **absoluto 1 unidad** · **discreto** un salto a un valor válido · **por subcampo 25 %** cada numérico. Duplicar un valor exige **≥4 pasos**.

| Escala | Límite | Ejemplo real |
|---|---|---|
| Por paso y perilla | 25 % o 1 unidad según el catálogo | `retryBackoffMs 500→600` (+20 %) ✅ · `500→900` (+80 %) ❌ `E_STEP_TOO_LARGE` |
| Por vuelta | 3 (VPS) / 5 (APK) | 4 deltas en VPS ❌ `E_CADENCE` |
| Misma perilla | 2 vueltas (VPS) / 1 (APK) | mover `X-Prefetch-Segments` dos vueltas seguidas ❌ |
| Por minuto y perilla | 1 (VPS) / 4 (APK) | — |
| Por hora y perilla | 10 (VPS) / 30 (APK) | — |
| **Si se pasa** | **se rechaza la vuelta COMPLETA** (atómica), se registra el código, **no se aplica nada** | una vuelta a medias hace imposible atribuir el resultado |

**Objetos JSON:** sus claves son **las que el catálogo midió**; solo sus numéricos se mueven (25 %), los booleanos exigen recibo y los sub-campos de tipo objeto **no son validables** → `E_SUBFIELDS_UNKNOWN`. Un objeto no es una puerta trasera.

---

## 5. Reversión: quién decide que empeoró, y cuánto tarda

**El que propone no puede ser el juez.** Decide un **evaluador determinista** que compara la métrica **declarada antes del cambio** contra la ventana de verificación.

| Elemento | Valor |
|---|---|
| Ventana de verificación | **15 s** (APK) · **30 s** (VPS) — una vuelta |
| Bandas muertas (revierten) | buffer **cae >1.000 ms** · `freeze_ms > 0` · `frame_drop_count` **+10 %** · fps medidos **−5 %** |
| **No** dispara reversión | `bitrate_bps` (puede caer por el proveedor, no por el cambio): se registra como diagnóstico |
| Autoridad | el **juez** revierte por código; si el LLM discrepa y propone revertir, se registra, y **gana el juez** |
| Latencia máxima de reversión | **≤15 s** (APK) · **≤35 s** (VPS = vuelta + recarga) |
| La reversión cuenta como paso | **sí** |
| Anti-oscilación | **2 reversiones consecutivas** de la misma perilla → congelada **30 min** (`E_REVERSAL_LOOP`) |
| Tras revertir | vuelve **exactamente** al valor anterior auditado y queda marcada como no-tocar hasta que cambie la evidencia |

---

## 6. Rastro de auditoría: sin esto no se sabe si mejoró

JSONL **append-only**, un registro por delta aplicado y uno por vuelta rechazada. Campos obligatorios:

```
decision_id · round_id · ts · device_id · channel_id · side · knob · from · to
reason_code · metric · metric_value · metric_unit · expect_direction · expect_deadband
evidence_refs · llm_model · llm_tokens_out · llm_latency_ms · llm_timeout_hit
validation_ok · validation_code · applied_at · readback · readback_ok
verify_window_ms · observed_value · outcome · revert_of
```

**Cuatro reglas que lo hacen auditable de verdad:**

1. **`outcome ∈ {improved, neutral, worsened, unverified}`** y **sin ventana de verificación completa el resultado es `unverified`, nunca `improved`.**
2. **`readback_ok` obligatorio**: un cambio sin lectura de vuelta **no cuenta como aplicado** (`E_NO_RECEIPT`).
3. **Cota de tamaño + rotación** (64 MB, 30 días): la lección de `misses.log`, que crece sin límite.
4. **`from` y `to` juntos**: permite reconstruir la trayectoria de cada perilla sin depender de la memoria del modelo.

---

## 7. Presupuesto de latencia: qué puede ser <5 ms y qué no puede serlo nunca

| Pieza | Coste | ¿Cabe en 5 ms? | Evidencia |
|---|---|---|---|
| **Decisión por lookup** (leer la política aprobada) | **≤2 µs p99** | **SÍ**, con 3 órdenes de margen | `Map.get` 121–174 ns · APCu 0,000 ms · SQLite 0,0029 ms |
| **Camino caliente completo** (lookup + cabeceras + 1ª línea) | **p99 2,79–4,46 ms** (p50 0,97–1,76) | **SÍ**, margen 1,1×–1,8× en p99 | t74, 3 corridas |
| **Decisión por LLM** | **timeout declarado 2.000 ms** (p50 no medido) | **NO — 400×** | contrato §11 de t74 |
| **Probe de calidad** | **1.653 ms p50** | **NO — 330,6×** | t75 |
| **Aplicación APK** (`settings put` + `get`) | inmediata, **fuera** del camino; coste **NO COMPUTADO** | n/a (no toca el camino) | `SettingsApplier.kt` |
| **Aplicación VPS** | **≥2.000 ms** (media) / **≥5.000 ms** (master) | **NO — 400×–1.000×** | `max-age` del motor |

**La consecuencia de diseño, en una línea:** el LLM **fija la política** (fuera del camino); el **camino de 5 ms la ejecuta**. Nunca al revés — y por eso la latencia del LLM es **irrelevante por construcción**, aunque su timeout se declare igual.

---

## 8. Cómo se garantiza que NO puede tocar estructura

**Dónde se valida:** en **un solo punto de escritura**, antes de aplicar — el servidor (pasos 1–16 del pipeline) y, en el lado APK, el aplicador de settings. No en el prompt: el prompt no es una barrera.

| Validación | Qué bloquea | Código |
|---|---|---|
| **Esquema cerrado** (`additionalProperties:false`, sin campo de texto/fichero/comando) | la petición entera | `E_SCHEMA` |
| **Allowlist de 90** (heredada por sha256 del catálogo) | cualquier nombre fuera | `E_NOT_A_KNOB` |
| **Lista negra (131)** por clase: `structure_declaration` 12 · `hdr_declaration` 41 · `codec_family` 13 · `media_feature` 25 · `device_fact` 12 · `identity_anti_cache` 15 · `declared_other` 13 | declaraciones de la fuente | `E_NOT_A_KNOB` |
| **Invariantes** (`X-Concurrent-Downloads = 8`, SSOT) | subirlo | `E_INVARIANT_TOUCHED` |
| **7 etiquetas de estructura** (`#EXTINF`, `#EXT-X-STREAM-INF`, `#EXTSHIMOTT`, URL del canal, `#EXT-X-APE-PROFILE-TEMPLATE`, `#EXT-X-APE-LAB-METADATA`, código de la APK) | tocar la lista | `E_STRUCTURE_TOUCHED` |
| **Guard de forma del valor** (`/`, `\`, `://`, `;`, `$(`, backtick, salto de línea, `file:`, `cmd:`) | colar una ruta o un comando **por el valor** | `E_STRUCTURE_TOUCHED` |
| **Guard de código APK** (sha256 del árbol `.kt/.java/.gradle` + `git status`) | tocar la app | `E_APK_CODE_TOUCHED` |
| **Techo de la ley** | bajar `RESOLUTION`/`CODECS`/fps/bitrate, apagar HDR, ABR downshift, caer a F5 | `E_KNOB_DEGRADATION` / `E_PROFILE_DOWNGRADE` |

**Si lo intenta:** `apply: false`, se registra con su código, se alerta al operador, y **a los 3 intentos en 24 h el operario queda detenido** (`E_OPERATOR_HALTED`).

**La razón por la que esto es estructural y no una lista de buenas intenciones:** el idioma de salida **no tiene sustantivos** para «fichero», «ruta», «comando» o «parche». El operario no puede pedir lo que no puede nombrar; y lo que nombre fuera de la allowlist no tiene traductor.

---

## 9. La verificación (lo que se ejecutó, no lo que se promete)

Harness de referencia contra el **propio contrato** (reglas leídas del JSON, no duplicadas):

```
node <harness>   ->  === INTEGRIDAD ===  allowlist_set_equality_vs_t81: true
                                        blacklist_set_equality_vs_t81: true
                                        inherits_knobs_sha_ok: true
                                        codes_used_all_declared: true
                     === CASOS (24) ===  24 PASS · 0 FAIL
                     === COBERTURA ===   total 90 · movable_now 66 · blocked_now 24
                                         vps 55/79 · apk 11/11
```

| Grupo de casos | Resultado |
|---|---|
| Aceptan (4): prefetch 8→9, retryBackoff 500→600, delta APK discreto, abstenerse | **OK** |
| Rechazan por forma (4): clave `from` inventada → `E_SCHEMA`; `#EXTINF` → `E_STRUCTURE_TOUCHED`; `PlayerActivity.kt` → `E_APK_CODE_TOUCHED`; valor `/etc/passwd` → `E_STRUCTURE_TOUCHED` | **código exacto** |
| Rechazan por política (6): invariante, lista negra, rango, paso, dirección, perfil P3→P4 | **código exacto** |
| Rechazan por cadencia/evidencia (7): 4 deltas VPS, lado equivocado, métrica inexistente, métrica stale, sin `levers_now`, cooldown, sin recibo | **código exacto** |
| Rechazan por catálogo incompleto (3): `com.ape.network_resilience` truncado, subcampo inventado, enum sin vocabulario | **código exacto** |

**Cobertura honesta:** de las 90 perillas del catálogo, **66 son movibles hoy** (55 VPS + 11 APK) y **24 están bloqueadas** por el propio catálogo — 23 enums sin vocabulario (`X-AI-SR-*`, `X-Detail-*`, `X-LCEVC-*`, `X-Failover-Enabled`, …) y 1 objeto con el valor truncado. **Una perilla que no se puede validar no se habilita.**

---

## 10. Ledger de honestidad y preguntas abiertas

| Afirmación | Estado |
|---|---|
| 90 perillas, 131 en lista negra, 7 etiquetas de estructura, 28 muertas, 17 no disponibles | **CITADO** de t81 (`sha256 4b8ac25b…5f1dd`) y **verificado por igualdad de conjuntos** en el harness |
| `levers_now` no existe hoy (payload vacío) | **MEDIDO** en `StatePublisher.kt:41` |
| `first_frame_ms` y `rebuffer_count` no existen | **MEDIDO** en `ApePlayer.kt:115` y `422-452` |
| El capturador no ve el VPP | **CITADO** de dos auditorías independientes del repo |
| Cadencia 15 s / 30 s | **DERIVADA** de términos medidos + un criterio de estabilidad declarado; **no medida en reproducción real** |
| Bandas muertas de reversión (1.000 ms, +10 %, −5 %) | **DECISIÓN** de ingeniería, no medida: los valores exactos hay que calibrarlos con serie real |
| Coste de aplicar una perilla (APK o VPS) | **NO COMPUTADO** |
| Latencia p50 de la llamada al LLM | **NO COMPUTADO** — solo se declara su timeout |
| Mejora de imagen atribuible a un cambio | **NO COMPUTABLE con el capturador** (no ve VPP ni HDMI) |

**Preguntas para el operador (3):**
1. ¿El juez de reversión vive en el mismo VPS que aplica, o en un proceso separado que solo escribe el veredicto?
2. ¿Se acepta el presupuesto de **60 llamadas/hora/canal**? Es el único límite económico medible sin precio del proveedor.
3. ¿Un canal `NOT_MEASURABLE` (403/406/407) admite vueltas del operario, o queda congelado hasta que haya medida?

---

## Anexo — Reproducir

```bash
# 1) integridad del contrato y de lo que hereda
node -e "const c=require('./contracts/llm_operator_v1.json');console.log(c.inherits,c.coverage,c.cadence.round_period_ms)"

# 2) validacion de referencia (24 casos): exige 24 PASS y 0 FAIL.
#    El validador completo esta en el Anexo A de este documento: copiarlo a /tmp/validate.mjs
node /tmp/validate.mjs

# 3) la lista negra sigue siendo la de t81 (no se toco)
sha256sum contracts/llm_operator_knobs_v1.json   # 4b8ac25b9d3b47ec39ca480990df811699213c2de781e309a22eba295f45f1dd
```

**Estado del artefacto:** `SPECIFIED_NOT_IMPLEMENTED`. El contrato y su validador de referencia existen y pasan; **lo que falta para que el operario pueda actuar es `levers_now`** — sin estado actual no hay delta, y sin delta no hay operario.

---

## Anexo A — El validador de referencia (código completo)

Se ejecutó tal cual contra `contracts/llm_operator_v1.json`: **24 PASS · 0 FAIL**, integridad `true` en las 4 comprobaciones, cobertura **66/90 movibles**. Se incluye aquí para que la verificación sea reproducible sin depender de esta sesión.

```js
import fs from 'node:fs';
import crypto from 'node:crypto';

const C_PATH = 'contracts/llm_operator_v1.json';
const K_PATH = 'contracts/llm_operator_knobs_v1.json';
const C = JSON.parse(fs.readFileSync(C_PATH, 'utf8'));
const K = JSON.parse(fs.readFileSync(K_PATH, 'utf8'));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const KNOBS = new Map(C.knob_policy.knobs.map((k) => [k.name, k]));
const BLACK = new Set(C.structure_protection.blacklist.names);
const INVAR = new Set(C.structure_protection.invariants.map((i) => i.name));
const DEAD = new Set(C.structure_protection.known_non_writable.dead_excluded.names);
const NOTAVAIL = new Set(C.structure_protection.known_non_writable.not_available.names);
const SOURCES = new Map(C.see.sources.map((s) => [s.name, s]));
const CODES = new Set(Object.keys(C.validation.codes));
const RANK = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 };
const STRUCT_TAG_MARKERS = C.structure_protection.structure_tags.map((t) => t.tag.toLowerCase());
const STRUCT_PATTERNS = [['/', 'path'], ['\\', 'path'], ['://', 'url'], ['\n', 'newline'], ['\r', 'newline'], [';', 'command'], ['$(', 'command'], ['`', 'command'], ['file:', 'uri'], ['cmd:', 'uri']];
const APK_CODE_RE = /\.(kt|kts|java|gradle)$/i;

function validate(output, ctx) {
  const fail = (step, code, detail) => ({ ok: false, step, code, detail });
  const side = output.side;
  const deltaList = output.decision && output.decision.deltas ? output.decision.deltas : [];

  /* 1 — SCHEMA sobre lo que emite el LLM (additionalProperties:false en todo) */
  const allowedTop = new Set(['round_id', 'schema_version', 'side', 'decision']);
  for (const k of Object.keys(output)) if (!allowedTop.has(k)) return fail(1, 'E_SCHEMA', 'clave no declarada: ' + k);
  if (output.schema_version !== C.emit.schema_version) return fail(1, 'E_SCHEMA', 'schema_version');
  if (!/^[A-Za-z0-9_.:-]{8,64}$/.test(output.round_id || '')) return fail(1, 'E_SCHEMA', 'round_id');
  if (!['vps', 'apk'].includes(side)) return fail(1, 'E_SCHEMA', 'side');
  const kind = output.decision && output.decision.kind;
  if (!['change', 'abstain', 'revert'].includes(kind)) return fail(1, 'E_SCHEMA', 'decision.kind');
  const allowedDelta = new Set(['knob', 'to', 'reason_code', 'metric', 'expect', 'proposed_profile']);
  if (kind === 'change') {
    if (!deltaList.length) return fail(1, 'E_SCHEMA', 'deltas vacio');
    const maxD = C.cadence.max_deltas_per_round[side];
    if (deltaList.length > maxD) return fail(13, 'E_CADENCE', `deltas=${deltaList.length} > max_deltas_per_round[${side}]=${maxD}`);
    for (const d of deltaList) for (const k of Object.keys(d)) if (!allowedDelta.has(k)) return fail(1, 'E_SCHEMA', 'clave no declarada en delta: ' + k);
  }

  for (const d of (kind === 'change' ? deltaList : [])) {
    const knob = KNOBS.get(d.knob);
    /* 3/4/5/6 — nombres fuera de la superficie, en el orden del contrato */
    if (!knob) {
      const low = String(d.knob).toLowerCase();
      if (INVAR.has(d.knob)) return fail(4, 'E_INVARIANT_TOUCHED', d.knob);
      if (STRUCT_TAG_MARKERS.some((t) => low === t || low.startsWith(t))) return fail(5, 'E_STRUCTURE_TOUCHED', 'etiqueta de estructura: ' + d.knob);
      if (APK_CODE_RE.test(d.knob)) return fail(6, 'E_APK_CODE_TOUCHED', d.knob);
      if (BLACK.has(d.knob) || DEAD.has(d.knob) || NOTAVAIL.has(d.knob)) return fail(3, 'E_NOT_A_KNOB', d.knob);
      return fail(3, 'E_NOT_A_KNOB', d.knob);
    }
    /* 2 — lado */
    if (knob.side !== side) return fail(2, 'E_SIDE_MISMATCH', `${d.knob} es side=${knob.side}, la vuelta es ${side}`);

    /* 5 — guard de forma del VALOR (estructura por la puerta del valor) */
    const to = d.to;
    const asText = typeof to === 'string' ? to : JSON.stringify(to);
    for (const [pat, why] of STRUCT_PATTERNS) if (asText.includes(pat)) return fail(5, 'E_STRUCTURE_TOUCHED', `valor contiene ${why}: ${pat}`);

    /* 7 — tipo */
    if (knob.type === 'int' || knob.type === 'decimal') {
      if (typeof to !== 'number' || !Number.isFinite(to)) return fail(7, 'E_TYPE', d.knob);
    } else if (knob.type === 'json-object') {
      if (typeof to !== 'object' || to === null || Array.isArray(to)) return fail(7, 'E_TYPE', d.knob);
      if (knob.sub_fields_status !== 'DERIVED_FROM_MEASURED' || !knob.sub_fields) return fail(7.5, 'E_SUBFIELDS_UNKNOWN', d.knob + ' (catalogo truncado)');
      for (const [sk, sv] of Object.entries(to)) {
        const t = knob.sub_fields[sk];
        if (!t) return fail(7.5, 'E_SUBFIELDS_UNKNOWN', `sub-campo no declarado: ${sk}`);
        if (t === 'object') return fail(7.5, 'E_SUBFIELDS_UNKNOWN', `sub-campo objeto no validable: ${sk}`);
      }
    } else if (knob.type === 'int-list') {
      if (!(Array.isArray(to) && to.every((x) => Number.isFinite(x)))) return fail(7, 'E_TYPE', d.knob);
    } else {
      if (typeof to !== 'string') return fail(7, 'E_TYPE', d.knob);
    }

    /* 8 — rango */
    const numeric = typeof to === 'number';
    if (numeric && knob.safe_min !== null && to < knob.safe_min) return fail(8, 'E_KNOB_RANGE', `${to} < ${knob.safe_min}`);
    if (numeric && knob.safe_max !== null && to > knob.safe_max) return fail(8, 'E_KNOB_RANGE', `${to} > ${knob.safe_max}`);

    /* 9 — techo real */
    if (numeric && knob.ceiling && Number.isFinite(knob.ceiling.value) && to > knob.ceiling.value) return fail(9, 'E_ABOVE_CEILING', `${to} > techo ${knob.ceiling.value}`);

    /* 10 — sutileza: el valor actual lo pone el SERVIDOR */
    const from = ctx.levers_now ? ctx.levers_now[d.knob] : undefined;
    if (from === undefined && !(ctx.levers_now && d.knob in ctx.levers_now)) return fail(14, 'E_NO_EVIDENCE', 'falta levers_now para ' + d.knob);
    const st = knob.step || {};
    if (numeric && typeof from === 'number') {
      if (st.type === 'fraction') {
        const cap = Math.abs(from) * C.subtlety.caps.fraction_of_current;
        if (Math.abs(to - from) > cap + 1e-9) return fail(10, 'E_STEP_TOO_LARGE', `|${to}-${from}|=${Math.abs(to - from)} > 25% de ${from} = ${cap}`);
      } else if (st.type === 'absolute') {
        if (Math.abs(to - from) > C.subtlety.caps.absolute_units) return fail(10, 'E_STEP_TOO_LARGE', `|${to}-${from}| > 1 unidad`);
      }
    }
    if (st.type === 'discrete' || knob.type === 'enum') {
      if (!knob.allowed_values) return fail(14, 'E_NO_EVIDENCE', 'vocabulario no declarado en el catalogo: ' + d.knob);
      const vocab = String(knob.allowed_values).split('|');
      if (!vocab.includes(String(to))) return fail(10, 'E_STEP_TOO_LARGE', `valor fuera del vocabulario: ${to}`);
    }
    if (st.type === 'per_subfield' && typeof to === 'object' && to !== null) {
      const kk = K.knobs.find((x) => x.name === d.knob);
      let curObj = null;
      try { curObj = JSON.parse(String(kk && kk.value_measured).replace(/\\"/g, '"')); } catch (_) { curObj = null; }
      for (const [sk, sv] of Object.entries(to)) {
        if (typeof sv !== 'number') continue;
        const base = curObj && typeof curObj[sk] === 'number' ? curObj[sk] : null;
        if (base === null) return fail(14, 'E_NO_EVIDENCE', `sin valor actual del subcampo ${sk}`);
        if (Math.abs(sv - base) > Math.abs(base) * C.subtlety.caps.per_subfield + 1e-9) return fail(10, 'E_STEP_TOO_LARGE', `subcampo ${sk}: |${sv}-${base}| > 25%`);
      }
    }

    /* 11 — direccion */
    if (typeof from === 'number' && numeric) {
      const up = to > from, down = to < from;
      if (up && (knob.direction_prohibited || []).includes('up')) return fail(11, 'E_KNOB_DEGRADATION', d.knob + ' prohibe subir');
      if (down && (knob.direction_prohibited || []).includes('down')) return fail(11, 'E_KNOB_DEGRADATION', d.knob + ' prohibe bajar');
    }

    /* 12 — perfil: solo hacia arriba */
    if (d.proposed_profile) {
      const cur = ctx.current_profile || 'P3';
      if (RANK[d.proposed_profile] > RANK[cur]) return fail(12, 'E_PROFILE_DOWNGRADE', `${cur} -> ${d.proposed_profile}`);
    }

    /* 13 — cadencia: cooldown por perilla */
    if (ctx.last_moved_round && ctx.last_moved_round[d.knob] !== undefined) {
      const cd = C.cadence.cooldown_rounds_same_knob[side];
      const elapsed = ctx.round_index - ctx.last_moved_round[d.knob];
      if (elapsed < cd) return fail(13, 'E_CADENCE', `${d.knob}: faltan ${cd - elapsed} vueltas de cooldown`);
    }

    /* 14 — evidencia: la metrica citada debe existir HOY */
    const src = SOURCES.get(d.metric);
    if (!src) return fail(14, 'E_NO_EVIDENCE', 'metrica desconocida: ' + d.metric);
    if (!src.exists_today) return fail(14, 'E_NO_EVIDENCE', 'metrica no existe hoy: ' + d.metric);
    if (ctx.stale_metrics && ctx.stale_metrics.includes(d.metric)) return fail(14, 'E_NO_EVIDENCE', 'metrica stale: ' + d.metric);

    /* 15 — presupuesto */
    if ((ctx.llm_calls_this_round || 0) > C.budget.max_llm_calls_per_round) return fail(15, 'E_BUDGET', 'llamadas por vuelta');
  }

  /* 16 — recibo */
  if (ctx.no_receipt) return fail(16, 'E_NO_RECEIPT', 'sin readback del valor aplicado');
  return { ok: true, code: 'OK' };
}

/* ── Casos ──────────────────────────────────────────────────────────────── */
const out = (over) => Object.assign({ round_id: 'rnd-0001-abc', schema_version: C.emit.schema_version, side: 'vps', decision: { kind: 'change', deltas: [] } }, over);
const ctx = (over) => Object.assign({ levers_now: {}, round_index: 10 }, over);
const d = (knob, to, metric, extra) => Object.assign({ knob, to, reason_code: 'BUFFER_BELOW_FLOOR', metric, expect: { direction: 'increase', deadband: 100 } }, extra || {});

const cases = [
  ['ACEPTA prefetch 8->9 (absoluto 1, techo 16)',
    out({ decision: { kind: 'change', deltas: [d('X-Prefetch-Segments', 9, 'buffer_ms')] } }),
    ctx({ levers_now: { 'X-Prefetch-Segments': 8 } }), 'OK'],
  ['ACEPTA retryBackoff 500->600 (+20%)',
    out({ decision: { kind: 'change', deltas: [d('com.ape.network_resilience.retryBackoffMs', 600, 'capture.freeze_ms')] } }),
    ctx({ levers_now: { 'com.ape.network_resilience.retryBackoffMs': 500 } }), 'OK'],
  ['ACEPTA delta APK discreto (1080->2160)',
    out({ side: 'apk', decision: { kind: 'change', deltas: [d('display_mode_resolution', '2160', 'capture.fps')] } }),
    ctx({ levers_now: { display_mode_resolution: '1080' } }), 'OK'],
  ['ACEPTA abstenerse',
    out({ decision: { kind: 'abstain', reason_code: 'NO_TRIGGER' } }), ctx({}), 'OK'],
  ['RECHAZA clave "from" inventada (el LLM no declara el estado)',
    out({ decision: { kind: 'change', deltas: [Object.assign(d('X-Prefetch-Segments', 9, 'buffer_ms'), { from: 8 })] } }),
    ctx({ levers_now: { 'X-Prefetch-Segments': 8 } }), 'E_SCHEMA'],
  ['RECHAZA retryBackoff 500->900 (+80%)',
    out({ decision: { kind: 'change', deltas: [d('com.ape.network_resilience.retryBackoffMs', 900, 'buffer_ms')] } }),
    ctx({ levers_now: { 'com.ape.network_resilience.retryBackoffMs': 500 } }), 'E_STEP_TOO_LARGE'],
  ['RECHAZA prefetch 8->20 (fuera de rango)',
    out({ decision: { kind: 'change', deltas: [d('X-Prefetch-Segments', 20, 'buffer_ms')] } }),
    ctx({ levers_now: { 'X-Prefetch-Segments': 8 } }), 'E_KNOB_RANGE'],
  ['RECHAZA bajar X-Buffer-Target 20000->15000',
    out({ decision: { kind: 'change', deltas: [d('X-Buffer-Target', 15000, 'buffer_ms')] } }),
    ctx({ levers_now: { 'X-Buffer-Target': 20000 } }), 'E_KNOB_DEGRADATION'],
  ['RECHAZA X-Concurrent-Downloads (invariante)',
    out({ decision: { kind: 'change', deltas: [d('X-Concurrent-Downloads', 16, 'buffer_ms')] } }),
    ctx({ levers_now: {} }), 'E_INVARIANT_TOUCHED'],
  ['RECHAZA X-Resolution (lista negra)',
    out({ decision: { kind: 'change', deltas: [d('X-Resolution', '1280x720', 'fps_declared')] } }),
    ctx({ levers_now: {} }), 'E_NOT_A_KNOB'],
  ['RECHAZA #EXTINF (etiqueta de estructura)',
    out({ decision: { kind: 'change', deltas: [d('#EXTINF', 'x', 'buffer_ms')] } }),
    ctx({ levers_now: {} }), 'E_STRUCTURE_TOUCHED'],
  ['RECHAZA PlayerActivity.kt (codigo de la APK)',
    out({ decision: { kind: 'change', deltas: [d('PlayerActivity.kt', 'x', 'buffer_ms')] } }),
    ctx({ levers_now: {} }), 'E_APK_CODE_TOUCHED'],
  ['RECHAZA valor con ruta de fichero',
    out({ decision: { kind: 'change', deltas: [d('X-Live-Caching', '/etc/passwd', 'buffer_ms')] } }),
    ctx({ levers_now: { 'X-Live-Caching': 10000 } }), 'E_STRUCTURE_TOUCHED'],
  ['RECHAZA 4 deltas en lado VPS (max 3)',
    out({ decision: { kind: 'change', deltas: [
      d('X-Prefetch-Segments', 9, 'buffer_ms'), d('X-Parallel-Segments', 5, 'buffer_ms'),
      d('X-Buffer-Target', 24000, 'buffer_ms'), d('X-Live-Caching', 12000, 'buffer_ms')] } }),
    ctx({ levers_now: { 'X-Prefetch-Segments': 8, 'X-Parallel-Segments': 4, 'X-Buffer-Target': 20000, 'X-Live-Caching': 10000 } }), 'E_CADENCE'],
  ['RECHAZA perilla APK en vuelta VPS',
    out({ decision: { kind: 'change', deltas: [d('display_mode_hdr', '0', 'capture.fps')] } }),
    ctx({ levers_now: { display_mode_hdr: '1' } }), 'E_SIDE_MISMATCH'],
  ['RECHAZA degradar perfil P3->P4',
    out({ decision: { kind: 'change', deltas: [d('X-Prefetch-Segments', 9, 'buffer_ms', { proposed_profile: 'P4' })] } }),
    ctx({ current_profile: 'P3', levers_now: { 'X-Prefetch-Segments': 8 } }), 'E_PROFILE_DOWNGRADE'],
  ['RECHAZA metrica que NO existe hoy (rebuffer_count)',
    out({ decision: { kind: 'change', deltas: [d('X-Prefetch-Segments', 9, 'rebuffer_count')] } }),
    ctx({ levers_now: { 'X-Prefetch-Segments': 8 } }), 'E_NO_EVIDENCE'],
  ['RECHAZA metrica stale (buffer_ms viejo)',
    out({ decision: { kind: 'change', deltas: [d('X-Prefetch-Segments', 9, 'buffer_ms')] } }),
    ctx({ levers_now: { 'X-Prefetch-Segments': 8 }, stale_metrics: ['buffer_ms'] }), 'E_NO_EVIDENCE'],
  ['RECHAZA sin levers_now (delta no calculable)',
    out({ decision: { kind: 'change', deltas: [d('X-Prefetch-Segments', 9, 'buffer_ms')] } }),
    ctx({ levers_now: {} }), 'E_NO_EVIDENCE'],
  ['RECHAZA com.ape.network_resilience (catalogo truncado)',
    out({ decision: { kind: 'change', deltas: [d('com.ape.network_resilience', { retryCount: 6 }, 'buffer_ms')] } }),
    ctx({ levers_now: { 'com.ape.network_resilience': {} } }), 'E_SUBFIELDS_UNKNOWN'],
  ['RECHAZA subcampo inventado en json-object',
    out({ decision: { kind: 'change', deltas: [d('exoplayer.load_control', { inventado_ms: 1000 }, 'buffer_ms')] } }),
    ctx({ levers_now: { 'exoplayer.load_control': {} } }), 'E_SUBFIELDS_UNKNOWN'],
  ['RECHAZA enum sin vocabulario declarado (X-AI-SR-Enabled)',
    out({ decision: { kind: 'change', deltas: [d('X-AI-SR-Enabled', 'ON', 'capture.lap')] } }),
    ctx({ levers_now: { 'X-AI-SR-Enabled': 'OFF' } }), 'E_NO_EVIDENCE'],
  ['RECHAZA cooldown VPS (movida hace 1 vuelta)',
    out({ decision: { kind: 'change', deltas: [d('X-Prefetch-Segments', 9, 'buffer_ms')] } }),
    ctx({ round_index: 10, last_moved_round: { 'X-Prefetch-Segments': 9 }, levers_now: { 'X-Prefetch-Segments': 8 } }), 'E_CADENCE'],
  ['RECHAZA sin recibo de aplicacion',
    out({ decision: { kind: 'change', deltas: [d('X-Prefetch-Segments', 9, 'buffer_ms')] } }),
    ctx({ levers_now: { 'X-Prefetch-Segments': 8 }, no_receipt: true }), 'E_NO_RECEIPT']
];

/* ── Integridad ──────────────────────────────────────────────────────────── */
const integrity = {
  contract_sha256: sha(C_PATH),
  contract_bytes: fs.statSync(C_PATH).size,
  inherits_knobs_sha_ok: C.inherits.knobs.sha256 === sha(K_PATH),
  inherits_knobs_counts_ok: C.inherits.knobs.knobs === K.knobs.length && C.inherits.knobs.blacklist === K.blacklist.length,
  allowlist_set_equality_vs_t81: (() => {
    const a = [...KNOBS.keys()].sort(), b = K.knobs.map((k) => k.name).sort();
    return a.length === b.length && a.every((x, i) => x === b[i]);
  })(),
  blacklist_set_equality_vs_t81: (() => {
    const a = [...BLACK].sort(), b = K.blacklist.map((x) => x.name).sort();
    return a.length === b.length && a.every((x, i) => x === b[i]);
  })(),
  codes_used_all_declared: true
};

const results = cases.map(([name, output, context, expected]) => {
  let got;
  try { got = validate(output, context); } catch (e) { got = { ok: false, code: 'THREW', detail: e.message }; }
  if (got.code && got.code !== 'OK' && !CODES.has(got.code)) integrity.codes_used_all_declared = false;
  const pass = got.ok ? expected === 'OK' : got.code === expected;
  return { case: name, expected, got: got.ok ? 'OK' : got.code, detail: got.detail || '', pass };
});
const failed = results.filter((r) => !r.pass);

const bySide = (s) => C.knob_policy.knobs.filter((k) => k.side === s);
const blocked = new Set([...C.coverage.blocked_enum_without_vocabulary.names, ...C.coverage.blocked_json_catalog_truncated.names]);
const movableBySide = (s) => bySide(s).filter((k) => !blocked.has(k.name)).length;

console.log('=== INTEGRIDAD DEL CONTRATO ===');
console.log(JSON.stringify(integrity, null, 1));
console.log('\n=== CASOS (' + results.length + ') ===');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  esperado=${String(r.expected).padEnd(21)} obtenido=${String(r.got).padEnd(21)} ${r.case}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log('\n=== RESUMEN ===');
console.log(JSON.stringify({
  total: results.length, pass: results.length - failed.length, fail: failed.length,
  codes_used_all_declared: integrity.codes_used_all_declared,
  coverage: {
    total: C.coverage.knobs_total, movable_now: C.coverage.movable_now, blocked_now: C.coverage.blocked_now,
    vps_total: bySide('vps').length, vps_movable: movableBySide('vps'),
    apk_total: bySide('apk').length, apk_movable: movableBySide('apk')
  }
}, null, 1));
if (failed.length) process.exitCode = 1;
```
