# D3 · Contrato de sincronización bidireccional `ARA ⇄ VPS` (v2) — cierre

**Tarea:** `t9` · **Attempt:** `83acaae6-1508-4673-bb59-424073f742b2` · **Miembro:** `vps-edge-engineer`
**Ejecutada:** 2026-10-30 (America/Bogota) · **Scope escrito:** solo `ara-x/**` · **NO deploy, NO VPS writes**
**Estado:** **staged y verificado en local**. `/sync` sigue **404** en producción.

---

## 1 · Qué se entrega

| Artefacto | Bytes | SHA-256 |
|---|---:|---|
| `ara-x/vps/schema/sync_features.json` (catálogo único) | 9.775 | `FD70DB66…C5586F` |
| `ara-x/vps/schema/sync_request.schema.json` (generado) | 54.487 | `D8D696D5…E13FB8` |
| `ara-x/vps/schema/sync_response.schema.json` (generado) | 11.241 | `1C999DDB…BF256CA` |
| `ara-x/vps/schema/device_policy.example.json` (v2) | 1.712 | `557FEAB3…51D2BF1` |
| `ara-x/vps/client/ara_sync_client.js` (cliente/guards v2) | 48.312 | `871A57A6…3097BF14` |
| `ara-x/vps/php/ara-sync.php` (endpoint staged) | 44.414 | `23066101…C773B198B8` |
| `ara-x/vps/php/config/ara-sync-keys.example.json` | 971 | `6FEDCE11…F6F32EA` |
| `ara-x/vps/nginx/ara-sync.conf` (location staged) | 1.862 | `5798ACC2…563802B` |
| `ara-x/vps/nginx/ara-sync-zone.conf` (limit_req) | 865 | `43FFD912…136CBD8` |
| `ara-x/scripts/gen_sync_schemas.js` (generador + drift gate) | 20.508 | `E146CF46…64F8A959` |
| `ara-x/tests/helpers/mock_sync_server.js` (mock v2) | 15.550 | `25EF766A…84F38F5` |
| `ara-x/tests/sync_contract.test.js` | 26.347 | `3A499EE4…36AD52BF` |
| `ara-x/tests/sync_e2e.test.js` | 8.729 | `4097A299…A78F067` |
| `ara-x/tests/sync_security.test.js` (matriz R6 §6) | 17.515 | `B006A4D8…3FD78C24` |
| `ara-x/spec/ARA_X_SYNC_PROTOCOL.md` (§13 normativo v2) | 31.027 | `7FE4AC47…6791328` |
| `ara-x/spec/4k8k_matrix.json` (SoC canónico + refs) | 43.085 | `878054C6…A218D6C` |
| `ara-x/README.md` (inventario/verificación) | 6.685 | `255B4C26…7E81BA25` |

**Un solo catálogo** (`sync_features.json`) alimenta los dos schemas vía generador determinista; el test
compara byte a byte (`--check` falla si alguien edita un schema a mano sin tocar el catálogo).

---

## 2 · Contrato v2 (resumen verificable)

### 2.1 Request

- `v=2`, `type=ara_x_sync`, `device_id` pseudónimo, `seq` monótono, `ts` Unix, `nonce` 16..64 hex.
- `client.soc` **canónico** `{mt8696,amlogic,s905x4,s905x3}` + `soc_raw` solo diagnóstico (R5 GAP-01).
- **`ref` obligatorio**: `artifact_sha256` + `generation_id` + `list_version` (R1, §2.3).
- `metrics`: `window_s`, `conf`, `features` (1..40), `source`. Cada feature:
  `{value, prov, age_ms, conf}` con `prov ∈ {measured_device, measured_server, derived, modeled, unavailable}`.
- `events[]` ≤8 (enum incluye **`decoder_error`** y **`device_capabilities`**), `capabilities` opcional,
  `state` con `active_profile/profile_blend/policy_etag/**apply**/levers`.
- Prohibido: claves URL en cualquier profundidad, `channel_id`, título, credenciales, IP.
- **Ack L3 D4 (D4-F02)**: `state.apply` cerrado (5 estados, enums de razones, `soc/th/cad/ap/un/sk/cl/df/hl`,
  `ap` ≤16 líneas `<ns> <key> <int>`, `ap_trunc`); ≤1 KB; sin URLs ni credenciales.

### 2.2 Response

`profile`, `player`, `device{soc canónico, allowed, thermal_target_c, levers(13)}`, `display{mode,
wire_resolution, min_resolution, never_downscale, eight_k, hdr_hint}`, `fps{target,current,min}`,
`thermal{status, limits ordenados 55..85}`, `processing{tier}`, `degrade{order}`, `content{…, prov=lab_ssot}`,
`controls{sync_next_s, flags, degrade_mask}`, `ref{artifact_sha256, generation_id, list_version, lab_exported_at}`.

Guards: **nunca** wire 8K; `never_downscale=true` y `min_resolution=3840x2160` para los 4K-only
(`s905x4/s905x3/mt8696/**amlogic**`); `resolution` prohibido en `degrade.order`; `fps.target ∈ {24,30,60}`,
`fps.min=24`; levers solo de la allowlist; blend suma 1±1e-6; TTL ≤120 s; cero claves URL.

### 2.3 Honestidad R4-F03 resuelta

`null ⇔ prov=unavailable` (INV-6), sensores ADB-only (`cpu/gpu_temp`, `gpu/vpu_load`) solo
`measured_device` (en la práctica `null`), `content.*` **nunca** lo envía el device: viene del **LAB SSOT**
con `prov=lab_ssot`, `age_ms ≤ 7 días` y `conf`. `pm_thermal_status` (PowerManager API 29+) es el único
termómetro portable; `unknown` no significa frío.

### 2.4 Identidad del artefacto (R1, nuevo requisito)

- Las listas son **polimórficas** (30 familias UA/SPOOF rotan entre generaciones): la byte-identidad solo
  vale **intra-generación**. El pin es `ref.artifact_sha256` + `generation_id`.
- **El ETag HTTP de `/lists/` es el tamaño del gzip** (`0x9b2a1b7` = 162.701.751 B; R1 F-19) → **no**
  identifica el contenido. **`Range` no se honra**: `Range: bytes=0-0` ⇒ **200 + chunked**, nunca 206.
- Si `ref` del request ≠ `ref` del servidor: respuesta **200** con `flags: ["artifact_mismatch"]`; el
  device debe **re-descargar completo** (GET), recalcular sha256 y re-sincronizar.
- Implementado en: catálogo `artifact`, schemas, cliente (`sameArtifact`/`artifactMismatch`/
  `validateArtifactRef`), mock (fixture = artefacto B medido por R1) y tests.

### 2.5 Alineación D4 (sin duplicar vocabulario)

| Punto D4 | Acción D3 |
|---|---|
| D4-F02 `state.apply` ausente | **cerrado**: schema-generado + validación cliente/PHP + tests |
| D4-F04 `device_capabilities` 400 en QoE | **documentado**: ack operativo por L2 `heartbeat.data.caps.apply` → `ara_heartbeats.caps_json`; `/sync` acepta `capabilities` y el evento en su enum, pero no sustituye al plano QoE |
| D4-F01 residual `amlogic` fuera de `no_wire_8k` | **cerrado**: `amlogic` añadido a `no_wire_8k`; guards wire-8K/never_downscale/min_resolution/degrade activos |
| D4-F03 14/29 claves APK inalcanzables | **documentado como gap**; el catálogo acepta los 13 levers VPP y **no se inventan** levers |
| t24 I3-LUA (Lua `/sync`, depende de t9/t15) | **fuera de este entregable**: D3 es PHP staged; Lua separado, sin `/lists/`, sin `resty.http` |

---

## 3 · Seguridad (R6-D3) implementada y testeada

| Familia | Cobertura |
|---|---|
| AUTH-01..08 | clave por dispositivo (store 0600 fuera del webroot), binding `device_ids`, `retires_at`, 401 uniforme, 503 si el store falta/está vacío, sin fallback Bearer/token |
| AUTH-02..04 | canónico V1 sobre body crudo, `hash_equals`, 64 hex; 413/415/400; nada de auth en query |
| REPLAY-01..08 | `ts ±300 s`, nonce single-use 600 s (solo hash), `seq` monótono, idempotencia exacta 120 s (`200` idéntico + `X-ARA-Idempotent: 1`), `409` para el resto, SQLite `BEGIN IMMEDIATE`, purge y tope 256 filas, frescura de respuesta |
| SSRF-01..05 | schemas cerrados + guard recursivo de URLs; **0 funciones de red** en PHP; sin redirects/resolver; prepared statements; errores sin eco |
| RATE-01..04 | `limit_req_zone ara_sync rate=3r/m` + `burst=6 nodelay` **solo** en `location = /sync`; `limit_req_status 429`; playback intacto |
| NET/DATA | solo 443, POST único (405), `no-store`+`nosniff`, sin CORS, `fastcgi_hide_header X-Powered-By`, log sin IP/body/nonce/firma, `device_id` pseudónimo |
| SCHEMA-01..07 | catálogo+generador, enums cerrados, validación **antes** de firmar, `v=2` explícito (v1 no se reinterpreta) |

**Máquina de estados** (resumen): rate-limit → método → content-type → tamaño → JSON/validación →
key/HMAC → skew → **idempotencia** → nonce → seq → política → firma/estado → 200. Shadow responde 204 sin
cuerpo y no toca seq/nonce.

---

## 4 · Evidencia ejecutada (2026-10-30)

```text
node ara-x/scripts/gen_sync_schemas.js --check        -> schemas OK (sin drift)                    exit 0
node --check (cliente, mock, 3 tests, generador)       -> 6/6 exit 0
node --test sync_contract + sync_e2e + sync_security + playlist
                                                      -> tests 77 · pass 77 · fail 0
php -l ara-x/vps/php/ara-sync.php (stdin en el VPS)   -> "No syntax errors detected in /dev/stdin"
   # ejecución 100% read-only: el archivo se pipea a `php -l /dev/stdin`; NO se escribió nada en el VPS
grep de funciones de red/exec en el PHP               -> 0 matches
grep de literales http(s):// en el PHP                -> 0 matches
grep 'limit_req ' en nginx staged                     -> 1 (solo /sync)
JSON.parse de catálogo/schemas/ejemplo/keys/4k8k      -> 6/6 OK
node ara-x/scripts/d4_check_device_apply.js           -> RESULT: ALL CHECKS PASS (109/109)
node ara-x/scripts/r5_check_actuators.js              -> RESULT: ALL CHECKS PASS (137/137)
git rev-parse --short HEAD                            -> 2f8861c  (sin commit; 0 staged)
```

**Matriz R6 §6**: 23/23 casos en `sync_security.test.js` (vector HMAC, 401 uniforme, Bearer sin fallback,
skew ±300, nonce reusado, seq regresivo, reintento idéntico, mismo seq otro body, 413, 415, 400, URL
anidada, lever inventado, política inválida no firmada, TTL, tampering, 204 no aplicado, 429+Retry-After,
405, sin CORS, sin fuga, purge/tope, rotación de claves).

**NO RUN (por diseño)**: `nginx -t` (requiere ventana), deploy, smoke de producción, `GET/POST` reales
contra `https://…/sync` (sigue 404).

---

## 5 · Hallazgos pre-existentes y NO-GO

| ID | Estado D3 |
|---|---|
| R4-F01 `decoder_error`/`device_capabilities` fuera de `VALID_EVENT_TYPES` (QoE) | **NO corregido** (otro scope). Mitigado en `/sync`: enum de `events[]` los acepta; el rollback PQ→SDR por el plano QoE sigue inalcanzable |
| R4-F02 motor QoE del navegador cableado a generación | **NO corregido** (frontend, otro scope); `/sync` no depende de él |
| R4-F03 schema v1 imposible de cumplir | **CORREGIDO en v2** |
| R4-F04 métricas servidor sin columnas | **NO corregido**; v2 las acepta como features `measured_server`, sin histórico |
| R6-F01..F04 (CORS `*`, cache pública, `/a/` sin rate, capacidad `/a/2`) | **NO corregidos** (decisión/ventana del owner) |
| R3-R1 mapa legacy `tools/cicd` re-desplegaría Crystal | **NO corregido**; deploy solo por `_vps_stage/deploy` + workflow |
| D4-F01/F02 | **cerrados en v2** (SoC canónico + `state.apply`) |
| D4-F03 / D4-F04 | **documentados** (gap de 14 claves; ack L2 por heartbeat) |

**DEPLOY PRODUCCIÓN = NO-GO** hasta: cerrar/aceptar R6-F01..F04 y R4-F01..F04, reconciliar el drift
`ape-meta-public.conf`/`prisma-ara-enroll.conf` (R3-R2), abrir ventana, `nginx -t` + reload + smoke +
rollback probado. El PHP/snippet quedan **staged**.

---

## 6 · Canal real y coordinación

- **El APK llama `POST /sync`**; `/a/cfg` sigue siendo **loopback del VPS** (`allow 127.0.0.1; deny all`)
  y no es consumible por el device.
- Ruta de deploy propuesta (no ejecutada): snippet `prisma-ara-sync.conf` + include en
  `snippets/ape-meta-public.conf` **después** del bloque ARA (l. 55) + zona `00-ara-sync-zone.conf`;
  manifiesto activo `_vps_stage/deploy/manifest.tsv`; estado en `/etc/ara-x/sync-keys.json` y
  `/var/lib/ara-x/{artifact.json,content.json,sync.db}` (0600, fuera del webroot).
- **Bloqueo de scope**: `_vps_stage/**` y `IPTV_v5.4_MAX_AGGRESSION/vps/**` están fuera del write-scope
  de `ara-x-dynamic-controller`; el deploy requiere autorización del owner u otro workstream dueño.
- **t24 I3-LUA**: entregable Lua separado; este cierre no contiene Lua de `/sync` ni toca `/lists/`.
