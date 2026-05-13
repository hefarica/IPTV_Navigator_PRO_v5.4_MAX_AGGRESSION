---
name: "Metacognition: Audit Before Build — Saber Qué Existe Antes De Crear"
description: "Antes de implementar cualquier feature, auditar qué ya está implementado, qué es stub, y qué es solo metadata. Construir sobre lo existente es 10x más rápido que inventar."
---

# Audit Before Build

## La regla

**Antes de escribir código nuevo, responder estas 3 preguntas:**

1. **¿Ya existe algo que hace esto?** (grep el codebase)
2. **¿Funciona realmente o es un stub?** (leer la implementación, no solo el nombre)
3. **¿El backend soporta lo que el frontend asume?** (verificar endpoints)

## Caso de estudio: Features IPTV (2026-04-10)

### Auditoría real de 10 features:
```
IMPLEMENTADO (3/10):  CMAF/FFmpeg, Phantom Hydra UA
STUB (0/10):          Ninguno era stub parcial
TAG-ONLY (7/10):      LCEVC, AI SR, AI FI, HDR, DRM, ISP Throttle, HttpAnabolic
```

**Sin auditoría**: habría intentado "conectar" LCEVC al pipeline, buscando un SDK que no existe, perdiendo horas.

**Con auditoría**: en 5 minutos supe que 7/10 son metadata decorativa. Esfuerzo redirigido a lo que SÍ tiene impacto.

### Auditoría del Turbo Upload:
```
upload_chunk.php    → EXISTE en repo, NO en VPS
finalize_upload.php → EXISTE en repo, NO en VPS
resumable-uploader-v2.js → EXISTE pero NO activado
CORS en NGINX      → YA configurado para chunk headers
chunks/ directory   → NO existe en VPS
```

**Sin auditoría**: habría escrito un nuevo endpoint de chunks desde cero.

**Con auditoría**: descubrí que `upload_chunk.php` ya existía perfecto, solo faltaba deployarlo.

## Protocolo de auditoría

### Para una nueva feature:

```bash
# 1. ¿Existe código relacionado?
grep -r "nombre_feature\|NombreFeature\|NOMBRE_FEATURE" --include="*.js" --include="*.php" .

# 2. ¿Es funcional o decorativo?
# Leer la IMPLEMENTACIÓN, no el nombre del archivo
# Un archivo llamado "ai-super-resolution.js" puede contener solo: tags.push(`#EXT-X-APE-AI-SR:...`)

# 3. ¿El pipeline está completo?
# Frontend → ¿endpoint existe? → ¿backend procesa? → ¿resultado llega al usuario?

# 4. ¿Qué falta para que funcione?
# A veces es solo: deploy + permisos + CORS = funcional
```

### Para un bug report:

```bash
# 1. ¿Dónde se genera el valor problemático?
grep -n "valor_problematico" archivo.js

# 2. ¿La función que lo genera es real o stub?
# generateJWT68Fields() retornaba "JWT_STUB" — string literal, no JWT

# 3. ¿El consumidor espera el tipo correcto?
# jwt.token → undefined porque jwt es string, no objeto

# 4. ¿Hay más consumidores del mismo valor?
grep -n "jwt\." archivo.js  # → encontrar TODOS los usos
```

## Errores de auditoría comunes

| Error | Consecuencia | Fix |
|-------|-------------|-----|
| Asumir que un archivo con buen nombre funciona | Invertir horas en integrar algo que es stub | Leer el código, no el nombre |
| Asumir que "existe en repo" = "existe en prod" | Feature que falla en el usuario | `ssh ls` antes de declarar listo |
| Asumir que `build_exthttp()` retorna objeto | 200 headers descartados silenciosamente | `typeof` + console.log del retorno real |
| Asumir que `UAPhantomEngine.getUA()` existe | UAs aleatorios desalineados | Leer la API expuesta: `return { init, get, ... }` |

## Mandamiento

> **Auditar es más rápido que construir. Construir sobre lo que ya existe es más rápido que inventar.**
> 5 minutos de grep ahorran 5 horas de código nuevo.
