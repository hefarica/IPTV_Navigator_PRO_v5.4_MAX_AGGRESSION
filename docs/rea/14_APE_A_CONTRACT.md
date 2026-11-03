# 14 · `/a` v2 — contrato `#EXTATTRFROMURL` (atributos por canal, 1000 slots)

**Tarea:** `t47` · **attempt:** `edb6d3f8-ecf3-42a1-baa6-fed4804a4891` · **Autor:** `s6-nginx-lua` (S6) · **HEAD:** `2f8861c`
**Estado: REPO-ONLY. NO desplegado, sin commits.** Entregables: `_vps_stage/lua/ape_attr.lua` (nuevo) · `_vps_stage/nginx/snippets/ape-attr-public.conf` (nuevo) · `_vps_stage/nginx/meta-plane.conf` (location `/a/` en 8088).

## 1 · Contrato

```
GET /a/2/{c}/{s}/{p}/{payload}/{h}
```
| Campo | Semántica |
|---|---|
| `2` | versión del contrato (fija en esta versión) |
| `c` | canal / `ch` id (opaco para el endpoint, entra en el HMAC) |
| `s` | stream id (idem) |
| `p` | perfil P0–P5 (idem) |
| `payload` | `base64url( mask[125 B] .. body[2 B por bit encendido] )` — bit *i* de la máscara ⇒ slot *i*; cuerpo en orden de slot ascendente, big-endian; valor `0xFFFF` = **vacío** |
| `h` | hex de los **primeros 16 B** de `HMAC-SHA256("2|c|s|p|payload")` |

**Tamaño:** máscara 125 + cuerpo 2 000 (1000 slots llenos) = 2 125 B ⇒ **2 834 caracteres b64url** < 3 KB. **No se toca `large_client_header_buffers`.**

**Clave:** `/etc/nginx/lua/ape_attr.key` (0600, fuera del repo). `NOT_RUN`: su existencia no se ha verificado en el VPS. **Fail-open:** clave ausente, HMAC inválido o payload ilegible ⇒ **200** con el fragmento mínimo `#EXT-X-APE-STALE:1` y cabecera `X-APE-A: stale:<motivo>`. **Nunca 4xx.**

**Respuesta:** `base64url(fragmento)` **sin padding**, ASCII imprimible, directivas en orden:

| ID | Directiva | Cuándo |
|---|---|---|
| D0 | `#EXT-X-APE-URL:<url>` | sólo si slot 0 = 1 **y** la URL viene del contexto compartido (`ape_qoe`) |
| D1 | `#EXT-X-APE-CODEC:hard,exo1,soft_vlc` \| `soft_vlc,exo1,hard` | slot 1 = 0 \| 1 (1 = invertido por interlace) |
| D2 | `#EXT-X-APE-VIDEO-TRACK:<n>` | slot 2 (≠ `0xFFFF`) |
| D3 | `#EXT-X-APE-SOURCE-FORMAT:auto\|ts\|fmp4\|hls-ll` | slot 3 = 0..3 |
| D4 | `#EXTHTTP:{...}` | slots 4/5 ≠ 0 — **sólo OTT** |
| D5 | `#EXTVLCOPT:http-user-agent=…` / `http-referrer=…` | slots 4/5 ≠ 0 — **todos los UA** |
| D6 | `#EXT-X-APE-C<slot>:<valor>` | slots 16–895 — **sólo OTT** |

**Nunca** `#EXTM3U`, `#EXTINF`, `#EXT-X-STREAM-INF`, `#ENDLIST` (test dedicado).

## 2 · Gate por UA (medido)

| UA | Directivas | Test |
|---|---|---|
| **OTT Navigator** ≥1.7.1.4 | D0–D6 + control + Capa B | `ott_D0…D6` ✔ |
| **TiviMate** | **sólo D0 y D5** | `tivimate_solo_D0_D5` ✔ (362 B, sin Capa B) |
| Desconocido (VLC…) | sólo D0 y D5 | `other_solo_D0_D5` ✔ |

Detección por subcadena: `ott navigator`/`ottnavigator`, `tivimate`; resto ⇒ `other`.

## 3 · Diccionario de los 1000 slots

| Rango | Uso | Notas |
|---|---|---|
| **0** | `URL_DELTA` | 0 = sin cambio (D0 omitido, default = URL-1 del playlist) · 1 = cambia |
| **1** | `CODEC_ORDER` | 0 = `hard,exo1,soft_vlc` · 1 = invertido (interlace) |
| **2** | `VIDEO_TRACK` | índice; `0xFFFF` = vacío |
| **3** | `SOURCE_FORMAT` | 0 auto · 1 ts · 2 fmp4 · 3 hls-ll |
| **4** | `HTTP_UA_MODE` | 0 no tocar · 1 `okhttp/4.9` · 2 `VLC/3.0` |
| **5** | `HTTP_REFERER_MODE` | 0 no tocar · 1 origen del proveedor |
| **6** | `FLAGS` | bit 1 (valor 2) = **solicitar Capa B** |
| **7–15** | reservados | se ignoran (no emiten nada) |
| **16–895** | `D6` namespace | `#EXT-X-APE-C<slot>:<valor>`; inerte para el player |
| **896–959** | **diagnóstico** | reservado a contadores/estado del plano (no se emiten como D6) |
| **960–999** | **control** (de vuelta) | `GEN`, `TTL`, `STALE`: 960 marca "hay control"; 999 = 1 ⇒ `#EXT-X-APE-STALE:1` |

## 4 · Capa B (estado completo para el companion) — **opt-in**

`#EXT-X-APE-B:n/tot/<b64url>` en fragmentos de 24 caracteres, **sólo** si `gate.D6` (OTT) **y** (slot 6 = bit 1 **o** `ctx.want_b`).

**Por qué opt-in (medido):** volcar los 1000 slots como texto da **40 590 B** de fragmento por respuesta. Con la Capa B desactivada la respuesta normal es **362 B**. Emitirla siempre habría roto el objetivo de respuestas pequeñas.

**`deflate` = NOT_RUN.** El runtime no tiene zlib (`resty.zlib`/`ngx.compress` ausentes; el VPS no tiene luarocks). Se emite **base64 sin comprimir** y se declara `enc=b64`. Para cumplir el contrato al pie de la letra hace falta vendorizar un zlib Lua o comprimir en el generador.

## 5 · Decisión < 80 ms · sólo `ngx.shared`

- Lecturas por petición: `ngx.shared.ape_qoe` (`gen`, `cfg_ttl`, `stale`). **Cero disco por petición** (la clave HMAC se lee **una vez** y se cachea en módulo), cero SQLite, cero DNS.
- **Medido con `lua5.1` sin `bit` (peor caso) y 1 000 slots + Capa B: 6,3 ms.** Con LuaJIT (`bit` disponible) el módulo toma el fast-path y baja aún más.
- Si falta un dato ⇒ default seguro (`gen=0`, `ttl=0`, `stale=0`, `url=nil` ⇒ D0 omitido).

## 6 · Tests (staged en `/tmp/t47`, lua5.1 5.1.5 + luac del VPS)

| Test | Exit | Resultado |
|---|---|---|
| `luac -p ape_attr.lua` · `luac -p harness.lua` | **0** | sin errores de sintaxis |
| Harness (48 aserciones) | **0** | **48/48 pass, 0 fail** |
| **Crypto contra RFC 4231/6234** | — | HMAC-SHA256 TC1 `b0344c61…` ✔ · TC2 `5bdcc146…` ✔ · SHA-256("abc") ✔ (verdad **externa**, no circular) |
| Payload 1 / 40 / 1000 slots | — | máscara correcta, `count`=3/40/1000, roundtrip de valores, **2 834 b64 < 3 KB** |
| `0xFFFF` vacío | — | parseado como vacío |
| Cuerpo incoherente / b64 inválido / corto | — | `nil` + motivo (`body_longitud_incoherente`, …) |
| HMAC bueno/malo/ausente/malformado/sin clave | — | 5 casos, 5 motivos distintos |
| Gate por UA (3 UAs) | — | OTT todo · TiviMate y otro sólo D0/D5 |
| Sin cambios | — | fragmento mínimo `#EXT-X-APE-STALE:1` **sin D0** |
| Tags prohibidos / ASCII / charset b64url | — | ninguno presente; ASCII imprimible; sin `+/=` |
| Decisión 1000 slots | — | **6,3 ms** < 80 ms |

**`nginx -t` = NOT_RUN**: el snippet no es una config autocontenida (necesita el `http{}`/vhost reales); se valida en la ventana de despliegue, como en t42.

## 7 · `POST /a/cfg` — diseñado, NO implementado

**Contrato propuesto:** `POST /a/cfg` con `Content-Type: application/json`, cuerpo ≤ 4 KB, token por sesión en cabecera (`X-APE-Cfg`), respuesta `{ok, gen, ttl}`. Sustituiría al payload en URL para configuraciones grandes (URL real de D0, listas de tracks).

**Riesgo declarado (por eso NO se implementa aquí):** (a) es el **único** endpoint de escritura del plano y debe ir con token, rate-limit propio y `client_max_body_size` explícito; (b) si escribe en `ngx.shared`, un `lua_shared_dict` mal dimensionado puede ser un vector de agotamiento de memoria; (c) abre una superficie que hoy no existe. Sin ventana + revisión de S10 no se implementa.

## 8 · Límites honestos

1. **Sólo OTT Navigator ≥1.7.1.4** consume D1–D4/D6. **TiviMate ignora** todo salvo D0/D5: para él este endpoint aporta muy poco.
2. **D0 no transporta la URL** (no cabe en 2 B): sólo se emite si la URL llega por `ngx.shared`. Si no, se omite (default = URL-1).
3. **`0xFFFF`** es "vacío", no "cero": un valor 0 legítimo se distingue.
4. **La Capa B no está comprimida** (deflate NOT_RUN) y es opt-in.
5. **Nada de esto está desplegado**: `ape_uhd.lua`, `ape_gateway.lua` y el generador **no se tocaron**.
