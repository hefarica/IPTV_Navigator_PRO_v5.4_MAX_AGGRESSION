# El carril `video-filter` está muerto en los DOS motores — y ahora está medido en VLC

**Fecha:** 2026-11-02 · **Fuente de verdad:** los plugins instalados en `C:\Program Files\VideoLAN\VLC\plugins\video_filter`
(**41 módulos**, leídos del disco, no de memoria) · **Herramienta:** `tools/ape-image-recipes/vlc_filter_modules.js`

## 0 · Por qué esto cierra el hueco

Durante toda la auditoría la frase fue «esto es ffmpeg; no he probado VLC». **Era el hueco más grande
del trabajo**, porque `#EXTVLCOPT` es un mecanismo de VLC. Ya está cerrado, con el inventario del
binario instalado.

## 1 · Los 41 módulos de filtro de vídeo que VLC tiene

```
adjust alphamask anaglyph antiflicker ball blend blendbench bluescreen canvas colorthres
croppadd deinterlace edgedetection erase extract fps freeze gaussianblur gradfun gradient
grain hqdn3d invert magnify mirror motionblur motiondetect oldmovie posterize postproc
psychedelic puzzle ripple rotate scale scene sepia sharpen transform vhs wave
```

## 2 · Las tres cadenas de la lista, contra ese inventario

| Cadena | En VLC | Faltan |
|---|---:|---|
| **REF1** (7.457 canales) | **1 de 4** | `yadif`, `unsharp`, `minterpolate` |
| **REF2** (2.308 canales) | **1 de 6** | `nlmeans`, `bwdif`, `unsharp`, `zscale`, `minterpolate` |
| **REF3** (808 canales) | **1 de 6** | idem |

De los 8 módulos que usa la lista, **VLC tiene 2**: `hqdn3d` y `gradfun`.

## 3 · Las cadenas V2 del operador, contra el mismo inventario

| Perfil | En VLC | Faltan |
|---|---:|---|
| P5 | **4 de 14** | `bwdif`, `zscale`(×4), `format`(×2), `unsharp`, `cas`, `minterpolate` |
| P4 | **4 de 13** | `zscale`(×4), `format`(×2), `unsharp`, `cas`, `minterpolate` |
| P3 | **3 de 12** | `zscale`(×4), `format`(×2), `unsharp`, `cas`, `minterpolate` |
| P2 | **2 de 10** | `zscale`(×5), `format`(×2), `cas`, `minterpolate` |

### Y esto refuta una afirmación concreta

El documento de las V2 dice:

> «**V2 es la única variante viable para `#EXTVLCOPT`** (filtros que VLC sí ejecuta)»

**Falso, y ahora medido.** En P5, **10 de los 14 módulos no existen en VLC**. `zscale` solo aparece
**cuatro veces por cadena** y VLC no tiene ningún módulo con ese nombre: tiene `scale`, que es otra cosa.

Es cierto —como el documento mismo advierte— que `libplacebo` (V3) tampoco está. Pero el mismo criterio
que descarta V3 **descarta también V2**.

## 4 · El cuadro completo

| Motor | Veredicto | Evidencia |
|---|---|---|
| **ffmpeg 8.0.1** | rechaza las cadenas por parámetros fuera de rango | `20_REF_CHAINS_MEASURED.md` (4 defectos, error literal) |
| **VLC 3.x** | no tiene 3 a 5 de los módulos por cadena | este documento (inventario del binario) |

**Los dos motores fallan por razones independientes.** No es un problema de sintaxis que se arregle
escribiendo mejor la misma idea: son **dos inventarios de filtros distintos** y la cadena fue escrita
contra uno que no es el que se le entrega.

## 5 · Lo que esto responde de verdad

La pregunta era cómo esta lista se ve tan bien en OTT Navigator. La respuesta medida es:

> **No es por el carril `video-filter`.** Ese carril no puede ejecutarse ni en ffmpeg ni en VLC, y
> además no contiene un escalador, así que tampoco habría subido resolución si hubiera ejecutado.

Lo que queda en pie es lo que el operador ya había concluido: el **VPP del SoC** y los `SESSION-DATA`.
Este trabajo no lo confirma ni lo niega — **no lo ha medido**. Lo que sí establece, con evidencia
reproducible, es que el `video-filter` no participa.

## 6 · Límites honestos

- **He leído el inventario de plugins, no he ejecutado un filtro en VLC.** Que un módulo exista no
  demuestra que acepte una cadena con esa sintaxis; que no exista sí demuestra que no puede.
- **VLC acepta alias y nombres cortos.** `pp` es alias de `postproc` y se cuenta como presente. Puede
  haber otros alias que no conozco, y en ese caso la lista sería más generosa de lo que digo, no menos.
- **Los modos de `deinterlace` no cuentan como módulos.** `yadif` y `bwdif` son *modos* del módulo
  `deinterlace` en VLC (`--deinterlace-mode=yadif`), no filtros con cadena propia. Eso no salva la
  cadena: `yadif=mode=1:...` es sintaxis de ffmpeg, no un modo de VLC.
- **No he medido calidad de imagen ni rendimiento.** Ni un fotograma.
- **No he tocado la lista ni el VPS.**

## 7 · Reproducir

```bash
node tools/ape-image-recipes/vlc_filter_modules.js --listar
node tools/ape-image-recipes/vlc_filter_modules.js --chains tools/ape-image-recipes/ref_chains.txt
node tools/ape-image-recipes/vlc_filter_modules.js --chains tools/ape-image-recipes/v2_chains.txt
# exit 0 = todos los modulos existen · 4 = falta alguno · 5 = sin fuente
```

Si el directorio de plugins no está accesible, la herramienta usa una lista documentada **con su
procedencia anotada** en el código. Si tampoco hay lista, dice que no puede decidir y sale con 5:
**no adivina.**
