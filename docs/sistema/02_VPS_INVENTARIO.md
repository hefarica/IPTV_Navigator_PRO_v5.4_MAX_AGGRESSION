# 02 · INVENTARIO DEL VPS `iptv-ape.duckdns.org`

**Documento:** qué contiene el VPS, qué de eso existe como fuente en este árbol, y qué
interactúa con la APK `com.ape.crystalagent`.

**Fecha de redacción:** 2026-11-12 (America/Bogota, UTC−05:00).
**Rama medida:** `deploy/engine-restart-20261112` @ `f5a3b48ce6e63ee9c373befa2d6dac9b4b5cb9d3`
(`git rev-parse`, 58 entradas en `git status --porcelain`).

---

## 0 · Regla de honestidad de este documento

Hay **tres clases de afirmación** aquí y cada una va etiquetada. No se mezclan.

| Etiqueta | Significado | Cómo se reconoce |
|---|---|---|
| **MEDIDO HOY** | Lo conté/leí en este árbol el 2026-11-12 | cita `ruta:línea` o comando con su salida |
| **HEREDADO 2026-11-07** | Medición de otra sesión, sobre el VPS vivo, con `curl` desde `ssh hetzner-iptv` | prefijo `HEREDADO` + fecha en la misma fila |
| **HEREDADO 2026-11-12** | Recibo de despliegue/auditoría de esa fecha, copiado en el árbol | prefijo `HEREDADO` + fecha |
| **NO MEDIDO HOY** | No hay SSH desde este entorno (ver §10) | se declara, no se rellena |

**No hay SSH en este entorno.** Todo lo que sea "código HTTP real del VPS" es **heredado** y se
declara con su fecha. Lo que sí se midió hoy es **la fuente en el árbol**: qué ficheros existen,
qué bytes, qué SHA-256, qué líneas. Esa es la parte que se puede reproducir desde el repo.

---

## 1 · Qué hay: inventario por capa (MEDIDO HOY)

Conteo por `Get-ChildItem -Recurse -File`, excluyendo nada (incluye `__pycache__`, que se reporta
aparte cuando importa).

### 1.1 · `IPTV_v5.4_MAX_AGGRESSION/vps/` — **468 ficheros**

| Subárbol | Ficheros | Qué es |
|---|---:|---|
| `vps/prisma/` | **158** | PHP: APIs + libs + CLI + config + tests |
| `vps/nginx/` | **51** | `conf.d/` 6 · `lua/` 30 (+2 sandbox) · `snippets/` 14 |
| `vps/ape-realtime-guardian/` | **78** | Python + tests + systemd (mayoría no desplegado) |
| `vps/production_mirror/` | **38** | espejo de producción |
| `vps/vps-live-snapshot-20260428/` | **38** | snapshot histórico 2026-04-28 |
| `vps/prisma/players/` (dentro de prisma) | 31 | adaptadores de player, agentes, `rust-visual-engine` |
| `vps/sentinel/` | **12** | `lib/` 7 + `profiles/` 3 |
| `vps/systemd/` | **8** | units y timers |
| `vps/ape-jit/` | **7** | `server.js`, `reconcile.js`, 2 units, `.path`, `.timer`, `README.md` |
| `vps/ape-telemetry-installer/` | 7 | instalador de telemetría |
| `vps/scripts/` | 7 | — |
| `vps/ape-uhdx/` | 4 | `ape_4k_manifest.json`, `visual_profiles.json` |
| `vps/deploy/` | 4 | — |
| `vps/ape-pulse/` | **2** | `ape-pulse-sync.sh` (7.214 B), `ape-pulse-canary-worker.sh` (2.802 B) |
| `vps/api/` (2) · `vps/ara/` (2) · `vps/cmaf_engine/` (4) · `vps/enroll/` (3) · `vps/landing/` (5) · `vps/network/` (5) · `vps/prisma-guardian-bridge/` (5) | | — |

### 1.2 · `ara-x/vps/` — **44 ficheros**

`crystal/` **26** (+12 en `crystal/profiles/`) · `lua/` 4 · `php/` 4 (+1 en `php/config/`) ·
`schema/` 4 · `nginx/` 3 · `client/` 1 · `config/` 1.

Es el subárbol del contrato `/sync` y del bloque ARA Crystal.

### 1.3 · `vps/` (raíz del repo) — **17 ficheros**

| Ruta | Bytes | Contenido |
|---|---:|---|
| `vps/prisma/api/prisma-service-status.php` | 6.913 | único PHP bajo `vps/prisma/` en la raíz |
| `vps/nginx/live-baseline-2026-11-02/` | 8 ficheros | **baseline versionado del vhost vivo** (fechado 2026-11-02) |
| `vps/nginx/snippets/ape-jit.conf` | 3.677 | snippet JIT, copia de referencia del desplegado |
| `vps/ara/` | 4 | `ara-wake-watchdog.py` + `.service` + `.timer` + `.pyc` |
| `vps/bin/` | 3 | — |

### 1.4 · Ficheros de vídeo: **cero**. Ver §7.

---

## 2 · Tabla de endpoints

### 2.1 · Medición heredada del **2026-11-07**

**Fuente:** `.agents/skills/iptv-ape-apk-vps-contract-alignment/SKILL.md`, PARTE 3 ("Matriz de
endpoints medida (2026-11-07)").
**Sonda original:** `ssh hetzner-iptv` → `curl -k -H 'Host: iptv-ape.duckdns.org' https://127.0.0.1<ruta>`.
**Estado hoy:** **NO MEDIDO HOY.** Los códigos son de esa fecha, no de esta sesión.

| # | Ruta | Método | Código (2026-11-07) | Qué devuelve | Vivo | Fuente en el árbol (MEDIDO HOY) |
|---|---|---|---|:--:|---|
| 1 | `/sync` | POST `{}` | **400** | `{"ok":false,"error":"invalid_payload","detail":"bad_envelope"}` | **SÍ** | `ara-x/vps/php/ara-sync.php` (54.912 B, `419fe6f2…`) |
| 2 | `/sync` | GET | **405** | — + `x-ape-ara-sync: v2`, `Retry-After: 30` | SÍ (POST-only) | `ara-x/vps/nginx/ara-sync.conf:23-25` (`return 405`), `:44` (header v2), `:46` (`Retry-After 30`) |
| 3 | `/ara/version.json` | GET | **200** | `versionCode: 651`, `package: com.ape.crystalagent` | SÍ pero **declara 651** | copia en repo: `IPTV_v5.4_MAX_AGGRESSION/vps/ara/version.json:2` |
| 4 | `/ara/agent.apk` | GET | **200** | sha256 `8d3b1458…`, 25.678.434 B | SÍ, **no es la 652/653** | `version.json:4-5` (sha256 + size) |
| 5 | `/ara/events` | GET | **401** | `{"ok":false,"error":"UNAUTHORIZED"}` | vivo, pide auth | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/events-sse.php:29` |
| 6 | `/ara/state` | GET | **401** | `{"error":"unauthorized"}` | vivo, pide auth | `ara-x/vps/crystal/ara-state.conf` + `ara-x/vps/crystal/state.php` |
| 7 | `/ara/sse` | GET | **401** | `{"error":"unauthorized"}` | vivo, pide auth | `ara-x/vps/crystal/ara-sse.conf` + `ara-x/vps/crystal/sse.php` |
| 8 | `/ara/enroll` | — | **403** | HTML `403 Forbidden` de **nginx** | **bloqueado en nginx, no en PHP** | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/prisma-ara-enroll.conf:12-14` |
| 9 | `/prisma/api/token-vault.php` | GET | **401** | `{"ok":false,"error":"UNAUTHORIZED"}` | vivo | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/token-vault.php` (4.599 B) |
| 10 | `/prisma/api/ara-device.php` | GET | **400** | `{"ok":false,"error":"NO_ACTION","message":"…?action=devices\|version\|job\|probe\|install…"}` | vivo | `…/vps/prisma/api/ara-device.php` (30.514 B) |
| 11 | `/prisma/api/ara-enroll.php` | — | **405** | `{"ok":false,"error":"POST_ONLY"}` | vivo (**el bueno es este**) | `…/vps/prisma/api/ara-enroll.php` (3.746 B) |
| 12 | `/prisma/api/url2-cartridge.php` | GET | **400** | `#EXTM3U## URL-2: falta u…` | vivo | `…/vps/prisma/api/url2-cartridge.php` (400.797 B) |
| 13 | `/prisma/api/ape-cartridge-bulk.php` | GET | **200** | `{"P0":{"hevc_forced":1,"bitrate_bps":80000000,…}}` | vivo, entrega datos | **AUSENTE EN EL ÁRBOL** — ver §9.3 |
| 14 | `/prisma/api/ape-last.php` | GET | **200** | `{"ok":true,…}` | vivo | `…/vps/prisma/api/ape-last.php` (5.049 B) |
| 15 | `/prisma/api/ape-output-config.php` | GET | **200** | `{"ok":true,"delta_pct":15,…}` | vivo | `…/vps/prisma/api/ape-output-config.php` (3.315 B) |
| 16 | **`/api/health`** | GET | **404** | — | **MUERTO** — y es el `health_url` | ver §8.1 |
| 17 | **`/api/resolve_quality`** | GET | **404** | — | **MUERTO** — y es el `resolve_probe_url` | ver §8.1 |
| 18 | `/api/health.php` | GET | **200** | — | vivo | `IPTV_v5.4_MAX_AGGRESSION/vps/api/health.php` |
| 19 | `/health.php` | GET | **200** | — | vivo | idem (mismo fichero vía `location ~ \.php$`, baseline `:85`) |

### 2.2 · Añadidos por medición heredada del **2026-11-12** (JIT)

| # | Ruta | Método | Código | Cuerpo observado | Fuente |
|---|---|---|---|---|:--:|
| 20 | `/jit/health` | GET | **200** | `{"ok":true,"active":null,"pid":null,"uptime_s":0}` | HEREDADO 2026-11-12T06:3x UTC — `docs/audits/DEPLOY_ENGINE_RECEIPT_20261112.md:24` |
| 21 | `/jit/meta/1.json` | GET | **200** | 817 bytes | HEREDADO 2026-11-12 — `docs/audits/IDEMPOTENCY_20261112.md:30` |
| 22 | `/lists/APE_LISTA_1794100720046.m3u8` | GET | **200** | — | HEREDADO 2026-11-12 — `DEPLOY_ENGINE_RECEIPT_20261112.md:26` |

### 2.3 · Ruta `/health` del vhost (declarada en el baseline, **NO RE-MEDIDA**)

`vps/nginx/live-baseline-2026-11-02/sites-enabled-default.conf:72-75` declara un `/health` que
**responde nginx sin tocar PHP**:

```nginx
location = /health {
    add_header Content-Type text/plain;
    return 200 "OK\n";
}
```

Eso es `/health` (sin `.php`), distinto de `/health.php` y de `/api/health`. **No re-medido hoy**:
el baseline es un fichero fechado 2026-11-02 en el árbol, no una lectura del VPS.

---

## 3 · El protocolo `/sync` — contrato exacto

### 3.1 · Dónde está el fichero

`ara-x/vps/php/ara-sync.php` — **54.912 bytes**, SHA-256
`419fe6f23c15717da06e63c5a33ef9994f1caa6fae85e4cd9970d072eaa740d1` (MEDIDO HOY con
`Get-FileHash`). Ese **es exactamente el hash que la skill heredada registra para
`/var/www/html/prisma/api/ara-sync.php` en el VPS el 2026-11-07**.

> **Paridad:** el artefacto del repo tiene hoy el mismo digest que la medición heredada del VPS.
> Es una confirmación **del lado repo** de la paridad heredada — no una re-medición del VPS.

**Trampa CRLF, verificada aquí:** normalizar a LF cambia el hash.
`BYTES=54912 → HASH_RAW=419fe6f2…`; `BYTES_LF=54906 → HASH_LF=10e1d656…`. El fichero tiene 6
`CRLF` sueltos. **Se hashea crudo**, como hace `sha256sum`. Normalizar "para comparar" habría
producido un falso negativo.

### 3.2 · Constantes

`ara-x/vps/php/ara-sync.php:34-36`:

```php
const ARA_SYNC_VERSION = 2;
const ARA_REQ_PREFIX  = 'ARA-X-SYNC-V1';
const ARA_RESP_PREFIX = 'ARA-X-SYNC-RESP-V1';
```

Coinciden con la APK (`SyncProtocol.kt`): `VERSION = 2`, `REQ_PREFIX`, `RESP_PREFIX`.

### 3.3 · Canonical firmado — request

`ara-x/vps/php/ara-sync.php:1231-1244`:

```php
$bodyHash = hash('sha256', $raw);
$canonical = implode("\n", [
    ARA_REQ_PREFIX,                    // "ARA-X-SYNC-V1"
    (string) $payload['device_id'],
    (string) $payload['seq'],
    (string) $payload['ts'],
    (string) $payload['nonce'],
    $bodyHash,                         // sha256hex del body CRUDO
]);
$expected  = hash_hmac('sha256', $canonical, $secret);
$presented = strtolower((string) ($_SERVER['HTTP_X_ARA_SIG'] ?? ''));
if (!(bool) preg_match('/^[a-f0-9]{64}$/', $presented) || !hash_equals($expected, $presented)) {
    ara_sync_unauthorized();
}
```

### 3.4 · Canonical firmado — response

`ara-x/vps/php/ara-sync.php:1366-1373`:

```php
$rawResponse = json_encode($policy, JSON_UNESCAPED_SLASHES);
$respSig = hash_hmac('sha256', implode("\n", [
    ARA_RESP_PREFIX,                   // "ARA-X-SYNC-RESP-V1"
    (string) $payload['device_id'],
    (string) $payload['seq'],          // el seq de la REQUEST
    (string) $policy['ts'],            // el ts de la RESPUESTA
    hash('sha256', $rawResponse),
]), $secret);
```

Se emite en `header('X-ARA-Sig: ' . $respSig)` — `ara-sync.php:1398` (y en las ramas shadow/replay
`:1300` y `:1314`).

### 3.5 · Cabeceras de autenticación — **la skill se contradice con el código**

| Cabecera | Dónde la lee el servidor | Dónde la escribe la APK |
|---|---|---|
| `X-ARA-Key-Id` | `ara-sync.php:1196` → `$_SERVER['HTTP_X_ARA_KEY_ID']` | `SyncClient.kt:79` |
| `X-ARA-Sig` | `ara-sync.php:1241` → `$_SERVER['HTTP_X_ARA_SIG']` | `SyncClient.kt:80` |
| `X-ARA-Sync-Version` | — | `SyncClient.kt:78` |

La skill heredada (PARTE 3) dice que `sig` va en el header **`Authorization`**. **El código dice
`X-ARA-Sig`**, en el PHP (`:1241`) y en la APK (`SyncClient.kt:80`), y la respuesta también llega
en `X-ARA-Sig` (`SyncClient.kt:108`). El snippet de nginx sí pasa `HTTP_AUTHORIZATION`
(`ara-sync.conf:36`), pero eso no es lo que el PHP valida. **Gana el código.** Anotado en §9.1.

### 3.6 · Comportamiento por diseño (snippet nginx)

`ara-x/vps/nginx/ara-sync.conf`:

| Línea | Invariante |
|---|---|
| `:23-25` | `if ($request_method !~ ^(POST)$) { return 405; }` → explica el 405 del GET |
| `:27` | `limit_req zone=ara_sync burst=6 nodelay` |
| `:29-30` | `client_max_body_size 16k` (coincide con el tope duro del PHP) |
| `:34` | `fastcgi_param SCRIPT_FILENAME /var/www/html/prisma/api/ara-sync.php` |
| `:44` | `add_header X-APE-ARA-Sync "v2"` → el header medido en el 405 sale de **aquí** |
| `:46` | `add_header Retry-After 30` (`limit_req` no lo emite solo) |

**El handler real de `/sync` es PHP, no Lua.** Cabecera del propio fichero: `:1` dice
`STAGED, NOT DEPLOYED`. `ara-x/vps/lua/ara_x_sync.lua` existe y se despliega
(`_vps_stage/deploy/manifest.tsv`, fila 14 → `/etc/nginx/lua/ara_x_sync.lua`) pero **no está
cableado a ningún `location`** en lo que este árbol declara. Doctrina del repo: se corrige el
comentario, no el servidor.

### 3.7 · Secuencia y anti-replay

- `seq` monotónico por device, en `ara_sync_state` — `ara-sync.php:1386-1389`.
- `seq <= last_seq` **no** devuelve 409: se reanuda y se anota `seq_reset` — `:1356-1364`
  (fix 2026-11-05: el APK reinicia a 1 al reinstalarse y quedaba en deadlock con `last_seq=1279`).
- Nonce repetido **sí** da 409 (más arriba, `:1376-1380` y la comprobación previa).
- TTL de `ts`: `ARA_TS_SKEW` — `:1247-1249`.
- Replay cache con poda a `ARA_MAX_REPLAY_ROWS` — `:1390-1392`.

### 3.8 · Estado del despliegue `/sync` (heredado)

`docs/audits/DEPLOY_ENGINE_RECEIPT_20261112.md:50` y `docs/audits/IDEMPOTENCY_20261112.md:21`
registran `sync-smoke 11/11 OK` y que **faltan `SYNC_KEY` y `SYNC_TOKEN` en el Environment
`production`** de GitHub, por lo que `mode=deploy` del job `4 · deploy` no pasa. Es configuración
de CI, no del endpoint.

---

## 4 · `device_settings` — el único canal de escritura real hacia el device

### 4.1 · Productor: el VPS

**`IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php:56-82`** — `ape_mesh_device_settings()`.

Formato declarado en el docblock, `:54`:

```
Formato: "<ns> <key> <val>" (lo valida la allowlist del SettingsApplier)      ← ape_mesh.php:54
```

Filas base **incondicionales**, `:61-65`:

| Línea | Fila |
|---|---|
| `:62` | `global match_content_frame_rate 1` — anti-judder universal |
| `:63` | `global hdr_conversion_mode 1` — incondicional (doctrina MAX IMAGE) |
| `:64` | `global minimal_post_processing_allowed 0` — full TV post-proc |

Fusión VPP opcional, `:70-80`: **solo** si `$vpp['allowed']` es verdadero, cada lever debe existir
en `ape_ff_settings_ns_map()` (`:76`, allowlist real, sin duplicar claves) y el valor debe ser
numérico de 1-4 dígitos (`:77`). Sin `$vpp` **la salida es exactamente la de hoy** (`:69`).

### 4.2 · Transporte: el JSON de feed-forward

| Fichero:línea | Qué hace |
|---|---|
| `…/vps/prisma/api/ape-feedforward.php:52` | `$device_settings = ape_mesh_device_settings($streamInfo);` |
| `…/vps/prisma/api/ape-feedforward.php:64` | re-llama con `$vpp` **solo** si `allowed` |
| `…/vps/prisma/api/ape-feedforward.php:78` | `'device_settings' => $device_settings` en el JSON |
| `…/vps/prisma/api/ape-feedforward.php:79` | nota del contrato: `presets=list-level; device_settings=daemon aplica (allowlist). NO STREAM-INF` |
| `…/vps/prisma/api/ape-feedforward-stream.php:90` | mismo productor en la variante de stream |

**Consecuencia dura:** `device_settings` **no** viaja en la lista `.m3u8`. Viaja en una respuesta
JSON que el daemon consume. Los `EXTVLCOPT`/`KODIPROP` son otra cosa: van por la lista.

### 4.3 · Consumidor: la APK

| Fichero:línea | Qué hace |
|---|---|
| `…/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/SettingsApplier.kt:30` | `/** device_settings = lista de "<ns> <key> <val>" que el VPS computó … */` |
| `SettingsApplier.kt:38` | `s.trim().split(Regex("\\s+"), limit = 3)` → parseo de 3 campos |
| `SettingsApplier.kt:40` | `val ns = p[0]; val key = p[1]; val value = p[2]` |
| `SettingsApplier.kt:42` | rechazo logueado si no pasa allowlist o valor inválido |
| `SettingsApplier.kt:127-128` | `isAllowed(ns, key, value)` — allowlist **por key**, cualquier ns |
| `SettingsApplier.kt:132-136` | TRY-BOTH-NS: el ns real del lever varía por SoC; `putSetting` prueba donde existe |
| `SyncClient.kt:238` | `/** Filas device_settings: 3 base (D4) + levers, SIN duplicar claves y sólo con levers allowlisted. */` |

El aplicador es **puro**: no infiere nada (`SettingsApplier.kt:17`). El VPS decide, el daemon valida
contra allowlist y aplica.

### 4.4 · Estado del productor

`device_settings` aparece en **2 ficheros** de `IPTV_v5.4_MAX_AGGRESSION/vps/` como productor
(`ape_mesh.php`, y sus 2 consumidores PHP). `hdr_conversion_mode` aparece en
`…/vps/prisma/lib/ape_mesh.php` (4), `ape_device_quality.php` (4),
`ape-feedforward-stream.php` (1), `phase_g_delta_hook.php` (1), `prisma-adb-quality.php` (1),
`cli/push_pq_profile.php` (1), `players/agent/ape-outbound-agent.sh` (1),
`players/lib/visual_payload_apply.sh` (2) — conteo `git grep -c` MEDIDO HOY.

---

## 5 · JIT y Canary — estado real

### 5.1 · El motor está **arriba** pero **idle**

`HEREDADO 2026-11-12T06:3x UTC` — `docs/audits/DEPLOY_ENGINE_RECEIPT_20261112.md:24`:

```
GET https://iptv-ape.duckdns.org/jit/health   → 200 · {"ok":true,"active":null,"pid":null,"uptime_s":0}
```

Re-medido el mismo día `02:08:37-05:00` con cuerpo idéntico:
`docs/audits/IDEMPOTENCY_20261112.md:29`.

**Lectura correcta del dato — y su límite.** El código de §5.2 dice exactamente qué significa cada
campo: `active`/`pid` son `null` cuando `current == null` (ningún canal en curso, ningún transcode
vivo) y `uptime_s` se calcula como `Math.round((Date.now() - current.started) / 1000)` **solo si
hay sesión**; sin sesión vale `0` por la rama `: current ? … : 0` del ternario (`server.js:831`).

⇒ `uptime_s:0` prueba **"no hay sesión activa"**. **No prueba** "nunca procesó un canal en toda la
vida del servicio": un reinicio del proceso también devuelve el contador a 0. Lo que sí se puede
afirmar con dos muestras separadas casi una semana (`2026-11-08` en
`docs/audits/INFORME_FINAL_VERIFICACION_20261108.md:73` y `2026-11-12` en
`DEPLOY_ENGINE_RECEIPT_20261112.md:24`) es que **en ambas ventanas el motor estaba sin sesión** —
consistente con "nunca procesó", no demostrativo de ello.

`docs/audits/INFORME_FINAL_VERIFICACION_20261108.md:73` hace la inferencia fuerte ("nunca procesó un
canal"). Se cita como opinión de ese informe, **no como hecho cerrado por `uptime_s:0`**.

### 5.2 · El código que sirve ese endpoint (MEDIDO HOY)

`/jit/health` → nginx `location ^~ /jit/` → `proxy_pass http://127.0.0.1:3099/`
(`vps/nginx/snippets/ape-jit.conf:40-41`). El handler es:

`tools/lab/ape-jit/server.js` (el desplegado; ver 5.3), `:825-833`:

```js
if (u.pathname === '/health') {
  setNoCacheHeaders(res);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({
    ok: true, active: current ? current.id : null,
    pid: current ? current.child.pid : null,
    uptime_s: current ? Math.round((Date.now() - current.started) / 1000) : 0,
  }));
}
```

`current == null` → exactamente `{ok:true,active:null,pid:null,uptime_s:0}`. La forma del cuerpo
medido queda explicada por el código.

### 5.3 · **El `server.js` de `vps/ape-jit/` NO es el que corre** — tres ficheros, tres hashes

MEDIDO HOY (tamaño + SHA-256):

| Fichero | Bytes | SHA-256 (16) | ¿Desplegado? |
|---|---:|---|---|
| **`tools/lab/ape-jit/server.js`** | **449.392** | `290b11030f3b6bf9…` | **SÍ → `/opt/ape-jit/server.js`** (`manifest.tsv`, fila 31) |
| `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` | 45.535 | `8405f78412dc2a98…` | no |
| `vps_jit/server.js` | 29.624 | `e400fa197b3b58bc…` | no |

Confirmado por dos vías independientes:
- `docs/audits/ANTI_DEGRADATION_GATE_FALSE_POSITIVE_20261113.md:91-97`: los tres hashes son
  distintos; el único que coincide con el pin del contrato es el que instala el manifiesto.
- `.github/workflows/deploy-vps.yml:765,787`: `SHA_PIN=290b11030f3b…`; `:766` verifica el hash
  **local** de `tools/lab/ape-jit/server.js` contra el pin y `:775-780` verifica el **remoto** tras
  `install`. Un solo fichero, verificado en los dos extremos.
- `contracts/canary_jit_contract_v1.json:317,325`: `deployable_engine_sha256 = 290b1103…`.

> **Para quien documente el sistema:** `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` es un
> programa **distinto**, 10× más pequeño, que **no se ejecuta**. Leerlo para entender el motor
> desplegado es leer código muerto.

### 5.4 · El JIT **sí puede** servir vídeo — pero no se le pidió

`IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/README.md:28` declara las rutas
`/jit/live/<id>/master.m3u8|manifest.mpd|manifest.json|media_N.m3u8|chunk-*.m4s` y
`README.md:254-255` documenta una medición (`segmento: HTTP 200 · 2.233.105 B · video/iso.segment`).

**Por tanto la afirmación correcta no es "el JIT no sirve vídeo". Es:**
`/jit/health` mide `uptime_s:0` y `active:null` ⇒ **no hay ningún transcode en curso y nunca lo
hubo en la ventana medida**. El recibo de deploy lo declara explícitamente
(`DEPLOY_ENGINE_RECEIPT_20261112.md:57`): *"Que `/jit/live/...` sirva video: solo se probó `/health`
y `/meta`; no se arrancó ningún transcode a propósito."*

⇒ **El JIT no está en el camino de vídeo de la operación real hoy.** No porque no pueda, sino
porque ningún cliente lo invocó.

### 5.5 · Canary: el timer está **detenido a propósito**

`HEREDADO 2026-11-12` — `docs/audits/DEPLOY_ENGINE_RECEIPT_20261112.md:38-46`:

| | Antes | Ahora |
|---|---|---|
| `ape-pulse-canary.timer` | `active` (cada 20 s) | **`inactive`** (detenido a propósito) |

Razón documentada (`:42`): el timer disparaba cada 20 s y su worker hace POST a `/jit/signal`; con
el motor arriba puede pedir trabajo y comerse la CPU — la cadena del 2026-11-09 (3,37 fps del bucle
4K contra 25 fps de fuente; el operador se quedó sin TV). **Reversión:**
`sudo systemctl start ape-pulse-canary.timer` (`:45`).

`deploy-vps.yml:788-792` reproduce el guardia en cada deploy: lee el estado del timer y si está
`active` lo **detiene antes** de reiniciar el motor.

**El bucle Canary↔JIT no está desplegado.** `contracts/canary_jit_contract_v1.json:8`:
*"El BUCLE Canary<->JIT SIGUE SIN DESPLEGAR: `deployability.loop_artifact.manifest_rows = 0`."*
Lo que sí está en el manifiesto son 3 filas de Canary (`_vps_stage/canary/ara-skill`,
`ape-visual-emulate.sh`, `ape-canary@.service`) — piezas, no el bucle.

---

## 6 · Cómo se despliega al VPS (el canal)

**Dos workflows manuales** (`workflow_dispatch`), no push automático:

| Workflow | Líneas | Qué hace |
|---|---:|---|
| `.github/workflows/deploy-vps.yml` | 47.766 B | inventario → dry-run → deploy → validate → canary. SSH con `VPS_SSH_KEY`/`VPS_KNOWN_HOSTS`, `VPS_USER@VPS_HOST` (`:39-40,63-65`) |
| `.github/workflows/ape-deploy-frontend.yml` | 54.534 B | instala JS en `/var/www/html/js/ape-v9/`, `sha256sum` remoto, regenera `.gz`, `nginx -t` + `nginx -s reload` (`:189-231`) |

**El smoke se hace con cabecera `Host`** — y eso es doctrina, no capricho:
`deploy-vps.yml:143,191,194,216-219` usan siempre
`curl -H "Host: iptv-ape.duckdns.org" https://127.0.0.1/...`. Sin ella la petición cae al vhost por
defecto y no mide el sitio.

**Tercer canal, en el repo:** `_vps_stage/deploy/` (18 ficheros) con `manifest.tsv` como fuente de
verdad. MEDIDO HOY:

| Métrica | Valor | Cómo |
|---|---:|---|
| Líneas del fichero | 61 | `Get-Content` |
| **Filas de datos** | **33** | excluyendo líneas `#` |
| **Fuentes que existen** | **33/33** | `Test-Path` por fila; **0 ausentes** |
| Origen `_vps_stage/` | 20 | — |
| Origen `vps/` o `IPTV_v5.4_MAX_AGGRESSION/vps/` | **6** | filas 17,18,19,21,32,33 |
| Origen `ara-x/vps/` | 5 | filas 11-15 |
| Origen `tools/lab/ape-jit/` | 1 | fila 31 → `/opt/ape-jit/server.js` |
| Origen `frontend/` | 1 | fila 20 |

El "6 apuntan a `vps/`" del brief **se reproduce** con la regla "prefijo `vps/` o
`IPTV_v5.4_MAX_AGGRESSION/vps/`". Con una regla más laxa (cualquier ruta que contenga `/vps/`)
salen **11**, porque suma las 5 de `ara-x/vps/`. Ambas cifras son correctas con su regla; §9.2.

---

## 7 · La distinción crítica: **el VPS es metadata-only, no toca píxeles**

### 7.1 · No transporta vídeo — el candado está en el vhost

`vps/nginx/live-baseline-2026-11-02/sites-enabled-default.conf`:

```nginx
# :39  # APE-SEC 2026-10-26: el candado \.(ts|m4s|mp4) -> 404 quedaba sombreado bajo /cdn/
# :41  # Verificado: /cdn/...x.ts => 200 text/html. Invariante: el player nunca pide video al VPS.
# :42  location ~ ^/cdn/.*\.(ts|m4s|mp4)$ { return 404; }
# :194 location ~* \.(ts|m4s|mp4)$ {
# :195     return 404;
```

Dos candados: uno específico bajo `/cdn/` (`:42`) porque estaba **sombreado** por un `location`
más general, y el global (`:194-195`). Sin el primero, un `.ts` bajo `/cdn/` devolvía **200
text/html** — es decir, la página de error, no vídeo; el comentario `:41` lo deja escrito.

**Corolario:** el VPS **sirve listas, JSON, APK y metadatos**. Los segmentos `.ts`/`.m4s`/`.mp4`
dan 404 **por diseño**. El vídeo va del proveedor al player, punto.

### 7.2 · Qué sí hace el VPS con el contenido

| Capa | Qué hace | Evidencia |
|---|---|---|
| `body_filter` Lua | **rebasa URIs** de la lista (no recodifica) | `_vps_stage/lua/ape_uri_rebase.lua` (manifest.tsv fila 2) |
| `header_filter` Lua | filtra/ordena cabeceras | `_vps_stage/lua/ape_header.lua` (fila 1) |
| `log_by_lua` | telemetría no bloqueante (`/meta/` 8088) | `_vps_stage/lua/ape_wake_on_manifest.lua` (fila 3) |
| `/cdn/` gateway | proxy de **manifiestos**, no de segmentos | `_vps_stage/lua/ape_gateway.lua` (fila 4) |
| JIT | **podría** codificar, pero está idle (§5) | `README.md:28`, `/jit/health` |

### 7.3 · El único "efecto de imagen" admitido

`ape_mesh_device_settings()` **no aplica nada**: emite filas para que el **daemon en el device**
las escriba en Android Settings (`ape_mesh.php:51-54`). El VPS **comanda**; el **SoC del device**
post-procesa. El bitstream no cambia (`ape-feedforward.php:79`: `NO STREAM-INF`).

---

## 8 · Los dos defectos, verificados en el árbol

### 8.1 · D1 — `health_url` y `resolve_probe_url` apuntan a rutas **muertas** · CRITICAL

**`tools/cicd/vps_deploy_map.json`:**

| Línea | Valor | Código heredado 2026-11-07 |
|---|---|---|
| `:7` | `"health_url": "https://iptv-ape.duckdns.org/api/health"` | **404** |
| `:8` | `"resolve_probe_url": "https://iptv-ape.duckdns.org/api/resolve_quality?ch=__SMOKE__&p=P3"` | **404** |

Lo consume `tools/cicd/deploy_vps.sh:63`:

```bash
HEALTH_URL="$("$PY" -c "import json,sys;print(json.load(open(sys.argv[1]))['vps']['health_url'])" "$MANIFEST")"
```

Es el **único** consumidor de `health_url` en el repo (`git grep -n 'health_url'` sobre
`*.sh *.js *.yml *.yaml *.py` → 1 hit).

**Estado:** mientras `/api/health` da 404, **`/api/health.php` responde 200** (heredado 2026-11-07)
y el fichero existe (`IPTV_v5.4_MAX_AGGRESSION/vps/api/health.php`). Además el baseline declara
`/health` → `200 "OK"` (`sites-enabled-default.conf:72-75`).

⇒ **La puerta de salud del deploy no puede pasar aunque el despliegue sea perfecto.** No es que el
VPS esté caído: la ruta del mapa no existe y el endpoint correcto está al lado.

`/api/resolve_quality`: más grave — **no hay fichero** `resolve_quality*.php` en el árbol
(búsqueda exhaustiva por nombre: `AUSENTE`). Aquí no basta cambiar el mapa: hay que ver qué
endpoint cumple esa función o **reescribir el smoke**. El mapa no finge.

### 8.2 · D2 — la APK 653 existe en el árbol y **no está publicada**

**Lo que sirve el VPS** — copia en repo, `IPTV_v5.4_MAX_AGGRESSION/vps/ara/version.json`:

| Campo | Línea | Valor |
|---|---|---|
| `versionCode` | `:2` | **651** |
| `versionName` | `:3` | `3.9.5-adb-firetv-shim` |
| `sha256` | `:4` | `8d3b145811c0bab3a10952329a81cadc477b08bd365b70f173cfe34ff52aa6e4` |
| `size` | `:5` | `25678434` |
| `package` | `:8` | `com.ape.crystalagent` |
| `published_at` | `:11` | `2026-11-07T18:55:00Z` |

**Lo que hay en disco** (MEDIDO HOY, tamaño + SHA-256):

| Build | Fichero | Bytes | SHA-256 (16) | ¿En `version.json`? |
|---|---|---:|---|---|
| 651 | — (no hay `.apk` local; es lo **servido**) | 25.678.434 | `8d3b145811c0bab3…` | **SÍ** |
| 652 | — | — | — | no |
| **653** | `scratch/canary_jit_20261111/APE_REA_653_OTT_DASH_2K_4K_6K_TEST_20261108.apk` | **24.362.980** | **`4b0c4ef397a6ea70…`** | **no** |
| 655 | `artifacts/APE_REA_655_EFFECTS_FIX_20261108.apk` | 27.882.649 | `8201466533a93ec5…` | no |
| 656 | `artifacts/APE_REA_656_HLS_DASH_20261108.apk` | 27.952.500 | `4bb5a7a119e6c7a2…` | no |

Búsqueda exhaustiva de `.apk` con `652` en el nombre: **NINGUNO** (37 `.apk` en el árbol).

⇒ **El defecto es real y está confirmado:** se construyeron 653/655/656 y `version.json` sigue
declarando 651 con `published_at 2026-11-07`. El `SelfUpdateManager` de la 651 consulta
`/ara/version.json`, ve `651` y **no verá nada más nuevo mientras `version.json` siga declarando
`651`** (comparación por `versionCode`; `651 > 650 > 600` según `version.json:24-27`). Publicar exige tocar
`version.json` **y** `/ara/agent.apk` — ventana del operador, backup previo.

### 8.3 · Corrección al propio inventario heredado

La skill heredada (§7.2, "medidas el 2026-11-07T19:51-05:00") afirma que la **APK 653 no existe en
disco**. **Eso ya no es cierto:** hoy está en `scratch/canary_jit_20261111/…653….apk` con el
SHA-256 exacto que la skill le atribuye (`4b0c4ef3…`) y con los mismos 24.362.980 B. El hash
**confirma** la afirmación de la skill; lo que caducó es la de "ausente". Es una medición posterior
que reemplaza a la anterior, no una contradicción de fondo.

---

## 9 · Divergencias y hallazgos nuevos de este inventario

Estas cinco no estaban pedidas. Salieron midiendo. Se declaran porque afectan a quien lea el
sistema.

### 9.1 · La skill dice `Authorization`; el código dice `X-ARA-Sig`

Ver §3.5. **El código gana.** Cualquier cliente que firme y ponga la firma en `Authorization`
recibe **401**. El header correcto es `X-ARA-Sig` + `X-ARA-Key-Id`.

### 9.2 · "6 apuntan a `vps/`" depende de la regla

Con la regla "prefijo `vps/` o `IPTV_v5.4_MAX_AGGRESSION/vps/`" → **6**. Con "la ruta contiene
`/vps/`" → **11** (suma `ara-x/vps/`). El doc
`docs/audits/ANTI_DEGRADATION_GATE_FALSE_POSITIVE_20261113.md:83` usa la primera regla. Ambas
cifras reproducen; la que se cita **debe** declarar la regla. Sin eso, dos auditores discuten sin
motivo.

### 9.3 · `/prisma/api/ape-cartridge-bulk.php` **no tiene fuente en el árbol**

Medición heredada 2026-11-07: **200** con datos reales
(`{"P0":{"hevc_forced":1,"bitrate_bps":80000000,…}}`). Búsqueda exhaustiva hoy:
**AUSENTE EN EL ÁRBOL** — no hay fichero con ese nombre.

No es que esté caído: **está vivo en el VPS y no es reproducible desde el repo.** Cualquier
`deploy` que reconstruya `/var/www/html/prisma/api/` desde este árbol lo perdería. Es el mismo
patrón que D1, pero al revés: aquí falta el productor.

### 9.4 · El `server.js` de `vps/ape-jit/` es código muerto que parece autoritativo

Ver §5.3. Está **justo donde alguien buscaría "el server.js del VPS"** y no es el que corre. 10×
más pequeño. El propio `ANTI_DEGRADATION_GATE_FALSE_POSITIVE_20261113.md:104-105` lo llama "riesgo
latente… quien los lea para entender el sistema, lee código que no se ejecuta".

### 9.5 · `sse.php` / `state.php` existen; `events.php` no

`/ara/sse` → `/var/www/ara/sse.php` (`ara-sse.conf:3`) y `/ara/state` → `/var/www/ara/state.php`
(`ara-state.conf:3`). Los ficheros están: `ara-x/vps/crystal/sse.php` y
`ara-x/vps/crystal/state.php`. En cambio `/ara/events` se sirve con **PHP** desde
`IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/events-sse.php` (`:29` 401, `:51`
`text/event-stream`), no desde un `events.php` — que **no existe**. Tres rutas `/ara/*`, dos
convenciones distintas de fichero.

---

## 10 · Qué **NO** se pudo medir

| No medido | Razón | Consecuencia |
|---|---|---|
| Código HTTP de cualquier endpoint **hoy** | **no hay SSH desde este entorno**; el VPS no es alcanzable desde esta sesión | todos los códigos de §2.1 son HEREDADOS 2026-11-07 |
| Contenido de `/var/www/html/…` en el VPS | ídem | la paridad repo↔VPS se apoya en el hash heredado (`419fe6f2…`), confirmado **del lado repo** |
| `nginx -T` del VPS | ídem | el vhost se lee del **baseline versionado** (2026-11-02), no del runtime |
| Que `/jit/health` siga en `uptime_s:0` ahora | ídem | dato de 2026-11-12T06:3x UTC, no de esta sesión |
| Que `ape-pulse-canary.timer` siga `inactive` | ídem | dato del recibo 2026-11-12 |
| BD SQLite (`ara_sync_state`, `conviva_events`) | no accesible | los esquemas están (`ara-x/vps/schema/`, `_vps_stage/sql/ara_sync.sql`); los **datos** no |
| Motor Rust `:8084` | **no hay unit ni fichero** que lo declare vivo en lo medido | §CLAUDE.md lo da por **inexistente** (doctrina D-25/D-32) |

**Ausencia de dato no es cero.** Ninguna celda "—" de este documento significa "0"; significa
"no medido".

---

## 11 · Cómo reproducir lo que sí es reproducible

```bash
# 1 · Conteo del árbol VPS
Get-ChildItem 'IPTV_v5.4_MAX_AGGRESSION\vps' -Recurse -File | Measure-Object     # -> 468

# 2 · Las 33 filas del manifiesto y que las 33 fuentes existan
$d = Get-Content '_vps_stage\deploy\manifest.tsv' | Where-Object { $_ -match '\S' -and $_ -notmatch '^\s*#' }
$d.Count                                                                        # -> 33
$d | ForEach-Object { Test-Path ($_ -split "`t")[0] } | Where-Object { -not $_ }  # -> vacío

# 3 · Paridad del contrato /sync (crudo, sin normalizar CRLF)
(Get-FileHash 'ara-x\vps\php\ara-sync.php' -Algorithm SHA256).Hash.ToLower()
#    -> 419fe6f23c15717da06e63c5a33ef9994f1caa6fae85e4cd9970d072eaa740d1   (54.912 B)
#    OJO: los 6 CRLF sueltos son parte del fichero; normalizar cambia el hash (10e1d656…)

# 4 · D1 — la ruta muerta del mapa de deploy
Select-String -Path 'tools\cicd\vps_deploy_map.json' -Pattern 'health_url|resolve_probe_url'
#    -> :7 api/health   :8 api/resolve_quality   (ambas 404 según medición heredada)

# 5 · D2 — lo que se publica vs lo que existe
Get-Content 'IPTV_v5.4_MAX_AGGRESSION\vps\ara\version.json' | Select-String 'versionCode|sha256|size'
#    -> 651 / 8d3b1458… / 25678434
Get-FileHash 'scratch\canary_jit_20261111\APE_REA_653_OTT_DASH_2K_4K_6K_TEST_20261108.apk' -Algorithm SHA256
#    -> 4b0c4ef397a6ea7066b5f51951d4fefb94820b0e94aeaf07f3f879ca6674d341  (24.362.980 B, NO publicada)

# 6 · JIT — cuál server.js corre
(Get-Item 'tools\lab\ape-jit\server.js').Length                     # -> 449392
(Get-FileHash 'tools\lab\ape-jit\server.js' -Algorithm SHA256).Hash # -> 290b11030f3b…
Select-String -Path '.github\workflows\deploy-vps.yml' -Pattern 'SHA_PIN='

# 7 · device_settings — productor y formato
Select-String -Path 'IPTV_v5.4_MAX_AGGRESSION\vps\prisma\lib\ape_mesh.php' -Pattern 'ape_mesh_device_settings|global '
```

**Si se quiere re-medir el VPS** (fuera de este entorno), la sonda correcta es la heredada, y **sin
la cabecera `Host` no mide nada**:

```bash
ssh hetzner-iptv 'curl -s -k -o /dev/null -w "%{http_code}\n" -H "Host: iptv-ape.duckdns.org" https://127.0.0.1/sync'
ssh hetzner-iptv 'curl -s -k -X POST -H "Host: iptv-ape.duckdns.org" -H "Content-Type: application/json" -d "{}" https://127.0.0.1/sync'
ssh hetzner-iptv 'sha256sum /var/www/html/prisma/api/ara-sync.php'
```

---

## 12 · Resumen ejecutivo en 12 líneas

1. El VPS **sirve texto**: listas, JSON, APK, metadatos. **Cero vídeo** — `.ts/.m4s/.mp4 → 404`
   por candado explícito (`sites-enabled-default.conf:42,194-195`).
2. `IPTV_v5.4_MAX_AGGRESSION/vps/` = **468 ficheros**; `ara-x/vps/` = **44**; `vps/` raíz = **17**.
3. El deploy va por **dos workflows manuales** + `_vps_stage/deploy/manifest.tsv` (**33 filas,
   33/33 fuentes existen**).
4. `/sync` está **vivo** y valida envoltura: POST `{}` → **400 `bad_envelope`**; GET → **405**
   por `return 405` del snippet (`ara-sync.conf:23-25`).
5. Contrato: `ARA_SYNC_VERSION=2`, prefijos `ARA-X-SYNC-V1` / `ARA-X-SYNC-RESP-V1`, HMAC-SHA256
   sobre canonical de 6 y 5 campos (`ara-sync.php:1232-1240`, `:1367-1373`).
6. **La firma va en `X-ARA-Sig`**, no en `Authorization` (`ara-sync.php:1241`,
   `SyncClient.kt:80`). La skill heredada se equivoca aquí.
7. `device_settings` = `<ns> <key> <val>`, **3 filas base incondicionales** (`ape_mesh.php:62-64`),
   consumidas por `SettingsApplier.kt:38-40`. **No viaja en la lista.**
8. **D1 CONFIRMADO:** `vps_deploy_map.json:7-8` apunta a `/api/health` y `/api/resolve_quality`,
   ambos **404**, cuando `/api/health.php` da 200. El health del deploy no puede pasar.
9. **D2 CONFIRMADO:** `/ara/version.json` declara **651** (`published_at 2026-11-07`); la **653
   existe** (24.362.980 B, `4b0c4ef3…`) y **no está publicada**.
10. **JIT:** motor **arriba** y **sin sesión** — `/jit/health` = `{ok:true,active:null,pid:null,uptime_s:0}`
    (2026-11-12, `docs/audits/DEPLOY_ENGINE_RECEIPT_20261112.md:24`). `uptime_s:0` cierra "no hay
    transcode activo", **no** "nunca hubo ninguno": un reinicio también lo pone a 0. No está en el
    camino de vídeo **hoy**.
11. El `server.js` que corre es `tools/lab/ape-jit/server.js` (`290b1103…`), **no** el de
    `vps/ape-jit/` (`8405f784…`, código muerto que parece autoritativo).
12. **Nada de esto se re-midió hoy contra el VPS:** no hay SSH. Los códigos son heredados
    2026-11-07 (endpoints) y 2026-11-12 (JIT/Canary), y así queda marcado en cada fila.

---

### Artefactos citados

| Artefacto | Uso |
|---|---|
| `.agents/skills/iptv-ape-apk-vps-contract-alignment/SKILL.md` | matriz heredada 2026-11-07 |
| `_vps_stage/deploy/manifest.tsv` | 33 filas, destinos |
| `tools/cicd/vps_deploy_map.json` `:7,:8` | D1 |
| `tools/cicd/deploy_vps.sh:63` | consumidor de `health_url` |
| `ara-x/vps/php/ara-sync.php` `:34-36,1196,1231-1244,1247,1366-1373,1398` | contrato `/sync` |
| `ara-x/vps/nginx/ara-sync.conf` `:1,23-25,44,46` | 405 / headers |
| `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php:51-82` | productor `device_settings` |
| `…/vps/prisma/api/ape-feedforward.php:52,64,78,79` | transporte |
| `…/android/ape-crystal-agent/…/SettingsApplier.kt:30,38,40,42,127` | consumidor |
| `…/android/ape-crystal-agent/…/SyncClient.kt:78-80,108,238` | cabeceras y filas |
| `IPTV_v5.4_MAX_AGGRESSION/vps/ara/version.json:2,4,5,8,11` | D2 |
| `vps/nginx/snippets/ape-jit.conf:40-53` | `/jit/` → `:3099` |
| `tools/lab/ape-jit/server.js:825-833` | handler `/health` |
| `vps/nginx/live-baseline-2026-11-02/sites-enabled-default.conf:42,72-75,194-195` | no-vídeo + `/health` |
| `.github/workflows/deploy-vps.yml:39-40,63-65,143,191,194,216-219,765-800` | canal de deploy |
| `.github/workflows/ape-deploy-frontend.yml:1,19-20,189-231` | deploy frontend |
| `docs/audits/DEPLOY_ENGINE_RECEIPT_20261112.md:24,38-46,50,57` | JIT/Canary heredado 2026-11-12 |
| `docs/audits/IDEMPOTENCY_20261112.md:21,29,30` | JIT heredado 2026-11-12 |
| `docs/audits/ANTI_DEGRADATION_GATE_FALSE_POSITIVE_20261113.md:83,91-97,104-105` | 3 server.js / regla del 6 |
| `contracts/canary_jit_contract_v1.json:8,317,325` | pin del motor + bucle no desplegado |
