# 18 · FIX — 568.080 líneas `#EXTATTRFROMURL` inválidas (X-APE-*) en la lista publicada

**Fecha:** 2026-10-28 · **Tarea:** t51 (urgente, repo-only) · **Archivo:** `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`
**Contexto:** ver [`15_EXTATTRFROMURL_GENERATOR.md`](15_EXTATTRFROMURL_GENERATOR.md) (emisión de la línea válida, t48).

## 1. Qué estaba mal

El tag `#EXTATTRFROMURL` es, para OTT Navigator, **un tag cuyo valor es una URL** (`/a/2/{c}/{s}/{p}/{payload}/{h}`). El generador lo usaba como **contenedor de pares `key=value`** en el bloque L7:

```
#EXTATTRFROMURL:X-APE-SID=…   #EXTATTRFROMURL:X-APE-LCEVC=4   #EXTATTRFROMURL:X-APE-DRM=widevine_L1   … (54 líneas)
```

Consecuencias medidas: **54 × 10.520 canales ≈ 568.080 líneas** en la lista publicada que **no son URLs**; el player puede intentar resolverlas como tales, y la única URL real (`/a/2/…`) quedaba **enterrada** entre ellas. Es uso indebido del mecanismo, no un problema cosmético.

## 2. Qué se hizo

| Acción | Detalle |
|---|---|
| **Renombrar** | 22 líneas legacy `#EXTATTRFROMURL:X-APE-*` → **`#EXT-X-APE-*`** (namespace custom **inerte**, RFC 8216 §6.3.1: el player las ignora). Contenido informativo intacto |
| **Eliminar** | **32 líneas** que afirmaban capacidades o métricas no reales: `LCEVC`, `AI-SR=realesrgan`, `AI-FI=rife_v4`, `DRM=widevine_L1`, `DRM-HDCP=2.2`, `SPOOF-IP`, `CDN-IP`, `VMAF`, `SCORECARD`, `TELCHEMY`, `CMAF=fmp4`, `INIT-SEGMENT`, `DOLBY-VISION`, `ATMOS`, `DTS-X`, `TRUEHD`, `VRR`, `QUANTUM-PIXEL`, `ANABOLIC-HEADERS`, `MANIFEST-TYPE/VERSION`, `PLAYLIST-TYPE`, `TARGET-DURATION`, `LIVE-DELAY`, `HOLD-BACK`, `PART-HOLD-BACK`, `CHUNK-DURATION`, `PART-TARGET`, `SPORT-MODE(-BOOST)`, `EVASION`, `POLIMORFISMO` |
| **Neutralizar** | `SPOOF-UA=<ua>` → `#EXT-X-APE-UA-CANONICAL=<ua>` (se conserva el UA real; se retira la afirmación de *spoofing*) |
| **Cubrir el otro sitio** | `build_ape_block()` emitía otra línea `#EXTATTRFROMURL:` con un CSV de atributos → renombrada a `#EXT-X-APE-ATTRS:`. **Ese función tiene 0 callers** (código muerto), pero se cubrió por consistencia |

**No se borró contenido informativo**: lo que se conserva son valores reales del generador (SID, nonce, list-hash, timestamp, perfil, códec, resolución, framerate, bandwidth, HDR, buffer, session/request-id, JWT, UA canónico).

## 3. Antes / después (medido con fixture de 1 canal)

| Métrica | Antes | Después |
|---|---|---|
| Líneas `#EXTATTRFROMURL` por canal | **54** (todas `X-APE-*`, ninguna URL) | **1** (y es la URL real `/a/2/…`) |
| `#EXTATTRFROMURL:X-APE` por canal | 54 | **0** |
| Líneas `#EXT-X-APE-*` por canal | 587 | **587** (misma cuenta: sólo cambió el prefijo de 22) |
| Líneas totales por canal (sin config) | 895 | **863** (−32) |
| Bytes por canal | — | **48.527 B** sin config · **48.844 B** con config |
| Bytes ahorrados por el renombrado | — | **−242 B/canal** (22 líneas × 11 B de prefijo) |
| Línea válida | 272 B | **273 B** (`https://iptv-ape.duckdns.org/a/2/MTIz/…`) |

## 4. Verificación ejecutada

| Test | Resultado |
|---|---|
| `node -c` ×3 (`ape-fallback-resolver`, `ape-quality-prober`, `m3u8-typed-arrays-ultimate`) | **exit 0** los tres |
| `#EXTATTRFROMURL` en el fuente | **1** (sólo la emisión real) · `#EXTATTRFROMURL:X-APE` = **0** |
| Smoke 1 fixture: `#EXTATTRFROMURL:` por canal | **1**, y cumple `^#EXTATTRFROMURL:https://iptv-ape\.duckdns\.org/a/2/` |
| URL-1 del canal | **intacta** (mismo conjunto de líneas `http*` con y sin config) |
| Gate TiviMate | **0** líneas `#EXTATTRFROMURL` con UA `TiviMate/…` |
| Afirmaciones falsas del bloque L7 | **0** en la salida |

## 5. Residual declarado (NO cerrado en t51)

1. **Segundo emisor condicional**: `m3u8-api-wrapper-integrated.js:1266` emite **otra** línea `#EXTATTRFROMURL:<url>` (a `resolve.php`), **cargado en `index-v4.html:4440`** y activo sólo si `ApeModuleManager.isEnabled('dual-client-runtime')`. Con ese módulo encendido un canal puede llevar **2** líneas. **No lo toqué**: es otro módulo y su URL es legítima (no basura X-APE). Requiere decisión del capitán: o se apaga ese flag, o se unifica el origen.
2. **Las mismas afirmaciones falsas siguen en el namespace `#EXT-X-APE-*` fuera de L7**: **71 líneas por canal** medidas (LCEVC 35, TELCHEMY 10, VRR 9, VMAF 8, widevine 6, ATMOS 6, realesrgan 5, rife_v4 5, TRUEHD 3, ANABOLIC 2, SPOOF-IP 1, INIT-SEGMENT 1, DTS-X 1, QUANTUM-PIXEL 1 en fuente). Fuera del alcance de t51 (que nombra el bloque legacy de EXTATTR); **sigue ABIERTO**.
3. **NOT_RUN**: la lista publicada **no se regeneró ni se republicó** (ventana aparte). Las cifras de §3 son medición sobre 1 canal, no sobre los 10.520.
4. **NOT_RUN**: no hay deploy; `_vps_stage/**` y la DB no se tocaron.
