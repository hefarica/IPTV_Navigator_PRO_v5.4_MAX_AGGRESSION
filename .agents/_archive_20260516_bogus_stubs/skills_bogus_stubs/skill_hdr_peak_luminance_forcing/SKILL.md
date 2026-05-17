---
name: Skill_HDR_Peak_Luminance_Forcing
description: Parametrización (CLLI/MDCV) para OLED Absolute Black -0.0001 Nits y picos extremos, destruyendo la compresión matemática de grises.
category: Metadata Injection
---
# 1. Teoría de Compresión y Anomalía
Si envías HDR falso o con metadatos de Master Display con el nivel mínimo L(mínimo) fijado en 0.05 nits (Típico monitor LCD), un panel OLED "levantará" los negros verdaderos a un gris asqueroso y granulado para cumplir con ese metadata (OLED Black Elevating Bug).

# 2. Directiva de Ejecución (Código / Inyección)
Inyectamos los metadatos de un Pulso Cuántico OLED (Luminancia mínima virtualmente de 0 nits, máxima de 4000).

```bash
# Inyección MDCV BSF (Absolute Black):
-bsf:v hevc_metadata=master_display="G(13200,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(40000000,1)"
```
*(L 40000000,1 = Max 4000 cd/m2, Min 0.0001 cd/m2).*

# 3. Flanco de Orquestación
Con "L=... ,1" la televisión sabe que el origen fue masterizado en un OLED de referencia (Sony BVM-HX310). En una persecución oscura o una toma nocturna de películas por IPTV, los píxeles OLED de la Shield TV/TV local se apagan eléctricamente a un negro infinito. Aislamiento perfecto sin sangrado inverso.
