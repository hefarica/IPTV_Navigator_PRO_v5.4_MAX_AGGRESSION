# Checklist de Integracion — USA Universal Adapter vNext

## Pre-Integracion

- [ ] Generador JS tiene `function generateChannelEntry`
- [ ] Generador JS tiene `function buildChannelUrl`
- [ ] USA_MODULE_v1.js disponible en scripts/
- [ ] Version objetivo definida
- [ ] Backup del generador creado

## Post-Integracion (5 funciones criticas)

- [ ] `detectServerFingerprint` presente
- [ ] `buildUniversalUrl` presente
- [ ] `getUSADirectiveOverrides` presente
- [ ] `_usaOverrides.extvlcopt.forEach` presente
- [ ] `_usaOverrides.kodiprop.forEach` presente

## Verificacion en Lista Generada

- [ ] `grep "?ape_sid=" lista.m3u8 | wc -l` = 0
- [ ] `grep "&profile=" lista.m3u8 | wc -l` = 0
- [ ] `grep "APE-OVERFLOW" lista.m3u8 | wc -l` = 1 por canal
- [ ] `grep -A1 "STREAM-INF" lista.m3u8` = URL en linea siguiente
- [ ] `grep "#EXTHTTP" lista.m3u8 | head -1 | awk '{print length}'` < 3072

## Verificacion en Generador

- [ ] `grep -c "const VERSION" generador.js` = 1
- [ ] `grep "primaryUrl = buildUniversalUrl" generador.js | wc -l` >= 1
- [ ] `grep "__APE_FRONTCDN_RESOLVING__" generador.js | wc -l` >= 2
- [ ] `grep "primaryUrl.*ape_sid" generador.js | wc -l` = 0
- [ ] `node -c generador.js` = sin errores de sintaxis

## Verificacion de Reproduccion

- [ ] Importar lista en OTT Navigator
- [ ] Canal tivi-ott.net reproduce en < 3s
- [ ] Canal de otro servidor no da HTTP 400/403
- [ ] Log del servidor muestra User-Agent y Cookie correctos

## Scoring Final

- [ ] Ejecutar `python scripts/validate_usa.py --mode full <generador.js> <lista.m3u8>`
- [ ] Score >= 85 → PRODUCCION
- [ ] Score 70-85 → ACEPTAR CON RIESGO (documentar gaps)
- [ ] Score < 70 → RECHAZAR (volver a corregir)
