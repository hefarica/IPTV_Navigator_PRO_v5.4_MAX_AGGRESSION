# EL DETECTOR DE BLOCKINESS NO DETECTA EL ARTEFACTO — medido, con control negativo

**Petición del operador:** un módulo Kotlin `BlockinessDetector` con muestreo de la banda inferior, umbrales 1,15/1,20/1,25 y una tabla de precisión 100 %/95 %/90 %.

**Se evaluó el código y se calibró la métrica. Resultado: la métrica no discrimina el artefacto, y los umbrales propuestos son arbitrarios. Se demuestra abajo.**

---

## 1 · Bloqueantes del módulo, antes de hablar de umbrales

| # | Bloqueante | Por qué |
|---|---|---|
| 1 | **`ImageReader(YUV_420_888)` como surface de salida de `MediaCodec`** | `configure(format, surface, …)` exige un surface de **render**. Los decoders de hardware **no entregan YUV_420_888 legible por CPU** a través de `ImageReader`: o dan buffers opacos (`ImageFormat.PRIVATE`) o rechazan el formato. Para leer el plano Y habría que usar el modo ByteBuffer (sin surface) y entonces se pierde el render directo. **El código falla en `configure()`, no en el análisis.** |
| 2 | `buffer.position(row*rowStride)` + `get(rowBuffer,0,width)` | Ignora `pixelStride` y puede salirse del `limit` del plano → `IllegalArgumentException`. El ByteBuffer de un plano viene con position/limit ya acotados. |
| 3 | `ImageReader(maxImages=3)` + `acquireLatestImage()` en el camino caliente | Si el consumidor no drena, el productor (decoder) **bloquea** y se pierden fotogramas. Es el freeze que la doctrina prohíbe. |
| 4 | Crear un `MediaCodec` propio **sustituye al reproductor** | En la APK reproduce Media3; en OTT, su motor. Este módulo sólo podría engancharse a un renderer **propio**, no insertando un ImageReader en el camino de OTT. |
| 5 | `reduceStreamQuality()` | **Va contra la Ley Anti-Degradación** del repo. Bajar calidad para "arreglar" es exactamente lo prohibido. |
| 6 | Tabla 100 % / 95 % / 90 % | **Sin ninguna medición detrás.** Se retira. |

## 2 · La calibración real de la métrica

Métrica idéntica a la del módulo, para que los números sean comparables:

```
ratio = gradiente medio en columnas múltiplo de 8  /  gradiente medio en el resto
```

Ejecutada sobre 18 fotogramas de 6 s, en tres regiones, con **control negativo sintético**:

| Región | n | min | p25 | mediana | p75 | p95 | max |
|---|---|---|---|---|---|---|---|
| `full` | 18 | 0,9855 | 1,0292 | **1,0732** | 1,1227 | 1,3256 | **1,3256** |
| `grass` | 18 | 0,9077 | 0,9497 | **0,9941** | 1,0337 | 1,1382 | 1,1382 |
| `bottom_band` | 18 | 0,6602 | 0,9144 | **0,9444** | 0,9924 | 1,0583 | **1,0583** |

**Control negativo:** gradiente sintético puro → **1,0017**. La métrica está bien construida (da ≈1,0 en contenido limpio). **No está roto el instrumento: es que no ve lo que buscamos.**

### El hallazgo que lo tumba

**`bottom_band` — la región con los artefactos visibles — puntúa MÁS BAJO (mediana 0,9444) que `full` (1,0732) y que `grass` (0,9941), y su máximo (1,0583) queda por debajo del umbral más bajo propuesto (1,15).**

Con los umbrales del módulo, **la banda con el artefacto nunca se marcaría como sucia**, y en cambio `full` al p95 (1,3256) sí. **El detector señalaría la región equivocada.**

## 3 · Y la métrica es inestable en el tiempo

Mismo recorte, mismo vídeo, dos ventanas temporales:

```
0-6 s :  0,9363 · 1,0464 · 1,0459 · 1,0347 · 0,9984 · 1,0934      mediana 1,0259
8-10 s:  0,8550 · 1,2484 · 1,0562 · 1,0877                        mediana 1,0618

RANGO TOTAL EN EL MISMO RECORTE: 0,3933
```

**Mi medición anterior de 1,248 en la banda inferior era el máximo de toda la serie** — una muestra con suerte, no un valor representativo. Queda declarado como corrección de mi propio dato.

**Consecuencia:** un umbral fijo sobre una métrica que barre **0,39** en el mismo recorte no distingue artefacto de contenido. Cualquier valor entre 1,15 y 1,25 marcaría y desmarcaría los mismos píxeles según el instante.

## 4 · Por qué la métrica falla aquí, y qué haría falta

La métrica mide **energía de borde alineada a la rejilla de 8**. Funciona con bloques de compresión **regulares y estáticos**. El artefacto del operador es otra cosa:

- es **localizado** (una franja concreta, no el cuadro entero),
- es **de alto contraste y alto movimiento** (rótulos sobre cámara en movimiento),
- y viene **ya difuminado por la grabación del teléfono** a 1,38 Mbps.

Un cociente global promedia todo eso y lo diluye. Lo que haría falta es análisis **local y temporal** (ventanas pequeñas, comparación entre fotogramas contiguos en la misma zona), no un ratio de cuadro completo.

**Y aun teniéndolo: no hay motor en este aparato que ejecute corrección.** El valor de un detector así sería informar, no reparar.

## 5 · Lo que sí queda del módulo propuesto

| Idea | Veredicto |
|---|---|
| La métrica `borde8/resto` | **Correcta como instrumento** (control negativo 1,0017), **insuficiente como discriminador** |
| Muestreo temporal (1 de N fotogramas) | **Buena práctica**, aplicable |
| Muestreo de la banda inferior | **La región elegida es la correcta**; la métrica no lo es |
| Umbrales 1,15/1,20/1,25 | **Retirados** — este documento los sustituye por la distribución medida |
| Tabla de precisión 100/95/90 % | **Retirada** — sin medición |
| `reduceStreamQuality()` | **Prohibido** por la Ley Anti-Degradación |

## 6 · Artefactos

- `docs/audits/BLOCKINESS_CALIBRATION.json` — la distribución completa, generada por el script
- `tools/quality/calibrate_blockiness.js` — reproducible: `node tools/quality/calibrate_blockiness.js "<video>" [segundos]`
- Control negativo incluido en cada ejecución; si falla, el script sale con exit 1

## 7 · Límite honesto

**La calibración es sobre UNA fuente** (la grabación del teléfono del operador). **La compresión del teléfono contamina la medida**: no es la imagen del televisor. Para umbrales de producción haría falta medir fotogramas **del decodificador**, no de una grabación. **Eso no está hecho, y no se presenta como hecho.**
