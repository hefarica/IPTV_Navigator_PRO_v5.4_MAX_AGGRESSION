# ARA + URL-2 — README (Council-safe cherry-pick)

> README dedicado de la integración ARA/URL-2. **No** reemplaza el README raíz del proyecto (OMEGA-NO-DELETE).

## Qué es el paquete
`APE_AUTONOMOUS_VPS_DAEMON_URL2_COUNCIL_SAFE_20260616.zip` propone un daemon VPS autónomo + un agente
on-device (ARA) que mueve política/QoE por **URL-2** (bus de control paralelo al stream). El **Council 13 PhD**
bloqueó el instalador y aprobó **solo un cherry-pick additivo**.

## Qué se ADOPTA (additivo, gateado, probado syntax)
1. `ape_mesh.php` (append): `ape_insert_delta` + tablas `policy_deltas`/`ara_heartbeats` sobre **conviva.db** + anti-flap.
2. `events-sse.php`: `/ara/events` SSE con **auth Bearer** (503 si `ARA_TOKEN` vacío; sin `?token=`).
3. `phase_g_delta_hook.php` + bloque **gateado** en `conviva-event.php` (rollback PQ→SDR delta).
4. `prisma-ara-events.conf`: snippet nginx (socket `php8.3-fpm`, buffering off).
5. `ape-qoe-agent.sh` (merge): SSE-down + FSM + allowlist + OFFLINE_CACHE.
6. `bootstrap_ara_android.sh` + `ara.env.example`.

## Qué se RECHAZA
`install.sh`, `cp -a /`, Go como canon, systemd-root nuevos, `ape_vps_supervisor.py`, `ape_url2.db`,
override total de `conviva-event`/`channel-pq-*`, `minimal_post_processing_allowed`, endpoints sin auth, `?token=`.

## Cómo instalar (vía cherry-pick — NADA automático)
1. **Deploy VPS** (cuando lo autorices): `tools/cicd/deploy_vps.sh` (backup + `nginx -t`/`php -l` + health + rollback).
   Los archivos están en `tools/cicd/vps_deploy_map.json` (post=none; activación manual abajo).
2. **Activar** (operador): exponer `ARA_TOKEN` al pool php-fpm; añadir `include snippets/prisma-ara-events.conf;`
   al server-block + `nginx -t` + reload.
3. **Bootstrap del ARA** (device autorizado): ver [`ARA_AUTO_INSTALL_REALITY_AND_BOOTSTRAP.md`](ARA_AUTO_INSTALL_REALITY_AND_BOOTSTRAP.md).

## Prerrequisitos del ARA
Bootstrap autorizado (ADB RSA / helper APK / agente ya en `/data/local/tmp` / mDNS). Sin ellos → `ARA_BOOTSTRAP_REQUIRED`.

## Qué NO puede hacer una playlist sola
Instalar apps, dar permisos, abrir ADB, habilitar wireless-debug, ejecutar código. El VPS prepara URL-2 y deltas,
pero el device aplica solo settings allowlisted vía un agente **previamente autorizado**. Sin mentiras de auto-install.

## Más
Auditoría: [`COUNCIL_13_PHD_AUDIT_AND_CHERRY_PICK.md`](COUNCIL_13_PHD_AUDIT_AND_CHERRY_PICK.md) ·
Plan: [`OMEGA_ARA_MASTER_PLAN.md`](OMEGA_ARA_MASTER_PLAN.md) ·
Arquitectura: [`SYSTEM_ARCHITECTURE_FULL.md`](SYSTEM_ARCHITECTURE_FULL.md) ·
Preflight: [`superpowers/reports/ARA_COUNCIL_SAFE_PREFLIGHT.md`](superpowers/reports/ARA_COUNCIL_SAFE_PREFLIGHT.md).
