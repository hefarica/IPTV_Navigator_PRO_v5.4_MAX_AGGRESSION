# ADVERSARIAL — ¿Puede la receta de Canary llegar al televisor en directo?

**Fecha:** 2026-11-11 · **Rol:** abogado del diablo (oposición adversarial) · **Ámbito:** solo lectura.
**Workdir:** `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION`
**Insumos:** `docs/audits/CANARY_TRUTH_20261111.md` (t1), `docs/audits/JIT_TRUTH_20261111.md` (t2), `docs/audits/JIT_HTTP_PROBES_20261111.md` (t3), `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md`, los manifiestos de VPS/incidente y el paquete `scratch/canary_jit_20261111/`.
**Herramientas usadas:** `adversarial_frame`, `adversarial_verdict`, `ape_arch_map`, `ape_directive_reality`, `ape_jit_contract`, `skill ape-image-pipeline-truth` (cargada), `Get-FileHash`, `grep`.

**Límite de método, declarado antes de empezar:** esta auditoría **no arrancó ningún motor**, no tuvo SSH al VPS y no tuvo device. Los bitstreams citados son de terceros (t2/t3 y `PRUEBA_FISICA_REA_654_20261108.md`); los SHA, bytes y líneas de este documento **sí** los medí yo. Lo que no medí se marca `NO_COMPUTADO`, no se rellena.

---

## 0. Identidad de los artefactos que sostienen este documento

Medido por mí (`Get-FileHash` / `[IO.File]::ReadAllText`), para que cualquier lector pueda comprobar que juzgo los bytes correctos.

| Artefacto | Bytes | Líneas (total / no vacías) | sha256 |
|---|---|---|---|
| `tools/lab/ape-jit/server.js` (**A**, desplegable, `manifest.tsv:59`) | 447.943 | 9.212 / 8.695 | `28352c50…36ff67` |
| `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` (**B**, no desplegable) | 45.535 | 959 / 918 | `8405f784…1fbae0` |
| `_vps_stage/canary/ape-visual-emulate.sh` (**el que se despliega**) | 4.068 | 80 / 71 | `653b56e1…243f8` |
| `vps/bin/ape-visual-emulate.sh` (**el que sí tiene el bucle con JIT**) | 6.714 | 144 / 135 | `f1d2ecff…8fec1` |
| `…/APE_CANARY_JIT_INTEGRACION_20261111/canary/canary_quality.js` | 3.083 | 57 / 57 | `bc990705…d68e36` |
| `…/canary/quality-policy.json` | 1.183 | 20 / 20 | `9845aa5d…fc65` |
| `_vps_stage/deploy/manifest.tsv` | 6.501 | 61 / 60 | `5f5adcf1…f018ed` |
| `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md` | 24.513 | — | `998f1ae4…56e8d5` |
| `docs/audits/CANARY_TRUTH_20261111.md` (t1) | 47.639 | 572 / 435 | `33c214ef…98da6` |
| `docs/audits/JIT_TRUTH_20261111.md` (t2) | 52.730 | — | `e9e864b2…f8b1f4` |
| `docs/audits/JIT_HTTP_PROBES_20261111.md` (t3) | 26.540 | 278 | `f1c25105…7210c13` |

> **Nota de denominador, porque dos pares discreparon y ambos tenían razón:** B mide **959 líneas totales / 918 no vacías**. t2 reportó 959 (total) y t3 reportó 918 (no vacías). No es una contradicción: es el mismo fichero contado con dos denominadores. Igual pasa con A (9.212 / 8.695) y con t1 (572 / 435). La lección se aplica a todo este documento: **un número sin su denominador no es un dato.**

---

## 1. La tesis, descompuesta en átomos falsables

La tesis del operador, literal:

> «Canary es la autoridad de configuración y supervisión; JIT es su motor de procesamiento audiovisual bajo demanda; JIT aplica la receta real de Canary (decodificación, filtros reales, nueva codificación HEVC) y el televisor recibe esa calidad.»

Una tesis compuesta no se refuta ni se sostiene en bloque. Se descompone en cuatro átomos y cada uno recibe su propio veredicto. Esto es lo que evita el debate de adjetivos: **T1 y T3 mueren; T2 sobrevive con recortes; T4 muere como está escrita.**

| Átomo | Afirmación | Veredicto | Artefacto decisivo |
|---|---|---|---|
| **T1** | Canary es la **autoridad de configuración** y JIT la ejecuta | **FALSA — la relación está invertida** | `A:7913` «EL CANARY MIDE, EL JIT AJUSTA, EL CANARY EJECUTA»; `A:8649-8679` la cadena la construye el JIT |
| **T2** | JIT es el **motor de procesamiento bajo demanda** | **CIERTA con límites** (procesa de verdad; a 4K no en tiempo real) | `PRUEBA_FISICA:1230-1246` bitstream HEVC Main10; `A:40-44` 0,25× tiempo real a 4K |
| **T3** | JIT aplica **la receta real de Canary** | **FALSA — cero etapas semánticas compartidas y el motor nunca lee la política** | `A:7901-7907` admisión del propio motor; `grep quality-policy` en A → **0 coincidencias** |
| **T4** | **el televisor recibe esa calidad** | **FALSA como está escrita**; el enlace existe pero a ≤1080p y sin render probado en device | `PRUEBA_FISICA:1942-1943` overlay de error; `A:4498-4510` dicotomía copy/transcode |

---

## 2. Contra-tesis, en una frase falsable

> **La tesis invierte la relación que el propio código implementa y confunde un medidor con un transcoder en vivo: en el único bucle cerrado que existe, el JIT decide la cadena y el Canary la ejecuta a 5 fps sobre un clip de 6 s en un directorio aislado; el motor JIT no lee la política de Canary en su ruta de producción, en 4K o copia sin filtros o transcodifica a 0,25× tiempo real, y su capacidad medida en el VPS es insuficiente para un canal en directo. Por tanto la receta de Canary no llega al televisor en directo: lo que puede llegar es la cadena del JIT a ≤1080p, que no es la receta de Canary y no es 4K.**

Es falsable con cinco medidas concretas, listadas en §4. Si alguna de esas cinco sale a favor de la tesis, la contra-tesis cae en ese punto y solo en ese punto.

---

## 3. Las seis puntas de la contra-tesis, una por una (con su veredicto)

Aquí es donde un abogado del diablo honesto se refuta a sí mismo. **Una de las seis puntas que me encargaron se cae con un artefacto.**

### Punta 1 — «El VPS es metadata-only: no hay eslabón que aplique la receta» → **REFUTADA en parte (mi propia punta pierde)**

`docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md:15-22,58-59` sostiene, con medición del 2026-10-25, que producción es *rebase-only metadata*: los segmentos responden 404, no hay motor Rust en `:8084`, no hay `/shield/`. Eso es cierto y sigue siendo cierto **para la ruta del escudo**.

Pero `vps/nginx/snippets/ape-jit.conf:2-8` documenta un `location ^~ /jit/` **desplegado en producción** (con dos defectos medidos en vivo y corregidos el 2026-11-06), y su línea 41 es:

```nginx
location ^~ /jit/ { proxy_pass http://127.0.0.1:3099/; ... proxy_buffering off; proxy_read_timeout 65s; }
```

La barra final de `proxy_pass` **retira el prefijo `/jit`**. Consecuencia dura: el `302` del motor —que apunta a `…/jit/live/1/media_0.m3u8` y que en loopback da 404, como midió t3 en `JIT_HTTP_PROBES:94-95`— **sí es seguible detrás de nginx**, porque el upstream recibe `/live/1/media_0.m3u8`, que es su ruta real. Y el generador emite URLs del JIT (`generation-output-panel.js:342,1003`; `tools/quality/test_out_opts.js:113`).

**Veredicto: hay eslabón.** El VPS no transporta el vídeo del escudo, pero sí proxya el vídeo del JIT. Mi punta 1, tal como venía escrita, **no se sostiene** y la retiro. El eslabón que falta no es de red: es de **cadena aplicada** y de **capacidad**.

> Corrección que esto impone a t3: su **H-3 (severidad ALTA: «el 302 apunta a una ruta que el motor NO sirve»)** queda rebajado a **MEDIA**. No es un puntero roto: es un acoplamiento —la URL solo es servible detrás de un proxy que retire el prefijo, y ese proxy existe en producción—. Lo que el contrato debe fijar es **quién sirve ese path**, no «arreglar» el 302.

### Punta 2 — «`#EXTVLCOPT:video-filter` es inerte por política, no por sintaxis» → **SOSTENIDA**

Dos artefactos independientes:

1. **Herramienta `ape_directive_reality`**, sobre la cadena canary literal:
   - `#EXTVLCOPT:video-filter=<cadena canary>` → **`DECLARED_ONLY`**, vía `SSE presets[]`, detalle: *«No se consume desde la lista; solo se clasifica como DECLARED cuando llega por el array presets[] del SSE»*.
   - Conclusión medida de la herramienta: *«El APK lee de la lista SOLO `#EXT-X-APE-LAB-METADATA`, los atributos de `#EXTINF` y la URL»* (fuente: `ListLoader.kt:59-87 · ApePlayer.kt:153 · PresetRouter:12,25-52`).
2. **Skill `ape-image-pipeline-truth` §6**, medida en VLC 3.0.24: `main error: unsafe option "video-filter" has been ignored for security reasons` — **0 filtros instanciados y el canal reproduce igual**. No es sintaxis: cambiar a `{}` o a `:` no lo arregla. La skill añade que OTT Navigator parsea `#EXTVLCOPT` **solo para user-agent y http-referrer** (§11).

**Veredicto: la receta no puede viajar ejecutable en la lista.** Puede viajar como metadata (20 chunks `#EXT-X-APE-LAB-METADATA`, skill §4), pero metadata no es ejecución.

### Punta 3 — «MediaSession no contiene fotogramas de OTT: REA solo aplica si posee el reproductor» → **SOSTENIDA (con una reserva de fuente)**

`ape_arch_map` devuelve, y reproduzco literal:

- `frontera_central`: *«MediaSession NO contiene fotogramas de OTT: REA solo aplica efectos si POSEE el reproductor (txt L899-901)»*.
- Contrato **M3U8 → APK**: *«solo nombre, grupo, logo, perfil y URL (txt L506)»* → *«la metadata del canal no transporta control»*.
- Contrato **APK → shader**: *«el APK persiste el sobre LAB pero NO hay lector automático a shader (txt L482-484)»* → *«persistir no es aplicar»*.
- En `declarado_no_demostrado`: *«que OTT recibe efectos de REA: imposible por diseño (MediaSession sin fotogramas)»* y *«que REA aplicó efectos: el propio corpus dice que no se verificó el fotograma final»*.

**Reserva honesta:** el fichero `Arquitectura_APE_APK_VPS_M3U8.txt` **no existe en este workspace** (lo busqué por glob; solo está el PDF `scratch/canary_jit_20261111/Arquitectura_APE_Canary_JIT_Actualizada_20261111.pdf`). Las líneas 899-901 y 506 las cito **a través de la herramienta**, no del fichero. Quien quiera cerrar la punta debe abrir el TXT original.

### Punta 4 — «La física: la cadena Canary a 4K no es tiempo real» → **SOSTENIDA, y por goleada**

Cuatro medidas independientes, cuatro órdenes de magnitud de margen:

| Medición | Valor | Fuente |
|---|---|---|
| Canary 4K x265, `CPUQuota=40%` | **0,1828 fps** (30 frames / 164,1 s) | `_vps_stage/canary/FASE01_REPORT.md:59`; `quality-policy.json:17`; t1:278 (aritmética verificada) |
| JIT 3840×2160 con `hqdn3d+unsharp` en el VPS | **0,25× tiempo real** (80,95 s para 20 s) | `A:40-44` — y el propio motor concluye: *«QHD y UHD NO son viables en directo con filtros en CPU»* |
| Canary real en producción (worker) | **76 s CPU / 194 s pared por 6 s de clip = 32× tiempo real** | `vps/bin/ape-pulse-canary-worker.sh:36-37` |
| JIT 4K en el incidente | **3,37 fps contra 25 fps de fuente** → `EXIT 183` en bucle cada 9 s | `docs/manifestos/INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:66-68` |
| Cadena P1 4K/60 «corregida» en host **sin GPU** | **29,6 fps** (no llega a 60) | skill §9 |

**Aritmética derivada (no medida, y se declara):** a 57-76 s de CPU por muestra de 6 s y 3 vCPU, **un zapeo cada 19-25 s satura el VPS entero con el canary solo** (57/3 = 19 s; 76/3 = 25,3 s). Y el canary está cableado al zapeo: `pulse.php:170-183` encola un ticket con `'seconds' => 6` en cada `$zap` si existe el flag.

> Y el corolario que cierra la puerta: **si la cadena es lo bastante barata para ir en tiempo real a 4K, entonces no es la receta de Canary** — porque la receta de Canary, con `noise` + `unsharp` + `eq` + `smartblur` + Lanczos a 3840×2160, mide 0,18 fps, y lo que el motor mide a 0,25× es *menos trabajo* que eso (solo `hqdn3d`+`unsharp`).

### Punta 5 — «Habilitar el canary ya provocó un incidente de producción» → **SOSTENIDA**

`INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:34-36`: *«El worker corre cada 10 s y lanza un ffmpeg a 4K con `CPUQuota=40%`, `cpu_seconds≈57`, `wall≈146 s` para un clip de 6 s»*. `:66-68`: *«`EXIT 183` = Invalid data found. En 3 vCPU, 4K no da tiempo real (medido 3,37 fps contra 25 fps de fuente). El auto-reintento que yo había añadido lo levantaba cada 9 s. **El bucle se comió la CPU y el operador se quedó sin TV**»*. `:147`: *«El canary cuesta 57 s de CPU y 146 s de pared por 6 s de clip»*.

**El coste de la tesis no es teórico: ya se pagó una vez, y la víctima fue el televisor del operador.** Y el worker actual lo sabe: su `jit_busy()` (`:45-60`) existe precisamente porque canary y JIT **compiten por el mismo ffmpeg y la misma conexión al proveedor** (`:36-39`: *«en 3 vCPU un FHD ya usa ~2 núcleos. Si coinciden… eso SÍ se ve como freeze en el player»*).

### Punta 6 — «El propio paquete se autolimita: no hay un solo recibo de ejecución» → **SOSTENIDA**

| Hecho | Ref |
|---|---|
| `applied_processing` es el literal `'NOT_EXECUTED'` | `canary_quality.js:47` |
| `canary_fidelity` es el literal `'FILTERGRAPH_IDENTICAL'` | `canary_quality.js:45` |
| `production_auto_enable: false`, `do_not_advertise_realtime: true`, `never_replace_existing_playlists: true` | `quality-policy.json:19` |
| El README del paquete: *«propuesta local comprobada mediante 5 pruebas Node, **no desplegada** ni mergeada»* | `README.md:3` |
| El único experimento declarado es **5 fps / 6 s / sin audio / hls_time 3** | `quality-policy.json:17`; `ape-visual-emulate.sh:25-26,55-57` |
| `/var/lib/ara/canary/` **vacío** — *«nunca ha corrido»*; `/etc/ara/canary/` vacío | `docs/ops/CANARY_RESOLVE_ANALISIS_2026-11-04.md:73-74` |
| El contrato versionado declara **0 recibos existentes** | `CANARY_JIT_CONTRACT_20261111.md:371` |

**Veredicto: «JIT ejecuta la receta» no tiene hoy ni un recibo de ejecución del canary en producción.** Cero `status.json`. Cero estado `applied`.

---

## 4. Pruebas discriminantes (qué separa a las dos partes y con qué se resuelve)

| # | Prueba | Qué separa | Comando / artefacto que la resuelve | Estado | Resultado |
|---|---|---|---|---|---|
| **D1** | **Quién decide la cadena** | T1 vs contra | `grep -n "canary ejecuta\|EL JIT AJUSTA" tools/lab/ape-jit/server.js` + `grep -c quality-policy tools/lab/ape-jit/server.js` | **RESUELTA** | El script que ejecuta es el canary; la cadena la emite el JIT; **0** lecturas de `quality-policy.json` en A |
| **D2** | **Identidad semántica de las dos cadenas** | T3 vs contra | diff entre `quality-policy.json:6-14` y `A:8649-8679` (`cadenaDeRegla`) | **RESUELTA** | 8 etapas canary vs 5-6 etapas JIT; **0** etapas semánticas compartidas (grano añadido vs grano quitado) |
| **D3** | **Existe un recibo `applied` en producción** | T3/T4 vs contra | `ssh vps ls /var/lib/ara/canary/*/status.json` | **NO RESUELTA** (sin SSH) | Documentado como vacío el 2026-11-04 (`CANARY_RESOLVE:73`). **Reejecutar** |
| **D4** | **Cadencias reales, no 5 fps** | T4 vs contra | `ffprobe` del `.ts` de una corrida **≥60 s** a la cadencia de la fuente, **con audio** | **NO RESUELTA** | No existe esa corrida: `-t 6 -r 5 -an` está cableado (`ape-visual-emulate.sh:25-26,57`) |
| **D5** | **Capacidad 4K sostenida en el VPS** | T4 vs contra | `ffmpeg -benchmark` con la cadena completa a 3840×2160, 60 s; exigir ≥1,0× | **PARCIAL** | 0,25× medido por el motor (`A:40-44`) con *menos* cadena; 3,37 fps en el incidente |
| **D6** | **El 4K se sirve aplicando receta** | T4 vs contra | `GET /jit/live/1174213/master.m3u8` + `ffprobe` del chunk | **NO RESUELTA sobre 4K** | Solo hay ffprobe de **1080p** desde fuente **848×480** (`PRUEBA_FISICA:1230-1246`) |
| **D7** | **El device real reproduce el JIT** | T4 vs contra | captura de fotograma en APK contra `/jit/live/<id>/master.m3u8` con VPN/MTU controladas | **NO RESUELTA** | La única prueba dio **overlay de error** (`PRUEBA_FISICA:1942-1943`); causa atribuida a la red **sin probar** |
| **D8** | **La receta viaja ejecutable en la lista** | Punta 2 vs tesis | `ape_directive_reality` sobre `#EXTVLCOPT:video-filter=…` + log de VLC 3.0.24 | **RESUELTA** | `DECLARED_ONLY`; `unsafe option … ignored` |
| **D9** | **La receta llega al player por metadata** | Punta 3 vs tesis | `ape_arch_map` contratos M3U8→APK y APK→shader | **RESUELTA (por herramienta)** | Solo nombre/grupo/logo/perfil/URL; LAB persistido sin lector a shader |
| **D10** | **Paridad medida canary-vs-JIT sobre el mismo clip** | T3 vs contra | mismo input, misma duración, ambos receipts, delta VMAF/SSIM | **NO RESUELTA** | No existe A/B perceptual; `FILTERGRAPH_IDENTICAL` es literal |

**Cinco de diez sin resolver. Las cinco resueltas favorecen a la contra-tesis.** Ninguna resuelta favorece a la tesis en T1/T3.

---

## 5. Evidencia

### 5.1 En contra de la tesis (ref por ítem)

| ID | Hecho | Ref |
|---|---|---|
| C1 | El endpoint se define a sí mismo como **«EL CANARY MIDE, EL JIT AJUSTA, EL CANARY EJECUTA»**; paso 2: el JIT busca en **su** tabla; paso 4: *«el canary ejecuta EXACTAMENTE esa cadena»*. Cita el pedido del operador: *«que el jit ajuste sus parámetros para que el canary los ejecute»* | `tools/lab/ape-jit/server.js:7913-7926` (texto en `:7915-7918`) |
| C2 | **Admisión del propio motor**: *«El canary validaba visualmente UNA receta y el JIT aplicaba OTRA distinta… La prueba visual del canary NO aplicaba a lo que se entrega»*, y enumera las dos cadenas | `tools/lab/ape-jit/server.js:7901-7907` |
| C3 | `chain_4k_test = cadenaDeRegla(regla, 3840, 2160, pqOk)`. Etapas: `format=yuv420p10le` → `hqdn3d`/`atadenoise` → `unsharp` (chroma 0) → `scale+pad` con `force_original_aspect_ratio=decrease` → `zscale` a `smpte2084`. Canary: `deblock, smartblur, yuv444p, scale=3840:2160` (deforma AR), `noise=alls=8` (añade grano), `unsharp 5:5:0.8:3:3:0.4`, `eq`, `yuv420p` | `tools/lab/ape-jit/server.js:8649-8679` y `:8764` vs `quality-policy.json:6-14` |
| C4 | `canary_fidelity: 'FILTERGRAPH_IDENTICAL'` y `applied_processing: 'NOT_EXECUTED'` son **literales**, no medidas | `canary_quality.js:45` y `:47` |
| C5 | Capacidad medida por el motor en el VPS: **3840×2160 con `hqdn3d+unsharp` = 80,95 s para 20 s = 0,25× tiempo real**; *«QHD y UHD NO son viables en directo con filtros en CPU»* | `tools/lab/ape-jit/server.js:40-44` |
| C6 | Canary real: **76 s CPU / 194 s pared por 6 s = 32× tiempo real**; incidente: **3,37 fps vs 25 fps**, `EXIT 183` en bucle y *«el operador se quedó sin TV»* | `vps/bin/ape-pulse-canary-worker.sh:36-37`; `INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:66-68` |
| C7 | El único experimento del canary es **5 fps, 6 s, sin audio**; `0,1828 fps` | `ape-visual-emulate.sh:25-26,55-57`; `quality-policy.json:17`; `FASE01_REPORT.md:59` |
| C8 | La salida del canary va a `/var/lib/ara/canary/<id>/` y **el script declara que no toca** `/lists/`, `/sync`, `/ara` ni el catálogo; el worker lo repite; el directorio está vacío | `_vps_stage/canary/ape-visual-emulate.sh:5-6`; `vps/bin/ape-pulse-canary-worker.sh:15`; `CANARY_RESOLVE_ANALISIS_2026-11-04.md:73` |
| C9 | El manifiesto instala la versión de **80 líneas**, que **no tiene ni una llamada a JIT** (`grep -i jit` sobre `_vps_stage/canary` → 0 coincidencias). La versión con bucle (`vps/bin/…`, POST a `127.0.0.1:3099/jit/signal` en `:80`) **no está en el manifiesto** | `_vps_stage/deploy/manifest.tsv:39`; `vps/bin/ape-visual-emulate.sh:80` |
| C10 | `#EXTVLCOPT:video-filter` = **`DECLARED_ONLY`**; en VLC 3.0.24 *«unsafe option "video-filter" has been ignored for security reasons»*; OTT solo lee UA y referrer | `ape_directive_reality` (salida literal en §3); skill `ape-image-pipeline-truth` §6 y §11 |
| C11 | Frontera central y contratos: MediaSession sin fotogramas de OTT; M3U8→APK solo nombre/grupo/logo/perfil/URL; APK→shader «persistir no es aplicar» | `ape_arch_map` (`frontera_central`, `contratos`, `declarado_no_demostrado`) |
| C12 | La única prueba con la APK real contra URLs del JIT: **«NO — overlay de error»** (16.280 / 22.491 B); la LAN sí reproduce | `docs/audits/PRUEBA_FISICA_REA_654_20261108.md:1939-1946` |
| C13 | En 4K la ruta es una **dicotomía**: o `-c:v copy` (*«con `-c:v copy` los filtros no se ejecutan»*, `:88-89`; `:4486-4487`) o transcodificación que el propio motor mide a 0,25×. Y para SDR cuyo destino pedido es menor que la fuente, **lanza `SOURCE_PRESERVATION_REQUIRED`** en vez de degradar | `tools/lab/ape-jit/server.js:88-89, 4486-4490, 4502-4503, 4507-4510, 4555-4558` |
| C14 | El motor **no lee la política de Canary**: `grep -c 'quality-policy'` en A → **0**. Sus cadenas salen de `transform-rules.json` / `image-config.json` / `RULES_SEED` | `tools/lab/ape-jit/server.js:47,548,631-683` (§0 y §3 de este documento) |

### 5.2 A favor de la tesis (y con qué fuerza)

| ID | Hecho | Ref | Fuerza |
|---|---|---|---|
| P1 | **El JIT aplica filtros reales y produce HEVC nuevo, verificado en el bitstream**: 848×480 H.264 8-bit BT.709 → **1920×1080 HEVC Main 10 `yuv420p10le` `smpte2084` 1.552.340 bps**, servido por HLS y DASH con 200 | `PRUEBA_FISICA_REA_654_20261108.md:1228-1246, 1265-1269` | **FUERTE** — sostiene «filtros reales + nueva codificación HEVC»… a 1080p y desde 480p |
| P2 | **El enlace de entrega existe**: snippet `/jit/` desplegado con `proxy_pass` que retira el prefijo, y el generador emite URLs `/jit/live/<id>/…` | `vps/nginx/snippets/ape-jit.conf:2,40-41`; `generation-output-panel.js:342,1003`; `test_out_opts.js:113` | **FUERTE** — refuta mi propia punta 1 |
| P3 | **Contrato fail-closed real**: `loadPolicy` lanza `CANARY_PARITY_CHANGED`, `CANARY_ENCODER_CHANGED`, `CANARY_AUTO_ENABLE_FORBIDDEN`; y el contrato versionado declara 0 recibos en vez de fingir uno | `canary_quality.js:18-29`; `quality-policy.json:19`; `CANARY_JIT_CONTRACT_20261111.md` | **FUERTE** — sostiene exactamente «no declarar aplicado lo que solo está declarado» |
| P4 | `/jit/signal` **existe** en el artefacto desplegable y devuelve cadena por regla: el bucle está implementado en código | `tools/lab/ape-jit/server.js:8603,8764` | MEDIA |
| P5 | Transporte del motor: 302 reproducido 5/5 variantes; 206 reproducido 2/2 en B con `Content-Range` exacto | `JIT_HTTP_PROBES_20261111.md:82-86,173-197,210-212` | MEDIA |
| P6 | La cadena de 8 filtros **se ejecuta de verdad** con `-vf` y libx265 cuando el script corre; el string es byte-idéntico en 5 sitios (sha16 `ed1fe6fe00be413f`) | `_vps_stage/canary/ape-visual-emulate.sh:52,55-65`; t1:`CANARY_TRUTH:104` | MEDIA |
| P7 | En el host sin GPU, la cadena P1 4K/60 «corregida» mide **29,6 fps** — el 4K no es imposible, solo insuficiente para 60 | skill §9 | MEDIA (neutra: 29,6 < 60) |

---

## 6. Veredicto (salida literal de la herramienta)

`adversarial_verdict` con 18 ítems (12 contra, 6 a favor), todos con artefacto:

```json
{
  "sobrevive": "CONTRA",
  "razon": "peso CONTRA 35 vs TESIS 15, con 12 item(s) con artefacto verificable en el lado que sobrevive",
  "pesos": { "tesis": 15, "contra": 35, "neutro": 0 },
  "items_con_artefacto": { "tesis": 6, "contra": 12, "total": 18, "sin_artefacto": 0 },
  "problemas_forma": [],
  "evidencia_faltante": [
    "Prueba discriminante sin resultado adjunto: prueba 1",
    "Prueba discriminante sin resultado adjunto: prueba 2",
    "Prueba discriminante sin resultado adjunto: prueba 3",
    "Prueba discriminante sin resultado adjunto: prueba 4",
    "Prueba discriminante sin resultado adjunto: prueba 5"
  ]
}
```

**Lectura:** sobrevive la CONTRA, con 12 artefactos en el lado ganador y **cero ítems sin artefacto** (no hay prosa disfrazada de prueba). El margen (35 vs 15) es amplio, no de un punto: no es un empate que la herramienta haya desempatado.

**Y no es INDECIDIBLE, pero tampoco es una victoria total.** Ver §7 y §8.

---

## 7. Evidencia que FALTA (lista cerrada, con quién la puede producir)

1. **D3 — un `status.json` de producción.** `ls -l /var/lib/ara/canary/*/status.json` en el VPS. Hoy el único documento dice que está vacío (`CANARY_RESOLVE:73`). Es el recibo que convierte `declarado` en `aplicado`.
2. **D4 — una corrida a cadencia real.** Un `.ts` de ≥60 s a 25/30/50/60 fps **con audio**, y `ffprobe` del resultado. Exige quitar `-t 6 -r 5 -an` o añadir un modo de medición. Nadie la ha hecho.
3. **D5 — capacidad 4K sostenida.** `ffmpeg -benchmark` con la cadena **completa** a 3840×2160 durante 60 s en el VPS, exigiendo ≥1,0×. Hoy: 0,25× con menos cadena.
4. **D6 — 4K real con receta.** `GET /jit/live/1174213/master.m3u8` + `ffprobe` del `chunk`, para ver si el 4K sale copiado (sin filtros) o transcodificado (y a qué fps).
5. **D7 — render end-to-end en device.** Captura de fotograma en la APK contra `/jit/live/<id>/master.m3u8` con **VPN y MTU controladas**. La única existente dio overlay de error y la atribución a la red quedó sin probar.
6. **D10 — A/B perceptual canary-vs-JIT** sobre el mismo clip y la misma fuente, con delta VMAF/SSIM. Sin esto, `FILTERGRAPH_IDENTICAL` sigue siendo una etiqueta.
7. **El TXT `Arquitectura_APE_APK_VPS_M3U8.txt`** (L482-484, L506, L899-901) para citar la frontera central desde el fichero y no desde la herramienta.

**Qué cambiaría el veredicto:** cualquiera de (2), (4) o (6) saliendo a favor de la tesis abre una grieta real. La (5) sola no: probaría que el enlace funciona, no que la receta sea la de Canary.

---

## 8. Lo que SOBREVIVE de la tesis (y hay que defenderlo con la misma fuerza)

La contra-tesis no gana entera. Cuatro cosas son sólidas y no son concesiones de cortesía:

### 8.1 El contrato fail-closed es el activo real, y ya existe

`quality-policy.json` + `loadPolicy` (`canary_quality.js:18-29`) son un **candado que impide que la receta derive en silencio**: si alguien cambia el orden de los filtros, un parámetro o el encoder, el programa **lanza** (`CANARY_PARITY_CHANGED` / `CANARY_ENCODER_CHANGED`), y si alguien intenta auto-habilitar producción, lanza `CANARY_AUTO_ENABLE_FORBIDDEN` (`quality-policy.json:19`). El `policy_sha256` se calcula **de los bytes** (`canary_quality.js:16,30`), no de una cadena escrita a mano.

Eso es exactamente lo que el objetivo del equipo pide («sin declarar como aplicado lo que solo está declarado») y **es defendible hoy, con artefacto, sin desplegar nada**. El `CANARY_JIT_CONTRACT_20261111.md` lo extiende a triple estado `requested`/`applied`/`output` con 21 códigos de rechazo y declara **0 recibos** en lugar de inventarlos.

### 8.2 Canary vale como MEDIDOR, no como TRANSCODER

Un instrumento que muestrea 6 s a 5 fps y tarda 164 s es **un instrumento perfectamente válido de laboratorio**: mide la receta sobre una fuente real, con una cadencia fija, y produce un artefacto comparable. Donde no vale es sirviendo un canal. La distinción no es semántica: **cambia el diseño** — el canary debe escribir un recibo de calidad, no un `out.m3u8` que nadie consume (y hoy nadie consume: `ape-visual-emulate.sh:5-6`, directorio vacío).

Y hay una inversión que la tesis debería aceptar: **en aspect ratio, el consumidor es más correcto que la autoridad.** Canary usa `scale=3840:2160`, que **deforma** fuentes no 16:9 — su propia política lo advierte (`quality-policy.json:18`: *«original scale 3840:2160 can stretch non-16:9 inputs»*) — mientras el JIT usa `force_original_aspect_ratio=decrease` + `pad` (`A:8668-8670`). t1 lo midió y lo llamó «inversión de autoridad» (`CANARY_TRUTH:171`). Es correcto y es un dato que la tesis no puede esquivar: **la autoridad de la receta tiene un defecto que el consumidor ya corrigió.**

### 8.3 «JIT aplica filtros reales y produce HEVC nuevo» es CIERTO — solo que aplica SU receta

El bitstream de `PRUEBA_FISICA:1233-1234` no es un tag: es `hevc | Main 10 | 1920x1080 | yuv420p10le | smpte2084 | 1.552.340 bps`, leído con `ffprobe` de `init`+`chunk`. Eso es un transcode real, con filtros reales, servido por HLS y DASH. **El átomo T2 sobrevive.** Lo que muere es el posesivo: esa cadena no es la de Canary (§5.1 C1-C3, C14) y no es 4K.

### 8.4 «Bajo demanda» es la descripción correcta del motor — y el problema no es el modo

El motor no pretende ser continuo: arranca ffmpeg por canal bajo petición (`/go/<id>` → `/live/<id>/`), y eso es legítimo para VOD, para un canal puntual, o para generar una variante. **El fallo no es «bajo demanda»: es la cadencia a 4K.** A 1080p el motor cabe (el propio motor mide 46,94 s para 20 s a 2560×1440 = 0,43×… y aun así no llega; a 1080p sí, como demuestra el bitstream de P1). A 4K no cabe ni con la mitad de la cadena.

---

## 9. Reformulación defendible de la tesis (lo que sí se puede firmar hoy)

> «Canary es la **autoridad versionada de la receta y el medidor de calidad**; JIT es el **motor on-demand** que ejecuta **su propia** cadena, derivada de una tabla de reglas por banda de entrada; el televisor recibe **la salida del JIT a ≤1080p**, verificada en bitstream, y en **4K recibe copia sin filtros o nada**, porque transcodificar 4K en el VPS es 4× demasiado lento. La receta de Canary **no se aplica hoy en producción en ningún canal**: es un contrato y un instrumento, no un pipeline.»

Esa frase es verificable con los artefactos de §0 y §5 y **no afirma nada que no esté medido**. Si el operador quiere la versión fuerte de su tesis, tiene que producir las pruebas (2), (4) y (6) de §7 — y mientras no existan, declararla aplicada es exactamente lo que el contrato de §8.1 prohíbe.

---

## 10. Correcciones a los pares (fail-honest, y sin ellas este documento valdría menos)

1. **`_vps_stage/deploy/manifest.tsv` SÍ existe** — 6.501 B, 61 líneas, sha256 `5f5adcf1…`. Lo que no existe es `manifests.tsv` (plural), que es la grafía que usó t2. La fila 39 que cita t1 es real y la verifiqué.
2. **B: 959 totales / 918 no vacías.** t2 y t3 no se contradicen; contaron distinto. A: 9.212 / 8.695.
3. **El motor A no tiene `-ac 2`, ni `-level:v 4.2`, ni `max-cll`, ni rutas `/sdr/`** (`grep` → 0 coincidencias). Esos defectos son de **B** y no deben atribuírsele. `ape_jit_contract` describe el corpus de B: sus riesgos (`/sdr/`, `?force=2k`, `-level:v 4.2`) **no aplican al artefacto desplegable A**. A es el que cumple la ley anti-degradación (`docs/actions/ACCIONES_20261108.md:127`: «0 `fps=30`, 0 `-ac 2`, `audio_passthrough=1`. Es el único que cumple la ley»).
4. **El 302 del JIT no es un puntero roto** (t3 H-3, ALTA → **MEDIA**): detrás de `location ^~ /jit/` con `proxy_pass …:3099/` (barra final), el prefijo se retira y la ruta existe. En loopback da 404; en producción no tiene por qué.
5. **`spawn nice ENOENT` (t3 H-2) es del host de auditoría (Windows), no del motor.** No es extrapolable al VPS Linux, donde `nice` existe. Quien lo cite como defecto de producto se equivoca de etiqueta.
6. **`FILTERGRAPH_IDENTICAL` no es una medida en ningún escenario** — ni siquiera si algún día la cadena casara: es el literal de `canary_quality.js:45`. Que la cadena casara habría que demostrarlo con un `output` y un A/B (D10), no leyendo la etiqueta.

---

## 11. Límites de esta auditoría

- **No arranqué motores.** Los 200/206/302 y los bitstreams son de t2, t3 y `PRUEBA_FISICA`; los cito con su sha, no los reproduje.
- **Sin SSH al VPS y sin device.** Todo lo que depende del estado vivo (`status.json`, `image-config.json`, `transform-rules.json`, versión desplegada del JIT) queda `NO_COMPUTADO`.
- **El TXT de arquitectura no está en el workspace**; la frontera MediaSession la cito por `ape_arch_map`.
- **Los 2 PDF del paquete no se parsearon aquí** (los audita t1, con tabla A1-A33).
- **La aritmética «un zapeo cada 19-25 s satura el VPS» es derivada**, no medida: 57/3 y 76/3 sobre CPU-s de dos corridas distintas. Se declara como derivada.
- **Este documento no autoriza nada.** No propone desplegar, ni habilitar el canary, ni tocar el VPS. Su único producto es el mapa de qué se puede firmar y qué no.
