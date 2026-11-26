#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Escalera HLS CMAF/fMP4 real 360/480/720/1080 con CICP BT.709/SDR.

Autorizacion del propietario: se procesan pixeles para escalar y convertir color.
No se declaran 4K/6K reales: solo targets SIMULATED.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

TIERS = [
    # id, width, height, profile, level, crf
    ("360", 640, 360, "main", "3.1", "22"),
    ("480", 854, 480, "main", "3.1", "22"),
    ("720", 1280, 720, "high", "3.1", "21"),
    ("1080", 1920, 1080, "high", "4.0", "20"),
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, text=True, capture_output=True, cwd=cwd, timeout=1800)


def probe(path: Path) -> dict:
    p = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)])
    if p.returncode != 0:
        raise RuntimeError(p.stderr[-1200:])
    d = json.loads(p.stdout)
    v = next(s for s in d["streams"] if s.get("codec_type") == "video")
    a = next((s for s in d["streams"] if s.get("codec_type") == "audio"), None)
    return {"format": d.get("format", {}).get("format_name"),
            "bit_rate": int(d.get("format", {}).get("bit_rate") or 0),
            "duration": float(d.get("format", {}).get("duration") or 0),
            "video": {"codec": v.get("codec_name"), "profile": v.get("profile"),
                      "level": v.get("level"), "width": int(v.get("width") or 0),
                      "height": int(v.get("height") or 0), "fps": v.get("r_frame_rate"),
                      "pix_fmt": v.get("pix_fmt"), "color_primaries": v.get("color_primaries"),
                      "color_transfer": v.get("color_transfer"), "color_space": v.get("color_space"),
                      "color_range": v.get("color_range")},
            "audio": None if not a else {"codec": a.get("codec_name"),
                                        "channels": int(a.get("channels") or 0),
                                        "sample_rate": int(a.get("sample_rate") or 0)}}


def codec_string(v: dict) -> str:
    level = int(v.get("level") or 40)
    if v.get("profile") == "Main":
        return f"avc1.4d40{level:02x}"
    if v.get("profile") == "Baseline":
        return f"avc1.42c0{level:02x}"
    return f"avc1.6400{level:02x}"


def encode_tier(source: Path, out: Path, name: str, tier: tuple) -> dict:
    tid, w, h, profile, level, crf = tier
    d = out / tid
    d.mkdir(parents=True)
    vf = (f"zscale=primaries=bt709:transfer=bt709:matrix=bt709:range=limited,"
          f"scale={w}:{h}:flags=lanczos:force_original_aspect_ratio=decrease,"
          f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p")
    cmd = [
        "ffmpeg", "-hide_banner", "-y", "-i", str(source),
        "-map", "0:v:0", "-map", "0:a?",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", crf,
        "-profile:v", profile, "-level", level, "-pix_fmt", "yuv420p",
        "-g", "50", "-keyint_min", "25", "-sc_threshold", "0",
        "-c:a", "copy", "-bsf:a", "aac_adtstoasc",
        "-f", "hls", "-hls_time", "2", "-hls_playlist_type", "vod",
        "-hls_flags", "independent_segments",
        "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4",
        "-hls_segment_filename", "seg_%03d.m4s", "index.m3u8",
    ]
    p = run(cmd, cwd=d)
    if p.returncode != 0:
        raise RuntimeError(f"{tid}: ffmpeg: {p.stderr[-1800:]}")
    result = probe(d / "index.m3u8")
    v = result["video"]
    if v["width"] != w or v["height"] != h:
        raise RuntimeError(f"{tid}: resolución {v['width']}x{v['height']} != {w}x{h}")
    if v["color_primaries"] != "bt709" or v["color_transfer"] != "bt709" or v["color_space"] != "bt709":
        raise RuntimeError(f"{tid}: CICP no es BT.709: {v}")
    init = d / "init.mp4"
    init.rename(d / "init.bin")
    for s in sorted(d.glob("seg_*.m4s")):
        s.rename(s.with_suffix(".bin"))
    media = (d / "index.m3u8").read_text(encoding="utf-8")
    media = media.replace('URI="init.mp4"', 'URI="init.bin"').replace(".m4s", ".bin")
    (d / "index.m3u8").write_text(media, encoding="utf-8")
    return {"id": tid, "dir": str(d), "probe": result, "command": cmd,
            "init": str(d / "init.bin"), "init_sha256": sha256(d / "init.bin"),
            "segments": [{"name": s.name, "bytes": s.stat().st_size, "sha256": sha256(s)}
                         for s in sorted(d.glob("seg_*.bin"))]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", default="REA")
    args = ap.parse_args()
    source = Path(args.source).resolve()
    out = Path(args.out).resolve()
    if out.exists():
        print(f"FAIL: {out} ya existe", file=sys.stderr)
        return 1
    try:
        if not source.is_file():
            raise RuntimeError("source no existe")
        src = probe(source)
        src["sha256"] = sha256(source)
        out.mkdir(parents=True)
        tiers = [encode_tier(source, out, args.name, t) for t in TIERS]
        # Master con variantes REALES 360-1080 y objetivos 4K/6K solo simulados.
        lines = ["#EXTM3U", "#EXT-X-VERSION:7",
                 "#EXT-X-APE-CMAF:CONTAINER=FMP4;MODE=TRANSCODE;TRANSCODE=1;APPLIED=1",
                 "#EXT-X-APE-CICP:REQUESTED=BT709/SDR;APPLIED=BT709/SDR;CONVERSION=1;PIXELS=PROCESSED",
                 "#EXT-X-APE-TARGET:RES=3840x2160;TARGET=4K;MODE=SIMULATED;EXECUTED=0",
                 "#EXT-X-APE-TARGET:RES=5760x3240;TARGET=6K;MODE=SIMULATED;EXECUTED=0"]
        for t in tiers:
            v = t["probe"]["video"]
            a = t["probe"]["audio"]
            aud = "mp4a.40.2" if a and a["codec"] == "aac" else (a["codec"] if a else "none")
            br = max(int(sum(x["bytes"] for x in t["segments"]) * 8 /
                          max(t["probe"].get("duration") or 1.0, 1.0)), 1)
            lines += [
                f"#EXT-X-STREAM-INF:BANDWIDTH={br},RESOLUTION={v['width']}x{v['height']},"
                f"FRAME-RATE={v['fps']},CODECS=\"{codec_string(v)},{aud}\",VIDEO-RANGE=SDR",
                f"{t['id']}/index.m3u8",
            ]
        (out / "master.m3u8").write_text("\n".join(lines) + "\n", encoding="utf-8")
        receipt = {
            "schema": "ape.cmaf.ladder.receipt.v1", "result": "PASS",
            "source": {"path": str(source), "sha256": src["sha256"], "probe": src},
            "applied": {"pixel_processing": True, "video_transcode": True,
                        "color_conversion": True, "scaling": True,
                        "tiers": [t["id"] for t in tiers],
                        "commands": [{"tier": t["id"], "command": t["command"]} for t in tiers]},
            "output": {"master": str(out / "master.m3u8"), "master_sha256": sha256(out / "master.m3u8"),
                       "tiers": tiers},
            "targets": {"4K": {"res": "3840x2160", "mode": "SIMULATED", "executed": 0},
                        "6K": {"res": "5760x3240", "mode": "SIMULATED", "executed": 0}},
        }
        (out / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"result": "PASS", "master": str(out / "master.m3u8"),
                          "tiers": [{"id": t["id"], "res": f"{t['probe']['video']['width']}x{t['probe']['video']['height']}",
                                     "cicp": [t["probe"]["video"]["color_primaries"], t["probe"]["video"]["color_transfer"]],
                                     "bytes": sum(x["bytes"] for x in t["segments"])} for t in tiers]},
                         ensure_ascii=False))
        return 0
    except Exception as e:
        print(json.dumps({"result": "FAIL", "error": str(e)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
