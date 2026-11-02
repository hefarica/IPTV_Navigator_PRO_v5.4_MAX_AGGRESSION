# Las cadenas REALES de la lista: ninguna ejecuta, y ninguna escala

**Fecha:** 2026-11-02 · **Método:** ffmpeg 8.0.1 full build en local, medición en la salida del grafo con `showinfo`.
**Entrada:** `APE_LISTA_1793589060441.m3u8`, las **tres** cadenas distintas de `#EXTVLCOPT:video-filter=`.
**Reproducir:** `node tools/ape-image-recipes/v2_chains_local.js --chains tools/ape-image-recipes/ref_chains.txt`

## 0 · El resultado en una línea

```
TAL CUAL     exit=4   ->  0 de 3 ejecutan
CORREGIDAS   exit=0   ->  3 de 3 ejecutan

REF1  1280x720   -> 1280x720     (7.457 canales)
REF2  1920x1080  -> 1920x1080    (2.308 canales)
REF3  3840x2160  -> 3840x2160    (  808 canales)
```

**Ninguna de las tres cadenas de la lista puede ser construida por ffmpeg.** Y las que sí ejecutan tras
corregirlas **devuelven exactamente la resolución de entrada**: no escalan.

Esto cierra por medición lo que la ronda 39 había establecido por inspección de texto (F-4).

---

## 1 · Los cuatro defectos, cada uno con su error y su alcance

| # | Defecto | Error literal de ffmpeg | Canales |
|---|---|---|---:|
| **D1** | `unsharp=...:chroma_msize_x=0:chroma_msize_y=0` | `Value 0.000000 for parameter 'chroma_msize_x' out of range [3 - 23]` | **10.573** |
| **D2** | `zscale ...:matrix=2020ncl` | `Invalid chars 'cl' at the end of expression '2020ncl'` | 808 |
| **D3** | `minterpolate ...:scd=5` | `Value 5.000000 for parameter 'scd' out of range [0 - 1]` | 808 |
| **D4** | `zscale transfer=st2084` | `Unable to parse option value "st2084"` | 808 |

**D1 afecta a las tres cadenas, o sea a los 10.573 canales.** Los otros tres son exclusivos de la cadena 3,
la de los 808 canales 4K/PQ.

### Por qué D1 es el grave

`unsharp` declara en su propia ayuda `chroma_msize_x <int> ... (from 3 to 23)`. **Cero no es un valor
suave: está fuera del rango y el filtro no se instancia.** La intención obvia —«no tocar el croma»— no es
expresable así; el mínimo es 3.

Y afecta a **todos** los canales porque `unsharp` está en las tres cadenas.

### D2 es un guion bajo

```
matrix=2020ncl   -> FALLA  "Invalid chars 'cl'"
matrix=2020_ncl  -> OK
matrix=bt2020nc  -> OK
```

**A la lista le falta un guion bajo.** Y esto no es teoría: las cadenas V2 que propuso el operador
escriben `matrix=2020_ncl` — con guion bajo — y **por eso P3 sí ejecuta** mientras REF3 no. La lista y la
propuesta del operador no coinciden en este punto, y la del operador es la que funciona.

### D3 y D4 son la misma clase que en las V2

`scd` es el **método** (0–1); el umbral va en `scd_threshold` (0–100). Y zimg llama `smpte2084` a lo que
la lista llama `st2084`. Los dos ya aparecieron al auditar las V2 del operador.

---

## 2 · Corrección y verificación

`tools/ape-image-recipes/fix_ref_chains.js` aplica exactamente cuatro cambios, cada uno con su error
medido en el comentario de cabecera. No toca resoluciones, ni fps, ni radios, ni el orden.

```
node tools/ape-image-recipes/fix_ref_chains.js
# -> tools/ape-image-recipes/ref_chains_fixed.txt
node tools/ape-image-recipes/v2_chains_local.js --chains tools/ape-image-recipes/ref_chains_fixed.txt
# exit 0
```

---

## 3 · Lo que esto significa para la pregunta «cómo lo hizo esta lista»

La respuesta, medida, es: **no lo hizo por este carril.**

- Las tres cadenas **no se pueden instanciar** tal como están escritas (0 de 3).
- Corregidas, **devuelven la resolución de entrada** (1280→1280, 1920→1920, 3840→3840).

O sea que **el `video-filter` de la lista no puede haber producido ninguna mejora de resolución, ni
siquiera en el caso en que el reproductor lo ejecutara**, porque no contiene un escalador y además no
arranca.

Lo que sí puede explicar que la lista «se vea bien» es lo que el propio operador ya concluyó y este
informe no contradice: **el VPP del SoC y los `SESSION-DATA`**. Este documento solo cierra la puerta del
carril `video-filter`.

---

## 4 · Cuatro defectos de mi propio banco, todos encontrados y corregidos

Un banco que acusa a la cadena siendo culpable él no sirve. En esta línea aparecieron cuatro:

1. **Heredoc a columna 1 dentro de `run: |`** → YAML inválido, el workflow no arrancaba.
2. **PNG no admite `yuv420p10le`** → el encoder fallaba y se leía como fallo de filtro.
3. **`testsrc2` sin metadatos de color** → `code 3074: no path between colorspaces`; zimg no puede
   convertir desde un espacio desconocido. Se etiqueta con `setparams`.
4. **`$m:primaries` en PowerShell se parsea como variable con scope** → cuatro valores de matriz
   «fallaban» por igual, incluido `bt2020nc` que ya estaba probado bueno. El test era el roto.

Y dos errores lógicos propios: atar el `scd` a `mb_size=8` (la cadena 3 no lo lleva, así que REF3 quedó
sin corregir una pasada entera), y medir en un fichero PNG en vez de en la salida del grafo.

**Ninguno de esos seis se detectó razonando. Todos se detectaron ejecutando y leyendo el error real.**

---

## 5 · Lo que este informe NO dice

- **No dice que el VPP del SoC no funcione.** No lo he medido; este informe no habla de él.
- **No he medido calidad de imagen.** Que un frame salga con la resolución correcta no dice cómo se ve.
- **No he probado en VLC.** Todo esto es ffmpeg. La pregunta «¿y VLC?» sigue abierta y no la cierro.
- **No he tocado la lista servida ni el VPS.** Las cadenas corregidas son un artefacto del repo.
