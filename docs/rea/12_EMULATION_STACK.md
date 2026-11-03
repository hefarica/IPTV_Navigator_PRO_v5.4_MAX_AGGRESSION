# 12 · Stack de emulación display-side en `ape_vpp`

**Tarea:** `t44` · **attempt:** `93fb980e-b041-4cd2-8fcc-f3971a4069cf` · **Autor:** `s6-nginx-lua` (S6) · **HEAD:** `2f8861c` · **Estado:** aplicado en repo y probado, **sin deploy ni commits**.
**Extiende:** [`11_EMULATE_8K_DISPLAY.md`](11_EMULATE_8K_DISPLAY.md) (t43) · **Cambio:** 1 fichero, `vps/prisma/lib/ape_mesh.php` `7ef444163928` → **`37f043b8e833`** (41 232 → 43 822 B).

## 1 · Qué es cada cosa (la tabla que evita mentir)

| Bloque | Naturaleza | Quién lo ejecuta | ¿Existe la clave? |
|---|---|---|---|
| `supersample` | **intención** de supersampling (SR interna 8K → downscale al panel) | SoC (AI-SR) | n/a — es intención, `never_real:true` |
| `ai_sr` (`level:3`) | **real** | SoC | `pq_ai_sr_enable` ✔ |
| `ai_pq` (`mode:3`, `profile`) | **real** | SoC | `ai_pq_mode`, `aipq_enable` ✔ |
| `sharpness` | **real** | SoC | `pq_sharpness_enable` ✔ (booleano) |
| `dnr` (`mode:auto`) | **real** | SoC | `pq_ai_dnr_enable`, `pq_dnr_enable`, `pq_nr_enable` ✔ |
| `hdr_tone` (`mode:1`) | **real** | SoC | `pq_hdr_enable`, `pq_hdr_mode` ✔ |
| `deband` | **NOT_RUN** | — (sólo player: VLC `gradfun`) | **no verificada** ⇒ `enabled:false` |
| `chroma_upsample` | **NOT_RUN** | — | **no verificada** ⇒ `enabled:false` |
| `contrast` / `saturation` | **NOT_RUN** | — | **no verificadas** ⇒ `enabled:false` |
| `memc` | **intención** (por `ct`) | — (filtro de **player**) | **no existe como setting** ⇒ `enabled:false` + `intent` |

**No se inventa ningún `settings put`.** Las cuatro claves inexistentes viajan con `reason:"sin_clave_de_soc_verificada"` (y `memc` con `reason:"no_existe_clave_de_soc_es_filtro_de_player"`), para que el ARA no intente aplicarlas.

## 2 · Reglas implementadas

1. `supersample.enabled` **sólo** si `w ≥ 3840` **y** SoC allowlisted **y** `ai_sr` disponible. Si no: `false` + `reason` (`fuente_menor_4k` / `soc_no_allowlisted` / `soc_sin_ai_sr` / `8k_real_por_caps`).
2. `w < 3840`: `supersample=false` (su camino es AI-SR **a** 4K) pero **el resto del stack sí** aplica.
3. Sólo claves reales (las 13 de t41). Lo demás queda `false` + `reason` (tabla §1).
4. `never_real:true` en todo lo de 8K; `target_display:"4k"` (HDMI tope 4K); `soc_8k` **nunca** se toca.
5. Perfiles: `max_image` (todo on) · `sports` (DNR **off**, `memc.intent:true`) · `cinema` (DNR on, sharpness **off**, `memc` off).
6. `device_settings` fusiona **sólo** si `allowed`; sin allowlist, fallback intacto (los 3 levers de hoy).

## 3 · Consistencia con t43 (no hay dos verdades)

`emulate_8k` **se conserva** (compatibilidad) y `emulation.supersample` lo espeja. Invariante verificado por test:
`emulate_8k.enabled === emulation.supersample.enabled` (`s5_coherente_con_emulate_8k`). Ningún consumidor debe leerlos como dos funciones distintas.

## 4 · Tests ejecutados (PHP 8.3.6 del VPS, staged en `/tmp/t44`)

| Test | Exit | Resultado |
|---|---|---|
| `php -l` lib + api | **0** | sin errores |
| Harness (45 aserciones) | **0** | **45/45 pass, 0 fail** (primera corrida) |
| 4K + allowlist + `ai_sr` | — | `supersample` on (`internal_8k_then_downscale`, `target_display:4k`, `never_real:true`), `ai_sr` on `level:3`, `ai_pq` `mode:3`, `sharpness` on, `dnr` on `auto`, `hdr_tone` `mode:1`, **13 levers intactos** |
| 2K / 1080p / SD | — | `supersample` off (`fuente_menor_4k`) y **resto del stack on** |
| sin `ai_sr` | — | `supersample` off (`soc_sin_ai_sr`), `ai_sr.enabled:false` |
| SoC `samsung` | — | todo `enabled:false` (`soc_no_allowlisted`) y **0 levers** |
| `deband`/`chroma_upsample`/`contrast`/`saturation` | — | **siempre** `false` + `sin_clave_de_soc_verificada` |
| `memc` | — | `enabled:false` + `intent` (true en `sports`, false en `cinema`/`default`) |
| `sports` / `cinema` / `max_image` | — | DNR off/on/on · sharpness on/off/on · `ai_pq.profile` correcto |
| Matrícula (`file=x`) before/after | **0** | **byte-idéntico** (109 B == 109 B) ⇒ sin `ape_vpp` ni `emulation` |
| Device, before (producción t41) vs after (repo t41+t43+t44) | **0** | **0 claves nuevas de primer nivel**, **0 campos distintos fuera de `ape_vpp`**; dentro del bloque se añaden `emulate_8k` (t43) y `emulation` (t44) |

## 5 · Emulación **solo en VLC** (player-side, opcional, no se toca)

Ya existe y **no la añadimos a otros players**: `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php:56` (`bwdif`), `:67` y `:77` (`nlmeans`), `:69` (`unsharp`), más `gradfun` en los presets vivos del feedforward. Es **filtrado en el reproductor** (CPU del device, no del VPS) y **no** mejora el bitstream.

**Riesgo declarado:** `nlmeans` a `p=7:r=15` es caro en CPU; en un Fire TV puede provocar *dropped frames* → **empeorar** la experiencia. `NOT_RUN`: nadie midió fps con esos filtros en este device.

## 6 · Lo que NO demuestra (NOT_RUN, sin adornos)

1. **Efecto real en el panel = `NOT_RUN`**: falta el ARA/daemon en el device autorizado.
2. `supersample` es **intención**, no píxeles 8K: si el SoC no materializa AI-SR, no cambia nada.
3. `deband`, `chroma_upsample`, `contrast`, `saturation`, `memc`: **no existen como clave de SoC verificada**; quedan `false` y listadas aquí. Si el propietario quiere aplicarlas, hay que abrir el ARA y **probar en device** primero (y entonces se añaden a la allowlist `ape_ff_settings_ns_map`).
4. **No se desplegó** (producción sigue en `cafe66e4508f`) y **no se tocó** el generador ni nginx.
