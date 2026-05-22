# APE UHDX — ROLLBACK (volver al estado anterior sin dañar ONN ni VPS)

## A. Rollback en el VPS (desactivar el nuevo watchdog)
```bash
sudo systemctl disable --now ape-uhdx-watchdog.timer
sudo systemctl stop ape-uhdx-watchdog.service
# (opcional) quitar el include nginx y recargar
sudo nginx -t && sudo systemctl reload nginx
```
Esto detiene el watchdog nuevo. El daemon del ONN sigue corriendo (no se toca).

## B. Restaurar los daemons legacy (sentinel + pq-guardian + su watchdog)
> Solo si se decide volver al esquema de 3 procesos.
```bash
# En el ONN (via adb por Xray): detener el unificado y relanzar legacy
adb -s $ONN shell "/data/local/tmp/ape-uhdx-sentinel.sh stop"
adb -s $ONN shell "[ -f /data/local/tmp/ape-sentinel.sh.disabled ] && mv /data/local/tmp/ape-sentinel.sh.disabled /data/local/tmp/ape-sentinel.sh"
adb -s $ONN shell "[ -f /data/local/tmp/ape-pq-guardian.sh.disabled ] && mv /data/local/tmp/ape-pq-guardian.sh.disabled /data/local/tmp/ape-pq-guardian.sh"
adb -s $ONN shell "nohup sh /data/local/tmp/ape-sentinel.sh daemon >/dev/null 2>&1 &"
adb -s $ONN shell "nohup sh /data/local/tmp/ape-pq-guardian.sh daemon >/dev/null 2>&1 &"
```
(El watchdog legacy en la PC `APE_UHDX_Watchdog` / `ape-pq-watchdog.ps1` re-enable si aplica.)

## C. Garantías de seguridad del rollback
- Los scripts viejos se **renombran a `.disabled`/`.bak`**, NO se borran (reversible).
- No se eliminan locks de procesos vivos sin antes detenerlos con cooldown.
- **Nunca** dejar el ONN sin un daemon que mate al ladrón de BW (riesgo freeze):
  si se detiene el unificado, relanzar legacy en el MISMO paso.
- No correr curls/probes al proveedor durante el rollback (1 conexión = la TV).

## D. Verificación post-rollback
```bash
adb -s $ONN shell "ps -A -o PID,PPID,ARGS | grep -E 'ape-sentinel|ape-pq|ape-uhdx' | grep -v grep"
adb -s $ONN shell "settings get global peak_luminance; settings get global hdr_conversion_mode"
# Confirmar reproducción estable en el TV (zap real), sin freeze.
```
