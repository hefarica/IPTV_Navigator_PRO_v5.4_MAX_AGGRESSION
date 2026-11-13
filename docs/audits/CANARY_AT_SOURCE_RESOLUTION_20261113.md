# La cadena Canary a la resolución real de los flujos · 2026-11-13

**Por qué este experimento:** todo lo anterior midió la cadena **a 4K**. Pero medido el 2026-11-12 con `ffprobe` sobre segmentos reales, **los flujos del proveedor son 1080p** (`1920x1080 h264 High L4.0`, 25 fps, 5,90 Mbps). La pregunta de §3 —*«conservar la calidad espacial mientras se busca un motor que pueda sostenerla a la cadencia de la fuente»*— hay que hacerla **a la resolución de la fuente**, no a una que el flujo no tiene.

## El resultado

Misma cadena Canary (mismo orden, mismos valores), solo cambia `scale=3840:2160` por `scale=1920:1080`. Mismo encoder, misma fuente, 3 s = 90 fotogramas a 30 fps.

| Configuración | Mejor de 3 pasadas | Cadencia | vs fuente (30 fps) |
|---|---|---|---|
| **4K (3840x2160)** | 131 s *(1 sola pasada)* | 0,687 fps | **43,7×** |
| **1080p, cadena completa** | **16 s** | 5,62 fps | **5,3×** |
| **1080p sin grano** | **9 s** | 10,0 fps | **3,0×** |

**El grano es la etapa dominante:** quitarlo pasa de 16 s a 9 s — **1,78× menos coste**, muy por encima del ruido.

## Corrección de mis propias medidas

Las pasadas que hice sueltas dieron **30 s**, **22 s** y **39 s** para configuraciones donde la mejor de tres es **16 s** y **9 s**. La dispersión medida:

| Configuración | Pasadas | Dispersión |
|---|---|---|
| completa | 16 · 21 · 18 s | **31 %** |
| sin grano | 9 · 10 · 9 s | **11 %** |

**Una sola pasada de reloj en esta máquina no vale como medida.** Se reporta el **mínimo de tres**, que es robusto a los picos de carga. El `131 s` de 4K es **una sola pasada** y por tanto está **inflado**: necesita remedición con el mismo criterio antes de compararlo de igual a igual.

## Qué cambia esto

**El titular anterior era «43,7× más lento».** Para los flujos que el sistema **realmente sirve**, la cadena está a **5,3×** — y a **3,0×** sin el grano. Sobre una máquina de 4 núcleos.

- **No es tiempo real.** 3× sigue siendo 3×.
- **Pero deja de ser un abismo.** El VPS tiene **3 vCPU** frente a los 4 de esta máquina, así que allí será peor; sin medirlo no afirmo cuánto.
- Y coincide con lo que el propio sistema ya declara: `#EXT-X-APE-4KFALSE-MODE:ACTIVE` reconoce que el 4K es sintético. **El coste de ese 4K sintético es 8× sobre el 1080p nativo** (131 s vs 16 s), pagado para un upscale sobre un flujo que no lo tiene.

## Lo que NO dice

- **No dice que se pueda servir en directo.** 3× en el mejor caso, en una máquina de sobremesa, sin audio, con 3 s de muestra.
- **No dice nada del VPS.** No he ejecutado la cadena allí y no lo voy a extrapolar.
- **No propone quitar el grano.** La ablación mide coste; si el grano sirve para algo (enmascarar artefactos de compresión en fuentes reales) no lo resuelve esto.
- **No dice nada de la imagen.** Sigue sin haber panel.

## Lo que sugiere para el diseño

Si el objetivo es sostener la cadencia sobre flujos que ya son 1080p, el orden de ataque tiene tres palancas medidas:

1. **No upscalear a 4K lo que no es 4K.** De 43,7× a 5,3× medido. Es la palanca más grande y la más honesta: además alinea la salida con la fuente.
2. **El grano.** De 5,3× a 3,0×. Es el 44 % del coste restante.
3. **El encoder.** `ultrafast` ya está medido como la elección correcta (veryfast = 3,5× más caro por +0,016 de SSIM).

Ninguna de las tres se ha aplicado a producción. Y ninguna llega a tiempo real por sí sola: seguiría faltando hardware o una cadena más corta, y eso es decisión del operador.
