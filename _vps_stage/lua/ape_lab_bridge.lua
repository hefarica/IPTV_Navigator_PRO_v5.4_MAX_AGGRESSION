-- ═══════════════════════════════════════════════════════════════════════════
-- APE LAB BRIDGE v2 — Excel → LAB (DNA) → VPS
-- ═══════════════════════════════════════════════════════════════════════════
-- Prioridad de fuentes (SSOT primero):
--   1) /var/www/html/prisma/config/lab_master_22.6.0.json   ← DNA exportada del
--      Excel (LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json). Es la más
--      reciente y manda.
--   2) /var/www/html/prisma/config/floor_lock_config.json + profile_boost_multipliers
--      + telescope_thresholds  (export del 2026-05-19; fallback si no hay DNA)
--
-- Publica lo calibrado en /_ape/lab (loopback). Cache 60 s en `lab_config`.
-- Reporta `drift` cuando el export viejo difiere de la DNA.
-- ═══════════════════════════════════════════════════════════════════════════
local cjson = require "cjson"

local M = {}

M.CACHE_KEY = "ape_lab_bridge_v2"
M.TTL = 60

M.MASTER = "/var/www/html/prisma/config/lab_master_22.6.0.json"
M.FILES = {
    floor = "/var/www/html/prisma/config/floor_lock_config.json",
    boost = "/var/www/html/prisma/config/profile_boost_multipliers.json",
    tele  = "/var/www/html/prisma/config/telescope_thresholds.json",
}

local function load_json(path)
    local f = io.open(path, "r")
    if not f then return nil, "missing" end
    local raw = f:read("*a")
    f:close()
    if not raw or raw == "" then return nil, "empty" end
    local ok, dec = pcall(cjson.decode, raw)
    if not ok or type(dec) ~= "table" then return nil, "bad_json" end
    return dec
end

local PROFILES = { "P0", "P1", "P2", "P3", "P4", "P5" }

-- ── 1) DNA (manda) ───────────────────────────────────────────────────────
local function from_master(master)
    local out = {
        ok = true, source = "LAB master (DNA)",
        lab_version = master.version, lab_schema = master.lab_schema_variant,
        exported_at = master.exported_at, bulletproof = master.bulletproof,
        floors = {}, profiles = {}, missing = {},
    }
    local pc = master.profiles_calibrated or {}
    for _, p in ipairs(PROFILES) do
        local s = pc[p] and pc[p].settings
        if s then
            out.profiles[p] = {
                name        = pc[p].name,
                role        = pc[p].role,
                resolution  = s.resolution,
                max_resolution = s.maxResolution,
                codec       = s.codec_full,
                floor_bps   = tonumber(s.bandwidth_floor),
                target_bps  = tonumber(s.bandwidth_target),
                max_bps     = tonumber(s.bandwidth_max),
                fps         = s.fps,
                hdr         = s.hdr_mode,
                video_range = s.video_range,
                bit_depth   = s.bit_depth,
                audio       = s.audio_codec,
            }
            if tonumber(s.bandwidth_floor) then out.floors[p] = tonumber(s.bandwidth_floor) end
        end
    end
    out.floors.DEFAULT = out.floors.P2 or 8000000

    local sync = master.prisma_lab_sync_v20 or {}
    local fs = sync.feature_sheets and sync.feature_sheets["15_FLOOR_LOCK_CONFIG"]
    if fs then
        out.floor_lock_enabled = fs.floor_lock_enabled
        out.floors_master = {
            P0 = fs.floor_lock_min_bandwidth_p0, P1 = fs.floor_lock_min_bandwidth_p1,
            P2 = fs.floor_lock_min_bandwidth_p2, P3 = fs.floor_lock_min_bandwidth_p3,
            P4 = fs.floor_lock_min_bandwidth_p4, P5 = fs.floor_lock_min_bandwidth_p5,
        }
    end
    out.channel_dna = sync.channel_dna_defaults
    out.codec_ladder = sync.codec_ladder_per_profile
    out.profile_attrs = sync.profile_attributes

    -- drift frente al export viejo (si existe)
    local fl = load_json(M.FILES.floor)
    if fl then
        out.deployed_export = { generated_ts = fl._metadata and fl._metadata.generated_ts }
        local drift = {}
        for _, p in ipairs(PROFILES) do
            local old = tonumber(fl["floor_lock_min_bandwidth_" .. p:lower()])
            local new = out.floors[p]
            if old and new and old ~= new then
                drift[#drift + 1] = string.format("%s floor %d -> %d", p, old, new)
            end
        end
        local oldcw = tonumber(fl.tcp_initcwnd_target)
        if oldcw and out.tcp and out.tcp.initcwnd and oldcw ~= out.tcp.initcwnd then
            drift[#drift + 1] = string.format("tcp_initcwnd %d -> %d", oldcw, out.tcp.initcwnd)
        end
        if #drift > 0 then out.drift = drift end
    end
    return out
end

-- ── 2) fallback: export viejo ────────────────────────────────────────────
local function from_legacy()
    local out = {
        ok = false, source = "prisma/config (export 2026-05-19)", floors = {},
        profiles = {}, telemetry = {}, missing = {},
    }
    local fl, err_f = load_json(M.FILES.floor)
    if fl then
        out.ok = true
        out.floor_lock_enabled           = fl.floor_lock_enabled
        out.passthrough_when_unreachable = fl.floor_lock_passthrough_when_unreachable
        out.generated_ts                 = fl._metadata and fl._metadata.generated_ts
        for _, p in ipairs(PROFILES) do
            local v = fl["floor_lock_min_bandwidth_" .. p:lower()]
            if v then out.floors[p] = v end
        end
        out.floors.DEFAULT = fl.floor_lock_min_bandwidth_default or 8000000
        out.headers = { max_bps = fl.x_max_bitrate_upstream_header,
                        min_bps = fl.x_min_bitrate_upstream_header }
        out.tcp = { initcwnd = fl.tcp_initcwnd_target, notsent_lowat = fl.tcp_notsent_lowat }
    else
        out.missing[#out.missing + 1] = "floor_lock_config.json:" .. tostring(err_f)
    end
    local bo, err_b = load_json(M.FILES.boost)
    if bo and bo.profiles then out.ok = true; out.profiles = bo.profiles end
    local te = load_json(M.FILES.tele)
    if te then
        out.ok = true
        out.telemetry = { ewma_alpha = te["level1_rolling_window.ewma_alpha"],
                          window_ms = te["level1_rolling_window.window_ms"] }
    end
    if err_b then out.missing[#out.missing + 1] = "boost:" .. tostring(err_b) end
    return out
end

function M.get()
    local dict = ngx.shared.lab_config
    if dict then
        local cached = dict:get(M.CACHE_KEY)
        if cached then
            local ok, dec = pcall(cjson.decode, cached)
            if ok and type(dec) == "table" then return dec end
        end
    end

    local master = load_json(M.MASTER)
    local out = (master and master.profiles_calibrated) and from_master(master) or from_legacy()
    if not master then out.master_missing = M.MASTER end

    local okenc, enc = pcall(cjson.encode, out)
    if dict and okenc and type(enc) == "string" and #enc < 500000 then
        dict:set(M.CACHE_KEY, enc, M.TTL)
    end
    return out
end

function M.floor_for(profile)
    local d = M.get()
    local key = tostring(profile or "DEFAULT"):upper()
    return d.floors[key] or d.floors.DEFAULT or 8000000
end

function M.passthrough_when_unreachable()
    local d = M.get()
    return d.passthrough_when_unreachable ~= false
end

return M
