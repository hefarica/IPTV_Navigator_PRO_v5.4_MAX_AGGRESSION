#!/usr/bin/env node
/**
 * ffmpeg_to_vlc.js — homologa cada directiva ffmpeg a su modulo VLC REAL
 *
 * POR QUE EXISTE
 *   El generador emite `#EXTVLCOPT:video-filter=${apeFilterDialects(...).vlc.chain}` y ese
 *   carril solo ejecuta modulos VLC. La receta guarda la cadena ffmpeg, y esta herramienta
 *   traduce etapa por etapa a lo que VLC SI tiene: los 40 modulos de vlc_filter_modules.js.
 *
 * REGLA QUE NO SE ROMPE
 *   Una etapa sin homologo NO se inventa ni se disfraza: se declara NO_VIABLE con su razon.
 *   La skill ape-image-pipeline-truth lo tiene medido — nlmeans, bwdif, yadif, zscale,
 *   minterpolate, unsharp, cas, libplacebo, pp y ffmpeg{ no son modulos de VLC.
 *
 * SEPARADOR
 *   `:` separa modulos en VLC. `,` NO: con coma cada key=value se vuelve un pseudo-modulo y
 *   la cadena entera falla con "Failed to create video filter". Medido por t4.
 *
 * VERDAD INCOMODA QUE ESTE SCRIPT IMPRIME
 *   Aunque la cadena salga valida, `#EXTVLCOPT:video-filter` esta cerrado por POLITICA en
 *   VLC 3.0.24: "unsafe option video-filter has been ignored for security reasons". El
 *   homologo sirve para el carril CLI (vlc --video-filter=...) y para quien parsee modulos
 *   VLC de verdad; en la playlist sigue inerte. Se dice, no se esconde.
 *
 * Uso: node tools/ape-image-recipes/ffmpeg_to_vlc.js [--json] [--write]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const RECIPES = path.join(__dirname, 'recipes.json');
const JSON_OUT = path.join(__dirname, 'vlc_homologated.json');

// ══════════════════════════════════════════════════════════════════════════════
// TABLA DE HOMOLOGOS — cada entrada cita el modulo VLC y su sintaxis real
// ══════════════════════════════════════════════════════════════════════════════
// Clave: nombre del filtro ffmpeg. Valor: funcion que recibe los params y devuelve
// la cadena del modulo VLC, o null si no hay equivalente real.
const HOMOLOGOS = {
    // hqdn3d: VLC lo tiene con opciones ABREVIADAS (luma-spat, chroma-spat, luma-temp,
    // chroma-temp). Rechaza luma_spatial / luma-spatial / luma_tmp — medido en t4.
    hqdn3d: (p) => {
        const l = p.luma_spatial ?? p.luma_spat ?? p[0];
        const c = p.chroma_spatial ?? p.chroma_spat ?? p[1];
        const lt = p.luma_tmp ?? p.luma_temp ?? p[2];
        const ct = p.chroma_tmp ?? p.chroma_temp ?? p[3];
        const partes = [];
        if (l !== undefined) partes.push('luma-spat=' + l);
        if (c !== undefined) partes.push('chroma-spat=' + c);
        if (lt !== undefined) partes.push('luma-temp=' + lt);
        if (ct !== undefined) partes.push('chroma-temp=' + ct);
        return partes.length ? 'hqdn3d{' + partes.join(',') + '}' : 'hqdn3d';
    },

    // gradfun: VLC lo tiene y las opciones coinciden en nombre.
    gradfun: (p) => {
        const partes = [];
        if (p.radius !== undefined) partes.push('radius=' + p.radius);
        if (p.strength !== undefined) partes.push('strength=' + p.strength);
        return partes.length ? 'gradfun{' + partes.join(',') + '}' : 'gradfun';
    },

    // unsharp -> sharpen. VLC NO tiene unsharp; tiene sharpen{sigma=N}.
    // El mapeo de luma_amount a sigma es 1:1 en la practica (ambos son el mismo eje).
    unsharp: (p) => {
        const la = p.luma_amount ?? p.la;
        const amt = (la !== undefined) ? la : (p[0] ?? 0.5);
        return 'sharpen{sigma=' + Number(amt).toFixed(2) + '}';
    },

    // bwdif / yadif -> deinterlace. VLC deinterlaza con yadif2x o blend.
    // bwdif es mejor que yadif, pero VLC no lo tiene: se usa el metodo mas alto disponible.
    bwdif: () => 'deinterlace{mode=yadif2x}',
    yadif: () => 'deinterlace{mode=yadif2x}',

    // fps -> fps. VLC tiene modulo fps.
    fps: (p) => 'fps{fps=' + (p.fps ?? p[0]) + '}',

    // scale / zscale de escalado -> scale. VLC tiene modulo scale, pero sin selector
    // de kernel (lanczos/bicubic). Se declara la escala sin kernel.
    scale: (p) => {
        const w = p.w ?? p.width;
        const h = p.h ?? p.height;
        if (w === undefined || h === undefined) return null;
        return 'scale{width=' + w + ',height=' + h + '}';
    },

    // gaussianblur no tiene equivalente ffmpeg directo, pero VLC lo aporta.
    gaussianblur: (p) => 'gaussianblur{sigma=' + (p.sigma ?? 1) + '}',

    // ── SIN HOMOLOGO REAL — se declara, no se inventa ──
    nlmeans: () => null,        // VLC no tiene nlmeans (denoise no-local). No hay sustituto honesto.
    zscale: () => null,         // VLC no tiene zscale. El transfer/primaries van por KODIPROP/colorspace.
    minterpolate: () => null,   // VLC no interpola frames. Nada que homologar.
    atadenoise: () => null,     // no esta entre los 40 modulos de VLC.
    format: () => null,         // el pixel format lo decide el decoder, no un filtro.
    cas: () => null,
    libplacebo: () => null,
    pp: () => null,
};

// ══════════════════════════════════════════════════════════════════════════════
// Parser de una etapa ffmpeg
// ══════════════════════════════════════════════════════════════════════════════
function parseEtapa(cadena) {
    const s = String(cadena || '').trim();
    if (!s) return null;
    const i = s.indexOf('=');
    if (i < 0) return { filtro: s, params: {}, pos: [] };
    const filtro = s.slice(0, i);
    const resto = s.slice(i + 1);
    // los params de ffmpeg van con ':' ; dentro de cada uno key=value
    const trozos = resto.split(':');
    const params = {};
    const pos = [];
    for (const t of trozos) {
        const j = t.indexOf('=');
        if (j < 0) { pos.push(t); continue; }
        const k = t.slice(0, j);
        const v = t.slice(j + 1);
        params[k] = isNaN(Number(v)) ? v : Number(v);
        pos.push(v);
    }
    return { filtro, params, pos };
}

function homologar(cadenaFfmpeg) {
    const etapas = String(cadenaFfmpeg || '').split(',').map((x) => x.trim()).filter(Boolean);
    const salida = [];
    const viables = [];
    const noViables = [];
    const yaPuestos = new Set();

    for (const e of etapas) {
        const p = parseEtapa(e);
        if (!p) continue;
        const fn = HOMOLOGOS[p.filtro];
        if (!fn) {
            noViables.push({ etapa: e, filtro: p.filtro, razon: 'filtro sin tabla de homologo' });
            continue;
        }
        const vlc = fn(p.params);
        if (vlc === null) {
            noViables.push({ etapa: e, filtro: p.filtro, razon: 'no existe como modulo VLC' });
            continue;
        }
        // dedupe: si dos etapas ffmpeg homologan al mismo modulo VLC, se conserva la primera
        // con su parametro mas fuerte (evita deinterlace dos veces).
        const mod = vlc.split('{')[0];
        if (yaPuestos.has(mod)) {
            noViables.push({ etapa: e, filtro: p.filtro, razon: 'modulo ' + mod + ' ya puesto por otra etapa' });
            continue;
        }
        yaPuestos.add(mod);
        viables.push({ etapa: e, filtro: p.filtro, vlc });
        salida.push(vlc);
    }

    return {
        cadena_vlc: salida.join(':'),   // ':' separa modulos en VLC. ',' NO.
        modulos: salida,
        viables,
        no_viables: noViables,
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// Ejecucion
// ══════════════════════════════════════════════════════════════════════════════
const rec = JSON.parse(fs.readFileSync(RECIPES, 'utf8'));
const ESJSON = process.argv.includes('--json');
const ESCRIBIR = process.argv.includes('--write');

const resultado = {
    schema: 'ape.vlc-homologation/1',
    generado: new Date().toISOString(),
    fuente: 'tools/ape-image-recipes/recipes.json',
    separador: ':',
    nota_separador: 'VLC usa ":" entre modulos. Con "," cada key=value se vuelve un pseudo-modulo y la cadena entera falla.',
    verdad_politica: 'En VLC 3.0.24, #EXTVLCOPT:video-filter esta cerrado por politica ("unsafe option video-filter has been ignored for security reasons"). Esta cadena sirve para el carril CLI (vlc --video-filter=...) y para parsers de modulos VLC; en la playlist sigue inerte.',
    perfiles: {},
};

for (const pid of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
    const r = rec.profiles[pid];
    if (!r) continue;
    // se homologa cada etapa que traiga ffmpeg
    const porEtapa = {};
    const acumulado = [];
    const noViables = [];
    for (const st of (r.stages || [])) {
        if (!st.ffmpeg) continue;
        const h = homologar(st.ffmpeg);
        porEtapa[st.id] = h;
        if (h.cadena_vlc) acumulado.push(h.cadena_vlc);
        noViables.push(...h.no_viables);
    }
    resultado.perfiles[pid] = {
        target_resolution: r.target_resolution,
        source_resolution: r.source_resolution,
        fps: r.fps,
        hdr: r.hdr,
        // cadena final: todos los modulos de todas las etapas, unidos por ':'
        cadena_vlc: acumulado.join(':'),
        por_etapa: porEtapa,
        no_viables: noViables,
        modulos_finales: acumulado.join(':').split(':').map((m) => m.split('{')[0]).filter(Boolean),
    };
}

if (ESJSON) {
    console.log(JSON.stringify(resultado, null, 2));
    if (ESCRIBIR) {
        fs.writeFileSync(JSON_OUT, JSON.stringify(resultado, null, 2), 'utf8');
        console.error('escrito: ' + JSON_OUT);
    }
    process.exit(0);
}

// ── salida legible ────────────────────────────────────────────────────────────
console.log('=== HOMOLOGACION ffmpeg -> VLC ===');
console.log('  separador: ":" (VLC) — con "," falla toda la cadena');
console.log('');
for (const pid of Object.keys(resultado.perfiles)) {
    const p = resultado.perfiles[pid];
    console.log('  ── ' + pid + ' ──  ' + p.target_resolution + '  ' + p.hdr);
    for (const [etapa, h] of Object.entries(p.por_etapa)) {
        for (const v of h.viables) {
            console.log('    OK    [' + etapa + '] ' + v.filtro.padEnd(16) + ' -> ' + v.vlc);
        }
        for (const nv of h.no_viables) {
            console.log('    NULO  [' + etapa + '] ' + nv.filtro.padEnd(16) + ' -> NO_VIABLE (' + nv.razon + ')');
        }
    }
    console.log('');
    console.log('    CADENA VLC: ' + (p.cadena_vlc || '(vacia)'));
    console.log('');
}

console.log('=== VERDAD QUE NO SE ESCONDE ===');
console.log('  ' + resultado.verdad_politica);
console.log('');
console.log('  ==> homologo valido para el carril CLI de VLC y para parsers de modulos.');
console.log('  ==> en #EXTVLCOPT:video-filter de playlist, VLC 3.0.24 lo ignora por politica.');
console.log('  ==> el lever real de pixeles es el VPP del SoC via ARA (soc_vpp_dnr), no la playlist.');
