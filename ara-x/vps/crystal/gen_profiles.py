#!/usr/bin/env python3
import json, os
from pathlib import Path

OUT = Path(__file__).resolve().parent / "profiles"
OUT.mkdir(parents=True, exist_ok=True)
for f in OUT.glob("crystal_*.json"):
    f.unlink()

outs = {
    "2k": ("2560x1440", "2k_upscaled", [10, 14, 18], 84),
    "4k": ("3840x2160", "4k_upscaled", [20, 25, 30], 82),
    "6k": ("5760x3240", "6k_presentation", [30, 40, 50], 74),
    "8k": ("7680x4320", "8k_presentation", [40, 55, 70], 70),
}

for tag, (out, pres, brs, thermal) in outs.items():
    for lvl, br, quality in (("lite", brs[0], "fast"), ("uhd", brs[1], "balanced"), ("max", brs[2], "quality")):
        w, h = out.split("x")
        presets = [
            "#EXT-X-APE-BUFFER-LEVEL:AGGRESSIVE",
            "#EXT-X-APE-BUFFER-MULTIPLIER:3",
            "#EXT-X-APE-BUFFER-CONNECTIONS:6",
            "#EXT-X-APE-BUFFER-STRATEGY:DUAL_TCP_PREFETCH",
            "#EXT-X-APE-QUALITY-LOCK:NATIVA_MAXIMA",
            "#EXT-X-APE-LCEVC-MODE:CLIENT-UPSCALING",
            "#EXT-X-APE-LCEVC-VERSION:PHASE4",
            f"#EXT-X-APE-LCEVC-TARGET:{out}",
            f"#EXTVLCOPT:zscale=width={w}:height={h}:filter=lanczos",
            "#EXTVLCOPT:dither=error_diffusion:chroma=1444",
            "#EXTVLCOPT:swscale-mode=9",
            "#EXT-X-ARA-NEVER-DROP:true",
            "#EXT-X-ARA-FPS-FALLBACK:30,24",
        ]
        obj = {
            "id": f"crystal_{tag}_{lvl}",
            "out": out,
            "buffer": "max",
            "quality": quality,
            "thermal_limit": thermal,
            "lcevc": "SYNTHETIC",
            "never_downscale": True,
            "min_res": "2560x1440",
            "presentation": pres,
            "degrade_order": ["fps", "processing"],
            "bitrate_mbps": br,
            "maxrate_mbps": int(br * 1.3),
            "bufsize": "64M",
            "lcevc_layer": ["detail_restore", "edge_enhance"],
            "lcevc_phase": 4,
            "presets": presets,
            "settings": {
                "display_size_forced": out,
                "user_preferred_refresh_rate": "60" if thermal >= 80 else "30",
                # Estas keys sólo existen en builds Amlogic con VPP/PQ; el catálogo del APK las descarta si no están.
                "db_id_pq_sharpness": "48" if quality == "quality" else ("40" if quality == "balanced" else "32"),
                "db_id_pq_noise": "18" if quality == "quality" else "24",
                "db_id_hdr_policy": "1",
            },
            "metadata": {
                "EXT-X-ARA-LCEVC": "SYNTHETIC",
                "EXT-X-ARA-LCEVC-LAYER": "enhance",
                "EXT-X-ARA-LCEVC-PHASE": "4",
                "EXT-X-ARA-PRESENTATION": pres,
                "EXT-X-ARA-NEVER-DOWNSCALE": "true",
                "EXT-X-ARA-MIN-RES": "2560x1440",
                "EXT-X-ARA-BUFFER": "max",
                "EXT-X-ARA-DEGRADE-ORDER": "fps,processing",
                "EXT-X-ARA-THERMAL-LIMIT": str(thermal),
            },
        }
        (OUT / f"{obj['id']}.json").write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")

files = sorted(OUT.glob("crystal_*.json"))
print(f"generados={len(files)}")
for f in files:
    print(f.name)
