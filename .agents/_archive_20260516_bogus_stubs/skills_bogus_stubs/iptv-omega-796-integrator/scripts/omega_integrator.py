"""
Script de integración OMEGA CRYSTAL V5 → m3u8-typed-arrays-ultimate.js
Estrategia:
  1. Copiar el archivo original tal cual hasta la línea 5433 (antes de reqId/sessionId)
  2. Reemplazar el bloque de generación de líneas (L5434-L5886) con la nueva función
     que materializa las 796 líneas usando todos los sistemas existentes
  3. Mantener intacto todo lo demás (L5887 en adelante)
"""

with open('/home/ubuntu/upload/pasted_content_14.txt', 'r', encoding='utf-8') as f:
    original = f.readlines()

# Líneas de corte (0-indexed)
# L5434 = const reqId (índice 5433) — PRIMER punto de corte
# L5886 = return lines.join (índice 5885) — SEGUNDO punto de corte
CUT_START = 5433   # índice 0-based de "const reqId = ..."
CUT_END   = 5886   # índice 0-based de "return lines.join"

OMEGA_BLOCK = r"""
        // ═══════════════════════════════════════════════════════════════════════
        // 🔑 OMEGA CRYSTAL V5 — IDENTIDAD DUAL: POLIMORFISMO + IDEMPOTENCIA
        // nonce  = rand8()  → muta en cada descarga (1% uniqueness / DPI evasion)
        // sid    = FNV32(ch.id + STATIC_SEED)[:16] → NUNCA cambia (cache key)
        // reqId  = REQ_ + rand16 → muta (trazabilidad única HTTP)
        // sessionId = SES_ + rand16 → muta (sesión única por descarga)
        // ═══════════════════════════════════════════════════════════════════════
        const _nonce796    = generateRandomString(8);
        const _sid796      = (function(id) {
            let h = 0x811c9dc5;
            const s = String(id) + 'OMEGA_STATIC_SEED_V5';
            for (let i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i);
                h = (h * 0x01000193) >>> 0;
            }
            const h2 = (h ^ (h >>> 16)) >>> 0;
            return (h.toString(16).padStart(8,'0') + h2.toString(16).padStart(8,'0')).substring(0,16);
        })(channel.stream_id || channel.id || index);
        const reqId        = `REQ_${generateRandomString(16)}`;
        const sessionId    = `SES_${generateRandomString(16)}`;

        // ── Cadena de degradación L1-L7 ──────────────────────────────────────
        const _ql796 = {
            L1: { resolution: cfg.resolution || '1920x1080', bitrate_mbps: (cfg.bitrate||8000)/1000, codec: cfg.codec_primary||'hevc', fps: cfg.fps||60 },
            L2: { resolution: '1920x1080', bitrate_mbps: 8.0, codec: cfg.codec_primary||'hevc', fps: Math.min(cfg.fps||60,60) },
            L3: { resolution: '1280x720',  bitrate_mbps: 4.0, codec: 'h264', fps: Math.min(cfg.fps||30,30) },
            L4: { resolution: '854x480',   bitrate_mbps: 1.5, codec: 'h264', fps: 25 },
            L5: { resolution: '640x360',   bitrate_mbps: 0.8, codec: 'h264', fps: 25 },
            L6: { resolution: '426x240',   bitrate_mbps: 0.4, codec: 'h264', fps: 15 },
            L7: { resolution: 'audio',     bitrate_mbps: 0.128, codec: 'aac', fps: 0 }
        };

        // ── Video-filter chain completa (zscale + chromal=topleft) ────────────
        const _vf796 = [
            'fieldmatch','decimate',
            `nlmeans=s=3.0:p=7:r=15`,
            `bwdif=mode=1:parity=-1:deint=0`,
            `deband=1thr=0.015:2thr=0.015:3thr=0.015:4thr=0.015:blur=1`,
            `pp=ac/dr/ci`,
            `unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4`,
            `zscale=transfer=st2084:primaries=bt2020:matrix=2020_ncl:dither=error_diffusion:range=limited:chromal=topleft`,
            `format=yuv444p`,
            `hqdn3d=4:3:12:9`,
            `fps=fps=${cfg.fps||60}:round=near`,
            `minterpolate=fps=${(cfg.fps||60)*2}:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs`
        ].join(',');

        // ── UA sincronizado con UAPhantomEngine ───────────────────────────────
        const _ua796 = (typeof UAPhantomEngine !== 'undefined')
            ? UAPhantomEngine.getForChannel(index, channel.name || '')
            : 'Mozilla/5.0 (Linux; Android 12; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

        // ── Buffer values (ya multiplicados por Capacity Overdrive) ───────────
        const _buf796  = cfg.buffer_ms       || 60000;
        const _nbuf796 = cfg.network_cache_ms || _buf796;
        const _lbuf796 = cfg.live_cache_ms    || _buf796;
        const _fbuf796 = cfg.file_cache_ms    || _buf796;
        const _bw796   = cfg.max_bandwidth    || 80000000;
        const _fps796  = cfg.fps              || 60;
        const _res796  = cfg.resolution       || '1920x1080';
        const _codec796= cfg.codec_primary    || 'hevc';
        const _hdr796  = cfg.peak_luminance   || cfg.hdr_nits || 5000;
        const _ct796   = (channel.group || 'GENERAL').toUpperCase();
        const _chName  = channel.name || '';
        const _chId    = String(channel.stream_id || channel.id || index);

        const lines = [];

        // ══════════════════════════════════════════════════════════════════════
        // ── L0: EXTINF + EXT-X-STREAM-INF (2 líneas) ─────────────────────────
        // ══════════════════════════════════════════════════════════════════════
        lines.push(generateEXTINF(channel, originalProfile, index));
        lines.push(build_stream_inf(cfg, channel));
        // L0 = 2 ✓

        // ══════════════════════════════════════════════════════════════════════
        // ── L1: EXTVLCOPT — Esclavización VLC/ExoPlayer (110 líneas) ─────────
        // ══════════════════════════════════════════════════════════════════════
        // 1.a Red y buffer (10)
        lines.push(`#EXTVLCOPT:network-caching=${_nbuf796}`);
        lines.push(`#EXTVLCOPT:live-caching=${_lbuf796}`);
        lines.push(`#EXTVLCOPT:file-caching=${_fbuf796}`);
        lines.push(`#EXTVLCOPT:disc-caching=${_fbuf796}`);
        lines.push(`#EXTVLCOPT:clock-jitter=0`);
        lines.push(`#EXTVLCOPT:clock-synchro=0`);
        lines.push(`#EXTVLCOPT:http-reconnect=true`);
        lines.push(`#EXTVLCOPT:http-forward-cookies=true`);
        lines.push(`#EXTVLCOPT:http-referrer=${channel.url || ''}`);
        lines.push(`#EXTVLCOPT:http-user-agent=${_ua796}`);
        // 1.b Video-filter chain completa (1)
        lines.push(`#EXTVLCOPT:video-filter=${_vf796}`);
        // 1.c Hardware decode y color (5)
        lines.push(`#EXTVLCOPT:avcodec-hw=any`);
        lines.push(`#EXTVLCOPT:hw-dec=all`);
        lines.push(`#EXTVLCOPT:video-color-space=bt2020nc`);
        lines.push(`#EXTVLCOPT:video-transfer-function=smpte2084`);
        lines.push(`#EXTVLCOPT:video-color-primaries=bt2020`);
        // 1.d Codec hierarchy (10)
        lines.push(`#EXTVLCOPT:avcodec-codec=hevc`);
        lines.push(`#EXTVLCOPT:avcodec-codec-fallback=av1`);
        lines.push(`#EXTVLCOPT:avcodec-codec-fallback-2=h264`);
        lines.push(`#EXTVLCOPT:avcodec-codec-fallback-3=mpeg2video`);
        lines.push(`#EXTVLCOPT:avcodec-threads=0`);
        lines.push(`#EXTVLCOPT:avcodec-skip-frame=0`);
        lines.push(`#EXTVLCOPT:avcodec-skip-idct=0`);
        lines.push(`#EXTVLCOPT:avcodec-dr=true`);
        lines.push(`#EXTVLCOPT:avcodec-fast=false`);
        lines.push(`#EXTVLCOPT:avcodec-hurry-up=false`);
        // 1.e Audio pipeline (10)
        lines.push(`#EXTVLCOPT:audio-track-id=0`);
        lines.push(`#EXTVLCOPT:audio-language=eng,spa,por`);
        lines.push(`#EXTVLCOPT:audio-desync=0`);
        lines.push(`#EXTVLCOPT:audio-time-stretch=true`);
        lines.push(`#EXTVLCOPT:spdif=eac3,ac3,dts,truehd`);
        lines.push(`#EXTVLCOPT:audio-replay-gain-mode=none`);
        lines.push(`#EXTVLCOPT:audio-channels=8`);
        lines.push(`#EXTVLCOPT:audio-sample-rate=48000`);
        lines.push(`#EXTVLCOPT:audio-bit-depth=24`);
        lines.push(`#EXTVLCOPT:audio-passthrough=true`);
        // 1.f ABR y bandwidth (10)
        lines.push(`#EXTVLCOPT:adaptive-maxwidth=${(_res796.split('x')[0]||7680)}`);
        lines.push(`#EXTVLCOPT:adaptive-maxheight=${(_res796.split('x')[1]||4320)}`);
        lines.push(`#EXTVLCOPT:adaptive-maxbw=${_bw796}`);
        lines.push(`#EXTVLCOPT:adaptive-logic=highest`);
        lines.push(`#EXTVLCOPT:adaptive-caching=true`);
        lines.push(`#EXTVLCOPT:adaptive-cache-size=5000`);
        lines.push(`#EXTVLCOPT:preferred-resolution=${_res796.split('x')[1]||4320}`);
        lines.push(`#EXTVLCOPT:network-synchronisation=1`);
        lines.push(`#EXTVLCOPT:auto-adjust-pts-delay=1`);
        lines.push(`#EXTVLCOPT:tls-session-resumption=true`);
        // 1.g Error resilience (10)
        lines.push(`#EXTVLCOPT:avcodec-error-resilience=1`);
        lines.push(`#EXTVLCOPT:avcodec-workaround-bugs=1`);
        lines.push(`#EXTVLCOPT:avcodec-error-concealment=motion_vector`);
        lines.push(`#EXTVLCOPT:avcodec-max-consecutive-errors=5`);
        lines.push(`#EXTVLCOPT:avcodec-skip-on-error=1`);
        lines.push(`#EXTVLCOPT:avcodec-loop-filter=1`);
        lines.push(`#EXTVLCOPT:avcodec-debug=0`);
        lines.push(`#EXTVLCOPT:ffmpeg-skip-frame=0`);
        lines.push(`#EXTVLCOPT:ffmpeg-skip-idct=0`);
        lines.push(`#EXTVLCOPT:ffmpeg-threads=0`);
        // 1.h Deinterlace y display (10)
        lines.push(`#EXTVLCOPT:deinterlace=1`);
        lines.push(`#EXTVLCOPT:deinterlace-mode=yadif2x`);
        lines.push(`#EXTVLCOPT:video-deco=1`);
        lines.push(`#EXTVLCOPT:sharpen-sigma=0.05`);
        lines.push(`#EXTVLCOPT:contrast=1.0`);
        lines.push(`#EXTVLCOPT:brightness=1.0`);
        lines.push(`#EXTVLCOPT:saturation=1.0`);
        lines.push(`#EXTVLCOPT:gamma=1.0`);
        lines.push(`#EXTVLCOPT:vout=opengl`);
        lines.push(`#EXTVLCOPT:swscale-mode=9`);
        // 1.i HDR tone-mapping (10)
        lines.push(`#EXTVLCOPT:tone-mapping=hable`);
        lines.push(`#EXTVLCOPT:tone-mapping-param=0.3`);
        lines.push(`#EXTVLCOPT:tone-mapping-peak=${_hdr796}`);
        lines.push(`#EXTVLCOPT:tone-mapping-desat=0`);
        lines.push(`#EXTVLCOPT:tone-mapping-mode=auto`);
        lines.push(`#EXTVLCOPT:hdr-peak-luminance=${_hdr796}`);
        lines.push(`#EXTVLCOPT:hdr-min-luminance=0.001`);
        lines.push(`#EXTVLCOPT:hdr-max-cll=10000`);
        lines.push(`#EXTVLCOPT:hdr-max-fall=400`);
        lines.push(`#EXTVLCOPT:hdr-color-gamut=bt2020`);
        // 1.j Red avanzada (10)
        lines.push(`#EXTVLCOPT:http-user-timeout=15000`);
        lines.push(`#EXTVLCOPT:server-port=443`);
        lines.push(`#EXTVLCOPT:network-caching-dscp=0`);
        lines.push(`#EXTVLCOPT:postproc-q=6`);
        lines.push(`#EXTVLCOPT:postproc-quality=6`);
        lines.push(`#EXTVLCOPT:avformat-options={analyzeduration:10000000,probesize:10000000,fflags:+genpts+igndts+discardcorrupt}`);
        lines.push(`#EXTVLCOPT:avcodec-options={gpu_decode:1,hw_deint:1,hw_scaler:1,threads:0,refcounted_frames:1}`);
        lines.push(`#EXTVLCOPT:ipv4=true`);
        lines.push(`#EXTVLCOPT:ipv6=true`);
        lines.push(`#EXTVLCOPT:prefer-ipv4=true`);
        // 1.k Subtítulos y metadata (10)
        lines.push(`#EXTVLCOPT:sub-track-id=-1`);
        lines.push(`#EXTVLCOPT:sub-language=none`);
        lines.push(`#EXTVLCOPT:sub-file=`);
        lines.push(`#EXTVLCOPT:sub-margin=30`);
        lines.push(`#EXTVLCOPT:sub-text-scale=100`);
        lines.push(`#EXTVLCOPT:sub-fps=${_fps796}`);
        lines.push(`#EXTVLCOPT:sub-delay=0`);
        lines.push(`#EXTVLCOPT:meta-title=${_chName}`);
        lines.push(`#EXTVLCOPT:meta-artist=APE_OMEGA_V5`);
        lines.push(`#EXTVLCOPT:meta-genre=${_ct796}`);
        // 1.l Parámetros de reproducción avanzados (14)
        lines.push(`#EXTVLCOPT:play-and-pause=false`);
        lines.push(`#EXTVLCOPT:play-and-stop=false`);
        lines.push(`#EXTVLCOPT:play-and-exit=false`);
        lines.push(`#EXTVLCOPT:repeat=false`);
        lines.push(`#EXTVLCOPT:loop=false`);
        lines.push(`#EXTVLCOPT:random=false`);
        lines.push(`#EXTVLCOPT:fullscreen=true`);
        lines.push(`#EXTVLCOPT:video-on-top=true`);
        lines.push(`#EXTVLCOPT:no-video-title-show=true`);
        lines.push(`#EXTVLCOPT:no-osd=true`);
        lines.push(`#EXTVLCOPT:no-stats=true`);
        lines.push(`#EXTVLCOPT:no-snapshot-preview=true`);
        lines.push(`#EXTVLCOPT:no-interact=true`);
        lines.push(`#EXTVLCOPT:no-quiet=false`);
        // L1 = 110 ✓

        // ══════════════════════════════════════════════════════════════════════
        // ── L2: EXTHTTP — JSON ADN Colosal enriquecido (1 línea) ─────────────
        // Integra build_exthttp() existente + campos OMEGA V5
        // ══════════════════════════════════════════════════════════════════════
        {
            const _exthttp_base = build_exthttp(cfg, profile, index, sessionId, reqId);
            let _exthttp_obj = {};
            try {
                const _match = _exthttp_base.match(/^#EXTHTTP:(.+)$/);
                if (_match) _exthttp_obj = JSON.parse(_match[1]);
            } catch(e) { _exthttp_obj = {}; }
            _exthttp_obj.sid                = _sid796;
            _exthttp_obj.uniqueness_nonce   = _nonce796;
            _exthttp_obj.paradigm           = 'OMNI-ORCHESTRATOR-V5-OMEGA';
            _exthttp_obj.quality_levels     = _ql796;
            _exthttp_obj.resilience         = {
                degradation_levels: 7,
                chain: ['CMAF+HEVC','HLS/fMP4+HEVC','HLS/fMP4+H264','HLS/TS+H264','HLS/TS+Baseline','TS_Direct','HTTP_Redirect'],
                buffer_strategy: 'ADAPTIVE_PREDICTIVE_NEURAL',
                anti_cut_engine: true,
                error_401: 'ESCALATE_CREDENTIALS',
                error_403: 'ROTATE_IDENTITY',
                error_429: 'SWARM_EVASION',
                error_5xx: 'FAILOVER_CDN'
            };
            _exthttp_obj.isp_evasion        = {
                mode: 'SWARM_PHANTOM_HYDRA_STEALTH',
                parallel_connections: 2048,
                doh_enabled: true,
                doh_provider: 'cloudflare',
                sni_obfuscation: true,
                traffic_morphing: true,
                dscp_qos: 'EF'
            };
            _exthttp_obj.ai_pipeline        = {
                lcevc_phase: 4,
                ai_sr: 'RealESRGAN_x4Plus',
                ai_frame_interp: 'RIFE_V4',
                ai_denoising: 'NLMEANS_HQDN3D_TEMPORAL',
                gpu_pipeline: 'DECODE_ITM_LCEVC_AI_SR_DENOISE_TONEMAP_RENDER'
            };
            if (!_exthttp_obj.headers) _exthttp_obj.headers = {};
            _exthttp_obj.headers['X-APE-SID']              = _sid796;
            _exthttp_obj.headers['X-APE-NONCE']            = _nonce796;
            _exthttp_obj.headers['X-APE-LCEVC-PHASE']      = '4';
            _exthttp_obj.headers['X-APE-HDR-PEAK-NITS']    = String(_hdr796);
            _exthttp_obj.headers['X-APE-CONTENT-TYPE']     = _ct796;
            _exthttp_obj.headers['X-APE-QUALITY-LEVELS']   = '7';
            _exthttp_obj.headers['X-APE-DEGRADATION-CHAIN']= 'CMAF+HEVC,HLS/fMP4+HEVC,HLS/fMP4+H264,HLS/TS+H264,HLS/TS+Baseline,TS_Direct,HTTP_Redirect';
            lines.push(`#EXTHTTP:${JSON.stringify(_exthttp_obj)}`);
        }
        // L2 = 1 ✓

        // ══════════════════════════════════════════════════════════════════════
        // ── L3: KODIPROP — Kodi InputStream Adaptive (65 líneas) ─────────────
        // ══════════════════════════════════════════════════════════════════════
        // 3.a Manifest y stream selection (5)
        lines.push(`#KODIPROP:inputstream.adaptive.manifest_type=hls`);
        lines.push(`#KODIPROP:inputstream.adaptive.stream_selection_type=ask-quality`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_handling=force_hdr`);
        lines.push(`#KODIPROP:inputstream.adaptive.manifest_update_parameter=full`);
        lines.push(`#KODIPROP:inputstream.adaptive.manifest_headers=User-Agent=${_ua796}`);
        // 3.b Hardware decode y calidad (10)
        lines.push(`#KODIPROP:inputstream.adaptive.play_timeshift_buffer=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.max_bandwidth=${Math.round(_bw796/1000)}`);
        lines.push(`#KODIPROP:inputstream.adaptive.min_bandwidth=128`);
        lines.push(`#KODIPROP:inputstream.adaptive.bandwidth_limit_factor=1.0`);
        lines.push(`#KODIPROP:inputstream.adaptive.chooser_resolution_max=${_res796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.chooser_resolution_secure_max=${_res796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.chooser_resolution_min=426x240`);
        lines.push(`#KODIPROP:inputstream.adaptive.chooser_bandwidth_max=2147483647`);
        lines.push(`#KODIPROP:inputstream.adaptive.chooser_bandwidth_min=128`);
        lines.push(`#KODIPROP:inputstream.adaptive.chooser_type=adaptive`);
        // 3.c HDR y color (10)
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_type=hdr10`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_peak_luminance=${_hdr796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_color_space=bt2020`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_transfer_function=smpte2084`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_color_primaries=bt2020`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_matrix_coefficients=bt2020nc`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_max_cll=10000`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_max_fall=400`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_min_luminance=0.001`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_dolby_vision=true`);
        // 3.d Audio pipeline (10)
        lines.push(`#KODIPROP:inputstream.adaptive.audio_language_preference=eng,spa,por`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_track_selection=best`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_passthrough_earc=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_codec_preference=eac3,ac3,aac`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_channels_max=8`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_sample_rate=48000`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_bitdepth=24`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_atmos_enabled=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_dts_enabled=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_truehd_enabled=true`);
        // 3.e DRM y seguridad (10)
        lines.push(`#KODIPROP:inputstream.adaptive.license_type=com.widevine.alpha`);
        lines.push(`#KODIPROP:inputstream.adaptive.license_key=`);
        lines.push(`#KODIPROP:inputstream.adaptive.license_flags=persistent_storage`);
        lines.push(`#KODIPROP:inputstream.adaptive.server_certificate=`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_legacy=false`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_security_level=L1`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_max_decode_width=${(_res796.split('x')[0]||7680)}`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_max_decode_height=${(_res796.split('x')[1]||4320)}`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_widevine_enforce=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_fairplay_enforce=true`);
        // 3.f VRR y sincronización (10)
        lines.push(`#KODIPROP:inputstream.adaptive.vrr_sync=enabled`);
        lines.push(`#KODIPROP:inputstream.adaptive.auto_match_source_fps=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.refresh_rate_override=${_fps796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.frame_rate_match=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.sport_mode_boost=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.low_latency_mode=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.live_edge_segments=2`);
        lines.push(`#KODIPROP:inputstream.adaptive.segment_timeshift=false`);
        lines.push(`#KODIPROP:inputstream.adaptive.timeshift_buffer_depth=0`);
        lines.push(`#KODIPROP:inputstream.adaptive.live_delay=0`);
        // 3.g User-agent y headers (10)
        lines.push(`#KODIPROP:inputstream.adaptive.user_agent=${_ua796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=${_ua796}&X-APE-SID=${_sid796}&X-APE-NONCE=${_nonce796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.license_headers=User-Agent=${_ua796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.media_headers=User-Agent=${_ua796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.segment_headers=User-Agent=${_ua796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.init_headers=User-Agent=${_ua796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.key_headers=User-Agent=${_ua796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.manifest_type=hls`);
        lines.push(`#KODIPROP:inputstream.adaptive.play_timeshift_buffer=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.ssl_verify_peer=false`);
        // L3 = 65 ✓

        // ══════════════════════════════════════════════════════════════════════
        // ── L4: EXT-X-CMAF — Pipeline CMAF/fMP4 Latencia Cero (25 líneas) ────
        // ══════════════════════════════════════════════════════════════════════
        lines.push(`#EXT-X-CMAF:CONTAINER=fMP4,SEGMENT=4,LATENCY=ZERO`);
        lines.push(`#EXT-X-CMAF-HOLD-BACK:0`);
        lines.push(`#EXT-X-CMAF-PART-HOLD-BACK:0`);
        lines.push(`#EXT-X-CMAF-PART-TARGET:0.5`);
        lines.push(`#EXT-X-CMAF-CODECS:${_codec796 === 'hevc' ? 'hev1.1.6.L180.B0,mp4a.40.2' : 'avc1.640028,mp4a.40.2'}`);
        lines.push(`#EXT-X-CMAF-FALLBACK-1:HLS_FMP4_HEVC`);
        lines.push(`#EXT-X-CMAF-FALLBACK-2:HLS_FMP4_H264`);
        lines.push(`#EXT-X-CMAF-FALLBACK-3:HLS_TS_H264`);
        lines.push(`#EXT-X-CMAF-FALLBACK-4:HLS_TS_BASELINE`);
        lines.push(`#EXT-X-CMAF-FALLBACK-5:TS_DIRECT`);
        lines.push(`#EXT-X-CMAF-FALLBACK-6:HTTP_REDIRECT`);
        lines.push(`#EXT-X-CMAF-FALLBACK-7:AUDIO_ONLY`);
        lines.push(`#EXT-X-CMAF-HDR:HDR10_PLUS,DOLBY_VISION,HLG`);
        lines.push(`#EXT-X-CMAF-AUDIO:EAC3,AC3,AAC,ATMOS,DTS,TRUEHD`);
        lines.push(`#EXT-X-CMAF-ENCRYPTION:CBCS,CENC`);
        lines.push(`#EXT-X-CMAF-SEGMENT-FORMAT:fMP4`);
        lines.push(`#EXT-X-CMAF-INIT-SEGMENT:init.mp4`);
        lines.push(`#EXT-X-CMAF-BYTE-RANGE:true`);
        lines.push(`#EXT-X-CMAF-INDEPENDENT-SEGMENTS:true`);
        lines.push(`#EXT-X-CMAF-PROGRAM-DATE-TIME:true`);
        lines.push(`#EXT-X-CMAF-DISCONTINUITY-SEQUENCE:0`);
        lines.push(`#EXT-X-CMAF-MEDIA-SEQUENCE:0`);
        lines.push(`#EXT-X-CMAF-TARGETDURATION:4`);
        lines.push(`#EXT-X-CMAF-VERSION:7`);
        lines.push(`#EXT-X-CMAF-PLAYLIST-TYPE:EVENT`);
        // L4 = 25 ✓

        // ══════════════════════════════════════════════════════════════════════
        // ── L5: EXT-X-APE-HDR-DV — Override HDR10+/Dolby Vision (45 líneas) ──
        // ══════════════════════════════════════════════════════════════════════
        lines.push(`#EXT-X-APE-HDR-DV:PEAK=${_hdr796}nits,PROFILE=8.1,LEVEL=6,CM=v4.0`);
        lines.push(`#EXT-X-APE-HDR-DV-LCEVC-PHASE:4`);
        lines.push(`#EXT-X-APE-HDR-DV-AI-SR:RealESRGAN_x4Plus`);
        lines.push(`#EXT-X-APE-HDR-DV-FRAME-INTERP:RIFE_V4`);
        lines.push(`#EXT-X-APE-HDR-DV-PEAK-LUMINANCE:${_hdr796}`);
        lines.push(`#EXT-X-APE-HDR-DV-MIN-LUMINANCE:0.0005`);
        lines.push(`#EXT-X-APE-HDR-DV-MAX-CLL:10000`);
        lines.push(`#EXT-X-APE-HDR-DV-MAX-FALL:400`);
        lines.push(`#EXT-X-APE-HDR-DV-COLOR-SPACE:BT.2020`);
        lines.push(`#EXT-X-APE-HDR-DV-TRANSFER:SMPTE-ST-2084`);
        lines.push(`#EXT-X-APE-HDR-DV-PRIMARIES:BT.2020`);
        lines.push(`#EXT-X-APE-HDR-DV-MATRIX:BT.2020nc`);
        lines.push(`#EXT-X-APE-HDR-DV-CHROMA:4:4:4`);
        lines.push(`#EXT-X-APE-HDR-DV-BIT-DEPTH:10`);
        lines.push(`#EXT-X-APE-HDR-DV-PIXEL-FORMAT:yuv444p10le`);
        lines.push(`#EXT-X-APE-HDR-DV-TONE-MAP:BT2446a,BT2390`);
        lines.push(`#EXT-X-APE-HDR-DV-GAMUT:DCI-P3,BT.2020`);
        lines.push(`#EXT-X-APE-HDR-DV-STATIC-METADATA:enabled`);
        lines.push(`#EXT-X-APE-HDR-DV-DYNAMIC-METADATA:HDR10+,DV-RPU`);
        lines.push(`#EXT-X-APE-HDR-DV-MASTERING:G(0.265,0.690)B(0.150,0.060)R(0.680,0.320)WP(0.3127,0.3290)L(${_hdr796},0.001)`);
        lines.push(`#EXT-X-APE-HDR-DV-CONTENT-LIGHT:${_hdr796},400`);
        lines.push(`#EXT-X-APE-HDR-DV-AMBIENT:DIM`);
        lines.push(`#EXT-X-APE-HDR-DV-REFERENCE-WHITE:203nits`);
        lines.push(`#EXT-X-APE-HDR-DV-GAMMA:2.4`);
        lines.push(`#EXT-X-APE-HDR-DV-LOCAL-DIMMING:AGGRESSIVE-FULL-ARRAY`);
        lines.push(`#EXT-X-APE-HDR-DV-SPECULAR:QUANTUM`);
        lines.push(`#EXT-X-APE-HDR-DV-BLOOM:NATURAL`);
        lines.push(`#EXT-X-APE-HDR-DV-FILM-GRAIN:NEURAL-MPEG`);
        lines.push(`#EXT-X-APE-HDR-DV-DEBAND:GRADFUN`);
        lines.push(`#EXT-X-APE-HDR-DV-SHARPENING:CAS`);
        lines.push(`#EXT-X-APE-HDR-DV-DEINTERLACE:BWDIF`);
        lines.push(`#EXT-X-APE-HDR-DV-VMAF-TARGET:95`);
        lines.push(`#EXT-X-APE-HDR-DV-PSNR-TARGET:42`);
        lines.push(`#EXT-X-APE-HDR-DV-MS-SSIM-TARGET:0.97`);
        lines.push(`#EXT-X-APE-HDR-DV-10PLUS-VERSION:2.0`);
        lines.push(`#EXT-X-APE-HDR-DV-10PLUS-APPLICATION:4`);
        lines.push(`#EXT-X-APE-HDR-DV-HLG-PEAK:4000`);
        lines.push(`#EXT-X-APE-HDR-DV-HLG-GAMMA:1.2`);
        lines.push(`#EXT-X-APE-HDR-DV-HLG-REF-WHITE:203`);
        lines.push(`#EXT-X-APE-HDR-DV-HLG-DUAL-MODE:true`);
        lines.push(`#EXT-X-APE-HDR-DV-GPU-TONEMAP:libplacebo+vulkan`);
        lines.push(`#EXT-X-APE-HDR-DV-ST2094-10:true`);
        lines.push(`#EXT-X-APE-HDR-DV-ST2094-40:true`);
        lines.push(`#EXT-X-APE-HDR-DV-CROSS-COMPAT:true`);
        lines.push(`#EXT-X-APE-HDR-DV-OUTPUT-MODE:auto`);
        // L5 = 45 ✓

        // ══════════════════════════════════════════════════════════════════════
        // ── L6: EXT-X-APE-TELCHEMY — Telemetría QoS/QoE (10 líneas) ─────────
        // ══════════════════════════════════════════════════════════════════════
        lines.push(`#EXT-X-APE-TELCHEMY:VSTQ=50,EPSNR=45,MOS=4.8,JITTER=0,LOSS=0`);
        lines.push(`#EXT-X-APE-TELCHEMY-QOS:DSCP=EF,PRIORITY=HIGHEST,CLASS=REALTIME`);
        lines.push(`#EXT-X-APE-TELCHEMY-QOE:VMAF=${cfg.vmaf_target||95},PSNR=42,SSIM=0.97`);
        lines.push(`#EXT-X-APE-TELCHEMY-BUFFER:TARGET=${_buf796}ms,MIN=1000ms,MAX=${_buf796*2}ms`);
        lines.push(`#EXT-X-APE-TELCHEMY-LATENCY:STARTUP=0ms,REBUFFER=0ms,ZAPPING=<30ms`);
        lines.push(`#EXT-X-APE-TELCHEMY-BITRATE:TARGET=${Math.round(_bw796/1000)}kbps,MIN=128kbps,PEAK=UNLIMITED`);
        lines.push(`#EXT-X-APE-TELCHEMY-CODEC:PRIMARY=${_codec796.toUpperCase()},FALLBACK=H264,AUDIO=EAC3`);
        lines.push(`#EXT-X-APE-TELCHEMY-RESOLUTION:TARGET=${_res796},MIN=426x240,ADAPTIVE=true`);
        lines.push(`#EXT-X-APE-TELCHEMY-AVAILABILITY:TARGET=99.999%,FAILOVER=<60ms`);
        lines.push(`#EXT-X-APE-TELCHEMY-SID:${_sid796}`);
        // L6 = 10 ✓

        // ══════════════════════════════════════════════════════════════════════
        // ── L7: EXTATTRFROMURL — Puente Matemático L2-L7 (53 líneas) ─────────
        // ══════════════════════════════════════════════════════════════════════
        // 7.a Identidad y sesión (8)
        lines.push(`#EXTATTRFROMURL:SID=${_sid796}`);
        lines.push(`#EXTATTRFROMURL:NONCE=${_nonce796}`);
        lines.push(`#EXTATTRFROMURL:PROFILE=${profile}`);
        lines.push(`#EXTATTRFROMURL:CONTENT-TYPE=${_ct796}`);
        lines.push(`#EXTATTRFROMURL:CHANNEL-ID=${_chId}`);
        lines.push(`#EXTATTRFROMURL:CHANNEL-NAME=${_chName}`);
        lines.push(`#EXTATTRFROMURL:SESSION-ID=${sessionId}`);
        lines.push(`#EXTATTRFROMURL:REQUEST-ID=${reqId}`);
        // 7.b Codec y calidad (8)
        lines.push(`#EXTATTRFROMURL:CODEC=${_codec796}`);
        lines.push(`#EXTATTRFROMURL:RESOLUTION=${_res796}`);
        lines.push(`#EXTATTRFROMURL:FPS=${_fps796}`);
        lines.push(`#EXTATTRFROMURL:HDR-PEAK=${_hdr796}`);
        lines.push(`#EXTATTRFROMURL:BITRATE=${Math.round(_bw796/1000)}kbps`);
        lines.push(`#EXTATTRFROMURL:BUFFER=${_buf796}ms`);
        lines.push(`#EXTATTRFROMURL:LCEVC-PHASE=4`);
        lines.push(`#EXTATTRFROMURL:AI-SR=RealESRGAN_x4Plus`);
        // 7.c Evasión y spoof (8)
        lines.push(`#EXTATTRFROMURL:UA=${_ua796}`);
        lines.push(`#EXTATTRFROMURL:SPOOF-DEVICE=SHIELD_TV_PRO_2023`);
        lines.push(`#EXTATTRFROMURL:SPOOF-OS=Android_12`);
        lines.push(`#EXTATTRFROMURL:SPOOF-PLAYER=ExoPlayer_2.18`);
        lines.push(`#EXTATTRFROMURL:DNS-PRIMARY=1.1.1.1`);
        lines.push(`#EXTATTRFROMURL:DNS-SECONDARY=8.8.8.8`);
        lines.push(`#EXTATTRFROMURL:SNI-FRONT=cloudflare.com`);
        lines.push(`#EXTATTRFROMURL:DPI-EVASION=SANDVINE_BYPASS`);
        // 7.d DRM y seguridad (7)
        lines.push(`#EXTATTRFROMURL:DRM=WIDEVINE_L1`);
        lines.push(`#EXTATTRFROMURL:DRM-FALLBACK=CLEARKEY`);
        lines.push(`#EXTATTRFROMURL:ENCRYPTION=CBCS`);
        lines.push(`#EXTATTRFROMURL:TLS=1.3`);
        lines.push(`#EXTATTRFROMURL:CERT-PINNING=true`);
        lines.push(`#EXTATTRFROMURL:HSTS=true`);
        lines.push(`#EXTATTRFROMURL:OCSP-STAPLING=true`);
        // 7.e Transporte y red (7)
        lines.push(`#EXTATTRFROMURL:TRANSPORT=HLS_FMP4`);
        lines.push(`#EXTATTRFROMURL:CONTAINER=fMP4`);
        lines.push(`#EXTATTRFROMURL:SEGMENT-DURATION=4s`);
        lines.push(`#EXTATTRFROMURL:INIT-SEGMENT=init.mp4`);
        lines.push(`#EXTATTRFROMURL:BYTE-RANGE=true`);
        lines.push(`#EXTATTRFROMURL:HTTP2=true`);
        lines.push(`#EXTATTRFROMURL:HTTP3=true`);
        // 7.f Idempotencia y cache (7)
        lines.push(`#EXTATTRFROMURL:CACHE-KEY=APE_SID_${_sid796}`);
        lines.push(`#EXTATTRFROMURL:CACHE-TTL=3600`);
        lines.push(`#EXTATTRFROMURL:CACHE-STRATEGY=STALE_WHILE_REVALIDATE`);
        lines.push(`#EXTATTRFROMURL:IDEMPOTENT=true`);
        lines.push(`#EXTATTRFROMURL:RETRY-STRATEGY=EXPONENTIAL_BACKOFF`);
        lines.push(`#EXTATTRFROMURL:MAX-RETRIES=5`);
        lines.push(`#EXTATTRFROMURL:TIMEOUT=15000ms`);
        // 7.g Calidad adaptativa (8)
        lines.push(`#EXTATTRFROMURL:ABR=HIGHEST`);
        lines.push(`#EXTATTRFROMURL:ABR-LOCK=NATIVE_MAX`);
        lines.push(`#EXTATTRFROMURL:QUALITY-LEVELS=7`);
        lines.push(`#EXTATTRFROMURL:DEGRADATION-CHAIN=CMAF+HEVC,HLS/fMP4+HEVC,HLS/fMP4+H264,HLS/TS+H264,HLS/TS+Baseline,TS_Direct,HTTP_Redirect`);
        lines.push(`#EXTATTRFROMURL:VMAF-TARGET=95`);
        lines.push(`#EXTATTRFROMURL:PSNR-TARGET=42`);
        lines.push(`#EXTATTRFROMURL:SSIM-TARGET=0.97`);
        lines.push(`#EXTATTRFROMURL:ANTI-CUT-ENGINE=true`);
        // L7 = 53 ✓

        // ══════════════════════════════════════════════════════════════════════
        // ── L8: EXT-X-APE-* NÚCLEO CRYSTAL (470 líneas) ─────────────────────
        // ══════════════════════════════════════════════════════════════════════
        // 8.a Buffer Nuclear (20)
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR:TARGET=${_buf796}ms,STRATEGY=ADAPTIVE_PREDICTIVE_NEURAL`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-NETWORK:${_nbuf796}ms`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-LIVE:${_lbuf796}ms`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-FILE:${_fbuf796}ms`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-PLAYER:${cfg.player_buffer_ms||_buf796}ms`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-PREFETCH:${cfg.prefetch_buffer_target||_buf796}ms`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-SEGMENTS:${cfg.prefetch_segments||10}`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-PARALLEL:${cfg.prefetch_parallel||4}`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-MIN-BW:${cfg.prefetch_min_bandwidth||1000000}`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-ANTI-STARVATION:true`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-ANTI-FREEZE:true`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-ANTI-REBUFFER:true`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-ANTI-STALL:true`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-ANTI-PIXELATION:true`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-ANTI-ARTIFACT:true`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-ANTI-TEARING:true`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-ANTI-JUDDER:true`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-ANTI-BLUR:true`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-ANTI-GHOSTING:true`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-WATCHDOG:MANIFEST=30s,FREEZE=10s`);
        // 8.b BBR Hijacking (20)
        lines.push(`#EXT-X-APE-BBR-HIJACK:ENABLED,ALGORITHM=BBR_V3`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-BW:MAX=${_bw796},MIN=${cfg.min_bandwidth||1000000}`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-RTT:TARGET=1ms,MAX=50ms`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-PACING:RATE=${Math.round(_bw796*1.25)}`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-CWND:GAIN=2.89,DRAIN=0.75`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-PROBE-BW:ENABLED`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-PROBE-RTT:ENABLED`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-STARTUP:GAIN=2.89`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-DRAIN:GAIN=0.35`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-FULL-BW:THRESHOLD=1.25`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-INFLIGHT:CAP=3`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-LOSS-THRESH:0.02`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-ECN:ENABLED`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-QUIC:ENABLED`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-HTTP2:ENABLED`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-HTTP3:ENABLED`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-TCP-NODELAY:true`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-TCP-QUICKACK:true`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-TCP-WINDOW:4194304`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-KEEPALIVE:MAX=200,TIMEOUT=120`);
        // 8.c DSCP QoS (10)
        lines.push(`#EXT-X-APE-QOS-DSCP:EF`);
        lines.push(`#EXT-X-APE-QOS-DSCP-VALUE:46`);
        lines.push(`#EXT-X-APE-QOS-PRIORITY:HIGHEST`);
        lines.push(`#EXT-X-APE-QOS-CLASS:REALTIME`);
        lines.push(`#EXT-X-APE-QOS-TRAFFIC-CLASS:INTERACTIVE_VIDEO`);
        lines.push(`#EXT-X-APE-QOS-BURST-MODE:ENABLED`);
        lines.push(`#EXT-X-APE-QOS-BURST-FACTOR:1.5x`);
        lines.push(`#EXT-X-APE-QOS-BURST-DURATION:999999s`);
        lines.push(`#EXT-X-APE-QOS-PARALLEL-STREAMS:4`);
        lines.push(`#EXT-X-APE-QOS-SEGMENT-PIPELINE:4`);
        // 8.d Phantom Hydra Core (20)
        lines.push(`#EXT-X-APE-PHANTOM-HYDRA:ROTATION=ORGANIC,DNS=DOH_CLOUDFLARE,SNI=OBFUSCATED`);
        lines.push(`#EXT-X-APE-PHANTOM-HYDRA-VERSION:5.0-OMEGA`);
        lines.push(`#EXT-X-APE-PHANTOM-HYDRA-NONCE:${_nonce796}`);
        lines.push(`#EXT-X-APE-PHANTOM-UA-ROTATION:ENABLED`);
        lines.push(`#EXT-X-APE-PHANTOM-UA-ACTIVE:${_ua796}`);
        lines.push(`#EXT-X-APE-PHANTOM-DEVICE-SPOOF:SHIELD_TV_PRO_2023`);
        lines.push(`#EXT-X-APE-PHANTOM-SNI-OBFUSCATION:ENABLED`);
        lines.push(`#EXT-X-APE-PHANTOM-SNI-FRONT-DOMAIN:cloudflare.com`);
        lines.push(`#EXT-X-APE-PHANTOM-DOH-SERVER:1.1.1.1`);
        lines.push(`#EXT-X-APE-PHANTOM-SWARM-SIZE:2048`);
        lines.push(`#EXT-X-APE-PHANTOM-SWARM-STRATEGY:HYDRA_MULTI_IP`);
        lines.push(`#EXT-X-APE-PHANTOM-TRAFFIC-MORPH:ENABLED`);
        lines.push(`#EXT-X-APE-PHANTOM-TRAFFIC-DISGUISE:HTTPS_GOOGLE_APIS`);
        lines.push(`#EXT-X-APE-PHANTOM-IDEMPOTENT-STATE:LOCKED`);
        lines.push(`#EXT-X-APE-PHANTOM-IP-ROTATION:SWARM_2048`);
        lines.push(`#EXT-X-APE-PHANTOM-DPI-EVASION:SANDVINE_BYPASS`);
        lines.push(`#EXT-X-APE-PHANTOM-FINGERPRINT:RANDOMIZED`);
        lines.push(`#EXT-X-APE-PHANTOM-TIMING-JITTER:ENABLED`);
        lines.push(`#EXT-X-APE-PHANTOM-PACKET-SIZE-MORPH:ENABLED`);
        lines.push(`#EXT-X-APE-PHANTOM-PROTOCOL-OBFUSCATION:HTTPS_MIMICRY`);
        // 8.e Codec Priority (20)
        lines.push(`#EXT-X-APE-CODEC-PRIORITY:hevc,hev1,hvc1,h265,av1,h264,avc1`);
        lines.push(`#EXT-X-APE-CODEC-PRIMARY:${_codec796}`);
        lines.push(`#EXT-X-APE-CODEC-FALLBACK-1:av1`);
        lines.push(`#EXT-X-APE-CODEC-FALLBACK-2:h264`);
        lines.push(`#EXT-X-APE-CODEC-FALLBACK-3:mpeg2video`);
        lines.push(`#EXT-X-APE-CODEC-PROFILE:MAIN10`);
        lines.push(`#EXT-X-APE-CODEC-TIER:HIGH`);
        lines.push(`#EXT-X-APE-CODEC-LEVEL:${_codec796 === 'hevc' ? '6.1' : '5.1'}`);
        lines.push(`#EXT-X-APE-CODEC-PIXEL-FORMAT:yuv444p12le`);
        lines.push(`#EXT-X-APE-CODEC-COLOR-DEPTH:12bit`);
        lines.push(`#EXT-X-APE-CODEC-COLOR-SPACE:bt2020`);
        lines.push(`#EXT-X-APE-CODEC-IGNORE-SCREEN-RESOLUTION:true`);
        lines.push(`#EXT-X-APE-CODEC-HDR-PIPELINE:FORCE_12BIT_MAIN10_OVERDRIVE`);
        lines.push(`#EXT-X-APE-CODEC-MAX-PEAK-LUMINANCE:${_hdr796}`);
        lines.push(`#EXT-X-APE-CODEC-VIDEO-SCALER:vdpau,opengl,cuda`);
        lines.push(`#EXT-X-APE-CODEC-SHARPEN-SIGMA:0.01`);
        lines.push(`#EXT-X-APE-CODEC-ARTIFACT-DEBLOCKING:extreme`);
        lines.push(`#EXT-X-APE-CODEC-NOISE-REDUCTION:nlmeans+hqdn3d`);
        lines.push(`#EXT-X-APE-CODEC-HARDWARE-EXTRACT-MAX:true`);
        lines.push(`#EXT-X-APE-CODEC-VVC-FALLBACK:HEVC`);
        // 8.f Resilience 7 niveles (20)
        lines.push(`#EXT-X-APE-RESILIENCE:LEVELS=7,STRATEGY=ADAPTIVE_PREDICTIVE_NEURAL`);
        lines.push(`#EXT-X-APE-RESILIENCE-LEVEL-1:CMAF+HEVC`);
        lines.push(`#EXT-X-APE-RESILIENCE-LEVEL-2:HLS/fMP4+HEVC`);
        lines.push(`#EXT-X-APE-RESILIENCE-LEVEL-3:HLS/fMP4+H264`);
        lines.push(`#EXT-X-APE-RESILIENCE-LEVEL-4:HLS/TS+H264`);
        lines.push(`#EXT-X-APE-RESILIENCE-LEVEL-5:HLS/TS+Baseline`);
        lines.push(`#EXT-X-APE-RESILIENCE-LEVEL-6:TS_Direct`);
        lines.push(`#EXT-X-APE-RESILIENCE-LEVEL-7:HTTP_Redirect`);
        lines.push(`#EXT-X-APE-RESILIENCE-RECONNECT:TIMEOUT=${cfg.reconnect_timeout_ms||30000}ms`);
        lines.push(`#EXT-X-APE-RESILIENCE-RECONNECT-MAX:${cfg.reconnect_max_attempts||999}`);
        lines.push(`#EXT-X-APE-RESILIENCE-RECONNECT-DELAY:${cfg.reconnect_delay_ms||100}ms`);
        lines.push(`#EXT-X-APE-RESILIENCE-FAILOVER:CDN_ROTATION`);
        lines.push(`#EXT-X-APE-RESILIENCE-ANTI-CUT:true`);
        lines.push(`#EXT-X-APE-RESILIENCE-WATCHDOG:true`);
        lines.push(`#EXT-X-APE-RESILIENCE-HEARTBEAT:5s`);
        lines.push(`#EXT-X-APE-RESILIENCE-MANIFEST-REFRESH:30s`);
        lines.push(`#EXT-X-APE-RESILIENCE-SEGMENT-RETRY:5`);
        lines.push(`#EXT-X-APE-RESILIENCE-MANIFEST-RETRY:3`);
        lines.push(`#EXT-X-APE-RESILIENCE-AVAILABILITY:99.999%`);
        lines.push(`#EXT-X-APE-RESILIENCE-FAILOVER-TIME:<60ms`);
        // 8.g Spoof y evasión (20)
        lines.push(`#EXT-X-APE-SPOOF:DEVICE=SHIELD_TV_PRO_2023,OS=Android_12,PLAYER=ExoPlayer_2.18`);
        lines.push(`#EXT-X-APE-SPOOF-UA:${_ua796}`);
        lines.push(`#EXT-X-APE-SPOOF-IP:CDN_POOL`);
        lines.push(`#EXT-X-APE-SPOOF-REFERER:${channel.url||''}`);
        lines.push(`#EXT-X-APE-SPOOF-ORIGIN:${channel.url||''}`);
        lines.push(`#EXT-X-APE-SPOOF-ACCEPT:application/vnd.apple.mpegurl,*/*`);
        lines.push(`#EXT-X-APE-SPOOF-ACCEPT-LANGUAGE:en-US,en;q=0.9`);
        lines.push(`#EXT-X-APE-SPOOF-ACCEPT-ENCODING:identity`);
        lines.push(`#EXT-X-APE-SPOOF-SEC-FETCH-DEST:media`);
        lines.push(`#EXT-X-APE-SPOOF-SEC-FETCH-MODE:no-cors`);
        lines.push(`#EXT-X-APE-SPOOF-SEC-FETCH-SITE:same-origin`);
        lines.push(`#EXT-X-APE-SPOOF-CONNECTION:keep-alive`);
        lines.push(`#EXT-X-APE-SPOOF-CACHE-CONTROL:no-cache`);
        lines.push(`#EXT-X-APE-SPOOF-PRAGMA:no-cache`);
        lines.push(`#EXT-X-APE-SPOOF-DNT:0`);
        lines.push(`#EXT-X-APE-SPOOF-SEC-GPC:0`);
        lines.push(`#EXT-X-APE-SPOOF-TE:trailers`);
        lines.push(`#EXT-X-APE-SPOOF-UPGRADE:0`);
        lines.push(`#EXT-X-APE-SPOOF-TIMING-JITTER:ENABLED`);
        lines.push(`#EXT-X-APE-SPOOF-PACKET-SIZE:RANDOMIZED`);
        // 8.h DRM (20)
        lines.push(`#EXT-X-APE-DRM:WIDEVINE_L1,FAIRPLAY,CLEARKEY`);
        lines.push(`#EXT-X-APE-DRM-WIDEVINE:ENFORCE=true,LEVEL=L1`);
        lines.push(`#EXT-X-APE-DRM-FAIRPLAY:ENFORCE=true`);
        lines.push(`#EXT-X-APE-DRM-CLEARKEY:FALLBACK=true`);
        lines.push(`#EXT-X-APE-DRM-ENCRYPTION:CBCS`);
        lines.push(`#EXT-X-APE-DRM-ENCRYPTION-FALLBACK:CENC`);
        lines.push(`#EXT-X-APE-DRM-PSSH:true`);
        lines.push(`#EXT-X-APE-DRM-TENC:true`);
        lines.push(`#EXT-X-APE-DRM-SENC:true`);
        lines.push(`#EXT-X-APE-DRM-EMSG:true`);
        lines.push(`#EXT-X-APE-DRM-PERSISTENT-STORAGE:true`);
        lines.push(`#EXT-X-APE-DRM-SECURITY-LEVEL:L1`);
        lines.push(`#EXT-X-APE-DRM-MAX-DECODE-WIDTH:${(_res796.split('x')[0]||7680)}`);
        lines.push(`#EXT-X-APE-DRM-MAX-DECODE-HEIGHT:${(_res796.split('x')[1]||4320)}`);
        lines.push(`#EXT-X-APE-DRM-HDCP:2.3`);
        lines.push(`#EXT-X-APE-DRM-HDCP-FALLBACK:2.2`);
        lines.push(`#EXT-X-APE-DRM-OUTPUT-PROTECTION:true`);
        lines.push(`#EXT-X-APE-DRM-ANALOG-OUTPUT:DISABLED`);
        lines.push(`#EXT-X-APE-DRM-DIGITAL-OUTPUT:ENABLED`);
        lines.push(`#EXT-X-APE-DRM-COMMON-ENCRYPTION:true`);
        // 8.i Cortex AI (20)
        lines.push(`#EXT-X-APE-CORTEX-AI:ENABLED,VERSION=5.0-OMEGA`);
        lines.push(`#EXT-X-APE-CORTEX-AI-SR:RealESRGAN_x4Plus`);
        lines.push(`#EXT-X-APE-CORTEX-AI-FRAME-INTERP:RIFE_V4`);
        lines.push(`#EXT-X-APE-CORTEX-AI-DENOISING:NLMEANS_HQDN3D_TEMPORAL`);
        lines.push(`#EXT-X-APE-CORTEX-AI-DEBLOCKING:EXTREME`);
        lines.push(`#EXT-X-APE-CORTEX-AI-ARTIFACT-REMOVAL:true`);
        lines.push(`#EXT-X-APE-CORTEX-AI-COLOR-ENHANCEMENT:true`);
        lines.push(`#EXT-X-APE-CORTEX-AI-SHARPENING:ADAPTIVE`);
        lines.push(`#EXT-X-APE-CORTEX-AI-HDR-UPCONVERT:SDR_TO_HDR10_PLUS`);
        lines.push(`#EXT-X-APE-CORTEX-AI-VMAF-TARGET:${cfg.vmaf_target||95}`);
        lines.push(`#EXT-X-APE-CORTEX-AI-CONTENT-AWARE:true`);
        lines.push(`#EXT-X-APE-CORTEX-AI-PERCEPTUAL-QUALITY:SSIM+VMAF`);
        lines.push(`#EXT-X-APE-CORTEX-AI-PRECISION:FP16`);
        lines.push(`#EXT-X-APE-CORTEX-AI-BATCH-SIZE:1`);
        lines.push(`#EXT-X-APE-CORTEX-AI-TILE-SIZE:256`);
        lines.push(`#EXT-X-APE-CORTEX-AI-OVERLAP:32`);
        lines.push(`#EXT-X-APE-CORTEX-AI-MOTION-ESTIMATION:OPTICAL-FLOW`);
        lines.push(`#EXT-X-APE-CORTEX-AI-SCENE-DETECTION:true`);
        lines.push(`#EXT-X-APE-CORTEX-AI-CONTENT-TYPE:${_ct796}`);
        lines.push(`#EXT-X-APE-CORTEX-AI-GPU-PIPELINE:DECODE_ITM_LCEVC_AI_SR_DENOISE_TONEMAP_RENDER`);
        // 8.j Audio Pipeline (20)
        lines.push(`#EXT-X-APE-AUDIO:ATMOS,DTS-X,TRUEHD,EAC3,AC3,AAC`);
        lines.push(`#EXT-X-APE-AUDIO-CHANNELS:8`);
        lines.push(`#EXT-X-APE-AUDIO-SAMPLE-RATE:48000`);
        lines.push(`#EXT-X-APE-AUDIO-BIT-DEPTH:24`);
        lines.push(`#EXT-X-APE-AUDIO-PASSTHROUGH:EARC_STRICT`);
        lines.push(`#EXT-X-APE-AUDIO-CODEC-PREFERENCE:eac3,ac3,aac`);
        lines.push(`#EXT-X-APE-AUDIO-LANGUAGE:eng,spa,por`);
        lines.push(`#EXT-X-APE-AUDIO-TRACK-SELECTION:best`);
        lines.push(`#EXT-X-APE-AUDIO-ATMOS:ENABLED`);
        lines.push(`#EXT-X-APE-AUDIO-DTS:ENABLED`);
        lines.push(`#EXT-X-APE-AUDIO-TRUEHD:ENABLED`);
        lines.push(`#EXT-X-APE-AUDIO-DESYNC:0`);
        lines.push(`#EXT-X-APE-AUDIO-REPLAY-GAIN:NONE`);
        lines.push(`#EXT-X-APE-AUDIO-TIME-STRETCH:true`);
        lines.push(`#EXT-X-APE-AUDIO-STEREO-MODE:0`);
        lines.push(`#EXT-X-APE-AUDIO-SPDIF:eac3,ac3,dts,truehd`);
        lines.push(`#EXT-X-APE-AUDIO-AOUT:any`);
        lines.push(`#EXT-X-APE-AUDIO-TRACK-ID:0`);
        lines.push(`#EXT-X-APE-AUDIO-BITDEPTH:24`);
        lines.push(`#EXT-X-APE-AUDIO-CHANNELS-MAX:8`);
        // 8.k Scorecard Dinámico (20)
        lines.push(`#EXT-X-APE-SCORECARD:VERSION=5.0,SID=${_sid796},NONCE=${_nonce796}`);
        lines.push(`#EXT-X-APE-SCORECARD-PROFILE:${profile}`);
        lines.push(`#EXT-X-APE-SCORECARD-RESOLUTION:${_res796}`);
        lines.push(`#EXT-X-APE-SCORECARD-FPS:${_fps796}`);
        lines.push(`#EXT-X-APE-SCORECARD-BITRATE:${Math.round(_bw796/1000)}kbps`);
        lines.push(`#EXT-X-APE-SCORECARD-CODEC:${_codec796}`);
        lines.push(`#EXT-X-APE-SCORECARD-HDR:${_hdr796}nits`);
        lines.push(`#EXT-X-APE-SCORECARD-LCEVC:PHASE_4`);
        lines.push(`#EXT-X-APE-SCORECARD-AI-SR:RealESRGAN_x4Plus`);
        lines.push(`#EXT-X-APE-SCORECARD-VMAF:${cfg.vmaf_target||95}`);
        lines.push(`#EXT-X-APE-SCORECARD-BUFFER:${_buf796}ms`);
        lines.push(`#EXT-X-APE-SCORECARD-LATENCY:<30ms`);
        lines.push(`#EXT-X-APE-SCORECARD-AVAILABILITY:99.999%`);
        lines.push(`#EXT-X-APE-SCORECARD-RESILIENCE:7_LEVELS`);
        lines.push(`#EXT-X-APE-SCORECARD-EVASION:PHANTOM_HYDRA_V5`);
        lines.push(`#EXT-X-APE-SCORECARD-UA-ROTATION:180_BANK`);
        lines.push(`#EXT-X-APE-SCORECARD-DRM:WIDEVINE_L1`);
        lines.push(`#EXT-X-APE-SCORECARD-ENCRYPTION:CBCS`);
        lines.push(`#EXT-X-APE-SCORECARD-CONTENT-TYPE:${_ct796}`);
        lines.push(`#EXT-X-APE-SCORECARD-NONCE:${_nonce796}`);
        // 8.l VRR y sincronización (20)
        lines.push(`#EXT-X-APE-VRR:ENABLED`);
        lines.push(`#EXT-X-APE-VRR-SYNC:enabled`);
        lines.push(`#EXT-X-APE-VRR-AUTO-MATCH-FPS:true`);
        lines.push(`#EXT-X-APE-VRR-REFRESH-RATE:${_fps796}`);
        lines.push(`#EXT-X-APE-VRR-FRAME-RATE-MATCH:true`);
        lines.push(`#EXT-X-APE-VRR-SPORT-MODE:true`);
        lines.push(`#EXT-X-APE-VRR-LOW-LATENCY:true`);
        lines.push(`#EXT-X-APE-VRR-LIVE-EDGE:2`);
        lines.push(`#EXT-X-APE-VRR-LIVE-DELAY:0`);
        lines.push(`#EXT-X-APE-VRR-TIMESHIFT:false`);
        lines.push(`#EXT-X-APE-VRR-GSYNC:ENABLED`);
        lines.push(`#EXT-X-APE-VRR-FREESYNC:ENABLED`);
        lines.push(`#EXT-X-APE-VRR-HDMI-FORUM:ENABLED`);
        lines.push(`#EXT-X-APE-VRR-ALLM:ENABLED`);
        lines.push(`#EXT-X-APE-VRR-QMS:ENABLED`);
        lines.push(`#EXT-X-APE-VRR-QFT:ENABLED`);
        lines.push(`#EXT-X-APE-VRR-EARC:ENABLED`);
        lines.push(`#EXT-X-APE-VRR-ARC:ENABLED`);
        lines.push(`#EXT-X-APE-VRR-CEC:ENABLED`);
        lines.push(`#EXT-X-APE-VRR-HDCP:2.3`);
        // 8.m Polimorfismo (20)
        lines.push(`#EXT-X-APE-POLYMORPHIC:ENABLED,VERSION=5.0`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-NONCE:${_nonce796}`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-SID:${_sid796}`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-LIST-HASH:${_nonce796}`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-TIMESTAMP:${Date.now()}`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-UA:${_ua796}`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-IP:CDN_POOL`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-DNS:DOH_CLOUDFLARE`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-SNI:OBFUSCATED`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-TLS:1.3`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-FINGERPRINT:RANDOMIZED`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-TIMING:JITTERED`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-PACKET-SIZE:RANDOMIZED`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-PROTOCOL:HTTPS_MIMICRY`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-TRAFFIC:MORPHED`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-IDENTITY:MUTATED`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-SESSION:EPHEMERAL`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-REQUEST:UNIQUE`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-RESPONSE:VALIDATED`);
        lines.push(`#EXT-X-APE-POLYMORPHIC-CACHE:BUSTED`);
        // 8.n Quality Override (20)
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE:MAX`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-RESOLUTION:${_res796}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-FPS:${_fps796}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-BITRATE:${Math.round(_bw796/1000)}kbps`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-CODEC:${_codec796}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-HDR:${_hdr796}nits`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-LCEVC:PHASE_4`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-AI-SR:RealESRGAN_x4Plus`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-VMAF:${cfg.vmaf_target||95}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-ABR:HIGHEST`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-ABR-LOCK:NATIVE_MAX`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-ADAPTIVE-LOGIC:HIGHEST`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-MAX-WIDTH:${(_res796.split('x')[0]||7680)}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-MAX-HEIGHT:${(_res796.split('x')[1]||4320)}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-MAX-BW:${_bw796}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-MIN-BW:${cfg.min_bandwidth||1000000}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-CHROMA:4:4:4`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-BIT-DEPTH:12`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-PIXEL-FORMAT:yuv444p12le`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-COLOR-SPACE:bt2020`);
        // 8.o Luma Precision (20)
        lines.push(`#EXT-X-APE-LUMA-PRECISION:12bit`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-CHROMA:4:4:4`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-PIXEL-FORMAT:yuv444p12le`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-COLOR-SPACE:bt2020`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-TRANSFER:SMPTE-ST-2084`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-PRIMARIES:BT.2020`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-MATRIX:BT.2020nc`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-RANGE:LIMITED`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-DITHER:ERROR_DIFFUSION`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-CHROMAL:TOPLEFT`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-ZSCALE:ENABLED`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-TONEMAP:HABLE`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-TONEMAP-PARAM:0.3`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-TONEMAP-DESAT:0`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-TONEMAP-PEAK:${_hdr796}`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-DEBAND:GRADFUN`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-DEBAND-STRENGTH:1.0`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-DEBAND-RADIUS:16`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-DEBAND-DITHER:ENABLED`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION-FILM-GRAIN:NEURAL-MPEG`);
        // 8.p Bitrate Anarchy (20)
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY:ENABLED,MAX=UNLIMITED`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-TARGET:${Math.round(_bw796/1000)}kbps`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-PEAK:UNLIMITED`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-MIN:128kbps`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-BURST:ENABLED`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-BURST-FACTOR:1.5x`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-BURST-DURATION:999999s`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-RATE-CONTROL:VBR_CONSTRAINED`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-VBV-MAX:${Math.ceil((_bw796/1000)*1.3)}kbps`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-VBV-BUF:${Math.ceil((_bw796/1000)*2)}kbps`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-GOP:${cfg.gop_size||60}`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-B-FRAMES:2`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-LOOKAHEAD:10`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-AQ-MODE:SPATIAL`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-CONTENT-AWARE:PER_SCENE_CONTINUOUS`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-CONTENT-ANALYSIS-FPS:1`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-ENCODER:nvenc_hevc`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-PRESET:p6`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-TUNE:hq`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY-PIXEL-ABSORPTION:MAXIMUM_BANDWIDTH`);
        // 8.q Quantum Pixel (20)
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL:OVERDRIVE`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-RESOLUTION:${_res796}`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-FPS:${_fps796}`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-HDR:${_hdr796}nits`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-LCEVC:PHASE_4`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-AI-SR:RealESRGAN_x4Plus`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-FRAME-INTERP:RIFE_V4`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-DENOISING:NLMEANS_HQDN3D`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-SHARPENING:CAS`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-DEBANDING:GRADFUN`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-DEINTERLACE:BWDIF`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-TONEMAP:BT2446a`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-GAMUT:DCI-P3,BT.2020`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-BIT-DEPTH:12`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-CHROMA:4:4:4`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-PIXEL-FORMAT:yuv444p12le`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-VMAF:${cfg.vmaf_target||95}`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-PSNR:42`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-SSIM:0.97`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL-VIF:0.95`);
        // 8.r Buffer God Tier (20)
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER:ENABLED`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-NETWORK:${_nbuf796}ms`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-LIVE:${_lbuf796}ms`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-FILE:${_fbuf796}ms`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-PLAYER:${cfg.player_buffer_ms||_buf796}ms`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-PREFETCH:${cfg.prefetch_buffer_target||_buf796}ms`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-SEGMENTS:${cfg.prefetch_segments||10}`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-PARALLEL:${cfg.prefetch_parallel||4}`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-MIN-BW:${cfg.prefetch_min_bandwidth||1000000}`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-ANTI-STARVATION:true`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-ANTI-FREEZE:true`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-ANTI-REBUFFER:true`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-ANTI-STALL:true`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-WATCHDOG:MANIFEST=30s,FREEZE=10s`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-HEARTBEAT:5s`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-MANIFEST-REFRESH:30s`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-SEGMENT-RETRY:5`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-MANIFEST-RETRY:3`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-AVAILABILITY:99.999%`);
        lines.push(`#EXT-X-APE-BUFFER-GOD-TIER-FAILOVER-TIME:<60ms`);
        // 8.s Space Validator (20)
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR:ENABLED,VERSION=5.0`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-SID:${_sid796}`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-NONCE:${_nonce796}`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-PROFILE:${profile}`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-RESOLUTION:${_res796}`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-FPS:${_fps796}`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-BITRATE:${Math.round(_bw796/1000)}kbps`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-CODEC:${_codec796}`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-HDR:${_hdr796}nits`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-LCEVC:PHASE_4`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-AI-SR:RealESRGAN_x4Plus`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-VMAF:${cfg.vmaf_target||95}`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-BUFFER:${_buf796}ms`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-LATENCY:<30ms`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-AVAILABILITY:99.999%`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-RESILIENCE:7_LEVELS`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-EVASION:PHANTOM_HYDRA_V5`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-DRM:WIDEVINE_L1`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-ENCRYPTION:CBCS`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-CONTENT-TYPE:${_ct796}`);
        // 8.t VNOVA LCEVC (20)
        lines.push(`#EXT-X-VNOVA-LCEVC:ENABLED,PHASE=4`);
        lines.push(`#EXT-X-VNOVA-LCEVC-NEURAL-UPSCALE:ESRGAN-4x`);
        lines.push(`#EXT-X-VNOVA-LCEVC-GRAIN-SYNTHESIS:true`);
        lines.push(`#EXT-X-VNOVA-LCEVC-SPATIAL-DITHERING:true`);
        lines.push(`#EXT-X-VNOVA-LCEVC-L1-MOTION-COMPENSATION:true`);
        lines.push(`#EXT-X-VNOVA-LCEVC-L2-CHROMA-ENHANCEMENT:true`);
        lines.push(`#EXT-X-VNOVA-LCEVC-L2-DETAIL-ENHANCEMENT:true`);
        lines.push(`#EXT-X-VNOVA-LCEVC-RATE-CONTROL:CRF+VBR`);
        lines.push(`#EXT-X-VNOVA-LCEVC-PSYCHO-VISUAL:true`);
        lines.push(`#EXT-X-VNOVA-LCEVC-AQ-MODE:VARIANCE`);
        lines.push(`#EXT-X-VNOVA-LCEVC-LOOKAHEAD:${cfg.lcevc_lookahead||60}`);
        lines.push(`#EXT-X-VNOVA-LCEVC-B-FRAMES:${cfg.lcevc_bframes||8}`);
        lines.push(`#EXT-X-VNOVA-LCEVC-REF-FRAMES:${cfg.lcevc_refframes||16}`);
        lines.push(`#EXT-X-VNOVA-LCEVC-SUBPEL-REFINE:7`);
        lines.push(`#EXT-X-VNOVA-LCEVC-ME-RANGE:24`);
        lines.push(`#EXT-X-VNOVA-LCEVC-TRELLIS:2`);
        lines.push(`#EXT-X-VNOVA-LCEVC-DEBLOCK-ALPHA:${cfg.lcevc_deblock_alpha||-2}`);
        lines.push(`#EXT-X-VNOVA-LCEVC-DEBLOCK-BETA:${cfg.lcevc_deblock_beta||-2}`);
        lines.push(`#EXT-X-VNOVA-LCEVC-SAR:${_res796}`);
        lines.push(`#EXT-X-VNOVA-LCEVC-COLORMATRIX:${cfg.color_space||'BT.2020'}`);
        // 8.u Telemetría Córtex (20)
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY:ENABLED,VERSION=5.0`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-SID:${_sid796}`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-NONCE:${_nonce796}`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-PROFILE:${profile}`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-RESOLUTION:${_res796}`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-FPS:${_fps796}`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-BITRATE:${Math.round(_bw796/1000)}kbps`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-CODEC:${_codec796}`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-HDR:${_hdr796}nits`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-BUFFER:${_buf796}ms`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-LATENCY:<30ms`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-VMAF:${cfg.vmaf_target||95}`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-PSNR:42`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-SSIM:0.97`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-AVAILABILITY:99.999%`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-RESILIENCE:7_LEVELS`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-EVASION:PHANTOM_HYDRA_V5`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-DRM:WIDEVINE_L1`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-CONTENT-TYPE:${_ct796}`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-CHANNEL:${_chName}`);
        // 8.v Cortex Diagnosis (20)
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS:ENABLED`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-AUTO-RESOLVE:true`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-RESOLVE-TIME:<60ms`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-TREE:HISTORICAL_EXPERIENCE`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-COVERAGE:99%`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-ERROR-400:ROTATE_UA`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-ERROR-401:ESCALATE_CREDENTIALS`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-ERROR-403:ROTATE_IDENTITY`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-ERROR-404:FAILOVER_CDN`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-ERROR-405:CHANGE_METHOD`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-ERROR-407:ROTATE_PROXY`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-ERROR-429:SWARM_EVASION`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-ERROR-500:FAILOVER_CDN`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-ERROR-503:RETRY_3X`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-ERROR-504:RETRY_3X`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-PILAR-5:ENABLED`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-PILAR-5-COVERAGE:95%`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-PILAR-5-RESOLVE-TIME:<60ms`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-PILAR-5-TREE:HISTORICAL_EXPERIENCE`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS-PILAR-5-AUTO:true`);
        // 8.w Player Enslavement (20)
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT:OMEGA_ABSOLUTE`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-ABR:DISABLED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-ABR-LOCK:NATIVE_MAX`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-IDENTITY-MORPH:ENABLED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-METADATA-TARGETS:IPTV_SERVER,ISP,PLAYER,SCREEN,APP`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-TIVIMATE:FORCED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-OTT-NAVIGATOR:FORCED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-KODI:FORCED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-EXOPLAYER:FORCED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-VLC:FORCED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-IPTV-SMARTERS:FORCED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-MX-PLAYER:FORCED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-INFUSE:FORCED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-PLEX:FORCED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-JELLYFIN:FORCED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-SMART-TV:FORCED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-APPLE-TV:FORCED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-CHROMECAST:FORCED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-FIRETV:FORCED`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVEMENT-ROKUTV:FORCED`);
        // L8 = 470 ✓

        // ══════════════════════════════════════════════════════════════════════
        // ── L9: EXT-X-PHANTOM-HYDRA — Evasión Definitiva (13 líneas) ─────────
        // ══════════════════════════════════════════════════════════════════════
        lines.push(`#EXT-X-PHANTOM-HYDRA:ROTATION=ORGANIC,DNS=DOH_CLOUDFLARE,SNI=OBFUSCATED`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-UA-ANDROID:${(typeof UAPhantomEngine !== 'undefined') ? UAPhantomEngine.get('Android') : 'Mozilla/5.0 (Linux; Android 12; SHIELD Android TV) AppleWebKit/537.36'}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-UA-IOS:${(typeof UAPhantomEngine !== 'undefined') ? UAPhantomEngine.get('iOS') : 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-UA-CHROME:${(typeof UAPhantomEngine !== 'undefined') ? UAPhantomEngine.get('Windows') : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0'}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-UA-SAFARI:${(typeof UAPhantomEngine !== 'undefined') ? UAPhantomEngine.get('Safari') : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/604.1'}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-UA-TIVIMATE:${(typeof UAPhantomEngine !== 'undefined') ? UAPhantomEngine.get('TiviMate') : 'TiviMate/4.8.0 (Android 12; SHIELD Android TV)'}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-DNS-PRIMARY:1.1.1.1`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-DNS-SECONDARY:8.8.8.8`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-DNS-TERTIARY:9.9.9.9`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-SNI-FRONT:cloudflare.com`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-TRAFFIC-MORPHING:HTTPS_MIMICRY`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-DPI-EVASION:SANDVINE_BYPASS`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-IP-ROTATION:SWARM_2048`);
        // L9 = 13 ✓

        // ══════════════════════════════════════════════════════════════════════
        // ── L10: URL RESOLUTION — buildChannelUrl + EXT-X-MAP (2 líneas) ─────
        // Preserva toda la lógica existente de buildChannelUrl, OPTION-A/B,
        // Pilar 5 cache-busting, resolver URL, credenciales, etc.
        // ══════════════════════════════════════════════════════════════════════
        let primaryUrl = buildChannelUrl(channel, null, profile, index, credentialsMap);
        if (!primaryUrl) {
            if (index < 3) {
                console.error('[OMEGA-796] buildChannelUrl returned EMPTY for channel #' + index, channel.name);
            }
            try {
                let sid = channel.stream_id;
                if (sid == null) sid = channel.raw?.stream_id;
                if (sid == null) sid = channel.id;
                if (sid == null || sid === '') sid = index;
                const servers = (typeof window !== 'undefined' && window.app && window.app.state && window.app.state.activeServers) || [];
                const currentSrv = (typeof window !== 'undefined' && window.app && window.app.state && window.app.state.currentServer) || null;
                const srvId = channel.serverId || channel._source || '';
                let srv = null;
                if (servers.length > 0) {
                    srv = srvId ? servers.find(s => s.id === srvId) : servers[0];
                    if (!srv) srv = servers[0];
                }
                if (!srv) srv = currentSrv;
                if (srv) {
                    const base = (srv.baseUrl || srv.url || '').replace(/\/player_api\.php.*$/, '').replace(/\/$/, '');
                    const user = srv._lockedUsername || srv.username || srv.user || '';
                    const pass = srv._lockedPassword || srv.password || srv.pass || '';
                    if (base && user && pass) {
                        primaryUrl = `${base}/${user}/${pass}/${sid}`;
                    }
                }
            } catch(e) { /* silent */ }
        }
        if (!primaryUrl) primaryUrl = channel.url || '';

        let finalUrl = primaryUrl;

        // ── Pilar 5 Cache Busting (si está activo) ──
        if (typeof _cortexTempBanHash !== 'undefined' && _cortexTempBanHash) {
            try {
                const _u = new URL(finalUrl);
                _u.searchParams.set('_cb', _cortexTempBanHash);
                finalUrl = _u.toString();
            } catch(e) { /* URL inválida */ }
        }

        // ── Inyectar SID idempotente + nonce polimórfico en la URL ──
        try {
            const _u = new URL(finalUrl);
            _u.searchParams.set('ape_sid', _sid796);
            _u.searchParams.set('ape_nonce', _nonce796);
            finalUrl = _u.toString();
        } catch(e) { /* URL inválida, no modificar */ }

        // ── Fallback directo + EXTATTRFROMURL para OTT Navigator ──
        lines.push(`#EXT-X-APE-FALLBACK-DIRECT:${primaryUrl}`);
        lines.push(`#EXTATTRFROMURL:${finalUrl}`);

        // ── L10: EXT-X-MAP + URL final ──
        lines.push(`#EXT-X-MAP:URI="init.mp4"`);
        lines.push(finalUrl);
        // L10 = 2 ✓

        // ── Verificación en debug ──
        if (typeof console !== 'undefined' && console.debug) {
            const _omega_count = lines.length - 2; // excluir FALLBACK-DIRECT y EXTATTRFROMURL
            if (_omega_count !== 796) {
                console.warn(`[OMEGA-796] Canal ${_chName}: ${_omega_count} lineas (esperadas 796). Delta=${_omega_count-796}`);
            }
        }

        return lines.join('\n');
"""

# Construir el archivo final
output = []
output.extend(original[:CUT_START])
output.append(OMEGA_BLOCK + '\n')
output.extend(original[CUT_END:])

out_path = '/home/ubuntu/upload/m3u8-typed-arrays-ultimate.js'
with open(out_path, 'w', encoding='utf-8') as f:
    f.writelines(output)

print(f"Archivo integrado escrito: {out_path}")
print(f"Lineas totales: {len(output)}")
print(f"Lineas originales: {len(original)}")
print(f"Lineas reemplazadas: {CUT_END - CUT_START}")
print(f"Lineas del bloque OMEGA: {len(OMEGA_BLOCK.splitlines())}")
