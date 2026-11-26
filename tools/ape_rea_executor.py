#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""APE REA real: segmento -> filtro FFmpeg -> HLS 4K -> ffprobe -> recibo.

Fail-closed. Sin alternativas que finjan éxito. No baja fps, audio ni canales.
No procesa HDR: si la fuente declara PQ/HLG, aborta en vez de mentir.

Uso:
  python tools/ape_rea_executor.py --source segment.ts --out .tmp/rea-4k
  python tools/ape_rea_executor.py --source segment.ts --out .tmp/rea-4k --duration 2
  python tools/ape_rea_executor.py --source segment.ts --out .tmp/rea-4k --codec hevc
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

TARGET_W = 3840
TARGET_H = 2160
FILTERS = ",".join([
    "deblock=filter=weak:block=8:alpha=0.06:beta=0.035:gamma=0.035:delta=0.035",
    "hqdn3d=1.0:0.8:0.5:0.4",
    "format=yuv420p",
    "deband=1thr=0.005:2thr=0.005:3thr=0.005:range=12:blur=false",
    f"scale={TARGET_W}:{TARGET_H}:force_original_aspect_ratio=decrease:"
    "flags=lanczos+accurate_rnd+full_chroma_int",
    f"pad={TARGET_W}:{TARGET_H}:(ow-iw)/2:(oh-ih)/2:color=black",
    "setsar=1",
    "cas=strength=0.14:planes=1",
    "format=yuv420p",
])
BASE = {
    "schema": "ape.rea.executor.receipt.v1",
    "product": "APE_REA_EXECUTOR_REAL",
    "version": "1.0.0",
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(cmd: list[str], timeout: int = 1800) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, timeout=timeout, check=False)


def require_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"{name} no está en PATH")
    return path


def probe(path: Path) -> dict:
    p = run(["ffprobe", "-v", "error", "-print_format", "json",
             "-show_format", "-show_streams", str(path)])
    if p.returncode != 0:
        raise RuntimeError(f"ffprobe falló: {p.stderr.strip()[:500]}")
    data = json.loads(p.stdout)
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if not video:
        raise RuntimeError("la fuente no tiene pista de vídeo")
    return {
        "format": data.get("format", {}).get("format_name"),
        "duration": float(data.get("format", {}).get("duration") or 0),
        "video": {
            "codec": video.get("codec_name"),
            "profile": video.get("profile"),
            "level": video.get("level"),
            "width": int(video.get("width") or 0),
            "height": int(video.get("height") or 0),
            "pix_fmt": video.get("pix_fmt"),
            "fps": video.get("r_frame_rate"),
            "color_transfer": video.get("color_transfer"),
            "color_space": video.get("color_space"),
        },
        "audio": None if not audio else {
            "codec": audio.get("codec_name"),
            "channels": int(audio.get("channels") or 0),
            "sample_rate": int(audio.get("sample_rate") or 0),
        },
    }


def fps_value(text: str | None) -> float:
    if not text or "/" not in text:
        return 0.0
    try:
        a, b = text.split("/", 1)
        return float(a) / float(b) if float(b) else 0.0
    except Exception:
        return 0.0


def build_hls(source: Path, out: Path, duration: float | None, codec: str) -> tuple[Path, list[str]]:
    out.mkdir(parents=True, exist_ok=False)
    playlist = out / "index.m3u8"
    if codec == "hevc":
        vcodec = ["-c:v", "libx265", "-preset", "veryfast", "-crf", "22",
                  "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1"]
    else:
        vcodec = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                  "-profile:v", "high", "-level", "5.1", "-pix_fmt", "yuv420p"]
    cmd = ["ffmpeg", "-hide_banner", "-y", "-i", str(source)]
    if duration is not None:
        cmd += ["-t", str(duration)]
    cmd += ["-map", "0:v:0", "-map", "0:a?", "-vf", FILTERS]
    cmd += vcodec
    cmd += ["-c:a", "aac", "-b:a", "128k", "-f", "hls", "-hls_time", "1",
            "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
            "-hls_segment_filename", str(out / "seg_%03d.bin"), str(playlist)]
    p = run(cmd)
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg falló: {p.stderr.strip()[-1200:]}")
    text = playlist.read_text(encoding="utf-8")
    marker = ("#EXT-X-APE-EXECUTOR:REAL=1;"
              "FILTERS=deblock+hqdn3d+deband+lanczos+cas;"
              f"TARGET={TARGET_W}x{TARGET_H};EXECUTED=1")
    if marker not in text:
        lines = text.splitlines()
        text = "\n".join([lines[0], marker] + lines[1:]) + "\n"
        playlist.write_text(text, encoding="utf-8")
    return playlist, cmd


def main() -> int:
    parser = argparse.ArgumentParser(description="APE REA real FFmpeg executor")
    parser.add_argument("--source", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--duration", type=float, default=None)
    parser.add_argument("--codec", choices=["h264", "hevc"], default="h264")
    args = parser.parse_args()
    source = Path(args.source).resolve()
    out = Path(args.out).resolve()
    base = dict(BASE)
    base.update({"timestamp": datetime.now(timezone.utc).isoformat(),
                 "source_path": str(source), "output_dir": str(out)})
    try:
        require_tool("ffmpeg")
        require_tool("ffprobe")
        if not source.is_file():
            raise RuntimeError("source no existe")
        if out.exists():
            raise RuntimeError("output ya existe; usa otra ruta")
        src = probe(source)
        transfer = (src["video"].get("color_transfer") or "").lower()
        if transfer in ("smpte2084", "arib-std-b67", "dovi"):
            raise RuntimeError(f"fuente HDR ({transfer}); este ejecutor SDR no la procesa")
        src_sha = sha256_file(source)
        playlist, cmd = build_hls(source, out, args.duration, args.codec)
        segments = sorted(out.glob("seg_*.bin"))
        if not segments:
            raise RuntimeError("no se generaron segmentos")
        playlist_text = playlist.read_text(encoding="utf-8")
        if not playlist_text.startswith("#EXTM3U") or "#EXTINF:" not in playlist_text:
            raise RuntimeError("playlist HLS incompleta")
        # ffprobe no acepta una playlist con segmentos .bin; se mide el MPEG-TS real.
        outp = probe(segments[0])
        v = outp["video"]
        if v["width"] != TARGET_W or v["height"] != TARGET_H:
            raise RuntimeError(f"salida {v['width']}x{v['height']} != {TARGET_W}x{TARGET_H}")
        if abs(fps_value(v["fps"]) - fps_value(src["video"]["fps"])) > 0.01:
            raise RuntimeError(f"fps cambió: {src['video']['fps']} -> {v['fps']}")
        src_audio = src["audio"]
        out_audio = outp["audio"]
        if src_audio and (not out_audio or out_audio["channels"] != src_audio["channels"]):
            raise RuntimeError("se perdió audio o canales")
        seg_hashes = [{"name": s.name, "bytes": s.stat().st_size, "sha256": sha256_file(s)}
                      for s in segments]
        ffmpeg_path = Path(require_tool("ffmpeg"))
        receipt = {
            **base,
            "requested": {"target": f"{TARGET_W}x{TARGET_H}", "filtergraph": FILTERS,
                          "codec": args.codec, "duration": args.duration,
                          "fps_policy": "preserve"},
            "applied": {"status": "APPLIED_MEASURED", "engine": "ffmpeg",
                        "engine_path": str(ffmpeg_path),
                        "engine_sha256": sha256_file(ffmpeg_path),
                        "command": cmd, "frames_written": True},
            "output": {"playlist": str(playlist),
                       "playlist_sha256": sha256_file(playlist),
                       "video": v, "audio": out_audio, "segments": seg_hashes},
            "source": {"sha256": src_sha, "probe": src},
            "result": "PASS",
        }
        receipt_path = out / "receipt.json"
        receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n",
                                encoding="utf-8")
        print(json.dumps({"result": "PASS", "receipt": str(receipt_path),
                          "playlist": str(playlist),
                          "output": {"width": v["width"], "height": v["height"],
                                     "codec": v["codec"], "fps": v["fps"],
                                     "audio": out_audio}}, ensure_ascii=False))
        return 0
    except Exception as exc:
        receipt = {**base, "result": "FAIL", "error": str(exc)}
        try:
            out.mkdir(parents=True, exist_ok=True)
            (out / "receipt.json").write_text(
                json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        except Exception:
            pass
        print(json.dumps(receipt, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
