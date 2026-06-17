# Council 13 PhD — Audit & Cherry-Pick: `APE_AUTONOMOUS_VPS_DAEMON_URL2_COUNCIL_SAFE_20260616.zip`

> Detalle de archivo-por-archivo en [`superpowers/reports/ARA_COUNCIL_SAFE_PREFLIGHT.md`](superpowers/reports/ARA_COUNCIL_SAFE_PREFLIGHT.md).
> Veredicto: `install.sh` = **BLOCK** · paquete completo = **WARN salvable** · vía aprobada = **CHERRY-PICK** · 0 votos a instalar tal cual.

## Veredicto

| Nivel | Qué |
|---|---|
| **BLOCK** | `install.sh` (+ `.BLOCKED_BY_COUNCIL.original`, `install_cherry_pick.sh`, `uninstall.sh`), `payload/rootfs/**` (systemd supervisor/healthwatch, Go `main.go` + binarios `ara-agent-*`, `ape_vps_supervisor.py`, `ara_device_agent.py`, nginx `ape-url2-autonomous.conf`), `sources_originales/**`. |
| **WARN salvable** | El paquete trae buenas ideas pero con riesgos (auth débil en el original, override de conviva-event, DB paralela, allowlist con `minimal_post_processing`). |
| **CHERRY-PICK (adoptado)** | `council_safe_cherry_pick/**` (11 archivos), integrados **additivos + gateados + con MUST-FIX aplicados**. |

## ADOPTAR (con MUST-FIX aplicados)

| # | Cherry-pick | Integración en el repo | MUST-FIX aplicado |
|---|---|---|---|
| 1 | `ape_mesh_policy_deltas_append.php` | **append** a `vps/prisma/lib/ape_mesh.php` | conviva.db (no paralela); additive `if(!function_exists)`; +helpers anti-flap |
| 2 | `events-sse.php` | nuevo `vps/prisma/api/events-sse.php` | auth Bearer + 503 si token vacío + sin `?token=` (ya cumplía) |
| 3 | `phase_g_delta_hook.php` | nuevo `vps/prisma/api/phase_g_delta_hook.php` | invocado SOLO bajo gate (no incondicional) |
| 4 | `prisma-ara-events.conf` | nuevo `vps/nginx/snippets/prisma-ara-events.conf` | **socket `php-fpm.sock`→`php8.3-fpm.sock`** + `limit_conn` + patrón conviva-stream |
| 5 | `conviva-event.phase-g-delta-hook.patch` | **NO aplicado** → hook a mano, gateado, en `conviva-event.php` | anti-flap (>=2 incid + cooldown + flag OFF default); dispatch INTACTO |
| 6 | `ape-qoe-agent.cherry-pick.sh` | **merge SSE-down** en `vps/prisma/adb/ape-qoe-agent.sh` | allowlist sin `minimal_post_processing`; OFFLINE_CACHE real; no reemplaza |
| 7 | `ara.env.example` | nuevo `vps/prisma/config/ara.env.example` | flags seguros (rollback OFF, cooldown) |
| 8 | `bootstrap_ara_android.sh` | adaptado → `vps/prisma/adb/bootstrap_ara_android.sh` | empuja agente canónico (no Go); honesto `ARA_BOOTSTRAP_REQUIRED` |
| 9 | `adb-keepalive-mdns.sh` / `host-qoe-watchdog.ps1` | **NO duplicados** | ya existen `tools/adb-keepalive.sh` (mDNS) + `host-qoe-watchdog.ps1` |

## RECHAZAR (no integrado, confirmado aislado)
`install.sh` · `cp -a /` · `ln -sfn` sobre prod · `ape_url2.db` (se usa **conviva.db**) · binarios/`main.go` Go como canon ·
daemons systemd-root nuevos · `ape_vps_supervisor.py` · override total de `conviva-event.php`/`channel-pq-*` ·
`minimal_post_processing_allowed` · endpoints sin auth · `?token=` · reinicios agresivos de php-fpm.

## Gates (enforced)
- **Auth:** `ARA_TOKEN` obligatorio; 503 si vacío; solo Bearer; sin query token.
- **Anti-flap:** `APE_PQ_ROLLBACK_ENABLED=0` por defecto; rollback solo con ≥2 incidentes + cooldown.
- **DB:** todo en `conviva.db` (WAL, 2º writer seguro); tablas nuevas `IF NOT EXISTS`.
- **Nginx:** snippet solo `/ara/events`; no redeclara conviva-event; `nginx -t` antes de reload; `include` es paso manual del operador.
- **Autopista/OMEGA-NO-DELETE:** additive; fire-and-forget; players ciegos a `#EXT-X-APE-*`; nada borrado.

## Riesgos restantes / UNVERIFIED
- `php -l` **UNVERIFIED-local** (sin PHP en la PC) → corre en el preflight de `deploy_vps.sh` (gate pre-deploy).
- Capacidad SSE a escala (1 worker fpm por conexión hasta 3600s) — OK para el hogar, `UNVERIFIED` a escala.
- Smokes E2E (SSE/QoE/auth/allowlist/PhaseG/FSM) requieren VPS + device → documentados en FASE 5, no ejecutados aquí.
