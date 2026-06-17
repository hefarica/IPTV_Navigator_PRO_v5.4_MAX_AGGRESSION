-- ═══════════════════════════════════════════════════════════════════════
-- SANDBOX TEST — ape_profile_resolver (Sol 1: profile arbitrario server-side)
-- Ejecutar AISLADO desde vps/nginx/lua:  lua sandbox/test_profile_resolver.lua
-- Prueba la lógica PURA (streamid_from_uri + resolve_from_map) sin ngx/io/cjson.
-- ═══════════════════════════════════════════════════════════════════════
package.path = "./?.lua;../?.lua;" .. package.path
-- stub mínimo de ngx para que el require del módulo no falle (resolve() no se llama aquí)
ngx = { shared = {} }
local M = require("ape_profile_resolver")

local pass, fail = 0, 0
local function ok(cond, name)
    if cond then pass = pass + 1; print("  PASS  " .. name)
    else fail = fail + 1; print("  FAIL  " .. name) end
end

print("── ape_profile_resolver · profile arbitrario · invariantes ──")

-- streamid_from_uri: formatos Xtream reales
ok(M.streamid_from_uri("/live/2E2ETBH3/HZHXPBUD/1.m3u8") == "1", "T1 /live/USER/PASS/1.m3u8 → 1")
ok(M.streamid_from_uri("/live/U/P/13579.m3u8") == "13579",      "T2 streamid multi-dígito → 13579")
ok(M.streamid_from_uri("/live/U/P/42.ts") == "42",              "T3 segmento .ts → 42")
ok(M.streamid_from_uri("/U/P/7/") == "7",                       "T4 último segmento numérico → 7")
ok(M.streamid_from_uri("/playlist/master.m3u8") == nil,         "T5 sin stream_id numérico → nil")
ok(M.streamid_from_uri(nil) == nil,                            "T6 nil-safe → nil")

local MAP = { default = "P3", by_streamid = { ["1"] = "P0", ["5"] = "P1" } }

-- resolve_from_map: by_streamid gana sobre default
ok(M.resolve_from_map("/live/U/P/1.m3u8", MAP) == "P0", "T7 by_streamid[1] → P0 (override gana)")
ok(M.resolve_from_map("/live/U/P/5.m3u8", MAP) == "P1", "T8 by_streamid[5] → P1")
-- stream_id no en el map → cae al default
ok(M.resolve_from_map("/live/U/P/999.m3u8", MAP) == "P3", "T9 stream_id sin override → default P3")
-- sin stream_id → default
ok(M.resolve_from_map("/playlist/master.m3u8", MAP) == "P3", "T10 sin stream_id → default P3")
-- map sin default ni override → nil (caller mantiene P2)
ok(M.resolve_from_map("/live/U/P/999.m3u8", { by_streamid = {} }) == nil, "T11 sin default ni override → nil (cae a P2)")
-- map nil / no-tabla → nil (nil-safe)
ok(M.resolve_from_map("/live/U/P/1.m3u8", nil) == nil, "T12 map nil → nil (passthrough seguro)")
-- profile inválido en el map → ignorado (NUNCA emite un perfil ilegal)
ok(M.resolve_from_map("/live/U/P/1.m3u8", { default = "PX", by_streamid = { ["1"] = "P9" } }) == nil,
   "T13 valores ilegales (P9/PX) → nil (jamás emite perfil inválido)")
-- default-only (la config de despliegue real: toda la lista P3)
ok(M.resolve_from_map("/live/2E2ETBH3/HZHXPBUD/1.m3u8", { default = "P3", by_streamid = {} }) == "P3",
   "T14 config real (default P3, sin overrides) → P3 para cualquier canal")

print(string.format("\n==== %d PASS / %d FAIL ====", pass, fail))
os.exit(fail == 0 and 0 or 1)
