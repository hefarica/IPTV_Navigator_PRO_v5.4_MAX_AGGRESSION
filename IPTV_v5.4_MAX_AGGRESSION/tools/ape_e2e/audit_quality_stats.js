// ESTADISTICAS DE CALIDAD DE IMAGEN de la lista (streaming, memoria constante)
// Extrae: CODECS, VIDEO-RANGE, RESOLUTION, FRAME-RATE, BANDWIDTH, HDCP, densidad por canal.
const fs = require('fs');
const readline = require('readline');
const P = process.argv[2] || 'C:/Users/HFRC/Downloads/APE_LISTA_1788145199732.m3u8';

const dist = (m, k) => m.set(k, (m.get(k) || 0) + 1);
const codecs = new Map(), res = new Map(), vr = new Map(), fr = new Map(), hdcp = new Map();
const apeTags = new Map(), vlcOpts = new Map();
let extinf = 0, streamInf = 0, kodiprop = 0, exthttp = 0, stableId = 0;
let bwN = 0, bwSum = 0, bwMin = Infinity, bwMax = 0;
let abwN = 0, abwSum = 0;
let blockLines = [], inBlock = 0, blockSaved = false;

const attr = (s, name) => {
  const m = s.match(new RegExp(name + '=("[^"]*"|[^,]*)'));
  return m ? m[1].replace(/^"|"$/g, '') : null;
};

const rl = readline.createInterface({ input: fs.createReadStream(P, 'utf8'), crlfDelay: Infinity });
rl.on('line', (l) => {
  const t = l.trim();
  if (t.startsWith('#EXTINF')) { extinf++; inBlock = 1; if (!blockSaved) blockLines = [t]; return; }
  if (inBlock && !blockSaved && blockLines.length < 200) {
    blockLines.push(t);
    if (t && !t.startsWith('#')) { blockSaved = true; inBlock = 0; }
  }
  if (t.startsWith('#EXT-X-STREAM-INF')) {
    streamInf++;
    const c = attr(t, 'CODECS'); if (c) dist(codecs, c);
    const r = attr(t, 'RESOLUTION'); if (r) dist(res, r);
    const v = attr(t, 'VIDEO-RANGE'); if (v) dist(vr, v);
    const f = attr(t, 'FRAME-RATE'); if (f) dist(fr, f);
    const h = attr(t, 'HDCP-LEVEL'); if (h) dist(hdcp, h);
    const b = attr(t, 'BANDWIDTH'); if (b && /^\d+$/.test(b)) { bwN++; bwSum += +b; bwMin = Math.min(bwMin, +b); bwMax = Math.max(bwMax, +b); }
    const ab = attr(t, 'AVERAGE-BANDWIDTH'); if (ab && /^\d+$/.test(ab)) { abwN++; abwSum += +ab; }
    if (t.includes('STABLE-VARIANT-ID')) stableId++;
    return;
  }
  if (t.startsWith('#EXTVLCOPT:')) { dist(vlcOpts, t.slice(11, t.indexOf('=') > 0 ? t.indexOf('=') : 30)); return; }
  if (t.startsWith('#KODIPROP:')) { kodiprop++; return; }
  if (t.startsWith('#EXTHTTP:')) { exthttp++; return; }
  const m = t.match(/^#EXT-X-APE-([A-Z0-9-]+):/);
  if (m) { dist(apeTags, m[1]); return; }
});
rl.on('close', () => {
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const pct = (k, tot) => (100 * k / tot).toFixed(1) + '%';
  console.log('CANALES: ' + extinf + '  STREAM-INF: ' + streamInf);
  console.log('\n== CODECS (declarados) ==');
  for (const [k, v] of top(codecs, 12)) console.log('  ' + v + '  ' + pct(v, streamInf) + '  ' + k);
  console.log('\n== RESOLUTION ==');
  for (const [k, v] of top(res, 12)) console.log('  ' + v + '  ' + pct(v, streamInf) + '  ' + k);
  console.log('\n== VIDEO-RANGE ==');
  for (const [k, v] of top(vr, 5)) console.log('  ' + k + ': ' + v + ' (' + pct(v, streamInf) + ')');
  console.log('\n== FRAME-RATE ==');
  for (const [k, v] of top(fr, 8)) console.log('  ' + k + ': ' + v);
  console.log('\n== HDCP-LEVEL ==');
  for (const [k, v] of top(hdcp, 4)) console.log('  ' + k + ': ' + v);
  console.log('\n== BANDWIDTH (declarado) ==');
  if (bwN) console.log('  n=' + bwN + '  min=' + (bwMin / 1e6).toFixed(1) + 'Mbps  max=' + (bwMax / 1e6).toFixed(1) + 'Mbps  media=' + (bwSum / bwN / 1e6).toFixed(1) + 'Mbps');
  if (abwN) console.log('  AVERAGE-BANDWIDTH media=' + (abwSum / abwN / 1e6).toFixed(1) + 'Mbps');
  console.log('\n== DENSIDAD POR CANAL ==');
  console.log('  KODIPROP: ' + (kodiprop / extinf).toFixed(1) + '/canal   EXTHTTP: ' + (exthttp / extinf).toFixed(1) + '/canal   STABLE-VARIANT-ID: ' + stableId);
  console.log('  EXTVLCOPT distintos: ' + vlcOpts.size + ' -> ' + top(vlcOpts, 30).map(x => x[0]).join(', '));
  console.log('\n== TAGS EXT-X-APE (top 25 de ' + apeTags.size + ') ==');
  for (const [k, v] of top(apeTags, 25)) console.log('  ' + (v / extinf).toFixed(2) + '/canal  ' + k);
  console.log('\n== BLOQUE MUESTRA (canal 1, ' + blockLines.length + ' lineas) ==');
  console.log(blockLines.join('\n').slice(0, 3500));
});
