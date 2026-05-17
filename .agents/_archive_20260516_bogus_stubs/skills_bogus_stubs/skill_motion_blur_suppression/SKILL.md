---
name: Skill_Motion_Blur_Suppression
description: Parametrización algorítmica de compresión intra-frame para suprimir el ghosting (estela de la pelota veloz).
category: Rate Control
---
# 1. Teoría de Compresión y Anomalía
Cuando la cámara sigue a un balón pateado a 120 km/h, FFmpeg intenta ser "eficiente" prediciendo el movimiento del bloque de la pelota en los B-Frames basándose en el color verde (El pasto de fondo). Como no le damos tiempo de calcular a profundidad (debido a que buscamos Latencia Cero), la pelota verde/blanca parece esfumarse o dejar una cola fantasmal de cuadros borrados (Ghosting/Motion Blur).

# 2. Directiva de Ejecución (Código / Inyección)
Se obliga al Encoder a usar vectores de movimiento ultra cortos (Fast Search) pero de extrema precisión, limitando las referencias temporales a menos fotogramas del pasado. Incrementamos la tarifa de transferencia (Skill 42) y ordenamos I-Frames contínuos.

```bash
# x264/HEVC Supresión de Ghosting por Fast Motion Search:
-x265-params me=hex:subme=2:ref=2:bframes=1:b-adapt=0
```
*(Se limitan los B-Frames a 1 máximo y se inhibe a 2 referencias. Gastará muchísima más red, pero para eso impusimos 300 Mbps; a nosotros no nos asusta empujar ancho de banda)*.

# 3. Flanco de Orquestación
Al usar menos B-Frames (fotogramas que adivinan bidireccionalmente y causan blur predictivo fallido), obligamos al encoder a transmitir la foto *real* del pixel casi constantemente (P-Frames inmediatos). El balón no depende de una predicción de hace 4 cuadros; es redibujado agresivamente con los datos actuales. La pelota se mueve nítida sobre el OLED.
