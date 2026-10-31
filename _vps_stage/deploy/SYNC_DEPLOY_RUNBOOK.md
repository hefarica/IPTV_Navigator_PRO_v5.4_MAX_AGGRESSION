# `/sync` deploy runbook y evidencia (t35)

**Estado:** integración en el deploy **lista**; **deploy de producción NO ejecutado**.
Motivo: (a) el Environment `production` exige aprobación de reviewer; (b) el workflow
`deploy-vps.yml` **no mapea** `ARA_SYNC_KEY`/`ARA_SYNC_ARTIFACT_*` a variables de entorno
(está fuera del write-scope de t35); (c) R6/V3 F-01 y V3-F-09 siguen abiertos (NO-GO global).
No se tocó playback, `/lists/` ni la lista viva.

## 1 · Evidencia de dry-run (read-only)

| Dato | Valor |
|---|---|
| GitHub Actions run | **41168703925** · `success` · head `ddb7911` |
| URL | https://github.com/hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/actions/runs/41168703925 |
| Jobs | inventory ✓ · preflight+dry-run ✓ · validate ✓ · verify (dry-run) ✓ |
| Dry-run local stamp | `20261031T042237Z` |
| Snapshot de hashes remotos | `_vps_stage/deploy/snapshots/dryrun_remote_hashes_20261031T042237Z.txt` |
| Cambios reales en el VPS | **0** |

Salida local del dry-run (read-only): 10 ficheros existentes `IGUAL` + **6 NUEVO**
(`ara-sync.php`, `prisma-ara-sync.conf`, `00-ara-sync-zone.conf`, `ara_x_sync.lua`,
`ara-sync-lua.conf`, `schema.sql`); 0 fallos.

Hashes de los 6 artefactos nuevos (sha256, prefijo):

| Artefacto | sha256 |
|---|---|
| `ara-x/vps/php/ara-sync.php` | `4604d42de78f6896c023d2b3a3cc469107c392b40ebaac3899e64a91e21d6217` |
| `ara-x/vps/nginx/ara-sync.conf` | `a59869f9e055be36651e822ef6b238fb428d2578768aa3cbdf7b93e192ea3ad6` |
| `ara-x/vps/nginx/ara-sync-zone.conf` | `12c207c70d9a3f91296dc249fcdfe4bf644c29e8fd1f77e798e5bf854741cf99` |
| `ara-x/vps/lua/ara_x_sync.lua` | `e7aec1152bd73cb2a72aff8ebc3ea85175a9a738d4442529fc1568579477401f` |
| `ara-x/vps/nginx/ara-sync-lua.conf` | `3a424dc065bab8ff932dd40d95392dba9787d7fab65bc0bc916f318d1d03443d` |
| `_vps_stage/sql/ara_sync.sql` | `20e99a1f2cdb285dc4d9da34c9510a01cbaae3d07400cd67c3b39c9f587448dd` |

Validación (`validate.sh` en el run y local): **OK=11 · FALLOS=0**; `php -l` PASS para
`ara-sync.php`; `luac -p` PASS para `ara_x_sync.lua`; `.conf` diferidos a `nginx -t` del deploy.
`nginx -t` **línea base** del VPS: PASS (`preflight.sh`); `nginx -t` de la config **nueva**
solo ocurre en el deploy real (no ejecutado).

## 2 · Qué hace el deploy (cuando se autorice)

1. `inventory` → `preflight` → `dry-run` → `validate` (sin escrituras).
2. `deploy.sh --apply --yes` (Environment `production` aprobado):
   - backup de destinos en `/var/backups/ape-deploy/<stamp>/`;
   - instala los 6 artefactos (PHP 644 www-data; snippets 644 root; SQL 600 www-data);
   - crea `/etc/ara-x` (0750 root:www-data) y `/var/lib/ara-x` (0750 www-data);
   - `sync-provision.sh` aplica `ara_sync.sql` y exige `ARA_SYNC_KEY` + `ARA_SYNC_ARTIFACT_SHA256`
     (si faltan: **aborta y rollback**);
   - `sync-include.sh` añade `include snippets/prisma-ara-sync.conf;` al snippet público vivo
     (backup en el stamp; idempotente) y revalida `nginx -t`;
   - `nginx -t` + `reload`; `verify.sh` ejecuta `sync-smoke.js` (401 sin HMAC, 401 key
     desconocida, 413, 429, 200 HMAC si `ARA_SYNC_VERIFY_KEY`, `/ara/events` con token si
     `ARA_VERIFY_TOKEN`, `/lists/` 200).
3. Cualquier fallo ⇒ `rollback.sh <stamp> --yes` restaura destinos + snippet público.

## 3 · Secretos y device

Mapa que falta en el workflow (fuera de scope t35; requiere cambio autorizado):

```yaml
env:
  ARA_SYNC_KEY: ${{ secrets.ARA_SYNC_KEY }}
  ARA_SYNC_KEY_ID: ${{ vars.ARA_SYNC_KEY_ID }}
  ARA_SYNC_DEVICE_IDS: ${{ vars.ARA_SYNC_DEVICE_IDS }}
  ARA_SYNC_ARTIFACT_SHA256: ${{ vars.ARA_SYNC_ARTIFACT_SHA256 }}
  ARA_SYNC_GENERATION_ID: ${{ vars.ARA_SYNC_GENERATION_ID }}
  ARA_SYNC_LIST_VERSION: ${{ vars.ARA_SYNC_LIST_VERSION }}
  ARA_SYNC_VERIFY_KEY: ${{ secrets.ARA_SYNC_KEY }}   # solo job verify
  ARA_VERIFY_TOKEN: ${{ secrets.ARA_VERIFY_TOKEN }}  # opcional /ara/events
```

Provisión:

```bash
gh secret set ARA_SYNC_KEY --env production --body "$(openssl rand -hex 32)"
gh variable set ARA_SYNC_KEY_ID --env production --body "k1"
gh variable set ARA_SYNC_DEVICE_IDS --env production --body "onn4k-001"
# artifact sha/gen/list desde /var/lib/ara-x/artifact.json de la generación servida
```

- VPS: `/etc/ara-x/sync-keys.json` **0600 www-data** (nunca en repo/webroot);
  `/etc/ara-x/artifact.json` 0600; DB `/var/lib/ara-x/sync.db` 0600.
- Device: secreto crudo de 64 hex en **`/sdcard/ape/sync.key`** (o data dir privado);
  `key_id` en SharedPreferences (`sync_key_id`, default `k1`). Nunca en el APK.

## 4 · Rollback

```bash
bash _vps_stage/deploy/rollback.sh <stamp> --yes
```

Restaura todos los destinos del manifiesto desde `/var/backups/ape-deploy/<stamp>/` y el
snippet público respaldado por `sync-include.sh`; recarga nginx. No afecta `/lists/` ni playback.

## 5 · Bloqueos para ejecutar el deploy

1. **Workflow fuera de scope**: falta el mapeo de secretos/variables del punto 3; sin él
   `sync-provision.sh` aborta (correcto: no se inventa clave).
2. **Aprobación del Environment** `production` (owner/reviewer).
3. **NO-GO global**: R6-F01 (CORS/path de la lista) y V3-F-09 (R3-R4/R5/R6/R7) siguen abiertos;
   este runbook no los declara cerrados. El deploy de `/sync` no modifica playback/listas, pero
   el owner debe aceptar la ventana.

**No hay stamp de backup de producción** porque el deploy no se ejecutó; el dry-run no escribe.
