# CANARY TRUTH — verdad medida de Canary y paridad de los entregables

**Fecha de medición:** 2026-11-11 (America/Bogota)
**Auditor:** canary-auditor (team `canary-jit-20261111`, task `t1`)
**WORKDIR:** `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION`
**Alcance:** solo lectura sobre el repo. No se desplegó, no se hizo push, no se tocó `.agents/skills` ni config del Harness, no se mutó el VPS.

**Documento hermano:** la batería HTTP del motor JIT (200/206/302) es de `t2`, no de esta auditoría. Aquí el motor JIT se cita **por lectura de código**, nunca por ejecución.

---

## 0. Regla de este documento

Cada fila lleva su artefacto en la misma línea: `ruta:línea` o el comando exacto con su salida. Un número sin fuente **no se reporta**: se reporta como `NO_COMPUTADO` con la razón.

Tres estados de evidencia, sin mezclarlos:

| Estado | Significado |
|---|---|
| `SOPORTADO` | medido por mí, reproducible con el artefacto citado |
| `NO_SOPORTADO` | la afirmación contradice el artefacto medido |
| `NO_COMPUTADO` | no existe el dato o no puedo medirlo, **y digo por qué** |

**Aviso de límite duro:** no tengo acceso al VPS. Todo lo que diga del VPS es **documental** (lo que dicen los documentos del repo) y va marcado como tal. Ningún veredicto de esta auditoría es una medición en vivo del servidor.

---

## 1. Identidad de los 4 entregables

Comando: `Get-FileHash -Algorithm SHA256` sobre cada fichero de `scratch\canary_jit_20261111\`.

| Entregable | Bytes | SHA-256 | Coincide con lo declarado por el capitán |
|---|---|---|---|
| `APE_CANARY_JIT_INTEGRACION_20261111.zip` | 9155 | `9a13ec2c266f662ef8ded99520b691d611bda8f99695a0aed387c56991136fe1` | **SOPORTADO** |
| `Manual_REA_Canary_JIT_Actualizado_20261111.pdf` | 153775 | `7149a4397a95c4159508549729f5bd07a55db9bc7dd3afe46da4cf3b6476f3ca` | **SOPORTADO** |
| `Arquitectura_APE_Canary_JIT_Actualizada_20261111.pdf` | 165330 | `e0539e506ffaec0aeac78ba6d7f49f8f5bdcfc060f0e834da9d8f7bdd7ed75cc` | **SOPORTADO** |
| `APE_REA_653_OTT_DASH_2K_4K_6K_TEST_20261108.apk` | 24362980 | `4b0c4ef397a6ea7066b5f51951d4fefb94820b0e94aeaf07f3f879ca6674d341` | **SOPORTADO** |

### 1.1 Paridad interna del ZIP

Comando: `[IO.Compression.ZipFile]::OpenRead(...)` → `entries total = 11`.

| Hecho | Artefacto | Veredicto |
|---|---|---|
| 11 entradas: 3 directorios + 8 ficheros | listado de entradas del ZIP | SOPORTADO |
| `APE_CANARY_JIT_INTEGRACION_20261111/docs/` existe con `Length=0` y **0 entradas hijas** | ZIP entry `.../docs/` → 0 B | **SOPORTADO** (la carpeta `docs/` está vacía) |
| Ningún PDF ni la APK viajan dentro del ZIP | las 11 entradas listadas | SOPORTADO |

**Consecuencia:** el ZIP es el paquete de código (7 ficheros + README); los 2 PDF son documentos sueltos y la APK es un binario suelto. No hay bundle único verificable. **El `docs/` vacío es un hueco real, no un artefacto de extracción.**

### 1.2 Identidad de la APK

Comando: lectura del string pool UTF-16LE de `AndroidManifest.xml` dentro del APK + escaneo de las 422 entradas descomprimidas.

| Hecho | Valor | Artefacto |
|---|---|---|
| ZIP válido con 422 entradas | 422 | `entries total = 422` |
| Paquete | `com.ape.crystalagent` (23 ocurrencias; componentes `AgentService`, `AraAccessibilityService`, `BootReceiver`, `CaptureWatchdogService`) | string pool de `AndroidManifest.xml` |
| Librerías nativas | 20 entradas `lib/*` (incl. `libwg.so`, `libtensorflowlite_jni.so`) | listado del ZIP |
| Assets | 24 entradas `assets/*` (shaders GL) | listado del ZIP |
| Cadenas `ape-jit`, `/jit/signal`, `chain_4k_test` | **0 ocurrencias** en las 422 entradas descomprimidas | escaneo Latin1 de contenido descomprimido |

**Veredicto:** la APK es el host `com.ape.crystalagent` y es coherente con `README.md:22` ("Mantener la app host `com.ape.crystalagent` … **no** abrir `device-register.php`"). **NO_SOPORTADO** cualquier lectura de la APK como entregable de Canary/JIT: no contiene una sola referencia a `ape-jit`, `/jit/signal` ni `chain_4k_test`. La APK no consume ni aplica la receta de Canary.

> Nota de método: un escaneo de bytes sobre el ZIP **comprimido** devuelve 0 para todo y sería una lectura falsa. Los conteos de arriba son sobre contenido **descomprimido** entrada por entrada.

---

## 2. Item 1 — La cadena REAL vs el `filtergraph` de `quality-policy.json`

### 2.1 Cuál script es «la cadena real»

Hay **dos** artefactos con el mismo nombre y no son el mismo fichero:

| Fichero | Bytes | Líneas | SHA-256 (16) | ¿Es el que se despliega? |
|---|---|---|---|---|
| `_vps_stage/canary/ape-visual-emulate.sh` | 4068 | 80 | `653b56e1ef964bc6` | **SÍ** |
| `vps/bin/ape-visual-emulate.sh` | 6714 | 144 | `f1d2ecff6e6468eb` | **NO** |

Prueba de cuál se despliega — `_vps_stage/deploy/manifest.tsv:39`:

```
_vps_stage/canary/ape-visual-emulate.sh	/usr/local/bin/ape-visual-emulate.sh	755	root:root	canary 4K (25M/32M/64M keyint 48)
```

Y la confirmación independiente por tamaño, `docs/manifestos/INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:128`:

```
| `/usr/local/bin/ape-visual-emulate.sh` | original 4.068 B (backup 06:42) |
```

Comando: `Select-String -Pattern 'vps/bin/ape-visual-emulate'` sobre `manifest.tsv` → **0 filas**.

> **Hallazgo H-1 (bloqueante para la integración):** el script de 144 líneas que **sí** implementa el bucle cerrado Canary↔JIT (`vps/bin/ape-visual-emulate.sh`, 6714 B) **no está en el manifiesto de deploy**. Lo que corre en `/usr/local/bin/ape-visual-emulate.sh` es la versión de 80 líneas / 4068 B, que **no tiene** ninguna llamada a JIT. Integrar Canary con JIT exige cambiar `manifest.tsv:39`; nadie lo ha hecho.

### 2.2 La cadena declarada es byte-idéntica en los 5 sitios donde aparece

Comparación carácter a carácter del string de 185 caracteres (SHA-256 del string, primeros 16 hex: `ed1fe6fe00be413f`):

| Artefacto | `identical_to_policy` | Línea |
|---|---|---|
| `canary/quality-policy.json` (`chain[].filter` unidos por `,`) | `True` | `quality-policy.json:7-14` |
| `canary/canary_quality.js` (`EXACT[]`) | `True` | `canary_quality.js:8-11` |
| `_vps_stage/canary/ape-visual-emulate.sh` (`FILTERS=`) | `True` | `ape-visual-emulate.sh:52` |
| `vps/bin/ape-visual-emulate.sh` (`FILTERS=`) | `True` | `ape-visual-emulate.sh:101` |
| `tests/canary-quality.test.js` (literal del assert) | `True` | `canary-quality.test.js:10` |

**Veredicto sobre el string:** `SOPORTADO`. El string **no** diverge. La divergencia está en otra parte (2.3 y 2.4), y es más grave.

### 2.3 Divergencias de la cadena desplegada contra `quality-policy.json`

| # | Elemento | `quality-policy.json` | Script desplegado (`_vps_stage/…:55-65`) | Veredicto |
|---|---|---|---|---|
| D1 | Filtros y orden (8 pasos) | `deblock,smartblur=…,yuv444p,scale…,noise…,unsharp…,eq…,yuv420p` | idéntico | SOPORTADO |
| D2 | `-r` (fps) | `reference_experiment_only.fps = 5` (`:17`) | `-r "$FPS"`, `FPS=${CANARY_FPS:-5}` (`:26`, `:57`) | SOPORTADO |
| D3 | `-an` (audio off) | `"audio": "disabled"` (`:17`) | `-an` (`:57`) | SOPORTADO |
| D4 | `-t` | `seconds = 6` (`:17`) | `-t "$SECONDS_OUT"`, default 6 (`:25`) | SOPORTADO |
| D5 | Encoder + preset + tune | `libx265` / `ultrafast` / `zerolatency` (`:16`) | idéntico (`:59`) | SOPORTADO |
| D6 | **`x265-params`** | `pools=1:frame-threads=1` (`:16`) | `pools=1:frame-threads=1:keyint=48:min-keyint=48:scenecut=0:bframes=0:rc-lookahead=0` (`:60`) | **NO_SOPORTADO** — el validador sólo compara 4 campos (`canary_quality.js:23-28`) y deja 5 parámetros del encoder real fuera del contrato |
| D7 | **Control de tasa** | **no declarado en ningún sitio** | `-b:v 25M -maxrate 32M -bufsize 64M` (`:61`) | **NO_COMPUTADO en el contrato** — la receta «canónica» no puede expresar el rate control; dos ejecuciones con la misma cadena y distinto `-b:v` no son la misma imagen |
| D8 | **GOP / keyint** | **no declarado** | `-g 48 -keyint_min 48 -sc_threshold 0` (`:62`) | **NO_COMPUTADO en el contrato** (ver D9) |
| D9 | **GOP en `canary-render.js`** | n/a | `-g 5 -keyint_min 5 -sc_threshold 0` (`canary-render.js:21`) | **NO_SOPORTADO como «paridad»**: el render usa GOP 5 y el script desplegado GOP 48. `canary-render.js:25` se auto-declara `parity with isolated Canary experiment`; **no lo es** |
| D10 | **Rate control en `canary-render.js`** | n/a | no emite `-b:v`/`-maxrate`/`-bufsize` | **NO_SOPORTADO como «paridad»**: cae en el CRF por defecto de x265, no en 25M |
| D11 | Contenedor de salida | no declarado | `-f hls -hls_time 3 -hls_list_size 20 -hls_flags independent_segments+delete_segments` (`:63-64`) | SOPORTADO (HLS) — y **cero DASH** (ver §4) |
| D12 | `-loglevel` | n/a | `error` (`:55`) vs `warning` en `canary-render.js:18` | divergencia menor, declarada |

### 2.4 Cadena real reconstruida (script desplegado, 80 líneas)

```
ffmpeg -hide_banner -nostdin -loglevel error
  -i "$CANARY_SOURCE_URL"
  -t 6 -r 5 -an
  -vf "deblock,smartblur=lr=1.5:ls=-0.5,format=yuv444p,
       scale=3840:2160:flags=lanczos,noise=alls=8:allf=t,
       unsharp=5:5:0.8:3:3:0.4,eq=contrast=1.05:brightness=0.02:saturation=1.05,
       format=yuv420p"
  -c:v libx265 -preset ultrafast -tune zerolatency
  -x265-params pools=1:frame-threads=1:keyint=48:min-keyint=48:scenecut=0:bframes=0:rc-lookahead=0
  -b:v 25M -maxrate 32M -bufsize 64M
  -g 48 -keyint_min 48 -sc_threshold 0
  -f hls -hls_time 3 -hls_list_size 20 -hls_flags independent_segments+delete_segments
  "$OUT/out.m3u8"
```
Fuente: `_vps_stage/canary/ape-visual-emulate.sh:55-65`. Gate previo: `ara-skill check --for-canary` (`:37-40`, exit 78 si falla). Verificación de salida: `ffprobe` del `.ts` debe dar exactamente `3840x2160` o `exit 6` (`:69-70`).

### 2.5 El `dering` — la razón de la sustitución es correcta, la versión citada no

| Afirmación | Medición | Veredicto |
|---|---|---|
| «`dering` no existe en ffmpeg 6.1 Ubuntu» (`ape-visual-emulate.sh:10`) | `ffmpeg -h filter=dering` → **`Unknown filter 'dering'.`**; `ffmpeg -filters` (576 líneas) → **0 coincidencias** de `dering` | **SOPORTADO en cuanto a la ausencia del filtro**, pero medido sobre **ffmpeg 8.0.1-full_build** (local Windows), **no** sobre ffmpeg 6.1 Ubuntu. La versión concreta es **NO_COMPUTADO** (no tengo ese binario) |
| `smartblur` es sustituto con sintaxis válida | `ffmpeg -h filter=smartblur` → `Filter smartblur … Blur the input video without impacting the outlines.` | SOPORTADO |

**No hay mentira al parser aquí:** el script no emite el token `dering` como filtro; lo usa sólo como *nombre de variable* (`DERING="smartblur=lr=1.5:ls=-0.5"`, `ape-visual-emulate.sh:100` del fichero de 144 líneas / `:51` del de 80) y lo declara en el recibo (`status.json` → `"filters":"deblock,dering(smartblur),…"`).

### 2.6 Aspect ratio — el defecto es real y está medido

`scale=3840:2160` fija ancho **y** alto, sin `force_original_aspect_ratio`. Demostración ejecutada (fuente sintética 1920×800, DAR 12:5 = 2.40:1, 1 frame a muxer nulo — no escribe fichero):

```
A) canary: -vf "scale=3840:2160:flags=lanczos"
   Output: 3840x2160 [SAR 27:20 DAR 12:5]
B) JIT:    -vf "scale=w=3840:h=2160:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=3840:2160"
   Output: 3840x2160 [SAR 1:1 DAR 16:9]
```

Aritmética: `h_scale = 3840/1920 = 2.0`; `v_scale = 2160/800 = 2.7`; distorsión `v/h = 1.35 = 27/20`. **El raster queda deformado 1.35× en vertical** y ffmpeg lo «compensa» escribiendo `SAR=27:20`: la imagen sólo se ve correcta si el player honra el SAR. En HLS con x265 el SAR viaja en el VUI, pero un player que lo ignore muestra el canal estirado.

| Afirmación | Artefacto | Veredicto |
|---|---|---|
| «`scale=3840:2160` puede estirar entradas no-16:9» | `quality-policy.json:18` (`compatibility.source_aspect_warning`) | **SOPORTADO** — y el aviso es **insuficiente**: el defecto es del propio `filtergraph` que el JSON declara canónico, no una advertencia externa |
| La cadena del JIT maneja mejor el AR que la «canónica» de Canary | `tools/lab/ape-jit/server.js:8668-8670` (`force_original_aspect_ratio=decrease` + `pad`) y la corrida B de arriba | **SOPORTADO** — inversión de autoridad: en aspect ratio, el consumidor es más correcto que la autoridad |

---

## 3. Item 2 — Pruebas y plan, ejecutados de verdad

Comando y directorio exactos: `cd scratch\canary_jit_20261111\unzipped\APE_CANARY_JIT_INTEGRACION_20261111` · `node --version` → `v24.12.0`

### 3.1 `node --test tests/canary-quality.test.js` — salida literal

```
✔ chain exact, same order as staged Canary FASE01 (0.6886ms)
✔ JIT never reports applied without frame proof (0.2031ms)
✔ cannot blindly map HDR to SDR canary chain (0.1074ms)
✔ thermal gating fails closed (0.1121ms)
✔ insufficient display capability fails closed (0.1065ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 77.2274
EXITCODE=0
```

**`SOPORTADO`: son 5 tests, no 9.** Confirmado por doble vía: la salida del runner (`ℹ tests 5`) y el conteo estático `^test\(` en `tests/canary-quality.test.js` → **5** (líneas 9, 12, 19, 22, 25).

### 3.2 `node canary/canary-plan.js canary/quality-policy.json canary/facts.example.json` — JSON literal

```json
{
  "policy_id": "visual-canary-fase01-parity",
  "policy_revision": 1,
  "policy_sha256": "9845aa5da438213d86b1e58fdb8c5e7c081395e0de9798d23689a2dd8b86fc65",
  "desired_mode": "CANARY_SPATIAL_4K",
  "canary_fidelity": "FILTERGRAPH_IDENTICAL",
  "execution": "ELIGIBLE_FOR_BENCHMARK",
  "applied_processing": "NOT_EXECUTED",
  "reason": "BENCHMARK_REQUIRED_BEFORE_ENABLE",
  "filtergraph": "deblock,smartblur=lr=1.5:ls=-0.5,format=yuv444p,scale=3840:2160:flags=lanczos,noise=alls=8:allf=t,unsharp=5:5:0.8:3:3:0.4,eq=contrast=1.05:brightness=0.02:saturation=1.05,format=yuv420p",
  "reference_encoder": {"video_codec":"libx265","preset":"ultrafast","tune":"zerolatency","x265_params":"pools=1:frame-threads=1"},
  "reference_fps": 5,
  "live_fps": 29.97,
  "source": {"width":1920,"height":1080,"transfer":"bt709"},
  "device": {"hevcDecode":true,"displayWidth":3840,"displayHeight":2160,"thermalState":"nominal"}
}
```
`EXITCODE=0`

### 3.3 `node canary/canary-render.js …` sin `--run` — DRY_RUN (no ejecuté ffmpeg, no escribí salida)

```
status: DRY_RUN
policy_sha256: 9845aa5da438213d86b1e58fdb8c5e7c081395e0de9798d23689a2dd8b86fc65
expected_output: "3840x2160 at 5fps, no audio: parity with isolated Canary experiment"
comando: ffmpeg -hide_banner -nostdin -loglevel warning -i <input> -t 6 -r 5 -an -vf <cadena>
         -c:v libx265 -preset ultrafast -tune zerolatency -x265-params pools=1:frame-threads=1
         -g 5 -keyint_min 5 -sc_threshold 0 -f hls -hls_time 3 -hls_list_size 20
         -hls_flags independent_segments+delete_segments <out>/out.m3u8
EXITCODE=0
```
No usé `--run` a propósito: escribiría una carpeta HLS fuera del entregable. El comando real queda registrado arriba por el propio DRY_RUN, que es su función.

### 3.4 Qué prueban los 5 tests y qué NO

| Test (`:línea`) | Qué verifica de verdad | Qué **no** verifica |
|---|---|---|
| `:9` «chain exact, same order as staged Canary FASE01» | que `quality-policy.json` sigue igual al array `EXACT` hardcodeado en `canary_quality.js:8-11` | **no abre `ape-visual-emulate.sh`**. La palabra «staged» del nombre es una afirmación que el test nunca comprueba. Es una **tautología útil** (detecta drift del JSON) presentada como paridad con el script |
| `:12` «JIT never reports applied without frame proof» | que `applied_processing` es el literal `'NOT_EXECUTED'` | que algo se ejecutó o dejó de ejecutarse: es un literal en `canary_quality.js:47` |
| `:19` «cannot blindly map HDR to SDR» | que `transfer:'smpte2084'` → `NOT_ELIGIBLE` | que la cadena funcione en SDR: sólo evalúa una condición booleana (`canary_quality.js:37`) |
| `:22` «thermal gating fails closed» | `thermalState:'severe'` → `NOT_ELIGIBLE` | nada térmico medido; el valor lo pone el test |
| `:25` «insufficient display capability fails closed» | `displayWidth:1920` → `NOT_ELIGIBLE` | nada del display real |

**Veredicto conjunto:** los 5 tests son **pruebas de contrato sobre constantes y condicionales**. Ninguna toca un frame, un fichero de vídeo, el script desplegado, ni un endpoint. `pass 5 / fail 0` es cierto y **no acredita ni un píxel de paridad visual**. Cualquier lector que lea «9/9 correctas» como validación de imagen está leyendo una etiqueta que el artefacto no respalda.

---

## 4. Item 3 — Divergencia entre el «resumen del operador» y el artefacto

| Afirmación del resumen | Artefacto | Veredicto |
|---|---|---|
| **«9/9 correctas»** | `node --test` → `ℹ tests 5 / pass 5`; `tests/canary-quality.test.js` → 5 bloques `test(`; `README.md:3` → «5 pruebas Node»; PDF Manual p.3 → «El paquete local tiene **5 pruebas Node PASS**»; `grep '9/9'` en los 4 ficheros del ZIP → **0 hits**; `grep '9/9'` en ambos PDF → **0 hits** | **NO_SOPORTADO** — no hay 9 pruebas en ningún entregable. El «9/9» no tiene artefacto de origen: `NO_COMPUTADO` de dónde salió |
| **«PRUEBA SINTÉTICA 25 fps HEVC + AAC»** | `canary-render.js:19` → `'-t','6','-r','5','-an'`; `quality-policy.json:17` → `{"fps":5,"seconds":6,"audio":"disabled"}`; PDF (ambos) p.1 → «Experimento a **5 fps**; 30 frames consumieron 164,1 s» y «Canary experimental **desactiva audio**»; «25 fps» → **0 hits** en ambos PDF y en el ZIP | **NO_SOPORTADO** para el Canary. El «25 fps HEVC» sí existe como medición **del JIT**, no del canary: Arquitectura p.15 «Tres fragmentos medidos mostraron 1080p/25 HEVC o 720p H.264 a 25/30 fps … **esos fragmentos no acreditan su aplicación**». El «AAC» es del **JIT**: Arquitectura p.17 «`audioArgs` recodifica a AAC estéreo». **Se atribuyó al Canary lo que el documento atribuye al JIT** |
| **«EMPAQUETADO HLS + DASH, manifiestos y fragmentos generados»** | `canary-render.js:22` → `'-f','hls'` y **nada más**; `grep -i 'dash\|mpd'` en `canary-render.js` → **0 hits**; `canary-render.js:16` → `OUTPUT_MUST_NOT_EXIST` (nunca sobreescribe, por diseño no hay salida previa); `grep 'DASH'` en README/tests/policy → **0 hits** | **NO_SOPORTADO** — cero DASH en el paquete Canary. La frase «HLS/DASH» del PDF (p.1) pertenece a la **columna «JIT revisado»** de la tabla, y Arquitectura p.16 la detalla para el **worker CMAF del JIT** («FFmpeg usa el muxer DASH con HLS habilitado: master.m3u8, … manifest.mpd, init y chunks fMP4»). **No es un recibo del canary** |

### 4.1 El mismo error, tres veces

Las tres afirmaciones comparten un patrón: **se toma una propiedad del JIT (25 fps HEVC, AAC estéreo, HLS+DASH) y se presenta como propiedad del Canary**, cuando los dos PDF — que el propio resumen acompaña — dicen lo contrario en su tabla de la página 1:

| Elemento (PDF p.1) | Canary visual (referencia) | JIT revisado (rama audit) |
|---|---|---|
| Codificación | `libx265 ultrafast zerolatency; pools=1:frame-threads=1` | `HEVC, AV1, H.264 o copy según fuente/modo` |
| Tiempo real | `Experimento a 5 fps; 30 frames consumieron 164,1 s: ~0,18 fps` | `Salida HLS/DASH bajo demanda; …` |
| Audio y color | `Canary experimental desactiva audio; no valida HDR` | `JIT recodifica a AAC estéreo en ciertas rutas` |

**Los PDF son honestos. El resumen que los acompaña no lo es.** Esto importa para el contrato fail-closed: si el resumen se propaga como recibo, el `output` del contrato queda envenenado en el origen.

---

## 5. Item 4 — El costo real, y qué cifra es de qué artefacto

**Cinco números distintos, cinco artefactos distintos, ninguno intercambiable.**

| Cifra | Qué mide exactamente | Artefacto | Veredicto |
|---|---|---|---|
| **0,18 fps** (0,1828) | Canary 4K x265 a `CPUQuota=40%`: **30 frames en 164,1 s** | `_vps_stage/canary/FASE01_REPORT.md:59` («Wall 170 s; encode 30 frames en 164.1 s (**0.18 fps**)»); replicado en ambos PDF p.1 | **SOPORTADO** y aritmética verificada: `30 / 164,1 = 0,1828` |
| **39,09 %** | uso de CPU del cgroup en ese mismo run (bajo el techo 40 %) | `FASE01_REPORT.md:58` (`cpu_pct_avg=39.09`) | SOPORTADO; `39,09 < 40` ✓ |
| **40,02 %** | run **anterior** (`41180193935`), que **falló el gate de CPU** y no se declaró PASS | `FASE01_REPORT.md:19` | SOPORTADO — se declara el fallo, no se oculta |
| **57 s CPU / 146 s pared** por 6 s de clip | **otro run**: el canary habilitado a mano el 2026-11-09 06:30, disparado 08:09:54 | `docs/manifestos/INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:147` (y `:35`) | **SOPORTADO como documento.** Aritmética coherente: `57/146 = 39,04 %` de CPU. **NO_COMPUTADO el fps**: ese artefacto **no declara frames**. Si se asume 30 frames daría 0,2055 fps — **hipótesis, no medición** |
| **3,37 fps** | el **bucle del 4K del JIT** en producción, contra 25 fps de fuente — **no es el canary** | `INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:66-67` | SOPORTADO como cita; **NO es una cifra de Canary** |
| **0,084 fps** | 4K con `nlmeans` **original** (cadena L1/L2 del LAB) | skill `ape-image-pipeline-truth` §9 (tabla de techo, host sin GPU) | Cifra de **otra cadena y otro host**. No comparable con 0,18 fps |
| **29,6 fps** | P1 4K/60 **corregida** (sin `nlmeans`), host sin GPU | skill `ape-image-pipeline-truth` §9 | Cifra de **otra cadena**. No comparable |
| **452,6 / 241,3 fps** | P4 720p/30 y P3 1080p/60 corregidas | skill `ape-image-pipeline-truth` §9 | Cifra de **otra cadena**. No comparable |

### 5.1 Contraste 0,18 fps contra el coste declarado — veredicto

- El **0,18 fps** del `README.md:6` **no está inventado**: sale de `FASE01_REPORT.md:59` y coincide con los PDF. **SOPORTADO.**
- El **57 s / 146 s** del incidente **no contradice** el 0,18 fps: mide **otra ejecución**, con el mismo `CPUQuota=40%` (39,04 % vs 39,09 % de CPU, coincidencia que refuerza que es el mismo tipo de trabajo). **No se puede derivar fps de ahí: ese artefacto no da frames.** `NO_COMPUTADO`.
- **Ninguna** de las cifras de la skill (`0,084` / `29,6` / `452,6` / `241,3` fps) es del Canary. Son del recetario LAB en otro host. Mezclarlas es el error de etiqueta que la skill §13 prohíbe.

**Consecuencia operativa:** el Canary cuesta ~2,4–2,8 minutos de pared para producir **6 s de clip a 5 fps**. En un VPS de 3 vCPU eso no es un medidor en línea: es un experimento por lotes. Cualquier diseño que lo invoque en el camino del zapping viola `REGLA_CANONICA_STREAMING_TIEMPO_REAL.md` (ver §7).

---

## 6. Item 5 — La afirmación del 403

Afirmación auditada — `README.md:35`:
> «El repositorio accesible a través de GitHub tiene permiso de lectura, pero el intento `create_branch` dio `403 Resource not accessible by integration`. El equipo remoto reportó estado Offline; no hay sesión SSH autenticada al VPS.»

### 6.1 Comandos y salidas (solo lectura, cero mutaciones, **sin push**)

```
$ git remote -v
origin  https://github.com/hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION.git (fetch)
origin  https://github.com/hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION.git (push)
EXITCODE=0

$ git branch --show-current ; git log -1 --format='%H %ci %s'
audit/rea-alignment-20261108
472f7cc330e52dc2f7e3d16f6a451fd0b461949e 2026-11-09 23:56:04 -0500 docs(inventario): comprobacion de regresion — nada se perdio en la pestaña

$ git ls-remote origin          # READ ONLY
d2c27293…  HEAD
472f7cc3…  refs/heads/audit/rea-alignment-20261108
272f417e…  refs/heads/feat/adb-generic-visual-enhancement-installer
89efc0a3…  refs/heads/feat/ara-x-canonical-integration
6cdd7767…  refs/heads/feat/virtual-4k-unlocked
d2c27293…  refs/heads/master
… refs/pull/1..21/head
EXITCODE=0

$ git config --get-all credential.helper ; git config --get user.name ; git config --get user.email
manager
HFRC
hfrc@iptv-navigator.dev

$ gh auth status
github.com
  ✓ Logged in to github.com account hefarica (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token scopes: 'admin:enterprise', 'admin:gpg_key', 'admin:org', 'admin:org_hook',
    'admin:public_key', 'admin:repo_hook', 'admin:ssh_signing_key', 'audit_log', 'codespace',
    'copilot', 'delete:packages', 'gist', 'notifications', 'project', 'repo', 'user',
    'workflow', 'write:discussion', 'write:network_configurations', 'write:packages'
EXITCODE=0

$ (anónimo, sin token) GET https://api.github.com/repos/hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION
HTTP 200
private=False  visibility=public  default_branch=master
```

### 6.2 Lectura correcta

| Pregunta | Respuesta medida | Veredicto |
|---|---|---|
| ¿El remoto existe y responde? | `git ls-remote origin` → exit 0, 6 ramas + 21 `refs/pull/*` | **SOPORTADO** |
| ¿`ls-remote` prueba que hay credenciales? | **No.** La API sin token devuelve `HTTP 200 / private=False / visibility=public` → el repo es **público**; `ls-remote` funciona en anónimo | **NO_SOPORTADO** leer el exit 0 como «hay credenciales válidas» |
| ¿De dónde sale el 403? | El texto del error, `403 Resource not accessible by integration`, es la firma de un **token de instalación de GitHub App / integración**, no de un PAT de usuario. El propio PDF (Manual p.3) añade «Desktop Commander indicó **dispositivo remoto desconectado**», es decir, el fallo es del **conector remoto**, no del remoto Git | **SOPORTADO que el 403 es de la integración remota** y no del clon local |
| ¿Este clon local podría empujar? | `credential.helper=manager`, `gh` autenticado como `hefarica` con scope `repo` + `workflow`. Hay **material** para autenticar. Pero no ejecuté ningún `git push` (prohibido por la tarea), así que **no hay medición** | **NO_COMPUTADO** — no probado por diseño |

**Veredicto del item:** el 403 **no** es una propiedad de este repositorio ni de este clon; es un fallo de **identidad de la integración remota** (`… by integration` + «dispositivo remoto desconectado»). `README.md:35` lo declara honestamente y **no** afirma estar bloqueado a nivel de repo. Lo que sí queda claro: **no se puede afirmar que el paquete esté en GitHub** — y de hecho `git ls-remote` no muestra ninguna rama `canary`/`jit` nueva: las 6 ramas del remoto son las preexistentes.

---

## 7. Item 6 — La ruta `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js`

| Afirmación auditada | Medición | Veredicto |
|---|---|---|
| `README.md:8` y `:19` citan `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` | El fichero **EXISTE**: **45.535 B**, **959 líneas**, `sha256=8405f78412dc2a984f690b7270e891d050740d88358f10ca5818f905151fbae0` | **SOPORTADO** — se cita un path real; el documento no miente aquí |
| Capitán: «según mi medición **NO existe**» | existe | **NO_SOPORTADO** |
| Capitán: «en `IPTV_v5.4_MAX_AGGRESSION\vps\ape-jit\` **solo hay units** (.service/.timer/.path)» | contiene 6 entradas: `ape-jit.service` (594 B), `ape-jit-reconcile.{service,timer,path}` (179/173/326 B), **`README.md` (14.938 B)**, **`reconcile.js` (11.132 B)**, **`server.js` (45.535 B)** | **NO_SOPORTADO** |
| Capitán: «el motor real está en `tools\lab\ape-jit\server.js` (447.943 B, **8695 líneas**)» | **447.943 B ✓** (SOPORTADO), **9212 líneas** (`LF=9212`, `CRLF=0`), `sha256=28352c508285b1eedfc889e5df40855e6e2c71207d7c806288ac8457de36ff67` | bytes **SOPORTADO**; líneas **NO_SOPORTADO** |
| `vps/ape-jit/server.js` (raíz del workspace) | **MISSING** | — |

### 7.1 Diagnóstico del error del capitán

Hay **tres** rutas con nombre parecido y el capitán midió la que no es:

| Ruta | Estado | Bytes | Líneas |
|---|---|---|---|
| `vps\ape-jit\server.js` | **no existe** | — | — |
| `IPTV_v5.4_MAX_AGGRESSION\vps\ape-jit\server.js` | **existe** | 45.535 | 959 |
| `tools\lab\ape-jit\server.js` | **existe** | 447.943 | 9212 |

### 7.2 Cuál es el motor que habla con el canary

El `/jit/signal` que el canary consulta **sólo existe en una** de las tres copias:

```
git grep -n "chain_4k_test"
tools/lab/ape-jit/server.js:8764:        chain_4k_test: cadenaDeRegla(regla, 3840, 2160, pqOk),
vps/bin/ape-visual-emulate.sh:88:if d.get("ok") and d.get("chain_4k_test"):
vps/bin/ape-visual-emulate.sh:89:    sys.stdout.write(d["chain_4k_test"])' ...

git grep -n "jit/signal"
tools/lab/ape-jit/server.js:7913,7930,7931,8603
vps/bin/ape-visual-emulate.sh:80,102
```

| Hecho | Artefacto | Veredicto |
|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION\vps\ape-jit\server.js` **no implementa** `/jit/signal` | 0 coincidencias de `jit/signal` y `chain_4k_test` en las 959 líneas | SOPORTADO |
| El motor con el bucle cerrado es `tools/lab/ape-jit/server.js` | `server.js:8603` (`if (u.pathname === '/jit/signal')`), `:8764` (`chain_4k_test`) | SOPORTADO |
| `manifests.tsv:59` mapea `tools/lab/ape-jit/server.js` → `/opt/ape-jit/server.js` | fila del manifiesto | SOPORTADO |
| El `/opt/ape-jit/server.js` desplegado el 2026-11-09 medía **415.037 B**, no 447.943 B | `INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:132` | **Divergencia declarada**: el artefacto del repo no es el que estaba desplegado. `NO_COMPUTADO` si el repo es posterior o distinto — el documento no da hash |

### 7.3 El `chain_4k_test` NO es la cadena de Canary — y no puede serlo

Lectura del generador de ese campo, `tools/lab/ape-jit/server.js:8649-8679` (`const cadenaDeRegla = (r, ancho, alto, conPq) => {…}`), que construye:

```
format=yuv420p10le
  [,atadenoise=0a=…:0b=…]  ó  [,hqdn3d=ls:cs:lt:ct]
  [,unsharp=m:m:amount:m:m:0]
,scale=w=OUTW:h=OUTH:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos
,pad=OUTW:OUTH:(ow-iw)/2:(oh-ih)/2
[,zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt2020:t=smpte2084:m=bt2020nc:r=limited,format=yuv420p10le]
    (o, sin camino a PQ: `format=yuv420p10le`)
```

Comparado con la cadena canónica (`quality-policy.json:7-14`):

| Etapa Canary | En el `chain_4k_test` del JIT | Diferencia medida |
|---|---|---|
| `deblock` | **ausente** | el JIT no hace deblock |
| `smartblur=lr=1.5:ls=-0.5` | **ausente** | el JIT no hace dering |
| `format=yuv444p` (4:4:4 8-bit) | `format=yuv420p10le` (4:2:0 10-bit) | **carril de croma distinto**: 4:4:4 vs 4:2:0 |
| `scale=3840:2160:flags=lanczos` | `scale=w=…:h=…:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos` + `pad` | el JIT preserva AR y rellena; Canary deforma (§2.6) |
| `noise=alls=8:allf=t` (**añade** grano) | `hqdn3d` / `atadenoise` (**quita** ruido) | **signo opuesto**: uno añade grano, el otro lo elimina |
| `unsharp=5:5:0.8:3:3:0.4` | `unsharp=m:m:a:m:m:0` | chroma msize/amount distintos (`0.4` vs `0`) |
| `eq=contrast=1.05:brightness=0.02:saturation=1.05` | **ausente** | el JIT no gradúa |
| `format=yuv420p` (8-bit) | `format=yuv420p10le` | 8-bit vs 10-bit |
| — | `zscale … t=smpte2084:p=bt2020` | el **JIT sintetiza PQ**; Canary no toca color |

Y —esto es lo que cierra el caso— **`cadenaDeRegla` sólo construye el filtro**: no emite `-preset`, `-tune` ni `-x265-params`. Por tanto:

> **`chain_4k_test` es un string de `-vf` y nada más. Cuando el canary corre en modo `JIT-REGLA`, su recibo puede acreditar los filtros, pero *no puede* acreditar el encoder. `policy.reference_encoder` queda fuera del alcance del endpoint por construcción.**

Además, las reglas del JIT no declaran un encoder ffmpeg: declaran `codec: 'hvc1'` (`server.js:633-645`, `RULES_SEED`) mientras `reference_encoder.video_codec` es `libx265` (`quality-policy.json:16`). El mapeo exacto `hvc1 → -c:v` vive en otra ruta (`server.js:4581`) y depende de `/opt/ape-jit/transform-rules.json` (`server.js:548`), que **no está en el repo**. **`NO_COMPUTADO`** cuál sería el encoder real de una respuesta — lo medirá la batería HTTP de `t2`.

---

## 8. Item 7 — Estado de ejecución del canary en el VPS (documental, NO medido en vivo)

**No tengo acceso al VPS. Nada de esta sección es una medición en vivo.** Es lo que los documentos del repo afirman, con su línea.

| Afirmación | Fuente exacta | Veredicto |
|---|---|---|
| `/var/lib/ara/canary/` **vacío** — «nunca ha corrido» | `docs/ops/CANARY_RESOLVE_ANALISIS_2026-11-04.md:73` | **SOPORTADO como documento** |
| `/etc/ara/canary/` **vacío** — sin `env.common` ni `<id>.env` | `docs/ops/CANARY_RESOLVE_ANALISIS_2026-11-04.md:74` | **SOPORTADO como documento** |
| `ape-canary@` **disabled**, sin instancia | `docs/ops/CANARY_RESOLVE_ANALISIS_2026-11-04.md:75` | **SOPORTADO como documento** |
| `/var/log/ara/` no existe | `docs/ops/CANARY_RESOLVE_ANALISIS_2026-11-04.md:76` | SOPORTADO como documento |
| «El canary es **inarrancable** tal como está» | `CANARY_RESOLVE_ANALISIS_2026-11-04.md:78` | SOPORTADO como documento |
| `/etc/ara/canary/` vacío ⇒ **no arrancó** (no «listo para arrancar») | `docs/policies/REGLA_CANONICA_STREAMING_TIEMPO_REAL.md:19` | SOPORTADO como documento |
| `/etc/ara/pulse/canary.enabled` **no existe** ⇒ canary deshabilitado por diseño | `docs/manifestos/VPS_SWEEP_2026-11-09.md:120` y `:215-218` | SOPORTADO como documento |
| Sin ese flag **ningún zap dispara el canary** | `VPS_SWEEP_2026-11-09.md:215-216` | SOPORTADO como documento |
| El canary **sí se disparó** una vez, el 2026-11-09, tras crear el flag a las 06:30 | `INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:34-35`, log `08:09:54Z … dispara canary` `:49-51` | SOPORTADO como documento |
| Ese flag fue **eliminado** en la reversión | `INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:130` (`/etc/ara/pulse/canary.enabled | eliminado`) | SOPORTADO como documento |
| El JIT quedó **parado** tras el incidente | `INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:133` (`ape-jit | **parado**`) | SOPORTADO como documento |

### 8.1 Cronología honesta

Los tres documentos son coherentes **si se ordenan**, pero dos de ellos son del **mismo día** (2026-11-09) y dicen cosas opuestas sobre el flag:

- `VPS_SWEEP_2026-11-09.md:120`: «`/etc/ara/pulse/canary.enabled` **no existe**».
- `INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:34`: «A las 06:30 **creé** `/etc/ara/pulse/canary.enabled`» … `:130`: «**eliminado**».

**El orden relativo de ambos documentos no es derivable de su contenido.** Lo único afirmable: el flag **fue creado y luego eliminado** el 2026-11-09; el estado «no existe» es el que el sweep observó y el que la reversión produjo. **`NO_COMPUTADO` el estado del flag hoy**: no lo medí y el sweep no puede fecharse respecto del incidente con la evidencia disponible.

### 8.2 Lo que NO puedo afirmar

- Ni que el canary esté apagado ahora, ni que esté encendido. `NO_COMPUTADO`: no hay medición en vivo en esta auditoría.
- Ni que el script en `/usr/local/bin/ape-visual-emulate.sh` sea hoy el de 4068 B. `NO_COMPUTADO`: el dato de 4068 B es del **backup del 2026-11-09 06:42** (`INCIDENTE:128`), no de una lectura actual.
- Ni que `/opt/ape-jit/server.js` sea hoy el de 415.037 B. `NO_COMPUTADO`, misma razón.

---

## 9. Correcciones a las mediciones del capitán

Se auditaron los 4 hechos que el capitán pidió verificar. **3 de 4 tienen al menos un número mal.** Se corrigen con su artefacto.

| Hecho declarado por el capitán | Medición | Veredicto |
|---|---|---|
| `vps\bin\ape-visual-emulate.sh` \| **6714 B** \| **135 líneas** | 6714 B ✓ · **144 líneas** (`LF=144`, `CRLF=0`, termina en LF) · `sha256=f1d2ecff…` | bytes SOPORTADO / líneas **NO_SOPORTADO** |
| `grep 'smartblur'` → `DERING="smartblur=lr=1.5:ls=-0.5"` **(línea 100)** | `vps/bin/ape-visual-emulate.sh:100` (exacto) | **SOPORTADO** |
| `printf` con `filters=deblock,dering(smartblur),…` **(línea 129)** | `vps/bin/ape-visual-emulate.sh:129` (exacto) | **SOPORTADO** |
| `_vps_stage\canary\ape-canaryctl` \| **4787 B** \| **121 líneas** | 4787 B ✓ · **133 líneas** (`LF=133`, `CRLF=0`) · `sha256=7f9745d4…` | bytes SOPORTADO / líneas **NO_SOPORTADO** |
| `_vps_stage\canary\` tiene `ape-canary@.service`, `ara-skill`, `env.template`, `FASE01_REPORT.md` | además: `ape-canaryctl`, **`ape-visual-emulate.sh` (4068 B)**, **`install.sh` (2547 B)** — 7 ficheros, 0 subdirectorios | SOPORTADO pero **incompleto**: omite el script que es el objeto de la auditoría |
| ZIP **9155 B** `9a13ec2c…fe1` | ✓ | **SOPORTADO** |
| Manual PDF **153775 B** `7149a439…` | ✓ | **SOPORTADO** |
| Arquitectura PDF **165330 B** `e0539e50…` | ✓ | **SOPORTADO** |
| APK **24362980 B** `4b0c4ef3…` | ✓ | **SOPORTADO** |
| El ZIP trae `docs/` **VACÍA (0 entradas)** | 11 entradas totales; `.../docs/` con `Length=0` y 0 hijas | **SOPORTADO** |
| «**5 tests**» | `ℹ tests 5`, `pass 5`, `fail 0` | **SOPORTADO** |
| `canary-render.js:19` fuerza `-r 5` y `-an` | `'-t','6','-r','5','-an','-vf',policy.filtergraph` | **SOPORTADO** |
| `canary-render.js:22` usa **solo** `-f hls` (cero DASH) | `'-f','hls','-hls_time','3','-hls_list_size','20','-hls_flags',…`; `grep -i dash\|mpd` → **0 hits** en el fichero | **SOPORTADO** |
| `tools\lab\ape-jit\server.js` **447943 B** / **8695 líneas** | 447943 B ✓ · **9212 líneas** | bytes SOPORTADO / líneas **NO_SOPORTADO** |
| `IPTV_v5.4_MAX_AGGRESSION\vps\ape-jit\server.js` **NO existe** | **EXISTE**: 45.535 B / 959 líneas / `sha256=8405f784…` | **NO_SOPORTADO** |
| En `vps\ape-jit\` «solo hay units» | `IPTV_v5.4_MAX_AGGRESSION\vps\ape-jit\`: 3 units + `README.md` + `reconcile.js` + **`server.js`**. Y `vps\ape-jit\` (raíz) **no existe** | **NO_SOPORTADO** |

---

## 10. Tabla maestra de veredictos

| # | Afirmación | Artefacto (ruta:línea o comando) | Veredicto |
|---|---|---|---|
| A1 | El string de 8 filtros es idéntico en policy, validador, los 2 scripts y el test | comparación de 185 chars, sha16 `ed1fe6fe00be413f`; `quality-policy.json:7-14`; `canary_quality.js:8-11`; `ape-visual-emulate.sh:52` (80-l) y `:101` (144-l); `test.js:10` | **SOPORTADO** |
| A2 | `canary_fidelity: FILTERGRAPH_IDENTICAL` es una medida | `canary_quality.js:45` → **literal hardcodeado**, no derivado | **NO_SOPORTADO** (es una etiqueta) |
| A3 | El script desplegado ejecuta la cadena canónica | `manifest.tsv:39` → `_vps_stage/canary/ape-visual-emulate.sh` (4068 B, 80 l) → `:52` cadena canónica | **SOPORTADO** |
| A4 | El script con bucle Canary↔JIT es el desplegado | `manifest.tsv` → **0 filas** para `vps/bin/ape-visual-emulate.sh` | **NO_SOPORTADO** (está huérfano del deploy) |
| A5 | El encoder del contrato es el encoder real | contrato `quality-policy.json:16` vs real `ape-visual-emulate.sh:60-62` (5 params x265 + `-b:v/-maxrate/-bufsize` + `-g 48`) | **NO_SOPORTADO** (contrato parcial: 4 de 9+ campos) |
| A6 | `canary-render.js` reproduce «parity with isolated Canary experiment» | `canary-render.js:25` vs `:21` (`-g 5` vs real `-g 48`) y ausencia de `-b:v` | **NO_SOPORTADO** |
| A7 | `scale=3840:2160` deforma fuentes no-16:9 | corrida ffmpeg: `3840x2160 [SAR 27:20 DAR 12:5]` desde 1920×800; `quality-policy.json:18` | **SOPORTADO** |
| A8 | La cadena del JIT maneja el AR mejor que la de Canary | `server.js:8668-8670` (decrease+pad) vs corrida A; corrida B da `SAR 1:1 DAR 16:9` | **SOPORTADO** |
| A9 | `dering` no existe en ffmpeg (versión local 8.0.1) | `ffmpeg -h filter=dering` → `Unknown filter 'dering'.`; `-filters` 576 líneas → 0 hits | **SOPORTADO** (para 8.0.1) |
| A10 | `dering` no existe en **ffmpeg 6.1 Ubuntu** | no tengo ese binario | **NO_COMPUTADO** |
| A11 | Hay 5 pruebas | `node --test` → `ℹ tests 5 / pass 5 / fail 0`; `^test\(` → 5 | **SOPORTADO** |
| A12 | Las 5 pruebas acreditan paridad visual | los 5 asserts son sobre literales y condicionales (`canary_quality.js:45,47,37`) | **NO_SOPORTADO** |
| A13 | «9/9 correctas» | 0 hits de `9/9` en ZIP y en ambos PDF; runner dice 5 | **NO_SOPORTADO** |
| A14 | «PRUEBA SINTÉTICA 25 fps HEVC + AAC» del Canary | `canary-render.js:19` (`-r 5 -an`); PDF p.1 «5 fps … desactiva audio»; «25 fps» 0 hits en PDF/ZIP | **NO_SOPORTADO** |
| A15 | «EMPAQUETADO HLS + DASH» del Canary | `canary-render.js:22` (`-f hls` solo); 0 hits `DASH/mpd` en el fichero y en el ZIP | **NO_SOPORTADO** |
| A16 | 0,18 fps es el rendimiento del Canary | `FASE01_REPORT.md:59` (30 f / 164,1 s = 0,1828); PDF p.1 «~0,18 fps» | **SOPORTADO** |
| A17 | 57 s CPU / 146 s pared son del mismo run que el 0,18 fps | `INCIDENTE:147` no declara frames; CPU 39,04 % vs 39,09 % de FASE01 → runs distintos y coherentes entre sí | **NO_SOPORTADO** como misma medición |
| A18 | 3,37 fps es el canary | `INCIDENTE:66-67` → es el **bucle del JIT 4K**, no el canary | **NO_SOPORTADO** (error de etiqueta) |
| A19 | 0,084 / 29,6 fps son del canary | skill `ape-image-pipeline-truth` §9 → cadenas LAB, host sin GPU | **NO_SOPORTADO** (otra cadena, otro host) |
| A20 | El 403 es de la integración remota | `README.md:35` «…by integration»; Manual p.3 «Desktop Commander … remoto desconectado»; `ls-remote` exit 0; API anónima `HTTP 200 private=False` | **SOPORTADO** |
| A21 | El repo estaba «bloqueado» a nivel de GitHub | repo `public`; `ls-remote` lista 6 ramas + 21 PRs | **NO_SOPORTADO** |
| A22 | Este clon podría empujar | `credential.helper=manager`; `gh` como `hefarica` con scope `repo`; **no se probó push** | **NO_COMPUTADO** (no probado por diseño) |
| A23 | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` existe | 45.535 B / 959 l / `sha256=8405f784…` | **SOPORTADO** |
| A24 | Ese fichero es el motor que responde a `/jit/signal` | 0 hits de `jit/signal` y `chain_4k_test` en sus 959 líneas; sólo `tools/lab/ape-jit/server.js:8603,8764` | **NO_SOPORTADO** |
| A25 | `chain_4k_test` puede acreditar el encoder | `server.js:8649-8679` construye **sólo** el `-vf`; no emite `-preset/-tune/-x265-params` | **NO_SOPORTADO** por construcción |
| A26 | El desplegado `/opt/ape-jit/server.js` es el del repo (447.943 B) | `INCIDENTE:132` → 415.037 B | **NO_COMPUTADO** si es versión distinta (sin hash en el documento) |
| A27 | `/var/lib/ara/canary/` y `/etc/ara/canary/` vacíos; `ape-canary@` disabled | `CANARY_RESOLVE_ANALISIS_2026-11-04.md:73-75` | **SOPORTADO como documento** |
| A28 | `/etc/ara/pulse/canary.enabled` no existe | `VPS_SWEEP_2026-11-09.md:120`, `:215-218` | **SOPORTADO como documento** |
| A29 | El flag fue creado y luego eliminado el 2026-11-09 | `INCIDENTE:34` (creado 06:30) y `:130` (eliminado) | **SOPORTADO como documento** |
| A30 | Estado actual del canary y del JIT en el VPS | sin acceso al VPS | **NO_COMPUTADO** |
| A31 | La APK es entregable de Canary/JIT | 422 entradas descomprimidas: 0 hits de `ape-jit`, `/jit/signal`, `chain_4k_test` | **NO_SOPORTADO** |
| A32 | La APK es `com.ape.crystalagent` | string pool de `AndroidManifest.xml` (23 ocurrencias) | **SOPORTADO** |
| A33 | El ZIP trae `docs/` vacía | 11 entradas; `docs/` `Length=0`, 0 hijas | **SOPORTADO** |

---

## 11. Lo `NO_COMPUTADO` y por qué

| Hueco | Razón exacta |
|---|---|
| fichero del `9/9` | no está en el ZIP ni en los 2 PDF (`grep` → 0 hits). No tengo el mensaje original del operador como artefacto |
| fps del run del incidente (57 s / 146 s) | el documento no declara frames ni duración encodada; sólo «6 s de clip» de entrada |
| encoder real que devolvería el JIT | depende de `/opt/ape-jit/transform-rules.json` (`server.js:548`), **ausente del repo**; se usa `RULES_SEED` (`:631`) sólo si el fichero no existe |
| si `/opt/ape-jit/server.js` desplegado == el del repo | el documento da 415.037 B y el repo 447.943 B, pero **no hay hash** en ninguna parte |
| `dering` en ffmpeg **6.1 Ubuntu** | no tengo ese binario; medí 8.0.1-full_build (Windows) |
| capacidad de push de este clon | prohibido por la tarea. Hay material de credencial (`manager` + `gh` con scope `repo`) pero **no medición** |
| estado **hoy** del canary / flag / JIT en el VPS | no hay acceso al VPS en esta auditoría; sólo documentos fechados 2026-11-04 y 2026-11-09 |
| salida HLS real del canary | no ejecuté `canary-render.js --run` (escribiría fuera del entregable) ni tengo el `status.json` de `/var/lib/ara/canary/` |
| VMAF/SSIM entre cadena Canary y cadena JIT | nadie los ha medido: no hay vídeo de referencia ni corrida pareada en ningún artefacto |

---

## 12. Consecuencias para el contrato fail-closed (`requested/applied/output`)

Lo medido aquí fija cinco condiciones que el contrato de integración **debe** respetar, o nace falso:

1. **`requested` no puede ser la cadena de `quality-policy.json` sola.** El contrato debe incluir `-x265-params` completos, `-b:v/-maxrate/-bufsize` y `-g/-keyint_min` (§2.3 D6–D8). Sin ellos, dos ejecuciones «idénticas» dan imágenes distintas y el recibo no lo detecta.
2. **`applied` no puede heredarse de `canary_fidelity`.** Ese campo es un literal (`canary_quality.js:45`). `applied` sólo es legítimo con `status.json` de `/var/lib/ara/canary/<id>/` en mano — el fichero que, según `REGLA_CANONICA_STREAMING_TIEMPO_REAL.md:11`, **nunca se escribió en el VPS**.
3. **`output` no puede acreditar el encoder cuando el canary corre en modo `JIT-REGLA`.** `chain_4k_test` es un `-vf` y sólo un `-vf` (`server.js:8649-8679`). El recibo en ese modo debe declarar `encoder: NOT_ASSERTED_BY_JIT` — o el contrato miente por construcción.
4. **`output` debe declarar el SAR.** Toda salida del Canary con fuente no-16:9 sale con SAR ≠ 1:1 (§2.6). Un recibo que diga `3840x2160` sin `SAR` está incompleto: no distingue una imagen correcta de una deformada 1,35×.
5. **El gate de despliegue debe empezar por `manifest.tsv`.** El artefacto que implementa el bucle Canary↔JIT (`vps/bin/ape-visual-emulate.sh`, 6714 B) **no está en el manifiesto** (§2.1). Integrar sin añadir esa fila produce un «integrado» que no corre — exactamente el modo de fallo que `INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:139-142` documenta («un `scp` porque el pipeline no lo conoce es la señal de que falta una fila»).

---

## 13. Veredicto de la auditoría

**Canary, medido, es esto:** un experimento aislado de 80 líneas (`_vps_stage/canary/ape-visual-emulate.sh`, 4068 B) que toma **un** canal, muestrea **6 s a 5 fps sin audio**, aplica **8 filtros espaciales** en orden fijo, codifica a **libx265 ultrafast/zerolatency** con rate control fijo y GOP 48, y verifica que el `.ts` sale a `3840x2160` o falla con exit code. Cuesta **164,1 s para 30 frames (0,18 fps)** a **39,09 %** de una CPU con techo del 40 %. **Nunca produjo un `status.json` en el VPS** según `CANARY_RESOLVE_ANALISIS_2026-11-04.md:73`.

**Lo que se declaró y no es cierto:** «9/9 correctas» (son 5 pruebas que no tocan un frame), «25 fps HEVC + AAC» (es 5 fps y `-an`), «HLS + DASH» (cero DASH). Las tres son **propiedades del JIT atribuidas al Canary**, y los propios PDF que acompañan al resumen lo dicen correctamente en su tabla de la página 1.

**Lo que se declaró y sí es cierto:** los SHA de los 4 entregables, el string de la cadena (idéntico en 5 sitios), el `dering`→`smartblur` con su razón declarada, el 0,18 fps con su aritmética, que el `scale` deforma el AR, y que el 403 es de la integración remota y no del repo.

**El hallazgo que manda sobre la integración:** la autoridad de receta (`quality-policy.json`) **no puede expresar el encoder que realmente corre** (§2.3 D6–D8), y **la cadena que el consumidor JIT devolvería no comparte ni una etapa semántica** con la canónica — una añade grano, la otra lo quita; una deforma el AR, la otra lo preserva y rellena (§7.3). Mientras eso siga así, `canary_fidelity: FILTERGRAPH_IDENTICAL` es una etiqueta que se escribe sola.
