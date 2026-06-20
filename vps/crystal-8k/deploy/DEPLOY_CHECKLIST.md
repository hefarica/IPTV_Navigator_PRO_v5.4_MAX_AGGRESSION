# Crystal v8.0 — GATED deploy checklist (run ON the VPS, in order)

> Nothing here is automatic. Each step is a manual gate under `iptv-vps-touch-nothing`.
> Local box CANNOT validate Lua/PHP/nginx (not installed) — all linting happens on the VPS.

## 0. Pre-flight (read-only)
- [ ] `bash deploy/preflight_gpu_check.sh` → note GPU backend + safe concurrency.
- [ ] Confirm `combined_body_filter.lua`, `vps_upstream_gate.lua`, the Xtream `upstream{}` blocks exist live.
- [ ] `git log --oneline -5` — confirm no same-day rollback is about to be deployed.

## 1. Dry-run (no changes)
- [ ] `bash deploy/deploy_crystal8k_gated.sh` (DRY-RUN) → review every "would:" line.

## 2. Inline agents + overlay (metadata only — FREEZELESS, no transcode)
- [ ] `bash deploy/deploy_crystal8k_gated.sh --apply`
  - backups → `lua5.1 loadfile` × 5 + `php -l` × 2 + `json.tool` → install → **`nginx -t`** → **`systemctl restart nginx`** (Lua = restart, not reload).
- [ ] E2E from the **VPS egress** (local PC returns 000): zap a real channel, expect `302`/`200`, watch `tail /var/log/nginx/iptv_intercept.log`.
- [ ] Confirm `X-APE-Visual-Engine` header present, manifests carry `hvc1` (never `hev1`) in `CODECS=`.

## 3. Transcode service (ONLY if owner wants pixel processing, GPU-checked)
- [ ] Re-run preflight; if CPU-only, do NOT enable 8K.
- [ ] `bash deploy/deploy_crystal8k_gated.sh --apply --transcode` (all channels still `enabled=false`).
- [ ] Flip ONE flagship channel `enabled=true` + real verbatim provider URL in `/etc/ape/crystal_transcode_control.json`.
- [ ] `systemctl restart ape-crystal-transcode`; `journalctl -u ape-crystal-transcode -f`.
- [ ] Verify `/dev/shm/crystal/<chId>/index.m3u8` is produced AND that disabling it falls back to passthrough (no freeze).
- [ ] Watch `top`/`nvidia-smi` — transcoder must not starve nginx (CPUQuota caps it).

## 4. Rollback (any failure)
- [ ] `cp -a /root/.backups/crystal8k-<TS>/* ` back to targets → `nginx -t` → `systemctl restart nginx`.
- [ ] `systemctl disable --now ape-crystal-transcode` ; remove the nginx include.

## Invariants that MUST still hold after deploy
- 0 toxic headers (no Range/If-Range) · no Xtream upstream keepalive · `proxy_cache_valid 302 0` ·
  single URL per channel · SHIELDED verbatim for every non-transcoded channel ·
  `hvc1` in STREAM-INF / `hev1` only in KODIPROP·EXTVLCOPT · no L153/L157 on 8K ·
  transcode opt-in only + FREEZELESS passthrough fallback.
