const fs = require('fs');

global.window = {
    UAPhantomEngine: { get: () => 'MockUA' },
    PhantomHydra: { getForChannel: () => 'MockPhantomUA' },
    HUD_TYPED_ARRAYS: { init: () => {}, log: () => {} },
    app: { 
        state: { _authV5: { u: 'u1', p: 'p1' }, activeServers: [] },
        generateM3U8_TypedArrays: null
    }
};

global.buildCredentialsMap = function() { return new Map(); };
global.buildChannelUrl = function(channel) { return channel.url; };
global.UAPhantomEngine = global.window.UAPhantomEngine;

const code = fs.readFileSync('IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js', 'utf8');
eval(code); 

const mockChannel = {
    id: 1,
    name: 'HBO MAX 4K',
    category_name: 'Peliculas',
    url: 'http://example.com/mock.m3u8',
    stream_id: '12345',
    logo: 'mock.png'
};

try {
    // LLamar al botón oficial del generador de UI
    const rawOutput = global.window.app.generateM3U8_TypedArrays([mockChannel], new Map(), 'P0-GOD-TIER');
    const lines = rawOutput.split('\n');
    console.log('[E2E AUDIT V6] Archivo generado extosamente.');
    
    const hasJA3 = lines.filter(l => l.includes('EXT-X-APE-TLS-JA3'));
    const hasCortex = lines.filter(l => l.includes('EXT-X-APE-CORTEX'));
    const hasVPN = lines.filter(l => l.includes('EXT-X-APE-VPN'));
    
    console.log('[E2E AUDIT V6] JA3 TLS Directives Present:', hasJA3.length);
    console.log('[E2E AUDIT V6] Cortex Mutators Count:', hasCortex.length);
    console.log('[E2E AUDIT V6] VPN Directives Count:', hasVPN.length);
    
    // Contamos directivas EXT para este único canal generado, excluyendo M3U header
    // Las líneas del canal empiezan después del header #EXTM3U (que son menos de 10 líneas usualmente)
    // Para simplificar, buscamos cuántas empiezan con #EXT
    const metadataCount = lines.filter(l => l.startsWith('#EXT') && !l.startsWith('#EXTM3U') && !l.startsWith('#EXT-X-VERSION')).length;
    console.log('[E2E AUDIT V6] Metadata Directives Count:', metadataCount);
    
    if (metadataCount === 900) {
        console.log('[E2E AUDIT V6] SUCCESS: Invariante Matemático OMEGA V6 confirmado 100% (900 líneas exactas de metadatos OMEGA).');
    } else {
        console.error('[E2E AUDIT V6] FAILURE: Delta of lines detected. Count =', metadataCount);
    }
} catch(e) {
    console.error('Crash E2E:', e.message);
}
