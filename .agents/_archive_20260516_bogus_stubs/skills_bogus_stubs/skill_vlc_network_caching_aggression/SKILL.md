---
name: Skill_VLC_Network_Caching_Aggression
description: `#EXTVLCOPT:network-caching=80000` replicado en TiviMate/VLC core engine.
category: VLC Strict Control
---
# 1. Teoría de Compresión y Anomalía
Aun con todos los bypass de ExoPlayer de la Shield TV, si la plataforma decide caer a su "Software Decoder" porque no reconoció un codec HEVC 12bit extraño, puede invocar un Wrapper de LibVLC (VLC por debajo). VLC por default guarda miserables "1000 milisegundos" en red. Un estornudo en el router tumba el stream.

# 2. Directiva de Ejecución (Código / Inyección)
Secuestro de toda la memoria volátil del cliente en caso de fallback a VLC L2.

```javascript
/* M3U8 Core Injection for Any Decoder Path: */
`#EXTVLCOPT:network-caching=80000
#EXTVLCOPT:live-caching=80000
#EXTVLCOPT:sout-mux-caching=50000`
```

# 3. Flanco de Orquestación
80,000 milisegundos son **80 segundos completos** de video en vivo alojados en la barriga de la memoria RAM del televisor. A los 300Mbps picos del Perfil 1 Crystal UHD, eso puede tomar cientos de Megabytes de memoria. Es agresión pura al hardware del cliente, asegurando un bloque de granito contra la inestabilidad. ¿Tienes la Shield Pro de 3GB de RAM? Te vamos a usar la RAM. Ni un solo apagón satelital frenará tu película.
