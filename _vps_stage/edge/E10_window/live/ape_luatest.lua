-- ═══════════════════════════════════════════════════════════════════════════
-- APE LUATEST — tests de integración de módulos Lua, ejecutados por el LuaJIT
-- real de nginx (no hay luajit CLI en el VPS).
--
-- Uso:  location = /_ape/luatest { allow 127.0.0.1; deny all; content_by_lua_file ...; }
-- Devuelve JSON: { pass, fail, total, results[] }.
--
-- Cubre los dos módulos que estaban "cableados pero inertes":
--   * bw_adaptive_floor     (adaptive_floor / escalation_floor / select_variants)
--   * ape_profile_resolver  (streamid_from_uri / resolve_from_map)
-- ═══════════════════════════════════════════════════════════════════════════
local cjson = require "cjson.safe"
local results = {}

local function eq(name, got, want)
    local pass
    if want == nil then
        pass = (got == nil)
    else
        pass = (got == want)
    end
    results[#results + 1] = {
        name = name, pass = pass,
        got = tostring(got), want = tostring(want),
    }
end

-- ── bw_adaptive_floor ────────────────────────────────────────────────────
local ok_bwf, bwf = pcall(require, "bw_adaptive_floor")
if ok_bwf and bwf then
    local f
    f = bwf.adaptive_floor(18000000, nil)
    eq("bwf.sin_senal_estatico", f, 18000000)
    f = bwf.adaptive_floor(18000000, { state = "CBR_SUSTAIN", ewma_bps = 50000000 })
    eq("bwf.sano_estatico", f, 18000000)
    f = bwf.adaptive_floor(18000000, { state = "DOUBLE", ewma_bps = 5000000 })
    eq("bwf.degradado_relaja_0.8x", f, 4000000)
    f = bwf.adaptive_floor(18000000, { state = "DOUBLE", ewma_bps = 5000000, age_s = 120 })
    eq("bwf.stale_no_relaja", f, 18000000)
    f = bwf.adaptive_floor(18000000, { state = "CBR_SUSTAIN", ewma_bps = 0 })
    eq("bwf.frio_no_relaja", f, 18000000)

    f = bwf.escalation_floor(20000000, { state = "CBR_SUSTAIN", ewma_bps = 30000000 }, 1)
    eq("bwf.escalado_0.75x", f, 15000000)
    f = bwf.escalation_floor(20000000, { state = "DOUBLE", ewma_bps = 30000000 }, 1)
    eq("bwf.escalado_bypass_si_degradado", f, 0)
    f = bwf.escalation_floor(5000000, { state = "CBR_SUSTAIN", ewma_bps = 30000000 }, 1)
    eq("bwf.escalado_sin_variante_alta", f, 0)

    local kept = bwf.select_variants(
        { { bw = 1000000, score = 10 }, { bw = 9000000, score = 90 }, { bw = 500000, score = 5 } },
        8000000, "ACTIVE", { state = "CBR_SUSTAIN", ewma_bps = 50000000 })
    eq("bwf.select_conserva_mejor", kept and kept[1] and kept[1].score, 90)
    eq("bwf.select_nunca_vacio", (kept and #kept or 0) >= 1, true)
else
    results[#results + 1] = { name = "bwf.require", pass = false, got = tostring(bwf), want = "modulo" }
end

-- ── ape_profile_resolver ─────────────────────────────────────────────────
local ok_pr, pr = pcall(require, "ape_profile_resolver")
if ok_pr and pr then
    eq("pr.streamid_m3u8", pr.streamid_from_uri("/live/u/p/123.m3u8"), "123")
    eq("pr.streamid_ts", pr.streamid_from_uri("/live/u/p/123.ts"), "123")
    eq("pr.streamid_sin_id", pr.streamid_from_uri("/live/u/p/master.m3u8"), nil)
    eq("pr.map_por_streamid", pr.resolve_from_map("/live/u/p/7.m3u8", { default = "P2", by_streamid = { ["7"] = "P0" } }), "P0")
    eq("pr.map_default", pr.resolve_from_map("/live/u/p/9.m3u8", { default = "P2" }), "P2")
    eq("pr.map_ausente", pr.resolve_from_map("/x.m3u8", nil), nil)
    eq("pr.map_invalido", pr.resolve_from_map("/live/u/p/7.m3u8", { by_streamid = { ["7"] = "P9" } }), nil)
else
    results[#results + 1] = { name = "pr.require", pass = false, got = tostring(pr), want = "modulo" }
end

-- ── infraestructura del plano ────────────────────────────────────────────
local d = ngx.shared.circuit_metrics
eq("shared.circuit_metrics", d ~= nil, true)
eq("shared.lab_config", ngx.shared.lab_config ~= nil, true)
eq("shared.ape_flags", ngx.shared.ape_flags ~= nil, true)

-- ── ape_rebase_lib (funciones puras del gateway) ─────────────────────────
local ok_lib, lib = pcall(require, "ape_rebase_lib")
if ok_lib and lib then
    eq("lib.abs_absoluta", lib.absolutize("http://x/y", "http://o"), nil)
    eq("lib.abs_relativa", lib.absolutize("a/b.ts", "http://o"), "http://o/a/b.ts")
    eq("lib.abs_raiz", lib.absolutize("/a/b.ts", "http://o"), "http://o/a/b.ts")
    eq("lib.abs_esquema_relativa", lib.absolutize("//x/y", "http://o"), nil)

    local b, nu, na = lib.rebase_body(
        "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"k.bin\"\n/live/1.ts\n", "http://o")
    eq("lib.rebase_uri_count", nu, 1)
    eq("lib.rebase_attr_count", na, 1)
    eq("lib.rebase_uri_abs", b:find("http://o/live/1.ts", 1, true) ~= nil, true)
    eq("lib.rebase_attr_abs", b:find('URI="http://o/k.bin"', 1, true) ~= nil, true)

    eq("lib.master_si", lib.is_master("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv.m3u8\n"), true)
    eq("lib.master_no", lib.is_master("#EXTM3U\n#EXTINF:2,\ns.ts\n"), false)

    local mparts = "#EXTM3U\n#EXT-X-PART-INF:PART-TARGET=0.500\n#EXT-X-PART:DURATION=0.5,URI=\"p.m4s\"\n"
    eq("lib.parts_si", lib.has_parts(mparts), true)
    local sc, ch = lib.inject_server_control(mparts)
    eq("lib.sc_inyectado", ch, true)
    eq("lib.sc_holdback_3x", sc:find("PART-HOLD-BACK=1.500", 1, true) ~= nil, true)
    local _, ch2 = lib.inject_server_control(sc)
    eq("lib.sc_no_duplica", ch2, false)
    local _, ch3 = lib.inject_server_control("#EXTM3U\n#EXTINF:2,\ns.ts\n")
    eq("lib.sc_sin_partes_no_inyecta", ch3, false)

    local hint = lib.inject_presentation_hint("#EXTM3U\n", "2160p", 120)
    eq("lib.hint_fps_capado_60", hint:find("FRAME-RATE=60", 1, true) ~= nil, true)
    eq("lib.hint_no_es_codec", tostring(hint):find("RESOLUTION=", 1, true), nil)
else
    results[#results + 1] = { name = "lib.require", pass = false, got = "nil", want = "modulo" }
end

-- ── ape_uhd: "4K prevalece" con CODECS intacto ───────────────────────────
local ok_uhd, uhd = pcall(require, "ape_uhd")
if ok_uhd and uhd then
    local master = "#EXTM3U\n"
        .. "#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS=\"avc1.640028,mp4a.40.2\"\n"
        .. "1080p/i.m3u8\n"
        .. "#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=1280x720,CODECS=\"avc1.64001f\"\n720p/i.m3u8\n"

    local b4, n4 = uhd.declare(master, { target = uhd.TARGET_4K, mode = "4k" })
    eq("uhd.4k_variantes_tocadas", n4, 1)
    eq("uhd.4k_resolucion", b4:find("RESOLUTION=3840x2160", 1, true) ~= nil, true)
    eq("uhd.4k_codec_intacto", b4:find('CODECS="avc1.640028,mp4a.40.2"', 1, true) ~= nil, true)
    eq("uhd.4k_segunda_variante_intacta", b4:find("RESOLUTION=1280x720", 1, true) ~= nil, true)
    eq("uhd.4k_marca", b4:find("#EXT-X-APE-UPSCALE:declared=3840x2160", 1, true) ~= nil, true)

    local b8 = uhd.declare(master, { target = uhd.TARGET_8K, mode = "8k" })
    eq("uhd.8k_resolucion", b8:find("RESOLUTION=7680x4320", 1, true) ~= nil, true)
    eq("uhd.8k_codec_intacto", b8:find("avc1.640028", 1, true) ~= nil, true)

    local b4b = uhd.declare(b4, { target = uhd.TARGET_4K })
    eq("uhd.no_duplica_marca", select(2, b4b:gsub("#EXT%-X%-APE%-UPSCALE", "")), 1)

    eq("uhd.golden_rule_hev1_detectado",
        uhd.codec_truth_fields("#EXT-X-STREAM-INF:BANDWIDTH=1,CODECS=\"hev1.1.6.L120.B0\"\nv.m3u8\n"), 1)
    eq("uhd.golden_rule_hvc1_ok",
        uhd.codec_truth_fields("#EXT-X-STREAM-INF:BANDWIDTH=1,CODECS=\"hvc1.1.6.L120.B0\"\nv.m3u8\n"), 0)

    -- ── modo AUTO: 1080p -> 4K ; 4K -> 8K (decisión del propietario) ──
    eq("uhd.auto_top1080", uhd.top_resolution(master), 1920)

    local m4k = "#EXTM3U\n"
        .. "#EXT-X-STREAM-INF:BANDWIDTH=28000000,RESOLUTION=3840x2160,CODECS=\"hvc1.2.4.L153.B0,mp4a.40.2\"\n2160p/i.m3u8\n"
        .. "#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=1920x1080,CODECS=\"hvc1.1.6.L123.B0\"\n1080p/i.m3u8\n"
    eq("uhd.auto_top4k", uhd.top_resolution(m4k), 3840)

    local a1080, n1080, mode1080 = uhd.declare_auto(master)
    eq("uhd.auto_1080_a_4k", a1080:find("RESOLUTION=3840x2160", 1, true) ~= nil, true)
    eq("uhd.auto_1080_modo", mode1080, "4k")
    eq("uhd.auto_1080_codec_intacto", a1080:find("avc1.640028", 1, true) ~= nil, true)

    local a4k, n4k, mode4k = uhd.declare_auto(m4k)
    eq("uhd.auto_4k_a_8k", a4k:find("RESOLUTION=7680x4320", 1, true) ~= nil, true)
    eq("uhd.auto_4k_modo", mode4k, "8k")
    eq("uhd.auto_4k_codec_intacto", a4k:find("hvc1.2.4.L153.B0", 1, true) ~= nil, true)
    eq("uhd.auto_4k_segunda_intacta", a4k:find("RESOLUTION=1920x1080", 1, true) ~= nil, true)
else
    results[#results + 1] = { name = "uhd.require", pass = false, got = "nil", want = "modulo" }
end

-- ── ape_lab_bridge: el plano lee el ADN del LAB (DNA = SSOT) ──────────────
local ok_lab, lab = pcall(require, "ape_lab_bridge")
if ok_lab and lab then
    local d = lab.get()
    eq("lab.carga", d.ok, true)
    eq("lab.fuente_dna", tostring(d.source):find("DNA", 1, true) ~= nil, true)
    eq("lab.floor_p0", d.floors and d.floors.P0, 15000000)
    eq("lab.floor_p1", d.floors and d.floors.P1, 12000000)
    eq("lab.floor_p5", d.floors and d.floors.P5, 1500000)
    eq("lab.floor_default", d.floors and d.floors.DEFAULT, 8000000)
    eq("lab.floor_for_nil", lab.floor_for(nil), 8000000)
    eq("lab.res_p0_8k", d.profiles and d.profiles.P0 and d.profiles.P0.resolution, "7680x4320")
    eq("lab.res_p3_4k", d.profiles and d.profiles.P3 and d.profiles.P3.resolution, "3840x2160")
    eq("lab.codec_p1", d.profiles and d.profiles.P1 and d.profiles.P1.codec, "hvc1.2.4.L153.B0")
    eq("lab.fake4k_engine_off", d.channel_dna and d.channel_dna.prisma_fake_4k_upscaler_enabled, false)
    -- tras la unificación (2026-10-24) el export viejo ya coincide con la DNA
    eq("lab.sin_drift", d.drift, nil)
else
    results[#results + 1] = { name = "lab.require", pass = false, got = "nil", want = "modulo" }
end

local pass, fail = 0, 0
for _, r in ipairs(results) do
    if r.pass then pass = pass + 1 else fail = fail + 1 end
end
ngx.header["Content-Type"] = "application/json"
ngx.say(cjson.encode({
    pass = pass, fail = fail, total = #results, results = results,
}))
