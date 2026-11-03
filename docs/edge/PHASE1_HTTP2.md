# E2 · FASE 1 — HTTP/2 EN 443 (nginx 1.24) — 2026-10-26

> **Estado:** APLICADO y VERIFICADO en producción · **rollback probado de verdad** (OFF→ON).
> **Ventana:** anunciada en `COORDENADAS_SESIONES.md` §4 para `2026-10-26T20:52Z`; aplicada a las **20:53:22Z**
> tras un **re-base** (la base cambió a las 20:48:45Z por un hotfix ajeno; ver §1).
> **Cambio:** `listen 443 ssl …` → `listen 443 ssl http2 …` en los 2 listeners (IPv4 + IPv6) de
> `/etc/nginx/sites-enabled/default`. **Nada más.**
> **Backup pre-cambio:** `/root/backups/edge-e1-20261026T205255Z/` (`default` = `e2ba4684…`, 7.816 B).
> **Smoke del capitán:** PASS (SSRF `/cdn/127.0.0.1…` → 403; `.ts` bajo `/cdn/` → 404; lista y canal real → h2 200).
> **Referencia de comparación:** [`BASELINE.md`](BASELINE.md) (run `20261026T202041Z`, h2 NO negociado).
> **Run post:** `_vps_stage/edge/baseline/runs/20261026T205347Z/` · **Evidencia:** `_vps_stage/edge/phase1/runs/20261026T205255Z/`.

---

## 1 · Cambio exacto y re-base

```diff
--- /etc/nginx/sites-enabled/default (base e2ba4684…, 7.816 B)
+++ /etc/nginx/sites-enabled/default (post 49c162a8…, 7.828 B)
@@ -23,8 +23,8 @@
 server {
-    listen 443 ssl default_server;
-    listen [::]:443 ssl default_server;
+    listen 443 ssl http2 default_server;
+    listen [::]:443 ssl http2 default_server;
     server_name iptv-ape.duckdns.org 178.156.147.234;
```

- La **ventana** se anunció a las 20:35Z para 20:52Z (17 min de margen).
- A las **20:48:45Z**, otra sesión del equipo aplicó un hotfix sobre el mismo fichero
  (SSRF `/cdn/`→403 hosts internos, `.ts/.m4s/mp4` bajo `/cdn/`→404, ver `DEPLOY_LOG.md`).
  El script de FASE 1 **abortó solo** al detectar que el sha ya no era el del backup.
- **Re-base:** backup nuevo `20261026T205255Z` (incluye esos bloqueos), `--check` con diff exacto
  (solo las 2 líneas `listen`), y aplicación. **Cero bytes ajenos modificados.**

## 2 · Aplicación (evidencia)

| Comprobación | Resultado |
|---|---|
| `nginx -t` antes / después | OK / OK |
| `systemctl reload nginx` (nunca restart) | OK · `MainPID=2001835` (sin cambio) · `NRestarts=0` |
| sha256 `default` pre → post | `e2ba4684…` (7.816 B) → **`49c162a8…`** (7.828 B) |
| `nginx -T` sha256 pre → post | `cb02e8b7…` → **`0c6c0ea0…`** |
| listeners efectivos | `listen 443 ssl http2 default_server;` ×2 (IPv4+IPv6) |
| ALPN (`openssl s_client -alpn h2`) | **`ALPN protocol: h2`** |
| error.log tras el reload | **sin menciones HTTP/2** |

Log: `runs/20261026T205255Z/apply.log`.

## 3 · Verificación funcional (lista + 3 manifiestos, h2 y h1)

**En el VPS (curl 8.5.0 + nghttp2):**

| Endpoint | h2 (3 muestras) | h1 (1 muestra) |
|---|---|---|
| Lista `/lists/APE_LISTA_4K.m3u8` (HEAD) | **2 200** · 26,7 / 33,3 / 34,0 ms | **1.1 200** · 42,4/34,3/32,6 ms |
| Lista + `Accept-Encoding: gzip` (HEAD) | **2 200** · 40,5 ms | — |
| Canal 3 `/cdn/…/3.m3u8` | **2 200** · 866/808/737 ms · upstream 840/777/710 ms · 644 B | **1.1 200** · 1.289 ms |
| Canal 5 `/cdn/…/5.m3u8` | **2 200** · 736/743/747 ms · upstream 705/705/716 ms · 637/636 B | **1.1 200** · 750 ms |
| Canal 6 `/cdn/…/6.m3u8` | **2 200** · 679/790/686 ms · upstream 646/757/644 ms · 646 B | **1.1 200** · 684 ms |
| Lista h1 después de todo | — | **1.1 200** · 32,0 ms |

- Los 3 canales devuelven **200 por h2 y 200 por h1**; el cuerpo rota (playlist viva) y el
  `X-APE-Upstream-Ms` (646–840 ms) sigue siendo el coste dominante.
- La única muestra h1 del canal 3 (1.289 ms) es una **conexión fría**; no es comparable con las h2
  (cada una conexión nueva pero con distinto momento del proveedor). **No se declara mejora de latencia.**
- Log: `runs/20261026T205255Z/verify.log`.

**Smoke obligatorio del capitán (post-reload, `runs/20261026T205255Z/smoke_post_reload.log`):**

| Prueba | Esperado | Medido |
|---|---|---|
| `GET /cdn/127.0.0.1:8088/_ape/health` | 403 | **403** |
| `GET /cdn/line.tivi-ott.net/x.ts` | 404 | **404** |
| `GET /lists/APE_LISTA_4K.m3u8` | 200 | **h2 200** |
| Canal real 3 `/cdn/line.tivi-ott.net/live/…/3.m3u8` | 200 | **h2 200** (642 B, `X-APE-Upstream-Ms: 797`) |
| ALPN | h2 | **h2** |
| Orden de bloques APE-SEC vs include | APE-SEC **antes** | líneas **34/39** (SSRF/video) < **43** (`include snippets/ape-meta-public.conf`); `upload.php` en 77 |

El diff de FASE 1 solo toca las 2 líneas `listen` (líneas 26–27), **no mueve el include ni los bloques
APE-SEC**: el smoke confirma que la SSRF sigue cerrada (403) y el vídeo bajo `/cdn/` sigue bloqueado (404).

**Desde el cliente (arnés fijo):** `http2.connect` → **OK 200 · ttfb 183,5 ms**; ALPN `h2`;
`curl(VPS) --http2` → **2**; `curl(VPS) --http1.1` → **1.1**.

## 4 · Comparativa contra baseline (mismos parámetros)

| Métrica | Baseline `20261026T202041Z` (sin h2) | Post `20261026T205347Z` (con h2) | Δ |
|---|---:|---:|---:|
| Lista h1 conexión nueva p50 | 427,5 ms | 439,6 ms | +12,1 |
| Lista h1 conexión nueva p95 | 747,4 ms | 827,9 ms | +80,5 |
| Lista h1 keep-alive p50 (HEAD) | 110,6 ms | 171,1 ms | +60,5* |
| HTTP/2 estricto (Node) | NO NEGOCIADO | **OK 200** | — |
| ALPN | http/1.1 | **h2** | — |
| `curl(VPS) --http2` | 1.1 | **2** | — |
| `curl(VPS) --http1.1` | 1.1 | 1.1 | sin cambio |
| `/cdn/` ch3/5/6 cliente p50 | 1.083,5 / 1.159,6 / 1.136,2 ms | 1.172,5 / 1.296,6 / 972,2 ms | varianza proveedor |
| `/cdn/` ch3/5/6 upstream p50 | 704 / 732 / 750 ms | 859 / 816 / 673 ms | varianza proveedor |
| Doble hop 443→8088 p50 | 0,1 ms | 0,0 ms | — |
| `nginx -t` / MainPID / NRestarts | OK / 2001835 / 0 | OK / 2001835 / 0 | sin cambio |

\* **La subida de keep-alive es ruido de red, no regresión de HTTP/2.** Re-medición dedicada
después del cambio (10 muestras, misma conexión): **p50 95,4 ms** (min 90,7, max 385,5; 9/10
reutilizadas). `ping` al VPS en la misma ventana: **min 94 ms, media 161 ms, max 398 ms** ⇒ el
camino Bogotá↔Ashburn tiene jitter de hasta 4×. La muestra del arnés (171,1 ms) cayó en un pico.
Evidencia: `runs/20261026T205255Z/keepalive_probe2.log`.

**Aceptación automática** (`compare_phase1.mjs`): **PASS 10/10** — h2 negociado, ALPN h2,
`curl --http2=2`, h1 sigue funcionando, 3 canales 200, `nginx -t` OK, MainPID estable,
`NRestarts` sin cambios. Log: `runs/20261026T205255Z/compare.log`.

## 5 · Rollback probado de verdad (OFF → ON)

1. `rollback_phase1.sh 20261026T205255Z --apply` (20:55:35Z) → restaura `e2ba4684…` (7.816 B),
   `nginx -t` OK, reload.
2. Verificación: `ALPN protocol: http/1.1`; `curl --http2` → **1.1 200**; h1 → 1.1 200;
   `nginx -t` OK; `MainPID=2001835`. Log: `runs/20261026T205255Z/rollback_verify.log`.
3. Re-aplicación (20:55:48Z) → `49c162a8…`, `2 200`, `nginx -T` `0c6c0ea0…`; estado final = **h2 ON**.
   Logs: `apply_reapply.log`, `final_verify.log`.

Comando de rollback (una línea):

```bash
ssh root@178.156.147.234 'bash -s' -- 20261026T205255Z --apply \
  < _vps_stage/edge/phase1/rollback_phase1.sh
```

> El backup `20261026T205255Z` es **pre-FASE-1 pero post-seguridad** (incluye SSRF/video/upload.php).
> No usar el backup `20261026T201548Z`/`203255Z` para rollback de producción: son anteriores a los
> bloqueos de seguridad.

## 6 · Límites y honestidad

1. **HTTP/2 no reduce el fetch al proveedor** (646–897 ms), que es el 60–70 % del TTFB del manifiesto.
   El beneficio real de h2 es **economía de conexiones y multiplexación** para clientes que piden
   varios recursos en paralelo; eso **no se midió** aquí a propósito (haría N peticiones simultáneas
   al proveedor con `max_connections=1`).
2. La comparación h2 vs h1 por petición suelta está dominada por TLS/frío/varianza del proveedor.
   No se declara “mejora de latencia”; se declara **protocolo disponible y h1 intacto**.
3. Los contadores de `/_ape/health` **no son comparables** entre baseline y post: otra sesión
   eliminó el breaker de 15 s (`ape_gateway.lua` `66a20017…` → `2dc0fad8…`, 20:49Z) y ejecutó
   pruebas SSRF/breaker que inflaron `requests`/`all_failed` (91→755 y 24→131). La fase 1 no toca
   esos contadores; el delta del arnés fue **+52 req / +0 fallos** (incluye tráfico externo).
   El capitán midió tras quitar el breaker: **1,15 % de fallos** (+174 peticiones / +2 fallos), lo
   que confirma que la tasa de fallos anterior (13,9 %) era del breaker, no del transporte.
4. nginx 1.24 exige `http2` **como parámetro de `listen`**. En nginx ≥1.25.1 está deprecado y pasa
   a directiva `http2 on;` — anotado para una futura actualización, **no aplicable hoy**.
5. La lista se comprobó por h2 con **HEAD** (no se descargan 140 MB); el cuerpo h2 se validó en los
   3 manifiestos `/cdn/` (GET reales, 636–644 B).

## 7 · Reproducción

```bash
# aplicar (idempotente; aborta si la base cambió)
ssh root@178.156.147.234 'STAMP=20261026T205255Z bash -s' \
  < _vps_stage/edge/phase1/apply_phase1_http2.sh
# verificar h2/h1 en el VPS
ssh root@178.156.147.234 'bash -s' < _vps_stage/edge/phase1/verify_phase1_http2.sh
# re-medir y comparar
node _vps_stage/edge/baseline/baseline_edge.mjs --label "E2-FASE1-http2"
node _vps_stage/edge/phase1/compare_phase1.mjs \
  _vps_stage/edge/baseline/runs/20261026T202041Z/baseline.json \
  _vps_stage/edge/baseline/runs/<STAMP_POST>/baseline.json
```

## 8 · Artefactos

| Artefacto | Ruta | sha256 |
|---|---|---|
| Aplicar (idempotente, `--check`) | `_vps_stage/edge/phase1/apply_phase1_http2.sh` | `fdc6c48a340041eaa4e42bd1e4ce39b7e90afddfd254474e7795b6b1f40d792c` |
| Verificar h2/h1 | `_vps_stage/edge/phase1/verify_phase1_http2.sh` | `9284a18bd88f7d3a5096a5f6184e2b447ed3016fa63aa1d71fb03c42f52b2de9` |
| Rollback (dry-run por defecto) | `_vps_stage/edge/phase1/rollback_phase1.sh` | `b918179e65828b25b316e571d54886ac885f8a96fcd48ec85b3ab81b20ff6f5f` |
| Comparador | `_vps_stage/edge/phase1/compare_phase1.mjs` | `6e601d860a4c71f7e5934e02363830d5cb164877055811cb04e71235c7354fa1` |
| Logs (apply/verify/rollback/compare) | `_vps_stage/edge/phase1/runs/20261026T205255Z/` | — |
| Run post del arnés | `_vps_stage/edge/baseline/runs/20261026T205347Z/` | — |
