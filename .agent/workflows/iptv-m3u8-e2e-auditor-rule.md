name: "iptv-m3u8-e2e-auditor-rule"
description: "REGLA ABSOLUTA: Flujo de trabajo y mandato E2E para cualquier petición de auditoría o validación de Playlists M3U8"

# 🛡️ Regla Absoluta de Auditoría (IPTV M3U8 E2E Auditor)

Esta regla es mandatoria cada vez que el usuario solicite "auditar", "ver la salud", o "revisar los 503/404" de cualquier lista M3U8, archivo ZIP de listas, o endpoint remoto en este entorno.

## La Directiva:
**Nunca se debe intentar validar canales M3U8 a ojo o con un simple curl parcial.** Toda auditoría DEBE invocar obligatoriamente la skill `iptv-m3u8-e2e-auditor`.

## Pasos del Workflow Mandatorio:

1. **Obtención y Extracción:** Identificar el archivo `.m3u8`, `.zip` local o la URL remota.
2. **Análisis Estructural (Python):** Usar el script `analyze_playlist.py` alojado en `.agent/skills/iptv-m3u8-e2e-auditor/scripts/` para aislar canales y métricas estructurales.
3. **Sondeo HTTP (Probe):** Correr `probe_urls.py` sobre los URLs únicos exportados para adquirir la confirmación de status (200 HLS, 302, 503, 404, etc).
4. **Correlación de Salud:** Usar `correlate_health.py` para cruzar los resultados de red vs estructura JSON.
5. **Reporte (Artefacto MD):** Generar los archivos `analysis_summary_pretty.json`, un reporte de salud de host en CSV, y entregar un veredicto definitivo basado en la matriz de decisión de la skill.
6. **Veredicto:** Jamás inferir un status 302 como "malo" salvo que termine en un 404/503. Un 302 que lleva a HLS es una "Transición Funcional".

*Ejecuta este pipeline siempre que se evalúe un catálogo y documenta con artefactos sin abreviar los resultados críticos.*
