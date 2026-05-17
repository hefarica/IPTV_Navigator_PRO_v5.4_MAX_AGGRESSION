---
name: Skill_VLCOpt_Sout_Transcode_Bypass
description: Bloquear directivas de transcode destructivo que el M3U8 Generator pudiera inyectar heredadas y lavar colores.
category: M3U8 / L7 Protection
---
# 1. Teoría de Compresión y Anomalía
En versiones anteriores (como vimos en bugs fatídicos de APE), la presencia de tags agresivos como `#EXTVLCOPT:sout=#transcode{...}` obligaba al reproductor local de VLC en Android a "re-codificar" el flujo a nivel de celular/TV. Ese software limitadísimo convertía un HDR HEVC en un SD MPEG-4 descolorido y sin hardware acceleration y quitaba audios. 

# 2. Directiva de Ejecución (Código / Inyección)
Se PROHÍBE tajantemente inyectar cualquier `#sout=#transcode` en el ecosistema 2026+. Se reemplaza todo el procesamiento en hardware del panel final.

```javascript
/* Regex de Barrido OBLIGATORIO en M3U8 Generator (Cortex Omega): */
manifest = manifest.replace(/#EXTVLCOPT:sout=#transcode.*?\n/g, "");
```

# 3. Flanco de Orquestación
(Doctrina de Paso Directo / The Broken Glass). No le permitimos a un procesador de TV que recodifique. Nuestro resolver fMP4 confía el 100% de la carga al decodificador MediaCodec original del hardware. Obtenemos cero artifacts generados localmente.
