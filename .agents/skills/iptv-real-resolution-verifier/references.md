# references — iptv-real-resolution-verifier

Fecha: **2026-11-15**. Todo el contenido técnico de esta skill salió de **archivos
locales del repo**, leídos en modo lectura. No se clonó ni se instaló nada.

## 1. Fuentes internas leídas (con líneas)

| Archivo | Líneas leídas | Qué se tomó |
|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | 2689–2798 | `__apeStreamTruth()`: defaults, orden de resolución, override fake-UHD, `rawW/rawH`, familia, nivel |
| ídem | 12990–13069 | emisión E1 (13029) y E2 (13056); parámetros de entrada del truth |
| ídem | 9605–9659 | emisión E3 (MOTOR40, 9627) y E4 (bloque capacidad, 9658) |
| `tools/pulse/ape-pulse-wrap.js` | 148–184 | contrato del sidecar: `v.*` sólo desde STREAM-TRUTH; `w/h` sólo si `src` no es fake; **nunca HDR desde `pq=1`** |
| ídem | 435–474 | parseo real del tag (`truthKv`) |
| `IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-metapack.sh` | 1–55 | medición: "el STREAM-TRUTH solo toma **4 valores distintos** en 21.224 canales"; EXTHTTP con 214 claves (170 constantes, 44 variables) |
| `docs/audits/AUDIT_APE_LISTA_1794100720046_20261108.md` | ~58, 182–183, 274 | 21.224/21.224 declaran `RESOLUTION=5760x3240`; 6K/L6.1/60fps/35 Mbps sin una sola medición; `OBS_BPS=0` |
| `docs/cartography/APE_LISTA_523d52a6/01_STRUCTURE.md` | 405–449 | ejemplo literal de `#EXT-X-STREAM-INF` con `RESOLUTION=3840x2160,FRAME-RATE=30.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ` |
| `CLAUDE.md` | §Bitrate Fallback por Resolución | tabla BANDWIDTH/AVERAGE-BANDWIDTH por resolución |
| `docs/policies/ANTI_DEGRADATION_LAW.md` | 1–145 | Art. 6 (corregir metadato ≠ cambiar calidad), Art. 1/2/5/8/9/10 |
| `tools/pulse/test_extshimott_wrap.js` | 139, 144 | vectores existentes: `src=native-4k` y `src=fake-4k` |

## 2. Fuentes externas

| Fuente | Qué se tomó | Qué NO se copió |
|---|---|---|
| `freearhey/iptv-checker` — `README.md` (HTTP 200) | **Solo el concepto**: el `ffprobe` decide (`codec_name`, `width`, `height`, `r_frame_rate`, `bits_per_raw_sample`). Licencia **MIT** declarada | Cero código: ni el CLI, ni el modelo de resultados (`items[].status.metadata.streams[]`), ni la lista de códigos de error |
| `dearbulut/iptv` — `README.md` (HTTP 200) | **Solo la regla**: un canal sin observación concluyente se reporta `0`/"unchecked", nunca un número inventado. Licencia **MIT** declarada | Cero código, cero esquema JSON |

## 3. Correcciones a la premisa recibida

| Premisa del encargo | Medición | Corrección |
|---|---|---|
| El tag tiene forma `src=real\|fake-4k` | Hay **cuatro emisores** con vocabularios distintos (E1–E4) y al menos **10 valores** de `src` en el árbol | Documentado en §3–§4 de la skill |
| `src=real` significa fuente real | En E3 (línea 9626) `src=real` ⇔ `ancho declarado ≥ 3840` | **`src=real` NO es evidencia** |
| "un fake-4k 1920x1080" es detectable por `w`/`h` | El override fake-UHD reescribe `w/h` a 3840×2160 (2750–2752) | `w/h` **no** delatan el fake; hay que leer `src` |

## 4. Lo que NO se pudo verificar

| Afirmación | Estado | Razón |
|---|---|---|
| Que la lista servida (186 MB / 1,31 GB) contenga `src=fake-4k` en todos los canales | **NO COMPUTADO** | La lista de producción no está en este entorno; no se descargó |
| Cuántos canales tienen `src=probe` | **NO COMPUTADO** | Ídem |
| Resolución real de un canal cualquiera | **NO COMPUTADO** | Requiere `ffprobe` contra el proveedor; no se ejecutó (no se instala nada y no hay red autorizada en esta tarea) |
| Que `EXT-X-APE-STREAM-TRUTH` llegue al player en todos los reproductores | **NO VERIFICADO** | Es metadata que el player puede ignorar (RFC 8216 §6.3.1) |
