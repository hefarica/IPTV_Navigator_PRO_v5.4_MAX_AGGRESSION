# Buffer semantics and value selection

## Contents

1. Three layers that are not the same
2. Field reference
3. Choosing a target
4. Cross-segment rule
5. RAM budget
6. Throughput deficit
7. Per-channel triage
8. Anti-patterns

## 1. Three layers that are not the same

| Layer | What it controls | Typical fields |
|---|---|---|
| Manifest/player target | How far ahead the player wants to download | `X-Buffer-Target`, `X-Buffer-Min`, `X-Buffer-Max`, `#EXT-X-APE-BUFFER-STRATEGY` |
| ExoPlayer LoadControl | When playback starts, how much is kept, when it resumes after a stall | `minBufferMs`, `maxBufferMs`, `bufferForPlaybackMs`, `bufferForPlaybackAfterRebufferMs` |
| Source buffering | VLC/Kodi/ISA network cache | `network-caching`, `live-caching`, `inputstream.adaptive.*buffer*` |

Do not answer "what buffer value" without naming the layer. A 45 s `minBufferMs` and a 15 s `X-Buffer-Target` can coexist in the same manifest and contradict each other.

## 2. Field reference

| Field | Unit | Meaning | Common mistake |
|---|---|---|---|
| `X-Buffer-Target` | ms | Target lead during steady playback | Treated as "buffer before start" |
| `X-Buffer-Min` | ms | Floor before the target is considered critical | Set equal to target, leaving no margin |
| `X-Buffer-Max` | ms | Ceiling for the target | Set to 10× target and called "infinite" |
| `minBufferMs` | ms | LoadControl working floor | Confused with `bufferForPlaybackMs` |
| `maxBufferMs` | ms | LoadControl ceiling | Raised to 180 s at 4K without RAM math |
| `bufferForPlaybackMs` | ms | Buffer before initial playback | Raised too high, slowing zapping |
| `bufferForPlaybackAfterRebufferMs` | ms | Buffer before resuming after a stall | Left at 1000 ms, causing re-stall loops |
| `hls.js maxBufferLength` | s | hls.js target | Left at 130 s while the manifest says 24 s |
| `network-caching` | ms | VLC/ffmpeg network cache | Confused with the player's target |

## 3. Choosing a target

Use a policy curve by bitrate, then check the RAM it implies:

| Bitrate | Target |
|---|---|
| ≤ 25 Mbps | 30 s |
| 25–80 Mbps | 24 s |
| 80–150 Mbps | 20 s |
| > 150 Mbps | 12–15 s |

A fixed megabyte budget alone is misleading: 256 MB at 50 Mbps allows 41 s, but the recommendation is 24 s; at 150 Mbps it allows only 13.6 s, but 20 s may be the better quality/latency trade-off. The policy curve keeps 2/4/6 s segments viable while bounding RAM.

Then derive the rest:

```
X-Buffer-Target = target_s * 1000
X-Buffer-Min    = round(target_s * 0.625) * 1000
X-Buffer-Max    = target_s * 2 * 1000
Exo minBufferMs = round(target_s * 1.25) * 1000
Exo maxBufferMs = round(target_s * 3.75) * 1000
after rebuffer  = 3000 ms
```

At 24 s this produces exactly 24.000 / 15.000 / 48.000 and 30.000 / 90.000 / 3.000.

Run `scripts/buffer_budget.py --bitrate-mbps 50 --segment-s 2` to get the numbers and the RAM estimate. Do not hand-calculate.

## 4. Cross-segment rule

For live HLS, a target of **24 s** is the best single value across 2, 4 and 6 s segments:

| Segment | Segments in 24 s | Verdict |
|---|---|---|
| 2 s | 12 | comfortable |
| 4 s | 6 | minimum comfortable |
| 6 s | 4 | acceptable, but 30 s is safer |

Below 12 s the margin collapses: 6 segments of 2 s, 3 of 4 s or 2 of 6 s. One slow segment plus one retry drains it.

For 6 s segments, prefer 30 s. For bitrates above 80 Mbps, prefer 20 s to keep RAM bounded.

## 5. RAM budget

Memory = seconds × Mbps / 8.

| Buffer | 25 Mbps | 50 Mbps | 100 Mbps | 150 Mbps |
|---|---|---|---|---|
| 12 s | 38 MB | 75 MB | 150 MB | 225 MB |
| 15 s | 47 MB | 94 MB | 188 MB | 281 MB |
| 20 s | 63 MB | 125 MB | 250 MB | 375 MB |
| **24 s** | **75 MB** | **150 MB** | **300 MB** | **450 MB** |
| 30 s | 94 MB | 188 MB | 375 MB | 562 MB |
| 45 s | 141 MB | 281 MB | 562 MB | 844 MB |

A 45 s target at 150 Mbps is 844 MB. That is not "infinite buffer"; it is a memory leak with a timer.

## 6. Throughput deficit

If sustained throughput is below the bitrate, the buffer drains no matter its size. With a 24 s buffer:

| Deficit | Playback before empty |
|---|---|
| −10 % | 240 s |
| −20 % | 120 s |
| −30 % | 80 s |

A larger buffer buys time; it does not fix a provider that delivers below real time. If the buffer drains systematically, investigate variant, segment duration, CDN or provider before raising the number.

## 7. Per-channel triage

1. Count rebuffers and requests per channel. A global ratio hides a single bad channel.
2. Treat a channel with fewer than ~100 requests as an inconclusive sample.
3. For a channel with a real ratio, raise the target one tier (24 → 30 s) and `bufferForPlaybackAfterRebufferMs` to 3000 ms.
4. Do not lower bitrate to improve the ratio. That trades image quality for a metric.
5. Re-measure after a meaningful sample. Do not tune on noise.

## 8. Anti-patterns

- "Set it to 600 s so it never stalls." It increases zapping latency and RAM; it does not create throughput.
- "Lower the bitrate of the bad channels." Degrades image quality and violates a quality-first policy.
- "Use the same value for 2, 4 and 6 s segments without checking segments-in-target." 24 s works; 12 s does not.
- "`minBufferMs` is the startup buffer." No: `bufferForPlaybackMs` is.
- "`bufferForPlaybackAfterRebufferMs: 1000` is aggressive." It is self-defeating: it resumes in a near-empty buffer.
- "The manifest says 45 s, so the player uses 45 s." Check which layer the player actually reads.
