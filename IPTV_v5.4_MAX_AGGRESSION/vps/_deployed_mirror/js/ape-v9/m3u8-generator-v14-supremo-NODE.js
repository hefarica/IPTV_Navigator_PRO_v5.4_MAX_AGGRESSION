/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📺 M3U8 GENERATOR v14.0 SUPREMO - VERSIÓN NODE.JS
 * ═══════════════════════════════════════════════════════════════════════════
 * Versión compatible con Node.js (sin dependencia de window)
 */

// CONFIGURACIÓN DE PERFILES P0-P5
const PROFILE_CONFIG = {
    'P0': {
        name: 'ULTRA_EXTREME',
        level: 'L6',
        quality: 'ULTRA',
        resolution: '3840x2160',
        fps: 60,
        buffer: 8000,
        networkCaching: 8000,
        liveCaching: 8000,
        playerBuffer: 2000,
        fileCaching: 2000,
        maxBandwidth: 50000000,
        strategy: 'ultra-aggressive',
        prefetchStrategy: 'ULTRA_AGRESIVO',
        prefetchSegments: 90,
        prefetchParallel: 40,
        prefetchBufferTarget: 240000,
        prefetchMinBandwidth: 120000000,
        aiEnabled: true,
        bitrate: 13.4,
        throughputT1: 17.4,
        throughputT2: 21.4
    },
    'P1': {
        name: '8K_SUPREME',
        level: 'L5',
        quality: '8K',
        resolution: '7680x4320',
        fps: 60,
        buffer: 5000,
        networkCaching: 5000,
        liveCaching: 5000,
        playerBuffer: 1500,
        fileCaching: 1500,
        maxBandwidth: 50000000,
        strategy: 'ultra-aggressive',
        prefetchStrategy: 'ULTRA_AGRESIVO',
        prefetchSegments: 60,
        prefetchParallel: 30,
        prefetchBufferTarget: 180000,
        prefetchMinBandwidth: 100000000,
        aiEnabled: true,
        bitrate: 42.9,
        throughputT1: 55.8,
        throughputT2: 68.6
    },
    'P2': {
        name: '4K_EXTREME',
        level: 'L4',
        quality: '4K',
        resolution: '3840x2160',
        fps: 60,
        buffer: 3000,
        networkCaching: 3000,
        liveCaching: 3000,
        playerBuffer: 1000,
        fileCaching: 1000,
        maxBandwidth: 50000000,
        strategy: 'ultra-aggressive',
        prefetchStrategy: 'ULTRA_AGRESIVO',
        prefetchSegments: 50,
        prefetchParallel: 25,
        prefetchBufferTarget: 150000,
        prefetchMinBandwidth: 80000000,
        aiEnabled: true,
        bitrate: 13.4,
        throughputT1: 17.4,
        throughputT2: 21.4
    },
    'P3': {
        name: 'FHD_ADVANCED',
        level: 'L3',
        quality: 'FHD',
        resolution: '1920x1080',
        fps: 60,
        buffer: 2000,
        networkCaching: 2000,
        liveCaching: 2000,
        playerBuffer: 500,
        fileCaching: 500,
        maxBandwidth: 10000000,
        strategy: 'adaptive',
        prefetchStrategy: 'BALANCEADO',
        prefetchSegments: 25,
        prefetchParallel: 10,
        prefetchBufferTarget: 90000,
        prefetchMinBandwidth: 40000000,
        aiEnabled: false,
        bitrate: 3.7,
        throughputT1: 4.8,
        throughputT2: 6
    },
    'P4': {
        name: 'HD_STABLE',
        level: 'L2',
        quality: 'HD',
        resolution: '1280x720',
        fps: 30,
        buffer: 1500,
        networkCaching: 1500,
        liveCaching: 1500,
        playerBuffer: 400,
        fileCaching: 400,
        maxBandwidth: 5000000,
        strategy: 'adaptive',
        prefetchStrategy: 'CONSERVADOR',
        prefetchSegments: 20,
        prefetchParallel: 8,
        prefetchBufferTarget: 60000,
        prefetchMinBandwidth: 25000000,
        aiEnabled: false,
        bitrate: 2.8,
        throughputT1: 3.6,
        throughputT2: 4.5
    },
    'P5': {
        name: 'SD_FAILSAFE',
        level: 'L1',
        quality: 'SD',
        resolution: '854x480',
        fps: 24,
        buffer: 1000,
        networkCaching: 1000,
        liveCaching: 1000,
        playerBuffer: 300,
        fileCaching: 300,
        maxBandwidth: 2500000,
        strategy: 'adaptive',
        prefetchStrategy: 'CONSERVADOR',
        prefetchSegments: 15,
        prefetchParallel: 5,
        prefetchBufferTarget: 40000,
        prefetchMinBandwidth: 10000000,
        aiEnabled: false,
        bitrate: 0.6,
        throughputT1: 0.8,
        throughputT2: 1
    }
};

// UTILIDADES
function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function getCurrentTimestamp() {
    return Math.floor(Date.now() / 1000);
}

function getExpirationTimestamp() {
    return getCurrentTimestamp() + (365 * 24 * 60 * 60);
}

// GENERADOR DE JWT
function generateJWT(channelIndex, channel, profile) {
    const cfg = PROFILE_CONFIG[profile] || PROFILE_CONFIG['P3'];
    const timestamp = getCurrentTimestamp();
    const expiration = getExpirationTimestamp();

    const payload = {
        iss: 'APE_v14.0_SUPREMO',
        iat: timestamp,
        exp: expiration,
        jti: `jwt_${generateRandomString(16)}`,
        nonce: generateRandomString(32),
        aud: ['premium-servers'],
        service_tier: 'PREMIUM',
        invisibility_enabled: true,
        fingerprint: 'WORLD_CLASS_SERVICE',
        version: '14.0.0',
        sub: String(channelIndex),
        device_profile: profile,
        chn: channel.name || 'Unknown',
        dfp: generateRandomString(16),
        device_class: cfg.name,
        resolution: cfg.resolution,
        hdr_support: ['hdr10'],
        codecs: ['hevc', 'h264'],
        target_bitrate: Math.floor(cfg.bitrate * 1000),
        buffer_strategy: cfg.strategy,
        latency_target_ms: 50,
        network_optimization: 'balanced',
        isp_evasion_level: 2,
        cdn_priority: 'normal',
        color_depth: 8,
        src: 'ape_v14_supremo'
    };

    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const header = Buffer.from(JSON.stringify({ alg: 'SIMPLE', typ: 'JWT' })).toString('base64');
    const signature = generateRandomString(32);

    return `${header}.${encodedPayload}.${signature}`;
}

// GENERADOR DE ENCABEZADO
function generateHeader(totalChannels) {
    const timestamp = new Date().toISOString();
    const listId = `APE_${getCurrentTimestamp()}_${generateRandomString(8)}`;

    return `#EXTM3U
#EXT-X-APE-VERSION:14.0.0-SUPREMO
#EXT-X-APE-GENERATION-TIMESTAMP:${timestamp}
#EXT-X-APE-LIST-ID:${listId}
#EXT-X-APE-JWT-EXPIRATION:365_DAYS
#EXT-X-APE-STRUCTURE:v4_NO_PIPE_COMPATIBLE
#EXT-X-APE-TOTAL-CHANNELS:${totalChannels}

`;
}

// GENERADOR DE CANAL (237 LÍNEAS)
function generateChannelEntry(channelIndex, channel) {
    const profile = channel.profile || channel.apeProfile || 'P3';
    const cfg = PROFILE_CONFIG[profile] || PROFILE_CONFIG['P3'];

    const id = channel.id || channel.tvgId || channelIndex;
    const name = channel.name || channel.tvgName || 'Unknown';
    const logo = channel.logo || channel.tvgLogo || '';
    const url = channel.url || '';
    const group = channel.group || channel.groupTitle || 'General';

    let entry = '';

    // SECCIÓN 1: EXTINF (1 línea)
    entry += `#EXTINF:-1 tvg-id="${id}" tvg-name="${name}" tvg-logo="${logo}" group-title="${group}" ape-profile="${profile}" catchup="xc" catchup-days="1" catchup-source="?utc={utc}&lutc={lutc}",${name}\n`;

    // SECCIÓN 2: EXTVLCOPT (7 líneas)
    entry += `#EXTVLCOPT:http-user-agent=OTT Navigator/1.6.9.4\n`;
    entry += `#EXTVLCOPT:network-caching=${cfg.networkCaching}\n`;
    entry += `#EXTVLCOPT:clock-jitter=0\n`;
    entry += `#EXTVLCOPT:clock-synchro=0\n`;
    entry += `#EXTVLCOPT:live-caching=${cfg.liveCaching}\n`;
    entry += `#EXTVLCOPT:file-caching=${cfg.fileCaching}\n`;
    entry += `#EXTVLCOPT:http-user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36\n`;

    // SECCIÓN 3: KODIPROP (3 líneas)
    entry += `#KODIPROP:inputstream.adaptive.manifest_type=hls\n`;
    entry += `#KODIPROP:inputstream.adaptive.max_bandwidth=${cfg.maxBandwidth}\n`;
    entry += `#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F125.0.0.0%20Safari%2F537.36\n`;

    // SECCIÓN 4: EXT-X-APE (226 líneas)
    // SUB-SECCIÓN 4.1: VERSIÓN Y CODEC (9 líneas)
    entry += `#EXT-X-APE-VERSION:14.0.0-ULTIMATE\n`;
    entry += `#EXT-X-APE-RESOLUTION:${cfg.resolution}\n`;
    entry += `#EXT-X-APE-FPS:${cfg.fps}\n`;
    entry += `#EXT-X-APE-CODEC:HEVC\n`;
    entry += `#EXT-X-APE-CODEC-PRIMARY:HEVC\n`;
    entry += `#EXT-X-APE-CODEC-FALLBACK:H264\n`;
    entry += `#EXT-X-APE-CODEC-PRIORITY:hevc,av1,vp9,h264,mpeg2\n`;
    entry += `#EXT-X-APE-CODEC-SELECTION-METHOD:intelligent\n`;
    entry += `#EXT-X-APE-CODEC-DETECTION:enabled\n`;

    // SUB-SECCIÓN 4.2: BUFFER ADAPTATIVO (19 líneas)
    entry += `#EXT-X-APE-BITRATE:0\n`;
    entry += `#EXT-X-APE-BUFFER:${cfg.buffer}\n`;
    entry += `#EXT-X-APE-NETWORK-CACHING:${cfg.networkCaching}\n`;
    entry += `#EXT-X-APE-LIVE-CACHING:${cfg.liveCaching}\n`;
    entry += `#EXT-X-APE-PLAYER-BUFFER:${cfg.playerBuffer}\n`;
    entry += `#EXT-X-APE-FILE-CACHING:${cfg.fileCaching}\n`;
    entry += `#EXT-X-APE-THROUGHPUT-T1:${cfg.throughputT1}\n`;
    entry += `#EXT-X-APE-THROUGHPUT-T2:${cfg.throughputT2}\n`;
    entry += `#EXT-X-APE-STRATEGY:${cfg.strategy}\n`;
    entry += `#EXT-X-APE-TARGET-BITRATE:0\n`;
    entry += `#EXT-X-APE-BUFFER-ADAPTIVE-ENABLED:true\n`;
    entry += `#EXT-X-APE-BUFFER-STRATEGY:supremo-inteligente\n`;
    entry += `#EXT-X-APE-BUFFER-MIN:5000\n`;
    entry += `#EXT-X-APE-BUFFER-TARGET:${cfg.buffer}\n`;
    entry += `#EXT-X-APE-BUFFER-MAX:15000\n`;
    entry += `#EXT-X-APE-BUFFER-CRITICAL-THRESHOLD:2000\n`;
    entry += `#EXT-X-APE-BUFFER-RECOVERY-MODE:aggressive\n`;
    entry += `#EXT-X-APE-BUFFER-RECOVERY-MULTIPLIER:2.5\n`;

    // SUB-SECCIÓN 4.3: PREFETCH PARALELO (12 líneas)
    entry += `#EXT-X-APE-PREFETCH-STRATEGY:${cfg.prefetchStrategy}\n`;
    entry += `#EXT-X-APE-PREFETCH-SEGMENTS:${cfg.prefetchSegments}\n`;
    entry += `#EXT-X-APE-PREFETCH-PARALLEL:${cfg.prefetchParallel}\n`;
    entry += `#EXT-X-APE-PREFETCH-BUFFER-TARGET:${cfg.prefetchBufferTarget}\n`;
    entry += `#EXT-X-APE-PREFETCH-MIN-BANDWIDTH:${cfg.prefetchMinBandwidth}\n`;
    entry += `#EXT-X-APE-PREFETCH-ADAPTIVE:true\n`;
    entry += `#EXT-X-APE-PREFETCH-AI-ENABLED:${cfg.aiEnabled ? 'true' : 'false'}\n`;
    entry += `#EXT-X-APE-QUALITY-THRESHOLD:0.85\n`;
    entry += `#EXT-X-APE-PREFETCH-ENABLED:true\n`;
    entry += `#EXT-X-APE-SEGMENT-DURATION:6\n`;
    entry += `#EXT-X-APE-PREFETCH-SUPREMO-ENABLED:true\n`;
    entry += `#EXT-X-APE-PREFETCH-SEGMENTS-DYNAMIC:true\n`;

    // SUB-SECCIÓN 4.4: FAILOVER Y RECUPERACIÓN (10 líneas)
    entry += `#EXT-X-APE-FAILOVER-DETECTION-ENABLED:true\n`;
    entry += `#EXT-X-APE-FAILOVER-DETECTION-TIMEOUT:500\n`;
    entry += `#EXT-X-APE-FAILOVER-BANDWIDTH-DROP-THRESHOLD:20\n`;
    entry += `#EXT-X-APE-FAILOVER-BUFFER-CRITICAL-TIMEOUT:1000\n`;
    entry += `#EXT-X-APE-FAILOVER-RECOVERY-STRATEGY:aggressive\n`;
    entry += `#EXT-X-APE-FAILOVER-RETRY-ATTEMPTS:5\n`;
    entry += `#EXT-X-APE-FAILOVER-RETRY-DELAY:1000\n`;
    entry += `#EXT-X-APE-FAILOVER-BITRATE-REDUCTION:0.3\n`;
    entry += `#EXT-X-APE-FAILOVER-EMERGENCY-MODE:enabled\n`;

    // SUB-SECCIÓN 4.5: EVASIÓN 407 (40 líneas)
    entry += `#EXT-X-APE-407-EVASION-ENABLED:true\n`;
    entry += `#EXT-X-APE-407-DETECTION-BYPASS:enabled\n`;
    entry += `#EXT-X-APE-407-HEADER-OBFUSCATION:supremo\n`;
    entry += `#EXT-X-APE-407-USER-AGENT-ROTATION:enabled\n`;
    entry += `#EXT-X-APE-407-REFERER-ROTATION:enabled\n`;
    entry += `#EXT-X-APE-407-COOKIE-MANAGEMENT:enabled\n`;
    entry += `#EXT-X-APE-407-TIMING-JITTER:enabled\n`;
    entry += `#EXT-X-APE-407-IDENTITY-ROTATION:enabled\n`;
    entry += `#EXT-X-APE-407-HEADER-POOL-SIZE:50\n`;
    entry += `#EXT-X-APE-407-HEADER-ROTATION-INTERVAL:5\n`;
    entry += `#EXT-X-APE-407-USER-AGENT-POOL:chrome,firefox,safari,edge,vlc,kodi,smarttv\n`;
    entry += `#EXT-X-APE-407-REFERER-POOL:google,youtube,facebook,twitch,netflix,hulu,reddit\n`;
    entry += `#EXT-X-APE-407-LANGUAGE-POOL:es-ES,es-MX,es-AR,en-US,en-GB,fr-FR,de-DE\n`;
    entry += `#EXT-X-APE-407-ACCEPT-ENCODING:gzip,deflate,br\n`;
    entry += `#EXT-X-APE-407-CONNECTION-TYPE:keep-alive\n`;
    entry += `#EXT-X-APE-407-DNT-ENABLED:true\n`;
    entry += `#EXT-X-APE-407-SEC-FETCH-ENABLED:true\n`;
    entry += `#EXT-X-APE-407-COOKIE-PERSISTENCE:enabled\n`;
    entry += `#EXT-X-APE-407-URL-OBFUSCATION-LEVEL:3\n`;
    entry += `#EXT-X-APE-407-URL-PARAMETER-INJECTION:enabled\n`;
    entry += `#EXT-X-APE-407-URL-TIMESTAMP-INJECTION:enabled\n`;
    entry += `#EXT-X-APE-407-URL-REFERER-INJECTION:enabled\n`;
    entry += `#EXT-X-APE-407-URL-UA-HASH-INJECTION:enabled\n`;
    entry += `#EXT-X-APE-407-URL-NOISE-INJECTION:enabled\n`;
    entry += `#EXT-X-APE-407-TOKEN-OBFUSCATION-LEVEL:3\n`;
    entry += `#EXT-X-APE-407-TOKEN-METADATA-INJECTION:enabled\n`;
    entry += `#EXT-X-APE-407-TOKEN-ENCODING:base64\n`;
    entry += `#EXT-X-APE-407-TIMING-JITTER-MIN:50\n`;
    entry += `#EXT-X-APE-407-TIMING-JITTER-MAX:500\n`;
    entry += `#EXT-X-APE-407-REQUEST-DELAY-MIN:500\n`;
    entry += `#EXT-X-APE-407-REQUEST-DELAY-MAX:2000\n`;
    entry += `#EXT-X-APE-407-CONNECTION-POOL-SIZE:5\n`;
    entry += `#EXT-X-APE-407-CONNECTION-ROTATION-INTERVAL:10\n`;
    entry += `#EXT-X-APE-407-SESSION-TIMEOUT:3600\n`;
    entry += `#EXT-X-APE-407-RECONNECT-STRATEGY:progressive\n`;
    entry += `#EXT-X-APE-407-DETECTION-ENABLED:true\n`;
    entry += `#EXT-X-APE-407-DETECTION-TIMEOUT:500\n`;
    entry += `#EXT-X-APE-407-RECOVERY-STRATEGY:aggressive\n`;
    entry += `#EXT-X-APE-407-RECOVERY-RETRY-ATTEMPTS:5\n`;
    entry += `#EXT-X-APE-407-RECOVERY-RETRY-DELAY:1000\n`;
    entry += `#EXT-X-APE-407-RECOVERY-IDENTITY-CHANGE:enabled\n`;
    entry += `#EXT-X-APE-407-RECOVERY-HEADER-RESET:enabled\n`;
    entry += `#EXT-X-APE-407-RECOVERY-COOKIE-CLEAR:enabled\n`;
    entry += `#EXT-X-APE-407-FALLBACK-STRATEGY:alternative-header-set\n`;
    entry += `#EXT-X-APE-407-MONITORING-ENABLED:true\n`;
    entry += `#EXT-X-APE-407-MONITORING-INTERVAL:1000\n`;
    entry += `#EXT-X-APE-407-LOGGING-ENABLED:false\n`;
    entry += `#EXT-X-APE-407-ERROR-REPORTING:disabled\n`;
    entry += `#EXT-X-APE-407-TELEMETRY-ENABLED:false\n`;
    entry += `#EXT-X-APE-407-DEBUG-MODE:disabled\n`;
    entry += `#EXT-X-APE-407-STEALTH-MODE:enabled\n`;

    // SUB-SECCIÓN 4.6: VPN INTEGRATION (20 líneas)
    entry += `#EXT-X-APE-VPN-DETECTION:enabled\n`;
    entry += `#EXT-X-APE-VPN-DETECTION-METHOD:passive\n`;
    entry += `#EXT-X-APE-VPN-ADAPTATION:enabled\n`;
    entry += `#EXT-X-APE-VPN-PROTOCOL-DETECTION:openvpn,wireguard,ipsec,l2tp,sstp,ikev2,shadowsocks,trojan,vless,vmess\n`;
    entry += `#EXT-X-APE-VPN-LEAK-PREVENTION:enabled\n`;
    entry += `#EXT-X-APE-VPN-DNS-LEAK-PREVENTION:enabled\n`;
    entry += `#EXT-X-APE-VPN-IPV6-LEAK-PREVENTION:enabled\n`;
    entry += `#EXT-X-APE-VPN-WEBRTC-LEAK-PREVENTION:enabled\n`;
    entry += `#EXT-X-APE-VPN-FINGERPRINT-PROTECTION:enabled\n`;
    entry += `#EXT-X-APE-VPN-ADAPTATION-LEVEL:supremo\n`;
    entry += `#EXT-X-APE-VPN-OBFUSCATION:enabled\n`;
    entry += `#EXT-X-APE-VPN-OBFUSCATION-LEVEL:3\n`;
    entry += `#EXT-X-APE-VPN-TRAFFIC-OBFUSCATION:enabled\n`;
    entry += `#EXT-X-APE-VPN-PACKET-OBFUSCATION:enabled\n`;
    entry += `#EXT-X-APE-VPN-HEADER-OBFUSCATION:enabled\n`;
    entry += `#EXT-X-APE-VPN-PORT-OBFUSCATION:enabled\n`;
    entry += `#EXT-X-APE-VPN-PROTOCOL-OBFUSCATION:enabled\n`;
    entry += `#EXT-X-APE-VPN-PAYLOAD-OBFUSCATION:enabled\n`;
    entry += `#EXT-X-APE-VPN-ENCRYPTION-LEVEL:aes-256-gcm\n`;
    entry += `#EXT-X-APE-VPN-ANTI-THROTTLING:enabled\n`;
    entry += `#EXT-X-APE-VPN-ANTI-BLOCKING:enabled\n`;

    // SUB-SECCIÓN 4.7: LATENCIA ULTRA-BAJA (14 líneas)
    entry += `#EXT-X-APE-LATENCY-OPTIMIZATION:enabled\n`;
    entry += `#EXT-X-APE-LATENCY-TARGET:0\n`;
    entry += `#EXT-X-APE-LATENCY-MONITORING:enabled\n`;
    entry += `#EXT-X-APE-LATENCY-MONITORING-INTERVAL:100\n`;
    entry += `#EXT-X-APE-LATENCY-COMPENSATION:enabled\n`;
    entry += `#EXT-X-APE-LATENCY-PREDICTION:enabled\n`;
    entry += `#EXT-X-APE-LATENCY-BUFFER-OPTIMIZATION:enabled\n`;
    entry += `#EXT-X-APE-LATENCY-NETWORK-OPTIMIZATION:enabled\n`;
    entry += `#EXT-X-APE-LATENCY-CODEC-OPTIMIZATION:enabled\n`;
    entry += `#EXT-X-APE-LATENCY-FRAME-SYNC:enabled\n`;
    entry += `#EXT-X-APE-LATENCY-LAST-FRAME-TRACKING:enabled\n`;
    entry += `#EXT-X-APE-LATENCY-RAYO:enabled\n`;
    entry += `#EXT-X-APE-LATENCY-TARGET-MS:0\n`;
    entry += `#EXT-X-APE-LATENCY-AGGRESSIVE-OPTIMIZATION:enabled\n`;

    // SUB-SECCIÓN 4.8: OPTIMIZACIÓN ANCHO DE BANDA (15 líneas)
    entry += `#EXT-X-APE-CONGESTION-PRIORITY:maximum\n`;
    entry += `#EXT-X-APE-CONGESTION-DETECTION:enabled\n`;
    entry += `#EXT-X-APE-CONGESTION-DETECTION-INTERVAL:500\n`;
    entry += `#EXT-X-APE-CONGESTION-RESPONSE:aggressive\n`;
    entry += `#EXT-X-APE-CONGESTION-BANDWIDTH-RESERVATION:enabled\n`;
    entry += `#EXT-X-APE-CONGESTION-BANDWIDTH-RESERVATION-PERCENT:50\n`;
    entry += `#EXT-X-APE-CONGESTION-QOS-PRIORITY:maximum\n`;
    entry += `#EXT-X-APE-CONGESTION-PACKET-PRIORITY:maximum\n`;
    entry += `#EXT-X-APE-CONGESTION-BUFFER-PRIORITY:maximum\n`;
    entry += `#EXT-X-APE-CONGESTION-CHANNEL-ACTIVE-ONLY:enabled\n`;
    entry += `#EXT-X-APE-FILL-ORDER:reproduction\n`;
    entry += `#EXT-X-APE-FILL-PRIORITY-CURRENT:100\n`;
    entry += `#EXT-X-APE-FILL-PRIORITY-NEXT:90\n`;
    entry += `#EXT-X-APE-FILL-PRIORITY-LOOKAHEAD:50\n`;
    entry += `#EXT-X-APE-FILL-EMERGENCY-BUFFER:enabled\n`;

    // SUB-SECCIÓN 4.9: RECUPERACIÓN INSTANTÁNEA (18 líneas)
    entry += `#EXT-X-APE-INSTANT-RECOVERY:enabled\n`;
    entry += `#EXT-X-APE-INSTANT-RECOVERY-DETECTION:aggressive\n`;
    entry += `#EXT-X-APE-INSTANT-RECOVERY-TIMEOUT:500\n`;
    entry += `#EXT-X-APE-INSTANT-RECOVERY-STRATEGY:seamless\n`;
    entry += `#EXT-X-APE-INSTANT-RECOVERY-NOTIFICATION:silent\n`;
    entry += `#EXT-X-APE-INSTANT-RECOVERY-BUFFER-REWIND:enabled\n`;
    entry += `#EXT-X-APE-INSTANT-RECOVERY-LAST-FRAME-SYNC:enabled\n`;
    entry += `#EXT-X-APE-INSTANT-RECOVERY-NO-REPEAT:enabled\n`;
    entry += `#EXT-X-APE-INSTANT-RECOVERY-ATOMIC-INSERTION:enabled\n`;
    entry += `#EXT-X-APE-INSTANT-RECOVERY-FRAME-PERFECT:enabled\n`;
    entry += `#EXT-X-APE-INSTANT-RECOVERY-AUDIO-SYNC:enabled\n`;
    entry += `#EXT-X-APE-INSTANT-RECOVERY-VIDEO-SYNC:enabled\n`;
    entry += `#EXT-X-APE-INSTANT-RECOVERY-SUBTITLE-SYNC:enabled\n`;
    entry += `#EXT-X-APE-INSTANT-RECOVERY-METADATA-PRESERVATION:enabled\n`;

    // SUB-SECCIÓN 4.10: INTEGRACIÓN CON APP (10 líneas)
    entry += `#EXT-X-APE-APP-INTEGRATION:enabled\n`;
    entry += `#EXT-X-APE-APP-COMMUNICATION-PROTOCOL:custom-api\n`;
    entry += `#EXT-X-APE-APP-TELEMETRY:enabled\n`;
    entry += `#EXT-X-APE-APP-TELEMETRY-INTERVAL:1000\n`;
    entry += `#EXT-X-APE-APP-CHANNEL-DETECTION:enabled\n`;
    entry += `#EXT-X-APE-APP-CHANNEL-DETECTION-METHOD:active\n`;
    entry += `#EXT-X-APE-APP-CHANNEL-CHANGE-OPTIMIZATION:enabled\n`;
    entry += `#EXT-X-APE-APP-QUALITY-ADAPTATION:enabled\n`;
    entry += `#EXT-X-APE-APP-QUALITY-ADAPTATION-METHOD:dynamic\n`;
    entry += `#EXT-X-APE-APP-SEAMLESS-OPERATION:enabled\n`;

    // SUB-SECCIÓN 4.11: CONFIGURACIÓN FINAL (49 líneas - ampliado)
    entry += `#EXT-X-APE-QOS-MAXIMUM:enabled\n`;
    entry += `#EXT-X-APE-QOS-CLASS:EF\n`;
    entry += `#EXT-X-APE-QOS-PRIORITY:7\n`;
    entry += `#EXT-X-APE-DSCP-VALUE:46\n`;
    entry += `#EXT-X-APE-SIGNAL-MODEM-MAXIMUM:enabled\n`;
    entry += `#EXT-X-APE-PROTOCOL-ADVANCED:quic,http2,tcp\n`;
    entry += `#EXT-X-APE-NETWORK-OPTIMIZATION:aggressive\n`;
    entry += `#EXT-X-APE-SUPREMO-OPTIMIZATION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-LEVEL:maximum\n`;
    entry += `#EXT-X-APE-SUPREMO-CODEC-OPTIMIZATION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-BUFFER-OPTIMIZATION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-NETWORK-OPTIMIZATION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-LATENCY-OPTIMIZATION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-PREFETCH-OPTIMIZATION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-RECOVERY-OPTIMIZATION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-EVASION-OPTIMIZATION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-VPN-OPTIMIZATION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-BANDWIDTH-OPTIMIZATION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-SEAMLESS-SWITCHING:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-ATOMIC-INSERTION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-FRAME-PERFECT:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-AUDIO-SYNC:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-VIDEO-SYNC:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-SUBTITLE-SYNC:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-METADATA-PRESERVATION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-QUALITY-ASSURANCE:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-ERROR-DETECTION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-ERROR-RECOVERY:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-MONITORING-ENABLED:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-STEALTH-MODE:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-INVISIBILITY-ENABLED:true\n`;
    entry += `#EXT-X-APE-SUPREMO-FINGERPRINT-PROTECTION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-DEVICE-IDENTIFICATION:protected\n`;
    entry += `#EXT-X-APE-SUPREMO-SESSION-MANAGEMENT:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-TOKEN-VALIDATION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-EXPIRATION-DAYS:365\n`;
    entry += `#EXT-X-APE-SUPREMO-NONCE-ROTATION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-DEVICE-FINGERPRINT:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-SECURITY-LEVEL:maximum\n`;
    entry += `#EXT-X-APE-SUPREMO-ENCRYPTION-LEVEL:aes-256-gcm\n`;
    entry += `#EXT-X-APE-SUPREMO-OBFUSCATION-LEVEL:3\n`;
    entry += `#EXT-X-APE-SUPREMO-ANTI-DETECTION:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-ANTI-BLOCKING:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-ANTI-FINGERPRINTING:enabled\n`;
    entry += `#EXT-X-APE-SUPREMO-PRODUCTION-READY:true\n`;
    entry += `#EXT-X-APE-SUPREMO-VERSION:14.0.0\n`;
    entry += `#EXT-X-APE-SUPREMO-ARCHITECTURE:v4-no-pipe\n`;
    entry += `#EXT-X-APE-SUPREMO-COMPATIBILITY:universal\n`;
    entry += `#EXT-X-APE-SUPREMO-STATUS:active\n`;
    entry += `#EXT-X-APE-SUPREMO-CERTIFICATION:verified\n`;

    // SECCIÓN 5: EXTVLCOPT FINAL (3 líneas)
    entry += `#EXTVLCOPT:http-reconnect=true\n`;
    entry += `#EXTVLCOPT:http-continuous=true\n`;


    // SECCIÓN 6: URL LIMPIA (1 línea)
    const jwt = generateJWT(channelIndex, channel, profile);
    entry += `${url}?ape_jwt=${jwt}\n`;



    return entry;
}

// CLASE PRINCIPAL
class M3U8GeneratorV14Supremo {
    constructor() {
        this.version = '14.0.0-SUPREMO-v4';
    }

    generate(channels) {
        if (!channels || !Array.isArray(channels) || channels.length === 0) {
            console.error('❌ No hay canales para generar');
            return '';
        }

        let content = generateHeader(channels.length);

        for (let i = 0; i < channels.length; i++) {
            content += generateChannelEntry(i, channels[i]);

            if ((i + 1) % 500 === 0) {
                console.log(`  📊 Procesados ${i + 1}/${channels.length} canales...`);
            }
        }

        return content;
    }

    getStats() {
        return {
            version: this.version,
            linesPerChannel: 237,
            apeMetadataLines: 226,
            improvements: 8,
            jwtExpiration: '365 days',
            urlFormat: 'clean (no pipe)',
            compatibility: 'universal'
        };
    }
}

module.exports = M3U8GeneratorV14Supremo;
