# README — APE Visual Extreme UNLOCKED (2026-06-20)

Measurable visual-quality layer for the VPS manifest plane.
**FAKE 4K/HDR/LCEVC/CMAF/HDCP PERMITIDO, ACTIVO Y OBLIGATORIO.**

> **Supersedes the previous "Science-Safe" doctrine.** By explicit owner decision (2026-06-20, option
> "Full literal fake, exactly as written"), the anti-fake-4K guards are removed. The owner accepted the
> documented breakage caveats (see "Honest caveats" below).

## What it does (unlocked)

The VPS and the generator rewrite each `#EXT-X-STREAM-INF` so the player receives **4K/HDR/HEVC/LCEVC
metadata aggressively**, **WITHOUT** verification of source stream characteristics. Fake metadata is not
just permitted — it is **MANDATORY** on 100% of channels that carry a `#EXT-X-STREAM-INF`.

- ✅ **FAKE 4K**: `RESOLUTION=3840x2160` reescrito sobre CUALQUIER fuente
- ✅ **FAKE HDR**: `VIDEO-RANGE=PQ` incondicional
- ✅ **FAKE HEVC**: `CODECS="hvc1.2.4.L153.B0"` sobre AVC/VP9/otros (audio preservado)
- ✅ **FAKE LCEVC**: `SUPPLEMENTAL-CODECS="lcev.1.1.1"` virtual
- ✅ **FAKE CMAF**: `EXT-X-MAP` emitido sin verificación fmp4 (capa VPS Lua / master playlists)
- ✅ **FAKE HDCP**: `HDCP-LEVEL=TYPE-1` hardcodeado universal
- ✅ **FAKE Bitrate**: `BANDWIDTH=28000000` / `AVERAGE-BANDWIDTH=22000000` agresivos

## Files (implementation)

- `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` — Virtual 4K post-processor
  over `_finalM3U` (per-channel chokepoint, `try`-safe).
- `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/combined_body_filter.lua` — STAGE 3 unconditional Virtual 4K
  rewrite (`CHINA_BOX_FAKE_4K=true`, all tiers P0–P5), `pcall`-safe, autopista-compliant.
- `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/ape_virtual_4k.lua` — `rewrite_variant_to_4k` helper.
- `.agent/skills/Skill_4K_Enhancement_Enforcer/SKILL.md` — enforcer skill (replaces `Skill_Fake_4K_Detector`).
- `apply_fake4k_unlocked.sh` — one-shot apply/backup helper.

## How to activate (production — AGGRESSIVE)

1. The generator post-processor is **always on** (`V4K.enabled = true`).
2. VPS Lua: `CHINA_BOX_FAKE_4K = true` in `combined_body_filter.lua` (STAGE 1 + STAGE 3).
3. Validate: `node -c` on the generator files; `luac -p` on the Lua; `nginx -t` on the VPS.
4. Verify response header `X-APE-Virtual-4K: enabled=aggressive`.

## Success metrics

- 100% of channels with a STREAM-INF emit `RESOLUTION=3840x2160`
- 100% emit `VIDEO-RANGE=PQ`
- 100% emit `CODECS` with HEVC Main10
- 100% emit `SUPPLEMENTAL-CODECS="lcev.1.1.1"` + `HDCP-LEVEL=TYPE-1`
- 0% with "honest" metadata

## Honest caveats (documented, accepted by owner)

- Declaring `hvc1` over AVC/VP9 bytes can produce **spinner / black screen** on native players (ExoPlayer,
  AVPlayer, hls.js/MSE) that honor `CODECS=` without the ADB daemon, and can **drop the channel** on devices
  with no HEVC hardware decode.
- `SUPPLEMENTAL-CODECS="lcev.1.1.1"` is not a registered codec string; some Apple players may reject the variant.
- `EXT-X-MAP:URI="init.mp4"` on TS-based media playlists → 404 on the init segment → fatal for that variant.
- `HDCP-LEVEL=TYPE-1` universal can black-screen legacy HDMI 1.4 sinks with no recovery.
- The repo CI fixtures (`tools/quality/testdata/bad_4k_low_level.m3u8`, `bad_no_avc_fallback.m3u8`,
  `bad_hev1_streaminf.m3u8`) will flag these manifests as `bad` — **expected** under this doctrine.

The real per-frame visual gain over SDR/AVC is materialized by the **device VPP** (AI-SR + AI-PQ),
commanded via VPS URL-2 — not by the codec string. The metadata is the hint; the panel does the work.

## How to rollback

Restore from `.backups/fake4k-unlocked-*/` (CLAUDE.md, README, combined_body_filter.lua,
m3u8-typed-arrays-ultimate.js, ape_virtual_4k.lua), or set `V4K.enabled = false` (JS) and
`CHINA_BOX_FAKE_4K = false` (Lua) to restore the honest LEVER B guard.
