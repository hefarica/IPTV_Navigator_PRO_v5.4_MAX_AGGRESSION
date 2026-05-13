---
name: "Metacognition: Root Cause Not Symptom — El Error Visible Raramente Es La Causa"
description: "El error HTTP que el usuario ve (403, 400, 401) casi nunca tiene la causa que parece. Trazar hacia atrás desde el síntoma hasta el origen real antes de actuar."
---

# Root Cause Not Symptom

## La regla

**El error visible es el FINAL de una cadena. La causa está al INICIO.**

```
Causa real (invisible)          Síntoma (visible)
─────────────────────          ─────────────────
max_connections=1        →     HTTP 403/406
Cuenta expired           →     HTTP 401
EXTHTTP >8KB             →     HTTP 400
Endpoint no deployado    →     "Failed to fetch"
gzip -9 lento            →     "Subida tarda 15 min"
```

## Técnica: Backward Chain Tracing

Ante cualquier error, NO buscar "qué causa un 403". Buscar "qué ve el servidor cuando el player pide".

```
1. ¿Qué URL pide el player?
   → Extraer de la lista M3U8 (grep '^http')

2. ¿Qué responde el servidor a ESA URL?
   → curl directo (paso empírico)

3. ¿Bajo qué condiciones el servidor rechaza?
   → player_api.php (estado de cuenta)
   → Burst test (rate limit)
   → Header analysis (tamaño, formato)

4. ¿Cuál de esas condiciones está activa AHORA?
   → Comparar respuesta actual vs anterior
```

## Casos documentados de este proyecto

| El usuario dijo | Parecía ser | Era REALMENTE |
|-----------------|-------------|---------------|
| "Error 403 por credenciales mal" | Bug en EXTHTTP headers | `max_connections=1` saturado (trial) |
| "Error 400 Bad Request" | Headers malformados | EXTHTTP >8KB (249 campos × ~40 bytes avg) |
| "Error 401 en todos los canales" | Credenciales incorrectas | Cuenta trial EXPIRADA (24h) |
| "Subida Turbo falló chunk 3" | Bug en gateway-turbo-upload.js | `upload_chunk.php` no deployado en VPS |
| "UAs desalineados" | Bug de case-sensitivity en keys | Bug DOBLE: case + shuffle que invalida tierMap |

## Anti-pattern: Fix shotgun

```
❌ INCORRECTO (fix shotgun):
   1. Ver error 403
   2. "Probablemente es el Bearer vacío" → fixear
   3. "Probablemente es el parameter pollution" → fixear
   4. "Probablemente son los headers spoofing" → fixear
   5. Regenerar lista → sigue el 403
   6. "¿¿¿???"

✅ CORRECTO (backward chain):
   1. Ver error 403
   2. curl al server → 200 (el server acepta la URL)
   3. curl en burst → 406 (rate limit)
   4. player_api.php → max_connections=1, active_cons=2
   5. CAUSA: rate limit, no bugs del código
   6. Fixear los bugs TAMBIÉN (son reales) pero sabiendo que NO causan el 403
```

## Mandamiento

> **Arreglar bugs reales es correcto. Pero atribuirles un síntoma que no causan es peligroso.**
> Cuando el fix "correcto" no resuelve el síntoma, la confianza del usuario cae.
> Diagnosticar primero, fixear después, verificar siempre.
