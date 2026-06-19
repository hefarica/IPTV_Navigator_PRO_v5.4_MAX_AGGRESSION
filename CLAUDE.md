# IPTV Navigator PRO v5.4 MAX AGGRESSION — CLAUDE.md

## ⚡ PROMPT MAESTRO — LECTURA OBLIGATORIA ANTES DE CUALQUIER ACCIÓN

**ANTES de tocar una sola línea de código en este repositorio**, Claude DEBE leer
[`docs/PROMPT_MAESTRO_INGENIERIA_EXTREMA.md`](docs/PROMPT_MAESTRO_INGENIERIA_EXTREMA.md).

Ese documento define la identidad operativa del agente (Team Agent Supremo de 13
ingenieros élite), las cascadas HEVC, la paridad Disney+ LL-HLS, las métricas
Conviva QoE, los archivos sagrados, y la regla de validación post-edición
obligatoria (`node -c` × 3). No es opcional, no es referencia decorativa,
no es "leer si tengo tiempo". Es la fuente primaria de cómo se trabaja este repo.

Si una nueva sesión empieza sin haber cargado el Prompt Maestro, el agente
debe pausar y leerlo antes de responder a cualquier instrucción del usuario.

---

## ⚡ MANIFIESTO APE VPS HEVC-UHD CRYSTAL INTEGRATOR — DOCTRINA OBLIGATORIA

**Junto al Prompt Maestro**, este repositorio tiene un segundo manifiesto de lectura obligatoria: la skill
**`ape-vps-hevc-crystal-integrator`** (médula espinal, instalada e invocable; copia versionada en
[`docs/manifestos/ape-vps-hevc-crystal-integrator/`](docs/manifestos/ape-vps-hevc-crystal-integrator/)).
Está **inyectada en `/iptv-freezeless-visual-master-council` PHASE 0** y la leen los 13 PhD como doctrina
antes de juzgar. Fue **revisada por el council** (veredicto **WARN · 0 BLOCK · preserva el flujo**; 7
investigaciones web + 13 PhD; ver su `COUNCIL_REVIEW.md`) y respaldada con normas primarias en su
`references/web_authority.md`.

**Los 6 truth-guards (no negociables):**

| Área | Verdad técnica | Mentira prohibida |
|---|---|---|
| M3U8 installer | `#EXT-X-APE-INSTALLER` es metadata/puntero (RFC 8216 §6.3.1 ignora tags desconocidos) | "la playlist instala/ejecuta código en el player" |
| Wake-on-playback | El playback dispara wake por observación GET del manifest o beacon, encolado no-bloqueante | "el tag HLS despierta/ejecuta en el device" |
| ADB | Requiere host con ADB instalado, habilitado y **autorizado** (RSA por host) | "ADB se habilita remoto desde la playlist/VPS" |
| Rol visual VPS | El VPS selecciona variantes/metadata/perfiles/QoE | "el VPS mejora píxeles en un player remoto sin engine real" |
| Player⇄daemon | El daemon corre en el device/host autorizado; el player manda beacons | "el player aloja un daemon desde metadata HLS" |
| HEVC-first (GOLDEN RULE) | `hvc1.*` solo en STREAM-INF `CODECS=`; `hev1.*` solo en KODIPROP/EXTVLCOPT | cruzarlos, o declarar un codec/nivel que el decoder no soporta |

**Ley Cardinal 1 — Nivel↔Resolución:** `L153`=4K@60 (techo); declararlo en 8K@120 = el **freeze 2026-06-08**.
Nunca un nivel por debajo de la resolución. **Sin fake HDR/CMAF/SUPPLEMENTAL-CODECS · 9 headers tóxicos
EXTHTTP prohibidos · SHIELDED verbatim + NO-STRIP de los ~945 headers funcionales · autopista
(log-phase no-bloqueante).** Mejoras de código bienvenidas SOLO si preservan el flujo
LAB→JSON→lista→VPS→ADB→player. Detalle: la skill `truth_guards.md` + `references/web_authority.md`.

> **Caveat obligatorio:** los anchors de playlist son metadata; la instalación y el wake reales requieren
> ruta VPS desplegada + host/dispositivo ADB autorizado o runtime compatible.

---

## DOCTRINA CARDINAL: MAX IMAGE FIRST

```
La prioridad absoluta NO es ser conservador.
La prioridad absoluta es EXTRAER LA MÁXIMA CALIDAD DE IMAGEN POSIBLE
en cada canal, usando HEVC/H.265/Main10/HDR/alta resolución/alto bitrate
siempre que exista evidencia o probabilidad razonable,
sin romper reproducción y sin perder canales.
```

### Regla Madre

```
MAX IMAGE FIRST.
COVERAGE ALWAYS.
NO CHANNEL LOSS.
NO PLAYER-BREAKING LIES.
```

Esto significa:

1. Si hay evidencia real de calidad superior → **usarla**.
2. Si hay evidencia parcial → **empujar la mejor variante visual razonable**.
3. Si el probe falla pero el canal es premium/deporte/evento/4K/FHD → usar **HEVC Main10 como PREFERENCIA agresiva**.
4. Si el canal no soporta esa calidad → **caer a fallback seguro, nunca eliminar**.
5. El objetivo NO es "ser santo". El objetivo es que el player tenga la **mayor probabilidad de reproducir en máxima calidad visual sin freeze**.

---

## Arquitectura del Generador

```
Canal original
   ↓
ApeQualityProber (probe empírico del manifest HLS real)
   ↓
APEFallbackResolver (decide tier F0-F5 con prioridad de imagen)
   ↓
m3u8-typed-arrays-ultimate.js (emite la lista M3U8 final)
   ↓
Lista final (.m3u8)
```

### Punto de integración

```
btnGenerateAudited
→ APEGenerationController.prepublishAndGenerate()
→ ape-quality-prober.js     (evidencia)
→ ape-fallback-resolver.js  (decisión)
→ m3u8-typed-arrays-ultimate.js (emisión)
→ lista final
```

**No** poner lógica en el onclick del botón HTML. Todo vive en el pipeline JS.

---

## 6 Tiers de Fallback (F0 → F5)

| Tier | Nombre | Cuándo | Codec | Verified |
|------|--------|--------|-------|----------|
| F0 | REAL_VERIFIED_MAX | Probe confirma todo (confidence ≥85, 0 contradicciones) | Real del probe | ✅ |
| F1 | REAL_PARTIAL_MAX | Probe trae datos parciales (confidence ≥60, ≤1 contradicción) | Real parcial | ✅/partial |
| F2 | HEVC_PREMIUM_HINT | Probe falla pero canal es premium/4K/evento/deportes | hvc1.2.4.L153.B0 PREFERRED | ❌ |
| F3 | HEVC_SAFE_1080P | Canal FHD/HD probable sin info clara | hvc1.2.4.L120.B0 PREFERRED | ❌ |
| F4 | AVC_HIGH_SAFE | Sin evidencia HEVC ni premium | avc1.640028 | ❌ |
| F5 | ORIGINAL_DIRECT_SAFE | Última línea de defensa — solo EXTINF + URL | ninguno | N/A |

### Regla de prioridad visual

```
F0 > F1 > F2 > F3 > F4 > F5
Nunca bajar a F4/F5 si el canal tiene señales premium.
En duda razonable, preferir F2 o F3, no F5.
```

---

## Codec Ladder (orden de prioridad visual)

```
1. Dolby Vision HEVC real    (dvh1 / dvhe)           score=100
2. HEVC Main12 real          (hvc1.4.* / hev1.4.*)   score=96
3. HEVC Main10 real          (hvc1.2.* / hev1.2.*)   score=94
4. AV1 10-bit real           (av01.*.10.*)            score=90
5. HEVC Main 8-bit real      (hvc1.1.* / hev1.1.*)   score=82
6. AV1 8-bit real            (av01)                   score=80
7. HEVC Main10 premium hint  (hvc1.2.4.L153.B0)      score=70  ← F2
8. AVC High fallback         (avc1.640028)            score=55  ← F4
```

### Correcciones técnicas inmutables

```
L153 = Level 5.1 (NO es 12-bit, NO es Main12)
Main10 = Profile .2 (hvc1.2.*)
Main12 = Profile .4 (hvc1.4.*)
Main   = Profile .1 (hvc1.1.*)
```

---

## Bitrate Fallback por Resolución

| Resolución | BANDWIDTH | AVERAGE-BANDWIDTH |
|------------|-----------|-------------------|
| 7680x4320 (8K) | 80,000,000 | 60,000,000 |
| 3840x2160 (4K) | 28,000,000 | 22,000,000 |
| 2560x1440 (QHD) | 16,000,000 | 12,000,000 |
| 1920x1080 @60fps | 12,000,000 | 9,000,000 |
| 1920x1080 @30fps | 9,000,000 | 6,500,000 |
| 1280x720 | 5,500,000 | 4,000,000 |
| 854x480 | 2,500,000 | 1,800,000 |

Regla: **bitrate real > fallback agresivo > no emitir STREAM-INF**.

---

## Reglas Honestas (NO PLAYER-BREAKING LIES)

### NUNCA emitir sin evidencia

| Campo | Solo emitir si... |
|-------|-------------------|
| `VIDEO-RANGE=PQ` | **SUPERSEDED 2026-06-16 — ahora INCONDICIONAL** (SDR→HDR enhancement display-driven). Ver "VIDEO-RANGE=PQ Incondicional" abajo. |
| `SUPPLEMENTAL-CODECS` | Probe encontró `SUPPLEMENTAL-CODECS` real con `dvh1`/`dvhe` |
| `HDCP-LEVEL` | Probe encontró `HDCP-LEVEL` real (NUNCA hardcodear `TYPE-1`) |
| `ape-container=fmp4-cmaf` + verified=true | Probe encontró `#EXT-X-MAP` + `.m4s`/`init.mp4` |

### SIEMPRE marcar preferred vs verified

```
codecVerified=true   → #EXT-X-APE-CODEC-REAL:hvc1.2.4.L153.B0
codecVerified=false  → #EXT-X-APE-CODEC-PREFERRED:hvc1.2.4.L153.B0
```

### PROHIBIDO (hardcoded eliminado)

```
HDCP-LEVEL="TYPE-1" hardcoded universal      ← ELIMINADO (rompe HDMI HDCP 1.4 sin recovery)
SUPPLEMENTAL-CODECS="lcev.1.1.1"             ← ELIMINADO (LCEVC inventado, no real)
VIDEO-RANGE sin probe                         ← SUPERSEDED 2026-06-16 (ahora INCONDICIONAL, ver abajo)
```

### VIDEO-RANGE=PQ Incondicional — SDR→HDR Enhancement Doctrine (2026-06-16, decisión del propietario)

**Decisión LOCKED del propietario (no re-debatir):** `VIDEO-RANGE=PQ` se emite **INCONDICIONALMENTE** en cada
`#EXT-X-STREAM-INF`, incluso sobre fuentes SDR. **Reemplaza** la regla previa "solo si probado". Razón: el
ecosistema aplica **SDR→HDR como enhancement de display on-device** (`hdr_conversion_mode=1`, también
incondicional vía el daemon aplicador-puro + `ape_mesh_device_settings`). La declaración `PQ` describe la
**salida HDR que el display produce tras el enhancement**, no una mentira sobre el bitstream fuente.
Doctrina madre: **MAX IMAGE FIRST** — mejor empujar HDR y dejar que el display/daemon lo materialice que
servir SDR plano.

> **⚠️ CORRECCIÓN TÉCNICA (2026-06-17, verificada en vivo en Fire TV mt8696):** el `hdr_conversion_mode`
> de Android **NO hace SDR→HDR** — es conversión entre **TIPOS HDR** (HDR10↔HDR10+↔DV). Valores: `0`=UNKNOWN,
> `1`=PASSTHROUGH (deja pasar el HDR real; SDR queda SDR), `2`=SYSTEM (este device lo rechaza→revierte a 1),
> `3`=FORCE. Medido: con contenido SDR la salida queda `dataspace=UNKNOWN/ColorMode::NATIVE` con `1`, `2` **o**
> `3`. Por tanto `hdr_conversion_mode` **NO "mejora" SDR**. La decisión LOCKED de `VIDEO-RANGE=PQ` incondicional
> **se mantiene** (es del propietario), pero su justificación correcta es: `hdr_conversion_mode=1` = **passthrough
> del HDR REAL** (cuando el proveedor sirve HEVC/HDR, llega en HDR pleno), no un fake SDR→HDR.
>
> **El lever REAL de "imagen superior" sobre SDR = el pipeline AI-PQ por HARDWARE del SoC** (no `hdr_conversion`):
> AI super-resolution + denoise + sharpness + HDR-PQ, expuesto por `settings` (MediaTek: `pq_ai_sr_enable`/
> `ai_sr_level`/`ai_pq_mode`/`pq_sharpness_enable`/`pq_*_dnr`/`pq_hdr_*`). El **ARA** los escribe (allowlisted,
> gateado por SoC) + **enforcer persiste**; el **VPS** los controla por **URL-2** (`vps/prisma/cli/push_pq_profile.php`,
> perfiles `max_image/sports/cinema/off`). Post-procesado REAL sobre el frame decodificado (cualquier player,
> AVC SDR incluido), sin transcode. Ver memoria `ara-aipq-hardware-pipeline`. **Honesto:** el HARDWARE del device
> post-procesa, el VPS COMANDA; el bitstream sigue siendo el que es (`decoded avc` en logs) pero el VPP lo mejora
> al mostrarlo.

**Lo que NO cambia (siguen prohibidos / enforced):**
- `SUPPLEMENTAL-CODECS` inventado (LCEVC/DV falsos) — sigue PROHIBIDO.
- Declarar un **codec/nivel que el decoder no soporta** (GOLDEN RULE `hvc1`/`hev1` + Ley Cardinal 1
  Nivel↔Resolución) — el bitstream se entrega tal cual; `VIDEO-RANGE=PQ` es hint de rango/display, NO
  cambia `CODECS=` ni declara un decode imposible. **FREEZELESS intacto.**
- CMAF/`fmp4` falso sin `EXT-X-MAP` real — sigue PROHIBIDO.

**Caveat honesto (documentado, no bloqueante):** en players SIN el daemon, `VIDEO-RANGE=PQ` sobre SDR puede
dar color shift (no freeze). El propietario lo aceptó explícitamente bajo MAX IMAGE FIRST; el modelo es que
el daemon pone el display en HDR y la declaración casa. Acompañar de `hvc1.2.*` (Main10, 10-bit) cuando el
codec lo permita para coherencia del pipeline PQ.

### Refinamiento LEVER B (2026-06-18, owner override) — virtual_4k guard anti-fake-4K-sobre-AVC (VPS Lua)

El propietario refinó la doctrina PQ-incondicional **en la capa del VPS Lua** (`combined_body_filter.lua`):
el rewrite `virtual_4k` (que declara `RESOLUTION=3840x2160 + hvc1.2.4.L153.B0 + VIDEO-RANGE=PQ` sobre la
variante top) ahora está **GUARDADO**:
- **P0/P1 (premium)** → agresivo SIEMPRE (fuerza 4K+PQ; MAX IMAGE intacto).
- **P2/P3/P4/P5** → SOLO si la variante top **NO es AVC/H264** (HEVC/AV1/sin-codec → permitido). Si el
  proveedor sirve AVC en esos tiers, NO se declara `hvc1`+4K+PQ sobre bytes AVC → elimina el riesgo **FZ-01**
  (spinner/pantallazo en players que decodifican el codec declarado sin el daemon ADB).

**Qué NO cambia:** el GENERADOR sigue emitiendo `VIDEO-RANGE=PQ` en el STREAM-INF de la lista (URL-1)
incondicionalmente (decisión 2026-06-16); el refinamiento es SOLO el rewrite del VPS Lua. Aditivo,
`pcall`-safe, reversible. Deployed + `nginx -t` + reload OK (backup `leverB_20260618T205656Z`).
Decisión del propietario vía `/iptv-freezeless-visual-master-council --mode generate` (LEVER B).

### HDCP-Adaptive Engine (2026-05-19) — reemplaza la prohibición universal

`HDCP-LEVEL=TYPE-1` ahora se emite **por defecto agresivo** en cada `EXT-X-STREAM-INF`,
con override per-canal a `NONE` automático cuando Conviva detecta `VST > 3000ms`
en un intento `TYPE-1`. Pipeline:

```
Generator → consulta window.APE_HDCP_PROFILE[channel_id] (pre-fetched bulk)
  └→ emite HDCP-LEVEL=<cache[chId] || 'TYPE-1'> + STABLE-VARIANT-ID="<chId>_<profile>"
                                                         ↓
Player intenta reproducir + Conviva engine mide VST
  ├→ VST ≤ 3000ms                → no acción (compromiso "no frenar")
  └→ VST > 3000ms && HDCP=TYPE-1  → POST fire-and-forget /prisma/api/channel-hdcp-incident.php
                                                         ↓
VPS SQLite (channel_hdcp_profile) → INSERT/UPDATE hdcp_level='NONE' WHERE channel_id=?
                                                         ↓
Próximo zap → bulk fetch refleja NONE → manifest emite HDCP-LEVEL=NONE para ese canal
```

**Doctrina de no-interferencia:**

- Lua/PHP NUNCA interviene mid-stream — solo recopila telemetría post-zap
- POST incident es `fetch keepalive` async — si el VPS está down, frontend no se entera
- Si el bulk fetch falla → cache vacío → todos los canales emiten `TYPE-1` default (agresivo)
- `STABLE-VARIANT-ID="<chId>_<profile>"` evita ABR yoyo entre recargas de manifest

Componentes:

- `vps/prisma/lib/conviva_persistence.php` (tabla `channel_hdcp_profile` + 4 métodos)
- `vps/prisma/api/channel-hdcp-incident.php` (POST endpoint)
- `vps/prisma/api/channel-hdcp-bulk.php` (GET endpoint)
- `frontend/js/conviva-qoe-engine.js` (hook en `reportFirstFrame`)
- `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (bulk fetch + emit)
- `frontend/js/ape-v9/ape-fallback-resolver.js` (`emitStreamInfFromTruth` HDCP-aware)

### QoE Server-Side Observer (2026-05-19) — Conviva-equivalent para players nativos

Los players nativos (TiviMate, OTT Navigator, VLC, Kodi, IPTV Smarters,
ExoPlayer-based) **no ejecutan JS** y por tanto no cargan `conviva-qoe-engine.js`.
Para no dejarlos invisibles a la telemetría, un observer Lua en nginx reconstruye
las métricas equivalentes desde patrones de acceso y las wirea al mismo
HDCP-Adaptive Engine.

```
Native player → GET .m3u8 + GET .ts/.m4s
                       ↓
nginx log_by_lua → qoe_server_side_observer.lua
                       ↓
Computes: VST_proxy / rebuffer_proxy / bitrate_proxy / error_rate
                       ↓
Writes: ngx.shared.qoe_metrics (sub-µs ops)
                       ↓
init_worker_by_lua timer (60s) → qoe_flush_worker.lua → POST 127.0.0.1/qoe-flush.php
                       ↓
qoe-flush.php → ConvivaPersistence::recordServerSideQoE() (SQLite table)
              + ConvivaPersistence::recordHdcpIncident() (reuse single decision tree)
```

**Métricas derivables server-side**: VST_proxy (manifest→primer-segmento),
rebuffer (gap entre segmentos > 15s), bitrate (bytes/s), error rate.
**No derivables**: frame drops, decoder errors (player-side).

**Coverage matrix completo**:

| Player | Telemetría path |
|---|---|
| Navigator UI (browser) | conviva-qoe-engine.js JS |
| TiviMate / OTT / VLC / Kodi / Smarters / ExoPlayer | nginx Lua observer + EXTVLCOPT/KODIPROP config |

Componentes:

- `vps/nginx/lua/qoe_server_side_observer.lua` (log_by_lua, autopista-safe)
- `vps/nginx/lua/qoe_flush_worker.lua` (init_worker, 60s timer, localhost POST)
- `vps/nginx/snippets/prisma-qoe-observer.conf` (activation snippet + deploy checklist)
- `vps/prisma/api/qoe-flush.php` (POST endpoint, localhost-only)
- `vps/prisma/lib/conviva_persistence.php` (tabla `server_side_qoe_metrics` + 2 métodos)

---

## Premium Channel Detection

Canales que disparan F2 (HEVC PREMIUM HINT) cuando el probe falla:

```
4K, UHD, FHD, HEVC, H265, H.265, HDR, Dolby, Premium,
DAZN, ESPN, Sports, Event, Evento, Movie, Cine, PPV,
Liga, Champions, NBA, F1, UFC, HBO, Max, Netflix,
Disney, Fox, Sky, BeIN
```

Si el nombre o grupo del canal contiene cualquiera de estos patterns → F2 agresivo con `hvc1.2.4.L153.B0` como PREFERRED.

---

## Headers HTTP — Reglas Inmutables

### Headers seguros (mantener siempre)

```
User-Agent, Accept, Accept-Encoding: identity, Accept-Language,
Connection, Cache-Control: no-cache, Pragma: no-cache
```

### Headers PROHIBIDOS (causan EOF/304/403)

```
Range: bytes=0-
If-None-Match: *
If-Modified-Since
TE: trailers
Priority: u=0, i
Upgrade-Insecure-Requests: 1
```

Estos 6 headers fueron empíricamente confirmados como causa de `java.io.IOException: unexpected end of stream on com.android.okhttp.Address` en reproductores Android (OTT Navigator, TiviMate, ExoPlayer).

---

## SHIELDED Architecture (INMUTABLE)

```
SHIELDED = SOLO renombrar el archivo a _SHIELDED.m3u8
Las URLs internas de canales son DIRECTAS al proveedor.
NUNCA se transforman. NUNCA se envuelven con /shield/.
El shielding real lo hace el WireGuard tunnel + DNS hijack.
```

Ver reglas completas en `.gemini/settings/shielded.md`.

---

## VPS NET SHIELD AUTOPISTA (INMUTABLE)

El VPS (178.156.147.234) funciona como proxy transparente de máximo rendimiento. Regla cardinal: **NUNCA frenar, bloquear, limitar ni interferir con la reproducción**.

- `upstream_gate.lua` = PASSTHROUGH (nunca `ngx.exit(503)`)
- `limit_conn xtream_slot` >= 2
- `proxy_read_timeout` >= 60s
- `tcp_congestion_control` = bbr
- `proxy_cache_valid 302 301` = 0

Ver SOP completo en `.agent/workflows/net-shield-autopista-sop.md`.

---

## Single URL Per Channel (Anti-509)

En catálogos M3U8 de canales:

```
Cada bloque #EXTINF → EXACTAMENTE 1 URL al final
#EXT-X-MEDIA → puede existir como METADATA pero NUNCA con URI=
#EXT-X-I-FRAME-STREAM-INF → puede existir como METADATA pero NUNCA con URI=
#EXT-X-STREAM-INF → MÁXIMO 1 por canal
```

Múltiples URLs por canal = HTTP 509 Bandwidth Limit Exceeded del proveedor.

---

## Archivos Clave del Generador

| Archivo | Rol |
|---------|-----|
| `frontend/js/ape-v9/ape-fallback-resolver.js` | Resolver F0-F5, scoring, confidence, truth object |
| `frontend/js/ape-v9/ape-quality-prober.js` | Live Quality Probe (manifest fetch + parse) |
| `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | Generador principal (~10K líneas) |
| `frontend/js/gateway-manager.js` | Upload + SHIELDED filename rename |
| `frontend/index-v4.html` | UI principal + script loading order |

### Orden de carga obligatorio

```html
<script src="js/ape-v9/ape-fallback-resolver.js"></script>
<script src="js/ape-v9/ape-quality-prober.js"></script>
<script src="js/ape-v9/m3u8-typed-arrays-ultimate.js"></script>
```

---

## Verificación Post-Edición

Después de CUALQUIER cambio al generador:

```bash
node -c frontend/js/ape-v9/ape-fallback-resolver.js
node -c frontend/js/ape-v9/ape-quality-prober.js
node -c frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
```

Los 3 deben retornar Exit 0.

### 10 Criterios de Éxito

1. **0 canales eliminados** por probe fallido
2. Canales premium reciben **HEVC Main10 PREFERRED** en F2
3. Canales sin evidencia conservan **URL original** (F5)
4. **0 declaraciones CMAF falsas** (solo si EXT-X-MAP + .m4s/init.mp4)
5. `VIDEO-RANGE=PQ` **INCONDICIONAL** (2026-06-16, SDR→HDR enhancement) — sin gatear por probe; `SUPPLEMENTAL-CODECS`/CMAF/codec-imposible siguen prohibidos
6. **0 HDCP-LEVEL hardcodeado** (TYPE-1 eliminado)
7. **0 SUPPLEMENTAL-CODECS falsos** (lcev.1.1.1 eliminado)
8. **0 headers tóxicos** (Range/If-None-Match/If-Modified-Since/TE/Priority/Upgrade-Insecure-Requests)
9. **F5 NO emite STREAM-INF** (solo EXTINF + URL)
10. `getAuditSummary().channelsRemoved === 0`

---

## Skills, Workflows & Rules — Doctrina MAX IMAGE

### Skills de Calidad Visual Extrema (`.agent/skills/`)

| Skill | Función en la doctrina |
|-------|----------------------|
| `Skill_KNN_God_Tier_Visual_Perfection` | Scoring 120/120 visual, validación perceptual |
| `Skill_Crystal_UHD_Sniper_Engine` | Selección de mejor variante UHD real |
| `Skill_OLED_Showroom_Supremacy` | Maximización brillo/contraste/chroma |
| `Skill_HDR_Authenticity_Detector` | Detecta HDR falso vs real (PQ/HLG/DV) |
| `Skill_Fake_4K_Detector` | Detecta upscale falso (resolución real < declarada) |
| `Skill_HEVC_Level_6_1_Enforcer` | Enforce Level 6.1 para 8K real |
| `Skill_Dynamic_Range_Classifier` | Clasifica SDR/HDR10/HLG/DV |
| `Skill_Color_Space_Validator` | Valida BT.2020 / BT.709 coherente |
| `Skill_HEVC_Metadata_Max_CLL_Fall` | MaxCLL/MaxFALL metadata HDR |
| `Skill_HDR_BT2020_Transfer_PQ_HLG` | Transfer characteristics PQ vs HLG |
| `Skill_HDR_Peak_Luminance_Forcing` | Peak luminance enforcement |
| `Skill_Codec_Efficiency_Ranker` | Ranking codec por eficiencia visual |
| `Skill_Resolution_vs_Bitrate_Validator` | Detecta bitrate insuficiente para resolución |
| `Skill_FrameRate_Integrity_Analyzer` | Valida fps real vs declarado |
| `Skill_VMAF_Estimator_From_Metadata` | Estima calidad visual desde metadata |
| `Skill_Bandwidth_Efficiency_Scorer` | Score eficiencia bw vs calidad |
| `Skill_Best_Stream_Hunter` | Busca mejor variante en master playlist |
| `Skill_CMAF_Strict_Compliance` | Valida fMP4/CMAF real (EXT-X-MAP + .m4s) |
| `Skill_GOP_Structure_Analyzer` | Estructura GOP para streaming óptimo |
| `Skill_Encoding_Profile_Analyzer` | Analiza profile/level del encoder |
| `god_tier_perceptual_quality` | Doctrina completa de calidad perceptual |
| `iptv-hdr-lcevc-pipeline` | Pipeline HDR + LCEVC detection |
| `iptv-hevc-cascade-injector` | **GOLDEN RULE hvc1/hev1** — cascada dual, auditoría RFC 8216, script Python corrector |
| `omega_crystal_10_10_751_lines` | Baseline 751 líneas por canal OMEGA |

### Skills de Resiliencia de Streaming (`.agent/skills/`)

| Skill | Función |
|-------|---------|
| `Skill_Anti_Freeze_Jump_To_Live` | Anti-freeze con jump-to-live |
| `Skill_Polymorphic_Freeze_Detector` | Detecta freezes por múltiples causas |
| `Skill_Network_Buffer_God_Tier` | Buffer óptimo por red |
| `Skill_TCP_BBR_Congestion_Injection` | BBR tuning para throughput |
| `Skill_Buffer_Bloat_Annihilation` | Elimina buffer bloat |
| `Skill_CDN_Throttling_Evasion` | Evasión de throttling CDN |
| `Skill_Hydra_Stream_Evasion_Engine` | Mutación anti-bloqueo ISP |
| `Skill_Anti_509_Blind_Resolution_Guard` | Protección contra 509 |
| `Skill_HTTP_Guard_CURL_Pipe_Protection` | Protección pipe HTTP |
| `iptv-resiliencia-degradacion` | Degradación graceful |

### Skills de Audio Premium (`.agent/skills/`)

| Skill | Función |
|-------|---------|
| `Skill_Audio_Passthrough_Atmos_Strict` | Atmos passthrough |
| `Skill_Audio_Video_Sync_Drop_Tolerance` | Sync A/V |

### Workflows Relevantes (`.agent/workflows/`)

| Workflow | Cuándo usar |
|----------|------------|
| `/knn-visual-perfection-auditing` | Auditar score visual 120/120 |
| `/audit-m3u8` | Auditar lista generada vs directivas APE |
| `/enforce-m3u8-typed-arrays-baseline` | Enforce baseline del generador |
| `/audit-rfc8216` | Validar compliance RFC 8216 (HLS) |
| `/deploy-omega-full-builder` | Build completo ecosistema OMEGA |
| `/anti-regression-protocol` | Anti-regresión post-edición JS |
| `/audit-js-syntax-and-e2e` | Syntax check + E2E math validation |
| `/m3u8-generation-rules` | Reglas obligatorias de generación |
| `/blindaje-correlador-canal` | Correlador 5 capas por canal |

### Reglas Inmutables (`.gemini/settings/`)

| Regla | Enforce |
|-------|---------|
| `shielded.md` + `shielded2.md` + `shielded3.md` | SHIELDED = filename only, NEVER URL transform |
| `propositovps.md` + `reglavps.md` + `regla3.md` | VPS NET SHIELD AUTOPISTA invariants |
| `url.md` | Single URL per channel (Anti-509) |
| `url2.md` | E2E auditor methodology |
| `cache.md` | Backup + SOP enforcement |

---

## Lo que NUNCA se hace

- Modificar URLs internas de canales para shielding (ver SHIELDED Architecture)
- Emitir `EXT-X-MEDIA URI=` o `EXT-X-I-FRAME-STREAM-INF URI=` en catálogos
- Activar circuit breaker en el VPS que bloquee por host
- Bajar `proxy_read_timeout` por debajo de 30s
- Usar `keepalive` en upstreams Xtream
- Cachear redirects 302 (`proxy_cache_valid 302` > 0)
- Reducir la lista eliminando canales por probe fallido
- Declarar codec/HDR/CMAF como verified sin evidencia empírica del prober

---

## OBJETIVO FINAL DE MAESTR�A EN 3 CAPAS:

Este agente debe adquirir, organizar y aplicar conocimiento en tres capas permanentes: primero, conocimiento t�cnico profundo del repositorio real, sus archivos, flujos, dependencias, errores, validaciones y arquitectura; segundo, conocimiento externo especializado obtenido de repositorios, documentaci�n oficial, est�ndares, foros t�cnicos, papers, herramientas de validaci�n y pr�cticas enterprise de IPTV, HLS, LL-HLS, CMAF, codecs, QoE, Nginx, OpenResty, VPS, players y continuidad operativa; tercero, conocimiento operativo convertido en skills, comandos, subagentes, checklists, runbooks, pruebas, m�tricas y automatizaciones reutilizables dentro del proyecto. El prop�sito es transformar a Claude Code en un especialista IPTV que pertenezca al 2% superior mundial en conocimiento aplicado, capaz de generar las mejores listas .m3u8 del mundo: listas de toda �ndole, limpias, compatibles, reproducibles, seguras, trazables, eficaces y dise�adas para representar fielmente la m�xima calidad visual disponible de cada fuente autorizada, sin degradar imagen, sin romper compatibilidad, sin introducir headers t�xicos, sin mezclar tags incorrectos y sin sacrificar continuidad. Cada lista debe ser una representaci�n t�cnica exacta de la extrema calidad de imagen del stream, expresando correctamente resoluci�n, c�dec, perfil, bitrate, audio, subt�tulos, compatibilidad de player, fallback y condiciones de reproducci�n, buscando siempre calidad visual brutal, estabilidad real, recuperaci�n inteligente y transmisi�n ininterrumpida de nivel enterprise.

## MANDATO PERMANENTE DE TEAM AGENTS:

En cada tarea, Claude Code debe desplegar internamente un Team Agent especializado, no actuar como un �nico programador. Debe convocar, como m�nimo, a los perfiles de IPTV/HLS Architect, LL-HLS/CMAF Engineer, Video Codec Engineer, Color Scientist HDR, QoE Researcher, Nginx/OpenResty Engineer, Linux VPS/SRE Engineer, Network/TCP/QUIC Engineer, Player Compatibility Engineer, Security/Header Auditor, FFmpeg Validator y Repo Surgeon. Cada agente debe analizar desde su disciplina, detectar riesgos, proponer mejoras, validar t�cnicamente y consolidar una decisi�n final. Ning�n cambio se considera completo hasta que el Team Agent haya revisado calidad visual, continuidad, compatibilidad, seguridad, reproducibilidad, observabilidad, rollback y pruebas E2E.

## P�RRAFO FINAL CONTUNDENTE:

A partir de este momento, este repositorio no se trabaja como un generador com�n de listas, sino como una f�brica enterprise de excelencia IPTV: cada l�nea, cada header, cada tag, cada perfil, cada fallback, cada script, cada endpoint y cada validaci�n debe servir a un �nico est�ndar superior: producir listas .m3u8 de clase mundial, compatibles, limpias, potentes, visualmente superiores y capaces de sostener reproducci�n continua con la m�xima calidad posible. Claude Code debe pensar, actuar y validar como un equipo �lite permanente, elevando el proyecto hasta convertirlo en una referencia t�cnica del 2% superior en IPTV, calidad de imagen, continuidad operativa y generaci�n inteligente de playlists.

---

## TEAM AGENT SUPREMO — Infraestructura instalada

Ver `AGENTS.md` para la versión limpia (sin mojibake encoding) de la doctrina completa.

**306 skills enterprise** instaladas bajo `.agents/skills/` (organizadas en 10 specialists, 15 anchors + 291 satellites). Cada skill tiene 8 archivos + 3 subdirs siguiendo la spec del Team Agent Supremo.

**10 Specialists** definidos en `.claude/agents/`:
- `iptv-hls-architect.md` (S1, 30 skills) — HLS/M3U8 RFC 8216
- `ll-hls-cmaf-engineer.md` (S2, 30 skills) — Low-Latency HLS / CMAF
- `video-codec-engineer.md` (S3, 31 skills) — Codec RFC 6381
- `color-scientist-hdr.md` (S4, 30 skills) — HDR10/HDR10+/HLG/DV
- `qoe-qos-researcher.md` (S5, 30 skills) — Telemetría / VMAF / MOS
- `nginx-openresty-lua-engineer.md` (S6, 31 skills) — Edge proxy / Lua
- `linux-vps-sre-engineer.md` (S7, 30 skills) — systemd / watchdog
- `network-tcp-quic-engineer.md` (S8, 31 skills) — TCP / QUIC / WG
- `player-compatibility-engineer.md` (S9, 32 skills) — hls.js / ExoPlayer
- `security-auth-headers-engineer.md` (S10, 31 skills) — Toxic headers / signed URLs

**7 Slash Commands** definidos en `.claude/commands/`:
- `/audit-iptv` — Full forensic audit
- `/validate-m3u8` — RFC 8216 + player compat
- `/build-skills` — Regenerar skills library
- `/qoe-report` — QoE end-to-end
- `/check-nginx-streaming` — nginx autopista compliance
- `/watchdog-status` — Health checks status
- `/player-compat` — Player matrix

**Index canónico**: `.agents/skills_index.json` (JSON validado).
**Reporte instalación**: `.agents/SKILLS_INSTALLATION_REPORT.md`.

---

## REGLA LEGAL Y ÉTICA (cardinal, no negociable)

Trabajar **únicamente** con streams, credenciales, servidores, proveedores, listas y tráfico **autorizados por el propietario del sistema**. No implementar:
- Evasión ilegal de proveedores o ISP.
- Acceso no autorizado.
- Bypass de DRM.
- Robo de señal.
- Ocultamiento malicioso.
- Técnicas para abusar de ISP o proveedores.

Toda optimización de red debe orientarse a **QoE, resiliencia, continuidad, seguridad, routing autorizado, multi-CDN autorizado y operación legítima**.

Esta regla se aplica a TODAS las skills, specialists y commands instalados arriba.


---

## ⚡ DIRECTIVA CODEC SUPREMO — Máxima Calidad Extrema de Imagen SIEMPRE (2026-06-19, owner LOCKED)

> **Integración OBLIGATORIA al 100% en TODA especialidad, comando y archivo del VPS — sin excepción, en cada acción.**
> No basta la mejor RESOLUCIÓN ni la familia de codec: hay que ELEGIR y APLICAR la **MEJOR VERSIÓN del codec**
> disponible — la más moderna y la que mejor se ve — por **HEURÍSTICA** entre TODAS las variantes que el
> proveedor SIRVE de verdad (probadas). Nunca conformarse con una variante inferior cuando hay una superior.

**Escalera de supremacía** (modernidad × calidad visual × decodabilidad REAL del device):
`VVC/H.266 (si real+decodable) > Dolby Vision (dvh1/dvhe) > HEVC Main12 (hvc1.4) > HEVC Main10 (hvc1.2) > AV1 10-bit (av01.*.10) > HEVC Main8 (hvc1.1) > AV1 8-bit > AVC High (avc1.640028) > AVC`
\+ el nivel/bit-depth/HDR (DV/HDR10+/HLG/PQ) más alto que la resolución pueda cargar (Ley Cardinal 1).

**Heurística obligatoria:** detectar TODAS las variantes del manifest REAL (probe voraz por canal), puntuar
cada una por la escalera, elegir la SUPREMA y reordenar/declarar esa. HEVC tiene miles de variantes —
**ninguna mejor variante puede pasarse por alto.** Buscar SIEMPRE técnicas nuevas y mejores. El probe MIDE.

**Truth-guard (no negociable):** "aplicar la mejor versión" = elegir/reordenar/declarar la mejor variante
**REAL** que el proveedor sirve y que el **decoder del device SOPORTA**. PROHIBIDO inventar un codec/nivel que
el proveedor no sirve o el decoder no decodifica (= freeze 2026-06-08 · GOLDEN RULE hvc1/hev1 · Ley Cardinal 1
Nivel↔Resolución). Sin transcode en el VPS. FREEZELESS intacto. El realce real lo da el VPP del device
(AI-SR/AI-PQ); el VPS SELECCIONA/COMANDA metadata, no pixeles.

**Conciencia universal:** cada acción de cada comando/skill lleva esta búsqueda de imagen extrema como
prioridad. Si una decisión puede subir el tier de codec sin romper FREEZELESS → **SE SUBE, SIEMPRE.**
