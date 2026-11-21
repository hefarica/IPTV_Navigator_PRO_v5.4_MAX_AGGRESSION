# Inventario ejecutable de las 61 rutas del motor JIT

Artefacto medido: `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` — 480976 B, 9812 líneas, sha256 `268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0`.

Extracción: `grep 'pathname ==='` sobre el fichero real → **61 líneas guard**, **66 ocurrencias** de literal, **61 rutas distintas**.
Las 5 diferencias entre ocurrencias y rutas son alias en la misma guarda (`||`) y `/image/capacity`, que aparece en dos guardas (una de ellas inalcanzable).

Clasificación: **61/61** clasificadas · **42** de sólo lectura · **19** con escritura/proceso · **0** UNKNOWN.

> Fuera de estas 61 quedan rutas por regex (no son `pathname ===`): `/playlist-calidad[-<sufijo>].m3u8`, `/jit/lists/<id>.m3u8`, `/meta/<id>.json`, `/go/<id>` (escribe config), `/image/profile/<pid>/full`, `/image/gestor/profile/<pid>`, `/image/gestor/pending/<pid>`, `DELETE /image/rules/<id>`, `/live/<id>/...`. No se inventan aquí: quedan declaradas como borde.

## Tabla

| # | ruta | método(s) | tipo | línea(s) | dependencias | segura | notas |
|---|---|---|---|---|---|---|---|
| 1 | `/APE_JIT_LIST_IDEMPOTENTE.m3u8` | ANY | lectura | 6418 | catalogo APE_JIT_LIST_IDEMPOTENTE.m3u8 | **sí** | alias del anterior; 404 si el catalogo no se ha construido |
| 2 | `/api/config` | GET, POST | lectura+escritura | 9408 | imageConfig · /opt/ape-jit/api-key.txt (X-APE-Key) | **no** | GET lee; POST fail-closed: 503 sin api-key.txt, 401 sin X-APE-Key, escribe config e idempotente si no cambia |
| 3 | `/capabilities.json` | ANY | lectura | 6605 | constantes · estado en memoria (current) | **sí** | declara limitaciones: rea_executed=false |
| 4 | `/catalog.json` | ANY | lectura | 6767 | channels.json (loadMap) | **sí** | lista id/hls/dash/json de todos los canales |
| 5 | `/crystal.json` | ANY | lectura | 6629 | constantes · current en memoria | **sí** | policy incl. truth_guard (no certifica HDR físico) |
| 6 | `/health` | ANY | lectura | 9597 | current en memoria · gateStats | **sí** | slot activo + adjudicaciones del provider gate |
| 7 | `/image/capacity` | ANY | lectura | 9518, 9521 | IMAGE_MEASURED_CAPACITY · IMAGE_TARGETS · IMAGE_LIMITS | **sí** | guard duplicado: la rama de L9521 es inalcanzable (L9518 ya devuelve) |
| 8 | `/image/cascade` | ANY | lectura | 7164 | CODEC_CASCADE · PLAYER_CAPS | **sí** | golden rule hvc1/hev1 declarada |
| 9 | `/image/catalog` | ANY | lectura | 6848 | OUTPUT_TARGETS · CODEC_CATALOG · PLAYER_CAPS · RECIPE_PRESETS | **sí** |  |
| 10 | `/image/config` | GET, POST | lectura+escritura | 9518 | IMAGE_CONFIG_FILE · imageConfig | **no** | POST escribe config y para el job en curso (stopCurrent) |
| 11 | `/image/declare` | POST | lectura | 6864 | profileMatrix · PLAYER_CAPS · CODEC_CATALOG · RECIPE_PRESETS | **sí** | POST obligatorio; declara sin persistir (declareProfile es puro) |
| 12 | `/image/fallback` | POST | lectura | 7177 | PLAYER_CAPS · OUTPUT_TARGETS · CODEC_CASCADE | **sí** | resolveFallback es puro |
| 13 | `/image/gestor/backups` | ANY | lectura | 7836 | GESTOR_BACKUP_DIR (readdir) | **sí** |  |
| 14 | `/image/gestor/journal` | ANY | lectura | 7861 | GESTOR_JOURNAL (lectura, limit<=500) | **sí** |  |
| 15 | `/image/gestor/pending` | ANY | lectura | 7869 | GESTOR_PENDING_DIR (readdir) | **sí** |  |
| 16 | `/image/gestor/profiles` | ANY | lectura | 7796 | GESTOR_STORE / PROFILES_JSON + capa emulada | **sí** | 12 perfiles (6 reales + 6 emulados) |
| 17 | `/image/gestor/restore` | POST | escritura | 7843 | GESTOR_BACKUP_DIR · GESTOR_STORE · PROFILES_JSON | **no** | restaura un backup sobre el store vigente |
| 18 | `/image/gestor/save` | POST | escritura | 7890 | GESTOR_STORE · PROFILES_JSON · GESTOR_JOURNAL | **no** | saveGestorProfiles + journal; consolida lo vigente si no llegan perfiles |
| 19 | `/image/gestor/state` | ANY | lectura | 7830 | stat de GESTOR_STORE/PROFILES_JSON | **sí** |  |
| 20 | `/image/governance` | GET, POST | lectura+escritura | 8184, 8227 | channels.json (loadMap) · profileMatrix · governance.json | **no** | GET tabla por canal; POST muta defaultProfile/overrides y persiste |
| 21 | `/image/lineup` | ANY | lectura | 8257 | channels.json (buildGovernedLineup→loadMap) · governance | **sí** | genera la lista M3U en memoria |
| 22 | `/image/llm-key` | POST | escritura | 7358 | LLM_KEY_FILE | **no** | guarda o borra la API key del LLM (clear:true) |
| 23 | `/image/llm-status` | ANY | lectura | 8033 | LLM_KEY_FILE / env DEEPSEEK_API_KEY | **sí** | no devuelve la key |
| 24 | `/image/matrix` | GET, POST | lectura+escritura | 8272, 8302 | profileMatrix · MATRIX_ALLOWED/LIMITS · /opt/ape-jit/profile-matrix.json | **no** | POST patchProfile persiste la matriz |
| 25 | `/image/optimize` | GET, POST | lectura | 8052, 8071 | tablas de cómputo | **sí** | GET lee query (incl. outFps), POST JSON; objective() puro |
| 26 | `/image/optimize-llm` | POST | lectura+egress | 7218 | LLM key · api.deepseek.com | **sí** | llama al LLM; no escribe estado (coste/cuota de red) |
| 27 | `/image/plan` | POST | lectura | 8327 | computePlan | **sí** | cómputo puro |
| 28 | `/image/plans` | ANY | lectura | 8352 | enumeratePlans | **sí** | pagina a 40 filas |
| 29 | `/image/prisma/all` | ANY | lectura | 8022 | gestor + prisma | **sí** |  |
| 30 | `/image/prisma/emit` | ANY | lectura | 7943 | gestor + prisma | **sí** |  |
| 31 | `/image/prisma/emit-all` | ANY | lectura | 7958 | gestor + governance · prisma | **sí** | base64 en chunks de 240 |
| 32 | `/image/prisma/lanes` | ANY | lectura | 7923 | constantes prisma | **sí** |  |
| 33 | `/image/prisma/plan` | ANY | lectura | 7929 | gestor | **sí** |  |
| 34 | `/image/profile/align` | POST | lectura | 7380 | gestor · objective · proposeAlignmentFull | **sí** | propuesta, no aplica |
| 35 | `/image/profile/align-all` | POST | lectura | 7489 | gestor + emulados | **sí** | dice explícitamente "No se aplico nada" |
| 36 | `/image/profile/align-all/apply` | POST | escritura | 7431 | GESTOR_STORE · PROFILES_JSON · backups · journal | **no** | aplica y persiste sólo los perfiles que pasan invariantes |
| 37 | `/image/profile/align-llm` | POST | escritura+egress | 7657 | gestor · LLM · GESTOR_PENDING_DIR | **no** | LLM + persiste la propuesta en llm-pending/<pid>.json |
| 38 | `/image/profile/align-loop` | POST | escritura | 7548 | gestor · GESTOR_STORE · PROFILES_JSON · journal | **no** | itera y persiste los convergidos |
| 39 | `/image/profile/align/apply` | POST | escritura | 7734 | GESTOR_STORE · PROFILES_JSON · journal | **no** | aplica diffs con invariantes y persiste |
| 40 | `/image/profiles` | ANY | lectura | 8382 | LAB_PROFILES · LAB_PROFILE_FALLBACK · imageConfig | **sí** | declara que ningún destino declarado es viable en este host |
| 41 | `/image/receipt` | ANY | lectura+proceso | 8000 | RECEIPT_SESSION_ROOT · ffprobe vía sh -c · /tmp | **no** | mide init+chunk concatenados; escribe /tmp/ape-receipt-<pid>-<kind>.mp4 |
| 42 | `/image/receipts` | ANY | lectura+proceso | 8010 | RECEIPT_SESSION_ROOT (readdir) · ffprobe por canal | **no** | un ffprobe por canal con sesión |
| 43 | `/image/rules` | GET, POST | lectura+escritura | 8123, 8143 | RULES_FILE · transformRules | **no** | GET lista; POST upsertRule persiste el fichero de reglas (DELETE es ruta regex fuera de 61) |
| 44 | `/image/rules/auto` | POST | lectura | 8086 | PLAYER_CAPS · tablas auto* | **sí** | autoConfig es puro |
| 45 | `/image/rules/auto-field` | ANY | lectura | 8105 | autoConfig | **sí** | filtra un campo del resultado |
| 46 | `/image/rules/resolve` | ANY | lectura | 8170 | transformRules (en memoria) | **sí** | requiere w y h |
| 47 | `/image/serial` | ANY | lectura | 7196 | CODEC_CASCADE | **sí** | serial hvc1/hev1 por tier y destino |
| 48 | `/image/state` | ANY | lectura | 8412 | sesión viva (readdir) · outputTruth · imageConfig | **sí** | sólo lee; puede devolver output_observed=null |
| 49 | `/image/streaming-health-llm` | POST | lectura+egress | 7257 | medición del cliente · LLM key · api.deepseek.com | **sí** | sin medición devuelve 400; no escribe estado |
| 50 | `/jit/api/config` | GET, POST | lectura+escritura | 9408 | imageConfig · /opt/ape-jit/api-key.txt | **no** | POST fail-closed 503/401; escribe config si cambia |
| 51 | `/jit/recipe` | ANY | lectura | 9381 | imageConfig · buildImageFilterChain | **sí** | cadena efectiva de filtros |
| 52 | `/jit/resolve` | ANY | escritura | 6698 | channels.json (loadMap) · profileMatrix · governance · IMAGE_CONFIG_FILE | **no** | alias de /resolve: mismo handler y mismos efectos |
| 53 | `/jit/signal` | GET, POST | lectura+escritura | 9199 | CHANNEL_SIGNAL_FILE · RULES_FILE (semilla) · transformRules | **no** | GET lee señales; POST escribe channel-signals.json y puede sembrar rules |
| 54 | `/jit/tune` | GET, POST | lectura+escritura+egress | 9002 | TUNE_JOURNAL · IMAGE_CONFIG_FILE · capacidad medida · LLM key | **no** | GET lista el journal; POST calcula techo, consulta LLM y persiste config+journal |
| 55 | `/jit/upscale` | ANY | lectura | 8978 | SIM_LADDER · imageConfig.ten_bit | **sí** | requiere from=ANCHOxALTO |
| 56 | `/playlist-idempotente.m3u8` | ANY | lectura | 6418 | catalogo APE_JIT_LIST_IDEMPOTENTE.m3u8 | **sí** | 404 si no se ha construido |
| 57 | `/playlist-resolver.m3u8` | ANY | lectura | 6430 | catalogo APE_JIT_LIST_EXTATTR.m3u8 | **sí** | 404 si no se ha generado |
| 58 | `/playlist-shim.m3u8` | ANY | lectura | 6470 | APE_JIT_LIST.m3u8 · ?port=/APE_SHIM_PORT | **sí** | 400 sin puerto; 500 wired_nothing si reescribe 0 canales |
| 59 | `/playlist.m3u8` | ANY | lectura | 6442 | catalogo APE_JIT_LIST.m3u8 | **sí** | 404 not built |
| 60 | `/recipe` | ANY | lectura | 9381 | imageConfig · buildImageFilterChain | **sí** | alias de /jit/recipe |
| 61 | `/resolve` | ANY | escritura | 6698 | channels.json (loadMap) · profileMatrix · governance · IMAGE_CONFIG_FILE | **no** | con ?p= válido y distinto escribe config y para el job (stopCurrent) |

## Sitios mutantes por ruta (medidos, con línea)

- `/api/config` (L9408): L9496 writeFileSync IMAGE_CONFIG_FILE.tmp · L9497 renameSync IMAGE_CONFIG_FILE
- `/image/config` (L9518): L9565 writeFileSync IMAGE_CONFIG_FILE.tmp · L9566 renameSync IMAGE_CONFIG_FILE · L9581 stopCurrent() — mata el ffmpeg en curso
- `/image/gestor/restore` (L7843): L7853 restoreGestorBackup()
- `/image/gestor/save` (L7890): L7907 saveGestorProfiles()
- `/image/governance` (L8184, L8227): L8249 saveGovernance() → governance.json
- `/image/llm-key` (L7358): L7372 saveLLMKey() · L7368 clearLLMKey()
- `/image/matrix` (L8272, L8302): L8317 patchProfile()
- `/image/profile/align-all/apply` (L7431): L7473 saveGestorProfiles()
- `/image/profile/align-llm` (L7657): L7721 saveLLMPending()
- `/image/profile/align-loop` (L7548): L7640 saveGestorProfiles()
- `/image/profile/align/apply` (L7734): L7768 saveGestorProfiles()
- `/image/receipt` (L8000): L8003 buildReceipt() → sh -c cat|ffprobe
- `/image/receipts` (L8010): L8014 buildReceipt() → sh -c cat|ffprobe
- `/image/rules` (L8123, L8143): L8153 upsertRule() → saveRules()
- `/jit/api/config` (L9408): L9496 writeFileSync IMAGE_CONFIG_FILE.tmp · L9497 renameSync IMAGE_CONFIG_FILE
- `/jit/resolve` (L6698): L6717 writeFileSync IMAGE_CONFIG_FILE · L6718 stopCurrent() — mata el ffmpeg en curso
- `/jit/signal` (L9199): L9370 saveChannelSignals() · L9214 loadRules() — siembra el fichero si falta/corrupto
- `/jit/tune` (L9002): L9170 writeFileSync IMAGE_CONFIG_FILE.tmp · L9171 renameSync IMAGE_CONFIG_FILE · L9190 appendFileSync tune-journal.jsonl
- `/resolve` (L6698): L6717 writeFileSync IMAGE_CONFIG_FILE · L6718 stopCurrent() — mata el ffmpeg en curso

## Egress de red (LLM) por ruta

- `/image/optimize-llm`: L7233 callLLM() → fetch L2982
- `/image/profile/align-llm`: L7691 callLLMAlign() → fetch L1112
- `/image/streaming-health-llm`: L7317 fetch(LLM_ENDPOINT)
- `/jit/tune`: L9122 callLLMTune() → fetch L8852

## Auth por ruta


## Cross-check mecánico

- 0 discrepancias: toda ruta marcada escritura/proceso contiene al menos un sitio mutante real en su bloque, y ninguna marcada lectura contiene alguno.

## Las 19 rutas que NO son seguras (alcance de ejecución en producción)

| ruta | efecto persistente |
|---|---|
| `/api/config` | L9496 writeFileSync IMAGE_CONFIG_FILE.tmp<br>L9497 renameSync IMAGE_CONFIG_FILE |
| `/image/config` | L9565 writeFileSync IMAGE_CONFIG_FILE.tmp<br>L9566 renameSync IMAGE_CONFIG_FILE<br>L9581 stopCurrent() — mata el ffmpeg en curso |
| `/image/gestor/restore` | L7853 restoreGestorBackup() |
| `/image/gestor/save` | L7907 saveGestorProfiles() |
| `/image/governance` | L8249 saveGovernance() → governance.json |
| `/image/llm-key` | L7372 saveLLMKey()<br>L7368 clearLLMKey() |
| `/image/matrix` | L8317 patchProfile() |
| `/image/profile/align-all/apply` | L7473 saveGestorProfiles() |
| `/image/profile/align-llm` | L7721 saveLLMPending() |
| `/image/profile/align-loop` | L7640 saveGestorProfiles() |
| `/image/profile/align/apply` | L7768 saveGestorProfiles() |
| `/image/receipt` | L8003 buildReceipt() → sh -c cat|ffprobe |
| `/image/receipts` | L8014 buildReceipt() → sh -c cat|ffprobe |
| `/image/rules` | L8153 upsertRule() → saveRules() |
| `/jit/api/config` | L9496 writeFileSync IMAGE_CONFIG_FILE.tmp<br>L9497 renameSync IMAGE_CONFIG_FILE |
| `/jit/resolve` | L6717 writeFileSync IMAGE_CONFIG_FILE<br>L6718 stopCurrent() — mata el ffmpeg en curso |
| `/jit/signal` | L9370 saveChannelSignals()<br>L9214 loadRules() — siembra el fichero si falta/corrupto |
| `/jit/tune` | L9170 writeFileSync IMAGE_CONFIG_FILE.tmp<br>L9171 renameSync IMAGE_CONFIG_FILE<br>L9190 appendFileSync tune-journal.jsonl |
| `/resolve` | L6717 writeFileSync IMAGE_CONFIG_FILE<br>L6718 stopCurrent() — mata el ffmpeg en curso |

## Playbook de ejecución (lo que el capitán puede tocar sin cambiar nada)

- **Se pueden ejecutar sin condición (42 rutas)**: cualquier método HTTP, siempre que no se use `POST` en las que exigen POST… es decir, las de sólo lectura no escriben con ningún método porque no tienen rama de escritura.
- **Exigen POST y no escriben (5)**: `/image/declare`, `/image/fallback`, `/image/optimize-llm`, `/image/streaming-health-llm`, `/image/rules/auto` → seguras, aunque las dos `*-llm` gastan cuota de LLM (egress).
- **NO ejecutar sin autorización (19)**: escriben fichero de estado y/o lanzan proceso. Las más delicadas: `/resolve` y `/image/config` (paran el ffmpeg en curso con `stopCurrent`), `/image/gestor/restore` y `/image/gestor/save` (sobrescriben el store de perfiles del Gestor), `/image/rules` POST (reescribe la tabla de 16 reglas que usa `/jit/signal`), `/jit/api/config` POST (config de imagen).
- **Egress a LLM (4)**: `/image/optimize-llm`, `/image/streaming-health-llm`, `/image/profile/align-llm`, `/jit/tune`. Las dos primeras no escriben; las dos últimas sí.

## Hallazgos de la lectura

- **Alias reales (5 pares)**: `/playlist-idempotente.m3u8`≡`/APE_JIT_LIST_IDEMPOTENTE.m3u8`, `/resolve`≡`/jit/resolve`, `/jit/recipe`≡`/recipe`, `/jit/api/config`≡`/api/config`, `/image/config`≡`/image/capacity` (misma guarda). Son el mismo handler: 66 ocurrencias → 61 rutas distintas.
- **Código inalcanzable**: la rama `if (u.pathname === '/image/capacity')` de **L9521** nunca se ejecuta, porque la guarda de **L9518** ya incluye `/image/capacity` y devuelve en L9523-9526. Duplicado muerto, no defecto funcional.
- **Sin auth en las 61**: no hay token ni allowlist en la guarda. La única ruta con control es `/jit/api/config` **POST**, que exige `X-APE-Key` contra `/opt/ape-jit/api-key.txt` y es **fail-closed**: sin fichero → 503, clave distinta → 401. Todo lo demás (`/image/gestor/save`, `/image/governance` POST, `/jit/tune` POST, `/image/config` POST) escribe sin credencial: el perímetro tendría que estar en nginx.
- **Sólo 2 rutas de las 61 detienen el job ffmpeg en curso**: `/resolve` (al cambiar de perfil) y `/image/config` POST. El resto de la escritura es a ficheros de estado.
- **`/image/receipt` y `/image/receipts` lanzan `sh -c 'cat | ffprobe'`** y dejan `/tmp/ape-receipt-<pid>-<kind>.mp4`: no mutan estado persistente pero sí consumen CPU y disco temporal, en un host con un solo slot de transcode.
- **`/jit/signal` POST puede sembrar el fichero de reglas**: llama `loadRules()` (L9214), que hace `saveRules()` si el fichero falta, está corrupto o vacío. Es una escritura condicional, no evidente desde el nombre.
- **`/image/state` es la única fuente de verdad del job vivo** (slot, pid, outputTruth, filtro efectivo) y es de sólo lectura: es el endpoint natural para el arnés de verificación.

## Borde declarado (fuera de las 61)

Rutas por regex o `startsWith`, no contadas aquí porque el criterio del encargo es `pathname === '<ruta>'`:

`/playlist-calidad[-<sufijo>].m3u8` (L6403) · `/jit/lists/<nombre>.m3u8` (L6522) · `/meta/<id>.json` (L6651) · `/go/<id>` (L6783, **escribe IMAGE_CONFIG_FILE** en L6815) · `/image/profile/<pid>/full` (L7069) · `/image/gestor/profile/<pid>` (L7784) · `/image/gestor/pending/<pid>` (L7876) · `DELETE /image/rules/<id>` (L8161) · `/live/<id>/manifest.json` (L9610) · `/live/<id>/…` (L9636, arranca el JIT: `start()` → ffprobe + spawn ffmpeg).

## Evidencia

```text
$ Get-FileHash IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js -Algorithm SHA256
268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0
BYTES=480976   LINES=9812

$ Select-String -Pattern "pathname\s*===\s*'([^']+)'" -AllMatches  (sobre el fichero real)
LINES_WITH_MATCH=61   LITERAL_MATCHES=66   DISTINCT=61

$ node scratch/jit_route_scan.js IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js
{ "guards": 61, "occurrences": 66, "distinct": 61, "total_block_lines": 2058 }

$ node scratch/jit_build_artifacts.js
{ "count": { "routes": 61, "read": 42, "write": 19, "unknown": 0 }, "problems": [], "routes": 61 }
```

Conteo final: **61/61 clasificadas · 0 UNKNOWN · 0 discrepancias** en el cross-check mecánico contra los sitios de escritura/proceso del propio fichero.
