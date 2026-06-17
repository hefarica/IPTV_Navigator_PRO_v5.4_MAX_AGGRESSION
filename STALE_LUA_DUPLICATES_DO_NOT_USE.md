# ⚠️ STALE Lua duplicates at repo root — DO NOT USE (OMEGA-NO-DELETE)

The following `.lua` files **at the repo root** are **stale duplicates**, kept (not deleted) per
**OMEGA-NO-DELETE**. They are **NOT** what runs in production and must **not** be edited or deployed.

| Stale (repo root) | Versión | SSOT canónico vivo (USAR ESTE) |
|---|---|---|
| `combined_body_filter.lua` (224 l) | v1.0 (sin codec-cascade/virtual-4K/visual_profiles) | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/combined_body_filter.lua` (v2.0, WIRED en `.m3u8`) |
| `vps_combined_body_filter.lua` (224 l) | byte-idéntico al v1.0 stale | idem ↑ |
| `vps_bandwidth_reactor.lua` (261 l) | 3-state 80M (sin LAB-SYNC/QoE/wake) | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/bandwidth_reactor.lua` (2-state CBR_SUSTAIN/DOUBLE, WIRED en todas las locations) |

**SSOT = `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/`.** El deploy (`tools/cicd/vps_deploy_map.json`)
solo referencia esas copias canónicas. Verificado por la auditoría del workflow 2026-06-16
(los `.conf` vivos incluyen solo `/etc/nginx/lua/<bare-name>` ← mapea desde `vps/nginx/lua/`).
