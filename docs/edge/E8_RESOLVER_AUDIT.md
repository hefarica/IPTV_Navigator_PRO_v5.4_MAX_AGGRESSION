# E8 · Auditoría READ-ONLY del Resolver PHP (SSOT de URL/token) y su frontera con el edge

**Fecha:** 2026-10-26 (mediciones 20:0x–20:2x UTC / 15:0x–15:2x America/Bogota)
**Autor:** `resolver-audit` (t8) · equipo `edge-fluidez`
**Modo:** **solo lectura**. No se desplegó PHP, no se escribió nada en el VPS, no se recargó nginx,
no se tocó ninguna lista ni el generador. Detalle de comandos en §12.

**Artefactos de esta tarea**

| Archivo | Rol |
|---|---|
| `docs/edge/E8_RESOLVER_AUDIT.md` | este informe (mapa de decisión, riesgos, endurecimiento, límites del edge) |
| `_vps_stage/edge/E8_resolver_evidence.json` | mediciones máquina-legibles (hashes, bytes, TTLs, latencias, censo de listas) |

---

## §0 · Resumen ejecutivo (lo que cambia el plan del equipo)

1. **El Resolver NO está hoy en el camino de reproducción.** Los **tres** `.m3u8.gz` servidos desde
   `/var/www/lists` (incluidos los dos regenerados hoy: `..._4K` 19:55Z y `..._CDN` 08:23Z) contienen
   **0 referencias** a `resolve.php` / `resolve_quality*.php`, **0 parámetros `srv=`** y **0
   `#EXTATTRFROMURL:https`**. Los `#EXTATTRFROMURL` que sí existen (11.286 en la muestra de 4K) son
   **metadata inerte `X-APE-*`**, no URLs de resolver.
   ⇒ La frase «la lista viva apunta a `resolve_quality.php`» (`RESOLVER_CANONICO.md` §4) **no se sostiene
   contra los bytes actuales**. `[UNKNOWN]` si existe otra lista fuera de `/var/www/lists` (CDN externo).
2. **El log del resolver lo confirma:** 23.122 líneas totales, con el tráfico concentrado el
   **2026-03-27/29** (7.504 + 4.341 + 4.537 líneas). Desde entonces: 28 líneas el 03-30, 4 el 04-28 y
   **33 el 2026-10-26, todas con identidad de sonda** (`medicion` 18, `1` 9, `392200` 3, `cartridge_assert` 2,
   `test` 1). **Cero tráfico orgánico de playback.**
3. **Hay 5 generaciones de `resolve.php` y solo una sirve**: la desplegada
   (`/var/www/html/resolve.php`, **42.620 B, `31E13A03…`**, mtime 2026-06-19 23:01:01 UTC) **no tiene gemelo
   byte a byte en el repo** (9815C663 43.754 B · 71847A97 43.450 B · 45420FC2 40.906 B). El pin U1
   (`27DB7AB7…`) cubre **solo** el wrapper `resolve_quality_unified.php`; el SSOT real de URL/token **no estaba
   pineado por hash**.
4. **`ORIGINS` ya no está en el código:** desde 2026-06-19 el resolver desplegado hace
   `require_once '/etc/ape/origins.php'` (línea 31) — **440 B, `0640 root:www-data`**, dir `/etc/ape` `0750`,
   3 parejas. El propio archivo dice: *«ROTAR con el proveedor: los valores viejos viajaron en repo/ZIP y están
   expuestos»*. Confirma la deuda de rotación de `COORDENADAS_SESIONES.md` §5.1 (acción del propietario).
5. **`TOKEN_TTL = 120` es código muerto** con `TOKEN_MODE = 'none'`: el token sale vacío y la URL final **no
   lleva `?token=`**; nada caduca. **`REQUIRE_SIG = false`** y `EXPECTED_SIG` es un literal estático del propio
   archivo ⇒ activarlo **no añade seguridad** (replayable) y rompería a cualquier llamante. `TOKEN_SECRET` sigue
   siendo el **placeholder público** de 33 caracteres ⇒ `TOKEN_MODE='hmac'` sería **falsificable**.
6. **El resolver es un oráculo de credenciales sin autenticación y legible por navegador:**
   `GET /resolve.php?ch=1&p=P3` → **200 / 8.609 B** con la URL `http://<host>/live/<user>/<pass>/<id>.m3u8` y
   cabecera **`Access-Control-Allow-Origin: *`**. Cualquier página web puede leer el cuerpo (CORS) y cosechar
   las parejas del proveedor enumerando `ch`. No hay `auth_basic`, ni `allow/deny`, ni `limit_req`, ni fail2ban,
   ni ufw en el VPS.
7. **Hay más de un resolver vivo y público:** `/resolve.php` (8.609 B), `/resolve_quality.php?mode=m3u`
   (8.608 B), **`/lists/resolve.php` (200 / 7.434 B, 35.931 B, 775 `www-data` en directorio escribible)**,
   `/resolve_quality_v5.php` (200 / 6.590 B) y `/resolve_quality_unified_LIVE.php` (200 / 0 B). `resolve_quality_v5.php`
   y `resolve_quality_unified_LIVE.php` **siguen llevando el host del proveedor hardcodeado** (grep; la copia de
   `/lists/resolve.php` no se comprobó con ese patrón). Es el **anti-SSOT**.
8. **El wrapper `resolve_quality_unified.php` invierte la cascada.** El manifiesto tiene los tiers
   **ascendentes por nivel** (tier 1 = L186/6.2 … tier 13 = L90/3.0); el código asume «1=mín, 9=CORONA, 13=8K».
   Medido en vivo: **P0 (4K) → tier 9 → `hvc1.2.4.L120.B0`; P1/P2 → L123; P4 → L153; P5 (SD) → tier 3 →
   `hvc1.2.4.L180.B0`**. Si algún consumidor usara ese `codec` para `CODECS=`, violaría **Ley Cardinal 1** y la
   coherencia de la GOLDEN RULE. **Hoy no hay consumidor vivo de ese JSON.**
9. **El coste medido del resolver es el mapa, no el proveedor:** `channels_map.json` es un symlink al mapa de
   **28.326.917 B**; decodificarlo cuesta **210,2 ms y 153 MB de pico**. `php -m` confirma que el resolver **no
   hace fetch al proveedor** (solo compone URLs) ⇒ no puede aportar `provider_fetch_ms`, `hops`, `uhd_mode` ni
   `rebase_pct`. Latencia real medida (TLS, loopback, VPS→VPS): **192–213 ms**; `resolver.log` global:
   **media 227,5 ms**, máx 9.758 ms (outlier).
10. **El edge medido no cachea, no limita y no autentica el resolver.** La config viva (dump `nginx -T`) sirve
    PHP con un `location ~ \.php$` genérico en el 443 (línea 681) con `fastcgi_read_timeout 300s` y **sin
    `fastcgi_cache` ni `limit_req`**. El `nginx-live-current.conf` del repo (que sí trae
    `fastcgi_cache resolver_cache … ignore_headers Cache-Control … 30s`) **NO es la config desplegada**: no debe
    citarse como hecho ni «restaurarse».

---

## §1 · Identidad, bytes y pins (SSOT real)

### 1.1 Lo que sirve el VPS (medido con `stat` + `sha256sum`, solo lectura)

| Ruta servida | Bytes | SHA-256 | Modo / dueño | mtime (UTC) | Rol |
|---|---:|---|---|---|---|
| `/var/www/html/resolve.php` | **42.620** | `31e13a03ab70f02844cf9c6634718c7a656aec9e0b72e1145cd813e509e98665` | 644 `www-data:www-data` | 2026-06-19 23:01:01 | **SSOT real de URL/token** (fragmento M3U) |
| `/var/www/html/resolve_quality_unified.php` | **6.270** | `27db7ab7a5b56f43cb815f4732124bd9009b0fc22c223211c30a78579f25d260` | 644 `www-data` | 2026-05-23 05:48:53 | wrapper JSON + cascade + puente M3U |
| `/var/www/html/resolve_quality.php` | **281** | `78c27dff701da449bc6e66628a372d8620972926776986bb86cbbc759614520c` | 644 `www-data` | 2026-04-06 02:05:36 | forwarder `require_once unified` |
| `/etc/ape/origins.php` | **440** | `c574090c1c34560b7da99d0471714a502ab6fc7fc37d9edc2506f86adfa51924` | **0640 `root:www-data`** (dir `0750`) | 2026-06-19 23:01:01 | **ORIGINS** (3 parejas) — fuera del webroot ✔ |
| `/var/www/lists/resolve.php` | **35.931** | `f7e36fd7d06e7d880f4676631f2175d9566e27e57c4212739919f06785163102` | **775 `www-data`** (dir `775`) | 2026-02-26 02:48:12 | **resolver legacy ejecutable** en `/lists/` |
| `/var/www/html/channels_map.json` | symlink → `APE_TYPED_ARRAYS_ULTIMATE_20260315_102305.channels_map.json` | — | symlink `root:root` → destino **644 `root:root`** | 2026-03-15 | mapa global del resolver (28.326.917 B, 8.366 entradas) |
| `/var/www/html/prisma/quality-manifest.json` | **28.834** | `52d1a167…` (prefijo) | 644 `www-data` | 2026-05-23 05:08:31 | cascada (`codec_cascade`, 13 tiers) |

> Corrección al informe REA (`docs/REA_EVIDENCE_AUDIT.md:121`): la igualdad `resolve.php 43.754 · 9815c663…`
> corresponde a la **copia histórica** `/var/www/iptv-ape/resolve.php` (43.754 B, 2026-05-23), **no** al archivo
> servido. El servido es **42.620 B / `31E13A03…`**. No re-medí el hash de la copia histórica en esta auditoría.

### 1.2 Gemelos en repo (byte a byte)

| Copia repo | Bytes | SHA-256 (prefijo) | ¿= desplegado? |
|---|---:|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/vps/resolve_quality_unified.php` | 6.270 | `27DB7AB7A5B56F43` | **SÍ** ✅ (pin U1) |
| `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality.php` | 281 | `78C27DFF701DA449` | **SÍ** ✅ (forwarder) |
| `IPTV_v5.4_MAX_AGGRESSION/vps/resolve.php` | 43.754 | `9815C663B3516490` | **NO** ❌ |
| `IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/resolve.php` | 43.450 | `71847A970DF7B4E0` | **NO** ❌ |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/vps/resolve.php` | 40.906 | `45420FC2204DAECE` | **NO** ❌ |
| `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php` | 348.758 | `20AC4B2631C1E877` | **NO** (candidato B de U1) |
| `IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/resolve_quality_unified.php` | 3.894 | `42154E5B888B74C5` | **NO** ❌ |
| `/` (raíz del repo) `resolve_quality_unified.php` | 4.018 | `1E7F760FAA4C643D` | **NO** ❌ |

**Conclusión SSOT:** el único artefacto del resolver que está pineado y es byte-idéntico es el **wrapper**
(6.270 B). El **SSOT de URL/token (`resolve.php`) tiene 4 variantes en repo y ninguna es la desplegada**.
No se debe «desplegar para alinear» (D-25/D-31/D-32): se documenta la realidad y, si se quiere pin, se pinean
los bytes desplegados (`31E13A03…`).

---

## §2 · Mapa de decisión A — `resolve.php` desplegado (42.620 B)

> Anclas de línea medidas sobre el archivo **desplegado** (`grep -n`). El gemelo repo (43.754 B) tiene las
> mismas secciones desplazadas ~6 líneas; no se usan sus números.

```
GET /resolve.php?ch=&p=&mode=&sig=&origin=&list=&res=&bw=&buf=&th1=&th2=&pfseg=&pfpar=&tbw=&sid=
 │
 ├─(l.5)  require cmaf_engine/cmaf_integration_shim.php  → ARCHIVO INEXISTENTE ⇒ shim CMAF INERTE
 ├─(l.31) require_once /etc/ape/origins.php              → define ORIGINS (3 parejas, 0640)
 │
 ├─1. INPUT (q()): ch,p,mode,sig,origin,list,res,bw,buf,th1,th2,pfseg,pfpar,tbw,sid
 │     ✗ NO lee: url, srv, fuse, ctx, action  (el generador los emite; el resolver los IGNORA)
 │     ch vacío → 400; ch ∉ [A-Za-z0-9._-]{1,64} → 400
 │     REQUIRE_SIG=false (l.48) → sig NO se valida nunca
 │     CORS: Access-Control-Allow-Origin: * (l.176)
 │
 ├─2. DEVICE CLASS (l.~187): UA contiene AFT → firetv_4k; Android TV/Leanback → onn_4k; resto generic_tv
 │     ⇒ $uaOut se fija a un UA literal por clase (contrato con el player)
 │
 ├─3. PERFIL (l.227 profileCfg P0–P5, l.332 normalizeProfile, l.354 autoProfile)
 │     precedencia:
 │       P = 'P0'..'P5' explícito ............................ gana (l.~349)
 │       si P=AUTO:
 │         autoProfile(ch) busca 8K/4320 → P1; UHD/4K/2160 → P2; FHD/1080 → P3; HD/720 → P4; SD/480 → P5;
 │                        default → **P3** (l.86)
 │         si auto ∈ {P0,P1} y el mapa dice P3/P4/P5 → **rescata auto** (anti-downgrade, l.358)
 │         si el mapa trae profile → gana el mapa; si no → auto
 │     perfil inválido → **P4** (l.372)
 │     ⚠ ch suele ser un stream_id numérico o un slug: autoProfile casi siempre cae en P3;
 │       el mapa está indexado por **dominio** (`polsatrodzina.pl`, …) ⇒ el hit depende de qué `ch` manda el generador.
 │
 ├─4. OVERRIDES DE TELEMETRÍA (l.380–419)
 │     res (string, SIN validar) → $cfg['res']  ⚠ punto de inyección en `video-track="..."`
 │     bw,buf,pfseg,pfpar,tbw (int) y th1,th2 (float) → $cfg[...]
 │     si faltan, se usa decision['math_telemetry'] del mapa
 │
 ├─5. TOKEN (l.38 TOKEN_TTL=120, l.42 TOKEN_MODE='none', l.43 TOKEN_SECRET=placeholder, l.~420)
 │     token='' ⇒ URL SIN token; TTL 120 NO se usa; hmac/passthrough no se ejecutan
 │
 ├─6. ORIGEN y CREDENCIALES (l.426 resolveOrigin, l.433–452)
 │     $origin (query) → regex ^[A-Za-z0-9._:-]{1,128}$ → allowlist ORIGINS; si no está → DEFAULT (primera)
 │     map.origin (string, sin regex) → allowlist ORIGINS (seguro por lista blanca)
 │     map.user / map.pass → **override SIN validar** (solo el host está acotado)
 │     map.stream_id → override; `sid` numérico (regex ^\d+$) → **rey absoluto** (l.450–452)
 │
 ├─7. URL FINAL (l.455)
 │     http://<host>/live/<user>/<pass>/<streamId>.m3u8      ← **credenciales en el path, esquema http://**
 │
 ├─8. #EXTHTTP (l.461–…)  → **99 claves medidas** (comentario del repo dice «80+»)
 │     3 headers tóxicos siguen COMENTADOS (Range, If-None-Match, Priority) ✔
 │
 ├─9. #EXTVLCOPT        → **128 líneas medidas** (comentario dice «63+»)
 │     incluye l.666 http-tls-version=1.0 · l.669/670 http-ssl-verify-peer/host=false  ⚠
 │
 ├─10. SALIDA (l.816–): Content-Type application/x-mpegURL; Cache-Control no-store,max-age=3;
 │     X-APE-Refresh-Interval: 3; cuerpo = #EXTINF + #EXTHTTP + 128 #EXTVLCOPT + URL
 │
 └─11. LOG: fastcgi_finish_request() y luego append a /var/log/iptv-ape/resolver.log
        formato desplegado: [fecha] ch=… prof=… dev=… vlc=128 hdr=0/1 ms=…
        (formatos históricos con hit=: 501 líneas; con vlc=: 22.145 → ≥2 generaciones escribieron aquí)
```

### 2.1 Controles que **sí** existen (no romper)

- **No hay SSRF en el resolver:** `origin` está acotado por regex **y** por allowlist `ORIGINS`; `url`/`srv`
  /`fuse` ni se leen; el destino siempre es `ORIGINS[i]`.
- `ch` y `list` van validados por regex (sin traversal en `list`: `^[A-Za-z0-9._-]{1,128}$`).
- `sid` solo dígitos.
- Los 3 headers tóxicos siguen eliminados (C8).

### 2.2 Puntos débiles del mapa de decisión

| # | Punto | Evidencia | Efecto |
|---|---|---|---|
| D1 | `res` sin validar se concatena en `video-track="..."` (l.380-382 y salida EXTINF) | lectura del código | inyección de atributos/líneas en el fragmento emitido (bajo impacto hoy: no hay caché de terceros) |
| D2 | `map.user/pass` sin validar | l.~443-448 | el mapa puede cambiar credenciales del host legítimo |
| D3 | `ch`→`autoProfile` | l.86, l.354 | con stream_id numérico el perfil cae a **P3** salvo override; el resolver **no es** el guardián UHD |
| D4 | `TOKEN_TTL` inerte | `TOKEN_MODE='none'` | falsa sensación de caducidad |
| D5 | Params del generador ignorados (`url`,`srv`,`fuse`,`ctx`,`action`) | `q()` solo devuelve 15 claves | contratos muertos: `action=providers`/`meta-cluster` del frontend devuelven el JSON de cascada |

---

## §3 · Mapa de decisión B — `resolve_quality_unified.php` (6.270 B, pin U1)

```
GET /resolve_quality_unified.php?ch=&p=&res=&fps=&mode=&p4k=
 │
 ├─ l.17 QUALITY_MANIFEST_PATH = /var/www/html/prisma/quality-manifest.json
 ├─ l.18 CASCADE_CACHE_TTL = 30   (static local: NO cruza requests; ver §4)
 ├─ l.25-57 loadCascadeFromManifest()  → cachea data['codec_cascade']
 ├─ l.66-117 resolveCascadeTier(profile, res, fps)
 │     l.83-104 switch(profile): P0→(fps≥100?10:9) · P1→(h≥2160?9:8) · P2→(fps≥60?7:8) · P3→(fps≥60?7:6)
 │                              P4→5 · P5→3 · default→(h≥2160?9:(h≥1080?6:4))
 │     busca por tier numérico y devuelve {codec, codec_hev1, tier}
 │
 ├─ SI mode ∈ {'quality','cascade'}  (DEFAULT = 'quality')
 │     → JSON {ok, profile, resolution, fps, tier, codec (hvc1), codec_hev1, perceptual_4k, adb_directives, elapsed_ms}
 │     → p4k=1 añade 3 `settings put …` ADB (texto, no se ejecuta aquí)
 │
 └─ SI mode ∉ {'quality','cascade'}  (p.ej. el generador manda mode=adaptive)
       → require __DIR__ . '/resolve.php'  ⇒ **fragmento M3U real** (SSOT URL/token)
```

### 3.1 Defecto medido: la cascada está invertida respecto al manifiesto

Manifiesto real (`codec_cascade`, 13 tiers, medido con `python3`): **tier 1 = L186 (nivel 6.2) … tier 13 = L90
(nivel 3.0)** — es decir, **tier bajo = nivel alto**. El código asume lo contrario (comentario l.106:
«ascending: tier 1=min, tier 9=CORONA, tier 13=8K»).

| Perfil | Tier que pide el código | Codec servido (medido en vivo) | Semántica del manifiesto | Veredicto |
|---|---|---|---|---|
| P0 (4K ULTRA) | 9 (fps<100) | `hvc1.2.4.L120.B0` (nivel 4.0) | tier 9 = L120 (1080p) | **subdeclara 4K** ✗ |
| P1 (8K) | 9 si h≥2160; **8** con `res` por defecto | `hvc1.2.4.L123.B0` (nivel 4.1) | tier 8 = L123 | **subdeclara** ✗ |
| P2 (4K EXTREME) | 7 si fps≥60; **8** con fps por defecto | `hvc1.2.4.L123.B0` | tier 8 | **subdeclara** ✗ |
| P3 (FHD) | 6/7 | `hvc1.2.4.L150.B0` (nivel 5.0) | tier 6 = L150 | sobredeclara levemente ✗ |
| P4 (HD) | 5 | **`hvc1.2.4.L153.B0` (techo 4K@60)** | tier 5 = L153 | **sobredeclara 720p** ✗ |
| P5 (SD) | 3 | **`hvc1.2.4.L180.B0` (nivel 6.0 ≈ 8K)** | tier 3 = L180 | **sobredeclara 480p** ✗ |

**Consecuencia doctrinal:** si ese `codec` se usara para `CODECS=` en la lista se violaría **Ley Cardinal 1**
(nivel por debajo de la resolución en 4K; nivel 6.0 sobre 480p) y la coherencia GOLDEN RULE. **Hoy no hay
consumidor vivo del JSON** (las listas no referencian el wrapper), así que es **riesgo latente**, no incidente.
**No se corrige en esta fase** (sería desplegar PHP); queda como candidato con rollback = restaurar el archivo
pineado `27DB7AB7…`.

### 3.2 Contratos muertos observados

- `ape-monitor-panel-v15.js:31` pide `resolve_quality.php?action=providers`;
  `m3u8-typed-arrays-ultimate.js:11578` pide `action=meta-cluster`. El wrapper **no lee `action`**: con
  `mode` ausente devuelve el JSON de cascada ⇒ ambos consumidores reciben un objeto equivocado.
- `m3u8-api-wrapper-integrated.js:1230/1266` construye `…resolve_quality_unified.php?…&mode=adaptive&…&srv=<btoa(host|user|pass)>&url=<url>`
  — `srv`/`url` **no existen en el resolver desplegado**; `mode=adaptive` sí funciona (delega a `resolve.php`).
  ⚠ Si el módulo `quality-overlay-vip` se activara y esa lista se publicara, **el `srv=` metería credenciales
  base64 en la lista**. Hoy las listas publicadas tienen **0 `srv=`** (medido en las 3).

---

## §4 · TTLs y caché: lo declarado vs lo medido

| Mecanismo | Declarado | Realidad medida | Efecto |
|---|---|---|---|
| `TOKEN_TTL = 120` | token válido 120 s | **inerte** (`TOKEN_MODE='none'` ⇒ token vacío) | nada caduca; la URL/credenciales son permanentes |
| `CHANNEL_MAP_TTL_SECONDS = 30` | cache 30 s | `static` en PHP-FPM ⇒ **vive solo dentro de un request** | **no** evita releer el mapa en cada request |
| `CASCADE_CACHE_TTL = 30` | cache 30 s | idem | igual |
| Edge `fastcgi_cache resolver_cache 30s` | en `nginx-live-current.conf` del repo | **NO está en la config viva** (`nginx -T`): el 443 usa `location ~ \.php$` genérico, sin cache ni `limit_req` | si alguien «restaura» esa config, cachearía fragmentos con `ignore_headers Cache-Control` ⇒ riesgo de fragmento rancio |
| `Cache-Control: no-store…max-age=3` + `X-APE-Refresh-Interval: 3` | fragmento fresco / refresco 3 s | presente en la respuesta (medido) | el edge no debe contradecirlo con caché opaca |
| Coste del mapa | — | **210,2 ms / 153 MB de pico** por decodificación de 27 MB (8.366 entradas) | domina la latencia del resolver |
| Latencias medidas (GET real, loopback+TLS) | objetivo del equipo <350 ms | `/resolve.php ch=392200&p=P0` **204 ms**; `p=P3` **212 ms**; `/resolve_quality.php…mode=m3u` **192 ms** | ~90 % del tiempo es PHP+mapa, no red |
| `resolver.log` global | — | 23.122 líneas; **media 227,5 ms**, máx 9.758 ms | el máx es outlier (primer hit / arranque) |

**Implicación para la fase 3 del equipo («302 en 30-60 s → <350 ms»):** el 302 y su caché viven en el **plano
metadata 8088** (`/cdn/` → `/_ape/_fetch`), **no en este PHP**. El resolver solo **compone** la URL; no hace
fetch. Cualquier métrica de `provider_fetch_ms` tiene que salir del edge Lua, no del resolver.

---

## §5 · Frontera con el edge (config viva, medida)

| Hecho | Evidencia (dump `nginx -T` del 2026-10-25 + `ss -lntp` hoy) |
|---|---|
| nginx 1.24.0 stock (Ubuntu) | `nginx -v` |
| 443: PHP por **`location ~ \.php$` genérico** (raíz `/var/www/html`), `fastcgi_read_timeout 300s` | líneas 681–698 |
| **Sin** `auth_basic`, **sin** `allow/deny`, **sin** `limit_req` para el resolver en 443 | `nginx -T | grep -cE "auth_basic|limit_req "` = **0** |
| **Sin** `fastcgi_cache` en producción | ídem |
| `:80` → `301` a HTTPS (default_server) + vhost `coa-navigator` (`server_name _`) con PHP en texto claro — queda **sombreado** por el `default_server` de `:80`; no se observó tráfico | líneas 615–636 / 493–539 |
| `:8088` escucha en **0.0.0.0** (plano metadata `/cdn/`, `/_ape/_fetch`, `/_ape/health`, `/_ape/qab`) | `ss -lntp` |
| `:80` bypass **sin TLS** para `/prisma/api/prisma-adb-quality.php` y `/prisma/quality-manifest.(json|hash)` | líneas 620–629 |
| `\.ts|\.m4s|\.mp4|\.m4a|.aac|.vtt|.key → 404` en **dos** locations (8088 y plano público) | líneas 449 y 847 |
| Sin firewall de host ni fail2ban | `ufw: command not found`, `fail2ban-client: command not found` |
| PHP 8.3.6 · FPM `pm.max_children=50` · `memory_limit` FPM 512M/1024M · APCu **sí** · OPcache **sí** | `php -v`, `php -m`, `grep` en `pool.d`/`php.ini` |

**El resolver no pasa por el 8088.** El doble hop 443→8088 es del gateway `/cdn/` (metadata), no del Resolver.
Colapsarlo (fase 2) **no** debe hacerse enrutando el resolver por 8088: movería PHP a un plano sin TLS y con
otro contexto de subrequest.

---

## §6 · Riesgos de seguridad (con evidencia)

| ID | Sev. | Hallazgo | Evidencia medida | Impacto | Corrección propuesta | Dueño |
|---|---|---|---|---|---|---|
| **S1** | **CRÍTICA** | **Oráculo de credenciales sin auth + CORS `*`**: `GET /resolve.php?ch=N` devuelve URL con `user:pass` del proveedor y `Access-Control-Allow-Origin: *` | `200 / 8.609 B`, cabecera ACAO `*` (l.176); 200/8.608 con `mode=m3u`; enumerable por `ch` (regex 1–64) | Cosecha de credenciales del proveedor desde cualquier navegador/IP; consumo de la cuota del proveedor | (a) auth/allowlist en el edge **o** retirar endpoints (hoy sin tráfico orgánico); (b) **rotar** las 3 parejas; (c) nunca «arreglar» con `REQUIRE_SIG` (S10) | propietario + edge (ventana) |
| **S2** | **ALTA** | **Resolvers legacy vivos y públicos** con host del proveedor hardcodeado | `/lists/resolve.php` **200 / 7.434 B** (775, dir 775); `/resolve_quality_v5.php` **200 / 6.590 B**; `/resolve_quality_unified_LIVE.php` 200/0 B; grep de host en `resolve_quality_v5.php` y `resolve_quality_unified_LIVE.php` | Anti-SSOT: varias generaciones emiten credenciales; al rotar, URLs obsoletas | Bloquear `^/(lists/resolve|resolve_quality_v5|resolve_quality_unified_LIVE)\.php$` en el edge **solo con ventana** (afecta `/lists/` ⇒ decisión del propietario) | propietario |
| **S3** | **ALTA** | **Upload sin autenticación al directorio servido**: `upload.php` con `'auth_token' => ''`, 512 MB, escribe en `/var/www/lists`; `finalize_upload.php`/`upload_chunk.php` sin comprobaciones de auth en el código | lectura de `upload.php` (config), `GET upload.php` → 405 (existe, espera POST); `/var/www/html` es propiedad de `www-data` (`drwxr-xr-x+`) | **Envenenamiento de la lista publicada** (lo que descargan los players) y escritura en webroot | Auth real (token en `/etc/ape`, no en el webroot) + `client_max_body_size` + allowlist de nombres; **fuera de mi inScope** — reportar | propietario / seguridad |
| **S4** | MEDIA-ALTA | **Integridad del mapa**: `map.user/pass/stream_id` se aplican sin validar; `list=` puede seleccionar un `*.channels_map.json` creado por `www-data`; existen mapas 142 MB `www-data` en el webroot | l.~443-452; `ls` de mapas; dir webroot escribible por `www-data` | Sustitución de credenciales/stream en la salida del resolver | Validar `user/pass` contra el registro; servir el mapa desde `/etc/ape` (0640) en vez del webroot | propietario |
| **S5** | MEDIA | **Cascada invertida** P0→L120, P4→L153, P5→L180 | §3.1 (medido en vivo) | Si se usa para `CODECS=`: viola Ley Cardinal 1 / GOLDEN RULE (freeze en players que decodifican lo declarado) | Corregir el mapeo o usar `codec_cascade_per_profile`; **jamás** consumir ese `codec` para `CODECS=` | candidato (no desplegar aún) |
| **S6** | MEDIA | **DoS por memoria**: `memory_limit` FPM 512M/1024M, 50 hijos, mapa de 27 MB ⇒ 153 MB pico/request; sin rate-limit ni auth; endpoint sin tráfico legítimo | `php -m`/ini, `pm.max_children`, decode medido | 50 concurrentes ≈ 7,6 GB sobre 3.819 MB ⇒ OOM del VPS | `limit_req`/`limit_conn` en el edge **solo si** el resolver se queda; o retirarlo | edge (ventana) |
| **S7** | MEDIA | **Esquema `http://` y verificación TLS desactivada en el fragmento** | l.455 (`http://`); l.666/669/670 (`tls-version=1.0`, `ssl-verify-peer/host=false`) | Credenciales en claro hacia el proveedor; MITM si el proveedor soportara TLS | Evaluar `https://` **solo si el proveedor lo soporta**; quitar `ssl-verify-*=false` si se usa TLS | propietario (no en esta fase) |
| **S8** | MEDIA | `res` sin validar ⇒ inyección de atributos en `video-track` | l.380-382 + salida EXTINF | Fragmento malformado; si algún día se cachea, envenenamiento de caché | `preg_match('/^\d{3,5}x\d{3,5}$/')` | candidato |
| **S9** | BAJA-MEDIA | Manifiesto de calidad **público** (200 en 443; además bypass `:80` sin TLS) y plano `:8088` en `0.0.0.0` | curl 200 `/prisma/quality-manifest.json`; config l.620-629; `ss` | Reconocimiento interno (tiers, hashes) y surface extra | Servir solo loopback o exigir token en `/prisma/` | edge/owner |
| **S10** | BAJA | `TOKEN_MODE=none` + `TOKEN_SECRET` = placeholder público + `REQUIRE_SIG=false` con `EXPECTED_SIG` estático | l.42/43/48/49 | «Endurecer» con flags sería **teatro**: hmac falsificable, sig replayable | Ver §7 (no tocar flags) | — |
| **S11** | BAJA | 20 copias de resolver en el webroot (`.bak`, `.LIVE`, más ~2,3 MB); symlink circular `/var/www/html/lists ↔ /var/www/lists` | `find /var/www/html -name '*resolve*'`; `ls -l /var/www/lists` | Ruido de auditoría; solo las `.php` ejecutan; riesgo de confusión | Housekeeping con OMEGA-NO-DELETE (mover, no borrar) | housekeeping |
| **S12** | INFO | `/etc/ape/origins.php` **0640 root:www-data** (fuera del webroot) ✔ — buena práctica ya aplicada | `stat` | — | Mantener; el propio archivo pide **rotar** | propietario |
| **S13** | INFO | Shim CMAF inerte (`cmaf_integration_shim.php` no existe) y sin vídeo en el VPS (`.ts/.m4s/.mp4 → 404`) | `ls cmaf_engine/`; dump nginx | Consistente con la doctrina UHD (el VPS no compone píxeles) | No «reparar» el shim sin fuente | — |

---

## §7 · Qué cambiaría si se endurece (escenarios y coste)

> **Regla:** aquí no se despliega nada. Cada escenario dice qué tocaría, qué rompería y cómo se revierte.

### H1 · Auth/allowlist en el **edge** (recomendado, 0 líneas de PHP)
- **Qué:** `location` dedicada para la familia resolver con `allow/deny` por IP de salida de los devices, o
  `auth_request`/token en el edge, o mTLS. Sin tocar PHP.
- **Efecto:** S1 y S6 desaparecen del plano público; el resto de fases (HTTP/2, caché) no se ven afectadas.
- **Requisito:** los devices están detrás de IP dinámica ⇒ probablemente token de dispositivo o red WireGuard
  (ya existe `wg0`). **Decisión del propietario**, ventana en §4.
- **Rollback:** quitar las 3 líneas del `location` + `nginx -t` + reload (probado).

### H2 · Retirar la familia resolver del plano público (`return 404`)
- **Qué:** 3 líneas de nginx. **Hoy no rompería playback** (0 referencias en las 3 listas servidas).
- **Riesgo:** players con listas **cacheadas antiguas** que aún resuelvan `EXTATTRFROMURL` fallarían al zapear.
  Mitigación: medir `resolver.log` durante 7 días (hoy: 0 orgánico) y ventana de reversión.
- **No hacerlo desde esta sesión:** `resolve.php` y `/lists/` están en la lista de PROHIBIDOS del equipo; es
  orden del propietario.

### H3 · URL firmada real (HMAC con `exp`) en el resolver
- **Requisito duro:** el **generador** no puede calcular el HMAC (no tiene secreto) ⇒ la firma tiene que
  emitirla un endpoint autenticado o el edge, no la lista. `TOKEN_TTL=120` solo tendría sentido validando `exp`
  con `hash_equals` y secreto en `/etc/ape` (0640), nunca en el repo.
- **Efecto:** S1 queda cerrado de verdad.
- **Coste:** cambios en PHP (candidato) + generador (`frontend/js/**`, lock de dsh-lead) + ventana + `php -l`.
  **No es fase 1-3 de este equipo.**

### H4 · `TOKEN_MODE='hmac'` — **NO**
El propio archivo avisa: si el origin no acepta query params desconocidos, hay que usar `none`. Además el
secreto es el placeholder público. Activarlo no protege y puede provocar **403 del proveedor** (peor que hoy).

### H5 · `REQUIRE_SIG=true` — **NO**
`EXPECTED_SIG` es un literal público y estático: cualquiera lo reenvía (replay). Solo consigue **403 a todos**
los llamantes actuales (ninguno manda `sig`). No es seguridad, es una regresión.

### H6 · Corregir la cascada (§3.1) — candidato, no ahora
- **Qué:** mapear por nivel real (o leer `codec_cascade_per_profile`) respetando **L153 = techo 4K@60** y sin
  emitir jamás un nivel por debajo de la resolución.
- **Validación:** tabla P0–P5 contra Ley Cardinal 1 + GOLDEN RULE; `php -l`; rollback = restaurar
  `27DB7AB7…` (6.270 B).
- **No** cambia `CODECS=` de la lista: el wrapper no emite listas.

### H7 · Cachear el mapa (solo si el resolver se queda)
- APCu está instalado, pero el array decodificado pesa **153 MB** (shm por defecto 32 MB) ⇒ no cabe tal cual.
  Opciones: índice compacto (solo `profile/label/origin/user/pass/stream_id/math`) o shards. Quitaría
  ~150–200 ms de los ~200 medidos. **Solo tiene sentido si el resolver vuelve al camino vivo.**

---

## §8 · Qué **NO** debe tocar el edge (normativo)

> Estas reglas son el contrato de esta auditoría con `edge-sre` (fases 1-6). No son opiniones: cada una tiene
> una razón medida.

1. **No tocar** `resolve.php`, `resolve_quality_unified.php`, `resolve_quality.php`, `/etc/ape/origins.php`,
   `channels_map.json` (symlink y destinos) ni `/lists/resolve.php`. El SSOT de URL/token vive ahí; un cambio
   invalida el pin y la rotación pendiente.
2. **No añadir caché** a `/resolve.php` sin:
   (a) clave con **query string completa** (`$is_args$args`) — si no, un canal sirve el fragmento de otro;
   (b) TTL ≤ 30 s y ≤ TTL del token (hoy inerte, pero no se debe asumir);
   (c) **sin** `fastcgi_ignore_headers Cache-Control` (el `Cache-Control: no-store` del PHP es deliberado).
   El `nginx-live-current.conf` del repo **no está desplegado**: no es baseline ni se «restaura».
3. **No reescribir el cuerpo del fragmento** (nada de `sub_filter`/`body_filter` sobre respuestas PHP `.m3u`
   del resolver): el `#EXTHTTP` es **JSON con slashes escapados** y 99 claves; cualquier reescritura lo corrompe.
4. **No comprimir** la salida del resolver (`gzip`/`gunzip`/`gzip_static` son del plano de listas, no de PHP).
   La regla `gzip_static/gunzip` de las listas **no se toca** (prohibido por el alcance del equipo).
5. **No mover el resolver al 8088** ni «colapsar el doble hop» enrutándolo: el doble hop es `/cdn/`, no el
   resolver. Mover PHP a 8088 lo saca de TLS y de su contexto de `fastcgi`.
6. **No tocar** la regla `.ts|.m4s|.mp4|.m4a|.aac|.vtt|.key → 404` (doctrina UHD: el VPS no sirve vídeo).
7. **No tocar `CODECS=`** ni consumir el `codec` del JSON de cascada (§3.1 invertido). La metadata UHD
   (`VIDEO-RANGE=PQ`, `declare_auto`) sigue siendo del generador; el edge solo rebasa URIs.
8. **No añadir `ngx.exit(503)`, circuit breaker ni rate-limit** que pueda frenar al usuario único
   (doctrina autopista). Si se añade `limit_req` para el resolver (S6), debe ser **por IP, con burst alto y
   solo en la familia resolver**, y con ventana.
9. **No inyectar `srv=`/`url=`** en las listas ni «revivir» el credential-passthrough: el resolver desplegado
   **no los lee** y `srv=` filtraría credenciales base64 en la lista publicada.
10. **No tocar HTTP/2 por el resolver:** el resolver compone URLs absolutas con `http://<host>` desde `ORIGINS`;
    el esquema/`Host` de la petición al resolver no influye. Activar `http2` en 443 es seguro para el resolver
    (no altera su salida), pero **no** cambia sus latencias (192–213 ms son PHP+mapa).
11. **No «limpiar»** las copias `.bak/.LIVE` del webroot ni el symlink `lists` sin OMEGA-NO-DELETE y decisión
    del propietario (S11).
12. **No citar** el `fastcgi_cache resolver_cache` del repo como si estuviera activo: no lo está (§5).

---

## §9 · Observabilidad de la decisión (fase 6): qué puede dar el resolver y qué no

| Métrica pedida por la fase 6 | ¿El resolver puede? | Por qué |
|---|---|---|
| `provider_fetch_ms` | **NO** | el resolver **no hace fetch** al proveedor; solo compone la URL (l.455) |
| `hops` | **NO** | no hay proxy: responde PHP directamente en 443 |
| `uhd_mode` | **NO** | el perfil (P0–P5) no es `uhd_mode`; además `autoProfile` cae a P3 con `ch` numérico |
| `rebase_pct` | **NO** | el rebase de URIs es del `body_filter` Lua (`ape_uri_rebase.lua`), no del PHP |
| `ms` de la resolución | **SÍ** | ya se escribe (`ms=…`), pero mezcla mapa+CPU; hoy **media 227,5 ms** |
| `ch`, `prof`, `dev`, `vlc`, `hdr` | **SÍ** | formato actual del log desplegado |
| `tier`/`codec` (cascada) | **SÍ** (solo en el JSON) | útil para auditar la inversión de §3.1 |

**Dónde deben vivir `provider_fetch_ms`, `hops`, `uhd_mode`, `rebase_pct`:** en el edge Lua
(`header_filter`/`body_filter`/`log` de `_vps_stage/lua/**`), que es quien hace el fetch al proveedor, el rebase
y el salto 443→8088. El PHP no es la fuente.

**Nota de tráfico:** el log del resolver (23.122 líneas) es hoy la única telemetría de esa pieza y demuestra que
**está ociosa**: 30–33 entradas el 2026-10-26, todas de sondas. Antes de invertir en el resolver, el equipo debe
decidir si vuelve al camino vivo.

---

## §10 · Recomendaciones priorizadas

| P | Acción | Dueño | Reversible |
|---|---|---|---|
| **P0** | **Rotar las 3 parejas** de `/etc/ape/origins.php` (el archivo lo pide; el repo/ZIP las expone) | propietario (ORDEN-3) | sí (ventana) |
| **P0** | **Cerrar S1**: auth/allowlist de la familia resolver en el edge **o** retirarla (0 tráfico orgánico) | propietario + edge | sí (3 líneas + reload) |
| **P0** | **Cerrar S3**: auth real en `upload.php`/`finalize_upload.php` (hoy `auth_token=''`) | propietario / seguridad | sí |
| **P1** | Bloquear/retirar resolvers legacy de S2 (con ventana; `/lists/` es prohibido para este equipo) | propietario | sí |
| **P1** | Pin de los bytes desplegados: `resolve.php` = `31E13A03…` (42.620 B) y wrapper = `27DB7AB7…` | documentación | — |
| **P1** | Si el resolver se queda: `limit_req`/`limit_conn` por IP + `memory_limit` acotado (S6) | edge/PHP | sí |
| **P1** | Servir `quality-manifest.json` solo a loopback (S9) | edge | sí |
| **P2** | Corregir la cascada (H6) como **candidato** con rollback al pin | PHP (candidato) | sí |
| **P2** | Validar `res` (S8) y `map.user/pass` (S4) si el resolver se mantiene | PHP (candidato) | sí |
| **P2** | Si el resolver vuelve: cachear el mapa (índice compacto/APCu) y medir <100 ms de PHP | PHP/edge | sí |

---

## §11 · Correcciones a documentos existentes (no edito archivos de otras sesiones)

1. **`docs/manifestos/RESOLVER_CANONICO.md` §1 — «Prueba real GET /resolve_quality.php?ch=1&p=P3 → 200, 8.613 B
   con #EXTINF»**: medido hoy ⇒ **200 / 222 B / `application/json`**. El fragmento de 8.6 KB aparece con
   `&mode=m3u` (**8.608 B**) o llamando a `/resolve.php` (**8.609 B**). La evidencia del canon mezcló las dos rutas.
2. **`RESOLVER_CANONICO.md` §3 — pin**: `27DB7AB7…` cubre **solo** el wrapper. Añadir el pin del SSOT real:
   `/var/www/html/resolve.php` = **42.620 B / `31E13A03ab70f02844cf9c6634718c7a656aec9e0b72e1145cd813e509e98665`**
   (y anotar que **no existe en el repo**).
3. **`RESOLVER_CANONICO.md` §4 — «La lista viva apunta a resolve_quality.php»**: **no** para las 3 listas de
   `/var/www/lists` (0 referencias, medido a archivo completo). `[UNKNOWN]` para una copia CDN externa.
4. **`docs/REA_EVIDENCE_AUDIT.md:121`** — la igualdad 43.754/`9815c663` es con `/var/www/iptv-ape/resolve.php`
   (copia histórica), no con el archivo servido (42.620/`31E13A03`).
5. **`COORDENADAS_SESIONES.md` §5.1** — «Rotar las 5 parejas»: el resolver confirma **3** parejas en
   `/etc/ape/origins.php` + las que sigan hardcodeadas en las copias legacy de S2; el propietario debería rotar
   **todas** las que hayan estado en repo/ZIP.

---

## §12 · Evidencia reproducible (solo lectura) y declaración de no-mutación

**Declaración:** no se ejecutó ningún `POST`, no se escribió ningún archivo en el VPS, no se recargó nginx, no se
tocó `/var/www/lists`, no se modificó PHP. Las únicas escrituras indirectas son las líneas de log que el propio
resolver añade al servir un `GET` (5–7 líneas de esta auditoría, visibles en `resolver.log` con `ch=1`/`ch=392200`).
El `php -l` es lint (no ejecuta). El decode del mapa se hizo con `php -r` en CLI, solo lectura.

```bash
# Repo (Windows) — hashes de todas las copias
Get-FileHash ...\vps\resolve.php, ...\vps\resolve_quality_unified.php, ...\backend\resolve_quality.php -Algorithm SHA256

# VPS (solo lectura)
stat -c '%a %U:%G %s %y %n' /var/www/html/resolve.php /var/www/html/resolve_quality_unified.php \
        /var/www/html/resolve_quality.php /etc/ape/origins.php /var/www/lists/resolve.php
sha256sum /var/www/html/resolve.php /var/www/html/resolve_quality_unified.php \
          /var/www/html/resolve_quality.php /var/www/lists/resolve.php /etc/ape/origins.php
php -l /var/www/html/resolve.php            # No syntax errors detected
php -r '…json_decode(file_get_contents("/var/www/html/channels_map.json"))…'   # 210.2 ms / 153 MB / 8366
nginx -T | grep -nE "location|fastcgi_cache|limit_req|auth_basic"
ss -lntp | grep -E ':(80|443|8088|8089)\b'
curl -sS -o /dev/null -w '%{http_code} %{size_download}' --resolve iptv-ape.duckdns.org:443:127.0.0.1 \
  'https://iptv-ape.duckdns.org/resolve.php?ch=1&p=P3'                       # 200 8609
curl … '/resolve_quality.php?ch=1&p=P3'                                      # 200 222 (JSON)
curl … '/resolve_quality.php?ch=1&p=P3&mode=m3u'                             # 200 8608 (M3U)
curl -D - -o /dev/null … '/resolve.php?ch=1&p=P3' | grep -i access-control # ACAO: *
zgrep -c 'resolve_quality' /var/www/lists/APE_LISTA_4K.m3u8.gz              # 0
zgrep -c 'srv='           /var/www/lists/APE_LISTA_4K.m3u8.gz              # 0
awk … /var/log/iptv-ape/resolver.log                                        # media 227.5 ms, máx 9758.1
```

**Límites declarados de esta auditoría**
- No se ha verificado la autenticación del escritor del manifiesto (`/prisma/api/prisma-adb-quality.php`): solo se
  observó la ruta pública y el header CORS ⇒ `[UNKNOWN]`.
- No se ha medido el hash de `/var/www/iptv-ape/resolve.php` (solo tamaño/mtime).
- No se ha inspeccionado el binario/APK de players; la compatibilidad de `#EXTHTTP`/`#EXTVLCOPT` se cita de otras
  auditorías (REA), no de medición propia.
- No se ha verificado si existe una lista servida por un CDN externo distinta de `/var/www/lists` ⇒ `[UNKNOWN]`.
- `php -m` mostró APCu y OPcache en CLI; el `memory_limit` efectivo de FPM se leyó de los ini (512M/1024M), no de
  un request real.

---

**Fin del informe.** Ninguna de las acciones de §7/§10 se ejecutó: son propuestas con dueño y ventana.
