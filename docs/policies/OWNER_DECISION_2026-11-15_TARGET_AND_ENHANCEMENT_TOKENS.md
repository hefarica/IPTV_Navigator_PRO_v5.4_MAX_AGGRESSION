# OWNER DECISION — 2026-11-15 · DECLARACIÓN DE OBJETIVO (RESOLUTION) Y TOKENS DE MEJORA

**Estado:** `binding` · **Autoridad:** el propietario del sistema, instrucción explícita en sesión («Esto sí se permite, grábamelo»), 2026-11-15 ~20:23 −05:00.
**Alcance:** deroga dos cláusulas concretas de dos contratos `status: mandatory`. **No** deroga nada más.
**Motivo:** el mandato del 2026-11-15 ya escrito en `rea-export-finalizer.js:264-278` («el objetivo manda, no la fuente») y `contracts/crystal_6k_enhancement_contract.json` (`rea_device_4k_target: 5760x3240`) son **posteriores** a las cláusulas derogadas; los contratos quedaron atrás, no el artefacto.

---

## 1 · Lo que SÍ está permitido (queda grabado)

### P-1 · `RESOLUTION` puede declarar el OBJETIVO en todo el catálogo

`#EXT-X-STREAM-INF:RESOLUTION=5760x3240` está **permitido** en los 21.224 canales **aunque la fuente medida sea menor** (rango medido: 360–2160 px). Es la declaración del **objetivo de display del device REA** (5760×3240), no una afirmación sobre el bitstream.

**Condición de honestidad que se mantiene:** el objetivo debe viajar **acompañado de la fuente** en los tags de verdad, que ya existen:
`#EXT-X-APE-STREAM-TRUTH:src=,w=,h=,fps=,range=,codec=` · `#EXT-X-APE-UPSCALE:TARGET=5760x3240;SOURCE=…;MULTIPLIER=x…;TECH=…;MODE=EMULATED;EXECUTOR=display;EXECUTED=0`.
Declarar el objetivo sin declarar la fuente seguiría siendo una mentira; declarar ambos es la doctrina vigente.

### P-2 · Los tokens de mejora están permitidos como metadata DECLARADA

Permitidos en la lista: **`LCEVC`, `AI-SR`, `AI-FI`, `DV-PROFILE`, `QUANTUM-PIXEL`, `4KFALSE`, `8KFAKE`** (más los que ya emite el generador: `#EXT-X-APE-LCEVC-PHASE`, `#EXT-X-APE-AI-SR`, `#EXT-X-APE-DOLBY-VISION`, `#EXT-X-APE-QUANTUM-PIXEL`, `#EXT-X-APE-HDR10-PLUS`, `#EXT-X-APE-MINTERPOLATE`, `#EXT-X-APE-ENHANCE-STATE`).

**Condición de honestidad que se mantiene:** se declaran como **declarado**, no como ejecutado. Los truth-guards (`STATUS=DECLARED_ONLY`, `EXECUTED=0`, `EXECUTION=engine_dependent`, `RPU=DECLARED`) deben seguir presentes en cada uno.

### P-3 · La simulación UHD es **OBLIGATORIA** (aclaración del propietario, 2026-11-15)

No es una tolerancia: **es lo que se debe hacer**. Todo canal debe declarar un **objetivo UHD simulado de alta calidad** (3840×2160 · 5760×3240 · 6144×3456 · 7680×4320), con su cadena técnica declarada y el ejecutor de display.

**Lo prohibido no es simular: es afirmar que la FUENTE ya es ese UHD.** La distinción operativa es una sola línea:

| Se permite (y se exige) | Se prohíbe |
|---|---|
| `#EXT-X-APE-UPSCALE:TARGET=5760x3240;SOURCE=1920x1080;MULTIPLIER=x3.00;TECH=lanczos+unsharp;MODE=SIMULATED;EXECUTOR=display;EXECUTED=0` | `RESOLUTION`/`STREAM-TRUTH` afirmando que la **fuente** es 5760×3240 |
| Declarar `LCEVC`, `AI-SR`, `AI-FI`, `DV-PROFILE`, `QUANTUM-PIXEL` como metadata declarada | Declarar cualquiera de ellos como `applied` sin recibo del motor |
| Simular subiendo (upscale/enhancement) | Simular **bajando** bitrate, fps, HDR, canales de audio o resolución |
| `4KFALSE`/`8KFAKE` como **tags** de estado (`MODE=SIMULATED`) | `4KFALSE`/`8KFAKE` como **claim** de fuente real |

**Calidad mínima de la simulación ("de alta calidad"):** cadena `TECH` declarada (lanczos / NGU / ESRGAN / unsharp / minterpolate) + `EXECUTOR=display`, sin recorte de bitrate, fps, HDR ni audio. Una simulación sin cadena declarada no cumple.

### P-4 · OBJETIVO DE LA APP: **4K FAKE · 6K SIMULATE · 8K FAKE**

Declaración del propietario, 2026-11-15. La aplicación existe para **simular resoluciones UHD de alta calidad**. Tres niveles, con el **tag real que el generador ya emite** (verificado en `m3u8-typed-arrays-ultimate.js`):

| Tier | Tag real (no inventado) | Objetivo | Nivel de códec exigible | ¿Va en `RESOLUTION`? |
|---|---|---|---|---|
| **4K FAKE** | `#EXT-X-APE-4KFALSE-MODE:ACTIVE` + `#EXT-X-APE-4KFALSE-TARGET-RES:3840x2160` + `#EXT-X-APE-4KFALSE-ENGINE:<cadena>` (`:10540-10543`, `:9501`) | **3840×2160** | el que sostenga 4K a su fps (≥ `L153` a 60) | **sí** |
| **6K SIMULATE** | `#EXT-X-APE-CRYSTAL-6K:…;RES=5760x3240;PIXELS=18662400;CODEC=hvc1.2.4.L183.B0` + `-MODE:EMULATED` + `-TRUTH:DECLARED_ENHANCEMENT;NOT_SOURCE` (`:9621-9633`), más `#EXT-X-APE-UPSCALE:…MODE=SIMULATED` | **5760×3240** | **`hvc1.2.4.L183.B0` (Level 6.1)** — ya es lo que el generador declara para este objetivo | **sí, con L183** |
| **8K FAKE** | `#EXT-X-APE-8KFAKE:ENABLED=1;NEVER_REAL=1;TARGET=DISPLAY` (`:9511`) | **7680×4320** | n/a: es **display-side** | **NO** por defecto (`:9509`: «NO se pone 7680x4320 salvo flag») |

**Lectura operativa, sin ambigüedad:**
- **4K FAKE** y **6K SIMULATE** son **declarables en el manifiesto** (el player los ve como resolución objetivo) y deben además declarar su fuente real y su cadena técnica.
- **8K FAKE** es **solo display**: `NEVER_REAL=1`. No se pone 7680×4320 en `RESOLUTION` porque el decoder del device no lo sostiene; el objetivo 8K vive como intención de display, no como variante declarada.
- **La calidad es requisito, no adorno**: cada tier lleva `ENGINE`/`TECH` + `EXECUTOR=display` + `EXECUTED=0`. Sin cadena declarada, el tier no cumple.

> **Consecuencia técnica ya identificada (no nueva, ahora es inequívoca):** para el tier **6K SIMULATE**, `RESOLUTION=5760x3240` exige `CODECS` con **`L183`**. El generador lo declara así en su tag `CRYSTAL-6K`; el finalizador `rea-export-finalizer.js:300/303` sigue sellando `hvc1.2.4.L123.B0` (**Level 4.1**) en el `STREAM-INF`. Eso no es doctrina: es el `CODECS` del manifiesto contradiciendo el nivel exigible del tier. Fix: alinear el finalizador con `L183` cuando el target sea 5760×3240.

### P-5 · Escalera de simulación con **fallback al 4K simulado** (decisión del propietario, 2026-11-15)

**Decisión A:** el catálogo se declara **`5760×3240` + `hvc1.2.4.L183.B0`** en todos los canales. El tier 6K se declara de verdad.

**Y la regla de búsqueda:** la app **busca SIEMPRE el tier más alto sostenible**, lo declara como **simulado**, y **cae al 4K simulado** si el superior no se sostiene.

| Orden | Tier | Objetivo | ¿Se declara en el manifiesto? |
|---:|---|---|---|
| 1 | **8K FAKE** | 7680×4320 | **no** — solo `TARGET=DISPLAY` (`NEVER_REAL=1`) |
| 2 | **6K SIMULATE** | 5760×3240 | **sí** — `RESOLUTION` + `L183` |
| 3 | **4K FAKE** | 3840×2160 | **sí** — es el **suelo de fallback** |

**Regla de fallback (dura):** si el decoder rechaza el nivel, si el bitrate no alcanza o si el tier no es declarable, se baja **al 4K simulado (3840×2160)**. **Nunca por debajo del 4K simulado**: caer a FHD/HD/SD por un fallo es degradación y está prohibido por la ley anti-degradación (excepción escrita del propietario, con `channel_id, device_id, degradación, motivo, fecha`).

**Nivel tras el parche (medido invocando el finalizador real):** `5760×3240@60 → hvc1.2.4.L183.B0` (6.1). `L186` (6.2) solo si un canal declarara 120 fps — hoy no hay ninguno.

### P-6 · CMAF declarado: **PERMITIDO** · `#EXT-X-MAP` **no va en un catálogo**

Decisión del propietario, 2026-11-15 («decláralo»). Queda grabado:

- **Declarar la familia CMAF es válido** como metadata, igual que los demás tokens de mejora.
- **`#EXT-X-MAP` NO se añade a un catálogo de canales.** No es una declaración: es una **instrucción** (RFC 8216 §4.3.2.5) con una URI que el player **debe descargar antes del primer segmento**. En un catálogo (`#EXTINF` + URL por canal, sin segmentos) no hay init que descargar: añadirlo crea un 404, no resuelve nada. Su sitio es la **media playlist** del canal, no la lista.
- **Lo que sigue prohibido** es afirmar que el init existe sin que exista: `INIT=true` en un tag de validación sin `#EXT-X-MAP` real en la media playlist.

**El defecto real medido en el fichero (no la ausencia de MAP) es la incoherencia entre tags del mismo canal:**

| Tag | Dice | Contradice a |
|---|---|---|
| `#EXT-X-CMAF-CONTAINER:mpegts` | TS | `#EXTATTRFROMURL:X-APE-CMAF=fmp4` y `#EXT-X-APE-CONTAINER-PREFERRED:fmp4-cmaf` |
| `#EXT-X-APE-CONTAINER:unknown` + `-CONTAINER-VERIFIED:false` | no medido | los dos anteriores, que afirman contenedor |
| `#EXT-X-APE-SPACE-VALIDATOR-CMAF:FMP4=true,INIT=true` | init **presente** | no hay `#EXT-X-MAP` en ningún sitio |
| `#EXT-X-CMAF:…RESOLUTION=1920x1080` | 1080p | `#EXT-X-STREAM-INF:RESOLUTION=5760x3240` |

**Y el device zanja cuál es el contenedor real:** el segmento sirve `0x47` (MPEG-TS) y el decoder reporta 1080p30. El único tag que acierta es `CONTAINER:mpegts`; `fmp4-cmaf` es aspiración, no medición.

**Fix (coherencia, no retirada):** un solo contenedor declarado por canal; `VERIFIED=false` mientras no se mida; `INIT=true` retirado; y el CMaf como **metadata declarada** con `MODE=DECLARED`.

---

## 2 · Cláusulas derogadas (exactamente dos)

| Contrato | Cláusula | Efecto |
|---|---|---|
| `contracts/crystal_4k_enhancement_contract.json` | `forbidden: "declare_fake_source_resolution"` | **No aplica** a una declaración de **objetivo** (P-1). Sigue aplicando a afirmar que la **fuente** tiene esa resolución. |
| `contracts/streaming_continuity_contract.json` | `forbidden_tokens: [4KFALSE, 8KFAKE, LCEVC, AI-SR, AI-FI, DV-PROFILE, QUANTUM-PIXEL]` | **Sin efecto**: esos 7 tokens están permitidos como metadata declarada (P-2). |

---

## 3 · Lo que esta decisión NO autoriza (frontera, y es dura)

- **B-1 · Degradar sigue prohibido**: 4K→FHD/HD, HEVC→H264, HDR→SDR, bajar fps, bajar bitrate, quitar canales de audio, sustituir 4K por FHD, y `downscale_4k_to_fhd` (esto último **también lo exige el gate**, ver §4).
- **B-2 · El nivel de `CODECS` debe poder representar la `RESOLUTION` declarada.** Con `RESOLUTION=5760x3240@60`, `hvc1.2.4.L123.B0` (**Level 4.1**) queda **8,38× por encima** de `MaxLumaPs` (2.228.224) y `MaxLumaSr` (133.693.056); el nivel que sí la representa es **L183 (6.1)**, que el propio generador escribe para ese objetivo en `m3u8-typed-arrays-ultimate.js:9622`. Esto es **decodabilidad**, no honestidad: un decoder que honre `CODECS` rechazará o degradará. **No cubierto por esta decisión.**
- **B-3 · Sigue prohibido** `SUPPLEMENTAL-CODECS` inventado, `#EXT-X-MAP`/`#EXT-X-PART` sin init fMP4 o partes reales, y CMAF declarado sin init.
- **B-4 · ACEPTADO (decisión del propietario, 2026-11-15).** Declarar `hvc1` en `CODECS` sobre canales cuya `ape-codec-family` es `h264` **no rompe la reproducción** y queda **aceptado**. Era el hallazgo **A-02**, retirado: el player selecciona por el códec declarado y el decoder resuelve el bitstream real. **No se vuelve a reportar como defecto ni como "mentira".**
- **B-5 · Sigue prohibido** afirmar `applied`/`verified` sin recibo del motor.

---

## 4 · Efecto medido sobre los gates (no rompe CI)

| Gate | Qué hace de verdad | ¿Lo rompe esta decisión? |
|---|---|---|
| `tools/check_crystal_4k_law.js` (15 líneas) | Lee la ley + el contrato + `AGENTS.md` y exige **5 cadenas**; **no escanea ninguna lista**. Su línea 12 exige `c.forbidden.includes('downscale_4k_to_fhd')` | **No.** Al enmendar el `forbidden` hay que **conservar `downscale_4k_to_fhd`** o ese check falla. |
| `tools/check_streaming_continuity.js` (78 líneas) | Sondea HTTP: `/jit/playlist.m3u8`, `/jit/live/3/master.m3u8`, `media_0`, y un `HEAD` a `/lists/…`. **No lee `forbidden_tokens`** | **No.** La lista de tokens es **declarativa y no tiene gate**. |
| `tools/check_crystal_6k_law.js` · `check_anti_degradation_policy.js` | No tocan tokens ni `RESOLUTION` | **No.** |

⇒ **La decisión del propietario no rompe ningún gate.** Lo que hay es **texto de contrato atrasado** respecto al mandato del 2026-11-15.

---

## 5 · Pendiente (propuesta, NO aplicada)

1. Enmendar `contracts/crystal_4k_enhancement_contract.json`: retirar `declare_fake_source_resolution` (o reescribirlo como «prohibido declarar como **fuente**») **conservando** `downscale_4k_to_fhd`, `replace_4k_with_fhd`, `declare_fhd_as_4k_source`, `bitrate_video_reduction`.
2. Enmendar `contracts/streaming_continuity_contract.json`: mover los 7 tokens a un campo nuevo `declared_allowed_tokens` con `authority: owner-decision-2026-11-15`, dejando `forbidden_tokens` solo con lo que siga prohibido.
3. Anotar `docs/policies/CRYSTAL_4K_ENHANCEMENT_LAW.md` y `docs/policies/STREAMING_CONTINUITY_LAW.md` con un puntero a este documento.
4. **No** tocar los gates: ya son compatibles.

---

## 6 · Hallazgos previos que esta decisión deja SUPERSEDED

| Artefacto | Hallazgo | Estado |
|---|---|---|
| `artifacts/INGESTA_WORKSPACE.md` §11 y §16 | «`declare_fake_source_resolution` violado» y «`forbidden_tokens` violados» | **SUPERSEDED** por este documento. El resto de §11–§16 sigue vigente. |
| `artifacts/AUDITORIA_LISTA_1794783650337.md` (A-01, encuadre) | «declaración falsa de resolución fuente» | **SUPERSEDED** en ese encuadre. **Sigue vigente** la incoherencia `L123` ↔ `5760x3240@60` (§3 B-2). |
| `artifacts/AUDITORIA_LISTA_1794783650337.md` (A-02) | «`hvc1` sobre 20.056 canales `h264`» | **RETIRADO el 2026-11-15 por decisión del propietario: no rompe la reproducción y queda aceptado** (§3 B-4). No se vuelve a reportar. |

**Regla para sesiones futuras:** estos dos puntos **no se vuelven a reportar como violación de contrato**. Se reportan, si acaso, como **coherencia técnica** (B-2) o como **falta de truth-guard** (B-5).
