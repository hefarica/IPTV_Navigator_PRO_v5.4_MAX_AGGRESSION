# APE CRYSTAL FLOW — Instrumentación: qué mide cada módulo y dónde se ve

> **Qué responde este documento.** *«¿Qué más queda por documentar que sea parte del
> APE CRYSTAL FLOW y su instrumentación?»* — y la pregunta que va detrás:
> **cuando algo va mal, ¿dónde miro?**
>
> **Censo real del repo (medido 2026-11-14):** 78 `.php` · 43 `.lua` · 29 `.json` ·
> 6 `.sh` del lado VPS; 66 `.kt` en la app; 11 `.kt` en el shim. **No todos son del
> flujo.** Este documento separa **lo que sirve al flujo** de **lo que no**, para que
> nadie tenga que adivinar dónde está la verdad.

---

## 0. La regla que hace útil la instrumentación

**Una métrica que no tiene dónde consultarse no existe.** Cada fila de las tablas de
abajo dice **qué mide**, **dónde vive** y **cómo se lee**. Si algo no se puede
leer con un comando, está marcado **NO COMPUTADO** y no se cuenta como cero.

---

## 1. Estación 1 · GENERADOR — instrumentación en el navegador

| Qué se mide | Dónde | Cómo se lee |
|---|---|---|
| Canales generados | `getAuditSummary()` del generador | consola del navegador |
| Canales eliminados (debe ser **0**) | idem | idem |
| Tiers F0–F5 por canal | `ape-fallback-resolver.js` | `getAuditSummary().tierBreakdown` |
| Probe real (manifest del canal) | `ape-quality-prober.js` | `window.APE_PROBER.lastResult` |
| Predicción AI (EWMA² + evidencia) | `predictive-prefetch-v9.js` | `window.APE_PREDICT` → `EVIDENCE=resource-timing` |
| Directivas por canal (**949**) | la propia `.m3u8` | `grep -c '^#EXT-X-APE-' canal.m3u8` |

**Estado honesto:** el generador emite `#EXT-X-APE-AI-PREDICT:…APPLIED=xXy,DECLARED=AxB`
— **`DECLARED` no es `APPLIED`**. El gate del flujo valida la **cabecera**, no el
contenido de las 949 directivas línea a línea: eso requiere el auditor de lista.

---

## 2. Estación 2 · CABLEADO — instrumentación en el VPS

| Qué se mide | Dónde | Cómo se lee |
|---|---|---|
| Cola del cableador | `vps/bin/ape-cablear-queue-worker.sh` | `journalctl -u ape-cablear-queue -n 50` |
| Progreso del cableado | `ape-cablear-auto.sh` | `/var/lib/ape/cablear-progress.json` |
| Índice id→nombre (**21.224**) | `ape-channel-index.sh` | `stat -c%s /var/www/html/prisma/db/channel_index.json` |
| Lista publicada (número más alto) | `ape-jit-latest.sh` | `ls -1 /var/www/html/lists/*_CABLEADA.m3u8 \| sort -t_ -k2 -rn \| head -1` |
| **Latencia del manifest** | `playlist_access.log` (`rt`/`urt`) | `grep 'GET /pulse/' … \| sed -E 's/.* rt=([0-9.]+).*/\1/'` |
| **Zapeo real** | idem | manifest p50 **704 ms** · p50 caché **1 ms** |
| Canales con `/pulse/` | la lista | `grep -c '/pulse/' lista.m3u8` → **21.224** |

**El log correcto importa:** las peticiones de `/pulse/` van a
**`playlist_access.log`** (formato `ape_playlist`, con `rt` y `urt`), **no** a
`access.log`. Medido: 2.929 vs 3. Ya provocó un bug real (`ape-last-channel.php`
devolvía `ok:false`); está fijado en el contrato y en el baseline.

---

## 3. Estación 3 · AGENTE — instrumentación en el dispositivo

| Qué se mide | Dónde | Cómo se lee |
|---|---|---|
| Arranque del sistema | logcat `ApeAgentService` | `FULL SYSTEM START dev=… token=set sync=on` |
| Servicios vivos (4) | `dumpsys activity services` | `grep -c ServiceRecord` → **4** |
| Settings aplicados (**12**) | logcat `ApeSettingsApplier` | `dumpsys deviceidle`-style: `grep -c 'APLICADO'` |
| Settings rechazados | idem | debe ser **1** (`display_size_forced`, geometría inmutable) |
| Puertos del shim | `/sdcard/Android/data/com.ape.crystalagent/files/port.txt` | `cat port.txt` |
| Estado del agente | `AraStatus` | último SSE, último zapeo, última directiva |
| Overlay montado | `dumpsys window windows` | `grep -c UpscaleBadge` → **3** con reproducción |
| **Foco (LEY #1)** | `dumpsys activity activities` | `grep mFocusedApp` → **debe ser el player, nunca ARA** |
| Canal en reproducción | `/prisma/api/ape-last-channel.php` | `{"ok":true,"name":"…","resolution":"3840x2160"}` |
| QoE del player | `QoEReporter.kt` | POST a `/prisma/api/qoe-flush.php` |

**NO COMPUTADO:** la **resolución de entrada** desde el dispositivo. OTT no publica
MediaSession y sin root no se puede leer el decoder de otra app. **Se mide en el VPS
con `ffprobe`** (implementado en `ape-last-channel.php`, verificado sobre el canal
`1312008` → `hevc / Main 10 / 3840x2160 / 50 fps`). Si el endpoint aún devuelve
`resolution: null`, el badge dice `entrada: N/D` — y eso es la verdad, no un fallo.

---

## 4. Estación 4 · SHIM — instrumentación del proxy loopback

| Qué se mide | Dónde | Cómo se lee |
|---|---|---|
| Salud del proxy | `ProxyService` | `printf 'GET /health…' \| nc 127.0.0.1 <port>` → `{"ok":true,"proxy_up":true}` |
| Reinicios | idem | `"restarts":0` |
| Uptime | idem | `"uptime_ms":…` |
| QoE del shim | `QoeEngine.kt` + `SegmentMeter.kt` | `"qoe_ready"`, `"rebuffer_detector_armed"` |
| Tráfico de vídeo visto | idem | `"proxy_media_seen"` |
| Techo de ancho de banda | `TokenBucket.kt` | `"ceilingBps":6000000` |
| Variante fijada | `AbrPolicy.kt` | logcat `AbrPolicy` |
| Catálogo servido | `LoopbackProxy` | `/source.m3u8` → **600.000 B en 1 s** |

**Verdad medida:** el shim **fija variante y mapea segmentos** en playlist de un
canal. Con catálogo multi-canal hace **passthrough** (no reescribe): su `Rewriter`
no termina con 22 M de líneas. **Ese límite está documentado, no es un fallo oculto.**

---

## 5. Estación 5 · MEDICIÓN — los endpoints del VPS

| Endpoint | Qué entrega | Estado |
|---|---|---|
| `/health` | salud de nginx | 200 |
| `/prisma/api/canary-resolve.php` | resolución canary | **302** (404/500 = fallo) |
| `/prisma/api/ape-last-channel.php` | canal + nombre + resolución real | 200 |
| `/prisma/api/ape-module-status.php` | estado del vigilante | **404** (no publicado) → SKIP en el gate |
| `/jit/playlist-calidad.m3u8` | catálogo JIT | 200/206 |
| `/lists/*_CABLEADA.m3u8` | lista cableada | 200/206 |
| `/pulse/<id>` | manifest por canal | 200 (o 403/407 **del proveedor**) |

**Vigilante de módulos** (`ape-module-watchdog.timer`, cada 60 s):
`/var/lib/ape/module-watchdog.json` → `{"verdict":"OK","fallos":0}` con 6 módulos:
`nginx-health · php-fpm · jit-catalogo · canary · pulse-canal · zapping`.
**Prueba por HTTP real, nunca por `systemctl is-active`.**

---

## 6. Los módulos que NO son del flujo (para que nadie los toque creyendo que sí)

**De los 78 `.php` y 43 `.lua` del repo, solo una parte está en la ruta del flujo.**
Los demás son de otras capas (LAB, JIT local, canary histórico, experimentos).
**Regla:** antes de tocar un módulo, comprobar que aparece en el `manifest.tsv` de
deploy **y** en alguna estación del contrato. Si no está en ninguno, **no es del flujo
y no se toca para «arreglar» el flujo**.

**Los 43 `.lua`:** el repo los tiene, **el VPS de producción ejecuta un subconjunto**
(medido en la auditoría del 2026-10-25: 26 en el repo, 14 en el VPS, **solo 4 en
común**). Es decir: **hay dos arquitecturas, no dos versiones.** El flujo desplegado
es el que manda; los `.lua` que no están en el VPS son **aspiracionales** y no se
cuentan como instrumentación.

---

## 7. Qué falta por documentar (lista honesta y cerrada)

| Tema | Estado | Dueño |
|---|---|---|
| **Contrato de operativa por estación** | ✅ `contracts/ape_crystal_flow_operativa.json` | este commit |
| **LEY #1 (segundo plano)** | ✅ en el contrato + gates | este commit |
| **Baseline congelado** | ✅ `docs/architecture/BASELINE_APE_CRYSTAL_FLOW_20261114.md` | commit `2784595c` |
| **La 4ª vía del salto a ARA** | ✅ cazada: `<intent-filter>` BROWSABLE/https | t69 |
| **Gate que vigila el intent-filter** | ✅ check [7][8] del gate estático | este commit |
| **Resolución de entrada del badge** | ⚠️ implementada en el endpoint, **pendiente de verificar en device** | abierto |
| **`versionCode` del árbol (657 vs device 669)** | ⚠️ **el device corre 669 con el fix; el árbol dice 657** | este commit |
| **Registro "Preferred Activities" residual** | ⚠️ **inerte** (probado); se borra con `pm uninstall` + instalación limpia | decisión del operador |
| **Auditoría línea a línea de las 949 directivas** | ❌ no existe; el gate solo valida la cabecera | abierto |
| **QoE perceptual del decoder** | ❌ no medible sin root; solo proxy-QoE de red | límite físico |
| **VPP/AI-PQ** | ❌ los 4 levers devuelven `null` en este firmware | límite de hardware |

---

## 8. Cómo se comprueba todo esto de una vez

```bash
# 1) El flujo sirve (HTTP real, ~5 s)
bash tools/quality/gate_ape_crystal_flow.sh

# 2) Nadie reintrodujo el robo de foco ni el intent-filter (estático, ms)
bash tools/quality/gate_no_focus_steal.sh

# 3) El contrato de operativa sigue siendo JSON válido y con sus 5 estaciones
python3 -c "import json;d=json.load(open('contracts/ape_crystal_flow_operativa.json'));print(len(d['estaciones']),'estaciones')"

# 4) El baseline no se movió (cada fila trae su comando)
sed -n '/## Cómo se mide/,/^---/p' docs/architecture/BASELINE_APE_CRYSTAL_FLOW_20261114.md
```

**Los dos gates están en el CI** (`ape-deploy-frontend.yml` corre el estático como
primer paso; `deploy-vps.yml` corre el del flujo dentro del VPS tras publicar).

---

## 9. Lo que este documento NO dice

- **No dice que el flujo esté completo.** Dice **qué se mide** y **qué no**.
- **No dice que el 4K se vea bien.** Dice que **se sirve**; el enlace del dispositivo
  es otro asunto (medido: ~18 Mbps necesarios).
- **No dice que OTT use la lista cableada por sí solo.** El alta del proveedor es
  manual por diseño de OTT.
- **No convierte en cero lo que no se pudo medir.** Todo lo no medido está marcado
  **NO COMPUTADO** con su razón.
