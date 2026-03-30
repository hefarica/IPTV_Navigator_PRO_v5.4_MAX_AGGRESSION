---
description: APE Elite Enrichment v2.0 — The 14 ULTIMATE upgrades for forcing maximum bitrate from Flussonic CDN via EXTHTTP/EXTVLCOPT directives
---

# APE Elite Enrichment v2.0

## The 14 ULTIMATE Upgrades

| # | Header | Value | Purpose |
|---|--------|-------|---------|
| 1 | X-Max-Bitrate | 300,000,000 (300 Mbps) | Ceiling: allows up to 300 Mbps |
| 2 | X-Min-Bitrate | 80,000,000 (80 Mbps) | **FLOOR**: filters SD/HD/FHD variants |
| 3 | X-HEVC-Profile | MAIN-10-HDR | Forces HDR variant selection |
| 4 | X-Color-Space | BT2020 | Filters out SDR variants |
| 5 | X-Bypass-ABR | true | Flussonic: disables adaptive bitrate |
| 6 | X-Quality-Lock | NATIVA_MAXIMA | Locks quality for the session |
| 7 | X-BW-Smooth-Factor | 0.01 | 100x slower to downgrade quality |
| 8 | X-DSCP-Override | 63 | Maximum network priority (EF) |
| 9 | User-Agent | SHIELD Android TV Pro | CDN premium device profiling |
| 10 | adaptive-maxbw | 300,000,000 | VLC: allows up to 300 Mbps |
| 11 | video-track | 7680x4320 | EXTINF reports 8K capability |
| 12 | Resolution ladder | 4320→2160→1080→720 | 4K-first (top-down fallback) |
| 13 | X-Parallel-Segments | 4,6,8 | aria2c-style multi-TCP downloads |
| 14 | X-Rate-Control | CQP | Constant quality (not variable) |

## Shield TV Pro User-Agent (CDN Profiling King)
```
Mozilla/5.0 (Linux; Android 14; SHIELD Android TV Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Safari/537.36
```
CDNs recognize Shield TV Pro as the most powerful streaming device → always serves highest variant.

## Resolution Ladder Rule
**ALWAYS** start from highest to lowest:
```
preferred-resolution=4320  (8K)
preferred-resolution=2160  (4K)
preferred-resolution=1080  (FHD)
preferred-resolution=720   (HD)
preferred-resolution=480   (SD)
adaptive-logic=highest
```
VLC uses the LAST supported entry. If you start at 480p, the decoder may stay at 480p.

## NEVER
- Never set X-Max-Bitrate < provider's available bitrate
- Never set X-Min-Bitrate > provider's max bitrate (filters ALL variants)
- Never use MAIN-10-HDR for P4/P5 profiles (no HDR content at SD/HD)
- Never start resolution ladder at 480p or 720p for P1/P2 profiles
- Never use BT709 for P1/P2 profiles (allows CDN to serve SDR variants)
