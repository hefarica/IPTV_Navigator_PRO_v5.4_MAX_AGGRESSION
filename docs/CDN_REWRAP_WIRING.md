# Cableado del generador al plano del VPS (CDN rewrap)

> Implementado y verificado **2026-10-24**.
> Cierra el circuito: **Excel → DNA → APP → lista → VPS → player**.

## 1. Hallazgo que cambió el diseño (crítico)

Al probar el canal real a través del plano apareció que los proveedores Xtream **no sirven la
playlist directamente**: responden

```
GET http://line.tivi-ott.net/live/3JHFTC/U56BDP/894968.m3u8
→ 302 Found
  Location: http://185.227.34.75:80/live/play/<token>/894968
```

El `Location` cambia **en cada petición** (token e IP de CDN distintos) y el cliente sigue el 302
de forma nativa, pero **un proxy con `proxy_pass` no sigue redirecciones**. Versiones anteriores del
gateway trataban 3xx como éxito → habrían servido una playlist **vacía** (pantalla negra).

### Solución implementada (gateway v4)

`ape_gateway.lua` ahora:
1. Sigue hasta **3 saltos** con `ngx.location.capture` (sin `lua-resty-http`, que no está en el VPS).
2. **Anti-SSRF** en el salto: solo IP literal pública o host de la allowlist; bloquea
   `10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 100.64/10`.
3. **Rebasa las URIs al origen FINAL** (el CDN tras el 302), no al proveedor nominal → los segmentos
   apuntan al CDN y **el video no pasa por el VPS**.
4. Solo acepta **2xx** como éxito (2xx estricto), no 3xx.

## 2. Evidencia (canal real, producción)

```
GET /cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/894968.m3u8
→ 200  670 bytes  0.698 s
  X-APE-CDN:          line.tivi-ott.net
  X-APE-Origin:       http://185.227.34.75:80     ← siguió el 302
  X-APE-URI-Rebased:  6
  X-APE-LAB-FLOOR:    8000000                     ← floor calibrado del LAB
  X-APE-UHD:          off                         ← es media playlist, no master
body:
  #EXTM3U … #EXTINF:10.000000,
  http://185.227.34.75:80/hls/ce1cfffd…/894968_3843.ts   ← segmento directo al CDN
```

## 3. Cableado del generador (`ape-cdn-rewrap.js`)

Reescribe la URL de cada canal de la lista generada:

```
http://line.tivi-ott.net/live/USER/PASS/123.m3u8
→ https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/USER/PASS/123.m3u8
```

- Se engancha **encima** del setter que ya instala `m3u8-post-processor.js` sobre
  `app.state.generatedM3U8` (no modifica ese archivo).
- Solo reescribe hosts de la allowlist; las URIs ya envueltas (`/cdn/`) no se tocan
  (guard anti doble-envoltura, incluso si cambia `ape_cdn_base`).
- Config en `localStorage`:

| Clave | Default | Efecto |
|---|---|---|
| `ape_cdn_mode` | `allowlist` | `off` = apagado instantáneo · `all` = cualquier host |
| `ape_cdn_hosts` | `line.tivi-ott.net` | hosts permitidos en modo `allowlist` |
| `ape_cdn_base` | `https://iptv-ape.duckdns.org` | base del plano |

```js
localStorage.ape_cdn_mode = 'off'      // volver a URLs directas
localStorage.ape_cdn_mode = 'allowlist'
localStorage.ape_cdn_hosts = 'line.tivi-ott.net,otro.host'
```

Funciones expuestas: `apeCdnRewrap(texto)`, `apeCdnInfo()`.

## 4. Verificación

| Prueba | Resultado |
|---|---|
| `node -c ape-cdn-rewrap.js` | exit 0 |
| Unit test (5 casos: allowlist, skip de otro host, ya envuelto, off, all) | **5/5 PASS** |
| `smoke.sh` (14 bloques, incluye failover/LL-HLS/4K/8K por el gateway) | **28 ✓ / 0 ✗** |
| `luatest` | **68 / 68** |
| `nginx -t` en producción | OK |
| App sirve el módulo | `ape-cdn-rewrap.js` 200 · tag presente · orden guard→rewrap correcto |

## 5. Compromiso de disponibilidad (honesto)

Con el rewrap activo, esos canales **sintonizan a través del VPS**: si el VPS está caído, el
tune-in falla (el watchdog lo repara, pero hay una ventana). Por eso:

- `ape_cdn_mode = 'off'` revierte al instante a URLs directas.
- La allowlist limita el alcance a los proveedores que ya validaste.
- El plano sirve **solo texto**: si se cae a mitad de reproducción, el player ya tiene los
  segmentos absolutos del CDN y **sigue reproduciendo** sin el VPS (el plano solo interviene al
  recargar la playlist).

## 6. Subida de la DNA desde la app (pieza 2)

`POST /ape/lab-upload` (443, solo POST, token obligatorio):

```bash
TOKEN=$(sudo cat /etc/nginx/ape-lab-upload.token)
curl -X POST -H "X-APE-Token: $TOKEN" \
     --data-binary @LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json \
     https://iptv-ape.duckdns.org/ape/lab-upload
```

- Valida esquema (mismo gate que la APP: `profiles_calibrated` + `lab_version` `omega_*` o
  `bulletproof:true`), escribe **atómico** (tmp + rename) en
  `/var/www/html/prisma/config/lab_master_22.6.0.json` e **invalida la caché** del puente.
- Sin token → **403**. GET → **405**. Cuerpo > 2 MB → 413.
- El token está en `/etc/nginx/ape-lab-upload.token` (root:www-data, 640). **No se imprime en logs.**
