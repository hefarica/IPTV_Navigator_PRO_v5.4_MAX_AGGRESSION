# Las cadenas V2 del operador no ejecutan en ffmpeg: cinco dialectos distintos en la misma cadena

**Fecha:** 2026-11-02 · **Método:** ejecución real en ffmpeg del runner de CI.
**Evidencia:** runs `41487670064` (originales), `41488179961` (corrección 1), `41488743058` (corrección 2),
`41489250513` (corrección 3).
**Cadenas:** `tools/ape-image-recipes/v2_chains.txt` (originales, sin editar) y
`tools/ape-image-recipes/v2_chains_fixed.txt` (corregidas).

## 0 · Qué se probó y qué no

Se probaron **cuatro de las seis** cadenas V2: P5, P4, P3, P2. **P0 y P1 no se evaluaron** porque su
entrada es 7680×4320 y su destino 11520×6480, y un frame en 4:4:4 16-bit a esa resolución excede el
presupuesto de memoria del runner. **Eso es un motivo, no un aprobado.**

El origen es sintético (`testsrc2`) en la resolución de origen declarada. Se mide **el grafo de filtros
y la aritmética de resolución**, no cómo se ve la imagen.

## 1 · Resultado: 4 de 4 originales fallan

```
P5 | FALLA exit=234 | No option name near 'ac/dr/ci'
P4 | FALLA exit=234 | No option name near 'ac/dr/ci'
P3 | FALLA exit=234 | Unable to parse option value "lanczos+accurate_rnd+full_chroma_int"
P2 | FALLA exit=234 | Unable to parse option value "lanczos+accurate_rnd+full_chroma_int"
```

**Cero de cuatro ejecutan.** Y fallan por **cuatro causas distintas**, no por una.

## 2 · Las cinco piezas que no son ffmpeg, cada una con su error

| Pieza | Error literal de ffmpeg | Dialecto real |
|---|---|---|
| `pp=ac/dr/ci` | `No option name near 'ac/dr/ci'` | **VLC / libpostproc**. El `pp` de ffmpeg no acepta esa sintaxis; `ac/dr/ci` es la de VLC |
| `filter=lanczos+accurate_rnd+full_chroma_int` | `Unable to parse option value` | **filtro `scale`**. `accurate_rnd` y `full_chroma_int` son flags de `sws_flags`; `zscale` sólo acepta nombres de kernel |
| `transfer=bt1886` | `Unable to parse option value "bt1886"` | **ninguno**. BT.1886 es una EOTF de display; zimg no la expone como valor de transfer |
| `transfer=st2084` | `Unable to parse option value "st2084"` | **zimg escribe `smpte2084`** |
| `dither=blue-noise` | `Unable to parse option value "blue-noise"` | **libplacebo**. Es `dithering=blue-noise`; zscale sólo tiene none/ordered/random/error_diffusion |

**Y aquí está el fondo del hallazgo:** una sola cadena mezcla **cuatro dialectos incompatibles**.

- `pp=ac/dr/ci` → sintaxis de **VLC**
- `zscale`, `minterpolate`, `nlmeans`, `bwdif` → sólo **ffmpeg**
- `accurate_rnd+full_chroma_int` → del filtro **`scale`** de ffmpeg, no de `zscale`
- `dither=blue-noise` → de **libplacebo**

**Ningún motor puede ejecutar esa cadena completa.** ffmpeg rechaza `pp=ac/dr/ci`; VLC no tiene
`zscale` ni `minterpolate`. La cadena no es «de VLC» ni «de ffmpeg»: es una fusión de las dos que no
corre en ninguna.

## 3 · La corrección: las cadenas corregidas ya parsean, pero el banco falla antes de medir

Corregidas las cinco piezas (`v2_chains_fixed.txt`), el error cambia de naturaleza:

```
ORIGINAL   exit=234   error de parseo del grafo de filtros
CORREGIDA  exit=222   sin ningún mensaje de filtro
```

**exit 222 con stderr vacío no es un error de filtro.** El grafo se construye. Lo que falla es la etapa
de salida del **banco de pruebas** (el frame se escribe a PNG en 16-bit tras forzar `rgb48be`).

**No he aislado esa causa.** Lo que sí está establecido: ninguna de las cinco piezas ajenas vuelve a
aparecer en el mensaje, y el error dejó de ser de filtro. **La cadena corregida no está probada como
funcional**: está probada como *parseable*, que es un paso y no el final.

## 4 · El defecto que cometí, y que ya está corregido en el banco

La primera versión escribía el frame a PNG en `yuv420p10le`. **PNG no soporta 10-bit 4:2:0**, así que
el encoder fallaba y el rojo parecía de la cadena. Se cambió a 16-bit RGB. Un banco que confunde su
propio encoder con el objeto que mide no sirve.

## 5 · Lo que esto significa para «APLICA TU ESTOS VIDEOFILTERS»

No se pueden aplicar. No por política ni por preferencia de capa: **no ejecutan**.

Y hay un segundo motivo, independiente de este: aunque ejecutaran, **la lista de referencia no tiene
escalador en ninguna de sus tres cadenas** (`18_VIDEO_FILTER_LANE.md`). Estas V2 sí lo tienen
(`zscale=w=3840:h=2160`). Son cosas distintas: la lista no escala, y la propuesta de reemplazo no corre.

## 6 · Lo que este informe NO dice

- **No dice que las V2 sean mala idea.** Dice que, tal como están escritas, no hay motor que las
  ejecute, y nombra las cinco piezas responsables con el error literal de cada una.
- **No he medido la calidad de imagen.** Ni una cadena que ejecute ha producido un frame medible.
- **No he probado P0 ni P1.** Motivo declarado en §0.
- **No he tocado la lista servida ni el VPS.**

## 7 · Reproducir

```bash
# originales: deben FALLAR (prueba que el banco tiene filo)
# corregidas: deberían ejecutar y dar la resolución declarada (aún no lo consiguen: exit 222)
gh run list --workflow=ape-v2-chains-proof.yml --limit 1
```

Las cadenas están en `tools/ape-image-recipes/v2_chains.txt` y `v2_chains_fixed.txt`, sin editar las
originales.

---

# 8 · Segunda pasada, en ffmpeg LOCAL (8.0.1 full build) — cuatro defectos más y tres cadenas que ya funcionan

La primera pasada se quedó en `exit 222` sin diagnóstico. Se reprodujo en local en un segundo. El 222
era `AVERROR(ERANGE)`, y detrás había **cuatro defectos más**, no uno.

## 8.1 · `gradfun` exige `strength` ≥ 0,51 — los cuatro perfiles lo violaban

```
[Parsed_gradfun_7] Value 0.400000 for parameter 'strength' out of range [0.51 - 64]
Error applying option 'strength' to filter 'gradfun': Result too large     exit -34 = 222
```

La ayuda del propio ffmpeg lo declara: `strength <float> ... (from 0.51 to 64)`.

| Perfil | strengths del operador | fuera de rango |
|---|---|---|
| P5 | 0.4, 0.3 | **2** |
| P4 | 0.45, 0.3 | **2** |
| P3 | 0.55, 0.35 | **1** |
| P2 | 0.5, 0.3 | **2** |

**El deband por debajo de 0,51 no existe en este filtro.** Corregido a 0,51, que es el deband más suave
que el filtro sabe hacer. Intentar ser más suave que el mínimo no es posible.

## 8.2 · `scd` es el MÉTODO, no el umbral — y esto rompe 808 canales de la LISTA DE REFERENCIA

```
scd            <int>     scene change detection method      (from 0 to 1)    default fdiff
scd_threshold  <double>  scene change threshold             (from 0 to 100)  default 10
```

La lista escribe un **umbral** en el campo del **método**:

```
scd=0  -> 9.765 canales  VALIDO
scd=5  ->   808 canales  FUERA DE RANGO [0-1]
```

Prueba directa: `scd=0` → exit 0 · `scd=1` → exit 0 · **`scd=5` → exit -34**.

**La cadena 3 de la lista de referencia — la de los 808 canales 4K/PQ — tiene un parámetro que ffmpeg
rechaza al construir el grafo.** No es un valor discutible: el filtro no se instancia.

Nótese que el propio JSON del operador usa `"scd_threshold": 3` como umbral — la confusión viene del
documento de origen, que mezcla los dos nombres.

## 8.3 · `zscale=transfer=linear` no produce ni un frame si la fuente no tiene metadatos de color

```
[Parsed_zscale_0] code 3074: no path between colorspaces
```

Falla **igual con `transfer=bt709`**: no es `linear`, es que zimg no puede convertir desde un espacio de
color **desconocido**. Con `setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709` la misma
cadena pasa. **Defecto del banco, no de la cadena** — el tercero que cometí en esta línea, tras el
heredoc que rompía el YAML y el PNG que no admite 10-bit 4:2:0.

## 8.4 · `minterpolate` a 6144×3456 no puede asignar memoria

```
[Parsed_minterpolate_8] Failed to configure input pad
Task finished with error code: -12 (Cannot allocate memory)
```

No es un parámetro fuera de rango: es que la estimación de movimiento con `mci/aobmc/vsbmc` a esa
resolución **no cabe**. El objetivo de P2 (6144×3456) no es alcanzable con este filtro en esta máquina.

## 8.5 · Lo que ahora está medido

Medición en la **salida del grafo** con `showinfo`, sin encoder de por medio:

```
P5  854x480   -> 1920x1080   declarado 1920x1080   OK
P4  1280x720  -> 2560x1440   declarado 2560x1440   OK
P3  1920x1080 -> 3840x2160   declarado 3840x2160   OK
P2  3840x2160 -> 6144x3456   FALLA: minterpolate sin memoria
```

**Tres de cuatro cadenas corregidas ejecutan y producen EXACTAMENTE la resolución declarada.** Es la
primera vez en la sesión que una cadena de vídeo de este proyecto pasa de "está escrita" a "corre y da
lo que dice".

Reproducible en local sin CI:

```bash
node tools/ape-image-recipes/v2_chains_local.js
# exit 0 = todas ejecutan y dan su resolución · 4 = alguna falla · 5 = sin ffmpeg
```

## 8.6 · Lo que esto NO dice

- **No dice que P2 sea imposible.** Dice que no cabe aquí. Un host con más RAM podría.
- **No he medido calidad de imagen.** Que un frame salga a la resolución declarada no dice cómo se ve.
- **No he probado P0 ni P1**, que siguen fuera por tamaño.
- **No he tocado la lista de referencia ni el VPS.** El hallazgo de `scd=5` es sobre la lista; corregirla
  es decisión del generador.
