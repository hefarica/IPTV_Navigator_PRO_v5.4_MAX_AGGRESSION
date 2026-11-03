#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * E10 · build_staged.mjs — compone los ficheros EXACTOS de la ventana
 * ═══════════════════════════════════════════════════════════════════════════
 * Entradas (pineadas por sha256; aborta si no coinciden):
 *   E11 composed gateway  2bfa88f4…  (E11+E7)
 *   E11 composed obs      ed7d2adf…  (E11+E7)
 *   live ape_uhd          f1f5eb67…
 *   live ape_luatest      98a29c44…
 *   live default          49c162a8…
 *   E7 stage meta-plane   33bbeb6b…
 *   E7 lua nuevos         831f309e / 737f1700 / eb5af49b / d960f23a / 180ca51a
 *
 * Deltas que aplica ESTE script (los únicos):
 *   gateway : (b) quitar bypass remote_addr==127.0.0.1 ; (d) guard 8K E5-B
 *   ape_uhd : (d) guard 8K E5-A (max_resolution/level_supports_8k/can_declare_8k + declare_auto techo 4K)
 *   luatest : (d) asserts 155-156 esperan 4K/4k
 *   default : (c) quitar add_header Accept-Ranges bytes always (ruta /lists/)
 *   obs / meta-plane / 5 Lua E7: copia byte-exacta
 *
 * Salida: _vps_stage/edge/E10_window/staged/** + SHA256SUMS + build.json
 * NO toca el VPS. No aplica nada.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const W = path.join(ROOT, '_vps_stage/edge/E10_window');
const STAGED = path.join(W, 'staged');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel));

const PIN = {
  composedGateway: '2bfa88f4a001c1d4',
  composedObs: 'ed7d2adf0fdaf091',
  uhdLive: 'f1f5eb674744858ae7c5e84c73262e37545b0c84e557c6466cad20ae7b1f3b5e',
  luatestLive: '98a29c444f1bca0f59d4b15a7426eaf8e64e7745d12caaba54266019c37eb37d',
  defaultLive: '49c162a862f1e5485959350f2b2175f24eec440a10d2cd6902b2e0e03f8c59d1',
  metaStage: '33bbeb6b9e6dbe1d',
  e7Lua: {
    'ape_log_chain.lua': '831f309e06a89355a0840c5d10e0db57189e00ff117bb3d476e1277cd5bff954',
    'ape_obs_http.lua': '737f1700906bbc30b6c4c714d13fc82e1954a2f0f0004819b290a5f05fa3781d',
    'ape_obs_metrics_api.lua': 'eb5af49ba50d0cb9e5b5c266342b8438accdb4b8431247e31b83d7d779d63933',
    'ape_obs_metrics.lua': 'd960f23aed2a9da15910dc877b481c9c30e258e57273d51eec9eb3a520be555e',
    'ape_obs_rec.lua': '180ca51a9d06e02bb432a9bcfd72b8eb49460b9e1857a2fbf6ce96d6c6a769c8',
  },
};

const fail = (m) => { console.error('FATAL: ' + m); process.exit(1); };
const must = (buf, pin, name) => {
  const h = sha(buf);
  if (!h.startsWith(pin)) fail(`${name}: sha256=${h} no empieza por ${pin}`);
  console.log(`OK   ${name} = ${h.slice(0, 16)}…`);
  return h;
};
const write = (rel, buf) => {
  const p = path.join(STAGED, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
  return p;
};

/* ── 1 · entradas pineadas ───────────────────────────────────────────────── */
const srcGateway = read('_vps_stage/edge/E11_intermittent/proposed/composed/ape_gateway.lua');
const srcObs = read('_vps_stage/edge/E11_intermittent/proposed/composed/ape_obs.lua');
const srcUhd = read('_vps_stage/edge/uhd/live/ape_uhd.lua.live');
const srcLuatest = read('_vps_stage/edge/E10_window/live/ape_luatest.lua');
const srcDefault = read('_vps_stage/edge/E10_window/live/default');
const srcMeta = read('_vps_stage/edge/E7_observability/stage/50-ape-meta-plane.conf');

must(srcGateway, PIN.composedGateway, 'composed gateway');
must(srcObs, PIN.composedObs, 'composed obs');
must(srcUhd, PIN.uhdLive, 'live ape_uhd');
must(srcLuatest, PIN.luatestLive, 'live ape_luatest');
must(srcDefault, PIN.defaultLive, 'live default');
must(srcMeta, PIN.metaStage, 'E7 stage meta-plane');

const e7Files = {};
for (const [name, pin] of Object.entries(PIN.e7Lua)) {
  const buf = read(`_vps_stage/edge/E7_observability/lua/${name}`);
  must(buf, pin.slice(0, 16), `E7 lua ${name}`);
  e7Files[name] = buf;
}

/* ── 2 · gateway: quitar bypass SSRF + guard 8K (E5-B) ──────────────────── */
let gw = srcGateway.toString('utf8');
const bypass = '    if ngx.var.remote_addr == "127.0.0.1" then return true end\n';
if (!gw.includes(bypass)) fail('gateway: no encuentro el bypass SSRF exacto');
gw = gw.replace(bypass, '');
if (gw.includes('remote_addr == "127.0.0.1"')) fail('gateway: el bypass sigue presente');

const uhdOld = `    elseif flag("uhd8k", false) then
        rebased, uhd_n = uhd.declare(rebased, { target = uhd.TARGET_8K, mode = "8k",
            add_pq = flag("uhd_pq", false), only_top = true })
        if uhd_n > 0 then uhd_mode = "8k" end
    elseif flag("uhd_auto", true) then
        local m
        rebased, uhd_n, m = uhd.declare_auto(rebased, { add_pq = flag("uhd_pq", false) })
        if uhd_n > 0 then uhd_mode = m end
    elseif flag("uhd4k", true) then
        rebased, uhd_n = uhd.declare(rebased, { target = uhd.TARGET_4K, mode = "4k",
            add_pq = flag("uhd_pq", false), only_top = true })
        if uhd_n > 0 then uhd_mode = "4k" end
    end`;
const uhdNew = `    elseif flag("uhd8k", false) and uhd.can_declare_8k(rebased) then
        rebased, uhd_n = uhd.declare(rebased, { target = uhd.TARGET_8K, mode = "8k",
            add_pq = flag("uhd_pq", false), only_top = true })
        if uhd_n > 0 then uhd_mode = "8k" end
    elseif flag("uhd_auto", true) or flag("uhd8k", false) or flag("uhd4k", true) then
        local m
        rebased, uhd_n, m = uhd.declare_auto(rebased, { add_pq = flag("uhd_pq", false) })
        if uhd_n > 0 then uhd_mode = m end
    end`;
if (!gw.includes(uhdOld)) fail('gateway: no encuentro el bloque UHD exacto');
gw = gw.replace(uhdOld, uhdNew);
if (!gw.includes('uhd.can_declare_8k(rebased)')) fail('gateway: guard 8K no aplicado');
write('etc/nginx/lua/ape_gateway.lua', Buffer.from(gw, 'utf8'));

/* ── 3 · ape_uhd: E5-A ──────────────────────────────────────────────────── */
let uhd = srcUhd.toString('utf8');
const anchor = `function M.top_resolution(body)
    local seen = 0
    for line in body:gmatch("[^\\r\\n]+") do
        if line:find("#EXT-X-STREAM-INF", 1, true) then
            seen = seen + 1
            if seen == 1 then
                local w = line:match("RESOLUTION=(%d+)x%d+")
                return tonumber(w) or 0
            end
        end
    end
    return nil
end
`;
if (!uhd.includes(anchor)) fail('ape_uhd: no encuentro M.top_resolution exacto');
const extra = `
-- E5 (2026-10-26): techo real. 8K SOLO si (a) la fuente es >=4K y (b) el nivel
-- declarado sostiene 8K (HEVC Level 6.1 = L183). CODECS no se toca nunca.
M.MIN_HEVC_LEVEL_8K = 183

-- Mayor RESOLUTION= declarada por CUALQUIER variante (no solo la 1.ª).
function M.max_resolution(body)
    local mx = 0
    for line in (body .. "\\n"):gmatch("(.-)\\r?\\n") do
        if line:find("#EXT-X-STREAM-INF", 1, true) then
            local w = tonumber(line:match("RESOLUTION=(%d+)x%d+") or 0) or 0
            if w > mx then mx = w end
        end
    end
    return mx
end

-- ¿el primer codec de vídeo declarado soporta 8K? (hevc L>=183; AVC nunca)
function M.level_supports_8k(body)
    for line in (body .. "\\n"):gmatch("(.-)\\r?\\n") do
        if line:find("#EXT-X-STREAM-INF", 1, true) then
            local codecs = line:match('CODECS="([^"]*)"') or ""
            for tok in codecs:gmatch("[^,]+") do
                local lv = tok:match("^hv[ce][1e]%.%d+%.%w+%.L(%d+)")
                if lv then return (tonumber(lv) or 0) >= M.MIN_HEVC_LEVEL_8K end
                if tok:match("^avc[13]%.") then return false end
            end
        end
    end
    return false
end

function M.can_declare_8k(body)
    return M.max_resolution(body) >= 3840 and M.level_supports_8k(body)
end
`;
uhd = uhd.replace(anchor, anchor + extra);

const autoOld = `function M.declare_auto(body, opts)
    opts = opts or {}
    local w = M.top_resolution(body)
    if w == nil then return body, 0, nil end          -- no es master
    local target, mode
    if w >= 3840 then
        target, mode = M.TARGET_8K, "8k"
    else
        target, mode = M.TARGET_4K, "4k"
    end
    local nb, n = M.declare(body, {
        target = target, mode = mode,
        add_pq = opts.add_pq, only_top = true,
    })
    return nb, n, mode
end`;
const autoNew = `function M.declare_auto(body, opts)
    opts = opts or {}
    if M.top_resolution(body) == nil then return body, 0, nil end   -- no es master
    local nb, n = M.declare(body, { target = M.TARGET_4K, mode = "4k",
        add_pq = opts.add_pq, only_top = true })
    return nb, n, "4k"
end`;
if (!uhd.includes(autoOld)) fail('ape_uhd: no encuentro declare_auto exacto');
uhd = uhd.replace(autoOld, autoNew);
if (!uhd.includes('M.can_declare_8k') || uhd.includes('target, mode = M.TARGET_8K, "8k"')) {
  fail('ape_uhd: patch E5-A no aplicado como se esperaba');
}
write('etc/nginx/lua/ape_uhd.lua', Buffer.from(uhd, 'utf8'));

/* ── 4 · ape_luatest: asserts 155-156 a 4K/4k ───────────────────────────── */
let lt = srcLuatest.toString('utf8');
const ltOld = `    eq("uhd.auto_4k_a_8k", a4k:find("RESOLUTION=7680x4320", 1, true) ~= nil, true)
    eq("uhd.auto_4k_modo", mode4k, "8k")`;
const ltNew = `    eq("uhd.auto_4k_a_8k", a4k:find("RESOLUTION=3840x2160", 1, true) ~= nil, true)
    eq("uhd.auto_4k_modo", mode4k, "4k")`;
if (!lt.includes(ltOld)) fail('ape_luatest: no encuentro los asserts 155-156 exactos');
lt = lt.replace(ltOld, ltNew);
write('etc/nginx/lua/ape_luatest.lua', Buffer.from(lt, 'utf8'));

/* ── 5 · obs / meta-plane / 5 Lua E7 byte-exactos ───────────────────────── */
write('etc/nginx/lua/ape_obs.lua', srcObs);
for (const [name, buf] of Object.entries(e7Files)) write(`etc/nginx/lua/${name}`, buf);
write('etc/nginx/conf.d/50-ape-meta-plane.conf', srcMeta);

/* ── 6 · default: quitar add_header Accept-Ranges (E6-04) ───────────────── */
let def = srcDefault.toString('utf8');
const arLine = '        add_header Accept-Ranges bytes always;\n';
const arCount = def.split(arLine).length - 1;
if (arCount !== 1) fail(`default: esperaba 1 add_header Accept-Ranges, hay ${arCount}`);
def = def.replace(arLine, '');
if (def.includes('add_header Accept-Ranges bytes always;')) fail('default: Accept-Ranges sigue');
write('etc/nginx/sites-enabled/default', Buffer.from(def, 'utf8'));

/* ── 7 · hashes + resumen ───────────────────────────────────────────────── */
const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(path.relative(STAGED, p).split(path.sep).join('/'));
  }
}
walk(STAGED);
files.sort();
const lines = files.map((rel) => `${sha(fs.readFileSync(path.join(STAGED, rel)))}  ${rel}`);
fs.writeFileSync(path.join(STAGED, 'SHA256SUMS'), lines.join('\n') + '\n');

const summary = {
  generated_utc: new Date().toISOString(),
  sources: {
    composedGateway: sha(srcGateway),
    composedObs: sha(srcObs),
    uhdLive: sha(srcUhd),
    luatestLive: sha(srcLuatest),
    defaultLive: sha(srcDefault),
    metaStage: sha(srcMeta),
    e7Lua: Object.fromEntries(Object.entries(e7Files).map(([n, b]) => [n, sha(b)])),
  },
  staged: Object.fromEntries(files.map((rel) => [rel, sha(fs.readFileSync(path.join(STAGED, rel)))])),
  deltas: [
    'gateway: bypass SSRF removido (remote_addr==127.0.0.1)',
    'gateway: guard uhd8k (can_declare_8k) + absorción uhd4k en declare_auto',
    'ape_uhd: MIN_HEVC_LEVEL_8K=183 + max_resolution/level_supports_8k/can_declare_8k + declare_auto techo 4K',
    'ape_luatest: asserts 155-156 esperan 3840x2160 / 4k',
    'default: retirado add_header Accept-Ranges bytes always de /lists/',
    'obs + meta-plane + 5 Lua E7: copia byte-exacta de los compuestos/stage',
  ],
};
fs.writeFileSync(path.join(W, 'build.json'), JSON.stringify(summary, null, 2));

console.log('\n── staged ─────────────────────────────────────────────');
for (const line of lines) console.log('  ' + line.slice(0, 16) + '…  ' + line.slice(66));
console.log(`\nbuild.json escrito. ${files.length} ficheros. RESULT=OK`);
