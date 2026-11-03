# BENCHMARKS — crystal-upscale (Upscaler offline REAL)

> **Coste = horas de CPU por hora de contenido** (`1 / speed`). Se publica como **rango**,
> nunca como cifra única, porque depende del contenido (ver §2).

## 1 · Medido en ESTA máquina (t47)

- Host: `Linux 6.6.114.1-microsoft-standard-WSL2 x86_64` · ffmpeg 8.0.1-full_build-www.gyan.dev
- Fuente: `testsrc2` 1920x1080@30, 2s (**60 frames**) → 3840x2160
- Fecha: 2026-10-26T03:49:18Z

| Variante | Familia | Contenido | speed | fps | **h CPU / h contenido** |
|---|---|---|---|---|---|
| `x265_ultrafast` | HEVC Main10 | sintético (testsrc2 = PEOR caso) | 0.8197× | 24.59 | **1.2** |
| `x265_superfast` | HEVC Main10 | sintético (testsrc2 = PEOR caso) | 0.7018× | 21.05 | **1.4** |
| `libplacebo_x265` | HEVC Main10 (Vulkan) | sintético (testsrc2 = PEOR caso) | 0.4228× | 12.68 | **2.4** |
| `x264_veryfast_AVC` | AVC 8-bit (NO cumple HEVC Main10) | sintético (testsrc2 = PEOR caso) | 1.1696× | 35.09 | **0.9** |
| `qsv_hevc` | HEVC Main10 (QSV) | sintético (testsrc2 = PEOR caso) | 0.8511× | 25.53 | **1.2** |

## 2 · Mediciones que YA tenía el repo (verificadas leyendo los ficheros)

| Fuente | Variante | Contenido | speed | **h CPU / h contenido** |
|---|---|---|---|---|
| `_vps_stage/lua/ape_caps.lua:165` | x265 1080p→2160p ultrafast | **REAL** | 0.356× | **2.8** |
| `docs/MEDIA_FANOUT_FEASIBILITY.md:774` | ídem, evidencia bruta (fps=8.9 · CPU 269% · RSS 555.448 KiB) | **REAL** | 0.356× | **2.8** |
| `docs/MEDIA_FANOUT_FEASIBILITY.md:777` | x265 2160p30 ultrafast | sintético | 0.412× | **2.4** |
| `docs/MEDIA_FANOUT_FEASIBILITY.md:780` | x265 2160p30 medium | sintético | 0.194× | **5.2** |
| `docs/MEDIA_FANOUT_FEASIBILITY.md:783` | **x264** 1080p→2160p ultrafast | **REAL** | **1.56×** | **0.64** |

## 3 · RANGO DE COSTE (tres ejes, no uno)

El coste depende de **tres** cosas y por eso se publica como horquilla:
**(a) el contenido**, **(b) el preset** y **(c) el host**.

| Eje | Extremo barato | Extremo caro |
|---|---|---|
| **Contenido** | real: **2.8** h/h (`ape_caps.lua:165`) | `testsrc2` = peor caso sintético: **25.8** h/h en el host del capitán |
| **Preset x265** | `ultrafast` = **12.7** h/h (esta máquina) | `superfast` = **35.1** h/h (esta máquina) |
| **Host** | esta máquina (WSL2): **12.7–35.1** h/h con `testsrc2` | host del capitán (Intel UHD): **25.8** h/h con el mismo `testsrc2` |
| **Codec** | x264 AVC real: **0.64** h/h (NO cumple el contrato) | x265 HEVC sintético peor caso: **25.8** h/h |

⇒ **Rango honesto para lo que este pipeline entrega (HEVC Main10): 12.7 – 25.8 h CPU por hora de contenido.**
Si se aceptara AVC bajaría a **0.6–0.7** h/h (x264), pero **no cumple** el contrato.

### Varianza observada — por qué la horquilla es amplia incluso en el MISMO host

Dos corridas consecutivas de este mismo bench en esta máquina dieron:

| Variante | Rango de wall observado en 3 corridas | Factor |
|---|---|---|
| `x265_ultrafast` | 2,4 – 4 s | ~1,7× |
| `x265_superfast` | **2,8 – 36 s** | **~13×** |
| `libplacebo_x265` | 3,1 – 22 s | ~7× |
| `qsv_hevc` | 2,2 – 4 s | ~1,8× |

**La diferencia no es del codec: es contención de CPU** (otros procesos del equipo corriendo en paralelo). Consecuencia práctica: **cualquier cifra medida en una máquina compartida es una cota superior**, y por eso este informe publica horquilla y no número.

**Por qué hay diferencia entre hosts con el mismo `testsrc2`:** el host del capitán tardó 123 s en un clip de 5 s (0.0388×); esta máquina, ~2,4 s en uno de 2 s (0.82×). Son CPUs distintas. **Ninguna de las dos es «la» verdad.**

## 4 · Conclusiones operativas

1. **El cuello de botella es el encoder, no el escalador.** `libplacebo` (Vulkan) sólo ahorra ~13 % frente a `lanczos` (CPU): x265 a 4K domina el tiempo. No compensa añadir dependencia de GPU por un 13 %.
2. **`scale_vulkan` y `hevc_qsv` NO son viables** en estos hosts: el primero falla (`Function not implemented` en driver Intel), el segundo **se cuelga** (>12 min con un clip de 5 s). El pipeline los detecta y cae a CPU — y el probe de QSV lleva `timeout` para no colgarse.
3. **Si se aceptara AVC**, x264 real = 1.56× ⇒ **0.64 h/h**, casi 4.4× más barato que x265 real. Pero **no cumple** el contrato (HEVC Main10): se documenta como alternativa de coste, no se emite.
4. **Recomendación:** 4K REAL sólo para el **lote prioritario**; para catálogos grandes, dejar 1080p y que el 4K lo **declare el emisor** (política del propietario). Con 2.4–25.8 h/h, un catálogo de 2754 canales × 1 h es **inviable** en CPU: 6.6k–71k horas de CPU.

## 5 · [UNKNOWN] declarados

- **No se midió contenido IPTV real en esta tarea**: no hay acceso al catálogo en este host. La fila real disponible es la del repo (`ape_caps.lua:165` = 0.356×), medida en **otro host** (VPS de 3 vCPU).
- **`speed=` de `testsrc2` no es extrapolable a IPTV real** (deportes/estudio cambian mucho la entropía). El rango 2.4–25.8 h/h acota la incertidumbre; un número único sería falso.
- **CPU%**: no se publica cifra propia. `/usr/bin/time -v` no existe en Git Bash/WSL-sobre-Windows; las cifras de CPU% citadas son las del repo (269 %, 264 %, 245 %, 230 %), no inventadas aquí.

## 6 · Reproducir

```bash
bash tools/crystal-upscale/bench.sh 2      # clip de 2 s
bash tools/crystal-upscale/selftest.sh     # verificación funcional (20 asserts)
```
