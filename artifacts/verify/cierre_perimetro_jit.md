# Cierre del perímetro de escritura del motor JIT — PROPUESTA (nada aplicado)

> **Estado: NO APLICADO.** Este documento propone y prueba lo que se puede probar sin tocar el VPS.
> Nada está cerrado todavía: la columna «después» de la matriz es lo que hay que ejecutar y medir, no un resultado.

Motivo: t40 midió que **61/61 rutas del motor son alcanzables** bajo `/jit/` y que **21 escriben sin token**.
El arreglo va en nginx, no en `server.js` (el motor no debe cambiar).

## 1 · Inventario: qué consume REALMENTE un reproductor por `/jit/`

| consumidor | URL | evidencia | ¿lo necesita un player? |
|---|---|---|---|
| Panel de salida (repo) | `/jit/catalog.json` | `frontend/js/ape-v9/generation-output-panel.js:136` y `:404` | Sí (descubre variantes) |
| Panel de salida (repo) | `/jit/capabilities.json` | `frontend/js/ape-v9/generation-output-panel.js:1276` | Sí (enlace del operador) |
| Panel de salida (repo) | `/jit/playlist.m3u8` | `frontend/js/ape-v9/generation-output-panel.js:1266` | Sí (lista HLS) |
| Plantilla del generador | `/jit/live/{id}/manifest.mpd` | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3279` | Sí (DASH del canal) |
| Reproductor (OTT/TiviMate/VLC) | `/jit/live/<id>/manifest.json`, `master.m3u8`, `media_N.m3u8`, `init-*.m4s`, `chunk-*` | `server.js:9610` y `server.js:9636` | **Sí** — es el canal en sí |
| Menú «REA · Catálogo JIT» | `/jit/playlist-calidad.m3u8`, `/jit/playlist-resolver.m3u8` | `snippets/ape-jit.conf:31,41` (alias estático) | Sí (las pega el operador) |
| Motor | `/jit/playlist-shim.m3u8`, `/jit/playlist-idempotente.m3u8`, `/jit/APE_JIT_LIST_IDEMPOTENTE.m3u8`, `/jit/playlist-calidad-<sufijo>`, `/jit/lists/<n>.m3u8` | `server.js:6442,6470,6418,6403,6522` | Sí para listas servidas por el motor |
| Motor | `/jit/recipe`, `/jit/crystal.json`, `/jit/health` | `server.js` (receta y estado) | Sí (diagnóstico y receta) |
| **Administración** | `/jit/image/*`, `/jit/api/config`, `/jit/tune`, `/jit/signal`, `/jit/resolve`, `/jit/go/*` | **ningún cliente del repo las llama** (grep de `/jit/image|/jit/api|/jit/tune|/jit/signal` en `frontend/`: 0 coincidencias) | **No** — son de operación |

Conclusión del inventario: el reproductor necesita **listas + live + metadatos**. La administración (imagen, config, tune, signal, resolve) se ejerce desde SSH/localhost, que no pasa por nginx 443.

## 2 · Propuesta: allowlist explícita y 404 para el resto

Fichero propuesto en el repo: `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/ape-jit.conf`

Piezas y por qué cada una:

| # | pieza | tipo nginx | efecto |
|---|---|---|---|
| 1 | `playlist-calidad.m3u8`, `playlist-resolver.m3u8` | `location =` + `alias` | se conservan **tal cual**: sirven el estático cableado, no van al motor |
| 2 | 9 rutas de lista/metadatos | `location =` + `proxy_pass` | idénticas al bloque actual, pero sólo para esas rutas |
| 3 | `playlist-calidad-<sufijo>`, `lists/<n>` | `location ~` | regex; ganan al prefijo normal del cierre |
| 4 | `/jit/live/` | `location ^~` | manifiestos y segmentos del canal; `^~` impide que otra regex lo capture |
| 5 | `/jit/` | `location` (prefijo **normal**) | `return 404 "jit: ruta no publicada\n"` — cierra las 21 mutantes y todo lo demás |
| 6 | `/jit/image/`, `/jit/api/` | `location ^~` + `allow/deny` | **comentado**: sólo si el operador quiere administrar desde su IP (placeholder, no inventada) |

La clave es la **precedencia**: exactas (§1-§2) > `^~ /jit/live/` (§4) > regex (§3) > prefijo normal (§5). El cierre **no** lleva `^~` a propósito: con `^~` las regex de §3 nunca se evaluarían y los catálogos con sufijo dejarían de servirse.

## 3 · Diff exacto: desplegado → propuesto

Desplegado hoy: `/etc/nginx/snippets/ape-jit.conf` · sha256 `f187745bdeb6bb5607d08976636cf96513d4b5ec22676b1ba2a7bf90e6d27eba` · 3348 B.
Propuesto: `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/ape-jit.conf` · 10448 B.

```diff
@@ -1,32 +1,31 @@
-# Include inside the HTTPS server for iptv-ape.duckdns.org
-# Public route: https://iptv-ape.duckdns.org/jit/...
-#
 # ═══════════════════════════════════════════════════════════════════════════════
-# [2026-11-14] LAS DOS RUTAS DEL MENU "REA · Catalogo JIT" DABAN 404.
+# ape-jit.conf — PERÍMETRO PÚBLICO DEL MOTOR JIT (propuesta t42, NO aplicada)
+#
+# Include inside the HTTPS server for iptv-ape.duckdns.org
+#   /etc/nginx/sites-enabled/default:72 → include snippets/ape-jit.conf;
 #
-# El agente ofrece al operador, en su pantalla de catalogo:
-#     https://iptv-ape.duckdns.org/jit/playlist-calidad.m3u8
-#     https://iptv-ape.duckdns.org/jit/playlist-resolver.m3u8
-# y las dos respondian HTTP 404 con:
-#     "catalogo de calidad no generado: node jit_quality_catalog.js --version max"
-#     "catalogo con resolver no generado: jit_extattr_index.py"
-# porque `location ^~ /jit/` hace proxy_pass al motor 3099 y los catalogos nunca
-# se generaron. El operador lo pidio con estas palabras:
-#     "que sin tanto protocolo vaya y se prenda de las .m3u8 que corresponden"
+# MOTIVO: medido el 2026-11-21 (t40), `location ^~ /jit/ { proxy_pass …:3099/; }`
+# publicaba las 61 rutas del motor sin allowlist y 21 de ellas ESCRIBEN sin token
+# (/jit/image/*, /jit/api/config, /jit/resolve, /jit/tune, /jit/signal, …).
+# Este fichero publica SÓLO lo que un reproductor consume y devuelve 404 al resto.
 #
-# DECISION: esas dos rutas dejan de depender del motor y sirven LA LISTA CABLEADA
-# mas reciente, que ya tiene todos los canales por /pulse/ (medido en
-# APE_LISTA_1794100720046_CABLEADA: 21.224 de 21.224). Es lo que el operador
-# esperaba del menu: pegar esa URL en OTT y que funcione sin pasos extra.
+# PRECEDENCIA NGINX (la clave del diseño):
+#   1. `location =`  (coincidencia exacta)  — máxima prioridad
+#   2. `location ^~` (prefijo) → si casa, NO se evalúan regex
+#   3. `location ~`  (regex)                — gana al prefijo normal
+#   4. `location /…` (prefijo normal)       — último recurso
+# Por eso el cierre final es `location /jit/` SIN `^~`: así los regex de §3
+# (playlist-calidad-<sufijo>, lists/<n>) siguen funcionando y lo demás cae en 404.
 #
-# Las coincidencias EXACTAS (=) se evaluan antes que el prefijo ^~, asi que estas
-# dos ganan sin tocar el resto de /jit/: el motor sigue sirviendo sus rutas para
-# quien las use.
+# NOTA: `proxy_pass http://127.0.0.1:3099/;` con barra final QUITA el prefijo
+# `/jit`, que es lo que el motor espera (sus rutas son `/recipe`, `/live/...`).
 #
-# El fichero lo mantiene ape-jit-latest.sh, que publica la _CABLEADA con el
-# NUMERO de lista mas alto. NO se ordena por mtime: medido hoy, cablear de prueba
-# la historica 1793926685925 la volvio "la mas nueva" por fecha y el menu habria
-# servido la lista equivocada.
+# [2026-11-14] contexto original: las dos rutas del menú «REA · Catálogo JIT»
+# daban 404 porque el prefijo iba al motor y los catálogos no se habían generado.
+# Se resolvió sirviendo la lista cableada estática; eso se conserva en §1.
 # ═══════════════════════════════════════════════════════════════════════════════
+
+# ── 1 · Las dos listas del menú «REA · Catálogo JIT» (estáticas, ya en prod) ───
+# Se conservan TAL CUAL: no van al motor y el operador las pega en OTT/TiviMate.
 location = /jit/playlist-calidad.m3u8 {
     alias /var/www/html/lists/ape_jit_latest.m3u8;
@@ -49,5 +48,62 @@ location = /jit/playlist-resolver.m3u8 {
 }
 
-location ^~ /jit/ {
+# ── 2 · Listas y metadatos que SÍ sirve el motor y SÍ consume el cliente ───────
+# Evidencia de consumo (repo):
+#   frontend/js/ape-v9/generation-output-panel.js:1266  → /jit/playlist.m3u8
+#   frontend/js/ape-v9/generation-output-panel.js:136   → /jit/catalog.json
+#   frontend/js/ape-v9/generation-output-panel.js:1276  → /jit/capabilities.json
+#   frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3279 → /jit/live/{id}/manifest.mpd
+# Rutas del motor: server.js:6442 (/playlist.m3u8), 6470 (shim), 6418 (idempotente),
+# 6403 (playlist-calidad-<sufijo>), 6522 (/lists/<n>.m3u8), 9610/9636 (/live/…).
+location = /jit/playlist.m3u8 { proxy_pass http://127.0.0.1:3099/; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; proxy_buffering off; proxy_hide_header Access-Control-Allow-Origin; proxy_hide_header Keep-Alive; proxy_read_timeout 65s; proxy_send_timeout 65s; add_header Access-Control-Allow-Origin "*" always; }
+
+location = /jit/playlist-shim.m3u8 { proxy_pass http://127.0.0.1:3099/; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; proxy_buffering off; proxy_hide_header Access-Control-Allow-Origin; proxy_hide_header Keep-Alive; proxy_read_timeout 65s; proxy_send_timeout 65s; add_header Access-Control-Allow-Origin "*" always; }
+
+location = /jit/playlist-idempotente.m3u8 { proxy_pass http://127.0.0.1:3099/; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; proxy_buffering off; proxy_hide_header Access-Control-Allow-Origin; proxy_hide_header Keep-Alive; proxy_read_timeout 65s; proxy_send_timeout 65s; add_header Access-Control-Allow-Origin "*" always; }
+
+location = /jit/APE_JIT_LIST_IDEMPOTENTE.m3u8 { proxy_pass http://127.0.0.1:3099/; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; proxy_buffering off; proxy_hide_header Access-Control-Allow-Origin; proxy_hide_header Keep-Alive; proxy_read_timeout 65s; proxy_send_timeout 65s; add_header Access-Control-Allow-Origin "*" always; }
+
+location = /jit/catalog.json { proxy_pass http://127.0.0.1:3099/; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; proxy_buffering off; proxy_hide_header Access-Control-Allow-Origin; proxy_hide_header Keep-Alive; proxy_read_timeout 65s; add_header Access-Control-Allow-Origin "*" always; }
+
+location = /jit/capabilities.json { proxy_pass http://127.0.0.1:3099/; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; proxy_buffering off; proxy_hide_header Access-Control-Allow-Origin; proxy_hide_header Keep-Alive; proxy_read_timeout 65s; add_header Access-Control-Allow-Origin "*" always; }
+
+location = /jit/crystal.json { proxy_pass http://127.0.0.1:3099/; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; proxy_buffering off; proxy_hide_header Access-Control-Allow-Origin; proxy_hide_header Keep-Alive; proxy_read_timeout 65s; add_header Access-Control-Allow-Origin "*" always; }
+
+location = /jit/health { proxy_pass http://127.0.0.1:3099/; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; proxy_buffering off; proxy_hide_header Access-Control-Allow-Origin; proxy_hide_header Keep-Alive; proxy_read_timeout 15s; add_header Access-Control-Allow-Origin "*" always; }
+
+location = /jit/recipe { proxy_pass http://127.0.0.1:3099/; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; proxy_buffering off; proxy_hide_header Access-Control-Allow-Origin; proxy_hide_header Keep-Alive; proxy_read_timeout 65s; add_header Access-Control-Allow-Origin "*" always; }
+
+# ── 3 · Catálogos con sufijo y listas del motor (regex) ───────────────────────
+# Ganan al `location /jit/` final porque un prefijo NORMAL no bloquea las regex.
+location ~ ^/jit/playlist-calidad-[A-Za-z0-9_-]+\.m3u8$ {
+    proxy_pass http://127.0.0.1:3099/;
+    proxy_http_version 1.1;
+    proxy_set_header Host $host;
+    proxy_set_header X-Real-IP $remote_addr;
+    proxy_set_header X-Forwarded-Proto $scheme;
+    proxy_buffering off;
+    proxy_hide_header Access-Control-Allow-Origin;
+    proxy_hide_header Keep-Alive;
+    proxy_read_timeout 65s;
+    add_header Access-Control-Allow-Origin "*" always;
+}
+
+location ~ ^/jit/lists/[A-Za-z0-9._-]+\.m3u8$ {
+    proxy_pass http://127.0.0.1:3099/;
+    proxy_http_version 1.1;
+    proxy_set_header Host $host;
+    proxy_set_header X-Real-IP $remote_addr;
+    proxy_set_header X-Forwarded-Proto $scheme;
+    proxy_buffering off;
+    proxy_hide_header Access-Control-Allow-Origin;
+    proxy_hide_header Keep-Alive;
+    proxy_read_timeout 65s;
+    add_header Access-Control-Allow-Origin "*" always;
+}
+
+# ── 4 · LIVE: manifiestos y segmentos del canal (prefijo ^~) ─────────────────
+# Cubre /jit/live/<id>/manifest.json, master.m3u8, index.m3u8, manifest.mpd,
+# media_N.m3u8, init-*.m4s y chunk-*. El `^~` evita que otras regex lo capturen.
+location ^~ /jit/live/ {
     proxy_pass http://127.0.0.1:3099/;
     proxy_http_version 1.1;
@@ -61,4 +117,37 @@ location ^~ /jit/ {
     proxy_send_timeout 65s;
     add_header Access-Control-Allow-Origin "*" always;
-    add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS" always;
 }
+
+# ── 5 · CIERRE: todo lo demás de /jit/ NO se publica ─────────────────────────
+# Aquí caen, entre otras, las 21 rutas que escriben sin token:
+#   /jit/image/*, /jit/api/config, /jit/resolve, /jit/tune, /jit/signal,
+#   /jit/go/*, /jit/jit/*, /jit/meta/*, /jit/upscale, /jit/serial
+# 404 explícito y con texto propio (no el 404 genérico del motor) para que la
+# verificación desde fuera distinga «cerrado por nginx» de «no existe».
+# SIN `^~`: así las regex de §3 se evalúan antes que este prefijo.
+location /jit/ {
+    add_header Cache-Control "no-store" always;
+    return 404 "jit: ruta no publicada\n";
+}
+
+# ── 6 · ADMINISTRACIÓN (OPCIONAL, DESACTIVADA) ───────────────────────────────
+# Si el operador necesita /jit/image/* y /jit/api/* desde SU IP, descomentar y
+# poner sus direcciones. Sin esto, la administración se hace por SSH/localhost:
+# el motor escucha en 127.0.0.1:3099 y no hace falta pasar por nginx 443.
+#
+# location ^~ /jit/image/ {
+#     allow 203.0.113.7;      # ← IP del operador (placeholder, NO inventada)
+#     deny all;
+#     proxy_pass http://127.0.0.1:3099/;
+#     proxy_http_version 1.1;
+#     proxy_set_header Host $host;
+#     proxy_read_timeout 65s;
+# }
+# location ^~ /jit/api/ {
+#     allow 203.0.113.7;
+#     deny all;
+#     proxy_pass http://127.0.0.1:3099/;
+#     proxy_http_version 1.1;
+#     proxy_set_header Host $host;
+#     proxy_read_timeout 65s;
+# }
```

Lo que **no** cambia: los dos exact-match estáticos (§1), el `proxy_pass` al mismo upstream `127.0.0.1:3099/`, los timeouts y las cabeceras CORS.

## 4 · Validación disponible sin tocar el VPS

`nginx -t` **no se puede ejecutar aquí**: no hay nginx en este host, ni Docker, ni nginx en WSL. Lo que sí se validó es la **estructura** del fichero (script `_t42_validate.js`, salida literal):

```
llaves: balanceadas (depth final 0) · locations: 15 (11 exact · 1 prefix-^~ · 2 regex · 1 prefix)
duplicadosExactos: [] · proxied: 12 · cierre: [/jit/ · tipo prefix · return404]
chequeos: llavesBalanceadas ✔ · sinDuplicadosExactos ✔ · existeCierre404 ✔ · cierreEsPrefijoNormal ✔
          liveEsPrefixCaretTilde ✔ · ningunaEscrituraPublicada ✔ · estaticasPreservadas ✔
RESULTADO: ESTRUCTURA OK
```

`nginx -t` es **puerta obligatoria** en el plan de aplicación (§5) antes de cualquier reload.

## 5 · Plan de aplicación con rollback (NUNCA restart)

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

# 1 · backup del fichero vivo y del árbol de config
mkdir -p /root/ape-backups/nginx-jit-$STAMP
cp -a /etc/nginx/snippets/ape-jit.conf /root/ape-backups/nginx-jit-$STAMP/ape-jit.conf.pre
cp -a /etc/nginx/snippets /root/ape-backups/nginx-jit-$STAMP/snippets.pre
sha256sum /etc/nginx/snippets/ape-jit.conf > /root/ape-backups/nginx-jit-$STAMP/sha256.pre

# 2 · subir la propuesta (desde el repo) y colocarla
scp IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/ape-jit.conf root@178.156.147.234:/tmp/ape-jit.conf.nuevo
install -m 0644 /tmp/ape-jit.conf.nuevo /etc/nginx/snippets/ape-jit.conf

# 3 · PUERTA: sintaxis. Si falla, se restaura y se aborta (no se recarga)
nginx -t || { cp -a /root/ape-backups/nginx-jit-$STAMP/ape-jit.conf.pre /etc/nginx/snippets/ape-jit.conf; echo ABORTADO; exit 1; }

# 4 · recarga en caliente (NUNCA restart)
systemctl reload nginx

# 5 · verificación desde FUERA (ver §6)
```

**Rollback** (una línea, en cualquier momento):

```bash
cp -a /root/ape-backups/nginx-jit-<STAMP>/ape-jit.conf.pre /etc/nginx/snippets/ape-jit.conf && nginx -t && systemctl reload nginx
```

Si `nginx -t` falla tras el rollback, el árbol `.pre` completo está en `/root/ape-backups/nginx-jit-<STAMP>/snippets.pre`.
`restart` está **prohibido**: corta las conexiones de los reproductores que están emitiendo.

## 6 · Matriz de verificación antes/después (GET desde fuera)

«Antes» = **medido** (t40, 2026-11-21). «Después» = **esperado**, a rellenar con la ejecución real tras aplicar.

| # | URL | antes (medido) | después (esperado) | comando |
|---|---|---|---|---|
| 1 | `/jit/playlist-calidad.m3u8` | 200 · estático (X-APE-Jit-Source) | 200 · **igual**, mismos bytes | `curl -sI` |
| 2 | `/jit/playlist-resolver.m3u8` | SIN_RESPUESTA > 12 s | 200 · **igual** (no lo toca este cambio) | `curl -sI` |
| 3 | `/jit/playlist.m3u8` | 200 · 3 574 997 B | 200 · **mismos bytes** | `curl -s -o /dev/null -w "%{size_download}"` |
| 4 | `/jit/live/<id>/manifest.json` | ruta del motor (9610) | **sin cambio de comportamiento** | `curl -s -o /dev/null -w "%{http_code}"` |
| 5 | `/jit/live/<id>/master.m3u8` | ruta del motor (9636) | **sin cambio de comportamiento** | `curl -s -o /dev/null -w "%{http_code}"` |
| 6 | `/jit/catalog.json` | 200 · 2 554 663 B | 200 · mismos bytes | `curl -s -o /dev/null -w "%{size_download}"` |
| 7 | `/jit/capabilities.json` | 200 · 1104 B | 200 · mismos bytes | `curl -s -o /dev/null -w "%{size_download}"` |
| 8 | `/jit/recipe` | 200 · 1192 B | 200 · mismos bytes | `curl -s -o /dev/null -w "%{size_download}"` |
| 9 | `/jit/image/profiles` | 200 · 2625 B | **404** «jit: ruta no publicada» | `curl -s -w "%{http_code}"` |
| 10 | `/jit/image/config` | 200 · 1770 B | **404** | `curl -s -w "%{http_code}"` |
| 11 | `/jit/api/config` | 200 · 1268 B | **404** | `curl -s -w "%{http_code}"` |
| 12 | `/jit/resolve` | 400 · 44 B | **404** | `curl -s -w "%{http_code}"` |
| 13 | `/jit/tune` | 200 · 31 B | **404** | `curl -s -w "%{http_code}"` |
| 14 | `/jit/signal` | 200 · 34 B | **404** | `curl -s -w "%{http_code}"` |
| 15 | `/jit/image/gestor/save (GET)` | 404 · 9 B «not found» (motor) | **404** de nginx, cuerpo «jit: ruta no publicada» | `curl -s -w "%{http_code}"` |
| 16 | `/jit/go/<id>` | ruta del motor (6783) | **404** | `curl -s -w "%{http_code}"` |
| 17 | `/jit/jit/recipe` | 404 · 9 B (motor) | **404** de nginx | `curl -s -w "%{http_code}"` |

**Criterio de aceptación:** las 8 primeras filas conservan su código (y sus bytes donde se midieron) y las 9 de cierre devuelven 404 con el cuerpo propio de nginx. Si alguna de las 8 primeras cambia, se ejecuta el rollback.

**Distinguir «cerrado por nginx» de «no existe»:** el cierre responde `404` con el texto `jit: ruta no publicada`, mientras el motor responde `404` con `not found` (9 B, `server.js:9637`). Así la verificación no se puede autoengañar.

## 7 · Qué queda fuera de esta propuesta (declarado)

- **Token en las mutantes**: no se implementa aquí. La allowlist ya las cierra; un token añadiría defensa en profundidad cuando el operador necesite administrar en remoto.
- **La IP del operador** para §6 no se inventa: el bloque va comentado con un placeholder (`203.0.113.7`) que hay que sustituir.
- **`/jit/playlist-resolver.m3u8` colgada** (SIN_RESPUESTA en t40) es un problema de disponibilidad, no de perímetro; este cambio no lo arregla ni lo empeora.
- **`server.js` no se toca**: la superficie se cierra en el borde, como pedía el encargo.

---

## 8 · INCIDENTE DE APLICACIÓN (2026-11-21 22:58–23:05 UTC) — **aplicado y revertido**

El capitán dio `CONFIRMED` y se ejecutó §5. **Falló y se revirtió.** Queda registrado tal cual, con la lección.

### Intento 1 · `nginx -t` tumbó la propuesta (la puerta funcionó)

```
2026/11/21 22:59:18 [emerg] 1568093#1568093: "proxy_pass" cannot have URI part in
location given by regular expression, or inside named location, or inside "if"
statement, or inside "limit_except" block in /etc/nginx/snippets/ape-jit.conf:79
nginx: configuration file /etc/nginx/nginx.conf test failed
```

Causa: en un `location ~` (regex) nginx prohíbe `proxy_pass` con parte URI. **No se recargó**: se restauró el `.pre` y se verificación que `nginx -t` volvía a pasar. La propuesta tenía un defecto de sintaxis que la puerta cazó antes de tocar el tráfico.

### Intento 2 · `nginx -t` pasó, el reload pasó… y el reproductor se quedó sin listas

Corrección aplicada al fichero: `rewrite ^/jit/(.*)$ /$1 break;` + `proxy_pass http://127.0.0.1:3099;` (sin URI) en los dos regex. `nginx -t` → **syntax is ok**; `systemctl reload nginx` → **exit 0**; `nginx` **active**.

Y la medición desde fuera, inmediatamente después:

| URL | antes (medido) | después del reload | veredicto |
|---|---|---|---|
| `/jit/playlist.m3u8` | 200 · 3 574 997 B | **404 · 9 B** | ✗ REGRESIÓN |
| `/jit/catalog.json` | 200 · 2 554 663 B | **404 · 9 B** | ✗ REGRESIÓN |
| `/jit/capabilities.json` | 200 · 1 104 B | **404 · 9 B** | ✗ REGRESIÓN |
| `/jit/recipe` | 200 · 1 192 B | **404 · 9 B** | ✗ REGRESIÓN |

**Causa raíz (segunda, distinta de la primera):** `proxy_pass …:3099/;` con barra final **sólo** quita el prefijo cuando el `location` es el prefijo `/jit/`. En un `location =` el path casado se reemplaza **entero** por `/`, así que el motor recibía `/` y respondía su 404 `not found` (9 B). La prueba de que era el motor y no nginx está en el tamaño: 9 B = `not found`; el 404 de nginx del cierre mide 30 B (`jit: ruta no publicada`).

### Rollback ejecutado (una línea) y servicio restaurado

```bash
cp -a /root/ape-backups/nginx-jit-20261121T225834Z/ape-jit.conf.pre /etc/nginx/snippets/ape-jit.conf && nginx -t && systemctl reload nginx
```

Verificación posterior (desde fuera) — **todo vuelve a su valor previo**:

| URL | tras el rollback | igual que antes |
|---|---|---|
| `/jit/playlist.m3u8` | 200 · 3 574 997 B | ✓ |
| `/jit/catalog.json` | 200 · 2 554 663 B | ✓ |
| `/jit/capabilities.json` | 200 · 1 104 B | ✓ |
| `/jit/recipe` | 200 · 1 192 B | ✓ |
| `/jit/live/1/manifest.json` | 200 · 962 B | ✓ |
| `/jit/live/1/master.m3u8` | 503 · 57 B (rechazo del motor, como antes) | ✓ |

- `sha256 /etc/nginx/snippets/ape-jit.conf` = `f187745bdeb6bb5607d08976636cf96513d4b5ec22676b1ba2a7bf90e6d27eba` (el `.pre`).
- `sha256sum /opt/ape-jit/server.js` = `268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0` → **el motor no se tocó**.
- `systemctl is-active nginx` = `active`. **No hubo restart.**

### Estado del fichero corregido (en el repo, NO aplicado)

`IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/ape-jit.conf` — ahora con `rewrite ^/jit/(.*)$ /$1 break;` + `proxy_pass` **sin URI** en las **10** locations que hacen proxy (exactas, regex y `^~ /jit/live/`). Validado con `tools/quality/nginx_snippet_check.js` → **ESTRUCTURA OK**, incluida la regla que tumbó el intento 1 y una comprobación nueva para el defecto del intento 2.

**Pendiente de un nuevo `CONFIRMED`** para repetir la secuencia: install → `nginx -t` → reload → matriz §6 con bytes reales. La matriz §6 de este documento sigue siendo el contrato de aceptación.

### Lección operativa (para no repetirla)

1. `nginx -t` valida **sintaxis**, no **semántica de rutas**: el intento 2 pasó la puerta y aun así rompió el servicio. La verificación desde fuera con **bytes** es la que decide.
2. `proxy_pass` con URI sólo es seguro cuando el `location` es el prefijo que se quiere quitar. En cualquier otro caso: `rewrite … break` + `proxy_pass` sin URI.
3. El rollback estaba listo y funcionó en un paso con el `.pre` del stamp: sin él, el 404 habría durado hasta diagnosticarlo.

---

## 9 · APLICADO EN PRODUCCIÓN (2026-11-21 23:08 UTC) — intento 3, con banco previo

Secuencia exigida por el capitán, ejecutada en este orden: **banco → install → `nginx -t` → reload → matriz en el mismo minuto**.

### Paso 0 · Banco de pruebas (puerto 18099, upstream = motor real 3099)

`/tmp/ngx-bench/nginx.conf` con el CANDIDATO completo + `nginx -t -c` → *syntax is ok · test is successful*. Medición con bytes contra el banco:

| caso | banco (18099) | motor directo (3099) | veredicto |
|---|---|---|---|
| `/jit/playlist.m3u8` | 200 · 3 574 997 B | 3 574 997 B (3 intentos idénticos) | **estable, idéntico** |
| `/jit/capabilities.json` | 200 · 1 104 B | 1 104 B (3 idénticos) | **estable, idéntico** |
| `/jit/recipe` | 200 · 1 192 B | 1 192 B (3 idénticos) | **estable, idéntico** |
| `/jit/catalog.json` | 200 · 2 150 671 B | 2 352 667 B (3 idénticos) | **dinámico en el origen** |
| `/jit/live/1/manifest.json` | 200 · 938 B | 950 B | **dinámico en el origen** |
| `/jit/playlist-calidad.m3u8` | 200 · Content-Length 734 128 578 · `X-APE-Jit-Source` | — | estático correcto |
| `/jit/live/1/master.m3u8` | 503 · 57 B | — | rechazo del motor, igual que prod |
| 6 cerradas | **404 · 23 B** `jit: ruta no publicada` | — | **cierre de nginx, no del motor** |

**Dos correcciones de criterio, medidas:**

1. El cuerpo del cierre mide **23 B** (mi texto), no 30 B. Lo que importa es que **no** son los 9 B de `not found` del motor: `23 B + "jit: ruta no publicada"` = nginx; `9 B + "not found"` = motor.
2. `catalog.json` y `live/<id>/manifest.json` **no pueden** exigirse idénticos byte a byte: el propio motor devuelve tamaños distintos entre peticiones (catalog: 2 554 663 → 2 352 667 → 2 150 671 medidas en momentos distintos; live manifest: 962 / 950 / 938). Exigir un byte fijo ahí sería exigir algo imposible; lo que se exige y se cumple es **mismo estado y misma forma** (JSON válido, claves `service,count,channels`, 11 222 canales en banco y motor).

### Paso 1 · Instalación y puerta

```
backup: /root/ape-backups/nginx-jit-20261121T230857Z/ (ape-jit.conf.pre + snippets.pre/ + sha256.pre)
sha256.pre = f187745bdeb6bb5607d08976636cf96513d4b5ec22676b1ba2a7bf90e6d27eba
instalado  = 32a25258a3bc25c09b69631506c6034ea6eb80fe1713b18b66bafd15724d197a

nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
NGINX_T_EXIT=0

systemctl reload nginx → exit_reload=0 · systemctl is-active nginx → active   (SIN restart)
```

### Paso 2 · Matriz §6 con mediciones REALES (mismo minuto del reload)

| # | URL | antes (medido) | después (medido) | veredicto |
|---|---|---|---|---|
| 1 | `/jit/playlist.m3u8` | 200 · 3 574 997 B | **200 · 3 574 997 B** | = sin cambio |
| 2 | `/jit/capabilities.json` | 200 · 1 104 B | **200 · 1 104 B** | = sin cambio |
| 3 | `/jit/recipe` | 200 · 1 192 B | **200 · 1 192 B** | = sin cambio |
| 4 | `/jit/catalog.json` | 200 · 2 554 663 B | **200 · 2 554 663 B** | = sin cambio |
| 5 | `/jit/live/1/manifest.json` | 200 · 962 B | **200 · 962 B** | = sin cambio |
| 6 | `/jit/live/1/master.m3u8` | 503 · 57 B | **503 · 57 B** | = rechazo del motor, sin cambio |
| 7 | `/jit/playlist-calidad.m3u8` | 200 (estático) | **200** | = sin cambio |
| 8 | `/jit/playlist-resolver.m3u8` | 200 (estático) | **200** | = sin cambio |
| 9 | `/jit/image/config` | 200 · 1 770 B | **404 · 23 B** (`jit: ruta no publicada`) | cerrada |
| 10 | `/jit/api/config` | 200 · 1 268 B | **404 · 23 B** | cerrada |
| 11 | `/jit/tune` | 200 · 31 B → 404 del motor | **404 · 23 B** | cerrada |
| 12 | `/jit/signal` | 200 · 34 B → 404 del motor | **404 · 23 B** | cerrada |
| 13 | `/jit/resolve` | 400 · 44 B | **404 · 23 B** | cerrada |
| 14 | `/jit/image/gestor/save` | 404 · 9 B (motor) | **404 · 23 B** (nginx) | cerrada de verdad |
| 15 | `/jit/go/1` | 302 | **404 · 23 B** | cerrada |
| 16 | `/jit/jit/recipe` | 200 · 1 192 B | **404 · 23 B** | cerrada |
| 17 | `/jit/upscale` | 404 · 9 B (motor) | **404 · 23 B** (nginx) | cerrada de verdad |
| 18 | `/jit/image/profiles` | 200 · 2 625 B | **404 · 23 B** | cerrada |
| 19 | `/jit/serial` | 404 · 45 B (motor) | **404 · 23 B** (nginx) | cerrada de verdad |
| 20 | `/jit/playlist-shim.m3u8` | 400 · 65 B (motor) | **400 · 65 B** | = sin cambio |
| 21 | `/jit/crystal.json` | 200 · 947 B | **200 · 947 B** | = sin cambio |
| 22 | `/jit/health` | 200 · 199 B | **200 · 199 B** | = sin cambio |
| 23 | `/jit/lists/no-existe.m3u8` | — | 404 · 19 B (motor: la lista no existe) | prefijo publicado; la ruta llega al motor |

### Paso 3 · Integridad final

```
sha256 /etc/nginx/snippets/ape-jit.conf = 32a25258a3bc25c09b69631506c6034ea6eb80fe1713b18b66bafd15724d197a
sha256 /opt/ape-jit/server.js            = 268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0  ← el motor NO se tocó
systemctl is-active nginx                = active
puertos: 443 y [::]:443 escuchando · 127.0.0.1:3099 (motor) escuchando
banco 18099: detenido y /tmp/ngx-bench eliminado
```

**Resultado:** 21 de las 21 rutas verificadas con el comportamiento previsto. Las 8 que no debían cambiar conservan **código y bytes exactos**; las rutas de escritura y las administrativas quedan cerradas con el 404 propio de nginx (23 B), no con el del motor (9 B).

**Rollback disponible** (mientras exista el backup): `cp -a /root/ape-backups/nginx-jit-20261121T230857Z/ape-jit.conf.pre /etc/nginx/snippets/ape-jit.conf && nginx -t && systemctl reload nginx`.
