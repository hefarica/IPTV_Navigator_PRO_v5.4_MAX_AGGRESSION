# `_vps_stage/deploy/` — pipeline CI/CD con dry-run (t89)

**NO se ha desplegado nada.** Este pipeline está diseñado para que el propietario
revise el diff exacto antes de autorizar el despliegue real (tarea aparte).

## Orden obligatorio

| # | Paso | Script | Escribe en el VPS |
|---|---|---|---|
| 1 | Inventario read-only + snapshot | `inventory.sh` | **NO** |
| 2 | Comprobaciones previas | `preflight.sh` | **NO** |
| 3 | Diff exacto repo ↔ VPS | `dry-run.sh` | **NO** |
| 4 | Validación sintáctica | `validate.sh` | **NO** (usa `/dev/stdin`) |
| 5 | Deploy atómico | `deploy.sh --apply --yes` | SÍ (con backup + rollback) |
| 6 | Smoke | `verify.sh` | **NO** (solo GET) |
| 7 | Vuelta atrás | `rollback.sh <stamp> --yes` | SÍ (restaura backup) |

## Garantías

- **Dry-run sin escrituras**: usa `sha256sum` remoto y `diff` local; no sube nada.
- **Atómico**: sube a `/tmp/ape-deploy-<stamp>/`, valida allí (`luac -p`, `php -l`), hace
  `install -m` sobre el destino, y solo entonces `nginx -t` + `nginx -s reload`.
- **Rollback automático**: si `nginx -t`, el reload o `verify.sh` fallan, se restaura el
  backup de `/var/backups/ape-deploy/<stamp>/` y se recarga nginx.
- **Sin credenciales**: se usa la llave SSH existente (`~/.ssh/id_ed25519_hetzner`) y
  `VPS_HOST` por entorno. No hay contraseñas ni tokens en ningún script.
- **Alcance mínimo**: solo se despliegan los ficheros que la **config viva** referencia.
  Los `.lua` del repo no referenciados no se tocan.

## Uso

```bash
# 1) inventario (read-only) — guarda snapshot con hashes
ssh root@178.156.147.234 'bash -s' < _vps_stage/deploy/inventory.sh \
  > _vps_stage/deploy/snapshots/inventory_$(date +%Y%m%dT%H%M%S).txt

# 2..4) revisión sin tocar nada
bash _vps_stage/deploy/preflight.sh
bash _vps_stage/deploy/dry-run.sh
bash _vps_stage/deploy/validate.sh

# 5) SOLO con autorización explícita del propietario
bash _vps_stage/deploy/deploy.sh --apply --yes
```

## Requisitos previos en el VPS (ya verificados en el inventario)

- `luac`/`lua` 5.1.5 presentes (nginx 1.24.0 con módulo Lua) · `php` 8.3.6 + `php8.3-fpm`
- `nginx -t` limpio como línea base · cert Let's Encrypt válido hasta 2026-12-12
- Disco: 14 G libres (la lista viva ocupa ~160-220 MB)
