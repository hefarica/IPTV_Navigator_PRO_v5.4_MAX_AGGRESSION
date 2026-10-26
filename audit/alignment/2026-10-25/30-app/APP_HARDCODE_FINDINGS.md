# APP_HARDCODE_FINDINGS — Hallazgos de hardcode con archivo:línea, clasificación y fix mínimo propuesto

**Task:** t6 · T5 · Auditoría de la APP
**Attempt:** `bf962cfc-3985-412c-b4a0-8fca541a817e`
**Regla:** **cero modificaciones a producción.** Cada fix de este documento es **texto propuesto**, con
`archivo:línea` y diff, **sin aplicar**. Nada fue escrito en `IPTV_v5.4_MAX_AGGRESSION/**`.

**Base de verdad usada para clasificar**
- `frontend/lab_master_22.6.0.json` (280 065 B · sha256 `099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4`) — el SSOT que la APP realmente consume.
- `CLAUDE.md` (MAX IMAGE FIRST, Codec Ladder, tabla de Bitrate Fallback, GOLDEN RULE, Ley Cardinal 1).
- Skill `iptv-omega-working-flow-manifesto` (5 leyes cardinales, piso Main10, post-mortem 2026-06-08).
- Skill `codec-rfc6381-string-validator` (RFC 6381, niveles HEVC Annex A).

**Taxonomía de clasificación usada**
| Clase | Significado |
|---|---|
| **V** = VIOLACIÓN | Contradice una ley cardinal / la GOLDEN RULE / el SSOT de forma que puede romper reproducción o mentir al player. |
| **C** = DATO CALIBRADO | Valor de calibración legítimo por diseño (tabla por resolución, piso doctrinal), pero **hardcodeado en código** en vez de leído del SSOT: es drift latente, no defecto activo. |
| **D** = DEFAULT LEGÍTIMO | Fallback defensivo correcto cuando el SSOT/probe no aporta. |
| **L** = LEGÍTIMO | Comentario, regex de clasificación, alias de familia, par cascada `hvc1`/`hev1`… Nada que corregir. |

**Resumen:** 10 **V**, 12 **C**, 4 **D** con riesgo, resto **L** (≈415 hits brutos restantes).

---

## ÍNDICE POR SEVERIDAD

| ID | Sev | Archivo:línea | Clase | Título |
|---|---|---|---|---|
| F-APP-01 | **CRITICAL** | `backend/resolve_quality_unified.php:5519-5520` (+`:4857`) | **V** | `FRAME-RATE=120` declarado con `hvc1.2.4.L153.B0` → nivel no carga 4K@120 |
| F-APP-02 | **CRITICAL** | `vps/ape_hls_generators.php:737-742` | **V** | `hev1.*` dentro de `#EXT-X-STREAM-INF:CODECS=` → GOLDEN RULE cruzada |
| F-APP-03 | **HIGH** | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:9995-10008` | **V** | `maxQualityMode` emite STREAM-INF **sin pasar** por `__apeStreamTruth` (sin guarda Ley Cardinal 1) |
| F-APP-04 | **HIGH** | `m3u8-typed-arrays-ultimate.js:2495-2501` | **V** | Fake-8K **por defecto** sobrescribe la `RESOLUTION` del SSOT en P0–P5 |
| F-APP-05 | **HIGH** | `backend/resolve_quality_unified.php:4544` | **V** | `#EXT-X-STREAM-INF` huérfano (sin URI) inyectado tras `#EXTM3U` en P0/P1 |
| F-APP-06 | **HIGH** | `backend/resolve_quality_unified.php:5519-5521` | **V** | `RESOLUTION=3840x2160` hardcodeado para todos los perfiles (incluido P0 = 8K) |
| F-APP-07 | **HIGH** | `vps/ape_hls_generators.php:729` | **V** | `#EXT-X-MAP:URI="<proveedor>.m3u8"` → CMAF declarado sin init segment real |
| F-APP-08 | **MEDIUM** | `m3u8-typed-arrays-ultimate.js:2519` | **V** | `fps` clampado a 60 en JS → SSOT dice 120 en P0–P5 (drift SSOT→lista) |
| F-APP-09 | **MEDIUM** | `resolve_quality_unified.php:5035,5037` | **V** | `#KODIPROP:...preferred_codec=<RFC-6381>` donde ISA espera **nombre de familia** |
| F-APP-10 | **MEDIUM** | `m3u8-typed-arrays-ultimate.js:9996,9998,10000` | **C** | Cadena DV/HEVC 18-codec + mapas `BANDWIDTH`/`RESOLUTION` hardcodeados por perfil |
| F-APP-11 | **MEDIUM** | `m3u8-typed-arrays-ultimate.js:3061` | **C** | `#EXT-X-I-FRAME-STREAM-INF` global con `L153` + `1920x1080` (par incoherente) |
| F-APP-12 | **MEDIUM** | `m3u8-typed-arrays-ultimate.js:6858` | **D** | Fallback `hvc1.2.4.L153.B0` sin mirar resolución si falta `cfg.codec_string` |
| F-APP-13 | **MEDIUM** | `resolve_quality_unified.php:6109` | **V** | `BANDWIDTH=5100000` fijo con `RESOLUTION=<dinámica>` → incoherencia ABR |
| F-APP-14 | **LOW** | `m3u8-typed-arrays-ultimate.js:10101` | **C** | `HDCP-LEVEL` default `TYPE-1` incondicional (doctrina 2026-05-19) |
| F-APP-15 | **LOW** | `resolve_quality_unified.php:464` | **C** | `RQ_SECRET_TOKEN` con valor placeholder por defecto |
| F-APP-16 | **LOW** | `m3u8-typed-arrays-ultimate.js:10268-10279` | **C** | Umbrales `22 000 000` / `12 000 000` bps hardcodeados (VPS image upgrade) |
| F-APP-17 | **LOW** | `ape_hls_generators.php:441,446` | **C** | DASH `<Representation>` con `codecs="hev1…"` + `width/height/bandwidth` fijos |
| F-APP-18 | **LOW** | `resolve_quality_unified.php:394,4665,5438` | **C** | `3840x2160` / ABR-LADDER hardcodeados en EXTHTTP y directivas APE |
| F-APP-19 | **INFO** | `lab_master_22.6.0.json` (`profiles_calibrated.P1`) | **V (en el SSOT, no en la APP)** | `P1 = 7680x4320@120` + `codec_full=hvc1.2.4.L153.B0` = firma del freeze 2026-06-08 |
| F-APP-20 | **INFO** | `ape-profiles-config.js:347,982,1616,2110,2744,3378` | **D** | `codec_ladder_hev1` default idéntico 6× (familias `hev1`, legítimo) |
| F-APP-21 | **INFO** | `ape-fallback-resolver.js:36,238,301,355,370,403` | **D/C** | Tabla bitrate + codecs F2/F3/F4 coherentes con `CLAUDE.md` |
| F-APP-22 | **INFO** | `ape-hevc-cascade.js:27-39` | **L** | Cascada 13-tier con par `codec`/`codec_hev1` → GOLDEN RULE estructural |
| F-APP-23 | **HIGH** | `m3u8-typed-arrays-ultimate.js:7836-7851` + SSOT `settings.bitrate` | **C** | `BANDWIDTH` emitido **contradice** `bandwidth_max` del SSOT (P0: 200 M vs 80 M) |
| F-APP-24 | **MEDIUM** | `m3u8-typed-arrays-ultimate.js:2576-2581` | **V** | `VIDEO-RANGE=PQ` incondicional sobre perfiles `video_range="SDR"` + `avc1` (P3–P5) |
| F-APP-25 | **MEDIUM** | `m3u8-typed-arrays-ultimate.js:9949` | **V** | `I-FRAME-STREAM-INF` por canal usa el códec **pre-truth** (`L153`) ≠ `STREAM-INF` (`L183`) |
| F-APP-26 | **LOW** | `m3u8-typed-arrays-ultimate.js:7851` | **C** | `AVERAGE-BANDWIDTH` con factor `0.85` literal vs SSOT `avg_bandwidth_ratio="0.78"` |

---

# HALLAZGOS DETALLADOS

## F-APP-01 — CRITICAL · `FRAME-RATE=120` con `hvc1.2.4.L153.B0`

**Archivo:** `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php`
**Líneas:** `4857` (origen del `fps`) + `5519-5520` (emisión)

**Evidencia transcrita**
```php
4856:     private const PROFILES = [
4857:         'sports'     => ['profile' => 'P0_ULTRA_SPORTS_8K',   'fps' => 120, 'buffer' => 60000,  'bw' => 80000000],
4858:         'cinema'     => ['profile' => 'P1_CINEMA_8K_HDR',     'fps' => 60,  'buffer' => 60000,  'bw' => 80000000],
4862:         'default'    => ['profile' => 'P0_ULTRA_SPORTS_8K',   'fps' => 120, 'buffer' => 60000,  'bw' => 80000000],
4863:     ];
...
5514:     private function buildStreamInf(array $profile): string
5515:     {
5516:         $fps = $profile['fps'];
5517:         $bw  = RQ_MAX_BW;
5518:         // Para máxima compatibilidad con Onn 4K y TVs UHD: declaramos resolución 4K real y el códec Corona UHDX
5519:         return "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$bw},RESOLUTION=3840x2160,FRAME-RATE={$fps}.000,"
5520:             . 'CODECS="hvc1.2.4.L153.B0,mp4a.40.2",HDR=PQ,VIDEO-RANGE=PQ,AUDIO="aac_atmos",'
5521:             . 'CLOSED-CAPTIONS=NONE,SUBTITLES="subs"';
5522:     }
```

**Clasificación: VIOLACIÓN (Ley Cardinal 1 — Nivel↔Resolución/FPS).**

**Causa raíz:** `$fps` sale de `PROFILES` (120 para `sports` y `default`, que son los tipos de contenido más
frecuentes) y se declara tal cual mientras el códec está **fijo** en `hvc1.2.4.L153.B0`.
`L153` = HEVC Level 5.1 = techo **4K@60**. Un `RESOLUTION=3840x2160` con `FRAME-RATE=120.000` **exige L156
(5.2)**. El STREAM-INF declara un nivel que no puede sostener el frame-rate declarado.

**Impacto:** es la firma exacta del freeze 2026-06-08 documentado en el manifiesto OMEGA («declarar un nivel por
debajo de la resolución es imposible → el player rechaza la variante → freeze»). Un decoder estricto
(ExoPlayer/MediaCodec, Tizen, webOS) puede rechazar la variante o caer a negrura. `default` = la ruta más usada.

**Fix mínimo propuesto (NO aplicado)**
```diff
--- a/IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php
+++ b/IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php
@@ -5514,9 +5514,15 @@
     private function buildStreamInf(array $profile): string
     {
         $fps = $profile['fps'];
         $bw  = RQ_MAX_BW;
-        // Para máxima compatibilidad con Onn 4K y TVs UHD: declaramos resolución 4K real y el códec Corona UHDX
-        return "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$bw},RESOLUTION=3840x2160,FRAME-RATE={$fps}.000,"
-            . 'CODECS="hvc1.2.4.L153.B0,mp4a.40.2",HDR=PQ,VIDEO-RANGE=PQ,AUDIO="aac_atmos",'
+        // Ley Cardinal 1: el nivel HEVC DEBE poder cargar RESOLUTION × FRAME-RATE.
+        // 2160@≤60 ⇒ L153 (5.1). 2160@>60 ⇒ L156 (5.2). 4320@≤30 ⇒ L180 · 4320@≤60 ⇒ L183 · 4320@>60 ⇒ L186.
+        $res  = '3840x2160';
+        $lvl  = ((int)$fps > 60) ? 'L156' : 'L153';
+        $codec = 'hvc1.2.4.' . $lvl . '.B0';
+        return "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$bw},RESOLUTION={$res},FRAME-RATE={$fps}.000,"
+            . 'CODECS="' . $codec . ',mp4a.40.2",VIDEO-RANGE=PQ,'
```

**Prueba de aceptación:** generar una lista con `ct=sports` y verificar que la línea STREAM-INF
`CODECS=` nunca tiene un `L<n>` menor que el requerido por su `RESOLUTION`+`FRAME-RATE`. Assert sugerido (Node):
```js
// para cada STREAM-INF: req = h>=4320?(f>100?186:f>=50?183:180):h>=2160?(f>60?156:f>=50?153:150):…
// assert(parseInt(/\.L(\d+)\./.exec(codec)[1]) >= req)
```
> **Nota adicional en el mismo bloque:** `HDR=PQ` (L5520) **no es un atributo HLS válido** — el atributo del
> RFC 8216bis es `VIDEO-RANGE` (que ya se emite). `HDR=PQ` debe eliminarse; `AUDIO="aac_atmos"` y
> `SUBTITLES="subs"` (L5520-5521) referencian GROUP-ID que **no existen** (el archivo no emite ningún
> `#EXT-X-MEDIA`), violando §4.3.4.1. Fix mínimo: quitar los tres atributos.

---

## F-APP-02 — CRITICAL · `hev1.*` dentro de `#EXT-X-STREAM-INF:CODECS=`

**Archivo:** `IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php`
**Líneas:** `737-742`

**Evidencia transcrita**
```php
731:     // EXT-X-STREAM-INF con los parámetros de calidad del perfil
732:     $bw         = $cfg['max_bw']   ?? 15150000;
733:     $avgBw      = $cfg['bitrate']  ?? 10100;
734:     $avgBwBps   = $avgBw * 1000;
735:     $resolution = $cfg['res']      ?? '1920x1080';
736:     $fps        = $cfg['fps']      ?? 120; // MEMC-TOTAL-8K120: default 120fps
737:     $codecs     = ($cfg['codec_primary'] === 'HEVC' || $cfg['codec_primary'] === 'hevc')
738:                     ? 'hev1.2.4.L153.B0,mp4a.40.2'
739:                     : 'avc1.640028,mp4a.40.2';
740:
741:     echo "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$avgBwBps},"
742:        . "RESOLUTION={$resolution},FRAME-RATE={$fps},CODECS=\"{$codecs}\"\n";
```

**Clasificación: VIOLACIÓN (GOLDEN RULE).**

**Causa raíz:** la GOLDEN RULE es explícita y está citada en el propio generador
(`m3u8-typed-arrays-ultimate.js:28-29`: «hev1 → decoder runtime (KODIPROP, EXTVLCOPT, EXTHTTP codec fields) /
REGLA DE ORO: NUNCA cruzar. hev1 en STREAM-INF rompe Tizen/webOS»). Aquí `hev1.2.4.L153.B0` se emite
**directamente en `#EXT-X-STREAM-INF:CODECS=`**.

**Impacto:** rotura de player en Tizen/webOS (documentada por la propia doctrina del repo) + declaración
inconsistente con el resto de las listas (que emiten `hvc1.*` en STREAM-INF). Además se compone con F-APP-01:
`$fps` default **120** con `L153` → misma violación de nivel.

**Fix mínimo propuesto (NO aplicado)**
```diff
--- a/IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
+++ b/IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
@@ -736,6 +736,9 @@
     $fps        = $cfg['fps']      ?? 120; // MEMC-TOTAL-8K120: default 120fps
-    $codecs     = ($cfg['codec_primary'] === 'HEVC' || $cfg['codec_primary'] === 'hevc')
-                    ? 'hev1.2.4.L153.B0,mp4a.40.2'
-                    : 'avc1.640028,mp4a.40.2';
+    // GOLDEN RULE: hvc1.* SOLO en STREAM-INF; hev1.* SOLO en KODIPROP/EXTVLCOPT.
+    // Ley Cardinal 1: nivel acorde a RESOLUTION × FRAME-RATE.
+    $fps_i      = (int)$fps;
+    $hev1_lvl   = ($fps_i > 60) ? 'L156' : (($fps_i > 30) ? 'L153' : 'L150');   // 2160p
+    $codecs     = ($cfg['codec_primary'] === 'HEVC' || $cfg['codec_primary'] === 'hevc')
+                    ? ('hvc1.2.4.' . $hev1_lvl . '.B0,mp4a.40.2')   // hvc1 en STREAM-INF
+                    : 'avc1.640028,mp4a.40.2';
```
Y, si el perfil quiere declarar la cascada `hev1` al decoder, hacerlo **en KODIPROP/EXTVLCOPT**, no aquí:
```php
echo "#KODIPROP:inputstream.adaptive.preferred_codec=hevc\n";   // nombre de familia, ver F-APP-09
```

**Prueba:** `grep -n 'EXT-X-STREAM-INF' vps/ape_hls_generators.php` → el `CODECS=` resultante no debe contener
`hev1` ni `hev2`. Assert sugerido: `!/hev1|hev2/.test(streamInfLine)`.

---

## F-APP-03 — HIGH · `maxQualityMode` emite STREAM-INF sin la guarda de la Ley Cardinal 1

**Archivo:** `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`
**Líneas:** `9995-10008`

**Evidencia transcrita**
```js
9995:         if (options && options.maxQualityMode) {
9996:             const _mqVideoChain = 'dvh1.08.06,dvh1.05.09,hvc1.2.4.L186.B0,hvc1.2.4.L183.B0,hvc1.2.4.L180.B0,hvc1.2.4.L156.B0,hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.2.4.L153.B0,hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,hvc1.2.4.L90.B0,av01.0.13M.10.0.110.09.16.09.0,av01.0.09M.10.0.110.09.16.09.0,avc1.640033,avc1.640028';
9997:             const _mqCodecFirst = _mqVideoChain.split(',')[0]; // dvh1.08.06
9998:             const _mqBwMap = { 'P0': 120000000, 'P1': 80000000, 'P2': 50000000, 'P3': 25000000, 'P4': 15000000, 'P5': 8000000 };
9999:             const _mqBw = _mqBwMap[String(profile || 'P3').toUpperCase()] || 25000000;
10000:            const _mqResMap = { 'P0': '7680x4320', 'P1': '3840x2160', 'P2': '3840x2160', 'P3': '1920x1080', 'P4': '1280x720', 'P5': '854x480' };
10001:            const _mqRes = _mqResMap[String(profile || 'P3').toUpperCase()] || '1920x1080';
...
10008:            _streamInfLine = `#EXT-X-STREAM-INF:BANDWIDTH=${_mqBw},AVERAGE-BANDWIDTH=${Math.round(_mqBw * 0.8)},CODECS="${_mqCodecFirst},ac-3",RESOLUTION=${_mqRes},FRAME-RATE=${Number(_mqFps).toFixed(3)},HDCP-LEVEL=${_hdcpLevel},STABLE-VARIANT-ID="${_stableVariantId}"`;
```

**Clasificación: VIOLACIÓN (Ley Cardinal 1 + Ley SSOT-LAB).**

**Causa raíz:** esta ruta construye el STREAM-INF **a mano** y **no invoca `__apeStreamTruth()`** (L2441), que es
la única función que calcula `reqLevel` desde `{w,h,fps}` y corrige niveles por debajo (L2567-2575).
`_mqCodecFirst` es **siempre** `dvh1.08.06`, sea el perfil P0 (8K) o P5 (854x480).

**Impacto (dos vectores)**
1. **Nivel vs resolución:** `P0` declara `7680x4320` con `dvh1.08.06` (DV profile 8, **level 6.0** = 8K@30). A
   `FRAME-RATE` 120 (si `_probedFps_MQ ≥ 24`), 8K@120 exige L186. `dvh1` **no se corrige nunca** porque la
   guarda de L2567 sólo actúa sobre `family === 'HEVC'`.
2. **Dolby Vision sobre AVC nativo:** `dvh1.08.06` se declara para *cualquier* canal, con independencia de lo
   que sirva el proveedor. Es exactamente el riesgo documentado en el manifiesto: «declarar `hvc1`/`dvh1` sobre
   un canal AVC nativo = **pantallazo negro** en players sin daemon (reproducido en vivo, se revirtió)».

**Fix mínimo propuesto (NO aplicado)** — una sola línea, la que fija el códec:
```diff
--- a/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
+++ b/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
@@ -9995,7 +9995,10 @@
         if (options && options.maxQualityMode) {
             const _mqVideoChain = '…';  // (sin cambios: es la cascada de fallback, no lo que se declara)
-            const _mqCodecFirst = _mqVideoChain.split(',')[0]; // dvh1.08.06
+            // [F-APP-03] El códec DECLARADO en CODECS= pasa por la fuente única (Ley Cardinal 1).
+            // _mqVideoChain queda como CASCADA de fallback (KODIPROP/EXTVLCOPT), no como declaración.
+            const _mqTruth = __apeStreamTruth({ profile, name:'', profileResolution: _mqResMap[String(profile||'P3').toUpperCase()],
+                profileFps: _mqFps, probe: _probeData || null, codecHint: 'hvc1.2.4.L153.B0', cascade: _cascade || null });
+            const _mqCodecFirst = _mqTruth.codec;   // nivel garantizado por reqLevel
```
> Nota: si se quiere conservar la agresividad DV, la condición debe ser **`probe confirmó DV`**, no `true`.
> Propuesta conservadora (checksum de doctrina): declarar `dvh1.08.06` sólo si
> `_probeData.supplementalCodecs` o `_probeData.videoCodec` casa `/dvh1|dvhe/i`; en caso contrario, `hvc1`.

**Prueba:** con `maxQualityMode`, generar P5 (854x480) y verificar que `CODECS=` **no** es `dvh1.*`; generar P0 y
verificar `reqLevel` ≥ 183 para 8K@60 y ≥ 186 para 8K@120. Assert: `levelOf(codec) >= req(w,h,fps)` para **todas**
las líneas STREAM-INF, incluida esta ruta.

---

## F-APP-04 — HIGH · Fake-8K por defecto sobrescribe la `RESOLUTION` del SSOT

**Archivo:** `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`
**Líneas:** `2495-2504` (y su origen en `10333-10342`)

**Evidencia transcrita**
```js
2462:         if (!rr && o.profileResolution) {
2463:             rr = parseRes(o.profileResolution);
2464:             if (rr) r.source = 'profile';          // SSOT: getProfile().settings.resolution
2465:         }
...
2495:         const fakeMode = (o.fakeUhd === '4k' || o.fakeUhd === '0') ? o.fakeUhd
2496:             : (o.fakeUhd === false ? '0' : '8k');
2497:         if (fakeMode !== '0') {
2498:             const probeRes = (o.probe && o.probe.resolution) ? parseRes(o.probe.resolution) : null;
2499:             const probe8k = !!(probeRes && probeRes.w >= 7680 && probeRes.h >= 4320);
2500:             if (fakeMode === '8k') {
2501:                 rr = { w: 7680, h: 4320 };              // 8K SIEMPRE (fake o real)
2502:             } else {
2503:                 rr = probe8k ? { w: 7680, h: 4320 } : { w: 3840, h: 2160 };
2504:             }
```
```js
10339:                fakeUhd: (typeof window !== 'undefined')
10340:                    ? ((window.APE_FAKE_UHD === '4k') ? '4k'
10341:                        : ((window.APE_FAKE_UHD === '0' || window.APE_FAKE_UHD === 0 || window.APE_Fake_UHD === false) ? '0' : '8k'))
10342:                    : '8k',
```
*(línea 10341 transcrita literal: `window.APE_Fake_UHD === false` — nótese la mayúscula, ver más abajo)*

**Clasificación: VIOLACIÓN (Ley SSOT-LAB, no-override).**

**Causa raíz:** el orden de precedencia en L2458-2479 respeta el SSOT (`source='profile'`), pero L2497-2501
**sobrescribe `rr` incondicionalmente** con 7680x4320 cuando `fakeMode === '8k'`, que es el **default**
(L2495-2496, L10342). Es decir: la resolución calibrada del perfil se calcula y luego se descarta.

**Impacto:** la lista **no** declara la resolución del SSOT. Contra `lab_master_22.6.0.json`:
`P2=3840x2160`, `P3=3840x2160`, `P4=3840x2160`, `P5=3840x2160` → la APP emite `7680x4320` en los cinco.
Es una decisión **del propietario** (comentario L2482-2484: «LO QUE SEA 4K LO VUELVA 8K … el FAKE 8K queda
AUTORIZADO», 2026-10-25), **pero no está en el Excel/JSON**: el SSOT no la contiene ⇒ **drift SSOT↔lista** y el
contrato de emisión del Excel no se cumple. Riesgo aceptado y documentado en el propio código (L2490-2494): un
player estricto puede rechazar por resolución/nivel declarado.

**Fix mínimo propuesto (NO aplicado)** — dos correcciones independientes:

(a) **Bug real de tipeo** (una línea, sin cambiar comportamiento salvo el kill-switch):
```diff
@@ -10341,7 +10341,7 @@
-                        : ((window.APE_FAKE_UHD === '0' || window.APE_FAKE_UHD === 0 || window.APE_Fake_UHD === false) ? '0' : '8k'))
+                        : ((window.APE_FAKE_UHD === '0' || window.APE_FAKE_UHD === 0 || window.APE_FAKE_UHD === false) ? '0' : '8k'))
```
`APE_Fake_UHD` (mayúscula en `Fake`) nunca existe → el kill-switch `= false` **no funciona**. Es un defecto
funcional puro, independiente de la doctrina.

(b) **Cerrar el drift SSOT↔lista** (propuesta, requiere decisión del propietario): declarar el fake de forma
explícita y auditable en el SSOT, o degradar el default a `'0'`:
```diff
@@ -2495,7 +2495,9 @@
-        const fakeMode = (o.fakeUhd === '4k' || o.fakeUhd === '0') ? o.fakeUhd
-            : (o.fakeUhd === false ? '0' : '8k');
+        // [F-APP-04] El fake-UHD es una DECISIÓN DEL SSOT, no un default del código.
+        // Precedencia: explícito del caller → global → (default) '0' = respetar el perfil del LAB.
+        const fakeMode = (o.fakeUhd === '4k' || o.fakeUhd === '8k' || o.fakeUhd === '0') ? o.fakeUhd
+            : (o.fakeUhd === false ? '0' : ((typeof window !== 'undefined' && window.APE_FAKE_UHD) ? '8k' : '0'));
```

**Prueba:** con `window.APE_FAKE_UHD` indefinido, el `RESOLUTION` emitido debe **igualar**
`lab_master_22.6.0.json → profiles_calibrated.<P>.settings.resolution` para los 6 perfiles (test 1:1 en
`APP_EMISSION_CONTRACT.md` §4). Con `window.APE_FAKE_UHD = false` el resultado debe ser idéntico al de `'0'`.

---

## F-APP-05 — HIGH · `#EXT-X-STREAM-INF` huérfano (sin URI) tras `#EXTM3U`

**Archivo:** `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php`
**Línea:** `4544` (contexto `4539-4553`)

**Evidencia transcrita**
```php
4539:             if ($trimmed === '#EXTM3U') {
4541:                 $isNuclearProfile = in_array($effective_profile, ['P0', 'P1']);
4542:                 if ($isNuclearProfile) {
4544:                     $enriched[] = '#EXT-X-STREAM-INF:BANDWIDTH=384000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"';
4545:                 }
4547:                 // === QUANTUM TACTIC 3: LCEVC Phase 3/4 Signaling (MPEG-5 Part 2) ===
4549:                 $enriched[] = '#EXT-X-SESSION-DATA:DATA-ID="org.mpeg.lcevc",VALUE="1"';
4551:                 foreach ($anti_cut['hls_ext'] ?? [] as $ext) {
4552:                     $enriched[] = $ext;
```

**Clasificación: VIOLACIÓN (RFC 8216 §4.3.4.2 + Ley SSOT-LAB).**

**Causa raíz / impacto (tres defectos en una línea)**
1. **STREAM-INF huérfano:** un `#EXT-X-STREAM-INF` debe ir seguido **inmediatamente** por una línea URI. Aquí le
   sigue `#EXT-X-SESSION-DATA:DATA-ID="org.mpeg.lcevc"` (L4549). El bloque `if (str_starts_with($lines[$i],
   '#EXT-X-STREAM-INF:'))` de la propia L856 existe precisamente para detectar ese error y abortar con
   «`'{$nextLine}' entre EXT-X-STREAM-INF y URL`». Esta inyección **provoca el error que el propio archivo
   valida**. Es el origen natural del «Loaded playlist has unexpected type» que se parchea en L782/799.
2. **`BANDWIDTH=384000000`** (384 Mbps) es una declaración falsa con impacto real en ABR: fuerza al player a
   pedir la variante máxima y puede provocar stalls en redes que no lo sostienen.
3. **`RESOLUTION=3840x2160` + `L153` para `P0`**, cuyo nombre es `P0_ULTRA_SPORTS_8K` → SSOT dice 8K, la lista
   dice 4K.
4. Coexiste con el `#EXT-X-STREAM-INF` legítimo por canal (`buildStreamInf`, L5514) ⇒ **dos STREAM-INF con
   CODECS distintos en el mismo documento**.

**Fix mínimo propuesto (NO aplicado)** — borrar la inyección (es la táctica que además rompe el parser):
```diff
--- a/IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php
+++ b/IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php
@@ -4540,8 +4540,9 @@
                 // === QUANTUM TACTIC 2: ISP Strangulation x2 (HLS Tag) ===
-                // Solo engañar al ABR a nivel nuclear si el perfil es de alta prioridad (P0/P1)
-                $isNuclearProfile = in_array($effective_profile, ['P0', 'P1']);
-                if ($isNuclearProfile) {
-                    $enriched[] = '#EXT-X-STREAM-INF:BANDWIDTH=384000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"';
-                }
+                // [F-APP-05] ELIMINADO: un #EXT-X-STREAM-INF en cabecera queda HUÉRFANO (sin URI)
+                // → RFC 8216 §4.3.4.2 y rompe el validador propio (L856). La declaración de variante
+                // vive SOLO en buildStreamInf() (L5514), con nivel coherente (F-APP-01).
```
> Si el objetivo era «engañar al ABR», el vehículo correcto es `#EXT-X-APE-BANDWIDTH-INTENT` (tag privado,
> ignorado por el player conforme RFC 8216 §6.3.1), **no** un STREAM-INF real.

**Prueba:** para `effective_profile` en `{P0,P1}`, el documento emitido debe superar el validador de L856
(`#EXT-X-STREAM-INF` siempre seguido de URI) y contener **exactamente un** STREAM-INF por canal.

---

## F-APP-06 — HIGH · `RESOLUTION=3840x2160` hardcodeado para todos los perfiles

**Archivo:** `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php`
**Líneas:** `5519` (ver F-APP-01 para el bloque completo)

**Clasificación: VIOLACIÓN (Ley SSOT-LAB).**

**Causa raíz:** `buildStreamInf()` recibe `$profile` con la clave `'profile' => 'P0_ULTRA_SPORTS_8K'` (L4857) pero
**ignora** ese dato y el `'bw' => 80000000`; fija `RESOLUTION=3840x2160` y `$bw = RQ_MAX_BW` (=160 000 000,
L9). El parámetro `$profile` sólo se usa para `fps`.

**Impacto:** el nombre del perfil dice 8K y la declaración dice 4K; y el `BANDWIDTH` (160 Mbps) contradice el
`bw` declarado en la tabla (80 Mbps). Ningún perfil puede expresar su resolución real.

**Fix mínimo propuesto (NO aplicado)** — derivar de la tabla en vez de fijar:
```diff
@@ -4856,9 +4856,11 @@
     private const PROFILES = [
-        'sports'     => ['profile' => 'P0_ULTRA_SPORTS_8K',   'fps' => 120, 'buffer' => 60000,  'bw' => 80000000],
+        // [F-APP-06] 'res' añadido para que buildStreamInf() NO hardcodee 3840x2160.
+        'sports'     => ['profile' => 'P0_ULTRA_SPORTS_8K', 'res' => '7680x4320', 'fps' => 60, 'buffer' => 60000, 'bw' => 80000000],
         ...
     private function buildStreamInf(array $profile): string
     {
         $fps = $profile['fps'];
-        $bw  = RQ_MAX_BW;
-        $res = '3840x2160';
+        $bw  = (int)($profile['bw'] ?? RQ_MAX_BW);
+        $res = $profile['res'] ?? '1920x1080';
```
> **Ojo, decisión de doctrina:** al declarar P0 = 7680x4320 hay que subir el nivel a L183/L186 (ver F-APP-01).
> Ambas correcciones deben ir juntas o se empeora la situación.

**Prueba:** los 6 valores de `$profile['res']` deben aparecer en las 6 variantes generadas; `BANDWIDTH` emitido
debe ser el `bw` del perfil, no `RQ_MAX_BW`.

---

## F-APP-07 — HIGH · `#EXT-X-MAP:URI` apunta a un `.m3u8` ⇒ CMAF falso

**Archivo:** `IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php`
**Líneas:** `726-729`

**Evidencia transcrita**
```php
726:     // EXT-X-MAP apunta al .m3u8 del proveedor como hint de inicialización.
727:     // Los reproductores modernos (OTT Navigator, TiviMate, ExoPlayer) usan
728:     // este URI para negociar el codec antes de solicitar segmentos.
729:     echo "#EXT-X-MAP:URI=\"{$providerM3u8}\"\n";
```

**Clasificación: VIOLACIÓN (`CLAUDE.md` criterio #4: «0 declaraciones CMAF falsas (solo si EXT-X-MAP + .m4s/init.mp4)»).**

**Causa raíz:** `#EXT-X-MAP` declara el **Initialization Segment** de fMP4/CMAF; su URI debe ser un `init.mp4`
(con `ftyp`+`moov`). Aquí apunta al **manifest HLS** del proveedor. El comentario lo presenta como "hint de
codec", pero `EXT-X-MAP` no es eso: es el init segment. El propio archivo ya declara `#EXT-X-VERSION:7` y
`manifest_type=hls` (L715), es decir un stream **TS**, no fMP4 → el `EXT-X-MAP` es contradictorio con el contenedor.

**Impacto:** players que intentan parsear el "init segment" (ExoPlayer `FragmentedMp4`) reciben HTML/HLS y fallan
al inicializar el track → «pantalla negra con audio», el síntoma clásico documentado. Rompe el criterio #4 de la
condición de éxito.

**Fix mínimo propuesto (NO aplicado)**
```diff
--- a/IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
+++ b/IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
@@ -726,4 +726,7 @@
-    // EXT-X-MAP apunta al .m3u8 del proveedor como hint de inicialización.
-    echo "#EXT-X-MAP:URI=\"{$providerM3u8}\"\n";
+    // [F-APP-07] #EXT-X-MAP exige un INIT SEGMENT fMP4 real (ftyp+moov), NO un manifest.
+    // Sólo se emite si el proveedor sirve fMP4/CMAF de verdad; si no, se omite (TS clásico).
+    if (!empty($cfg['cmaf_init_uri']) && preg_match('/\.(mp4|m4s|m4a)(\?|$)/i', (string)$cfg['cmaf_init_uri'])) {
+        echo "#EXT-X-MAP:URI=\"" . $cfg['cmaf_init_uri'] . "\"\n";
+    }
```
> Alternativa aún más segura: eliminar la línea. Un `EXT-X-MAP` ausente **no rompe** nada en un TS; un
> `EXT-X-MAP` falso **sí**.

**Prueba:** `grep 'EXT-X-MAP' lista.m3u8` → toda URI debe acabar en `.mp4/.m4s` y devolver un box `ftyp` al
descargarla. Assert: `!/EXT-X-MAP.*\.m3u8/.test(lista)`.

---

## F-APP-08 — MEDIUM · `fps` clampado a 60 en JS mientras el SSOT dice 120

**Archivo:** `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`
**Línea:** `2519` (contexto `2514-2519`)

**Evidencia transcrita**
```js
2514:         // ── fps (mismo objeto; clamp duro 60 — Apple 1.19 / D1) ───────────
2515:         const pf = Number(o.probe && o.probe.frameRate);
2516:         const cf = Number(o.profileFps);
2517:         const raw = (Number.isFinite(pf) && pf >= 24) ? pf : (Number.isFinite(cf) && cf > 0 ? cf : (Number(o.hintFps) || 30));
2518:         r.fpsRaw = raw;
2519:         r.fps = Math.min(raw, 60);
```

**Clasificación: VIOLACIÓN (doctrina `iptv-lab-ssot-no-clamp`: «JS NO clampa»), con atenuante doctrinal.**

**Causa raíz:** `raw` recoge el fps del SSOT (120 en P0–P5 según `lab_master_22.6.0.json`), se conserva en
`r.fpsRaw` (observabilidad) y luego se recorta a 60 para `FRAME-RATE`. El comentario justifica el clamp
(«Apple 1.19 / D1»), y el propio código documenta el motivo del clamp a 60 en L2489 («8K nunca pide L186
(8K@120 = freeze 08/06)») — es decir, **el clamp es una mitigación deliberada del freeze**.

**Impacto:** el `FRAME-RATE` emitido **nunca** es el del SSOT. Un consumidor que compare Excel↔lista verá 120 vs
60 y no podrá distinguir "mitigación intencional" de "bug". No rompe reproducción (60 es seguro); rompe
**trazabilidad**. Además, el clamp **enmascara** F-APP-19 (el SSOT declara 8K@120+L153, que es imposible).

**Fix mínimo propuesto (NO aplicado)** — no cambiar el clamp; **declararlo** de forma que el contrato sea
auditable (el tag `#EXT-X-APE-FPS-SOURCE` ya existe, L10372; falta el valor recortado):
```diff
@@ -2517,6 +2517,9 @@
         const raw = (Number.isFinite(pf) && pf >= 24) ? pf : (Number.isFinite(cf) && cf > 0 ? cf : (Number(o.hintFps) || 30));
         r.fpsRaw = raw;
+        // [F-APP-08] El clamp a 60 es MITIGACIÓN del freeze 8K@120. Se conserva, pero se DECLARA
+        // (trazabilidad SSOT↔lista): el tag #EXT-X-APE-FPS-SOURCE debe poder decir 'ssot-clamped'.
+        r.fpsClampedFrom = (raw > 60) ? raw : null;
         r.fps = Math.min(raw, 60);
```
y en el emisor del tag (L10371-10373) añadir `,from=${_streamTruth.fpsClampedFrom}` cuando no sea `null`.
Con eso, `APP_EMISSION_CONTRACT.md` puede afirmar «120→60 declarado» en vez de «120→60 silencioso».

**Prueba:** con `fps` del SSOT = 120, la lista debe contener `FRAME-RATE=60.000` **y** el tag de procedencia con
`from=120`. Assert: `lista.includes('APE-FPS-SOURCE')` y `lista.includes('from=120')`.

---

## F-APP-09 — MEDIUM · `#KODIPROP:...preferred_codec=<RFC-6381>` donde ISA espera nombre de familia

**Archivo:** `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php`
**Líneas:** `5035`, `5037` (y `5346`, `5347` para los tags APE)

**Evidencia transcrita**
```php
5035:             '#KODIPROP:inputstream.adaptive.codec_priority=' . ($profile['codec_ladder']['player_pref'] ?? 'hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L156.B…'),
5037:             '#KODIPROP:inputstream.adaptive.preferred_codec=' . ($profile['codec_ladder']['player_pref'] ?? 'hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L156.…'),
```

**Clasificación: VIOLACIÓN (contrato de player), por contradicción con la doctrina del propio repo.**

**Causa raíz:** el generador JS tiene la regla escrita y aplicada:
- `m3u8-typed-arrays-ultimate.js:3326-3327`: «EXTVLCOPT usa nombres de familia (NO cadenas RFC-6381). VLC
  acepta: hevc, h264. **`hvc1.*`/`hev1.*` en EXTVLCOPT:codec rompen VLC/libvlc**».
- `:3760-3777`: «ISA/ExoPlayer espera nombre de familia, NO cadena RFC-6381 … **`hvc1` (fourcc) es ignorado por ISA**».

El PHP emite exactamente lo que esos comentarios prohíben: `hvc1.2.4.L153.B0,...` en
`inputstream.adaptive.preferred_codec` y `codec_priority`.

**Impacto:** la directiva es **inerte** en Kodi/ISA (el valor se ignora) → el player no recibe la preferencia de
códec que la lista cree haberle dado. No rompe, pero **desperdicia** una de las ~103 directivas KODIPROP y
falsea la trazabilidad («la lista declara preferencia HEVC» cuando el player no la aplica).

**Fix mínimo propuesto (NO aplicado)**
```diff
@@ -5033,16 +5033,18 @@
-            '#KODIPROP:inputstream.adaptive.codec_priority=' . ($profile['codec_ladder']['player_pref'] ?? 'hvc1.2.4.L153.B0,…'),
-            '#KODIPROP:inputstream.adaptive.preferred_codec=' . ($profile['codec_ladder']['player_pref'] ?? 'hvc1.2.4.L153.B0,…'),
+            // [F-APP-09] ISA/VLC esperan NOMBRE DE FAMILIA, no RFC-6381 (ver
+            // m3u8-typed-arrays-ultimate.js:3326-3327, 3760-3777). La cascada RFC-6381 viaja en
+            // #EXT-X-APE-CODEC-PRIORITY (tag privado), no en KODIPROP.
+            '#KODIPROP:inputstream.adaptive.codec_priority=hevc,h265,hvc1,avc1,h264',
+            '#KODIPROP:inputstream.adaptive.preferred_codec=hevc',
```

**Prueba:** `grep KODIPROP` sobre la lista generada → ningún `preferred_codec`/`codec_priority` debe contener
`hvc1.`/`hev1.`/`avc1.`. Assert: `!/#KODIPROP:.*(preferred_codec|codec_priority)=.*(hvc1|hev1|avc1)\./`.

---

## F-APP-10 — MEDIUM · Cadena 18-codec y mapas `BANDWIDTH`/`RESOLUTION` hardcodeados por perfil

**Archivo:** `m3u8-typed-arrays-ultimate.js` **Líneas:** `9996`, `9998`, `10000` (ver F-APP-03 para transcripción)

**Clasificación: DATO CALIBRADO fuera del SSOT (drift latente).**

**Causa raíz:** la tabla de banda/resolución por perfil existe **dos veces**: en
`lab_master_22.6.0.json → profiles_calibrated.P<N>.settings` (`resolution`, `bandwidth_target`,
`bandwidth_max`, `codec_chain_video`) y **de nuevo** literal en JS (`_mqBwMap`, `_mqResMap`, `_mqVideoChain`).
Si el Excel se recalibra, estos mapas **no se enteran**.

Comparación medida contra el SSOT (`lab_master_22.6.0.json`):

| Perfil | `_mqResMap` (JS) | SSOT `settings.resolution` | ¿Coincide? |
|---|---|---|---|
| P0 | `7680x4320` | `7680x4320` | ✅ |
| P1 | `3840x2160` | **`7680x4320`** | ❌ |
| P2 | `3840x2160` | `3840x2160` | ✅ |
| P3 | `1920x1080` | **`3840x2160`** | ❌ |
| P4 | `1280x720` | **`3840x2160`** | ❌ |
| P5 | `854x480` | **`3840x2160`** | ❌ |

| Perfil | `_mqBwMap` (JS) | SSOT `settings.bandwidth_max` |
|---|---|---|
| P0 | 120 000 000 | `28000000` (P0 tiene `bandwidth_max` 28 M) |
| P1 | 80 000 000 | `28000000` |

**Impacto:** dos verdades. Con `maxQualityMode` la lista declara **120 Mbps en P0** cuando la calibración dice
**28 Mbps** → `BANDWIDTH` inflado 4.3×, riesgo de ABR que pide lo que la red no tiene (stalls).

**Fix mínimo propuesto (NO aplicado)** — leer del getter del SSOT con el literal como *último* recurso:
```diff
@@ -9996,6 +9996,12 @@
         if (options && options.maxQualityMode) {
+            // [F-APP-10] SSOT-first: los mapas literales quedan como fallback, no como fuente.
+            const _mqProf = (typeof window !== 'undefined' && window.APE_PROFILES_CONFIG &&
+                             typeof window.APE_PROFILES_CONFIG.getProfile === 'function')
+                            ? (window.APE_PROFILES_CONFIG.getProfile(String(profile||'P3').toUpperCase()) || null) : null;
+            const _mqSet  = (_mqProf && _mqProf.settings) || {};
             const _mqVideoChain = '…';
             const _mqBwMap = { … };
-            const _mqBw = _mqBwMap[String(profile || 'P3').toUpperCase()] || 25000000;
+            const _mqBw = Number(_mqSet.bandwidth_max || _mqSet.maxBitrateKbps && (_mqSet.maxBitrateKbps*1000))
+                          || _mqBwMap[String(profile || 'P3').toUpperCase()] || 25000000;
@@ -10000,3 +10006,3 @@
             const _mqResMap = { … };
-            const _mqRes = _mqResMap[String(profile || 'P3').toUpperCase()] || '1920x1080';
+            const _mqRes = _mqSet.resolution || _mqResMap[String(profile || 'P3').toUpperCase()] || '1920x1080';
```

**Prueba:** cambiar `settings.resolution` de P3 en el JSON y regenerar → la lista debe reflejar el nuevo valor
sin tocar el JS. Assert: `emitido(P3).RESOLUTION === json.profiles_calibrated.P3.settings.resolution`.

---

## F-APP-11 — MEDIUM · `#EXT-X-I-FRAME-STREAM-INF` global con par `L153` + `1920x1080` incoherente

**Archivo:** `m3u8-typed-arrays-ultimate.js` **Línea:** `3061` (contexto: cabecera global de la lista, `3039-3075`)

**Evidencia transcrita**
```js
3061: #EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=450000,AVERAGE-BANDWIDTH=400000,CODECS="hvc1.2.4.L153.B0",RESOLUTION=1920x1080
```

**Clasificación: DATO CALIBRADO incoherente (Ley Cardinal 1, en dirección sobre-declarada).**
**Positivo:** **no** lleva `URI=` → cumple el invariante anti-509 ✅.

**Causa raíz:** `L153` (Level 5.1 = techo **4K@60**) se declara junto a `RESOLUTION=1920x1080` (que requiere
L123 como máximo). El nivel **excede** lo que la resolución necesita. No es el caso del freeze (ahí el nivel era
*insuficiente*), pero es una declaración falsa y, peor, esta línea es **global** (una por lista) mientras los
STREAM-INF son per-canal: un player que use el I-FRAME para trick-play verá un códec distinto al de la variante.

**Impacto:** inconsistencia declarativa; puede confundir el `CapLevelController` y el trick-play. No rompe
reproducción.

**Fix mínimo propuesto (NO aplicado)** — derivar del mismo `{w,h,fps}` que el resto:
```diff
@@ -3059,4 +3059,6 @@
-    #EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=450000,AVERAGE-BANDWIDTH=400000,CODECS="hvc1.2.4.L153.B0",RESOLUTION=1920x1080
+    // [F-APP-11] Nivel coherente con SU PROPIA resolución (1920x1080) — no el CORONA 4K.
+    // Sin URI= (invariante anti-509 intacto).
+    #EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=450000,AVERAGE-BANDWIDTH=400000,CODECS="hvc1.2.4.L123.B0",RESOLUTION=1920x1080
```

**Prueba:** parsear la lista y comprobar `reqLevel(1920,1080,fps) === levelOf(I-FRAME CODECS)`.

---

## F-APP-12 — MEDIUM · Fallback `L153` sin mirar resolución si falta `cfg.codec_string`

**Archivo:** `m3u8-typed-arrays-ultimate.js` **Línea:** `6858` (contexto `6840-6875`)

**Evidencia transcrita**
```js
6857:             case 'HEVC':
6858:                 codecs = cfg.codec_string || ('hvc1.2.4.L153.B0,' + (cfg.audio_codec || 'mp4a.40.2'));
6859:                 videoRange = cfg.video_range || 'PQ';
6860:                 hdcpLevel = cfg.hdcp_level || 'NONE';
6861:                 break;
```

**Clasificación: DEFAULT LEGÍTIMO con riesgo (Ley Cardinal 1).**
**Positivo:** `hdcpLevel = cfg.hdcp_level || 'NONE'` (L6860) → **sin** `TYPE-1` hardcodeado: es el `D-1 FIX
2026-05-18` documentado en L6848-6850 ✅.

**Causa raíz:** si el SSOT no propaga `codec_string`, se estampa `L153` (4K@60) sea cual sea `res`. Con
`res = 1920x1080` el nivel es excesivo; con `res = 7680x4320` es **insuficiente** (reproduce el freeze).

**Fix mínimo propuesto (NO aplicado)**
```diff
@@ -6857,3 +6857,8 @@
             case 'HEVC':
-                codecs = cfg.codec_string || ('hvc1.2.4.L153.B0,' + (cfg.audio_codec || 'mp4a.40.2'));
+                // [F-APP-12] Si el SSOT no trae codec_string, derivar el nivel de {res,fps} — jamás L153 fijo.
+                codecs = cfg.codec_string || (function () {
+                    const _h = parseInt(String(res).split('x')[1], 10) || 1080;
+                    const _f = Number(fps) || 30;
+                    const _l = (_h >= 4320) ? ((_f > 100) ? 186 : (_f >= 50 ? 183 : 180))
+                             : (_h >= 2160) ? ((_f > 60) ? 156 : (_f >= 50 ? 153 : 150))
+                             : (_h >= 1080) ? ((_f >= 50) ? 123 : 120)
+                             : (_h >= 720) ? 93 : 90;
+                    return 'hvc1.2.4.L' + _l + '.B0,' + (cfg.audio_codec || 'mp4a.40.2');
+                })();
```

**Prueba:** borrar `codec_string` del perfil y generar en P0 → el `CODECS=` debe salir `L183`/`L186`, no `L153`.

---

## F-APP-13 — MEDIUM · `BANDWIDTH=5100000` fijo con `RESOLUTION` dinámica

**Archivo:** `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php` **Línea:** `6109`

**Evidencia transcrita**
```php
6109:         $output .= "#EXT-X-STREAM-INF:BANDWIDTH=5100000,AVERAGE-BANDWIDTH=5100000,RESOLUTION={$detected_res},CODECS=\"{$detected_codec},mp4a.40.2\"\n";
6110:         $output .= $best_quality_url . "\n";
```

**Clasificación: VIOLACIÓN (coherencia BANDWIDTH↔RESOLUTION).**
**Positivo:** estructura correcta — STREAM-INF **inmediatamente** seguido de **una** URL (L6110) ✅.

**Causa raíz:** `$detected_res` es dinámico (L6041/6049: `'3840x2160'`) y `$detected_codec` dinámico
(L6050-6083), pero `BANDWIDTH` está fijo en 5.1 Mbps. Para 3840x2160 son ~1.3 bps/píxel: ABR infravalora la
variante y puede quedar clavado en calidad baja, o —peor— el player descarta la variante por incoherencia.

**Fix mínimo propuesto (NO aplicado)**
```diff
@@ -6107,4 +6107,10 @@
-        $output .= "#EXT-X-STREAM-INF:BANDWIDTH=5100000,AVERAGE-BANDWIDTH=5100000,RESOLUTION={$detected_res},CODECS=\"{$detected_codec},mp4a.40.2\"\n";
+        // [F-APP-13] BANDWIDTH coherente con la RESOLUTION realmente detectada.
+        $bwMap = ['3840x2160' => 28000000, '2560x1440' => 16000000, '1920x1080' => 12000000,
+                  '1280x720' => 5500000, '854x480' => 2500000];
+        $bwOut = $bwMap[$detected_res] ?? 12000000;
+        $output .= "#EXT-X-STREAM-INF:BANDWIDTH={$bwOut},AVERAGE-BANDWIDTH=" . (int)round($bwOut * 0.78)
+                 . ",RESOLUTION={$detected_res},CODECS=\"{$detected_codec},mp4a.40.2\"\n";
```

**Prueba:** cada combinación `(res, bandwidth)` emitida debe estar en la tabla de `CLAUDE.md`.

---

## F-APP-14 — LOW · `HDCP-LEVEL` default `TYPE-1` incondicional

**Archivo:** `m3u8-typed-arrays-ultimate.js` **Línea:** `10101-10102`

**Evidencia transcrita**
```js
10101:         const _hdcpLevel = _hdcpMap[_hdcpChId] || 'TYPE-1';
10102:         const _stableVariantId = `${_hdcpChId}_${profile}`;
```

**Clasificación: DATO CALIBRADO doctrinal (HDCP-Adaptive Engine, 2026-05-19) — NO es violación vigente, pero
contradice el criterio #6 escrito.**

**Análisis:** `CLAUDE.md` dice en «PROHIBIDO (hardcoded eliminado)»: `HDCP-LEVEL="TYPE-1" hardcoded universal ←
ELIMINADO`, y en los «10 Criterios de Éxito»: «6. **0 HDCP-LEVEL hardcodeado** (TYPE-1 eliminado)». Pero la
sección **HDCP-Adaptive Engine (2026-05-19)** del mismo archivo lo reinstaura explícitamente: «`HDCP-LEVEL=TYPE-1`
ahora se emite **por defecto agresivo** en cada `EXT-X-STREAM-INF`, con override per-canal a `NONE` cuando Conviva
detecta `VST > 3000ms`». El código implementa **exactamente** el comportamiento documentado más reciente.

**Impacto:** un `TYPE-1` en device con HDMI HDCP 1.4 sin el daemon → pantallazo negro hasta que Conviva detecte
VST>3000ms y escriba el incidente (1 ciclo de zap de latencia). Riesgo **aceptado** por la doctrina.

**Acción propuesta (NO es código, es documentación):** anotar en `CLAUDE.md` que el criterio #6 está
**SUPERSEDED** por el HDCP-Adaptive Engine, para que futuras auditorías no lo reporten como regresión. Diff
textual sugerido:
```diff
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@
-6. **0 HDCP-LEVEL hardcodeado** (TYPE-1 eliminado)
+6. **HDCP-LEVEL nunca literal en el emisor**: siempre `APE_HDCP_PROFILE[chId] || 'TYPE-1'`
+   (default doctrinal del HDCP-Adaptive Engine 2026-05-19 — SUPERSEDES «TYPE-1 eliminado»).
```
**Prueba:** ningún `HDCP-LEVEL=` en la lista debe provenir de una constante (siempre de `_hdcpMap` o del probe).

---

## F-APP-15 — LOW · `RQ_SECRET_TOKEN` con valor placeholder por defecto

**Archivo:** `resolve_quality_unified.php` **Línea:** `464`

**Evidencia transcrita**
```php
464: if (!defined('RQ_SECRET_TOKEN')) define('RQ_SECRET_TOKEN', 'cambia_esto_por_un_secreto_aleatorio_64chars');
```

**Clasificación: DATO CALIBRADO / riesgo de seguridad.** **No es un secreto expuesto** (es un placeholder
explícito, no una credencial real) — buena práctica de no filtrar nada. Pero si producción no define
`RQ_SECRET_TOKEN`, el token es un valor **público conocido del repositorio**.

**Fix mínimo propuesto (NO aplicado):** fallar cerrado en vez de degradar a un token conocido:
```diff
@@ -464,1 +464,4 @@
-if (!defined('RQ_SECRET_TOKEN')) define('RQ_SECRET_TOKEN', 'cambia_esto_por_un_secreto_aleatorio_64chars');
+if (!defined('RQ_SECRET_TOKEN')) {
+    // [F-APP-15] Un token por defecto conocido = auth trivialmente falsificable. Fallar cerrado.
+    throw new RuntimeException('RQ_SECRET_TOKEN no configurado: defina el secreto en el entorno del VPS.');
+}
```
**Prueba:** arrancar sin `RQ_SECRET_TOKEN` → excepción explícita, no token por defecto.

---

## F-APP-16 — LOW · Umbrales de bitrate hardcodeados en el «VPS image upgrade»

**Archivo:** `m3u8-typed-arrays-ultimate.js` **Líneas:** `10264-10280`

**Evidencia transcrita**
```js
10266:                     if (_bwObs >= 22000000 && _iqData.cascade_type) {
10268:                         _codec796_csv = 'hvc1.2.4.L153.B0';
10269:                         _res796_csv   = '3840x2160';
10273:                     } else if (_bwObs >= 12000000 && _codecSource === 'f4-avc-safe' && _iqData.cascade_type) {
10275:                         _codec796_csv = 'hvc1.2.4.L120.B0';
10276:                         _res796_csv   = '1920x1080';
```

**Clasificación: DATO CALIBRADO (los pares resolución↔nivel **son correctos**: L153↔2160p60, L120↔1080p30) con
umbrales fuera del SSOT.**
**Positivo:** el guard `cascade_type` (evidencia HEVC verificada) evita el freeze «H.264 a 22 Mbps declarando
L153» documentado en L10252-10256 ✅.

**Riesgo:** `22000000`/`12000000` no vienen del SSOT. Si el LAB recalibra pisos, la promoción de tier queda
desfasada.

**Fix mínimo propuesto (NO aplicado):** mover ambos umbrales a `config_global` del SSOT y leerlos con el literal
como fallback (`_iqData.bw_threshold_4k ?? 22000000`).

---

## F-APP-17 — LOW · DASH `<Representation>` con `hev1` y dimensiones fijas

**Archivo:** `vps/ape_hls_generators.php` **Líneas:** `441`, `446`

**Evidencia transcrita**
```php
441:       <Representation id="v4k" bandwidth="11600000" width="3840" height="2160" frameRate="60" codecs="hev1.2.4.L153.B0">
446:       <Representation id="vfhd" bandwidth="5500000" width="1920" height="1080" frameRate="60" codecs="hev1.2.4.L150.B0">
```

**Clasificación: DATO CALIBRADO.** En **DASH**, `codecs="hev1…"` es legítimo (la GOLDEN RULE es específica de la
emisión HLS: `hvc1` en `EXT-X-STREAM-INF`). **No es violación de GOLDEN RULE.**
**Incoherencia real:** `vfhd` declara `1920x1080@60` con `L150` (Level 5.0 = 4K@30 / 1080p@30-60 según perfil) —
el par nivel↔resolución está al límite; y `bandwidth="5500000"` para 1080p60 es bajo pero plausible.

**Fix mínimo propuesto (NO aplicado):** derivar de `$cfg` en vez de literal, y alinear `vfhd` a `L123`
(1080p@60) para eliminar la ambigüedad.

---

## F-APP-18 — LOW · `3840x2160` y ABR-LADDER hardcodeados en EXTHTTP/directivas APE

**Archivo:** `resolve_quality_unified.php` **Líneas:** `394`, `4665`, `5438`

**Evidencia transcrita**
```php
394: 'video_resolution' => isset($_GET['p']) && $_GET['p'] === 'P0' ? '3840x2160' : '1920x1080',
4665:            $exthttp['X-RESOLUTION-TARGET'] = '3840x2160';
5438:        $d[] = '#EXT-X-APE-ABR-LADDER: 7680x4320@120fps,3840x2160@120fps,1920x1080@60fps';
```

**Clasificación: DATO CALIBRADO.** La L5438 declara un ladder que **contradice el clamp de la APP** (la lista
nunca declara 8K@120 porque el JS clampa a 60 y corrige el nivel): el tag es telemetría privada, pero un
dashboard que lo lea creerá que existe una variante 8K@120.

**Fix mínimo propuesto (NO aplicado):** emitir el ladder desde el perfil real (o eliminar el tag si no se puede
derivar), y en L394/4665 usar el `res` del perfil en lugar de la constante.

---

## F-APP-19 — INFO (SSOT, no APP) · El JSON calibrado contiene la firma del freeze 2026-06-08

**Archivo:** `IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json`
**Ruta de la clave:** `profiles_calibrated.P1.settings`

**Evidencia medida (dump del JSON)**
```json
"P1": { "name": "4K UHD",
  "settings": { "resolution": "7680x4320", "fps": "120",
                "codec_full": "hvc1.2.4.L153.B0",
                "codec_string": "hvc1.2.4.L153.B0,ac-3",
                "codec_primary": "HEVC", "maxResolution": "7680x4320", "targetFps": "120" } }
```

**Clasificación: VIOLACIÓN EN EL SSOT (Ley Cardinal 1).** `L153` = 4K@60. Declararlo para **8K@120** es
literalmente el escenario del post-mortem del manifiesto («el JSON dejó la resolución de P1 en 8K@120 … la lista
declara 8K@120 con codec HEVC Level 5.1 (techo 4K@60) = imposible → freeze»).

**Por qué NO se materializa hoy en la lista:** la APP lo **enmascara** por dos vías independientes:
`__apeStreamTruth` clampa `fps` 120→60 (L2519) y recalcula el nivel a L183 (L2567-2575). Es decir: **la lista
sale segura a pesar del SSOT, no gracias a él.**

**Riesgo residual (el que importa):** cualquier consumidor que **no** pase por `__apeStreamTruth` — la ruta
`maxQualityMode` (F-APP-03) y todo el resolver PHP (F-APP-01) — **hereda el valor imposible tal cual**.

**Acción propuesta:** **no** tocar el JSON desde esta tarea (es SSOT, y hay lock + otra sesión trabajando).
Escalar al lane del Excel/SSOT con esta evidencia y la corrección esperada:
`P1.settings.codec_full → hvc1.2.4.L183.B0` (8K@60) **o** `resolution → 3840x2160` con `codec_full → hvc1.2.4.L153.B0`.
Las dos son coherentes; la elección es del propietario.

**Más drift medido en el mismo JSON (para el lane SSOT):**

| Perfil | `name` dice | `resolution` dice | Coherente |
|---|---|---|---|
| P1 | `4K UHD` | `7680x4320` | ❌ (nombre vs resolución) |
| P2 | `2K QHD` | `3840x2160` | ❌ (nombre vs resolución) |
| P3 | `FHD 1080p` | `3840x2160` | ❌ |
| P4 | `HD 720p` | `3840x2160` | ❌ |
| P5 | `SD 480p` | `3840x2160` | ❌ |
| — | todos | `fps=120` | ❌ vs `CLAUDE.md` (P3=1080p@60, P4=720p@30, P5=480p@30) |

Además, `settings.bitrate = "40"` (P1), `chroma_subsampling = "168055555555556"` (**valor corrupto**: es
`4/2/0` dividido por una celda vacía de Excel → `1.6805e14`). El chroma corrupto es evidencia directa de una
**fórmula Excel rota** en el LAB: el lane SSOT debe revisarla.

---

## F-APP-20 / F-APP-21 / F-APP-22 — INFO · Lo que se revisó y está BIEN

Estos se documentan para que futuras auditorías **no los reporten como regresión**.

### F-APP-20 · `codec_ladder_hev1` idéntico 6× en `ape-profiles-config.js`
`L347, 982, 1616, 2110, 2744, 3378` → `hev1.2.4.L186.B0,…,hev1.2.4.L90.B0…`. **Legítimo:** es la cascada de
**familias** `hev1` para runtime (KODIPROP/EXTVLCOPT), no una declaración STREAM-INF. Repetirla 6× es un default
por perfil, no drift de calibración (aunque sería más limpio derivarla).

### F-APP-21 · Tabla de bitrate y codecs F2/F3/F4 del resolver
`ape-fallback-resolver.js`:
- `L36` `'3840x2160': { bandwidth: 28000000, averageBandwidth: 22000000 }` → **coincide exactamente** con la tabla
  «Bitrate Fallback por Resolución» de `CLAUDE.md` ✅
- `L238` `probeData.videoCodec || 'hvc1.2.4.L150.B0'` → default L150 (4K@30), coherente ✅
- `L301` `_premiumCodec = 'hvc1.2.4.L153.B0'` → F2 `HEVC_PREMIUM_HINT`, exactamente lo que manda `CLAUDE.md` ✅
- `L355` `_safeCodec = _is4kProfile3 ? 'hvc1.2.4.L153.B0' : 'hvc1.2.4.L120.B0'`, luego resuelto por
  `cascade.resolveTierByResolution(3840|1920, 2160|1080, fps)` (L356-360) → **par coherente** ✅
- `L370` `fallbackCodec: 'hvc1.2.4.L93.B0'` → **no** entra en `CODECS=` (`emitStreamInfFromTruth` usa `truth.codec`,
  no `truth.fallbackCodec`) → sin violación ✅
- `L403` `_f4Codec = 'hvc1.2.4.L93.B0'` con `res` default `1280x720` → coherente ✅
- `L579-581` `SUPPLEMENTAL-CODECS` **solo si `supplementalCodecsVerified`** → cero fabricación ✅
- `L554-566` `VIDEO-RANGE=PQ` incondicional con escape `APE_PQ_PROFILE[chId]==='SDR'` → doctrina 2026-06-16 +
  rollback Phase G implementados ✅

### F-APP-22 · GOLDEN RULE estructuralmente garantizada en `ape-hevc-cascade.js`
`L27-39`: cada uno de los 13 tiers declara **par explícito** `codec: 'hvc1.2.4.Lxx.B0'` **y**
`codec_hev1: 'hev1.2.4.Lxx.B0'`. `resolveCodecHev1ForChannel` (L324-332) devuelve el `hev1`; el emisor lo usa
**solo** en `#EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1` (`m3u8-typed-arrays-ultimate.js:9954`), nunca en `CODECS=`.
Es la mejor defensa estructural contra el cruce: **el par hace imposible olvidar una de las dos caras** ✅

---

## F-APP-23 — HIGH · `BANDWIDTH` emitido contradice `bandwidth_max` del SSOT

**Archivo:** `m3u8-typed-arrays-ultimate.js` **Líneas:** `7836-7851` (+ bridge `:1583,:1602,:1614-1621`)

**Evidencia transcrita**
```js
7836:         const _bw796_raw = _probeData?.bandwidth
7837:             || (cfg.bitrate ? Math.round(cfg.bitrate * 1000) : 80000000);
...
7845:         const _labFloor = (cfg.bitrate_floor_mbps != null && !isNaN(cfg.bitrate_floor_mbps))
7846:             ? Math.round(Number(cfg.bitrate_floor_mbps) * 1000000)
7847:             : 0;
7848:         const _fallbackFloor = _resW796 >= 3840 ? 14000000 : (_resW796 >= 1920 ? 5000000 : 2000000);
7849:         const _bitrateFloor = _labFloor || _fallbackFloor;
7850:         const _bw796 = Math.max(_bw796_raw, _bitrateFloor);
7851:         const _avgBw = Math.round(_bw796 * 0.85);
```
Bridge SSOT (`:1583`): `bitrate: s.bitrate ? Math.round(s.bitrate * 1000) : hardcoded.bitrate` → kbps.

**Clasificación: DATO CALIBRADO (magnitud incoherente con el SSOT).**

**Causa raíz / medición.** El `BANDWIDTH` emitido sale de `settings.bitrate` (**Mbps**) × 1e6, **no** de
`settings.bandwidth_max`. Contra el JSON:

| Perfil | `settings.bitrate` (Mbps) | `BANDWIDTH` emitido (bps) | `settings.bandwidth_max` (SSOT) | Desvío |
|---|---:|---:|---:|---|
| P0 | **200** | `200 000 000` | `80 000 000` | **+150 %** |
| P1 | 40 | `40 000 000` | `28 000 000` | +43 % |
| P2 | 25 | `25 000 000` | `16 000 000` | +56 % |
| P3 | 15 | `15 000 000` | `12 000 000` | +25 % |
| P4 | 10 | `10 000 000` | `9 000 000` | +11 % |
| P5 | 2 | `4 000 000` (piso Prisma gana) | `5 500 000` | **−27 %** |

**Impacto:** en P0 el SSOT tiene **dos valores contradictorios entre sí** (`bitrate="200"` vs
`bandwidth_max="80000000"` vs `maxBitrateKbps="200000"`). El emisor opta por el mayor ⇒ declara 200 Mbps.
En P5 ocurre lo inverso (el piso Prisma de 4 Mbps **supera** `bitrate`=2 Mbps y el resultado queda por debajo de
`bandwidth_max`). El `BANDWIDTH` deja de ser comparable con la calibración.

**Fix mínimo propuesto (NO aplicado)**
```diff
@@ -7836,3 +7836,7 @@
-        const _bw796_raw = _probeData?.bandwidth
-            || (cfg.bitrate ? Math.round(cfg.bitrate * 1000) : 80000000);
+        // [F-APP-23] Prioridad: probe (evidencia real) > bandwidth_max del SSOT > bitrate×1e6 > 80 Mbps.
+        const _bwSSOTmax = Number((cfg.settings && (cfg.settings.bandwidth_max || cfg.settings.maxBitrateKbps)) || 0) || 0;
+        const _bw796_raw = _probeData?.bandwidth
+            || _bwSSOTmax
+            || (cfg.bitrate ? Math.round(cfg.bitrate * 1000) : 80000000);
```

**Prueba:** `BANDWIDTH` emitido == `settings.bandwidth_max` cuando no hay probe, para los 6 perfiles.

---

## F-APP-24 — MEDIUM · `VIDEO-RANGE=PQ` incondicional sobre perfiles `SDR` con AVC

**Archivo:** `m3u8-typed-arrays-ultimate.js` **Líneas:** `2576-2581` (+ SSOT `settings.video_range`)

**Evidencia transcrita**
```js
2576:         // PQ: LOCK 2026-06-16 ON por defecto ⇒ incondicional. Con CRYSTAL FAKE-UHD
2577:         // activo (modo '8k' o '4k') la declaración PQ también es incondicional
2580:         const fakeActive = (o.fakeUhd === '8k' || o.fakeUhd === '4k' || o.fakeUhd === true);
2581:         r.pqAllowed = fakeActive ? true : ((o.pqGate === true) ? (r.hdr === true) : true);
```

**Clasificación: VIOLACIÓN de coherencia con el SSOT** (no de la GOLDEN RULE; tampoco rompe Ley Cardinal 1).

**Causa raíz:** `settings.video_range` del SSOT es `"SDR"` en **P3, P4 y P5**, y `bit_depth` es 8. Con `fakeActive`
por defecto, `pqAllowed` es `true` para esos tres perfiles ⇒ la lista declara `VIDEO-RANGE=PQ` sobre un perfil
calibrado como SDR, y además sobre `avc1.64003E` (H.264) — combinación que el propio repo documenta como causa de
color shift / handshake HDR fallido en displays no-HDR (y el comentario `:10016-10017` lo reconoce).

**Impacto:** `VIDEO-RANGE` es el único rango **por perfil** en el SSOT y se ignora. P3–P5 (los perfiles de
compatibilidad, cuyo propósito es no romper devices débiles) son justo los que reciben PQ.

**Fix mínimo propuesto (NO aplicado)**
```diff
@@ -2580,2 +2580,6 @@
         const fakeActive = (o.fakeUhd === '8k' || o.fakeUhd === '4k' || o.fakeUhd === true);
-        r.pqAllowed = fakeActive ? true : ((o.pqGate === true) ? (r.hdr === true) : true);
+        // [F-APP-24] El rango lo calibra el SSOT por perfil (P3/P4/P5 = "SDR").
+        // PQ incondicional solo donde el perfil NO está calibrado como SDR.
+        const _ssotSdr = (String(o.profileVideoRange || '').toUpperCase() === 'SDR');
+        r.pqAllowed = _ssotSdr ? false
+                              : (fakeActive ? true : ((o.pqGate === true) ? (r.hdr === true) : true));
```
(requiere pasar `profileVideoRange: cfg.video_range` en la llamada de `:10318-10344`.)

**Prueba:** con el SSOT actual, P3/P4/P5 **no** deben emitir `VIDEO-RANGE`; P0/P1/P2 sí (PQ).

---

## F-APP-25 — MEDIUM · El `I-FRAME-STREAM-INF` por canal declara un códec distinto del `STREAM-INF`

**Archivo:** `m3u8-typed-arrays-ultimate.js` **Línea:** `9949`

**Evidencia transcrita**
```js
9949:         lines.push(`#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=${Math.round(_bw796 * 0.025)},CODECS="${_codec796}"`);
```

**Clasificación: VIOLACIÓN de coherencia interna.** **Positivo:** sin `URI=` ✅.

**Causa raíz:** esta línea se emite **antes** de que `__apeStreamTruth` corrija el nivel (`:10318-10375`), y usa
`_codec796` (valor pre-truth = `codec_chain_video[0]` = `hvc1.2.4.L153.B0`). El `STREAM-INF` de la línea `10370` sí
emite el código corregido (`hvc1.2.4.L183.B0` con fake-8K). Resultado en el **mismo bloque de canal**:

```
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=5000000,CODECS="hvc1.2.4.L153.B0"     ← L153 (4K@60)
#EXT-X-STREAM-INF:BANDWIDTH=200000000,…,RESOLUTION=7680x4320,CODECS="hvc1.2.4.L183.B0,…"
```
Dos declaraciones de códec distintas para la misma variante.

**Impacto:** players que usan el I-FRAME para trick-play o para negociar decoder antes del primer segmento ven un
nivel distinto al de la variante principal. No provoca freeze por sí solo (el trick-play es opcional), pero rompe
la trazabilidad y puede confundir la selección de decoder.

**Fix mínimo propuesto (NO aplicado)** — mover la emisión después del cálculo del truth:
```diff
@@ -9949,1 +9949,2 @@
-        lines.push(`#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=${Math.round(_bw796 * 0.025)},CODECS="${_codec796}"`);
+        // [F-APP-25] Diferido: se emite tras __apeStreamTruth (L10370) para usar el nivel corregido.
+        // (mover el push a después de _streamInfLine, usando _streamTruth.codec)
```

**Prueba:** `codecsOf(I-FRAME) === codecsOf(STREAM-INF)` dentro del mismo bloque de canal.

---

## F-APP-26 — LOW · Factor de `AVERAGE-BANDWIDTH` literal vs SSOT

**Archivo:** `m3u8-typed-arrays-ultimate.js` **Línea:** `7851`

**Evidencia transcrita**
```js
7851:         const _avgBw = Math.round(_bw796 * 0.85);
```
SSOT: `settings.avg_bandwidth_ratio = "0.78"`.

**Clasificación: DATO CALIBRADO fuera del SSOT (drift menor).** El 0.85 aparece además duplicado en
`:10272` (`_avgBw_final = Math.round(_bw796_final * 0.85)`) y en `:10279`.

**Fix mínimo propuesto (NO aplicado):** `const _avgBw = Math.round(_bw796 * (Number(cfg.settings?.avg_bandwidth_ratio) || 0.85));`

**Prueba:** `AVERAGE-BANDWIDTH / BANDWIDTH === 0.78` con el SSOT actual.

---

## INVARIANTES ANTI-509 / RFC: verificación explícita

| Invariante | Resultado | Evidencia |
|---|---|---|
| Una URL por canal | ✅ **CUMPLE** | JS: `m3u8-typed-arrays-ultimate.js:10388` `let finalUrl = …` (una sola asignación consumida al final del bloque). PHP: `resolve_quality_unified.php:4846` (`$out .= $url`) y `:5642` (`$output[] = $streamUrl`) — exactamente una |
| Cero `#EXT-X-MEDIA URI=` | ✅ **CUMPLE** | 0 emisiones de `#EXT-X-MEDIA` en JS/PHP; sólo aparecen `#EXT-X-MEDIA-SEQUENCE` (`m3u8-typed-arrays-ultimate.js:226`, `ape_hls_generators.php:595,723`) |
| Cero `#EXT-X-I-FRAME-STREAM-INF URI=` | ✅ **CUMPLE** | `m3u8-typed-arrays-ultimate.js:3061` y `:9949` emiten sin `URI=` |
| Un `#EXT-X-STREAM-INF` por canal | ⚠️ **ROTO en P0/P1** | `resolve_quality_unified.php:4544` añade uno global + `:5514` uno por canal ⇒ **2 por documento** (F-APP-05) |
| `hvc1.*` sólo en STREAM-INF | ⚠️ **ROTA** | `ape_hls_generators.php:738` emite `hev1.*` en STREAM-INF (F-APP-02). Todo el JS cumple ✅ |
| `hev1.*` sólo en KODIPROP/EXTVLCOPT | ✅ **CUMPLE en JS** | JS: `hev1` aparece en EXTVLCOPT (L3326-3439), KODIPROP (L3760-3775), tags APE (L9954, L6992-6996) y headers — **ninguna** en `CODECS=` de STREAM-INF |
| F5 no emite STREAM-INF | ✅ **CUMPLE** | `ape-fallback-resolver.js:544` `if (!truth.canEmitStreamInf) return null` |
