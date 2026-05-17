---
name: iptv_anti_407_e2e_validated
description: Use when generating M3U8 lists, editing m3u8-typed-arrays-ultimate.js, ape_anti407_module.php, evasion-407-supremo.js, proxy-auth-module.js, proxy-auth-integration.js, shield-location.conf, jacie sidecar (Go uTLS), or when HTTP 407 surfaces in shield/upstream logs or in playlist consumption logs. This skill carries the validated zero-error doctrine confirmed in sandbox 2026-05-01 over 7,343,906 iterations against mock-407 + mock-ja3 + mock-terovixa + mock-megaott + mock-tivi-ott. It enforces the 9 confirmed techniques (NGINX 407→502 conversion via error_page + content_by_lua handler, map routing for direct vs sidecar upstream, unix socket upstream syntax, init_worker warm-start, ngx.socket.unix RTT, pre-emptive Proxy-Authorization Basic Og==, Go uTLS sidecar, header coherence Chrome/VLC/Firefox/okhttp byte-identical) plus the deploy-time bug fixes (go.sum tidy, utls _Auto variants, NGINX map case regex, set $jacie_route declarations, test-runner CMD vs ENTRYPOINT). Activates on triggers like "407", "Proxy-Authentication", "PROXY_AUTH_REQUIRED", "JACIE", "TLS fingerprint", "JA3", "uTLS", "Proxy-Authorization", or any work touching the IPTV anti-407 pipeline end-to-end.
---

# IPTV Anti-407 End-to-End Zero-Error Doctrine (sandbox-validated)

## Purpose

Provide one authoritative reference for generating M3U8 playlists that do NOT trigger HTTP 407 from upstream Xtream-Codes providers, by enforcing the exact 9 techniques validated in sandbox over 7.3M iterations with binary `errors == 0` tolerance on 2026-05-01.

The skill prevents reintroducing classes of failure already eliminated in the sandbox cycle: header value mismatches that providers fingerprint as bot, NGINX directive errors that prevent shield deployment, Lua phase conflicts, Go sidecar build failures, and runtime contract violations between PHP / JS / NGINX / Go layers.

## When to use

Activate before any of the following actions, even when the request seems unrelated to 407:

- Editing M3U8 generator: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`
- Editing 407-handling backends: `IPTV_v5.4_MAX_AGGRESSION/backend/ape_anti407_module.php`, `proxy-auth-server.php`, `resolve_quality_unified.php`
- Editing 407-handling frontends: `frontend/js/ape-v9/proxy-auth-module.js`, `proxy-auth-integration.js`, `evasion-407-supremo.js`
- Editing shield NGINX: `net-shield/nginx/shield-location.conf`, `iptv-lua-circuit.conf`, `lua/upstream_*.lua`, `lua/jacie_*.lua`, `lua/error_407_handler.lua`
- Touching JACIE sidecar: any Go source under `sandbox/anti407-jacie/jacie/`, systemd unit `/etc/systemd/system/jacie.service`, install scripts in `/opt/jacie/`
- Reading shield logs and seeing status 407, 502 with `X-APE-Error: PROXY_AUTH_REQUIRED`, NGINX `[emerg]` directives, or upstream `Proxy-Authenticate` headers
- Running sandbox suite, stress suite, or pulling proofs from the validated stack

## Authoritative sources

Treat these documents as the single source of truth. When in conflict with skill body, the listed documents win:

- Validation memory: `C:\Users\HFRC\.claude\projects\c--Users-HFRC-Desktop-IPTV-Navigator-PRO-v5-4-MAX-AGGRESSION\memory\reference_anti407_sandbox_validated.md` (results, 5 deploy bug fixes, plan transition)
- HTTP 407 doctrine: `feedback_http_407_proxy_auth_doctrine.md` (classification + telemetry-only autopista posture)
- Approved plan: `C:\Users\HFRC\.claude\plans\codec-strings-hvc1-2-4-l153-b0-av01-0-08-functional-peacock.md` (`[CONFIRMED: 2026-05-01]`, build sequence steps 1-10)
- Sandbox stack: `IPTV_v5.4_MAX_AGGRESSION/sandbox/anti407-jacie/` (27 archivos: docker-compose, jacie Go sidecar, mocks, OpenResty conf, Lua modules, tests, proofs)
- Adjacent doctrines (do not violate): `feedback_autopista_doctrine.md`, `feedback_circuit_breaker_REMOVED_autopista.md`, `iptv-vps-touch-nothing`, `feedback_okhttp_single_value_headers.md`, `feedback_omega_no_delete.md`, `feedback_no_clamp_lab_values.md`

## The 9 zero-error techniques

Each technique below was validated under stress with explicit iteration count and `errors == 0` binary criterion:

1. **NGINX `proxy_intercept_errors on` + `error_page 407 = @failover_407`** at shield-location level. Combined functional+stress: V01 = 115,697 iter (status 502 expected), V02 = 123,855 iter, V07b = 87,914 iter. PASS.
2. **`content_by_lua_file` named location handler** that injects `X-APE-Error: PROXY_AUTH_REQUIRED`, `X-APE-Origin-Status: 407`, `X-APE-Action: CHECK_PROXY_CREDENTIALS`, increments SHM `circuit_metrics[host:err_407]`, optionally auto-promotes host to sidecar mode after threshold, and returns `ngx.exit(502)`. Validated under V02.
3. **`map $jacie_route $proxy_target` routing decision** instead of `if` in location block (NGINX `if` is evil). Stress V03: 3,486,506 iter, 0 errors. PASS.
4. **`upstream { server unix:/run/jacie/jacie.sock; }` + `proxy_pass http://jacie_socket`** for unix-socket upstream. Stress V04: 100,000 iter, 0 errors, 436s. PASS.
5. **`init_worker_by_lua_file`** warm-start that reads `/dev/shm/jacie_routing_table` (TSV) into `lua_shared_dict jacie_routing` at worker boot. Functional V05 PASS.
6. **`ngx.socket.unix()` from `rewrite_by_lua` phase** for low-latency sidecar communication. Stress V06: 1,778,390 iter, 0 errors, p99 budget held. PASS.
7. **Pre-emptive `proxy_set_header Proxy-Authorization "Basic Og=="`** (Basic with empty user:pass = `:` base64 = `Og==`). Coexists with normal traffic; converts strict-407 to 502 via mechanism #1. Stress V07a/V07b: 1,351,544 + 87,914 iter, 0 errors. PASS.
8. **JACIE sidecar (Go + uTLS)** with Unix socket listener on `/run/jacie/jacie.sock` (mode 0660 group www-data). Profiles: `chrome_120` (HelloChrome_Auto), `firefox_117` (HelloFirefox_Auto), `safari_16` (HelloSafari_Auto), `vlc_3_0_18` (HelloRandomizedNoALPN), `tivimate_5` (HelloRandomized), `kodi_21` (HelloRandomizedNoALPN). Validated end-to-end via mocks.
9. **Header coherence JA3 to User-Agent byte-identical**: when JA3 profile is `chrome_120`, UA must contain `Chrome/12`; when `vlc_3_0_18`, UA must contain `VLC/3.0`; when `firefox_117`, UA must contain `Firefox/`. Mismatch produces 407 from JA3-aware providers. Stress V16/V17/V19: ~300,000 iter cross-provider, 0 errors. PASS.

## Five deploy-time bugs already fixed (do not reintroduce)

These five bugs blocked deploy during sandbox cycle. Fixes are in the codebase. Do not re-add the broken patterns:

1. `jacie/Dockerfile` requires `RUN apk add --no-cache git && go mod tidy` BEFORE `go build`, otherwise utls dep fails with `missing go.sum entry`.
2. `jacie/main.go` MUST use `utls.HelloChrome_Auto / HelloFirefox_Auto / HelloSafari_Auto / HelloIOS_Auto` (forward-compat). Specific version constants like `HelloFirefox_117` may not exist in the installed utls release.
3. `shield.conf` map for `Proxy-Connection` must use regex `~*^close$` to avoid case-collision between `"close"` and `"Close"` parameters. Two literal entries that match the same input case-insensitively trigger `[emerg] conflicting parameter "close"`.
4. `shield.conf` MUST declare `set $jacie_route "0";` and `set $jacie_profile "chrome_120";` at server level BEFORE Lua scripts modify them via `ngx.var.X = ...`. Without `set`, NGINX errors with `unknown "jacie_route" variable`.
5. `tests/Dockerfile` MUST use `CMD ["tail", "-f", "/dev/null"]` (no ENTRYPOINT). Setting `ENTRYPOINT ["/bin/bash"]` plus compose `command: tail -f /dev/null` makes bash try to execute `tail` as a script path leading to `cannot execute binary file`.

## End-to-end pipeline contract

When generating an M3U8 list that must not trigger 407, every layer below must hold its part of the contract. If any layer is broken, 407 may surface despite the others.

### Layer A — Frontend generator (m3u8-typed-arrays-ultimate.js)

Emit per channel:

- `#EXTHTTP:{...}` with realistic User-Agent that matches the player target. Acceptable canonical values: VLC `VLC/3.0.18 LibVLC/3.0.18`, TiviMate `okhttp/4.12.0`, Kodi `Kodi/21.0 (Android 11) AppleWebKit/537.36`, Chrome `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`. NEVER mix Chrome UA with VLC JA3 profile or vice-versa (technique #9).
- `#EXTVLCOPT:http-user-agent=<UA>` matching EXTHTTP UA byte-identical
- `#KODIPROP:inputstream.adaptive.preferred_codec=<chain>` per profile (codec_chain_player_pref from LAB)
- Banned outbound headers (must NOT appear): `X-Forwarded-For`, `X-Real-IP`, `X-Proxy-ID`, `X-APE-*` (those are internal only), `Via`, `Forwarded`, `X-Powered-By`, `Server`. These are filtered out by both `ape_anti407_module.php:84-106` (Header Sanitizer) AND `proxy_set_header X "";` in shield-location.conf.

### Layer B — Backend resolve (ape_anti407_module.php)

Five layers in this order, do not change order:

1. Header Sanitizer (lines 84-106)
2. UA Rotator (lines 117-124, deterministic by `channelId % prime`)
3. Proxy-Auth Bypass (lines 135-142, injects `Proxy-Authorization: Basic Og==`)
4. Fetch with retries (lines 155-256, 3 retries max with 50ms sleep, escalating strategy: clean_ua then proxy_auth_bypass then minimal_headers)
5. Fallback Chain (lines 269-282)

Telemetry to `/dev/shm/ape_anti407_log.json` (no disk writes during hot path). The retry budget MUST be respected by the JS layer (technique below).

### Layer C — Frontend retry layer (proxy-auth-integration.js)

The retry loop at line ~256 MUST be `for (let i=0; i<1; i++)` (single retry). Combined with backend 3 retries + Lua reactive failover = total 5 hits maximum before surfacing 502 to player. The original 3 retries here cascaded with backend 3 = up to 9 hits per channel which trains providers to flag the IP.

### Layer D — Shield NGINX

`shield-location.conf` enforces:

- `proxy_intercept_errors on;`
- `error_page 407 = @failover_407;`
- `proxy_set_header Proxy-Authorization "Basic Og==";`
- `rewrite_by_lua_file /etc/nginx/lua/jacie_router.lua;`
- `proxy_pass http://$proxy_target;` where `$proxy_target` is mapped from `$jacie_route` ("0" -> direct upstream, "1" -> unix socket jacie)
- All banned outbound headers nulled via `proxy_set_header X "";`

`iptv-lua-circuit.conf` declares:

- `lua_shared_dict jacie_routing 1m;`
- `init_worker_by_lua_file /etc/nginx/lua/jacie_router_init.lua;`

The `circuit_metrics` SHM dict is shared with `upstream_gate.lua`, `upstream_response.lua`, `bandwidth_reactor.lua` (do not collide on key names).

### Layer E — JACIE sidecar (only when host is in routing whitelist)

`/run/jacie/jacie.sock` accepts JSON request blob, returns response blob:

- Request: `{host, path, method, headers, body, profile, scheme}`
- Response: `{status, headers, body, jacie_ms, ja3}`

The sidecar enforces JA3/UA coherence: if UA omitted, sidecar injects the UA matching the profile (technique #9). Connection pool keepalive reduces TLS handshakes by ~99% (V9 stress).

### Layer F — Routing whitelist (auto-promotion)

`/dev/shm/jacie_routing_table` (TSV, persisted, operator-editable):

```
host                     mode      ja3_profile   last_407    auto_until
terovixa.cc              sidecar   chrome_120    0           manual
line.tivi-ott.net        sidecar   vlc_3_0_18    0           manual
megaott-cf.com           sidecar   chrome_120    1714532000  1715136800
example-direct-ok.com    direct                  0           
```

Auto-promote rule (in `error_407_handler.lua`): when `circuit_metrics[host:err_407] >= 2`, upsert SHM with `mode=sidecar, ja3_profile=chrome_120, auto_until=now+7*86400`. Auto-degrade in `jacie_router.lua`: when `auto_until < now`, set entry back to direct mode.

## Activation procedure

When this skill triggers, follow these steps before producing any code change:

1. Read `references/sandbox_validation_summary.md` for exact iteration counts and pass criteria per V##.
2. Read `references/build_sequence.md` for the 10 build steps preconditioned on Phase 0 [CONFIRMED].
3. Read `references/coherence_matrix.md` for the JA3/UA/Sec-CH-UA byte-identical pairs.
4. Cross-reference change against `references/banned_patterns.md` (do not reintroduce known broken patterns).
5. If the change touches VPS shield NGINX, also activate `iptv-vps-touch-nothing` skill to confirm authorization is explicit and a maintenance window is open.
6. If the change touches Lua, also activate `iptv-autopista-doctrine` to confirm no circuit-breaker resurrection.

## Verification gates

Before claiming any change is correct, run these gates locally or in sandbox:

- `bash sandbox/anti407-jacie/tests/sandbox-proof.sh` (functional, expects 14+/25 PASS, no test-script regressions)
- `bash sandbox/anti407-jacie/tests/stress-suite.sh` (zero-error tolerance, expects 7M+ iter, 0 errors)
- `nginx -t` against any modified shield config
- `go test -v ./...` inside `sandbox/anti407-jacie/jacie/` for sidecar changes
- `tcpdump -A -i any host <test-upstream>` to confirm banned outbound headers absent (V16-V25 outbound audit)

If any gate fails, do NOT promote the change to VPS. Update the affected technique status from `[CONFIRMED]` back to `[REVIEW]` and replan.

## Operational notes

- VPS sandbox stays at `/opt/sandbox-anti407/` (containers down by default after validation). To re-validate: `cd /opt/sandbox-anti407/anti407-jacie && docker compose up --build -d && docker compose exec test-runner bash /tests/sandbox-proof.sh && docker compose exec test-runner bash /tests/stress-suite.sh`.
- Sandbox port `127.0.0.1:18080` (NOT 8080 - that is gunicorn Guardian Engine in production).
- Resource caps in `docker-compose.yml`: shield mem=256M cpus=0.5 cpuset=1,2 (preserves core 0 for production NGINX/PHP-FPM).
- NEVER run sandbox without `docker compose down` confirming production load returns to baseline (~0.18 1min) post-test.

## Files in this skill

- `SKILL.md` - this file (skill body)
- `references/sandbox_validation_summary.md` - full V01-V25 results table
- `references/build_sequence.md` - 10 build steps for production promotion
- `references/coherence_matrix.md` - JA3/UA/Sec-CH-UA byte-identical pairs
- `references/banned_patterns.md` - 5 deploy-time bugs to never reintroduce + banned outbound header list
