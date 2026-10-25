# Integración de los módulos Lua sueltos (v2 del META-PLANE)

> Ejecutado y verificado en producción **2026-10-24 15:50–15:55 UTC**.
> Backup: `/root/ape-meta-plane-backup-20261024T155041Z/`.
> Bundle: `/root/ape-meta-plane-20261024/` (local `_vps_stage/`).

## 1. Corrección de mi propio inventario (importante)

En la sesión anterior reporté **6 módulos muertos**. Era **parcialmente incorrecto por un fallo de mi
escáner**: solo reconocía `require("x")` y no la forma defensiva `pcall(require, "x")`.

Estado real, verificado leyendo el código:

| Módulo | Estado REAL | Evidencia |
|---|---|---|
| `bw_adaptive_floor` | **ya cableado** (librería) | `combined_body_filter.lua:25` + llamada en `:256` |
| `ape_profile_resolver` | **ya cableado** (librería) | `combined_body_filter.lua:29` + uso en `:137` |
| `sentinel_auth_guard` | nunca cableado | 0 referencias en `.conf` |
| `ape_wake_on_manifest` | nunca cableado | 0 referencias en `.conf` |
| `shield_follow_302` | **bloqueado por dependencia** | `require "resty.http"` — AUSENTE en el VPS (no hay paquete apt ni luarocks) |
| `follow_redirect` | **incompleto por diseño** | usa `ngx.say` en fase de cabeceras + necesita location `/_follow_redirect` inexistente |

Corregido también el generador del mapa (`_map_lua_modules.py` debe contar `pcall(require, ...)`).

## 2. Qué se integró (y en qué fase)

| Fase | Archivo en el VPS | Rol | Por qué no interfiere |
|---|---|---|---|
| `header_filter` | `ape_header.lua` (nuevo, composición) | quita `Content-Length` + ejecuta el sentinel | nginx admite **una** directiva `*_by_lua` por fase: componer es la única vía limpia |
| `body_filter` | `ape_uri_rebase.lua` | rebase de URIs a absolutas del proveedor | único body filter del location |
| `log` (post-respuesta) | `ape_wake_on_manifest.lua` | encola wake en `/dev/shm` | corre después de enviar la respuesta → 0 impacto en TTFB |
| librería (`require`) | `bw_adaptive_floor.lua`, `ape_profile_resolver.lua` | floor adaptativo y perfil por `stream_id` | funciones puras, sin `ngx`, llamadas bajo `pcall` |

`ape_header.lua` no duplica el sentinel: hace `pcall(dofile, dir .. "sentinel_auth_guard.lua")`, con
`dir` leído de la variable nginx `$ape_lua_dir` (remapeable en tests aislados).

## 3. Cinco bugs reales encontrados (cada uno con su síntoma)

1. **`function body_filter()` no funciona en `*_by_lua_file`.**
   *Síntoma:* el filtro no hacía nada, sin error.
   *Causa:* el archivo **es el handler** (se ejecuta por chunk) y además el *global write guard* de
   OpenResty **bloquea** escribir `_G.body_filter`.
   *Fix:* handler a nivel de chunk, todo `local`, estado en `ngx.ctx`.

2. **`body_filter_by_lua*` NO se ejecuta sobre respuestas del handler estático.**
   *Síntoma:* un stub que ponía `ngx.arg[1]="#STUB"` no alteraba la salida de un `alias`.
   *Fix:* el self-test usa `proxy_pass` (la ruta real), no un fichero estático.

3. **`Content-Length` del upstream truncaba el cuerpo reescrito.**
   *Síntoma:* `Content-Length: 203` con cuerpo reescrito más largo → playlist cortada a 203 bytes;
   el grep de la URI absoluta fallaba.
   *Fix:* `ngx.header["Content-Length"] = nil` en el header handler (`proxy_hide_header` **no basta**).

4. **`lua_package_path` duplicado.**
   *Síntoma:* `nginx -t` → `"lua_package_path" directive is duplicate`; el instalador abortó y **hizo
   rollback limpio** (el gate funcionó).
   *Causa:* `nginx.conf:22` ya lo declara globalmente apuntando a `/etc/nginx/lua/`.
   *Fix:* no declararlo en el vhost.

5. **Cola de wake sin permisos.**
   *Síntoma:* `ape_wake_on_manifest` no encolaba en producción (sí en el test aislado).
   *Causa:* `/dev/shm/ape_wake_queue` pertenecía a otro usuario (creado por los tests) y el append de
   `www-data` fallaba **en silencio**.
   *Fix:* el instalador crea la cola con `0666`.

## 4. Tests ejecutados (todos en el VPS, no en local)

### 4.1 Instancia aislada (`:8089`, producción intacta) — RC=0
```
[1] /__selftest.m3u8      status=200  X-APE-Meta-Mode: rebase-only
[2..4] URIs absolutas: variante, segmento y URI="key.bin"    ✓✓✓
[5] candado de video: /x.ts /x.m4s /x.mp4 /foo.aac -> 404     ✓✓✓✓
[6] sentinel + rebase + wake en el MISMO location            ✓✓ (X-APE-Sentinel: OK)
[7] wake: cola /dev/shm 8 -> 9 líneas                        ✓
[8] luatest: {"pass":20,"fail":0,"total":20}                 ✓
[9] flags en caliente                                         ✓
RESULTADO: OK
```

### 4.2 Producción (`:8088`, tras `nginx -t` + reload) — **OK en los 9 tests**
```
[1] status=200 mode=rebase-only
[2..4] ✓ variante/segmento/key absolutos
[5] ✓ 4/4 candados 404
[6] ✓ X-APE-Sentinel: OK  ·  ✓ rebase intacto con los 3 módulos
[7] ✓ wake encolado (1 -> 2)
[8] ✓ luatest 0 fallos (20 asserts)
[9] ✓ flags {"rebase":"1","wake":"1","sentinel":"1","enrich":"0","virtual4k":"0"}
RESULTADO: OK — contrato metadata-only verificado
```

### 4.3 Conjunto de asserts del luatest (20/20)

`bw_adaptive_floor`: sin señal → estático · sano → estático · degradado (DOUBLE) → 0,8×EWMA ·
stale (>30 s) → estático · frío (EWMA 0) → estático · escalación 0,75×max · escalación bypass con red
degradada · sin variante alta → 0 · `select_variants` conserva la mejor · nunca devuelve vacío.

`ape_profile_resolver`: `streamid_from_uri` (.m3u8/.ts/sin id) · `resolve_from_map` (por stream_id,
default, sin mapa, perfil inválido).

Infra: `circuit_metrics`, `lab_config`, `ape_flags` existen.

### 4.4 Regresión del vhost público 443

| Endpoint | Antes | Después |
|---|---|---|
| `/prisma/api/channel-hdcp-bulk.php` | 200 | **200** |
| `/prisma/api/channel-pq-bulk.php` | 200 | **200** |
| `/api/netshield-sentinel.php` | 503 | **503** (igual) |

`:8088` sigue **cerrado desde internet** (000): desplegado, no expuesto.

## 5. Qué NO se cableó, y por qué

- **`shield_follow_302`**: `require "resty.http"` no existe en el VPS (no hay `apt` ni `luarocks`).
  Cablearlo daría 500 en el worker. Alternativa: vendorizar `lua-resty-http` (1 archivo, licencia BSD)
  o usar `ngx.location.capture`.
- **`follow_redirect`**: usa `ngx.say` en fase de cabeceras (ilegal) y depende de un location
  `/_follow_redirect` que no existe. Además, **seguir 302 en servidor suele ser contraproducente**:
  los players ya siguen redirects nativamente; hacerlo en el VPS duplica peticiones y añade latencia
  al camino crítico. Si un player concreto falla con 302, se habilita en un location dedicado.

## 6. ¿Estamos aplicando lo que usa Disney Streaming?

**Lo verificado en esta sesión** (fuentes consultadas): las guías de referencia para lo que hacemos son
la especificación HLS ([RFC 8216](https://datatracker.ietf.org/doc/html/rfc8216)), el módulo
[lua-nginx-module](https://github.com/openresty/lua-nginx-module) y el cliente HTTP
[lua-resty-http](https://github.com/ledgetech/lua-resty-http); el artículo de nginx
["The Complex Dance of Lua and NGINX"](https://blog.nginx.org/blog/the-complex-dance-of-lua-and-nginx-power-pitfalls-and-performance-challenges)
documenta exactamente las trampas que encontramos (fases, coste de Lua en el camino caliente).

**No pude confirmar en esta sesión, con fuente primaria, el stack exacto de Disney+.** Lo que sigue es
conocimiento de industria, marcado como tal, y comparado con lo que tenemos:

| Patrón (industria: Disney/Disney Streaming, ESPN) | ¿Lo aplicamos? |
|---|---|
| **CMAF/fMP4** empaquetado (no TS) | ✅ `cmaf_worker.php` (`-c:v copy` a fMP4/DASH) |
| **Multi-CDN + failover** | ⚠️ configurado (`iptv-brazil-backup-loopback.conf`), **no desplegado** |
| **ABR cliente con EWMA** | ✅ `bw_adaptive_floor` (0,8×EWMA / escalación 0,75×) — ejercitado 20/20 |
| **Per-title / per-device** | ✅ `ape_profile_resolver` + `visual_profiles.json` (P0-P5) |
| **LL-HLS / baja latencia** | ⚠️ tags en el generador (`EXT-X-PART`, `SERVER-CONTROL`); **no servido** por el VPS |
| **Telemetría QoE de alta fidelidad** | ⚠️ módulos existen (`qoe_server_side_observer`, `qoe_flush_worker`); el host público devuelve 404/503 |
| **DRM multi-CDM** | ❌ no aplica a este stack (no hay licencias) |
| **Server-side ad insertion (SSAI)** | ❌ fuera de alcance |
| **Metadata-only edge (no video por el CDN propio)** | ✅ **esto es lo que acabamos de construir** y Disney no lo publica como patrón |

Conclusión honesta: aplicamos **los patrones de reproducción** (CMAF, ABR medido, perfil por dispositivo,
metadata por URL) pero **no** el modelo de Disney de multi-CDN + DRM + SSAI, que exige contratos y
hardware que aquí no existen.

## 7. Rollback

```bash
bash /root/ape-meta-plane-20261024/scripts/rollback.sh
```
Quita vhost + módulos + fixture + (opcional) cola, valida `nginx -t` y recarga. Idempotente.
