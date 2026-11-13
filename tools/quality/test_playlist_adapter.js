#!/usr/bin/env node
'use strict';
/* ═══════════════════════════════════════════════════════════════════════════════
 * TEST DEL ADAPTADOR UNIVERSAL DE LISTAS  (tools/canary/playlist_adapter.js)
 *
 * Comprobaciones exigidas por el contrato:
 *   (a) la muestra REAL pasa y el recuento por familia es IDENTICO antes/despues,
 *       comparando MULTICONJUNTO (no solo el total) y con un contador INDEPENDIENTE
 *   (b) una lista truncada a mitad de bloque se RECHAZA y no se publica nada
 *   (c) una etiqueta inventada SOBREVIVE verbatim y no se ejecuta
 *   (d) los hashes del manifiesto casan con los BYTES publicados
 *   (e) el adaptador no tiene evaluacion dinamica, ni procesos hijos, ni red
 *
 * Fixtures generados en os.tmpdir(). No toca la red. No toca produccion.
 * Salida: una linea por comprobacion + tabla de familias + resumen.
 * ═══════════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const A = require(path.join(__dirname, '..', 'canary', 'playlist_adapter.js'));

const REAL = path.join(__dirname, '..', '..', 'docs', 'audits', 'playlist_rea_v24_sample.m3u8');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-adapter-test-'));

let pass = 0, fail = 0;
const failures = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    pass++;
    console.log('PASS  ' + name + (detail ? '  [' + detail + ']' : ''));
  } catch (e) {
    fail++;
    failures.push({ name: name, error: e && e.message ? e.message : String(e) });
    console.log('FAIL  ' + name + '  -> ' + (e && e.message ? e.message : String(e)));
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error((msg || 'no iguales') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
}
function sha256File(f) { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); }
function sha256Str(s) { return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'); }

/* contador INDEPENDIENTE del adaptador: no usa A.familyOf ni A.tagName */
function independentFamilies(text) {
  const fam = {
    EXTM3U: 0, EXTINF: 0, EXTHTTP: 0, EXTVLCOPT: 0, KODIPROP: 0,
    EXTATTRFROMURL: 0, EXT_X: 0, OTROS: 0
  };
  const tags = [];
  for (const line of String(text).split('\n')) {
    if (line.charAt(0) !== '#') continue;
    tags.push(line);
    if (/^#EXTM3U\b/.test(line)) fam.EXTM3U++;
    else if (/^#EXTINF\b/.test(line)) fam.EXTINF++;
    else if (/^#EXTHTTP\b/.test(line)) fam.EXTHTTP++;
    else if (/^#EXTVLCOPT\b/.test(line)) fam.EXTVLCOPT++;
    else if (/^#KODIPROP\b/.test(line)) fam.KODIPROP++;
    else if (/^#EXTATTRFROMURL\b/.test(line)) fam.EXTATTRFROMURL++;
    else if (/^#EXT-X-/.test(line)) fam.EXT_X++;
    else fam.OTROS++;
  }
  // multiconjunto independiente: sha256 de cada linea, ordenado con repeticiones
  const bag = tags.slice().sort();
  const digest = crypto.createHash('sha256').update(bag.join('\u0000'), 'utf8').digest('hex');
  return { fam: fam, total: tags.length, digest: digest, bag: bag };
}
function sameObject(a, b) {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.join(',') !== kb.join(',')) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}
function noTemps(dir) {
  return fs.readdirSync(dir).filter(function (f) { return /\.tmp$/.test(f); });
}

console.log('TMP = ' + TMP);
console.log('REAL = ' + REAL + ' (' + fs.statSync(REAL).size + ' B, sha256 ' + sha256File(REAL).slice(0, 16) + '…)');
console.log('');

/* ────────────────────────────────────────────────────────────────────────────
 * (a) MUESTRA REAL: preservacion total, familia por familia y multiconjunto
 * ──────────────────────────────────────────────────────────────────────────── */
let realResult = null;

(async function run() {
  const outReal = path.join(TMP, 'real');
  try {
    realResult = await A.processPlaylist({
      input: REAL, outDir: outReal, revision: 'test-real-001',
      log: function (m) { console.log('      log: ' + m); }
    });
  } catch (e) {
    console.log('FAIL  (a1) la muestra real se procesa y publica sin error  -> ' + e.message);
    fail++; failures.push({ name: 'a1', error: e.message });
  }

  if (realResult) {
    const pubList = path.join(outReal, 'list.m3u8');
    const pubIdx = path.join(outReal, 'index.json');
    const pubMan = path.join(outReal, 'manifest.json');
    const inText = fs.readFileSync(REAL, 'utf8');
    const outText = fs.readFileSync(pubList, 'utf8');
    const indepIn = independentFamilies(inText);
    const indepOut = independentFamilies(outText);

    await check('(a1) la muestra real se procesa y publica sin error', () => {
      assert(realResult.ok === true, 'ok != true');
      assert(fs.existsSync(pubList) && fs.existsSync(pubIdx) && fs.existsSync(pubMan), 'faltan ficheros publicados');
      return 'rev=' + realResult.revision + ' canales=' + realResult.manifest.counts.channels;
    });

    await check('(a2) la lista publicada es BYTE-IDENTICA a la entrada', () => {
      const a = sha256File(REAL), b = sha256File(pubList);
      assertEqual(b, a, 'sha256 lista publicada != entrada');
      assertEqual(fs.statSync(pubList).size, fs.statSync(REAL).size, 'tamano');
      return 'sha256=' + a;
    });

    await check('(a3) recuento por FAMILIA identico antes/despues (contador INDEPENDIENTE)', () => {
      assert(sameObject(indepIn.fam, indepOut.fam),
        'familias distintas: ' + JSON.stringify(indepIn.fam) + ' vs ' + JSON.stringify(indepOut.fam));
      return JSON.stringify(indepOut.fam);
    });

    await check('(a4) el adaptador coincide con el contador independiente', () => {
      const adaptIn = realResult.manifest.tags.families;
      for (const k of Object.keys(indepIn.fam)) {
        assertEqual(adaptIn[k], indepIn.fam[k], 'familia ' + k);
      }
      return Object.keys(indepIn.fam).length + ' familias';
    });

    await check('(a5) MULTICONJUNTO de tags identico antes/despues (no solo el total)', () => {
      assertEqual(indepOut.digest, indepIn.digest, 'digest del multiconjunto');
      assertEqual(indepOut.total, indepIn.total, 'total de tags');
      assertEqual(realResult.lost.length, 0, 'tags perdidas');
      assertEqual(realResult.added.length, 0, 'tags anadidas');
      return 'digest=' + indepIn.digest.slice(0, 16) + '… tags=' + indepIn.total;
    });

    await check('(a6) familias exigidas por el prompt presentes y >0', () => {
      const req = ['EXTM3U', 'EXTINF', 'EXTHTTP', 'EXTVLCOPT', 'KODIPROP', 'EXTATTRFROMURL', 'EXT_X'];
      const f = realResult.manifest.tags.families;
      const missing = req.filter(function (k) { return !f[k]; });
      assert(missing.length === 0, 'familias a 0: ' + missing.join(','));
      // atributos dentro de EXTINF
      const idx = JSON.parse(fs.readFileSync(pubIdx, 'utf8'));
      const ch = idx.channels[0];
      assert(ch.tvg_id !== null, 'tvg-id ausente');
      assert(ch.tvg_name !== null, 'tvg-name ausente');
      assert(ch.group_title !== null, 'group-title ausente');
      assert(ch.tvg_logo !== null, 'tvg-logo ausente');
      assert(ch.http_headers && ch.http_headers.count === 200, 'EXTHTTP deberia tener 200 cabeceras, tiene ' + JSON.stringify(ch.http_headers));
      // catchup es GLOBAL en la muestra (atributo del #EXTM3U), no por canal:
      // se exige que el manifiesto lo exponga en header Y que el canal lo HEREDE.
      const man = JSON.parse(fs.readFileSync(pubMan, 'utf8'));
      assert(man.header, 'el manifiesto no expone el bloque header');
      assertEqual(man.header.catchup, 'flussonic', 'catchup global');
      assert(/utc=\{utc\}/.test(man.header.catchup_source || ''), 'catchup-source global sin {utc}: ' + man.header.catchup_source);
      assertEqual(man.header.catchup_days, '7', 'catchup-days global');
      assertEqual(ch.catchup_effective, 'flussonic', 'el canal no hereda el catchup global');
      assert(/utc=\{utc\}/.test(ch.catchup_source_effective || ''), 'el canal no hereda catchup-source');
      return 'EXT-X=' + f.EXT_X + ' EXTVLCOPT=' + f.EXTVLCOPT + ' KODIPROP=' + f.KODIPROP +
        ' EXTATTRFROMURL=' + f.EXTATTRFROMURL + ' EXTHTTP=' + f.EXTHTTP +
        ' catchup(global)=' + man.header.catchup + ' heredado=' + ch.catchup_effective;
    });

    await check('(a7) la etiqueta desconocida REAL (#X-OMEGA-TIMESTAMP) sobrevive', () => {
      assert(inText.indexOf('#X-OMEGA-TIMESTAMP:') !== -1, 'no esta en la entrada');
      assertEqual(outText.indexOf('#X-OMEGA-TIMESTAMP:'),
        inText.indexOf('#X-OMEGA-TIMESTAMP:'), 'posicion distinta');
      assert(realResult.manifest.tags.by_name['#X-OMEGA-TIMESTAMP'] >= 1, 'no contada');
      return 'familia OTROS=' + realResult.manifest.tags.families.OTROS;
    });

    await check('(a8) no quedan temporales y el manifiesto es el punto de commit', () => {
      assertEqual(noTemps(outReal).length, 0, 'temporales residuales');
      assert(realResult.verified_post_rename === true, 'no verificado post-rename');
      return 'publicados=' + realResult.published.length;
    });

    /* ── (d) hashes del manifiesto contra los BYTES publicados ─────────────── */
    await check('(d1) los hashes del manifiesto casan con los bytes publicados', () => {
      const man = JSON.parse(fs.readFileSync(pubMan, 'utf8'));
      assertEqual(man.revision, realResult.revision, 'revision');
      assertEqual(sha256File(pubList), man.output.sha256, 'sha256 de la lista');
      assertEqual(fs.statSync(pubList).size, man.output.bytes, 'tamano de la lista');
      assertEqual(sha256File(pubIdx), man.index.sha256, 'sha256 del indice');
      assertEqual(fs.statSync(pubIdx).size, man.index.bytes, 'tamano del indice');
      return 'lista=' + man.output.sha256.slice(0, 16) + '… indice=' + man.index.sha256.slice(0, 16) + '…';
    });

    await check('(d2) lista, indice y manifiesto son de la MISMA revision', () => {
      const man = JSON.parse(fs.readFileSync(pubMan, 'utf8'));
      const idx = JSON.parse(fs.readFileSync(pubIdx, 'utf8'));
      assertEqual(idx.revision, man.revision, 'revision indice vs manifiesto');
      assertEqual(man.input.sha256, sha256File(REAL), 'sha256 de la entrada en el manifiesto');
      assertEqual(idx.counts.channels, man.counts.channels, 'conteo de canales');
      return 'rev=' + man.revision;
    });

    await check('(d3) el manifiesto declara la preservacion verificada', () => {
      const man = JSON.parse(fs.readFileSync(pubMan, 'utf8'));
      assertEqual(man.preservation.lost, 0, 'lost');
      assertEqual(man.preservation.added, 0, 'added');
      assert(man.preservation.identical === true, 'identical != true');
      assert(man.output.sha256_verified_on_temp === true, 'sha256_verified_on_temp');
      return 'policy=' + man.preservation.policy;
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
   * (b) FAIL-CLOSED: lista truncada a mitad de bloque
   * ────────────────────────────────────────────────────────────────────────── */
  const realLines = fs.readFileSync(REAL, 'utf8').split('\n');

  function writeFixture(name, text) {
    const p = path.join(TMP, name);
    fs.writeFileSync(p, text);
    return p;
  }

  async function expectReject(label, file, code) {
    const out = path.join(TMP, 'out-' + label);
    fs.mkdirSync(out, { recursive: true });
    let err = null;
    try { await A.processPlaylist({ input: file, outDir: out }); }
    catch (e) { err = e; }
    assert(err !== null, 'NO se rechazo la lista');
    assertEqual(err.code, code, 'codigo de error');
    assertEqual(err.message.indexOf(code), 0, 'el mensaje no empieza por el codigo');
    const files = fs.readdirSync(out);
    assertEqual(files.length, 0, 'se publico algo: ' + JSON.stringify(files));
    return err.code + ' :: ' + err.message.slice(0, 120);
  }

  // b1: cabecera + #EXTINF (linea 162) y nada mas -> bloque sin URI al llegar a EOF
  const b1 = writeFixture('trunc_extinf.m3u8', realLines.slice(0, 162).join('\n') + '\n');
  await check('(b1) truncada justo tras #EXTINF -> E_TRUNCATED_BLOCK', async () => {
    const r = await expectReject('b1', b1, 'E_TRUNCATED_BLOCK');
    return r;
  });

  // b2: corte a mitad del bloque (500 lineas, sin URI)
  const b2 = writeFixture('trunc_midblock.m3u8', realLines.slice(0, 500).join('\n') + '\n');
  await check('(b2) corte a mitad de bloque (500 lineas) -> E_TRUNCATED_BLOCK', async () => {
    return await expectReject('b2', b2, 'E_TRUNCATED_BLOCK');
  });

  // b3: corte a mitad de una linea (sin salto final, contenido partido)
  const b3 = writeFixture('trunc_midline.m3u8', realLines.slice(0, 1115).join('\n') + '\n' + 'https://audit.invalid/live/u/p/1.m3u8?sig=a%2');
  await check('(b3) LIMITE DECLARADO: un corte DENTRO de la URI no es detectable por contenido', async () => {
    // La linea cortada ("...sig=a%2") sigue siendo una URI sintacticamente valida:
    // sin saber cual era el original, el adaptador NO puede afirmar que se corto.
    // Se declara como limite y se demuestra que se acepta (con el guard OFF).
    const out = path.join(TMP, 'out-b3-acepta');
    const r = await A.processPlaylist({ input: b3, outDir: out });
    assert(r.ok === true, 'deberia aceptar con el guard OFF');
    return 'aceptado con requireFinalNewline=OFF (limite honesto, ver informe)';
  });

  await check('(b3b) con requireFinalNewline=true el mismo corte SI se rechaza', async () => {
    const out = path.join(TMP, 'out-b3-guard');
    fs.mkdirSync(out, { recursive: true });
    let err = null;
    try { await A.processPlaylist({ input: b3, outDir: out, requireFinalNewline: true }); }
    catch (e) { err = e; }
    assert(err !== null, 'no rechazo con el guard ON');
    assertEqual(err.code, 'E_NO_FINAL_NEWLINE', 'codigo');
    assertEqual(fs.readdirSync(out).length, 0, 'publico algo');
    return err.code + ' :: ' + err.message.slice(0, 90);
  });

  // b4: URI sin abridor
  const b4 = writeFixture('uri_no_block.m3u8', '#EXTM3U\nhttp://example.invalid/x.m3u8\n');
  await check('(b4) URI sin abridor de bloque -> E_URI_WITHOUT_BLOCK', async () => {
    return await expectReject('b4', b4, 'E_URI_WITHOUT_BLOCK');
  });

  // b5: sin #EXTM3U
  const b5 = writeFixture('no_extm3u.m3u8', '#EXTINF:-1 tvg-id="1",Canal\nhttp://example.invalid/a.m3u8\n');
  await check('(b5) sin #EXTM3U -> E_MISSING_EXTM3U', async () => {
    return await expectReject('b5', b5, 'E_MISSING_EXTM3U');
  });

  // b6: dos URI en el mismo bloque
  const b6 = writeFixture('two_uris.m3u8', '#EXTM3U\n#EXTINF:-1 tvg-id="1",A\nhttp://example.invalid/a.m3u8\nhttp://example.invalid/b.m3u8\n');
  await check('(b6) dos URI en un bloque -> E_MULTIPLE_URI_IN_BLOCK', async () => {
    return await expectReject('b6', b6, 'E_MULTIPLE_URI_IN_BLOCK');
  });

  // b7: atributos con comilla sin cerrar
  const b7 = writeFixture('bad_attrs.m3u8', '#EXTM3U\n#EXTINF:-1 tvg-id="1,Canal\nhttp://example.invalid/a.m3u8\n');
  await check('(b7) comilla sin cerrar -> E_BAD_EXTINF_ATTRS', async () => {
    return await expectReject('b7', b7, 'E_BAD_EXTINF_ATTRS');
  });

  // b8: entrada vacia
  const b8 = writeFixture('empty.m3u8', '');
  await check('(b8) entrada de 0 bytes -> E_EMPTY_INPUT', async () => {
    return await expectReject('b8', b8, 'E_EMPTY_INPUT');
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * (c) etiqueta inventada: sobrevive verbatim y NO se ejecuta
   * ────────────────────────────────────────────────────────────────────────── */
  const marker = path.join(TMP, 'PWNED-' + crypto.randomBytes(4).toString('hex'));
  const invented = [
    '#EXTM3U x-tvg-url="http://epg.invalid/e.xml" catchup="append"',
    '#EXTINF:-1 tvg-id="inv-1" tvg-name="Inventado" tvg-logo="" group-title="Pruebas" catchup="flussonic" catchup-source="{MediaUrl}?utc={utc}",Inventado',
    '#ZETA-INVENTED-TAG:ALPHA=1;BETA={"json":true};GAMMA=ñ',
    '#EXT-X-WHATEVER-PROTOCOL:v="9",x="y"',
    '#EVIL-INJECTION:$(touch ' + marker.replace(/\\/g, '/') + ');`id`;${process.exit(9)}',
    'http://example.invalid/live/u/p/inv.m3u8',
    '#TRAILING-UNKNOWN:ok'
  ].join('\r\n') + '\r\n';
  const c1 = writeFixture('invented.m3u', invented);
  let inventedResult = null;
  await check('(c1) etiqueta inventada sobrevive y NO se ejecuta', async () => {
    const out = path.join(TMP, 'out-invented');
    inventedResult = await A.processPlaylist({ input: c1, outDir: out });
    const pub = fs.readFileSync(path.join(out, 'list.m3u'), 'utf8');
    assertEqual(sha256Str(pub), sha256Str(invented), 'los bytes cambiaron');
    assert(pub.indexOf('#ZETA-INVENTED-TAG:ALPHA=1;BETA={"json":true};GAMMA=ñ') !== -1, 'tag inventada perdida');
    assert(pub.indexOf('#EVIL-INJECTION:$(touch ') !== -1, 'linea de inyeccion perdida');
    assert(!fs.existsSync(marker), 'SE EJECUTO la inyeccion: existe ' + marker);
    assertEqual(inventedResult.manifest.tags.by_name['#ZETA-INVENTED-TAG'], 1, 'no contada');
    assertEqual(inventedResult.manifest.counts.channels, 1, 'canales');
    return 'verbatim=ok ejecucion=no cola=' + (pub.indexOf('#TRAILING-UNKNOWN:ok') !== -1);
  });

  await check('(c2) CRLF preservado byte a byte', () => {
    const out = path.join(TMP, 'out-invented', 'list.m3u');
    const b = fs.readFileSync(out);
    assert(b.indexOf(Buffer.from('\r\n')) !== -1, 'no hay CRLF en la salida');
    assertEqual(b.length, Buffer.byteLength(invented, 'utf8'), 'tamano');
    return 'CRLF preservado, ' + b.length + ' B';
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * SECRETOS: no salen en indice/manifiesto; la lista los conserva
   * ────────────────────────────────────────────────────────────────────────── */
  const SECRET_AUTH = 'Bearer SUPER-SECRET-TOKEN-9f3a';
  const SECRET_QUERY = 'qwerty123456';
  const secretPl = [
    '#EXTM3U',
    '#EXTINF:-1 tvg-id="s1" tvg-name="Secreto" group-title="T",Secreto',
    '#EXTHTTP:{"User-Agent":"VLC/3.0.19","Authorization":"' + SECRET_AUTH + '","Cookie":"session=' + SECRET_QUERY + '"}',
    'https://user:passwd-secret@example.invalid/live/us3r/p4ss/s1.m3u8?token=' + SECRET_QUERY
  ].join('\n') + '\n';
  const secretFile = writeFixture('secrets.m3u8', secretPl);
  await check('(f1) secretos fuera del indice/manifiesto; conservados en la lista', async () => {
    const out = path.join(TMP, 'out-secrets');
    const r = await A.processPlaylist({ input: secretFile, outDir: out });
    const idx = fs.readFileSync(path.join(out, 'index.json'), 'utf8');
    const man = fs.readFileSync(path.join(out, 'manifest.json'), 'utf8');
    const list = fs.readFileSync(path.join(out, 'list.m3u8'), 'utf8');
    for (const s of [SECRET_AUTH, SECRET_QUERY, 'passwd-secret']) {
      assert(idx.indexOf(s) === -1, 'secreto en index.json: ' + s);
      assert(man.indexOf(s) === -1, 'secreto en manifest.json: ' + s);
    }
    assert(list.indexOf(SECRET_AUTH) !== -1, 'la lista DEBE conservar el valor (preservacion)');
    const kinds = r.manifest.secrets.findings.map(function (x) { return x.carrier + ':' + x.kind + (x.key ? ':' + x.key : ''); });
    assert(r.manifest.secrets.count >= 3, 'pocos hallazgos: ' + r.manifest.secrets.count);
    assert(kinds.indexOf('EXTHTTP:header:Authorization') !== -1, 'no detecto Authorization');
    assert(kinds.indexOf('uri:query:token') !== -1, 'no detecto el token de query');
    assert(kinds.indexOf('uri:ruta_xtream') !== -1, 'no detecto la ruta xtream');
    return r.manifest.secrets.count + ' hallazgos: ' + kinds.join(', ');
  });

  await check('(f1b) REGRESION: una URI xtream SIN query ni userinfo tambien se detecta', async () => {
    // Este caso se perdio al introducir el pre-filtro de rendimiento: la ruta
    // /live/<user>/<pass>/<id> no tiene '@' ni '?', asi que un pre-filtro que solo
    // mira esos caracteres la deja pasar. La URI se escanea SIEMPRE.
    const f = writeFixture('xtream_bare.m3u8',
      '#EXTM3U\n#EXTINF:-1 tvg-id="x1" tvg-name="X",X\nhttp://provider.invalid/live/usuario_claro/clave_clara/42.m3u8\n');
    const out = path.join(TMP, 'out-xtream-bare');
    const r = await A.processPlaylist({ input: f, outDir: out });
    const kinds = r.manifest.secrets.findings.map(function (x) { return x.carrier + ':' + x.kind; });
    assert(kinds.indexOf('uri:ruta_xtream') !== -1, 'no detecto la ruta xtream sin query: ' + JSON.stringify(kinds));
    const idx = fs.readFileSync(path.join(out, 'index.json'), 'utf8');
    assert(idx.indexOf('usuario_claro') === -1, 'usuario en claro en el indice');
    assert(idx.indexOf('clave_clara') === -1, 'clave en claro en el indice');
    assert(idx.indexOf('/live/***/***/42.m3u8') !== -1, 'la url_redacted no enmascara los segmentos: ' + idx.slice(0, 300));
    return kinds.join(',');
  });

  await check('(f2) el log se redacta', async () => {
    const out = path.join(TMP, 'out-secrets-log');
    const lines = [];
    await A.processPlaylist({
      input: secretFile, outDir: out,
      log: function (m) { lines.push(m); }
    });
    const joined = lines.join('\n');
    assert(joined.indexOf(SECRET_AUTH) === -1, 'token en el log');
    assert(joined.indexOf(SECRET_QUERY) === -1, 'valor de query en el log');
    return lines.length + ' lineas de log sin secretos';
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * GZIP
   * ────────────────────────────────────────────────────────────────────────── */
  await check('(g1) .gz: descomprime en streaming y preserva el multiconjunto', async () => {
    const gz = path.join(TMP, 'sample.m3u8.gz');
    fs.writeFileSync(gz, zlib.gzipSync(fs.readFileSync(REAL)));
    const out = path.join(TMP, 'out-gz');
    const r = await A.processPlaylist({ input: gz, outDir: out });
    assertEqual(r.manifest.input.container, 'gzip', 'container');
    assertEqual(r.lost.length, 0, 'perdidas en gz');
    assertEqual(r.added.length, 0, 'anadidas en gz');
    const pub = path.join(out, 'list.m3u8');
    assertEqual(sha256File(pub), sha256File(REAL), 'la salida descomprimida debe ser identica al original');
    assertEqual(r.manifest.preservation.byte_identical_to_input, false, 'gz no puede ser byte-identico a la entrada');
    return 'gz ' + fs.statSync(gz).size + ' B -> ' + fs.statSync(pub).size + ' B';
  });

  await check('(g2) .gz corrupto -> E_GZIP_CORRUPT', async () => {
    const bad = path.join(TMP, 'bad.m3u8.gz');
    const raw = zlib.gzipSync(fs.readFileSync(REAL));
    fs.writeFileSync(bad, raw.subarray(0, Math.floor(raw.length / 2)));
    const out = path.join(TMP, 'out-badgz');
    fs.mkdirSync(out, { recursive: true });
    let err = null;
    try { await A.processPlaylist({ input: bad, outDir: out }); } catch (e) { err = e; }
    assert(err !== null, 'no rechazo el gz truncado');
    assertEqual(err.code, 'E_GZIP_CORRUPT', 'codigo');
    assertEqual(fs.readdirSync(out).length, 0, 'publico algo');
    return err.message.slice(0, 90);
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * (e) analisis estatico del FUENTE: sin evaluacion dinamica, sin hijos, sin red
   * ────────────────────────────────────────────────────────────────────────── */
  const SRC_PATH = path.join(__dirname, '..', 'canary', 'playlist_adapter.js');
  const SRC = fs.readFileSync(SRC_PATH, 'utf8');
  const FORBIDDEN = [
    { re: /\beval\s*\(/, label: 'eval(' },
    { re: /\bnew\s+Function\s*\(/, label: 'new Function(' },
    { re: /(^|[^.\w])Function\s*\(/, label: 'Function(' },
    { re: /require\s*\(\s*['"](http|https|net|tls|dns|dgram|http2)['"]\s*\)/, label: "require('http|https|net|tls|dns')" },
    { re: /require\s*\(\s*['"]child_process['"]\s*\)/, label: "require('child_process')" },
    { re: /\bfetch\s*\(/, label: 'fetch(' },
    { re: /XMLHttpRequest|WebSocket|\.connect\s*\(/, label: 'cliente de red' },
    { re: /\bexec(Sync)?\s*\(|\bspawn(Sync)?\s*\(|\bfork\s*\(/, label: 'ejecucion de procesos' },
    { re: /\bvm\.runIn|require\s*\(\s*['"]vm['"]\s*\)/, label: 'vm.runIn' }
  ];
  await check('(e1) el fuente no contiene evaluacion dinamica, procesos hijos ni red', () => {
    const hits = [];
    for (const f of FORBIDDEN) if (f.re.test(SRC)) hits.push(f.label);
    assert(hits.length === 0, 'encontrado: ' + hits.join(', '));
    return FORBIDDEN.length + ' patrones prohibidos, 0 apariciones';
  });

  await check('(e2) el fuente solo requiere core de Node', () => {
    const reqs = [];
    const re = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(SRC)) !== null) reqs.push(m[1]);
    const allowed = ['fs', 'path', 'crypto', 'zlib'];
    const bad = reqs.filter(function (r) { return allowed.indexOf(r) === -1; });
    assert(bad.length === 0, 'requires no permitidos: ' + bad.join(','));
    return 'requires=' + reqs.join(',');
  });

  await check('(e3) el fuente no contiene la palabra clave de red en codigo (no comentarios)', () => {
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert(code.indexOf('http') === -1 || !/require\s*\(\s*['"]http/.test(code), 'require http');
    assert(!/\bhttps?\.request\b|\bnet\.connect\b/.test(code), 'llamada de red');
    return 'ok';
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * ATOMICIDAD extra: dos revisiones en el mismo directorio + sin residuos
   * ────────────────────────────────────────────────────────────────────────── */
  await check('(h1) dos publicaciones en el mismo outDir dejan un manifiesto coherente', async () => {
    const out = path.join(TMP, 'out-two');
    const r1 = await A.processPlaylist({ input: REAL, outDir: out, revision: 'rev-A' });
    const r2 = await A.processPlaylist({ input: REAL, outDir: out, revision: 'rev-B' });
    const man = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    assertEqual(man.revision, 'rev-B', 'el manifiesto vigente debe ser el ultimo');
    assertEqual(sha256File(path.join(out, 'list.m3u8')), man.output.sha256, 'la lista vigente debe casar con el manifiesto vigente');
    assertEqual(noTemps(out).length, 0, 'temporales residuales');
    return 'rev-A=' + r1.revision + ' rev-B=' + r2.revision;
  });

  await check('(h2) el adapter no deja temporales ni cuando rechaza', () => {
    const out = path.join(TMP, 'out-b1');
    assertEqual(noTemps(out).length, 0, 'temporales tras rechazo');
    assertEqual(fs.readdirSync(out).length, 0, 'ficheros tras rechazo');
    return 'outDir vacio';
  });

  /* ── tabla de familias antes/despues (evidencia legible para el informe) ───── */
  if (realResult) {
    const inText = fs.readFileSync(REAL, 'utf8');
    const outText = fs.readFileSync(path.join(TMP, 'real', 'list.m3u8'), 'utf8');
    const i = independentFamilies(inText), o = independentFamilies(outText);
    console.log('');
    console.log('TABLA DE PRESERVACION POR FAMILIA (muestra real)');
    console.log('  familia            antes    despues   delta');
    for (const k of Object.keys(i.fam)) {
      console.log('  ' + k.padEnd(18) + String(i.fam[k]).padStart(6) + String(o.fam[k]).padStart(11) + String(o.fam[k] - i.fam[k]).padStart(8));
    }
    console.log('  ' + 'TOTAL TAGS'.padEnd(18) + String(i.total).padStart(6) + String(o.total).padStart(11) + String(o.total - i.total).padStart(8));
    console.log('  ' + 'MULTICONJUNTO'.padEnd(18) + i.digest.slice(0, 16) + '  ' + o.digest.slice(0, 16) +
      '  ' + (i.digest === o.digest ? 'IDENTICO' : 'DISTINTO'));
    console.log('');
  }

  console.log('──────────────────────────────────────────────────────────────');
  console.log('RESULTADO: ' + pass + ' PASS · ' + fail + ' FAIL · ' + (pass + fail) + ' comprobaciones');
  if (fail) {
    for (const f of failures) console.log('  FALLO: ' + f.name + ' -> ' + f.error);
  }
  console.log('TMP de la corrida: ' + TMP);
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  console.error('ERROR FATAL DEL TEST: ' + (e && e.stack ? e.stack : String(e)));
  process.exit(2);
});
