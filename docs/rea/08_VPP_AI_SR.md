# 08 — Base científica y límites de AI-SR / AI-PQ / MEMC por SoC (VPP real)

**Ciclo:** REA · entregable 08 · **investigación científica** (sin tocar código, listas, VPS ni `_vps_stage/**`; solo lectura).
**Fecha:** 2026-10-28. **Entregable escrito:** solo en `docs/rea/`.
**Pregunta:** ¿qué realce 1080p→4K/8K es **real en el VPP del device** (AI-SR/AI-PQ por ARA/URL-2) y qué es vocabulario de marketing?

> **Veredicto:** el VPP puede **mejorar la percepción** (nitidez, ruido, contraste, movimiento, escalado) sobre el frame **ya decodificado**. No puede **recuperar detalle** que el bitstream no trae ni cambiar el **decode**. Por tanto «8K fake» solo es honesto como **upscale declarado y marcado**, y `RESOLUTION=8K` con nivel `L153` **sigue prohibido** (es el decoder, no el panel).

### Leyenda de evidencia

| Etiqueta | Significado |
|---|---|
| **MEDIDO** | Ejecutado en esta máquina (`ffmpeg 8.0.1-full_build`) o dato medido y registrado en el repo (`archivo:línea`). |
| **DOC** | Afirmado por la fuente citada (paper/página oficial/README), sin ejecución local. |
| **NV** | No verificado en esta sesión. |
| **NOT_RUN** | No medible aquí (requiere device/captura/instrumento). |

**Niveles:** `REAL` · `POSIBLE` · `FAKE-inerte` (etiqueta/flag sin efecto en píxeles).

---

## 1. Qué es y qué NO es (base científica)

| técnica | qué hace de verdad | qué NO hace | nivel | fuente |
|---|---|---|---|---|
| **SR por red (imagen)** — SwinIR / ESRGAN / Real-ESRGAN | restauran una imagen de baja calidad (downscale, ruido, compresión) a partir de **un modelo entrenado**; SwinIR cubre SR clásica, ligera y *real-world*, denoise y reducción de artefactos JPEG | **no reconstruye** la escena real: ESRGAN admite que los detalles son **"hallucinated details… accompanied with unpleasant artifacts"**; el resultado es *plausible*, no verdadero | REAL (como cómputo) · **no** como «recuperar el original» | [SwinIR (arXiv 2108.10257)](https://arxiv.org/abs/2108.10257) · [ESRGAN (arXiv 1809.00219)](https://arxiv.org/abs/1809.00219) · [Real-ESRGAN (arXiv 2107.10833)](https://arxiv.org/abs/2107.10833) |
| **MEMC / interpolación de frames** | estima flujo intermedio y **sintetiza frames** entre dos reales (RIFE: "flow-based VFI… arbitrary-timestep") | no crea resolución ni detalle espacial; puede inventar artefactos en oclusiones | REAL en hardware/GPU | [RIFE (arXiv 2011.06294)](https://arxiv.org/abs/2011.06294) · MEMC en el display engine del SoC: [Hi3751V900X](https://www.hisilicon.com/cn/products/smart-media/projector/Hi3751V900X) |
| **Denoise / sharpness (AI-PQ)** | filtra el frame decodificado (nlmeans, hqdn3d, unsharp, DNR del VPP) | no añade información; el sharpen amplifica lo que hay (incluido el ruido) | REAL | `ffmpeg` local (**MEDIDO**: filtros `nlmeans`, `unsharp`, `hqdn3d` disponibles) · `m3u8-typed-arrays-ultimate.js` HEAD:1006 |
| **Tone mapping** | reasigna rango/curva (PQ↔SDR) | no convierte una fuente SDR en HDR real | REAL (heurístico) | `01_CODEC_HDR_DV.md` §5 · `CLAUDE.md` §2026-06-17 |
| **«Reconstruir detalle perdido»** | — | **IMPOSIBLE**: la información descartada por el encoder no vuelve; solo se **alucina** o se **realza** lo presente | **FAKE** como promesa | [ESRGAN (arXiv 1809.00219)](https://arxiv.org/abs/1809.00219) · [SwinIR](https://arxiv.org/abs/2108.10257) |
| **«Mejorar la percepción»** | sí: nitidez, limpieza de banda/ruido, contraste local, movimiento fluido | no cambia `CODECS`, ni el nivel, ni el bitstream | **REAL/POSIBLE** | idem + §5 |

**Distinción operativa:** *percepción* = cómo se ve el mismo dato; *detalle* = dato que no existe. Todo el pipeline del device es lo primero.

---

## 2. Hardware concreto: qué SoC puede aplicar qué

| SoC / device | claves y ruta reales | qué SÍ aplica | qué NO aplica | nivel | fuente |
|---|---|---|---|---|---|
| **Amlogic S905X4** (ONN 4K, Android TV 12, HDMI **2.0b**) | `settings put system/global aisr_enable 1`, `aipq_enable 1`; broadcasts `com.droidlogic.tv.action.AISR_ENABLE` / `AIPQ_ENABLE`; vendor `libpqcontrol.so` (`SetAiSrEnable`, `SetAipqEnable`, `SetAipqMode`) | AI-SR + AI-PQ por settings/broadcast (upscale HW a nivel SoC) | 8K: el stack saca **4K por HDMI como máximo**; Deep Color verificado = **YCbCr 4:2:2 12-bit** (no 4:4:4) | REAL (AI-SR) · IMPOSIBLE (8K de salida) | `.agent/skills/adb_master_directives_rule/SKILL.md:10,21-22,26,53-58,100-101,122,128-129` · `m3u8-typed-arrays-ultimate.js` HEAD:10446 |
| **MediaTek MT8696** (Fire TV 4K Max) | levers `pq_ai_sr_enable`, `ai_sr_level`, `pq_sharpness_enable`, `pq_ai_dnr_enable`, `pq_dnr_enable`, `pq_nr_enable`, `aipq_enable`; **`ai_pq_mode` NO existe** en el SoC → el real es **`ai_pic_mode`** | AI-SR/AI-PQ por settings (perfil `max_image/sports/cinema/off`) | `ai_pq_mode` (nombre inexistente); **8K** (techo HDMI 4K) | REAL (settings) · FAKE (clave inventada) | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php:447-448,500-510,540` · `…/vps/prisma/cli/push_pq_profile.php:7,11,21-35` · `_vps_stage/tests/fake_ai_headers_assert.js:20-24` |
| **HiSilicon Hi3751V900X** (referencia) | display engine con **SR de vídeo/gráficos + MEMC**; NPU 4 TOPS | SR/MEMC en el SoC | en este repo **no hay ruta ARA/settings** para él → no explotable hoy | **NV** para el repo · DOC del SoC | [Hi3751V900X](https://www.hisilicon.com/cn/products/smart-media/projector/Hi3751V900X) · `06_HUAWEI_METADATA_8K.md` §4 |
| **VPS (3 cores, sin GPU)** | — | solo manda **settings/metadata** | píxeles (imposible sin hardware) | IMPOSIBLE | `04_FEASIBILITY_TRANSPORT.md` · `ape_mesh.php:500-501` |

**Headers «IA por marca» en `#EXTHTTP`:** los 12 nombres inventados del módulo `ai_super_resolution_engine.php` están **prohibidos** porque "ningún fabricante los define y el TV no está en esa conexión ⇒ **0 píxeles + ruido**" — gate `T40` (`_vps_stage/tests/fake_ai_headers_assert.js:6-10`). La **única ruta REAL** de AI-SR es on-device y está pinneada por sha256 (`:20-24`).

**Perfil P0-P5 aplicable por SoC (lo que el SoC puede honrar del perfil):**

| Perfil (bps diseño) | Amlogic S905X4 | MediaTek MT8696 | nota |
|---|---|---|---|
| P0 (25 Mbps) | AI-SR/AI-PQ + HDR10 → salida **4K** | AI-SR/AI-PQ → salida **4K** | ninguno de los dos saca 8K |
| P1/P2 (14 Mbps) | sí | sí | idem |
| P3 (5 Mbps) | sí | sí | idem |
| P4 (2 Mbps) | sí | sí | idem |
| P5 (1 Mbps) | sí (perfil seguro) | sí | válvula anti-pantalla-negro |

Fuente de bitrates por perfil: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js:5170-5175` (**MEDIDO** en repo).

---

## 3. Perfiles P0-P5: cada módulo de la imagen PRISMA v1.2, clasificado

| módulo (como se vende) | qué hay realmente en el repo | efecto esperado | requisito | riesgo pantalla negra | nivel | fuente |
|---|---|---|---|---|---|---|
| **CMAF** | plantillas + `#EXT-X-MAP` solo si la fuente lo trae | segmentación fMP4, ABR limpio | `EXT-X-MAP` + `.m4s`/`init.mp4` reales | declarar CMAF sin MAP → player falla | REAL con evidencia · FAKE sin ella | `truth_guards.md:55-58` · `01_CODEC_HDR_DV.md` |
| **LCEVC** | flags `lcevc: true`, `lcevc_state: 'ACTIVE_ENFORCED'`, `lcevc_phase4`; `lcevc_enabled` por perfil | mejora de detalle **si existe capa LCEVC** en el bitstream | capa LCEVC real + decoder que la soporte | declararlo sin capa = metadato inerte (y `lcev.1.1.1` está prohibido) | **FAKE-inerte** sin capa | `m3u8-typed-arrays-ultimate.js` HEAD:1008-1018,1023 · `ape-profiles-config-v5.js:156,262,364,466,567,664` · `truth_guards.md:52-53` |
| **HDR10+** | `cortex_fallback_hdr10plus:'ENFORCED_ALL_LEVELS'`, `X-Cortex-HDR-ToneMap: 'DYNAMIC-METADATA-HDR10+'` | tone mapping dinámico **si el bitstream trae SEI ST 2094-40** | metadata HDR10+ real | forzarlo sobre SDR/HDR10 estático = declaración falsa | **FAKE-inerte** sin SEI | `m3u8-typed-arrays-ultimate.js` HEAD:1024,1036 · `truth_guards.md:45-53` |
| **AI-SR** | settings on-device (ver §2); **no** hay tag que lo active | upscale HW del frame decodificado | SoC con SR + daemon/ARA que escriba settings | ninguno si el SoC lo soporta; en otro SoC, no-op | **REAL** on-device · **FAKE-inerte** como tag | `.agent/skills/adb_master_directives_rule/SKILL.md:53-58,100-101` · `fake_ai_headers_assert.js:6-10` |
| **Quantum Pixel** | `#EXT-X-APE-QUANTUM-PIXEL:ENABLED=true,DEPTH=12` + `"nits_target": 8000` | ninguno: es una etiqueta | un panel/bitstream de 12-bit real y 8000 nits (no existen en este stack) | bajo (tag inerte), pero **es mentira de producto** | **FAKE-inerte** | `m3u8-typed-arrays-ultimate.js` HEAD:8998 · `ape-profiles-config.js:344` |
| **12-bit 4:4:4** | en el mismo manifiesto: `CHROMA-PRECISION:4:2:0` y `LUMA-PRECISION:10BIT`; perfil con `color_depth: 10` | ninguno | bitstream 12-bit 4:4:4 real | contradicción interna detectable por auditoría | **FAKE-inerte** (autocontradictorio) | `m3u8-typed-arrays-ultimate.js` HEAD:8996-8998 · HEAD:1004 |
| **Fake 4K Upscaler** | path `declare_auto`/`virtual_4k` reescribe `RESOLUTION` (y a veces `CODECS` en Lua) | el **panel/SoC** escala; el manifiesto declara | marcador `#EXT-X-APE-UPSCALE` + nivel ≥ capacidad | si toca `CODECS` o el nivel no alcanza → **freeze/pantalla negra** | **POSIBLE** (declarado y marcado) · **FAKE** si se vende como píxeles | `DECISION_A_LOCKED.md:15-19` · `ERRATA_AU.md:30-37` · `06_HUAWEI_METADATA_8K.md` §3 |
| **VRR / G-Sync / FreeSync / HDMI 2.1** | `#EXT-X-APE-VRR:MIN=24,MAX=120`, `-GSYNC:true`, `-FREESYNC:true`, `-HDMI21:true` | ninguno | panel VRR + HDMI 2.1 (el stack es HDMI **2.0b**) | inerte, pero incompatible con la física declarada | **FAKE-inerte** | `m3u8-typed-arrays-ultimate.js` HEAD:8992-8995 · `.agent/skills/adb_master_directives_rule/SKILL.md:26` |
| **HYBRID_AV1_HEVC_AVC / ai_semantic_segmentation / vvc_virtual_boundaries / av1_cdef** | flags en `godTierCfg` | ninguno (no hay stream AV1/VVC ni segmentación semántica en el player) | streams/codecs que no están en el manifiesto | si se declarara VVC/AV1 en `CODECS=` → freeze | **FAKE-inerte** | `m3u8-typed-arrays-ultimate.js` HEAD:989,1012-1014 |
| **bwdif / hqdn3d / nlmeans / unsharp** (en `video_filter`) | llegan como opciones de player (EXTVLCOPT) | desentrelazado/denoise/sharpen **en VLC/MPV** | player que honre `video-filter` | ninguno (ignorado por ExoPlayer) | **POSIBLE** (solo VLC/MPV) | `m3u8-typed-arrays-ultimate.js` HEAD:1006 |

**Regla de venta:** un módulo es `REAL` solo si (a) hay bitstream o hardware que lo ejecute y (b) se puede medir. Todo lo demás es etiqueta.

---

## 4. Cómo se mide, y cómo no romper

| medición | qué mide | estado | fuente |
|---|---|---|---|
| **VMAF / SSIM / PSNR / XPSNR** con `ffmpeg` | diferencia objetivo-referencia entre dos vídeos | **MEDIDO disponible**: filtros `libvmaf`, `ssim`, `psnr`, `xpsnr`, `vmafmotion` presentes en `ffmpeg 8.0.1` local | `ffmpeg -filters` (esta sesión) · [Netflix/vmaf](https://github.com/Netflix/vmaf) |
| **Efecto del VPP del device** (AI-SR on-device) | comparar frame **antes/después del VPP**: requiere captura HDMI del device y alinear frames | **NOT_RUN**: no hay device conectado ni capturadora en esta sesión; sin eso cualquier cifra es inventada | — (método: `capture_uhd.mjs` mide manifiesto, **no** píxeles) |
| **«Resolución percibida»** | no es una métrica estándar; sólo proxies (MTF/edge-density sobre frames) | **NOT_RUN** | `01_CODEC_HDR_DV.md` §9 |

**Cómo no romper (reglas operativas, todas verificables):**

| regla | por qué | verificación |
|---|---|---|
| **Fallback a perfil seguro (P5)** si el device no responde | evita pantalla negra sin perder canal | `?profile=P5` documentado en `docs/manifestos/OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md:224` |
| **No forzar AI-SR en SoC no listado** | el setting es no-op o error; no hay píxeles | allowlist por SoC en `ape_mesh.php:500-510`; `ai_pq_mode` prohibido en MT8696 (`fake_ai_headers_assert.js:198-206`) |
| **No tocar el decode** (`CODECS`/nivel) para «mejorar» imagen | el VPP va **después** del decode; tocar el codec declarado = freeze | guard UHD-01 (blocker) `_vps_stage/edge/uhd/uhd_doctrine_guard.mjs:66` |
| **No declarar 12-bit/8000 nits/HDMI 2.1** si el stack no los tiene | mentira de producto y contradicción interna | §3 + `HEAD:8996-8998` vs `SKILL.md:26` |

---

## 5. Límite duro: el VPP no es el manifiesto

| afirmación | realidad | consecuencia | fuente |
|---|---|---|---|
| El VPP «mejora» la imagen | post-procesa el **frame ya decodificado** (escala/nitidez/ruido/movimiento) | puede subir la **percepción** de 1080p a «casi 4K»; **no** cambia el bitstream | `06_HUAWEI_METADATA_8K.md` §1 · [Hi3751V900X](https://www.hisilicon.com/cn/products/smart-media/projector/Hi3751V900X) |
| «8K fake» es del manifiesto | es **display-side**: lo produce el panel/VPP; el manifiesto solo lo **declara y marca** | sin marcador = mentira; con marcador = producto declarado | `DECISION_A_LOCKED.md:15-19` · `ERRATA_AU.md:37` |
| `RESOLUTION=7680x4320` + `CODECS="hvc1.2.4.L153.B0"` «porque el VPP lo sube a 8K» | **sigue prohibido**: el decoder negocia con el **nivel declarado** antes de que exista ningún VPP; L153 es techo 4K@60 | es el blocker **UHD-09** medido: `master_4k_hevc: 1 variante declara 8K con nivel insuficiente: #1 7680x4320@hvc1.2.4.L153.B0` | `truth_guards.md:24-43` · `uhd_doctrine_guard.mjs:74` · `_vps_stage/edge/uhd/runs/20261028T093154Z/predeploy_gates.md` (G3, 2026-10-28 09:33Z) |
| 8K legítimo | requiere `uhd8k=1` **y** ≥L183 en todas las variantes top, y `-REAL` solo si la fuente es ≥7680 | 8K sobre 4K = excepción **marcada**, nunca `-REAL` | `DECISION_A_LOCKED.md:15-19` · `ERRATA_AU.md:30-35` |
| El VPS puede hacer esto | no: no transporta vídeo y su CPU no da tiempo real (1080p→4K = 8-9 s/segmento) | el VPS **selecciona y comanda**; no píxeles | `01_CODEC_HDR_DV.md` §6 · `CLAUDE.md` §"Role visual VPS" |

---

## 6. Huecos y NOT_RUN

- **NOT_RUN:** efecto real del AI-SR/AI-PQ en el panel: no hay device ni capturadora conectada; `capture_uhd.mjs` mide **manifiesto**, no píxeles (`_vps_stage/edge/uhd/README.md:11`).
- **NOT_RUN:** VMAF/SSIM del VPP: disponible la herramienta (**MEDIDO**), no el par de vídeos de referencia.
- **NOT_RUN:** Amlogic S905X4: no hay ficha pública citada en el repo para el bloque SR (solo el SOP de directivas ADB y la ruta `libpqcontrol.so`).
- **NV:** HiSilicon V900X: SR/MEMC documentados por el fabricante, sin ruta ARA/settings en este repo.
- **NV:** «imagen APE PRISMA v1.2» del propietario **no está en el repo**: la clasificación de §3 se hace sobre los módulos que el código sí emite, no sobre la imagen.
- **HUECO:** no hay instrumento de nits/CLL/FALL ni de resolución percibida en el stack; `nits_target: 8000` no tiene medición que lo respalde.

## 7. Fuentes

1. https://arxiv.org/abs/2108.10257 — SwinIR (restauración: SR clásica/ligera/real-world, denoise, JPEG).
2. https://arxiv.org/abs/1809.00219 — ESRGAN ("hallucinated details… unpleasant artifacts").
3. https://arxiv.org/abs/2107.10833 — Real-ESRGAN (blind SR con datos sintéticos; **DOC**, abstract no re-leído en esta sesión).
4. https://arxiv.org/abs/2011.06294 — RIFE (VFI por flujo, tiempo real).
5. https://www.hisilicon.com/cn/products/smart-media/projector/Hi3751V900X — SR de vídeo/gráficos + MEMC en display engine; NPU 4 TOPS.
6. https://github.com/Netflix/vmaf — VMAF (métrica de percepción).
7. Repo (medido): `_vps_stage/tests/fake_ai_headers_assert.js:6-10,20-24,198-206` · `.agent/skills/adb_master_directives_rule/SKILL.md:10,21-22,26,53-58,100-101,122,128-129` · `m3u8-typed-arrays-ultimate.js` (HEAD) `:975-1027,1004,1006,8992-8998,10446` · `ape-profiles-config.js:344,5170-5175` · `ape-profiles-config-v5.js:156,262,364,466,567,664` · `vps/prisma/lib/ape_mesh.php:447-448,500-510,540` · `vps/prisma/cli/push_pq_profile.php:7,11,21-35` · `docs/manifestos/ape-vps-hevc-crystal-integrator/references/truth_guards.md:24-43,45-58` · `docs/rea/DECISION_A_LOCKED.md:15-19` · `docs/rea/ERRATA_AU.md:30-37` · `_vps_stage/edge/uhd/uhd_doctrine_guard.mjs:66,73-74` · `_vps_stage/edge/uhd/runs/20261028T093154Z/predeploy_gates.md` · `docs/manifestos/OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md:224`.
