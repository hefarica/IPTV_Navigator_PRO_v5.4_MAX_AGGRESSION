# I3 · Entrada de deploy map + matriz de errores y rollback de `/sync`

**Tarea:** `t15` (`I3`) · **Estado:** **staged, NO-GO de producción** · **Deploy ejecutado:** **NO**
**Scope escrito:** `ara-x/vps/**` + `ara-x/tests/sync.test.js` + `ara-x/scripts/sync/**`. No se tocó
`_vps_stage/**`, `IPTV_v5.4_MAX_AGGRESSION/vps/**`, `contracts/**` ni `ara-x/vps/lua/**`.

`/sync` **sigue 404 en producción**. Este documento es la entrada de deploy map y el reporte de
errores/rollout que exige la tarea; no sustituye a la ventana del owner.

---

## 1 · Artefactos que se desplegarían (staged en el repo)

| Origen (repo) | Destino (VPS) | Modo | Post-acción |
|---|---|---|---|
| `ara-x/vps/php/ara-sync.php` | `/var/www/html/prisma/api/ara-sync.php` | `644 root:root` | ninguna (PHP) |
| `ara-x/vps/nginx/ara-sync.conf` | `/etc/nginx/snippets/prisma-ara-sync.conf` | `644 root:root` | `nginx-reload` |
| `ara-x/vps/nginx/ara-sync-zone.conf` | `/etc/nginx/conf.d/00-ara-sync-zone.conf` | `644 root:root` | `nginx-reload` |
| `ara-x/vps/php/config/ara-sync-keys.example.json` | **no se despliega**: formato de referencia | — | — |

**Include del snippet (1 línea)**: dentro del server 443 vivo, en
`/etc/nginx/snippets/ape-meta-public.conf`, **después** de `include snippets/prisma-ara-enroll.conf;`
(el bloque ARA ya existente). Nunca en el server `:80` ni en el `:8088`.

**Estado fuera del webroot (`0600`, se crea en la ventana, no viaja en el repo):**

- `/etc/ara-x/sync-keys.json` — store `key_id → {secret, device_ids, created_at, retires_at}`.
- `/var/lib/ara-x/artifact.json` — `{artifact_sha256, generation_id, list_version, lab_exported_at}`
  de la generación servida (R1).
- `/var/lib/ara-x/content.json` — extracto del LAB SSOT para `content.*` (opcional; sin él se omite).
- `/var/lib/ara-x/sync.db` — `ara_sync_state`, `ara_sync_nonce`, `ara_sync_replay`.

### 1.1 Entrada para el pipeline ACTIVO (`_vps_stage/deploy/manifest.tsv`)

> No se edita aquí (`_vps_stage/**` está fuera de scope). Filas exactas a añadir por el dueño del manifiesto:

```tsv
ara-x/vps/php/ara-sync.php	/var/www/html/prisma/api/ara-sync.php	644	root:root	/sync handler (staged I3)
ara-x/vps/nginx/ara-sync.conf	/etc/nginx/snippets/prisma-ara-sync.conf	644	root:root	include en server 443 (staged I3)
ara-x/vps/nginx/ara-sync-zone.conf	/etc/nginx/conf.d/00-ara-sync-zone.conf	644	root:root	limit_req solo /sync (staged I3)
```

Y en `snippets/ape-meta-public.conf`, una línea: `include snippets/prisma-ara-sync.conf;`.
El bloque incluye además la fila de reconciliación de `ape-meta-public.conf` (drift R3-R2), que
**debe resolverse antes** de tocar el 443.

### 1.2 Entrada para el mapa LEGACY (solo si el owner lo autoriza; no usar por defecto — R3-R1)

```jsonc
{"id":"php-prisma-ara-sync","src":"ara-x/vps/php/ara-sync.php","dest":"/var/www/html/prisma/api/ara-sync.php","type":"php","post":"none","enabled":true},
{"id":"nginx-snippet-ara-sync","src":"ara-x/vps/nginx/ara-sync.conf","dest":"/etc/nginx/snippets/prisma-ara-sync.conf","type":"nginx-conf","post":"nginx-reload","enabled":true},
{"id":"nginx-sync-zone","src":"ara-x/vps/nginx/ara-sync-zone.conf","dest":"/etc/nginx/conf.d/00-ara-sync-zone.conf","type":"nginx-conf","post":"nginx-reload","enabled":true}
```

**El mapa legacy NO debe ejecutarse completo**: tiene 42 targets enabled con Lua del pipeline Crystal
que no está desplegado (R3-R1).

---

## 2 · Matriz de errores (contrato v2)

| HTTP | Cuándo | Cuerpo | Lado |
|---|---|---|---|
| **200** | HMAC+ts+nonce+seq válidos; política válida | `ara_x_policy` firmada (`X-ARA-Sig`, `X-ARA-Policy-Etag`) | PHP |
| **200** (idempotente) | mismo `seq`+mismo `body_sha256` dentro de 120 s | idéntica a la anterior + `X-ARA-Idempotent: 1` | PHP |
| **204** | `X-ARA-Sync-Mode: shadow` (canary) | vacío; no aplica política ni toca seq/nonce | PHP |
| **400** | JSON inválido, campo desconocido, feature fuera de catálogo, URL-like, lever inventado, `soc` desconocido **sin** `soc_raw` | `{"ok":false,"error":"invalid_payload"}` | PHP |
| **401** | `key_id` desconocido, `device_id` no ligado, HMAC inválido, `ts` fuera de ±300 s, clave retirada | `{"ok":false,"error":"unauthorized"}` (uniforme) | PHP |
| **403** | — (no se usa: GET/PUT van a 405) | — | — |
| **405** | método ≠ POST | `{"ok":false,"error":"method_not_allowed"}` | nginx (`if`+`return`) |
| **409** | nonce reusado ≤600 s, `seq` ≤ último, mismo `seq` con body distinto o cache expirado | `{"ok":false,"error":"replay"}` | PHP |
| **413** | body > 16.384 B | `payload_too_large` | PHP/nginx |
| **415** | `Content-Type` ≠ `application/json` | `unsupported_media_type` | PHP |
| **429** | > burst 6 de `3 r/m` por IP en `/sync` | nginx + `Retry-After: 30` | nginx |
| **500** | la política calculada viola un guard (nunca se firma) | `policy_generation_failed` | PHP |
| **503** | store de claves vacío/ausente, identidad de artefacto ausente | `sync_disabled` / `artifact_identity_unavailable` | PHP |

**D4-F10 (SoC no canónico):** `client.soc="unknown"` + `soc_raw` se **acepta**; la respuesta es
fail-closed (`device.allowed=false`, `levers={}`, `display 1920x1080/never_downscale`, `eight_k=disabled`,
`flags=["soc_unmapped"]`). Un `unknown` **sin** `soc_raw` → 400 explícito (no silencioso). El
aprendizaje de SoC nuevos sigue siendo del heartbeat L2 (`ara_heartbeats.caps_json`); el ack L3
`denied/soc_unmapped` ya viaja en `state.apply` con `soc{m,c}` admitiendo `unknown`.

**Traducciones contrato→wire del ack** (implementadas en el cliente de referencia y en el catálogo):

| Contrato D4 | Wire L3 |
|---|---|
| `gate: "denied"` | `soc.g = "not_allowlisted"` o `"no_caps"` (nunca queda `allowed`) |
| `lifecycle: "player_inactive"` / `"next_media_source"` | `df[] = {k:"lifecycle", r:"lifecycle_pending"}` |
| `clamped[] = {key,from,to}` | `cl[] = {k,from,to}` (mismos valores) |

---

## 3 · Plan de despliegue (cuando el owner abra ventana)

1. **Preflight read-only**: verificar que `/sync` sigue 404, `/health` 200, `/ara/events` 401, lista
   4K 200 y que `nginx -t` del árbol staged pasa (en copia, sin tocar producción).
2. **Reconciliar drift R3-R2** de `ape-meta-public.conf` (repo vs VPS) antes de incluir el snippet.
3. **Backup**: `/var/backups/ape-deploy/<stamp>/` de los destinos + `ape-meta-public.conf`.
4. **Instalar staged** (`install -m 644`), `nginx -t` y **`reload`** (nunca `restart` por `.conf`).
5. **Canary 24 h** con `X-ARA-Sync-Mode: shadow`: no sirve política, no toca seq/nonce; se vigila
   `access_log` y la tasa 401.
6. **Activar** (quitar shadow en el cliente piloto) y verificar aceptación:
   `POST /sync` sin firma ⇒ **401** (no 404); `GET /sync` ⇒ **405**; `/health` **200**;
   `/ara/events` **401** sin Bearer; `/lists/APE_LISTA_4K.m3u8` **200** y sin `limit_req` nuevo.
7. **Observabilidad**: `ara_sync_log '$time_iso8601 $status $request_time'` (sin IP/body/nonce/firma);
   vigilar 401/409/429/5xx sin añadir límites al playback.

## 4 · Rollback

1. Quitar la línea `include snippets/prisma-ara-sync.conf;` de `ape-meta-public.conf`.
2. `nginx -t` + `reload` (el PHP puede quedarse inaccesible: no hay ruta).
3. Restaurar snippets/zone desde el backup del paso 3 si se modificaron.
4. `rollback.sh <stamp> --yes` del pipeline activo si se instalaron más ficheros.
5. El estado SQLite (`/var/lib/ara-x/sync.db`) puede conservarse o borrarse: no afecta playback.
6. **Nunca** `restart` por `.conf`; jamás tocar `proxy_read_timeout`/`proxy_next_upstream`/`limit_conn`
   del plano de reproducción.

---

## 5 · Gates y estado de verificación

| Gate | Resultado |
|---|---|
| Schemas request/response válidos + drift gate | **PASS** (`gen_sync_schemas.js --check`) |
| `node --test ara-x/tests/sync.test.js` | **PASS** (contrato I3) |
| HMAC correcto → 200/202 · firma mala → 401 · skew → 401 · replay → 409 · rate → 429 | cubierto en `sync.test.js` |
| 0 secretos hardcodeados; clave desde archivo/env; nunca logueada | verificado por `scripts/sync/check_sync_contract.js` |
| nginx sin `ngx.exit`, sin tocar timeouts/limit_conn/proxy del playback, limit solo `/sync` | verificado por el checker |
| PHP staged (no copiado al VPS) | **sí**; no hay copia en `_vps_stage/**` |
| `php -l` local | **NOT_RUN** — PHP no está instalado en el host local; no se declara PASS |
| `nginx -t` | **NOT_RUN** — requiere ventana |
| Deploy producción | **NO-GO** hasta cerrar R6-F01..F04 / R4-F01..F04, reconciliar R3-R2 y abrir ventana |

**Aceptación de producción (post-ventana):** `POST /sync` sin firma ⇒ **401** (no 404); `/health` 200;
`/ara/events` 401 sin Bearer; lista 200; 0 `limit_req` nuevos fuera de `/sync`; `X-ARA-Sig` válida en
200; `Retry-After: 30` en 429; sin secretos en logs.

---

## 6 · Notas de coordinación

- **t24 I3-LUA** (módulo Lua `/sync`, depende de t9/t15) es un entregable **separado**: aquí no hay Lua,
  no se toca `ara-x/vps/lua/**`, no se usa `resty.http` y el endpoint no toca `/lists/` ni el playback.
- El canal real es **APK → `POST /sync`**; `/a/cfg` sigue siendo loopback del VPS.
- El mapa legacy `tools/cicd` **no se usa** (R3-R1); el pipeline activo es `deploy-vps.yml` →
  `_vps_stage/deploy`, que exige aprobación `production` y backup/rollback.
