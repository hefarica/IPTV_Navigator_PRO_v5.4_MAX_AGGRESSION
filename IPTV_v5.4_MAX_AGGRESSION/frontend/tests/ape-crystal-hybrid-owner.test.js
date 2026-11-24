/**
 * Integración del contrato ape.crystal.hybrid/1 + override del propietario.
 * Verifica que TODAS las resoluciones <8K se upscalan (max/P1.5/p=P1) y que
 * 8K se conserva (max8k/P0). El modo contrato (`upscaleAll=false`) se conserva.
 *
 * Ejecutar: node frontend/tests/ape-crystal-hybrid-owner.test.js
 */
'use strict';

const assert = require('assert');
const { CONFIG, seleccionarHibrido, seleccionarHibridoOwner } =
    require('../js/ape-v9/ape-crystal-hybrid.js');

const owner = (q) => seleccionarHibridoOwner(CONFIG, Object.assign({
    fuenteVerificada: true, solicitar4K: true, upscaleAll: true,
}, q));

// 1. Override: todo <8K -> max P1.5, p=P1, lienzo 4K.
for (const alto of [480, 544, 720, 1080, 2160]) {
    const d = owner({ ancho: alto === 2160 ? 3840 : 1920, alto });
    assert.strictEqual(d.ruta, 'max', 'alto=' + alto);
    assert.strictEqual(d.cartucho, 'P1.5', 'cartucho alto=' + alto);
    assert.strictEqual(d.parametrosPulse.p, 'P1', 'p alto=' + alto);
    assert.deepStrictEqual(d.lienzoObjetivoPx, [3840, 2160]);
    assert.strictEqual(d.ownerOverride, 'ALL_RESOLUTIONS_UPSCALE');
}
console.log('PASS all <8K -> max/P1.5/p=P1');

// 2. 8K se conserva en P0 (techo, no se degrada a 4K).
const k8 = owner({ ancho: 7680, alto: 4320 });
assert.strictEqual(k8.ruta, 'max8k');
assert.strictEqual(k8.cartucho, 'P0');
assert.strictEqual(k8.parametrosPulse.p, 'P0');
assert.deepStrictEqual(k8.lienzoObjetivoPx, [7680, 4320]);
console.log('PASS 8K -> max8k/P0');

// 3. Fuente no medida: el override también upscala (max/P1).
const unknown = owner({ alto: 0 });
assert.strictEqual(unknown.ruta, 'max');
assert.strictEqual(unknown.parametrosPulse.p, 'P1');
console.log('PASS unknown -> max/P1');

// 4. Modo contrato original: balanced/native y sin p.
const c = (q) => seleccionarHibrido(CONFIG, Object.assign({
    fuenteVerificada: true, solicitar4K: true, upscaleAll: false,
}, q));
const b = c({ ancho: 1920, alto: 1080, solicitar4K: false });
assert.strictEqual(b.ruta, 'balanced');
assert.strictEqual(b.cartucho, 'P3.5');
assert.deepStrictEqual(b.parametrosPulse, {});
const n = c({ ancho: 3840, alto: 2160 });
assert.strictEqual(n.ruta, 'native');
assert.deepStrictEqual(n.parametrosPulse, {});
console.log('PASS contract mode balanced/native without p');

console.log('OK — ape-crystal-hybrid owner tests');
