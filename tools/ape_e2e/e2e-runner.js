/**
 * APE Header Validator E2E — Script Principal
 * ============================================
 * Orquesta la ejecución completa de la prueba E2E:
 * 1. Levanta el servidor de captura (fork).
 * 2. Parsea la lista M3U8 generada.
 * 3. Simula peticiones HTTP de un reproductor inyectando los headers declarados.
 * 4. Recupera los headers capturados por el servidor.
 * 5. Ejecuta el Sanity Validator.
 * 6. Genera un reporte Markdown detallado.
 *
 * Uso: node e2e-runner.js <m3u8_path> [report_path]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const { parseM3U8, redirectToCapture } = require('./m3u8-parser');
const { validateChannel } = require('./sanity-validator');

const M3U8_PATH = process.argv[2];
const REPORT_PATH = process.argv[3] || 'APE_E2E_Report.md';
const PORT = 18080;

if (!M3U8_PATH || !fs.existsSync(M3U8_PATH)) {
  console.error(`Error: Archivo M3U8 no encontrado -> ${M3U8_PATH}`);
  process.exit(1);
}

async function run() {
  console.log(`[1/5] Parseando M3U8: ${M3U8_PATH}`);
  // Parsear máximo 5 canales para la prueba E2E
  const channels = parseM3U8(M3U8_PATH, { maxChannels: 5 });
  console.log(`      Se extrajeron ${channels.length} canales con bloques #EXTHTTP.`);

  if (channels.length === 0) {
    console.error('Error: No se encontraron canales con bloques #EXTHTTP válidos.');
    process.exit(1);
  }

  console.log(`[2/5] Levantando Servidor de Captura en puerto ${PORT}...`);
  const captureProcess = spawn('node', [path.join(__dirname, 'capture-server.js'), PORT.toString()]);

  // Esperar a que el servidor esté listo
  await new Promise((resolve) => {
    captureProcess.stdout.on('data', (data) => {
      if (data.toString().includes('CAPTURE_SERVER_READY')) resolve();
    });
  });

  const targetChannels = redirectToCapture(channels, `http://127.0.0.1:${PORT}`);

  console.log(`[3/5] Simulando peticiones HTTP (Reproductor IPTV)...`);
  for (const ch of targetChannels) {
    await simulatePlayerRequest(ch);
  }

  console.log(`[4/5] Recuperando datos capturados...`);
  const capturedData = await getCapturedData(captureProcess);

  console.log(`[5/5] Ejecutando Validación E2E (Sanity Check)...`);
  const report = generateReport(channels, capturedData);

  fs.writeFileSync(REPORT_PATH, report);
  console.log(`\n✅ Prueba E2E finalizada. Reporte generado en: ${REPORT_PATH}`);

  captureProcess.kill();
  process.exit(0);
}

/**
 * Simula la petición HTTP que haría un reproductor (ej. ExoPlayer/VLC)
 * inyectando los headers parseados del bloque #EXTHTTP.
 */
function simulatePlayerRequest(channel) {
  return new Promise((resolve, reject) => {
    const declaredHeaders = channel.exthttp || {};
    // Añadir User-Agent si no está en exthttp pero está en kodiprop o es default
    if (!declaredHeaders['User-Agent'] && !declaredHeaders['user-agent']) {
      declaredHeaders['User-Agent'] = channel.kodiprop['http-user-agent'] || 'VLC/3.0.16 LibVLC/3.0.16';
    }

    const req = http.request(channel.url, {
      method: 'GET',
      headers: declaredHeaders
    }, (res) => {
      res.on('data', () => {}); // Consumir data
      res.on('end', resolve);
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Envía señal SIGUSR1 al proceso de captura y lee el JSON resultante.
 */
function getCapturedData(captureProcess) {
  return new Promise((resolve) => {
    captureProcess.stdout.on('data', (data) => {
      const str = data.toString();
      if (str.startsWith('CAPTURED_DATA:')) {
        const jsonStr = str.replace('CAPTURED_DATA:', '').trim();
        resolve(JSON.parse(jsonStr));
      }
    });
    captureProcess.kill('SIGUSR1');
  });
}

/**
 * Genera el reporte Markdown comparando declarados vs reales.
 */
function generateReport(channels, capturedData) {
  let md = `# Reporte de Validación E2E: Headers M3U8 vs Realidad\n\n`;
  md += `**Fecha:** ${new Date().toISOString()}\n`;
  md += `**Canales analizados:** ${channels.length}\n\n`;

  let totalPass = 0, totalFail = 0, totalCritical = 0;

  channels.forEach((ch, idx) => {
    const captured = capturedData[idx]; // Asumimos orden secuencial
    const result = validateChannel(ch, captured);

    totalPass += result.passed;
    totalFail += result.failed;
    totalCritical += result.p0Fails;

    md += `## Canal ${ch.index}: ${ch.name} (Tier: ${ch.tier})\n`;
    md += `- **Status:** ${result.status === 'PASS' ? '✅ PASS' : result.status === 'FAIL_WARN' ? '⚠️ WARN' : '🔴 CRITICAL FAIL'}\n`;
    md += `- **Score:** ${result.score}%\n\n`;

    md += `### Invariantes E2E\n`;
    md += `| ID | Invariante | Resultado | Detalle |\n`;
    md += `|---|---|---|---|\n`;

    result.checks.forEach(chk => {
      const icon = chk.pass ? '✅' : (chk.severity === 'P0' ? '🔴' : '⚠️');
      md += `| ${chk.id} | ${chk.name} | ${icon} | ${chk.detail} |\n`;
    });
    md += `\n`;
  });

  md += `## Resumen Global\n`;
  md += `- **Invariantes Aprobados:** ${totalPass}\n`;
  md += `- **Invariantes Fallidos:** ${totalFail}\n`;
  md += `- **Fallos Críticos (P0):** ${totalCritical}\n\n`;

  if (totalCritical > 0) {
    md += `> **⚠️ ALERTA:** Se detectaron fallos críticos (P0). Los headers que llegan al servidor NO coinciden con los declarados o violan reglas anti-bot. Revisa los detalles arriba.\n`;
  } else {
    md += `> **✅ ÉXITO:** Todos los invariantes críticos pasaron. El generador está inyectando headers seguros y coherentes que sobreviven intactos hasta el servidor.\n`;
  }

  return md;
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
