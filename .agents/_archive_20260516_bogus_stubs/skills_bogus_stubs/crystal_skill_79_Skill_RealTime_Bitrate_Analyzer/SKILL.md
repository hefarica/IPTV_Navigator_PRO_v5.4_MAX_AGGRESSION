---
name: Skill_RealTime_Bitrate_Analyzer
description: Identificador perimetral de densidad de píxeles reales contra ancho de banda en vivo. Extrae agresivamente la métrica BANDWIDTH del manifiesto HLS.
category: M3U8 Intel
---
# 1. Teoría de Compresión y Anomalía
Proveedores HLS colocan `BANDWIDTH=5000000` (5 Mbps) pero en realidad sus chunks (`.ts`) de 10 segundos pesan 2.5MB (solo rinden 2 Mbps). Cuando el reproductor recibe el archivo, descarga rápido, pero la densidad de píxeles es miserable. Es mentira estadística para aparentar calidad alta.

# 2. Directiva de Ejecución (Código / Inyección)
Se hace una extrapolación viva usando "Content-Length" contra el tiempo `#EXTINF` real de los segmentos.

```php
// Forense de Veracidad M3U8 (PHP Resolver):
$chunk_duration_sec = 2.0; 
$content_length_bytes = 1500000; // Extraido del HEAD curl
$real_bps = ($content_length_bytes * 8) / $chunk_duration_sec; 
// Si $real_bps << $declarado_bps -> Proveedor es un mentiroso!
```

# 3. Flanco de Orquestación
Incorruptibilidad del Sistema APE. Si el proveedor miente, el orquestador lo penaliza o simplemente sobre-pasa el M3U8 ajustado a la verdad métrica, evitando que el reproductor OTT Navigator se sobre-sature y falle cálculos ABR. La "Pelota de béisbol y el pasto verde" no dependen de metadatos falsos; se apoyan en bits matemáticos absolutos del origen.
