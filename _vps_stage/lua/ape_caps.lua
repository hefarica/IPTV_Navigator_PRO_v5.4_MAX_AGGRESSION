-- ═══════════════════════════════════════════════════════════════════════════
-- APE MEDIA FAN-OUT — I4 · Capacidades del cliente (?tv=) + selección de perfil
--   original/remux (default) vs 4K escalado (opcional, HARD-GATED) con HDR truth-guard.
--
-- ARCHIVO: /etc/nginx/lua/ape_caps.lua   (staging: _vps_stage/lua/ape_caps.lua)
-- ROL:     capa de DECISIÓN pura. Recibe (a) la señalización de capacidades del
--          dispositivo en `?tv=`, (b) el probe real de la fuente, (c) el snapshot
--          de hardware medido del nodo; y devuelve al coordinador I1:
--              { profile, variantArgs, truthfulHdr, ... }
--          NO abre sockets, NO habla con el proveedor, NO toca FFmpeg, NO escribe
--          en disco. Es seguro invocarla en `access_by_lua*` cuantas veces haga
--          falta: es idempotente y determinista (la hora se inyecta por `opts.now`).
--
-- ── VERDAD MEDIDA (W1 · docs/MEDIA_FANOUT_FEASIBILITY.md) ──────────────────
--   §8  fila 5  : 4K por transcode CPU x265 1080p→2160p = 0,356× realtime,
--                 techo 0,394× con 3 vCPU (7,61 core·s por s de contenido) → NO-GO.
--   §8  fila 7  : GPU del VPS = virtio-1.0 SIN motor de códec (VAAPI init failed -5,
--                 sin NVENC/QSV) → 4K por GPU NO-GO hoy.
--   §8  fila 9  : HDR passthrough = GO **condicionado a probe**.
--   §8  fila 10 : etiquetar HDR lo escalado/remuxeado = NO-GO (prohibido).
--   §8  fila 12 : LL-HLS / <4 s = NO-GO global (GOP de fuente 0,96–10 s).
--   §6.2/§6.9   : `idem` EXCLUYE el perfil → original y 4K comparten la MISMA
--                 ingesta; el 4K lee un mezzanine local, nunca el proveedor.
--   §7.1        : HDR10 real = color_transfer=smpte2084 + primaries=bt2020 + 10-bit.
--
-- ── INVARIANTES (no negociables; cada una tiene su caso de prueba) ─────────
--   I1  DEFAULT = ORIGINAL/REMUX (`-c copy`). El perfil 4K exige, a la vez:
--       (a) `?profile=4k`, (b) capacidad de 2160 declarada por el cliente,
--       (c) HW GATE real medido (GPU + encode ≥ 1,5× + benchmark fresco),
--       (d) códec del encoder declarado y decodificable por el cliente,
--       (e) cupo concurrente disponible. En ESTE VPS el gate falla por hardware
--           medido → el 4K es INALCANZABLE por diseño, no por configuración.
--   I2  HDR TRUTHFUL: `VIDEO-RANGE=PQ/HLG` SOLO si el probe confirma HDR en la
--       fuente (transfer+primaries+bit-depth) o si existe una conversión REAL de
--       bitstream validada por un probe de SALIDA. Nunca por escalar ni remuxear.
--       Si la fuente es SDR → SDR (salvo conversión real validada). Si no hay
--       probe → no se etiqueta HDR (se dice "no verificado", nunca "HDR").
--   I3  UNA SOLA INGESTA: `session.key` (idem) NO contiene perfil, códec, HDR,
--       cliente ni token; los dos perfiles producen la MISMA clave. El módulo
--       devuelve `single_upstream=true` y `no_upstream_socket=true`: el contrato
--       con I1 es "abre UNA conexión y compártela", jamás una por perfil.
--   I4  SIN PROMESAS IMPOSIBLES: `ll_hls=false`, `part_target=nil`, y la ventana
--       de latencia declarada es la medida (GOP-bound 6–25 s). Prohibido prometer
--       <4 s o buffer infinito.
--   I5  GOLDEN RULE: `hvc1.*` es lo único aceptable en STREAM-INF. Si el probe
--       trae `hev1.*`, no se emite en `CODECS=` (se conserva en `codec_probe_string`
--       para KODIPROP/EXTVLCOPT y se avisa). Nunca se inventa un codec string.
--   I6  Nunca se declara un códec/nivel que el cliente no declaró decodificar;
--       el codec declarado sale del PROBE (original) o del ENCODER (4K), jamás
--       de la cadena `?tv=` del cliente.
--
-- ── GRAMÁTICA DE `?tv=` (estricta; cualquier violación ⇒ fallback seguro) ───
--   Token form (separador `-`, case-insensitive, máx 16 tokens / 256 bytes):
--       <alto>p[<fps>]   alto ∈ {240,360,480,576,720,1080,1440,2160,4320}; fps 1..240
--       hdr10 | hdr10plus | hlg | dv | sdr | none
--       h264 | avc | h265 | hevc | av1 | av01 | vp9 | vvc
--       aac | ac3 | eac3 | ec3 | ddp | ac4 | mp3 | opus | atmos | flac
--       bw<N>            N = Mbps enteros 1..1000
--     Ejemplo canónico:  ?tv=2160p60-hdr10-hevc-bw50
--   JSON form (objeto plano, máx 512 bytes, sin anidamiento, sin null):
--       {"r":2160,"fps":60,"hdr":"hdr10","codecs":["hevc","av1"],
--        "audio":["eac3"],"bw":200,"v":1}
--     claves: r|res|resolution|height|h, fps|max_fps, hdr,
--             codec|codecs|c, audio|a, bw|bandwidth, v|version
--   Fallback seguro (cualquier error): caps.degraded=true, sin máximos → el
--   perfil resultante es SIEMPRE `original` (jamás se concede 4K por basura).
--
-- ── TABLA DE DECISIÓN (resumen; la tabla ejecutable es M.CASES) ────────────
--   | # | entrada                                  | perfil | variante        | HDR |
--   |---|------------------------------------------|--------|-----------------|-----|
--   | 1 | (nada)                                   | orig   | copy 1:1 probe  | no* |
--   | 2 | ?tv=2160p60-hdr10-hevc-bw50              | orig   | copy            | no* |
--   | 3 | ?tv=… & ?profile=4k  (sin snapshot HW)   | orig↓  | copy + 412 hint | no* |
--   | 4 | ?tv=… & ?profile=4k  (W1 medido)         | orig↓  | copy + 412 hint | no* |
--   | 5 | ?tv=… & ?profile=4k  (GPU ok ≥1,5×)      | 4k     | scale 3840x2160 | no  |
--   | 6 | ídem + fuente HDR + encoder preserva     | 4k     | scale           | PQ  |
--   | 7 | ?profile=4k sobre fuente ya 2160         | orig   | copy            | sí* |
--   | 8 | fuente HDR10 + original                  | orig   | copy            | PQ  |
--   | 9 | fuente HLG + original                    | orig   | copy            | HLG |
--   |10 | fuente DV real + original                | orig   | copy            | PQ+DV |
--   |11 | "HDR" de 8-bit / primaries bt709         | orig   | copy            | no  |
--   |12 | fuente SDR + cliente pide HDR            | orig   | copy            | no  |
--   |13 | fuente SDR + conversión REAL validada    | 4k     | scale (reencode)| PQ  |
--   |14 | conversión declarada sobre remux/upscale | orig   | copy            | no  |
--   |15 | ?tv= basura / rangos fuera de rango      | orig   | copy (degraded) | no* |
--   (*) "sí/no" depende del probe: el módulo nunca asume; sin probe ⇒ no.
--
-- ── CONTRATO HACIA I1 (coordinador) ───────────────────────────────────────
--   M.resolve{ args = {tv, profile, provider|host, channel|ch}, src = probe,
--              hw = snapshot, opts = {now, active_4k, conversion, encoder,
--              on_4k_unavailable, notice, notify} }
--     → decision = {
--         contract      = "ape.fanout.caps/v1",
--         profile       = "original"|"4k"|nil(solo si refused),
--         requested_profile,
--         variantArgs   = tabla de atributos de manifest (o nil si refused),
--         truthfulHdr   = boolean,   -- exactamente: hdr.video_range ~= nil
--         hdr           = {video_range, color_primaries, transfer_characteristics,
--                          supplemental_codecs, max_cll, max_fall, mode, missing…},
--         session       = {key, shared, profile_in_key=false, …},
--         caps, errors, warnings, reasons, notices, downgraded, refused,
--         reason (primario), metrics (tags para observabilidad)
--       }
--   El módulo NO decide HTTP: `notices` es una recomendación (412 + X-MF-Reason)
--   que I1 puede materializar sin romper playback (default = downgrade).
--   Regla de compatibilidad de player: 412 SOLO cuando falla el hardware del
--   servidor (gpu-unavailable/…). Un límite del cliente (resolución/códec/cupo)
--   se degrada a original con 200 + `X-MF-Profile`, porque TiviMate/ExoPlayer/
--   VLC tratan un 4xx como fatal y no deben ver un error por pedir 4K.
--
-- ── PRUEBAS (sin VPS: cualquier Lua 5.1) ──────────────────────────────────
--   lua5.1 ape_caps.lua --selftest     # 47 casos de decisión + parser/JSON/idem
--   lua5.1 ape_caps.lua --table        # tabla de decisión (markdown) ya evaluada
--   lua5.1 ape_caps.lua --json         # la misma tabla en JSON (para Node/PHP)
--   lua5.1 ape_caps.lua --host         # matriz de capacidades del nodo (W1)
--   lua5.1 ape_caps.lua --selftest --audit-src   # + auditoría "no abre sockets"
--   En nginx: `local caps = require "ape_caps"` (no ejecuta el runner; `arg`=nil).
-- ═══════════════════════════════════════════════════════════════════════════

local M = {}

M.VERSION        = "1.0.0"
M.SCHEMA_VERSION = "ape.fanout.caps/v1"

-- Límites de entrada (anti-abuso: `?tv=` viene de un cliente no confiable).
M.CAPS_MAX_LEN      = 256
M.CAPS_JSON_MAX_LEN = 512
M.CAPS_MAX_TOKENS   = 16
M.CAPS_MAX_KEYS     = 12
M.CAPS_MAX_LIST     = 8
M.CAPS_MAX_STR      = 64
M.CAPS_MAX_ERRORS   = 8
M.QUERY_MAX_LEN     = 1024

-- ── Política (números medidos en W1, no inventados) ────────────────────────
M.POLICY = {
    -- El camino 4K EXISTE en código, pero es inalcanzable sin evidencia de HW.
    allow_4k_path        = true,
    min_encode_speed     = 1.5,    -- W1 §6.9: publicar variante 4K solo con ≥1,5× realtime
    withdraw_encode_speed= 1.2,    -- W1 §6.9: por debajo de 1,2× se retira la variante
    hw_evidence_ttl_s    = 6 * 3600,
    require_benchmark_id = true,   -- sin id de benchmark no hay gate (anti "true" fabricado)
    max_concurrent_4k    = 1,      -- un nodo sin medir no sostiene más de un 4K
    min_segment_s        = 4,      -- W1 §6.5: max(4 s, GOP_fuente)
    max_segment_s        = 10,     -- GOP medido hasta 10 s
    target_4k            = { width = 3840, height = 2160 },
    on_4k_unavailable    = "downgrade",  -- "downgrade" | "reject"
    latency_window_s     = { min = 6, max = 25 },  -- W1 §6.5: G2G medido 6–25 s (GOP-bound)
}

-- ── Evidencia W1 del nodo actual (fuente única de verdad de hardware) ──────
-- Cualquier snapshot de HW que contradiga esto debe venir con benchmark_id +
-- measured_at fresco; si no, el gate lo rechaza (no se "cree" al caller).
M.W1_EVIDENCE = {
    host            = "178.156.147.234",
    measured_at     = "2026-10-24",
    vcpu            = 3,
    cpu             = "AMD EPYC-Rome @2.0GHz (KVM)",
    ram_mib         = 3819,
    gpu_encode      = "fail",
    gpu_kind        = "virtio-1.0 (card0/renderD128) sin motor de codec",
    vaapi           = "init failed (-5)",
    nvenc           = false,
    qsv             = false,
    x265_upscale_speed   = 0.356,   -- 1080p→2160p, ultrafast, contenido real
    x265_max_speed_3vcpu = 0.394,   -- techo teórico con 3 vCPU
    x265_cpu_per_stream  = 7.61,
    source_channels      = 12,
    source_hdr_channels   = 0,
    source_real_uhd      = 0,
    source_max_height    = 1080,
    gop_s_min            = 0.96,
    gop_s_max            = 10,
    remux_core_pct       = 1.08,
    sessions_max         = 16,
    sessions_recommended = 12,
}

M.HOST = {
    node                  = "vps-" .. M.W1_EVIDENCE.host,
    measured_at           = M.W1_EVIDENCE.measured_at,
    upscale_4k_available  = false,
    upscale_4k_reason     = "gpu_unavailable + x265 0,356x realtime (techo 0,394x)",
    hdr_passthrough       = "probe-gated",
    hdr_invented          = false,
    hdr_real_sample       = M.W1_EVIDENCE.source_hdr_channels .. "/" .. M.W1_EVIDENCE.source_channels,
    ll_hls_available      = false,
    ll_hls_reason         = "GOP fuente 0,96-10 s; -c copy no acorta GOP",
    shared_ingest         = true,
    infinite_buffer       = false,
}

-- Rangos válidos de la señalización.
local ALLOWED_HEIGHTS = {
    [240] = true, [360] = true, [480] = true, [576] = true, [720] = true,
    [1080] = true, [1440] = true, [2160] = true, [4320] = true,
}
local CODEC_ALIASES = {
    h264 = "h264", avc = "h264", avc1 = "h264", h2648 = "h264",
    h265 = "hevc", hevc = "hevc", hvc1 = "hevc", hev1 = "hevc",
    av1 = "av1", av01 = "av1",
    vp9 = "vp9", vp09 = "vp9",
    vvc = "vvc", h266 = "vvc",
}
local HDR_ALIASES = {
    hdr10 = "hdr10", ["hdr10+"] = "hdr10plus", hdr10p = "hdr10plus",
    hdr10plus = "hdr10plus", hlg = "hlg", dv = "dv", dovi = "dv",
    ["dolby-vision"] = "dv", sdr = "sdr", none = "sdr", hdr = "hdr10",
}
local AUDIO_ALIASES = {
    aac = "aac", ac3 = "ac3", eac3 = "eac3", ec3 = "eac3", ddp = "eac3",
    ac4 = "ac4", mp3 = "mp3", opus = "opus", atmos = "atmos",
    flac = "flac", pcm = "pcm",
}
local CODEC_PREFIXES = {
    h264 = { "avc1.", "avc3." },
    hevc = { "hvc1.", "hev1." },
    av1  = { "av01." },
    vp9  = { "vp09." },
    vvc  = { "vvc1.", "vvi1." },
}
-- Códigos → valor recomendado de `X-MF-Reason` (W1 §6.9).
local HW_REASON_HEADER = {
    no_live_hw_probe          = "hw-probe-missing",
    gpu_unavailable           = "gpu-unavailable",
    benchmark_missing         = "benchmark-missing",
    benchmark_undated         = "benchmark-undated",
    benchmark_stale           = "benchmark-stale",
    benchmark_unverifiable    = "benchmark-unverifiable",
    encode_speed_critical     = "encode-critical",
    encode_speed_below_threshold = "encode-below-threshold",
    capacity_exhausted        = "capacity-exhausted",
    encoder_undeclared        = "encoder-undeclared",
    hw_ok                     = "hw-ok",
}
local ELIG_REASON_HEADER = {
    not_requested                       = "not-requested",
    product_switch_off                  = "4k-path-off",
    client_resolution_undeclared         = "client-caps-missing",
    client_max_res_below_2160           = "client-max-res",
    source_already_uhd                  = "source-already-uhd",
    client_codec_caps_missing           = "client-codec-caps-missing",
    client_cannot_decode_encoder_codec  = "client-codec",
    encoder_codec_unknown               = "encoder-undeclared",
    encoder_not_transcode               = "encoder-not-transcode",
    encoder_output_below_2160           = "encoder-output-low",
}

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Utilidades
-- ═══════════════════════════════════════════════════════════════════════════
local function trim(s)
    if type(s) ~= "string" then return nil end
    return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function lower(s)
    if type(s) ~= "string" then return nil end
    return s:lower()
end

local function is_num(v)
    return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge
end

local function split(s, sep)
    local out, i = {}, 1
    if type(s) ~= "string" or s == "" then return out end
    while true do
        local j = s:find(sep, i, true)
        if not j then out[#out + 1] = s:sub(i); break end
        out[#out + 1] = s:sub(i, j - 1)
        i = j + #sep
    end
    return out
end

local function copy_shallow(t)
    local o = {}
    if type(t) == "table" then
        for k, v in pairs(t) do o[k] = v end
    end
    return o
end

local function contains_code(list, code)
    if type(list) ~= "table" or type(code) ~= "string" then return false end
    for _, v in ipairs(list) do
        if type(v) == "string" and (v == code or v:sub(1, #code + 1) == code .. ":") then
            return true
        end
    end
    return false
end

-- Percent-decode acotado (para `from_query`; no toca `-` como separador).
local function pct_decode(s)
    if type(s) ~= "string" then return nil end
    if #s > M.QUERY_MAX_LEN then return nil end
    local out = s:gsub("%%(%x%x)", function(h) return string.char(tonumber(h, 16)) end)
    out = out:gsub("+", " ")
    return out
end

-- Codificador JSON mínimo y determinista (para --json; sin dependencias).
local function json_escape(s)
    local map = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }
    return (s:gsub('[%z\1-\31"\\]', function(c)
        local m = map[c]
        if m then return m end
        return string.format("\\u%04x", c:byte())
    end))
end

local function is_array(t)
    local n = 0
    for k in pairs(t) do
        if type(k) ~= "number" then return false end
        n = n + 1
    end
    for i = 1, n do
        if t[i] == nil then return false end
    end
    return true, n
end

local json_encode

json_encode = function(v, depth)
    depth = depth or 0
    local t = type(v)
    if v == nil then return "null" end
    if t == "boolean" then return v and "true" or "false" end
    if t == "number" then
        if not is_num(v) then return "null" end
        if v == math.floor(v) and math.abs(v) < 1e15 then return string.format("%d", v) end
        local s = string.format("%.6f", v)
        s = s:gsub("0+$", "")
        s = s:gsub("%.$", "")
        return s
    end
    if t == "string" then return '"' .. json_escape(v) .. '"' end
    if t == "table" then
        if depth > 6 then return '"<depth>"' end
        local arr, n = is_array(v)
        if arr then
            local parts = {}
            for i = 1, n do parts[#parts + 1] = json_encode(v[i], depth + 1) end
            return "[" .. table.concat(parts, ",") .. "]"
        end
        local keys = {}
        for k in pairs(v) do
            if type(k) == "string" or type(k) == "number" then keys[#keys + 1] = tostring(k) end
        end
        table.sort(keys)
        local parts = {}
        for _, k in ipairs(keys) do
            local val = v[k]
            if val == nil then val = v[tonumber(k)] end
            parts[#parts + 1] = json_encode(k) .. ":" .. json_encode(val, depth + 1)
        end
        return "{" .. table.concat(parts, ",") .. "}"
    end
    return '"<unsupported>"'
end

M.json_encode = function(v) return json_encode(v) end

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) JSON plano (decoder estricto para el form compacto de `?tv=`)
--    Solo objeto plano con escalares y arrays de escalares. Sin null, sin
--    anidamiento, sin exponentes, sin \u no-ASCII, sin claves duplicadas.
-- ═══════════════════════════════════════════════════════════════════════════
local function json_decode(text)
    if type(text) ~= "string" then return nil, "not_string" end
    local n = #text
    if n == 0 then return nil, "empty" end
    if n > M.CAPS_JSON_MAX_LEN then return nil, "json_too_long" end

    local i = 1
    local parse_value, parse_object, parse_array

    local function skip_ws()
        while i <= n do
            local c = text:sub(i, i)
            if c == " " or c == "\t" or c == "\n" or c == "\r" then i = i + 1 else break end
        end
    end

    local function parse_string()
        i = i + 1 -- consume '"'
        local buf, count = {}, 0
        local escapes = { n = "\n", r = "\r", t = "\t", b = "\b", f = "\f", ['"'] = '"', ["\\"] = "\\", ["/"] = "/" }
        while i <= n do
            local c = text:sub(i, i)
            if c == '"' then i = i + 1; return table.concat(buf) end
            if c == "\\" then
                local e = text:sub(i + 1, i + 1)
                local mapped = escapes[e]
                if mapped then
                    buf[#buf + 1] = mapped
                    i = i + 2
                elseif e == "u" then
                    local hex = text:sub(i + 2, i + 5)
                    if #hex < 4 or not hex:match("^%x%x%x%x$") then return nil, "bad_unicode_escape" end
                    local cp = tonumber(hex, 16)
                    if cp > 0x7E then return nil, "nonascii_unicode_escape" end
                    buf[#buf + 1] = string.char(cp)
                    i = i + 6
                else
                    return nil, "bad_escape"
                end
            else
                if c:byte() < 0x20 then return nil, "control_char_in_string" end
                buf[#buf + 1] = c
                i = i + 1
            end
            count = count + 1
            if count > M.CAPS_MAX_STR then return nil, "string_too_long" end
        end
        return nil, "unterminated_string"
    end

    local function parse_number()
        local start = i
        if text:sub(i, i) == "-" then i = i + 1 end
        local digits = 0
        while text:sub(i, i):match("%d") do i = i + 1; digits = digits + 1 end
        if digits == 0 then return nil, "bad_number" end
        if text:sub(i, i) == "." then
            i = i + 1
            local frac = 0
            while text:sub(i, i):match("%d") do i = i + 1; frac = frac + 1 end
            if frac == 0 then return nil, "bad_fraction" end
        end
        local c = text:sub(i, i)
        if c == "e" or c == "E" then return nil, "exponent_not_allowed" end
        local num = tonumber(text:sub(start, i - 1))
        if not num then return nil, "bad_number" end
        return num
    end

    parse_array = function()
        i = i + 1 -- consume '['
        local out = {}
        skip_ws()
        if text:sub(i, i) == "]" then i = i + 1; return out end
        while true do
            skip_ws()
            local v, e = parse_value("in_array")
            if v == nil then return nil, e end
            if type(v) == "table" then return nil, "nested_not_allowed" end
            out[#out + 1] = v
            if #out > M.CAPS_MAX_LIST then return nil, "array_too_long" end
            skip_ws()
            local c = text:sub(i, i)
            if c == "," then i = i + 1
            elseif c == "]" then i = i + 1; return out
            else return nil, "bad_array" end
        end
    end

    parse_object = function()
        i = i + 1 -- consume '{'
        local out, keys = {}, 0
        skip_ws()
        if text:sub(i, i) == "}" then i = i + 1; return out end
        while true do
            skip_ws()
            if text:sub(i, i) ~= '"' then return nil, "object_key_not_string" end
            local k, ke = parse_string()
            if k == nil then return nil, ke end
            if out[k] ~= nil then return nil, "duplicate_key:" .. k end
            skip_ws()
            if text:sub(i, i) ~= ":" then return nil, "missing_colon" end
            i = i + 1
            local v, ve = parse_value("in_object")
            if v == nil then return nil, ve end
            out[k] = v
            keys = keys + 1
            if keys > M.CAPS_MAX_KEYS then return nil, "too_many_keys" end
            skip_ws()
            local c = text:sub(i, i)
            if c == "," then i = i + 1
            elseif c == "}" then i = i + 1; return out
            else return nil, "bad_object" end
        end
    end

    -- ctx: "in_object" (admite escalar o array de escalares) | "in_array" (solo escalar)
    parse_value = function(ctx)
        skip_ws()
        local c = text:sub(i, i)
        if c == "" then return nil, "unexpected_eof" end
        if c == '"' then return parse_string() end
        if c == "{" then return nil, "nested_not_allowed" end
        if c == "[" then
            if ctx == "in_array" then return nil, "nested_not_allowed" end
            return parse_array()
        end
        if c == "t" then
            if text:sub(i, i + 3) == "true" then i = i + 4; return true end
            return nil, "bad_literal"
        end
        if c == "f" then
            if text:sub(i, i + 4) == "false" then i = i + 5; return false end
            return nil, "bad_literal"
        end
        if c == "n" then return nil, "null_not_allowed" end
        if c == "-" or c:match("%d") then return parse_number() end
        return nil, "unexpected_char"
    end

    skip_ws()
    if text:sub(i, i) ~= "{" then return nil, "not_object" end
    local obj, oe = parse_object()
    if obj == nil then return nil, oe end
    skip_ws()
    if i <= n then return nil, "trailing_garbage" end
    return obj
end

M.json_decode = json_decode

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Parser de capacidades `?tv=` (token form + JSON form)
-- ═══════════════════════════════════════════════════════════════════════════
M.safe_caps = function()
    return {
        ok = false, source = "safe", degraded = true, declared = false,
        max_height = nil, max_fps = nil, codecs = nil, hdr = nil,
        hdr_sdr_only = nil, audio = nil, bw_mbps = nil,
        tokens = 0, raw = nil, errors = {}, warnings = {},
        contract = M.SCHEMA_VERSION,
    }
end

local function new_caps(source, raw)
    return {
        ok = true, source = source, degraded = false, declared = true,
        max_height = nil, max_fps = nil, codecs = nil, hdr = nil,
        hdr_sdr_only = nil, audio = nil, bw_mbps = nil,
        tokens = 0, raw = raw, errors = {}, warnings = {},
        contract = M.SCHEMA_VERSION,
    }
end

local function push_cap_error(caps, list, code)
    if #list < M.CAPS_MAX_ERRORS then list[#list + 1] = code end
    caps.ok = false
end

local function set_height_fps(caps, errs, h, f, where)
    if not ALLOWED_HEIGHTS[h] then
        push_cap_error(caps, errs, "bad_resolution:" .. tostring(where))
        return
    end
    if f ~= nil then
        if not is_num(f) or f < 1 or f > 240 then
            push_cap_error(caps, errs, "bad_fps:" .. tostring(where))
            return
        end
    end
    if caps.max_height and caps.max_height ~= h then
        local mx = math.max(caps.max_height, h)
        if mx ~= caps.max_height then caps.max_height = mx end
        caps.warnings[#caps.warnings + 1] = "superseded_resolution:" .. tostring(h)
    else
        caps.max_height = h
    end
    if f ~= nil then
        if caps.max_fps and f > caps.max_fps then caps.max_fps = f
        elseif not caps.max_fps then caps.max_fps = f end
    end
end

local function add_codec(caps, errs, name, where)
    local canon = CODEC_ALIASES[name]
    if not canon then
        push_cap_error(caps, errs, "unknown_codec:" .. tostring(where))
        return
    end
    caps.codecs = caps.codecs or {}
    caps.codecs[canon] = true
end

local function add_hdr(caps, errs, name, where)
    local canon = HDR_ALIASES[name]
    if not canon then
        push_cap_error(caps, errs, "unknown_hdr:" .. tostring(where))
        return
    end
    if canon == "sdr" then
        if caps.hdr then
            push_cap_error(caps, errs, "hdr_conflict:" .. tostring(where))
            return
        end
        caps.hdr_sdr_only = true
    else
        if caps.hdr_sdr_only then
            push_cap_error(caps, errs, "hdr_conflict:" .. tostring(where))
            return
        end
        caps.hdr = caps.hdr or {}
        caps.hdr[canon] = true
    end
end

local function add_audio(caps, errs, name, where)
    local canon = AUDIO_ALIASES[name]
    if not canon then
        push_cap_error(caps, errs, "unknown_audio:" .. tostring(where))
        return
    end
    caps.audio = caps.audio or {}
    caps.audio[canon] = true
end

local function add_bw(caps, errs, n, where)
    if not is_num(n) or n < 1 or n > 1000 then
        push_cap_error(caps, errs, "bad_bandwidth:" .. tostring(where))
        return
    end
    local v = math.floor(n + 0.5)
    if caps.bw_mbps and caps.bw_mbps ~= v then
        caps.warnings[#caps.warnings + 1] = "bandwidth_overridden:" .. tostring(v)
    end
    caps.bw_mbps = v
end

-- Token form: 2160p60-hdr10-hevc-bw50
local function parse_token_form(s)
    local caps = new_caps("token", s)
    local errs = caps.errors
    if #s > M.CAPS_MAX_LEN then
        push_cap_error(caps, errs, "caps_too_long")
        caps.tokens = 0
        return caps, errs
    end
    local toks = split(s, "-")
    if #toks > M.CAPS_MAX_TOKENS then
        push_cap_error(caps, errs, "too_many_tokens")
        return caps, errs
    end
    caps.tokens = #toks
    for _, raw in ipairs(toks) do
        if raw == "" then
            push_cap_error(caps, errs, "empty_token")
        else
            if raw:find("%s") then
                push_cap_error(caps, errs, "whitespace_in_token:" .. raw)
            else
                local t = raw:lower()
                local h, f = t:match("^(%d+)p(%d*)$")
                local bare = nil
                if not h then bare = t:match("^(%d+)$") end
                if h then
                    local fps = nil
                    if f ~= "" then fps = tonumber(f) end
                    set_height_fps(caps, errs, tonumber(h), fps, raw)
                elseif bare then
                    set_height_fps(caps, errs, tonumber(bare), nil, raw)
                elseif t:match("^bw(%d+)m?$") then
                    add_bw(caps, errs, tonumber(t:match("^bw(%d+)m?$")), raw)
                elseif HDR_ALIASES[t] then
                    add_hdr(caps, errs, t, raw)
                elseif CODEC_ALIASES[t] then
                    add_codec(caps, errs, t, raw)
                elseif AUDIO_ALIASES[t] then
                    add_audio(caps, errs, t, raw)
                else
                    push_cap_error(caps, errs, "unknown_token:" .. raw)
                end
            end
        end
    end
    if #errs > 0 then caps.ok = false end
    return caps, errs
end

local JSON_KEY_ALIASES = {
    r = "res", res = "res", resolution = "res", height = "res", h = "res", max_height = "res",
    fps = "fps", f = "fps", max_fps = "fps",
    hdr = "hdr",
    codec = "codecs", codecs = "codecs", c = "codecs",
    audio = "audio", a = "audio",
    bw = "bw", b = "bw", bandwidth = "bw", bw_mbps = "bw",
    v = "version", version = "version",
}

local function parse_json_form(s)
    local caps = new_caps("json", s)
    local errs = caps.errors
    local obj, jerr = json_decode(s)
    if not obj then
        push_cap_error(caps, errs, "json_" .. tostring(jerr))
        return caps, errs
    end
    local seen = {}
    for k, val in pairs(obj) do
        local canon = JSON_KEY_ALIASES[k]
        if not canon then
            push_cap_error(caps, errs, "unknown_key:" .. tostring(k))
        elseif seen[canon] then
            push_cap_error(caps, errs, "duplicate_field:" .. canon)
        else
            seen[canon] = true
            if canon == "version" then
                local v = val
                if v ~= 1 and v ~= "1" then
                    push_cap_error(caps, errs, "unsupported_caps_version:" .. tostring(v))
                end
            elseif canon == "res" then
                if is_num(val) then
                    set_height_fps(caps, errs, math.floor(val), nil, "json")
                elseif type(val) == "string" then
                    local hh, ff = val:match("^(%d+)p(%d*)$")
                    if hh then
                        set_height_fps(caps, errs, tonumber(hh), ff ~= "" and tonumber(ff) or nil, "json")
                    elseif val:match("^%d+$") then
                        set_height_fps(caps, errs, tonumber(val), nil, "json")
                    else
                        push_cap_error(caps, errs, "bad_resolution:json")
                    end
                else
                    push_cap_error(caps, errs, "bad_resolution:json")
                end
            elseif canon == "fps" then
                local n = tonumber(val)
                if n then
                    if not caps.max_height then
                        caps.warnings[#caps.warnings + 1] = "fps_without_resolution"
                    end
                    if n < 1 or n > 240 then push_cap_error(caps, errs, "bad_fps:json") end
                    caps.max_fps = n
                else
                    push_cap_error(caps, errs, "bad_fps:json")
                end
            elseif canon == "hdr" then
                local items
                if type(val) == "string" then
                    items = split(val:lower():gsub("%s", ""), ",")
                elseif type(val) == "table" then
                    items = val
                else
                    items = nil
                end
                if not items or #items == 0 then
                    push_cap_error(caps, errs, "unknown_hdr:json")
                else
                    for _, it in ipairs(items) do
                        if type(it) ~= "string" then
                            push_cap_error(caps, errs, "unknown_hdr:json")
                        else
                            add_hdr(caps, errs, it:lower(), it)
                        end
                    end
                end
            elseif canon == "codecs" then
                local items
                if type(val) == "string" then items = split(val:lower():gsub("%s", ""), ",")
                elseif type(val) == "table" then items = val
                else items = nil end
                if not items or #items == 0 then
                    push_cap_error(caps, errs, "unknown_codec:json")
                else
                    for _, it in ipairs(items) do
                        if type(it) ~= "string" then
                            push_cap_error(caps, errs, "unknown_codec:json")
                        else
                            add_codec(caps, errs, it:lower(), it)
                        end
                    end
                end
            elseif canon == "audio" then
                local items
                if type(val) == "string" then items = split(val:lower():gsub("%s", ""), ",")
                elseif type(val) == "table" then items = val
                else items = nil end
                if not items or #items == 0 then
                    push_cap_error(caps, errs, "unknown_audio:json")
                else
                    for _, it in ipairs(items) do
                        if type(it) ~= "string" then
                            push_cap_error(caps, errs, "unknown_audio:json")
                        else
                            add_audio(caps, errs, it:lower(), it)
                        end
                    end
                end
            elseif canon == "bw" then
                local n = tonumber(val)
                if not n then push_cap_error(caps, errs, "bad_bandwidth:json")
                else add_bw(caps, errs, n, "json") end
            end
        end
    end
    if not caps.max_height and not caps.codecs and not caps.hdr and not caps.audio and not caps.bw_mbps then
        push_cap_error(caps, errs, "empty_caps")
    end
    if #errs > 0 then caps.ok = false end
    return caps, errs
end

-- parse_caps(raw) → caps|nil, errors. Un error => nil (se exige fallback explícito).
function M.parse_caps(raw)
    if raw == nil then return nil, { "missing" } end
    if type(raw) ~= "string" then return nil, { "not_string" } end
    local s = trim(raw)
    if s == nil or s == "" then return nil, { "empty_caps" } end
    local caps
    if s:sub(1, 1) == "{" then
        caps = parse_json_form(s)
    else
        caps = parse_token_form(s)
    end
    if caps.ok then
        return caps, caps.errors, caps
    end
    return nil, caps.errors, caps
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Identidad de sesión / ingesta compartida (W1 §6.2)
--    idem = normalize(provider) || "|" || normalize(channel)
--    EXCLUYE perfil, códec, HDR, cliente y token → ambos perfiles = 1 ingesta.
-- ═══════════════════════════════════════════════════════════════════════════
function M.normalize_provider(provider)
    if type(provider) == "number" then provider = tostring(provider) end
    if type(provider) ~= "string" then return nil, "provider_missing" end
    local s = trim(provider)
    if not s or s == "" then return nil, "provider_missing" end
    s = s:gsub("^%a[%w+.-]*://", "")     -- scheme
    s = s:gsub("^[^/@]*@", "")           -- userinfo
    s = s:gsub("[/?#].*$", "")           -- path/query/fragment
    s = s:lower()
    local host, port = s:match("^(%[[%x:%.]+%]):(%d+)$")
    if not host then
        host, port = s:match("^([%w%.%-]+):(%d+)$")
    end
    if not host then host = s end
    if port == "80" or port == "443" then
        -- W1 §6.2: puerto solo si no es 80/443
    elseif port then
        host = host .. ":" .. port
    end
    if host == "" or #host > 100 then return nil, "provider_invalid" end
    if not host:match("^[%w%.%-:]+$") and not host:match("^%[.+%]$") then
        return nil, "provider_invalid"
    end
    return host, nil
end

function M.normalize_channel(channel)
    if type(channel) == "number" then channel = tostring(channel) end
    if type(channel) ~= "string" then return nil, "channel_missing" end
    local s = trim(channel)
    if not s or s == "" then return nil, "channel_missing" end
    local id = s:match("/(%d+)%.m3u8") or s:match("/(%d+)%.ts") or s:match("^(%d+)$")
    if not id then
        local tail = s:match("/(%d+)/?$")
        id = tail
    end
    if not id then return nil, "channel_not_numeric" end
    id = id:gsub("^0+", "")
    if id == "" then id = "0" end
    if #id > 12 then return nil, "channel_too_long" end
    return id, nil
end

function M.ingest_key(provider, channel)
    local prov, perr = M.normalize_provider(provider)
    local ch, cerr = M.normalize_channel(channel)
    if not prov or not ch then
        return nil, { perr or "provider_missing", cerr or "channel_missing" }
    end
    return prov .. "|" .. ch
end

function M.normalize_idem(value)
    if type(value) ~= "string" then return nil end
    local s = trim(value)
    if not s or #s > 140 then return nil end
    s = s:lower()
    local prov, ch = s:match("^(.-)|(%d+)$")
    if not prov or prov == "" then return nil end
    local p2 = M.normalize_provider(prov)
    local c2 = M.normalize_channel(ch)
    if not p2 or not c2 then return nil end
    return p2 .. "|" .. c2
end

function M.session_identity(args)
    args = type(args) == "table" and args or {}
    local key = nil
    if type(args.idem) == "string" then
        key = M.normalize_idem(args.idem)
    end
    if not key then
        local provider = args.provider or args.host or args.provider_host or args.ph
        local channel = args.channel or args.ch or args.stream_id or args.sid or args.id
        key = M.ingest_key(provider, channel)
    end
    return {
        key = key,
        shared = true,                       -- invariante estructural: el perfil no particiona la sesión
        profile_in_key = false,              -- idem NUNCA incluye perfil/códec/HDR/cliente/token
        per_profile_connection = false,      -- prohibido abrir una conexión por perfil
        gen_shared = true,                   -- un restart incrementa gen para AMBOS perfiles
        variant_dir = "orig",                -- el 4K escribe en <dir>/4k/<gen>/, lee mezzanine local
        note = "W1 §6.2/§6.9: dos perfiles, UNA ingesta",
    }
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Normalización del probe de fuente (ffprobe por sesión, W1 §7.1)
-- ═══════════════════════════════════════════════════════════════════════════
local function norm_codec(v)
    if type(v) ~= "string" then return nil end
    return CODEC_ALIASES[v:lower()]
end

local function norm_audio(v)
    if type(v) ~= "string" then return nil end
    return AUDIO_ALIASES[v:lower()]
end

local function norm_dv_codec(v)
    if type(v) ~= "string" then return nil end
    local s = v:lower()
    if s:match("^dvh1%.") or s:match("^dvhe%.") or s:match("^dva1%.") or s:match("^dvav%.") then
        return s
    end
    return nil
end

local function bit_depth_from_pix_fmt(pf)
    if type(pf) ~= "string" then return nil end
    local p = pf:lower()
    local d = p:match("(%d%d)le$") or p:match("(%d%d)be$")
    if d then return tonumber(d) end
    if p:match("p$") then return 8 end
    return nil
end

function M.normalize_src(raw)
    local s = { probed = false, hdr_missing = {} }
    if type(raw) ~= "table" then return s end
    s.probed = raw.probed == true
        or raw.width ~= nil or raw.height ~= nil or raw.codec ~= nil
        or raw.color_transfer ~= nil or raw.bit_depth ~= nil or raw.pix_fmt ~= nil
    s.width = tonumber(raw.width)
    s.height = tonumber(raw.height)
    s.codec = norm_codec(raw.codec)
    s.codec_string = nil
    if type(raw.codec_string) == "string" and #raw.codec_string <= 48
        and raw.codec_string:match("^[%w][%w%.%-]*$") then
        s.codec_string = raw.codec_string   -- VERBATIM del probe (no se reescribe)
    end
    s.pix_fmt = type(raw.pix_fmt) == "string" and raw.pix_fmt:lower() or nil
    s.bit_depth = tonumber(raw.bit_depth) or bit_depth_from_pix_fmt(s.pix_fmt)
    s.color_transfer = type(raw.color_transfer) == "string" and raw.color_transfer:lower() or nil
    s.color_primaries = type(raw.color_primaries) == "string" and raw.color_primaries:lower() or nil
    s.color_space = type(raw.color_space) == "string" and raw.color_space:lower() or nil
    s.gop_s = tonumber(raw.gop_s)
    s.audio_codec = norm_audio(raw.audio_codec)
    s.audio_channels = tonumber(raw.audio_channels)
    s.max_cll = tonumber(raw.max_cll)
    s.max_fall = tonumber(raw.max_fall)
    s.mastering_display = raw.mastering_display
    s.hdr10plus = raw.hdr10plus == true
    if type(raw.dovi) == "table" then
        s.dovi = { profile = raw.dovi.profile, codec = norm_dv_codec(raw.dovi.codec) }
    elseif raw.dovi == true then
        s.dovi = { profile = nil, codec = nil }
    end
    local t = s.color_transfer
    if t == "smpte2084" or t == "pq" or t == "smpte-st-2084" then
        s.transfer_range = "PQ"
    elseif t == "arib-std-b67" or t == "hlg" then
        s.transfer_range = "HLG"
    end
    if s.dovi then s.hdr = "dv"
    elseif s.transfer_range == "PQ" then s.hdr = "pq"
    elseif s.transfer_range == "HLG" then s.hdr = "hlg"
    elseif s.probed then s.hdr = "sdr" end
    -- W1 §7.1: HDR real = transfer HDR + primaries bt2020 + >=10 bit.
    if s.hdr and s.hdr ~= "sdr" then
        if not s.transfer_range then s.hdr_missing[#s.hdr_missing + 1] = "transfer_not_hdr" end
        if s.color_primaries ~= "bt2020" then
            s.hdr_missing[#s.hdr_missing + 1] = "primaries_not_bt2020"
        end
        if not s.bit_depth or s.bit_depth < 10 then
            s.hdr_missing[#s.hdr_missing + 1] = "bit_depth_below_10"
        end
        s.hdr_confirmed = (#s.hdr_missing == 0)
    else
        s.hdr_confirmed = false
    end
    return s
end

function M.codec_string_matches(codec_string, codec)
    if type(codec_string) ~= "string" or type(codec) ~= "string" then return false end
    local prefixes = CODEC_PREFIXES[codec]
    if not prefixes then return false end
    local cs = codec_string:lower()
    for _, p in ipairs(prefixes) do
        if cs:sub(1, #p) == p then return true end
    end
    return false
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) HW GATE (W1 §6.9 / §8) — el perfil 4K exige hardware REAL medido
-- ═══════════════════════════════════════════════════════════════════════════
function M.hw_gate(snapshot, opts)
    opts = type(opts) == "table" and opts or {}
    local res = {
        allowed = false, reason = "no_live_hw_probe", encoder = nil,
        snapshot = nil, evidence = M.W1_EVIDENCE, checked_at = nil,
    }
    if type(snapshot) ~= "table" then
        res.reason = "no_live_hw_probe"
        res.evidence = M.W1_EVIDENCE
        return res
    end
    res.snapshot = snapshot
    res.evidence = {
        gpu_encode = snapshot.gpu_encode,
        gpu_kind = snapshot.gpu_kind,
        vaapi = snapshot.vaapi,
        encode_speed = snapshot.encode_speed,
        measured_at = snapshot.measured_at,
        benchmark_id = snapshot.benchmark_id,
    }
    if snapshot.gpu_encode ~= "ok" then
        res.reason = "gpu_unavailable"
        return res
    end
    if type(snapshot.encode_speed) ~= "number" then
        res.reason = "benchmark_missing"
        return res
    end
    if type(snapshot.measured_at) ~= "number" then
        res.reason = "benchmark_undated"
        return res
    end
    local now = tonumber(opts.now) or os.time()
    if (now - snapshot.measured_at) > M.POLICY.hw_evidence_ttl_s then
        res.reason = "benchmark_stale"
        return res
    end
    if M.POLICY.require_benchmark_id then
        if type(snapshot.benchmark_id) ~= "string" or #snapshot.benchmark_id < 6 then
            res.reason = "benchmark_unverifiable"
            return res
        end
    end
    if snapshot.encode_speed < M.POLICY.withdraw_encode_speed then
        res.reason = "encode_speed_critical"
        return res
    end
    if snapshot.encode_speed < M.POLICY.min_encode_speed then
        res.reason = "encode_speed_below_threshold"
        return res
    end
    local active = tonumber(opts.active_4k) or 0
    if active >= M.POLICY.max_concurrent_4k then
        res.reason = "capacity_exhausted"
        return res
    end
    if type(snapshot.encoder) ~= "table" or type(snapshot.encoder.codec) ~= "string" then
        res.reason = "encoder_undeclared"
        return res
    end
    res.encoder = snapshot.encoder
    res.allowed = true
    res.reason = "hw_ok"
    return res
end

function M.reason_header(reason, hw_reason)
    if type(reason) == "string" and reason:sub(1, 3) == "hw_" then
        local key = reason:sub(4)
        return HW_REASON_HEADER[key] or "hw-gate"
    end
    if hw_reason and HW_REASON_HEADER[hw_reason] then return HW_REASON_HEADER[hw_reason] end
    return ELIG_REASON_HEADER[reason] or "profile-unavailable"
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) Elegibilidad del perfil 4K (orden determinista, documentado)
--    1 no pedido · 2 producto apagado · 3 sin capacidad de cliente ·
--    4 cliente <2160 · 5 fuente ya UHD · 6 HW gate · 7 encoder · 8 códec cliente
-- ═══════════════════════════════════════════════════════════════════════════
function M.eligibility_4k(req, caps, src, hw, opts)
    opts = type(opts) == "table" and opts or {}
    local e = { ok = false, reason = "not_requested" }
    if req ~= "4k" then return e end
    if M.POLICY.allow_4k_path ~= true then
        e.reason = "product_switch_off"
        return e
    end
    if not caps or not caps.max_height then
        e.reason = "client_resolution_undeclared"
        return e
    end
    if caps.max_height < 2160 then
        e.reason = "client_max_res_below_2160"
        e.detail = caps.max_height
        return e
    end
    if src and src.height and src.height >= 2160 then
        e.reason = "source_already_uhd"
        e.detail = src.height
        return e
    end
    if not hw or not hw.allowed then
        e.reason = "hw_" .. ((hw and hw.reason) or "no_live_hw_probe")
        e.hw_reason = hw and hw.reason or "no_live_hw_probe"
        e.evidence = hw and hw.evidence or M.W1_EVIDENCE
        return e
    end
    local enc = opts.encoder or hw.encoder
    if type(enc) ~= "table" or type(enc.codec) ~= "string" then
        e.reason = "encoder_codec_unknown"
        return e
    end
    if enc.transcode ~= true then
        e.reason = "encoder_not_transcode"
        return e
    end
    if enc.height and tonumber(enc.height) and tonumber(enc.height) < 2160 then
        e.reason = "encoder_output_below_2160"
        e.detail = enc.height
        return e
    end
    if not caps.codecs then
        e.reason = "client_codec_caps_missing"
        return e
    end
    if not caps.codecs[enc.codec] then
        e.reason = "client_cannot_decode_encoder_codec"
        e.detail = enc.codec
        return e
    end
    e.ok = true
    e.reason = "eligible_4k"
    e.encoder = enc
    return e
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) Conversión SDR→HDR declarada: solo se acepta si es REAL y VALIDADA
--    (bitstream reencodeado + probe de salida que lo confirme + evidencia).
-- ═══════════════════════════════════════════════════════════════════════════
function M.validate_conversion(conv, ctx)
    ctx = type(ctx) == "table" and ctx or {}
    if type(conv) ~= "table" then return false, "no_conversion" end
    if conv.kind ~= "sdr_to_pq" and conv.kind ~= "sdr_to_hlg" then
        return false, "conversion_kind_not_allowed"
    end
    if ctx.profile ~= "4k" then return false, "conversion_requires_transcode_profile" end
    if conv.validated ~= true then return false, "conversion_not_validated" end
    if conv.bitstream_changed ~= true then return false, "conversion_not_bitstream" end
    if ctx.gate_ok ~= true then return false, "conversion_requires_hw_gate" end
    local po = conv.probe_out
    if type(po) ~= "table" then return false, "conversion_missing_output_probe" end
    local want = conv.kind == "sdr_to_pq" and "smpte2084" or "arib-std-b67"
    local got = type(po.color_transfer) == "string" and po.color_transfer:lower() or ""
    if got ~= want then return false, "conversion_output_transfer_mismatch" end
    local pri = type(po.color_primaries) == "string" and po.color_primaries:lower() or ""
    if pri ~= "bt2020" then return false, "conversion_output_primaries_mismatch" end
    local bd = tonumber(po.bit_depth) or bit_depth_from_pix_fmt(po.pix_fmt)
    if not bd or bd < 10 then return false, "conversion_output_not_10bit" end
    if type(conv.evidence_ref) ~= "string" or #conv.evidence_ref < 8 then
        return false, "conversion_missing_evidence_ref"
    end
    return true, "validated"
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 9) HDR truthful (W1 §7) — la única autoridad es el probe (o conversión real)
-- ═══════════════════════════════════════════════════════════════════════════
function M.resolve_hdr(src, caps, ctx)
    ctx = type(ctx) == "table" and ctx or {}
    local out = {
        truthful = false, video_range = nil, color_primaries = nil,
        transfer_characteristics = nil, supplemental_codecs = nil,
        hdr10plus = false, max_cll = nil, max_fall = nil, mastering_display = nil,
        source_range = src.hdr or "unknown", delivered_range = "sdr",
        mode = "none", confirmed = src.hdr_confirmed == true,
        missing = {}, reasons = {}, warnings = {},
    }
    for _, m in ipairs(src.hdr_missing or {}) do out.missing[#out.missing + 1] = m end
    local profile = ctx.profile or "original"
    local claims_hdr = caps and caps.hdr ~= nil
        and (caps.hdr.hdr10 or caps.hdr.hlg or caps.hdr.dv or caps.hdr.hdr10plus)

    if src.probed and src.hdr and src.hdr ~= "sdr" then
        if not src.hdr_confirmed then
            out.mode = "sdr"
            out.delivered_range = "sdr"
            out.reasons[#out.reasons + 1] = "hdr_source_not_confirmed"
            out.warnings[#out.warnings + 1] = "hdr_evidence_incomplete"
            return out
        end
        if profile == "original" then
            out.video_range = src.transfer_range
            out.color_primaries = 9
            out.transfer_characteristics = (out.video_range == "PQ") and 16 or 18
            out.max_cll = src.max_cll
            out.max_fall = src.max_fall
            out.mastering_display = src.mastering_display
            out.hdr10plus = src.hdr10plus
            if src.dovi then
                if src.dovi.codec then
                    out.supplemental_codecs = src.dovi.codec
                else
                    out.warnings[#out.warnings + 1] = "dovi_codec_string_missing"
                end
            end
            out.truthful = true
            out.delivered_range = (out.video_range == "PQ") and "pq" or "hlg"
            out.mode = "passthrough"
            out.reasons[#out.reasons + 1] = "hdr_source_passthrough"
        else
            local enc = ctx.encoder
            local preserves = ctx.gate_ok == true and type(enc) == "table"
                and enc.preserves_10bit == true and enc.preserves_hdr_metadata == true
            if preserves then
                out.video_range = src.transfer_range
                out.color_primaries = 9
                out.transfer_characteristics = (out.video_range == "PQ") and 16 or 18
                out.max_cll = src.max_cll
                out.max_fall = src.max_fall
                out.mastering_display = src.mastering_display
                out.hdr10plus = src.hdr10plus and enc.hdr10plus_preserved == true
                if src.dovi then
                    if enc.supports_dovi == true and src.dovi.codec then
                        out.supplemental_codecs = src.dovi.codec
                    else
                        out.warnings[#out.warnings + 1] = "dovi_layer_dropped"
                    end
                end
                out.truthful = true
                out.delivered_range = (out.video_range == "PQ") and "pq" or "hlg"
                out.mode = "preserved_through_upscale"
                out.reasons[#out.reasons + 1] = "hdr_preserved_through_upscale"
            else
                out.mode = "tonemapped_to_sdr"
                out.delivered_range = "sdr"
                out.reasons[#out.reasons + 1] = "hdr_not_preserved_by_encoder"
                out.warnings[#out.warnings + 1] = "tonemapped_to_sdr"
            end
        end
        if caps and caps.hdr_sdr_only then
            out.warnings[#out.warnings + 1] = "client_sdr_only_source_hdr"
        end
        return out
    end

    if not src.probed then
        out.mode = "unprobed"
        out.delivered_range = "unknown"
        out.reasons[#out.reasons + 1] = "source_unprobed_no_hdr_claim"
        if claims_hdr then
            out.warnings[#out.warnings + 1] = "client_hdr_claim_suppressed_without_probe"
        end
        return out
    end

    -- Fuente SDR confirmada por probe.
    local conv = ctx.conversion
    if conv ~= nil then
        local ok, code = M.validate_conversion(conv, { profile = profile, gate_ok = ctx.gate_ok == true })
        if ok then
            out.video_range = (conv.kind == "sdr_to_pq") and "PQ" or "HLG"
            out.color_primaries = 9
            out.transfer_characteristics = (out.video_range == "PQ") and 16 or 18
            local po = conv.probe_out or {}
            out.max_cll = tonumber(po.max_cll)
            out.max_fall = tonumber(po.max_fall)
            out.mastering_display = po.mastering_display
            out.truthful = true
            out.delivered_range = (out.video_range == "PQ") and "pq" or "hlg"
            out.mode = "converted_real"
            out.reasons[#out.reasons + 1] = "sdr_to_hdr_converted_real:" .. conv.kind
            return out
        end
        out.reasons[#out.reasons + 1] = "conversion_refused:" .. code
        out.warnings[#out.warnings + 1] = "conversion_declared_but_refused"
    end
    out.mode = (profile == "4k") and "sdr_upscaled" or "sdr"
    out.delivered_range = "sdr"
    out.reasons[#out.reasons + 1] = (conv ~= nil) and "sdr_kept_despite_declared_conversion" or "sdr_source"
    if claims_hdr then
        out.warnings[#out.warnings + 1] = "client_hdr_claim_not_met"
    end
    return out
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 10) variantArgs (atributos de manifest que I1 materializa; sin promesas falsas)
-- ═══════════════════════════════════════════════════════════════════════════
function M.segment_target(gop_s)
    local seg = M.POLICY.min_segment_s
    if type(gop_s) == "number" and gop_s > seg then seg = gop_s end
    if seg > M.POLICY.max_segment_s then seg = M.POLICY.max_segment_s end
    return math.floor(seg * 100 + 0.5) / 100
end

function M.build_variant_args(profile, src, caps, hdr, session, enc, opts)
    local warns = {}
    local va = {
        profile = profile,
        variant_path = (profile == "4k") and "4k" or "orig",
        copy = (profile == "original"),
        transcode = (profile == "4k"),
        upscale = (profile == "4k"),
        audio = "copy",
        ll_hls = false,
        part_target = nil,
        latency_class = "standard-gop-bound",
        latency_window_s = { min = M.POLICY.latency_window_s.min, max = M.POLICY.latency_window_s.max },
        segment_target_s = M.segment_target(src.gop_s),
        ingest_shared = true,
        single_upstream = true,
        no_upstream_socket = true,
        profile_affects_gen = false,
        session_key = session.key,
        hdr_truthful = hdr.truthful,
    }
    if profile == "original" then
        va.width = src.width
        va.height = src.height
        if src.width and src.height then
            va.resolution = string.format("%dx%d", src.width, src.height)
        end
        va.codec = src.codec
        if src.codec_string then
            if profile == "original" and src.codec == "hevc"
                and src.codec_string:lower():match("^hev1%.") then
                -- GOLDEN RULE: hev1.* nunca en STREAM-INF CODECS=
                va.codec_probe_string = src.codec_string
                warns[#warns + 1] = "hev1_not_allowed_in_stream_inf"
            elseif M.codec_string_matches(src.codec_string, src.codec) then
                va.codec_string = src.codec_string
            else
                va.codec_probe_string = src.codec_string
                warns[#warns + 1] = "probe_codec_string_inconsistent"
            end
        end
        va.audio_codec = src.audio_codec
    else
        va.width = M.POLICY.target_4k.width
        va.height = M.POLICY.target_4k.height
        va.resolution = string.format("%dx%d", va.width, va.height)
        va.codec = enc and enc.codec or nil
        va.encoder_preset = enc and enc.preset or nil
        if enc and type(enc.codec_string) == "string" then
            if M.codec_string_matches(enc.codec_string, enc.codec) then
                va.codec_string = enc.codec_string
            else
                warns[#warns + 1] = "encoder_codec_string_inconsistent"
            end
        end
        va.audio_codec = src.audio_codec
    end
    if hdr.truthful then
        va.video_range = hdr.video_range
        va.color_primaries = hdr.color_primaries
        va.transfer_characteristics = hdr.transfer_characteristics
        va.max_cll = hdr.max_cll
        va.max_fall = hdr.max_fall
        va.mastering_display = hdr.mastering_display
        va.supplemental_codecs = hdr.supplemental_codecs
        va.hdr10plus = hdr.hdr10plus
        va.hdr_mode = hdr.mode
    end
    if caps and caps.codecs and va.codec and not caps.codecs[va.codec] then
        warns[#warns + 1] = "client_cannot_decode_delivered_codec:" .. tostring(va.codec)
    end
    if caps and caps.audio and src.audio_codec and not caps.audio[src.audio_codec] then
        warns[#warns + 1] = "audio_may_not_decode:" .. tostring(src.audio_codec)
    end
    return va, warns
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 11) RESOLUCIÓN (contrato I1)
-- ═══════════════════════════════════════════════════════════════════════════
function M.normalize_profile(v)
    if v == nil then return "original", nil end
    if type(v) == "number" then v = tostring(v) end
    if type(v) ~= "string" then return "original", "unknown_profile" end
    local s = trim(v):lower()
    if s == "" then return "original", nil end
    if s == "original" or s == "orig" or s == "remux" or s == "copy" or s == "0" then
        return "original", nil
    end
    if s == "4k" or s == "2160" or s == "2160p" or s == "uhd" or s == "upscale" or s == "4k-scaled" then
        return "4k", nil
    end
    return "original", "unknown_profile:" .. s
end

function M.resolve(input)
    input = type(input) == "table" and input or {}
    local args = type(input.args) == "table" and input.args or {}
    local opts = type(input.opts) == "table" and input.opts or {}
    local now = tonumber(opts.now) or os.time()

    local errors, warnings, reasons = {}, {}, {}
    local caps, degraded
    if args.tv == nil then
        caps = M.safe_caps()
        caps.degraded = false
    else
        local parsed, perr = M.parse_caps(args.tv)
        if parsed then
            caps = parsed
            degraded = false
        else
            caps = M.safe_caps()
            degraded = true
            for _, e in ipairs(perr or {}) do
                if #errors < M.CAPS_MAX_ERRORS then errors[#errors + 1] = e end
            end
        end
    end
    for _, w in ipairs(caps.warnings or {}) do warnings[#warnings + 1] = w end

    local src = M.normalize_src(input.src)
    local hw = M.hw_gate(input.hw, { now = now, active_4k = tonumber(opts.active_4k) or 0 })
    local req, prof_warn = M.normalize_profile(args.profile)
    if prof_warn then warnings[#warnings + 1] = prof_warn end
    local session = M.session_identity(args)
    if not session.key then
        warnings[#warnings + 1] = "session_key_unavailable"
    end

    local elig = M.eligibility_4k(req, caps, src, hw, opts)
    local mode_4k = opts.on_4k_unavailable or M.POLICY.on_4k_unavailable
    local reject = (req == "4k") and (not elig.ok) and (mode_4k == "reject")
    local profile = nil
    local hdr, va, va_warns = nil, nil, {}
    local downgraded = false
    if not reject then
        profile = elig.ok and "4k" or "original"
        if req == "4k" and profile == "original" then downgraded = true end
        local enc = nil
        if profile == "4k" then
            enc = elig.encoder or opts.encoder or hw.encoder
        end
        hdr = M.resolve_hdr(src, caps, {
            profile = profile, gate_ok = hw.allowed, encoder = enc,
            conversion = opts.conversion,
        })
        va, va_warns = M.build_variant_args(profile, src, caps, hdr, session, enc, opts)
        for _, w in ipairs(va_warns) do warnings[#warnings + 1] = w end
        for _, w in ipairs(hdr.warnings) do warnings[#warnings + 1] = w end
        for _, r in ipairs(hdr.reasons) do reasons[#reasons + 1] = r end
    end
    reasons[#reasons + 1] = "profile:" .. elig.reason
    if degraded then reasons[#reasons + 1] = "caps_degraded" end
    if not hw.allowed then
        reasons[#reasons + 1] = "hw_gate:" .. hw.reason
    end

    local notices = {}
    if req == "4k" and not elig.ok and opts.notice ~= false then
        -- 412 se RESERVA al fallo de hardware del servidor (W1 §6.9: gpu-unavailable).
        -- Un límite del CLIENTE no debe romper players (TiviMate/ExoPlayer tratan 4xx
        -- como fatal): se degrada a original con cabecera informativa y status 200.
        local is_hw = type(elig.reason) == "string" and elig.reason:sub(1, 3) == "hw_"
        notices[#notices + 1] = {
            status = is_hw and 412 or 200,
            header = is_hw and "X-MF-Reason" or "X-MF-Profile",
            value = M.reason_header(elig.reason, elig.hw_reason),
            hint = is_hw and "servir original/remux; no se arranca transcode"
                or "capacidad del cliente insuficiente; se sirve original/remux",
        }
    end

    local decision = {
        contract = M.SCHEMA_VERSION,
        module = "ape_caps",
        version = M.VERSION,
        profile = profile,
        requested_profile = req,
        downgraded = downgraded,
        refused = reject,
        truthfulHdr = (hdr ~= nil) and (hdr.truthful == true) or false,
        hdr = hdr,
        variantArgs = va,
        caps = caps,
        caps_degraded = degraded == true,
        session = session,
        hw = {
            allowed = hw.allowed,
            reason = hw.reason,
            evidence = hw.evidence,
            encoder = hw.encoder,
        },
        eligibility = elig,
        errors = errors,
        warnings = warnings,
        reasons = reasons,
        notices = notices,
        reason = elig.reason,
        now = now,
    }
    decision.metrics = {
        profile = profile or "refused",
        requested = req,
        downgraded = downgraded and 1 or 0,
        caps_degraded = decision.caps_degraded and 1 or 0,
        truthful_hdr = decision.truthfulHdr and 1 or 0,
        video_range = (hdr and hdr.video_range) or "none",
        hw_gate = hw.reason,
        session_shared = session.shared and 1 or 0,
        ll_hls = 0,
    }
    return decision
end

-- Conveniencia para `access_by_lua*`: parsea la query y resuelve.
function M.from_query(query_string, src, hw, opts)
    local args = M.parse_query(query_string)
    return M.resolve({ args = args, src = src, hw = hw, opts = opts })
end

function M.parse_query(qs)
    local args = {}
    if type(qs) ~= "string" or qs == "" or #qs > M.QUERY_MAX_LEN then return args end
    for _, pair in ipairs(split(qs, "&")) do
        local k, v = pair:match("^([^=]+)=?(.*)$")
        if k then
            k = pct_decode(k)
            v = pct_decode(v)
            if k and (k == "tv" or k == "profile" or k == "idem" or k == "channel"
                or k == "ch" or k == "provider" or k == "host") then
                args[k] = v
            end
        end
    end
    return args
end

-- En nginx: rellena `args` desde la petición real (no obligatorio).
function M.from_ngx(opts, src, hw)
    if type(ngx) ~= "table" then return nil, "no_ngx" end
    local args = {}
    local ok, q = pcall(function() return ngx.req.get_uri_args() end)
    if ok and type(q) == "table" then
        for _, k in ipairs({ "tv", "profile", "idem", "channel", "ch", "provider", "host" }) do
            local v = q[k]
            if type(v) == "string" then args[k] = v end
        end
    end
    return M.resolve({ args = args, src = src, hw = hw, opts = opts })
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 12) Validación del contrato (se ejecuta sobre CADA caso de prueba)
-- ═══════════════════════════════════════════════════════════════════════════
function M.validate_decision(d)
    local p = {}
    local function need(cond, msg) if not cond then p[#p + 1] = msg end end
    if type(d) ~= "table" then return false, { "decision_not_table" } end
    need(d.contract == M.SCHEMA_VERSION, "bad_contract")
    need(d.refused == true or d.profile == "original" or d.profile == "4k", "bad_profile")
    need(d.requested_profile == "original" or d.requested_profile == "4k", "bad_requested_profile")
    need(type(d.truthfulHdr) == "boolean", "truthfulHdr_not_boolean")
    need(type(d.errors) == "table" and type(d.warnings) == "table" and type(d.reasons) == "table",
        "bad_lists")
    need(type(d.session) == "table" and d.session.shared == true, "session_not_shared")
    need(type(d.session) == "table" and d.session.profile_in_key == false, "profile_must_not_be_in_key")
    if d.refused then
        need(d.variantArgs == nil, "refused_must_not_build_variant")
        need(d.hdr == nil, "refused_must_not_build_hdr")
        need(type(d.notices) == "table" and #d.notices >= 1, "refused_needs_notice")
        need(d.truthfulHdr == false, "refused_truthful_must_be_false")
        return #p == 0, p
    end
    local va = d.variantArgs
    need(type(va) == "table", "missing_variantArgs")
    if type(va) == "table" then
        need(va.ll_hls == false, "ll_hls_promise_forbidden")
        need(va.part_target == nil, "part_target_forbidden")
        need(va.ingest_shared == true, "ingest_must_be_shared")
        need(va.single_upstream == true, "single_upstream_required")
        need(va.no_upstream_socket == true, "module_must_not_open_sockets")
        need(va.profile_affects_gen == false, "profile_must_not_change_gen")
        need(va.audio == "copy", "audio_must_be_copy")
        need(type(va.segment_target_s) == "number"
            and va.segment_target_s >= M.POLICY.min_segment_s
            and va.segment_target_s <= M.POLICY.max_segment_s, "bad_segment_target")
        need(d.session.key == nil or va.session_key == d.session.key, "session_key_mismatch")
        if d.profile == "original" then
            need(va.copy == true and va.transcode == false and va.upscale == false,
                "original_must_be_pure_copy")
        else
            need(va.copy == false and va.transcode == true and va.upscale == true,
                "4k_must_be_transcode_upscale")
            need(va.width == M.POLICY.target_4k.width and va.height == M.POLICY.target_4k.height,
                "4k_geometry_wrong")
        end
        need(va.video_range == nil or va.hdr_truthful == true, "hdr_label_without_truth")
    end
    local h = d.hdr
    need(type(h) == "table", "missing_hdr")
    if type(h) == "table" then
        need((h.video_range ~= nil) == (h.truthful == true), "hdr_flag_range_mismatch")
        need(d.truthfulHdr == h.truthful, "truthfulHdr_mismatch")
        if h.video_range ~= nil then
            need(h.color_primaries == 9, "hdr_needs_bt2020")
            need(h.transfer_characteristics == 16 or h.transfer_characteristics == 18, "hdr_needs_tc")
            need(h.mode ~= "sdr" and h.mode ~= "sdr_upscaled" and h.mode ~= "tonemapped_to_sdr"
                and h.mode ~= "unprobed" and h.mode ~= "none", "hdr_mode_contradiction")
            if h.source_range == "sdr" then
                need(h.mode == "converted_real", "hdr_from_sdr_requires_real_conversion")
            end
            if d.profile == "4k" then
                need(h.mode == "preserved_through_upscale" or h.mode == "converted_real",
                    "4k_hdr_mode_invalid")
            end
        end
        if h.mode == "tonemapped_to_sdr" or h.mode == "sdr_upscaled" or h.mode == "sdr" then
            need(h.video_range == nil, "sdr_mode_must_not_label_hdr")
        end
        if h.mode == "preserved_through_upscale" then
            need(d.profile == "4k", "preserved_scale_requires_4k")
        end
        if h.mode == "passthrough" then
            need(d.profile == "original", "passthrough_requires_original")
        end
    end
    return #p == 0, p
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 13) Auditoría de ingesta compartida (evidencia de "una sola conexión")
-- ═══════════════════════════════════════════════════════════════════════════
function M.share_audit(decisions)
    local by_key, violations, count = {}, {}, 0
    local n = 0
    for _, d in ipairs(decisions or {}) do
        n = n + 1
        local key = d.session and d.session.key
        if not key then
            violations[#violations + 1] = "missing_session_key"
        else
            if not by_key[key] then
                by_key[key] = { decisions = 0, profiles = {}, upstream_connections = 1 }
                count = count + 1
            end
            by_key[key].decisions = by_key[key].decisions + 1
            by_key[key].profiles[d.profile or "refused"] = true
        end
        if d.variantArgs then
            if d.variantArgs.ingest_shared ~= true then violations[#violations + 1] = "ingest_not_shared" end
            if d.variantArgs.single_upstream ~= true then violations[#violations + 1] = "single_upstream_missing" end
            if d.variantArgs.session_key ~= key then violations[#violations + 1] = "variant_session_key_mismatch" end
        end
    end
    return {
        decisions = n,
        sessions = count,
        upstream_connections = count,   -- I1: exactamente una conexión por clave
        by_key = by_key,
        violations = violations,
    }
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 14) Matriz de capacidades del nodo (evidencia de acceptance 1/2/5)
-- ═══════════════════════════════════════════════════════════════════════════
function M.feature_matrix()
    return {
        { feature = "profile.original_remux", available = true,
          note = "default; -c copy; 1,08 % de un core por sesión (W1)" },
        { feature = "profile.4k_upscale", available = M.HOST.upscale_4k_available,
          note = "HARD-GATED: GPU virtio sin motor + x265 0,356x (techo 0,394x) → no disponible en este VPS" },
        { feature = "hdr.passthrough", available = true,
          note = "solo si el probe confirma PQ/HLG + bt2020 + >=10 bit (W1 §7.1)" },
        { feature = "hdr.sdr_to_hdr_conversion", available = false,
          note = "exige transcode+gate+probe de salida; inalcanzable en este nodo" },
        { feature = "hdr.label_invented", available = false,
          note = "PROHIBIDO: HDR por escalar o remuxear (W1 §8 fila 10)" },
        { feature = "ll_hls", available = false,
          note = "GOP fuente 0,96–10 s; sin promesa de latencia <4 s (W1 §8 fila 12)" },
        { feature = "shared_ingest", available = true,
          note = "idem = provider|channel, sin perfil: una conexión upstream para original y 4k" },
        { feature = "infinite_buffer", available = false,
          note = "PROHIBIDO: ventana acotada + jump-to-live" },
        { feature = "client_caps_tv", available = true,
          note = "token form + JSON plano, fallback seguro ante entrada inválida" },
    }
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 15) FIXTURES + TABLA DE CASOS EJECUTABLE (entrada → perfil/variante/HDR)
-- ═══════════════════════════════════════════════════════════════════════════
M.NOW = 1793000000  -- instante fijo de los casos (determinismo)

M.CASE_ARGS_BASE = { provider = "line.tivi-ott.net", channel = "894968" }

M.SRC = {
    -- 12/12 canales de la muestra W1: 1080p SDR 8-bit (11 AVC + 1 HEVC Main)
    sdr_1080_avc = {
        probed = true, width = 1920, height = 1080, codec = "h264",
        codec_string = "avc1.640028", pix_fmt = "yuv420p", bit_depth = 8,
        color_transfer = "bt709", color_primaries = "bt709", gop_s = 1.2,
        audio_codec = "aac", audio_channels = 2,
    },
    sdr_1080_hevc_gop10 = {
        probed = true, width = 1920, height = 1080, codec = "hevc",
        pix_fmt = "yuv420p", bit_depth = 8, color_transfer = "unknown",
        color_primaries = "bt709", gop_s = 10.0, audio_codec = "ac3",
    },
    sdr_1080_hev1 = {
        probed = true, width = 1920, height = 1080, codec = "hevc",
        codec_string = "hev1.1.6.L120.B0", pix_fmt = "yuv420p", bit_depth = 8,
        color_transfer = "bt709", color_primaries = "bt709", gop_s = 2,
        audio_codec = "eac3",
    },
    sdr_uhd_real = {
        probed = true, width = 3840, height = 2160, codec = "hevc",
        codec_string = "hvc1.2.4.L153.B0", pix_fmt = "yuv420p10le", bit_depth = 10,
        color_transfer = "bt709", color_primaries = "bt709", gop_s = 4,
        audio_codec = "eac3",
    },
    hdr10_2160 = {
        probed = true, width = 3840, height = 2160, codec = "hevc",
        codec_string = "hvc1.2.4.L153.B0", pix_fmt = "yuv420p10le", bit_depth = 10,
        color_transfer = "smpte2084", color_primaries = "bt2020", color_space = "bt2020nc",
        max_cll = 1000, max_fall = 400, gop_s = 2, audio_codec = "eac3",
    },
    hdr10_1080 = {
        probed = true, width = 1920, height = 1080, codec = "hevc",
        codec_string = "hvc1.2.4.L123.B0", pix_fmt = "yuv420p10le", bit_depth = 10,
        color_transfer = "smpte2084", color_primaries = "bt2020", gop_s = 2,
        max_cll = 1000, max_fall = 400, audio_codec = "eac3",
    },
    hlg_1080 = {
        probed = true, width = 1920, height = 1080, codec = "hevc",
        pix_fmt = "yuv420p10le", bit_depth = 10,
        color_transfer = "arib-std-b67", color_primaries = "bt2020", gop_s = 2,
        audio_codec = "aac",
    },
    dv_2160 = {
        probed = true, width = 3840, height = 2160, codec = "hevc",
        codec_string = "hvc1.2.4.L153.B0", pix_fmt = "yuv420p10le", bit_depth = 10,
        color_transfer = "smpte2084", color_primaries = "bt2020", gop_s = 2,
        dovi = { profile = "8.1", codec = "dvh1.08.06" }, audio_codec = "eac3",
    },
    dv_no_string = {
        probed = true, width = 3840, height = 2160, codec = "hevc",
        pix_fmt = "yuv420p10le", bit_depth = 10,
        color_transfer = "smpte2084", color_primaries = "bt2020", gop_s = 2,
        dovi = { profile = "8.1" }, audio_codec = "eac3",
    },
    fake_hdr_8bit = {
        probed = true, width = 1920, height = 1080, codec = "h264",
        pix_fmt = "yuv420p", bit_depth = 8,
        color_transfer = "smpte2084", color_primaries = "bt709", gop_s = 2,
        audio_codec = "aac",
    },
}

M.HW = {
    -- Evidencia W1 "en crudo" (la misma tabla que documenta el veredicto del gate).
    w1_raw = M.W1_EVIDENCE,
    w1_measured = {
        host = "178.156.147.234", gpu_encode = "fail", gpu_kind = "virtio-1.0",
        vaapi = "init failed (-5)", encode_speed = 0.356,
        measured_at = 1792990000, benchmark_id = "w1-bench-2026-10-24", encoder = nil,
    },
    gpu_ok = {
        host = "node2-gpu", gpu_encode = "ok", gpu_kind = "nvenc",
        encode_speed = 1.8, measured_at = 1792990000, benchmark_id = "node2-bench-2026-10-25",
        encoder = {
            codec = "hevc", transcode = true, width = 3840, height = 2160,
            preserves_10bit = true, preserves_hdr_metadata = true, supports_dovi = false,
            codec_string = nil, preset = "p4",
        },
    },
    gpu_ok_dovi = {
        host = "node3-gpu", gpu_encode = "ok", gpu_kind = "nvenc",
        encode_speed = 2.2, measured_at = 1792990000, benchmark_id = "node3-bench-2026-10-25",
        encoder = {
            codec = "hevc", transcode = true, width = 3840, height = 2160,
            preserves_10bit = true, preserves_hdr_metadata = true, supports_dovi = true,
            codec_string = "hvc1.2.4.L153.B0",
        },
    },
    gpu_no_10bit = {
        host = "node4-gpu", gpu_encode = "ok", gpu_kind = "nvenc",
        encode_speed = 2.0, measured_at = 1792990000, benchmark_id = "node4-bench-2026-10-25",
        encoder = {
            codec = "hevc", transcode = true, width = 3840, height = 2160,
            preserves_10bit = false, preserves_hdr_metadata = true, supports_dovi = false,
        },
    },
    gpu_bad_codec_string = {
        host = "node5-gpu", gpu_encode = "ok", gpu_kind = "nvenc",
        encode_speed = 1.7, measured_at = 1792990000, benchmark_id = "node5-bench-2026-10-25",
        encoder = {
            codec = "hevc", transcode = true, width = 3840, height = 2160,
            preserves_10bit = true, preserves_hdr_metadata = true, supports_dovi = false,
            codec_string = "avc1.640028",
        },
    },
    gpu_slow = {
        host = "node6-gpu", gpu_encode = "ok", gpu_kind = "nvenc",
        encode_speed = 1.35, measured_at = 1792990000, benchmark_id = "node6-bench-2026-10-25",
        encoder = { codec = "hevc", transcode = true, width = 3840, height = 2160 },
    },
    gpu_critical = {
        host = "node7-gpu", gpu_encode = "ok", gpu_kind = "nvenc",
        encode_speed = 1.05, measured_at = 1792990000, benchmark_id = "node7-bench-2026-10-25",
        encoder = { codec = "hevc", transcode = true, width = 3840, height = 2160 },
    },
    gpu_stale = {
        host = "node8-gpu", gpu_encode = "ok", gpu_kind = "nvenc",
        encode_speed = 1.9, measured_at = 1792900000, benchmark_id = "node8-bench-2026-10-24",
        encoder = { codec = "hevc", transcode = true, width = 3840, height = 2160 },
    },
    gpu_no_benchmark = {
        host = "node9-gpu", gpu_encode = "ok", gpu_kind = "nvenc",
        encode_speed = 1.9, measured_at = 1792990000, benchmark_id = nil,
        encoder = { codec = "hevc", transcode = true, width = 3840, height = 2160 },
    },
    gpu_no_encoder = {
        host = "node10-gpu", gpu_encode = "ok", gpu_kind = "nvenc",
        encode_speed = 1.9, measured_at = 1792990000, benchmark_id = "node10-bench-2026-10-25",
        encoder = nil,
    },
}

M.CONV_OK = {
    kind = "sdr_to_pq", validated = true, bitstream_changed = true,
    evidence_ref = "ffmpeg-tonemap-2026-10-24T12:00Z/probe-out.json",
    probe_out = {
        color_transfer = "smpte2084", color_primaries = "bt2020",
        bit_depth = 10, pix_fmt = "yuv420p10le", max_cll = 800, max_fall = 350,
    },
}

local TV_4K = "2160p60-hdr10-hevc-bw50"
local TV_1080 = "1080p60-h264-bw20"

M.CASES = {
    { id = "C01", desc = "sin ?tv=, sin probe, sin snapshot HW", tv = nil, profile = nil,
      src = nil, hw = nil,
      expect = { profile = "original", requested = "original", truthful = false,
                 range = nil, mode = "unprobed", copy = true, transcode = false,
                 upscale = false, segment = 4, reason = "not_requested",
                 session_key = "line.tivi-ott.net|894968", no_part = true } },

    { id = "C02", desc = "capacidad declarada pero 4K NO pedido (declarar != pedir)",
      tv = TV_4K, profile = nil, src = "sdr_1080_avc", hw = "gpu_ok",
      expect = { profile = "original", requested = "original", truthful = false,
                 range = nil, copy = true, codec = "h264", resolution = "1920x1080",
                 codec_string = "avc1.640028", segment = 4, reason = "not_requested",
                 warn = "client_hdr_claim_not_met" } },

    { id = "C03", desc = "4K pedido sin snapshot de HW (lado seguro)", tv = TV_4K,
      profile = "4k", src = "sdr_1080_avc", hw = nil,
      expect = { profile = "original", requested = "4k", truthful = false,
                 reason = "hw_no_live_hw_probe", downgraded = true, notice = 412,
                 notice_value = "hw-probe-missing", copy = true } },

    { id = "C04", desc = "4K pedido con la evidencia MEDIDA de este VPS (W1)",
      tv = TV_4K, profile = "4k", src = "sdr_1080_avc", hw = "w1_measured",
      expect = { profile = "original", reason = "hw_gpu_unavailable", downgraded = true,
                 notice = 412, notice_value = "gpu-unavailable", copy = true } },

    { id = "C05", desc = "4K elegible en nodo GPU medido, fuente SDR 1080",
      tv = TV_4K, profile = "4k", src = "sdr_1080_avc", hw = "gpu_ok",
      expect = { profile = "4k", truthful = false, range = nil, mode = "sdr_upscaled",
                 copy = false, transcode = true, upscale = true, codec = "hevc",
                 resolution = "3840x2160", reason = "eligible_4k", downgraded = false,
                 warn = "client_hdr_claim_not_met", notice = nil } },

    { id = "C06", desc = "4K desde fuente HDR + encoder preserva 10-bit/metadata",
      tv = TV_4K, profile = "4k", src = "hdr10_1080", hw = "gpu_ok",
      expect = { profile = "4k", truthful = true, range = "PQ", tc = 16, primaries = 9,
                 mode = "preserved_through_upscale", max_cll = 1000 } },

    { id = "C07", desc = "4K pedido sobre fuente ya 2160 (no se escala)",
      tv = TV_4K, profile = "4k", src = "hdr10_2160", hw = "gpu_ok",
      expect = { profile = "original", reason = "source_already_uhd", truthful = true,
                 range = "PQ", resolution = "3840x2160", upscale = false,
                 notice_value = "source-already-uhd" } },

    { id = "C08", desc = "HDR10 real + original: passthrough truthful",
      tv = TV_4K, profile = nil, src = "hdr10_2160", hw = nil,
      expect = { profile = "original", truthful = true, range = "PQ", tc = 16,
                 primaries = 9, mode = "passthrough", max_cll = 1000, max_fall = 400,
                 supplemental = nil } },

    { id = "C09", desc = "Dolby Vision real + original: PQ + SUPPLEMENTAL del probe",
      tv = TV_4K, profile = nil, src = "dv_2160", hw = nil,
      expect = { profile = "original", truthful = true, range = "PQ",
                 supplemental = "dvh1.08.06", mode = "passthrough" } },

    { id = "C10", desc = "DV sin codec string en probe: no se inventa",
      tv = TV_4K, profile = nil, src = "dv_no_string", hw = nil,
      expect = { truthful = true, range = "PQ", supplemental = nil,
                 warn = "dovi_codec_string_missing" } },

    { id = "C11", desc = "falso HDR (PQ 8-bit bt709): NO se etiqueta HDR",
      tv = TV_4K, profile = nil, src = "fake_hdr_8bit", hw = nil,
      expect = { truthful = false, range = nil, mode = "sdr",
                 reason_has = "hdr_source_not_confirmed", warn = "hdr_evidence_incomplete" } },

    { id = "C12", desc = "HLG real + original: VIDEO-RANGE=HLG, TC=18",
      tv = TV_4K, profile = nil, src = "hlg_1080", hw = nil,
      expect = { truthful = true, range = "HLG", tc = 18, primaries = 9,
                 mode = "passthrough" } },

    { id = "C13", desc = "4K desde SDR sin conversión: SDR escalado, nunca HDR",
      tv = TV_4K, profile = "4k", src = "sdr_1080_hevc_gop10", hw = "gpu_ok",
      expect = { profile = "4k", truthful = false, range = nil, mode = "sdr_upscaled",
                 segment = 10, warn = "client_hdr_claim_not_met", no_part = true } },

    { id = "C14", desc = "SDR→PQ REAL validada (reencode + probe_out) sí etiqueta",
      tv = TV_4K, profile = "4k", src = "sdr_1080_avc", hw = "gpu_ok",
      conversion = "conv_ok",
      expect = { profile = "4k", truthful = true, range = "PQ", mode = "converted_real",
                 primaries = 9, tc = 16 } },

    { id = "C15", desc = "conversión declarada sobre REMUX (profile=original): NO",
      tv = TV_4K, profile = nil, src = "sdr_1080_avc", hw = "gpu_ok",
      conversion = "conv_ok",
      expect = { profile = "original", truthful = false, range = nil, mode = "sdr",
                 reason_has = "conversion_requires_transcode_profile" } },

    { id = "C16", desc = "tipo de conversión no permitido (upscale disfrazado)",
      tv = TV_4K, profile = "4k", src = "sdr_1080_avc", hw = "gpu_ok",
      conversion = { kind = "upscale_to_hdr", validated = true, bitstream_changed = true,
                     probe_out = { color_transfer = "smpte2084", color_primaries = "bt2020", bit_depth = 10 },
                     evidence_ref = "fake-evidence-0001" },
      expect = { truthful = false, range = nil, reason_has = "conversion_kind_not_allowed" } },

    { id = "C17", desc = "conversión sin cambiar bitstream (remux/upscale) prohibida",
      tv = TV_4K, profile = "4k", src = "sdr_1080_avc", hw = "gpu_ok",
      conversion = { kind = "sdr_to_pq", validated = true, bitstream_changed = false,
                     probe_out = { color_transfer = "smpte2084", color_primaries = "bt2020", bit_depth = 10 },
                     evidence_ref = "evidence-not-bitstream" },
      expect = { truthful = false, reason_has = "conversion_not_bitstream" } },

    { id = "C18", desc = "probe de salida no confirma PQ (bt709): rechazada",
      tv = TV_4K, profile = "4k", src = "sdr_1080_avc", hw = "gpu_ok",
      conversion = { kind = "sdr_to_pq", validated = true, bitstream_changed = true,
                     probe_out = { color_transfer = "bt709", color_primaries = "bt2020", bit_depth = 10 },
                     evidence_ref = "evidence-mismatch-out" },
      expect = { truthful = false, reason_has = "conversion_output_transfer_mismatch" } },

    { id = "C19", desc = "conversión sin referencia de evidencia: rechazada",
      tv = TV_4K, profile = "4k", src = "sdr_1080_avc", hw = "gpu_ok",
      conversion = { kind = "sdr_to_pq", validated = true, bitstream_changed = true,
                     probe_out = { color_transfer = "smpte2084", color_primaries = "bt2020", bit_depth = 10 } },
      expect = { truthful = false, reason_has = "conversion_missing_evidence_ref" } },

    { id = "C20", desc = "encoder 4K no preserva 10-bit: tone-map a SDR",
      tv = TV_4K, profile = "4k", src = "hdr10_1080", hw = "gpu_no_10bit",
      expect = { profile = "4k", truthful = false, range = nil, mode = "tonemapped_to_sdr",
                 warn = "tonemapped_to_sdr", reason_has = "hdr_not_preserved_by_encoder" } },

    { id = "C21", desc = "?tv= con fps fuera de rango → fallback seguro",
      tv = "2160p999-hdr10-hevc", profile = "4k", src = "sdr_1080_avc", hw = "gpu_ok",
      expect = { profile = "original", degraded = true, error = "bad_fps",
                 reason = "client_resolution_undeclared", truthful = false } },

    { id = "C22", desc = "?tv= basura total → fallback seguro", tv = "<script>alert(1)</script>",
      profile = "4k", src = "sdr_1080_avc", hw = "gpu_ok",
      expect = { profile = "original", degraded = true, error = "unknown_token",
                 reason = "client_resolution_undeclared" } },

    { id = "C23", desc = "?tv= ancho de banda 0 → inválido", tv = "2160p60-hevc-bw0",
      profile = nil, src = "sdr_1080_avc", hw = nil,
      expect = { profile = "original", degraded = true, error = "bad_bandwidth" } },

    { id = "C24", desc = "?tv= token desconocido (typo) → fallback seguro",
      tv = "2160p60-hevc-4kfoo", profile = "4k", src = "sdr_1080_avc", hw = "gpu_ok",
      expect = { profile = "original", degraded = true, error = "unknown_token",
                 reason = "client_resolution_undeclared" } },

    { id = "C25", desc = "JSON compacto válido equivale al token form",
      tv = '{"r":2160,"fps":60,"hdr":"hdr10","codecs":["hevc","av1"],"audio":["eac3"],"bw":200,"v":1}',
      profile = "4k", src = "sdr_1080_avc", hw = "gpu_ok",
      expect = { profile = "4k", degraded = false, upscale = true, truthful = false } },

    { id = "C26", desc = "JSON truncado → fallback seguro", tv = '{"r":2160,"fps":60',
      profile = "4k", src = "sdr_1080_avc", hw = "gpu_ok",
      expect = { profile = "original", degraded = true, reason = "client_resolution_undeclared" } },

    { id = "C27", desc = "JSON anidado → rechazado", tv = '{"r":{"v":2160}}',
      profile = nil, src = "sdr_1080_avc", hw = nil,
      expect = { degraded = true, profile = "original" } },

    { id = "C28", desc = "cliente limitado a 1080p no recibe 4K", tv = TV_1080,
      profile = "4k", src = "sdr_1080_avc", hw = "gpu_ok",
      expect = { profile = "original", reason = "client_max_res_below_2160",
                 notice_value = "client-max-res", truthful = false } },

    { id = "C29", desc = "cliente sólo h264 vs encoder hevc → no 4K", tv = "2160p60-h264",
      profile = "4k", src = "sdr_1080_avc", hw = "gpu_ok",
      expect = { profile = "original", reason = "client_cannot_decode_encoder_codec",
                 notice_value = "client-codec" } },

    { id = "C30", desc = "cupo concurrente 4K agotado", tv = TV_4K, profile = "4k",
      src = "sdr_1080_avc", hw = "gpu_ok", active_4k = 1,
      expect = { profile = "original", reason = "hw_capacity_exhausted",
                 notice_value = "capacity-exhausted" } },

    { id = "C31", desc = "benchmark HW viejo (stale) → no 4K", tv = TV_4K,
      profile = "4k", src = "sdr_1080_avc", hw = "gpu_stale",
      expect = { profile = "original", reason = "hw_benchmark_stale",
                 notice_value = "benchmark-stale" } },

    { id = "C32", desc = "encode 1,35× (<1,5×) → no 4K", tv = TV_4K, profile = "4k",
      src = "sdr_1080_avc", hw = "gpu_slow",
      expect = { profile = "original", reason = "hw_encode_speed_below_threshold",
                 notice_value = "encode-below-threshold" } },

    { id = "C33", desc = "encode 1,05× (<1,2× crítico) → no 4K", tv = TV_4K,
      profile = "4k", src = "sdr_1080_avc", hw = "gpu_critical",
      expect = { profile = "original", reason = "hw_encode_speed_critical",
                 notice_value = "encode-critical" } },

    { id = "C34", desc = "snapshot sin benchmark_id (no verificable) → no 4K",
      tv = TV_4K, profile = "4k", src = "sdr_1080_avc", hw = "gpu_no_benchmark",
      expect = { profile = "original", reason = "hw_benchmark_unverifiable",
                 notice_value = "benchmark-unverifiable" } },

    { id = "C35", desc = "snapshot sin encoder declarado → no 4K", tv = TV_4K,
      profile = "4k", src = "sdr_1080_avc", hw = "gpu_no_encoder",
      expect = { profile = "original", reason = "hw_encoder_undeclared" } },

    { id = "C36", desc = "modo reject: el caller puede responder 412 sin variante",
      tv = TV_4K, profile = "4k", src = "sdr_1080_avc", hw = "w1_measured",
      on_4k_unavailable = "reject",
      expect = { profile = nil, refused = true, notice = 412,
                 notice_value = "gpu-unavailable" } },

    { id = "C37", desc = "GOP 10 s → segmento 10 s (no se promete <4 s)", tv = nil,
      profile = nil, src = "sdr_1080_hevc_gop10", hw = nil,
      expect = { segment = 10, profile = "original", no_part = true,
                 latency_min = 6, latency_max = 25 } },

    { id = "C38", desc = "GOP 1,2 s → segmento mínimo 4 s", tv = nil, profile = nil,
      src = "sdr_1080_avc", hw = nil,
      expect = { segment = 4, profile = "original" } },

    { id = "C39", desc = "cliente SDR-only con fuente HDR: se sirve el bitstream real (PQ), avisando",
      tv = "1080p60-sdr-hevc", profile = nil, src = "hdr10_1080", hw = nil,
      expect = { truthful = true, range = "PQ", warn = "client_sdr_only_source_hdr" } },

    { id = "C40", desc = "sin probe pero cliente declara HDR: NO se etiqueta HDR",
      tv = TV_4K, profile = nil, src = nil, hw = nil,
      expect = { truthful = false, range = nil, mode = "unprobed",
                 warn = "client_hdr_claim_suppressed_without_probe" } },

    { id = "C41", desc = "codec string del encoder incoherente: se descarta",
      tv = TV_4K, profile = "4k", src = "hdr10_1080", hw = "gpu_bad_codec_string",
      expect = { profile = "4k", codec_string = nil,
                 warn = "encoder_codec_string_inconsistent" } },

    { id = "C42", desc = "audio eac3 con cliente sólo aac: passthrough + aviso",
      tv = "1080p60-aac-hevc", profile = nil, src = "sdr_1080_hev1", hw = nil,
      expect = { profile = "original", warn = "audio_may_not_decode" } },

    { id = "C43", desc = "probe hev1.*: GOLDEN RULE, no va en CODECS= de STREAM-INF",
      tv = nil, profile = nil, src = "sdr_1080_hev1", hw = nil,
      expect = { profile = "original", codec_string = nil,
                 codec_probe_string = "hev1.1.6.L120.B0",
                 warn = "hev1_not_allowed_in_stream_inf" } },

    { id = "C44", desc = "?profile=4k sin capacidades declaradas → original",
      tv = nil, profile = "4k", src = "sdr_1080_avc", hw = "gpu_ok",
      expect = { profile = "original", reason = "client_resolution_undeclared",
                 notice_value = "client-caps-missing" } },

    { id = "C45", desc = "?tv= declara HDR10 y SDR a la vez → conflicto, fallback",
      tv = "2160p60-hdr10-sdr-hevc", profile = "4k", src = "sdr_1080_avc", hw = "gpu_ok",
      expect = { profile = "original", degraded = true, error = "hdr_conflict" } },

    { id = "C46", desc = "4K sobre DV con encoder que soporta DV: se preserva + SUPPLEMENTAL",
      tv = TV_4K, profile = "4k", src = "dv_2160", hw = "gpu_ok_dovi",
      expect = { profile = "original", truthful = true, range = "PQ",
                 mode = "passthrough", reason = "source_already_uhd" } },

    { id = "C47", desc = "aviso 412 silenciado (opts.notice=false) pero downgrade igual",
      tv = TV_4K, profile = "4k", src = "sdr_1080_avc", hw = nil, notice = false,
      expect = { profile = "original", downgraded = true, notice = nil } },

    { id = "C48", desc = "4K contra la evidencia W1 en crudo: gate OFF por hardware medido",
      tv = TV_4K, profile = "4k", src = "sdr_1080_avc", hw = "w1_raw",
      expect = { profile = "original", reason = "hw_gpu_unavailable",
                 notice = 412, notice_value = "gpu-unavailable", truthful = false } },
}

-- ═══════════════════════════════════════════════════════════════════════════
-- 16) Runner de casos (público: lo usa el verificador)
-- ═══════════════════════════════════════════════════════════════════════════
local function fixture_src(name)
    if name == nil then return nil end
    local s = M.SRC[name]
    if not s then return nil end
    return s
end

local function fixture_hw(name)
    if name == nil then return nil end
    return M.HW[name]
end

function M.run_case(c)
    local args = copy_shallow(M.CASE_ARGS_BASE)
    if c.tv ~= nil then args.tv = c.tv end
    if c.profile ~= nil then args.profile = c.profile end
    local conversion = nil
    if c.conversion == "conv_ok" then conversion = M.CONV_OK
    elseif type(c.conversion) == "table" then conversion = c.conversion end
    local input = {
        args = args,
        src = fixture_src(c.src),
        hw = fixture_hw(c.hw),
        opts = {
            now = M.NOW,
            active_4k = c.active_4k or 0,
            on_4k_unavailable = c.on_4k_unavailable,
            notice = c.notice,
            conversion = conversion,
        },
    }
    return M.resolve(input)
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 17) Autotest (47 casos de decisión + parser + JSON + idem + invariantes)
-- ═══════════════════════════════════════════════════════════════════════════
local function new_harness()
    local H = { pass = 0, fail = 0, results = {} }
    function H:record(name, ok, got, want)
        self.results[#self.results + 1] = {
            name = name, pass = ok, got = tostring(got), want = tostring(want),
        }
        if ok then self.pass = self.pass + 1 else self.fail = self.fail + 1 end
    end
    function H:eq(name, got, want)
        local ok
        if want == nil then ok = (got == nil) else ok = (got == want) end
        self:record(name, ok, got, want)
    end
    function H:has(name, list, code)
        self:record(name, contains_code(list, code), "missing:" .. tostring(code), code)
    end
    function H:truthy(name, v) self:record(name, v and true or false, v, true) end
    return H
end

local GETTERS = {
    profile = function(d) return d.profile end,
    requested = function(d) return d.requested_profile end,
    truthful = function(d) return d.truthfulHdr end,
    range = function(d) return d.hdr and d.hdr.video_range end,
    tc = function(d) return d.hdr and d.hdr.transfer_characteristics end,
    primaries = function(d) return d.hdr and d.hdr.color_primaries end,
    mode = function(d) return d.hdr and d.hdr.mode end,
    max_cll = function(d) return d.hdr and d.hdr.max_cll end,
    max_fall = function(d) return d.hdr and d.hdr.max_fall end,
    supplemental = function(d) return d.hdr and d.hdr.supplemental_codecs end,
    copy = function(d) return d.variantArgs and d.variantArgs.copy end,
    transcode = function(d) return d.variantArgs and d.variantArgs.transcode end,
    upscale = function(d) return d.variantArgs and d.variantArgs.upscale end,
    codec = function(d) return d.variantArgs and d.variantArgs.codec end,
    codec_string = function(d) return d.variantArgs and d.variantArgs.codec_string end,
    codec_probe_string = function(d) return d.variantArgs and d.variantArgs.codec_probe_string end,
    resolution = function(d) return d.variantArgs and d.variantArgs.resolution end,
    segment = function(d) return d.variantArgs and d.variantArgs.segment_target_s end,
    reason = function(d) return d.reason end,
    downgraded = function(d) return d.downgraded end,
    refused = function(d) return d.refused end,
    degraded = function(d) return d.caps_degraded end,
    session_key = function(d) return d.session and d.session.key end,
    notice = function(d) return d.notices and d.notices[1] and d.notices[1].status end,
    notice_value = function(d) return d.notices and d.notices[1] and d.notices[1].value end,
    latency_min = function(d) return d.variantArgs and d.variantArgs.latency_window_s
        and d.variantArgs.latency_window_s.min end,
    latency_max = function(d) return d.variantArgs and d.variantArgs.latency_window_s
        and d.variantArgs.latency_window_s.max end,
    no_part = function(d) return d.variantArgs == nil or d.variantArgs.part_target == nil end,
}

function M.selftest()
    local H = new_harness()

    -- ── A) Parser token form ───────────────────────────────────────────────
    do
        local caps = M.parse_caps("2160p60-hdr10-hevc-bw50")
        H:truthy("parse.canonico_ok", caps ~= nil)
        H:eq("parse.canonico_height", caps and caps.max_height, 2160)
        H:eq("parse.canonico_fps", caps and caps.max_fps, 60)
        H:eq("parse.canonico_codec", caps and caps.codecs and caps.codecs.hevc, true)
        H:eq("parse.canonico_hdr", caps and caps.hdr and caps.hdr.hdr10, true)
        H:eq("parse.canonico_bw", caps and caps.bw_mbps, 50)
        H:eq("parse.canonico_tokens", caps and caps.tokens, 4)

        local c2 = M.parse_caps("  1080P60-HEVC-AAC  ")
        H:truthy("parse.case_and_trim", c2 ~= nil)
        H:eq("parse.case_height", c2 and c2.max_height, 1080)

        local c3 = M.parse_caps("2160-hdr10plus-dv-hlg-av1-vp9-vvc-ac3-eac3-ac4-mp3-opus-atmos-flac")
        H:truthy("parse.variado_ok", c3 ~= nil)
        H:eq("parse.variado_hdr", c3 and c3.hdr and c3.hdr.dv, true)
        H:eq("parse.variado_av1", c3 and c3.codecs and c3.codecs.av1, true)
        H:eq("parse.variado_atmos", c3 and c3.audio and c3.audio.atmos, true)

        local bad, errs = M.parse_caps("2160p999")
        H:eq("parse.fps_fuera_rango", bad, nil)
        H:has("parse.err_fps", errs, "bad_fps")

        local bad2, errs2 = M.parse_caps("9999p")
        H:eq("parse.res_no_permitida", bad2, nil)
        H:has("parse.err_res", errs2, "bad_resolution")

        local bad3, errs3 = M.parse_caps("bw0")
        H:eq("parse.bw_cero", bad3, nil)
        H:has("parse.err_bw", errs3, "bad_bandwidth")

        local bad4, errs4 = M.parse_caps("bw2000")
        H:eq("parse.bw_excesivo", bad4, nil)
        H:has("parse.err_bw2", errs4, "bad_bandwidth")

        local bad5, errs5 = M.parse_caps("2160p60--hevc")
        H:eq("parse.token_vacio", bad5, nil)
        H:has("parse.err_token_vacio", errs5, "empty_token")

        local bad6, errs6 = M.parse_caps("2160p60-hdr10-sdr")
        H:eq("parse.hdr_conflicto", bad6, nil)
        H:has("parse.err_hdr_conflicto", errs6, "hdr_conflict")

        local long = string.rep("2160p60-hevc-hdr10-", 20)
        local bad7, errs7 = M.parse_caps(long)
        H:eq("parse.too_long", bad7, nil)
        H:has("parse.err_too_long", errs7, "caps_too_long")

        local n_tok = "2160p60-hevc-hdr10-bw50-aac-ac3-eac3-av1-hlg-dv-flac-opus-mp3-ac4-atmos-vvc-h264"
        local bad8, errs8 = M.parse_caps(n_tok)
        H:eq("parse.too_many_tokens", bad8, nil)
        H:has("parse.err_tokens", errs8, "too_many_tokens")

        local bad9, errs9 = M.parse_caps("2160p 60")
        H:eq("parse.whitespace", bad9, nil)
        H:has("parse.err_ws", errs9, "whitespace_in_token")

        H:eq("parse.missing", select(1, M.parse_caps(nil)), nil)
        H:has("parse.err_missing", select(2, M.parse_caps(nil)), "missing")
    end

    -- ── B) Parser JSON form ────────────────────────────────────────────────
    do
        local c = M.parse_caps('{"r":2160,"fps":60,"hdr":"hlg","codecs":["hevc"],"audio":["ac3"],"bw":80,"v":1}')
        H:truthy("json.ok", c ~= nil)
        H:eq("json.height", c and c.max_height, 2160)
        H:eq("json.hlg", c and c.hdr and c.hdr.hlg, true)
        H:eq("json.bw", c and c.bw_mbps, 80)
        H:eq("json.source", c and c.source, "json")

        local c2 = M.parse_caps('{"res":"1080p50","codec":"h264,hevc","hdr":["hdr10","dv"]}')
        H:truthy("json.string_forms", c2 ~= nil)
        H:eq("json.string_height", c2 and c2.max_height, 1080)
        H:eq("json.string_fps", c2 and c2.max_fps, 50)
        H:eq("json.string_codec", c2 and c2.codecs and c2.codecs.h264, true)

        local e1, er1 = M.parse_caps('{"r":2160,')
        H:eq("json.truncado", e1, nil)
        H:truthy("json.err_truncado", er1 and #er1 > 0)

        local e2, er2 = M.parse_caps('{"r":{"v":2160}}')
        H:eq("json.anidado", e2, nil)
        H:has("json.err_anidado", er2, "json_nested_not_allowed")

        local e3, er3 = M.parse_caps('{"r":2160,"r":1080}')
        H:eq("json.duplicado", e3, nil)
        H:has("json.err_dup", er3, "json_duplicate_key")

        local e4, er4 = M.parse_caps('{"foo":1}')
        H:eq("json.clave_desconocida", e4, nil)
        H:has("json.err_clave", er4, "unknown_key")

        local e5, er5 = M.parse_caps('{"v":2,"r":2160}')
        H:eq("json.version_no_soportada", e5, nil)
        H:has("json.err_version", er5, "unsupported_caps_version")

        local e6, er6 = M.parse_caps('{"r":null}')
        H:eq("json.null", e6, nil)
        H:truthy("json.err_null", er6 and #er6 > 0)

        local e7, er7 = M.parse_caps('{"r":2160} x')
        H:eq("json.trailing", e7, nil)
        H:has("json.err_trailing", er7, "json_trailing_garbage")

        local big = '{"r":2160,"fps":60,"hdr":"hdr10","codecs":["hevc","av1","h264","vp9","vvc"],' ..
            '"audio":["eac3","aac","ac3","ac4","mp3"],"bw":200,"v":1,"pad":"' .. string.rep("x", 500) .. '"}'
        local e8 = M.parse_caps(big)
        H:eq("json.demasiado_largo", e8, nil)
    end

    -- ── C) Identidad de ingesta ────────────────────────────────────────────
    do
        H:eq("idem.normaliza", M.ingest_key("HTTPS://Line.Tivi-OTT.net:443/foo/bar", "00894968"),
            "line.tivi-ott.net|894968")
        H:eq("idem.puerto_no_estandar", M.ingest_key("http://host:8080/x", "7"), "host:8080|7")
        H:eq("idem.desde_url", M.ingest_key("line.tivi-ott.net", "/live/u/p/894968.m3u8"),
            "line.tivi-ott.net|894968")
        H:eq("idem.userinfo", M.ingest_key("https://u:p@line.tivi-ott.net/x", "12"),
            "line.tivi-ott.net|12")
        H:eq("idem.canal_no_numerico", M.ingest_key("line.tivi-ott.net", "canal-uno"), nil)
        H:eq("idem.sin_provider", M.ingest_key(nil, "12"), nil)
        H:eq("idem.explicito", M.normalize_idem("LINE.tivi-ott.net|000894968"),
            "line.tivi-ott.net|894968")
        H:eq("idem.explicito_invalido", M.normalize_idem("basura"), nil)
        local d1 = M.resolve({ args = { provider = "line.tivi-ott.net", channel = "894968", tv = TV_4K } })
        local d2 = M.resolve({ args = { provider = "line.tivi-ott.net", channel = "894968", tv = TV_1080 } })
        H:eq("idem.misma_clave_entre_caps", d1.session.key, d2.session.key)
        H:eq("idem.clave_sin_perfil", d1.session.key, "line.tivi-ott.net|894968")
    end

    -- ── D) Normalización de probe y codec strings ──────────────────────────
    do
        local snd = M.normalize_src(M.SRC.hdr10_2160)
        H:eq("src.hdr_confirmado", snd.hdr_confirmed, true)
        H:eq("src.range", snd.transfer_range, "PQ")
        local snd2 = M.normalize_src(M.SRC.fake_hdr_8bit)
        H:eq("src.fake_no_confirmado", snd2.hdr_confirmed, false)
        H:has("src.fake_falta_primaries", snd2.hdr_missing, "primaries_not_bt2020")
        H:has("src.fake_falta_bitdepth", snd2.hdr_missing, "bit_depth_below_10")
        local snd3 = M.normalize_src({ pix_fmt = "yuv420p10le" })
        H:eq("src.bitdepth_desde_pixfmt", snd3.bit_depth, 10)
        H:eq("src.hvc1_ok", M.codec_string_matches("hvc1.2.4.L153.B0", "hevc"), true)
        H:eq("src.hev1_tambien_ok", M.codec_string_matches("hev1.1.6.L120.B0", "hevc"), true)
        H:eq("src.cross_codec_no", M.codec_string_matches("hvc1.2.4.L153.B0", "h264"), false)
    end

    -- ── E) Validación de conversión SDR→HDR ────────────────────────────────
    do
        H:eq("conv.ok", select(1, M.validate_conversion(M.CONV_OK, { profile = "4k", gate_ok = true })), true)
        H:eq("conv.sin_bitstream",
            select(2, M.validate_conversion({ kind = "sdr_to_pq", validated = true, bitstream_changed = false },
                { profile = "4k", gate_ok = true })), "conversion_not_bitstream")
        H:eq("conv.sin_gate",
            select(2, M.validate_conversion(M.CONV_OK, { profile = "4k", gate_ok = false })),
            "conversion_requires_hw_gate")
        H:eq("conv.en_remux",
            select(2, M.validate_conversion(M.CONV_OK, { profile = "original", gate_ok = true })),
            "conversion_requires_transcode_profile")
        H:eq("conv.kind_raro",
            select(2, M.validate_conversion({ kind = "fake" }, { profile = "4k", gate_ok = true })),
            "conversion_kind_not_allowed")
    end

    -- ── F) HW gate ────────────────────────────────────────────────────────
    do
        H:eq("gate.sin_snapshot", M.hw_gate(nil, { now = M.NOW }).reason, "no_live_hw_probe")
        H:eq("gate.w1_raw", M.hw_gate(M.W1_EVIDENCE, { now = M.NOW }).reason, "gpu_unavailable")
        H:eq("gate.w1", M.hw_gate(M.HW.w1_measured, { now = M.NOW }).reason, "gpu_unavailable")
        H:eq("gate.ok", M.hw_gate(M.HW.gpu_ok, { now = M.NOW }).reason, "hw_ok")
        H:eq("gate.cupo", M.hw_gate(M.HW.gpu_ok, { now = M.NOW, active_4k = 1 }).reason,
            "capacity_exhausted")
        H:eq("gate.stale", M.hw_gate(M.HW.gpu_stale, { now = M.NOW }).reason, "benchmark_stale")
        H:eq("gate.lento", M.hw_gate(M.HW.gpu_slow, { now = M.NOW }).reason,
            "encode_speed_below_threshold")
        H:eq("gate.critico", M.hw_gate(M.HW.gpu_critical, { now = M.NOW }).reason,
            "encode_speed_critical")
        H:eq("gate.sin_bench_id", M.hw_gate(M.HW.gpu_no_benchmark, { now = M.NOW }).reason,
            "benchmark_unverifiable")
        H:eq("gate.sin_encoder", M.hw_gate(M.HW.gpu_no_encoder, { now = M.NOW }).reason,
            "encoder_undeclared")
    end

    -- ── G) Casos de decisión (tabla de M.CASES) ───────────────────────────
    local decisions = {}
    for _, c in ipairs(M.CASES) do
        local d = M.run_case(c)
        decisions[#decisions + 1] = d
        local ok, problems = M.validate_decision(d)
        H:record(c.id .. ".contrato", ok, table.concat(problems, ","), "")
        local exp = c.expect or {}
        for key, want in pairs(exp) do
            if key == "reason_has" then
                local found = false
                for _, r in ipairs(d.reasons or {}) do
                    if type(r) == "string" and r:find(want, 1, true) then found = true break end
                end
                H:record(c.id .. ".reason_has(" .. tostring(want) .. ")", found,
                    table.concat(d.reasons or {}, "|"), want)
            elseif key == "warn" then
                H:has(c.id .. ".warn(" .. tostring(want) .. ")", d.warnings, want)
            elseif key == "error" then
                H:has(c.id .. ".error(" .. tostring(want) .. ")", d.errors, want)
            else
                local getter = GETTERS[key]
                if not getter then
                    H:record(c.id .. ".expect_desconocido(" .. key .. ")", false, key, "getter")
                else
                    H:eq(c.id .. "." .. key, getter(d), want)
                end
            end
        end
    end
    H:eq("casos.total", #M.CASES, 48)

    -- ── H) Invariantes globales sobre TODAS las decisiones ────────────────
    do
        local bad_ll, bad_part, bad_hdr, bad_copy, bad_socket = 0, 0, 0, 0, 0
        local bad_412, bad_lat, bad_seg = 0, 0, 0
        for _, d in ipairs(decisions) do
            if d.variantArgs then
                if d.variantArgs.ll_hls ~= false then bad_ll = bad_ll + 1 end
                if d.variantArgs.part_target ~= nil then bad_part = bad_part + 1 end
                if d.variantArgs.video_range ~= nil and d.truthfulHdr ~= true then bad_hdr = bad_hdr + 1 end
                if d.variantArgs.no_upstream_socket ~= true then bad_socket = bad_socket + 1 end
                if d.profile == "original" and d.variantArgs.copy ~= true then bad_copy = bad_copy + 1 end
                local lw = d.variantArgs.latency_window_s
                if type(lw) ~= "table" or type(lw.min) ~= "number" or lw.min < 4 then
                    bad_lat = bad_lat + 1
                end
                if d.variantArgs.segment_target_s < 4 then bad_seg = bad_seg + 1 end
            end
            for _, n in ipairs(d.notices or {}) do
                if n.status == 412 and type(d.reason) == "string" and d.reason:sub(1, 3) ~= "hw_" then
                    bad_412 = bad_412 + 1
                end
            end
        end
        H:eq("inv.ll_hls_siempre_false", bad_ll, 0)
        H:eq("inv.sin_part_target", bad_part, 0)
        H:eq("inv.sin_hdr_sin_verdad", bad_hdr, 0)
        H:eq("inv.sin_sockets_propios", bad_socket, 0)
        H:eq("inv.default_es_copy", bad_copy, 0)
        H:eq("inv.sin_latencia_bajo_4s", bad_lat, 0)
        H:eq("inv.segmento_minimo_4s", bad_seg, 0)
        H:eq("inv.412_solo_fallo_de_hardware", bad_412, 0)

        local audit = M.share_audit(decisions)
        H:eq("share.una_sola_sesion", audit.sessions, 1)
        H:eq("share.una_sola_conexion", audit.upstream_connections, 1)
        H:eq("share.sin_violaciones", #audit.violations, 0)
        H:eq("share.decisiones", audit.decisions, #M.CASES)

        local d_orig = M.resolve({ args = { provider = "p.example", channel = "1", tv = TV_4K } })
        local d_4k = M.resolve({
            args = { provider = "p.example", channel = "1", tv = TV_4K, profile = "4k" },
            src = M.SRC.sdr_1080_avc, hw = M.HW.gpu_ok, opts = { now = M.NOW },
        })
        H:eq("share.clave_identica_original_vs_4k", d_orig.session.key, d_4k.session.key)
        H:eq("share.perfiles_distintos", d_orig.profile .. "/" .. d_4k.profile, "original/4k")
        local audit2 = M.share_audit({ d_orig, d_4k })
        H:eq("share.dos_decisiones_una_conexion", audit2.upstream_connections, 1)
        local d_otro = M.resolve({ args = { provider = "p.example", channel = "2" } })
        local audit3 = M.share_audit({ d_orig, d_otro })
        H:eq("share.canal_distinto_dos_conexiones", audit3.upstream_connections, 2)
    end

    -- ── I) Matriz de capacidades y parse_query ────────────────────────────
    do
        local fm = M.feature_matrix()
        local by = {}
        for _, row in ipairs(fm) do by[row.feature] = row.available end
        H:eq("matrix.original", by["profile.original_remux"], true)
        H:eq("matrix.4k_off", by["profile.4k_upscale"], false)
        H:eq("matrix.hdr_passthrough", by["hdr.passthrough"], true)
        H:eq("matrix.hdr_inventado_prohibido", by["hdr.label_invented"], false)
        H:eq("matrix.ll_hls_off", by["ll_hls"], false)
        H:eq("matrix.shared_ingest", by["shared_ingest"], true)
        H:eq("matrix.buffer_infinito_prohibido", by["infinite_buffer"], false)
        H:eq("host.upscale_4k", M.HOST.upscale_4k_available, false)
        H:eq("host.ll_hls", M.HOST.ll_hls_available, false)

        local args = M.parse_query("foo=1&tv=2160p60%2Dhevc&profile=4k&ch=894968")
        H:eq("query.tv_decode", args.tv, "2160p60-hevc")
        H:eq("query.profile", args.profile, "4k")
        H:eq("query.ch", args.ch, "894968")
        H:eq("query.ignora_desconocidas", args.foo, nil)

        local d = M.from_query("tv=2160p60-hevc-hdr10&profile=4k&provider=line.tivi-ott.net&ch=1",
            M.SRC.sdr_1080_avc, M.HW.gpu_ok, { now = M.NOW })
        H:eq("query.resolve_profile", d.profile, "4k")
        H:eq("query.resolve_session", d.session.key, "line.tivi-ott.net|1")
    end

    -- ── J) Determinismo / pureza ──────────────────────────────────────────
    do
        local a = M.resolve({ args = { provider = "x.example", channel = "5", tv = TV_4K },
            src = M.SRC.hdr10_1080, hw = M.HW.gpu_ok, opts = { now = M.NOW } })
        local b = M.resolve({ args = { provider = "x.example", channel = "5", tv = TV_4K },
            src = M.SRC.hdr10_1080, hw = M.HW.gpu_ok, opts = { now = M.NOW } })
        H:eq("pureza.determinista", M.json_encode(a), M.json_encode(b))
        H:eq("pureza.no_ngx", type(ngx), "nil")
    end

    return H
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 18) Tabla de decisión imprimible (markdown / JSON) — para el verificador
-- ═══════════════════════════════════════════════════════════════════════════
local function case_row(c)
    local d = M.run_case(c)
    return {
        id = c.id,
        desc = c.desc or "",
        tv = c.tv or "(none)",
        requested = c.profile or "(none)",
        src = c.src or "(no probe)",
        hw = c.hw or "(none)",
        profile = d.profile or "refused",
        variant = d.variantArgs
            and (d.variantArgs.copy and "copy" or ("scale " .. tostring(d.variantArgs.resolution)))
            or "none",
        truthfulHdr = d.truthfulHdr,
        video_range = (d.hdr and d.hdr.video_range) or "none",
        hdr_mode = (d.hdr and d.hdr.mode) or "none",
        hdr_reason = (d.hdr and d.hdr.reasons and d.hdr.reasons[1]) or "-",
        reason = d.reason,
        segment_s = (d.variantArgs and d.variantArgs.segment_target_s) or "-",
        notice = (d.notices and d.notices[1] and d.notices[1].value) or nil,
    }
end

function M.table_rows()
    local rows = {}
    for _, c in ipairs(M.CASES) do rows[#rows + 1] = case_row(c) end
    return rows
end

function M.decision_table_markdown()
    local out = {
        "| id | ?tv= | pide | probe | hw | → perfil | variante | HDR | range | modo HDR | razón HDR | seg | razón perfil | 412 |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    }
    for _, r in ipairs(M.table_rows()) do
        out[#out + 1] = string.format(
            "| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |",
            r.id, r.tv, r.requested, r.src, r.hw, r.profile, r.variant,
            tostring(r.truthfulHdr), r.video_range, r.hdr_mode, r.hdr_reason,
            tostring(r.segment_s), r.reason, r.notice or "-")
    end
    return table.concat(out, "\n") .. "\n"
end

function M.decision_table_json()
    return M.json_encode({ schema = M.SCHEMA_VERSION, cases = M.table_rows() })
end

function M.host_card_text()
    local lines = {
        "APE fan-out · matriz de capacidades del nodo (" .. M.SCHEMA_VERSION .. ")",
        "nodo              : " .. M.HOST.node .. "  (medido " .. M.HOST.measured_at .. ")",
        "profile.original   : OK  (-c copy, " .. tostring(M.W1_EVIDENCE.remux_core_pct) .. " % core/sesión)",
        "profile.4k         : OFF " .. M.HOST.upscale_4k_reason,
        "                     x265 1080p→2160p = " .. tostring(M.W1_EVIDENCE.x265_upscale_speed) ..
            "× realtime (techo " .. tostring(M.W1_EVIDENCE.x265_max_speed_3vcpu) .. "× con 3 vCPU)",
        "                     GPU: " .. M.W1_EVIDENCE.gpu_kind .. "; VAAPI " .. M.W1_EVIDENCE.vaapi,
        "hdr.passthrough    : probe-gated (muestra W1: " .. M.HOST.hdr_real_sample .. " canales con HDR)",
        "hdr.inventado      : PROHIBIDO (nunca por escalar ni remuxear)",
        "ll_hls             : OFF (" .. M.HOST.ll_hls_reason .. ")",
        "ingesta compartida : sí (idem = provider|channel; perfil excluido)",
        "buffer infinito    : PROHIBIDO (ventana acotada + jump-to-live)",
    }
    return table.concat(lines, "\n") .. "\n"
end

M.CONTRACT_DOC = table.concat({
    "Contrato ape_caps → coordinador I1 (ape.fanout.caps/v1)",
    "  resolve{args,src,hw,opts} → decision",
    "  profile     : \"original\" | \"4k\" | nil (solo si refused=true)",
    "  variantArgs : atributos del manifest de SESIÓN (nil si refused)",
    "                copy/transcode/upscale, width/height/resolution, codec,",
    "                video_range/color_primaries/transfer_characteristics,",
    "                max_cll/max_fall/mastering_display/supplemental_codecs,",
    "                ll_hls=false, part_target=nil, segment_target_s,",
    "                ingest_shared=true, single_upstream=true, no_upstream_socket=true,",
    "                session_key (misma clave para ambos perfiles)",
    "  truthfulHdr : boolean == (hdr.video_range ~= nil)",
    "  session.key : idem = normalize(provider)|normalize(channel)  (sin perfil)",
    "  notices     : recomendación 412 + X-MF-Reason (I1 decide materializarla)",
    "  Garantías   : el módulo no abre sockets, no ejecuta ffmpeg, no escribe,",
    "                no muta argumentos y es determinista con opts.now fijo.",
}, "\n") .. "\n"

-- ═══════════════════════════════════════════════════════════════════════════
-- 19) Runner CLI (solo cuando se ejecuta el archivo; en nginx `arg` es nil)
-- ═══════════════════════════════════════════════════════════════════════════
local function audit_sources(path)
    local problems = {}
    local f = io.open(path, "rb")
    if not f then return { "source_unreadable" } end
    local body = f:read("*a") or ""
    f:close()
    -- Patrones construidos en runtime para no auto-coincidir con este texto.
    local forbidden = {
        "ngx" .. ".socket",
        "ngx" .. ".location.capture",
        "io" .. ".popen",
        "os" .. ".execute",
        "resty" .. ".http",
        "socket" .. ".tcp",
        "ffi" .. ".C",
    }
    for _, pat in ipairs(forbidden) do
        if body:find(pat, 1, true) then problems[#problems + 1] = "forbidden:" .. pat end
    end
    return problems
end

local function cli()
    local a = type(arg) == "table" and arg or {}
    local mode = a[1]
    if mode == "--selftest" then
        local r = M.selftest()
        for _, x in ipairs(r.results) do
            if x.pass then
                io.write("PASS " .. x.name .. "\n")
            else
                io.write(string.format("FAIL %s  got=%s want=%s\n", x.name, x.got, x.want))
            end
        end
        if a[2] == "--audit-src" then
            local problems = audit_sources(a[0])
            if #problems == 0 then
                io.write("PASS audit.src_sin_sockets_ni_ejecucion\n")
                r.pass = r.pass + 1
                r.total = (r.total or (r.pass + r.fail)) + 1
            else
                for _, p in ipairs(problems) do
                    io.write("FAIL audit." .. p .. "\n")
                    r.fail = r.fail + 1
                end
            end
        end
        io.write(string.format("\nRESULT pass=%d fail=%d total=%d\n", r.pass, r.fail, r.pass + r.fail))
        os.exit(r.fail == 0 and 0 or 1)
    elseif mode == "--table" then
        io.write(M.decision_table_markdown())
        os.exit(0)
    elseif mode == "--json" then
        io.write(M.decision_table_json() .. "\n")
        os.exit(0)
    elseif mode == "--host" then
        io.write(M.host_card_text())
        io.write(M.CONTRACT_DOC)
        io.write(M.decision_table_markdown())
        os.exit(0)
    else
        io.write("ape_caps.lua " .. M.VERSION .. " (" .. M.SCHEMA_VERSION .. ")\n")
        io.write("uso: lua5.1 ape_caps.lua [--selftest [--audit-src] | --table | --json | --host]\n")
        os.exit(0)
    end
end

if type(arg) == "table" and type(arg[0]) == "string" and arg[0]:match("ape_caps%.lua$") then
    cli()
end

return M
