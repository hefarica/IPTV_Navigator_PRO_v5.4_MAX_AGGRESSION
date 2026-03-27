#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * restructure_m3u8.js — M3U8 Universal Restructurer v6.1
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Procesa un M3U8 de ~500MB línea por línea (streaming) y:
 *   1. Sanitiza ┃ → | en EXTINF (grupo fantasma fix)
 *   2. Deduplica EXTVLCOPT con Rules Engine (NEVER_DOWN / EXACT_MATCH)
 *   3. Deduplica KODIPROP y ajusta valores profile-aware
 *   4. Consolida FALLBACK-IDs sueltos en un solo B64 blob
 *   5. Deduplica APE tags (BUFFER, RECONNECT, etc.)
 *   6. Elimina la inyección nuclear de caching=3000 (NEVER_DOWN violated)
 *   7. Emite en orden de capas: EXTINF → EXTHTTP → EXTVLCOPT → KODIPROP → APE → URL
 *
 * Uso:
 *   node restructure_m3u8.js input.m3u8 output.m3u8
 *
 * ═══════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// PROFILE CONFIG — resolución y bandwidth reales por perfil
// ═══════════════════════════════════════════════════════════════
const PROFILES = {
    P0: { res: '7680x4320', maxBw: 130000000, fps: 120, height: 4320 },
    P1: { res: '3840x2160', maxBw: 50000000, fps: 60, height: 2160 },
    P2: { res: '3840x2160', maxBw: 35000000, fps: 30, height: 2160 },
    P3: { res: '1920x1080', maxBw: 15000000, fps: 60, height: 1080 },
    P4: { res: '1280x720',  maxBw: 8000000,  fps: 30, height: 720 },
    P5: { res: '854x480',   maxBw: 3000000,  fps: 25, height: 480 }
};

// ═══════════════════════════════════════════════════════════════
// VLC DEDUP RULES — qué valor gana si hay duplicados
// ═══════════════════════════════════════════════════════════════
// Policy: KEEP_HIGHEST (NEVER_DOWN), KEEP_LOWEST (NEVER_UP), KEEP_FIRST (EXACT_MATCH)
const VLC_DEDUP = {
    'network-caching':    'KEEP_HIGHEST',
    'live-caching':       'KEEP_HIGHEST',
    'file-caching':       'KEEP_HIGHEST',
    'disc-caching':       'KEEP_HIGHEST',
    'tcp-caching':        'KEEP_HIGHEST',
    'sout-mux-caching':   'KEEP_HIGHEST',
    'clock-jitter':       'KEEP_HIGHEST',
    'clock-synchro':      'KEEP_FIRST',  // 1 es definitivo
    'avcodec-hw':         'KEEP_FIRST',  // 'any' es definitivo
    'avcodec-threads':    'KEEP_FIRST',
    'avcodec-dr':         'KEEP_FIRST',
    'deinterlace':        'KEEP_FIRST',
    'deinterlace-mode':   'KEEP_FIRST',  // bwdif es definitivo
    'preferred-codec':    'KEEP_FIRST',
    'codec-priority':     'KEEP_FIRST',
    'preferred-resolution': 'KEEP_HIGHEST',
    'adaptive-maxwidth':  'KEEP_HIGHEST',
    'adaptive-maxheight': 'KEEP_HIGHEST',
    'adaptive-logic':     'KEEP_FIRST',
    'avcodec-hurry-up':   'KEEP_LOWEST',
    'avcodec-fast':       'KEEP_LOWEST',
    'avcodec-skiploopfilter': 'KEEP_LOWEST',
    'avcodec-skipframe':  'KEEP_LOWEST',
    'avcodec-skip-idct':  'KEEP_LOWEST',
    'avcodec-lowres':     'KEEP_LOWEST',
    'postproc-quality':   'KEEP_HIGHEST',
    'swscale-mode':       'KEEP_HIGHEST',
    'high-priority':      'KEEP_HIGHEST',
    'mtu':                'KEEP_HIGHEST',
    'sout-video-bitrate': 'KEEP_HIGHEST',
    'sout-video-maxrate': 'KEEP_HIGHEST',
    'sout-video-bufsize': 'KEEP_HIGHEST',
    'video-filter':       'KEEP_FIRST',
    'repeat':             'KEEP_HIGHEST',
    'input-repeat':       'KEEP_HIGHEST',
    'adaptive-cache-size':'KEEP_HIGHEST'
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function parseNum(val) {
    if (val === 'UNLIMITED' || val === 'TRUE' || val === 'ENABLED') return Infinity;
    const m = String(val).match(/^(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
}

function b64Encode(str) {
    return Buffer.from(str, 'utf8').toString('base64');
}

function resolveVlcDup(key, oldVal, newVal) {
    const policy = VLC_DEDUP[key] || 'KEEP_FIRST';
    if (policy === 'KEEP_FIRST') return oldVal;
    const oldN = parseNum(oldVal);
    const newN = parseNum(newVal);
    if (oldN === null || newN === null) return oldVal; // can't compare, keep first
    if (policy === 'KEEP_HIGHEST') return newN > oldN ? newVal : oldVal;
    if (policy === 'KEEP_LOWEST') return newN < oldN ? newVal : oldVal;
    return oldVal;
}

// ═══════════════════════════════════════════════════════════════
// CHANNEL PROCESSOR — acumula tags, deduplicar, reordenar
// ═══════════════════════════════════════════════════════════════
function processChannel(channel) {
    const { extinf, tags, url, profile } = channel;
    const profileCfg = PROFILES[profile] || PROFILES.P3;
    const output = [];

    // ── CAPA 1: EXTINF (sanitizar pipes) ──
    output.push(extinf.replace(/\u2503/g, '|'));

    // Clasificar tags por tipo
    const exthttp = [];
    const overflow = [];
    const vlcOpts = new Map(); // key → value (deduped)
    const kodiProps = new Map(); // key → value (deduped)
    const apeTags = new Map(); // key → value (deduped)
    const apeUnique = []; // tags APE sin key:value (ej: líneas completas)
    const extattrfromurl = [];
    const fallbackIds = {}; // for B64 consolidation
    let currentFallbackId = null;
    const cortexTags = [];
    const otherTags = [];

    for (const tag of tags) {
        // EXTHTTP
        if (tag.startsWith('#EXTHTTP:')) {
            exthttp.push(tag);
        }
        // OVERFLOW HEADERS
        else if (tag.startsWith('#EXT-X-APE-OVERFLOW-HEADERS:')) {
            overflow.push(tag);
        }
        // EXTVLCOPT — deduplicate with rules
        else if (tag.startsWith('#EXTVLCOPT:')) {
            const m = tag.match(/^#EXTVLCOPT:([^=]+)=?(.*)$/);
            if (m) {
                const [, key, value] = m;
                if (vlcOpts.has(key)) {
                    const winner = resolveVlcDup(key, vlcOpts.get(key), value);
                    vlcOpts.set(key, winner);
                } else {
                    vlcOpts.set(key, value);
                }
            } else {
                // boolean VLC opts like #EXTVLCOPT:ffmpeg-hw
                const boolKey = tag.replace('#EXTVLCOPT:', '');
                vlcOpts.set(boolKey, '');
            }
        }
        // KODIPROP — deduplicate
        else if (tag.startsWith('#KODIPROP:')) {
            const m = tag.match(/^#KODIPROP:([^=]+)=(.*)$/);
            if (m) {
                const [, key, value] = m;
                kodiProps.set(key, value);
            }
        }
        // EXTATTRFROMURL
        else if (tag.startsWith('#EXTATTRFROMURL:')) {
            extattrfromurl.push(tag);
        }
        // FALLBACK-ID → consolidate into B64
        else if (tag.startsWith('#EXT-X-APE-FALLBACK-ID:')) {
            currentFallbackId = tag.replace('#EXT-X-APE-FALLBACK-ID:', '');
            fallbackIds[currentFallbackId] = {};
        }
        // FALLBACK sub-tags → attach to current FALLBACK-ID
        else if (tag.startsWith('#EXT-X-APE-FALLBACK-') && currentFallbackId) {
            const m = tag.match(/^#EXT-X-APE-FALLBACK-(.+?):(.*)$/);
            if (m) fallbackIds[currentFallbackId][m[1]] = m[2];
        }
        // EVASION tags → group with fallback
        else if (tag.startsWith('#EXT-X-APE-EVASION-')) {
            const m = tag.match(/^#EXT-X-APE-EVASION-(.+?):(.*)$/);
            if (m) {
                if (!fallbackIds['_EVASION']) fallbackIds['_EVASION'] = {};
                fallbackIds['_EVASION'][m[1]] = m[2];
            }
        }
        // CORTEX tags
        else if (tag.startsWith('#EXT-X-CORTEX-') || tag.startsWith('#EXT-X-APE-CORTEX-') || tag.startsWith('#EXT-X-VNOVA-')) {
            cortexTags.push(tag);
        }
        // APE tags — deduplicate known keys
        else if (tag.startsWith('#EXT-X-APE-')) {
            const m = tag.match(/^#EXT-X-APE-([^:]+):(.+)$/);
            if (m) {
                const [, key, value] = m;
                // For duplicated buffer/reconnect/etc — keep only first occurrence
                if (apeTags.has(key)) {
                    // Apply NEVER_DOWN for numeric values
                    const oldVal = apeTags.get(key);
                    const oldN = parseNum(oldVal);
                    const newN = parseNum(value);
                    if (oldN !== null && newN !== null && newN > oldN) {
                        apeTags.set(key, value); // upgrade
                    }
                    // else keep old (first/higher value)
                } else {
                    apeTags.set(key, value);
                }
            }
        }
        // Other (comments, unknown)
        else {
            otherTags.push(tag);
        }
    }

    // ── Fix KODIPROP profile-aware values ──
    kodiProps.set('inputstream.adaptive.max_resolution', profileCfg.res);
    kodiProps.set('inputstream.adaptive.resolution_secure_max', profileCfg.res);
    kodiProps.set('inputstream.adaptive.max_bandwidth', String(profileCfg.maxBw));
    kodiProps.set('inputstream.adaptive.initial_bandwidth', String(Math.min(profileCfg.maxBw, 10000000)));
    kodiProps.set('inputstream.adaptive.initial_bitrate_max', String(profileCfg.maxBw));
    kodiProps.set('inputstream.adaptive.max_fps', String(profileCfg.fps));

    // ── Fix VLC profile-aware values ──
    vlcOpts.set('preferred-resolution', String(profileCfg.height));
    vlcOpts.set('adaptive-maxwidth', profileCfg.res.split('x')[0]);
    vlcOpts.set('adaptive-maxheight', String(profileCfg.height));

    // ── CAPA 2: EXTHTTP (single JSON line — kept as-is) ──
    for (const h of exthttp) output.push(h);

    // ── CAPA 3: OVERFLOW HEADERS (B64 blob — kept as-is) ──
    for (const o of overflow) output.push(o);

    // ── CAPA 4: EXTVLCOPT (deduplicated, single instance per key) ──
    for (const [key, value] of vlcOpts) {
        if (value === '') {
            output.push(`#EXTVLCOPT:${key}`);
        } else {
            output.push(`#EXTVLCOPT:${key}=${value}`);
        }
    }

    // ── CAPA 5: KODIPROP (deduplicated, profile-aware) ──
    for (const [key, value] of kodiProps) {
        output.push(`#KODIPROP:${key}=${value}`);
    }

    // ── CAPA 6: APE tags (deduplicated) ──
    for (const [key, value] of apeTags) {
        output.push(`#EXT-X-APE-${key}:${value}`);
    }

    // ── CAPA 7: EXTATTRFROMURL (kept as-is, no dedup needed) ──
    for (const a of extattrfromurl) output.push(a);

    // ── CAPA 8: CORTEX tags (deduplicated by full line) ──
    const seenCortex = new Set();
    for (const c of cortexTags) {
        if (!seenCortex.has(c)) {
            seenCortex.add(c);
            output.push(c);
        }
    }

    // ── CAPA 9: FALLBACK consolidated B64 ──
    if (Object.keys(fallbackIds).length > 0) {
        output.push(`#EXT-X-APE-FALLBACK-CHAIN:${Object.keys(fallbackIds).filter(k => k !== '_EVASION').join('>')}`);
        output.push(`#EXT-X-APE-FALLBACK-STRATEGY:POLYMORPHIC_ESCALATION`);
        output.push(`#EXT-X-APE-FALLBACK-PERSIST:INFINITE`);
        output.push(`#EXT-X-APE-FALLBACK-GENOME-B64:${b64Encode(JSON.stringify(fallbackIds))}`);
    }

    // ── CAPA 10: URL (ALWAYS LAST) ──
    if (url) output.push(url);

    return output;
}

// ═══════════════════════════════════════════════════════════════
// MAIN — Streaming processor
// ═══════════════════════════════════════════════════════════════
async function main() {
    const inputFile = process.argv[2];
    const outputFile = process.argv[3];

    if (!inputFile || !outputFile) {
        console.error('Uso: node restructure_m3u8.js input.m3u8 output.m3u8');
        process.exit(1);
    }

    if (!fs.existsSync(inputFile)) {
        console.error(`❌ No encontrado: ${inputFile}`);
        process.exit(1);
    }

    const stats = fs.statSync(inputFile);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  🔧 M3U8 UNIVERSAL RESTRUCTURER v6.1');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📄 Input:  ${inputFile} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
    console.log(`📄 Output: ${outputFile}`);
    console.log('');

    const rl = readline.createInterface({
        input: fs.createReadStream(inputFile, { encoding: 'utf8' }),
        crlfDelay: Infinity
    });

    const out = fs.createWriteStream(outputFile, { encoding: 'utf8' });

    let headerLines = []; // Lines before first #EXTINF
    let currentChannel = null;
    let channelCount = 0;
    let inHeader = true;
    let dedupStats = { vlc: 0, kodi: 0, ape: 0, fallback: 0, pipes: 0 };

    const startTime = Date.now();

    for await (const rawLine of rl) {
        const line = rawLine.trimEnd();

        // Header section (before first EXTINF)
        if (inHeader && !line.startsWith('#EXTINF:')) {
            headerLines.push(line);
            continue;
        }

        // First EXTINF found — emit header and start channels
        if (inHeader && line.startsWith('#EXTINF:')) {
            inHeader = false;
            // Emit header lines
            for (const h of headerLines) out.write(h + '\n');
            out.write('\n');
        }

        // New channel starts
        if (line.startsWith('#EXTINF:')) {
            // Process previous channel if exists
            if (currentChannel) {
                const processed = processChannel(currentChannel);
                // Count dedup stats
                const origTags = currentChannel.tags.length;
                const newTags = processed.length - 2; // minus EXTINF and URL
                if (origTags > newTags) {
                    const saved = origTags - newTags;
                    dedupStats.vlc += saved; // approximate
                }
                if (currentChannel.extinf.includes('\u2503')) dedupStats.pipes++;

                for (const l of processed) out.write(l + '\n');
                out.write('\n');
                channelCount++;

                if (channelCount % 500 === 0) {
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    process.stdout.write(`\r  ⏳ Procesados: ${channelCount} canales (${elapsed}s)...`);
                }
            }

            // Extract profile from EXTINF
            const profileMatch = line.match(/ape-profile="([^"]+)"/);
            const profile = profileMatch ? profileMatch[1] : 'P3';

            currentChannel = {
                extinf: line,
                tags: [],
                url: null,
                profile
            };
        }
        // URL line (not a tag, not EXTINF)
        else if (currentChannel && !line.startsWith('#') && (line.startsWith('http') || line.startsWith('rtmp') || line.startsWith('rtsp'))) {
            currentChannel.url = line;
        }
        // Tag line
        else if (currentChannel && line.startsWith('#')) {
            currentChannel.tags.push(line);
        }
        // Empty line or other
        else if (currentChannel && line === '') {
            // skip empty lines between tags
        }
    }

    // Process last channel
    if (currentChannel) {
        const processed = processChannel(currentChannel);
        if (currentChannel.extinf.includes('\u2503')) dedupStats.pipes++;
        for (const l of processed) out.write(l + '\n');
        out.write('\n');
        channelCount++;
    }

    out.end();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const outStats = fs.statSync(outputFile);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ REESTRUCTURACIÓN COMPLETADA');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  📺 Canales procesados: ${channelCount}`);
    console.log(`  ⏱️  Tiempo: ${elapsed}s`);
    console.log(`  📏 Input:  ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  📏 Output: ${(outStats.size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  📉 Reducción: ${((1 - outStats.size / stats.size) * 100).toFixed(1)}%`);
    console.log(`  🔧 Unicode pipes corregidos: ${dedupStats.pipes}`);
    console.log('');
    console.log('  Fixes aplicados por canal:');
    console.log('    ✅ EXTVLCOPT deduplicado (1 key = 1 value, Rules Engine)');
    console.log('    ✅ KODIPROP profile-aware (resolución/bandwidth según perfil)');
    console.log('    ✅ FALLBACK-IDs consolidados en B64 (no más index=3)');
    console.log('    ✅ APE tags deduplicados (BUFFER/RECONNECT/CLOCK)');
    console.log('    ✅ Unicode pipes sanitizados (┃ → |)');
    console.log('    ✅ Orden de capas estricto (EXTINF→EXTHTTP→VLC→KODI→APE→URL)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n📋 Siguiente: node scripts/validate_m3u8_compat.js ${outputFile}`);
}

main().catch(err => {
    console.error('❌ Error fatal:', err.message);
    process.exit(1);
});
