# Scoring Engine — USA Universal Adapter vNext

## Escala

- 0-69: RECHAZAR — no apto para produccion
- 70-85: ACEPTAR CON RIESGO — gaps documentados, requiere monitoreo
- 86-100: PRODUCCION — listo para despliegue

## Dimensiones (5)

### Estabilidad (25%)

| Score | Condicion |
|---|---|
| 100 | 0 bugs RFC 8216, 0 crashes en audit |
| 80 | 1 bug RFC 8216 |
| 60 | 2 bugs RFC 8216 |
| 0 | 5+ bugs RFC 8216 |

### Latencia (15%)

| Score | Condicion |
|---|---|
| 100 | EXTHTTP < 3KB + 3 variantes ABR en todos los canales |
| 80 | EXTHTTP < 3KB + ABR mixto |
| 50 | EXTHTTP 3-8KB |
| 0 | EXTHTTP > 8KB |

### Calidad (20%)

| Score | Condicion |
|---|---|
| 100 | 883 lineas/canal + 5 funciones USA presentes |
| 60 | 500+ lineas/canal |
| 30 | 100+ lineas/canal |
| 10 | < 100 lineas/canal |

### Coherencia (20%)

| Score | Condicion |
|---|---|
| 100 | URL limpia (0 params APE), protocolo sagrado, extension correcta |
| 50 | 1-5 canales con params APE |
| 0 | Mas de 10 canales con params APE en URL |

### Completitud (20%)

| Score | Condicion |
|---|---|
| 100 | OVERFLOW emitido en 100% canales, 5 tipos servidor detectados |
| 50 | OVERFLOW parcial |
| 0 | OVERFLOW ausente |

## Formula

```
score = (estabilidad * 0.25) + (latencia * 0.15) + (calidad * 0.20) + (coherencia * 0.20) + (completitud * 0.20)
```

## Reglas de Corte

- Si estabilidad = 0 → score maximo = 60 (nunca PRODUCCION)
- Si coherencia = 0 → score maximo = 65 (nunca PRODUCCION)
- Bugs RFC 8216 post-parche → regresion fatal, score = 0
