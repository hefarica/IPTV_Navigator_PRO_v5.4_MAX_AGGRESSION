---
name: "Metacognition: Parallel Hypothesis — Investigar 3 Frentes Simultáneos"
description: "Ante un problema complejo, lanzar 3 investigaciones en paralelo en vez de una secuencial. La respuesta suele estar en la intersección de hallazgos, no en una sola línea."
---

# Parallel Hypothesis

## La regla

**Ante un problema con múltiples causas posibles, lanzar 3 agentes de investigación en paralelo, cada uno con un ángulo diferente.**

No investigar A → si falla → investigar B → si falla → investigar C (secuencial = lento).
Investigar A + B + C simultáneamente → cruzar hallazgos → diagnóstico en 1/3 del tiempo.

## Caso de estudio: Diagnóstico 403 (2026-04-09)

### 3 agentes lanzados simultáneamente:

```
Agente 1: "Find EXTHTTP builder & credentials"
  → Encontró: build_exthttp() retorna string, JWT es stub, UA con MAYÚSCULAS

Agente 2: "Trace source URL credential flow"
  → Encontró: credenciales van en URL path, NUNCA en Authorization header
  → Encontró: generateJWT68Fields() es stub "JWT_STUB"

Agente 3: "Find UA Phantom Engine indexing"
  → Encontró: tierMap usa camelCase, llamadas usan MAYÚSCULAS
  → Encontró: _epochPermutation shuffle invalida los rangos
```

### Cruce de hallazgos:
- Agente 1 + 2 → JWT stub causa Bearer vacío → pero curl prueba que no es la causa del 403
- Agente 3 → UAs desalineados → visual pero no funcional para el 403
- **Ningún agente encontró la causa real** → motivó el test empírico con curl → `max_connections=1`

**Sin paralelismo**: habría investigado solo el EXTHTTP, encontrado el Bearer vacío, lo habría fixeado, regenerado la lista, y seguiría viendo 403. Horas perdidas.

**Con paralelismo**: en 2 minutos tuve el mapa completo del sistema, supe que los 6 bugs eran reales pero NO causaban el 403, y curl reveló la causa real.

## Cuándo usar paralelismo

| Situación | Agentes | Foco de cada uno |
|-----------|---------|-------------------|
| Error HTTP en producción | 3 | (1) Código generador (2) Flujo de credenciales (3) Server real con curl |
| Feature no funciona | 2 | (1) Frontend implementation (2) Backend endpoint + deploy status |
| Performance lenta | 3 | (1) Frontend bottlenecks (2) Network/CORS (3) Backend processing |
| Bug intermitente | 2 | (1) Código que genera el valor (2) Condiciones externas (rate limit, expiry) |

## Cuándo NO usar paralelismo

- Bug trivial con causa obvia (typo, syntax error)
- Archivo específico que el usuario señaló
- Cambio de 1 línea

## Formato del prompt para cada agente

```
Agente N: "[Ángulo específico]"

Contexto: [Qué estamos investigando y por qué]
Busca: [Términos, archivos, patrones específicos]
NO busques: [Lo que los otros agentes ya cubren]
Reporta: [Formato y límite de palabras]
NO propongas fixes: [Solo diagnóstico]
```

La última línea es crítica: los agentes deben DIAGNOSTICAR, no ARREGLAR. El fix lo decide el operador principal tras cruzar los 3 reportes.

## Mandamiento

> **Un agente ve un ángulo. Tres agentes ven el sistema.**
> La causa raíz está donde se cruzan los hallazgos, no donde un solo agente buscó.
