# TEST_PLAN · SSRF_ALLOW_SELFHEAL [t95]

**Ejecutar SOLO después de aprobar y aplicar.** Cada línea lleva el resultado esperado y cómo interpretarlo.

## 0 · Antes de tocar nada (línea base)

```bash
# Guardar el estado actual para poder compararlo y revertir
sudo cp -a /etc/nginx/lua/ape_gateway.lua /var/backups/ape-deploy/t95-ape_gateway.lua
sudo sha256sum /etc/nginx/lua/ape_gateway.lua
sudo nginx -T > /tmp/nginx-pre-t95.conf
systemctl show nginx -p MainPID       # anotar el PID: debe seguir siendo el mismo al final
```

## 1 · Validación sintáctica (obligatoria ANTES de recargar)

```bash
luac -p /etc/nginx/lua/ape_gateway.lua && echo LUA_OK
luac -p /etc/nginx/lua/selfheal_persist.lua && echo SELFHEAL_OK
sudo nginx -t
```
**Esperado**: `LUA_OK`, `SELFHEAL_OK` y `nginx: configuration file … test is successful`.
**Si falla**: **parar**. No recargar. Restaurar el backup (`ROLLBACK.md`).

## 2 · SSRF CERRADO (el objetivo de seguridad)

| Petición | Esperado |
|---|---|
| `curl -s -o /dev/null -w '%{http_code}' https://iptv-ape.duckdns.org/cdn/127.0.0.1:8088/_ape/health` | **403** |
| `…/cdn/127.0.0.2/x` | **403** |
| `…/cdn/10.200.0.1/x` | **403** |
| `…/cdn/192.168.1.1/x` | **403** |
| `…/cdn/169.254.169.254/x` | **403** |
| `…/cdn/172.16.5.4/x` | **403** |

**Clave**: el 403 debe salir **sin depender** de `remote_addr`. Comprobarlo también desde dentro del VPS:
```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8088/cdn/127.0.0.1:8088/_ape/health
```
**Esperado: 403 también desde loopback** — si aquí da 200, el bypass sigue vivo.

## 3 · 0 CANALES APAGADOS (el objetivo del propietario)

| Petición | Esperado |
|---|---|
| canal real de `line.tivi-ott.net` por `/cdn/` | **200** con manifiesto (`#EXTM3U`) |
| host **NO** listado `ky-tv.cc` por `/cdn/` | **200** (o el status real del proveedor, nunca 403 por allowlist) |
| host **NO** listado `nov202gg.xyz` por `/cdn/` | **200** (ídem) |

Y que queden **registrados**:
```bash
ls -1 /etc/nginx/ape-hosts-allow.d/
# Ky-tv.cc-… y nov202gg.xyz deben aparecer tras la primera petición
```

## 4 · La ruta publicada sigue intacta

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8        # 200
curl -s -o /dev/null -w '%{http_code}\n' https://iptv-ape.duckdns.org/lists/APE_LISTA_1793002539897_CDN.m3u8  # 200
curl -s -o /dev/null -w '%{http_code}\n' 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8'  # 200
```
Y el hop interno 443→8088 (que es el que usaban los 887 canales) **no debe romperse**.

## 5 · Invariantes del catálogo

```bash
grep -c 'CODECS=' lista.m3u8          # 31.561 sin cambios
grep -c 'hev1' lista.m3u8             # 0 sin cambios
curl -s -o /dev/null -w '%{http_code}\n' 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.ts'  # 404
```

## 6 · Recarga sin restart

```bash
systemctl show nginx -p MainPID       # MISMO PID que en el paso 0
sudo nginx -s reload
sleep 1
systemctl show nginx -p MainPID       # sigue igual
```

## 7 · Rollback (solo si algo falla)

Ver `ROLLBACK.md`.

---

## Criterio de aceptación

**Los 7 bloques en verde.** Si el bloque 2 falla → **no aplicar** (SSRF sigue abierto). Si el bloque 3 falla → **no aplicar** (se apagan canales, que es lo que el propietario prohíbe). **Ambos son bloqueantes, no "advertencias".**
