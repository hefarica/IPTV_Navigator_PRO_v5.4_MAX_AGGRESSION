---
description: Mandatory rules to follow when generating or modifying M3U8 lists
---

# M3U8 Generation Rules

Before generating or modifying ANY M3U8 list, read the skill at:
`skills_extracted/profile_sync_rule/SKILL.md`

## Quick Summary (read the full skill for details):

1. **NO profile is "default"** — the Channel Classifier assigns P0-P5 per channel
2. **Each profile has its own values** — bitrate, T1, T2, buffer, prefetch all differ
3. **Per-channel pipeline** — every builder gets `cfg` and `profile` for THAT channel
4. **Dynamic Bridge v2.0** — always call `getProfileConfig(profile)`, never read PROFILES directly
5. **ALL 19 PM categories** — 140+ headers must appear via PM-INJECT
6. **Computed metrics** — calculated from profile values, never hardcoded
7. **Three output layers** — EXT-X-APE tags, EXTHTTP headers, resolver ctx payload
8. **Verify after generation** — check console for Bridge and PM-INJECT messages
