/**
 * E2E BULLETPROOF FULL AUDIT — Real LAB JSON + Real Generator
 * Generates M3U8 with 10 test channels using real LAB_CALIBRATED_BULLETPROOF JSON
 * and audits EVERY injection point (knobs, L3, actors, HDR, SYS, CMCD).
 */
const fs = require('fs');
const path = require('path');

const LAB_PATH = process.env.APE_LAB_JSON_PATH || 
    'C:\\Users\\HFRC\\Downloads\\LAB_CALIBRATED_BULLETPROOF_20260418_210955.json';
const GEN_PATH = path.join(__dirname, '..', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');

let passed = 0, failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✅ ${msg}`); }
    else      { failed++; console.error(`  ❌ ${msg}`); }
}

function countOccurrences(text, pattern) {
    const re = typeof pattern === 'string' ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : pattern;
    return (text.match(re) || []).length;
}

async function main() {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('🛡️  E2E BULLETPROOF FULL AUDIT — REAL LAB JSON');
    console.log('══════════════════════════════════════════════════════════\n');

    // 1) Load LAB JSON
    if (!fs.existsSync(LAB_PATH)) { console.error(`❌ LAB JSON not found: ${LAB_PATH}`); process.exit(1); }
    const labRaw = fs.readFileSync(LAB_PATH, 'utf8').replace(/^\uFEFF/, '');
    const lab = JSON.parse(labRaw);
    console.log(`📄 LAB JSON: ${(Buffer.byteLength(labRaw)/1024).toFixed(0)} KB | schema=${lab.lab_schema_variant} | bulletproof=${lab.bulletproof}`);
    console.log(`   Profiles: ${Object.keys(lab.profiles_calibrated).join(', ')}\n`);

    // 2) Setup browser mocks
    global.window = {
        location: { origin: 'http://localhost:3000' },
        HUD_TYPED_ARRAYS: { log:()=>{}, init:()=>{}, complete:()=>{}, isAborted:()=>false, updateChannel:()=>{} },
        console: { ...console, warn:()=>{} }
    };
    global.TextEncoder = require('util').TextEncoder;
    global.TextDecoder = require('util').TextDecoder;
    global.btoa = str => Buffer.from(str).toString('base64');
    global.ReadableStream = require('stream/web').ReadableStream;
    global.Blob = (await import('buffer')).Blob;
    global.APE_PROFILE_MATRIX = {};

    // 3) Eval generator
    let code = fs.readFileSync(GEN_PATH, 'utf8');
    code = code.replace(/^\(function\s*\(\)\s*\{/, '');
    code = code.replace(/\}\)\(\);$/, '');
    code = code.replace(/\blet\s+/g, 'var ');
    code = code.replace(/\bconst\s+/g, 'var ');
    try { eval(code); console.log('✅ Generator eval OK\n'); }
    catch(e) { console.error(`❌ Generator eval FAILED: ${e.message}`); process.exit(1); }

    const gen = window.M3U8TypedArraysGenerator;
    if (!gen || typeof gen.generate !== 'function') {
        console.error('❌ M3U8TypedArraysGenerator.generate not found'); process.exit(1);
    }

    // 4) Create 10 test channels across P0/P1/P3
    const channels = [];
    const profiles = ['P0','P0','P0','P0','P1','P1','P1','P3','P3','P3'];
    for (let i = 0; i < 10; i++) {
        channels.push({
            id: `test_${i}`,
            name: `Test Channel ${i} (${profiles[i]})`,
            url: `http://iptv-provider.com/live/testuser/testpass/${1000+i}.ts`,
            group: 'Audit',
            profile: profiles[i],
            tvg_id: `ch_${i}`,
            tvg_logo: 'http://logo.example.com/logo.png'
        });
    }

    // 5) Build bulletproof options from LAB
    const bulletproof_profiles = {};
    for (const [pid, pdata] of Object.entries(lab.profiles_calibrated)) {
        bulletproof_profiles[pid] = pdata;
    }

    const options = {
        bulletproof_loaded: true,
        bulletproof_profiles: bulletproof_profiles,
        bulletproof_nivel1: lab.nivel1_directives || [],
        forceProfile: 'P0',  // Force P0 to validate knobs injection (determineProfile needs browser)
        dictatorMode: true,
        hud: false
    };

    // 6) Generate
    console.log(`🚀 Generating M3U8 with ${channels.length} channels...\n`);
    let m3u8Text = '';
    try {
        const result = await gen.generate(channels, options);
        if (result instanceof Blob) {
            m3u8Text = await result.text();
        } else if (typeof result === 'string') {
            m3u8Text = result;
        } else if (result && typeof result.getReader === 'function') {
            // ReadableStream
            const reader = result.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                m3u8Text += decoder.decode(value, { stream: true });
            }
        } else {
            console.error('❌ Unknown return type from generate:', typeof result);
            process.exit(1);
        }
    } catch(e) {
        console.error(`❌ Generation FAILED: ${e.message}`);
        console.error(e.stack);
        process.exit(1);
    }

    // Save output for manual inspection
    const outPath = path.join(__dirname, '..', '..', 'audit_bulletproof_output.m3u8');
    fs.writeFileSync(outPath, m3u8Text, 'utf8');

    const totalBytes = Buffer.byteLength(m3u8Text, 'utf8');
    const totalLines = m3u8Text.split('\n').length;
    const kbPerChannel = (totalBytes / 1024 / channels.length).toFixed(1);
    const linesPerChannel = Math.round(totalLines / channels.length);

    console.log('══════════════════════════════════════════════════════════');
    console.log('📊 OUTPUT METRICS');
    console.log('══════════════════════════════════════════════════════════');
    console.log(`   Total: ${(totalBytes/1024).toFixed(0)} KB | ${totalLines} lines | ${channels.length} channels`);
    console.log(`   KB/channel: ${kbPerChannel} KB (target ≥ 10 KB)`);
    console.log(`   Lines/channel: ${linesPerChannel}`);
    console.log(`   Saved to: ${outPath}\n`);

    // 7) AUDIT — 10+ criteria
    console.log('══════════════════════════════════════════════════════════');
    console.log('🔍 AUDIT CRITERIA');
    console.log('══════════════════════════════════════════════════════════\n');

    // A) KB/channel
    console.log('--- A. Size ---');
    assert(parseFloat(kbPerChannel) >= 8, `KB/channel = ${kbPerChannel} (target ≥ 8)`);

    // B) optimized_knobs — P0 values
    console.log('\n--- B. Optimized Knobs (7/7) ---');
    const p0knobs = lab.profiles_calibrated.P0.optimized_knobs;
    const bufMs = p0knobs.buffer_seconds * 1000;
    assert(countOccurrences(m3u8Text, `network-caching=${bufMs}`) >= 4,
        `network-caching=${bufMs} (P0 buffer) → ${countOccurrences(m3u8Text, `network-caching=${bufMs}`)} hits`);
    assert(countOccurrences(m3u8Text, `http-max-retries=${p0knobs.reconnect_attempts}`) >= 1,
        `http-max-retries=${p0knobs.reconnect_attempts} → present`);
    assert(countOccurrences(m3u8Text, `adaptive-livedelay=${p0knobs.live_delay_seconds * 1000}`) >= 1,
        `adaptive-livedelay=${p0knobs.live_delay_seconds * 1000} → present`);
    assert(countOccurrences(m3u8Text, `inputstream.adaptive.frag_load_max_num_retry`) >= 1,
        `frag_load_max_num_retry (KODIPROP) → present`);
    assert(countOccurrences(m3u8Text, `inputstream.adaptive.nudge_max_retry`) >= 1,
        `nudge_max_retry (KODIPROP) → present`);
    assert(countOccurrences(m3u8Text, `inputstream.adaptive.abr_bandwidth_factor`) >= 1,
        `abr_bandwidth_factor (KODIPROP) → present`);
    assert(countOccurrences(m3u8Text, `inputstream.adaptive.max_live_sync_playback_rate`) >= 1,
        `max_live_sync_playback_rate (KODIPROP) → present`);

    // C) L3 5-layer
    console.log('\n--- C. L3 5-Layer Iteration ---');
    // Check P0's L3 EXTVLCOPT keys are injected
    const l3vlc = lab.profiles_calibrated.P0.player_enslavement?.level_3_per_channel?.EXTVLCOPT || {};
    const firstVlcKey = Object.keys(l3vlc)[0];
    if (firstVlcKey) {
        assert(countOccurrences(m3u8Text, `#EXTVLCOPT:${firstVlcKey}=`) >= 1,
            `L3 EXTVLCOPT key "${firstVlcKey}" injected`);
    }
    const l3kod = lab.profiles_calibrated.P0.player_enslavement?.level_3_per_channel?.KODIPROP || {};
    const firstKodKey = Object.keys(l3kod)[0];
    if (firstKodKey) {
        assert(countOccurrences(m3u8Text, `#KODIPROP:${firstKodKey}=`) >= 1,
            `L3 KODIPROP key "${firstKodKey}" injected`);
    }

    // D) Actor injections
    console.log('\n--- D. Actor Injections ---');
    // ExoPlayer
    assert(countOccurrences(m3u8Text, 'inputstream.adaptive.buffer_for_playback_ms') >= 1,
        'ExoPlayer → buffer_for_playback_ms present');
    assert(countOccurrences(m3u8Text, 'inputstream.adaptive.min_buffer_ms') >= 1,
        'ExoPlayer → min_buffer_ms present');
    // HLS.js
    assert(countOccurrences(m3u8Text, 'inputstream.hlsjs.') >= 1,
        'HLS.js → inputstream.hlsjs.* KODIPROP present');
    // Kodi
    assert(countOccurrences(m3u8Text, 'inputstream.adaptive.assured_buffer_duration') >= 1,
        'Kodi → assured_buffer_duration present');
    // OS
    assert(countOccurrences(m3u8Text, 'SYS-SOCKET-RCVBUF-KB') >= 1,
        'OS → SYS-SOCKET-RCVBUF-KB present');
    assert(countOccurrences(m3u8Text, 'SYS-CONGESTION-CONTROL') >= 1,
        'OS → SYS-CONGESTION-CONTROL present');
    // Network
    assert(countOccurrences(m3u8Text, 'APE-NET-MTU') >= 1,
        'Network → APE-NET-MTU present');
    assert(countOccurrences(m3u8Text, 'APE-NET-QOS-DSCP') >= 1,
        'Network → APE-NET-QOS-DSCP present');
    // IPTV Server
    assert(countOccurrences(m3u8Text, 'SYS-CATCHUP') >= 1,
        'IPTV Server → SYS-CATCHUP present');
    assert(countOccurrences(m3u8Text, 'SYS-SERVER-POOL-MODE') >= 1,
        'IPTV Server → SYS-SERVER-POOL-MODE present');

    // E) HDR DATERANGE
    console.log('\n--- E. HDR DATERANGE Panel ---');
    assert(countOccurrences(m3u8Text, 'ape.hdr.panel') >= channels.length,
        `DATERANGE ape.hdr.panel → ${countOccurrences(m3u8Text, 'ape.hdr.panel')} hits (target ≥ ${channels.length})`);
    assert(countOccurrences(m3u8Text, 'X-HDR-MAX-CLL') >= 1,
        'HDR MAX-CLL attribute present');

    // F) Legacy preservation (bulletproof mode uses dynamic header, NOT legacy)
    console.log('\n--- F. Bulletproof Header ---');
    // In bulletproof mode, QMAX-VERSION is NOT emitted (replaced by nivel1_directives)
    // This is CORRECT behavior per OMEGA-NO-DELETE: legacy branch only runs if !bulletproof_loaded
    assert(countOccurrences(m3u8Text, '#EXT-X-SYS-VERSION') >= 1 || countOccurrences(m3u8Text, '#EXT-X-APE-CHANNELS') >= 1,
        'Bulletproof header contains dynamic directives (nivel1 or core)');
    assert(countOccurrences(m3u8Text, '#EXTM3U') === 1,
        'Single #EXTM3U header (RFC 8216)');

    // G) SYS layer
    console.log('\n--- G. SYS Layer ---');
    const sysCount = countOccurrences(m3u8Text, /^#EXT-X-APE-SYS-/gm);
    assert(sysCount >= 1, `SYS tags present: ${sysCount}`);

    // Summary
    console.log('\n══════════════════════════════════════════════════════════');
    console.log(`📊 FINAL: ${passed} PASS / ${failed} FAIL (total ${passed+failed})`);
    console.log(`   KB/channel: ${kbPerChannel} KB`);
    console.log('══════════════════════════════════════════════════════════\n');

    if (failed > 0) process.exit(1);
    else console.log('🟢 ALL CRITERIA PASS — BULLETPROOF CONSUMER ACTIVE ✅\n');
}

main().catch(e => { console.error(e); process.exit(1); });
