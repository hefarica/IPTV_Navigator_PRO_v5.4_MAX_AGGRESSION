# 00 · ÍNDICE MAESTRO — APE CRYSTAL FLOW

> **Qué es este documento.** La puerta de entrada. Une los cinco documentos de parte en un
> solo recorrido, dice **qué está medido y qué no**, y señala las contradicciones en vez de
> elegir un lado. Si solo vas a leer un fichero de `docs/sistema/`, que sea este; si vas a
> tocar algo, lee primero la parte que te toque.

**Ámbito:** documentación. Este índice **no modifica** los documentos de parte. Los errores
encontrados se reportan aquí (§9, §10).

---

## 1 · Qué es APE CRYSTAL FLOW

Un sistema que **toma una fuente IPTV ajena y la sirve a un reproductor de terceros con
metadata enriquecida**, midiendo lo que ocurre en el camino. En concreto: un generador web
(IPTV Navigator) emite una lista `.m3u8` con ~950 líneas de metadata por canal; el VPS la
sirve; el dispositivo la descarga; el reproductor (OTT Navigator) pide cada canal a
`/pulse/<id>`; un PHP del VPS resuelve el upstream del proveedor y devuelve el manifest; una
APK instalada en el dispositivo mide lo que ve y publica telemetría; y con esa telemetría un
operador (humano o LLM) ajusta la siguiente vuelta.

**Lo que NO hace, y conviene decirlo antes de leer nada más:**

- **No transporta vídeo.** El VPS sirve listas y rebasa URLs; los segmentos van del proveedor
  al reproductor. No hay transcodificación en el camino del player.
- **No mejora los píxeles.** En este dispositivo el post-proceso de imagen por Settings **no
  existe** (§5, fila VPP): 11 de 13 claves no están en el SoC. El "realce" que llega a la
  pantalla es el modo del televisor + la metadata del manifiesto.
- **No controla a OTT Navigator.** Es un player de terceros: su parser no está en este repo y
  solo se conoce por comportamiento medido.
- **No es autónomo.** El bucle se cierra con una decisión humana (o de un LLM) sobre la
  telemetría; el sistema no se recalibra solo.

---

## 2 · Las partes, con su documento

Los cinco documentos de parte están medidos con `sha256` real (§10). Todos siguen el mismo
contrato: cada afirmación lleva `archivo:línea` o comando, y lo que no se pudo medir está
marcado `NO COMPUTADO` con su razón.

| # | Parte | Documento | Qué contiene |
|---|---|---|---|
| 1 | **IPTV NAVIGATOR** (generador + UI) | [`01_IPTV_NAVIGATOR.md`](01_IPTV_NAVIGATOR.md) | Qué es la UI, los ~190 scripts y su orden de carga, el generador y su punto de entrada, los 6 tiers F0–F5, los 12 perfiles P0–P5, el panel de salidas y el contrato LIGHT, `APE_PREDICT` |
| 2 | **LA APK** (agente en el dispositivo) | [`02_APK.md`](02_APK.md) | Identidad (`com.ape.crystalagent`, versionCode 674), 89 fuentes por responsabilidad, servicios y ciclo de vida, qué mide y qué publica, los 6 endpoints que **no** existen en su árbol, el operario LLM embebido, los tres `.tflite` |
| 3 | **OTTSHIM + /pulse/** (la cadena de reproducción) | [`03_OTTSHIM_Y_PULSE.md`](03_OTTSHIM_Y_PULSE.md) | Qué es `#EXTSHIMOTT`, quién lo honra y quién lo ignora, `/pulse/` como ruta, la cadena completa de una reproducción, el bug del SSL **corregido de línea**, el wrapper `ape-pulse-wrap.js` y su flag pegajoso |
| 4 | **EL VPS** (nginx, PHP, JIT, systemd) | [`04_VPS.md`](04_VPS.md) | El hierro, nginx y **sus tres logs** (el punto que ya provocó una conclusión falsa), el censo real de endpoints PHP, el JIT y su `loadMap()`, systemd, el pipeline de listas y los defectos con su estado |
| 5 | **LAS LISTAS** (anatomía y qué lee el APK) | [`05_LISTAS.md`](05_LISTAS.md) | Las 14 listas servidas, la anatomía línea por línea, **qué lee el APK de verdad**, la proyección por perfiles, el modelo LIGHT y por qué pesa 250 MB y no 1,3 GB, el 6K con fallback, RESOLUTION declarado vs real |
| 6 | **EL OPERADOR LLM** | (sin documento propio) → §6 de `02_APK.md`, §6 de `01_IPTV_NAVIGATOR.md` | El operario LLM embebido en la APK y los logs de decisión (`/var/lib/ape/6k-premium.jsonl`) |
| 7 | **LOS CONTRATOS** | repartidos: `01_IPTV_NAVIGATOR.md` §6 (LIGHT) · `05_LISTAS.md` §3 (qué lee el APK) · `ara-x/spec/actuator_allowlist.json` | El contrato LIGHT (`{canalesMin:1, plantillas:9, apeEnCuerpo:0}`), el contrato de lectura del APK (4 ramas) y la allowlist de actuadores |

> **Cómo está encadenada la evidencia — leer antes de citar este índice.**
> Las citas de **código** (`archivo:línea` de `.kt`, `.php`, `.js`, `.sh`) **proceden de los
> documentos de parte**, que las leyeron y las marcaron como `[CÓDIGO]`. **Este índice no las ha
> re-verificado línea a línea.** Lo que sí he comprobado yo, directamente, es: el `sha256` y el
> tamaño de los cinco documentos (§10), la existencia de los 17 ficheros de `docs/sistema/`, y las
> citas concretas de `04_VPS.md`, `02_VPP_TRES_CAPAS.md`, `05_LISTAS.md`, `02_APK.md`,
> `01_APK_INVENTARIO.md`, `01_ARQUITECTURA_Y_HUECOS.md` y `02_VPS_INVENTARIO.md` que aparecen en la
> tabla de verdad (releídas en esos ficheros, no copiadas de un resumen).
> **Si una cita de código es lo que sostiene tu decisión, abre el fichero.** Un índice no es una
> fuente; es un mapa de fuentes.

> **El operador LLM es la única parte sin documento propio.** Se documenta por partes en los
> dos sitios citados; no hay un `06_OPERADOR.md`. Está declarado en §8 como hueco, no escondido.

---

## 3 · Mapa de flujo end-to-end

Doce saltos. Cada uno con el fichero que lo implementa y su documento de referencia.

```
 (1) operador pulsa "generar"
      └─ IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html  (botón → btnGenerateAudited)
 (2) IPTV NAVIGATOR construye la lista
      └─ frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
         + ape-fallback-resolver.js · ape-quality-prober.js · ape-hevc-cascade.js
 (3) sale el .m3u8  (≈950 líneas/canal: EXTINF · EXTHTTP · EXTVLCOPT · KODIPROP · STREAM-INF + URL directa)
 (4) subida y publicación en el VPS
      └─ /var/www/lists/*.m3u8   |   nginx: /etc/nginx/sites-enabled/default:156  (location \.m3u8$)
         nota: /var/www/html/lists es SYMLINK → /var/www/lists
 (5) el dispositivo descarga la lista
      └─ OTT Navigator (tercero). El APK propio tiene SU parser: ListLoader.kt:57-98
 (6) el reproductor pide un canal:  GET /pulse/<id>.m3u8?u=<urlencoded>&d=<device>
      └─ la URL la emite el generador; el wrapper la construye en ape-pulse-wrap.js:356-359
 (7) el VPS resuelve el upstream
      └─ IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/pulse.php   (786 líneas)
         ⚠ :142-143 y :549-550  CURLOPT_SSL_VERIFYPEER=false / VERIFYHOST=0  (MITM abierto)
 (8) el proveedor responde el manifest al VPS   →  el VPS lo devuelve al player
 (9) la APK mide y publica
      └─ ScreenCaptureService.kt:93 (gapMs) · AgentService.kt:327/:360 (ape-last-channel)
         · FeedForwardClient.kt:53 (ape-feedforward-stream) · QoEReporter.kt:187 (conviva-event)
 (10) el operador LLM decide
      └─ logs de decisión: /var/lib/ape/6k-premium.jsonl:43   ·   gate: ape-6k-premium.sh:162-166
 (11) se mueven las perillas
      └─ SettingsApplier (allowlist de 42 claves) · ape-feedforward-stream.php:95 (APE_4K_BRIDGE_ENABLED)
         · cadencia del panel (50 Hz) · metadata del manifiesto (Canal 1)
 (12) la próxima vuelta  →  vuelve a (2) con la metadata recalculada
```

**Tres precisiones que el dibujo no captura:**

- **El salto (5) es el que más se malinterpreta.** OTT Navigator es de terceros: no está en
  este repo. Lo único que sabemos de su parser es **comportamiento medido** — ignora
  `#EXT-X-APE-*` (RFC 8216) e `#EXTVLCOPT:` (son de VLC). Ver §5, filas LIGHT y URL2.
- **El salto (8) es el único donde hay vídeo.** Todo lo demás es texto y decisión.
- **El bucle (10)→(12) es el único punto de aprendizaje**, y es humano/LLM: el sistema no se
  recalibra solo.

---

## 4 · El estado real medido HOY — el dato más importante

> **El dispositivo consume una lista pulseada SIN la proyección LIGHT.**

Medido en `04_VPS.md:335` (defecto **D-6**): *«La lista real NO lleva la proyección LIGHT —
**MEDIDO:** 21.224 canales, 21.224 vía `/pulse/`, **0 plantillas de perfil, 0 `#EXTSHIMOTT`**»*.

**Qué significa, sin adornos:** todo el trabajo de proyección LIGHT —el modelo de 250 MB en
vez de 1,3 GB, el `LIGHT_POOL_MAX=512`, el `ape-list-light.sh` con su `fail-closed`— **no está
en el camino del dispositivo**. La lista que OTT Navigator descarga es la variante pulseada
completa. El sistema **produce** una proyección que el dispositivo **no consume**.

| | El sistema PRODUCE | El dispositivo CONSUME |
|---|---|---|
| Fichero | `..._CABLEADA_LIGHT.m3u8` (existe, con su contrato `{canalesMin:1, plantillas:9, apeEnCuerpo:0}`) | la variante pulseada **sin** LIGHT |
| Plantillas de perfil | 9 (contrato) | **0** |
| `#EXTSHIMOTT` | presente en la LIGHT | **0** |
| Evidencia | `01_IPTV_NAVIGATOR.md` §6 · `05_LISTAS.md` §5 | `04_VPS.md:335` (D-6) · `04_VPS.md:150` |

**Y un agravante que hay que leer junto:** `04_VPS.md:332` (**D-3**, ABIERTO) — el fichero
`/lists/APE_LISTA_1794100720046.m3u8` **mide 8 bytes** (un stub); lo que se sirve de verdad por
HTTP es la variante de `/var/www/lists/pulse/` (**1.311.467.322 B**, `05_LISTAS.md:392`).
Los dos ficheros que se llaman igual **no son el mismo**.

> **Nota de nomenclatura.** El encargo llama a este estado `PULSE_PROXIED + PULSE_ONLY`. Esos
> dos tokens **no aparecen ni una vez** en los cinco documentos de parte (barrido ejecutado:
> 0 ocurrencias). El **hecho** está medido y documentado en `04_VPS.md:335`; las **etiquetas**
> son del encargo. Se separan para que nadie cite una etiqueta como si fuera una medición.

---

## 5 · Tabla de verdad: REAL / ASPIRACIONAL / DESCARTADA

Por cada afirmación importante del sistema. Si no encaja en REAL, se dice **por qué**.

| Pieza / afirmación | Veredicto | Evidencia |
|---|---|---|
| **`loadMap()` del JIT** ya no reparsea el JSON en cada petición | ✅ **REAL — arreglado y desplegado** | `04_VPS.md:330` (D-1): `/opt/ape-jit/server.js` = `38c92b56…` con `_mapCache` ×6. Antes: `JSON.parse(fs.readFileSync(...))` por petición (`04_VPS.md:184`) |
| **Los tres `.tflite` son redes neuronales** | ❌ **DESCARTADA** | `02_APK.md:200-210`: 1.484–1.676 B con magic `TFL3` **válido**, pero «no es un modelo». `01_APK_INVENTARIO.md:216-218`: «pesos fijos **baseline**, **no** red entrenada» |
| **VPP / AI-PQ por Settings** (`pq_ai_sr_enable`, `ai_sr_level`, …) | ❌ **DESCARTADA en este SoC** | `02_VPP_TRES_CAPAS.md:52-66`: 11 de 13 claves con `ns = —` → «**no está en `null`: no está**». `:75`: «no tiene camino» |
| **VPP por `tvserver`/DroidLogic (Amlogic)** | ⛔ **NO ALCANZABLE** en esta build | `02_VPP_TRES_CAPAS.md:128`: `/sys/class/amvecm` existe pero `ls` → Permission denied (SELinux) y **no hay módulo `amvecm`/`amvpp`** en `/proc/modules` |
| **6K** (`TARGET=5760x3240`) | ⚠️ **ASPIracional: presentación, no decodificación** | `05_LISTAS.md:356,362,421`: se declara 5760x3240 con fuentes medidas de **360–2160 px**; el propio tag lo dice: `EVIDENCE=host_profile_estimate` |
| **RESOLUTION declarado = resolución real** | ❌ **DESCARTADA como igualdad** | `05_LISTAS.md:362`: «se declara 5760x3240 y las fuentes medidas llegan a 1080 en el 52,6 %» |
| **La proyección LIGHT llega al dispositivo** | ❌ **DESCARTADA hoy** | `04_VPS.md:335` (D-6): 0 plantillas, 0 `#EXTSHIMOTT` |
| **`#EXT-X-APE-*` influye en OTT Navigator** | ❌ **DESCARTADA** | `05_LISTAS.md` §3 + RFC 8216: el player ignora etiquetas desconocidas. `05_LISTAS.md:148` (I-1): `server.js:504` los pone en los «reads» de OTT **sin evidencia** |
| **`#EXTVLCOPT` (2,9 M líneas, filtros ffmpeg) mejora la imagen en OTT** | ❌ **DESCARTADA** | Son opciones de **VLC**. Ningún player Android las lee |
| **Overlay para procesar el frame de OTT** | ❌ **CERRADA** | `02_VPP_TRES_CAPAS.md:130`: `SYSTEM_ALERT_WINDOW = granted FALSE` |
| **Efectos GL del player propio** | ❌ **ROTO, medido** | `02_VPP_TRES_CAPAS.md:131`: `effects=on` → PNG de 16.280 B (negro) vs 1.694.782 B con `off` |
| **Cadencia del panel a 50 Hz** | ✅ **REAL — funciona** | `02_VPP_TRES_CAPAS.md:132`: `mActiveModeId=125`, `renderFrameRate 50.0` |
| **HDR passthrough** | ✅ **REAL** | `02_VPP_TRES_CAPAS.md:134`: `hdr_conversion_mode=1` (PASSTHROUGH) |
| **Metadata del manifiesto (Canal 1)** | ✅ **REAL — es lo que OTT consume** | `02_VPP_TRES_CAPAS.md:133,136`: «las dos vías vivas son el Canal 1 y la cadencia del panel» |
| **Motor Rust `:8084` + 5 fases Lua (`shield-location.conf`)** | ❌ **DESCARTADA en este VPS** | `02_VPS_INVENTARIO.md:622`: «no hay unit ni fichero que lo declare vivo». Coincide con `CLAUDE.md` (D-25/D-32). **La skill/doctrina que lo describe es aspiración, no despliegue** |
| **Los 10 endpoints que la APK «usa»** | ⚠️ **3 reales, 6-7 AUSENTES** | `02_APK.md` §5: verificables `AgentService.kt:327,:360`, `FeedForwardClient.kt:53`, `QoEReporter.kt:187`. Ausentes: net-shield-status, adb-quality, netshield-sentinel, prisma-health, adb-telemetry, telemetry-full |
| **«0 de 8 APIs prohibidas»** | ✅ **REAL en código** — pero un `grep` ingenuo dice lo contrario | `02_APK.md` §2: `FileOutputStream(`, `Runtime(`, `ProcessBuilder(`, `PackageManager(` dan ocurrencia **en el comentario L11-13 que documenta su ausencia**. Quien no lea contexto concluirá lo contrario |

---

## 6 · Defectos abiertos

| ID | Defecto | Severidad | Archivo:línea | Estado |
|---|---|---|---|---|
| **D-3** | `/lists/APE_LISTA_1794100720046.m3u8` sirve un **stub de 8 B** | **ALTA** | `04_VPS.md:332` | **ABIERTO** |
| **D-6** | La lista real **no lleva la proyección LIGHT** (0 plantillas, 0 `#EXTSHIMOTT`) | **ALTA** | `04_VPS.md:335` | **ABIERTO** |
| **D-2** | Rutas relativas `/prisma/api` fallan en localhost (`validateLight()`) | MEDIA | `01_IPTV_NAVIGATOR.md:308` | declarado |
| **SSL** | `CURLOPT_SSL_VERIFYPEER=false` y `VERIFYHOST=0` en el proxy del manifest → **MITM abierto** | **ALTA (seguridad)** | `vps/prisma/api/pulse.php:142-143` y `:549-550` | **ABIERTO** |
| **`curHasDecl`** | Flag **pegajoso** en el wrapper: a partir del primer canal con `#EXT-X-APE-ENHANCE-STATE`, **ningún canal posterior recibe las 8 declaraciones** | **ALTA** | `ape-pulse-wrap.js:440` (decl), `:470` (activa), `:456-457` (reset sin contemplarlo), `:510` | **ABIERTO** |
| **`counters.declared`** | Suma **1 por canal** escribiendo **8** → subestima ×8 | MEDIA | `ape-pulse-wrap.js:510` | **ABIERTO** |
| **`r:2048`** | Se emite en el tag del device y **`pulse.php` nunca lo lee** | BAJA | `pulse.php:232-241` | ABIERTO |
| **I-1** | `server.js:504` declara `KODIPROP`/`EXTATTRFROMURL` en los «reads» de OTT **sin evidencia** | MEDIA (honestidad de la lista) | `05_LISTAS.md:148` | **ABIERTO** (no se edita: fuera de alcance) |
| **GAP-03** | El bloque `ape_vpp` **no viaja** en el SSE que consume el APK | MEDIA | `ara-x/spec/actuator_allowlist.json` → `open_gaps` | declarado |
| **GAP-04** | Los 13 levers VPP sólo llegan con `APE_4K_BRIDGE_ENABLED=1` (**default OFF**) | MEDIA | `ape-feedforward-stream.php:95` | declarado |
| **Capturador** | **No** hay limitador de 500 ms verificado; `gapMs > 1_500L` sólo **registra** | MEDIA | `ScreenCaptureService.kt:93` | `NO COMPUTADO` |
| **Disco** | Estuvo al **91 %** mientras el vigilante decía OK; hoy 89 % (4,2 G libres) | MEDIA | `04_VPS.md` §1 | vigilado por gate >90 % |

---

## 7 · Contradicciones entre documentos de parte

Cuando dos documentos discrepan, **aquí se dice**; no se elige uno en silencio.

### C-1 · VPP: «no existe» vs «existe pero nunca se envió» — **RESUELTA**

| Documento | Qué dice |
|---|---|
| `01_ARQUITECTURA_Y_HUECOS.md:92` | *«`pq_ai_sr_enable = null` en el ONN **no significa «el chip no lo tiene». Significa que nunca se envió»*** |
| `02_VPP_TRES_CAPAS.md:3` | *«He dado tres diagnósticos sobre el mismo síntoma y los tres son ciertos, pero incompletos hasta hoy. **Esta es la versión final**»* |
| `02_VPP_TRES_CAPAS.md:66` | *«`ns = —` significa que la clave **no existe en `global` ni en `secure`**. No está en `null`: **no está**»* |

**Veredicto: gana `02_VPP_TRES_CAPAS.md`** (se autodeclara final y aporta sondeo directo en el
aparato). Las otras dos capas (GAP-03/GAP-04 y la allowlist) **son ciertas pero insuficientes**:
arreglarlas «sería trabajo correcto que no produce ningún píxel» (`:77`).

**Por qué importa:** quien lea solo `01_ARQUITECTURA_Y_HUECOS.md` concluirá que basta con
encender el puente y añadir los levers. Es falso. El defecto real es que **el SoC no expone esas
claves**.

### C-2 · Qué es la lista «real»: 8 bytes vs 1,3 GB — **NO es contradicción, es el mismo nombre para dos ficheros**

`04_VPS.md:332` (D-3) dice que `/lists/APE_LISTA_1794100720046.m3u8` mide **8 B**; `05_LISTAS.md:392`
dice que se sirven **1.311.467.322 B**. Los dos son ciertos: en disco hay un **stub de 8 B** y la
variante de `/var/www/lists/pulse/` es la grande. **Coincide con lo que el índice de cableado
reportó** (`bytes: 8` en el listado, con `bytes_gz: 352.103.394`).

---

## 8 · Qué NO está documentado y por qué

| Hueco | Por qué no está |
|---|---|
| **El operador LLM** como parte autónoma | No tiene documento propio: se describe por partes en `02_APK.md` §6 y `01_IPTV_NAVIGATOR.md` §6. **Es el hueco estructural más grande del corpus** |
| **El parser de OTT Navigator** | Es software de terceros: no está en el repo. Solo se conoce por comportamiento medido |
| **El efecto en pantalla del desajuste de cadencia** | Medido el desajuste (50 fps vs 59,94 Hz) y medido el modo correcto; **no verificado en reproducción real** (`01_IPTV_NAVIGATOR.md:321`) |
| **El limitador del capturador** | El umbral citado (`gapMs > 1_500L`) **registra**, no limita a 500 ms: `NO COMPUTADO` (`02_APK.md` §8) |
| **6-7 endpoints que la APK «usa»** | No existen en el árbol de la APK: `NO COMPUTADO` de dónde salieron (`02_APK.md` §5) |
| **Los 8 logs muertos del VPS** (`iptv-ape.*`, `iptv_intercept*`, `shield*`, 0 B) | No son fuente de evidencia: 0 B desde enero-junio 2026 (`04_VPS.md` §2) |
| **`conviva-event` en el censo de endpoints** | No salió en el corte medido (el log crece en vivo): `NO COMPUTADO` con su comando (`04_VPS.md` §3) |
| **El primer segmento de vídeo** | El segundo salto devolvió 0 bytes el día de la medición (`03_OTTSHIM_Y_PULSE.md` §11) |

---

## 9 · Cómo reproducir cualquier medición

```bash
# ── VPS: los TRES logs (leer el equivocado ya provocó una conclusión falsa)
ssh hetzner-iptv 'wc -c /var/log/nginx/access.log /var/log/nginx/playlist_access.log /var/log/nginx/playlist_error.log'
ssh hetzner-iptv "grep -o 'GET /[^ ]*' /var/log/nginx/playlist_access.log | sed 's/?.*//' | sort | uniq -c | sort -rn | head -22"

# ── VPS: disco (el gate falla por encima del 90 %)
ssh hetzner-iptv 'df -h /'

# ── La lista: ¿es LIGHT de verdad?  (0 = LIGHT real ; >0 = LIGHT a medias o completa)
grep -c '^#EXT-X-APE-' /var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8

# ── El JIT: ¿tiene la caché del loadMap?
ssh hetzner-iptv "grep -c '_mapCache' /opt/ape-jit/server.js"

# ── El wrapper: el flag pegajoso en acción
node tools/pulse/test_ape_pulse_wrap.js

# ── APK: los tres .tflite (tamaño = la prueba, no hay marca en el código)
ls -l IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/assets/*.tflite

# ── Device por adb: VPP, cadencia y overlay
adb -s 192.168.1.3:5555 shell settings get secure match_content_frame_rate
adb -s 192.168.1.3:5555 shell dumpsys display | grep -E 'mActiveModeId|renderFrameRate|mDefaultModeId'
adb -s 192.168.1.3:5555 shell settings get global pq_ai_sr_enable     # vacío = la clave NO existe

# ── Los gates del sistema
bash tools/quality/gate_no_focus_steal.sh
bash tools/quality/gate_ape_crystal_flow.sh
node frontend/tests/ape-predictive-prefetch.test.js      # 43 PASS / 0 FAIL
```

---

## 10 · Inventario de `docs/sistema/` y por qué hay más de cinco documentos

`ls -la docs/sistema/` devuelve **17 ficheros**. Los cinco de parte son la **serie canónica** de
este esfuerzo; el resto son artefactos de sesiones anteriores o de otros encargos. **Hay
numeración duplicada** (`01_`, `02_`, `03_`, `04_` y `05_` existen dos veces cada uno), lo que
es una trampa para quien llegue nuevo: aquí queda dicho cuál es cuál.

### La serie canónica (medida ahora)

| Fichero | Bytes | Líneas | sha256 |
|---|---:|---:|---|
| `00_INDICE.md` (este) | — | — | — |
| `01_IPTV_NAVIGATOR.md` | 24.464 | 351 | `4df16122aee1bfd21a54c43c9d696aaf4119d60edf90aa9e8816d363bbd2abb1` |
| `02_APK.md` | 23.786 | 267 | `51956d1d70cd1379a29008277b0ee6a615e2290034dec94acdf6d69ce05074bb` |
| `03_OTTSHIM_Y_PULSE.md` | 26.646 | 391 | `567d1c75cca148998be44f7119b15df5cb7e0fc62798023910407cf66a5491ec` |
| `04_VPS.md` | 22.463 | 358 | `ebb7b4a5e7ea83fa9e2f4e1e94ecd33acf9798c01d88c4ffbc6e6d40c5a96912` |
| `05_LISTAS.md` | 28.991 | 422 | `acbd462bc9341d957cbed5aa94f376e2daefc33a495786a3ff78e1c7a84429e7` |

> **Discrepancia de conteo, señalada:** los informes de entrega de t92 decían que
> `03_OTTSHIM_Y_PULSE.md` tiene **293 líneas**; la medición da **391**. El `sha256` coincide con
> el que declaró t92, así que **el fichero es el mismo**: lo que no cuadra es el conteo de líneas
> del informe, no el contenido.

### Los otros 10 ficheros (no son la serie de parte)

| Fichero | Qué es |
|---|---|
| `01_APK_INVENTARIO.md` (70.376 B) | Inventario previo y más extenso de la APK. **Útil como fuente; no es la parte 2** |
| `01_ARQUITECTURA_Y_HUECOS.md` (6.937 B) | Los tres huecos de arquitectura. Contiene la **capa 1+2** del diagnóstico VPP (superada por `02_VPP_TRES_CAPAS.md`, ver C-1) |
| `02_VPP_TRES_CAPAS.md` (7.843 B) | **El documento VPP definitivo.** Aquí vive la medición que cierra el caso |
| `02_VPS_INVENTARIO.md` (39.122 B) | Inventario previo del VPS. Contiene la prueba de que el motor Rust `:8084` **no existe** |
| `03_CADENA_POLIMORFICA.md` (6.673 B) | Cadena polimórfica y censo de canales de metadata (2026-11-13) |
| `04_FIX3_SELECCION_VARIANTE.md` (6.023 B) | El único mecanismo que consigue la máxima resolución real |
| `05_WORKFLOW_SISTEMA.md` (16.332 B) | Workflow previo del sistema y cómo se comprueba |
| `06_JUDDER_MEDIDO_36_SESIONES.md` (6.383 B) | Judder medido en 36 sesiones reales |
| `07_FALSIFICACION_CADENCIA_NO_ES_LA_CAUSA.md` (5.004 B) | Falsación: el judder **no** lo causa la cadencia del panel |
| `capabilities_ONN4K.json` (18.694 B) | Volcado de capacidades del device (783 líneas). Dato, no documento |

**Regla para el lector:** si el nombre empieza por `0N_` y su contenido coincide con el de la
tabla canónica de arriba, es de esta serie. Si no, es material previo **que puede contradecir a
la serie** (el caso C-1 es el ejemplo) y hay que comprobar cuál es más reciente antes de citarlo.

---

## 11 · Regla para no volver a perder el norte

1. **Un número sin comando no es un número.** Cada fila de la tabla de verdad tiene su
   `archivo:línea`; si no lo tiene, está en `NO COMPUTADO`.
2. **«Declarado» no es «aplicado».** La lista declara `RESOLUTION=5760x3240` y las fuentes
   llegan a 2160 px. La diferencia entre las dos cosas es el trabajo de este corpus.
3. **El sistema produce más de lo que el dispositivo consume.** Hoy: LIGHT producida, LIGHT no
   consumida (§4). Antes de optimizar algo, comprobar que está **en el camino**.
4. **Cuando dos documentos discrepen, gana el que mide** — y si no se puede decidir, se dice
   «INDECIDIBLE» en vez de elegir.
