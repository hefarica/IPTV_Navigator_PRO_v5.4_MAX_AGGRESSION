## Consejo Supremo Team Agent — APE VPS HEVC-UHD Crystal FINAL (2026-06-08)

**Veredicto dual-pillar: WARN (exit 1).** Paquete estructuralmente desplegable y verificado localmente (SHA-256 = sidecar, node --check trío OK, GOLDEN RULE OK, Level↔Resolution sin ofensores). NO se otorga WIN: tres clases de hallazgo HIGH bloquean la aceptación — un fake-HDR condicional (perceptual4kMode) que es player-breaking lie del path, regresiones de red en la ruta de reproducción (proxy_read_timeout 30s + Xtream keepalive), y wiring de deploy roto (wake daemon/Lua). Ninguno está *committed por defecto* en el path activo (los toggles fake-HDR son opt-in default false; las regresiones de red son pre-deploy), por eso el paquete degrada a **WARN y no BLOCK**. El UTF-16 snapshot y el bloat de packaging son WARN (fuera del playback path).

> Confirmado contra source por el sintetizador: L9620 `videoRange:'PQ'` incondicional (comentario "Engaño declarativo"), L9880→9896 `_videoRangePart=',VIDEO-RANGE=PQ'`, iptv-intercept.conf L81/128/188/208/301 `proxy_read_timeout 30s`, L16-43 `keepalive` Xtream reintroducido, L4145 MaxFALL 0.08, L6520/6527/6532 default PQ, L7534 fallback `hvc1.1.6`.

### Tabla de veredictos por PhD (S1–S13)

| PhD | Freezeless | Visual | Veredicto | Una línea |
|-----|-----------|--------|-----------|-----------|
| S1 IPTV/HLS Architect | WARN | WARN | **WARN** | perceptual4kMode fake PQ (2 paths) + const-reassign TypeError → silent channel drop. |
| S2 LL-HLS/CMAF Engineer | BLOCK | WARN | **BLOCK** | maxQualityMode mete EXT-X-PART-INF/SERVER-CONTROL/TARGETDURATION en master → strict-parser freeze; codec hvc1.1.6 malformado; fake EXT-X-CMAF-*. |
| S3 Video Codec Engineer | WARN | WARN | **WARN** | GOLDEN RULE + Level/Res OK; perceptual4kMode + build_stream_inf default PQ. |
| S4 Color Scientist HDR | WARN | WARN | **WARN** | fake PQ en ambos paths (black-screen SDR); MaxFALL 0.08 vs 0.25; 2 footguns latentes. |
| S5 QoE/QoS Researcher | WARN | PASS | **WARN** | Triggers QoE reales y wired; 2 thresholds inconsistentes (stall 1200/8000, VST 800/3000) + contract GOLDEN RULE imprecisa. |
| S6 nginx/OpenResty/Lua | WARN | PASS | **WARN** | ape_wake_on_manifest.lua sólido pero DUAL log_by_lua_file conflict — wiring roto; io.open blocking + sin ACL en bootstrap. |
| S7 Linux VPS/SRE | PASS | PASS | **WARN** | ExecStart/deploy-path mismatch (daemon nunca arranca) + sin --rollback; eval en run(); hardening systemd nulo; bootstrap sin SHA-256. |
| S8 Network/TCP/QUIC | WARN | PASS | **WARN** | Xtream keepalive reintroducido (RST/freeze) + manifest proxy_read_timeout 30s en 4 servers; sin guard initcwnd=400. |
| S9 Player Compatibility | WARN | WARN | **WARN** | 3 paths fake-HDR incondicionales (resolve.php always_hdr+PQ, vlcopt_enhancer hdr10plus, perceptual4kMode) + CORONA divergence. |
| S10 Security/Auth/Headers | WARN | PASS | **WARN** | CORS wildcard en endpoint write (adb wake) + Connection/Keep-Alive hop-by-hop en PHP; sin SQLi, sin ADB bypass. |
| S11 Data/Observability | PASS | PASS | **WARN** | Wake dedup real y correcto (device+ch+list+key, 750ms); KPIs solo log-text, sin counters Prometheus. |
| S12 QA Broadcast Validator | WARN | WARN | **WARN** | Desplegable (no channel loss, JSON/SHA OK); fake-HDR condicional + proxy_read_timeout 30s + log de validación incompleto (node no corrió en sandbox Manus). |
| S13 Repo Surgeon | WARN | WARN | **WARN** | Path activo sólido; 2 HIGH (proxy_read_timeout 30s + perceptual4kMode PQ) + 5 MED/LOW packaging/truth. |

**Conteo:** 1 BLOCK (S2) · 12 WARN. Dos PhD reportan freezeless=BLOCK/WARN por la misma raíz (tags media-only en master bajo maxQualityMode + fake PQ). El consenso del consejo: ambas patologías están detrás de **toggles opt-in** o en ruta **pre-deploy**, no committed en el path estándar — por eso el sintetizador consolida a **WARN global** con S2 y los fake-HDR como **bloqueantes-de-WIN** explícitos. BLOCK global se reservaría a un freeze/lie que el paquete commitea por defecto; aquí no ocurre.

### Hallazgos consolidados por severidad

**HIGH (must-fix antes de --apply / WIN):**
1. **Fake-HDR perceptual4kMode** (S1/S3/S4/S9/S12/S13) — `VIDEO-RANGE=PQ` sin probe en truth-driven (L9620) y legacy (L9880→9896). Gate tras `_probeData?.videoRange==='PQ'`; intent de upscaler vía tag privado `#EXT-X-APE-PERCEPTUAL-4K`.
2. **const-reassign TypeError** (S1) — `_videoRangePart` const (L9687) reasignado (L9880) en IIFE strict → silent channel drop. const→let + gate.
3. **proxy_read_timeout 30s** en `.m3u8` (S8/S12/S13) — L81/128/188/208/301 → 60s.
4. **Xtream keepalive reintroducido** (S8) — L16-43 → eliminar pool.
5. **Codec malformado hvc1.1.6.*** (S2) — profile_idc=6 no registrado → reemplazar por `hvc1.2.4.*`.
6. **maxQualityMode tags media-only en master** (S2) — EXT-X-PART-INF/SERVER-CONTROL/TARGETDURATION → namespace `#EXT-X-APE-`.
7. **DUAL log_by_lua_file conflict** (S6) — encadenar wake via `pcall(dofile,...)` al final de bandwidth_reactor.lua.
8. **ape-wake-worker.service ExecStart/deploy mismatch** (S7) — daemon nunca arranca; parametrizar prefix + `systemctl is-active` post-apply.
9. **CORS wildcard en ape-wake.php** (S10) — scope ACAO + valid_referers o HMAC.
10. **Fake-HDR PHP/VLC** (S9) — resolve.php L732/739 + vlcopt_enhancer L55 always_hdr/PQ sobre SDR → gate `$hdrEnabled`/`hdr_confirmed`.

**MEDIUM (pre-producción, no-freeze):** fake CMAF/LCEVC sin probe (S2/S13); build_stream_inf dead-code default PQ (S3/S4/S13); MaxFALL 0.08 (S4); Connection/Keep-Alive PHP (S10); stall_ms 1200/8000 divergente + VST 800/3000 (S5); ape_virtual_4k legacy nil-opts (S4/S6/S9); CORONA T9/T10 divergence (S9); bootstrap sin ACL/Content-Disposition (S6/S10); sin --rollback (S7); eval en run() (S7); bootstrap sin SHA-256 (S7); KPIs sin Prometheus (S11); path-doctrine repo↔VPS sync (S13).

**LOW (hygiene, off-path):** UTF-16 LE wg-health-monitor.sh + 99-iptv-shield.conf (snapshot, no deploy path — WARN no BLOCK); 17 .bak + production_mirror/ + .bak_* dirs + sentinel-cache-warm.sh (warmer prohibido) bundle bloat; contract codec_priority GOLDEN RULE split; evasion-407 Sec-Fetch dead code + gate laxo; I-FRAME-STREAM-INF hvc1.1.6.L153/1080p mismatch; CRC32 dedup key colisión; follow_redirect.lua ngx.exit inactivo; build_proven_quality network-caching 300s OOM low-RAM.

### Síntesis dual-pillar

**Pilar FREEZELESS:** El path estándar (sin toggles) no commitea ningún freeze — node --check OK, BBR, limit_conn≥2, proxy_cache_valid 302=0, WG MTU 1420, GOLDEN RULE y dedup wake correctos. Los vectores de freeze reales son **condicionales o pre-deploy**: (a) strict-parser reject solo bajo `maxQualityMode`; (b) TypeError→channel-drop solo bajo `perceptual4kMode`; (c) regresiones de red (30s timeout, Xtream keepalive) que existen en el árbol pero se corrigen antes de `--apply`; (d) wiring de wake/Lua roto que dejaría el daemon muerto (degrada beneficio, no rompe reproducción base). Resolver los HIGH 2-8 cierra el pilar.

**Pilar VISUAL MASTER:** La cascada HEVC-first, Level↔Resolution y MaxFALL normativo (0.25 en 3 sitios) están bien; pero la doctrina MAX-IMAGE no autoriza *mentir*. Los fake-HDR (perceptual4kMode PQ, resolve.php always_hdr, vlcopt hdr10plus, build_stream_inf default PQ) violan "0 declaraciones HDR falsas" y producen **black-screen/green-cast sobre SDR** — el peor resultado visual posible. El fake CMAF/LCEVC es inerte al player pero envenena las decisiones del Lua body-filter. La calidad visual brutal se logra promoviendo RESOLUTION y codec real + tags APE-privados para intent de upscaler — nunca falsificando `VIDEO-RANGE`/`SUPPLEMENTAL-CODECS`/`CMAF`. Resolver HIGH 1, 5, 6, 10 + MEDIUM (CMAF/LCEVC, build_stream_inf, MaxFALL 0.08) cierra el pilar.

**Convergencia:** WARN, exit 1. Aplicar los 10 HIGH (y al menos los MEDIUM truth-guard/red) antes del deploy VPS y antes de habilitar cualquier toggle perceptual/maxQuality. Tras esos fixes el paquete es candidato directo a re-auditoría WIN.

### Caveat obligatorio

**Los anchors de playlist son metadata; la instalación y el wake reales requieren ruta VPS desplegada y host/dispositivo ADB autorizado o runtime compatible.** Los tags `#EXT-X-APE-INSTALLER` / `#EXT-X-APE-WAKE` son invisibles per RFC 8216 §6.3.1 (players conformes los ignoran) — el player NO ejecuta el installer ni habilita ADB. Toda mejora visual server-driven (floor_lock, virtual_4k, MEMC, lanes) depende de la cadena Lua/PHP del VPS, no de la lista. Regla legal/ética cardinal mantenida: streams, credenciales y dispositivos únicamente autorizados por el propietario.

---

## Tabla de aceptación (10 criterios)

| # | Criterio de aceptación (council) | Veredicto | Nota (una línea) |
|---|----------------------------------|-----------|------------------|
| 1 | 0 canales eliminados por probe fallido | WARN | El `const _videoRangePart` reassign en perceptual4kMode lanza TypeError en strict-mode → outer try-catch dropea la entry de canal (silent loss) SOLO si el toggle está activo; default false ⇒ riesgo condicional, no committed. |
| 2 | Premium → HEVC Main10 PREFERRED en F2 | WARN | Cascada F2/F3 correcta, pero fallbacks de codec emiten `hvc1.1.6.*` (profile_idc=6 no registrado, profile_space=1) en vez de `hvc1.2.4.*` Main10 — decoders caen a AVC. |
| 3 | Canales sin evidencia conservan URL original (F5) | PASS | Sin transform de channel-URL; SHIELDED = filename only respetado; F5 sin STREAM-INF. |
| 4 | 0 declaraciones CMAF falsas | WARN | `EXT-X-CMAF-*` y `EXT-X-CMAF-LCEVC:ENABLED=true` emitidos sin probe EXT-X-MAP/.m4s sobre canales TS; inertes a players (RFC §6.3.1) pero leídos por Lua body-filter (riesgo misrouting). |
| 5 | 0 declaraciones HDR falsas | BLOCK | perceptual4kMode inyecta `VIDEO-RANGE=PQ` sin probe en ambos paths (L9620, L9880→9896) — fake HDR → black-screen ExoPlayer en SDR. Confirmado en source + comentario "Engaño declarativo". Condicional al toggle (default false). |
| 6 | 0 HDCP-LEVEL hardcodeado | PASS | HDCP-Adaptive Engine: `HDCP-LEVEL=${cache||'TYPE-1'}` driven por Conviva/SQLite, no universal hardcode. |
| 7 | 0 SUPPLEMENTAL-CODECS falsos | PASS | Sin `lcev.1.1.1`; ningún SUPPLEMENTAL-CODECS inventado en el path activo. |
| 8 | 0 headers tóxicos | WARN | JS strippea via `_ca7BannedAbsolute`, pero `ape_hls_generators.php` L67-68 reintroduce `Connection`/`Keep-Alive` hop-by-hop en ruta PHP separada (OkHttp EOF risk). |
| 9 | F5 NO emite STREAM-INF | PASS | F5 = solo EXTINF + URL; verificado. |
| 10 | getAuditSummary().channelsRemoved === 0 | WARN | Verdadero en modo estándar; el TypeError de criterio 1 lo rompería solo bajo perceptual4kMode activo. |

## Hallazgos completos (severidad)

- [HIGH · FAKE-HDR · S1/S3/S4/S9/S12/S13] perceptual4kMode inyecta VIDEO-RANGE=PQ sin probe en truth-driven (L9620) y legacy (L9880→9896) paths — black-screen ExoPlayer sobre SDR. Confirmado en source. Toggle opt-in default false (no committed por defecto). Player-breaking lie del path → bloquea WIN, no el paquete.
- [HIGH · CRASH · S1] _videoRangePart const-reassign en strict-mode IIFE (L9687 const → L9880 reassign) lanza TypeError → outer try-catch dropea entry = canal perdido bajo perceptual4kMode activo. const→let + gate.
- [HIGH · FREEZE · S8/S12/S13] proxy_read_timeout 30s en locations .m3u8 (iptv-intercept.conf L81/128/188/208/301) viola invariante autopista >=60s — 504 en upstream lento → freeze/black. Subir a 60s.
- [HIGH · FREEZE · S8] Xtream upstream keepalive REINTRODUCIDO (4 upstreams, L16-43) — conexión pooled stale → RST mid-stream → buffer drain → freeze. Eliminar keepalive/keepalive_timeout/keepalive_requests.
- [HIGH · CODEC · S2] Codec malformado hvc1.1.6.* / hev1.1.6.* (profile_idc=6 no registrado, profile_space=1) en L2734/5732/7534/8417/9601/9950 — Apple/Tizen/webOS caen a AVC. Reemplazar por hvc1.2.4.*L<lvl>.B0 (Main10) alineado con HEVC_CASCADE_13TIER.
- [CRITICAL→reclasificado WARN-condicional · S2] maxQualityMode inyecta EXT-X-TARGETDURATION/EXT-X-PART-INF/EXT-X-SERVER-CONTROL (media-playlist-only) en header master/flat (L2665-2667) — strict-parser reject (tvOS/Shaka/hls.js strict) → freeze. SOLO bajo maxQualityMode. Mover a namespace #EXT-X-APE-.
- [HIGH · BROKEN WIRING · S6] Deploy script instruye segundo log_by_lua_file en locations que ya tienen bandwidth_reactor.lua (nginx permite uno) — reload puede tumbar todas las locations .m3u8. Encadenar via pcall(dofile,...).
- [HIGH · DAEMON NEVER STARTS · S7] ape-wake-worker.service ExecStart=/opt/netshield/... ≠ deploy target /var/www/ape/improved/... — wake-on-playback silenciosamente roto. Parametrizar prefix o symlink + is-active check.
- [HIGH · SECURITY · S10] CORS wildcard en ape-wake.php L10 (endpoint write → adb connect + setprop) — cualquier origen encola wake del dispositivo víctima. Scope ACAO + valid_referers o HMAC.
- [HIGH · FAKE-HDR PHP · S9] resolve.php L732 video-transfer-function=PQ + L739 hdr-output-mode=always_hdr incondicional sobre SDR; vlcopt_enhancer.php L55 lane hdr10plus always_hdr sin probe → tone-map BT.2020 sobre SDR (green cast/crushed blacks VLC/OTT/MX). Gatear tras $hdrEnabled / hdr_confirmed.
- [MEDIUM · S2/S13] Fake CMAF: EXT-X-CMAF-* (L6640-6642), EXT-X-CMAF-LCEVC:ENABLED=true (L8506), EXT-X-CMAF-INIT-SEGMENT (L8501) sin probe EXT-X-MAP sobre TS — inertes a players pero leídos por Lua body-filter (riesgo misrouting). Renombrar a #EXT-X-APE-CMAF-* + gate cmafVerified.
- [MEDIUM · S3/S4/S13] build_stream_inf() (dead code, L6501) default videoRange = cfg.video_range || 'PQ' en ramas VVC/AV1/HEVC (L6520/6527/6532) — latent fake-HDR si se re-wirea. Cambiar default a 'SDR' + marcar DEAD_CODE_DO_NOT_CALL.
- [MEDIUM · S4] X-HDR10-MaxFALL = round(peakNits*0.08) en L4145 viola EBU R103-4 (0.25); resto del archivo usa 0.25 (L5364/7918/8549). Alinear a max(50, round(peakNits*0.25)).
- [MEDIUM · S10] ape_hls_generators.php L67-68 reintroduce Connection: keep-alive + Keep-Alive multi-value (hop-by-hop, OkHttp single-value ban) en ruta PHP que bypasea sanitizer JS → unexpected-end-of-stream. Eliminar L67-68.
- [MEDIUM · S5] stall_ms threshold divergente: visual_payload_decider.sh=8000ms vs qoe_feedback_loop.sh=1200ms — ventana 1200-8000ms deja stream soft-stalling a perfil máximo hasta 6.8s si se llama el decider standalone. Alinear a 1200ms o documentar non-standalone.
- [MEDIUM · S6/S9/S4] ape_virtual_4k.lua legacy nil-opts path (L11-12/28-33) inyecta VIDEO-RANGE=PQ incondicional — footgun latente; ningún caller pasa nil hoy. Eliminar rama legacy o flip with_hdr=false.
- [MEDIUM · S9] CORONA tier divergence: Lua T10 (L156, 4K@120) vs JS T9 (L153, 4K@60) — CODECS= mismatch catálogo vs manifest VPS-rewritten (viola Triple Coherence). Alinear ambos a T10 o revertir Lua a T9.
- [MEDIUM · S6/S10] prisma-ape-installer-location.conf sirve bootstrap .sh como text/x-shellscript sin ACL ni Content-Disposition — descargables públicamente si el server block es 443. Añadir allow 10.200.0.0/24; deny all; + Content-Disposition attachment.
- [MEDIUM · S7] deploy_hevc_uhd_crystal_idempotent.sh sin --rollback mode (backups por-archivo pero sin restore) — viola requisito SRE de rollback para script VPS-touching. Añadir --rollback STAMP.
- [MEDIUM · S7] run() usa eval "$@" (L29) en script root-running VPS — reemplazar por "$@" directo.
- [MEDIUM · S7] ape-daemon-bootstrap.sh: set -u sin set -e; sourcea generic_player.sh fetched remoto sin verificar SHA-256 (supply-chain → dispositivos ADB prod). set -eu + sha256sum -c antes de source o bundle local.
- [LOW · packaging · S5/S7/S8/S10/S12/S13] wg-health-monitor.sh + 99-iptv-shield.conf UTF-16 LE (BOM FF FE) en vps-live-snapshot-20260428/ — NO ejecutarían en Linux pero FUERA del deploy path activo (no en INTEGRATED_FILES). Re-encode a UTF-8 LF. WARN no BLOCK.
- [LOW · packaging · S13] Dead-weight en árbol deployable: 17 .bak de m3u8 (2.6MB), vps-live-snapshot-20260428/ (37 files), production_mirror/ (37 dup), .bak_* config dirs, sentinel-cache-warm.sh (warmer prohibido). Excluidos de INTEGRATED_FILES pero strip antes de release.
- [LOW · S5/S3] contract codec_priority [hevc,hvc1,hev1,avc_fallback] mezcla roles GOLDEN RULE — split en stream_inf_codec_priority (hvc1) y player_runtime_codec_priority (hev1).
- [LOW · S10/S13] evasion-407-supremo.js buildTheatricalHeaders() Sec-Fetch-* dead code (0 callers) + browser-UA gate /Safari/i demasiado laxo (matchea WebView móvil). Eliminar o tighten gate con !Mobile/!Android.

---
_Generado por /iptv-freezeless-visual-master-council · 2026-06-08 · 13 PhD + síntesis · BLOCK=1 · veredicto WARN (exit 1)_
