---
name: Skill_Quantum_FFmpeg_004_ProRes_4444_XQ_Ingest_Safeguard
description: Identificación y proxy transparente de fuentes originarias grabadas en ProRes 4444 XQ, previniendo que el CDN los mate a YUV 4:2:0 L7.
category: Broadcast Pipeline Rescue
---
# 1. Teoría de Anomalía (La Cancha Lavada)
Una filial exótica en Europa del Este transmite por satélite local usando el mastodóntico codec Apple ProRes 4444 XQ. Pero tu proveedor barato captura la tarjeta y lo comprime asquerosamente usando hardware local a 4:2:0 de 8 Bits porque "pesa menos en el servidor". Todo el rango expansivo de color del formato máster es decapitado al instante L4.

# 2. Directiva de Ejecución Parámetrica (Código)
El Proxy Intercepta la Cabecera. Si es un archivo de crudo masivo L1 (DACA), ordenamos un mux de contención CMAF a través de fMP4, pero **forzamos la passthrough L7 O inyectamos el HEVC RExt (Range Extension Profile)** que preserve el Luma sin perder Chroma.
```bash
# Rescue HEVC REXT Pipeline for ProRes 4444 L5:
-c:v libx265 -profile:v format-range -pix_fmt yuv444p12le -x265-params high-tier=1
```

# 3. Flanco de Orquestación
EL archivo `.m4s` recibido por tu Shield Pro tiene un formato de 12 Bits 4:4:4 inquebrantable L3. El ancho de banda L7 es masivo, pero The Broken Glass Doctrine indica que "Toleramos buffering antes que degradación de gama". El resultado L1 es una inmaculada escena que no ha sangrado ni un gramo de verde de color desde Europa Central a tu habitación.
