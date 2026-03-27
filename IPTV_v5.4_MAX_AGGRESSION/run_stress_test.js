const fs = require('fs');

global.window = { 
    GroupTitleBuilder: null,
    HUD_TYPED_ARRAYS: {
        init: () => {},
        log: () => {},
        isAborted: () => false,
        updateChannel: () => {}
    },
    _APE_PRIO_QUALITY: true,
    dispatchEvent: () => {}
};
global.document = { getElementById: () => null };

const scriptContent = fs.readFileSync('./frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js', 'utf8');
eval(scriptContent);

const TARGET_CHANNELS = 1000;

const mockChannels = Array.from({ length: TARGET_CHANNELS }, (_, i) => ({
    id: i,
    stream_id: i + 1000,
    name: `Test Channel ${i} 4K UHD`,
    logo: `http://mock.cdn/logo/${i}.png`,
    category_name: i % 10 === 0 ? 'DEPORTES' : 'CINE',
    url: `http://mock.cdn/live/user/pass/${i}.ts`,
    resolution: i % 5 === 0 ? '3840x2160' : '1920x1080',
    fps: 60,
    bitrate: 15000
}));

const GodModeGenerator = global.window.M3U8TypedArraysGenerator;

// Restore and Mute Logs
const noop = () => {};
console.log = noop;
console.warn = noop;
console.error = noop;
console.info = noop;

let failUrlEof = 0;
let failSyncInject = 0;
let errorLog = '';

for(let i = 0; i < TARGET_CHANNELS; i++) {
    const entry = GodModeGenerator.generateChannelEntry(mockChannels[i], i, null);
    
    // Validación estricta de Protocolo 1:1 EOF
    const lineas = entry.split(String.fromCharCode(10)).filter(l => l.trim().length > 0);
    const ultimaLinea = lineas[lineas.length - 1];
    
    if (!ultimaLinea.startsWith('http')) {
        failUrlEof++;
        errorLog += `[Canal ${i}] URL no es última. Última línea: ${ultimaLinea}\\n`;
    }
    if (!ultimaLinea.includes('ape_quantum_sync=v10') || !ultimaLinea.includes('ape_cmaf_force')) {
        failSyncInject++;
        errorLog += `[Canal ${i}] Faltan flags en EOF: ${ultimaLinea}\\n`;
    }
}

fs.writeFileSync('./stress_results.txt', `
RESULTADOS DEL STRESS TEST DE ORQUESTACIÓN
Canales procesados: ${TARGET_CHANNELS}
Errores Protocolo 1:1 (EOF Roto): ${failUrlEof}
Errores Inyección Sync (God Mode): ${failSyncInject}

DETALLES DE ERRORES:
${errorLog || 'Ninguno. 100% de cumplimiento en inyección matemática.'}
`);

process.exit(0);
