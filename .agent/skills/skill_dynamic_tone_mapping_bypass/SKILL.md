---
name: Skill_Dynamic_Tone_Mapping_Bypass
description: Evasión destructiva: Erradicar el decaimiento de Tono (Tone Mapping a SDR) forzando passthrough perceptivo VUI explícito L2/L3.
category: Metadata Injection
---
# 1. Teoría de Compresión y Anomalía
Los sistemas Android TV más intrusivos aplican Tone Mapping automático si detectan que un archivo "dice ser UHD" pero dudan sobre el meta-data (ej. falta Master Display Colour Volume). Este Tone Mapping de baja calidad (por CPU del Smart TV barato) aplasta todos los blancos a 200 nits, eliminando la vida del estadio y tiñendo el juego de un amarillento muerto.

# 2. Directiva de Ejecución (Código / Inyección)
Se prohíbe explícitamente al cliente hacer Tone Mapping degradativo al inyectarle una señal maestra criptográfica, diciéndole al hardware: "Yo calculo mis propios grises, pásame derecho". Usando BSF de HEVC extra.

```bash
# HEVC BSF Anti-Tone Mapping (MDCV/CLLI OBLIGATORIO):
-bsf:v hevc_metadata=master_display="G(13200,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1)":max_cll="4000,100"
```
*(Valores para Master Display P3 y MaxCLL 4000 nits reales impresos crudos en el flujo CMAF).*

# 3. Flanco de Orquestación
Con esta skill la Nvidia Shield y televisores con "Color Vívido" quedan engañados para que abran el diafragma de la LED a niveles de Sol abrasador. No aplican el tone mapping a SDR. ExoPlayer entrega el meta-data intacto en su canal HDMI. La imagen es cristalina, hiper-iluminada y viva; el nivel absoluto "Día en la cancha".
