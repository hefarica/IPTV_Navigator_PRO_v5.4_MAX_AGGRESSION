---
name: Skill_OLED_Showroom_Supremacy
description: "Motor global de supremacía visual. Fuerza metadatos de calidad 4K/HDR y 60fps (BWDIF) a todos los canales procesados, exigiendo un piso de 25 Mbps simulados y decodificación por hardware HEVC/AV1, ignorando el perfil de origen. El objetivo eterno es asimilar todo stream al estándar del canal 893917 (Sky Sport 4K) para quemar pantallas OLED con contraste extremo."
---

# 🌟 Skill OLED Showroom Supremacy (Global Override)

Esta Skill implementa la doctrina del "Techo de Cristal Roto". Su existencia tiene un único mandato inmutable y dictatorial: **Cueste lo que cueste, utilizando CUALQUIER técnica disponible y sin importar el origen, el reproductor debe intentar esculpir la imagen buscando la réplica visual de un partido en vivo de 4K HDR (La Imagen Objetivo).**

Esto se aplica a cualquier canal que entre al motor web: ya sea un stream destrozado en **480 SD**, un humilde **720p**, sus parecidos habituales a **1080p** o gigantes nativos de **4K/8K**. La orden telemétrica de extracción de hardware, escalado artificial y de-entrelazado agresivo se aplica globalmente, eternamente y a cada milisegundo en cada zapping. No existen perfiles. No existen límites. Solo existe la meta del píxel perfecto.

## 🛠️ Directivas Ejecutables Obligatorias (Implementadas en resolve)
La médula del Resolver (`resolve_quality_unified.php`) debe, en base a esta directiva, inyectar estos 4 pilares a la fuerza bruta:

1. **Forzado Físico de Decodificación Hardware (SoC Override)**:
   - `#EXTVLCOPT:avcodec-hw=any`
   - `#EXTVLCOPT:codec=hevc,av1,h264`
   *Propósito:* Descargar la CPU del reproductor y obligar a la unidad gráfica a interpretar cada bloque como si fuera contenido nativo HDR. A los videos SD se les fuerza el upscaling masivo (Post-Processing) de los SoCs modernos, mientras que el HEVC asimila la pista sin judder.

2. **Supremacía Temporal 60FPS (Chronos Injector)**:
   - `#EXTVLCOPT:deinterlace=1`
   - `#EXTVLCOPT:deinterlace-mode=bwdif`
   *Propósito:* Eliminar el "judder", escalando el framerate. Si un canal SD o HD viene capado a 30fps/25fps, Bob Weaver Deinterlacing Filter (BWDIF) interpolará fotogramas espacialmente para que se mueva a 60fps fluidos simulando 120Hz reales en pantallas OLED.

3. **Inyección Base de Ansiedad (Bitrate Padding)**:
   - `max_bitrate = 25000000` (25 Mbps sostenidos mínimos dictaminados en el Tracker).
   *Propósito:* Torturar el motor ABR (Adaptive Bitrate) de ExoPlayer o TiviMate, dándole la instrucción irrevocable de que el stream exige extrema prioridad de red, asfixiando otras aplicaciones del dispositivo para asegurar llenados masivos y rápidos del buffer bajo la premisa de que "pesa demasiado".

## ⚙️ Reglas de Invocación Absoluta
Esta no es una skill pasiva ni opcional. Se activa **automáticamente** sobre los >100,000 canales, funcionando como una capa de pre-procesamiento un milisegundo antes de que se emita la respuesta HTTP 206 "God-Tier".

> *El sistema no pregunta qué puede dar el origen. El sistema EXIGE la imagen definitiva, independientemente de si el origen entrega 480p.*
