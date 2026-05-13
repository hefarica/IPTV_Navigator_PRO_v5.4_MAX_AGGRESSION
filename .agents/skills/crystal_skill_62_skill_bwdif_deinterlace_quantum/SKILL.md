---
name: Skill_BWDIF_Deinterlace_Quantum
description: Desentrelazado BWDIF (Bob Weaver Deinterlacing Filter) para deportes. Exige 60fps progresivos reales separando la señal 1080i.
category: FFmpeg V-Filter
---
# 1. Teoría de Compresión y Anomalía
Casi todo el fútbol europeo y latino original se graba en cámara a 1080i (Entrelazado). Cada "fotograma" es solo la mitad de las líneas horizontales (pares o impares). Si envías 1080i crudo a un cliente, o usas un desentrelazador mediocre (`yadif=mode=0`), la bola sufre el infame efecto "peine" (combing) y el pasto tiembla con "doble imagen" al haber mucho movimiento.

# 2. Directiva de Ejecución (Código / Inyección)
BWDIF es el santo grial de FFmpeg para transmisiones en vivo; mezcla interpolación direccional con filtros espaciales, generando 2 fotogramas perfectos (60 FPS) por cada fotograma entrelazado original (30 FPS). Esta técnica demanda RAM agresiva.

```bash
# La Magia Cuántica (BWDIF Double Framerate Send Field):
-vf "bwdif=mode=send_field:deint=all"
```

# 3. Flanco de Orquestación
Al usar `send_field`, le decimos a FFmpeg: "Cada medio cuadro entrelazado, trátalo e interpólalo hasta que sea un cuadro progresivo entero independiente". Un partido de 25 o 30 FPS se transmuta como magia a 50 o 60 FPS reales muy fluidos. El paneo de la cámara a lo largo del campo no produce estelas. El Nvidia Shield Pro se relaja y emite 60hz fluidos.
