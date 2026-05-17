---
name: Skill_BT2020_NC_vs_C_Luma_Fix
description: Aplicación de la Luminancia No Constante (BT2020NC) para evitar fallos matemáticos Luma/Chroma en televisores.
category: Colorimetry
---
# 1. Teoría de Compresión y Anomalía
El estándar BT.2020 tiene dos variantes: `bt2020nc` (Non-Constant Luminance) y `bt2020c` (Constant Luminance). Gran parte del hardware descodificador del mercado mundial solo soporta `bt2020nc`. Si etiquetas un stream accidentalmente como `bt2020c` (matriz coeficiente 10), el reproductor intentará separar Luma y Croma simétricamente y fallará, generando píxeles basura rosados en sombras profundas.

# 2. Directiva de Ejecución (Código / Inyección)
La directriz de seguridad estricta para hardware requiere fijar `colorspace=bt2020nc` (Valor de coeficiente 9).

```bash
# Fijar Luminancia No-Constante en FFmpeg:
-colorspace bt2020nc
# BSF (Value 9):
matrix_coefficients=9
```

# 3. Flanco de Orquestación
Asegura que cualquier televisor HDR conectado a un Android TV Box no colapse al procesar los oscuros. Las tribunas de un estadio techado no se verán con manchas magenta; se verán negras y prístinas.
