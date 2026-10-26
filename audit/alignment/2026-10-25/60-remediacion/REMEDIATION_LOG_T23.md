# REMEDIATION_LOG_T23 — B-10b (clamp FRAME-RATE por nivel) + gate honesto

**Task:** t23 · Attempt `1f7b3c26-a7e9-444d-9a13-dbb23eb325b5`
**Fecha:** 2026-10-25 (America/Bogota)
**Base de partida:** `vps/ape_hls_generators.php` 40 041 B · sha256 `8992CB89E2D42AFC49140BB9C29E1FA99B691D06E78434FA087181D1BBB3F31C` (= estado verificado de T11)
**Autorización:** B-10b por decisión del capitán **D-58**
**Commits:** **CERO** — HEAD sigue en `ffb01e6`.

---

## 0. Resumen

| # | Cambio | Archivo:línea | Estado |
|---|---|---|---|
| **B-10b** | `$fps = $cfg['fps'] ?? 120` → clamp por capacidad del nivel | `vps/ape_hls_generators.php:742-747` | ✅ **APLICADO** |
| — | Reordenación mínima: `$codecs` se calcula antes del clamp (el techo depende del nivel) | `:737-741` | ✅ (necesaria para B-10b) |
| — | Reformulación de 1 comentario para no disparar el gate multilínea con prosa | `:737-738` | ✅ (ver §5) |
| **Gate** | Prueba de emisión ampliada: 12 → **52 aserciones**, incluye clamp + multilínea | `tools/tools_t11_emission_proof.php` | ✅ |
| **B-10 / B-11** | Conservados sin cambios funcionales | `:730`, `:740` | ✅ verificado |

**Resultado:** `php -l` exit 0 · proof **52/52 PASS exit 0** · `?? 120` = **0** · ventanas `STREAM-INF +3` con `hev1.` = **0** · `git diff --numstat` = **16/8** solo en ese archivo.

---

## 1. B-10b — antes / después por línea

### 1.1 ANTES (`:736-742`, estado T11)

```php
    $resolution = $cfg['res']      ?? '1920x1080';
    $fps        = $cfg['fps']      ?? 120; // MEMC-TOTAL-8K120: default 120fps
    // [T11/B-10] GOLDEN RULE: hvc1.* SOLO en #EXT-X-STREAM-INF:CODECS=.
    // hev1.* queda reservado a KODIPROP/EXTVLCOPT (decoder runtime). Cruzarlos rompe Tizen/webOS.
    $codecs     = ($cfg['codec_primary'] === 'HEVC' || $cfg['codec_primary'] === 'hevc')
                    ? 'hvc1.2.4.L153.B0,mp4a.40.2'
                    : 'avc1.640028,mp4a.40.2';
```

**Salida real medida con los defaults** (ejecutando el bloque del archivo, no una réplica):

```
#EXT-X-STREAM-INF:BANDWIDTH=15150000,AVERAGE-BANDWIDTH=10100000,RESOLUTION=1920x1080,FRAME-RATE=120,CODECS="avc1.640028,mp4a.40.2"
```

`avc1.640028` = H.264 **High@L4.0**. A 1920×1080 el nivel ya está en su techo con **30 fps** (ver §2); declarar 120 lo excede ~4×.

### 1.2 DESPUÉS (`:736-747`)

```php
    $resolution = $cfg['res']      ?? '1920x1080';
    // [T11/B-10] GOLDEN RULE: la familia hvc1 va SOLO en #EXT-X-STREAM-INF:CODECS=.
    // La familia hev1 queda reservada a KODIPROP/EXTVLCOPT (runtime). Cruzarlas rompe Tizen/webOS.
    $codecs     = ($cfg['codec_primary'] === 'HEVC' || $cfg['codec_primary'] === 'hevc')
                    ? 'hvc1.2.4.L153.B0,mp4a.40.2'
                    : 'avc1.640028,mp4a.40.2';
    // [T23/B-10b · D-58] FRAME-RATE clampado a la capacidad REAL del nivel declarado.
    // High@L4.0 (avc1.640028) a 1080p ya toca su techo con 30 fps; declarar 120 lo excede ~4x.
    // Techo por nivel: HEVC Main10 L153/L123 => 60 · resto => 30. Un fps explícito del perfil
    // se respeta, pero NUNCA por encima de ese techo: el nivel manda, no el default.
    $fpsCap     = preg_match('/^hvc1\.2\.4\.L(?:153|123)\./i', $codecs) ? 60 : 30;
    $fps        = max(1, min((int)($cfg['fps'] ?? $fpsCap), $fpsCap));
```

**Regla implementada, exactamente la de D-58:**

| Nivel declarado en `CODECS=` | Techo `$fpsCap` | Fundamento |
|---|---:|---|
| `hvc1.2.4.L153.B0` | **60** | HEVC Main10 L5.1 (4K@60 CORONA) · doctrina D-15 (sin evidencia de 120 reales) |
| `hvc1.2.4.L123.B0` | **60** | HEVC Main10 L4.1 (1080p@60) |
| cualquier otro (`avc1.640028`, …) | **30** | H.264 High@L4.0 a 1080p: 30 fps es su techo exacto |

Un `fps` explícito del perfil **se respeta** (`min($cfg['fps'], $fpsCap)`) pero nunca por encima del techo.
**No se inventa ningún nivel nuevo:** el códec sigue saliendo de `$cfg['codec_primary']` igual que antes; solo cambia el `FRAME-RATE`.

### 1.3 Salidas reales tras el cambio (7 escenarios ejecutados)

```
[SIN cfg (codec_primary indefinido -> AVC)]
  RESOLUTION=1920x1080,FRAME-RATE=30,CODECS="avc1.640028,mp4a.40.2"
[HEVC · sin cfg fps (default -> techo 60)]
  RESOLUTION=1920x1080,FRAME-RATE=60,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"
[HEVC · 3840x2160 · fps=60 explícito]
  RESOLUTION=3840x2160,FRAME-RATE=60,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"
[HEVC · 1920x1080 · fps=120 (clampea)]
  RESOLUTION=1920x1080,FRAME-RATE=60,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"
[HEVC · 1920x1080 · fps=30 (respeta)]
  RESOLUTION=1920x1080,FRAME-RATE=30,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"
[AVC  · 1920x1080 · sin fps (techo 30)]
  RESOLUTION=1920x1080,FRAME-RATE=30,CODECS="avc1.640028,mp4a.40.2"
[AVC  · 1920x1080 · fps=120 (clampea)]
  RESOLUTION=1920x1080,FRAME-RATE=30,CODECS="avc1.640028,mp4a.40.2"
```

Ningún caso supera el techo de su nivel. La resolución declarada no se toca en ningún caso.

---

## 2. ⚠️ Corrección de aritmética: un número que publiqué mal en T11

En `BLOCKED.md` (T11) escribí que 1080p@120 excede **HEVC L5.1** citando `MaxLumaSr = 222 822 400`. **Ese valor es incorrecto y la conclusión para HEVC también.** Corrección medida contra las tablas de los estándares:

| Códec / nivel | Límite real (tabla del estándar) | 1920×1080@120 | ¿Excede? |
|---|---|---|---|
| **H.264 High@L4.0** (`avc1.640028`) | MaxMBPS **245 760** MB/s · MaxFS 8 192 MB · 1080p = 8 160 MB | 8 160 × 120 = **979 200 MB/s** | ⛔ **3,99× por encima** |
| **H.264 High@L4.0** a 30 fps | idem | 8 160 × 30 = **244 800 MB/s** | ✅ dentro (244 800 ≤ 245 760) |
| **HEVC L5.1** (`hvc1.2.4.L153.B0`) | MaxLumaSr **534 773 760** luma/s · MaxLumaPs 8 912 896 (H.265 Tabla A.8) | 2 073 600 × 120 = **248 832 000** luma/s | ✅ **dentro** (no excede) |
| **HEVC L5.1** a 4K@60 | idem | 8 294 400 × 60 = **497 664 000** luma/s | ✅ dentro — por eso L153 es el "4K@60 CORONA" |

**Consecuencia honesta:** la violación de nivel duro en `ape_hls_generators.php` estaba **solo en la rama AVC**. El cap a 60 en la rama HEVC **no** lo exige la aritmética del nivel: lo exige la doctrina **D-15** (no declarar fps sin evidencia de que son reales) y coincide con el anclaje declarado del propio sistema (`#EXT-X-CORTEX-CONSTANT-FRAME-RATE:CFR_60_ANCHOR_LOCKED` en `rq_streaming_health_engine.php:205`).

Dejo constancia porque un número mal publicado en un entregable de auditoría es exactamente el tipo de error que esta cadena debe poder corregir. La decisión de cap sigue siendo correcta; su justificación para HEVC es doctrinal, no aritmética.

---

## 3. B-10 y B-11 conservados (verificado, no asumido)

| Fix | Comprobación | Resultado |
|---|---|---|
| **B-10** GOLDEN RULE | `preg_match('/hev1\./i', código del fallback)` y `strpos('hvc1.2.4.L153.B0,mp4a.40.2')` | `hev1` = **0** · `hvc1` presente ✅ |
| **B-11** CMAF falso | `#EXT-X-MAP` en el cuerpo de `serve_cmaf_m3u8_fallback` (sin comentarios) | **0** ✅ |
| **B-11** MAP legítimo intacto | `serve_hls_fmp4_ignition` conserva `EXT-X-MAP:URI=` + `seg=init-stream0.m4s` | presente ✅ |
| **No-regresión DASH** | `generate_dash_mpd` conserva `codecs="hev1.` | presente ✅ (no se tocó) |

---

## 4. Por qué el gate anterior era engañoso (y cómo se corrigió)

El verify de T11 usaba `Select-String -Pattern 'EXT-X-STREAM-INF.*hev1\.'`, que devolvía **0 incluso con el bug** porque en el archivo `#EXT-X-STREAM-INF` y el literal del códec están en **líneas distintas** y el comodín `.` no cruza `\n`.

**Gate nuevo (honesto, dos capas):**
1. **Multilínea real**, idéntico al comando del contrato: ventana de `STREAM-INF` + **3 líneas siguientes**, sin `hev1.` → **0 ventanas**.
2. **Emisión ejecutada**: el bloque se extrae *verbatim* del archivo y se evalúa con 7 configuraciones; se asserta `FRAME-RATE` exacto, `FRAME-RATE ≤ techo del nivel`, familia del códec y `RESOLUTION` parseable.

**Total: 52 aserciones, 0 fallos.**

### 4.1 Un falso positivo propio que corregí (y no oculté)

En la primera corrida el gate multilínea marcó **1 hit** en la línea 737 — pero era **mi propio comentario** (`// [T11/B-10] … #EXT-X-STREAM-INF …` seguido de `// hev1.* queda reservado…`). No era una emisión. Lo resolví reformulando la prosa (`hev1.*` → `la familia hev1`) en vez de relajar el gate: una emisión real **siempre** lleva el punto de RFC 6381 (`hev1.`), así que la prosa sin punto no debilita la aserción y elimina el ruido.

Otros 3 fallos de la primera corrida eran también del test, no del código: un caso etiquetado «HEVC» sin `codec_primary` (cae en la rama AVC — comportamiento real, etiqueta corregida y caso conservado) y un regex que no contemplaba el escape `\"` de la cadena PHP.

---

## 5. sha256 antes / después

> **⚠️ CORRECCIÓN (T29).** Esta tabla daba **un solo** sha256 y lo llamaba «DESPUÉS (T23)». Ese hash es el del
> **checkout de Windows (CRLF)**, no el del artefacto que viaja en git. Lo detectó la revisión t27 y el capitán
> confirmó el error de criterio. Ahora se declaran **las dos** identidades. Ningún byte del código cambia por esto:
> es un problema de **medición**, no de contenido.

| Identidad | Dónde vive | Bytes | CR / LF | SHA-256 | Sirve para |
|---|---|---:|---|---|---|
| **BLOB git (LF)** | `4c24d48:…/vps/ape_hls_generators.php` · oid `4127f01771fa912ccc50a64421ba26e58c925c43` | **39 745** | CR=0 / LF=756 | **`E8FC25137771F87D63EBD08059DC6D57A772C510ADC6AEED8777A1CE5D0AF72A`** | ✅ **Lo que viaja en git** y lo que se compara con despliegues Linux (VPS) |
| **CHECKOUT Windows (CRLF)** | working tree local (`core.autocrlf=true`) | **40 501** | CR=756 / LF=756 | `C2332FBD80131029102AF4D36E456951CA8BDCF7E310DC099C86EEA15175458B` | ❌ Sólo local. **No** es el artefacto de git |

**Churn del cambio:** `git show --numstat --format='' 4c24d48 -- <archivo>` = **16 insertions / 8 deletions**.
`git diff --numstat` (working tree vs HEAD) = **vacío**: la remediación ya está **commiteada** en `4c24d48`.

### 5.1 Regla de despliegue (obligatoria desde T29)

```
ARTEFACTO A DESPLEGAR/COMPARAR = el BLOB LF, nunca el checkout Windows.

  ✅ correcto   : git cat-file blob 4127f017… > /tmp/x.php          (redirección BINARIA)
                  git show 4c24d48:IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php | sha256sum   (Linux/CI)
  ❌ PROHIBIDO  : scp o hash del fichero del working tree Windows presentado como "el artefacto de git"
  ❌ PROHIBIDO  : `git show … > fichero` desde PowerShell/cmd con redirección de TEXTO (inserta CRLF →
                  40 501 B y hash C2332FBD…, que NO es el del blob)
```

**Por qué importa:** con `core.autocrlf=true`, `git show` canalizado por redirección de texto de PowerShell
produce **40 501 B / `C2332FBD…`** en vez del blob real **39 745 B / `E8FC2513…`** (756 bytes de diferencia =
756 CR). Un ledger que publique el segundo como «hash del blob» queda invertido, y la comparación con el VPS
(Linux, LF) falla por esos 756 bytes que no existen en el artefacto.

**Medición propia de T29 (no tomada de un reporte):**
```
git rev-parse HEAD:<path>  → 4127f01771fa912ccc50a64421ba26e58c925c43
git cat-file -s <oid>      → 39745
extracción binaria (.NET BaseStream → WriteAllBytes, sin traducción de texto):
  bytes=39745  sha256=E8FC25137771F87D63EBD08059DC6D57A772C510ADC6AEED8777A1CE5D0AF72A  CR=0   LF=756
working tree:
  bytes=40501  sha256=C2332FBD80131029102AF4D36E456951CA8BDCF7E310DC099C86EEA15175458B  CR=756 LF=756
```

### 5.2 `.gitattributes` — **NO añadido en T29, a propósito** (decisión del owner: D-75)

El criterio de t27 pedía añadir `.gitattributes` (`*.php text eol=lf` o `*.php -text`) «para que el hash de
despliegue sea determinista». **No se añadió**, por instrucción directa del capitán y por su efecto medido:

| Opción | Efecto inmediato | Por qué no ahora |
|---|---|---|
| `*.php text eol=lf` | El checkout de **TODOS** los `.php` pasaría a LF ⇒ cientos de ficheros aparecerían como modificados en el working tree de **las 4 sesiones activas** a mitad de campaña | Riesgo de bare-commit masivo y de pisar WIP ajeno (L-001/L-004/L-007 en juego) |
| `*.php -text` | Desactiva la normalización para `.php`: blob y checkout coincidirían, pero cambia la semántica de futuros diffs/merges de todo el repo | Decisión de repositorio, no de una lane de remediación |

**Queda como decisión del owner en D-75**, documentada con ese efecto. Mientras no se decida, rige la
**regla de despliegue de §5.1**: se hashea el blob LF.

**Antes de la remediación** (sólo para trazabilidad, medido siempre sobre checkout): 40 041 B ·
`8992CB89E2D42AFC49140BB9C29E1FA99B691D06E78434FA087181D1BBB3F31C`.

---

## 6. Diff completo (acumulado del archivo, working tree vs HEAD)

```diff
diff --git a/IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php b/IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
index 194ff47..4127f01 100644
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
@@ -716,27 +717,34 @@ function serve_cmaf_m3u8_fallback(array $cd): void
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
     $avgBw      = $cfg['bitrate']  ?? 10100;
     $avgBwBps   = $avgBw * 1000;
     $resolution = $cfg['res']      ?? '1920x1080';
-    $fps        = $cfg['fps']      ?? 120; // MEMC-TOTAL-8K120: default 120fps
+    // [T11/B-10] GOLDEN RULE: la familia hvc1 va SOLO en #EXT-X-STREAM-INF:CODECS=.
+    // La familia hev1 queda reservada a KODIPROP/EXTVLCOPT (runtime). Cruzarlas rompe Tizen/webOS.
     $codecs     = ($cfg['codec_primary'] === 'HEVC' || $cfg['codec_primary'] === 'hevc')
-                    ? 'hev1.2.4.L153.B0,mp4a.40.2'
+                    ? 'hvc1.2.4.L153.B0,mp4a.40.2'
                     : 'avc1.640028,mp4a.40.2';
+    // [T23/B-10b · D-58] FRAME-RATE clampado a la capacidad REAL del nivel declarado.
+    // High@L4.0 (avc1.640028) a 1080p ya toca su techo con 30 fps; declarar 120 lo excede ~4x.
+    // Techo por nivel: HEVC Main10 L153/L123 => 60 · resto => 30. Un fps explícito del perfil
+    // se respeta, pero NUNCA por encima de ese techo: el nivel manda, no el default.
+    $fpsCap     = preg_match('/^hvc1\.2\.4\.L(?:153|123)\./i', $codecs) ? 60 : 30;
+    $fps        = max(1, min((int)($cfg['fps'] ?? $fpsCap), $fpsCap));
 
     echo "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$avgBwBps},"
        . "RESOLUTION={$resolution},FRAME-RATE={$fps},CODECS=\"{$codecs}\"\n";
```

---

## 7. No-intervención (archivos prohibidos por la tarea)

Verificado por hash en el momento del cierre:

| Archivo | Bytes | mtime | SHA-256 (24) | ¿Tocado? |
|---|---:|---|---|---|
| `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (L-001) | 748 672 | 2026-10-25T23:11:04 | `6881CB9D0D9E4C4FDAC80140` | ❌ no |
| `backend/resolve_quality_unified.php` (WIP ajeno) | 348 758 | 2026-10-25T21:35:16 | `20AC4B2631C1E877A3DE92B4` | ❌ no |
| `_vps_stage/tests/fanout_concurrency.sh` (L-004) | 99 666 | 2026-10-25T22:32:40 | `B558B1CDFF88357904139183` | ❌ no |
| `contracts/**` (L-007) | — | — | — | ❌ no |

---

## 8. Rollback

```powershell
git checkout -- IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
# post-rollback el sha256 debe volver a 2AC913221A53AD8B5963A91BFD21D9938C7FCC36451C1B346467BBE16960AA5E
```

## 9. Estado para el commit quirúrgico del capitán

- **1 archivo de producción modificado**: `IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php` (16/8).
- **Nada staged**, HEAD `ffb01e6`.
- El archivo pasa: `php -l` exit 0 · proof 52/52 exit 0 · `?? 120` = 0 · ventana multilínea `hev1.` = 0.
- El verify `node contracts/verify_contracts.mjs` sigue en exit 1 por **drift ajeno** → `BLOCKED_BY_OWNER`, documentado en `BLOCKED.md` §6 (no es fallo de esta tarea: mi archivo no participa de ninguno de sus 12 contratos).

---

## 10. T29 — Harness con ruta por `$argv[1]` y corrida contra el BLOB

### 10.1 Cambios en el harness (sólo el harness; **cero cambios en el código de producción**)

| Cambio | Antes | Ahora |
|---|---|---|
| Ruta del archivo evaluado | fija por `__DIR__` (siempre working tree) | **`$argv[1]` opcional**; sin argumento = working tree (compatibilidad) |
| Identidad en la salida | bytes + sha256 | bytes + sha256 + **CR/LF** + etiqueta `BLOB-LF` / `CHECKOUT-CRLF` + qué ruta se usó (`[default]` o `[argv[1]]`) |
| Alcance de la aserción `hev1` | «ningún literal hev1 en el bloque HLS» | **«0 ocurrencias en el bloque HLS/fallback»** + nota de que las **2 de la plantilla DASH MPD son legítimas**, y aserción aparte de que siguen siendo exactamente 2 |
| Lint del propio harness | — | `php -l` exit 0 |

### 10.2 Las DOS corridas (misma lógica, distinta identidad de bytes)

| # | Artefacto | Bytes | SHA-256 | CR/LF | Resultado | Exit |
|---|---|---:|---|---|---|---:|
| **A** | working tree (default) | 40 501 | `C2332FBD80131029102AF4D36E456951CA8BDCF7E310DC099C86EEA15175458B` | CR=756 LF=756 | **PASS=52 FAIL=0** | 0 |
| **B** | **BLOB `4127f017…` extraído byte-exacto** | **39 745** | **`E8FC25137771F87D63EBD08059DC6D57A772C510ADC6AEED8777A1CE5D0AF72A`** | CR=0 LF=756 | **PASS=52 FAIL=0** | 0 |

⇒ **La lógica del archivo es idéntica en las dos identidades y pasa 52/52 en ambas.** La corrida **B** es la
evidencia principal (es el artefacto que viaja y el que se compara con el VPS); la **A** se conserva como control
de que el checkout local no diverge semánticamente.

> **Nota de honestidad:** el capitán indicó «tu propio 52/0 ya se corrió contra el blob». **No era exacto:** mi
> corrida de t23 fue contra el working tree (40 501 B). Quien corrió contra el blob fue la revisión t27. Por eso
> t29 ejecutó **las dos** y las registra por separado, en vez de heredar la afirmación.

### 10.3 Reproducir la corrida B (comando exacto, sin redirección de texto)

```powershell
# 1) extracción BINARIA del blob (no usar '>' de PowerShell: inserta CRLF)
$oid = git rev-parse 'HEAD:IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php'
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName='git'; $psi.Arguments="cat-file blob $oid"; $psi.RedirectStandardOutput=$true; $psi.UseShellExecute=$false
$p=[System.Diagnostics.Process]::Start($psi); $ms=New-Object System.IO.MemoryStream
$p.StandardOutput.BaseStream.CopyTo($ms); $p.WaitForExit()
[System.IO.File]::WriteAllBytes("$env:TEMP\blob.php", $ms.ToArray())

# 2) prueba contra ese archivo
& 'C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\rea-engines\php-8.3\php.exe' `
  audit/alignment/2026-10-25/60-remediacion/tools/tools_t11_emission_proof.php "$env:TEMP\blob.php"
# esperado: bytes 39745 · sha256 e8fc2513… · CR=0 LF=756 · BLOB-LF · PASS=52 FAIL=0 · EXIT=0
```

### 10.4 Estado del artefacto ahora

La remediación está **commiteada**: `4c24d48 fix(m3u8): GOLDEN RULE + no fake CMAF + FRAME-RATE clamp by level (B-10/B-11/B-10b)`.
Working tree == HEAD para ese archivo ⇒ `git diff --numstat` **vacío** (ya no hay 16/8 pendiente).
HEAD global = `f294922`. Sin commit nuevo en T29, sin deploy, sin VPS.
