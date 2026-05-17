# basic-auth-handler-bcrypt

**Specialist:** Security/Auth/Headers Engineer (Security)
**Kind:** satellite
Parent anchor: `secure-header-profiler`

## Propósito
Use when implementing HTTP Basic Auth with bcrypt-hashed passwords (htpasswd -B) for admin endpoints.

## Estructura de archivos
- `SKILL.md` — spec completa (cuándo / cuándo no / inputs / outputs / riesgos / rollback)
- `README.md` — este archivo
- `references.md` — fuentes externas estudiadas (RFC, repos, docs)
- `commands.md` — comandos shell / Python / Lua útiles
- `checklist.md` — pre/during/post-cambio checklist
- `tests.md` — fixtures de prueba + casos de éxito/fracaso
- `install.lock.json` — pin de versión + timestamp de instalación
- `audit-report.md` — log de uso + drift detection
- `examples/` — código de ejemplo
- `scripts/` — herramientas auxiliares
- `fixtures/` — datos de prueba anonimizados

## Cómo invocar
Cuando un task matche la descripción de esta skill, el agente debe:
1. Leer `SKILL.md` completo.
2. Ejecutar checklist de pre-condiciones.
3. Aplicar la skill al scope mínimo.
4. Validar (sintaxis + smoke E2E).
5. Registrar en `audit-report.md`.

## Doctrina
Esta skill opera bajo:
- **No mocks, no datos falsos, no hardcode innecesario.**
- **No romper lo existente** — `iptv-omega-no-delete`.
- **LAB SSOT** — `iptv-lab-ssot-no-clamp`.
- **VPS untouchable** — `iptv-vps-touch-nothing`.
- **Team Agent review** — cualquier cambio que afecte calidad visual / continuidad / compatibilidad / seguridad / observabilidad debe ser revisado por los 10 specialists antes de declarar éxito.
