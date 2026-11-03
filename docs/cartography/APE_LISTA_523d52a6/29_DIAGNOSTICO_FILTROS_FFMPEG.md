# Diagnóstico filtro a filtro — por qué la receta de AXN no escala en ffmpeg

**Fecha:** 2026-11-03
**ffmpeg:** 8.0.1-full_build (Gyan)
**Entrada sintética:** `testsrc2=320x180@25`, 0,1–0,3 s
**Método:** cada filtro probado AISLADO, no la cadena entera.

---

## 1 · Cadena de la lista (la que reproduce "maravillosamente" en campo)

```
nlmeans=s=2.5:p=5:r=11,
bwdif=mode=1:parity=-1:deint=0,
gradfun=radius=12:strength=0.8,
unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,
zscale=transfer=bt709:primaries=bt709:matrix=bt709:dither=error_diffusion:range=full,
minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=0
```

| Filtro | Resultado |
|---|---|
| `nlmeans=s=2.5:p=5:r=11` | **OK** |
| `bwdif=mode=1:parity=-1:deint=0` | **OK** |
| `gradfun=radius=12:strength=0.8` | **OK** |
| **`unsharp` con `chroma_msize_x=0`** | **FALLA** |
| `unsharp` sin parámetros de croma | **OK** |
| **`unsharp` con `chroma_msize_x=3`** | **OK** |
| **`zscale=transfer=bt709…`** | **FALLA** |
| `minterpolate=fps=120:…:scd=0` | **OK** |

### Los dos errores literales

```
[Parsed_unsharp_3] Value 0.000000 for parameter 'chroma_msize_x' out of range [3 - 23]
Error applying option 'chroma_msize_x' to filter 'unsharp': Result too large

[Parsed_zscale_4] code 3074: no path between colorspaces
```

**Cinco de los siete filtros funcionan. Dos no.** La corrección `chroma_msize_x=0 → 3` está **probada**: con `3` compila y ejecuta.

---

## 2 · Cadena del generador (L3714)

```
fieldmatch, decimate, nlmeans=s=3.0:p=7:r=15, bwdif=…, deband=…, pp=ac/dr/ci,
unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4,
colorspace=all=bt2020:trc=smpte2084:format=yuv444p10le:fast=1,
tonemap=mobius:param=0.3, hqdn3d=4:3:12:9, fps=fps=60:round=near,
minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs
```

| Filtro | Resultado |
|---|---|
| `fieldmatch` · `decimate` · `deband` · `tonemap` · `hqdn3d` · `fps` | **OK** |
| **`pp=ac/dr/ci`** | **FALLA** |
| **`colorspace=all=bt2020:trc=smpte2084:format=yuv444p10le:fast=1`** | **FALLA** |

**La cadena del generador NO tiene el defecto del `unsharp`.** Usa `unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4`, sin parámetros de croma. **Ese defecto es exclusivo de la lista.**

**Pero tiene dos propios:** `pp` (filtro postproc, no compilado en este ffmpeg 8) y `colorspace` (la conversión a yuv444p10le desde yuv420p de entrada no tiene ruta directa).

---

## 3 · Por qué la lista "funciona de maravilla" si su cadena no ejecuta

**Esta es la pregunta que importa, y la respuesta es incómoda.**

La cadena falla en ffmpeg. En VLC le faltan módulos (medido antes: 1/4, 1/6, 1/6 de los necesarios). **Y sin embargo el operador confirma que escala maravillosamente.**

Las tres explicaciones compatibles con lo medido:

1. **VLC descarta la cadena y sigue reproduciendo.** Un filtro inválido en `#EXTVLCOPT:video-filter` no rompe la reproducción: VLC avisa y aplica lo que pueda.
2. **El escalado que se percibe viene del panel o del televisor**, no de la cadena. La lista también declara `#EXT-X-APE-4KFALSE-MODE:ACTIVE` con `TARGET-RES:3840x2160`, que es una **declaración de enhancement**, no un proceso de píxeles.
3. **Parte de la cadena sí se aplica** si VLC resuelve los filtros que sí tiene (`nlmeans`, `bwdif`, `gradfun`, `unsharp` luma) y descarta solo los que faltan.

**No puedo distinguir entre las tres con lo medido.** Lo que sí sé: **la cadena completa no ejecuta en ffmpeg, y eso está medido, no supuesto.**

---

## 4 · Corrección propuesta, probada

| Cadena | Cambio | Estado |
|---|---|---|
| **Lista** | `chroma_msize_x=0:chroma_msize_y=0` → `3:3` | **probado OK** |
| **Lista** | `zscale` bt709 | **falla**; requiere fijar el colorspace de entrada o retirarlo |
| **Generador** | `pp=ac/dr/ci` | **falla**; el filtro `pp` no está en ffmpeg 8 |
| **Generador** | `colorspace=all=bt2020…` | **falla** desde yuv420p; requiere `iall` o un paso intermedio |

**La corrección del `unsharp` es la única de las cuatro que está probada de punta a punta y no cambia la intención del diseño:** activa la matriz de croma con intensidad 0, que es exactamente lo que la variante certificada del paquete hace (`chroma_msize_x=3` con `chroma_amount=0.0`).

---

## 5 · Lo que el paquete certifica y esto matiza

El paquete reporta `ffmpeg_exit_code: 0` con:

```
hqdn3d=luma_spatial=2.0:chroma_spatial=1.5:luma_tmp=3.0:chroma_tmp=2.5,
yadif=mode=1:parity=-1:deint=0,
unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.25:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.0,
minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=0
```

**Su cadena es distinta a la de la lista:** usa `hqdn3d` y `yadif` en lugar de `nlmeans`, `bwdif`, `gradfun` y `zscale`. **Es una cadena que compila, pero no es la de AXN.**

Por eso `ffmpeg_exit_code: 0` en su prueba **no acredita que la cadena de la lista compile.** Son cadenas diferentes. Y su propio JSON lo dice: `production_quality_test: false`, `synthetic_filter_compilation_smoke_test`.

---

## 6 · Lo que este diagnóstico no prueba

- **No probé sobre un stream real.** `testsrc2` es yuv420p sintético; parte de los fallos de `zscale` y `colorspace` pueden depender del formato de entrada real.
- **No probé en VLC.** Los módulos de ffmpeg y los de VLC son distintos.
- **No medí escalado.** Ninguna de estas pruebas escala: todas son compilación de grafo.
- **No sé qué parte de la cadena aplica VLC.** Ese es el experimento que falta y requiere un reproductor.
