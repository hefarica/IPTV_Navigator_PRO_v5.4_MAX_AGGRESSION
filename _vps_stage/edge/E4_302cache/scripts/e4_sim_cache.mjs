#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * E4 · Simulación offline de la caché del 302: VIVO vs PROTOTIPO
 * ═══════════════════════════════════════════════════════════════════════════
 * Sujetos:
 *   VIVO      live/ape_gateway.lua       (2dc0fad8, sin caché)
 *   PROTOTIPO proposed/ape_gateway.lua   (TTL 3 s + revalidación por status)
 *
 * Guion (4 peticiones al MISMO canal):
 *   1) miss   → 302 proveedor + CDN 200            → 2 subrequests (hop1+hop2)
 *   2) hit    → CDN directo con el token cacheado  → 1 subrequest (solo hop2)
 *   3) stale  → el CDN contesta 509 al token cacheado; el gateway debe
 *               descartar la entrada y RE-ACUÑAR: el player NUNCA ve el 509
 *   4) miss   → la entrada se borró; cadena normal otra vez
 *
 * El nº de subrequests es el proxy de latencia: hop2≈396 ms vs hop1+hop2≈692 ms.
 * Canaliza el payload por stdin a `lua5.1 -` (no escribe nada en el VPS).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DIR = path.resolve(process.argv[2] || '.');
const SUBJ = [
  ['VIVO', 'live/ape_gateway.lua'],
  ['PROTOTIPO', 'proposed/ape_gateway.lua'],
].map(([label, rel]) => {
  const src = fs.readFileSync(path.join(DIR, rel), 'utf8');
  if (src.includes(']==]')) throw new Error(`${rel}: contiene ']==]'`);
  return { label, rel, src };
});
const SUBJ_LUA = SUBJ.map((s) => `  { label = "${s.label}", src = [==[${s.src}]==] },`).join('\n');

const LUA = String.raw`
local SUBJECTS = {
` + SUBJ_LUA + String.raw`
}

local T = 1793047000.0
local function advance(dt) T = T + dt end

local function newdict()
  local d, exp = {}, {}
  return {
    get = function(self, k) if exp[k] and exp[k] <= T then d[k] = nil; exp[k] = nil end; return d[k] end,
    set = function(self, k, v, ttl) d[k] = v; exp[k] = ttl and (T + ttl) or nil; return true end,
    delete = function(self, k) d[k] = nil; exp[k] = nil end,
    incr = function(self, k, n, init) d[k] = (d[k] or init or 0) + (n or 1); return d[k] end,
  }
end

local CAPS = 0
local STALE_PENDING = false          -- el siguiente GET al CDN devuelve 509 (token viejo)
local TOKEN = 1
local ROUTES = {}

local ngx = {}
ngx.shared = { ape_flags = newdict(), ape_qoe = newdict(), ape_hosts = newdict(), ape_hops = newdict() }
ngx.var = { remote_addr = "127.0.0.1", ape_host = "line.tivi-ott.net",
            ape_path = "/live/U/P/3.m3u8", args = "", arg_alt = nil }
ngx.header, ngx.status, ngx.WARN, ngx.ERR = {}, 200, "warn", "err"
ngx.now = function() T = T + 0.001; return T end
ngx.time = function() return math.floor(T) end
ngx.log = function() end
ngx.say = function(s) ngx._body = (ngx._body or "") .. s end
ngx.print = function(s) ngx._body = (ngx._body or "") .. s end
ngx.location = { capture = function(uri)
  CAPS = CAPS + 1
  advance(0.35)                                  -- hop simulado (≈350 ms)
  local h = uri:match("h=([^&]*)") or ""
  local p = uri:match("&p=([^&]*)") or ""
  local hh = h:gsub(":%d+$", "")                 -- el proveedor manda host:puerto
  if hh == "cdn.test" then
    if STALE_PENDING then STALE_PENDING = false; return { status = 509, body = "", header = {} } end
    return { status = 200, body = "#EXTM3U\n#EXTINF:10.0,\nhttp://1.2.3.4:80/hls/a/3_1.ts\n", header = {} }
  end
  if hh == "line.tivi-ott.net" then
    TOKEN = TOKEN + 1                                  -- token NUEVO por petición (medido)
    return { status = 302, body = "",
             header = { ["Location"] = "http://cdn.test:80/live/play/TOK" .. TOKEN .. "/3" } }
  end
  return { status = 404, body = "", header = {} }
end }
_G.ngx = ngx

package.preload["cjson.safe"] = function()
  local function enc(v)
    local t = type(v)
    if t == "table" then
      if #v > 0 then local a = {} for i = 1, #v do a[i] = enc(v[i]) end
        return "[" .. table.concat(a, ",") .. "]" end
      local ks = {} for k in pairs(v) do ks[#ks + 1] = k end
      table.sort(ks)
      local a = {} for _, k in ipairs(ks) do a[#a + 1] = '"' .. k .. '":' .. enc(v[k]) end
      return "{" .. table.concat(a, ",") .. "}"
    elseif t == "string" then return '"' .. v:gsub('"', '\\"') .. '"'
    elseif t == "number" or t == "boolean" then return tostring(v) end
    return "null"
  end
  return { encode = enc }
end
package.preload["ape_rebase_lib"] = function()
  return { is_too_big = function(n) return n > 1048576 end,
    rebase_body = function(b) return b, 6, 2 end,
    has_parts = function() return false end,
    inject_server_control = function(b) return b, false end,
    is_master = function() return false end,
    inject_presentation_hint = function(b) return b, false end }
end
package.preload["ape_uhd"] = function()
  return { TARGET_8K = "8k", TARGET_4K = "4k", codec_truth_fields = function() return 0 end,
    declare = function(b) return b, 0 end, declare_auto = function(b) return b, 0, nil end }
end
package.preload["ape_lab_bridge"] = function() return { floor_for = function() return 8000000 end } end

local SCRIPT = { "miss", "hit", "stale", "miss2" }

local function run(src, label)
  ngx.shared = { ape_flags = newdict(), ape_qoe = newdict(), ape_hosts = newdict(), ape_hops = newdict() }
  T = 1793047000.0; TOKEN = 1; STALE_PENDING = false
  local steps = {}
  for i, phase in ipairs(SCRIPT) do
    if phase == "stale" then STALE_PENDING = true end
    CAPS = 0; ngx.status = 200; ngx._body = nil; ngx.header = {}
    ngx.var.ape_path = "/live/U/P/3.m3u8"
    local f, err = loadstring(src, label)
    if not f then return { label = label, error = tostring(err) } end
    local ok, cerr = pcall(f)
    advance(0.001)
    local hop = ngx.header["X-APE-Hop-Cache"]
    steps[#steps + 1] = {
      n = i, phase = phase, status = ngx.status, subs = CAPS,
      ms = tonumber((ngx._body or ""):match('"ms":(%d+)')),
      hop = hop, has_origin = ngx.header["X-APE-Origin"] ~= nil,
      qoe = { hit = ngx.shared.ape_qoe:get("hop_hit") or 0,
              s509 = ngx.shared.ape_qoe:get("hop_stale_509") or 0 },
      err = (not ok) and tostring(cerr) or nil,
    }
  end
  return { label = label, steps = steps }
end

local res = {}
for _, s in ipairs(SUBJECTS) do res[#res + 1] = run(s.src, s.label) end

print("════════ 4 peticiones al mismo canal · subrequests = coste de latencia ════════")
for _, r in ipairs(res) do
  if r.error then print(r.label .. " ERROR " .. r.error)
  else
    for _, s in ipairs(r.steps) do
      print(string.format("%-10s #%d %-7s status=%-3d subrequests=%d  hop_cache=%-10s qoe.hop_hit=%d qoe.hop_stale_509=%d",
        r.label, s.n, s.phase, s.status, s.subs, tostring(s.hop), s.qoe.hit, s.qoe.s509))
    end
  end
end

local function st(r, i) return (r.steps or {})[i] or {} end
local V, P = res[1], res[2]
local checks = {
  { "VIVO no tiene caché: las 4 peticiones cuestan 2 subrequests (302+CDN)",
    st(V,1).subs == 2 and st(V,2).subs == 2 and st(V,3).subs == 2 and st(V,4).subs == 2 },
  { "VIVO no publica X-APE-Hop-Cache", st(V,1).hop == nil },
  { "PROTOTIPO #1 (miss) acuña y paga hop1+hop2", st(P,1).subs == 2 and st(P,1).status == 200 and tostring(st(P,1).hop):find("miss") ~= nil },
  { "PROTOTIPO #2 (hit) se salta el 302: 1 subrequest", st(P,2).subs == 1 and st(P,2).status == 200 and tostring(st(P,2).hop):find("hit") ~= nil },
  { "PROTOTIPO #2 sirve el playlist (no un cuerpo vacío)", st(P,2).status == 200 },
  { "PROTOTIPO #3 (stale) NO expone el 509 al cliente: 200", st(P,3).status == 200 },
  { "PROTOTIPO #3 re-acuña: 3 subrequests (509 + 302 + CDN)", st(P,3).subs == 3 },
  { "PROTOTIPO #3 marca hop_cache=stale", tostring(st(P,3).hop):find("stale") ~= nil },
  { "PROTOTIPO #3 cuenta el 509 para observar la caducidad", st(P,3).qoe.s509 == 1 },
  { "PROTOTIPO #4 el fallback RE-ARMA la caché: vuelve a servir con 1 subrequest",
    tostring(st(P,4).hop):find("hit") ~= nil and st(P,4).subs == 1 },
  { "PROTOTIPO #4 hop_hit=2 (el hit del #2 y el del #4)", st(P,4).qoe.hit == 2 },
  { "VIVO expone el 509 al cliente cuando el CDN lo devuelve (sin revalidación)", st(V,3).status == 509 },
  { "PROTOTIPO nunca devuelve 509 al cliente en las 4 fases",
    st(P,1).status == 200 and st(P,2).status == 200 and st(P,3).status == 200 and st(P,4).status == 200 },
  { "el estado va en la cabecera con su TTL (observable)", tostring(st(P,2).hop):find("3s") ~= nil },
}
print("════════ VEREDICTO ════════")
local bad = 0
for _, c in ipairs(checks) do print((c[2] and "PASS " or "FAIL ") .. c[1]); if not c[2] then bad = bad + 1 end end
print(("RESULT=%s (%d/%d)"):format(bad == 0 and "OK" or "FALLA", #checks - bad, #checks))
os.exit(bad == 0 and 0 or 1)
`;

const r = spawnSync('ssh', ['-o', 'BatchMode=yes', 'root@178.156.147.234', 'lua5.1 -'],
                    { input: LUA, encoding: 'utf8', timeout: 120000 });
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
console.log(`\n[ssh exit=${r.status}]`);
process.exit(r.status === 0 ? 0 : 1);
