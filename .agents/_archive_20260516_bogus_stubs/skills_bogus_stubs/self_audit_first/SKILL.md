---
description: Before blaming external systems (provider, player, network), ALWAYS audit our own code, directives, and logic first for bugs, caps, or errors that could cause the problem
---

# Self-Audit First: Root Cause in OUR Code

## MANDATORY RULE

When the user reports ANY problem (buffering, low bitrate, cuts, quality degradation, errors, wrong behavior), **ALWAYS** follow this protocol BEFORE suggesting the cause is external:

## Step 1: Audit OUR Directives (< 2 minutes)

Check if our injected directives contain caps, limits, or errors:

```bash
# Check for bitrate/resolution caps in resolver output
curl -sk "https://localhost/iptv-ape/resolve_quality.php?ch=<CHANNEL>&srv=<TOKEN>" \
  -H "User-Agent: <PLAYER_UA>" | \
  grep -i 'max-bitrate\|max-resolution\|maxbw\|preferred-resolution\|adaptive-max\|initial-bitrate\|bandwidth-guarantee\|buffer-min\|cap\|limit'
```

### Known cap patterns to check:
- `adaptive-maxbw` — if lower than stream's native bitrate, KILLS quality
- `preferred-resolution` — if starts at 480, player may stay low
- `X-Max-Resolution` — if set to 1920x1080, caps 4K streams
- `X-Max-Bitrate` — if set to 20M, 4K at 40M+ gets capped
- `X-Initial-Bitrate` — if too low, player starts at low quality
- `X-Screen-Resolution` — if 1080p, player may not request 4K
- `video-track` in EXTINF — if 1920x1080 for a 4K channel, misleading

## Step 2: Compare with Legacy (< 1 minute)

```bash
# Get same channel from legacy resolver
curl -sk "https://localhost/resolve_quality.php?ch=<CHANNEL>&srv=<TOKEN>" \
  -H "User-Agent: <PLAYER_UA>" > /tmp/legacy_out.txt

# Get from v3.0
curl -sk "https://localhost/iptv-ape/resolve_quality.php?ch=<CHANNEL>&srv=<TOKEN>" \
  -H "User-Agent: <PLAYER_UA>" > /tmp/v3_out.txt

# Compare
diff /tmp/legacy_out.txt /tmp/v3_out.txt
```

## Step 3: Audit the M3U8 List Entry (< 1 minute)

```bash
# Check the channel entry in the list
curl -sk 'https://localhost/lists/<LIST>.m3u8.gz' | gunzip | grep -B5 -A20 'ch=<CHANNEL>'
```

Look for:
- Wrong profile assignment (P3 for a 4K channel)
- Missing or capped directives
- Wrong codec specification

## Step 4: Check PHP Runtime (< 30 seconds)

```bash
# Check for runtime errors affecting output
tail -20 /var/log/php8.3-fpm.log | grep -i 'error\|fatal\|warning'
tail -10 /var/www/html/iptv-ape/logs/pipeline_trace.log
```

## Step 5: ONLY THEN Consider External Causes

After steps 1-4 show NO issues in our code, THEN consider:
- Provider throttling
- Network conditions
- Player configuration
- ISP interference

## ANTI-PATTERN: What NOT to do

❌ **NEVER** say "it's the provider" before checking our code
❌ **NEVER** say "the resolver can't change this" before verifying our directives aren't capping it
❌ **NEVER** blame the player without checking what we're sending to it
❌ **NEVER** assume the problem is external without evidence from Steps 1-4

## CORRECT PATTERN: What to do

✅ Find the exact channel/stream with the issue
✅ Extract our resolver output for that channel
✅ Check every directive for caps, limits, errors
✅ Compare with legacy resolver output
✅ Compare with what the player is actually receiving
✅ ONLY THEN form a hypothesis about root cause

## Historical Bugs Caught by This Protocol

| Date | Problem Reported | Initial Wrong Diagnosis | Actual Root Cause |
|------|-----------------|------------------------|-------------------|
| 2026-03-28 | 4.8 Mbps on 4K channel | "Provider sends low bitrate" | `adaptive-maxbw=20000000` and `X-Max-Resolution=1920x1080` in our enrichment capping the stream |
| 2026-03-28 | HTTP 204 empty response | "Server configuration" | Operator precedence bug: `$_SERVER['REQUEST_METHOD'] ?? '' === 'OPTIONS'` |
| 2026-03-28 | HTTP 500 on v3.0 | "PHP version issue" | 300+ named-argument violations (`start:` vs `offset:`) in our code |
