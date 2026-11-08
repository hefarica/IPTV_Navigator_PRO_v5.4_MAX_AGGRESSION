---
name: iptv-ape-apk-vps-contract-alignment
description: Contrato medido APK <-> VPS <-> lista .m3u8 <-> generador del ecosistema IPTV APE. Usar SIEMPRE que se toque la APK ape-crystal-agent (com.ape.crystalagent / com.ape.crystalagent.rea), se publique /ara/agent.apk o /ara/version.json, se modifique /sync o el protocolo ARA-X-SYNC-V1, se audite la paridad repo<->VPS de un endpoint, o se diagnostique un 401/403/404 en la ruta device->VPS. Contiene la cadena de identidad real de la build REA, la matriz de endpoints medida el 2026-11-07 y los dos defectos de alineacion confirmados (health_url roto y APK 652 sin publicar).
---

# IPTV APE · Contrato APK ↔ VPS ↔ lista ↔ generador

Todo lo de aqui fue **medido** el 2026-11-07 con comandos reproducibles. Donde no hay dato, dice
`NO COMPUTADO` y su razon. No hay prosa de relleno: cada afirmacion lleva su artefacto.

---

## PARTE 0 — La regla que evita el falso negativo

**Nunca declares ausencia desde un listado truncado.**

En la sesion que produjo esta skill se reporto *«el APK no contiene `/ara/events`»* a partir de un
`Select-Object -First 50` sobre una lista ordenada alfabeticamente: `/api/*` (clases JUnit) lleno las
50 posiciones y `/ara/*` quedo fuera. El literal **si estaba** (`Config.PATH_EVENTS`).

Antes de afirmar que un literal no existe:

```bash
# MAL: se trunca y mientes
grep -c foo archivo | head -50
# BIEN: cuenta exhaustiva y revisa el 0
grep -c foo archivo
```

Y si buscas por patron sobre un blob, verifica con **dos** lectores independientes (`grep` del nombre
completo + el inventario estructurado del decompilador).

---

## PARTE 1 — Cadena de identidad real de la APK

La build REA **no es un codigo divergente**. Es la APK que sirve el VPS, parcheada.

```
APK base  = 8d3b145811c0bab3a10952329a81cadc477b08bd365b70f173cfe34ff52aa6e4
              ^ este sha256 es EXACTAMENTE /ara/agent.apk en el VPS
           = package com.ape.crystalagent, versionCode 651, versionName 3.9.5-adb-firetv-shim
             (25.678.434 bytes)
   │
   │  apktool 3.0.3 --no-debug-info
   │  integration/apply_hdr_patch.py      (efectos espaciales HDR, media3 1.3.1)
   │  integration/apply_host_ott_patch.py (ottshim, ZapReceiver, SettingsApplier, AbTest)
   │  integration/clone_identity.py       (rebrand del paquete)
   │  integration/build_java.py           (ECJ + D8 para las clases com.ape.rea.*)
   │  integration/package_apk.py          (re-empaquetado)
   ▼
APK REA   = 79c7d1fd2ad8f71f1b77c6171bab411e8fad209f43a16a2c5dfb4ca3abe54632
           = package com.ape.crystalagent.rea, versionCode 652, versionName 3.9.6-rea-ott-test
             label "APE Crystal REA (Prueba)", 24.289.252 bytes, targetSdk 28
```

**Consecuencia dura:** `com.ape.crystalagent.rea` es un **paquete separado**. No reemplaza la 651.
Ambas pueden convivir instaladas. El `SelfUpdateManager` de la 651 **nunca vera** la 652, porque
consulta `/ara/version.json` que declara `versionCode: 651` y `package: com.ape.crystalagent`.

Firma: `signing/ape-rea-test.p12` + `signing/password.txt` — **identidad de desarrollo**, no el
certificado del publicador original. Los `*_receipt.json` lo dicen explicitamente.

### Honestidad declarada por el propio autor de la build (RECUPERACION.txt)

- «No probado en Android/TV real ni con metraje AXN ni con reproduccion sostenida.»
- «HDR: preserva ruta PQ nativa; expansion creativa de SDR709 conocido a PQ requiere API33+,
  pantalla y EGL compatibles. HLG incompatible con el contrato del efecto produce recuperacion en
  ruta nativa. No garantiza HDR fisico ni detalle genuino de una fuente de mayor resolucion.»
- Escalado declarado: ≤720p→2560x1440, 1080p→3840x2160, 4K→5760x3240, preservando proporcion.
  **No modifica la resolucion fisica del panel.**

Eso es un truth-guard, no un defecto: no se declara 6K real donde hay upscale de render.

---

## PARTE 2 — Que hace REA y que NO hace

Las 11 clases `com.ape.rea.*` son **100% on-device**. Ninguna abre un socket al VPS.

| Clase | Que hace | Que NO hace |
|---|---|---|
| `ReaBridge` | Adjunta `Effect` de media3 al `ExoPlayer`; supervisor de 2 s con `ReaLoadGovernor` (frames, descartes, termica); bypass y recuperacion ante error 7000/7001 | No descarga, no autentica, no decide variantes |
| `ReaAdaptiveEffect` / `ReaHdrBridge` | Pipeline GLSL de realce y expansion de rango | No cambia el bitstream |
| `ReaOttBridge` | Observa `MediaSession` de `studio.scillarium.ottnavigator` (solo metadata/control) | **Nunca recibe frames de otra app** |
| `ReaMediaSources` | Elige `HlsMediaSource` vs `DefaultMediaSourceFactory`; usa `com.ape.fluid.FluidBridge.hlsFactory` para cache HLS | Sin cache si el host no lo expone (degrada a factory plana) |
| `ReaExternalRequest` | Normaliza el **protocolo pipe** (ver abajo); valida headers; rechaza DASH/SmoothStreaming | No decodifica ni re-firma una URI firmada |

**El protocolo pipe — contrato que la lista debe respetar si quiere alimentar a REA:**

```
<uri>|<Header1>=<value1>&<Header2>=<value2>
```
- Separador de URI y headers: `|`
- Separador de pares: `&`
- Claves y valores **percent-encoded**; `+` es un literal `+` (no espacio de formulario)
- Maximo 64 headers, valor ≤ 16384 chars, sin caracteres de control (`<32`, `127`)
- Nombre de header: `[!#$%&'*+.^_\`|~0-9A-Za-z-]{1,128}`
- Si el header trae `User-Agent`, ese gana sobre el UA por parametro
- Rechaza: `.mpd` / `mime` con `dash`; `.ism[l]` / `ms-sstr`

Esto es lo que el generador debe emitir si el canal se va a abrir en REA como reproductor externo.

---

## PARTE 3 — Matriz de endpoints medida (2026-11-07)

Sonda: `ssh hetzner-iptv` → `curl -k -H 'Host: iptv-ape.duckdns.org' https://127.0.0.1<ruta>`.
Sin el header `Host` la peticion cae al vhost por defecto y devuelve 138 bytes — **no mide nada**.

| Endpoint | Codigo | Cuerpo observado | Veredicto |
|---|---|---|---|
| `POST /sync` (cuerpo `{}`) | **400** | `{"ok":false,"error":"invalid_payload","detail":"bad_envelope"}` | **ALINEADO** — vivo y validando sobre |
| `GET /sync` | **405** | — + `x-ape-ara-sync: v2`, `Retry-After: 30` | ALINEADO (POST-only por diseño) |
| `/ara/version.json` | 200 | `versionCode: 651`, `package: com.ape.crystalagent` | VIVO pero **declara 651** |
| `/ara/agent.apk` | 200 | sha256 `8d3b1458…`, 25.678.434 B | VIVO, **no es la 652** |
| `/ara/events` | 401 | `{"ok":false,"error":"UNAUTHORIZED"}` | vivo, pide auth |
| `/ara/state` | 401 | `{"error":"unauthorized"}` | vivo, pide auth |
| `/ara/sse` | 401 | `{"error":"unauthorized"}` | vivo, pide auth |
| `/ara/enroll` | **403** | HTML `403 Forbidden` de **nginx** | **NOMBRE_DISTINTO**: bloqueado en nginx, no en PHP |
| `/prisma/api/token-vault.php` | 401 | `{"ok":false,"error":"UNAUTHORIZED"}` | vivo, pide auth |
| `/prisma/api/ara-device.php` | 400 | `{"ok":false,"error":"NO_ACTION","message":"Indica ?action=devices\|version\|job\|probe\|install…"}` | vivo |
| `/prisma/api/ara-enroll.php` | 405 | `{"ok":false,"error":"POST_ONLY"}` | vivo (el bueno es este, no `/ara/enroll`) |
| `/prisma/api/url2-cartridge.php` | 400 | `#EXTM3U## URL-2: falta u…` | vivo |
| `/prisma/api/ape-cartridge-bulk.php` | 200 | `{"P0":{"hevc_forced":1,"bitrate_bps":80000000,…}}` | vivo, entrega datos |
| `/prisma/api/ape-last.php` | 200 | `{"ok":true,…}` | vivo |
| `/prisma/api/ape-output-config.php` | 200 | `{"ok":true,"delta_pct":15,…}` | vivo |
| **`/api/health`** | **404** | — | **MUERTO — y es el `health_url` del deploy map** |
| **`/api/resolve_quality`** | **404** | — | **MUERTO — y es el `resolve_probe_url` del deploy map** |
| `/api/health.php` | 200 | — | vivo |
| `/health.php` | 200 | — | vivo |

### Paridad del contrato `/sync` (byte-identica)

```
VPS  /var/www/html/prisma/api/ara-sync.php
     sha256 419fe6f23c15717da06e63c5a33ef9994f1caa6fae85e4cd9970d072eaa740d1   54.912 B
repo ara-x/vps/php/ara-sync.php
     sha256 419fe6f23c15717da06e63c5a33ef9994f1caa6fae85e4cd9970d072eaa740d1   54.912 B
```

Constantes del servidor (`ara-sync.php:34-36`) contra las de la APK (`SyncProtocol.kt`):

| Constante | VPS | APK | |
|---|---|---|---|
| version | `ARA_SYNC_VERSION = 2` | `VERSION = 2` | OK |
| prefijo request | `ARA-X-SYNC-V1` | `REQ_PREFIX` | OK |
| prefijo respuesta | `ARA-X-SYNC-RESP-V1` | `RESP_PREFIX` | OK |
| app | *(0 ocurrencias)* | `APP = "ape-crystal-agent"` | **NO COMPUTADO en servidor**: el literal no aparece; si el servidor valida `app`, el valor lo aporta el registro del device, no una constante. Verificar antes de tocarlo. |

Canonical firmado (identico a `ara-x/vps/client/ara_sync_client.js:126-158`):

```
request  = "ARA-X-SYNC-V1\n"      + device_id + "\n" + seq + "\n" + ts + "\n" + nonce + "\n" + sha256hex(rawBody)
response = "ARA-X-SYNC-RESP-V1\n" + device_id + "\n" + reqSeq + "\n" + respTs + "\n" + sha256hex(rawBody)
sig      = hex(hmac_sha256(secret, canonical))
```

`sig` va en el header `Authorization`. Secret: `Config.syncKeySecret` lo resuelve en este orden
`SharedPreferences → archivo (priv/ext/SD) → EmbeddedKey AES-256-GCM embebida`.

### Por que `/sync` da 405 en GET y el snippet dice "STAGED, NOT DEPLOYED"

Los snippets `prisma-ara-sync.conf` y `ara-sync-lua.conf` llevan el comentario **«STAGED, NOT
DEPLOYED»** y **a la vez** `ape-meta-public.conf:65` hace `include snippets/prisma-ara-sync.conf;`
dentro del server 443 vivo. El handler real es **PHP**
(`fastcgi_param SCRIPT_FILENAME /var/www/html/prisma/api/ara-sync.php`), y el header
`x-ape-ara-sync: v2` solo lo añade el snippet PHP — no el Lua. `ara_x_sync.lua` (23.051 B) esta
desplegado en `/etc/nginx/lua/` pero **no cableado** a ningun `location`.

**La documentacion miente; el VPS esta bien.** Es la doctrina D-25/D-32 del repo: se corrige el
comentario, no el servidor. No «despliegues el Lua para alinear la documentacion».

---

## PARTE 4 — Los dos defectos de alineacion confirmados

### D1 · `health_url` y `resolve_probe_url` apuntan a rutas inexistentes — CRITICAL

`tools/cicd/vps_deploy_map.json` bloque `vps`:

```json
"health_url":        "https://iptv-ape.duckdns.org/api/health"                                  -> 404
"resolve_probe_url": "https://iptv-ape.duckdns.org/api/resolve_quality?ch=__SMOKE__&p=P3"       -> 404
```

Mientras `/api/health.php` y `/health.php` responden **200**. La puerta de salud y el smoke del
deploy estan rotos **por diseño**: `deploy_vps.sh` no puede pasar el health ni el resolve aunque el
despliegue real este perfecto. Leer el `.sh` y localizar el consumo exacto antes de corregir; si
ningun endpoint del VPS cumple la funcion de resolve, el smoke se **reescribe** — el mapa no finge.

### D2 · La APK 652 existe, es derivada de la 651, y no esta publicada — decision del operador

No es un bug: es una build de prueba nunca publicada. Publicarla exige decidir **una** de dos cosas:

| Opcion | Que implica |
|---|---|
| Publicar como paquete separado `.rea` | Convive con la 651. Los dos updaters son independientes. Requiere un `version.json` propio o un `channel` distinto, o la 651 pisara la metadata |
| Re-clonar a `com.ape.crystalagent` y publicar como 653 | Reemplazo in-place real. Exige re-firmar con la identidad correcta y **verificar que el `SelfUpdateManager` de la 651 acepta el salto** |

Cualquiera de las dos toca `/ara/version.json` y `/ara/agent.apk` — **ventana del operador**, backup
previo, y `node tools/ara/check_ara_dist_coherence.js` en verde despues.

---

## PARTE 5 — Como se verifica (comandos reales)

```bash
# 1. Paridad repo <-> VPS de un endpoint PHP (byte-identico, sin trucos de CRLF)
ssh hetzner-iptv 'sha256sum /var/www/html/prisma/api/ara-sync.php'
python -c "import hashlib;print(hashlib.sha256(open('ara-x/vps/php/ara-sync.php','rb').read()).hexdigest())"
# si difieren, normaliza antes de concluir:
python -c "import hashlib;b=open('f','rb').read();print(len(b),len(b.replace(b'\r\n',b'\n')),hashlib.sha256(b.replace(b'\r\n',b'\n')).hexdigest())"

# 2. Matriz de endpoints — SIEMPRE con Host
ssh hetzner-iptv 'curl -s -k -o /dev/null -w "%{http_code}\n" -H "Host: iptv-ape.duckdns.org" https://127.0.0.1/ara/state'

# 3. POST /sync valida envoltura (400 = vivo; 404 = no desplegado; 405 = es GET)
ssh hetzner-iptv 'curl -s -k -X POST -H "Host: iptv-ape.duckdns.org" -H "Content-Type: application/json" -d "{}" https://127.0.0.1/sync'

# 4. Que handler sirve /sync de verdad (no lo que dice el comentario)
ssh hetzner-iptv 'nginx -T 2>/dev/null | sed -n "/location = \/sync {/,/^    }/p"'
ssh hetzner-iptv 'grep -n "prisma-ara-sync\|ara-sync-lua" /etc/nginx/snippets/ape-meta-public.conf'

# 5. Identidad del APK servido
ssh hetzner-iptv 'sha256sum /var/www/html/ara/agent.apk; cat /var/www/html/ara/version.json'
```

---

## PARTE 6 — Trampas que ya costaron tiempo

| Trampa | Realidad |
|---|---|
| «`/sync` devuelve 405 → no esta desplegado» | 405 es **correcto**: es POST-only. Prueba con POST y espera 400 `bad_envelope` |
| «`/api/health` da 404 → el VPS esta caido» | El VPS esta sano; la ruta correcta lleva `.php` |
| «`Config.kt:208` dice que `/sync` devuelve 404» | Comentario **obsoleto**. `/sync` esta vivo desde 2026-11-05 (ara-sync.php) |
| «El snippet dice STAGED → no esta activo» | Esta incluido en la linea 65 de `ape-meta-public.conf` |
| «El APK 652 es otra app» | Es la 651 + parche REA; su `APK base SHA256` **es** el agent.apk servido |
| «`/ara/enroll` da 403 → auth rota» | El 403 es de nginx. El endpoint real es `prisma/api/ara-enroll.php` (405 POST_ONLY) |
| «Lista de 8 bytes = truncada» | Placeholder Trick por diseño; el contenido viaja en el `.gz` |

---

## Checklist de cierre

1. `sha256` normalizado del endpoint tocado, repo vs VPS, citado en el reporte.
2. Matriz de endpoints re-medida **con** header `Host`.
3. Si se toco `version.json`/`agent.apk`: `node tools/ara/check_ara_dist_coherence.js` exit 0 **y** hash del servido = hash esperado.
4. Si se publico APK: decidido paquete (`.rea` separado vs re-clon in-place) y declarado.
5. `tools/cicd/vps_deploy_map.json` valida como JSON y sus dos URLs devuelven el codigo esperado **medido desde el VPS**.
6. Ningun comentario de snippet afirmando un estado que el `nginx -T` contradice.

---

## PARTE 7 — Cadena completa de builds y contrato de procesado (auditoria 2026-11-08)

Decodificado de `REA_ALIGNMENT_20261108.md` (sha256 `8a23bd9f…`) y
`REA_APK_653_VERIFICATION.json` (sha256 `80bfb26d…`). Dato verificado contra el LAB y contra el VPS.

### 7.1 · La cadena tiene TRES builds, no dos

| Build | Paquete | versionCode | versionName | SHA-256 | Publicada |
|---|---|---|---|---|---|
| **651** | `com.ape.crystalagent` | 651 | `3.9.5-adb-firetv-shim` | `8d3b1458…` | **SI — `/ara/agent.apk`** |
| **652** | `com.ape.crystalagent.rea` | 652 | `3.9.6-rea-ott-test` | `79c7d1fd…` | no |
| **653** | `com.ape.crystalagent.rea` | 653 | `3.9.7-rea-interop-test` | `4b0c4ef3…` | no |

`8d3b1458…` es **la base pineada de las dos**: el overlay rechaza una base con otro hash. La 653
anade sobre la 652: **DASH media3 1.3.1** (routing por `.mpd` / `application/dash+xml`, cabeceras
conservadas en manifiesto y segmentos, **sin DRM**) y la **recuperacion nativa corregida** (retirar
efectos de Media3 no desmontaba el grafo de video; ahora recrea la Activity conservando Intent, URL,
cabeceras y posicion VOD, y bloquea la reentrada automatica).

Datos duros de la 653: 24.362.980 B · 9 DEX · **14.685 clases unicas, sin duplicados** · **16 metodos
inyectados en 19 puntos de llamada** · **20 bibliotecas nativas conservadas byte por byte** · firma y
alineacion ZIP verificadas · **`android_playback_tested: false` y `physical_hdr_tested: false`**.

### 7.2 · El contrato existe, pero **NO en este arbol** — verificado

Las rutas canonicas del contrato son:

```
contracts/rea/rea-processing-v1.json     -> politica "rea-adaptive-v1" (geometria, topes)
contracts/rea/formats-v1.json            -> los 11 formatos/emisores expuestos
```

**PERO: medidas el 2026-11-07T19:51-05:00 en este working tree, NO EXISTEN.**

| Ruta | Estado medido |
|---|---|
| `contracts/rea/` | **NO EXISTE** |
| `tools/rea/` (incl. `apk_overlay/`, `build_processing_policy.js`) | **NO EXISTE** |
| `artifacts/LAB_CALIBRATED_REA_v1.json` | **NO EXISTE** |
| APK 653 en disco | **NO EXISTE** |
| `contracts/lab/APE_LAB_CANONICAL_BULLETPROOF.json` | **SI existe** — 362.871 B |

La auditoria del 2026-11-08 se entrego como **parche revisable sin commit ni PR** (por los 2 gates
bloqueados). Vive en su entorno y en los adjuntos entregados al operador, **no en `HEAD`**
(`272f417e`, la misma base que audit6). **No se puede citar como artefacto del repo hasta que se
commitee.** Un contrato que no esta en el arbol no gobierna nada: no se usa como fuente de verdad
hasta aterrizarlo.

**Lo que SI quedo verificado del entregable:** el hash del LAB canonico coincide al bit —
`contracts/lab/APE_LAB_CANONICAL_BULLETPROOF.json` = sha256
`345783e33142791b23b4662d396c0c83c8051d77cd7c166dc21ef4990c093094`, 362.871 B (sin divergencia CRLF).

**Regla:** antes de proponer un tag `#EXT-X-APE-*` nuevo, buscar el nombre canonico en el contrato
**cuando exista en el arbol**. Mientras no exista, **no se inventa un tag nuevo** y se declara el
hueco: la autoridad del nombre esta pendiente de commit.

La tabla del contrato (confirmada independientemente en `docs/alignment/REA_UPSCALING_LAW.md`):

| Dimension menor | Rectangulo objetivo |
|---|---|
| <= 720 | 2560x1440 |
| 721-2159 | 3840x2160 |
| **exactamente** 2160 | 5760x3240 |
| > 2160 | **nativo — se evita reducir una fuente mayor** |

Casos concretos verificados: `854x480 -> 2560x1438` · `640x480 -> 1920x1440` (rectangulo
intercambiado). **«2K» = QHD 2560x1440 en esta implementacion**, no DCI 2048x1080.

**El JIT legado del VPS es OTRO dominio:** su modo opt-in es `6144x3456`, distinto del `5760x3240` de
REA. Tocarlo no prueba que este activo ni que codifique 6K en tiempo real.

### 7.3 · Limites de cabeceras: dos numeros, no uno

| Capa | Cabeceras | Bytes |
|---|---|---|
| Productor (lista) | **200** | 8.192 B de JSON |
| **APK** | **256** | **16.384 B agregados** de nombres+valores (incluye UA efectivo) · **8.192 B por valor** |

Se comprueban en **bytes UTF-8 tras incorporar todas** las cabeceras. Si no caben: se informa el
error y **no se exporta una autenticacion incompleta**. `EXTHTTP` va **despues del `EXTINF`
correcto** para no asignar auth al canal vecino.

### 7.4 · Lo que OTT NO hace (truth-guard)

> «OTT debe entregar el canal al reproductor externo REA para procesar sus fotogramas. **MediaSession
> y ottshim trasladan controles/metadatos; no exponen por si solos el video decodificado dentro de
> OTT Navigator.**»

Es exactamente lo que dice `ReaOttBridge`. Ninguna promesa de "REA mejora OTT sin abrirlo" es cierta.

### 7.5 · Estado de gates y por que NO hay commit

`AGENTS.md` exige todos verdes antes de commit. Resultado medido: **21 gates aprobados, 2 BLOQUEADOS
por el entorno** — Chrome 157 responde a `--version` pero al arrancar falla su socket con **`EPERM`**
y el puerto CDP no esta disponible.

=> **No se creo commit ni PR.** Es la conducta correcta: parche revisable, no publicacion. **Una
excepcion del usuario a la norma no autoriza por si sola merge ni despliegue.**

**Esta limitacion es reproducible fuera de ese agente:** al intentar renderizar una pagina con Chrome
headless en esta misma sesion aparecieron `OpenProcess: Acceso denegado (0x5)` (crashpad),
`Missing headless user data directory`, y con `--user-data-dir` explicito **0 bytes de salida**. Es
entorno, no codigo.

### 7.6 · Trampas del LAB confirmadas con medicion propia

| Trampa | Medido |
|---|---|
| «El LAB tiene 56 hojas» | **55** elementos `<sheet>`. Ademas **6 ocultas**: `14_KEYRING`, `17_SERVERS_POOL`, `98_SHIELD_IMMUTABLE`, `99_DEAD_CHANNELS_BLACKLIST` (`veryHidden`); `_LISTAS_OMEGA`, `00_EXPORT_STAGE` (`hidden`) |
| «fps del LAB coincide con el JSON certificado» | **NO**: `6_NIVEL_2_PROFILES!A32=settings.fps`, `B32:G32` = `120,120,120,120,120,120`; el JSON certificado dice P0..P5 = `30,60,30,60,30,30`. Heredado con semantica mezclada, **no medicion**. Y medido real de P1 4K = 29,6 fps |
| «el LAB ya exporta la extension REA» | **NO**. El LAB **no tiene hoja REA** y sus macros no la exportan: **pendiente de migracion explicita** |

**No tocar la fila 32 ni el LAB para "cuadrar" el JSON**: es el mismo patron que la Ley Cardinal 1
(declarar lo que el motor no sostiene).

### 7.7 · Publicar la 653 exige mas que `version.json`

> «La distribucion REA 653 y los identificadores del instalador requieren un cambio separado y
> comprobado; **reemplazar unicamente `version.json` seria insuficiente**.»

Pre-requisitos declarados: **unidad estatica explicita** (20 scripts + indice), **backup/restore del
lote y de sus `.gz`**, y **verificacion HTTP con y sin compresion**. El workflow manual existente
tiene alcance mayor que una publicacion estatica (PHP, sincronizadores, PHP-FPM, worker ADB) y su
**rollback es por archivo: no restaura el lote ni sus `.gz`**.

---

## PARTE 8 — ottshim NO entrega fotogramas (medido en 331 turnos de la sesion REA)

Fuente destilada: `docs/alignment/CHATGPT_REA_SESSION_DIGEST_20261108.md`. La conversacion se lee por
**`https://chatgpt.com/backend-anon/share/<id>`** con UA de navegador (200, JSON); el `web_fetch` da
503 y el HTML solo trae el titulo.

### 8.1 · La regla que ordena toda la integracion con OTT Navigator

> «el ottshim de tu APK ya se conecta con OTT Navigator mediante MediaSession, pero esa conexion
> actualmente **solo observa la reproduccion: no recibe los fotogramas** para escalarlos.»

| Componente | Que hace | Sirve para imagen |
|---|---|---|
| `SessionTap` | sesion de `studio.scillarium.ottnavigator`; estado/posicion/bufer cada **200 ms** | **NO** |
| `ProxyService` | recibe fuente por config `src`,`ua`,`targetKbps` | la URL **no** viene de MediaSession |
| `LoopbackProxy` | servidor local, reescribe manifiestos HLS, reenvia segmentos | **transporte/cache; no decodifica ni escala** |
| `AbrPolicy`/`QoeEngine` | variante y transporte | continuidad, no pixeles |
| **APE/Crystal/REA** | efectos GL del reproductor propio | **unico punto real** |

**Prohibido prometer «upscaling dentro de OTT Navigator via MediaSession».** `MediaController` clasico
da estado/metadatos/controles. Un controlador Media3 solo toca superficie si la sesion ofrece el
comando; en sesiones clasicas **se ignora**. «Cambiar el nombre del controlador o enviar un comando
llamado upscale no habilita esa cooperacion.»

**Arquitectura valida:** OTT elige canal -> abre **REA como reproductor externo** (URI + cabeceras) ->
REA procesa en GPU -> MediaSession propia para controles. ottshim queda como **diagnostico**.
Coste declarado: se pierden los controles propios de OTT durante la reproduccion externa.

### 8.2 · Siete trampas del camino OTT -> REA

1. **Posicion estancada != freeze.** La posicion publicada puede actualizarse poco; que no cambie no
   prueba fotogramas congelados.
2. **`PlayerActivity` original siempre construye HLS** -> rompe progresivos; hay que adaptarlo y
   gestionar un canal nuevo sobre una Activity ya abierta.
3. **`User-Agent` por parametro pisa el de las cabeceras** -> puede impedir abrir una fuente valida.
4. **El proxy no preserva `Authorization`/`Referer`/`Cookie`** -> no forzar todo por el proxy.
5. **No adivinar la URI** desde nombre/poster/id interno; solo si OTT la publica en metadatos.
6. Permisos de sesion ajenos: dependen de permisos o listener de notificaciones del usuario; **no**
   hacen falta para que OTT abra un reproductor externo por Intent.
7. **`prepare()` no reconstruye el contrato de color**: la recuperacion **recrea el reproductor una
   vez** preservando la fuente.

### 8.3 · Truth-guard de los modelos

> «Los modelos pequenos incluidos en la APK original realizan **mezcla de imagenes, promediado y
> enfoque**; su contenido **no corresponde a una implementacion completa de Real-ESRGAN o RIFE** con
> estimacion de movimiento.»

Prohibido vender «ESRGAN/RIFE aplicado». El motor propio es procesamiento espacial real con tres
niveles (Ligero / Equilibrado bicubico / Detalle con limites de halo).

### 8.4 · Los tres entregables y el que falta aqui

| Artefacto | Estado en este arbol |
|---|---|
| `APE_REA_653_OTT_DASH_2K_4K_6K_TEST_20261108.apk` | **AUSENTE** (solo en la libreria del chat) |
| `LAB_CALIBRATED_REA_v1.json` | **AUSENTE** |
| **`REA_ALIGNMENT_20261108.patch` (77 archivos)** | **AUSENTE** — **es la pieza que desbloquea todo** |

El parche «aplica limpiamente al commit base `272f417…`» y reproduce el arbol revisado. Sin el, el
contrato no existe en el repo y ninguna de las reglas de esta skill sobre `RESOLUTION=`/tag puede
aplicarse de forma verificable.

### 8.5 · Pregunta abierta al operador (sin responder)

> «¿Autorizas la excepcion a esa regla de `AGENTS.md` para crear un PR en borrador con este parche y
> las dos pruebas de interfaz senaladas como pendientes? La autorizacion seria unicamente para el PR;
> el merge y el despliegue quedarian pendientes.»

**Una excepcion para el PR no autoriza merge ni despliegue.** El propio informe lo declara.

---

## PARTE 9 — Las dos trampas de Windows que rompen gates sin romper el producto

Medido el 2026-11-08 al aplicar y validar `REA_ALIGNMENT_20261108.patch` sobre Windows. **Ninguna de
las dos es un defecto del codigo auditado: las dos son el entorno.**

### 9.1 · `*.json` sin `eol=lf` en `.gitattributes` -> todo hash de contrato diverge

El bloque `[t114]` del `.gitattributes` pinea `.lua/.sh/.ts/.m3u8/.tsv/.md/.js/.yml/.php`
**pero no `.json`**. Con `core.autocrlf=true`, los `.json` llegan a disco con CRLF:

```
contracts/rea/rea-processing-v1.json  ->  74 CRLF en disco
  sha256 crudo (CRLF) = c8e93eb4120bb56fc05837c2e868daf60f40dbab7a1407a303fd8fe85f5797a6
  sha256 LF           = 2a974a6452609049a7f7790cd3a62633f2b06090c6e548fcaa1be3115e7d2a06
```

El generador embebio el hash **LF**; el gate hashea el fichero **en disco**. En Linux coinciden; en
Windows no. Gate afectado: `processing_policy`. **Corregido** anadiendo `*.json text eol=lf` y
`*.yaml text eol=lf`.

**Importante:** `git add --renormalize .` devolvio *«nothing to commit»* -> **los blobs en git ya
estaban en LF**. Lo unico desalineado era el ARBOL DE TRABAJO. Para materializarlo hay que forzar un
re-checkout (`git checkout-index -a -f` NO basta; sirve `rm` + `git checkout -- .`).

### 9.2 · `python3` hijo lee stdin como cp1252 -> gates con CSV fallan con mojibake

`catalog_exports` canaliza un CSV por stdin a `python3`. En Windows ese stdin se decodifica cp1252 y
`Línea` llega como `LÃ­nea`:

```
sin PYTHONIOENCODING  ->  AssertionError: 'Canal, "prueba"\nLÃ­nea 2' !== 'Canal, "prueba"\nLínea 2'
con PYTHONIOENCODING=utf-8  ->  {"ok":true,"checks":74}   EXIT=0
```

**No es el producto.** El verificador ahora exporta `PYTHONIOENCODING=utf-8` antes de los gates:
normaliza el ENTORNO a lo que Linux ya tiene por defecto, no la expectativa.

### 9.3 · Los otros gates que fallan en Windows y por que

| Gate | Causa | Es del producto? |
|---|---|---|
| `deploy_regressions` | `awk` recibe `$i` vacio por quoting distinto del shell | **No** |
| `deploy_confirmation_security` | `read_text()` sin `encoding='utf-8'` -> `UnicodeDecodeError` cp1252 | **No** (es un bug de portabilidad del TEST) |
| `workflow_yaml_and_bash_syntax` | necesita `bash` + `python-yaml` | **No** |
| `jit_real_ffmpeg_evidence` | exige `artifacts/rea-jit-output-truth.json`, artefacto **privado** no incluido en el parche | **No** — es `NO_COMPUTADO`, no un fallo |

### 9.4 · INCIDENTE OPERATIVO (registrado para que no se repita)

Al forzar el re-checkout se ejecuto `git checkout HEAD -- <918 rutas>` y **fallo por limite de longitud
de linea de comandos en Windows**, dejando 918 ficheros borrados del arbol durante unos segundos.
Recuperado con `git checkout -- .` (sin lista de argumentos). Verificacion posterior:
`git status` = 0 entradas y **`git diff HEAD` vacio** -> cero perdida de contenido.

**Regla:** nunca pasar una lista de rutas de tamano no acotado a un comando de git en Windows. Usar
`git checkout -- .`, `git restore .` o `xargs`. Y **commitear antes** de cualquier renombrado masivo:
fue lo que hizo el incidente recuperable en un comando.
