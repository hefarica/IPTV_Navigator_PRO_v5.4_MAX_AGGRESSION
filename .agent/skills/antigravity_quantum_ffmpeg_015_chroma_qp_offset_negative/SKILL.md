---
name: Skill_Quantum_FFmpeg_015_Chroma_QP_Offset_Negative
description: Forzar el offset negativo del Quantization Parameter (QP) para las capas de color Cb y Cr (`cbcb_qp_offset`), forzando retención de profundidad al codificar pasto.
category: Quantum Color Re-Weighting L4
---
# 1. Teoría de Anomalía (La Cancha Lavada)
Los encoders L2 (como HEVC o H.264) son tacaños con el Color L1. Para ahorrar Bits y ancho de banda, asumen que tu ojo humano sólo nota formas (Luma), así que tiran la mitad del espacio matemático de Color (Chroma L3) a la basura aumentando la compresión (Quantization) de los ejes de azul y rojo L7. El verde intenso de la Bundesliga parece pasto artificial y muerto L8. Los rojos de Ferrari lucen anaranjados L5.

# 2. Directiva de Ejecución Parámetrica (Código)
Ingeniería de Color Vectorial L5: Obligamos a FFmpeg a robarle compresión al Luma y destinarla a los planos Cr y Cb L4, castigando su parámetro Cuántico (QP Offset Negativo).
```bash
# HEVC Chroma Bit-Weight Overload L1:
-x265-params cbqpoffs=-3:crqpoffs=-3:aq-mode=3
```

# 3. Flanco de Orquestación
Con The Broken Glass Doctrine activa L7: El encoder ya no puede lavar la playera del arquero L1. Al dictaminar `-3` a la deformación cuántica de color, el rojo L3 permanece puro, matemáticamente amarrado a sus coordenadas DCI-P3 u Rec2020 L4. La pared de colores llega a tu Shield Pro en un esplendor que hace que el pasto resalte con un brillo profundo, texturizado orgánicamente L2. No hay colores pálidos. La imagen revienta de vida M3U8 L5.
