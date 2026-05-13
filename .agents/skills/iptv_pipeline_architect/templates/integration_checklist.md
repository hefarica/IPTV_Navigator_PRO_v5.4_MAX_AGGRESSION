# Checklist de Integracion — Pipeline Architect vNext

## Pre-Parche

- [ ] Backup creado: `generador.js.backup`
- [ ] diagnose_pipeline.py ejecutado
- [ ] Bugs criticos identificados
- [ ] Orden de parches definido (respetar dependencias)

## Parches Automatizables (apply_patches.py)

- [ ] B5+A7 — URL limpia (ape_sid/nonce/profile eliminados)
- [ ] A10 — Semaforo FrontCDN activo
- [ ] D4 — buildUniversalUrl conectado al flujo
- [ ] D5 — Funcion huerfana desactivada
- [ ] D6 — VERSION unificada

## Parches Manuales (codigo en plan_maestro_v23.md)

- [ ] Paso 3 — Pipeline EXTHTTP unificado + OVERFLOW emitido
- [ ] Paso 4 — JWT real (generateJWT68Fields con 30+ claims)
- [ ] Paso 5 — resolveStreamExtension() dinamica
- [ ] Paso 8 — ESSENTIAL_KEYS actualizado

## Verificacion en Generador

- [ ] `node -c generador.js` = sin errores
- [ ] `grep -c "const VERSION" generador.js` = 1
- [ ] `grep "primaryUrl = buildUniversalUrl" generador.js` >= 1
- [ ] `grep "__APE_FRONTCDN_RESOLVING__" generador.js` >= 2
- [ ] `grep "primaryUrl.*ape_sid" generador.js` = 0
- [ ] `grep "APE-OVERFLOW-HEADERS" generador.js` >= 1

## Verificacion en Lista Generada

- [ ] `grep "?ape_sid=" lista.m3u8` = 0
- [ ] `grep "&profile=" lista.m3u8` = 0
- [ ] `grep "APE-OVERFLOW" lista.m3u8` = 1 por canal
- [ ] `grep -A1 "STREAM-INF" lista.m3u8` = URL siguiente
- [ ] EXTHTTP < 3072 chars
- [ ] Cookie presente con campos ape_*
- [ ] JWT decodificable con 30+ claims

## Verificacion de Capas (6/6)

- [ ] CAPA A — EXTHTTP funcional (<30 headers, JSON valido)
- [ ] CAPA B — Cookie con ape_p, ape_c, ape_sid
- [ ] CAPA C — Authorization: Bearer con JWT real
- [ ] CAPA D — KODIPROP stream_headers (142 headers)
- [ ] CAPA E — OVERFLOW base64 decodificable
- [ ] CAPA F — EXT-X-APE-* tags L5-L8

## Scoring Final

- [ ] `python scripts/validate_pipeline.py generador.js lista.m3u8`
- [ ] Score >= 85 → PRODUCCION
- [ ] Score 70-85 → RIESGO (documentar)
- [ ] Score < 70 → RECHAZAR (corregir y re-ejecutar)

## Empaquetado (solo si PRODUCCION)

- [ ] zip -9 "APE_TYPED_ARRAYS_ULTIMATE_v23.0.0.zip" generador.js profiles.json
- [ ] Verificar zip tiene todos los archivos
- [ ] Tag de version correcto
