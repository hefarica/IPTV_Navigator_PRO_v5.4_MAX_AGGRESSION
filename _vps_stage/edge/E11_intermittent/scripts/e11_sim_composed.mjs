#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * E11+E7 · Simulación offline del gateway COMPUESTO (4 versiones, mismo guion)
 * ═══════════════════════════════════════════════════════════════════════════
 * Sujetos:
 *   PREFIX    live/ape_gateway.lua               (66a20017 — con breaker)
 *   HOTFIX    live/postfix/ape_gateway.lua       (2dc0fad8 — breaker fuera)
 *   PROPOSED  proposed/ape_gateway.lua           (+ delta E11: reason/X-APE/attempts)
 *   COMPOSED  proposed/composed/ape_gateway.lua  (+ delta E11 **y** instrumentación E7)
 *
 * Por qué existe: E11 y E7 tocan EL MISMO fichero (el gateway) en las mismas
 * líneas. Los parches NO se componen con `git apply` (conflicto de contexto
 * medido), así que se entrega un único fichero compuesto. Este guion prueba que
 * el compuesto conserva las DOS cosas: el arreglo de E11 (siempre intentar,
 * motivo siempre presente, cabeceras de error) y la instrumentación de E7
 * (`ngx.ctx.ape_dec` con ms/hops/uhd/uris para /_ape/metrics), sin tocar el
 * camino feliz.
 *
 * Canaliza el payload por stdin a `lua5.1 -` en el VPS: no escribe ficheros ni
 * toca nginx. Guion: 1 GET a ruta que el proveedor rechaza (407) + 3 GET al
 * canal bueno.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DIR = path.resolve(process.argv[2] || '.');
const SUBJECTS = [
  ['PREFIX', 'live/ape_gateway.lua'],
  ['HOTFIX', 'live/postfix/ape_gateway.lua'],
  ['PROPOSED', 'proposed/ape_gateway.lua'],
  ['COMPOSED', 'proposed/composed/ape_gateway.lua'],
].map(([label, rel]) => {
  const src = fs.readFileSync(path.join(DIR, rel), 'utf8');
  if (src.includes(']==]')) throw new Error(`${rel}: contiene ']==]'`);
  return { label, rel, src };
});

const luaSubjects = SUBJECTS.map((s) =>
  `  { label = "${s.label}", src = [==[${s.src}]==] },`).join('\n');

const LUA = String.raw`
local SUBJECTS = {
` + luaSubjects + String.raw`
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

local CAPTURES = 0
local PROVIDER = {}
local ngx = {
  shared = { ape_flags = newdict(), ape_qoe = newdict(), ape_hosts = newdict() },
  ctx = {},
  var = { remote_addr = "127.0.0.1", ape_host = "line.tivi-ott.net",
          ape_path = "/live/U/P/3.m3u8", args = "", arg_alt = nil },
  header = {}, status = 200, WARN = "warn", ERR = "err",
  now = function() T = T + 0.001; return T end,
  log = function() end,
  say = function(s) ngx._body = (ngx._body or "") .. s end,
  print = function(s) ngx._body = (ngx._body or "") .. s end,
  time = function() return math.floor(T) end,
  location = { capture = function(uri)
      CAPTURES = CAPTURES + 1
      advance(0.35)
      local h = uri:match("h=([^&]*)") or ""
      local p = uri:match("&p=([^&]*)") or ""
      local r = PROVIDER[h .. "|" .. p] or { status = 404 }
      return { status = r.status, body = r.body or "", header = { ["Location"] = r.location } }
  end },
}
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
  return { TARGET_8K = "8k", TARGET_4K = "4k",
    codec_truth_fields = function() return 0 end,
    declare = function(b) return b, 0 end,
    declare_auto = function(b) return b, 0, nil end }
end
package.preload["ape_lab_bridge"] = function()
  return { floor_for = function() return 8000000 end }
end

local PL = "#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:10.0,\nhttp://1.2.3.4:80/hls/a/3_1.ts\n"
PROVIDER["line.tivi-ott.net|/live/U/P/999.m3u8"] = { status = 407 }        -- fallo REAL
PROVIDER["line.tivi-ott.net|/live/U/P/3.m3u8"]   = { status = 200, body = PL }

local SCRIPT = { "/live/U/P/999.m3u8", "/live/U/P/3.m3u8", "/live/U/P/3.m3u8", "/live/U/P/3.m3u8" }

local function run(src, label)
  ngx.shared = { ape_flags = newdict(), ape_qoe = newdict(), ape_hosts = newdict() }
  T = 1793047000.0
  local steps = {}
  for i, p in ipairs(SCRIPT) do
    CAPTURES = 0; ngx.var.ape_path = p; ngx.status = 200; ngx._body = nil
    ngx.header = {}; ngx.ctx = {}
    local f, err = loadstring(src, label)
    if not f then return { label = label, error = tostring(err) } end
    local ok, cerr = pcall(f)
    advance(0.001)
    local xa = {}
    for k in pairs(ngx.header) do if type(k) == "string" and k:sub(1, 6) == "X-APE-" then xa[k] = true end end
    local body = ngx._body or ""
    local dec = ngx.ctx.ape_dec
    steps[#steps + 1] = {
      n = i, path = p, status = ngx.status, captures = CAPTURES,
      has_reason = body:find('"reason"', 1, true) ~= nil,
      ms = tonumber(body:match('"ms":(%d+)')),
      attempts = tonumber(body:match('"attempts":(%d+)')),
      hdr_reason = xa["X-APE-Reason"] ~= nil,
      n_xape = (function() local n = 0 for _ in pairs(xa) do n = n + 1 end return n end)(),
      down_after = ngx.shared.ape_hosts:get("down:line.tivi-ott.net"),
      dec = dec,
      qoe = { all_failed = ngx.shared.ape_qoe:get("all_failed") or 0,
              req = ngx.shared.ape_qoe:get("req") or 0,
              pf = ngx.shared.ape_qoe:get("provider_fail:line.tivi-ott.net") or 0 },
      err = (not ok) and tostring(cerr) or nil,
    }
  end
  return { label = label, steps = steps }
end

local res = {}
for _, s in ipairs(SUBJECTS) do res[#res + 1] = run(s.src, s.label) end

print("════════ PERFIL POR VERSIÓN (4 peticiones: 1 fallo real + 3 al canal bueno) ════════")
for _, r in ipairs(res) do
  if r.error then print(r.label .. "  ERROR " .. r.error)
  else
    for _, s in ipairs(r.steps) do
      local d = s.dec or {}
      print(string.format("%-9s #%d %-20s status=%-3d fetch=%-2d reason=%-5s hdrReason=%-5s attempts=%-4s xape=%-2d down=%-5s | dec: outcome=%s ms=%s hops=%s kind=%s uris=%s uhd=%s | all_failed=%d req=%d provider_fail=%d",
        r.label, s.n, s.path, s.status, s.captures, tostring(s.has_reason), tostring(s.hdr_reason),
        tostring(s.attempts), s.n_xape, tostring(s.down_after),
        tostring(d.outcome), tostring(d.ms), tostring(d.hops), tostring(d.kind),
        tostring(d.uris), tostring(d.uhd),
        s.qoe.all_failed, s.qoe.req, s.qoe.pf))
      if s.err then print("   ERROR: " .. s.err) end
    end
  end
end

local function st(r, i) return (r.steps or {})[i] or {} end
local P, H, Q, Z = res[1], res[2], res[3], res[4]
local function dec(i) return st(Z, i).dec or {} end
local checks = {
  { "PREFIX (66a20017) reproduce el fallo ciego: 0 fetch y 502 sin reason",
    st(P,2).captures == 0 and st(P,2).status == 502 and st(P,2).has_reason == false },
  { "HOTFIX (2dc0fad8) ya intenta siempre: fetch=1 y 200 en los 3",
    st(H,2).captures == 1 and st(H,3).captures == 1 and st(H,4).captures == 1
    and st(H,2).status == 200 and st(H,3).status == 200 and st(H,4).status == 200 },
  { "PROPOSED (E11) intenta siempre y añade X-APE-Reason + attempts",
    st(Q,2).captures == 1 and st(Q,2).status == 200 and st(Q,1).hdr_reason == true
    and st(Q,1).attempts == 1 },
  { "COMPOSED intenta siempre (sin breaker): fetch=1 y 200 en los 3 siguientes",
    st(Z,2).captures == 1 and st(Z,3).captures == 1 and st(Z,4).captures == 1
    and st(Z,2).status == 200 and st(Z,3).status == 200 and st(Z,4).status == 200 },
  { "COMPOSED conserva el arreglo E11: reason en cuerpo + X-APE-Reason + attempts en el fallo",
    st(Z,1).has_reason == true and st(Z,1).hdr_reason == true and st(Z,1).attempts == 1 },
  { "COMPOSED no toca el camino feliz: mismas cabeceras X-APE-* que HOTFIX",
    st(Z,2).n_xape == st(H,2).n_xape and st(Z,2).n_xape >= 8 },
  { "COMPOSED instrumenta el ÉXITO en ngx.ctx.ape_dec (outcome/ms/hops/kind/uris/uhd)",
    dec(2).outcome == "ok" and type(dec(2).ms) == "number" and dec(2).ms > 100
    and dec(2).hops == 0 and dec(2).kind == "media" and dec(2).uris == 6
    and dec(2).uhd == "off" and dec(2).attempts == 1 },
  { "COMPOSED instrumenta el FALLO en ngx.ctx.ape_dec (outcome=fail, attempts=1)",
    dec(1).outcome == "fail" and dec(1).attempts == 1 and type(dec(1).ms) == "number" },
  { "COMPOSED no fabrica all_failed y cuenta provider_fail (igual que PROPOSED)",
    st(Z,1).qoe.pf == 1 and st(Z,2).qoe.all_failed == st(Z,1).qoe.all_failed
    and st(Z,1).qoe.all_failed == st(Q,1).qoe.all_failed },
  { "COMPOSED no escribe down: (breaker muerto también en la composición)",
    st(Z,1).down_after == nil and st(Z,2).down_after == nil },
  { "COMPOSED no altera status ni cuerpo respecto a PROPOSED",
    st(Z,1).status == st(Q,1).status and st(Z,2).status == st(Q,2).status
    and st(Z,1).ms ~= nil and st(Q,1).ms ~= nil },
}
print("════════ VEREDICTO ════════")
local bad = 0
for _, c in ipairs(checks) do
  print((c[2] and "PASS " or "FAIL ") .. c[1]); if not c[2] then bad = bad + 1 end
end
print(("RESULT=%s (%d/%d)"):format(bad == 0 and "OK" or "FALLA", #checks - bad, #checks))
os.exit(bad == 0 and 0 or 1)
`;

const r = spawnSync('ssh', ['-o', 'BatchMode=yes', 'root@178.156.147.234', 'lua5.1 -'],
                    { input: LUA, encoding: 'utf8', timeout: 120000 });
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
console.log(`\n[ssh exit=${r.status}] · sujetos: ${SUBJECTS.map((s) => `${s.label}=${s.rel}`).join(' · ')}`);
process.exit(r.status === 0 ? 0 : 1);
