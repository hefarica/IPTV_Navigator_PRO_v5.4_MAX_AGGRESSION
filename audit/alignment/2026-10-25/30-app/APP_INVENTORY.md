# APP_INVENTORY — Inventario de la APP (generador M3U8 + perfiles + resolver PHP)

**Task:** t6 · T5 · Auditoría de la APP
**Attempt:** `bf962cfc-3985-412c-b4a0-8fca541a817e`
**Fecha de medición:** 2026-10-25 (America/Bogota)
**Modo:** SOLO LECTURA sobre producción. Cero bytes escritos fuera de `audit/alignment/2026-10-25/30-app/`.
**cwd:** `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION`

---

## 0. Integridad de la medición (regla del capitán: sha256 + mtime antes de citar)

Se tomaron **dos** snapshots (T0 al inicio, T1 al cierre). **Los 11 archivos son byte-idénticos entre T0 y T1** →
ningún archivo cambió durante la auditoría. Ninguna cita de este paquete es un falso positivo por lectura
inconsistente.

| Archivo | Bytes | Líneas | mtime (ISO local) | SHA-256 | Estable T0→T1 |
|---|---:|---:|---|---|---|
| `m3u8-typed-arrays-ultimate.js` | 746 967 | 11 570 | 2026-10-25T21:52:01.961 | `2315184ED4CDBCDB8FD78C5E55B72090D57AC14153FBAA442A76F0E0D5C1B1BB` | ✅ |
| `ape-profiles-config.js` | 367 765 | 6 003 | 2026-10-25T20:09:30.561 | `71776A019BD8C566A69EF729FED026839FCCA37DCA439D8AEFFFDA8911BFEC20` | ✅ |
| `ape-hevc-cascade.js` | 35 801 | 566 | 2026-06-08T08:32:23.272 | `4B6B16700208C5C967FB9025D377A06347EFB9171AA590F583893F8757CE443C` | ✅ |
| `ape-fallback-resolver.js` | 32 039 | 689 | 2026-06-16T08:53:08.265 | `2275DC5FB1872A2FD32C3762FA31E8728AE952127FEDE86BA673CC7BA4887A68` | ✅ |
| `ape-quality-prober.js` | 28 699 | 636 | 2026-05-19T13:03:43.825 | `6774BA0777A116DA8A7658BA5D2795EE1FA64CFFC1B7121977AD3C68D8272ABC` | ✅ |
| `gateway-manager.js` | 66 283 | 1 349 | 2026-04-26T16:52:01.646 | `4FC796B310342FC9E1321F7E7CF415790E66CEB869753F261E147357F7CF670F` | ✅ |
| `resolve_quality_unified.php` | 348 758 | 7 468 | **2026-10-25T21:35:16.142** | `20AC4B2631C1E877A3DE92B4E479B6C2EFA171AD1A317869F9343A99C3C5F2B5` | ✅ |
| `rq_streaming_health_engine.php` | 13 931 | 260 | 2026-04-06T01:01:25.282 | `E0E405FA18F0157DA6AD5CB441C8BF94B2BBB7AA473BA585F1BE76CAA82C9BBB` | ✅ |
| `ape_hls_generators.php` | 39 678 | 748 | 2026-05-23T00:46:40.787 | `2AC913221A53AD8B5963A91BFD21D9938C7FCC36451C1B346467BBE16960AA5E` | ✅ |
| `index-v4.html` | 266 355 | 4 694 | 2026-10-24T22:16:40.312 | `103093BE445D5AC5F91D8C2C32F7515C32EF4484C59D3E497C229B9B393F4E3F` | ✅ |
| **`lab_master_22.6.0.json`** (SSOT consumido) | 280 065 | — | **2026-08-30T21:13:39.531** | `099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4` | ✅ |

**Notas de integridad**
- `m3u8-typed-arrays-ultimate.js` (21:52) y `resolve_quality_unified.php` (21:35) son los dos archivos tocados hoy → coinciden con el aviso del capitán (t44 escribió a las 21:52). Ambos estables durante la ventana de auditoría.
- `lab_master_22.6.0.json`: el capitán lo reportó como "escrito hoy 21:13"; el **mtime medido es 2026-08-30T21:13:39.531** (misma hora, día distinto). Se reporta la medición, no la suposición. Contenido citado por sha256 `099A1707…FD4`.
- Ninguno de los 11 archivos fue modificado por esta tarea.

---

## 1. Cadena real de la APP (medida, no supuesta)

```
frontend/index-v4.html
  ├─ L3612  js/gateway-manager.js            (upload + SHIELDED rename)   ← carga PRIMERO
  ├─ L3906  js/ape-v9/ape-profiles-config.js (SSOT consumer + PM9 defaults)
  ├─ L3930  js/ape-v9/ape-quality-prober.js  (evidencia empírica / manifest fetch)
  ├─ L3969  js/ape-v9/ape-hevc-cascade.js    (cascada 13-tier CSV, SSOT paralelo)
  ├─ L3971  js/ape-v9/ape-fallback-resolver.js (F0–F5 + emitStreamInfFromTruth)
  ├─ L3972  js/ape-v9/m3u8-typed-arrays-ultimate.js  (emisor principal, 11 570 líneas)
  └─ L3978  js/ape-v9/generation-controller.js (orquestador prepublish → generate)

backend/resolve_quality_unified.php   (resolver server-side, 7 468 líneas)
  └─ class OmegaAbsoluteReconstructor  → 9 BLOQUES por canal (EXTHTTP, KODIPROP, EXTVLCOPT,
     EXTATTRFROMURL, EXT-X-APE, EXT-X-CORTEX, EXT-X-TELCHEMY, STREAM-INF, VNOVA-LCEVC)

vps/ape_hls_generators.php            (generador HLS/DASH del lado VPS, 748 líneas)
```

### 1.1 Orden de carga — hallazgo de contrato documental

`CLAUDE.md` ("Orden de carga obligatorio") declara:

```
ape-fallback-resolver.js → ape-quality-prober.js → m3u8-typed-arrays-ultimate.js
```

`index-v4.html` carga en realidad:

```
ape-quality-prober.js (L3930) → ape-hevc-cascade.js (L3969) → ape-fallback-resolver.js (L3971) → m3u8-typed-arrays-ultimate.js (L3972)
```

**Clasificación: divergencia documental MENOR, no defecto.** Las dependencias reales quedan satisfechas porque
(i) `ape-hevc-cascade.js` (L3969) se evalúa **antes** de `ape-fallback-resolver.js` (L3971), que es su único
consumidor duro (`window.APE_HEVC_CASCADE`, usado en `resolver:523,527,354,402`), y (ii) todo acceso a
`window.APE_QUALITY_PROBER` es en tiempo de llamada, no de carga. Pero el contrato escrito en `CLAUDE.md`
**no describe la realidad** → corrige la documentación, no el HTML.

**Anomalía adicional:** `index-v4.html:4086` carga `js/ape-v9/ape-engine-v9.js`, que mide **0 bytes**
(archivo vacío). No rompe (script vacío = no-op) pero es un módulo fantasma en la cadena de carga.

---

## 2. Inventario por archivo (rol real verificado)

### 2.1 `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` — EMISOR PRINCIPAL

| Aspecto | Medición |
|---|---|
| Rol | Emisor de la lista `.m3u8` (una entrada por canal) |
| Exporta | `window.APE_M3U8Generator` (vía IIFE; también `module.exports` en Node) |
| Función clave | `__apeStreamTruth()` L2441–2583 — **fuente única** `{w,h,fps} → RESOLUTION + CODECS + FRAME-RATE` |
| Emisores STREAM-INF | **4 rutas distintas** (ver `APP_EMISSION_CONTRACT.md` §2): L6875 (cfg), L10008 (`maxQualityMode`), L10370 (ruta 796/truth), y `emitStreamInfFromTruth` del resolver |
| Salida I-FRAME | L3061 (cabecera global, hardcoded) y L9949 (por canal, sin URI) |
| Depende de | `window.APE_PROFILES_CONFIG` (109 refs), `window.APE_HEVC_CASCADE`, `window.APEFallbackResolver`, `window.APE_*_PROFILE` (HDCP/PQ/IMAGE) |

### 2.2 `frontend/js/ape-v9/ape-profiles-config.js` — CONSUMIDOR DEL SSOT

| Aspecto | Medición |
|---|---|
| Rol | Único punto de ingestión del JSON `LAB_CALIBRATED_*` / `lab_master_*.json` |
| Entrada | `importFromLABData(data, options)` L4639 |
| Claves JSON que lee | `profiles_calibrated` L4728; `prisma_lab_sync_v20` L4927; `meta_per_profile.source_file` L4909 |
| Homologación | `_fillSemanticHeadersFromLAB()` L4571 — 17 mappings `LAB section.key → PM9 header` (no transforma, no clampa, solo llena blancos) |
| Defaults propios | `codec_ladder_hev1` L347/982/1616/2110/2744/3378, `codec_chain_player_pref` L350/985/1619/2113/2747 |
| Expone | `window.APE_PROFILES_CONFIG` L5977 |

### 2.3 `frontend/js/ape-v9/ape-hevc-cascade.js` — SSOT PARALELO (CSV)

| Aspecto | Medición |
|---|---|
| Rol | Cascada HEVC 13-tier; resuelve tier por resolución |
| Fuente declarada | `CSV_SOURCE: 'Tier-CodecHvc1-CodecHev1-Profile-Level-Capacidad-Rol.csv'` L515 |
| Version | `'1.2.0-dual-hvc1-hev1-20260522'` L514 |
| API | `resolveCodecForChannel`, `resolveCodecHev1ForChannel` L324, `resolveTierByResolution`, `getCodecCascade`, `isAntiFreezePremium`, `isPremiumChannel` |
| Dualidad | Cada tier emite par `codec` (`hvc1.*`) + `codec_hev1` (`hev1.*`) L27–39 → **GOLDEN RULE estructuralmente garantizada** |

### 2.4 `frontend/js/ape-v9/ape-fallback-resolver.js` — DECISIÓN F0–F5

| Aspecto | Medición |
|---|---|
| Rol | Resolver de tier (F0…F5), truth object, y `emitStreamInfFromTruth()` L542 |
| Tabla bitrate | `getBitrateFallback()` L36 `'3840x2160' → {28 000 000 / 22 000 000}` (coincide con `CLAUDE.md`) |
| Salida STREAM-INF | `emitStreamInfFromTruth` L542–613: BANDWIDTH, AVERAGE-BANDWIDTH, RESOLUTION, FRAME-RATE, CODECS, VIDEO-RANGE, (COLOR-PRIMARIES/TRANSFER/MATRIX si ≠SDR), SUPPLEMENTAL-CODECS (solo si verificado), HDCP-LEVEL, STABLE-VARIANT-ID |
| F5 | `buildF5OriginalDirectSafe` → `canEmitStreamInf` false ⇒ **0 STREAM-INF**, solo EXTINF + URL ✅ |

### 2.5 `frontend/js/ape-v9/ape-quality-prober.js` — EVIDENCIA

| Aspecto | Medición |
|---|---|
| Rol | Probe del manifest HLS real (`videoCodec`, `resolution`, `frameRate`, `videoRange`, `supplementalCodecs`, `hdcpLevel`, `_crossValidation`, `llhlsData`) |
| Contrato | Todo dato que el emisor marca `*Verified:true` debe venir de aquí. Es el único origen legítimo de "REAL". |

### 2.6 `frontend/js/gateway-manager.js` — UPLOAD + SHIELDED

| Aspecto | Medición |
|---|---|
| Rol | `upload_chunk.php` L617 + `finalize_upload.php` L636 |
| SHIELDED | L730–745: renombra `X.m3u8 → X_SHIELDED.m3u8` **solo el nombre de archivo**, jamás la URL → **doctrina SHIELDED cumplida** |
| Literales calibrados | **0** de los 8 patrones auditados (`hvc1.`, `avc1.`, `dvh1`, `VIDEO-RANGE`, `HDCP-LEVEL`, `SUPPLEMENTAL-CODECS`, `L153`, `3840x2160`) — archivo limpio |

### 2.7 `backend/resolve_quality_unified.php` — RESOLVER PHP

| Aspecto | Medición |
|---|---|
| Versión | `RQ_VERSION = '22.6.0-MEMC-TOTAL-8K120'` L446 |
| Reconstructor | `class OmegaAbsoluteReconstructor` L4853; `reconstruct()` L4868 → 9 bloques |
| Tabla de perfiles | `private const PROFILES` L4856–4863 (**hardcoded**, por tipo de contenido: sports/cinema/news/kids/documentary/default) |
| STREAM-INF | `buildStreamInf()` L5514 — **100 % hardcoded** salvo `fps` |
| Binding SSOT | **Solo** `LabConfigLoader::m3u8DirectiveLines()` L5968 (bloque Disney desde `vps/prisma/config/m3u8_directives_config.json`). **Cero** binding a `profiles_calibrated` |
| 1 URL/canal | ✅ `L4846` y `L5642` añaden exactamente `$url` tras los bloques |
| `EXT-X-MEDIA URI=` | **0 ocurrencias** (solo `#EXT-X-MEDIA-SEQUENCE`) ✅ |

### 2.8 `backend/rq_streaming_health_engine.php` (260 líneas)

| Aspecto | Medición |
|---|---|
| Rol | Motor de salud de streaming (health checks) |
| Literales calibrados | **0** de los 8 patrones ✅ |
| Binding SSOT | Ninguno (no emite manifest) — correcto para su rol |

### 2.9 `vps/ape_hls_generators.php` (748 líneas)

| Aspecto | Medición |
|---|---|
| Rol | Generador HLS/DASH del lado VPS |
| Emite | `#EXTM3U`, `#EXT-X-VERSION:7`, `#EXT-X-MAP`, `#EXT-X-STREAM-INF`, y un manifest DASH `<MPD>` completo |
| STREAM-INF | L741–742 con `CODECS="hev1.2.4.L153.B0,mp4a.40.2"` → **GOLDEN RULE violada** (ver findings) |
| CMAF | L729 `#EXT-X-MAP:URI="{$providerM3u8}"` → apunta a un **`.m3u8`**, no a `init.mp4` → CMAF declarado sin init real |
| Binding SSOT | Parcial: `$cfg['max_bw'/'bitrate'/'res'/'fps'/'codec_primary']` con **defaults hardcoded** |

### 2.10 `backend/cmaf_engine/` (36 archivos)

| Subgrupo | Archivos con literales calibrados | Nota |
|---|---|---|
| Motores PHP | `dual_manifest_generator.php` (20), `universal_codec_protocol_engine.php` (18), `telchemy_tvqm_engine.php` (10), `ai_super_resolution_engine.php` (9), `ape_omni_orchestrator_v18.php` (4), `cmaf_integration_shim.php` (3), `graceful_degradation_engine.php` (1), `hdr10plus_dynamic_engine.php` (2 comentarios) | Tablas de codec **por resolución** (dato calibrado legítimo por diseño), no por perfil LAB |
| Tests | `test_universal_compat.py` (8) | Solo aserciones de test ✅ |

**`cmaf_engine` no participa en la ruta de emisión de la lista del generador** (no está referenciado desde
`index-v4.html` ni desde `resolve_quality_unified.php` en la ruta caliente). Se audita como capa VPS/backend
independiente.

---

## 3. Superficie de hardcode — conteo bruto (8 patrones del contrato)

| Patrón | JS total | PHP total |
|---|---:|---:|
| `hvc1.` | 214 (68 líneas) | 31 |
| `avc1.` | 44 (38 líneas) | 26 |
| `dvh1` | 27 (23 líneas) | 0 |
| `VIDEO-RANGE` | 26 (25 líneas) | 6 |
| `HDCP-LEVEL` | 17 (17 líneas) | 0 |
| `SUPPLEMENTAL-CODECS` | 8 (8 líneas) | 1 (comentario) |
| `L153` | 48 (39 líneas) | 12 |
| `3840x2160` | 54 (53 líneas) | 29 |
| **Total bruto** | **438** | **105** |

De los 438 hits JS, **la mayoría son legítimos** (comentarios de doctrina, tablas de cascada por resolución,
alias de familia para KODIPROP/EXTVLCOPT, regex de clasificación). La clasificación hit-por-hit con veredicto
está en `APP_HARDCODE_FINDINGS.md`: **7 violaciones reales**, **9 datos calibrados fuera del SSOT**, **3 defaults
legítimos con riesgo**, resto legítimo.

---

## 4. Archivos NO tocados (declaración explícita)

Respetando el lock de `dsh-lead` (t44) sobre `frontend/js/**` y `vps/production_mirror/**`, y t47 sobre
`tools/crystal-upscale/**`:

- Cero escrituras en `IPTV_v5.4_MAX_AGGRESSION/**`.
- Cero `git add` / `git commit` / `git checkout` / `git stash`.
- Toda corrección propuesta en este paquete es **texto**, con `archivo:línea` y diff, sin aplicar.
- `contracts/**` no fue tocado; se cita (si aplica) solo como referencia de estado ajeno.

---

## 5. Resumen ejecutivo del inventario

1. La APP **sí** tiene un punto único de verdad de emisión (`__apeStreamTruth`, L2441) que **cumple la Ley
   Cardinal 1** (calcula `reqLevel` desde `{w,h,fps}` y corrige niveles por debajo, L2567–2575).
2. Pero ese punto único **es evitable**: la ruta `maxQualityMode` (L9996–10008) y `buildStreamInf()` del PHP
   (L5514) emiten STREAM-INF **sin pasar por él** y con codec/resolución/bitrate hardcodeados.
3. Hay **dos SSOT paralelos en JS** (`profiles_calibrated` del JSON y la cascada CSV de `ape-hevc-cascade.js`)
   que pueden divergir sin que nadie lo detecte.
4. El **SSOT mismo** (`lab_master_22.6.0.json`) contiene el patrón del freeze 2026-06-08: `P1 = 7680x4320@120`
   con `codec_full = hvc1.2.4.L153.B0`. La APP lo **enmascara** (clamp fps→60 + corrección de nivel), pero el
   Excel/JSON sigue diciendo algo imposible.
5. El resolver PHP **no depende del frontend** (bien), pero tampoco del SSOT: asume el 100 % de las directivas
   con su propia tabla hardcodeada y **declara `FRAME-RATE=120` con `L153`** (4K@60 techo) → violación real.
