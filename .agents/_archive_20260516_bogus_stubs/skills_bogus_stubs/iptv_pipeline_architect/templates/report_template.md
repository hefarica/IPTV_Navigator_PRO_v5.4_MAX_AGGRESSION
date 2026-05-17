# Reporte de Ejecucion — Pipeline Architect vNext

## Metadata

- **Fecha:** {{FECHA}}
- **Modo:** {{MODO}} (diagnostico / parche / full)
- **Generador:** {{GENERADOR}}
- **Lista:** {{LISTA}}
- **Version objetivo:** {{VERSION}}

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

## Estado de las 6 Capas

| Capa | Estado | Detalle |
|---|---|---|
| A — EXTHTTP funcional | {{CAPA_A}} | {{DETALLE_A}} |
| B — Cookie | {{CAPA_B}} | {{DETALLE_B}} |
| C — JWT real | {{CAPA_C}} | {{DETALLE_C}} |
| D — KODIPROP | {{CAPA_D}} | {{DETALLE_D}} |
| E — OVERFLOW base64 | {{CAPA_E}} | {{DETALLE_E}} |
| F — APE tags | {{CAPA_F}} | {{DETALLE_F}} |

## Bugs Encontrados

| ID | Sev | Descripcion | Estado |
|---|---|---|---|
| {{BUG_ID}} | {{BUG_SEV}} | {{BUG_DESC}} | {{BUG_ESTADO}} |

## Parches Aplicados

| Parche | Delta | Estado |
|---|---|---|
| {{PARCHE_NAME}} | {{DELTA}} chars | {{ESTADO}} |

## Parches Manuales Pendientes

- {{MANUAL_1}}
- {{MANUAL_2}}

## Validaciones

| Check | Resultado |
|---|---|
| Syntax (node -c) | {{CHECK_SYNTAX}} |
| Estructural (generateChannelEntry) | {{CHECK_STRUCT}} |
| Logica (RFC 8216 compliant) | {{CHECK_LOGIC}} |

## Decisiones

- **PRODUCCION:** Empaquetar ZIP y desplegar
- **RIESGO:** Gaps documentados. Verificar en OTT Navigator.
- **RECHAZAR:** Corregir criticos y re-ejecutar.
