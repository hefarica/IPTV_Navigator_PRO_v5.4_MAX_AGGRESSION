# PLAN REA — plan único por fases, coste 0 y gates de no-regresión

> **v2 — corrige AU-01, AU-02, AU-03, AU-04, AU-05, AU-06, AU-07 y AU-08** de la auditoría `t25` (`docs/rea/AUDITORIA_PLAN_REA.md`, FAIL global).
> **Hash de la v1 (auditada):** `PLAN_REA.md` = `aa0a82b354c75415b7236f354fe4def0051c12f847cad094d8c1dfba3f8073d8` (177 L, 24.974 B).
> **Cambios de fondo:** AU-01 fija la **excepción de producto** del 8K (marcador obligatorio, nunca `-REAL`) y V-3 deja de contradecir F0-2; §1 lleva el recuento real; F0-8 enumera consumidores y orden de gates; F0-11 define clave de caché; F0-6 y F0-10 ganan gate previo; build/iGPU pasa a `[MEDIDO-AUTOR]`.
> **Lo que NO cambia:** `declare_auto` **se conserva** (orden del propietario 2026-10-24) y Fase 0 sigue siendo €0.

**Tarea:** `t26` · **Ciclo REA · corrección del plan** · **Autor:** `s5-qoe-qos` · **Fecha:** 2026-10-27
**Snapshot real:** `git HEAD a8ff0e9` (*el goal cita `e38a89b`; el árbol avanzó*).
**Fuentes:** `01_CODEC_HDR_DV.md` · `02_EDGE_DECLARE_AUTO_API.md` · `03_BUILD_SHADERS_SECURITY.md` · `04_FEASIBILITY_TRANSPORT.md` · `05_PLAYER_COMPAT.md`. **No se reescriben** (salvo `02`, que esta tarea corrige).
**Etiquetas:** `REAL` · `POSIBLE` · `IMPOSIBLE` · `FALSO` · `NOT_RUN` · **`GAP`** (ningún doc lo cubre) · **`[MEDIDO-AUTOR]`** = medido por el autor en un host que **no es el de auditoría** ⇒ **NO_VERIFICADO aquí, no vale como gate** (AU-07).
**Nada de este plan se ejecuta aquí:** cero cambios en código, listas o VPS. La extensión del guard (§6 G3b) se entrega como **especificación**, no como código: esta tarea prohíbe tocar código.

### Correcciones heredadas de t24 (C-1..C-4) — siguen vigentes
C-1 `real_ip`: **0** directivas `set_real_ip_from`/`real_ip_header` en `vps/nginx/**` (única aparición de "real_ip": `fastcgi_param HTTP_X_REAL_IP $remote_addr;` en `shield-location.conf:15`); la cita de `ape_gateway.lua:96-102` como bypass SSRF **era falsa** y no se repite. C-2 blind spot: `ape_obs.lua` **0** ocurrencias de `uhd4k/uhd8k` vs `ape_gateway.lua:480-481`. C-3 E5-F4: `ape_uhd.lua:97-98` + `ape_gateway.lua:279,281`. C-4 LEVER B: `CHINA_BOX_FAKE_4K=true` **solo** en `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/combined_body_filter.lua:335` (las otras 2 copias no lo llevan).
---

## 1. Tabla de verdad

**Recuento por filas (AU-02): 32 filas de datos = 13 REAL · 8 POSIBLE · 4 IMPOSIBLE · 7 FALSO.** La cifra «9 FALSO / 5 IMPOSIBLE» del cierre de t24 **era errónea** y no consta en este plan; queda sustituida por el recuento verificado fila a fila.

| Técnica / afirmación | Nivel | Evidencia (doc § + fuente) | Veredicto |
|---|---|---|---|
| `zscale` (libzimg): resize + colorspace + bit depth | **REAL** | 01 §1 · [ffmpeg-filters#zscale](https://ffmpeg.org/ffmpeg-filters.html#zscale) | Sirve; coste CPU; 4K por software no es tiempo real |
| `colorspace` (gamma+primarias, 8/10/12 bpc) | **REAL** | 01 §1 · [trac colorspace](https://trac.ffmpeg.org/wiki/colorspace) | Correcto; `fast=1` deriva color |
| `tonemap` FFmpeg (7 curvas) | **REAL** | 01 §1 · [ffmpeg-filters#tonemap](https://ffmpeg.org/ffmpeg-filters.html#tonemap) | HDR→SDR; **no** implementa BT.2390 |
| `libplacebo` (tone-map dinámico, gamut, scaling) | **POSIBLE** → REAL con GPU | 01 §1 · [libplacebo README](https://raw.githubusercontent.com/haasn/libplacebo/master/README.md) | Exige GPU; interfaz *dummy* no soporta shaders |
| `tonemap` FFmpeg == BT.2390 | **FALSO** | 01 §1, §8 | BT.2390 solo en `libplacebo` |
| `vo=gpu-next` de mpv | **POSIBLE** | 01 §1 (NOT_RUN: mpv no instalado) · [mpv manual](https://mpv.io/manual/master/#options-tone-mapping) | Solo players GPU del device |
| Anime4K | **REAL** (solo anime 1080p nativo) | 01 §2 · [Anime4K](https://raw.githubusercontent.com/bloc97/Anime4K/master/README.md) | Sobre deportes/720p: artefactos |
| SSimSuperRes / KrigBilateral | **REAL** (corrección, no resolución) | 01 §2 · [mpv User-Scripts](https://raw.githubusercontent.com/wiki/mpv-player/mpv/User-Scripts.md) | SSim corrige ringing; Krig mejora **croma** |
| RAVU / FSRCNNX | **REAL** (GPU) | 01 §2 · [mpv-prescalers](https://raw.githubusercontent.com/bjin/mpv-prescalers/master/README.md) | FSRCNNX puede alucinar textura/halos |
| "Un shader convierte 1080p en 4K real" | **FALSO** | 01 §2, §8 · [Anime4K](https://raw.githubusercontent.com/bloc97/Anime4K/master/README.md) | "lost information is lost" |
| Real-ESRGAN-ncnn-vulkan (imagen) | **REAL** | 01 §3 · [repo](https://raw.githubusercontent.com/xinntao/Real-ESRGAN-ncnn-vulkan/master/README.md) | CLI imagen/directorio; GPU Vulkan |
| Real-ESRGAN sobre **vídeo tiempo real** | **POSIBLE con pipeline propio** | 01 §3 (NV: sin vídeo/timestamps/fps) | Desync A/V; no es filtro de player |
| Real-ESRGAN en el VPS 2 GB | **IMPOSIBLE** | 01 §3, §6 · 03 §3 | Virtio sin `libva`; sin Vulkan útil |
| "IA que reconstruye el detalle real perdido" | **FALSO** | 01 §3 · [paper 2107.10833](https://arxiv.org/abs/2107.10833) | Reconstruye plausible, no verdadero |
| DV Profile 5 / 8.1 (stream de proveedor) | **REAL** | 01 §4 · [dovi_tool](https://raw.githubusercontent.com/quietvoid/dovi_tool/main/README.md) | P5 **sin** fallback HDR10; P8.1 sí |
| RPU real (P4/5/7/8) y HDR10+ (`hdr10plus_tool`) | **REAL** | 01 §4 · [hdr10plus_tool](https://raw.githubusercontent.com/quietvoid/hdr10plus_tool/main/README.md) | Procesa lo que existe; no crea master |
| "Inverse Dolby Vision desde SDR" | **FALSO** | 01 §4, §8 | No existe vía DV desde SDR |
| Declarar DV P5/P8.1 sin RPU | **FALSO** | 01 §4 · 05 §5.1 | Decoder no lo lee |
| Licencia Dolby para DV "de verdad" | **REAL** (requisito legal) | 01 §4 · [Dolby licensing](https://professional.dolby.com/licensing/) | Contrato + fee + testing |
| `VIDEO-RANGE=PQ` como hint de display | **POSIBLE** (hint, no píxeles) | 01 §5, §7 · 05 §4 | Activa modo HDR; sobre SDR = color shift |
| SDR→HDR por `hdr_conversion_mode` | **FALSO** | 01 §5 · 05 §4 · `CLAUDE.md:220-231` | `1`=PASSTHROUGH; contradicción viva en `ape_mesh.php:57-63` |
| Tone-map / upscale en el edge del VPS | **IMPOSIBLE** | 01 §5-§6 · 04 §2, §4 | 0,394× realtime ⇒ 0 canales |
| Manifest/playlist rewrite (LuaJIT) | **REAL** | 01 §6 | Es lo que hoy hace el borde |
| Upscale 720p→1080p / realce 1080p x264 | **POSIBLE** (no tiempo real) | 01 §6 · 04 §2.2 | 2,7 s y 3,3 s/segmento; cualquier pico = passthrough |
| `declare_auto` reescribe `RESOLUTION` 4K/8K | **REAL** | 02 §1.1-§1.2 · `_vps_stage/lua/ape_uhd.lua:92,97-98` · `ape_gateway.lua:275-283` | Conserva decisión de producto; **E5-F4** la hace mentir hoy |
| Endurecerlo con `can_declare_8k` + marcador | **POSIBLE** (diseño, no aplicado) | 02 §1.3 (v2) · parche `_vps_stage/edge/uhd/proposed/E5-uhd-techo4k.patch.md` | Aditivo, `pcall`-safe, reversible |
| Transcode 4K en el VPS actual | **IMPOSIBLE / NO-GO** | 04 §1 E1, §2, §4 | `floor(2,1/7,61)=0` |
| Nodo GPU dedicado (GEX45) | **POSIBLE / GO condicional** | 04 §1 E2, §2.4, §5.3 | Capacidad NVENC 4K = **NOT_RUN** |
| WebRTC para `latency_target 500 ms` | **POSIBLE** pero **NO-GO** para los 6 players | 04 §3 (E3) | TURN, estado por viewer, 2× BW |
| `latency_target 500 ms` con LL-HLS | **IMPOSIBLE** con el GOP actual | 04 §3 | Exigiría `PART-TARGET ≤166 ms`; «no prometer < 4 s» |
| AI-PQ / AI-SR del SoC (VPP del device) | **REAL** (única mejora de píxeles sin transcode) | 05 §4 · `CLAUDE.md:234-236,633-652` | Solo SoC allowlisted + daemon; sin device = **NO_VERIFICADO** |
| LEVER B (guard anti-fake-4K sobre AVC) **activo** | **FALSO** (está apagado) | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/combined_body_filter.lua:335` (guard `:337`); las otras 2 copias no llevan el flag | Un `false` restaura el guard |

---

## 2. Fase 0 — coste 0, **sin tocar producción**, `declare_auto` **intacto**

**AU-01 · EXCEPCIÓN DE PRODUCTO (ratificada).** La doctrina LOCKED «4K real → 8K declarado» **se conserva**: el umbral de fuente **queda en ≥3840** por decisión del propietario y se declara como **excepción explícita**, no como olvido. Lo que cambia es la **honestidad del marcador**, no el umbral:

```
can_declare_8k = (uhd8k == 1) AND (nivel HEVC >= L183 en TODAS las variantes top)
# el umbral de fuente >=3840 NO se toca (producto). Si 3840 <= fuente < 7680 y se declara 8K:
#   OBLIGATORIO en la variante: #EXT-X-APE-UPSCALE:...;src=<max_resolution>;declared=7680;can8k=1
#   PROHIBIDO presentarla como -REAL  (solo -PREFERRED / declarativa)
```

| # | Cambio concreto | Dónde | Efecto esperado | Cómo se mide | Cómo se revierte | Fuente |
|---|---|---|---|---|---|---|
| **F0-1** | **Cerrar el blind spot**: publicar `uhd4k/uhd8k/off`, `mode_last`, `can8k_last` en `/_ape/uhd` y extender `/_ape/health`. **Campos al final del JSON, nunca reordenar** (los parsean `deploy/verify.sh`, `ape-meta-watchdog.sh`, `expose-443.sh`, `baseline_edge.mjs`) | `_vps_stage/lua/ape_obs.lua` (**0** ocurrencias hoy); contadores en `ape_gateway.lua:480-481` | `declare_auto` auditable sin leer el módulo | `GET /_ape/uhd` con contadores ≠0 tras 1 zap; los 4 consumidores siguen OK | Revertir el bloque Lua | 02 §4.1, §4.4 |
| **F0-2** | **Endurecer `declare_auto`** con `can_declare_8k` (sin tocar ≥3840) + **marcador obligatorio** si fuente 4K declara 8K + degradación a 4K cuando falte el nivel | `_vps_stage/lua/ape_uhd.lua:92-107` (decisión `:97-98`); invocación `ape_gateway.lua:279,281` | **E5-F4** deja de declarar 8K con `L153`; el 8K sobre 4K pasa a **producto marcado**, no mentira; el camino 4K queda **idéntico** | guard **exit 0** (G3/G3b); capture post: 8K+L153 → `4k:1`; 4K+L183 → `8k:1` **con** `src=`/`declared=7680`/`can8k=1` | `restore_phase0.sh`; flags por `/_ape/flags` | 02 §1.3 (v2) · ratificación del capitán |
| **F0-3** | Extender `#EXT-X-APE-UPSCALE` con `src=<WxH real>`, `declared=`, `level=`, `can8k=` | `ape_uhd.lua:61-67` (1 tag, idempotente) | El guard prueba «declarado vs fuente» sin ejecutar Lua | `capture_uhd.mjs` muestra los 4 campos por canal | Revertir la emisión (1 línea) | 02 §2 T3 |
| **F0-4** | `VIDEO-RANGE` honesto: `PQ` solo en la variante tocada, **nunca duplicado, nunca con 8K** | `ape_uhd.declare` (`:48-50`) | Elimina el peor caso de color-shift | diff del cuerpo 4K vs pre (byte a byte) | `uhd_pq=0` | 02 §2 T4 |
| **F0-5** | `EXT-X-MAP`/`CODECS` truth: **nunca añadir** `EXT-X-MAP`; `hev1` en `STREAM-INF` ⇒ UHD off | `ape_uhd.lua:113-122` | Sin CMAF inventado ni cruce GOLDEN RULE | `grep -c EXT-X-MAP` sobre cuerpo servido = 0 | Revertir bloque | 02 §2 T5 |
| **F0-6** | **GATE PREVIO (AU-05):** `STABLE-VARIANT-ID` **no está en ningún parser** (`frontend/js/ape-v9/parsers/**` = **0** ocurrencias; código ejecutable = **11 ocurrencias / 3 archivos**: `m3u8-typed-arrays-ultimate.js` ×6 · `ape-fallback-resolver.js` ×3 · `_vps_stage/tests/quality_denomination_assert.js` ×2 — alcance: frontend sin vendor/node_modules + `vps` + `_vps_stage`, extensiones `.js/.html/.php/.lua`; son **emisores**, ningún parser lo consume) ⇒ **NO_VERIFICADO** en TiviMate/OTT/VLC. **No se fija**: se emite **opcional tras flag** (`stable_var_id=0` por defecto) y solo se activa tras probar en 2 players. Luego: `<host>_<hash-uri-sin-query>_<profile>` | `ape_rebase_lib` (junto a `rebase_attrs:95-108`) | Evita yoyo al recargar **sin** arriesgar parser estricto | 2 recargas ⇒ mismo ID; 0 rechazos en 2 players; flag OFF por defecto | Quitar la inyección / flag a 0 | 02 §2 T2 · 05 §1 |
| **F0-7** | Coherencia `BANDWIDTH`/`AVERAGE-BANDWIDTH`/`FRAME-RATE`: **marcar** `#EXT-X-APE-BW-COHERENT:0`, **no** reescribir `BANDWIDTH` | `ape_uhd` (función pura), desde `ape_gateway.lua:288` | Marca sin romper ABR (inflar `BANDWIDTH` hace que el ABR **salte** la variante) | tag presente; 0 cambios en `BANDWIDTH` | Revertir la función | 02 §2 T1 |
| **F0-8** | **API con auth mínima + migración (AU-03)** | `meta-plane.conf` locations `/_ape/*`; `ape_flags:get("api_token")` | Mutaciones cerradas sin cambiar la superficie de 443 | ver detalle abajo | Quitar el gate; `allow 127.0.0.1` permanece | 02 §4.2 (v2) |
| **F0-9** | Corregir la contradicción viva: `ape_mesh.php:57-63` afirma «`hdr_conversion_mode=1` convierte SDR→HDR» | `vps/prisma/lib/ape_mesh.php:57-63` | Alinea con la corrección 2026-06-17; **cero cambio de comportamiento** | `grep -c 'SDR->HDR'` = 0 | Revertir el comentario | 05 §4 · `CLAUDE.md:220-231` |
| **F0-10** | **Quitar default HEVC sin probe** + **gate de contenido de lista (AU-06)** | `frontend/js/ape-v9/ape-fallback-resolver.js:238` | Sin `codec` del probe ⇒ sin `CODECS=` HEVC ⇒ se elimina la clase FZ-01 | ver detalle abajo | Revertir la línea | 05 §2, §6 R3 |
| **F0-11** | *(opcional)* Microcaché **TTL ≤3 s** con **clave definida (AU-04)** | `lua_shared_dict ape_microcache` | +8,5 % acierto ≈ −60 ms **sin** mezclar clientes | ver detalle abajo | TTL=0 / quitar dict | 02 §2 T8 |

**F0-8 · detalle (AU-03).** Consumidores **medidos** (criterio explícito; la auditoría cita 15 y mi recuento da **12 llamadores + 4 handlers = 16**; la diferencia es de criterio —incluye/excluye handlers y scripts de parcheo— y se enumera el conjunto medido, no una cifra redonda):
- **Llamadores HTTP (12):** `_vps_stage/deploy/verify.sh` · `_vps_stage/watchdog/ape-meta-watchdog.sh` · `_vps_stage/scripts/smoke.sh` · `_vps_stage/scripts/expose-443.sh` · `_vps_stage/edge/baseline/baseline_edge.mjs` · `_vps_stage/edge/uhd/capture_uhd.mjs` · `_vps_stage/edge/E7_observability/scripts/{probe_remote.sh,rollback_E7.sh}` · `_vps_stage/edge/E7_observability/tools/e7_obs.mjs` · `_vps_stage/edge/tests/{e9_invariants.sh,e9_rollback.sh}` · `_vps_stage/lua/ape_gateway.lua` (`/_ape/_fetch`).
- **Handlers que sirven (4):** `ape_obs.lua` · `ape_lab_api.lua` · `ape_lab_bridge.lua` · `ape_luatest.lua` (+ `ape_obs_metrics*.lua` en el ciclo E7).
- **Orden de gates (no intercambiable):** **(1)** `allow 127.0.0.1; deny all` se queda como **defensa en profundidad**; **(2)** token `X-APE-Token` en **tiempo constante** exigido **solo para mutación** (`/_ape/flags` con `v`); **(3)** si `api_token` está **vacío**, **toda mutación ⇒ 403 aunque venga de loopback** (fail-closed); **(4)** `/_ape/*` **no** se proxea desde 443; **(5)** `real_ip` solo si algún día hay acceso remoto.
- **Regla de publicación:** sin la migración de los 12 llamadores (token en archivo `0600` / cabecera en el script) **no se publica**: un 403 rompería el plano de laboratorio.

**F0-10 · gate de contenido (AU-06).** Además de la paridad del VPS (G6), sobre la **lista generada**: (a) canales **sin** `codec` del probe: **0** con `CODECS=hvc1*`; (b) diff contra la última lista publicada para probar que solo cambian esos canales; (c) `node -c` ×3 exit 0. **Límite honesto:** las listas ya publicadas/cacheadas por clientes **no se pueden retirar**; el gate mide lo nuevo, no lo servido.

**F0-11 · clave de caché (AU-04).** `clave = host_normalizado | path_normalizado | args_ordenados | cred=<sha256_16>`:
1. host en minúsculas, sin puerto por defecto; path sin `//` ni `..`; args ordenados alfabéticamente.
2. **Token/credenciales nunca en claro**: si aparecen en path (patrón Xtream `u/p/id`), query (`token=`, `sig=`) o cabecera (`X-APE-Token`, `Authorization`), se sustituyen por `cred=<sha256_16>` — **hash de segregación, no el valor**: no se sirve el manifiesto de un cliente a otro y no se filtra el secreto en la clave.
3. Si la URI **debería** llevar credencial y no se puede aislar ⇒ **bypass** (no cachear).
4. Nunca cachear no-200 (25,6 % del tráfico son 502). TTL ≤3 s (V-8).

**Descartado por medición:** colapsar el hop 443→8088 (**≈0,1 ms**) y HTTP/2 como palanca de TTFB (lo domina el fetch al proveedor, p50 **690-750 ms**) — 02 §2.

---

## 3. Fase 1 — nodo REA real (opcional, **con coste**, gate de aprobación)

**Gate de entrada:** no se compra, no se instala y no se despliega **nada** sin aprobación explícita del propietario (04 §6; 02 §5 paso 5). Hoy `rea="0"` ⇒ coste y riesgo 0 (02 §3).

| Aspecto | Valor | Estado | Fuente |
|---|---|---|---|
| Hardware mínimo | Hetzner **GEX45**: i5-13500, 64 GB, 2×512 GB NVMe, 1 Gbit/s | Lista 2026-10, no cotización | 04 §1 E2, §5.3 · [GEX45](https://www.hetzner.com/dedicated-rootserver/gex45/) |
| Coste | **€214,00/mes** + **€209,00** setup = **€423,00** el 1er mes, IVA exento | Referencia | 04 §5.2-§5.3 |
| Coste por slot 4K | ≈ **€4,76/viewer-4K·mes** (`214/45`) | Derivado de la NIC | 04 §5.2 |
| ¿Basta una iGPU? | **No**: `libplacebo 1080p→2160p ewa_lanczos` = **21,9 fps** (2,28 s/50 frames) ⇒ 4K realtime exige GPU dedicada | **[MEDIDO-AUTOR] NO_VERIFICADO** (AU-07): sin binario en este host ⇒ **no vale como gate** | 03 §6 TEST 7 |
| Build FFmpeg (flags, sha256, GPLv3) | **8.0.1** con `--enable-libplacebo --enable-vulkan --enable-libshaderc --enable-libx265` | **[MEDIDO-AUTOR] NO_VERIFICADO** (AU-07); receta sandbox `NOT_RUN` | 03 §1.1-§1.2 |
| Acoplamiento de versiones | FFmpeg 8.0.1 ↔ **libplacebo v7.357.0 (API v357)** | [MEDIDO-AUTOR]; el mínimo lo impone `configure` (**NOT_RUN**) | 03 §1.4 |
| Licencias | FFmpeg **GPLv3**; libplacebo LGPLv2.1+; x265 GPLv2/comercial (**no cubre patentes HEVC**); Anime4K **MIT**; Real-ESRGAN **BSD-3** | Verificado por el autor | 03 §1.1, §1.4, §2.2, §5 |
| Shaders: carga | `custom_shader_path` (formato `.hook` de mpv, leído del binario); `upscaler` default `spline36` | [MEDIDO-AUTOR] | 03 §2.1 |
| Shaders: **bloqueo de distribución** | **FSRCNNX / SSimSuperRes / KrigBilateral = licencia NO VERIFICADA** ⇒ no distribuibles | **Bloqueante** | 03 §2.2, §8 |
| Capacidad | 2-4 canales por dGPU (blueprint T4/L4/A10) · **1 stream UHD** mínimo · NVENC 4K = **NOT_RUN** · techo **NIC 45 viewers 4K** (`1000/22`) | Estimación / NOT_RUN | 02 §3 · 03 §6 · 04 §2.4, §5.1 |
| Latencia | Transcode añade **≥1 GOP**; LL-HLS realista **3-5 s**; +**3-5 s** G2G ⇒ opt-in por canal | Derivada, no medida | 04 §1 E2, §3 · 02 §3 |
| Entrega | HLS fMP4 con **fallback 302 a la URL directa** si `encode_speed < 1,2×`; `-c:a copy`; watchdog por canal | Diseño | 02 §3 |
| Coste CDN del fan-out | **NOT_RUN** | No se inventa | 04 §7 |

---

## 4. Fase 2 — player / VPP: qué se delega al device y qué no

| Lever | Dónde vive | Qué hace **de verdad** | Veredicto | Fuente |
|---|---|---|---|---|
| **AI-PQ / AI-SR del SoC** (MediaTek: `pq_ai_sr_enable`/`ai_sr_level`/`ai_pq_mode`/`pq_sharpness_enable`/`pq_*_dnr`/`pq_hdr_*`) | Device (ARA + `settings`) | Post-procesa el frame **decodificado**: SR, denoise, sharpen, HDR-PQ | **Delegado** — único lever de píxeles sin transcode; solo SoC allowlisted + daemon vivo | 05 §4 · `CLAUDE.md:234-236,633-652` |
| `hdr_conversion_mode` | Device (ajuste Android) | **Passthrough entre tipos HDR**; SDR queda SDR | **No** se delega: no mejora SDR | 05 §4 · `CLAUDE.md:220-231` |
| `declare_auto` / `VIDEO-RANGE` | VPS Lua (edge) | **Etiqueta**; no toca píxeles | **Etiqueta**, no mejora. Se conserva por decisión de producto | 05 §4 · 02 §1 |
| Tone-map / upscale en el nodo | Nodo GPU (Fase 1) | Real, pero cambia el bitstream ⇒ opt-in | Solo si el propietario compra el nodo | 01 §5 · 04 §1 |
| Perfiles por player | Emisor de listas | Hoy `emitTivimateSafe` = `emitStandardHls` + etiqueta | **GAP de cableado** | 05 §6 R1 |
| Capability probe antes de declarar | Player/runtime | `MediaCapabilities.decodingInfo` / `Display.getHdrCapabilities` | **Delegable**; hoy no existe | 05 §6 R4 |
| Matriz real de dispositivos | Device | **44 celdas NO_VERIFICADO** de 64 | **No delegable a la doctrina** | 05 §1, §7 |

---

## 5. Veto explícito

| # | Vetado | Por qué | Fuente |
|---|---|---|---|
| V-1 | **DV/HDR falso**: `dvh1`/`dvhe` sin RPU; HDR10+ sin SEI ST 2094-40; `SUPPLEMENTAL-CODECS` inventado; "inverse DV desde SDR" | Decoder no lo lee o degrada en silencio | 01 §4, §8 · 05 §5 |
| V-2 | **Transcode/upscale en el VPS de 2 GB** | `0,394×` realtime, 0 canales, sin GPU | 04 §4 · 01 §6 · 03 §6 |
| **V-3** | **Presentar un upscale como `-REAL`.** *Excepción registrada (AU-01):* declarar **8K sobre fuente 4K** es **doctrina de producto LOCKED** y **se permite**, pero la variante **debe** llevar `#EXT-X-APE-UPSCALE:…;src=<real>;declared=7680;can8k=1` y **nunca** `-REAL`. **Sin marcador ⇒ vetado** (es mentira); **con marcador y `L183` ⇒ permitido y trazable** | Distingue «producto declarado» de «mentira» | 05 §5.4 · ratificación del capitán |
| V-4 | **Quitar `declare_auto`** | Orden del propietario 2026-10-24: se conserva y se endurece | 02 §1.1 |
| V-5 | **Proxear `/_ape/*` desde 443** | Amplía la superficie de mutación sin auth de frontera | 02 §4.2 (v2) |
| V-6 | Cambios que rompan **`/cdn/`** o **las listas** | `/cdn/` es la ruta viva; las listas son el SSOT | 02 §1.5, §3 · 04 §6.1 |
| V-7 | Inflar `BANDWIDTH` para "cuadrar" con `RESOLUTION` | El ABR **salta** la variante ⇒ rebuffer | 02 §2 T1 |
| V-8 | Microcaché con **TTL > 3 s** | A 15/30/60 s la tasa útil se satura (~20 %) y el token muerto sube a 56-60 % ⇒ **+144…159 ms** | 02 §2 T8 |
| V-9 | WebRTC como **default** | NO-GO para los 6 players del repo (HLS) | 04 §3 E3 |
| V-10 | `EXT-X-MAP`/CMAF inventado sin `init.mp4`+`.m4s` reales | Rompe el init del player | 02 §1.5 · 05 §5.8 |

---

## 6. Gates de no-regresión y rollback

| Gate | Criterio medible | Umbral | Fuente |
|---|---|---|---|
| **G1 · Backup (AU-08)** | `_vps_stage/edge/baseline/phase0_backup.sh` (5.086 B) + `phase0_verify.sh` (2.174 B); logs `_vps_stage/edge/baseline/runs/<ts>/phase0_{backup,verify}.log`; hashes de los 5 módulos + `nginx -T` | 100 % reproducible | 02 §1.4 C1 · ruta medida |
| **G2 · Rollback probado** | `_vps_stage/edge/baseline/restore_phase0.sh` (3.402 B) — **dry-run**, log `runs/<ts>/restore_dryrun.log` = `DRYRUN: nada escrito` · `RESULT=OK` | **exit 0 antes** del cambio real | 02 §1.4 C2 |
| **G3 · Guard de doctrina** | `node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs` (UHD-01..UHD-09) | **exit 0** (hoy exit 1 por E5-F4/UHD-09) | 02 §1.4 C4 |
| **G3b · Guard extendido (AU-01, *especificación*)** | **UHD-09** (existe): 8K con nivel <`L183` ⇒ **blocker**. **Nuevo UHD-10**: 8K con fuente `<7680` y **sin** marcador ⇒ **blocker**; **con** marcador (`src=`,`declared=7680`,`can8k=1`) **y** `L183` ⇒ **info** (excepción de producto). **Selftest nuevo:** «4K L183 → 8K con marcador» = **info**; «4K L183 → 8K sin marcador» = **blocker** | exit 0 con 0 blockers; selftest 10/10 | 02 §1.4 (v2) · **no se edita el `.mjs` en esta tarea** |
| **G4 · Selftest del guard** | `--selftest` | **8/8 hoy** → **10/10** al añadir los 2 casos | 02 §1.4 C5 |
| **G5 · Self-test del plano** | `GET /_ape/luatest` (**actualizar `ape_luatest.lua:155-156` en el mismo despliegue**) | **68/68, fail 0** | 02 §1.4 C6 |
| **G6 · Paridad + marcador** | `capture_uhd.mjs --label pre/post` sobre las 4 parejas | camino **4K byte a byte idéntico**; 8K+L153 → `4k:1`; **4K+L183 → `8k:1` con `src=`/`declared=7680`/`can8k=1`** y sin `-REAL` | 02 §1.4 · G3b |
| **G7 · `/cdn/` vivo** | `GET /cdn/<host>/<ruta>.m3u8` → **200**; `.ts/.m4s/.mp4` → **404** | exacto | 04 §4, §5.2 · 02 §1.5 |
| **G8 · Listas intactas (AU-08)** | **Antes de tocar nada**, capturar `sha256` de las listas servidas en `_vps_stage/edge/baseline/runs/<ts>/lists_baseline.txt` y comparar después | **sin cambio**. Ese baseline **no existe hoy** (GAP de la v1): se crea en G1 | 02 §3 · 04 §6.1 |
| **G9 · Health** | `GET /_ape/health` → `ok:true`, `shared_dicts:true`, `upstreams_down:0`; los 4 consumidores del JSON siguen parseando | exacto | 02 §4.1, §4.4 |
| **G10 · TTFB** | `p50` pre vs post; Δ del handler **31-51 ms**; hop 443→8088 ≈**0,1 ms** | post ≤ pre + incremental medido; si el incremental es `NOT_RUN` ⇒ **medir antes** | 02 §2, §4.5 |
| **G11 · Red intacta** | `bbr`+`fq`, `tcp_fastopen=3`, `tcp_slow_start_after_idle=0`, `rto_min lock 40ms` | sin cambio | 04 §6.2, §6.6 |
| **G12 · Paridad 9/9** | **GAP** — «9/9» **no aparece en 01..05**; no se inventa. Se sustituye por **G3+G3b+G4+G5** | — | GAP declarado |

**Rollback en una línea:** `restore_phase0.sh` (byte-exacto) → flags a default por `/_ape/flags?k=<f>` (sin `v` = borrar) → `rea="0"` → `nginx -t` **antes** de reload. **Orden:** backup → baseline de listas → medir pre → aplicar → guard+selftest+luatest → medir post → si un gate falla, rollback inmediato y se declara el fallo (no se "ajusta" el umbral).

---

## 7. Backlog priorizado (12 tareas; ninguna ejecutada)

*Cada B-xx referencia su `F0-xx`, cuyo `doc §` está en §2 (trazabilidad indirecta declarada, AU-05).*

| # | Tarea | Dueño propuesto | Criterio de aceptación |
|---|---|---|---|
| B-01 | **F0-1** observabilidad `/_ape/uhd` + `health` (campos al final) | S6 | contadores ≠0; los 4 consumidores del JSON siguen OK; luatest 68/68 |
| B-02 | **F0-2** `can_declare_8k` + marcador obligatorio (E5-F4 / AU-01) | S6 + S3+S4 | guard **exit 0** con **UHD-10**; capture post: 4K+L183 → `8k:1` **con marcador** y sin `-REAL`; camino 4K byte-idéntico |
| B-03 | **F0-8** token de mutación + migración de los 12 llamadores + orden de gates (AU-03) | S7+S10 | 403 en mutación sin token; lecturas loopback OK; `/_ape/*` ausente del 443; 12/12 llamadores migrados |
| B-04 | **F0-10** quitar default HEVC + **gate de contenido de lista** (AU-06) | S3+S4 | sin probe ⇒ sin `CODECS=` HEVC; **0** canales sin probe con `hvc1*` en la lista generada; diff solo en esos canales; `node -c` ×3 |
| B-05 | **F0-3/F0-4** marca `APE-UPSCALE` (`src`/`declared`/`level`/`can8k`) + `VIDEO-RANGE` honesto | S6 + S3+S4 | 1 `VIDEO-RANGE` por variante; nunca con 8K; los 4 campos presentes |
| B-06 | **F0-6** `STABLE-VARIANT-ID` **con gate previo** (AU-05) | S6 + S9 | flag OFF por defecto; 2 recargas ⇒ mismo ID; 0 rechazos en 2 players antes de activarlo |
| B-07 | **F0-7** marca `BW-COHERENT:0` | S6 | tag presente; `BANDWIDTH` del proveedor sin tocar |
| B-08 | **F0-9** corregir contradicción `ape_mesh.php:57-63` | S3+S4 | `grep 'SDR->HDR'` = 0; sin cambio de comportamiento |
| B-09 | **F0-11** microcaché TTL ≤3 s con clave `cred=<sha256_16>` (AU-04) | S6 + S5 | TTFB −≈60 ms; **0** cruces de manifiesto entre credenciales distintas (test con 2 tokens) |
| B-10 | **F2** emisión por player + capability probe | S9 | ≥2 salidas distintas por target; 0 declaraciones sin probe |
| B-11 | **F1** evaluación del nodo GPU (**solo con aprobación**): benchmark NVENC 4K + licencias de shaders | Propietario + S7 | N streams 4K medidos **o** `NOT_RUN`; 3 licencias verificadas o bloqueo mantenido |
| B-12 | **F2** matriz real 6 devices × 8 capacidades con `dumpsys` | S9 + owner del device | 48 celdas con captura; las no medidas siguen `NO_VERIFICADO` |

**Orden:** B-01 → B-02 (guard y observabilidad juntos) → B-03 → B-04 → B-05/B-06/B-07 → B-08 → B-09 → B-10/B-12 → B-11 (solo con compra aprobada).

---

**Trazabilidad:** cada fila de §1-§6 cita `doc §`; los hechos verificados en esta corrección llevan `archivo:línea` (E5-F4 `ape_uhd.lua:97-98`; contadores `ape_gateway.lua:480-481`; LEVER B `vps/nginx/lua/combined_body_filter.lua:335`; baseline `_vps_stage/edge/baseline/*`; consumidores `/_ape/*` enumerados en F0-8). **GAP**: G8-baseline (se crea en G1) y G12 «9/9». **NOT_RUN**: NVENC 4K, coste CDN, build en sandbox, mpv, Real-ESRGAN vídeo, matriz de devices. **[MEDIDO-AUTOR] NO_VERIFICADO**: build FFmpeg e iGPU 21,9 fps (AU-07) — **no se usan como gate**. **Cero benchmarks o costes inventados.**
