# APE Buffer Governor v2.0 — F1 Shadow RUNBOOK (correcto, seguro)

> **Estado:** artefactos F1 en `master` (este doc + systemd unit corregido + 2 targets
> `enabled=false` en `tools/cicd/vps_deploy_map.json`). **NADA desplegado al VPS.**
> El deploy real es un paso LOCAL del operador, gateado por `iptv-vps-touch-nothing`.

## Qué es F1 Shadow (de verdad)
El Governor (binario Rust) corre como servicio systemd en **loopback `127.0.0.1:8090`**, con
caps de CPU/Mem y `OOMScoreAdjust=600` (el kernel lo mata antes que a nginx/Crystal). En F1
**NO decide tráfico, NO modifica manifiestos, NO cambia variantes**. Como mucho **recibe
telemetría** vía el sniper en `log_by_lua` (no bloqueante, `ngx.timer.at`). Cero impacto.

## Por qué se RECHAZÓ el paquete F1 entregado (no usar)
- `buffer_governor_f1.conf`: creaba un `server{ listen 80; server_name iptv-ape.duckdns.org }`
  **que eclipsa el shield de producción**, reintroducía **SSRF** (`proxy_pass http://$arg_upstream_host`),
  y un `server{ listen 8090 }` que **colisiona** con el binario Rust (también :8090).
- `deploy_f1_shadow.sh`: SSH `ubuntu`/`id_rsa` (incorrecto: es `root`/`id_ed25519_hetzner`),
  exigía un binario inexistente, dejaba el conf roto en `conf.d/` **sin `nginx -t`** (bomba de tiempo),
  y bypassaba el CD gateado (`vps_deploy_map.json` + `deploy_vps.sh`).
- **`CI verde` NO valida esto**: el gate solo chequea sintaxis (JS/PHP/PY/SH/JSON), no semántica nginx.

## Artefactos correctos (los de master)
- **Control conf:** `vps/buffer-governor/nginx/buffer_governor.conf` — control-only loopback `:8091`
  (`allow 127.0.0.0/8; deny all`) + shared dicts. **No crea server :80.** dest → `/etc/nginx/conf.d/buffer-governor.conf`.
- **systemd unit:** `vps/buffer-governor/systemd/ape-buffer-governor.service` — loopback :8090, capped.
  dest → `/etc/systemd/system/ape-buffer-governor.service`.
- **Lua:** `vps/buffer-governor/lua/*.lua` — con phase-guards `ngx.get_phase()` (F0.1). El **wiring**
  (llamar `intercept_*` desde el shield) es un cambio ACTIVO → solo en F2, observe-only 24-72h.

## Deploy real (LOCAL, operador, gate por gate — solo con "Aplica")
Pre-req: el binario **se compila EN el VPS** (el build local falla por WDAC os 4551):
```bash
# en el VPS (3 cores, sin GPU; tarda):
cd ~/ape-buffer-governor-rust && source ~/.cargo/env && cargo build --release
sudo install -m 0755 target/release/ape-buffer-governor /opt/ape-buffer-governor/ape-buffer-governor
sudo useradd -r -s /usr/sbin/nologin ape-auditor 2>/dev/null || true   # si no existe
```
Checklist `iptv-vps-touch-nothing` (TODOS deben cumplirse):
1. `nginx -T > /tmp/nginx-pre-$(date +%s).conf` (snapshot rollback).
2. Backup de cualquier `dest` existente (lo hace `deploy_vps.sh` → `/root/ape-deploy-rollback/<ts>/`).
3. Flip `enabled=true` SOLO en `buffer-governor-systemd` + `buffer-governor-control-conf` del deploy map.
4. `bash tools/cicd/deploy_vps.sh --only buffer-governor-systemd,buffer-governor-control-conf --whatif` (revisar plan).
5. `... --only ... --yes` → el motor hace scp atómico + `nginx -t` + (reload solo si pasa) + verify health + auto-rollback.
6. `sudo systemctl enable --now ape-buffer-governor` → `curl -s 127.0.0.1:8090/health` = OK.
7. **Validar con CANAL REAL** desde el Fire TV (zap 3-5, 30s c/u): el shield :80/:443 sigue idéntico (F1 no lo toca).
8. **Observe-only 24-72h**: `journalctl -u ape-buffer-governor -f`; RAM <150MB, CPU <10% idle; 0 caídas.

## Rollback
```bash
sudo systemctl disable --now ape-buffer-governor    # nginx/Crystal/shield intactos
sudo rm -f /etc/nginx/conf.d/buffer-governor.conf && sudo nginx -t && sudo systemctl reload nginx
# (deploy_vps.sh ya restaura backups + reload + re-verify ante cualquier fallo)
```

## Criterios para pasar a F2 (Advisory)
24h sin caídas · RAM <150MB / CPU <10% (shadow) · reportes consistentes · **cero** degradación del shield.

> **Doctrina:** `iptv-vps-touch-nothing`, `iptv-autopista-doctrine` (sin breaker/warmer/rate-limit),
> SHIELDED (URLs verbatim), FREEZELESS. CI **nunca** despliega al VPS (sin secretos, `contents: read`).
