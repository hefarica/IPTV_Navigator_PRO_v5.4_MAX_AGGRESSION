#!/usr/bin/env node
/**
 * OMEGA Profile Optimizer v1.0
 * ════════════════════════════════════════════════════════
 * Lee el JSON exportado de perfiles y optimiza TODOS los headerOverrides
 * de cada perfil (P0-P5) con mínimo 4 valores fallback comma-separated,
 * escalonados del mejor al peor según el tier del perfil.
 *
 * USO: node optimize-profiles.js <input.json> <output.json>
 * ════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const INPUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '..', 'Downloads', 'APE_ALL_PROFILES_2026-04-09T04-30-16-751Z.json');
const OUTPUT = process.argv[3] || path.join(__dirname, 'APE_ALL_PROFILES_OPTIMIZED.json');

// ═══════════════════════════════════════════════════════
// TIER DEFINITIONS — Qué valores usar por perfil
// ═══════════════════════════════════════════════════════
const TIER = {
    P0: { // GOD_TIER_8K_OMEGA
        res: ['7680x4320','3840x2160','2560x1440','1920x1080'],
        bitrate: ['200000000','120000000','80000000','50000000'],
        bitrateM: ['200','120','80','50'],
        fps: ['120','60','50','30'],
        buffer: ['60000','45000','30000','20000'],
        bufferSec: ['60','45','30','20'],
        cache: ['25000','18000','12000','8000'],
        codec: ['HEVC','AV1','H264','MPEG2'],
        codecStream: ['hvc1.2.4.L183.B0','dvh1.05.06','av01.0.13M.10.0.110.09.16.09.0','avc1.640033'],
        hdr: ['hdr10plus,dolby-vision,hlg,hdr10','hdr10plus,hdr10,hlg','hdr10,hlg','hdr10,sdr'],
        hdrRange: ['PQ','HLG','SDR','SDR'],
        hevcLvl: ['6.2','6.1','6.0','5.2'],
        hevcProf: ['MAIN-12','MAIN-10','MAIN','HIGH'],
        colorDepth: ['12bit','10bit','10bit','8bit'],
        colorSpace: ['bt2020','bt2020','bt709','srgb'],
        transfer: ['smpte2084','arib-std-b67','bt1886','srgb'],
        chroma: ['4:2:0','4:2:2','4:4:4','4:2:0'],
        pixel: ['yuv420p12le','yuv420p10le','yuv420p','nv12'],
        audio: ['ec-3,ac-3,opus,aac,mp4a.40.2,flac','ec-3,ac-3,aac,opus','ac-3,aac,opus','aac,mp3'],
        audioCh: ['7.1.4','7.1','5.1','2.0'],
        audioRate: ['192000','96000','48000','44100'],
        audioBit: ['32bit','24bit','16bit','16bit'],
        spatialAudio: ['dolby-atmos,dts-x,auro-3d,stereo','dolby-atmos,dts-x,stereo','5.1-surround,stereo','stereo'],
        parallel: ['16','12','8','4'],
        prefetch: ['50','40','30','20'],
        reconnect: ['UNLIMITED','100','50','20'],
        reconnectMs: ['50','80','120','200'],
        timeout: ['2000','3000','5000','8000'],
        readTimeout: ['5000','8000','12000','15000'],
        strategy: ['ultra-aggressive,aggressive,adaptive,balanced','aggressive,adaptive,balanced,conservative'],
        boolMax: ['TRUE','ENABLED','ADAPTIVE','AUTO'],
        boolAdaptive: ['ADAPTIVE','AUTO','ENABLED','DISABLED'],
        boolAuto: ['AUTO','ADAPTIVE','ENABLED','DISABLED'],
        lcevcPhase: ['4','3','2','1'],
        lcevcScale: ['4x','2x','1x','AUTO'],
        lcevcPrec: ['FP32','FP16','INT8','AUTO'],
        aiSR: ['REALESRGAN_X4PLUS','ESRGAN_X2','LANCZOS4','BICUBIC'],
        aiInterp: ['OPTICAL_FLOW_SVFI','RIFE_V4_6','DAIN','DISABLED'],
        aiDenoise: ['NLMEANS_HQDN3D_TEMPORAL','NLMEANS','HQDN3D','DISABLED'],
        aiDeblock: ['ADAPTIVE_MAX','ADAPTIVE','STANDARD','DISABLED'],
        aiSharpen: ['UNSHARP_MASK_ADAPTIVE','UNSHARP_MASK','CAS','DISABLED'],
        gpuPipeline: ['DECODE_ITM_LCEVC_AI_SR_DENOISE_TONEMAP_RENDER','DECODE_LCEVC_AI_SR_TONEMAP_RENDER','DECODE_TONEMAP_RENDER','DECODE_RENDER'],
        gpuMem: ['VRAM_ONLY','VRAM_SHARED','AUTO','SYSTEM_RAM'],
        vmaf: ['VMAF_98','VMAF_96','VMAF_94','VMAF_90'],
        resilience1: ['CMAF','HLS_FMP4','HLS_TS','MPEG_TS'],
        resilience2: ['HLS_FMP4','CMAF','HLS_TS','MPEG_TS'],
        resilience3: ['HLS_TS','HLS_FMP4','MPEG_TS','PROGRESSIVE'],
        transport: ['CMAF_UNIVERSAL','HLS_FMP4','HLS_TS','TS_DIRECT'],
        chunk: ['200MS','500MS','1000MS','2000MS'],
        cacheSize: ['2GB','1GB','512MB','256MB'],
        cacheStrat: ['PREDICTIVE_NEURAL','ADAPTIVE','LRU','NONE'],
        bufStrat: ['ADAPTIVE_PREDICTIVE_NEURAL','ADAPTIVE_PREDICTIVE','ADAPTIVE','FIXED'],
        qosDscp: ['EF','AF41','AF31','BE'],
        qosPrio: ['7','6','5','4'],
        evasion: ['SWARM_PHANTOM_HYDRA_STEALTH','PHANTOM_STEALTH','STEALTH','STANDARD'],
        ipRot: ['PER_REQUEST','PER_SESSION','PER_CHANNEL','STATIC'],
        stealthUA: ['RANDOMIZED','ROTATING','ADAPTIVE','FIXED'],
        swarmPeers: ['20','15','10','5'],
        antiCut: ['NUCLEAR','AGGRESSIVE','MODERATE','ADAPTIVE'],
        ispThrottle: ['NUCLEAR_ESCALATION_NEVER_DOWN','AGGRESSIVE_ESCALATION','ADAPTIVE_ESCALATION','DEFAULT'],
        sharpen: ['0.04','0.06','0.08','0.03'],
        err403: ['MORPH_IDENTITY','ROTATE_UA','RETRY','BACKOFF'],
        err404: ['FALLBACK_ORIGIN','RETRY','SKIP','STOP'],
        err429: ['SWARM_EVASION','BACKOFF','RETRY','STOP'],
        err500: ['RECONNECT_SILENT','RETRY','FALLBACK','STOP'],
        enslavement: ['OMEGA_ABSOLUTE','OMEGA','SUPREME','STANDARD'],
        drmSys: ['widevine,playready,fairplay,clearkey'],
        abr: ['aggressive,ultra-aggressive,adaptive,balanced'],
        startup: ['max,ultra-max,high,medium'],
    },
    P1: { res: ['3840x2160','2560x1440','1920x1080','1280x720'], bitrate: ['120000000','80000000','50000000','30000000'], bitrateM: ['120','80','50','30'], fps: ['60','50','30','25'], buffer: ['50000','35000','25000','18000'], bufferSec: ['50','35','25','18'], cache: ['20000','15000','10000','8000'], codec: ['HEVC','AV1','H264','MPEG2'], hevcLvl: ['6.1','6.0','5.1','5.0'], hevcProf: ['MAIN-10','MAIN','HIGH','BASELINE'], colorDepth: ['10bit','10bit','8bit','8bit'], colorSpace: ['bt2020','bt709','srgb','srgb'], transfer: ['smpte2084','arib-std-b67','bt1886','srgb'], chroma: ['4:2:0','4:2:2','4:2:0','4:2:0'], pixel: ['yuv420p10le','yuv420p10le','yuv420p','nv12'], audio: ['ec-3,ac-3,aac,opus,mp4a.40.2','ac-3,aac,opus','aac,opus,mp3','aac,mp3'], audioCh: ['7.1','5.1','2.0','2.0'], audioRate: ['96000','48000','48000','44100'], audioBit: ['24bit','24bit','16bit','16bit'], parallel: ['12','8','6','4'], prefetch: ['40','30','20','12'], reconnect: ['100','50','30','20'], reconnectMs: ['80','120','200','300'], timeout: ['3000','4000','5000','8000'], readTimeout: ['8000','10000','12000','15000'], lcevcPhase: ['4','3','2','1'], lcevcScale: ['4x','2x','1x','AUTO'], aiSR: ['REALESRGAN_X4PLUS','ESRGAN_X2','LANCZOS3','BICUBIC'], aiDenoise: ['NLMEANS_HQDN3D_TEMPORAL','NLMEANS','HQDN3D','DISABLED'], aiDeblock: ['ADAPTIVE','STANDARD','LOW','DISABLED'], aiSharpen: ['UNSHARP_MASK','CAS','LOW','DISABLED'], gpuPipeline: ['DECODE_LCEVC_AI_SR_TONEMAP_RENDER','DECODE_AI_SR_TONEMAP_RENDER','DECODE_TONEMAP_RENDER','DECODE_RENDER'], vmaf: ['VMAF_96','VMAF_94','VMAF_92','VMAF_88'], cacheSize: ['1GB','512MB','256MB','128MB'], qosDscp: ['AF41','AF31','AF21','BE'], qosPrio: ['6','5','4','3'], evasion: ['PHANTOM_STEALTH','STEALTH','ADAPTIVE','STANDARD'], swarmPeers: ['15','10','5','2'], antiCut: ['AGGRESSIVE','MODERATE','ADAPTIVE','PASSIVE'], ispThrottle: ['AGGRESSIVE_ESCALATION','ADAPTIVE_ESCALATION','MODERATE','DEFAULT'], sharpen: ['0.05','0.06','0.08','0.03'], enslavement: ['OMEGA','SUPREME','STANDARD','COMPATIBILITY'], abr: ['ultra-aggressive,aggressive,adaptive,balanced'], startup: ['ultra-max,max,high,medium'] },
    P2: { res: ['3840x2160','1920x1080','1280x720','854x480'], bitrate: ['80000000','50000000','25000000','15000000'], bitrateM: ['80','50','25','15'], fps: ['60','50','30','25'], buffer: ['35000','25000','18000','12000'], bufferSec: ['35','25','18','12'], cache: ['15000','12000','8000','5000'], codec: ['HEVC','H264','VP9','MPEG2'], hevcLvl: ['6.0','5.1','5.0','4.1'], hevcProf: ['MAIN-10','MAIN','HIGH','BASELINE'], colorDepth: ['10bit','10bit','8bit','8bit'], colorSpace: ['bt2020','bt709','bt709','srgb'], transfer: ['smpte2084','bt1886','srgb','srgb'], pixel: ['yuv420p10le','yuv420p','nv12','nv12'], audio: ['ac-3,eac3,aac,opus,mp3','ac-3,aac,opus','aac,mp3','aac'], audioCh: ['5.1','5.1','2.0','2.0'], audioRate: ['48000','48000','44100','44100'], audioBit: ['24bit','16bit','16bit','16bit'], parallel: ['8','6','4','2'], prefetch: ['30','20','12','8'], reconnect: ['50','30','20','15'], reconnectMs: ['120','200','300','500'], timeout: ['4000','5000','6000','8000'], readTimeout: ['10000','12000','15000','20000'], lcevcPhase: ['3','2','1','0'], lcevcScale: ['2x','1x','AUTO','NONE'], aiSR: ['ESRGAN_X2','LANCZOS3','BICUBIC','BILINEAR'], aiDenoise: ['NLMEANS','HQDN3D','LOW','DISABLED'], aiDeblock: ['STANDARD','LOW','AUTO','DISABLED'], aiSharpen: ['CAS','LOW','AUTO','DISABLED'], gpuPipeline: ['DECODE_AI_SR_TONEMAP_RENDER','DECODE_TONEMAP_RENDER','DECODE_DENOISE_RENDER','DECODE_RENDER'], vmaf: ['VMAF_94','VMAF_92','VMAF_90','VMAF_85'], cacheSize: ['512MB','256MB','128MB','64MB'], qosDscp: ['AF31','AF21','CS3','BE'], qosPrio: ['5','4','3','2'], evasion: ['STEALTH','ADAPTIVE','STANDARD','PASSIVE'], swarmPeers: ['10','5','3','1'], antiCut: ['MODERATE','ADAPTIVE','PASSIVE','DISABLED'], ispThrottle: ['ADAPTIVE_ESCALATION','MODERATE','CONSERVATIVE','DEFAULT'], sharpen: ['0.06','0.08','0.04','0.02'], enslavement: ['SUPREME','STANDARD','COMPATIBILITY','SAFE'], abr: ['aggressive,adaptive,balanced,conservative'], startup: ['max,high,medium,auto'] },
    P3: { res: ['1920x1080','1280x720','854x480','640x360'], bitrate: ['50000000','25000000','15000000','8000000'], bitrateM: ['50','25','15','8'], fps: ['60','30','25','24'], buffer: ['25000','18000','12000','8000'], bufferSec: ['25','18','12','8'], cache: ['12000','8000','5000','4000'], codec: ['HEVC','H264','HEVC-MAIN','MPEG2'], hevcLvl: ['5.1','5.0','4.1','4.0'], hevcProf: ['MAIN-10','MAIN','HIGH','BASELINE'], colorDepth: ['10bit','8bit','8bit','8bit'], colorSpace: ['bt709','bt709','srgb','srgb'], transfer: ['bt1886','srgb','srgb','srgb'], pixel: ['yuv420p10le','yuv420p','nv12','nv12'], audio: ['aac,ac-3,opus,mp3','aac,mp3,opus','aac,mp3','aac'], audioCh: ['5.1','2.0','2.0','1.0'], audioRate: ['48000','44100','44100','32000'], audioBit: ['16bit','16bit','16bit','16bit'], parallel: ['6','4','3','2'], prefetch: ['20','12','8','5'], reconnect: ['30','20','15','10'], reconnectMs: ['200','300','500','800'], timeout: ['5000','6000','8000','10000'], readTimeout: ['12000','15000','18000','20000'], lcevcPhase: ['2','1','0','0'], lcevcScale: ['1x','AUTO','NONE','NONE'], aiSR: ['LANCZOS3','BICUBIC','BILINEAR','NONE'], aiDenoise: ['HQDN3D','LOW','AUTO','DISABLED'], aiDeblock: ['LOW','AUTO','DISABLED','DISABLED'], aiSharpen: ['LOW','AUTO','DISABLED','DISABLED'], gpuPipeline: ['DECODE_TONEMAP_RENDER','DECODE_DENOISE_RENDER','DECODE_RENDER','AUTO'], vmaf: ['VMAF_92','VMAF_90','VMAF_85','VMAF_80'], cacheSize: ['256MB','128MB','64MB','32MB'], qosDscp: ['AF21','CS3','CS2','BE'], qosPrio: ['4','3','2','1'], evasion: ['ADAPTIVE','STANDARD','PASSIVE','NONE'], swarmPeers: ['5','3','1','0'], antiCut: ['ADAPTIVE','PASSIVE','DISABLED','DISABLED'], ispThrottle: ['MODERATE','CONSERVATIVE','DEFAULT','NONE'], sharpen: ['0.08','0.06','0.04','0.02'], enslavement: ['STANDARD','COMPATIBILITY','SAFE','AUTO'], abr: ['adaptive,balanced,conservative,auto'], startup: ['high,medium,auto,low'] },
    P4: { res: ['1280x720','854x480','640x360','426x240'], bitrate: ['25000000','15000000','8000000','4000000'], bitrateM: ['25','15','8','4'], fps: ['30','25','24','20'], buffer: ['18000','12000','8000','5000'], bufferSec: ['18','12','8','5'], cache: ['8000','5000','4000','3000'], codec: ['HEVC','H264','BASELINE','MPEG2'], hevcLvl: ['5.0','4.1','4.0','3.1'], hevcProf: ['MAIN','HIGH','BASELINE','CONSTRAINED-BASELINE'], colorDepth: ['8bit','8bit','8bit','8bit'], colorSpace: ['bt709','srgb','srgb','srgb'], transfer: ['bt1886','srgb','srgb','srgb'], pixel: ['yuv420p','nv12','nv21','i420'], audio: ['aac,mp3,ac-3','aac,mp3','aac','mp3'], audioCh: ['2.0','2.0','1.0','1.0'], audioRate: ['44100','44100','32000','22050'], audioBit: ['16bit','16bit','16bit','8bit'], parallel: ['4','3','2','1'], prefetch: ['12','8','5','3'], reconnect: ['20','15','10','8'], reconnectMs: ['300','500','800','1000'], timeout: ['6000','8000','10000','15000'], readTimeout: ['15000','18000','20000','25000'], lcevcPhase: ['1','0','0','0'], lcevcScale: ['AUTO','NONE','NONE','NONE'], aiSR: ['BICUBIC','BILINEAR','NONE','NONE'], aiDenoise: ['LOW','AUTO','DISABLED','DISABLED'], aiDeblock: ['AUTO','DISABLED','DISABLED','DISABLED'], aiSharpen: ['AUTO','DISABLED','DISABLED','DISABLED'], gpuPipeline: ['DECODE_RENDER','AUTO','SOFTWARE','SOFTWARE'], vmaf: ['VMAF_88','VMAF_85','VMAF_80','VMAF_75'], cacheSize: ['128MB','64MB','32MB','16MB'], qosDscp: ['CS3','CS2','CS1','BE'], qosPrio: ['3','2','1','0'], evasion: ['STANDARD','PASSIVE','NONE','DISABLED'], swarmPeers: ['3','1','0','0'], antiCut: ['PASSIVE','DISABLED','DISABLED','DISABLED'], ispThrottle: ['CONSERVATIVE','DEFAULT','NONE','DISABLED'], sharpen: ['0.06','0.04','0.02','0.00'], enslavement: ['COMPATIBILITY','SAFE','AUTO','DISABLED'], abr: ['balanced,conservative,auto,passive'], startup: ['medium,auto,low,minimum'] },
    P5: { res: ['854x480','640x360','426x240','320x240'], bitrate: ['8000000','4000000','2000000','1000000'], bitrateM: ['8','4','2','1'], fps: ['25','24','20','15'], buffer: ['12000','8000','5000','3000'], bufferSec: ['12','8','5','3'], cache: ['5000','4000','3000','2000'], codec: ['H264','H264-BASELINE','MPEG2','MPEG1'], hevcLvl: ['4.0','3.1','3.0','2.1'], hevcProf: ['BASELINE','CONSTRAINED-BASELINE','MAIN','BASELINE'], colorDepth: ['8bit','8bit','8bit','8bit'], colorSpace: ['srgb','srgb','bt601','bt601'], transfer: ['srgb','bt1886','bt601','bt601'], pixel: ['yuv420p','nv12','i420','yuv422p'], audio: ['aac,mp3','mp3,aac','mp3','mp3'], audioCh: ['2.0','2.0','1.0','1.0'], audioRate: ['44100','32000','22050','16000'], audioBit: ['16bit','16bit','8bit','8bit'], parallel: ['2','1','1','1'], prefetch: ['5','3','2','1'], reconnect: ['15','10','8','5'], reconnectMs: ['500','800','1000','2000'], timeout: ['8000','10000','15000','20000'], readTimeout: ['18000','20000','25000','30000'], lcevcPhase: ['0','0','0','0'], lcevcScale: ['NONE','NONE','NONE','NONE'], aiSR: ['BILINEAR','NONE','NONE','NONE'], aiDenoise: ['AUTO','DISABLED','DISABLED','DISABLED'], aiDeblock: ['DISABLED','DISABLED','DISABLED','DISABLED'], aiSharpen: ['DISABLED','DISABLED','DISABLED','DISABLED'], gpuPipeline: ['AUTO','SOFTWARE','SOFTWARE','SOFTWARE'], vmaf: ['VMAF_80','VMAF_75','VMAF_70','VMAF_65'], cacheSize: ['64MB','32MB','16MB','8MB'], qosDscp: ['CS2','CS1','BE','BE'], qosPrio: ['2','1','0','0'], evasion: ['PASSIVE','NONE','DISABLED','DISABLED'], swarmPeers: ['1','0','0','0'], antiCut: ['DISABLED','DISABLED','DISABLED','DISABLED'], ispThrottle: ['DEFAULT','NONE','DISABLED','DISABLED'], sharpen: ['0.02','0.00','0.00','0.00'], enslavement: ['SAFE','AUTO','DISABLED','DISABLED'], abr: ['conservative,auto,passive,disabled'], startup: ['auto,low,minimum,emergency'] }
};

// Copia profunda genérica para cada tier (P1-P5 heredan de P0 lo que no definen)
for (const pid of ['P1','P2','P3','P4','P5']) {
    for (const key of Object.keys(TIER.P0)) {
        if (!TIER[pid][key]) TIER[pid][key] = TIER.P0[key];
    }
}

// ═══════════════════════════════════════════════════════
// HEADER-TO-TIER MAPPING — Qué tier-key usar por header
// ═══════════════════════════════════════════════════════
const HEADER_MAP = {
    // Resolución
    'X-APE-RESOLUTION': 'res', 'X-Screen-Resolution': 'res', 'X-Max-Resolution': 'res',
    // Bitrate
    'X-APE-TARGET-BITRATE': 'bitrate', 'X-Max-Bitrate': 'bitrate', 'X-Initial-Bitrate': 'bitrate',
    'X-APE-BITRATE': 'bitrateM', 'X-APE-THROUGHPUT-T1': 'bitrateM', 'X-APE-THROUGHPUT-T2': 'bitrateM',
    // FPS
    'X-APE-FPS': 'fps', 'X-Frame-Rates': 'fps',
    // Buffer
    'X-Buffer-Size': 'buffer', 'X-Buffer-Target': 'buffer', 'X-Buffer-Max': 'buffer',
    'X-ExoPlayer-Buffer-Min': 'buffer', 'X-Buffer-Min': 'buffer', 'X-Manifest-Refresh': 'buffer',
    'X-KODI-LIVE-DELAY': 'bufferSec', 'X-Min-Buffer-Time': 'bufferSec', 'X-Max-Buffer-Time': 'bufferSec',
    'X-Playback-Buffer-Size': 'buffer',
    // Cache
    'X-Network-Caching': 'cache', 'X-Live-Caching': 'cache', 'X-File-Caching': 'cache',
    // Codec
    'X-APE-CODEC': 'codec', 'X-Codec-Support': 'codec', 'X-Video-Codecs': 'codec',
    // HDR
    'X-HDR-Support': 'hdr', 'X-Dynamic-Range': 'hdr',
    // HEVC
    'X-HEVC-Level': 'hevcLvl', 'X-HEVC-Profile': 'hevcProf', 'X-Video-Profile': 'hevcProf', 'X-HEVC-Tier': e => ['HIGH','MAIN','MAIN','MAIN'],
    // Color
    'X-Color-Depth': 'colorDepth', 'X-Color-Space': 'colorSpace', 'X-Color-Primaries': 'colorSpace',
    'X-HDR-Transfer-Function': 'transfer', 'X-Matrix-Coefficients': e => ['bt2020nc','bt2020c','bt709','bt601'],
    'X-Chroma-Subsampling': 'chroma', 'X-Pixel-Format': 'pixel',
    // Audio
    'X-Audio-Codecs': 'audio', 'X-Audio-Channels': 'audioCh', 'X-Audio-Sample-Rate': 'audioRate',
    'X-Audio-Bit-Depth': 'audioBit', 'X-Dolby-Atmos': 'boolMax', 'X-Spatial-Audio': 'boolMax',
    'X-Audio-Passthrough': 'boolMax',
    // Parallel
    'X-Parallel-Segments': 'parallel', 'X-Concurrent-Downloads': 'parallel',
    'X-Prefetch-Segments': 'prefetch', 'X-APE-Prefetch-Segments': 'prefetch',
    'X-APE-BUFFER-PRELOAD-SEGMENTS': 'prefetch',
    // Reconnect
    'X-Max-Reconnect-Attempts': 'reconnect', 'X-APE-RECONNECT-MAX': 'reconnect',
    'X-Reconnect-Delay-Ms': 'reconnectMs', 'X-APE-IDENTITY-ROTATION-INTERVAL': 'reconnectMs',
    'X-Connection-Timeout-Ms': 'timeout', 'X-Read-Timeout-Ms': 'readTimeout',
    'X-Retry-Count': 'reconnect', 'X-Retry-Delay-Ms': 'reconnectMs',
    // Strategy
    'X-APE-STRATEGY': 'strategy', 'X-Buffer-Strategy': 'strategy',
    // LCEVC
    'X-APE-LCEVC-PHASE': 'lcevcPhase', 'X-APE-LCEVC-COMPUTE-PRECISION': 'lcevcPrec',
    'X-APE-LCEVC-UPSCALE-ALGORITHM': e => ['LANCZOS4','LANCZOS3','BICUBIC','BILINEAR'],
    // AI
    'X-APE-AI-SR-MODEL': 'aiSR', 'X-APE-AI-FRAME-INTERPOLATION': 'aiInterp',
    'X-APE-AI-DENOISING': 'aiDenoise', 'X-APE-AI-DEBLOCKING': 'aiDeblock',
    'X-APE-AI-SHARPENING': 'aiSharpen', 'X-APE-AI-PERCEPTUAL-QUALITY': 'vmaf',
    // GPU
    'X-APE-GPU-PIPELINE': 'gpuPipeline', 'X-APE-GPU-MEMORY-POOL': 'gpuMem',
    'X-APE-GPU-PRECISION': 'lcevcPrec',
    // Resilience
    'X-APE-RESILIENCE-L1-FORMAT': 'resilience1', 'X-APE-RESILIENCE-L2-FORMAT': 'resilience2',
    'X-APE-RESILIENCE-L3-FORMAT': 'resilience3',
    'X-APE-RESILIENCE-HTTP-ERROR-403': 'err403', 'X-APE-RESILIENCE-HTTP-ERROR-404': 'err404',
    'X-APE-RESILIENCE-HTTP-ERROR-429': 'err429', 'X-APE-RESILIENCE-HTTP-ERROR-500': 'err500',
    // Transport
    'X-APE-TRANSPORT-PROTOCOL': 'transport', 'X-APE-TRANSPORT-CHUNK-SIZE': 'chunk',
    'X-APE-TRANSPORT-FALLBACK-1': 'resilience2',
    // Cache strategy
    'X-APE-CACHE-SIZE': 'cacheSize', 'X-APE-CACHE-STRATEGY': 'cacheStrat',
    'X-APE-BUFFER-STRATEGY': 'bufStrat',
    // QoS
    'X-APE-QOS-DSCP': 'qosDscp', 'X-APE-QOS-PRIORITY': 'qosPrio',
    // Evasion
    'X-APE-EVASION-MODE': 'evasion', 'X-APE-IP-ROTATION-STRATEGY': 'ipRot',
    'X-APE-STEALTH-UA': 'stealthUA', 'X-APE-SWARM-PEERS': 'swarmPeers',
    'X-APE-ANTI-CUT-ISP-STRANGLE': 'antiCut',
    'X-APE-ISP-THROTTLE-ESCALATION-POLICY': 'ispThrottle',
    'X-APE-PLAYER-ENSLAVEMENT-PROTOCOL': 'enslavement',
    'X-APE-AV1-FALLBACK-CHAIN': (pid, profile) => {
        // HEVC-FIRST per-profile chain. Lee de profile.settings.codec_chain_video_family (LAB SSOT).
        // Fallback defensivo HEVC-first si LAB no propagó (NO-CLAMP: texto byte-identical, no coerce).
        const chain = (profile && profile.settings && profile.settings.codec_chain_video_family)
            || 'HEVC-MAIN10>HEVC-MAIN>H264-HIGH>H264-MAIN>H264-BASELINE';
        return [chain];
    },
    'X-Sharpen-Sigma': 'sharpen',
    // Misc boolean-ish
    'X-APE-AI-SR-ENABLED': 'boolMax', 'X-APE-LCEVC-ENABLED': 'boolMax',
    'X-APE-GPU-DECODE': 'boolMax', 'X-APE-GPU-RENDER': 'boolMax', 'X-APE-GPU-ZERO-COPY': 'boolMax',
    'X-APE-VVC-ENABLED': 'boolMax', 'X-APE-EVC-ENABLED': 'boolMax',
    'X-APE-QOS-ENABLED': 'boolMax', 'X-APE-ANTI-CUT-ENGINE': 'boolMax',
    'X-APE-RECONNECT-SEAMLESS': 'boolMax', 'X-APE-IDENTITY-MORPH': 'boolMax',
    'X-APE-POLYMORPHIC-ENABLED': 'boolMax', 'X-APE-POLYMORPHIC-IDEMPOTENT': 'boolMax',
    'X-APE-SWARM-ENABLED': 'boolMax', 'X-APE-CACHE-PREFETCH': 'boolMax',
    'X-APE-BUFFER-DYNAMIC-ADJUSTMENT': 'boolMax', 'X-APE-BUFFER-NEURAL-PREDICTION': 'boolMax',
    'X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC': 'boolMax',
    'X-APE-AV1-FALLBACK-ENABLED': 'boolMax', 'X-APE-IP-ROTATION-ENABLED': 'boolMax',
    'X-APE-EVASION-DNS-OVER-HTTPS': 'boolMax', 'X-APE-EVASION-SNI-OBFUSCATION': 'boolMax',
    'X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE': 'boolMax',
    'X-APE-EVASION-GEO-PHANTOM': 'boolMax', 'X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS': 'boolMax',
    'X-APE-LCEVC-ROI-DYNAMIC': 'boolMax', 'X-APE-LCEVC-SDK-ENABLED': 'boolMax',
    'X-APE-AI-ARTIFACT-REMOVAL': 'boolMax', 'X-APE-AI-COLOR-ENHANCEMENT': 'boolMax',
    'X-APE-AI-SCENE-DETECTION': 'boolMax', 'X-APE-AI-CONTENT-AWARE-ENCODING': 'boolMax',
    'X-CORTEX-OMEGA-STATE': e => ['ACTIVE_DOMINANT','ACTIVE','STANDBY','PASSIVE'],
    'X-Hardware-Decode': 'boolMax', 'X-Prefetch-Enabled': 'boolMax',
    'X-Failover-Enabled': 'boolMax', 'X-Segment-Preload': 'boolMax',
    'X-Reconnect-On-Error': 'boolMax', 'X-Seamless-Failover': 'boolMax',
    'X-APE-AI-HDR-UPCONVERT': e => ['AUTO','ENABLED','TONEMAP','OFF'],
    'X-APE-AI-MOTION-ESTIMATION': e => ['OPTICAL_FLOW','BLOCK_MATCHING','AUTO','DISABLED'],
    'X-APE-STEALTH-XFF': e => ['DYNAMIC','ROTATING','ADAPTIVE','FIXED'],
    'X-APE-STEALTH-FINGERPRINT': e => ['MUTATING','ROTATING','ADAPTIVE','FIXED'],
    'X-APE-LCEVC-TRANSPORT': e => ['CMAF_LAYER','HLS_SIDECAR','HLS_FMP4','DISABLED'],
    'X-APE-LCEVC-SDK-TARGET': e => ['HTML5_NATIVE','ANDROID_TV','TIZEN','WEBOS'],
    'X-APE-LCEVC-SDK-WEB-INTEROP': e => ['BI_DIRECTIONAL_JS_TUNNEL','UNIDIRECTIONAL','NATIVE','DISABLED'],
    'X-APE-LCEVC-SDK-DECODER': e => ['WASM+WEBGL','WASM','NATIVE','AUTO'],
    'X-APE-ANTI-CUT-DETECTION': e => ['REAL_TIME','PREDICTIVE','REACTIVE','DISABLED'],
    'X-APE-LCEVC-SCALE': 'lcevcScale',
};

// ═══════════════════════════════════════════════════════
// OPTIMIZE
// ═══════════════════════════════════════════════════════
function optimize(data) {
    const profiles = data.profiles;
    let totalUpdated = 0;

    for (const [pid, profile] of Object.entries(profiles)) {
        const tier = TIER[pid] || TIER.P3;
        const sections = ['headerOverrides', 'headers'];

        for (const section of sections) {
            if (!profile[section]) continue;
            const headers = profile[section];

            for (const [headerName, currentValue] of Object.entries(headers)) {
                // Skip placeholder tokens
                if (typeof currentValue !== 'string') continue;
                if (currentValue.startsWith('[') && currentValue.endsWith(']')) continue;

                const values = currentValue.split(',').map(v => v.trim());

                // Si ya tiene 4+ valores bien formados, skip
                if (values.length >= 4) continue;

                // Buscar en el mapa de headers
                const mapping = HEADER_MAP[headerName];
                let newValues = null;

                if (mapping) {
                    if (typeof mapping === 'function') {
                        // Pass profile to allow per-profile codec_chain_video_family lookup
                        newValues = mapping(pid, profile);
                    } else if (tier[mapping]) {
                        newValues = tier[mapping];
                    }
                }

                if (newValues && Array.isArray(newValues) && newValues.length >= 4) {
                    headers[headerName] = newValues.join(',');
                    totalUpdated++;
                } else if (values.length < 4) {
                    // Generic padding: repeat last value to fill to 4
                    while (values.length < 4) {
                        values.push(values[values.length - 1]);
                    }
                    headers[headerName] = values.join(',');
                    totalUpdated++;
                }
            }
        }

        console.log(`✅ ${pid} (${profile.name}): optimized`);
    }

    return { data, totalUpdated };
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════
try {
    console.log(`📥 Reading: ${INPUT}`);
    const raw = fs.readFileSync(INPUT, 'utf8');
    const data = JSON.parse(raw);

    console.log(`🔧 Optimizing ${Object.keys(data.profiles).length} profiles...`);
    const { totalUpdated } = optimize(data);

    data._meta.optimized = new Date().toISOString();
    data._meta.optimizer = 'OMEGA_PROFILE_OPTIMIZER_V1.0';
    data._meta.totalHeadersUpdated = totalUpdated;

    fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2), 'utf8');
    console.log(`\n✅ Done! ${totalUpdated} headers optimized.`);
    console.log(`📤 Output: ${OUTPUT}`);
} catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
}
