#!/usr/bin/env node
/**
 * verify_deployed_assets.mjs — paridad byte a byte entre HEAD y lo que sirve el VPS.
 *
 * POR QUE EXISTE: reportar "desplegado" sin medir es el defecto que este repo ya
 * pago tres veces (ver `iptv-surgical-commit-and-deploy-verify`). El veredicto de
 * este script es el unico que se puede citar como prueba de despliegue.
 *
 * Metodo: para cada path, se obtiene el blob de `HEAD` con `git cat-file blob` y se
 * calcula su git-blob-sha1 (sha1("blob <len>\0" + bytes)); se descarga la URL de
 * produccion y se calcula el MISMO hash sobre los bytes servidos. Si coinciden, el
 * fichero servido es exactamente el del commit. Se reporta tambien sha256 de ambos
 * lados para que la evidencia sea citable sin depender de git.
 *
 * Uso:
 *   node artifacts/verify/verify_deployed_assets.mjs \
 *     --repo <raiz git> --prefix IPTV_v5.4_MAX_AGGRESSION/frontend \
 *     --base https://iptv-ape.duckdns.org \
 *     --paths js/a.js js/b.js
 *
 * Salida: una linea por fichero + RESUMEN con OK/DRIFT/FALTA y exit code 1 si algo
 * no coincide. No escribe nada fuera de stdout.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

function arg(name, def) {
    const i = process.argv.indexOf('--' + name);
    if (i === -1) return def;
    return process.argv[i + 1];
}
function args(name) {
    const i = process.argv.indexOf('--' + name);
    if (i === -1) return [];
    const out = [];
    for (let j = i + 1; j < process.argv.length; j++) {
        if (String(process.argv[j]).startsWith('--')) break;
        out.push(process.argv[j]);
    }
    return out;
}

const repo = arg('repo', process.cwd());
const prefix = arg('prefix', '');
const base = String(arg('base', '')).replace(/\/+$/, '');
const paths = args('paths');

if (!base || !paths.length) {
    console.error('FALTA: --base <url> y al menos un --paths <path>');
    process.exit(2);
}

function gitBlob(path) {
    const ref = prefix ? `${prefix}/${path}` : path;
    const sha = execFileSync('git', ['rev-parse', `HEAD:${ref}`], { cwd: repo, encoding: 'utf8' }).trim();
    // cat-file devuelve bytes crudos; execFileSync con encoding null da Buffer.
    const buf = execFileSync('git', ['cat-file', 'blob', sha], { cwd: repo, maxBuffer: 64 * 1024 * 1024 });
    return { ref, sha, buf };
}

function gitTreeBlobSha(buf) {
    const h = createHash('sha1');
    h.update(`blob ${buf.length}\u0000`, 'utf8');
    h.update(buf);
    return h.digest('hex');
}
function sha256(buf) {
    return createHash('sha256').update(buf).digest('hex');
}

let ok = 0, drift = 0, missing = 0;
for (const p of paths) {
    let local;
    try {
        local = gitBlob(p);
    } catch (e) {
        console.log(`FALTA_EN_HEAD ${p} :: ${String(e.message || e).trim().split('\n')[0]}`);
        missing++;
        continue;
    }
    const url = `${base}/${p.replace(/^\/+/, '')}`;
    let res, buf;
    try {
        res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
        if (!res.ok) {
            console.log(`HTTP_${res.status} ${p} :: ${url}`);
            missing++;
            continue;
        }
        buf = Buffer.from(await res.arrayBuffer());
    } catch (e) {
        console.log(`FETCH_FAILED ${p} :: ${url} :: ${String(e.message || e)}`);
        missing++;
        continue;
    }
    const same = gitTreeBlobSha(buf) === local.sha;
    const line = [
        same ? 'OK   ' : 'DRIFT',
        p,
        `local_blob=${local.sha.slice(0, 12)}`,
        `served_semantic=${gitTreeBlobSha(buf).slice(0, 12)}`,
        `local_sha256=${sha256(local.buf).slice(0, 16)}`,
        `served_sha256=${sha256(buf).slice(0, 16)}`,
        `local_bytes=${local.buf.length}`,
        `served_bytes=${buf.length}`,
        `http=${res.status}`,
        `content_encoding=${res.headers.get('content-encoding') || 'none'}`,
    ].join(' ');
    console.log(line);
    if (same) ok++; else drift++;
}

const total = ok + drift + missing;
console.log(`RESUMEN paths=${total} OK=${ok} DRIFT=${drift} FALTA=${missing} base=${base}`);
process.exit(drift === 0 && missing === 0 ? 0 : 1);
