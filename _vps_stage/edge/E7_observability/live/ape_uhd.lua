-- ═══════════════════════════════════════════════════════════════════════════
-- APE UHD — "4K prevalece / upscale declarado" (DECISIÓN DEL PROPIETARIO
-- 2026-10-24, supersede 01_OWNER_RULE_LADDER_4K §2.3 y §5)
-- ═══════════════════════════════════════════════════════════════════════════
-- QUÉ HACE
--   Reescribe `RESOLUTION=` de la variante TOP del master a 3840x2160 (4K) o
--   7680x4320 (8K), y opcionalmente añade `VIDEO-RANGE=PQ`.
--
-- QUÉ **NO** HACE (guardia anti-freeze, no negociable)
--   NO toca `CODECS`. Ni el perfil, ni el nivel, ni el bit-depth.
--   Motivo medido y documentado en el repo: declarar `hvc1.*` sobre bytes AVC
--   1080p es el FREEZE del 2026-06-08 (FZ-01): el player inicializa un decoder
--   HEVC para un bitstream H.264 → pantalla negra/spinner.
--   Declarar `RESOLUTION` alta sobre bytes 1080p sí lo soportan los players:
--   decodifican el frame real (codec correcto) y el panel/TV escala.
--
--   Es decir: resolución = declarativa (permitida por el propietario).
--             codec        = verdad (prohibido falsear).
--
-- Marca trazable que se inyecta:
--   #EXT-X-APE-UPSCALE:declared=3840x2160;codec=truthful;mode=4k
-- ═══════════════════════════════════════════════════════════════════════════

local M = {}

M.TARGET_4K = "3840x2160"
M.TARGET_8K = "7680x4320"

-- opts = { target=..., only_top=true, add_pq=false, mode="4k"|"8k" }
-- Devuelve body, n_variantes_tocadas
function M.declare(body, opts)
    opts = opts or {}
    local target = opts.target or M.TARGET_4K
    local only_top = (opts.only_top ~= false)
    local out, n, idx = {}, 0, 0

    for line in (body .. "\n"):gmatch("(.-)\r?\n") do
        if line ~= "" then
            if line:sub(1, 1) == "#" and line:find("#EXT-X-STREAM-INF", 1, true) then
                idx = idx + 1
                local is_top = (idx == 1) or (not only_top)
                if is_top then
                    if line:find("RESOLUTION=", 1, true) then
                        line = line:gsub("RESOLUTION=%d+x%d+", "RESOLUTION=" .. target)
                    else
                        line = line .. ",RESOLUTION=" .. target
                    end
                    if opts.add_pq and not line:find("VIDEO-RANGE=", 1, true) then
                        line = line .. ",VIDEO-RANGE=PQ"
                    end
                    n = n + 1
                end
            end
            out[#out + 1] = line
        end
    end

    if n == 0 then return body, 0 end

    local body2 = table.concat(out, "\n") .. "\n"
    if body2:find("#EXT-X-APE-UPSCALE:", 1, true) then return body2, n end

    local tag = string.format("#EXT-X-APE-UPSCALE:declared=%s;codec=truthful;mode=%s\n",
        target, opts.mode or (target == M.TARGET_8K and "8k" or "4k"))
    local out2, k = body2:gsub("(#EXTM3U[^\n]*\n)", "%1" .. tag, 1)
    if k == 0 then return body2, n end
    return out2, n
end

-- Resolución declarada por la variante TOP del master (nil si no hay master).
function M.top_resolution(body)
    local seen = 0
    for line in body:gmatch("[^\r\n]+") do
        if line:find("#EXT-X-STREAM-INF", 1, true) then
            seen = seen + 1
            if seen == 1 then
                local w = line:match("RESOLUTION=(%d+)x%d+")
                return tonumber(w) or 0
            end
        end
    end
    return nil
end

-- DECISIÓN DEL PROPIETARIO 2026-10-24 (segunda iteración):
--   "SIEMPRE RESOLUTION=3840x2160 sobre bytes 1920x1080;
--    si es 1080p o menor se upscala a 4K; y las 4K se llevan a 8K fake."
-- Regla automática por resolución REAL declarada por el proveedor:
--   top >= 3840  -> 7680x4320 (8K declarado)
--   top  < 3840  -> 3840x2160 (4K declarado)
-- CODECS nunca se toca (freeze FZ-01 si se toca).
function M.declare_auto(body, opts)
    opts = opts or {}
    local w = M.top_resolution(body)
    if w == nil then return body, 0, nil end          -- no es master
    local target, mode
    if w >= 3840 then
        target, mode = M.TARGET_8K, "8k"
    else
        target, mode = M.TARGET_4K, "4k"
    end
    local nb, n = M.declare(body, {
        target = target, mode = mode,
        add_pq = opts.add_pq, only_top = true,
    })
    return nb, n, mode
end

-- Guardia de coherencia: devuelve true si TODAS las variantes declaran un codec
-- que el bitstream puede sostener (hoy: no podemos inspeccionar el bitstream,
-- así que solo verificamos que exista CODECS y que no haya cruce hev1 en STREAM-INF,
-- que es la GOLDEN RULE).
function M.codec_truth_fields(body)
    local bad = 0
    for line in (body .. "\n"):gmatch("(.-)\r?\n") do
        if line:find("#EXT-X-STREAM-INF", 1, true) then
            local v = line:match('CODECS="([^"]*)"')
            if v and v:find("hev1", 1, true) then bad = bad + 1 end  -- hev1 en STREAM-INF: GOLDEN RULE
        end
    end
    return bad
end

return M
