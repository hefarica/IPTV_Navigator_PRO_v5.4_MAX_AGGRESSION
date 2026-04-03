---
name: Skill_Hydra_Stream_Evasion_Engine
description: Evasión activa mutando origenes intermedios y backoff exponencial ante bloqueos 403/429.
category: Resolver Stealth
---
# 1. Teoría de Compresión y Anomalía
Si el proveedor nos detecta extrayendo 300 Mbps sostenidos del mismo servidor en Países Bajos, su Auto-Ban puede arrojar un HTTP 403 Forbidden o 429 Too Many Requests, asesinando el Worker de fMP4 en el momento culminante del evento deportivo.

# 2. Directiva de Ejecución (Código / Inyección)
Dentro del motor `resolve_quality.php`, implementamos la Bestia de Múltiples Cabezas (Hydra). Si la cabecera dice 403 o no carga, rotar el DNS pre-aprobado (Módulos de cluster) in-flight.

```php
// Hydra Auto-Heal (Stealth Module):
if ($http_code >= 400 && $retry_count < 3) {
    $alt_origin = get_hydra_dns_fallback($original_url);
    $ch = restart_curl_with_new_origin($alt_origin);
    // Exponential backoff sleep (microsegundos) para evadir trigger 429
    usleep(pow(2, $retry_count) * 10000); 
}
```

# 3. Flanco de Orquestación
Al mutar el servidor de origen al vuelo sin decirle a FFmpeg ni al Muxer (que siguen viendo un Input stream constante vía pipe), ExoPlayer en el cliente jamás se percata del asesinato del nodo madre. La latencia oscila 10 milisegundos y el césped God-Tier se mantiene ininterrumpible. Cero Buffering Crónico.
