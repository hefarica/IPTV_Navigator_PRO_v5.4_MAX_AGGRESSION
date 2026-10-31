# R5 · Inventario real de actuadores ARA (device/VPP)

**Fecha:** 2026-10-30 · **Tarea:** `t6` · **Autor:** `device-ara-engineer` · **Scope:** `ara-x/**`
**Entorno:** Windows, Node `v24.12.0` · **Modo:** **repo-only**

> **Prohibiciones respetadas al 100%:** no se ejecutó ADB, no se encendió ningún device, no se escribió ninguna
> prop ni setting, no se tocó el VPS. Todo lo de este informe se obtuvo **leyendo el repositorio** (PHP, Lua,
> nginx, Kotlin, dumps ya presentes) y contando con scripts locales.

**Entregables:** este informe + [`ara-x/spec/actuator_allowlist.json`](../spec/actuator_allowlist.json) (spec
legible por máquina, verificada contra el código con **137 aserciones**, `exit 0`).

**Veredicto corto:** hay **10 actuadores reales** (7 vivos —`live`/`live_code`—, 2 `staged`, 1 `flag_gated`) y
**5 elementos que se venden como actuadores y no lo son** (3 `inoperative`, 2 `absent`). El detalle que cambia
decisiones: *el bloque VPP por canal no llega nunca al APK por la ruta que el APK escucha*, y *la única señal
térmica disponible sin ADB es un enum de 7 niveles, no una temperatura*.

---

## 0 · Resumen ejecutivo

| ID | Actuador | Estado | Llega al device | Consumidor real | Exige ADB |
|---|---|---|---|---|---|
| A1 | SSE `device_settings` (`ape-feedforward-stream.php`) | **live** | **sí, 3 filas** | `SettingsApplier` (APK) | no |
| A2 | HTTP one-shot `ape-feedforward.php` (+`ape_vpp`) | **live_code** | **no** (nadie lo llama desde el APK) | ninguno en device | no |
| A3 | Bus `policy_deltas` (SQLite `conviva.db`) | **live_code** | indirecto | puente #1 (flag OFF) | no |
| A4 | `SettingsApplier` (29 claves, try-both-ns) | **live** | **sí** (el único que escribe) | SoC / VPP | **sí** (permiso, no ADB de host) |
| A5 | `push_pq_profile.php` (CLI, 13 levers) | **live** | indirecto | bus → A1 | no |
| A6 | `POST /a/cfg` (loopback, dict 1m, TTL) | **staged** | **no** (loopback) | `ape_attr.cfg_overrides` | no |
| A7 | `#EXTATTRFROMURL` / `/a` v2 (1000 slots) | **staged** | al **player**, no al APK | OTT Navigator (gate UA) | no |
| A8 | Track selection HEVC-first | **live** | local | ExoPlayer del APK | no |
| A9 | Efecto GPU del player (shader) | **live** | local | ExoPlayer del APK | no |
| A10 | Phase G rollback PQ→SDR | **flag_gated** | sí (reescribe A1) | A1 + blacklist | no |
| X1 | UltraEnhance (TFLite/GLSL por Bitmap) | **inoperative** | — | **sin llamador** | — |
| X2 | MediaEnhanceApi (motor 5) | **inoperative** | — | `enhance()` = no-op | — |
| X3 | `glReadPixels` por frame (4K) | **inoperative** | — | coste imposible (abajo) | — |
| X4 | `POST /sync` | **absent** | — | 404 en producción | — |
| X5 | ADB remoto | **absent** | — | imposible por diseño | — |

---

## 1 · Método y límites

1. **Lectura de código con `archivo:línea`** para cada afirmación (todas las referencias del JSON y de este
   informe son verificables con `read`).
2. **Conteos por script**, no a ojo:
   - `SettingsApplier.kt` → **29** pares `key → Regex` (extraídos con regex sobre el fuente).
   - `ape_vpp_levers()` → **13** claves; `ape_ff_settings_ns_map()` → **15**; `ape_pq_settings_for_ct()` → **13**;
     `ape_pq_profile()` (CLI) → **13**.
   - `M.SLOTS = 1000`, `M.MASK_BYTES = 125`, `M.EMPTY = 0xFFFF`, `M.VERSION = "2"` en `ape_attr.lua`.
3. **Cross-check automático** spec ↔ código: [`ara-x/scripts/r5_check_actuators.js`](../scripts/r5_check_actuators.js)
   compara las 29 claves y sus regex efectivas (des-escapando `\\d` de Kotlin), las 13+15 del PHP, la lista de
   SoC, el dict/TTL/rate-limit del Lua, el `location = /a/cfg` del nginx y los tamaños reales de los `.tflite`.
   **Resultado: 137/137 aserciones PASS (exit 0).**
4. **Lo que NO se puede afirmar desde aquí:** ningún valor real de device (ni temperaturas, ni zonas térmicas,
   ni qué settings existen en `system`/`secure`, ni comportamiento en runtime del VPP). Todo eso está marcado
   `NOT_VERIFIED` y tiene su comando de comprobación cuando haya **ADB autorizado**.

---

## 2 · A1 — SSE `device_settings` (el bus que el APK SÍ escucha)

`GET /prisma/api/ape-feedforward-stream.php?device=<id>&iv=<1..10>&dur=<5..120>`
(`ape-feedforward-stream.php:25-48`), auth `Authorization: Bearer` (el token **nunca** va en la query,
`FeedForwardClient.kt:54-56`).

- Evento `presets` → `device_settings[]` → `SettingsApplier.apply()` (`AgentService.kt:65-79`).
- Dedup por `md5(payload)`: si nada cambia emite `: hb <seq>` (`:131-133`).
- **Filas que viajan hoy: 3** — `global match_content_frame_rate 1`, `global hdr_conversion_mode 1`,
  `global minimal_post_processing_allowed 0` (`ape_mesh.php:61-65`).
  El comentario del propio código dice «los 13 levers VPP (hoy solo 2 globals)»: **contadas en el código son 3**.
- Phase G: si el canal está blacklisted reescribe **exactamente** `'global hdr_conversion_mode 1'` → `0`
  (`:109-116`).
- **`ape_vpp` NO viaja en este payload.** `AgentService` lee `obj.optJSONObject("ape_vpp")` (`:69-72`) pero el
  SSE nunca incluye esa clave (`ape-feedforward-stream.php:117-129`): `AraStatus.vppAllowed` es **siempre `null`**
  en la ruta real → **GAP-03**.

Límites: `iv` ∈ [1,10] s, `dur` ∈ [5,120] s, `sleep($iv)` por tick, `connection_aborted()` corta
(`:51-52`, `:136`).

---

## 3 · A2 — HTTP one-shot `ape-feedforward.php` (el único que publica `ape_vpp`)

`GET /prisma/api/ape-feedforward.php?device=<id>[&vpp=<P0..P5>][&target=4k|8k]`

- `device_settings` base en `:52`; el bloque VPP se construye **sólo si `device !== ''`** (`:54-66`) y se fusiona
  con la **misma** `ape_mesh_device_settings($streamInfo, $vpp)` (`:63-65`); `ape_vpp` se añade al JSON en `:81`.
- Filas: **3 sin VPP**, **14 con `ape_vpp.allowed`** (3 base + 11 levers únicos; `docs/rea/13_ARA_DEVICE_VERIFY.md:45`).
- **Medido el 2026-10-28** con device sintético `__selftest__`: `preset_count=41`, `device_settings=3`,
  `ape_vpp.allowed=false`, `reason=no_caps` (`docs/rea/13_ARA_DEVICE_VERIFY.md:5`).
- **Ningún cliente del repo lo llama desde el device.** El APK abre el SSE, no este endpoint.

> Consecuencia para ARA-X: si el controlador quiere empujar levers por canal, **primero hay que elegir el
> transporte**. Hoy el único camino que el APK lee son las 3 filas del SSE + el puente #1 apagado.

---

## 4 · A3 — Bus `policy_deltas`

Tabla en `/opt/netshield/data/conviva.db` (override `CONVIVA_DB_PATH`, `ape_mesh.php:298-306`):

```
policy_deltas(id, created_at, expires_at, target_device_id, channel_id,
              delta_type, priority, payload_json, applied_count, source)
```

- `ape_insert_delta()`: TTL **default 900 s**, prioridad **50**, source `conviva-event`
  (`:365-389`). Los productores PQ usan **1800 s / prioridad 80** (`:497-509`, `push_pq_profile.php:56-59`).
- `expires_at = now + ttl` si `ttl>0`; `ttl<=0` ⇒ sin caducidad.
- Único consumidor que acaba en el device: `ape_ff_device_settings_from_delta()` (puente #1) — **apagado por
  defecto** (`APE_4K_BRIDGE_ENABLED=1`, `ape-feedforward-stream.php:95`).
- La tabla hermana `ara_heartbeats(device_id PK, last_seen, channel_id, player, ara_version, state, caps_json,
  last_error)` es el **canal de entrada** de caps (`:342-351`, `:391-412`).

---

## 5 · A4 — `SettingsApplier`: el único actuador que escribe en el device

**29 claves** con regex de valor (`SettingsApplier.kt:136-172`), tres capas de defensa:

1. **Allowlist por clave** (`ALLOW_KEY[key]`, `:81-84`) → lo que no está, se rechaza y se loguea (así el VPS no
   puede escribir settings arbitrarios pese a tener `WRITE_SECURE_SETTINGS`).
2. **Regex del valor** (`Regex.matches` = coincidencia completa).
3. **try-both-ns + existencia** (`:90-123`): escribe **sólo** en el namespace donde la clave **ya existe**
   (`getString != null`) → no crea claves inertes. Orden: `global → system → secure` (o según el `ns` sugerido).

Cobertura real sobre el dump del SoC (`IPTV_v5.4_MAX_AGGRESSION/backend/onn_settings_global_pq.txt`, 6402 B):

| Métrica | Valor |
|---|---|
| Claves allowlisted presentes en `global` | **22 / 29** |
| Ausentes en `global` | 7: `match_content_frame_rate`, `minimal_post_processing_allowed`, `ai_sr_mode`, `ai_pq_mode`, `hdr_bit_depth`, `user_preferred_resolution_width/height` |
| Clave allowlisted con valor observado **fuera** de su regex | `hdr_output_type=4` vs `^[0-3]$` |

Contadores que el APK expone: `lastApplied`, `lastRejected`, `AraStatus.lastApplied/Rejected` (`:36-39`).
**No hay ACK hacia el VPS**: si una clave se salta, el VPS no se entera.

> Honestidad doctrinal (INV-8): `hdr_conversion_mode` **no** hace SDR→HDR; es passthrough entre tipos HDR
> (`CLAUDE.md:226-231`, `docs/rea/05_PLAYER_COMPAT.md:71`). El comentario de `ape_mesh.php:56-65` que dice lo
> contrario está corregido por medición y no debe citarse como doctrina.

---

## 6 · A5 — `push_pq_profile.php` (CLI)

```
php push_pq_profile.php [max_image|sports|cinema|off] [device_id] [channel_id]
```

- **13 levers** (`:22-30`), gate fail-closed **antes** de escribir:
  - `device_id` no vacío ⇒ `ape_soc_allowlisted($device)`; si no → `skip: SoC no allowlisted o sin caps` + **exit 2**
    (`:46-50`).
  - `device_id` vacío (broadcast) ⇒ exige `APE_VPP_ALLOW_BROADCAST=1`; si no → **exit 2** (`:51-54`).
- Inserta `device-setting` con TTL 1800 s, prioridad 80, source `pq-profile` (`:56-59`).
- Divergencia: `'cinema'` devuelve el **set completo** (SR+denoise full) mientras `ape_vpp_levers('cinema')` apaga
  MEMC y sharpness (`ape_mesh.php:593-597`) → **GAP-12**.

---

## 7 · `ape_mesh_device_settings()` — anatomía exacta

```php
$ds = [
  'global match_content_frame_rate 1',            // anti-judder
  'global hdr_conversion_mode 1',                 // passthrough HDR (ver INV-8)
  'global minimal_post_processing_allowed 0',     // 0 = NO permitir post-proceso mínimo (VPP completo)
];
// + merge VPP SÓLO si $vpp['allowed'] && levers no vacíos
```

- El merge (`:70-80`) usa **la misma** allowlist (`ape_ff_settings_ns_map`) y **la misma** validación numérica
  (`is_int|is_float|/^-?\d{1,4}$/`) que el puente, y **no duplica claves** ya presentes (`$seen`).
- **Defecto concreto:** el merge **no expande** `ai_pq_mode → ai_pic_mode`. Esa expansión sólo existe en el puente
  (`:556`). En MT8696, `ai_pq_mode` **no existe** → el lever AI-PQ se salta en silencio por esta ruta (**GAP-05**).

---

## 8 · `ape_vpp_levers()` — 13 levers, 4 perfiles

| Perfil | Efecto |
|---|---|
| `max_image` (default) | todo al máximo (`pq_ai_sr_enable=1`, `ai_sr_level=3`, `ai_pq_mode=3`, `aipq_enable=1`, `pq_sharpness_enable=1`, 3 denoise=1, `pq_ai_fbc_enable=1`, `pq_hdr_enable=1`, `pq_hdr_mode=1`, `match_content_frame_rate=1`, `minimal_post_processing_allowed=0`) |
| `sports` | `pq_ai_dnr_enable=0`, `pq_dnr_enable=0` (preserva textura en movimiento) + frame-rate ON |
| `cinema` | `match_content_frame_rate=0` y `pq_sharpness_enable=0` — el código **declara** que «moderado» no es expresable en una clave booleana |
| `off` | todos los levers a 0 |

Derivación de perfil por resolución de origen (`ape_vpp_profile_for`, `:605-631`):

| `width` | perfil | `sr_needed` | target |
|---|---|---|---|
| ≥ 3840 | P0 | false | 4k |
| 1280–3839 | P0 | **true** (AI-SR escala a 4K) | 4k |
| < 1280 | P1 | true | 4k |
| desconocido (0) | P1 | true (conservador, no se inventa soporte) | 4k |

**Gate de SoC** (`ape_soc_allowlisted`, `:651-661`) — fail-closed, **igualdad exacta** tras `strtolower`+`trim`:

```
allow = {mt8696, amlogic, s905x4, s905x3}
soc   = caps_json.soc  (heartbeat)  ||  el propio argumento
```

`reason` ∈ `soc_allowlisted | no_caps | soc_not_allowlisted | target_8k_sin_caps_8k`.

**8K (INV-4):** `target=8k` sólo si `caps.soc_8k` no vacío; si no, `allowed=false` y
`reason=target_8k_sin_caps_8k` (`:692-698`). La emulación display-side (`:700-731`) exige fuente ≥ 3840 **y**
`caps.ai_sr`/`features` con `ai_sr`, y siempre declara `never_real:true`. **Hoy nunca se activa**: el APK emite
`caps = {soc, soc_8k:"", names}` y **no** emite `ai_sr` (`QoEReporter.kt:39-49`) → **GAP-07**.

**Stack de emulación** (`:750-790`): 11 sub-bloques con `enabled/reason`. Sólo 5 pueden encenderse con claves
reales de SoC (`supersample`, `ai_sr`, `ai_pq`, `hdr_tone`, y `sharpness`/`dnr` condicionados al perfil);
`deband`, `chroma_upsample`, `memc`, `contrast`, `saturation` quedan **`enabled:false`** con
`reason: sin_clave_de_soc_verificada` — el propio código se niega a inventar un `settings put`.

---

## 9 · `ape_ff_settings_ns_map()` — 15 claves, todas `global`

Probado con el dump del MT8696 (`backend/onn_settings_global_pq.txt`): todos los `pq_*`, `ai_sr*`, `aipq*`,
`ai_pic_mode` viven en **`global`**. `ape_ff_device_settings_from_delta()` (`:531-562`) lee el último
`device-setting` vigente del device, filtra por allowlist y emite `<ns> <key> <val>`, **más** el alias
`ai_pq_mode → global ai_pic_mode <v>` (`:556`).

**Puente apagado por defecto:** el merge con el SSE sólo ocurre con `APE_4K_BRIDGE_ENABLED=1`
(`ape-feedforward-stream.php:95`). Con el flag OFF, el device recibe **3** filas y **jamás** los 13 levers
(**GAP-04**).

---

## 10 · A6 — `POST /a/cfg` (config por sesión, loopback)

| Elemento | Valor verificado |
|---|---|
| `location` | `= /a/cfg` en el plano **8088** (`meta-plane.conf:247-257`) |
| Bind | `allow 127.0.0.1; deny all;` → **sólo loopback** |
| Cuerpo | `client_max_body_size 64k`, `client_body_buffer_size 64k`, límite lógico `MAX_BODY=65536` |
| Dict | `lua_shared_dict ape_attr_cfg 1m;` (`meta-plane.conf:47-48`), clave `cfg:<sesión>` |
| TTL | default **300 s**, clamp **[1, 3600]** |
| Rate-limit | **6 escrituras / 60 s / sesión** (`rl:<sesión>` en el mismo dict) |
| Auth | `X-APE-Session` + `X-APE-Cfg = hex16(HMAC-SHA256(key,"cfg\|<sesión>\|<body>"))`; clave en `/etc/nginx/lua/ape_attr.key` (0600, fuera del repo) |
| Códigos | `204` ok · `400` forma/tamaño/sesión/dict · `403` clave/HMAC · `429` rate-limit · `405` método |
| Nunca devuelve | cuerpo, clave ni HMAC (`:634-636`) |
| Consumidor | `cfg_overrides()` rellena **huecos** de 7 claves enteras (`pq`, `hdr`, `ua_mode`, `referer_mode`, `source_format`, `audio_codec`, `bit_depth`); **el payload del GET siempre gana**; fail-open |

**Corrección de modelo importante:** el APK **no** consume `/a/cfg`. Es loopback del VPS; el device no puede
alcanzarlo. Lo que el APK consume es (a) el SSE de A1 y (b) `SharedPreferences` propias (`Config.kt:14-59`).
`/a/cfg` alimenta el fragmento que sirve `/a/` a los **players** (A7).

Estado: **staged** — `/etc/nginx/lua/ape_attr*` no existe en el VPS (`docs/rea/22_SLOTS_ENDPOINT.md:54`).
El snippet del 443 **deliberadamente no** expone `POST /a/cfg` (`ape-attr-public.conf:32-34`).

---

## 11 · A7 — `#EXTATTRFROMURL` / `/a` v2 (máscara de **1000 bits**)

```
GET /a/2/{c}/{s}/{p}/{payload}/{h}
payload = base64url( mask[125 B] .. body[2 B por slot encendido] )   · 0xFFFF = vacío
h       = hex de los primeros 16 B de HMAC-SHA256("2|c|s|p|payload")
```

| Métrica | Valor |
|---|---|
| Slots | **1000** (`M.SLOTS`) · máscara **125 B** (`M.MASK_BYTES`) · 1 bit por slot |
| Payload lleno | 125 + 2000 = **2125 B** → **2834** caracteres b64url (< 3 KB) |
| `#EXT-X-APE-STALE:1` | fragmento mínimo en fail-open (**nunca 4xx**) |
| Respuesta normal | **362 B** (TiviMate/other: sólo D0 y D5) |
| Capa B (opt-in) | 40 590 B con 1000 slots: **sin deflate** (no hay zlib en el runtime) |
| Presupuesto | 80 ms → medido **5,3 / 6,3 / 7,3 ms** en tres tareas independientes |

Diccionario resumido: `0 URL_DELTA · 1 CODEC_ORDER · 2 VIDEO_TRACK · 3 SOURCE_FORMAT · 4 HTTP_UA_MODE ·
5 HTTP_REFERER_MODE · 6 FLAGS (2 WANT_B, 4 HDR, 8 UHD4K, 16 UHD8K, 32 INTERLACE, 64 MASTER_HINT) · 7-15 reservados ·
16-26 calidad (audio_codec, ch, chroma, gop, hdr, pq, depth, fps×100, w, h, tier) · 16-895 namespace D6 (16-26 se
excluyen para no duplicar) · 896-959 diagnóstico · 960-999 control`.

Gate por UA: OTT Navigator ≥1.7.1.4 recibe D0–D6; **TiviMate y «other» sólo D0 y D5** (`ape_attr.lua:316-331`).

> Es **transporte de metadata inerte** (RFC 8216 §6.3.1): no ejecuta nada y ningún player de terceros lo usa
> como configuración del APK. Además, **staged**: no está desplegado.

---

## 12 · UltraEnhance: demostración de inoperatividad (en código y con números)

### 12.1 Los modelos no son lo que su nombre dice

`build_ape_models.py:1-20` lo declara y el código lo confirma:

| Asset | Bytes | Qué hace realmente |
|---|---|---|
| `car_denoise_f32.tflite` | **1676** | `(1-k)*in + k*boxblur(in)` — box-blur 3×3 por `AveragePooling2D` |
| `sr_unsharp_f32.tflite` | **1580** | `in + k*(in - boxblur(in))` — **unsharp**, mismo tamaño: **NO es super-resolución** |
| `rife_blend_f32.tflite` | **1484** | `0.5*f0 + 0.5*f1` — blend lineal: **sin compensación de movimiento** |
| **Total** | **4740 B** (≈1,5 KB por modelo) | |

Los tres son **válidos** como TFLite y deterministas (no producen basura), pero son **operaciones de pesos fijos**,
no redes entrenadas: no reconstruyen información ausente y no escalan resolución.

### 12.2 El pipeline no tiene llamador

`processFramePair(Bitmap, Bitmap)` (`UltraEnhancePipeline.kt:133-142`) — **0 llamadores** en todo el APK
(búsqueda exhaustiva). El propio docstring dice que es «API CONCEPTUAL/test» y que el feed real es
`media3-effect` (`:11-19`). Lo único que el `AgentService` hace con este pipeline es `negotiate()` +
`reportCapabilities()` (`AgentService.kt:58-63`).

### 12.3 `glReadPixels` a 4K: no es viable (aritmética)

| Concepto | 1080p | **4K (3840×2160)** |
|---|---|---|
| `glReadPixels` RGBA por pass | 8 294 400 B (7,91 MiB) | **33 177 600 B (31,64 MiB)** |
| 2 passes (denoise → unsharp) | 16 588 800 B | **66 355 200 B (63,28 MiB)** |
| Readback/s a 30 fps | 0,50 GB/s | **1,99 GB/s** |
| Readback/s a 60 fps | 1,00 GB/s | **3,98 GB/s** |
| Extra por pass | upload de textura desde `Bitmap` + `Bitmap` ARGB_8888 de salida | idem (33,2 MB por objeto) |

Y en el camino TFLite, `TfliteInferenceEngine.toBuffer()` reserva **3 floats por píxel**
(`TfliteInferenceEngine.kt:88-98`): **99 532 800 B ≈ 94,9 MiB por frame 4K** y **199 065 600 B ≈ 189,8 MiB** para
las dos entradas de RIFE. En un box con heap limitado eso es *out-of-memory*, no “lento”.

**Conclusión:** el pipeline `Bitmap` (motores 1–4) es **inoperativo para vídeo en 4K** y no está conectado. Lo
único real es el **efecto GPU del player del APK** (A9: `ApeUltraEnhanceGlEffect` / `CrystalGlEffect`), que
trabaja GPU-directo y **devuelve el mismo tamaño** (`configure()` → `Size(inputWidth, inputHeight)`): es
post-proceso perceptual, **no** upscaling.

### 12.4 El riesgo real: inflación de capacidades

`LcevcSyntheticPipeline.load()` devuelve **`true` siempre** (`LcevcSyntheticPipeline.kt:19`) ⇒ `negotiate()`
reporta `superResolution = LCEVC_SYNTHETIC` en **todos** los devices, y `QoEReporter.reportCapabilities()` lo
sube al VPS como evento `device_capabilities` (`QoEReporter.kt:71-80`). Ese “SR” es un **unsharp Laplaciano en
CPU**, no AI-SR de hardware.

> Regla para ARA-X: **prohibido** usar `device_capabilities.super_resolution` como evidencia de AI-SR. La regla
> vigente de `docs/rea/16_SOC_ALLOWLIST_RECONCILER.md:26` («`sr=1` sólo con evidencia: familia + ≥3 devices»)
> sigue siendo la única válida. Ver **GAP-05** y **P-5**.

`MediaEnhanceApiPipeline.enhance()` **devuelve el frame sin tocar** (`:34`) y `isSupported()` sólo mira si existe
una clase por reflexión: es un **no-op honesto**, pero con un early-return que, si algún día devolviese `true`,
apagaría los motores 1-4 sin aportar nada (`UltraEnhancePipeline.kt:56-64`).

---

## 13 · ADB remoto: imposible por diseño (y qué sí se puede)

**Hecho normativo y de plataforma:** ADB exige (a) habilitar Depuración USB/inalámbrica con acciones **en
pantalla**, (b) aceptar el **diálogo RSA por host** (el device guarda las claves públicas autorizadas y verifica
la firma en cada conexión) y (c) en Android 11+ el *wireless pairing* con **código de 6 dígitos o QR** que
introduce el usuario (`docs/manifestos/ape-vps-hevc-crystal-integrator/references/web_authority.md:93-97`).

**En el repo:**

| Evidencia | Qué demuestra |
|---|---|
| `bootstrap_ara_android.sh:25-32` | si `get-state != device` ⇒ **`ARA_BOOTSTRAP_REQUIRED`** + exit 2; mensaje explícito: «una playlist/VPS NO puede otorgar permisos ni abrir ADB» |
| `AdbSelfGrantManager.kt:10-18,41-60` | el APK sólo se auto-concede permisos vía **localhost + pairing en pantalla** (`pm grant WRITE_SECURE_SETTINGS` a sí mismo); el usuario toca los toggles |
| `docs/REA_SCOPE_AND_ARTIFACTS.md:396-403` | `unauthorized` ⇒ aceptar RSA en el TV; «habilitar ADB en remoto o automatizar el accept RSA **está prohibido**» |
| `docs/rea/13_ARA_DEVICE_VERIFY.md:21-30` | todos los comandos de verificación del device **son ADB de host** (read-only: `get-state`, `pm list packages`, `getprop`, `settings get`) |

**Consecuencia operativa:** un actuador que dependa de ADB **de host** no es desplegable. Ninguno de los 10
actuadores A1–A10 necesita un host ADB *durante* la operación: la entrega es HTTP (A1/A2), SQLite (A3) o local
(A8/A9). El único matiz es **A4**, que exige el permiso `WRITE_SECURE_SETTINGS` en el device: se consigue con
`AdbSelfGrantManager` (localhost + pairing en pantalla, sin PC) o con **un** host autorizado una sola vez — nunca
de forma remota ni repetida.

---

## 14 · Sensores térmicos y de carga por SoC

### 14.1 Estado medido en el repo: **cero**

`grep` sobre todo el repositorio de `thermal_zone`, `/sys/class/thermal`, `gpu_busy`, `devfreq`,
`/sys/kernel/debug` → **0 coincidencias**. No existe hoy **ninguna** lectura térmica implementada, aunque el
contrato `/sync` ya pide `cpu_temp_c`, `gpu_temp_c`, `thermal_throttled`, `gpu_load_pct`, `vpu_load_pct`,
`ram_available_pct` (`ara-x/spec/ARA_X_SYNC_PROTOCOL.md:131-139`). **GAP-11**.

### 14.2 Lo que se puede medir sin ADB (API pública de Android)

| Señal | Fuente | Permiso | Disponible hoy |
|---|---|---|---|
| `pm_thermal_status` (enum 0..6) | `PowerManager.getCurrentThermalStatus()` + `addThermalStatusListener()` (API 29+) | ninguno | **sí** — **único termómetro portable** |
| `ram_available_pct` | `ActivityManager.MemoryInfo` (`availMem/totalMem`) | ninguno | sí |
| `frame_drop_ratio` | `DecoderCounters` del player (`droppedBufferCount / renderedOutputBufferCount`) o `FrameMetrics`/`Choreographer` | ninguno | sí |
| `cpu_load_pct` | `/proc/stat` (delta de jiffies) | ninguno | **depende del SELinux del build** → NOT_VERIFIED |
| `battery_temp_c` | `ACTION_BATTERY_CHANGED` `EXTRA_TEMPERATURE` | ninguno | **device-dependent**: en un TV box sin batería falta o vale 0 → **no es la temperatura del SoC** |
| `thermal_throttled` (derivado) | `pm_thermal_status >= 3` **o** `cpu_freq < 80 % del máximo` | ninguno | derivado — indicador de segunda mano |

### 14.3 Lo que **exige ADB autorizado** (root/shell)

| Señal | Nodo | Por qué no lo puede leer el APK |
|---|---|---|
| `cpu_temp_c` | `/sys/class/thermal/thermal_zone<N>/temp` (milésimas de °C) + `<N>/type` | SELinux no da acceso a `sysfs_thermal` a una app normal |
| `gpu_temp_c` | zona térmica de GPU (índice y `type` propios del SoC) | idem |
| `gpu_load_pct` | Mali: `/sys/class/misc/mali0/device/utilization` · PowerVR: `debugfs /sys/kernel/debug/pvr/**` | **no existe API pública de carga de GPU** en Android; debugfs es root |
| `vpu_load_pct` | sin nodo estándar identificado | probablemente **NO_AVAILABLE**: hay que declararlo, no rellenarlo |

### 14.4 Por familia de SoC (nombre esperado — **no verificado en este device**)

| Familia | Device del proyecto | GPU | Zonas térmicas esperadas | Nodo de carga GPU esperado |
|---|---|---|---|---|
| **Amlogic S905X4** | ONN 4K Box (decode 4K@60; 8K sólo presentación) | ARM Mali-G31 | `soc_thermal` / `gpu_thermal` / `ddr_thermal` (convención de familia) | `/sys/class/misc/mali0/device/utilization` |
| **MediaTek MT8696** | Fire TV Stick 4K Max (referencia de la corrección HDR del repo) | Imagination PowerVR | `type` tipo `mtktscpu` / `mtktsgpu` / `mtktspmic` / `mtktsbattery` | `debugfs /sys/kernel/debug/pvr/**` (root) |

> Estas rutas son **expectativas de familia**, no medidas. Se marcan `verified_on_device: false` en el JSON. El
> `type` real de cada `thermal_zone` **hay que descubrirlo**, no asumirlo: los índices cambian entre firmware.

### 14.5 Plan de comprobación (read-only, **no ejecutado aquí**)

```bash
adb shell cat /sys/class/thermal/thermal_zone*/type
adb shell cat /sys/class/thermal/thermal_zone*/temp
adb shell cat /sys/class/misc/mali0/device/utilization     # Mali, si existe
adb shell ls  /sys/kernel/debug/pvr/                        # PowerVR (root)
adb shell dumpsys thermalservice
adb shell getprop ro.board.platform && adb shell getprop ro.soc.model
adb shell cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq
```

Sólo se registra `type` + `temp` normalizados; **nunca** el dump completo del device.

### 14.6 Reglas para el gobernador térmico de ARA-X

1. **INV-6:** `null != 0`. Un sensor no disponible entra en el fuzzy como **incertidumbre** (peso bajo), nunca como
   «frío» ni como «carga 0». Si el sistema sólo tiene `pm_thermal_status`, la política debe ser **más
   conservadora**, no menos.
2. Orden de degradación propuesto (nunca toca ABR/códec/URL):
   `minimal_post_processing_allowed → 1` · `ai_sr_level 3→2→1` · `pq_ai_fbc_enable/pq_sharpness_enable → 0` ·
   `pq_*_dnr → 0` · `pq_hdr_mode → 0` y sólo entonces `pq_hdr_enable → 0`.
3. El **efecto térmico real** de cada paso **no está medido**: es hipótesis de ingeniería. No se puede prometer
   «−5 °C por bajar AI-SR» sin campaña con ADB autorizado + termómetro.
4. `thermal_target_c = 70` del contrato es **una intención**, no una medición: no hay ni una lectura que la respalde
   hoy.

---

## 15 · Hallazgos (todos con evidencia)

| ID | Sev. | Hallazgo | Evidencia |
|---|---|---|---|
| **GAP-01** | high | El SoC de ejemplo del protocolo `/sync` (`amlogic_s905x4`) **no casa** con la allowlist exacta (`s905x4`/`amlogic`) → `allowed=false` sin explicación | `ARA_X_SYNC_PROTOCOL.md:130,174` · `ape_mesh.php:653-661` |
| **GAP-02** | medium | El generador documenta `soc: 'amlogic-s905x4'` (con guion) → mismo problema | `docs/rea/15_EXTATTRFROMURL_GENERATOR.md:52` |
| **GAP-03** | high | `ape_vpp` **no viaja** en el SSE; `AraStatus.vppAllowed` siempre `null` en la ruta real | `ape-feedforward-stream.php:117-129` · `AgentService.kt:69-72` |
| **GAP-04** | high | Los 13 levers sólo llegan con `APE_4K_BRIDGE_ENABLED=1` (**default OFF**) → producción aplica **3** filas, no 14 | `ape-feedforward-stream.php:95-108` |
| **GAP-05** | high | Inflación de capacidad: `LcevcSyntheticPipeline.load()=true` ⇒ `super_resolution=LCEVC_SYNTHETIC` en **todos** los devices; y `ai_pq_mode` no existe en MT8696 (alias sólo en el puente) | `LcevcSyntheticPipeline.kt:19` · `QoEReporter.kt:71-80` · `ape_mesh.php:556` |
| **GAP-06** | medium | `hdr_output_type`: allowlist `^[0-3]$` vs valor real del SoC `4` → valor real **inempujable** | `SettingsApplier.kt:144` · `onn_settings_global_pq.txt` |
| **GAP-07** | medium | La emulación 8K display-side **nunca se activa**: el APK no emite `caps.ai_sr`/`features` | `ape_mesh.php:704-731` · `QoEReporter.kt:39-49` |
| **GAP-08** | medium | Phase G reescribe por **igualdad de cadena exacta** (frágil) y usa umbrales distintos (8000 vs 6000 ms) | `ape-feedforward-stream.php:87,111-116` · `conviva-event.php:159` |
| **GAP-09** | low | `docs/rea/14` dice «`POST /a/cfg` diseñado, NO implementado»; `docs/rea/25` lo implementa con contrato y tests | `14_APE_A_CONTRACT.md:96-100` · `25_CFG_Y_SLOTS.md:27-48` |
| **GAP-10** | medium | 7 de 29 claves allowlisted no están en el dump `global` (**incluidas 2 de las 3 filas base del SSE**) → posible skip silencioso de 2/3 del presupuesto de actuación | `onn_settings_global_pq.txt` · `SettingsApplier.kt:90-123` |
| **GAP-11** | medium | **Cero** lecturas térmicas en el repo; el contrato pide 6 campos de sensor que hoy no tienen fuente | grep 0 · `ARA_X_SYNC_PROTOCOL.md:131-139` |
| **GAP-12** | low | `push_pq_profile('cinema')` ≠ `ape_vpp_levers('cinema')` (MEMC/sharpness) | `push_pq_profile.php:34` · `ape_mesh.php:593-597` |

---

## 16 · Reglas de actuación para ARA-X (lo que el controlador puede mandar)

1. **Vocabulario único.** Sólo los 13 levers de `ape_vpp_levers()` + las 29 claves de `SettingsApplier`. Cualquier
   clave nueva ⇒ PR en las dos listas **y** en el mapa de namespaces, con test.
2. **SoC canónico.** `{mt8696, amlogic, s905x4, s905x3}` en minúsculas, sin guiones ni prefijos. El contrato `/sync`
   debe **normalizar** el `client.soc` a este vocabulario antes de cualquier decisión (GAP-01/02).
3. **Un solo camino de entrega.** Elegir explícitamente entre: (a) encender el puente #1, (b) añadir `ape_vpp` al
   SSE, o (c) dejar el controlador limitado a las 3 filas base. Hoy convive (c) por accidente.
4. **Térmico honesto.** Sin ADB: `pm_thermal_status` + `ram_available_pct` + `frame_drop_ratio`. Los campos en
   grados y la carga de GPU se declaran `NOT_AVAILABLE` (no 0).
5. **Sin 8K en el wire, nunca.** `user_preferred_resolution_*` a 7680×4320 es 8K por la puerta de atrás: prohibido.
6. **Nada de `/sync` como si existiera** hasta que deje de devolver 404.
7. **La política no revierte sola.** Todo cambio de lever debe ser idempotente y con TTL ≤ 1800 s, para que el
   olvido del VPS no deje al device en un perfil agresivo (mismo criterio que `valid_until` del contrato).
8. **Un fallo de actuador no se propaga al player** (INV-7): el peor caso permitido es «no cambiar nada».

---

## 17 · Verificación ejecutada

```powershell
# 1) JSON válido + consistencia con el código (137 aserciones)
node ara-x/scripts/r5_check_actuators.js "<repo-root>"   # exit 0 · 137 ok / 0 FAIL · ALL CHECKS PASS

# 2) Extracción de las 29 claves del APK (fuente de verdad)
#    -> SettingsApplier.kt ALLOW_KEY = 29 · regex efectivas idénticas a las del spec

# 3) Extracción de los levers del PHP
#    -> ape_vpp_levers = 13 · ape_ff_settings_ns_map = 15 · ape_pq_settings_for_ct = 13 · ape_pq_profile = 13

# 4) Constantes del Lua
#    -> M.SLOTS=1000 · M.MASK_BYTES=125 · M.VERSION="2" · CFG.DICT=ape_attr_cfg
#       TTL_DEFAULT=300 · TTL_MAX=3600 · RL_MAX=6 · RL_WINDOW=60

# 5) nginx
#    -> location = /a/cfg con allow 127.0.0.1 / deny all · client_max_body_size 64k
#       lua_shared_dict ape_attr_cfg 1m

# 6) Assets
#    -> car_denoise_f32.tflite=1676 B · sr_unsharp_f32.tflite=1580 B · rife_blend_f32.tflite=1484 B
```

Chequeos del self-check (resumen): `schema` · 15 actuadores con `id` único y evidencia · allowlist APK **idéntica**
al `.kt` (29/29, regex efectivas) · `vpp_levers` (13) y `ns_map` (15) **idénticos** al `.php` · allowlist de SoC
idéntica · dict/TTL/rate-limit idénticos al Lua · `location /a/cfg` loopback + 64k · slots=1000/mask=125 ·
tamaños reales de los `.tflite` · toda señal térmica declara `requires_adb`/`available_today` · sin tokens ni
secretos.

---

## 18 · NOT_RUN declarado (honesto)

| No ejecutado | Causa |
|---|---|
| Cualquier comando ADB (`getprop`, `settings get`, `logcat`, `dumpsys thermalservice`) | **prohibido por el contrato de esta tarea** |
| Lectura de `thermal_zone*` reales y de la carga de GPU | requiere **ADB autorizado** o root |
| Comprobar si las 7 claves ausentes del dump existen en `system`/`secure` | requiere `settings get` en device (ADB) |
| Efecto real del VPP (¿se ve mejor? ¿se calienta menos?) | requiere device + captura de pantalla/logcat |
| `nginx -t` de los snippets `/a` y `/a/cfg` | no son configs autocontenidas; se validan en ventana de despliegue |
| Existencia de `/etc/nginx/lua/ape_attr.key` en el VPS | fuera de alcance (repo-only) |
| Despliegue de cualquier cosa | repo-only por contrato |

**Ninguna salida de device se declara en este informe.** Todo lo que aparece como valor numérico proviene del
repositorio o de aritmética reproducible.
