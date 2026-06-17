# Council Report — Módulo iData/MATCH/carga (motor "superpaquete")
**Fecha:** 2026-06-09 · **Scope:** full · **Mode:** audit · **13 PhDs + workflow inventario (5 agentes)**

## Veredicto dual-pillar consolidado
| Pilar | Veredicto | Base |
|---|---|---|
| **FREEZELESS** | **PASS (13/13)** | Lazo best-effort no-bloqueante; el zap local corre antes de la red; backoff; no toca autopista; no proxea vídeo; SLO <3s alcanzable (RTT Cali→Ashburn ~120ms + TLS ~120ms + PHP ~10ms = <300ms nominal). |
| **VISUAL MASTER** | **WARN (0 BLOCK)** | Truth-guards correctos (Level↔Resolution, GOLDEN RULE hvc1/hev1, fake-4K guard, VIDEO-RANGE solo-si-real). PERO el enriquecimiento China Box/Huawei NO se entrega (dead code) y el MATCH corre degradado (sin `esperado`). |

**Caso real medido:** AVC/H.264 1920x1080 30fps **SDR** ~5Mbps en Fire TV Stick 4K (AFTKRT, MediaTek, panel 4K, HEVC-4K-HDR10 capable, sin Dolby Vision), OTT/ExoPlayer por Xray. VMAF estimado ~74 (FHD-class); con AI-SR ~79-83; **NO es 4K-class real** — reportarlo como 4K público violaría la doctrina (el tag actual `#EXT-X-APE-VIRTUAL-4K:MODE=DEVICE_UPSCALE_HINT` ES honesto).

## Hallazgos convergentes (múltiples PhDs, rankeados)

### 🔴 P1 — el módulo NO entrega su valor sin esto
- **A1 · `ape_china_box_enrichment()` definida pero NUNCA llamada** (S1-H2, S3-F4, S13-F1). La carga China Box/Huawei (vendor_hints, floor_lock, private_tags) jamás llega al daemon. **Wire it** en `$carga`, alimentado por el perfil REAL `P1_STABLE_1080P_PREMIUM` de `visual_profiles.json`.
- **A2 · iData sin `esperado`** (S1-H3, S3-F7, S12-F7, S13-F5). El MATCH es siempre `esperado_only` con defaults → el fake-4K guard nunca dispara. El daemon debe inyectar `esperado` (índice local por canal del generador).
- **A3 · `read_real_decode` lee CAPACIDAD, no el decoder ACTIVO** (S12-F1 confirmado, S3-F3). Reporta "hevc 4K" cuando suena AVC 1080p (las líneas CodecQuerier/MediaCodecList contaminan). Fix S12: `logcat -s` a tags de decoder activo (`MediaCodecVideoRenderer/ExoPlayerImpl/CCodec/OMXCodec`) + filtro `updateFormatChanged|onOutputFormatChanged|width=..height=` + `sleep 1` post-zap (no bloquea, cabe en <3s).
- **A4 · `apply_carga` aplica 1 de ~100 metadatos** (S1-H2). Extender para consumir `vendor_hints`/`adb_settings`/(KODIPROP/EXTVLCOPT a sidecar).

### 🟠 HIGH — honestidad (en el pipeline de LISTA existente, adyacente)
- **B1 · NAMESPACE COLLISION** (S4-F1): `combined_body_filter.lua` mapea `P0..P5` → perfiles PLANOS agresivos (`P0_SHOWROOM_FLASH_4K`, `virtual_4k_hdr=ACTIVE`+`HDR_FORCE`), NO a los nuevos `P*_TRUTHFUL/STABLE/...`. La LISTA en vivo emite **VIDEO-RANGE=PQ sobre SDR** = fake-HDR real. Fix: repuntar `profile_keys` a los perfiles truthful.
- **B2 · `ape_virtual_4k.lua` path legacy** inyecta `HDR=PQ,VIDEO-RANGE=PQ` sin probe (S4-F2). Desactivar el path `opts==nil`.
- **B3 · QHD@60 sobre-declara L153** (S3-F1): QHD cabe en L150 (L5.0). Corregir `$h>=1440` → `L150`.

### 🟡 MEDIUM — agregación QoE (lo que pediste: Conviva + motores)
- **C1 · ape-match NO agrega Conviva** (S5-R1/R2): modular `intensity` por rebuffer/VST (umbrales S5) + `hdcp_level` por `getHdcpForChannel`. Fórmula: `eff_intensity = max(0.05, base * min(vst_factor, rebuf_factor))`.
- **C2 · SQLite `busy_timeout=200`** (S5-R3) anti-bloqueo concurrente con qoe-flush.
- **C3 · caché `/dev/shm/ape_realcfg` se escribe pero NO se lee** (S11-F3, S5-R5, S3): cerrar el lazo de aprendizaje (read-back en el próximo zap) + TTL 6h + normalizar HDR a mayúsculas.

### 🟡 MEDIUM/LOW — seguridad · red · SRE · observabilidad · player
- **D (S10):** iData→POST (quitar GET); quitar fallback `?token=` GET; quitar `Access-Control-Allow-Origin:*`; guard `$ch='.'`; TTL de token 365d.
- **E (S8):** keep-alive TLS en el agente (no pagar TLS por zap) + `keepalive_timeout 120s` en el server prisma; **NO QUIC** (marginal, riesgo desproporcionado).
- **F (S7):** persistencia del daemon en Fire OS = el `ape-player-autoinstall.timer` (60s) es el watchdog (verificar enabled + relanzar con subshell-fork + verificación 3s); `tmpfiles.d` para `/dev/shm/ape_*`; `logrotate` copytruncate; script de backup nginx a `/root` (NUNCA .bak en sites-enabled/conf.d).
- **F-zone (S6):** la zona `limit_req_zone ape_match` está en el VPS pero NO en el repo → drift. Añadir `conf.d/00-ape-agent-zones.conf` al repo. Subir `burst=40` (channel-surf). Reload basta (no restart) para zona nueva.
- **G (S11):** ape-match 0 counters → exportar KPIs (`ape_match_real_decode_ratio`, `fake4k_blocked`, tier dist, `zap_enriched`, QoE per-channel, HDCP, flush liveness, `device_dropped_frames_300s`) a `/prisma/api/metrics` (Prometheus). El dropped-frames del `sentinel_qoe.json` es el KPI de freeze #1 y hoy nadie lo lee.
- **H (S9 — verdad de player):** en Fire OS sin root `setprop persist.*` está **BLOQUEADO** → AI-SR/MEMC vendor MediaTek NO se activan por ADB; el lift real en Firestick = **la LISTA** (cascada HEVC + KODIPROP/EXTVLCOPT) + `settings put match_content_frame_rate` (sí funciona) + el procesado del TV. KODIPROP/EXTVLCOPT son list-level → para un player YA reproduciendo, reload por intent ADB. Guardar `apply_mediatek` por `DEVICE_PLATFORM=firetv`; marcador idempotencia via `settings put` (no setprop).

## Plan de ejecución (orden por impacto)
1. **Bloque A (valor):** wire enrichment (con `P1_STABLE_1080P_PREMIUM` real del inventario) + inyectar `esperado` + fix `read_real_decode` (decoder activo) + extender `apply_carga`.
2. **Bloque B (honestidad):** namespace collision + legacy PQ path + QHD L150.
3. **Bloque C (QoE):** Conviva modulación + busy_timeout + caché read-back/TTL.
4. **Bloque D (seguridad):** POST + quitar GET-token/CORS + TTL.
5. **Bloque E/F/G/H (hardening):** keep-alive, persistencia/zone-en-repo/logrotate, KPIs, player-scope guards.

## El paquete ideal (inventario workflow) — para el 1080p SDR AVC
Perfil **`P1_STABLE_1080P_PREMIUM`** (intensity 0.3 heredada de P6, mode=safe). Públicos HONESTOS: `RESOLUTION=1920x1080`, `VIDEO-RANGE=SDR`, `CODECS=hvc1.2.4.L120.B0`. Enriquecimiento de display: floor_lock (negro/blanco/gamma 2.2-2.3/chroma OLED/grass sport, guards histograma+clipping+skin+logo), china_box_layer virtual_4k=**device_upscale_hint** (Android-TV-overlay-scaler en Firestick; AI-SR via huawei_hisilicon_style mapeado), edge/texture/sports policies, artifact_suppression light, hdr_intent **disabled/SDR-safe**, codec_policy hevc-first-else-h264. **Vendor real Firestick:** NO existe familia "mediatek" en el JSON → mapea a `huawei_hisilicon_style` (AI-SR/color/motion) + `generic_android_tv_style` (overlay scaler); sysfs `am_vecm` NO aplica (no root, no Amlogic). Tags privados: `#EXT-X-APE-FLOOR-LOCK`, `#EXT-X-APE-CHINA-BOX`, `#EXT-X-APE-VIRTUAL-4K:MODE=DEVICE_UPSCALE_HINT` (inertes RFC8216 §6.3.1).

## Validación (gates)
`node -c` ×3 · `php -l` · `bash -n`/`sh -n` · curl-asserts (A: 4K HDR→L153+PQ; B antifake: esperado-4K/real-1080p-SDR→L120+sin-PQ; C: latencia) · E2E zap glass-to-glass (<3000ms con ZAP_POLL=0.5s + sleep-1 + VPS<10ms) · truth-guards (0 PQ sin probe, 0 fake-4K, GOLDEN RULE).

## Acceptance
0 freeze · 0 player-breaking-lies · enrichment wired+aplicado · MATCH con esperado real · parser lee decoder activo · QoE modula · KPIs exportados · honestidad pública intacta.
