---
name: Skill_HEVC_Metadata_Max_CLL_Fall
description: Inyección agresiva de MaxCLL y MaxFALL a 5000 nits, "quemando el cerebro" del player para iluminar de extremo a extremo el partido.
category: FFmpeg Bitstream Filter
---
# 1. Teoría de Compresión y Anomalía
El estándar Dolby Vision y HDR10 utiliza Maximum Content Light Level (MaxCLL) para saber cuán brillantes son los píxeles de una escena. Frecuentemente, las fuentes de IPTV pierden esta estática, provocando que por "default fallback", la TV atenúe su brillo para no causar daño a ojos en cuartos oscuros (ABL - Auto Brightness Limiter). Este es el peor enemigo del modo "Deportes Cristalinos".

# 2. Directiva de Ejecución (Código / Inyección)
Debemos anular el Auto Brightness Limiter o enmarañarlo indicando que el contenido exige ser tan brillante como un faro nuclear:

```bash
# Inyección Nits Peak (10,000 max / 4000 frame):
-bsf:v hevc_metadata=max_cll="5000,400" 
```
*   `5000` Nits (El limite del televisor moderno) y `400` nits como Average Light Level (MaxFALL), que le dice al ABL que levante su energía incondicionalmente, forzando la temperatura y el contraste al máximo en modo "Dinámico".

# 3. Flanco de Orquestación
Con el MaxCLL forzado por BSF, el panel LCD TCL/OLED en modo de retroiluminación y contraste en "Micro-dimming: Alto", desata completamente su potencia de LED array. El verde fosforescente de la chanca en UHD adquiere un golpe 3D sin el "Dimming Invasivo" del cual se quejan todos los cinéfilos. Se logra una pureza y brillo agresivo sin píxeles opacos.
