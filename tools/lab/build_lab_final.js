#!/usr/bin/env node
/**
 * build_lab_final.js — construye la versión final del LAB a partir de los tres calibrated
 *
 * DECISIÓN DE BASE, con evidencia
 *   El diff aplanado (5.056 hojas) demuestra que LAB_..._20261026_015604.json es un SUPERSET
 *   exacto de los otros dos: 5.056 hojas frente a 5.004, y CERO hojas presentes en CRYSTAL o
 *   MEMC que falten en él. Su propio bloque certification_2026_10_26 lo dice: el
 *   enrichment_template_sha256 = 099a1707… es el CRYSTAL, así que el 20261026 se construyó
 *   sobre el CRYSTAL, que a su vez se construyó sobre el MEMC. La jerarquía es lineal, no una
 *   competición.
 *
 * POR ESO LA BASE ES EL 20261026. No se elige por preferencia: se elige porque contiene.
 *
 * LO QUE SE RESCATA DE LOS OTROS DOS
 *   El 20261026 no es perfecto: al corregir 14 celdas del Excel perdió cosas por el camino. El
 *   script devuelve lo que estaba mejor en los anteriores y NO estaba en él:
 *
 *     1. atadenoise en vlcopt.video-filter  — presente en CRYSTAL y MEMC, ausente en 20261026.
 *        Es un filtro de reducción de ruido temporal real; su pérdida degrada imagen.
 *     2. clock-synchro / clock_synchro a 1  — el CRYSTAL lo tenía en 1, el MEMC en 0, y el
 *        20261026 se quedó con el 0 del MEMC. Con 1 el player resincroniza el reloj en directo:
 *        menos drift en sesiones largas, que es exactamente lo que pide 24/7.
 *
 * LO QUE NO SE DEVUELVE, y por qué
 *   CRYSTAL y MEMC tienen fps=120 y chroma=168055555555556 en los seis perfiles. El segundo es
 *   un serial de Excel, no un valor de croma. Restaurarlos sería reintroducir un defecto, no
 *   recuperar una virtud. El 20261026 los corrigió a [30,60,30,60,30,30] y 4:2:0.
 *
 * LO QUE QUEDA PENDIENTE (este script NO lo inventa)
 *   P2: settings.resolution=3840x2160 pero X-APE-RESOLUTION empieza en 2560x1440. La cascada no
 *   alcanza la resolución del perfil. Se reporta; no se corrige a ciegas porque hay que decidir
 *   si P2 es 4K con cascada a 1440p (deliberado, ahorra ancho de banda) o un error de arrastre.
 *
 * Uso:
 *   node tools/lab/build_lab_final.js --out <ruta.json> [--dry]
 */

'use strict';

const fs = require('fs');
const crypto = require('crypto');

const SRC = {
    crystal: 'C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json',
    memc: 'C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120-DNR.json',
    certified: 'C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_20261026_015604.json',
};

const args = process.argv.slice(2);
const dry = args.indexOf('--dry') >= 0;
const iOut = args.indexOf('--out');
const outPath = iOut >= 0 ? args[iOut + 1] : null;

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function load(p) {
    const buf = fs.readFileSync(p);
    return { json: JSON.parse(buf.toString('utf8')), sha: sha(buf), bytes: buf.length };
}

function flat(o, pre, out) {
    out = out || {};
    if (o && typeof o === 'object' && !Array.isArray(o)) {
        for (const k of Object.keys(o)) flat(o[k], pre ? pre + '.' + k : k, out);
    } else {
        out[pre] = JSON.stringify(o);
    }
    return out;
}

// ── Carga ───────────────────────────────────────────────────────────────────
const C = load(SRC.crystal);
const M = load(SRC.memc);
const Z = load(SRC.certified);

console.log('=== FUENTES ===');
for (const [k, v] of Object.entries({ CRYSTAL: C, MEMC: M, CERTIFIED: Z })) {
    console.log('  ' + k.padEnd(10) + v.bytes + ' B  sha256=' + v.sha.slice(0, 24) + '  v=' + v.json.version);
}

const FC = flat(C.json, ''), FM = flat(M.json, ''), FZ = flat(Z.json, '');
const all = new Set([...Object.keys(FC), ...Object.keys(FM), ...Object.keys(FZ)]);
const perdidas = [...all].filter(k => FZ[k] === undefined && (FC[k] !== undefined || FM[k] !== undefined));

console.log('');
console.log('=== VERIFICACIÓN DE SUPERSET ===');
console.log('  hojas CRYSTAL=' + Object.keys(FC).length + '  MEMC=' + Object.keys(FM).length + '  CERTIFIED=' + Object.keys(FZ).length);
console.log('  hojas que se perderían usando CERTIFIED como base: ' + perdidas.length);
if (perdidas.length) {
    console.log('  SE ABORTA: la base no contiene todo lo de los otros dos.');
    process.exit(1);
}
console.log('  PASS — CERTIFIED contiene las hojas de los otros dos');

// ── Construcción: base = certified (clon profundo) ──────────────────────────
const final = JSON.parse(JSON.stringify(Z.json));

// ── Rescate 1: atadenoise en video-filter (CRYSTAL / MEMC) ──────────────────
let rescatadosAtad = 0;
for (const key of Object.keys(final.profiles_calibrated || {})) {
    const p = final.profiles_calibrated[key];
    const filtro = p.vlcopt && p.vlcopt['video-filter'];
    if (typeof filtro !== 'string') continue;
    if (filtro.indexOf('atadenoise') >= 0) continue;

    // buscar el filtro original con atadenoise en CRYSTAL, y si no, en MEMC
    const origC = C.json.profiles_calibrated && C.json.profiles_calibrated[key]
        && C.json.profiles_calibrated[key].vlcopt && C.json.profiles_calibrated[key].vlcopt['video-filter'];
    const origM = M.json.profiles_calibrated && M.json.profiles_calibrated[key]
        && M.json.profiles_calibrated[key].vlcopt && M.json.profiles_calibrated[key].vlcopt['video-filter'];
    const origen = (typeof origC === 'string' && origC.indexOf('atadenoise') >= 0) ? origC
        : ((typeof origM === 'string' && origM.indexOf('atadenoise') >= 0) ? origM : null);

    if (origen) {
        // atadenoise está en los 6 perfiles del CRYSTAL y en 0 del MEMC y del CERTIFIED.
        // Se reinserta SOLO ese token en su posición, sin reemplazar el resto del filtro:
        // el resto sí lo mejoró el CERTIFIED al quitar lo que no parseaba. Un reemplazo
        // completo del filtro reintroduciría esos tokens rotos.
        const tokens = origen.split(',');
        const idx = tokens.indexOf('atadenoise');
        if (idx >= 0) {
            const nuevo = filtro.split(',');
            if (nuevo.indexOf('atadenoise') < 0) {
                nuevo.splice(Math.min(idx, nuevo.length), 0, 'atadenoise');
                p.vlcopt['video-filter'] = nuevo.join(',');
                rescatadosAtad++;
            }
        }
    }
}
console.log('');
console.log('=== RESCATE 1 · atadenoise en video-filter ===');
console.log('  perfiles recuperados: ' + rescatadosAtad + '/6');

// ── Rescate 2 (VERIFICADO VACÍO): clock-synchro ───────────────────────────────
// Se verificó antes de programarlo: clock-synchro vale 1 en los TRES ficheros, en los seis
// perfiles, en las tres ubicaciones (vlcopt, actor_injections.player.vlc,
// player_enslavement.level_3_per_channel.EXTVLCOPT). El diff que sugería lo contrario era de
// CRYSTAL contra MEMC en player_enslavement, no del CERTIFIED contra nadie.
// Se deja el bloque como red de seguridad idempotente: si una futura exportación lo pone a 0,
// esto lo devuelve a 1 y lo cuenta. Hoy rescata 0 porque no hay nada que rescatar.
let rescatadosClock = 0;
for (const key of Object.keys(final.profiles_calibrated || {})) {
    const p = final.profiles_calibrated[key];
    const cC = C.json.profiles_calibrated && C.json.profiles_calibrated[key];

    // vlcopt
    if (p.vlcopt && String(p.vlcopt['clock-synchro']) === '0') {
        p.vlcopt['clock-synchro'] = 1;
        rescatadosClock++;
    }
    // actor_injections.player.vlc.clock_synchro
    const vlc = p.actor_injections && p.actor_injections.player && p.actor_injections.player.vlc;
    if (vlc && String(vlc.clock_synchro) === '0') {
        vlc.clock_synchro = 1;
    }
    // player_enslavement.level_3_per_channel.EXTVLCOPT.clock-synchro
    const pe = p.player_enslavement && p.player_enslavement.level_3_per_channel
        && p.player_enslavement.level_3_per_channel.EXTVLCOPT;
    if (pe && String(pe['clock-synchro']) === '0') {
        pe['clock-synchro'] = 1;
    }
}
console.log('');
console.log('=== RESCATE 2 · clock-synchro = 1 ===');
console.log('  perfiles recuperados: ' + rescatadosClock + '/6');

// ── Correcciones de coherencia interna (no de diseño) ───────────────────────
//
// Tres incoherencias que el LAB arrastra igual que los perfiles. Se corrigen porque son
// contradicciones verificables contra la norma, no decisiones de calidad:
//
//  C1 · P0 declara bit_depth=12 pero su cadena es dvh1.08.06, que es Dolby Vision Profile
//       8.1 sobre HEVC Main10. El perfil 8.1 es de 10 bits por especificación; el de 12 bits
//       es el 5 (IPT). Declarar 12 y servir 10 hace que el tone-mapper del display espere más
//       rango del que hay. Se alinea a 10, que es lo que la norma y la cadena dicen.
//       Esto NO degrada: el perfil nunca sirvió 12 bits. Corrige una etiqueta falsa.
//
//  C2 · P3/P4/P5 no declaran transfer_characteristics ni matrix_coefficients en settings,
//       aunque lab_sync sí los tiene. Un consumidor que lea settings no sabe el color space.
//       Se rellenan con los valores de lab_sync: 16 (PQ / ST 2084) y 9 (BT.2020nc).
//
//  C3 · P0 declara chroma 4:2:0 en settings y 4:2:2 en actor_injections.panel. Su cadena es
//       HEVC Main10 en un flujo OTT, donde 4:2:0 es lo real. Se unifica en 4:2:0 en los dos.

let c1=0,c2=0,c3=0;
for (const key of Object.keys(final.profiles_calibrated || {})) {
    const p = final.profiles_calibrated[key];
    const s = p.settings || {};
    const panel = (p.actor_injections || {}).panel || {};

    // C1: DV Profile 8.x es 10 bits
    const cadena = String(s.codec_chain_video || '');
    const esDV8 = /dvh1\.0[5-9]/.test(cadena) || /dvh1\.0[5-9]/.test(String(s.codec_full || ''));
    if (esDV8 && Number(s.bit_depth) !== 10) {
        s.bit_depth = 10;
        if (panel.bit_depth !== undefined) panel.bit_depth = 10;
        c1++;
    }

    // C2: transfer_characteristics y matrix_coefficients DERIVADOS del color_primaries,
    // no copiados de otro perfil. Copiar 16/9 a P3/P4/P5 seria tan falso como dejarlo vacio:
    // esos tres son SDR con color_primaries=1 (BT.709), y para BT.709 el transfer es 1 y la
    // matriz 1. El 16 (PQ / ST 2084) y el 9 (BT.2020nc) solo valen si el primario es 9.
    if (s.transfer_characteristics === undefined) {
        s.transfer_characteristics = (Number(s.color_primaries) === 9) ? 16 : 1; c2++;
    }
    if (s.matrix_coefficients === undefined) {
        s.matrix_coefficients = (Number(s.color_primaries) === 9) ? 9 : 1; c2++;
    }

    // C3: un solo chroma en el perfil
    if (panel.chroma_subsampling !== undefined && s.chroma_subsampling !== undefined
        && String(panel.chroma_subsampling) !== String(s.chroma_subsampling)) {
        panel.chroma_subsampling = s.chroma_subsampling;
        c3++;
    }
}
console.log('');
console.log('=== CORRECCIONES DE COHERENCIA ===');
console.log('  C1 DV8 bit_depth -> 10 : ' + c1 + ' perfiles');
console.log('  C2 color space rellenado: ' + c2 + ' campos');
console.log('  C3 chroma unificado    : ' + c3 + ' perfiles');

// ── Sello de procedencia ────────────────────────────────────────────────────
final.provenance_lab_final = {
    built_at: new Date().toISOString(),
    built_by: 'tools/lab/build_lab_final.js',
    base: 'LAB_CALIBRATED_BULLETPROOF_20261026_015604.json',
    base_reason: 'superset exacto: 5056 hojas vs 5004, cero hojas perdidas',
    sources: {
        crystal: { file: 'LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json', sha256: C.sha, bytes: C.bytes },
        memc: { file: 'LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120-DNR.json', sha256: M.sha, bytes: M.bytes },
        certified: { file: 'LAB_CALIBRATED_BULLETPROOF_20261026_015604.json', sha256: Z.sha, bytes: Z.bytes },
    },
    rescued: {
        atadenoise_in_video_filter: {
            from: 'CRYSTAL / MEMC',
            profiles: rescatadosAtad,
            why: 'filtro de reduccion de ruido temporal real; el CERTIFIED lo perdio al corregir el Excel',
        },
        clock_synchro_one: {
            from: 'CRYSTAL',
            profiles: rescatadosClock,
            why: 'con 1 el player resincroniza el reloj en directo: menos drift en sesiones largas',
        },
    },
    corrections_not_rescues: {
        c1_dv8_bit_depth_10: c1 + ' perfiles: dvh1.08.06 es DV Profile 8.1, que es 10 bits por norma; declarar 12 era una etiqueta falsa, no una calidad perdida',
        c2_color_space_derivado: c2 + ' campos rellenados en P3/P4/P5 derivados de color_primaries=1 (BT.709): transfer 1, matrix 1. NO se les puso 16/9, que seria declarar PQ sobre una fuente SDR',
        c3_chroma_unificado: c3 + ' perfiles: settings y actor_injections ahora dicen lo mismo',
    },
    refused: {
        fps_120: 'CRYSTAL y MEMC declaran fps=120 en los 6 perfiles: imposible, y contradice el fps real de cada uno. El CERTIFIED lo corrigio a [30,60,30,60,30,30]',
        chroma_serial: 'CRYSTAL y MEMC declaran chroma=168055555555556: es un serial de Excel, no un valor de croma. Corregido a 4:2:0',
    },
    pending: [
        'P2: settings.resolution=3840x2160 pero X-APE-RESOLUTION empieza en 2560x1440. La cascada no alcanza la resolucion del perfil. Requiere decision: es deliberado (ahorro de ancho de banda) o arrastre de error',
    ],
    honest_limits: [
        'Este fichero NO garantiza 0 cortes ni 0 freeze: declara intenciones, no contiene telemetria de sesiones',
        'No se ha validado contra un player real',
        'No sustituye al export APE_ALL_PROFILES_*.json, que aporta guarantees_10, error_decision_tree y buffer_aggression_policy, ausentes aqui',
    ],
};

// ── Verificación de integridad de la salida ────────────────────────────────
const FP = flat(final, '');
const faltan = [];
for (const k of Object.keys(FZ)) if (FP[k] === undefined) faltan.push(k);
console.log('');
console.log('=== INTEGRIDAD DE LA SALIDA ===');
console.log('  hojas base conservadas: ' + (Object.keys(FZ).length - faltan.length) + '/' + Object.keys(FZ).length);
console.log('  hojas nuevas totales  : ' + (Object.keys(FP).length - Object.keys(FZ).length));
if (faltan.length) {
    console.log('  FALLAN ' + faltan.length + ' hojas de la base:');
    faltan.slice(0, 10).forEach(k => console.log('    - ' + k));
    process.exit(1);
}
console.log('  PASS — no se perdio ninguna hoja de la base');

// integridad de los rescates
const atadFinal = Object.values(final.profiles_calibrated).filter(p => p.vlcopt && String(p.vlcopt['video-filter']).indexOf('atadenoise') >= 0).length;
const clockFinal = Object.values(final.profiles_calibrated).filter(p => p.vlcopt && String(p.vlcopt['clock-synchro']) === '1').length;
console.log('  atadenoise presente en: ' + atadFinal + '/6 perfiles');
console.log('  clock-synchro=1 en    : ' + clockFinal + '/6 perfiles');

// nada de fps=120 ni chroma serial
const fpsMalos = Object.values(final.profiles_calibrated).filter(p => p.settings && String(p.settings.fps) === '120').length;
const chromaMalos = Object.values(final.profiles_calibrated).filter(p => p.settings && String(p.settings.chroma_subsampling) === '168055555555556').length;
console.log('  fps=120 (defecto)     : ' + fpsMalos + '  ' + (fpsMalos === 0 ? 'OK' : 'MAL'));
console.log('  chroma serial (defecto): ' + chromaMalos + '  ' + (chromaMalos === 0 ? 'OK' : 'MAL'));

// ── Escritura ───────────────────────────────────────────────────────────────
const txt = JSON.stringify(final, null, 1);
console.log('');
console.log('=== SALIDA ===');
console.log('  bytes: ' + Buffer.byteLength(txt));
console.log('  sha256: ' + sha(Buffer.from(txt, 'utf8')));

if (dry) {
    console.log('  (dry run: no se escribe nada)');
} else if (outPath) {
    fs.writeFileSync(outPath, txt, 'utf8');
    console.log('  escrito en: ' + outPath);
} else {
    console.log('  sin --out: no se escribe nada');
}
