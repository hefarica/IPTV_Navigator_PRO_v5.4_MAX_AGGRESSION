-- ═══════════════════════════════════════════════════════════════════════
-- SANDBOX TEST — bw_adaptive_floor (lazo bitrate-reactor → manifest)
-- Ejecutar AISLADO (jamás en nginx):  lua test_bw_adaptive.lua
-- Prueba las 7 invariantes doctrinales sin tocar producción, sin ngx, sin red.
-- ═══════════════════════════════════════════════════════════════════════
package.path = "./?.lua;" .. package.path
local M = require("bw_adaptive_floor")

local pass, fail = 0, 0
local function ok(cond, name)
    if cond then pass = pass + 1; print("  PASS  " .. name)
    else fail = fail + 1; print("  FAIL  " .. name) end
end
local function names(kept) local s = {} for _, v in ipairs(kept) do s[#s+1] = v.name end return table.concat(s, ",") end
local function has(kept, nm) for _, v in ipairs(kept) do if v.name == nm then return true end end return false end

-- master típico de canal premium (4 peldaños)
local function master()
    return {
        { name = "4k",   bw = 22000000, score = 96 },
        { name = "1080", bw = 9000000,  score = 70 },
        { name = "720",  bw = 5000000,  score = 55 },
        { name = "480",  bw = 2000000,  score = 40 },
    }
end

local STATIC_FLOOR = 8000000  -- floor del perfil (~8M): hoy descarta 720/480
local HEALTHY  = { state = "CBR_SUSTAIN", ewma_bps = 20000000, floor_4k_bps = 13000000 }
local DEGRADED = { state = "DOUBLE",      ewma_bps = 4000000,  floor_4k_bps = 13000000 } -- ~4M real

print("── bitrate-reactor → manifest · adaptive floor · 7 invariantes ──")

-- T1 HEALTHY: floor == estático; 720/480 descartados (sin regresión vs hoy)
local k1, f1 = M.select_variants(master(), STATIC_FLOOR, "ACTIVE", HEALTHY)
ok(f1 == STATIC_FLOOR, "T1 healthy mantiene floor estático ("..tostring(f1)..")")
ok(has(k1,"4k") and has(k1,"1080") and not has(k1,"720") and not has(k1,"480"),
   "T1 healthy mantiene {4k,1080}, descarta {720,480}  [kept="..names(k1).."]")

-- T2 DEGRADED: floor relajado → sobrevive un peldaño sostenible (720@5M; 0.8*4M=3.2M)
local k2, f2, r2 = M.select_variants(master(), STATIC_FLOOR, "ACTIVE", DEGRADED)
ok(f2 < STATIC_FLOOR, "T2 degraded RELAJA floor "..tostring(f2).." < "..STATIC_FLOOR.."  ("..r2..")")
ok(has(k2,"720"), "T2 degraded ahora MANTIENE 720 sostenible (anti-freeze)  [kept="..names(k2).."]")
ok(has(k2,"4k"),  "T2 degraded SIGUE mantiene 4k (MAX IMAGE fallback)")

-- T3 manifest de UNA variante: siempre exactamente 1, cualquier bw (NO CHANNEL LOSS)
local k3 = M.select_variants({ { name="only", bw=1500000, score=50 } }, STATIC_FLOOR, "ACTIVE", DEGRADED)
ok(#k3 == 1 and has(k3,"only"), "T3 single-variant intacto sin importar bw")

-- T4 floor adaptativo NUNCA supera al estático (monótono → cero pérdida de canal)
local _, f4h = M.select_variants(master(), STATIC_FLOOR, "ACTIVE", HEALTHY)
local _, f4d = M.select_variants(master(), STATIC_FLOOR, "ACTIVE", DEGRADED)
ok(f4h <= STATIC_FLOOR and f4d <= STATIC_FLOOR, "T4 floor efectivo <= estático (0 riesgo de pérdida)")

-- T5 todos los peldaños bajo el floor + degraded: el mayor sigue (nunca 0 variantes)
local k5 = M.select_variants({ { name="a",bw=1000000,score=30 }, { name="b",bw=800000,score=20 } },
                             STATIC_FLOOR, "ACTIVE", DEGRADED)
ok(#k5 >= 1 and has(k5,"a"), "T5 nunca vacío; el mayor (a) sobrevive")

-- T6 MAX IMAGE: la mejor variante presente en TODO escenario
ok(has(k1,"4k") and has(k2,"4k"), "T6 mejor variante sobrevive healthy Y degraded")

-- T7 sin señal de bw (reactor frío/nil): cae al estático (default seguro)
local k7, f7, r7 = M.select_variants(master(), STATIC_FLOOR, "ACTIVE", nil)
ok(f7 == STATIC_FLOOR and r7 == "no_signal_static", "T7 bw nil → floor estático (default seguro)")

print(string.format("\n==== %d PASS / %d FAIL ====", pass, fail))
os.exit(fail == 0 and 0 or 1)
