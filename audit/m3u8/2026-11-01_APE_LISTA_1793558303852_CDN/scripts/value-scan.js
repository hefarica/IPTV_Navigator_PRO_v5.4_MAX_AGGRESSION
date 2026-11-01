/** Conteo de valores de tags HDR/4K/calidad (una pasada). */
'use strict';
const fs = require('fs');
const readline = require('readline');
const F = process.argv[2];
const prefixes = {
    '4KFALSE-CONTENT-TYPE': '#EXT-X-APE-4KFALSE-CONTENT-TYPE:',
    '4KFALSE-ENGINE': '#EXT-X-APE-4KFALSE-ENGINE:',
    '4KFALSE-MODE': '#EXT-X-APE-4KFALSE-MODE:',
    '4KFALSE-TARGET-RES': '#EXT-X-APE-4KFALSE-TARGET-RES:',
    'QUALITY-SOURCE': '#EXT-X-APE-QUALITY-SOURCE:',
    'HDR': '#EXT-X-APE-HDR:',
    'HDR-VERIFIED': '#EXT-X-APE-HDR-VERIFIED:',
    'HDR-DV': '#EXT-X-APE-HDR-DV:',
    'HDR-METADATA': '#EXT-X-APE-HDR-METADATA:',
    'HDR10PLUS': '#EXT-X-APE-HDR10PLUS:',
    'HDR10PLUS-V2': '#EXT-X-APE-HDR10-PLUS:',
    'DV-PROFILE': '#EXT-X-APE-DV-PROFILE:',
    'DATERANGE-HDR': '#EXT-X-DATERANGE:'
};
const counts = {};
for (const k of Object.keys(prefixes)) counts[k] = {};
const rl = readline.createInterface({ input: fs.createReadStream(F), crlfDelay: Infinity });
rl.on('line', l => {
    for (const [k, p] of Object.entries(prefixes)) {
        if (l.startsWith(p)) {
            let v = l.slice(p.length).trim();
            if (k === 'DATERANGE-HDR') {
                const m = l.match(/X-HDR-TYPE="([^"]*)"/); v = m ? m[1] : '(sin tipo)';
            } else if (k === 'HDR-DV') {
                const m = l.match(/MODE=([^,\s]+).*NITS=(\d+)/); v = m ? m[1] + '/NITS=' + m[2] : v;
            } else if (k === 'HDR-METADATA') {
                const p2 = l.match(/PEAK=(\d+)/), a2 = l.match(/AVG=(\d+)/); v = 'PEAK=' + (p2 ? p2[1] : '?') + ',AVG=' + (a2 ? a2[1] : '?');
            }
            counts[k][v] = (counts[k][v] || 0) + 1;
        }
    }
});
rl.on('close', () => { console.log(JSON.stringify(counts, null, 2)); fs.writeFileSync(require('path').join(require('os').tmpdir(), 'ape-audit', 'value-counts.json'), JSON.stringify(counts, null, 2)); });
