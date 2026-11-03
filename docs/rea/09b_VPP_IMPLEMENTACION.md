# 09b · Implementación `ape_vpp` (repo-only) + gate de SoC

**Tarea:** `t41` · **attempt:** `6522ada0-5ae8-4bfc-9a27-a279656c83a1` · **Autor:** `s6-nginx-lua` (S6) · **HEAD:** `2f8861c`
**Estado:** parche **aplicado en el repo** y probado. **NO desplegado. Sin commits. Cero escritura en `/var/www/html` ni en el VPS** (los tests corrieron sobre copias en `/tmp`).
**Base:** [`09_URL2_VPP_METADATA.md`](09_URL2_VPP_METADATA.md) + [`T39-ape-vpp.patch.md`](../../_vps_stage/edge/uhd/proposed/T39-ape-vpp.patch.md) · **Petición del propietario incorporada:** «un nivel superior para las 4K y 2K».

## 1 · Drift sincronizado primero (como ordenó el capitán)

`ape_mesh.php` del repo tenía 1 línea menos que el desplegado. Añadida **antes** de parchear, con el texto exacto del VPS:

```php
'global minimal_post_processing_allowed 0', // MAX IMAGE: full TV post-proc (DNR/sharpen/AI-SR), no ALLM bypass
```

Verificado: desplegado `b9bc9a69…`/30 412 B tenía la línea en **L64** — misma posición ahora en el repo. **No se sobrescribió el desplegado.**

## 2 · Diff aplicado (3 ficheros, todo aditivo)

| Fichero | Antes | Después | Qué se añadió |
|---|---|---|---|
| `vps/prisma/lib/ape_mesh.php` | `4e293907…` 30 288 B | **`cafe66e4508f` / 39596 B** | línea de drift + `ape_mesh_device_settings($si, $vpp=null)` + 5 funciones: `ape_vpp_levers`, `ape_vpp_profile_for`, `ape_caps_of_device`, `ape_soc_allowlisted`, `ape_vpp_block` |
| `vps/prisma/api/ape-feedforward.php` | `4c0668ad…` 3 146 B | **`9cd4e0fad875` / 3906 B** | bloque `ape_vpp` (sólo modo device-keyed) + fusión de levers si `allowed` |
| `vps/prisma/cli/push_pq_profile.php` | `5d1ef6e9…` 2 844 B | **`f0fc5e92f256` / 3406 B** | gate fail-closed antes de `ape_insert_delta()` |

**Reutiliza el contrato existente en vez de inventarlo:** la fusión usa `ape_ff_settings_ns_map()` (allowlist de claves «espeja el APK») y **no** duplica claves ya presentes en la base. `ai_pq_mode` va como `global` (lo que dice el mapa real del código), no como el `system` del SOP ADB.

## 3 · Perfil por resolución de origen y por contenido (petición del propietario)

`ape_vpp_profile_for($width, $ct)`:

| Resolución de origen | `profile` | `target` | `sr_needed` | MEMC |
|---|---|---|---|---|
| `w ≥ 3840` (4K nativa) | **P0** | `4k` | **false** (no hace falta escalar) | off; **on** sólo `sports` |
| `1280 ≤ w < 3840` (2K/1440p **y** 1080p) | **P0** | `4k` | **true** (AI-SR escala a 4K) | off; **on** sólo `sports` |
| `w < 1280` | **P1** (más agresivo SR/DNR) | `4k` | **true** | off |
| `w` desconocido (0) | **P1** | `4k` | **true** | off |

Por contenido: `sports` → `pq_profile=sports` (DNR 0/0, MEMC on) · `cinema` → `cinema` (DNR 1/1, MEMC off) · `default` → `max_image`.

**Levers (13, idénticos en las tres resoluciones; cambia el perfil y `sr_needed`):**
`pq_ai_sr_enable=1 · ai_sr_level=3 · ai_pq_mode=3 · aipq_enable=1 · pq_sharpness_enable=1 · pq_ai_dnr_enable=1 · pq_dnr_enable=1 · pq_nr_enable=1 · pq_ai_fbc_enable=1 · pq_hdr_enable=1 · pq_hdr_mode=1 · match_content_frame_rate=1 · minimal_post_processing_allowed=0`

**8K:** estos equipos son HDMI 4K. `target=8k` ⇒ `allowed:false, reason:"target_8k_sin_caps_8k"` **salvo** que `caps_json` declare `soc_8k:true` (probado en ambos sentidos).

## 4 · Tests ejecutados (PHP 8.3.6 del VPS, sobre copias en `/tmp/t41/`)

| Test | Comando | Exit | Resultado |
|---|---|---|---|
| Sintaxis ×3 | `php -l` sobre los 3 staged | **0** | `No syntax errors detected` en los tres |
| Harness unitario | `php /tmp/t41/harness.php` | **0** | **33/33 pass, 0 fail** |
| (a) allowlisted | `ape_vpp_block('mt-dev', …4K)` | — | `allowed:true`, **13 levers**, `soc:mt8696`, `src:3840x2160`, `sr_needed:false` |
| (b) fail-closed | caps `NULL` / `samsung` / device inexistente | — | `allowed:false` + `levers:[]` en los 3; `device_settings` == base (`b5_fallback_identico`) |
| (c) por contenido | `sports` / `cinema` / `default` | — | `pq_profile` correcto; MEMC on/off/off; DNR 0/1/1 |
| (d) por resolución | 4K / 2K / 1080p / 1280 / 576 | — | `P0,sr=false` · `P0,sr=true` · `P0,sr=true` · `P0,sr=true` · `P1,sr=true` |
| (e) 8K | `target=8k` sin/son `soc_8k` | — | denied / allowed+`target:8k` |
| (f) fusión | `ape_mesh_device_settings($si,$vpp)` | — | sin claves duplicadas; `minimal_post_processing_allowed` **una sola vez**; `global ai_pq_mode 3` presente |
| Before/After endpoint | desplegado (curl) vs staged (`php`) mismo query | **0** | **sólo** se añade `ape_vpp`; **10 campos idénticos**; `presets` 41==41 **iguales**; `device_settings` 3 → 3+11 (sin duplicar las 2 que ya estaban) |

Respuesta AFTER (device `test-device`, `w=1920`): `ape_vpp = {schema:ape.vpp.v1, allowed:true, reason:soc_allowlisted, profile:P0, pq_profile:max_image, target:4k, src:"1920x1080", sr_needed:true, memc:false, soc:mt8696, levers:{13}}`.

## 5 · Hashes del repo tras el parche

```
vps/prisma/lib/ape_mesh.php   → cafe66e4508f (39596 B)
vps/prisma/api/ape-feedforward.php → 9cd4e0fad875 (3906 B)
vps/prisma/cli/push_pq_profile.php → f0fc5e92f256 (3406 B)
```

*Todos quedan como `M`, sin `git add`. Desplegados siguen intactos: `ape_mesh` `b9bc9a69` (30 412 B), `ape-feedforward` `4c0668ad`, `push_pq` `5d1ef6e9`.*

## 6 · Lo que NO demuestra (ni pretende)

1. **Efecto real en el panel = `NOT_RUN`.** Requiere el ARA/daemon en el device autorizado; aquí sólo se prueba que el **JSON** transporta el perfil y que el gate deniega cuando debe.
2. **`memc`**: se publica como **intención** (`memc:true|false`), pero **no existe clave de SoC `memc`** en el repo (MEMC es filtro de player, `minterpolate`). No se emite ningún `settings put … memc`: sería inventar.
3. **`cinema` con «sharpness moderado»**: `pq_sharpness_enable` es booleano (0/1). «Moderado» no es expresable ⇒ se emite `0` y se declara la limitación.
4. **Namespaces**: sólo `ai_pq_mode`/`ai_pic_mode` tienen evidencia dual (SOP `system`, mapa del código `global`). Se usa el **mapa del código**; si el APK espera otro, se verá en el device (NOT_RUN).
5. **Broadcast**: el CLI exige `APE_VPP_ALLOW_BROADCAST=1`; sin device no se puede gatear y el feedforward **omite** `ape_vpp` (respuesta byte-idéntica a hoy).
6. No se tocó `ape_uhd.lua`, `ape_gateway.lua`, `RESOLUTION`, `CODECS`, `BANDWIDTH` ni el generador.
