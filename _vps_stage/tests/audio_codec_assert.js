#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * audio_codec_assert.js · [t97]
 *
 * REGLA DEL PROPIETARIO:
 *   «La preferencia viene del ADN; la VERDAD del probe. Si chocan, gana la
 *    verdad. Sin evidencia => NO declarar audio.»
 *
 * CAUSA MEDIDA: 778 canales 4K declaraban `ac-3` en CODECS y NO reproducían,
 * mientras los 9.742 sin audio declarado SÍ reproducían. El propio canal se
 * contradecía: su #EXTHTTP decía `mp4a.40.2` y el STREAM-INF decía `ac-3`.
 *
 * COMPRUEBA:
 *   §1  `_codecAudio` ya NO cae a la preferencia del perfil (codec_chain_audio)
 *   §2  Se alimenta de la evidencia del probe (audioCodec) y, si no hay, de la
 *       evidencia explícita del canal (#EXTHTTP), y si tampoco, queda VACÍO
 *   §3  El STREAM-INF omite el audio cuando no hay evidencia (coma condicional)
 *   §4  El guard ec-3/EAC3 → ac-3 sigue existiendo (no se ha perdido)
 *   §5  El prober expone el audio real del manifiesto (audioCodec)
 *
 * Uso: node _vps_stage/tests/audio_codec_assert.js   → 0 PASS / 1 FAIL
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const EMITTER = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const PROBER = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'ape-quality-prober.js');

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
    if (cond) { pass += 1; return true; }
    failures.push(detail ? `${name} — ${detail}` : name);
    return false;
};
const section = (t) => console.log(`\n── ${t}`);

const src = fs.readFileSync(EMITTER, 'utf8');
const prob = fs.readFileSync(PROBER, 'utf8');

console.log('══ t97 · AUDIO CODEC ASSERT (la verdad del probe manda) ══');
console.log(`   emisor ${EMITTER.split(path.sep).pop()} (${src.length} B)`);

// ── §1 · ya no cae a la preferencia del perfil ──────────────────────────────
section('[1] `_codecAudio` no cae a la preferencia del perfil');
{
    const iDef = src.indexOf('let _codecAudio');
    ok('1.0 existe la definición de _codecAudio', iDef > -1);
    const block = src.slice(iDef, iDef + 900);
    const _initPart = block.slice(0, block.indexOf('})();'));
    ok('1.1 NO usa codec_chain_audio en su inicialización', !/codec_chain_audio/.test(_initPart));
    ok('1.2 NO usa cfg.audio_codec como fallback directo',
        !/cfg\.audio_codec\s*\|\|/.test(block.slice(0, block.indexOf('})();') + 5)));
}

// ── §2 · alimentado por evidencia ───────────────────────────────────────────
section('[2] Evidencia: probe primero, #EXTHTTP después, vacío si no hay');
{
    const iDef = src.indexOf('let _codecAudio');
    const block = src.slice(iDef, iDef + 900);
    ok('2.1 lee el probe (_probeData.audioCodec)', /_probeData\s*&&\s*_probeData\.audioCodec/.test(block));
    ok('2.2 lee la evidencia del canal (#EXTHTTP)', /X-Audio-Codec-Preferred|X-APE-Codec-Audio|audioCodec/.test(block));
    ok('2.3 si no hay evidencia devuelve cadena vacía', /return ""/.test(block));
}

// ── §3 · el STREAM-INF omite el audio sin evidencia ─────────────────────────
section('[3] STREAM-INF: coma condicional (sin audio si no hay evidencia)');
{
    const m = src.match(/CODECS="\$\{_codec796_csv\}([^"]*)"/);
    ok('3.0 existe la composición de CODECS del STREAM-INF', !!m);
    ok('3.1 usa coma CONDICIONAL, no fija', !!m && /\$\{_codecAudio \?/.test(m[1]), m ? m[1] : '(no match)');
    ok('3.2 ya NO hay `,${_codecAudio}` fijo en el STREAM-INF',
        !/CODECS="\$\{_codec796_csv\},\$\{_codecAudio\}"/.test(src));
}

// ── §4 · guard ec-3 → ac-3 intacto ──────────────────────────────────────────
section('[4] Guard ec-3/EAC3 → ac-3 intacto');
{
    ok('4.1 el guard sigue presente', /ec-3\|ec\\\+3\|eac3\|e-ac3/i.test(src));
    ok('4.2 mapea a ac-3', /_codecAudio = 'ac-3'/.test(src));
}

// ── §5 · el prober expone el audio real ─────────────────────────────────────
section('[5] El prober extrae el audio real del manifiesto');
{
    ok('5.1 el prober busca audioCodec en CODECS', /audioCodec/.test(prob));
    ok('5.2 parte de los CODECS del manifiesto', /codecsFull|CODECS/.test(prob));
}

// ── §6 · veredicto sobre una lista regenerada (si se le pasa) ───────────────
section('[6] Lista regenerada: 0 `ac-3` sin evidencia');
{
    const listPath = process.env.APE_LIST || '';
    if (listPath && fs.existsSync(listPath)) {
        const list = fs.readFileSync(listPath, 'utf8');
        const ac3 = (list.match(/,ac-3"/g) || []).length;
        const mp4a = (list.match(/,mp4a\.40\.2"/g) || []).length;
        const sinAudio = (list.match(/CODECS="[^,"]+"/g) || []).length;
        console.log(`   lista: ac-3=${ac3} · mp4a.40.2=${mp4a} · sin audio=${sinAudio}`);
        ok('6.1 no queda ningún `ac-3` declarado', ac3 === 0, `ac-3=${ac3}`);
    } else {
        console.log('   · [UNKNOWN] sin APE_LIST: no se comprueba la lista regenerada');
    }
}

console.log('\n' + '═'.repeat(60));
if (failures.length === 0) {
    console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
    process.exit(0);
}
console.log(`RESULTADO: FAIL — ${pass} aserciones OK, ${failures.length} fallo(s)`);
for (const f of failures.slice(0, 20)) console.log(`  ✗ ${f}`);
process.exit(1);
