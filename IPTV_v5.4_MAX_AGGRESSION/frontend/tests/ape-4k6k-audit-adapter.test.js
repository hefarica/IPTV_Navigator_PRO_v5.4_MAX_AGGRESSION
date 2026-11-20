/* ═══════════════════════════════════════════════════════════════════════════
 * APE 4K / PREMIUM-6K AUDIT ADAPTER — SUITE AUTÓNOMA (node, sin red, sin DOM)
 *
 * Prueba el código REAL (frontend/js/ape-v9/ape-4k6k-audit-adapter.js) contra
 * los contratos REALES del repo:
 *   · artifacts/integracion-4k6k/SPEC_ADAPTADOR.md   (§1.2 §1.3 §1.6 §4 §6)
 *   · contracts/extshimott_contract.json             (additionalProperties=false)
 *   · frontend/js/ape-v9/ape-profiles-config.js:6584 (window.APE_PROFILES_CONFIG)
 *   · rea-export-finalizer.js:404 (_apeQoeNet · QoE.p separado del perfil visual)
 *
 * GOLDEN PRIORITARIO: con APE_4K6K_AUDIT=0 (DEFAULT) la salida debe ser
 * byte-idéntica a la entrada. Se prueba con la entrada CONGELADA (Object.freeze
 * profundo): cualquier intento de escritura lanza en 'use strict'.
 *
 * Uso:  node frontend/tests/ape-4k6k-audit-adapter.test.js
 * Sale con código != 0 si falla algún caso.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const FRONT = path.join(__dirname, '..');
const REPO_ROOT = path.join(FRONT, '..', '..');
const ADAPTER = path.join(FRONT, 'js/ape-v9/ape-4k6k-audit-adapter.js');
const CONFIG = path.join(FRONT, 'js/ape-v9/ape-profiles-config.js');
const EXTSHIMOTT_CONTRACT = path.join(REPO_ROOT, 'contracts', 'extshimott_contract.json');

global.window = global;
function stubGlobal(name, value) {
    try { Object.defineProperty(global, name, { value: value, configurable: true, writable: true }); }
    catch (_) { /* el stub ya existe y sirve */ }
}
stubGlobal('navigator', { userAgent: 'node-ape-4k6k-adapter' });
stubGlobal('localStorage', { getItem() { return null; }, setItem() { }, removeItem() { } });

let pass = 0, fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else {
        fail++;
        console.log('  FAIL  ' + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail).slice(0, 400) : ''));
    }
}
function section(title) { console.log('\n── ' + title + ' ' + '─'.repeat(Math.max(0, 62 - title.length))); }

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const J = (v) => JSON.stringify(v);
function deepFreeze(o) {
    if (!o || typeof o !== 'object' || Object.isFrozen(o)) return o;
    Object.getOwnPropertyNames(o).forEach(k => deepFreeze(o[k]));
    return Object.freeze(o);
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }

const api = require(ADAPTER);

/* ═══════════════════════════════════════════════════════════════════════════
 * FIXTURES
 * ═══════════════════════════════════════════════════════════════════════════ */
const D_B64 = Buffer.from(JSON.stringify({ dev: 'ONN-4K', soc: 'amlogic', h: 2160 }), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const EXTSHIMOTT_PAYLOAD = {
    ver: 1, id: 'ESPN-4K', v: 'hvc1.2.4.L153.B0', a: 'mp4a.40.2',
    hdr: 'PQ', flt: 'nlmeans,unsharp', cad: 'cfr', dev: 'ONN',
    ott: 1, vlc: 1, kod: 1, tgt: 'display'
};
const EXTSHIMOTT_LINE = '#EXTSHIMOTT:' + JSON.stringify(EXTSHIMOTT_PAYLOAD);

function makeChannel(over) {
    const ch = {
        id: 4177, tvg_id: 'ESPN-4K', name: 'ESPN 4K HDR', group: 'Deportes',
        logo: 'https://logos.example/espn4k.png', epoch: 1763600000,
        ape_profile: 'P0', resolution: '7680x4320', height: 4320,
        codec: 'hvc1.2.4.L183.B0',
        url: 'https://cdn.example/live/espn4k/index.m3u8?u=abc123&d=' + D_B64 + '&x=1',
        stream_inf: 'BANDWIDTH=80000000,RESOLUTION=7680x4320,CODECS="hvc1.2.4.L183.B0",VIDEO-RANGE=PQ',
        supp_codecs: 'dvh1.08.06',
        qoe: { p: 'P0' },
        lines: ['#EXTHTTP:{"User-Agent":"VLC/3.0"}', EXTSHIMOTT_LINE],
        'x-unknown-field': { nested: [1, 2, { deep: true }] },
        'X-Custom-Tag': 'keep-me'
    };
    if (over) Object.keys(over).forEach(k => { ch[k] = over[k]; });
    return ch;
}

const baseList = [
    makeChannel(),
    makeChannel({
        id: 5001, tvg_id: 'DAZN-1080', name: 'DAZN FHD', group: 'Deportes',
        ape_profile: 'P3', resolution: '1920x1080', height: 1080,
        url: 'https://cdn.example/live/dazn/index.m3u8?u=zzz', qoe: { p: 'P3' }
    }),
    makeChannel({
        id: 5002, tvg_id: 'MUSIC-HD', name: 'Music HD', group: 'Música',
        ape_profile: 'P5', resolution: '1280x720', height: 720,
        url: 'https://cdn.example/live/music/index.m3u8', qoe: { p: 'P5' }
    })
];

(async function run() {
    console.log('══════════════════════════════════════════════════════════════');
    console.log('  APE 4K/PREMIUM-6K AUDIT ADAPTER · suite (SPEC_ADAPTADOR.md)');
    console.log('  adapter: ' + path.relative(process.cwd(), ADAPTER));
    console.log('══════════════════════════════════════════════════════════════');

    /* ── 1. Contrato de carga ─────────────────────────────────────────────── */
    section('1. CONTRATO DE CARGA');
    ok('module.exports expone la API', !!api && typeof api.enrich === 'function');
    ok('window.APE_4K6K montado (UMD, patrón auto-tune-v1.js)', global.APE_4K6K === api);
    ok('expone audit/auditText/overlay/enrich/isEnabled',
        ['audit', 'auditText', 'overlay', 'enrich', 'isEnabled'].every(f => typeof api[f] === 'function'));
    ok('§1.6 schema de intención', api.SCHEMAS.intent === 'ape-4k-premium6k-intent/1', api.SCHEMAS.intent);
    ok('§1.6 extends ape.rea-intent/1', api.SCHEMAS.extends === 'ape.rea-intent/1', api.SCHEMAS.extends);
    ok('§4.2 schema de auditoría ape-audit/1', api.SCHEMAS.audit === 'ape-audit/1', api.SCHEMAS.audit);
    ok('§1.6 orden exacto de los 12 perfiles',
        api.PROFILE_IDS.join(',') === 'P0,P1,P2,P3,P4,P5,P0.5,P1.5,P2.5,P3.5,P4.5,P5.5', api.PROFILE_IDS);
    ok('variantes 3840x2160 y 5760x3240 (C5)',
        api.STANDARD_4K.width === 3840 && api.STANDARD_4K.height === 2160 &&
        api.PREMIUM_6K.width === 5760 && api.PREMIUM_6K.height === 3240);
    ok('C3: el target FFmpeg del VPS (6144) NO se declara como target',
        api.VPS_FFMPEG_6K_NOT_DECLARED === 6144 && !('6144x3456' === api.PREMIUM_6K.width + 'x' + api.PREMIUM_6K.height));

    /* ── 2. SHA-256 REAL ─────────────────────────────────────────────────── */
    section('2. SHA-256 PURO == node:crypto');
    const shaCases = ['', 'a', 'Canal Ñandú Óscar 4K', '🎬 STREAM 6K 🔥', 'x'.repeat(5000)];
    ok('paridad exacta con node:crypto (incl. UTF-8 multibyte)',
        shaCases.every(s => api._sha256Hex(s) === sha256(s)));
    ok('utf8Bytes coincide con Buffer.byteLength',
        shaCases.every(s => api._utf8Bytes(s).length === Buffer.byteLength(s, 'utf8')));

    /* ═══════════════════════════════════════════════════════════════════════
     * 3. GOLDEN OFF — flag ausente/0 => comportamiento previo byte-idéntico
     * ═══════════════════════════════════════════════════════════════════════ */
    section('3. GOLDEN OFF (APE_4K6K_AUDIT=0, default)');
    delete global.APE_4K6K_AUDIT;
    ok('flag ausente => OFF (idiom APE_8K_DECLARE, BASELINE §5.3)', api.isEnabled() === false);
    global.APE_4K6K_AUDIT = 0;
    ok('flag 0 numerico => OFF', api.isEnabled() === false);
    global.APE_4K6K_AUDIT = false;
    ok('flag false => OFF', api.isEnabled() === false);
    global.APE_4K6K_AUDIT = '0';
    ok('flag "0" => OFF', api.isEnabled() === false);
    global.APE_4K6K_AUDIT = 'false';
    ok('flag "false" => OFF', api.isEnabled() === false);

    global.APE_4K6K_AUDIT = 0;
    const frozen = deepFreeze(clone(baseList));
    let offThrew = null, offEnrich, offAudit, offOverlay;
    try {
        offEnrich = api.enrich(frozen);
        offAudit = api.audit(frozen);
        offOverlay = api.overlay();
    } catch (e) { offThrew = e && e.message; }
    ok('OFF: ninguna función escribe en la entrada congelada', offThrew === null, offThrew);
    ok('OFF: enrich devuelve la MISMA referencia (coste 0, cero copia)', offEnrich === frozen);
    ok('OFF: enrich conserva los bytes exactos', J(offEnrich) === J(frozen));
    ok('OFF: audit devuelve sobre inerte', offAudit && offAudit.enabled === false);
    ok('OFF: audit NO recorre la lista', offAudit && offAudit.before === undefined);
    ok('OFF: overlay devuelve sobre inerte', offOverlay && offOverlay.enabled === false && offOverlay.profiles === undefined);
    ok('OFF: el motivo del apagado se declara', /APE_4K6K_AUDIT=0/.test(String(offAudit && offAudit.reason)));
    ok('OFF: no muta la lista congelada', J(frozen) === J(baseList));

    /* ═══════════════════════════════════════════════════════════════════════
     * 4. GOLDEN ON — sólo cambian los campos de INTENCIÓN aprobados
     * ═══════════════════════════════════════════════════════════════════════ */
    section('4. GOLDEN ON (APE_4K6K_AUDIT=1)');
    global.APE_4K6K_AUDIT = 1;
    ok('flag 1 => ON', api.isEnabled() === true);
    global.APE_4K6K_AUDIT = true;
    ok('flag === true => ON (idiom propuesto)', api.isEnabled() === true);
    global.APE_4K6K_AUDIT = 1;

    const input = clone(baseList);
    const inputBytesBefore = J(input);
    const onList = api.enrich(input);
    ok('ON: enrich devuelve lista NUEVA', onList !== input);
    ok('ON: misma longitud (ni un canal perdido ni duplicado)', onList.length === input.length);
    ok('ON: el input original NO se muta', J(input) === inputBytesBefore);

    /* Fase 2: la intención vive en su sidecar y `rea` queda intacta. */
    const APPROVED = ['APE-4K6K-INTENT'];
    let unexpectedChanges = [];
    onList.forEach((outCh, i) => {
        const inCh = input[i], keysIn = Object.keys(inCh), keysOut = Object.keys(outCh);
        keysOut.filter(k => keysIn.indexOf(k) < 0)
            .forEach(k => { if (APPROVED.indexOf(k) < 0) unexpectedChanges.push('+' + k + '@' + i); });
        keysIn.filter(k => keysOut.indexOf(k) < 0)
            .forEach(k => unexpectedChanges.push('-' + k + '@' + i));
        keysIn.forEach(k => {
            if (APPROVED.indexOf(k) >= 0) return;
            if (J(outCh[k]) !== J(inCh[k])) unexpectedChanges.push('~' + k + '@' + i);
        });
    });
    ok('ON: sólo se AÑADE el sidecar APE-4K6K-INTENT; rea no cambia',
        unexpectedChanges.length === 0, unexpectedChanges.slice(0, 8));

    /* ── 4.b Los escalares de la intención, con literales exactos ─────────── */
    section('5. sidecar — escalares de la intención con literales exactos');
    const rea0 = onList[0]['APE-4K6K-INTENT'];
    const scalars = {
        schema: 'ape-4k-premium6k-intent/1', status: 'requested_only',
        targetResolution: '3840x2160', targetWidth: 3840, targetHeight: 2160,
        boxWidth: 3840, boxHeight: 2160, mode: 'upscale_if_needed',
        enhancementRequested: true, execution: 'not_verified',
        capacityGate: 'device_runtime', outputPreference: 'preserve_verified_source',
        reaPolicyPreserved: true, reaFieldsWritten: 0
    };
    const badScalar = Object.keys(scalars).filter(k => J(rea0[k]) !== J(scalars[k]));
    ok('los escalares del sidecar coinciden una a uno', badScalar.length === 0, badScalar);
    ok('la política REA base se conserva VERBATIM (policyId intacto)', (function () {
        const r = api.enrich([makeChannel({ rea: { schema: 'ape.rea-intent/1', policyId: 'rea-adaptive-v1' } })])[0];
        return r.rea.schema === 'ape.rea-intent/1' && r.rea.policyId === 'rea-adaptive-v1';
    })());

    /* ── 4.c outputPolicy EXACTAMENTE 13 claves (§1.3) ───────────────────── */
    section('6. §1.3 — outputPolicy de 13 claves, ni una más');
    const OP = {
        schema: 'ape-4k-premium6k-intent/1', profile: 'P0', defaultVariant: 'standard_4k',
        floorLock: '3840x2160', premiumRequested: true, premiumResolution: '5760x3240',
        premiumKind: 'simulated_spatial_upscale', preserveHigherSource: true,
        sourceTruthUnchanged: true, inheritExistingVisualTuning: true,
        hdrPolicy: 'preserve_verified_source', nativeResolutionClaim: false, executed: false
    };
    ok('outputPolicy tiene EXACTAMENTE 13 claves', Object.keys(rea0.outputPolicy).length === 13,
        Object.keys(rea0.outputPolicy));
    ok('los 13 nombres son los del contrato', Object.keys(OP).every(k => k in rea0.outputPolicy),
        Object.keys(rea0.outputPolicy));
    ok('los 13 valores son los literales del contrato',
        Object.keys(OP).every(k => J(rea0.outputPolicy[k]) === J(OP[k])),
        Object.keys(OP).filter(k => J(rea0.outputPolicy[k]) !== J(OP[k])));
    ok('floorLock es STRING, no objeto (§2.3 punto 2)', typeof rea0.outputPolicy.floorLock === 'string');
    ok('perfil del patch sin ape-profile => "runtime" (§6 caso 9)',
        api.enrich([{ tvg_id: 'Z' }])[0]['APE-4K6K-INTENT'].outputPolicy.profile === 'runtime');

    /* ── 4.d §1.4 claves preservadas ─────────────────────────────────────── */
    section('7. §1.4 — claves REA previas preservadas');
    const withRea = api.enrich([makeChannel({
        rea: {
            schema: 'ape.rea-intent/1', hdr: 'PQ', hdrVerified: true, integration: 'x',
            runtimeFallback: 'native', runtimePackage: 'p1', sourceStatus: 'unknown',
            targetResolution: null, customUnknown: 42
        }
    })])[0];
    ok('preserva las 7 claves listadas en §1.4',
        ['schema', 'hdr', 'hdrVerified', 'integration', 'runtimeFallback', 'runtimePackage', 'sourceStatus']
            .every(k => withRea.rea[k] !== undefined));
    ok('preserva una clave DESCONOCIDA adicional', withRea.rea.customUnknown === 42);
    /* Fase 2: `rea` ya NO se reescribe ⇒ sus 9 claves quedan exactamente igual. */
    ok('REA previa de 9 claves => se conservan las 9 (sin añadir ni quitar)',
        Object.keys(withRea.rea).length === 9, Object.keys(withRea.rea).length);
    ok('targetResolution previo (null) se conserva tal cual',
        withRea.rea.targetResolution === null);
    ok('no se crea APE-AUDIT-ORIGINAL: no hay nada que archivar',
        withRea['APE-AUDIT-ORIGINAL'] === undefined);

    /* ── 4.e §6 caso 2: REA inválida ABORTA ──────────────────────────────── */
    section('8. §6 caso 2 — REA inválida aborta (no se repara en silencio)');
    ok('REA string JSON válida se conserva y se le añade el sidecar', (function () {
        const r = api.enrich([makeChannel({ rea: '{"schema":"ape.rea-intent/1","k":1}' })])[0];
        return r.rea === '{"schema":"ape.rea-intent/1","k":1}' &&
            r['APE-4K6K-INTENT'].status === 'requested_only';
    })());
    ok('REA string no-JSON lanza', (function () {
        try { api.enrich([makeChannel({ rea: '{roto' })]); return false; } catch (_) { return true; }
    })());
    ok('REA número lanza (tipo no admitido)', (function () {
        try { api.enrich([makeChannel({ rea: 7 })]); return false; } catch (_) { return true; }
    })());
    ok('REA array lanza', (function () {
        try { api.enrich([makeChannel({ rea: [1] })]); return false; } catch (_) { return true; }
    })());

    /* ═══════════════════════════════════════════════════════════════════════
     * 9. PRESERVACIÓN BYTE-A-BYTE DE LO PROHIBIDO
     * ═══════════════════════════════════════════════════════════════════════ */
    section('9. PRESERVACIÓN — lo que el adaptador NO puede tocar');
    const o0 = onList[0], i0 = input[0];
    ok('campo desconocido "x-unknown-field" (incl. anidado)', J(o0['x-unknown-field']) === J(i0['x-unknown-field']));
    ok('"X-Custom-Tag"', o0['X-Custom-Tag'] === 'keep-me');
    ok('URL con u= y d= intacta', o0.url === i0.url);
    ok('prefijo u= preservado', o0.url.indexOf('u=abc123') >= 0);
    ok('d= base64url preservado', o0.url.indexOf('d=' + D_B64) >= 0);
    ok('id / tvg_id', o0.id === 4177 && o0.tvg_id === 'ESPN-4K');
    ok('EPOCH', o0.epoch === i0.epoch);
    ok('logo', o0.logo === i0.logo);
    ok('grupo', o0.group === i0.group);
    ok('ORDEN de la lista', J(onList.map(c => c.tvg_id)) === J(input.map(c => c.tvg_id)));
    ok('RESOLUTION de fuente (8K sigue 8K)', o0.resolution === '7680x4320');
    ok('CODECS (stream_inf intacto)', o0.stream_inf === i0.stream_inf);
    ok('VIDEO-RANGE dentro del STREAM-INF', o0.stream_inf.indexOf('VIDEO-RANGE=PQ') >= 0);
    ok('SUPPLEMENTAL-CODECS', o0.supp_codecs === 'dvh1.08.06');
    ok('QoE.p del canal', J(o0.qoe) === J(i0.qoe));
    ok('ningún executed:true / EXECUTED=1 en la salida',
        !/"executed"\s*:\s*true/.test(J(onList)) && !/EXECUTED=1/.test(J(onList)));

    /* ── EXTSHIMOTT v1 ───────────────────────────────────────────────────── */
    section('10. EXTSHIMOTT v1 — additionalProperties:false respetado');
    const contract = JSON.parse(fs.readFileSync(EXTSHIMOTT_CONTRACT, 'utf8'));
    const allowed = Object.keys(contract.properties);
    ok('contrato real leído: additionalProperties===false', contract.additionalProperties === false);
    ok('payload del fixture usa SÓLO claves del contrato',
        Object.keys(EXTSHIMOTT_PAYLOAD).every(k => allowed.indexOf(k) >= 0));
    ok('la línea EXTSHIMOTT es byte-idéntica tras enrich', o0.lines[1] === i0.lines[1]);
    const payloadAfter = JSON.parse(o0.lines[1].slice('#EXTSHIMOTT:'.length));
    ok('payload EXTSHIMOTT: mismo nº de claves, ninguna fuera del contrato',
        Object.keys(payloadAfter).length === Object.keys(EXTSHIMOTT_PAYLOAD).length &&
        Object.keys(payloadAfter).every(k => allowed.indexOf(k) >= 0));
    ok('required ver/id/tgt presentes', ['ver', 'id', 'tgt'].every(k => payloadAfter[k] !== undefined));
    ok('el adaptador no expone emisión de #EXTSHIMOTT',
        !Object.keys(api.TAGS).some(k => /shimott/i.test(k)) && !JSON.stringify(Object.keys(api)).match(/shimott/i));

    /* ── 11. PERFIL VISUAL vs QoE.p ──────────────────────────────────────── */
    section('11. §6 caso 14 — perfil visual vs QoE.p separados');
    const mixInput = clone([
        makeChannel({ tvg_id: 'A', ape_profile: 'P0', qoe: { p: 'P0' } }),
        makeChannel({ tvg_id: 'B', ape_profile: 'P0', qoe: { p: 'P3' } }),
        makeChannel({ tvg_id: 'C', ape_profile: 'P3', qoe: { p: 'P3' } })
    ]);
    const mix = api.enrich(mixInput);
    ok('enrich NO reescribe QoE.p', J(mix[1].qoe) === J(mixInput[1].qoe));
    ok('la intención lleva el perfil VISUAL', mix[1]['APE-4K6K-INTENT'].outputPolicy.profile === 'P0');
    const au = api.audit(mixInput).before;
    ok('audit REGISTRA el desajuste', au.qoe_profile_mismatch === 1, au.qoe_profile_mismatch);
    ok('formato exacto <perfil>-><qoe_p>', au.qoe_profile_mismatches['P0->P3'] === 1, au.qoe_profile_mismatches);
    ok('audit NO iguala los ejes', au.profiles['P0'] === 2 && au.profiles['P3'] === 1, au.profiles);

    /* ═══════════════════════════════════════════════════════════════════════
     * 12. IDEMPOTENCIA (§5.1: igualdad de BYTES)
     * ═══════════════════════════════════════════════════════════════════════ */
    section('12. §5.1 — idempotencia por bytes');
    const p1 = api.enrich(clone(baseList));
    const p2 = api.enrich(clone(p1));
    const p3 = api.enrich(clone(p2));
    ok('enrich∘enrich == enrich en bytes', J(p2) === J(p1));
    ok('sha256 1ª == 2ª pasada', sha256(J(p1)) === sha256(J(p2)), [sha256(J(p1)), sha256(J(p2))]);
    ok('3ª pasada estable (punto fijo)', J(p3) === J(p1));
    ok('APE-AUDIT-ORIGINAL NO se re-archiva', J(p2[0]['APE-AUDIT-ORIGINAL']) === J(p1[0]['APE-AUDIT-ORIGINAL']));
    ok('orden de claves estable (el sidecar va al final, tras rea)', (function () {
        const ks = Object.keys(p1[0]);
        const iIntent = ks.indexOf('APE-4K6K-INTENT'), iRea = ks.indexOf('rea');
        return iIntent === ks.length - 1 && (iRea < 0 || iRea === iIntent - 1);
    })());
    const ext2 = api.enrich(clone([withRea]))[0];
    ok('extensión de REA existente también idempotente', J(ext2) === J(withRea));

    /* ═══════════════════════════════════════════════════════════════════════
     * 13. 8K NO SE DEGRADA
     * ═══════════════════════════════════════════════════════════════════════ */
    section('13. LEY ANTI-DEGRADACIÓN — 8K no baja a 4K');
    const ch8k = api.enrich(clone([makeChannel()]))[0];
    ok('8K conserva su resolución de fuente', ch8k.resolution === '7680x4320');
    ok('8K conserva su height', ch8k.height === 4320);
    ok('declara preserveHigherSource:true', ch8k['APE-4K6K-INTENT'].outputPolicy.preserveHigherSource === true);
    ok('declara nativeResolutionClaim:false', ch8k['APE-4K6K-INTENT'].outputPolicy.nativeResolutionClaim === false);
    ok('declara sourceTruthUnchanged:true', ch8k['APE-4K6K-INTENT'].outputPolicy.sourceTruthUnchanged === true);
    ok('declara hdrPolicy preserve_verified_source', ch8k['APE-4K6K-INTENT'].outputPolicy.hdrPolicy === 'preserve_verified_source');
    ok('no afirma que la fuente sea 4K nativa', J(ch8k).indexOf('"sourceResolution"') < 0);

    /* ═══════════════════════════════════════════════════════════════════════
     * 14. OVERLAY — 7 claves raíz del contrato + bloque aditivo
     * ═══════════════════════════════════════════════════════════════════════ */
    section('14. §1.6 / §3.1 — overlay de 7 claves raíz + 12 perfiles');
    const cfgLoaded = (function () {
        try { require(CONFIG); return !!(global.APE_PROFILES_CONFIG && global.APE_PROFILES_CONFIG.profiles); }
        catch (e) { console.log('        (config no cargable: ' + (e && e.message) + ')'); return false; }
    })();
    ok('window.APE_PROFILES_CONFIG cargada del fichero REAL', cfgLoaded === true);
    const ov = api.overlay();
    ok('overlay activo con flag=1', ov.enabled === true);
    const ROOT7 = ['schema', 'extends', 'deployment', 'active_default_variant', 'common', 'profiles', 'zapping'];
    ok('las 7 claves raíz del contrato están presentes', ROOT7.every(k => k in ov), ROOT7.filter(k => !(k in ov)));
    ok('deployment = not_installed (§3.1)', ov.deployment === 'not_installed');
    ok('active_default_variant = standard_4k', ov.active_default_variant === 'standard_4k');
    ok('12 perfiles', Object.keys(ov.profiles).length === 12, Object.keys(ov.profiles));
    ok('cada perfil tiene EXACTAMENTE 2 claves (contrato §3.1)',
        api.PROFILE_IDS.every(id => Object.keys(ov.profiles[id]).length === 2 &&
            Object.keys(ov.profiles[id]).join(',') === 'inherit_existing_profile,variants'),
        Object.keys(ov.profiles.P0));
    ok('inherit_existing_profile = la propia clave (§3.1)',
        api.PROFILE_IDS.every(id => ov.profiles[id].inherit_existing_profile === id),
        api.PROFILE_IDS.map(id => id + '=' + ov.profiles[id].inherit_existing_profile));
    ok('standard_4k 3840x2160 con literales del contrato',
        api.PROFILE_IDS.every(id => {
            const v = ov.profiles[id].variants.standard_4k;
            return v.label === '4K escalado si la fuente lo requiere' && v.width === 3840 &&
                   v.height === 2160 && v.requested === true && v.executed === false &&
                   v.native_quality_claim === false;
        }));
    ok('premium_6k_simulated 5760x3240 con literales del contrato',
        api.PROFILE_IDS.every(id => {
            const v = ov.profiles[id].variants.premium_6k_simulated;
            return v.label === 'Premium 6K simulada' && v.width === 5760 && v.height === 3240 &&
                   v.requested === true && v.executed === false && v.native_quality_claim === false &&
                   v.processing === 'spatial_upscale_not_ai_superresolution';
        }));
    ok('ninguna variante ejecutada', !/"executed"\s*:\s*true/.test(J(ov)));

    /* ── §1.6 common: 10 claves + 4 políticas en forma OBJETO ─────────────── */
    section('15. §1.6 / §2.3 — common y zapping con forma exacta');
    ok('common tiene sus 10 claves',
        Object.keys(ov.common).length === 10, Object.keys(ov.common));
    ok('common.preserve_source_truth / video_path',
        ov.common.preserve_source_truth === true && ov.common.video_path === 'unchanged_existing_uri');
    ok('§2.3 floor_lock es OBJETO en common',
        typeof ov.common.floor_lock === 'object' &&
        ov.common.floor_lock.resolution === '3840x2160' && ov.common.floor_lock.state === 'not_executed');
    ok('§2.3 virtual_4k es OBJETO en common',
        typeof ov.common.virtual_4k === 'object' && ov.common.virtual_4k.kind === 'upscaled_if_needed');
    ok('§2.3 hdr_intent: SDR->HDR apagado por defecto',
        ov.common.hdr_intent.sdr_to_hdr === 'disabled_by_default' &&
        ov.common.hdr_intent.dolby_vision_synthesis === false);
    ok('§2.3 APE_VISUAL_FIRST default 0 (no se activa solo)',
        ov.common.APE_VISUAL_FIRST.default === 0 && ov.common.APE_VISUAL_FIRST.enabled_value === 1 &&
        ov.common.APE_VISUAL_FIRST.override_source_hdr_metadata === false);
    ok('codec_selection: hevc sólo entre variants verificadas',
        ov.common.codec_selection.preferred_family === 'hevc' &&
        ov.common.codec_selection.only_existing_verified_renditions === true &&
        ov.common.codec_selection.do_not_transcode_by_headers === true);
    ok('runtime_gate: never_forge_device_descriptor',
        ov.common.runtime_gate.never_forge_device_descriptor === true &&
        ov.common.runtime_gate.unsupported_output === 'report_blocked_do_not_label_as_4k_or_6k');
    ok('zapping: endpoint NULL (§3.3 R6: no se inventa ruta)',
        ov.zapping.endpoint === null && ov.zapping.endpoint_state === 'requires_existing_vps_route');
    ok('zapping: POST / PUT + no envía credenciales',
        ov.zapping.method === 'POST' && ov.zapping.url_change_method === 'PUT' &&
        ov.zapping.must_not_send_provider_credentials === true);
    ok('zapping: 8 campos declarados',
        ov.zapping.fields.length === 8 && ov.zapping.fields[0] === 'channel_id', ov.zapping.fields);

    /* ── Bloque ADITIVO: tuning REAL heredado, sin degradar P0 ────────────── */
    section('16. ADITIVO — repo_inheritance (tuning REAL, no inventado)');
    ok('repo_inheritance declara la fuente real', ov.repo_inheritance.source === 'window.APE_PROFILES_CONFIG');
    ok('12 perfiles con herencia resuelta', ov.repo_inheritance.profiles_inherited === 12, ov.repo_inheritance.profiles_inherited);
    const realP0 = global.APE_PROFILES_CONFIG.profiles.P0;
    ok('P0 hereda el objeto REAL (idéntico a la config)',
        J(ov.repo_inheritance.profiles.P0.tuning) === J(clone(realP0)));
    ok('P0 NO se degrada: resolución heredada 7680x4320',
        ov.repo_inheritance.profiles.P0.inherited_resolution === '7680x4320',
        ov.repo_inheritance.profiles.P0.inherited_resolution);
    ok('P0.5 hereda tuning de P0 (medido en _apeQoeNet)',
        ov.repo_inheritance.profiles['P0.5'].inherits_tuning_from === 'P0');
    ok('P5.5 hereda tuning de P5', ov.repo_inheritance.profiles['P5.5'].inherits_tuning_from === 'P5');
    ok('P2 hereda tuning de P2', ov.repo_inheritance.profiles.P2.inherits_tuning_from === 'P2');
    ok('overlay NO reasigna canales', ov.channel_reassignment === 'none' &&
        api.PROFILE_IDS.every(id => ov.profiles[id].variants.standard_4k.width === 3840));
    ok('overlay declara QoE.p intacto', ov.qoe_policy === 'untouched');
    ok('§7 N1: NO inventa el mapeo Pn -> perfil con nombre largo',
        ov.not_computed.some(n => /mapping Pn/.test(n.field)));
    ok('§2.9/C3: declara que 6144x3456 NO se usa',
        ov.not_computed.some(n => String(n.field).indexOf('6144') >= 0));

    /* ═══════════════════════════════════════════════════════════════════════
     * 17. AUDIT — {before, implementation_state} con las 23 claves
     * ═══════════════════════════════════════════════════════════════════════ */
    section('17. §4.1/§4.2 — forma del record y 23 claves de before');
    const rec = api.audit(clone(baseList));
    ok('record tiene before + implementation_state',
        !!rec.before && rec.implementation_state === 'metadata_only_not_deployed');
    ok('record NO trae after/preservation_checks sin opts.after',
        rec.after === undefined && rec.preservation_checks === undefined);
    ok('before tiene EXACTAMENTE las 23 claves del contrato',
        Object.keys(rec.before).length === 23, Object.keys(rec.before).length);
    ok('los 23 nombres coinciden con el contrato',
        api.AUDIT_KEYS.length === 23 && api.AUDIT_KEYS.every(k => k in rec.before),
        api.AUDIT_KEYS.filter(k => !(k in rec.before)));
    ok('network_test_scope = literal del contrato',
        rec.before.network_test_scope === 'none_in_this_script', rec.before.network_test_scope);
    ok('3 canales y 3 URLs', rec.before.channels === 3 && rec.before.uris === 3);
    ok('perfiles reales P0/P3/P5',
        rec.before.profiles.P0 === 1 && rec.before.profiles.P3 === 1 && rec.before.profiles.P5 === 1);
    ok('descriptor d= decodificado y ordenado', (function () {
        const k = Object.keys(rec.before.device_descriptors);
        return k.length === 1 && k[0].indexOf('"dev":"ONN-4K"') >= 0;
    })(), rec.before.device_descriptors);
    ok('no infla urls_with_full_metadata con u=/d= (contrato: 0)',
        rec.before.urls_with_full_metadata === 0, rec.before.urls_with_full_metadata);
    ok('SÍ cuenta idata=/ape_meta=', (function () {
        const r = api.audit([
            { tvg_id: 'M1', url: 'https://x/a.m3u8?idata=zzz' },
            { tvg_id: 'M2', url: 'https://x/b.m3u8?ape_meta=1&ape_policy=2' },
            { tvg_id: 'M3', url: 'https://x/c.m3u8?plain=1' }
        ]).before;
        return r.urls_with_full_metadata === 2 && r.uris === 3;
    })());
    ok('uri_sequence_sha256 real de 64 hex', /^[0-9a-f]{64}$/.test(String(rec.before.uri_sequence_sha256)));
    ok('declara NO COMPUTADO con motivo', Array.isArray(rec.not_computed) && rec.not_computed.length > 0 &&
        rec.not_computed.every(n => n.field && n.reason));
    ok('declara sha256_uncompressed_text NO COMPUTADO (entrada no es texto)',
        rec.not_computed.some(n => n.field === 'sha256_uncompressed_text'));
    ok('perfil ausente en AUDIT => "unknown" (§6 caso 9)',
        api.audit([{ tvg_id: 'Z' }]).before.profiles.unknown === 1);
    ok('no inventa ids', (function () {
        const r = api.audit([{ name: 'sin-id', url: 'https://x/y.m3u8' }]);
        return r.before.duplicate_channel_ids === 0 &&
               r.not_computed.some(n => n.field === 'duplicate_channel_ids');
    })());
    ok('audit NO muta la entrada', (function () {
        const inp = clone(baseList); const b = J(inp); api.audit(inp); return J(inp) === b;
    })());

    /* ── inventory: source_resolution/source_codec SIEMPRE null (§4.4) ────── */
    section('18. §4.4 — inventario de 10 campos, source_* null');
    const recInv = api.audit(clone(baseList), { inventory: true });
    ok('inventario con una fila por canal', recInv.inventory.length === 3);
    const rowKeys = ['channel_id', 'profile', 'source_resolution', 'source_codec', 'source_verified',
                     'output_requested', 'premium_requested', 'device_hint',
                     'url_contains_full_metadata', 'qoe_profile'];
    ok('las 10 claves del inventario', rowKeys.every(k => k in recInv.inventory[0]),
        rowKeys.filter(k => !(k in recInv.inventory[0])));
    ok('source_resolution SIEMPRE null (hueco reservado, no inventado)',
        recInv.inventory.every(r => r.source_resolution === null));
    ok('source_codec SIEMPRE null', recInv.inventory.every(r => r.source_codec === null));
    ok('channel_id sale de tvg_id', recInv.inventory[0].channel_id === 'ESPN-4K');

    /* ── preservation_checks (§4.3) con after ─────────────────────────────── */
    section('19. §4.3 — preservation_checks sobre la salida enriquecida');
    const enriched = api.enrich(clone(baseList));
    const recPair = api.audit(clone(baseList), { after: enriched });
    ok('con opts.after aparecen after + preservation_checks',
        !!recPair.after && !!recPair.preservation_checks);
    ok('channel_count_unchanged true', recPair.preservation_checks.channel_count_unchanged === true);
    ok('uri_sequence_unchanged true (enrich no toca URIs)',
        recPair.preservation_checks.uri_sequence_unchanged === true);
    ok('original_not_overwritten true', recPair.preservation_checks.original_not_overwritten === true);
    ok('source_verified_flags_not_forged true',
        recPair.preservation_checks.source_verified_flags_not_forged === true);
    ok('las 4 claves exactas del contrato',
        Object.keys(recPair.preservation_checks).length === 4, Object.keys(recPair.preservation_checks));
    ok('aborta si se altera la secuencia de URLs', (function () {
        const broken = clone(enriched);
        broken[0].url = 'https://evil.example/other.m3u8';
        try { api.audit(clone(baseList), { after: broken }); return false; } catch (_) { return true; }
    })());

    /* ═══════════════════════════════════════════════════════════════════════
     * 20. LF vs CRLF (§2.1, §5, §6 caso 5/6)
     * ═══════════════════════════════════════════════════════════════════════ */
    section('20. LF vs CRLF — byte-consciente, sin normalizar');
    const bodyLf = [
        '#EXTM3U',
        '#EXT-X-INDEPENDENT-SEGMENTS',
        '#EXTINF:-1 tvg-id="C1" ape-profile="P0",Canal 1',
        EXTSHIMOTT_LINE,
        '#EXT-X-APE-QOE-CONTRACT:{"ch":"C1","v":1,"p":"P0"}',
        '#EXT-X-STREAM-INF:BANDWIDTH=1000,RESOLUTION=1920x1080',
        '#EXTVLCOPT:network-caching=1000',
        'https://cdn.example/live/c1/index.m3u8',
        '#EXTINF:-1 tvg-id="C2" ape-profile="P3",Canal 2',
        'https://cdn.example/live/c2/index.m3u8',
        ''
    ].join('\n');
    const bodyCrlf = bodyLf.replace(/\n/g, '\r\n');
    const lf = api.auditText(bodyLf), cr = api.auditText(bodyCrlf);
    ok('LF detectado', lf.adapter.eol === 'lf', lf.adapter.eol);
    ok('CRLF detectado', cr.adapter.eol === 'crlf', cr.adapter.eol);
    ok('misma estructura LF vs CRLF',
        lf.before.channels === cr.before.channels && lf.before.uris === cr.before.uris &&
        J(lf.before.profiles) === J(cr.before.profiles));
    ok('sha256 de texto DIFIERE (no se normaliza el EOL)',
        lf.before.sha256_uncompressed_text !== cr.before.sha256_uncompressed_text);
    ok('sha de la secuencia de URLs coincide', lf.before.uri_sequence_sha256 === cr.before.uri_sequence_sha256);
    ok('file_bytes refleja bytes reales (CRLF ocupa más)',
        cr.before.file_bytes === lf.before.file_bytes + (bodyLf.split('\n').length - 1),
        [lf.before.file_bytes, cr.before.file_bytes]);
    ok('sha256_uncompressed_text == node:crypto (LF)',
        lf.before.sha256_uncompressed_text === sha256(bodyLf));
    ok('sha256_uncompressed_text == node:crypto (CRLF)',
        cr.before.sha256_uncompressed_text === sha256(bodyCrlf));
    ok('auditText no devuelve el texto (no hay eco de payloads)', lf.text === undefined);

    /* tag_counts: §6 caso 11 — la clave conserva "\n" si la línea no lleva ':' */
    ok('§6 caso 11: tag sin ":" conserva el \\n en la clave',
        Object.keys(lf.before.tag_counts).indexOf('#EXT-X-INDEPENDENT-SEGMENTS\n') >= 0,
        Object.keys(lf.before.tag_counts));
    ok('tag con ":" NO lleva \\n', lf.before.tag_counts['#EXTINF'] === 2, lf.before.tag_counts['#EXTINF']);
    ok('§4.2: hls_unverified_declarations = JSON con claves ordenadas',
        Object.keys(lf.before.hls_unverified_declarations)[0] ===
        '{"BANDWIDTH":"1000","RESOLUTION":"1920x1080"}',
        Object.keys(lf.before.hls_unverified_declarations));
    ok('§4.2: network_caching_ms', lf.before.network_caching_ms['1000'] === 1, lf.before.network_caching_ms);
    ok('cuenta #EXTSHIMOTT sin tocarlo', lf.before.tag_counts['#EXTSHIMOTT'] === 1);
    ok('§6 caso 14 en texto: QoE.p == perfil => sin desajuste', lf.before.qoe_profile_mismatch === 0);

    /* CRLF en campo raw del canal: identidad de bytes, no longitud calculada */
    const RAW_CRLF = '#EXTINF:-1,Canal\r\n', RAW_LF = '#EXTINF:-1,Canal\n';
    const eLf = api.enrich([{ tvg_id: 'X', raw: RAW_CRLF }])[0];
    const eCr = api.enrich([{ tvg_id: 'Y', raw: RAW_LF }])[0];
    ok('enrich preserva el EOL del campo raw (CRLF byte-idéntico)', eLf.raw === RAW_CRLF);
    ok('enrich preserva el EOL del campo raw (LF byte-idéntico)', eCr.raw === RAW_LF);

    /* ═══════════════════════════════════════════════════════════════════════
     * 21. LISTA GRANDE — medir y declarar
     * ═══════════════════════════════════════════════════════════════════════ */
    section('21. LISTA GRANDE — medición declarada');
    const N = Number(process.env.APE_4K6K_N || 20000);
    const PROF = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
    const big = new Array(N);
    for (let i = 0; i < N; i++) {
        big[i] = makeChannel({
            id: i, tvg_id: 'CH-' + i, name: 'Canal ' + i, ape_profile: PROF[i % 6],
            resolution: i % 100 === 0 ? '7680x4320' : '1920x1080',
            url: 'https://cdn.example/live/c' + i + '/index.m3u8?u=k' + i,
            qoe: { p: PROF[i % 6] }
        });
        delete big[i].lines; delete big[i]['x-unknown-field']; delete big[i]['X-Custom-Tag'];
    }
    const t0 = Date.now(); const bigOut = api.enrich(big); const tEnrich = Date.now() - t0;
    const t1 = Date.now(); const bigAudit = api.audit(bigOut); const tAudit = Date.now() - t1;
    const t2 = Date.now(); const again = api.enrich(bigOut); const tIdem = Date.now() - t2;
    console.log('        N=' + N + ' canales · enrich=' + tEnrich + ' ms · audit=' + tAudit +
                ' ms · 2ª pasada=' + tIdem + ' ms · total=' + (tEnrich + tAudit + tIdem) + ' ms');
    ok('lista grande: procesa los ' + N + ' sin perder ninguno',
        bigOut.length === N && bigAudit.before.channels === N);
    ok('lista grande: declara las ' + N + ' URLs', bigAudit.before.uris === N, bigAudit.before.uris);
    ok('lista grande: ninguna variante ejecutada', !/"executed"\s*:\s*true/.test(J(bigOut)));
    ok('lista grande: idempotente a escala', J(again) === J(bigOut));
    ok('lista grande: termina en tiempo acotado (<20000 ms, medido ' + (tEnrich + tAudit + tIdem) + ')',
        (tEnrich + tAudit + tIdem) < 20000);
    const perCh = (tEnrich + tAudit) / N;
    ok('lista grande: coste lineal declarado (' + perCh.toFixed(4) + ' ms/canal)', perCh < 1.0, perCh);

    /* ── 22. Robustez ────────────────────────────────────────────────────── */
    section('22. ENTRADAS DEGRADADAS');
    ok('enrich(null) no lanza', (function () { try { api.enrich(null); return true; } catch (_) { return false; } })());
    ok('enrich([]) devuelve []', J(api.enrich([])) === '[]');
    ok('elementos no-objeto pasan intactos', (function () {
        const r = api.enrich(['texto', null, 7]);
        return r[0] === 'texto' && r[1] === null && r[2] === 7;
    })());
    ok('audit(null) con 0 canales', api.audit(null).before.channels === 0);
    ok('perfil desconocido en patch => "runtime"',
        api.enrich([{ tvg_id: 'Z', ape_profile: 'P9' }])[0]['APE-4K6K-INTENT'].outputPolicy.profile === 'runtime');

    /* ── 23. Aislamiento ─────────────────────────────────────────────────── */
    section('23. AISLAMIENTO — nada previo se altera');
    const cfgBefore = J(global.APE_PROFILES_CONFIG);
    global.APE_4K6K_AUDIT = 1; api.overlay(); api.audit(clone(baseList)); api.enrich(clone(baseList));
    global.APE_4K6K_AUDIT = 0; api.overlay(); api.audit(clone(baseList)); api.enrich(clone(baseList));
    ok('APE_PROFILES_CONFIG intacta tras todas las llamadas', J(global.APE_PROFILES_CONFIG) === cfgBefore);
    ok('APE_PROFILES_CONFIG sigue con los 6 perfiles reales',
        Object.keys(global.APE_PROFILES_CONFIG.profiles).join(',') === 'P0,P1,P2,P3,P4,P5');
    global.APE_4K6K_AUDIT = 1;
    ok('overlay NO añade P0.5..P5.5 a la config REAL (mapa aparte)',
        global.APE_PROFILES_CONFIG.profiles['P0.5'] === undefined &&
        api.overlay().profiles['P0.5'] !== undefined);
    global.APE_4K6K_AUDIT = 0;

    /* ═══════════════════════════════════════════════════════════════════════
     * 18. FASE 2 — EMISIÓN DEL SIDECAR Y FRONTERA CON EXTSHIMOTT
     * ═══════════════════════════════════════════════════════════════════════ */
    section('18. intentTag(): una URI por canal, tag propio, EXTSHIMOTT intacto');
    const tagCh = { ape_profile: 'P3', rea: { schema: 'ape.rea-intent/1', policyId: 'rea-adaptive-v1' } };
    const tagLine = api.intentTag(tagCh);
    ok('intentTag es una sola línea con el prefijo propio',
        typeof tagLine === 'string' && tagLine.indexOf('\n') < 0 &&
        tagLine.indexOf('#EXT-X-APE-4K6K-INTENT:') === 0);
    ok('payload del tag parsea y declara intención no ejecutada', (function () {
        const p = JSON.parse(tagLine.slice('#EXT-X-APE-4K6K-INTENT:'.length));
        return p.schema === 'ape-4k-premium6k-intent/1' && p.status === 'requested_only' &&
            p.outputPolicy.executed === false && p.reaFieldsWritten === 0;
    })());
    ok('intentTag NO muta la REA del canal',
        tagCh.rea.policyId === 'rea-adaptive-v1' && Object.keys(tagCh.rea).length === 2);
    ok('el tag no contiene EXTSHIMOTT (v1 sigue cerrado)', tagLine.indexOf('EXTSHIMOTT') < 0);
    ok('insertado antes de la URI deja una sola URI y EXTSHIMOTT intacto', (function () {
        const bloque = ['#EXTINF:-1 tvg-id="1",Canal', '#EXTHTTP:{"User-Agent":"x"}',
            '#EXTSHIMOTT:{"ver":1}', 'https://iptv-ape.duckdns.org/pulse/1.m3u8?u=x&d=y'];
        const lineas = bloque.slice();
        lineas.splice(lineas.length - 1, 0, tagLine);
        const out = lineas.join('\n');
        return (out.match(/^https?:\/\//gm) || []).length === 1 &&
            out.indexOf('#EXTSHIMOTT:{"ver":1}') > 0 &&
            out.indexOf('#EXT-X-APE-4K6K-INTENT:') < out.indexOf('https://');
    })());

    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  PASS ' + pass + ' · FAIL ' + fail);
    console.log('══════════════════════════════════════════════════════════════');
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
    console.log('  FAIL  excepción no capturada -> ' + (e && e.stack || e));
    console.log('\n─────────────────────────────────────────────');
    console.log('  PASS ' + pass + ' · FAIL ' + (fail + 1));
    process.exit(1);
});
