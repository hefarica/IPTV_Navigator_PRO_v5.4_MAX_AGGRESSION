# Reporte de Ejecucion — USA Universal Adapter vNext

## Metadata

- **Fecha:** {{FECHA}}
- **Modo:** {{MODO}} (auditar / integrar / diagnosticar / verificar)
- **Archivo entrada:** {{INPUT}}
- **Archivo salida:** {{OUTPUT}}
- **Version:** {{VERSION}}

## Score Final

| Dimension | Puntuacion |
|---|---|
| Estabilidad | {{ESTABILIDAD}}/100 |
| Latencia | {{LATENCIA}}/100 |
| Calidad | {{CALIDAD}}/100 |
| Coherencia | {{COHERENCIA}}/100 |
| Completitud | {{COMPLETITUD}}/100 |
| **TOTAL** | **{{SCORE}}/100** |
| **Nivel** | **{{NIVEL}}** |

## Bugs Encontrados

| ID | Severidad | Descripcion | Estado |
|---|---|---|---|
| {{BUG_ID}} | {{BUG_SEV}} | {{BUG_DESC}} | {{BUG_ESTADO}} |

## Acciones Tomadas

1. {{ACCION_1}}
2. {{ACCION_2}}
3. {{ACCION_3}}

## Verificaciones

| Check | Resultado |
|---|---|
| URL limpia (0 params APE) | {{CHECK_URL}} |
| RFC 8216 (STREAM-INF pegado) | {{CHECK_RFC}} |
| EXTHTTP < 3KB | {{CHECK_EXTHTTP}} |
| OVERFLOW presente | {{CHECK_OVERFLOW}} |
| 5 funciones USA presentes | {{CHECK_USA}} |
| Syntax check (node -c) | {{CHECK_SYNTAX}} |

## Decisiones

- **Si PRODUCCION:** Listo para empaquetar ZIP y desplegar
- **Si ACEPTAR CON RIESGO:** Gaps documentados arriba. Monitorear en OTT Navigator.
- **Si RECHAZAR:** Corregir bugs criticos y re-ejecutar skill.

## Fallbacks Activados

{{FALLBACKS}}

## Notas

{{NOTAS}}
