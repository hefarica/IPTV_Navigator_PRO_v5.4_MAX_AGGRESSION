# 09 · URL-2 / JSON: perfiles VPP por canal (sin tocar decode)

**Tarea:** `t39` · **attempt:** `4582ab8e-50a8-4785-ae09-c8488bada00b` · **Autor:** `s6-nginx-lua` (S6) · **HEAD:** `2f8861c`
**Alcance:** diseño + ficha de parche. **NO se aplicó ningún cambio de código. Cero deploy, cero escritura en producción.**
**Ficha de parche (sin aplicar):** [`_vps_stage/edge/uhd/proposed/T39-ape-vpp.patch.md`](../../_vps_stage/edge/uhd/proposed/T39-ape-vpp.patch.md)

---

## 1 · Inventario real del cartucho URL-2 (lo que hay hoy)

**Cómo viaja.** La lista emite la URL-2 como tag inerte y el device la hace GET:

| Pieza | Evidencia |
|---|---|
| La lista lleva `#EXT-X-APE-FEEDFORWARD:URL="https://…/prisma/api/ape-feedforward.php?…"` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3029,3073` |
| Ese endpoint devuelve `presets[]` (**player-blind**, viajan por la LISTA, «NUNCA STREAM-INF») + `device_settings[]` (**el daemon** los aplica por Android Settings, allowlist) | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/ape-feedforward.php:11-14,54-65` |
| Los inputs de la URL-2 son GET: `hdr,w,h,codec,buf,risk,ct` | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php:259-271` |
| Gate del endpoint: matrícula (`file`/`list_id`) **o** device-keyed; si no hay ninguno → `activated:false` + `presets:[]` | `ape-feedforward.php:26-37` |

**Qué campos por canal existen de verdad:**

| Mecanismo | Contenido real | Evidencia |
|---|---|---|
| `ape_mesh_device_settings()` | **sólo 2** levers: `global match_content_frame_rate 1` y `global hdr_conversion_mode 1` | `ape_mesh.php:61-65` |
| `push_pq_profile.php` | **13 levers** AI-PQ/AI-SR en un `device-setting`: `pq_ai_sr_enable, ai_sr_level, ai_pq_mode, aipq_enable, pq_sharpness_enable, pq_ai_dnr_enable, pq_dnr_enable, pq_nr_enable, pq_ai_fbc_enable, pq_hdr_enable, pq_hdr_mode, match_content_frame_rate, hdr_conversion_mode` | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/cli/push_pq_profile.php:22-30` |
| Perfiles PQ reales | `max_image` (default) · `sports` · `cinema` · `off` | `push_pq_profile.php:11,31-37` |
| Alcance del delta | `device` y/o `channel` opcionales → `null` = broadcast / cualquiera; `ttl_seconds=1800`, `priority=80`, `source=pq-profile` | `push_pq_profile.php:40-47` |
| Bus de deltas | tabla `policy_deltas(target_device_id, channel_id, delta_type, priority, payload_json, expires_at, source)`; `payload._meta.schema = ape.policy_delta.v1` | `ape_mesh.php:310-321,349-372` |
| Caps del device | `ara_heartbeats.caps_json` (se escribe en el heartbeat) | `ape_mesh.php:326-336,376-384` |
| Resolver de perfil en el edge | `ape_profile_resolver.lua` → **P0–P5** por `stream_id`, map `ape_profile_map.json`, cache 60 s en `lab_config`, nil-safe (nil ⇒ default del caller) | `_vps_stage/lua/ape_profile_resolver.lua:23-24,55-82` |
| Bulk por canal (lo que lee el generador) | `channel-pq-bulk.php` → `{channel_id:"SDR"}` (blacklist por pantallazo negro con PQ) | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/channel-pq-bulk.php:8-14` |
| Volumen del cartucho en el generador | **1 293** ocurrencias literales de `#EXT-X-APE-` (familias: `FALLBACK-*`, `PERCEPTUAL-4K`, `LCEVC`, `BUFFER-STRATEGY`, `ANTI-FREEZE-NUCLEAR`, `EVASION-*`, `4KFALSE-ENGINE`, `PHANTOM-DEVICE-SPOOF`, `WAKE`, `FEEDFORWARD`, `CONTENT-STEERING`, `SYS-*`…) | recuento sobre `m3u8-typed-arrays-ultimate.js` |

**Doctrina vigente que el diseño NO puede romper:** «Players ciegos a `#EXT-X-APE-*`; el ARA aplica SOLO device_settings allowlisted» (`ape_mesh.php:275-278`) y «presets … NUNCA STREAM-INF» (`ape-feedforward.php:12-13,65`).

## 2 · Extensión propuesta: bloque `ape_vpp` (aditiva, retrocompatible)

Se añade **una clave** al JSON de la URL-2. Sin `ape_vpp` ⇒ respuesta **byte-idéntica** a hoy.

```json
"ape_vpp": {
  "schema": "ape.vpp.v1",
  "profile": "P1",                        // vocabulario LAB P0–P5 (ape_profile_resolver)
  "pq_profile": "max_image",              // vocabulario REAL de push_pq_profile
  "target": "8k",                         // "4k" | "8k"  (sólo metadata; no toca RESOLUTION)
  "levers": {                             // claves BARE reales; el ARA mapea namespace
    "pq_ai_sr_enable": 1, "ai_sr_level": 3,
    "ai_pq_mode": 3, "aipq_enable": 1,
    "pq_sharpness_enable": 1,
    "pq_ai_dnr_enable": 1, "pq_dnr_enable": 1, "pq_nr_enable": 1,
    "pq_ai_fbc_enable": 1,
    "pq_hdr_enable": 1, "pq_hdr_mode": 1,
    "match_content_frame_rate": 1
  },
  "soc_allow": ["mt8696", "amlogic"],
  "src": "3840x2160"
}
```

**Tres correcciones al ejemplo del encargo, con evidencia (no inventar campos del SoC):**

| Propuesto en el encargo | Realidad medida | Qué hace el diseño |
|---|---|---|
| `ai_sr_level:"high"` | `ai_sr_level` es **numérico** = `3` («SR nivel High», namespace `global`) | se usa `3`; `"high"` se acepta como **alias** que el applier traduce a `3` |
| `ai_pq:"auto"` | la clave real es **`ai_pq_mode`** y su valor «High» es `3` (namespace `system`) | se usa `ai_pq_mode:3`; `"auto"` se acepta como alias → `3` |
| `memc:"off"` | **no existe** ninguna clave `memc` de SoC en el repo; MEMC aparece sólo como **filtro de player** (`EXTVLCOPT:video-filter=minterpolate`, técnica Xiaomi PatchWall) | se acepta la clave por compatibilidad pero el applier **la ignora**; el lever real más cercano es `match_content_frame_rate`. **No se inventa** un `settings put … memc` |

Evidencia de los valores reales: `.agent/skills/adb_master_directives_rule/SKILL.md:55,60,130,134` (ruta **singular** `.agent/`; la copia de `.agents/_archive_…/skills_bogus_stubs/` es un stub archivado y **no** se cita) · MEMC sólo como filtro de player: `_backups/frontend/js/ape-v9/before-t52-exthttp.js:7964-7990`.

**Reglas de seguridad (no negociables):**

1. **Gate por SoC en el SERVIDOR, no en el device.** `soc_allow` se compara contra `ara_heartbeats.caps_json` **antes** de devolver el bloque; si el SoC no está allowlisted o `caps_json` está vacío → se devuelve `ape_vpp: null` y el daemon mantiene su perfil seguro. **Nunca se envía un lever que el SoC no declare.**
2. **Fail-closed:** sin caps ⇒ sin VPP (no «asumir MediaTek»).
3. **Fallback = perfil de hoy:** `ape_vpp` ausente ⇒ `device_settings` = los 2 levers actuales (`match_content_frame_rate`, `hdr_conversion_mode`). Cero cambio visible.
4. **Sin pantalla negra por construcción:** `ape_vpp` **no** toca `RESOLUTION`/`CODECS`/`BANDWIDTH` ni `VIDEO-RANGE`; sólo settings de post-proceso del panel. Si el SoC ignora un lever, el bitstream no cambia y el decode sigue igual.
5. `target` es **metadata de intención** para el marcador; **no** modifica la declaración del manifiesto (eso sigue siendo `declare_auto` + su guarda de t32).

## 3 · Marcador de manifiesto `#EXT-X-APE-VPP`

```
#EXT-X-APE-VPP:profile=P1;target=8k;src=3840x2160;pq=max_image;soc=mt8696;can8k=1
```

- **Inerte:** es un tag desconocido ⇒ RFC 8216 §6.3.1 obliga a **ignorarlo**; mismo patrón ya usado por `#EXT-X-APE-UPSCALE` y `#EXT-X-APE-PRESENTATION-TARGET` (`_vps_stage/lua/ape_uhd.lua:14,101`; `ape_rebase_lib.lua:161`).
- **`#EXT-X-APE-VPP` no existe hoy en el repo** (0 ocurrencias) ⇒ se propone, no se asume.
- **Prohibido que toque** `RESOLUTION`, `CODECS`, `BANDWIDTH`, `VIDEO-RANGE`: el marcador va **después de `#EXTM3U`, una sola vez**, igual que el de upscale.
- Va con `soc=` **sólo si** el SoC está allowlisted; si no, se omite el tag entero (coherente con §2.1).

## 4 · Camino de aplicación: qué existe y qué falta

| Paso | Existe | Evidencia |
|---|---|---|
| El device pide la URL-2 (feedforward) | **SÍ** | `ape-feedforward.php:40-52` |
| El VPS conoce el SoC/caps del device | **Parcial**: la columna `caps_json` existe y se escribe en heartbeat, pero **nadie la compara con un allowlist** | `ape_mesh.php:333,376-384` |
| Hay un bus para empujar settings por canal/device con TTL y prioridad | **SÍ** | `policy_deltas` (`ape_mesh.php:310-321,349-372`) |
| Hay CLI que empuja 13 levers VPP | **SÍ** | `push_pq_profile.php:22-47` |
| El bloque `ape_vpp` en la respuesta | **FALTA** (hueco que cierra la ficha) | `ape-feedforward.php:54-65` no lo emite |
| Gate `soc_allow` server-side | **FALTA** | grep: no hay comparación caps↔allowlist |
| Marcador `#EXT-X-APE-VPP` | **FALTA** | 0 ocurrencias en el repo |
| Aplicación real en el device (settings) | **NO VERIFICABLE AQUÍ** | `NOT_RUN`: requiere el ARA/daemon en el device autorizado |

**Cambio mínimo propuesto** (detalle exacto en la ficha): (a) `ape_mesh_device_settings()` gana un parámetro opcional y devuelve `ape_vpp` cuando el SoC está allowlisted; (b) `ape-feedforward.php` pasa las caps del heartbeat y añade la clave; (c) el generador emite **una** línea `tags.push('#EXT-X-APE-VPP:…')` junto a sus hermanas. Nada más. Todo con `if (function_exists(...))`/flag para que sin datos el comportamiento sea el de hoy.

## 5 · Gates de no-regresión (medibles, sin device)

| # | Gate | Criterio |
|---|---|---|
| **V-1** | **Manifiesto byte-idéntico salvo el tag nuevo** | Con `ape_vpp` desactivado: `sha256` del servido == línea base. Activado: diff = **exactamente una** línea `#EXT-X-APE-VPP:` y **cero** cambios en `RESOLUTION`/`CODECS`/`BANDWIDTH`/`VIDEO-RANGE` (mismo método que t35: normalizar y comparar) |
| **V-2** | **Fallback por SoC** | SoC no allowlisted o `caps_json` vacío ⇒ respuesta **sin** `ape_vpp` y con los 2 `device_settings` de hoy. Test: 3 caps sintéticas (`mt8696`, `amlogic`, `samsung`) ⇒ sólo las 2 primeras reciben bloque |
| **V-3** | **Sin `ape_vpp` todo queda como hoy** | Respuesta de la URL-2 byte-idéntica a la actual (sin la clave) y manifiesto sin el tag |
| **V-4** | **El tag es inerte** | Ningún player debe fallar: matriz S9 (TiviMate/OTT/hls.js/ExoPlayer) con el tag presente ⇒ mismo comportamiento; el guard UHD-04 no debe verlo como marca de upscale |
| **V-5** | **No se filtra información del device** | `caps_json` no se devuelve en claro en la respuesta pública (sólo `soc` como booleano de allowlist) |

**Límites declarados:** la **aplicación** de los levers y su efecto visual son `NOT_RUN` (requieren device autorizado; `iptv-vps-touch-nothing`). Este documento no afirma que el VPP «mejore la imagen»: afirma que **transporta** el perfil y que el post-proceso ocurre en el SoC, no en el VPS (`docs/VPS_UPSCALE_4K_DESIGN.md:127-132`).
