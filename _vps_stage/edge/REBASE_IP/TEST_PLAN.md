# TEST_PLAN · REBASE_IP [t96]

**Orden obligatorio.** Si el bloque 1 falla, **parar**: no recargar.

## 0 · Línea base

```bash
sudo cp -a /etc/nginx/lua/ape_rebase_lib.lua /var/backups/ape-deploy/t96-ape_rebase_lib.lua
sudo sha256sum /etc/nginx/lua/ape_rebase_lib.lua
systemctl show nginx -p MainPID          # anotar PID (debe seguir igual al final)
```

## 1 · Sintaxis (BLOQUEANTE)

```bash
luac5.1 -p /etc/nginx/lua/ape_rebase_lib.lua && echo LUA_OK
sudo nginx -t
```
**Esperado**: `LUA_OK` y `test is successful`. **Si falla: NO recargar. Rollback.**

## 2 · Unidad: el rewrite (sin tocar el VPS)

```bash
luac5.1 -e '
local M = dofile("/etc/nginx/lua/ape_rebase_lib.lua")
local body = "#EXTM3U\n#EXTINF:6.0,\nhttp://185.227.34.184:80/hls/s1.ts\n#EXT-X-MAP:URI=\"http://185.227.34.184:80/hls/init.mp4\"\n"
local out = M.rebase_body(body, "https://proveedor.example")
print(out)
'
```
**Esperado**:
```
/cdn/185.227.34.184:80/hls/s1.ts
#EXT-X-MAP:URI="/cdn/185.227.34.184:80/hls/init.mp4"
```
Y el `#EXTINF:6.0,` **intacto**.

## 3 · **Lo primero que hay que confirmar** — parse del gateway con IP:puerto

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  'https://iptv-ape.duckdns.org/cdn/185.227.34.184:80/hls/'"$(...)"'.ts'
```
**Esperado: 200.** Si da **404 o 400**, el gateway **no** parsea `ip:puerto` y hay que parchearlo también antes de seguir: **el rebase solo no basta**.

> Este es el **[UNKNOWN]** del README. Es la primera cosa que se mide, porque de ella depende que el resto tenga sentido.

## 4 · Caso real 9173

```bash
# Manifiesto ANTES (para comparar)
curl -s 'https://iptv-ape.duckdns.org/cdn/<host-proveedor>/.../1312008.m3u8' | head -20

# Tras aplicar: los 6 segmentos deben empezar por /cdn/185.227.34.184:80/
curl -s ... | grep -c '^/cdn/185\.227\.34\.184:80/'      # esperado: 6
curl -s ... | grep -c 'http://185\.227\.34\.184'         # esperado: 0

# Y el segmento debe descargar bytes de verdad
curl -s -o /dev/null -w 'code=%{http_code} bytes=%{size_download} ttfb=%{time_starttransfer}\n' \
  'https://iptv-ape.duckdns.org/cdn/185.227.34.184:80/hls/...ts'
```
**Esperado**: `6`, `0`, y `code=200 bytes>=13000000`.

## 5 · Regresión (BLOQUEANTE)

```bash
# canales ya rebasados siguen 200
curl -s -o /dev/null -w '%{http_code}\n' 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8'   # 200
# .ts por /cdn/ sigue 404 (el candado del vídeo NO se reabre)
curl -s -o /dev/null -w '%{http_code}\n' 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.ts'      # 404
# SSRF privado sigue 403
curl -s -o /dev/null -w '%{http_code}\n' 'https://iptv-ape.duckdns.org/cdn/127.0.0.1:8088/_ape/health'                     # 403
# invariantes del catálogo
grep -c 'CODECS=' lista.m3u8    # 31.561
grep -c 'hev1' lista.m3u8       # 0
```

## 6 · Latencia y 0 freeze (20 peticiones)

```bash
for i in $(seq 1 20); do
  curl -s -o /dev/null -w '%{http_code} %{time_starttransfer}\n' "$URL_MANIFIESTO"
done | sort -k2 -n | awk '{a[NR]=$2; c[$1]++} END{
  printf "errores=%d\n", (c["200"]==20?0:20-c["200"]);
  printf "ttfb_p50=%.3f p95=%.3f\n", a[int(NR*0.5)], a[int(NR*0.95)]}'
```
**Esperado**: `errores=0`, **`ttfb_p95 < 0.500`**. Repetir con 3 segmentos.

**Sobre el rewrite**: es un `gsub` sobre 680 B ⇒ **del orden de microsegundos**. No lo mido aquí porque **no hay Lua en el host de trabajo**; la cota real la da el bloque 6 (si el rewrite costara, el TTFB subiría y se vería).

## 7 · Recarga

```bash
systemctl show nginx -p MainPID    # MISMO PID
sudo nginx -s reload
sleep 1
systemctl show nginx -p MainPID    # sigue igual
```

## Criterio de aceptación
**Bloques 1, 3, 4, 5 y 6 en verde.** El **3** es el que puede invalidar todo el enfoque (parse del gateway): si falla, **no aplicar** y volver con el dato.
