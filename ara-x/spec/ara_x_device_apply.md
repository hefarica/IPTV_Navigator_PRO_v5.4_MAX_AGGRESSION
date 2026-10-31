# ARA-X · Contrato de aplicación en device (sólo levers existentes)

**Versión:** `1.1` · **Fecha:** 2026-10-30 · **Tarea:** `t10` (D4) · **Autor:** `device-ara-engineer`
**Scope:** `ara-x/spec/**` + `ara-x/scripts/**` · **Modo:** repo-only (**no se ejecutó ADB, no se tocó ningún device, no se desplegó nada**)

**Artefactos:**

| Archivo | Rol |
|---|---|
| `ara-x/spec/ara_x_device_apply.md` | este contrato (normativo) |
| [`lever_namespace_map.json`](lever_namespace_map.json) | mapa **lever → namespace** de las 29 claves: tier de aplicación, dominio, alias, `ceiling_by_tier` y `ns_observed` |
| [`device_apply.vectors.json`](device_apply.vectors.json) | **payloads de ejemplo**: 4 vectores golden con política **v2**, contexto medido y salida esperada |
| `ara-x/scripts/d4_check_device_apply.js` | verificador: **120/120 PASS, exit 0** (cruza el mapa con el código y el catálogo v2, reimplementa el algoritmo, valida las políticas con el cliente real y mapea el ack a `state.apply`) |

**Vocabulario:** este contrato **no inventa** nombres. SoC canónicos, alias, `no_wire_8k`, `fps.targets`,
`processing.tiers` y `levers.vpp` se toman de
[`ara-x/vps/schema/sync_features.json`](../vps/schema/sync_features.json) (**catálogo v2**, t9/D3, `version: 2`);
las claves y sus dominios, de `SettingsApplier.kt`; el gate de SoC, de `ape_soc_allowlisted()`.

---

## 0 · Resumen en una pantalla

El device ya tiene **un** actuador real: `SettingsApplier` (29 claves con allowlist + regex + try-both-ns). Lo que
le falta es **de dónde le llega la orden**. Hoy:

- `/a/cfg` **no** es una opción: es loopback del VPS y el device no lo alcanza (R5 §10).
- El **SSE** entrega **3 filas base** y **nunca** `ape_vpp` (R5 GAP-03); los 13 levers exigen
  `APE_4K_BRIDGE_ENABLED=1`, apagado por defecto (R5 GAP-04).

Por eso D4 define la aplicación **desde la respuesta `/sync`**, dentro del APK: **SoC medido** (no declarado),
**gate exacto**, **denegación explícita** (jamás `allowed=false` silencioso), **orden de aplicación** con el
post-proceso **antes** que cualquier cambio de resolución, y **térmica honesta** (`null` = incertidumbre).

> **Estado de despliegue, sin adornos:** `/sync` **no existe en producción** (404). El contrato es **staged**: no
> cambia el comportamiento actual de ningún device ni sustituye al SSE. Todo lo verificable hoy se verificó contra
> código: **120 aserciones, 0 fallos**.

---

## 1 · Invariantes

| ID | Invariante | Consecuencia práctica |
|---|---|---|
| **D4-1** | **Sólo levers existentes.** El conjunto aplicable es exactamente `catalogo.levers.vpp` (13) dentro de las 29 claves del `SettingsApplier`. No se inventa ninguna clave ni ningún valor. | una clave nueva exige PR en 3 sitios (APK, catálogo, mapa) con test |
| **D4-2** | **SoC medido, nunca declarado.** `Build.SOC_MODEL` (API 31+, no vacío) o `Build.HARDWARE`, normalizado al token canónico del catálogo. | identidad de device a prueba de listas cruzadas (R4-F12) |
| **D4-3** | **La denegación es un estado de primera clase.** Gate cerrado ⇒ `denied` + razón tipada + SoC medido en el ack. | cierra el `allowed=false` silencioso |
| **D4-4** | **No revertir por duda.** `device.allowed=false` impide aplicar levers **nuevos**; no ordena deshacer los vigentes (deshacer también cambia la imagen). | se reporta `held_levers` |
| **D4-5** | **Post-proceso antes que resolución.** Orden T0 → T1 → T2 → T3 → T4; T4 **prohibido**. El `degrade.order` del catálogo sólo puede mover `fps` y `processing` en estos SoC. | nunca se degrada resolución para compensar térmica |
| **D4-6** | **Térmica `null` = incertidumbre.** Sin `prov=measured` no hay pasos térmicos ni excusa térmica. | no se degrada imagen por un sensor que no existe |
| **D4-7** | **Never-Drop.** Cualquier fallo del aplicador ⇒ `partial` + filas base intactas + cero bloqueo del player. | la reproducción nunca depende de este contrato |
| **D4-8** | **El device no toca el bitstream.** Prohibido escribir `RESOLUTION`/`CODECS`/`BANDWIDTH`, mutar la URL del segmento o declarar un códec/nivel que el decoder no soporta. | FREEZELESS / Ley Cardinal 1 |

**Dos ejes que NO son lo mismo** (se confunden fácil):

| Eje | Vocabulario | Quién decide | Uso en D4 |
|---|---|---|---|
| **Orden de aplicación** | `T0..T4` (este contrato) | D4 | secuencia de escritura (seguridad → cadencia → post-proceso → formato → resolución) |
| **Nivel de perfil** | `processing.tier` = `minimal·balanced·quality·max_image` (catálogo v2) | **VPS** (D5/ADC) | techo de los valores de los levers |

---

## 2 · Ruta real de aplicación

```
VPS ── respuesta /sync (política v2) ──▶ APK
                                          │
                        ┌─────────────────┴──────────────────┐
                        │  resolveDeviceApply(policy, ctx)    │  ← este contrato
                        └─────────────────┬──────────────────┘
                                          │
            ┌──────────────┬──────────────┴───────────┬────────────────┐
            ▼              ▼                          ▼                ▼
      settings_writes  player_ops               skipped/deferred    ack (L1/L2/L3)
            │              │                          │                │
            ▼              ▼                          ▼                ▼
      SettingsApplier  DefaultTrackSelector   se reportan        SharedPreferences
      (allowlist)      setParameters          con razón          + heartbeat caps.apply
```

**Entradas del resolvedor**

| Bloque | Campos | Fuente (medida en device) |
|---|---|---|
| `soc` | `soc_raw`, `soc_source` | `Build.SOC_MODEL` / `Build.HARDWARE` |
| `display` | `native_w`, `native_h`, `panel_24hz`, `refresh_hz` | `Display.getSupportedModes()` (API pública) |
| `thermal` | `prov`, `status` (0..6), `temp_c` | `PowerManager.getCurrentThermalStatus()` (API 29+); `temp_c` casi nunca sin ADB (R5 §14.3) |
| `source` | `fps`, `resolution`, `codec`, `hdr` | `Tracks`/`Format` del player |
| `player_runtime` | `active`, `buffer_ms`, `current.{max,min}_bitrate_bps` | `ExoPlayer.getTotalBufferedDuration()`, `getTrackSelectionParameters()` |
| `current_settings` | `<ns> <valor>` por clave, o `null` | `Settings.Global/System/Secure.getString` |
| `phase_g_blacklisted` | bool | `channel_pq_profile.pq_level='SDR'` del canal (R5 A10) |

**Del lado de la política**, D4 consume **sólo** esto: `device.{allowed,soc,levers,thermal_target_c}`,
`display.{wire_resolution,eight_k,min_resolution,never_downscale}`, `fps.target`, `processing.tier`,
`thermal.{status,limits}`, `degrade.order`, `player.*`, `profile.*` (metadata). Nada más se interpreta.

**Prohibiciones de medida (R4-F05):** `buffer_health_pct` del daemon **no** es el buffer del player (es un modelo
de throughput). Aquí **sólo** vale `buffer_ms` del player, y si no existe se reporta `null`. **Nunca** se
hardcodean serial ni chip: `device_id` sale de `Config.deviceId` y el SoC de `Build`.

---

## 3 · SoC: canonicalización, gate y tolerancia legacy

```
canonical = normalize(measured.soc_raw)          // lower+trim → alias del catálogo → debe estar en CANON
CANON     = {mt8696, amlogic, s905x4, s905x3}    // catálogo v2 socs.canonical == ape_soc_allowlisted()
ALIAS     = catálogo v2 socs.aliases (11 entradas; incluye amlogic_s905x4, amlogic-s905x4, firetv_mt8696…)
```

Gate **fail-closed** (los tres a la vez): `canonical ∈ CANON` **Y** `policy.device.allowed === true`
**Y** `normalize(policy.device.soc) === canonical`.

| Caso | Estado | Razón | Qué se aplica |
|---|---|---|---|
| SoC medido fuera de `CANON` | `denied` | `soc_unmapped` | **nada** (ni levers ni player) + SoC crudo en el ack (para el reconciliador) |
| Política de otro SoC | `denied` | `soc_mismatch` | **nada** + ambos SoC en el ack |
| `device.allowed=false` (SoC correcto) | `denied` | `device_not_allowed` | filas base + **player**, **0 levers** |
| `wire_resolution=7680x4320` / `eight_k=native` | `denied` | `wire_8k_forbidden` / `eight_k_native_forbidden` | **nada** |
| `now ≥ valid_until` | `denied` | `policy_expired` | **nada** (caché → `safeDefaultPolicy()`) |
| Política rechazada por `validatePolicy` del cliente | `denied` | `policy_invalid` + código del validador | **nada** (pero **se reporta**: no se traga) |
| Alias conocido (`amlogic_s905x4`→`s905x4`) | normal | warning `soc_alias_used` | se aplica y se reporta el alias |

### 3.1 · Política v2 vs política legacy (quién decide qué)

El catálogo v2 **exige** `device.soc` canónico (`validatePolicy` → `device_soc`). Eso es lo correcto: el VPS no
debe emitir alias. Pero un device puede recibir una política **legacy v1** (o la del ejemplo del protocolo, que usa
`amlogic_s905x4`). Regla de D4, con dos capas:

1. **Si el validador del cliente rechaza la política**, el APK **debe** convertir ese rechazo en
   `denied/policy_invalid` + código del validador en el ack (L1/L2). **Nunca** descartarla en silencio y seguir
   como si nada.
2. **Si la política llega al resolvedor** (validación previa desactivada, o política que sólo falla por el alias),
   D4 **tolera** el alias conocido, lo aplica y lo reporta (`soc_alias_used`) para que el VPS corrija su
   vocabulario. Un alias **desconocido** cae en `soc_unmapped`.

Esto se prueba con el vector **V2** (política legacy con alias): el validador v2 la rechaza y el resolvedor la
tolera reportándolo.

### 3.2 · Qué pasó con el bypass 8K (histórico D4-F01)

Con el cliente **v1**, `NO_WIRE_8K_SOCS` contenía `amlogic_s905x4`/`firetv_mt8696` (nombres con guion bajo)
mientras el gate del VPS compara por **token canónico**: una política con `device.soc='s905x4'` y
`wire_resolution='7680x4320'` **no disparaba** el guard, y el test sólo cubría el nombre con guion. **El catálogo
v2 lo cierra por dos vías**: `socs.no_wire_8k` usa ya los tokens canónicos y `display.wire_resolutions` **elimina
`7680x4320`** del enum (el wire 8K es inválido para cualquier SoC). D4 mantiene **defensa en profundidad**: el
resolvedor revalida 8K sobre el SoC **medido** (verificado por el script con `s905x4` + wire 8K ⇒ `denied`).

> **Actualización 2026-10-30 (D3 v2) — cierra el residual:** `socs.no_wire_8k` pasó a
> `["s905x4","s905x3","mt8696","amlogic"]`, así que **`amlogic` (genérico) ya está dentro** y el cliente exige
> `never_downscale=true` + `min_resolution=3840x2160` y **prohíbe `resolution` en `degrade.order`** también para
> ese SoC. Con ello, los **4** SoC canónicos son no-wire-8K por diseño. D4 mantiene igual su regla propia (nunca
> actúa sobre resolución) como defensa en profundidad. *Corrección aportada por el capitán; verificada contra
> `sync_features.json:99` (`no_wire_8k`) y el cliente v2.*

---

## 4 · Máquina de estados y ack (fail-closed **sin silencio**)

### 4.1 Estados (5)

| Estado | Significado | Precedencia |
|---|---|---|
| `denied` | gate/validez cerrados; política rechazada (o sólo base + player) | 1 |
| `partial` | se aplicó algo, pero hubo `skipped` o `clamped` | 2 |
| `deferred` | nada que escribir todavía; lo aplicable espera un evento del ciclo de vida del player | 3 |
| `applied` | todo lo inmediato se aplicó (`deferred` por diseño no degrada el estado) | 4 |
| `noop` | no había nada que cambiar (idempotencia) | 5 |

### 4.2 Razones (enums cerrados)

**Bloqueantes:** `soc_unmapped` · `soc_mismatch` · `device_not_allowed` · `wire_8k_forbidden` ·
`eight_k_native_forbidden` · `policy_expired` · `policy_invalid`.
**Warnings (no bloquean):** `soc_alias_used` · `wire_above_panel` · `thermal_unavailable` ·
`thermal_status_disagreement` · `cadence_unknown` · `degrade_resolution_not_actuable`.
**Skipped:** `lever_not_reachable` · `value_out_of_domain` · `forbidden_by_contract` · `key_absent_on_soc`
(este último lo produce el `SettingsApplier` en runtime).

### 4.3 Tres capas de ack

| Capa | Transporte | Estado | Tamaño | Qué garantiza |
|---|---|---|---|---|
| **L1 local** | `SharedPreferences("ape_apply")` + `AraStatus` + 1 línea `logcat` tag `ApeApply` (≤120 chars, sin secretos) | **disponible ya** | ~200 B | inspeccionable en el device (`SettingsApplier.diagnosticReport()`) |
| **L2 hoy** | `conviva-event` `event_type=heartbeat`, `data.caps.apply = {st, rs, m, etag8}` | **disponible ya** | ≤180 B | persiste en `ara_heartbeats.caps_json` (`ape_mesh.php:392-412`); `heartbeat` ∈ `VALID_EVENT_TYPES` (`conviva_qoe_server.php:70-81`) y **`data` no se valida** (`:96-152`) |
| **L3** | `POST /sync` → `state.apply` (registro completo) | **contrato ya emitible** (D3 v2): falta el servidor `/sync` | ≤1 KB | trazabilidad por seq/etag |

**Por qué L2 y no `device_capabilities`:** ese evento **no existe** en `VALID_EVENT_TYPES` del endpoint de QoE →
**400** (R4-F01). L2 no requiere tocar el server y es **inerte** para el gate: `ape_caps_of_device()` sólo lee
`soc`/`soc_8k`/`ai_sr`/`features` (`ape_mesh.php:635-648`), así que añadir `apply` dentro de `caps` no lo altera.

**L3 ya no requiere enmienda (D3 v2, 2026-10-30):** `sync_request.schema.json:1758` define `state.apply` con los
**mismos 5 estados** y los **17 códigos de razón** de este contrato, y el cliente lo valida con `validateApply()`
(`ara_sync_client.js:394`; `ACK_STATES` en `:85`). Es decir: el shape de §4.4 es hoy **implementable tal cual**;
lo único que falta es el endpoint en el VPS (`/sync` = 404). **Hallazgo D4-F02 cerrado por D3 v2.**

### 4.4 Forma canónica del ack

```json
{
  "st": "partial",
  "rs": "device_not_allowed",
  "etag": "sha256:cccc…",
  "soc": { "m": "s905x4", "src": "Build.HARDWARE", "c": "s905x4", "g": "allowlisted", "alias": "amlogic_s905x4" },
  "th":  { "prov": "measured", "st": 3, "steps": 2, "tier": "balanced" },
  "cad": 30,
  "ap":  ["global ai_pq_mode 2", "global ai_sr_level 1"],
  "un":  13,
  "sk":  [{ "k": "pq_ai_fbc_enable", "r": "value_out_of_domain" }],
  "cl":  [{ "k": "ai_sr_level", "from": 3, "to": 1 }],
  "df":  [{ "k": "buffer_s", "r": "player_active" }],
  "hl":  ["pq_sharpness_enable"]
}
```

Reglas: **nunca** se envía la política, ni URLs, ni credenciales; `ap` ≤ **16 líneas** (truncado con
`ap_trunc:true`); el ack se **omite** si no cambió el estado desde el último envío (dedup por
`hash(st,rs,etag,ap)`).

**Mapeo contrato → wire (`state.apply`)**, con los enums cerrados del catálogo v2 (`sync_features.json` → `ack`):

| Campo del contrato | En el wire | Regla |
|---|---|---|
| `state` (5) | `st` | idéntico: `denied·partial·deferred·applied·noop` |
| `ack_reason` | `rs` | idéntico (17 códigos); puede ir `null` |
| `soc.gate` = `allowlisted` | `soc.g` = `allowlisted` | 1:1 |
| `soc.gate` = `denied` | `soc.g` = `not_allowlisted` (o `no_caps` si no hay caps) | **traducción obligatoria**: `denied` no es un valor del wire |
| `deferred_codes` = `<k>:player_active` | `df[] = {k, r:"player_active"}` | 1:1 |
| `<k>:player_inactive` · `<k>:next_media_source` | `df[] = {k, r:"lifecycle_pending"}` | **traducción obligatoria** |
| `clamped[] = {key,from,to}` | `cl[] = {k,from,to}` | `key` → **`k`** (nombre corto) |
| `skipped[] = {key,code}` | `sk[] = {k,r}` | idem |
| `writes[]` | `ap[]` | patrón `^[a-z_]+ [a-z0-9_]+ -?[0-9]{1,4}$`, ≤16, `ap_trunc` si se corta |
| `unchanged_count` | `un` | entero ≥ 0 |
| `held_levers` | `hl[]` | lista de claves |

**Verificado contra el validador real:** el ack mapeado de los vectores **V1, V2 y V4** pasa
`client.validateApply()` (3/3). El de **V3 no puede** pasar: `state.apply.soc.m` exige token canónico y el SoC
medido es `rk3588` → **D4-F10** (ver §12): la denuncia de SoC desconocido viaja por **L1/L2**, no por L3.

---

## 5 · Orden de aplicación: post-proceso **antes** que resolución

| Tier | Contenido | Momento | Claves |
|---|---|---|---|
| **T0** | seguridad / rollback | inmediato | `hdr_conversion_mode` (0 si el canal está blacklisted por Phase-G; si no, 1) |
| **T1** | cadencia | inmediato | `match_content_frame_rate` |
| **T2** | post-proceso VPP | inmediato | `minimal_post_processing_allowed`, `ai_sr_level`, `pq_ai_sr_enable`, `ai_pq_mode`(+`ai_pic_mode`), `aipq_enable`, `pq_ai_fbc_enable`, `pq_sharpness_enable`, `pq_ai_dnr_enable`, `pq_dnr_enable`, `pq_nr_enable`, `pq_hdr_enable`, `pq_hdr_mode` |
| **T3** | formato de salida (HDMI/color) | **no aplicable hoy**: sin fuente de política | 10 claves (mapa) |
| **T4** | resolución | **prohibido por contrato** | `user_preferred_resolution_width/height` |

**Por qué T2 antes que T4 (y por qué T4 no se toca):** cambiar la resolución de salida renegocia el enlace HDMI
(parpadeo/pantalla negra posible) y **no crea píxeles**: sólo cambia el escalador de salida. El realce real vive en
T2 (VPP sobre el frame decodificado). Y escribir `user_preferred_resolution_height=4320` sería **wire 8K por la
puerta de atrás** en un SoC sin decode 8K (Ley Cardinal 1 / freeze 2026-06-08). Coherente con el catálogo: en los
SoC de `no_wire_8k`, `degrade.order` **no puede incluir** `resolution` (`validateDegrade`).

**Cadencia (60 / 30 / 24).** Se toma de `policy.fps.target` (validado ∈ `[24,30,60]`); si falta (política legacy)
se deriva del fps medido:

| Clase | Origen | `match_content_frame_rate` permitido | Nota honesta |
|---|---|---|---|
| **60** | `fps.target=60` | `{0, 1}` | sports usa 1 (seamless) |
| **30** | `fps.target=30` | `{0, 1}` | idem |
| **24** | `fps.target=24` | `{0, 1}` | si el panel no anuncia modo 24 Hz (`panel_24hz=false`) se mantiene 1 y **se declara**; no se finge cine |
| — | sin `fps.target` ni fps medido | `{0, 1}` | warning `cadence_unknown` |

`match_content_frame_rate = 2` (“always”) queda **prohibido**: fuerza conversión de cadencia en todo contenido y no
existe clave de MEMC real que lo justifique (R5 §8: `memc` → `enabled:false`,
`reason:no_existe_clave_de_soc_es_filtro_de_player`). Si llega 2 → **clamp a 1** y se reporta.

**Resolución declarada vs. actuador.** `display.wire_resolution` describe **lo que el VPS sirve**, no un ajuste del
device. El device sólo lo **valida**: `7680x4320` ⇒ `denied`; si supera el panel nativo ⇒ warning
`wire_above_panel` y **no se escribe nada**.

---

## 6 · Térmica: `processing.tier` − pasos, y `null` no es “frío”

### 6.1 Modelo

```
tier_efectivo = lower(processing.tier, pasos_termicos)
valor_aplicado(k) = clamp(policy.device.levers[k], ceiling_by_tier[k][tier_efectivo])
```

`ceiling_by_tier` es monótono: `max_image` no recorta, `minimal` es el suelo. **Si el tier es más conservador que
los levers explícitos, manda el tier** (nunca se aplica algo más agresivo que lo declarado) y se reporta en
`clamped`.

### 6.2 Pasos térmicos (sólo con `prov = measured`)

| Señal disponible | Regla |
|---|---|
| `temp_c` (requiere ADB/privilegio) **y** `thermal.limits` válidos | `≥ critical_c` → 3 · `≥ severe_c` → 2 · `≥ moderate_c` → 1 · resto → 0 |
| sólo `pm_thermal_status` (lo normal) | 0–1 → 0 · 2 → 1 · 3–4 → 2 · 5–6 → 3 |
| `prov ≠ measured` (`unknown`) | **0 pasos** + warning `thermal_unavailable` |

### 6.3 Techos por tier

| Clave | max_image | quality | balanced | minimal |
|---|---|---|---|---|
| `minimal_post_processing_allowed` | 0 | 1 | 1 | 1 |
| `ai_sr_level` | 3 | 2 | 1 | 0 |
| `pq_ai_fbc_enable` | 1 | 0 | 0 | 0 |
| `pq_sharpness_enable` | 1 | 1 | 0 | 0 |
| `pq_ai_sr_enable` | 1 | 1 | 1 | 0 |
| `ai_pq_mode` / `ai_pic_mode` | 3 | 3 | 2 | 0 |
| `aipq_enable` | 1 | 1 | 1 | 0 |
| `pq_hdr_mode` | 1 | 1 | 1 | 0 |
| `pq_ai_dnr_enable` · `pq_dnr_enable` · `pq_nr_enable` | 1 | 1 | 1 | 1 |
| `pq_hdr_enable` | 1 | 1 | 1 | 1 |
| `match_content_frame_rate` | 1 | 1 | 1 | 1 | 0 |

`minimal_post_processing_allowed` se clampa con **`max`** (0 es más agresivo que 1); el resto con **`min`**.
El denoise se mantiene hasta el suelo: es barato y evita banding/bloques.

### 6.4 Reglas del `null`

- `thermal.prov ≠ measured` ⇒ **0 pasos**, warning `thermal_unavailable`, `conf` bajo en el ack.
  *No se inventa una degradación por un sensor que no existe* (MAX IMAGE FIRST), **ni** se declara “frío”.
- `cpu_temp_c` casi nunca está disponible sin ADB (R5 §14.3) ⇒ no se usa como entrada; se reporta `null`.
- Si la política y la medida discrepan de estado térmico ⇒ warning `thermal_status_disagreement` (manda la
  **medida**).
- `thermal_target_c` es un **objetivo**, no una medición: sin termómetro sólo se cumple por proximidad vía
  `pm_thermal_status`. Se declara así.
- El efecto térmico real de cada escalón **no está medido** (R5 §14.6.3): la tabla es una hipótesis ordenada.

---

## 7 · Presupuesto Never-Drop

| Regla | Valor | Motivo |
|---|---|---|
| Escrituras por aplicación | **≤ 16** | una política no puede degenerar en un barrido de settings |
| `read-before-write` | obligatorio | idempotencia: sin cambios no hay escritura (0 churn de display) |
| T3/T4 | **nunca** se escriben | T4 prohibido; T3 sin fuente |
| Hilo | `Dispatchers.IO`, nunca el hilo del player | el player no espera al aplicador |
| Excepción | `catch` → `partial`, filas base intactas | autopista (D4-7) |
| Cadencia | respeta `MIN_REQ_INTERVAL_S = 5` y `sync_next_s` | no martillear |
| Phase-G | la decisión `hdr_conversion_mode → 0` se toma **antes** de serializar | evita la fragilidad de reescribir por igualdad de cadena (R5 GAP-08) |
| Expiración | al expirar la política se aplica `safeDefaultPolicy()` (P2, sin levers, buffer 45 s) | nunca queda una política agresiva vieja |

---

## 8 · Parte “player”: qué se puede aplicar de verdad

| Campo de `policy.player` | Acción | ¿En caliente? | Honestidad |
|---|---|---|---|
| `max_bitrate_bps` | `DefaultTrackSelector.setParameters(buildUponParameters().setMaxVideoBitrate(v))` | **sí**, si el player existe | real en media3 |
| `min_bitrate_bps` | idem `setMinVideoBitrate(v)` | **sí** | real |
| `buffer_s` | `SharedPreferences("buffer_profile")` → `FluidBridge.configureBuilder()` en el próximo `build()` | **no**: `LoadControl` se fija en el constructor | `deferred:player_active` / `player_inactive` |
| `reconnect_attempts` | política de reintentos del `MediaSource` (se crea por canal) | **no** en caliente | `deferred:next_media_source` |
| `live_delay_s` | no existe knob público de offset live en media3 | **no** | `not_applicable` (no se finge) |
| `abr_bw_factor` | no hay “factor EWMA” expuesto; se aproxima con caps de bitrate | **no** | `not_applicable` (no se finge) |
| `profile.active` / `blend` | **metadata** de decisión | — | no es un actuador |
| `display.hdr_hint` | **metadata** | — | **prohibido** traducirlo a `always_hdr=1` (HDR falso); el único lever real es `hdr_conversion_mode` (passthrough) |

**`buffer_ms`** se mide con `ExoPlayer.getTotalBufferedDuration()` (ms) o `null` si no hay player. **Nunca** se
reporta el `buffer_health_pct` del daemon como si fuera buffer del player (R4-F05).

---

## 9 · Mapa lever → namespace (resumen; detalle en el JSON)

Namespace: **`global` es donde el MT8696 expone todo el VPP** (probado con
`backend/onn_settings_global_pq.txt`), pero el APK **no confía en el hint**: descubre el namespace con `getString`
y escribe sólo donde la clave existe (`try-both-ns`, `SettingsApplier.kt:90-123`).

| Grupo | Claves | ns | Tier | Alcanzable desde la política |
|---|---|---|---|---|
| Base | `hdr_conversion_mode`, `match_content_frame_rate`, `minimal_post_processing_allowed` | global (2 sin presencia en el dump) | T0/T1/T2 | **sí** (siempre) |
| Levers VPP (13 del catálogo) | `pq_ai_sr_enable`, `ai_sr_level`, `ai_pq_mode`, `aipq_enable`, `pq_sharpness_enable`, `pq_ai_dnr_enable`, `pq_dnr_enable`, `pq_nr_enable`, `pq_ai_fbc_enable`, `pq_hdr_enable`, `pq_hdr_mode` (+2 base) | global | T2 | **sí** |
| Alias | `ai_pic_mode` ← `ai_pq_mode` | global | T2 | sí, **sólo** como alias |
| Formato de salida | `display_color_mode`, `color_depth`, `hdmi_color_space`, `color_mode_ycbcr422`, `hdr_bit_depth`, `hdr_output_type`, `hdr_force_conversion_type`, `always_hdr`, `hdr_brightness_boost`, `sdr_brightness_in_hdr` | global | T3 | **no** (sin fuente) |
| Resolución | `user_preferred_resolution_width/height` | — | T4 | **no** (prohibido) |
| Sin uso | `ai_sr_mode`, `aisr_enable` | —/global | T2 | **no** |

**Cuentas verificadas:** 29 claves · **15 alcanzables** · **14 no alcanzables** · **3 prohibidas**
(`always_hdr`, `user_preferred_resolution_height/width`) · **1 alias** (`ai_pic_mode`).

**Hallazgo D4-F03:** 14 de las 29 claves del `SettingsApplier` **no son alcanzables desde ninguna política**
porque el catálogo sólo acepta 13 levers (`levers.vpp`) y no hay campo para el resto. El mapa de 29 es correcto,
pero **hoy** es en parte decorativo: T3/T4 no tienen fuente. Controlar `color_depth` o el formato HDR exigiría un
campo nuevo en el catálogo **y** en el cliente (propuesta, no implementada aquí).

---

## 10 · Payloads de ejemplo

Los 4 vectores están en [`device_apply.vectors.json`](device_apply.vectors.json) (políticas **v2**) y el
verificador los reproduce campo a campo:

| Vector | Escenario | Resultado |
|---|---|---|
| **V1** | 4K/60, `s905x4`, térmica LIGHT (0 pasos), player activo | `applied`: 2 writes (`ai_pq_mode`, `ai_sr_level`), 13 sin cambio, alias `ai_pic_mode`, 2 ops de player, 2 diferidas |
| **V2** | térmica **SEVERE** (status 3 → **2 pasos**) + política **legacy** con `soc: "amlogic_s905x4"` + panel 1080p con wire 4K | `partial`: tier efectivo **balanced**, **5 clamps**, 15 writes (device limpio), warnings `soc_alias_used` + `wire_above_panel` |
| **V3** | SoC `rk3588` (no mapeado) + `wire_resolution: 7680x4320` | `denied` con **2 razones** (`soc_unmapped`, `wire_8k_forbidden`), **0 writes**, 3 sin cambio, SoC crudo reportado |
| **V4** | `device.allowed=false` con SoC correcto | `denied` (`device_not_allowed`), **0 levers**, filas base intactas, `held_levers` con lo vigente, player diferido |

Fragmento del **V2** (el caso que más se va a dar: calor real + política del propio ejemplo del protocolo):

```jsonc
// measured: soc_raw "s905x4", thermal {prov:"measured", status:3, temp_c:74.0}, fps 25
// policy:   device.soc "amlogic_s905x4" (legacy), allowed true, 13 levers al máximo, processing.tier max_image
expect: {
  state: "partial",
  warnings: ["soc_alias_used", "wire_above_panel"],
  soc: {measured:"s905x4", canonical:"s905x4", gate:"allowlisted", alias_used:"amlogic_s905x4"},
  cadence_class: 30,
  thermal: {prov:"measured", status:3, steps:2, effective_tier:"balanced"},
  clamped: [
    {key:"minimal_post_processing_allowed", from:0, to:1},
    {key:"ai_sr_level",                   from:3, to:1},
    {key:"ai_pq_mode",                    from:3, to:2},
    {key:"pq_ai_fbc_enable",              from:1, to:0},
    {key:"pq_sharpness_enable",           from:1, to:0}
  ],
  writes: ["global hdr_conversion_mode 1", "global match_content_frame_rate 1",
           "global ai_pic_mode 2", "global ai_pq_mode 2", "global ai_sr_level 1",
           "global aipq_enable 1", "global minimal_post_processing_allowed 1",
           "global pq_ai_dnr_enable 1", "global pq_ai_fbc_enable 0", "global pq_ai_sr_enable 1",
           "global pq_dnr_enable 1", "global pq_hdr_enable 1", "global pq_hdr_mode 1",
           "global pq_nr_enable 1", "global pq_sharpness_enable 0"]
}
```

---

## 11 · Compatibilidad con lo ya entregado

| Referencia | Efecto de D4 |
|---|---|
| R5 GAP-01/02 (SoC no canónico → `allowed=false` silencioso) | **cerrado**: catálogo v2 exige token canónico; D4 además tolera el alias legacy y lo **reporta** |
| R5 GAP-03 (`ape_vpp` no viaja en el SSE) | **no se toca**: D4 es la ruta `/sync`; el SSE sigue como está (deuda aparte) |
| R5 GAP-04 (`APE_4K_BRIDGE_ENABLED` OFF) | **no se toca**; D4 no depende del puente |
| R5 GAP-05 (`ai_pq_mode` ≠ clave real) | **cerrado en el resolvedor**: alias `ai_pic_mode` con el **mismo valor ya clampeado** |
| R5 GAP-08 (Phase-G por igualdad de cadena) | **evitado**: la decisión se toma antes de serializar (T0) |
| R4-F01 (`device_capabilities` → 400) | **evitado**: ack por `heartbeat.data.caps.apply` (L2) y `state.apply` (L3, enmendado) |
| R4-F03 (métricas no medibles obligatorias) | **alineado**: el device sólo envía lo medible; el resto `null` con `prov` |
| R4-F05 (`buffer_health_pct` / serial hardcodeado) | **cerrado**: `buffer_ms` del player o `null`; `device_id` de prefs, SoC de `Build` |
| R6 D3 (auth/replay/SSRF/rate/allowlist) | **compatible**: el ack viaja en el body firmado; sin URLs; 13 levers; `no-store` |
| t9/D3 catálogo v2 (`sync_features.json`) | **fuente única** de SoC/tiers/fps/levers; D4 no duplica vocabulario |

---

## 12 · Hallazgos

| ID | Sev. | Hallazgo | Evidencia |
|---|---|---|---|
| **D4-F01** | **HIGH → CERRADO (D3 v2)** | El guard wire-8K del cliente v1 usaba nombres con guion bajo y **no disparaba** con el SoC canónico. Cerrado en dos pasos: el catálogo v2 puso `no_wire_8k` en tokens canónicos y quitó `7680x4320` del wire; **D3 v2 añadió `amlogic` a `no_wire_8k`**, con lo que los 4 SoC canónicos quedan cubiertos y el residual desaparece | `sync_features.json:99` (`no_wire_8k` con amlogic) · `sync_features.json:105` · `sync_contract.test.js:155` |
| **D4-F02** | **MED → CERRADO (D3 v2)** | `sync_request.state` no admitía `apply` ⇒ el ack completo no cabía. **D3 v2 lo implementó**: `state.apply` en el schema con los mismos 5 estados y 17 razones, validado por `validateApply()` en el cliente | `sync_request.schema.json:1758` · `ara_sync_client.js:394-495` · `ACK_STATES` en `:85` |
| **D4-F03** | **MED** | 14 de las 29 claves del `SettingsApplier` **no son alcanzables** desde ninguna política (el catálogo sólo acepta 13) | `sync_features.json:121-136` · `SettingsApplier.kt:136-172` |
| **D4-F04** | **MED** | `device_capabilities` sigue devolviendo 400 en el endpoint QoE ⇒ el ack no puede ir por ahí; se usa `heartbeat.data.caps.apply` | `conviva_qoe_server.php:70-81,141-143` (R4-F01) |
| **D4-F05** | **LOW** | `player.abr_bw_factor` y `player.live_delay_s` no tienen equivalente en media3: `not_applicable` (no se finge) | `sync_response.schema.json:134-176` |
| **D4-F06** | **MED** | El esquema `sync_request` exige magnitudes que el APK no mide ⇒ sin la enmienda nullable de R4 §6.5 no hay `/sync` honesto (el catálogo v2 ya modela `prov`/`null`) | `sync_request.schema.json:164-190` · `sync_features.json:10-15` |
| **D4-F07** | **LOW** | `thermal_target_c`/`thermal.limits` son objetivos en °C sin termómetro: sin ADB sólo se aproxima con `pm_thermal_status` (7 niveles) | `R5_actuators.md:376-395` |
| **D4-F08** | **LOW** | El dump `onn_settings_global_pq.txt` está en **UTF-16LE con BOM**: leerlo como UTF-8 devuelve NULs y hace creer que ninguna clave existe | verificado en el verificador (`dumpBuf[0..1] === FF FE`) |
| **D4-F09** | **MED** | El catálogo v2 **rechaza** `device.soc` con alias ⇒ una política legacy del propio ejemplo del protocolo (`amlogic_s905x4`) no llega al resolvedor. D4 exige convertir ese rechazo en `denied/policy_invalid` reportado, no en silencio | `sync_features.json:101` · `ara_sync_client.js:651` |
| **D4-F10** | **MED (abierto)** | Un SoC **no canónico no puede reportarse por `/sync`**: `client.soc` exige token canónico (rechaza incluso `unknown` ⇒ **400**) y `state.apply.soc.m` también ⇒ el `denied/soc_unmapped` de D4 **no viaja** por L3. La garantía de "no silencio" queda en **L1 (local)** y **L2 (heartbeat `caps.soc`, libre, persistido en `ara_heartbeats.caps_json`)**; el puente hacia el reconciliador (`/var/lib/ape/soc_seen.jsonl`) **no está implementado** | `ara_sync_client.js` (`soc_canonical`, `ack_soc_m`) · `sync_request.schema.json:85` (`soc_raw`) · `docs/rea/16_SOC_ALLOWLIST_RECONCILER.md:19` |

---

## 13 · Verificación ejecutada

```powershell
node ara-x/scripts/d4_check_device_apply.js "<repo-root>"    # exit 0 · 120 ok / 0 FAIL (determinista)
```

| Bloque | Qué comprueba |
|---|---|
| **1 · mapa vs código y catálogo** (24) | 29 claves = las del `.kt` · regex efectivas idénticas · `in_ns_map`=15 y `in_vpp_levers`=13 del PHP · `in_client_allowlist` = `catalogo.levers.vpp` (13) · `soc.canonical` = catálogo · `processing.tiers` y `fps.targets` del catálogo · alias espejo · `ceiling_by_tier` con las 4 claves · `ns_observed` contra el dump (UTF-16) · coherencia con R5 · tiers particionan 29 · 15 alcanzables / 3 prohibidas / 1 alias |
| **2 · vectores** (65) | los 4 vectores reproducen `state`, `denials`, `warnings`, `soc`, `cadence_class`, `thermal`, `writes`, `unchanged_count`, `clamped`, `aliases`, `deferred_codes`, `not_applicable`, `held_levers`, `player_ops`, `ack_reason`, `skipped` |
| **3 · cliente v2 real** (6) | V1 y V4 pasan `validatePolicy` real; V2 (legacy con alias) y V3 (mentirosa) son rechazadas como se espera; el resolvedor **tolera** el alias y lo reporta; tier efectivo correcto |
| **4 · guards** (14) | ninguna clave prohibida en un write · wire 8K siempre `denied` · **ningún `denied` sin razón ni SoC medido** · 8K con SoC canónico · expirada ⇒ `denied` · `soc_mismatch` ⇒ `denied` · `mcfr=2` clampado · `fps.target=24` ⇒ clase 24 · tier más conservador que los levers ⇒ manda el tier · `thermal unavailable` ⇒ 0 pasos y 0 clamps · `temp 71.5 ≥ severe_c` ⇒ 2 pasos · estado `deferred` |
| **5 · cierre D3 v2 + ack L3** (11) | `no_wire_8k` cubre los 4 SoC canónicos (**D4-F01 cerrado**) · `7680x4320` fuera del enum · `state.apply` presente en el schema (**D4-F02 cerrado**) · los 5 estados y las razones/skipped/defer del catálogo coinciden con el contrato · el ack mapeado de **V1, V2, V4** pasa `validateApply()` real (3/3) · el de **V3** se rechaza por `ack_soc_m` (confirma **D4-F10**) |

> **Regla de propiedad del esquema (para no pelearse con t9/D3):** D4 es dueño del **contrato de aplicación**, no
> del esquema de política. Si el cliente añade un requisito nuevo **ajeno** al subconjunto que D4 aplica, el
> verificador imprime `warn` (sin fingir que pasa). Si el rechazo es por algo que **D4 sí gobierna** (`device_soc`,
> `wire_8k`, `display_wire`, `degrade_resolution`, `never_downscale`, `min_resolution`), **falla**.

**Límite declarado:** el verificador comprueba **reproducibilidad determinista + consistencia con el código y el
catálogo**, no que el diseño sea el mejor posible ni que el VPP del SoC responda como dice la tabla térmica (eso
exige device).

---

## 14 · NOT_RUN

| No ejecutado | Causa |
|---|---|
| Cualquier comando ADB / lectura de `thermal_zone*` | prohibido por el contrato de la tarea |
| Aplicar de verdad en un device (settings put + observar imagen) | requiere device + consentimiento |
| Medir el efecto térmico de cada escalón | requiere termómetro (ADB) + campaña |
| Probar `/sync` end-to-end | el endpoint **no existe** en producción (404) |
| Implementar el código Kotlin del resolvedor | fuera de alcance de D4 (contrato + vectores + mapa) |
| Enmendar `sync_request.schema.json` | fuera de alcance; se especifica la forma y se deja al lote de enmienda |
