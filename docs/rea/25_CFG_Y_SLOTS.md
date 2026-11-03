# 25 · `/a` consume slots de calidad + `POST /a/cfg` (repo-only)

**Tarea:** `t58` · **attempt:** `42201d4f-0cf9-4d91-a9ad-6bd7dd937af7` · **Autor:** `s6-nginx-lua` (S6) · **HEAD:** `2f8861c`
**Estado:** aplicado en repo, **sin deploy ni commits**. 2 ficheros: `_vps_stage/lua/ape_attr.lua` (493 → **663 L**) y `_vps_stage/nginx/meta-plane.conf` (+27, **0 borrados**).

## 1 · Slots de calidad (16–26) → un tag, sólo con dato

| Slot | Campo en `#EXT-X-APE-AUDIO` | Valores |
|---|---|---|
| 16 | `codec=` | 1 AAC · 2 AC3 · 3 EAC3 · 4 DTS · 5 TRUEHD · 6 OPUS |
| 17 | `ch=` | nº de canales |
| 18 | `chroma=` | 0→`420` · 1→`422` · 2→`444` |
| 19 | `gop=` | frames |
| 20 | `hdr=` | 1 SDR · 2 HDR10 · 3 HDR10+ · 4 DV · 5 HLG |
| 21 | `pq=P<n>` (+ `#EXT-X-APE-Q:…;profile=P<n>`) | P0–P5 |
| 22 | `depth=` | 8/10/12 |
| 23 | `fps=` | ×100 → `%.2f` (5994 → `59.94`) |
| 24/25 | `w=` `h=` | píxeles |
| 26 | `tier=` | F0–F5 |

Orden del tag: `codec;ch;chroma;gop;hdr;pq;depth;fps;w;h;tier`. **Sin dato (ausente o `0xFFFF`) el campo no aparece**; si no hay ningún campo, **no se emite el tag**. Sólo OTT (gate `D6`), igual que el resto del namespace.

**Decisión que hubo que tomar:** los slots 16–26 caían antes en el namespace custom `D6` (`#EXT-X-APE-C16:…`). Ahora **se excluyen de D6** para que cada slot salga **una sola vez**; los slots 27–895 siguen emitiéndose como `#EXT-X-APE-C<slot>`. Sin esa exclusión, cada slot de calidad salía duplicado (detectado por el test de byte-identidad).

`#EXT-X-APE-Q` **se fusiona**, no se duplica: si ya emitía `uhd/hdr/flags`, el `profile=P<n>` se añade a la misma línea; si no había nada más, sale sólo `profile=`.

## 2 · `POST /a/cfg` — contrato

```
POST /a/cfg
X-APE-Session: <id de sesión>            (NUNCA en la query)
X-APE-Cfg: <hex16>                        HMAC-SHA256(clave, "cfg|<sesión>|<body>")[:16]
Content-Type: application/json
Body ≤ 64 KB   {"pq":2,"hdr":3,"ua_mode":1,"referer_mode":1,"ttl":120}
```
| Código | Cuándo |
|---|---|
| **204** | escrito en `ngx.shared.ape_attr_cfg` (`cfg:<sesión>`, TTL = `ttl` acotado a 1…3600, default 300) |
| **400** | sin sesión · body vacío · >64 KB · no es objeto JSON · JSON sin cierre · sin `ape_attr_cfg` |
| **403** | sin clave · HMAC ausente · HMAC inválido |
| **429** | rate-limit: **6 escrituras / 60 s / sesión** (contador en el mismo dict) |
| **405** | método distinto de POST |

**Nunca** devuelve el cuerpo, la clave ni el HMAC. Respuesta de error: `{"ok":false,"error":"<motivo>"}`.

**Aplicación en `GET /a`:** `cfg_overrides()` lee `cfg:<sesión>` y extrae enteros (`pq`, `hdr`, `ua_mode`, `referer_mode`, `source_format`, `audio_codec`, `bit_depth`) y **rellena huecos**: el payload siempre gana. **Fail-open**: si la config no existe, está corrupta o el dict no está, `GET /a` responde exactamente como hoy.

**nginx (repo, sin deploy):** `lua_shared_dict ape_attr_cfg 1m;` + `location = /a/cfg` con `allow 127.0.0.1; deny all;` (loopback), `client_max_body_size 64k`, `client_body_buffer_size 64k`, `access_log off`, `default_type application/json`. El snippet del 443 **no** expone `/a/cfg`.

## 3 · Tests (lua5.1 + luac del VPS, staged en `/tmp/t58`)

| Test | Exit | Resultado |
|---|---|---|
| `luac -p` módulo + harness | **0** | sin errores |
| Harness (29 aserciones) | **0** | **29/29 pass, 0 fail** |
| **Byte-idéntico a t54** sin slots de calidad (7 escenarios × 2 UAs) | — | **14/14** |
| `#EXT-X-APE-AUDIO` completo | — | `codec=2;ch=6;chroma=422;gop=48;hdr=3;pq=P1;depth=10;fps=59.94;w=3840;h=2160;tier=1` |
| `0xFFFF` y ausencias | — | sin tag / sin campo; `chroma` mapea 2→`444` |
| Q con profile (+ con uhd/flags) | — | `#EXT-X-APE-Q:uhd=4k;hdr=0;flags=8;profile=P2` |
| Calidad en TiviMate | — | **no se emite** (gate UA) |
| `/a/cfg` OK / HMAC malo / ausente / sin sesión / body 70 KB / no-JSON | — | **204 · 403 · 403 · 400 · 400 · 400** |
| TTL default 300 y tope 3600 | — | ✔ |
| Rate-limit | — | 6×204 y la **7ª = 429** |
| Overrides: lee, no existe ⇒ nil, config rota ⇒ nil, **payload gana** | — | ✔ |
| Crypto/contrato intactos | — | HMAC RFC 4231 TC1 ✔ · `verify` 16 B ✔ · `#EXT-X-APE-STALE:1\n` exacto ✔ |
| `build_fragment` 1000 slots | — | **5,3 ms** (presupuesto 80 ms) |

## 4 · Riesgos y límites (honestos)

1. **`/a/cfg` es el ÚNICO endpoint de escritura del plano.** Por eso nace loopback-only, con HMAC en cabecera, `client_max_body_size`, rate-limit por sesión y sin eco de datos. Si algún día se publica en el 443, exige revisión de S10 y token rotatorio.
2. **El parseo JSON es mínimo** (extracción de enteros por patrón, sin `cjson`): no valida tipos ni rechaza claves desconocidas. Documentado a propósito: una config con basura se ignora campo a campo, no rompe la respuesta.
3. **El rate-limit vive en el `lua_shared_dict`**: si el dict se llena o se reinicia, el contador se pierde (fail-open, no fail-closed).
4. **Nada de esto está desplegado**: `/etc/nginx/lua/ape_attr*` no existe, `nginx -T` sha `255425a97a6fcdbe` sin cambios, `NRestarts=0`. El `lua_shared_dict` nuevo tampoco está en el VPS.
5. **NOT_RUN**: efecto real en el panel, y el comportamiento de OTT Navigator frente a `#EXT-X-APE-AUDIO` (tag inerte por RFC 8216 §6.3.1) — nadie lo ha probado en device.
