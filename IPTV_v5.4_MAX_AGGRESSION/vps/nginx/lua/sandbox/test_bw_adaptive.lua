-- ═══════════════════════════════════════════════════════════════════════
-- SANDBOX TEST — bw_adaptive_floor (lazo bitrate-reactor → manifest)
-- Ejecutar AISLADO (jamás en nginx), desde vps/nginx/lua:  lua sandbox/test_bw_adaptive.lua
-- Prueba las 11 invariantes doctrinales sin tocar producción, sin ngx, sin red.
-- ═══════════════════════════════════════════════════════════════════════
package.path = "./?.lua;../?.lua;" .. package.path
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

print("── bitrate-reactor → manifest · adaptive floor · 11 invariantes ──")

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

-- T8 COLD-START: reactor presente pero ewma=0 (sin medición) → NO relaja (ausencia ≠ bw cero)
local COLD = { state = "DOUBLE", ewma_bps = 0, floor_4k_bps = 15000000 }
local k8, f8, r8 = M.select_variants(master(), STATIC_FLOOR, "ACTIVE", COLD)
ok(f8 == STATIC_FLOOR and r8 == "no_measurement_static",
   "T8 cold-start (ewma=0) → floor estático, NO relaja por ausencia de datos")
ok(not has(k8,"720") and not has(k8,"480"), "T8 cold-start mantiene comportamiento de hoy [kept="..names(k8).."]")

-- T9 TRUST-STATE: reactor dice CBR_SUSTAIN aunque ewma (14M) < floor4k (15M) → healthy (confía en el reactor)
local TRUST = { state = "CBR_SUSTAIN", ewma_bps = 14000000, floor_4k_bps = 15000000 }
local _, f9, r9 = M.select_variants(master(), STATIC_FLOOR, "ACTIVE", TRUST)
ok(f9 == STATIC_FLOOR and r9 == "healthy_static",
   "T9 trust-state: CBR_SUSTAIN manda → floor estático aunque ewma<floor4k")

-- T10 STALE: medición real vieja (age_s=120 > FRESHNESS_S 30) → NO relaja (DOUBLE stale del tick 1Hz)
local STALE = { state = "DOUBLE", ewma_bps = 4000000, floor_4k_bps = 8000000, age_s = 120 }
local k10, f10, r10 = M.select_variants(master(), STATIC_FLOOR, "ACTIVE", STALE)
ok(f10 == STATIC_FLOOR and r10 == "stale_static",
   "T10 stale (age 120s) → floor estático (no relaja con EWMA vieja)")
ok(not has(k10,"720"), "T10 stale mantiene comportamiento de hoy [kept="..names(k10).."]")

-- T11 FRESH: misma medición baja pero RECIENTE (age_s=5 < FRESHNESS_S) → SÍ relaja (anti-freeze real)
local FRESH = { state = "DOUBLE", ewma_bps = 4000000, floor_4k_bps = 8000000, age_s = 5 }
local k11, f11, r11 = M.select_variants(master(), STATIC_FLOOR, "ACTIVE", FRESH)
ok(f11 < STATIC_FLOOR and r11 == "degraded_relaxed_to_sustainable",
   "T11 fresh (age 5s) → relaja a sostenible "..tostring(f11))
ok(has(k11,"720"), "T11 fresh mantiene 720 sostenible (anti-freeze) [kept="..names(k11).."]")

-- ── escalation_floor (la palanca de +imagen, simétrica) ──
print("── escalation_floor · +imagen freeze-safe ──")
local HEALTHY_HI = { state = "CBR_SUSTAIN", ewma_bps = 20000000 }  -- red sana, 20M
-- E1 canal con variante alta (22M) + red sana que sostiene → escala a 0.6*22M=13.2M
local ef1, er1 = M.escalation_floor(22000000, HEALTHY_HI, 3)
ok(ef1 == 16500000 and er1 == "escalated", "E1 variante alta 22M + healthy 20M → escala a 16.5M (0.75 × max, fuerza tier alto)")
-- E2 sin variante alta (max 9M < HIGH_BPS 14M) → no escala (nada que ganar)
ok(select(1, M.escalation_floor(9000000, HEALTHY_HI, 3)) == 0, "E2 sin variante alta (9M) → 0 (no escala)")
-- E3 variante alta pero red DOUBLE (degradada) → NO escala (deja al adaptive_floor relajar)
local _, er3 = M.escalation_floor(22000000, { state = "DOUBLE", ewma_bps = 4000000 }, 3)
ok(er3 == "degraded_bypass", "E3 variante alta + DOUBLE → 0 degraded_bypass (jamás fuerza bajo red mala)")
-- E4 variante alta + healthy pero ewma (10M) < floor escalación (13.2M) → NO fuerza lo que la red no da
local _, er4 = M.escalation_floor(22000000, { state = "CBR_SUSTAIN", ewma_bps = 10000000 }, 3)
ok(er4 == "ewma_below_escalation_floor", "E4 ewma 10M < 0.6*22M → 0 (no fuerza lo que la red no sostiene)")
-- E5 variante alta + medición STALE (age 120s) → no escala
local _, er5 = M.escalation_floor(22000000, HEALTHY_HI, 120)
ok(er5 == "stale", "E5 variante alta + stale 120s → 0 (no escala con medición vieja)")
-- E6 variante alta + cold (ewma 0) → no escala
local _, er6 = M.escalation_floor(22000000, { state = "CBR_SUSTAIN", ewma_bps = 0 }, 3)
ok(er6 == "no_measurement", "E6 cold (ewma 0) → 0 (sin evidencia no escala)")
-- E7 nil-safe
ok(select(1, M.escalation_floor(22000000, nil, 3)) == 0, "E7 bw_signal nil → 0 (passthrough seguro)")

print(string.format("\n==== %d PASS / %d FAIL ====", pass, fail))
os.exit(fail == 0 and 0 or 1)
