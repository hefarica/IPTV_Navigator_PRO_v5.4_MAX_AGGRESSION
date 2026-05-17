---
name: "Hydra Stream Evasion Engine — Mutación Estocástica Anti-Bloqueo"
description: "Motor de evasión de bloqueos de streams IPTV con mutación de User-Agent, rotación de orígenes, backoff exponencial, y detección de códigos HTTP hostiles (403/407/451/429/5xx)"
---

# Hydra Stream Evasion Engine

## Propósito
Cuando un proveedor IPTV (Xtream Codes) bloquea la conexión del worker con HTTP 403, 407, 451, 429 o 5xx, el Hydra Engine muta automáticamente el perfil de conexión y reintenta hasta 5 veces con backoff exponencial.

## Clase: `HydraStreamEvader`

### Constructor
```php
$evader = new HydraStreamEvader(
    $originUrl,          // URL del stream MPEG-TS
    $originPool,         // Array de hosts backup para rotación
    $manifestPath        // Path del manifest (para suicide switch)
);
```

### Pool de User-Agents
```php
private $userAgents = [
    'VLC/3.0.16 LibVLC/3.0.16',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    'Dalvik/2.1.0 (Linux; U; Android 11)',
    'Lavf/58.76.100',
    'OTT Navigator/1.6.9.4 (Build 40936) AppleWebKit/606'
];
```

### Pool de Orígenes
```php
$originPool = [
    'candycloud8k.biz',
    'line.tivi-ott.net',
    'pro.123sat.net:2082'
];
```

## Algoritmo de Mutación por Intento

| Intento | User-Agent | Evasión Extra |
|---|---|---|
| 0 | VLC/3.0.16 | Ninguna (baseline) |
| 1 | Chrome/120 | Proxy-Auth + HTTP/1.1 downgrade |
| 2 | Dalvik/Android | Proxy-Auth + SSL bypass |
| 3 | Lavf/FFmpeg | Proxy-Auth + rotación de origen |
| 4 | OTT Navigator | Proxy-Auth + rotación de origen |

## Diagnóstico de Errores HTTP

```php
switch ($httpCode) {
    case 403: case 401:
        return $this->rotateOrigin($currentUrl);     // Cambiar servidor
    case 405:
        return preg_replace('/\.ts$/', '.m3u8', $url); // Cambiar formato
    case 407:
        return $currentUrl; // Inyectar Proxy-Auth en próximo intento
    case 500: case 502: case 503: case 504:
        return $this->rotateOrigin($currentUrl);     // Cambiar servidor
}
```

## Backoff Exponencial
```php
// 0ms → 200ms → 400ms → 800ms → 1600ms
usleep(pow(2, $attempt) * 100000);
```

## Suicide Switch (Anti-Zombie)
El worker verifica cada iteración si el `manifest.mpd` fue leído en los últimos 45 segundos (via `filemtime`). Si nadie lo leyó, el worker se auto-destruye:

```php
if (file_exists($this->manifestPath)) {
    $idleTime = time() - filemtime($this->manifestPath);
    if ($idleTime > 45) {
        return false; // Suicide Triggered
    }
}
```

## Anti-Cut Zero-Drop
Bucle infinito en el programa principal que relanza la conexión si se cae naturalmente (no por error):
```php
while (true) {
    $alive = $evader->fetchStreamAtomic($pipes[0], $listId, $codecTag);
    if (!$alive) break;
    usleep(500000); // 500ms antes de reconexión
}
```

## Telemetría F1-Grade (UDP Fire-and-Forget)
Envía métricas de velocidad, micro-freezes y health score via UDP al puerto 8125:
```php
$payload = json_encode([
    'speed_kbps'     => round($speedKbps, 2),
    'micro_freezes'  => $sensorState['micro_freezes'],
    'health_score'   => round($sensorState['health_score'], 1),
    'strangle_ratio' => round($sensorState['strangle_ratio'], 2),
]);
@socket_sendto($udpSocket, $payload, strlen($payload), 0, '127.0.0.1', 8125);
```

## Archivo
- `/var/www/html/cmaf_worker.php` — Implementación completa de la clase `HydraStreamEvader`
