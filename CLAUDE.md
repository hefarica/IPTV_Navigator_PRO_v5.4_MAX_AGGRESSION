# IPTV Navigator PRO v5.4 MAX AGGRESSION — CLAUDE.md

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
| `VIDEO-RANGE=PQ\|HLG` | Probe detectó `VIDEO-RANGE` real en manifest |
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
HDCP-LEVEL="TYPE-1"              ← ELIMINADO (rompe players que evalúan HDCP)
SUPPLEMENTAL-CODECS="lcev.1.1.1" ← ELIMINADO (LCEVC inventado, no real)
VIDEO-RANGE sin probe             ← ELIMINADO (HDR falso confunde decoders)
```

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
5. **0 declaraciones HDR falsas** (solo si VIDEO-RANGE=PQ/HLG probado)
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

