# APE UHDX Unified Design

Archivos incluidos:

1. `ape-uhdx-sentinel.sh`
   - Corre en el ONN 4K: `/data/local/tmp/ape-uhdx-sentinel.sh`
   - Unifica anti-freeze, VPN/red, TCP tuning, quality-manifest, AI/PQ/HDR, heartbeat y SRE triggers.
   - Reemplaza los loops separados de `ape-sentinel.sh` y `ape-pq-guardian.sh`.
   - Usa un solo lock: `/data/local/tmp/ape-uhdx-sentinel.lock`.

2. `APE_UHDX_Watchdog_Unified.ps1`
   - Corre en Windows como tarea programada cada 1 minuto.
   - Verifica el lock/PID del daemon unificado.
   - Re-push + chmod + relaunch si el ONN reinicia o el daemon muere.
   - Envía heartbeat al VPS.

Instalación rápida:

```powershell
adb connect 192.168.10.28:5555
adb push .\ape-uhdx-sentinel.sh /data/local/tmp/ape-uhdx-sentinel.sh
adb shell "chmod 755 /data/local/tmp/ape-uhdx-sentinel.sh && /data/local/tmp/ape-uhdx-sentinel.sh install"
adb shell "nohup /data/local/tmp/ape-uhdx-sentinel.sh daemon >/dev/null 2>&1 &"
powershell -ExecutionPolicy Bypass -File .\APE_UHDX_Watchdog_Unified.ps1 -InstallTask
```

Comandos útiles:

```bash
/data/local/tmp/ape-uhdx-sentinel.sh status
/data/local/tmp/ape-uhdx-sentinel.sh profile-auto
/data/local/tmp/ape-uhdx-sentinel.sh profile-sdr
/data/local/tmp/ape-uhdx-sentinel.sh profile-hdr
/data/local/tmp/ape-uhdx-sentinel.sh manifest-now
/data/local/tmp/ape-uhdx-sentinel.sh stop
```

Notas:
- El perfil `auto` cae a SDR seguro si no puede confirmar HDR por EDID/dumpsys.
- En SDR seguro: `hdr_conversion_mode=0`, `always_hdr=0`, `peak_luminance=1000`.
- En HDR confirmado/forzado: `hdr_conversion_mode=1`, `always_hdr=1`, `peak_luminance=8000`.
- El daemon bloquea que el manifest externo fuerce HDR si el perfil detectado es SDR.
