// AUDITORIA STREAMING (1 pasada, memoria constante) de lista CRYSTAL+AV-SYNC
// Uso: node audit_crystal_stream.js "C:/ruta/APE_LISTA_xxx.m3u8"
const fs = require('fs');
const readline = require('readline');
const P = process.argv[2] || 'C:/Users/HFRC/Downloads/APE_LISTA_1788145199732.m3u8';

const R = [];
const ck = (n, c, x) => R.push([n, !!c, x]);

const c = {
  extinf: 0, vf: 0, atadenoise: 0, nlmeans: 0, hqdn: 0, gradfun: 0,
  memc: 0, memcEnd: 0, scdFdiff: 0, scd5: 0, scd0: 0,
  lanczos: 0, p0: 0, p1: 0, p2: 0, p3: 0, p4: 0, p5: 0,
  cs1: 0, cs0: 0, ats1: 0, atsFalse: 0, ad0: 0,
  ssot: 0, pol: 0, polCrystal: 0, engine: 0, streamInf: 0,
  toxic: [], rangeLiteral: 0, mediaUri: 0, iframeUri: 0,
  badUrlBlocks: 0, firstLineOk: false, omega: 0, dnrCalib: 0,
  polVals: new Set(), profileTags: new Map(), muestra: '', muestraP5: ''
};
let urlCount = 0, urlState = 0; // 0=esperando bloque, 1=ya vi la URL
let first = true;

const profOf = (l) => {
  if (l.includes('transfer=st2084')) return l.includes('w=3840') ? 'P1' : 'P0';
  if (l.includes('nlmeans=s=2.8')) return 'P2';
  if (l.includes('nlmeans')) return 'P3';
  if (l.includes('hqdn3d')) return l.includes('yadif') ? 'P4' : 'P5';
  return '?';
};

const banned = new Set(['if-none-match', 'if-modified-since', 'range', 'te', 'priority', 'upgrade-insecure-requests']);

const rl = readline.createInterface({ input: fs.createReadStream(P, 'utf8'), crlfDelay: Infinity });
rl.on('line', (rawLine) => {
  let l = rawLine;
  if (first) { first = false; l = l.replace(/^\uFEFF/, ''); c.firstLineOk = l.trim().startsWith('#EXTM3U'); } // M3U Plus: #EXTM3U x-tvg-url=... (atributos válidos tras el tag)
  const t = l.trim();

  if (t.startsWith('#EXTINF')) {
    if (c.extinf > 0 && urlCount !== 1) c.badUrlBlocks++;
    c.extinf++; urlCount = 0;
    return;
  }
  if (t.startsWith('#EXTVLCOPT:video-filter=')) {
    c.vf++;
    if (t.includes('atadenoise')) c.atadenoise++;
    if (t.includes('nlmeans')) c.nlmeans++;
    if (t.includes('hqdn3d')) c.hqdn++;
    if (t.includes('gradfun=radius=16:strength=1.2')) c.gradfun++;
    if (t.includes('minterpolate=fps=120')) c.memc++;
    if (/minterpolate=fps=120[^,]*$/.test(t)) c.memcEnd++;
    if (t.endsWith('scd=fdiff:scd_threshold=8')) c.scdFdiff++;
    if (/scd=5(?!\d)/.test(t)) c.scd5++;
    if (/scd=0(?!\d)/.test(t)) c.scd0++;
    if (t.includes('w=3840:h=2160:filter=lanczos')) c.lanczos++;
    c[profOf(t).toLowerCase().replace('?', 'xx')] = (c[profOf(t).toLowerCase().replace('?', 'xx')] || 0) + 1;
    if (!c.muestra && t.includes('nlmeans=s=2.5')) c.muestra = t;
    if (!c.muestraP5 && t.includes('hqdn3d')) c.muestraP5 = t;
    return;
  }
  if (t === '#EXTVLCOPT:clock-synchro=1') { c.cs1++; return; }
  if (t === '#EXTVLCOPT:clock-synchro=0') { c.cs0++; return; }
  if (t === '#EXTVLCOPT:audio-time-stretch=1') { c.ats1++; return; }
  if (t === '#EXTVLCOPT:audio-time-stretch=false') { c.atsFalse++; return; }
  if (t === '#EXTVLCOPT:audio-desync=0') { c.ad0++; return; }
  if (t.startsWith('#EXT-X-APE-DNR-ENGINE:LAB-SSOT')) { c.ssot++; return; }
  if (t.startsWith('#EXT-X-APE-DNR-POLICY:')) {
    c.pol++;
    if (t.includes('CRYSTAL4K')) c.polCrystal++;
    if (c.polVals.size < 8) c.polVals.add(t.slice(23, 160));
    return;
  }
  if (t.includes('LAB-CALIBRATED-DNR+MEMC-120')) { c.engine++; return; }
  if (t.startsWith('#EXT-X-STREAM-INF')) { c.streamInf++; return; }
  if (t.startsWith('#EXT-X-APE-PROFILE:')) {
    const v = t.slice(19);
    c.profileTags.set(v, (c.profileTags.get(v) || 0) + 1);
    return;
  }
  if (t.startsWith('#EXT-X-MEDIA') && t.includes('URI=')) { c.mediaUri++; return; }
  if (t.startsWith('#EXT-X-I-FRAME-STREAM-INF') && t.includes('URI=')) { c.iframeUri++; return; }
  if (t.includes('OMEGA_BUILD')) c.omega++;
  if (t.includes('#EXT-X-APE-DNR-CALIBRATION')) c.dnrCalib++;
  if (t.startsWith('#EXTHTTP:')) {
    try { for (const k of Object.keys(JSON.parse(t.slice(9)))) if (banned.has(k.toLowerCase()) && c.toxic.length < 5) c.toxic.push(k); }
    catch (e) { if (c.toxic.length < 5) c.toxic.push('EXTHTTP_JSON_INVALID'); }
    return;
  }
  if (/range:\s*bytes=0-/i.test(t)) c.rangeLiteral++;
  if (t && !t.startsWith('#')) urlCount++; // URL del canal
});
rl.on('close', () => {
  if (urlCount !== 1) c.badUrlBlocks++;

  ck('empieza con #EXTM3U', c.firstLineOk);
  ck('canales (#EXTINF) > 0', c.extinf > 0, c.extinf + ' canales');
  ck('video-filter por canal == EXTINF', c.vf === c.extinf, c.vf + '/' + c.extinf);
  ck('DNR presente 100% (nlmeans/hqdn3d)', c.nlmeans + c.hqdn === c.vf, 'nlmeans=' + c.nlmeans + ' hqdn3d=' + c.hqdn + ' total=' + c.vf);
  ck('CRYSTAL: atadenoise en 100% de cadenas', c.atadenoise === c.vf, c.atadenoise + '/' + c.vf);
  ck('CRYSTAL: gradfun 16:1.2 en 100%', c.gradfun === c.vf, c.gradfun + '/' + c.vf);
  ck('CRYSTAL: scd=fdiff:scd_threshold=8 en 100% (tail)', c.scdFdiff === c.vf, c.scdFdiff + '/' + c.vf);
  ck('CRYSTAL: 0 restos de scd inválido (5/0)', c.scd5 === 0 && c.scd0 === 0, 'scd5=' + c.scd5 + ' scd0=' + c.scd0);
  ck('MEMC 120fps en 100% y al FINAL', c.memc === c.vf && c.memcEnd === c.vf, 'memc=' + c.memc + ' fin=' + c.memcEnd);
  ck('tag ENGINE LAB-CALIBRATED por canal', c.engine > 0, c.engine);
  ck('DNR-ENGINE:LAB-SSOT por canal', c.ssot === c.extinf, c.ssot + '/' + c.extinf);
  ck('DNR-POLICY por canal + CRYSTAL4K', c.pol === c.extinf && c.polCrystal === c.pol, c.polCrystal + '/' + c.pol + ' de ' + c.extinf);
  ck('directiva DNR-CALIBRATION presente', c.dnrCalib > 0, c.dnrCalib);
  ck('AV-SYNC: clock-synchro=1 por canal, 0 restos de =0', c.cs1 === c.extinf && c.cs0 === 0, 'cs1=' + c.cs1 + ' cs0=' + c.cs0 + ' / ' + c.extinf);
  ck('AV-SYNC: audio-time-stretch=1 por canal, 0 restos de false', c.ats1 === c.extinf && c.atsFalse === 0, 'ats1=' + c.ats1 + ' false=' + c.atsFalse);
  ck('AV-SYNC: audio-desync=0 por canal', c.ad0 === c.extinf, c.ad0 + '/' + c.extinf);
  ck('0 headers tóxicos (EXTHTTP JSON)', c.toxic.length === 0, c.toxic.join(','));
  ck('0 Range: bytes=0- literal', c.rangeLiteral === 0, c.rangeLiteral);
  ck('sin EXT-X-MEDIA URI=', c.mediaUri === 0, c.mediaUri);
  ck('sin EXT-X-I-FRAME-STREAM-INF URI=', c.iframeUri === 0, c.iframeUri);
  ck('exactamente 1 URL por canal (Anti-509)', c.badUrlBlocks === 0, c.badUrlBlocks + ' bloques malos');
  ck('≤1 STREAM-INF por canal', c.streamInf <= c.extinf, c.streamInf + '/' + c.extinf);

  console.log('\nDISTRIBUCION DE PERFILES (por firma de cadena):');
  console.log('  P0(nativo PQ)=' + c.p0 + '  P1(PQ4K)=' + c.p1 + '  P2=' + c.p2 + '  P3=' + c.p3 + '  P4=' + c.p4 + '  P5=' + c.p5);
  console.log('  tags #EXT-X-APE-PROFILE:', JSON.stringify([...c.profileTags.entries()]));
  console.log('  lanczos4K=' + c.lanczos + '  OMEGA_BUILD=' + c.omega);
  console.log('\nMUESTRA P3 (220ch):', c.muestra.slice(0, 220));
  console.log('MUESTRA P4/P5 (220ch):', c.muestraP5.slice(0, 220));
  console.log('POLICY vals:', [...c.polVals].join(' || ').slice(0, 600));

  let pass = 0;
  for (const [n, ok, x] of R) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x !== undefined && x !== true ? '  [' + x + ']' : '')); if (ok) pass++; }
  console.log('\n==== ' + pass + '/' + R.length + ' ====');
  console.log('bytes=' + fs.statSync(P).size);
  process.exit(pass === R.length ? 0 : 1);
});
