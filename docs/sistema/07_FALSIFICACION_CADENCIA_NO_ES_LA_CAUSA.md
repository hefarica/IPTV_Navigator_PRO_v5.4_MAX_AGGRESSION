# FALSIFICACIÓN: el judder NO lo causa la cadencia del panel · 2026-11-13

**Este documento existe para matar una línea de trabajo mía, con datos.**

A lo largo de la sesión sostuve que el judder venía de que la cadencia del panel no encajaba con la del contenido, y obré en consecuencia: puse el panel a 50 Hz, escribí un discriminador de múltiplo exacto en `Display4K`, y documenté una política de cadencia.

**La medición de esta noche dice que estaba equivocado.**

---

## 1 · El test decisivo se ejecutó solo

El experimento que había diseñado («panel a 59,94 + contenido de 29,97 + leer judder») **ya estaba corriendo** cuando fui a montarlo:

```
panel       = mActiveModeId=123 → 59.94006 Hz
contenido   = 29.41176 fps
actual      = 24.99188 fps
judder      = 0.9886507
```

**59,94 es la cadencia EXACTA para contenido de 29,97 (ratio 2,000000).** Si el judder viniera de la cadencia del panel, este caso tendría que dar ≈0.

**Da 0,9887.** La hipótesis está falsada.

Y el detalle que la remata: **`actual` = 24,99 no es divisor de 59,94** (59,94 / 24,99 = 2,398). Si el presentador redondease a divisores del panel, habría dado 29,97 o 59,94. **Da 25, que no guarda relación entera con 59,94.**

## 2 · La estadística, sobre 38 sesiones

| Condición | n | judder medio |
|---|---|---|
| `content ≈ actual` (difieren < 1 %) | **3** | **0,0052** |
| `content ≠ actual` | **35** | **0,7585** |

**El judder sigue la diferencia entre la cadencia DECLARADA y la REAL. No sigue la cadencia del panel.**

Las tres sesiones limpias son las que declaran lo que entregan:
- `25 → 25` → judder 0,0123
- `50 → 50` → judder 0,0016 y 0,0030

Las 35 restantes declaran una cosa y entregan otra:
- `29,41 → 24,99` → 0,9887
- `29,97 → 25` → 0,82 – 1,00
- `60 → 50` → 0,25
- `62,5 → 50` → 0,49

## 3 · Qué significa, sin adornos

**El defecto está en el stream del proveedor: declara una cadencia que no entrega.** No es la pantalla, no es el VPS, no es la APK. Es el mismo patrón que ya conocemos en este proyecto: perfiles que sobre-declaran (16 de 21), códecs que declaran `hevc` y sirven `h264` (7 de 7), y ahora **cadencias que declaran 29,41 y entregan 25**.

**Y no se puede arreglar desde el canal de metadata.** Se puede reordenar un master, se puede reescribir un `FRAME-RATE=`, pero **el `actual` lo mide el decodificador sobre los fotogramas que llegan**. Declarar 25 cuando llegan 25 no hace que lleguen 30.

## 4 · Qué queda en pie de mi trabajo de cadencia

| Pieza | Estado tras la falsación |
|---|---|
| `Display4K` deja de pisar el modo elegido | **SIGUE SIENDO CORRECTO** — destruía una preferencia del usuario, y eso hay que arreglarlo igual |
| Discriminador de múltiplo exacto (1e-4) | **CORRECTO como criterio**, pero **irrelevante para el judder** |
| «Poner el panel a 50 Hz mejora la imagen» | **FALSO** — el panel no gobierna el judder |
| «El catálogo es 25 fps» | **FALSO** — la familia dominante es 29,97/30 (21 de 36 sesiones) |
| Selección de variante (FIX 3) | **NO AFECTADO** |
| SoC / VPP / negociación `ai_sr` | **NO AFECTADO** |

**Lo que sí queda como real y medido:** que el panel esté en una cadencia que case con el contenido **no hace daño y ayuda en los casos honestos** (`25→25` y `50→50` dan 0,0016–0,0123). Pero **no es la palanca que resuelve el judder**, porque el problema está antes.

## 5 · Lo que NO sé

**No conozco la fórmula de `judder-rate`.** Los datos muestran:
- `content ≈ actual` → ≈0 (consistente en 3 casos)
- `content ≠ actual` → alto, pero **con dispersión grande**: 0,25 a 1,00 para diferencias parecidas.
- `29,97 → 25` da 0,0322 en una sesión y 0,9989 en otras. **Misma combinación, resultados distintos.**

Hay una variable que no veo. **No voy a inventar una explicación.**

## 6 · La pregunta que esto deja abierta, y que sí es accionable

**¿Por qué `actual` = 25 cuando el stream declara 29,41?**

Candidatos, ninguno verificado:
1. El stream es de cadencia variable y 29,41 es una media; los instantes reales rondan 25.
2. El decodificador limita la salida.
3. El contenedor TS declara mal y Android lo propaga.

**Cómo se verificaría, sin tocar nada:** descargar el segmento del canal, pasarlo por `ffprobe` y comparar `r_frame_rate`, `avg_frame_rate` y las duraciones reales de los PTS. **Eso distingue «el stream miente» de «el decodificador no llega», que son dos problemas con dueños distintos.**

## 7 · Estado del aparato al cerrar

```
panel:     mActiveModeId=123 · renderFrameRate 59.94006
clave:     user_preferred_refresh_rate = 59.94006   (coherente con el panel)
VPS:       /health.php 200 · /api/health.php 200 · /jit/health 200   SANO
canal:     reproduciendo en ottnavigator/.PlayerActivity
           content=29.41 actual=24.99 judder=0.9887
```

**No hay incidente en el VPS.** El 502 que vi al consultar `/pulse/` fue transitorio del proveedor; los tres endpoints de salud responden 200.
