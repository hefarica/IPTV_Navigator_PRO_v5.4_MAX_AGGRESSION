/* Validador ESTRUCTURAL + REGLA nginx que tumbó la primera versión:
 *   en `location ~` (regex) `proxy_pass` NO puede llevar parte URI.
 * Detecta esa regla y las demás condiciones del diseño. */
const fs = require('fs');
const F = process.argv[2];
const src = fs.readFileSync(F, 'utf8');
const lines = src.split('\n');

let depth = 0;
const locations = [];
let bloque = null;
lines.forEach((l, i) => {
    const t = l.replace(/#.*$/, '').trim();
    if (!t) return;
    if (/^location\b/.test(t)) {
        const tipo = /^location\s+=\s/.test(t) ? 'exact'
            : /^location\s+\^~\s/.test(t) ? 'prefix-^~'
                : /^location\s+~\s/.test(t) ? 'regex' : 'prefix';
        const target = (t.match(/^location\s+(?:=\s+|\^~\s+|~\s*)?(.*?)\s*\{/) || [])[1] || '?';
        bloque = { linea: i + 1, tipo, target, proxyUri: null, hasReturn404: false, hasRewrite: false, hasAlias: false };
        locations.push(bloque);
    }
    if (bloque) {
        const pm = /proxy_pass\s+http:\/\/127\.0\.0\.1:3099(\/?);/.exec(t);
        if (pm) bloque.proxyUri = pm[1] === '/' ? 'con-URI' : 'sin-URI';
        if (/^return\s+404/.test(t)) bloque.hasReturn404 = true;
        if (/^rewrite\s+\^\/jit\//.test(t)) bloque.hasRewrite = true;
        if (/^alias\s+/.test(t)) bloque.hasAlias = true;
    }
    for (const ch of t) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (depth === 0) bloque = null;
});

const regexConUri = locations.filter(l => l.tipo === 'regex' && l.proxyUri === 'con-URI');
const regexSinRewrite = locations.filter(l => l.tipo === 'regex' && l.proxyUri === 'sin-URI' && !l.hasRewrite);
const cierre = locations.filter(l => l.tipo === 'prefix' && l.hasReturn404);
const proxied = locations.filter(l => l.proxyUri);
const exact = locations.filter(l => l.tipo === 'exact').map(l => l.target);
const dup = exact.filter((v, i) => exact.indexOf(v) !== i);

const out = {
    archivo: F.split(/[\\/]/).pop(),
    lineas: lines.length,
    llaves: depth === 0 ? 'balanceadas' : 'DESBALANCE (' + depth + ')',
    locations: locations.length,
    porTipo: {
        exact: locations.filter(l => l.tipo === 'exact').length,
        'prefix-^~': locations.filter(l => l.tipo === 'prefix-^~').length,
        regex: locations.filter(l => l.tipo === 'regex').length,
        prefix: locations.filter(l => l.tipo === 'prefix').length
    },
    chequeos: {
        llavesBalanceadas: depth === 0,
        'REGLA_nginx_sin_proxy_pass_con_URI_en_regex': regexConUri.length === 0,
        'regex_sin_URI_lleva_rewrite_break': regexSinRewrite.length === 0,
        sinDuplicadosExactos: dup.length === 0,
        existeCierre404: cierre.length === 1,
        cierreEsPrefijoNormal: cierre.length === 1 && cierre[0].tipo === 'prefix',
        liveEsPrefixCaretTilde: locations.some(l => l.tipo === 'prefix-^~' && /\/jit\/live\//.test(l.target)),
        ningunaEscrituraPublicada: !proxied.some(l => /\/jit\/(image|api|jit|go|resolve|tune|signal)/.test(l.target)),
        estaticasPreservadas: locations.filter(l => l.hasAlias).length === 2
    },
    detalle: {
        regex: locations.filter(l => l.tipo === 'regex').map(l => ({ linea: l.linea, target: l.target, proxy: l.proxyUri, rewrite: l.hasRewrite })),
        cierre: cierre.map(l => ({ linea: l.linea, target: l.target, tipo: l.tipo }))
    }
};
console.log(JSON.stringify(out, null, 1));
const fallos = Object.keys(out.chequeos).filter(k => !out.chequeos[k]);
console.log('\nRESULTADO: ' + (fallos.length === 0 ? 'ESTRUCTURA OK' : 'FALLOS -> ' + fallos.join(', ')));
process.exitCode = fallos.length === 0 ? 0 : 1;
