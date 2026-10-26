# REMEDIATION_LOG — T11 · Remediación CRITICAL/HIGH en repo

**Task:** t11 · Attempt `f123e2a6-b1f0-40a0-976a-59221a607249`
**Fecha:** 2026-10-25 (America/Bogota)
**Veredicto de partida:** t9 = **FAIL** (16 PASS / 32 FAIL / 5 UNKNOWN; L1/L2/L3 FAIL)
**Alcance ejecutado:** reducido por instrucción del capitán (D-05) a lo **editable hoy**: `vps/ape_hls_generators.php`.
**Commits:** **CERO**. Todo queda en el working tree (`git diff` incluido abajo).

---

## 0. Resumen ejecutivo

| # | Fix | Archivo | Resultado |
|---|---|---|---|
| **B-10** | GOLDEN RULE: `hev1.*` en `#EXT-X-STREAM-INF:CODECS=` → `hvc1.*` | `vps/ape_hls_generators.php:740` | ✅ **APLICADO** |
| **B-11** | CMAF/`EXT-X-MAP` sin evidencia real → retirado | `vps/ape_hls_generators.php:730` | ✅ **APLICADO** |
| — | Comentario/docblock obsoleto tras B-11 | `vps/ape_hls_generators.php:624-629` | ✅ **APLICADO** (evita re-introducción) |
| **B-05** | fake-8K default ON (+ typo `APE_Fake_UHD`) | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | ⛔ **BLOCKED_BY_LOCK** (L-001 / t44) |
| **B-06** | `FRAME-RATE=120` con `L153` | `backend/resolve_quality_unified.php:5519-5520` | ⛔ **BLOCKED_BY_WIP** |
| **B-09** | STREAM-INF huérfano sin URI | `backend/resolve_quality_unified.php:4544` | ⛔ **BLOCKED_BY_WIP** |
| **B-13** | `I-FRAME-STREAM-INF` incoherente | `m3u8-typed-arrays-ultimate.js:3061, 9972` | ⛔ **BLOCKED_BY_LOCK** |
| **B-10b** | `FRAME-RATE=120` con nivel insuficiente (hallazgo nuevo) | `vps/ape_hls_generators.php:739` | ⚠️ **NO APLICADO** — requiere decisión (ver §4) |
| — | ¿`rq_streaming_health_engine.php` replica el patrón? | `backend/rq_streaming_health_engine.php` | ✅ **NO APLICA** (0 STREAM-INF, 0 `hev1`, 0 `hvc1`) |
| **B-15** | commit `ape-meta-public.conf` | — | ✅ Ya cerrado por el capitán (`3de6b0a`) — **no tocado** |

**Un solo archivo modificado** en todo el repositorio por esta tarea: `IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php`
(`git diff --numstat` = `10 7`).

---

## 1. Pre-flight: por qué solo ese archivo

### 1.1 Locks vigentes (`.session/locks.json` + `BOARD.json → locks[]`)

| Lock | Ruta | Owner | `blocks_write_for_this_team` |
|---|---|---|---|
| **L-001** | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/**` | dsh-lead (t44) | **true** |
| L-002 | `IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/**` | dsh-lead (t44) | true |
| L-003 | `tools/crystal-upscale/**` | dsh-lead (t47) | true |
| L-007 | `contracts/**` | DSH VPS (rea-recon) | true |

`vps/ape_hls_generators.php` **no** está bajo `vps/production_mirror/**` ⇒ **libre**. Confirmado también por el capitán.

### 1.2 Estado de los 4 archivos in-scope al inicio (medido)

| Archivo | Bytes | mtime | git | ¿Dirty ajeno? | Decisión |
|---|---:|---|---|---|---|
| `vps/ape_hls_generators.php` | 39 678 | 2026-05-23T00:46:40 | limpio | No | **EDITAR** |
| `backend/resolve_quality_unified.php` | 348 758 | 2026-10-25T21:35:16 | ` M` | Sí (WIP) | **NO EDITAR** (D-05) |
| `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | 748 672 | **2026-10-25T23:11:04** | ` M` | Sí (t44 escribió tras mi t6) | **NO EDITAR** (L-001) |
| `backend/rq_streaming_health_engine.php` | 13 931 | 2026-04-06T01:01:25 | limpio | No | Revisar → no aplica |

**Nota de integridad:** el JS creció de 746 967 B (mi baseline t6) a 748 672 B (+1 705 B, +24 líneas) a las
**23:11:04**, es decir **después** de que yo cerrara t6 (22:59). Eso confirma escritura ajena activa y justifica
el bloqueo, no es una suposición.

---

## 2. FIX B-10 — GOLDEN RULE rota (`hev1.*` en STREAM-INF)

### 2.1 Localización y verificación de contexto (orden del capitán: «verifica el contexto antes de tocar»)

`hev1` aparecía **3 veces** en el archivo, en **2 contextos distintos**:

| Línea | Contexto | Función | Veredicto |
|---:|---|---|---|
| 441 | `<Representation ... codecs="hev1.2.4.L153.B0">` | `generate_dash_mpd()` (def. L403) | ✅ **LEGÍTIMO** — DASH, no HLS. La GOLDEN RULE aplica a `EXT-X-STREAM-INF` (HLS) |
| 446 | `<Representation ... codecs="hev1.2.4.L150.B0">` | `generate_dash_mpd()` | ✅ **LEGÍTIMO** — DASH |
| **738** | `? 'hev1.2.4.L153.B0,mp4a.40.2'` | **`serve_cmaf_m3u8_fallback()`** (def. L633) | ⛔ **VIOLACIÓN** — se interpola en `#EXT-X-STREAM-INF:CODECS=` (HLS, L744-745) |

**No se tocaron 441 ni 446.** Romper DASH no estaba pedido y no es una violación.

### 2.2 Antes / después

**ANTES** (`vps/ape_hls_generators.php:737-739`):
```php
    $codecs     = ($cfg['codec_primary'] === 'HEVC' || $cfg['codec_primary'] === 'hevc')
                    ? 'hev1.2.4.L153.B0,mp4a.40.2'
                    : 'avc1.640028,mp4a.40.2';
```

**DESPUÉS** (`:738-742`):
```php
    // [T11/B-10] GOLDEN RULE: hvc1.* SOLO en #EXT-X-STREAM-INF:CODECS=.
    // hev1.* queda reservado a KODIPROP/EXTVLCOPT (decoder runtime). Cruzarlos rompe Tizen/webOS.
    $codecs     = ($cfg['codec_primary'] === 'HEVC' || $cfg['codec_primary'] === 'hevc')
                    ? 'hvc1.2.4.L153.B0,mp4a.40.2'
                    : 'avc1.640028,mp4a.40.2';
```

**Cambio funcional:** exactamente **una palabra** (`hev1.` → `hvc1.`). Nivel (`L153`) y resolución declarada
**sin cambios**, tal como ordenó el capitán.

**Justificación doctrinal:** GOLDEN RULE (`CLAUDE.md` + skill `ape-vps-hevc-crystal-integrator`, truth-guard 6):
`hvc1.*` solo en `EXT-X-STREAM-INF CODECS=`; `hev1.*` solo en KODIPROP/EXTVLCOPT. La propia doctrina del repo
(`m3u8-typed-arrays-ultimate.js:28-29`) lo dice: «REGLA DE ORO: NUNCA cruzar. hev1 en STREAM-INF rompe Tizen/webOS».

---

## 3. FIX B-11 — CMAF declarado sin evidencia real

### 3.1 Distinción crítica: **dos** `EXT-X-MAP`, solo uno era falso

| Línea | Emisión | Función | ¿Evidencia real? | Acción |
|---:|---|---|---|---|
| 598 | `#EXT-X-MAP:URI="{$baseUrl}?sid={$ch}&seg=init-stream0.m4s"` | `serve_hls_fmp4_ignition()` (def. L532) | ✅ **SÍ**: la función hace `glob($cmafDir . '/chunk-stream0-*.m4s')` (L572) y solo llega ahí si el init segment existe (si no, L563-568 desvía al fallback). URI acaba en `.m4s` = requisito de `CLAUDE.md` criterio #4 | **NO TOCAR** |
| **729** | `#EXT-X-MAP:URI="{$providerM3u8}"` | `serve_cmaf_m3u8_fallback()` (def. L633) | ⛔ **NO**: apunta al **`.m3u8` del proveedor**. No es un init segment (`ftyp`+`moov`); es el manifest | **RETIRAR** |

### 3.2 Antes / después

**ANTES** (`:719-729`):
```php
    // ── Manifiesto HLS v7 con declaración CMAF ──
    echo "#EXTM3U\n";
    echo "#EXT-X-VERSION:7\n";
    echo "#EXT-X-TARGETDURATION:2\n";
    echo "#EXT-X-MEDIA-SEQUENCE:0\n";
    echo "#EXT-X-INDEPENDENT-SEGMENTS\n";

    // EXT-X-MAP apunta al .m3u8 del proveedor como hint de inicialización.
    // Los reproductores modernos (OTT Navigator, TiviMate, ExoPlayer) usan
    // este URI para negociar el codec antes de solicitar segmentos.
    echo "#EXT-X-MAP:URI=\"{$providerM3u8}\"\n";
```

**DESPUÉS** (`:719-730`):
```php
    // ── Manifiesto HLS: el .m3u8 del proveedor envuelto en master sintético ──
    echo "#EXTM3U\n";
    echo "#EXT-X-VERSION:7\n";
    echo "#EXT-X-TARGETDURATION:2\n";
    echo "#EXT-X-MEDIA-SEQUENCE:0\n";
    echo "#EXT-X-INDEPENDENT-SEGMENTS\n";

    // [T11/B-11] CMAF NO se declara aquí: esta ruta reenvía el .m3u8 del proveedor,
    // no un init segment fMP4. Un #EXT-X-MAP apuntando a un .m3u8 hace que ExoPlayer
    // intente parsearlo como init segment (ftyp+moov) y falle al inicializar el track.
    // Retirado hasta que exista evidencia real de init.mp4/.m4s verificado.
```

**Lo que NO se hizo (a propósito, «no inventes»):**
- No se fabricó un `init.mp4` ni un `URI` alternativo.
- No se cambió `#EXT-X-VERSION:7` → sigue siendo válido RFC 8216 y no daña nada; cambiarlo sería un diff
  innecesario sobre un archivo de producción.
- No se tocó el `EXT-X-MAP` legítimo de `serve_hls_fmp4_ignition` (L598).

### 3.3 Docblock obsoleto (mismo fix, evita re-introducción)

`vps/ape_hls_generators.php:624-629` — el docblock de `serve_cmaf_m3u8_fallback()` documentaba el MAP falso como
parte del contrato. Se sustituyó la línea por la nota de retirada; el resto del bloque queda intacto.

```diff
-//   - #EXT-X-MAP:URI="..." (apunta al .m3u8 del proveedor como init hint)
+//   - #EXT-X-MAP retirado en T11/B-11: esta ruta reenvía el .m3u8 del proveedor,
+//     no un init segment fMP4; declararlo producía un fallo de init en ExoPlayer.
```

---

## 4. FIX B-10b — Hallazgo NUEVO, **no aplicado** (necesita tu decisión)

Al extraer y ejecutar el bloque de emisión real (§5.3) apareció un defecto que **no estaba en el encargo** y que
ijustifica que revises el `?? 120`:

`vps/ape_hls_generators.php:739` → `$fps = $cfg['fps'] ?? 120;`

Con los valores por defecto (`res = 1920x1080`, `fps = 120`), la salida real es:

```
#EXT-X-STREAM-INF:BANDWIDTH=15150000,AVERAGE-BANDWIDTH=10100000,RESOLUTION=1920x1080,FRAME-RATE=120,CODECS="avc1.640028,mp4a.40.2"
```

**Aritmética (Ley Cardinal 1, en ambas familias):**

| Caso | Muestras/s o MB/s exigidos | Techo del nivel declarado | Veredicto |
|---|---|---|---|
| HEVC `L153` (5.1) @ 1920×1080×120 | 248 832 000 luma/s | MaxLumaSr L5.1 = **222 822 400** | ⛔ **excede** (necesita L5.2 = L156) |
| AVC `avc1.640028` (High@4.0) @ 1920×1080×120 | 8 160 MB/frame × 120 = **979 200 MB/s** | MaxMBPS L4.0 = **245 760** | ⛔ **excede ~4×** (necesita L5.1+) |
| HEVC `L153` @ 3840×2160×60 (caso típico con `$cfg` poblado) | 497 664 000 luma/s… (4K@60) | L153 = techo 4K@60 | ✅ coherente |

**Por qué NO lo apliqué:** el capitán acotó B-10 a la familia del códec y declaró **BLOCKED** el defecto idéntico
(`FRAME-RATE=120`/`L153`) en `resolve_quality_unified.php` (B-06) por ser WIP ajeno. Cambiar aquí el `fps` o el
nivel es la **misma decisión** y no me corresponde tomarla unilateralmente en un archivo de producción.

**Diff mínimo propuesto (D-15, listo para autorizar):**
```diff
--- a/IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
+++ b/IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
@@ -739,1 +739,4 @@
-    $fps        = $cfg['fps']      ?? 120; // MEMC-TOTAL-8K120: default 120fps
+    // [T11/B-10b · D-15] Sin evidencia de fps reales no se declara 120:
+    // 1080p@120 excede HEVC L5.1 y H.264 L4.0. Se declara 60 hasta que el probe lo verifique.
+    $fpsRaw     = (int)($cfg['fps'] ?? 60);
+    $fps        = (($cfg['fps_verified'] ?? false) === true) ? max(1, $fpsRaw) : min(max(1, $fpsRaw), 60);
```
Efecto: `FRAME-RATE` pasa a 60 y `L153`/`avc1.640028` quedan dentro de su techo. Un solo bloque, reversible,
sin cambiar resolución.

---

## 5. Verificación ejecutada (detalle en `VERIFY_OUTPUT.md`)

### 5.1 Sintaxis

```
"C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\rea-engines\php-8.3\php.exe" -l IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
No syntax errors detected in IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
EXIT=0
```
PHP portable **8.3.36** — la puerta que en t6 quedó `UNVERIFIED` **hoy sí se ejecutó**. ✅

### 5.2 Greps del contrato — **paso, pero con una trampa que debes saber**

| Comando | Resultado | ¿Prueba algo? |
|---|---|---|
| `Select-String ape_hls_generators.php -Pattern 'EXT-X-STREAM-INF.*hev1\.'` | **0** | ⚠️ **Vacuous incluso antes del fix.** `EXT-X-STREAM-INF` estaba en la línea 741 y `hev1` en la 738: el `.` de la regex **no cruza `\n`** ⇒ el patrón no podía casar nunca |
| `Select-String resolve_quality_unified.php -Pattern 'FRAME-RATE=120'` | **0** | ⚠️ **Vacuous.** El literal es interpolado (`FRAME-RATE={$fps}.000`, L5519); la cadena `FRAME-RATE=120` no existe en el archivo. **El defecto sigue intacto** |

Por eso añadí una prueba real (§5.3) en lugar de apoyarme en un grep que pasa por construcción.

### 5.3 Prueba real: emisión sobre los bytes del archivo

`audit/alignment/2026-10-25/60-remediacion/tools/tools_t11_emission_proof.php` — extrae el bloque de emisión
**verbatim** del archivo (por balance de llaves y marcadores), lo evalúa con 3 configuraciones y asserta sobre la
línea producida. Salida: **12/12 PASS, EXIT=0**.

```
== Salida real por caso ==
  [HEVC · 3840x2160@60]
    #EXT-X-STREAM-INF:BANDWIDTH=15150000,AVERAGE-BANDWIDTH=10100000,RESOLUTION=3840x2160,FRAME-RATE=60,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"
  [AVC  · 1920x1080@30]
    #EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=1920x1080,FRAME-RATE=30,CODECS="avc1.640028,mp4a.40.2"
PASS  B-11 · sin echo de EXT-X-MAP en el fallback (código, no comentarios)
PASS  B-10 · ningún literal hev1.* en el código del fallback (STREAM-INF HLS)
PASS  B-10 · CODECS usa hvc1.2.4.L153.B0
PASS  no-regresión · generate_dash_mpd (DASH) conserva hev1
TODAS LAS ASERCIONES PASAN
```

### 5.4 `node contracts/verify_contracts.mjs` → **FAIL (1 fallo, 11 ok)**

```
FAIL  SHA MISMATCH _vps_stage/tests/fanout_concurrency.sh: contrato 9b774bffbe6c744f… vs real b558b1cdff883579…
RESULT=FAIL (1 fallos, 11 ok)
```
**No es mío y no lo arreglo:**

- `_vps_stage/tests/emitter_level_assert.js` y `_vps_stage/tests/**` están bajo **L-004** (`no_touch`).
- El fallo es drift **preexistente**, ya reportado por t1/t3 y por el propio capitán en el contexto del tablero
  («`contracts/verify_contracts.mjs` hoy da FAIL por drift no commiteado de `_vps_stage/tests/fanout_concurrency.sh`
  (otra sesión)»).
- `contracts/**` está bajo **L-007** ⇒ escribir ahí me está prohibido.
- Prueba de no-intervención: mi único archivo modificado es `vps/ape_hls_generators.php` (`git diff --numstat` = `10 7`).

### 5.5 Sin commits

`HEAD` = `ffb01e6 security(containment): untrack wrangler R2 state blobs (creds expuestas)` —
sin cambios. `git diff --cached --name-only` = **(nada staged)**.

---

## 6. sha256 antes / después

### 6.1 Archivo modificado

| Momento | Bytes | Líneas | mtime | SHA-256 |
|---|---:|---:|---|---|
| **ANTES** | 39 678 | 748 | 2026-05-23T00:46:40.787 | `2AC913221A53AD8B5963A91BFD21D9938C7FCC36451C1B346467BBE16960AA5E` |
| **DESPUÉS** | 40 041 | 751 | 2026-10-25T23:34:58.905 | `8992CB89E2D42AFC49140BB9C29E1FA99B691D06E78434FA087181D1BBB3F31C` |

Δ = **+363 B / +3 líneas** · `git diff --numstat` = **10 insertions / 7 deletions**.

### 6.2 Archivos NO modificados (prueba de no-intervención)

| Archivo | SHA-256 medido | ¿== baseline? |
|---|---|---|
| `backend/resolve_quality_unified.php` | `20AC4B2631C1E877A3DE92B4E479B6C2EFA171AD1A317869F9343A99C3C5F2B5` | ✅ **idéntico** |
| `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | `6881CB9D0D9E4C4FDAC801405532DC3265D0F51E4BAD2C392C2854FCDE5C8CB4` | ✅ **idéntico** al snapshot 23:32 |
| `backend/rq_streaming_health_engine.php` | `E0E405FA18F0157DA6AD5CB441C8BF94B2BBB7AA473BA585F1BE76CAA82C9BBB` | ✅ **idéntico** |

---

## 7. Diff completo del único archivo tocado

```diff
diff --git a/IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php b/IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
index 194ff47..7f52408 100644
--- a/IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
+++ b/IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
@@ -624,7 +624,8 @@ function serve_hls_fmp4_ignition(array $cd): void
 // El reproductor recibe:
 //   - Content-Type: application/vnd.apple.mpegurl
 //   - #EXT-X-VERSION:7
-//   - #EXT-X-MAP:URI="..." (apunta al .m3u8 del proveedor como init hint)
+//   - #EXT-X-MAP retirado en T11/B-11: esta ruta reenvía el .m3u8 del proveedor,
+//     no un init segment fMP4; declararlo producía un fallo de init en ExoPlayer.
 //   - #KODIPROP:inputstream.adaptive.manifest_type=hls
 //   - URL final: .m3u8 del proveedor (reproducción directa garantizada)
 //
@@ -716,17 +717,17 @@ function serve_cmaf_m3u8_fallback(array $cd): void
     echo "#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive\n";
     echo "#KODIPROP:inputstream.adaptive.max_bandwidth=" . ($cfg['max_bw'] ?? 15150000) . "\n";
 
-    // ── Manifiesto HLS v7 con declaración CMAF ──
+    // ── Manifiesto HLS: el .m3u8 del proveedor envuelto en master sintético ──
     echo "#EXTM3U\n";
     echo "#EXT-X-VERSION:7\n";
     echo "#EXT-X-TARGETDURATION:2\n";
     echo "#EXT-X-MEDIA-SEQUENCE:0\n";
     echo "#EXT-X-INDEPENDENT-SEGMENTS\n";
 
-    // EXT-X-MAP apunta al .m3u8 del proveedor como hint de inicialización.
-    // Los reproductores modernos (OTT Navigator, TiviMate, ExoPlayer) usan
-    // este URI para negociar el codec antes de solicitar segmentos.
-    echo "#EXT-X-MAP:URI=\"{$providerM3u8}\"\n";
+    // [T11/B-11] CMAF NO se declara aquí: esta ruta reenvía el .m3u8 del proveedor,
+    // no un init segment fMP4. Un #EXT-X-MAP apuntando a un .m3u8 hace que ExoPlayer
+    // intente parsearlo como init segment (ftyp+moov) y falle al inicializar el track.
+    // Retirado hasta que exista evidencia real de init.mp4/.m4s verificado.
 
     // EXT-X-STREAM-INF con los parámetros de calidad del perfil
     $bw         = $cfg['max_bw']   ?? 15150000;
@@ -734,8 +735,10 @@ function serve_cmaf_m3u8_fallback(array $cd): void
     $avgBwBps   = $avgBw * 1000;
     $resolution = $cfg['res']      ?? '1920x1080';
     $fps        = $cfg['fps']      ?? 120; // MEMC-TOTAL-8K120: default 120fps
+    // [T11/B-10] GOLDEN RULE: hvc1.* SOLO en #EXT-X-STREAM-INF:CODECS=.
+    // hev1.* queda reservado a KODIPROP/EXTVLCOPT (decoder runtime). Cruzarlos rompe Tizen/webOS.
     $codecs     = ($cfg['codec_primary'] === 'HEVC' || $cfg['codec_primary'] === 'hevc')
-                    ? 'hev1.2.4.L153.B0,mp4a.40.2'
+                    ? 'hvc1.2.4.L153.B0,mp4a.40.2'
                     : 'avc1.640028,mp4a.40.2';
 
     echo "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$avgBwBps},"
```

---

## 8. Rollback (1 comando, si el capitán lo pide)

```powershell
git checkout -- IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
# verificación post-rollback: el sha256 debe volver a 2AC913221A53AD8B5963A91BFD21D9938C7FCC36451C1B346467BBE16960AA5E
```

## 9. Impacto en las leyes de la matriz (t9)

| Ley | Antes | Después de T11 |
|---|---|---|
| **L1 Nivel↔Resolución** | FAIL | FAIL (sin cambio: B-06/B-09 bloqueados; B-10b pendiente de decisión) |
| **L2 SSOT-LAB no-override** | FAIL | FAIL (B-05 bloqueado por L-001) |
| **L3 Coherencia Triple** | FAIL | FAIL |
| **L4 NO-STRIP** | PASS | PASS (no se borró ninguna directiva funcional: solo el MAP falso) |
| **L5 SHIELDED** | PASS | PASS (ninguna URL tocada) |
| **GOLDEN RULE (eje E2/E3)** | ⛔ rota en `vps/ape_hls_generators.php` | ✅ **reparada en el único punto de código HLS que la rompía** |

**Ningún fix de esta tarea cierra una ley completa.** Cierra **una violación concreta y medida** (GOLDEN RULE en
el generador VPS) y **retira una declaración CMAF falsa**. El resto sigue bloqueado por D-05 y debe planificarse
cuando L-001 se libere y el WIP de `resolve_quality_unified.php` se commitee.
