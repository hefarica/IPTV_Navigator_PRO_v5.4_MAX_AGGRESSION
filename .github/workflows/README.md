# `.github/workflows/` — CI/CD del VPS

> ## ⚠️ Las listas se publican desde la APP, no aquí.
> Este workflow despliega **código y operativa** (Lua, configs de nginx, y opcionalmente el resolver PHP). **No sube listas `.m3u8`.** Las listas se publican por las **interfaces de la APP**. El `scp` manual que se usó una vez fue un atajo y **no se modela aquí**.

**Ningún despliegue de código al VPS se hace a mano.** Todo pasa por `deploy-vps.yml`.

## Por qué existe esto

Los cambios de código se aplicaban a mano. Eso significa: nadie revisaba el VPS antes, no había backup y no había vuelta atrás posible si algo salía mal. Este workflow sustituye esa práctica **para el código**.

## Alcance real

| Sí despliega | No despliega |
|---|---|
| `/etc/nginx/lua/` — los `.lua` que cambien | listas `.m3u8` ni `.m3u8.gz` |
| configs de nginx afectadas (las que marque el dry-run) | credenciales |
| resolver PHP **si se decide** (hoy fuera) | datos del catálogo |

**Estado medido del VPS** (inventario t51/t56/t66): nginx **1.24.0 stock + módulo Lua** (no es OpenResty), **14 `.lua`** en `/etc/nginx/lua/`; de ellos **11 byte-idénticos** a `_vps_stage/lua/` y **3 difieren**: `ape_gateway.lua`, `ape_header.lua`, `ape_uri_rebase.lua`. `luac -p` 14/14 OK y `nginx -t` verde. Esos **3** son el objetivo natural del primer `deploy`.

## Disparo

**Solo manual** (`workflow_dispatch`). No hay disparo por `push`: un despliegue no debe ocurrir al subir un commit.

| Input | Valores | Default |
|---|---|---|
| `mode` | `dry-run` \| `deploy` | **`dry-run`** |

- **`dry-run`** (default): inventario, preflight, diff y validación. **No escribe nada en el VPS.** El smoke (`verify`) **también corre** en dry-run para comprobar que el edge responde.
- **`deploy`**: aplica, pero **exige la aprobación del Environment `production`**.

## Jobs

| # | Job | Qué hace | ¿Escribe en el VPS? |
|---|---|---|---|
| 1 | `inventory` | Inventario + snapshot | **NO** |
| 2 | `dry-run` | Preflight + diff exacto repo ↔ VPS | **NO** |
| 3 | `validate` | `luac -p` / `php -l` / `nginx -t` | **NO** |
| 4 | `deploy` | Deploy atómico con backup — **aprobación requerida** | **SÍ** |
| 5 | `verify` | Smoke (solo GET) — corre en dry-run y en deploy | **NO** |
| 6 | `rollback` | Restaura el backup si `deploy` o `verify` fallan | **SÍ** (restaura) |

Cada job llama a los scripts de `_vps_stage/deploy/` con su CLI real:
`inventory.sh` · `preflight.sh` · `dry-run.sh` · `validate.sh` · `deploy.sh --apply --yes` · `verify.sh` · `rollback.sh <stamp> --yes`.

**El stamp del backup viaja por `outputs:` del job `deploy`**, no por `GITHUB_ENV` — `GITHUB_ENV` **no cruza jobs**, y confiar en él haría que el rollback cayera al «backup más reciente», que puede no ser el de esta corrida.

## Naming real de las listas (para que nadie lo invente)

Este workflow **no publica listas**: se publican desde la **APP**. Pero conviene tener escrito
cómo se llaman de verdad, porque ya hubo documentación con nombres que no existen
(`lista.m3u8.gz`, `lista.marker`).

| Pieza | Nombre real | Qué es |
|---|---|---|
| Lista comprimida | `APE_LISTA_<id>.m3u8.gz` | el contenido real, gzip |
| Variante ofuscada | `APE_LISTA_<id>_SHIELDED.m3u8.gz` | mismo contenido, nombre `_SHIELDED` (el shielding es **solo de nombre**: las URLs internas son directas al proveedor) |
| Placeholder | `APE_LISTA_<id>.m3u8` | fichero de **8 bytes**; existe para que el cliente pida `.m3u8` |

nginx sirve el `.gz` cuando el cliente pide el `.m3u8` gracias a **`gzip_static always`**:
no hay redirección ni `Content-Encoding` inventado, y el placeholder nunca se sirve completo.

Medido en el VPS (t89): `APE_LISTA_1793002539897_CDN.m3u8.gz` = **160.845.954 B**
junto a `APE_LISTA_1793002539897_CDN.m3u8` = **8 B**.

## Secretos — NUNCA en el repo

En **GitHub → Settings → Secrets and variables → Actions → New repository secret**.

| Secreto | Qué es | Cómo obtenerlo |
|---|---|---|
| `VPS_HOST` | IP o dominio del VPS | Lo tiene el propietario |
| `VPS_USER` | Usuario SSH (`ape` u otro) | Debe tener permiso sobre `/etc/nginx/lua` y `/var/backups/ape-deploy` |
| `VPS_SSH_KEY` | **Clave privada** completa | Par dedicado: `ssh-keygen -t ed25519 -f ci_deploy -N ''`. La **pública** va al `authorized_keys` del VPS |
| `VPS_KNOWN_HOSTS` | Salida de `ssh-keyscan -H <host>` | **Obligatorio**: sin él el workflow falla |

**El usuario se usa siempre como `${{ secrets.VPS_USER }}@$VPS_HOST`** — nunca hardcodeado, o el secreto quedaría decorativo y contradiría su propio valor si cambia.

### Custodia

- Clave **dedicada y de mínimo privilegio**, no la personal del propietario.
- **Rotarla** ante cualquier sospecha: borrar la pública del VPS y generar otro par.
- Nunca imprimir secretos con `echo` (Actions los enmascara, pero no conviene provocarlo).

## Environment `production`

En **GitHub → Settings → Environments → New environment → `production`**:

- **Required reviewers**: al menos el propietario. Sin esto, `deploy` no pide aprobación.
- **Deployment branches**: restringir a la rama de release.

## Validación local

```bash
bash -n _vps_stage/deploy/inventory.sh _vps_stage/deploy/preflight.sh \
        _vps_stage/deploy/dry-run.sh   _vps_stage/deploy/validate.sh \
        _vps_stage/deploy/deploy.sh    _vps_stage/deploy/verify.sh \
        _vps_stage/deploy/rollback.sh  _vps_stage/deploy/lib.sh
node -e "const fs=require('fs');const y=fs.readFileSync('.github/workflows/deploy-vps.yml','utf8');if(!/workflow_dispatch/.test(y))process.exit(1);console.log('YAML OK')"
```

Ambos deben salir con **exit 0**.

## Qué NO hace

- **No publica listas.** Eso es la APP.
- **No despliega nada solo**: sin aprobación, `deploy` espera.
- **No toca los `.lua` no referenciados** por la config viva.
- **No cambia el contrato desplegado**: el resolver sigue siendo *rebase-only*.
