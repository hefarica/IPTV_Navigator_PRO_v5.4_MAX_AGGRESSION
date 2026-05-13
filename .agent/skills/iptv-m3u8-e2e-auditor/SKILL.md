---
name: iptv-m3u8-e2e-auditor
description: Auditoría técnica end-to-end de playlists IPTV/M3U8 locales, remotas o empaquetadas en ZIP. Usar cuando el usuario pida auditar una lista, medir salud HTTP real, correlacionar hosts, grupos, perfiles y emitir un veredicto con evidencias y archivos CSV/JSON/Markdown.
---

# IPTV M3U8 E2E Auditor

## Overview

Usar esta skill para convertir una playlist IPTV o un ZIP que contenga playlists en una **auditoría reproducible** con estructura, sondeo HTTP, correlación y diagnóstico final. La skill está diseñada para responder preguntas como: cuántos canales hay realmente, cuántas URLs únicas existen, qué hosts dominan, qué códigos HTTP aparecen, qué porcentaje termina en HLS funcional y qué veredicto operativo corresponde.

## Workflow Decision Tree

Determinar primero el tipo de entrada.

| Caso | Acción inicial |
|---|---|
| Archivo `.m3u8` local | Copiarlo a un directorio de trabajo y analizarlo directamente |
| Archivo `.zip` | Extraerlo, localizar la playlist principal y analizarla |
| URL remota `.m3u8` | Descargarla o procesarla en streaming si la descarga completa falla |

Si la solicitud del usuario es una **auditoría completa**, seguir todo el flujo. Si la solicitud es **diagnosticar solo estados concretos** como `404`, `407`, `503` o `509`, ejecutar primero la parte estructural mínima y luego hacer un muestreo focalizado sobre URLs visibles.

## Standard Workflow

Seguir estas fases en orden.

1. **Preparar un directorio de trabajo** para la auditoría actual.
2. **Adquirir la playlist** desde archivo local, ZIP o URL remota.
3. **Ejecutar el análisis estructural** con `scripts/analyze_playlist.py`.
4. **Ejecutar el sondeo HTTP** sobre las URLs únicas con `scripts/probe_urls.py`.
5. **Correlacionar estructura y salud** con `scripts/correlate_health.py`.
6. **Redactar el informe final** con cifras exactas, veredicto, causas raíz y recomendaciones.
7. **Entregar** el informe y los artefactos relevantes como adjuntos.

## Commands

Usar estos comandos como patrón base.

```bash
python .agent/skills/iptv-m3u8-e2e-auditor/scripts/analyze_playlist.py <playlist.m3u8> <output_dir>
python .agent/skills/iptv-m3u8-e2e-auditor/scripts/probe_urls.py <output_dir>/unique_urls.csv <output_dir> [max_workers]
python .agent/skills/iptv-m3u8-e2e-auditor/scripts/correlate_health.py <output_dir>/channel_structural_summary.csv <output_dir>/probe_results.csv <output_dir>
```

## Expected Outputs

La auditoría debe producir, como mínimo, estos artefactos.

| Archivo | Propósito |
|---|---|
| `analysis_summary_pretty.json` | Resumen estructural legible |
| `analysis_channels.json` | Mapa detallado por canal |
| `unique_urls.csv` | Inventario de URLs únicas a sondear |
| `channel_structural_summary.csv` | Resumen estructural por canal |
| `probe_results.csv` | Resultado HTTP por URL |
| `probe_summary.json` | Conteos agregados del sondeo |
| `channel_health_summary.csv` | Resumen operativo por canal |
| `host_health_summary.csv` | Concentración por host |
| `group_health_summary.csv` | Distribución por grupo |
| `correlation_summary.json` | Síntesis de correlación |

## Interpretation Rules

Interpretar los resultados con reglas simples y estables.

| Señal | Interpretación recomendada |
|---|---|
| `200` + MIME HLS o cuerpo con `#EXTM3U` | Recurso funcional |
| `302 -> 200` + HLS | Transición funcional |
| `503` | Degradación del origen o inventario no saludable |
| `407` | Restricción o suscripción, no mezclar automáticamente con caída técnica |
| `404` | Ruta inexistente o desincronizada |
| `509` | Límite de ancho de banda o política del host/origen |
| timeout / error de conexión | Fallo de red, host inaccesible o bloqueo |

No asumir que un `302` es intrínsecamente incorrecto; distinguir entre **transición funcional** y **salto que no termina en HLS útil**.

## Reporting Format

El informe final debe usar esta estructura por defecto, adaptándola solo si el caso lo exige.

```markdown
# Auditoría E2E de [nombre de la playlist]

## Resumen ejecutivo
[Un párrafo con veredicto, escala del inventario y hallazgo dominante]

## Métricas estructurales
[Canales, URLs únicas, hosts principales, grupos, perfiles]

## Salud HTTP y de reproducción
[Conteos y porcentajes por clasificación]

## Causas raíz probables
[Diagnóstico con evidencia]

## Recomendaciones
[Acciones concretas, priorizadas]
```

## Practical Guidance

Mantener la auditoría **rigurosa pero reusable**. Si el usuario pide la misma metodología sobre varias listas, conservar el mismo esquema de salida. Si la lista es muy grande, priorizar concurrencia moderada en el sondeo HTTP para terminar en tiempo razonable. Si una descarga remota queda incompleta, documentarlo explícitamente y cambiar a análisis parcial o por streaming en lugar de fingir completitud.

Cuando el usuario ya ha fijado criterios específicos —por ejemplo, enfocarse solo en `503`, separar `407`, o estudiar la interpretabilidad en players—, conservar ese criterio en el informe y no reabrir debates cerrados por el usuario.

## Resources

### scripts/analyze_playlist.py

Analiza la playlist y genera el inventario estructural reutilizable.

### scripts/probe_urls.py

Sondea las URLs únicas, sigue redirecciones y clasifica el estado final.

### scripts/correlate_health.py

Relaciona resultados estructurales y HTTP para resumir la salud operativa.
