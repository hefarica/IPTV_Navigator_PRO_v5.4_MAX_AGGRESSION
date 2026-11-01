# APE PREDICTIVE PREFETCH v1.0 — "Predicción AI" con motor real

**Fecha:** 2026-11-01 · **Ámbito:** frontend (`index-v4.html` + `ape-v9/streaming`)
**Estado:** implementado, verificado y commiteado (base dcbabc5 + calibración final 2026-11-01).
**Doctrina aplicada:** MAX IMAGE FIRST · no mocks · no datos falsos · no tocar VPS · SSOT del perfil manda.

---

## 1. El problema que resuelve

El panel **⚡ Prefetch Inteligente** ofrecía un checkbox **"Predicción AI"** que:

1. escribía `prefetch_config.ai_prediction_enabled` en el perfil,
2. **nadie lo leía** — el generador emitía `AI-PREDICTION:enabled` hardcodeado ([m3u8-typed-arrays-ultimate.js:4862](../../IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js)),
3. no existía modelo, ni consumidor, ni evidencia.

Además el bridge leía `pf.segments` / `pf.parallelDownloads` cuando el SSOT publica
`prefetch_segments` / `parallel_downloads` → **undefined siempre** → todo caía al hardcoded.

## 2. Qué se implementó

| Pieza | Archivo | Función |
|---|---|---|
| Motor predictivo | [`predictive-prefetch-v9.js`](../../IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/streaming/predictive-prefetch-v9.js) | `APE_PREDICT`: EWMA² + pendiente + ventana neuro + riesgo logístico + gobernador acotado |
| Bridge SSOT | [`m3u8-typed-arrays-ultimate.js:1625`](../../IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js) | claves snake_case + `adaptive_enabled` / `ai_prediction_enabled` / `strategy` llegan al generador |
| Emisión honesta | [`m3u8-typed-arrays-ultimate.js:9961`](../../IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js) | `PREFETCH:…,AI=…`, `AI-PREDICT:` con riesgo/confianza/evidencia |
| UI viva | [`profile-manager-v9.js:2386`](../../IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/profile-manager-v9.js) | estado medido + botón **Medir ahora** (`measurePredictiveAI()`) |
| Carga | [`index-v4.html:4244`](../../IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html) | script tras `bw-estimator-v9.js` (necesita `APE_BW`) |
| Tests | [`ape-predictive-prefetch.test.js`](../../IPTV_v5.4_MAX_AGGRESSION/frontend/tests/ape-predictive-prefetch.test.js) · [`predictive-prefetch-live.js`](../../IPTV_v5.4_MAX_AGGRESSION/frontend/tests/predictive-prefetch-live.js) | 43 asserts deterministas + 11 asserts con medición HTTP real |

## 3. Cadena real (sin datos inventados)

```
Resource Timing (bytes/duration reales del navegador)
        ↓  APE_BW.harvest() / sample()          [bw-estimator-v9.js]
  doble EWMA des-sesgada (half-life 3 s / 9 s, modelo hls.js)
        ↓  APE_PREDICT.observe()               [predictive-prefetch-v9.js]
  ventana temporal (≤60 obs) → tendencia, pendiente, jitter, r²
        ↓  APE_PREDICT.decide(perfil)
  {declared, applied, risk, headroom, evidence, reasons}
        ↓  generateChannelEntry()              [m3u8-typed-arrays-ultimate.js]
  #EXT-X-APE-PREFETCH:ENABLED=true,SEGMENTS=…,PARALLEL=…,AI=…
  #EXT-X-APE-AI-PREDICT:MODE=EWMA2+SLOPE,RISK=…,CONF=…,EVIDENCE=resource-timing,…
```

## 4. Modelo (verificable a mano)

```
base      = APE_BW.snapshot().mbps            (min(fast,slow) des-sesgado)
trend     = (fast − slow) / max(slow, ε)
slope     = mínimos cuadrados de mbps vs s (últimas ≤8 obs)
forecast  = clamp(base + slope·H, 0.25·base, 3·base)      H = 10 s
predicted = 0.6·base + 0.4·forecast
jitter    = EWMA(α=0.3) de |x_i − x_{i−1}| / max(x_{i−1}, ε)
r2        = 1 − SSres/SStot   (serie constante ⇒ 1)
confidence= min(1, n/6) · (0.5 + 0.5·max(0,r2)) · peso(APE_BW.confidence)
risk      = 1 / (1 + e^{−z}),  z = −5.9·(headroom−1) − 0.2 − 0.8·jitter + bufferBonus
```

Calibración de `risk` verificada por test (headroom → riesgo):
`2.0 → 0.2%` · `1.5 → 4.1%` · `1.2 → 20.1%` · `1.0 → 45.0%` · `0.8 → 72.7%`.

### Gobernador (acotado, nunca viola el SSOT)

- `risk ≥ 35%` → aplica **50%** de lo declarado · `risk ≥ 20%` → **75%** · resto → **declarado**.
- Buffer real en nivel `BURST`/`NUCLEAR` (semántica de `neuro_buffer_controller.php`, 70/30/10 %) → ×0.75 extra.
- Pisos duros: **3 segmentos / 1 paralelo**. Techo duro: **lo declarado por el perfil**.
- **Sin evidencia** (`APE_BW.confidence === 'none'` o <2 observaciones) → **no toca nada** y se declara `EVIDENCE=none`.
- Semilla (`startup-default` / `connection.downlink`) **no** cuenta como medición: `base = 0`, `MBPS=0`.

## 5. Evidencia reproducible

```bash
# 1) Matemática determinista (fixtures numéricos, no producción)
node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/ape-predictive-prefetch.test.js
# → RESULTADO: 43 PASS / 0 FAIL

# 2) Medición REAL (servidor loopback propio, bytes y ms reales de socket TCP)
node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/predictive-prefetch-live.js
# → 8 descargas de 1.5 MB medidas · LIVE RESULTADO: 11 PASS / 0 FAIL

# 3) Cadena completa medición → predictor → generador → tags
node <scratch>/probe_ai.js
# → 13 PASS / 0 FAIL
```

Salida real del generador con evidencia medida (perfil P0, 12 Mbps):

```
#EXT-X-APE-PREFETCH:ENABLED=true,SEGMENTS=90,PARALLEL=40,ADAPTIVE=enabled,AI=enabled
#EXT-X-APE-AI-PREDICT:MODE=EWMA2+SLOPE,RISK=0%,CONF=0.6,HEADROOM=20.97,TREND=0,
  HORIZON=10s,APPLIED=90x40,DECLARED=90x40,EVIDENCE=resource-timing,SAMPLES=8,
  MBPS=251.66,BWCONF=low
```

Con el mismo enlace medido y un perfil que exige 300 Mbps (headroom 0.84):

```
#EXT-X-APE-PREFETCH:ENABLED=true,SEGMENTS=45,PARALLEL=20,ADAPTIVE=enabled,AI=enabled
#EXT-X-APE-AI-PREDICT:…RISK=67.9%,…HEADROOM=0.84,…APPLIED=45x20,DECLARED=90x40,
  EVIDENCE=resource-timing,SAMPLES=8,MBPS=251.66…
```

Sin medición (predictor reseteado):

```
#EXT-X-APE-AI-PREDICT:…RISK=n/a,CONF=0,HEADROOM=n/a,…APPLIED=90x40,DECLARED=90x40,
  EVIDENCE=none,SAMPLES=0,MBPS=0,BWCONF=none
```

AI apagada: no se emite `AI-PREDICT` y `PREFETCH` declara `AI=disabled`.

Regresión del harness del repo (`frontend/tests/e2e-bulletproof-full-audit.js`):
**25 PASS / 0 FAIL** (antes 24/1: el fallo `network-caching=105000` se corrigió respetando
la precedencia del LAB de `bulletproof_profiles` sobre la tabla t63).

## 5.b Deuda de headers cerrada en la misma tanda (medida antes/después)

Sonda real (`probe_headers.js`, 1 canal, perfil P0, con y sin Profile Manager):

| Deuda | Antes (medido) | Después (medido) |
|---|---|---|
| `X-Concurrent-Downloads` contradictorio | 8 en una línea, **256** en otra del mismo objeto (la última gana) | **8** único, sin duplicado |
| `X-Prefetch-Segments` fuera del EXTHTTP real | **ausente** (caía al overflow descartado por el consumidor) | **90** = SSOT del perfil |
| `X-Parallel-Segments` | 64 hardcodeado pisando el SSOT | **40** = SSOT |
| Fallback P0 `prefetch_parallel` | **250**, buffer 600 s, BW mín 500 Mbps | **40 / 240 s / 120 Mbps** (== PREFETCH_PRESETS) |
| `#EXTHTTP` del master token | **JSON inválido** → CA11 FAIL **10 errores** por generación | tag válido `#EXT-X-APE-PLAYBACK-TOKEN` → CA11 **PASS 0 errores** |
| `getPrefetchHeaders()` (muerto) | otro dialecto (`true/false`, `AI-ENABLED` sólo si on) | `@deprecated` + formato alineado (`enabled/disabled`, AI siempre) |

Mecanismo del fix: `EXTHTTP_PRIORITY_KEYS` + `_priorityOrderKeys()` reservan los headers
funcionales (identidad de transporte + prefetch) antes del recorte 200/8192 — antes el
orden de inserción decidía y los de prefetch se perdían; además, un bloque de
"autoridad SSOT" reescribe los 3 headers de prefetch como última palabra.

**Nota:** `X-APE-*` NO se filtra en EXTHTTP (CA1: familia interna, no debe llegar al
proveedor). Los `X-APE-Prefetch-Segments` / `X-APE-Prefetch-Parallel` que emitía
`build_exthttp()` **fueron eliminados** en esta tanda: el valor funcional viaja en
`X-Prefetch-Segments` / `X-Parallel-Segments`. Verificado con sonda: ya no aparecen.

## 5.c Verificación en NAVEGADOR REAL (Chrome headless + CDP)

Prueba reproducible: [`frontend/tests/ui-predictive-prefetch.verify.js`](../../frontend/tests/ui-predictive-prefetch.verify.js)
— sirve el frontend real por loopback, mide **6 descargas HTTP reales de 1 MB** en el
propio Chrome, alimenta `APE_BW` → `APE_PREDICT` y renderiza `ProfileManagerV9`.

Resultado: **18 PASS / 0 FAIL** · captura:
[`assets/prediccion-ai-2026-11-01.png`](assets/prediccion-ai-2026-11-01.png)

Texto realmente pintado en el panel (extraído del DOM):

```
● MEDIDO · horizonte 10 s                      [Medir ahora]
medido 167.8 Mbps · pronóstico 167.8 Mbps · tendencia 0.0% · conf 0.60
Riesgo 0% · headroom 16.78× · aplicado 90×40 de 90×40
```

Asertos clave: `APE_BW`/`APE_PREDICT`/`APE_PROFILES_CONFIG` cargados · 6 mediciones
reales (`resource-timing`) · `render()` sin error · bloque visible (`offsetParent != null`)
· toggle y botón presentes · estado `MEDIDO` · riesgo/aplicado visibles · sin `undefined`
ni `NaN` en el panel (con `StreamingEngine` real cargado).

**Bug encontrado y corregido gracias a esta prueba:** el panel pasaba `settings.bitrate`
en **Mbps** a `decide()`, que lo espera en **kbps** (como `cfg.bitrate`) → el headroom
salía 1000× inflado (`16777×` en vez de `16.78×`). Corregido con `×1000` y verificado
por aserto (`headroom < 100`).

## 5.d Otras dos correcciones de esta tanda

| Fix | Medido antes | Medido después |
|---|---|---|
| Fallback P0 `prefetch_parallel` | 250 (P0), 200/180/150/120/100 (P1-P5) | 40/20/20/10/10/6 — igual que `PREFETCH_PRESETS` |
| Precedencia `network-caching` LAB vs t63 | LAB mandaba 105 s y t63 lo pisaba con 90000 | el LAB de `bulletproof_profiles` manda: **105000** en el e2e |
| `X-APE-Prefetch-*` en EXTHTTP | presentes (2 claves por canal) | **eliminadas** (CA1) |

## 6. Límites honestos (lo que NO hace)

- **No es ML.** Es un predictor determinista (EWMA² + regresión + logística). No hay red neuronal, ni entrenamiento, ni "modelo de IA" que se pueda vender como tal.
- **No mejora píxeles ni bitrate.** Pronostica enlace y decide prefetch; la imagen la sigue dando la variante real del proveedor y el VPP del device.
- **No toca el VPS.** `decision_engine.lua` / `neuro_buffer_controller.php` quedan intactos; el cliente replica *su semántica de umbrales*, no su ejecución.
- **No manda en el device.** En TiviMate/OTT/VLC el prefetch lo decide su player; la lista solo **declara** la política aplicada y su evidencia (auditable).
- **La medición loopback mide I/O local**, no la red del ISP: sirve para probar la cadena, no para certificar caudal del usuario.
- Con `.m3u8`/segmentos en caché, Resource Timing puede aportar `transferSize=0` → esas muestras se descartan (no hay medición) y el predictor lo declara.

## 7. Rollback

1. Quitar `<script …predictive-prefetch-v9.js>` de `index-v4.html` (el generador degrada a `AI=enabled,EVIDENCE=none` sin la línea `AI-PREDICT`).
2. O revertir el bloque 8.l + el bloque SSOT del bridge en `m3u8-typed-arrays-ultimate.js`.
3. Los tests y el módulo son aditivos: borrarlos no afecta al resto.



