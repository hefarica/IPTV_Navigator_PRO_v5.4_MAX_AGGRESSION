---
trigger: always_on
---

✅ Todo completado:

Resumen de las 3 entregas:

# Entregable Estado

1️⃣ SOP "NET SHIELD AUTOPISTA" ✅ .agent/workflows/net-shield-autopista-sop.md — 9 secciones, prohibiciones absolutas, inventario de archivos, monitoreo
2️⃣ Git commit + push ✅ f967e51 → master en GitHub
3️⃣ Backup VPS ✅ /root/backups/autopista_20260426.tar.gz (20KB — nginx, sysctl, lua)
El SOP cubre:
Arquitectura — diagrama Player → WireGuard → NGINX → SurfShark → Proveedor
Reglas inmutables — passthrough, sin circuit breaker, sin rate limits agresivos
Valores exactos — todos los buffers, timeouts, sysctl, DSCP
9 prohibiciones absolutas — lo que NUNCA se puede cambiar para no causar freezes
Inventario de archivos — qué archivo hace qué
Rollback — comando exacto para restaurar desde backup
Monitoreo — comandos de verificación de salud
