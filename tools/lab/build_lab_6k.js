#!/usr/bin/env node
/**
 * build_lab_6k.js — añade las variantes 6K emuladas al LAB, en un fichero NUEVO
 *
 * QUÉ HACE
 *   Lee LAB_CALIBRATED_FINAL_v23.0.0-FUSED.json y emite un v24 con SEIS perfiles nuevos
 *   (P0.5, P1.5, P2.5, P3.5, P4.5, P5.5) que son las variantes 6K de P0..P5.
 *
 * QUÉ NO HACE
 *   NO toca P0-P5. Se verifica al final hoja por hoja: si un solo valor de los seis perfiles
 *   base cambia, el script aborta y no escribe nada. El original tampoco se modifica.
 *
 * SPEC DEL OPERADOR, respetada al valor
 *   resolucion   5760x3240  (18.662.400 px; 2.25x de 4K; 0.5625x de 8K)
 *   codec        hvc1.2.4.L183.B0
 *   fps          60
 *   chroma       4:2:0
 *   bit_depth    10
 *   hdr          hdr10_plus_dv_compatible
 *   color_space  bt2020nc
 *   transfer     smpte2084
 *   bitrates     P0.5=80  P1.5=60  P2.5=45  P3.5=35 Mbps (del spec)
 *                P4.5=30  P5.5=25 Mbps (el spec no los fija; se declara la progresion)
 *   tecnicas     P0.5 8k_downsample_lanczos_0.75   P1.5 4k_upscale_ai_sr_1.5x
 *                P2.5 4k_upscale_shader_lanczos_1.5x  P3.5 fhd_upscale_ai_sr_3x
 *                P4.5 hd_upscale_ai_sr_4.5x         P5.5 sd_upscale_ai_sr_6.75x
 *
 * VERIFICACIÓN DEL NIVEL
 *   5760x3240@60 = 1.119.744.000 samples/s. El techo de L183 (Level 6.1) es 2.139.095.040.
 *   Cabe con 1.91x de margen. L186 (Level 6.2) seria 8K@120 y mentiria sobre la capacidad.
 *
 * LO QUE EL FICHERO DECLARA Y NO PROMETE
 *   El 6K es DECLARADO como enhancement de display, nunca como fuente real. Cada perfil lleva
 *   source_handling explícito y la marca NOT_SOURCE. La ley Crystal 6K exige exactamente eso.
 *
 * Uso:  node tools/lab/build_lab_6k.js [--out <ruta>] [--dry]
 */

'use strict';

const fs = require('fs');
const crypto = require('crypto');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const DRY = args.indexOf('--dry') >= 0;
const IN = 'artifacts/LAB_CALIBRATED_FINAL_v23.0.0-FUSED.json';
const OUT = get('--out') || 'artifacts/LAB_CALIBRATED_FINAL_v24.0.0-6K.json';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ══════════════════════════════════════════════════════════════════════════
// 1 · Carga
// ══════════════════════════════════════════════════════════════════════════
if (!fs.existsSync(IN)) { console.error('no existe ' + IN); process.exit(2); }
const srcBuf = fs.readFileSync(IN);
const src = JSON.parse(srcBuf.toString('utf8'));
const shaIn = sha(srcBuf);

console.log('=== FUENTE ===');
console.log('  ' + IN);
console.log('  bytes  : ' + srcBuf.length);
console.log('  sha256 : ' + shaIn);
console.log('  perfiles: ' + Object.keys(src.profiles_calibrated).join(', '));

// fotografía de P0-P5 para verificar que no cambian
const antes = {};
for (const id of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
    antes[id] = JSON.stringify(src.profiles_calibrated[id]);
}
console.log('  foto de P0-P5 tomada para verificar intactos');

// ══════════════════════════════════════════════════════════════════════════
// 2 · Definición de las seis variantes 6K
// ══════════════════════════════════════════════════════════════════════════
const V6K = {
    'P0.5': { base: 'P0', mbps: 80, tecnica: '8k_downsample_lanczos_0.75', origen: '7680x4320', ratio: '0.75x', modo: 'adaptive_downscale' },
    'P1.5': { base: 'P1', mbps: 60, tecnica: '4k_upscale_ai_sr_1.5x', origen: '3840x2160', ratio: '1.50x', modo: 'adaptive_upscaling' },
    'P2.5': { base: 'P2', mbps: 45, tecnica: '4k_upscale_shader_lanczos_1.5x', origen: '3840x2160', ratio: '1.50x', modo: 'adaptive_upscaling' },
    'P3.5': { base: 'P3', mbps: 35, tecnica: 'fhd_upscale_ai_sr_3x', origen: '1920x1080', ratio: '3.00x', modo: 'adaptive_upscaling' },
    'P4.5': { base: 'P4', mbps: 30, tecnica: 'hd_upscale_ai_sr_4.5x', origen: '1280x720', ratio: '4.50x', modo: 'adaptive_upscaling' },
    'P5.5': { base: 'P5', mbps: 25, tecnica: 'sd_upscale_ai_sr_6.75x', origen: '854x480', ratio: '6.75x', modo: 'adaptive_upscaling' },
};

const TARGET = '5760x3240';
const PIXELS = 18662400;
const CODEC6K = 'hvc1.2.4.L183.B0';

// cadenas de realce por técnica (del spec, traducidas a lo que el sistema ya usa)
const CADENAS = {
    '8k_downsample_lanczos_0.75': 'zscale=w=5760:h=3240:filter=lanczos,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.0,zscale=transfer=smpte2084:primaries=bt2020:matrix=bt2020nc:dither=error_diffusion:range=full',
    '4k_upscale_ai_sr_1.5x': 'deblock=filter=strong,scale=w=5760:h=3240:flags=lanczos,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.6:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.3,zscale=transfer=smpte2084:primaries=bt2020:matrix=bt2020nc:dither=error_diffusion:range=full',
    '4k_upscale_shader_lanczos_1.5x': 'zscale=w=5760:h=3240:filter=lanczos,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.8:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.3,hqdn3d=1.5:1.0:2.0:1.5,zscale=transfer=smpte2084:primaries=bt2020:matrix=bt2020nc:dither=error_diffusion:range=full',
    'fhd_upscale_ai_sr_3x': 'deblock=filter=strong,scale=w=5760:h=3240:flags=lanczos,nlmeans=s=2.5:p=5:r=11,atadenoise,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=1.0:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.3,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=0,zscale=transfer=smpte2084:primaries=bt2020:matrix=bt2020nc:dither=error_diffusion:range=full',
    'hd_upscale_ai_sr_4.5x': 'deblock=filter=strong,scale=w=5760:h=3240:flags=lanczos,nlmeans=s=3.0:p=7:r=15,atadenoise,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=1.1:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.3,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=0,zscale=transfer=smpte2084:primaries=bt2020:matrix=bt2020nc:dither=error_diffusion:range=full',
    'sd_upscale_ai_sr_6.75x': 'deblock=filter=strong,scale=w=5760:h=3240:flags=lanczos,nlmeans=s=3.2:p=7:r=17,atadenoise,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=1.2:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.3,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=0,zscale=transfer=smpte2084:primaries=bt2020:matrix=bt2020nc:dither=error_diffusion:range=full',
};

// ══════════════════════════════════════════════════════════════════════════
// 3 · Construcción de cada perfil 6K a partir de su base
// ══════════════════════════════════════════════════════════════════════════
const nuevos = {};

for (const id of Object.keys(V6K)) {
    const d = V6K[id];
    const base = src.profiles_calibrated[d.base];
    if (!base) { console.error('falta el perfil base ' + d.base); process.exit(1); }

    // clon profundo del base: hereda todas las claves que el sistema ya sabe leer
    const p = JSON.parse(JSON.stringify(base));

    // identidad
    p.id = id;
    p.name = '6K Emulated (' + d.base + ')';
    p.role = '6K Emulated';
    p.level = (base.level || 0) + 0.5;
    p.quality = '6K_EMULATED';
    p.description = 'Variante 6K emulada de ' + d.base + ' — 5760x3240 por ' + d.tecnica
        + '. Declarado como enhancement de display, nunca como fuente real.';

    // settings: los seis campos que definen la variante
    p.settings = p.settings || {};
    p.settings.resolution = TARGET;
    p.settings.maxResolution = TARGET;
    p.settings.fps = 60;
    p.settings.targetFps = 60;
    p.settings.target_framerate = '60FPS';
    p.settings.bitrate = d.mbps;
    p.settings.maxBitrateKbps = d.mbps * 1000;
    p.settings.avgBitrateKbps = Math.round(d.mbps * 1000 * 0.8);
    p.settings.codec_full = CODEC6K;
    p.settings.codec_string = CODEC6K + ',ac-3';
    p.settings.codec = 'H265';
    p.settings.codec_primary = 'HEVC';
    p.settings.codec_chain_video = CODEC6K + ',' + (base.settings.codec_chain_video || '');
    p.settings.bit_depth = 10;
    p.settings.chroma_subsampling = '4:2:0';
    p.settings.hdr_mode = 'HDR10PLUS';
    p.settings.color_primaries = 9;
    p.settings.transfer_characteristics = 16;
    p.settings.matrix_coefficients = 9;

    // resolution de primer nivel (algunos consumidores la leen ahi)
    p.resolution = TARGET;

    // vlcopt: geometria y filtro de la variante
    p.vlcopt = p.vlcopt || {};
    p.vlcopt['video-width'] = 5760;
    p.vlcopt['video-height'] = 3240;
    p.vlcopt['video-fps'] = 60;
    p.vlcopt['video-bit-depth'] = 10;
    p.vlcopt['video-chroma'] = '4:2:0';
    p.vlcopt['video-color-transfer'] = 'smpte2084';
    p.vlcopt['video-hdr'] = true;
    p.vlcopt['video-hdr-mode'] = 'HDR10PLUS';
    p.vlcopt['video-hdr-nits'] = (base.settings && base.settings.bit_rate_high) ? base.settings.hdr_nits || 1000 : 1000;
    p.vlcopt['video-filter'] = CADENAS[d.tecnica];
    p.vlcopt['adaptive-maxwidth'] = 5760;
    p.vlcopt['adaptive-maxheight'] = 3240;
    p.vlcopt['adaptive-maxbitrate'] = d.mbps * 1000000;
    p.vlcopt['adaptive-initial-bandwidth'] = d.mbps * 1000000;

    // headerOverrides: lo que el player ve
    p.headerOverrides = p.headerOverrides || {};
    p.headerOverrides['X-APE-Profile'] = id;
    p.headerOverrides['X-APE-Target-Res'] = TARGET;
    p.headerOverrides['X-APE-Emulation-Mode'] = d.modo;
    p.headerOverrides['X-APE-Source-Scale'] = d.ratio;
    p.headerOverrides['X-APE-Source-Res'] = d.origen;
    p.headerOverrides['X-APE-6K-Technique'] = d.tecnica;
    p.headerOverrides['X-APE-6K-Truth'] = 'DECLARED_ENHANCEMENT;NOT_SOURCE;DOWNSCALE_FORBIDDEN';
    p.headerOverrides['X-APE-RESOLUTION'] = TARGET + ',' + (base.headerOverrides && base.headerOverrides['X-APE-RESOLUTION'] || '');

    // actor_injections: mantener coherencia
    if (p.actor_injections && p.actor_injections.panel) {
        p.actor_injections.panel.bit_depth = 10;
        p.actor_injections.panel.chroma_subsampling = '4:2:0';
        p.actor_injections.panel.hdr_type = 'HDR10+ + Dolby Vision compatible';
        p.actor_injections.panel.color_primaries = 'BT.2020';
        p.actor_injections.panel.color_transfer = 'SMPTE_ST_2084';
    }

    // bounds: el escalado 6K cuesta memoria, se deja el mismo margen que el base
    // (no se inventan limites nuevos: se heredan)
    // optimized_knobs: heredados, con el buffer intacto
    if (p.optimized_knobs) {
        p.optimized_knobs.abrBandWidthFactor = Math.min(0.95, (Number(p.optimized_knobs.abrBandWidthFactor) || 0.85) + 0.05);
    }

    // ── BLOQUES DEL SPEC que este fichero no tenia ──
    p.source_handling = {
        from_8k: 'downsample_lanczos_0.75',
        from_4k: 'upscale_ai_sr_1.5x',
        from_fhd: 'upscale_ai_sr_3x',
        preferred_source: '8k_downsampled',
        actual_for_this_profile: d.tecnica,
        source_resolution: d.origen,
    };

    p.emulation = {
        mode: d.modo,
        scale_ratio: d.ratio,
        shader_chain: ['deblock', d.tecnica, 'unsharp_mask_0.6_0.3', 'dither_10bit'],
        temporal_stabilization: true,
        grain_synthesis: 'film_grain_6k_preset',
        // honestidad: el shader_chain es declarativo. El ejecutor real es el VPP del SoC.
        apply: 'device_vpp_declared',
        declared_not_applied_by_vps: true,
    };

    p.compatibility = {
        min_soc: ['s905x4', 't982', 'g12b', 's928x', 'tegra-x1', 'tegra-orin'],
        min_ram_mb: 3072,
        max_display: '7680x4320',
        required_features: ['hevc_6k60', '10bit', 'hdr10_plus'],
        fallback_profile: d.base,
        // el device debe reportar al menos 5760x3240 de salida
        min_display: TARGET,
    };

    // marca de linaje
    p.base_profile = d.base;
    p.is_emulated = true;
    p.declared_enhancement = true;

    nuevos[id] = p;
}

// ══════════════════════════════════════════════════════════════════════════
// 4 · Montaje del fichero v24
// ══════════════════════════════════════════════════════════════════════════
const out = JSON.parse(JSON.stringify(src));

// insertar los seis nuevos DESPUES de su base, para que el orden lea natural
const ordenados = {};
for (const id of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
    ordenados[id] = out.profiles_calibrated[id];
    const hijo = id + '.5';
    if (nuevos[hijo]) ordenados[hijo] = nuevos[hijo];
}
out.profiles_calibrated = ordenados;

// metadatos del fichero
out.version = '23.1.0-6K-EMULATED';
out.lab_version = 'v24-6K';
out.synthesized_at = new Date().toISOString();
out.emulated_6k = {
    enabled: true,
    target_resolution: TARGET,
    pixel_count: PIXELS,
    vs_4k_ratio: 2.25,
    vs_8k_ratio: 0.5625,
    codec: CODEC6K,
    level_note: 'L183 = HEVC Level 6.1; 5760x3240@60 usa 1.12 G samples/s de un techo de 2.14 G',
    profiles: Object.keys(V6K),
    activation: 'automatica si el device reporta >=5760x3240 y un SoC capaz; forzable con ?ape6k=1',
    truth: 'DECLARED_ENHANCEMENT — nunca se declara la fuente como 6K real',
    bitrates_mbps: Object.fromEntries(Object.entries(V6K).map(([k, v]) => [k, v.mbps])),
    bitrate_note: 'P0.5-P3.5 del spec del operador; P4.5 y P5.5 son la progresion declarada',
};

out.provenance_lab_final = out.provenance_lab_final || {};
out.provenance_lab_final.built_at = new Date().toISOString();
out.provenance_lab_final.base_file = IN;
out.provenance_lab_final.base_sha256 = shaIn;
out.provenance_lab_final.change = 'añadidas las seis variantes 6K emuladas; P0-P5 sin tocar';
out.provenance_lab_final.added_profiles = Object.keys(V6K);

// ══════════════════════════════════════════════════════════════════════════
// 5 · Verificación: P0-P5 intactos
// ══════════════════════════════════════════════════════════════════════════
console.log('');
console.log('=== VERIFICACION ===');
let intactos = 0, rotos = 0;
for (const id of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
    const igual = JSON.stringify(out.profiles_calibrated[id]) === antes[id];
    if (igual) intactos++; else { rotos++; console.error('  ROTO: ' + id + ' cambio'); }
}
console.log('  P0-P5 intactos    : ' + intactos + '/6 ' + (rotos === 0 ? 'PASS' : 'FALLO'));
if (rotos > 0) { console.error('  ABORTA: no se escribe nada'); process.exit(1); }

console.log('  perfiles totales  : ' + Object.keys(out.profiles_calibrated).length);
console.log('  nuevos            : ' + Object.keys(V6K).join(', '));

// verificar cada 6K
for (const id of Object.keys(V6K)) {
    const p = out.profiles_calibrated[id];
    const s = p.settings;
    const ok = s.resolution === TARGET && s.fps === 60 && s.codec_full === CODEC6K
        && s.bit_depth === 10 && s.chroma_subsampling === '4:2:0'
        && Number(s.bitrate) === V6K[id].mbps;
    console.log('    ' + id + '  ' + (ok ? 'OK ' : 'MAL') + '  ' + s.resolution + '  ' + s.bitrate + ' Mbps  ' + s.codec_full);
    if (!ok) { console.error('  ABORTA'); process.exit(1); }
}

// nivel HEVC verificado
const samples = PIXELS * 60;
const techo = 2139095040;
console.log('  nivel L183        : ' + samples + ' samples/s de ' + techo + ' (' + (techo / samples).toFixed(2) + 'x margen) ' + (samples <= techo ? 'PASS' : 'FALLO'));

// ══════════════════════════════════════════════════════════════════════════
// 6 · Escritura
// ══════════════════════════════════════════════════════════════════════════
const txt = JSON.stringify(out, null, 1);
console.log('');
console.log('=== SALIDA ===');
console.log('  bytes  : ' + Buffer.byteLength(txt));
console.log('  sha256 : ' + sha(Buffer.from(txt, 'utf8')));

if (DRY) {
    console.log('  (dry run: no se escribe nada)');
} else {
    fs.writeFileSync(OUT, txt, 'utf8');
    console.log('  escrito: ' + OUT);
}
