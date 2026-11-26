#!/usr/bin/env node
/* Inyector idempotente de la linea #EXT-X-APE-QOE-CONTRACT por canal.
 *
 * POR QUE EXISTE: el contrato de QoE vive en un tag propio, NO en un
 * #EXTSHIMOTT nuevo (ese ya tiene esquema ape.extshimott.v1 y additivo).
 * Emite UNA linea compacta por canal, justo tras el #EXTINF, con los knobs
 * que el controlador /prisma/api/qoe-controller.php ya sirve.
 *
 * Idempotente: si el bloque ya la tiene, no la duplica.
 * --dry-run: cuenta y estima bytes sin escribir.
 *
 * uso: node tools/ape_qoe_contract_inject.js <entrada.m3u8> [salida.m3u8] [--dry-run]
 */
'use strict';
const fs = require('fs'), rl = require('readline');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const dry = process.argv.includes('--dry-run');
const inp = args[0], out = args[1];
if (!inp) { console.error('falta entrada'); process.exit(2); }

function contract(tvgId, name, idx) {
  const ch = String(tvgId || ('ch' + idx)).replace(/[^A-Za-z0-9_.-]/g, '') || ('ch' + idx);
  /* knobs del heuristico: se eligen en runtime por jit/loss; aqui van los
   * valores base que el controlador confirma o corrige. */
  return '#EXT-X-APE-QOE-CONTRACT:{"ch":"' + ch + '","v":1,"net":{"depth":3,"pb":3,"fm":2,"probe":200},'
       + '"cad":{"m":"fixed","v":"cfr"},"ott":{"hw":1,"hc":1,"mcr":2,"mmp":0},"jit":"/prisma/api/qoe-controller.php","truth":"DECLARED"}';
}

(async () => {
  const r = rl.createInterface({ input: fs.createReadStream(inp, { encoding: 'utf8' }), crlfDelay: Infinity });
  const lines = [];
  let chan = 0, injected = 0, skipped = 0, bytes = 0, pendingExtinf = null, lastHadTag = false;

  for await (const line of r) {
    if (line.startsWith('#EXTINF')) {
      pendingExtinf = line;
      chan++;
      lines.push(line);
      const m = line.match(/tvg-id="([^"]*)"/);
      const nm = (line.split(',').pop() || '').trim();
      pendingExtinf = { id: m ? m[1] : '', name: nm };
      lastHadTag = false;
      continue;
    }
    if (pendingExtinf && line.startsWith('#EXT-X-APE-QOE-CONTRACT')) { lastHadTag = true; skipped++; lines.push(line); continue; }
    if (pendingExtinf && line.trim() && line[0] !== '#' && !lastHadTag) {
      const tag = contract(pendingExtinf.id, pendingExtinf.name, chan);
      lines.push(tag); injected++; bytes += Buffer.byteLength(tag, 'utf8') + 1;
      pendingExtinf = null;
      lines.push(line);
      continue;
    }
    if (pendingExtinf && line.trim() && line[0] !== '#' && lastHadTag) { pendingExtinf = null; }
    lines.push(line);
  }
  r.close();

  const payload = lines.join('\n') + '\n';
  if (dry) {
    console.log('DRY-RUN canales=' + chan + ' a_inyectar=' + injected + ' ya_tenian=' + skipped
      + ' bytes_extra=' + bytes + ' salida_estimada=' + (fs.statSync(inp).size + bytes));
    return;
  }
  if (!out) { console.error('falta salida'); process.exit(2); }
  fs.writeFileSync(out, payload, 'utf8');
  console.log('INJECTED canales=' + chan + ' inyectados=' + injected + ' ya_tenian=' + skipped
    + ' bytes_extra=' + bytes + ' bytes_salida=' + fs.statSync(out).size);
})();

