/**
 * E2E BULLETPROOF TEST SUITE
 * Verifica la correcta inyección de LAB_CALIBRATED_BULLETPROOF (SSOT)
 * sobre la lobotomía del generador L7 (Fase 8).
 */

const fs = require('fs');
const path = require('path');

const LAB_BULLETPROOF_PATH = process.env.APE_LAB_JSON_PATH || 'C:\\Users\\HFRC\\Downloads\\LAB_CALIBRATED_BULLETPROOF_20260418_210955.json';
const GENERATOR_PATH = path.join(__dirname, '..', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`✅ PASS: ${message}`);
    } else {
        failed++;
        console.error(`❌ FAIL: ${message}`);
    }
}

async function run() {
    console.log('\n═══════════════════════════════════════════════');
    console.log('🛡️ E2E BULLETPROOF SSOT GENERATOR TEST (FASE 8)');
    console.log('═══════════════════════════════════════════════\n');

    if (!fs.existsSync(LAB_BULLETPROOF_PATH)) {
        console.error(`❌ El archivo LAB Bulletproof no existe en la ruta: ${LAB_BULLETPROOF_PATH}`);
        process.exit(1);
    }
    
    if (!fs.existsSync(GENERATOR_PATH)) {
        console.error(`❌ El generador L7 no existe en la ruta: ${GENERATOR_PATH}`);
        process.exit(1);
    }

    // 1. Cargar el JSON 
    const labContent = fs.readFileSync(LAB_BULLETPROOF_PATH, 'utf8');
    const labData = JSON.parse(labContent.replace(/^\uFEFF/, ''));
    assert(labData.lab_schema_variant === "omega_v2_bulletproof_perprofile", "JSON es esquema omega_v2_bulletproof_perprofile");
    assert(labData.bulletproof === true, "JSON expone flag bulletproof");
    
    // 2. Modificar el entorno de Node para mockear browser
    global.window = {
        location: { origin: 'http://localhost' },
        HUD_TYPED_ARRAYS: { log: () => {}, init: () => {}, complete: () => {}, isAborted: () => false, updateChannel: () => {} },
        console: { ...console, warn: () => {} }
    };
    global.TextEncoder = require('util').TextEncoder;
    global.TextDecoder = require('util').TextDecoder;
    global.btoa = (str) => Buffer.from(str).toString('base64');
    
    // 3. Evaluar el Generador (quitar el IIFE)
    let generatorCode = fs.readFileSync(GENERATOR_PATH, 'utf8');
    generatorCode = generatorCode.replace(/^\(function\s*\(\)\s*\{/, '');
    generatorCode = generatorCode.replace(/\}\)\(\);$/, '');
    generatorCode = generatorCode.replace(/let /g, 'var ');
    generatorCode = generatorCode.replace(/const /g, 'var ');
    
    try {
        eval(generatorCode);
        assert(true, "Generador cargado y evaluado (AST Sano)");
    } catch (e) {
        assert(false, `Error compilando el generador en Node: ${e.message}`);
        console.error(e);
        process.exit(1);
    }

    const generateFn = window.M3U8TypedArraysGenerator ? window.M3U8TypedArraysGenerator.generate : null;
    assert(typeof generateFn === 'function', "generateM3U8 proxy function discovered");

    // 4. Preparar Mock Dataset de Canales
    const channels = [
        { id: "test_ch1", name: "Test 4K UHD", url: "http://iptv.server/live/u/p/1.ts", group: "Tests", profile: "P0" },
        { id: "test_ch2", name: "Test FHD", url: "http://iptv.server/live/u/p/3.ts", group: "Tests", profile: "P3" }
    ];

    // --- TEST A: LEGACY BACKWARDS COMPATIBILITY ---
    console.log('\n--- TEST A: LEGACY BACKWARDS COMPATIBILITY ---');
    try {
        const streamLegacy = await generateFn(channels, { bulletproof_loaded: false });
        if (streamLegacy instanceof Blob) {
           const textLegacy = await streamLegacy.text();
           assert(textLegacy.includes('#EXTVLCOPT'), "Modo Legacy aún emite literales (#EXTVLCOPT predeterminado)");
           assert(!textLegacy.includes('#EXT-X-SESSION-DATA:DATA-ID="ape.bulletproof.status",VALUE="ACTIVE"'), "Modo Legacy evita inyectar data de Session Bulletproof");
        } else {
           throw new Error("Returned content is not a blob.");
        }
    } catch (e) {
        assert(false, "Modo Legacy Falló: " + e.message);
    }

    // --- TEST B: BULLETPROOF SSOT DICTATORSHIP ---
    console.log('\n--- TEST B: BULLETPROOF SSOT DICTATORSHIP ---');
    try {
        const streamBP = await generateFn(channels, {
            bulletproof_loaded: true,
            forceProfile: 'P0',
            bulletproof_profiles: {
                P0: {
                   optimized_knobs: { buffer_seconds: 105 },
                   player_enslavement: { level_3_per_channel: { EXTVLCOPT: { "network-caching": 105000 } } },
                   actor_injections: { player: { exoplayer: { bufferForPlaybackMs: 2500 }, hlsjs: { liveDurationInfinity: "True" } }, panel: { hdr_type: "HDR10" } }
                }
            },
            bulletproof_nivel1: labData.nivel1Directives
        });
        
        if (streamBP instanceof Blob) {
            const textBP = await streamBP.text();
            // Comprobar que toma data de LAB (ej. knobs como buffer de P0 y reconnects)
            const p0BufferSec = 105;
            const p0BufferMs = p0BufferSec * 1000;
            assert(textBP.includes(`network-caching=${p0BufferMs}`), `SSOT P0 Inyectado Correctamente: network-caching=${p0BufferMs}`);
            
            if (!textBP.includes('inputstream.adaptive.bufferForPlaybackMs')) {
                console.error("TEXT BP CONTENT:", textBP);
            }
            // Comprobar Exoplayer Injections
            assert(textBP.includes('inputstream.adaptive.bufferForPlaybackMs'), "KODIPROP Exoplayer (buffer_for_playback) renderizado");
            
            // Comprobar HLS.JS Injections
            assert(textBP.includes('inputstream.hlsjs.liveDurationInfinity'), "KODIPROP HLS.js Renderizado");

            // Comprobar HDR Daterange (Panel Injection)
            assert(textBP.includes('#EXT-X-DATERANGE'), "HDR Panel Info inyectada en M3U8 (Daterange)");
        } else {
            throw new Error("Returned content is not a blob.");
        }
    } catch (e) {
        assert(false, "Modo Bulletproof Falló: " + e.message);
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log(`📊 RESULTADOS FINALES L7: ${passed} ÉXITOS, ${failed} FALLOS`);
    if (failed > 0) process.exit(1);
}

run().catch(console.error);
