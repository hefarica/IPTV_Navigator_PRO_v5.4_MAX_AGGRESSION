# ROLLBACK · SSRF_ALLOW_SELFHEAL [t95]

## Regla de oro

**Restaurar el gateway reabre el bypass `remote_addr == 127.0.0.1` y, con él, el SSRF.**
No es un rollback "limpio": devuelve el sistema a un estado con una **vulnerabilidad medida** (t93: `/cdn/127.0.0.1:8088/_ape/health` → 200).

Por eso: **si se revierte, hay que re-aplicar el parche en cuanto se corrija la causa.** Y **anotarlo en el log de operación** para que no quede como estado permanente por olvido.

## Procedimiento (≈30 segundos)

```bash
# 1) Restaurar el gateway anterior
sudo cp -a /var/backups/ape-deploy/t95-ape_gateway.lua /etc/nginx/lua/ape_gateway.lua

# 2) Quitar el log_by_lua del selfheal si se añadió (solo si se llegó a poner)
#    Comentar/eliminar la línea:
#      log_by_lua_file /etc/nginx/lua/selfheal_persist.lua;
#    y volver a nginx -t

# 3) Validar antes de recargar
luac -p /etc/nginx/lua/ape_gateway.lua && echo LUA_OK
sudo nginx -t

# 4) Recargar (NUNCA restart: no debe caer el servicio)
sudo nginx -s reload

# 5) Verificar que volvimos al estado anterior
systemctl show nginx -p MainPID          # sin cambios respecto a antes del rollback
curl -s -o /dev/null -w '%{http_code}\n' https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8   # 200
```

## Qué NO hace este rollback

- **No borra** `/etc/nginx/ape-hosts-allow.d/` — los hosts auto-registrados pueden quedarse; son inocuos y útiles si se re-aplica.
- **No toca** el shared dict `ape_hosts` — se vacía solo al reiniciar nginx (que **no** hacemos).
- **No revierte** cambios de la config: si además se añadió `lua_shared_dict` o `log_by_lua_file`, hay que quitarlos a mano (paso 2).

## Verificación post-rollback

| Comprobación | Esperado tras revertir |
|---|---|
| `/cdn/127.0.0.1:8088/_ape/health` | **200** ← **el SSRF vuelve** (esto confirma que el rollback funcionó) |
| `/lists/APE_LISTA_4K.m3u8` | **200** |
| canal real por `/cdn/` | **200** |
| `MainPID` | igual (sin restart) |

**Si el SSRF NO vuelve a dar 200 tras el rollback**, es que el gateway restaurado no era el original → revisar el `sha256sum` contra el anotado en el paso 0 del `TEST_PLAN.md`.

## Aviso para el registro de operación

```
[t95-ROLLBACK] <fecha> gateway restaurado => BYPASS remote_addr REABIERTO => SSRF ACTIVO.
               Motivo: <el que sea>. Re-aplicar parche t95 cuando se corrija.
```
