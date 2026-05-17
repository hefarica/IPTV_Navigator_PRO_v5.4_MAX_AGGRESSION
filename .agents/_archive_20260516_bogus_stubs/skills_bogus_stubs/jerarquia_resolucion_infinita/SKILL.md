---
name: Jerarquía Resolución Infinita (Maximum Resolution Escalator)
description: Regla arquitectónica estricta que exige que el reproductor siempre intente extraer y visualizar la pista de mayor resolución disponible en el stream M3U8, con un fallback en cascada (8K -> 4K -> FHD -> HD -> SD).
---

# 🚀 DOCTRINA DE VISUALIZACIÓN: JERARQUÍA RESOLUCIÓN INFINITA

## 1. El Problema Analizado

Los proveedores IPTV a menudo envían múltiples pistas de video ocultas, o el reproductor ABR (Adaptive Bitrate) asume por defecto una resolución segura (ej. 720p o 1080p) para ahorrar buffer, incluso si el servidor origen tiene disponible una pista Nativa HLS en 4K o superior. Limitar estáticamente la resolución en los perfiles restringe la posibilidad de aprovechar la calidad máxima oculta en streams premium.

## 2. La Regla de Oro (Jerarquía Ascendente 5-Tier)

Para forzar al reproductor a *siempre apuntar a lo más alto*, debemos aplicar una inyección de escalera. Declaramos múltiples límites de resolución en el bloque `#EXTVLCOPT`, de menor a mayor.
El reproductor y el proxy VPS procesarán las reglas; si la más alta no resulta soportada o no existe en el origen, el motor caerá automáticamente a la resolución válida inmediatamente inferior, sin desconectarse.

La jerarquía **NO NEGOCIABLE** es:

1. 🥇 **4320p** (8K UHD)
2. 🥈 **2160p** (4K UHD)
3. 🥉 **1080p** (FHD)
4. 🏅 **720p** (HD)
5. 🎖️ **480p** (SD / Fallback de Supervivencia)

## 3. Implementación Sintáctica

Al igual que con el filtro BWDIF, usamos inyección múltiple de propiedades en el compilador de listas. Se debe emitir en este orden exacto:

```text
#EXTVLCOPT:preferred-resolution=480
#EXTVLCOPT:adaptive-maxwidth=854
#EXTVLCOPT:adaptive-maxheight=480
#EXTVLCOPT:preferred-resolution=720
#EXTVLCOPT:adaptive-maxwidth=1280
#EXTVLCOPT:adaptive-maxheight=720
#EXTVLCOPT:preferred-resolution=1080
#EXTVLCOPT:adaptive-maxwidth=1920
#EXTVLCOPT:adaptive-maxheight=1080
#EXTVLCOPT:preferred-resolution=2160
#EXTVLCOPT:adaptive-maxwidth=3840
#EXTVLCOPT:adaptive-maxheight=2160
#EXTVLCOPT:preferred-resolution=4320
#EXTVLCOPT:adaptive-maxwidth=7680
#EXTVLCOPT:adaptive-maxheight=4320
#EXTVLCOPT:adaptive-logic=highest
```

*Nota Técnica:* Declarar siempre `adaptive-logic=highest` junto con restricciones múltiples hace que ExoPlayer y VLC escalen al límite virtual. El renderizador asimila las sobrescrituras progresivas obligándolo a apuntar al cielo en ancho de banda visual.

## 4. Archivos Afectados Siempre

Siempre que se deba tocar la resolución, estas reglas aplican:

- `m3u8-typed-arrays-ultimate.js` (Escalera de strings dinámicos)
- `resolve.php` (Motor VPS backend)

**Efecto Sinérgico:** Al combinar la **Jerarquía BWDIF** con la **Jerarquía Resolución Infinita**, logramos la cima de la ingeniería de streaming: "Demandar la resolución máxima absoluta del servidor, y mostrarla con nitidez y frame-rate de post-producción".
