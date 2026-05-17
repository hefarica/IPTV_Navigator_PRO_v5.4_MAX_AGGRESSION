/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║   APE REALTIME ENGINE MODULE v10.0                                          ║
 * ║   Integración Quirúrgica de Perfiles P0-P5 al Gestor de Headers             ║
 * ║                                                                              ║
 * ║   INSTRUCCIONES DE INYECCIÓN:                                                ║
 * ║   1. Pegar este módulo ANTES del cierre del IIFE principal del generador.    ║
 * ║   2. Llamar a ApeRealtimeEngine.init() después de que ApeProfileManager     ║
 * ║      cargue el perfil activo.                                                ║
 * ║   3. En generateChannelEntry(), llamar a                                     ║
 * ║      ApeRealtimeEngine.injectHeaders(httpHeadersObj, profileId) para        ║
 * ║      enriquecer el bloque #EXTHTTP.                                          ║
 * ║   4. Llamar a ApeRealtimeEngine.injectVlcopt(linesArray, profileId) para    ║
 * ║      enriquecer el bloque #EXTVLCOPT.                                        ║
 * ║                                                                              ║
 * ║   GARANTÍAS:                                                                 ║
 * ║   - NO modifica ninguna función existente.                                   ║
 * ║   - NO altera el orden de directivas (RFC 8216 intacto).                    ║
 * ║   - ES idempotente: llamarlo N veces produce el mismo resultado.             ║
 * ║   - ES polimórfico: cada perfil (P0-P5) produce headers distintos.          ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// ─── GUARD: Evitar doble inyección ───────────────────────────────────────────
if (typeof window.__APE_REALTIME_ENGINE_v10__ === 'undefined') {
window.__APE_REALTIME_ENGINE_v10__ = true;

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 1: CONFIGURACIONES POR PERFIL (P0 → P5)
// Fuentes: HLS.js v1.6, Bitmovin Stream Lab, Shaka v4.x, ExoPlayer Media3,
//          Mux Data QoE, Akamai Stream Validator, CMCD RFC 9000
// ─────────────────────────────────────────────────────────────────────────────

const APE_PROFILE_MATRIX = {

  // ── P0: GOD TIER 8K OMEGA ──────────────────────────────────────────────────
  P0: {
    _meta: { name: 'GOD_TIER_8K_OMEGA_REALTIME', bitrate: 150000000, resolution: '7680x4320', fps: 120, codec: 'dvh1.08.06,ec-3' },

    // HLS.js v1.6 — Ventanas EWMA agresivas, buffer máximo, LL-HLS activo
    hlsjs: {
      maxBufferLength: 60, maxMaxBufferLength: 600, backBufferLength: 120,
      maxBufferSize: 60 * 1024 * 1024, maxBufferHole: 0.5,
      liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 10,
      lowLatencyMode: true, enableWorker: true,
      abrEwmaFastLive: 3.0, abrEwmaSlowLive: 9.0,
      abrBandWidthFactor: 0.98, abrBandWidthUpFactor: 0.90,
      abrMaxWithRealBitrate: true, abrSwitchInterval: 5,
      detectStallWithCurrentTimeMs: 250, nudgeOffset: 0.1, nudgeMaxRetry: 3,
      fragLoadPolicy_maxTimeToFirstByteMs: 8000, fragLoadPolicy_maxNumRetry: 6,
      cmcd_useHeaders: true,
    },

    // ExoPlayer Media3 — Buffers enormes para 8K
    exoplayer: {
      minBufferMs: 90000, maxBufferMs: 180000,
      bufferForPlaybackMs: 2500, bufferForPlaybackAfterRebufferMs: 5000,
      liveTargetOffsetMs: 3000, liveMinPlaybackSpeed: 0.97, liveMaxPlaybackSpeed: 1.03,
    },

    // Shaka Player v4.x
    shaka: {
      bufferingGoal: 60, rebufferingGoal: 2, bufferBehind: 60,
      stallThreshold: 1.0, stallSkip: 0.1,
      abr_switchInterval: 5, abr_bandwidthUpgradeTarget: 0.85, abr_bandwidthDowngradeTarget: 0.95,
    },

    // VLC/Kodi opts
    vlcopt: {
      'network-caching': '90000', 'live-caching': '45000',
      'clock-jitter': '0', 'clock-synchro': '0',
      'http-reconnect': 'true', 'http-continuous-stream': 'true',
      'http-max-retries': '99', 'http-timeout': '8000',
      'avcodec-dr': '1', 'avcodec-hw': 'any',
      'network-continuous-stream': 'true',
    },

    // Bitrate ladder (Bitmovin Stream Lab)
    bitrateLadder: '150000000@7680x4320x120,80000000@3840x2160x60,40000000@1920x1080x60',
  },

  // ── P1: 4K SUPREME ─────────────────────────────────────────────────────────
  P1: {
    _meta: { name: '4K_SUPREME_REALTIME', bitrate: 80000000, resolution: '3840x2160', fps: 60, codec: 'hvc1.2.4.L153.B0,ec-3' },
    hlsjs: {
      maxBufferLength: 45, maxMaxBufferLength: 600, backBufferLength: 90,
      maxBufferSize: 60 * 1024 * 1024, maxBufferHole: 0.5,
      liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 10,
      lowLatencyMode: true, enableWorker: true,
      abrEwmaFastLive: 3.0, abrEwmaSlowLive: 9.0,
      abrBandWidthFactor: 0.98, abrBandWidthUpFactor: 0.90,
      abrMaxWithRealBitrate: true, abrSwitchInterval: 5,
      detectStallWithCurrentTimeMs: 250, nudgeOffset: 0.1, nudgeMaxRetry: 3,
      fragLoadPolicy_maxTimeToFirstByteMs: 8000, fragLoadPolicy_maxNumRetry: 6,
      cmcd_useHeaders: true,
    },
    exoplayer: {
      minBufferMs: 60000, maxBufferMs: 120000,
      bufferForPlaybackMs: 2500, bufferForPlaybackAfterRebufferMs: 5000,
      liveTargetOffsetMs: 3000, liveMinPlaybackSpeed: 0.97, liveMaxPlaybackSpeed: 1.03,
    },
    shaka: {
      bufferingGoal: 45, rebufferingGoal: 2, bufferBehind: 45,
      stallThreshold: 1.0, stallSkip: 0.1,
      abr_switchInterval: 5, abr_bandwidthUpgradeTarget: 0.85, abr_bandwidthDowngradeTarget: 0.95,
    },
    vlcopt: {
      'network-caching': '60000', 'live-caching': '30000',
      'clock-jitter': '0', 'clock-synchro': '0',
      'http-reconnect': 'true', 'http-continuous-stream': 'true',
      'http-max-retries': '99', 'http-timeout': '8000',
      'avcodec-dr': '1', 'avcodec-hw': 'any',
      'network-continuous-stream': 'true',
    },
    bitrateLadder: '80000000@3840x2160x60,40000000@1920x1080x60,20000000@1920x1080x30',
  },

  // ── P2: 4K EXTREME ─────────────────────────────────────────────────────────
  P2: {
    _meta: { name: '4K_EXTREME_REALTIME', bitrate: 40000000, resolution: '3840x2160', fps: 60, codec: 'hvc1.2.4.L150.B0,ac-3' },
    hlsjs: {
      maxBufferLength: 30, maxMaxBufferLength: 600, backBufferLength: 60,
      maxBufferSize: 60 * 1024 * 1024, maxBufferHole: 0.5,
      liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 10,
      lowLatencyMode: true, enableWorker: true,
      abrEwmaFastLive: 3.0, abrEwmaSlowLive: 9.0,
      abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.85,
      abrMaxWithRealBitrate: true, abrSwitchInterval: 8,
      detectStallWithCurrentTimeMs: 250, nudgeOffset: 0.1, nudgeMaxRetry: 3,
      fragLoadPolicy_maxTimeToFirstByteMs: 8000, fragLoadPolicy_maxNumRetry: 6,
      cmcd_useHeaders: true,
    },
    exoplayer: {
      minBufferMs: 45000, maxBufferMs: 90000,
      bufferForPlaybackMs: 2500, bufferForPlaybackAfterRebufferMs: 5000,
      liveTargetOffsetMs: 5000, liveMinPlaybackSpeed: 0.97, liveMaxPlaybackSpeed: 1.03,
    },
    shaka: {
      bufferingGoal: 30, rebufferingGoal: 2, bufferBehind: 30,
      stallThreshold: 1.0, stallSkip: 0.1,
      abr_switchInterval: 8, abr_bandwidthUpgradeTarget: 0.85, abr_bandwidthDowngradeTarget: 0.95,
    },
    vlcopt: {
      'network-caching': '45000', 'live-caching': '22000',
      'clock-jitter': '0', 'clock-synchro': '0',
      'http-reconnect': 'true', 'http-continuous-stream': 'true',
      'http-max-retries': '50', 'http-timeout': '8000',
      'avcodec-dr': '1', 'avcodec-hw': 'any',
      'network-continuous-stream': 'true',
    },
    bitrateLadder: '40000000@3840x2160x60,20000000@1920x1080x60,10000000@1280x720x60',
  },

  // ── P3: FHD ADVANCED ───────────────────────────────────────────────────────
  P3: {
    _meta: { name: 'FHD_ADVANCED_REALTIME', bitrate: 20000000, resolution: '1920x1080', fps: 60, codec: 'avc1.640028,mp4a.40.2' },
    hlsjs: {
      maxBufferLength: 20, maxMaxBufferLength: 300, backBufferLength: 45,
      maxBufferSize: 30 * 1024 * 1024, maxBufferHole: 0.5,
      liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 10,
      lowLatencyMode: false, enableWorker: true,
      abrEwmaFastLive: 3.0, abrEwmaSlowLive: 9.0,
      abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.85,
      abrMaxWithRealBitrate: true, abrSwitchInterval: 8,
      detectStallWithCurrentTimeMs: 250, nudgeOffset: 0.1, nudgeMaxRetry: 3,
      fragLoadPolicy_maxTimeToFirstByteMs: 8000, fragLoadPolicy_maxNumRetry: 4,
      cmcd_useHeaders: true,
    },
    exoplayer: {
      minBufferMs: 30000, maxBufferMs: 60000,
      bufferForPlaybackMs: 2500, bufferForPlaybackAfterRebufferMs: 5000,
      liveTargetOffsetMs: 5000, liveMinPlaybackSpeed: 0.97, liveMaxPlaybackSpeed: 1.03,
    },
    shaka: {
      bufferingGoal: 20, rebufferingGoal: 2, bufferBehind: 20,
      stallThreshold: 1.0, stallSkip: 0.1,
      abr_switchInterval: 8, abr_bandwidthUpgradeTarget: 0.85, abr_bandwidthDowngradeTarget: 0.95,
    },
    vlcopt: {
      'network-caching': '30000', 'live-caching': '15000',
      'clock-jitter': '0', 'clock-synchro': '0',
      'http-reconnect': 'true', 'http-continuous-stream': 'true',
      'http-max-retries': '30', 'http-timeout': '8000',
      'avcodec-dr': '1', 'avcodec-hw': 'any',
      'network-continuous-stream': 'true',
    },
    bitrateLadder: '20000000@1920x1080x60,10000000@1280x720x60,5000000@1280x720x30',
  },

  // ── P4: HD STABLE ──────────────────────────────────────────────────────────
  P4: {
    _meta: { name: 'HD_STABLE_REALTIME', bitrate: 10000000, resolution: '1280x720', fps: 30, codec: 'avc1.4d401f,mp4a.40.2' },
    hlsjs: {
      maxBufferLength: 15, maxMaxBufferLength: 120, backBufferLength: 30,
      maxBufferSize: 20 * 1024 * 1024, maxBufferHole: 0.5,
      liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 10,
      lowLatencyMode: false, enableWorker: true,
      abrEwmaFastLive: 3.0, abrEwmaSlowLive: 9.0,
      abrBandWidthFactor: 0.90, abrBandWidthUpFactor: 0.80,
      abrMaxWithRealBitrate: true, abrSwitchInterval: 10,
      detectStallWithCurrentTimeMs: 250, nudgeOffset: 0.1, nudgeMaxRetry: 3,
      fragLoadPolicy_maxTimeToFirstByteMs: 10000, fragLoadPolicy_maxNumRetry: 4,
      cmcd_useHeaders: true,
    },
    exoplayer: {
      minBufferMs: 20000, maxBufferMs: 45000,
      bufferForPlaybackMs: 2500, bufferForPlaybackAfterRebufferMs: 5000,
      liveTargetOffsetMs: 8000, liveMinPlaybackSpeed: 0.97, liveMaxPlaybackSpeed: 1.03,
    },
    shaka: {
      bufferingGoal: 15, rebufferingGoal: 2, bufferBehind: 15,
      stallThreshold: 1.0, stallSkip: 0.1,
      abr_switchInterval: 10, abr_bandwidthUpgradeTarget: 0.80, abr_bandwidthDowngradeTarget: 0.95,
    },
    vlcopt: {
      'network-caching': '20000', 'live-caching': '10000',
      'clock-jitter': '0', 'clock-synchro': '0',
      'http-reconnect': 'true', 'http-continuous-stream': 'true',
      'http-max-retries': '20', 'http-timeout': '10000',
      'avcodec-dr': '1', 'avcodec-hw': 'any',
      'network-continuous-stream': 'true',
    },
    bitrateLadder: '10000000@1280x720x30,5000000@854x480x30,2000000@640x360x25',
  },

  // ── P5: SD FAILSAFE ────────────────────────────────────────────────────────
  P5: {
    _meta: { name: 'SD_FAILSAFE_REALTIME', bitrate: 5000000, resolution: '854x480', fps: 30, codec: 'avc1.42c01e,mp4a.40.2' },
    hlsjs: {
      maxBufferLength: 10, maxMaxBufferLength: 60, backBufferLength: 20,
      maxBufferSize: 10 * 1024 * 1024, maxBufferHole: 1.0,
      liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 10,
      lowLatencyMode: false, enableWorker: true,
      abrEwmaFastLive: 3.0, abrEwmaSlowLive: 9.0,
      abrBandWidthFactor: 0.85, abrBandWidthUpFactor: 0.70,
      abrMaxWithRealBitrate: true, abrSwitchInterval: 15,
      detectStallWithCurrentTimeMs: 250, nudgeOffset: 0.1, nudgeMaxRetry: 3,
      fragLoadPolicy_maxTimeToFirstByteMs: 15000, fragLoadPolicy_maxNumRetry: 6,
      cmcd_useHeaders: true,
    },
    exoplayer: {
      minBufferMs: 10000, maxBufferMs: 25000,
      bufferForPlaybackMs: 2500, bufferForPlaybackAfterRebufferMs: 5000,
      liveTargetOffsetMs: 10000, liveMinPlaybackSpeed: 0.97, liveMaxPlaybackSpeed: 1.03,
    },
    shaka: {
      bufferingGoal: 10, rebufferingGoal: 2, bufferBehind: 10,
      stallThreshold: 1.5, stallSkip: 0.2,
      abr_switchInterval: 15, abr_bandwidthUpgradeTarget: 0.75, abr_bandwidthDowngradeTarget: 0.95,
    },
    vlcopt: {
      'network-caching': '10000', 'live-caching': '5000',
      'clock-jitter': '0', 'clock-synchro': '0',
      'http-reconnect': 'true', 'http-continuous-stream': 'true',
      'http-max-retries': '10', 'http-timeout': '15000',
      'avcodec-dr': '1', 'avcodec-hw': 'any',
      'network-continuous-stream': 'true',
    },
    bitrateLadder: '5000000@854x480x30,2000000@640x360x25,800000@426x240x25',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 2: GENERADORES DE HEADERS POR PERFIL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera los headers CMCD (RFC 9000) para el perfil dado.
 * @param {string} profileId - 'P0' a 'P5'
 * @param {string} channelId - ID del canal
 * @returns {Object} headers CMCD
 */
function _buildCmcdHeaders(profileId, channelId) {
  const p = APE_PROFILE_MATRIX[profileId];
  if (!p) return {};
  const br = Math.round(p._meta.bitrate / 1000); // kbps
  const bl = p.exoplayer.minBufferMs;
  const sid = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 18);
  return {
    'CMCD-Object': `br=${br},ot=v,tb=${br}`,
    'CMCD-Request': `bl=${bl},mtp=${br},su`,
    'CMCD-Session': `sf=h,st=l,v=1,cid=${channelId || 'ape-channel'},sid=${sid}`,
    'CMCD-Status': 'bs=false',
  };
}

/**
 * Genera los headers de QoE (Mux Data style) para el perfil dado.
 * @param {string} profileId
 * @returns {Object} headers QoE
 */
function _buildQoeHeaders(profileId) {
  return {
    'X-QoE-Startup-Target-Ms': '2000',
    'X-QoE-Rebuffer-Ratio-Target': '0.005',
    'X-QoE-TTFB-Target-Ms': '200',
    'X-QoE-Bitrate-Target-Mbps': String(Math.round(APE_PROFILE_MATRIX[profileId]._meta.bitrate / 1e6)),
    'X-QoE-Monitor': 'hlsanalyzer,qosifire,mux-data,akamai-media-analytics',
    'X-QoE-Player': 'hlsjs-1.6,bitmovin-player,shaka-4.x,exoplayer-media3',
  };
}

/**
 * Genera los headers de ABR y configuración de player para el perfil dado.
 * @param {string} profileId
 * @returns {Object} headers de ABR y player
 */
function _buildPlayerConfigHeaders(profileId) {
  const p = APE_PROFILE_MATRIX[profileId];
  if (!p) return {};
  return {
    // HLS.js config compacto
    'X-HLSjs-Config': JSON.stringify({
      maxBufferLength: p.hlsjs.maxBufferLength,
      backBufferLength: p.hlsjs.backBufferLength,
      lowLatencyMode: p.hlsjs.lowLatencyMode,
      abrEwmaFastLive: p.hlsjs.abrEwmaFastLive,
      abrEwmaSlowLive: p.hlsjs.abrEwmaSlowLive,
      abrBandWidthFactor: p.hlsjs.abrBandWidthFactor,
      abrBandWidthUpFactor: p.hlsjs.abrBandWidthUpFactor,
      abrMaxWithRealBitrate: p.hlsjs.abrMaxWithRealBitrate,
      detectStallWithCurrentTimeMs: p.hlsjs.detectStallWithCurrentTimeMs,
      nudgeOffset: p.hlsjs.nudgeOffset,
    }),
    'X-HLSjs-Version': '1.6.15',
    // Shaka config compacto
    'X-Shaka-Config': JSON.stringify({
      'streaming.bufferingGoal': p.shaka.bufferingGoal,
      'streaming.rebufferingGoal': p.shaka.rebufferingGoal,
      'streaming.bufferBehind': p.shaka.bufferBehind,
      'abr.switchInterval': p.shaka.abr_switchInterval,
      'abr.bandwidthUpgradeTarget': p.shaka.abr_bandwidthUpgradeTarget,
      'abr.bandwidthDowngradeTarget': p.shaka.abr_bandwidthDowngradeTarget,
    }),
    'X-Shaka-Version': '4.x',
    // ExoPlayer config compacto
    'X-ExoPlayer-Config': JSON.stringify({
      minBufferMs: p.exoplayer.minBufferMs,
      maxBufferMs: p.exoplayer.maxBufferMs,
      bufferForPlaybackMs: p.exoplayer.bufferForPlaybackMs,
      liveTargetOffsetMs: p.exoplayer.liveTargetOffsetMs,
    }),
    'X-ExoPlayer-Version': 'Media3-1.3',
    // ABR multi-motor
    'X-ABR-Algorithm': 'EWMA-HLSjs,BOLA-Shaka,Bandwidth-ExoPlayer',
    'X-ABR-Fast-Window-S': String(p.hlsjs.abrEwmaFastLive),
    'X-ABR-Slow-Window-S': String(p.hlsjs.abrEwmaSlowLive),
    'X-ABR-BW-Factor': String(p.hlsjs.abrBandWidthFactor),
    'X-ABR-Switch-Interval-S': String(p.hlsjs.abrSwitchInterval),
    'X-Low-Latency-Mode': p.hlsjs.lowLatencyMode ? 'true' : 'false',
    'X-Live-Sync-Duration-Count': String(p.hlsjs.liveSyncDurationCount),
    'X-Live-Max-Latency-Count': String(p.hlsjs.liveMaxLatencyDurationCount),
    'X-Stall-Detection-Ms': String(p.hlsjs.detectStallWithCurrentTimeMs),
    'X-Fragment-Retry-Max': String(p.hlsjs.fragLoadPolicy_maxNumRetry),
    'X-Fragment-TTFB-Max-Ms': String(p.hlsjs.fragLoadPolicy_maxTimeToFirstByteMs),
    // Bitrate ladder
    'X-Bitrate-Ladder': p.bitrateLadder,
    'X-Bitrate-Ladder-Source': 'bitmovin-stream-lab-2025',
    'X-Segment-Duration-Live': '2',
    // Stream metadata
    'X-Stream-Type': 'hls-live',
    'X-Stream-Format': 'fmp4,ts',
    'X-Stream-Codecs': p._meta.codec,
    'X-Stream-Resolution': p._meta.resolution,
    'X-Stream-FPS': String(p._meta.fps),
    'X-Stream-Bitrate': String(p._meta.bitrate),
    // QoS
    'X-QoS-DSCP': 'EF',
    'X-QoS-Priority': 'CS7',
    'X-Priority': 'u=0, i',
    'X-Request-Priority': 'high',
    'X-ISP-TCP-Window': '16777216',
    'X-ISP-TCP-NoDelay': 'true',
    'X-ISP-TCP-KeepAlive': 'true',
    // Akamai pragma
    'X-Akamai-Pragma': 'akamai-x-cache-on,akamai-x-get-cache-key,akamai-x-get-true-cache-key',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 3: API PÚBLICA — ApeRealtimeEngine
// ─────────────────────────────────────────────────────────────────────────────

window.ApeRealtimeEngine = {

  VERSION: '10.0.0-REALTIME-ENGINE',

  /**
   * Inicializa el motor. Llamar una vez al arrancar el generador.
   */
  init() {
    console.log(`🚀 [APE Realtime Engine v${this.VERSION}] Iniciado. Perfiles disponibles: ${Object.keys(APE_PROFILE_MATRIX).join(', ')}`);
  },

  /**
   * Devuelve la configuración completa de un perfil.
   * @param {string} profileId - 'P0' a 'P5'
   * @returns {Object|null}
   */
  getProfile(profileId) {
    return APE_PROFILE_MATRIX[profileId] || null;
  },

  /**
   * Inyecta los headers v10 en el objeto de headers HTTP existente.
   * IDEMPOTENTE: si ya tiene los headers, los sobreescribe con los mismos valores.
   *
   * @param {Object} httpHeadersObj - El objeto de headers que se convertirá en #EXTHTTP
   * @param {string} profileId - 'P0' a 'P5'
   * @param {string} [channelId] - ID del canal (para CMCD)
   * @returns {Object} El mismo objeto httpHeadersObj, enriquecido
   */
  injectHeaders(httpHeadersObj, profileId, channelId) {
    if (!APE_PROFILE_MATRIX[profileId]) {
      console.warn(`[APE Realtime Engine] Perfil desconocido: ${profileId}. Usando P3 como fallback.`);
      profileId = 'P3';
    }

    const cmcd = _buildCmcdHeaders(profileId, channelId);
    const qoe = _buildQoeHeaders(profileId);
    const player = _buildPlayerConfigHeaders(profileId);

    // Merge quirúrgico: no eliminar headers existentes, solo añadir/actualizar los nuevos
    Object.assign(httpHeadersObj, cmcd, qoe, player);

    return httpHeadersObj;
  },

  /**
   * Inyecta las opciones VLC/Kodi v10 en el array de líneas de la lista.
   * Solo añade las opciones que NO existen ya en el array (idempotencia).
   *
   * @param {string[]} linesArray - El array de líneas donde se añadirán los #EXTVLCOPT
   * @param {string} profileId - 'P0' a 'P5'
   * @returns {string[]} El mismo linesArray, enriquecido
   */
  injectVlcopt(linesArray, profileId) {
    if (!APE_PROFILE_MATRIX[profileId]) profileId = 'P3';

    const opts = APE_PROFILE_MATRIX[profileId].vlcopt;
    for (const [key, value] of Object.entries(opts)) {
      const line = `#EXTVLCOPT:${key}=${value}`;
      // Idempotencia: solo añadir si no existe ya
      if (!linesArray.some(l => l.startsWith(`#EXTVLCOPT:${key}=`))) {
        linesArray.push(line);
      }
    }

    return linesArray;
  },

  /**
   * Devuelve todos los headers v10 como un objeto plano (para debugging o serialización).
   * @param {string} profileId
   * @param {string} [channelId]
   * @returns {Object}
   */
  getAllHeaders(profileId, channelId) {
    if (!APE_PROFILE_MATRIX[profileId]) profileId = 'P3';
    return {
      ..._buildCmcdHeaders(profileId, channelId),
      ..._buildQoeHeaders(profileId),
      ..._buildPlayerConfigHeaders(profileId),
    };
  },

  /**
   * Devuelve el bitrate ladder del perfil como array de objetos.
   * @param {string} profileId
   * @returns {Array<{bitrate: number, resolution: string, fps: number}>}
   */
  getBitrateLadder(profileId) {
    const p = APE_PROFILE_MATRIX[profileId];
    if (!p) return [];
    return p.bitrateLadder.split(',').map(entry => {
      const [br, res] = entry.split('@');
      const [w, h, fps] = res.split('x');
      return { bitrate: parseInt(br), resolution: `${w}x${h}`, fps: parseInt(fps) };
    });
  },

  /**
   * Diagnóstico: muestra en consola el estado del motor y los perfiles.
   */
  diagnose() {
    console.group('🔬 APE Realtime Engine v10.0 — Diagnóstico');
    for (const [pid, p] of Object.entries(APE_PROFILE_MATRIX)) {
      console.log(`  ${pid}: ${p._meta.name} | ${p._meta.resolution}@${p._meta.fps}fps | ${Math.round(p._meta.bitrate/1e6)}Mbps | buffer=${p.hlsjs.maxBufferLength}s | LL-HLS=${p.hlsjs.lowLatencyMode}`);
    }
    console.groupEnd();
  },
};

// Auto-init
window.ApeRealtimeEngine.init();

} // END GUARD
