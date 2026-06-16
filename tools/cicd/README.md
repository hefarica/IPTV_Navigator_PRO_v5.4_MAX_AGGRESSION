# CI/CD — IPTV-APE VPS

Pipeline **híbrido** para enviar actualizaciones al VPS de producción (`178.156.147.234`) de forma reproducible, gateada y reversible. Respeta la doctrina: `iptv-vps-touch-nothing`, `omega-no-delete`, `autopista` (sin breakers), `SHIELDED` (URLs verbatim).

```
   ┌─────────────── CI (GitHub Actions, automático, sin secretos) ───────────────┐
   │  push / PR ─▶ node -c · php -l · py_compile · json · doctrina (m3u8) ─▶ ✅/❌ │
   │              (.github/workflows/ci-validate.yml — NUNCA toca el VPS)         │
   └─────────────────────────────────────────────────────────────────────────────┘
                                      │  (verde)
                                      ▼
   ┌─────────── CD (local, lo disparas TÚ — la SSH key se queda en tu PC) ────────┐
   │  deploy_vps.ps1 / .sh  guiado por  vps_deploy_map.json                       │
   │  1 pre-flight (df ≥1.5G, health baseline)                                    │
   │  2 backup remoto fechado  (/root/ape-deploy-rollback/<ts>/)                  │
   │  3 push atómico scp→tmp→mv  (SIN --delete)                                   │
   │  4 lint remoto  php -l · nginx -t                                            │
   │  5 reload nginx (1 sola vez)                                                 │
   │  6 verify health  (no debe quedar 'critical')                               │
   │  7 auto-rollback si algo falla  +  log JSON en .agents/reports/             │
   └─────────────────────────────────────────────────────────────────────────────┘
```

## Archivos

| Archivo | Rol |
|---|---|
| `vps_deploy_map.json` | **Fuente de verdad** del mapeo repo→VPS. El motor solo toca lo que está aquí y nunca toca `no_touch`. |
| `deploy_vps.sh` | Motor de despliegue (bash; `scp`+`ssh`+`curl`; sin rsync/jq). |
| `deploy_vps.ps1` | Entry-point Windows (localiza bash y delega en `.sh`). |
| `validate_local.sh` / `.ps1` | Gate de doctrina + sintaxis (read-only). Lo mismo que corre el CI. |
| `../../.github/workflows/ci-validate.yml` | CI de validación en push/PR. |

## Uso (CD)

```powershell
# 1) Ver el plan SIN tocar nada (recomendado siempre primero)
.\tools\cicd\deploy_vps.ps1 -WhatIf

# 2) Desplegar solo lo que cambiaste en git (lo más común)
.\tools\cicd\deploy_vps.ps1 -Changed

# 3) Desplegar targets concretos por id del manifiesto
.\tools\cicd\deploy_vps.ps1 -Only php-prisma-ape-match,lua-codec-cascade

# 4) Todo lo habilitado (con confirmación)
.\tools\cicd\deploy_vps.ps1 -All
```

Equivalente en bash / Linux / Git-Bash:

```bash
bash tools/cicd/deploy_vps.sh --whatif
bash tools/cicd/deploy_vps.sh --changed
bash tools/cicd/deploy_vps.sh --only php-prisma-ape-match --yes
```

## Cómo añadir un archivo nuevo al deploy

Edita `vps_deploy_map.json` → agrega un objeto a `targets`:

```json
{
  "id": "php-prisma-nuevo-endpoint",
  "src": "IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/nuevo-endpoint.php",
  "dest": "/var/www/html/prisma/api/nuevo-endpoint.php",
  "type": "php",          // php | lua | nginx-conf | json | sh | service
  "post": "none",          // none | nginx-reload
  "enabled": true
}
```

- `type` decide el lint (php→`php -l`, json→`json.tool`, js→`node -c`).
- `post: nginx-reload` ⇒ tras subirlo se corre `nginx -t` y, solo si pasa, `systemctl reload nginx`.
- Si el `dest` cae bajo `no_touch` el motor lo rechaza (p.ej. `iptv-intercept.conf` del Fire TV).

## Garantías de seguridad (doctrina)

- **Backup antes de tocar**: cada `dest` existente se copia a `/root/ape-deploy-rollback/<ts>/` + dump `nginx -T`.
- **Atómico**: `scp` a `<dest>.deploytmp` y `mv -f` (rename atómico). Nunca un archivo a medias.
- **No-delete**: jamás se borra contenido del VPS (sin `rsync --delete`). Cumple `omega-no-delete`.
- **Auto-rollback**: fallo en push/lint/`nginx -t`/verify ⇒ restaura backup + reload + re-verify; corrida marcada `FAIL` en el log.
- **Pre-flight de disco**: aborta limpio si `<1.5 GB` libres (el estado que tuvo el VPS el 2026-06-14).
- **Sin secretos en la nube**: la SSH key vive en tu PC; GitHub Actions solo valida.

## Pendiente de curar (sección `needs_review` del manifiesto)

`resolve_quality_unified.php` y `channels_map.json` tienen **copias múltiples** en el VPS (una dentro de `OMEGA_V5.4_PRODUCTION_UI_DO_NOT_TOUCH`). Los units ADB (`ape-player-autoinstall.sh`, `ape-wake-worker.service`) podrían apuntar al dispositivo, no al webroot. Decide el `dest` canónico antes de habilitarlos como `target`.
