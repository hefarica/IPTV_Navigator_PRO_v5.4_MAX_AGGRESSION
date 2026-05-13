# Build sequence — production promotion (10 steps)

## Precondition

Phase 0 sandbox status MUST be `[CONFIRMED]` for all 9 core techniques. If any technique is `[UNVALIDATED]` or fails on re-run of `sandbox-proof.sh` + `stress-suite.sh`, do NOT execute steps below.

Re-validate command:

```bash
ssh root@178.156.147.234 "cd /opt/sandbox-anti407/anti407-jacie && docker compose up --build -d && \
  docker compose exec -T test-runner bash /tests/sandbox-proof.sh && \
  docker compose exec -T test-runner bash /tests/stress-suite.sh && \
  docker compose down"
```

Expected: exit 0, `7M+ iter, 0 errors`.

## Step 1 — Frontend hardcoded fallback (defensive default)

File: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js`

Already done as part of HEVC-FIRST CODEC LADDER plan (separate plan). Confirms 5 codec_chain_* keys exist per profile P0 to P5 with sensible HEVC-first defaults if LAB does not propagate.

Verification: `grep -c '"codec_chain_video":' frontend/js/ape-v9/ape-profiles-config.js` returns 6.

## Step 2 — Generator wire-up

File: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`

Confirm 5 quirurgical insertions are still in place:

- `_codec796` reads `cfg.codec_chain_video.split(',')[0]` with legacy fallback
- 4 new tags emitted: `EXT-X-APE-CODEC-PRIORITY-VIDEO|AUDIO|HDR|PLAYER-PREF`
- `EXT-X-APE-AV1-FALLBACK-CHAIN` reads `cfg.codec_chain_video_family` per profile
- KODIPROP `inputstream.adaptive.preferred_codec` per profile
- EXTVLCOPT `codec-priority`, `avcodec-codec`, `audio-codec-priority` per profile

Verification: `grep -c 'EXT-X-APE-CODEC-PRIORITY-' frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` returns >=4.

## Step 3 — Post-processor anti-revert

File: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/optimize-profiles.js`

Lines 31, 127, 180 must read per-profile from `profile.settings.codec_chain_video_family` with hardcoded HEVC-first fallback. Without this, optimize-profiles would silently revert per-profile work.

Verification: `grep "codec_chain_video_family" frontend/js/ape-v9/optimize-profiles.js` returns >=1.

## Step 4 — Local smoke test (no VPS touch)

Generate 6 sample M3U8 outputs (one per profile P0-P5) via local frontend dev server. Run grep matrix:

```bash
P0  → grep -E 'CODECS="dvh1' archivo.m3u8                     # MUST hit (Dolby Vision primary)
P1  → grep -E 'CODECS="hvc1\.2\.4\.L153' archivo.m3u8        # MUST hit (HEVC Main10 4K)
P5  → grep -iE '\b(av01|av1|vp9|hvc1|hev1|hevc|dvh1)\b'      # MUST be EMPTY
ALL → grep -c 'EXT-X-APE-CODEC-PRIORITY-(VIDEO|AUDIO|HDR|PLAYER-PREF)' # >=4 per channel
```

If any check fails, return to step 1-3 and re-validate.

## Step 5 — Backend wire (`ape_anti407_module.php` + JWT proxy_retry_407)

File: `IPTV_v5.4_MAX_AGGRESSION/backend/ape_anti407_module.php`

Add at line ~304 (`resolverFetch` signature): read `$jwtPayload['proxy_retry_407']` flag and respect as retry gate. If `false`, fail-fast without 3-strategy retry.

Add at line ~140: change `'Proxy-Connection' => 'keep-alive'` hardcode to `'Proxy-Connection' => $useKeepalive ? 'keep-alive' : 'close'` derived from `$jwtPayload['proxy_keepalive']`.

Verification: PHPUnit suite `tests/proxy-auth.test.js` continues to pass + new test for `proxy_retry_407=false` returns immediate.

## Step 6 — Frontend retry reduction

File: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/proxy-auth-integration.js`

Line ~256: change `for (let i = 0; i < 3; i++)` to `for (let i = 0; i < 1; i++)`. Single retry only. Total retry budget across stack: 1 (frontend) + 3 (backend) + 1 (Lua reactive) = 5 max hits to provider per channel.

Verification: Jest test confirms only 1 frontend retry observed.

## Step 7 — Sidecar deployment (build local, scp binary, systemd)

Local cross-compile:

```bash
cd IPTV_v5.4_MAX_AGGRESSION/sandbox/anti407-jacie/jacie
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o jacie-linux-amd64 .
scp jacie-linux-amd64 root@178.156.147.234:/opt/jacie/jacie
```

VPS:

```bash
ssh root@178.156.147.234 "
  install -m 755 -d /opt/jacie /run/jacie /var/lib/jacie
  chown www-data:www-data /run/jacie /var/lib/jacie
  cat > /etc/systemd/system/jacie.service <<'EOF'
[Unit]
Description=JACIE - JA3 fingerprint mimicry sidecar for IPTV shield
After=network.target

[Service]
Type=simple
ExecStart=/opt/jacie/jacie
Environment=JACIE_SOCKET=/run/jacie/jacie.sock
Environment=JACIE_LOG_LEVEL=info
Environment=JACIE_PROMETHEUS_PATH=/var/lib/jacie/metrics.prom
Restart=always
RestartSec=2
StartLimitBurst=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/run/jacie /var/lib/jacie
RuntimeDirectory=jacie
MemoryMax=256M
CPUQuota=20%

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload && systemctl enable --now jacie.service
"
```

Smoke test: `ssh root@VPS "echo '{\"host\":\"httpbin.org\",\"path\":\"/status/200\",\"method\":\"GET\"}' | socat - UNIX-CONNECT:/run/jacie/jacie.sock"`. Expect JSON response with `status: 200`.

## Step 8 — Backup pre-deploy

```bash
ssh root@VPS "
  cp /etc/nginx/sites-enabled/shield-location.conf{,.bak-anti407-$(date +%Y%m%d-%H%M%S)}
  cp /etc/nginx/sites-enabled/iptv-lua-circuit.conf{,.bak-anti407-$(date +%Y%m%d-%H%M%S)}
  ls -la /etc/nginx/sites-enabled/*.bak-anti407-*
"
```

## Step 9 — NGINX integration (maintenance window)

Apply M1+M2 from plan to `/etc/nginx/sites-enabled/shield-location.conf` and `iptv-lua-circuit.conf`.

Validate before reload:

```bash
ssh root@VPS "nginx -t && systemctl reload nginx && systemctl status nginx --no-pager"
```

If `nginx -t` fails, revert from backup and abort.

## Step 10 — Production canary (1 host)

```bash
ssh root@VPS "
  echo -e 'terovixa.cc\tsidecar\tchrome_120\t0\tmanual' >> /dev/shm/jacie_routing_table
  echo 'Routing table after canary add:'
  cat /dev/shm/jacie_routing_table
"
```

Play 1 channel from terovixa.cc in TiviMate. Monitor for 30 min:

- `journalctl -u jacie -f` shows requests through sidecar
- `cat /var/lib/jacie/metrics.prom | grep terovixa` increments
- TTFB on manifest stays below 200ms (autopista)
- Player has no buffering spike, no 407 raw

If 0 errors in 30 min: promote remaining whitelist hosts (`line.tivi-ott.net`, etc).

If any error in 30 min: revert via `sed -i '/^terovixa.cc/d' /dev/shm/jacie_routing_table`, debug logs, file replan.

## Rollback

Full revert from snapshot:

```bash
ssh root@VPS "
  cp /etc/nginx/sites-enabled/shield-location.conf.bak-anti407-* /etc/nginx/sites-enabled/shield-location.conf
  cp /etc/nginx/sites-enabled/iptv-lua-circuit.conf.bak-anti407-* /etc/nginx/sites-enabled/iptv-lua-circuit.conf
  nginx -t && systemctl reload nginx
  systemctl stop jacie.service && systemctl disable jacie.service
  rm /dev/shm/jacie_routing_table
"
```

After rollback, 407 conversion + sidecar are removed. Direct upstream path resumes (pre-anti407 behavior).
