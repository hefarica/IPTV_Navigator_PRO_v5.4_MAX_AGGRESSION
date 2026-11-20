/* ═══════════════════════════════════════════════════════════════════════════
 * VERIFICACIÓN DE NO-REGRESIÓN DEL FLAG — APE_4K6K_AUDIT
 *
 * Herramienta de VERIFICACIÓN (no forma parte del producto). Mide, con el
 * adaptador REAL (frontend/js/ape-v9/ape-4k6k-audit-adapter.js):
 *
 *   A) flag = 0 (default): enrich(x) devuelve la MISMA referencia y el sha256
 *      del JSON de entrada == sha256 del JSON de salida (byte-identidad).
 *   B) flag = 1: diff EXACTO de campos contra la entrada (claves añadidas,
 *      eliminadas y valores cambiados), a nivel de canal y dentro de `rea`.
 *   C) la entrada original no se muta en ninguno de los dos modos.
 *
 * Uso:  node artifacts/integracion-4k6k/verificar_no_regresion_flag.js
 * Sale != 0 si alguna invariante falla.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const crypto = require('crypto');

const REPO = path.join(__dirname, '..', '..');
const ADAPTER = path.join(REPO, 'frontend/js/ape-v9/ape-4k6k-audit-adapter.js');
const api = require(ADAPTER);

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const J = (v) => JSON.stringify(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

let fails = 0;
function check(name, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : ' -> ' + J(detail).slice(0, 400)));
    if (!cond) fails++;
}

/* Fixture representativo: 3 canales con capas que NO se pueden tocar. */
function channel(over) {
    const ch = {
        id: 4177,
        tvg_id: 'ESPN-4K',
        name: 'ESPN 4K HDR',
        group: 'Deportes',
        ape_profile: 'P0',
        resolution: '7680x4320',
        codec: 'hvc1.2.4.L183.B0',
        url: 'https://cdn.example/live/espn4k/index.m3u8?u=abc123&d=eyJkZXYiOiJPTk4tNEsifQ&x=1',
        stream_inf: 'BANDWIDTH=80000000,RESOLUTION=7680x4320,CODECS="hvc1.2.4.L183.B0",VIDEO-RANGE=PQ',
        supp_codecs: 'dvh1.08.06',
        qoe: { p: 'P0' },
        lines: ['#EXTHTTP:{"User-Agent":"VLC/3.0"}', '#EXTSHIMOTT:{"ver":1,"id":"ESPN-4K","tgt":"display"}'],
        'x-unknown-field': { nested: [1, 2, { deep: true }] }
    };
    if (over) Object.keys(over).forEach((k) => { ch[k] = over[k]; });
    return ch;
}
const base = [
    channel(),
    channel({ id: 5001, tvg_id: 'DAZN-1080', ape_profile: 'P3', resolution: '1920x1080', qoe: { p: 'P3' } }),
    channel({ id: 5002, tvg_id: 'MUSIC-HD', ape_profile: 'P5', resolution: '1280x720', qoe: { p: 'P5' } })
];

/* Diff de campos de un canal, devolviendo listas ordenadas y estables. */
function diffChannel(inCh, outCh) {
    const keysIn = Object.keys(inCh), keysOut = Object.keys(outCh);
    const added = keysOut.filter((k) => keysIn.indexOf(k) < 0);
    const removed = keysIn.filter((k) => keysOut.indexOf(k) < 0);
    const changed = keysIn.filter((k) => keysOut.indexOf(k) >= 0 && J(inCh[k]) !== J(outCh[k]));
    return { added, removed, changed };
}
function diffTopLevel(outList, inList) {
    const added = {}, removed = [], changed = [], reaAdded = [], reaChanged = [];
    inList.forEach((inCh, i) => {
        const d = diffChannel(inCh, outList[i]);
        d.added.forEach((k) => { added[k] = (added[k] || 0) + 1; });
        d.removed.forEach((k) => removed.push(k + '@' + i));
        d.changed.forEach((k) => changed.push(k + '@' + i));
        if (inCh.rea && outList[i].rea) {
            Object.keys(outList[i].rea).forEach((k) => {
                if (!Object.prototype.hasOwnProperty.call(inCh.rea, k)) reaAdded.push(k);
            });
            Object.keys(inCh.rea).forEach((k) => {
                if (J(inCh.rea[k]) !== J(outList[i].rea[k]) && reaAdded.indexOf(k) < 0) reaChanged.push(k);
            });
        }
    });
    return { added, removed, changed, reaAdded: [...new Set(reaAdded)].sort(), reaChanged: [...new Set(reaChanged)].sort() };
}

console.log('══════════════════════════════════════════════════════════════════');
console.log('  NO-REGRESIÓN DEL FLAG · ' + path.basename(ADAPTER));
console.log('  sha256 adaptador: ' + sha256(require('fs').readFileSync(ADAPTER, 'utf8')));
console.log('══════════════════════════════════════════════════════════════════');

/* ── A. FLAG 0 ─────────────────────────────────────────────────────────── */
console.log('\nA) FLAG 0 — comportamiento previo byte-idéntico');
const frozenInput = JSON.parse(J(base));
global.APE_4K6K_AUDIT = 0;
const inBytes = J(frozenInput);
const off = api.enrich(frozenInput);
const outBytes = J(off);

check('isEnabled() === false con flag 0', api.isEnabled() === false);
check('enrich devuelve LA MISMA referencia (no copia)', off === frozenInput);
check('sha256(input JSON) === sha256(output JSON)', sha256(inBytes) === sha256(outBytes),
    [sha256(inBytes), sha256(outBytes)]);
check('la entrada queda intacta tras enrich', J(frozenInput) === inBytes);
const offAudit = api.audit(frozenInput);
check('audit() devuelve sobre inerte (enabled:false)', offAudit.enabled === false);
check('audit() no recorre la lista (sin campo channels)', offAudit.channels === undefined);

console.log('  MEDIDO  sha256(input)  = ' + sha256(inBytes));
console.log('  MEDIDO  sha256(output) = ' + sha256(outBytes));

/* ── B. FLAG 1 ─────────────────────────────────────────────────────────── */
console.log('\nB) FLAG 1 — diff EXACTO de campos');
global.APE_4K6K_AUDIT = 1;
const onInput = clone(base);
const onInBytes = J(onInput);
const on = api.enrich(onInput);
const d = diffTopLevel(on, base);

console.log('  claves AÑADIDAS por canal : ' + J(d.added));
console.log('  claves ELIMINADAS         : ' + J(d.removed));
console.log('  claves MODIFICADAS        : ' + J(d.changed));
console.log('  claves AÑADIDAS en rea    : ' + J(d.reaAdded));
console.log('  claves MODIFICADAS en rea : ' + J(d.reaChanged));

check('ON: sólo se añaden rea y APE-AUDIT-ORIGINAL',
    J(Object.keys(d.added).sort()) === J(['APE-AUDIT-ORIGINAL', 'rea']), d.added);
check('ON: ninguna clave eliminada', d.removed.length === 0, d.removed);
check('ON: ninguna clave previa modificada', d.changed.length === 0, d.changed);
check('ON: la entrada original NO se muta', J(onInput) === onInBytes);
check('ON: misma longitud de lista', on.length === base.length);
check('ON: el sha256 de la salida DIFIERE del de la entrada (efecto real medido)',
    sha256(onInBytes) !== sha256(J(on)));
check('ON: la 2ª pasada reproduce el mismo sha256 (idempotencia)',
    sha256(J(api.enrich(clone(on)))) === sha256(J(on)));

console.log('  MEDIDO  sha256(input ON)  = ' + sha256(onInBytes));
console.log('  MEDIDO  sha256(output ON) = ' + sha256(J(on)));

/* ── C. Restaurar flag ─────────────────────────────────────────────────── */
global.APE_4K6K_AUDIT = 0;
check('flag restaurado a 0 => isEnabled()===false', api.isEnabled() === false);

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  RESULTADO: ' + (fails === 0 ? 'PASS (0 fallos)' : 'FAIL (' + fails + ' fallos)'));
console.log('══════════════════════════════════════════════════════════════════');
process.exit(fails === 0 ? 0 : 1);
