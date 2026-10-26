# APP_EMISSION_CONTRACT — Tags exactos por perfil, contrastados 1:1 con el SSOT

**Task:** t6 · T5 · Auditoría de la APP
**Attempt:** `bf962cfc-3985-412c-b4a0-8fca541a817e`

**SSOT de contraste:** `IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json`
· 280 065 B · sha256 `099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4`

**Método:** lectura del código (determinista) + extracción de los valores reales del JSON. No se ejecutó el
generador (no hay navegador). Cada valor de esta tabla se deriva de una **expresión de código citada** y de una
**clave JSON citada**; cuando el valor depende de estado de runtime se marca explícitamente como
`⟨runtime⟩` y se dice cuál variable lo decide.

---

## 1. Los CUATRO emisores de `#EXT-X-STREAM-INF` (contrato se elige por rama)

| Rama | Condición | Línea | ¿Pasa por `__apeStreamTruth`? | Código de salida |
|---|---|---|---|---|
| **A · cfg** | función `buildChannelStreamInf(cfg)` | `m3u8-typed-arrays-ultimate.js:6840-6885` | ❌ **NO** | `cfg.codec_string` o default por `switch (cfg.codec_primary)` |
| **B · maxQualityMode** | `options.maxQualityMode === true` | `:9995-10008` | ❌ **NO** | siempre `dvh1.08.06` |
| **C · truth-driven** | `_apeTruth` existe | `ape-fallback-resolver.js:542-613` | ✅ **SÍ** (vía `truth`) | `truth.codec` (F0/F1 verificados) |
| **D · 796/legacy** | ruta por defecto | `:10318-10370` | ✅ **SÍ** (`__apeStreamTruth`) | `_streamTruth.codec` |

**El contrato por defecto es la rama D.** A y B son las que rompen la coherencia (ver
`APP_HARDCODE_FINDINGS.md` F-APP-03/06/12).

---

## 2. Rama D — tags exactos, en orden de emisión (por canal)

Secuencia verificada de las líneas que produce el bloque de un canal (rama D, `fakeUhd` default):

| # | Tag | Línea | Valor (expresión) |
|---|---|---|---|
| 1 | `#EXTINF:-1 tvg-id=… tvg-name=… group-title=…,<nombre>` | — | metadata del canal (no del LAB) |
| 2 | `#EXTHTTP:{json}` (~40 headers) | `:5655+` | **SSOT**: `headerOverrides` + `_fillSemanticHeadersFromLAB` |
| 3 | `#EXTVLCOPT:*` (~133) | `:3326-3439` | **SSOT**: `getProfile().vlcopt` (gate `includeLabExtras`) |
| 4 | `#KODIPROP:*` (~103) | `:3760-3775` | **SSOT**: `getProfile().kodiprop` + familias `hevc/h265` |
| 5 | `#EXT-X-APE-CODEC-PRIORITY:hevc,hev1,hvc1,h265,…` | `:6257` | `codec_chain_player_pref` |
| 6 | `#EXT-X-APE-CODEC-PRIORITY-HEV1:<cascada hev1>` | `:6992` | `codec_ladder_hev1` (**solo** runtime, GOLDEN RULE OK) |
| 7 | `#EXT-X-APE-PROFILE-CODEC-LADDER-HEV1:<…>` | `:6996` | `codec_ladder_hev1` |
| 8 | `#EXT-X-APE-FALLBACK-TIER:<Fn>` · `-CONFIDENCE` · `-REASON` · `-QUALITY-MODE` | `ape-fallback-resolver.js:619-622` | truth (F0…) |
| 9 | `#EXT-X-APE-CODEC-REAL:<codec>` **o** `-CODEC-PREFERRED:<codec>` + `-CODEC-VERIFIED:true\|false` | `:627-632` | **honestidad verified vs preferred** ✅ |
| 10 | `#EXT-X-APE-CONTAINER:<t>` + `-VERIFIED:<bool>` | `:639-640` | truth |
| 11 | `#EXT-X-APE-HDR:<t>` + `-VERIFIED` | `:647-648` | truth |
| 12 | `#EXT-X-APE-RESOLUTION:` · `-BANDWIDTH:` (+`-VERIFIED`) | `:656-663` | truth |
| 13 | `#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=<bw×0.025>,CODECS="<_codec796>"` | `:9949` | **sin URI=** ✅ · pero usa el codec **pre-truth** → declara `L153` mientras el STREAM-INF declara `L183` ⚠️ |
| 14 | `#EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1:<hev1…>` | `:9954` | `_getHev1ForChannel()` → `ape-hevc-cascade.js:324` (**GOLDEN RULE estructural**) |
| 15 | `#EXT-X-APE-QUALITY-SOURCE:<probe\|ESTIMATED>` | `:9957` | probe |
| 16 | `#EXT-X-APE-PROBED-AT` · `-PROBED-VARIANTS` | `:9959-9960` | probe |
| 17 | `#EXT-X-APE-LLHLS:*` · `-BLOCK-RELOAD` · `-SKIP-UNTIL` | `:9965-9967` | probe |
| 18 | `#EXT-X-APE-CODEC-MISMATCH` · `-FAKE4K` · `-FRAG-INFO` | `:9972-9976` | probe cross-validation |
| 19 | `#EXT-X-APE-UPSCALE:fake8k,res=<res>,level=L<reqLevel>` | `:10354` | **declara honestamente el fake** ✅ |
| 20 | `#EXT-X-APE-STREAM-TRUTH:src=,w=,h=,fps=,rawfps=,family=,pq=,fake=,real8k=,rev=L…` | `:10369` | trazabilidad completa ✅ |
| 21 | **`#EXT-X-STREAM-INF:BANDWIDTH=<_bw796_final>,AVERAGE-BANDWIDTH=<_avgBw_final>,CODECS="<_streamTruth.codec>,<_codecAudio>",RESOLUTION=<_streamTruth.resolution>,FRAME-RATE=<_streamTruth.fps>[,VIDEO-RANGE=PQ\|HLG],HDCP-LEVEL=<_hdcpLevel>,STABLE-VARIANT-ID="<chId>_<P>"`** | `:10370` | **el contrato real** |
| 22 | `#EXT-X-APE-FPS-SOURCE:<probe\|default-120\|default-60>` | `:10372` | trazabilidad del clamp ✅ |
| 23 | `#EXT-X-APE-CODEC-SOURCE:<probe\|premium-hint\|f4-avc-safe\|cascade-forzada\|vps-image-4k\|vps-image-fhd>` | `:10377` | trazabilidad de la decisión de códec ✅ |
| 24 | `#EXT-X-APE-CODEC-FALLBACK-CHAIN:<aliases>` | `:10386` | `getCodecCascade('video_hevc_first')` |
| 25 | `<URL DIRECTA del proveedor>` | `:10388` `primaryUrl` | **una sola URL** ✅ (SHIELDED verbatim) |

**Además, una vez por lista (cabecera global)**, `m3u8-typed-arrays-ultimate.js:3039-3075`:
`#EXT-X-SESSION-DATA:com.ape.lab.{version,schema,exported_at,bulletproof,filename}` (L2754-2758) ·
`#EXT-X-APE-LAB-DNA:sha256=<hash|unverified>` (L2606-2617) · `#EXT-X-I-FRAME-STREAM-INF:…CODECS="hvc1.2.4.L153.B0",RESOLUTION=1920x1080` (L3061, ver F-APP-11) ·
`#EXT-X-CONTENT-STEERING` · `#EXT-X-APE-INSTALLER` · `#EXT-X-APE-WAKE` · `#EXT-X-DATERANGE` · `#EXT-X-KEY:METHOD=NONE`.

---

## 3. Valores del SSOT que alimentan el contrato (medidos)

| Perfil | `settings.resolution` | `fps` | `bitrate` (Mbps) | `codec_full` | `codec_string` | `codec_chain_video[0]` | `bandwidth_floor` | `bandwidth_max` | `video_range` | `hdr_mode` | `bit_depth` |
|---|---|---:|---:|---|---|---|---:|---:|---|---|---:|
| **P0** | `7680x4320` | 120 | 200 | `dvh1.08.06` | `hvc1.2.4.L153.B0,ac-3` | `hvc1.2.4.L153.B0` | 15 000 000 | 80 000 000 | PQ | HDR10 | 12 |
| **P1** | `7680x4320` | 120 | 40 | `hvc1.2.4.L153.B0` | `hvc1.2.4.L153.B0,ac-3` | `hvc1.2.4.L153.B0` | 12 000 000 | 28 000 000 | PQ | HDR10PLUS | 10 |
| **P2** | `3840x2160` | 120 | 25 | `hvc1.2.4.L150.B0` | `hvc1.2.4.L150.B0,ac-3` | `hvc1.2.4.L153.B0` | 8 000 000 | 16 000 000 | PQ | HDR10 | 10 |
| **P3** | `3840x2160` | 120 | 15 | `hvc1.1.6.L120.B0` | `hvc1.2.4.L120.B0,mp4a.40.2` | `hvc1.2.4.L153.B0` | 5 000 000 | 12 000 000 | SDR | SDR | 10 |
| **P4** | `3840x2160` | 120 | 10 | `avc1.64001f` | `avc1.640028,mp4a.40.2` | `hvc1.2.4.L153.B0` | 3 000 000 | 9 000 000 | SDR | SDR | 8 |
| **P5** | `3840x2160` | 120 | 2 | `avc1.42c01e` | `avc1.42E01E,mp4a.40.2` | `hvc1.2.4.L153.B0` | 1 500 000 | 5 500 000 | SDR | SDR | 8 |

`prisma_lab_sync_v20.profile_attributes` (floor/target en **bps**): P0=P1=P2 → floor 15 000 000 / target 20 000 000;
P3=P4 → 8 000 000 / 12 000 000; P5 → 4 000 000 / 6 000 000.

---

## 4. CONTRATO POR PERFIL — estado actual (fake-8K default ON, sin probe, canal NO premium)

Condiciones: `window.APE_FAKE_UHD` indefinido ⇒ `fakeMode='8k'` (`:2495-2496`, `:10342`) ·
sin `channel._probeData` (`:7835`) · canal sin tokens premium (`:10216-10222`).

**Transformaciones aplicadas por el bridge SSOT** (`:1572-1689`):
`cfg.resolution = s.resolution` · `cfg.fps = s.fps` · `cfg.bitrate = round(s.bitrate × 1000)` (kbps) ·
`cfg.codec_string = s.codec_string` · `cfg.codec_chain_video = s.codec_chain_video` ·
`cfg.bitrate_floor_mbps = prisma_floor/1e6` si Prisma cargado.

**Cadena de BANDWIDTH** (`:7836-7851`): `_bw796_raw = cfg.bitrate × 1000` (bps) ·
`_bitrateFloor = floor_prisma_bps` (o 14/5/2 Mbps por resolución) · `_bw796 = max(raw, floor)` · `_avgBw = 0.85 × _bw796`.

| Perfil | `RESOLUTION` | `FRAME-RATE` | `CODECS` | `BANDWIDTH` | `AVERAGE-BANDWIDTH` | `VIDEO-RANGE` | `HDCP-LEVEL` | `#EXT-X-APE-UPSCALE` | `#EXT-X-APE-FPS-SOURCE` | `#EXT-X-APE-CODEC-SOURCE` |
|---|---|---:|---|---:|---:|---|---|---|---|---|
| **P0** | `7680x4320` | `60.000` | `hvc1.2.4.L183.B0,mp4a.40.2` | `200 000 000` | `170 000 000` | `PQ` | `TYPE-1`⟨rt⟩ | `fake8k,res=7680x4320,level=L183` | `default-60` | `cascade-forzada` |
| **P1** | `7680x4320` | `60.000` | `hvc1.2.4.L183.B0,mp4a.40.2` | `40 000 000` | `34 000 000` | `PQ` | `TYPE-1`⟨rt⟩ | `fake8k,…,level=L183` | `default-60` | `cascade-forzada` |
| **P2** | `7680x4320` | `60.000` | `hvc1.2.4.L183.B0,mp4a.40.2` | `25 000 000` | `21 250 000` | `PQ` | `TYPE-1`⟨rt⟩ | `fake8k,…,level=L183` | `default-60` | `cascade-forzada` |
| **P3** | `7680x4320` | `60.000` | `avc1.64003E,mp4a.40.2` | `15 000 000` | `12 750 000` | `PQ` | `TYPE-1`⟨rt⟩ | `fake8k,…,level=L183` | `default-60` | `f4-avc-safe` |
| **P4** | `7680x4320` | `60.000` | `avc1.64003E,mp4a.40.2` | `10 000 000` | `8 500 000` | `PQ` | `TYPE-1`⟨rt⟩ | `fake8k,…,level=L183` | `default-60` | `f4-avc-safe` |
| **P5** | `7680x4320` | `60.000` | `avc1.64003E,mp4a.40.2` | `4 000 000` | `3 400 000` | `PQ` | `TYPE-1`⟨rt⟩ | `fake8k,…,level=L183` | `default-60` | `f4-avc-safe` |

⟨rt⟩ = depende de `window.APE_HDCP_PROFILE[chId]` (bulk fetch): `'NONE'` si Conviva registró VST>3000 ms.

**Cómo se deriva cada celda (aritmética verificable):**
- `RESOLUTION=7680x4320`: `fakeMode='8k'` ⇒ `rr={7680,4320}` (`:2500-2501`) **descartando** el `settings.resolution` del SSOT.
- `FRAME-RATE=60.000`: `min(120, 60)` (`:2519`).
- `CODECS` P0–P2: `_codec796 = codec_chain_video[0] = hvc1.2.4.L153.B0` (`:7883-7884`) → familia HEVC →
  `cascade.resolveTierByResolution(7680,4320,60)` = tier 12 = `L183` → guard `reqLevel(4320,60)=183` ✓ (`:2557-2559`).
- `CODECS` P3–P5: sin probe y no premium y perfil ∈ {P3,P4,P5} ⇒ `_codec796_csv='avc1.640029'` (`:10236-10238`) →
  familia AVC → `r.w>=7680 ⇒ 'avc1.64003E'` (`:2549`).
- `BANDWIDTH` P0 = `max(200 kbps×1000, 15 000 000)` = `200 000 000`; P5 = `max(2 000×1000, 4 000 000)` = `4 000 000`.

> ### ⚠️ Observación grave de coherencia (nueva, derivada de este contrato)
> **P3/P4/P5 emiten `avc1.64003E` sobre `RESOLUTION=7680x4320` mientras el SSOT los define como
> `SDR` / `bit_depth=8` / `codec_full=avc1.*`.** Se declara **HDR PQ sobre un perfil SDR de 8 bits**. El
> `VIDEO-RANGE=PQ` de P3-P5 contradice `settings.video_range = "SDR"` del propio SSOT; el override
> incondicional (`:2576-2581`, `pqAllowed = fakeActive ? true : …`) ignora el `video_range` del perfil.
> Esto es coherente con la doctrina del propietario (PQ incondicional) pero **incoherente con el SSOT**, y sobre
> `avc1` es el escenario de color-shift/pantallazo documentado.

---

## 5. CONTRATO POR PERFIL — si se respetara el SSOT (`window.APE_FAKE_UHD = 0`)

Mismo código, `fakeMode='0'` ⇒ `rr = settings.resolution`, `r.fakeUhd=false`, `pqAllowed` cae al gate (PQ sólo si
HDR probado). Es el contrato **comparable 1:1 con el Excel**:

| Perfil | `RESOLUTION` (=SSOT) | `FRAME-RATE` | `CODECS` (reqLevel) | `VIDEO-RANGE` | ¿Coincide con SSOT? |
|---|---|---:|---|---|---|
| **P0** | `7680x4320` ✓ | `60.000` (SSOT 120) | `hvc1.2.4.L183.B0` | `PQ` | RES ✓ · FPS ✗ · CODEC ✗ (SSOT `dvh1.08.06`) |
| **P1** | `7680x4320` ✓ | `60.000` | `hvc1.2.4.L183.B0` | `PQ` | RES ✓ · FPS ✗ · CODEC ✗ (SSOT `L153`) |
| **P2** | `3840x2160` ✓ | `60.000` | `hvc1.2.4.L153.B0` | `PQ` | RES ✓ · FPS ✗ · CODEC ✗ (SSOT `L150`) |
| **P3** | `3840x2160` ✓ | `60.000` | `avc1.640033` | — | RES ✓ · CODEC ✗ (SSOT `hvc1.1.6.L120` / `hvc1.2.4.L120`) |
| **P4** | `3840x2160` ✓ | `60.000` | `avc1.640033` | — | RES ✓ · CODEC ✗ (SSOT `avc1.64001f`) |
| **P5** | `3840x2160` ✓ | `60.000` | `avc1.640033` | — | RES ✓ · CODEC ✗ (SSOT `avc1.42c01e`) |

**Lectura:** con fake-8K desactivado, la `RESOLUTION` sí coincide 1:1 con el SSOT en los 6 perfiles ✅.
`FRAME-RATE` y `CODECS` **nunca** coinciden: el primero por el clamp doctrinal a 60, el segundo porque la rama 796
usa `codec_chain_video[0]` (idéntico para todos: `hvc1.2.4.L153.B0`) y **no** `codec_full` (que sí es distinto por
perfil) ni `codec_string`.

---

## 6. Contraste 1:1 atributo ↔ clave JSON ↔ resultado (tabla de veredicto)

| Atributo emitido | Clave del SSOT que **debería** mandar | Lo que realmente manda hoy | Veredicto |
|---|---|---|---|
| `RESOLUTION` | `settings.resolution` | `fakeMode` ⇒ **`7680x4320` fijo** | ❌ **override total** (F-APP-04) |
| `FRAME-RATE` | `settings.fps` = 120 | `Math.min(120, 60)` = **60** | ⚠️ clamp doctrinal, declarado (F-APP-08) |
| `CODECS` (vídeo) | `settings.codec_full` (P0 `dvh1.08.06`, P2 `L150`, P3 `hvc1.1.6.L120`, P4 `avc1.64001f`, P5 `avc1.42c01e`) | `codec_chain_video[0]` = **`hvc1.2.4.L153.B0` para los 6** | ❌ **un SSOT distinto** |
| `CODECS` (audio) | `settings.codec_chain_audio[0]` = `mp4a.40.2` | `_codecAudio` = `mp4a.40.2` | ✅ **coincide** |
| `BANDWIDTH` | `settings.bandwidth_max` / `bandwidth_target` | `max(bitrate×1e6, prisma_floor)` | ❌ magnitud distinta (P0: **200 M** emitido vs 80 M `bandwidth_max`) |
| `AVERAGE-BANDWIDTH` | `settings.avg_bandwidth_ratio` = `0.78` | `× 0.85` **literal** | ❌ drift menor (0.85 vs 0.78) |
| `VIDEO-RANGE` | `settings.video_range` (P3-P5 = `SDR`) | `PQ` incondicional | ❌ contradice el SSOT (decisión del propietario) |
| `HDCP-LEVEL` | `settings.hdcp_level` (ausente) | `APE_HDCP_PROFILE[chId] \|\| 'TYPE-1'` | ⚠️ runtime, doctrinal (F-APP-14) |
| `COLOR-PRIMARIES`/`TRANSFER`/`MATRIX` | `settings.color_*` | `cfg.color_primaries \|\| 9` (rama A) / truth (rama C) | ✅ ligado |
| `SUPPLEMENTAL-CODECS` | (sólo si probe lo verifica) | solo si `supplementalCodecsVerified` | ✅ correcto |
| `STABLE-VARIANT-ID` | — | `<chId>_<profile>` | ✅ correcto (anti ABR yoyo) |
| Headers `X-ABR-*`, `X-Low-Latency-*`, `X-Stall-*` | `hlsjs.*` / `optimized_knobs.*` (17 mappings) | `_fillSemanticHeadersFromLAB` | ✅ **el mejor binding de la APP** |
| `#EXTVLCOPT` (~133) | `vlcopt.*` | `getProfile().vlcopt` | ✅ ligado |
| `#KODIPROP` (~103) | `kodiprop.*` | `getProfile().kodiprop` | ✅ ligado (JS) / ❌ PHP (F-APP-09) |
| `#EXT-X-APE-FLOOR-FUSE` | `prisma_lab_sync_v20.profile_attributes` | `getPrismaFloorBpsForProfile` etc. | ✅ ligado |

---

## 7. Contraste con el RESOLVER PHP (mismo canal, otra lista)

`resolve_quality_unified.php` → `buildStreamInf()` (`:5514-5522`), para `ct=sports|default` (`fps=120`):

```
#EXT-X-STREAM-INF:BANDWIDTH=160000000,AVERAGE-BANDWIDTH=160000000,RESOLUTION=3840x2160,FRAME-RATE=120.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",HDR=PQ,VIDEO-RANGE=PQ,AUDIO="aac_atmos",CLOSED-CAPTIONS=NONE,SUBTITLES="subs"
```

| Atributo | Frontend (rama D, P0) | Backend (sports/default) | ¿Iguales? |
|---|---|---|---|
| `RESOLUTION` | `7680x4320` | `3840x2160` | ❌ |
| `FRAME-RATE` | `60.000` | `120.000` | ❌ |
| `CODECS` | `hvc1.2.4.L183.B0,mp4a.40.2` | `hvc1.2.4.L153.B0,mp4a.40.2` | ❌ |
| `BANDWIDTH` | `200 000 000` | `160 000 000` | ❌ |
| `VIDEO-RANGE` | `PQ` | `PQ` | ✅ |
| Atributos extra | `HDCP-LEVEL`,`STABLE-VARIANT-ID` | `HDR=PQ`,`AUDIO`,`CLOSED-CAPTIONS`,`SUBTITLES` | ❌ (**`HDR=` no es atributo HLS válido**; `AUDIO`/`SUBTITLES` referencian GROUP-ID inexistentes) |
| Cumple Ley Cardinal 1 | ✅ (nivel 183 para 4320@60) | ❌ **`L153` para 4320@120** | ❌ |

**Consecuencia operativa:** el mismo canal produce **dos declaraciones incompatibles** según lo resuelva el
frontend o el backend. Un player que reciba una u otra puede comportarse distinto (ABR, selección de decoder).

---

## 8. Las TRES verdades que compiten (y cuál gana en cada rama)

| Verdad | Dónde vive | Quién la usa |
|---|---|---|
| **V1 · Excel/JSON LAB** | `lab_master_22.6.0.json` | rama D **sólo** para resolución/fps (y de hecho la resolución se pisa) |
| **V2 · Cascada CSV** | `ape-hevc-cascade.js:27-39` (13 tiers) | rama D para `CODECS` (vía `codec_chain_video[0]` → `resolveTierByResolution`) y `#EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1` |
| **V3 · Literales del emisor** | `_mqBwMap`/`_mqResMap`/`_mqVideoChain` (`:9996-10001`), `buildStreamInf` PHP (`:5514`), `DEFAULT_PROFILES` (`ape-profiles-config.js:322`) | ramas A y B, y todo el backend PHP |

**Ganador por rama:** D → **V2** manda en `CODECS`, V1 en `RESOLUTION`(pisada) y `fps`(clampada) ·
B → **V3** total · A → **V3** con `cfg.codec_string` de V1 si existe · C → V1 (truth).

**Riesgo de fondo:** V2 (el CSV) y V1 (el Excel) **no tienen binding automático**. Si el Excel recalibra niveles,
el CSV queda viejo y la lista sigue emitiendo V2. **No hay test que detecte esa divergencia.**

---

## 9. Aserciones machine-checkable propuestas (para el gate de CI)

```js
// A1 · Ley Cardinal 1 sobre TODA línea STREAM-INF de la lista
const req = (h,f) => h>=4320 ? (f>100?186:f>=50?183:180)
               : h>=2160 ? (f>60?156:f>=50?153:150)
               : h>=1440 ? 150 : h>=1080 ? (f>=50?123:120)
               : h>=720  ? 93  : h>=540 ? 90 : h>=360 ? 63 : 30;
for (const si of streamInfs) {
  const h = +src.res.split('x')[1], f = +src.frameRate;
  const lvl = +/\.L(\d+)\./.exec(src.videoCodec)[1];
  assert(lvl >= req(h,f), `L${lvl} no carga ${src.res}@${f}`);
}

// A2 · GOLDEN RULE
assert(!/hev1|hev2/.test(streamInfLine));                    // hvc1.* SOLO en STREAM-INF
assert(!/#(?:KODIPROP|EXTVLCOPT|EXTHTTP):.*\bhvc1\./.test(lista)); // hvc1.* NUNCA en runtime tags

// A3 · Anti-509 / single-URL
assert(!/EXT-X-MEDIA[^\n]*URI=/.test(lista));
assert(!/I-FRAME-STREAM-INF[^\n]*URI=/.test(lista));
assert(urlsPerChannel === 1);

// A4 · CMAF honesto
assert(!/EXT-X-MAP[^\n]*\.m3u8/.test(lista));

// A5 · Coherencia con el SSOT (el test que hoy NO existe)
for (const p of ['P0','P1','P2','P3','P4','P5']) {
  assert(lista[p].RESOLUTION === json.profiles_calibrated[p].settings.resolution,
    `drift RESOLUTION en ${p}`);
}
```

**Estado medido de cada aserción sobre el código actual:**

| Assert | Estado |
|---|---|
| A1 (Ley Cardinal 1) | ✅ pasaría en la rama D · ❌ **fallaría** en el resolver PHP (F-APP-01) y en `maxQualityMode` (F-APP-03) |
| A2 (GOLDEN RULE) | ✅ pasaría en JS · ❌ **fallaría** en `vps/ape_hls_generators.php:738` (F-APP-02) |
| A3 (anti-509) | ✅ pasaría en JS y PHP (una URL) · ⚠️ `STREAM-INF` duplicado en P0/P1 (F-APP-05) |
| A4 (CMAF) | ❌ **fallaría** en `ape_hls_generators.php:729` (F-APP-07) |
| A5 (coherencia SSOT) | ❌ **fallaría en 6/6 perfiles** (fake-8K, F-APP-04) |

---

## 10. Lo que NO se puede determinar estáticamente (declarado, no supuesto)

| Variable | Por qué no se puede fijar sin ejecutar | Cómo resolverlo |
|---|---|---|
| `channel._probeData` | Depende del probe real del manifest del proveedor | Ejecutar la app con un canal real |
| `window.APE_HDCP_PROFILE` / `APE_PQ_PROFILE` / `APE_IMAGE_PROFILE` | Bulk fetch a `/prisma/api/*-bulk.php` | Consultar el VPS (fuera de alcance: solo lectura) |
| `isPrismaLoaded()` | Decide `bitrate_floor_mbps` (Prisma vs fallback 14/5/2 Mbps) | Inspeccionar en runtime |
| `isAntiFreezePremium(channel)` | Decide HEVC vs `avc1.64003E` en P3-P5 | Depends del nombre de canal |
| `options.maxQualityMode` / `perceptual4kMode` | Flags del caller (`generation-controller.js`) | Inspeccionar la llamada real |
| `window.APE_FAKE_UHD` | Kill-switch de artefacto | Verificar el artefacto desplegado |

Por eso este contrato se publica como **matriz de ramas con valores deterministas por rama**, no como
"la lista sale exactamente así". Cualquier afirmación más fuerte sería inventar evidencia.

---

## 11. Veredicto del contrato de emisión

| Criterio de aceptación del mandato | Veredicto |
|---|---|
| ¿La APP emite lo que manda el SSOT? | **PARCIAL.** Headers/directivas propietarias: **sí** (excelente binding). Declaración de variante HLS (`RESOLUTION`/`FRAME-RATE`/`CODECS`/`BANDWIDTH`): **no** (3 de 4 ramas) |
| ¿Y nada más? | **NO.** Añade fake-8K, `VIDEO-RANGE=PQ` incondicional, `HDCP-LEVEL=TYPE-1`, y en PHP un `STREAM-INF` huérfano con `BANDWIDTH=384 Mbps` |
| ¿Contrato comparable 1:1 con el JSON/Excel? | **SÍ, ahora es posible**: §4, §5 y §6 dan la correspondencia atributo↔clave↔resultado, con la aritmética citada |
| ¿Cero modificaciones a producción? | ✅ confirmado — este paquete es solo texto; los 11 archivos tienen idéntico sha256 T0/T1 |
