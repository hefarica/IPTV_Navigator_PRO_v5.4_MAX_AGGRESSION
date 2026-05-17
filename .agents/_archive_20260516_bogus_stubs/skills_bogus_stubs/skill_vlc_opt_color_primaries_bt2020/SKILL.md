---
name: Skill_VLCOpt_Color_Primaries_BT2020
description: Implementación algorítmica de `#EXTVLCOPT:color-primaries=bt2020` en M3U8 para arrancar clientes L2 de tajo.
category: M3U8 Generator
---
# 1. Teoría de Compresión y Anomalía
Aunque reestructuremos un flujo en el VPS backend (CMAF/Resolver), reproductores como VLC y OTT Navigator en AndroidTV poseen su propio cerebro de descompresión predeterminado. Si el stream, aunque venga a nivel 6.1 fMP4, es dudoso en sus bits iniciales, el reproductor arranca seguro usando Rec.709, causando lavado de colores temporal por los primeros 10 segundos de la transmisión hasta que el ABR "corrige".

# 2. Directiva de Ejecución (Código / Inyección)
La táctica Omni-God-Tier de APE exige invadir el manifiesto M3U8 dictando qué debe pensar el cliente aún antes de leer el URL de `.ts` o `.mkv`.

```javascript
/* Inyección Obligatoria por Canal en M3U8-Typed-Arrays (Generator JS/PHP): */
`#EXTINF:-1 tvg-id="${tvgId}" ...\n` +
`#EXTVLCOPT:network-caching=80000\n` +
`#EXTVLCOPT:video-filter=chroma_I444\n` +
`#EXTVLCOPT:color-primaries=bt2020\n` +
`${resolveUrl}\n`;
```

# 3. Flanco de Orquestación
Le cortamos el debate filosófico al cliente. La Shield TV abre el reproductor y la directiva de VLC obliga la paleta BT.2020 Wide Color Gamut (WCG) *instantáneamente*, logrando que el Zapping arroje Colores Vivos sin periodo de adecuación/ajuste, eliminando el asco visual pre-ABR.
