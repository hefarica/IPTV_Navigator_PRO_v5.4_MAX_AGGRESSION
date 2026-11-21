# TARGETDURATION rules and dynamic resolution

## Contents

1. The RFC rule
2. Master vs media playlist
3. Why a fixed 2 breaks 4/6 s segments
4. Dynamic resolver pattern
5. Verification
6. Common defects

## 1. The RFC rule

RFC 8216 §4.3.3.1 defines `#EXT-X-TARGETDURATION` as the maximum Media Segment duration in the playlist. It is an integer. Every `#EXTINF` duration in the playlist must be less than or equal to it.

Consequences:

- 4.0 s segment → `TARGETDURATION:4`
- 4.5 s segment → `TARGETDURATION:5` (round up, never down)
- 6.0 s segment → `TARGETDURATION:6`
- A playlist mixing 2, 4 and 6 s segments → `TARGETDURATION:6`

Rounding down is a protocol violation, not an optimization.

## 2. Master vs media playlist

`TARGETDURATION` belongs to a Media Playlist. A Master Playlist must not contain it. If an existing generator emits it in a master-style header, fix the value rather than adding more copies. Do not add it to a master that correctly omits it.

Per-channel `#EXTINF` entries in an IPTV catalog are not HLS media segments. A catalog that lists channel URLs is not a media playlist. Do not "fix" it by adding `TARGETDURATION` per channel.

## 3. Why a fixed 2 breaks 4/6 s segments

A player uses `TARGETDURATION` to estimate the live edge and reload timing. If the manifest says 2 but segments are 4 s:

- the player expects a new segment every 2 s;
- it reloads before the segment exists;
- it retries, and the retry competes with the next segment download;
- the buffer drains and the user sees rebuffering.

The failure looks like a network problem. It is a manifest timing problem. This is why a per-channel rebuffer ratio can be high on a channel whose throughput is fine.

## 4. Dynamic resolver pattern

Resolve from the most specific source to the least:

```js
function resolveTargetDuration(options = {}) {
    const profiles = options.bulletproof_profiles || {};
    const masterId = options.masterProfile || 'P0';
    const profile = profiles[masterId] || {};
    const settings = profile.settings || {};
    const candidates = [
        options.segment_duration_s,
        options.segment_duration,
        settings.segment_duration_s,
        settings.segment_duration,
        profile.segment_duration_s,
        profile.segment_duration
    ];
    for (const raw of candidates) {
        if (raw === null || raw === undefined || raw === '') continue;
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) return Math.max(1, Math.ceil(n));
    }
    return 2;
}
```

Use it once in the template:

```js
#EXT-X-TARGETDURATION:${targetDuration}
```

Export the resolver (`resolveTargetDuration`) so a regression test can call it without generating a full list.

Why accept strings: LAB exports `"4"`, while code may pass `4`. Why `Math.ceil`: `TARGETDURATION` must be an integer and must not be smaller than the segment. Why fallback 2: it preserves the previous behavior only when no source declares a duration.

## 5. Verification

For each declared duration, assert:

```
resolveTargetDuration({segment_duration_s: 2}) === 2
resolveTargetDuration({segment_duration_s: 4}) === 4
resolveTargetDuration({segment_duration_s: 6}) === 6
resolveTargetDuration({segment_duration_s: 4.5}) === 5
resolveTargetDuration({segment_duration_s: ''}) === 2
```

Then generate the header and assert the emitted tag:

```
#EXT-X-TARGETDURATION:2
#EXT-X-TARGETDURATION:4
#EXT-X-TARGETDURATION:6
```

Also assert that the source no longer contains the literal `#EXT-X-TARGETDURATION:2` and that it contains the variable form.

If the LAB is available, assert that P0's `settings.segment_duration_s` is what the resolver returns. A resolver that works with a synthetic option but ignores the real LAB is not fixed.

## 6. Common defects

| Defect | Symptom | Fix |
|---|---|---|
| Literal 2 with 4/6 s segments | Reload before segment exists; rebuffering | Dynamic resolver + `Math.ceil` |
| Literal updated in one branch only | Works in MAX_QUALITY, fails in default | Search all template branches |
| `X-Segment-Duration` still `'2'` | Player and manifest disagree | Resolve the same duration for headers |
| `PART-INF:PART-TARGET` inconsistent with segment | LL-HLS part timing wrong | Derive part target from segment or document the fixed part size |
| `TARGETDURATION` added to a master | Strict parsers reject the playlist | Remove it; keep it in media playlists |
| Resolver reads only `options.segment_duration` | LAB `settings.segment_duration_s` ignored | Add all profile shapes to the candidate list |
| Resolver rounds with `Math.round` | 4.5 → 4, smaller than the segment | Use `Math.ceil` |
