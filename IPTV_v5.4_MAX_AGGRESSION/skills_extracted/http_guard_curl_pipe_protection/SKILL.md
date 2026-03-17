---
name: "HTTP Guard — Interceptor de Cabeceras cURL para Protección de Pipe FFmpeg"
description: "Patrón de diseño que implementa CURLOPT_HEADERFUNCTION como portero HTTP, impidiendo que respuestas no-200 (HTML de error, redirects, 403) se inyecten al pipe de FFmpeg"
---

# HTTP Guard — cURL Header Interceptor

## Problema que Resuelve
Cuando `cmaf_worker.php` descarga un stream MPEG-TS via cURL usando `CURLOPT_WRITEFUNCTION` para escribir directamente en el `pipe:0` de FFmpeg, las respuestas HTTP no-200 del proveedor (403 Forbidden, 401 Auth Required, 302 Redirect con body HTML) se inyectan como bytes crudos al pipe. FFmpeg recibe HTML/texto en lugar de MPEG-TS y aborta con `Invalid data found when processing input`.

## Arquitectura del Guard
```
[cURL recibe cabecera HTTP]
        ↓
[CURLOPT_HEADERFUNCTION lee el status code]
        ↓
  ¿Código == 200?
   ├── SÍ → $httpOk = true → CURLOPT_WRITEFUNCTION escribe al pipe ✅
   └── NO → return 0 (aborta cURL) → NADA llega al pipe ❌
              ↓
        [Hydra Mutation Engine toma el control]
              ↓
        [Intenta con otro origen/UA del pool]
```

## Implementación PHP
```php
// Variable compartida entre callbacks
$httpOk = false;

// GUARD: Interceptor de cabeceras HTTP
curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($curl, $headerLine) use (&$httpOk) {
    // Detectar línea de status HTTP
    if (preg_match('/^HTTP\/[\d\.]+ (\d{3})/', $headerLine, $m)) {
        $code = (int)$m[1];
        if ($code >= 200 && $code < 300) {
            $httpOk = true;
        } else {
            // Log del bloqueo para diagnóstico futuro
            guardianLog([
                'event'     => 'http_guard_blocked',
                'http_code' => $code,
                'reason'    => 'non_200_response_blocked_from_pipe'
            ]);
            $httpOk = false;
            return 0; // Abortar cURL inmediatamente
        }
    }
    return strlen($headerLine); // Continuar procesando headers
});

// WRITEFUNCTION: Solo escribe si el Guard aprobó
curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($curl, $chunk) use ($pipeOutputStream, &$httpOk) {
    if (!$httpOk) {
        return 0; // Abortar: no escribir basura al pipe
    }
    @fwrite($pipeOutputStream, $chunk);
    @fflush($pipeOutputStream);
    return strlen($chunk);
});
```

## Flujo con Hydra Evasion Engine
Cuando el Guard bloquea una respuesta:
1. `CURLOPT_HEADERFUNCTION` retorna 0 → cURL aborta con `CURLE_WRITE_ERROR`
2. El bucle de Hydra detecta el abort y el `$httpCode` no-200
3. Hydra muta el User-Agent, rota el origen, y reintenta
4. Máximo 5 reintentos con backoff exponencial (0ms, 200ms, 400ms, 800ms, 1600ms)

## Errores que Previene
| Sin Guard | Con Guard |
|---|---|
| FFmpeg recibe HTML de un 403 → `Invalid data found` | cURL aborta antes de escribir → Hydra reintenta con otro UA |
| FFmpeg recibe body de redirect 302 → crash | Guard detecta 302, retorna 0, Hydra rota origen |
| FFmpeg recibe página de error 500 del proveedor → crash | Guard bloquea, log registra el código exacto |

## Archivos
- `/var/www/html/cmaf_worker.php` — Implementación del Guard en `HydraStreamEvader::fetchStreamAtomic()`
