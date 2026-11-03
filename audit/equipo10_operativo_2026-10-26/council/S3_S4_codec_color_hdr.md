# Council c3 — S3 (codec RFC 6381) + S4 (color/HDR)

**Snapshot declarado:** `git HEAD e38a89b` (`e38a89bb30c02cb41050f34cef43d3711a2b0644`, 2026-10-26 03:08 -0500).
**Modo:** solo lectura. No se modificó ningún archivo del repo (el entregable es este .md).
**Alcance medido:** `frontend/js/ape-v9/{ape-fallback-resolver,ape-hevc-cascade,ape-canon-emitter,m3u8-quality-upgrader-v2,m3u8-typed-arrays-ultimate,m3u8-typed-arrays-ultimate_{BACKUP_PRE_USA,pre-admission},ape-segment-analyzer}.js`, `vps/nginx/lua/*.lua`, `_vps_stage/lua/*.lua`, `vps/**/*.php`, `IPTV_v5.4_MAX_AGGRESSION/backend/**/*.php`, `docs/manifestos/ape-vps-hevc-crystal-integrator/**`, `frontend/index-v4.html`.

## Nota de método y anclaje (leer antes de puntuar)

| # | Hecho | Evidencia |
|---|---|---|
| M1 | **El árbol de trabajo NO es el snapshot:** 19 rutas modificadas/borradas sobre e38a89b, incluido el generador principal. | `git status --porcelain` (exit 0) |
| M2 | `m3u8-typed-arrays-ultimate.js` **mutó durante la auditoría**: 21 581 líneas (04:12) → 11 443 (04:15) con `r.pqAllowed` distinto; `git diff --stat` pasó de `+10457` a `+300`. | `(Get-Content …).Count`, `git diff --stat` |
| M3 | **Las citas del generador se anclan al blob de HEAD**, no al WT: `git show HEAD:<path>` → 11 144 líneas (temporal `$TEMP\ape_head_gen.js`). El resto de citas son del WT (diff estable). | `git show HEAD:… \| Set-Content` |
| M4 | `ape-canon-emitter.js` (83 líneas) no emite `CODECS`/`VIDEO-RANGE`/`hvc1`/`hev1` (0 matches) ⇒ fuera de ambas dimensiones. Orden de carga real que define "emisor vivo": cascade (3969), resolver (3971), generador (3972), upgrader (3975). `_BACKUP_PRE_USA.js` y `.pre-admission.js` **no** se cargan. | `Select-String` → 0; `frontend/index-v4.html:3969-3975` |

---

# SECCIÓN S3 — Codec / RFC 6381 / Ley Nivel↔Resolución

## S3 · Veredicto
**WARN (no BLOCK).** Escalera y tabla de bitrate coinciden con la doctrina; las 23 cadenas RFC 6381 del generador son sintácticamente válidas y sus niveles correctos para profile `.1/.2/.4`. Pero hay **2 cruces reales de la GOLDEN RULE**, **1 emisor DV sin evidencia (P0)**, **1 default que declara HEVC sin evidencia de codec (F1)**, **1 capa PHP con nivel por debajo de la resolución** y **3 divergencias doc↔código** (F4, "L153 techo", HDCP-Adaptive). Nada se verificó contra bitstream real: **todo el juicio es estático**.

## S3 · Hechos con fuente

### S3.1 Validación RFC 6381 de cada cadena real (23 distintas en el generador de HEAD)

| Cadena | Declara | ¿Correcto? | Veredicto | Fuente |
|---|---|---|---|---|
| `hvc1.2.4.L63/L90/L93` | Main10 @ L2.1/3.0/3.1 | Main10 = profile_idc 2 | CONFORME | `ape-hevc-cascade.js:29-31` |
| `hvc1.2.4.L120 / L123` | Main10 @ L4.0 / L4.1 | 1080p@30 / @60 techo | CONFORME | `ape-hevc-cascade.js:32-33` |
| `hvc1.2.4.L150` | Main10 @ L5.0 | 4K@30 techo | CONFORME | `ape-hevc-cascade.js:34` |
| `hvc1.2.4.L153` | **Main10 @ L5.1** | **NO Main12, NO 12-bit**; 4K@60 techo (corrección inmutable cumplida) | CONFORME | `ape-hevc-cascade.js:35`; `ape-fallback-resolver.js:47-49` |
| `hvc1.2.4.L156/L180/L183/L186` | Main10 @ L5.2/6.0/6.1/6.2 | 4K@120 / 8K@30 / 8K@60 / 8K@120 | CONFORME | `ape-hevc-cascade.js:36-39` |
| `hvc1.4.*` (Main12 = **profile .4**) | Main12 12-bit | sólo clasifica, **ningún emisor lo produce** | HUECO (rama muerta) | `ape-fallback-resolver.js:47` |
| `hvc1.1.*` (Main = **profile .1**) | Main 8-bit | correcto | CONFORME | `ape-fallback-resolver.js:49` |
| `avc1.640028/29/33/3E`, `avc1.42E01E` | High L4.0/4.1/5.1/6.2, Baseline L3.0 | hex correcto (0x28=40, 0x29=41, 0x33=51, 0x3E=62) | CONFORME sintaxis | `m3u8-typed-arrays-ultimate.js` (HEAD, bloque AVC) |
| `dvh1.08.06`, `dvh1.05.09` | DV profile 8 / profile 5 | sintaxis `dvh1.PP.LL` válida; **sin evidencia** (S3.6) | HALLAZGO | `m3u8-typed-arrays-ultimate.js:9665` (HEAD) |
| `av01.0.13M.10.0.110.09.16.09.0` | AV1 Main10 | válido | CONFORME | idem `:9665` |
| `vvc1.1.L63.00.0.0` | VVC | **no verificable contra ISO/IEC 14496-15 en este council** | NO-RUN | `m3u8-typed-arrays-ultimate.js` (HEAD, `case 'VVC'`) |
| `hvc1.2.4.L153.90` | Main10 @ L5.1, constraint `0x90` | `.90` es constraint legal (progressive+frame_only) pero **inconsistente** con `.B0` del resto | CONFORME sintaxis / riesgo de convención | `m3u8-quality-upgrader-v2.js:249` |

### S3.2 GOLDEN RULE (`hvc1.*` sólo en STREAM-INF · `hev1.*` sólo en KODIPROP/EXTVLCOPT)

| Sitio | Contenido | Veredicto | Fuente |
|---|---|---|---|
| Cascada dual SSOT | `HEVC_CASCADE_HVC1` (manifest) vs `HEVC_CASCADE_HEV1` (runtime), "NUNCA cruzar" | CONFORME | `m3u8-typed-arrays-ultimate.js:32-33` (HEAD) |
| `EXTVLCOPT:codec` | aliases de familia (`hevc,hev1,h265,…`), **no** cadenas RFC | CONFORME | `…:3040` (HEAD); aliases en `ape-hevc-cascade.js:450-499` |
| `EXTVLCOPT:codec-priority`/`avcodec-codec` | misma cascada de familia | CONFORME | `…:3040` (HEAD, mismo bloque) |
| `KODIPROP … preferred_codec` | familia `hevc,hev1,hvc1,h265…` | CONFORME (token de familia) | `…:3468` (HEAD) |
| **`KODIPROP … codec_priority`** | **`hvc1.2.4.L153.B0,…`** (RFC completa en KODIPROP) | **CRUCE #1** | `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php:5035` |
| **`KODIPROP … preferred_codec`** | **`hvc1.2.4.L153.B0,…`** | **CRUCE #2** | `…/backend/resolve_quality_unified.php:5037` |
| `#EXT-X-APE-CODEC-PRIORITY-HEV1:` / `…RUNTIME-CODEC-HEV1:` | `hev1.*` en **tag APE privado**, no en `CODECS=` | CONFORME (fuera de `CODECS=`) | `…:6695,9622` (HEAD) |
| DASH `@codecs="hev1.2.4.L153.B0"` | `hev1` en MPD `Representation` | **NO es cruce HLS** (ISO/IEC 23009-1 lo admite); `truth_guards.md:14` no distingue DASH → imprecisión de doctrina | `vps/ape_hls_generators.php:441,446` |
| `hev1.*` dentro de `CODECS=` de `EXT-X-STREAM-INF` (JS/Lua/PHP HLS) | **0 ocurrencias** | CONFORME | `Select-String 'CODECS="[^"]*hev1\.'` → sólo los 2 hits DASH |

### S3.3 Ley Cardinal 1 (nivel ≥ resolución)

| Sitio | Par declarado | ¿Suficiente? | Fuente |
|---|---|---|---|
| 8K@120/60/30 → T13/T12/T11 | `L186/L183/L180` | Sí | `ape-hevc-cascade.js:198-202` |
| 4K@120/60/30 → T10/T9/T8 | `L156/L153/L150` | Sí (L153 4K@60 = CORONA) | `ape-hevc-cascade.js:204-208` |
| F2/F3/F4 resuelven tier con el **mismo** `{w,h,fps}` que declaran | coherente | Sí | `ape-fallback-resolver.js:300-306,354-360,402-409` |
| **`hvc1.2.4.H153.B0` con `res=7680x4320 fps=120`** | L5.1 sobre 8K@120 | **NO — vector del freeze 2026-06-08** | `IPTV_v5.4_MAX_AGGRESSION/backend/omega_ecosystem_v5.1/resolve_quality_unified.php:54` |
| **`hvc1.2.4.H150.B0` con `res=3840x2160 fps=120`** | L5.0 sobre 4K@120 | **NO** | `…/omega_ecosystem_v5.1/resolve_quality_unified.php:55` (ídem `:72,81`) |
| Guard `reqLevel`/`levelCorrected` | — | **no existe en HEAD**; sólo en WT no commiteado | `Select-String 'reqLevel\|levelCorrected'` sobre blob HEAD → **0** |
| `#EXT-X-I-FRAME-STREAM-INF:…CODECS="hvc1.2.4.L153.B0",RESOLUTION=1920x1080` | L5.1 sobre 1080p | sobran nivel (no rompe); además **sin `URI=`** (RFC 8216 §4.3.4.3 → dominio S1) | `m3u8-typed-arrays-ultimate.js:2764` (HEAD) |

### S3.4 Escalera F0–F5 y `verified` vs `preferred`

| Tier | CLAUDE.md | Código | Divergencia |
|---|---|---|---|
| F0 | "Real del probe" ✅ | `codec: probeData.videoCodec`, `codecVerified: true` incondicional | `ape-fallback-resolver.js:193-194` |
| F1 | "Real parcial ✅/partial" | `codec = probeData.videoCodec \|\| 'hvc1.2.4.L150.B0'` | **declara HEVC Main10 sin codec del probe** (conf. 65 = 25+20+10+10 ≥ umbral 60) → `:238`, `:93-102` |
| F2 | `hvc1.2.4.L153.B0` PREFERRED | cascada por resolución/fps | CONFORME `:300-319` |
| F3 | `hvc1.2.4.L120.B0` PREFERRED | cascada (L123 si 60fps) | CONFORME `:354-374` |
| **F4** | **`avc1.640028`** (AVC High) | **`hvc1.2.4.L93.B0`** + `qualityMode:'HEVC_MAIN10_FALLBACK'` | **divergencia doc↔código** (mandato HFRC 2026-05-22 "F4 sin AVC") → `:400-420` |
| F5 | sin codec ni STREAM-INF | `canEmitStreamInf:false`, `codec:null` | CONFORME `:443-472` |
| Tags | REAL vs PREFERRED | `CODEC-REAL`+`VERIFIED:true` sólo si `codecVerified` | CONFORME `:624-633` |

**Defecto de canal silencioso (F0):** con `confidence ≥85` y sin `videoCodec` (35+25+20+10 = 90), F0 marca `codecVerified:true` con `codec=undefined` y `emitStreamInfFromTruth` devuelve `null` (`:545`) ⇒ se cuenta `F0_REAL_VERIFIED_MAX++` pero **el canal sale sin STREAM-INF** y `channelsRemoved` sigue en 0.

### S3.5 Tabla de bitrate CLAUDE.md vs código — CONFORME
`APE_BITRATE_FALLBACKS` reproduce las 7 filas de CLAUDE.md (8K 80M/60M · 4K 28M/22M · QHD 16M/12M · 1080@60 12M/9M · 1080@30 9M/6.5M · 720 5.5M/4M · 480 2.5M/1.8M) — `ape-fallback-resolver.js:34-42`. Espejo Lua con los mismos AVERAGE (8K 60M, 4K 22M, FHD 9M/6.5M, 720 4M, SD 1.8M) — `vps/nginx/lua/quality_realtime.lua:133-144`.

### S3.6 Otros emisores vivos con riesgo
- **DV fabricado en P0:** `CODECS="${_mqCodecFirst},ac-3"` con `_mqCodecFirst='dvh1.08.06'` y `RESOLUTION=7680x4320`, sin evidencia DV ni 8K — `m3u8-typed-arrays-ultimate.js:9665,9668,9676` (HEAD, `maxQualityMode`).
- **Upgrader cargado (clase dormida):** `CODECS="hvc1.2.4.L153.90"` + `HDR="SMPTE-ST-2084"` + `VIDEO-RANGE="PQ"` + `#EXT-X-HDR:DOLBY-VISION,HDR10+,HDR10,HLG` para todo canal — `m3u8-quality-upgrader-v2.js:246-265`; cargado en `index-v4.html:3975`.
- **String inventado desde SPS parcial:** hardcodea `profile_compatibility=4` y arma `hvc1.<space><idc>.4.L<level>.B0` — `ape-segment-analyzer.js:234`.
- **Clasificador AV1 12-bit:** `c.includes('.12.')` no matchea `av01.0.13M.12` (sin punto final) ⇒ 12-bit puntúa como 8-bit (80 < 92) — `ape-fallback-resolver.js:50-53`.
- **Drift de capas:** `hvc1.1.6.L120.B0` (Main 8-bit) en mirror vs `hvc1.2.4.L120.B0` en principal — `vps/production_mirror/ape_profiles.php:209` vs `vps/ape_profiles.php:209`; `hvc1.*` en DASH del mirror (`production_mirror/ape_hls_generators.php:414,419`) vs `hev1.*` en el principal (`ape_hls_generators.php:441,446`).

## S3 · Riesgos
1. **F1 declara HEVC sin evidencia de codec** (`:238`): canal AVC con bitrate medido puede salir `CODECS="hvc1.2.4.L150.B0"` ⇒ init HEVC sobre H.264 = clase FZ-01. **HIGH**.
2. **P0 `dvh1.08.06` + 8K sin evidencia** (HEAD `:9665-9676`): DV que un TV sin DV no honra; 8K en device con techo HDMI 4K.
3. **Ley Cardinal 1 violada en `omega_ecosystem_v5.1`** (nivel < resolución en 8K@120 y 4K@120): si se cablea, reproduce el freeze 2026-06-08 por tabla.
4. **2 cruces GOLDEN RULE** en `backend/resolve_quality_unified.php`: ISA ignora/rechaza `hvc1.2.4.*` en KODIPROP ⇒ se pierde la cascada HEVC de runtime.
5. **F4 documentado ≠ F4 implementado**: un validador doc-vs-lista producirá PASS o FAIL según el lado que mire.

## S3 · Huecos y NO-RUN
- **NO-RUN:** no se ejecutó el generador ni ningún player; no hay bitstream, `ffprobe` ni logcat ⇒ nada de lo afirmado sobre el decoder real está medido.
- **NO-RUN:** wiring efectivo de `backend/resolve_quality_unified.php` y `backend/omega_ecosystem_v5.1/*` (no aparecen en `index-v4.html` ni en los `require_once` de `frontend/vps/resolve.php`) ⇒ riesgo latente, no confirmado en ruta.
- **NO-RUN:** validez externa de `vvc1.1.L63.00.0.0` y `av01.*.10.0.110.09.16.09.0` contra ISO/IEC 14496-15 (sin norma primaria en este council).
- **HUECO:** Main12 (`hvc1.4.*`) sólo clasifica, nunca emite: la escalera declara un tier que el pipeline no produce.
- **HUECO:** artefacto no reproducible (M2): 3 contenidos distintos del generador en ~6 min.

## S3 · Disensos
- **D-S3-1 (doc vs código):** CLAUDE.md fija F4=`avc1.640028`; el código aplica el mandato 2026-05-22 "F4 sin AVC". Sostengo que **gana el código** (decisión posterior del propietario) y que debe corregirse **CLAUDE.md**, no el resolver.
- **D-S3-2 (GOLDEN RULE vs DASH):** `truth_guards.md:14` redacta la regla sin distinguir HLS de DASH; los `hev1` de `ape_hls_generators.php:441,446` son legales en MPD. No los cuento como cruce.
- **D-S3-3:** "L153 = techo" (CLAUDE.md) se lee como cap; la tabla del repo (`truth_guards.md:30-40`) y el código lo tratan como **tier CORONA**, no como máximo. El código es correcto; la palabra "techo" engaña.

## S3 · Tareas propuestas
| ID | Tarea | Evidencia |
|---|---|---|
| S3-T1 | Quitar el default `'hvc1.2.4.L150.B0'` de F1: sin `videoCodec`, degradar a F3/F4 o no emitir `CODECS=` | `ape-fallback-resolver.js:238` |
| S3-T2 | Corregir F4 en CLAUDE.md a `hvc1.2.4.L93.B0` (o revertir código) — una sola fuente | `ape-fallback-resolver.js:400-420` |
| S3-T3 | Reemplazar `dvh1.08.06` en `maxQualityMode` por el tier HEVC real y gatear DV por `SUPPLEMENTAL-CODECS` probado | HEAD `:9665-9676` |
| S3-T4 | Pasar `hvc1.2.4.*` → `codec_hev1`/familia en los 2 KODIPROP de `resolve_quality_unified.php` | `…:5035,5037` |
| S3-T5 | Alinear `omega_ecosystem_v5.1` a `L186/L183/L156` o marcarlo obsoleto | `…:54,55,72,81` |
| S3-T6 | Portar el guard `reqLevel` de WT a HEAD (hoy la ley sólo se cumple por construcción de la tabla) | blob HEAD sin `reqLevel` |
| S3-T7 | Cerrar el agujero F0-sin-codec (contar F5 o no emitir tag REAL) | `ape-fallback-resolver.js:193,545` |
| S3-T8 | Decidir si `m3u8-quality-upgrader-v2` sigue cargado (declara DV+HDR10+HLG para todo canal) | `m3u8-quality-upgrader-v2.js:259`; `index-v4.html:3975` |

---

# SECCIÓN S4 — Color / HDR

## S4 · Veredicto
**WARN con 1 mentira técnica viva.** El LOCK (`VIDEO-RANGE=PQ` incondicional) **está implementado** en el generador y `SUPPLEMENTAL-CODECS` está correctamente gateado (0 invenciones en ruta viva). Pero: (a) el manifiesto-médula espinal **contradice** el LOCK; (b) `ape_mesh.php` sigue afirmando la tesis refutada el 2026-06-17; (c) **LEVER B está apagado por hardcode** en el Lua; (d) el VPS PHP emite `VIDEO-RANGE` con la regla vieja ⇒ dos capas del mismo sistema declaran cosas distintas.

## S4 · Hechos con fuente

### S4.1 Doctrina LOCKED vs corrección 2026-06-17 vs código
| Capa | Qué dice / qué hace | Fuente |
|---|---|---|
| Decisión del propietario (LOCKED 2026-06-16) | `VIDEO-RANGE=PQ` **incondicional** en todo `STREAM-INF`; "no re-debatir" | `CLAUDE.md` §"VIDEO-RANGE=PQ Incondicional" |
| Corrección técnica (2026-06-17) | `hdr_conversion_mode` **NO** hace SDR→HDR: `1`=PASSTHROUGH, `2`=SYSTEM (rechazado en mt8696), `3`=FORCE; el lever real es AI-PQ de hardware | `CLAUDE.md` §corrección 2026-06-17 |
| **Implementación JS (resolver)** | `SDR` si blacklist per-canal · `HLG` si probe verificó HLG · si no `PQ` + CICP 9/16·18/9 | `ape-fallback-resolver.js:563-577` |
| **Implementación JS (legacy 796)** | `,VIDEO-RANGE=PQ` incondicional con `_pqBlLeg` como rollback | `m3u8-typed-arrays-ultimate.js:9762,9961,9978` (HEAD) |
| **Implementación VPS PHP (prisma)** | `VIDEO-RANGE` **sólo si logcat probó PQ/HLG**; `''` = sin HDR | `vps/prisma/api/ape-match.php:189-190,217` |
| **Implementación VPS Lua (virtual_4k)** | añade `VIDEO-RANGE=PQ` + CICP `9/16/9` cuando `with_hdr` | `vps/nginx/lua/ape_virtual_4k.lua:28-36` |
| **Manifiesto (médula espinal, PHASE 0)** | "`PQ` sólo si TC=16; `PQ`/`HLG` sobre SDR = **RFC 8216bis MUST-violation**" | `docs/manifestos/ape-vps-hevc-crystal-integrator/references/truth_guards.md:47-49` |
| **Mentira técnica viva** | `global hdr_conversion_mode 1` justificado como "SDR->HDR enhancement incondicional" y "HDR_CONVERSION_SYSTEM… convierte SDR->HDR" | `vps/prisma/lib/ape_mesh.php:57-64` |

**CICP:** el trío es coherente como conjunto (BT.2020 `9` + PQ `16`/HLG `18` + BT.2020nc `9`) y **se omite en la rama SDR** — `ape-fallback-resolver.js:568-577`. No se encontró ningún emisor que declare `COLOR-PRIMARIES=1` (BT.709) junto a PQ/HLG en el alcance medido.

### S4.2 `SUPPLEMENTAL-CODECS` y `HDCP-LEVEL` — valores inventados
| Sitio | Estado | Fuente |
|---|---|---|
| Generador HEAD | **0 emisiones literales** de `SUPPLEMENTAL-CODECS=` | `Select-String` sobre blob HEAD → 0 |
| Resolver | gateado: sólo si `supplementalCodecsVerified && supplementalCodecs` | `ape-fallback-resolver.js:579-582` |
| `lcev.1.1.1` (LCEVC inventado) | **sólo** en variantes **no cargadas** por `index-v4.html` | `m3u8-typed-arrays-ultimate_BACKUP_PRE_USA.js:5527`; `…pre-admission.js:5694` |
| LCEVC en el VPS desplegable | sólo headers `X-LCEVC-*` en EXTHTTP, **no** `SUPPLEMENTAL-CODECS` | `frontend/vps/resolve.php:603-622` |
| `HDCP-LEVEL` default `'TYPE-1'` | **vivo** cuando hay `truth.channelId` | `ape-fallback-resolver.js:591-599` |
| ¿`channelId` en el truth? | **No**: ninguno de los 6 builders (F0–F5) lo define ⇒ rama del default TYPE-1 **inalcanzable**; "HDCP-Adaptive cableado en `emitStreamInfFromTruth`" (CLAUDE.md) no se cumple | `ape-fallback-resolver.js:186-472` vs `:594-597` |
| Contradicción interna de CLAUDE.md | criterio #6 "0 HDCP-LEVEL hardcodeado (TYPE-1 eliminado)" vs §HDCP-Adaptive "TYPE-1 por defecto" | `CLAUDE.md` (ambas secciones) |

### S4.3 LEVER B (`virtual_4k` guard) — presente en repo, **inerte**
| Hecho | Fuente |
|---|---|
| El guard existe: si `profile` ≠ P0/P1 y el codec top es `avc1`/`h264` ⇒ `_v4k_allow=false` + log `[LEVER-B] SKIP` | `vps/nginx/lua/combined_body_filter.lua:337-343` |
| **Pero** `local CHINA_BOX_FAKE_4K = true` hardcodeado ⇒ `(not CHINA_BOX_FAKE_4K)` nunca es verdadero ⇒ guard **desactivado** | `vps/nginx/lua/combined_body_filter.lua:335` |
| Consecuencia: `rewrite_variant_to_4k` reescribe `CODECS="hvc1.2.4.L153.B0,<audio>"` + `RESOLUTION=3840x2160` sobre **bytes AVC** (P2–P5) | `vps/nginx/lua/ape_virtual_4k.lua:14-26,38-40` |
| CLAUDE.md afirma que LEVER B está "GUARDADO" y desplegado (backup `leverB_20260618T205656Z`) | `CLAUDE.md` §"Refinamiento LEVER B" |
| Módulo hermano con estrategia **opuesta** (no tocar CODECS nunca; cita FZ-01) | `_vps_stage/lua/ape_uhd.lua:9-18,85-91` |

### S4.4 Coherencia BT.2020/BT.709 ↔ PQ/HLG
- `VIDEO-RANGE=SDR` ⇒ **sin** CICP (evita el handshake HDR fallido que el propio código documenta) — `ape-fallback-resolver.js:568-570`; `HLG` sólo si `hdrVerified` con `TC=18` — `:565,572`.
- `PQ` + `COLOR-PRIMARIES=9` + `MATRIX-COEFFICIENTS=9` es trío **técnicamente coherente**, pero declarado **sin evidencia** en todo canal sin rollback ⇒ sobre bytes SDR es el "color shift" que el código admite (`:559-562`), riesgo aceptado por el propietario.
- `quality_realtime.lua` mapea `hvc1.4.*` (Main12) a `hdr_quality=3` "= misma pipeline DV" — **conflación Main12↔Dolby Vision** — `vps/nginx/lua/quality_realtime.lua:121-122`.
- El upgrader cargado impone `#EXT-X-COLOR-PRIMARIES:bt2020` + `smpte2084` + `bt2020nc` a todo canal — `m3u8-quality-upgrader-v2.js:260-262`.

## S4 · Riesgos
1. **Dos verdades simultáneas sobre `VIDEO-RANGE`**: generador = PQ incondicional; VPS prisma = sólo con evidencia. Quien mida la lista (URL-1) y quien mida `/omega` (URL-2) obtendrán veredictos opuestos del mismo canal.
2. **`ape_mesh.php` documenta una capacidad inexistente** (SDR→HDR por `hdr_conversion_mode`): no cambia píxeles, pero sostiene una decisión doctrinal con premisa falsa.
3. **LEVER B apagado** ⇒ el escenario FZ-01 queda reinstalado por defecto en P2–P5 en la capa Lua, justo lo que el guard existía para evitar.
4. **`truth_guards.md` contradice el LOCK** y es lo primero que lee el council en PHASE 0 ⇒ riesgo de "corregir" el código hacia atrás.
5. **HDCP-Adaptive inalcanzable** (sin `channelId`): Conviva escribe decisiones que el emisor nunca lee; el default TYPE-1 documentado no se aplica.

## S4 · Huecos y NO-RUN
- **NO-RUN:** cero mediciones de luminancia/nits, `MaxCLL`/`MaxFALL`, primarias reales o `dataspace` del panel. Prohibido inferirlos: no hay instrumento ni captura en este council.
- **NO-RUN:** no se verificó en VPS si `combined_body_filter.lua`/`ape_virtual_4k.lua` están desplegados (`CLAUDE.md` §"REALIDAD MEDIDA" declara el pipeline Crystal aspiracional) ⇒ "LEVER B inerte" se afirma **del repo**, no de producción.
- **HUECO:** `hdr_conversion_mode` no tiene implementación verificable en este snapshot (sólo cadenas de settings en `vps/prisma/lib/ape_mesh.php:63`, `vps/prisma/api/ape-feedforward-stream.php:114`, `vps/prisma/api/phase_g_delta_hook.php:28`).
- **HUECO:** no hay emisor de `VIDEO-RANGE=HLG` propio (sólo el passthrough del resolver si el probe lo trae).

## S4 · Disensos
- **D-S4-1 — Decisión del propietario (no se re-debate):** el LOCK `VIDEO-RANGE=PQ` incondicional se **mantiene**. Lo que este council señala no es la decisión, sino que su **justificación publicada** (SDR→HDR vía `hdr_conversion_mode`) es falsa desde 2026-06-17 y sigue viva en `ape_mesh.php:57-63`, y que `truth_guards.md:47-49` aún la contradice.
- **D-S4-2 — Mentira técnica (sí se señala):** llamar "SDR→HDR" a `hdr_conversion_mode=1` es falso; `1` es PASSTHROUGH. Sostenerlo no es una decisión de producto, es un error de hecho.
- **D-S4-3 — Capas:** considero **más correcta** la regla del VPS (`ape-match.php:189-190`) que la del generador, pero la doctrina vigente manda lo contrario ⇒ lo reporto como inconsistencia, no como bug del VPS.
- **D-S4-4 — LEVER B:** `CHINA_BOX_FAKE_4K=true` está declarado como "ORDEN EXPLÍCITA del propietario — override de LEVER B" (`combined_body_filter.lua:328-335`). Si la orden es real, la que está mal es CLAUDE.md (dice que el guard está activo). Ninguna de las dos fuentes cita el acta ⇒ **disenso abierto**, no violación.

## S4 · Tareas propuestas
| ID | Tarea | Evidencia |
|---|---|---|
| S4-T1 | Corregir comentario y contrato de `ape_mesh_device_settings()`: `1`=PASSTHROUGH (no SYSTEM, no SDR→HDR); citar AI-PQ como lever real | `vps/prisma/lib/ape_mesh.php:57-64` |
| S4-T2 | Actualizar `truth_guards.md` §HDR al LOCK 2026-06-16 + corrección 2026-06-17 (hoy dice lo contrario) | `truth_guards.md:45-53` |
| S4-T3 | Registrar por escrito el estado de `CHINA_BOX_FAKE_4K`; si sigue `true`, corregir CLAUDE.md §LEVER B; si no, ponerlo `false` | `combined_body_filter.lua:335` vs CLAUDE.md |
| S4-T4 | Propagar `channelId` al truth (F0–F5) o borrar la rama `APE_HDCP_PROFILE`/TYPE-1 muerta | `ape-fallback-resolver.js:594-597` |
| S4-T5 | Unificar la regla `VIDEO-RANGE` entre generador (PQ) y VPS prisma (evidencia) con un flag único auditable | `ape-fallback-resolver.js:563-566` vs `ape-match.php:189-190` |
| S4-T6 | Separar Main12 de DV en `quality_realtime.lua` (Main12 ≠ pipeline DV) | `quality_realtime.lua:121-122` |
| S4-T7 | Retirar o gatear el upgrader que declara DV+HDR10+HLG para todo canal | `m3u8-quality-upgrader-v2.js:255-265` |

---

## Totales por dimensión
| Dimensión | Hechos con archivo:línea | CONFORME | HALLAZGO/WARN | NO-RUN | Disensos | Tareas |
|---|---|---|---|---|---|---|
| **S3 codec/RFC 6381** | 34 | 15 | 12 | 5 | 3 | 8 |
| **S4 color/HDR** | 24 | 8 | 11 | 4 | 4 | 7 |
| **Total** | **58** | **23** | **23** | **9** | **7** | **15** |

**Ningún PASS global.** S3 = WARN · S4 = WARN con 1 mentira técnica viva (`ape_mesh.php:57-63`). Todo juicio es estático sobre el snapshot; cero mediciones de decoder, panel o bitstream.
