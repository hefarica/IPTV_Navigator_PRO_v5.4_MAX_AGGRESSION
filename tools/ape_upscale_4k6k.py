#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""4K/6K reales desde 1080p: upscale, BT.709, HEVC Main10, CMAF/fMP4.

No hay resoluciones simuladas. Cada variante se mide con ffprobe antes de
renombrar los fMP4 a .bin para nginx.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

TIERS = [
    # id, width, height, level, codec string
    ("4k", 3840, 2160, "5.1", "hvc1.2.4.L153.B0"),
    ("6k", 5760, 3240, "6.1", "hvc1.2.4.L183.B0"),
]


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda: f.read(1024 * 1024), b""):
            h.update(b)
    return h.hexdigest()


def run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, text=True, capture_output=True, cwd=cwd, timeout=3600)


def probe(p: Path) -> dict:
    q = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(p)])
    if q.returncode != 0:
        raise RuntimeError(q.stderr[-1200:])
    d = json.loads(q.stdout)
    v = next(s for s in d["streams"] if s.get("codec_type") == "video")
    a = next((s for s in d["streams"] if s.get("codec_type") == "audio"), None)
    return {"duration": float(d.get("format", {}).get("duration") or 0),
            "video": {"codec": v.get("codec_name"), "profile": v.get("profile"), "level": v.get("level"),
                      "width": int(v.get("width") or 0), "height": int(v.get("height") or 0),
                      "pix_fmt": v.get("pix_fmt"), "fps": v.get("r_frame_rate"),
                      "color_primaries": v.get("color_primaries"), "color_transfer": v.get("color_transfer"),
                      "color_space": v.get("color_space"), "color_range": v.get("color_range")},
            "audio": None if not a else {"codec": a.get("codec_name"), "channels": int(a.get("channels") or 0),
                                         "sample_rate": int(a.get("sample_rate") or 0)}}


def encode(source: Path, root: Path, name: str) -> dict:
    root.mkdir(parents=True)
    tiers = []
    for tid, w, h, level, codec in TIERS:
        d = root / tid
        d.mkdir()
        vf = (f"zscale=primaries=bt709:transfer=bt709:matrix=bt709:range=limited,"
              f"scale={w}:{h}:flags=lanczos+accurate_rnd+full_chroma_int,"
              f"format=yuv420p10le")
        cmd = [
            "ffmpeg", "-hide_banner", "-y", "-i", str(source), "-t", "2",
            "-map", "0:v:0", "-map", "0:a?",
            "-vf", vf,
            "-c:v", "libx265", "-preset", "veryfast", "-crf", "22",
            "-profile:v", "main10", "-level", level, "-pix_fmt", "yuv420p10le",
            "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
            "-color_range", "tv", "-tag:v", "hvc1",
            "-x265-params", "log-level=error:keyint=50:min-keyint=25:scenecut=0",
            "-c:a", "copy", "-bsf:a", "aac_adtstoasc",
            "-f", "hls", "-hls_time", "1", "-hls_playlist_type", "vod",
            "-hls_flags", "independent_segments",
            "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4",
            "-hls_segment_filename", "seg_%03d.m4s", "index.m3u8",
        ]
        p = run(cmd, cwd=d)
        if p.returncode != 0:
            raise RuntimeError(f"{tid}: {p.stderr[-2000:]}")
        out = probe(d / "index.m3u8")
        v = out["video"]
        if v["width"] != w or v["height"] != h:
            raise RuntimeError(f"{tid}: salida {v['width']}x{v['height']} != {w}x{h}")
        if (v["color_primaries"], v["color_transfer"], v["color_space"]) != ("bt709", "bt709", "bt709"):
            raise RuntimeError(f"{tid}: CICP no BT.709: {v}")
        init = d / "init.mp4"
        init.rename(d / "init.bin")
        for s in sorted(d.glob("seg_*.m4s")):
            s.rename(s.with_suffix(".bin"))
        text = (d / "index.m3u8").read_text(encoding="utf-8")
        text = text.replace('URI="init.mp4"', 'URI="init.bin"').replace(".m4s", ".bin")
        (d / "index.m3u8").write_text(text, encoding="utf-8")
        seg = sorted(d.glob("seg_*.bin"))
        bitrate = max(int(sum(x.stat().st_size for x in seg) * 8 / max(out["duration"], 0.01)), 1)
        tiers.append({"id": tid, "width": w, "height": h, "codec": codec,
                      "probe": out, "bitrate": bitrate, "dir": str(d),
                      "init": str(d / "init.bin"), "init_sha256": sha256(d / "init.bin"),
                      "segments": [{"name": x.name, "bytes": x.stat().st_size, "sha256": sha256(x)} for x in seg]})
    lines = ["#EXTM3U", "#EXT-X-VERSION:7",
             "#EXT-X-APE-CMAF:CONTAINER=FMP4;MODE=TRANSCODE;TRANSCODE=1;APPLIED=1;PIXELS=PROCESSED",
             "#EXT-X-APE-CICP:REQUESTED=BT709/SDR;APPLIED=BT709/SDR;CONVERSION=1;PIXELS=PROCESSED"]
    for t in tiers:
        aud = "mp4a.40.2" if t["probe"]["audio"] and t["probe"]["audio"]["codec"] == "aac" else "none"
        lines += [
            f"#EXT-X-STREAM-INF:BANDWIDTH={t['bitrate']},RESOLUTION={t['width']}x{t['height']},"
            f"FRAME-RATE={t['probe']['video']['fps']},CODECS=\"{t['codec']},{aud}\",VIDEO-RANGE=SDR",
            f"{t['id']}/index.m3u8",
        ]
    (root / "master.m3u8").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {"name": name, "source": str(source), "tiers": tiers,
            "master": str(root / "master.m3u8"),
            "master_sha256": sha256(root / "master.m3u8")}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", default="REA")
    a = ap.parse_args()
    src = Path(a.source).resolve()
    out = Path(a.out).resolve()
    if out.exists():
        print("FAIL: output existe", file=sys.stderr)
        return 1
    try:
        if not src.is_file():
            raise RuntimeError("source no existe")
        srcp = probe(src)
        res = encode(src, out, a.name)
        receipt = {"schema": "ape.upscale.4k6k.receipt.v1", "result": "PASS",
                   "source": {"path": str(src), "sha256": sha256(src), "probe": srcp},
                   "applied": {"pixel_processing": True, "video_transcode": True,
                               "upscaling": True, "color_conversion": True,
                               "target": "4K/6K reales"},
                   "output": res}
        (out / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"result": "PASS", "master": res["master"],
                          "tiers": [{"id": t["id"], "res": f"{t['width']}x{t['height']}",
                                     "codec": t["codec"], "cicp": [t["probe"]["video"]["color_primaries"],
                                                                     t["probe"]["video"]["color_transfer"]],
                                     "bitrate": t["bitrate"]} for t in res["tiers"]]}, ensure_ascii=False))
        return 0
    except Exception as e:
        print(json.dumps({"result": "FAIL", "error": str(e)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
