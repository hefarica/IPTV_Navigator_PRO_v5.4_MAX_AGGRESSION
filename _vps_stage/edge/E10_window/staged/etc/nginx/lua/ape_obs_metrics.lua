-- ═════════════════════════════════════════════════════════════════════════════
-- APE OBS METRICS v1 — métricas de la DECISIÓN del plano de metadata
-- ═════════════════════════════════════════════════════════════════════════════
-- E7 · qué mide y por qué
--
--   provider_fetch_ms : latencia de las decisiones EXITOSAS = fetch al proveedor
--                       + seguimiento del 302 (lo que el gateway publica como
--                       X-APE-Upstream-Ms), con PERCENTILES. Los fallos NO se
--                       mezclan aquí (se cuentan en `errors`): si no, un fallo
--                       rápido (connection refused, 3 ms) hundiría el p50 y
--                       fingiría una mejora de latencia que no existe.
--   split             : primer hop (proveedor) vs último hop (CDN tras el 302),
--                       en media. Es el dato que faltaba para dimensionar la
--                       fase 3 (cache del destino del 302): si el primer hop ya
--                       son ~700 ms, cachear el 302 no puede bajar de 350 ms.
--   hops              : nº de redirects seguidos (0..MAX_HOPS) y agotamientos.
--   uhd_mode          : off | 4k | 8k | blocked (GOLDEN RULE: hev1 en CODECS
--                       ⇒ UHD omitido, no se declara codec imposible). Solo se
--                       cuenta en MASTERS: en una media playlist no hay nada que
--                       declarar (`na`), y contarla como "off" mentiría.
--   rebase            : % de playlists servidas con ≥1 URI rebasada + URIs y
--                       atributos rebasados por playlist. Separado por tipo
--                       (master/media): un master con URIs absolutas del CDN
--                       legítimamente no rebasa nada y no es un defecto.
--                       Mide TRABAJO, no corrección: la corrección (0 URIs
--                       relativas) se verifica fuera de la ruta caliente con el
--                       arnés en modo `sample`.
--   errors            : ok | fail | denied | too_large y error_ratio = fallos /
--                       INTENTOS (no fallos / éxitos: ése era el defecto D-67).
--
-- Diseño de coste (requisito E7: "leerse sin coste en la ruta caliente")
--
--   * El content handler NO escribe NADA aquí: solo deja un `ngx.ctx.ape_dec`
--     (una tabla local, ~0,5 µs; los números ya estaban en variables suyas).
--   * Todo el registro ocurre en `log_by_lua_file` ⇒ DESPUÉS de que el cliente
--     recibió el último byte. ~12-16 `incr` de shared dict (memoria del worker)
--     ⇒ ≈5-20 µs de CPU de nginx, invisible en TTFB/TTLB.
--   * Ventana deslizante de 6 slots de 300 s: lectura O(6·claves) por consulta,
--     siempre por loopback y sin `get_keys` (no escanea ni bloquea el dict).
--   * Percentiles por histograma de 16 buckets con interpolación lineal dentro
--     del bucket: escritura O(1) y precisión publicada por bucket (no se vende
--     exactitud que no se tiene). La media SÍ es exacta.
--
-- Compatibilidad: Lua 5.1 / LuaJIT (nginx 1.24 + libnginx-mod-http-lua 0.10.x).
-- Sin dependencias (no cjson aquí: la proyección JSON la hace el handler).
-- ═════════════════════════════════════════════════════════════════════════════

local M = {}

M.SCHEMA   = "ape.obs.metrics/1"
M.DICT     = "ape_qoe"      -- dict YA declarado en 50-ape-meta-plane.conf (no se añade otro)
M.SLOT_SEC = 300            -- 5 min por slot
M.NSLOT    = 6              -- 6 slots = 30 min de cobertura máxima
M.SLOT_TTL = 2100           -- 35 min: los slots viejos se auto-purgan del dict
M.MAX_HOPS = 3              -- espejo de MAX_HOPS del gateway (documentado)

-- Buckets de ms (límite SUPERIOR exclusivo). El último bucket es abierto.
-- Resolución: 25 ms en la zona buena (<300), 200-800 ms en la del proveedor.
M.MS_BOUNDS = { 25, 50, 100, 150, 200, 300, 400, 600, 800, 1200, 1600, 2400, 3200, 4800, 8000 }
M.MS_NB     = #M.MS_BOUNDS + 1

-- Inventario de claves por slot (para publicar el coste real, no estimado).
local META_KEYS = {
  "pf:s",                                  -- suma de ms (media exacta)
  "pf:1:s", "pf:1:n", "pf:L:s", "pf:L:n",  -- split primer/último hop
  "hp:0", "hp:1", "hp:2", "hp:3", "hp:x", "hp:r", "hp:att",
  "uhd:na", "uhd:m_off", "uhd:m_4k", "uhd:m_8k", "uhd:m_blk", "uhd:var",
  "rb:m", "rb:d", "rb:yesm", "rb:yesd", "rb:uris", "rb:attr",
  "er:ok", "er:fail", "er:den", "er:big",
  -- E7 · "fast fail": la petición NO llegó a hablar con el proveedor porque
  -- todas las candidatas estaban marcadas caídas (circuito blando `down:` de
  -- 15 s del gateway). Distinguirlo de un fallo REAL es lo que explica el
  -- error_ratio intermitente del baseline: 1 fallo real contamina ~15 s.
  "er:ffail",
}
local EDGE_KEYS = {
  "ed:r", "ed:u", "ed:un", "ed:n", "ed:s2", "ed:s3", "ed:s4", "ed:s5",
  "ed:byt", "ed:h2", "ed:h1",
}

local function dict()
  return ngx.shared[M.DICT] or nil
end

-- incr robusto: `init_ttl` (4º argumento) existe desde lua-nginx 0.10.6; si el
-- módulo no lo soportara, se degrada a incr + expire (se loguea UNA vez).
local _ttl_mode = nil
local function incr(D, key, n, ttl)
  if _ttl_mode ~= false then
    local ok, err = pcall(D.incr, D, key, n, 0, ttl)
    if ok then _ttl_mode = true; return true end
    _ttl_mode = false
    ngx.log(ngx.WARN, "[ape-obs] incr con init_ttl no soportado (", tostring(err),
            "): se usa incr+expire")
  end
  local ok = pcall(D.incr, D, key, n, 0)
  if ok then pcall(D.expire, D, key, ttl) end
  return ok
end

local function num(v)
  local n = tonumber(v)
  if not n then return nil end
  if n ~= n then return nil end       -- NaN
  if n < 0 then return 0 end
  return n
end

local function bucket_of(ms)
  local b = M.MS_BOUNDS
  for i = 1, #b do
    if ms < b[i] then return i end
  end
  return #b + 1
end

local function slot_of(now)
  return math.floor((now or ngx.now()) / M.SLOT_SEC)
end

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · REGISTRO (log_by_lua) — coste O(1), nunca en la ruta caliente
-- ─────────────────────────────────────────────────────────────────────────────
-- dec = tabla que deja el gateway en ngx.ctx.ape_dec:
--   { ms, hops, exhausted, hop1_ms, hoplast_ms, attempts,
--     uhd, uhd_n, kind = "master"|"media", uris, attrs, size,
--     outcome = "ok"|"fail"|"denied"|"too_large" }
function M.record_decision(dec, now)
  local D = dict()
  if not D or type(dec) ~= "table" then return false end
  local sid = slot_of(now)
  local p = "m" .. sid .. ":"
  local outcome = dec.outcome
  local is_ok = (outcome == nil) or (outcome == "ok")
  local is_master = (dec.kind == "master")
  local hop = num(dec.hops) or 0

  -- provider_fetch_ms: SOLO decisiones exitosas (ver cabecera)
  if is_ok then
    local ms = num(dec.ms)
    if ms then
      incr(D, p .. "pf:b" .. bucket_of(ms), 1, M.SLOT_TTL)
      incr(D, p .. "pf:s", ms, M.SLOT_TTL)
    end
    local h1 = num(dec.hop1_ms)
    if h1 then
      incr(D, p .. "pf:1:s", h1, M.SLOT_TTL)
      incr(D, p .. "pf:1:n", 1, M.SLOT_TTL)
    end
    local hl = num(dec.hoplast_ms)
    if hl then
      incr(D, p .. "pf:L:s", hl, M.SLOT_TTL)
      incr(D, p .. "pf:L:n", 1, M.SLOT_TTL)
    end
  end

  -- hops (de la petición, exista o no éxito)
  if dec.exhausted then
    incr(D, p .. "hp:x", 1, M.SLOT_TTL)
  else
    local k = math.floor(hop)
    if k < 0 then k = 0 end
    if k > M.MAX_HOPS then k = M.MAX_HOPS end
    incr(D, p .. "hp:" .. k, 1, M.SLOT_TTL)
  end
  incr(D, p .. "hp:r", hop, M.SLOT_TTL)
  local att = num(dec.attempts)
  if att and att > 0 then incr(D, p .. "hp:att", att, M.SLOT_TTL) end

  -- uhd_mode / rebase: solo en respuestas SERVIDAS (si no hubo cuerpo no hay
  -- nada declarado ni rebasado; contarlas en el denominador falsearía el %).
  if is_ok then
    if is_master then
      local u = dec.uhd
      if u == "4k" then incr(D, p .. "uhd:m_4k", 1, M.SLOT_TTL)
      elseif u == "8k" then incr(D, p .. "uhd:m_8k", 1, M.SLOT_TTL)
      elseif u == "blocked" then incr(D, p .. "uhd:m_blk", 1, M.SLOT_TTL)
      else incr(D, p .. "uhd:m_off", 1, M.SLOT_TTL) end
      local uv = num(dec.uhd_n)
      if uv and uv > 0 then incr(D, p .. "uhd:var", uv, M.SLOT_TTL) end
    else
      incr(D, p .. "uhd:na", 1, M.SLOT_TTL)
    end

    local uris  = num(dec.uris) or 0
    local attrs = num(dec.attrs) or 0
    if is_master then
      incr(D, p .. "rb:m", 1, M.SLOT_TTL)
      if uris > 0 then incr(D, p .. "rb:yesm", 1, M.SLOT_TTL) end
    else
      incr(D, p .. "rb:d", 1, M.SLOT_TTL)
      if uris > 0 then incr(D, p .. "rb:yesd", 1, M.SLOT_TTL) end
    end
    if uris > 0 then incr(D, p .. "rb:uris", uris, M.SLOT_TTL) end
    if attrs > 0 then incr(D, p .. "rb:attr", attrs, M.SLOT_TTL) end
  end

  -- resultado (INTENTOS: ok + fail real + fast_fail + denied + too_large)
  if outcome == "fail" then
    -- `attempts == 0` ⇒ el gateway no intentó ninguna candidata: estaba
    -- marcada caída por el circuito `down:` de 15 s ⇒ fast fail (sin fetch).
    local att_f = num(dec.attempts) or 0
    if att_f == 0 then incr(D, p .. "er:ffail", 1, M.SLOT_TTL)
    else incr(D, p .. "er:fail", 1, M.SLOT_TTL) end
  elseif outcome == "denied" then incr(D, p .. "er:den", 1, M.SLOT_TTL)
  elseif outcome == "too_large" then incr(D, p .. "er:big", 1, M.SLOT_TTL)
  else incr(D, p .. "er:ok", 1, M.SLOT_TTL) end

  return true
end

-- Familia edge: tiempos vistos por nginx en CUALQUIER location (log_by_lua).
-- t = { request_ms, upstream_ms, status, bytes, protocol }
function M.record_http(t, now)
  local D = dict()
  if not D or type(t) ~= "table" then return false end
  local sid = slot_of(now)
  local p = "e" .. sid .. ":"
  local r = num(t.request_ms)
  if r then incr(D, p .. "ed:r", r, M.SLOT_TTL) end
  local u = num(t.upstream_ms)
  if u then
    incr(D, p .. "ed:u", u, M.SLOT_TTL)
    incr(D, p .. "ed:un", 1, M.SLOT_TTL)
  end
  incr(D, p .. "ed:n", 1, M.SLOT_TTL)
  local st = num(t.status) or 0
  if st >= 500 then incr(D, p .. "ed:s5", 1, M.SLOT_TTL)
  elseif st >= 400 then incr(D, p .. "ed:s4", 1, M.SLOT_TTL)
  elseif st >= 300 then incr(D, p .. "ed:s3", 1, M.SLOT_TTL)
  else incr(D, p .. "ed:s2", 1, M.SLOT_TTL) end
  local by = num(t.bytes)
  if by and by > 0 then incr(D, p .. "ed:byt", by, M.SLOT_TTL) end
  if t.protocol == "HTTP/2.0" then incr(D, p .. "ed:h2", 1, M.SLOT_TTL)
  else incr(D, p .. "ed:h1", 1, M.SLOT_TTL) end
  return true
end

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · AGREGACIÓN VENTANEADA (solo lectura, solo loopback)
-- ─────────────────────────────────────────────────────────────────────────────

local function getn(D, key)
  local n = tonumber(D:get(key))
  if not n then return 0 end
  return n
end

-- Suma los últimos `nslots` slots (incluye el actual, que es parcial).
function M.aggregate(nslots, now)
  local D = dict()
  local out = {
    available = (D ~= nil),
    now = now or ngx.now(),
    nslots = nslots,
    coverage_s = nslots * M.SLOT_SEC,
    partial_age_s = 0,
    pf_b = {}, pf_s = 0, pf_n = 0,
    h1_s = 0, h1_n = 0, hl_s = 0, hl_n = 0,
    hp = { 0, 0, 0, 0 }, hp_x = 0, hp_r = 0, hp_att = 0,
    uhd = { na = 0, m_off = 0, m_4k = 0, m_8k = 0, m_blk = 0 }, uhd_var = 0,
    rb = { m = 0, d = 0, yesm = 0, yesd = 0, uris = 0, attr = 0 },
    er = { ok = 0, fail = 0, den = 0, big = 0, ffail = 0 },
    ed = { r = 0, u = 0, un = 0, n = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0,
           byt = 0, h2 = 0, h1 = 0 },
    slots = {},
  }
  if not D then return out end

  local sid = slot_of(out.now)
  out.partial_age_s = math.floor(out.now - sid * M.SLOT_SEC)
  for i = 1, M.MS_NB do out.pf_b[i] = 0 end

  for k = 0, nslots - 1 do
    local s = sid - k
    out.slots[#out.slots + 1] = s
    local p = "m" .. s .. ":"
    for i = 1, M.MS_NB do
      out.pf_b[i] = out.pf_b[i] + getn(D, p .. "pf:b" .. i)
    end
    out.pf_s  = out.pf_s  + getn(D, p .. "pf:s")
    out.h1_s  = out.h1_s  + getn(D, p .. "pf:1:s")
    out.h1_n  = out.h1_n  + getn(D, p .. "pf:1:n")
    out.hl_s  = out.hl_s  + getn(D, p .. "pf:L:s")
    out.hl_n  = out.hl_n  + getn(D, p .. "pf:L:n")
    for h = 0, M.MAX_HOPS do
      out.hp[h + 1] = out.hp[h + 1] + getn(D, p .. "hp:" .. h)
    end
    out.hp_x   = out.hp_x   + getn(D, p .. "hp:x")
    out.hp_r   = out.hp_r   + getn(D, p .. "hp:r")
    out.hp_att = out.hp_att + getn(D, p .. "hp:att")
    out.uhd.na    = out.uhd.na    + getn(D, p .. "uhd:na")
    out.uhd.m_off = out.uhd.m_off + getn(D, p .. "uhd:m_off")
    out.uhd.m_4k  = out.uhd.m_4k  + getn(D, p .. "uhd:m_4k")
    out.uhd.m_8k  = out.uhd.m_8k  + getn(D, p .. "uhd:m_8k")
    out.uhd.m_blk = out.uhd.m_blk + getn(D, p .. "uhd:m_blk")
    out.uhd_var   = out.uhd_var   + getn(D, p .. "uhd:var")
    out.rb.m    = out.rb.m    + getn(D, p .. "rb:m")
    out.rb.d    = out.rb.d    + getn(D, p .. "rb:d")
    out.rb.yesm = out.rb.yesm + getn(D, p .. "rb:yesm")
    out.rb.yesd = out.rb.yesd + getn(D, p .. "rb:yesd")
    out.rb.uris = out.rb.uris + getn(D, p .. "rb:uris")
    out.rb.attr = out.rb.attr + getn(D, p .. "rb:attr")
    out.er.ok   = out.er.ok   + getn(D, p .. "er:ok")
    out.er.fail = out.er.fail + getn(D, p .. "er:fail")
    out.er.den  = out.er.den  + getn(D, p .. "er:den")
    out.er.big  = out.er.big  + getn(D, p .. "er:big")
    out.er.ffail = out.er.ffail + getn(D, p .. "er:ffail")

    local ep = "e" .. s .. ":"
    out.ed.r   = out.ed.r   + getn(D, ep .. "ed:r")
    out.ed.u   = out.ed.u   + getn(D, ep .. "ed:u")
    out.ed.un  = out.ed.un  + getn(D, ep .. "ed:un")
    out.ed.n   = out.ed.n   + getn(D, ep .. "ed:n")
    out.ed.s2  = out.ed.s2  + getn(D, ep .. "ed:s2")
    out.ed.s3  = out.ed.s3  + getn(D, ep .. "ed:s3")
    out.ed.s4  = out.ed.s4  + getn(D, ep .. "ed:s4")
    out.ed.s5  = out.ed.s5  + getn(D, ep .. "ed:s5")
    out.ed.byt = out.ed.byt + getn(D, ep .. "ed:byt")
    out.ed.h2  = out.ed.h2  + getn(D, ep .. "ed:h2")
    out.ed.h1  = out.ed.h1  + getn(D, ep .. "ed:h1")
  end

  local n = 0
  for i = 1, M.MS_NB do n = n + out.pf_b[i] end
  out.pf_n = n
  return out
end

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · PERCENTILES (histograma + interpolación lineal en el bucket)
-- ─────────────────────────────────────────────────────────────────────────────
-- p en (0,1]. Devuelve { ms, lo, hi, open, bucket } o nil si no hay muestras.
-- `open = true` ⇒ el valor cae en el bucket abierto (>8000 ms): se devuelve el
-- límite inferior y la cota superior es nil (no se inventa un número).
function M.percentile(pf_b, pf_n, p)
  local total = tonumber(pf_n) or 0
  if total <= 0 then return nil end
  local target = p * total
  local cum = 0
  for i = 1, M.MS_NB do
    local c = tonumber(pf_b[i]) or 0
    if c > 0 then
      local nxt = cum + c
      if nxt >= target then
        local lo = (i == 1) and 0 or M.MS_BOUNDS[i - 1]
        local hi = M.MS_BOUNDS[i]
        if not hi then
          return { ms = lo, lo = lo, hi = nil, open = true, bucket = i }
        end
        local frac = (target - cum) / c
        local v = lo + (hi - lo) * frac
        if v < 0 then v = 0 end
        if v > hi then v = hi end
        return { ms = math.floor(v + 0.5), lo = lo, hi = hi, open = false, bucket = i }
      end
      cum = nxt
    end
  end
  return { ms = M.MS_BOUNDS[#M.MS_BOUNDS], lo = M.MS_BOUNDS[#M.MS_BOUNDS],
           hi = nil, open = true, bucket = M.MS_NB }
end

local function round1(x)
  if type(x) ~= "number" then return nil end
  return math.floor(x * 10 + 0.5) / 10
end

local function round4(x)
  if type(x) ~= "number" then return nil end
  return math.floor(x * 10000 + 0.5) / 10000
end

local function pct_block(pf_b, pf_n, sum_ms)
  local b = {
    n = pf_n or 0,
    sum_ms = math.floor((sum_ms or 0) + 0.5),
    mean_ms = ((pf_n or 0) > 0) and round1((sum_ms or 0) / pf_n) or nil,
    method = "histogram_linear_interp",
    bounds = M.MS_BOUNDS,
    counts = {},
  }
  local tot = 0
  for i = 1, M.MS_NB do
    b.counts[i] = pf_b[i] or 0
    tot = tot + b.counts[i]
  end
  b.open_count = b.counts[M.MS_NB]
  local specs = { { "p50_ms", 0.50 }, { "p90_ms", 0.90 },
                  { "p95_ms", 0.95 }, { "p99_ms", 0.99 } }
  for _, spec in ipairs(specs) do
    local name, p = spec[1], spec[2]
    local r = M.percentile(pf_b, tot, p)
    if r then
      b[name] = r.ms
      local base = name:gsub("_ms$", "")
      b[base .. "_range_ms"] = { r.lo, r.hi }
      if r.open then b[base .. "_open"] = true end
    end
  end
  return b
end

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · PROYECCIÓN (tabla plana lista para cjson) — la que sirve /_ape/metrics
-- ─────────────────────────────────────────────────────────────────────────────
function M.snapshot(win_s, now)
  local win = tonumber(win_s) or M.SLOT_SEC
  if win < M.SLOT_SEC then win = M.SLOT_SEC end
  local nslots = math.ceil(win / M.SLOT_SEC)
  if nslots < 1 then nslots = 1 end
  if nslots > M.NSLOT then nslots = M.NSLOT end

  local a = M.aggregate(nslots, now)

  local attempts = a.er.ok + a.er.fail + a.er.ffail + a.er.den + a.er.big
  local fails    = a.er.fail + a.er.ffail + a.er.den + a.er.big
  local hops_n   = a.hp[1] + a.hp[2] + a.hp[3] + a.hp[4] + a.hp_x
  local masters  = a.uhd.m_off + a.uhd.m_4k + a.uhd.m_8k + a.uhd.m_blk
  local declared = a.uhd.m_4k + a.uhd.m_8k
  local playlists = a.rb.m + a.rb.d

  local snap = {
    schema = M.SCHEMA,
    ts = math.floor(now or ngx.now()),
    plane = "meta/v3",
    available = a.available,
    window = {
      requested_s = win,
      coverage_s = a.coverage_s,
      slots = a.slots,
      partial_age_s = a.partial_age_s,
      slot_sec = M.SLOT_SEC,
      note = "el slot en curso es parcial (partial_age_s)",
    },
    provider_fetch_ms = pct_block(a.pf_b, a.pf_n, a.pf_s),
    provider_fetch_split = {
      first_hop_mean_ms = (a.h1_n > 0) and round1(a.h1_s / a.h1_n) or nil,
      first_hop_n = a.h1_n,
      last_hop_mean_ms = (a.hl_n > 0) and round1(a.hl_s / a.hl_n) or nil,
      last_hop_n = a.hl_n,
      note = "first_hop = fetch al proveedor; last_hop = fetch al CDN tras el 302",
    },
    hops = {
      n = hops_n,
      dist = { ["0"] = a.hp[1], ["1"] = a.hp[2], ["2"] = a.hp[3], ["3"] = a.hp[4] },
      exhausted = a.hp_x,
      redirects_total = a.hp_r,
      attempts = a.hp_att,
      mean = (hops_n > 0) and round1(a.hp_r / hops_n) or nil,
      max_hops = M.MAX_HOPS,
    },
    uhd_mode = {
      masters = masters,
      media_playlists = a.uhd.na,
      dist = { off = a.uhd.m_off, ["4k"] = a.uhd.m_4k, ["8k"] = a.uhd.m_8k,
               blocked = a.uhd.m_blk },
      variants_total = a.uhd_var,
      declared_pct = (masters > 0) and round1(100 * declared / masters) or nil,
      blocked_pct = (masters > 0) and round1(100 * a.uhd.m_blk / masters) or nil,
      note = "solo masters: en media playlist no hay nada que declarar",
    },
    rebase = {
      playlists = playlists,
      masters = a.rb.m,
      media = a.rb.d,
      rebase_yes = a.rb.yesm + a.rb.yesd,
      rebase_pct = (playlists > 0) and round1(100 * (a.rb.yesm + a.rb.yesd) / playlists) or nil,
      media_rebase_pct = (a.rb.d > 0) and round1(100 * a.rb.yesd / a.rb.d) or nil,
      master_rebase_pct = (a.rb.m > 0) and round1(100 * a.rb.yesm / a.rb.m) or nil,
      uris_total = a.rb.uris,
      attrs_total = a.rb.attr,
      uris_per_playlist = (playlists > 0) and round1(a.rb.uris / playlists) or nil,
      note = "mide trabajo (URIs rebasadas), no corrección: usar el arnés sample",
    },
    errors = {
      attempts = attempts,
      ok = a.er.ok,
      upstream_fail = a.er.fail,
      fast_fail = a.er.ffail,
      denied = a.er.den,
      too_large = a.er.big,
      fail_total = fails,
      error_ratio = (attempts > 0) and round4(fails / attempts) or nil,
      upstream_error_ratio = (attempts > 0) and round4(a.er.fail / attempts) or nil,
      fast_fail_ratio = (attempts > 0) and round4(a.er.ffail / attempts) or nil,
      fast_fail_note = "fast_fail = el gateway NO habló con el proveedor: todas las candidatas estaban marcadas caídas (circuito down: 15 s). Un fallo real contamina la ventana siguiente.",
      error_ratio_note = "fallos/INTENTOS (fix de D-67: antes era fallos/éxitos)",
    },
    edge = {
      n = a.ed.n,
      mean_request_ms = (a.ed.n > 0) and round1(a.ed.r / a.ed.n) or nil,
      mean_upstream_ms = (a.ed.un > 0) and round1(a.ed.u / a.ed.un) or nil,
      upstream_n = a.ed.un,
      status = { s2 = a.ed.s2, s3 = a.ed.s3, s4 = a.ed.s4, s5 = a.ed.s5 },
      bytes_total = a.ed.byt,
      h1 = a.ed.h1,
      h2 = a.ed.h2,
      note = "familia e<slot>: tiempos de nginx por location (media, no percentil)",
    },
    cost = {
      dict = M.DICT,
      meta_keys_per_slot = #META_KEYS + M.MS_NB,
      edge_keys_per_slot = #EDGE_KEYS,
      slots = M.NSLOT,
      keys_max = ( #META_KEYS + M.MS_NB + #EDGE_KEYS ) * M.NSLOT,
      writes_per_request = 14,
      hot_path_writes = 0,
      phase = "log_by_lua (después de enviar la respuesta)",
      ttl_s = M.SLOT_TTL,
    },
  }
  return snap
end

-- Contadores acumulativos EXISTENTES: no se tocan (compatibilidad con /_ape/qoe,
-- /_ape/health, el watchdog `ape-meta-watchdog` y el ancla de lista
-- `#EXT-X-APE-CDN-QOE:/_ape/qoe`). Aquí solo se leen, con la fórmula corregida.
local CUM_KEYS = {
  "req", "bytes", "failovers", "all_failed", "auth_denied", "rebase_ok",
  "llhls_sc", "hint_injected", "redirects", "cdn_denied", "too_large",
  "uhd4k", "uhd8k", "last_ms", "last_host", "last_origin", "last_ts",
}

function M.cumulative()
  local D = dict()
  local out = {}
  if D then
    for _, k in ipairs(CUM_KEYS) do out[k] = D:get(k) end
  end
  local ok_n   = tonumber(out.req) or 0
  local fail_n = tonumber(out.all_failed) or 0
  local den_n  = tonumber(out.cdn_denied) or 0
  local big_n  = tonumber(out.too_large) or 0
  local att    = ok_n + fail_n + den_n + big_n
  out.attempts = att
  out.fail_total = fail_n + den_n + big_n
  out.error_ratio_cum = (att > 0) and round4((fail_n + den_n + big_n) / att) or nil
  out.error_ratio_cum_note =
    "fallos/INTENTOS acumulados desde el arranque del worker (contadores D-67: no citables como QoE)"
  return out
end

return M
