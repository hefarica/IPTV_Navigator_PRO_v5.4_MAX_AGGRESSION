# DEPLOY LOG — capa edge (VPS 178.156.147.234)

Registro append-only de cambios aplicados en producción desde la sesión VPS.
Cada entrada: hora UTC, fichero, hashes, comando, verificación y rollback.

---

## 2026-10-26T20:22:56Z — HOTFIX de seguridad: `upload.php` sin auth (list poisoning)

**Origen:** hallazgo E8-§10 de la auditoría del Resolver (tarea E8, t8 del equipo `edge-fluidez`).

**Vulnerabilidad confirmada por el capitán (lectura + verificación):**
- `POST /upload.php` acepta subida sin autenticación: `'auth_token' => ''` en línea 23 y
  `if (empty($config['auth_token']))` en línea 58 ⇒ la comprobación se satisface con el token vacío.
- El destino de escritura es **`/var/www/lists/`** (`upload.php:17`), con `move_uploaded_file()` en `:198`
  y `copy()` a `versions/` en `:251` ⇒ un tercero podía **sobrescribir la lista servida**.
- **0 peticiones en 7 días** (`grep -c upload.php /var/log/nginx/access.log` = 0): no hay consumidor vivo.

**Cambio aplicado (nginx, reversible):**

```nginx
# en /etc/nginx/sites-enabled/default, JUSTO ANTES de `location ~ \.php$`
location = /upload.php { return 403; }
```

**Fichero:** `/etc/nginx/sites-enabled/default`
| | sha256 |
|---|---|
| antes | `58bee1cb7b911bc1b40ebab65003d1cdfcfa8a7c6f03dc5e0acbdd77b38a4f96` |
| después | `715465641c7e97ff…` |

**Aplicación:** `nginx -t` → `successful` → `systemctl reload nginx` (nunca restart).

**Verificación (SNI real con `--resolve iptv-ape.duckdns.org:443:127.0.0.1`):**

| Petición | Antes | Después |
|---|---|---|
| `GET /upload.php` | 405 | **403** |
| `POST /upload.php` (multipart) | 400 (sin auth, habría escrito) | **403** |
| `GET /lists/APE_LISTA_4K.m3u8` (range) | 200 | **200** |
| `GET /resolve.php?ch=1&p=P3` | 200 | **200** (intacto a propósito) |
| `GET /test.ts` (plano público) | 404 | **404** |

`nginx` active · `MainPID 2001835` sin cambios (reload, no restart).

**Rollback:** `cp -a /root/backups/default.bak_20261026T202256Z /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx`.

**Nota de excepción:** se aplicó sin la ventana de 15 min de §4 porque es una corrección de
seguridad sobre un endpoint sin consumidores; el anuncio se registró en §2 en cuanto se aplicó.

---

## DECISIÓN RAZONADA — qué NO se bloqueó y por qué

### `resolve.php` / `resolve_quality*.php` (S1 del auditor: oráculo de credenciales + `ACCESS-CONTROL-ALLOW-ORIGIN: *`)

**NO se bloquean.** La decisión se tomó con evidencia, no por prudencia:

| Llamador real | Fichero:línea |
|---|---|
| Panel de monitor | `frontend/js/ape-monitor-panel-v15.js:31` → `https://iptv-ape.duckdns.org/resolve_quality.php?action=providers` |
| Wrapper M3U8 API | `frontend/js/m3u8-api-wrapper-integrated.js:1230` → `'/resolve_quality_unified.php'` o `'/resolve.php'` |

Bloquear por `location =` habría dejado sin servicio esos dos módulos. El CORS `*` existe
precisamente para esa llamada desde el navegador.

**Consecuencia honesta:** S1 sigue **abierto**. Es deuda de diseño, no de configuración:
- el arreglo correcto es **auth de sesión o firma en el generador**, con CORS acotado al origen de la app;
- eso exige tocar `resolve.php` y el frontend — **no es esta capa** (aquí no se despliega PHP).

**Coste medido:** `resolve.php` sirve 8.609 B con `user:pass` en el path; sin `auth_basic`, sin
`limit_req`, sin `fail2ban`. Cualquiera con la URL puede pedir el fragmento.

### Otros endpoints anti-SSOT (`/lists/resolve.php`, `resolve_quality_v5.php`, `resolve_quality_unified_LIVE.php`)

Mismo criterio: no se tocan desde aquí. `resolve_quality_v5.php` está hardcodeado a un host y
`_LIVE.php` devuelve 0 B. Recomendación para el dueño de esa capa: retirarlos, no bloquearlos por nginx.

---

## Correcciones al plan que salieron de E8 (aplicadas al diseño de las fases)

1. **El Resolver no está en el camino vivo**: las 3 listas de `/var/www/lists` tienen **0 referencias**
   a `resolve*.php` y **0 `srv=`**. El camino real es lista → `/cdn/<proveedor>/<canal>.m3u8` → Lua → CDN del proveedor.
2. **El SSOT real es `/var/www/html/resolve.php` (42.620 B, `31e13a03…`)** y **no tiene gemelo byte a byte en el repo**.
   Prohibido «desplegar para alinear»: rige el fichero servido.
3. **La cache del 302 es del plano `/cdn/` (Lua), no del Resolver**: no debe enrutar PHP por `:8088`.
4. **`nginx-live-current.conf` del repo NO está desplegado** (incluye `resolver_cache 30 s`): no citarlo ni restaurarlo.
---

## 2026-10-26T20:49:57Z — HOTFIX: SSRF + `.ts` sombreado (nginx) y ELIMINACIÓN DEL BREAKER (Lua)

### A) SSRF en `/cdn/` — CERRADO

`ape_gateway.lua:51` salta el allowlist si `remote_addr == "127.0.0.1"`, y el 443 llega al 8088 desde loopback sin `real_ip`.
Medido en público: `GET /cdn/127.0.0.1:8088/_ape/health` → **200 + JSON interno** (`X-APE-CDN: 127.0.0.1:8088`).

Bloqueo: `location ~ ^/cdn/(127\.|0\.0\.0\.0|localhost|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|\[::1\]) { return 403; }`
**Debe ir ANTES de `include snippets/ape-meta-public.conf;`** porque el snippet define `location ~ ^/cdn/(?<ape_host>...)` y las regex se evalúan por orden de aparición. El primer intento, colocado después, no tuvo efecto (seguía 200).

### B) `.ts|.m4s|.mp4` por `/cdn/` — CERRADO

Medido: `/meta/...x.ts` → 404 text/html, pero `/cdn/...x.ts` → **200** (vídeo por el VPS, corrupto por el rebase). Violaba el invariante "el player nunca pide vídeo al VPS".
Bloqueo: `location ~ ^/cdn/.*\.(ts|m4s|mp4)$ { return 404; }` (también antes del include).

### C) BREAKER de 15 s — ELIMINADO

Causa del 18–23 % de fallos de manifiesto. Código vivo líneas 168–179: `down:<host>` con TTL 15 s; armado devuelve **502 all_upstreams_failed con `ms:0`** (no intenta, sin reason).
Prueba de que el proveedor estaba bien: petición directa desde el VPS → **302 en 510 ms**; tras esperar 20 s (TTL), el mismo canal por `/cdn/` → **200 / 644 B**.

Cambio (2 líneas): `if not (HOSTS and HOSTS:get(dk))` → `if true`; `HOSTS:set(dk, 1, 15)` → comentado. Telemetría `qinc` intacta.

### Verificación

| Prueba | Antes | Después |
|---|---|---|
| 6 peticiones seguidas, canal real | 502 ms:0 | **6/6 = 200** (upstream 694–1785 ms) |
| Ruta inválida | 502 ms:0 sin reason | 502 con reason `http_513`, ms 316 |
| SSRF loopback | 200 + JSON interno | **403** |
| `.ts` por /cdn/ | 200 | **404** |
| lista / upload.php | 200 / 403 | 200 / 403 (intactos) |

`luac -p` OK · `nginx -t` OK · reload (PID 2001835, sin restart).

### Hashes y rollback

| Fichero | antes | después | backup |
|---|---|---|---|
| `sites-enabled/default` | `715465641c7e97ff` | `e2ba46846175729b` | `/root/backups/default.bak_20261026T202256Z` (pre-security) |
| `lua/ape_gateway.lua` | `66a2001730d7e2b5` | `2dc0fad86f45f4ac` | `/root/backups/ape_gateway.lua.bak_20261026T204957Z` |

Rollback del breaker: restaurar solo el `.lua` + `luac -p` + `nginx -t` + reload. El backup de `default` es previo a los bloqueos de seguridad: restaurarlo reabriría SSRF y upload.php.

---

## 2026-10-26T20:53:22Z — FASE 1: HTTP/2 en 443 (t2 · edge-sre)

**Cambio:** `http2` como parámetro de los 2 `listen …443 ssl` de `/etc/nginx/sites-enabled/default` (nginx 1.24: `listen 443 ssl http2 …`). Nada más: no se toca `gzip_static/gunzip`, `/lists/`, `/cdn/`, `/ape/health`, TLS, timeouts ni Lua/PHP.

**Base / re-base:** la ventana se anunció para `20:52Z`; a las **20:48:45Z** otra sesión aplicó el SSRF/`.ts→404` sobre el mismo fichero. El script de FASE 1 **abortó solo** (sha distinto) y se re-basó: backup nuevo `20261026T205255Z` (incluye esos bloqueos), `--check` con diff exacto (solo las 2 líneas `listen`), sin tocar bytes ajenos.

| Fichero | antes | después | backup |
|---|---|---|---|
| `sites-enabled/default` | `e2ba46846175729b…` (7.816 B) | `49c162a862f1e548…` (7.828 B) | `/root/backups/edge-e1-20261026T205255Z/` |
| `nginx -T` | `cb02e8b7…` | `0c6c0ea0…` | ídem (`nginx-T.conf`) |

**Aplicación:** `nginx -t` OK → `systemctl reload nginx` (PID 2001835, sin restart; `NRestarts=0`).
**Verificación:** ALPN `h2`; lista y canales 3/5/6 `/cdn/` → `2 200`; h1 → `1.1 200`; error.log sin HTTP/2. Detalle, límites y comparativa: `docs/edge/PHASE1_HTTP2.md` · logs en `_vps_stage/edge/phase1/runs/20261026T205255Z/`.
**Smoke post-reload (capitán):** `/cdn/127.0.0.1:8088/_ape/health` → **403**; `/cdn/…x.ts` → **404**; lista → **h2 200**; canal real 3 → **h2 200**; APE-SEC (líneas 34/39) siguen **antes** del include (línea 43). Ningún byte ajeno movido.
**Rollback probado de verdad:** `rollback_phase1.sh 20261026T205255Z --apply` → h2 OFF (ALPN 1.1, `curl --http2`=1.1) + `nginx -t` + reload; re-aplicado a las 20:55:48Z y verificado ON.
**Nota:** los backups `20261026T201548Z`/`203255Z` son **anteriores** a los bloqueos de seguridad; para producción usar solo el de `205255Z`.

---

## 2026-10-26T22:26Z — E10 · VENTANA COMPUESTA (E7 + SSRF + Accept-Ranges + UHD) — **estado: preparado** (NO aplicado)

**Por qué no se aplica:** falta la **confirmación explícita del propietario**. El contrato de E10 admite el estado
`preparado`; `apply_E10.sh --apply` exige `OWNER_CONFIRMED=1` y sin ella solo funcionan `--check`/`--backup-only`.
**Ningún fichero de producción se ha tocado**: los hashes vivos siguen siendo los de abajo y `nginx -t` sigue OK.

**Paquete (11 ficheros):** E7 observabilidad (5 Lua nuevos + `ape_obs` compuesto + `50-ape-meta-plane.conf`), retirada
del bypass SSRF (`remote_addr == "127.0.0.1"`), guard UHD E5 (`ape_uhd` + `ape_gateway` + `ape_luatest`) y fix
`Accept-Ranges` en `/lists/` (`sites-enabled/default`). Solo cambios medidos; no toca `/var/www/lists`, `/lists/`,
`gzip_static/gunzip`, `.ts→404`, `resolve.php`, `ngx.exit(503)` ni circuit breakers.

| Fichero | antes (vivo) | después (staged) |
|---|---|---|
| `lua/ape_gateway.lua` | `2dc0fad86f45f4ac…` | `eadd87d1d9fa88cd…` |
| `lua/ape_obs.lua` | `f477741bcfa600bb…` | `ed7d2adf0fdaf091…` |
| `lua/ape_uhd.lua` | `f1f5eb674744858a…` | `88d974275653fb1c…` |
| `lua/ape_luatest.lua` | `98a29c444f1bca0f…` | `301f35927e8dbbe0…` |
| `sites-enabled/default` | `49c162a862f1e548…` | `2ebe7ff316baa93c…` |
| `conf.d/50-ape-meta-plane.conf` | `3e29b9280c05de36…` | `33bbeb6b9e6dbe1d…` |
| 5 Lua nuevos E7 | — | `d960f23a…`, `180ca51a…`, `831f309e…`, `737f1700…`, `eb5af49b…` |

**Preflight (read-only, OK):** hashes vivos pineados, `SHA256SUMS` del staged (11), `luac5.1 -p` ×9, `nginx -t` del
paquete sobre árbol copia, APE-SEC l.34/39 antes del include l.43, breaker neutralizado, sin `HOSTS:set(dk,1,15)`,
`X-APE-Reason`/`-Attempts`, `ngx.ctx.ape_dec`, `uhd.can_declare_8k`, matriz UHD M1–M5 PASS, caudal h1 1,30 vs
h2-default 0,48 MB/s, backup de rollback verificado.

**Ventana propuesta:** `2026-10-26T22:50Z` (anuncio §4 con >15 min de margen), **condicionada a la confirmación
explícita**. Otra sesión no ha tocado nginx desde `21:59:30Z` (último reload E9).

**Rollback:** `rollback_E10.sh <STAMP> --apply` restaura los 6 ficheros desde `/root/backups/edge-e10-<STAMP>/`,
elimina los 5 Lua nuevos, `luac -p`, `nginx -t`, reload y smoke. Backpoint ya creado y verificado:
`/root/backups/edge-e10-20261026T222426Z/` (7 hashes, 600); dry-run del rollback: OK. El backup es **post-seguridad**
(SSRF/vídeo/upload.php incluidos).

**Decisiones:** caché del 302 **OFF** (TTL 30–60 s rechazado; TTL 3 s opcional no aprobado); bomba de tokens
**rechazada**; micro-caché **no** (E6 NO-GO); HTTP/2 **se conserva** (riesgo de caudal con ventana pequeña
documentado, sin tocar la negociación); UHD 8K solo con `uhd8k=1` + fuente ≥3840 + nivel ≥L183, CODECS intacto.

**Evidencia:** `_vps_stage/edge/E10_window/PLAN.md`, `diffs/`, `staged/`, `runs/20261026T220744Z/`.
**Aplicación:** pendiente de `OWNER_CONFIRMED=1`; mientras tanto, `estado: preparado`.
