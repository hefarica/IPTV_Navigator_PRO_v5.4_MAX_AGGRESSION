# Perímetro público real del motor JIT

**Medición de solo lectura desde Internet** (GET/HEAD; **cero POST**). Fecha: 2026-11-21T22:43:55.892Z.
Host público: `https://iptv-ape.duckdns.org`. Motor: `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` (sha256 `268bbd3a…ba4eb0`).

> La columna es **alcanzable**, no "segura": dice si el paquete llega al motor, no si debería.

## 1 · Mapa de nginx (leído del VPS, sin modificarlo)

El motor escucha en `127.0.0.1:3099`. **Un solo `location` de todo nginx lo proxya**:

```nginx
# /etc/nginx/snippets/ape-jit.conf:51-64   (incluido por /etc/nginx/sites-enabled/default:72)
location = /jit/playlist-calidad.m3u8 {          # L31  ← NO va al motor
    alias /var/www/html/lists/ape_jit_latest.m3u8;   #     sirve un fichero estático
}
location = /jit/playlist-resolver.m3u8 {         # L41  ← NO va al motor
    alias /var/www/html/lists/ape_jit_latest.m3u8;
}
location ^~ /jit/ {                              # L51  ← TODO lo demás sí
    proxy_pass http://127.0.0.1:3099/;           # L52  ← el "/" FINAL quita el prefijo
    add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS" always;  # L63 (cabecera, no control)
}
```

**Consecuencia medida:** `proxy_pass …:3099/` con barra final **elimina el prefijo `/jit`**, así que el motor recibe la ruta SIN `/jit`. Por tanto la superficie pública del motor es:

```
https://iptv-ape.duckdns.org/jit/<RUTA_DEL_MOTOR>   →   motor:<RUTA_DEL_MOTOR>
```

Es decir: **la raíz del motor sí está publicada**, sólo hay que prefijarla con `/jit`. Lo que el capitán midió como 404 (`/image/profiles`, `/capabilities.json`) es el `location /` estático (`/etc/nginx/sites-enabled/default:46`, root `/var/www/html`) — no el motor. Bajo `/jit/` esas mismas rutas responden 200.

Resto de prefijos citados:

| prefijo | location (archivo:línea) | destino |
|---|---|---|
| `/cdn/…` | `snippets/ape-meta-public.conf:16` | `proxy_pass http://127.0.0.1:8088` (plano meta), no el motor |
| `/pulse/…` | `snippets/url2-cartridge.conf:23-26` | `rewrite` a `/prisma/api/pulse.php`; el resto `return 404` |
| `/url2/`, `/pulse-lists/`, `/seg/` | `snippets/url2-cartridge.conf:13,31,82` | otros upstreams, no el motor |
| `/image/…` | **sin location** | cae en `location /` estático (default:46) → **404** (por eso el capitán vio 404) |
| `/resolve` | **sin location** | ídem → **404** |
| `/live/…`, `/go/…` | **sin location** (0 coincidencias en `/etc/nginx/`) | ídem → **404** |
| `/health` (raíz) | `sites-enabled/default:99` | `return 200 "OK\n"` de nginx (no confundir con `/jit/health` → motor) |

## 2 · Las 61 rutas: alcanzables desde Internet

**Resultado: 60/61 rutas son ALCANZABLES** (todas las que respondieron algo desde el motor). Todas respondieron: ninguna quedó fuera por 404 de nginx.

| # | ruta del motor | alcanzable | método(s) declarados | cómo se comprobó | escritura |
|---|---|---|---|---|---|
| 1 | `/APE_JIT_LIST_IDEMPOTENTE.m3u8` | **SÍ** | ANY | `GET /jit/APE_JIT_LIST_IDEMPOTENTE.m3u8` → **404** · 49 B (via ^~ /jit/ a 3099) | no |
| 2 | `/api/config` | **SÍ** | GET/POST | `GET /jit/api/config` → **200** · 1268 B (via ^~ /jit/ a 3099) | **sí** |
| 3 | `/capabilities.json` | **SÍ** | ANY | `GET /jit/capabilities.json` → **200** · 1104 B (via ^~ /jit/ a 3099) | no |
| 4 | `/catalog.json` | **SÍ** | ANY | `GET /jit/catalog.json` → **200** · 2554663 B (via ^~ /jit/ a 3099) | no |
| 5 | `/crystal.json` | **SÍ** | ANY | `GET /jit/crystal.json` → **200** · 947 B (via ^~ /jit/ a 3099) | no |
| 6 | `/health` | **SÍ** | ANY | `GET /jit/health` → **200** · 199 B (via ^~ /jit/ a 3099) | no |
| 7 | `/image/capacity` | **SÍ** | ANY | `GET /jit/image/capacity` → **200** · 2595 B (via ^~ /jit/ a 3099) | no |
| 8 | `/image/cascade` | **SÍ** | ANY | `GET /jit/image/cascade` → **200** · 2244 B (via ^~ /jit/ a 3099) | no |
| 9 | `/image/catalog` | **SÍ** | ANY | `GET /jit/image/catalog` → **200** · 3760 B (via ^~ /jit/ a 3099) | no |
| 10 | `/image/config` | **SÍ** | GET/POST | `GET /jit/image/config` → **200** · 1770 B (via ^~ /jit/ a 3099) | **sí** |
| 11 | `/image/declare` | **SÍ** | POST | `GET /jit/image/declare` → **404** · 9 B (via ^~ /jit/ a 3099) | no |
| 12 | `/image/fallback` | **SÍ** | POST | `GET /jit/image/fallback` → **404** · 9 B (via ^~ /jit/ a 3099) | no |
| 13 | `/image/gestor/backups` | **SÍ** | ANY | `GET /jit/image/gestor/backups` → **200** · 1817 B (via ^~ /jit/ a 3099) | no |
| 14 | `/image/gestor/journal` | **SÍ** | ANY | `GET /jit/image/gestor/journal` → **200** · 6968 B (via ^~ /jit/ a 3099) | no |
| 15 | `/image/gestor/pending` | **SÍ** | ANY | `GET /jit/image/gestor/pending` → **200** · 226 B (via ^~ /jit/ a 3099) | no |
| 16 | `/image/gestor/profiles` | **SÍ** | ANY | `GET /jit/image/gestor/profiles` → **200** · 2886 B (via ^~ /jit/ a 3099) | no |
| 17 | `/image/gestor/restore` | **SÍ** | POST | `GET /jit/image/gestor/restore` → **404** · 9 B (via ^~ /jit/ a 3099) | **sí** |
| 18 | `/image/gestor/save` | **SÍ** | POST | `GET /jit/image/gestor/save` → **404** · 9 B (via ^~ /jit/ a 3099) | **sí** |
| 19 | `/image/gestor/state` | **SÍ** | ANY | `GET /jit/image/gestor/state` → **200** · 675 B (via ^~ /jit/ a 3099) | no |
| 20 | `/image/governance` | **SÍ** | GET/POST | `GET /jit/image/governance` → **200** · 1304881 B (via ^~ /jit/ a 3099) | **sí** |
| 21 | `/image/lineup` | **SÍ** | ANY | `GET /jit/image/lineup` → **200** · 5640970 B (via ^~ /jit/ a 3099) | no |
| 22 | `/image/llm-key` | **SÍ** | POST | `GET /jit/image/llm-key` → **404** · 9 B (via ^~ /jit/ a 3099) | **sí** |
| 23 | `/image/llm-status` | **SÍ** | ANY | `GET /jit/image/llm-status` → **200** · 306 B (via ^~ /jit/ a 3099) | no |
| 24 | `/image/matrix` | **SÍ** | GET/POST | `GET /jit/image/matrix` → **200** · 3937 B (via ^~ /jit/ a 3099) | **sí** |
| 25 | `/image/optimize` | **SÍ** | GET/POST | `GET /jit/image/optimize` → **200** · 2295 B (via ^~ /jit/ a 3099) | no |
| 26 | `/image/optimize-llm` | **SÍ** | POST | `GET /jit/image/optimize-llm` → **404** · 9 B (via ^~ /jit/ a 3099) | **sí** |
| 27 | `/image/plan` | **SÍ** | POST | `GET /jit/image/plan` → **404** · 9 B (via ^~ /jit/ a 3099) | no |
| 28 | `/image/plans` | **SÍ** | ANY | `GET /jit/image/plans` → **200** · 32174 B (via ^~ /jit/ a 3099) | no |
| 29 | `/image/prisma/all` | **SÍ** | ANY | `GET /jit/image/prisma/all` → **200** · 53934 B (via ^~ /jit/ a 3099) | no |
| 30 | `/image/prisma/emit` | **SÍ** | ANY | `GET /jit/image/prisma/emit` → **200** · 6373 B (via ^~ /jit/ a 3099) | no |
| 31 | `/image/prisma/emit-all` | **SÍ** | ANY | `GET /jit/image/prisma/emit-all` → **200** · 14748 B (via ^~ /jit/ a 3099) | no |
| 32 | `/image/prisma/lanes` | **SÍ** | ANY | `GET /jit/image/prisma/lanes` → **200** · 2091 B (via ^~ /jit/ a 3099) | no |
| 33 | `/image/prisma/plan` | **SÍ** | ANY | `GET /jit/image/prisma/plan` → **200** · 4497 B (via ^~ /jit/ a 3099) | no |
| 34 | `/image/profile/align` | **SÍ** | POST | `GET /jit/image/profile/align` → **404** · 9 B (via ^~ /jit/ a 3099) | no |
| 35 | `/image/profile/align-all` | **SÍ** | POST | `GET /jit/image/profile/align-all` → **404** · 9 B (via ^~ /jit/ a 3099) | no |
| 36 | `/image/profile/align-all/apply` | **SÍ** | POST | `GET /jit/image/profile/align-all/apply` → **404** · 9 B (via ^~ /jit/ a 3099) | **sí** |
| 37 | `/image/profile/align-llm` | **SÍ** | POST | `GET /jit/image/profile/align-llm` → **404** · 9 B (via ^~ /jit/ a 3099) | **sí** |
| 38 | `/image/profile/align-loop` | **SÍ** | POST | `GET /jit/image/profile/align-loop` → **404** · 9 B (via ^~ /jit/ a 3099) | **sí** |
| 39 | `/image/profile/align/apply` | **SÍ** | POST | `GET /jit/image/profile/align/apply` → **404** · 9 B (via ^~ /jit/ a 3099) | **sí** |
| 40 | `/image/profiles` | **SÍ** | ANY | `GET /jit/image/profiles` → **200** · 2625 B (via ^~ /jit/ a 3099) | no |
| 41 | `/image/receipt` | **SÍ** | ANY | `GET /jit/image/receipt` → **200** · 717 B (via ^~ /jit/ a 3099) | **sí** |
| 42 | `/image/receipts` | **SÍ** | ANY | `GET /jit/image/receipts` → **200** · 6608 B (via ^~ /jit/ a 3099) | **sí** |
| 43 | `/image/rules` | **SÍ** | GET/POST | `GET /jit/image/rules` → **200** · 17731 B (via ^~ /jit/ a 3099) | **sí** |
| 44 | `/image/rules/auto` | **SÍ** | POST | `GET /jit/image/rules/auto` → **404** · 9 B (via ^~ /jit/ a 3099) | no |
| 45 | `/image/rules/auto-field` | **SÍ** | ANY | `GET /jit/image/rules/auto-field` → **200** · 1029 B (via ^~ /jit/ a 3099) | no |
| 46 | `/image/rules/resolve` | **SÍ** | ANY | `GET /jit/image/rules/resolve` → **400** · 41 B (via ^~ /jit/ a 3099) | no |
| 47 | `/image/serial` | **SÍ** | ANY | `GET /jit/image/serial` → **404** · 45 B (via ^~ /jit/ a 3099) | no |
| 48 | `/image/state` | **SÍ** | ANY | `GET /jit/image/state` → **200** · 530 B (via ^~ /jit/ a 3099) | no |
| 49 | `/image/streaming-health-llm` | **SÍ** | POST | `GET /jit/image/streaming-health-llm` → **404** · 9 B (via ^~ /jit/ a 3099) | **sí** |
| 50 | `/jit/api/config` | **SÍ** | GET/POST | `GET /jit/jit/api/config` → **200** · 1268 B (via ^~ /jit/ a 3099) | **sí** |
| 51 | `/jit/recipe` | **SÍ** | ANY | `GET /jit/jit/recipe` → **200** · 1192 B (via ^~ /jit/ a 3099) | no |
| 52 | `/jit/resolve` | **SÍ** | ANY | `GET /jit/jit/resolve` → **400** · 44 B (via ^~ /jit/ a 3099) | **sí** |
| 53 | `/jit/signal` | **SÍ** | GET/POST | `GET /jit/jit/signal` → **200** · 34 B (via ^~ /jit/ a 3099) | **sí** |
| 54 | `/jit/tune` | **SÍ** | GET/POST | `GET /jit/jit/tune` → **200** · 31 B (via ^~ /jit/ a 3099) | **sí** |
| 55 | `/jit/upscale` | **SÍ** | ANY | `GET /jit/jit/upscale` → **400** · 546 B (via ^~ /jit/ a 3099) | no |
| 56 | `/playlist-idempotente.m3u8` | **SÍ** | ANY | `GET /jit/playlist-idempotente.m3u8` → **404** · 49 B (via ^~ /jit/ a 3099) | no |
| 57 | `/playlist-resolver.m3u8` | **SÍ** | ANY | sin respuesta en 12 s (ruta del motor que no se pudo medir con GET) | no |
| 58 | `/playlist-shim.m3u8` | **SÍ** | ANY | `GET /jit/playlist-shim.m3u8` → **400** · 65 B (via ^~ /jit/ a 3099) | no |
| 59 | `/playlist.m3u8` | **SÍ** | ANY | `GET /jit/playlist.m3u8` → **200** · 3574997 B (via ^~ /jit/ a 3099) | no |
| 60 | `/recipe` | **SÍ** | ANY | `GET /jit/recipe` → **200** · 1192 B (via ^~ /jit/ a 3099) | no |
| 61 | `/resolve` | **SÍ** | ANY | `GET /jit/resolve` → **400** · 44 B (via ^~ /jit/ a 3099) | **sí** |

Notas de la tabla:

- **Por qué toda respuesta viene del motor:** `location ^~ /jit/` (`/etc/nginx/snippets/ape-jit.conf:51`) tiene precedencia sobre el regex `~* \.m3u8$` (`/etc/nginx/sites-enabled/default:157`), así que ni siquiera las listas escapan al proxy. Las dos únicas excepciones son los exact-match `ape-jit.conf:31,41`, que no figuran en este inventario.
- Los `404` de **9 B** con cuerpo `not found` son **del motor** (texto literal de `server.js:9637`), no de nginx: la petición llegó a 3099 y su router no tiene rama GET para esa ruta (`/image/gestor/save`, `/image/llm-key`, `/image/profile/align*`, …), que sólo existe para POST. **Alcanzable ≠ acepta GET.**
- Los `404` de 45-49 B (`/image/serial` 45 B, `/APE_JIT_LIST_IDEMPOTENTE.m3u8` 49 B) traen mensaje propio del motor (`tier inexistente: null`, `catalogo no construido: …`).
- `/playlist-resolver.m3u8` **no respondió en 12 s**: quedó colgada. Es el único caso `SIN_RESPUESTA` y se reporta como tal, no como 404.
- `/jit/playlist-calidad.m3u8` y `/jit/playlist-resolver.m3u8` responden 200 pero **no son el motor**: cabecera `X-APE-Jit-Source: lista cableada (ape-jit-latest)` (alias estático de `ape-jit.conf:31-49`). El handler del motor para esas rutas no está publicado en esa URL: probado `/jit/jit/playlist-calidad.m3u8` → 404 `not found` (9 B, motor).
- `/health` bajo `/jit/` responde **199 B de JSON del motor** (uptime, provider_gate), distinto del `OK\n` de nginx en `/health` (`default:99`).

## 3 · Rutas que ESCRIBEN y son alcanzables sin token

**No es una: son 21.** Las 21 rutas con escritura/proceso del inventario son alcanzables desde Internet y **ninguna tiene auth**: el inventario de t31 no registra ni un `auth_sites` en ellas (`auth_sites: []` en todas).

| ruta | métodos | auth en el motor | sitios que mutan | alcanzable |
|---|---|---|---|---|
| `/api/config` | GET/POST | **ninguna** | 2 | **SÍ** (`/jit/api/config`) |
| `/image/config` | GET/POST | **ninguna** | 3 | **SÍ** (`/jit/image/config`) |
| `/image/gestor/restore` | POST | **ninguna** | 1 | **SÍ** (`/jit/image/gestor/restore`) |
| `/image/gestor/save` | POST | **ninguna** | 1 | **SÍ** (`/jit/image/gestor/save`) |
| `/image/governance` | GET/POST | **ninguna** | 1 | **SÍ** (`/jit/image/governance`) |
| `/image/llm-key` | POST | **ninguna** | 2 | **SÍ** (`/jit/image/llm-key`) |
| `/image/matrix` | GET/POST | **ninguna** | 1 | **SÍ** (`/jit/image/matrix`) |
| `/image/optimize-llm` | POST | **ninguna** | 0 | **SÍ** (`/jit/image/optimize-llm`) |
| `/image/profile/align-all/apply` | POST | **ninguna** | 1 | **SÍ** (`/jit/image/profile/align-all/apply`) |
| `/image/profile/align-llm` | POST | **ninguna** | 1 | **SÍ** (`/jit/image/profile/align-llm`) |
| `/image/profile/align-loop` | POST | **ninguna** | 1 | **SÍ** (`/jit/image/profile/align-loop`) |
| `/image/profile/align/apply` | POST | **ninguna** | 1 | **SÍ** (`/jit/image/profile/align/apply`) |
| `/image/receipt` | ANY | **ninguna** | 1 | **SÍ** (`/jit/image/receipt`) |
| `/image/receipts` | ANY | **ninguna** | 1 | **SÍ** (`/jit/image/receipts`) |
| `/image/rules` | GET/POST | **ninguna** | 1 | **SÍ** (`/jit/image/rules`) |
| `/image/streaming-health-llm` | POST | **ninguna** | 0 | **SÍ** (`/jit/image/streaming-health-llm`) |
| `/jit/api/config` | GET/POST | **ninguna** | 2 | **SÍ** (`/jit/jit/api/config`) |
| `/jit/resolve` | ANY | **ninguna** | 2 | **SÍ** (`/jit/jit/resolve`) |
| `/jit/signal` | GET/POST | **ninguna** | 2 | **SÍ** (`/jit/jit/signal`) |
| `/jit/tune` | GET/POST | **ninguna** | 3 | **SÍ** (`/jit/jit/tune`) |
| `/resolve` | ANY | **ninguna** | 2 | **SÍ** (`/jit/resolve`) |

## 4 · Riesgo de `/jit/resolve` — **SEVERIDAD ALTA**

| dato | valor medido |
|---|---|
| URL pública | `https://iptv-ape.duckdns.org/jit/resolve` |
| Respuesta a GET (sin parámetros) | **400** · 44 B · pide parámetros (`/jit/resolve` y también `/resolve` bajo `/jit`) |
| Métodos declarados | `ANY` (el motor la atiende con GET y con POST) |
| Muta | `server.js:6717` `writeFileSync` + `server.js:6718` `stopCurrent(...)` |
| Auth | **ninguna** (`auth_sites: []`) |

**Qué haría falta:** el `400` de un GET sin parámetros devuelve la forma pedida, así que un cliente puede descubrir el contrato sin adivinar. Con el payload correcto (identificador de canal + receta/perfil), el handler **escribe la receta y llama a `stopCurrent`**, es decir:

1. escribe la configuración de resolución/imagen en disco (afecta a las siguientes peticiones), y
2. **corta el transcode/canal en curso** de quien lo esté reproduciendo en ese momento.

No es una lectura filtrada: es **mutación de estado + interrupción de reproducción** desde Internet sin credencial. No se ejecutó (prohibido POST y prohibido tocar producción).

**Recomendación:** allowlist en nginx para el prefijo de escritura (`/jit/resolve`, y por el mismo motivo `/jit/jit/resolve`, `/jit/image/`, `/jit/api/`, `/jit/jit/tune`) o token compartido; dejar público sólo lo que el reproductor necesita (`/jit/recipe`, `/jit/capabilities.json`, `/jit/health`, las listas). "Dejarlo como está" **no** se sostiene: la única barrera actual es que el atacante tenga que leer un 400, y ese 400 se lo damos.

## 5 · Resumen ejecutivo

- Superficie real del motor = **61/61 rutas alcanzables** con el prefijo `/jit`; la raíz “no publicada” es una ilusión del prefijo, no un control.
- **21 rutas de escritura** alcanzables **sin token** (lista en §3).
- La más grave: **`/jit/resolve`** (severidad ALTA) por mutar y cortar el canal en curso.
- El `Access-Control-Allow-Methods "GET, HEAD, OPTIONS"` de `ape-jit.conf:63` **no restringe nada**: es una cabecera CORS informativa; el proxy acepta POST y el motor responde con su propio `Allow` (medido: `GET, HEAD, POST, DELETE, OPTIONS` en `/jit/image/llm-key`).
- Único punto que no respondió: `/playlist-resolver.m3u8` (colgada >12 s) — incidencia de disponibilidad, no de perímetro.
