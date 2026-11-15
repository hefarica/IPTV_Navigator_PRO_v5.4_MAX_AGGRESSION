# ESTADO DEL ARTE DEL REPO — y su evolución verdadera

**Fecha:** 2026-11-15 · **Autor:** canary-auditor (task `t72`) · **HEAD verificado:** `c20d3261` (rama `deploy/engine-restart-20261112`, 1.350 commits).

**Cómo leer este documento.** Cada fila lleva su marca:

| Marca | Significado |
|---|---|
| **`[V]`** | **verificado por mí en esta sesión** (existe el artefacto, existe el commit, o el número cuadra con una medición mía) |
| **`[C]`** | **citado**: medido y publicado por otro miembro del equipo, con su comando de repro al lado. No lo he re-ejecutado |
| **`[NC]`** | **NO COMPUTADO**: no hay artefacto. No es un cero |
| **`[X]`** | **DESCARTADO**: probado que no funciona aquí, con la prueba citada |

---

## 1. Qué es este repo hoy, en una frase

**Un generador de listas + un cableador que envuelve cada canal en `/pulse/` + un agente Android que aplica settings y pinta un overlay + un shim loopback que fija la variante + un medidor que vigila desde el VPS.** No es una plataforma de vídeo: el VPS **no transporta vídeo** (`\.(ts|m4s|mp4) → 404`, `[C]` `docs/audits/QUE_LE_PASA_A_LA_IMAGEN_20261113.md:96`).

---

## 2. Las cinco estaciones del APE CRYSTAL FLOW

| # | Estación | Dueño | Qué produce | Estado real |
|---|---|---|---|---|
| **1** | **GENERADOR** | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | la `.m3u8` con las directivas por canal (`#EXT-X-APE-CHANNELS:21224`, `catchup="flussonic"`, `#EXT-X-VERSION:9`) | **REAL** `[C]` · sin cambios en esta sesión |
| **2** | **CABLEADO** | `tools/ops/ape-cablear*.php` + `vps/bin/ape-cablear-queue-worker.sh` | la misma lista con cada URL del proveedor dentro de `/pulse/<id>` | **REAL** `[C]` · 21.224 / 21.224 (100 %) |
| **3** | **AGENTE** | `com.ape.crystalagent` (APK) | settings de imagen, heartbeat/QoE y **overlay sin Activity** | **REAL** `[C]` · 12 settings aplicados |
| **4** | **SHIM** | `dev.venice.ottshim` (módulo `:shim` del mismo APK) | sirve la fuente por `127.0.0.1` para fijar variante y mapear segmentos | **REAL con límite** `[C]` · con catálogo multi-canal hace **passthrough** (no reescribe) |
| **5** | **MEDICIÓN** | vigilante de módulos + `/prisma/api/*` + logs de nginx | QoE, zapeo, latencia, 4xx/5xx clasificados | **REAL** `[C]` · vigilante 6/6 |

Fuente de la arquitectura: `docs/architecture/APE_CRYSTAL_FLOW.md:24-118` (ese documento la marca **«Estado: PROPUESTA»**; el §5 de aquí la declara vigente por instrucción del operador — ver §7).

---

## 3. REAL / ASPIRACIONAL / DESCARTADO

### 3.1 REAL (medido)

| Dato | Valor | Fuente / repro | Marca |
|---|---|---|---|
| Canales cableados | **21.224**, 100 % con `/pulse/` | `grep -c '^#EXTINF'` · `grep -c '/pulse/'` — `BASELINE_APE_CRYSTAL_FLOW_20261114.md:40-41` | `[C]` |
| Lista completa | **1.298.222.092 B** · `.gz` **352.804.883 B** | `stat -c%s` — `BASELINE…:261` | `[C]` |
| Proyección ligera (`…_CABLEADA_LIGHT.m3u8`) | **171.893.544 B** · `.gz` **3.480.451 B** · **0** líneas `#EXT-X-APE-` | `grep -c '^#EXT-X-APE-'` = 0 — `BASELINE…:262-264` | `[C]` |
| Canales que sirven | **89 de 100 → 200**; los 11 son **403/407 del proveedor** | censo con UA de player — `BASELINE…:85` | `[C]` |
| Manifest `/pulse/` | **p50 704 ms**; **caché 1 ms** | `rt=` de `playlist_access.log` — `BASELINE…:43` | `[C]` |
| Segmento 4K | **21.343.452 B** (`0x47`) | `xxd -l 4` — `BASELINE…:86` | `[C]` |
| Badge | muestra **`entrada=3840x2160`** en el device | logcat `badge de upscaling` — `BASELINE…:192-199` | `[C]` |
| **Gate estático** | **PASS 8 / 0** | `bash tools/quality/gate_no_focus_steal.sh` | `[V]` el fichero existe (8.121 B) y el commit `2784595c` lo creó |
| **Gate de flujo** | **8 PASS / 0 FAIL en el VPS** · (5 PASS + 5 SKIP desde Windows, con su motivo) | `bash tools/quality/gate_ape_crystal_flow.sh --json` — `BASELINE…:346-376` | `[C]` |
| **Gate de device** | **7 PASS / 0 + 1 SKIP** | `bash tools/ops/ape-device-health.sh` — `BASELINE…:348` | `[C]` |
| Vigilante de módulos | **6/6 verde**, HTTP real cada 60 s | `/var/lib/ape/module-watchdog.json` — `BASELINE…:88` | `[C]` |
| Settings aplicados / rechazados | **12 / 12** (los 12 rechazados devuelven `null`) | logcat `ApeSettingsApplier` — `BASELINE…:389-390` | `[C]` |
| Gate del intent-filter | checks **[7]** `manifest-sin-BROWSABLE` y **[8]** `manifest-sin-scheme-http` | `BASELINE…:175` | `[V]` el commit `cf1ca27f` los añade |
| Contrato de operativa | `contracts/ape_crystal_flow_operativa.json` **11.195 B** con `LEY_1_SEGUNDO_PLANO` | `grep -o 'LEY_1_SEGUNDO_PLANO'` — `BASELINE…:497` | `[V]` |
| Medidor de zapeo | `tools/ops/ape-zapping-meter.sh` **6.571 B** | commit `ccc499eb` | `[V]` |

**Densidad de #EXTVLCOPT / #EXT-X-APE- — contraste con mi propia medición.** El baseline declara `#EXT-X-APE-` **14.316.139** líneas (734.550.274 B) y `#EXTVLCOPT` **2.907.692** / 111.071.055 B (`BASELINE…:266-268`, `[C]`). Yo medí por muestreo independiente (1.086 bloques completos de la lista de 1,3 GB, `t57`):
- `#EXTVLCOPT`: **2.907.688** extrapoladas vs 2.907.692 declaradas → **Δ 4 líneas (0,0001 %)**: **corroborado**.
- `#EXT-X-APE-`: **14.480.970** extrapoladas vs 14.316.139 declaradas → **Δ 1,15 %**: **dentro del error de muestreo pero NO verificado**; haría falta contar el fichero del VPS (`grep -c`).

### 3.2 ASPIRACIONAL (existe en el repo, NO en producción)

| Capa | Qué dice el repo | Qué pasa de verdad | Marca |
|---|---|---|---|
| Doctrina **OMEGA** | describe un proxy que transforma y transporta | el VPS real es **rebase-only metadata**: no transporta vídeo | `[C]` — `docs/audits/04_LANE_CAPABILITY_MATRIX.md:36,353`; `CLAUDE.md` (bloque «REALIDAD MEDIDA DEL VPS») |
| Motor **Rust `:8084`** | unit y `/health` documentados | **no está desplegado**; `/health` y `/metrics` = `000` | `[C]` — `CLAUDE.md`, bloque de realidad medida |
| **`/shield/`** | ruta de shielding | **responde 404** | `[C]` — idem |
| **`.lua` del repo** | 26–43 ficheros de pipeline | en el VPS **solo coinciden 4 de 26** | `[C]` — idem |
| **2.907.692 líneas `#EXTVLCOPT`** | recetario de imagen de la lista | son opciones de **VLC**; **OTT Navigator no las lee** (solo `http-user-agent` y `http-referrer`) | `[C]` — `BASELINE…:409-414` + `[V]` mi medición de `t57` (`docs/audits/URL2_EFFECTIVENESS_20261114.md`) |
| **14,3 M líneas `#EXT-X-APE-`** | metadata de imagen por canal | **RFC 8216 §4.2**: el player ignora etiquetas desconocidas. Solo las lee el daemon | `[C]` — `BASELINE…:410-411` |

**Por qué esta tabla importa más que la anterior:** el pedido del operador mejora fluidez e imagen **«vía metadata, vía URL2»**. Medido: de **1.053,1 líneas por canal, OTT lee 6 (0,57 %)**; el resto es inerte **para ese reproductor** (`[V]` `docs/audits/URL2_EFFECTIVENESS_20261114.md`). La metadata sirve — pero a **otros** consumidores, y hoy ese «otro consumidor» es un daemon que no está corriendo en el camino de reproducción de OTT.

### 3.3 DESCARTADO (probado imposible aquí)

| Cosa | Prueba | Marca |
|---|---|---|
| **VPP / AI-PQ**: `pq_ai_sr_enable`, `ai_sr_level`, `pq_sharpness_enable`, `pq_hdr_mode`, `ai_pq_mode`, `pq_dnr_enable` | **todos devuelven `null`**; 12 aplicados / 12 rechazados. **No existen en AMLS905Y4** | `[X]` `BASELINE…:389-396` |
| **7 `com.amazon.tv.*`** | son de **Fire TV**; este equipo es **ONN** | `[X]` `BASELINE…:392-393` |
| **Composición a 4K** | `ro.surface_flinger.max_graphics_**height**=1080` capa el compositor a 1080p; es **propiedad de build, inmutable** (`setprop` → `Failed to set property`) | `[X]` `docs/audits/VEREDICTO_10_CONFIGURACIONES_20261113.md:11,36` y `14_CANARY_FINAL_REPORT.md:91` |
| **Forzar el modo de display desde la app** | requiere permiso de plataforma (`WRITE_SECURE_SETTINGS` en el manifiesto no basta para el modo de display del sistema) | `[X]` `docs/REA_SCOPE_AND_ARTIFACTS.md:313,320` |
| **`minterpolate`/`zscale`/`nlmeans` vía playlist** | `#EXTVLCOPT:video-filter` es **inerte por política** de VLC («unsafe option … ignored»); y OTT ni lo lee | `[C]` — skill `ape-image-pipeline-truth` §6; `[V]` el listado de familias de `t57` |

> **Corrección al enunciado de esta tarea:** pedía `ro.surface_flinger.max_graphics_**width**`. La propiedad **medida** es `max_graphics_**height** = 1080` (`VEREDICTO_10_CONFIGURACIONES_20261113.md:11`). La conclusión no cambia — el compositor está capado y es inmutable — pero el nombre exacto importa si alguien va a comprobarlo.

---

## 4. EVOLUCIÓN VERDADERA (fechas y commits verificados)

**Antes de esta sesión ya existía** (no es nuevo): el **generador** JS, el **VPS de rebase** (`/pulse/`, metadata-only), el **canary** visual y el **motor JIT** (`tools/lab/ape-jit/server.js`, desplegable según `manifest.tsv:59`). Lo que la sesión del **2026-11-14** añadió:

| Hora (verificada) | Commit | Qué añadió |
|---|---|---|
| 17:03 | **`a5792a70`** | `feat(badge)`: nombre REAL del canal en el overlay, traducido por el VPS |
| 17:04 | **`4f669d82`** | `feat(api)`: formaliza `ape-last-channel.php` + `ape-channel-index.sh` en el repo |
| 17:05 | **`fb7a0667`** | `chore(deploy)`: manifiesto y paso CI/CD para esos dos |
| 17:47 | **`15b64da5`** | `fix(badge)`: la Activity se cierra SIEMPRE; ya no roba el foco a OTT |
| 17:49 | **`aaeabedd`** | `fix(api)`: `ape-last-channel` lee `playlist_access.log`, no `access.log` |
| 18:05 | **`86a5bde4`** | `fix(watchdog)`: ARA ya NO salta encima de los reproductores (causa 2 de 3) |
| 18:10 | **`73cc966c`** | `fix(boot)`: al encender ya NO se abre el ARA + `docs(arch)`: **APE CRYSTAL FLOW**, nombre propuesto |
| 18:18 | **`2784595c`** | `feat(hardening)`: **gates anti-regresión** + baseline congelado |
| 18:29 | **`cf1ca27f`** | `feat(hardening)`: **LEY #1** del flujo, contrato de operativa y gate del intent-filter |
| 18:38 | **`a6f7eb3d`** | `feat(badge)`: la resolución de ENTRADA se mide con `ffprobe` en el VPS |
| 18:47 | **`3410f10d`** | `fix(api)`: la caché de resolución va a `prisma/db` (www-data puede escribir) |
| 18:56 | **`ccc499eb`** | `feat(ops)`: **medidor de zapeo** real desde el log del VPS |
| 19:06 | **`64fdedc3`** | `fix(badge)`: solo sale si OTT está reproduciendo **de verdad** (`age_s`) |
| 19:13 | **`9d6fe28f`** | `fix(api)`: `age_s` solo cuenta zapeos **EXTERNOS** (el vigilante pedía `/pulse/` cada 60 s) |
| 19:22 | **`a4293281`** | `fix(agente)`: `ShimBridge.refresh()` en segundo plano + re-verificación del badge |
| 19:23 | **`810e48fc`** | `feat(gate)`: el gate vigila **disco, caché de resolución y frescura** del vigilante |
| 19:32 | **`6a95f3a2`** | `fix(watchdog)`: el **407** del proveedor NO es fallo del módulo |
| 19:43 | **`f2921a11`** | `feat(ops)`: **gate del DISPOSITIVO** (`ape-device-health.sh`, 9.526 B) |
| 19:47 | **`53da8702`** | `feat(device-gate)`: check de coherencia de cadencia + **SKIP honesto** |
| 19:50 | **`ddff9ce0`** | `feat(listas)`: **proyección OTT** de la lista cableada (353 MB → 3,3 MB) |
| 20:02 | **`ef41a3e8`** | `fix(listas)`: la proyección colisionaba de nombre con la de `ape-pulse-sync` |
| 20:10 | **`29e43e62`** | `fix(listas)`: `_CABLEADA_OTT_LIGHT` también colisionaba → `_CABLEADA_LIGHT` |
| 20:17 | **`c20d3261`** | `fix(pulse-sync)`: excluir las proyecciones `_LIGHT` del wrapping (`try_files` las secuestraba) |

**Verificación:** los **23 de 23** existen (`git log -1`) y **todos son ancestros de `HEAD`** (`git rev-list HEAD` los contiene). Fechas y horas tomadas de `git log --date=format:'%Y-%m-%d %H:%M'`. `HEAD` = **`c20d3261`**, el último de la lista.

**La línea del reloj, en una frase:** el 14-NOV se pasó de *«el badge y el watchdog estorban al reproductor»* a *«hay tres gates que impiden volver atrás, una proyección ligera que baja el catálogo de 353 MB a 3,3 MB y un medidor que dice cuánto tarda el zapeo»* — y todo eso quedó congelado en `docs/architecture/BASELINE_APE_CRYSTAL_FLOW_20261114.md`.

---

## 5. DECLARACIÓN: APE CRYSTAL FLOW es el sistema vigente

**A partir de este momento, APE CRYSTAL FLOW —las cinco estaciones de §2— es el sistema de este repositorio.**

- **No deroga nada.** Las demás capas del repo (LAB, generador, contratos, doctrinas VPS/HEVC/CRYSTAL, skills) son **SUSTRATO** (lo que el flujo consume) o **HISTORIA** (lo que el flujo ya no es), **no alternativas** al flujo.
- **El estado de cada estación está en §3.** Lo que figura como ASPIRACIONAL o DESCARTADO **no se puede presentar como aplicado** en ningún documento futuro.
- **El baseline es el listón:** `docs/architecture/BASELINE_APE_CRYSTAL_FLOW_20261114.md`. Si un número baja, es regresión aunque compile y aunque un informe diga que está arreglado.

> **Nota de estado:** `docs/architecture/APE_CRYSTAL_FLOW.md:3` dice *«Estado: PROPUESTA… El nombre no se da por adoptado hasta que el operador lo elija»*. Esta declaración **lo adopta por instrucción del operador** (encargo de esta tarea). **No edito ese fichero** (no está en mi alcance): queda anotado en §7 para que el capitán decida si actualiza su cabecera.

---

## 6. Lo que NO cubre este documento

| No cubierto | Por qué sigue abierto |
|---|---|
| **La cadencia (50 fps vs 59,94 Hz)** | medido el **desajuste** (1,199 refrescos/fotograma, existe modo 50 Hz) pero **NO verificado en reproducción real**. `[NC]` — `BASELINE…:425-437` |
| **El 4K real en el televisor** | necesita ~18 Mbps sostenidos; el WiFi medido no los da. **No es regresión del flujo** |
| **El alta de la lista en OTT** | **manual** por diseño de OTT; no automatizable sin root |
| **La `LIGHT` servida por HTTP con su `sha256`** | el comando está escrito (`BASELINE…:308-313`) pero **no se ejecutó** — `[NC]` |
| **Los números marcados `[C]`** | medidos por otros miembros; sus comandos están al lado de cada uno. **No los he re-ejecutado**: requieren VPS/device |
| **El efecto de la proyección LIGHT en el tiempo de carga del device** | `[NC]`: se midió la carga del catálogo a 20 Mbps (~141 s → ~1,3 s), no en el aparato |

---

## 7. CONTRADICCIONES DETECTADAS (no editadas — decisión del capitán)

| # | Fichero:línea | Dice | Lo medido | Acción sugerida |
|---|---|---|---|---|
| C-1 | `docs/architecture/APE_CRYSTAL_FLOW.md:3` | «Estado: **PROPUESTA** … no se da por adoptado hasta que el operador lo elija» | el operador lo ha adoptado (encargo `t72` §5) | actualizar la cabecera a **VIGENTE**, con puntero a este documento |
| C-2 | `docs/architecture/APE_CRYSTAL_FLOW.md:114` | «Segmento real … **15.435.176 B** · 1.270 ms» | el baseline congela **21.343.452 B** (`BASELINE…:86`) | **no es contradicción**: son segmentos/fechas distintas. Se anota para que nadie los compare |
| C-3 | `docs/MIGRACION_VAST_REVIEW.md:46` | describe un «Worker 4K NVENC (`scale_cuda=3840:2160`, `hevc_nvenc`, `MAX_CHANNELS=2`)» | **no es parte de APE CRYSTAL FLOW** y no hay evidencia de que esté desplegado en este VPS | **revisar** si ese worker está en producción; si no, es ASPIRACIONAL |
| C-4 | *ninguna encontrada* | — | Barrido de ``transporta vídeo``, ``/shield/`` en `docs/`: **todos** los documentos que lo mencionan dicen **correctamente** que el VPS **no** transporta vídeo y que `/shield/` da 404 | **sin acción** — la doctrina ya está alineada con la medición |

> **Lo que NO he encontrado, y también es un resultado:** ningún documento de `docs/` afirma hoy que el VPS transporte vídeo. El único desajuste nominal es C-1 (estado del nombre) y el de nomenclatura `max_graphics_width` → `max_graphics_height` (§3.3).

---

## 8. Regla para el futuro (una línea)

**Antes de dar por buena una mejora, ejecutar el comando que está al lado del número. Si el número baja, es regresión — aunque compile, aunque el gate pase y aunque el informe diga que está arreglado.**

---

## Addendum 2026-11-15 · La cadena #EXTSHIMOTT, medida

**Que es.** Un tag HLS de una linea por canal que los players IGNOTAN por RFC 8216 y que
el shim de la APK lee para aplicar ajustes de dispositivo y routing. Es ADITIVO: no
sustituye a CODECS=/RESOLUTION= ni a los EXTHTTP/EXTVLCOPT/KODIPROP/#EXT-X-APE-.

**Estado de cada eslabon (medido, no declarado):**
| Eslabon | Estado | Evidencia |
|---|---|---|
| Contrato | REAL | `contracts/extshimott_contract.json` 39 campos con consumidor; validador exit 1 con el fixture malo |
| Generador local | REAL | 949.737 B · emite con 238 chars, JSON valido, idempotente |
| Generador servido | REAL | VPS 949.737 B · EXTSHIMOTT=7 · cache-buster 20261115-extshimott |
| Wrap VPS | REAL | 23.407 B · 18/18 checks de `test_extshimott_wrap.js` |
| Proyeccion OTT | REAL | conserva el tag (ape-list-project.sh L97-101) |
| Parser en la APK | REAL (instalado) | v673 · log `ApeExtShimOtt: sink instalado` |
| Lista generada CON el tag | **NO** | la lista en disco es anterior: 0 tags de 21.224 canales |
| El shim aplicando un tag real | **NO MEDIDO** | necesita una lista nueva y un zapeo |

**Lo que falta y por que no lo puedo cerrar yo:** el operador tiene que regenerar la
lista desde la app y zappear. Hasta entonces el ultimo eslabon esta sin medir, y no se
reporta como verde.

**Lo que NO es cierto y conviene no repetir:** que el tag "mejore la imagen". No lo hace.
`dev.*` y `ott.*` son ajustes de dispositivo que el agente ya aplicaba por ADB;
`flt` es para el pipeline VPS/VLC y OTT no lo toca; `v`/`a`/`hdr` son declaraciones de
la fuente. El valor del tag es que la lista LLEVE su propia calibracion y el device no
dependa de una DB externa.
---

## Addendum final 2026-11-15 06:20 UTC · Estado por eslabón, con su número

Esta es la foto al cierre de la sesión. Cada fila tiene el comando que la produce; lo
que no está medido se dice.

### REAL · medido ahora

| Qué | Valor | Cómo se mide |
|---|---|---|
| Canales | 21.224 | `grep -c '^#EXTINF' LIGHT` |
| Tags `#EXTSHIMOTT` | 21.224 (uno por canal) | `grep -c '^#EXTSHIMOTT:' LIGHT` |
| Directivas APE en la proyección | 0 | `grep -c '^#EXT-X-APE-' LIGHT` |
| Tamaño proyección | 186.789.613 B | `stat -c%s` |
| Tamaño con gzip | 4.023.576 B | `stat -c%s LIGHT.gz` |
| Latencia servida (gzip) | 14,7 ms | `curl -w '%{time_total}'` |
| Canales que responden 200 | 55 de 60 muestreados | `curl` sobre 60 URLs de la lista |
| Manifiestos HLS válidos | 52 de 55 | `grep '^#EXTM3U'` |
| Segmento real | 1.601.760 B · byte 0x47 | `curl -r 0-1048575` + `od` |
| Gate del flujo | PASS 10/10 | `gate_ape_crystal_flow.sh --json` |
| Vigilante | OK · 7 módulos | `/var/lib/ape/module-watchdog.json` |
| Recuperación tras `kill -9` | 6 s · NRestarts=1 | matar php-fpm y cronometrar |
| Timers activos | 11 `ape-*` | `systemctl list-timers` |
| 404 cerrados | 324 de 398 (81 %) | `playlist_access.log` antes/después |

### LO QUE EL SISTEMA AHORA VIGILA POR SÍ SOLO

Cada uno de estos se añadió **después** de que su ausencia causara un fallo real:

1. **`ape-list-light.timer`** (10 min) — regenera la proyección. **Comprueba el CONTENIDO**,
   no solo el `.stamp`: si algo la reescribe y le quita los tags, la repara y lo dice.
   (Medido: la reparó en 85 s.)
2. **`ape-module-watchdog` módulo `proyeccion`** (60 s) — 1 tag por canal y 0 APE.
3. **`gate_ape_crystal_flow.sh` check [11]** — lo mismo, para el que corre a mano.
4. **`Restart=on-failure` en nginx y php-fpm** — antes `Restart=no`. Medido con kill -9.

**Los tres primeros nacieron del mismo fallo:** el sistema daba por bueno un resultado que
nadie comprobaba. **Ese era el «está a medias y no me doy cuenta».**

### SIN MEDIR · y por qué

| Qué | Por qué no está |
|---|---|
| OTT Navigator aceptando la lista | requiere acción del operador (alta manual) |
| Tiempo de zapeo real | idem |
| El shim aplicando un tag (`ApeExtShimOtt`) | 0 eventos: no ha habido lista nueva en el player |
| El badge en pantalla con la lista nueva | depende del punto anterior |
| Cadencia 50 fps vs panel 59,94 Hz | no se puede tocar el modo de display desde la app |

### DESCARTADO · probado que no funciona aquí

- **REAL-Video-Enhancer y video2x: AGPL-3.0** (copyleft de red: incompatible con este
  APK). Además el cálculo los descarta: 13,19 TFLOPs por fotograma contra 64 GFLOPS de
  pico del SoC son **10.300×–50.750×** el presupuesto de 20 ms del directo. Solo tendría
  sentido offline con GPU alquilada, y **eso no mejora el vivo**.
- **`websr.attachToVideo(player,{quality:'6k'})` no existe.** La API real de WebSR es
  `new WebSR({canvas,gpu,network_name,weights})` + `render(source)`, y `quality`/`6k` no
  son parámetros suyos. OTT Navigator además no ejecuta JS.
- **VPP/AI-PQ en este SoC:** los 6 levers devuelven `null` (`pq_ai_sr_enable`, `ai_sr_level`,
  `pq_sharpness_enable`, `pq_hdr_mode`, `ai_pq_mode`, `pq_dnr_enable`). No existen.
- **`wm size 3840x2160`:** `ro.surface_flinger.max_graphics_height=1080` es del build.
  Android compone a FHD y el panel escala; no se puede cambiar desde la app.

### RIESGO ABIERTO, detectado al medir

**La lista se está raspando desde 20 IPs de Azure/AWS** (una petición cada una, en una
noche). Es pública por diseño, pero aparecerá en agregadores. Cerrarla con token rompería
el acceso de OTT: **es una decisión del operador, no del agente.** Anotado, sin tocar.