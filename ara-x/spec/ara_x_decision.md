# D5 · Contrato de decisión del ADC ARA-X (Never-Drop, térmico honesto)

**Tarea:** `t11` (D5) · **attempt:** `3e124f03-8a7a-4376-a1ac-e5158cbc2ac4` · **Autor:** `qoe-player-analyst` (S5 + S9)
**Fecha:** 2026-10-30 · **Estado:** spec repo-only. **Cero** ADB, **cero** device, **cero** VPS, **cero** props/settings escritos.
**Entregables:** este contrato + [`decision_test_vectors.json`](decision_test_vectors.json) (26 vectores) + verificador
[`../scripts/d5_check_decision.js`](../scripts/d5_check_decision.js).
**Fuentes que manda este contrato:** R2 (`4k8k_matrix.json` — orden de degradación y piso 4K), R4
(`R4_telemetry_matrix.md` — qué se puede medir de verdad), R5 (`R5_actuators.md` + `actuator_allowlist.json` — qué se
puede mover de verdad) y `ARA_X_SYNC_PROTOCOL.md` (contrato `/sync`).

`spec=ara-x-dec.v1` · `constants_digest=sha256:9124142d6f891e6f67e56e5610695fae11448f1d5a4b8058f723539f9494b2a7`

---

## 0 · Qué decide este contrato (y qué NO)

El ADC es el **meta-controlador** entre la telemetría (R4) y los actuadores (R5). Su salida es una **política de
proceso** por dispositivo: no toca bits, no toca píxeles, no toca URLs.

| Decide | NO decide (por invariante) |
|---|---|
| Cap de FPS del decoder/selector (60 → 30 → 24) | **Resolución** (piso 4K en el ONN 4K; jamás por debajo) |
| Intensidad del post-proceso VPP (9 pasos) | **Codec** declarado (`CODECS=`) ni `VIDEO-RANGE` |
| `buffer_s`, `abr_bw_factor`, `reconnect_attempts`, `live_delay_s` | **Perfil LAB** `profile.active` P0-P5 → se **replica**, no se mueve (§11.1) |
| Envelope `min/max_bitrate_bps` derivado de lo observado | **URLs** de canal/segmento (no reescribe; INV-9) |
| Cadencia de `/sync` y flags de estado | **ADB**, settings fuera de allowlist, transcode |

**Por qué el perfil P0-P5 queda fuera de su autoridad.** En el pipeline real, el perfil LAB es función determinista de
la resolución in-band (`P4`→720p, `P3`→1080p, `P1`→4K, medido en R2). Si el ADC moviera `profile.active`, movería la
resolución **por la puerta de atrás** — exactamente lo que el contrato prohíbe. Por eso `profile.active` y `blend` se
replican tal cual vienen del VPS/lista y `profile.reason` transporta el motivo del ADC.

**Tampoco mueve `hdr_conversion_mode`.** No está en la allowlist de levers de `/sync`
(`ARA_X_SYNC_PROTOCOL.md` §6 guard 2). El rollback PQ→SDR se pide con `display.hdr_hint="SDR"` + levers
`pq_hdr_enable=0` / `pq_hdr_mode=0`; la escritura real de `hdr_conversion_mode` sigue siendo del VPS (Phase-G).

---

## 1 · Invariantes

| ID | Invariante | Cómo se verifica |
|---|---|---|
| **INV-1** | Nunca se comanda resolución. `wire_resolution` fijo `3840x2160`; ninguna clave `*resolution*`/`*width*`/`*height*` puede aparecer en la política ni en `levers` | `INV2_RESOLUTION_AUTHORITY`, `INV2_RESOLUTION_LEVER` |
| **INV-2** | Wire 8K prohibido: `display.eight_k="presentation_only"` siempre | tabla §11 |
| **INV-3** | Orden R2: **FPS 60→30→24 primero**, luego post-proceso | vector `V03`, `V20` |
| **INV-4** | El post-proceso se atenúa antes de tocar el tier de bitrate; la resolución no se toca nunca | `V07`, `V19` |
| **INV-5** | Fail-closed por SoC: SoC fuera de allowlist ⇒ `allowed=false` y `levers={}` | `INV4_FAIL_CLOSED`, `V14` |
| **INV-6** | `null ≠ 0`: sensor térmico ausente ⇒ `u_T=1.0`, brazo mínimo A1, bit `THERMAL_UNKNOWN`, y **nunca** relajación | `INV6_*`, `V01`, `V13` |
| **INV-7** | Lo que no se puede aplicar no se declara aplicado: sin lever de FPS ⇒ `fps_applied=0` + `fps_unavailable` | `INV8_*`, `V04`, `V15` |
| **INV-8** | Degradación monótona y espejada en `degrade_mask` (post `k` ⇒ bits `1..k`) | `INV7_*` |
| **INV-9** | La política no transporta URLs/URIs/segmentos | `INV9_URL_IN_POLICY` |
| **INV-10** | Pérdida de resolución observada ⇒ degrada proceso y **bloquea promoción 120 s** | `INV10_RES_LOCK`, `V09` |
| **INV-11** | Bajo estrés el ADC **no explora**: brazo determinista; Thompson sólo en calma | `V03`–`V07`, `V22` |
| **INV-12** | Determinismo: reloj inyectado, redondeo fijo (4 dp), RNG declarado, doble ejecución idéntica | runner (§12) |

---

## 2 · Cadencias: 100 / 500 / 5 000 / 10 000 / 30 000 ms

Cinco carriles; cada uno hace **una sola cosa** y ninguno bloquea al anterior.

| Tier | Periodo | Qué corre | Entradas | Salidas | Presupuesto | ¿Quién puede alimentarlo hoy? (R4) |
|---|---|---|---|---|---|---|
| **T0** | **100 ms** | Guardia de reflejo (stall, térmico crítico, pérdida de resolución) | buffer/stall, `pm_thermal_status`, resolución observada | *override* de emergencia (`arm=A4`, `post>=7`, `sync=10 s`) | < 0,05 ms, sin allocs | Sólo carril **device** (logcat/APK). El carril servidor no baja de 60 s |
| **T1** | **500 ms** | Fusión: EWMA de throughput/TTFB/jitter + **Holt (ARIMA-lite)** + normalización + frescura | muestras de segmento (`dt_ms`, `bytes`, `ttfb_ms`), contadores del player | `x_*` ∈ [0,1], `forecast_bps`, `breach`, `x_net` | < 0,2 ms | Device (≤500 ms) + último valor del servidor marcado `age_ms` |
| **T2** | **5 s** | **Fuzzy** → `u_degrade`, `L`, `N`, `T` → `fps_step`, `post_step` | features de T1 | escalera requerida | < 0,5 ms (12 reglas) | — |
| **T3** | **10 s** | **Thompson** sobre brazos de proceso (sólo en calma) + gates de anti-flap | posteriores + estado | `arm`, `bias` | < 0,2 ms | — |
| **T4** | **30 s** | Ensamblado de política + `/sync` (HMAC/seq/TTL) + recompensa y actualización de posteriores | ventana observada | `sync_response` + `posterior` | I/O: 2 s p95, fail-open | VPS (contrato `/sync`) |

**Por qué 100 ms no puede depender del VPS.** El observer de nginx escribe en un diccionario y hace flush cada **60 s**
(R4 P3/P4); el `conviva-event` del agente sí es sub-segundo pero con POST de 4 s y cola. Un lazo de 100 ms alimentado
por el VPS sería ficción: por eso T0 sólo usa señales locales, y cuando no las hay **mantiene** (no inventa).

Regla de frescura (T1): `age_ms > 2 × cadencia_de_la_fuente` ⇒ la feature decae al prior y se emite `stale_<feature>`.

---

## 3 · Features de entrada

Sólo se usan features que R4 declaró medibles. Cada una viaja con `prov`, `age_ms` y `conf`.

| Feature | Unidad | Fuente (R4) | `prov` | Nullable | Uso |
|---|---|---|---|---|---|
| `frame_drop_ratio` | 0..1 | `droppedFrames`/`DecoderCounters` (APK) | measured_device | **sí** | `x_drop` |
| `frame_drop_count` + `fps_declared` | int / fps | logcat ExoPlayer | measured_device | sí | aproximación de `x_drop` (marcada) |
| `rebuffer_ratio` | 0..1 | `rebuffer_ms / play_ms` | derived | **sí** | `x_rebuf` |
| `rebuffer_count` | int | `STATE_BUFFERING` / proxy gap>15 s | measured_* | sí | aproximación (`count/5`) |
| `stall` | bool | T0 local | measured_device | no | reflejo |
| `vst_ms` | ms | `onRenderedFirstFrame` / `vst_proxy` | measured_* | sí | penalización de arranque |
| `ttfb_ewma_ms`, `jitter_ewma_ms` | ms | reactor nginx / segmentos del APK | measured_server | sí | `N` |
| `x_net` (del forecast) | 0..1 | T1 | derived | no | `N` |
| `err5xx_rate` | 0..1 | observer Lua | measured_server | sí | `x_err` |
| `thermal_status` | enum 0..6 | `PowerManager.getCurrentThermalStatus()` | measured_device | **sí** | `T` |
| `cpu_temp_c` | °C | `thermal_zone*/temp` **sólo ADB** | measured_device | **sí** | `T` |
| `ram_available_pct` | % | `MemoryInfo` / `meminfo` | measured_device | sí | flag `ram_low` |
| `resolution_class` | enum | observado (`4k`/`1080p`/`720p`/`unknown`) | measured_device | no | `x_res` (protegido, no comandable) |
| `bitrate_bps` | bps | decoder real / proxy | measured_* | sí | envelope de bitrate |
| `soc`, `player` | string | `getprop` / foreground | measured_device | no | gate SoC + capability |

**Lo que NO entra como feature (y por qué).** `gpu_load_pct`, `vpu_load_pct`, `gpu_temp_c` y `content.*` no se usan
como número: R4 (N3, N4, N7) y R5 (§14.3) documentan que no son medibles sin root/modelos reales. Si algún día llegan,
entran por T1 con `prov=measured_device` y **sin cambiar este contrato** (los pesos se recalibran, no se improvisan).

---

## 4 · Térmico honesto

### 4.1 Dos fuentes, una banda

```
enum_band(status) = [0.00, 0.25, 0.50, 0.75, 0.90, 1.00, 1.00][status]      # 0 NONE … 6 SHUTDOWN
temp_band(c)      = clamp((c − 65) / (85 − 65), 0, 1)                        # 65 °C → 0 ; 85 °C → 1
x_therm           = max(enum_band, temp_band)   si hay ambas
                  = la que exista               si hay una
                  = null                        si no hay ninguna
```

- **Los extremos son los de R2** (`thermal.limits_c = [65, 78, 82, 85]`): la banda se calcula linealmente entre
  **65 °C → 0.00** y **85 °C → 1.00**, de modo que las cuts intermedias de R2 caen en`78 °C → 0.65` y`82 °C → 0.85`.
  La correspondencia enum↔°C es una **hipótesis declarada**: `NONE≈<65`, `LIGHT≈65-78`, `MODERATE≈78-82`,
  `SEVERE≈82-85`, `CRITICAL≈≥85`. No se presenta como medición.
- `thermal_status ≥ 3` (SEVERE) coincide con el criterio que R5 usa para "throttled" (`R5:385`).

### 4.2 Incertidumbre declarada (`u_T`)

| Situación | `u_T` | Consecuencia |
|---|---|---|
| enum + temperatura | 0.10 | confianza alta: se permite todo el rango de brazos |
| sólo enum (lo normal sin ADB) | 0.35 | confianza media: se permite todo el rango |
| sólo temperatura | 0.20 | confianza media-alta |
| **ninguna** | **1.00** | **modo conservador**: brazo mínimo **A1** (nunca A0) + bit `THERMAL_UNKNOWN` + `reasons: thermal_sensor_absent` |

**INV-6, en una frase:** un sensor ausente **no** es "frío" ni "carga 0"; es **incertidumbre**, y la política resultante
es **más** conservadora, nunca menos. Es la misma invariante que R5 llama INV-6 (`R5:422`).

### 4.3 Qué NO se puede afirmar

| Señal | Sin ADB | Con ADB autorizado | Decisión |
|---|---|---|---|
| `pm_thermal_status` (enum) | **sí** (API 29+) | sí | **se usa** |
| `cpu_temp_c`, `gpu_temp_c` | no (SELinux `sysfs_thermal`) | sí (`thermal_zone*/temp` + `type`) | se usa si llega; si no, `null` |
| `gpu_load_pct` | no | Mali `.../mali0/device/utilization` | **no se usa** |
| `vpu_load_pct` | no | sin nodo estándar | **no se usa** (`NO_AVAILABLE`) |

El contrato **no promete** "−5 °C por bajar AI-SR": el efecto térmico de cada paso no está medido (R5 §14.6). El
gobernador térmico es de **D2**; D5 aporta la histéresis y el aprendizaje (R2 delega `hysteresis_handoff` a D5).

---

## 5 · Normalización (exacta, determinista)

```
x_drop   = clamp(frame_drop_ratio / 0.05, 0, 1)          # 5 % de drops = 1.0
x_rebuf  = clamp(rebuffer_ratio   / 0.05, 0, 1)
x_stall  = 1 si hay stall, si no 0
x_net    = clamp((floor_bps − forecast_bps) / floor_bps, 0, 1)
x_ttfb   = clamp((ttfb_ewma_ms − 300) / 1200, 0, 1)
x_jit    = clamp(jitter_ewma_ms / 200, 0, 1)
x_err    = clamp(err5xx_rate / 0.05, 0, 1)
x_res    = 1 si resolution_class ∈ {720p, 1080p, below}
L = max(x_drop, x_rebuf, x_stall, x_err)                 # estrés de calidad percibida
N = max(x_net, x_ttfb, x_jit)                            # riesgo de red
T = x_therm (o 0.5 si es null; ver §4.2)
```

`x_res` **no es una palanca**: es un testigo. Se usa para penalizar recompensa (INV-10) y bloquear promociones.

---

## 6 · Escalera de degradación (R2: FPS → post-proceso → bitrate; nunca resolución)

### 6.1 FPS (rank-1) — valores 60 / 30 / 24

```
fps_step = 0 (60) | 1 (30) | 2 (24)
se sube a 1 si  L >= 0.40  ó  u_degrade >= 0.80  ó  x_therm >= 0.75
se sube a 2 si  L >= 0.90  ó                      x_therm >= 0.90
```

### 6.2 Post-proceso VPP — 9 pasos acumulativos

| Paso | Cambio de lever | Efecto |
|---|---|---|
| 1 | `ai_pq_mode 3→2` | AI-PQ un escalón menos |
| 2 | `ai_sr_level 3→2` | super-resolución menos agresiva |
| 3 | `pq_sharpness_enable 1→0` | sin sharpen |
| 4 | `pq_ai_dnr_enable/pq_dnr_enable/pq_nr_enable →0` | sin denoise |
| 5 | `pq_ai_fbc_enable 1→0` | sin frame-based compensation |
| 6 | `ai_sr_level 2→1` | SR mínima mantenida |
| 7 | `pq_hdr_mode →0` | HDR sin modo agresivo |
| 8 | `pq_hdr_enable →0` **+ `display.hdr_hint="SDR"`** | rollback PQ declarado |
| 9 | `minimal_post_processing_allowed=1`, `aipq_enable=0`, `pq_ai_sr_enable=0`, `ai_sr_level=0` | VPP mínimo |

`post_step` sale del fuzzy (`u_degrade`, ver §7.3) más el sesgo del brazo (`+0/1`, nunca resta).

### 6.3 Sustitución cuando el FPS no es ejecutable (INV-7)

Si el player no tiene selector de tracks (nativo), `fps_step>0` **no se puede aplicar**:
`post_step = max(post_step, min(2×fps_step, 9))`, `fps_applied=0`, bit `FPS_UNAVAILABLE`, flag `fps_unavailable`,
reason `no_fps_lever`. La degradación efectiva sigue existiendo; lo que no se hace es **mentir** sobre haber bajado FPS.

### 6.4 Bitrate y buffer

```
max_bitrate_bps = clamp(round(1.25 × bitrate_observado), 1 Mbps, 80 Mbps)
min_bitrate_bps = clamp(round(0.85 × bitrate_observado), 1 Mbps, max_bitrate_bps)
   (sin observación: 25 Mbps / 6 Mbps + flag bitrate_unknown)
buffer_s = clamp(buffer_del_brazo + bump(post_step), 5, 120)   # bump: 0 / +10 / +20 / +30
abr_bw_factor = clamp(abr_del_brazo − 0.02×floor(post_step/3), 0.50, 0.98)
```

**Nunca** se baja `min_bitrate_bps` para "que quepa": eso sería degradar por bitrate antes que por proceso y, en el
límite, invitar al ABR del player a saltar a un tier menor (resolución). Si el bitrate observado es 9 Mbps (el caso
mayoritario del catálogo, R2), el envelope es 7,65–11,25 Mbps: **no fuerza stalls** porque se ancla a lo que ya se sirve.

### 6.5 Resolución: piso y qué pasa si la fuente está por debajo

- Piso: **3840×2160** (`minimum_4k.floor`). El ADC no lo comanda: lo **exige como testigo**.
- Si `resolution_class` observada < 4K ⇒ no se "sube" nada (no hay transcode en VPS): se degrada **proceso**
  (`post>=4`), se marca `RES_LOSS_LOCK` y se bloquea la promoción **120 s**. Es la respuesta honesta a una fuente
  que no da 4K: proteger el decoder para que no se caiga y no fingir calidad.
- 8K: `eight_k="presentation_only"` fijo; ningún camino de este contrato puede emitir wire 8K.

---

## 7 · Fuzzy (T2)

### 7.1 Conjuntos

| Variable | LOW | MID | HIGH |
|---|---|---|---|
| forma | trapecio `[−0.01, 0, 0.25, 0.45]` | triángulo `[0.30, 0.55, 0.80, 0.80]` | trapecio `[0.60, 0.85, 1.00, 1.01]` |

Los extremos `−0.01` / `1.01` existen para que `x=0` y `x=1` pertenezcan plenamente al conjunto (sin agujeros en la
frontera). `μ(x)` es interpolación lineal por tramos; no hay librería difusa de por medio (implementable en 9 líneas).

### 7.2 Reglas (Mamdani min, consecuente singleton, media ponderada)

| # | L | N | T | consecuente |
|---|---|---|---|---|
| R1 | LOW | LOW | LOW | 0.00 |
| R2 | LOW | LOW | MID | 0.15 |
| R3 | LOW | MID | LOW | 0.20 |
| R4 | LOW | LOW | HIGH | 0.45 |
| R5 | LOW | MID | MID | 0.30 |
| R6 | LOW | HIGH | LOW | 0.55 |
| R7 | MID | LOW | LOW | 0.45 |
| R8 | MID | MID | MID | 0.65 |
| R9 | MID | HIGH | MID | 0.80 |
| R10 | LOW | HIGH | HIGH | 0.85 |
| R11 | HIGH | MID | MID | 0.90 |
| R12 | HIGH | HIGH | HIGH | 1.00 |

`u_degrade = Σ(wᵢ·cᵢ) / Σ(wᵢ)` con `wᵢ = min(μL, μN, μT)`; si `Σwᵢ = 0` ⇒ `u = 0`.

**Nota de honestidad sobre `T` desconocido:** en la inferencia se usa `T = 0.50` (punto neutro de una variable
incierta), **no** "templado". La conservación no viene de ese 0.5: viene del tope de brazo (§8.2) y de INV-6.

### 7.3 De `u_degrade` a `post_step`

| `u` | < 0.60 | ≥0.60 | ≥0.66 | ≥0.72 | ≥0.78 | ≥0.84 | ≥0.88 | ≥0.92 | ≥0.96 |
|---|---|---|---|---|---|---|---|---|---|
| `post_step` | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |

`u_degrade` **solo** llega al paso 8 (el 9º umbral `1.01` es inalcanzable por diseño). El **paso 9** se alcanza únicamente
por el sesgo `+1` de un brazo conservador (A3/A4) sumado a un `post_step` de 8 — y bajo emergencia térmica el brazo es
A4 por obligación, así que `térmico ≥ 0.90 ⇒ post 9`. Un `u` alto **sin** evidencia térmica se queda en 8.

### 7.4 Fuerzas de emergencia (T0, antes de todo)

| Disparador | Efecto |
|---|---|
| stall activo | `arm=A4`, `post≥7`, `fps≥30`, `sync=10 s` |
| `pm_thermal_status ≥ 4` (CRITICAL/EMERGENCY/SHUTDOWN) | `arm=A4`, `post≥8`, `fps=24` (si hay lever; si no, sustitución §6.3), bit `THERMAL_CRITICAL`, `sync=10 s` |
| `x_therm ≥ 0.90` (aunque no haya enum: p.ej. 85 °C por ADB) | ídem |
| `x_therm ≥ 0.75` | `arm≥A3`, `post≥6`, `fps≥30` |
| `x_therm ≥ 0.50` | `arm≥A2`, `post≥3`, FPS intacto |
| `vst_ms > 8000` | `post≥2` + flag `vst_critical` |
| `resolution_class < 4K` | `post≥4`, `RES_LOSS_LOCK`, lock de promoción 120 s |

---

## 8 · Thompson (T3)

### 8.1 Brazos = parámetros de PROCESO (nunca resolución)

| Brazo | `buffer_s` | `abr_bw_factor` | sesgo `post` | `reconnect` | `live_delay_s` | Intención |
|---|---|---|---|---|---|---|
| **A0** | 30 | 0.85 | +0 | 6 | 8 | máxima imagen, buffer corto |
| **A1** | 45 | 0.82 | +0 | 8 | 10 | equilibrado-agresivo |
| **A2** | 45 | 0.80 | +0 | 10 | 10 | **default** (coincide con `safeDefaultPolicy`) |
| **A3** | 60 | 0.76 | +1 | 12 | 15 | conservador (margen de proceso) |
| **A4** | 90 | 0.70 | +1 | 20 | 20 | supervivencia |

Todos los campos caen dentro de `sync_response.schema.json` (`buffer_s 5..120`, `abr 0.5..0.98`,
`reconnect 1..500`, `live_delay 1..60`). Ningún brazo tiene campo de resolución: **es imposible** que el aprendizaje
mueva la resolución.

### 8.2 Cuándo se explora y cuándo no (INV-11)

```
estrés := fps_step > 0  ó  post_step > 0  ó  N >= 0.50
si estrés  -> brazo determinista: forzado = 2 (A2) ; fps_step>=1 -> >=2 ; fps_step>=2 -> >=3 ;
              post_step>=3 -> >=3 ; post_step>=7 -> >=4 ; N>=0.8 -> >=A3
si calma   -> Thompson sobre {a : idx(a) >= min_idx(térmico)  y  idx(a) <= 3}
cold start -> brazo FIJO max(min_idx, 2)  (no se explora sin datos)
emergencia -> max(brazo, A4)
```

`min_idx(térmico)`: `x_therm ≥0.90→4`, `≥0.75→3`, `≥0.50→2`, `≥0.25→1`, `<0.25→0`; **si `x_therm` es `null` ⇒ 1**.

**Por qué no explorar bajo estrés:** con el usuario sufriendo no se hacen experimentos, y la asignación de crédito se
contamina (una caída de red castigaría al brazo equivocado). Explorar sólo en calma hace que el bandido aprenda de
ventanas comparables.

### 8.3 Posterior y muestreo

- Prior `Beta(1,1)` por brazo; media `a/(a+b)`; desviación `sd = sqrt(a·b / ((a+b)²·(a+b+1)))`.
- Muestreo `s = mean + sd · z(u)`, con **cuantil logístico unitario** `z(u) = (√3/π)·ln(u/(1−u))`, `√3/π ≈ 0.5513`.
  Es una aproximación simétrica de la normal con **varianza exacta 1** (la logística tiene varianza `s²π²/3`); se usa
  para **elegir entre 5 brazos**, no para p-valores. `u ∈ [1e-6, 1−1e-6]` para evitar `±∞`.
- Gana el mayor `s`; empate ⇒ índice menor (determinista).
- `u` se **inyecta** (vector) o sale de `xorshift128+` sembrado con `sha256(seed)`; sin RNG declarado, `u=0.5` ⇒ `z=0`
  y el muestreo colapsa a la media (legible y determinista).

### 8.4 Recompensa (penaliza drops y pérdida de resolución)

```
stepNorm = 0.5·(fps_applied/2) + 0.5·(post_step/9)
vstPen   = clamp((vst_ms − 2000)/6000, 0, 1)
thermPen = clamp((x_therm − 0.5)/0.5, 0, 1)    si hay sensor ; 0.25 si es null (incertidumbre)

r = clamp( 0.75
         + 0.25·(1 − stepNorm)                  # premia imagen intacta
         − 3.0·x_drop     − 4.0·x_rebuf         # drops y rebuffer
         − 0.5·x_stall
         − 6.0·x_res                            # ← pérdida de resolución: el peso mayor
         − 1.5·vstPen     − 1.0·thermPen , 0, 1 )
```

- `x_res` pesa **6.0**, más que drops (3.0) y rebuffer (4.0): perder 4K es el peor resultado posible del sistema.
- El término de calidad (`0.25·(1−stepNorm)`) evita el colapso al brazo más conservador cuando todo va bien: sin él,
  degradar sería gratis.
- Ventana sana ⇒ `r = 1.0`; catástrofe (drops+rebuffer+térmico crítico+VST+1080p) ⇒ `r = 0.0`.

### 8.5 Actualización (Thompson fraccional)

```
a' = max(0.5, 0.995·a + r)
b' = max(0.5, 0.995·b + (1 − r))
```

`decay = 0.995` permite seguir el drift del canal/red (olvido lento); `floor = 0.5` impide posteriores degenerados.

---

## 9 · Red: EWMA + ARIMA-lite (T1)

```
inst_bps = bytes·8·1000 / dt_ms
ewma_bps = α·inst + (1−α)·ewma_prev            α = 0.30     (igual que el reactor desplegado)
ttfb     = α·ttfb + (1−α)·ttfb_prev            α = 0.30
jitter   = 0.20·|ttfb − ttfb_prev| + 0.80·jitter_prev
Holt:  level_t = 0.30·ewma_t + 0.70·(level_{t−1} + trend_{t−1})
       trend_t = 0.10·(level_t − level_{t−1}) + 0.90·trend_{t−1}
forecast = level + 3·trend                      (3 muestras ≈ 3 s a 1 Hz)
breach   = forecast < floor_bps ;  x_net = clamp((floor − forecast)/floor, 0, 1)
```

**Por qué ARIMA-lite y no ARIMA:** el lazo corre a 500 ms sobre muestras irregulares (segmentos de 2-6 s); un ARIMA
completo exigiría estacionariedad, orden y estación de ajuste que no caben en el presupuesto ni en la cadencia. Holt
(level+trend) captura la tendencia local, es O(1) por muestra y **explica** su pronóstico. Se documenta como
**ARIMA-lite = suavizado exponencial doble**; si en el futuro se necesita estacionalidad, se añade un término, no se
cambia la interfaz.

`floor_bps`: piso de red del canal = `0.85 × bitrate_observado` del tier actual (mismo criterio que `min_bitrate_bps`).

---

## 10 · Anti-flap (R2 delega `hysteresis_handoff` aquí)

| Regla | Valor | Efecto |
|---|---|---|
| **Dwell** | 20 s | no se cambia de brazo antes de 20 s en el actual |
| **Margen de promoción** | 0.06 | sólo se sube (menos degradación) si `s(mejor) − s(actual) ≥ 0.06` |
| **Muestras mínimas** | 2 | `a+b ≥ 2` para promover (evita promover con un posterior degenerado) |
| **Cooldown** | 45 s | tras **degradar**, 45 s sin promociones |
| **Presupuesto** | 1 cambio / 30 s | como máximo un cambio de brazo por ventana de 30 s |
| **Lock por resolución** | 120 s | si se observa < 4K, promociones bloqueadas 120 s |
| **Térmico incierto** | `u_T ≥ 0.5` | nunca se promociona (INV-6) |
| **Asimetría** | — | degradar es seguro (sólo dwell+presupuesto); promover exige todas las puertas |

Consecuencia de diseño: **baja rápido, sube lento**. Es lo que pide Never-Drop y es lo que evita el yoyo
subir-bajar-subir que se ve en ABR ingenuos.

---

## 11 · Ensamblado de la política (`sync_response`)

### 11.1 Campos

| Campo | Valor / regla |
|---|---|
| `profile.active`, `profile.blend` | **réplica** del VPS/lista (INV: el ADC no mueve resolución) |
| `profile.reason` | primer *reason* del ADC (`cold_start`, `thermal_band_severe`, `resolution_below_floor`, `stressed_deterministic`, …) |
| `player.buffer_s` | `clamp(arm.buffer + bump(post), 5, 120)` |
| `player.abr_bw_factor` | `clamp(arm.abr − 0.02·floor(post/3), 0.50, 0.98)` |
| `player.reconnect_attempts`, `live_delay_s` | del brazo (1..500 / 1..60) |
| `player.min/max_bitrate_bps` | §6.4 (1 Mbps..80 Mbps, `min ≤ max`) |
| `device.allowed` | `soc ∈ {amlogic, mt8696, s905x3, s905x4}` tras canonicalizar (`amlogic_s905x4 → s905x4`) |
| `device.soc` | canónico; `unknown` si no se pudo leer ⇒ `allowed=false` (fail-closed) |
| `device.thermal_target_c` | 70 (intención; **no** es una medición — R5 §14.6) |
| `device.levers` | mapa de 13 claves (§6.2) **sólo** si `allowed` y `vpp_levers`; si no, `{}` |
| `display.mode` | `4k` fijo |
| `display.wire_resolution` | `3840x2160` fijo (INV-1) |
| `display.eight_k` | `presentation_only` fijo (INV-2) |
| `display.hdr_hint` | `SDR` si `post ≥ 8`, si no `PQ` |
| `controls.sync_next_s` | 10 si emergencia/térmico crítico; 20 si `post≥3` o FPS degradado; 30 resto |
| `controls.degrade_mask` | §11.2 |
| `controls.flags` | §11.3 (≤16, ≤48 chars cada uno) |

### 11.2 `degrade_mask` (16 bits)

| Bit | Valor | Significado |
|---|---|---|
| 0 | 1 | FPS 30 aplicado |
| 1 | 2 | FPS 24 aplicado |
| 2 | 4 | AI-PQ reducido (post ≥1) |
| 3 | 8 | AI-SR reducida (post ≥2) |
| 4 | 16 | sharpen off (post ≥3) |
| 5 | 32 | denoise off (post ≥4) |
| 6 | 64 | FBC off (post ≥5) |
| 7 | 128 | `pq_hdr_mode` off (post ≥7) |
| 8 | 256 | `pq_hdr_enable` off + HDR SDR (post ≥8) |
| 9 | 512 | VPP mínimo (post 9) |
| 10 | 1024 | buffer subido |
| 11 | 2048 | ABR apretado (post ≥3) |
| 12 | 4096 | **térmico desconocido** (modo conservador) |
| 13 | 8192 | térmico crítico |
| 14 | 16384 | lock por pérdida de resolución |
| 15 | 32768 | **FPS no ejecutable** en este player |

### 11.3 `flags` (vocabulario cerrado)

`cold_start`, `thermal_unknown`, `thermal_severe`, `thermal_critical`, `res_loss_lock`, `vst_critical`, `ram_low`,
`fps_unavailable`, `bitrate_unknown`, `soc_unknown`, `soc_not_allowlisted`, `vpp_not_applicable`, `antiflap_hold`.

---

## 12 · Determinismo y verificación

```bash
node ara-x/scripts/d5_check_decision.js                # 26 vectores + 300 estados sintéticos
node ara-x/scripts/d5_check_decision.js --print-digest # digest de constantes
node ara-x/scripts/d5_check_decision.js --vector V07   # un vector
```

Resultado de esta entrega (ejecutado en este host, Node v24.12.0):

```
D5 decision vectors: 26/26 PASS · 0 fallo(s) · invariantes: 300/300 OK · total fallos=0 · spec=ara-x-dec.v1 · sha256:9124142d6f891e6…
```

Qué comprueba el runner, en este orden:

1. **Digest de constantes**: `decision_test_vectors.json.constants_digest` debe coincidir con el de la implementación
   (fail-closed). Si alguien toca un umbral sin regenerar vectores, el gate falla.
2. **26 vectores** con `expect` explícito (§12.1).
3. **Idempotencia**: cada vector se ejecuta **dos veces** y la salida debe ser byte-idéntica.
4. **el conjunto de invariantes del contrato** (INV-2, INV-3, INV-4, INV-5, INV-6, INV-7, INV-8, INV-9, INV-10 + rangos del schema) sobre **cada vector** y sobre
   **300 estados sintéticos** generados con RNG sembrado (50 % calma / 50 % estrés). Los invariantes **no** dependen
   de los `expect`: son la parte independiente de la implementación.

> **Honestidad sobre el método:** los *inputs* de los vectores son escenarios escritos a mano; las *expectativas* se
> co-derivaron con la implementación de referencia y se revisaron regla por regla contra §5–§11 (cada vector fija una
> regla concreta — ver `note`). Eso demuestra consistencia y determinismo, **no** corrección empírica: la corrección
> real sólo se puede medir en device (§13, G8).

### 12.1 Cobertura de los 26 vectores

| ID | Escenario | Regla que fija |
|---|---|---|
| V01 | cold start sin telemetría | brazo fijo A2, conservador, SoC desconocido fail-closed |
| V02 | 4K60 sano | `u=0`, máscara 0, promoción A2→A0 |
| V03 | drops 4 % | FPS 30 primero, sin post ni resolución |
| V04 | stall + rebuffer 3 % | emergencia A4, post≥7, SDR, sync 10 s, sin lever FPS |
| V05 | colapso de red | `N` fuerza A3 sin tocar FPS |
| V06 | `pm_thermal_status=3` | FPS y post≥6, brazo≥A3 |
| V07 | `pm_thermal_status=5` | A4, post 9, SDR, sync 10 s, levers al mínimo |
| V08 | 72 °C + enum LIGHT | fusión `max()` y `u_T=0.10` |
| V09 | resolución 1080p | post≥4 + lock 120 s (nunca comanda resolución) |
| V10 | dwell 5 s | bloqueo de promoción |
| V11 | dwell 30 s | promoción permitida |
| V12 | posteriores idénticos | margen 0.06 rechaza el cambio |
| V13 | sin sensor térmico | `u_T=1`, bit y brazo mínimo A1 |
| V14 | SoC rtd1319 | `allowed=false`, `levers={}` |
| V15 | sin lever FPS (+drops) | sustitución 2× a post-proceso |
| V16 | VST 9 s | `post≥2`, `vst_critical`, FPS intacto |
| V17 | 8 % de 5xx | FPS 24 + A3 |
| V18 | RAM 8 % | flag `ram_low`, escalera intacta |
| V19 | `pm_thermal_status=2` | post≥3, FPS intacto |
| V20 | drops 6 % | FPS 24 |
| V21 | rebuffer 2 % | FPS 30 |
| V22 | estrés desde A0 | nunca promociona bajo estrés |
| V23 | red degradándose | Holt: `breach=true`, `x_net=0.2934` |
| V24 | red sana | sin breach |
| V25 | recompensa sana | `r=1.0` + actualización de posterior |
| V26 | catástrofe | `r=0.0` (clamp) |

---

## 13 · Gaps honestos (lo que este contrato NO puede cumplir hoy)

| ID | Gap | Consecuencia | Qué haría falta |
|---|---|---|---|
| **G1** | **No existe lever de FPS para players nativos.** `user_preferred_refresh_rate` no está en las 29 claves del applier (`actuator_allowlist.device_applier`), y `match_content_frame_rate` alinea el display, no el decoder | El rank-1 de R2 no es ejecutable en TiviMate/OTT/VLC/Kodi ⇒ sustitución a post-proceso (INV-7) | En el APK: `DefaultTrackSelector.Parameters.Builder.setMaxVideoFrameRate()` (media3 ya está en `ApePlayer.kt`, sin uso). **Nunca** `setMaxVideoSize` (sería resolución) |
| **G2** | `ai_pq_mode` **no existe** en MT8696 (el real es `ai_pic_mode`); el alias sólo lo expande el puente #1 (R5 GAP-05) | El paso 1 del post-proceso puede ser inerte | El applier/VPS debe expandir el alias; el ADC emite el nombre canónico |
| **G3** | `hdr_conversion_mode` **no está** en la allowlist de levers de `/sync` | El rollback PQ→SDR no se puede escribir desde la política | Ya resuelto: `display.hdr_hint="SDR"` + `pq_hdr_enable=0`; escritura real en VPS Phase-G |
| **G4** | Trampa de string del SoC: `amlogic_s905x4` **no** casa la allowlist exacta (R5 GAP-01) | `allowed=false` en un device correcto | Canonicalización obligatoria (§11.1) — implementada aquí |
| **G5** | `cpu_temp_c`/`gpu_temp_c`/`gpu_load_pct`/`vpu_load_pct` no medibles sin ADB (R4 N3-N5) | El lazo térmico funciona **sólo** con el enum 0..6 | ADB autorizado una vez + `thermal_zone*/temp`; VPU probablemente nunca |
| **G6** | `frame_drop_ratio` real no existe fuera del APK; en logcat sólo hay **conteo** | La recompensa usa ratio real cuando existe; si no, `count/(fps·10)` (marcado) | APK: `DecoderCounters` (`droppedBufferCount/renderedOutputBufferCount`) |
| **G7** | El efecto térmico de cada paso de post-proceso no está medido (R5 §14.6) | Los pesos son **hipótesis de ingeniería**; el contrato no promete °C | Campaña con ADB + termómetro |
| **G8** | **Nada de esto se ha ejecutado en device.** `pm_thermal_status`, drops reales y respuesta del VPP son `[NOT_RUN]` | El contrato está listo para implementar, no validado en campo | Verificación read-only de R4 §9 + banco de pruebas |

---

## 14 · Handoff (qué falta para que esto exista en runtime)

1. **APK** — (a) `setMaxVideoFrameRate(fps_cap)` y `setMaxVideoBitrate(max_bps)` en el `DefaultTrackSelector` que ya
   existe; **prohibido** `setMaxVideoSize`. (b) Leer `pm_thermal_status` (API 29+) y `frame_drop_ratio` reales.
   (c) Emitir `thermal_status` y `frame_drop_ratio` en el heartbeat/`quality_change`, con `prov` y `age_ms`.
2. **VPS / `/sync` (R6)** — aplicar este contrato, canonicalizar SoC, resolver alias `ai_pq_mode→ai_pic_mode`, y
   respetar `degrade_mask`/`flags` como contrato de lectura.
3. **Observabilidad** — registrar por ventana `{arm, fps, post_step, mask, reasons, reward, posteriores}` para auditar
   que el aprendizaje no premia degradar.
4. **Gate CI** — `node ara-x/scripts/d5_check_decision.js` (exit≠0 ⇒ no se mergea). Cualquier cambio de umbral exige
   regenerar vectores y actualizar el digest.
5. **Device (cuando haya ADB autorizado)** — cerrar G5/G6/G8 con el plan de R4 §9; recién entonces calibrar pesos.

---

## Anexo A · Constantes (el digest cubre exactamente este objeto)

| Grupo | Constantes |
|---|---|
| Cadencias | `t0=100`, `t1=500`, `t2=5000`, `t3=10000`, `t4=30000` ms |
| Piso | `3840×2160` · allowlist SoC `[amlogic, mt8696, s905x3, s905x4]` |
| Térmico | bandas enum `[0,.25,.5,.75,.9,1,1]` · temp `65..85 °C` · `u_T` = `.10/.35/.20/1.00` · brazo mínimo sin sensor `1` · penalización de incertidumbre `.25` |
| Fusión | `drop_full=.05`, `rebuf_full=.05`, `ttfb_zero=300`, `ttfb_span=1200`, `jitter_full=200`, `err_full=.05`, `vst_zero=2000`, `vst_span=6000`, `ram_low=.15` · `α_bw=.30`, `α_ttfb=.30`, `α_jitter=.20` · Holt `.30/.10`, horizonte `3` |
| Fuzzy | `LOW[-0.01,0,.25,.45]`, `MID[.30,.55,.80,.80]`, `HIGH[.60,.85,1,1.01]` · 12 reglas · `T_unknown=.50` |
| Escaleras | FPS `60/30/24` · `L_cut=[.40,.90]` · `u_cut=.80` · térmico `fps≥.75→1, ≥.90→2` · térmico `post≥.50→3, ≥.75→6, ≥.90→8` · `N_cut=[.50,.80]` · `post_u=[.60,.66,.72,.78,.84,.88,.92,.96,1.01]` |
| Brazos | §8.1 (5) |
| Thompson | prior `[1,1]`, `decay=.995`, `floor=.5`, `k=√3/π≈.5513`, `u∈[1e-6,1−1e-6]` |
| Recompensa | `base=.75`, `w_quality=.25`, `w_drop=3`, `w_rebuf=4`, `w_stall=.5`, `w_res_loss=6`, `w_vst=1.5`, `w_thermal=1` |
| Anti-flap | dwell `20000 ms`, margen `.06`, mín. muestras `2`, cooldown `45000 ms`, reslock `120000 ms`, `1` cambio/30 s |
| Bitrate | factores `.85/1.25`, desconocido `6/25 Mbps`, límites `1/80 Mbps` |
| Sync | `10/20/30 s` · `thermal_target_c=70` |
| Levers base | 13 claves `ape_vpp_levers('max_image')` + 9 pasos de post-proceso (§6.2) |
| Máscara | 16 bits (§11.2) |

## Anexo B · Relación con los demás entregables

| Documento | Qué aporta a D5 |
|---|---|
| `reports/R4_telemetry_matrix.md` | qué features existen, con qué procedencia, a qué cadencia, y qué es `null` |
| `reports/R5_actuators.md` · `spec/actuator_allowlist.json` | los 13 levers, el gate SoC, el alias `ai_pq_mode`, INV-6 térmico |
| `spec/4k8k_matrix.json` | orden de degradación R2, piso 4K, prohibiciones, `hysteresis_handoff → D5` |
| `spec/ARA_X_SYNC_PROTOCOL.md` · `vps/schema/sync_response.schema.json` | forma exacta de la política y sus bounds |
| `spec/decision_test_vectors.json` · `scripts/d5_check_decision.js` | vectores + verificador (gate CI) |
