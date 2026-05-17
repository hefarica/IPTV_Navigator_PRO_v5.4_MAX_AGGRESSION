---
name: watchdog-status
description: Reporte de health de todos los watchdogs / health checks / canales críticos
---

# /watchdog-status

## Resumen
Reporte de health de todos los watchdogs / health checks / canales críticos

## Delegate to
**linux-vps-sre-engineer**

## Inputs esperados
Optional: include_logs (default: false)

## Outputs esperados
Status JSON: per-service, per-port, per-endpoint, per-channel, alerts pendientes

## Validaciones obligatorias
systemctl status, ss -tln, curl healthchecks, /status.json

## Production safety
Read-only. No restart de servicios sin confirmación.

## Flujo de ejecución
1. **Cortex init** (`iptv-cortex-init-mandatory`) — 5-layer scan antes de cualquier acción.
2. **Identificar specialist responsable** (`linux-vps-sre-engineer`).
3. **Cargar skills relevantes** desde `.agents/skills/` filtrando por specialist en `skills_index.json`.
4. **Ejecutar validaciones** read-only primero.
5. **Reportar hallazgos** con formato:
   ```
   ID:
   Archivo:
   Línea(s):
   Severidad: CRITICAL|HIGH|MEDIUM|LOW
   Capa:
   Síntoma:
   Causa raíz:
   Impacto:
   Corrección:
   Prueba:
   Estado:
   ```
6. **Solicitar confirmación** del usuario antes de aplicar cualquier cambio.
7. **Aplicar cambio** con `iptv-pre-edit-audit` previo por archivo.
8. **Validar post-cambio** (sintaxis + smoke E2E).
9. **Cross-review** por al menos 1 specialist adyacente.
10. **Actualizar audit-report.md** en skills tocadas.
11. **Commit** con mensaje convencional si todas las validaciones pasan.

## Doctrina aplicada
- **No mocks, no datos falsos, no hardcode innecesario**.
- **No romper lo existente** (`iptv-omega-no-delete`).
- **LAB SSOT** (`iptv-lab-ssot-no-clamp`).
- **VPS untouchable sin checklist** (`iptv-vps-touch-nothing`).
- **Legal/Ético**: solo streams/credenciales/servidores AUTORIZADOS. NO evasión ilegal, NO DRM bypass, NO robo señal.

## Cuándo usar este comando
Cuando el usuario explícitamente lo invoque (`/watchdog-status`) o cuando un task descripción matche el summary de este comando.

## Cuándo NO usar
- Sin `iptv-cortex-init-mandatory` ejecutado primero.
- Cuando el usuario diga "planeamos" o "diseñamos" (= solo planificar, NO ejecutar).
- Cuando el scope toque producción sin checklist `iptv-vps-touch-nothing` aplicado.
