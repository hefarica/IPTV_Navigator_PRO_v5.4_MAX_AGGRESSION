# El ESPEJO del VPS — los 18 motores Lua y cómo (no) mejoran la imagen

> Auditoría workflow `w2ryzy040` (4 agentes, evidencia del repo, 2026-06-17). Truth-guards: el VPS NO
> transcodifica ni pinta píxeles · players ciegos a `#EXT-X-APE-*` (RFC 8216 §6.3.1) · GOLDEN RULE · autopista.

## Veredicto en una frase
De 18 motores, **solo ~4 mueven algo que el player REALMENTE lee**; **1 mejora píxel de verdad pero por ADB**
(plano device, no VPS); el resto **mide, transporta o decora**. El realce de píxel real (UHD Crystal) ocurre
en el **VPP por hardware del device** (el pipeline AI-PQ que ya controlamos por URL-2), **no en el VPS**.

## Los 2 planos del espejo
- **Plano A — VPS (Lua):** reescribe el *hint público* del manifest (variante/codec/HDR/resolución) + sanea el
  fingerprint de red (UA/anti-toxic) + chunked anti-corrupción. Llega al player como metadata HLS estándar.
- **Plano B — Device/ARA (ADB):** el VPP del SoC (AI-SR/denoise/sharpness/HEVC-hw/HDMI fps·Hz/HDR). **Aquí** se
  mejora el píxel. Lo comanda el VPS por URL-2 (lo construimos hoy).

## Tabla maestra (18 motores)
| Motor | Fase | Wired | Qué mueve (player lo lee) | Mejora imagen | Rol real |
|---|---|---|---|---|---|
| `combined_body_filter` | body_filter | ✅ .m3u8 | RESOLUTION/CODECS/HDR + reordena STREAM-INF | **SÍ — selección de variante** | **mutador primario** |
| `ape_uhdx_score` | módulo | ind. | (calcula score) | rankea variante premium | cerebro del ranking |
| `ape_virtual_4k` | módulo | ind. | RESOLUTION/CODECS/HDR-PQ | declara 4K+HEVC+PQ (engancha upscaler TV) | mano física |
| `ape_codec_cascade` | módulo | ind. | hvc1/hev1 + nivel | tier HEVC correcto (Ley Cardinal 1) | vara de codec |
| `floor_lock_filter` | body_filter | ❌ **inactivo** | (si activo) quita variantes <floor | redundante con combined | conceptual |
| `bandwidth_reactor` | log | ✅ | shared-dict `bw_*` (no headers) | NO directo — mide ineficiencia | telemetría/spine |
| `reactor_tick` | init_worker 1Hz | ✅ | `bw_state`/`bw_computed_request_bps` | NO directo — metrónomo | metrónomo |
| `decision_engine` | rewrite | ✅ (shield) | `X-Max-Bitrate` upstream | **NO — el proveedor lo ignora** | **brazo inerte** |
| `qoe_server_side_observer` | log | ✅ | `qoe_metrics` | indirecto (lazo HDCP/ADB) | ojo |
| `qoe_flush_worker` | init_worker 60s | ✅ | POST→SQLite | transporte del lazo QoE | circulatorio |
| `qm_apply_worker` | init_worker 3s | ✅ | dispara POST→ADB | aplica settings on-device | diferido (ADB) |
| `quality_realtime` | content `/quality-realtime` | ✅ | **adb_commands[] setprop** | **SÍ REAL — pero por ADB** (HEVC-hw/fps·Hz/HDR) | **espejo material (ADB)** |
| `sentinel_ua_apply` | access | ✅ | **UA/Referer + proxy_pass_request_headers off** | **SÍ — anti 400/403/304 = anti-freeze** | fingerprint |
| `sentinel_auth_guard` | header_filter | ✅ ind. | rota UA / failover-403 | indirecto (continuidad) | continuidad |
| `upstream_response` | header_filter | ✅ | `content_length=nil` (.m3u8) | parcial — chunked anti-corrupción | anti-corrupción |
| `lab_config` | loader | ✅ | (provee umbrales) | "libro de valores MAX" | fuente de valores |
| `ape_device_state_writer` | log `/omega/open` | ✅ | `/dev/shm/ape_devstate_<ip>` | puente device→canal | habilitador |
| `ape_wake_on_manifest` | log (diseñado) | ❌ **no cableado** | encolaría wake del daemon | wake-on-playback | **inactivo** |

Telemetría pura (dashboards): `prisma_telemetry_full`, `sentinel_telemetry_api`, `upstream_gate` (passthrough),
`shield_follow_302`/`follow_redirect` (afinidad CDN, anti-freeze de segmentos).

## Gaps / quick-wins (lo que SÍ se puede activar para mejorar imagen)
1. **Lazo bitrate-reactor → manifest ROTO → SANDBOX PROBADO (2026-06-16):** `combined_body_filter` NO lee
   `bw_state`/`bw_ewma_bps` → la selección de variante NO reacciona al ancho de banda real. **Quick-win
   desarrollado en sandbox aislado** (`vps/nginx/lua/sandbox/bw_adaptive_floor.lua` + `test_bw_adaptive.lua`,
   **10/10 PASS** con `lua` nativo en `/tmp`, cero nginx). El módulo convierte el floor estático `cfg.floor_bps`
   en un floor **adaptativo monótono ↓** al bw real: healthy→floor estático (= hoy), degraded(DOUBLE)→relaja a
   `0.8×ewma` para que sobreviva un peldaño sostenible (**anti-freeze**). Invariantes horneados: mejor score
   siempre presente, nunca vacío, floor efectivo **≤ estático** (0 pérdida de canal). **Pendiente:** cableado
   GATEADO en `combined_body_filter` (ver §Wiring propuesto abajo) — NO aplicado (mutador vivo).
2. **`floor_lock_filter` inactivo** (comentado) — activar si beneficia (anti-variante-pobre).
3. **`ape_wake_on_manifest` no cableado** — cablear (wake-on-playback dispara el daemon ADB/VPP).
4. **`decision_engine` `X-Max-Bitrate` inerte** — el proveedor Xtream lo ignora; no se puede forzar (truth-guard).
5. **Valores sub-max** en algunos engines (floor/score) — subirlos al máximo honesto.

## La verdad sobre "UHD Crystal desde el VPS, siempre"
- El VPS **orquesta** todos los levers que SÍ llegan: la mejor variante (combined_body_filter) + el codec/HDR
  honesto + el fingerprint anti-freeze + **el VPP del device por URL-2 (AI-PQ)**.
- El **píxel UHD Crystal** lo produce el **VPP del device** (AI-SR/denoise/sharpness al máximo) + la mejor
  variante que el proveedor sirva. El VPS COMANDA, no pinta.
- **No es posible** que la telemetría (bandwidth_reactor, qoe_*) "mueva la imagen" — su rol es MEDIR y alimentar
  a los motores de decisión. "Los 18 cumplen su rol" = los telemétricos alimentan, los decisores mutan el
  manifest, el VPP del device aplica — todos async, como un sistema.

## §Wiring propuesto — lazo bitrate-reactor → manifest (NO aplicado; requiere aprobación)
El sandbox prueba la lógica. El cableado en producción es **additivo, ~8 líneas, pcall-guarded, passthrough on
error**, dentro del `pcall(floor_ok...)` ya existente de `combined_body_filter.lua`, justo antes del loop de KEEP
(donde hoy usa `cfg.floor_bps`):

```lua
-- ADITIVO: floor adaptativo al bw real (lazo bitrate-reactor → manifest). Passthrough si falla.
local eff_floor = tonumber(cfg.floor_bps) or 0
do
    local ok_bw, adj = pcall(function()
        local R = ngx.shared.reactor
        if not R then return nil end
        local af = require("sandbox.bw_adaptive_floor")  -- mover a vps/nginx/lua/ al cablear
        local f = af.adaptive_floor(cfg.floor_bps, {
            state = R:get("bw_state"), ewma_bps = R:get("bw_ewma_bps"), floor_4k_bps = af.FLOOR_4K_BPS })
        return f
    end)
    if ok_bw and type(adj) == "number" and adj <= eff_floor then eff_floor = adj end  -- monótono ↓
end
-- … y en el KEEP: cambiar `if v.bw >= cfg.floor_bps` → `if v.bw >= eff_floor`
```

**Garantías:** `adj <= eff_floor` fuerza el invariante monótono (nunca descarta más que hoy) incluso si el
módulo cambiara · `pcall` + `ngx.shared.reactor` nil-safe → si el reactor está frío, floor estático (= hoy) ·
sin `ngx.exit`, sin bloqueo (autopista) · single-variant intacto · mejor score siempre.

**Caveat honesto (scope):** `bw_state`/`bw_ewma_bps` del reactor son **globales por worker** (una sola key), no
por-cliente. En el despliegue actual de **un hogar / un Fire TV**, global ≈ per-cliente → correcto. Multi-cliente
necesitaría `bw_state` keyed por IP del cliente — mejora futura, NO en este cableado.
