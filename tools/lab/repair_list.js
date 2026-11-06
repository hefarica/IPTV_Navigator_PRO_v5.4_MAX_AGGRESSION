#!/usr/bin/env node
/**
 * repair_list.js — devuelve a la lista los valores de continuidad que perdio, y le anade el 6K
 *
 * QUE SE PERDIO en APE_LISTA_1793926685925 (medido contra la CACHEFIX del mismo dia)
 *
 *   network-caching        55000 ms  ->     500 ms     el freeze de medio segundo
 *   PREFETCH SEGMENTS          90    ->       8        11x menos prefetch
 *   PREFETCH PARALLEL          40    ->       4        10x menos paralelo
 *   buffer_segments            90    ->       8        11x menos buffer
 *   X-APE-STRATEGY       ULTRA-AGGRESSIVE -> ADAPTIVE   un escalon mas conservador
 *   PREFETCH-STRATEGY    ULTRA_AGRESIVO   -> ADAPTIVE
 *   ADAPTIVE-INTELLIGENCE   enabled  ->  disabled
 *   AI-PREDICTION           enabled  ->  disabled
 *
 * QUE SE GANO y NO SE TOCA
 *
 *   atadenoise en el video-filter  — se conserva tal cual
 *   buffer objetivo 10 s           — se conserva y se propaga a los caching
 *
 * QUE SE ANADE
 *
 *   Variante 6K emulada (5760x3240, hvc1.2.4.L183.B0) por canal, con la tabla del spec que ya
 *   usa el VPS: P0->P0.5 80 Mbps, P1->P1.5 60, P2->P2.5 45, P3->P3.5 35, P4->P4.5 30, P5->P5.5 25.
 *   Marcada DECLARED_ENHANCEMENT;NOT_SOURCE — nunca como fuente real.
 *
 * LO QUE NO HACE
 *
 *   No elimina lineas. No reordena. No toca codecs base, HDR ni el video-filter.
 *
 * Uso: node tools/lab/repair_list.js --in <lista.m3u8> --out <salida.m3u8> [--dry]
 */

'use strict';

const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const IN = get('--in');
const OUT = get('--out');
const DRY = args.indexOf('--dry') >= 0;

if (!IN || !fs.existsSync(IN)) { console.error('falta --in con un fichero existente'); process.exit(2); }
if (!DRY && !OUT) { console.error('falta --out (o usa --dry)'); process.exit(2); }

// tabla 6K: la misma del spec y del VPS
const V6K = {
    P0: { id: 'P0.5', mbps: 80, tec: '8k_downsample_lanczos_0.75', src: '7680x4320', ratio: '0.75x' },
    P1: { id: 'P1.5', mbps: 60, tec: '4k_upscale_ai_sr_1.5x', src: '3840x2160', ratio: '1.50x' },
    P2: { id: 'P2.5', mbps: 45, tec: '4k_upscale_shader_lanczos_1.5x', src: '3840x2160', ratio: '1.50x' },
    P3: { id: 'P3.5', mbps: 35, tec: 'fhd_upscale_ai_sr_3x', src: '1920x1080', ratio: '3.00x' },
    P4: { id: 'P4.5', mbps: 30, tec: 'hd_upscale_ai_sr_4.5x', src: '1280x720', ratio: '4.50x' },
    P5: { id: 'P5.5', mbps: 25, tec: 'sd_upscale_ai_sr_6.75x', src: '854x480', ratio: '6.75x' },
};

const RE_NET = /^#EXTVLCOPT:network-caching=([0-9]+)$/;
const RE_LIVE = /^#EXTVLCOPT:live-caching=([0-9]+)$/;
const RE_BUFSEC = /^#EXT-X-APE-BUFFER-SECONDS:([0-9]+)$/;
const RE_CACHE_K = [
    { k: 'ts-caching', re: /^#EXTVLCOPT:ts-caching=([0-9]+)$/ },
    { k: 'hls-caching', re: /^#EXTVLCOPT:hls-caching=([0-9]+)$/ },
    { k: 'hls-max-buffer-duration', re: /^#EXTVLCOPT:hls-max-buffer-duration=([0-9]+)$/ },
];
const RE_PF_PARALLEL = /^#EXT-X-APE-PREFETCH-PARALLEL:[0-9]+$/;
const RE_KODI_SEG = /^#KODIPROP:inputstream\.adaptive\.buffer_segments=([0-9]+)$/;
const RE_KODI_DUR = /^#KODIPROP:inputstream\.adaptive\.buffer_duration=([0-9]+)$/;
const RE_PERFIL = /ape-profile="(P[0-9.]+)"/;
const RE_URL = /^https?:\/\//;

const PF_FULL = '#EXT-X-APE-PREFETCH:ENABLED=true,SEGMENTS=90,PARALLEL=40,ADAPTIVE=enabled,AI=enabled';
const PF_PARALLEL = '#EXT-X-APE-PREFETCH-PARALLEL:40';
const PF_STRATEGY = '#EXT-X-APE-PREFETCH-STRATEGY:ULTRA_AGRESIVO';
const PF_ADAPTIVE = '#EXT-X-APE-PREFETCH-ADAPTIVE-INTELLIGENCE:enabled';
const PF_AI = '#EXT-X-APE-PREFETCH-AI-PREDICTION:enabled';
const STRATEGY = '#EXT-X-APE-STRATEGY:ULTRA-AGGRESSIVE';
const KODI_SEG = '#KODIPROP:inputstream.adaptive.buffer_segments=90';

function sha256File(p) {
    const h = crypto.createHash('sha256');
    const fd = fs.openSync(p, 'r');
    const b = Buffer.alloc(1 << 20);
    let pos = 0, n;
    while ((n = fs.readSync(fd, b, 0, b.length, pos)) > 0) { h.update(b.subarray(0, n)); pos += n; }
    fs.closeSync(fd);
    return h.digest('hex');
}

function streamInf6K(v) {
    return '#EXT-X-STREAM-INF:'
        + 'BANDWIDTH=' + (v.mbps * 1000000)
        + ',AVERAGE-BANDWIDTH=' + Math.round(v.mbps * 1000000 * 0.8)
        + ',CODECS="hvc1.2.4.L183.B0,mp4a.40.2"'
        + ',RESOLUTION=5760x3240'
        + ',FRAME-RATE=60.000'
        + ',VIDEO-RANGE=PQ'
        + ',BIT-DEPTH=10'
        + ',CHROMA-SUBSAMPLING=4:2:0'
        + ',STABLE-VARIANT-ID="' + v.id + '_6K_EMULATED"';
}

function tags6K(v, perfil) {
    return [
        '#EXT-X-APE-CRYSTAL-6K:OPT-IN-ACTIVE;PROFILE=' + v.id + ';BASE=' + perfil
            + ';RES=5760x3240;PIXELS=18662400;CODEC=hvc1.2.4.L183.B0',
        '#EXT-X-APE-CRYSTAL-6K-MODE:EMULATED;SOURCE=' + v.src + ';TECHNIQUE=' + v.tec
            + ';RATIO=' + v.ratio + ';ENHANCEMENT=DISPLAY_DECLARED',
        '#EXT-X-APE-CRYSTAL-6K-TRUTH:DECLARED_ENHANCEMENT;NOT_SOURCE;DOWNSCALE_FORBIDDEN',
    ];
}

function procesarBloque(buffer, ctx, out) {
    if (!buffer.length) { return; }

    const mPerfil = buffer[0].match(RE_PERFIL);
    const perfil = mPerfil ? mPerfil[1].split('.')[0] : null;

    let live = null;
    let bufSec = null;
    for (const l of buffer) {
        let m;
        if ((m = l.match(RE_LIVE))) { live = m[1]; }
        else if ((m = l.match(RE_BUFSEC))) { bufSec = parseInt(m[1], 10); }
    }
    const bufMs = String((bufSec || 10) * 1000);
    const v = perfil ? V6K[perfil] : null;

    const salida = [];
    for (const l of buffer) {
        if (l.startsWith('#EXT-X-STREAM-INF')) {
            ctx.n_stream++;
            salida.push(v ? streamInf6K(v) : l);
            if (v) { ctx.n_6k++; }
            continue;
        }
        let m;
        if ((m = l.match(RE_NET))) {
            if (live && m[1] !== live) { ctx.n_net++; salida.push('#EXTVLCOPT:network-caching=' + live); }
            else { salida.push(l); }
            continue;
        }
        let hecho = false;
        for (const c of RE_CACHE_K) {
            const mc = l.match(c.re);
            if (mc) {
                if (mc[1] !== bufMs) { ctx.n_cache++; salida.push('#EXTVLCOPT:' + c.k + '=' + bufMs); }
                else { salida.push(l); }
                hecho = true;
                break;
            }
        }
        if (hecho) { continue; }
        if (l.startsWith('#EXT-X-APE-PREFETCH:')) {
            if (l !== PF_FULL) { ctx.n_pf++; salida.push(PF_FULL); } else { salida.push(l); }
            continue;
        }
        if (RE_PF_PARALLEL.test(l)) {
            if (l !== PF_PARALLEL) { ctx.n_pf++; salida.push(PF_PARALLEL); } else { salida.push(l); }
            continue;
        }
        if (l.startsWith('#EXT-X-APE-PREFETCH-STRATEGY:')) {
            if (l !== PF_STRATEGY) { ctx.n_pf++; salida.push(PF_STRATEGY); } else { salida.push(l); }
            continue;
        }
        if (l.startsWith('#EXT-X-APE-PREFETCH-ADAPTIVE-INTELLIGENCE:')) {
            if (l !== PF_ADAPTIVE) { ctx.n_pf++; salida.push(PF_ADAPTIVE); } else { salida.push(l); }
            continue;
        }
        if (l.startsWith('#EXT-X-APE-PREFETCH-AI-PREDICTION:')) {
            if (l !== PF_AI) { ctx.n_pf++; salida.push(PF_AI); } else { salida.push(l); }
            continue;
        }
        if (l.startsWith('#EXT-X-APE-STRATEGY:')) {
            if (l !== STRATEGY) { ctx.n_strat++; salida.push(STRATEGY); } else { salida.push(l); }
            continue;
        }
        const mkSeg = l.match(RE_KODI_SEG);
        if (mkSeg) {
            if (mkSeg[1] !== '90') { ctx.n_kodi++; salida.push(KODI_SEG); } else { salida.push(l); }
            continue;
        }
        const mkDur = l.match(RE_KODI_DUR);
        if (mkDur) {
            if (mkDur[1] !== bufMs) {
                ctx.n_kodi++;
                salida.push('#KODIPROP:inputstream.adaptive.buffer_duration=' + bufMs);
            } else { salida.push(l); }
            continue;
        }
        salida.push(l);
    }

    if (v) {
        const iUrl = salida.findIndex((l) => RE_URL.test(l));
        const t6 = tags6K(v, perfil);
        if (iUrl >= 0) { salida.splice(iUrl, 0, ...t6); }
        else { salida.push(...t6); }
    }

    if (out) { out.write(salida.join('\n') + '\n'); }
}

(async () => {
    console.log('=== FUENTE ===');
    console.log('  ' + IN);
    console.log('  bytes  : ' + fs.statSync(IN).size);
    console.log('  sha256 : ' + sha256File(IN));

    const out = DRY ? null : fs.createWriteStream(OUT);
    const rl = readline.createInterface({
        input: fs.createReadStream(IN, { encoding: 'utf8', highWaterMark: 1 << 20 }),
        crlfDelay: Infinity,
    });

    const ctx = {
        n_net: 0, n_cache: 0, n_pf: 0, n_strat: 0, n_kodi: 0, n_6k: 0, n_stream: 0,
        canales: 0, lineas: 0,
    };
    let buffer = [];

    for await (const linea of rl) {
        ctx.lineas++;
        if (linea.startsWith('#EXTINF')) {
            procesarBloque(buffer, ctx, out);
            buffer = [];
            ctx.canales++;
            buffer.push(linea);
            continue;
        }
        if (!buffer.length) {
            if (out) { out.write(linea + '\n'); }
            continue;
        }
        buffer.push(linea);
        if (RE_URL.test(linea)) {
            procesarBloque(buffer, ctx, out);
            buffer = [];
        }
    }
    procesarBloque(buffer, ctx, out);

    if (out) { out.end(); await new Promise((r) => out.on('close', r)); }

    console.log('');
    console.log('=== RESULTADO ===');
    console.log('  lineas            : ' + ctx.lineas);
    console.log('  canales           : ' + ctx.canales);
    console.log('  network-caching   : ' + ctx.n_net + ' corregidos');
    console.log('  caching derivados : ' + ctx.n_cache + ' corregidos');
    console.log('  prefetch          : ' + ctx.n_pf + ' corregidos');
    console.log('  estrategia        : ' + ctx.n_strat + ' corregidos');
    console.log('  kodi buffer       : ' + ctx.n_kodi + ' corregidos');
    console.log('  STREAM-INF vistos : ' + ctx.n_stream);
    console.log('  6K anadidos       : ' + ctx.n_6k);

    if (DRY) {
        console.log('');
        console.log('  (dry run: no se escribio nada)');
        return;
    }
    const st = fs.statSync(OUT);
    console.log('');
    console.log('  salida : ' + OUT);
    console.log('  bytes  : ' + st.size + '  (origen ' + fs.statSync(IN).size + ', delta ' + (st.size - fs.statSync(IN).size) + ')');
    console.log('  sha256 : ' + sha256File(OUT));
})().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
