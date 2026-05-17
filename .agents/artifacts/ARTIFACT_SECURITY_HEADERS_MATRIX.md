# ARTIFACT — SECURITY HEADERS MATRIX

**Generated:** 2026-05-17
**Authority:** `secure-header-profiler` skill (S10)
**Sources:** `feedback_exthttp_traps`, `feedback_okhttp_single_value_headers`, `feedback_beautiful_madness_4layer`, `feedback_shield_proxy_pass_request_headers_off`

---

## 1. Headers permitidos en M3U Plus channel list (`#EXTHTTP:{...}`)

| Header | Profile · OTT Nav | TiviMate | hls.js | VLC | ExoPlayer | Note |
|---|---|---|---|---|---|---|
| `User-Agent` | ✅ multi | ✅ multi | ✅ single | ✅ multi | ✅ multi | 4-layer comma-separated OK |
| `Accept` | ✅ multi | ✅ multi | ✅ single | ✅ multi | ✅ multi | idem |
| `Accept-Encoding: identity` | ✅ | ✅ | ✅ | ✅ | ✅ | NEVER `gzip` for HLS |
| `Accept-Language` | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| `Cache-Control: no-cache` | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| `Pragma: no-cache` | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| `Origin` | ✅ | ✅ | ✅ | ⚠ | ⚠ | only when provider requires |
| `Referer` | ✅ | ✅ | ✅ | ⚠ | ⚠ | idem |
| `X-Forwarded-For` | ⚠ | ⚠ | ❌ | ❌ | ❌ | provider-specific |

**Single-value (per `feedback_okhttp_single_value_headers`):**
- `Connection` — **single-value only** (rompe OkHttp si 4-layer)
- `Keep-Alive` — **single-value only**
- `Sec-Fetch-*` — **single-value only** (rompe TiviMate/Kodi)

---

## 2. Headers PROHIBIDOS (BLOCK on detection)

| Header | Trap | Severity | Memory ref |
|---|---|---|---|
| `Range: bytes=0-` | EOF en OkHttp Android | CRITICAL | `feedback_exthttp_traps` |
| `If-None-Match: *` | 304+0B → "unexpected end of stream" (C8 incident) | CRITICAL | `feedback_exthttp_traps` |
| `If-Modified-Since` con fecha inválida | 304 false positive | HIGH | `feedback_exthttp_traps` |
| `TE: trailers` | Upstream rechaza | HIGH | `feedback_exthttp_traps` |
| `Priority: u=0, i` | Upstream rechaza | MEDIUM | `feedback_exthttp_traps` |
| `Upgrade-Insecure-Requests: 1` | Browser fingerprint → 403 | MEDIUM | `feedback_exthttp_traps` |

---

## 3. Headers a SANITIZAR en shield (proxy_pass_request_headers off)

Per `feedback_shield_proxy_pass_request_headers_off`:

- Sin esta directiva, el shield reenvía 30+ headers `X-*` garbage de la lista M3U8 al upstream → fingerprint bot → 401/RST.
- Activar: `proxy_pass_request_headers off;` en el `location` block.

Lista de headers a NUNCA pasar al upstream Xtream:
- Todos los `X-APE-*` (metadata interno)
- `X-Forwarded-*` (a menos que provider lo requiera explícitamente)
- `Sec-Fetch-*` (browser fingerprint)
- `Sec-Ch-*` (Client Hints — fingerprint)
- `Cookie` salvo si provider auth lo requiere
- `Authorization` salvo Xtream basic auth

---

## 4. CORS policy (frontend → backend / shield)

| Origin | Method | Headers permitidos | Credentials | Max-Age |
|---|---|---|---|---|
| `http://127.0.0.1:5500` (Live Server dev) | GET, POST, OPTIONS | `Content-Type, Authorization` | true | 600 |
| `https://iptv-ape.duckdns.org` (prod) | GET, POST, OPTIONS | `Content-Type, Authorization` | true | 600 |
| Any other | none | none | false | 0 |

**No usar `Access-Control-Allow-Origin: *` con `Allow-Credentials: true`** (browser bloquea por spec).

---

## 5. Token / secret rotation policy

| Resource | TTL | Rotation method |
|---|---|---|
| Xtream auth (`user/pass`) | Manual · provider-dictated | manual update in `.env` |
| APE JWT signing key | Quarterly | rotate in vault + redeploy |
| Basic auth `prisma_metrics` | Annual | manual + notify all dashboard consumers |
| WireGuard peer keys | Annual | regenerate + update `authorized_peers.conf` |
| TLS certs (Let's Encrypt) | 60 days | certbot auto-renew |
| API tokens externos | Per-provider | tracked in vault |

---

## 6. Secret scanning rules (pre-commit hook recommendation)

```bash
# regex patterns to BLOCK in any commit
PATTERNS=(
  'password\s*[=:]\s*["\x27][^"\x27]+["\x27]'
  'api_key\s*[=:]\s*["\x27][A-Za-z0-9]{16,}["\x27]'
  'secret\s*[=:]\s*["\x27][A-Za-z0-9]{20,}["\x27]'
  'bearer\s+[A-Za-z0-9]{20,}'
  'sk_live_[A-Za-z0-9]{20,}'
  'AKIA[0-9A-Z]{16}'
  'AIza[0-9A-Za-z-_]{35}'  # Google API
  'ya29\.[0-9A-Za-z-_]{40,}'  # OAuth2 token
  '-----BEGIN (RSA )?PRIVATE KEY-----'
)

for pattern in "${PATTERNS[@]}"; do
  if git diff --cached -G"$pattern" | grep -qE "^\+"; then
    echo "BLOCKED: secret pattern detected: $pattern"
    exit 1
  fi
done
```

---

## 7. Anti-hotlink legitimate

| Method | When to use |
|---|---|
| Signed URLs (HMAC + expiry) | Authorized client distribution |
| Referer check | Cheap; bypassable; only for low-value resources |
| Token in query (`?ape_sid=...&ape_nonce=...`) | Used in this project per LAB SSOT |
| WireGuard tunnel (`wg0`) | Already deployed — only authorized peers reach upstream |
| GeoIP block | Provider-specific; can also use SurfShark nested egress |

**NUNCA usar:** evasión ilegal de provider, robo de señal, bypass DRM.

---

## 8. HTTP security headers (server-side response)

| Header | Value | Endpoint scope |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | HTTPS only |
| `X-Content-Type-Options` | `nosniff` | all |
| `X-Frame-Options` | `DENY` | non-embed pages |
| `Content-Security-Policy` | `default-src 'self'; ...` | UI pages |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | UI pages |
| `Permissions-Policy` | `geolocation=(), microphone=()` | UI pages |
| `X-XSS-Protection` | `0` (deprecated, use CSP) | UI pages |

---

## 9. Linux file permissions (production VPS)

| Path | Owner | Mode | Why |
|---|---|---|---|
| `/etc/nginx/nginx.conf` | root:root | 644 | readable by world |
| `/etc/nginx/sites-enabled/*` | root:root | 644 | idem |
| `/opt/netshield/lua/*.lua` | root:root | 644 | NGINX worker reads (www-data) |
| `/dev/shm/iptv-telemetry.log` | root:root | 644 | per `feedback_dev_shm_permissions_nginx_worker` |
| `/etc/wireguard/wg*.conf` | root:root | 600 | private keys |
| `/var/www/html/upload_chunk.php` | www-data:www-data | 644 | PHP-FPM exec |
| `.env` (cualquier) | owner:owner | 600 | secrets |
| SSH `~/.ssh/authorized_keys` | user:user | 600 | per SSH spec |

---

## 10. SSH hardening (production VPS)

| Setting | Value |
|---|---|
| `PermitRootLogin` | `prohibit-password` (key-only) |
| `PasswordAuthentication` | `no` |
| `ChallengeResponseAuthentication` | `no` |
| `MaxAuthTries` | `3` |
| `AllowUsers` | explicit list |
| `Port` | non-standard (e.g. 2222) |
| `ListenAddress` | bind to specific IP if multi-homed |
| Fail2ban | enabled with `sshd` filter |

---

**Fin Security Headers Matrix.**
