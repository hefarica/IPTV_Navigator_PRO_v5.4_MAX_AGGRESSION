---
description: How to audit a generated M3U8 list for compliance with all APE directives
---
// turbo-all

# M3U8 Audit Workflow

## IMPORTANT: VPS files are ALWAYS .gz compressed
- The uploaded file on VPS is `filename.m3u8.gz` (gzip)
- The `filename.m3u8` is an 8-byte placeholder for Nginx `gzip_static`
- ALWAYS use `zcat filename.m3u8.gz` — NEVER `cat filename.m3u8`

## Step 1: Identify the correct file
```bash
ssh root@178.156.147.234 "ls -lhS /var/www/html/lists/APE_TYPED*.gz | head -5"
```

## Step 2: Basic stats
```bash
ssh root@178.156.147.234 "F=/var/www/html/lists/<FILENAME>.m3u8.gz ; echo SIZE: ; ls -lh \$F ; echo LINES: ; zcat \$F | wc -l ; echo CHANNELS: ; zcat \$F | grep -c EXTINF"
```

## Step 3: URL length check (CRITICAL — must be < 800)
```bash
ssh root@178.156.147.234 "zcat /var/www/html/lists/<FILENAME>.m3u8.gz | grep -m1 'resolve_quality' | wc -c"
```
- **< 600**: ✅ Excellent
- **600-800**: ⚠️ OK
- **> 800**: ❌ FAIL — ctx= too large or encodeURIComponent present

## Step 4: ctx= payload size (CRITICAL — must be < 200 chars)
```bash
ssh root@178.156.147.234 "zcat /var/www/html/lists/<FILENAME>.m3u8.gz | grep -m1 -oP 'ctx=[^ ]+' | wc -c"
```

## Step 5: Directive counts
```bash
ssh root@178.156.147.234 "F=/var/www/html/lists/<FILENAME>.m3u8.gz ; echo -n 'EXTINF: ' ; zcat \$F | grep -c EXTINF ; echo -n 'EXTVLCOPT: ' ; zcat \$F | grep -c EXTVLCOPT ; echo -n 'KODIPROP: ' ; zcat \$F | grep -c KODIPROP ; echo -n 'EXT-X-APE: ' ; zcat \$F | grep -c 'EXT-X-APE' ; echo -n 'EXTHTTP: ' ; zcat \$F | grep -c EXTHTTP ; echo -n 'FALLBACK-DIRECT: ' ; zcat \$F | grep -c 'FALLBACK-DIRECT' ; echo -n 'EXTATTRFROMURL: ' ; zcat \$F | grep -c EXTATTRFROMURL ; echo -n 'resolve_quality: ' ; zcat \$F | grep -c resolve_quality ; echo -n 'ctx=: ' ; zcat \$F | grep -c 'ctx=' ; echo -n 'srv=: ' ; zcat \$F | grep -c 'srv='"
```

## Step 6: Sample URL inspection
```bash
ssh root@178.156.147.234 "zcat /var/www/html/lists/<FILENAME>.m3u8.gz | grep -m1 'resolve_quality'"
```
**Verify:**
- Path is `/api/resolve_quality` (NOT `/resolve.php` or bare `/resolve_quality`)
- `&p=P3` present (profile)
- `&srv=` present (credentials)
- `&ctx=` present (compact, ~160 chars)
- NO `%3D%3D` in ctx (means encodeURIComponent was used — BAD)

## Step 7: Live endpoint test
```bash
# Extract first resolver URL from the list and test it
ssh root@178.156.147.234 "URL=\$(zcat /var/www/html/lists/<FILENAME>.m3u8.gz | grep -m1 'resolve_quality') ; curl -sL \"\$URL\" | head -5"
```
**Expected:** `#EXTM3U` + `#EXTVLCOPT` lines — NOT 404, NOT raw PHP

## Expected Minimums (per ~6800 channels)
| Metric | Minimum | Notes |
|:---|:---:|:---|
| EXTINF | 6000+ | Channel count |
| EXTVLCOPT | 500000+ | ~85 per channel |
| KODIPROP | 50000+ | Kodi props |
| EXT-X-APE | 200000+ | APE metadata |
| EXTHTTP | 6000+ | HTTP headers |
| FALLBACK-DIRECT | 6000+ | Fallback URLs |
| resolve_quality URLs | 12000+ | 2 per channel |
| ctx= | 6000+ | 1 per channel |
| srv= | varies | Depends on multi-server |
| URL length | < 800 chars | Critical for OTT Navigator |
| ctx= length | < 200 chars | Critical for all players |
