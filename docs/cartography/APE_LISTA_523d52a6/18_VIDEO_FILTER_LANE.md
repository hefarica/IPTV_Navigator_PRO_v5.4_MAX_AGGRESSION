# El carril de vídeo: tres cadenas, ningún escalador, y `minterpolate` a 120 en las 10.573

**Fecha:** 2026-11-02 · **Entrada:** `APE_LISTA_1793589060441.m3u8` · solo lectura.
**Método:** extracción y clasificación de los `10.573` valores de `#EXTVLCOPT:video-filter`.

## 0 · Lo primero: no hay 10.573 cadenas. Hay TRES.

```
10.573 ocurrencias de #EXTVLCOPT:video-filter=
        3 valores distintos
```

| Cadena | Canales | Módulos | Chars |
|---|---:|---:|---:|
| **1** | **7.457** | `hqdn3d`, `yadif`, `unsharp`, `minterpolate` | 277 |
| **2** | **2.308** | `nlmeans`, `bwdif`, `gradfun`, `unsharp`, `zscale`, `minterpolate` | 344 |
| **3** | **808** | `nlmeans`, `bwdif`, `gradfun`, `unsharp`, `zscale`, `minterpolate` | 348 |

**Toda la «calibración por canal» del vídeo son tres cadenas.** Los 604 MB de la lista contienen 3,24 MiB
de texto de filtro y sólo tres combinaciones distintas. Eso no es un defecto en sí — es el hecho del que
salen los siguientes.

---

## 1 · F-18 · Ninguna de las tres cadenas escala. El upscale no existe.

Busqué `w=`, `h=`, `scale=` y `zscale=…:w=` en las tres cadenas. **No hay ninguno.**

La única `zscale` presente (cadenas 2 y 3) es:

```
zscale=transfer=bt709:primaries=bt709:matrix=bt709:dither=error_diffusion:range=full
```

Sin `w` ni `h`: **es una conversión de espacio de color, no un escalado.**

**Severidad: ALTA** · Capa: filtro de vídeo

**Y aquí está la contradicción de fondo:** la lista declara `#EXT-X-APE-4KFALSE-TARGET-RES: 3840x2160`
en **los 10.573 canales**, y las cadenas que deberían llevarlos ahí **no contienen un solo escalador**.
El objetivo 4K no tiene mecanismo en este carril.

Y no viola el principio del operador por ser conservador: **no hacer upscale no es downscale**, así que la
doctrina «nunca downscale» se cumple. Pero la doctrina **Crystal 4K UHD exige mejora**, y aquí no hay
ninguna: 7.457 canales de 720p se quedan en 720p con un desenfoque y un enfoque encima.

---

## 2 · F-19 · `minterpolate=fps=120` en las tres, sobre fuentes de 30 y 60

```
minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=0    (cadenas 1 y 2)
minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=5    (cadena 3)
```

Cruzado con `#EXT-X-APE-FPS-SUPREMACY` (ronda 31: **30 fps en 7.457 canales, 60 fps en 3.116**):

| Cadena | Fuente declarada | Objetivo | Factor |
|---|---:|---:|---:|
| 1 (7.457 ch) | **30 fps** | 120 | **4×** |
| 2 y 3 (3.116 ch) | **60 fps** | 120 | 2× |

**`me=epzs` es el estimador de movimiento barato** — el propio documento del operador lo dice: *«`epzs` es
la barata»*. Así que la lista pide la interpolación más caras que existe (4× a 120 fps) con el estimador
más barato. Es la combinación que produce artefactos con más probabilidad, no la que los evita.

---

## 3 · F-20 · `scd=0` en 9.765 canales: interpolando a través de los cortes de escena

```
scd=0   -> 7.457 + 2.308 = 9.765 canales
scd=5   ->          808 canales
```

`scd` es el umbral de detección de cambio de escena de `minterpolate`. **En `0` está desactivada.**

Interpolar de 30 a 120 fps **sin detección de corte** significa generar 3 frames sintéticos entre dos
frames que pertenecen a planos distintos: el resultado típico es el fantasma/estela en cada corte. Los
808 canales de 4K sí tienen `scd=5`; **los otros 9.765 no.**

---

## 4 · F-21 · La cadena 2 fuerza BT.709 mientras el mismo bloque declara BT.2020

```
Filtro (cadena 2, 2.308 canales): zscale=transfer=bt709:primaries=bt709:matrix=bt709
Metadata del mismo bloque:        HDR-PRIMARIES: BT2020
                                  HDR-COLORSPACE: BT2020
                                  HDR-MATRIX: BT2020_NCL
```

**Severidad: MEDIA** · Dos capas del mismo bloque de canal declaran gamuts distintos. La cadena 3 sí usa
`st2084/bt2020`, así que el generador sabía hacerlo; la 2 se quedó en bt709.

---

## 5 · F-22 · Los parámetros son de ffmpeg, en un campo que se llama VLC

Los tres valores usan la convención de ffmpeg, con **guiones bajos**:

```
luma_spatial=2.0   luma_msize_x=3   mi_mode=mci   mc_mode=aobmc   vsbmc=1   dither=error_diffusion
```

Y en el **mismo fichero**, las opciones `#EXTVLCOPT` que el `VLC_OPT_AUDIT.md` confirmó como reales usan
**guiones**:

```
network-caching   clock-jitter   audio-channels   http-user-agent   live-caching
```

**Seis mil líneas de diferencia, dos convenciones.** VLC nombra sus opciones con guiones; ffmpeg nombra
sus parámetros de filtro con guiones bajos. Los valores están escritos en la convención de ffmpeg dentro
de una opción de VLC.

**Nota de alcance honesta:** de los 8 módulos usados, el audit del repo confirma como reales de VLC
`gradfun`, `deinterlace`, `sharpen` y `hqdn3d`. **No he podido verificar** `unsharp` ni `yadif` contra un
inventario de plugins de VLC — la wiki no tiene ficha para `unsharp` (404) y el GitLab de VideoLAN está
tras una protección anti-scraping. Y de `nlmeans`, `bwdif`, `zscale`, `minterpolate` **no he verificado
lo contrario**: son nombres de ffmpeg, pero no afirmo que VLC no los tenga sin haberlo comprobado.

Lo que **sí** está medido y no depende de esa clasificación es el diff entre lo que el fichero declara y
lo que el fichero escribe: **underscores dentro de una opción de VLC, cuando el propio fichero usa
guiones para las opciones de VLC.**

---

## 6 · Lo que este informe NO dice

- **No dice que las cadenas no se ejecuten.** Dice que (a) no contienen escalador, (b) usan `scd=0`
  masivamente, (c) nombran parámetros en convención ffmpeg. Si VLC instancia `gradfun`/`hqdn3d`, esas dos
  sí corren — con los parámetros por defecto si los nombres no coinciden.
- **No he ejecutado VLC.** No hay VLC en este host y el runner de CI podría instalarlo, pero no lo he
  hecho en esta ronda; queda como la verificación siguiente y es la única que cerraría el §5.
- **No he medido el efecto visual.** No vi un solo frame.
- **No propongo parche aplicado.** Cualquier cambio de estas cadenas es decisión del generador.

## 7 · Reproducir

```bash
node tools/ape-parse-defects/video_filter_audit.js "…APE_LISTA_1793589060441.m3u8" --json vf.json
```
