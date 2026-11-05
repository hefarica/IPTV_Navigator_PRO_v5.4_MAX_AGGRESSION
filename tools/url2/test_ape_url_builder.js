#!/usr/bin/env node
/**
 * test_ape_url_builder.js — las tres propiedades, medidas contra el VPS real
 *
 * No basta con que el código "parezca" idempotente. Cada propiedad se prueba con un
 * número o con una respuesta HTTP del endpoint en producción.
 *
 *   IDEMPOTENCIA   misma entrada ⇒ misma URL, incluso tras cruzar un minuto
 *   ISOMORFISMO    parse(build(x)) recupera x, y build(parse(url)) devuelve la misma url
 *   POLIMORFISMO   la misma petición cambia de forma con el device y con la red
 *
 * Uso: node tools/url2/test_ape_url_builder.js [--live]
 *      --live  además pide la URL a iptv-ape.duckdns.org y comprueba 200 + perfil
 */

'use strict';

const { ApeUrlBuilder, ApeUrl } = require('./ape-url-builder.js');
const { execSync } = require('child_process');

const LIVE = process.argv.indexOf('--live') >= 0;
const CH = {
    url: 'http://line.tivi-ott.net/live/3JHFTC/U56BDP/208.m3u8',
    channelName: 'Sports 4K',
    channelId: 208,
};

let pass = 0, fail = 0;
const ok = (nombre, cond, detalle) => {
    if (cond) { pass++; console.log('  PASS  ' + nombre + (detalle ? '  ' + detalle : '')); }
    else { fail++; console.log('  FAIL  ' + nombre + (detalle ? '  ' + detalle : '')); }
};

// ══════════════════════════════════════════════════════════════════════════
// 1 · IDEMPOTENCIA
// ══════════════════════════════════════════════════════════════════════════
console.log('=== 1 · IDEMPOTENCIA: f(x) = f(f(x)) ===');

const base = Object.assign({}, CH, { deviceType: 'firestick-4k-max', networkTier: 'good' });
const u1 = ApeUrlBuilder.build(base);
const u2 = ApeUrlBuilder.build(base);
const u3 = ApeUrlBuilder.build(base);

ok('3 llamadas dan la misma URL', u1.url === u2.url && u2.url === u3.url);
ok('mismo seed', u1.seed === u2.seed && u2.seed === u3.seed, 'seed=' + u1.seed);
ok('mismo fingerprint', u1.fingerprint === u2.fingerprint, 'fp=' + u1.fingerprint);

// El defecto de la v9.2.0: la URL cambiaba al cruzar el minuto. Se simula el salto.
const realNow = Date.now;
Date.now = () => realNow() + 3600 * 1000;   // una hora después
const uTarde = ApeUrlBuilder.build(base);
Date.now = realNow;

ok('una hora después, MISMA URL', u1.url === uTarde.url,
    u1.url === uTarde.url ? '' : 'seed ' + u1.seed + ' != ' + uTarde.seed);

// El orden de las claves del objeto de entrada no debe alterar la URL.
const reordenado = {
    networkTier: 'good',
    channelId: 208,
    deviceType: 'firestick-4k-max',
    channelName: 'Sports 4K',
    url: CH.url,
};
const uReordenado = ApeUrlBuilder.build(reordenado);
ok('orden de claves distinto ⇒ misma URL', u1.url === uReordenado.url);

// Una entrada distinta SÍ debe producir otra URL: la idempotencia no es rigidez.
const otroCanal = ApeUrlBuilder.build(Object.assign({}, base, { url: CH.url.replace('208', '209') }));
ok('otro canal ⇒ otra URL', u1.url !== otroCanal.url);

// `salt` es la única vía legítima de variación deliberada.
const conSalt = ApeUrlBuilder.build(Object.assign({}, base, { salt: 'v2' }));
ok('con salt explícito ⇒ otra URL', u1.url !== conSalt.url, 'y es intencional');

// ══════════════════════════════════════════════════════════════════════════
// 2 · ISOMORFISMO
// ══════════════════════════════════════════════════════════════════════════
console.log('');
console.log('=== 2 · ISOMORFISMO: URL ↔ estado, sin pérdida ===');

const p = ApeUrlBuilder.parse(u1.url);
ok('la URL parsea como válida', p.valid === true, 'fp esperado=' + p.expected_fp + ' real=' + p.actual_fp);
ok('recupera la URL origen verbatim', p.state.url === CH.url);
ok('recupera el nombre', p.state.name === 'Sports 4K', JSON.stringify(p.state.name));
ok('recupera el id', String(p.state.id) === '208', String(p.state.id));
ok('recupera el perfil', p.state.profile === 'P1', p.state.profile);
ok('decodifica el device', p.state.device && p.state.device.type === 'firestick-4k-max',
    p.state.device ? JSON.stringify(p.state.device) : 'null');
ok('el device trae soc/ram/res/fps/hdr',
    p.state.device && p.state.device.soc === 'mediatek-mt8696' && p.state.device.ram === 2048 &&
    p.state.device.width === 3840 && p.state.device.height === 2160 && p.state.device.fps === 60,
    p.state.device ? [p.state.device.soc, p.state.device.ram, p.state.device.width + 'x' + p.state.device.height, p.state.device.fps].join(' ') : '');

// Ida y vuelta completa: build(parse(url)) === url
const rebuilt = ApeUrlBuilder.build({
    url: p.state.url,
    deviceType: p.state.device.type,
    channelName: p.state.name,
    channelId: p.state.id,
    logo: p.state.logo,
});
ok('build(parse(url)) === url', rebuilt.url === u1.url);

// Una URL manipulada debe fallar la verificación, no pasar en silencio.
const manipulado = u1.url.replace('id=208', 'id=999');
const pMan = ApeUrlBuilder.parse(manipulado);
ok('URL manipulada ⇒ valid:false', pMan.valid === false, 'fp real=' + pMan.actual_fp + ' vs ' + pMan.expected_fp);

// Basura no debe lanzar.
const pBasura = ApeUrlBuilder.parse('no-es-una-url');
ok('entrada basura ⇒ no lanza, valid:false', pBasura.valid === false && pBasura.error === 'url_no_valida');

// ══════════════════════════════════════════════════════════════════════════
// 3 · POLIMORFISMO
// ══════════════════════════════════════════════════════════════════════════
console.log('');
console.log('=== 3 · POLIMORFISMO: la misma petición cambia de forma ===');

const devices = ['shield-tv', 'firestick-4k-max', 'onn-4k', 'firestick-4k', 'firestick-lite', 'generic'];
const perfiles = {};
for (const d of devices) {
    const u = ApeUrlBuilder.build(Object.assign({}, CH, { deviceType: d, networkTier: 'good' }));
    perfiles[d] = u.state.profile;
    console.log('    ' + d.padEnd(20) + ' -> ' + u.state.profile + '   (' + u.state.reason + ')');
}
ok('el device cambia el perfil', new Set(Object.values(perfiles)).size >= 3,
    new Set(Object.values(perfiles)).size + ' perfiles distintos');
ok('Shield (DV, 3 GB) recibe P0', perfiles['shield-tv'] === 'P0', perfiles['shield-tv']);
ok('Fire TV Lite (1080p) recibe P4', perfiles['firestick-lite'] === 'P4', perfiles['firestick-lite']);

// La red degrada sin mentir sobre el device.
const bueno = ApeUrlBuilder.build(Object.assign({}, CH, { deviceType: 'shield-tv', networkTier: 'excellent' }));
const malo = ApeUrlBuilder.build(Object.assign({}, CH, { deviceType: 'shield-tv', networkTier: 'poor' }));
console.log('    shield-tv excellent -> ' + bueno.state.profile + '   (' + bueno.state.reason + ')');
console.log('    shield-tv poor      -> ' + malo.state.profile + '   (' + malo.state.reason + ')');
ok('red pobre baja el perfil', malo.state.profile !== bueno.state.profile,
    bueno.state.profile + ' -> ' + malo.state.profile);
ok('red pobre NO cambia el device declarado',
    malo.state.deviceB64 === bueno.state.deviceB64 || (() => {
        const a = ApeUrlBuilder.parse(bueno.url).state.device;
        const b = ApeUrlBuilder.parse(malo.url).state.device;
        return a && b && a.type === b.type && a.soc === b.soc && a.ram === b.ram;
    })(),
    'el SoC sigue siendo tegra-x1 en ambos');

// forceProfile manda sobre la red.
const forzado = ApeUrlBuilder.build(Object.assign({}, CH, { deviceType: 'shield-tv', networkTier: 'poor', forceProfile: true }));
ok('forceProfile ignora la red', forzado.state.profile === 'P0', forzado.state.profile);

// ══════════════════════════════════════════════════════════════════════════
// 4 · HONESTIDAD DE LOS CÓDIGOS
// ══════════════════════════════════════════════════════════════════════════
console.log('');
console.log('=== 4 · HONESTIDAD: qué código promete cada variante ===');

const redirect = u1.toRedirectUrl();
ok('toRedirectUrl añade mode=redirect', /mode=redirect/.test(redirect));
const rangeHint = u1.toRangeHintUrl();
ok('toRangeHintUrl añade range', /range=0-4095/.test(rangeHint));
console.log('    NOTA: el endpoint responde 200 completo a la variante range; un manifiesto');
console.log('          generado no tiene fichero que trocear. No se promete 206.');

// ══════════════════════════════════════════════════════════════════════════
// 5 · CONTRA EL VPS REAL (opcional)
// ══════════════════════════════════════════════════════════════════════════
if (LIVE) {
    console.log('');
    console.log('=== 5 · CONTRA PRODUCCIÓN ===');
    for (const d of ['shield-tv', 'firestick-4k-max', 'firestick-lite']) {
        const u = ApeUrlBuilder.build(Object.assign({}, CH, { deviceType: d, networkTier: 'good' }));
        let http = '000', perfilServido = '?', nivel = '?';
        try {
            const out = execSync(
                'curl.exe -sS -D - -o - "' + u.url + '"',
                { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
            );
            http = (out.match(/^HTTP\/[\d.]+ (\d{3})/m) || [])[1] || '000';
            perfilServido = (out.match(/^#EXT-X-APE-URL2-CARTRIDGE:.*?PROFILE=(P\d)/m) || [])[1] || '?';
            nivel = (out.match(/REALCE-SOURCE:[^;]*;OBS_BPS=\d+;NIVEL=(\d)/) || [])[1] || '?';
        } catch (e) {
            http = 'ERR';
        }
        const esperado = u.state.profile;
        ok(d + ' servido con el perfil pedido', http === '200' && perfilServido === esperado,
            'http=' + http + ' pedido=' + esperado + ' servido=' + perfilServido + ' nivel=' + nivel);
    }
}

// ══════════════════════════════════════════════════════════════════════════
console.log('');
console.log('────────────────────────────────────────');
console.log('  PASS: ' + pass + '   FAIL: ' + fail);
console.log('────────────────────────────────────────');
process.exit(fail === 0 ? 0 : 1);
