# AUDIT_FINAL — ARA CONTINUIDAD

## A01 — LAB_CALIBRATED_BULLETPROOF

**Estado:** VERIFIED (auditoría de repo; producción no inferida).

**Ruta real:** `deliverables/LAB_2026-10-26/LAB_CALIBRATED_BULLETPROOF_CERTIFIED.json`  
**Duplicado:** `deliverables/VALIDACION_ENTREGA_2026-10-28/lab/LAB_CALIBRATED_BULLETPROOF_CERTIFIED.json`

**Esquema observado:** `profiles_calibrated` con P0..P5. Cada perfil contiene resolución, codec, HDR, buffer de player y cadenas de player. No contiene un modelo TFLite, no contiene umbrales del clasificador y no declara precisión >94%.

**Lectores:** scripts Python de laboratorio (`verify_bulletproof.py`, `compare_calibrated.py`). No hay consumidor en runtime Lua/Kotlin/JS.

**lab_config.lua:** existe en `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/lab_config.lua` y lee los JSON de `/var/www/html/prisma/config/` (línea 18); no lee `LAB_CALIBRATED_BULLETPROOF`.

**Conclusión:** el archivo es calibración de **perfiles de reproductor**, no del clasificador de captura. A.1 tal como se describió no es cableable sin un dataset/umbrales de clasificación reales.

**GATE 0:** no cerrado; A01 es la primera ficha.

## A02 — headers-matrix-v9.js

**Estado:** VERIFIED (auditoría de repo; producción no inferida).

**Ruta real:** `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/headers-matrix-v9.js`.

**Conteo real (ejecutado con Node):**

```text
totalHeaders: 139
L1=15  L2=16  L3=18  L4=25  L5=65
profiles: 4
```

La cabecera declara “154 headers” (línea 7) y distribuciones +30/+34/+36/+26 (líneas 12–16); el código real expone 139. **GAP de documentación/valor.**

**Consumidores:**

- `frontend/index-v4.html:4087` carga el archivo.
- `frontend/js/ape-v9/m3u8-api-wrapper-integrated.js:513` obtiene `hasHeadersMatrix` booleano; `:648-655` intenta `hasHeadersMatrix.getStats?.()` / `.getHeaders?.(...)` sobre el booleano.
- `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:11741` define `getHeaders(ch,p){ return {}; }`: el generador no consume la matriz.
- Exportada como `window.HEADERS_MATRIX_V9` en `headers-matrix-v9.js:646`.

**Riesgos observados:**

- `DNT` activo en L2 (`:132`) y baneado en runtime (`:536`).
- `Alt-Svc` como request header (`:272`), semánticamente response header.
- `Cookie` simulado (`:279`) y múltiples `X-*`.
- `Range`, `If-None-Match`, `If-Modified-Since`, `Priority`, `TE`, `Upgrade-Insecure-Requests` comentados (`:99`, `:115-116`, `:174`, `:205-206`), no activos.

**Conclusión:** la matriz existe, pero no está cableada al generador; el valor real es 139, no 154. No se edita código funcional en A02.

