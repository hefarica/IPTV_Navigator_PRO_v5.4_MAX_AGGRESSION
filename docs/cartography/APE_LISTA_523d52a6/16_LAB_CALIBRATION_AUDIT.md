# La tabla de calibración LAB: 4 knobs fuera de su propio bound, y el fitness corre al revés de la cobertura

**Fecha:** 2026-11-02 · **Entrada:** `APE_LISTA_1793589060441.m3u8` · solo lectura.
**Herramienta:** `node tools/ape-parse-defects/lab_calibration_check.js <lista>` · 0,2 s (solo cabecera).

## 1 · Qué hay en la cabecera

La lista publica su calibración en 18 tags. Esto es el plano de control completo:

```
#EXT-X-APE-LAB-DNA:sha256=unverified,SOURCE=LAB_CALIBRATED,EXPORTED=2026-10-26T01:31:05
#EXT-X-APE-LAB-SCHEMA-VARIANT:omega_v2_bulletproof_perprofile
#EXT-X-APE-LAB-BULLETPROOF:true
#EXT-X-APE-LAB-FILENAME:LAB_CALIBRATED
```

Cada perfil trae **NAME**, **ROLE**, **FITNESS**, **SOLVER** y **TIMESTAMP**; más un `BOUNDS`
(espacio de búsqueda) y un `KNOBS` (punto emitido) con las mismas 7 claves.

```
P0 8K Master    FITNESS=0.7398  SOLVER="LHS->GA->SA->NM 0,1s"
P1 4K UHD Pro   FITNESS=1       SOLVER="LHS->GA->SA->NM 0,0s"
P2 4K Balanced  FITNESS=1       SOLVER="LHS->GA->SA->NM 0,0s"
P3 FHD 1080p    FITNESS=0.9909  SOLVER="LHS->GA->SA->NM 0,1s"
P4 HD 720p      FITNESS=0.2502  SOLVER="LHS->GA->SA->NM 0,1s"
P5 SD 480p      FITNESS=0.2175  SOLVER="LHS->GA->SA->NM 0,1s"
```

El solver es **Latin Hypercube → Algoritmo Genético → Simulated Annealing → Nelder-Mead**. Eso es un
optimizador de verdad, no una etiqueta: la lista declara cómo encontró sus números.

---

## 2 · F-14 · Cuatro knobs caen fuera del bound que el propio fichero declara

Un `KNOBS` es el punto que el optimizador emitió; un `BOUNDS` es el espacio donde dijo haber buscado.
**El punto tiene que estar dentro del espacio.** Verificado con aritmética, sin criterio:

| Perfil | Knob | Valor | Bound declarado | Exceso |
|---|---|---:|---|---:|
| **P0** | `buffer_seconds` | **50** | `buffer=[105,315]` | **−55** (por debajo del mínimo) |
| **P1** | `buffer_seconds` | **50** | `buffer=[72,195]` | **−22** (por debajo del mínimo) |
| **P2** | `buffer_seconds` | **33** | `buffer=[45,130]` | **−12** (por debajo del mínimo) |
| **P5** | `live_delay_seconds` | **11** | `live_delay=[3,8]` | **+3** (por encima del máximo) |

**Severidad: ALTA** · Capa: calibración LAB en cabecera

**Cómo se lee esto.** Un knob fuera de rango sólo tiene tres explicaciones, y las tres son un defecto:

1. **El bound está mal** → la tabla no describe el espacio real de búsqueda.
2. **El knob no salió del solver** → lo escribió otra cosa y el FITNESS no lo cubre.
3. **Se aplicó un clamp posterior** que el bound no refleja → el número emitido no es el optimizado.

En los tres casos, **el FITNESS que acompaña a ese perfil no corresponde al valor emitido**, porque el
valor emitido no estaba en el conjunto evaluado.

Encaja con el patrón de las rondas 29–32: la capa que **declara** y la capa que **emite** no se hablan.
Aquí se ve en aritmética pura.

**Los otros 38 knobs (de 42) están dentro de su bound.** No es un desastre general: son 4 casos
concretos, y los cuatro son los tres perfiles de buffer alto y el de live_delay.

---

## 3 · F-15 · El FITNESS corre al revés de la cobertura

Cruce del perfil que cada canal recibe con el FITNESS de ese perfil:

| Perfil | Nombre | Canales | % | **FITNESS** |
|---|---|---:|---:|---:|
| **P4** | HD 720p | **7.457** | **70,53 %** | **0,2502** |
| P3 | FHD 1080p | 2.308 | 21,83 % | 0,9909 |
| P1 | 4K UHD Pro | 808 | 7,64 % | **1,0000** |
| P0 | 8K Master | **0** | 0 % | 0,7398 |
| P2 | 4K Balanced | **0** | 0 % | 1,0000 |
| P5 | SD 480p | **0** | 0 % | 0,2175 |

**Severidad: ALTA** · Capa: asignación de perfil por canal

**El perfil de mejor ajuste (FITNESS 1,0) sirve al 7,6 % de la lista. El de peor ajuste entre los
usados (FITNESS 0,25) sirve al 70,5 %.**

Si FITNESS mide qué tan bien el perfil calibrado explica su objetivo, entonces **el 70 % de la lista
está gobernado por el perfil que menos explica**. No es que el número sea malo en abstracto: es que está
asignado a la mayoría.

**Y dos perfiles no se usan.** P0 "8K Master" y P5 "SD 480p" están calibrados, con bounds y knobs
completos, y **no los recibe ningún canal**. P2 "4K Balanced" (FITNESS 1,0) tampoco. Tres de seis
perfiles son decoración en la cabecera.

---

## 4 · F-16 · El `BW` declarado por canal no coincide con la tabla del propio repo

```
P4 (720p)  → BW=8.000.000
P3 (1080p) → BW=8.000.000     ← el mismo que 720p
P1 (4K)    → BW=19.800.000
```

`CLAUDE.md`, sección «Bitrate Fallback por Resolución», declara:

| Resolución | BANDWIDTH según el repo |
|---|---:|
| 3840×2160 | 28.000.000 |
| 1920×1080 @30 | 9.000.000 |
| 1280×720 | 5.500.000 |

| Grupo | Repo | Lista | Diferencia |
|---|---:|---:|---:|
| 4K | 28,0 M | **19,8 M** | −8,2 M |
| 1080p | 9,0 M | **8,0 M** | −1,0 M |
| 720p | 5,5 M | **8,0 M** | **+2,5 M** |

**Severidad: MEDIA** · Capa: declaración por canal
**Lo más raro no es la diferencia, es que 720p y 1080p declaren el mismo `BW`.** Dos resoluciones
distintas con el mismo ancho de banda declarado significa que el campo no está derivado de la
resolución.

**Caveat honesto:** la tabla de `CLAUDE.md` es de *fallback*, y `BW=` puede no ser la misma magnitud.
No afirmo que una esté mal; afirmo que **no coinciden y que el artefacto no explica por qué**.

---

## 5 · Lo que este informe NO dice

- **No digo que la lista se vea mal.** FITNESS bajo no implica mala imagen: implica que el optimizador
  no ajustó bien su objetivo. Cuál era ese objetivo no lo dice el fichero.
- **No sé qué mide FITNESS.** No hay esquema en la cabecera que lo defina. Podría ser 1/RMSE
  normalizado, correlación, o un score compuesto. **Sin esa definición, 0,2502 no se puede interpretar
  más allá de «menor que 0,9909»**, y así lo reporto.
- **Los 4 knobs fuera de bound no los he atribuido a una causa.** Digo que caen fuera; cuál de las tres
  explicaciones aplica lo sabe el generador, no yo.
- No he validado que los bounds sean *razonables*, sólo que el knob cae dentro o fuera.
- No he tocado nada. Cero escrituras en el VPS.

## 6 · Reproducir

```bash
node tools/ape-parse-defects/lab_calibration_check.js "…APE_LISTA_1793589060441.m3u8" --json lab.json
# exit 0 si todos los knobs están en rango · 4 si hay violaciones · 5 si no se pudo leer
```
