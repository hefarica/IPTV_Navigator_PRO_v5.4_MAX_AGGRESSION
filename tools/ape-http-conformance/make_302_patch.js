'use strict';
// Genera el parche 302 a partir del baseline REAL, con un solo cambio verificado.
// Uso: node tools/ape-http-conformance/make_302_patch.js <baseline.conf> <salida.conf>
const fs = require('fs');

const [, , src, dst] = process.argv;
if (!src || !dst) {
  process.stderr.write('uso: node make_302_patch.js <baseline.conf> <salida.conf>\n');
  process.exit(3);
}

const ORIGINAL = 'return 301 https://$host$request_uri;';
const PARCHEADO = 'return 302 https://$host$request_uri;';

let t = fs.readFileSync(src, 'utf8');

const n301 = t.split(ORIGINAL).length - 1;
if (n301 !== 1) {
  process.stderr.write(`ABORTA: se esperaba exactamente 1 "${ORIGINAL}", hay ${n301}\n`);
  process.exit(4);
}

t = t.replace(ORIGINAL, PARCEADO_SAFE());

function PARCEADO_SAFE() { return PARCHEADO; }

const cabecera = [
  '# PARCHE 302 — copia del baseline real con UN solo cambio.',
  '#   linea original : ' + ORIGINAL,
  '#   linea parcheada: ' + PARCHEADO,
  '# Motivo: 301 es permanente y los clientes/players lo cachean indefinidamente; 302 es temporal',
  '# y no se cachea por defecto. El requisito del operador pide 302 en todas las configuraciones.',
  '# Alcance: vive en el server del puerto 80. Los 200 y 206 se sirven en el server del 443, que',
  '# este parche NO toca, asi que por construccion no puede romper esa pata.',
  '# Reversible: copiar el baseline encima, nginx -t, reload.',
  ''
].join('\n');

fs.writeFileSync(dst, cabecera + '\n' + t);

const out = fs.readFileSync(dst, 'utf8');
// Solo se cuentan DIRECTIVAS: las lineas comentadas documentan el cambio y no son configuracion.
// Contarlas haria que el comprobador se midiera a si mismo, que es como no comprobar nada.
const directivas = out.split('\n').filter((l) => {
  const s = l.trim();
  return s !== '' && !s.startsWith('#');
});
const c301 = directivas.filter((l) => l.includes('return 301 ')).length;
const c302 = directivas.filter((l) => l.includes('return 302 ')).length;

process.stdout.write(JSON.stringify({
  baseline: src,
  salida: dst,
  return_301_restantes: c301,
  return_302: c302,
  bytes_baseline: fs.statSync(src).size,
  bytes_salida: fs.statSync(dst).size,
  lineas_de_directiva: directivas.length,
  cambio_unico: c301 === 0 && c302 === 1
}, null, 2) + '\n');

process.exit(c301 === 0 && c302 === 1 ? 0 : 4);
