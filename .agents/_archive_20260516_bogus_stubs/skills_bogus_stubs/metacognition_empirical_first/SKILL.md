---
name: "Metacognition: Empirical First — Curl Before Code"
description: "NUNCA proponer fixes sin evidencia empírica del servidor real. Leer código muestra bugs teóricos; solo curl/fetch contra el server muestra la causa REAL."
---

# Empirical First — Curl Before Code

## La regla

**Antes de escribir UNA SOLA línea de fix, ejecuta curl contra el servidor real.**

No importa cuántos bugs veas en el código. No importa cuán "obvio" parezca el problema.
El código te dice qué PODRÍA fallar. Solo curl te dice qué REALMENTE falla.

## Caso de estudio: Sesión 403 (2026-04-09)

### Lo que el código mostraba (6 bugs visibles):
1. `Authorization: Bearer ` vacío
2. `${_randomIp}` placeholder literal
3. 200 headers descartados silenciosamente
4. UAs desalineados por case-sensitivity
5. Parameter pollution `ape_sid` duplicado
6. `LIST_HASH` global undefined

### Lo que curl reveló (la verdad):
```bash
# Test 1: URL con TODOS los bugs → HTTP 200
curl -sL "http://line.biskotv.live:80/live/AA04C7/F2D691/720241.m3u8?ape_sid=X&ape_nonce=Y&ape_sid=X&ape_nonce=Y" → 200

# Test 2: Bearer vacío + spoofing headers → HTTP 200
curl -sL -H "Authorization: Bearer " -H "X-Forwarded-Host: cdn.akamaized.net" → 200

# Test 3: 15 requests paralelos → HTTP 406 × 15
for i in {1..15}; do curl -sL ... &; done → 406 406 406...

# Test 4: player_api.php → max_connections=1, active_cons=2
```

**Causa real: rate limit por `max_connections=1` (trial), NO los bugs del código.**

Si hubiera arreglado los 6 bugs sin curl, el 403 SEGUIRÍA apareciendo y habría perdido horas buscando un "bug #7" que no existía.

## Protocolo obligatorio

### Ante cualquier error HTTP reportado por el usuario:

```
PASO 1: Extraer URL real del archivo M3U8 generado
PASO 2: curl -sL -o /dev/null -w "HTTP %{http_code}" <URL> (sin headers)
PASO 3: curl con los headers exactos del EXTHTTP
PASO 4: curl con headers DIFERENTES (sin spoofing, sin Bearer, etc.)
PASO 5: curl en burst (10+ paralelos) para detectar rate limiting
PASO 6: player_api.php para leer max_connections/active_cons/status

SOLO DESPUÉS de estos 6 pasos → proponer fixes en el código.
```

### Ante "funcionalidad que no funciona":

```
PASO 1: Verificar que el endpoint EXISTE en el server (curl -sI)
PASO 2: Verificar CORS (curl -X OPTIONS con Origin header)
PASO 3: Verificar que el archivo está DEPLOYADO (ssh ls -la)
PASO 4: Verificar permisos (www-data owner, 644)
```

## Trampas cognitivas que evita esta skill

| Trampa | Sin empirismo | Con empirismo |
|--------|--------------|---------------|
| "El Bearer vacío causa 403" | Arreglar JWT → sigue el 403 → confusión | curl prueba que Bearer vacío → 200. No es la causa. |
| "Los headers spoofing causan 403" | Eliminar spoofing → sigue el 403 | curl con/sin spoofing → ambos 200. No es la causa. |
| "El parameter pollution causa 403" | Eliminar duplicados → sigue el 403 | curl con params duplicados → 200. NGINX lo tolera. |
| "El upload_chunk.php funciona" | Escribir frontend → falla en prod | curl al VPS → 404. No está deployado. |

## Mandamiento

> **Nunca confundir "el código tiene un bug" con "este bug causa el error del usuario".**
> Los dos pueden ser ciertos simultáneamente sin estar relacionados.
> Solo la evidencia empírica conecta causa con efecto.
