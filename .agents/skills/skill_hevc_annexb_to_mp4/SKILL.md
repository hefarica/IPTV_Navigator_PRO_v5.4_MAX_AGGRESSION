---
name: Skill_HEVC_AnnexB_to_MP4
description: Puente Seguro "Annex B" a fMP4 para flujos HEVC, evitando corruptelas y "Tearing" por metadatos crudos.
category: FFmpeg Bitstream Filter
---
# 1. Teoría de Compresión y Anomalía
Cuando capturamos un flujo HEVC nativo transmitido originalmente en MPEG-TS (el formato de listas M3U estándar de los proveedores), el video está empaquetado como "Annex B" NAL units. Si lo encapsulamos a CMAF (fMP4) usando `-c copy` sin filtrado previo, las tablas de metadatos colisionan, causando que la pantalla parpadee en verde (tearing) o ExoPlayer lance el temido `UnrecognizedInputFormatException`.

# 2. Directiva de Ejecución (Código / Inyección)
La transformación obligatoria requiere un filtro BSF para reconvertir el flujo Annex B al formato empaquetado MP4, mientras inyectamos HEVC simultáneamente.

```bash
# Puente Seguro de Transmutación HEVC a CMAF:
-c:v copy -bsf:v hevc_mp4toannexb,hevc_metadata=level=6.1:tier=high -f mp4
```
*(Nota: Dependiendo del flujo exacto, FFmpeg puede auto-invocarlo, pero forzar `hevc_mp4toannexb` en orígenes reversos limpia el flujo de artefactos dejados por proveedores inestables).*

# 3. Flanco de Orquestación
Al purificar la pista HEVC hacia fMP4, combinamos la ultra resolución del H.265 con la latencia mínima del CMAF. Esto cumple el mandato de "Sin Dañar Nada": obtenemos un stream agresivo y masivo, pero 100% legal bajo las especificaciones del cliente.
