# 99 · AUDITORÍA ADVERSARIAL DEL DOCUMENTO

**Fecha:** 2026-11-15 · **Rol:** abogado del diablo · **Alcance:** `docs/sistema/00_INDICE.md` y los cinco documentos de parte (`01_IPTV_NAVIGATOR`, `02_APK`, `03_OTTSHIM_Y_PULSE`, `04_VPS`, `05_LISTAS`).
**Regla:** ningún hallazgo sin comando o `archivo:línea`. Si un ataque no se sostiene, se dice. **No se modificó ningún documento**; este fichero es el único que se escribe.

> **Nota de alcance medida:** `docs/sistema/` tenía **16 ficheros** antes de este informe (`Get-ChildItem docs\sistema -File` → `COUNT=16`). El encargo habla de «6 documentos»: son el índice + 5 partes. Los otros 10 son material previo (y colisionan en numeración, ver F-03).

---

## 0 · VEREDICTO

**El corpus aguanta.** De **33 comprobaciones** (26 citas/cifras verificadas contra su artefacto + 7 hallazgos), **26 pasan exactas** y **7 no**. Los 7 defectos son: 1 cita de línea falsa (F-01), 3 números mal contados o ya obsoletos (F-02, F-03, F-04), 1 estado vendido como actual (F-05), 1 «consumida» sin código (F-06), 1 cifra sin artefacto crudo (F-07), más 1 hueco de alcance (F-08). Ninguna de las tres contradicciones que el encargo daba por candidatas existe: las tres se resuelven con el artefacto en la mano.

| Clase | Confirmados | Se cayeron (ataque no sostenido) |
|---|---|---|
| 1 · Cita falsa | **1** (F-01) | 19 citas de código verificadas, todas correctas |
| 2 · Número sin fuente / mal contado | **3** (F-02, F-03, F-04) | — |
| 3 · Absoluto sospechoso | **0** | «2160 en el 0 %» es **cierto** para su muestra |
| 4 · Etiqueta mal leída | **1** (F-05); F-06 se cuenta en la fila 6 y aquí se referencia | — |
| 5 · Contradicción entre documentos | **0** | las 3 candidatas (listas / loadMap / tflite) **no son contradicción** |
| 6 · Aspiracional vendido como real | **1** (F-06) + **1** fuente débil (F-07) | TFLite, 6K, RESOLUTION, AI-PQ y `levers_now` **están bien marcados** |
| 7 · Lo que falta | **1** (F-08) | — |

**Veredicto por documento:** `00_INDICE` (2 defectos: F-03, F-04, más repetir F-05), `02_VPP_TRES_CAPAS` (F-01, F-05, F-06, F-07), `05_LISTAS` (F-02, F-04). `01_IPTV_NAVIGATOR`, `02_APK` y `03_OTTSHIM_Y_PULSE` **no tienen ningún hallazgo abierto** en esta pasada.

---

## 1 · CITAS FALSAS

### F-01 · `02_VPP_TRES_CAPAS.md:16` cita la línea equivocada · severidad **MEDIA**

> `02_VPP_TRES_CAPAS.md:16` — «**Evidencia:** `…/ape-feedforward-stream.php:95` — `getenv('APE_4K_BRIDGE_ENABLED') === '1'`»

La línea 95 **no** es eso:

```text
$ (Get-Content ape-feedforward-stream.php)[94]
if ($vstNow > 8000 || $qsNow <= 8) { ape_pq_record_incident($chId, (int)$vstNow); }

$ Select-String -Path ape-feedforward-stream.php -Pattern 'APE_4K_BRIDGE_ENABLED'
L100: // que el APK aplique los 13 levers VPP (hoy 2). Flag-gated (APE_4K_BRIDGE_ENABLED=1; default OFF =
L103: if (isset($device) && $device !== '' && getenv('APE_4K_BRIDGE_ENABLED') === '1'
```

**La afirmación es cierta; la línea está mal.** La correcta es **`:103`** (y el comentario en `:100`). Fichero: 157 líneas.
**Fix:** cambiar `:95` por `:103` en `02_VPP_TRES_CAPAS.md:16`.

### Citas que verifiqué y **pasan** (para que no se vuelvan a auditar)

| Cita | Contenido real | Veredicto |
|---|---|---|
| `ScreenCaptureService.kt:93` | `if (gapMs > 1_500L) {` | ✅ |
| `AgentService.kt:327` y `:360` | `"/prisma/api/ape-last-channel.php"` | ✅ |
| `FeedForwardClient.kt:53` | `…ape-feedforward-stream.php?device=${enc(cfg.deviceId)}&iv=3&dur=110` | ✅ |
| `QoEReporter.kt:187` | `.url("…/prisma/api/conviva-event.php")` | ✅ |
| `StatePublisher.kt:41` | `.put("levers", JSONObject())` | ✅ |
| `generation-output-panel.js:913-915` | «el NUMERO de canales es el RESULTADO DEL FILTRO, no un invariante» | ✅ |
| `generation-output-panel.js:924-928` | `LIGHT_CONTRACT = { canalesMin: 1, plantillas: 9, apeEnCuerpo: 0 }` | ✅ |
| `ape-pulse-wrap.js:356` | `const dd = { t: 'generic', s: 'unknown', r: 2048 };` | ✅ |
| `ape-pulse-wrap.js:440/456-457/470/510` | `curHasDecl=false` · reset que no lo contempla · `if (…ENHANCE-STATE) { curHasDecl = true; …}` · `if (!curHasDecl) { for (…OWNER_DECLARATIONS…) write(…); counters.declared++ }` | ✅ **el flag pegajoso existe tal como se describe** |
| `pulse.php:142-143` y `:549-550` | `CURLOPT_SSL_VERIFYPEER => false` / `VERIFYHOST => 0` | ✅ |
| `pulse.php` 786 líneas | `(Get-Content pulse.php).Count` = **786** | ✅ |
| `pulse.php:232-241` | array `$device` con soc/max_h/max_w/fps/hdr/profile/buffer_ms/player — **no lee `r`** | ✅ |
| `server.js:504` | `reads: ['EXTVLCOPT http-user-agent/http-referrer', 'KODIPROP', 'EXTATTRFROMURL']` | ✅ (y por eso I-1 está bien puesto) |
| `SettingsCatalog.kt` «2 de 13» | de las 13 claves, `match_content_frame_rate=1` y `minimal_post_processing_allowed=1`; **las 11 `pq_*`/`ai_*` = 0** | ✅ |
| `.tflite` «1.484–1.676 B» | `rife_blend_f32.tflite 1484` · `sr_unsharp_f32 1580` · `car_denoise_f32 1676` | ✅ |
| `04_VPS:330` D-1 «`38c92b56…` con `_mapCache` ×6» | `sha256sum /opt/ape-jit/server.js` = `38c92b56e4ab476b…` y `grep -c _mapCache` = **6** | ✅ |
| `04_VPS:332` D-3 «stub de 8 B» | `-rw-r--r-- 8 Nov 8 01:48 /var/www/html/lists/APE_LISTA_1794100720046.m3u8` | ✅ |

---

## 2 · NÚMEROS SIN FUENTE O MAL CONTADOS

### F-02 · El byte-count de la LIGHT ya no coincide, y la columna no lleva fecha · severidad **MEDIA**

`05_LISTAS.md:20` da, en una columna rotulada **`Bytes [VPS]`**:

| Fila | Citado | Medido hoy | Δ |
|---|---:|---:|---:|
| #1 `…_CABLEADA_LIGHT.m3u8` | **250.932.745** | **261.350.350** | **+10.417.605 (+4,15 %)** |
| #2 `…_CABLEADA.m3u8` | 1.298.222.092 | 1.298.222.092 | 0 ✅ |

```text
$ stat -c "%n %s %y" …_CABLEADA_LIGHT.m3u8
…_CABLEADA_LIGHT.m3u8 261350350 2026-11-15 15:43:32 +0000
```

El fichero se **regeneró a las 15:43:32**, después de la ventana de medición (15:37-15:40 declarada en `04_VPS`). No es un número inventado: es un número **sin sello temporal**, y en la misma fila `mtime` figura como `NO_COMPUTADO`. Una columna `[VPS]` sin `mtime` no es auditable: el propio documento lo demuestra al quedar obsoleta en minutos.
**Fix:** añadir la columna de `mtime` (o el `stat` completo) o rotular la cifra como «instantánea de HH:MM:SSZ».

### F-03 · «15 ficheros» cuando hay 16 · severidad **BAJA**

`00_INDICE.md:270` — «`ls -la docs/sistema/` devuelve **15 ficheros**» — y `:57` — «la existencia de los **15** ficheros de `docs/sistema/`».

```text
$ (Get-ChildItem docs\sistema -File).Count
16
```

Y la propia tabla del índice suma **16**: 6 de la serie (índice + 5 partes) + 10 del bloque «los otros 10 ficheros» (`:293-304`). El número contradice a su propia tabla, no a un tercero.
**Fix:** 15 → 16 en `:57` y `:270` (y, si se cuenta este `99_`, 17).

### F-04 · «Las 14 listas servidas» cuenta filas, no listas · severidad **MEDIA**

`05_LISTAS.md:10` — «## 1 · Las 14 listas servidas». Lo que hay en la tabla (14 filas) no son 14 listas:

- Fila **13** (`:32`) es literalmente *«(sin nombre propio) → ver #14»*: **un puntero a otra fila**.
- Fila **14** (`:33`) es `ape_jit_latest.m3u8`, **un symlink de 57 B** (clase «SYMLINK»).
- Fila **12** (`:31`) agrupa un glob: `APE_PRUEBA_PERFILES.m3u8 · APE_PRUEBA_ORDER_OK*.m3u8`.
- Y el propio documento declara (`:37`): «El número real de ficheros del directorio **`NO_COMPUTADO`** hasta correr el script; si `APE_PRUEBA_ORDER_OK*.m3u8` son 2 ficheros, hay 15 nombres».

Medido: **18 ficheros `.m3u8`** en `/var/www/lists` (`find /var/www/lists -maxdepth 1 -type f -name '*.m3u8' | wc -l` → `18`). Es decir: 11 ficheros con nombre + 1 glob + 1 puntero + 1 symlink = «14», cuando el directorio tiene 18.
**Fix:** titular la sección «Las 11 listas con nombre propio (14 filas, 2 de ellas no son listas)» y cerrar el `NO_COMPUTADO` con el script que el propio documento cita.

---

## 3 · ABSOLUTOS SOSPECHOSOS — **el ataque no se sostiene**

El candidato más claro era `05_LISTAS.md:362`: «las fuentes medidas llegan a 1080 en el **52,6 %** de la muestra (20/38) y a **2160 en el 0 %**». Verificado contra el dato crudo:

```text
$ grep -o "h.: [0-9]*" /var/lib/ape/t75_measure.jsonl | sort | uniq -c
     20 h": 1080
      1 h": 404
      1 h": 540
      7 h": 576
      9 h": 720
```

38 medidas, **cero** a 2160, veinte a 1080 → **20/38 = 52,6 %** y **0 %**. **La cifra es exacta y el absoluto está cerrado por su artefacto.**

> Matiz que sí conviene escribir en el documento: el **otro** artefacto del mismo corpus (`/var/lib/ape/probe-deep.json`, 31 medidas) **sí** tiene 2160 (3 canales: 1382292, 1223471, 1168693). No es contradicción —son muestras distintas— pero un lector que compare ambos ficheros verá «0 %» junto a tres canales 4K. Merece una línea que lo diga.

---

## 4 · ETIQUETAS MAL LEÍDAS

### F-05 · «Overlay **CERRADO**» se apoya en un campo que no es el que gobierna el overlay, y ya está obsoleto · severidad **ALTA**

`02_VPP_TRES_CAPAS.md:130` — «Overlay (procesar el frame de OTT) | **CERRADO** | `SYSTEM_ALERT_WINDOW = granted FALSE`» — y `00_INDICE.md:159` lo repite como fila **CERRADA** del estado actual.

Medido hoy en el device:

```text
$ adb -s 192.168.1.3:5555 shell "appops get com.ape.crystalagent SYSTEM_ALERT_WINDOW"
SYSTEM_ALERT_WINDOW: allow; time=+3m2s214ms ago; rejectTime=+6d9h44m8s970ms ago (running)

$ adb … shell "settings get secure enabled_accessibility_services"
com.ape.crystalagent/com.ape.crystalagent.AraAccessibilityService
```

Dos cosas:
1. **`SYSTEM_ALERT_WINDOW` como permiso es `signature|appop`**: quien decide si se puede dibujar encima es el **appop**, y está en **`allow`**. El `granted=false` es el campo de *permiso*, no el gate. Es exactamente el error que el propio corpus denuncia en C-1: leer una etiqueta como si fuera otra cosa.
2. **El servicio de accesibilidad está habilitado**, que es la precondición de un `TYPE_ACCESSIBILITY_OVERLAY`.

El dato del documento era cierto el 2026-11-13 (`rejectTime` marca que estuvo denegado 6 días); **hoy no lo es**, y el índice lo publica como estado. No digo que el overlay funcione —dije en t51 que no hay una línea de producto que lo use—; digo que **la vía no está cerrada por el permiso**, y el corpus la cierra por ahí.
**Fix:** en `02_VPP_TRES_CAPAS.md:130` y `00_INDICE.md:159`, cambiar «CERRADO por `SYSTEM_ALERT_WINDOW`» por «sin implementación: 0 `TYPE_ACCESSIBILITY_OVERLAY` en el árbol (t51); el appop de overlay está en `allow` desde 2026-11-14 y `AraAccessibilityService` está habilitada».

### F-06 · «palanca **real, presente y consumida**» sin una línea de código que la consuma · severidad **MEDIA**

`02_VPP_TRES_CAPAS.md:107` — «**`minVideoFramesForPlaybackStart = 11`** es una palanca **real, presente y consumida** de arranque de reproducción. Eso sí toca lo que el operador llama «arranque lo más rápido posible».»

```text
$ grep -rn minVideoFramesForPlaybackStart  (repo)
docs/…/VPP_SOC_QUALITY_20261114.md:96      ← nota
IPTV_v5.4_MAX_AGGRESSION/backend/onn_settings_global_pq.txt:45  ← volcado
```

**Cero referencias en código.** El valor existe dentro del blob `nrdp_platform_capabilities`, no como clave de Settings (`settings get global minVideoFramesForPlaybackStart` → `null`). «Presente» sí; «consumida», no. Es el patrón del apartado 6 del encargo: una pieza declarada vendida como aplicada.
**Fix:** «palanca **presente en el volcado**, sin lector conocido en este árbol», y quitar la promesa de «arranque lo más rápido».

### F-07 · El `1.694.782 B` de «ROTO, medido» no tiene artefacto crudo en el corpus · severidad **BAJA**

`02_VPP_TRES_CAPAS.md:131` da «`effects=on` → 16.280 B de PNG (negro) vs **1.694.782 B** con `off`». El número existe en el corpus, pero **solo en comentarios y notas**:

```text
IPTV_v5.4_MAX_AGGRESSION/…/PlayerActivity.kt:36   *   effects=off -> 1.694.782 B      = video real
docs/sistema/capabilities_ONN4K.json:779          "nota": "effects=on dio 16.280 B … vs 1.694.782 B con off"
tools/probe/probe_capabilities.ps1:197            nota = '…16.280 B… vs 1.694.782 B con off…'
```

No hay ni un `ls` del PNG ni el PNG. La afirmación es plausible y consistente entre tres fuentes, pero **no es reproducible con lo que hay en el repo**. Mismo tratamiento que el corpus da a `probe-deep.json` («vive en el VPS»): decirlo.
**Fix:** añadir el `ls -l` de los dos PNG (o el `sha256`) junto a la cifra.

---

## 5 · CONTRADICCIONES ENTRE DOCUMENTOS — **las tres candidatas se caen**

| Candidata del encargo | Qué encontré | Veredicto |
|---|---|---|
| **Listas: 13 vs 14** | Solo hay un número en el corpus: «14» (`05_LISTAS:10`). No hay un «13» que lo contradiga. El problema es otro (F-04): 14 es un conteo de filas, no de ficheros | **NO es contradicción**; sí F-04 |
| **`loadMap`: 3 / 6 / 9 / 10** | El corpus dice **«diez»** sitios de invocación (`04_VPS:184-185`) y **«`_mapCache` ×6»** (`04_VPS:203`, `00_INDICE:150`). Son **dos objetos distintos**, y ambos están etiquetados con el comando al lado. El «3» es de `t74` (fuera de este corpus) y `t77` ya lo corrigió | **NO es contradicción** ✅ |
| **Tamaño de los `.tflite`** | Un solo juego de cifras: 1.484 / 1.580 / 1.676 B, y coinciden con el `ls` | **NO es contradicción** ✅ |

Y las dos contradicciones que el propio índice declara (§7) **son reales y están bien resueltas**: C-1 (VPP: «no existe» vs «nunca se envió») se decide con el sondeo directo, y C-2 (8 B vs 1,3 GB) es el mismo nombre para dos ficheros distintos — lo verifiqué: `…_CABLEADA.m3u8` = 1.298.222.092 B y el stub de `/lists/` = 8 B.

---

## 6 · ASPIRACIONAL VENDIDO COMO REAL — **el corpus lo marca bien, con una excepción**

Aquí esperaba el alud y encontré disciplina. Las cinco piezas que el encargo daba por «vendidas como reales» están **marcadas como lo que son**:

| Pieza | Cómo la presenta el corpus | ¿Vendida como real? |
|---|---|---|
| Los tres `.tflite` | `00_INDICE:151` → **«❌ DESCARTADA»**: «1.484–1.676 B con magic TFL3 válido, pero **no es un modelo**» | **No** ✅ |
| AI-PQ por Settings | `00:152` → **«❌ DESCARTADA en este SoC»**, con 11/13 claves ausentes y medición (`settings get` → `null`, verificado hoy) | **No** ✅ |
| 6K | `00:154` → **«⚠️ ASPIRACIONAL: presentación, no decodificación»**, y cita el propio tag `EVIDENCE=host_profile_estimate` | **No** ✅ |
| `RESOLUTION` declarado vs real | `00:155` → **«❌ DESCARTADA como igualdad»** | **No** ✅ |
| `levers_now` | `02_APK:140,145,260` → **«publica un JSONObject VACÍO»** y lo llama «el hallazgo que bloquea todo lo demás» | **No** ✅ |

La única excepción es **F-06** (`minVideoFramesForPlaybackStart` «consumida»). Un dato a favor del corpus: `00_INDICE:314-321` fija la regla «un número sin comando no es un número» y «declarado no es aplicado», y luego la cumple en 20 de 26 comprobaciones.

---

## 7 · LO QUE FALTA

### F-08 · El «etc etc» del operador · severidad **BAJA-MEDIA**

El encargo del operador pedía APK, OTTSHIM, VPS, IPTV NAVIGATOR, LISTAS **«etc etc»**. Lo entregado cubre esas cinco partes. Queda fuera:

| Hueco | Estado en el corpus | Por qué importa |
|---|---|---|
| **El operador LLM** (parte 6) | Declarado hueco (`00_INDICE:50,64-65,222`) y descrito por partes en `02_APK` §6 y `01_IPTV_NAVIGATOR` §6 | Es el único punto de aprendizaje del bucle (salto 10→12) y no tiene documento propio |
| **Los contratos** (parte 7) | Repartidos (`00_INDICE:51`) | No hay un documento que liste qué contrato es vinculante y cuál aspiracional |
| **`ara-x` / actuadores** | Solo citado (`actuator_allowlist.json`) | GAP-03/GAP-04 viven ahí y el corpus los usa como fuente sin documentarlos |
| **Instalación / arranque** (APK install, `/ara/enroll`, ADB, Wake) | **Sin documento** | El operador pidió «el sistema»; cómo se instala y se enciende no está |
| **Judder / cadencia** | Sí están: `06_JUDDER…` y `07_FALSIFICACION…` | ✅ cubierto |

**Fix:** añadir `06_OPERADOR.md` y `07_CONTRATOS.md`, y decidir si «instalación» entra; hoy `etc etc` = esos tres huecos.

---

## 8 · LO QUE AGUANTA (con sus límites)

1. **Los cinco `sha256` y los conteos de línea del índice son exactos**, uno por uno: `4df16122…`, `51956d1d…`, `567d1c75…`, `ebb7b4a5…`, `acbd462b…`, con 351 / 267 / 391 / 358 / 422 líneas. El índice incluso detectó y explicó la discrepancia de 293 vs 391 líneas del informe de entrega.
2. **Las 15 citas de código que probé son correctas**, incluidas las tres que más fácil era inventarse (el flag `curHasDecl`, el contrato LIGHT, la línea del SSL).
3. **La tabla de verdad del índice separa REAL / ASPIRACIONAL / DESCARTADA con criterio** y no vende ninguna de las cinco piezas dudosas.
4. **Los `NO_COMPUTADO` son honestos y llevan su razón**: `sha256`/`mtime` de las listas, el limitador de 500 ms, los 6-7 endpoints, el primer segmento, `conviva-event` fuera del corte.

**Límites de esta auditoría (para que no se cite como más de lo que es):**
- Verifiqué **26 afirmaciones de un corpus de ~1.700 líneas**. No es un censo: es un muestreo sesgado hacia lo que el encargo señalaba como sospechoso.
- **No pude verificar** (comando rechazado por el entorno, no por falta de ganas): el «52 entradas en `/var/www/lists`» de D-4 y el «0 `#EXTSHIMOTT`» de D-6 dentro de la lista servida. Quedan **NO COMPUTADO** con su comando.
- **La antigüedad manda:** F-02 y F-05 no son mentiras, son **fotos sin fecha** que hoy ya no cuadran. Un documento operativo necesita `mtime` y fecha de medición por fila, o se degrada solo.
- No audité los 10 documentos previos (`01_APK_INVENTARIO`, `02_VPS_INVENTARIO`, etc.): solo se usan como fuente y el índice ya los marca como superables.

---

## 9 · Resumen para el corrector

| ID | Archivo:línea | Fix |
|---|---|---|
| F-01 | `02_VPP_TRES_CAPAS.md:16` | `ape-feedforward-stream.php:95` → **`:103`** |
| F-02 | `05_LISTAS.md:20` | añadir `mtime`/`stat` a los bytes `[VPS]` (hoy 261.350.350 ≠ 250.932.745) |
| F-03 | `00_INDICE.md:57` y `:270` | 15 → **16** ficheros |
| F-04 | `05_LISTAS.md:10` | «14 listas» → 11 con nombre + glob + puntero + symlink; real **18 `.m3u8`** |
| F-05 | `02_VPP_TRES_CAPAS.md:130` · `00_INDICE.md:159` | «CERRADO por SYSTEM_ALERT_WINDOW» → «sin implementación; appop = `allow` (2026-11-14)» |
| F-06 | `02_VPP_TRES_CAPAS.md:107` | «real, presente y consumida» → «presente en el volcado, sin lector conocido» |
| F-07 | `02_VPP_TRES_CAPAS.md:131` | adjuntar `ls -l`/`sha256` de los dos PNG |
| F-08 | `00_INDICE.md` §8 | abrir huecos: operador LLM, contratos, instalación |
