---
name: Jerarquía Deinterlace BWDIF (Soporte Multi-Capa)
description: Regla arquitectónica inmutable que exige que la interpolación de fotogramas siempre intente iniciar en calidad post-producción (BWDIF), con caída segura a YADIF2X (60fps) y luego YADIF (30fps) si el hardware se ahoga.
---

# 🎥 DOCTRINA DE RENDERIZADO: JERARQUÍA BWDIF

## 1. El Problema Analizado

Los reproductores IPTV en Smart TVs (FireTV, Shield, ONN) tienen capacidades de descodificación de video muy dispares. Forzar un filtro de post-producción avanzado como **BWDIF (Bob Weaver Deinterlacing Filter)** en un procesador débil puede causar caída de frames (stuttering) o pantalla negra, mientras que usar un filtro débil (YADIF normal) en un procesador potente desperdicia la posibilidad de ver deportes a 60fps reales.

## 2. La Regla de Oro (Jerarquía 3-Tier)

A partir de este momento, **CADA VEZ** que se genere un archivo `.m3u8` o se resuelva un stream en el VPS (`resolve.php`), el bloque de configuración del reproductor (`#EXTVLCOPT`) debe declarar explícitamente la intención de máxima calidad, permitiendo que el motor del reproductor (ExoPlayer/libVLC) haga el *fallback* seguro.

La jerarquía **NO NEGOCIABLE** es:

1. 🥇 **BWDIF** (Target principal): Calidad de post-producción, bordes perfectos, 60fps progresivos.
2. 🥈 **YADIF2X** (Fallback Primario): Duplicación de fotogramas estándar (60fps), menos intensivo en CPU pero fluido como mantequilla.
3. 🥉 **YADIF** (Fallback de Supervivencia): Desentrelazado estándar a 30fps. Evita el efecto peine pero no da fluidez deportiva.

## 3. Implementación Sintáctica

Dado que la sintaxis estricta de `#EXTVLCOPT:deinterlace-mode=` no siempre procesa listas separadas por comas, la mejor técnica de inyección para forzar la cascada en reproductores OTT/VLC es declarar los modos en orden inverso (primero el fallback, de último el target deseado para que sobrescriba en memoria), o apoyarse en el fallback nativo de ExoPlayer/VLC estableciendo el límite superior:

```text
#EXTVLCOPT:video-filter=deinterlace
#EXTVLCOPT:deinterlace-mode=yadif
#EXTVLCOPT:deinterlace-mode=yadif2x
#EXTVLCOPT:deinterlace-mode=bwdif
#EXTVLCOPT:deinterlace=1
```

*Nota Técnica: Al apilar las directivas, los parsers de M3U8 de hardware limitado ignorarán el filtro "bwdif" si no está compilado en su FFMPEG interno, quedándose con "yadif2x". Si ese tampoco existe, caerán a "yadif". Si el player lee el último, intentará BWDIF y si falla la GPU, el player hace su fallback interno.*

## 4. Archivos Afectados Siempre

Siempre que se actualice o revise el módulo de desentrelazado, se deben modificar en paralelo:

- `m3u8-typed-arrays-ultimate.js` (Generador JS)
- `resolve.php` (Motor VPS backend)

**Nunca omitir esta regla.** El objetivo final es **Riesgo 0 de pantalla negra**, combinado con **100% de Calidad Visual Máxima** posible para el dispositivo del usuario final.
