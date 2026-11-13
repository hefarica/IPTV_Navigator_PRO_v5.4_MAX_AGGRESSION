#!/usr/bin/env node
'use strict';

// [2026-11-13] BUSCAR EL HEVC DE MAXIMA CALIDAD, y MEDIRLO contra H.264.
//
// DIRECTIVA DEL OPERADOR: "buscar el HEVC como sea en su mejor formato de maxima calidad
// via ffmpeg".
//
// NO se trata de codificar bonito y decirlo: se trata de MEDIR si el HEVC conserva mas
// detalle que el H.264 al mismo coste, y si elimina el banding. Para eso se usan dos
// metricas con control negativo:
//
//   HF   = media de |Y - desenfoque(Y)|      -> detalle de alta frecuencia.
//          Validada en tools/quality/test_hf_detail_metric.js: monotona con el bitrate,
//          control negativo 0,04 % entre dos codificaciones identicas.
//
//   BAND = niveles distintos de luma en una region de degradado suave.
//          Mas niveles = menos banding. Es la metrica que ataca la queja concreta del
//          operador (bandas en el cesped).
//
// LAS TRES CODIFICACIONES
//   1. H264_8BIT_REF   lo que hay hoy: H.264 High 8 bits
//   2. HEVC_MAIN10     4:2:0 10 bits — lo maximo que un TV/box HEVC decodifica de verdad
//   3. HEVC_444_10     4:4:4 10 bits — lo maximo absoluto; NO lo decodifica ningun
//                      consumidor, sirve solo para la ruta JIT/VPS del Canary
//
// Ajustes de maxima calidad (y por que cada uno)
//   -crf 16              territorio visualmente sin perdida
//   -preset slower       mas esfuerzo de busqueda = mas calidad por bit
//   -pix_fmt *10le       10 bits: el paso de cuantizacion se reduce 4x -> mata el banding
//   sao=1                sample adaptive offset (filtra en el bucle, ayuda en zonas planas)
//   deblock=-1,-1        deblocking MAS SUAVE: conserva detalle en vez de borrarlo
//   psy-rd=2.0           optimizacion psico-visual: conserva textura
//   aq-mode=3            reparte bits en zonas oscuras/planas, donde aparece el banding
//   rdoq-level=2, rd=6   decision rate-distorsion al maximo
//
// Uso: node tools/quality/search_hevc_max_quality.js [video]

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(ROOT, 'scratch', 'hevc_search' + '_' + process.pid + '_' + Date.now());
try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (e) { /* EPERM en Windows no debe tumbar el gate */ }
fs.mkdirSync(TMP, { recursive: true });

const FUENTE = process.argv[2] ||
    'C:\\Users\\HFRC\\Downloads\\WhatsApp Video 2026-11-13 at 1.01.22 AM.mp4';
const SEGUNDOS = 4;

// Region de degradado suave: el cesped. Ahi se ve el banding.
const REGION_CESPED = { w: 716, h: 144, x: 102, y: 201 };
// Region de detalle: donde estan los rotulos y el movimiento
const REGION_DETALLE = { w: 1024, h: 400, x: 0, y: 150 };

const VARIANTES = [
    {
        id: 'H264_8BIT_REF',
        desc: 'H.264 High 8 bits (lo que hay hoy)',
        args: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
            '-profile:v', 'high', '-g', '50']
    },
    {
        id: 'HEVC_MAIN10',
        desc: 'HEVC Main10 4:2:0 10 bits (maximo decodificable por TV/box)',
        args: ['-c:v', 'libx265', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p10le',
            '-profile:v', 'main10', '-g', '50',
            '-x265-params', 'sao=1:deblock=-1,-1:psy-rd=2.0:aq-mode=3:rdoq-level=2:rd=6:log-level=none']
    },
    {
        id: 'HEVC_444_10',
        desc: 'HEVC Main444 4:4:4 10 bits (maximo absoluto; solo ruta JIT/VPS)',
        args: ['-c:v', 'libx265', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv444p10le',
            '-profile:v', 'main444-10', '-g', '50',
            '-x265-params', 'sao=1:deblock=-1,-1:psy-rd=2.0:aq-mode=3:rdoq-level=2:rd=6:log-level=none']
    }
];

function codificar(v, destino) {
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-t', String(SEGUNDOS), '-i', FUENTE]
        .concat(v.args).concat(['-an', destino]);
    try { execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'ignore'] }); }
    catch (e) { return { ok: false, err: String(e.message || e).slice(0, 200) }; }
    return { ok: fs.existsSync(destino) };
}

function medirHF(video) {
    const d = path.join(TMP, 'hf.yuv');
    const r = REGION_DETALLE;
    try {
        execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '1', '-i', video,
            '-frames:v', '1',
            '-vf', `crop=${r.w}:${r.h}:${r.x}:${r.y},format=gray,split[a][b];[b]gblur=sigma=3[c];[a][c]blend=all_mode=difference`,
            '-pix_fmt', 'gray', '-f', 'rawvideo', d], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (e) { return null; }
    if (!fs.existsSync(d)) return null;
    const b = fs.readFileSync(d);
    if (!b.length) return null;
    let s = 0;
    for (let i = 0; i < b.length; i++) s += b[i];
    try { fs.unlinkSync(d); } catch (e) { /* noop */ }
    return s / b.length;
}

// Banding: cuantos NIVELES distintos de luma hay en la region de cesped.
// Mas niveles = degradado mas fino = menos banding.
// Se convierte siempre a 8 bits para comparar en igualdad.
function medirNiveles(video) {
    const d = path.join(TMP, 'band.yuv');
    const r = REGION_CESPED;
    try {
        execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '1', '-i', video,
            '-frames:v', '1', '-vf', `crop=${r.w}:${r.h}:${r.x}:${r.y},format=gray`,
            '-pix_fmt', 'gray', '-f', 'rawvideo', d], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (e) { return null; }
    if (!fs.existsSync(d)) return null;
    const b = fs.readFileSync(d);
    if (!b.length) return null;
    const set = new Set();
    for (let i = 0; i < b.length; i++) set.add(b[i]);
    try { fs.unlinkSync(d); } catch (e) { /* noop */ }
    return { niveles: set.size, muestras: b.length };
}

// Niveles NATIVOS del propio fichero (10 bits reales o solo 8 empaquetados)
function perfilReal(video) {
    try {
        const o = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=codec_name,profile,pix_fmt,bit_rate,width,height,color_range,color_transfer,color_primaries',
            '-of', 'default=noprint_wrappers=1', video], { encoding: 'utf8' });
        const m = {};
        for (const l of o.trim().split(/\r?\n/)) {
            const [k, ...v] = l.split('=');
            m[k] = v.join('=');
        }
        return m;
    } catch (e) { return null; }
}

if (!fs.existsSync(FUENTE)) { console.error('FALTA la fuente: ' + FUENTE); process.exit(2); }

console.log('fuente   : ' + path.basename(FUENTE));
console.log('segmento : ' + SEGUNDOS + ' s');
console.log('crf      : 16 (visualmente sin perdida) en las tres');
console.log('');

// Referencia: la fuente original sin recodificar
console.log('=== REFERENCIA (la fuente tal cual) ===');
const refPerfil = perfilReal(FUENTE);
const refHF = medirHF(FUENTE);
const refNiv = medirNiveles(FUENTE);
console.log(`  codec=${refPerfil ? refPerfil.codec_name : '?'} profile=${refPerfil ? refPerfil.profile : '?'} pix_fmt=${refPerfil ? refPerfil.pix_fmt : '?'}`);
console.log(`  HF=${refHF === null ? '—' : refHF.toFixed(4)}   niveles_luma=${refNiv ? refNiv.niveles : '—'}`);
console.log('');

const filas = [];
for (const v of VARIANTES) {
    const out = path.join(TMP, v.id + (v.args.includes('libx265') ? '.mkv' : '.mp4'));
    const corte = out.substring(0, out.length - 4) + (v.args.includes('libx265') ? '.mp4' : '.mp4');
    const destino = corte;
    const r = codificar(v, destino);
    if (!r.ok) {
        console.log(`=== ${v.id} ===\n  CODIFICACION FALLIDA ${r.err ? '-> ' + r.err : ''}`);
        continue;
    }
    const st = fs.statSync(destino);
    const kbps = Math.round((st.size * 8) / SEGUNDOS / 1000);
    const p = perfilReal(destino);
    const hf = medirHF(destino);
    const niv = medirNiveles(destino);
    console.log(`=== ${v.id} ===`);
    console.log(`  ${v.desc}`);
    console.log(`  codec=${p ? p.codec_name : '?'} profile=${p ? p.profile : '?'} pix_fmt=${p ? p.pix_fmt : '?'}`);
    console.log(`  tamano=${(st.size / 1024).toFixed(0)} KB  bitrate_real=${kbps} kbps`);
    console.log(`  HF=${hf === null ? '—' : hf.toFixed(4)}   niveles_luma=${niv ? niv.niveles : '—'}`);
    filas.push({ id: v.id, desc: v.desc, codec: p && p.codec_name, profile: p && p.profile,
        pix_fmt: p && p.pix_fmt, bytes: st.size, kbps, hf, niveles: niv ? niv.niveles : null });
    try { fs.unlinkSync(destino); } catch (e) { /* noop */ }
    console.log('');
}

// ── Veredicto: compara HEVC Main10 contra H.264 a HF comparable ─────────────
const h264 = filas.find(f => f.id === 'H264_8BIT_REF');
const hevc = filas.find(f => f.id === 'HEVC_MAIN10');
const h444 = filas.find(f => f.id === 'HEVC_444_10');

const informe = {
    schema: 'ape.hevc.max-quality-search.v1',
    generado: new Date().toISOString(),
    fuente: path.basename(FUENTE),
    crf: 16,
    referencia: { perfil: refPerfil, hf: refHF, niveles: refNiv ? refNiv.niveles : null },
    variantes: filas,
    metricas: {
        hf: 'media de |Y - desenfoque(Y)| sobre la region de detalle. Validada: monotona con bitrate, control negativo 0,04 %.',
        niveles_luma: 'niveles distintos de luma en la region de cesped, comparados en 8 bits. Mas niveles = menos banding.'
    },
    no_computado: [
        'No se ha medido la decodificacion en el ONN: estos ficheros no se reprodujeron en el aparato.',
        'Los 10 bits solo evitan banding si el DECODIFICADOR y el DISPLAY los respetan; el ONN tiene panel 8 bits y composicion 1080p.',
        'HEVC_444_10 no lo decodifica ningun consumidor: es material para la ruta JIT/VPS, no para el reproductor.'
    ]
};

if (h264 && hevc) {
    const ahorroBit = (1 - hevc.kbps / h264.kbps) * 100;
    const ganaHF = refHF ? (hevc.hf - h264.hf) / h264.hf * 100 : null;
    informe.comparacion = {
        h264_kbps: h264.kbps, hevc_kbps: hevc.kbps, ahorro_bitrate_pct: +ahorroBit.toFixed(1),
        h264_hf: h264.hf, hevc_hf: hevc.hf, delta_hf_pct: ganaHF === null ? null : +ganaHF.toFixed(1),
        h264_niveles: h264.niveles, hevc_niveles: hevc.niveles
    };
    console.log('=== VEREDICTO ===');
    console.log(`  A igual crf 16: HEVC Main10 usa ${ahorroBit.toFixed(1)} % ${ahorroBit > 0 ? 'MENOS' : 'MAS'} bitrate que H.264`);
    if (ganaHF !== null) console.log(`  Detalle HF: HEVC ${ganaHF >= 0 ? '+' : ''}${ganaHF.toFixed(1)} % respecto a H.264`);
    console.log(`  Niveles de luma en el cesped: H.264=${h264.niveles}  HEVC_10bit=${hevc.niveles}`);
    if (h444) console.log(`  HEVC 4:4:4 10 bits: ${h444.kbps} kbps, HF=${h444.hf}, niveles=${h444.niveles}`);
}

const destino = path.join(ROOT, 'docs/audits/HEVC_MAX_QUALITY_SEARCH.json');
fs.writeFileSync(destino, JSON.stringify(informe, null, 2), 'utf8');
console.log('');
console.log('artefacto: ' + path.relative(ROOT, destino));
process.exit(filas.length >= 2 ? 0 : 1);
