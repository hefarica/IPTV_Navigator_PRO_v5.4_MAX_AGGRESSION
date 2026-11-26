#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Remux CMAF/fMP4 sin tocar píxeles y manifiesto con tiers simulados.

- ffmpeg -c copy: no hay scale, no hay reencode de vídeo.
- La resolución real del master es la medida de la fuente.
- 360/480/720/2160/3240 se emiten SOLO como metadata SIMULATED.
- CICP real se mide; BT.709 solicitado se registra separado con CONVERSION=0.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(cmd: list[str], timeout: int = 1200, cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, text=True, capture_output=True, timeout=timeout, cwd=cwd)


def probe(path: Path) -> dict:
    p = run(["ffprobe", "-v", "error", "-print_format", "json",
             "-show_format", "-show_streams", str(path)])
    if p.returncode != 0:
        raise RuntimeError(p.stderr[-1000:])
    data = json.loads(p.stdout)
    video = next(s for s in data["streams"] if s.get("codec_type") == "video")
    audio = next((s for s in data["streams"] if s.get("codec_type") == "audio"), None)
    return {
        "format": data.get("format", {}).get("format_name"),
        "bit_rate": int(data.get("format", {}).get("bit_rate") or 0),
        "duration": float(data.get("format", {}).get("duration") or 0),
        "video": {
            "codec": video.get("codec_name"), "profile": video.get("profile"),
            "level": video.get("level"), "width": int(video.get("width") or 0),
            "height": int(video.get("height") or 0), "fps": video.get("r_frame_rate"),
            "pix_fmt": video.get("pix_fmt"),
            "color_primaries": video.get("color_primaries"),
            "color_transfer": video.get("color_transfer"),
            "color_space": video.get("color_space"),
            "color_range": video.get("color_range"),
        },
        "audio": None if not audio else {
            "codec": audio.get("codec_name"), "channels": int(audio.get("channels") or 0),
            "sample_rate": int(audio.get("sample_rate") or 0),
        },
    }


def codec_string(v: dict) -> str:
    # H.264 High, level 4.0 => avc1.640028. Se calcula del perfil/nivel medidos.
    profile = {"High": "64", "Main": "4d", "Baseline": "42"}.get(v.get("profile") or "", "64")
    level = int(v.get("level") or 40)
    return f"avc1.{profile}00{level:02x}"


def add_metadata(playlist: Path, source: dict, out: dict, master: Path, name: str) -> None:
    v = source["video"]
    a = source["audio"]
    aud = "mp4a.40.2" if a and a["codec"] == "aac" else (a["codec"] if a else "none")
    bitrate = max(source["bit_rate"], 1)
    cicp = f"{v['color_primaries']}/{v['color_transfer']}/{v['color_space']}/{v['color_range']}"
    lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        f"#EXT-X-APE-CMAF:CONTAINER=FMP4;MODE=REMUX;TRANSCODE=0;APPLIED=1;SOURCE={source['sha256']}",
        f"#EXT-X-APE-CICP:REQUESTED=BT709/SDR;APPLIED={cicp};CONVERSION=0;PIXELS=SOURCE",
        f"#EXT-X-APE-ACTUAL:RES={v['width']}x{v['height']};FPS={v['fps']};CODEC={v['codec']};AUDIO={aud}",
    ]
    for tier in [(640, 360, "360"), (854, 480, "480"), (1280, 720, "720"),
                 (3840, 2160, "2160"), (5760, 3240, "3240")]:
        lines.append(
            f"#EXT-X-APE-SIMULATED-TIER:ID={tier[2]};RES={tier[0]}x{tier[1]};"
            "MODE=SIMULATED;PIXELS=SOURCE;EXECUTED=0"
        )
    lines += [
        "#EXT-X-APE-TARGET:RES=3840x2160;TARGET=4K;MODE=SIMULATED;EXECUTED=0",
        "#EXT-X-APE-TARGET:RES=5760x3240;TARGET=6K;MODE=SIMULATED;EXECUTED=0",
        "#EXT-X-STREAM-INF:"
        f"BANDWIDTH={bitrate},RESOLUTION={v['width']}x{v['height']},"
        f"FRAME-RATE={v['fps']},CODECS=\"{codec_string(v)},{aud}\",VIDEO-RANGE=SDR",
        f"media/{playlist.name}",
    ]
    master.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Anota la media playlist sin cambiar segmentos ni píxeles.
    text = playlist.read_text(encoding="utf-8")
    extra = (
        f"#EXT-X-APE-CMAF:CONTAINER=FMP4;MODE=REMUX;TRANSCODE=0;APPLIED=1;SOURCE={source['sha256']}\n"
        f"#EXT-X-APE-CICP:REQUESTED=BT709/SDR;APPLIED={cicp};CONVERSION=0;PIXELS=SOURCE\n"
    )
    if "#EXT-X-APE-CMAF:" not in text:
        text = text.replace("#EXTM3U\n", "#EXTM3U\n" + extra, 1)
        playlist.write_text(text, encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", default="")
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
        media_dir = out / "media"
        media_dir.mkdir()
        playlist = media_dir / "index.m3u8"
        cmd = [
            "ffmpeg", "-hide_banner", "-y", "-i", str(source),
            "-map", "0:v:0", "-map", "0:a?",
            "-c", "copy", "-bsf:a", "aac_adtstoasc",
            "-f", "hls", "-hls_time", "2", "-hls_playlist_type", "vod",
            "-hls_segment_type", "fmp4",
            "-hls_fmp4_init_filename", "init.mp4",
            "-hls_segment_filename", "seg_%03d.m4s",
            "index.m3u8",
        ]
        p = run(cmd, cwd=media_dir)
        if p.returncode != 0:
            raise RuntimeError(p.stderr[-2000:])
        result = probe(playlist)
        if result["video"]["width"] != src["video"]["width"] or result["video"]["height"] != src["video"]["height"]:
            raise RuntimeError("la resolución cambió: no es remux puro")
        if result["video"]["fps"] != src["video"]["fps"]:
            raise RuntimeError("el fps cambió: no es remux puro")
        if result["video"]["codec"] != src["video"]["codec"]:
            raise RuntimeError("el códec cambió: no es remux puro")
        media_text = playlist.read_text(encoding="utf-8")
        if "#EXT-X-MAP:URI=\"init.mp4\"" not in media_text:
            raise RuntimeError("falta #EXT-X-MAP real")
        segments = sorted(media_dir.glob("seg_*.m4s"))
        if not segments:
            raise RuntimeError("no hay segmentos .m4s")
        # Verificado con ffprobe como fMP4 real. Para nginx, que bloquea
        # .mp4/.m4s, se renombra a .bin sin alterar un solo byte.
        init = media_dir / "init.mp4"
        init.rename(media_dir / "init.bin")
        for segment in segments:
            segment.rename(segment.with_suffix(".bin"))
        media_text = media_text.replace('URI="init.mp4"', 'URI="init.bin"').replace(".m4s", ".bin")
        playlist.write_text(media_text, encoding="utf-8")
        segments = sorted(media_dir.glob("seg_*.bin"))
        master = out / "master.m3u8"
        add_metadata(playlist, src, result, master, args.name or source.stem)
        receipt = {
            "schema": "ape.cmaf.remux.receipt.v1",
            "result": "PASS",
            "source": {"path": str(source), "sha256": src["sha256"], "probe": src},
            "applied": {"container": "CMAF/fMP4", "mode": "REMUX", "video_transcode": False,
                        "pixel_processing": False, "command": cmd},
            "output": {
                "master": str(master), "master_sha256": sha256(master),
                "media": str(playlist), "media_sha256": sha256(playlist),
                "init": str(media_dir / "init.bin"),
                "init_sha256": sha256(media_dir / "init.bin"),
                "segments": [{"name": s.name, "bytes": s.stat().st_size, "sha256": sha256(s)}
                             for s in segments],
                "probe": result,
            },
            "cicp": {"requested": "BT709/SDR", "applied": {
                "primaries": src["video"]["color_primaries"],
                "transfer": src["video"]["color_transfer"],
                "matrix": src["video"]["color_space"],
                "range": src["video"]["color_range"],
            }, "conversion": 0},
            "simulated_tiers": ["360x640", "480x854", "720x1280", "2160x3840", "3240x5760"],
            "actual_variants": [f"{src['video']['width']}x{src['video']['height']}"],
        }
        (out / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n",
                                         encoding="utf-8")
        print(json.dumps({"result": "PASS", "master": str(master), "receipt": str(out / "receipt.json"),
                          "actual": f"{src['video']['width']}x{src['video']['height']}",
                          "cicp": receipt["cicp"], "simulated": receipt["simulated_tiers"]},
                         ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"result": "FAIL", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
