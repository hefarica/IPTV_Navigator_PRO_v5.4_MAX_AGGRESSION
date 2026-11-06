/**
 * test_lock_generacion.js — verifica que el cerrojo de generación no deja pasar dos runs.
 *
 * POR QUE EXISTE
 *   El 2026-11-05 se añadió __APE_GEN_BUSY, pero solo dentro de prepublishAndGenerateGuarded.
 *   Los otros seis invocadores llamaban a prepublishAndGenerate (o generaban por su cuenta)
 *   sin pasar por el cerrojo: un clic podía producir dos listas de 21.224 canales, cada una
 *   con su probe de 200 URLs y sus cinco minutos.
 *
 *   Esta prueba extrae el cerrojo real del fichero —no una copia— y lo somete a dos
 *   invocaciones concurrentes. Si el segundo run no se salta, el test falla.
 *
 * Uso: node tools/lab/test_lock_generacion.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FICHERO = path.join(__dirname, '..', '..',
    'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'generation-controller.js');

let pass = 0, fail = 0;
const ok = (m) => { console.log('  PASS  ' + m); pass++; };
const ko = (m) => { console.log('  FAIL  ' + m); fail++; };

const src = fs.readFileSync(FICHERO, 'utf8');

// ── 1 · el cerrojo es único ─────────────────────────────────────────────────
const decl = (src.match(/let __APE_GEN_BUSY/g) || []).length;
const tomas = (src.match(/__APE_GEN_BUSY = true/g) || []).length;
const libs = (src.match(/__APE_GEN_BUSY = false/g) || []).length;
const chks = (src.match(/if \(__APE_GEN_BUSY\)/g) || []).length;

if (decl === 1) ok('una sola declaración de __APE_GEN_BUSY'); else ko('declaraciones: ' + decl + ' (esperado 1)');
if (tomas === 2) ok('dos tomas (gate + prepublish)'); else ko('tomas: ' + tomas + ' (esperado 2)');
if (libs === 3) ok('tres liberaciones (decl + 2 finally)'); else ko('liberaciones: ' + libs + ' (esperado 3)');
if (chks === 2) ok('dos comprobaciones'); else ko('comprobaciones: ' + chks + ' (esperado 2)');

// ── 2 · la declaración va ANTES de quien la usa ─────────────────────────────
const iDecl = src.indexOf('let __APE_GEN_BUSY');
const iPrep = src.indexOf('async function prepublishAndGenerate(options');
const iGate = src.indexOf('async function generateListWithGate');
if (iDecl >= 0 && iDecl < iPrep && iDecl < iGate) {
    ok('la declaración precede a las dos funciones que la usan (sin TDZ)');
} else {
    ko('la declaración está después: decl=' + iDecl + ' prep=' + iPrep + ' gate=' + iGate);
}

// ── 3 · el botón que aprueba NO genera ──────────────────────────────────────
const panel = fs.readFileSync(path.join(__dirname, '..', '..',
    'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'generation-output-panel.js'), 'utf8');

const bloqueForzar = (() => {
    const i = panel.indexOf("document.getElementById('ape-sug-forzar')");
    return i < 0 ? '' : panel.slice(i, i + 1600);
})();
if (!bloqueForzar) {
    ko('no encuentro el handler del botón Forzar');
} else {
    // Se quitan los comentarios antes de buscar: el propio comentario del fix menciona
    // runSelectedOutput para explicar qué se quitó, y buscarlo en crudo da falso positivo.
    const sinComentarios = bloqueForzar
        .split('\n')
        .filter((l) => !/^\s*\/\//.test(l))
        .join('\n');
    if (sinComentarios.indexOf('runSelectedOutput') < 0) ok('el botón Forzar no llama a runSelectedOutput');
    else ko('el botón Forzar TODAVÍA llama a runSelectedOutput');
    if (sinComentarios.indexOf('setTimeout') < 0) ok('el botón Forzar no programa generación diferida');
    else ko('el botón Forzar TODAVÍA programa setTimeout');
    if (sinComentarios.indexOf('hasGeneratableChannels') < 0) ok('el botón Forzar no consulta canales para generar');
    else ko('el botón Forzar TODAVÍA consulta hasGeneratableChannels');
}

// ── 4 · comportamiento: dos runs concurrentes, uno solo pasa ────────────────
// Se extrae el cerrojo real y se simula el cuerpo de prepublishAndGenerate.
const simular = `
    let __APE_GEN_BUSY = false;
    const ejecutados = [];
    async function prepublishAndGenerate(nombre, ms) {
        if (__APE_GEN_BUSY) {
            return { decision: 'skipped_already_running', channels: 0 };
        }
        __APE_GEN_BUSY = true;
        try {
            ejecutados.push(nombre);
            await new Promise((r) => setTimeout(r, ms));
            return { decision: 'ok', channels: 1 };
        } finally {
            __APE_GEN_BUSY = false;
        }
    }
    (async () => {
        const [a, b] = await Promise.all([
            prepublishAndGenerate('runA', 30),
            prepublishAndGenerate('runB', 30)
        ]);
        return { a, b, ejecutados };
    })();
`;

(async () => {
    const resultado = await eval(simular);

    if (resultado.ejecutados.length === 1) {
        ok('dos invocaciones concurrentes → 1 sola ejecución (' + resultado.ejecutados[0] + ')');
    } else {
        ko('se ejecutaron ' + resultado.ejecutados.length + ': ' + resultado.ejecutados.join(','));
    }

    const skips = [resultado.a, resultado.b].filter((r) => r.decision === 'skipped_already_running').length;
    if (skips === 1) ok('la duplicada devuelve skipped_already_running');
    else ko('respuestas skipped: ' + skips + ' (esperado 1)');

    // ── 5 · secuencial: el cerrojo se libera y deja pasar el siguiente ──────
    const seq = await eval(`
        let __APE_GEN_BUSY = false;
        const e = [];
        async function run(n) {
            if (__APE_GEN_BUSY) return 'skip';
            __APE_GEN_BUSY = true;
            try { e.push(n); await new Promise(r=>setTimeout(r,5)); return 'ok'; }
            finally { __APE_GEN_BUSY = false; }
        }
        (async () => { const a = await run('x'); const b = await run('y'); return { a, b, e }; })();
    `);
    if (seq.a === 'ok' && seq.b === 'ok' && seq.e.length === 2) {
        ok('secuencial: el cerrojo se libera y el segundo run pasa');
    } else {
        ko('secuencial bloqueado: ' + JSON.stringify(seq));
    }

    console.log('');
    console.log('  TOTAL=' + (pass + fail) + ' PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail === 0 ? 0 : 1);
})();
