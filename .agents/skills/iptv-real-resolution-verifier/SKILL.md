---
name: iptv-real-resolution-verifier
description: Use when deciding whether a channel declared 4K or 8K is real or an upscale, when auditing RESOLUTION and CODECS honesty, or when writing any checker that reads the #EXT-X-APE-STREAM-TRUTH tag — encodes the measured emitter inventory, the src vocabulary that is actually written, the fields that are never evidence, and the verdict that must be returned when the tag cannot prove the source.
specialist: S3
kind: anchor
---

# iptv-real-resolution-verifier

Adaptación del concepto de `freearhey/iptv-checker` (el `ffprobe` manda, no la
etiqueta) a la capa declarativa de este repo. **No se copió código de ese proyecto**
(ver `references.md`).

## 1. Cuándo usarla

- Hay que decir si un canal "4K" es 4K real.
- Hay que puntuar honestidad de `RESOLUTION` / `CODECS` / `VIDEO-RANGE`.
- Hay que escribir un validador que lea `#EXT-X-APE-STREAM-TRUTH`.
- Un informe afirma "21.224 canales en 4K" y hay que verificarlo.

## 2. Cuándo NO usarla

- Para decidir a qué perfil degradar → `iptv-profile-fallback-doctrine`.
- Para parsear la lista completa (estructura, bloques, vocabulario) →
  `ape-lista-cartographer`.
- Para emitir el tag → se toca el generador, y eso el operador **lo prohibió**
  ("dejes como estaba el generador").

## 3. Inventario de emisores — hay CUATRO, con vocabularios distintos

Medido en `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`.

| # | Línea | Claves emitidas | De dónde sale el valor |
|---|---|---|---|
| E1 | **13029** | `src,w,h,fps,rawfps,family,pq` | objeto `__apeStreamTruth()` |
| E2 | **13056** | `src,w,h,fps,fake,real8k` | el MISMO objeto, subconjunto distinto |
| E3 | **9627** (MOTOR40) | `src,w,h,fps,rawfps,family,pq` | `src=real` si el ancho **declarado** ≥ 3840; `fps=60`, `family=HEVC`, `pq=1` **literales** |
| E4 | **9658** (bloque capacidad) | `src=fake-4k,w=3840,h=2160,fps=60,rawfps=60,family=HEVC,pq=1` | **literal estático**; sólo entra si no existe ya un tag de verdad |

Fuera del generador: `rea-export-finalizer.js:322` emite `src=probe-url|unknown`, y un
vector de test usa `src=native-4k`. **No hay vocabulario cerrado.**

**Consecuencia 1 — un canal lleva DOS líneas de verdad** (E1 y E2) con claves
distintas. Un verificador que lea sólo la primera, o sólo la última, ve media
verdad. Hay que **fusionar ambas**.

**Consecuencia 2 — `src=real` no significa "medido".** En E3 se calcula así:

```
_fake7 = (Number(_w7) >= 3840) ? '1' : '0'
src    = (_fake7 === '1') ? 'real' : 'fake-4k'
```

Es **autoreferente**: el ancho sale de `c.res` (la resolución declarada del canal),
no de un probe. `src=real` = "declaró ≥3840". **No es evidencia.**

## 4. Los siete valores de `src` y qué prueba cada uno

Vocabulario medido en `__apeStreamTruth()` (líneas 2692–2757):

| `src` | Origen | ¿Prueba la fuente? |
|---|---|---|
| `probe` | probe real del manifest (2714–2717) | **Sí, es el único que sí** |
| `perceptual4k-lock` | lock del propietario (2706–2709) | No — decisión, no medición |
| `profile` | SSOT `getProfile().settings.resolution` (2710–2713) | No — declaración del panel |
| `name` | regex sobre el NOMBRE del canal (2718–2726) | No — el nombre miente |
| `default` | fallback 1920x1080 (2692–2694, 2727) | No |
| `fake-4k` | override fake-UHD (2748–2753) | **No — y niega la fuente** |
| `fake-8k` | ídem, opt-in | **No — y niega la fuente** |

Valores vistos fuera de esa función (`real`, `native-4k`, `probe-url`, `unknown`)
se tratan como **`UNKNOWN_SRC`** y fallan cerrado.

## 5. Los cinco campos que NO son evidencia (falsos positivos medidos)

### 5.1 `w` / `h` — el default fake-UHD los sobrescribe

`const APE_FAKE_UHD_DEFAULT = '4k'` (línea 2737). Si el probe **no** confirma
exactamente `7680x4320` (2743), el bloque 2748–2753 hace:

```
r.w = 3840; r.h = 2160; r.source = 'fake-4k'
```

Es decir: **todo canal, por defecto, declara 3840×2160** aunque su fuente sea 1080p.
Esto no es una sospecha: explica el hallazgo de
`docs/audits/AUDIT_APE_LISTA_1794100720046_20261108.md:58` — **21.224 de 21.224**
canales declaran la misma `RESOLUTION=5760x3240`.

**Regla: `w`/`h` sin `src=probe` no prueban nada.** El envelope lo dice explícito:
`w`/`h` sólo se propagan si `src` no contiene `fake`
(`tools/pulse/ape-pulse-wrap.js:161-164`).

### 5.2 `family` — vale `HEVC` por defecto aunque no haya pista

`family: 'HEVC'` es el valor inicial (2693) y sólo cambia si hay `codecHint`
(2767–2771). `family=HEVC` significa "no había hint", no "es HEVC".

**Regla: contrastar `family` con `CODECS=` del `#EXT-X-STREAM-INF`.** Si `family=HEVC`
y `CODECS` empieza por `avc1` → **CONTRADICCIÓN** (rompe la GOLDEN RULE `hvc1`/`hev1`).

### 5.3 `pq` — es incondicional desde 2026-06-16

El propio envelope lo prohíbe por escrito: *"NUNCA `v.hdr` desde `pq=1`: el generador
emite PQ incondicional (decisión 2026-06-16), así que `pq=1` NO es evidencia de HDR"*
(`tools/pulse/ape-pulse-wrap.js:165-167`).

**Regla: `pq=1` no aporta nada al veredicto de resolución. Y no es HDR.**

### 5.4 `fps` / `rawfps` — 60 es el techo por clamp

`r.fps = Math.min(raw, 60)` (2764). `fps=60` es compatible con una fuente de 25.

### 5.5 La uniformidad — el tell más fuerte

`IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-metapack.sh:16`: *"El STREAM-TRUTH solo toma
**4 valores distintos** en 21.224 canales"*.

Un tag que sólo toma 4 valores sobre 21.224 canales **no está midiendo canales**: está
repitiendo una plantilla de perfil. Y `#EXT-X-APE-REALCE-SOURCE:…OBS_BPS=0…` confirma
que **no hubo bitrate observado**. Ver `docs/audits/AUDIT_APE_LISTA_1794100720046_20261108.md:182-183`.

## 6. Tabla de coherencia resolución ↔ bitrate

Presupuesto declarado en `CLAUDE.md` (§Bitrate Fallback por Resolución). Es un
**presupuesto de diseño**, no una medición.

| Resolución | `BANDWIDTH` mínimo esperado | `AVERAGE-BANDWIDTH` |
|---|---|---|
| 7680×4320 (8K) | 80 000 000 | 60 000 000 |
| 3840×2160 (4K) | 28 000 000 | 22 000 000 |
| 2560×1440 (QHD) | 16 000 000 | 12 000 000 |
| 1920×1080 @60 | 12 000 000 | 9 000 000 |
| 1920×1080 @30 | 9 000 000 | 6 500 000 |
| 1280×720 | 5 500 000 | 4 000 000 |
| 854×480 | 2 500 000 | 1 800 000 |

Uso correcto: **sólo como filtro negativo**. Si un canal declara 4K y su `BANDWIDTH`
está por debajo de 22 Mbps, es **sospechoso de upscale**. Si declara 35 Mbps con
`OBS_BPS=0`, el bitrate **no está medido**: no se usa como confirmación de nada.

Nivel ↔ resolución (Ley Cardinal 1, generador 2789–2792): `h ≥ 2160` ⇒ `L153`
(3840×2160@60), `L156` si ≥100 fps. Un `L120` sobre 2160p es **contradicción**.

## 7. Protocolo de verificación (fail-closed)

```
P1  LOCALIZAR     el bloque del canal. Un canal = dos líneas STREAM-TRUTH (E1+E2).
P2  FUSIONAR      claves de E1 ∪ E2. Si discrepan en un campo común → CONTRADICCIÓN.
P3  CLASIFICAR    src según §4. `probe` es el único que sigue; el resto para.
P4  CRUZAR        family vs CODECS= · nivel vs h · BANDWIDTH vs §6.
P5  VEREDICTO     uno de §8. Nunca "4K" por defecto.
```

Sin `#EXT-X-APE-STREAM-TRUTH` en el bloque → **`NO_VERIFICADO`**, no "SDR 1080p".

## 8. Veredictos y su uso

| Veredicto | Condición | ¿Se clasifica como 4K? |
|---|---|---|
| `REAL_PROBED` | `src=probe` **y** `w=3840,h=2160` **y** `fake` ausente/`0` | **Sí** |
| `REAL_PROBED_8K` | `src=probe` **y** `w=7680` (o `real8k=1`) | 8K |
| `FAKE_UHD` | `src=fake-4k` o `src=fake-8k`, o `fake=4k/8k` | **NUNCA** |
| `SELF_ASSERTED` | `src=real` (E3) o `native-4k` | **NUNCA** |
| `DECLARED_ONLY` | `src=profile|name|default|perceptual4k-lock` | No |
| `UNKNOWN_SRC` | cualquier otro token | No |
| `CONTRADICTION` | family/CODECS o nivel/resolución o E1≠E2 | No, y se reporta |
| `NO_VERIFICADO` | sin tag | No |

## 9. Regla dura — fake-4k 1920×1080 NUNCA es perfil 4K

Un `src=fake-4k` **no se clasifica como 4K, jamás**, aunque declare `w=3840,h=2160`,
aunque el nombre diga "4K", aunque el perfil sea P1.

Y hay que decirlo con precisión, porque los dos casos NO son iguales:

| Caso | Acción | ¿Es degradación? |
|---|---|---|
| Canal con **evidencia real** de 4K (probe verificado) | Se mantiene 4K | — |
| Canal **fake-4k** cuya fuente es 1080p | Se clasifica por su fuente real | **No.** Corregir un metadato falso no es degradar (`ANTI_DEGRADATION_LAW.md` Art. 6: "RESOLUTION declarada → resolución real") |
| Canal 4K real bajado a FHD "por estabilidad" | **Prohibido** | **Sí.** Viola Art. 1, 2 y 5 |

La ley prohíbe **degradar la señal**; no prohíbe **corregir una etiqueta**. Confundir
ambas es el error que esta skill existe para impedir.

## 10. Límite honesto (lo que este tag NO puede decir)

Con los defaults del generador, **la lista servida no puede certificar 4K real**:

- El override fake-UHD convierte todo 4K no-8K en `src=fake-4k` (2737–2753).
- `src=probe` sólo sobrevive cuando el probe dijo exactamente `7680x4320`, o cuando el
  kill-switch `APE_FAKE_UHD=0` desactiva el override.
- La resolución **de origen** (`rawW`/`rawH`, 2731) es interna: **no se emite** en la lista.

Por tanto, para certificar 4K real se necesita una de estas dos cosas, y hay que
declarar cuál se usó:

```
(a) probe externo del segmento (ffprobe) — mide píxeles reales
(b) regeneración con APE_FAKE_UHD=0 → src=probe sobrevive con w/h del probe
```

Sin (a) ni (b), el veredicto correcto es **`DECLARED_ONLY` / `NO_VERIFICADO`**.

## 11. Comandos

```bash
# 1. Inventario de src realmente emitidos en una lista (sin red)
grep -o '#EXT-X-APE-STREAM-TRUTH:src=[^,]*' LISTA.m3u8 | sort | uniq -c | sort -rn

# 2. ¿Cuántos canales declaran 8K real probado?
grep -c 'src=probe' LISTA.m3u8

# 3. Coherencia: RESOLUTION declarada vs CODECS
grep -c 'RESOLUTION=3840x2160' LISTA.m3u8
grep -c 'CODECS="avc1' LISTA.m3u8      # si es >0 con la línea anterior, revisar

# 4. Medición real de un canal (requiere ffprobe instalado; NO se instala aquí)
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,codec_name,avg_frame_rate \
  -of json 'URL_DEL_CANAL'
```

Si `ffprobe` no está disponible: **`NO COMPUTADO`** con la razón, jamás un valor
inventado. `dearbulut/iptv` hace lo mismo a su manera: un canal sin observación
concluyente se reporta `0`/"unchecked" en vez de un número inventado.

## 12. Salida esperada del verificador

```json
{
  "channel": "<tvg-id>",
  "truth_lines": 2,
  "src": "fake-4k",
  "declared": { "w": 3840, "h": 2160, "fps": 60 },
  "codec_family": "HEVC",
  "stream_inf_codecs": "hvc1.2.4.L153.B0",
  "verdict": "FAKE_UHD",
  "source_resolution": "NO_COMPUTADO",
  "reason": "el generador sobrescribe w/h con el default fake-UHD; rawW/rawH no se emiten",
  "evidence": "m3u8-typed-arrays-ultimate.js:2737,2748-2753"
}
```

`source_resolution` no puede quedar vacío: o lleva número medido, o
`NO_COMPUTADO` con razón.

## 13. Riesgos

- Creer `src=real` → bendice cualquier upscale que declare 3840.
- Leer una sola línea del tag → pierde `fake` y `real8k`.
- Usar `pq=1` como HDR → contradice el propio contrato del envelope.
- Convertir este veredicto en una degradación automática: **prohibido** (Art. 9).
