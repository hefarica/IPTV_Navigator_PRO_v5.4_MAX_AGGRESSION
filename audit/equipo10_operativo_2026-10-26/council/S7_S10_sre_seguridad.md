# Council S7+S10 — SRE (systemd/watchdogs) y seguridad (secretos, auth, headers tóxicos)

**Tarea:** `t6` (c6) · **Fase:** Council read-only · **Snapshot:** `git HEAD e38a89b` (`e38a89bb30c02cb41050f34cef43d3711a2b0644`, 2026-10-26 03:08:19 -0500)
**Autor:** `s7-sre-secops` (S7+S10) · **Fecha:** 2026-10-26 · **Mutaciones:** 0 (ni repo ni VPS; no se instaló/habilitó ninguna unidad)
**Estado de ejecución:** sin systemctl/nginx/wg/adb locales (Windows). Todo lo de sistema es **estático sobre el repo**; nada de lo desplegado se midió aquí → los veredictos sobre producción son **NOT_RUN**.
**Snapshot sucio:** `git status --porcelain` = **57 entradas** (16 `M`, 3 `D`, 38 `??`). El Council lee HEAD, no el working tree.

---

## 1. Alcance, método y denominadores (S7)

| Conjunto | Denominador | Fuente del número |
|---|---|---|
| Unidades `.service/.timer/.path` **trackeadas** | **40** (30 `.service`, 9 `.timer`, 1 `.path`) | `git ls-files \| Where { -match '\.(service\|timer\|path)$' }` |
| Unidades **untracked** | **0** | `git ls-files --others --exclude-standard` (mismo filtro) |
| Unidades cuyos `ExecStart` resuelven a un archivo del repo | **34 / 40** (no resuelven: `upload-server` ×5 archivos + `ape-uhdx-chisel` ×1 binario externo) | mapeo `basename(ExecStart) → git ls-files` (§2) |
| Scripts de watchdog leídos completos | 3 (`netshield-watchdog.sh`, `_vps_stage/watchdog/ape-meta-watchdog.sh`, `vps/sentinel/ape-sentinel-vps.sh`) | lectura 202/202, 45/45, 260/260 líneas |
| Unidades con `WatchdogSec` real (no comentario) | **2** de 30 `.service` | `ape-ingest@.service:146`, `netshield-watchdog.service:11` |
| Unidades con `sd_notify`/`WATCHDOG=1` en su script | **1** (`_vps_stage/media/ape-ingest.sh:427-464`) | grep `sd_notify\|WATCHDOG=1\|NOTIFY_SOCKET` |

**Método:** `git ls-files` + `git grep -n -I` (sólo archivos trackeados, `-I` excluye binarios) → `archivo:línea`; lectura completa de los 3 watchdogs y de las unidades con política de reinicio no trivial. Barrido de secretos con patrón→tipo y **salida redactada** (nunca el valor, ver §6).

---

## 2. S7 · Tabla unidad → script → ¿existe? → evidencia

| # | Unidad (`archivo:línea` del `ExecStart`) | Target declarado | Fuente en repo | ¿Existe? |
|---|---|---|---|---|
| 1 | `netshield-watchdog.service:8` | `/opt/netshield/netshield-watchdog.sh` | `netshield-watchdog.sh` (raíz) | **SÍ** · sin instalador que lo mapee (`git grep 'netshield-watchdog.sh'` → sólo el `ExecStart`) |
| 2 | `surfshark-route-persist.service:8` | `/opt/netshield/surfshark-route-persist.sh` | `surfshark-route-persist.sh` (raíz) | **SÍ** · mismo hueco de instalador |
| 3 | `_vps_stage/watchdog/ape-meta-watchdog.service:10` | `/usr/local/bin/ape-meta-watchdog.sh` | `_vps_stage/watchdog/ape-meta-watchdog.sh` | **SÍ** |
| 4 | `_vps_stage/lab/ape-net-tuning.service:9` | `/usr/local/bin/ape-net-tuning.sh` | `_vps_stage/lab/ape-net-tuning.sh` | **SÍ** |
| 5 | `_vps_stage/media/ape-supervisor@.service:52` | `/opt/mediafanout/ape-supervisor.sh` | `_vps_stage/media/ape-supervisor.sh` | **SÍ** |
| 6 | `_vps_stage/media/ape-ingest@.service:120` | `/usr/local/bin/ape-ingest.sh` | `_vps_stage/media/ape-ingest.sh` | **SÍ** (+ `sd_notify` real) |
| 7 | `vps/ape-realtime-guardian/systemd/ape-realtime-guardian.service:12` | `.venv/bin/python -m ape_realtime_guardian.main --config /etc/ape-realtime-guardian/config.yaml` | paquete `ape_realtime_guardian/` **sí** | **PARCIAL**: `.venv` no versionado; **0** `*.yaml` del guardian trackeados → `--config` apunta a archivo ausente del repo |
| 8 | `.../ape-realtime-guardian/systemd/adb-persistence.service:12` | `ape_realtime_guardian/adb_persistence.py` | ídem | **SÍ** |
| 9 | `backend/ape-sentinel.service:8` | `/opt/netshield/ape-sentinel-vps.sh` | `vps/sentinel/ape-sentinel-vps.sh` **(+ duplicado** `backend/ape-sentinel-vps.sh`) | **SÍ** (2 copias divergibles) |
| 10 | `vps/prisma/adb/ape-wake-worker.service:18` | `$APE_WAKE_WORKER_SH`=`/var/www/html/prisma/adb/ape-wake-worker.sh` | `vps/prisma/adb/ape-wake-worker.sh` | **SÍ** · único con guarda `ExecStartPre test -x` (:17) |
| 11 | `vps/prisma/adb/prisma-adb-daemon.service:9` | `/opt/prisma-adb/prisma_adb_daemon.sh` | `vps/prisma/adb/prisma_adb_daemon.sh` | **SÍ** |
| 12 | `vps/prisma/adb/ape-player-autoinstall.service:10` | `/opt/netshield/vps/prisma/adb/ape-player-autoinstall.sh` | `vps/prisma/adb/ape-player-autoinstall.sh` | **SÍ** |
| 13 | `vps/network/wg-health-fast.service:8` | `/opt/netshield/scripts/wg-health-fast.sh` | `net-shield/scripts/wg-health-fast.sh` | **SÍ** (sólo probe; el restart vive en `wg-health-monitor.sh`, `wg-health-fast.sh:12-15`) |
| 14 | `vps/network/brazil-route-persist.service:9` (+ `.path`) | `/opt/netshield/scripts/brazil-route-persist.sh` | `net-shield/scripts/brazil-route-persist.sh` | **SÍ** |
| 15 | `vps/prisma/api/ape-canon-watch.service:18` | `/opt/ape-dual-link/api/ape-canon-producer.js` | `vps/prisma/api/ape-canon-producer.js` | **SÍ** (ruta de destino ≠ ruta de repo: no hay instalador) |
| 16 | `vps/prisma/asr/ape-asr-subtitle@.service:21` | `/var/www/html/prisma/asr/ape_asr_subtitle_worker.py` | `vps/prisma/asr/ape_asr_subtitle_worker.py` | **SÍ** |
| 17 | `vps/enroll/ape-enroll-worker.service:16` | `/opt/ape-enroll/ape-enroll-worker.py` | `vps/enroll/ape-enroll-worker.py` | **SÍ** |
| 18 | `vps/prisma-guardian-bridge/prisma-guardian-bridge.service:9` | `/opt/prisma-guardian-bridge/prisma_guardian_bridge.py` | `vps/prisma-guardian-bridge/prisma_guardian_bridge.py` | **SÍ** |
| 19 | `tools/adb-conviva-push.service:18` | `/opt/adb-conviva-push/adb_conviva_push_agent.py` | `tools/adb_conviva_push_agent.py` | **SÍ** |
| 20 | `upload-server.service:9` ×**5** copias (`backend/`, `frontend/vps/`, 2 de `backup_master…`, `test_zip/`) | `/opt/upload-server/upload-server` (binario) | — | **NO — HUÉRFANA**: 0 archivos con ese basename (`git ls-files`) |
| 21 | `ape-uhdx/vps/systemd/ape-uhdx-watchdog.service:9` ×**3** copias (`vps/`, `_ENTREGA/created_…`, `_ENTREGA/vps_live_extracted/…`) | `/opt/ape-uhdx/bin/ape-uhdx-vps-watchdog.sh` | `ape-uhdx/vps/bin/ape-uhdx-vps-watchdog.sh` | **SÍ** (3 copias divergibles) |
| 22 | `ape-uhdx/.../ape-uhdx-chisel.service:6` | `chisel server … --auth <user:pass>` | binario externo | **NO versionado** + **credencial embebida** (§6 #5) |
| 23 | `net-shield/snapshots/…/etc/systemd/system/netshield-autopilot.service:14` ×**2** (snapshots) | `/opt/netshield/autopilot/netshield_autopilot_v2.py` | `net-shield/autopilot/netshield_autopilot_v2.py` | **SÍ** (snapshot, no instalable) |

**Huérfanas reales: 1 unidad / 5 copias (`upload-server`).** `ape-uhdx-chisel` = binario de terceros (no huérfana, pero no reproducible desde el repo).

---

## 3. S7 · Política de reinicio vs doctrina (`Restart/RestartSec/StartLimit*/WatchdogSec`)

| Unidad | Directiva | Línea | Problema medido |
|---|---|---|---|
| `netshield-watchdog.service` | `Type=simple` + `WatchdogSec=120` + `Restart=always` + `RestartSec=5` | 7,11,9,10 | El script **no** hace `sd_notify` (0 hits en `netshield-watchdog.sh`) → systemd lo mata por watchdog a los 120 s y lo relanza **para siempre**. `StartLimitIntervalSec=0` (:12) está en `[Service]` → systemd lo **ignora** (debe ir en `[Unit]`); aun si aplicara, `0` = sin límite. **Auto-bucle estructural cada ~125 s** |
| `netshield-watchdog.service` | — | 12 | `StartLimitIntervalSec` en sección equivocada |
| `ape-realtime-guardian.service` | `StartLimitIntervalSec=300/Burst=10` | 15-16 | en `[Service]` → **ignorados** |
| `adb-persistence.service` | `StartLimitIntervalSec=300/Burst=20` | 15-16 | en `[Service]` → **ignorados** |
| `ape-supervisor@.service` | `StartLimitIntervalSec=60/Burst=5` | 56-57 | en `[Service]` → **ignorados** |
| `ape-ingest@.service` | `StartLimitIntervalSec=300/Burst=5` | 109-110 | **correcto**: `[Unit]`, + `RestartPreventExitStatus` (36 tokens, :137) + `WatchdogSec=15` (:146) + `NotifyAccess=all` (:114) + `sd_notify` en `ape-ingest.sh:427-464` → **único contrato completo del repo** |
| `ape-wake-worker.service` | `Restart=always` + `RestartSec=2`, sin `StartLimit*` | 19-20 | default systemd (5 arranques/10 s) → si el guard `test -x` falla, la unidad queda **failed y nadie avisa** (0 canales de alerta, §5) |
| `ape-sentinel.service`, `prisma-adb-daemon`, `ape-enroll-worker`, `ape-uhdx-chisel` | `Restart=always` | 9-10 / 10-11 / 17-18 / 7-8 | sin `WatchdogSec`: un **cuelgue** (no un exit) es invisible para systemd |
| `adb-conviva-push`, `prisma-guardian-bridge`, `ape-asr-subtitle@` | `Restart=on-failure` | 19-20 / 14-15 / 33-34 | ídem: sin detección de cuelgue |

**Disenso con la propia unidad:** `ape-supervisor@.service:15-20` documenta que `ape-ingest@` **NO** debe llevar `WatchdogSec` («el worker es bash y no envía sd_notify»). La realidad del repo lo contradice: `ape-ingest.sh` **sí** implementa `sd_notify` vía `systemd-notify`/`socat` (:427-450) y la unidad lleva `WatchdogSec=15`. El comentario está obsoleto; la implementación es la correcta.

---

## 4. S7 · ¿El repo reintroduce bucles de reinicio (nginx cada 20 min)?

**Hecho:** el bucle de 20 min **no está en el repo**. Su causa medida es `/etc/cron.d/cache-health-monitor` (`*/5`, `EMPTY_GRACE_MIN=15`) → `systemctl restart nginx`; `git ls-files` no contiene `cache-health-monitor` ni `cache_health` (0 archivos); está documentado en `docs/REA_DIAGNOSIS_AND_FIXES.md:23,79-102,188` y `audit/alignment/2026-10-25/40-vps/VPS_INVENTORY.md:174-179`.

**Riesgo:** hay **4 mecanismos en el repo con la misma clase de defecto** (auto-restart sin backoff ni cap ni alerta), con cadencia medida por sus propias constantes:

| Mecanismo | `archivo:línea` | Cadencia | Defecto |
|---|---|---|---|
| Sentinel: nginx | `vps/sentinel/ape-sentinel-vps.sh:96-102` (+ bucle `:225-235`, `POLL=10`) | **10 s** | `nginx -t && systemctl start nginx \|\| systemctl restart nginx` → si `nginx -t` **falla**, el `\|\|` **igual reinicia** nginx con config rota: intento cada 10 s indefinido. Guarda ilusoria |
| Sentinel: xray | `…:130-133` | **10 s** | `if ! ss -tlnp \| grep -q ':8443'; then restart` → si xray está vivo pero mal configurado, `restart` cada 10 s sin límite |
| Sentinel + watchdog: WireGuard | `…:69-72, 86-90` y `netshield-watchdog.sh:86-95` | **10 s / 15 s** | `wg-quick down` + `up` con `sleep 1..3` dentro del ciclo → **flap de ruta** en bucle mientras el handshake siga >180 s |
| Meta-watchdog: nginx | `_vps_stage/watchdog/ape-meta-watchdog.sh:35-43` (+ timer `OnUnitActiveSec=60s`) | **180 s** (3 fallos × 60 s) | tras `reload`/`restart` resetea el contador a 0 (:42) y no hay cooldown/cap → si el health de `:8088` sigue caído, reload/restart **cada 180 s**; además `exit 0` (:45) hace el fallo **invisible** para systemd |

**Comparación honesta:** los 4 usan un **health check real** (HTTP `:8088`, `pgrep`, `ip link`, `ss`), no la condición «caché vacía» del `cache-health-monitor`. El defecto no es el disparador, es la **ausencia de límite y de aviso**.

---

## 5. S7 · Mapa de cobertura 365 días (cubierto vs no cubierto)

**Cubierto (auto-reparación con chequeo concreto):** plano metadata nginx `127.0.0.1:8088/_ape/health` (302/meta-watchdog, 60 s) · presencia de proceso nginx (sentinel 10 s, watchdog 15 s) · antigüedad de handshake WireGuard >180 s (3 mecanismos) · xray `:8443` · unbound · RAM>90 %/disco>85 % (sentinel `:42-53`) · deriva sysctl/BBR/DSCP re-aplicada (sentinel `:147-164`) · reglas `iptables … SURFSHARK_MARK` (watchdog `:149-158`) · guardian ADB del device (sentinel `:168-188`) · **liveness del worker `ape-ingest` vía `WatchdogSec=15`+`sd_notify`** (el único contrato correcto).

**NO cubierto (verificado por ausencia):**

| Hueco | Evidencia de la ausencia |
|---|---|
| **0 canales de alerta** — todo auto-heal es silencioso (sólo `journal`/`logger`) | `git grep -l 'telegram\|slack\|pushover\|ntfy\|sendmail\|mailx\|smtp' -- '*.sh' '*.service' '*.py'` → **0 archivos** |
| **0 renovación TLS** (Let's Encrypt 90 d) | `git grep 'certbot\|acme\.sh\|renew' -- '*.service' '*.timer'` → **0** |
| **0 liveness de los propios watchdogs** | ningún `WatchdogSec` en `ape-sentinel.service`, `netshield-watchdog` sin `sd_notify`; candado no atómico `echo $$ > LOCKFILE` (`ape-sentinel-vps.sh:215-220`) sin `flock`/`trap` → PID reusado = «Running (pid=…)» y el watchdog **nunca arranca** |
| **0 métricas de watchdog** | único exportador: `vps/ape-realtime-guardian/ape_realtime_guardian/prometheus_exporter.py` (unidad sin health) |
| **0 verificación de backup/restore** | `vps/deploy/` tiene backup y rollback (`prisma-v2-deploy.sh:22,68,310-312`; `prisma-v2-rollback.sh`), pero **nada periódico** que pruebe el restore |
| **0 gate post-deploy** | `prisma-v2-deploy.sh:326-341`: imprime `NEW_503_COUNT` y los `http_code` de `:8099` y **no hace `exit 1`** si fallan → «soak test» sin veredicto |
| **0 chequeo de hora/NTP y de crecimiento de `/var/log`** | sólo truncado oportunista `truncate -s 10M` (`ape-sentinel-vps.sh:50`) y auto-rotado `tail -500` (`:26-27`) |
| **Health check placeholder** | `netshield-watchdog.sh:116-119`: el comentario declara «stuck workers (0 connections >60 s = zombie)» pero `conns` se calcula y **nunca se usa** |

---

## 6. S10 · Barrido de secretos (valor SIEMPRE redactado)

Método: `git grep -n -I -E` con patrón→tipo; el valor **no se imprime ni se copia**. Clase inferida sólo por **longitud/charset/palabras de plantilla** (nunca por el valor): `len` y «sin keyword de placeholder» ⇒ **probable secreto real**, no plantilla.

| # | Secreto (tipo) | `archivo:línea` | Clase medida | Valor |
|---|---|---|---|---|
| 1 | WireGuard `PrivateKey` | `IPTV_v5.4_MAX_AGGRESSION/backend/wg-surfshark.conf:8` | base64 44 chars, sin keyword de plantilla ⇒ **real** | `***` |
| 2 | WireGuard `PrivateKey` | `IPTV_v5.4_MAX_AGGRESSION/backend/wg-surfshark-br.conf:8` | idem | `***` |
| 3 | WireGuard `PrivateKey` | `IPTV_v5.4_MAX_AGGRESSION/net-shield/backups/backup_pre_stage1_20260422_045906/wg0.conf.BASELINE:2` | idem | `***` |
| 4 | WireGuard `PresharedKey` | `…/wg0.conf.BASELINE:31` | idem | `***` |
| 5 | Basic-auth de túnel (`chisel server … --auth <user>:<pass>`) | `IPTV_v5.4_MAX_AGGRESSION/ape-uhdx/_ENTREGA_20260521/vps_live_extracted/ape-uhdx-vps-bundle/systemd/ape-uhdx-chisel.service:6` | 33 chars, no-plantilla ⇒ **real** | `***` |
| 6 | WireGuard `PrivateKey` (en documentación) | `.agent/skills/firetv_wireguard_dns_immutable/SKILL.md:51` (+ duplicado `.agents/_archive_20260516_bogus_stubs/skills_bogus_stubs/firetv_wireguard_dns_immutable/SKILL.md:51`) | base64 44 chars | `***` |
| 7 | WireGuard `PresharedKey` (en documentación) | ídem `:58` | base64 44 chars | `***` |
| 8 | Credenciales Xtream en URL (`user:pass` en el path) | `IPTV_v5.4_MAX_AGGRESSION/frontend/channels_map.json:113` … **2 574 ocurrencias** en ese archivo | host 25 chars · `user` 10 chars · `pass` 10 chars · `stream_id` numérico ⇒ **real** | `***` |
| 9 | Credenciales Xtream en URL | `audit/alignment/2026-10-25/50-listas/tools/_raw_lists_audit.json:1324,1333,1349,1363,1477,1486` (**13**) | idem | `***` |
| 10 | Credenciales Xtream en URL (código) | `…/backend/omega_ecosystem_v5.1/fallback_proxy.php:55,56` y `v5.2/…:55,56` (+ 2 copias en `backup_master…`) | idem | `***` |
| 11 | `Authorization: Bearer` (doc) | `IPTV_v5.4_MAX_AGGRESSION/frontend/OTT_NAVIGATOR_SETUP.md:53,168` (+ copia `backup_master…/frontend/OTT_NAVIGATOR_SETUP.md:53,168`) | 11 chars, **clase no determinada** | `***` |
| 12 | Credenciales Xtream en URL (salida suelta) | `chname_result.txt:2` | idem | `***` |

**Negativos verificados:** `-----BEGIN … PRIVATE KEY-----` = **0** · `AKIA[0-9A-Z]{16}` (AWS) = **0** · `HEX_ASSIGN` (key/secret/token 32-64 hex) = **0**.

**`.gitignore` (159 líneas) — huecos frente a lo encontrado arriba:**

| Regla | Línea | Efecto real |
|---|---|---|
| `.env` | `:42` | cubre `.env` exacto, **no** `watchdog.env` |
| `*.pem` / `*.key` | `:43-44` | OK: **0** `.pem`/`.key` trackeados |
| «APE config recovery artifacts (contienen credenciales REALES — NUNCA commitear)» | `:46-47` | la regla existe, pero **no nombra** `channels_map.json` ni `*.conf` → los 2 574 credenciales Xtream y las 3 claves WG **están trackeadas** |
| `**/secrets.*`, `ara.env`, `ara_token.txt`, `devices.conf` | `:141-146` | OK |

**`.env` trackeados (§7):** `IPTV_v5.4_MAX_AGGRESSION/ape-uhdx/_ENTREGA_20260521/vps_live_extracted/ape-uhdx-vps-bundle/etc_ape-uhdx/watchdog.env` = `.env` **real** versionado (8 claves: `ONN_ADDR`, `ADB_BIN`, `DAEMON_LOCAL/REMOTE`, `REMOTE_LOCK`, `STATE_DIR`, `LOG_FILE`, `ADB_TIMEOUT`); sin contraseñas ni claves, valores = IP LAN + rutas ⇒ **LOW** (higiene, no secreto). Plantillas: `…/vps/etc/watchdog.env.example` (×2), `frontend/backend_v15/.env.example` (×2), `vps/prisma/config/ara.env.example` — `ARA_TOKEN` (21 chars, sin keyword de plantilla) **no se pudo clasificar como plantilla** ⇒ tratar como secreto hasta verificación del owner.

---

## 7. S10 · Superficie de auth de endpoints (`vps/prisma/api/**`, 29 archivos)

| Endpoint | Gate | ¿Token? | ¿HMAC? | ¿TTL? | Veredicto |
|---|---|---|---|---|---|
| `prisma-control.php` (control: panic, toggle, reset) | `X-Prisma-Key` + `hash_equals` (`:50-51`) | sí | no | **no** | **FAIL**: **fail-open** si `/dev/shm/prisma_key.txt` no existe (`:43-45` → `return true`) o está vacío (`:47-49`); **cualquier** `Authorization: Bearer …` devuelve `true` sin validar (`:32-39`); CORS `*` (`:16`) |
| `ape-pull.php` (canal de comandos) | `Bearer` vs `sha256(token)` en archivo, `hash_equals` (`:46-49`), 403 unificado sin oráculo (`:12`) | sí (hasheado) | no | **no** | **PASS** (el mejor del repo); rate-limit y `access_log off` en `vps/nginx/snippets/prisma-ape-pull-location.conf:10-19`. Falta expiración/rotación |
| `qoe-flush.php` | `REMOTE_ADDR ∈ {127.0.0.1, ::1}` (`:56-62`) | no | no | no | **PASS condicionado**: coherente **sólo** porque el listener es loopback (`vps/nginx/conf.d/prisma-floor-lock.conf:63` `listen 127.0.0.1:8099;` + location `:84-88`) |
| `channel-pq-incident.php` | **ninguna** (`:1-30`; sólo sanea `channel_id`) | no | no | no | **FAIL**: cualquier cliente puede blacklistear un canal PQ→SDR (escritura de estado sin auth) |
| `channel-hdcp-incident.php`, `device-register.php`, `channel-*-bulk.php`, `manifest-4k.php`, `prisma-adb-*.php`, `content-steering.php` | **ninguna** (0 primitivas de auth) | no | no | no | **FAIL** (grupo): endpoints de escritura/telemetría sin gate |
| `prisma-public-api-locations.conf:26-103` | sin auth; sólo `limit_req` | no | no | no | **FAIL estructural**: expone 3 APIs internas (`/prisma/api/sentinel-status`, `/prisma/api/bandwidth-reactor`, `/quality-realtime`) con `proxy_pass 127.0.0.1:8099` → «localhost-only» deja de ser local: el upstream ve loopback aunque el cliente sea Internet |
| `prisma-conviva-event.conf:19-27` | POST público + `limit_req 10r/s` + CORS acotado | no | no | no | **WARN** (telemetría, body ≤16 k) |
| `ape-wake.php` | `REMOTE_ADDR` (1 uso) | no verificado | no | no | **NOT_RUN** (gate no leído en detalle) |

---

## 8. S10 · Catálogos/listas que arrastran credenciales de proveedor

- **`frontend/channels_map.json`: 2 574 URLs** con `user:pass` en el path (patrón `https?://host:port/u/p/id`), trackeadas en git. Es el «catálogo» del punto 9 del mandato y el mayor pasivo del repo.
- `vps/production_mirror/**` y `backup_master_v5.4_phantom_engine/**` replican `fallback_proxy.php` con URLs credenciales (`:55-56`).
- Contraste: `audit/alignment/2026-10-25/20-json/SECRETS_SCAN.md:114` afirma «ninguno contiene credenciales (0 campos `username`/`password`)» — **cierto para campos JSON**, **falso para credenciales en el path de la URL**: el escaneo previo sólo miró claves, no la forma Xtream. Disenso registrado.

---

## 9. S10 · Las 9 trampas EXTHTTP y los headers tóxicos como vector de bloqueo

**Doctrina y censo previo:** `audit/alignment/2026-10-25/50-listas/LISTS_HEADERS_TRAPS.md:26-38` enumera las 9 trampas estructurales; la **#9** son exactamente los 6 headers prohibidos (`:38`) y `:44` los cuenta por archivo. `CLAUDE.md` los lista como causa de «400/EOF/304+0B/403».

**Enforcement existente (bueno):** `frontend/js/ape-v9/ape-field-homologator.js:98` define el mapa `TOXIC` (7 claves: `range`, `if-none-match`, `if-modified-since`, `te`, `priority`, `upgrade-insecure-requests`, `dnt`) y `:196-198` los **cuarentena** como `_toxic.<k>` con `blocked: true`.

**Deriva medida (3 hallazgos):**
1. **`APE_ALL_PROFILES_OPTIMIZED.json`: 84 sitios de emisión** — 12 bloques de perfil × 7 headers: `:146` `Range`, `:147` `If-None-Match`, `:148` `If-Modified-Since`, `:134` `TE`, `:156` `Priority`, `:130` `Upgrade-Insecure-Requests`, `:128` `DNT`, y las 11 repeticiones en 420/799/1037/1367/1514/1858/2132/… Coincide **exactamente** con el censo previo `audit/alignment/2026-10-25/20-json/SECRETS_SCAN.md:126` (84). **Consumo en runtime: no encontrado** (sólo lo **genera** `optimize-profiles.js:17` y lo leen herramientas de auditoría) ⇒ **riesgo latente**, no vector demostrado hoy.
2. **`ape-profiles-config.js` (cargado en `frontend/index-v4.html:3906`) conserva los valores tóxicos literales** en `DEFAULT_HEADER_VALUES:3994` → `:4017` `Upgrade-Insecure-Requests`, `:4018` `TE`, `:4023` `Range`, `:4024` `If-None-Match`, `:4025` `If-Modified-Since`, `:4040` `Priority`; esa tabla se usa como **fallback de valor** (`:4406`, `:5558`, `:5564`) ⇒ si un perfil vuelve a listar el nombre del header, el valor tóxico entra **automáticamente**. Las **75** anotaciones `C8 (2026-05-11)` (**72** con «removed (toxic)», desde `:61`) son **comentarios**: documentan la retirada en las listas de perfil, pero **no** erradican los valores de la tabla de defaults.
3. **Contradicción interna `DNT`**: el homologador lo marca tóxico (`:98`) pero se emite activo en **12 perfiles** + el default: `ape-profiles-config.js:457,741,1124,1375,1725,1869,2232,2503,2869,3137,3495,3773` y `:4015`, más `headers-matrix-v9.js:132` y `m3u8-typed-arrays-ultimate.js:4828`.

**Riesgo como vector de bloqueo:** trampa #9 = 304+0B/EOF en okhttp (OTT Navigator/TiviMate/ExoPlayer) y `Priority`/`TE` = rechazo de parsers Xtream; una sola reincorporación desde la tabla de defaults reintroduce el fallo **sin que ningún test lo detecte** (no hay test que audite la lista emitida contra los 6 prohibidos).

---

## 10. S7 — Veredicto / Hechos / Riesgos / Huecos y NO-RUN / Disensos / Tareas

**Veredicto S7: WARN (repo) · BLOCKED (operación 365 d).** El repo tiene **1 contrato de unidad correcto** (`ape-ingest@`), **1 huérfana** (`upload-server` ×5) y **4 mecanismos de auto-restart sin límite ni alerta**; la operación a 365 días **no está cubierta** porque no existe ningún canal de aviso ni renovación TLS versionada.

**Hechos:** §2 (40 unidades → **34** resuelven a archivo del repo; 5 archivos huérfanos + 1 binario externo), §3 (`StartLimit*` en sección equivocada en 4 unidades; `WatchdogSec` sin `sd_notify` en 1), §4 (bucle 20 min **no** está en repo; 4 equivalentes con cadencia 10 s/15 s/180 s), §5 (8 huecos de cobertura verificados por ausencia). **Riesgos:** (R1) `netshield-watchdog` se auto-reinicia cada ~125 s y pierde contadores `CYCLES/REPAIRS`; (R2) sentinel reinicia nginx **con config inválida** por precedencia `A && B || C`; (R3) flap de WireGuard en bucle si el handshake no se recupera; (R4) `upload-server` no es reproducible desde el repo.

**Huecos y NO-RUN:** `systemctl show/status`, `systemd-analyze verify`, `journalctl`, `nginx -t`, `wg show`, `adb` = **NOT_RUN** (no hay Linux/systemd en el host de auditoría; tocar el VPS está prohibido por `iptv-vps-touch-nothing`). `ape-realtime-guardian --config` = **BLOCKED** (config no versionada).

**Disensos:** (D1) `ape-supervisor@.service:15-20` afirma que `ape-ingest@` no debe llevar `WatchdogSec`; el código lo contradice y está bien hecho — **gana el código**, se corrige el comentario. (D2) `ape-meta-watchdog.sh:45` `exit 0` «para no generar ruido» es incompatible con 365 días: sin `Result=failed` no hay señal.

**Tareas propuestas:** (T1) mover `StartLimit*` a `[Unit]` en las 4 unidades; (T2) `netshield-watchdog`: o `sd_notify`/`WATCHDOG=1` real o quitar `WatchdogSec`; añadir cooldown+cap a los 4 auto-restarters; (T3) reintroducir `upload-server` como fuente+build o borrar las 5 copias; (T4) 1 canal de alerta mínimo (aunque sea `logger` + `OnFailure=`) y unidad `certbot renew` versionada; (T5) `ape-sentinel-vps.sh`: `flock`, `trap`, y `nginx -t` con `if` real (no `A && B || C`).

---

## 11. S10 — Veredicto / Hechos / Riesgos / Huecos y NO-RUN / Disensos / Tareas

**Veredicto S10: FAIL.** Hay **credenciales reales trackeadas** (3 claves WireGuard + 1 PSK + 1 basic-auth de túnel + 2 574 URLs Xtream con `user:pass`) y **auth fail-open** en el endpoint de control (`prisma-control.php`), más un grupo de endpoints de escritura sin gate. Ningún valor se imprimió ni se copió: sólo `archivo:línea` + tipo + `***`.

**Hechos:** §6 (12 hallazgos, 3 clases «reales» verificadas por longitud/charset, 3 negativos en 0), §7 (29 endpoints: 1 PASS, 1 PASS condicionado, 2 FAIL, 1 grupo FAIL sin auth, 1 FAIL estructural de proxy), §8 (catálogo con 2 574 credenciales y disenso con el escaneo previo), §9 (84 sitios tóxicos en el SSOT/export + 6 valores tóxicos como default + 13 emisiones de `DNT`).

**Riesgos:** (R5) rotación de las 3 claves WG y del `--auth` de chisel (los `conf` **no** están en `.gitignore`); (R6) `channels_map.json` filtrado = compromiso total de los proveedores; (R7) fail-open de `prisma-control` = control total del plano si el archivo de clave desaparece (p. ej. `/dev/shm` se vacía al reiniciar → **el estado por defecto es ABIERTO**); (R8) reincorporación accidental de la trampa #9 desde `DEFAULT_HEADER_VALUES`.

**Huecos y NO-RUN:** clasificación del `Bearer` de `OTT_NAVIGATOR_SETUP.md:53,168` (11 chars) y del `ARA_TOKEN` de `ara.env.example` = **NOT_RUN** (no se puede decidir sin leer el valor, y leerlo/imprimirlo está prohibido); explotabilidad real de los endpoints = **NOT_RUN** (prohibido atacar/fuzzear); `prisma-adb-*.php` no leídos en detalle.

**Disensos:** (D3) con `SECRETS_SCAN.md:114` («ninguno contiene credenciales»): su criterio (campos `username`/`password`) no cubre credenciales embebidas en el path — **mi medición las encuentra en 2 574 sitios** de `channels_map.json`. (D4) con `prisma-control.php:37` («JWT present — trust it»): confiar sin validar no es un gate.

**Tareas propuestas:** (T6) purgar del índice git + rotar: `backend/wg-*.conf`, `wg0.conf.BASELINE`, `ape-uhdx-chisel.service:6`, y añadir `*.conf`/`channels_map.json` a `.gitignore`; (T7) `channels_map.json` fuera del repo o cifrado con clave fuera de git; (T8) cerrar el fail-open de `prisma-control` (si falta la clave → `503`, nunca `200`) y validar el Bearer con `ape_jwt_auth.php`; (T9) auth en `channel-*-incident/bulk`, `device-register`, `prisma-adb-*` (token por device o `allow 127.0.0.1`+`satisfy`); (T10) vaciar de los 6 tóxicos `DEFAULT_HEADER_VALUES` y añadir test que falle si la lista emitida contiene cualquiera de los 7 (incluido `DNT`, o sacarlo del mapa `TOXIC`).
