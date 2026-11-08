#!/usr/bin/env node
'use strict';

// [2026-11-08] Verificación CONSOLIDADA de alineación lista <-> LAB.
//
// Reúne en un solo comando las mediciones que se hicieron a mano durante la auditoría, para que
// cualquiera (incluida la auditoría externa) las reproduzca sin creerse un informe.
//
// Fail-honest: lo que no se puede medir se reporta NO_COMPUTADO con su razón, jamás como cero.
// No imprime credenciales: solo cuenta la firma Xtream.
//
// Uso:
//   node tools/audit/verify_alignment_with_lab.js --list <ruta.m3u8> --lab <ruta.json> [--json <salida>]

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const args = process.argv.slice(2);
const argOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const LIST = argOf('--list');
const LAB = argOf('--lab');
const JSONOUT = argOf('--json');

if (!LIST || !LAB) {
    console.error('uso: node tools/audit/verify_alignment_with_lab.js --list <m3u8> --lab <lab.json> [--json out.json]');
    process.exit(2);
}
for (const p of [LIST, LAB]) {
    if (!fs.existsSync(p)) { console.error('no existe: ' + p); process.exit(2); }
}

// Módulos que VLC implementa de verdad (skill ape-image-pipeline-truth §6, medido sobre VLC 3.0.24)
const VLC_REAL = ['gradfun', 'hqdn3d', 'deinterlace', 'sharpen'];
const PROVIDER_HOSTS = /(?:evestv\.wuitf\.com|line\.tivi-ott\.net|nfqdeuxu\.x1megaott\.store)/;

const sha256 = (file) => new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('data', d => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
});

function zeroCounters() {
    return {
        extinf: 0, uris: 0, pipeHeaders: 0,
        cr6k: 0, cr6kMode: 0, cr6kTruth: 0, cr6kProv: {},
        profiles: {},               // ape-profile -> n
        filterChains: {},           // perfil -> Set(cadena)
        atadenoiseCount: 0,
        extRea: 0, extSource: 0, extDna: {},
        extHttp: 0, extHttpBadJson: 0, extHttpBytes: { min: Infinity, max: 0 },
        metaChunks: {},             // idx -> {total, payload}
        xstreamTriples: 0,
        tvgIds: {},
        streamInf: 0
    };
}

async function scanList(file) {
    const c = zeroCounters();
    const stream = fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 });
    let tail = '';
    let curProfile = null;

    const handle = (line) => {
        if (line.startsWith('#EXTINF')) {
            c.extinf++;
            const m = line.match(/ape-profile="([^"]+)"/);
            curProfile = m ? m[1] : '?';
            c.profiles[curProfile] = (c.profiles[curProfile] || 0) + 1;
            const t = line.match(/tvg-id="([^"]*)"/);
            if (t) { const k = t[1]; if (k) c.tvgIds[k] = (c.tvgIds[k] || 0) + 1; }
            return;
        }
        if (line.startsWith('#EXT-X-APE-CRYSTAL-6K:')) {
            c.cr6k++;
            const m = line.match(/PROVENANCE=([^;\s]+)/);
            if (m) c.cr6kProv[m[1]] = (c.cr6kProv[m[1]] || 0) + 1;
            return;
        }
        if (line.startsWith('#EXT-X-APE-CRYSTAL-6K-MODE:')) { c.cr6kMode++; return; }
        if (line.startsWith('#EXT-X-APE-CRYSTAL-6K-TRUTH:')) { c.cr6kTruth++; return; }
        if (line.startsWith('#EXTVLCOPT:video-filter=')) {
            const chain = line.slice('#EXTVLCOPT:video-filter='.length).trim();
            const p = curProfile || '?';
            (c.filterChains[p] = c.filterChains[p] || new Set()).add(chain);
            if (chain.indexOf('atadenoise') >= 0) c.atadenoiseCount++;
            return;
        }
        if (line.startsWith('#EXT-X-APE-REA:')) { c.extRea++; return; }
        if (line.startsWith('#EXT-X-APE-SOURCE:')) { c.extSource++; return; }
        if (line.startsWith('#EXT-X-APE-LAB-DNA:')) {
            const m = line.match(/sha256=([^,\s]+)/);
            const k = m ? m[1] : 'sin-campo';
            c.extDna[k] = (c.extDna[k] || 0) + 1;
            return;
        }
        if (line.startsWith('#EXT-X-APE-LAB-METADATA:')) {
            const m = line.match(/^#EXT-X-APE-LAB-METADATA:(\d+)\/(\d+):(.*)$/);
            if (m) c.metaChunks[Number(m[1])] = { total: Number(m[2]), payload: m[3] };
            return;
        }
        if (line.startsWith('#EXTHTTP:')) {
            c.extHttp++;
            const body = line.slice('#EXTHTTP:'.length);
            const bytes = Buffer.byteLength(body, 'utf8');
            if (bytes < c.extHttpBytes.min) c.extHttpBytes.min = bytes;
            if (bytes > c.extHttpBytes.max) c.extHttpBytes.max = bytes;
            try { JSON.parse(body); } catch (_e) { c.extHttpBadJson++; }
            return;
        }
        if (line.startsWith('#EXT-X-STREAM-INF:')) { c.streamInf++; return; }
        if (line.startsWith('http')) {
            c.uris++;
            if (line.indexOf('|') >= 0) c.pipeHeaders++;
            if (PROVIDER_HOSTS.test(line)) c.xstreamTriples++;
            return;
        }
    };

    await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => {
            const buf = tail + chunk;
            const parts = buf.split('\n');
            tail = parts.pop();
            for (const raw of parts) handle(raw.replace(/\r$/, ''));
        });
        stream.on('end', () => { if (tail) handle(tail.replace(/\r$/, '')); resolve(); });
        stream.on('error', reject);
    });
    return c;
}

function modulesOf(chain) {
    return String(chain || '').split(',').map(t => {
        const m = t.trim().match(/^([A-Za-z0-9_]+)/);
        return m ? m[1].toLowerCase() : null;
    }).filter(Boolean);
}

function main() {
    const lab = JSON.parse(fs.readFileSync(LAB, 'utf8'));
    const start = Date.now();
    return (async () => {
        const listSha = await sha256(LIST);
        const labSha = await sha256(LAB);
        const c = await scanList(LIST);

        const pc = lab.profiles_calibrated || {};
        const labBitDepth = {};
        for (const pf of Object.keys(pc)) {
            const s = (pc[pf] && pc[pf].settings) || {};
            const bd = s.bit_depth, al = s.bitDepth;
            if (bd == null && al == null) continue;
            labBitDepth[pf] = {
                bit_depth: bd == null ? null : String(bd),
                alias_bitDepth: al == null ? null : String(al),
                governs: bd == null ? (al == null ? null : String(al)) : String(bd),
                disagree: bd != null && al != null && String(bd) !== String(al)
            };
        }
        const disagreeing = Object.keys(labBitDepth).filter(k => labBitDepth[k].disagree);

        // cadenas por perfil: cuántas distintas, cuántos módulos sin equivalente VLC
        const chains = {};
        for (const pf of Object.keys(c.filterChains)) {
            const set = [...c.filterChains[pf]];
            chains[pf] = set.map(ch => {
                const mods = modulesOf(ch);
                return {
                    len: ch.length,
                    modules: mods,
                    vlc_modules: mods.filter(m => VLC_REAL.indexOf(m) >= 0),
                    no_vlc_module: mods.filter(m => VLC_REAL.indexOf(m) < 0),
                    has_atadenoise: ch.indexOf('atadenoise') >= 0
                };
            });
        }

        let embeddedMeta = null;
        const idx = Object.keys(c.metaChunks).map(Number).sort((a, b) => a - b);
        if (idx.length) {
            try {
                const b64 = idx.map(i => c.metaChunks[i].payload).join('');
                const meta = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
                const fld = meta.fields || {};
                const ql = fld.quality_levels || (fld.settings || {}).quality_levels || {};
                embeddedMeta = {
                    bytes: Buffer.from(b64, 'base64').length,
                    schema: meta.schema || null,
                    chunks: idx.length,
                    quality_levels: Object.keys(ql).length,
                    atadenoise_in_meta: JSON.stringify(meta).indexOf('atadenoise') >= 0
                };
            } catch (e) { embeddedMeta = { error: e.message }; }
        }

        const dupTvg = Object.keys(c.tvgIds).filter(k => c.tvgIds[k] > 1);

        const report = {
            schema: 'ape.audit/alignment-with-lab/1',
            measured_at: new Date().toISOString(),
            elapsed_ms: Date.now() - start,
            list: { path: LIST, sha256: listSha, bytes: fs.statSync(LIST).size },
            lab: { path: LAB, sha256: labSha, bytes: fs.statSync(LAB).size, version: lab.version || null, lab_version: lab.lab_version || null },
            structure: {
                channels: c.extinf,
                uris: c.uris,
                one_uri_per_channel: c.extinf === c.uris,
                pipe_headers: c.pipeHeaders,
                stream_inf: c.streamInf,
                duplicate_tvg_id: dupTvg.length,
                ext_http_valid: c.extHttp - c.extHttpBadJson,
                ext_http_invalid: c.extHttpBadJson,
                ext_http_bytes_min: c.extHttpBytes.min === Infinity ? null : c.extHttpBytes.min,
                ext_http_bytes_max: c.extHttpBytes.max || null
            },
            layer_6k: {
                tags: c.cr6k,
                mode_tags: c.cr6kMode,
                truth_tags: c.cr6kTruth,
                provenance: c.cr6kProv,
                activation_gated_declared: null
            },
            filter_chains: chains,
            atadenoise_in_emitted_chains: c.atadenoiseCount,
            embedded_metadata: embeddedMeta,
            bit_depth_precedence: {
                governs: 'bit_depth',
                evidence: '_firstDef(s.bit_depth, s.bitDepth, ...)',
                per_profile: labBitDepth,
                disagreeing_profiles: disagreeing
            },
            dna: { values: c.extDna, lab_sha256: labSha, matches_lab: Object.prototype.hasOwnProperty.call(c.extDna, labSha) },
            rea_contract: { ext_x_ape_rea: c.extRea, ext_x_ape_source: c.extSource },
            credentials: { xtream_uris_matched: c.xstreamTriples, note: 'solo conteo; no se imprimen valores' }
        };

        if (JSONOUT) fs.writeFileSync(JSONOUT, JSON.stringify(report, null, 2) + '\n', 'utf8');

        // ── resumen legible ──
        const ok = (b) => (b ? 'SI' : 'NO');
        console.log('lista: ' + path.basename(LIST) + '  sha256=' + listSha.slice(0, 16) + '...  ' + report.list.bytes + ' B');
        console.log('LAB  : ' + path.basename(LAB) + '  sha256=' + labSha.slice(0, 16) + '...  version=' + (lab.version || '?'));
        console.log('');
        console.log('ESTRUCTURA      canales=' + c.extinf + '  uris=' + c.uris + '  1-uri-por-canal=' + ok(c.extinf === c.uris)
            + '  exthttp_ok=' + report.structure.ext_http_valid + '  exthttp_mal=' + c.extHttpBadJson
            + '  tvg_id_dup=' + dupTvg.length);
        console.log('6K              tags=' + c.cr6k + '  MODE=' + c.cr6kMode + '  TRUTH=' + c.cr6kTruth + '  PROVENANCE=' + JSON.stringify(c.cr6kProv));
        console.log('RECETAS         cadenas distintas por perfil: ' + Object.keys(chains).map(p => p + '=' + chains[p].length).join(' ') + '  atadenoise=' + c.atadenoiseCount);
        console.log('METADATA        chunks=' + (embeddedMeta ? embeddedMeta.chunks : 'NO COMPUTADO')
            + (embeddedMeta && embeddedMeta.quality_levels != null ? '  quality_levels=' + embeddedMeta.quality_levels : '')
            + (embeddedMeta && embeddedMeta.atadenoise_in_meta != null ? '  atadenoise_en_meta=' + ok(embeddedMeta.atadenoise_in_meta) : ''));
        console.log('BIT_DEPTH       gobierna=bit_depth  discrepan=' + disagreeing.length + '/' + Object.keys(labBitDepth).length
            + (disagreeing.length ? '  -> ' + disagreeing.join(',') : ''));
        console.log('DNA             ' + JSON.stringify(c.extDna) + '  coincide_con_el_LAB=' + ok(report.dna.matches_lab));
        console.log('REA             APE-REA=' + c.extRea + '  APE-SOURCE=' + c.extSource);
        console.log('CREDENCIALES    uris_con_firma_Xtream=' + c.xstreamTriples + ' (no se imprimen valores)');
        console.log('');
        if (JSONOUT) console.log('JSON -> ' + JSONOUT);
        process.exit(0); // exit-ok: el informe se emitio; los hallazgos son informativos, no un gate
    })();
}

main().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
