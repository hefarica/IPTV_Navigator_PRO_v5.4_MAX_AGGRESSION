-- ═════════════════════════════════════════════════════════════════════════════
-- SELFTEST de ape_obs_metrics.lua — se ejecuta con el `lua` del VPS (5.1.5),
-- con el stub de ngx cargado antes y la librería en package.preload.
-- Lo arma `scripts/selftest_lua.sh` (no escribe nada en el VPS: va por stdin).
--
-- Comprueba, con valores calculados A MANO:
--   · buckets e interpolación de percentiles (incluido el bucket abierto)
--   · n=0 ⇒ no se inventa percentil
--   · ventana deslizante: slot actual + anterior, slot viejo fuera de ventana
--   · error_ratio = fallos/INTENTOS (el fix de D-67)
--   · uhd_mode solo en masters, rebase separado master/media
--   · degradación si `incr` no acepta init_ttl
--   · proyección JSON-able (sin tablas raras) y coste declarado
-- Salida: líneas "ok N - ..." / "not ok N - ..." + resumen; exit 1 si falla.
-- ═════════════════════════════════════════════════════════════════════════════

local STUB = _G.__STUB
local M = require "ape_obs_metrics"

local pass, fail = 0, 0
local function ok(cond, name, extra)
    if cond then
        pass = pass + 1
        print(string.format("ok %d - %s", pass + fail, name))
    else
        fail = fail + 1
        print(string.format("not ok %d - %s%s", pass + fail, name,
            extra and (" [" .. tostring(extra) .. "]") or ""))
    end
end

local function eq(got, want, name)
    local cond = (got == want)
    ok(cond, name, cond and nil or ("got=" .. tostring(got) .. " want=" .. tostring(want)))
end

local function reset(dictname)
    local d = ngx.shared[dictname or "ape_qoe"]
    for _, k in ipairs(d:get_keys(10000)) do d:delete(k) end
end

-- ─── 1 · percentiles puros ───────────────────────────────────────────────────
local function buckets(spec)
    -- spec: { [bucket_index] = count }
    local b = {}
    for i = 1, M.MS_NB do b[i] = 0 end
    for i, c in pairs(spec) do b[i] = c end
    local n = 0
    for i = 1, M.MS_NB do n = n + b[i] end
    return b, n
end

do
    -- Mapa de buckets REAL (bounds[i] = límite superior EXCLUSIVO del bucket i;
    -- el bucket i cubre [bounds[i-1], bounds[i]) y el 16 es abierto).
    eq(M.MS_BOUNDS[7], 400, "bounds[7] = 400")
    eq(M.MS_BOUNDS[8], 600, "bounds[8] = 600 ⇒ bucket 8 = [400,600)")
    eq(M.MS_BOUNDS[9], 800, "bounds[9] = 800 ⇒ bucket 9 = [600,800)")
    eq(M.MS_NB, 16, "16 buckets (15 cerrados + 1 abierto)")

    -- todos en el bucket 8 = [400,600): p50 debe caer en el centro exacto
    local b, n = buckets({ [8] = 10 })
    local r = M.percentile(b, n, 0.50)
    eq(r.ms, 500, "p50 con 10 muestras en [400,600) = 500 (centro)")
    eq(r.lo, 400, "p50.lo = 400")
    eq(r.hi, 600, "p50.hi = 600")
    ok(r.open == false, "p50 no es bucket abierto")

    -- dos buckets: 12 en [400,600) (bucket 8) + 8 en [800,1200) (bucket 10)
    local b2, n2 = buckets({ [8] = 12, [10] = 8 })
    eq(M.percentile(b2, n2, 0.50).ms, 567, "p50 mezclado = 400+200*(10/12) = 567")
    eq(M.percentile(b2, n2, 0.90).ms, 1100, "p90 mezclado = 800+400*0.75 = 1100")
    eq(M.percentile(b2, n2, 0.99).ms, 1190, "p99 mezclado = 800+400*0.975 = 1190")
    eq(M.percentile(b2, n2, 0.10).ms, 433, "p10 = 400+200*(2/12) = 433")

    -- bucket abierto (>8000): no se inventa un número
    local b3, n3 = buckets({ [M.MS_NB] = 5 })
    local r3 = M.percentile(b3, n3, 0.99)
    ok(r3.open == true, "p99 en bucket abierto ⇒ open=true")
    eq(r3.ms, 8000, "p99 abierto devuelve la cota inferior 8000, no un invento")
    eq(r3.hi, nil, "p99 abierto no tiene cota superior")

    -- sin muestras: nil (no 0)
    eq(M.percentile(buckets({}), 0, 0.5), nil, "sin muestras ⇒ percentil nil, no 0")
end

-- ─── 2 · registro + agregación ventaneada ────────────────────────────────────
do
    reset()
    STUB.now = 1000 * 300 + 10          -- slot S, 10 s dentro del slot
    local S = 1000

    local dec_ok = {
        outcome = "ok", ms = 700, hops = 1, hop1_ms = 650, hoplast_ms = 50,
        attempts = 1, kind = "media", uhd = "off", uris = 12, attrs = 0,
    }
    for _ = 1, 3 do M.record_decision(dec_ok) end

    local dec_master = {
        outcome = "ok", ms = 400, hops = 0, hop1_ms = 400, hoplast_ms = 400,
        attempts = 1, kind = "master", uhd = "4k", uhd_n = 1, uris = 0, attrs = 0,
    }
    M.record_decision(dec_master)

    local dec_fail = {
        outcome = "fail", status = 502, ms = 3, hops = 0, attempts = 1, kind = "unknown",
    }
    M.record_decision(dec_fail)

    -- E7 · fast fail: el gateway NO intentó (todas marcadas caídas) ⇒ attempts=0
    local dec_ffail = {
        outcome = "fail", status = 502, ms = 0, hops = 0, attempts = 0, kind = "unknown",
    }
    M.record_decision(dec_ffail)

    local dec_blocked = {
        outcome = "ok", ms = 500, hops = 1, hop1_ms = 500, hoplast_ms = 0,
        attempts = 1, kind = "master", uhd = "blocked", uris = 0, attrs = 0,
    }
    M.record_decision(dec_blocked)

    local s = M.snapshot(300)
    eq(s.window.slots[1], S, "slot actual = floor(now/300)")
    eq(s.provider_fetch_ms.n, 5, "provider_fetch_ms.n = 5 (solo éxitos)")
    eq(s.provider_fetch_ms.mean_ms, 600.0, "media exacta = (3*700+400+500)/5 = 600")
    eq(s.provider_fetch_ms.p50_ms, 633, "p50 = 600+200*(2.5-2)/3 = 633 (bucket [600,800))")
    eq(s.errors.attempts, 7, "intentos = 5 éxitos + 1 fallo real + 1 fast fail")
    eq(s.errors.fail_total, 2, "fail_total = 2")
    eq(s.errors.upstream_fail, 1, "fallo REAL con fetch = 1")
    eq(s.errors.fast_fail, 1, "fast fail (sin fetch, host marcado caído) = 1")
    eq(s.errors.error_ratio, 0.2857, "error_ratio = 2/7 = 0.2857 (fallos/INTENTOS)")
    eq(s.errors.fast_fail_ratio, 0.1429, "fast_fail_ratio = 1/7 = 0.1429")
    eq(s.errors.ok, 5, "ok = 5")
    eq(s.hops.dist["0"], 3, "hops=0 ⇒ 3 (master + fallo real + fast fail)")
    eq(s.hops.dist["1"], 4, "hops=1 ⇒ 4")
    eq(s.hops.redirects_total, 4, "redirects_total = 4")
    eq(s.hops.mean, 0.6, "hops.mean = 4/7 = 0.571 → 0.6 (1 decimal)")
    eq(s.uhd_mode.masters, 2, "masters = 2 (4k + blocked)")
    eq(s.uhd_mode.media_playlists, 3, "media playlists servidas = 3")
    eq(s.uhd_mode.dist["4k"], 1, "uhd 4k = 1")
    eq(s.uhd_mode.dist.blocked, 1, "uhd blocked = 1 (GOLDEN RULE)")
    eq(s.uhd_mode.declared_pct, 50.0, "declared_pct = 1/2 masters = 50%")
    eq(s.uhd_mode.blocked_pct, 50.0, "blocked_pct = 1/2 masters = 50%")
    eq(s.rebase.media, 3, "media servidas = 3 (el fallo NO cuenta)")
    eq(s.rebase.media_rebase_pct, 100.0, "media rebase = 3/3 = 100%")
    eq(s.rebase.master_rebase_pct, 0.0, "master rebase = 0/2 (absolutas: normal)")
    eq(s.rebase.uris_per_playlist, 7.2, "uris/playlist = 36/5 = 7.2")
    eq(s.provider_fetch_split.first_hop_mean_ms, 570.0, "primer hop medio = 2850/5 = 570")
    eq(s.provider_fetch_split.last_hop_mean_ms, 110.0, "último hop medio = 550/5 = 110")

    -- ventana: los datos del slot anterior también entran; los de 2 slots atrás no
    STUB.now = STUB.now + 300            -- slot S+1
    M.record_decision({ outcome = "ok", ms = 100, hops = 0, attempts = 1,
                        kind = "media", uhd = "off", uris = 1 })
    local s2 = M.snapshot(600)
    eq(s2.provider_fetch_ms.n, 6, "ventana 600 s suma 2 slots (5+1)")
    local s3 = M.snapshot(300)
    eq(s3.provider_fetch_ms.n, 1, "ventana 300 s solo el slot actual")
    STUB.now = STUB.now + 600            -- 2 slots después del último registro
    local s4 = M.snapshot(600)
    eq(s4.provider_fetch_ms.n, 0, "los slots viejos salen de la ventana (0 muestras)")
end

-- ─── 3 · degradación sin init_ttl (lua-nginx viejo) ──────────────────────────
do
    reset()
    STUB.incr_no_ttl = true
    STUB.now = 2000 * 300 + 5
    -- Forzar que la librería re-evalúe el modo: se recarga el módulo
    package.loaded["ape_obs_metrics"] = nil
    local M2 = require "ape_obs_metrics"
    local okrec = M2.record_decision({ outcome = "ok", ms = 42, hops = 0,
        attempts = 1, kind = "media" })
    ok(okrec == true, "registro funciona aunque incr no acepte init_ttl")
    local s = M2.snapshot(300)
    eq(s.provider_fetch_ms.n, 1, "la muestra se registró por la ruta incr+expire")
    local logged = false
    for _, l in ipairs(STUB.logs) do
        if l:find("init_ttl", 1, true) then logged = true end
    end
    ok(logged, "se avisa UNA vez por log de la degradación")
    STUB.incr_no_ttl = false
    package.loaded["ape_obs_metrics"] = nil
end

-- ─── 4 · proyección serializable + coste declarado ──────────────────────────
do
    reset()
    STUB.now = 3000 * 300 + 1
    local M3 = require "ape_obs_metrics"
    M3.record_decision({ outcome = "ok", ms = 1234, hops = 2, hop1_ms = 700,
        hoplast_ms = 534, attempts = 1, kind = "master", uhd = "8k", uhd_n = 1,
        uris = 3, attrs = 1 })
    local s = M3.snapshot(1800)
    eq(s.window.coverage_s, 1800, "cobertura solicitada = 1800 s")
    ok(s.cost.hot_path_writes == 0, "declara 0 escrituras en ruta caliente")
    ok(s.cost.keys_max > 0 and s.cost.keys_max < 600, "presupuesto de claves < 600")
    ok(s.schema == "ape.obs.metrics/1", "schema versionado")
    -- serialización mínima: recorrer y comprobar tipos permitidos
    local function walk(v, path, bad)
        local t = type(v)
        if t == "table" then
            for k, vv in pairs(v) do walk(vv, path .. "." .. tostring(k), bad) end
        elseif t ~= "number" and t ~= "string" and t ~= "boolean" and v ~= nil then
            bad[#bad + 1] = path .. ":" .. t
        end
    end
    local bad = {}
    walk(s, "snap", bad)
    ok(#bad == 0, "proyección solo números/strings/booleanos", table.concat(bad, ","))
    eq(s.hops.dist["2"], 1, "hops=2 registrado")
    eq(s.uhd_mode.dist["8k"], 1, "uhd 8k registrado")
    eq(s.rebase.attrs_total, 1, "atributos rebasados registrados")
end

-- ─── 5 · contadores acumulativos (fórmula corregida) ────────────────────────
do
    reset()
    local d = ngx.shared["ape_qoe"]
    d:set("req", 91)              -- éxitos
    d:set("all_failed", 24)       -- fallos (contador viejo, envenenado por sondas)
    d:set("cdn_denied", 0)
    d:set("too_large", 0)
    local c = require("ape_obs_metrics").cumulative()
    eq(c.attempts, 115, "intentos acumulados = 91+24")
    eq(c.error_ratio_cum, 0.2087, "ratio corregido = 24/115 = 0.2087 (no 0.2637)")
    eq(c.req, 91, "req se publica igual (compat)")
end

print(string.format("1..%d", pass + fail))
print(string.format("# pass=%d fail=%d", pass, fail))
if fail > 0 then os.exit(1) end
