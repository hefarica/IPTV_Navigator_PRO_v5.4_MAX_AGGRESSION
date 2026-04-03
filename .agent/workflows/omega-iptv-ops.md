---
description: Flujo integral para auditar listas M3U8, enmascarar credenciales y diagnosticar infraestructura OMEGA.
---

# Workflow: OMEGA IPTV Operations (omega-iptv-ops)

Este workflow consolida todos los procedimientos operativos estándar para el mantenimiento del ecosistema iptv. Utilízalo en respuesta a los siguientes triggers del usuario:
- "audita esta lista" / "Post-Generation Audit"
- "proteger FALLBACK-DIRECT" / "ocultar URL de origen"
- "el canal no reproduce" / "ADN CORRUPTO"
- "cannot resolve" / "error DNS en VLC"
- "configurar DuckDNS" / "dominio dinámico para VPS"
- "generar SOP del ecosistema OMEGA"

## Paso 1: Identificación del Vector de Acción
Observa el error o la orden proporcionada por el usuario.
- Si es una nueva lista generada -> Pasa al Paso 2 (Auditoría).
- Si es un error de reproducción -> Pasa al Paso 3 (Diagnóstico).
- Si es una solicitud de infraestructura de resolución / dominio -> Pasa al Paso 4 (DuckDNS).

## Paso 2: Ejecución de Scripts de Auditoría (Skill: omega-iptv-ops)
Para auditar la integridad:
1. Ejecuta `python .agent/skills/omega-iptv-ops/scripts/audit_full_m3u8.py <ruta_de_la_lista>` para obtener la métrica del Balanced Scorecard.
2. Ejecuta `python .agent/skills/omega-iptv-ops/scripts/audit_structure_v10.py <ruta_de_la_lista>` para confirmar la ausencia de errores estructurales graves en los tags.
3. Reporta el puntaje final y las violaciones encontradas.

## Paso 3: Análisis de Errores Clínicos
Analizar los logs del reproductor:
1. Verifica si posee la cabecera `HTTP 200 OK` (Operación Normal SSOT) o si fue un `302/404` (Error de Resolver).
2. Si el error clama "cannot resolve", diagnostica como un bloqueo DNS (ejecutar check de IP o nslookup).
3. Aplica los pasos de evasión de DNS locales.

## Paso 4: Configuración e Integración DuckDNS
1. Al invocar cambios de infraestructura de dominio, consulta de inmediato `.agent/skills/omega-iptv-ops/references/duckdns_setup.md`.
2. Establecer el dominio configurado en los resolvers frontales usando el script o modificación del codebase `inject_phantom_single_url.py`.

## Paso 5: Enmascaramiento y Criptografía
1. Si el usuario pide resguardar una IP vulnerable, ejecuta el script `mask_fallback_direct.py` localizado en la Skill para ofuscar las variables mediante el protocolo OMEGA SSOT.
