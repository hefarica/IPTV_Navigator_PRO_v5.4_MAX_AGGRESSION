// AUDITORIA de lista generada — criterios de éxito repo + integración LAB DNR
const fs = require('fs');
const P = process.argv[2] || 'C:/Users/HFRC/Downloads/APE_LISTA_1788135732934.m3u8';
const raw = fs.readFileSync(P, 'utf8');
const t = raw.replace(/^\uFEFO/, '');
const lines = t.split(/\r?\n/);
const R = [];
const ck = (n, c, x) => R.push([n, !!c, x]);

ck('empieza con #EXTM3U', t.trimStart().startsWith('#EXTM3U'));
const extinf = (t.match(/#EXTINF/g) || []).length;
ck('canales (#EXTINF) > 0', extinf > 0, extinf + ' canales');

// ── DNR LAB integration (FIX 1+2) ──
const vfLines = lines.filter(l => l.startsWith('#EXTVLCOPT:video-filter='));
ck('video-filter por canal == EXTINF', vfLines.length === extinf, vfLines.length + '/' + extinf);
const nlmeans = vfLines.filter(l => /nlmeans/.test(l)).length;
const hqdn = vfLines.filter(l => /hqdn3d/.test(l)).length;
const gradfun = vfLines.filter(l => /gradfun/.test(l)).length;
const memc = vfLines.filter(l => /minterpolate=fps=120/.test(l)).length;
const memcEnd = vfLines.filter(l => /minterpolate=fps=120[^,]*$/.test(l.trim())).length;
const scd5 = vfLines.filter(l => /scd=5/.test(l)).length;
const scd0 = vfLines.filter(l => /scd=0/.test(l)).length;
ck('DNR presente en 100% de video-filters (nlmeans/hqdn3d)', nlmeans + hqdn === vfLines.length, 'nlmeans=' + nlmeans + ' hqdn3d=' + hqdn + ' total=' + vfLines.length);
ck('MEMC 120fps en 100% y al FINAL de la cadena', memc === vfLines.length && memcEnd === vfLines.length, 'memc=' + memc + ' fin=' + memcEnd);
ck('scd coherente (5 cine/premium, 0 resto)', scd5 + scd0 === vfLines.length, 'scd5=' + scd5 + ' scd0=' + scd0);
ck('tag ENGINE = LAB-CALIBRATED-DNR+MEMC-120', t.includes('#EXT-X-APE-4KFALSE-ENGINE:LAB-CALIBRATED-DNR+MEMC-120'));
const ssot = (t.match(/#EXT-X-APE-DNR-ENGINE:LAB-SSOT/g) || []).length;
ck('DNR-ENGINE:LAB-SSOT por canal', ssot === extinf, ssot + '/' + extinf);
const pol = (t.match(/#EXT-X-APE-DNR-POLICY:/g) || []).length;
ck('DNR-POLICY por canal (FIX2, extras ON)', pol === extinf, pol + '/' + extinf);
const polVals = [...new Set(lines.filter(l => l.startsWith('#EXT-X-APE-DNR-POLICY:')).map(l => l.slice(22)))];
ck('directiva nivel1 DNR-CALIBRATION', t.includes('#EXT-X-APE-DNR-CALIBRATION'));
ck('nivel1 OMEGA_BUILD presente', t.includes('OMEGA_BUILD'));

// ── Compatibilidad universal ──
const banned = new Set(['if-none-match','if-modified-since','range','te','priority','upgrade-insecure-requests']);
let toxic = [];
for (const l of lines) if (l.startsWith('#EXTHTTP:')) {
    try { for (const k of Object.keys(JSON.parse(l.slice(9)))) if (banned.has(k.toLowerCase())) toxic.push(k); }
    catch (e) { toxic.push('EXTHTTP_JSON_INVALID'); }
}
ck('0 headers tóxicos (EXTHTTP JSON keys)', toxic.length === 0, toxic.slice(0, 5).join(','));
ck('0 Range: bytes=0- literal', !/range:\s*bytes=0-/i.test(t));
ck('sin EXT-X-MEDIA con URI=', !lines.some(l => l.startsWith('#EXT-X-MEDIA') && l.includes('URI=')));
ck('sin EXT-X-I-FRAME-STREAM-INF con URI=', !lines.some(l => l.startsWith('#EXT-X-I-FRAME-STREAM-INF') && l.includes('URI=')));
const blocks = t.split('#EXTINF').slice(1);
const badBlocks = [];
blocks.forEach((b, i) => {
    const urls = b.split(/\r?\n/).slice(1).filter(l => l.trim() && !l.trim().startsWith('#'));
    if (urls.length !== 1) badBlocks.push('#' + (i + 1) + ':' + urls.length + 'url');
});
ck('exactamente 1 URL por canal (Anti-509)', badBlocks.length === 0, badBlocks.slice(0, 3).join(' '));
const si = (t.match(/#EXT-X-STREAM-INF/g) || []).length;
ck('≤1 STREAM-INF por canal', si <= extinf, si + '/' + extinf);

// ── Muestra de cadena real (primer canal con nlmeans y uno con hqdn3d) ──
const muestraN = vfLines.find(l => /nlmeans/.test(l)) || '';
const muestraH = vfLines.find(l => /hqdn3d/.test(l)) || '';
console.log('MUESTRA nlmeans:', muestraN.slice(0, 220));
console.log('MUESTRA hqdn3d :', muestraH.slice(0, 220));
console.log('POLICY values  :', JSON.stringify(polVals, null, 0).slice(0, 400));
console.log('');

let pass = 0;
for (const [n, ok, x] of R) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x !== undefined && x !== true ? '  [' + x + ']' : '')); if (ok) pass++; }
console.log('\n==== ' + pass + '/' + R.length + ' ====');
console.log('bytes=' + Buffer.byteLength(raw) + '  lineas=' + lines.length);
