# 15 · Generador SSOT — `#EXTATTRFROMURL` por canal (Fase 0.6, REPO-ONLY)

**Archivo modificado:** `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (1 archivo)
**Naturaleza:** cambio en el generador. **No** se desplegó, **no** se regeneró ni publicó ninguna lista, **no** se tocó `_vps_stage/**` ni la DB (sólo se **leyó** el consumidor, ver §2).

## 1. Línea exacta que se emite (1 por canal)

```
#EXTATTRFROMURL:<host>/a/2/{c}/{s}/{p}/{payload}/{h}
```

| Campo | Origen real en el generador | Codificación |
|---|---|---|
| `c` | `channel.id \|\| channel.name` | `base64url(utf8(id))` sin padding |
| `s` | `_nonce796` (o `cfg.sessionNonce`) | `[A-Za-z0-9_-]`, ≤32; **rota por refresco** |
| `p` | parámetro `profile` | `/^P[0-5]$/`, fallback `P3` |
| `payload` | slots derivables (§2) | `base64url(máscara 125 B ‖ body 2 B BE por bit encendido)` |
| `h` | HMAC-SHA256 del canónico | **primeros 16 B** ⇒ `hex[:32]` |

**Canónico firmado (exacto del contrato):** `"2|{c}|{s}|{p}|{payload}"` — vincula id, sesión, perfil y payload: cambiar `s` cambia `h` (verificado).

## 2. Contrato alineado al consumidor ya existente (no inventado)

Existe ya el lado servidor: [`_vps_stage/lua/ape_attr.lua`](../../_vps_stage/lua/ape_attr.lua) (19.974 B, `M.parse_payload` L207-237) y su spec [`docs/rea/14_APE_A_CONTRACT.md`](14_APE_A_CONTRACT.md). El generador se alinea a **ellos**, que son la autoridad del wire:

| Punto | Consumidor (`ape_attr.lua`) | Generador (este cambio) |
|---|---|---|
| Canónico | L11 `"2\|c\|s\|p\|payload"` | `'2|' + c + '|' + s + '|' + p + '|' + payload` ✅ |
| `h` | L28 `HMAC_BYTES = 16` | `hex.slice(0,32)` = 16 B ✅ |
| Máscara | L219 `floor(byte/2^(slot%8))%2` ⇒ **LSB-first** | `mask[i>>3] \|= 1<<(i&7)` ✅ |
| Body | L226 `#body == set*2`, L231 `b1*256+b2` ⇒ **BE, orden ascendente** | `(v>>8), v&0xFF` en orden de slot ✅ |
| `0xFFFF` | L26 `EMPTY` = vacío | reservado; no se emite ✅ |

**Diccionario de slots (fijado por `14_APE_A_CONTRACT.md` §3 y `M.SLOT`):** `0` URL_DELTA · `1` CODEC_ORDER · `2` VIDEO_TRACK · `3` SOURCE_FORMAT · `4` HTTP_UA_MODE · `5` HTTP_REFERER_MODE · `6` FLAGS · `16-895` D6 · `896-959` diag · `960-999` ctrl.

**Sólo se emite lo que el generador SABE:** `slot 3 = SOURCE_FORMAT` derivado de la URL real del canal (**1** `.ts` · **2** `.m4s/.mp4` · **3** `.m3u8`; desconocido ⇒ se **omite**). El resto de slots se deja vacío y el endpoint aplica su default seguro (`URL_DELTA=0` ⇒ D0 omitido ⇒ **el player usa la URL-1 del playlist**, tal como exige la tarea). Rellenar CODEC_ORDER/VIDEO_TRACK con nuestras métricas sería **atribuirles un significado que el contrato no les da** — se evita.

## 3. Ejemplos reales (corridas de smoke, clave efímera de test)

```
canal .ts      → #EXTATTRFROMURL:https://iptv-ape.duckdns.org/a/2/MTIz/nonceABC123/P1/CAAAAA…ABAA/71c66330a7d1c68b82e0cdde76cfd7a6   (272 B, slot 3 = 1)
canal sin fmt. → #EXTATTRFROMURL:https://iptv-ape.duckdns.org/a/2/eno/n1/P3/AAAA…AA/e54df9772eb7…                                  (270 B, máscara vacía ⇒ count 0)
```
Ambos **decodifican sin error** con un port fiel de `M.parse_payload` (count 1 / count 0, `body == set*2`).

## 4. Activación y gates (por defecto NO emite nada)

```js
window.APE_ATTRFROMURL = {
  host: 'https://iptv-ape.duckdns.org',   // default si se omite
  key:  '<inyectada en runtime>',         // OBLIGATORIA — nunca en el repo
  devModel: 'onn-4k', soc: 'amlogic-s905x4',
  uaWhitelist: ['proveedor-autorizado.example'],   // [] u omitido = todos
  uaSuffix: true, enabled: true
};
```

| Gate | Comportamiento | Verificado |
|---|---|---|
| Sin `key` (o vacía) | **0 líneas** — no se inventa firma | sí |
| `enabled === false` | 0 líneas | sí |
| UA del canal contiene `TiviMate` | 0 líneas (TiviMate sólo consume D0/D5; **OTT sí** usa el resto) | sí, end-to-end |
| Canal sin `id` ni `name` | 0 líneas | sí |
| Sin `window.APE_ATTRFROMURL` | 0 líneas y **UA intacto** | sí |

**La URL-1 del canal no se altera:** el conjunto de líneas `http*` es idéntico entre corrida sin config y con config (verificado).

## 5. UA con perfil — sufijo AÑADIDO, nunca reemplazo

```
<UA del proveedor, intacto> APE/1.0 dev=<modelo> soc=<soc> p=<P0-P5>
```
Se aplica en los **2** puntos donde el UA sale al player: `#EXTVLCOPT:http-user-agent=` y `'User-Agent'` del `#EXTHTTP`. **Idempotente** (no duplica `APE/1.0`). **Default OFF**. **Lista blanca por host** (`uaWhitelist`): host no listado ⇒ UA intacto.

> ⚠️ **Riesgo declarado:** hay proveedores que **autentican por UA**. Añadir sufijo puede provocar `403/401` o cambiar el enrutado a CDN. Por eso está apagado por defecto y acotado por host: activarlo sólo contra hosts donde se haya probado que el sufijo no rompe la sesión.

## 6. Coste medido por canal

| Métrica | Valor medido |
|---|---|
| Línea `#EXTATTRFROMURL` | **270 B** (sin formato) · **272 B** (con slot 3) |
| Payload | 167 chars (máscara vacía) · 169 chars (1 slot) |
| Líneas por canal | 895 → **896** (**+1** exacta) con config; 895 sin config |
| Proyección 10 000 canales | **≈ 2,7 MB** de texto añadido (sin comprimir) |

## 7. Verificación ejecutada

| Test | Resultado |
|---|---|
| `node -c` ×3 (`ape-fallback-resolver`, `ape-quality-prober`, `m3u8-typed-arrays-ultimate`) | **exit 0** los tres |
| HMAC-SHA256 vs `node:crypto` (incl. clave aleatoria y canónico `2\|…`) | **idénticos** (incl. `f7bc83f4…`) |
| `base64url` vs `Buffer.toString('base64')` | **idéntico** |
| Round-trip con port de `M.parse_payload` | **válido** en ambos casos (count 1 / 0) |
| Smoke de generación, 1 fixture, PRNG sembrado | **+1 línea**, URL-1 intacta, sufijo UA correcto |
| Gate TiviMate | **0 líneas** |

## 8. NOT_RUN (declarado, no maquillado)

1. **No se regeneró la lista de 10 000 canales** ni se publicó nada. El coste de §6 es proyección, no medición sobre la lista real.
2. **No hay deploy ni prueba contra el edge**: `/a/2/` no se ha invocado; la clave real (`/etc/nginx/lua/ape_attr.key`, 0600) no existe en este host y su presencia en el VPS no está verificada.
3. **El harness del repo `frontend/js/ape-v9/test_generator.js` NO es ejecutable**: hace `eval(code)` y espera un `generateChannelEntry` global, pero el módulo está envuelto en un IIFE (L20–L11845) y **no lo exporta** ⇒ `ReferenceError` (exit 1). El smoke se hizo exponiendo la función desde el propio cuerpo del módulo, con los mocks copiados verbatim de ese harness.
4. **Sin prueba en dispositivo**: que OTT Navigator consuma la línea y TiviMate la ignore es doctrina del contrato (§`14_APE_A_CONTRACT.md` L104), no medición de este turno.
