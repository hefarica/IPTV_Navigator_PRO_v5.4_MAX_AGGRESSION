# Web Authority — Standards-Grounded Facts (references/web_authority.md)

> **Propósito / Purpose.** Cada hecho aquí es de norma primaria (RFC / ISO / ITU / Apple / nginx) y se ancla explícitamente al *truth-guard* del manifiesto OMEGA que valida. No inventar. No extrapolar más allá de la fuente. Usar como referencia citable por `validate_ape_package.sh`, `truth_guards.md` y cualquier PhD del council.

---

## 1. RFC 8216 §6.3.1 — Unknown-tag rule (forward compatibility)

**Fact.** RFC 8216 §6.3.1 *mandates* (MUST) that compliant HLS clients **ignore any unrecognized tag**, **ignore any attribute/value pair with an unrecognized AttributeName**, and ignore any enumerated-string whose value is unrecognized. Lines beginning with `#EXT` are tags (case-sensitive); other `#` lines are comments and SHOULD be ignored. Unknown tags are inert metadata/pointers — they never execute code or alter playback.

- **Validates truth-guard:** `M3U8 installer` row — `#EXT-X-APE-INSTALLER` is metadata/pointer, the playlist does **not** install or execute code in the player. Also validates the `Wake-on-playback` row — `#EXT-X-APE-WAKE` is inert; the HLS tag itself never wakes a device.
- **Sources:**
  - RFC 8216, §6.3.1 Client Responsibilities — <https://datatracker.ietf.org/doc/html/rfc8216>
  - RFC Editor canonical — <https://www.rfc-editor.org/rfc/rfc8216>
  - draft-pantos-hls-rfc8216bis-17 §4.2 (2nd Edition, same graceful-degradation rule) — <https://datatracker.ietf.org/doc/html/draft-pantos-hls-rfc8216bis-17>

---

## 2. RFC 6381 / ISO 14496-15 — `hvc1` vs `hev1` (GOLDEN RULE)

**Fact.** RFC 6381 (Aug 2011) *predates HEVC* and covers only AVC/H.264; it does **not** define `hvc1`/`hev1`. The HEVC codec-string syntax (`hvc1.profile.tier.Llevel.constraints`) is registered by **ISO/IEC 14496-15 Annex E** via MP4RA. Parameter-set placement:

- `hvc1` → VPS/SPS/PPS parameter sets **out-of-band only**, in the sample entry (`hvcC`). Incompatible with mid-stream resolution change.
- `hev1` → parameter sets **in-band** in the NAL bitstream (and/or out-of-band). Allows mid-stream parameter updates.

**Apple HLS Authoring Spec** explicitly: *"Use `avc1`, `hvc1`, or `dvh1` rather than `avc3`, `hev1`, or `dvhe`."* Apple can decode `hev1` but prefers `hvc1`; some Apple/validated decoders fail on `hev1`. The dotted codec string format is identical for both — only the 4-char identifier differs.

- **Validates truth-guard:** GOLDEN RULE split — `hvc1.*` belongs in `#EXT-X-STREAM-INF CODECS=` (manifest parser role); `hev1.*` belongs in `#KODIPROP`/`#EXTVLCOPT`/`X-APE-CODEC` (decoder-runtime role). They are **not** interchangeable. The contract's `qoe_fallback_policy.primary` listing "HVC1/HEV1" as peers is imprecise and must be corrected.
- **Sources:**
  - ISO/IEC 14496-15 (2019/2022) §8.4.1 — <https://www.iso.org/standard/83336.html>
  - RFC 6381 — <https://www.rfc-editor.org/rfc/rfc6381.html>
  - Apple HLS Authoring Specification — <https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices>
  - Apple Developer Forums (HEVC support, "we do prefer hvc1") — <https://developer.apple.com/forums/thread/132293>
  - W3C WebCodecs HEVC registration — <https://www.w3.org/TR/webcodecs-hevc-codec-registration/>
  - MP4RA codecs — <https://mp4ra.org/registered-types/codecs>

---

## 3. ITU-T H.265 Annex A — Level ↔ Resolution/fps law (Cardinal Law 1)

**Fact.** `level_idc = level × 30`. MaxLumaSR per level (samples/s):

| Codec string | Level | MaxLumaSR (samples/s) | Resolution ceiling |
|---|---|---|---|
| `…L93`  | 3.1 | — | 720p |
| `…L120` | 4.0 | — | 1080p@30 |
| `…L123` | 4.1 | — | 1080p@60 |
| `…L150` | 5.0 | — | 4K@30 |
| `…L153` | 5.1 | 534,773,760 | **4K@60 (techo)** |
| `…L156` | 5.2 | 1,069,547,520 | 4K@120 |
| `…L180` | 6.0 | 1,069,547,520 | 8K@30 |
| `…L183` | 6.1 | 2,139,095,040 | 8K@60 |
| `…L186` | 6.2 | 4,278,190,080 | 8K@120 |

**Precision (per web research).** A player rejects a variant when the content's required luma sample rate *exceeds* the declared level's MaxLumaSR. Declaring `hvc1.2.4.L153.B0` on an **8K@120** stream is impossible — L153 caps at 4K@60 — and is the exact illegal declaration documented in the **2026-06-08 freeze post-mortem** (commit 7103cfd). Level 5.2 and 6.0 share MaxLumaSR but differ in MaxLumaPS (spatial ceiling): 5.2 = 4K, 6.0 = 8K. Both constraints (rate AND picture size) apply per tier.

- **Validates truth-guard:** NEW `HEVC Level↔Resolution` row (currently ABSENT). The declared `level_idc` MUST be able to carry the declared `RESOLUTION` + fps. This is the single most costly regression in repo history.
- **Sources:**
  - HEVC tiers/levels reference table — <https://en.wikipedia.org/wiki/High_Efficiency_Video_Coding_tiers_and_levels>
  - ITU-T Rec. H.265 (06/2019) Annex A / ISO 23008-2 §A.4 — <https://www.itu.int/rec/T-REC-H.265>
  - ATSC A/341:2023-03 Video HEVC — <https://www.atsc.org/wp-content/uploads/2023/04/A341-2023-03-Video-HEVC.pdf>

---

## 4. RFC 8216 + ISO 23000-19 — CMAF/fMP4 requires `EXT-X-MAP` (no fake CMAF)

**Fact.** *"Each fMP4 Segment in a Media Playlist MUST have an `EXT-X-MAP` tag applied to it."* A legitimate CMAF/fMP4 declaration requires: (1) `EXT-X-MAP` → a CMAF Header init segment; (2) the init segment contains `ftyp` (brand `iso6`+) followed by `moov` with **zero-sample** Track Boxes matching every media track; (3) `EXT-X-VERSION ≥ 6` when `EXT-X-MAP` is used without `EXT-X-I-FRAMES-ONLY` (version 5 only if I-frames-only present); (4) conformance to ISO/IEC 23000-19 profiles + CENC 3rd-Ed encryption. Absence of `EXT-X-MAP` disqualifies the CMAF declaration. "Fake CMAF" is detectable by validator tooling (DASH-IF conformance validator).

- **Validates truth-guard:** NEW CMAF row — emit `ape-container=fmp4-cmaf,verified=true` only if probe found `EXT-X-MAP` + `.m4s`/`init.mp4`. CLAUDE.md §"0 declaraciones CMAF falsas".
- **Sources:**
  - RFC 8216 (fMP4 / EXT-X-MAP) — <https://datatracker.ietf.org/doc/html/rfc8216>
  - ISO/IEC 23000-19:2024 CMAF — <https://www.iso.org/standard/85623.html>
  - Apple — CMAF with HLS — <https://developer.apple.com/documentation/http-live-streaming/about-the-common-media-application-format-with-http-live-streaming-hls>
  - draft-pantos-hls-rfc8216bis-18 (version-6 requirement) — <https://datatracker.ietf.org/doc/html/draft-pantos-hls-rfc8216bis-18>
  - Unified Streaming — CMAF conformance — <https://www.unified-streaming.com/blog/cmaf-conformance-is-this-really-cmaf>

---

## 5. RFC 8216bis — `VIDEO-RANGE` PQ/HLG (no fake HDR)

**Fact.** `VIDEO-RANGE` uses RFC 2119 normative **MUST**: declare `SDR` for TransferCharacteristics code points 1, 6, 13, 14, 15; `PQ` only for code point **16** (SMPTE ST 2084); `HLG` only for code point **18** (ARIB STD-B67). Mixed content takes highest precedence (PQ > HLG > SDR). Declaring `VIDEO-RANGE=PQ` on SDR content is a spec violation ("fake HDR"). Clients enforce via the MediaCapabilities API and refuse playback on non-HDR hardware regardless of what is encoded — declaration MUST be truthful. PQ = absolute luminance (0–10,000 nits); HLG = relative scene-referred (~1,000 nits nominal) per ITU-R BT.2100.

- **Validates truth-guard:** NEW `VIDEO-RANGE` row — emit `PQ`/`HLG` only if probe detected code point 16/18 in HEVC SPS VUI. CLAUDE.md §"0 declaraciones HDR falsas". Also grounds the S4 `MaxCLL ≥ MaxFALL` invariant (EBU R103-4, MaxFALL = round(MaxCLL × 0.25)) and the `SUPPLEMENTAL-CODECS` prohibition (`lcev.1.1.1` invented = forbidden).
- **Sources:**
  - draft-pantos-hls-rfc8216bis (VIDEO-RANGE) — <https://datatracker.ietf.org/doc/html/draft-pantos-hls-rfc8216bis>
  - Apple HLS Authoring Spec — <https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices>
  - ITU-R BT.2100-2 (PQ/HLG) — <https://glenwing.github.io/docs/ITU-R-BT.2100-2.pdf>
  - HEVC TransferCharacteristics (H.Sup19) — <https://www.itu.int/rec/T-REC-H.Sup19>
  - Apple What's New in HLS (WWDC 2025) — <https://developer.apple.com/streaming/Whats-new-HLS.pdf>

---

## 6. ADB security model — cannot be remotely enabled; per-host RSA

**Fact.** ADB wireless/USB debugging **cannot** be enabled remotely. Enabling requires on-device user action: reveal Developer options (tap build number 7×), toggle USB/Wireless debugging, and accept the per-host RSA-key dialog (Android 4.2.2+). Wireless pairing (Android 11+) needs a 6-digit pairing code or QR scanned by the user. The host RSA key pair lives at `$HOME/.android/adb_key`; the device stores authorized public keys and verifies the signature on each connection — every host authorizes independently. No playlist or VPS can force-enable ADB.

- **Validates truth-guard:** `ADB` row — bootstrap requires a host where ADB is installed, enabled, and authorized for the target device; ADB can **never** be enabled remotely or forced by the playlist/VPS.
- **Sources:**
  - Android Debug Bridge (adb) — <https://developer.android.com/tools/adb>
  - Run apps on a hardware device — <https://developer.android.com/studio/run/device>
  - Configure on-device developer options — <https://developer.android.com/studio/debug/dev-options>
  - AOSP adb module — <https://android.googlesource.com/platform/packages/modules/adb/>

---

## 7. nginx / OpenResty `log_by_lua` — post-response, but worker-blocking

**Fact.** The log phase (`NGX_HTTP_LOG_PHASE`) is the final request phase, executing **after** `ngx_http_finalize_request()` and after the response is fully transmitted to the client. `$request_time` spans first client byte → log write after last byte sent — proving logging is post-transmission. Therefore `log_by_lua` adds **zero** latency to TTFB / response delivery. **Caveat:** a blocking I/O call inside `log_by_lua` (synchronous HTTP sub-request, DNS lookup, large file read) blocks the nginx **worker process** for all concurrent requests, even though the already-sent response is unaffected. Safe pattern: `io.open()` append on `/dev/shm` (sub-µs) or `ngx.shared.DICT:set()`; for heavier work use `ngx.timer.at(0, …)` with non-blocking cosockets.

- **Validates truth-guard:** `Implementation guardrails` — "Keep Nginx and HLS serving non-blocking." This is correct for response delivery; the row must add the worker-process nuance so a future agent does not add a synchronous HTTP call to `ape_wake_on_manifest.lua` believing the log phase is universally safe to block. The current `io.open('/dev/shm/ape_wake_queue','a')` is safe at current load.
- **Sources:**
  - nginx HTTP log module ($request_time) — <https://nginx.org/en/docs/http/ngx_http_log_module.html>
  - nginx development guide (phase ordering) — <https://nginx.org/en/docs/dev/development_guide.html>
  - OpenResty lua-nginx-module (log_by_lua) — <https://github.com/openresty/lua-nginx-module#log_by_lua>
  - OpenResty reference (log phase, post-response) — <https://openresty-reference.readthedocs.io/en/latest/Directives/>

---

> **Caveat final (obligatorio en todo reporte de esta clase).** Playlist anchors are metadata. Real installation and wake require a deployed VPS path plus an authorized ADB host/device or a compatible player/device runtime. Local static checks do not prove systemd, Nginx, PHP-FPM, Lua runtime, ADB authorization, or Android device behavior on the production VPS.