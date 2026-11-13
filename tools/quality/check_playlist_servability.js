#!/usr/bin/env node
'use strict';

// [2026-11-13] GATE: ninguna lista se publica si sus rutas estan muertas.
//
// POR QUE EXISTE
// ==============
// El 2026-11-13 se midio que `downloaded_list_4K.m3u8` y `downloaded_list_8K.m3u8`
// (export del 2026-10-26) tienen el 100 % de sus URLs apuntando a
// `https://iptv-ape.duckdns.org/live/N.m3u8`, y esa ruta responde HTTP 404:
//
//   /live/1.m3u8 -> 404   /live/2.m3u8 -> 404   /live/1.ts -> 404   /live/1.m4s -> 404
//
// Una lista asi no reproduce NADA. Se publico igual porque nadie comprobaba la
// alcanzabilidad del PATRON de URL antes de servirla.
//
// QUE HACE ESTE GATE
// ==================
//   1. Lee la lista y agrupa sus URLs por "clase de ruta" (host + forma del path).
//   2. Muestrea N URLs por clase.
//   3. Prueba cada muestra con HTTP.
//   4. Veredicto por clase:
//        VIVA      : al menos una muestra responde < 400
//        MUERTA    : TODAS las muestras responden 4xx/5xx  -> la lista no reproduce
//        NO_COMPUTADA: ninguna muestra respondio (red caida, timeout) -> no es un cero
//   5. FALLA (exit 1) si alguna clase con >= MIN_MUESTRAS esta MUERTA.
//
// POR QUE POR CLASE Y NO POR URL
// ==============================
// 2.753 URLs son demasiadas para probarlas todas en cada corrida, y la mayoria comparten
// host y forma de path. Si la CLASE esta muerta, no hace falta probar las 2.753: la
// primera ya lo demuestra. Si la clase esta viva, se reporta con su tasa de fallo real.
//
// LO QUE ESTE GATE NO HACE
// ========================
//   - No valida el CONTENIDO del manifiesto (eso es otro gate).
//   - No prueba los segmentos de cada canal: prueba la ruta que la lista declara.
//   - Una clase VIVA no garantiza que todos sus canales funcionen: garantiza que la
//     RUTA existe. Es el defecto que costo estas dos listas, y es el que se cierra aqui.
//
// Uso: node tools/quality/check_playlist_servability.js <lista.m3u8> [muestras-por-clase]
//      node tools/quality/check_playlist_servability.js <lista> 5 --json

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const pos = args.filter(a => !a.startsWith('--'));
const lista = pos[0];
const MUESTRAS = Number(pos[1] || 3);
const TIMEOUT_MS = 12000;

if (!lista || !fs.existsSync(lista)) {
    console.error('FALTA la lista. Uso: node tools/quality/check_playlist_servability.js <lista.m3u8> [muestras]');
    process.exit(2);
}

// Clase de ruta: host + path normalizado (digitos -> {n}, hex -> {h})
function claseDe(u) {
    try {
        const x = new URL(u);
        const p = x.pathname
            .replace(/\/\d+(?=\/|\.|$)/g, '/{n}')
            .replace(/[a-f0-9]{16,}/gi, '{h}')
            .replace(/\.(ts|m4s|mp4|m3u8)$/i, '.{ext}');
        return `${x.protocol}//${x.host}${p}`;
    } catch (e) {
        return 'INVALIDA';
    }
}

// Lee URLs agrupadas por clase. Streaming: no carga 220 MB en memoria.
function agrupar(archivo, maxPorClase) {
    const mapa = new Map();      // clase -> muestras de URL
    const totales = new Map();   // clase -> cuantas URLs tiene en la lista
    const buf = Buffer.alloc(1 << 16);
    const fd = fs.openSync(archivo, 'r');
    let resto = '';
    let total = 0;
    let invalidas = 0;
    while (true) {
        const n = fs.readSync(fd, buf, 0, buf.length, null);
        if (n <= 0) break;
        resto += buf.toString('utf8', 0, n);
        const lineas = resto.split('\n');
        resto = lineas.pop();   // la ultima puede estar cortada
        for (const l of lineas) {
            if (!/^https?:\/\//.test(l)) continue;
            total++;
            const c = claseDe(l.trim());
            if (c === 'INVALIDA') { invalidas++; continue; }
            totales.set(c, (totales.get(c) || 0) + 1);
            const arr = mapa.get(c);
            if (!arr) mapa.set(c, [l.trim()]);
            else if (arr.length < maxPorClase) arr.push(l.trim());
        }
    }
    if (resto && /^https?:\/\//.test(resto)) {
        total++;
        const c = claseDe(resto.trim());
        if (c !== 'INVALIDA') {
            totales.set(c, (totales.get(c) || 0) + 1);
            const arr = mapa.get(c);
            if (!arr) mapa.set(c, [resto.trim()]);
            else if (arr.length < maxPorClase) arr.push(resto.trim());
        }
    }
    fs.closeSync(fd);
    return { mapa, totales, total, invalidas };
}

async function probar(u) {
    try {
        const res = await fetch(u, {
            method: 'GET',
            redirect: 'manual',
            headers: { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20', range: 'bytes=0-1023' },
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        return { status: res.status, ok: res.status < 400 };
    } catch (e) {
        return { status: null, ok: false, error: String(e.message || e).slice(0, 80) };
    }
}

(async () => {
    const { mapa, totales, total, invalidas } = agrupar(lista, MUESTRAS);

    const informe = {
        schema: 'ape.playlist.servability.v1',
        generado: new Date().toISOString(),
        lista: path.basename(lista),
        urls_totales: total,
        urls_invalidas: invalidas,
        clases: [],
        muestras_por_clase: MUESTRAS,
        veredicto: null
    };

    if (!JSON_OUT) {
        console.log('lista    : ' + informe.lista);
        console.log('URLs     : ' + total.toLocaleString('es') + ' en ' + mapa.size + ' clase(s) de ruta');
        console.log('muestras : ' + MUESTRAS + ' por clase');
        console.log('');
    }

    let muertas = 0, vivas = 0, noComputadas = 0;
    let urlsAfectadasMuertas = 0;

    for (const [clase, urls] of mapa) {
        const resultados = [];
        for (const u of urls) resultados.push(await probar(u));

        const conRespuesta = resultados.filter(r => r.status !== null);
        const vivasAqui = resultados.filter(r => r.ok);
        const codigos = [...new Set(resultados.map(r => r.status).filter(s => s !== null))].sort();

        let estado;
        if (conRespuesta.length === 0) estado = 'NO_COMPUTADA';
        else if (vivasAqui.length > 0) estado = 'VIVA';
        else estado = 'MUERTA';

        const enLaLista = totales.get(clase) || urls.length;
        if (estado === 'MUERTA') { muertas++; urlsAfectadasMuertas += enLaLista; }
        else if (estado === 'VIVA') vivas++;
        else noComputadas++;

        const fila = {
            clase,
            estado,
            urls_en_la_lista: enLaLista,
            probadas: urls.length,
            responden: conRespuesta.length,
            codigos_http: codigos,
            tasa_fallo_pct: conRespuesta.length
                ? +((1 - vivasAqui.length / conRespuesta.length) * 100).toFixed(1) : null,
            muestra: urls[0]
        };
        informe.clases.push(fila);

        if (!JSON_OUT) {
            const marca = estado === 'VIVA' ? 'OK    ' : estado === 'MUERTA' ? 'MUERTA' : 'N/COMP';
            console.log(`  ${marca} ${clase}`);
            console.log(`         en_la_lista=${enLaLista} probadas=${urls.length} responden=${conRespuesta.length} codigos=[${codigos.join(',')}]` +
                (fila.tasa_fallo_pct !== null ? ` fallo=${fila.tasa_fallo_pct}%` : ''));
            console.log(`         ej: ${urls[0].slice(0, 100)}`);
        }
    }

    // Veredicto: una clase MUERTA es una lista que no reproduce NADA en esa clase.
    informe.resumen = { clases: mapa.size, vivas, muertas, no_computadas: noComputadas,
        urls_en_clases_muertas: urlsAfectadasMuertas };

    if (muertas > 0) {
        informe.veredicto = 'FALLA';
        informe.motivo = `${muertas} clase(s) de ruta MUERTA(S): esa lista no reproduce por esa via`;
    } else if (noComputadas > 0 && vivas === 0) {
        informe.veredicto = 'NO_COMPUTADO';
        informe.motivo = 'ninguna muestra respondio: no se puede afirmar que este viva (y no es un cero)';
    } else {
        informe.veredicto = 'PASA';
        informe.motivo = `todas las clases con muestras responden (${vivas} viva(s))`;
    }

    const dest = path.join(ROOT, 'docs/audits', `PLAYLIST_SERVABILITY_${path.basename(lista, '.m3u8')}.json`);
    try { fs.writeFileSync(dest, JSON.stringify(informe, null, 2), 'utf8'); } catch (e) { /* ruta no escribible */ }

    if (JSON_OUT) {
        console.log(JSON.stringify(informe, null, 2));
    } else {
        console.log('');
        console.log('----------------------------------------');
        console.log('  VEREDICTO: ' + informe.veredicto);
        console.log('  ' + informe.motivo);
        if (urlsAfectadasMuertas) console.log(`  URLs en clases muertas: ${urlsAfectadasMuertas.toLocaleString('es')}`);
        console.log('  artefacto: ' + path.relative(ROOT, dest));
    }

    process.exit(informe.veredicto === 'PASA' ? 0 : 1);
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
