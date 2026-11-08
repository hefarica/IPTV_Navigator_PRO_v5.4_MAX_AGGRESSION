/**
 * Test del wrapper: el perfil EXPLICITO gana sobre la heuristica.
 *
 * El informe de arquitectura senala que ape-pulse-wrap.js recalculaba el perfil
 * por nombre/grupo y perdia el que la lista ya declaraba. Eso rompe el recorrido
 * "APK solicita -> JIT filtra": la etiqueta deja de corresponder al video.
 *
 * Este test construye listas M3U de prueba, las pasa por el wrapper real y lee
 * el parametro `p=` de la URL envuelta.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WRAP = path.join(__dirname, '..', '..', 'tools', 'pulse', 'ape-pulse-wrap.js');
// El wrapper carga ApeUrlBuilder de /opt/ape-pulse (ruta de produccion). En el repo
// vive en tools/url2; se le pasa por APE_URL_BUILDER para no tocar el codigo.
const BUILDER = path.join(__dirname, '..', 'url2', 'ape-url-builder.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wrap-test-'));

function runWrapper(name, body) {
  const inp = path.join(tmp, name + '.m3u8');
  const out = path.join(tmp, name + '.out.m3u8');
  fs.writeFileSync(inp, body, 'utf8');
  try {
    execFileSync(process.execPath, [WRAP, '--in', inp, '--out', out], {
      stdio: 'pipe',
      env: Object.assign({}, process.env, { APE_URL_BUILDER: BUILDER })
    });
  } catch (e) {
    return { error: (e.stderr || '').toString().slice(0, 300) };
  }
  return { text: fs.readFileSync(out, 'utf8') };
}

// extrae el p= de la primera URL envuelta
function profileOf(text) {
  const m = text.match(/[?&]p=(P[0-5](?:\.5)?)/);
  return m ? m[1] : null;
}

const HDR = '#EXTM3U\n';

const cases = [
  {
    name: 'canal 4K con perfil declarado P3',
    body: HDR +
      '#EXTINF:-1 tvg-id="c1" group-title="Deportes",Canal 4K UHD\n' +
      '#EXT-X-APE-CRYSTAL-UHD:PROFILE=P3;VPP_INTENSITY=55;SCOPE=DISPLAY;PIXELS=0\n' +
      'http://prov.example/live/u/p/1.m3u8\n',
    expect: 'P3',
    why: 'la directiva declara P3 y gana sobre la heuristica (4K -> P1)'
  },
  {
    name: 'canal 4K sin declaracion',
    body: HDR +
      '#EXTINF:-1 tvg-id="c2" group-title="Deportes",Canal 4K UHD\n' +
      'http://prov.example/live/u/p/2.m3u8\n',
    expect: 'P1',
    why: 'sin declaracion se aplica la heuristica (4K -> P1)'
  },
  {
    name: 'perfil en el propio EXTINF',
    body: HDR +
      '#EXTINF:-1 tvg-id="c3" group-title="Cine" ape-profile="P5",Pelicula SD\n' +
      'http://prov.example/live/u/p/3.m3u8\n',
    expect: 'P5',
    why: 'ape-profile del EXTINF gana sobre SD->P5 igual, pero confirma el parseo'
  },
  {
    name: 'canal SD con perfil declarado P0',
    body: HDR +
      '#EXTINF:-1 tvg-id="c4" group-title="Cine",Canal SD\n' +
      '#EXT-X-APE-PROFILE:P0\n' +
      'http://prov.example/live/u/p/4.m3u8\n',
    expect: 'P0',
    why: 'la lista pide P0 explicitamente aunque el nombre diga SD'
  },
  {
    name: 'perfil .5 declarado',
    body: HDR +
      '#EXTINF:-1 tvg-id="c5" group-title="Deportes",Canal FHD\n' +
      '#EXT-X-APE-LAB-PROFILE:P3.5\n' +
      'http://prov.example/live/u/p/5.m3u8\n',
    expect: 'P3.5',
    why: 'las variantes .5 se conservan, no se colapsan'
  },
  {
    name: 'canal premium 1080p sin declaracion',
    body: HDR +
      '#EXTINF:-1 tvg-id="c6" group-title="Deportes",DAZN FHD 1080\n' +
      'http://prov.example/live/u/p/6.m3u8\n',
    expect: 'P2',
    why: 'premium +1 sobre P3 da P2 (heuristica intacta cuando no hay declaracion)'
  }
];

let fail = 0;
console.log('\n  TEST DEL WRAPPER — perfil explicito vs heuristica');
for (const c of cases) {
  const r = runWrapper(c.name.replace(/[^a-z0-9]+/gi, '_'), c.body);
  if (r.error) {
    console.log('    FALLA ' + c.name + ' -> ' + r.error);
    fail++;
    continue;
  }
  const got = profileOf(r.text);
  const ok = got === c.expect;
  if (!ok) fail++;
  console.log((ok ? '    OK    ' : '    FALLA ') + c.name);
  console.log('           esperado=' + c.expect + ' obtenido=' + got + '  (' + c.why + ')');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n  ${fail} FALLAN\n` : '\n  TODAS OK\n');
process.exit(fail ? 1 : 0);
