# A/B de la cadena Canary en entorno controlado — 2026-11-12

**Qué es esto:** la primera medición de imagen de esta sesión. §3 pide *«reproduce exactamente la transformación visual de Canary en un entorno controlado»* y una *«prueba A/B comparable»*. Esto es eso. **No es una prueba en televisor**: no hay dispositivo, ni VMAF, ni ojo humano.

## Montaje

| | |
|---|---|
| Fuente | `tools/crystal-upscale/_selftest/src_1080p_5s.mp4` — h264 Constrained Baseline, **1920x1080**, yuv420p, **30 fps**, 15,5 Mbps |
| Ventana | **3 s** (90 fotogramas) |
| **A** | Cadena Canary **exacta**: `deblock,smartblur=lr=1.5:ls=-0.5,format=yuv444p,scale=3840:2160:flags=lanczos,noise=alls=8:allf=t,unsharp=5:5:0.8:3:3:0.4,eq=contrast=1.05:brightness=0.02:saturation=1.05,format=yuv420p` |
| **B** | **Control neutro**: `scale=3840:2160:flags=lanczos` y nada más |
| Encoder | idéntico en A y B: `libx265 -preset ultrafast -tune zerolatency -x265-params pools=1:frame-threads=1` |
| ffmpeg | 8.0.1-full_build (Gyan) |

Solo cambia la cadena de filtros. Todo lo demás es igual: es un A/B de la cadena, no del entorno.

## Resultados medidos

### A vs B — cuánto cambia la cadena Canary

| Métrica | Valor |
|---|---|
| SSIM (All) | **0,868066** |
| SSIM Y / U / V | 0,858316 / 0,889243 / 0,885888 |
| PSNR (average) | **31,296 dB** |
| PSNR min / max | 29,103 / 31,665 dB |

**0,868 de SSIM no es ruido**: las dos salidas son imágenes visiblemente distintas. La cadena hace algo real, no un remux ni un cambio de metadatos.

### Fidelidad ida y vuelta (4K → 1080p bicubic → comparar con la fuente)

| | SSIM (All) | SSIM Y | PSNR (avg) | PSNR Y |
|---|---|---|---|---|
| **A (Canary)** | **0,916876** | 0,931965 | **24,554 dB** | 26,285 |
| **B (lanczos)** | **0,959806** | 0,966726 | **25,624 dB** | 27,647 |

### Nitidez medida (YAVG de un laplaciano 3×3 sobre la salida a 1080p)

| | YAVG |
|---|---|
| **A (Canary)** | **6,978** |
| **B (lanczos)** | 1,175 |
| **Fuente 1080p** | 1,588 |

## La lectura honesta

1. **La cadena Canary realza de verdad, y mucho.** Su nitidez medida es **6,978 frente a 1,588 de la fuente: 4,39×**. No es una declaración, es un laplaciano medido.
2. **El control lanczos PIERDE nitidez**: 1,175 contra 1,588 de la fuente, un **26% menos**. Escalar a 4K y recodificar suaviza; eso es lo que hace un upscale sin más.
3. **Ese realce NO es recuperación de detalle.** El detalle que la métrica ve no estaba en la fuente: lo ponen `unsharp=5:5:0.8:3:3:0.4` y `noise=alls=8`. Por eso **A es menos fiel** a la fuente que B (SSIM 0,917 vs 0,960) — es la firma del realce sintético, no de la fidelidad.
4. **Y por eso SSIM no puede declarar ganador.** Una cadena que realza baja SSIM por construcción. Preferir A o B es una decisión **perceptual**, y la métrica que la resolvería es **VMAF**, que no se ha medido. El prompt lo prohíbe explícitamente: no se presenta SSIM como VMAF.

## Coste medido (en ESTA máquina, no en el VPS)

| | |
|---|---|
| Tiempo de reloj para 3 s | **131 s** |
| Fotogramas codificados | 90 |
| Cadencia efectiva | **0,687 fps** |
| Fuente | 30 fps |
| **Factor** | **43,7× más lento que tiempo real** |

**`-an`**: se descartó el audio para aislar vídeo. **No es una propuesta de configuración para televisión** — el prompt prohíbe propagar la supresión de audio.

## Lo que esto NO establece

- **No es paridad visual con el Canary original.** Se reprodujo la **receta documentada**, pero no existe una salida del Canary histórico contra la que comparar. «Paridad» exigiría ese par de referencia.
- **No hay VMAF, ni SSIM contra referencia perceptual, ni ojo humano.** SSIM y PSNR son métricas de similitud, no de calidad percibida.
- **No dice nada del VPS.** 0,687 fps aquí es esta CPU; el VPS midió 0,1828 fps con una fuente 4K distinta. Sumar o comparar esas cifras sería mezclar dos mediciones.
- **No dice nada de un televisor.** Cero píxeles vistos por un panel, cero decodificación por hardware, cero HDR real.
- **Una sola fuente, 3 segundos, contenido sintético de test.** No representa deporte, cine ni nada con movimiento complejo.

## Qué haría falta para cerrar P02 de verdad

1. **Una salida de referencia del Canary original** (un clip y su transformación) para comparar contra la reproducción de la receta.
2. **VMAF** sobre ese par — la única métrica perceptual admitida aquí.
3. Un dispositivo para ver el resultado en el panel que importa.
