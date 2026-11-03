# E5 · PROPUESTA DE PARCHE — techo 4K real en el plano UHD (NO desplegado)

> **Estado: NO aplicado. No se ha tocado el VPS.** Este documento existe para que la fase
> de despliegue tenga el cambio exacto, verificado y reversible. Rutas afectadas:
> `_vps_stage/lua/ape_uhd.lua` y `_vps_stage/lua/ape_gateway.lua` → **lock de otra sesión
> (§3 D7 de `COORDENADAS_SESIONES.md`) + ventana de despliegue §4 obligatoria**.
> Copia viva de referencia (bytes exactos del VPS): [`../live/ape_uhd.lua.live`](../live/ape_uhd.lua.live),
> [`../live/ape_gateway.lua.live`](../live/ape_gateway.lua.live).

## 1 · Qué cierra

| Hallazgo | Hoy (medido) | Tras el parche |
|---|---|---|
| **E5-F4** `uhd_auto=1` (default) declara **`RESOLUTION=7680x4320` con `CODECS="hvc1.2.4.L153.B0"`** | Ley Cardinal 1 rota: L153 = techo 4K@60 (familia del freeze 2026-06-08) | `uhd_auto` se queda en **4K**; 8K sólo con `uhd8k=1` **y** guardas |
| **E5-F5** `uhd8k=1` declara 8K sin mirar la fuente | 8K declarado sobre una fuente 1080p AVC (`declare_8k_forzado` en la matriz) | 8K exige `max_resolution(fuente) ≥ 3840` **y** nivel `≥ L183`; si no → 4K |
| **E5-F7** "variante top" = primer `EXT-X-STREAM-INF` del documento | un master ascendente (720p primero) declara 4K en la variante de 720p y deja dos variantes "4K" | sin cambio (la guarda nueva usa `max_resolution`, no el orden; el `declare` sigue en la 1.ª) |

**Lo que el parche NO cambia:** `CODECS` (ni una coma), `VIDEO-RANGE=PQ` (sigue gobernado por
`uhd_pq`), el rebase de URIs, LL-HLS, el floor del LAB, `/_ape/_fetch`, ni la regla `.ts→404`.

## 2 · Parche A — `ape_uhd.lua` (añadir 3 funciones, cambiar 1 rama)

### 2.1 Añadir tras `M.top_resolution` (línea 83 del módulo vivo)

```lua
-- E5 (2026-10-26): techo real. 8K SOLO si (a) la fuente es >=4K y (b) el nivel
-- declarado sostiene 8K (HEVC Level 6.1 = L183). CODECS no se toca nunca.
M.MIN_HEVC_LEVEL_8K = 183

-- Mayor RESOLUTION= declarada por CUALQUIER variante (no solo la 1.ª).
function M.max_resolution(body)
    local mx = 0
    for line in (body .. "\n"):gmatch("(.-)\r?\n") do
        if line:find("#EXT-X-STREAM-INF", 1, true) then
            local w = tonumber(line:match("RESOLUTION=(%d+)x%d+") or 0) or 0
            if w > mx then mx = w end
        end
    end
    return mx
end

-- ¿el primer codec de vídeo declarado soporta 8K? (hevc L>=183; AVC nunca)
function M.level_supports_8k(body)
    for line in (body .. "\n"):gmatch("(.-)\r?\n") do
        if line:find("#EXT-X-STREAM-INF", 1, true) then
            local codecs = line:match('CODECS="([^"]*)"') or ""
            for tok in codecs:gmatch("[^,]+") do
                local lv = tok:match("^hv[ce][1e]%.%d+%.%w+%.L(%d+)")
                if lv then return (tonumber(lv) or 0) >= M.MIN_HEVC_LEVEL_8K end
                if tok:match("^avc[13]%.") then return false end
            end
        end
    end
    return false
end

function M.can_declare_8k(body)
    return M.max_resolution(body) >= 3840 and M.level_supports_8k(body)
end
```

### 2.2 Cambiar `M.declare_auto` (líneas 92-107) — techo 4K

```lua
-- ANTES
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
    ...
end

-- DESPUÉS (E5): el techo declarable es 4K. El 8K deja de ser automático
-- porque exige nivel >= L183 (CODECS intocable) -> sólo por uhd8k=1 con guardas.
function M.declare_auto(body, opts)
    opts = opts or {}
    if M.top_resolution(body) == nil then return body, 0, nil end   -- no es master
    local nb, n = M.declare(body, { target = M.TARGET_4K, mode = "4k",
        add_pq = opts.add_pq, only_top = true })
    return nb, n, "4k"
end
```

## 3 · Parche B — `ape_gateway.lua` (líneas 215-233 del gateway vivo)

```lua
-- ANTES
    elseif flag("uhd8k", false) then
        rebased, uhd_n = uhd.declare(rebased, { target = uhd.TARGET_8K, mode = "8k",
            add_pq = flag("uhd_pq", false), only_top = true })
        if uhd_n > 0 then uhd_mode = "8k" end
    elseif flag("uhd_auto", true) then
        local m
        rebased, uhd_n, m = uhd.declare_auto(rebased, { add_pq = flag("uhd_pq", false) })
        if uhd_n > 0 then uhd_mode = m end

-- DESPUÉS: 8K explícito CON guardas; degradación honesta a 4K si no se sostiene.
    elseif flag("uhd8k", false) and uhd.can_declare_8k(rebased) then
        rebased, uhd_n = uhd.declare(rebased, { target = uhd.TARGET_8K, mode = "8k",
            add_pq = flag("uhd_pq", false), only_top = true })
        if uhd_n > 0 then uhd_mode = "8k" end
    elseif flag("uhd_auto", true) or flag("uhd8k", false) or flag("uhd4k", true) then
        local m
        rebased, uhd_n, m = uhd.declare_auto(rebased, { add_pq = flag("uhd_pq", false) })
        if uhd_n > 0 then uhd_mode = m end
```

> La tercera condición absorbe el caso `uhd8k=1` **sin** guardas: en vez de no declarar nada
> (lo que dejaría el master sin marca), declara **4K** — el techo coherente con L153.
> El resto de la cascada (`uhd4k` explícito) queda igual.

## 4 · Verificación (medida con el módulo real, sin desplegar)

Ejecución con `lua5.1` cargando el **módulo vivo** (`/etc/nginx/lua/ape_uhd.lua`, sha
`f1f5eb67…`) + las funciones del parche:

| Caso (fuente) | `max_res` | `level_8k` | `can8k` | `uhd_auto=1` (techo 4K) | `uhd8k=1` + guardas |
|---|---:|---|---|---|---|
| M1 1080p AVC L4.0 | 1920 | false | false | `3840x2160` | `3840x2160` |
| M2 4K HEVC **L153** | 3840 | false | false | `3840x2160` | `3840x2160` |
| M3 8K HEVC **L153** | 7680 | false | false | `3840x2160` | `3840x2160` |
| M4 8K HEVC **L183** | 7680 | true | **true** | `3840x2160` | **`7680x4320`** |
| M5 ascendente (720p 1.º, 4K 2.º) | 3840 | false | false | `3840x2160 ; 3840x2160` | `3840x2160 ; 3840x2160` |

Consecuencias honestas:

1. **`uhd_auto` deja de declarar 8K.** El 8K sólo aparece en M4 y sólo con `uhd8k=1`.
2. **Una fuente 8K con L153 se declara 4K**: el techo lo manda el nivel declarado, no la
   resolución de la fuente. Es la lectura estricta de Ley Cardinal 1 y evita el 8K insostenible.
3. **Una fuente 8K legal (L183) con los flags por defecto se declara 4K** (8K apagado por
   defecto). Para servir 8K hay que encender `uhd8k=1` a sabiendas.

## 5 · Despliegue (cuando haya ventana §4) y rollback

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /root/backups/edge-e5-$STAMP/etc/nginx/lua
cp -a /etc/nginx/lua/ape_uhd.lua    /root/backups/edge-e5-$STAMP/etc/nginx/lua/
cp -a /etc/nginx/lua/ape_gateway.lua /root/backups/edge-e5-$STAMP/etc/nginx/lua/
sha256sum /root/backups/edge-e5-$STAMP/etc/nginx/lua/*.lua > /root/backups/edge-e5-$STAMP/SHA256SUMS

# ... subir los 2 ficheros parcheados ...
luac -p /etc/nginx/lua/ape_uhd.lua && luac -p /etc/nginx/lua/ape_gateway.lua   # obligatorio
nginx -t && systemctl reload nginx                                              # nunca restart

# verificación funcional (loopback, sin tocar flags)
curl -s -D- -o /dev/null http://127.0.0.1:8088/cdn/127.0.0.1:8088/__fixture_master.m3u8   | grep X-APE-UHD   # 4k:1
curl -s -D- -o /dev/null http://127.0.0.1:8088/cdn/127.0.0.1:8088/__fixture_master4k.m3u8 | grep X-APE-UHD   # 4k:1  <- antes 8k:1
curl -s http://127.0.0.1:8088/_ape/luatest | tail -c 400                                                     # fail:0
node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs --strict                                                     # sin blockers

# ROLLBACK
cp -a /root/backups/edge-e5-$STAMP/etc/nginx/lua/*.lua /etc/nginx/lua/
nginx -t && systemctl reload nginx
```

> **`ape_luatest` se pone rojo con el parche si no se actualiza en el mismo despliegue.**
> Verificado sobre el fichero vivo (`/etc/nginx/lua/ape_luatest.lua`, sha `98a29c444f1b…`):
>
> | Línea | Assert actual | Tras el parche |
> |---:|---|---|
> | 155 | `uhd.auto_4k_a_8k` = `a4k:find("RESOLUTION=7680x4320") ~= nil` | debe esperar `3840x2160` |
> | 156 | `uhd.auto_4k_modo` = `"8k"` | debe esperar `"4k"` |
>
> Los demás asserts UHD **siguen válidos**: `uhd.8k_resolucion` (línea 130) y
> `uhd.8k_codec_intacto` (131) prueban `declare(..., TARGET_8K)` **directo**, que el parche
> no toca; `uhd.auto_1080_*` (150-152) y `uhd.golden_rule_*` (136-139) tampoco cambian.
> Es el detalle que rompe un deploy correcto: actualizar el self-test en el mismo commit.
