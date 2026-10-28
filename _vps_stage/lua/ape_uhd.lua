-- ═══════════════════════════════════════════════════════════════════════════
-- APE UHD — "4K prevalece / upscale declarado" (DECISIÓN DEL PROPIETARIO
-- 2026-10-24, supersede 01_OWNER_RULE_LADDER_4K §2.3 y §5)
-- ═══════════════════════════════════════════════════════════════════════════
-- v2 (2026-10-28 · Fase 0 REA · B-01+B-02 · DECISION_A_LOCKED.md):
--   · `max_resolution()` sustituye a "primer STREAM-INF" para las GUARDAS
--     (conserva `top_resolution` por compatibilidad).
--   · `can_declare_8k()` = allow_8k(uhd8k=1) AND max_resolution>=3840 AND
--     TODAS las variantes con esa resolución declaran HEVC con nivel >= L183.
--   · `declare_auto()` declara 8K SÓLO si can_declare_8k; si no, 4K
--     (degradación honesta). `declare_auto` NO se quita: sigue reescribiendo
--     RESOLUTION y sigue siendo la ruta viva por defecto (uhd_auto=1).
--   · Marcador ampliado y único (idempotente):
--     #EXT-X-APE-UPSCALE:declared=<target>;codec=truthful;mode=<4k|8k>;src=<WxH real>;can8k=<0|1>
--   · EXCEPCIÓN DE PRODUCTO (AU-01, ratificada por el capitán): el umbral de
--     fuente NO se sube a 7680. Si 3840<=fuente<7680 y se declara 8K, el
--     marcador con src=/declared=/can8k=1 es OBLIGATORIO y esa variante nunca
--     se presenta como -REAL (sólo declarativa / -PREFERRED).
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
-- Marca trazable que se inyecta (v2):
--   #EXT-X-APE-UPSCALE:declared=3840x2160;codec=truthful;mode=4k;src=1920x1080;can8k=0
-- ═══════════════════════════════════════════════════════════════════════════

local M = {}

M.TARGET_4K = "3840x2160"
M.TARGET_8K = "7680x4320"

-- Ley Cardinal 1: L153 = techo 4K@60 (8.912.896 px). 8K (33.177.600 px) exige
-- nivel >= L183 (HEVC Level 6.1, 35.651.584 px). Declarar 8K con menos nivel es
-- la familia del freeze 2026-06-08.
M.LEVEL_8K_MIN = 183
-- Excepción de producto AU-01: el umbral de fuente para 8K es 3840 (NO 7680).
M.MIN_WIDTH_8K = 3840

-- Nivel HEVC (level_idc) declarado en CODECS; nil si no hay hvc1/hev1.
-- Acepta "hvc1.2.4.L153.B0" y "hev1.1.6.L120.B0" e ignora el resto del listado
-- (p.ej. "mp4a.40.2" va detrás en la misma cadena CODECS).
local function hevc_level(codecs)
    if not codecs or codecs == "" then return nil end
    local lv = codecs:match("hvc1%.[%d%.]-L(%d+)") or codecs:match("hev1%.[%d%.]-L(%d+)")
    return tonumber(lv)
end

-- opts = { target=..., only_top=true, add_pq=false, mode="4k"|"8k",
--          src="WxH", can8k=bool }
-- Devuelve body, n_variantes_tocadas
function M.declare(body, opts)
    opts = opts or {}
    local target = opts.target or M.TARGET_4K
    local only_top = (opts.only_top ~= false)
    local src = opts.src
    if not src then
        local _, res = M.max_resolution(body)
        src = res or "0x0"
    end
    local can8k = opts.can8k and 1 or 0
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
    local mode = opts.mode or (target == M.TARGET_8K and "8k" or "4k")
    local tag = string.format(
        "#EXT-X-APE-UPSCALE:declared=%s;codec=truthful;mode=%s;src=%s;can8k=%d",
        target, mode, src, can8k)

    -- Idempotente: si ya existe marcador se SUSTITUYE (nunca se duplica).
    local out2, k = body2:gsub("#EXT%-X%-APE%-UPSCALE:[^\r\n]*", function() return tag end, 1)
    if k > 0 then return out2, n end

    local out3, k2 = body2:gsub("(#EXTM3U[^\n]*\n)", "%1" .. tag .. "\n", 1)
    if k2 == 0 then return body2, n end
    return out3, n
end

-- Resolución declarada por la PRIMERA variante del master (nil si no hay master).
-- Se conserva por compatibilidad: la DECISIÓN usa `max_resolution`.
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

-- Ancho MÁXIMO declarado entre TODAS las variantes (nil si ninguna declara
-- RESOLUTION). Sustituye a «primer STREAM-INF» en las guardas: en un master
-- ascendente (720p primero, 4K después) el orden del documento mentía.
-- 2.º retorno: la resolución literal "WxH" de esa variante (para el marcador).
function M.max_resolution(body)
    local best_w, best_res = nil, nil
    for line in (body .. "\n"):gmatch("(.-)\r?\n") do
        if line:find("#EXT-X-STREAM-INF", 1, true) then
            local ws, hs = line:match("RESOLUTION=(%d+)x(%d+)")
            if ws then
                local w = tonumber(ws)
                if not best_w or w > best_w then
                    best_w, best_res = w, ws .. "x" .. hs
                end
            end
        end
    end
    return best_w, best_res
end

-- ¿Se puede declarar 8K? Tres condiciones, todas obligatorias:
--   1. allow_8k == true  (flag `uhd8k`; llega desde el gateway)
--   2. max_resolution >= 3840   (excepción de producto AU-01: NO 7680)
--   3. TODAS las variantes con esa resolución declaran HEVC con nivel >= L183
--      (sin CODECS o sin HEVC ⇒ false)
function M.can_declare_8k(body, opts)
    opts = opts or {}
    if opts.allow_8k ~= true then return false end
    local w = M.max_resolution(body)
    if not w or w < M.MIN_WIDTH_8K then return false end
    local seen = false
    for line in (body .. "\n"):gmatch("(.-)\r?\n") do
        if line:find("#EXT-X-STREAM-INF", 1, true) then
            local ws = line:match("RESOLUTION=(%d+)x%d+")
            if ws and tonumber(ws) == w then
                seen = true
                local lv = hevc_level(line:match('CODECS="([^"]*)"'))
                if not lv or lv < M.LEVEL_8K_MIN then return false end
            end
        end
    end
    return seen
end

-- DECISIÓN DEL PROPIETARIO 2026-10-24 (segunda iteración):
--   "SIEMPRE RESOLUTION=3840x2160 sobre bytes 1920x1080;
--    si es 1080p o menor se upscala a 4K; y las 4K se llevan a 8K fake."
-- v2 (A LOCKED): el 8K deja de ser automático — exige can_declare_8k().
--   Sin las tres condiciones → 4K (degradación honesta, no silencio).
-- CODECS nunca se toca (freeze FZ-01 si se toca).
-- Devuelve body, n, mode, can8k   (sin master: body, 0, nil, nil)
function M.declare_auto(body, opts)
    opts = opts or {}
    local top = M.top_resolution(body)
    if top == nil then return body, 0, nil end          -- no es master (igual que hoy)
    local w = M.max_resolution(body) or top
    local can8k = M.can_declare_8k(body, opts)
    local target, mode
    if can8k and w >= M.MIN_WIDTH_8K then
        target, mode = M.TARGET_8K, "8k"
    else
        target, mode = M.TARGET_4K, "4k"
    end
    local _, src_res = M.max_resolution(body)
    local nb, n = M.declare(body, {
        target = target, mode = mode, src = src_res,
        add_pq = opts.add_pq, only_top = true, can8k = can8k,
    })
    return nb, n, mode, can8k
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
