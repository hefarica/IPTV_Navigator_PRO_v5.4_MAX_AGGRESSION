#!/usr/bin/env node
// t12 — aplica la remediación del SSOT JSON con ASSERT estricto de valores "antes".
// Si cualquier valor esperado no coincide, ABORTA sin escribir (fail-closed).
// Escribe en formato compacto (el original está minificado: 0 saltos de línea).
import fs from 'node:fs';

const P = process.argv[2];
const DRY = process.argv.includes('--dry-run');
if (!P) { console.error('uso: node apply_ssot_fix.mjs <lab_master.json> [--dry-run]'); process.exit(2); }

const before = fs.readFileSync(P);
const doc = JSON.parse(before.toString('utf8'));
const changes = [];
const problems = [];

const set = (profile, path, expected, next) => {
  const pr = doc.profiles_calibrated?.[profile];
  if (!pr) { problems.push(`${profile}: perfil ausente`); return; }
  const segs = path.split('.');
  let node = pr;
  for (let i = 0; i < segs.length - 1; i++) {
    node = node?.[segs[i]];
    if (node === undefined || node === null) { problems.push(`${profile}.${path}: ruta rota en '${segs[i]}'`); return; }
  }
  const leaf = segs[segs.length - 1];
  const cur = node[leaf];
  if (JSON.stringify(cur) !== JSON.stringify(expected)) {
    problems.push(`${profile}.${path}: esperado ${JSON.stringify(expected)} · encontrado ${JSON.stringify(cur)}`);
    return;
  }
  node[leaf] = next;
  changes.push({ profile, path, before: cur, after: next });
};

// ── 1. Resoluciones por tier (N2) — celdas X25 / X48 / X109 / X110 / X136 ──────────────
const RES = {
  P0: { res: '7680x4320', w: '7680', h: '4320', ape: '7680x4320,3840x2160,2560x1440,1920x1080' },
  P1: { res: '3840x2160', w: '3840', h: '2160', ape: '3840x2160,2560x1440,1920x1080,1280x720' },
  P2: { res: '3840x2160', w: '2560', h: '1440', ape: null },
  P3: { res: '1920x1080', w: '1920', h: '1080', ape: '1920x1080,1280x720,854x480,640x360' },
  P4: { res: '1280x720', w: '1280', h: '720', ape: '1280x720,854x480,640x360' },
  P5: { res: '854x480', w: '854', h: '480', ape: '854x480,640x360,426x240' },
};
const CUR = {
  P0: { res: '7680x4320', max: '7680x4320', w: '7680', h: '4320', ape: '7680x4320,3840x2160,2560x1440,1920x1080' },
  P1: { res: '7680x4320', max: '7680x4320', w: '7680', h: '4320', ape: '7680x4320,3840x2160,2560x1440,1920x1080' },
  P2: { res: '3840x2160', max: '3840x2160', w: '2560', h: '1440' },
  P3: { res: '3840x2160', max: '3840x2160', w: '3840', h: '2160', ape: '3840x2160,1920x1080,1280x720,854x480' },
  P4: { res: '3840x2160', max: '3840x2160', w: '3840', h: '2160', ape: '3840x2160,1920x1080,1280x720,854x480' },
  P5: { res: '3840x2160', max: '3840x2160', w: '3840', h: '2160', ape: '3840x2160,1920x1080,1280x720,854x480' },
};
for (const prof of ['P1', 'P3', 'P4', 'P5']) {
  set(prof, 'settings.resolution', CUR[prof].res, RES[prof].res);
  set(prof, 'settings.maxResolution', CUR[prof].max, RES[prof].res);
  set(prof, 'vlcopt.video-width', CUR[prof].w, RES[prof].w);
  set(prof, 'vlcopt.video-height', CUR[prof].h, RES[prof].h);
  set(prof, 'headerOverrides.X-APE-RESOLUTION', CUR[prof].ape, RES[prof].ape);
}
// P0/P2 ya son canónicos en resolution/maxResolution/X-APE-RESOLUTION → se verifican sin cambiar
for (const prof of ['P0', 'P2']) {
  const want = RES[prof].res;
  const got = doc.profiles_calibrated[prof].settings.resolution;
  if (got !== want) problems.push(`${prof}.settings.resolution: esperado ${want} · encontrado ${got} (no se toca)`);
  const apeWant = RES[prof].ape;
  if (apeWant !== null) {
    const apeGot = doc.profiles_calibrated[prof].headerOverrides['X-APE-RESOLUTION'];
    if (apeGot !== apeWant) problems.push(`${prof}.X-APE-RESOLUTION: esperado ${apeWant} · encontrado ${apeGot}`);
  }
}

// ── 2. Códecs degradados: P3 → Main10 L123 (E37) ; P4 → Main10 L93 (F37) ─────────────
set('P3', 'settings.codec_full', 'hvc1.1.6.L120.B0', 'hvc1.2.4.L123.B0');
set('P3', 'settings.codec_string', 'hvc1.2.4.L120.B0,mp4a.40.2', 'hvc1.2.4.L123.B0,mp4a.40.2');
set('P3', 'headerOverrides.X-Stream-Codecs', 'hvc1.1.6.L120.B0,mp4a.40.2', 'hvc1.2.4.L123.B0,mp4a.40.2');
set('P3', 'headerOverrides.X-APE-CODEC', 'avc1.640028,hvc1.1.6.L120.90', 'hvc1.2.4.L123.B0,avc1.640028');
set('P3', 'headerOverrides.X-Codec-Support', 'avc1.640028,hvc1.1.6.L120.90', 'hvc1.2.4.L123.B0,avc1.640028');

set('P4', 'settings.codec', 'AVC1', 'HVC1');
set('P4', 'settings.codec_full', 'avc1.64001f', 'hvc1.2.4.L93.B0');
set('P4', 'settings.codec_string', 'avc1.640028,mp4a.40.2', 'hvc1.2.4.L93.B0,mp4a.40.2');
set('P4', 'headerOverrides.X-Stream-Codecs', 'avc1.64001f,mp4a.40.2', 'hvc1.2.4.L93.B0,mp4a.40.2');
set('P4', 'headerOverrides.X-APE-CODEC', 'avc1.4d401f', 'hvc1.2.4.L93.B0,avc1.4d401f');
set('P4', 'headerOverrides.X-Codec-Support', 'avc1.4d401f', 'hvc1.2.4.L93.B0,avc1.4d401f');
set('P4', 'vlcopt.codec-priority', 'avc1,hvc1', 'hvc1,avc1');

// ── 3. FPS de EMISIÓN (D-35): X-Stream-FPS y X-Max-Framerate por techo de nivel ──────
//      settings.fps / targetFps se dejan en el valor de la celda canónica X32/X51 (=120, capacidad)
//      y la divergencia se documenta + se escala a APP (FRAME-RATE lee settings.fps).
const FPS = { P0: ['60', '30'], P1: ['120', '60'], P2: ['60', '30'] }; // [antes, después]
for (const [prof, [bf, af]] of Object.entries(FPS)) {
  set(prof, 'headerOverrides.X-Stream-FPS', bf, af);
  set(prof, 'headerOverrides.X-Max-Framerate', bf, af);
}

// ── 4. chroma_subsampling roto → null (D-36), 6/6 ────────────────────────────────────
for (const prof of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
  set(prof, 'settings.chroma_subsampling', '168055555555556', null);
}

// ── 5. avg > max (B-12): avg := max declarado (sin inventar cifras) ─────────────────
const BITRATE = { P1: ['40000', '75000'], P2: ['25000', '35000'], P3: ['10000', '15000'], P4: ['5000', '6000'], P5: ['2000', '2200'] };
for (const [prof, [mx, av]] of Object.entries(BITRATE)) {
  set(prof, 'settings.avgBitrateKbps', av, mx);
}

// ── 6. Ladder de prisma: primer escalón coherente con el códec restaurado ───────────
const LADDER = {
  P3: ['hvc1.1.6.L120.B0,hev1.1.6.L120.B0,hvc1.2.4.L120.B0,avc1.640028,avc1.4D401F', 'hvc1.2.4.L123.B0,hvc1.1.6.L120.B0,hev1.1.6.L120.B0,avc1.640028,avc1.4D401F'],
  P4: ['hvc1.1.6.L93.B0,hev1.1.6.L93.B0,avc1.640020,avc1.4D401F,avc1.42E01F', 'hvc1.2.4.L93.B0,hvc1.1.6.L93.B0,avc1.640020,avc1.4D401F,avc1.42E01F'],
};
for (const [prof, [b, a]] of Object.entries(LADDER)) {
  const node = doc.prisma_lab_sync_v20.codec_ladder_per_profile[prof];
  if (node.video !== b) { problems.push(`prisma_ladder.${prof}.video: esperado ${b} · encontrado ${node.video}`); continue; }
  node.video = a;
  changes.push({ profile: prof, path: 'prisma_lab_sync_v20.codec_ladder_per_profile.*.video', before: b, after: a });
}

// ── 7. F-19: kodiprop stream_headers en P4/P5 (el patrón existe en P0–P3) ───────────
for (const prof of ['P4', 'P5']) {
  const kp = doc.profiles_calibrated[prof].kodiprop;
  if ('inputstream.adaptive.stream_headers' in kp) { problems.push(`${prof}: stream_headers ya existe`); continue; }
  kp['inputstream.adaptive.stream_headers'] = '[ENCODED_HEADERS]';
  changes.push({ profile: prof, path: 'kodiprop.inputstream.adaptive.stream_headers', before: '(ausente)', after: '[ENCODED_HEADERS]' });
}

// ── 8. F-08: los placeholders prisma deben estar registrados en placeholders_map ────
const pm = doc.placeholders_map || {};
const pmKeys = new Set(Object.keys(pm));
const phText = JSON.stringify(doc);
for (const ph of ['{prisma.bitrate_floor}', '{prisma.target_bandwidth}', '{prisma.boost_multiplier}', '{prisma.zap_grace}', '{prisma.lanes_default}', '{prisma.floor_lock_strict}']) {
  const used = phText.includes(ph);
  const registered = pmKeys.has(ph);
  if (used && !registered) problems.push(`placeholder ${ph} usado pero NO registrado en placeholders_map`);
}
const phReport = ['{prisma.bitrate_floor}', '{prisma.target_bandwidth}'].map((ph) => ({ placeholder: ph, used: phText.includes(ph), registered: pmKeys.has(ph) }));

if (problems.length) {
  console.error('ABORTADO — no se escribió nada. Problemas:'); for (const p of problems) console.error('  - ' + p); process.exit(3);
}

const out = JSON.stringify(doc);
if (DRY) {
  console.log(JSON.stringify({ dry_run: true, changes: changes.length, bytes_before: before.length, bytes_after: Buffer.byteLength(out), phReport, changes }, null, 2));
} else {
  fs.writeFileSync(P, out);
  console.log(JSON.stringify({ written: P, changes: changes.length, bytes_before: before.length, bytes_after: fs.statSync(P).size, phReport, changes }, null, 2));
}
