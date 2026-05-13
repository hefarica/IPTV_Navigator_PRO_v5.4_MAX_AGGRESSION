---
name: Skill_Polymorphic_Freeze_Detector
description: Detector L7 Dual-signal para freezes de CDN, gatillando reconexión inmediata desde PHP escondiendo la falla al Player.
category: Stability Master
---
# 1. Teoría de Compresión y Anomalía
Proveedores mediocres envían un bloque HTTP 200 OK perpetuo, pero simplemente dejan de enviar bits de Media/Video (0 mbps throughput). FFmpeg o ExoPlayer se queda "Colgado" para siempre porque TCP asume latencia alta, no desconexión. Te quedas con la pantalla congelada del balón de fútbol en el aire infinitamente.

# 2. Directiva de Ejecución (Código / Inyección)
Se entrena al L7 Resolver PHP para medir el pulso real de bytes que entran. Si el delta baja a cero, el polimorfismo se enciende, corta el socket, y revive al canal desde la Hydra.

```php
// Inyección Polimórfica (PHP cURL Anti-Freeze):
curl_setopt($ch, CURLOPT_PROGRESSFUNCTION, function($clientp, $dltotal, $dlnow, $ultotal, $ulnow) use (&$last_bytes, &$last_time) {
    if ($dlnow == $last_bytes && (microtime(true) - $last_time) > 2.5) {
        // Frostbite Warning! Han pasado 2.5s sin bytes. Asesinar el pipe.
        return 1; // Abort curl execution
    }
    $last_bytes = $dlnow; $last_time = microtime(true);
    return 0;
});
curl_setopt($ch, CURLOPT_NOPROGRESS, false);
```

# 3. Flanco de Orquestación
Erupción Polimórfica. Antes de que el Network Caching God-Tier (80s) del Shield TV se agote, PHP ya detectó el congelamiento y relanzó el socket HTTP en menos de 2.5 segundos. FFmpeg (o el Proxy) se reabastece y la Shield TV del cliente JAMÁS sintió la oscilación de la falla del origen. La promesa visual del UHD 4:4:4 ininterrumpido se cumple de manera absoluta.
