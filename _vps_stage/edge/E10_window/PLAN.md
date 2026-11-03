# E10 · PAQUETE DE VENTANA — estado `preparado` (NO aplicado)

> **Estado: `preparado`.** No se ha tocado nginx, no se ha recargado y no se ha instalado nada.
> **Falta la confirmación explícita del propietario** para pasar a `aplicado` (el script de
> aplicación exige `OWNER_CONFIRMED=1`; sin ella, solo funciona `--check`/`--backup-only`).
> **Ventana propuesta:** `2026-10-26T22:50Z` (anunciada en `COORDENADAS_SESIONES.md` §4 con
> >15 min de margen; **condicionada** a la confirmación).
> **Paquete:** 11 ficheros (6 modificados + 5 nuevos), compuesto **solo** por cambios medidos:
> (a) E7 observabilidad · (b) retirada del bypass SSRF `remote_addr == "127.0.0.1"` ·
> (c) fix `Accept-Ranges` en `/lists/` · (d) guard UHD E5 (techo 4K real, CODECS intacto).

---

## 1 · Qué se aplicaría (y por qué cada cosa)

| # | Fichero destino | Origen staged | Antes (vivo) | Después (staged) | Cambio |
|---|---|---|---|---|---|
| a | `lua/ape_obs.lua` | `ed7d2adf…` | `f477741b…` | **`ed7d2adf0fdaf091…`** | E11+E7: `error_ratio = fallos/intentos` + ventana 5 min + provider_fail |
| a | `lua/ape_obs_metrics.lua` | nuevo | — | `d960f23aed2a9da1…` | Registro O(1) + percentiles + ventana |
| a | `lua/ape_obs_rec.lua` | nuevo | — | `180ca51a9d06e02b…` | `log_by_lua` de `/cdn/` (post-respuesta) |
| a | `lua/ape_obs_http.lua` | nuevo | — | `737f1700906bbc30…` | Familia `e:` de borde |
| a | `lua/ape_log_chain.lua` | nuevo | — | `831f309e06a89355…` | Encadena wake existente + obs (fase log) |
| a | `lua/ape_obs_metrics_api.lua` | nuevo | — | `eb5af49ba50d0cb9…` | `GET /_ape/metrics` (loopback) |
| a | `conf.d/50-ape-meta-plane.conf` | E7 stage | `3e29b9280c05de36…` | **`33bbeb6b9e6dbe1d…`** | 2 `log_by_lua` + `location = /_ape/metrics` |
| b+d | `lua/ape_gateway.lua` | compuesto E11+E7 + deltas | `2dc0fad86f45f4ac…` | **`eadd87d1d9fa88cd…`** | quita bypass SSRF; guard `uhd8k` (`can_declare_8k`) |
| d | `lua/ape_uhd.lua` | live + E5-A | `f1f5eb674744858a…` | **`88d974275653fb1c…`** | `MIN_HEVC_LEVEL_8K=183` + `max_resolution`/`level_supports_8k`/`can_declare_8k`; `declare_auto` techo 4K |
| d | `lua/ape_luatest.lua` | live + asserts | `98a29c444f1bca0f…` | **`301f35927e8dbbe0…`** | asserts 155-156 esperan `3840x2160` / `4k` |
| c | `sites-enabled/default` | live + fix | `49c162a862f1e548…` | **`2ebe7ff316baa93c…`** | quita `add_header Accept-Ranges bytes always` de `/lists/` |

Diffs exactos: [`diffs/`](diffs/) (`gateway.diff`, `uhd.diff`, `luatest.diff`, `default.diff`).
`SHA256SUMS` y `build.json` en la raíz del paquete. **HTTP/2 NO se toca** (sigue ON).

### Lo que NO cambia

`/var/www/lists` · `/lists/` (contenido, `gzip_static`/`gunzip`, ETag/304) · regla `.ts/.m4s/.mp4 → 404` ·
`resolve.php`/`origins.php` · `ngx.exit(503)` · ningún circuit breaker · `proxy_cache` (sigue OFF) ·
negociación HTTP/2 · los bloques APE-SEC (SSRF, vídeo, `upload.php`) y su orden antes del include.

---

## 2 · Preflight ejecutado (read-only)

| Prueba | Resultado | Evidencia |
|---|---|---|
| Live hashes == bases pineadas (6 ficheros + `nginx -T`) | **OK** | `runs/20261026T220744Z/apply_check.log` |
| `SHA256SUMS` del staged (11 ficheros) | **OK** | ídem |
| `luac5.1 -p` de los 9 Lua | **OK** | ídem |
| `nginx -t` sobre árbol copia con los 2 confs staged | **OK** | ídem |
| APE-SEC SSRF/vídeo (l.34/39) **antes** del include (l.43) | **OK** | ídem |
| Gateway: sin bypass SSRF · `if true then` · sin `HOSTS:set(dk,1,15)` · `X-APE-Reason`/`-Attempts` · `ngx.ctx.ape_dec` · `uhd.can_declare_8k` | **OK** | ídem |
| `ape_obs`: `attempts = req+failed+denied+big`, `err_ratio = fails/attempts` | **OK** | ídem |
| Matriz UHD staged (M1–M5, `declare_auto` 4K, 8K solo M4) | **PASS** | `runs/20261026T220744Z/uhd_matrix.log` |
| Caudal h1 vs h2 (2 MiB, Range) | h1 **1,30 MB/s** · h2 default **0,48 MB/s** | `runs/20261026T220744Z/throughput_h1_vs_h2.log` |
| Backpoint de rollback (solo backups) | **OK** · `/root/backups/edge-e10-20261026T222426Z/` | `runs/20261026T220744Z/backup_only.log` |
| Rollback `--check` sobre ese backup | **OK** (6 restauraciones + 5 borrados) | `runs/20261026T220744Z/rollback_check.log` |
| Estado nginx tras el preflight | `MainPID=2001835`, `NRestarts=0`, `nginx -t` OK, hashes vivos intactos | — |

**Otra sesión no está tocando nginx:** último reload `21:59:30Z` (rollback E9); sin reloads entre
`21:59:30` y `22:26Z`; `sites-enabled/default` mtime `20:55:48Z`, `ape_gateway.lua` `20:49:57Z`.
La comprobación se repite dentro del `--apply` (hashes + `nginx -T`) y aborta si algo cambió.

---

## 3 · Comandos ordenados (cuando el propietario confirme)

```bash
# 0 · subir el paquete a /tmp (nunca a producción)
scp -r _vps_stage/edge/E10_window/staged root@178.156.147.234:/tmp/e10-stage

# 1 · preflight (NO escribe; debe terminar en RESULT=CHECK)
ssh root@178.156.147.234 'STAGE=/tmp/e10-stage bash -s -- --check' \
  < _vps_stage/edge/E10_window/scripts/apply_E10.sh

# 2 · backup (solo /root/backups; opcional, el --apply también lo hace)
ssh root@178.156.147.234 'STAGE=/tmp/e10-stage bash -s -- --backup-only' \
  < _vps_stage/edge/E10_window/scripts/apply_E10.sh

# 3 · APLICAR (SOLO con confirmación explícita del propietario)
ssh root@178.156.147.234 'OWNER_CONFIRMED=1 STAGE=/tmp/e10-stage bash -s -- --apply' \
  < _vps_stage/edge/E10_window/scripts/apply_E10.sh

# 4 · verificación posterior (la hace el propio --apply; repetible a mano)
node _vps_stage/edge/baseline/baseline_edge.mjs --label "E10-post"
```

El `--apply` hace, en orden: re-chequeo de hashes → backup → instalar 11 ficheros →
`luac5.1 -p` ×9 → APE-SEC antes del include → `nginx -t` → `systemctl reload nginx` (nunca
restart, PID estable) → smoke completo → si algo falla, **rollback automático**.

### Smoke del `--apply` (resumen)

SSRF público y loopback `/cdn/127.0.0.1:8088/_ape/health` → **403** · `/cdn/…x.ts` → **404** ·
lista **h2 200** y **h1 200** · canales 3/5/6 **200** con `X-APE-CDN` · `/upload.php` → **403** ·
`/_ape/metrics` **200 solo loopback** (público 404) · `X-APE-Reason` y `X-APE-Attempts` en una
respuesta de error real (sonda deliberada a ruta inexistente) · `/_ape/health` con
`error_ratio_semantics = fallos/intentos` y `attempts` · `/_ape/luatest` **`fail:0`** ·
`ape_uhd` ya no declara 8K sobre L153 (matriz offline + `declare_auto` 4K).

---

## 4 · Rollback (exacto y probado en dry-run)

```bash
ssh root@178.156.147.234 'bash -s' -- <STAMP> --apply \
  < _vps_stage/edge/E10_window/scripts/rollback_E10.sh
```

Restaura `ape_gateway.lua`, `ape_obs.lua`, `ape_uhd.lua`, `ape_luatest.lua`,
`sites-enabled/default`, `conf.d/50-ape-meta-plane.conf` desde
`/root/backups/edge-e10-<STAMP>/`, elimina los 5 Lua nuevos de E7, `luac -p`, `nginx -t`,
`reload` y smoke mínimo. Equivalente manual:

```bash
BK=/root/backups/edge-e10-<STAMP>
install -m644 $BK/ape_gateway.lua.orig /etc/nginx/lua/ape_gateway.lua
install -m644 $BK/ape_obs.lua.orig     /etc/nginx/lua/ape_obs.lua
install -m644 $BK/ape_uhd.lua.orig     /etc/nginx/lua/ape_uhd.lua
install -m644 $BK/ape_luatest.lua.orig /etc/nginx/lua/ape_luatest.lua
install -m644 $BK/default.orig         /etc/nginx/sites-enabled/default
install -m644 $BK/50-ape-meta-plane.conf.orig /etc/nginx/conf.d/50-ape-meta-plane.conf
rm -f /etc/nginx/lua/{ape_obs_metrics,ape_obs_rec,ape_obs_http,ape_log_chain,ape_obs_metrics_api}.lua
nginx -t && systemctl reload nginx
```

> El backup es **post-seguridad** (incluye SSRF/vídeo/`upload.php`). Si se restaurara el
> `default` pre-seguridad (`49c162a8…` **no** es pre-seguridad; `58bee1cb…` sí), habría que
> re-aplicar los 3 bloques APE-SEC antes de cerrar. Aquí **no aplica**: el backup es el estado
> vivo actual.

---

## 5 · Decisiones explícitas (medidas, no asumidas)

1. **Caché del 302 = OFF.** TTL 30–60 s **rechazado** (t4: +20 % latencia, 59 % de 509). TTL 3 s
   con revalidación por status queda **opcional y no aprobado** ⇒ no se despliega.
2. **Bomba de tokens: rechazada.** 0,5 req/s por clave con `max_connections=1` ⇒ no.
3. **Micro-caché de manifiesto: no.** E6 la midió como NO-GO (8,5 % de techo) y el origen es `no-store`.
4. **HTTP/2 se conserva** (E9: nueva p50 362,2 / p95 415,2 ms; reutilizada 204,6 ms; ALPN h2).
   **Riesgo documentado:** con ventana de flujo pequeña, el caudal es ~0,48 MB/s (nuestra sonda)
   / 0,42–0,50 MB/s (E6) vs 1,3–3,6 MB/s en h1 ⇒ la lista de 140 MB puede tardar ~5 min por h2.
   No se toca la negociación; los manifiestos (1–2 KB) no sufren. Si se quisiera, la decisión de
   forzar h1 para `/lists/` exigiría otra ventana y otra arquitectura (no está en este paquete).
5. **UHD:** el 8K deja de ser automático; solo con `uhd8k=1` **y** fuente ≥3840 **y** nivel ≥L183.
   `uhd_auto` declara **4K** siempre. **CODECS no se toca** (ni una coma). El fixture loopback
   `__fixture_master4k` ya no es alcanzable tras retirar el bypass SSRF (403 por diseño); la guarda
   se prueba en `/_ape/luatest` + matriz offline.
6. **SSRF raíz:** se retira `if ngx.var.remote_addr == "127.0.0.1" then return true end` del
   allowlist. El host legítimo (`line.tivi-ott.net`) sigue permitido; los internos, no. Se conserva
   la defensa en profundidad del `default` (regex APE-SEC antes del include).
7. **Accept-Ranges:** se quita el `add_header` manual de `/lists/` (mentía en la ruta gunzip);
   el 206 gzip sigue emitiendo su propio `Accept-Ranges`. No se toca `gzip_static`/`gunzip`.

---

## 6 · Riesgos y límites

- **No aplicado**: smoke y rollback real quedan como gates del `--apply`; hoy solo hay dry-run y
  backup verificado.
- El `--apply` aborta si **cualquiera** de los 6 hashes vivos o `nginx -T` cambia (otra sesión,
  otro hotfix). En ese caso: re-componer y repetir el preflight; nunca aplicar contra otra base.
- `X-APE-Reason`/`X-APE-Attempts` se emiten en respuestas de **error** (no en el 200); el smoke
  usa una sonda deliberada. `attempts` del 200 está en `/_ape/metrics`/`ngx.ctx`.
- `/_ape/metrics` es **solo loopback**; el endpoint público `/ape/metrics` no existe (404).
- `luac5.1 -p` valida sintaxis, no semántica; la semántica de E7 está cubierta por sus 60
  aserciones (E7) y la simulación compuesta E11 (11/11); la de UHD por la matriz M1–M5.
- El caudal h2 medido en esta ventana (h1 1,30 MB/s) está afectado por jitter de red; el orden de
  magnitud coincide con E6 (h1 2,9–3,6; h2 0,42–0,50).

---

## 7 · Evidencia

| Artefacto | Ruta |
|---|---|
| Paquete + hashes | `_vps_stage/edge/E10_window/{staged/, build.json}` |
| Diffs | `_vps_stage/edge/E10_window/diffs/` |
| Preflight `--check` | `_vps_stage/edge/E10_window/runs/20261026T220744Z/apply_check.log` |
| Backup + rollback dry-run | `…/runs/20261026T220744Z/{backup_only.log, rollback_check.log}` |
| Matriz UHD | `…/runs/20261026T220744Z/uhd_matrix.log` |
| Caudal h1/h2 | `…/runs/20261026T220744Z/throughput_h1_vs_h2.log` |
| Backup point | `/root/backups/edge-e10-20261026T222426Z/` (7 hashes, 600) |
| Scripts | `scripts/{build_staged.mjs,apply_E10.sh,rollback_E10.sh,uhd_matrix_staged.lua,throughput_h1_vs_h2.mjs}` |
