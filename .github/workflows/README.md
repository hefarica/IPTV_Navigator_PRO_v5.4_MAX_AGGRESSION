# `.github/workflows/` — CI/CD del VPS

**Ningún despliegue al VPS se hace a mano.** Todo pasa por `deploy-vps.yml`.

## Por qué existe esto

La lista 4K se subió **a mano** y está viva. Eso significa: nadie revisó el VPS antes, no hubo backup y no hubo vuelta atrás posible si algo salía mal. Este workflow sustituye esa práctica.

## Disparo

Es **manual** (`workflow_dispatch`). No se dispara con `push`: un despliegue no debe ocurrir por accidente al subir un commit.

| Input | Valores | Default |
|---|---|---|
| `mode` | `dry-run` \| `deploy` | **`dry-run`** |
| `list_file` | ruta local del `.m3u8` (opcional) | vacío = no publica lista |

- **`dry-run`** (default): inventario, preflight, diff y validación. **No escribe nada en el VPS.**
- **`deploy`**: además aplica el cambio, pero **exige la aprobación del Environment `production`** (required reviewers configurado en GitHub).

## Jobs

| # | Job | Qué hace | ¿Escribe en el VPS? |
|---|---|---|---|
| 1 | `inventory` | Inventario del VPS + snapshot | **NO** |
| 2 | `dry-run` | Preflight + diff exacto repo ↔ VPS | **NO** |
| 3 | `validate` | `luac -p` / `php -l` / `nginx -t` | **NO** |
| 4 | `deploy` | Deploy atómico con backup — **aprobación requerida** | **SÍ** |
| 5 | `verify` | Smoke (solo GET) | **NO** |
| 6 | `publish-list` | `.gz` + marcador 8 B, backup + `mv` atómico + rollback | **SÍ** (solo `/var/www/lists/`) |
| 7 | `rollback` | Restaura el backup si `deploy` o `verify` fallan | **SÍ** (restaura) |

Cada job llama a los scripts de `_vps_stage/deploy/` con sus argumentos reales:
`inventory.sh` · `preflight.sh` · `dry-run.sh` · `validate.sh` · `deploy.sh --apply --yes` · `verify.sh` · `rollback.sh <stamp> --yes`.

## Publicación de lista (job 6)

1. `gzip -9` local del `.m3u8`.
2. **Marcador de 8 bytes** = los 8 primeros caracteres del `sha256` del `.gz`. Sirve para identificar la versión publicada **sin descargar el fichero entero**.
3. Subida a `/tmp` del VPS (nunca directo al destino).
4. **Backup** de `lista.m3u8.gz` y `lista.marker` a `/var/backups/ape-lists/<stamp>/`.
5. Copia a un temporal **dentro del mismo directorio** de destino y `mv -f` (renombrado atómico: quien lea el fichero ve o la versión vieja o la nueva, nunca una a medias).
6. **Smoke**: `zcat | head -c 7` debe empezar por `#EXTM3U` y el marcador debe casar con el `sha256` real.
7. Si el smoke falla, un `trap ... ERR` **restaura el backup** dentro del propio VPS.

## Secretos — NUNCA en el repo

Se configuran en **GitHub → Settings → Secrets and variables → Actions → New repository secret**. Nunca se escriben en el repositorio, ni en el workflow, ni en un `.env`, ni en un commit.

| Secreto | Qué es | Cómo obtenerlo |
|---|---|---|
| `VPS_HOST` | IP o dominio del VPS | Lo tiene el propietario |
| `VPS_USER` | Usuario SSH (p. ej. `ape`) | Usuario con permiso sobre `/opt/netshield` y `/var/www/lists` |
| `VPS_SSH_KEY` | **Clave privada** completa (incluye `-----BEGIN…` y `-----END…`) | Par dedicado para CI: `ssh-keygen -t ed25519 -f ci_deploy -N ''`. La **pública** va a `~/.ssh/authorized_keys` del VPS |
| `VPS_KNOWN_HOSTS` | Salida de `ssh-keyscan -H <host>` | **Obligatorio**: sin él el workflow falla a propósito. Evita aceptar a ciegas la huella de un host suplantado |

### Reglas de custodia

- La clave del CI debe ser **dedicada y de mínimo privilegio**, no la personal del propietario.
- **Rotarla** si se sospecha exposición: borrar la pública del `authorized_keys` del VPS y crear otro par.
- Los secretos **se enmascaran** en los logs de Actions. Aun así, **no los imprimas** con `echo`.
- El workflow borra la llave al terminar el runner (es efímero), pero **no la escribas en artefactos**.

## Environment `production`

En **GitHub → Settings → Environments → New environment → `production`**:

- **Required reviewers**: al menos el propietario. Sin esto, `deploy` no pide aprobación.
- **Deployment branches**: restringir a `main` (o a la rama que se decida) para que no se despliegue desde una rama cualquiera.
- Opcional: *Wait timer* para dar margen a cancelar.

## Qué NO hace este workflow

- **No despliega nada por sí solo**: sin aprobación, el job `deploy` queda esperando.
- **No toca los `.lua` no referenciados** por la config viva (alcance mínimo de `deploy.sh`).
- **No cambia el contrato desplegado**: el resolver sigue siendo *rebase-only*.

## Validación local antes de tocar el workflow

```bash
bash -n _vps_stage/deploy/inventory.sh _vps_stage/deploy/preflight.sh \
        _vps_stage/deploy/dry-run.sh   _vps_stage/deploy/validate.sh \
        _vps_stage/deploy/deploy.sh    _vps_stage/deploy/verify.sh \
        _vps_stage/deploy/rollback.sh  _vps_stage/deploy/lib.sh
node -e "const fs=require('fs');const y=fs.readFileSync('.github/workflows/deploy-vps.yml','utf8');if(!/workflow_dispatch/.test(y))process.exit(1);console.log('YAML OK')"
```

Ambos deben salir con **exit 0**.
