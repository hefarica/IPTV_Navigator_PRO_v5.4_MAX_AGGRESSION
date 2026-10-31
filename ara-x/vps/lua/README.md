# Lua `/sync` — estado STAGED y NO-GO de producción

**Variante:** `ara-x/vps/lua/ara_x_sync.lua` + `ara-x/vps/nginx/ara-sync-lua.conf`.
**Estado:** repo-only; **nada desplegado**; `/sync` sigue 404 en producción.

## Hallazgos V3 y estado tras V3-R2 (t28)

| ID | Estado | Nota |
|---|---|---|
| V3-F-03 | **CORREGIDO en repo** | SHA-256/HMAC embebidos; no se carga `ape_attr` (su auto-serve no se dispara). |
| V3-F-04 | **CORREGIDO en repo** | La política solo usa campos de `sync_response.schema.json`; sin extras top-level. |
| V3-F-05 | **NO RESUELTO · NO-GO** | Hay **una sola clave para todos los dispositivos** (`/etc/nginx/lua/ara_sync.key`, separada de la de `/a/`), sin store por dispositivo ni `key_id`. No es autenticación por dispositivo (B2/B3). **No se declara resuelta.** |
| V3-F-06 | **CORREGIDO en repo** | `limit_req_zone ... zone=ara_sync_lua:1m rate=3r/m` en `ara-sync-zone.conf`; el snippet usa esa zona. |
| V3-F-07 | **CORREGIDO en repo** | 429 propio con `Retry-After: 30`; el `limit_req` de nginx lo añade `add_header Retry-After 30 always` en `/sync`. |
| V3-F-10 | **CORREGIDO en repo** | `seq`/`ts` enteros; claves top-level extra/duplicadas rechazadas; `soc=unknown` exige `soc_raw`. |
| V3-F-11 | **CORREGIDO en repo** | `content` no se emite desde Lua; no se inyecta JSON de `ngx.shared`. |
| V3-F-01/F-09 | **NO-GO de owner/producción** | Fuera del write-scope; siguen abiertos. |

## Por qué F-05 sigue NO-GO

La variante Lua no implementa el store por dispositivo del PHP (`X-ARA-Key-Id` + `device_ids`).
Cualquier portador de la clave global puede firmar cualquier `device_id`. Por eso:

- **No desplegar** esta variante como endpoint de producción.
- La referencia de producción sigue siendo el PHP staged, y aun así el deploy está **NO-GO**
  hasta cerrar F-01/F-09 (owner) y el store por dispositivo (B2/B3).
- Rotar la clave de `/sync` es independiente de `/a/` (archivo separado), pero no se rota sin ventana.

## Gates

- `node --test ara-x/tests/lua_module.test.js`
- `node ara-x/scripts/lua/check_lua_module.js`
- `luac -p` y `nginx -t`: **NOT_RUN** (no hay Lua/ventana en el host local); no se declaran PASS.
