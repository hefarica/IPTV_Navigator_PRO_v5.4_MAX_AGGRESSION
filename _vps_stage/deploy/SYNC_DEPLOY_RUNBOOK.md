# `/sync` deploy runbook y evidencia (t35 · run 41235692889)

**Estado:** `/sync` **desplegado en producción** por GitHub Actions con aprobación del Environment
`production`, backup y verify OK; **endpoint vivo** y smoke 7/7. No se tocó playback, `/lists/` ni el
catálogo global.

## 1 · Runs

| Dato | Valor |
|---|---|
| Deploy (éxito) | **41235692889** · `success` · head `f64f976` · https://github.com/hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/actions/runs/41235692889 |
| Jobs | inventory ✓ · preflight+dry-run ✓ · validate ✓ · **deploy ✓** · **verify ✓** · rollback skipped |
| Stamp backup | **`20261031T194640Z`** · `/var/backups/ape-deploy/20261031T194640Z/` (16 ficheros) |
| Dry-run previo | 41168879054 · `success` |
| Run intermedio fallido | 41176772993 (verify 409 por `seq=2` fijo en smoke) → corregido en `f64f976`; no se oculta |

## 2 · Verificación del deploy (logs del run)

```
paridad completa: 16/16 ficheros repo == remoto
SYNC SMOKE · /sync + /ara/events + /lists/
ok   401 sin HMAC: HTTP 401
ok   401 key desconocida: HTTP 401
ok   413 body >16 KB: HTTP 413
ok   200 HMAC válido: HTTP 200
ok   200 firma de respuesta: HTTP 200
ok   429 rate-limit: HTTP 429
ok   /lists/APE_LISTA_4K.m3u8: HTTP 200
RESUMEN SYNC SMOKE: 7/7 OK · 0 FAIL
SMOKE OK (todos 200 con #EXTM3U)
```

`/ara/events` con token: el workflow no recibe `SYNC_TOKEN`, así que el smoke lo marca SKIP; **verificado
manualmente** `GET /ara/events?device_id=onn4k-001` + `Authorization: Bearer <ARA_TOKEN>` → **200**
(`text/event-stream`; token leído del pool PHP-FPM, nunca impreso). Sin token → **401**.

`/sync` GET → **405**; `POST /sync` sin HMAC → **401**; con HMAC → **200**; body >16 KB → **413**;
7.ª petición → **429**. `/lists/APE_LISTA_4K.m3u8` → **200**.

## 3 · Artefactos y hashes (repo == remoto)

| Artefacto | sha256 |
|---|---|
| `ara-x/vps/php/ara-sync.php` | `52952096f1fa4523cbf58aa268dc96004b79fb6af1081495e0475301959ce3cd` |
| `ara-x/vps/nginx/ara-sync.conf` | `a59869f9e055be36651e822ef6b238fb428d2578768aa3cbdf7b93e192ea3ad6` |
| `ara-x/vps/nginx/ara-sync-zone.conf` | `12c207c70d9a3f91296dc249fcdfe4bf644c29e8fd1f77e798e5bf854741cf99` |
| `ara-x/vps/lua/ara_x_sync.lua` | `e7aec1152bd73cb2a72aff8ebc3ea85175a9a738d4442529fc1568579477401f` |
| `ara-x/vps/nginx/ara-sync-lua.conf` | `3a424dc065bab8ff932dd40d95392dba9787d7fab65bc0bc916f318d1d03443d` |
| `_vps_stage/sql/ara_sync.sql` | `20e99a1f2cdb285dc4d9da34c9510a01cbaae3d07400cd67c3b39c9f587448dd` |

`nginx -t` PASS (deploy y manual); `php -l` PASS; `luac -p` PASS. Dry-run post-deploy:
**0 ficheros cambiarían**. `/lists` sha256 before/after: `144659b4…` (4K) y `9f302b8b…` (CDN)
sin cambios.

## 4 · Key / token / device

- Secretos del Environment: `ARA_SYNC_KEY` (64 hex, `***` en logs), `ARA_SYNC_KEY_ID=k1`,
  `ARA_SYNC_DEVICE_IDS=*`, `ARA_SYNC_ARTIFACT_SHA256=c8b5039e…`, `ARA_SYNC_GENERATION_ID=ara-x.gen1:…`,
  `ARA_SYNC_LIST_VERSION`/`LAB_EXPORTED_AT=2026-10-30T22:07:37Z`.
- VPS: `/etc/ara-x/sync-keys.json` **0600 www-data** (k1, secret 64, `device_ids=["*"]`),
  `/var/lib/ara-x/artifact.json` **0600 www-data**; DB `/var/lib/ara-x/sync.db` 0600.
- Device: secreto crudo de 64 hex en **`/sdcard/ape/sync.key`** (o data dir privado);
  `key_id` en SharedPreferences (`sync_key_id`, default `k1`). Nunca en APK/build.
- Limitación: `device_ids=["*"]` es **permisivo** (cualquier device con la clave); para R6 conviene
  restringirlo a `onn4k-001`/`firestick-cali` en una ventana posterior.

## 5 · Rollback

```bash
bash _vps_stage/deploy/rollback.sh 20261031T194640Z --yes
```

Restaura los 16 destinos respaldados y el snippet público (el include de `/sync`), recarga nginx.
El run fue success: no se ejecutó rollback; el backup y el comando quedan listos.

## 6 · Estado de producción

`/sync` está **vivo** (no 404), PHP/snippets/zona/Lua/SQL instalados, key/artifact 0600, smoke y
verificación manual OK. R6-F01 (CORS/path de la lista) y V3-F-09 siguen **NO-GO** de owner: este
deploy no los corrige; sólo añade `/sync` sin tocar playback ni `/lists/`.
