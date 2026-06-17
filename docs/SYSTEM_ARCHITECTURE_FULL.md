# OMEGA ARA + URL-2 — System Architecture (full)

Diagramas: [`../diagrams/omega_ara_full_system.mmd`](../diagrams/omega_ara_full_system.mmd) (Mermaid) ·
[`../diagrams/omega_ara_full_system.txt`](../diagrams/omega_ara_full_system.txt) (ASCII).

## Flujo end-to-end

```
Player → Xray:8443 (túnel HACIA el VPS, NO bypass) → nginx (shield/intercept + Lua body-filter
   muta el manifest: variante/CODECS) → SurfShark wg → provider           [URL-1: datos]

Player/ARA → QoE (POST fire-and-forget) → conviva-event.php → conviva.db (conviva_events)
   conviva-event.php (hook Phase G GATEADO) → ape_pq_should_emit_ara_rollback?
      → (solo flag ON + ≥2 incid + cooldown) ape_phase_g_emit_delta → policy_deltas
   events-sse.php /ara/events (auth Bearer) == SSE push ==> ARA on-device
   ARA aplica SOLO device_settings allowlisted al player; heartbeat → ara_heartbeats   [URL-2: control]
```

## Componentes (cherry-pick)

| Componente | Archivo | Rol |
|---|---|---|
| Bus deltas (lib) | `vps/prisma/lib/ape_mesh.php` (append) | `ape_insert_delta`, `ape_ara_heartbeat`, `ape_policy_db` (conviva.db), `ape_pq_should_emit_ara_rollback` (anti-flap) |
| SSE down | `vps/prisma/api/events-sse.php` | `/ara/events`, auth Bearer, lee `policy_deltas`, push streaming |
| Hook Phase G | `vps/prisma/api/phase_g_delta_hook.php` | `ape_phase_g_emit_delta` (payload SDR_FORCE), invocado gateado |
| Ingest QoE + gate | `vps/prisma/api/conviva-event.php` | dispatch INTACTO + bloque additivo gateado (flag OFF default) |
| Nginx | `vps/nginx/snippets/prisma-ara-events.conf` | location `/ara/events`, socket php8.3-fpm, buffering off |
| ARA on-device | `vps/prisma/adb/ape-qoe-agent.sh` | QoE-up (existente) + SSE-down + FSM + allowlist + OFFLINE_CACHE |
| Bootstrap | `vps/prisma/adb/bootstrap_ara_android.sh` | push agente (solo ADB autorizado), `ARA_BOOTSTRAP_REQUIRED` honesto |
| Config | `vps/prisma/config/ara.env.example` | `ARA_TOKEN`, `APE_PQ_ROLLBACK_ENABLED=0`, cooldown |
| DB | `conviva.db` (SSOT) | `policy_deltas`, `ara_heartbeats`, `channel_pq_profile`, `conviva_events` |

## FSM on-device
`HEALTHY` → (SSE cae) `DEGRADED` → `OFFLINE_CACHE` (reaplica SOLO last-good allowlisted) → (reintento) `RECOVERING`
→ (reconecta tras caída) `RESTORED` (reconcilia, ledger dedup) → `HEALTHY`. Estado persistido en archivo (cruza subshells del pipe SSE).

## Truth-guards (enforced)
Players ciegos a `#EXT-X-APE-*` (RFC 8216 §6.3.1); el VPS decide variantes/metadata/QoE, **no píxeles**; sin per-frame
remoto; ADB no se habilita remoto (bootstrap autorizado + host LAN); el ARA aplica SOLO 3 `device_settings` allowlisted
(sin `minimal_post_processing`); autopista (Lua log/body phase, fire-and-forget, nunca corta playback); conviva.db = SSOT.
