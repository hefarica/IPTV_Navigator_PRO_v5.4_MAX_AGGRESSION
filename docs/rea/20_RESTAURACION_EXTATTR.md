# 20 · Restauración total de `#EXTATTRFROMURL` (orden del propietario)

**Fecha:** 2026-10-28 · **Tarea:** t55 · **Naturaleza:** repo-only. Sin deploy, sin publicar lista, sin commit.

## 1. Qué se restauró

| Archivo | Acción | Estado resultante |
|---|---|---|
| `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | `git checkout --` (vuelta a HEAD `2f8861c`, blob `b7b59446`) y **re-aplicación del bloque aditivo de t48** | 11.883 líneas · **SHA-256 `e7104947a0568cb915e45941db3f08b2b945d46c447e3406a8fc355063ed024b`** |
| `frontend/js/ape-v9/m3u8-api-wrapper-integrated.js` | `git checkout --` (== HEAD, **sin ninguna guarda añadida**) | 101.708 B / 1.752 líneas · **SHA-256 `1a7e8ed405c7bdb1f022381e8b8b68399eae017d712c5faf6b2591c76de4d54b`** |

**Nada se elimina por orden del propietario.** Las 54 líneas `#EXTATTRFROMURL:X-APE-*` vuelven a estar, las 71 `#EXT-X-APE-*` también, y el `#EXTHTTP` recupera sus 203 claves originales. Deshice **solo** lo que t51/t52/t53 habían tocado, porque esa limpieza no estaba autorizada.

## 2. Qué se re-aplicó (únicamente t48)

1. **Línea `/a` por canal** — `#EXTATTRFROMURL:https://iptv-ape.duckdns.org/a/2/{c}/{s}/{p}/{payload}/{h}` con `c=base64url(id)`, `s=nonce de sesión`, `p=P0-P5`, `payload` (máscara+slot 3 `SOURCE_FORMAT`), `h=HMAC-SHA256[:32]` con canónico `2|c|s|p|payload`.
2. **Sufijo UA opt-in** — `<UA del proveedor> APE/1.0 dev=<modelo> soc=<soc> p=<P0-P5>`, **apagado por defecto**, idempotente, con `uaWhitelist` por host, aplicado en los 2 puntos de salida (`#EXTVLCOPT:http-user-agent` y `'User-Agent'` del `#EXTHTTP`).

Gate: **sin `window.APE_ATTRFROMURL.key` no se emite nada** y el UA sale intacto. Con UA TiviMate tampoco se emite la línea.

## 3. Estado exacto verificado (fixture, PRNG sembrado)

| Métrica | Sin config | Con config |
|---|---|---|
| Líneas por canal | **895** (original) | **896** (895 + 1 de t48) |
| `#EXTATTRFROMURL:X-APE-*` por canal | **54** | **54** (sin cambios) |
| `#EXTATTRFROMURL` real (`/a/2/…`) | 0 | **1** |
| Sufijo `APE/1.0` en UA | 0 | 1 (solo con config) |
| URL-1 del canal | intacta | **intacta** |

Fuente: `#EXTATTRFROMURL:X-APE` = **54** · `#EXT-X-APE-` = **1.293** · BOM byte 47 (sin BOM) · `node -c` **exit 0** ×3 · wrapper byte-idéntico a HEAD.

## 4. Efectos declarados de esta restauración (para que no sorprendan)

1. **Vuelven las ~568.000 líneas no-URL de la lista publicada** en la próxima regeneración: 54 × ~10.520 canales. Es lo pedido; queda escrito aquí para que sea una decisión consciente y no un hallazgo futuro.
2. **Vuelven las afirmaciones LCEVC / DRM-widevine / AI-SR / ATMOS / VRR / VMAF** al namespace `#EXT-X-APE-*` y 18 claves `X-LCEVC-*` / `X-DRM-Support` al `#EXTHTTP`.
3. **El wrapper vuelve a HEAD, es decir SIN guarda**: como `ape-module-manager.js:73-75` **hardcodea** `isEnabled('dual-client-runtime') → true`, un canal con clave configurada llevará **2** líneas `#EXTATTRFROMURL` (la `/a/2/` del generador **y** la de `resolve.php`). Se restaura así por orden explícita; si se quiere "exactamente 1", hace falta autorizar la guarda que t52 había puesto.
4. **t53 (slots 0/1/4/5/6) no se re-aplicó**: la orden dice "solo el bloque de t48". El payload vuelve a llevar únicamente el slot 3.

## 5. NOT_RUN

- **Lista de 10.520 no regenerada ni publicada** (ventana aparte): las cifras son de 1 canal.
- **Sin invocación real a `/a/2/`** ni al wrapper: no se probó end-to-end en navegador.
- **Sin deploy**; `_vps_stage/**`, DB y listas intactas; **sin commit**.
