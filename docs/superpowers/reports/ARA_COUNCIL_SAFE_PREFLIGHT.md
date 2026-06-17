# PREFLIGHT — Auditoría READ-ONLY del paquete `APE_AUTONOMOUS_VPS_DAEMON_URL2_COUNCIL_SAFE_20260616.zip`

> FASE 0 (read-only). Fecha 2026-06-16. ZIP: `C:\Users\HFRC\Downloads\…COUNCIL_SAFE_20260616.zip`
> (12 MB; descomprimido a `C:\tmp\ape_council_safe_unpack` **sin ejecutar nada**, excluyendo
> `sources_originales/`). Veredicto general: **CHERRY-PICK aprobado** · `install.sh` = **BLOCK** ·
> paquete completo = **WARN salvable**. Cero integración tal-cual.

## 1. Inventario y clasificación

### ADOPTAR — `council_safe_cherry_pick/` (11 archivos, todos auditados)
| Archivo | Rol | Destino repo |
|---|---|---|
| `vps/prisma/lib/ape_mesh_policy_deltas_append.php` | `ape_insert_delta`+`ape_policy_db`+`ape_ara_heartbeat`+`ape_normalize_channel_id`+tablas `policy_deltas`/`ara_heartbeats` | **append** a `vps/prisma/lib/ape_mesh.php` |
| `vps/prisma/api/events-sse.php` | SSE `/ara/events` (auth Bearer, lee `policy_deltas`) | nuevo `vps/prisma/api/events-sse.php` |
| `vps/prisma/api/phase_g_delta_hook.php` | `ape_phase_g_emit_delta()` (payload SDR_FORCE) | nuevo `vps/prisma/api/phase_g_delta_hook.php` |
| `patches/conviva-event.phase-g-delta-hook.patch` | hook en conviva-event | **NO aplicar el patch fuzzy** → integrar a mano, gateado |
| `vps/nginx/snippets/prisma-ara-events.conf` | location `/ara/events` | nuevo snippet (con MUST-FIX socket) |
| `vps/prisma/adb/ape-qoe-agent.cherry-pick.sh` / `player/on_device/ara-qoe-agent.sh` | SSE-down + allowlist + heartbeat | **merge additivo** en `vps/prisma/adb/ape-qoe-agent.sh` (no reemplazo) |
| `config/ara.env.example` | flags (ARA_TOKEN, rollback off, cooldown) | nuevo `vps/prisma/config/ara.env.example` |
| `tools/host/adb-keepalive-mdns.sh` · `bootstrap_ara_android.sh` · `host-qoe-watchdog.ps1` | host watchdog/mDNS/bootstrap | referencia → reconciliar con `tools/adb-keepalive.sh` + `host-qoe-watchdog.ps1` existentes (FASE 2/4) |

### RECHAZAR — confirmado aislado (no se integra nada de aquí)
- `install.sh` (618 B, stub) + `install.sh.BLOCKED_BY_COUNCIL.original` (3222 B) + `install_cherry_pick.sh` + `uninstall.sh`.
- `payload/rootfs/etc/systemd/system/*.service` (`ape-vps-autonomous-supervisor`, `-healthwatch`) — daemons systemd-root nuevos.
- `payload/rootfs/etc/nginx/snippets/ape-url2-autonomous.conf` — nginx autónomo (riesgo de duplicar locations/autopista).
- `payload/rootfs/opt/ape/autonomous-vps/ara-agent/go/**` — `main.go` + binarios `ara-agent-android-arm64`/`-linux-amd64` (Go como canon = RECHAZADO).
- `payload/.../ara-agent/python/ara_device_agent.py` (+.pyc) + `bin/ape_vps_supervisor.py` (+.pyc).
- `sources_originales/**` — paquetes fuente de referencia (los 12 MB; `ape_visual_engine_v3_2.py` y backups). NO integrar.

## 2. Auditoría por archivo vs MUST-FIX (verificado)
| Archivo | Chequeo | Resultado |
|---|---|---|
| `events-sse.php` | Bearer + 503 si `ARA_TOKEN` vacío + `APE_LAB_MODE` + **sin `?token=`** + headers SSE | ✅ CUMPLE (`hash_equals`, regex `^Bearer\s+`, `text/event-stream`+`X-Accel-Buffering:no`, lee `policy_deltas`) |
| `ape_mesh_policy_deltas_append.php` | conviva.db (no paralela) + additive | ✅ CUMPLE (`ConvivaPersistence::DEFAULT_DB_PATH`=`/opt/netshield/data/conviva.db`, todo `if(!function_exists)`, `CREATE TABLE IF NOT EXISTS`) |
| `phase_g_delta_hook.php` | payload `{hdr_conversion_mode:0,video_range:SDR,pq_profile:SDR_FORCE}` | ✅ payload correcto; ⚠️ **sin gate anti-flap** (lo añado yo) |
| `prisma-ara-events.conf` | solo `/ara/events`, no redeclara conviva-event, timeouts | ✅ pero ⚠️ **socket `/run/php/php-fpm.sock` es INCORRECTO** → MUST-FIX `php8.3-fpm.sock` |
| `ape-qoe-agent.cherry-pick.sh` | allowlist sin `minimal_post_processing`, `display_color_mode` solo amlogic, auth header | ✅ allowlist OK; ⚠️ **OFFLINE_CACHE es no-op** (lo implemento en FASE 3) |
| `ara.env.example` | `ARA_TOKEN`, `APE_PQ_ROLLBACK_ENABLED=0`, `INCIDENTS_MIN=2`, `COOLDOWN=1800` | ✅ defaults seguros |

## 3. Gaps que cierro quirúrgicamente (no vienen resueltos en el ZIP)
1. **Anti-flap ausente.** El `.patch` invoca `ape_phase_g_emit_delta()` **incondicional** → emitiría SDR en cada evento. **RECHAZO el patch.** Integro el hook en `conviva-event.php` **después de `dispatch`**, gateado por `APE_PQ_ROLLBACK_ENABLED==='1'` + señal de daño (`decision`/`qoe_score<=8`/`decoder_error`) + `incident_count>=APE_PQ_ROLLBACK_INCIDENTS_MIN` + cooldown — reusando `channel_pq_profile` (`incident_count`/`last_incident_at`) sin tocar `ape_pq_record_incident` existente. **Flag OFF por defecto = cero cambio de comportamiento.**
2. **OFFLINE_CACHE no-op** (`tail … >/dev/null`). Implemento reaplicación real de last-good allowlisted en FASE 3 (FSM).
3. **Agent es archivo aparte.** Fusiono SOLO `poll_deltas`/`apply_delta`/`safe_settings_put`/`auth_header` en el `ape-qoe-agent.sh` existente (reusa su logcat/post). No lo reemplazo.
4. **Socket nginx** `php-fpm.sock`→`php8.3-fpm.sock`; alinear el snippet al patrón probado `prisma-conviva-stream.conf` (`include fastcgi.conf`, `limit_conn prisma_stream_per_ip`, buffering off, `SCRIPT_NAME`).
5. **Include del snippet**: va DENTRO del server-block HTTPS vivo (como `prisma-conviva-stream.conf`). El repo aporta el snippet; **el wire del `include` + el deploy es paso CI/CD/operador** (no toco config viva).

## 4. UNVERIFIED → resueltos en esta auditoría
- conviva.db 2º writer: **SEGURO** (WAL + `busy_timeout`, tablas nuevas sin colisión).
- Path `SCRIPT_FILENAME /var/www/html/prisma/api/events-sse.php`: **correcto** (igual patrón que ape-match/ape-pull/conviva-event/conviva-stream).
- Socket php-fpm real: **`/run/php/php8.3-fpm.sock`** (confirmado en 5 snippets vivos).
- Phase G en conviva-event.php: **no existe ahí** (solo dispatch) → el hook es additivo + gateado.

## 5. Riesgos restantes (documentados)
- **Capacidad SSE**: cada conexión `/ara/events` retiene 1 worker php-fpm hasta 3600s. Para 1-pocos devices del hogar = OK; a escala = `UNVERIFIED` (mitigar con `limit_conn` + pool fpm dimensionado). El endpoint es auth-gated, reduce superficie.
- **Anti-flap precisión**: con flag OFF (default) no aplica; al habilitar, validar cooldown en sandbox antes de prod.
- **Bootstrap ARA**: una playlist sola NO instala/abre ADB. Sin bootstrap autorizado → `ARA_BOOTSTRAP_REQUIRED` (documentado, no se promete auto-install).

## 6. Mapa a fases de integración
FASE 1 = ape_mesh append + events-sse.php + phase_g_delta_hook.php + snippet (socket fix) + hook gateado en conviva-event.php + ara.env.example + deploy_map. FASE 2 = merge SSE-down en ape-qoe-agent.sh. FASE 3 = state+FSM (OFFLINE_CACHE real). FASE 4 = bootstrap/stale-Lua doc. FASE 5 = `php -l`/`bash -n`/`node -c (NO TOUCH)` + smokes. **Sin push/deploy; commit local.**
