# 19 · Limpieza final: 1 `#EXTATTRFROMURL` en runtime + 0 afirmaciones falsas

**Fecha:** 2026-10-28 · **Tarea:** t52 (repo-only) · Cierra los 2 residuales que dejó [`18_FIX_LEGACY_EXTATTR.md`](18_FIX_LEGACY_EXTATTR.md).
**Archivos:** `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (generador SSOT) · `frontend/js/ape-v9/m3u8-api-wrapper-integrated.js` (wrapper cargado en `index-v4.html:4440`).

## 1. Segundo emisor — decisión: gate por configuración (no se apaga ningún módulo)

**Corrección a lo que reporté en t51:** dije que el segundo emisor era *condicional*. **Es siempre activo**: `ape-module-manager.js:73-75` **hardcodea** `isEnabled('dual-client-runtime') → true` vía `coreFlags`, sin mirar el registro de módulos. Es decir, con el generador configurado **todo canal llevaba 2** líneas.

| Decisión | Detalle |
|---|---|
| Vía elegida | **(a) idempotente**: el wrapper no emite si el generador ya emite |
| Condición | `_apeGenOwnsAttrFromUrl = !!(window.APE_ATTRFROMURL && (key \|\| hmacKey))` — el generador sólo emite su `/a/2/…` cuando hay clave, así que ambos son mutuamente excluyentes por construcción |
| Guarda 2ª | `if (entry.indexOf('#EXTATTRFROMURL:') === -1)` antes del `+=` (protege de doble invocación) |
| Efecto sin config | El wrapper **sigue emitiendo** su `resolve.php` → **no se rompe** el flujo que lo usa hoy |
| Efecto con config | Generador emite `/a/2/…`, wrapper **no** emite ⇒ **exactamente 1** por canal |
| Verificado | `genOwns` false/true/true con sin-config/`key`/`hmacKey`; guarda devuelve `false` si el entry ya trae el tag |

No se apagó `dual-client-runtime`: apagarlo habría matado también `quality-overlay-vip` y el resto de `coreFlags` hardcodeados (efecto colateral mayor).

## 2. Afirmaciones falsas eliminadas (namespace `#EXT-X-APE-*` y satélites)

Se **eliminaron** (no neutralizadas): son etiquetas muertas, ninguna perdía funcionalidad.

| Familia | Líneas de emisión quitadas | Ejemplos |
|---|---|---|
| `EXT-X-APE-LCEVC*` | 76 | `-PHASE:4`, `-ENABLED:true`, `-RESOLUTION-BOOST:3840x2160` |
| `EXT-X-APE-DRM*` | 22 | `:TYPE=widevine,LEVEL=L1`, `-WIDEVINE`, `-PLAYREADY` |
| `EXT-X-VNOVA-LCEVC*` | 20 | `-BASE-LAYER`, `-ENHANCEMENT-CODEC:LCEVC` |
| `EXT-X-APE-AI-SR*` / `-AI-FI*` | 19 | `MODEL=realesrgan`, `MODEL=rife_v4` |
| `EXT-X-APE-TELCHEMY*` | 14 | `VSTQ=50,EPSNR=45,MOS=4.8` |
| `EXT-X-APE-SCORECARD*` | 4 | `VMAF=95,MOS=4.8,PSNR=42` |
| `EXT-X-APE-AUDIO-TRUEHD/DTS-X` | 3 | `CHANNELS=7.1.4` |
| `#KODIPROP` IA/DRM | 3 | `video_ai_sr_model=realesrgan`, `video_ai_fi_model=rife_v4`, `drm_type=widevine` |
| `#EXT-X-CMAF-*` falsos | 5 | `INIT-SEGMENT`, `LCEVC`, `AI-SR`, `AI-FI`, `TRUEHD` |
| Otros | 18 | `SPOOF-IP`, `QUANTUM-PIXEL`, `*ANABOLIC`, `QUALITY-OVERRIDE-*`, `SPACE-VALIDATOR-*`, `CONTENT-HEURISTIC-*VMAF/LCEVC`, `CORTEX-TELEMETRY-*`, `CHECKLIST-14D-6` |
| **Total emisión** | **184** | |
| **Claves `#EXTHTTP`** | **23** (18 únicas) | `X-LCEVC-Enabled/Version/Threads/L1-Block/…`, `X-Cortex-AI-Super-Resolution`, `X-Audio-TrueHD`, `X-DRM-Support` |

**Conservado** (etiquetas reales): perfil, tier, buffer (`BUFFER-MB`, `SEGMENTS`), compatibilidad de player, transporte/CMAF de contenedor, SID/nonce/UA canónico, y las 185 claves legítimas restantes de `#EXTHTTP`.

## 3. Medición por canal (fixture, PRNG sembrado)

| Métrica | Antes (t51) | Ahora |
|---|---|---|
| Líneas totales (sin config / con config) | 863 / 864 | **762 / 763** |
| Bytes (sin / con config) | 48.527 / 48.844 B | **44.411 / 44.728 B** (−4.116 B) |
| `#EXTATTRFROMURL` por canal | 1 | **1** (la URL real `/a/2/…`) |
| `#EXTATTRFROMURL:X-APE` | 0 | **0** |
| Afirmaciones falsas (`#EXT-X-APE-*` y satélites) | **71** | **0** |
| URL-1 del canal | intacta | **intacta** |
| TiviMate | 0 líneas | **0 líneas** |
| Fuente del generador | 11.862 líneas | **11.655** (−207: 184 emisión + 23 claves) |

## 4. Verificación ejecutada

`node -c` **exit 0** en los 4 archivos (`ape-fallback-resolver`, `ape-quality-prober`, `m3u8-typed-arrays-ultimate`, `m3u8-api-wrapper-integrated`) · sin BOM (`byte 47`) · smoke 1 fixture: 762 líneas, `EXTATTRFROMURL=1`, `XAPE=0`, **falsas=0**, URL-1 intacta, TiviMate 0 · gate del wrapper probado en sus 3 estados + guarda idempotente.

## 5. NOT_RUN (declarado)

1. **La lista publicada no se regeneró ni republicó** (ventana aparte). Todas las cifras son de 1 canal, no de los 10.520.
2. **Sin prueba end-to-end del wrapper** en navegador: se validó la condición y la guarda, no el flujo completo con `ApeModuleManager` real.
3. **Sin deploy**; `_vps_stage/**`, DB y listas intactas.
4. Con `dual-client-runtime` hardcodeado a `true`, cualquier **otro** consumidor que dependa de esa línea del wrapper deja de recibirla **cuando el generador está configurado con clave**. Es el intercambio pedido ("exactamente 1"), pero conviene saberlo antes de encender la clave en producción.
