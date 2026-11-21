# R4 · Rutas de ESCRITURA del motor JIT — decisión por ruta, con sandbox medido

Artefacto: `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` · 480976 B · 9812 líneas · sha256 `268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0` (mismo que canonizó el incidente `docs/audits/INCIDENT_JIT_ENGINE_20261121.md:60-61`).

Alcance: las **19 rutas de escritura/proceso** de t31 (`artifacts/verify/jit_routes_61.md:114-136`) + los escritores de borde declarados ahí (`:159`). Producción NO tocada: sin SSH, sin `/opt/ape-jit`, sin nginx. Todo lo que se ejecutó corrió en una instancia local aislada (`scratch/r4_sandbox/`), con **todos** los ficheros de estado redirigidos por variable de entorno.

## 0 · Gate de identidad (lección del stub del 2026-11-21)

`/health` devuelve 200 en el motor canónico **y en el stub de 29 624 B** (`INCIDENT_JIT_ENGINE_20261121.md:91-92`). Por tanto **ninguna verificación de rutas de escritura vale si antes no se fija la identidad del proceso**. Gate mínimo, medido en esta corrida:

| comprobación | valor observado |
|---|---|
| `LISTEN` en stdout | `... LISTEN 127.0.0.1:3199 map=<ruta del sandbox>` |
| rutas de imagen vivas | `/image/rules`, `/image/matrix`, `/image/governance`, `/jit/tune`, `/jit/signal` respondieron 200 (el stub no las tiene) |
| sha256 del fichero servido | `268bbd3a…ba4eb0` |
| `/api/config` POST sin key | `503` (fail-closed, no escribe) |

## 1 · Receta de sandbox (reproducible, cero efecto en producción)

```bash
PORT=3199 BIND=127.0.0.1 \
MAP_FILE=$SB/channels.json OUT_ROOT=$SB/out \
IMAGE_CONFIG_FILE=$SB/image-config.json PROFILE_MATRIX_FILE=$SB/profile-matrix.json \
GOVERNANCE_FILE=$SB/governance.json RULES_FILE=$SB/transform-rules.json \
CHANNEL_SIGNAL_FILE=$SB/channel-signals.json LLM_KEY_FILE=$SB/llm-key.json \
PROFILES_JSON=$SB/profiles.json GESTOR_STORE=$SB/gestor-profiles.json \
GESTOR_BACKUP_DIR=$SB/backups GESTOR_JOURNAL=$SB/gestor-journal.jsonl \
GESTOR_PENDING_DIR=$SB/pending TUNE_JOURNAL=$SB/tune-journal.jsonl LISTS_DIR=$SB/lists \
node IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js
```

Todas las rutas de escritura son redirigibles **salvo dos excepciones hardcodeadas**: `RECEIPT_SESSION_ROOT=/dev/shm/ape-jit` (`server.js:6062`) y `/opt/ape-jit/api-key.txt` (`:9441`). `BIND`/`PORT` también son env (`:15-16`), así que el motor se puede levantar en cualquier puerto local sin tocar el servicio real. Sin `ffmpeg` no arranca ninguna sesión; `GET /health` y todo lo de estado funcionan igual.

## 2 · Tabla: ruta · muta_qué · decisión · payload · riesgo

Leyenda decisión: **A** = EJECUTABLE_EN_SANDBOX · **A\*** = A con condición · **C** = NOT_EXERCISED. No existe modo `--dry-run` en ninguna ruta: `grep -E 'dry|dryRun|preview'` → **0 coincidencias**; `confirm` aparece sólo en 6 comentarios (`:2252,2306,2310,2568,5191,7719`), no en código de control.

| # | ruta | método | muta (fichero y clave) | atómico | reversible | auth | decisión | payload exacto | riesgo |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/config` | POST | `IMAGE_CONFIG_FILE` completo (`:9496-9497`), con `normalizeImageConfig`+`alignTargetToProfile`; idempotente si no cambia (`:9484-9494`); **no** para el job | sí (tmp+rename) | no (sin backup) | **sí**: `X-APE-Key` vs `/opt/ape-jit/api-key.txt`, fail-closed (`:9441-9455`) | **C** (rama 200). La rama `503` **medida** | `{"recipe":"light","crf":22}` + `X-APE-Key: <clave>` | única ruta autenticada; la rama 200 no se puede alcanzar sin crear el fichero de clave en la ruta de producción |
| 2 | `/image/config` | POST | `IMAGE_CONFIG_FILE` completo (`:9564-9566`) + `stopCurrent('image_config_changed')` (`:9581`) | sí | no | **no** | **A — EJECUTADA** | `{"recipe":"light","crf":22}` → 200, `effective_filter:"unsharp=5:5:0.2:5:5:0"` | **mata el ffmpeg vivo** con un POST sin credencial |
| 3 | `/image/gestor/restore` | POST | `GESTOR_STORE` + **backup nuevo** + espejo `PROFILES_JSON` + journal (`:7853`→`:2550-2565`→`:2450`) | sí | **sí** (backup previo, KEEP 60) | no | **A — EJECUTADA** | `{"name":"json-original-20261121T223907Z.json"}` → 200, `profiles:2` | restaura un backup arbitrario por nombre (saneado: sin `/` ni `..`) |
| 4 | `/image/gestor/save` | POST | `GESTOR_STORE` + backup + espejo `PROFILES_JSON` + journal (`:7907`→`:2450`); si no llegan perfiles consolida el vigente (`:7905-7906`) | sí | sí (backup previo) | no | **A — EJECUTADA** | `{"profiles":{"P0":{"id":"P0","name":"P0"}},"by":"r4"}` → 200, `bytes:282` | **cuerpo de 16 MB sin esquema**: `profiles` arbitrario se escribe y se **espeja a `PROFILES_JSON`**, que se sirve bajo `/js/ape-v9/` (`:2510-2519`) |
| 5 | `/image/governance` | POST | `GOVERNANCE_FILE`: `defaultProfile` + `channels[ch].{profile,at}` (`:8238-8249`→`:532-535`) | **no** | no | no | **A — EJECUTADA** | `{"defaultProfile":"P3"}` → 200, `persisted:true` | escritura no atómica de un fichero del que depende el perfil de cada canal |
| 6 | `/image/llm-key` | POST | `LLM_KEY_FILE`: escribir clave (`:7372`→`:2282`, chmod 600) o **borrarla** con `{"clear":true}` (`:7368`→`:2296`) | no | no | **no** | **A — EJECUTADA** | `{"key":"TESTKEY_12345678"}` → 200 `chars:16`; `{"clear":true}` → 200 `configured:false` | **borrar o sustituir la clave del LLM sin credencial**: apaga la alineación/optimización y puede desviar prompts a otra cuenta |
| 7 | `/image/matrix` | POST | `MATRIX_FILE`: `profileMatrix[id]` con allowlist de campos y pares redondeados (`:8317`→`:238-270`→`:229-234`) | **no** | no | no | **A — EJECUTADA** | `{"profile":"P3","patch":{"outW":1920,"outH":1080}}` → 200 `persisted:true` | la matriz manda la resolución real de salida de TODOS los canales |
| 8 | `/image/profile/align-all/apply` | POST | `GESTOR_STORE` (solo perfiles que pasan invariantes) + backup + journal (`:7471-7481`) | sí | sí (backup) | no | **A\* — NO ejecutada** (falta un `gestorProfile` real de 577 campos; el payload es el que devuelve `/image/profile/align-all`) | `{"profiles":{"P0":{"gestorProfile":{…},"diffs":[{…}]}}}` (≤8 MB) | aplica 6×577 campos de golpe; un invariante mal implementado se propaga a todo el Gestor |
| 9 | `/image/profile/align-llm` | POST | `GESTOR_PENDING_DIR/<pid>.json` + journal (`:7720-7726`); **solo si el LLM responde sin error** (`:7693-7698` corta sin escribir) | sí (fichero nuevo) | sí (borrable) | no | **A\* — NO ejecutada**: sin key **no escribe** (medido por código); con key **sale a `api.deepseek.com`** (`:7691`) | `{"profile":"P0","inW":1920,"inH":1080,"inFps":50,"outW":3840,"outH":2160}` | egress con la clave del operador + persistencia de una propuesta del LLM |
| 10 | `/image/profile/align-loop` | POST | `GESTOR_STORE` (solo `converged`) + backup + journal (`:7634-7648`) | sí | sí (backup) | no | **A\* — NO ejecutada** (itera objetivo/leyes por perfil; payload listo) | `{"profile":"P0","scope":"single","inW":1920,"inH":1080,"inFps":50,"outW":3840,"outH":2160,"player":"onn-4k","mode":"real"}` | `scope:"all"` reescribe los 12 perfiles en una sola llamada |
| 11 | `/image/profile/align/apply` | POST | `GESTOR_STORE[gestorId]` si pasan los 3 invariantes (`:7763-7775`) | sí | sí (backup) | no | **A — EJECUTADA** | `{"gestorId":"P0","gestorProfile":{"id":"P0","name":"P0"},"diffs":[]}` → 200, `invariants.ok:true`, `persisted.ok:true` | persiste un perfil construido por el cliente; los invariantes son la única puerta |
| 12 | `/image/receipt` | GET | `/tmp/ape-receipt-<pid>-<kind>.mp4` + `sh -c 'cat … \| ffprobe …'` **dos veces por pista** (`:6146` y `:6151`; borrado en `:6182`); lee `/dev/shm/ape-jit/<id>` (hardcode `:6062`) | n/a | n/a (tmp) | no | **C** — `RECEIPT_SESSION_ROOT` no es env y en el arnés no hay `sh`/`ffprobe`/`/dev/shm` | `GET /image/receipt?channel=<id>` | **4 ffprobe por llamada** en host de 3 vCPU con slot único; el `sh -c` es el único punto de ejecución de shell del motor |
| 13 | `/image/receipts` | GET | lo anterior **× cada directorio de sesión** (`:8010-8020`) | n/a | n/a | no | **C** — mismo motivo | `GET /image/receipts` | amplifica el coste por N canales con sesión |
| 14 | `/image/rules` | POST | `RULES_FILE`: upsert de una fila de la tabla (`:8153`→`:821-899`→`:721-724`) | **no** | no | no | **A — EJECUTADA** | `{"id":"R4TEST","input":"720p","outW":1920,"outH":1080,"recipe":"light"}` → 200; fichero **16 → 17 reglas** | la tabla decide la cadena ffmpeg que `/jit/signal` entrega a todos los canales |
| 15 | `/jit/api/config` | POST | alias exacto de #1 (misma guarda `:9408`) | sí | no | sí | **C** (misma rama 200 que #1); `503` medido por `#1` | igual que #1 | igual que #1 |
| 16 | `/jit/resolve` | ANY | alias exacto de #19 (`:6698`) | no | no | no | **A — EJECUTADA vía #19** (mismo handler) | `GET /jit/resolve?channel=R4CH&p=P3` | igual que #19 |
| 17 | `/jit/signal` | POST | `CHANNEL_SIGNAL_FILE[ch]` (tmp+rename, `:712-719`); **y siembra `RULES_FILE`** cuando falta/está corrupto vía `loadRules()` (`:9214`→`:690-693`) | sí (signals) / **no** (rules) | sí / **no** | no | **A — EJECUTADA** | `{"channel":"R4CH","width":1280,"height":720,"fps":50}` → 200, `rule_id:r-720-60-4k-30`, escribe 3665 B | **reescritura silenciosa de las 16 reglas** si el fichero está corrupto, y luego resuelve contra la semilla |
| 18 | `/jit/tune` | POST | `IMAGE_CONFIG_FILE` (tmp+rename, `:9170-9171`) + `TUNE_JOURNAL` append (`:9190`) + egress LLM opcional (`:9122`) | sí (config) | no | no | **A — EJECUTADA** (rama heurística, sin key) | `{"channel":"R4CH","source_fps":50,"capacity":{"480p":120,"720p":90,"1080p":40,"2160p":10},"produced_segments_per_min":28,"expected_segments_per_min":30}` → 200, `profile -> P4` | cambia el perfil global por capacidad declarada **por el cliente**: un POST falso baja el techo de todo el motor |
| 19 | `/resolve` | ANY | `IMAGE_CONFIG_FILE` **sin normalizar** + `force_transcode=true` (`:6713-6717`) + `stopCurrent` (`:6718`) | **no** | no | no | **A — EJECUTADA** | `GET /resolve?channel=R4CH&p=P3` → config acabó en `profile:"P3"`, `force_transcode:true` (valores que solo escriben `:6716` y `:6814`) | **una URL de LECTURA (GET) escribe estado y mata el stream** cuando `?p=` difiere del vigente; el **disparo por zap NO está computado** (§9): la lista servida no lleva `/jit/resolve` |

## 3 · Evidencia de ejecución (sandbox, 2026-11-21T22:38-22:40Z)

| ruta | status | efecto observado |
|---|---|---|
| `GET /health` | 200 | `{"ok":true,"active":null,…}` |
| `POST /api/config` (sin key) | **503** | `escritura deshabilitada: falta /opt/ape-jit/api-key.txt` — **no escribió** |
| `POST /image/config` | 200 | `image-config.json` creado (851 B), `IMAGE_CONFIG_APPLIED` en stdout |
| `POST /image/matrix` | 200 | `profile-matrix.json` 2441 B |
| `POST /image/governance` | 200 | `governance.json` 46 B |
| `POST /image/llm-key` ×2 | 200 / 200 | `llm-key.json` creado y luego borrado (`configured:false`) |
| `POST /image/gestor/save` | 200 | `gestor-profiles.json` 282 B + `backups/json-original-…json` 74 B + 1 línea de journal |
| `POST /image/gestor/restore` | 200 | store reescrito (360 B), backup nuevo `gestor-…Z.json`, 2 líneas de journal |
| `POST /image/profile/align/apply` | 200 | `invariants.ok:true`, `persisted.ok:true`, journal `by:"align"` |
| `POST /image/rules` | 200 | `transform-rules.json` **16 → 17** filas |
| `POST /jit/signal` | 200 | `channel-signals.json` 3665 B, `SIGNAL R4CH 720p@50 -> regla r-720-60-4k-30` |
| `POST /jit/tune` | 200 | `tune-journal.jsonl` 833 B + `TUNE R4CH profile -> P4` |
| `GET /resolve?channel=R4CH&p=P3` | 200 | `image-config.json` quedó con `profile:"P3"` + `force_transcode:true` (solo `:6716`/`:6814` los escriben) |

Cero ficheros escritos fuera de `scratch/r4_sandbox/`. Cero procesos `ffmpeg` residuales (verificado con `Get-Process ffmpeg` → vacío). `stderr` vacío en las 5 corridas.

## 4 · RIESGOS ABIERTOS (priorizados)

| id | sev | riesgo | evidencia |
|---|---|---|---|
| **W-01** | **CRITICAL** | **Dos GET que parecen lecturas escriben el estado global y matan el job vivo**: `/resolve` y `/go/<id>` con `?p=` distinto del vigente. Estado real (**corregido en §9**): **ALCANZABLE desde Internet** bajo `/jit/` (nginx `proxy_pass .../;` quita el prefijo), **MUTANTE**, **NO EJERCITADA** contra producción. El **disparo por zap está NO COMPUTADO**: la lista servida no contiene `/jit/resolve` (§9). Sin credencial y sin backup. | `:6711-6718` · `:6811-6818` · `stopCurrent` `:4967-4983` · medido en sandbox (§3) · exposición medida en §9 |
| **W-02** | **HIGH** | **17 de 19 rutas de escritura no tienen auth en la aplicación**; solo `/api/config` exige `X-APE-Key`. El perímetro real es `BIND` (por defecto `127.0.0.1`, `:16`) + nginx. **NO COMPUTADO**: el `BIND`/env del servicio en producción (no se leyó el unit) — si es `0.0.0.0` o nginx expone `/jit`, cualquiera reescribe el estado. | `:16` · `:9441` vs guardas sin auth `:7843,7890,8123,8184,8227,8302,9002,9199,9518` |
| **W-03** | **HIGH** | `/image/llm-key` sin auth permite **borrar o sustituir la clave del LLM** (DoS de la alineación + posible desvío de prompts a la cuenta del atacante). | `:7358-7374` · `:2277-2298` |
| **W-04** | **HIGH** | `/image/gestor/save` acepta **16 MB de JSON arbitrario** como `profiles` y lo **espeja a `PROFILES_JSON`**, que se sirve bajo `/js/ape-v9/`. No valida contenido (>0 claves es lo único que se exige). Inyección de contenido en un fichero servido por la web + estado arbitrario. | `:7890-7918` · `:2450-2519` · `GESTOR_MIRROR` `:2377` |
| **W-05** | **HIGH** | **Escritores no atómicos** (`saveProfileMatrix:231`, `saveRules:722`, `saveGovernance:533`, `saveLLMKey:2282`, `/resolve:6717`, `/go:6815`). Un corte a mitad trunca el JSON; los lectores **fail-open a default** (`:226`) y `loadRules()` **re-siembra las 16 reglas en silencio** (`:690-693`). Sin backup para matriz/reglas/gobernanza: se pierde el estado del operador y el siguiente POST persiste el default. | líneas citadas |
| **W-06** | **MEDIUM** | `/jit/signal` POST puede **sembrar el fichero de reglas** (`loadRules` → `saveRules`) y después resolver la señal contra la semilla: cambia la cadena ffmpeg de todos los canales con una sola línea de log. | `:9214` · `:679-693` |
| **W-07** | **MEDIUM** | `/image/receipt` ejecuta el **mismo** `sh -c 'cat … \| ffprobe …'` dos veces por pista (`:6146` y `:6151`) ⇒ 4 ffprobe por llamada; `/image/receipts` lo multiplica por cada directorio. Sin auth ni rate-limit, en host de 3 vCPU con slot único. | `:6124-6184` · `:6246` · `:8000-8020` |
| **W-08** | **MEDIUM** | **Tres escritores del mismo fichero con comportamientos distintos**: `/image/config` (valida + atómico + para el job), `/api/config` (valida + atómico + **no** para el job), `/resolve` y `/go` (**no valida** + **no atómico** + para el job + `force_transcode`). El estado efectivo depende de quién escribió último; tras `/api/config` el job vivo sigue con la receta vieja. | `:9564-9581` · `:9496-9504` · `:6713-6718` · `:6811-6818` |
| **W-09** | **MEDIUM** | El comentario de cabecera dice «FAIL-CLOSED sin api-key.txt **las ESCRITURAS** se rechazan» (`:8486`), pero el control existe **solo** en esa ruta. Comentario que miente por omisión, misma clase de defecto que el de `pulse.php:96-99` vs `:104`. | `:8486` vs guardas reales |
| **W-10** | **LOW** | `/api/config` compara la clave con `!==` (no tiempo constante) y **relee el fichero en cada POST**. | `:9441-9452` |
| **W-11** | **LOW** | **Condición LATENTE, no caso vigente** (§9): producción tiene `profile:"P3"` y `target:"FHD_1080"`. Si alguien deja `profile:""` (lo acepta `:4258-4262` y `alignTargetToProfile` lo convierte en `target:"source"`), **cualquier** `?p=` de `/resolve` diferiría y siempre escribiría+mataría: eso amplificaría W-01. Hoy no está armado. | `:4258-4262` · `:4182-4199` · medido en sandbox: `POST {"recipe":"light","crf":22}` → `profile:""` · estado de producción en §9 |
| **W-12** | **INFO** | No existe modo seco en ninguna ruta. El único comportamiento "seco" es el de las rutas de propuesta (`/image/profile/align`, `/align-all`, `/image/optimize`, `/image/plan`), que no persisten — y esas están en las 42 de lectura. | `grep -i 'dry\|preview'` = 0 |

**Sobre el incidente del stub (2026-11-21):** `docs/audits/INCIDENT_JIT_ENGINE_20261121.md:80-103` describe un **deploy** que instaló `vps_jit/server.js` (29 624 B) sobre `/opt/ape-jit/server.js`; no es un fallo de una ruta de escritura. Lo que este informe aporta al incidente es el **gate de identidad** (§0): el stub también responde `/health` 200, así que un arnés que solo mire `/health` no distingue motor de stub. Los mecanismos encontrados que **sí** pueden dejar el mapa incoherente son W-05 y W-06.

## 5 · NOT_EXERCISED (declarado, con motivo y riesgo)

| ruta | motivo | riesgo de ejecutarla |
|---|---|---|
| `/api/config` y `/jit/api/config` (rama 200) | el gate lee `/opt/ape-jit/api-key.txt`, ruta **hardcodeada** sin env: alcanzar el 200 exige crear ese fichero en la ruta de producción, prohibido en R4 | reescribe la config de imagen sin parar el job (estado efectivo ≠ estado del proceso, W-08) |
| `/image/receipt`, `/image/receipts` | `RECEIPT_SESSION_ROOT=/dev/shm/ape-jit` hardcodeado (`:6062`) y el arnés local no tiene `sh`/`ffprobe`/`/dev/shm` | 4 ffprobe por llamada (W-07); sin auth |
| `/image/profile/align-all/apply` | exige un `gestorProfile` real (577 campos) + `diffs`; el arnés no tiene el perfil de producción | persiste 6×577 campos; solo lo frenan los invariantes |
| `/image/profile/align-loop` | itera objetivo/leyes por perfil; con el fixture mínimo el resultado no es representativo | `scope:"all"` reescribe los 12 perfiles |
| `/image/profile/align-llm` | sin key **no escribe** (corta en `:7693-7698`); con key hay egress a `api.deepseek.com` | egress + persistencia de propuesta del LLM en `llm-pending/` |

## 6 · Escritores de borde (fuera de las 61, declarados en t31)

- `GET|ANY /go/<id>` (`:6783-6819`): mismo patrón que `/resolve` — `?p=` distinto escribe `IMAGE_CONFIG_FILE` **sin normalizar ni atomicidad** (`:6815`) y llama `stopCurrent` (`:6817`). Entra en **W-01**.
- `DELETE /image/rules/<id>` (`:8161-8167`): `deleteRule` → `saveRules` (no atómico, sin backup). Mismo riesgo que #14.
- `/live/<id>/manifest.json` y `/live/<id>/…` (`:9610`, `:9636`): no escriben ficheros de estado, pero **arrancan ffmpeg** (`start()` → `probeSource` + `spawn`, `:4986-5057`). Un arnés que siga redirecciones de `/resolve` puede ocupar el slot único: en la primera corrida, seguir el redirect dejó al cliente sin respuesta a los 8 s (el handler ya había escrito el estado antes). **No se declara ejercitado el camino completo del redirect.**

## 7 · Lo que el capitán puede autorizar (payloads listos)

Todo lo de la columna «payload» de §2 es ejecutable **sólo** contra una instancia con la receta de §1. Orden recomendado para un arnés:

1. Gate de identidad (§0) — sin esto no se ejecuta nada.
2. Rutas de estado con backup automático primero: `#4 save`, `#3 restore`, `#11 align/apply` (todas reversibles).
3. Rutas sin backup (`#2, #5, #6, #7, #14, #17, #18, #19`): **snapshot manual previo** de los ficheros del sandbox (`sha256sum`) — el motor no lo hace.
4. `#8, #9, #10` sólo con el `gestorProfile` real y, para `#9`, con decisión explícita sobre el egress.
5. `#1/#15` (rama 200) y `#12/#13`: **no** en esta fase (W-02, W-03, W-07).

## 8 · NO COMPUTADO (declarado)

- `BIND`/`PORT`/`MAP_FILE` reales del servicio en producción: no se leyó el unit ni el env; W-02 depende de ese dato.
- Semántica exacta de `applyAlignment`/`alignLoopOnce` más allá de lo leído: no se ejecutaron (payload real pendiente).
- Comportamiento de `/image/receipt(s)` en producción con sesión viva: no medido (hardcode de `/dev/shm`).
- El incidente del stub: se cita el documento del repo; **la correspondencia exacta entre ese incidente y W-05/W-06 no está medida en esta tarea** — el capitán debe mapearla si la necesita.

## 9 · RECTIFICACIÓN R4.1 (2026-11-21) — alcance real de W-01 y exposición bajo `/jit/`

Esta sección existe porque el informe afirmaba de más. Se corrige con medición de terceros; lo que no está medido queda declarado.

### 9.1 · El disparo por zap NO está computado (corrección de una afirmación falsa)

La versión anterior decía «la URL que consume `#EXTATTRFROMURL` de OTT en cada zap». **No está sostenido.** Medido sobre la lista **completa** (verifier) y sobre una ventana de 6 MB (capitán):

| medición | valor |
|---|---|
| `APE_LISTA_1795151699916_DIRECTA_CABLEADA.m3u8` (708 400 298 B, fichero completo) — verifier | **605 988** líneas `#EXTATTRFROMURL` · **0** ocurrencias de `/jit/resolve` · 11 222 `#EXTINF` |
| `APE_LISTA_1795153321616_CDN_CABLEADA.m3u8`, primeros 6 MB (capitán) | **4 860** `EXTATTRFROMURL` · **0** `/jit/resolve` |
| ejemplo de línea (capitán) | `#EXTATTRFROMURL:X-APE-SID=803b2ba951b47000` |

Conclusión: la directiva existe y es masiva, pero **lleva un SID, no la URL del resolver**. **Origen de la URL `/jit/resolve`: NO COMPUTADO** — no está en la lista servida; candidatos a trazar (perfil del device, otra directiva, config del panel, APK): sin `archivo:línea` no se afirma. Estado correcto de W-01: **ruta expuesta y mutante; el disparo por zap NO COMPUTADO.**

### 9.2 · Exposición real: las 61 rutas son alcanzables bajo `/jit/`

Medido por el capitán (solo GET, misma ruta con y sin prefijo):

| sin prefijo | con `/jit/` |
|---|---|
| `/image/profiles` → 404 | `/jit/image/profiles` → **200 · 2625 B** |
| `/capabilities.json` → 404 | `/jit/capabilities.json` → **200 · 1104 B** |
| `/image/state` → 404 | `/jit/image/state` → **200 · 530 B** |

Causa: `location ^~ /jit/ { proxy_pass http://127.0.0.1:3099/; }` — la **barra final quita el prefijo** y no hay allowlist por ruta. El `add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS"` es **solo anuncio CORS** (no impone método). El motor escucha **solo en 127.0.0.1:3099** (`ss`), así que **nginx es el único camino público**. Las POST-only contestan `404 · 9 B` con texto de `server.js:9637` → contesta el motor, no nginx.

**Consecuencia:** las 19 rutas del §2 alcanzables por GET/POST desde Internet; el cierre **no es de la capa del motor** (va en nginx, lo coordina el capitán). R4.1 no propone tocar nginx.

### 9.3 · Las 21 entradas que escriben sin token (reconciliación del conteo)

Mi conteo medido da **20**; el capitán dice 21. Enumero para que la diferencia sea auditable:

| # | entrada | tipo de mutación | sev |
|---|---|---|---|
| 1 | `/image/config` POST | `IMAGE_CONFIG_FILE` + stopCurrent | CRITICAL (§2 #2) |
| 2 | `/image/gestor/save` POST | `GESTOR_STORE` + espejo `PROFILES_JSON` | HIGH (§2 #4, W-04) |
| 3 | `/image/gestor/restore` POST | `GESTOR_STORE` (+backup) | HIGH |
| 4 | `/image/governance` POST | `GOVERNANCE_FILE` | HIGH |
| 5 | `/image/llm-key` POST | `LLM_KEY_FILE` (escribir/borrar) | HIGH (W-03) |
| 6 | `/image/matrix` POST | `MATRIX_FILE` | HIGH |
| 7 | `/image/rules` POST | `RULES_FILE` | HIGH |
| 8 | `/jit/signal` POST | `CHANNEL_SIGNAL_FILE` + siembra `RULES_FILE` | HIGH (W-06) |
| 9 | `/jit/tune` POST | `IMAGE_CONFIG_FILE` + journal + egress | HIGH |
| 10 | `/resolve` GET | `IMAGE_CONFIG_FILE` + stopCurrent | **CRITICAL (W-01)** |
| 11 | `/jit/resolve` GET (misma guarda) | idem | **CRITICAL (W-01)** |
| 12 | `/go/<id>` GET | `IMAGE_CONFIG_FILE` + stopCurrent | **CRITICAL (W-01)** |
| 13 | `DELETE /image/rules/<id>` | `RULES_FILE` | HIGH |
| 14 | `/image/profile/align/apply` POST | `GESTOR_STORE` | HIGH |
| 15 | `/image/profile/align-all/apply` POST | `GESTOR_STORE` | HIGH |
| 16 | `/image/profile/align-loop` POST | `GESTOR_STORE` | HIGH |
| 17 | `/image/profile/align-llm` POST | `llm-pending/*.json` + journal + egress | MEDIUM |
| 18 | `/image/receipt` GET | proceso (`sh`+ffprobe ×2) + `/tmp` | MEDIUM (W-07) |
| 19 | `/image/receipts` GET | idem ×N | MEDIUM (W-07) |
| 20 | `/live/<id>/…` GET | **proceso**: `start()` → `probeSource` + `spawn` ffmpeg | HIGH (ocupa el slot único) |

**Diferencia declarada:** falta **1** entrada para llegar a 21. Candidatos descartados por lectura: `/meta/<id>.json` (`:6651`, solo lee + guard de capacidad), `/image/prisma/emit` (`:7943`, solo lee), `/image/capacity` (`:9518`), `/image/prisma/emit-all` (`:7958`). **NO COMPUTADO cuál es la 21ª**; el capitán puede señalarla y se añade.

### 9.4 · W-11 no está armado hoy

Estado de producción medido por el capitán: `/opt/ape-jit/image-config.json` → `"profile":"P3"`, `"target":"FHD_1080"`. Por tanto el escenario «perfil vacío ⇒ cualquier `?p=` escribe» es **latente**, no vigente. W-01 sigue siendo real con perfil no vacío: basta `?p=` distinto de `P3`.

### 9.5 · Gate de identidad (aceptado por el capitán para R11 y el veredicto)

Antes de cualquier verificación o despliegue: sha256 del artefacto **servido** + presencia de las rutas `/image/*`. `/health` 200 no distingue motor de stub (`INCIDENT_JIT_ENGINE_20261121.md:91-92`).

## Evidencia

```text
$ Get-FileHash IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js -Algorithm SHA256
268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0   (480976 B, 9812 líneas)

Sandbox: scratch/r4_sandbox/  · 5 corridas node 127.0.0.1:3199 · stderr vacío
  transform-rules.json 16 -> 17 (POST /image/rules)
  image-config.json profile:"P3" force_transcode:true (solo escrito por :6716/:6814)
  POST /api/config sin api-key.txt -> 503 (sin escritura)
  Get-Process ffmpeg -> vacío (cero procesos residuales)
```
