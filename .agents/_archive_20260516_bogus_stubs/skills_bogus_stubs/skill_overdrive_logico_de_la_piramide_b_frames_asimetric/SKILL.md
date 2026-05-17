---
description: Codificación de video (FFmpeg, codecs) - Overdrive Lógico de la Pirámide B-Frames Asimétricos
---
# Overdrive Lógico de la Pirámide B-Frames Asimétricos

## 1. Definición Operativa
La capacidad de pervertir la codificación estándar y embutir cuadros bidireccionales matemáticos dentro de otros cuadros B, incrementando la eficiencia de la compresión sin escalar el bitrate L5 general.

## 2. Capacidades Específicas
- Construcción paramétrica de B-Frame Pyramids L4 L5 (HEVC/AVC)
- Explotación cruda de la Heurística Rate-Distortion Optimization (RDO)
- Orquestamiento jerárquico Lookahead (rc-lookahead) a Nivel Macroblock 

## 3. Herramientas y Tecnologías
**FFmpeg libx265, libx264, Elecard StreamEye, VQMT**

## 4. Métrica de Dominio
**Métrica Clave:** Disminuir el consumo de ancho de banda en 35% sosteniendo una misma pureza matemática VMAF >95 cruda L7 contra el material no comprimido L4.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Un Stream Deportivo HEVC OMEGA de 1080p60fps consumiendo solo 2.5 Mbps en lugar de los 5 Mbps de Netflix usando B-Frames Híbridos dinámicos que estiman la velocidad del balón.
