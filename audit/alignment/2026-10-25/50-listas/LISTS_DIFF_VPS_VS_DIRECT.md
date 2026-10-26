# LISTS_DIFF_VPS_VS_DIRECT — Qué cambia el rewrite del VPS respecto a la lista directa, y si es legítimo

**Tarea:** t8 (T7) · **Auditor:** `listas-m3u8` · **Ventana:** `2026-10-26T04:07Z – 04:36Z`
**Pregunta que responde este documento:** *¿el rewrite del VPS cambia legítimamente lo que la APP emite?*
**Respuesta corta:** el rewrite **no toca el catálogo**; toca **sólo el manifest de canal que pasa por `/cdn/`**, y
lo que cambia es **(a)** rebase de URIs → **legítimo**, **(b)** inflación de `RESOLUTION` → **legítimo como
atributo RFC, ilegítimo contra la Ley Cardinal 1**, **(c)** `SERVER-CONTROL` en fuentes LL-HLS → **ilegítimo**
(declara una capacidad que no existe). **No** toca `CODECS`, **no** rompe el audio, **no** duplica `VIDEO-RANGE`.

---

## 1. Aclaración de arquitectura (medida, alineada con `CLAUDE.md` D-25/D-32/D-33)

| Ruta | Alcanzable | Fases Lua | Qué hace | Medición |
|---|---|---|---|---|
| **`/lists/<archivo>.m3u8`** | **sí, pública (443)** | **NINGUNA** | sirve el `.gz` con `gzip_static` + `gunzip on` | `curl` → 200, `Transfer-Encoding: chunked`, **0 headers `X-APE-*`** |
| **`/cdn/<host>[:puerto]/<ruta>.m3u8`** | **sí, pública (443)** | `content_by_lua` → proxy a `127.0.0.1:8088` | fetch + sigue 302 + **rebase de URIs** + LL-HLS + **UHD declarado** | `curl` → `X-APE-URI-Rebased`, `X-APE-UHD`, `X-APE-CDN` |
| `/meta/<host>/<ruta>.m3u8` | **no** (sólo `:8088`) | `header_filter` + `body_filter` + `log` | **sólo rebase** (`X-APE-Meta-Mode: rebase-only`) | `curl` 443 → **404**; `curl :8088` con `host:puerto` → **404** (la regex `ape_host` = `[A-Za-z0-9._-]+` **no admite `:`**) |
| **`/shield/...`** | **no** | — | **no existe** | `curl https://127.0.0.1/shield/token/host/live/u/p/1.m3u8` → **404** (confirma D-33) |
| Segmentos (`*.ts|m4s|mp4`) | no | — | `return 404` | `nginx-T.conf:788` y `:847` |

**Módulos desplegados que intervienen en el rewrite (5) — y prueba `producción == git HEAD`:**

| Módulo | Bytes (VPS) | sha256 VPS = **HEAD** | sha256 working tree | ¿Desplegado? |
|---|---|---|---|---|
| `/etc/nginx/lua/ape_gateway.lua` | 11 651 | `66a2001730d7e2b5…` **= 66a2001…** ✔ | `b9eb14061d5e2c81…` (**WIP distinto**) | HEAD |
| `/etc/nginx/lua/ape_uri_rebase.lua` | 6 043 | `1d456a463f9bcd65…` **= 1d456a4…** ✔ | `393635c2b2250fde…` (**WIP distinto**) | HEAD |
| `/etc/nginx/lua/ape_rebase_lib.lua` | 4 646 | `88140fc80ece09ca…` **= 88140fc…** ✔ | igual | HEAD |
| `/etc/nginx/lua/ape_header.lua` | 2 210 | `a15e1fe3748ff95c…` **= a15e1fe…** ✔ | `23b25b031964ca57…` (**WIP distinto**) | HEAD |
| `/etc/nginx/lua/ape_uhd.lua` | 5 320 | `f1f5eb674744858a…` **= f1f5eb6…** ✔ | igual | HEAD |

* **5/5 hashes idénticos a HEAD** ⇒ lo que audito aquí **es** lo que corre (coherente con t7 DR-02).
* El **WIP no commiteado** de otras sesiones (`git diff --stat -- _vps_stage/lua/` = **+378 / −4** en
  `ape_gateway.lua` (+172), `ape_header.lua` (+130), `ape_uri_rebase.lua` (+80)) **NO está desplegado**.
  ⇒ Cualquier hallazgo de este documento describe **producción**, no el WIP.
* **NO desplegados** (por eso la doctrina Crystal no aplica): `combined_body_filter.lua`, `ape_virtual_4k.lua`,
  `ape_codec_cascade.lua`, `floor_lock_filter.lua`, `ape_session.lua`, `ape_prefetch_next.lua`.
  Medido: `grep -rn "combined_body_filter|ape_crystal|virtual_4k|codec_cascade" /etc/nginx/` ⇒ **sólo
  comentarios**, ninguna directiva.

---

## 2. Qué familia de listas pasa por el rewrite (medido, no supuesto)

| Listas | Canales | URLs | ¿Pasa por `/cdn/`? |
|---|---|---|---|
| `APE_LISTA_1792869328847` (+ `_SHIELDED`) — vigente plain | 23 510 × 2 | 100 % **directas** `http://line.tivi-ott.net/live/<CRED>/…` | **NO** (`URL_CON_CDN=0`) |
| `APE_LISTA_1786899011456` · `…785735732934` · `…788145199732` | 25 905 · 10 172 · 25 669 | 100 % directas | **NO** |
| **`APE_LISTA_1792909103946_CDN_SHIELDED`** | 10 520 | **100 % `/cdn/`** | **SÍ (los 10 520)** |
| **`APE_LISTA_1792950212154_CDN_SHIELDED`** | 10 520 | **100 % `/cdn/`** | **SÍ (los 10 520)** |

**⇒ 95 776 canales (5 listas) no tocan el rewrite. 21 040 canales (2 listas `_CDN_SHIELDED`, las más nuevas)
pasan el 100 % por él.** Ésta es la separación real entre "familia VPS" y "familia directa": **no es el nombre
del archivo, es el prefijo de la URL de cada canal**.

---

## 3. El experimento: mismo fichero, antes y después del rewrite (loopback, sin proveedor)

Fichero de entrada: `_vps_stage/fixtures/selftest_master4k.m3u8` (378 B, master HLS canónico con 2 variantes).

```
── ANTES  ·  GET http://127.0.0.1:8088/__fixture_master4k.m3u8  (sin rewrite) ──────────────────
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-STREAM-INF:BANDWIDTH=28000000,AVERAGE-BANDWIDTH=22000000,RESOLUTION=3840x2160,FRAME-RATE=60.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ
2160p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="hvc1.1.6.L123.B0,mp4a.40.2"
1080p/index.m3u8

── DESPUÉS  ·  GET https://127.0.0.1/cdn/127.0.0.1:8088/__fixture_master4k.m3u8  (rewrite) ────
#EXTM3U
#EXT-X-APE-UPSCALE:declared=7680x4320;codec=truthful;mode=8k          ← tag NUEVO (propietario, inerte)
#EXT-X-VERSION:6
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-STREAM-INF:BANDWIDTH=28000000,AVERAGE-BANDWIDTH=22000000,RESOLUTION=7680x4320,FRAME-RATE=60.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ
http://127.0.0.1:8088/2160p/index.m3u8                                ← URI rebasada (relativa → absoluta)
#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="hvc1.1.6.L123.B0,mp4a.40.2"
http://127.0.0.1:8088/1080p/index.m3u8

headers de la respuesta reescrita:
  Content-Type: application/vnd.apple.mpegurl      (conservado)
  Transfer-Encoding: chunked                        (Content-Length eliminado — correcto)
  Cache-Control: no-store
  X-APE-CDN: 127.0.0.1:8088 · X-APE-Origin: http://127.0.0.1:8088
  X-APE-URI-Rebased: 2 · X-APE-UHD: 8k:1 · X-APE-LL-HLS: none · X-APE-LAB-FLOOR: 8000000
```

---

## 4. Diff eje por eje + veredicto de legitimidad

| Eje | Lista directa (lo que emite la APP) | Lo que devuelve el VPS por `/cdn/` | Mecanismo | Veredicto |
|---|---|---|---|---|
| **URIs de variante/segmento** | relativas o absolutas al proveedor | **absolutas al origen final** | `ape_rebase_lib.rebase_body` | ✅ **LEGÍTIMO** (RFC 8216 permite relativas; absolutizar es una transformación válida). **Pero** ver §5.1 (bug de resolución relativa) |
| **`CODECS`** | `hvc1.2.4.L150.B0,mp4a.40.2` | **idéntico, byte a byte** | `ape_uhd.declare` no lo toca (línea 10 del fichero: «NO toca `CODECS`») + guardia `codec_truth_fields()` | ✅ **LEGÍTIMO** — es el guard anti-FZ-01 (no declara HEVC sobre bytes AVC) |
| **Audio dentro de `CODECS`** | `mp4a.40.2` | **`mp4a.40.2` presente** | idem | ✅ **LEGÍTIMO** — no se pierde audio (el riesgo documentado del Crystal skill queda cerrado) |
| **`RESOLUTION`** | 3840×2160 | **7680×4320** (si top ≥ 4K) o **3840×2160** (si top < 4K) | `ape_uhd.declare_auto` (líneas 92-107) invocado en `ape_gateway.lua` (bloque `uhd_auto`) | ⚠️ **LEGÍTIMO como atributo, ILEGÍTIMO contra la Ley Cardinal 1** — ver §5.2 |
| **`BANDWIDTH` / `AVERAGE-BANDWIDTH`** | 28 000 000 / 22 000 000 | **sin cambios** | no hay código que los toque | ✅ **LEGÍTIMO** (no infla bitrate) |
| **`VIDEO-RANGE`** | `PQ` (1 vez) | **`PQ` (1 vez)** | `add_pq` sólo si flag `uhd_pq=1` (**default 0**) y **sólo si no existe** (línea 48) | ✅ **LEGÍTIMO** — **cero duplicados** (la trampa clásica, evitada) |
| **`#EXT-X-SERVER-CONTROL`** | ausente | **añadido** si la fuente trae `#EXT-X-PART`/`#EXT-X-PRELOAD-HINT` | `ape_rebase_lib.inject_server_control` (76-87) | ❌ **ILEGÍTIMO**: declara `CAN-BLOCK-RELOAD=YES` y **no hay implementación** (`grep _HLS_msn /etc/nginx/` ⇒ 0) |
| **`#EXT-X-APE-UPSCALE`** | ausente | **añadido** (`declared=…;codec=truthful;mode=…`) | `ape_uhd.declare` línea 63 | ✅ **LEGÍTIMO** — tag propietario, RFC 8216 §6.3.1 obliga a ignorarlo; es la marca de trazabilidad honesta |
| **Líneas en blanco** | presentes | **descartadas** | `rebase_body` línea 47 (`if line ~= ""`) | ✅ **LEGÍTIMO** — RFC 8216 permite líneas en blanco y los clientes las ignoran |
| **`Content-Length`** | el del upstream | **eliminado** (chunked) | `ape_header.lua` línea 20 | ✅ **LEGÍTIMO y necesario** (sin esto nginx truncaría el cuerpo reescrito — bug real documentado por la propia sesión) |
| **`Cache-Control`** | el del proveedor | **`no-store`** | `ape_gateway.lua` | ✅ **LEGÍTIMO** (un manifest rebasado no debe cachearse) |
| **`#EXT-X-TARGETDURATION`, `#EXT-X-MEDIA-SEQUENCE`, `#EXTINF`** | los del proveedor | **sin cambios** | no hay código | ✅ **LEGÍTIMO** (el rewrite no finge ser media playlist) |
| **`SUPPLEMENTAL-CODECS`, `HDCP-LEVEL`** | los del proveedor | **sin cambios** | no hay código | ✅ **LEGÍTIMO** (no inventa DV/LCEVC/HDCP) |

**Resumen:** de **12 ejes**, **9 legítimos**, **1 legítimo-con-reserva** (`RESOLUTION`), **1 ilegítimo**
(`SERVER-CONTROL`), **1 legítimo-pero-con-bug** (rebase de URIs relativas, §5.1).

---

## 5. Los 3 defectos reales del rewrite (con línea y reproducción)

### 5.1 · HIGH condicional · El rebase resuelve URIs relativas contra el **origen**, no contra la **URL de la playlist** (RFC 3986 §5.2)

**Código (desplegado, `ape_rebase_lib.lua`, idéntico en `ape_uri_rebase.lua`):**

```lua
23|    if uri:sub(1, 1) == "/" then return origin .. uri end
24|    return origin .. "/" .. uri          -- relativa al directorio
```

`origin` es **sólo** `http://<host>` (`ape_gateway.lua`: `final_origin = "http://" .. fh`; `ape_uri_rebase.lua`:
`set $ape_upstream_origin "http://$ape_host"`). **No incluye el path de la playlist.**

* **RFC 3986 §5.2 (merge de referencias):** una referencia relativa se resuelve contra la **URI base completa**
  de la playlist. Si la playlist está en `http://host/live/user/pass/playlist.m3u8` y el segmento es
  `seg-1.ts`, el resultado correcto es `http://host/live/user/pass/seg-1.ts`.
* **Lo que hace el código:** `http://host/seg-1.ts` ⇒ **404** ⇒ **freeze/rebuffer**.
* **Cuándo NO se manifiesta:** si el proveedor emite URIs **absolutas** (caso de los fixtures y de la mayoría de
  Xtream, que devuelven `http://cdn/.../seg.ts`), o si la playlist cuelga de la **raíz** (`/playlist.m3u8`).
  El experimento de §3 no lo expone porque el fixture está en la raíz (`/__fixture_master4k.m3u8`).
* **Severidad:** **HIGH condicional** — el impacto depende del proveedor. **Debe tratarse antes de exponer
  `/cdn/` a un proveedor que sirva segmentos relativos con path**. Corrección mínima: pasar la **URI base de la
  playlist** al rebase y resolver con ella (`origin .. dirname(path) .. "/" .. uri`), no con `origin .. "/"`.

### 5.2 · HIGH · La inflación de `RESOLUTION` **crea** una violación de la Ley Cardinal 1 en cada master 4K

**Código:** `ape_uhd.lua` líneas 92-107 (`declare_auto`), invocado desde `ape_gateway.lua` (`uhd_auto`, default `1`):

```lua
97|    if w >= 3840 then
98|        target, mode = M.TARGET_8K, "8k"      -- 7680x4320
99|    else
100|        target, mode = M.TARGET_4K, "4k"      -- 3840x2160
```

* **Medido en §3:** un master **4K@60 con `L153`** (level 5.1, techo **4K@60**) sale declarando **7680×4320**.
  `L153` no puede cargar 33 177 600 px (`MaxLumaPs` 5.1 = 8 912 896) ⇒ **nivel por debajo de la resolución**,
  que es literalmente el patrón del freeze 2026-06-08 descrito en la doctrina.
* **Alcance:** **todo** master con variante top ≥ 3840 px servido por `/cdn/` (con `uhd_auto=1`, el default).
  Los 21 040 canales de las 2 listas `_CDN_SHIELDED` pasan por ahí.
* **Salvaguarda que SÍ funciona:** `CODECS` no se toca y `codec_truth_fields()` aborta el UHD si encuentra
  `hev1` en `STREAM-INF` (`ape_gateway.lua`: `if uhd.codec_truth_fields(rebased) > 0 then … UHD omitido`).
  ⇒ **no se declara HEVC sobre bytes AVC** (no hay FZ-01 / pantalla negra).
* **Riesgo residual:** un player que valide nivel↔resolución **descarta la variante top** ⇒ el ABR engancha la
  1080p ⇒ **pérdida de calidad** (no freeze). Ilegalidad doctrinal: alta; impacto de reproducción: medio.
* **Veredicto:** la decisión es del **propietario** (2026-10-24, documentada en el propio módulo, líneas 1-22) y
  este auditor **no la revierte**; pero debe constar que **crea exactamente la combinación que la Ley
  Cardinal 1 prohíbe**, y que el módulo lo sabe (no toca `CODECS`) y no lo evita (sí toca `RESOLUTION`).

### 5.3 · MEDIUM · `CAN-BLOCK-RELOAD=YES` sin implementación (y `CAN-SKIP-UNTIL` no atado al `TARGETDURATION`)

```lua
76|function M.inject_server_control(body)
79|    local pt = body:match("#EXT%-X%-PART%-INF:PART%-TARGET=([%d%.]+)")
80|    local hold = 3.0 * (tonumber(pt) or 1.0)
82|        "#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,CAN-SKIP-UNTIL=%.3f,PART-HOLD-BACK=%.3f",
83|        hold * 6.0, hold)
```

* **`CAN-BLOCK-RELOAD=YES`** ⇒ el cliente **puede** enviar `_HLS_msn`/`_HLS_part` y esperar respuesta bloqueada.
  Medido: **0 implementaciones** (`grep -rn "_HLS_msn\|_HLS_part" /etc/nginx/` ⇒ vacío). El gateway responde
  de inmediato ⇒ el player puede quedar recargando el mismo manifest.
* **`CAN-SKIP-UNTIL = 18 × PART-TARGET`**: el draft exige un valor **≥ 6 × `TARGETDURATION`**. Con
  `PART-TARGET=1.0` y `TARGETDURATION=2` ⇒ 18 ≥ 12 ✔; pero con `TARGETDURATION ≥ 4` ⇒ 18 < 24 ✘.
  No es una violación universal, es **condicional al `TARGETDURATION` de la fuente** ⇒ LOW/MEDIUM.
* **Alcance:** sólo fuentes que **ya** traen `#EXT-X-PART` (LL-HLS real). En Xtream es raro ⇒ severidad MEDIUM.

### 5.4 · INFO · `/meta/` no es alcanzable ni acepta `host:puerto`

* `curl https://127.0.0.1/meta/…` ⇒ **404** (no incluido en el vhost 443).
* `curl http://127.0.0.1:8088/meta/127.0.0.1:8088/__fixture_master4k.m3u8` ⇒ **404**, porque la regex del
  location (`^/meta/(?<ape_host>[A-Za-z0-9._-]+)(?<ape_path>/.*)$`) **no admite `:`** y los proveedores Xtream
  se direccionan como `host:puerto` (la doctrina misma usa `94.176.111.218:80` como ejemplo).
* **No es un bug del rewrite** (es su superficie la que no cubre ese caso): `/cdn/` usa `[^/]+` y **sí** lo admite.
  Consecuencia práctica: **la única ruta pública de rewrite es `/cdn/`**, y es la que hay que auditar.

---

## 6. Qué **no** hace el rewrite (contra los temores habituales) — todo medido

| Temor | Realidad medida |
|---|---|
| «El VPS reescribe el códec y rompe la decodificación» | **Falso**: `CODECS` intacto; guardia `codec_truth_fields()` aborta UHD si hay `hev1`. 0 cambios observados |
| «El rewrite rompe el audio (el bug clásico)» | **Falso**: `mp4a.40.2` sigue en `CODECS` en el antes y en el después |
| «Duplica `VIDEO-RANGE`» | **Falso**: 1 sola ocurrencia antes y después; el código sólo añade si **no existe** |
| «Inyecta `SUPPLEMENTAL-CODECS` / DV falso» | **Falso**: 0 apariciones nuevas; el módulo no tiene esa rama |
| «Cambia el bitrate declarado» | **Falso**: `BANDWIDTH`/`AVERAGE-BANDWIDTH` no se tocan |
| «El VPS transporta el vídeo» | **Falso**: `\.ts|\.m4s|\.mp4$ → 404` en las dos superficies |
| «El rewrite aplica a las listas servidas» | **Falso**: `/lists/` es estático (0 headers `X-APE-*`); sólo `/cdn/` reescribe |

---

## 7. Veredicto final (una tabla)

| Pregunta | Respuesta medida |
|---|---|
| ¿El catálogo servido es igual a lo que emite la APP? | **SÍ, byte a byte** (el `.gz` descomprimido; sin intervención Lua) |
| ¿El rewrite cambia legítimamente lo que la APP emite? | **Parcialmente.** 9/12 ejes legítimos; `RESOLUTION` legítimo-RFC pero viola la Ley Cardinal 1; `SERVER-CONTROL` ilegítimo (capacidad inexistente); rebase con bug RFC 3986 para URIs relativas |
| ¿Afecta a las listas que hoy se sirven? | **Sólo a los 21 040 canales de las 2 listas `_CDN_SHIELDED`**; los otros 95 776 van directos al proveedor |
| ¿Rompe el audio, duplica `VIDEO-RANGE`, inventa DV/CMAF? | **NO / NO / NO** (medido) |
| ¿Debe corregirse algo en producción? | **No por esta auditoría** (`iptv-vps-touch-nothing`): los 3 defectos son **documentales** y requieren decisión del propietario. El único con riesgo de reproducción real es §5.1 (URIs relativas) y sólo con proveedores que las usen |

---

*Fin de `LISTS_DIFF_VPS_VS_DIRECT.md`. Diff medido antes/después sobre el mismo fichero; 12 ejes evaluados;
5 módulos desplegados con hash = HEAD; `/shield/` = 404 (D-33 confirmado); 3 defectos con línea de código.*
