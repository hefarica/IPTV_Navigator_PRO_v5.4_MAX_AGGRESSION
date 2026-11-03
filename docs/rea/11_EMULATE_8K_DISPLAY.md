# 11 · Emular 8K display-side desde 4K nativa (supersampling, sin mentir)

**Tarea:** `t43` · **attempt:** `f7ac6dc5-0c74-4a2d-b215-6dd81dd59263` · **Autor:** `s6-nginx-lua` (S6) · **HEAD:** `2f8861c` · **Estado:** aplicado en el repo y probado, **sin deploy ni commits**. Extiende [`09b_VPP_IMPLEMENTACION.md`](09b_VPP_IMPLEMENTACION.md).

## 1 · Qué es (y qué no es) «emular 8K» — la frontera, explícita

| Capa | Qué hace | ¿Es 8K? |
|---|---|---|
| **Remux / transcode real** | reempaquetar o recodificar el bitstream en el servidor | **No** — y en el VPS está prohibido (candado `.ts→404`, `MAX_BODY` 4 MiB) |
| **8K real** | bitstream 7680×4320 + nivel `≥L183` + caps 8K + `uhd8k=1` | **Sí, y sigue intacto** (t29/t32, marcado, nunca `-REAL`) |
| **`emulate_8k` (esto)** | **intención de supersampling display-side**: la fuente ya es 4K, el SoC aplica AI-SR + AI-PQ y el panel reescala. **Cero bytes nuevos de vídeo** | **No.** Es una **intención declarada**, no píxeles 8K |

**`never_real:true` es contrato, no comentario.** `target` permanece **`4k`** porque en MT8696/S905X4 el HDMI topa en 4K: prometer 8K de salida sería justo la mentira que este campo impide.

## 2 · Contrato JSON (medido, no teórico)

| Fuente | `sr_needed` | `target` | `emulate_8k` |
|---|---|---|---|
| **`w ≥ 3840`** + allowlist + `ai_sr` | **false** | `4k` | **`enabled:true`** · `mode:"supersample_intent"` · `src:"3840x2160"` · `declared_max:"7680x4320"` · `never_real:true` · `requires:["ai_sr","ai_pq"]` · `reason:"supersampling_display_side"` |
| `w ≥ 3840` sin `ai_sr` | false | `4k` | `enabled:false` · `reason:"soc_sin_ai_sr"` |
| `w ≥ 3840` SoC no allowlisted o sin caps | false | `4k` | `enabled:false` · `reason:"soc_no_allowlisted"` |
| `w ≥ 3840` con **8K real** por caps (`target=8k`) | false | `8k` | `enabled:false` · `reason:"8k_real_por_caps"` (**nunca se mezclan**) |
| `1280 ≤ w < 3840` (2K/1440p/1080p) | **true** | `4k` | `enabled:false` · `reason:"fuente_menor_4k"` (su camino es AI-SR **a** 4K) |
| `w < 1280` (SD) | true | `4k` | `enabled:false` · `reason:"fuente_menor_4k"` |

## 3 · Gate (fail-closed, reusa t41)

- Exige **las tres**: `allowed` (SoC en `soc_allow` leído de `ara_heartbeats.caps_json`) **+** `ai_sr` **+** `w ≥ 3840`.
- `ai_sr` sólo por dos formas declaradas: `caps.ai_sr` verdadero **o** `"ai_sr"` en `caps.features[]`. Nada más, ninguna inferencia.
- **Nunca toca `soc_8k`** (ese campo es de **salida 8K real**, inexistente en estos equipos) ni publica levers si no hay allowlist: el device conserva los suyos.

## 4 · Cambio

| Fichero | Antes (deploy t42) | Después (repo) | Δ |
|---|---|---|---|
| `vps/prisma/lib/ape_mesh.php` | `cafe66e4508f…` 39 596 B | **`7ef444163928…` 41 232 B** | +`emulate_8k` en `ape_vpp_block` |
| `ape-feedforward.php` · `push_pq_profile.php` | `9cd4e0fad875…` · `f0fc5e92f256…` | **sin cambios en t43** | — |

Sólo se añade la clave **anidada** `emulate_8k`: no hay claves nuevas de primer nivel, así que el caso «sin `ape_vpp`» (matrícula) sigue byte-idéntico.

## 5 · Tests (PHP 8.3.6 del VPS, staged en `/tmp/t43`)

| Test | Exit | Resultado |
|---|---|---|
| `php -l` lib + api | **0** | sin errores de sintaxis |
| Harness `emulate_8k` | **0** | **32/32 pass, 0 fail** (primera corrida) |
| 4K + caps + `ai_sr` | — | `enabled:true`, `never_real:true`, `requires:[ai_sr,ai_pq]`, `sr_needed:false`, `target:4k`, **sin `soc_8k`** |
| 2K / 1080p / SD | — | `enabled:false` + `fuente_menor_4k` en los tres |
| sin `ai_sr` · SoC `samsung` · sin caps | — | `enabled:false` + `soc_sin_ai_sr` · `soc_no_allowlisted` · `soc_no_allowlisted` |
| `features:["ai_sr","ai_pq"]` | — | `enabled:true` (segunda forma del gate) |
| 8K real por caps (`target=8k`) | — | `target:8k` + `emulate_8k.enabled:false` (`8k_real_por_caps`) |
| override `profile=P1` + `ct=sports` | — | `profile:P1`, `memc:true`, `emulate_8k` sigue `true` |
| Matrícula (`file=x`) y device mismo estado, before/after | **0** | matrícula **byte-idéntico** (109 B == 109 B); device: **0 claves nuevas de primer nivel**, **0 campos distintos fuera de `ape_vpp`**; única diferencia = `emulate_8k` dentro del bloque |

## 6 · Lo que NO demuestra (NOT_RUN, sin adornos)

1. **Efecto real en el panel = `NOT_RUN`.** Nadie ha visto un panel con esto: requiere el ARA/daemon en el device autorizado (`iptv-vps-touch-nothing`).
2. **No crea píxeles 8K.** Es una intención que el SoC puede o no materializar; sin `ai_sr` real, `enabled:false` y no pasa nada.
3. **No hay bitstream 8K por esta vía**: `CODECS`/`RESOLUTION`/`BANDWIDTH` no se tocan. Y si algún día hay caps 8K reales, la emulación se **apaga** (`8k_real_por_caps`) para no confundir las dos cosas.
4. **No se añadió `#EXT-X-APE-VPP` al generador** (sigue diferido) y **no se desplegó**: producción sigue con `cafe66e4508f` / `9cd4e0fad875` / `f0fc5e92f256`.
