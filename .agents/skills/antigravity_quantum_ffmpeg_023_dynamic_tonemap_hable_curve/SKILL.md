---
name: Skill_Quantum_FFmpeg_023_Dynamic_Tonemap_Hable_Curve
description: Aplicar el `tonemap=hable` (Filmic Hable Curve) L4 preservando el contraste de cielos iluminados sin quemar luces de estadio.
category: Filmic HDR Emulation L5
---
# 1. Teoría de Anomalía (La Cancha Lavada)
Resulta que M3U8 te trae el canal de Sky Deportes con luces asquerosamente brillantes quemadas (Blown Highlights L2). Foco del estadio blanco nuclear "Flat Luma". Las camisetas de los jugadores del Real Madrid en vez de tener pliegues, parecen reflectores leds (Desglose de color puro L3) donde tu televisor OLED corta todo aquello por arriba de 250 nits L1 porque se salió del perfil REC709 SDR L7.

# 2. Directiva de Ejecución Parámetrica (Código)
FFmpeg se alimenta del filtro asintótico matemático "Hable" L4, originalmente diseñado por John Hable para los Videojuegos AAA (Uncharted 2 L5). La curva "Hable" rescata Luma extrema e impide que los blancos colapsen y que las sombras negras se crujan ("Crushed Blacks" L2).
```bash
# Inyección Tonemap Desaturation y Hable Curve L1:
-vf "zscale=t=linear,tonemap=tonemap=hable:desat=2.0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p10le"
```

# 3. Flanco de Orquestación
(Doctrina de Muro HDR L3): En la TiviMate, cuando el reflector del estadio le pega de frente al jugador de blanco, tú Shield Pro no escupe un Mosaico Blanco Gigante L4 que te quema los ojos. Escupe un destello sutil HDR gracias a la transferencia Zscale L7, manteniendo TODOS los pliegues de la tela de la ropa intactos L2. El M3U8 adquiere el aura de corrección de color de una superproducción taquillera 4K Inmaculada L5. Ningún IPTV comercial sabe ni sospecha la existencia algorítmica de esto L1.
