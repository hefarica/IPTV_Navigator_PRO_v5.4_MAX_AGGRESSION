#!/usr/bin/env node
/**
 * gate_matrix.js — la matriz que el gate del operador exige, celda por celda.
 *
 * El requisito es que TODA lista, en TODAS sus configuraciones posibles de cliente,
 * entregue 200, 206 y 302. Hasta ahora se venia midiendo en trozos: el 206 por perfil
 * en un informe, el 302 en otro, y el 200 heredado de la telemetria de produccion.
 * Un trozo no es una garantia: esta herramienta mide las seis configuraciones por
 * lista en una sola pasada y dice exactamente que celda falta.
 *
 * Seis configuraciones por lista (5 HTTPS + 1 HTTP):
 *   1. GET completo, sin gzip        -> mide la pata 200 para cliente sin gzip
 *   2. GET completo, con gzip        -> mide la pata 200 para cliente con gzip
 *   3. GET con Range, sin gzip       -> mide la pata 206 para cliente sin gzip
 *   4. GET con Range, con gzip       -> mide la pata 206 para cliente con gzip
 *   5. HTTP plano, sin gzip          -> mide la pata 302/301 (redirect a https)
 *   6. HEAD, sin gzip                -> longitud declarada, sin descargar el cuerpo
 *
 * Solo lectura: no escribe nada en el servidor. Los GET completos de las listas
 * grandes se cortan en 1 KB para no bajar 604 MB seis veces; el estado y las
 * cabeceras se leen al recibir la respuesta, que es lo que el gate evalua.
 *
 *   node tools/ape-http-conformance/gate_matrix.js [--json ruta]
 *   exit 0 = toda celda esperada cumple · 1 = hay huecos
 */
'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');

const HOST = 'iptv-ape.duckdns.org';
const BASE = '/lists/';

const LISTAS = [
  'APE_LISTA_1793589060441.m3u8',          // grande, con .gz
  'APE_LISTA_1793558303852_CDN.m3u8',      // grande, con .gz
  'APE_PRUEBA_ORDER_OK.m3u8',              // pequena, sin .gz
  'APE_PRUEBA_PERFILES.m3u8'               // pequena, sin .gz
];

const TIMEOUT = 30000;

/** Una peticion. Devuelve estado + cabeceras relevantes. Corta el cuerpo al primer chunk. */
function pedir({ ruta, protocolo = 'https', method = 'GET', gzip = false, range = false }) {
  return new Promise((res) => {
    const headers = { 'Accept-Encoding': gzip ? 'gzip' : 'identity' };
    if (range) headers.Range = 'bytes=0-1023';
    const mod = protocolo === 'https' ? https : http;
    const opts = protocolo === 'https'
      ? { host: HOST, path: ruta, method, headers, timeout: TIMEOUT }
      : { host: HOST, port: 80, path: ruta, method, headers, timeout: TIMEOUT };

    const req = mod.request(opts, (r) => {
      const h = r.headers;
      const out = {
        status: r.statusCode,
        content_encoding: h['content-encoding'] || null,
        content_range: h['content-range'] || null,
        content_length: h['content-length'] || null,
        transfer_encoding: h['transfer-encoding'] || null,
        location: h.location || null
      };
      // No se descarga el cuerpo: interesa el estado y las cabeceras, no los bytes.
      r.destroy();
      res(out);
    });
    req.on('timeout', () => { req.destroy(); res({ error: 'timeout' }); });
    req.on('error', (e) => res({ error: e.code || e.message }));
    req.end();
  });
}

// Tamano MINIMO esperado del cuerpo identity por lista. El identity de la lista grande tiene 604593696
// bytes; si llega menos, el gate falla aunque el codigo sea 200. Las dos de prueba son pequenas.
const TAMANO_MINIMO = {
  'APE_LISTA_1793589060441.m3u8': 604593696,
  'APE_LISTA_1793558303852_CDN.m3u8': 1000000,
  'APE_PRUEBA_ORDER_OK.m3u8': 200,
  'APE_PRUEBA_PERFILES.m3u8': 200
};

const es3xx = (o) => !o.error && o.status >= 300 && o.status < 400;

/** Evalua una lista contra las seis configuraciones y devuelve sus celdas. */
async function evaluar(nombre) {
  const ruta = BASE + nombre;
  const [g200i, g200g, r206i, r206g, hredir, head] = await Promise.all([
    pedir({ ruta, method: 'GET', gzip: false }),
    pedir({ ruta, method: 'GET', gzip: true }),
    pedir({ ruta, method: 'GET', gzip: false, range: true }),
    pedir({ ruta, method: 'GET', gzip: true, range: true }),
    pedir({ ruta, protocolo: 'http', method: 'GET', gzip: false }),
    pedir({ ruta, method: 'HEAD', gzip: false })
  ]);

  return {
    lista: nombre,
    '200 identity': g200i.status || g200i.error,
    '200 gzip': g200g.status || g200g.error,
    '206 identity': r206i.status || r206i.error,
    '206 gzip': r206g.status || r206g.error,
    'redirect http': hredir.status || hredir.error,
    'location': hredir.location || null,
    // Datos de apoyo para explicar un fallo, no para decidir el gate.
    detalle: {
      '200 identity': g200i,
      '206 identity': r206i,
      '206 gzip': r206g,
      head: { length: head.content_length, status: head.status }
    }
  };
}

(async () => {
  const argJson = process.argv.indexOf('--json');
  const filas = [];
  for (const l of LISTAS) filas.push(await evaluar(l));

  // Criterio por pata, declarado ANTES de mirar el resultado de cada lista:
  //   pata 200  -> GET completo debe dar 200
  //   pata 206  -> GET con Range debe dar 206
  //   pata 302  -> HTTP plano debe dar 302 exacto
  const celdas = [];
  for (const f of filas) {
    // Un 200 con cuerpo vacio sigue siendo 200, y eso paso de verdad: el identity de la lista grande
    // tenia 8 bytes y esta matriz daba la celda por buena porque solo miraba el codigo. Ahora la celda
    // exige ademas que el cuerpo tenga el tamano declarado. Sin esto el gate no prueba que la lista llegue.
    const bytesDe = (perfil) => {
      const d = (f.detalle && f.detalle[perfil]) || {};
      const n = Number(d.content_length);
      return isFinite(n) ? n : 0;
    };
    const minDe = (nombre) => TAMANO_MINIMO[nombre] || 200;
    const identidadOk = f['200 identity'] === 200 && bytesDe('200 identity') >= minDe(f.lista);
    celdas.push({
      lista: f.lista, pata: '200', perfil: 'identity',
      obtenido: f['200 identity'],
      bytes: bytesDe('200 identity'),
      min_bytes: minDe(f.lista),
      cumple: identidadOk
    });
    celdas.push({ lista: f.lista, pata: '200', perfil: 'gzip', obtenido: f['200 gzip'], cumple: f['200 gzip'] === 200 });
    celdas.push({ lista: f.lista, pata: '206', perfil: 'identity', obtenido: f['206 identity'], cumple: f['206 identity'] === 206 });
    celdas.push({ lista: f.lista, pata: '206', perfil: 'gzip', obtenido: f['206 gzip'], cumple: f['206 gzip'] === 206 });
    celdas.push({ lista: f.lista, pata: '302', perfil: 'http', obtenido: f['redirect http'], cumple: f['redirect http'] === 302 });
  }

  const total = celdas.length;
  const ok = celdas.filter(c => c.cumple).length;
  const huecos = celdas.filter(c => !c.cumple);

  /**
   * Remedio por hueco. No es una prediccion suelta: cada entrada nombra el artefacto del repo y
   * el mecanismo concreto que se midio. Los huecos de 206 son DOS causas distintas y necesitan
   * DOS cambios distintos; tratarlos como uno solo fue un error de rondas anteriores.
   */
  const remedio = (h) => {
    if (h.pata === '302') {
      return {
        causa: 'la linea del redirect usa 301 en vez de 302',
        artefacto: 'vps/nginx/live-baseline-2026-11-02/sites-enabled-default.conf',
        cambio: 'return 301 -> return 302 en la redireccion http->https',
        celdas: '+4'
      };
    }
    if (h.pata === '206' && h.perfil === 'identity') {
      return {
        causa: 'lista grande con .gz: gzip_static always + gunzip on sirven el .gz descomprimido en streaming, sin Content-Range',
        artefacto: 'vps/nginx/live-baseline-2026-11-02/sites-enabled-default.PATCHED-206-dual.conf',
        cambio: 'gunzip off (y gzip_static on)',
        celdas: '+2'
      };
    }
    if (h.pata === '206' && h.perfil === 'gzip') {
      return {
        causa: 'lista pequena sin .gz: gzip dinamico comprime al vuelo y elimina el rango',
        artefacto: 'vps/nginx/live-baseline-2026-11-02/sites-enabled-default.PATCHED-206-dual.conf',
        cambio: 'gzip off en la location de listas',
        celdas: '+2'
      };
    }
    return { causa: 'no clasificado', artefacto: null, cambio: null, celdas: '?' };
  };

  const huecosConRemedio = huecos.map((h) => ({ ...h, ...remedio(h) }));

  // Agrupado por cambio: el operador decide por cambios, no por celdas.
  const porCambio = new Map();
  for (const h of huecosConRemedio) {
    const k = h.cambio || 'no clasificado';
    if (!porCambio.has(k)) porCambio.set(k, { cambio: k, artefacto: h.artefacto, celdas: [], causa: h.causa });
    porCambio.get(k).celdas.push(h.lista + ' / ' + h.pata + ' / ' + h.perfil);
  }

  const informe = {
    host: HOST,
    generado: new Date().toISOString(),
    criterio: '200 en GET completo · 206 en GET con Range · 302 exacto en HTTP plano, por perfil',
    resumen: {
      celdas: total,
      cumplen: ok,
      faltan: huecos.length,
      veredicto_gate: ok === total ? 'CUMPLE' : 'NO CUMPLE'
    },
    por_lista: filas.map(f => ({
      lista: f.lista,
      '200 identity': f['200 identity'],
      '200 gzip': f['200 gzip'],
      '206 identity': f['206 identity'],
      '206 gzip': f['206 gzip'],
      'redirect http': f['redirect http']
    })),
    huecos: huecosConRemedio,
    cambios_necesarios: [...porCambio.values()].map(c => ({
      cambio: c.cambio,
      artefacto: c.artefacto,
      causa: c.causa,
      celdas_que_arregla: c.celdas.length,
      detalle: c.celdas
    })),
    detalle: filas.map(f => ({ lista: f.lista, ...f.detalle }))
  };

  process.stdout.write(JSON.stringify(informe, null, 2) + '\n');
  if (argJson > 0 && process.argv[argJson + 1]) {
    fs.writeFileSync(process.argv[argJson + 1], JSON.stringify(informe, null, 2) + '\n');
  }

  // Resumen legible por stderr para que se vea sin parsear el JSON.
  process.stderr.write(`\n${ok}/${total} celdas del gate cumplen · veredicto: ${informe.resumen.veredicto_gate}\n`);
  for (const c of informe.cambios_necesarios) {
    process.stderr.write(`\n  CAMBIO: ${c.cambio}  (arregla ${c.celdas_que_arregla} celdas)\n`);
    process.stderr.write(`    causa: ${c.causa}\n`);
    process.stderr.write(`    artefacto: ${c.artefacto || 'sin artefacto'}\n`);
  }
  for (const f of informe.por_lista) {
    process.stderr.write(
      `  ${f.lista.padEnd(34)} ` +
      `200i=${String(f['200 identity']).padEnd(4)} 200g=${String(f['200 gzip']).padEnd(4)} ` +
      `206i=${String(f['206 identity']).padEnd(4)} 206g=${String(f['206 gzip']).padEnd(4)} ` +
      `redir=${f['redirect http']}\n`
    );
  }
  process.exit(ok === total ? 0 : 1);
})();
