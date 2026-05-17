---
name: APE Deployment Safety Guardrails v1.0
description: Mandatory pre-deployment and post-deployment safety checks to prevent URL path mismatches, ctx= bloat, Nginx pollution, field degradation, and end-to-end breakage in the IPTV APE ecosystem.
---

# APE Deployment Safety Guardrails v1.0

## Purpose
Prevent recurring failures caused by:
- **URL PATH MISMATCH**: Frontend generates path X, backend PHP lives at path Y
- **ctx= PAYLOAD BLOAT**: Base64 payload making URLs > 2000 chars (kills OTT Navigator, VLC)
- **NGINX POLLUTION**: `.bak` files in `sites-enabled/` loaded as duplicate configs
- **FIELD DEGRADATION**: Removing fields from ctx without ensuring backend profiles have them
- **MISSING E2E VERIFICATION**: Deploying without testing the full chain (URL → Nginx → PHP → response)

---

## RULE 1: URL PATH PARITY CHECK (MANDATORY)
**Before ANY code change that touches resolver URLs:**
1. Verify `resolveScript` in `m3u8-typed-arrays-ultimate.js` matches the actual PHP file path on VPS
2. If using Nginx rewrites, verify the rewrite exists in `/etc/nginx/snippets/api-rewrite.conf`
3. Test with: `curl -sL 'https://iptv-ape.duckdns.org<PATH>?ch=test&p=P3' | head -3`
4. Expected: `#EXTM3U` — NOT `404 Not Found`

**Current mappings (source of truth):**
| Frontend Path | Nginx Rewrite | Actual PHP |
|:---|:---|:---|
| `/api/resolve_quality` | `api-rewrite.conf` | `/resolve_quality.php` |
| `/api/health` | `api-rewrite.conf` | `/api/health.php` |
| `/api/jwt-config` | `api-rewrite.conf` | `/api/jwt-config.php` |

---

## RULE 2: ctx= PAYLOAD SIZE LIMIT (MAX 200 B64 CHARS)
**Before ANY change to `ctxPayload` in BLOQUE 2B:**
1. Count the fields — MAX 12 flat scalars, NO nested objects
2. Calculate: `JSON.stringify(ctxPayload).length` must be < 150 bytes
3. Base64 of 150 bytes = ~200 chars
4. Total URL must be < 800 chars (tested by audit script)
5. If you need more data → put it in backend `$profileCfg` arrays, NOT in ctx=

**Nested objects (cortex, transport, deinterlace, lcevc, resilience) belong in the BACKEND ONLY.**

---

## RULE 3: NEVER CREATE .bak FILES IN sites-enabled/
**When editing Nginx configs:**
1. NEVER use `cp file file.bak` inside `/etc/nginx/sites-enabled/`
2. Nginx loads ALL files in `sites-enabled/` — `.bak` files cause duplicate listener errors
3. Instead: `cp file /tmp/nginx_backup_$(date +%s)`
4. After editing: ALWAYS run `nginx -t` BEFORE `systemctl reload nginx`
5. If `nginx -t` fails: restore from `/tmp/` backup, NOT from sites-enabled

---

## RULE 4: DUAL-SOURCE PARITY (FRONTEND ↔ BACKEND)
**Before removing ANY field from ctx= payload:**
1. Check if the field exists in `$profileCfg` (P0-P5) in `resolve_quality.php`
2. If NOT → ADD it to `$profileCfg` or `$sharedSubsystems` BEFORE removing from ctx=
3. Run parity audit: list all fields in JS `ctxPayload` + list all fields in PHP `$profileCfg` → diff must be empty
4. Zero degradation policy: **backend must carry every field the frontend declares**

---

## RULE 5: VPS FILE AUDIT — ALWAYS USE .gz
**When auditing M3U8 files on VPS:**
1. The uploaded file is ALWAYS `.m3u8.gz` (gzip compressed)
2. The `.m3u8` file (without .gz) is an 8-byte placeholder for `gzip_static`
3. ALWAYS use `zcat file.gz | head` to read content — NEVER `cat file.m3u8`
4. To count lines: `zcat file.gz | wc -l`
5. To search: `zcat file.gz | grep -m1 'pattern'`

---

## RULE 6: END-TO-END VERIFICATION (MANDATORY POST-DEPLOY)
**After EVERY deployment, run ALL of these:**
```bash
# 1. PHP syntax check
ssh root@VPS "php -l /var/www/html/resolve_quality.php"

# 2. Nginx test
ssh root@VPS "nginx -t"

# 3. Health endpoint
curl -sL 'https://iptv-ape.duckdns.org/api/health'
# Expected: {"status":"ok"}

# 4. Resolver with test credentials
curl -sL 'https://iptv-ape.duckdns.org/api/resolve_quality?ch=1&p=P3&srv=dGVzdHw...'
# Expected: #EXTM3U (NOT 404, NOT raw PHP source)

# 5. URL length from generated M3U8
zcat <file>.gz | grep -m1 'resolve_quality' | wc -c
# Expected: < 800

# 6. Nginx rewrite snippet
cat /etc/nginx/snippets/api-rewrite.conf
# Must contain: rewrite ^/api/resolve_quality$ /resolve_quality.php last;
```

---

## RULE 7: encodeURIComponent — NEVER ON URL-SAFE BASE64
**Base64 URL-safe characters (`A-Z a-z 0-9 - _`) do NOT need encoding.**
- After `btoa().replace(/+/g,'-').replace(/\//g,'_').replace(/=+$/,'')` → the string is URL-safe
- `encodeURIComponent()` on URL-safe B64 is REDUNDANT and adds unnecessary `%` encoding
- This bloats URLs and can break player URL parsers

---

## Incident History
| Date | Issue | Root Cause | Prevention Rule |
|:---|:---|:---|:---|
| 2026-03-26 | OTT Navigator 404 | `/api/resolve_quality` → no PHP at that path | RULE 1 |
| 2026-03-26 | VLC 404, URL > 2000 chars | `encodeURIComponent` on B64 + 81-field ctx | RULE 2, 7 |
| 2026-03-26 | Nginx duplicate listener | `.bak` files in `sites-enabled/` | RULE 3 |
| 2026-03-26 | Data degradation | Removed ctx fields without backend coverage | RULE 4 |
| 2026-03-26 | Auditing wrong file | `cat .m3u8` instead of `zcat .m3u8.gz` | RULE 5 |
