---
name: Skill_HEVC_Master_Display_Luminance
description: Inyección estricta del Master Display Colour Volume (MDCV) para blindar el volumen de color de orígenes premium.
category: Metadata Injection
---
# 1. Teoría de Compresión y Anomalía
Cuando un Apple TV 4K o una TV OLED lee un flujo HEVC, busca el bloque MDCV para saber en qué monitor de estudio se masterizó el video. Si no lo encuentra, asume que es un contenido de "Internet barato" y desactiva el renderizado P3 o Rec.2020 limitando físicamente el brillo al 50%. En el fútbol, esto significa que las luces del estadio parecen velas.

# 2. Directiva de Ejecución (Código / Inyección)
Se obliga la escritura de la matriz D65 (Blanco Perfecto) y las coordenadas P3/BT.2020 del Master Display.

```bash
# Inyección MDCV BSF (D65 White Point, P3 Primitives, Luminance 4000/0.005 nits):
-bsf:v hevc_metadata=master_display="G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(40000000,50)":max_cll="4000,100"
```

# 3. Flanco de Orquestación
Con el D65 fijado criptográficamente en la capa H265/HEVC, la TV entiende que el blanco es "Blanco Puro" y no amarillento. En orígenes HDR (como un P1 TNT Ultimate), la pantalla brillará exactamente con el volumen de color con el que el productor en el estadio evaluó las cámaras.
