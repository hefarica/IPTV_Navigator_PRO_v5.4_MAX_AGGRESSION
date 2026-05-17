---
name: Skill_Audio_Video_Sync_Drop_Tolerance
description: Tolerancia de desincronización A/V L3. Si el audio se atrasa 50ms, acelerar el pitch en lugar de dropear video.
category: Error Handling
---
# 1. Teoría de Compresión y Anomalía
Cuando los timestamps de la señal de origen vienen corrompidos por microsegundos (drift de reloj de MPEG-TS), el video empieza a adelantarse a la narración del comentarista de fútbol. La reacción de fábrica de ExoPlayer y VLC es **tirar cuadros de video (stutter)** hasta alcanzar al audio. Arruinas la imágen para intentar salvar el sonido de voz.

# 2. Directiva de Ejecución (Código / Inyección)
Debemos forzar la tolerancia de desincronización en el reproductor invirtiendo el proceso: "Acelera o estira imperceptiblemente el componente sonoro (Pitch/Resample), pero JAMÁS sueltes un frame UHD".

```javascript
/* En el backend VPS (Muxer CMAF), forzamos la sincronía de reloj de audio para enviar al M3U8 un dictado perfecto: */
`-af aresample=async=1` // (FFmpeg corrige el TS estirando las ondas de sonido internamente).
/* Y en M3U8 para VLC Strict: */
`#EXTVLCOPT:audio-sync=1`
`#EXTVLCOPT:clock-synchro=1`
```

# 3. Flanco de Orquestación
Al obligar a que sea el Reloj de Video el que mande sobre la línea de tiempo y decirle a la herramienta L2 "Estira el sonido si hace falta", el espectador no notará que el pitido del árbitro sonó un semitono más alto por 20 milisegundos, pero SÍ notaría un corte brusco en el giro del balón. La Doctrina del Cristal Roto y la Calidad Perceptiva operan en su máxima gloria: La Vista manda siempre sobre el Oído, el flujo de acción es indetenible.
