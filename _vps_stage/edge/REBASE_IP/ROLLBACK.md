# ROLLBACK · REBASE_IP [t96]

## Riesgo específico de este parche

A diferencia de t95, **este rollback NO reabre una vulnerabilidad**: `to_cdn_path` solo **añade** un caso de rewrite. Revertirlo devuelve el comportamiento anterior (segmentos absolutos sin rebasar ⇒ el player va al proveedor en HTTP), que es **peor para el usuario pero no es un agujero de seguridad**.

**El SSRF no depende de este parche**: lo controla `_is_private_lit` (t95) en el gateway.

## Procedimiento (≈30 s)

```bash
# 1) Restaurar la librería
sudo cp -a /var/backups/ape-deploy/t96-ape_rebase_lib.lua /etc/nginx/lua/ape_rebase_lib.lua

# 2) Validar ANTES de recargar (obligatorio)
luac5.1 -p /etc/nginx/lua/ape_rebase_lib.lua && echo LUA_OK
sudo nginx -t

# 3) Recargar — nunca restart
sudo nginx -s reload

# 4) Comprobar que volvimos
systemctl show nginx -p MainPID                     # sin cambios
curl -s -o /dev/null -w '%{http_code}\n' 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8'   # 200
```

## Verificación de que el rollback fue real

El canal 9173 debe volver a mostrar **segmentos absolutos** en HTTP:

```bash
curl -s 'https://iptv-ape.duckdns.org/cdn/<host>/.../1312008.m3u8' | grep -c 'http://185\.227\.34\.184'
# tras rollback: 6  (antes de aplicar: 6; aplicado: 0)
```
**Si sigue dando 0, el rollback NO surtió efecto** → revisar el `sha256sum` contra el del bloque 0 del `TEST_PLAN.md`.

## Qué revierte y qué no

| Revierte | No revierte |
|---|---|
| El rewrite de IP:puerto en `ape_rebase_lib.lua` | El gateway (no se tocó) |
| Nada más | El parche t95 (`_is_private_lit`, registro) — **sigue vigente** |
| | Los hosts auto-registrados en `ape-hosts-allow.d/` |

## Cuándo revertir

- **`nginx -t` falla** tras aplicar → revertir **inmediatamente**, sin recargar.
- **Regresión en canales ya rebasados** (bloque 5) → revertir.
- **`.ts` deja de dar 404** → revertir **y avisar**: significaría que el candado del vídeo se abrió, que es un riesgo mayor que el mixed content.

## Aviso para el registro

```
[t96-ROLLBACK] <fecha> ape_rebase_lib restaurada => segmentos absolutos IP:puerto
               vuelven a NO rebasarse => el player sale al proveedor en HTTP
               (mixed content en players HTTPS). Motivo: <el que sea>.
```
