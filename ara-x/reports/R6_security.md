# R6 · Seguridad, headers y cumplimiento — ARA-X

Fecha: 2026-10-30 · Scope: `ara-x/**` + superficie VPS **medida en solo-lectura** · Autor: `security-auditor` (S10)
Estado: **revisión cerrada con requisitos verificables para D3**. No se desplegó, no se recargó nginx, no se
escribió en el VPS y **no se imprimió ni copió ningún secreto**.

> Regla de este informe: los valores sensibles **no se reproducen**. Se publican únicamente longitudes,
> booleanos, modos de archivo, conteos y hashes de artefactos públicos. `ARA_TOKEN` se midió por longitud,
> `ape_attr.key` por forma (hex/longitud/modo), y las URLs de la lista por conteos y formas enmascaradas.

---

## 0. Veredicto

| Ámbito | Veredicto | Condición |
|---|---|---|
| **D3 staged** (contrato + PHP/nginx sin desplegar) | **GO** | Implementar **todos** los `R6-D3-*` de §4 y los tests de §6. |
| **Producción / deploy de ARA-X** | **NO-GO todavía** | Cerrar **F-01** (CORS `*` en `/lists/`), **F-02** (cache pública), **F-03/F-04** (`/a/` anti-abuso y rotación) y demostrar los gates de `/sync` en ventana. |
| **Playback actual** | **Sin bloqueo por rate-limit** | Hoy no hay `limit_req` en `/lists/` ni en segmentos; no introducirlo en D3. |
| **Credenciales en URLs de la lista** | **0 encontradas** | 0 `user:pass@`, 0 `username=`/`password=` y 0 URLs Xtream en las 10.631 URLs de canal de ambos catálogos. La lista sigue siendo **confidencial** (infraestructura, IDs, 584.705 URLs `/a/`). |

---

## 1. Método y límites

- **VPS**: lectura por SSH (`id`, `ls`, `stat`, `grep`, `nginx -T` ya capturado, `curl -I` contra loopback con
  `--resolve`). Cero escrituras, cero reload/restart.
- **Catálogos**: análisis local por streaming de `ara-x/evidence/APE_LISTA_4K_live_20261030_full.m3u8`
  (572.170.477 B) y `APE_LISTA_CDN_1793397700248_full.m3u8` (568 MB), sin volcar líneas.
- **Código**: `ara-x/vps/**`, `ara-x/tests/**`, `_vps_stage/lua/ape_attr.lua`, configuración nginx viva
  (`/etc/nginx/**`), `events-sse.php` y `prisma-ara-events.conf`.
- **NO-RUN**: no se ejecutó HMAC real contra `/a/` (la clave no se lee), no se hizo fuzzing, no se probó
  `/sync` (no existe), no se ejecutó `php -l` local (PHP no instalado) ni `nginx -t` (sin ventana).

---

## 2. Estado medido (2026-10-30)

### 2.1 Endpoints y cabeceras

| Endpoint | Medición | Relevancia |
|---|---|---|
| `HEAD /lists/APE_LISTA_4K.m3u8` | `HTTP/2 200`; `content-type: application/vnd.apple.mpegurl`; `access-control-allow-origin: *`; `access-control-allow-methods: GET, HEAD, OPTIONS`; `access-control-allow-headers: Range, DNT, User-Agent, X-Requested-With, If-Modified-Since, Cache-Control, Content-Type, Accept-Encoding`; `access-control-expose-headers: Content-Length, Content-Range, ETag, Last-Modified, Content-Encoding` | **CORS wildcard en lista pública** (F-01) |
| idem | `cache-control: max-age=300` **y** `cache-control: public, max-age=300`; `expires`; `etag`; `last-modified`; `vary: Accept-Encoding`; `server: nginx` | Cache pública + cabecera duplicada (F-02) |
| `OPTIONS /lists/APE_LISTA_4K.m3u8` | `HTTP/2 403` con las mismas cabeceras CORS | El preflight está roto a la vez que el GET es wildcard |
| `HEAD /a/` | `HTTP/2 200`; `content-type: text/plain; charset=us-ascii`; `cache-control: no-store` (duplicada); `x-ape-a: stale:hmac_ausente` + `x-ape-a: endpoint` | Handler fail-open vivo; **sin rate-limit** (F-03) |
| `POST /a/cfg` desde el edge público | `403` | Correcto: `/a/cfg` no está expuesto |
| `GET /sync` | `404` (146 B, `text/html`) | No existe todavía; D3 lo crea staged |
| `GET /ara/events` sin auth | `401` | Bearer obligatorio |
| `GET /ara/events?token=probe` | `401` | **No acepta token por query** |
| `GET /health` | `200` | — |

### 2.2 Secretos y autenticación

| Elemento | Medición (sin valor) | Evaluación |
|---|---|---|
| `ARA_TOKEN` | Presente en `env[ARA_TOKEN]` de `www.conf`; **longitud 48**; `www.conf` modo `640 root:root`; `APE_LAB_MODE` **ausente** | ✅ ≥32; sin bypass LAB; no se leyó el valor |
| `APE_ENROLL_SECRET` | Presente en `env[APE_ENROLL_SECRET]`; **longitud 48** | ✅; no es clave de `/sync` |
| `events-sse.php` | `getenv('ARA_TOKEN')`, `hash_equals`, regex `^Bearer\s+`, 503 si vacío, sin `?token=` | ✅ auth correcta |
| `ape_attr.key` | Archivo regular, **64 caracteres hex** (65 B con newline), modo `600 www-data:www-data`, fuera de `/var/www/html`; sin copias en webroot | ✅ clave 256-bit fuera del repo/webroot; no se copió ni se hasheó |
| `ape_attr.lua` (vivo) | 31.210 B, `644 root:root`; lee la clave en runtime y la cachea | Revisar rotación (F-04) |
| `.env` en webroot | `…/backend_v15/.env`: modo `644 root:root`, **`404` por nginx** (regex `.env$`); `.env.example` responde `200` (placeholder) | Defensa en profundidad insuficiente (F-05) |
| 80→443 | El 80 redirige salvo dos rutas; `/sync` no existe en HTTP | D3 debe publicar solo por 443 |

### 2.3 Rate-limit, cache y logs

| Control | Medición | Evaluación |
|---|---|---|
| `limit_req` | **0 usos**; solo están definidas zonas `ape_match` (120 r/m) y `ape_pull` (30 r/m) | No hay límites en playback; D3 debe añadir **solo** `/sync` |
| `limit_conn` | Único uso: `prisma_stream_per_ip 4` en `= /ara/events` | SSE acotado; no toca `/lists/` ni segmentos |
| `/a/` | Sin `limit_req` ni `limit_conn`; `access_log off`; HMAC en Lua puro | Riesgo de CPU por URLs públicas (F-03) |
| `/lists/` | Sin `limit_req`/`limit_conn` | Autopista intacta; no agregar límites aquí |
| `log_format` | `$remote_addr $upstream_cache_status [$time_iso8601] "$request" $status $body_bytes_sent $request_time`; sin body ni headers | ✅ no filtra `Authorization` ni `X-ARA-Sig` |
| `playlist_access.log` | `640 www-data:adm`; logrotate diario, `rotate 14`, `compress`, `create 0640` | Retención 14 días; `/sync` debe minimizar IP/body |
| HSTS | **Ausente** | Decisión del owner; no bloquea players nativos |
| `robots.txt` | `404` | Añadir `X-Robots-Tag` a `/lists/` (F-02) |

### 2.4 Catálogos: credenciales y headers tóxicos

| Métrica | `APE_LISTA_4K` | `APE_LISTA_CDN` |
|---|---:|---:|
| Líneas totales | 10.169.562 | 10.139.240 |
| `#EXTINF` / URLs de canal | 10.631 / 10.631 | 10.631 / 10.631 |
| URLs de canal que apuntan al VPS | **10.631 (1 host, 6 segmentos, 0 query)** | **10.631 (1 host)** |
| `user:pass@` en URLs de canal | **0** | **0** |
| `username=` / `password=` en URLs | **0 / 0** | **0 / 0** |
| URLs Xtream de 3 segmentos + id en canal | **0** | **0** |
| `#EXTHTTP` | 10.631 objetos JSON, 2.089.513 claves, máx. 203 por canal | 10.631, 2.089.513 claves |
| `Range` / `If-None-Match` / `If-Modified-Since` / `TE` / `Priority` / `Upgrade-Insecure-Requests` **como claves EXTHTTP** | **0 / 0 / 0 / 0 / 0 / 0** | **0 / 0 / 0 / 0 / 0 / 0** |
| `Authorization` / `Proxy-Authorization` / `Cookie` en EXTHTTP | **0 / 0 / 0** | **0 / 0 / 0** |
| `tvg-logo` | 10.312; 2 hosts; 0 `user:pass@`; 0 query; 0 cola numérica; 84 formas de par distintas | 10.312; 0 `user:pass@` |
| Líneas de tag con URL | 74.102; 0 `user:pass@` | — |

**Explicación del falso positivo:** una búsqueda laxa de `If-None-Match` devuelve 10.631 coincidencias porque
cada canal emite la etiqueta inerte `#EXT-X-APE-BBR-HIJACK-USE-IF-NONE-MATCH` (10.631 apariciones; las dos
muestras inspeccionadas tienen valor `false`). **No es una cabecera EXTHTTP**; el gate real (solo claves JSON
de `#EXTHTTP`) da **0**.

**Sobre user/pass en la lista:** no se encontró evidencia de credenciales en las URLs de canal de los dos
catálogos. Quedan 257 coincidencias de un patrón laxo en `#EXTINF` que corresponden a rutas de `tvg-logo`
del CDN de logos (sin userinfo, sin query, sin cola numérica); no se reproducen sus valores. **Residual
unknown:** segmentos opacos de esas rutas podrían ser IDs de CDN; no hay evidencia de `user:pass`.

**Implicación:** la lista no es “libre de secretos”: expone 10.631 canales, el host de un proveedor en una
etiqueta global, 584.705 URLs `/a/` firmadas y la estructura del catálogo. Debe tratarse como **artefacto
confidencial** aunque no contenga credenciales de proveedor.

### 2.5 Superficie de secretos de `ara-x/**` y reportes

| Comprobación | Resultado |
|---|---|
| `ara-x/evidence/*.m3u8` | 7 archivos, ~2,7 GB; **gitignored** por `ara-x/.gitignore`; no están en `git ls-files` |
| `git ls-files ara-x` | **0** (todo `ara-x/` está untracked hoy) |
| Escaneo de 14 `.md`/`.json` de `ara-x/**` | 0 URLs con `user:pass@`; 0 claves/tokens reales |
| `ara-x/tests/*.test.js` | 2 asignaciones de `secret` con el fixture **`ara-x-test-secret`** (test-only, no producción) |
| `V2_e2e_baseline.json` | `sampleUrls` enmascaradas (`https://iptv-ape.duckdns.org/…P/N.m3u8`); sin query ni path completo |
| `r1_analyze.js` / `r1_sample.js` | Enmascaran segmentos de path ≥6 chars; **los segmentos cortos quedan crudos** → posible fuga en reportes R1 |
| `sync_request.schema.json` | `additionalProperties:false` en todos los objetos; sin campos URL; body ≤16 KB |
| `sync_response.schema.json` | `additionalProperties:false`; pero `ref.list_version`, `ref.lab_exported_at`, `profile.reason`, `controls.flags`, `device.soc` son strings libres |
| `mock_sync_server.js` | Test-only: **no** guarda historial de nonces (resetea el Set), **no** tiene idempotencia, **no** tiene rate-limit ni valida `Content-Type` |

---

## 3. Hallazgos

| ID | Sev. | Hallazgo | Evidencia | Corrección exigida | Verificación |
|---|---|---|---|---|---|
| **F-01** | **HIGH** | `Access-Control-Allow-Origin: *` en `/lists/*.m3u8` público: cualquier página web puede leer el catálogo completo (10.631 canales, URLs `/a/` firmadas, host de proveedor). No se encontraron user/pass en las URLs de canal, por eso no es CRITICAL. | HEAD 200 sin auth + ACAO `*` + ACAM/ACAH/ACAE (Methods/Headers/Expose-Headers); `OPTIONS` 403 | Quitar ACAO/ACAM/ACAH/ACAE de `/lists/`, `.m3u8` y `location /`; si el frontend web necesita CORS, allowlist explícita con `Vary: Origin`. Players nativos no usan CORS. | `curl -skI …/lists/…` sin `access-control-allow-origin`; `grep -R 'Access-Control-Allow-Origin "\*"' /etc/nginx` = 0 en playback |
| **F-02** | **MEDIUM** | Cache pública en lista confidencial + cabecera `Cache-Control` duplicada (`max-age=300` y `public, max-age=300`) + sin `X-Robots-Tag`. | HEAD; `expires 5m` + `add_header` | `add_header Cache-Control "private, max-age=300" always;` una sola; quitar `expires`; añadir `X-Robots-Tag "noindex, nofollow"`; `Vary: Accept-Encoding` se conserva. | HEAD: exactamente una `cache-control`, sin `public`; `x-robots-tag` presente |
| **F-03** | **MEDIUM** | `/a/` es público, sin rate-limit, con HMAC-SHA256 en **Lua puro** por request y 584.705 URLs conocidas en la lista. Un cliente puede saturar CPU del VPS y degradar playback (autopista). | `grep limit_req` = 0; `/a/` `content_by_lua_file`; 584.705 `#EXTATTRFROMURL` | Añadir `limit_req` de techo alto **solo** en `/a/` (p. ej. `rate=20r/s burst=40` por IP) + contador/observabilidad; nunca tocar `/lists/` ni segmentos; probar que un player normal (zapping) no recibe 429. | Prueba de carga staged; `curl` normal < 429; `/lists/` y `.ts` sin límite |
| **F-04** | **MEDIUM** | La URL `/a/2/...` no tiene expiración ni nonce de servidor: es una capacidad reutilizable. Además la misma clave firma las 584.705 URLs de la lista: **rotarla invalida todas** hasta regenerar la lista; no hay `key_id`/doble clave. | `ape_attr.lua` canónico `2 / c / s / p / payload`; `/a/` HMAC 16 B; lista con 584.705 URLs | Documentar y automatizar rotación: `key_id`/versión, aceptar clave anterior en ventana, regenerar lista atómicamente, o añadir `exp` si algún día se habilita `D0`/URL delta. No rotar sin plan. | Test de vectores con clave vieja/nueva; checklist de rotación; regeneración E2E 10.631 |
| **F-05** | **MEDIUM** | Hay un `.env` real en webroot (`644 root:root`), hoy bloqueado solo por regex de sufijos `.ini/.log/.sql/.bak/.env`; `.env.local`/`.env.production` no coinciden y podrían servirse. | `find` de dotfiles; `curl` `.env` = 404, `.env.example` = 200 | Mover secretos fuera de `/var/www/html` o añadir `location ~ /\.` → `deny all` (excepto `.well-known`); `chmod 600`. | `curl` `.env`, `.env.local`, `.env.production` = 404; `grep` dotfile deny |
| **F-06** | **MEDIUM** | El mock `/sync` del baseline no modela nonce histórico, idempotencia, `Content-Type`, ni rate-limit. Si D3 copia esa semántica, un replay con `seq` mayor pasa. | `mock_sync_server.js` L195-222: `nonces: new Set([payload.nonce])` | Implementar `R6-D3-REPLAY-*` en el endpoint real y tests nuevos; no reutilizar el mock como especificación de seguridad. | Tests de replay/idempotencia/rate de §6 |
| **F-07** | **LOW** | `/ara/events` usa `device_id` en query (queda en access log 14 días); no hay HSTS; `robots.txt` 404. | `events-sse.php` L32; `log_format`; HEAD sin HSTS | Mover `device_id` a header o aceptar y documentar; HSTS decisión del owner; `X-Robots-Tag` en listas. | Revisión de logs; HEAD |
| **F-08** | **LOW** | `r1_analyze.js`/`r1_sample.js` dejan segmentos cortos de path sin enmascarar; un reporte R1 podría publicar un valor corto que sea credencial/ID. | `hostOnly`/`MASK`: solo `<6 chars` se conservan | Enmascarar **todos** los segmentos (o hash) y no imprimir valores de tags con URL; gate de secretos sobre `ara-x/reports/**`. | Fixtures con `u:p` de 1-5 chars no aparecen en salida |
| **F-09** | **LOW** | Comparación HMAC de `/a/` no es constant-time (`h ~= esperado`); truncado a 16 B (aceptable). | `ape_attr.lua` `M.verify` | Comparación XOR acumulada/constante; mantener 16 B; no cambiar el contrato sin vectores. | Test de vectores HMAC; revisión de código |
| **F-10** | **INFO** | **0 headers tóxicos** en EXTHTTP de ambos catálogos (los 6 nombres); la etiqueta `#EXT-X-APE-BBR-HIJACK-USE-IF-NONE-MATCH` (10.631 apariciones; muestras `false`) es inerte y explica el falso positivo. | Escaneo JSON de 10.631 EXTHTTP × 2 listas | No introducir ninguno en D3; gate en generador/VPS. Renombrar la etiqueta si se quiere evitar confusión futura. | `grep` de los 6 nombres sobre EXTHTTP = 0 |
| **F-11** | **INFO** | **0 user/pass medidos** en URLs de canal de ambos catálogos; 10.631 URLs apuntan al VPS; logos sin userinfo/query. La lista sigue revelando infraestructura y 584.705 URLs `/a/`. | §2.4 | Tratar la lista como confidencial; no publicar muestras con path completo; no añadir credenciales en D3. | Escaneo de lista; revisión de reportes |
| **F-12** | **INFO** | Controles correctos ya presentes: `ARA_TOKEN` 48, sin LAB bypass, Bearer/`hash_equals`, `/a/cfg` 403 público, `ape_attr.key` 600 fuera de webroot, playback sin `limit_req`, `proxy_pass_request_headers off` en el plano de metadata. | §2.2, §2.3 | Preservarlos en D3; no “optimizar” quitando auth ni añadiendo límites al playback. | Regresión de §2 |

---

## 4. Requisitos verificables para D3

D3 = contrato `/sync` + cliente de referencia + PHP/nginx **staged** (sin deploy). Los requisitos son
acumulativos con `ARA_X_SYNC_PROTOCOL.md`; si hay conflicto, **este documento manda en seguridad**.

### 4.1 Autenticación / HMAC / claves

| ID | Requisito | Verificación |
|---|---|---|
| **R6-D3-AUTH-01** | Clave **por dispositivo** (`key_id` → secret ≥32 B aleatorios). `ARA_TOKEN` y `APE_ENROLL_SECRET` **no** son claves HMAC de `/sync`; sin fallback `Authorization: Bearer`. `key_id` desconocido → 401 genérico. | Test unitario: mapa key_id; `ARA_TOKEN` como secret → 401; `Bearer` solo → 401 |
| **R6-D3-AUTH-02** | Canónico exacto, sin re-serializar: `ARA-X-SYNC-V1\n{device_id}\n{seq}\n{ts}\n{nonce}\n{sha256_hex(raw_body)}`. `X-ARA-Sig` = HMAC-SHA256 hex **64 lowercase**; comparación constant-time; `X-ARA-Sync-Version: 1` obligatorio. | Vectores de `sync_contract.test.js` (request/respuesta) + rechazo de mayúsculas/espacios |
| **R6-D3-AUTH-03** | Leer el body crudo con límite **16.384 B** antes de parsear; `Content-Type: application/json` (charset opcional) o **415**; body grande **413**; JSON inválido **400**. `client_max_body_size 16k`. | Tests 413/415/400; `curl` con 16.385 B |
| **R6-D3-AUTH-04** | Nada de auth en URL/query: `?token=`, `?sig=`, `?key=` se ignoran/rechazan; sin secretos en respuesta/errores; sin `Set-Cookie`; sin redirects. | `curl` con query → 401; inspección de respuesta |
| **R6-D3-AUTH-05** | Claves del servidor en archivo `0600` fuera del webroot (o `LoadCredential`), nunca en repo/logs/DB en claro; `device_id` ligado a su clave (una clave no sirve para otro device). | `stat`; `grep` de secretos; test de key→device mismatch → 401 |
| **R6-D3-AUTH-06** | Rotación: `key_id` nuevo, clave anterior aceptada **24 h**, registro de `created_at/retires_at`; `/sync` sigue respondiendo durante la ventana. | Test con dos claves simultáneas |
| **R6-D3-AUTH-07** | Errores 401 uniformes (mismo cuerpo/tiempo) para clave desconocida y firma mala; sin enumerar `key_id`; rate-limit también en 401 (evita oráculo). | Test de comparación de respuestas |
| **R6-D3-AUTH-08** | Sin “modo abierto”: si el store de claves por dispositivo está vacío o el enrolamiento (B2/B3) no está listo, `/sync` responde 401/503, nunca 200 con política. El canary `shadow` solo calcula y loguea; no sirve política sin HMAC. | Test store vacío → 503/401; shadow no devuelve policy |

### 4.2 Replay-window, secuencia e idempotencia

| ID | Requisito | Verificación |
|---|---|---|
| **R6-D3-REPLAY-01** | `ts` entero Unix; skew **±300 s**; futuro > +300 y pasado < −300 → **401**; reloj del servidor como autoridad. | Tests de borde ±300/±301 |
| **R6-D3-REPLAY-02** | `nonce` 16–64 hex lowercase; **single-use por device** durante ≥600 s; reuso con distinto `(seq, body_hash)` → **409** (el reintento idéntico se resuelve por REPLAY-04); guardar solo `sha256(nonce)`, no el nonce crudo. | Test: mismo nonce con `seq+1` → 409; dos devices mismo nonce → OK |
| **R6-D3-REPLAY-03** | `seq` monótono estricto por device; `seq <= last_seq` sin resultado cacheado → **409**; se permiten huecos (pérdida de respuestas) pero no retroceso. | Tests seq igual/menor/mayor con hueco |
| **R6-D3-REPLAY-04** | **Idempotencia**: cachear `(device_id, seq)` + `body_sha256` + respuesta firmada durante **≥120 s** (vida de la política) y ≤600 s. Reintento idéntico (mismo body/nonce/seq) dentro de la vida → **200 con el mismo body y `X-ARA-Sig`** (cabecera `X-ARA-Idempotent: 1`, no firmada). Mismo `seq` con body distinto → **409**. Reintento con cache expirado → **409** (el cliente re-enrola/resetea `seq`, no reintenta en bucle). | Test: enviar, cortar respuesta, reintentar dentro de 120 s → 200 idéntico; mutar body → 409; reintentar tras 120 s → 409 |
| **R6-D3-REPLAY-05** | Estado en SQLite transaccional (`BEGIN IMMEDIATE`), tablas `ara_sync_state`, `ara_sync_replay`, `ara_sync_nonce`; purga por `expires_at` (replay ≥120 s, nonce 600 s); tope de filas por device (p. ej. 256) para evitar DoS de estado; DB `0600` fuera de webroot. | Revisión de schema + test de purga y tope |
| **R6-D3-REPLAY-06** | El cliente persiste `seq`/nonce **antes** de enviar; en timeout/5xx reintenta el **mismo** request (no incrementa `seq`); solo incrementa tras 200/204 verificado. `204` solo se aplica si viene firmado o se ignora; nunca cambia política sin verificación. | Test de cliente con red caída; respuesta 204 sin firma → no aplica |
| **R6-D3-REPLAY-07** | El cliente verifica frescura de la **respuesta** antes de aplicar: `resp_ts` dentro de ±300 s de su reloj, `valid_until > now` y `valid_until ≤ resp_ts+120`; una respuesta vieja reenviada por un MITM se descarta aunque la firma sea válida. | Test con respuesta firmada antigua → no aplica |
| **R6-D3-REPLAY-08** | La respuesta debe traer el mismo `device_id` y `seq` del request; `policy.ts` del servidor no puede ser futuro >30 s; si no coincide, se descarta. | Test device/seq mismatch → no aplica |

### 4.3 Anti-SSRF y robustez de entrada

| ID | Requisito | Verificación |
|---|---|---|
| **R6-D3-SSRF-01** | Esquema `additionalProperties:false` en todos los objetos; **cero** campos URL (`url`, `uri`, `segment*`, `fetch_url`, `manifest_url`, `callback`, `webhook`); guard recursivo de claves URL-like en el servidor (defensa en profundidad, aunque el schema ya las rechace). | Test con `player.url` → 400; test recursivo anidado |
| **R6-D3-SSRF-02** | El servidor **no hace fetch** de nada que venga en el request: prohibido `curl_*`, `file_get_contents` http, `fopen` http, `fsockopen`, `stream_socket_client`, `get_headers`, `include/require` dinámico, `shell_exec/exec/system/passthru/proc_open/popen/eval`. Cero `proxy_pass` en el location `/sync`. | `grep` estático = 0; revisión de snippet nginx |
| **R6-D3-SSRF-03** | Sin redirects (`Location`), sin `resolver` alimentado por request, sin `X-Forwarded-*` para auth; SQL con **prepared statements** y `device_id` ligado; DB path fijo. | Revisión + test de inyección SQL en `device_id` (debe fallar por regex/schema) |
| **R6-D3-SSRF-04** | Superficie saliente de `/sync` = **vacía** (solo SQLite local). Si en el futuro se necesita un callback, allowlist explícita, no URLs del request. | `grep` de funciones de red = 0; diagrama de flujo |
| **R6-D3-SSRF-05** | No reflejar el request en la respuesta ni en logs; errores JSON genéricos; `json_encode` sin `JSON_UNESCAPED_*` innecesario; `expose_php=Off` y `fastcgi_hide_header X-Powered-By`. | Revisión de errores; HEAD del endpoint |

### 4.4 Rate-limit compatible con autopista

| ID | Requisito | Verificación |
|---|---|---|
| **R6-D3-RATE-01** | `limit_req_zone` en `http` y `limit_req` **solo** dentro de `location = /sync`. Cadencia 30 s ±20 % (2–2,5 req/min): configurar `rate=3r/m burst=6` por IP (o `2r/m burst=8` si se prefiere estricto) para tolerar jitter y reintentos. | `nginx -T` staged: una sola ocurrencia de `limit_req ` y está en `/sync` |
| **R6-D3-RATE-02** | `429` con `Retry-After: 30`; cliente backoff exponencial (5 s→120 s) sin bloquear player; el rate-limit no afecta `/lists/`, `/a/`, `.m3u8`, `.ts`, `.m4s`, `/cdn/` ni `/meta/`. | `grep` de `limit_req` = 1; prueba de playback simultánea con `/sync` limitado |
| **R6-D3-RATE-03** | No `limit_conn` nuevo en reproducción; no `ngx.exit` en Lua; si D3 usa Lua, `pcall` y passthrough; preferir PHP-FPM. No tocar `proxy_read_timeout`/`proxy_next_upstream`/`limit_conn` del plano de video. | Diff de nginx staged; revisión de Lua |
| **R6-D3-RATE-04** | Si hay varias IPs/NAT, medir 429 y ajustar solo el burst; nunca subir el rate a costa de bloquear playback; documentar el valor elegido y el test de zapping. | Canary de 30 min: 0 429 en player normal |

### 4.5 Red, cache-control y minimización de datos

| ID | Requisito | Verificación |
|---|---|---|
| **R6-D3-NET-01** | `/sync` solo por **443/TLS**; el 80 redirige (301) y no acepta POST; TLS 1.2/1.3; `server_tokens off`; HSTS queda a decisión del owner (no imprescindible para players nativos). | `curl` HTTP → 301; HEAD 443 |
| **R6-D3-NET-02** | **Sin CORS** en `/sync` (app nativa): no `Access-Control-Allow-Origin`, no preflight. Si algún día hay cliente web, allowlist explícita, nunca `*`. | HEAD/POST sin ACAO |
| **R6-D3-NET-03** | `Cache-Control: no-store` + `Pragma: no-cache`; `X-Content-Type-Options: nosniff`; `Content-Type: application/json; charset=utf-8`; sin `ETag`/`Last-Modified` de HTTP; sin cookies; sin redirects. | HEAD del endpoint |
| **R6-D3-NET-04** | Solo `POST` (405 para otros); `client_max_body_size 16k`; timeouts cortos (connect 3 s, read 10 s); `fastcgi_hide_header X-Powered-By`; `expose_php=Off`. | `curl -X GET/PUT` = 405; headers |
| **R6-D3-DATA-01** | Pedir solo las métricas del schema; **prohibido** URL/canal/título/credencial/IP en body o respuesta. `device_id` pseudónimo estable (no serial de hardware); no guardar body crudo, solo hashes. | Inspección de schema + revisión de DB |
| **R6-D3-DATA-02** | Retención: métricas **7 días**, nonce/replay **600 s**, logs **14 días** (logrotate actual); purga programada; borrar al desenrolar/revocar. | `sqlite3` counts por antigüedad; cron/timer |
| **R6-D3-DATA-03** | DB `0600` fuera de webroot; backups cifrados/`0600`; `device_id`/`nonce_hash` indexados; sin `secret` en claro en DB si se puede usar archivo `0600`; sin IP. | `stat`; revisión de schema |
| **R6-D3-DATA-04** | Logs de `/sync` sin body y sin headers sensibles; si se registra IP, retención 14 días y acceso `640 www-data:adm`; preferible formato propio sin IP ni query (`$time_iso8601 $status $request_time`). | `log_format` + `access_log` del location |
| **R6-D3-DATA-05** | Respuesta solo política: sin URLs (test recursivo), sin `key`, sin `sig`, sin `nonce`; `ref.list_version`/`lab_exported_at` con patrón `^[A-Za-z0-9._:+-]{1,64}$` (sin `://`); no eco de strings del request. | Test `assertNoUrlKeys` + regex |

### 4.6 Esquema de la extensión D3 (campos nuevos)

D3 añade `display.min_resolution`, `display.never_downscale`, `fps.target/current/min`,
`thermal.limits`, `processing.tier`, `degrade.order`. Requisitos:

| ID | Requisito | Verificación |
|---|---|---|
| **R6-D3-SCHEMA-01** | `additionalProperties:false` en cada objeto nuevo; enums cerrados; números con `minimum/maximum`; arrays con `maxItems`; strings con `pattern` seguro; **cero** campos URL. | JSON Schema + validador; test de campo extra → rechazo |
| **R6-D3-SCHEMA-02** | `display.min_resolution` ∈ `{1280x720,1920x1080,2560x1440,3840x2160}`; en ONN 4K **3840x2160**; `never_downscale=true` obligatorio para `amlogic_s905x4`/`firetv_mt8696`; `wire_resolution != 7680x4320`; `eight_k=presentation_only`; violación → política rechazada/safe default. | Tests de guard 8K y downscale |
| **R6-D3-SCHEMA-03** | `fps.target` ∈ `{60,30,24}`; `fps.current` medido y acotado 1..240; `fps.min=24`; `thermal.limits` objeto numérico 55..85 y ordenado; `processing.tier` enum cerrado; `degrade.order` array de `fps` / `processing` / `resolution` (máx. 3), **sin `resolution`** para S905X4. | Tests de vectores |
| **R6-D3-SCHEMA-04** | `device_id`/`seq` de la respuesta deben coincidir con el request; `ts`/`valid_until` del servidor; `valid_until > ts` y ≤ `ts+120`; `policy_etag` `sha256:[a-f0-9]{64}`; firma de respuesta sobre el body crudo **incluyendo los campos nuevos**; si cambia el canónico, **subir `v`** y actualizar vectores. | Test de firma con body extendido; vector congelado |
| **R6-D3-SCHEMA-05** | El servidor valida la política **antes** de firmar (SoC, 8K, levers allowlist, blend=1, TTL, URL-like, never_downscale, min_resolution); si falla, no envía política inválida: 500/503 y el cliente aplica safe-default; nunca firma una política que viole un guard. | Test de política inválida → no 200; cliente safe-default |
| **R6-D3-SCHEMA-06** | `state.levers` del request es libre en el schema actual: el **servidor** debe validar contra la allowlist (`ACTUATOR_ALLOWLIST`) y no ecoar claves en la respuesta; `device.levers` de respuesta solo allowlist. | Test `invented_lever` → rechazo/ignorado |
| **R6-D3-SCHEMA-07** | Compatibilidad: si los campos nuevos son obligatorios, `v=2` y tests de cliente nuevo; si son opcionales, `v=1` con defaults seguros y tests de cliente viejo. No cambiar silenciosamente el significado de `v=1`. | Matriz old/new client |

### 4.7 Delta explícito respecto al baseline

1. **Replay vs reintento:** el baseline (§8) dice `409` para replay. R6 exige distinguir: reintento
   **idéntico** cacheado → `200` idempotente; replay con body/seq distinto → `409`. El idempotency cache se
   consulta **antes** de rechazar el nonce.
2. **Rate-limit:** se mantiene “solo `/sync`”; el valor `2 req/min/device` se implementa por IP con burst
   (3 r/m + burst 6) para tolerar jitter ±20 % y reintentos. Cero límites nuevos en playback.
3. **Token-only:** queda **deshabilitado**. Hasta B2/B3, `/sync` responde 401/503; no hay fallback a
   `ARA_TOKEN` ni a `APE_ENROLL_SECRET`.
4. **Idempotencia:** no existía en el baseline; se añade cache de respuesta firmada y tests.
5. **Campos nuevos:** se aceptan solo con enums/bounds/`additionalProperties:false`; si son obligatorios,
   `v=2` y vectores nuevos; la firma cubre el body completo.

---

## 5. Requisitos de plataforma para producción (fuera del scope D3)

### 5.1 `/lists/` y playback

| ID | Requisito | Verificación |
|---|---|---|
| **R6-LIST-01** | Eliminar `Access-Control-Allow-Origin: *` (y ACAM/ACAH/ACAE) de `/lists/`, `.m3u8` y `location /`. Si el frontend web lo necesita, allowlist explícita de orígenes con `Vary: Origin`; nunca `*`. Players nativos no requieren CORS. | `curl -I` sin ACAO; `grep` = 0 |
| **R6-LIST-02** | Una sola `Cache-Control: private, max-age=300` (sin `public`, sin duplicado), `X-Robots-Tag: noindex, nofollow`, `Vary: Accept-Encoding`. | HEAD exacto |
| **R6-LIST-03** | Gate de secretos sobre la lista: 0 `user:pass@`, 0 `username/password`, 0 cabeceras tóxicas/auth en EXTHTTP, 0 claves/tokens en `#EXT-X-ARA-*`; muestras de reportes enmascaradas. | Escáner de §6 |
| **R6-LIST-04** | No añadir `limit_req`/`limit_conn` a `/lists/` ni a segmentos; mantener `sendfile/gzip_static` y `Accept-Ranges`; el rate-limit de `/sync` no debe compartir zona con playback. | `nginx -T`; prueba de playback |
| **R6-LIST-05** | La lista es confidencial: no indexar, no publicar muestras con path completo, no cachear en proxies compartidos; decidir si se oculta el host de proveedor de `#EXT-X-SERVER-1` (hoy visible). | Revisión de metadatos; HEAD |

### 5.2 HMAC `/a/` y `/a/cfg`

| ID | Requisito | Verificación |
|---|---|---|
| **R6-A-01** | Clave en `/etc/nginx/lua/ape_attr.key` modo `600 www-data`, **64 hex chars** (medido), fuera de webroot; nunca en repo, listas, logs ni reportes; sin copias de backup. | `stat`; `find`; `git grep` |
| **R6-A-02** | HMAC-SHA256 truncado 16 B sobre `2 / c / s / p / payload`; comparación constant-time; fail-open **solo** devuelve `#EXT-X-APE-STALE:1`, nunca datos, nunca 4xx; monitorear tasa `stale:hmac_invalido`/`sin_clave`. | Vectores; test de clave ausente; contador |
| **R6-A-03** | Anti-abuso: `limit_req` de techo alto en `/a/` (p. ej. 20 r/s, burst 40 por IP) + observabilidad; probar zapping normal sin 429; no tocar `/lists/`/segmentos. | Prueba de carga + player |
| **R6-A-04** | Rotación: `key_id`/versión, doble clave en ventana, regeneración de la lista (584.705 URLs) o aceptación de clave vieja; no rotar sin plan; documentar impacto en `#EXTATTRFROMURL`. | Checklist + E2E de lista |
| **R6-A-05** | `/a/cfg` **solo loopback** (`127.0.0.1`), HMAC de sesión+body, ≤64 KB, rate 6/60 s por sesión, sesión en header (nunca query), `access_log off`, TTL ≤3600; público debe seguir 403. | `curl` público 403; tests del módulo |
| **R6-A-06** | El generador que firma `/a/` no debe exponer la clave en HTML/JS servido públicamente (meta tag/config/localStorage accesible): generador local/offline o página de administración protegida; CSP; no loguear la clave. | Revisión de `frontend/**`; `grep` de la clave en HTML |

### 5.3 `ARA_TOKEN` y SSE

| ID | Requisito | Verificación |
|---|---|---|
| **R6-TOKEN-01** | `ARA_TOKEN` ≥32 chars CSPRNG (medido 48), en `env[ARA_TOKEN]` de `www.conf` `640 root:root` o `LoadCredential`; nunca en repo/webroot/lista/logs; rotación ≤90 días; token distinto por entorno. | `stat`; `grep`; longitud sin valor |
| **R6-TOKEN-02** | `/ara/events`: solo `Authorization: Bearer`; `hash_equals`; 503 si falta en prod; **sin** `?token=`; `APE_LAB_MODE=1` solo en LAB explícito, nunca en prod; 401 medido sin y con query. | `curl` 401; env grep |
| **R6-TOKEN-03** | `APE_ENROLL_SECRET` (48) es secreto de enrolamiento: no usarlo para `/sync`, rate-limit/one-time en `/ara/enroll`, rotación; no loguearlo. | Revisión `/ara/enroll`; env |

### 5.4 Headers tóxicos y forwarding

| ID | Requisito | Verificación |
|---|---|---|
| **R6-HEADERS-01** | Gate de los 6 tóxicos (`Range`, `If-None-Match`, `If-Modified-Since`, `TE`, `Priority`, `Upgrade-Insecure-Requests`) en EXTHTTP, generador y forwarding del VPS; 0 en ambos catálogos (medido). | Escáner de EXTHTTP = 0; test de generador |
| **R6-HEADERS-02** | No reenviar headers del cliente al upstream: `proxy_pass_request_headers off` en `/meta/` y `/_ape/_fetch`; no `proxy_set_header` con tóxicos; la lista es estática. | `grep` de `proxy_set_header`; revisión |
| **R6-HEADERS-03** | Retirar `Range`/`If-Modified-Since` del `Access-Control-Allow-Headers` de la lista al quitar CORS; no publicitarlos a browsers. | HEAD sin ACAH |

### 5.5 Superficie de secretos de `ara-x/**` y reportes

| ID | Requisito | Verificación |
|---|---|---|
| **R6-SECRETS-01** | Gate de secretos sobre `ara-x/**` antes de commit: 0 claves/tokens reales, 0 `user:pass@`, 0 claves privadas; allowlist explícita solo para el fixture `ara-x-test-secret` de tests. | `node`/`gitleaks`/`git grep`; CI |
| **R6-SECRETS-02** | `ara-x/evidence/*.m3u8` **nunca** se versiona (`git check-ignore`), ni se sube a servicios externos; se tratan como confidenciales; borrar/rotar tras la auditoría. | `git check-ignore`; `git ls-files` = 0; procedimiento |
| **R6-SECRETS-03** | Reportes: URLs enmascaradas en **todos** los segmentos o hash; nunca token/clave/HMAC; `r1_analyze`/`r1_sample` corregidos (F-08); gate sobre `ara-x/reports/**`. | Fixtures con secretos cortos; escaneo de reportes |
| **R6-SECRETS-04** | `.env`/`.key` fuera de webroot o deny genérico de dotfiles; `ara.env.example` solo placeholder `CHANGE_ME…`; `.env` real `600`. | `curl` 404; `stat`; `grep` |
| **R6-SECRETS-05** | La clave de `/a/` no se copia a reportes/tests/vectores; los vectores usan clave fixture; no se calcula hash de la clave real. | Revisión de tests/reportes |

---

## 6. Matriz de pruebas D3 (obligatoria)

Archivo propuesto: `ara-x/tests/sync_security.test.js` (o `sync.test.js` de D3). Todos deben ser deterministas,
sin red real y sin VPS.

| # | Caso | Esperado |
|---|---|---|
| 1 | HMAC request vector conocido | 64 hex exacto; 200 |
| 2 | Firma inválida / key_id desconocido | 401 genérico |
| 3 | `Authorization: Bearer ARA_TOKEN` sin HMAC | 401 (sin fallback) |
| 4 | `ts` −301/+301 | 401 |
| 5 | `nonce` reusado con `seq+1` | 409 |
| 6 | `seq` igual/menor sin cache | 409 |
| 7 | Reintento idéntico tras timeout | 200 idéntico (mismo body y sig) |
| 8 | Mismo `seq` con body distinto | 409 |
| 9 | Body 16.385 B | 413 |
| 10 | `Content-Type: text/plain` | 415 |
| 11 | JSON inválido / clave desconocida | 400 |
| 12 | `player.url` anidado en request | 400 (guard URL-like) |
| 13 | `invented_lever` en `state.levers` | rechazo/ignorado; no llega a respuesta |
| 14 | Política con wire 8K / `never_downscale=false` | rechazo/safe default |
| 15 | Respuesta con `valid_until > ts+120` | rechazo |
| 16 | Respuesta firmada: tampering de body | cliente rechaza |
| 17 | `204` sin firma | cliente no aplica |
| 18 | Rate: 7 req en 1 min | 429 con `Retry-After`; playback simulado sigue |
| 19 | `GET/PUT /sync` | 405 |
| 20 | HEAD/POST sin ACAO | no hay `access-control-allow-origin` |
| 21 | Errores no incluyen `key`, `sig`, `nonce`, stack | 0 coincidencias |
| 22 | DB: purga replay 120 s / nonce 600 s; tope de filas | filas acotadas |
| 23 | Clave vieja/nueva en ventana | ambas 200; fuera de ventana 401 |

**Comandos locales** (D3):

```powershell
node --check ara-x/vps/client/ara_sync_client.js
node -e "JSON.parse(require('fs').readFileSync('ara-x/vps/schema/sync_request.schema.json','utf8'));JSON.parse(require('fs').readFileSync('ara-x/vps/schema/sync_response.schema.json','utf8'));console.log('schemas ok')"
node --test ara-x/tests/sync_security.test.js ara-x/tests/sync.test.js
node --test ara-x/tests/sync_contract.test.js ara-x/tests/sync_e2e.test.js ara-x/tests/playlist.test.js
```

`php -l` local = **NOT_RUN** (PHP no instalado). No declarar PASS; ejecutarlo en la ventana del VPS antes de
`nginx -t`/reload. `nginx -t` = **NOT_RUN** ahora; staged only.

**Gates estáticos:**

```powershell
# 0 funciones de red/SSRF en el endpoint staged
Select-String -Path ara-x/vps/php/ara-sync.php -Pattern 'curl_|file_get_contents|fsockopen|stream_socket|get_headers|shell_exec|proc_open|popen|eval\('
# 0 secretos reales en ara-x (excluye evidence y fixture de test)
node ara-x/scripts/security/scan_secrets.js --root ara-x --exclude evidence --allow ara-x-test-secret
# evidencia no versionada
git check-ignore -v ara-x/evidence/APE_LISTA_4K_live_20261030_full.m3u8
git ls-files ara-x
```

**Gates en ventana (solo cuando el owner autorice deploy; no ahora):**

```bash
# /sync
curl -sk -o /dev/null -w '%{http_code}\n' -X POST https://iptv-ape.duckdns.org/sync -H 'Content-Type: application/json' --data '{}'   # 401
curl -sk -o /dev/null -w '%{http_code}\n' https://iptv-ape.duckdns.org/sync                                  # 405
curl -skI https://iptv-ape.duckdns.org/sync | grep -iE 'access-control|cache-control|x-content-type'        # no ACAO, no-store, nosniff
# /lists/ (tras fix F-01/F-02)
curl -skI https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8 | grep -iE 'access-control|cache-control|x-robots-tag'
# /a/ (tras fix F-03)
curl -skI https://iptv-ape.duckdns.org/a/ | grep -iE 'x-ape-a|rate|retry-after'
# playback no limitado
curl -sk -o /dev/null -w '%{http_code} %{time_total}\n' https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8
```

---

## 7. Dependencias y decisiones abiertas

1. **B2/B3 (enrolamiento)**: sin clave por dispositivo, `/sync` no puede autenticar. Mantener **token-only
   deshabilitado**; no usar `ARA_TOKEN` como sustituto. `/sync` debe devolver 401/503, no aceptar un token
   global.
2. **CORS de `/lists/`**: quitarlo no afecta a players nativos; si el frontend web consume la lista
   cross-origin, el owner debe elegir la allowlist exacta. Sin decisión, **quitar `*`**.
3. **Rotación de `ape_attr.key`**: requiere regenerar 584.705 URLs `/a/`; planificar ventana y doble clave.
4. **HSTS**: opcional; no bloquea players; decisión del owner por riesgo de lockout.
5. **Host de proveedor en la lista** (`#EXT-X-SERVER-1`): visible pero sin credenciales; decidir si se
   enmascara (cambio de metadata inerte; validar con players).
6. **Evidencia**: 2,7 GB de catálogos; no versionar, no subir; borrar tras la auditoría o guardar en almacenamiento
   cifrado local.

---

## 8. Anexo: evidencia de medición

- Comandos VPS (solo lectura): `ssh hetzner-iptv` + `stat`, `grep`, `find`, `curl -skI --resolve`.
- Lista 4K: `sha256 e27c03eb45dacd6e5f19c3f4e016b456236ca2c06f485ddf11165ddc86e2a680`
  (572.170.477 B; V2 report). URL hash preservado por ARA-X: `f69a048f8c4c14a8ee6dd3eb9ab000b9c70e26d1e8178414c322a4f40f55f330`.
- ARA-X: bloque de 27 líneas, 10.631/10.631 canales, 0 URL mutada, segunda pasada byte-idéntica
  (`V2_e2e_baseline.md` / `.json`).
- `sync_request.schema.json`: `additionalProperties:false`, sin URL, body ≤16 KB.
- `sync_contract.test.js`: 17 casos; `sync_e2e.test.js`: 5; `playlist.test.js`: 10 → 32/32 PASS (V0).
- No se leyó `ARA_TOKEN`, `APE_ENROLL_SECRET` ni `ape_attr.key`; solo longitud/forma/modo.
- No se reprodujeron URLs con credenciales; las muestras de reportes están enmascaradas.

**Cierre:** R6 queda documentado. D3 puede implementar el contrato staged con los `R6-D3-*`; el deploy de
producción queda condicionado a cerrar F-01/F-02/F-03/F-04 y a ejecutar los gates de §6 en ventana.
