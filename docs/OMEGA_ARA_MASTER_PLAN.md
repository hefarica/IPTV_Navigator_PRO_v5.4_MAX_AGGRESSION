# OMEGA ARA + URL-2 — Master Plan (Council-safe cherry-pick)

Arquitectura completa: [`SYSTEM_ARCHITECTURE_FULL.md`](SYSTEM_ARCHITECTURE_FULL.md) ·
Auditoría: [`COUNCIL_13_PHD_AUDIT_AND_CHERRY_PICK.md`](COUNCIL_13_PHD_AUDIT_AND_CHERRY_PICK.md) ·
Realidad de instalación: [`ARA_AUTO_INSTALL_REALITY_AND_BOOTSTRAP.md`](ARA_AUTO_INSTALL_REALITY_AND_BOOTSTRAP.md).

## Doctrina LOCKED
**ARA + URL-2 = bus canónico**: todo viaja por URL-2 (QoE up + SSE deltas down) y el ARA aplica.
Transporte = **streaming + conexión abierta + data-push de deltas** (no polling). **conviva.db** = SSOT.
FREEZELESS + VISUAL MASTER + OMEGA-NO-DELETE. Phase G PQ→SDR por canal/device cuando la QoE detecte daño.
Phase F: playback verbatim (no se cambia la URL de reproducción sin autorización).

## Fases (ejecutadas en esta integración)

| Fase | Qué | Estado |
|---|---|---|
| **0** | Auditoría read-only (unzip a `/tmp`, inventario, comparar, preflight) | ✅ `reports/ARA_COUNCIL_SAFE_PREFLIGHT.md` |
| **1** | Cherry-pick VPS additivo: `ape_insert_delta`+`policy_deltas`+`ara_heartbeats` (conviva.db), `events-sse.php` (Bearer), snippet `/ara/events` (socket fix), hook gateado en `conviva-event.php`, `ara.env.example`, deploy_map | ✅ |
| **2** | ARA sh: `poll_deltas`/`apply_delta`/SSE `curl -N`/heartbeat/reconnect/allowlist merge en `ape-qoe-agent.sh` (no Go; integra ps1+adb-keepalive) | ✅ |
| **3** | State + FSM on-device: `ape_ara_state` ledger idempotente, last-good, FSM HEALTHY/DEGRADED/RECOVERING/OFFLINE_CACHE/RESTORED; OFFLINE_CACHE reaplica solo last-good allowlisted | ✅ |
| **4** | Hardening: bootstrap documentado/honesto (`ARA_BOOTSTRAP_REQUIRED`), stale Lua marcado (OMEGA-NO-DELETE) | ✅ |
| **5** | Verificación: `bash -n` ✅, `php -l` deferred-to-deploy, `node -c` = NO TOUCH (generador no tocado), smokes E2E documentados | ✅ parcial (E2E requiere VPS+device) |

## Truth-guards + CI/CD
- Players ciegos a `#EXT-X-APE-*`; VPS decide variantes/metadata/QoE, no píxeles; ADB no remoto.
- Allowlist on-device = 3 settings (hdr_conversion, match_content_frame_rate, display_color_mode[amlogic]). **Sin** `minimal_post_processing`.
- Anti-flap: `APE_PQ_ROLLBACK_ENABLED=0` default; rollback solo ≥2 incidentes + cooldown.
- **CI/CD**: todo deploy por `tools/cicd/deploy_vps.sh` (backup + `nginx -t` + `php -l` + health + rollback). Sin scp ad-hoc.
- **PUSH y DEPLOY solo con autorización explícita del propietario.** Esta integración = **commit LOCAL**.

## Activación (pasos manuales del operador, fuera de esta integración)
1. Exponer `ARA_TOKEN` (largo aleatorio) al pool **php-fpm** (`env[ARA_TOKEN]`). Sin él, `/ara/events` = 503.
2. Añadir `include snippets/prisma-ara-events.conf;` al server-block HTTPS vivo + `nginx -t` + reload.
3. (Opcional, validado en sandbox) `APE_PQ_ROLLBACK_ENABLED=1` cuando el cooldown esté probado.
4. Bootstrap del ARA en el device autorizado (ver AUTO_INSTALL_REALITY).
