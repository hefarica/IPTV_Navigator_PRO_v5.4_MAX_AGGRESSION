---
name: iptv-suprema-2026-premium
description: SUPREMA 2026 PREMIUM — Use when the user asks for the IPTV PREMIUM profile, an end-to-end IPTV list/channel analysis, the APE REA image-processing recipe, profile planning P0-P5, reliability review, or a reproducible command-driven audit. Encodes the four-scope model (source, APE classification, reconstruction/display, manifest variant), the documented image pipeline, list construction, transport/continuity, and evidence states. No quality verdict unless requested; no fabricated bitstream or audio facts.
version: 2026.1.0
metadata:
  type: anchor
  profile: IPTV_PREMIUM
  base: creador_habilidades
  source_corpus: White Paper APE REA v1.2 + Adicional AXN/Deportes v1.2 + Validacion_entrega_v1_2 + live list audit
---

# IPTV SUPREMA 2026 PREMIUM — APE REA

## 1. Purpose

Turn the supplied APE REA corpus into an operating profile that can:

1. Explain how an IPTV list is constructed.
2. Describe, without judging, how a channel's image is declared/processed.
3. Plan profiles P0–P5 and the `IPTV_PREMIUM` composition.
4. Audit a list/channel with reproducible evidence.
5. Separate **declared**, **observed**, **resolved**, **applied**, and **verified** states.
6. Preserve reliability and image-quality intent without inventing bitstream facts.

## 2. Inherited base

Base skill: `creador_habilidades` (archived at
`.agents/_archive_20260516_bogus_stubs/skills_bogus_stubs/creador_habilidades/SKILL.md`).

Inherited rules:

- Analyze the request before creating anything.
- Use a short `snake_case` directory name.
- `SKILL.md` is mandatory.
- Add `scripts/`, `examples/`, `resources/` when complexity requires it.
- Write documentation in Spanish, technical and structured.
- Validate before declaring done.

`IPTV_PREMIUM` extends that base with the APE REA architecture and IPTV evidence model.

## 3. Evidence corpus

Read these sources when the task needs them:

| Source | Role |
|---|---|
| `White_Paper_APE_REA_4K_6K_8K_v1_2.docx` | Architecture, modules, profiles, image pipeline, fallback, AXN chapter 17 |
| `Adicional_APE_REA_Catalogo_AXN_Deportes_v1_2.docx` | D4 catalog, D5 sports, D6 AXN, D7 F1 Velocity |
| `Validacion_entrega_v1_2.json` | Document validation status and scope limits |
| `artifacts/audit/2026-11-02_APE_LISTA_1793589060441/` | Live structural audit, sample HTTP, channel block, channel analysis |

Documented hashes and counts:

```text
D6 AXN: 973 registros, 200 campos EXTHTTP, 8.124 bytes, 26 overflow
D4: 10.315.662 líneas, 10.573 canales, 10.573 URLs únicas
P4 7.457 · P3 2.308 · P1 808
```

Do not extend these numbers to a different list without re-measuring.

## 4. Core model: four scopes

The central design is **contradicción intencional por ámbito**. The same channel can hold different values because each value belongs to a different scope:

| Scope | Example AXN | Consumer |
|---|---|---|
| Source observation | 1280×720, 30 fps, HEVC L93, SDR | Decoder/session record |
| APE classification | 1920×1080, P4, verification false | Profile selector |
| Reconstruction | Real-ESRGAN ×4 → 5120×2880 or 7680×4320 | Image engine |
| Presentation target | 3840×2160 (4KFALSE; 8KFAKE target display) | Display policy |
| Manifest variant | 3840×2160, PQ, HEVC L153, 30 fps | HLS player |

Never collapse these into one “real” value. Report the scope of every value.

## 5. Evidence states

Use exactly one state per claim:

```text
declared   — appears in a document, tag, header or profile
observed   — measured from a real response/bitstream
resolved   — a rule selected one value for a session
applied    — an engine/player reports it executed
verified   — independently reproduced with evidence
```

Examples:

- `RESOLUTION=3840x2160` in `STREAM-INF` is **declared**.
- `X-Resolution: 1280x720` in `EXTHTTP` is **declared** for another scope.
- A live `ffprobe` result is **observed**.
- A player receipt with `applied_operations` is **applied**.
- A re-run with the same hash and measurements is **verified**.

## 6. List anatomy

For the audited list:

```text
604.593.696 bytes
10.315.662 lines
10.573 channels
10.573 unique URLs
1 host: line.tivi-ott.net
100% HTTP
1 credential pair for 10.573 URLs
EST-X-MAP: 0 in the catalog
```

Per channel:

```text
~975 lines
133 EXTVLCOPT
103 KODIPROP
54 EXTATTRFROMURL
614 EXT-X-APE-*
25 EXT-X-CMAF*
20 EXT-X-VNOVA-*
18 EXT-X-PHANTOM-*
1 EXTHTTP object (200 fields; 8.124 bytes)
1 URI
```

Generator chain:

```text
LAB Excel -> profile JSON -> APE generator -> per-channel headers/tags -> M3U8 -> player
```

## 6.1 REA reverse-engineering method

Use this order; do not skip evidence acquisition:

1. **Inventory** the supplied artifacts (DOCX, PDF, JSON validation, live list, channel block).
2. **Extract** structure: document XML/JSON, playlist lines, headers, blocks.
3. **Hash and date** every source; record scope limits.
4. **Compare** documentation against the live list; keep differences, do not reconcile them by guessing.
5. **Classify** every value into one of the four scopes.
6. **Build** the profile/recipe from documented values.
7. **Validate** JSON/frontmatter/commands.
8. **Report** with states and limits.

REA outputs are not a claim of runtime quality. They are a traceable reconstruction of declarations plus whatever was actually observed.

## 6.2 How the audited list was built

Documented/live construction chain:

```text
LAB Excel
  -> per-profile JSON (P0-P5)
  -> APE generator
  -> per-channel EXTVLCOPT / KODIPROP / EXT-X-APE / EXTHTTP / EXT-X-CMAF / URI
  -> M3U8 catalog
  -> player/session
```

Catalog numbers:

```text
10.315.662 lines
188 header lines before first channel
10.573 channels
10.573 unique URLs
975,643 lines/channel after header
P4 7.457 / P3 2.308 / P1 808
```

AXN block (D6):

```text
1 EXTINF
133 EXTVLCOPT
103 KODIPROP
54 EXTATTRFROMURL
614 EXT-X-APE-*
25 EXT-X-CMAF*
20 EXT-X-VNOVA-*
18 EXT-X-PHANTOM-*
1 EXTHTTP (200 fields, 8.124 bytes)
1 URI
= 973 registros
```

This is the concrete evidence for “how the list was created”: per-profile template + per-channel identity + APE metadata + transport headers, not a single hand-written playlist.

## 6.3 Reliability observed

| Signal | Observation |
|---|---|
| Host concentration | 10.573/10.573 URLs on `line.tivi-ott.net` |
| Transport | 100% HTTP; one credential pair embedded |
| Sample HTTP | 50 probed: 46×200, 4×407 |
| Redirect | 302 → 200 `application/x-mpegURL` |
| Direct re-fetch after sample | 461/509 observed |
| Full health | not measured |
| Multi-CDN | not present |

Reliability claim must match this evidence: the list has a single logical origin and a rate/connection ceiling; a sample is not proof of all-channel health.

## 6.4 What “supreme image quality” means here

“Suprema” is the **composition target**, not a measured guarantee:

```text
source truth
+ APE classification
+ spatial/neural reconstruction
+ display target
+ manifest variant
+ fallback ladder
+ buffer/continuity
+ evidence receipt
```

The list declares 4K/PQ/HEVC L153 and AI-SR/RIFE/LCEVC/HDR paths. It cannot be called verified 4K/PQ unless the bitstream and the applied engine are independently observed. The skill must say `declared` until then.

## 7. Image pipeline

### 7.1 Spatial (VLC)

```text
hqdn3d=luma_spatial=2.0:chroma_spatial=1.5:
       luma_tmp=3.0:chroma_tmp=2.5,
yadif=mode=1:parity=-1:deint=0,
unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.25:
        chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,
minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:
             vsbmc=1:me=epzs:scd=0
```

Order: denoise → deinterlace → sharpen → temporal interpolation.
This chain is applied only by a player that honors `#EXTVLCOPT:video-filter` (VLC-class); it is not a server-side operation.

### 7.2 Neural / adaptive (Kodi-class)

```text
video_ai_sr=true
video_ai_sr_model=realesrgan
video_ai_sr_scale=4
video_ai_fi=true
video_ai_fi_model=rife_v4
video_vrr=true
LCEVC phase 4
```

Effect depends on the player/daemon implementing those private keys. Never claim they ran without a receipt.

### 7.3 Super-resolution geometry

```text
1280x720  -> x4 -> 5120x2880 -> 3840x2160
1920x1080 -> x4 -> 7680x4320 -> 3840x2160
```

Keep `model_scale=4`, `intermediate_size`, `presentation_size` and any final downscale as separate fields.

### 7.4 Color / HDR

```text
hdr_mode=SDR, hdr_nits=100
BT2020, BT2020_NCL, BT1886, 10-bit
HABLE tone mapping, PEAK=100, REF=203
VIDEO-RANGE=PQ on the variant
HLG/HDR10/HDR10+/DV profile 8 as declared alternatives
```

Report each as its own scope. Do not treat `VIDEO-RANGE=PQ` as proof of a PQ bitstream.

### 7.5 Audio

Three planes:

```text
APE audio tags:        Atmos/DTS-X/TrueHD/EAC3 enabled
KODIPROP policy:      those four false; AC3/AAC true
Variant:              mp4a.40.2 announced
```

These are declarations. The real tracks require probe/session evidence.

## 8. Profiles and IPTV_PREMIUM

| Profile | Intended use | Mandatory separation |
|---|---|---|
| P0 | 8K/4K master | declared vs verified |
| P1 | 4K premium | source resolution, display target |
| P2 | QHD | no 8K claim |
| P3 | FHD | source/display, no fake HDR |
| P4 | HD/720p | enhancement opt-in |
| P5 | SD | no 4K claim |

`IPTV_PREMIUM` is a composition, not a replacement for P0–P5:

```text
source truth
+ profile selection by capability
+ spatial/neural recipe
+ display target
+ transport/continuity
+ fallback ladder
+ evidence receipts
```

Never label a source FHD as 4K real. Never degrade 4K video to fix audio. Audio-only fallback is allowed when explicitly declared.

## 9. Reliability and continuity

- Preserve one URL per channel (anti-509).
- Separate 302→200 from 407/509. 407 is restriction/subscription; 509 is bandwidth/limit; neither is a dead channel by itself.
- Buffer/prefetch values are transport policy; they do not create pixels.
- `EXTHTTP` must remain valid JSON and below 8,192 bytes when the player enforces that limit.
- CMAF/LL-HLS requires real `EXT-X-MAP`, `EXT-X-PART`, server control and a media manifest. Catalog tags alone are declarations.
- Multi-CDN/failover is a reliability requirement; a single host is a concentration risk.

## 10. Commands

```text
/suprema-2026
/suprema-2026 audit <list-or-url>
/suprema-2026 channel <index|name> <list>
/suprema-2026 recipe <P0..P5>
/suprema-2026 profile IPTV_PREMIUM
/suprema-2026 preset <name>
/suprema-2026 verify <evidence-path>
```

The command loads `profiles/IPTV_PREMIUM.json`, this skill, and the evidence corpus.

## 11. Procedure

1. Identify target: list, channel, profile or evidence.
2. Read `profiles/IPTV_PREMIUM.json` and this skill.
3. Acquire evidence; record source hash and scope.
4. Analyze structure; never probe 10k URLs without rate-limit control.
5. For a channel, extract its complete block and map each value to a scope.
6. Describe image path in order: source → profile → spatial → neural → display → variant.
7. Separate `declared/observed/resolved/applied/verified`.
8. Produce a report; do not judge quality unless asked.
9. If asked to judge, state criteria and evidence explicitly.
10. Record limits; never fill missing values.

## 12. Golden rules

1. Do not fabricate resolution, codec, HDR, audio, CMAF, latency or quality.
2. Do not present a declaration as a measurement.
3. Do not conflate source, classification, reconstruction and presentation.
4. Do not call a channel “4K real” from `STREAM-INF` alone.
5. Do not claim AI-SR/RIFE/LCEVC ran without a receipt.
6. Do not expose credentials; redact URLs in reports.
7. Do not hammer a provider with a 10k probe.
8. Do not issue a quality verdict when the user asked only for mechanics.
9. Do not modify VPS, LAB or production lists from this skill.
10. Keep the creator-skill discipline: validate before claiming done.

## 13. Outputs

- `IPTV_PREMIUM` profile summary.
- Channel/layer map.
- Recipe and fallback ladder.
- Structural audit with artifact paths.
- Evidence table with states and limits.
- Optional command report under `.agents/reports/suprema-2026_<timestamp>.md`.

## 14. Validation

```bash
python .agents/skills/iptv-suprema-2026-premium/scripts/validate_suprema_profile.py profiles/IPTV_PREMIUM.json
python -m json.tool profiles/IPTV_PREMIUM.json >/dev/null
python -m json.tool .agents/skills/iptv-suprema-2026-premium/fixtures/min_profile.json >/dev/null
```

A profile is valid only if JSON parses, required keys exist, `based_on=creador_habilidades`, and every maturity score has an evidence note.






## 8.1 Presets disponibles

```text
suprema_4k   4K/PQ composition
axn_159      canal #159, 720p/1080p source -> 4K display
sports_60    D5 sports 60 fps
f1_velocity  D7 50 fps, interpolation off
safe_sdr     SDR fallback
low_latency  declared LL/CMAF
```

Todos con `verified: false` hasta recibir bitstream/recibo.

