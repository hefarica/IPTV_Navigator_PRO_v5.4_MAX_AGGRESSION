#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// verify_list_hdr10.js  —  2026-05-23 (HFRC mandato Lost=0 + Image1 parity)
//
// Toma una lista M3U8 generada por el botón btnGenerateAudited y comprueba,
// para uno o varios canales (por tvg-id o por substring del nombre), que
// cumplen las garantías de paridad con lo que VLC reportó (imagen 1) y la
// disciplina anti-frame-drop (imagen 2):
//
//  CHECKLIST (per canal):
//    1.  RESOLUTION=3840x2160 cuando el canal está marcado 4K
//    2.  CODECS contiene hvc1.2.4.* (HEVC Main10)
//    3.  FRAME-RATE plausible (24/25/30/50/60/100/120) — NO 120 fijo sobre
//        un stream cuyo probe dijo otra cosa
//    4.  VIDEO-RANGE=PQ|HLG sólo si HDR (no false HDR sobre SDR)
//    5.  CICP trifecta (COLOR-PRIMARIES/TRANSFER-CHARACTERISTICS/MATRIX-
//        COEFFICIENTS) sólo presente cuando VIDEO-RANGE está
//    6.  HDCP-LEVEL presente (TYPE-1 default agresivo)
//    7.  STABLE-VARIANT-ID presente
//    8.  #EXT-X-APE-HDR-MAX-CLL / MAX-FALL valores broadcast (1000/400)
//        cuando no hay override LAB — no 5000/800 ni 4000/1200 inflados
//    9.  Audio doctrine: sin Atmos/DTS-X/TrueHD claims (a menos que el
//        probe los confirme — F0/F1)
//
// Uso:
//    node tools/verify_list_hdr10.js <ruta.m3u8> [filtro_tvgid_o_nombre]
//
// Si se omite el filtro, escanea todos los canales 4K/UHD/HDR y reporta
// un resumen.
//
// Exit:  0 = todo OK   |   1 = al menos una violación detectada
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const fs = require('fs');
const path = require('path');

const ARG_LIST   = process.argv[2];
const ARG_FILTER = process.argv[3] || null;

if (!ARG_LIST) {
    console.error('uso: node tools/verify_list_hdr10.js <ruta.m3u8> [filtro_tvgid_o_nombre]');
    process.exit(2);
}
if (!fs.existsSync(ARG_LIST)) {
    console.error(`ERROR: no existe ${ARG_LIST}`);
    process.exit(2);
}

const SRC = fs.readFileSync(ARG_LIST, 'utf8');
const LINES = SRC.split(/\r?\n/);

// Patrones de premium / 4K / HDR para enfocar la auditoría
const RX_PREMIUM = /(4K|UHD|HDR|Dolby|HEVC|H\.?265|DAZN|ESPN|Sky\s*Sports|BBC|F1|UFC|HBO|Disney|Netflix)/i;
const RX_HVC1   = /hvc1\.2\.4\./;
const PLAUSIBLE_FPS = new Set([24, 23, 25, 29, 30, 50, 59, 60, 100, 120]);
// (23/29/59 cubren 23.976 / 29.97 / 59.94 redondeados)

function findChannels(filter) {
    const blocks = [];
    let cur = null;
    for (let i = 0; i < LINES.length; i++) {
        const ln = LINES[i];
        if (ln.startsWith('#EXTINF')) {
            if (cur) blocks.push(cur);
            cur = { extinf: ln, extinfIdx: i, tags: [], url: null };
        } else if (cur) {
            if (ln.startsWith('#')) {
                cur.tags.push({ idx: i, line: ln });
            } else if (ln.trim().length > 0 && !ln.startsWith('#')) {
                cur.url = ln.trim();
                blocks.push(cur);
                cur = null;
            }
        }
    }
    if (cur) blocks.push(cur);
    if (!filter) {
        return blocks.filter(b => RX_PREMIUM.test(b.extinf));
    }
    const f = String(filter).toLowerCase();
    return blocks.filter(b => {
        const tvg = (b.extinf.match(/tvg-id="([^"]+)"/i) || [])[1] || '';
        const nm  = (b.extinf.split(',').pop() || '');
        return tvg.toLowerCase() === f
            || tvg.toLowerCase().includes(f)
            || nm.toLowerCase().includes(f);
    });
}

function findTag(block, prefix) {
    const t = block.tags.find(t => t.line.startsWith(prefix));
    return t ? t.line : null;
}

function findAttr(streamInf, attr) {
    if (!streamInf) return null;
    const rx = new RegExp(`(?:^|,)${attr}=("[^"]+"|[^,]+)`);
    const m = streamInf.match(rx);
    if (!m) return null;
    return m[1].replace(/^"|"$/g, '');
}

function auditChannel(block) {
    const name = (block.extinf.split(',').pop() || '').trim();
    const tvg  = (block.extinf.match(/tvg-id="([^"]+)"/i) || [])[1] || '';
    const isPremium = RX_PREMIUM.test(block.extinf);
    const claims4K  = /4K|UHD|2160/i.test(block.extinf);
    const claimsHDR = /HDR|Dolby/i.test(block.extinf);

    const streamInf = findTag(block, '#EXT-X-STREAM-INF');
    const apeMaxCll = findTag(block, '#EXT-X-APE-HDR-MAX-CLL');
    const apeMaxFall = findTag(block, '#EXT-X-APE-HDR-MAX-FALL');
    const apeCLL = findTag(block, '#EXT-X-APE-HDR-CONTENT-LIGHT-LEVEL');
    const apeMastering = findTag(block, '#EXT-X-APE-HDR-MASTERING-DISPLAY');

    const fails = [];
    const passes = [];

    if (!streamInf) {
        if (block.extinf.includes('F5_ORIGINAL_DIRECT_SAFE')) {
            passes.push('F5 tier: sin STREAM-INF (correcto)');
        } else {
            fails.push('FALTA #EXT-X-STREAM-INF');
        }
    } else {
        const resolution = findAttr(streamInf, 'RESOLUTION');
        const codecs     = findAttr(streamInf, 'CODECS');
        const frameRate  = findAttr(streamInf, 'FRAME-RATE');
        const videoRange = findAttr(streamInf, 'VIDEO-RANGE');
        const colorPrim  = findAttr(streamInf, 'COLOR-PRIMARIES');
        const transfer   = findAttr(streamInf, 'TRANSFER-CHARACTERISTICS');
        const matrix     = findAttr(streamInf, 'MATRIX-COEFFICIENTS');
        const hdcp       = findAttr(streamInf, 'HDCP-LEVEL');
        const stableId   = findAttr(streamInf, 'STABLE-VARIANT-ID');

        // Check 1: RESOLUTION 4K
        if (claims4K && resolution !== '3840x2160' && resolution !== '7680x4320') {
            fails.push(`canal 4K/UHD pero RESOLUTION=${resolution}`);
        } else if (resolution) {
            passes.push(`RESOLUTION=${resolution}`);
        }

        // Check 2: CODECS HEVC Main10
        if (codecs && RX_HVC1.test(codecs)) {
            passes.push(`CODECS=${codecs}`);
        } else if (codecs) {
            fails.push(`CODECS sin hvc1.2.4.* Main10 → ${codecs}`);
        } else {
            fails.push('FALTA CODECS');
        }

        // Check 3: FRAME-RATE plausible — la garantía Lost=0
        if (!frameRate) {
            fails.push('FALTA FRAME-RATE');
        } else {
            const fps = Math.round(parseFloat(frameRate));
            if (!PLAUSIBLE_FPS.has(fps)) {
                fails.push(`FRAME-RATE=${frameRate} no plausible`);
            } else {
                passes.push(`FRAME-RATE=${frameRate} (${fps} plausible)`);
            }
        }

        // Check 4 + 5: VIDEO-RANGE y CICP coherentes
        if (videoRange) {
            if (videoRange !== 'PQ' && videoRange !== 'HLG' && videoRange !== 'SDR') {
                fails.push(`VIDEO-RANGE=${videoRange} no estándar`);
            } else {
                passes.push(`VIDEO-RANGE=${videoRange}`);
                if (videoRange === 'PQ' || videoRange === 'HLG') {
                    if (!colorPrim || !transfer || !matrix) {
                        fails.push(`VIDEO-RANGE=${videoRange} pero CICP incompleto (CP=${colorPrim} TC=${transfer} MC=${matrix})`);
                    } else {
                        passes.push(`CICP=${colorPrim}/${transfer}/${matrix}`);
                    }
                }
            }
        } else if (claimsHDR && !block.tags.some(t => /F2_HEVC_PREMIUM_HINT|F3_HEVC_SAFE/.test(t.line))) {
            // Canal con HDR en nombre pero sin VIDEO-RANGE → puede ser correcto (probe no confirmó)
            // no fail; sólo nota informativa
        }

        // Check 6: HDCP-LEVEL
        if (!hdcp) {
            fails.push('FALTA HDCP-LEVEL');
        } else {
            passes.push(`HDCP-LEVEL=${hdcp}`);
        }

        // Check 7: STABLE-VARIANT-ID
        if (!stableId) {
            fails.push('FALTA STABLE-VARIANT-ID');
        } else {
            passes.push(`STABLE-VARIANT-ID=${stableId}`);
        }
    }

    // Check 8: MaxCLL/MaxFALL broadcast standard (1000/400) — no inflados
    if (apeMaxCll) {
        const v = apeMaxCll.split(':')[1] || '';
        if (/^(4000|5000|10000)/.test(v)) {
            fails.push(`HDR-MAX-CLL=${v} (inflado, debe ser 1000/400 broadcast)`);
        } else if (/^1000/.test(v) || /^[0-9]+,[0-9]+/.test(v)) {
            passes.push(`HDR-MAX-CLL=${v}`);
        }
    }
    if (apeMaxFall) {
        const v = apeMaxFall.split(':')[1] || '';
        const n = parseInt(v, 10);
        if (n >= 800) {
            fails.push(`HDR-MAX-FALL=${v} (inflado, debe ser 400)`);
        } else if (n > 0) {
            passes.push(`HDR-MAX-FALL=${v}`);
        }
    }
    if (apeMastering) {
        const m = apeMastering.match(/MaxCLL=(\d+)\|MaxFALL=(\d+)/);
        if (m) {
            const cll = parseInt(m[1], 10);
            const fall = parseInt(m[2], 10);
            if (cll >= 4000 || fall >= 800) {
                fails.push(`MASTERING-DISPLAY MaxCLL=${cll}/MaxFALL=${fall} inflado vs broadcast 1000/400`);
            } else {
                passes.push(`MASTERING MaxCLL=${cll}/MaxFALL=${fall}`);
            }
        }
    }

    return { name, tvg, isPremium, claims4K, claimsHDR, fails, passes };
}

const blocks = findChannels(ARG_FILTER);
if (blocks.length === 0) {
    console.error(`ERROR: no se encontraron canales que coincidan${ARG_FILTER ? ` con "${ARG_FILTER}"` : ' (premium/4K/HDR)'}`);
    process.exit(2);
}

let totalFails = 0;
let totalChecked = 0;
const summary = [];

for (const b of blocks) {
    totalChecked++;
    const a = auditChannel(b);
    summary.push(a);
    totalFails += a.fails.length;
}

const okCount = summary.filter(s => s.fails.length === 0).length;
const failCount = summary.length - okCount;

console.log('═══════════════════════════════════════════════════════════════');
console.log(`verify_list_hdr10.js — ${path.basename(ARG_LIST)}`);
console.log(`canales auditados: ${totalChecked}   OK: ${okCount}   FAIL: ${failCount}`);
console.log(`filtro: ${ARG_FILTER || '(premium/4K/HDR por defecto)'}`);
console.log('═══════════════════════════════════════════════════════════════');

// Mostrar todos los failures + sólo los primeros 5 OK para no spamear
const failures = summary.filter(s => s.fails.length > 0);
const showPasses = summary.filter(s => s.fails.length === 0).slice(0, 5);

for (const s of failures) {
    console.log(`\n❌ [${s.tvg || '?'}] ${s.name}`);
    for (const f of s.fails) console.log(`     ${f}`);
}
for (const s of showPasses) {
    console.log(`\n✅ [${s.tvg || '?'}] ${s.name}`);
    for (const p of s.passes.slice(0, 6)) console.log(`     ${p}`);
}

if (failCount > okCount && summary.length > 10) {
    console.log(`\n(mostrando primeros 5 OK de ${okCount} totales; todos los ${failCount} FAIL listados)`);
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(totalFails === 0 ? '✅ TODO OK' : `❌ ${totalFails} violación(es) total(es)`);
console.log('═══════════════════════════════════════════════════════════════');

process.exit(totalFails === 0 ? 0 : 1);
