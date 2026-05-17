-- APE LAB-SYNC v2.0 — lab_config.lua
--
-- Equivalente Lua de LabConfigLoader.php. Lee los 6 JSONs de
-- /var/www/html/prisma/config/ con cache via shared_dict (TTL 300s)
-- y fallbacks defensivos. Pensado para uso en bandwidth_reactor.lua,
-- decision_engine.lua, floor_lock_filter.lua (futuro).
--
-- Doctrina: LAB Excel SSOT · cero hardcoded en runtime Lua.
--
-- Usage:
--   local lab = require "lab_config"
--   local floor = lab.floor_bps_for_profile("P0")  -- 15000000
--   local mult = lab.boost_multiplier_for_profile("P3")  -- 1.5
--   local cfg = lab.floor_lock()  -- entire floor_lock_config table

local _M = { _VERSION = "1.0.0" }

local CONFIG_DIR = "/var/www/html/prisma/config/"
local CACHE_TTL_SECONDS = 300
local cjson = (function() local ok,m = pcall(require,"cjson.safe"); if ok then return m end; return require("cjson") end)()

-- Permitir uso fuera de NGINX (tests CLI) cayendo a tabla local
local shared_dict = ngx and ngx.shared and ngx.shared.lab_config or nil

local function read_json(filename, defaults)
    local cache_key = "lab_cfg:" .. filename
    if shared_dict then
        local cached = shared_dict:get(cache_key)
        if cached then
            local ok, parsed = pcall(cjson.decode, cached)
            if ok and parsed then return parsed end
        end
    end

    local path = CONFIG_DIR .. filename
    local f = io.open(path, "r")
    if not f then
        if ngx then ngx.log(ngx.WARN, "[lab_config] missing: " .. path .. " · using defaults") end
        return defaults
    end
    local content = f:read("*a")
    f:close()
    if not content or #content == 0 then return defaults end

    local ok, parsed = pcall(cjson.decode, content)
    if not ok or not parsed then
        if ngx then ngx.log(ngx.ERR, "[lab_config] corrupt JSON: " .. path) end
        return defaults
    end

    if shared_dict then
        shared_dict:set(cache_key, content, CACHE_TTL_SECONDS)
    end
    return parsed
end

-- ──────────────────────────────────────────────────────────────────
-- Fallback defaults (usados si JSON falta o está corrupto)
-- ──────────────────────────────────────────────────────────────────

local FALLBACK_FLOOR_LOCK = {
    floor_lock_enabled = true,
    floor_lock_min_bandwidth_p0 = 15000000,
    floor_lock_min_bandwidth_p1 = 15000000,
    floor_lock_min_bandwidth_p2 = 15000000,
    floor_lock_min_bandwidth_p3 = 8000000,
    floor_lock_min_bandwidth_p4 = 8000000,
    floor_lock_min_bandwidth_p5 = 4000000,
    floor_lock_min_bandwidth_default = 8000000,
    floor_lock_passthrough_when_unreachable = true,
    x_max_bitrate_upstream_header = 20000000,
    x_min_bitrate_upstream_header = 15000000,
}

local FALLBACK_PROFILE_BOOST = {
    global_boost_when_master_enabled = true,
    profiles = {
        P0 = { prisma_boost_multiplier = 2.0, prisma_zap_grace_seconds = 30, prisma_floor_min_bandwidth_bps = 15000000, prisma_target_bandwidth_bps = 80000000 },
        P1 = { prisma_boost_multiplier = 2.0, prisma_zap_grace_seconds = 30, prisma_floor_min_bandwidth_bps = 15000000, prisma_target_bandwidth_bps = 50000000 },
        P2 = { prisma_boost_multiplier = 2.0, prisma_zap_grace_seconds = 30, prisma_floor_min_bandwidth_bps = 15000000, prisma_target_bandwidth_bps = 30000000 },
        P3 = { prisma_boost_multiplier = 1.5, prisma_zap_grace_seconds = 30, prisma_floor_min_bandwidth_bps = 8000000,  prisma_target_bandwidth_bps = 12000000 },
        P4 = { prisma_boost_multiplier = 1.5, prisma_zap_grace_seconds = 30, prisma_floor_min_bandwidth_bps = 8000000,  prisma_target_bandwidth_bps = 8000000 },
        P5 = { prisma_boost_multiplier = 1.2, prisma_zap_grace_seconds = 30, prisma_floor_min_bandwidth_bps = 4000000,  prisma_target_bandwidth_bps = 5000000 },
    },
    fallback_default = { prisma_boost_multiplier = 1.5, prisma_floor_min_bandwidth_bps = 8000000, prisma_target_bandwidth_bps = 12000000 },
}

local FALLBACK_TELESCOPE = {
    level1_rolling_window = { samples_count = 12, window_ms = 1200, ewma_alpha = 0.3 },
    predictive_triggers = {
        ttfb_rising_threshold_ms = 500,
        ttfb_rising_consecutive_samples = 3,
        ttfb_slope_threshold_ms_per_sample = 50,
        buffer_critical_seconds = 5,
        jitter_threshold_ms = 50,
        packet_loss_warning_pct = 1.0,
        packet_loss_critical_pct = 2.0,
        frame_drops_per_second_warning = 5,
    },
}

local FALLBACK_SENTINEL = {
    providers = { _default = { ua_pool = { "VLC/3.0.18 LibVLC/3.0.18" } } },
    global_thresholds = { burst_limiter_rate_per_second = 4, burst_limiter_burst = 8 },
}

-- Disney-Grade LL-HLS / ABR directives (mismos valores para todos los perfiles)
-- Fallback usado si m3u8_directives_config.json falta o está corrupto.
local FALLBACK_M3U8_DIRECTIVES = {
    schema_version = "1.0",
    applies_to_all_profiles = true,
    directives = {
        { tag = "EXT-X-START",         value = "TIME-OFFSET=-3.0,PRECISE=YES", category = "timeline" },
        { tag = "EXT-X-SERVER-CONTROL", value = "CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0", category = "timeline" },
        { tag = "EXT-X-TARGETDURATION", value = "2", category = "fragmentation" },
        { tag = "EXT-X-PART-INF",       value = "PART-TARGET=1.0", category = "fragmentation" },
        { tag = "EXT-X-SESSION-DATA",   value = 'DATA-ID="exoplayer.load_control",VALUE="{\\"minBufferMs\\":20000,\\"bufferForPlaybackMs\\":1000}"', category = "abr" },
        { tag = "EXT-X-SESSION-DATA",   value = 'DATA-ID="exoplayer.track_selection",VALUE="{\\"maxDurationForQualityDecreaseMs\\":2000,\\"minDurationForQualityIncreaseMs\\":15000,\\"bandwidthFraction\\":0.65}"', category = "abr" },
    },
}

-- ──────────────────────────────────────────────────────────────────
-- Public API
-- ──────────────────────────────────────────────────────────────────

function _M.floor_lock()
    return read_json("floor_lock_config.json", FALLBACK_FLOOR_LOCK)
end

function _M.profile_boost()
    return read_json("profile_boost_multipliers.json", FALLBACK_PROFILE_BOOST)
end

function _M.telescope_thresholds()
    return read_json("telescope_thresholds.json", FALLBACK_TELESCOPE)
end

function _M.sentinel_providers()
    return read_json("sentinel_providers_map.json", FALLBACK_SENTINEL)
end

function _M.channels_dna()
    return read_json("channels_prisma_dna.json", { channel_defaults_by_profile = {}, channels = {} })
end

function _M.manifest()
    return read_json("enterprise_doctrine_manifest.json", { version = "fallback", compliance_score_current = 0 })
end

-- Disney-Grade LL-HLS / ABR directives (global, igual para todos los perfiles).
-- Telemetry/visibility only en VPS — la emisión de los tags en el .m3u8 ocurre en
-- el generator frontend; aquí solo exponemos el config para que /prisma/api/telemetry-full
-- pueda reportar qué directivas globales están activas.
function _M.m3u8_directives()
    return read_json("m3u8_directives_config.json", FALLBACK_M3U8_DIRECTIVES)
end

-- Helper: lista plana de tags formateados (`#EXT-X-START:VALUE`, ...) lista para concatenar
function _M.m3u8_directive_lines()
    local cfg = _M.m3u8_directives()
    local out = {}
    if not cfg or type(cfg.directives) ~= "table" then return out end
    for _, d in ipairs(cfg.directives) do
        if d.tag and d.value then
            out[#out + 1] = "#" .. d.tag .. ":" .. d.value
        end
    end
    return out
end

-- Helper: piso bps por perfil
function _M.floor_bps_for_profile(profile)
    local cfg = _M.floor_lock()
    local key = "floor_lock_min_bandwidth_" .. string.lower(profile or "default")
    return tonumber(cfg[key]) or tonumber(cfg.floor_lock_min_bandwidth_default) or 8000000
end

-- Helper: boost multiplier por perfil
function _M.boost_multiplier_for_profile(profile)
    local cfg = _M.profile_boost()
    if not cfg.global_boost_when_master_enabled then return 1.0 end
    local p = cfg.profiles and cfg.profiles[profile] or cfg.fallback_default
    return tonumber(p and p.prisma_boost_multiplier) or 1.5
end

-- Helper: target bandwidth bps por perfil
function _M.target_bps_for_profile(profile)
    local cfg = _M.profile_boost()
    local p = cfg.profiles and cfg.profiles[profile] or cfg.fallback_default
    return tonumber(p and p.prisma_target_bandwidth_bps) or 12000000
end

-- Helper: salud del loader (último mtime + status por archivo)
function _M.health()
    local files = {
        "floor_lock_config.json",
        "profile_boost_multipliers.json",
        "channels_prisma_dna.json",
        "sentinel_providers_map.json",
        "telescope_thresholds.json",
        "enterprise_doctrine_manifest.json",
        "m3u8_directives_config.json",
    }
    local out = {}
    local now = os.time()
    for _, fname in ipairs(files) do
        local path = CONFIG_DIR .. fname
        local f = io.open(path, "r")
        if not f then
            out[fname] = { status = "missing", using_fallback = true }
        else
            local raw = f:read("*a")
            f:close()
            local ok = pcall(cjson.decode, raw)
            local stat_ok, attr = pcall(function()
                local s = io.popen("stat -c %Y " .. path .. " 2>/dev/null")
                local r = s and s:read("*l")
                if s then s:close() end
                return tonumber(r)
            end)
            local mtime = stat_ok and attr or now
            out[fname] = {
                status = ok and "ok" or "corrupt",
                age_seconds = now - mtime,
                using_fallback = not ok,
            }
        end
    end
    return out
end

return _M
