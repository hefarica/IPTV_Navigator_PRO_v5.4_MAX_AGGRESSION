# 30 · Realtime Engine v10 + Crystal UHD por perfil (t63)

**Fecha:** 2026-10-29 · **Tarea:** t63 · REPO-ONLY: sin deploy, sin publicar lista, sin commit.
**Generador:** `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` · 12.113 → **12.671 líneas** (+558) · sha256 **`098399226831c01f442eb7061003154d55053f2f1115e66215d51b9aecd34f92`**
**Wrapper:** intacto == HEAD · **legacy `#EXTATTRFROMURL:X-APE`: 54** (sin tocar).

## 1. Qué se inyectó (aditivo, del skill `iptv-realtime-engine-integrator`)

| Pieza | Dónde | Efecto |
|---|---|---|
| Módulo `ApeRealtimeEngine` v10 (499 líneas, tal cual del skill) | antes del cierre del IIFE | expone `window.ApeRealtimeEngine`; guard propio `__APE_REALTIME_ENGINE_v10__`; `init()` **sólo loguea** (verificado: no depende del ProfileManager) |
| **Punto A** — `injectHeaders(_httpPayload, profile, stream_id)` | justo antes de `JSON.stringify(_httpPayload)` | añade **CMCD** (`CMCD-Object/Request/Session/Status`, RFC 9000), **QoE** (`X-QoE-Startup-Target-Ms`, `-Rebuffer-Ratio-Target`, `-Monitor`…) y config de player (`X-HLSjs-Config`) al `#EXTHTTP` |
| **Punto B** — `injectVlcopt(lines, profile)` | antes de `lines.join()` y del reorden t60/t61 | añade los `#EXTVLCOPT` del perfil (idempotente: no duplica) |
| **Punto C** — `window.__APE_ACTIVE_PROFILE__` | mismo bloque | expone el perfil activo (equivalente al punto C del skill) |

Todo va en `try/catch` y con guard de existencia: si el motor no está, el bloque sale byte-idéntico a como estaba.

## 2. `network-caching` por perfil — con regla de precedencia declarada

Medido **sin LAB** (fallback): **P0 90000 · P1 60000 · P2 45000 · P3 30000 · P4 20000 · P5 10000** — coincide con la tabla del skill.

**Precedencia (importante):** el generador ya emitía `network-caching` con valor **plano 60000** de fallback (`_buf796` = LAB → `CAPACITY_OVERDRIVE.buffer_ms` → 60000). El motor es idempotente (no pisa claves existentes), así que la tabla **no aplicaba**. Se añadió una regla explícita:
- **Si el LAB aportó el valor** (`_labBufMs` válido) ⇒ **no se toca** (doctrina `iptv-lab-ssot-no-clamp`).
- **Si el generador está en el fallback** ⇒ se aplica la tabla del motor, **ajustando el valor de la línea existente** (no se borra ninguna línea).

## 3. Crystal UHD — intensidad VPP por perfil (metadata, sin píxeles)

```
#EXT-X-APE-CRYSTAL-UHD:PROFILE=<P0-P5>;VPP_INTENSITY=<n>;SCOPE=DISPLAY;PIXELS=0
```

| Perfil | P0 | P1 | P2 | P3 | P4 | P5 |
|---|---|---|---|---|---|---|
| VPP_INTENSITY | 40 | **35** | 45 | 55 | 70 | **85** |

Criterio: **cuanto peor es la fuente, más ayuda necesita el display** ⇒ P5 (SD) **85 > P1 (4K) 35**. Una sola línea por canal (idempotente). `PIXELS=0` + `SCOPE=DISPLAY` declaran que la playlist **no toca píxeles**: sólo dice al daemon/ARA qué intensidad aplicar.

## 4. Medición (fixture P0-P5)

| Comprobación | Resultado |
|---|---|
| `node -c` ×3 | **exit 0** |
| CMCD / QoE / hlsjs en `#EXTHTTP` | presentes en **6/6** perfiles |
| `network-caching` | 90000 / 60000 / 45000 / 30000 / 20000 / 10000 |
| Crystal VPP | P5 85 > P1 35 ✔ |
| Estructura | `#EXT-X-STREAM-INF` = 1, **seguido inmediatamente de la URI** (orden t61 intacto) |
| Integridad P1 | líneas 903 · legacy **54** · `/a` 1 · URLs 1 · `EXTVLCOPT` 126 · `KODIPROP` 86 · `EXTHTTP` 1 · `EXTINF` 1 · sin BOM |

## 5. Dos tensiones con el enunciado que declaro (no las maquillo)

1. **«sin crear 4K/8K falsos»**: el árbol **ya** los crea desde t60/t61 (todo `STREAM-INF` declara `RESOLUTION=3840x2160` + `hvc1.2.4.L153.B0`). t63 **no los creó ni los quitó**: no era su alcance. Si se quiere revertir, es otra tarea.
2. **«no declarar codec que el decoder no soporta»**: t60/t61 declaran HEVC sobre canales que pueden ser AVC. **Sigue vigente y sigue siendo un riesgo real** (FZ-01), no algo que t63 haya resuelto. Lo que sí se respeta: el 8K va marcado `NEVER_REAL=1` y **no** se declara `RESOLUTION=7680x4320` salvo `APE_8K_DECLARE`.

## 6. NOT_RUN

1. **Lista de 10.520 no regenerada ni publicada** (ventana aparte).
2. **Con LAB cargado**, `network-caching` será el del LAB (por diseño); la tabla del motor sólo actúa en fallback. No se midió contra el LAB real.
3. **Sin prueba en dispositivo**: CMCD/QoE los consumen hls.js y analizadores web; TiviMate/VLC nativos los ignoran. La intensidad VPP sólo la materializa el daemon/ARA, que no se probó.
4. Sin deploy; `_vps_stage/**`, DB y listas intactas; **sin commit**.
