# BLOCKED — Lo que T11 no pudo tocar y por qué (evidencia medida)

**Task:** t11 · Attempt `f123e2a6-b1f0-40a0-976a-59221a607249`
**Regla aplicada:** D-05 del capitán — «NO EDITABLE: repórtalo como BLOCKED, no lo fuerces». Ningún archivo bloqueado
fue modificado: los tres sha256 de §5 son idénticos al baseline.

---

## 0. Tabla de bloqueos

| ID | Qué | Archivo:línea (estado actual medido) | Motivo | Evidencia de estado |
|---|---|---|---|---|
| **B-05** | fake-8K por defecto ON (`: '8k'`) | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:10362-10365` | **BLOCKED_BY_LOCK** L-001 (t44) | sha256 `6881CB9D…C8CB4` · mtime `2026-10-25T23:11:04.185` |
| **B-05b** | typo `window.APE_Fake_UHD` | mismo archivo | **YA RESUELTO por t44** | ver §2 — no queda ninguna ocurrencia del typo |
| **B-13** | `I-FRAME-STREAM-INF` con códec incoherente | mismo archivo `:3061` y `:9972` | **BLOCKED_BY_LOCK** L-001 | mismo sha256 |
| **B-06** | `FRAME-RATE=120` con `L153` | `backend/resolve_quality_unified.php:5519-5520` (+ tabla `:4857`,`:4862`) | **BLOCKED_BY_WIP** | sha256 `20AC4B26…C5F2B5` · mtime `2026-10-25T21:35:16.142` · git ` M` |
| **B-09** | `#EXT-X-STREAM-INF` huérfano (sin URI) | `backend/resolve_quality_unified.php:4544` | **BLOCKED_BY_WIP** | mismo archivo/sha256 |
| **B-10b** | `?? 120` produce nivel insuficiente | `vps/ape_hls_generators.php:742-747` | ✅ **APLICADO en T23** (D-58) | ver §4 |
| **EXT-01** | `contracts/verify_contracts.mjs` FAIL | `_vps_stage/tests/fanout_concurrency.sh` | **BLOCKED_BY_OWNER** (L-004 + L-007) | ver §6 |

---

## 1. B-05 / B-13 · Lock L-001 sobre `frontend/js/**`

### 1.1 El lock está vivo y bloquea escritura a este equipo

`.session/locks.json` (leído, no escrito):
```json
{
  "path": "IPTV_v5.4_MAX_AGGRESSION/frontend/js/**",
  "owner": "dsh-lead",
  "task": "t44",
  "reason": "censo X-APE-AI-* y saneo de ruido EXTHTTP",
  "since": "2026-10-25T22:12:00-05:00"
}
```
`BOARD.json → locks[]` lo importa verbatim con `"blocks_write_for_this_team": true` (id **L-001**),
y `no_touch[]` lo lista como `{"glob":"IPTV_v5.4_MAX_AGGRESSION/frontend/js/**","why":"L-001 t44 (dsh-lead) + 4 archivos con cambios sin commitear"}`.

### 1.2 No es un lock "de libro": hay escritura ajena ACTIVA y medida

| Medición | Valor |
|---|---|
| Bytes en mi baseline t6 (22:59) | 746 967 |
| Bytes en el snapshot de t11 (23:32) | **748 672** (+1 705) |
| Líneas | 11 570 → **11 594** (+24) |
| mtime | **2026-10-25T23:11:04.185** — *después* de que yo cerrara t6 |
| git | ` M` (modificado, sin commitear) |
| sha256 en el momento de esta auditoría | `6881CB9D0D9E4C4FDAC801405532DC3265D0F51E4BAD2C392C2854FCDE5C8CB4` |

⇒ Editar aquí habría pisado trabajo en vuelo de otra sesión, con riesgo de pérdida. **No se tocó.**

### 1.3 B-05 · el defecto que sigue (con las líneas de HOY, no las de t6)

Las +24 líneas que t44 añadió desplazaron los números: `maxQualityMode` pasó de `:9995-10008` (t6) a
**`:10018-10031`**, y el bloque `fakeUhd` de `:10339-10342` a **`:10362-10365`**. Verificado en los bytes actuales:

```
10362:                fakeUhd: (typeof window !== 'undefined')
10363:                    ? ((window.APE_FAKE_UHD === '4k') ? '4k'
10364:                        : ((window.APE_FAKE_UHD === '0' || window.APE_FAKE_UHD === 0 || window.APE_FAKE_UHD === false) ? '0' : '8k'))
10365:                    : '8k',
```

**Sigue vigente:** el default es `'8k'` ⇒ `RESOLUTION=7680x4320` para los 6 perfiles, contradiciendo
`lab_master_22.6.0.json → profiles_calibrated.P{N}.settings.resolution` (P2–P5 = `3840x2160`). Es la violación
**L2 (SSOT-LAB no-override)** que t9 marcó FAIL.

**Fix pendiente (idéntico al de t6, sin aplicar):**
```diff
@@ -10362,4 +10362,6 @@
-                fakeUhd: (typeof window !== 'undefined')
-                    ? ((window.APE_FAKE_UHD === '4k') ? '4k'
-                        : ((window.APE_FAKE_UHD === '0' || window.APE_FAKE_UHD === 0 || window.APE_FAKE_UHD === false) ? '0' : '8k'))
-                    : '8k',
+                // [T11/B-05 · D-13] El fake-UHD es decisión del SSOT, no default del código.
+                fakeUhd: (typeof window !== 'undefined' && window.APE_FAKE_UHD)
+                    ? ((window.APE_FAKE_UHD === '4k') ? '4k'
+                        : ((window.APE_FAKE_UHD === '0' || window.APE_FAKE_UHD === 0 || window.APE_FAKE_UHD === false) ? '0' : '8k'))
+                    : '0',
```

### 1.4 B-13 · `I-FRAME-STREAM-INF` (dos puntos, ambos bajo L-001)

| Línea actual | Contenido | Problema |
|---:|---|---|
| `3061` | `#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=450000,…,CODECS="hvc1.2.4.L153.B0",RESOLUTION=1920x1080` | `L153` (techo 4K@60) junto a `1920x1080` (le bastaría `L123`): nivel sobre-declarado. **Sin `URI=` ⇒ cumple anti-509** |
| `9972` | `lines.push(\`#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=${…*0.025},CODECS="${_codec796}"\`)` | usa el códec **pre-truth** ⇒ declara `L153` mientras el `STREAM-INF` del mismo bloque declara `L183`. **Sin `URI=`** |

**Dato que corrige una lectura fácil:** en `resolve_quality_unified.php` **no existe** ninguna emisión de
`EXT-X-I-FRAME-STREAM-INF` (0 coincidencias), así que B-13 es exclusivamente JS ⇒ bloqueado por L-001.

---

## 2. B-05b · El typo `APE_Fake_UHD` YA lo corrigió t44 (no es mío)

En t6 documenté `window.APE_Fake_UHD` (mayúscula en `Fake`) en la versión previa: anulaba el kill-switch.
**En los bytes actuales ya no existe.** Barrido completo:

```
10363: ? ((window.APE_FAKE_UHD === '4k') ? '4k'
10364:    : ((window.APE_FAKE_UHD === '0' || window.APE_FAKE_UHD === 0 || window.APE_FAKE_UHD === false) ? '0' : '8k'))
```

`Select-String -Pattern 'APE_Fake_UHD'` → **0 coincidencias**. Se retira del backlog: **cerrado por t44**.
Lo que **no** está cerrado es el default `'8k'` (§1.3), que es una decisión de doctrina, no un typo.

---

## 3. B-06 / B-09 · `backend/resolve_quality_unified.php` está WIP de otra sesión

### 3.1 Estado medido (idéntico antes y después de mi trabajo)

| Dato | Valor |
|---|---|
| Bytes | 348 758 |
| mtime | **2026-10-25T21:35:16.142** |
| git | ` M` (modificado, sin commitear) |
| sha256 (antes) | `20AC4B2631C1E877A3DE92B4E479B6C2EFA171AD1A317869F9343A99C3C5F2B5` |
| sha256 (después de mi sesión) | `20AC4B2631C1E877A3DE92B4E479B6C2EFA171AD1A317869F9343A99C3C5F2B5` ✅ **idéntico** |

No está bajo ningún lock (`locks[]` no lo cubre; L-002 es `vps/production_mirror/**`). El bloqueo es **WIP**:
el capitán ordenó explícitamente «está ` M` por otra sesión (WIP) ⇒ `BLOCKED_BY_WIP` con sha256 y mtime; **no lo
toques**».

### 3.2 B-06 · el defecto, transcrito de los bytes actuales

```
4857:         'sports'     => ['profile' => 'P0_ULTRA_SPORTS_8K',   'fps' => 120, 'buffer' => 60000,  'bw' => 80000000],
4862:         'default'    => ['profile' => 'P0_ULTRA_SPORTS_8K',   'fps' => 120, 'buffer' => 60000,  'bw' => 80000000],
...
5514:     private function buildStreamInf(array $profile): string
5516:         $fps = $profile['fps'];
5519:         return "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$bw},RESOLUTION=3840x2160,FRAME-RATE={$fps}.000,"
5520:             . 'CODECS="hvc1.2.4.L153.B0,mp4a.40.2",HDR=PQ,VIDEO-RANGE=PQ,AUDIO="aac_atmos",'
5521:             . 'CLOSED-CAPTIONS=NONE,SUBTITLES="subs"';
```

`$fps = 120` (de `sports`/`default`) + `L153` (Level 5.1, techo 4K@60) ⇒ **Ley Cardinal 1 violada**: 4K@120 exige
L5.2 (`L156`). Es la firma del freeze 2026-06-08. **Sigue intacto.**

**Fix pendiente (B-06, D-15) — listo para cuando el archivo se libere:**
```diff
@@ -5514,9 +5514,16 @@
     private function buildStreamInf(array $profile): string
     {
-        $fps = $profile['fps'];
+        // [T11/B-06 · D-15] Ley Cardinal 1: el nivel debe cargar RESOLUTION × FRAME-RATE.
+        // Sin evidencia empírica de fps reales no se declara 120 (4K@120 exige L156).
+        $fpsRaw      = (int)($profile['fps'] ?? 60);
+        $fpsVerified = ($profile['fps_verified'] ?? false) === true;
+        $fps         = $fpsVerified ? max(1, $fpsRaw) : min(max(1, $fpsRaw), 60);
         $bw  = RQ_MAX_BW;
+        $lvl = ($fps > 60) ? 'L156' : 'L153';
+        $codec = 'hvc1.2.4.' . $lvl . '.B0';
-        return "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$bw},RESOLUTION=3840x2160,FRAME-RATE={$fps}.000,"
-            . 'CODECS="hvc1.2.4.L153.B0,mp4a.40.2",HDR=PQ,VIDEO-RANGE=PQ,AUDIO="aac_atmos",'
+        return "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$bw},RESOLUTION=3840x2160,FRAME-RATE={$fps}.000,"
+            . 'CODECS="' . $codec . ',mp4a.40.2",HDR=PQ,VIDEO-RANGE=PQ,AUDIO="aac_atmos",'
             . 'CLOSED-CAPTIONS=NONE,SUBTITLES="subs"';
     }
```
> **Además detectado y NO incluido en el fix (fuera de alcance):** `HDR=PQ` **no es un atributo HLS válido**
> (el válido es `VIDEO-RANGE`, que ya se emite), y `AUDIO="aac_atmos"` / `SUBTITLES="subs"` referencian `GROUP-ID`
> que no existen (el archivo no emite ningún `#EXT-X-MEDIA`, RFC 8216 §4.3.4.1). Recomiendo quitarlos en el mismo
> pase cuando se libere el archivo. **No los toqué.**

### 3.3 B-09 · el `STREAM-INF` huérfano

```
4539:             if ($trimmed === '#EXTM3U') {
4541:                 // === QUANTUM TACTIC 2: ISP Strangulation x2 (HLS Tag) ===
4542:                 $isNuclearProfile = in_array($effective_profile, ['P0', 'P1']);
4543:                 if ($isNuclearProfile) {
4544:                     $enriched[] = '#EXT-X-STREAM-INF:BANDWIDTH=384000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"';
4545:                 }
4549:                 $enriched[] = '#EXT-X-SESSION-DATA:DATA-ID="org.mpeg.lcevc",VALUE="1"';
```

Tres defectos en una línea: (1) `#EXT-X-STREAM-INF` **sin URI** —el siguiente elemento es un `SESSION-DATA`—
viola RFC 8216 §4.3.4.2 y **dispara el propio validador del archivo** (L856: `'{$nextLine}' entre
EXT-X-STREAM-INF y URL`); (2) `BANDWIDTH=384000000` (384 Mbps) es una declaración falsa que rompe el ABR;
(3) `RESOLUTION=3840x2160` para el perfil llamado `P0_ULTRA_SPORTS_8K`.

**Fix pendiente:** eliminar el bloque `if ($isNuclearProfile) { … }` completo (L4541-4545). Si el objetivo era
influir en el ABR, el vehículo correcto es un tag privado (`#EXT-X-APE-*`, ignorado por el player conforme
RFC 8216 §6.3.1), nunca un `STREAM-INF` real.

---

## 4. B-10b · ✅ APLICADO en T23 (D-58) — y corrección de la aritmética de este mismo apartado

> **Estado:** aplicado el 2026-10-25 en t23 (attempt `1f7b3c26`). El apartado se conserva porque documenta la
> decisión, pero **corrijo aquí un número que publiqué mal** en T11. Detalle completo en `REMEDIATION_LOG_T23.md`.

### 4.1 Lo que había (`:737`, estado T11)

```
    $fps        = $cfg['fps']      ?? 120; // MEMC-TOTAL-8K120: default 120fps
```

**Salida REAL con los defaults** (extraída y ejecutada por `tools_t11_emission_proof.php`, no simulada):
```
#EXT-X-STREAM-INF:BANDWIDTH=15150000,AVERAGE-BANDWIDTH=10100000,RESOLUTION=1920x1080,FRAME-RATE=120,CODECS="avc1.640028,mp4a.40.2"
```

### 4.2 ⚠️ Corrección: la afirmación sobre HEVC L5.1 era falsa

Escribí antes: *«HEVC `hvc1.2.4.L153` (5.1) MaxLumaSr 222 822 400 luma/s … necesita L5.2»*. **Ese valor no es el
de L5.1 y la conclusión tampoco.** Contra las tablas de los estándares:

| Códec / nivel | Límite real | `1920x1080@120` | ¿Excede? |
|---|---|---|---|
| **H.264 High@L4.0** (`avc1.640028`) | MaxMBPS **245 760** MB/s · 1080p = 8 160 MB | 8 160 × 120 = **979 200** | ⛔ **3,99×** |
| H.264 High@L4.0 a 30 fps | idem | 8 160 × 30 = **244 800** | ✅ justo dentro (244 800 ≤ 245 760) |
| **HEVC L5.1** (`hvc1.2.4.L153.B0`) | MaxLumaSr **534 773 760** luma/s (H.265 Tabla A.8) | 2 073 600 × 120 = **248 832 000** | ✅ **dentro** |
| HEVC L5.1 a 4K@60 | idem | 8 294 400 × 60 = **497 664 000** | ✅ dentro (por eso L153 = "4K@60 CORONA") |

⇒ La violación de nivel **dura** estaba **solo en la rama AVC**. El cap a 60 en HEVC lo exige la doctrina
**D-15** (no declarar fps sin evidencia de que son reales) — y coincide con el anclaje declarado del propio
sistema: `#EXT-X-CORTEX-CONSTANT-FRAME-RATE:CFR_60_ANCHOR_LOCKED` (`rq_streaming_health_engine.php:205`).

### 4.3 Lo que se aplicó finalmente (`:737-747`)

```php
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

**Resultado medido:** `?? 120` = **0 ocurrencias**; 7 escenarios ejecutados sin un solo caso por encima del techo
(`REMEDIATION_LOG_T23.md` §1.3); `php -l` exit 0; proof 52/52 exit 0.

---

## 5. Prueba de no-intervención (lo que NO toqué, con hash)

| Archivo | Bytes | mtime | SHA-256 | ¿== baseline? |
|---|---:|---|---|---|
| `backend/resolve_quality_unified.php` | 348 758 | 2026-10-25T21:35:16 | `20AC4B2631C1E877A3DE92B4E479B6C2EFA171AD1A317869F9343A99C3C5F2B5` | ✅ |
| `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | 748 672 | 2026-10-25T23:11:04 | `6881CB9D0D9E4C4FDAC801405532DC3265D0F51E4BAD2C392C2854FCDE5C8CB4` | ✅ |
| `backend/rq_streaming_health_engine.php` | 13 931 | 2026-04-06T01:01:25 | `E0E405FA18F0157DA6AD5CB441C8BF94B2BBB7AA473BA585F1BE76CAA82C9BBB` | ✅ |

---

## 6. EXT-01 · `contracts/verify_contracts.mjs` = FAIL → **BLOCKED_BY_OWNER** (no es fallo de T23)

```
FAIL  SHA MISMATCH _vps_stage/tests/fanout_concurrency.sh: contrato 9b774bffbe6c744f… vs real b558b1cdff883579…
RESULT=FAIL (1 fallos, 11 ok)
EXIT=1
```

**Clasificación: `BLOCKED_BY_OWNER`** — el desajuste pertenece a otra sesión; esta tarea no lo causó ni puede cerrarlo.

- **Causa:** drift **preexistente** en un archivo ajeno. Medido: `_vps_stage/tests/fanout_concurrency.sh` en disco =
  99 666 B · mtime `2026-10-25T22:32:40` · sha256 `B558B1CDFF883579…`; el contrato espera `9b774bffbe6c744f…`.
- **No lo reparo por dos motivos independientes:** `_vps_stage/tests/**` está bajo **L-004** (`no_touch`) y
  `contracts/**` (donde vive el hash esperado) bajo **L-007** ⇒ me está prohibido escribir **en ambos lados** del desajuste.
- **Prueba de que no lo causé:** mi único archivo modificado es `vps/ape_hls_generators.php`
  (`git diff --numstat` = `16 8`), que **no participa en ninguno** de los 12 contratos del verificador: los otros
  **11 dan PASS** y el único FAIL es el de ese `.sh` ajeno, con mtime anterior a mi edición.
- **Prueba adicional:** el hash de ese `.sh` no cambió entre la medición de T11 (22:32:40) y la de T23.

**Acción del owner:** que la sesión dueña de `_vps_stage/tests/` (t45/t46) commitee el archivo y/o actualice el
hash del contrato (L-007). Entonces `verify_contracts.mjs` pasará a PASS sin que esta lane toque nada.

---

## 7. Lo que hace falta para desbloquear (para el capitán)

| Desbloqueo | Quién | Efecto |
|---|---|---|
| Liberar L-001 (`frontend/js/**`) | dsh-lead / t44 | Habilita B-05 (fake-8K default) y B-13 (I-FRAME) |
| Commitear `resolve_quality_unified.php` (WIP) | sesión dueña | Habilita B-06, B-09 y los 3 atributos inválidos de §3.2 |
| ~~Autorizar B-10b~~ | — | ✅ **HECHO en T23** (D-58): clamp FRAME-RATE aplicado y verificado |
| Commitear `_vps_stage/tests/fanout_concurrency.sh` | t45/t46 | `verify_contracts.mjs` → PASS (hoy `BLOCKED_BY_OWNER`, §6) |
| Commitear `vps/ape_hls_generators.php` (16/8) | capitán | Cierra T11/T23 con el artefacto verificado |

Ninguna de ellas requiere que yo escriba en un archivo bloqueado.

---

## 8. T29 · Identidad del artefacto: **dos hashes** y regla de despliegue

> **Contexto:** la revisión t27 detectó que el ledger publicaba **un solo** sha256 y lo etiquetaba como «hash del
> blob». Era falso: ese valor es el del **checkout de Windows (CRLF)**. El capitán confirmó el error de criterio
> («es MÍO, no del código»). Esta sección fija la identidad correcta y la regla que impide repetirlo.

### 8.1 Las dos identidades, medidas

| Identidad | Dónde vive | Bytes | CR / LF | SHA-256 |
|---|---|---:|---|---|
| **BLOB git (LF)** — oid `4127f01771fa912ccc50a64421ba26e58c925c43` | `4c24d48:IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php` | **39 745** | CR=0 / LF=756 | **`E8FC25137771F87D63EBD08059DC6D57A772C510ADC6AEED8777A1CE5D0AF72A`** |
| **CHECKOUT Windows (CRLF)** | working tree local (`core.autocrlf=true`) | **40 501** | CR=756 / LF=756 | `C2332FBD80131029102AF4D36E456951CA8BDCF7E310DC099C86EEA15175458B` |

Diferencia = **756 B** = exactamente los 756 CR que `core.autocrlf=true` añade al materializar el archivo.
Verificado con extracción **binaria** (`.NET BaseStream → WriteAllBytes`), no con redirección de texto.

### 8.2 Cuál se compara contra el VPS

**El BLOB LF.** El VPS es Linux y recibe el contenido de git, no el checkout de Windows. Comparar el checkout
contra producción produce un falso drift de 756 bytes.

```
✅ ARTEFACTO DE DESPLIEGUE/COMPARACIÓN = git cat-file blob 4127f017…  (LF, 39 745 B, E8FC2513…)
❌ NUNCA el fichero del working tree Windows (CRLF, 40 501 B, C2332FBD…)
❌ NUNCA `git show … > fichero` con redirección de TEXTO en PowerShell/cmd: inserta CRLF y devuelve el hash equivocado
```

### 8.3 `.gitattributes` — diferido a **D-75** (owner), no aplicado aquí

| Opción propuesta por t27 | Efecto medido | Estado |
|---|---|---|
| `*.php text eol=lf` | Convertiría el checkout de **todos** los `.php` del repo a LF ⇒ cientos de ficheros «modificados» en el working tree de **4 sesiones activas** a mitad de campaña | ⛔ **NO aplicado** (riesgo de bare-commit / pisar WIP ajeno con L-001/L-004/L-007 vigentes) |
| `*.php -text` | Desactiva la normalización: blob == checkout, pero cambia la semántica de diffs/merges futuros de todo el repo | ⛔ **NO aplicado** (decisión de repositorio, no de esta lane) |

**Decisión del owner: D-75.** Mientras esté pendiente, rige §8.2. Esto **no bloquea** la remediación: el
contenido del código es el mismo en ambas identidades y la prueba de emisión pasa 52/52 en las dos
(`REMEDIATION_LOG_T23.md` §10.2).

### 8.4 Lo que sí quedó hecho (no requiere `.gitattributes`)

- El harness acepta `$argv[1]` y **declara en su propia salida** qué identidad evaluó
  (bytes, sha256, CR/LF, etiqueta `BLOB-LF` / `CHECKOUT-CRLF`). Así la identidad ya no depende de lo que diga
  un ledger: viaja en la evidencia.
- Corrida **B** contra el blob extraído byte-exacto: `39 745 B · E8FC2513… · CR=0 LF=756` → **PASS=52 FAIL=0, exit 0**.

---

## 9. Nota de alcance sobre `audit/alignment/2026-10-25/00-captain/DECISIONES.md`

El contrato de t29 listaba `00-captain/DECISIONES.md` (criterio **D-65**) como parte del alcance para reformular
la identidad. **No se editó**, por tres razones verificadas:

1. La instrucción operativa del capitán (mensaje de t29) enumera dónde registrar las dos identidades:
   `REMEDIATION_LOG_T23.md` / `VERIFY_OUTPUT_T23.md` / `BLOCKED.md` — **no** su propio ledger.
2. `audit/alignment/2026-10-25/00-captain/**` figura en `BOARD.json → no_touch[]` como
   *«lane nueva del capitán (DECISIONES.md)»*. Escribir ahí sin autorización explícita sería exactamente el
   pisado que este tablero existe para evitar.
3. El propio capitán asumió el error de D-65 («Asumo el error»), lo que lo convierte en su corrección editorial.

**Texto listo para que el capitán lo pegue en D-65** (o me autorice a aplicarlo):

```markdown
- **Identidad del artefacto (corregido en T29).** La remediación está en el commit `4c24d48`.
  Hay DOS identidades y C2 las confundía:
  · BLOB git (LF, **es lo que viaja y lo que se compara con el VPS**): oid `4127f01771fa912ccc50a64421ba26e58c925c43`
    · 39 745 B · sha256 `E8FC25137771F87D63EBD08059DC6D57A772C510ADC6AEED8777A1CE5D0AF72A` · CR=0, LF=756.
  · CHECKOUT Windows (CRLF, sólo local): 40 501 B · sha256 `C2332FBD…75458B` · CR=756, LF=756.
  El hash anterior (`C2332FBD…`) describía el checkout, no el blob: el paréntesis «hash del blob, no del working
  tree» era falso. Causa: `core.autocrlf=true` + redirección de texto de PowerShell al canalizar `git show`.
  Regla: hashear siempre el blob LF; prohibido hashear/scp del working tree Windows como artefacto de git.
  `.gitattributes` (`*.php text eol=lf` / `-text`) queda **diferido a D-75** por su efecto sobre el checkout de
  todos los `.php` de las sesiones activas.
```
