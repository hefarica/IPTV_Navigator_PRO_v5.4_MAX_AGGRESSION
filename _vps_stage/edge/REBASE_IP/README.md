# REBASE_IP · [t96] Rebase de URLs absolutas con IP:puerto

**Estado: NO APLICADO.** Parche + plan de prueba + rollback para aprobación.

## El fallo medido (canal 9173 «SKY SPORTS MAIN EVENTS 4K», tvg-id 1312008)

| Hecho | Valor |
|---|---|
| Manifiesto | **200** (680 B) |
| Segmentos | **6/6** apuntando a `http://185.227.34.184:80/hls/...` |
| `/cdn/185.227.34.184/...` | **404** |
| Segmento directo | **200**, 13,6 MB |

**Consecuencia para el usuario**: el player sale del edge y va **directo al proveedor en HTTP** ⇒ **mixed content** en cualquier player servido por HTTPS. El canal se ve, pero por una vía que el edge no controla, no cachea y que los players modernos pueden bloquear.

## La causa (no era el gateway)

`ape_rebase_lib.lua:20`:

```lua
if uri:match("^%a[%w+.-]*://") then return nil end   -- ← absoluta: NO se toca
```

`M.absolutize()` devuelve **nil** para cualquier URI absoluta. Para un manifiesto Xtream normal el rebase funciona porque las URIs son **relativas**; para este proveedor son **absolutas con IP:puerto**, así que **se quedaban como estaban**.

Y `/cdn/185.227.34.184/...` daba 404 porque **ningún manifiesto había declarado ese path**: el gateway sirve los paths que el manifiesto declara (candado del vídeo). Si el rebase no reescribe, el path nunca existe.

## El parche

**`ape_rebase_lib.lua`** (4.646 → **5.347 B**):

```lua
function M.to_cdn_path(uri)
    if not uri or uri == "" then return nil end
    local ip, port, rest = uri:match("^https?://(%d+%.%d+%.%d+%.%d+)(:%d+)?(/.*)$")
    if not ip then return nil end
    return "/cdn/" .. ip .. (port or "") .. rest
end
```

Y en los **3 puntos de llamada** (URI="…" comillado, URI= sin comillas, y línea de segmento):

```lua
local abs = M.to_cdn_path(uri) or M.absolutize(uri, origin)
```

**Definida en `:32`, primer uso en `:41`** — sin riesgo de `nil` en tiempo de ejecución.

### Semántica verificada (6/6)

| Entrada | Salida |
|---|---|
| `http://185.227.34.184:80/hls/seg1.ts` | `/cdn/185.227.34.184:80/hls/seg1.ts` |
| `https://185.227.34.184/hls/seg1.ts` | `/cdn/185.227.34.184/hls/seg1.ts` |
| `http://185.227.34.184:80/hls/seg1.ts?token=abc` | `/cdn/185.227.34.184:80/hls/seg1.ts?token=abc` |
| `http://cdn.example.com/x.ts` | `nil` (host con nombre: lo rebasa el flujo existente) |
| `seg1.ts` (relativa) | `nil` (flujo existente) |
| `http://1.2.3.4.5/x.ts` | `nil` (no es IPv4 válida) |

**Query string conservada**: el token del CDN suele ir ahí; perderlo daría 403.

## Lo que cubre

Líneas de segmento, `URI="…"` (EXT-X-KEY / EXT-X-MAP / EXT-X-MEDIA), `URI=` sin comillas, y `#EXT-X-PART` (usa `URI="…"`). **El resto de la línea se conserva**: el `gsub` solo sustituye el grupo capturado.

## ⚠️ LO QUE NO ESTÁ VERIFICADO

- **[UNKNOWN] el parse de `/cdn/<ip>:<puerto>/` en el gateway.** La cabecera documenta la ruta como `/cdn/<host-proveedor>[:puerto]/<rutas>` (`ape_gateway.lua:4`), lo que **sugiere** que ya acepta puerto. **No he localizado ni leído el parse exacto**, así que **no afirmo que sirva una IP literal con `:puerto`**. Es el **primer** punto del plan de prueba.
- **[UNKNOWN] el candado de `.ts`**: no localicé el mecanismo de «solo se sirve el path que el manifiesto declaró». **No lo he tocado**, así que no debería romperse, pero tampoco lo he verificado.
- **[UNKNOWN] `luac5.1 -p`**: no hay Lua en este host. El parche **no está verificado sintácticamente aquí**; el bloque 1 del test plan lo exige en el VPS.

## Honestidad sobre lo que esto NO hace

**No hay remux ni 8K real desde el edge.** Eso sería **transcode**: está prohibido en este VPS y **no cambiaría un solo píxel** de lo que ya entrega el proveedor. El canal **es 4K real** (`hvc1.2.4.L153`, 3840×2160) y **así se queda**: lo único que cambia es **por dónde viaja** el segmento (por el edge en HTTPS, cacheado) — no su contenido.
