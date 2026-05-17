---
name: "Metacognition: Cascade Awareness — Un Fix Puede Crear Un Bug Nuevo"
description: "Cada fix tiene efectos cascada. Un merge de 200 headers puede causar 400 Bad Request. Un shuffle fix puede desalinear UAs. SIEMPRE predecir el efecto secundario antes de aplicar."
---

# Cascade Awareness

## La regla

**Antes de aplicar un fix, preguntarse: "¿Qué rompe este fix?"**

Cada cambio en un sistema de 7000+ líneas tiene efectos cascada. Los bugs más peligrosos son los que introduces al arreglar otro bug.

## Catálogo de cascadas documentadas

### Cascada 1: Merge de headers → 400 Bad Request

```
Fix:     Parsear build_exthttp() string → JSON.parse → merge con _httpPayload
Efecto:  EXTHTTP pasó de ~80 headers a ~249 headers (9.7KB)
Cascada: NGINX/players con buffer <8KB rechazan → HTTP 400 Bad Request
Fix²:    Cap MAX_EXTHTTP_BYTES = 8192 con recorte inteligente
```

**Predicción que debí hacer:** "Si fusiono 200 headers extra, ¿el payload cabe en los buffers de los players?"

### Cascada 2: Casing fix → Tier fix necesario

```
Fix:     Cambiar get('ANDROID') → get('Android')
Efecto:  Ahora matchea tierMap['Android'] = [111, 120]
Cascada: _epochPermutation shuffle invalida los rangos → UA sigue desalineado
Fix²:    Leer de BANK original (sin shuffle) para strategy-specific
```

**Predicción que debí hacer:** "Si el tierMap matchea ahora, ¿los rangos [111,120] contienen realmente UAs Android?"

### Cascada 3: Slot Reaper → executePendingGenerator async

```
Fix:     Añadir await preflightReapConnectionSlots() en executePendingGenerator()
Efecto:  executePendingGenerator() ahora es async
Cascada: Callers que no usen await podrían ejecutar la generación sin esperar el reap
Fix²:    Verificar que TODOS los callers de executePendingGenerator() manejen la Promise
```

### Cascada 4: gzip -9 → gzip -1

```
Fix:     Cambiar gzip -9 a gzip -1 para velocidad
Efecto:  Compresión 6x más rápida
Cascada: Archivo .gz es ~5-10% más grande → más storage en VPS, más transfer
Risk:    Bajo (espacio no es issue), pero predecible
```

## Protocolo anti-cascada

Antes de aplicar CUALQUIER fix:

```
1. PREDECIR: ¿Qué valor cambia? ¿Quién consume ese valor? ¿Qué pasa si el valor es diferente?

2. GREP DEPENDIENTES: 
   grep -n "variable_afectada" *.js
   → encontrar TODOS los consumidores del valor que estoy cambiando

3. MEDIR ANTES/DESPUÉS:
   - Tamaño del output (EXTHTTP bytes, file size)
   - Tipo del retorno (string vs object)
   - Conteo (headers count, lines count)
   
4. CAP DEFENSIVO: Si el fix AUMENTA algo (headers, bytes, connections),
   añadir un cap que limite el crecimiento:
   - MAX_EXTHTTP_BYTES = 8192
   - MAX_PARALLEL = 4
   - MAX_RETRIES = 3
```

## Señales de alarma de cascada inminente

| Señal | Riesgo |
|-------|--------|
| "Merge/spread de un objeto externo" | El objeto externo puede tener 200+ keys |
| "Cambiar tipo de retorno" | Todos los consumidores asumen el tipo viejo |
| "Hacer función async" | Callers síncronos no esperan el resultado |
| "Añadir parámetros a URL" | Puede causar parameter pollution o URL >2048 chars |
| "Activar feature desactivada" | Fue desactivada por una razón que no conozco |

## Mandamiento

> **Todo fix es un vector de bugs nuevos. La calidad de un ingeniero se mide por los bugs que PREDICE, no por los que arregla.**
> Un fix sin análisis de cascada es una apuesta. Un fix con análisis es ingeniería.
