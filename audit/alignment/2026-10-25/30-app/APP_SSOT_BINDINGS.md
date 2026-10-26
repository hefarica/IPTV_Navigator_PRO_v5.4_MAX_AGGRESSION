# APP_SSOT_BINDINGS — Qué getter / clave JSON consume cada emisor

**Task:** t6 · T5 · Auditoría de la APP
**Attempt:** `bf962cfc-3985-412c-b4a0-8fca541a817e`
**Pregunta que responde:** ¿cada tag emitido *lee* del SSOT, o *inventa*? Trazabilidad `tag → getter → clave JSON`.

**Artefacto SSOT auditado:** `IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json`
· 280 065 B · sha256 `099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4`

---

## 0. Mapa de la cadena de binding (3 saltos)

```
Excel APE_M3U8_LAB_v8_FIXED.xlsm  (SSOT real, no accesible desde este repo)
   │  macro VBA de export
   ▼
lab_master_22.6.0.json  ·  schema omega_v1
   │  fetch/import →  APE_PROFILES_CONFIG.importFromLABData(data)   [ape-profiles-config.js:4639]
   ▼
window.APE_PROFILES_CONFIG  (perfiles mergeados, en memoria)
   │  getProfile(id) / getGlobalDisneyDirectives() / getHeaderValue(...)
   ▼
EMISORES (m3u8-typed-arrays-ultimate.js · ape-hevc-cascade.js · ape-fallback-resolver.js)
   │
   ▼
lista .m3u8
```

**Punto único de ingestión:** `importFromLABData()` — `ape-profiles-config.js:4639`. **No hay segundo camino**:
ni `m3u8-typed-arrays-ultimate.js` ni `ape-hevc-cascade.js` leen el JSON directamente (0 ocurrencias de
`fetch(.*json)` ni de `JSON.parse` sobre el SSOT en esos dos archivos).

---

## 1. Claves del JSON que la APP consume — inventario completo

### 1.1 Claves raíz (18 detectadas; las 8 primeras son consumidas)

| Clave raíz | Consumida por | Línea de consumo | Efecto en la lista |
|---|---|---|---|
| `profiles_calibrated` | `ape-profiles-config.js` | `L4728` `const labProfiles = data.profiles_calibrated \|\| {}` | Merge por perfil P0–P5 → base de **todo** |
| `prisma_lab_sync_v20` | idem | `L4927-4929` | `prisma.*` (floor/fuse/target/boost) → directivas APE-FLOOR-FUSE |
| `nivel1_directives` | idem | `L4546` (doc) + `this.nivel1Directives` | Directivas globales nivel 1 (bloque cabecera) |
| `nivel3_per_layer` | idem | `L4547` (doc) + `this.nivel3PerLayer` | Directivas nivel 3 por capa |
| `servers` | idem | `L4548` (doc) → evento para `app.state` | `#EXTATTRFROMURL` / hosts |
| `evasion_pool` | idem | `L4549` (doc) → `this.evasionPool` | UA/Referer del pool Phantom Hydra |
| `config_global` | idem | `L4550` (doc) | Selectivo sobre `strategicHeaders` existentes |
| `placeholders_map` | idem | `result.placeholdersCount` (`L4658`) | Sustitución `{{PLACEHOLDER}}` |
| `lab_version`, `lab_schema_variant`, `exported_at`, `bulletproof` | `m3u8-typed-arrays-ultimate.js` | `L2754-2758` | `#EXT-X-SESSION-DATA:com.ape.lab.*` (trazabilidad) |
| `meta_per_profile.source_file` | `ape-profiles-config.js` | `L4909` | Nombre del LAB declarado |
| `scoring_metadata`, `omega_gap_plan`, `dnr_calibration`, `playlist_format`, `version` | — | **no consumidas por el emisor** | (auditoría/observabilidad) |

> **Sin binding:** `dnr_calibration` existe en el JSON y **ningún** emisor lo lee. Si contiene calibración
> activa, está huérfana. Requiere confirmación del lane SSOT (fuera de mi alcance).

### 1.2 Claves por perfil (`profiles_calibrated.<P>.*`)

Estructura medida de cada perfil (11 sub-objetos):
`{ id, name, settings, vlcopt, kodiprop, headerOverrides, hlsjs, prefetch_config, role, bounds, optimized_knobs, fitness, solver_trace, optimized_timestamp, player_enslavement, actor_injections }`

| Sub-clave | Consumidor | Destino en la lista |
|---|---|---|
| `settings.resolution` | `__apeStreamTruth({profileResolution})` L10321 → L2462 | `RESOLUTION=` de `#EXT-X-STREAM-INF` ⚠️ **pisado por fake-8K (F-APP-04)** |
| `settings.fps` | `__apeStreamTruth({profileFps})` L10322 → L2516 | `FRAME-RATE=` ⚠️ **clampado a 60 (F-APP-08)** |
| `settings.codec_full` | `_fillSemanticHeadersFromLAB` L4580 → `X-Codec-Full` | Header EXTHTTP `X-Codec-Full` |
| `settings.codec_string` | `buildChannelStreamInf(cfg)` L6840 | `CODECS=` (con fallback L153, F-APP-12) |
| `settings.codec_priority` | L4581 → `X-Codec-Priority` | EXTHTTP |
| `settings.codec_primary` | L6844 `switch (cfg.codec_primary)` | Rama del `switch` que elige `CODECS=` |
| `settings.video_range` / `video_range` | L6841 `cfg.video_range` | `VIDEO-RANGE=` |
| `settings.hdcp_level` | L6842 `cfg.hdcp_level \|\| 'NONE'` | `HDCP-LEVEL=` |
| `settings.color_primaries` / `transfer_characteristics` / `matrix_coefficients` | L6880-6882 | `COLOR-PRIMARIES=` / `TRANSFER-CHARACTERISTICS=` / `MATRIX-COEFFICIENTS=` |
| `settings.bandwidth_floor` / `_target` / `_max` | **no ligados al STREAM-INF** | ❌ el `BANDWIDTH=` sale de mapas literales (F-APP-10) |
| `settings.audio_codec` | L4582 → `X-Audio-Codec-Preferred`; L6858 `cfg.audio_codec` | EXTHTTP + sufijo de `CODECS=` |
| `settings.codec_chain_video` | L6898 `cfg.codec_chain_video \|\| …` | `#EXT-X-APE-CODEC-FALLBACK-CHAIN` / ladder |
| `settings.codec_chain_video_family` | L6897 | Ladder de familias |
| `settings.codec_chain_audio` / `_hdr` | L6899-6900 | Ladder |
| `settings.codec_chain_player_pref` | L6901 `cfg.codec_chain_player_pref` | `#EXT-X-APE-CODEC-PRIORITY` |
| `settings.peakLuminanceNits` | L4574 → `X-Tone-Mapping-Peak` | EXTHTTP |
| `settings.networkCachingMs` | L1796-1798 (getter `network`) | `#EXTVLCOPT:network-caching=` |
| `settings.buffer*`, `prefetchSegments`, `parallelFetches`, `fragLoadMaxRetry` | `getPrefetchConfig` L1561 | EXTVLCOPT / KODIPROP de buffer |
| `hlsjs.*` (10 claves) | `_fillSemanticHeadersFromLAB` L4585-4598 | Headers `X-ABR-*`, `X-Low-Latency-Mode`, `X-Stall-Detection-Ms`, `X-Fragment-*` |
| `optimized_knobs.abrBandWidthFactor` / `fragLoad_maxNumRetry` | L4589 / L4597 (**prioridad sobre `hlsjs`**) | `X-ABR-BW-Factor`, `X-Fragment-Retry-Max` |
| `vlcopt.video-tone-mapping-peak` / `-reference` / `video-bt2020` / `video-fullrange` | L4574-4577 | `X-Tone-Mapping-*`, `X-BT2020`, `X-Full-Range` |
| `vlcopt.*` (~133) | `includeLabExtras` gate | `#EXTVLCOPT:` verbatim |
| `kodiprop.*` (~103) | idem | `#KODIPROP:` verbatim |
| `headerOverrides.*` | `getHeaderValue` L5509 | Headers estratégicos |
| `player_enslavement`, `actor_injections` | no ligados en el emisor | ⚠️ presentes en SSOT, sin consumidor detectado |

---

## 2. Getters: la API real de `window.APE_PROFILES_CONFIG`

`ape-profiles-config.js` expone la instancia en **`L5977 window.APE_PROFILES_CONFIG = instance`**.
Métodos verificados (con línea de definición) y quién los llama:

| Getter | Def. | Llamado desde | Devuelve |
|---|---|---|---|
| `getProfile(profileId)` | `L5333` | `m3u8-typed-arrays-ultimate.js` **15×** (`L1558, 2593, 3248, 3541, 4854, 5516, …`) | Perfil mergeado completo (settings + vlcopt + kodiprop + headerOverrides + hlsjs + optimized_knobs) |
| `getAllProfiles()` | `L5340` | UI / profile-manager | `{P0…P5}` |
| `getGlobalDisneyDirectives()` | `L5210` | `m3u8-typed-arrays-ultimate.js:2661, 2973` | Bloque Disney-grade (`30_DISNEY_GRADE_DIRECTIVES`) |
| `isDisneyDirectivesFromLab()` | `L5226` | UI / badge de procedencia | `bool` (¿vino del LAB o del default?) |
| `getHeaderValue(profileId, headerName)` | `L5509` | `m3u8-typed-arrays-ultimate.js:5525` | Valor de header calibrado |
| `getCategories()` | `L5538` | `:5514` | Categorías PM9 |
| `getEnabledHeaders(profileId)` | `L5492` | emisor de headers | Lista activa |
| `getPm9HeaderSet()` | (usado en `:5539`) | `:5540` | Set de headers homologables a PM9 |
| `getStrategicHeader` / `getStrategicHeaderEffectiveValue` | `L5282` / `L5291` | headers-matrix | Valor efectivo |
| `getPrefetchConfig(profileId)` | (usado en `:1561`) | `:1562` | Prefetch/buffer por perfil |
| `getPrismaProfileAttrs(profileId)` | `L5080` | Floor-Fuse | `prisma` (de `prisma_lab_sync_v20`) |
| `getPrismaFloorBpsForProfile` / `getPrismaTargetBpsForProfile` / `getPrismaBoostMultiplierForProfile` | `L5084` / `L5177` / `L5184` | `#EXT-X-APE-FLOOR-FUSE` | bps calibrados |
| `getFloorFuseForProfile` | `L5120` | idem | diseño/fuse |
| `getPrismaChannelDnaDefault(key)` | `L5191` | ADN canónico | valor del DNA |
| `isPrismaLoaded()` | `L5195` | gate | `bool` |
| `getManifestConfig()` | `L5416` | cabecera de lista | config de manifest |
| `getDegradationHierarchy()` | `L5365` | cadena de degradación | jerarquía |
| `countActiveHeaders(profileId)` | `L5545` | observabilidad (`headersCount`) | número |

**Metadatos de trazabilidad** que el emisor lee del config y publica en `#EXT-X-SESSION-DATA` (`L2754-2758`):
`lab_version` · `lab_schema_variant` · `exported_at` · `bulletproof` · `labFileName`.
Y para el ADN canónico: `labDnaSha256` · `labFileName` · `labExportedAt` (`L2606-2617`, tag
`#EXT-X-APE-LAB-DNA:sha256=…`).

---

## 3. Getters de los otros módulos (contratos verificados)

### 3.1 `window.APE_HEVC_CASCADE` — `ape-hevc-cascade.js:514-530`

| Miembro | Def. | Usado por | Contrato |
|---|---|---|---|
| `resolveTierByResolution(w, h, fps, opts)` | `L176` región | `m3u8-typed-arrays-ultimate.js:2558`, `ape-fallback-resolver.js:358` | Devuelve `{ codec: 'hvc1…', codec_hev1: 'hev1…', level, tier, family }` |
| `resolveCodecForChannel(channel, profile, opts)` | — | emisor principal | Codec `hvc1` del tier activo |
| `resolveCodecHev1ForChannel(channel, profile, opts)` | `L324` | `m3u8-typed-arrays-ultimate.js:37-46` | Codec `hev1` **solo** para KODIPROP/EXTVLCOPT |
| `getCodecCascade(kind, opts)` | — | `:3765`, `:10384` | Cadena de alias de familia (`hevc,hev1,h265,…`) |
| `isAntiFreezePremium(channel, profile)` | — | `:10216`, `ape-fallback-resolver.js:524` | `bool` — premium **sin** tokens cosméticos (`fhd`,`hevc`,`h265` excluidos) |
| `isPremiumChannel(channel)` | `L395` región | fallback compat `:10220`, `:525` | `bool` — premium clásico |

**Verificado:** `VERSION: '1.2.0-dual-hvc1-hev1-20260522'`, `CSV_SOURCE: 'Tier-CodecHvc1-CodecHev1-Profile-Level-Capacidad-Rol.csv'`.
⚠️ **Este CSV es un SSOT paralelo al Excel**: 13 tiers con `codec`/`codec_hev1`/`width`/`height`/`fps`. Si el
Excel recalibra niveles, el CSV debe recalibrarse a mano. **No hay binding automático entre ambos.**

### 3.2 `window.APEFallbackResolver` — `ape-fallback-resolver.js:669-681`

`resolveMaxQualityFallback`, `emitStreamInfFromTruth`, `emitApeFallbackTags`, `getAuditSummary`,
`resetAuditSummary`, `classifyHevcCodec`, `scoreVariant`, `computeProbeConfidence`,
`detectProbeContradictions`, `isPremiumChannel`, `isLikelyFhdOrSports`.

| Función | Entrada | Salida |
|---|---|---|
| `resolveMaxQualityFallback(channel, profile, probeData)` | canal + perfil + probe | `truth{tier, codec, canEmitStreamInf, *Verified, videoRange, hdcpLevel, …}` |
| `emitStreamInfFromTruth(truth)` | truth | Línea `#EXT-X-STREAM-INF:` o `null` |
| `emitApeFallbackTags(truth)` | truth | Array de ~15 tags `#EXT-X-APE-*` |

### 3.3 Mapas per-canal precargados en `window` (bulk fetch, no SSOT-LAB)

| Global | Origen server-side | Consumidor | Semántica |
|---|---|---|---|
| `window.APE_HDCP_PROFILE[chId]` | `/prisma/api/channel-hdcp-bulk.php` | `:10101`, `ape-fallback-resolver.js:595` | `'TYPE-1'` / `'NONE'` por canal (HDCP-Adaptive Engine) |
| `window.APE_PQ_PROFILE[chId]` | `/prisma/api/channel-pq-bulk.php` | `ape-fallback-resolver.js:563` | `'SDR'` = rollback PQ→SDR per-canal |
| `window.APE_IMAGE_PROFILE[chId]` | observer Lua del VPS | `:10262` | `{bw_observed, cascade_type}` evidencia empírica |
| `window.APE_FAKE_UHD` | artefacto (kill-switch) | `:10339-10342` | `'8k'`(default) / `'4k'` / `'0'` |
| `window.APE_PQ_UNCONDITIONAL` · `APE_PQ_UNIVERSAL_ROUTE` | artefacto | `:10333-10334` | Gate de `VIDEO-RANGE=PQ` |

> Estos 5 son **estado de runtime del VPS/telemetría**, no calibración del LAB. Su binding es correcto por diseño
> (una URL/endpoint concreto, con default doctrinal), pero **no** están versionados en el Excel: reconstruir una
> lista idéntica exige el mismo estado server-side.

---

## 4. Binding del resolver PHP — el punto más débil de la cadena

**Archivo:** `backend/resolve_quality_unified.php` (7 468 líneas)

| Pregunta | Respuesta medida |
|---|---|
| ¿Lee `profiles_calibrated`? | **NO.** 0 ocurrencias de `profiles_calibrated`/`LAB_CALIBRATED` en el archivo |
| ¿Lee el JSON del LAB? | **NO** por sí mismo. Solo indirectamente vía `LabConfigLoader::m3u8DirectiveLines()` (`L5968`) |
| ¿De dónde salen codec/resolución/bitrate? | `private const PROFILES` **L4856-4863** (hardcoded) + `buildStreamInf()` **L5514-5522** (hardcoded) + `RQ_MAX_BW` L9 + `RQ_MAX_NITS` L8 |
| ¿Cuántas directivas asume por sí mismo? | 9 bloques completos (`reconstruct()` L4868-4914): EXTHTTP, KODIPROP, EXTVLCOPT, EXTATTRFROMURL, `#EXT-X-APE` ("todas las 606 doctrinas", L4892), `#EXT-X-CORTEX`, `#EXT-X-TELCHEMY`, STREAM-INF, VNOVA-LCEVC |
| ¿Depende del frontend? | **NO** ✅ — el resolver es autosuficiente: recibe `payload`+`streamUrl` y reconstruye el bloque completo |

**Veredicto sobre el criterio (e) del mandato** — «el resolver PHP asume el 100 % de las directivas sin depender
del frontend»:

> ✅ **CUMPLE la independencia del frontend.**
> ❌ **NO CUMPLE el binding al SSOT**: asume el 100 % de las directivas *desde su propio código*, no desde el
> Excel. Codec, resolución, bitrate y nivel son constantes PHP. Esto es coherente con la doctrina
> `iptv-no-hardcode-doctrine` sólo si esos valores fueran *identidad*, y no lo son: son **calibración**.

**Único punto de binding real** (`L5966-5969`):
```php
5966: // Source: vps/prisma/config/m3u8_directives_config.json via LabConfigLoader.
5968: $disney_lines = (class_exists('LabConfigLoader') && method_exists('LabConfigLoader', 'm3u8DirectiveLines'))
5969:     ? LabConfigLoader::m3u8DirectiveLines()
```
Ese loader lee `vps/prisma/config/m3u8_directives_config.json` — **la semilla del bloque Disney**, no los perfiles.

**Consecuencia medible:** el mismo canal resuelto por el frontend y por el backend puede declarar cosas distintas:

| Campo | Frontend (`__apeStreamTruth`) | Backend (`buildStreamInf`) |
|---|---|---|
| `RESOLUTION` | perfil del SSOT → pisado a `7680x4320` (fake-8K) | `3840x2160` **fijo** |
| `CODECS` | `<familia del tier>.L<reqLevel>` **calculado** | `hvc1.2.4.L153.B0` **fijo** |
| `FRAME-RATE` | `min(SSOT, 60)` | `$profile['fps']` = **120** para sports/default |
| `BANDWIDTH` | mapas JS por perfil | `RQ_MAX_BW` = 160 000 000 |
| `VIDEO-RANGE` | `PQ` (o `SDR` si rollback) | `PQ` fijo |

**Esto no es un matiz:** `FRAME-RATE=120` + `L153` **sí** viola la Ley Cardinal 1 (F-APP-01), y el frontend
**no** lo hace gracias a `__apeStreamTruth`. La divergencia de `RESOLUTION`/`CODECS` es F-APP-06.

---

## 5. Binding de `vps/ape_hls_generators.php`

| Valor | Fuente | ¿SSOT? |
|---|---|---|
| `max_bw` | `$cfg['max_bw'] ?? 15150000` | ⚠️ default hardcodeado |
| `bitrate` | `$cfg['bitrate'] ?? 10100` | ⚠️ default hardcodeado (¡en kbps, se multiplica ×1000!) |
| `res` | `$cfg['res'] ?? '1920x1080'` | ⚠️ default hardcodeado |
| `fps` | `$cfg['fps'] ?? 120` | ⚠️ **default 120** → dispara F-APP-01/02 |
| `codec_primary` | `$cfg['codec_primary']` | Parcial, pero el `CODECS` resultante es literal (F-APP-02) |
| Bloque Disney | `LabConfigLoader::m3u8DirectiveLines()` L183-184 | ✅ único binding real |
| DASH `<Representation>` | literales L441-450 | ❌ cero binding |

`rq_streaming_health_engine.php`: **0 binding SSOT y 0 literales calibrados** — correcto para un motor de salud
que no emite manifest.

---

## 6. Tabla resumen: ¿está el SSOT realmente al mando?

| Tag emitido | ¿Lee del SSOT? | Cómo | Riesgo |
|---|---|---|---|
| `#EXTINF` (nombre, tvg-*) | ⚠️ del canal, no del LAB | `channel.*` | correcto por diseño |
| `#EXTHTTP` (~40 headers) | ✅ **SÍ** | `getHeaderValue` / `headerOverrides` / `_fillSemanticHeadersFromLAB` | **el binding más sólido de la APP** |
| `#EXTVLCOPT` (~133) | ✅ **SÍ** | `getProfile().vlcopt` (gate `includeLabExtras`) | sólido |
| `#KODIPROP` (~103) | ✅ **SÍ** en JS | `getProfile().kodiprop` | ❌ PHP no (F-APP-09) |
| `#EXT-X-APE-CODEC-*` | ✅ **SÍ** | `settings.codec_chain_*`, `_getHev1ForChannel` | sólido |
| `#EXT-X-APE-FLOOR-FUSE` | ✅ **SÍ** | `getPrismaFloorBpsForProfile`, `getFloorFuseForProfile` | sólido |
| `#EXT-X-SESSION-DATA:com.ape.lab.*` | ✅ **SÍ** | `lab_version`…`labFileName` | trazabilidad correcta |
| `#EXT-X-APE-LAB-DNA` | ✅ **SÍ** | `labDnaSha256` (o `unverified` declarado) | correcto por diseño |
| **`RESOLUTION=`** | ❌ **NO** | pisado por fake-8K (JS) / literal (PHP) | **F-APP-04 / F-APP-06** |
| **`FRAME-RATE=`** | ❌ **NO** | clamp 60 (JS) / literal 120 (PHP) | **F-APP-08 / F-APP-01** |
| **`BANDWIDTH=`** | ❌ **NO** | mapas JS + `RQ_MAX_BW` + 5 100 000 | **F-APP-10 / F-APP-13** |
| **`CODECS=`** | ⚠️ **parcial** | `codec_string` sí; `L153` literal si falta | **F-APP-01/02/03/12** |
| `VIDEO-RANGE=` | ⚠️ doctrina, no SSOT | `video_range` con override PQ incondicional | decisión del propietario 2026-06-16 |
| `HDCP-LEVEL=` | ⚠️ runtime, no SSOT | `APE_HDCP_PROFILE[chId] \|\| 'TYPE-1'` | F-APP-14 (doctrina 2026-05-19) |
| `SUPPLEMENTAL-CODECS=` | ✅ **SÍ** (solo verificado) | `truth.supplementalCodecsVerified` | cero fabricación ✅ |
| `COLOR-PRIMARIES` / `TRANSFER` / `MATRIX` | ✅ **SÍ** | `settings.color_*` | sólido |

**Diagnóstico de una línea:** la APP tiene **dos capas**. La capa de *headers y directivas propietarias*
está excelentemente ligada al SSOT. La capa de **declaración de variante HLS** (`RESOLUTION`, `FRAME-RATE`,
`BANDWIDTH`, `CODECS`) **no lo está** en 3 de 4 emisores, y es justo la capa donde vive el riesgo de freeze.

---

## 7. Binding faltante que el SSOT ya tiene y nadie lee

| Clave del SSOT | Estado |
|---|---|
| `settings.bandwidth_floor` / `bandwidth_target` / `bandwidth_max` | **Sin consumidor** en el STREAM-INF (solo `_mqBwMap` literal) |
| `settings.avg_bandwidth_ratio` (`"0.78"`) | **Sin consumidor** (el emisor usa `* 0.8` y `* 0.85` literales) |
| `settings.maxResolution` / `maxBitrateKbps` / `targetFps` | **Sin consumidor** |
| `settings.segment_duration_s` | **Sin consumidor** directo |
| `player_enslavement`, `actor_injections`, `bounds`, `fitness`, `solver_trace` | **Sin consumidor** en el emisor |
| `dnr_calibration` (raíz) | **Sin consumidor** |

Cerrar estos 6 huecos convertiría `RESOLUTION`/`FRAME-RATE`/`BANDWIDTH` en SSOT-driven sin cambiar nada más.
Es el fix de mayor relación valor/riesgo de toda la auditoría.
