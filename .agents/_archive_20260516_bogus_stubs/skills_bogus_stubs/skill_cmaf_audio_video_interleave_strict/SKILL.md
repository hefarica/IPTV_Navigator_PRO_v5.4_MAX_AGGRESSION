---
name: Skill_CMAF_Audio_Video_Interleave_Strict
description: Obligación Estricta de Interlineado de Audio/Video en CMAF FMP4 para Prevenir Buffer Float.
category: Muxer / Container
---
# 1. Teoría de Compresión y Anomalía
La desincronización y el "drift" crónico del buffering ocurre cuando FFmpeg multiplexa un bloque enorme de video seguido de un bloque enorme de audio (mal interlineado). Esto "hace trampa" al buffer L1 del cliente: ExoPlayer consume todo el video pero pausa la reproducción al faltar el audio correspondiente, lo cual genera micro-cortes sin dañar la imagen, pero destruyendo la experiencia.

# 2. Directiva de Ejecución (Código / Inyección)
Se fuerza a fMP4 a fragmentar y mezclar video y audio en el mismo intervalo ínfimo, garantizando una paridad temporal perfecta.

```bash
# Interlineado Quirúrgico OBLIGATORIO:
-max_interleave_delta 50k -max_muxing_queue_size 1024
```
Y si es necesario (en streams altamente inestables): `-async 1 -vsync 1` (u análogos modernos `fps_mode`) para anclar la línea de tiempo.

# 3. Flanco de Orquestación
Con el interlineado estricto, la Shield TV o Apple TV reciben en cada paquete HTTP exactamente la misma proporción de audio e imagen. El buffer de 80,000ms que usamos se llena de manera uniforme, suprimiendo las oscilaciones erráticas de memoria y ofreciendo un streaming tipo "Roca", sólido como el cristal.
