// Categorización streaming de cadenas video-filter + ENGINE tags (482MB, 1 pasada)
const fs = require('fs');
const readline = require('readline');
const P = process.argv[2] || 'C:/Users/HFRC/Downloads/APE_LISTA_1788135732934.m3u8';
const rl = readline.createInterface({ input: fs.createReadStream(P, 'utf8'), crlfDelay: Infinity });
const sig = {}, eng = {};
rl.on('line', (l) => {
    if (l.startsWith('#EXTVLCOPT:video-filter=')) {
        const s = l.slice(24);
        const transfer = (/zscale=transfer=([a-z0-9]+)/.exec(s) || [,'?'])[1];
        const head = (/^(nlmeans|hqdn3d|zscale)/.exec(s) || [,'?'])[1];
        const dn = s.includes('hqdn3d') ? 'hqdn3d' : s.includes('nlmeans') ? 'nlmeans' : 'NINGUNO';
        const k = transfer + ' | inicio=' + head + ' | denoise=' + dn;
        sig[k] = (sig[k] || 0) + 1;
    } else if (l.startsWith('#EXT-X-APE-4KFALSE-ENGINE:')) {
        const k = l.slice(28);
        eng[k] = (eng[k] || 0) + 1;
    }
});
rl.on('close', () => {
    console.log('CADENAS video-filter por firma:');
    for (const [k, v] of Object.entries(sig).sort((a, b) => b[1] - a[1])) console.log('  ' + String(v).padStart(6) + '  ' + k);
    console.log('ENGINE tags:', JSON.stringify(eng));
});
