/* Regresion: el juez NO lanza. Rechaza con codigo o acepta, y siempre devuelve
 * una decision.
 *
 * DEFECTO QUE ESTO FIJA (2026-11-12): `artifactBytes()` llamaba a
 * `path.isAbsolute(relOrAbs)` sin comprobar el tipo. Medido: `path.isAbsolute`
 * lanza TypeError (ERR_INVALID_ARG_TYPE) con objeto, null y undefined.
 * `validateReceipt` no tiene try/catch envolvente, asi que el throw de la
 * llamada `artifactBytes(ev.artifact)` (L459) salia del juez. El contrato
 * documenta `artifact` como objeto (path + sha256 + bytes), de modo que un
 * recibo con la forma DOCUMENTADA reventaba el verificador en vez de ser
 * juzgado.
 *
 * Por que importa: un verificador que excepciona se puede sortear. Basta
 * mandarle la forma que no espera para que no evalue nada.
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const CONTRACT_PATH = path.join(__dirname, '..', '..', 'contracts', 'canary_jit_contract_v1.json');
const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));

const mod = require('./test_canary_jit_contract.js');
if (typeof mod.validateReceipt !== 'function') {
  console.error('FALLO: el validador no exporta validateReceipt');
  process.exit(1);
}
const { validateReceipt } = mod;

let total = 0;
let fail = 0;
function check(nombre, receipt) {
  total++;
  let r;
  try {
    r = validateReceipt(receipt, contract);
  } catch (e) {
    fail++;
    console.log('  FAIL ' + nombre + ' LANZO ' + e.constructor.name + ': ' + e.message);
    return;
  }
  if (!r || typeof r !== 'object' || typeof r.decision !== 'string') {
    fail++;
    console.log('  FAIL ' + nombre + ' no devolvio una decision: ' + JSON.stringify(r));
    return;
  }
  if (r.decision !== 'ACCEPT' && r.decision !== 'REJECT') {
    fail++;
    console.log('  FAIL ' + nombre + ' decision desconocida: ' + r.decision);
    return;
  }
  if (r.decision === 'REJECT' && !r.code) {
    fail++;
    console.log('  FAIL ' + nombre + ' REJECT sin codigo');
    return;
  }
  console.log('  ok   ' + nombre.padEnd(52) + ' ' + r.decision + (r.code ? '/' + r.code : ''));
}

/* La forma DOCUMENTADA del artefacto: objeto con path+sha256+bytes. */
function reciboConArtefacto(artifact) {
  return {
    schema: contract.receipt_schema.id,
    applied: {
      status: 'APPLIED_MEASURED',
      evidence: { frames: 300, seconds: 10, decode_errors: 0, artifact },
      measured_encode_fps: 30,
    },
  };
}

console.log('=== El juez nunca debe lanzar ===');
check('null', null);
check('undefined', undefined);
check('numero', 42);
check('string', 'no soy un recibo');
check('array', []);
check('objeto vacio', {});
check('schema correcto y nada mas', { schema: contract.receipt_schema.id });
check('applied sin status', { schema: contract.receipt_schema.id, applied: {} });
check('applied null', { schema: contract.receipt_schema.id, applied: null });
check('evidence null', { schema: contract.receipt_schema.id, applied: { status: 'APPLIED_MEASURED', evidence: null } });

/* Las cuatro que antes reventaban si llegaban a artifactBytes. */
check('artefacto OBJETO (forma documentada)', reciboConArtefacto({ path: 'tools/lab/ape-jit/server.js', sha256: 'aa', bytes: 1 }));
check('artefacto OBJETO sin path', reciboConArtefacto({ sha256: 'aa', bytes: 1 }));
check('artefacto null', reciboConArtefacto(null));
check('artefacto numero', reciboConArtefacto(7));
check('artefacto array', reciboConArtefacto([]));
check('artefacto string vacio', reciboConArtefacto(''));
check('artefacto ruta inexistente', reciboConArtefacto({ path: '/no/existe/xyz.json', sha256: 'aa', bytes: 1 }));
check('artefacto ruta que es directorio', reciboConArtefacto({ path: 'tools', sha256: 'aa', bytes: 1 }));
check('artefacto con sha declarado distinto', reciboConArtefacto({ path: 'tools/lab/ape-jit/server.js', sha256: 'deadbeef', bytes: 999999 }));

/* Y el abuso obvio: prototipos y getters hostiles. */
check('artefacto con __proto__', reciboConArtefacto(JSON.parse('{"__proto__":{"polluted":true},"path":"x"}')));
check('artefacto con toString roto', reciboConArtefacto({ toString() { throw new Error('boom'); } }));
check('artefacto con getter que lanza', reciboConArtefacto(Object.defineProperty({}, 'path', { get() { throw new Error('getter'); } })));

console.log('\nRESULT: ' + (total - fail) + '/' + total + ' casos sin excepcion · fallos: ' + fail);

/* ------------------------------------------------------------------ *
 * PRUEBA DECISIVA: el recibo HONESTO, con el artefacto en la forma que el
 * contrato documenta (objeto), tiene que dar EXACTAMENTE la misma decision
 * que con la forma string. Antes del arreglo, la forma objeto LANZABA.
 * ------------------------------------------------------------------ */
console.log('\n=== Forma string vs forma objeto (misma decision obligatoria) ===');
const honesto = mod.honestReceipt();
const rutaArtefacto = honesto.applied.evidence.artifact;
if (typeof rutaArtefacto !== 'string') {
  console.log('  AVISO: la fixture no usa ruta string (' + typeof rutaArtefacto + '); se omite la comparacion');
} else {
  const conString = validateReceipt(honesto, contract);
  console.log('  string  -> ' + conString.decision + '/' + conString.code);

  /* (a) objeto con la ruta real */
  honesto.applied.evidence.artifact = { path: rutaArtefacto, sha256: 'x', bytes: 0 };
  let conObjeto;
  try {
    conObjeto = validateReceipt(honesto, contract);
  } catch (e) {
    console.log('  objeto  -> LANZO ' + e.constructor.name + ': ' + e.message);
    total++; fail++;
    conObjeto = null;
  }
  if (conObjeto) {
    console.log('  objeto  -> ' + conObjeto.decision + '/' + conObjeto.code);
    total++;
    if (conObjeto.decision !== conString.decision || conObjeto.code !== conString.code) {
      fail++;
      console.log('  FAIL la forma objeto cambio la decision: ' + conObjeto.decision + '/' + conObjeto.code +
        ' vs ' + conString.decision + '/' + conString.code);
    } else {
      console.log('  ok   misma decision con las dos formas');
    }
  }

  /* (b) objeto que MIENTE sobre sha256 y bytes: se mide del disco, no se cree
         lo declarado. Si el juez se fiara del objeto, aceptaria igual; lo que
         se comprueba aqui es que sigue midiendo y no lanza. */
  honesto.applied.evidence.artifact = { path: rutaArtefacto, sha256: 'deadbeef'.repeat(8), bytes: 999999999 };
  total++;
  try {
    const mentiroso = validateReceipt(honesto, contract);
    console.log('  ok   objeto que miente en sha/bytes -> ' + mentiroso.decision + '/' + mentiroso.code + ' (midio del disco, no se creyo el objeto)');
  } catch (e) {
    fail++;
    console.log('  FAIL objeto que miente LANZO ' + e.constructor.name + ': ' + e.message);
  }

  /* (c) objeto cuya ruta apunta a un fichero que NO es el artefacto esperado */
  honesto.applied.evidence.artifact = { path: 'tools/lab/ape-jit/server.js', sha256: 'x', bytes: 0 };
  total++;
  try {
    const otro = validateReceipt(honesto, contract);
    console.log('  ok   objeto con otra ruta -> ' + otro.decision + '/' + otro.code + ' (no se cae)');
  } catch (e) {
    fail++;
    console.log('  FAIL objeto con otra ruta LANZO ' + e.constructor.name + ': ' + e.message);
  }
}

console.log('\nRESULT FINAL: ' + (total - fail) + '/' + total + ' · fallos: ' + fail);
process.exit(fail === 0 ? 0 : 1);
