# 06 — Huawei AI-SR / AI-PQ / MEMC: qué se puede con metadata pura y qué exige hardware

**Ciclo:** REA · entregable 06 · **investigación pura** (sin tocar código, listas, VPS ni `_vps_stage/**`; solo lectura).
**Fecha:** 2026-10-28. **Entregable escrito:** solo en `docs/rea/`.
**Pregunta del propietario:** ¿qué técnicas tipo Huawei (AI-SR/AI-PQ, super-resolution, MEMC, HDR enhancement) se pueden aplicar **solo con metadata** para exprimir la resolución percibida («Crystal Edge 8K fake») **sin freeze**?

> **Veredicto de una línea:** con metadata pura se puede **elegir la mejor variante real, describirla con verdad y hacer que el device active su VPP**; no se puede **crear** resolución. Todo lo que implique píxeles nuevos ocurre en el NPU/ISP del SoC, y ningún tag HLS lo alcanza.

### Cómo leer cada fila

| Etiqueta | Significado |
|---|---|
| **MEDIDO** | Ejecutado y registrado (captura/gate del repo, con `archivo:línea`), o dato de la página oficial leída en esta sesión. |
| **DOC** | Documentado por la fuente citada (URL), sin ejecución local. |
| **NV** | No verificado: la URL existe pero su cuerpo no fue recuperable (SPA) o no hay artefacto en el repo. |
| **NOT_RUN** | No medible en esta sesión (requiere VPS/device/instrumento). |

**Niveles:** `REAL` (funciona y está documentado/medido) · `POSIBLE` (viable con prerrequisitos) · `IMPOSIBLE` (no puede funcionar donde se pide) · `FAKE` (suena a técnica y no lo es).

---

## 1. Qué son de verdad (y dónde corren)

| técnica | qué es realmente | dónde corre | nivel | por qué NO se puede invocar desde un tag/atributo HLS | fuente |
|---|---|---|---|---|---|
| **AI-SR** (video super-resolution) | Red convolucional que procesa **frames ya decodificados**; el patente describe reutilizar bloques de P-frame (skip/merge/AMVP) para no repetir SR, y declara que el efecto "está positivamente correlacionado con profundidad y escala del modelo, **limitado por la capacidad de proceso y el consumo** de CPU/GPU/**NPU**" | **Extremo receptor**: decode → extracción de frame → módulo SR → salida a display | REAL en el device · **FAKE** como tag | el módulo SR consume **frames decodificados + información de coding blocks**; el manifest no está en esa ruta: ningún atributo HLS llega al NPU | [US11922599B2 (Huawei, "Video super-resolution processing method and apparatus")](https://patents.google.com/patent/US11922599B2/en) |
| **AI-PQ** (denoise/sharpness/contrast/HDR) | Post-proceso del **VPP** sobre el frame decodificado | Engine de display/ISP del SoC, gobernado por **settings del OS** | REAL en device (vía settings) | no hay atributo HLS que escriba settings del OS; requiere daemon/ARA que haga `settings put` | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php:447-448,500-510` · `…/vps/prisma/cli/push_pq_profile.php:7,21-35` |
| **MEMC** (interpolación de movimiento) | Genera frames intermedios en el **display engine** (no en el bitstream) | SoC display engine | REAL en hardware que lo tenga | el manifiesto declara `FRAME-RATE`; **no** activa MEMC | [Hi3751V900X](https://www.hisilicon.com/cn/products/smart-media/projector/Hi3751V900X): "8KP60/4K120/4K144/4K165/4K240 **MEMC处理**" |
| **HDR enhancement** | Gestión de rango/tono en display o en el VPP | display/TV o VPP | REAL (display) · **FAKE** si se afirma que el VPS lo hace | el tag sólo **declara** rango; no transforma píxeles | `CLAUDE.md` §"CORRECCIÓN TÉCNICA (2026-06-17)" (medido en Fire TV mt8696) |
| **Curso Huawei "AI 画质增强"** | material de formación | — | **NV** | — (HTTP 200, cuerpo no recuperable: SPA) | [curso C101638514979355002](https://developer.huawei.com/consumer/cn/training/course/introduction/C101638514979355002) |

**Dato duro del SoC de referencia** (Hi3751V900X, [página oficial](https://www.hisilicon.com/cn/products/smart-media/projector/Hi3751V900X)): NPU **4 TOPS@INT8** DaVinci; decode HEVC Main10 **L6.2 hasta 8K@120**; **encode HEVC/H.264 máximo 4K@60**; display engine con **SR de vídeo y gráficos** + MEMC + HDR (dynamic/HDR10/HLG/HDR Vivid).
⇒ **ni el SoC de referencia puede *codificar* 8K**: un "8K real" en el edge exige GPU/encoder que no existe (ver `04_FEASIBILITY_TRANSPORT.md`).

---

## 2. Lo que SÍ se puede hacer con metadata pura

| # | Lever (metadata) | efecto esperado | límite honesto | riesgo de freeze | fuente |
|---|---|---|---|---|---|
| 1 | **Declarar la mejor variante REAL** del master | el player negocia la variante superior que ya existe | si el proveedor no la sirve, no existe | declarar codec sin evidencia → init de decoder equivocado (FZ-01) | `ape-fallback-resolver.js:193-194` (F0 real) vs `:238` (F1 con default) |
| 2 | **`RESOLUTION`/`FRAME-RATE` coherentes con el tier** | ABR y decoder eligen bien | declarar de más no crea píxeles | nivel insuficiente para la resolución declarada = freeze 2026-06-08 | `m3u8-typed-arrays-ultimate.js` HEAD: guard `reqLevel` (WT) · `_vps_stage/edge/uhd/uhd_doctrine_guard.mjs:73-74` (UHD-08/09) |
| 3 | **`BANDWIDTH`/`AVERAGE-BANDWIDTH` honestos** | estimador ABR estable | inflarlos no da calidad: descoloca el ABR | sobre-declarar empuja variantes que caen por throughput | `ape-fallback-resolver.js:548-549` |
| 4 | **`VIDEO-RANGE` (+CICP) como hint de display** | el TV/player entra en modo HDR si puede | **no** convierte SDR en HDR (`hdr_conversion_mode` = PASSTHROUGH) | sobre SDR sin daemon: color shift (no freeze) | `ape-fallback-resolver.js:563-577` · `CLAUDE.md` §2026-06-17 |
| 5 | **Marcador `#EXT-X-APE-UPSCALE`** | trazabilidad: distingue producto de mentira | no cambia lo que se decodifica | ninguno (tag ignorado por players) | `m3u8-typed-arrays-ultimate.js` HEAD:10453,10455 |
| 6 | **`STABLE-VARIANT-ID`** | evita yoyo de ABR entre recargas | no mejora imagen | ninguno | `ape-fallback-resolver.js:602-609` |
| 7 | **LL-HLS (`EXT-X-PART-INF`/`SERVER-CONTROL`)** | menos latencia, arranque más fino | no sube resolución | player sin LL-HLS: degrada o ignora | `m3u8-typed-arrays-ultimate.js` HEAD:3005-3006 |
| 8 | **Hints de prioridad ABR (`SCORE`, `PATHWAY-ID`)** | ordena preferencia de variante / CDN | atributos de HLS 2ª edición: player que no los soporta los ignora | ninguno (ignorar ≠ romper) | `frontend/export-module.js:270-275` |

**Regla:** ninguno de los 7 levers toca el bitstream. Todos cambian **lo que el device intenta**; ninguno **produce** píxeles.

---

## 3. «8K fake» honesto (doctrina A LOCKED)

| Pieza | Qué dice la doctrina vigente | fuente |
|---|---|---|
| Regla | `can_declare_8k = (uhd8k=1) AND (nivel HEVC ≥ L183 en **todas** las variantes top)` | `docs/rea/DECISION_A_LOCKED.md:15` |
| Excepción de producto | fuente **≥3840** se conserva y puede declararse 8K **como excepción declarada** | `…:16` |
| Trazabilidad obligatoria | `#EXT-X-APE-UPSCALE:…;src=<real>;declared=7680;can8k=1` | `…:17` · matriz de 6 casos en `docs/rea/ERRATA_AU.md:30-35` |
| Nunca | etiquetar `-REAL` una variante upscaleada | `…:18` |
| Intocable | `CODECS=` (GOLDEN RULE); 8K con nivel <L183 = **blocker** | `…:19` |

**Qué significa «fake» sin mentir:** no es "8K inventado en el servidor"; es **upscale declarado**: el bitstream sigue siendo el real, el escalado lo hace el dispositivo, y el manifiesto lo **marca**. La frontera entre producto y mentira es el marcador (`ERRATA_AU.md:37`).

**Cómo se mide (arnés existente, read-only sobre el VPS):**

| Instrumento | Qué produce | fuente |
|---|---|---|
| `capture_uhd.mjs` | 4 parejas **fuente → servido**, hashes, flags y matriz del módulo con `lua5.1`; "No escribe NADA en el VPS" | `_vps_stage/edge/uhd/README.md:11,23` |
| `uhd_doctrine_guard.mjs` | 12 checks con exit code; `--selftest` con 8 casos | `…/uhd_doctrine_guard.mjs:66-77`; `README.md:25-28` |

**Estado medido hoy (no interpretado):** guard **FAIL** `blocker=1 high=2 info=1`; blocker **UHD-09**: `master_4k_hevc: 1 variante declara 8K con nivel insuficiente: #1 7680x4320@hvc1.2.4.L153.B0` (`_vps_stage/edge/uhd/runs/20261028T093154Z/predeploy_gates.md`, gate G3, 2026-10-28 09:33Z) — y el cierre quedó **BLOCKED** (`runs/20261028T094500Z_blocked/postdeploy_gates.md`). Traducción: **hoy producción sirve 8K declarado con L153**, exactamente el caso que la Ley Cardinal 1 prohíbe; el arreglo es metadata (subir a L183) pero requiere ventana de deploy.

---

## 4. Disparo del VPP del device (settings AI-SR/AI-PQ)

| Pieza | Estado | Detalle | fuente |
|---|---|---|---|
| Perfiles PQ | REAL (código existe) | `max_image` (default) / `sports` / `cinema` / `off`; levers bare-key `pq_ai_sr_enable`, `ai_sr_level`, `pq_sharpness_enable`, `pq_ai_dnr_enable`, `aipq_enable` | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/cli/push_pq_profile.php:7,11,21-35` |
| Allowlist + mapeo por SoC | REAL (documentado en código) | el ARA mapea namespace y **allowlistea**; `ai_pq_mode` **no existe** en MT8696 → el real es `ai_pic_mode`; se emiten ambos | `…/vps/prisma/lib/ape_mesh.php:500-510,540` |
| Device objetivo | REAL (medido en repo) | Fire TV **mt8696** (MediaTek): AI-SR/AI-PQ por settings | `ape_mesh.php:540` · `CLAUDE.md` §2026-06-17 |
| HiSilicon (V900X) | **NV** para este repo | el SoC **tiene** SR+MEMC en su display engine (DOC), pero **no hay ruta ARA/settings implementada** para él aquí | [Hi3751V900X](https://www.hisilicon.com/cn/products/smart-media/projector/Hi3751V900X) |
| Sin hardware | **IMPOSIBLE** | sin NPU/ISP no hay píxeles: el VPS (3 cores, sin GPU) sólo puede mandar settings | `04_FEASIBILITY_TRANSPORT.md` · `ape_mesh.php:500-501` ("NO transcode; settings put = post-proceso VPP") |
| Player nativo sin daemon | **IMPOSIBLE** | los settings los aplica el daemon/ARA en el device; el player solo recibe el manifest | `CLAUDE.md` §"Role visual VPS" |

---

## 5. Freeze-first: reglas que no se pueden violar (y cómo se verifican)

| Regla | Por qué | Cómo se verifica (comando/artefacto) |
|---|---|---|
| **Ley Cardinal 1** — nivel ≥ resolución declarada | nivel corto = variante que el decoder rechaza = freeze 2026-06-08 | `uhd_doctrine_guard.mjs` UHD-08/UHD-09 (**blocker**) — hoy UHD-09 en FAIL |
| **GOLDEN RULE** — `hvc1.*` solo en `CODECS=`; `hev1.*` solo en KODIPROP/EXTVLCOPT | cruzar rompe Apple/Tizen/webOS o ExoPlayer ISA | `truth_guards.md:14` · guard UHD-01/UHD-02 (**blocker**) |
| **No declarar codec no decodificable** | medido: `hvc1`/`dvh1` sobre AVC nativo = pantallazo negro (revertido) | `docs/manifestos/OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md:232` · guard UHD-01 |
| **No inflar `BANDWIDTH`** | el ABR compara throughput real vs declarado; inflarlo descoloca la selección | `ape-fallback-resolver.js:548-549` + [RFC 8216 §4.4.6.2](https://www.rfc-editor.org/rfc/rfc8216) |
| **No reempaquetar vídeo en el VPS** | el VPS no transporta vídeo (`\.ts|\.m4s|\.mp4$ → 404`) | guard UHD-06/UHD-07 (**blocker**) |
| **8K solo desde fuente ≥4K y marcado** | 8K sobre 1080p sin marca = mentira al player | guard UHD-03 (**blocker**) + UHD-04 (marca única) + UHD-10/11 (latentes) |
| **PQ una sola vez, sin inventar** | duplicar/inventar rango confunde al display | guard UHD-05/UHD-12 |

`--selftest` del guard = **PASS 8/8** (`predeploy_gates.md`, gate G4): los 12 checks están probados contra 7 sabotajes + control negativo.

---

## 6. Lista negra (suena bien en un foro, produce freeze o mentira)

| Propuesta | Por qué NO |
|---|---|
| "Declarar 8K y 60 fps para que el TV escale" **sin** `uhd8k`/L183/marcador | es el blocker UHD-09 medido hoy en producción; sin marca es mentira, sin L183 es freeze |
| "Inundar `CODECS` con DV/HDR para que el player elija" | viola GOLDEN RULE y declara decode imposible; `SUPPLEMENTAL-CODECS` inventado está prohibido |
| "`BANDWIDTH=80000000` para forzar la variante top" | no da calidad; rompe el ABR (y UHD-06/07 vigilan el manifiesto) |
| "Activar AI-SR con un tag `#EXT-X-...`" | el módulo SR vive en el receptor y consume frames decodificados (patente); no hay atributo HLS que lo alcance |
| "`hdr_conversion_mode=1` hace SDR→HDR" | **FALSO** medido: `1`=PASSTHROUGH, SDR queda SDR (`CLAUDE.md` §2026-06-17) |
| "Upscale 4K por software en el VPS" | 1080p→4K = 8-9 s/segmento > timeout → passthrough (`01_CODEC_HDR_DV.md` §6) |
| "`EXT-X-PART` sin partes reales para parecer LL-HLS" | el player pide las partes y falla; UHD-06 lo bloquea |
| "8K con encode en el edge" | el SoC de referencia codifica **máx 4K@60**; el edge no tiene GPU |

---

## 7. Huecos y NOT_RUN de este entregable

- **NOT_RUN:** no se ejecutó `capture_uhd.mjs` ni el guard (requieren SSH al VPS y hay deploy en curso/BLOCKED). Se citan las capturas **ya registradas** en `runs/`.
- **NOT_RUN:** no hay device HiSilicon ni Fire TV conectado en esta sesión ⇒ AI-SR/AI-PQ/MEMC reales **no medidos**; sólo documentados.
- **NV:** curso Huawei (SPA sin cuerpo) y patente en el portal `unifiedpatents` (SPA); el texto de la patente se leyó en el espejo Google Patents del **mismo** número.
- **NV:** no existe en el repo ruta ARA/settings para HiSilicon; decir "soportado en HiSilicon" es DOC del SoC, no implementación.
- **NOT_RUN:** resolución **percibida** no medida (no hay instrumento ni frames de muestra en esta tarea); cualquier cifra de "8K percibido" sería inventada.
- **HUECO:** `ape_virtual_4k.lua` (VPS) y `_vps_stage/lua/ape_uhd.lua` tienen estrategias opuestas; este documento fija doctrina, no resuelve el despliegue (ver `05_PLAYER_COMPAT.md`).

## 8. Fuentes

1. https://patents.google.com/patent/US11922599B2/en — patente Huawei "Video super-resolution processing method and apparatus" (texto leído).
2. https://portal.unifiedpatents.com/patents/patent/US-11922599-B2 — **NV** (SPA).
3. https://www.hisilicon.com/cn/products/smart-media/projector/Hi3751V900X — SoC Hi3751V900X (especificaciones leídas).
4. https://developer.huawei.com/consumer/cn/training/course/introduction/C101638514979355002 — **NV** (SPA).
5. https://www.rfc-editor.org/rfc/rfc8216 — atributos `EXT-X-STREAM-INF` (BANDWIDTH/AVERAGE-BANDWIDTH).
6. Repo (medido, no URL): `docs/rea/DECISION_A_LOCKED.md:15-19` · `docs/rea/ERRATA_AU.md:30-37` · `_vps_stage/edge/uhd/README.md:11,23,34-39` · `_vps_stage/edge/uhd/uhd_doctrine_guard.mjs:66-77` · `…/runs/20261028T093154Z/predeploy_gates.md` (G3/G4/G6) · `…/runs/20261028T094500Z_blocked/postdeploy_gates.md` · `ape-fallback-resolver.js:193-194,238,548-549,563-577,602-609` · `m3u8-typed-arrays-ultimate.js` (HEAD) `:3005-3006,10453,10455` · `vps/prisma/cli/push_pq_profile.php:7,11,21-35` · `vps/prisma/lib/ape_mesh.php:447-448,500-510,540` · `docs/manifestos/ape-vps-hevc-crystal-integrator/references/truth_guards.md:14,24-43`.
