# Bugs Comunes en Generadores M3U8 APE — Referencia vNext

## Bug B1 — Posicion incorrecta de #EXT-X-STREAM-INF (CRITICO)

**Sintoma:** Pantalla negra en todos los canales.
**Causa:** Directivas entre `#EXT-X-STREAM-INF` y su URL.
**Regla RFC 8216:** STREAM-INF DEBE estar en la linea inmediatamente anterior a la URL.
**Deteccion:** `python scripts/audit_m3u8_structure.py lista.m3u8`
**Correccion:** Reordenar: todas las directivas primero, STREAM-INF+URL al final del bloque.

---

## Bug B2 — Pre-resolucion FrontCDN bloqueada por CORS

**Sintoma:** 996 canales FrontCDN pantalla negra. Log: `ERR_FAILED`, `HTTP 0`.
**Causa:** `preResolveFrontCDNRedirects()` hace fetch directo desde browser sin CORS.
**Correccion:** Redirigir al VPS o usar `creds._frontCDNHost`.

---

## Bug B3 — TypeError: ApeModuleManager.getStatus is not a function

**Sintoma:** Panel de modulos no carga.
**Causa:** `ApeModuleManager` sin metodo `getStatus()` al momento de la llamada.
**Correccion:** Guardia: `typeof window.ApeModuleManager?.getStatus === 'function'`

---

## Bug B4 — preferHttps() modifica el protocolo del servidor

**Sintoma:** `HttpDataSourceException` en ExoPlayer.
**Causa:** `preferHttps()` cambiaba `https->http`.
**Correccion:** Passthrough absoluto: `return url;`

---

## Bug B5 — Parametros ?ape_sid= en URL (CRITICO)

**Sintoma:** HTTP 400/403 en servidores no-tivi.
**Causa:** `?ape_sid=X&ape_nonce=Y&profile=P5` en URL.
**Correccion:** URLs limpias. Parametros en EXTHTTP/Cookie/JWT.
**Deteccion:** `grep "?ape_sid=" lista.m3u8 | wc -l` (debe dar 0)

---

## Bug B6 — Extension forzada incorrectamente

**Sintoma:** Playlist HLS vs MPEG-TS incompatible.
**Causa:** Extension hardcodeada.
**Correccion:** Xtream->.m3u8, FrontCDN->.ts, Stalker->.ts, VOD->.mp4

---

## Anomalia A7 — Parameter Pollution (CRITICO)

**Sintoma:** HTTP 400 por params duplicados.
**Causa:** `getTierUrl()` agrega `&profile=` sin dedup.
**Correccion:** Limpiador regex en `getTierUrl()`.

---

## Anomalia A10 — Doble ejecucion FrontCDN (CRITICO)

**Sintoma:** 1992 fetch simultaneos, bucle UA.
**Causa:** v2.0 y v3.0 se ejecutan ambas.
**Correccion:** Semaforo `__APE_FRONTCDN_RESOLVING__`.

---

## Deuda D1 — Dos pipelines EXTHTTP (CRITICO)

**Sintoma:** ~440 headers descartados.
**Causa:** `build_exthttp()` y L2 compiten.
**Correccion:** Pipeline unificado con sub-capas A, B, E.

---

## Deuda D2 — JWT stub (CRITICO)

**Sintoma:** JWT falso en Authorization.
**Causa:** `generateJWT68Fields()` es stub.
**Correccion:** Implementacion real 30+ claims.

---

## Deuda D3 — OVERFLOW no emitido (CRITICO)

**Sintoma:** ~460 headers perdidos.
**Causa:** L2 no genera `#EXT-X-APE-OVERFLOW-HEADERS`.
**Correccion:** Emitir base64 despues de EXTHTTP.

---

## Deuda D4 — buildUniversalUrl() codigo muerto (CRITICO)

**Sintoma:** Motor USA no se ejecuta.
**Causa:** `buildUniversalUrl()` nunca se llama.
**Correccion:** Conectar en `generateChannelEntry` con fallback.
