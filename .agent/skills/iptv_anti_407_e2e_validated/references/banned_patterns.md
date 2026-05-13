# Banned patterns — never reintroduce

This file captures the 5 deploy-time bugs discovered during sandbox cycle (and fixed in the codebase) plus the absolute list of outbound headers that must never appear on requests leaving the shield to the upstream. Every pattern below caused a measurable failure or fingerprint exposure during validation.

## Five deploy-time bugs (with broken vs correct patterns)

### Bug 1 — go.sum missing for utls dep

**Symptom**: `missing go.sum entry for module providing package github.com/refraction-networking/utls (imported by jacie); to add: go get jacie`. Build fails.

**Broken**:

```dockerfile
COPY go.mod ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /jacie ./...
```

**Correct**:

```dockerfile
RUN apk add --no-cache git
COPY go.mod ./
COPY *.go ./
RUN go mod tidy
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /jacie ./...
```

Reason: `go mod tidy` regenerates `go.sum` from imports, requires git in alpine image. `go mod download` only fetches what's already in go.sum.

### Bug 2 — utls version-pinned constants undefined

**Symptom**: `./main.go:244:15: undefined: utls.HelloFirefox_117`. Build fails on `go build` after Dockerfile is fixed.

**Broken**:

```go
case "firefox_117": return utls.HelloFirefox_117
case "safari_17": return utls.HelloSafari_17_0
case "chrome_120": return utls.HelloChrome_120  // partial — exists in 1.6.0+ but breaks if utls upgrades
```

**Correct**:

```go
case "firefox_117", "firefox": return utls.HelloFirefox_Auto
case "safari_16", "safari":   return utls.HelloSafari_Auto
case "chrome_120", "chrome":  return utls.HelloChrome_Auto
case "ios_14":                return utls.HelloIOS_Auto
```

Reason: `_Auto` variants always point to the latest profile present in the installed utls version. Forward-compatible across utls upgrades. Specific version constants like `HelloFirefox_117` may be missing in older or newer utls releases.

### Bug 3 — NGINX map case-collision

**Symptom**: `nginx: [emerg] conflicting parameter "close" in /etc/nginx/conf.d/default.conf:26`. NGINX refuses to start.

**Broken**:

```nginx
map $http_connection $proxy_conn_value {
    default     "keep-alive";
    "close"     "close";
    "Close"     "close";
}
```

**Correct**:

```nginx
map $http_connection $proxy_conn_value {
    default       "keep-alive";
    "~*^close$"   "close";
}
```

Reason: NGINX map parameters are case-insensitive by default. `"close"` and `"Close"` collapse to the same key. Use `~*` regex prefix for case-insensitive single match instead of two literal entries.

### Bug 4 — Lua-modified vars not declared

**Symptom**: `nginx: [emerg] unknown "jacie_route" variable`. NGINX refuses to start when `rewrite_by_lua_file` references `ngx.var.jacie_route`.

**Broken** (variable referenced in Lua but never declared):

```nginx
server {
    listen 8080;
    rewrite_by_lua_file /etc/nginx/lua/jacie_router.lua;  # writes ngx.var.jacie_route
    proxy_pass http://$proxy_target;
}
```

**Correct**:

```nginx
server {
    listen 8080;

    # Lua-modified vars must be declared before any Lua reads/writes them
    set $jacie_route "0";
    set $jacie_profile "chrome_120";

    rewrite_by_lua_file /etc/nginx/lua/jacie_router.lua;
    proxy_pass http://$proxy_target;
}
```

Reason: NGINX requires `set` directive to allocate a variable slot before Lua can write to it via `ngx.var.X = ...`. Without `set`, the variable is unknown to the variable resolver phase.

### Bug 5 — test-runner ENTRYPOINT plus compose command bash-script confusion

**Symptom**: `/usr/bin/tail: /usr/bin/tail: cannot execute binary file`. Container exits immediately with code 126.

**Broken** (Dockerfile + compose combination):

```dockerfile
# Dockerfile
ENTRYPOINT ["/bin/bash"]
```

```yaml
# docker-compose.yml
test-runner:
  command: tail -f /dev/null
```

The combined exec is `/bin/bash tail -f /dev/null` → bash treats "tail" as a script file path and fails to read it.

**Correct** (Dockerfile alone, no compose command):

```dockerfile
CMD ["tail", "-f", "/dev/null"]
```

```yaml
# docker-compose.yml
test-runner:
  # no `command:` line
```

Reason: When Dockerfile has `ENTRYPOINT`, compose `command:` becomes the args to ENTRYPOINT. `bash tail -f /dev/null` invokes bash with "tail" as its script argument, not as the command to run. Use `CMD` only with no compose `command:` for full-array form `CMD ["tail", "-f", "/dev/null"]`.

## Banned outbound headers

The following headers must NOT appear on any request leaving the shield NGINX or the JACIE sidecar to the upstream provider. Each one is a known fingerprint or proxy-chain disclosure that triggers 407 from JA3-aware providers (terovixa, MegaOTT, line.tivi-ott).

| Header | Reason | Audit method |
|---|---|---|
| `X-Forwarded-For` | Identifies request as proxied through a chain | `tshark -Y 'http.request' -T fields -e http.x_forwarded_for` MUST be empty |
| `X-Real-IP` | Same as XFF — exposes original client | tshark same field |
| `X-Proxy-ID` | Custom shield tag — provider fingerprints `X-Proxy-*` family | tshark `http.x-proxy-id` |
| `X-APE-*` (entire family) | Internal tags for client-facing M3U8 only — must NOT leak upstream | tshark `http.x-ape-*` MUST be empty on outbound |
| `Via` | RFC 7230 declaring proxy hop | tshark `http.via` |
| `Forwarded` | RFC 7239 alt to XFF | tshark `http.forwarded` |
| `X-Powered-By` | Reveals tech stack | tshark `http.x-powered-by` |
| `Server` (response side) | Reveals NGINX version | NGINX `proxy_hide_header Server;` + `server_tokens off;` |
| `X-AspNet-Version` | Reveals .NET — irrelevant but must hide | proxy_hide_header |

Enforcement points (any one fails to enforce, all others must catch):

- **Layer A**: Frontend generator does not include any `X-Forwarded-For`-like header in EXTHTTP
- **Layer B**: `ape_anti407_module.php:84-106` Header Sanitizer strips them from outbound HTTP request
- **Layer D**: shield-location.conf `proxy_set_header X "";` for each banned header AND `proxy_pass_request_headers off;` (CRITICAL — without this, NGINX forwards 30+ X-* headers from the M3U8 list verbatim)
- **Layer E**: JACIE sidecar Go HTTP client does not auto-add forwarded headers; transport explicitly empty unless caller provides

## Doctrinal patterns to never reintroduce (broader project)

These are not deploy-time bugs but design patterns that violate established doctrine. Skim before any change touching shield/sidecar/anti-407:

- **Circuit breaker logic in shield Lua** — REMOVED 2026-04-25 per `feedback_circuit_breaker_REMOVED_autopista.md`. Single-user IPTV does not benefit from circuit breaker patterns; they cause cascade freezes. JACIE auto-promote/degrade is ROUTING policy, not health gating.
- **Always-on TLS sidecar for all upstreams** — current scope is selective whitelist with auto-promotion (technique #8 + #6 of skill body). Always-on adds SPOF risk and ~200ms TTFB regression that violates `feedback_vps_zapping_atomico_inviolable.md`.
- **Header value clamping in JS** — never `Math.max/min/floor/ceiling` on `vlcopt/settings/hlsjs/prefetch_config` per `feedback_no_clamp_lab_values.md`. Source of truth is Excel CALIBRATED, JS only reads.
- **OkHttp single-value header doctrine violation** — never multi-value `Connection`, `Keep-Alive`, `Sec-Fetch-*` headers per `feedback_okhttp_single_value_headers.md`. Codec/proxy auth headers are `#token` semantics RFC 7230 and SAFE multi-value.
- **Deleting working code** — never delete `evasion-407-supremo.js` or other apparently-dead modules. Mark as deprecated in docstring per `feedback_omega_no_delete.md`.

## Recovery if a banned pattern leaks into production

1. Detect via tcpdump on shield outbound interface or via provider-side 407 spike
2. Identify which Layer (A-E) leaked
3. Apply patch to that layer only (not others — defense in depth means each layer holds independently)
4. Re-run sandbox-proof.sh + stress-suite.sh against modified mock simulating the provider's specific check
5. Rollback if any V## regresses
6. Document in `feedback_*` memory file so future sessions see the trap
