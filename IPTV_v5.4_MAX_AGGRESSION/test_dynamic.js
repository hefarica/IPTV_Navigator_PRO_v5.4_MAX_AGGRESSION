const fs = require('fs');

// Mock browser environment
global.window = {};
global.document = {
    createElement: () => ({ href: '', click: () => {} }),
    body: { appendChild: () => {}, removeChild: () => {} }
};
global.URL = { createObjectURL: () => '', revokeObjectURL: () => {} };
global.btoa = (str) => Buffer.from(str).toString('base64');
global.app = { getFilteredChannels: () => [{id: '123', name: 'Test Channel', url: 'http://test.com/stream.m3u8'}] };

const genCode = fs.readFileSync('C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js', 'utf8');
eval(genCode);

const options = {
    bulletproof_loaded: true,
    masterProfile: 'P0',
    _autoDownload: false, // Prevent the generator from trying to trigger download in Node
    bulletproof_profiles: {
        'P0': {
            player_enslavement: {
                level_1_master_playlist: [
                    '#EXT-X-APE-DYNAMIC-HEADER:TRUE',
                    '##EXT-X-DOUBLE-HASH-TEST',
                    '#EXT-X-VARIABLES:<channelsCount> <timestamp>'
                ],
                level_3_per_channel: {
                    EXTVLCOPT: { 'dynamic-opt': '100' },
                    EXTHTTP: { 'User-Agent': 'APE-TEST', 'Referer': 'TEST' },
                    SYS: { 'TEST-SYS': 'TRUE' }
                }
            },
            optimized_knobs: {
                buffer_seconds: 105,
                reconnect_attempts: 350
            }
        }
    }
};

M3U8TypedArraysGenerator.generate([{id: '123', name: 'Test Channel', url: 'http://test.com/stream.m3u8'}], options).then(blob => {
    // Custom mock Blob
    const content = typeof blob === 'string' ? blob : blob.text ? blob.text() : String(blob);
    Promise.resolve(content).then(text => {
        const lines = text.split('\n');
        console.log('--- GLOBAL HEADER CHECK ---');
        console.log(lines.filter(l => l.includes('APE-DYNAMIC') || l.includes('DOUBLE-HASH') || l.includes('VARIABLES')).join('\n'));
        console.log('\n--- L3 PER-CHANNEL CHECK ---');
        console.log(lines.filter(l => Boolean(
            l.match(/dynamic-opt/) || 
            l.match(/network-caching=105000/) || 
            l.match(/http-max-retries=350/) || 
            l.match(/APE-TEST/) || 
            l.match(/SYS-TEST-SYS/) || 
            l.match(/EXTHTTP/) ||
            l.match(/EXTVLCOPT:network-caching/)
        )).join('\n'));
    }).catch(console.error);
}).catch(console.error);
