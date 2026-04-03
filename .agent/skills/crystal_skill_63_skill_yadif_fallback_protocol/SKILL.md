---
name: Skill_Yadif_Fallback_Protocol
description: Protocolo de caída controlada (Fallback) a Yadif Hardware Accelerated si el CPU asfixia al BWDIF.
category: Architecture / Resilience
---
# 1. Teoría de Compresión y Anomalía
La maestría visual de BWDIF (Skill 62) es tan pesada que en horas "Prime Time" donde nuestro VPS procesa docenas de re-streams UHD, el CPU puede golpear el 100%, desatando "Frame Drops" peores que el entrelazado en sí. La Doctrina dicta un Fallback a hardware.

# 2. Directiva de Ejecución (Código / Inyección)
Si estamos usando aceleración NVDEC (NVIDIA VPS) o VAAPI, `bwdif` pierde soporte asíncrono puro de hardware (sólo CUDA). Forzamos entonces decodificación por hardware de-interlacing (EJ: `yadif_cuda` o el decodificador deinterlace nativo de NVDEC).

```bash
# Fallback a Deinterlace Hardware Acelerado (Cero Latencia CPU):
-hwaccel cuda -hwaccel_output_format cuda -i [INPUT] -vf yadif_cuda=mode=send_field
# O en hardware VAAPI: -vf deinterlace_vaapi=rate=field
```

# 3. Flanco de Orquestación
(The Broken Glass). Si el CPU falla, la GPU lo absorbe. Aunque Yadif es levemente inferior a BWDIF en texturas ultracomplejas a la distancia, un modo `send_field` mediante GPU CUDA logra los tan deseados 60 fps sin desgastar un gramo de CPU de Linux. La fluidez temporal se respeta y la Shield TV no sufre macroblocking de asfixia, manteniendo la estabilidad inquebrantable del partido.
