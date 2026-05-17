# Tests — frame-rate-integrity-analyzer

## Fixtures
Ubicar fixtures de prueba anonimizadas en `fixtures/` (cero PII / tokens / credenciales reales).

## Casos de prueba (templates)

### Caso 1: Happy path
**Setup:** input válido coherente con el scope de la skill.
**Acción:** invocar la skill en el archivo target.
**Expected output:** cambio aplicado + validaciones OK + audit-report entry.
**Assertions:**
- exit code 0 de validadores sintaxis.
- Diff esperado vs no-esperado (no tocar líneas fuera de scope).
- Smoke E2E PASS.

### Caso 2: Edge — input inválido
**Setup:** input malformado (tag mal posicionado, header tóxico, URL inválida).
**Acción:** invocar la skill.
**Expected:** detección + warning + cero mutación + sugerencia de corrección.

### Caso 3: Edge — conflicto de scope
**Setup:** archivo objetivo está locked por otro agente en COORDINATION.md.
**Acción:** invocar la skill.
**Expected:** abort + mensaje "scope locked by AgentX" + sin mutación.

### Caso 4: Regression — cambio idempotente
**Setup:** correr la skill 2 veces seguidas sobre el mismo archivo.
**Expected:** segunda corrida es no-op (idempotencia).

## Smoke test E2E
```bash
# 1. Cortex init
# 2. Pre-edit audit
# 3. Aplicar skill
# 4. Sintaxis validación
# 5. Generar lista de prueba (si aplica)
# 6. Fetch manifest (si aplica)
# 7. Verificar 1 segment (si aplica)
# 8. Diff vs golden master fixture
```

## Cobertura
Esta skill debe tener al menos:
- 1 caso happy path
- 1 caso edge input inválido
- 1 caso regression idempotencia
- 1 smoke E2E

Cobertura actual: **stub**, expandir cuando la skill se use en producción.
