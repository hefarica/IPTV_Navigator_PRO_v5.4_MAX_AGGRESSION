-- ════════════════════════════════════════════════════════════════════════════
-- NET SHIELD — Fase 3.5 Phase 2 v3 — Lua Circuit Breaker post-response
-- ────────────────────────────────────────────────────────────────────────────
-- Hook: header_filter_by_lua_file (POST-response, tras upstream)
-- ────────────────────────────────────────────────────────────────────────────
-- KEY: por upstream IPTV host ($shield_host del regex capture).
-- SKIPS:
--   1. shield_host vacío (no es path /shield/)
--   2. upstream_response_time vacío/nil/"-" (no hubo proxy_pass real)
--   3. upstream_cache_status STALE/HIT/BYPASS/EXPIRED (NO contaminar con cache)
-- POLÍTICA POR STATUS:
--   2xx        → reset state (DICTATOR resume)
--   403        → cooldown directo 8-15min (provider rechazo persistente)
--   429        → backoff exponencial 1→2→4→8s + jitter, 5° error → cooldown 5-15min
--   5xx        → retry corto 0.5-1.5s (provider transitorio)
--   400/401/405 → idem 429
-- ════════════════════════════════════════════════════════════════════════════

local dict = ngx.shared.upstream_state

local host = ngx.var.shield_host
if not host or host == "" then
    return
end

-- Skip si request no llegó a upstream (auth fail, limit_req trip, error local)
local ut = ngx.var.upstream_response_time
if not ut or ut == "" or ut == "-" then
    return
end

-- Skip si la respuesta vino de cache (no es señal del upstream actual)
local cs = ngx.var.upstream_cache_status
if cs == "STALE" or cs == "HIT" or cs == "BYPASS" or cs == "EXPIRED" then
    return
end
-- Solo procesamos cs == "MISS" o vacío (proxy directo sin cache)

local function rand(min, max)
    math.randomseed(ngx.now() * 1000000 + ngx.worker.pid())
    return math.random(min, max)
end
local function now_ms() return ngx.now() * 1000 end

local status  = ngx.status
local k_retry = host .. ":retryAttempt"
local k_cd    = host .. ":cooldownUntil"
local k_err   = host .. ":lastError"

-- 2xx upstream real → reset, modo DICTATOR retoma
if status >= 200 and status < 300 then
    dict:set(k_retry, 0)
    dict:set(k_cd, 0)
    dict:delete(k_err)
    ngx.header["X-APE-Circuit"] = "reset"
    return
end

-- ¿Es status que dispara state machine?
local triggers = {[400]=1,[401]=1,[403]=1,[405]=1,[429]=1,
                  [500]=1,[502]=1,[503]=1,[504]=1}
if triggers[status] ~= 1 then
    return
end

local retry = (tonumber(dict:get(k_retry)) or 0) + 1
local delay_ms

-- Política diferenciada
if status == 403 then
    -- Provider rechaza persistentemente → cooldown directo largo
    delay_ms = rand(8 * 60 * 1000, 15 * 60 * 1000)
    dict:set(k_retry, 0)
elseif status >= 500 and status <= 504 then
    -- Server error → retry corto, sin cooldown ni cuenta de retry
    delay_ms = rand(500, 1500)
    dict:set(k_retry, retry)
else
    -- 400/401/405/429: backoff exponencial 1→2→4→8s + jitter
    if retry <= 4 then
        delay_ms = (2 ^ (retry - 1)) * 1000 + rand(80, 400)
        dict:set(k_retry, retry)
    else
        -- Curva exhausta → cooldown humano largo
        delay_ms = rand(5 * 60 * 1000, 15 * 60 * 1000)
        dict:set(k_retry, 0)
    end
end

dict:set(k_cd, now_ms() + delay_ms)
dict:set(k_err, status)

ngx.header["X-APE-Circuit"]  = "backoff"
ngx.header["X-APE-Retry"]    = retry
ngx.header["X-APE-Delay-Ms"] = delay_ms

ngx.log(ngx.WARN,
    "[APE-CIRCUIT] host=", host,
    " status=", status,
    " retry=", retry,
    " delay_ms=", delay_ms,
    " cs=", tostring(cs))
