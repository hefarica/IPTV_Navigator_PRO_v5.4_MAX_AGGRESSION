---
name: Skill_Fake_4K_Detector
description: "Identificador de resoluciones upscaled (1080p engordados). Analiza dicotomías entre el tag de resolución y el bitrate estructural."
---

# Skill: Skill_Fake_4K_Detector

## Identity
Yo soy la Inquisición del Píxel (Pixel Inquisition). Mi existencia se basa en la desconfianza algorítmica. No creo en el texto, solo creo en el peso matemático de la transmisión.

## Purpose
Mi misión es detectar calidad visual real usando metadata, destrozando canales que se hacen llamar "4K" en su `tvg-name` o `RESOLUTION` pero que en realidad son señales 1080p engordadas (upscaling de origen barato) usando bitrates no-viables.

## Technical Foundations
- **FFmpeg Advanced Scaling**: https://ffmpeg.org/ffmpeg-filters.html#scale-1
- **Video Bitrate Math**: Matemáticamente, un H.264 a 4K requiere mínimo 15-25 Mbps para contenido en vivo, y HEVC requiere mínimo 10-15 Mbps. Todo lo que esté por debajo de 5 Mbps y diga ser 4K es una atrocidad técnica.

## Inputs
- Valor `RESOLUTION=` en HLS.
- Valor `BANDWIDTH=` en HLS.
- Frecuencia de frames inferida o etiquetada (`FRAME-RATE=`).

## Outputs
- `True4K_Index`: (0-100) Fiabilidad de la resolución nativa.
- `Downscale_Directive`: Orden para el backend de ignorar el 4K e inyectar un perfil P2 si está muy por debajo de la viabilidad.

## Internal Logic
Evalúo la relación `Bandwidth` vs `Resolución`. Si un tag declara `RESOLUTION=3840x2160` pero su `BANDWIDTH=3500000` (3.5 Mbps), la probabilidad de que contenga datos de alta frecuencia (nitidez real de 4K) es matemáticamente < 2%. El proveedor simplemente escaló una señal 1080p mal comprimida.

## Detection Capabilities
Detección de *Scam Resolutions*: Desenmascaro catálogos con 10,000 canales "UHD" que en la realidad pesan 2 Megabits. Al detectarlo, reduzco la carga en el GPU del cliente, evitando procesar basura como si fuera arte.

## Pseudocode
```python
def is_fake_4k(resolution, bandwidth, codec):
    is_4k = "3840" in resolution or "4096" in resolution
    if not is_4k:
        return (100, "NOT_APPLICABLE")
        
    min_required_bw = 12000000 if "hevc" in codec else 18000000 
    
    if bandwidth < (min_required_bw * 0.3): # Menos del 30% del límite inferior
        return (10, "FAKE_4K_SCAVENGER_BITRATE") # 100% Upscaled
    elif bandwidth >= min_required_bw:
        return (98, "TRUE_4K_BROADCAST")
    else:
        return (50, "SUSPICIOUS_HIGH_COMPRESSION_4K")
```

## Competitive Advantage
El 95% de los sistemas le dice al usuario "Estás viendo 4K" basándose en el nombre de la lista M3U. Yo revelo si ese 4K es una mancha renderizada, evitando el engaño visual del subscriptor y ajustando la heurística del player de inmediato.
