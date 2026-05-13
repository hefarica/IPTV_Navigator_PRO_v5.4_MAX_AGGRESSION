const fs = require('fs');
const file = 'C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js';
let content = fs.readFileSync(file, 'utf8');

// 1. REPAIR generateGlobalHeader (Cirugia 2)
const rx1 = /function generateGlobalHeader\(channelsCount, options = \{\}\) \{\s*const timestamp.*?(#EXT-X-APE-SYNC-SLAVE:MASTER_ORIGIN_SYNC_V2`;\s*})/s;

const newHeader = `function generateGlobalHeader(channelsCount, options = {}) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 18) + 'Z';
        const totalChannels = typeof window !== 'undefined' && window.app && typeof window.app.getFilteredChannels === 'function' ? window.app.getFilteredChannels().length : channelsCount;

        // ── 1. DYNAMIC LAB INJECTION (NIVEL 1) ──
        if (options.bulletproof_loaded && options.bulletproof_nivel1 && Array.isArray(options.bulletproof_nivel1)) {
            let n1 = \`#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift=0 catchup="flussonic" catchup-days="7" url-tvg="" refresh="1800"\\n\`;
            for (let i = 0; i < options.bulletproof_nivel1.length; i++) {
                n1 += options.bulletproof_nivel1[i] + '\\n';
            }
            return n1.trim();
        }

        // ── 2. FALLBACK LEGACY (Sin LAB_CALIBRATED_BULLETPROOF cargado) ──
        return \`#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift=0 catchup="flussonic" catchup-days="7" catchup-source="{MediaUrl}?utc={utc}&lutc={lutc}" url-tvg="" refresh="1800"
#EXT-X-VERSION:7
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-APE-QMAX-VERSION:2.0-ADAPTIVE
#EXT-X-APE-QMAX-STRATEGY:GREEDY-BEST-AVAILABLE
#EXT-X-APE-QMAX-ANTI-DOWNGRADE:ENFORCED
#EXT-X-APE-QMAX-TIER-CASCADE:S>A>A->B>C>D
#EXT-X-APE-QMAX-SELECTION-RULE:IF-4K-EXISTS-1080P-FORBIDDEN
#EXT-X-APE-QMAX-BUFFER-CLASS:8K-ADAPTIVE-1GB
#EXT-X-APE-QMAX-PERCEPTUAL-OPTIMIZATION:VMAF-MAXIMIZATION-ENABLED
#EXT-X-APE-QMAX-BANDWIDTH-SAFETY-MARGIN:0.30
#X-OMEGA-TIMESTAMP:\${timestamp}
#EXT-X-APE-LCEVC-SDK-VERSION:1.2.4
#EXT-X-VNOVA-LCEVC-TARGET-SDK:HTML5
\${options.dictatorMode ? \`#EXT-X-SESSION-DATA:DATA-ID="exoplayer.load_control",VALUE="{\\"minBufferMs\\":20000,\\"bufferForPlaybackMs\\":5000}"\` : ""}
\${options.dictatorMode ? \`#\` + Array.from({length: 64}).map(() => Math.random().toString(36).substring(2)).join("")  : ""}
#EXT-X-CONTENT-STEERING:SERVER-URI="https://steer.ape.net/v1",PATHWAY-ID="PRIMARY"
#EXT-X-DEFINE:NAME="OMEGA_BUILD",VALUE="v5.4-MAX-AGGRESSION"
#EXT-X-DEFINE:NAME="OMEGA_EPOCH",VALUE="\${timestamp}"
#EXT-X-DEFINE:NAME="OMEGA_COMPLIANCE",VALUE="HLS-RFC8216BIS+CMAF-LL+HDR10+DV-P81-P10+LCEVC-P4"
#EXT-X-KEY:METHOD=NONE
#EXT-X-SESSION-KEY:METHOD=NONE
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=450000,AVERAGE-BANDWIDTH=400000,CODECS="hvc1.1.6.L153.B0",RESOLUTION=1920x1080
#EXT-X-DATERANGE:ID="omega-live-\${timestamp}",START-DATE="\${new Date().toISOString()}",DURATION=86400,X-OMEGA-TYPE="LIVE-CATCHUP",X-OMEGA-SCOPE="CHANNEL-SESSION",X-OMEGA-BUILD="v5.4-MAX-AGGRESSION"
#EXT-X-DATERANGE:ID="omega-hdr-window",START-DATE="\${new Date().toISOString()}",PLANNED-DURATION=86400,X-HDR-TYPE="HDR10+DV-P81-P10",X-HDR-MAX-CLL=5000,X-HDR-MAX-FALL=800
#KODIPROP:inputstream.adaptive.manifest_type=hls
#KODIPROP:inputstream.adaptive.stream_selection_type=auto
#KODIPROP:inputstream.adaptive.chooser_bandwidth_mode=AUTO
#KODIPROP:inputstream.adaptive.chooser_resolution_max=MAX
#EXT-X-SESSION-DATA:DATA-ID="com.ape.session",VALUE="v=6.0&build=NUCLEAR"
#EXT-X-APE-BUILD:v6.0-NUCLEAR-HACKS-\${timestamp}
#EXT-X-APE-PARADIGM:PLAYER-ENSLAVEMENT-PROTOCOL-V6.0-NUCLEAR
#EXT-X-APE-CHANNELS:\${totalChannels}
#EXT-X-APE-PROFILES:P0-ULTRA_EXTREME_8K,P1-4K_SUPREME_60FPS,P2-4K_EXTREME_30FPS,P3-FHD_ADVANCED_60FPS,P4-HD_STABLE_30FPS,P5-SD_FAILSAFE_25FPS
#EXT-X-APE-ISP-THROTTLE:10-LEVELS-NUCLEAR-OBSCENE-NEVER-DOWN
#EXT-X-APE-ISP-THROTTLE-VERSION:4.0-OBSCENE
#EXT-X-APE-ISP-THROTTLE-STRATEGY:ESCALATE_NEVER_DOWNGRADE
#EXT-X-APE-ERROR-RECOVERY:NUCLEAR
#EXT-X-APE-ERROR-MAX-RETRIES:UNLIMITED
#EXT-X-APE-ERROR-CONCEALMENT:AI_INPAINTING
#EXT-X-APE-ISP-LEVEL-1:CONSERVATIVE-MAX_CONTRACT-TCP4MB-PAR4-BURST1.5x-BUF60
#EXT-X-APE-ISP-LEVEL-2:MODERATE-MAX_CONTRACT_PLUS-TCP8MB-PAR8-BURST2x-BUF90
#EXT-X-APE-ISP-LEVEL-3:AGGRESSIVE-SATURATE_LINK-TCP16MB-PAR16-BURST3x-BUF120
#EXT-X-APE-ISP-LEVEL-4:VERY_AGGRESSIVE-EXCEED_CONTRACT-TCP32MB-PAR32-BURST5x-BUF180
#EXT-X-APE-ISP-LEVEL-5:EXTREME-EXTREME_BW-TCP48MB-PAR48-BURST7x-BUF240
#EXT-X-APE-ISP-LEVEL-6:ULTRA-SATURATE_TOTAL-TCP64MB-PAR64-BURST10x-BUF300
#EXT-X-APE-ISP-LEVEL-7:SAVAGE-NO_RESTRICTIONS-TCP96MB-PAR96-BURST15x-BUF360
#EXT-X-APE-ISP-LEVEL-8:BRUTAL-EMERGENCY-TCP128MB-PAR128-BURST20x-BUF480
#EXT-X-APE-ISP-LEVEL-9:NUCLEAR-NO_LIMITS-TCP192MB-PAR192-BURST30x-BUF600
#EXT-X-APE-ISP-LEVEL-10:APOCALYPTIC-ALL_BANDWIDTH-TCP256MB-PAR256-BURST50x-BUF900
#EXT-X-APE-LCEVC:MPEG-5-PART-2-FULL-3-PHASE-L1-L2-TRANSPORT-PARALLEL
#EXT-X-APE-ANTI-FREEZE-NUCLEAR:v10.0-OBSCENE|net-cache=120000|live-cache=120000|clock-jitter=5000|prefetch=100-200-500-2000
#EXT-X-APE-BUFFER-STRATEGY:NUCLEAR_NO_COMPROMISE|TARGET=180s|MIN=60s|MAX=600s|RAM=2048MB
#EXT-X-APE-RECONNECT-NUCLEAR:MAX=UNLIMITED|DELAY=0-50ms|PARALLEL=64|POOL=50|WARM=20
#EXT-X-APE-MULTI-SOURCE:ENABLED|COUNT=5|ACTIVE=2|RACING=TRUE|FAILOVER=50ms
#EXT-X-APE-FREEZE-PREDICTION:LSTM_ENSEMBLE|WINDOW=5000ms|CONFIDENCE=0.8|AUTO=TRUE
#EXT-X-APE-QUALITY-SAFETY-NET:NEVER_BELOW=480p|CHAIN=4K>1080p>720p>480p>360p>240p
#EXT-X-APE-FRAME-INTERPOLATION:AI_RIFE_V4|MAX=60|GPU=TRUE
#EXT-X-APE-EXTHTTP-FIELDS:250+
#EXT-X-APE-LINES-PER-CHANNEL:250+
#EXT-X-APE-COMPATIBILITY:VLC,OTT-NAVIGATOR,TIVIMATE,KODI,EXOPLAYER,IPTV-SMARTERS,GSE,MX-PLAYER,INFUSE,PLEX,JELLYFIN,EMBY,PERFECT-PLAYER,SMART-TV,FIRE-TV,APPLE-TV,ANDROID-TV,ROKU,CHROMECAST
#EXT-X-APE-NET-TOLERANCE:BDP=100MB|CWND=64|RTT_MAX=3000ms
#EXT-X-APE-QUANTUM-IMMORTALITY:v10-ENABLED
#EXT-X-APE-TELEMETRY-SYNC:NETFLIX-GRADE
#EXT-X-APE-EVASION-GET:405-REWRITE-TO-HEAD
#EXT-X-APE-FALLBACK-HEURISTICS:LATENCY<100ms
#EXT-X-APE-SYNC-SLAVE:MASTER_ORIGIN_SYNC_V2\`;
    }`;

if (!rx1.test(content)) {
    console.log("NOT FOUND: generateGlobalHeader!!!");
} else {
    content = content.replace(rx1, newHeader);
    console.log("SUCCESS REPLACING generateGlobalHeader");
}

// 2. REPAIR generateChannelEntry (Cirugia 3)
// Im inserting the dynamic LAB processing logic right after APE_PROFILE_MATRIX
const rx2 = /(if \(pOpts\.headerOverrides\) \{[\s\S]*?\}\s*\})([\s\S]*?)(\/\/ ── MASTER SCRIPT PAYLOAD \(EJECUCIÓN NATIVA EN RED Y REPRODUCTOR\) ──)/g;

const newInjection = `$1

        // === DYNAMIC LAB INJECTION (post APE_PROFILE_MATRIX legacy) ===
        const labProfile = options.bulletproof_profiles?.[profile];
        if (labProfile) {
            // 1) optimized_knobs → override buffer_ms, reconnect_attempts, live_delay
            try {
                const opt = labProfile.optimized_knobs;
                if (opt) {
                    const bufMs = (opt.buffer_seconds || 0) * 1000;
                    if (bufMs > 0) {
                        upsertVlcopt(lines, 'network-caching', bufMs);
                        upsertVlcopt(lines, 'live-caching',    bufMs);
                        upsertVlcopt(lines, 'file-caching',    bufMs);
                        upsertVlcopt(lines, 'sout-mux-caching', bufMs);
                        upsertVlcopt(lines, 'adaptive-maxbuffer', bufMs);
                    }
                    if (opt.reconnect_attempts !== undefined) {
                        upsertVlcopt(lines, 'http-max-retries', opt.reconnect_attempts);
                        upsertVlcopt(lines, 'network-reconnect-count', opt.reconnect_attempts);
                    }
                    if (opt.live_delay_seconds !== undefined) {
                        upsertVlcopt(lines, 'adaptive-livedelay', opt.live_delay_seconds * 1000);
                        upsertKodiprop(lines, 'inputstream.adaptive.live_delay', opt.live_delay_seconds);
                    }
                }
            } catch(e) { console.warn('[bulletproof]', e); }
        
            // 2) player_enslavement.level_3_per_channel → iterar por layer
            try {
                const l3 = labProfile.player_enslavement?.level_3_per_channel;
                if (l3) {
                    if (l3.EXTVLCOPT) { for (const [k, v] of Object.entries(l3.EXTVLCOPT)) upsertVlcopt(lines, k, v); }
                    if (l3.KODIPROP)  { for (const [k, v] of Object.entries(l3.KODIPROP))  upsertKodiprop(lines, k, v); }
                    if (l3.EXTHTTP)   { for (const [k, v] of Object.entries(l3.EXTHTTP))   upsertExthttp(lines, k, v); }
                    if (l3.SYS)       { for (const [k, v] of Object.entries(l3.SYS))       upsertApeSys(lines, k, v); }
                    if (l3['STREAM-INF']) upsertStreamInfAttrs(lines, l3['STREAM-INF']);
                }
            } catch(e) { console.warn('[bulletproof]', e); }
        
            // 3) actor_injections.player.exoplayer → 11 KODIPROP sintéticas
            try {
                const exoPlayer = labProfile.actor_injections?.player?.exoplayer;
                if (exoPlayer) {
                    const exoMap = {
                        minBufferMs:                     'inputstream.adaptive.min_buffer_ms',
                        maxBufferMs:                     'inputstream.adaptive.max_buffer_ms',
                        bufferForPlaybackMs:             'inputstream.adaptive.buffer_for_playback_ms',
                        bufferForPlaybackAfterRebufferMs:'inputstream.adaptive.buffer_for_playback_after_rebuffer_ms',
                        targetBufferBytes:               'inputstream.adaptive.target_buffer_bytes',
                        prioritizeTimeOverSizeThresholds:'inputstream.adaptive.prioritize_time_over_size',
                        abrBandWidthFactor:              'inputstream.adaptive.abr_bandwidth_factor',
                        maxLiveSyncPlaybackRate:         'inputstream.adaptive.max_live_sync_playback_rate',
                        liveTargetOffsetMs:              'inputstream.adaptive.live_target_offset_ms',
                        nudgeMaxRetry:                   'inputstream.adaptive.nudge_max_retry',
                        fragLoadMaxNumRetry:             'inputstream.adaptive.frag_load_max_num_retry'
                    };
                    for (const [jsonKey, kodiKey] of Object.entries(exoMap)) {
                        const v = exoPlayer[jsonKey];
                        if (v !== undefined && v !== null && v !== '') upsertKodiprop(lines, kodiKey, v);
                    }
                }
            } catch(e) { console.warn('[bulletproof]', e); }

            // 4) actor_injections.player.hlsjs → 9 KODIPROP convención inputstream.hlsjs.*
            try {
                const hlsjs = labProfile.actor_injections?.player?.hlsjs;
                if (hlsjs) {
                    const hlsMap = {
                        maxBufferLength:         'inputstream.hlsjs.max_buffer_length',
                        maxMaxBufferLength:      'inputstream.hlsjs.max_max_buffer_length',
                        liveDurationInfinity:    'inputstream.hlsjs.live_duration_infinity',
                        highBufferWatchdogPeriod:'inputstream.hlsjs.high_buffer_watchdog_period',
                        nudgeMaxRetry:           'inputstream.hlsjs.nudge_max_retry',
                        nudgeOffset:             'inputstream.hlsjs.nudge_offset',
                        maxFragLookUpTolerance:  'inputstream.hlsjs.max_frag_lookup_tolerance',
                        maxLiveSyncPlaybackRate: 'inputstream.hlsjs.max_live_sync_playback_rate',
                        liveSyncDuration:        'inputstream.hlsjs.live_sync_duration'
                    };
                    for (const [jsonKey, kodiKey] of Object.entries(hlsMap)) {
                        const v = hlsjs[jsonKey];
                        if (v !== undefined && v !== null && v !== '') upsertKodiprop(lines, kodiKey, v);
                    }
                }
            } catch(e) { console.warn('[bulletproof]', e); }

            // 5) actor_injections.panel extendido → #EXT-X-DATERANGE HDR metadata per-channel
            try {
                const panel = labProfile.actor_injections?.panel;
                if (panel) {
                    const drAttrs = [];
                    if (panel.hdr_type)           drAttrs.push(\`X-HDR-TYPE="\${String(panel.hdr_type).replace(/"/g,'\\\\"')}"\`);
                    if (panel.max_cll_nits)       drAttrs.push(\`X-HDR-MAX-CLL=\${panel.max_cll_nits}\`);
                    if (panel.peak_luminance_nits) drAttrs.push(\`X-HDR-PEAK-LUMINANCE=\${panel.peak_luminance_nits}\`);
                    if (panel.color_primaries)    drAttrs.push(\`X-COLOR-PRIMARIES="\${panel.color_primaries}"\`);
                    if (panel.color_transfer)     drAttrs.push(\`X-COLOR-TRANSFER="\${panel.color_transfer}"\`);
                    if (panel.chroma_subsampling) drAttrs.push(\`X-CHROMA-SUBSAMPLING="\${panel.chroma_subsampling}"\`);
                    if (panel.bit_depth)          drAttrs.push(\`X-BIT-DEPTH=\${panel.bit_depth}\`);
                    if (panel.hdcp_level)         drAttrs.push(\`X-HDCP-LEVEL="\${panel.hdcp_level}"\`);
                    if (drAttrs.length > 0) {
                        const drLine = \`#EXT-X-DATERANGE:ID="hdr-\${profile}-\${index}",CLASS="ape.hdr.panel",\${drAttrs.join(',')}\`;
                        upsertDaterangeByClass(lines, 'ape.hdr.panel', drLine);
                    }
                }
            } catch(e) { console.warn('[bulletproof]', e); }
        }

        $3`;

if (!rx2.test(content)) {
    console.log("NOT FOUND: generateChannelEntry location!!!");
} else {
    content = content.replace(rx2, newInjection);
    console.log("SUCCESS REPLACING generateChannelEntry injections");
}

fs.writeFileSync(file, content);
console.log("File saved.");
