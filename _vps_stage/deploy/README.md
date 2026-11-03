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

## `/sync` (t35) — activación bajo Environment `production`

El manifiesto incluye 6 artefactos de `/sync` (PHP, snippets nginx, zona, Lua staged y migración SQL).
El deploy:

1. crea `/etc/ara-x` (0750 root:www-data) y `/var/lib/ara-x` (0750 www-data:www-data);
2. instala los ficheros y aplica `_vps_stage/sql/ara_sync.sql` con `sqlite3` (si falta, el PHP crea las tablas);
3. `sync-provision.sh` escribe `/etc/ara-x/sync-keys.json` y `artifact.json` desde el Environment
   (`ARA_SYNC_KEY`, `ARA_SYNC_DEVICE_IDS`, `ARA_SYNC_ARTIFACT_SHA256`, …). **Si falta el secreto o
   la identidad R1, el deploy ABORTA y hace rollback** (no se habilita `/sync` a medias);
4. `sync-include.sh` añade `include snippets/prisma-ara-sync.conf;` al snippet público vivo (idempotente,
   backup dentro del stamp) y revalida `nginx -t`;
5. `verify.sh` ejecuta `sync-smoke.js`: 401 sin HMAC, 401 key desconocida, 413, 429, 200 HMAC (si hay
   `ARA_SYNC_VERIFY_KEY`), `/ara/events` con token (si `ARA_VERIFY_TOKEN`) y `/lists/` 200.

Rollback: `rollback.sh <stamp> --yes` restaura los destinos del manifiesto **y** el snippet público
respaldado por `sync-include.sh`. Las claves/DB pueden quedar; no afectan playback.

**Nunca** se ejecuta el mapa legacy `tools/cicd` (R3-R1) ni se tocan `/lists/`, segmentos o playback.
Producción sigue **NO-GO** hasta cerrar R6-F01/V3-F-01 y V3-F-09 y aprobar el Environment.

## Requisitos previos en el VPS (ya verificados en el inventario)

- `luac`/`lua` 5.1.5 presentes (nginx 1.24.0 con módulo Lua) · `php` 8.3.6 + `php8.3-fpm`
- `nginx -t` limpio como línea base · cert Let's Encrypt válido hasta 2026-12-12
- Disco: 14 G libres (la lista viva ocupa ~160-220 MB)
