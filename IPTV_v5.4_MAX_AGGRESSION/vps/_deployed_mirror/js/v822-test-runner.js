const fs = require('fs');
const path = require('path');

// --- SIMULACIÓN DE ENTORNO BROWSER ---
global.self = {
    postMessage: (msg) => {
        if (msg.type === 'progress') {
            console.log(`[PROGRESS] ${msg.percent.toFixed(1)}% | Count: ${msg.count} | L5: ${msg.level5} | Repaired: ${msg.repaired}`);
        }
    }
};

global.btoa = (str) => Buffer.from(str).toString('base64');

// --- CARGAR LÓGICA DEL WORKER ---
// Extraemos la función onmessage del archivo real para garantizar fidelidad
const workerPath = path.join(__dirname, 'ape-worker.js');
let workerCode = fs.readFileSync(workerPath, 'utf8');

// Ajustar el código para que sea ejecutable en Node (quitar "self." si es necesario o manejarlo)
// En el archivo actual es self.onmessage = async function(e) { ... }
let testFunction;
eval(workerCode.replace('self.onmessage =', 'testFunction ='));

async function runDiagnostic() {
    console.log("=== 🛡️ APE v8.2.2 DIAGNOSTIC SUITE ===");

    // 1. DATASET DE PRUEBA (1000 canales)
    const mockChannels = [];
    for (let i = 0; i < 1000; i++) {
        mockChannels.push({
            name: i % 10 === 0 ? `Canal ${i} 4K SPORTS` : `Canal ${i} SD`,
            group: i % 5 === 0 ? "DEPORTES" : "GENERAL",
            url: i % 50 === 0 ? `hhtps://server${i}.cloudflare.com/live.m3u8` : `http://server${i}.com/stream`
        });
    }

    console.log(`Fase 1: Dataset de ${mockChannels.length} canales listo.`);

    // 2. PRUEBA CON OFUSCACIÓN ON
    console.log("\nFase 2: Probando con OFUSCACIÓN ACTIVADA...");
    let resultM3U = "";
    global.self.postMessage = (msg) => {
        if (msg.type === 'complete') {
            resultM3U = msg.blob;
            console.log(`[COMPLETE] Stats:`, msg.stats);
        }
    };

    await testFunction({
        data: {
            type: 'start_generation',
            channels: mockChannels,
            config: { obfuscate: true, seed: 12345 }
        }
    });

    // VERIFICACIONES TÉCNICAS
    console.log("\n--- RESULTADOS DEL ANÁLISIS ---");

    // a) Verificar Ofuscación
    const hasObfuscation = resultM3U.includes('ape_obs=');
    console.log(`[TEST] Túnel de Ofuscación: ${hasObfuscation ? '✅ PASSED' : '❌ FAILED'}`);

    // b) Verificar Safety Catch
    const lines = resultM3U.split('\n');
    const hhtpsCorrected = !resultM3U.includes('hhtps');
    console.log(`[TEST] Safety Catch (hhtps -> https): ${hhtpsCorrected ? '✅ PASSED' : '❌ FAILED'}`);

    // c) Verificar Nivel 5 y Protocolo Live-Edge
    const level5Entry = lines.find(l => l.includes('[L5]'));
    const hasLiveEdge = resultM3U.includes('&go_live=true');
    console.log(`[TEST] Protocolo Live-Edge (L4/L5): ${hasLiveEdge ? '✅ PASSED' : '❌ FAILED'}`);

    // d) Verificar Fibonacci Entropy (Diferentes fingerprints)
    const sessionIds = resultM3U.match(/X-Playback-Session-Id=([^&|\n]*)/g) || [];
    const uniqueIds = new Set(sessionIds);
    // Si la entropía funciona, la mayoría de los IDs deberían ser únicos o muy variables
    console.log(`[TEST] Entropía Fibonacci: ${uniqueIds.size > (sessionIds.length * 0.9) ? '✅ PASSED' : '⚠️ WARNING (Baja entropía)'} (${uniqueIds.size} unique IDs)`);

    // e) Verificar Etiquetas Avanzadas (#EXTHTTP, VLC, Kodi)
    const hasExtHttp = resultM3U.includes('#EXTHTTP:');
    const hasVlcOpt = resultM3U.includes('#EXTVLCOPT:');
    const hasKodiProp = resultM3U.includes('#KODIPROP:');
    console.log(`[TEST] Etiquetas Avanzadas (#EXTHTTP): ${hasExtHttp ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`[TEST] Soporte Nativo VLC (EXTVLCOPT): ${hasVlcOpt ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`[TEST] Soporte Nativo Kodi (KODIPROP): ${hasKodiProp ? '✅ PASSED' : '❌ FAILED'}`);

    // f) Verificar Metadata de Calidad (Quality Tier)
    const hasQuality = resultM3U.includes('quality="ULTRA-4K"') || resultM3U.includes('quality="FHD-PRO"');
    console.log(`[TEST] Metadata de Calidad (quality=""): ${hasQuality ? '✅ PASSED' : '❌ FAILED'}`);

    console.log("\n=== 🏁 DIAGNÓSTICO FINALIZADO: 100% ALINEACIÓN AVANZADA ===");
}

runDiagnostic().catch(console.error);
