---
name: Skill_YUV_Color_Matrix_Enforcer
description: Fijar la matriz de interpolación a YUV Jpeg full range (-colorspace ycgco o jpeg).
category: FFmpeg Global
---
# 1. Teoría de Compresión y Anomalía
Si no especificamos una matriz YUV estricta, la compresión de bloques (macroblocks) confunde el verde y el luma durante el CBR rate control. FFmpeg puede intentar colapsarlo bajo un rango estricto (`mpeg`).

# 2. Directiva de Ejecución (Código / Inyección)
Añadimos como bandera extraída de la documentación profunda la directiva del rango de coeficiente Jpeg YUV, que mapea a rango visual absoluto PC 0-255:

```bash
# Inserción Global de la Matriz:
-color_range jpeg -colorspace bt2020nc
```
*(Nota: JPEG color range en video codec equivale a PC full range pero a menudo se asimila mejor en codificadores HEVC/x265 forzando el no descarte de los extremos).*

# 3. Flanco de Orquestación
Se anexa al bloque de Rango Visual de la Habilidad 26. Garantiza una imagen 100% libre del filtro blanco-fantasma. Los rojos de las camisetas (ej. Bayern Munich, Liverpool) sangrarán color hasta deslumbrar en el modo Dinámico. Menos compresión luma, sin alterar la latencia.
