# Scoring Engine — Pipeline Architect vNext

## Escala

- 0-69: RECHAZAR
- 70-85: ACEPTAR CON RIESGO
- 86-100: PRODUCCION

## Dimensiones (5)

### Estabilidad (25%)

| Score | Condicion |
|---|---|
| 100 | 0 bugs criticos, semaforo FrontCDN activo |
| 85 | 0 bugs criticos, sin semaforo |
| 55 | 1-2 bugs criticos |
| 0 | 3+ bugs criticos |

### Latencia (15%)

| Score | Condicion |
|---|---|
| 100 | EXTHTTP < 3KB, URL limpia, sin params APE |
| 70 | EXTHTTP < 3KB, 1-3 params APE residuales |
| 30 | EXTHTTP 3-8KB |
| 0 | EXTHTTP > 8KB o URL masivamente contaminada |

### Calidad (20%)

| Score | Condicion |
|---|---|
| 100 | 6/6 capas activas, JWT real, OVERFLOW emitido |
| 70 | 4-5 capas activas |
| 40 | 3 capas activas |
| 0 | < 3 capas |

### Coherencia (20%)

| Score | Condicion |
|---|---|
| 100 | VERSION unica, 0 codigo muerto critico |
| 50 | 2+ versiones o funciones huerfanas activas |
| 0 | 3+ versiones con semantica contradictoria |

### Completitud (20%)

| Score | Condicion |
|---|---|
| 100 | 8/8 pasos del Plan Maestro aplicados |
| 70 | 5-7 pasos aplicados |
| 40 | 3-4 pasos aplicados |
| 0 | < 3 pasos aplicados |

## Formula

```
score = (estabilidad * 0.25) + (latencia * 0.15) + (calidad * 0.20) + (coherencia * 0.20) + (completitud * 0.20)
```

## Reglas de Corte

- Bugs RFC 8216 post-parche (B1) → score = 0 (regresion fatal)
- Syntax error en node -c → score maximo = 30
- generateChannelEntry ausente → score = 0 (archivo incorrecto)
