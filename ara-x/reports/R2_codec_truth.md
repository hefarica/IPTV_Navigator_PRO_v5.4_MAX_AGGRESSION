# R2 · Verdad codec/HDR y taxonomía honesta 4K/8K fake

**Tarea:** `t3` (R2) · **Autor:** `codec-hdr-scientist` (S3 · Video Codec Engineer + S4 · Color Scientist HDR)
**Fecha:** 2026-10-30 · **Scope de escritura:** `ara-x/reports/**`, `ara-x/spec/**` (no se tocó generador, VPS, APK ni lista servida)
**Artefactos:** este reporte + [`ara-x/spec/4k8k_matrix.json`](../spec/4k8k_matrix.json) · sha256 `C9614643…F316F19` · 42.681 B
**Estado:** **PASS** — medido, con conteos reproducibles y autoverificación aritmética (`ALL_OK`).

---

## 0. Resumen ejecutivo

La lista `APE_LISTA_4K` **no es un catálogo de 10.631 canales 4K**: es un catálogo de 10.631 canales
donde **la capa pública declara** 4K/HDR para todos, mientras la **capa in-band del propio archivo**
declara 720p para el 70,76 %, 1080p para el 21,63 % y 4K solo para el **7,60 %**. Ambas capas son
coherentes consigo mismas; **la mentira está en la convivencia de las dos**.

Lo medido, sin interpretación:

| Afirmación del brief | Medición R2 | Veredicto |
|---|---|---|
| 10.631/10.631 declaran `RESOLUTION=3840x2160` + `hvc1.2.4.L153.B0` + `VIDEO-RANGE=PQ` | 10.631 / 10.631 / 10.631 | **CONFIRMADO** |
| `4KFALSE` = 42.524 | 42.524 **ocurrencias de línea** = 4 tags × 10.631 canales | **CONFIRMADO con corrección de denominador**: son 10.631 canales, no 42.524 |
| `8KFAKE TARGET=DISPLAY` = 10.631 | 10.631 con `ENABLED=1;NEVER_REAL=1;TARGET=DISPLAY`; literal `7680x4320` = **0** en todo el archivo | **CONFIRMADO y más fuerte**: no hay 8K wire en ningún byte |
| `avc1` literal = 0 (riesgo AVC vía `ape-codec-family`) | 0 `avc1` en cualquier `CODECS=`; `ape-codec-family="h264"` en **9.593 (90,24 %)** | **CONFIRMADO**; exposición FZ-01 = 90,24 % |
| ONN 4K S905X4 decodifica 4K@60 y NO 8K | coherente con la tabla del repo (`ape_codec_cascade.lua` T9 = 4K@60, T11–T13 = 8K) y con `NO_WIRE_8K_SOCS` del baseline `/sync` | **CONFIRMADO** (vendor-spec; ver §9) |

**El hallazgo central:** en el mismo bloque de canal conviven **tres** declaraciones contradictorias:

```
#EXT-X-CMAF:CODECS="hvc1.2.4.L93.B0,",BANDWIDTH=10000000,RESOLUTION=1280x720   ← 720p real declarado
#EXT-X-APE-HDR-TRANSFER:BT1886                                                ← transfer SDR
#EXT-X-STREAM-INF:...RESOLUTION=3840x2160,...,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ,...  ← 4K/QUE/HEVC público
```

Eso no es un bug de formato: es el **post-pase `_apeApply4kFake`** del generador reescribiendo
`RESOLUTION` y `CODECS` de todo `#EXT-X-STREAM-INF` **después** de que el resolver ya había decidido
la verdad (`ape-codec-family`, `#EXT-X-APE-CODEC-PREFERRED`, `#EXT-X-CMAF`). La consecuencia operativa
es **FZ-01** (freeze 2026-06-08) en 9.593 canales, y la corrección es la de la Doctrina ARA-X:
**resolución puede ser presentación; el codec público debe ser verdad.**

**Qué queda fijado (contrato para D2/D5/I5):** piso 4K = *selección de perfil/display + VPP*, 8K solo
`TARGET=DISPLAY`, degradación **FPS 60→30→24 → post-proceso → nunca resolución**, y prohibiciones
explícitas de wire 8K, `hvc1`+PQ sobre AVC sin daemon, CMAF/LCEVC/DV/AI-SR falsos.

---

## 1. Evidencia y método

**Fuente única de verdad:** `ara-x/evidence/APE_LISTA_4K_live_20261030_full.m3u8`

| Propiedad | Valor |
|---|---|
| Bytes | `572.170.477` |
| Líneas | `10.169.562` |
| sha256 | `E27C03EB45DACD6E5F19C3F4E016B456236CA2C06F485DDF11165DDC86E2A680` |
| Footer | `#EXT-X-APE-VALIDATED:RFC8216-STRICT,verdict=PASS,channels=10631` |
| Identidad | coincide con `reports/V0_baseline_verification.md` y `spec/ARA_X_PLAYLIST_BLOCK.md` |

La captura de `150.410.194 B` (2.795 `#EXTINF`) está **truncada** y **no** se usó como denominador.

**Método:** cuatro pasadas de lectura en streaming sobre el archivo completo (Node 24, `readline`,
`highWaterMark` 1 MiB). Sin red, sin VPS, sin device. La pasada 1 cuenta y hashea; la 2 parsea
atributos de `#EXTINF`/`#EXT-X-STREAM-INF` y hace *joins* por canal; la 3 extrae valores de los tags
privados (`#EXT-X-CMAF-*`, `#EXT-X-APE-HDR-*`, `#EXT-X-APE-DV-*`, `#EXT-X-APE-LCEVC-*`, `8KFAKE`,
`4KFALSE`) y cruza *hint* de nivel × fps declarado; la 4 cruza `CODEC-SOURCE` × nivel y
`perfil` × resolución in-band. El algoritmo esencial es reproducible con el apéndice A.

**Autoverificación del JSON entregable** (`node` local, script de 70 aserciones):

```
ok  family_sum 10631            ok  hint_invalid_sum 2565          ok  level_idc 5.1 153
ok  preferred_sum              ok  hint_valid_plus_invalid 10631   ok  level_minimal 3840x2160@60
ok  codec_source_sum           ok  sixty_fps_all 1922             ok  ladder_8k_forbidden
ok  source_x_level_sum         ok  public_4k_valid 10631          ok  device_no_wire_8k
ok  fps_join_sum 10631         ok  level_ps/sr (3.0 … 6.2)        ok  secret_scan (4 patrones)
ALL_OK
```

---

## 2. Lo que la lista declara (capa pública, player-facing)

| Atributo | Valor | Canales |
|---|---|---|
| `RESOLUTION` | `3840x2160` | 10.631 (100 %) |
| `CODECS` | `hvc1.2.4.L153.B0,mp4a.40.2` | 10.631 (100 %) |
| `VIDEO-RANGE` | `PQ` | 10.631 (100 %) |
| `COLOR-PRIMARIES` / `TRANSFER` / `MATRIX` | `9` / `16` / `9` (BT.2020 / PQ / BT.2020-NCL) | 10.631 |
| `FRAME-RATE` | `30.000` = 8.709 · `60.000` = 1.922 | 10.631 |
| `BANDWIDTH` | 3 valores distintos: mín 9.000.000 · mediana 9.000.000 · máx 28.000.000 · media 11.020.318 | 10.631 |
| `AVERAGE-BANDWIDTH` | media 8.156.853 | 10.631 |
| `HDCP-LEVEL` | `TYPE-1` | 10.586 |
| Forma del `STREAM-INF` | completa 10.586 · **mínima 45** (sin `COLOR-PRIMARIES`/`TRANSFER`/`MATRIX`/`HDCP`/`STABLE-VARIANT-ID`) | 10.631 |

Sin `EXT-X-MAP`, sin `SUPPLEMENTAL-CODECS`, sin `avc1`/`hev1`/`dvh1`/`av01`/`vp09` en ningún `CODECS=`.
**Un único `CODECS` para 10.631 canales de 11 orígenes distintos**: eso solo es posible si el valor se
*impone*, no se mide.

---

## 3. Lo que la lista sabe de sí misma (capa in-band)

| Señal privada | Distribución |
|---|---|
| `ape-codec-family` | `h264` = **9.593 (90,24 %)** · `hevc` = 1.038 (9,76 %) · `av1`/`vp9` = 0 |
| `ape-fps` (provenance: `channel.frames`) | `25` = 9.807 · `50` = 824 |
| `ape-profile` | P4 = 7.523 · P3 = 2.300 · P1 = 808 (P0/P2/P5 = 0) |
| `#EXT-X-APE-CODEC-PREFERRED` | `L150` = 8.021 · `L123` = 2.400 · `L120` = 165 · **ausente 45** |
| `#EXT-X-APE-CODEC-VERIFIED` | `false` = 10.586 · `true` = **0** · ausente 45 |
| `#EXT-X-APE-CODEC-REAL` | **0** (ningún codec verificado en todo el catálogo) |
| `#EXT-X-APE-CODEC-SOURCE` | `CASCADE_CSV_PREMIUM_HINT` 5.680 · `CASCADE_CSV_SAFE_1080P_HINT` 4.906 · `NO_CODEC_DECLARED` 45 |
| `#EXT-X-CMAF` (resolución in-band) | `1280x720` 7.523 (P4) · `1920x1080` 2.300 (P3) · `3840x2160` **808** (P1) |
| `#EXT-X-CMAF-HDR` | `SDR,NITS=100` 7.523 · `SDR,NITS=400` 2.300 · `PQ,NITS=1500` 808 |
| `#EXT-X-DATERANGE X-HDR-TYPE` | `SDR` 7.523 · `SDR + HLG fallback` 2.300 · `HDR10 + HLG` 808 |

Dos hechos decisivos:

1. **`X-HDR-TYPE` es una función determinista del perfil LAB** (`P4→SDR`, `P3→SDR+HLG`, `P1→HDR10+HLG`;
   0 excepciones en 10.631). No es una medida del bitstream: es una constante del bundle de knobs.
2. **`#EXT-X-CMAF` guarda la resolución honesta** (`P4→720p`, `P3→1080p`, `P1→4K`; 0 excepciones) y sus
   codecs (`L93`/`L123`/`L153`) **sí respetan la ley de niveles** para esas resoluciones.

> El generador es explícito: `ape-codec-family` solo vale `h264` cuando el resolver puso
> `channel.codecFamily = 'H264'` (tiers T11/T12); el default es `HEVC`
> (`m3u8-typed-arrays-ultimate.js:7139-7154`). Es decir, **el propio generador etiquetó 9.593 canales
> como AVC** y un pase posterior reescribió su `CODECS` a `hvc1.2.4.L153.B0`.

---

## 4. Las dos verdades (comparación)

| Capa | 4K | 1080p | 720p | “HDR” | Codec del bitstream |
|---|---|---|---|---|---|
| **Pública** (`STREAM-INF`) | 10.631 (100 %) | 0 | 0 | PQ 10.631 | HEVC Main10 L5.1 10.631 |
| **In-band** (`#EXT-X-CMAF`, `ape-codec-family`) | **808 (7,60 %)** | 2.300 (21,63 %) | **7.523 (70,76 %)** | SDR 9.823 (92,40 %) | AVC 9.593 (90,24 %) |

La tabla que el jugador lee y la tabla que el generador midió **no describen el mismo catálogo**.
El mecanismo está localizado y es de una sola función:

- `_apeApply4kFake()` — `m3u8-typed-arrays-ultimate.js:8104-8201`: reescribe **solo** `RESOLUTION` y
  `CODECS` de cada `#EXT-X-STREAM-INF` (`:8155-8158`), conserva `BANDWIDTH`/`FRAME-RATE`/`HDCP`/
  `VIDEO-RANGE` y añade las marcas `4KFALSE`/`8KFAKE`/`4K-PREMIUM`.
- `FIXED_SI` (`:8128-8129`) es la línea que se inserta cuando el canal no traía `STREAM-INF`: explica
  **exactamente** los 45 canales con forma mínima (`BANDWIDTH=28000000`, `FRAME-RATE=30.000`, `P4`,
  `h264`, `SDR`, sin tags de codec). El propio código los nombra: *“caso de los 45 de la lista
  publicada, p.ej. tvg-id 904505/904507”* (`:8142-8144`).

---

## 5. Ley de niveles HEVC vs resolución (Ley Cardinal 1)

`L153` = `level_idc 153` = **nivel 5.1** = techo 4K@60 en Main tier 40 Mbps. Tabla usada (ITU-T H.265
Tabla A.8; el repo la codifica igual en `ape_codec_cascade.lua` T1–T13):

| Nivel | level_idc | MaxLumaPs | MaxLumaSr | MaxBR main | Sirve hasta |
|---|---|---|---|---|---|
| 3.0 | 90 | 552.960 | 16.588.800 | 6 Mbps | 540p30 |
| 3.1 | 93 | 983.040 | 33.177.600 | 10 Mbps | **720p30** |
| 4.0 | 120 | 2.228.224 | 66.846.720 | 12 Mbps | **1080p30** |
| 4.1 | 123 | 2.228.224 | 133.693.440 | 20 Mbps | **1080p60** |
| 5.0 | 150 | 8.912.896 | 267.386.880 | 25 Mbps | **4K@30** |
| 5.1 | 153 | 8.912.896 | 534.773.760 | 40 Mbps | **4K@60** ← techo ONN 4K |
| 5.2 | 156 | 8.912.896 | 1.069.547.520 | 60 Mbps | 4K@120 (no decodable en S905X4) |
| 6.0 | 180 | 35.651.584 | 1.069.547.520 | 60 Mbps | 8K@30 (wire prohibido) |
| 6.1 | 183 | 35.651.584 | 2.139.095.040 | 120 Mbps | 8K@60 (wire prohibido) |
| 6.2 | 186 | 35.651.584 | 4.278.190.080 | 240 Mbps | 8K@120 (wire prohibido) |

**Veredicto medido:**

| Declaración | Canales | Veredicto |
|---|---|---|
| Pública `L153` + 4K | 10.631 | **VÁLIDA** para 4K ≤ 60 fps. En 4K@30 va sobrada (nivel mayor = requisito más estricto para el decoder; nunca es una subdeclaración). |
| Hint `L150` + 4K@30 | 8.021 | **VÁLIDA** por Tabla A.8; **insuficiente si se promoviera a 60 fps** |
| Hint `L123` + 4K | 2.400 (1.757@60 · 643@30) | **INVÁLIDA**: MaxLumaPs 2.228.224 < 8.294.400 |
| Hint `L120` + 4K@60 | 165 | **INVÁLIDA** por tamaño de imagen y por tasa |
| **Hint por debajo de 4K** | **2.565 (24,13 %)** | promoverlo a `CODECS` público con `RESOLUTION=3840x2160` = freeze |
| **Canales de 60 fps con hint insuficiente** | **1.922 / 1.922 (100 %)** | todo canal que dice 60 fps lleva un nivel que no puede con 4K@60 |

Conclusión operativa: **el nivel público es correcto; el nivel por canal es el que miente**. Si el
daemon/APK o el fallback F3 usaran `CODEC-PREFERRED` como codec real (F3 emite `hvc1.2.4.L120.B0`
para no-P0/P1, `ape-fallback-resolver.js:355`), el resultado sería un nivel de 1080p sobre una
declaración de 4K. La ley debe aplicarse en la **emisión pública**, no solo en el hint.

---

## 6. Verdad HDR/PQ

| Señal | Medición | Lectura |
|---|---|---|
| `VIDEO-RANGE=PQ` público | 10.631 | hint de display (decisión LOCKED 2026-06-16) |
| `#EXT-X-CMAF-HDR` in-band | `SDR,NITS=100` 7.523 · `SDR,NITS=400` 2.300 · `PQ,NITS=1500` 808 | **9.823 canales (92,40 %) declaran SDR in-band y PQ público** |
| `#EXT-X-APE-HDR-TRANSFER` | `BT1886` **10.631** | transfer **SDR** (gamma 2.4) en los mismos 10.631 que declaran `TRANSFER-CHARACTERISTICS=16` (PQ) |
| `#EXT-X-APE-HDR-MAXCLL` / `MAXFALL` | 100/25 · 400/100 · 1500/375 | por perfil |
| `#EXT-X-APE-HDR-METADATA` | `MDCV=true,CLLI=true,PEAK=…,AVG=1000` | **AVG (1000) > PEAK (100/400) en 9.823 canales** — MaxFALL no puede superar MaxCLL |
| `#EXT-X-DATERANGE` global | `X-HDR-TYPE="HDR10+DV-P81-P10"`, `X-HDR-MAX-CLL=10000` | master global 10.000 nits vs per-channel 100–1500 |
| `#EXT-X-APE-DV-*` / `#EXT-X-CMAF-DOLBY-VISION` | `PROFILE=8,LEVEL=6,RPU=true,EL=false`, 10.631 | **0** `dvh1`/`dvhe` en `CODECS`; imposible sobre los 9.593 AVC (DV P8 exige BL HEVC) |
| `#EXT-X-CMAF-HDR-METADATA` | `MDCV=true,CLLI=true` 10.631 | Metadata dinámica declarada sin SEI/`mdcv` verificable |

**Reconciliación honesta, sin re-litigar la decisión del propietario:**

- `VIDEO-RANGE=PQ` **se mantiene** (LOCKED 2026-06-16). Es intención de display, no una afirmación
  sobre el bitstream. Riesgo aceptado y documentado: *color shift* en players sin daemon; **nunca freeze**.
- Lo que **no** se sostiene es usar ese PQ para justificar `hvc1` sobre AVC (eso es FZ-01, §8), ni
  declarar HDR/DV “verificado”, ni publicar metadata imposible (`AVG > PEAK`, `MaxFALL > MaxCLL`).
- La corrección de 2026-06-17 sigue vigente: `hdr_conversion_mode` **no** hace SDR→HDR; el realce real
  es el **VPP/AI-PQ de hardware del SoC** (§10).
- Marcador propuesto (no existe hoy en la lista): `#EXT-X-APE-HDR-INTENT:display-pq;SCOPE=DISPLAY;VERIFIED=0`
  — permite que PQ sea explícitamente una intención y que ninguna capa lo lea como HDR verificado.

---

## 7. Taxonomía 4K/8K (14 clases, medidas)

| # | Clase | Definición / evidencia | Medido | % | Declaración permitida |
|---|---|---|---|---|---|
| 1 | `REAL_4K_WIRE_VERIFIED` | HEVC/AV1 ≥ 4K + nivel correcto + probe + HDR probado | **0** | 0 % | sí, con `CODEC-REAL` |
| 2 | `REAL_4K_HINT_UNVERIFIED` | tag in-band 4K (`L153`, 40 Mbps, HEVC, P1) pero sin probe | **808** | 7,60 % | 4K como PREFERRED + `VERIFIED:false` |
| 3 | `UPSCALED_PRESENTATION_4K` | fuente in-band 720p/1080p + `4KFALSE-MODE:ACTIVE` | **9.823** | 92,40 % | solo presentación: `TARGET=DISPLAY`, `PIXELS=0`, codec real |
| 4 | `PRESENTATION_8K_NEVER_WIRE` | `8KFAKE:NEVER_REAL=1;TARGET=DISPLAY`, 0 `7680x4320` | **10.631** | 100 % | solo display-side |
| 5 | `WIRE_8K` | `RESOLUTION=7680x4320` o nivel < 6.1 con 8K | **0** | 0 % | **PROHIBIDO** en S905X4 |
| 6 | `PQ_OVER_SDR_DISPLAY_HINT` | PQ público + in-band SDR/BT1886 | **9.823** | 92,40 % | sí (LOCKED) + marcador de intención |
| 7 | `AVC_SOURCE_WITH_HEVC_PUBLIC_DECL` (**FZ-01**) | `ape-codec-family=h264` + `CODECS=hvc1.*` sin cascade/probe | **9.593** | 90,24 % | **PROHIBIDO** (§8) |
| 8 | `FAKE_CMAF` | `#EXT-X-CMAF-CONTAINER:mpegts` + init byterange, 0 `EXT-X-MAP` | **10.631** | 100 % | **PROHIBIDO** como CMAF |
| 9 | `FAKE_LCEVC` | `LCEVC PHASE=4;ENABLED=true;50% saving`, 0 `lcev` supplemental | **10.631** | 100 % | solo `SYNTHETIC=1;SCOPE=DEVICE` |
| 10 | `FAKE_AI_SR_VPS` | `realesrgan SCALE=4` sin scope; VPS no procesa píxeles | **10.631** | 100 % | solo device-side con `SCOPE=DEVICE;PIXELS=0` |
| 11 | `FAKE_DOLBY_VISION` | `DV PROFILE=8` sin `dvh1`/`dvhe`, 9.593 sobre AVC | **10.631** | 100 % | **PROHIBIDO** sin capa DV |
| 12 | `LEVEL_UNDER_RESOLUTION` | hint L120/L123 sobre declaración 4K | **2.565** | 24,13 % | hint solo si es coherente con su resolución real |
| 13 | `FPS_OVERCLAIM` | `FRAME-RATE` > `ape-fps` (igualdad: **0** canales) | **10.503** | 98,80 % | `FRAME-RATE` como objetivo, no como medida |
| 14 | `BITRATE_BELOW_4K_COHERENCE` | 4K + 9–15 Mbps + AVC (mediana 9 Mbps) | **9.548** | 89,81 % | no declarar 4K real |

Comprobación de cobertura: `3 + 2 = 9.823 + 808 = 10.631` exacto; `7 = 9.593` exacto. La taxonomía
**clasifica el 100 % del catálogo sin residuo**.

---

## 8. FZ-01 — el riesgo que el brief pide medir con `ape-codec-family`

**Definición:** un player que honra `CODECS` inicializa un decoder HEVC Main10 para bytes H.264 →
pantalla negra/spinner. Es el freeze del **2026-06-08**, documentado en el propio repo:

- `m3u8-typed-arrays-ultimate.js:10769-10772` — *“FIX S5 F4 … un H.264 a 22 Mbps declaraba
  hvc1.2.4.L153.B0 → freeze ExoPlayer 9/10 (decoder HEVC init + AVC bitstream)”*.
- `_vps_stage/lua/ape_uhd.lua:24-33` — *“declarar hvc1.* sobre bytes AVC 1080p es el FREEZE del
  2026-06-08 (FZ-01) … codec = verdad (prohibido falsear)”*.
- `_vps_stage/lua/ape_caps.lua:2348-2350` — `codec_string_matches('hvc1.2.4.L153.B0','h264') = false`
  (guard cross-codec ya escrito, **no desplegado**).

**Exposición medida:** 9.593 canales (90,24 %) con familia resuelta `h264` y `CODECS` público
`hvc1.2.4.L153.B0`; 10.586 sin un solo codec verificado (`CODEC-REAL` = 0).

**Por qué el gate no frena:** el guard de FIX S5 F4 solo se aplica si
`!_probeHasCodec && _codecSource !== 'premium-hint'` (`:10778`). Los 10.586 canales son *hint*
(0 con probe) y **5.680 son `premium-hint`** → el guard **se salta** y `_apeApply4kFake` impone
`hvc1.2.4.L153.B0`. No es un caso límite: es el camino por defecto.

**Remedios admitidos por ARA-X (sin borrar canales):**

1. Publicar el codec **real**: `avc1.640033` (AVC High@5.1, 4K@30) o `avc1.640028` (High@4.0, 1080p30)
   cuando la familia resuelta es `h264`; reservar `hvc1.2.4.L153.B0` para fuentes HEVC con
   `cascade_type`/probe verificado.
2. Mantener `VIDEO-RANGE=PQ` como hint de display (`VERIFIED=0`).
3. Si se decide conservar `hvc1` público para todos (decisión de producto), **exigir el daemon** que
   inicialice el decoder correcto y declarar el riesgo en la propia lista.
4. **Nunca** eliminar el canal por falta de evidencia (NEVER-DROP).

---

## 9. ONN 4K (Amlogic S905X4): qué decodifica y qué no

| Capacidad | Límite | Techo RFC 6381 | Confianza |
|---|---|---|---|
| HEVC Main10 | 3840×2160 @ **60** | `hvc1.2.4.L153.B0` | vendor-spec + cascada del repo (T9) |
| H.264 High | 3840×2160 @ **30** | `avc1.640033` | vendor-spec parcial (4K@60 AVC = L5.2, no soportado) |
| AV1 Main10 | 3840×2160 @ 60 | `av01.0.13M.10` | vendor-spec parcial |
| VP9 P2 | 3840×2160 @ 60 | `vp09.02.10.10` | **no verificado** |
| VVC/H.266 | **no** | `vvc1.*` | vendor-spec |
| Dolby Vision | **no verificado** (solo variantes `-J` con licencia) | `dvh1.08.06` | — |
| **8K (7680×4320)** | **no decodifica** | — | vendor-spec + `NO_WIRE_8K_SOCS` |

**8K = presentación.** La lista ya lo hace bien (`NEVER_REAL=1;TARGET=DISPLAY`, 0 `7680x4320`). Lo que
hay que impedir es que alguien “arregle” eso poniendo `RESOLUTION=7680x4320` o un `L156` (4K@120) como
CORONA: el `ape_codec_cascade.lua` del Lua usa **T10 = L156 (4K@120)** para P0/P1 (`:47-48`) — ese tier
**no es declarable** en este device.

Alineación con el baseline ya verificado: `ara-x/tests/sync_contract.test.js:147-150` rechaza
`wire_resolution=7680x4320` en `amlogic_s905x4`; `ara-x/vps/schema/device_policy.example.json` fija
`display.wire_resolution=3840x2160` y `display.eight_k=presentation_only`. **R2 no cambia ese contrato:
lo respalda con la ley de niveles y con la medición.**

---

## 10. VPS = metadata-only; LCEVC/AI-SR **no** son procesamiento real del VPS

Medición vigente (`docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md`): producción es **rebase-only**,
3 fases Lua (`header_filter`/`body_filter`/`log`), **sin** motor Rust, **sin** `/shield/` (404) y los
segmentos (`.ts`, `.m4s`) responden **404** — *el VPS no transporta vídeo*. `combined_body_filter.lua`,
`ape_virtual_4k.lua` y `decision_engine.lua` **no están desplegados**.

| Declaración de la lista | Realidad | Veredicto |
|---|---|---|
| `#EXT-X-CMAF-CONTAINER:mpegts` + `INIT-SEGMENT:BYTERANGE="1024@0"` | no hay `#EXT-X-MAP` ni `.m4s`; TS no tiene init segment CMAF | **CMAF falso** (10.631) |
| `#EXT-X-APE-LCEVC-PHASE:4`, `ENABLED=true`, `BITRATE-SAVING:50%` | sin capa `lcev` en `CODECS`/`SUPPLEMENTAL`; el APK declara *“LCEVC = residual sintético propio”* (`UltraEnhancePipeline.kt:19`) | **LCEVC no real** (10.631) |
| `#EXT-X-CMAF-AI-SR:MODEL=realesrgan,SCALE=4` | el APK declara pesos **baseline** (`.tflite` = gaussiana/unsharp/blend, `UltraEnhancePipeline.kt:16-18`) y **solo procesa sus propios frames** (`:12-15`: Android no permite capturar el MediaCodec de un player de terceros) | **AI-SR no es del VPS** (10.631) |
| `#EXT-X-CMAF-VRR:MIN=24,MAX=120` + `MEMC-120` | 4K@120 no existe en este SoC; el MEMC/VPP es del display | claim de display sin scope |
| `#EXT-X-CMAF-ATMOS/DTS/TRUEHD` | `ENABLED=false` y el audio real es `mp4a.40.2` (10.631) | **honesto** (no se vende) |

El APK **sí** puede escribir los levers reales del VPP (`SettingsApplier.kt:142-152`:
`pq_ai_sr_enable`, `ai_sr_level`, `hdr_conversion_mode` con allowlist `^[0-3]$`/`^[01]$`), pero eso es
**post-proceso de hardware en el device**, no “el VPS mejora píxeles”. La política ARA-X debe etiquetar
cada claim con `SCOPE=DEVICE;PIXELS=0` o retirarlo.

---

## 11. Política MÍNIMO 4K + NEVER-DROP (contrato para D2/D5)

**Piso 4K = selección de perfil/display + VPP, no licencia de wire.** Aplica a `profile_choice`,
`display_target`, `vpp_intensity` y (si hay variantes) `variant_selection`; **no** autoriza wire 8K,
ni `hvc1`+PQ sobre AVC sin daemon, ni vender LCEVC/AI-SR como procesamiento del VPS, ni declarar
verificado lo que es hint, ni inventar resolución que la fuente no tiene (solo presentación honesta,
marcada con `#EXT-X-APE-UPSCALE:declared=…;src=…;can8k=0`, formato ya definido en `ape_uhd.lua` v2).

**Orden de degradación (NEVER-DROP):**

| Rango | Lever | Secuencia | Regla |
|---|---|---|---|
| 1 | **FPS** | `60 → 30 → 24` | primero se pierde fluidez; 4K@24 es preferible a 1080p@60 |
| 2 | **Post-proceso** | `ai_pq → ai_sr → sharpen → dnr → nlmeans` (reducir intensidad) | el VPP del SoC se atenúa antes de tocar resolución |
| 3 | **Bitrate** | variantes 4K de menor bitrate | ABR nunca cruza a < 4K |
| 4 | **Resolución** | **prohibida** | `floor = 3840x2160` |

Disparadores (térmico `65/78/82/85 °C`, stutter, red) son **de D2/D5**; R2 solo garantiza la
invariante: **cualquier disparador degrada FPS/post-proceso y nunca resolución**, con anti-flap de D5.

**NEVER-DROP:** 10.631 canales antes y después; 0 URLs mutadas; 1 URL por canal (anti-509); el fallback
F4/F5 conserva el canal. R2 **no modifica la lista** en esta tarea (solo la mide).

---

## 12. Validadores para I5 (`policy_engine.js`)

`V1` wire 8K ⇒ ERROR · `V2` nivel ≥ requerido(res,fps) ⇒ ERROR si público · `V3` familia(CODECS) ==
`ape-codec-family` o verificado o daemon ⇒ ERROR · `V4` `SUPPLEMENTAL-CODECS` solo con bitstream ⇒ ERROR ·
`V5` CMAF ⇒ requiere `EXT-X-MAP`+fMP4, `container != mpegts` ⇒ ERROR · `V6` LCEVC ⇒ capa o
`SYNTHETIC;SCOPE=DEVICE` ⇒ ERROR · `V7` DV ⇒ `dvh1.08.*` + BL HEVC ⇒ ERROR · `V8` AI-SR ⇒
`SCOPE=DEVICE;PIXELS=0` ⇒ ERROR · `V9` PQ ⇒ marcador de intención, sin contradicción `APE-HDR-TRANSFER` ⇒
WARN (owner-locked) · `V10` `MaxFALL ≤ MaxCLL` y `AVG ≤ PEAK` ⇒ ERROR · `V11` `FRAME-RATE ≤ ape-fps` ⇒
WARN · `V12` 4K HEVC `BANDWIDTH ≥ 15 Mbps` (22 si HDR/60) ⇒ WARN · `V13` `CODEC-VERIFIED:true` ⇒ requiere
`CODEC-REAL`+probe ⇒ ERROR · `V14` `4KFALSE`/`8KFAKE` ⇒ `TARGET=DISPLAY`+`SCOPE/PIXELS` ⇒ WARN.

Violaciones medidas hoy: V2 2.565 (hint), V3 10.586, V5/V6/V7/V8 10.631 cada una, V9 10.631 (accepted),
V10 9.823, V11 10.503, V12 9.548, V14 10.631; **V1 y V4 y V13 = 0** (el catálogo ya cumple lo que más
importa para el freeze).

---

## 13. Hallazgos (formato del repo)

```
ID: R2-F01
Archivo: IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
Línea(s): 8104-8201 (post-pase) · 10769-10797 (guard FIX S5 F4)
Severidad: CRITICAL
Capa: generador → lista pública
Síntoma: 9.593 canales (90,24 %) con familia AVC declaran CODECS="hvc1.2.4.L153.B0"
Causa raíz: _apeApply4kFake reescribe CODECS después del resolver; el gate solo corre sin probe y sin premium-hint, y los 10.586 son hint (5.680 premium)
Impacto: FZ-01 (freeze 2026-06-08) en players que honran STREAM-INF
Corrección: declarar avc1.640033/avc1.640028 cuando la familia es h264, o exigir daemon/cascade_type
Prueba: conteo R2 (joinFamilyCodec) + casos del JSON (validators V3)
Estado: MEDIDO · no corregido (R2 no edita el generador)
```

```
ID: R2-F02
Archivo: lista APE_LISTA_4K (campo #EXT-X-APE-CODEC-PREFERRED)
Línea(s): tag por canal
Severidad: HIGH
Capa: metadata por canal
Síntoma: 2.565 hints (24,13 %) con nivel < 4K; 1.922/1.922 canales de 60 fps con hint insuficiente
Causa raíz: el tier de la cascada se resuelve por la resolución inferida (720p/1080p) y luego el público se fuerza a 4K
Impacto: si F3/daemon promueve el hint a CODECS, nivel 4.1/4.0 sobre 4K = decoder failure
Corrección: hint coherente con la resolución in-band; público solo con nivel >= requerido
Prueba: hintViolations (Tabla A.8) en 4k8k_matrix.json
Estado: MEDIDO
```

```
ID: R2-F03
Archivo: lista APE_LISTA_4K (#EXT-X-CMAF*)
Severidad: HIGH
Capa: contenedor
Síntoma: 10.631 canales declaran CMAF con container=mpegts, init-segment byterange y sin EXT-X-MAP
Causa raíz: el bloque CMAF es plantilla fija por canal, no una medición del contenedor
Impacto: players/LL-HLS que confíen en el init segment fallan o ignoran LL-HLS
Corrección: retirar el claim CMAF o renombrarlo (LL-HLS sobre TS) hasta tener fMP4 real
Prueba: EXT-X-MAP=0, container=mpegts=10.631
Estado: MEDIDO
```

```
ID: R2-F04 / R2-F05 / R2-F06
Severidad: HIGH (LCEVC, DV) · MEDIUM (AI-SR)
Síntoma: LCEVC phase 4 (10.631), DV profile 8 (10.631) y AI-SR realesrgan x4 (10.631) sin capa/codec/modelo real
Causa raíz: tags promocionales fijos por canal; el único motor real es el VPP del SoC y el APK (pesos baseline)
Impacto: expectativa de calidad imposible; el VPS no procesa píxeles (rebase-only)
Corrección: SYNTHETIC=1;SCOPE=DEVICE;PIXELS=0 o retirada
Prueba: 0 dvh1/lcev en CODECS; UltraEnhancePipeline.kt:12-19
Estado: MEDIDO
```

```
ID: R2-F07
Archivo: lista (#EXT-X-APE-HDR-*)
Severidad: MEDIUM
Capa: HDR/color
Síntoma: TRANSFER=16 (PQ) público vs APE-HDR-TRANSFER:BT1886 (SDR); MaxFALL>MaxCLL y AVG(1000)>PEAK en 9.823
Causa raíz: HDR derivado del perfil LAB, no del bitstream; plantilla con AVG fijo
Impacto: metadata inconsistente; PQ sigue siendo hint aceptado, pero la metadata se contradice
Corrección: marcador de intención VERIFIED=0 + sanear MaxCLL/MaxFALL
Prueba: hdr_side del JSON
Estado: MEDIDO
```

```
ID: R2-F09
Archivo: lista APE_LISTA_4K (45 canales tvg-id 9045xx)
Severidad: MEDIUM
Síntoma: STREAM-INF mínimo (sin COLOR-PRIMARIES/TRANSFER/MATRIX/HDCP/STABLE-VARIANT-ID) y sin CODEC-PREFERRED/VERIFIED
Causa raíz: FIXED_SI insertado por _apeApply4kFake para canales sin STREAM-INF (nombrados en el código)
Impacto: 0,42 % del catálogo con bloque incompleto
Corrección: emitir el bloque completo (o el honesto avc1) también en ese path
Prueba: anomalyCount=45
Estado: MEDIDO
```

```
ID: R2-F11
Archivo: IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/combined_body_filter.lua
Línea(s): 335 (CHINA_BOX_FAKE_4K = true) · 327-343 (LEVER B)
Severidad: HIGH (latente)
Capa: VPS (repo, no desplegado)
Síntoma: el guard honesto anti fake-4K-sobre-AVC está DESACTIVADO en la copia del repo
Impacto: si se desplegara, reintroduce FZ-01 por la vía del VPS
Corrección: ARA-X codifica el guard fail-closed (V3) con independencia de ese flag; no desplegar sin decisión explícita
Prueba: lectura de líneas 327-343
Estado: MEDIDO · archivo no desplegado (rebase-only)
```

```
ID: R2-F12
Archivo: IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/ape_codec_cascade.lua
Línea(s): 47-48, 73 (T10 = L156 4K@120)
Severidad: MEDIUM (latente)
Síntoma: el Lua usa T10 (L156, 4K@120) como CORONA agresiva
Impacto: declarar 4K@120 en un device que decodifica 4K@60
Corrección: techo por SoC = L153 en amlogic_s905x4 (validators V1/V2)
Estado: MEDIDO
```

Hallazgos menores: `R2-F08` FPS overclaim 98,80 % · `R2-F10` 4K a 9 Mbps con AVC (9.548) ·
`R2-F13` master global 10.000 nits vs 100–1500 per-channel · `R2-F14` `#EXT-X-APE-CRYSTAL-UHD`
(lever VPP) existe en el generador pero **no** en la lista servida (0 ocurrencias) ·
`R2-F15` latencia LL-HLS contradictoria global (`PART-HOLD-BACK=1.0`, `TARGETDURATION:2`) vs
per-canal (`CMAF-LATENCY TARGET=4.0,PART-HOLD-BACK=6.0`) — **owner: R1**.

---

## 14. Lo que este reporte NO afirma

- **No** afirma que no exista 4K real: afirma que **no hay evidencia verificada** en la lista
  (`CODEC-REAL` = 0). El 7,60 % es un **hint** coherente, no un probe.
- **No** afirma que los 9.593 canales sean AVC demostrado: `ape-codec-family` es salida del **resolver**
  (default HEVC, `h264` explícito cuando el tier es AVC), no un probe de bitstream. La frase correcta es
  *“la mejor evidencia declarada dice AVC”*.
- **No** midió el device: los límites del S905X4 son vendor-spec + tabla del repo. La medición on-device
  (MediaCodec/`dumpsys`) es de R6/t6.
- **No** verificó la unidad concreta para Dolby Vision (S905X4 vs S905X4-J) → `dvh1` queda `unverified`.
- **No** determinó si los players honran `STREAM-INF` dentro de un catálogo M3U Plus (eso decide la
  severidad práctica de FZ-01 y es de R4).
- **No** tocó VPS, generador, APK ni la lista servida; no hay deploy ni commit.
- **No** re-litiga la decisión LOCKED de `VIDEO-RANGE=PQ`; la mantiene y la hace explícita.

---

## 15. Aceptación y verificación

| Criterio | Evidencia | Estado |
|---|---|---|
| `ara-x/spec/4k8k_matrix.json` válido y consumible | `JSON.parse` OK; 70 aserciones aritméticas `ALL_OK`; sha256 `C9614643…F316F19` | **PASS** |
| `ara-x/reports/R2_codec_truth.md` con la verdad medida y la política | este documento | **PASS** |
| Conteos sobre el catálogo completo (no la captura truncada) | 10.631 `#EXTINF`/URL/`STREAM-INF`; sha256 `E27C03EB…E2A680` | **PASS** |
| Ley de niveles verificada contra Tabla A.8 (mínimo por res×fps) | `level_ps`/`level_sr`/`level_minimal` para 720p→8K | **PASS** |
| 8K nunca wire en el ONN 4K | `7680x4320` = 0 ocurrencias; `NO_WIRE_8K_SOCS` alineado | **PASS** |
| Taxonomía cubre el 100 % sin residuo | 9.823 + 808 = 10.631; AVC 9.593 exacto | **PASS** |
| 0 secretos / 0 URLs de canal en los entregables | 4 patrones de scan + `no_m3u8_urls` | **PASS** |
| 0 canales perdidos / 0 URLs mutadas | R2 no escribe la lista (solo lectura) | **N/A por diseño** |

**Comandos ejecutados (host Windows, Node v24):**

```powershell
node <harness>\measure.js  ara-x/evidence/APE_LISTA_4K_live_20261030_full.m3u8 <tmp>\full.json    # 72 s
node <harness>\measure2.js ara-x/evidence/...full.m3u8 <tmp>\full2.json                          # 15 s
node <harness>\measure3.js ara-x/evidence/...full.m3u8 <tmp>\full3.json                          # 17 s
node <harness>\measure4.js ara-x/evidence/...full.m3u8 <tmp>\full4.json                          # 15 s
node <harness>\check_matrix.js                                                                   # ALL_OK
```

---

## Apéndice A · Reproducción mínima (una pasada, sin dependencias)

```js
// node r2_count.js <catalogo.m3u8>
const fs = require('node:fs'), readline = require('node:readline'), crypto = require('node:crypto');
const f = process.argv[2], c = {}, inc = (k) => (c[k] = (c[k] || 0) + 1);
const attr = (l, n) => { const m = new RegExp('(?:^|[\\s,:])' + n + '=("[^"]*"|[^,\\s]*)').exec(l);
  return m ? m[1].replace(/^"|"$/g, '') : null; };
let pend = null, res4 = 0, hint = {};
const rl = readline.createInterface({ input: fs.createReadStream(f), crlfDelay: Infinity });
rl.on('line', (l) => {
  if (l.startsWith('#EXTINF')) { inc('extinf'); pend = attr(l, 'ape-codec-family'); }
  else if (l.startsWith('#EXT-X-APE-CODEC-PREFERRED')) { const m = /\.(L\d+)/.exec(l); hint[m ? m[1] : 'none'] = (hint[m ? m[1] : 'none'] || 0) + 1; }
  else if (l.startsWith('#EXT-X-STREAM-INF')) {
    inc('streaminf'); if (attr(l, 'RESOLUTION') === '3840x2160') res4++;
    inc('fam|' + (pend || 'none') + '|' + (attr(l, 'CODECS') || '').split(',')[0].slice(0, 4));
    pend = null;
  } else if (l && l[0] !== '#') inc('urls');
});
rl.on('close', () => { const h = crypto.createHash('sha256');
  fs.createReadStream(f).on('data', (d) => h.update(d)).on('end', () =>
    console.log(JSON.stringify({ sha256: h.digest('hex').toUpperCase(), counts: c, res4k: res4, hint }, null, 2))); });
// esperado: extinf=10631 streaminf=10631 urls=10631 res4k=10631
//           fam|h264|hvc1=9593  fam|hevc|hvc1=1038
//           hint={ L150: 8021, L123: 2400, L120: 165 }
```

## Apéndice B · Campos que consume cada tarea

| Consumidor | Campos de `4k8k_matrix.json` |
|---|---|
| **D2** (política) | `device.*`, `minimum_4k.*`, `degradation.order`, `taxonomy[*].allowed_declaration`, `validators[*]` |
| **D3** (`/sync`) | `handoff.D2_policy_schema_fields` (`display.min_resolution`, `display.wire_resolution`, `display.eight_k`, `display.never_downscale`, `fps.target/min`) |
| **D5/I1** (decisión) | `degradation.order`, `handoff.D2_policy_schema_fields.processing.tier`, `level_law.measured_verdicts` |
| **I5** (`policy_engine`) | `validators[*]` (id, regla, severidad, violaciones medidas), `taxonomy[*].measured_count`, `fz01` |

---

*Fin del reporte. Todo número de este documento es reproducible con la captura identificada por
`E27C03EB45DACD6E5F19C3F4E016B456236CA2C06F485DDF11165DDC86E2A680` y el script del apéndice A.*
