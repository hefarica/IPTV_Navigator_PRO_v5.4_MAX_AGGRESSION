# APE UHDX — TEST PLAN (pruebas de aceptación del Prompt Maestro)

Ejecutar TODAS en verde antes de cerrar. ONN_ADDR = IP del ONN por Xray/VPN.

| # | Prueba | Pasos | Verde si |
|---|---|---|---|
| 1 | Kill test | `adb -s $ONN shell "kill -9 \$(cat /data/local/tmp/ape-uhdx-sentinel.lock)"` → esperar 1 ciclo (≤60s) | El watchdog VPS lo revive; `last-vps-watchdog.json` = `resurrected`; lock con PID vivo |
| 2 | Reboot test | Reiniciar ONN, esperar ADB | El watchdog re-push + relanza; daemon vuelve |
| 3 | Drift test | `adb shell settings put global ai_sr_level 0` (o peak) | El daemon corrige al valor del perfil en ≤PQ_INTERVAL |
| 4 | Manifest test | Cambiar hash + quality-manifest.json en VPS | El daemon descarga, valida y aplica (log `MANIFEST: downloaded`) |
| 5 | VPN test | Simular caída tun0 | `update_network_metrics` dispara `trigger_vps_recovery wg_failover` + log SRE |
| 6 | RAM test | Forzar baja RAM | `soft_cleanup`/`hard_cleanup` sin matar player ni VPN (lista PROTECTED) |
| 7 | Nginx test | `nginx -t`; `curl https://VPS/ape-uhdx/last-vps-watchdog.json` | nginx ok; JSON servido; sin secretos; sin exec |
| 8 | No-duplicate test | Lanzar `daemon` dos veces | 2da instancia sale por `acquire_lock`; 1 solo PID real (PPID=1) |
| 9 | Legacy collision | Tras arrancar UHDX | `ape-pq-guardian` y `ape-sentinel` viejos NO activos; sus locks borrados |
| 10 | Evidence | Recolectar | salida `status`, `journalctl -u ape-uhdx-watchdog`, nginx logs, JSON de estado |

## Comandos de verificación rápida
```bash
# ONN (via adb por Xray):
adb -s $ONN shell "/data/local/tmp/ape-uhdx-sentinel.sh status"
adb -s $ONN shell "ps -A -o PID,PPID,ARGS | grep ape-uhdx | grep -v grep"   # 1 daemon PPID=1
adb -s $ONN shell "ls /data/local/tmp/ape-*guardian* /data/local/tmp/ape-sentinel.sh 2>/dev/null"  # legacy off

# VPS:
systemctl status ape-uhdx-watchdog.timer
journalctl -u ape-uhdx-watchdog.service -n 50 --no-pager
cat /var/www/ape-uhdx/last-vps-watchdog.json
nginx -t

# Imagen (decisión operador): perfil + valores PQ/HDR vivos
adb -s $ONN shell "settings get global peak_luminance; settings get global hdr_conversion_mode"
```

## Doctrina anti-incidente (lecciones 2026-05-21)
- **1 conexión = la TV del usuario.** NO hacer curls/probes al proveedor desde el VPS
  ni desde la PC mientras se reproduce (cada uno = 2da conexión → 403).
- **Nunca dejar el ONN sin daemon** corriendo (mata al ladrón de BW → evita freeze).
- Contar daemons reales por **PPID=1** (hijos transitorios PPID=daemon NO son duplicados).
- Un cambio a la vez, verificar, rollback listo.
