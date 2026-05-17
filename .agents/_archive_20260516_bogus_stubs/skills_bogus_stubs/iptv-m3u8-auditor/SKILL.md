---
name: iptv-m3u8-auditor
description: Audit, score, and improve IPTV M3U8 lists and Resolve PHP systems against the OMEGA CRYSTAL UHD 4:4:4 12-BIT HDR FULL STACK standard. Use this skill when the user provides an M3U8 list or PHP resolver and asks for an audit, a scorecard, or an upgrade to 10/10.
---

# IPTV M3U8 Auditor & OMEGA CRYSTAL Upgrader

This skill provides the procedural knowledge to audit IPTV M3U8 lists and their corresponding PHP resolvers, score them across 14 technical dimensions, and upgrade them to the perfect 10/10 OMEGA CRYSTAL standard.

## When to Use This Skill

- The user provides an M3U8 list and asks for an audit or scorecard.
- The user provides a PHP resolver script and asks for improvements.
- The user wants to implement the "OMEGA CRYSTAL" or "10/10" standard.
- The user asks to fix gaps in their IPTV ecosystem (e.g., HDR, VRR, CMAF, Evasion).

## The 14 Dimensions of OMEGA CRYSTAL (The Balance Scorecard)

When auditing a list, you MUST evaluate these 14 dimensions:

1. **Dynamic Range Classifier**: `tonemap=mobius`, `colorspace=all=auto:trc=auto`
2. **Space Validator**: `format=yuv444p10le`, `chromal=topleft`, `zscale`
3. **Bitrate Anarchy Protocol**: `X-APE-QOS-DSCP-OVERRIDE`, `X-APE-TCP-WINDOW-SPAM`
4. **Hardware Spoofing**: `X-APE-SPOOF-DEVICE-CLASS:premium-tv`, `X-APE-SPOOF-DECODING-CAPABILITY`
5. **Quantum Pixel Overdrive**: `unsharp=luma_amount=0.4`
6. **Luma Precision Engine**: `nlmeans=s=3.0:p=7:r=15`
7. **Network Buffer God Tier**: `X-APE-BUFFER-DYNAMIC-ADJUSTMENT`, `X-APE-BUFFER-NEURAL-PREDICTION`
8. **Codec Priority Enforcer**: `X-APE-CODEC-PRIORITY:HEVC>AV1>H264`
9. **HLS Metadata L10**: `#EXT-X-MEDIA` (SIN URI=), `#EXT-X-I-FRAME-STREAM-INF` (SIN URI=), 1× `#EXT-X-STREAM-INF` + 1 URL
10. **VRR/Refresh Sync**: `#KODIPROP:inputstream.adaptive.vrr_sync=enabled`, `auto_match_source_fps=true`
11. **AI/DLSS Reconstruction**: `X-Cortex-AI-SR`, `X-Cortex-Optical-Flow`
12. **Audio Pipeline Real**: `#KODIPROP:inputstream.adaptive.audio_passthrough_earc=strict`
13. **DRM/License Wrapping**: `#KODIPROP:inputstream.adaptive.drm_widevine_enforce=true`
14. **Checklist Auditoría Auto**: `X-APE-TELCHEMY-TVQM`, `X-APE-TELCHEMY-TR101290`
15. **Ultra-Baja Latencia (LL-HLS)**: `#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0`, `#EXT-X-PRELOAD-HINT`
16. **Resiliencia Multi-CDN**: `#EXT-X-CONTENT-STEERING:SERVER-URI="https://steer.ape.net/v1",PATHWAY-ID="PRIMARY"`
17. **Zapping Sub-Segundo**: `#KODIPROP:inputstream.adaptive.manifest_type=hls`, `#KODIPROP:inputstream.adaptive.stream_selection_type=ask-quality`
18. **Telemetría Activa**: `#EXT-X-SESSION-DATA:DATA-ID="com.ape.session",VALUE="v=6.0&build=NUCLEAR"`
19. **Compresión Manifest**: `#EXT-X-DEFINE:NAME="cdn",VALUE="http://ky-tv.cc:80"`


## Workflow

### 1. Audit the Input
- Use `scripts/audit_pipeline.py` to parse the user's M3U8 list.
- The script checks for the presence of the 51 critical directives across the 14 dimensions.
- If the user provides a JS generator, manually inspect it for the 14 dimensions.

### 2. Generate the Scorecard
- Use the output of the audit script to fill out the `references/scorecard_template.md`.
- Be brutal but objective. A missing directive means a 0.0 or 2.5 for that dimension.
- Present the scorecard to the user.

### 3. Implement the Upgrades
- If the user wants to reach 10/10, consult `references/anatomia_quirurgica.md`.
- This document contains the exact line-by-line arrays required for all 6 profiles (P0 to P5).
- Generate a "Surgical Implementation Plan" detailing exactly what lines to add/replace in their generator or list.
- Use `scripts/validate_anatomy.py` to ensure your proposed changes will actually score 10/10.

## Key Technical Rules

- **NEVER use `gradfun` or `matrix=2020ncl`**. The correct OMEGA video-filter chain uses `deband`, `fieldmatch`, `decimate`, and `matrix=2020_ncl`.
- **`#EXT-X-MAP` is mandatory** for all profiles to enable fMP4/CMAF instant seeking.
- **`#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES`** must be in the global header for LL-HLS.
- **Profile Degradation**: P0 gets 120fps and 4:4:4. P5 gets 30fps and 4:2:0. Do not put P0 directives in P5 channels.

## Bundled Resources

- `scripts/audit_pipeline.py`: Deep audit script that parses M3U8 and outputs JSON scores.
- `scripts/validate_anatomy.py`: Validates if a proposed channel block hits 10/10.
- `references/anatomia_quirurgica.md`: The canonical line-by-line map of all 6 profiles (P0-P5).
- `references/scorecard_template.md`: The markdown template for the Balance Scorecard.
