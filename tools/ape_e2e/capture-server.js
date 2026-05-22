/**
 * APE Header Validator E2E — Módulo 1: Servidor de Captura
 * =========================================================
 * Servidor HTTP local que actúa como "provider IPTV falso".
 * Captura los headers EXACTOS que llegan desde el cliente (curl/reproductor),
 * los almacena en memoria y responde con 200 OK + stream dummy.
 *
 * Uso: node capture-server.js [PORT]
 */

'use strict';

const http  = require('http');
const PORT  = parseInt(process.argv[2] || '18080', 10);

// Almacén en memoria: { requestId → { headers, order, timestamp, url } }
const capturedRequests = [];

const server = http.createServer((req, res) => {
  const captured = {
    requestId   : capturedRequests.length + 1,
    timestamp   : new Date().toISOString(),
    method      : req.method,
    url         : req.url,
    // Preservar el ORDEN exacto de los headers tal como llegan
    headersOrdered : Object.entries(req.headers).map(([k, v]) => ({ key: k, value: v })),
    // Mapa para búsqueda rápida (normalizado a minúsculas)
    headersMap  : req.headers,
    payloadSize : JSON.stringify(req.headers).length
  };

  capturedRequests.push(captured);

  // Responder con un stream TS dummy de 188 bytes (1 paquete TS nulo)
  const tsPacket = Buffer.alloc(188, 0xFF);
  tsPacket[0] = 0x47; // sync byte
  res.writeHead(200, {
    'Content-Type'  : 'video/mp2t',
    'Content-Length': tsPacket.length,
    'X-APE-Capture' : `req-${captured.requestId}`
  });
  res.end(tsPacket);
});

server.listen(PORT, '127.0.0.1', () => {
  // Señal para el proceso padre: servidor listo
  process.stdout.write(`CAPTURE_SERVER_READY:${PORT}\n`);
});

// API interna: exponer los requests capturados via señal SIGUSR1
process.on('SIGUSR1', () => {
  process.stdout.write('CAPTURED_DATA:' + JSON.stringify(capturedRequests) + '\n');
});

// Exportar para uso programático
module.exports = { server, capturedRequests, PORT };
