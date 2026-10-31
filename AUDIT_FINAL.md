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
