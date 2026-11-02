#!/usr/bin/env node
/**
 * http_matrix.js — matriz HTTP de las listas servidas, por TIPO DE CLIENTE.
 * Solo lectura: GET/HEAD con Range. No escribe nada en el servidor.
 *
 * La matriz anterior medía un único perfil de cliente y por eso concluyó que
 * "ninguna lista da 206 a un cliente sin gzip", que es falso: mide el eje
 * equivocado. Un cliente con gzip y uno sin gzip son dos casos distintos y
 * las dos configuraciones de lista sirven a uno de los dos, no a ambos.
 */
const https = require('https');

const BASE = 'https://iptv-ape.duckdns.org/lists/';
const LISTAS = [
  'APE_LISTA_1793589060441.m3u8',
  'APE_LISTA_1793558303852_CDN.m3u8',
  'APE_PRUEBA_ORDER_OK.m3u8',
  'APE_PRUEBA_PERFILES.m3u8',
];

function pedir(url, { method = 'GET', gzip = false, range = true } = {}) {
  return new Promise((res) => {
    const headers = {};
    if (range) headers.Range = 'bytes=0-1023';
    if (gzip) headers['Accept-Encoding'] = 'gzip';
    // sin la cabecera, Node no pide gzip por su cuenta
    if (!gzip) headers['Accept-Encoding'] = 'identity';

    const req = https.request(url, { method, headers, timeout: 30000 }, (r) => {
      const h = r.headers;
      const out = {
        status: r.statusCode,
        content_range: h['content-range'] || null,
        content_length: h['content-length'] || null,
        content_encoding: h['content-encoding'] || null,
        transfer_encoding: h['transfer-encoding'] || null,
        accept_ranges: h['accept-ranges'] || null,
        vary: h.vary || null,
      };
      r.resume();
      r.on('end', () => res(out));
    });
    req.on('timeout', () => { req.destroy(); res({ error: 'timeout' }); });
    req.on('error', (e) => res({ error: e.code || e.message }));
    req.end();
  });
}

const veredicto = (o) => {
  if (o.error) return `ERROR ${o.error}`;
  if (o.status === 206 && o.content_range) return '206 ✓';
  if (o.status === 200 && o.content_encoding === 'gzip') return '200 (gzip dinamico)';
  if (o.status === 200 && o.transfer_encoding) return '200 chunked';
  if (o.status === 200) return '200';
  return String(o.status);
};

(async () => {
  const filas = [];
  for (const nombre of LISTAS) {
    const url = BASE + nombre;
    const sinGzip = await pedir(url, { gzip: false });
    const conGzip = await pedir(url, { gzip: true });
    const headSin = await pedir(url, { gzip: false, method: 'HEAD' });

    // Tamano por representacion. Antes solo se miraba la respuesta identity y, cuando
    // esa viene 200 chunked (gunzip al vuelo), el tamano salia "?" justo en las listas
    // grandes, que son donde el tamano decide si conviene tocar la configuracion.
    // El 604 MB plano y el .gz pregenerado son representaciones distintas del mismo
    // fichero: se reportan por separado en vez de colapsarlas en una cifra.
    const delRange = (o) => (o && o.content_range ? o.content_range.split('/')[1] : null);
    const bytes_identity = delRange(sinGzip) || sinGzip.content_length || headSin.content_length || null;
    const bytes_gzip = delRange(conGzip) || (conGzip.content_encoding === 'gzip' ? conGzip.content_length : null) || null;
    const kbytes = bytes_identity || bytes_gzip || '?';

    filas.push({
      lista: nombre,
      bytes: kbytes,
      'Range sin gzip': veredicto(sinGzip),
      'Range con gzip': veredicto(conGzip),
      contentType_sin: sinGzip.content_encoding || 'identity',
      bytes_identity,
      bytes_gzip,
      ratio_si_ambos: bytes_identity && bytes_gzip
        ? Number((Number(bytes_gzip) / Number(bytes_identity)).toFixed(3))
        : null,
    });
  }

  process.stdout.write(JSON.stringify(filas, null, 2) + '\n');

  // Resumen: qué cliente recibe 206 en cada lista
  const resumen = filas.map((f) => ({
    lista: f.lista,
    gzip206: f['Range con gzip'] === '206 ✓',
    nogzip206: f['Range sin gzip'] === '206 ✓',
  }));
  const ambos = resumen.filter((r) => r.gzip206 && r.nogzip206).length;
  process.stderr.write(
    `\nListas que dan 206 a AMBOS tipos de cliente: ${ambos}/${LISTAS.length}\n`
  );
  for (const r of resumen) {
    process.stderr.write(
      `  ${r.lista.padEnd(38)} gzip=${r.gzip206 ? '206' : 'NO'}  sin-gzip=${r.nogzip206 ? '206' : 'NO'}\n`
    );
  }
})();
