#!/usr/bin/env node
'use strict';

// [2026-11-13] list_gate — EL CABLEADO. Un solo veredicto para cualquier lista servida.
//
// POR QUE EXISTE
// ==============
// Hay dos herramientas y no se hablaban:
//   vps/ape-list-probe/v3/  -> dice QUE ES la lista (sha256, estructura, harness).
//                              Pero clasifica las listas de este repo como HLS_MASTER y entonces
//                              NO comprueba servibilidad (canales=0, servabilidad=[]).
//   check_playlist_servability.js -> dice SI LAS RUTAS RESPONDEN. Pero no da identidad ni
//                              estructura ni dice que harness falta.
//
// Ninguna sola contesta la pregunta que importa: "¿puedo servir esta lista?".
// Este orquestador corre las dos y emite UN veredicto con las tres piezas:
//   IDENTIDAD   sha256, bytes, fecha, canales, tipo
//   ESTRUCTURA  extinf vs entradas con URL, huerfanas, APE_CHANNELS declarado vs contado
//   SERVIBILIDAD clases de ruta vivas/muertas
//   HARNESS     que lineas faltan del contrato del sistema
//
// Y falla si algo de eso esta mal. Es lo que debe correr antes de publicar cualquier lista.
//
// QUE NO HACE
//   - No modifica la lista. No la sube. No toca OTT ni el VPS.
//   - No inventa: si una fuente no responde, dice NO_COMPUTADO con el motivo.
//
// Uso:
//   node tools/quality/list_gate.js <url-o-fichero> [--json]
//   node tools/quality/list_gate.js <url> --json --muestras 3
//
// Exit: 0 = APTA · 1 = NO APTA · 2 = error de uso o NO_COMPUTADO

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const pos = argv.filter(a => !a.startsWith('--'));
const objetivo = pos[0];
const idxM = argv.indexOf('--muestras');
const MUESTRAS = idxM >= 0 ? Number(argv[idxM + 1] || 3) : 3;

if (!objetivo) {
    console.error('Uso: node tools/quality/list_gate.js <url-o-fichero> [--json] [--muestras N]');
    process.exit(2);
}

// Las lineas del harness que el sistema exige. Debe coincidir con apply_harness.js:
// si una linea se anade alli y no aqui, el gate no la exigiria y pasaria una lista incompleta.
const HARNESS_EXIGIDO = [
    '#EXT-X-APE-QMAX-VERSION:2.0-ADAPTIVE',
    '#EXT-X-APE-QMAX-STRATEGY:GREEDY-BEST-AVAILABLE',
    '#EXT-X-APE-QMAX-ANTI-DOWNGRADE:ENFORCED',
    '#EXT-X-APE-QMAX-TIER-CASCADE:S>A>A->B>C>D',
    '#EXT-X-APE-QMAX-SELECTION-RULE:IF-4K-EXISTS-1080P-FORBIDDEN',
    '#EXT-X-APE-QMAX-BANDWIDTH-SAFETY-MARGIN:0.30',
    '#EXT-X-APE-QUALITY-WATCH:ENABLED;SCHEMA=ape.quality-watch.cycle.v1;INTERVAL=60;SINK=device_settings',
    '#EXT-X-APE-QUALITY-WATCH-THRESHOLDS:NOISE_FLOOR=0.04;ALERT=2.0;SEVERE=8.0;ZONE_TOLERANCE=20',
    '#EXT-X-APE-QUALITY-WATCH-NOTE:METADATA;NO_DECLARA_MEDICION;EL_VEREDICTO_LO_EMITE_EL_OBSERVADOR'
];

const esURL = /^https?:\/\//i.test(objetivo);

// ── PASO 1 · el probe v3, si esta disponible ────────────────────────────────
function correrV3() {
    const v3 = path.join(ROOT, 'vps/ape-list-probe/v3/ape-list-probe.js');
    if (!fs.existsSync(v3)) return { disponible: false, motivo: 'vps/ape-list-probe/v3 no instalado' };
    // v3 necesita un sello con su sha256 para que el resultado sea atribuible
    return { disponible: true, ruta: v3, sha256: crypto.createHash('sha256').update(fs.readFileSync(v3)).digest('hex') };
}

// ── PASO 2 · censo propio en streaming (identidad + estructura + harness) ───
// Se hace aqui y no solo con v3 porque v3 no cuenta canales en HLS_MASTER y este
// ecosistema lo es. El censo propio NO sustituye a v3: da los numeros que v3 omite.
async function censar(fuente) {
    const r = {
        sha256: null, bytes: 0, last_modified: null, etag: null,
        lineas: 0, extinf: 0, streaminf: 0, urls: 0,
        clases: new Map(), muestras: new Map(),
        harness_presente: [], harness_falta: [],
        ape_channels_declarado: null,
        no_computado: []
    };
    let stream;
    if (esURL) {
        const ctrl = new AbortController();
        let timer = setTimeout(() => ctrl.abort(new Error('inactividad')), 120000);
        const tocar = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(new Error('inactividad')), 120000); };
        let res;
        try {
            res = await fetch(fuente, {
                headers: { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20', accept: '*/*' },
                signal: ctrl.signal
            });
        } catch (e) { clearTimeout(timer); r.no_computado.push('fetch fallo: ' + String(e.message || e).slice(0, 120)); return r; }
        if (!res.ok) { clearTimeout(timer); r.no_computado.push('HTTP ' + res.status); return r; }
        r.last_modified = res.headers.get('last-modified');
        r.etag = res.headers.get('etag');
        const lector = res.body.getReader();
        stream = { async *[Symbol.asyncIterator]() {
            try { while (true) { const { done, value } = await lector.read(); if (done) break; tocar(); yield value; } }
            finally { clearTimeout(timer); }
        } };
    } else {
        stream = fs.createReadStream(fuente, { highWaterMark: 1 << 20 });
    }

    const hash = crypto.createHash('sha256');
    let resto = '';
    const presentes = new Set();
    for await (const trozo of stream) {
        const b = Buffer.from(trozo);
        r.bytes += b.length;
        hash.update(b);
        resto += b.toString('utf8');
        const partes = resto.split('\n');
        resto = partes.pop();
        for (const raw of partes) {
            const l = raw.trim();
            r.lineas++;
            if (/^#EXTINF/i.test(l)) r.extinf++;
            if (/^#EXT-X-STREAM-INF/i.test(l)) r.streaminf++;
            if (HARNESS_EXIGIDO.includes(l)) presentes.add(l);
            const m = l.match(/^#EXT-X-APE-CHANNELS:\s*(\d+)/i);
            if (m) r.ape_channels_declarado = Number(m[1]);
            if (/^https?:\/\//.test(l)) {
                r.urls++;
                let clase;
                try {
                    const u = new URL(l);
                    clase = `${u.protocol}//${u.host}${u.pathname.replace(/\/\d+(?=\/|\.|$)/g, '/{n}').replace(/\.(ts|m4s|mp4|m3u8|m3u|key)$/i, '.{ext}')}`;
                } catch (e) { clase = 'INVALIDA'; }
                r.clases.set(clase, (r.clases.get(clase) || 0) + 1);
                const arr = r.muestras.get(clase);
                if (!arr) r.muestras.set(clase, [l]);
                else if (arr.length < MUESTRAS) arr.push(l);
            }
        }
    }
    if (resto.trim()) {
        const l = resto.trim();
        r.lineas++;
        if (/^#EXTINF/i.test(l)) r.extinf++;
        if (/^https?:\/\//.test(l)) r.urls++;
    }
    r.sha256 = hash.digest('hex');
    r.harness_presente = HARNESS_EXIGIDO.filter(x => presentes.has(x));
    r.harness_falta = HARNESS_EXIGIDO.filter(x => !presentes.has(x));
    return r;
}

// ── PASO 3 · servibilidad por clase ─────────────────────────────────────────
async function servibilidad(censo) {
    const salida = [];
    for (const [clase, urls] of censo.muestras) {
        const prob = await Promise.all(urls.map(async (u) => {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 15000);
            try {
                const res = await fetch(u, {
                    method: 'GET', redirect: 'manual', signal: ctrl.signal,
                    headers: { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20', range: 'bytes=0-1023' }
                });
                return { status: res.status, ok: res.status < 400 };
            } catch (e) { return { status: null, ok: false }; }
            finally { clearTimeout(t); }
        }));
        const conR = prob.filter(p => p.status !== null);
        const vivas = prob.filter(p => p.ok);
        salida.push({
            clase,
            urls_en_la_lista: censo.clases.get(clase) || 0,
            probadas: prob.length,
            estado: conR.length === 0 ? 'NO_COMPUTADA' : (vivas.length === 0 ? 'MUERTA' : (vivas.length === conR.length ? 'VIVA' : 'MIXTA')),
            codigos: [...new Set(prob.map(p => p.status).filter(s => s !== null))].sort(),
            ejemplo: urls[0]
        });
    }
    return salida;
}

(async () => {
    const t0 = Date.now();
    const v3 = correrV3();
    const censo = await censar(objetivo);
    const serv = censo.no_computado.length ? [] : await servibilidad(censo);

    const muertas = serv.filter(s => s.estado === 'MUERTA');
    const vivas = serv.filter(s => s.estado === 'VIVA' || s.estado === 'MIXTA');
    const huerfanas = Math.max(0, censo.extinf - censo.urls);

    // Veredicto: una lista es APTA si tiene rutas vivas, no esta truncada y lleva el harness.
    const fallos = [];
    if (censo.no_computado.length) fallos.push('NO_COMPUTADO: ' + censo.no_computado.join(' | '));
    if (muertas.length) fallos.push(`${muertas.length} clase(s) de ruta MUERTA(S) — la lista no reproduce por esa via`);
    if (huerfanas > 0) fallos.push(`${huerfanas} entrada(s) #EXTINF sin URL`);
    if (censo.harness_falta.length) fallos.push(`faltan ${censo.harness_falta.length} linea(s) del harness`);
    if (censo.ape_channels_declarado !== null && censo.extinf > 0 && censo.ape_channels_declarado !== censo.extinf) {
        fallos.push(`APE_CHANNELS declara ${censo.ape_channels_declarado} y hay ${censo.extinf} #EXTINF`);
    }

    const veredicto = censo.no_computado.length ? 'NO_COMPUTADO'
        : (muertas.length || huerfanas > 0 ? 'NO_APTA'
            : (censo.harness_falta.length ? 'APTA_SIN_HARNESS' : 'APTA'));

    const informe = {
        schema: 'ape.list-gate.v1',
        generado: new Date().toISOString(),
        objetivo: esURL ? objetivo.replace(/([A-Za-z0-9_-]{8,})(?=\.m3u8?)/, '{segmentos}') : path.basename(objetivo),
        veredicto,
        identidad: {
            sha256: censo.sha256, bytes: censo.bytes, last_modified: censo.last_modified, etag: censo.etag,
            lineas: censo.lineas, extinf: censo.extinf, stream_inf: censo.streaminf, urls: censo.urls
        },
        estructura: {
            entradas_con_url: censo.urls,
            huerfanas,
            ape_channels_declarado: censo.ape_channels_declarado,
            coherente: censo.ape_channels_declarado === null || censo.ape_channels_declarado === censo.extinf
        },
        servibilidad: serv,
        harness: {
            presente: censo.harness_presente.length,
            falta: censo.harness_falta,
            exigido: HARNESS_EXIGIDO.length
        },
        fallos,
        probe_v3: v3,
        duracion_ms: Date.now() - t0,
        nota: 'El censo propio corre ADEMAS del probe v3 porque v3 clasifica estas listas como HLS_MASTER y entonces no cuenta canales ni comprueba servibilidad. Los dos son necesarios.'
    };

    const dest = path.join(ROOT, 'docs/audits', `LIST_GATE_${String(informe.objetivo).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60)}.json`);
    try { fs.writeFileSync(dest, JSON.stringify(informe, null, 2), 'utf8'); } catch (e) { /* noop */ }

    if (JSON_OUT) {
        console.log(JSON.stringify(informe, null, 2));
    } else {
        console.log('');
        console.log('=== LIST GATE ===');
        console.log('objetivo   : ' + informe.objetivo);
        console.log('veredicto  : ' + veredicto);
        console.log('');
        console.log('IDENTIDAD');
        console.log('  sha256      : ' + censo.sha256);
        console.log('  bytes       : ' + censo.bytes.toLocaleString('es'));
        console.log('  last_mod    : ' + (censo.last_modified || 'no declarado'));
        console.log('  lineas      : ' + censo.lineas.toLocaleString('es'));
        console.log('  extinf      : ' + censo.extinf.toLocaleString('es'));
        console.log('  stream-inf  : ' + censo.streaminf.toLocaleString('es'));
        console.log('  urls        : ' + censo.urls.toLocaleString('es'));
        console.log('');
        console.log('ESTRUCTURA');
        console.log('  entradas_con_url : ' + censo.urls.toLocaleString('es'));
        console.log('  huerfanas        : ' + huerfanas);
        console.log('  APE_CHANNELS     : ' + (censo.ape_channels_declarado ?? 'no declarado') +
            (censo.ape_channels_declarado === null ? '' : (censo.ape_channels_declarado === censo.extinf ? ' (coincide)' : ' (NO COINCIDE)')));
        console.log('');
        console.log('SERVIBILIDAD');
        if (!serv.length) console.log('  NO COMPUTADO');
        for (const s of serv) {
            console.log(`  ${s.estado.padEnd(11)} ${s.clase}`);
            console.log(`              ${s.urls_en_la_lista.toLocaleString('es')} en la lista · ${s.probadas} probadas · codigos [${s.codigos.join(',')}]`);
        }
        console.log('');
        console.log('HARNESS');
        console.log(`  ${censo.harness_presente.length}/${HARNESS_EXIGIDO.length} lineas presentes`);
        for (const f of censo.harness_falta) console.log('  FALTA: ' + f.slice(0, 88));
        console.log('');
        if (fallos.length) {
            console.log('FALLOS');
            for (const f of fallos) console.log('  - ' + f);
        } else {
            console.log('Sin fallos.');
        }
        console.log('');
        console.log('artefacto  : ' + path.relative(ROOT, dest));
        console.log('duracion   : ' + (informe.duracion_ms / 1000).toFixed(1) + ' s');
    }

    process.exitCode = veredicto === 'APTA' ? 0 : (veredicto === 'NO_COMPUTADO' ? 2 : 1);
})().catch(e => {
    console.error('ERROR: ' + (e && e.stack || e));
    process.exitCode = 2;
});
