# E5 · DOCTRINA UHD — la metadata se mantiene, el píxel se hace en el device

> **Estado:** COMPLETO en lo que toca al artefacto (doctrina + guard + evidencia).
> **Cero cambios en el VPS**: ni flags, ni config, ni reload, ni ficheros persistentes.
> **Ventana de medida:** 2026-10-26 20:33 → 20:45 UTC (Bogotá 15:33 → 15:45).
> **VPS:** `ubuntu-2gb-ash-1` · nginx 1.24.0 + `ngx_http_lua` · `MainPID 2001835` · `NRestarts 0`
> · `nginx -T` sha256 `ddf6a267aee7fb66…` (post-hotfix de `/upload.php`, ver `BASELINE.md` §2).
> **Artefactos:** [`_vps_stage/edge/uhd/`](../../_vps_stage/edge/uhd/) · **arnés:** [`capture_uhd.mjs`](../../_vps_stage/edge/uhd/capture_uhd.mjs)
> · **guard:** [`uhd_doctrine_guard.mjs`](../../_vps_stage/edge/uhd/uhd_doctrine_guard.mjs)
> · **parche propuesto:** [`E5-uhd-techo4k.patch.md`](../../_vps_stage/edge/uhd/proposed/E5-uhd-techo4k.patch.md)

---

## 0 · Veredicto en ocho líneas

1. **El VPS no transcodifica ni reempaqueta vídeo.** Medido: 0 procesos `ffmpeg`, 0 `os.execute`/
   `io.popen` en los 14 módulos Lua, 0 unidades/timers/cron de transcode, `MAX_BODY` 4 MiB, y el
   gateway sólo reescribe texto. `ffmpeg` **está instalado** (`/usr/bin/ffmpeg`) pero **nadie lo invoca**.
2. **La metadata se mantiene**: `RESOLUTION` declarativa + `VIDEO-RANGE=PQ` (bajo `uhd_pq`) y
   **`CODECS` intacto byte a byte** en las 4 parejas medidas (fuente → servido).
3. **El guard UHD-01..12 existe y muerde** (selftest 8/8 con sabotajes). Su veredicto **hoy es FAIL**,
   por un blocker real que este documento cierra por diseño y deja listo para desplegar:
   **`uhd_auto=1` (default) declara `RESOLUTION=7680x4320` con `CODECS="hvc1.2.4.L153.B0"`** →
   Ley Cardinal 1 rota (L153 = techo 4K@60; familia del freeze 2026-06-08).
4. **Segundo riesgo latente**: con `uhd8k=1` el módulo declara 8K **sin mirar la fuente** (medido:
   8K sobre una fuente 1080p AVC). El parche propuesto lo exige `fuente ≥4K` **y** nivel `≥ L183`.
5. **Hallazgo colateral de doctrina (a)**: la location `/cdn/` **sombrea** la regla `\.(ts|m4s|mp4)$ → 404`
   en los dos planos (443 y 8088) por orden de regex, así que un `.ts` **sí** entra por `/cdn/`
   y el gateway lo devuelve (máx. 4 MiB) **corrupto** (el rebase prefija el origen a toda línea
   que no empiece por `#`). Medido en loopback y en público. Patch mínimo en §2.5.
6. **Hallazgo colateral de seguridad**: el allowlist SSRF del gateway (`host_allowed`) se salta con
   `remote_addr == 127.0.0.1`, y el plano 443 le habla al 8088 desde loopback **sin `real_ip`** ⇒
   cualquier `GET /cdn/<host>/<ruta>` público alcanza hosts arbitrarios y servicios internos.
   Medido: `200` público de un fixture interno. **No es mi lane; se reporta para E8/seguridad.**
7. **El píxel se hace en el DEVICE** (VPP AI-SR/AI-PQ del SoC, ruta real pinneada por el gate T40)
   **o por remux/transcode fuera del VPS**. El gate `fake_ai_headers_assert.js` sigue **PASS**:
   0 headers IA de marca, ruta real `pq_ai_sr_enable`/`ai_sr_level`/`ai_pic_mode` intacta.
8. **No se tocó `CODECS`.** Ni una coma. Eso es la frontera entre «mantener metadata» e «inventar codec».

---

## 1 · Evidencia y bytes exactos

| Dato | Valor medido |
|---|---|
| Config viva `nginx -T` | sha256 `ddf6a267aee7fb6614d0205423c27e15e0482e6fe28fe295f51a99780c55be5f` |
| `ape_gateway.lua` (vivo) | **267 líneas · 11.651 B · `66a2001730d7e2b5…`** (el del repo `b9eb1406…` **NO** es el vivo, D-32) |
| `ape_uhd.lua` (vivo) | 124 líneas · 5.320 B · `f1f5eb674744858a…` — **idéntico al repo** |
| `ape_rebase_lib.lua` (vivo) | `88140fc80ece09ca…` — **idéntico al repo** |
| `ape_obs.lua` (vivo) | `f477741bcfa600bb…` — idéntico al repo |
| Flags vivos | `{"uhd_auto":"1","uhd4k":"1","uhd8k":"0","uhd_pq":"0", "virtual4k":"0","rebase":"1","enrich":"0","wake":"1","sentinel":"1","auth":"0","hint":"0"}` |
| Host | 3 vCPU · 3.819 MB RAM · `/usr/bin/ffmpeg` presente · **0 procesos ffmpeg** |
| `ape_luatest` (self-test del VPS) | **68/68 pass · fail 0** |
| Captura estructurada | [`cases/20261026T204116Z.json`](../../_vps_stage/edge/uhd/cases/20261026T204116Z.json) (+ `latest.json`) |
| Log crudo de la captura | [`runs/20261026T204116Z/capture.log`](../../_vps_stage/edge/uhd/runs/20261026T204116Z/capture.log) |

Copias de bytes vivos para lectura (no se despliegan): [`live/`](../../_vps_stage/edge/uhd/live/)
(`ape_gateway.lua.live`, `ape_uhd.lua.live`, `ape-hosts-allow.txt.live`, hashes = VPS).

---

## 2 · (a) El VPS no transcodifica ni reempaqueta — y las tres excepciones medidas

### 2.1 Pruebas de que **no** hay transcode ni repack

| # | Prueba | Medición |
|---|---|---|
| 1 | Procesos de transcodificación | `ps -eo args \| grep -c '[f]fmpeg'` → **0** |
| 2 | Ejecución desde Lua | `grep -rlE 'os\.execute\|io\.popen' /etc/nginx/lua/` → **0 ficheros** (14 módulos) |
| 3 | Unidades / timers / cron de transcode | `grep -rlE 'ffmpeg\|avconv\|transcode' /etc/systemd/system /etc/cron.d /etc/crontab` → **0** |
| 4 | Tamaño de cuerpo | `ape_rebase_lib.MAX_BODY = 4 MiB`; por encima → `502 playlist_too_large` (no hay streaming de segmentos) |
| 5 | Naturaleza de la respuesta | `Content-Type: application/vnd.apple.mpegurl`, `Cache-Control: no-store`, `Content-Length` borrado (chunked) |
| 6 | Regla de vídeo en el plano público | `sites-enabled/default:175-177` → `location ~* \.(ts\|m4s\|mp4)$ { return 404; }` |
| 7 | Regla de vídeo en el plano 8088 | `conf.d/50-ape-meta-plane.conf:225-227` → `\.(ts\|m4s\|mp4\|m4a\|aac\|vtt\|key)$ → 404` |
| 8 | Sin `/px/` activo | `conf.d/iptv-proxy.conf` define **sólo** el `map $cache_ttl`; no hay `location /px/` en ningún bloque habilitado |
| 9 | Único proxy a 8088 | `snippets/ape-meta-public.conf:21` → `proxy_pass http://127.0.0.1:8088` (plano de texto) |

**Conclusión (a) en lo esencial:** el pipeline no contiene un solo paso que reciba, decodifique,
recodifique o remuxee vídeo. `CODECS` no se toca, `RESOLUTION` se declara, y **el bitstream nunca se
reescribe**. Eso es `rebase-only` y así se queda.

### 2.2 Defecto E5-F1 · `/cdn/` sombrea la regla `.ts → 404` (severidad ALTA, doctrina)

nginx evalúa las `location` regex **en orden de aparición**; gana la primera que casa. En los dos
planos, la location de `/cdn/` está **antes** del candado de vídeo:

| Fichero | Línea `/cdn/` | Línea candado vídeo | ¿Quién gana en `/cdn/x/nope.ts`? |
|---|---:|---:|---|
| `snippets/ape-meta-public.conf` (443) | 16 | 44 | **`/cdn/`** |
| `conf.d/50-ape-meta-plane.conf` (8088) | 182 | 225 | **`/cdn/`** |

**Medición que lo demuestra (no es teoría):**

| Petición | Respuesta | Cuerpo | Quién respondió |
|---|---|---|---|
| `GET 127.0.0.1:8088/meta/…/nope.ts` | `404` | `text/html` (146 B, 404 de nginx) | el **candado** |
| `GET 127.0.0.1:8088/cdn/…/nope.ts` | `404` | **`application/json`** `{"reason":"http_404",…}` | el **gateway** (intentó descargar el `.ts`) |
| `GET https://<público>/cdn/…/nope.ts` | `404` | `application/json` (mismo JSON) | el **gateway**, también en público |

⇒ El comentario del snippet («El tráfico de video sigue bloqueado (404) porque este plano sólo sirve
playlists», línea 12) **es falso para las rutas `/cdn/`**. Un `.ts`/`.m4s`/`.mp4` real **sí** se
descarga a través del VPS (hasta 4 MiB por petición), lo que contradice la doctrina
«el VPS NO recibe vídeo».

### 2.3 Defecto E5-F2 · el gateway **corrompe** cualquier cuerpo que no sea manifiesto

`ape_rebase_lib.rebase_body` (`lua/ape_rebase_lib.lua:43-65`) trata **toda línea que no empiece por
`#`** como una URI relativa y le antepone el origen. Medido con un cuerpo que **no** es playlist
(`/_ape/health`, JSON):

```
servido: http://127.0.0.1:8088/{"ts":1793047020,"qoe":{…}}      ← origen prefijado al JSON
```

Aplicado a un segmento MPEG-TS (binario, con `\n` aleatorios) el resultado sería: prefijo del origen
en cada "línea", normalización CRLF→LF y un byte final añadido ⇒ **segmento corrupto** (pixelación/
freeze si el player lo aceptara). Es decir: **si el vídeo entra por `/cdn/`, no sale utilizable.**
Esto refuerza la doctrina con una razón técnica, no sólo organizativa.

### 2.4 Defecto E5-F3 · el allowlist SSRF se salta desde el plano público (severidad CRÍTICA, seguridad)

* `ape_gateway.lua:51` → `if ngx.var.remote_addr == "127.0.0.1" then return true end` (sin allowlist).
* El plano 443 le habla al 8088 **desde loopback** (`snippets/ape-meta-public.conf:21`).
* **No hay `real_ip`/`set_real_ip_from`** en toda la config (`grep -rn real_ip /etc/nginx` → 0).
* Allowlist real: una sola línea útil, `line.tivi-ott.net`.

Medido desde la estación (petición pública, sólo lectura):

```
GET https://iptv-ape.duckdns.org/cdn/127.0.0.1:8088/__fixture_master4k.m3u8
→ 200 · X-APE-CDN: 127.0.0.1:8088 · X-APE-UHD: 8k:1 · cuerpo = manifiesto interno del VPS
```

⇒ cualquier cliente de Internet puede hacer que el VPS descargue **el host y la ruta que quiera**
(SSRF), incluidos servicios internos de loopback. No he sondeado endpoints de métricas en público
por prudencia; en loopback ya se demostró que `/_ape/health` se sirve a través de `/cdn/`.
**Fuera del alcance de E5**: se reporta para la lane de seguridad/E8.

### 2.5 Patch mínimo propuesto (NO aplicado)

1. **Vídeo**: cortar en el gateway, que no depende del orden de regex —
   `if path:match("%.(ts|m4s|mp4|m4a|aac|vtt|key)$") then ngx.status = 404 … return end`
   **antes** de `fetch_follow`. (Alternativa equivalente: mover las dos locations del candado por
   encima de `/cdn/` en los dos ficheros.)
2. **SSRF**: que el plano 443 marque la petición como interna (`proxy_set_header X-APE-Internal:
   <token>`) y que el gateway **sólo** salte el allowlist con ese token + `set_real_ip_from
   127.0.0.1; real_ip_header X-Forwarded-For;` en el server 8088.

Ambos son despliegue (`_vps_stage/nginx/**` está en lock ajeno + ventana §4): **no se aplican aquí**.

---

## 3 · (b) Dónde se hace el píxel: en el device (VPP) o fuera del VPS

| Capa | Qué hace **de verdad** | Qué **no** hace | Evidencia |
|---|---|---|---|
| **Device · VPP AI-SR / AI-PQ** (ONN 4K / Amlogic S905X4; MediaTek MT8696 en Fire TV) | post-procesado por **hardware** sobre el frame ya decodificado: super-resolución, denoise, sharpness, HDR/PQ. Cualquier player, incluido AVC SDR | no cambia el bitstream, no reescribe el manifiesto | gate `_vps_stage/tests/fake_ai_headers_assert.js` **PASS**: 3 scripts pinneados (`ape-pq-guardian.sh` `2F35F8C6…`, `ape-adb-hardening.sh` `DB7D1E26…`, `read_manifest.sh` `FCD0BF53…`) + claves `pq_ai_sr_enable`, `ai_sr_level`, `ai_pic_mode`, `com.droidlogic.tv.action.AISR_ENABLE`, `com.droidlogic.tv.action.AIPQ_ENABLE` |
| **Remux / transcode fuera del VPS** | produce los píxeles «reales» cuando se quiere resolución nativa | no ocurre en el VPS | §2.1 (0 ffmpeg/0 exec/0 timers) · `docs/VPS_UPSCALE_4K_DESIGN.md` |
| **VPS (edge)** | **selecciona y declara metadata**: rebase de URIs al CDN, `RESOLUTION`/`VIDEO-RANGE=PQ` declarativos, LL-HLS `SERVER-CONTROL` si la fuente ya trae partes, QoE | no recibe ni procesa vídeo, no escala, no mejora píxeles | ✅ `X-APE-UHD: 4k:1 / 8k:1 / off`; `X-APE-URI-Rebased`; `X-APE-LL-HLS: server-control-added` (medido en `__fixture_ll.m3u8`) |
| **Player** | decodifica el **codec real** y escala la **resolución real**; usa `RESOLUTION` como hint de ABR/presentación | no convierte un bitstream en otro | `CODECS` idéntico fuente→servido (UHD-01 ok en 4/4 parejas) |

**Honestidad obligatoria (no vender lo que no hay):**

* Declarar `3840x2160` sobre bytes 1080p **no crea detalle**: el panel/TV escala. Es decisión del
  propietario (2026-10-24) y está implementada; **no** es «mejora de píxeles en el VPS».
* **8K: ningún decoder de consumo lo acepta hoy.** El techo del ecosistema es `L153` = 4K@60.
  `docs/OWNER_DECISION_UHD_PREVAIL.md` §5.2 ya lo dice: «está disponible pero apagado».
* `ffmpeg` **existe** en la imagen: la doctrina se sostiene sobre que **nadie lo invoca**, no sobre
  su ausencia. Cualquier cambio futuro que lo invoque desde la ruta de servicio viola esta fase.
* El realce real sobre SDR es el **VPP del SoC** comandado por el daemon/ADB, no
  `hdr_conversion_mode` (corrección técnica 2026-06-17 en `CLAUDE.md`).

---

## 4 · (c) Guardas: 8K sólo con fuente ≥4K, `CODECS` intacto, L153 techo

### 4.1 Las tres leyes, en forma ejecutable

| Ley | Regla | Check del guard |
|---|---|---|
| **GOLDEN RULE / FZ-01** | `CODECS` **nunca** se modifica; `hvc1.*` sólo en `STREAM-INF`, jamás `hev1.*` | `UHD-01`, `UHD-02` (**blocker**) |
| **Ley Cardinal 1** | `L153` = techo 4K@60 ⇒ **8K declarado exige nivel ≥ L183** (Level 6.1) | `UHD-09` (**blocker**), `UHD-11` (latente) |
| **8K sólo con fuente ≥4K** | ninguna variante puede declarar `7680x4320` si la fuente no llega a 3840 px | `UHD-03` (**blocker**), `UHD-10` (latente) |

Complementarios: `UHD-04` marca `#EXT-X-APE-UPSCALE` coherente · `UHD-05` PQ sin duplicar ·
`UHD-06` no reempaquetar (`MAP`/`.m4s`/`PART`) · `UHD-07` lo servido es texto · `UHD-08` nivel↔res
en declaraciones 4K (**informativo**: decisión declarativa del propietario) · `UHD-12` `uhd_pq`
enciende exactamente un PQ.

### 4.2 Matriz medida del módulo **desplegado** (`ape_uhd.lua` `f1f5eb67…`, `declare_auto`)

| Caso (fuente) | `top_res` | Declara con `uhd_auto=1` (default) | PQ con `uhd_pq=1` | Marca |
|---|---:|---|---|---|
| M1 master 1080p AVC `avc1.640028` | 1920 | **`3840x2160`** · modo `4k` | +1 | 1 |
| M2 master 4K HEVC `L153` | 3840 | **`7680x4320`** · modo `8k` ⚠️ | +1 | 1 |
| M3 fuente 8K HEVC `L153` | 7680 | `7680x4320` · `8k` ⚠️ | +1 | 1 |
| M4 fuente 8K HEVC `L183` | 7680 | `7680x4320` · `8k` (legal) | +1 | 1 |
| M5 master ascendente (720p 1.º, 4K 2.º) | **1280** | `3840x2160` **y** `3840x2160` (dos variantes) | +1 | 1 |
| M6 `hev1` en `STREAM-INF` | 3840 | módulo solo: `7680x4320` — **el gateway lo bloquea antes** (`ape_gateway.lua:218`) | +1 | 1 |
| M7 media playlist | nil | **no toca** (`n=0`) | — | 0 |

Filas de flags forzados: `declare(8K)` sobre M1 → **`7680x4320` sobre `avc1.640028`** (8K sin mirar la
fuente); `declare(4K)` sobre M2 → `3840x2160` (baja de 8K). Matriz completa:
[`runs/20261026T204116Z/lua_matrix.txt`](../../_vps_stage/edge/uhd/runs/20261026T204116Z/lua_matrix.txt).

### 4.3 Hallazgo **E5-F4** (BLOCKER) · `uhd_auto=1` declara 8K sobre `L153`

Medido en el fixture de producción documentado y **también por HTTP público**:

```
GET /cdn/…/__fixture_master4k.m3u8          → X-APE-UHD: 8k:1
#EXT-X-STREAM-INF:…,RESOLUTION=7680x4320,…CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ
```

`L153` = Level 5.1 = 8.912.896 px máx ⇒ **4K@60**. Declarar 7680×4320 (33.177.600 px) con ese nivel
es exactamente «nivel por debajo de la resolución» (Ley Cardinal 1) — la familia del **freeze
2026-06-08**. Y contradice el default documentado `uhd8k=0` («8K apagado»): el 8K está **encendido
de facto** en cuanto un master con variante ≥4K entra por `/cdn/`.

**Incidencia en tráfico real: NO medida.** El baseline E1 midió 3 canales y los tres eran *media
playlists* (`X-APE-UHD: off`). La ruta 8K sólo se dispara con masters ≥4K; cuántos canales reales
sirven master no está medido (límite declarado, §7).

### 4.4 Hallazgo **E5-F5** (HIGH) · `uhd8k=1` no mira la fuente

`declare(target=8K)` no consulta la resolución de la fuente: 8K sobre una fuente 1080p AVC (matriz
`declare_8k_forzado`). La guarda «8K sólo si la fuente es ≥4K» **no está en el código**, sólo en el
default del flag.

### 4.5 Hallazgo **E5-F6** (INFO) · 4K declarado sobre `avc1.640028` (L4.0)

`UHD-08` lo señala: 3840×2160 (8,3 Mpx) con AVC High L4.0 (2,1 Mpx). Es **decisión del propietario**
(`OWNER_DECISION_UHD_PREVAIL.md` §1: «se declara 4K y se upscala»), aceptada como riesgo de
presentación (players estrictos podrían rechazar la variante; no inicializa decoder distinto, luego
**no** es FZ-01). Se reporta, no se bloquea.

### 4.6 Hallazgo **E5-F7** (MEDIUM) · «top» = primer `STREAM-INF`, no el de mayor banda

`ape_uhd.top_resolution` y `declare(only_top=true)` usan el **orden del documento**. En un master
ascendente (720p primero) el resultado deja **dos** variantes declarando 4K y la más barata lleva el
nivel más bajo (`L93`). No es freeze, pero ensucia la decisión de ABR. El parche usa
`max_resolution()` (máximo real) para las guardas; el `declare` sigue en la 1.ª variante.

### 4.7 El guard y su veredicto de hoy

```
node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs            # exit 1  ← el hallazgo, no un fallo del guard
node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs --selftest # exit 0  (8/8)
```

| Suite | Resultado hoy |
|---|---|
| `UHD-01/02/03/04/05/06/07` (live) | ✅ ok en las 4 parejas (CODECS intacto, sin hev1, sin repack, PQ sin duplicar, marca coherente) |
| `UHD-08` (live, info) | ⚠️ 4K sobre AVC L4.0 (decisión del propietario) |
| **`UHD-09` (live, blocker)** | ❌ **`7680x4320@hvc1.2.4.L153.B0`** |
| `UHD-10/11` (latente) | ❌ `uhd8k` sin guarda de fuente · 8K con nivel < L183 en 6 filas |
| `UHD-12` (latente) | ✅ `uhd_pq` enciende 1 PQ y sólo 1 |
| **Veredicto** | **FAIL** (1 blocker, 2 high, 1 info) |
| **Selftest** | **PASS 8/8** — caza CODECS mutado, hev1, 8K sobre 1080p, PQ duplicado, MAP inventado, cuerpo binario |

### 4.8 Cierre propuesto (no aplicado)

[`proposed/E5-uhd-techo4k.patch.md`](../../_vps_stage/edge/uhd/proposed/E5-uhd-techo4k.patch.md):
`declare_auto` se queda en **4K** (techo real con `L153` intocable) y el 8K pasa a exigir
`uhd8k=1` **+** `max_resolution(fuente) ≥ 3840` **+** nivel `≥ L183`, con degradación honesta a 4K.
Verificado con el módulo vivo + las funciones del parche
([`proposed/patch_sim.lua`](../../_vps_stage/edge/uhd/proposed/patch_sim.lua),
[log](../../_vps_stage/edge/uhd/runs/20261026T204500Z/patch_sim.log)):

| Fuente | `can8k` | `uhd_auto=1` tras parche | `uhd8k=1` tras parche |
|---|---|---|---|
| 1080p AVC L4.0 | false | `3840x2160` | `3840x2160` |
| 4K HEVC **L153** | false | `3840x2160` | `3840x2160` |
| 8K HEVC **L153** | false | `3840x2160` | `3840x2160` |
| 8K HEVC **L183** | **true** | `3840x2160` | **`7680x4320`** |
| ascendente 720p/4K | false | `3840x2160 ; 3840x2160` | `3840x2160 ; 3840x2160` |

Tras el parche el guard queda **sin blockers** (sólo el informativo `UHD-08`). **Ojo**: hay que
actualizar `ape_luatest.lua:155-156` (`uhd.auto_4k_a_8k`, `uhd.auto_4k_modo`) en el mismo despliegue.

---

## 5 · (d) Flags: efecto **exacto** medido

Cascada real en `ape_gateway.lua:215-233` (el orden importa):

1. `codec_truth_fields(rebased) > 0` (hay `hev1` en algún `STREAM-INF`) → **UHD omitido** (`X-APE-UHD: off`), log WARN.
2. `uhd8k` → `declare(7680x4320, only_top)` **sin mirar la fuente** (ver E5-F5).
3. `uhd_auto` → `declare_auto` (top ≥3840 → 8K; si no → 4K). **Sombra a `uhd4k`.**
4. `uhd4k` → `declare(3840x2160, only_top)` — **sólo alcanzable con `uhd_auto=0`**.
5. Sólo se aplica si `lib.is_master(rebased)` (el cuerpo contiene `#EXT-X-STREAM-INF`).

| Flag | Default vivo | Efecto exacto medido | Notas |
|---|---|---|---|
| `uhd_auto` | **`"1"`** | `top < 3840` → `RESOLUTION=3840x2160`; `top ≥ 3840` → `RESOLUTION=7680x4320`. Marca `#EXT-X-APE-UPSCALE:declared=…;codec=truthful;mode=4k\|8k` tras `#EXTM3U`. `CODECS` intacto | **Es la ruta viva.** Declara 8K por defecto (E5-F4) |
| `uhd4k` | `"1"` | `RESOLUTION=3840x2160` en la variante top, en cualquier fuente | **Inerte mientras `uhd_auto=1`** (paso 3 gana al 4) |
| `uhd8k` | `"0"` | `RESOLUTION=7680x4320` en la variante top, **sin guarda de fuente** | Si `uhd_auto=1` también está, **gana `uhd8k`** (paso 2) |
| `uhd_pq` | `"0"` | añade `,VIDEO-RANGE=PQ` **una sola vez** al `STREAM-INF` tocado; no duplica si ya existe; no toca las demás variantes | Riesgo aceptado: color-shift en players sin daemon (no freeze) |
| `virtual4k` | `"0"` | **NINGUNO — flag muerto.** Está en los defaults (`50-ape-meta-plane.conf:119`) y en el contador QoE (`ape_obs.lua:47`), pero **ningún módulo lo lee** (`grep -rn virtual4k /etc/nginx` → sólo esas 2 referencias) | El «LEVER B» de `CLAUDE.md` vive en `combined_body_filter.lua`, **que no está desplegado** (`ls /etc/nginx/lua` → no existe). D-32: no se documenta como activo |

Cabecera de observabilidad: `X-APE-UHD: off | 4k:N | 8k:N` (N = variantes tocadas; medido `4k:1`,
`8k:1`, `off`). `X-APE-URI-Rebased`, `X-APE-LL-HLS`, `X-APE-Upstream-Ms`, `X-APE-LAB-FLOOR` completan
la decisión (fase 6 las llevará al log).

**Comandos (sólo loopback; no se ejecutaron):**

```bash
curl -s http://127.0.0.1:8088/_ape/flags                      # ver
curl -s "http://127.0.0.1:8088/_ape/flags?k=uhd8k&v=1"        # encender 8K (E5-F5: sin guarda)
curl -s "http://127.0.0.1:8088/_ape/flags?k=uhd_pq&v=1"       # añadir PQ
curl -s "http://127.0.0.1:8088/_ape/flags?k=uhd8k"            # borrar → vuelve al default
```

> **Ninguno se ejecutó en esta fase**: cambiar un flag es mutación de estado vivo (§4 de
> `COORDENADAS_SESIONES.md`). El efecto de cada combinación se midió **llamando al módulo con
> `lua5.1`**, no cambiando el flag.

---

## 6 · Cómo reproducir

```bash
# 1 · captura read-only (VPS: hashes, flags, 4 parejas fuente→servido, matriz del módulo, sondas públicas)
node _vps_stage/edge/uhd/capture_uhd.mjs --label "E5-UHD" --public-probes

# 2 · guard (exit 1 = blocker) y selftest de los sabotajes
node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs
node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs --selftest
node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs --strict --json

# 3 · simulación del parche (carga el módulo VIVO, no escribe nada)
$lua = Get-Content _vps_stage/edge/uhd/proposed/patch_sim.lua -Raw ; $lua | ssh hetzner-iptv 'lua5.1 -'

# 4 · gate de la ruta REAL de AI-SR (device)
node _vps_stage/tests/fake_ai_headers_assert.js
```

---

## 7 · Límites y honestidad (lo que esta fase **no** prueba)

1. **Incidencia del 8K en canales reales: no medida.** Se midieron 4 fixtures del VPS; el baseline
   E1 midió 3 canales reales y los tres eran *media playlists* (`X-APE-UHD: off`).
2. **La fuente es lo que el proveedor DECLARA.** Si un master miente (`RESOLUTION=3840x2160` sobre
   bytes 1080p), el 8K se declararía sobre 1080p real. La verdad del bitstream sólo se puede medir
   fuera del VPS (probe/ffprobe); por eso el parche exige además nivel `≥ L183`.
3. **No se probó el 8K en un decoder real.** Ningún decoder de consumo acepta 8K hoy; el techo es
   `L153` = 4K@60 (`OWNER_DECISION_UHD_PREVAIL.md` §5.2).
4. **N pequeño y fixtures sintéticas** para M1-M7 (derivadas del master real del VPS). Las parejas
   servido/fuente son **bytes reales** del VPS.
5. **Perturbación declarada** (el arnés escribe contadores, como el de E1): mis ~12 peticiones
   sumaron a `/_ape/qoe` (`req` 137→202, `all_failed` 41→70 en la ventana) y **2 fallos propios**
   (`/cdn/…/nope.ts`) marcaron `host_down:127.0.0.1:8088` con TTL 15 s (sin efecto en tráfico real).
   Además, una captura de cabeceras escribió **dos ficheros temporales** en `/tmp`
   (`h_ll.txt`, `b_ll.txt`) que se borraron en la misma sesión. **No se tocó config, ni flags, ni
   servicio, ni `/var/www/lists`.**
6. **`X-APE-UHD` no apareció nunca en el plano público de la lista** (la lista es estática y no pasa
   por Lua, `BASELINE.md` §5.1): el UHD es exclusivo de `/cdn/`.
7. **El parche no está aplicado.** E5 cierra el diseño y la evidencia; el despliegue necesita
   ventana §4 y el lock de `_vps_stage/lua/**`.

---

## 8 · Evidencia (rutas y hashes)

| Artefacto | Ruta | Nota |
|---|---|---|
| Captura E5 | [`cases/20261026T204116Z.json`](../../_vps_stage/edge/uhd/cases/20261026T204116Z.json) | 4 parejas + 20 filas de matriz + 2 sondas públicas |
| Captura (última) | [`cases/latest.json`](../../_vps_stage/edge/uhd/cases/latest.json) | la que consume el guard por defecto |
| Log crudo | [`runs/20261026T204116Z/capture.log`](../../_vps_stage/edge/uhd/runs/20261026T204116Z/capture.log) | salida SSH completa |
| Matriz del módulo | [`runs/20261026T204116Z/lua_matrix.txt`](../../_vps_stage/edge/uhd/runs/20261026T204116Z/lua_matrix.txt) | 20 filas `CASE/TOP` |
| Simulación del parche | [`runs/20261026T204500Z/patch_sim.log`](../../_vps_stage/edge/uhd/runs/20261026T204500Z/patch_sim.log) | antes/después con el módulo vivo |
| Gate ruta AI-SR | [`runs/20261026T204500Z/t40_fake_ai_headers.log`](../../_vps_stage/edge/uhd/runs/20261026T204500Z/t40_fake_ai_headers.log) | 6/6 PASS |
| Módulos vivos (copia) | [`live/`](../../_vps_stage/edge/uhd/live/) | `66a20017…` gateway · `f1f5eb67…` uhd · allowlist |
| Guard | [`uhd_doctrine_guard.mjs`](../../_vps_stage/edge/uhd/uhd_doctrine_guard.mjs) | 12 checks + selftest |
| Parche | [`proposed/E5-uhd-techo4k.patch.md`](../../_vps_stage/edge/uhd/proposed/E5-uhd-techo4k.patch.md) | NO aplicado |
