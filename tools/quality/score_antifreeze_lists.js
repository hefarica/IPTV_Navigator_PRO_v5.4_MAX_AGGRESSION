#!/usr/bin/env node
'use strict';
/*
 * score_antifreeze_lists.js — puntua el equipamiento ANTI-FREEZE que una lista lleva
 * DENTRO de sus cartuchos por canal, con una rubrica declarada y reproducible.
 *
 * POR QUE EXISTE: "cual lista va mejor contra freezes" no se decide por impresion. El
 * nivel N0 (buffer de cliente) y el N1-adyacente (reintentos/metadata) son lo UNICO que
 * una lista puede mover; N2 (gap buffer) y N3 (multiplexor) son infraestructura y no se
 * puntuan aqui. Doctrina: iptv-antifreeze-continuity-doctrine + iptv-hls-buffer-forensics.
 *
 * LIMITE DECLARADO: esto mide lo DECLARADO en la lista, no lo APLICADO por un player.
 * Un tag declarado es `declarado` en la escalera de evidencia; nunca `aplicado`.
 *
 * Uso:
 *   node tools/quality/score_antifreeze_lists.js <archivo...> [--max-channels N] \
 *        [--out-json <ruta>] [--out-md <ruta>]
 *
 * Muestreo: si un fichero tiene mas canales que --max-channels (def. 400), se declara
 * `scope.mode=sample` con su denominador; con menos, es censo completo.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);

/* [2026-11-22 · MEDIDO] El parser anterior hacia files = args.filter(!startsWith('--')),
 * que conserva el VALOR de cada flag como si fuera un fichero: `--max-channels 50`
 * metia "50" en la lista, y el scorecard publicaba filas [AUSENTE] para 50, para la
 * ruta del JSON y para la del MD. Ademas rompia la idempotencia medida (dos corridas
 * con distinta ruta de salida daban JSON distinto). Ahora un flag consume su valor y
 * solo los argumentos posicionales son ficheros de entrada. */
const opts = Object.create(null);
const files = [];
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
        const name = a.slice(2);
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('--')) { opts[name] = next; i++; }
        else { opts[name] = true; }
    } else {
        files.push(a);
    }
}
const opt = (n, d) => (opts[n] !== undefined && opts[n] !== true) ? opts[n] : d;
const MAX_CH = Number(opt('max-channels', '400'));

/** Numeros tolerantes: "30000", "30s", "30" -> ms o null. */
const ms = (v) => {
    if (v == null) return null;
    const m = String(v).match(/(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
};

/* ───────────── RUBRICA DECLARADA (100 puntos por canal) ─────────────
 * N0 buffer de cliente (40) · N0 por-player (20) · N1 resiliencia (25) · prefetch (15)
 * Cada item: {id, peso, test(blockText, kv) -> bool}
 */
const RUBRIC = [
    // N0 — buffer de cliente
    { id: 'X-Buffer-Target >= 12000 ms', w: 10, fam: 'N0', t: (b) => { const v = ms(pick(b, /X-Buffer-Target["':\s]+(\d+)/i)); return v != null && v >= 12000; } },
    { id: 'X-Buffer-Min ~ 62.5% de Target', w: 8, fam: 'N0', t: (b) => { const t = ms(pick(b, /X-Buffer-Target["':\s]+(\d+)/i)); const m = ms(pick(b, /X-Buffer-Min["':\s]+(\d+)/i)); return t != null && m != null && Math.abs(m - t * 0.625) <= Math.max(1500, t * 0.08); } },
    { id: 'X-Buffer-Max ~ 2x Target', w: 6, fam: 'N0', t: (b) => { const t = ms(pick(b, /X-Buffer-Target["':\s]+(\d+)/i)); const x = ms(pick(b, /X-Buffer-Max["':\s]+(\d+)/i)); return t != null && x != null && Math.abs(x - t * 2) <= t * 0.5; } },
    { id: 'load_control minBufferMs >= 12000', w: 8, fam: 'N0', t: (b) => { const v = ms(pick(b, /minBufferMs["':\s]+(\d+)/i)); return v != null && v >= 12000; } },
    { id: 'bufferForPlaybackAfterRebufferMs >= 3000', w: 8, fam: 'N0', t: (b) => { const v = ms(pick(b, /bufferForPlaybackAfterRebufferMs["':\s]+(\d+)/i)); return v != null && v >= 3000; } },
    // N0 por-player
    { id: 'VLC network-caching >= 15000', w: 10, fam: 'N0p', t: (b) => { const v = ms(pick(b, /network-caching[=:\s]+(\d+)/i)); return v != null && v >= 15000; } },
    { id: 'KODIPROP buffer >= 15000', w: 10, fam: 'N0p', t: (b) => { const v = ms(pick(b, /(?:buffer_size|buffer-size|network_buffer|buffersize)[=:\s"]+(\d+)/i)); return v != null && v >= 15000; } },
    // N1 — resiliencia / reintento
    { id: 'escalera RESILIENCE (>=3 niveles)', w: 10, fam: 'N1', t: (b) => (b.match(/RESILIENCE/gi) || []).length >= 3 },
    { id: 'reintento/backoff declarado', w: 8, fam: 'N1', t: (b) => /RETRY|BACKOFF|RETRIES/i.test(b) },
    { id: 'failover / fuente alternativa', w: 7, fam: 'N1', t: (b) => /FAILOVER|BACKUP|FALLBACK/i.test(b) },
    // Prefetch / throughput
    { id: 'prefetch de segmentos declarado', w: 8, fam: 'PF', t: (b) => /PREFETCH|X-Prefetch-Segments/i.test(b) },
    { id: 'throughput / BBR declarado', w: 7, fam: 'PF', t: (b) => /THROUGHPUT|BBR|CONGESTION/i.test(b) },
];

function pick(b, re) { const m = b.match(re); return m ? m[1] : null; }

/** Recorre un fichero y devuelve el analisis por canal (hasta MAX_CH). */
async function scan(file) {
    const st = fs.statSync(file);
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    let lines = 0, channels = 0, inBlock = false, block = [];
    let blockLines = [];
    const totals = Object.fromEntries(RUBRIC.map((r) => [r.id, 0]));
    let scoreSum = 0;
    let truncated = false;
    let bytesRead = 0;

    const close = () => {
        if (!inBlock || !block.length) return;
        channels++;
        blockLines.push(block.length);
        const text = block.join('\n');
        let sc = 0;
        for (const r of RUBRIC) { if (r.t(text)) { totals[r.id]++; sc += r.w; } }
        scoreSum += sc;
        block = [];
    };

    for await (const line of rl) {
        lines++;
        bytesRead += Buffer.byteLength(line) + 1;
        const t = line.trimStart();
        if (t.startsWith('#EXTINF')) {
            if (inBlock) close();
            if (channels >= MAX_CH) { truncated = true; break; }
            inBlock = true;
            block = [line];
            continue;
        }
        if (inBlock) block.push(line);
    }
    if (!truncated) close();
    rl.close();

    const scope = truncated ? { mode: 'sample', analyzed: channels, denominator_hint: 'ver #EXT-X-APE-CHANNELS' } : { mode: 'censo', analyzed: channels };
    const coverage = Object.fromEntries(RUBRIC.map((r) => [r.id, channels ? +(100 * totals[r.id] / channels).toFixed(1) : 0]));
    const score = channels ? +(scoreSum / channels).toFixed(1) : 0;
    return {
        file: path.basename(file), bytes: st.size, lines_read: lines, bytes_read: bytesRead,
        channels_analyzed: channels, block_lines_avg: blockLines.length ? +(blockLines.reduce((a, b) => a + b, 0) / blockLines.length).toFixed(1) : 0,
        scope, score, coverage,
    };
}

(async () => {
    const out = [];
    for (const f of files) {
        if (!fs.existsSync(f)) { out.push({ file: path.basename(f), error: 'AUSENTE' }); continue; }
        try { out.push(await scan(f)); } catch (e) { out.push({ file: path.basename(f), error: String(e.message || e) }); }
    }
    out.sort((a, b) => (b.score || -1) - (a.score || -1));
    const json = { rubric_points: RUBRIC.reduce((a, r) => a + r.w, 0), rubric: RUBRIC.map((r) => ({ id: r.id, w: r.w, fam: r.fam })), max_channels: MAX_CH, generated_at: new Date().toISOString(), results: out };
    const jp = opt('out-json', '');
    if (jp) fs.writeFileSync(jp, JSON.stringify(json, null, 2), 'utf8');

    const md = [];
    md.push('# Scorecard anti-freeze de listas (rubrica declarada, ' + json.rubric_points + ' puntos/canal)');
    md.push('');
    md.push('> Mide lo **declarado** en el cartucho de cada canal. `declarado` ≠ `aplicado`: ningun');
    md.push('> player se ejecuto aqui. Muestreo declarado por fichero en `scope`.');
    md.push('');
    md.push('| # | lista | score | canales | bloque(lin) | ' + RUBRIC.map((r) => r.fam).filter((v, i, a) => a.indexOf(v) === i).join(' | ') + ' |');
    md.push('|---|---|---:|---:|---:|---|');
    out.forEach((r, i) => {
        if (r.error) { md.push(`| ${i + 1} | ${r.file} | — | ${r.error} | | |`); return; }
        md.push(`| ${i + 1} | \`${r.file}\` | **${r.score}** | ${r.channels_analyzed}${r.scope.mode === 'sample' ? ' (muestra)' : ''} | ${r.block_lines_avg} | |`);
    });
    md.push('');
    md.push('## Cobertura por palanca (%% de canales analizados que la declaran)');
    md.push('');
    md.push('| palanca | ' + out.filter((r) => !r.error).map((r) => r.file.slice(0, 18)).join(' | ') + ' |');
    for (const r of RUBRIC) {
        const cells = out.filter((x) => !x.error).map((x) => (x.coverage[r.id] == null ? '—' : x.coverage[r.id] + '%'));
        md.push(`| ${r.id} (${r.w}) | ${cells.join(' | ')} |`);
    }
    const mp = opt('out-md', '');
    if (mp) fs.writeFileSync(mp, md.join('\n') + '\n', 'utf8');

    console.log('rubrica=' + json.rubric_points + ' pts/canal · ficheros=' + out.length);
    out.slice(0, 8).forEach((r, i) => console.log(`  ${i + 1}. ${(r.score ?? 'ERR').toString().padStart(6)}  ${r.file}${r.error ? '  [' + r.error + ']' : '  canales=' + r.channels_analyzed}`));
    if (jp) console.log('JSON -> ' + jp);
    if (mp) console.log('MD   -> ' + mp);
})();
