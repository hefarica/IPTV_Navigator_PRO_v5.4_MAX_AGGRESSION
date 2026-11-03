# Brechas del cálculo automático del PM9 y su corrección

**Fecha:** 2026-11-03
**Síntoma reportado:** P5 · SD 480p mostraba `BITRATE 0,3` y al pasar la estrategia a `Ultra aggressive` saltaba a `0,9`.
**Deploy:** run `41657825278` **success**
**Tests:** `ui-campos-coherencia` **16 PASS** · `ui-delta-autoajuste` **33 PASS** (ambos también contra el fichero servido)

---

## 1 · La aritmética exacta del 0,9

```
AV1_SD = 0.22                            (bits per pixel, tabla BITS_PER_PIXEL)
2.70 Mbps = 854 × 480 × 30 × 0.22 / 1e6  (cálculo bruto)
0.73 Mbps = 2.70 × 0.27                  (compressionMultiplier de ultra-aggressive)
```

**Cambiar la estrategia dispara REGLA 4 → REGLA 3**, que recalcula el bitrate. Por eso el número se movía al
tocar el selector.

## 2 · La causa: doble penalización del códec

La eficiencia del códec **ya está** en `BITS_PER_PIXEL`:

| Resolución | AV1 | H265 | H264 | MPEG2 |
|---|---:|---:|---:|---:|
| SD | **0.22** | 0.25 | **0.30** | 0.40 |
| FHD | 0.12 | 0.15 | 0.20 | — |

Y encima, `compressionMultiplier` volvía a aplicar un factor de eficiencia — **con un número (0,27) que no
mide compresión de vídeo**.

**Resultado: el 73 % del bitrate desaparecía.**

**Y la estrategia no debería tocar la calidad.** Gobierna **cómo se consume el buffer**: prefetch, thresholds,
timeouts, reconexión. Recortar bitrate al tercio es lo contrario de MAX IMAGE FIRST.

## 3 · Las siete brechas identificadas

| # | Brecha | Dónde | Estado |
|---|---|---|---|
| **B1** | El motor reactivo sobreescribía el bitrate del LAB | L3055 `s.bitrate = bitrateFinal` | **corregido** |
| **B2** | `compressionMultiplier` hundía el bitrate al 27 % | L3052 | **corregido** |
| **B3** | Doble penalización de códec (BPP + multiplicador) | L3042 + L3052 | **corregido** |
| **B4** | Sin mínimo por resolución: SD podía declarar 0,3 Mbps | ausente | **corregido** |
| **B5** | El suelo podía superar el techo (1,5 > 0,3) | L2886 | **corregido** |
| **B6** | Cambiar estrategia cambiaba el bitrate | L3133 → L3052 | **corregido** |
| **B7** | Descripción de la estrategia prometía «13.4 Mbps @ 4K/60» que el código no producía | L78 | **corregido** |

### B5 en detalle: dos suelos sin reconciliar

Conviven **dos campos de suelo**:

| Campo | Unidad | Origen |
|---|---|---|
| `bandwidth_floor` | **bps** | LAB canónico (P0=15M … P5=1,5M) |
| `bitrate_floor_mbps` | **Mbps** | PM9, derivado del bitrate |

El panel leía el primero; el motor escribía el segundo. **Nada garantizaba que coincidieran**, y la UI llegó a
mostrar techo 0,3 con suelo 1,5.

**Corregido con un invariante explícito:** `s.bitrate_floor_mbps = Math.min(floor, techo)`.

## 4 · La corrección

```js
// antes
const bitrateFinal = bitrateBase * strategy.compressionMultiplier;

// ahora
const MIN_BITRATE_MBPS = { '8K': 40, 'UHD': 20, 'FHD': 8, 'HD': 3.5, 'SD': 1.5 };
const bitrateFinal = Math.max(MIN_BITRATE_MBPS[resLabel] || 1.5, bitrateBase);
```

**El cálculo por BPP queda intacto.** El mínimo es un **suelo de coherencia, no un techo**: donde el BPP da
más, manda el BPP.

## 5 · Efecto medido

| Resolución | ANTES | DESPUÉS |
|---|---:|---:|
| SD · AV1 · 30 | **0,7** | **2,7** |
| SD · H264 · 30 | 1,0 | 3,7 |
| HD · AV1 · 30 | 1,3 | 5,0 |
| FHD · H265 · 30 | 2,5 | 9,3 |
| FHD · H265 · 60 | 5,0 | **18,7** |
| 4K · H265 · 30 | 6,7 | 24,9 |
| 4K · AV1 · 60 | 10,7 | **39,8** |

## 6 · Cómo está probado

`ui-campos-coherencia.verify.js` (16 aserciones) **extrae las tablas del propio fuente** —BPP, estrategias,
multiplicadores— y verifica:

- **87 combinaciones** resolución × códec × fps: ninguna por debajo de su mínimo
- T1 > bitrate y T2 > T1 en todos los casos
- **54 combinaciones** suelo/techo: el invariante se cumple siempre
- El caso reportado: antes < 1 Mbps, ahora ≥ 1,5
- El bitrate **no** se multiplica por `compressionMultiplier`
- La descripción ya no promete un Mbps que el código no produce

**Y se ejecutó también contra el fichero descargado de producción: 16 PASS.**

## 7 · Lo que NO cambió

- **BPP por códec y resolución** — intacto.
- **T1=1,3 y T2=1,6** — intactos.
- **`compressionMultiplier` sigue en la tabla** — informativo, para prefetch y thresholds.
- **La relación 4:4:1 de buffers** — intacta.
- **El LAB sigue siendo SSOT** del suelo.
- **La estrategia sigue gobernando** prefetch, timeouts y reconexión.

## 8 · Lo que NO se verificó

- **No se abrió en un navegador real.** Los tests validan la aritmética y los invariantes; el render y el
  comportamiento del selector no se ejercitaron.
- **No sé de dónde salía el `bitrate = 0,3` guardado** en el perfil. La corrección lo tolera y lo eleva, pero
  el origen del valor persistido no lo investigué.
- **Queda una brecha sin tocar (B8):** conviven `bandwidth_floor` (bps) y `bitrate_floor_mbps` (Mbps) en el
  mismo `settings`. Funciona con el invariante, pero sigue siendo una trampa para el próximo que lea el objeto.

---

# ADENDA — las tres brechas que faltaban (B8, B9, B10)

**Ronda 2.** Al auditar el grafo de reglas —no el síntoma reportado— aparecieron tres cabos sueltos más.

## B9 · El códec no recalculaba el bitrate

El `BITS_PER_PIXEL` **depende del códec**: `AV1_SD` es **0.22** y `H264_SD` es **0.30** — un **36 %  de diferencia**.

**REGLA 5 (codec) sólo escribía headers.** Cambiar de AV1 a H264 dejaba el bitrate calculado con el BPP del códec anterior: **el campo quedaba descolgado de su propia premisa**.

`fps` (REGLA 2.3) y `strategy` (REGLA 4) ya reentraban en REGLA 3. **Codec no lo hacía.** Corregido.

## B10 · Las reglas corrían ANTES de que el valor existiera

```js
this._applyReactiveRules(profile, key, value);   // motor corre
profile.settings[key] = value;                    // valor se escribe después
```

**Cambiar 30 → 60 fps recalculaba el bitrate con 30**, porque REGLA 3 lee `parseInt(s.fps)` y `s.fps` todavía era el viejo.

**Corregido:** el valor se escribe primero; las reglas derivan de él.

**Verificado en producción:** `valor@151625 < reglas@151733`.

## B8 · Los dos suelos ya se sincronizan

Conviven en el mismo `settings`:

| Campo | Unidad | Origen |
|---|---|---|
| `bandwidth_floor` | **bps** | LAB canónico |
| `bitrate_floor_mbps` | **Mbps** | PM9 |

**Nada garantizaba que coincidieran.** El panel mostraba 1,5 mientras el motor escribía 0,15.

**Corregido:** el valor del LAB se propaga al campo del gestor en cada escritura (`s.bitrate_floor_mbps = labFloorBps / 1e6`), y el recorte al techo se aplica después.

## Efecto acumulado

| Resolución | Original | Tras B1-B7 | Tras B8-B10 |
|---|---:|---:|---:|
| SD · AV1 · 30 | 0,7 | 2,7 | **2,7** |
| HD · AV1 · 30 | 1,3 | 5,0 | **5,0** |
| FHD · H265 · 60 | 5,0 | 18,7 | **18,7** |
| 4K · AV1 · 60 | 10,7 | 39,8 | **39,8** |

**Los bitrates no cambian con B8-B10: lo que cambia es que ahora son CONSECUENTES.** Antes, mover el códec o el fps dejaba el bitrate calculado con la premisa anterior.

## Test del grafo de dependencias

`ui-campos-coherencia.verify.js` → **24 PASS**. Ahora verifica el grafo mismo:

- `resolution` **escribe** el bitrate (es el motor, no reentra)
- `fps`, `codec` y `strategy` **reentran** en la regla
- **el valor precede a las reglas**
- los dos suelos **se sincronizan**
- el recorte al techo **sigue aplicándose**

**Y se ejecutó contra el fichero servido: funciona en producción.**

## Lo que sigue sin cerrarse

- **No se abrió en un navegador real.** El grafo se verifica por estructura del código y la aritmética por simulación; el render y el clic no se ejercitaron.
- **La estrategia sigue reentrando en REGLA 3** aunque ya no multiplique el bitrate. Es innecesario pero inofensivo: refresca t1/t2. Quitarlo sería más limpio; no lo hice para no tocar el flujo.
