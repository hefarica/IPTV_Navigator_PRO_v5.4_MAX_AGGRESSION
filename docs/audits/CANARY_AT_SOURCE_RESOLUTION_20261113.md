# La cadena Canary a la resolución real de los flujos · 2026-11-13

**Por qué este experimento:** todo lo anterior midió la cadena **a 4K**. Pero medido el 2026-11-12 con `ffprobe` sobre segmentos reales, **los flujos del proveedor son 1080p** (`1920x1080 h264 High L4.0`, 25 fps, 5,90 Mbps). La pregunta de §3 —*«conservar la calidad espacial mientras se busca un motor que pueda sostenerla a la cadencia de la fuente»*— hay que hacerla **a la resolución de la fuente**, no a una que el flujo no tiene.

## El resultado

Misma cadena Canary (mismo orden, mismos valores), solo cambia `scale=3840:2160` por `scale=1920:1080`. Mismo encoder, misma fuente, 3 s = 90 fotogramas a 30 fps. **Se reporta el mínimo de N pasadas**, no una sola.

| Configuración | Mínimo de N | Pasadas | Cadencia | vs fuente (30 fps) |
|---|---|---|---|---|
| **4K (3840x2160)** | **77 s** (N=2) | 93 · **77** s | 1,17 fps | **25,7×** |
| **1080p, cadena completa** | **16 s** (N=3) | 16 · 21 · 18 s | 5,62 fps | **5,3×** |
| **1080p sin grano** | **9 s** (N=3) | 9 · 10 · 9 s | 10,0 fps | **3,0×** |

**El 4K cuesta 4,8× lo que el 1080p** (77 s vs 16 s).
**El grano es la etapa dominante en 1080p:** quitarlo pasa de 16 s a 9 s — **1,78× menos coste**, muy por encima del ruido (dispersión 31 % en la completa, 11 % sin grano).

## Corrección de mis propias medidas — dos veces

**Primera corrección:** las pasadas sueltas dieron **30 s**, **22 s** y **39 s** para configuraciones cuya mejor de tres es **16 s** y **9 s**.

**Segunda corrección (esta ronda):** el `131 s` de 4K que publiqué era **una sola pasada**, y con dos pasadas el mínimo es **77 s**.

| Dato publicado antes | Medido con mínimo de N | Inflado |
|---|---|---|
| 131 s · 0,687 fps · **43,7×** | **77 s** · 1,17 fps · **25,7×** | **+70 %** |

**Una sola pasada de reloj en esta máquina no vale como medida**, ni para lo bueno ni para lo malo. Y el sesgo va en la dirección que uno menos espera: hace parecer el sistema **peor** de lo que es, porque cualquier proceso de fondo se suma.

## Qué cambia esto

El titular con el que se abrió esta línea de trabajo era **«43,7× más lento»**, y luego **«137×»** con la cifra histórica del Canary. Con metodología consistente:

| | vs fuente |
|---|---|
| Canary histórico (dato previo) | 137× |
| Cadena a 4K, mínimo de 2 | **25,7×** |
| Cadena a 1080p (la resolución real), mínimo de 3 | **5,3×** |
| Cadena a 1080p sin grano, mínimo de 3 | **3,0×** |

- **Sigue sin ser tiempo real.** 3× es 3×.
- El VPS tiene **3 vCPU** frente a los 4 de esta máquina: allí será peor, y **no lo extrapolo**.
- Pero el abismo de 137× no describe el sistema tal como está hoy sobre los flujos que sirve.

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
