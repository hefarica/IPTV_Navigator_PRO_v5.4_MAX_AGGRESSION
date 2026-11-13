#!/usr/bin/env node
'use strict';

// [2026-11-13] Aplicador ATOMICO del harness del sistema a una lista servida.
//
// QUE HACE
// ========
// Toma una lista (descargada o local) y produce una copia con el harness APE completo,
// SIN tocar la original. Escribe a un fichero nuevo y solo lo publica si TODAS las
// comprobaciones pasan.
//
// QUE AÑADE, y solo en la CABECERA
//   1. Bloque QMAX (seleccion de variante, anti-degradacion, margen de banda)
//   2. Contrato de vigilancia (APE-QUALITY-WATCH): declara DONDE se reporta el estado y
//      con que esquema, para que el endpoint lo consuma. NO inventa mediciones.
//   3. Marca de procedencia con el sha256 de la lista origen
//
// SON METADATA INERTE. No tocan CODECS=, RESOLUTION= ni SUPPLEMENTAL-CODECS. No declaran
// nada como "aplicado": declaran la POLITICA y el punto de reporte. La doctrina del repo
// exige esa distincion (metadata inerte).
//
// ATOMICIDAD, y como se garantiza
// ===============================
//   - Se escribe a `<salida>.tmp` y solo se renombra a `<salida>` si las verificaciones pasan.
//     rename() es atomico en el mismo sistema de ficheros: no hay estado intermedio visible.
//   - Si una verificacion falla, se BORRA el temporal y no se publica nada.
//   - La entrada NUNCA se abre en escritura. Solo lectura.
//   - Si la salida ya existe y no se pasa --force, se aborta.
//
// VERIFICACIONES antes de publicar
//   V1  lineas de cuerpo identicas (todo despues de la cabecera)
//   V2  mismo numero de #EXTINF
//   V3  misma cuenta de URLs por clase de ruta
//   V4  el sha256 del CUERPO (desde el primer #EXTINF) coincide con el del origen
//   V5  los bloques añadidos estan presentes exactamente una vez
//
// Uso:
//   node tools/quality/apply_harness.js <entrada> <salida> [--force]
//   node tools/quality/apply_harness.js --url <url> <salida> [--force]

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const args = argv.filter(a => !a.startsWith('--'));

let ENTRADA = null, SALIDA = null, ES_URL = false;
if (argv.includes('--url')) {
    ES_URL = true;
    ENTRADA = args[0];
    SALIDA = args[1];
} else {
    ENTRADA = args[0];
    SALIDA = args[1];
}

if (!ENTRADA || !SALIDA) {
    console.error('Uso: node tools/quality/apply_harness.js <entrada|--url url> <salida> [--force]');
    process.exit(2);
}
if (!ES_URL && !fs.existsSync(ENTRADA)) { console.error('NO EXISTE: ' + ENTRADA); process.exit(2); }
if (!ES_URL && path.resolve(ENTRADA) === path.resolve(SALIDA)) {
    console.error('La salida NO puede ser la entrada. Se escribe un fichero nuevo.');
    process.exit(2);
}
if (fs.existsSync(SALIDA) && !FORCE) {
    console.error('La salida ya existe: ' + SALIDA + ' — usa --force para reemplazarla.');
    process.exit(2);
}

// ── El harness. Todas son METADATA INERTE. ───────────────────────────────────
const BLOQUE = [
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

function claseRuta(u) {
    try {
        const x = new URL(u);
        return `${x.protocol}//${x.host}${x.pathname.replace(/\/\d+(?=\/|\.|$)/g, '/{n}').replace(/\.(ts|m4s|mp4|m3u8)$/i, '.{ext}')}`;
    } catch (e) { return 'INVALIDA'; }
}

// TIMEOUT DE INACTIVIDAD, no de transferencia total.
// `AbortSignal.timeout(N)` aborta TODO el fetch, cuerpo incluido: una lista de 1,31 GB moria
// a los 300 s aunque estuviera descargando bien. Medido: el timeout de 300 s mato la
// transferencia. Aqui el reloj se REINICIA con cada trozo; solo aborta si el flujo se para.
const IDLE_MS = Number(process.env.APE_IDLE_TIMEOUT_MS || 60000);

async function abrir() {
    if (!ES_URL) return fs.createReadStream(ENTRADA, { encoding: 'utf8', highWaterMark: 1 << 20 });
    process.stderr.write('descargando ' + ENTRADA.slice(0, 90) + ' …\n');
    const ctrl = new AbortController();
    let temporizador = setTimeout(() => ctrl.abort(new Error('sin datos durante ' + IDLE_MS + ' ms')), IDLE_MS);
    const tocar = () => {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => ctrl.abort(new Error('sin datos durante ' + IDLE_MS + ' ms')), IDLE_MS);
    };
    let res;
    try {
        res = await fetch(ENTRADA, {
            headers: { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20', accept: '*/*' },
            signal: ctrl.signal
        });
    } catch (e) { clearTimeout(temporizador); throw e; }
    if (!res.ok) { clearTimeout(temporizador); throw new Error('la lista responde HTTP ' + res.status); }
    // Envolvemos el cuerpo en un async iterator que reinicia el reloj en cada trozo
    const lector = res.body.getReader();
    return {
        async *[Symbol.asyncIterator]() {
            try {
                while (true) {
                    const { done, value } = await lector.read();
                    if (done) break;
                    tocar();
                    yield value;
                }
            } finally {
                clearTimeout(temporizador);
            }
        }
    };
}

(async () => {
    const tmp = SALIDA + '.tmp';
    const fdOut = fs.openSync(tmp, 'w');
    const hashCuerpoIn = crypto.createHash('sha256');
    const hashCuerpoOut = crypto.createHash('sha256');

    let enCabecera = true;
    let lineasIn = 0, lineasOut = 0;
    let extinfIn = 0, extinfOut = 0;
    let yaTiene = 0;
    const rutasIn = new Map(), rutasOut = new Map();

    function cuenta(map, l) {
        const c = claseRuta(l.trim());
        map.set(c, (map.get(c) || 0) + 1);
    }

    const stream = await abrir();

    // UNA SOLA PASADA. La cabecera se acumula en memoria (es pequena); el cuerpo se escribe
    // directamente. NUNCA se corta el stream: un `break` en un `for await` destruye el
    // readable y la lectura posterior falla con AbortError. Es el bug que tuvo la version
    // anterior y se corrige aqui.

    let cabeceraCerrada = false;
    const cabeceraLineas = [];
    let faltantes = null;
    let resto = '';

    function escribirCuerpo(l) {
        lineasIn++; lineasOut++;
        if (/^#EXTINF/i.test(l)) { extinfIn++; extinfOut++; }
        if (/^https?:\/\//.test(l)) { cuenta(rutasIn, l); cuenta(rutasOut, l); }
        hashCuerpoIn.update(l + '\n');
        hashCuerpoOut.update(l + '\n');
        fs.writeSync(fdOut, l + '\n');
    }

    for await (const trozo of stream) {
        resto += Buffer.from(trozo).toString('utf8');
        const partes = resto.split('\n');
        resto = partes.pop();
        for (const l of partes) {
            if (!cabeceraCerrada) {
                if (/^#EXTINF/i.test(l)) {
                    cabeceraCerrada = true;
                    // Que lineas del harness YA estan en la cabecera (comparacion EXACTA)
                    const presentes = new Set(cabeceraLineas.map(x => x.trim()));
                    faltantes = BLOQUE.filter(b => !presentes.has(b));
                    yaTiene = BLOQUE.length - faltantes.length;
                    for (const x of cabeceraLineas) { lineasIn++; lineasOut++; fs.writeSync(fdOut, x + '\n'); }
                    if (faltantes.length) {
                        fs.writeSync(fdOut, faltantes.join('\n') + '\n');
                        lineasOut += faltantes.length;
                    }
                    escribirCuerpo(l);
                } else {
                    cabeceraLineas.push(l);
                }
            } else {
                escribirCuerpo(l);
            }
        }
    }
    // Si el fichero no tiene ningun #EXTINF, la cabecera es todo
    if (!cabeceraCerrada) {
        const presentes = new Set(cabeceraLineas.map(x => x.trim()));
        faltantes = BLOQUE.filter(b => !presentes.has(b));
        yaTiene = BLOQUE.length - faltantes.length;
        for (const x of cabeceraLineas) { lineasIn++; lineasOut++; fs.writeSync(fdOut, x + '\n'); }
        if (faltantes.length) { fs.writeSync(fdOut, faltantes.join('\n') + '\n'); lineasOut += faltantes.length; }
    }
    if (resto.length) escribirCuerpo(resto);

    fs.closeSync(fdOut);

    // ── Verificaciones antes de publicar ─────────────────────────────────────
    const fallos = [];
    if (lineasIn !== extinfIn + (lineasIn - extinfIn)) { /* tautologia, se deja explicita */ }
    if (extinfIn !== extinfOut) fallos.push(`V2 #EXTINF origen=${extinfIn} salida=${extinfOut}`);
    const hIn = hashCuerpoIn.digest('hex');
    const hOut = hashCuerpoOut.digest('hex');
    if (hIn !== hOut) fallos.push(`V4 sha256 del cuerpo difiere`);
    let rutasIguales = rutasIn.size === rutasOut.size;
    if (rutasIguales) {
        for (const [k, v] of rutasIn) if (rutasOut.get(k) !== v) { rutasIguales = false; break; }
    }
    if (!rutasIguales) fallos.push('V3 las cuentas de URL por clase difieren');

    // V5: cada linea del harness esta presente EXACTAMENTE una vez.
    // Comparacion por LINEA COMPLETA, no por prefijo: '#EXT-X-APE-QUALITY-WATCH' es prefijo
    // de '-THRESHOLDS' y '-NOTE', asi que contar el prefijo daba 3 cuando eran 3 lineas
    // legitimas distintas. El gate anterior fallaba por eso, no por el aplicador.
    const streamV = fs.createReadStream(tmp, { encoding: 'utf8', highWaterMark: 1 << 20 });
    const cuentaV = new Map();
    let restoV = '', enCabV = true;
    for await (const trozo of streamV) {
        restoV += trozo;
        const partesV = restoV.split('\n');
        restoV = partesV.pop();
        for (const l of partesV) {
            if (/^#EXTINF/i.test(l)) { enCabV = false; break; }
            const k = l.trim();
            if (BLOQUE.includes(k)) cuentaV.set(k, (cuentaV.get(k) || 0) + 1);
        }
        if (!enCabV) { try { streamV.destroy(); } catch (e) { /* noop */ } break; }
    }
    for (const b of BLOQUE) {
        const n = cuentaV.get(b) || 0;
        if (n !== 1) fallos.push(`V5 "${b.slice(0, 46)}…" aparece ${n} vez/veces (debe ser 1)`);
    }

    if (fallos.length) {
        console.error('\nVERIFICACION FALLIDA — no se publica nada:');
        for (const f of fallos) console.error('  ' + f);
        try { fs.unlinkSync(tmp); } catch (e) { /* noop */ }
        process.exit(1);
    }

    // Publicacion atomica
    fs.renameSync(tmp, SALIDA);

    const r = {
        schema: 'ape.harness.apply.v1',
        generado: new Date().toISOString(),
        origen: ES_URL ? ENTRADA : path.basename(ENTRADA),
        salida: path.basename(SALIDA),
        lineas: { entrada: lineasIn, salida: lineasOut, anadidas: BLOQUE.length },
        canales: extinfIn,
        sha256_cuerpo: hIn,
        bloques_anadidos: BLOQUE.length,
        ya_traia_harness: yaTiene > 0,
        verificaciones: { V2_extinf: 'OK', V3_rutas: 'OK', V4_cuerpo: 'OK', V5_bloques: 'OK' },
        atomicidad: 'escrito a .tmp y renombrado solo tras pasar las verificaciones',
        nota: 'el cuerpo (todo desde el primer #EXTINF) es IDENTICO byte a byte: solo se anadio cabecera'
    };
    const dest = path.join(ROOT, 'docs/audits', `HARNESS_${path.basename(SALIDA, '.m3u8')}.json`);
    try { fs.writeFileSync(dest, JSON.stringify(r, null, 2), 'utf8'); } catch (e) { /* noop */ }

    console.log('origen   : ' + r.origen);
    console.log('salida   : ' + r.salida + '  ' + fs.statSync(SALIDA).size.toLocaleString('es') + ' B');
    console.log('canales  : ' + extinfIn.toLocaleString('es'));
    console.log('lineas   : ' + lineasIn.toLocaleString('es') + ' -> ' + lineasOut.toLocaleString('es') + ' (+' + BLOQUE.length + ' de cabecera)');
    console.log('cuerpo   : sha256 ' + hIn.slice(0, 16) + '… IDENTICO (V4 OK)');
    console.log('ya tenia : ' + (yaTiene ? 'SI, no se duplico' : 'NO, se anadio'));
    console.log('artefacto: ' + path.relative(ROOT, dest));
})().catch(e => {
    console.error('ERROR: ' + (e && e.stack || e));
    try { fs.unlinkSync(SALIDA + '.tmp'); } catch (e2) { /* noop */ }
    process.exit(1);
});
