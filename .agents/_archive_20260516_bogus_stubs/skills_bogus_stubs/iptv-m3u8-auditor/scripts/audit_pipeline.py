import re, collections

path = "/home/ubuntu/upload/APE_TYPED_ARRAYS_ULTIMATE_20260407(1).m3u8"
with open(path, 'r', errors='replace') as f:
    content = f.read()
    lines = content.split('\n')

total_lines = len(lines)
total_channels = content.count('#EXTINF')

# Contar directivas únicas
directive_counts = collections.Counter()
for line in lines:
    line = line.strip()
    if not line or not line.startswith('#'):
        continue
    m = re.match(r'^(#[A-Z0-9_X-]+(?:\.[A-Z0-9_.]+)*)', line)
    if m:
        directive_counts[m.group(1)] += 1

# 14 GAPS CRYSTAL UHD
gaps = {
    "GAP 1 — Dynamic Range Classifier": {
        "checks": [
            ("colorspace=all=auto", "Auto-detect SDR/HDR/HLG"),
            ("tonemap=mobius", "Tone mapping adaptativo"),
            ("trc=auto", "Transfer curve auto-detect"),
            ("zscale=transfer=st2084", "Conversion HDR (parcial)"),
        ], "weight": 8
    },
    "GAP 2 — Space Validator": {
        "checks": [
            ("format=yuv444p", "4:4:4 color subsampling"),
            ("range=limited", "Color range fallback"),
            ("chromal=topleft", "Chroma siting consistency"),
            ("deband", "Gamut banding control"),
        ], "weight": 7
    },
    "GAP 3 — Bitrate Anarchy Protocol": {
        "checks": [
            ("ANTI-CUT-ISP-STRANGLE", "ISP throttle adaptive"),
            ("bandwidth_ramp=true", "Bandwidth ramp activo"),
            ("bandwidth_ramp_peak=100000000", "Peak 100Mbps"),
            ("OMEGA-ENGINE-BANDWIDTH-MONITOR", "Monitor BW real-time"),
        ], "weight": 9
    },
    "GAP 4 — Hardware Agent Spoofing": {
        "checks": [
            ("X-Device-Class", "Device class header"),
            ("X-Decoding-Capability", "Decoding capability header"),
            ("SHIELD-TV-PRO", "Shield TV Pro spoof"),
            ("AppleTV14,1", "Apple TV 4K spoof"),
        ], "weight": 7
    },
    "GAP 5 — Quantum Pixel Overdrive": {
        "checks": [
            ("yuv444p10le", "10-bit 4:4:4 real"),
            ("yuv444p", "4:4:4 subsampling"),
            ("saturation", "Saturacion expandida"),
            ("QUANTUM-PIXEL", "Quantum Pixel directiva"),
        ], "weight": 7
    },
    "GAP 6 — Luma Precision Engine": {
        "checks": [
            ("unsharp=luma", "Luma sharpening"),
            ("hqdn3d", "3D denoise temporal"),
            ("nlmeans", "Non-local means denoise"),
            ("LUMA-GAMMA", "Gamma curve control"),
        ], "weight": 8
    },
    "GAP 7 — Network Buffer God Tier": {
        "checks": [
            ("network-caching", "Network cache VLC"),
            ("BUFFER-STRATEGY:ADAPTIVE_PREDICTIVE_NEURAL", "Buffer neural predictivo"),
            ("BUFFER-PRELOAD-SEGMENTS:30", "30 segmentos preload"),
            ("BUFFER-DYNAMIC-ADJUSTMENT:ENABLED", "Ajuste dinamico buffer"),
        ], "weight": 9
    },
    "GAP 8 — Codec Priority Enforcer": {
        "checks": [
            ("preferred_codec=hevc", "HEVC preferido"),
            ("video_codec_override=hevc", "Override codec HEVC"),
            ("AV1-FALLBACK-CHAIN", "Cadena fallback AV1"),
            ("CODEC-PRIORITY", "Priority enforcer directiva"),
        ], "weight": 8
    },
    "GAP 9 — fMP4/CMAF Pipeline": {
        "checks": [
            ("TRANSPORT-PROTOCOL:CMAF_UNIVERSAL", "CMAF universal transport"),
            ("TRANSPORT-CHUNK-SIZE:200MS", "Chunks 200ms"),
            ("TRANSPORT-FALLBACK-1:HLS_FMP4", "Fallback HLS fMP4"),
            ("EXT-X-SERVER-CONTROL", "LL-HLS server control"),
        ], "weight": 8
    },
    "GAP 10 — VRR/Refresh Sync": {
        "checks": [
            ("vrr_sync", "VRR sync KODIPROP"),
            ("tunneling_enabled=true", "ExoPlayer tunneled mode"),
            ("CORTEX-CONSTANT-FRAME-RATE", "CFR lock"),
            ("CORTEX-OPTICAL-FLOW-MINTERPOLATE", "120fps interpolation"),
        ], "weight": 7
    },
    "GAP 11 — DLSS/AI Reconstruction": {
        "checks": [
            ("CORTEX-AI-SUPER-RESOLUTION", "AI Super Resolution"),
            ("CORTEX-AI-SPATIAL-DENOISE", "AI Spatial Denoise"),
            ("CORTEX-LCEVC", "LCEVC Phase 3/4"),
            ("CORTEX-TEMPORAL-ARTIFACT-REPAIR", "Temporal artifact repair"),
        ], "weight": 9
    },
    "GAP 12 — Audio Pipeline Real": {
        "checks": [
            ("dolby_atmos", "Atmos KODIPROP"),
            ("audio_passthrough", "Audio passthrough"),
            ("AUDIO-FALLBACK", "Audio fallback chain"),
            ("earc", "eARC routing"),
        ], "weight": 7
    },
    "GAP 13 — DRM/License Wrapping": {
        "checks": [
            ("drm_widevine", "Widevine DRM"),
            ("EXT-X-KEY", "HLS encryption key"),
            ("DRM-FAIRPLAY", "FairPlay DRM"),
            ("PSSH", "PSSH box"),
        ], "weight": 6
    },
    "GAP 14 — Checklist Auditoria Automatica": {
        "checks": [
            ("TELEMETRY-TVQM", "TVQM telemetry VMAF/PSNR"),
            ("TELEMETRY-TR101290", "TR 101 290 monitoring"),
            ("IMPAIRMENT-GUARD", "Impairment guard"),
            ("AUDIT-", "Audit directives"),
        ], "weight": 8
    },
}

print("=" * 75)
print("  AUDITORIA PROFUNDA — APE_TYPED_ARRAYS_ULTIMATE_20260407(1).m3u8")
print(f"  Canales: {total_channels:,} | Lineas: {total_lines:,} | Directivas unicas: {len(directive_counts)}")
print("=" * 75)

gap_scores = {}
for gap_name, gap_data in gaps.items():
    checks = gap_data["checks"]
    weight = gap_data["weight"]
    present = sum(1 for k, _ in checks if k in content)
    score = (present / len(checks)) * 10
    gap_scores[gap_name] = {"score": score, "present": present, "total": len(checks), "weight": weight}
    status = "OK" if present == len(checks) else ("PARCIAL" if present > 0 else "FALTA")
    print(f"\n[{status}] {gap_name}")
    for directive, desc in checks:
        found = directive in content
        icon = "  [SI]" if found else "  [NO]"
        print(f"{icon} {directive:<45} {desc}")
    print(f"     SCORE: {score:.1f}/10  ({present}/{len(checks)} presentes)")

total_weight = sum(v["weight"] for v in gap_scores.values())
weighted_score = sum(v["score"] * v["weight"] for v in gap_scores.values()) / total_weight

print(f"\n{'=' * 75}")
print(f"  SCORE FINAL PONDERADO: {weighted_score:.2f}/10.0")
print(f"{'=' * 75}")

# Guardar resultados para el scorecard
import json
results = {
    "file": "APE_TYPED_ARRAYS_ULTIMATE_20260407(1).m3u8",
    "total_lines": total_lines,
    "total_channels": total_channels,
    "total_unique_directives": len(directive_counts),
    "weighted_score": round(weighted_score, 2),
    "gap_scores": {k: v for k, v in gap_scores.items()},
    "directive_counts": dict(directive_counts.most_common(50))
}
with open('/home/ubuntu/audit/audit_results_20260407_v2.json', 'w') as f:
    json.dump(results, f, indent=2)
print("\nResultados guardados en audit_results_20260407_v2.json")
