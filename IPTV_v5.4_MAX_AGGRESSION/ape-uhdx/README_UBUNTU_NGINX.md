# APE UHDX — Daemon Sentinel Unificado + VPS Ubuntu/Nginx

Arquitectura única (segun el Prompt Maestro):

- **ONN 4K**: un solo daemon `/data/local/tmp/ape-uhdx-sentinel.sh` (fusiona anti-freeze,
  RAM, VPN/tun0, TCP tuning, quality-manifest, AI/PQ/HDR, heartbeat, SRE). Lock único
  `ape-uhdx-sentinel.lock`. Absorbe sentinel + pq-guardian legacy.
- **VPS Ubuntu**: una sola tarea programada por **systemd timer**
  (`ape-uhdx-watchdog.timer`, cada 1 min) → `ape-uhdx-vps-watchdog.sh` revive el daemon
  del ONN por **ADB sobre el túnel Xray/VPN** (NO PowerShell, NO Task Scheduler).
- **Nginx**: solo publica estado/manifest JSON en `/ape-uhdx/`. NO ejecuta adb ni root.

> Conexión ONN↔VPS = **Xray**. La IP del ONN alcanzable por ese túnel va en
> `/etc/ape-uhdx/watchdog.env` (`ONN_ADDR`). No se hardcodea en el código.

## Estructura
```
ape-uhdx/
  onn/ape-uhdx-sentinel.sh            # daemon unico (corre en el ONN)
  vps/bin/ape-uhdx-vps-watchdog.sh    # watchdog (systemd, en el VPS)
  vps/systemd/ape-uhdx-watchdog.service
  vps/systemd/ape-uhdx-watchdog.timer
  vps/nginx/ape-uhdx-location.conf    # include en el server{443}
  vps/www/heartbeat.php               # sink heartbeat (opcional)
  vps/etc/watchdog.env.example        # -> /etc/ape-uhdx/watchdog.env
  vps/install-vps-ubuntu.sh
  README_UBUNTU_NGINX.md  TEST_PLAN.md  ROLLBACK.md
```

## Instalación (VPS Ubuntu)
```bash
sudo bash vps/install-vps-ubuntu.sh
sudo nano /etc/ape-uhdx/watchdog.env          # ONN_ADDR = IP del ONN por Xray/VPN
# incluir en el server 443:  include /etc/nginx/snippets/ape-uhdx-location.conf;
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl enable --now ape-uhdx-watchdog.timer
sudo systemctl start ape-uhdx-watchdog.service
journalctl -u ape-uhdx-watchdog.service -n 100 --no-pager
```

## Comandos del daemon (en el ONN)
```bash
/data/local/tmp/ape-uhdx-sentinel.sh status
/data/local/tmp/ape-uhdx-sentinel.sh profile-auto   # auto SDR/HDR por EDID
/data/local/tmp/ape-uhdx-sentinel.sh profile-sdr     # forzar SDR (peak 1000)
/data/local/tmp/ape-uhdx-sentinel.sh profile-hdr     # forzar HDR (peak 8000)
/data/local/tmp/ape-uhdx-sentinel.sh manifest-now    # aplicar manifest/PQ ya
/data/local/tmp/ape-uhdx-sentinel.sh stop
```

## Endpoints de estado (Nginx)
- `/ape-uhdx/last-vps-watchdog.json` — último ciclo del watchdog VPS
- `/ape-uhdx/last-sentinel.json` — último heartbeat del daemon ONN
- `/ape-uhdx/quality-manifest.json` — manifest activo

## Nota PQ/HDR (decisión del operador)
El daemon trae perfil `auto`. Para Samsung 2017 (panel ~1000 nits) `profile-sdr`
(peak 1000) suele dar imagen más brillante; `profile-hdr` usa `peak_luminance=8000`.
El valor 8000 se mantiene por mandato del operador — el operador decide el perfil.
