---
name: Playeo Simulado — Prueba de Estrés Industrial (Stress Test)
description: Protocolo de verificación end-to-end que simula el comportamiento real de un reproductor (OTT Navigator, VLC, ExoPlayer) contra el VPS resolver, validando que el 100% del DNA de perfil UI llega intacto al stream sin hardcoding ni degradación.
---

# 🔥 Playeo Simulado — Prueba de Estrés Industrial

**Versión:** 1.0.0
**Clasificación:** Verificación / God-Tier
**Dependencias:** `resolve_quality.php`, `channels_map.json`, `profile-bridge-v9.js`

---

## 0. Objetivo

Simular el ciclo completo de un reproductor IPTV solicitando un stream al VPS, verificando que:

1. El resolver (`resolve_quality.php`) responde **HTTP 200** con `Content-Type: application/x-mpegURL`
2. Los headers de control God-Mode están presentes (`X-ExoPlayer-Bind`, `X-Player-Enslavement`, `TCP-Fast-Open`)
3. Las directivas `#EXTVLCOPT` del body reflejan el DNA del perfil UI (no valores hardcodeados)
4. La conexión es estable y no hay timeouts bajo carga

---

## 1. Pre-Requisitos

- `channels_map.json` deployado en `/var/www/html/` del VPS
- `resolve_quality.php` activo y respondiendo
- Nginx configurado con CORS y timeouts correctos
- Conocer al menos 1 `stream_id` válido del mapa (ej: `ch=3`)

---

## 2. Prueba A: Resolución Básica (Single Channel)

### Comando (PowerShell desde PC del usuario)

```powershell
curl.exe -sv "https://iptv-ape.duckdns.org/resolve_quality.php?ch=3&sid=3&origin=line.tivi-ott.net&p=P3&mode=adaptive&format=cmaf&list=16.1.0-CLEAN-URL-ARCHITECTURE" 2>&1 | Out-String
```

### Criterios de Éxito

| Criterio | Valor Esperado | Fallo Si |
|----------|---------------|----------|
| HTTP Status | `200 OK` | Cualquier otro |
| Content-Type | `application/x-mpegURL` | `text/html` o vacío |
| `X-ExoPlayer-Bind` | `strict` | Ausente |
| `X-Player-Enslavement` | `god-mode` | Ausente |
| `TCP-Fast-Open` | `intent=1` | Ausente |
| `Access-Control-Allow-Origin` | `*` | Ausente |
| Body contiene `#EXTVLCOPT` | Sí (100+ líneas) | 0 líneas |

---

## 3. Prueba B: Verificación DNA (100% Herencia de Perfil)

### Comando

```powershell
curl.exe -s "https://iptv-ape.duckdns.org/resolve_quality.php?ch=3&sid=3&origin=line.tivi-ott.net&p=P3&mode=adaptive&format=cmaf&list=16.1.0-CLEAN-URL-ARCHITECTURE" | Select-String "EXTVLCOPT"
```

### Campos Obligatorios en Output

Estos campos **DEBEN** aparecer con valores dinámicos (no hardcodeados):

```
#EXTVLCOPT:network-caching=XXXXX        ← Del perfil UI (no siempre 4000)
#EXTVLCOPT:live-caching=XXXXX           ← Del perfil UI
#EXTVLCOPT:file-caching=XXXXX           ← Del perfil UI
#EXTVLCOPT:codec=hevc,h265,av1,h264     ← Jerarquía HEVC Suprema
#EXTVLCOPT:deinterlace-mode=bwdif|adaptive ← Fusión BWDIF
#EXTVLCOPT:avcodec-hw=any               ← Aceleración HW
#EXTVLCOPT:adaptive-logic=highest       ← Resolución Infinita
#EXTVLCOPT:sharpen-sigma=X.XX           ← Quantum Pixel Overdrive
#EXTVLCOPT:http-proxy=                  ← Anti-407 (vacío = Ghost Protocol)
```

### Criterio de Fallo

Si **cualquiera** de estos campos muestra un valor estático que NO corresponde al perfil seleccionado en la UI, el test es **FAIL**.

---

## 4. Prueba C: Estrés Multi-Canal (Batch)

### Comando (5 canales simultáneos)

```powershell
$channels = @(3, 6, 15, 100, 500)
$channels | ForEach-Object -Parallel {
    $ch = $_
    $result = curl.exe -s -o NUL -w "%{http_code} %{time_total}s" "https://iptv-ape.duckdns.org/resolve_quality.php?ch=$ch&sid=$ch&origin=line.tivi-ott.net&p=P3&mode=adaptive&format=cmaf"
    Write-Output "CH=$ch -> $result"
} -ThrottleLimit 5
```

### Criterios de Éxito

| Métrica | Umbral OK | Fallo Si |
|---------|----------|----------|
| HTTP Status (todos) | `200` | Cualquier `5xx` o `0` |
| Tiempo por canal | < 3.0s | > 5.0s |
| Canales exitosos | 100% (5/5) | < 80% |

---

## 5. Prueba D: Validación de Headers HTTP God-Mode

### Comando

```powershell
curl.exe -sI "https://iptv-ape.duckdns.org/resolve_quality.php?ch=3&sid=3&origin=line.tivi-ott.net&p=P3&mode=adaptive&format=cmaf"
```

### Headers Obligatorios

```
HTTP/1.1 200 OK
Content-Type: application/x-mpegURL; charset=utf-8
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
TCP-Fast-Open: intent=1
X-ExoPlayer-Bind: strict
X-Player-Enslavement: god-mode
Cache-Control: no-store, no-cache, must-revalidate, max-age=0
```

---

## 6. Prueba E: Verificación CORS (Preflight)

### Comando

```powershell
curl.exe -sv -X OPTIONS "https://iptv-ape.duckdns.org/resolve_quality.php" -H "Origin: http://127.0.0.1:5500" 2>&1 | Select-String "Access-Control"
```

### Criterio

- Debe devolver `Access-Control-Allow-Origin: *`
- Status `200` o `204`

---

## 7. Árbol de Decisión de Fallos

```
¿HTTP 200?
├─ NO → ¿502/504? → Nginx/PHP-FPM caído
│       ¿404?     → Ruta mal configurada o channels_map.json ausente
│       ¿413?     → client_max_body_size insuficiente
│
├─ SÍ, pero body vacío → PHP fatal error (check error.log)
│
├─ SÍ, body tiene #EXTVLCOPT pero valores hardcodeados
│  → DNA Merge no funciona en resolve_quality.php
│  → Verificar que channels_map.json tiene dna_profile_overrides
│
└─ SÍ, todo correcto → ✅ PASS
```

---

## 8. Formato de Reporte Obligatorio

Al finalizar TODAS las pruebas, el agente debe emitir:

```
🔍 REPORTE DE PLAYEO SIMULADO (STRESS TEST)

📌 Estado general: ✅ / ⚠️ / ❌

Prueba A (Resolución Básica):     ✅/❌
Prueba B (DNA 100% Herencia):     ✅/❌
Prueba C (Estrés Multi-Canal):    ✅/❌
Prueba D (Headers God-Mode):      ✅/❌
Prueba E (CORS Preflight):        ✅/❌

📉 Observaciones:
[Detalles específicos si hay fallos]

⏱️ Tiempos de respuesta:
- Canal 3:   X.XXs
- Canal 6:   X.XXs
- Canal 15:  X.XXs
- Promedio:  X.XXs
```

---

## 9. Reglas No-Negociables

1. **NUNCA** declarar éxito sin ejecutar al menos Prueba A y Prueba B
2. **NUNCA** confiar en "funciona en el browser" sin verificar con `curl`
3. Si DNA Merge falla, **NO** parchear PHP — revisar primero el `channels_map.json`
4. Los tiempos de respuesta > 5s indican problema de infraestructura, no de código
5. Cada ejecución debe dejar evidencia (output exacto de curl)
