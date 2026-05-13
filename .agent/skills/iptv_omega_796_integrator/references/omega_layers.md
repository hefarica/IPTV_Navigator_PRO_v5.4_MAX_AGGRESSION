# OMEGA CRYSTAL V5 — Referencia de Capas L0-L10

## Tabla de Contenidos
1. [L0 — Identidad HLS](#l0)
2. [L1 — EXTVLCOPT (110 líneas)](#l1)
3. [L2 — EXTHTTP JSON (1 línea)](#l2)
4. [L3 — KODIPROP Kodi ISA (65 líneas)](#l3)
5. [L4 — EXT-X-CMAF Pipeline (25 líneas)](#l4)
6. [L5 — HDR-DV Override (45 líneas)](#l5)
7. [L6 — Telemetría QoS/QoE (10 líneas)](#l7)
8. [L7 — EXTATTRFROMURL Puente (53 líneas)](#l7)
9. [L8 — Núcleo Crystal APE (470 líneas, 23 secciones)](#l8)
10. [L9 — Phantom Hydra Evasión (13 líneas)](#l9)
11. [L10 — URL Resolution (2 líneas)](#l10)

---

## L0 — Identidad HLS (2 líneas) {#l0}

```
#EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",CANAL
#EXT-X-STREAM-INF:BANDWIDTH=...,RESOLUTION=...,CODECS="...",FRAME-RATE=...
```

Estas dos líneas son las únicas que los parsers HLS estándar procesan. Todas las demás son ignoradas por reproductores no compatibles.

---

## L1 — EXTVLCOPT (110 líneas) {#l1}

Esclavización completa de VLC y ExoPlayer. Distribuidas en 12 subsecciones:

| Subsección | Líneas | Contenido |
|---|---|---|
| 1.a Red y buffer | 10 | `network-caching`, `live-caching`, `http-reconnect`, `http-user-agent` |
| 1.b Video-filter chain | 1 | `zscale=transfer=st2084:chromal=topleft` + `nlmeans`, `bwdif`, `deband`, `minterpolate` |
| 1.c Hardware decode | 5 | `avcodec-hw=any`, `hw-dec=all`, `video-color-space=bt2020nc` |
| 1.d Codec hierarchy | 10 | `avcodec-codec=hevc`, fallbacks av1/h264/mpeg2, `avcodec-threads=0` |
| 1.e Audio pipeline | 10 | `spdif=eac3,ac3,dts,truehd`, `audio-channels=8`, `audio-bit-depth=24` |
| 1.f ABR y bandwidth | 10 | `adaptive-maxwidth`, `adaptive-logic=highest`, `adaptive-maxbw` |
| 1.g Error resilience | 10 | `avcodec-error-resilience`, `avcodec-error-concealment=motion_vector` |
| 1.h Deinterlace y display | 10 | `deinterlace-mode=yadif2x`, `vout=opengl`, `swscale-mode=9` |
| 1.i HDR tone-mapping | 10 | `tone-mapping=hable`, `hdr-peak-luminance`, `hdr-color-gamut=bt2020` |
| 1.j Red avanzada | 10 | `avformat-options`, `avcodec-options`, `prefer-ipv4=true` |
| 1.k Subtítulos y metadata | 10 | `sub-track-id=-1`, `meta-title`, `meta-genre` |
| 1.l Parámetros de reproducción | 14 | `fullscreen=true`, `no-osd=true`, `no-stats=true` |

---

## L2 — EXTHTTP JSON (1 línea) {#l2}

Una sola línea `#EXTHTTP:{...}` con el payload JSON completo. Construida por `build_exthttp()` existente, enriquecida con:

- `sid` (idempotente), `uniqueness_nonce` (polimórfico)
- `quality_levels` L1-L7 (cadena de degradación)
- `resilience` (7 niveles, estrategias por código HTTP)
- `isp_evasion` (Swarm Phantom Hydra, DoH, SNI obfuscation)
- `ai_pipeline` (LCEVC Phase 4, RealESRGAN, RIFE_V4)
- Headers: `X-APE-SID`, `X-APE-NONCE`, `X-APE-LCEVC-PHASE`, `X-APE-HDR-PEAK-NITS`

---

## L3 — KODIPROP Kodi ISA (65 líneas) {#l3}

| Subsección | Líneas |
|---|---|
| Manifest y stream selection | 5 |
| Hardware decode y calidad | 10 |
| HDR y color (BT.2020, SMPTE-ST-2084) | 10 |
| Audio pipeline (Atmos, DTS, TrueHD) | 10 |
| DRM (Widevine L1, FairPlay) | 10 |
| VRR y sincronización | 10 |
| User-agent y headers | 10 |

---

## L4 — EXT-X-CMAF Pipeline (25 líneas) {#l4}

Pipeline fMP4/CMAF con latencia cero:
- `CONTAINER=fMP4,SEGMENT=4,LATENCY=ZERO`
- `HOLD-BACK:0`, `PART-HOLD-BACK:0`, `PART-TARGET:0.5`
- 7 niveles de fallback (CMAF+HEVC → HLS/fMP4 → HLS/TS → TS_Direct → HTTP_Redirect → AUDIO_ONLY)
- HDR: `HDR10_PLUS,DOLBY_VISION,HLG`
- Audio: `EAC3,AC3,AAC,ATMOS,DTS,TRUEHD`

---

## L5 — HDR-DV Override (45 líneas) {#l5}

Override completo HDR10+/Dolby Vision:
- Peak luminance configurable (`_hdr796`, default 5000 nits)
- LCEVC Phase 4, AI SR RealESRGAN_x4Plus, RIFE_V4
- Mastering display, content light level, local dimming
- Tone-mapping: BT2446a, BT2390, libplacebo+vulkan
- Compatibilidad cruzada HDR10/DV/HLG

---

## L6 — Telemetría QoS/QoE (10 líneas) {#l6}

```
#EXT-X-APE-TELCHEMY:VSTQ=50,EPSNR=45,MOS=4.8,JITTER=0,LOSS=0
```
Métricas de calidad simuladas para reproductores que las consumen: VMAF, PSNR, SSIM, latencia, bitrate objetivo, disponibilidad 99.999%.

---

## L7 — EXTATTRFROMURL Puente (53 líneas) {#l7}

Puente matemático entre el JSON L2 y el Resolver PHP. 7 subsecciones:

| Subsección | Líneas | Contenido |
|---|---|---|
| Identidad y sesión | 8 | SID, nonce, profile, channel-id, session-id, request-id |
| Codec y calidad | 8 | codec, resolution, fps, HDR peak, bitrate, LCEVC phase |
| Evasión y spoof | 8 | UA, device spoof, DNS, SNI front, DPI evasion |
| DRM y seguridad | 7 | Widevine L1, CBCS, TLS 1.3, cert pinning, HSTS |
| Transporte y red | 7 | HLS_FMP4, fMP4, segment duration, HTTP2/3 |
| Idempotencia y caché | 7 | cache key, TTL, stale-while-revalidate, retry strategy |
| Calidad adaptativa | 8 | ABR=HIGHEST, quality levels, VMAF/PSNR/SSIM targets |

---

## L8 — Núcleo Crystal APE (470 líneas, 23 secciones) {#l8}

| Sección | Líneas | Directiva base |
|---|---|---|
| 8.a Buffer Nuclear | 20 | `#EXT-X-APE-BUFFER-NUCLEAR:` |
| 8.b BBR Hijacking | 20 | `#EXT-X-APE-BBR-HIJACK:` |
| 8.c DSCP QoS | 10 | `#EXT-X-APE-QOS-DSCP:EF` |
| 8.d Phantom Hydra Core | 20 | `#EXT-X-APE-PHANTOM-HYDRA:` |
| 8.e Codec Priority | 20 | `#EXT-X-APE-CODEC-PRIORITY:` |
| 8.f Resilience 7 niveles | 20 | `#EXT-X-APE-RESILIENCE:` |
| 8.g Spoof y evasión | 20 | `#EXT-X-APE-SPOOF:` |
| 8.h DRM | 20 | `#EXT-X-APE-DRM:` |
| 8.i Cortex AI | 20 | `#EXT-X-APE-CORTEX-AI:` |
| 8.j Audio Pipeline | 20 | `#EXT-X-APE-AUDIO:` |
| 8.k Scorecard Dinámico | 20 | `#EXT-X-APE-SCORECARD:` |
| 8.l VRR y sincronización | 20 | `#EXT-X-APE-VRR:` |
| 8.m Polimorfismo | 20 | `#EXT-X-APE-POLYMORPHIC:` |
| 8.n Quality Override | 20 | `#EXT-X-APE-QUALITY-OVERRIDE:` |
| 8.o Luma Precision | 20 | `#EXT-X-APE-LUMA-PRECISION:` |
| 8.p Bitrate Anarchy | 20 | `#EXT-X-APE-BITRATE-ANARCHY:` |
| 8.q Quantum Pixel | 20 | `#EXT-X-APE-QUANTUM-PIXEL:` |
| 8.r Buffer God Tier | 20 | `#EXT-X-APE-BUFFER-GOD-TIER:` |
| 8.s Space Validator | 20 | `#EXT-X-APE-SPACE-VALIDATOR:` |
| 8.t VNOVA LCEVC | 20 | `#EXT-X-VNOVA-LCEVC:` |
| 8.u Cortex Telemetría | 20 | `#EXT-X-APE-CORTEX-TELEMETRY:` |
| 8.v Cortex Diagnosis | 20 | `#EXT-X-APE-CORTEX-DIAGNOSIS:` |
| 8.w Player Enslavement | 20 | `#EXT-X-APE-PLAYER-ENSLAVEMENT:` |

---

## L9 — Phantom Hydra Evasión (13 líneas) {#l9}

```
#EXT-X-PHANTOM-HYDRA:ROTATION=ORGANIC,DNS=DOH_CLOUDFLARE,SNI=OBFUSCATED
```
5 User-Agents (Android, iOS, Chrome, Safari, TiviMate), 3 DNS (1.1.1.1, 8.8.8.8, 9.9.9.9), SNI front cloudflare.com, tráfico HTTPS_MIMICRY, Sandvine bypass, IP rotation SWARM_2048.

---

## L10 — HLS Metadata + URL Resolution (5 líneas) {#l10}

```
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-primary",NAME="Primary Audio",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="spa"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-backup",NAME="Backup Audio",DEFAULT=NO,AUTOSELECT=YES,LANGUAGE="spa"
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=2000000,CODECS="hvc1.2.4.L153.B0"
#EXT-X-STREAM-INF:BANDWIDTH=80000000,CODECS="hvc1.2.4.L153.B0,ec-3",RESOLUTION=1920x1080,FRAME-RATE=60.000
https://servidor/usuario/password/{stream_id}?ape_sid={ESTABLE}&ape_nonce={MUTA}
```

> ⚠️ **FIX 2026-04-17**: `EXT-X-MEDIA` y `EXT-X-I-FRAME-STREAM-INF` van SIN `URI=` (no abren conexiones extras).
> `EXT-X-MAP:URI="init.mp4"` eliminado (causaba 404 — archivo fantasma en catálogo M3U8).

La URL es construida por `buildChannelUrl()` existente. Se le inyectan `ape_sid` (idempotente) y `ape_nonce` (polimórfico). El Resolver PHP usa `ape_sid` como cache key para responder en <5ms.
