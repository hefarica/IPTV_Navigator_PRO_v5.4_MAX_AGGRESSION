# 02 · EDGE — `declare_auto` se queda, técnicas nuevas y API JSON de control
**Ciclo:** REA · **Entregable:** 02 · **Tipo:** DISEÑO (no se escribe código, no se despliega, no se toca el VPS)
**Snapshot:** `git HEAD a8ff0e9` (`a8ff0e946524f945f89858c9c6c620aeb5f31813`) · **Fecha:** 2026-10-27
**Regla de oro del propietario (2026-10-24):** `declare_auto` **NO se quita**. Aquí se diseña cómo conservarlo y endurecerlo.
**Base medida:** [`E5_UHD_DOCTRINE.md`](../edge/E5_UHD_DOCTRINE.md) (ventana 2026-10-26 20:33→20:45 UTC), [`BASELINE.md`](../edge/BASELINE.md), [`VPS_UPSCALE_4K_DESIGN.md`](../VPS_UPSCALE_4K_DESIGN.md). Todo dato es **cita de algo ya medido**; lo no medido se marca `NOT_RUN`. Cero escrituras en `_vps_stage/**`, VPS o código.
---
## 1 · `declare_auto`: SE QUEDA

### 1.1 Qué es «se queda», en tres invariantes que este diseño no puede romper

| # | Invariante | Por qué es intocable | Evidencia |
|---|---|---|---|
| I-1 | `declare_auto` **sigue siendo la ruta viva por defecto** (`uhd_auto=1`) y sigue **reescribiendo `RESOLUTION`** a 4K/8K sobre la variante top | Decisión del propietario 2026-10-24, ya implementada y desplegada | `_vps_stage/lua/ape_uhd.lua:85-107`; `_vps_stage/lua/ape_gateway.lua:279-282` |
| I-2 | **`CODECS` no se toca. Ni una coma.** Resolución = declarativa; codec = verdad | Tocar `CODECS` es FZ-01 = freeze 2026-06-08 (decoder HEVC sobre bytes AVC) | `ape_uhd.lua:9-18`; E5 §4.2 (CODECS intacto en 4/4 parejas) |
| I-3 | La marca `#EXT-X-APE-UPSCALE` se sigue emitiendo, **una sola vez**, idempotente | Es la trazabilidad que permite auditar «qué se declaró» sin leer el bitstream | `ape_uhd.lua:20-22,61-67` |

**Endurecer ≠ quitar.** Nada de este diseño cambia el comportamiento del **camino 4K** (`top < 3840` → `3840x2160`); sólo corrige el camino que hoy viola la ley y añade observabilidad.

### 1.2 Estado real hoy (lo que se hereda)

Cascada viva en `ape_gateway.lua:272-288`, en este orden exacto (el orden importa):
`is_master()` → `codec_truth_fields()>0` ⇒ **UHD omitido** (`X-APE-UHD: off`) → `uhd8k` → `uhd_auto` → `uhd4k`
(⇒ `uhd4k` es **inerte** mientras `uhd_auto=1`; y `uhd8k` **gana** sobre `uhd_auto`).

| Flag | Default vivo | Efecto medido | Riesgo heredado |
|---|---|---|---|
| `uhd_auto` | **`"1"`** | `top<3840`→`3840x2160`; **`top≥3840`→`7680x4320`** | **E5-F4 BLOCKER**: declara 8K con `hvc1.2.4.L153.B0` (L153 = techo 4K@60) ⇒ Ley Cardinal 1 rota (E5 §4.3) |
| `uhd4k` | `"1"` | 4K en la top, cualquier fuente | Inerte con `uhd_auto=1` |
| `uhd8k` | `"0"` | 8K **sin mirar la fuente** (8K sobre 1080p AVC, medido) | **E5-F5 HIGH** (E5 §4.4) |
| `uhd_pq` | `"0"` | añade `,VIDEO-RANGE=PQ` **una vez**, sólo a la variante tocada | Color-shift en players sin daemon (aceptado, no freeze) |
| `virtual4k` | `"0"` | **NINGUNO — flag muerto** (default + contador, nadie lo lee) | Se documenta como inerte, no como activo (D-32) |

Defaults literales: `_vps_stage/nginx/meta-plane.conf:118-123`. El gateway sólo lee 5 flags (`hint, uhd_auto, uhd_pq, uhd4k, uhd8k`).

### 1.3 El endurecimiento propuesto (aditivo, `pcall`-safe, reversible)

Un solo cambio de semántica, en `ape_uhd.declare_auto`:

```
hoy:   top>=3840  -> 8K        SIEMPRE
prop.: top>=3840 AND can_declare_8k(body)  -> 8K
       en cualquier otro caso              -> 4K   (degradación honesta, no silencio)
can_declare_8k = (uhd8k == 1) AND (nivel HEVC >= L183 en todas las variantes top)
# EXCEPCIÓN DE PRODUCTO (AU-01, ratificada por el capitán): el umbral de fuente NO se sube a 7680.
#   Si 3840 <= fuente < 7680 y se declara 8K  =>  OBLIGATORIO en la variante:
#     #EXT-X-APE-UPSCALE:...;src=<max_resolution>;declared=7680;can8k=1
#   y PROHIBIDO presentarla como -REAL (solo -PREFERRED / declarativa).
```

1. **Techo 4K por defecto.** Con `L153` intocable, el 8K deja de ser automático. `declare_auto` **sigue declarando** (4K), que es lo que el propietario pidió: no desaparece, se acota a lo decodificable.
2. **8K sólo con dos llaves + la marca:** `uhd8k=1` **y** nivel `≥L183`. La fuente `≥3840` se mantiene **por decisión de producto** (no se sube a 7680). Si la fuente es 4K (3840-7679) y se declara 8K, el **marcador con `src=`, `declared=7680`, `can8k=1` es obligatorio** y la variante **nunca** se presenta como `-REAL`: el 8K sobre 4K queda como **producto declarado y trazable**, no como mentira.
3. **`max_resolution()` sustituye a «primer `STREAM-INF`»** para las guardas (E5-F7: en master ascendente 720p→4K se declaraban **dos** variantes 4K, `E5 §4.6`). El `declare` sigue actuando sobre la top; la **decisión** pasa a mirar el máximo real.
4. **`can_declare_8k` y el marcador se publican** (`X-APE-UHD: 8k:1|4k:N|off` + `#EXT-X-APE-UPSCALE:…;src=…;declared=…;can8k=0|1`) para que el guard lo verifique sin cargar el módulo.

Ficha ya redactada y **no aplicada**: [`_vps_stage/edge/uhd/proposed/E5-uhd-techo4k.patch.md`](../../_vps_stage/edge/uhd/proposed/E5-uhd-techo4k.patch.md) · simulación: [`runs/20261026T204500Z/patch_sim.log`](../../_vps_stage/edge/uhd/runs/20261026T204500Z/patch_sim.log). **Matriz de 6 casos** (caso → RESOLUTION declarada → ¿marcador? → ¿`-REAL`?): [`ERRATA_AU.md §1b`](ERRATA_AU.md) — no cabe aquí por el límite de 220 líneas; incluye **4K L183 → 8K (producto, MARCADO)**. La fila homóloga de `docs/edge/E5_UHD_DOCTRINE.md §4.8` = **PENDIENTE_BRIDGE** (fuera de alcance); el guard se especifica en C7.

### 1.4 No-regresión: cómo se garantiza (los 7 cerrojos)

| # | Cerrojo | Cómo se ejecuta | Criterio de paso |
|---|---|---|---|
| C1 | **Backup byte-exacto pre-cambio** | `_vps_stage/edge/baseline/phase0_backup.sh` + `phase0_verify.sh`; snapshot vivo ya existente en `baseline/live-snapshot/20261026T201548Z/` | hashes de los 5 módulos + `nginx -T` reproducidos |
| C2 | **Rollback probado en seco** | `restore_phase0.sh` (dry-run documentado en `baseline/runs/…/restore_dryrun.log`) | dry-run exit 0 **antes** del cambio real |
| C3 | **Medición ANTES** | `node _vps_stage/edge/uhd/capture_uhd.mjs --label pre` → `cases/<ts>.json` (4 parejas fuente→servido + matriz del módulo) | `X-APE-UHD` y `RESOLUTION` por canal registrados |
| C4 | **Gate de doctrina** | `node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs` (12 checks) | **exit 0**; hoy es exit 1 por E5-F4 — el objetivo del cambio es llevarlo a 0 sin tocar `CODECS` |
| C5 | **Selftest del propio guard** | `uhd_doctrine_guard.mjs --selftest` | **8/8** (caza `CODECS` mutado, `hev1`, 8K sobre 1080p, PQ duplicado, MAP inventado, cuerpo binario) |
| C6 | **Self-test del plano** | `GET /_ape/luatest` (loopback) | **68/68 pass, fail 0** — *y hay que actualizar `ape_luatest.lua:155-156` en el mismo despliegue* (E5 §4.8) |
| C7 | **Marcador de excepción de producto (AU-01)** | `capture_uhd.mjs` + `uhd_doctrine_guard.mjs` (extensión **especificada, no aplicada**): **UHD-10** ⇒ 8K con fuente `<7680` y **sin** marcador = **blocker**; **con** marcador (`src=`,`declared=7680`,`can8k=1`) **y** `L183` = **info**; **UHD-09** (existe) 8K con nivel `<L183` = **blocker**. Selftest nuevo: «4K L183 → 8K con marcador» = info · «sin marcador» = blocker | exit 0 con 0 blockers; selftest **10/10** |

**Medición DESPUÉS** = repetir C3 con `--label post` y comparar la matriz; más `X-APE-UHD` por canal. **Criterio de no-regresión:** el camino 4K debe producir **exactamente** el mismo cuerpo que hoy (diff byte a byte sobre las 4 parejas), y el camino 8K debe pasar de `8k:1` a `4k:1` en las fuentes que no cumplen las tres llaves.

### 1.5 Lo que este diseño prohíbe explícitamente

`CODECS` (I-2) · `#EXT-X-MAP` inventado sin `EXT-X-MAP` real (E5 UHD-06) · `SUPPLEMENTAL-CODECS` (no lo emite ninguna capa edge: `grep` → 0) · declarar 8K con nivel `<L183` · **8K sobre fuente `<7680` sin marcador** · **presentar como `-REAL` cualquier upscale** (la excepción de producto AU-01 exige marcador + `-PREFERRED`) · apagar `declare_auto` · tocar `proxy_cache_valid 302=0` o la regla `.ts→404` «para probar».

---

## 2 · Técnicas ADICIONALES en la capa edge (sin píxeles)

Regla de la tabla: **coste** = lo ya medido para el handler completo (Δ TTFB−`X-APE-Upstream-Ms` ≈ **31-51 ms**, `BASELINE.md:215`) o `NOT_RUN` si el incremental no se midió. Ninguna técnica añade I/O de red: todas son pasadas de regex sobre un cuerpo ≤ **4 MiB** (`ape_rebase_lib.lua:22-24`; por encima → `502 playlist_too_large`).
| # | Técnica | Dónde se implementa | Coste | Riesgo | Fuente |
|---|---|---|---|---|---|
| T1 | **Coherencia `BANDWIDTH`/`AVERAGE-BANDWIDTH`/`FRAME-RATE`** — si `RESOLUTION` declarada exige un suelo de banda (4K ⇒ ≥28 Mbps) y el `BANDWIDTH` del proveedor está por debajo, **no se sube el número**: se marca `#EXT-X-APE-BW-COHERENT:0` y se registra. Un `BANDWIDTH` inflado hace que el ABR del player **salte** la variante y caiga a la más baja | `ape_uhd` (función pura nueva, tras `declare`), invocada desde `ape_gateway.lua:288` | 1 match por `STREAM-INF`; incremental `NOT_RUN` (cuerpos medidos 635-646 B) | **Bajo** si es sólo marca. **Alto** si se reescribe `BANDWIDTH`: se altera la decisión de ABR | `CLAUDE.md` §Bitrate Fallback; RFC 8216 §4.3.4.2 (semántica de `BANDWIDTH`/`AVERAGE-BANDWIDTH`) |
| T2 | **`STABLE-VARIANT-ID`** — inyectar el atributo cuando el master no lo trae, con `"<host>_<hash-de-uri-sin-query>_<profile>"`, **estable entre recargas**. Necesario porque `declare_auto` reescribe `RESOLUTION` y un player que indexe por resolución puede hacer *yoyo* al recargar | `ape_rebase_lib` (junto a `rebase_attrs`, `:95-108`) | 1 `find` por `STREAM-INF`; incremental `NOT_RUN` | **Bajo**: atributo de vendor; RFC 8216 §4.3.4.2 obliga a **ignorar** atributos desconocidos. No altera decodificación | `CLAUDE.md` §HDCP-Adaptive Engine (`STABLE-VARIANT-ID="<chId>_<profile>"` ya se emite en el generador); RFC 8216 §4.3.4.2 |
| T3 | **`#EXT-X-APE-UPSCALE` endurecido** — añadir `src=<WxH real>` y `level=<L…>` al tag existente, para que el guard pruebe «declarado vs fuente» sin ejecutar Lua | `ape_uhd.lua:61-67` (misma emisión, 1 tag, idempotente) | 1 `gsub` sobre el cuerpo; ya dentro del handler | **Nulo en players** (tag desconocido, RFC 8216 §6.3.1); **nulo** en decode | `ape_uhd.lua:20-22,61-67`; RFC 8216 §6.3.1 |
| T4 | **`VIDEO-RANGE` honesto** — `PQ` sólo en la variante tocada, **nunca duplicado**, **nunca con 8K**, y **siempre** acompañado de la marca `APE-UPSCALE` que dice que la resolución es declarativa | `ape_uhd.declare` (`:48-50`, ya idempotente) | 1 `find` | Color-shift en players **sin** daemon (documentado, **no** es freeze). Con 8K descartado, desaparece el peor caso | `CLAUDE.md` §VIDEO-RANGE=PQ (decisión LOCKED + corrección 2026-06-17); E5 §5 |
| T5 | **`EXT-X-MAP` / `CODECS` truth** — extender `codec_truth_fields` a un gate completo: (a) `hev1` en `STREAM-INF` ⇒ UHD off (ya existe); (b) **nunca** añadir `EXT-X-MAP`; (c) si el master trae `EXT-X-MAP:` con URI, rebasarla como atributo (ya ocurre) | `ape_uhd.lua:113-122` + `ape_rebase_lib.rebase_attrs:95-108` | 1 pasada; `NOT_RUN` incremental | **Nulo** si sólo se prohíbe añadir. Añadir un `MAP` falso rompería reproducción (CMAF inventado) | E5 UHD-01/02/06; `CLAUDE.md` §Reglas Honestas (CMAF sólo con `EXT-X-MAP` real) |
| T6 | **Hints de ABR** — (a) mantener `inject_presentation_hint` (`FRAME-RATE` capado a 60, `HONEST=1`); (b) el «fusible» de suelo (`min_bandwidth`/`adaptive-minbitrate`) **sólo puede relajar**, jamás subir | `ape_rebase_lib.lua:159-166`; `ape_gateway.lua:352-377` (fuse) | ya dentro del handler (Δ 31-51 ms medido) | **Alto si se sube un suelo**: rebuffer garantizado. El invariante `fuse_bps ≤ design_bps` (`gateway:435-436`) es intocable | `ape_gateway.lua:303-314,435-436`; `ape_rebase_lib.lua:157-166` |
| T7 | **Dedupe de puerto — YA DESPLEGADO, sólo gate de regresión** — `host:80:80 → host:80 → host`; eliminó 33 fallos `host:80:80` en 5 h | `ape_rebase_lib.lua:45-93` (`dedup_port`/`normalize_origin`/`to_cdn_path`), **idéntico** repo↔vivo | O(1) regex | Ninguno nuevo: ya en producción. El riesgo es **revertirlo** | `ape_rebase_lib.lua:37-93`; E5 §1 (hash vivo = repo) |
| T8 | *(opcional, condicionada)* **Microcaché de manifiesto 1-3 s** | `lua_shared_dict ape_microcache` + guard de token | Beneficio medido: +8,5 % de acierto ≈ **−60 ms** de media | **TTL >3 s es PEOR**: a 15/30/60 s la tasa útil se satura (~20 %) y el token muerto sube a **56-60 %** ⇒ **+144…+159 ms**. Nunca cachear no-200 (25,6 % del tráfico son 502) | `docs/edge/E4_CACHE_302.md:34-39,68-70`; `_vps_stage/edge/e6/proposals/manifest_microcache_1s.md:30-37` |

**Descartadas por medida, no por opinión:** colapsar el doble hop 443→8088 (**≈0,1 ms**, `BASELINE.md:232-234`) y HTTP/2 como palanca de TTFB (`BASELINE.md:28`) — ninguna lo mueve: el TTFB está dominado por el fetch al proveedor (p50 **690-750 ms**, `BASELINE.md:187-201`).

---

## 3 · Dónde iría un REA real (transcode/upscale en hardware aparte)

**Principio:** el nodo REA es un **tercer origen**, no un paso del camino. Las listas **no se tocan** y `/cdn/` sigue siendo metadata-only.

```
hoy:    player ──> 443 (lista estática) ──> URL directa del proveedor      ← el vídeo NO pasa por el VPS
        player ──> /cdn/<host>/<ruta>.m3u8 ──> ape_gateway (texto) ──> 302 ──> CDN
REA:    player ──> /rea/<token>/<canal>.m3u8 ──> nodo GPU (WireGuard) ──> HLS fMP4
                 └─ si el nodo no está sano ──> 302 a la URL directa  ← degradación, nunca freeze
```

| Decisión de diseño | Regla | Por qué |
|---|---|---|
| **No se emite ni se reescribe ninguna lista** | El generador sigue igual; `/rea/` es una **location nueva** en el plano 8088/443, y el manifiesto REA lo publica el nodo, no el edge | Cambiar la lista es cambiar el SSOT del propietario; el edge sólo enruta |
| **`/cdn/` intacto** | `/rea/` **no** reutiliza `ape_gateway`; si compartiera resolver/allowlist heredaría los defectos E5-F1/F2/F3 | `/cdn/` sombrea `.ts→404` (E5-F1) y corrompe cuerpos no-manifiesto (E5-F2): no es base para vídeo |
| **Fallback obligatorio** | Si `GET /rea/health` ≠ ok o `encode_speed < 1,2×`, el edge responde **302 a la URL directa** que ya conoce | Degradación de calidad, jamás pérdida de canal (Regla Madre `COVERAGE ALWAYS`) |
| **Publicación condicionada** | Sólo se anuncia un canal REA si `encode_speed ≥ 1,5×` realtime **medido** con reserva | `VPS_UPSCALE_4K_DESIGN.md:149` |
| **Audio intocable** | `-c:a copy` siempre | `VPS_UPSCALE_4K_DESIGN.md:152` (time-stretch rompe A/V sync) |
| **Techo 4K@60, 8K descartado** | 8K multiplica ×4 píxeles y ×2-4 bitrate; ningún decoder de consumo lo acepta | `VPS_UPSCALE_4K_DESIGN.md:116-123` |
| **Un canal = un proceso + watchdog** | El watchdog mata el proceso si el buffer de salida se atrasa | `VPS_UPSCALE_4K_DESIGN.md:154` |
| **Hardware: NO en el CPX21 actual** | 3 vCPU: `libx265 ultrafast` ≈ 0,3-0,4× ⇒ **0 canales concurrentes**. Nodo GPU aparte (T4/L4/A10, 2-4 canales) | `VPS_UPSCALE_4K_DESIGN.md:100-106` |
| **Latencia declarada** | +3-5 s glass-to-glass inevitable (≥1 GOP de buffer) ⇒ `/rea/` es **opt-in por canal**, no default | `VPS_UPSCALE_4K_DESIGN.md:112-114` |
| **Seguridad primero** | `/rea/` nace detrás de la **auth mínima de §4.2** (API en **8088 loopback**, token en cabecera, **403 si el token está vacío**). **No** depende de ningún «fix E5-F3»: esa cita era falsa (`ape_gateway.lua:96-102` son `host_allowed()`/`is_private_host()`) | §4.2 · `PLAN` C-1 / F0-8 |

**Estado:** el nodo **no existe**. Interruptor `rea="0"` en `ape_flags` ⇒ coste y riesgo **0** mientras no se encienda. Blueprint de systemd/ffmpeg/watchdog ya redactado en `VPS_UPSCALE_4K_DESIGN.md:134-154` (no aplicado).

---

## 4 · API JSON de control (coste 0: sin proceso nuevo, sin puerto nuevo)

Base ya existente y **reutilizable**: `/_ape/flags`, `/_ape/health`, `/_ape/qoe`, `/_ape/lab`, `/_ape/luatest`
(`_vps_stage/nginx/meta-plane.conf:97-222`), todas `content_by_lua_*` sobre `lua_shared_dict`
(`circuit_metrics, lab_config, ape_flags, ape_qoe, ape_hosts`, `meta-plane.conf:38-46`). **No se crea daemon.**

### 4.1 Endpoints

| Método | Ruta | Semántica | Estado |
|---|---|---|---|
| `GET` | `/_ape/config` | Config **efectiva** = defaults ∪ dict (lo que de verdad se aplica, no lo que dice el fichero) | **nuevo** |
| `GET` | `/_ape/flags?k=<f>&v=<0\|1>` | Set / listar. `?k=<f>` sin `v` ⇒ **borrar** ⇒ vuelve al default | **existe** (`meta-plane.conf:106-131`) |
| `GET` | `/_ape/uhd` | Decisión UHD: contadores `uhd4k`/`uhd8k`, último `mode`, `can8k` por fuente, `declare_auto` activo | **nuevo** (hoy hay **punto ciego**: `ape_obs.lua:21-24` no publica `uhd4k`/`uhd8k` aunque el gateway los incrementa en `:480-481`) |
| `GET` | `/_ape/health` | Liveness + `shared_dicts` + `upstreams_down` + `error_ratio` | **existe** (`ape_obs.lua:56-79`) — extender con `uhd` y `rea` |
| `GET` | `/_ape/qoe` | Contadores del plano (`req, bytes, failovers, all_failed, rebase_ok, llhls_sc, hint_injected, last_*`) | **existe** (`ape_obs.lua:21-54`) |
| `GET` | `/_ape/rea` | Salud del nodo REA (proxy al nodo) | **stub** hasta que exista el nodo (§3) |

**Sólo `GET`.** Sin `POST/PUT/DELETE`: no hay CSRF que defender, y un cambio de flag es idempotente y auditable en el access log. (Aprendido en E10: el mutador es GET con `?k/v`.)

### 4.2 Auth — y la advertencia que hay que leer antes

Hoy: `allow 127.0.0.1; deny all` (`meta-plane.conf:98,107,206,212,219`). **Eso no es autenticación.** Lo medido y vigente: **0** directivas `set_real_ip_from`/`real_ip_header` en `vps/nginx/**`, la API vive en **8088 loopback** y el **443 no proxea `/_ape/*`** ⇒ no hay superficie pública que cerrar antes de aplicar el token. *(Corrección AU-09: la versión anterior afirmaba aquí un bypass SSRF en `ape_gateway.lua:96-102`; es falso — esas líneas son `host_allowed()`/`is_private_host()`.)*

Orden de implementación **no negociable**:

1. **Sin prerrequisito de `real_ip`.** La API se queda en **8088 loopback** y `/_ape/*` **no** se proxea desde 443 ⇒ no hay nada que arreglar «antes» (la dependencia «fix E5-F3» se retira: era una cita falsa, ver `PLAN` C-1).
2. Token en cabecera `X-APE-Token` (o `Authorization: Bearer`), en **tiempo constante** contra `ape_flags:get("api_token")`, **solo para mutación** (`?k=&v=`) — **nunca en la URL** (se loguea) ni impreso. Si `api_token` está vacío ⇒ **toda mutación se rechaza con `403`, incluso por loopback** (fail-closed).
3. `allow 127.0.0.1` **se queda** como defensa en profundidad (no como frontera). *Hardening propio y opcional, **no** es «E5-F3»:* `set_real_ip_from 127.0.0.1;` solo tendría sentido si algún día la API se publica detrás de un proxy de confianza; hoy no se publica y no se necesita.

### 4.3 Esquema de configuración (boceto, diseño — no implementación)

```json
{
  "schema": "ape.edge.config/v1",
  "plane": "meta/v3",
  "ts": 1793047020,
  "flags": {
    "rebase": "1", "wake": "1", "sentinel": "1", "hint": "0", "auth": "0",
    "uhd_auto": "1", "uhd4k": "1", "uhd8k": "0", "uhd_pq": "0",
    "rea": "0"
  },
  "uhd": {
    "declare_auto": true,
    "ceiling": "3840x2160",
    "can8k_policy": "uhd8k=1 AND max_resolution>=3840 AND level>=L183",
    "levels": { "L153": 3840, "L183": 7680 },
    "markers": ["#EXT-X-APE-UPSCALE", "#EXT-X-APE-BW-COHERENT", "#EXT-X-APE-PRESENTATION-TARGET"]
  },
  "rea": { "enabled": false, "node": null, "health_ttl_s": 15, "fallback": "302-to-direct" },
  "limits": { "max_body_bytes": 4194304, "max_hops": 3, "microcache_ttl_max_s": 3 },
  "defaults_source": "conf.d/50-ape-meta-plane.conf:118-123"
}
```

### 4.4 Health / estado UHD (boceto)

```json
{
  "ok": true, "plane": "meta/v3", "ts": 1793047020,
  "checks": {
    "nginx": true, "shared_dicts": true, "upstreams_down": 0,
    "requests": 202, "error_ratio": 0.3465, "last_latency_ms": 752, "last_host": "185.227.34.195"
  },
  "uhd": {
    "declare_auto": true, "mode_last": "4k", "can8k_last": false,
    "counters": { "uhd4k": 137, "uhd8k": 0, "off": 65 },
    "doctrine": { "guard_exit": 0, "checks": 12, "blockers": 0 }
  },
  "rea": { "enabled": false, "node": null, "last_check": null }
}
```

### 4.5 Coste y límites de esta API

| Aspecto | Valor | Fuente |
|---|---|---|
| Procesos/puertos nuevos · coste en el camino de datos | **0** · **0 ms** — `location` distintas de `/cdn/`, nunca se ejecutan en una petición de manifiesto | `meta-plane.conf:182-184` vs `:205-222` |
| Lectura de estado | O(1) `ngx.shared.*:get`; `get_keys` **acotado** (`max 200/500`) bajo `pcall` | `ape_obs.lua:26-31` |
| Coste del hop público 443→8088 | **≈0,1 ms** medido ⇒ publicar la API no cuesta latencia | `BASELINE.md:232-234` |
| Riesgo principal | **auth**: «loopback» **no** es frontera de confianza por sí sola ⇒ token obligatorio en mutación + **403 fail-closed** si el token falta | §4.2 · `PLAN` F0-8 |

---

## 5 · Orden de ejecución propuesto (y qué necesita ventana)

| Paso | Qué | ¿Ventana? | Gate |
|---|---|---|---|
| 0 | **Ninguno**: no hay prerrequisito de `real_ip` ni «fix E5-F3» (la API no se publica en 443). La antigua dependencia era una cita falsa — ver `PLAN` C-1 | No | — |
| 1 | Endurecer `declare_auto` (§1.3) + marcas T3/T4/T5 + `ape_luatest` **en el mismo cambio** | Sí | C1-C6 de §1.4; guard **exit 0** |
| 2 | T1/T2 (coherencia BW + `STABLE-VARIANT-ID`) tras medir el incremental | Sí | `NOT_RUN` → medir antes |
| 3 | `/_ape/config`, `/_ape/uhd`, extensión de `/_ape/health` (§4) | Sí | 0 ms en camino de datos; sin regresión de `/_ape/luatest` |
| 4 | T8 microcaché (sólo si el paso 2 sale limpio) | Sí | TTL ≤3 s y guard de token **obligatorios** (E4) |
| 5 | Nodo REA (§3) | **No existe hardware** | blueprint listo; OFF por flag |

**Nada de esto está aplicado.** `_vps_stage/**` está en lock ajeno y el VPS sólo se toca con incidente medido, autorización explícita y plan de rollback (`iptv-vps-touch-nothing`; D-25/D-32).

*Diseño del ciclo REA (entregable 02). Cero escrituras fuera de `docs/rea/`. Toda cifra proviene de una medición previa con `archivo:línea`; lo no medido se declara `NOT_RUN`.*

