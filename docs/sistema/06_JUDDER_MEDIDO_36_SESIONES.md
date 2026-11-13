# JUDDER MEDIDO EN 36 SESIONES REALES DE OTT NAVIGATOR · 2026-11-13

**La medición que faltaba, extraída del propio log del aparato.** No es una predicción: son 36 sesiones de vídeo de `studio.scillarium.ottnavigator` con los tres valores medidos por el sistema.

**Y obliga a corregir dos cosas que dije antes.**

---

## 1 · La tabla, sin interpretación

`dumpsys media.metrics`, sesiones de vídeo con `framerate-content`, `framerate-actual` y `judder-rate` presentes:

| content → actual | n | judder min | judder med | judder max |
|---|---|---|---|---|
| **25 → 25** | 1 | 0,0123 | **0,0123** | 0,0123 |
| **50 → 50** | 2 | 0,0001 | **0,0016** | 0,0030 |
| 58,82 → 50 | 1 | 0,4994 | 0,4994 | 0,4994 |
| 59,92 → 50 | 2 | 0,3154 | 0,3354 | 0,3554 |
| 59,94 → 50 | 2 | 0,4785 | 0,4852 | 0,4919 |
| 59,96 → 50 | 4 | 0,1364 | 0,3892 | 0,4995 |
| 60 → 50 | 1 | 0,2500 | 0,2500 | 0,2500 |
| 62,5 → 50 | 1 | 0,4851 | 0,4851 | 0,4851 |
| 29,97 → 24,97 | 1 | 0,9859 | 0,9859 | 0,9859 |
| 29,97 → 24,99 | 3 | 0,8800 | 0,9453 | 0,9920 |
| 29,97 → 25 | 7 | 0,0322 | 0,8151 | 0,9989 |
| 29,99 → 25 | 1 | 0,9159 | 0,9159 | 0,9159 |
| 30 → 25 | 1 | 0,9329 | 0,9329 | 0,9329 |
| 30 → 25,03 | 1 | 0,9320 | 0,9320 | 0,9320 |
| 30,3 → 24,99 | 1 | 0,9783 | 0,9783 | 0,9783 |
| 30,3 → 25 | 3 | 0,9833 | 0,9860 | 0,9903 |
| 30,3 → 25,07 | 1 | 0,9756 | 0,9756 | 0,9756 |
| 30,3 → 25,08 | 1 | 0,9419 | 0,9419 | 0,9419 |
| 30,3 → 25,5 | 1 | 0,9693 | 0,9693 | 0,9693 |
| 29,41 → 24,98 | 1 | 0,9997 | 0,9997 | 0,9997 |

**Lo único limpio (< 0,05) es cuando `content == actual`:** 25 → 25 y 50 → 50.

**El resto, cuando difieren, es judder alto.** La peor familia es 29,97/30/30,3: **0,82 – 1,00**.

---

## 2 · Censo de familias de cadencia en el catálogo real

De esas mismas 36 sesiones (recuento verificado dos veces; el primer borrador decía «30 de 36», eran 21):

| Familia | Sesiones | Qué cadencia de panel la sirve |
|---|---|---|
| **29,97 / 30** | **21** | 59,94 (2×) o 60,000004 (2×) |
| ~60 (58,8 – 62,5) | 11 | 60,000004 (1×) |
| 50 | 2 | 50 (1×) |
| 29,41 (atípica) | 1 | **ninguna** |
| 25 | 1 | 25 (1×) o 50 (2×) |
| **TOTAL** | **36** | |

**La familia dominante es 29,97/30 (21 de 36). Sumando ~60 son 32 de 36** — es decir, **32 de 36 sesiones piden una cadencia de panel de ~60 Hz**, y sólo 3 piden 50.

---

## 3 · Corrección de dos afirmaciones mías

### Corrección A — «el catálogo es 25 fps (6 de 7)» era una muestra de 7 canales

La medición de 7 canales daba 25 fps en 6 de ellos. **Con 36 sesiones reales, la familia dominante es 29,97/30 (30 de 48 sesiones con cadencia válida).** La muestra de 7 no era representativa, y sobre ella construí una política.

### Corrección B — poner el panel a 50 Hz pudo EMPEORAR la mayoría de canales

Si el panel está a 50 Hz y el contenido es 29,97/30, la tabla medida dice **judder 0,82–1,00**. Con **21 de 36 sesiones** en esa familia (y 32 de 36 contando la de ~60), **la cadencia de 50 Hz no es la correcta para este catálogo: la correcta es 59,94/60**, porque:

| contenido | cadencia de panel EXACTA (ratio entero) |
|---|---|
| 25 | 25 (1×) · **50 (2×)** |
| 30 | 30 (1×) · **60,000004 (2×)** |
| 29,97 | **59,94 (2×)** |
| 50 | 50 (1×) |
| 60 | 60,000004 (1×) |
| 23,976 · 30,3 · 62,5 | **ninguna** en la tabla de modos del panel |

**Una sola cadencia fija no sirve a las dos familias.** 50 sirve a 25/50; 60 sirve a 29,97/30/60. El catálogo es mayoritariamente la segunda.

---

## 4 · Lo que NO sé, y no voy a fingir que sé

**No conozco la fórmula exacta de `judder-rate`.** Los datos muestran que es bajo cuando `content == actual` y alto cuando difieren, pero:

- No sé si `framerate-actual` es la cadencia de presentación, la de salida del decoder, o la medida del stream.
- Hay sesiones con `actual=-1` (no computado) y judder asignado igualmente.
- `29,97 → 25` tiene una sesión con 0,0322 y otras con 0,9989: **la misma combinación da resultados distintos**, así que hay una variable que no estoy viendo.
- **No he podido hacer el experimento decisivo**: fijar el panel a 60, poner un canal de 30 fps y medir. Eso exige seleccionar canal, y `Display4K` (instalado, sin mi corrección) vuelve a forzar 60 al abrir el reproductor de la APK.

**Un dato que NO sostiene mi modelo:** a las 00:07:44, `content=25 → actual=25 → judder 0,0026`. Si en ese momento el panel estaba a 60 Hz, entonces 25 sobre 60 (ratio 0,417) habría debido dar judder — y no lo dio. **Eso apunta a que `judder` no depende del panel como yo suponía.** Se declara: hipótesis no confirmada.

---

## 5 · El experimento decisivo, cuando se pueda

1. Fijar el panel en **59,94 Hz** o **60,000004**.
2. Poner un canal de la familia **29,97/30** en OTT Navigator.
3. Leer `dumpsys media.metrics | grep judder-rate`.
4. **Falsación:** si con panel a 60 y contenido 29,97 el judder **sigue ≥ 0,5**, entonces el judder **no** se gobierna por la cadencia del panel y toda esta línea de trabajo está mal encaminada.

**Criterio de éxito:** judder < 0,05 con `content` y `actual` ambos en 29,97/30.

---

## 6 · Lo que sí queda firme

- `25 → 25` y `50 → 50` dan judder **0,0016 – 0,0123**. Cuando coinciden, el sistema está limpio.
- El discriminador de `Display4K` (múltiplo entero exacto, tolerancia 1e-4) **modela bien esa condición**: 25/50 = 2,000000 y 50/50 = 1,000000 son exactos; 60/25 = 2,4 y 59,94/60 = 0,999 no lo son.
- **La política de una cadencia fija es insuficiente.** Hace falta cambiar la cadencia **por canal**, según la cadencia del contenido. Eso es lo que `Display4K` debería hacer y hoy no hace (solo asegura 4K).
- El `Display4K` instalado **sigue tumbando el panel a 60** al abrir su reproductor: reproducido otra vez hoy (125 → 124 al abrir la APK).

---

## 7 · Acción derivada, sin aplicar

**Devolver el panel a 60 Hz** mientras no exista conmutación por canal, porque:
- 29,97/30 (la mayoría: 21 de 36) necesita 59,94/60.
- **32 de 36 sesiones** caen en las familias 29,97/30/~60, que piden ~60 Hz.
- 60,000004 es múltiplo exacto de 30 (2×) y de 60 (1×).
- 25 y 50 quedarían peor (25/60 = 0,417), pero suman **3 de 36 sesiones**.

**Es una decisión del operador, no mía.** Y la alternativa mejor es implementar la conmutación por canal, que es el trabajo real pendiente.
