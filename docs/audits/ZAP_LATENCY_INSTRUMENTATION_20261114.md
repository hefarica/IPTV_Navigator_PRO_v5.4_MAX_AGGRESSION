# Tiempo de zapping: instrumentación (2026-11-14 01:16 UTC)

El operador pidió *"medirás tiempo de zapping"*. Esto es la instrumentación que
lo hace posible. **Aún no hay zaps medidos** — el formato entró hace dos hits y
el device no ha zapeado desde entonces. La medición aparece en cuanto zapee.

---

## 1. El hallazgo: el dato existía, pero no en el log correcto

```
/etc/nginx/nginx.conf:76
  log_format iptv '... $status $body_bytes_sent $request_time';

/etc/nginx/sites-enabled/default:56
  access_log /var/log/nginx/playlist_access.log;   ← SIN nombre = combined
```

**`$request_time` estaba definido en `iptv`, pero `playlist_access.log` nunca lo
usó: caía en `combined`, que no lo tiene.** Por eso 23 campos y el último el UA.

## 2. El arreglo — aditivo, sin romper columnas

```
/etc/nginx/nginx.conf:77
  log_format ape_playlist '$remote_addr - $remote_user [$time_local] "$request"
    $status $body_bytes_sent "$http_referer" "$http_user_agent"
    rt=$request_time urt=$upstream_response_time';

/etc/nginx/sites-enabled/default:56
  access_log /var/log/nginx/playlist_access.log ape_playlist;
```

**Las columnas 1-9 quedan idénticas** (todos los analizadores anteriores siguen
funcionando); se añaden `rt=` y `urt=` al final.

Backups: `/root/ape-backups/nginx/{nginx.conf,default}.20261114T0116xxZ`
`nginx -t`: OK · `systemctl reload nginx`: OK

## 3. Prueba de que funciona

```
181.63.176.21 - - [14/Nov/2026:01:16:16 +0000] "POST /prisma/api/conviva-event.php
  HTTP/2.0" 200 56 "-" "okhttp/4.12.0" rt=0.179 urt=0.004
```

`rt=0.179` (179 ms total) · `urt=0.004` (4 ms del upstream) → **175 ms es nuestro**.

## 4. Lo que se podrá medir y lo que no

`/opt/ape-pulse/ape-zap-latency.sh` (symlink `ape-zap-latency`) reporta:

| Métrica | Qué es |
|---|---|
| `rt` p50/p90/p99/max/media | tiempo total del VPS sirviendo `/pulse` |
| `urt` p50/p90/max/media | tiempo del proveedor en ese hit |
| **overhead nuestro** | `rt − urt`, con su porcentaje |
| reparto por estado | cuántos 200 / 502 / 404 |
| los 5 más lentos | para ver el patrón |
| cuántos > 1 s | la cola |

**Lo que NO mide, y por qué:**
- **Tiempo hasta el primer frame.** Depende de la red del device y del decoder
  del player. El VPS no lo ve. Afirmarlo sería inventar.
- **Comportamiento del buffer.** Vive en el device.

## 5. Error propio durante el cambio, y su corrección

Primer intento: puse el backup **dentro de `sites-enabled/`**. nginx carga todo
lo que hay ahí, así que leyó `default.bak_...` como una segunda config y abortó:

```
[emerg] a duplicate default server for 0.0.0.0:80
  in /etc/nginx/sites-enabled/default.bak_20261114T011530Z_apeformat:2
```

**El rollback automático funcionó** (restauró ambos ficheros y no aplicó nada).
Segundo intento: backups en `/root/ape-backups/nginx/`, fuera del árbol que
nginx lee. Aplicó a la primera.

**Lección**: un backup dentro de un directorio que el servicio carga es
configuración activa, no un backup.

## 6. Estado

| Pieza | Estado |
|---|---|
| `log_format ape_playlist` | definido · `nginx -t` OK |
| `access_log` con `ape_playlist` | aplicado · reload OK |
| `rt=` visible en el log | **CONFIRMADO** (2 hits) |
| `ape-zap-latency` | desplegado · `bash -n` OK |
| zaps de `/pulse` medidos | **0** — pendiente de que el operador zapee |

**Comando para el operador**: zapear, y luego `ape-zap-latency`.
