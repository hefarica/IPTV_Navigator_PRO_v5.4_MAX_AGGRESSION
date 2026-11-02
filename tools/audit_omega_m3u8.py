#!/usr/bin/env python3
"""Read-only OMEGA/Crystal M3U8 scorer for the iptv-m3u8-auditor skill.

Usage:
  python3 tools/audit_omega_m3u8.py <list.m3u8|list.m3u8.gz> [label]

It streams the list, keeps unique directive lines, and scores the 14 skill
dimensions plus the 5 additional dimensions declared by the skill. It never
modifies the playlist.
"""
import collections
import gzip
import json
import re
import sys

DIMENSIONS = {
    "D1 Dynamic Range Classifier": ("8", [("colorspace=all=auto", ""), ("tonemap=mobius", ""), ("trc=auto", ""), ("zscale=transfer=st2084", "")]),
    "D2 Space Validator": ("7", [("format=yuv444p", ""), ("range=limited", ""), ("chromal=topleft", ""), ("deband", "")]),
    "D3 Bitrate Anarchy Protocol": ("9", [("ANTI-CUT-ISP-STRANGLE", ""), ("bandwidth_ramp=true", ""), ("bandwidth_ramp_peak=100000000", ""), ("OMEGA-ENGINE-BANDWIDTH-MONITOR", "")]),
    "D4 Hardware Spoofing": ("7", [("X-Device-Class", ""), ("X-Decoding-Capability", ""), ("SHIELD-TV-PRO", ""), ("AppleTV14,1", "")]),
    "D5 Quantum Pixel Overdrive": ("7", [("yuv444p10le", ""), ("yuv444p", ""), ("saturation", ""), ("QUANTUM-PIXEL", "")]),
    "D6 Luma Precision Engine": ("8", [("unsharp=luma", ""), ("hqdn3d", ""), ("nlmeans", ""), ("LUMA-GAMMA", "")]),
    "D7 Network Buffer God Tier": ("9", [("network-caching", ""), ("BUFFER-STRATEGY:ADAPTIVE_PREDICTIVE_NEURAL", ""), ("BUFFER-PRELOAD-SEGMENTS:30", ""), ("BUFFER-DYNAMIC-ADJUSTMENT:ENABLED", "")]),
    "D8 Codec Priority Enforcer": ("8", [("preferred_codec=hevc", ""), ("video_codec_override=hevc", ""), ("AV1-FALLBACK-CHAIN", ""), ("CODEC-PRIORITY", "")]),
    "D9 fMP4/CMAF Pipeline": ("8", [("TRANSPORT-PROTOCOL:CMAF_UNIVERSAL", ""), ("TRANSPORT-CHUNK-SIZE:200MS", ""), ("TRANSPORT-FALLBACK-1:HLS_FMP4", ""), ("EXT-X-SERVER-CONTROL", "")]),
    "D10 VRR/Refresh Sync": ("7", [("vrr_sync", ""), ("tunneling_enabled=true", ""), ("CORTEX-CONSTANT-FRAME-RATE", ""), ("CORTEX-OPTICAL-FLOW-MINTERPOLATE", "")]),
    "D11 AI/DLSS Reconstruction": ("9", [("CORTEX-AI-SUPER-RESOLUTION", ""), ("CORTEX-AI-SPATIAL-DENOISE", ""), ("CORTEX-LCEVC", ""), ("CORTEX-TEMPORAL-ARTIFACT-REPAIR", "")]),
    "D12 Audio Pipeline Real": ("7", [("dolby_atmos", ""), ("audio_passthrough", ""), ("AUDIO-FALLBACK", ""), ("earc", "")]),
    "D13 DRM/License Wrapping": ("6", [("drm_widevine", ""), ("EXT-X-KEY", ""), ("DRM-FAIRPLAY", ""), ("PSSH", "")]),
    "D14 Checklist Auditoria": ("8", [("TELEMETRY-TVQM", ""), ("TELEMETRY-TR101290", ""), ("IMPAIRMENT-GUARD", ""), ("AUDIT-", "")]),
    "D15 LL-HLS": ("6", [("EXT-X-SERVER-CONTROL", ""), ("EXT-X-PART-INF", ""), ("EXT-X-PART:", ""), ("EXT-X-PRELOAD-HINT", "")]),
    "D16 Multi-CDN": ("6", [("EXT-X-CONTENT-STEERING", "")]),
    "D17 Zapping": ("6", [("manifest_type=hls", ""), ("stream_selection_type", "")]),
    "D18 Telemetry Session": ("5", [("EXT-X-SESSION-DATA", ""), ("com.ape.session", "")]),
    "D19 Manifest Compression": ("4", [("EXT-X-DEFINE", "")]),
}


def open_text(path):
    if path.endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return open(path, "r", encoding="utf-8", errors="replace")


def audit(path, label):
    total_lines = 0
    channels = 0
    directives = collections.Counter()
    unique = set()
    with open_text(path) as fh:
        for line in fh:
            total_lines += 1
            s = line.strip()
            if not s:
                continue
            if s.startswith("#EXTINF"):
                channels += 1
            if s.startswith("#"):
                unique.add(s)
                name = s.split(":", 1)[0].split("=", 1)[0]
                directives[name] += 1
    dims = {}
    for name, (weight, checks) in DIMENSIONS.items():
        present = [check for check, _ in checks if any(check in u for u in unique)]
        score = round((len(present) / len(checks)) * 10, 2) if checks else 0
        dims[name] = {
            "weight": int(weight),
            "score": score,
            "present": len(present),
            "total": len(checks),
            "missing": [check for check, _ in checks if check not in present],
        }
    total_w = sum(d["weight"] for d in dims.values())
    final = round(sum(d["score"] * d["weight"] for d in dims.values()) / total_w, 2) if total_w else 0
    return {
        "file": label,
        "path": path,
        "lines": total_lines,
        "channels": channels,
        "unique_directives": len(unique),
        "top_directives": directives.most_common(20),
        "dimensions": dims,
        "weighted_score": final,
    }


def main():
    if len(sys.argv) < 2:
        print("usage: audit_omega_m3u8.py <list.m3u8|list.m3u8.gz> [label]", file=sys.stderr)
        return 2
    path = sys.argv[1]
    label = sys.argv[2] if len(sys.argv) > 2 else path
    result = audit(path, label)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
