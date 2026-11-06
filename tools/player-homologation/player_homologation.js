#!/usr/bin/env node
/**
 * player_homologation.js — las 3 directivas y sus equivalentes en ffmpeg / VLC / ExoPlayer,
 * por device (ONN 4K Amlogic vs Fire TV MediaTek).
 *
 * POR QUE EXISTE
 *   El operador pidio los homologos de las directivas de ffmpeg en VLC, y lo mismo para
 *   ExoPlayer, con seleccion por device. Las tres superficies dicen lo mismo con vocabularios
 *   distintos y hoy nadie las relacionaba.
 *
 * LAS 3 DIRECTIVAS
 *   AISR — AI Super Resolution
 *   AIPQ — AI Picture Quality
 *   MEMC — Motion Estimation / Motion Compensation
 *
 * DONDE VIVE CADA UNA (esto es lo que casi nadie separa)
 *   AISR y AIPQ son HARDWARE del SoC. Ni ffmpeg, ni VLC, ni ExoPlayer las ejecutan: el chip
 *   procesa el frame ya decodificado. El player solo las puede pedir si el SoC las expone.
 *   MEMC tambien es hardware cuando existe (MT8696). Donde no hay MEMC de HW, el unico
 *   sustituto honesto es respetar el fps de la fuente (match_content_frame_rate) o, en
 *   ffmpeg, minterpolate — que en directo a 4K no sostiene el tiempo real (medido: 23.4x
 *   tiempo real para minterpolate solo).
 *
 *   -> Por eso la tabla NO dice "VLC hace AISR". Dice donde se ejecuta de verdad y cual es
 *      la peticion equivalente en cada superficie.
 *
 * FUENTES DE LOS VALORES
 *   ExoPlayer : lo que el generador emite hoy en #EXT-X-SESSION-DATA (leido del generador).
 *   VLC       : solo opciones que existen en los binarios (tools/ape-image-recipes/VLC_OPT_AUDIT.md).
 *   ffmpeg 8.0.1: solo filtros con rango valido (skill ape-image-pipeline-truth).
 *
 * Uso: node tools/player-homologation/player_homologation.js [--json] [--write]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'player_homologation.json');

// ══════════════════════════════════════════════════════════════════════════════
// 1 · Las 3 directivas: donde se ejecutan de verdad
// ══════════════════════════════════════════════════════════════════════════════
const DIRECTIVAS = {
    AISR: {
        nombre: 'AI Super Resolution',
        ejecutor: 'hardware',
        donde: 'VPP del SoC, sobre el frame ya decodificado',
        // Ningun player la ejecuta. El player solo puede pedirla al SoC.
        ffmpeg: { viable: false, razon: 'ffmpeg escala con zscale/scale, no con AI-SR del chip. En directo a 4K no es tiempo real.' },
        vlc: { viable: false, razon: 'VLC no tiene AI super-resolution. No existe modulo.' },
        exoplayer: { viable: false, razon: 'ExoPlayer decodifica y entrega; no hace AI-SR. Delega en el SoC.' },
        device: {
            s905x4: { tiene: true, peticion: 'aisr_enable=1 + ai_sr_mode=3 + ai_sr_level=3 (libpqcontrol.so)' },
            mt8696: { tiene: false, homologo: 'com.amazon.tv.picture_sharpness=65 + com.amazon.tv.dynamic_contrast=high' },
        },
    },
    AIPQ: {
        nombre: 'AI Picture Quality',
        ejecutor: 'hardware',
        donde: 'VPP del SoC, ajuste por escena',
        ffmpeg: { viable: false, razon: 'ffmpeg aplica curvas fijas (eq/curves), no AI-PQ por escena.' },
        vlc: { viable: false, razon: 'VLC no tiene AI-PQ. adjust es estatico, no por escena.' },
        exoplayer: { viable: false, razon: 'ExoPlayer no toca color/contraste; entrega el frame tal cual.' },
        device: {
            s905x4: { tiene: true, peticion: 'aipq_enable=1 + ai_pq_mode=3 + ai_pic_mode=3' },
            mt8696: { tiene: 'parcial', homologo: 'com.amazon.tv.dynamic_contrast=high + picture_mode=movie + noise_reduction=auto' },
        },
    },
    MEMC: {
        nombre: 'Motion Estimation / Motion Compensation',
        ejecutor: 'hardware (cuando existe)',
        donde: 'VPP del SoC entre el decode y el panel',
        // minterpolate es el unico equivalente real, pero NO es tiempo real a 4K.
        ffmpeg: { viable: 'solo offline', razon: 'minterpolate existe pero mide 23.4x tiempo real en solitario y 46.9x en la cadena P3. No sirve en directo.' },
        vlc: { viable: false, razon: 'VLC no interpola frames. No hay modulo minterpolate.' },
        exoplayer: { viable: false, razon: 'ExoPlayer no interpola. Puede respetar el fps de la fuente (frame rate matching).' },
        device: {
            s905x4: { tiene: false, homologo: 'match_content_frame_rate=1 (respeta el fps real de la fuente, no inventa frames)' },
            mt8696: { tiene: true, peticion: 'com.amazon.tv.motion_smoothness=2 (MEMC por HW)' },
        },
    },
};

// ══════════════════════════════════════════════════════════════════════════════
// 2 · Homologacion de buffering: ExoPlayer <-> VLC <-> ffmpeg
// ══════════════════════════════════════════════════════════════════════════════
// Los valores de ExoPlayer son los que el generador ya emite (leidos del codigo).
const EXOPLAYER_LOAD = {
    minBufferMs: 45000,
    bufferForPlaybackMs: 500,
    bufferForPlaybackAfterRebufferMs: 1000,
    maxBufferMs: 130000,
};
const EXOPLAYER_TRACK = {
    maxDurationForQualityDecreaseMs: 500,
    minDurationForQualityIncreaseMs: 3000,
    bandwidthFraction: 0.95,
};
const EXOPLAYER_BW = {
    resetOnNetworkTypeChange: false,
    slidingWindowMaxWeight: 2000,
    initialBitrateEstimate: 120000000,
};

const BUFFER_HOMOLOGOS = [
    {
        exoplayer: 'minBufferMs=' + EXOPLAYER_LOAD.minBufferMs,
        vlc: 'network-caching=' + EXOPLAYER_LOAD.minBufferMs,
        vlc_existe: true,
        ffmpeg: '-max_delay ' + (EXOPLAYER_LOAD.minBufferMs * 1000),
        nota: 'buffer de red objetivo. VLC lo acepta (network-caching esta entre las 58 opciones reales).',
    },
    {
        exoplayer: 'maxBufferMs=' + EXOPLAYER_LOAD.maxBufferMs,
        vlc: 'live-caching=' + EXOPLAYER_LOAD.maxBufferMs,
        vlc_existe: true,
        ffmpeg: '-buffer_size ' + (EXOPLAYER_LOAD.maxBufferMs * 1000),
        nota: 'techo de buffer. live-caching existe en VLC.',
    },
    {
        exoplayer: 'bufferForPlaybackMs=' + EXOPLAYER_LOAD.bufferForPlaybackMs,
        vlc: 'file-caching=' + EXOPLAYER_LOAD.bufferForPlaybackMs,
        vlc_existe: true,
        ffmpeg: '-analyzeduration ' + EXOPLAYER_LOAD.bufferForPlaybackMs,
        nota: 'buffer minimo para arrancar. file-caching existe en VLC.',
    },
    {
        exoplayer: 'bufferForPlaybackAfterRebufferMs=' + EXOPLAYER_LOAD.bufferForPlaybackAfterRebufferMs,
        vlc: 'sout-mux-caching=' + EXOPLAYER_LOAD.bufferForPlaybackAfterRebufferMs,
        vlc_existe: true,
        ffmpeg: '-reorder_queue_size ' + EXOPLAYER_LOAD.bufferForPlaybackAfterRebufferMs,
        nota: 'buffer tras un rebuffer. sout-mux-caching existe en VLC.',
    },
    {
        exoplayer: 'bandwidthFraction=' + EXOPLAYER_TRACK.bandwidthFraction,
        vlc: null,
        vlc_existe: false,
        ffmpeg: null,
        nota: 'NO_VIABLE en VLC: las 36 opciones adaptive-* no existen en ningun binario. VLC no tiene ABR configurable.',
    },
    {
        exoplayer: 'initialBitrateEstimate=' + EXOPLAYER_BW.initialBitrateEstimate,
        vlc: null,
        vlc_existe: false,
        ffmpeg: null,
        nota: 'NO_VIABLE en VLC: no hay estimador de bitrate inicial configurable. adaptive-initial-bandwidth no existe.',
    },
    {
        exoplayer: 'slidingWindowMaxWeight=' + EXOPLAYER_BW.slidingWindowMaxWeight,
        vlc: null,
        vlc_existe: false,
        ffmpeg: null,
        nota: 'NO_VIABLE en VLC: sin ventana deslizante de ancho de banda configurable.',
    },
];

// ══════════════════════════════════════════════════════════════════════════════
// 3 · Seleccion por device y por renderer
// ══════════════════════════════════════════════════════════════════════════════
const DEVICES = {
    s905x4: {
        nombre: 'ONN 4K / Amlogic S905X4',
        familia: 'amlogic',
        renderer_gpu: 'skiavk',
        hdr_conversion_mode: 3,
        dolby_vision: false,
        deep_color: '12-bit 4:2:2',
        directivas: {
            AISR: { aplica: true, claves: { aisr_enable: 1, ai_sr_mode: 3, ai_sr_level: 3, ai_pic_mode: 3 } },
            AIPQ: { aplica: true, claves: { aipq_enable: 1, ai_pq_mode: 3 } },
            MEMC: { aplica: false, homologo: { match_content_frame_rate: 1 } },
        },
        player_recomendado: 'VLC (motor nativo) o ExoPlayer',
        vlc_carril: 'solo via CLI (--video-filter); la playlist esta cerrada por politica',
    },
    mt8696: {
        nombre: 'Fire TV 4K Max / MediaTek MT8696',
        familia: 'mtk',
        renderer_gpu: 'skiagl',
        hdr_conversion_mode: 2,
        dolby_vision: true,
        deep_color: '8-bit',
        directivas: {
            AISR: {
                aplica: false,
                homologo: {
                    'com.amazon.tv.picture_sharpness': 65,
                    'com.amazon.tv.dynamic_contrast': 'high',
                },
            },
            AIPQ: {
                aplica: 'parcial',
                claves: {
                    'com.amazon.tv.dynamic_contrast': 'high',
                    'com.amazon.tv.picture_mode': 'movie',
                    'com.amazon.tv.noise_reduction': 'auto',
                },
            },
            MEMC: { aplica: true, claves: { 'com.amazon.tv.motion_smoothness': 2 } },
        },
        player_recomendado: 'ExoPlayer (nativo Android TV)',
        vlc_carril: 'solo via CLI; el motor VLC embebido de OTT Navigator tambien ignora el video-filter de playlist',
    },
};

// ══════════════════════════════════════════════════════════════════════════════
// 4 · Salida
// ══════════════════════════════════════════════════════════════════════════════
const resultado = {
    schema: 'ape.player-homologation/1',
    generado: new Date().toISOString(),
    directivas: DIRECTIVAS,
    buffer_homologos: BUFFER_HOMOLOGOS,
    devices: DEVICES,
    exoplayer_emitido_por_el_generador: {
        load_control: EXOPLAYER_LOAD,
        track_selection: EXOPLAYER_TRACK,
        bandwidth_meter: EXOPLAYER_BW,
    },
    verdad: {
        aisr_aipq_memc: 'son HARDWARE del SoC. Ningun player las ejecuta; solo las piden. El VPS no transcodifica.',
        vlc_playlist: 'En VLC 3.0.24, #EXTVLCOPT:video-filter esta cerrado por politica. La cadena homologada sirve al carril CLI.',
        abr_en_vlc: 'Las 36 opciones adaptive-* no existen en VLC. bandwidthFraction y initialBitrateEstimate son NO_VIABLE ahi.',
        minterpolate: 'Existe en ffmpeg pero mide 23.4x tiempo real solo. En directo 4K no se sostiene. Declararlo como aplicado seria mentir.',
    },
};

const ESJSON = process.argv.includes('--json');
const ESCRIBIR = process.argv.includes('--write');

if (ESJSON) {
    console.log(JSON.stringify(resultado, null, 2));
    if (ESCRIBIR) {
        fs.writeFileSync(OUT, JSON.stringify(resultado, null, 2), 'utf8');
        console.error('escrito: ' + OUT);
    }
    process.exit(0);
}

console.log('=== LAS 3 DIRECTIVAS: donde se ejecutan ===');
console.log('');
for (const [k, d] of Object.entries(DIRECTIVAS)) {
    console.log('  ── ' + k + ' — ' + d.nombre + ' ──');
    console.log('     ejecutor: ' + d.ejecutor + '  (' + d.donde + ')');
    console.log('     ffmpeg   : ' + (d.ffmpeg.viable === true ? 'SI' : d.ffmpeg.viable === false ? 'NO' : d.ffmpeg.viable) + ' — ' + d.ffmpeg.razon.slice(0, 92));
    console.log('     vlc      : ' + (d.vlc.viable === true ? 'SI' : 'NO') + ' — ' + d.vlc.razon.slice(0, 92));
    console.log('     exoplayer: ' + (d.exoplayer.viable === true ? 'SI' : 'NO') + ' — ' + d.exoplayer.razon.slice(0, 92));
    for (const [dev, info] of Object.entries(d.device)) {
        const t = info.tiene === true ? 'SI' : info.tiene === false ? 'NO' : String(info.tiene);
        console.log('       ' + dev.padEnd(8) + ': ' + t.padEnd(8) + (info.peticion || info.homologo || ''));
    }
    console.log('');
}

console.log('=== HOMOLOGOS DE BUFFER: ExoPlayer -> VLC -> ffmpeg ===');
console.log('');
for (const h of BUFFER_HOMOLOGOS) {
    const ok = h.vlc_existe ? 'OK  ' : 'NULO';
    console.log('  ' + ok + '  ' + h.exoplayer.padEnd(46) + ' -> ' + (h.vlc || 'NO_VIABLE en VLC'));
    if (!h.vlc_existe) console.log('         ' + h.nota);
}
console.log('');

console.log('=== SELECTOR POR DEVICE ===');
console.log('');
for (const [id, d] of Object.entries(DEVICES)) {
    console.log('  ── ' + d.nombre + ' ──');
    console.log('     GPU: ' + d.renderer_gpu + '   HDR: ' + d.hdr_conversion_mode + '   DV: ' + (d.dolby_vision ? 'si' : 'no') + '   Deep Color: ' + d.deep_color);
    console.log('     player: ' + d.player_recomendado);
    for (const [cap, info] of Object.entries(d.directivas)) {
        const t = info.aplica === true ? 'APLICA' : info.aplica === false ? 'no tiene' : String(info.aplica);
        const claves = info.claves ? Object.keys(info.claves).join(', ') : Object.keys(info.homologo || {}).join(', ');
        console.log('       ' + cap.padEnd(6) + t.padEnd(12) + claves);
    }
    console.log('');
}

console.log('=== VERDAD ===');
for (const [k, v] of Object.entries(resultado.verdad)) {
    console.log('  ' + k + ': ' + v);
}
